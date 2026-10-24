// Encore Live background thread: finds the songs in a set, then masters them.
//
// Mastering a live set is different from mastering one song: every song gets
// the SAME settings (learned once on the set's loudest song), so the quiet
// acoustic one stays quieter than the loud closer, like it was in the room.
// Mastering each song on its own would push them all to the same loudness
// and flatten the show.
//
// Messages in:
//   init     { wasm }
//   analyse  { source }                       -> progress, analysed (+ smart leveler track)
//   prepare  { source, song, settings, rumble } -> prepared { learned, lufs }
//   song     { id, source, song, settings, learned, rumble, even, refLufs } -> song { l, r, lufs, origLufs, peakDb }
//   show     { id, source, pieces, settings, learned, rumble, bits, meta, art } -> show { blob }
// song = { start, end, fadeIn, fadeOut } in seconds.
import { loadMaster, integratedLufs } from "./master-core.js";
import { LiveAnalyzer } from "./live-analysis.js";
import { sourceFromDescription } from "./live-source.js";
import { pcmEncoder, wavFromParts } from "./tags.js";
import { SmartLeveler } from "./live-recorder.js";

let M = null;
let bufferCache = null;
const PREROLL = 3; // seconds fed to the master before a song starts, so its compressor is settled

// Gentle 30 Hz high-pass: stage rumble, mic stand thumps, HVAC
function rumbleFilter(fs) {
  const w = 2 * Math.PI * 30 / fs, al = Math.sin(w) / (2 * 0.7071), c = Math.cos(w), a0 = 1 + al;
  const k = [(1 + c) / 2 / a0, -(1 + c) / a0, (1 + c) / 2 / a0, -2 * c / a0, (1 - al) / a0];
  const st = [[0, 0], [0, 0]];
  return (l, r) => {
    for (const [ch, x] of [[0, l], [1, r]]) {
      let [z1, z2] = st[ch];
      for (let i = 0; i < x.length; i++) { const v = x[i], y = k[0] * v + z1; z1 = k[1] * v - k[3] * y + z2; z2 = k[2] * v - k[4] * y; x[i] = y; }
      st[ch] = [z1, z2];
    }
  };
}

async function readRange(src, a, b, rumble) {
  const fs = src.fs, from = Math.max(0, Math.round(a * fs)), to = Math.min(src.frames, Math.round(b * fs));
  const { l, r } = await src.read(from, Math.max(0, to - from));
  if (rumble) rumbleFilter(fs)(l, r);
  return { l, r, from };
}

function fades(l, r, fs, fadeIn, fadeOut) {
  const fi = Math.min(l.length, Math.round((fadeIn || 0) * fs)), fo = Math.min(l.length, Math.round((fadeOut || 0) * fs));
  for (let i = 0; i < fi; i++) { const g = Math.sin((i / fi) * Math.PI / 2) ** 2; l[i] *= g; r[i] *= g; }
  for (let i = 0; i < fo; i++) { const g = Math.sin((i / fo) * Math.PI / 2) ** 2, j = l.length - 1 - i; l[j] *= g; r[j] *= g; }
}

const peakDb = (l, r) => { let p = 0; for (let i = 0; i < l.length; i++) p = Math.max(p, Math.abs(l[i]), Math.abs(r[i])); return 20 * Math.log10(p + 1e-12); };

// Master one song with the set's settings (pre-roll settles the dynamics).
// even (0..1) closes that much of the loudness gap to the loudest song
// (refLufs): 0 = exactly as played, 1 = every song equally loud.
async function masterSong(src, song, settings, learned, rumble, even = 0, refLufs = null) {
  const pre = Math.min(PREROLL, song.start);
  const { l, r } = await readRange(src, song.start - pre, song.end, rumble);
  const cut = Math.round(pre * src.fs);
  const origLufs = integratedLufs(l.subarray(cut), r.subarray(cut), src.fs); // so the original can play at the same loudness
  let [ol, or] = M.renderOffline(l, r, src.fs, settings, learned);
  if (even > 0 && refLufs !== null) {
    const lufs = integratedLufs(ol.subarray(cut), or.subarray(cut), src.fs), lift = (refLufs - lufs) * even;
    if (Math.abs(lift) > 0.3) {
      const tuned = learned.slice(); tuned[2] = Math.max(-6, Math.min(24, tuned[2] + lift));
      [ol, or] = M.renderOffline(l, r, src.fs, settings, tuned);
    }
  }
  const L = ol.slice(cut), R = or.slice(cut);
  fades(L, R, src.fs, song.fadeIn, song.fadeOut);
  return { l: L, r: R, origLufs };
}

self.onmessage = async (e) => {
  const d = e.data;
  try {
    if (d.type === "init") { M = await loadMaster(d.wasm); self.postMessage({ type: "ready" }); return; }
    // decoded (compressed) sets are sent once, then referred to
    if (d.source?.kind === "buffer") bufferCache = d.source;
    const desc = d.source?.kind === "bufferRef" ? { ...bufferCache, gainTrack: d.source.gainTrack } : d.source;
    const src = desc ? sourceFromDescription(desc) : null;

    if (d.type === "analyse") {
      const fs = src.fs, a = new LiveAnalyzer(fs), lev = new SmartLeveler(fs), chunk = fs * 10, COLS = 4000;
      const per = Math.max(1, Math.ceil(src.frames / COLS)), peaks = new Float32Array(COLS), rms = new Float64Array(COLS), cnt = new Uint32Array(COLS);
      for (let pos = 0; pos < src.frames; pos += chunk) {
        const { l, r } = await src.read(pos, chunk);
        a.push(l, r); lev.push(l, r);
        for (let i = 0; i < l.length; i += 4) {
          const c = Math.floor((pos + i) / per), m = Math.max(Math.abs(l[i]), Math.abs(r[i]));
          if (m > peaks[c]) peaks[c] = m;
          rms[c] += 0.5 * (l[i] * l[i] + r[i] * r[i]); cnt[c]++;
        }
        self.postMessage({ type: "progress", id: d.id, phase: "analyse", pct: Math.min(100, Math.round(((pos + chunk) / src.frames) * 100)) });
      }
      const result = a.finish();
      const level = Float32Array.from(rms, (v, c) => (cnt[c] ? Math.sqrt(v / cnt[c]) : 0));
      self.postMessage({ type: "analysed", id: d.id, result, levelerDb: Float32Array.from(lev.track), overview: { cols: COLS, secondsPerCol: per / fs, peaks, level } });
      return;
    }

    if (d.type === "prepare") {
      // Learn on the loudest song, then set the drive so THAT song lands on
      // the target. Every other song uses the same settings.
      const { l, r } = await readRange(src, d.song.start, d.song.end, d.rumble);
      self.postMessage({ type: "progress", id: d.id, phase: "prepare", text: "Listening to the loudest song..." });
      const learned = M.learnOffline(l, r, src.fs, d.settings);
      const res = M.renderToTarget(l, r, src.fs, d.settings, learned,
        (pass) => self.postMessage({ type: "progress", id: d.id, phase: "prepare", text: pass ? "Fine-tuning the loudness..." : "Setting the loudness..." }));
      self.postMessage({ type: "prepared", id: d.id, learned: res.learned, lufs: res.lufs });
      return;
    }

    if (d.type === "song") {
      const { l, r, origLufs } = await masterSong(src, d.song, d.settings, d.learned, d.rumble, d.even ?? 0, d.refLufs ?? null);
      self.postMessage({ type: "song", id: d.id, l, r, fs: src.fs, lufs: integratedLufs(l, r, src.fs), origLufs, peakDb: peakDb(l, r) }, [l.buffer, r.buffer]);
      return;
    }

    if (d.type === "raw") { // original (routed + leveled) audio for a range, for listening
      const { l, r } = await readRange(src, d.start, d.end, false);
      self.postMessage({ type: "raw", id: d.id, l, r, fs: src.fs }, [l.buffer, r.buffer]);
      return;
    }

    if (d.type === "show") {
      // The whole show as one continuous file, with cut stretches removed and
      // short crossfades over each join. Streamed, so a 2 hour show is fine.
      const fs = src.fs, X = Math.round(fs * (d.xfade ?? 1.0)), rt = M.createRealtime(fs);
      rt.settings(d.settings); rt.lockLearned(d.learned);
      const encode = pcmEncoder(d.bits ?? 24), parts = [];
      const filt = d.rumble ? rumbleFilter(fs) : null;
      let skip = rt.latency, carry = null;
      const bl = new Float32Array(128), br = new Float32Array(128);
      const total = d.pieces.reduce((a, p) => a + (p.end - p.start), 0);
      let doneSec = 0, outFrames = 0;
      const emit = (l, r) => { // through the master, 128 samples at a time
        const oL = new Float32Array(l.length), oR = new Float32Array(l.length);
        let o = 0;
        for (let i = 0; i < l.length; i += 128) {
          const n = Math.min(128, l.length - i);
          const a = n === 128 ? bl : new Float32Array(n), b = n === 128 ? br : new Float32Array(n);
          a.set(l.subarray(i, i + n)); b.set(r.subarray(i, i + n));
          rt.process(a, b);
          let k = 0;
          if (skip) { k = Math.min(n, skip); skip -= k; }
          for (; k < n; k++) { oL[o] = a[k]; oR[o] = b[k]; o++; }
        }
        if (o) { parts.push(encode(oL.subarray(0, o), oR.subarray(0, o))); outFrames += o; }
      };
      // short pre-roll from just before the first piece, so the master is settled
      const p0 = d.pieces[0], pre = Math.min(PREROLL, p0.start);
      if (pre > 0) { const { l, r } = await readRange(src, p0.start - pre, p0.start, false); filt?.(l, r); for (let i = 0; i < l.length; i += 128) { const n = Math.min(128, l.length - i); const a = l.slice(i, i + n), b = r.slice(i, i + n); rt.process(a, b); } }
      for (let k = 0; k < d.pieces.length; k++) {
        const p = d.pieces[k], last = k === d.pieces.length - 1, step = fs * 5;
        const a0 = Math.round(p.start * fs), a1 = Math.round(p.end * fs);
        for (let pos = a0; pos < a1; pos += step) {
          const n = Math.min(step, a1 - pos), { l, r } = await src.read(pos, n);
          filt?.(l, r);
          if (k === 0 && pos === a0) fades(l, r, fs, 0.5, 0);
          if (carry && pos === a0) { // crossfade the previous piece's tail into this one
            const m = Math.min(carry.l.length, l.length);
            for (let i = 0; i < m; i++) { const t = (i + 0.5) / m, gi = Math.sin(t * Math.PI / 2), go = Math.cos(t * Math.PI / 2); l[i] = l[i] * gi + carry.l[i] * go; r[i] = r[i] * gi + carry.r[i] * go; }
            carry = null;
          }
          const isEnd = pos + n >= a1;
          if (isEnd && !last && X > 0 && l.length > X) { // hold back the tail for the next join
            carry = { l: l.slice(l.length - X), r: r.slice(r.length - X) };
            emit(l.subarray(0, l.length - X), r.subarray(0, r.length - X));
          } else {
            if (isEnd && last) fades(l, r, fs, 0, 2);
            emit(l, r);
          }
          doneSec += n / fs;
          self.postMessage({ type: "progress", id: d.id, phase: "show", pct: Math.round((doneSec / total) * 100) });
        }
      }
      emit(new Float32Array(rt.latency), new Float32Array(rt.latency)); // flush what's inside the master
      const blob = wavFromParts(parts, fs, d.bits ?? 24, d.meta ?? {}, d.art ?? null);
      self.postMessage({ type: "show", id: d.id, blob, seconds: outFrames / fs });
      return;
    }
  } catch (err) {
    self.postMessage({ type: "error", id: d.id, message: err?.message ?? String(err) });
  }
};
