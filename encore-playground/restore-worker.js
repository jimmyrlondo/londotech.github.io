// Encore Restore background thread: analysis, previews, the full restore and
// export, all a chunk at a time so a 25-minute side at 96 kHz never freezes
// the page or fills the memory. The original file is only ever read.
//
// Messages in (each with an id; replies carry it back):
//   analyse  { source, sourceType }            -> progress, analysed { report }
//   learn    { source, start, end, hum }        -> learned { noise }
//   preview  { source, start, end, settings, removed } -> preview { l, r, rl, rr, outStart }
//   process  { source, settings }               -> progress, processed { blob, frames, ... }
//   export   { restored, tracks, meta, zip, bits } -> progress, exported { files | zipBlob }
//   cancel   {}                                  stops a running process
// source: a description from restore-io.js describe(); settings: restore-core.js defaultSettings() shape.
import { Analyzer, detectHum, detectTuning, detectWow, detectDropouts, findTracks, quietSpots, noiseProfile, measureChannels, countClicks, recommend } from "./restore-analysis.js";
import { buildChain, LufsMeter, speedCents, join } from "./restore-core.js";
import { fromDescription, F32Reader, interleave } from "./restore-io.js";
import { pcmEncoder, wavFromParts, fileName } from "./tags.js";
import { zip } from "./zip.js";

const CHUNK = 1 << 17;          // frames read at a time
let cancelled = 0;

const post = (msg, transfer) => self.postMessage(msg, transfer || []);
const progress = (id, phase, pct, text) => post({ type: "progress", id, phase, pct, text });

async function analyse(id, source, sourceType) {
  const src = fromDescription(source), fs = src.fs, frames = src.frames;
  const a = new Analyzer(fs, frames);
  const t0 = Date.now();
  for (let pos = 0; pos < frames; pos += CHUNK) {
    const { l, r } = await src.read(pos, Math.min(CHUNK, frames - pos));
    a.push(l, r);
    progress(id, "analyse", Math.round(60 * (pos + CHUNK) / frames), "Listening through the whole recording...");
  }
  const base = a.finish();
  progress(id, "analyse", 62, "Looking for hum...");
  const hum = detectHum(base.decL, base.decR, base.fsd);
  progress(id, "analyse", 66, "Learning the background noise...");
  const noise = await learnFrom(src, quietSpots(base.hopEnergy, base.hop, base.N), base.N, hum);
  if (noise) noise.from = "(the quietest stretches, like the lead-in and the gaps between songs)";
  progress(id, "analyse", 70, "Checking the speed against A440...");
  const tuning = detectTuning(base.mid, base.fsd);
  progress(id, "analyse", 76, "Measuring wow...");
  const wow = detectWow(base.mid, base.fsd);
  progress(id, "analyse", 84, "Finding the songs...");
  const tracks = findTracks(base.mid, base.fsd);
  const dropouts = detectDropouts(base.decL, base.decR, base.fsd, noise ? { profile: noise.profile, N: base.N, fs } : null);
  // windows spread across the file, from the loud parts for the channel checks
  progress(id, "analyse", 88, "Counting clicks and comparing the channels...");
  const seconds = frames / fs, nWin = Math.max(1, Math.min(40, Math.floor(seconds / 3))), winLen = Math.min(frames, Math.round(1.5 * fs));
  const wins = [];
  for (let k = 0; k < nWin; k++) {
    const at = Math.max(0, Math.round((k + 0.5) / nWin * frames - winLen / 2));
    const { l, r } = await src.read(at, winLen);
    wins.push({ l, r, at });
  }
  const loud = wins.slice().sort((x, y) => energy(y) - energy(x)).slice(0, Math.max(3, Math.ceil(wins.length / 2)));
  const channels = measureChannels(loud.map((w) => ({ l: w.l.subarray(0, Math.min(w.l.length, fs >> 1)), r: w.r.subarray(0, Math.min(w.r.length, fs >> 1)) })), fs);
  const clicks = countClicks(wins, fs, sourceType === "78" ? { clicks: 65, crackle: 60 } : { clicks: 50, crackle: 40 });
  progress(id, "analyse", 98, "Putting it together...");
  // the music's level: the loud end of the per-hop energies
  const he = Array.from(base.hopEnergy).filter((v) => v > 1e-12).sort((x, y) => x - y);
  const musicDb = he.length ? 10 * Math.log10(he[Math.floor(he.length * 0.9)]) : null;
  const report = { fs, frames, seconds, channelsInFile: src.channels, peakDb: base.peakDb, dc: base.dc, clipping: base.clipping, clipSamples: base.clipSamples,
    hum, noise, musicDb, tuning, wow, tracks, dropouts, channels, clicks };
  const rec = recommend(report, sourceType);
  // what goes back to the page (no big analysis copies)
  const out = {
    fs, frames, seconds, channelsInFile: src.channels, peakDb: base.peakDb, dc: base.dc, clipping: base.clipping, musicDb,
    overview: base.overview, hum, noise: noise && { profile: noise.profile, rmsDb: noise.rmsDb, frames: noise.frames, N: base.N },
    tuning: { ...tuning, hist: undefined }, wow, tracks, dropouts, channels, clicks: { ...clicks, positions: clicks.positions.slice(0, 5000) },
    settings: rec.settings, findings: rec.findings, ms: Date.now() - t0,
  };
  post({ type: "analysed", id, report: out });
}
const energy = (w) => { let e = 0; for (let i = 0; i < w.l.length; i += 8) e += w.l[i] * w.l[i] + w.r[i] * w.r[i]; return e; };

async function learnFrom(src, spots, N, hum) {
  const frames = [];
  for (const at of spots) {
    if (at + N > src.frames) continue;
    const { l, r } = await src.read(at, N);
    frames.push({ l, r });
    if (frames.length >= 300) break;
  }
  return frames.length ? noiseProfile(frames, src.fs, { hum }) : null;
}

// Learn the noise from a stretch the user picked (just noise, no music)
async function learn(id, source, start, end, hum, N) {
  const src = fromDescription(source), fs = src.fs, a = Math.round(start * fs), b = Math.round(end * fs);
  const spots = [];
  for (let at = a; at + N <= b; at += N >> 2) spots.push(at);
  const noise = await learnFrom(src, spots, N, hum);
  if (noise) noise.from = "(the stretch you picked)";
  post({ type: "learned", id, noise: noise && { profile: noise.profile, rmsDb: noise.rmsDb, frames: noise.frames, N } });
}

// A stretch, restored, plus (optionally) what one module or all the clean-up took out.
// removed: null | "all" | "declick" | "dehum" | "denoise"
async function preview(id, source, start, end, settings, removed) {
  const src = fromDescription(source), fs = src.fs, pre = 1.0;   // a second before, so filters and noise reduction are settled
  const a = Math.max(0, Math.round((start - pre) * fs)), b = Math.min(src.frames, Math.round(end * fs));
  const { l, r } = await src.read(a, b - a);
  const run = (opts) => { const c = buildChain(fs, settings, { ...opts, offset: a }); const L = [], R = []; for (let i = 0; i < l.length; i += CHUNK) { const [x, y] = c.push(l.subarray(i, i + CHUNK), r.subarray(i, i + CHUNK)); L.push(x); R.push(y); } const [x, y] = c.flush(); L.push(x); R.push(y); return { L: join(L), R: join(R), clicks: c.clicks }; };
  const keep = !!removed;
  const res = run({ keepDelays: keep });
  let rl = null, rr = null;
  if (removed) {
    const off = removed === "all" ? ["declick", "dehum", "denoise"] : [removed];
    const ref = run({ keepDelays: true, off });
    const n = Math.min(ref.L.length, res.L.length);
    rl = new Float32Array(n); rr = new Float32Array(n);
    for (let i = 0; i < n; i++) { rl[i] = ref.L[i] - res.L[i]; rr[i] = ref.R[i] - res.R[i]; }
  }
  // drop the settling second (in the restored timeline, which may run at a different speed)
  const ratio = Math.pow(2, speedCents(settings) / 1200), cut = Math.min(res.L.length, Math.round((start * fs - a) / ratio));
  const trim = (x) => (x ? x.slice(cut) : null);
  const clicks = res.clicks.filter((e) => e.ch === 0 && a + e.at >= start * fs).map((e) => (a + e.at) / fs);
  const out = { l: trim(res.L), r: trim(res.R), rl: trim(rl), rr: trim(rr) };
  post({ type: "preview", id, fs, outStart: (a / fs) / ratio + cut / fs, clicks, ...out }, [out.l.buffer, out.r.buffer, ...(out.rl ? [out.rl.buffer, out.rr.buffer] : [])]);
}

// The whole recording, restored, into a Blob of floats
async function processAll(id, source, settings) {
  const my = cancelled;
  const src = fromDescription(source), fs = src.fs, frames = src.frames;
  const chain = buildChain(fs, settings);
  const parts = [], mIn = new LufsMeter(fs), mOut = new LufsMeter(fs);
  const cols = 3000, ratio = Math.pow(2, speedCents(settings) / 1200), outFramesGuess = Math.ceil(frames / ratio) + 1024;
  const per = Math.max(1, Math.ceil(outFramesGuess / cols)), peakL = new Float32Array(cols), peakR = new Float32Array(cols), rms = new Float64Array(cols), cnt = new Uint32Array(cols);
  let written = 0, peak = 0;
  const t0 = Date.now();
  const take = (L, R) => {
    for (let i = 0; i < L.length; i++) {
      const c = Math.min(cols - 1, Math.floor((written + i) / per)), x = L[i], y = R[i], ax = Math.abs(x), ay = Math.abs(y);
      if (ax > peakL[c]) peakL[c] = ax;
      if (ay > peakR[c]) peakR[c] = ay;
      rms[c] += 0.5 * (x * x + y * y); cnt[c]++;
      if (ax > peak) peak = ax;
      if (ay > peak) peak = ay;
    }
    mOut.push(L, R);
    parts.push(new Blob([interleave(L, R)]));
    written += L.length;
  };
  for (let pos = 0; pos < frames; pos += CHUNK) {
    if (cancelled !== my) { post({ type: "cancelled", id }); return; }
    const { l, r } = await src.read(pos, Math.min(CHUNK, frames - pos));
    mIn.push(l, r);
    const [L, R] = chain.push(l, r);
    take(L, R);
    const done = (pos + CHUNK) / frames, el = (Date.now() - t0) / 1000;
    progress(id, "process", Math.min(99, Math.round(100 * done)), `Restoring... ${fmtEta(done > 0.02 ? el / done - el : null)}`);
  }
  const [L, R] = chain.flush();
  take(L, R);
  const clicks = chain.clicks, anyLeft = clicks.some((q) => q.ch === 0);
  const blob = new Blob(parts);
  post({
    type: "processed", id, blob, frames: written, fs, seconds: (Date.now() - t0) / 1000,
    lufsIn: mIn.value(), lufsOut: mOut.value(), peakDb: 20 * Math.log10(peak + 1e-12),
    clicks: { total: clicks.filter((e) => e.kind !== "long").length, long: clicks.filter((e) => e.kind === "long").length, at: clicks.filter((e) => e.ch === 0 || !anyLeft).slice(0, 20000).map((e) => e.at / fs) },
    overview: { cols, per, peakL, peakR, rms: Float32Array.from(rms, (v, c) => Math.sqrt(v / Math.max(1, cnt[c]))) },
  });
}
const fmtEta = (s) => (s == null ? "" : s < 60 ? `about ${Math.max(1, Math.round(s))} s left` : `about ${Math.round(s / 60)} min left`);

// Tracks (start/end in the restored timeline, seconds) to tagged 24-bit WAVs, or one zip
async function exportTracks(id, restored, tracks, zipIt, bits = 24) {
  const src = new F32Reader(restored.blob, restored.fs, restored.frames), fs = src.fs;
  // anything over full scale is brought down evenly for the whole export (never clipped)
  const gain = restored.peakDb > -0.1 ? Math.pow(10, (-0.1 - restored.peakDb) / 20) : 1;
  const files = [];
  let done = 0;
  const total = tracks.reduce((a, t) => a + (t.end - t.start), 0);
  for (const t of tracks) {
    const a = Math.max(0, Math.round(t.start * fs)), b = Math.min(src.frames, Math.round(t.end * fs));
    const enc = pcmEncoder(bits), parts = [];
    for (let pos = a; pos < b; pos += CHUNK) {
      const { l, r } = await src.read(pos, Math.min(CHUNK, b - pos));
      if (gain !== 1) for (let i = 0; i < l.length; i++) { l[i] *= gain; r[i] *= gain; }
      parts.push(enc(l, r));
      done += l.length / fs;
      progress(id, "export", Math.round(90 * done / Math.max(1e-9, total)), "Writing the WAV files...");
    }
    const blob = wavFromParts(parts, fs, bits, t.meta, null);
    files.push({ name: t.fileName || fileName(t.meta, "wav"), blob });
  }
  if (zipIt) {
    const z = await zip(files, (p) => progress(id, "export", 90 + Math.round(10 * p), "Packing the zip..."));
    post({ type: "exported", id, zip: z, files: files.map((f) => ({ name: f.name, size: f.blob.size })), gainDb: 20 * Math.log10(gain) });
  } else post({ type: "exported", id, files, gainDb: 20 * Math.log10(gain) });
}

self.onmessage = async (e) => {
  const d = e.data;
  try {
    if (d.type === "cancel") { cancelled++; return; }
    if (d.type === "analyse") return await analyse(d.id, d.source, d.sourceType);
    if (d.type === "learn") return await learn(d.id, d.source, d.start, d.end, d.hum, d.N);
    if (d.type === "preview") return await preview(d.id, d.source, d.start, d.end, d.settings, d.removed);
    if (d.type === "process") return await processAll(d.id, d.source, d.settings);
    if (d.type === "export") return await exportTracks(d.id, d.restored, d.tracks, d.zip, d.bits);
  } catch (err) {
    post({ type: "error", id: d.id, message: String(err?.message || err), stack: String(err?.stack || "") });
  }
};
