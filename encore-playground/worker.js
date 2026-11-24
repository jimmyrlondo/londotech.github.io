// Background thread: holds the song, learns it and renders exports, so the
// page never freezes.
import { loadMaster, integratedLufs } from "./master-core.js";
import { mixCheck } from "./mix-check.js";
import { profile, explain, matchReference, loudestWindow } from "./reference.js";

let reference = null; // { l, r, fs, profile }

// Render the song's loudest 30 s with these settings and measure it the same
// way as the reference. Whole-song loudness is the target (export hits it).
function measureMaster(settings) {
  const [a, b] = loudestWindow(song.l, song.r, song.fs, 30);
  const learned = M.learnOffline(song.l, song.r, song.fs, settings);
  const [ol, or] = M.renderOffline(song.l.subarray(a, b), song.r.subarray(a, b), song.fs, settings, learned);
  return profile(ol, or, song.fs, Math.floor(song.fs * 2), ol.length, settings.targetLufs); // skip the start-up
}

let M = null;
let song = null; // { l, r, fs }
let previewToken = 0;
const COLS = 1200;

// Splits the master into lows (< ~200 Hz), mids and highs (> ~3 kHz) and
// measures each per waveform column, so the page can colour the waveform by
// frequency (like DJ software). EQ moves then visibly change the colours.
function makeSplitter(fs) {
  const coef = (type, f) => {
    const w = 2 * Math.PI * f / fs, al = Math.sin(w) / (2 * 0.7071), c = Math.cos(w), a0 = 1 + al;
    return type === "lp" ? [(1 - c) / 2 / a0, (1 - c) / a0, (1 - c) / 2 / a0, -2 * c / a0, (1 - al) / a0]
                         : [(1 + c) / 2 / a0, -(1 + c) / a0, (1 + c) / 2 / a0, -2 * c / a0, (1 - al) / a0];
  };
  const stage = (k) => { let z1 = 0, z2 = 0; return (x) => { const y = k[0] * x + z1; z1 = k[1] * x - k[3] * y + z2; z2 = k[2] * x - k[4] * y; return y; }; };
  const lp = [stage(coef("lp", 200)), stage(coef("lp", 200))], hp = [stage(coef("hp", 3000)), stage(coef("hp", 3000))];
  return (x) => { const lo = lp[1](lp[0](x)), hi = hp[1](hp[0](x)); return [lo, x - lo - hi, hi]; };
}

function bandsInto(acc, split, l, r, from, to, per) {
  for (let i = from; i < to; i++) {
    const [lo, mi, hi] = split(0.5 * (l[i] + r[i])), c = Math.floor(i / per) * 4;
    acc[c] += lo * lo; acc[c + 1] += mi * mi; acc[c + 2] += hi * hi; acc[c + 3] += 1;
  }
}

// Peak per waveform column for samples [from, to)
function peaksInto(peaks, l, r, from, to, per) {
  for (let c = Math.floor(from / per); c < Math.ceil(to / per) && c < peaks.length; c++) {
    let m = 0;
    for (let i = c * per, e = Math.min((c + 1) * per, to); i < e; i += 2) m = Math.max(m, Math.abs(l[i]), Math.abs(r[i]));
    peaks[c] = Math.max(peaks[c], m);
  }
}

self.onmessage = async (e) => {
  const d = e.data;
  if (d.type === "init") { M = await loadMaster(d.wasm); self.postMessage({ type: "ready" }); return; }

  if (d.type === "song") {
    song = { l: d.l, r: d.r, fs: d.fs };
    self.postMessage({ type: "analysed", originalLufs: integratedLufs(song.l, song.r, song.fs) });
    // the original's lows/mids/highs per waveform column, so it can be drawn in colour too
    const n = song.l.length, per = Math.ceil(n / COLS), acc = new Float64Array(COLS * 4);
    bandsInto(acc, makeSplitter(song.fs), song.l, song.r, 0, n, per);
    const bands = new Float32Array(COLS * 3);
    for (let c = 0; c < COLS; c++) for (let k = 0; k < 3; k++) bands[c * 3 + k] = acc[c * 4 + 3] ? Math.sqrt(acc[c * 4 + k] / acc[c * 4 + 3]) : 0;
    self.postMessage({ type: "origBands", bands });
    self.postMessage({ type: "mixcheck", report: mixCheck(song.l, song.r, song.fs) });
    return;
  }
  if (d.type === "reference") {
    const [a, b] = loudestWindow(d.l, d.r, d.fs, 30);
    reference = { l: d.l, r: d.r, fs: d.fs, start: a / d.fs, profile: profile(d.l, d.r, d.fs, a, b, integratedLufs(d.l, d.r, d.fs)) };
    self.postMessage({ type: "refLoaded", wholeLufs: reference.profile.wholeLufs, start: reference.start });
    if (song && M) self.postMessage({ type: "refReport", differences: explain(reference.profile, measureMaster(d.settings)) });
    return;
  }
  if (!song || !M) return;

  if (d.type === "refCompare" && reference) {
    self.postMessage({ type: "refReport", differences: explain(reference.profile, measureMaster(d.settings)) });
    return;
  }

  if (d.type === "matchRef" && reference) {
    const res = matchReference(reference.profile, d.settings, measureMaster);
    self.postMessage({ type: "refMatched", refTone: res.refTone, glue: res.glue, targetLufs: res.targetLufs,
      before: explain(reference.profile, res.before), after: explain(reference.profile, res.after) });
    return;
  }

  if (d.type === "learn" || d.type === "preview") {
    const token = ++previewToken;
    const learned = M.learnOffline(song.l, song.r, song.fs, d.settings);
    self.postMessage({ type: "learned", id: d.id, learned });

    // Re-master the whole song a second at a time, sending the new waveform
    // as it goes; stop early if the settings change again.
    const n = song.l.length, per = Math.ceil(n / COLS);
    const outL = new Float32Array(n), outR = new Float32Array(n), peaks = new Float32Array(COLS);
    const acc = new Float64Array(COLS * 4);
    const bandsOut = () => { const b = new Float32Array(COLS * 3); for (let c = 0; c < COLS; c++) for (let k = 0; k < 3; k++) b[c * 3 + k] = acc[c * 4 + 3] ? Math.sqrt(acc[c * 4 + k] / acc[c * 4 + 3]) : 0; return b; };
    // Pass 1 renders with the learned settings. Like the export, if the whole
    // song didn't land on the target (dynamic songs come out a bit quiet),
    // correct the drive, tell the live engine, and render once more, so the
    // waveform, the numbers and what you hear all match the download.
    let lufs = -100, pk = 0;
    for (let pass = 0; pass < 2; pass++) {
      let done = 0;
      peaks.fill(0); acc.fill(0);
      const split = makeSplitter(song.fs);
      const steps = M.renderSteps(song.l, song.r, song.fs, d.settings, learned, outL, outR, song.fs * 2);
      for (const finished of steps) {
        peaksInto(peaks, outL, outR, done, finished, per);
        bandsInto(acc, split, outL, outR, done, finished, per);
        done = finished;
        if (pass === 0) self.postMessage({ type: "peaks", id: d.id, peaks: peaks.slice(), bands: bandsOut(), doneCols: Math.floor(done / per) });
        await new Promise((res) => setTimeout(res, 0)); // let a newer request in
        if (token !== previewToken) { steps.return(); return; }
      }
      lufs = integratedLufs(outL, outR, song.fs);
      const err = (d.settings.targetLufs ?? -14) - lufs;
      if (pass === 1 || Math.abs(err) < 0.3) break;
      learned[2] = Math.max(-6, Math.min(24, learned[2] + err));
      self.postMessage({ type: "learned", id: d.id, learned });
    }
    self.postMessage({ type: "peaks", id: d.id, peaks, bands: bandsOut(), doneCols: COLS, final: true });
    for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(outL[i]), Math.abs(outR[i]));
    self.postMessage({ type: "masterStats", id: d.id, lufs, peakDb: 20 * Math.log10(pk + 1e-12) });
    return;
  }

  if (d.type === "render") {
    previewToken++; // an export takes priority over a waveform preview
    const learned = M.learnOffline(song.l, song.r, song.fs, d.settings);
    const { out, lufs } = M.renderToTarget(song.l, song.r, song.fs, d.settings, learned,
      (pass) => self.postMessage({ type: "progress", text: pass === 0 ? "Mastering the whole song..." : "Fine-tuning the loudness for the whole song..." }));
    const [l, r] = out;
    let peak = 0;
    for (let i = 0; i < l.length; i++) peak = Math.max(peak, Math.abs(l[i]), Math.abs(r[i]));
    self.postMessage({ type: "rendered", l, r, fs: song.fs, lufs, peakDb: 20 * Math.log10(peak + 1e-12) }, [l.buffer, r.buffer]);
  }
};
