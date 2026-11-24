// ENCORE. Chop: the sampler's logic. Finding hits (transients), equal and manual slices,
// pads, the step pattern, swing timing, live-record quantizing, and the offline render
// used for exports. No DOM, no Web Audio (test-chop.mjs runs it in Node).
import { LofiChain, softClip } from "./lofi-core.js";

export const PADS = 16;
export const STEPS_PER_BAR = 16;

/** Mono mix of any number of channels */
export function mono(chans) {
  if (chans.length === 1) return chans[0];
  const n = chans[0].length, out = new Float32Array(n), k = 1 / chans.length;
  for (const c of chans) for (let i = 0; i < n; i++) out[i] += c[i] * k;
  return out;
}

/**
 * Where the hits start. sensitivity 0..1 (more = more slices). Returns sample positions,
 * sorted, at most `max`, each placed just before its attack (not on the loudest point).
 * Energy in short frames, a rise against the recent level, peaks picked with a minimum gap.
 */
export function detectTransients(x, fs, { sensitivity = 0.5, minGapMs = 70, max = PADS } = {}) {
  const hop = Math.max(32, Math.round(fs * 0.0025)), win = hop * 2, frames = Math.floor((x.length - win) / hop);
  if (frames < 4) return [0];
  // a little high-frequency weighting (a first difference) so hats and snares count, not just bass
  const env = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let e = 0, s = f * hop, prev = x[s] || 0;
    for (let i = s; i < s + win; i++) { const v = x[i], d = v - prev; prev = v; e += v * v + 2 * d * d; }
    env[f] = Math.log10(1e-9 + e / win);
  }
  const peakDb = Math.max(...env);
  // onset strength: how far this frame jumps over the quietest of the few frames before it
  const odf = new Float32Array(frames);
  for (let f = 1; f < frames; f++) {
    let lo = env[f - 1];
    for (let k = 2; k <= 6 && f - k >= 0; k++) lo = Math.min(lo, env[f - k]);
    odf[f] = Math.max(0, env[f] - lo) * (env[f] > peakDb - 4.5 ? 1 : 0); // ignore anything 45 dB under the peak
  }
  const thresh = 0.25 + (1 - sensitivity) * 1.35;   // in log10 energy (2.5 dB .. 16 dB jumps)
  const gap = Math.max(1, Math.round((minGapMs / 1000) * fs / hop));
  const cands = [];
  for (let f = 1; f < frames - 1; f++) {
    if (odf[f] < thresh || odf[f] < odf[f - 1] || odf[f] < odf[f + 1]) continue;
    cands.push({ f, s: odf[f] + 0.15 * (env[f] - peakDb + 4.5) });
  }
  // strongest first, keep those far enough from ones already kept
  cands.sort((a, b) => b.s - a.s);
  const kept = [];
  for (const c of cands) if (kept.every((k) => Math.abs(k.f - c.f) >= gap)) kept.push(c);
  let starts = kept.slice(0, max).map((c) => refineOnset(x, c.f * hop, hop * 3, fs)).sort((a, b) => a - b);
  // keep the very start too when there's sound before the first hit
  if (!starts.length || (starts[0] > fs * 0.03 && rms(x, 0, starts[0]) > dbLin(peakDb) * 0.03)) {
    starts = [0, ...starts].slice(0, max);
  }
  return dedupe(starts, Math.round(fs * 0.01));
}
const dbLin = (log10e) => Math.sqrt(Math.pow(10, log10e));
function rms(x, a, b) { let e = 0; for (let i = a; i < b; i++) e += x[i] * x[i]; return Math.sqrt(e / Math.max(1, b - a)); }
function dedupe(a, minGap) { const out = []; for (const v of a) if (!out.length || v - out[out.length - 1] >= minGap) out.push(v); return out; }

/**
 * Back up from a detected frame to where the hit starts (within `back` samples either side),
 * minus 1 ms. Uses the 1 ms energy of the sample-to-sample change (the bright part), so a hat on
 * a kick's tail is still found where it starts.
 */
export function refineOnset(x, at, back, fs) {
  const w = Math.max(8, Math.round(fs * 0.001));
  const a = Math.max(1, at - back), b = Math.min(x.length, at + back), pre = Math.max(1, a - Math.round(fs * 0.01));
  const e = new Float32Array(b - pre);
  let acc = 0;
  const val = (i) => { const d = x[i] - x[i - 1]; return d * d; };
  for (let i = pre; i < b; i++) { acc += val(i); if (i - w >= pre) acc -= val(i - w); e[i - pre] = acc; }
  let lo = Infinity, pk = 0;
  for (let i = pre + w; i <= a; i++) lo = Math.min(lo, e[i - pre]);
  if (!Number.isFinite(lo)) lo = 0;
  for (let i = a; i < b; i++) pk = Math.max(pk, e[i - pre]);
  if (pk <= lo) return at;
  const th = lo + 0.2 * (pk - lo);
  let i = a;
  while (i < b && e[i - pre] < th) i++;
  return Math.max(0, i - w - Math.round(fs * 0.001));
}

/** count equal slices over [start, end) samples */
export function equalSlices(len, count = 16, start = 0, end = len) {
  const span = Math.max(1, end - start), out = [];
  for (let k = 0; k < count; k++) out.push(Math.round(start + (k * span) / count));
  return out;
}

/** Slice starts to pad regions: each pad plays to the next start (the last to `end`) */
export function slicesToRegions(starts, len, end = len) {
  const s = [...new Set(starts.map((v) => Math.max(0, Math.min(len - 1, Math.round(v)))))].sort((a, b) => a - b).slice(0, PADS);
  return s.map((a, i) => ({ start: a, end: i + 1 < s.length ? s[i + 1] : end }));
}

export const PAD_DEFAULT = { start: 0, end: 0, pitch: 0, fine: 0, reverse: false, gain: 1, fade: 5, choke: true, mode: "oneshot" };
export function makePads(regions) {
  return Array.from({ length: PADS }, (_, i) => (regions[i] ? { ...PAD_DEFAULT, ...regions[i] } : { ...PAD_DEFAULT, empty: true }));
}

/** Playback rate for a pad's pitch (semitones plus cents): classic sampler varispeed */
export const rateOf = (pad) => Math.pow(2, ((pad.pitch || 0) + (pad.fine || 0) / 100) / 12);

/**
 * The sound a pad makes, as Float32 channels at the sample's rate: its region, reversed
 * if set, re-pitched (speed changes with pitch), with fades against clicks, times gain.
 */
export function padAudio(chans, fs, pad) {
  if (!pad || pad.empty) return chans.map(() => new Float32Array(0));
  const a = Math.max(0, Math.min(pad.start, chans[0].length)), b = Math.max(a, Math.min(pad.end, chans[0].length));
  const rate = rateOf(pad), n = Math.max(0, Math.floor((b - a) / rate));
  const fadeN = Math.min(Math.floor(n / 2), Math.round(((pad.fade ?? 5) / 1000) * fs));
  return chans.map((c) => {
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const p = i * rate, j = Math.floor(p), f = p - j;
      let s0, s1;
      if (pad.reverse) { s0 = c[b - 1 - j] ?? 0; s1 = c[b - 2 - j] ?? s0; }
      else { s0 = c[a + j] ?? 0; s1 = a + j + 1 < b ? c[a + j + 1] : s0; }
      let v = (s0 + (s1 - s0) * f) * (pad.gain ?? 1);
      if (i < fadeN) v *= i / fadeN;
      if (n - 1 - i < fadeN) v *= (n - 1 - i) / fadeN;
      out[i] = v;
    }
    return out;
  });
}

// ---- the pattern

/** An empty pattern: bars x 16 steps, each step a list of 16 velocities (0 = off) */
export function emptyPattern(bars = 1) {
  return { bars, steps: Array.from({ length: bars * STEPS_PER_BAR }, () => new Array(PADS).fill(0)) };
}
export function resizePattern(p, bars) {
  const out = emptyPattern(bars);
  for (let s = 0; s < out.steps.length; s++) out.steps[s] = [...p.steps[s % p.steps.length]];
  // growing repeats what's there; shrinking keeps the start
  if (bars < p.bars) for (let s = 0; s < out.steps.length; s++) out.steps[s] = [...p.steps[s]];
  return out;
}

/**
 * When a step plays, in seconds from the top of the pattern. swing 0.5..0.75 is the share of
 * each 8th-note pair given to the first 16th: 0.5 is straight, 0.667 a triplet feel. Only the
 * second 16th of each pair moves: it lands at 8thStart + swing * 8thLength.
 */
export function stepTime(step, bpm, swing = 0.5) {
  const six = 60 / bpm / 4, pair = Math.floor(step / 2);
  return step % 2 === 0 ? pair * 2 * six : pair * 2 * six + Math.min(0.75, Math.max(0.5, swing)) * 2 * six;
}
export const patternSeconds = (p, bpm) => (p.bars * STEPS_PER_BAR * 60) / bpm / 4;

/** Every hit in the pattern: [{ time, step, pad, vel }] sorted by time */
export function patternEvents(p, bpm, swing = 0.5) {
  const ev = [];
  p.steps.forEach((row, step) => row.forEach((v, pad) => { if (v > 0) ev.push({ time: stepTime(step, bpm, swing), step, pad, vel: v }); }));
  return ev.sort((a, b) => a.time - b.time || a.pad - b.pad);
}

/**
 * Live recording: a hit at `t` seconds into the loop goes on the nearest step (swing taken
 * into account). strength 0..1 is how far it's pulled; the step is what gets stored, so the
 * pattern stays on the grid and swing can still change later. Returns the step index.
 */
export function quantizeHit(t, bpm, swing, totalSteps) {
  const len = (totalSteps * 60) / bpm / 4, tt = ((t % len) + len) % len;
  let best = 0, bd = Infinity;
  for (let s = 0; s <= totalSteps; s++) {
    const d = Math.abs(stepTime(s, bpm, swing) - tt);
    if (d < bd) { bd = d; best = s; }
  }
  return best % totalSteps;
}

/**
 * Renders the pattern as Float32 channels (stereo) at fs. pads, sample: { chans, fs }.
 * opts: { loops = 1, loopReady = true (tails wrap to the start), lofi = null (LofiChain settings),
 *         gain = 0.8 }. Choke: a pad with choke on cuts the previous choked pad.
 */
export function renderPattern(p, pads, sample, bpm, swing = 0.5, opts = {}) {
  const { loops = 1, loopReady = true, lofi = null, gain = 0.8 } = opts;
  const fs = sample.fs, loopLen = Math.round(patternSeconds(p, bpm) * fs), total = loopLen * loops;
  const ev = patternEvents(p, bpm, swing);
  const cache = new Map(), audio = (i) => { if (!cache.has(i)) cache.set(i, padAudio(sample.chans, fs, pads[i])); return cache.get(i); };
  // the hits in order, with choke ends worked out
  const hits = [];
  for (let l = 0; l < loops; l++) for (const e of ev) hits.push({ at: l * loopLen + Math.round(e.time * fs), pad: e.pad, vel: e.vel });
  const tailMax = Math.max(0, ...hits.map((h) => audio(h.pad)[0].length));
  const len = loopReady ? total : total + tailMax;
  const out = [new Float32Array(len + tailMax), new Float32Array(len + tailMax)];
  let lastChoke = null;
  for (const h of hits) {
    if (pads[h.pad]?.empty) continue;
    if (pads[h.pad].choke) { if (lastChoke) lastChoke.until = h.at; lastChoke = h; }
  }
  for (const h of hits) {
    const a = audio(h.pad); if (!a[0].length) continue;
    const stop = Math.min(a[0].length, (h.until ?? Infinity) - h.at), g = gain * velGain(h.vel);
    const fadeN = Math.round(fs * 0.004);
    for (let c = 0; c < 2; c++) {
      const src = a[c] || a[0], dst = out[c];
      for (let i = 0; i < stop; i++) {
        let v = src[i] * g;
        if (stop < a[0].length && stop - i < fadeN) v *= (stop - i) / fadeN; // choke fade
        dst[h.at + i] += v;
      }
    }
  }
  let res = out;
  if (loopReady) {
    // fold what rings past the end back onto the start, so the file loops seamlessly
    res = [out[0].slice(0, total), out[1].slice(0, total)];
    for (let c = 0; c < 2; c++) for (let i = total; i < out[c].length; i++) res[c][i % total] += out[c][i];
  } else res = [out[0].slice(0, len), out[1].slice(0, len)];
  if (lofi) {
    const chain = new LofiChain(fs, 2, 11);
    chain.set({ ...lofi, bpm });
    const lat = chain.latency;
    // run the chain, then take its small delay back off so beat 1 stays on sample 0
    const padded = res.map((c) => { const x = new Float32Array(c.length + lat); x.set(c); return x; });
    const block = 4096;
    for (let s = 0; s < padded[0].length; s += block) chain.process(padded.map((c) => c.subarray(s, Math.min(padded[0].length, s + block))), s);
    res = padded.map((c) => c.slice(lat, lat + res[0].length));
  } else {
    for (const c of res) for (let i = 0; i < c.length; i++) c[i] = softClip(c[i]);
  }
  return res;
}
/** Step velocity (1..127) to gain */
export const velGain = (v) => Math.pow(Math.min(127, Math.max(0, v)) / 127, 1.4);

/**
 * Tempo guesses from the sample's own length, if it's a loop of whole bars: [{ bars, bpm }]
 * for 1, 2, 4 and 8 bars of 4/4, kept between 60 and 180.
 */
export function loopTempos(seconds) {
  const out = [];
  for (const bars of [1, 2, 4, 8]) { const bpm = (bars * 4 * 60) / seconds; if (bpm >= 60 && bpm <= 180) out.push({ bars, bpm }); }
  return out;
}

/** Pick the tempo to use: the detector's answer, nudged to a whole-bar loop length when one is within 2% */
export function settleTempo(detected, seconds) {
  if (!detected) return loopTempos(seconds)[0]?.bpm || 90;
  for (const c of loopTempos(seconds)) for (const m of [1, 2, 0.5]) if (Math.abs(c.bpm - detected * m) / c.bpm < 0.02) return c.bpm;
  return detected;
}

/** The keyboard layout: pad 1 is bottom-left (Z), pad 16 top-right (4) */
export const KEYS = ["z", "x", "c", "v", "a", "s", "d", "f", "q", "w", "e", "r", "1", "2", "3", "4"];
/** MIDI notes 36 to 51 (the usual pad-controller layout) play pads 1 to 16; others wrap around */
export const padForNote = (note) => (note >= 36 && note < 52 ? note - 36 : ((note % 16) + 16) % 16);
