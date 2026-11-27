// ENCORE. lo-fi sound: tape (wow, flutter, hiss, saturation, roll-off, dropouts),
// vinyl crackle, bit crush, low-pass and a beat-locked pump, plus small WAV helpers.
// Shared by Cassette and Chop. No DOM, no Web Audio: every effect is a streaming
// processor that runs the same in a page, an AudioWorklet and Node (test-cassette.mjs,
// test-chop.mjs), so what you hear while previewing is exactly what you export.

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const dbToGain = (db) => Math.pow(10, db / 20);
export const gainToDb = (g) => (g > 0 ? 20 * Math.log10(g) : -Infinity);

/** A small, fast seeded random generator (mulberry32). Returns 0..1. */
export function rng(seed = 1) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- biquad filters (RBJ cookbook), one state per channel

export function biquadCoeffs(type, fc, fs, q = Math.SQRT1_2, gainDb = 0) {
  const w = (2 * Math.PI * clamp(fc, 10, fs * 0.49)) / fs, cw = Math.cos(w), sw = Math.sin(w), al = sw / (2 * q);
  const A = Math.pow(10, gainDb / 40);
  let b0, b1, b2, a0, a1, a2;
  if (type === "lowpass") { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; }
  else if (type === "highpass") { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; }
  else if (type === "bandpass") { b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; }
  else { // peaking
    b0 = 1 + al * A; b1 = -2 * cw; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cw; a2 = 1 - al / A;
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}
export class Biquad {
  constructor(c = null) { this.c = c; this.x1 = this.x2 = this.y1 = this.y2 = 0; }
  set(c) { this.c = c; }
  reset() { this.x1 = this.x2 = this.y1 = this.y2 = 0; }
  step(x) {
    const c = this.c;
    if (!c) return x;
    const y = c.b0 * x + c.b1 * this.x1 + c.b2 * this.x2 - c.a1 * this.y1 - c.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = Math.abs(y) < 1e-20 ? 0 : y;
    return this.y1;
  }
}

/** A soft ceiling: untouched below `knee`, then bends smoothly so nothing passes `ceil`. */
export function softClip(x, knee = 0.89, ceil = 0.989) {
  const a = x < 0 ? -x : x;
  if (a <= knee) return x;
  const r = ceil - knee, y = knee + r * Math.tanh((a - knee) / r);
  return x < 0 ? -y : y;
}

// ---- tape

/** Tape sound settings from one "tape age" macro (0 = fresh tape, 1 = a worn copy of a copy). */
export function tapeSettings(age = 0.35) {
  const a = clamp(age, 0, 1);
  return {
    wowCents: 1.5 + 16 * a * a + 4 * a, wowHz: 0.55,
    flutterCents: 0.6 + 6 * a, flutterHz: 9,
    hissDb: -70 + 26 * a,              // -70 dBFS (clean deck) to -44 (noisy dub)
    saturation: 0.15 + 0.6 * a,
    rolloffHz: Math.round(17000 - 9500 * Math.sqrt(a)), // 17 kHz to 7.5 kHz
    dropouts: Math.round(10 * a * a * 10) / 10,         // per minute
    bump: 1 + 2 * a,                   // low "head bump" in dB, around 90 Hz
  };
}
export const TAPE_LIMITS = { wowCents: [0, 30], wowHz: [0.2, 3.5], flutterCents: [0, 12], flutterHz: [4, 20], hissDb: [-90, -36], saturation: [0, 1], rolloffHz: [3000, 20000], dropouts: [0, 20], bump: [0, 4] };
export function cleanTape(s = {}) {
  const d = tapeSettings(0.35), out = {};
  for (const k of Object.keys(TAPE_LIMITS)) { const v = Number.isFinite(+s[k]) ? +s[k] : d[k]; out[k] = clamp(v, TAPE_LIMITS[k][0], TAPE_LIMITS[k][1]); }
  return out;
}
/** Delay swing (seconds) that gives `cents` of pitch wobble at `hz`: pitch = 1 - d'(t), d' peaks at 2*pi*f*A */
export const wobbleDepth = (cents, hz) => (Math.pow(2, cents / 1200) - 1) / (2 * Math.PI * Math.max(0.05, hz));

/**
 * Streaming tape machine. process(inputs, outputs): arrays of equal-length Float32Arrays,
 * one per channel (outputs may be the inputs). State carries across calls, so a song can
 * be fed in any size of block with no seams. Output = input delayed by `latency` samples
 * (the wobble needs a little room on both sides); renderers trim that off.
 */
export class TapeProcessor {
  constructor(fs, channels = 2, settings = tapeSettings(), seed = 1) {
    this.fs = fs; this.ch = channels; this.seed = seed;
    this.size = 1 << Math.ceil(Math.log2(fs * 0.08));      // 80 ms ring
    this.mask = this.size - 1;
    this.ring = Array.from({ length: channels }, () => new Float32Array(this.size));
    this.reset();
    this.set(settings, true);
  }
  reset() {
    this.w = 0; this.n = 0;
    for (const r of this.ring) r.fill(0);
    this.r = rng(this.seed);
    this.wowPh = this.r() * 6.283; this.flPh = this.r() * 6.283; this.fl2Ph = this.r() * 6.283;
    this.drift = 0; this.driftT = 0; this.driftV = 0;
    this.lp = Array.from({ length: this.ch }, () => [new Biquad(), new Biquad()]);
    this.bumpF = Array.from({ length: this.ch }, () => new Biquad());
    this.hissHp = Array.from({ length: this.ch }, () => new Biquad());
    this.hissLp = Array.from({ length: this.ch }, () => new Biquad());
    this.drop = null; this.dropGain = 1;
    this.nextDrop = Infinity;
    if (this.s) this.set(this.s, true);
  }
  set(settings, jump = false) {
    const s = (this.s = cleanTape(settings)), fs = this.fs;
    this.aw = Math.min(wobbleDepth(s.wowCents, s.wowHz), 0.03) * fs;      // samples
    this.af = Math.min(wobbleDepth(s.flutterCents, s.flutterHz), 0.004) * fs;
    this.baseTarget = this.aw * 1.25 + this.af * 1.4 + 3;
    if (jump || this.base === undefined) this.base = this.baseTarget;
    const on = s.rolloffHz < fs * 0.45;
    const c1 = on ? biquadCoeffs("lowpass", s.rolloffHz, fs, 0.541) : null, c2 = on ? biquadCoeffs("lowpass", s.rolloffHz, fs, 1.307) : null;
    for (const [a, b] of this.lp) { a.set(c1); b.set(c2); }
    const cb = s.bump > 0.05 ? biquadCoeffs("peaking", 90, fs, 0.9, s.bump) : null;
    for (const f of this.bumpF) f.set(cb);
    const hh = biquadCoeffs("highpass", 900, fs, 0.6), hl = biquadCoeffs("lowpass", Math.min(s.rolloffHz * 1.3, fs * 0.45, 16000), fs, 0.7);
    for (let c = 0; c < this.ch; c++) { this.hissHp[c].set(hh); this.hissLp[c].set(hl); }
    // hiss level: measure the filtered noise once so the RMS lands on hissDb
    const hp = new Biquad(hh), lpf = new Biquad(hl), r = rng(99);
    let e = 0; const N = 8192;
    for (let i = 0; i < N + 512; i++) { const v = lpf.step(hp.step(r() * 2 - 1)); if (i >= 512) e += v * v; }
    this.hissGain = s.hissDb <= -89 ? 0 : dbToGain(s.hissDb) / Math.max(1e-6, Math.sqrt(e / N));
    // saturation: tanh blend, with a gentle trim so a louder drive doesn't just mean louder
    this.satK = 1.6; this.satT = Math.tanh(this.satK);
    this.satTrim = 1 / Math.sqrt(1 + s.saturation * (this.satK / this.satT - 1));
    this.scheduleDrop();
  }
  get latency() { return Math.round(this.base); }
  scheduleDrop() {
    const perMin = this.s.dropouts;
    this.nextDrop = perMin > 0 ? this.n + Math.round((-Math.log(1 - this.r() * 0.999) * 60 / perMin) * this.fs) : Infinity;
  }
  process(inputs, outputs = inputs) {
    const n = inputs[0].length, fs = this.fs, s = this.s, ch = this.ch, mask = this.mask;
    const wInc = (2 * Math.PI * s.wowHz) / fs, fInc = (2 * Math.PI * s.flutterHz) / fs, f2Inc = fInc * 2.37;
    const sat = s.saturation, k = this.satK, kt = this.satT, trim = this.satTrim;
    const driftStep = 1 / (fs * 0.7);
    for (let i = 0; i < n; i++) {
      // write
      const w = this.w;
      for (let c = 0; c < ch; c++) this.ring[c][w] = (inputs[c] || inputs[0])[i];
      // the wobble: wow (slow sine plus a slow random drift) and flutter (two faster sines)
      this.wowPh += wInc; if (this.wowPh > 6.2832) this.wowPh -= 6.2832;
      this.flPh += fInc; if (this.flPh > 6.2832) this.flPh -= 6.2832;
      this.fl2Ph += f2Inc; if (this.fl2Ph > 6.2832) this.fl2Ph -= 6.2832;
      this.driftT += driftStep;
      if (this.driftT >= 1) { this.driftT -= 1; this.driftV = this.r() * 2 - 1; }
      this.drift += (this.driftV - this.drift) * 0.00002;
      this.base += (this.baseTarget - this.base) * 0.00005;
      const d = this.base + this.aw * (0.8 * Math.sin(this.wowPh) + 0.45 * this.drift) + this.af * (Math.sin(this.flPh) * 0.75 + Math.sin(this.fl2Ph) * 0.3);
      const di = Math.floor(d), fr = d - di;
      // dropouts: the oxide thins for a moment (same on both channels)
      if (this.n >= this.nextDrop && !this.drop) {
        const len = Math.round((0.04 + this.r() * 0.2) * fs);
        this.drop = { at: this.n, len, depth: 0.3 + this.r() * 0.5 };
      }
      let g = 1;
      if (this.drop) {
        const p = (this.n - this.drop.at) / this.drop.len;
        if (p >= 1) { this.drop = null; this.scheduleDrop(); }
        else g = 1 - this.drop.depth * 0.5 * (1 - Math.cos(2 * Math.PI * p));
      }
      for (let c = 0; c < ch; c++) {
        const r = this.ring[c];
        // cubic (Hermite) read between samples
        const p0 = r[(w - di + 1) & mask], p1 = r[(w - di) & mask], p2 = r[(w - di - 1) & mask], p3 = r[(w - di - 2) & mask];
        const c1 = 0.5 * (p2 - p0), c2 = p0 - 2.5 * p1 + 2 * p2 - 0.5 * p3, c3 = 0.5 * (p3 - p0) + 1.5 * (p1 - p2);
        let x = ((c3 * fr + c2) * fr + c1) * fr + p1;
        if (sat > 0) x = (x + sat * (Math.tanh(k * x) / kt - x)) * trim;
        x = this.bumpF[c].step(x);
        const [a, b] = this.lp[c];
        x = b.step(a.step(x)) * g;
        if (this.hissGain) x += this.hissLp[c].step(this.hissHp[c].step(this.r() * 2 - 1)) * this.hissGain;
        outputs[c][i] = softClip(x);
      }
      this.w = (w + 1) & mask;
      this.n++;
    }
    return outputs;
  }
}

// ---- vinyl crackle

/** Streaming crackle: little clicks, now and then a pop, and a low surface rumble. amount 0..1 */
export class Crackle {
  constructor(fs, channels = 2, seed = 7) {
    this.fs = fs; this.ch = channels; this.r = rng(seed);
    this.amount = 0.4;
    this.env = new Float32Array(channels); this.sign = new Float32Array(channels);
    this.bp = Array.from({ length: channels }, () => new Biquad(biquadCoeffs("bandpass", 3200, fs, 0.8)));
    this.rum = Array.from({ length: channels }, () => new Biquad(biquadCoeffs("lowpass", 60, fs, 0.7)));
    this.dust = Array.from({ length: channels }, () => new Biquad(biquadCoeffs("highpass", 2500, fs, 0.7)));
    this.decay = Math.exp(-1 / (fs * 0.0006));
  }
  /** adds the crackle into the given buffers */
  process(bufs) {
    const a = this.amount;
    if (a <= 0) return bufs;
    const n = bufs[0].length, ch = this.ch, r = this.r;
    const rate = (2 + 18 * a) / this.fs;           // clicks per sample (about 2 to 20 a second)
    const level = 0.05 + 0.25 * a, rumble = 0.012 * a, hiss = dbToGain(-58 + 18 * a);
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < ch; c++) {
        if (r() < rate) {
          const big = r() < 0.06;
          this.env[c] = level * (big ? 2.2 : 0.25 + Math.pow(r(), 3)) * (0.5 + r());
          this.sign[c] = r() < 0.5 ? -1 : 1;
        }
        let v = this.env[c] * this.sign[c] * (0.6 + 0.4 * r());
        this.env[c] *= this.decay;
        v = this.bp[c].step(v) * 3;
        v += this.rum[c].step(r() * 2 - 1) * rumble * 6;
        v += this.dust[c].step(r() * 2 - 1) * hiss;
        bufs[c][i] += v;
      }
    }
    return bufs;
  }
}

// ---- bit crush and sample-rate reduction

/** bits 4..16 (16 = off), rate in Hz (0 or >= fs = off). Sample and hold with no filter: the grit is the point. */
export class Crusher {
  constructor(fs, channels = 2) { this.fs = fs; this.ch = channels; this.bits = 16; this.rate = 0; this.ph = 1; this.hold = new Float32Array(channels); }
  process(bufs) {
    const n = bufs[0].length, ch = this.ch;
    const doRate = this.rate > 0 && this.rate < this.fs * 0.99, step = doRate ? this.rate / this.fs : 1;
    const doBits = this.bits < 16, q = Math.pow(2, Math.round(clamp(this.bits, 2, 16)) - 1);
    if (!doRate && !doBits) return bufs;
    for (let i = 0; i < n; i++) {
      this.ph += step;
      const take = this.ph >= 1;
      if (take) this.ph -= Math.floor(this.ph);
      for (let c = 0; c < ch; c++) {
        if (take) { const x = bufs[c][i]; this.hold[c] = doBits ? Math.round(x * q) / q : x; }
        bufs[c][i] = this.hold[c];
      }
    }
    return bufs;
  }
}

// ---- beat pump (sidechain style)

/** Gain for a point in the beat: dips on the beat, recovers over `release` (fraction of a beat). */
export function pumpGain(phase, depth, release = 0.45) {
  if (depth <= 0) return 1;
  const p = phase - Math.floor(phase);
  const att = 0.02;
  let dip;
  if (p < att) dip = p / att;                       // a quick duck
  else { const q = Math.min(1, (p - att) / release); dip = 1 - q * q * (3 - 2 * q); }
  return 1 - clamp(depth, 0, 1) * 0.6 * dip;        // full depth = -8 dB on the beat
}

/**
 * The whole lo-fi chain for Chop: crush, tape, low-pass, pump, crackle, soft ceiling.
 * set({ crackle, tape, bits, rate, lowpass, pump, bpm }) and process(bufs, frame) where
 * frame is the sample number of bufs[0][0] counted from beat 1 (for the pump).
 */
export const LOFI_OFF = { crackle: 0, tape: 0, bits: 16, rate: 0, lowpass: 20000, pump: 0, bpm: 90 };
export function dust(amount) {
  const a = clamp(amount, 0, 1);
  return { crackle: 0.15 + 0.6 * a, tape: 0.1 + 0.5 * a, bits: a > 0.6 ? 10 : 12, rate: a > 0.15 ? Math.round(26040 - 10000 * a) : 0, lowpass: Math.round(11000 - 7000 * a), pump: 0.2 + 0.4 * a };
}
export class LofiChain {
  constructor(fs, channels = 2, seed = 3) {
    this.fs = fs; this.ch = channels;
    this.crusher = new Crusher(fs, channels);
    this.crackle = new Crackle(fs, channels, seed + 1);
    this.tape = new TapeProcessor(fs, channels, { ...tapeSettings(0), hissDb: -90, dropouts: 0 }, seed + 2);
    this.lp = Array.from({ length: channels }, () => [new Biquad(), new Biquad()]);
    this.set(LOFI_OFF);
  }
  set(p) {
    const s = (this.p = { ...LOFI_OFF, ...this.p, ...p });
    this.crusher.bits = s.bits; this.crusher.rate = s.rate;
    this.crackle.amount = s.crackle;
    this.tapeOn = s.tape > 0.001;
    if (this.tapeOn) { const t = tapeSettings(s.tape); this.tape.set({ ...t, hissDb: Math.min(t.hissDb, -60), dropouts: 0, rolloffHz: 20000 }); }
    const on = s.lowpass < this.fs * 0.45;
    const c1 = on ? biquadCoeffs("lowpass", s.lowpass, this.fs, 0.541) : null, c2 = on ? biquadCoeffs("lowpass", s.lowpass, this.fs, 1.307) : null;
    for (const [a, b] of this.lp) { a.set(c1); b.set(c2); }
    this.spb = (60 / clamp(s.bpm || 90, 30, 300)) * this.fs;
  }
  /** samples of delay the chain adds (the tape's wobble room) */
  get latency() { return this.tapeOn ? this.tape.latency : 0; }
  process(bufs, frame = 0) {
    const n = bufs[0].length, ch = this.ch, s = this.p;
    this.crusher.process(bufs);
    if (this.tapeOn) this.tape.process(bufs, bufs);
    for (let c = 0; c < ch; c++) {
      const [a, b] = this.lp[c], x = bufs[c];
      if (a.c) for (let i = 0; i < n; i++) x[i] = b.step(a.step(x[i]));
    }
    if (s.pump > 0) {
      for (let i = 0; i < n; i++) {
        const g = pumpGain((frame + i) / this.spb, s.pump);
        for (let c = 0; c < ch; c++) bufs[c][i] *= g;
      }
    }
    this.crackle.process(bufs);
    for (let c = 0; c < ch; c++) { const x = bufs[c]; for (let i = 0; i < n; i++) x[i] = softClip(x[i]); }
    return bufs;
  }
}

// ---- audio helpers

/** A quick linear resample (for previews; exports use convert-core's sinc resampler). */
export function resampleLinear(x, fsIn, fsOut) {
  if (fsIn === fsOut) return x;
  const n = Math.max(1, Math.round((x.length * fsOut) / fsIn)), out = new Float32Array(n), step = fsIn / fsOut;
  for (let i = 0; i < n; i++) {
    const p = i * step, j = Math.floor(p), f = p - j;
    const a = x[j] || 0, b = j + 1 < x.length ? x[j + 1] : a;
    out[i] = a + (b - a) * f;
  }
  return out;
}
export function peak(chans) {
  let p = 0;
  for (const c of chans) for (let i = 0; i < c.length; i++) { const a = c[i] < 0 ? -c[i] : c[i]; if (a > p) p = a; }
  return p;
}
/** 44-byte WAV header for n frames of PCM */
export function wavHeader(frames, fs, ch, bits) {
  const bps = bits / 8, data = frames * ch * bps, b = new ArrayBuffer(44), v = new DataView(b);
  const s = (o, t) => { for (let i = 0; i < 4; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  s(0, "RIFF"); v.setUint32(4, 36 + data, true); s(8, "WAVE"); s(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true); v.setUint32(24, fs, true);
  v.setUint32(28, fs * ch * bps, true); v.setUint16(32, ch * bps, true); v.setUint16(34, bits, true);
  s(36, "data"); v.setUint32(40, data, true);
  return new Uint8Array(b);
}
/** Interleaved PCM bytes (16 or 24 bit) for one block, with TPDF dither from `r` */
export function pcmBlock(chans, bits = 16, r = rng(12345)) {
  const n = chans[0].length, ch = chans.length, bps = bits / 8, out = new Uint8Array(n * ch * bps);
  const full = bits === 24 ? 8388607 : 32767;
  let o = 0;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) {
    let v = Math.round(clamp(chans[c][i], -1, 1) * full + (bits === 16 ? r() - r() : 0));
    v = clamp(v, -full - 1, full);
    out[o++] = v & 255; out[o++] = (v >> 8) & 255;
    if (bits === 24) out[o++] = (v >> 16) & 255;
  }
  return out;
}
/** A whole WAV file as bytes, from Float32 channels */
export function encodeWav(chans, fs, bits = 16) {
  const head = wavHeader(chans[0].length, fs, chans.length, bits), body = pcmBlock(chans, bits);
  const out = new Uint8Array(head.length + body.length);
  out.set(head); out.set(body, head.length);
  return out;
}
/** Reads a 16/24-bit PCM WAV back (for tests and reloads): { chans, fs } */
export function decodePcmWav(u8) {
  const v = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let o = 12, fs = 0, ch = 0, bits = 0;
  while (o + 8 <= u8.length) {
    const id = String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]), size = v.getUint32(o + 4, true);
    if (id === "fmt ") { ch = v.getUint16(o + 10, true); fs = v.getUint32(o + 12, true); bits = v.getUint16(o + 22, true); }
    if (id === "data") {
      const bps = bits / 8, n = Math.floor(Math.min(size, u8.length - o - 8) / (bps * ch));
      const chans = Array.from({ length: ch }, () => new Float32Array(n));
      let p = o + 8;
      for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++, p += bps) {
        chans[c][i] = bits === 16 ? v.getInt16(p, true) / 32768 : ((u8[p] | (u8[p + 1] << 8) | (u8[p + 2] << 16)) << 8 >> 8) / 8388608;
      }
      return { chans, fs };
    }
    o += 8 + size + (size & 1);
  }
  return null;
}
