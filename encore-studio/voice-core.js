// Encore Voice: the parts with no page in them (following a singing voice, what a
// range or a take says about it, scoring, building exercises), so node can test
// them (test-voice.mjs). Pitch detection is the same YIN idea as tune-core.js,
// tuned for voice: every candidate period comes back too, so octave slips can be caught.
import { downsample, noteName } from './tune-core.js';
export { noteName };

export const hzToMidi = (hz, a4 = 440) => 69 + 12 * Math.log2(hz / a4);
export const midiToHz = (m, a4 = 440) => a4 * Math.pow(2, (m - 69) / 12);

/**
 * YIN for a voice: { hz, clarity (1 = perfectly periodic), rms, mins } or hz 0 when there's no clear note.
 * mins: every dip in the difference function (each a possible period), for the tracker's octave checks.
 */
export function detectVoice(x, sampleRate, minHz = 65, maxHz = 1100) {
  const n = x.length, none = { hz: 0, clarity: 0, rms: 0, mins: [] };
  const tauMin = Math.max(2, Math.floor(sampleRate / maxHz));
  const tauMax = Math.min((n >> 1) + (n >> 3), Math.ceil(sampleRate / minHz) + 1);
  const w = n - tauMax - 1;
  if (w <= 0) return none;
  let energy = 0;
  for (let i = 0; i < n; i++) energy += x[i] * x[i];
  const rms = Math.sqrt(energy / n);
  if (rms < 1e-3) return { ...none, rms };   // quieter than about -60 dB
  const d = new Float32Array(tauMax + 2);
  for (let tau = 1; tau <= tauMax + 1; tau++) {
    let s = 0;
    for (let i = 0; i < w; i++) { const diff = x[i] - x[i + tau]; s += diff * diff; }
    d[tau] = s;
  }
  let running = 0;
  d[0] = 1;
  for (let tau = 1; tau < d.length; tau++) {
    running += d[tau];
    d[tau] = running > 0 ? d[tau] * tau / running : 1;
  }
  const mins = [];
  for (let tau = tauMin; tau <= tauMax; tau++)
    if (d[tau] < 0.5 && d[tau] < d[tau - 1] && d[tau] <= d[tau + 1]) mins.push(tau);
  if (!mins.length) return { ...none, rms };
  // YIN's rule: the first dip that's deep enough, else the deepest
  let pick = mins.find(t => d[t] < 0.15);
  if (pick === undefined) pick = mins.reduce((a, b) => d[b] < d[a] ? b : a);
  // an octave-down slip: a dip at half the period that's nearly as deep is the real note
  for (let guard = 0; guard < 3; guard++) {
    const half = mins.find(t => Math.abs(t - pick / 2) <= Math.max(1.5, pick * 0.03));
    if (half !== undefined && d[half] < Math.min(0.35, d[pick] + 0.1)) pick = half; else break;
  }
  // an octave-up slip: a weak fundamental under a strong 2nd harmonic (low notes on "ee") nearly repeats
  // at half the period; the true period's dip is then far deeper
  const dbl = mins.find(t => Math.abs(t - pick * 2) <= Math.max(1.5, pick * 0.06));
  if (dbl !== undefined && d[pick] > 0.08 && d[dbl] < d[pick] * 0.3) pick = dbl;
  const refine = tau => {
    const a = d[tau - 1], b = d[tau], c = d[tau + 1], denom = a - 2 * b + c;
    return Math.abs(denom) > 1e-9 ? tau + 0.5 * (a - c) / denom : tau;
  };
  return { hz: sampleRate / refine(pick), clarity: 1 - d[pick], rms,
           mins: mins.map(t => ({ hz: sampleRate / refine(t), d: d[t] })) };
}

/**
 * Follows a voice frame by frame: gates out silence and breath, catches octave slips
 * (a sudden octave jump is only believed once it lasts), and smooths lightly (a median of three,
 * enough to steady the line without shrinking a vibrato).
 * feed(samples, sampleRate, t): the newest samples (at least `window` seconds of them), t in seconds.
 * Gives { t, midi (a float, null when there's no voice), hz, clarity, rms }.
 */
export const TRACK_WINDOW = 0.045;  // seconds of sound per pitch reading

export class VoiceTracker {
  constructor({ minHz = 65, maxHz = 1100, gate = 0.0025, minClarity = 0.72, window = TRACK_WINDOW, a4 = 440 } = {}) {
    Object.assign(this, { minHz, maxHz, gate, minClarity, window, a4 });
    this.reset();
  }
  reset() { this.raw = []; this.out = null; this.lastVoiced = -1; this.jump = null; }
  feed(samples, sampleRate, t) {
    const len = Math.min(samples.length, Math.round(sampleRate * this.window));
    const x = samples.length === len ? samples : samples.subarray(samples.length - len);
    const stride = Math.max(1, Math.round(sampleRate / 24000));
    return this.push(detectVoice(downsample(x, stride), sampleRate / stride, this.minHz, this.maxHz), t);
  }
  push(det, t) {
    const frame = { t, midi: null, hz: 0, clarity: det.clarity, rms: det.rms };
    if (!(det.hz > 0) || det.rms < this.gate || det.clarity < this.minClarity) {
      if (t - this.lastVoiced > 0.08) { this.raw = []; this.out = null; this.jump = null; }
      return frame;
    }
    let m = hzToMidi(det.hz, this.a4);
    const ref = this.out !== null && t - this.lastVoiced < 0.15 ? this.out : null;
    if (ref !== null && Math.abs(m - ref) > 7) {
      // a big jump: either an octave slip (the old note is still one of the dips) or a real leap
      const sameJump = this.jump && Math.abs(this.jump.m - m) < 1.5;
      this.jump = sameJump ? { m, since: this.jump.since } : { m, since: t };
      if (t - this.jump.since < 0.1) {
        const alt = det.mins.find(c => c.d < 0.35 && Math.abs(hzToMidi(c.hz, this.a4) - ref) < 1);
        if (!alt) { this.lastVoiced = t; return frame; }   // not sure yet: show nothing rather than a wrong note
        m = hzToMidi(alt.hz, this.a4);
      } else { this.raw = []; this.out = null; this.jump = null; }
    } else this.jump = null;
    this.lastVoiced = t;
    this.raw.push(m);
    if (this.raw.length > 3) this.raw.shift();
    const med = [...this.raw].sort((a, b) => a - b)[this.raw.length >> 1];
    this.out = med;
    frame.midi = this.out;
    frame.hz = midiToHz(this.out, this.a4);
    return frame;
  }
}

// ---- small helpers over frames ({ t, midi } with midi null for no voice)

const median = a => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y), h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };
const mean = a => a.reduce((s, v) => s + v, 0) / (a.length || 1);
const sd = a => { const m = mean(a); return Math.sqrt(mean(a.map(v => (v - m) * (v - m)))); };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export { median };

/** Runs of voice: breaks at a gap longer than maxGap seconds or a jump bigger than maxStep semitones */
export function voicedRuns(frames, maxGap = 0.12, maxStep = 1.5) {
  const runs = [];
  let run = null;
  for (const f of frames) {
    if (f.midi === null || f.midi === undefined) continue;
    const prev = run && run[run.length - 1];
    if (!prev || f.t - prev.t > maxGap || Math.abs(f.midi - prev.midi) > maxStep) runs.push(run = []);
    run.push(f);
  }
  return runs;
}

const runSeconds = run => run.length ? run[run.length - 1].t - run[0].t : 0;
const median5 = run => run.map((f, i) => ({ t: f.t, midi: median(run.slice(Math.max(0, i - 2), i + 3).map(g => g.midi)) }));

/**
 * Frames that hold a pitch, each with how long it stands for: the 0.2 s before and the 0.2 s after
 * sit within 30 cents of each other (a slide fails that, a vibrato around one note doesn't)
 */
function steadyFrames(frames) {
  const out = [];
  for (const run of voicedRuns(frames)) {
    if (runSeconds(run) < 0.25) continue;
    run.forEach((f, i) => {
      const before = [], after = [];
      for (let j = i; j >= 0 && f.t - run[j].t <= 0.2; j--) before.push(run[j].midi);
      for (let j = i + 1; j < run.length && run[j].t - f.t <= 0.2; j++) after.push(run[j].midi);
      const dt = i + 1 < run.length ? Math.min(0.05, run[i + 1].t - f.t) : 0;
      if (before.length >= 3 && after.length >= 3 && Math.abs(mean(before) - mean(after)) < 0.3 && sd([...before, ...after]) < 0.6) out.push({ midi: f.midi, w: dt });
    });
  }
  return out;
}

/** Weighted percentile of { midi, w } */
function wPercentile(items, p) {
  const s = [...items].sort((a, b) => a.midi - b.midi), total = s.reduce((n, i) => n + i.w, 0);
  let acc = 0;
  for (const i of s) { acc += i.w; if (acc >= p * total) return i.midi; }
  return s.length ? s[s.length - 1].midi : NaN;
}

/**
 * Where a voice sits comfortably (its tessitura): the middle 70% of the time spent on steady notes.
 * Gives { lo, hi, seconds } (whole notes), or null with under 3 seconds of steady singing.
 */
export function tessitura(frames) {
  const steady = steadyFrames(frames), seconds = steady.reduce((n, s) => n + s.w, 0);
  if (seconds < 3) return null;
  return { lo: Math.round(wPercentile(steady, 0.15)), hi: Math.round(wPercentile(steady, 0.85)), seconds };
}

/**
 * A range test: the lowest and highest notes reached (slides and sirens count; a blip under
 * a quarter of a second doesn't), and the comfortable middle. tessFrames: singing to take the
 * tessitura from (a song sung comfortably); without enough of it, an estimate from the range.
 */
export function analyzeRange(frames, tessFrames = null) {
  const kept = voicedRuns(frames).filter(r => runSeconds(r) >= 0.25).flatMap(median5);
  if (kept.length < 10) return null;
  let lo = Infinity, hi = -Infinity;
  for (const f of kept) { lo = Math.min(lo, f.midi); hi = Math.max(hi, f.midi); }
  const low = Math.round(lo), high = Math.round(hi);
  let tess = tessFrames ? tessitura(tessFrames) : null, measured = !!tess;
  if (tess) tess = { lo: clamp(tess.lo, low, high), hi: clamp(tess.hi, low, high) };
  else {
    // the usual rule of thumb: comfortable from about a third above the bottom to a fourth below the top
    const a = low + 3, b = high - 4;
    tess = a <= b ? { lo: a, hi: b } : { lo: Math.floor((low + high) / 2), hi: Math.ceil((low + high) / 2) };
  }
  return { low, high, lowExact: lo, highExact: hi, tessLo: tess.lo, tessHi: tess.hi, tessMeasured: measured };
}

// typical ranges (MIDI) from the usual choir charts; a rough guide only
export const VOICE_TYPES = [
  { name: 'bass', low: 40, high: 64 },      // E2 to E4
  { name: 'baritone', low: 45, high: 69 },  // A2 to A4
  { name: 'tenor', low: 48, high: 72 },     // C3 to C5
  { name: 'alto', low: 53, high: 77 },      // F3 to F5
  { name: 'mezzo-soprano', low: 57, high: 81 }, // A3 to A5
  { name: 'soprano', low: 60, high: 84 },   // C4 to C6
];

/**
 * The voice types a range is nearest, best first. The bottom and the comfortable middle count
 * most (a high falsetto can stretch anyone's top); the top counts a little.
 */
// comfortable singing sits a little under the middle of a chart range (the charts include trained top notes)
const comfy = v => (v.low + v.high) / 2 - 2;
export function voiceTypeHint(range) {
  const centre = (range.tessLo + range.tessHi) / 2;
  return VOICE_TYPES.map(v => ({ name: v.name, low: v.low, high: v.high,
    distance: 1.5 * Math.abs(range.low - v.low) + 2 * Math.abs(centre - comfy(v)) + 0.5 * Math.abs(range.high - v.high) }))
    .sort((a, b) => a.distance - b.distance);
}

/** A note an octave (or two) out still counts as the note: the cents from the nearest octave, and how many octaves */
export function foldOctave(cents) {
  const octaves = Math.round(cents / 1200);
  return { cents: cents - octaves * 1200, octaves };
}

/** Moving average over `n` points (centred) */
function movingAverage(a, n) {
  if (n <= 1) return a.slice();
  const out = new Array(a.length), h = n >> 1;
  for (let i = 0; i < a.length; i++) {
    let s = 0, c = 0;
    for (let j = Math.max(0, i - h); j <= Math.min(a.length - 1, i + h); j++) { s += a[j]; c++; }
    out[i] = s / c;
  }
  return out;
}

/** Voiced frames resampled to an even `rate` per second (gaps under 0.12 s bridged): { t0, values } */
function resample(run, rate = 100) {
  const t0 = run[0].t, t1 = run[run.length - 1].t, n = Math.floor((t1 - t0) * rate) + 1, values = new Array(n);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const t = t0 + i / rate;
    while (j + 1 < run.length - 1 && run[j + 1].t <= t) j++;
    const a = run[j], b = run[Math.min(j + 1, run.length - 1)];
    values[i] = b.t > a.t ? a.midi + (b.midi - a.midi) * clamp((t - a.t) / (b.t - a.t), 0, 1) : a.midi;
  }
  return { t0, values };
}

/**
 * One try at matching a note: frames from when the singing window opened.
 * cents: how far off once settled (median), settle: seconds from the first sound until it
 * stayed within 50 cents for a quarter second (null if it never did), steadiness: the spread of
 * the held pitch in cents (a vibrato is smoothed out first, it isn't a fault), score 0 to 100.
 */
export function scoreMatch(frames, target) {
  const voiced = frames.filter(f => f.midi !== null && f.midi !== undefined);
  if (voiced.length < 8 || voiced[voiced.length - 1].t - voiced[0].t < 0.25) return { heard: false, score: 0 };
  const octaves = foldOctave((median(voiced.map(f => f.midi)) - target) * 100).octaves;
  const goal = target + 12 * octaves, onset = voiced[0].t;
  let settleAt = null;
  for (let i = 0; i < voiced.length && settleAt === null; i++) {
    const t0 = voiced[i].t;
    let j = i, ok = true;
    for (; j < voiced.length && voiced[j].t - t0 <= 0.25; j++) if (Math.abs(voiced[j].midi - goal) > 0.5) { ok = false; break; }
    if (ok && j < voiced.length && voiced[j - 1].t - t0 >= 0.2) settleAt = t0;
  }
  const from = settleAt ?? onset + 0.3;
  let held = voiced.filter(f => f.t >= from);
  if (held.length < 5) held = voiced;
  const cents = median(held.map(f => (f.midi - goal) * 100));
  const steadiness = sd(movingAverage(held.map(f => (f.midi - goal) * 100), Math.max(3, Math.round(held.length / (runSeconds(held) || 1) * 0.25))));
  const settle = settleAt === null ? null : settleAt - onset;
  const acc = clamp(1 - (Math.abs(cents) - 10) / 60, 0, 1), steady = clamp(1 - (steadiness - 8) / 40, 0, 1);
  const speed = settle === null ? 0 : clamp(1 - (settle - 0.25) / 1.5, 0, 1);
  return { heard: true, cents, settle, steadiness, octaves, sungMidi: goal + cents / 100, score: Math.round(100 * (0.6 * acc + 0.2 * steady + 0.2 * speed)) };
}

/** Plain words for how close: the colour band and a short phrase */
export function closeness(cents) {
  const c = Math.abs(cents);
  return c <= 20 ? 'good' : c <= 45 ? 'close' : 'off';
}

export function matchFeedback(r, targetName) {
  if (!r.heard) return 'I didn\'t hear a note that time. Sing a little louder, or move closer to the microphone.';
  const c = Math.round(Math.abs(r.cents)), dir = r.cents < 0 ? 'flat (low)' : 'sharp (high)';
  let s = c <= 10 ? `Spot on: ${targetName}, within ${Math.max(1, c)} cents.`
        : c <= 25 ? `Very close, just ${c} cents ${dir}.`
        : c <= 50 ? `Close: ${c} cents ${dir}. ${r.cents < 0 ? 'Aim a little higher' : 'Aim a little lower'} next time.`
        : c <= 150 ? `Off by ${c} cents, ${dir}. Listen again and slide slowly until it locks in.`
        : `That was a different note, ${dir}. Try humming the guide quietly first, then open to "ah".`;
  if (r.octaves) s += ` You sang it an octave ${r.octaves < 0 ? 'lower' : 'higher'}, which counts: same note, your octave.`;
  if (r.heard && r.settle !== null && Math.abs(r.cents) <= 50) s += r.settle <= 0.35 ? ' Found it straight away.' : ` Took ${r.settle.toFixed(1)} s to settle.`;
  return s;
}

/**
 * A held note: { seconds, meanMidi, cents (vs target, octave folded, if given), drift (cents start to end),
 * wobble (cents, slow unsteadiness once any vibrato is set aside), vibrato: { rate (Hz), width (cents, peak to peak),
 * regularity (0 to 1) } or null }. The first 0.35 s (the onset) and the last 0.15 s are left out.
 */
export function analyzeSustain(frames, target = null) {
  const runs = voicedRuns(frames, 0.12, 2).sort((a, b) => runSeconds(b) - runSeconds(a));
  if (!runs.length) return null;
  const run = runs[0].filter(f => f.t >= runs[0][0].t + 0.35 && f.t <= runs[0][runs[0].length - 1].t - 0.15);
  if (run.length < 10 || runSeconds(run) < 1.5) return null;
  const rate = 100, { values } = resample(run, rate), n = values.length;
  const meanMidi = mean(values);
  const c = values.map(v => (v - meanMidi) * 100);
  // the straight line through it: how far it drifted
  const xm = (n - 1) / 2;
  let sxy = 0, sxx = 0;
  c.forEach((v, i) => { sxy += (i - xm) * v; sxx += (i - xm) * (i - xm); });
  const slope = sxx ? sxy / sxx : 0, drift = slope * (n - 1);
  const r = c.map((v, i) => v - slope * (i - xm));
  // vibrato: a regular wave 3.5 to 9 times a second, found by autocorrelation with the slow wander taken out
  const slow = movingAverage(r, Math.round(0.4 * rate)), hp = r.map((v, i) => v - slow[i]);
  let vibrato = null;
  const hpv = hp, energy = hpv.reduce((s, v) => s + v * v, 0);
  if (energy > 0) {
    const ac = lag => { let s = 0; for (let i = 0; i + lag < n; i++) s += hpv[i] * hpv[i + lag]; return s / energy * n / (n - lag); };
    const lo = Math.floor(rate / 9), hi = Math.ceil(rate / 3.5);
    let best = -1, bestV = -Infinity;
    const acs = [];
    for (let lag = lo - 1; lag <= hi + 1; lag++) acs[lag] = ac(lag);
    for (let lag = lo; lag <= hi; lag++) if (acs[lag] > bestV && acs[lag] >= acs[lag - 1] && acs[lag] >= acs[lag + 1]) { bestV = acs[lag]; best = lag; }
    const width = 2 * Math.SQRT2 * sd(hpv);
    if (best > 0 && bestV > 0.3 && width >= 15) {
      const a = acs[best - 1], b = acs[best], cc = acs[best + 1], denom = a - 2 * b + cc;
      const lag = best + (Math.abs(denom) > 1e-9 ? 0.5 * (a - cc) / denom : 0), hz = rate / lag;
      // the measuring itself shrinks the wave a little: the detector's window averages over 45 ms, and
      // taking out the wander removes a sliver of it too. Put that back so the width is the sung one.
      const N = 2 * (Math.round(0.4 * rate) >> 1) + 1, x = Math.PI * hz / rate, y = Math.PI * hz * TRACK_WINDOW;
      const kept = (Math.sin(y) / y) * (1 - Math.sin(N * x) / (N * Math.sin(x)));
      vibrato = { rate: hz, width: width / clamp(kept, 0.5, 1.2), regularity: clamp(bestV, 0, 1) };
    }
  }
  const wobble = sd(movingAverage(r, vibrato ? Math.max(3, Math.round(rate / vibrato.rate)) : Math.round(0.1 * rate)));
  const res = { seconds: n / rate, meanMidi, drift, wobble, vibrato, cents: null, octaves: 0 };
  if (target !== null) { const f = foldOctave((meanMidi - target) * 100); res.cents = f.cents; res.octaves = f.octaves; }
  return res;
}

/** Plain-English notes on a held note, a list of sentences */
export function sustainFeedback(s) {
  const out = [];
  if (s.cents !== null) {
    const c = Math.round(Math.abs(s.cents));
    out.push(c <= 15 ? `Right on the note (${c} cents off on average).` : `On average ${c} cents ${s.cents < 0 ? 'flat' : 'sharp'} of the note.`);
  }
  const w = Math.round(s.wobble);
  out.push(w <= 8 ? `Very steady: the pitch held within about ${Math.max(2, w)} cents.` : w <= 18 ? `Fairly steady, with a little wander (about ${w} cents).`
    : `The pitch wandered about ${w} cents. A steady stream of breath, like blowing gently through a straw, helps hold it in place.`);
  const d = Math.round(s.drift);
  if (Math.abs(d) >= 20) out.push(`It drifted ${Math.abs(d)} cents ${d < 0 ? 'flat' : 'sharp'} over the hold. ${d < 0 ? 'Going flat as the breath runs low is very common: take a fuller breath and keep the sound moving forward to the end.' : 'Creeping sharp often means squeezing a little: let the sound stay easy as you hold it.'}`);
  if (s.vibrato) {
    const r = s.vibrato.rate, wd = Math.round(s.vibrato.width / 2);
    let v = `You have a vibrato: about ${r.toFixed(1)} times a second, about plus or minus ${wd} cents.`;
    v += r < 4.5 ? ' That\'s on the slow side. A slow, wide wave can come from pushing or tiredness; try a lighter, freer sound.'
       : r > 7.5 ? ' That\'s on the quick side (sometimes called a flutter), which can come from tension in the throat or jaw. Relax and let the breath do the work.'
       : ' That\'s right in the natural zone: a natural vibrato is often about 5 to 7 times a second.';
    if (wd > 100) v += ' It\'s quite wide; a narrower, gentler wave keeps the note clear.';
    out.push(v);
  } else out.push('No vibrato this time, which is fine: a straight tone is a skill too. A natural vibrato is often about 5 to 7 times a second, and usually shows up on its own once the voice is relaxed and well supported.');
  return out;
}

/**
 * Splits singing into notes: steady stretches (spread under 30 cents across 0.12 s) joined when
 * they're the same note, slides between notes left out. Gives [{ start, end, midi }].
 */
export function segmentNotes(frames, minDur = 0.15) {
  const groups = [];
  for (const run of voicedRuns(frames, 0.12, 3)) {
    let g = null;
    run.forEach((f, i) => {
      const near = [];
      for (let j = i; j >= 0 && f.t - run[j].t <= 0.06; j--) near.push(run[j].midi);
      for (let j = i + 1; j < run.length && run[j].t - f.t <= 0.06; j++) near.push(run[j].midi);
      const steady = near.length >= 3 && sd(near) < 0.3;
      if (!steady) { g = null; return; }
      if (g && Math.abs(f.midi - median(g.m)) < 0.6 && f.t - g.end < 0.15) { g.m.push(f.midi); g.end = f.t; }
      else { g = { start: f.t, end: f.t, m: [f.midi] }; groups.push(g); }
    });
  }
  // the same note broken by a wobble or a breath: join it back up
  const joined = [];
  for (const g of groups) {
    const prev = joined[joined.length - 1];
    if (prev && Math.abs(median(prev.m) - median(g.m)) < 0.6 && g.start - prev.end < 0.25) { prev.m.push(...g.m); prev.end = g.end; }
    else joined.push({ ...g, m: [...g.m] });
  }
  return joined.filter(g => g.end - g.start >= minDur).map(g => ({ start: g.start, end: g.end, midi: median(g.m) }));
}

/**
 * Singing back a short tune: each note's cents, and each jump between notes (an interval sung
 * right in a different octave or key still counts for the jump). Gives { notes, jumps, score }.
 */
export function scoreSingBack(frames, targets) {
  let segs = segmentNotes(frames);
  // more notes than asked for: join neighbours that are nearly the same, then keep the longest
  while (segs.length > targets.length) {
    let bi = -1, bd = Infinity;
    for (let i = 0; i + 1 < segs.length; i++) { const dd = Math.abs(segs[i].midi - segs[i + 1].midi); if (dd < bd) { bd = dd; bi = i; } }
    if (bd < 0.8) {
      const a = segs[bi], b = segs[bi + 1], wa = a.end - a.start, wb = b.end - b.start;
      segs.splice(bi, 2, { start: a.start, end: b.end, midi: (a.midi * wa + b.midi * wb) / ((wa + wb) || 1) });
    } else {
      let si = 0;
      segs.forEach((s, i) => { if (s.end - s.start < segs[si].end - segs[si].start) si = i; });
      segs.splice(si, 1);
    }
  }
  const octaves = segs.length ? foldOctave((segs[0].midi - targets[0]) * 100).octaves : 0;
  const notes = targets.map((target, i) => {
    const s = segs[i];
    return s ? { target, sung: s.midi, cents: (s.midi - target - 12 * octaves) * 100 } : { target, sung: null, cents: null };
  });
  const jumps = [];
  for (let i = 1; i < targets.length; i++) {
    const a = notes[i - 1], b = notes[i];
    jumps.push({ target: targets[i] - targets[i - 1], sung: a.sung !== null && b.sung !== null ? b.sung - a.sung : null,
                 cents: a.sung !== null && b.sung !== null ? ((b.sung - a.sung) - (targets[i] - targets[i - 1])) * 100 : null });
  }
  const pts = notes.map(n => n.cents === null ? 0 : clamp(1 - (Math.abs(n.cents) - 15) / 85, 0, 1));
  const jpts = jumps.map(j => j.cents === null ? 0 : clamp(1 - (Math.abs(j.cents) - 15) / 85, 0, 1));
  const score = Math.round(100 * (0.5 * mean(pts) + 0.5 * (jpts.length ? mean(jpts) : mean(pts))));
  return { notes, jumps, octaves, score };
}

export const INTERVAL_NAMES = ['unison', 'minor 2nd', 'major 2nd', 'minor 3rd', 'major 3rd', 'perfect 4th', 'tritone', 'perfect 5th', 'minor 6th', 'major 6th', 'minor 7th', 'major 7th', 'octave'];
export const intervalName = s => (s > 0 ? 'up a ' : s < 0 ? 'down a ' : '') + (INTERVAL_NAMES[Math.min(12, Math.abs(s))] || Math.abs(s) + ' semitones');

/** A seeded random number generator (so exercises can be tested), 0 to 1 */
export function seeded(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/** The notes a range allows: the saved range less a semitone of cushion at each end */
export const safeRange = range => ({ lo: range.low + 1, hi: range.high - 1 });

/**
 * The next note to match. Level 1 stays in the comfortable middle with small steps; each level
 * widens the area and the jumps. Never outside the safe range.
 */
export function nextMatchNote(level, range, prev, rand = Math.random) {
  const safe = safeRange(range);
  const area = level <= 2 ? { lo: range.tessLo, hi: range.tessHi } : level === 3 ? { lo: Math.max(safe.lo, range.tessLo - 2), hi: Math.min(safe.hi, range.tessHi + 2) } : safe;
  const maxJump = [0, 4, 7, 9, 12, 24][clamp(level, 1, 5)];
  let lo = area.lo, hi = Math.max(area.lo, area.hi);
  if (prev !== null && prev !== undefined) { lo = Math.max(lo, prev - maxJump); hi = Math.min(hi, prev + maxJump); }
  if (lo > hi) { lo = area.lo; hi = Math.max(area.lo, area.hi); }
  const choices = [];
  for (let m = lo; m <= hi; m++) if (m !== prev) choices.push(m);
  if (!choices.length) choices.push(lo);
  return choices[Math.floor(rand() * choices.length) % choices.length];
}

/** Level after a try: up after three good ones in a row (average 85+), down after two weak ones (under 50) */
export function adaptLevel(level, scores) {
  const last = (k) => scores.slice(-k);
  if (scores.length >= 3 && mean(last(3)) >= 85 && level < 5) return level + 1;
  if (scores.length >= 2 && Math.max(...last(2)) < 50 && level > 1) return level - 1;
  return level;
}

/** A short tune to sing back: 2 notes (levels 1 and 2) or 3 (from level 3), jumps growing with the level */
export function buildSingBack(level, range, rand = Math.random) {
  const safe = safeRange(range), count = level >= 3 ? 3 : 2;
  const steps = [[1, 2, 3, 4], [2, 3, 4, 5, 7], [2, 3, 4, 5, 7], [3, 4, 5, 7, 8, 9], [4, 5, 7, 9, 10, 12]][clamp(level, 1, 5) - 1];
  for (let tries = 0; tries < 50; tries++) {
    const notes = [nextMatchNote(Math.min(level, 2), range, null, rand)];
    for (let i = 1; i < count; i++) {
      const step = steps[Math.floor(rand() * steps.length) % steps.length] * (rand() < 0.5 ? -1 : 1);
      notes.push(notes[i - 1] + step);
    }
    if (notes.every(m => m >= safe.lo && m <= safe.hi)) return notes;
  }
  return [range.tessLo, Math.min(safe.hi, range.tessLo + 2)];
}

// ---- warm-ups

const pattern = (intervals, root, dur) => intervals.map((iv, i) => ({ midi: root + iv, at: i * dur, dur }));

/** Roots for a pattern climbing (or falling) by half steps, staying within lo..hi, at most `count` of them */
function roots(intervals, start, lo, hi, count, dir = 1) {
  const top = Math.max(...intervals), bottom = Math.min(...intervals), out = [];
  let r = start;
  while (r + bottom < lo) r++;
  while (r + top > hi && r + bottom > lo) r--;
  for (; out.length < count && r + bottom >= lo && r + top <= hi; r += dir) out.push(r);
  return out;
}
/**
 * A warm-up built for a range: hums, lip trills, sirens, arpeggios, a sustained note, and a gentle
 * cool-down. Every note stays inside the saved range (less a semitone each end), and the climbing
 * patterns stop a few semitones above the comfortable middle. length: 'short' (about 5 min) or 'full' (about 9).
 */
export function buildWarmup(range, length = 'short') {
  const full = length === 'full', safe = safeRange(range);
  const top = Math.min(safe.hi, range.tessHi + 3), mid = Math.round((range.tessLo + range.tessHi) / 2);
  const ex = [];
  const add = (id, name, sound, how, list) => { if (list.length) ex.push({ id, name, sound, how, patterns: list }); };
  const five = [7, 5, 4, 2, 0];
  add('hum', 'Gentle hum', 'mm',
    'Lips closed, teeth apart, a relaxed "mm" like you\'ve just tasted something good. Feel the buzz on your lips. Sing the five notes down, easily and quietly.',
    roots(five, Math.max(safe.lo, range.tessLo - 2), safe.lo, top, full ? 6 : 4).map(r => ({ notes: pattern(five, r, 0.6) })));
  const trill = [0, 2, 4, 5, 7, 5, 4, 2, 0];
  const up = roots(trill, Math.max(safe.lo, range.tessLo - 2), safe.lo, top, full ? 11 : 8);
  add('trill', 'Lip trills', 'brr',
    'Loose lips, blow so they flutter like a motorboat, and sing the scale up and down through the flutter. If your lips won\'t keep going, press gently on your cheeks with two fingers. A rolled "r" or a "v" works too.',
    [...up, ...(full ? up.slice(0, -1).reverse().slice(0, 4) : [])].map(r => ({ notes: pattern(trill, r, 0.4) })));
  const sLo = Math.max(safe.lo, range.tessLo - 3), sHi = Math.min(safe.hi, range.tessHi + 4);
  if (sHi - sLo >= 5) add('siren', 'Sirens', 'ng / oo',
    'On "ng" (the end of "sing") or a soft "oo", slide smoothly from low to high and back down, like a siren. Keep it light at the top, and let any flip or crack happen: sirens are how those smooth out.',
    Array.from({ length: full ? 4 : 3 }, () => ({ glide: { from: sLo, to: sHi, up: 2.5, down: 2.5 } })));
  let arp = [0, 4, 7, 12, 7, 4, 0];
  if (Math.min(top, safe.hi) - range.tessLo < 12) arp = [0, 4, 7, 4, 0];
  add('arpeggio', 'Arpeggios', 'ah',
    'An open, tall "ah" (as in "father"), notes of the chord up and back down. Let the top note be lighter, not louder: think of it as floating up and over.',
    roots(arp, Math.max(safe.lo, range.tessLo - 1), safe.lo, top, full ? 8 : 5).map(r => ({ notes: pattern(arp, r, 0.45) })));
  if (full) add('vowels', 'Vowel scale', 'mee may mah moh moo',
    'The same five-note scale, changing vowel on each note: mee, may, mah, moh, moo, and back. Keep the sound in the same place as the vowels change, as if they all ride on one stream of air.',
    roots(trill, range.tessLo, safe.lo, top, 6).map(r => ({ notes: pattern(trill, r, 0.4) })));
  const holds = [mid - 2, mid, mid + 2].filter(m => m >= safe.lo && m <= safe.hi);
  add('sustain', 'Long notes', 'ah',
    'Take a calm, low breath and hold each note on "ah" for the full bar. Aim for an even, steady sound from start to finish.',
    holds.map(m => ({ notes: [{ midi: m, at: 0, dur: full ? 5 : 4 }] })));
  add('cooldown', 'Cool-down', 'mm',
    'Back to an easy hum, five notes down, each pattern a little lower. Quiet and relaxed.',
    roots(five, Math.min(mid + 1, top - 7), safe.lo, top, full ? 5 : 3, -1).map(r => ({ notes: pattern(five, r, 0.6) })));
  return ex;
}

/** How long a pattern lasts, in seconds */
export const patternSeconds = p => p.glide ? p.glide.up + p.glide.down : Math.max(...p.notes.map(n => n.at + n.dur));

/** The target pitch of a siren at time t (seconds from its start) */
export const glideAt = (g, t) => t <= g.up ? g.from + (g.to - g.from) * t / g.up : g.to - (g.to - g.from) * Math.min(1, (t - g.up) / g.down);

/** About how long a warm-up takes in seconds: listen and sing each pattern (or sing along), plus a gap */
export function warmupSeconds(exercises, singAlong = false) {
  return exercises.reduce((s, e) => s + 10 + e.patterns.reduce((a, p) => a + patternSeconds(p) * (singAlong ? 1 : 2) + 1.2, 0), 0);
}

/**
 * Each note of a pattern against what was sung: the middle of each note's time (the first quarter is the
 * move onto it). frames: times from the pattern's start. Gives [{ midi, sung, cents }] (sung null: not heard).
 */
export function scoreNotes(frames, notes) {
  return notes.map(n => {
    const from = n.at + Math.min(0.15, n.dur * 0.25), to = n.at + n.dur - 0.03;
    const got = frames.filter(f => f.midi !== null && f.midi !== undefined && f.t >= from && f.t <= to).map(f => f.midi);
    if (got.length < 3) return { midi: n.midi, sung: null, cents: null };
    const sung = median(got), f = foldOctave((sung - n.midi) * 100);
    return { midi: n.midi, sung, cents: f.cents, octaves: f.octaves };
  });
}

/**
 * scoreNotes, forgiving a singer who comes in a little early or late (up to 0.1 s early or 0.3 s late):
 * the timing that hears the most notes, then the closest. Gives { notes, lag }.
 */
export function scorePattern(frames, notes) {
  let best = null;
  for (let lag = -0.1; lag <= 0.3001; lag += 0.025) {
    const shifted = frames.map(f => ({ t: f.t - lag, midi: f.midi })), s = scoreNotes(shifted, notes);
    // how well every frame inside each note's time sits on that note (a median alone can't tell timing apart)
    let err = 0;
    for (const n of notes)
      for (const f of shifted)
        if (f.midi !== null && f.midi !== undefined && f.t >= n.at && f.t <= n.at + n.dur) err += Math.min(100, Math.abs(foldOctave((f.midi - n.midi) * 100).cents));
    const rank = s.filter(n => n.cents !== null).length * 100000 - err - Math.abs(lag) * 200;
    if (!best || rank > best.rank) best = { rank, notes: s, lag };
  }
  return { notes: best.notes, lag: best.lag };
}

/** A siren: how much of the slide was covered, and the biggest sudden jump (a flip or crack) and where */
export function scoreSiren(frames, g) {
  const span = [Math.min(g.from, g.to), Math.max(g.from, g.to)], covered = new Set();
  let jump = 0, jumpAt = null, prev = null;
  for (const f of frames) {
    if (f.midi === null || f.midi === undefined) { if (prev && f.t - prev.t > 0.15) prev = null; continue; }
    if (f.midi >= span[0] - 0.5 && f.midi <= span[1] + 0.5) covered.add(Math.round(f.midi));
    if (prev && f.t - prev.t < 0.1) { const d = Math.abs(f.midi - prev.midi); if (d > jump) { jump = d; jumpAt = (f.midi + prev.midi) / 2; } }
    prev = f;
  }
  const want = span[1] - span[0] + 1;
  return { coverage: Math.min(1, covered.size / want), lowest: covered.size ? Math.min(...covered) : null, highest: covered.size ? Math.max(...covered) : null,
           jump, jumpAt: jump >= 2.5 ? Math.round(jumpAt) : null };
}

/** One exercise's feedback from its scored notes (all patterns), a few sentences */
export function notesFeedback(scored) {
  const heard = scored.filter(s => s.cents !== null);
  if (!heard.length) return ['I couldn\'t hear the notes this time. Lip trills and hums are quieter than open singing, so get a little closer to the microphone.'];
  const good = heard.filter(s => Math.abs(s.cents) <= 25).length, out = [];
  const pct = good / heard.length;
  out.push(pct >= 0.85 ? `Lovely: ${good} of ${heard.length} notes in tune.` : pct >= 0.6 ? `Good work: ${good} of ${heard.length} notes in tune.`
         : `${good} of ${heard.length} notes in tune. That's a starting point, and it improves fast with practice.`);
  if (heard.length < scored.length * 0.7) out.push(`Some notes didn't come through (${scored.length - heard.length} of ${scored.length}). Keep the sound going through the whole pattern.`);
  // high notes vs low notes: the commonest pattern is going flat on the top ones
  const sorted = [...heard].sort((a, b) => a.midi - b.midi), q = Math.max(1, Math.floor(sorted.length / 4));
  const topAvg = mean(sorted.slice(-q).map(s => s.cents)), lowAvg = mean(sorted.slice(0, q).map(s => s.cents)), all = mean(heard.map(s => s.cents));
  if (topAvg < -25 && topAvg < lowAvg - 15) out.push(`The top notes ran a little flat (about ${Math.round(-topAvg)} cents). That's very common: think of them as lighter and higher, not harder, and keep the air moving.`);
  else if (topAvg > 25 && topAvg > lowAvg + 15) out.push(`The top notes went a bit sharp (about ${Math.round(topAvg)} cents). Reaching too hard for a high note does that; aim for its middle, gently.`);
  else if (all < -20) out.push(`Overall you sat a little flat (about ${Math.round(-all)} cents). Picture each note slightly higher than you expect.`);
  else if (all > 20) out.push(`Overall you sat a little sharp (about ${Math.round(all)} cents). Relax into each note rather than pushing up to it.`);
  return out;
}

// ---- the best key for a song

export const KEY_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

/** "up 2 semitones (a whole step)" and so on */
export function shiftWords(s) {
  if (s === 0) return 'as written';
  const n = Math.abs(s), dir = s > 0 ? 'up' : 'down';
  const extra = n === 1 ? ' (a half step)' : n === 2 ? ' (a whole step)' : n === 12 ? ' (an octave)' : '';
  return `${dir} ${n} semitone${n > 1 ? 's' : ''}${extra}`;
}

/**
 * Keys for a song whose melody runs songLow..songHigh (MIDI), against a saved range: every shift
 * from an octave down to an octave up that fits, best first. Best = the melody stays in or near the
 * comfortable middle; a smaller move wins a tie. originalKey: 0 to 11 (C to B) or null.
 */
export function suggestKeys(songLow, songHigh, range, originalKey = null) {
  const lo = Math.min(songLow, songHigh), hi = Math.max(songLow, songHigh), out = [];
  for (let s = -12; s <= 12; s++) {
    const a = lo + s, b = hi + s, fits = a >= range.low && b <= range.high;
    const outside = Math.max(0, range.low - a) + Math.max(0, b - range.high);
    const strain = Math.max(0, b - range.tessHi) + Math.max(0, range.tessLo - a);
    const centre = Math.abs((a + b) / 2 - (range.tessLo + range.tessHi) / 2);
    out.push({ shift: s, low: a, high: b, fits, comfortable: fits && strain === 0, outside, strain,
               key: originalKey === null || originalKey === '' ? null : KEY_NAMES[(((+originalKey + s) % 12) + 12) % 12],
               rank: (fits ? 0 : 1000 + outside * 10) + strain * 3 + centre * 0.5 + Math.abs(s) * 0.15 });
  }
  return out.sort((x, y) => x.rank - y.rank);
}

/** A guitar capo that gives the same shift with the original chord shapes (shifts up only), or null */
export const capoFor = s => { const k = ((s % 12) + 12) % 12; return k >= 1 && k <= 7 ? k : null; };

// ---- progress

/** Days in a row with practice, counting back from today (or from yesterday, if today hasn't started yet). days: 'YYYY-MM-DD' strings */
export function streak(days, today) {
  const set = new Set(days), step = d => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() - 1); return x.toISOString().slice(0, 10); };
  let d = set.has(today) ? today : step(today), n = 0;
  while (set.has(d)) { n++; d = step(d); }
  return n;
}

/** A local date as 'YYYY-MM-DD' */
export const dayOf = date => { const d = new Date(date); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/** Checks an imported progress file; gives the cleaned data or throws a readable error */
export function validateImport(data) {
  if (!data || typeof data !== 'object' || data.app !== 'encore-voice') throw new Error('That isn\'t an Encore Voice progress file.');
  const history = Array.isArray(data.history) ? data.history.filter(h => h && typeof h.kind === 'string' && typeof h.t === 'string') : [];
  const range = data.range && Number.isFinite(data.range.low) && Number.isFinite(data.range.high) ? data.range : null;
  return { app: 'encore-voice', version: 1, range, history };
}
