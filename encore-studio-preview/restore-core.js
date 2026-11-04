// Encore Restore: the restoration chain. Every module is a streaming stage
// (push a chunk in, get restored audio out, flush at the end), so a 25-minute
// LP side at 96 kHz goes through a few seconds at a time and never has to sit
// in memory. Pure JS, no page in it: Node tests it (test-restore.mjs) and the
// worker runs it (restore-worker.js).
//
// The order matters:
//   1. rumble + DC       (the needle's low-frequency junk first)
//   2. channels          (line up cassette azimuth, then sum or pick for mono records)
//   3. de-click          (before anything smears the clicks)
//   4. de-hum
//   5. noise reduction   (learned on hiss that has had its clicks and hum taken out)
//   6. playback EQ       (optional 78 curve, air)
//   7. speed and wow     (last: resampling moves everything, so it goes after the repairs)
import { BiquadChain, butterworth, biquadCoefs, fftFor, hann, Resampler, FracDelay, sectionsResponse } from "./restore-dsp.js";
import { Declicker } from "./restore-declick.js";

// ---------- sources ----------
// Starting points for each kind of transfer. The analysis then turns modules
// on or off from what it actually hears.
export const SOURCES = [
  { id: "lp", name: "Vinyl LP / 45", blurb: "Clicks, crackle, some surface noise, maybe rumble or a warp" },
  { id: "78", name: "78 rpm shellac", blurb: "Loud crackle and hiss, often mono, speed rarely exactly 78" },
  { id: "cassette", name: "Cassette", blurb: "Tape hiss, wow, head alignment (azimuth), dropouts" },
  { id: "8track", name: "8-track", blurb: "Hiss, strong wow, dropouts, crosstalk" },
  { id: "reel", name: "Reel-to-reel", blurb: "Gentle hiss, speed drift, sometimes hum" },
  { id: "cd", name: "CD rip", blurb: "Usually clean. Checks speed and noise in case the master was off" },
  { id: "other", name: "Other", blurb: "Conservative settings, turn on what you need" },
];

export function defaultSettings(source = "lp") {
  const s = {
    source,
    rumble: { on: true, hz: 20, dc: true },
    channels: { on: false, mode: "stereo", alignOn: false, delay: 0, balanceOn: false, balanceDb: 0, flip: false },
    declick: { on: false, clicks: 50, crackle: 40, maxMs: 4 },
    dehum: { on: false, hz: 60, harmonics: [], width: 0.6 },
    denoise: { on: false, amount: 40, profile: null },
    eq: { on: false, curve: "none", turnover: 500, rolloff: 0, shelf: 50, riaaApplied: true, air: 0 },
    speed: { on: false, cents: 0, rpm: "none", a4: 440 },
    wow: { on: false, amount: 70, curve: null },   // conservative: the measurement is good, not perfect
  };
  const tape = source === "cassette" || source === "8track" || source === "reel";
  if (source === "lp") { s.declick.on = true; }
  if (source === "78") { s.rumble.hz = 40; s.declick = { on: true, clicks: 65, crackle: 60, maxMs: 4 }; s.denoise.amount = 55; s.channels.on = true; s.channels.mode = "sum"; }
  if (tape) { s.rumble.hz = 20; s.denoise.amount = source === "8track" ? 50 : 40; }
  if (source === "cd") { s.rumble.on = false; }
  return s;
}

// Manual speed fixes: the speed it was played at vs the speed it was cut at
export const RPM_FIXES = [
  { id: "none", name: "No speed change" },
  { id: "45at33", name: "A 45 played at 33⅓", from: 100 / 3, to: 45 },
  { id: "33at45", name: "An LP played at 45", from: 45, to: 100 / 3 },
  { id: "78at80", name: "Cut at 80, played at 78", from: 78, to: 80 },
  { id: "78at76", name: "Cut at 76, played at 78", from: 78, to: 76 },
  { id: "78at75", name: "Cut at 75, played at 78", from: 78, to: 75 },
  { id: "78at82", name: "Cut at 82, played at 78", from: 78, to: 82 },
  { id: "78at33", name: "A 78 played at 33⅓", from: 100 / 3, to: 78 },
  { id: "78at45", name: "A 78 played at 45", from: 45, to: 78 },
];
export const rpmCents = (id) => { const f = RPM_FIXES.find((r) => r.id === id); return f?.from ? 1200 * Math.log2(f.to / f.from) : 0; };

// 78 playback curves: bass turnover (Hz) and treble roll-off at 10 kHz (dB).
// These are the commonly published starting points; labels changed curves
// over the years, so trust your ears (and the label's era) over the table.
export const CURVES = [
  { id: "none", name: "None (flat)" },
  { id: "e500", name: "Electrical 78, 500 Hz turnover", turnover: 500, rolloff: 0 },
  { id: "e300", name: "Electrical 78, 300 Hz turnover", turnover: 300, rolloff: 0 },
  { id: "emi", name: "EMI / HMV (Blumlein), 250 Hz", turnover: 250, rolloff: 0 },
  { id: "aes", name: "AES (1951): 400 Hz, -12 dB", turnover: 400, rolloff: -12 },
  { id: "nab", name: "NAB / Columbia LP: 500 Hz, -16 dB", turnover: 500, rolloff: -16 },
  { id: "custom", name: "Custom" },
];

// ---------- stage 1: rumble and DC ----------
export class RumbleStage {
  constructor(fs, { hz = 20, dc = true, on = true } = {}) {
    // 24 dB/octave below `hz` (records and decks have nothing musical down there);
    // DC alone: a gentle 5 Hz first-order cut
    const sections = on && hz > 0 ? butterworth("hp", hz, fs, 4) : dc ? [dcBlock(fs)] : [];
    this.f = new BiquadChain(sections, 2);
    this.latency = 0;
  }
  push([l, r]) { this.f.process(0, l); this.f.process(1, r); return [l, r]; }
  flush() { return [new Float32Array(0), new Float32Array(0)]; }
}
function dcBlock(fs) { const R = Math.exp(-2 * Math.PI * 5 / fs); return [1, -1, 0, -R, 0]; } // y = x - x1 + R y1

// ---------- stage 2: channels ----------
// delay: how many samples the right channel arrives after the left (cassette
// azimuth); the left is held back to match. mode: stereo | sum | left | right.
export class ChannelStage {
  constructor(fs, { mode = "stereo", alignOn = false, delay = 0, balanceOn = false, balanceDb = 0, flip = false } = {}) {
    this.mode = mode; this.flip = flip;
    this.gL = balanceOn ? Math.pow(10, -balanceDb / 40) : 1;  // balanceDb: how much louder the left is
    this.gR = balanceOn ? Math.pow(10, balanceDb / 40) : 1;
    this.fd = alignOn && Math.abs(delay) > 0.01 ? new FracDelay([Math.max(0, delay), Math.max(0, -delay)]) : null;
  }
  push([l, r]) {
    if (this.fd) { this.fd.process(0, l); this.fd.process(1, r); }
    const n = l.length;
    for (let i = 0; i < n; i++) {
      let a = l[i] * this.gL, b = r[i] * this.gR * (this.flip ? -1 : 1);
      if (this.mode === "sum") { const m = 0.5 * (a + b); a = m; b = m; }
      else if (this.mode === "left") b = a;
      else if (this.mode === "right") a = b;
      l[i] = a; r[i] = b;
    }
    return [l, r];
  }
  flush() { return [new Float32Array(0), new Float32Array(0)]; }
}

// ---------- stage 3: de-click ----------
export class DeclickStage {
  constructor(fs, opts, linked) { this.d = new Declicker(fs, { ...opts, linked }); }
  push(ch) { return this.d.push(ch); }
  flush() { return this.d.flush(); }
  get events() { return this.d.events; }
}

// ---------- stage 4: de-hum ----------
// A narrow notch on the hum and each harmonic that was actually found. Narrow
// (0.6 Hz wide at 60 Hz by default), so a tuba note a semitone away is untouched.
export function humSections(fs, hz, harmonics, width = 0.6) {
  const out = [];
  for (const h of harmonics) {
    const f = hz * h;
    if (f >= 0.45 * fs) break;
    const bw = width * (1 + 0.05 * (h - 1)); // a touch wider up high, where drift is multiplied
    out.push(biquadCoefs("notch", f, fs, f / bw));
  }
  return out;
}
export class DehumStage {
  constructor(fs, { hz = 60, harmonics = [1, 2, 3, 4, 5], width = 0.6 } = {}) {
    this.f = new BiquadChain(humSections(fs, hz, harmonics, width), 2);
  }
  push([l, r]) { this.f.process(0, l); this.f.process(1, r); return [l, r]; }
  flush() { return [new Float32Array(0), new Float32Array(0)]; }
}

// ---------- stage 5: noise reduction ----------
// Spectral noise reduction (STFT, 75% overlap, both channels together so the
// stereo picture never wanders). Each frequency is turned down by how much of
// it is noise, judged against the learned noise profile. To avoid "birdies"
// (the twittering, underwater sound of cheap noise reduction) the decision
// for each frequency is smoothed over time (decision-directed estimate) and
// across neighbouring frequencies, and nothing is turned down further than
// the chosen amount: some hiss is always left, like a good engineer would.
export const nrFrame = (fs) => (fs <= 50000 ? 2048 : fs <= 100000 ? 4096 : 8192);
export const nrAmountToDb = (amount) => 3 + 0.18 * Math.max(0, Math.min(100, amount)); // 0: 3 dB, 40: 10.2 dB, 100: 21 dB

export class DenoiseStage {
  // profile: noise power per bin (N/2+1 values, left power + right power, Hann window)
  constructor(fs, { amount = 40, profile, keep = false } = {}) {
    this.N = profile ? (profile.length - 1) * 2 : nrFrame(fs);
    const N = this.N;
    this.H = N >> 2;
    this.win = hann(N);
    this.fft = fftFor(N);
    this.noise = profile ? Float64Array.from(profile) : new Float64Array(N / 2 + 1);
    this.floor = Math.pow(10, -nrAmountToDb(amount) / 20);
    this.over = 1 + 0.01 * Math.max(0, Math.min(100, amount)); // how firmly noise-level sound is judged noise
    this.bypass = !profile || keep; // keep: run the frames but change nothing (same delay, for comparisons)
    this.prevA = new Float64Array(N / 2 + 1);   // last frame's clean-power estimate / noise
    this.prevG = new Float64Array(N / 2 + 1).fill(1);
    this.inL = new Float64Array(N); this.inR = new Float64Array(N);
    this.outL = new Float64Array(N); this.outR = new Float64Array(N);
    this.fill = 0;           // samples waiting in the current hop
    this.hopL = new Float64Array(this.H); this.hopR = new Float64Array(this.H);
    this.skip = N - this.H;  // the first outputs are pre-history
    this.inTotal = 0; this.outTotal = 0;
    this.re = new Float64Array(N); this.im = new Float64Array(N);
    this.G = new Float64Array(N / 2 + 1);
    this.release = Math.pow(10, -15 * (this.H / fs / 0.1) / 20); // gains fall back at most 15 dB per 100 ms
  }

  frame() {
    const { N, H, win, re, im, noise, G } = this, half = N >> 1;
    // shift the newest hop into the analysis buffer
    this.inL.copyWithin(0, H); this.inR.copyWithin(0, H);
    this.inL.set(this.hopL, N - H); this.inR.set(this.hopR, N - H);
    for (let i = 0; i < N; i++) { re[i] = this.inL[i] * win[i]; im[i] = this.inR[i] * win[i]; }
    this.fft.forward(re, im);
    if (!this.bypass) {
      const alpha = 0.96, over = this.over, floor = this.floor;
      for (let k = 0; k <= half; k++) {
        const k2 = (N - k) % N;
        // left + right power at this frequency (one FFT carries both channels)
        const P = 0.5 * (re[k] * re[k] + im[k] * im[k] + re[k2] * re[k2] + im[k2] * im[k2]);
        const Nk = over * noise[k] + 1e-30;
        const gamma = P / Nk;
        const xi = Math.max(alpha * this.prevA[k] + (1 - alpha) * Math.max(gamma - 1, 0), 1e-4);
        G[k] = xi / (1 + xi);
      }
      // smooth across neighbouring frequencies (wider up high), keep the floor
      const S = this.smoothed ??= new Float64Array(half + 1);
      for (let k = 0; k <= half; k++) {
        const w = k < 32 ? 1 : k < 256 ? 2 : 3;
        let s = 0, c = 0;
        for (let j = Math.max(0, k - w); j <= Math.min(half, k + w); j++) { const wt = w + 1 - Math.abs(j - k); s += G[j] * wt; c += wt; }
        // never pull a strong, clearly-music bin down because its neighbours are noise
        S[k] = Math.max(floor, Math.max(s / c, G[k] > 0.9 ? G[k] : 0));
      }
      for (let k = 0; k <= half; k++) {
        // a gentle release: a gain falls back no faster than 15 dB per 100 ms (no pumping)
        const g = Math.max(S[k], this.prevG[k] * this.release);
        const k2 = (N - k) % N;
        const P = 0.5 * (re[k] * re[k] + im[k] * im[k] + re[k2] * re[k2] + im[k2] * im[k2]);
        this.prevA[k] = g * g * P / (this.over * noise[k] + 1e-30);
        this.prevG[k] = g;
        re[k] *= g; im[k] *= g;
        if (k2 !== k) { re[k2] *= g; im[k2] *= g; }
      }
    }
    this.fft.inverse(re, im);
    const norm = 1 / 1.5; // Hann x Hann at 75% overlap sums to 1.5
    this.outL.copyWithin(0, H); this.outR.copyWithin(0, H);
    this.outL.fill(0, N - H); this.outR.fill(0, N - H);
    for (let i = 0; i < N; i++) { this.outL[i] += re[i] * win[i] * norm; this.outR[i] += im[i] * win[i] * norm; }
  }

  // feed samples in; each full hop runs a frame, whose oldest hop of output is
  // then finished (the first N - H outputs are pre-history and dropped)
  run(l, r, oL, oR, o) {
    const H = this.H;
    for (let i = 0; i < l.length; i++) {
      this.hopL[this.fill] = l[i]; this.hopR[this.fill] = r[i];
      if (++this.fill === H) {
        this.fill = 0;
        this.frame();
        for (let j = 0; j < H; j++) {
          if (this.skip > 0) { this.skip--; continue; }
          oL[o] = this.outL[j]; oR[o] = this.outR[j]; o++;
        }
      }
    }
    return o;
  }
  push([l, r]) {
    this.inTotal += l.length;
    const cap = l.length + this.H, oL = new Float32Array(cap), oR = new Float32Array(cap);
    const n = this.run(l, r, oL, oR, 0);
    this.outTotal += n;
    return [oL.subarray(0, n), oR.subarray(0, n)];
  }
  flush() {
    const pad = new Float32Array(this.N + this.H), cap = pad.length + this.H, oL = new Float32Array(cap), oR = new Float32Array(cap);
    const n = Math.min(this.run(pad, pad, oL, oR, 0), this.inTotal - this.outTotal);
    this.outTotal += n;
    return [oL.subarray(0, n), oR.subarray(0, n)];
  }
}

// ---------- stage 6: playback EQ ----------
// First-order analog corners turned digital (bilinear transform, pre-warped at each corner)
function firstOrder(fz, fp, fs) {
  // H(s) = (1 + s/wz) / (1 + s/wp); fz or fp of 0 = that corner absent
  const K = 2 * fs;
  const wz = fz ? K * Math.tan(Math.PI * fz / fs) : 0, wp = fp ? K * Math.tan(Math.PI * fp / fs) : 0;
  // numerator 1 + s/wz -> (1 + K/wz) + (1 - K/wz) z^-1 ; denominator likewise
  const nb0 = wz ? 1 + K / wz : 1, nb1 = wz ? 1 - K / wz : 1, da0 = wp ? 1 + K / wp : 1, da1 = wp ? 1 - K / wp : 1;
  if (!wz && !wp) return null;
  if (!wz) return [1 / da0, 1 / da0, 0, da1 / da0, 0];       // pole only: (1 + z^-1) / ...
  return [nb0 / da0, nb1 / da0, 0, da1 / da0, 0];             // (always given a pole: a lone zero can't be built)
}
// The playback curve for a 78: bass boosted below the turnover (from `shelf` Hz
// down it levels off), treble cut by `rolloff` dB at 10 kHz. riaaApplied: the
// transfer went through a normal (RIAA) phono preamp, so that is undone first.
export function curveSections(fs, { turnover = 500, rolloff = 0, shelf = 50, riaaApplied = true } = {}) {
  const out = [];
  if (riaaApplied) {
    // inverse RIAA: zeros where RIAA has poles (50.05 Hz, 2122 Hz), a pole at its zero (500.5 Hz).
    // The rising treble (2122 Hz zero) is fitted numerically: a plain digital
    // version bends away from the analog curve near 10 kHz.
    out.push(firstOrder(50.05, 500.5, fs), fitRising(2122, fs));
  }
  if (turnover > 0) out.push(firstOrder(turnover, shelf || 1, fs)); // bass boost between shelf and turnover
  if (rolloff < 0 && fs > 20000) {
    // a single pole, placed so the digital filter is exactly the roll-off down at 10 kHz
    const t = Math.tan(Math.PI * 10000 / fs) / Math.sqrt(Math.pow(10, -rolloff / 10) - 1);
    out.push(firstOrder(0, fs / Math.PI * Math.atan(t), fs));
  }
  const s = out.filter(Boolean);
  // 0 dB at 1 kHz
  const g = sectionsResponse(s, 1000, fs);
  if (s.length && g > 0) { const [b0, b1, b2, a1, a2] = s[0]; s[0] = [b0 / g, b1 / g, b2 / g, a1, a2]; }
  return s;
}

// A first-order digital section fitted to the analog rise sqrt(1 + (f/fz)^2),
// 100 Hz to 16 kHz (or 0.42 fs), by a coarse-then-fine search of its pole and zero.
function fitRising(fz, fs) {
  const fr = []; for (let f = 100; f <= Math.min(16000, 0.42 * fs); f *= 1.15) fr.push(f);
  const want = fr.map((f) => 10 * Math.log10(1 + (f / fz) ** 2));
  const cw = fr.map((f) => [Math.cos(2 * Math.PI * f / fs), Math.sin(2 * Math.PI * f / fs)]);
  const err = (z, p) => {
    // |1 - z e^-jw| / |1 - p e^-jw|, gain matched at 100 Hz
    const m = cw.map(([c, sn]) => 10 * Math.log10(((1 - z * c) ** 2 + (z * sn) ** 2) / ((1 - p * c) ** 2 + (p * sn) ** 2)));
    let worst = 0; for (let i = 0; i < m.length; i++) worst = Math.max(worst, Math.abs(m[i] - m[0] - (want[i] - want[0])));
    return { worst, g0: m[0] };
  };
  let best = { worst: 1e9, z: 0, p: 0 };
  for (let step = 0.02, lo = [-0.98, -0.98], hi = [0.99, 0.95], round = 0; round < 3; round++, step /= 10) {
    for (let z = lo[0]; z <= hi[0]; z += step) for (let p = lo[1]; p <= hi[1]; p += step) {
      if (Math.abs(p) >= 0.999) continue;
      const e = err(z, p); if (e.worst < best.worst) best = { ...e, z, p };
    }
    lo = [best.z - 10 * step, best.p - 10 * step]; hi = [best.z + 10 * step, best.p + 10 * step];
  }
  // gain so 100 Hz matches the analog value there
  const g = Math.pow(10, (want[0] - best.g0) / 20);
  return [g, -g * best.z, 0, -best.p, 0];
}
export class EqStage {
  constructor(fs, eq) {
    const s = [];
    if (eq.curve && eq.curve !== "none") {
      const c = CURVES.find((x) => x.id === eq.curve);
      s.push(...curveSections(fs, { turnover: c?.turnover ?? eq.turnover, rolloff: c?.rolloff ?? eq.rolloff, shelf: eq.shelf, riaaApplied: eq.riaaApplied }));
    }
    if (eq.air > 0) s.push(biquadCoefs("highshelf", 9000, fs, 0.6, eq.air));
    this.f = new BiquadChain(s, 2);
  }
  push([l, r]) { this.f.process(0, l); this.f.process(1, r); return [l, r]; }
  flush() { return [new Float32Array(0), new Float32Array(0)]; }
}

// ---------- stage 7: speed and wow ----------
// cents: the fix for the whole recording (negative = lower and slower).
// wow: { rate (values per second), cents: Float32Array } the measured wobble
// over the input's time (positive = running fast there); `amount` 0..1 of it is undone.
export class SpeedStage {
  // offset: where in the recording this stage's first sample is (previews start mid-side)
  constructor(fs, { cents = 0, wow = null, amount = 1, offset = 0 } = {}) {
    const curve = wow?.cents, rate = wow?.rate || 1, n = curve?.length || 0;
    let maxDev = 0;
    if (curve) for (let i = 0; i < n; i++) maxDev = Math.max(maxDev, curve[i] * amount);
    const at = curve
      ? (pos) => {
        const t = (pos + offset) / fs * rate, i = Math.floor(t);
        if (i < 0) return curve[0];
        if (i >= n - 1) return curve[n - 1];
        return curve[i] + (t - i) * (curve[i + 1] - curve[i]);
      }
      : () => 0;
    // input samples per output sample: running fast (positive deviation) means read slower
    this.r = new Resampler((pos) => Math.pow(2, (cents - amount * at(pos)) / 1200), Math.pow(2, (cents + amount * maxDev) / 1200));
    this.ratio = Math.pow(2, cents / 1200);
  }
  push(ch) { return this.r.push(ch); }
  flush() { return this.r.flush(); }
}
// Where a moment of the original lands in the restored file (and back)
export const toRestoredTime = (t, cents) => t / Math.pow(2, cents / 1200);
export const toOriginalTime = (t, cents) => t * Math.pow(2, cents / 1200);

// ---------- the chain ----------
// settings: as defaultSettings(). Options:
//   off: modules to leave out of this run (for "what was removed": the chain
//        with and without them, subtracted)
//   keepDelays: build the de-clicker and noise reducer even when off (they then
//        change nothing but keep their delay), so both runs line up sample for sample
//   offset: the input sample this run starts at (previews start mid-side)
export function buildChain(fs, s, { off = [], keepDelays = false, offset = 0 } = {}) {
  const stages = [];
  const on = (m) => s[m]?.on && !off.includes(m);
  if (s.rumble.on || s.rumble.dc) stages.push(new RumbleStage(fs, s.rumble));
  const linked = s.channels.on && s.channels.mode !== "stereo";
  if (s.channels.on) stages.push(new ChannelStage(fs, s.channels));
  if (on("declick")) stages.push(new DeclickStage(fs, s.declick, linked));
  else if (keepDelays) stages.push(new DeclickStage(fs, { clicks: 0, crackle: 0 }, linked));
  if (on("dehum") && s.dehum.harmonics?.length) stages.push(new DehumStage(fs, s.dehum));
  if (on("denoise") && s.denoise.profile) stages.push(new DenoiseStage(fs, { amount: s.denoise.amount, profile: s.denoise.profile }));
  else if (keepDelays && s.denoise.profile) stages.push(new DenoiseStage(fs, { amount: 0, profile: s.denoise.profile, keep: true }));
  if (s.eq.on && (s.eq.curve !== "none" || s.eq.air > 0)) stages.push(new EqStage(fs, s.eq));
  const cents = speedCents(s);
  const wow = s.wow.on && s.wow.curve ? s.wow : null;
  if (Math.abs(cents) > 0.01 || wow) stages.push(new SpeedStage(fs, { cents, wow: wow?.curve, amount: (wow?.amount ?? 100) / 100, offset }));
  return new Chain(stages);
}
// the whole-recording speed fix in cents (manual RPM fix plus the tuning fix)
export function speedCents(s) {
  if (!s.speed.on) return 0;
  return rpmCents(s.speed.rpm) + (s.speed.cents || 0);
}

export class Chain {
  constructor(stages) { this.stages = stages; }
  push(l, r) {
    let ch = [Float32Array.from(l), Float32Array.from(r ?? l)];
    for (const st of this.stages) { ch = st.push(ch); if (!ch[0].length) return ch; }
    return ch;
  }
  flush() {
    // flush each stage in turn, feeding what comes out through the rest
    let parts = [[], []];
    for (let i = 0; i < this.stages.length; i++) {
      let ch = this.stages[i].flush();
      for (let j = i + 1; j < this.stages.length && ch[0].length; j++) ch = this.stages[j].push(ch);
      parts[0].push(ch[0]); parts[1].push(ch[1]);
    }
    return parts.map(join);
  }
  get clicks() { return this.stages.find((s) => s instanceof DeclickStage)?.events ?? []; }
}
export function join(parts) { const n = parts.reduce((a, p) => a + p.length, 0), out = new Float32Array(n); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; }

// Run arrays through a chain in chunks (tests and short previews)
export function runChain(chain, l, r, chunk = 65536) {
  const L = [], R = [];
  for (let i = 0; i < l.length; i += chunk) { const [a, b] = chain.push(l.subarray(i, i + chunk), (r ?? l).subarray(i, i + chunk)); L.push(a); R.push(b); }
  const [a, b] = chain.flush(); L.push(a); R.push(b);
  return [join(L), join(R)];
}

// ---------- loudness, streamed (BS.1770, for A/B at matched loudness) ----------
export class LufsMeter {
  constructor(fs) {
    // K-weighting, the same coefficients as master-core.js integratedLufs
    let K = Math.tan(Math.PI * 1681.974450955533 / fs);
    const Vh = Math.pow(10, 3.999843853973347 / 20), Vb = Math.pow(Vh, 0.4996667741545416), Q = 0.7071752369554196;
    let a0 = 1 + K / Q + K * K;
    const shelf = [(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0];
    K = Math.tan(Math.PI * 38.13547087602444 / fs);
    const Q2 = 0.5003270373238773;
    a0 = 1 + K / Q2 + K * K;
    this.f = new BiquadChain([shelf, [1, -2, 1, 2 * (K * K - 1) / a0, (1 - K / Q2 + K * K) / a0]], 2);
    this.hop = Math.round(0.1 * fs); this.acc = 0; this.n = 0; this.subs = [];
  }
  push(l, r) {
    const a = Float64Array.from(l), b = Float64Array.from(r);
    this.f.process(0, a); this.f.process(1, b);
    for (let i = 0; i < a.length; i++) {
      this.acc += a[i] * a[i] + b[i] * b[i];
      if (++this.n === this.hop) { this.subs.push(this.acc / this.hop); this.acc = 0; this.n = 0; }
    }
  }
  value() {
    const blocks = [];
    for (let i = 3; i < this.subs.length; i++) blocks.push(-0.691 + 10 * Math.log10((this.subs[i] + this.subs[i - 1] + this.subs[i - 2] + this.subs[i - 3]) / 4 + 1e-20));
    const mean = (arr) => -0.691 + 10 * Math.log10(arr.reduce((a, b) => a + Math.pow(10, (b + 0.691) / 10), 0) / Math.max(1, arr.length));
    const abs = blocks.filter((b) => b > -70);
    if (!abs.length) return -100;
    const rel = mean(abs) - 10;
    return mean(abs.filter((b) => b > rel));
  }
}
