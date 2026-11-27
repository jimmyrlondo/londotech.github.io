// ENCORE. Chip Guitar: guitar in, sound-chip voices out. No DOM, no Web Audio: the worklet,
// the file renderer and the Node tests all run this same code.
//
// Pitch tracking is a hybrid, written here from the published ideas (a fast period follower, plus a normalized-autocorrelation note detector in the style
// of McLeod's MPM):
//  - the fast follower matches the newest third of a period against the same stretch one period
//    back and takes the shortest period that fits, so it answers about 1.3 cycles after the pick;
//  - the detector checks how well the signal matches itself one period later, only using what
//    was played since the pick, and locks once it has two clean periods;
//  - "quantize amount" crossfades between the raw pitch (bends and all) and the nearest semitone.
import { Osc, Blip } from "./chip-synth.js";
import { CLOCK, FRAME_HZ, stepCycles, noiseCycles, dutyTable, midiToHz, hzToMidi, WAVES, waveShift } from "./chip-core.js";

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

export class PitchTracker {
  constructor(sr, { minHz = 60, maxHz = 1500 } = {}) {
    this.sr = sr;
    this.D = Math.max(1, Math.round(sr / 12000)); this.sd = sr / this.D;
    this.minLag = Math.max(2, Math.floor(this.sd / maxHz)); this.maxLag = Math.ceil(this.sd / minHz);
    this.Lmax = 2 * this.maxLag + 4;
    this.size = 1; while (this.size < this.Lmax * 2) this.size <<= 1;
    this.ring = new Float32Array(this.size); this.ri = 0;
    this.nsdf = new Float32Array(this.maxLag + 2); this.fol = new Float32Array(this.maxLag + 3);
    // decimation low-pass (biquad, 0.42 of the decimated Nyquist)
    const w = (2 * Math.PI * 0.21 * this.sd) / sr, q = 0.707, al = Math.sin(w) / (2 * q), c = Math.cos(w), a0 = 1 + al;
    this.bq = { b0: (1 - c) / 2 / a0, b1: (1 - c) / a0, b2: (1 - c) / 2 / a0, a1: (-2 * c) / a0, a2: (1 - al) / a0, x1: 0, x2: 0, y1: 0, y2: 0 };
    this.gate = 0.01; this.reset();
  }
  reset() {
    this.t = 0; this.dc = 0; this.dcx = 0;
    this.envF = 0; this.envS = 0; this.open = false; this.onsetT = -1e9; this.onsetIdx = 0; this.decN = 0; this.hop = 0;
    this.fastHz = 0; this.hz = 0; this.conf = 0; this.locked = false; this.onset = false;
    this.fastLatency = null; this.lockLatency = null; this.lockedSinceOnset = false; this.fastSinceOnset = false;
  }
  /** feed one sample; returns true on a new pick */
  push(x) {
    const sr = this.sr; let onset = false;
    // DC block
    const d = x - this.dcx + 0.995 * this.dc; this.dcx = x; this.dc = d; x = d;
    // envelopes (fast: 1 ms attack, 60 ms release; slow: 40 ms / 250 ms)
    const a = x < 0 ? -x : x;
    this.envF += (a - this.envF) * (a > this.envF ? 1 - Math.exp(-1 / (0.001 * sr)) : 1 - Math.exp(-1 / (0.06 * sr)));
    const prevS = this.envS;
    this.envS += (a - this.envS) * (a > this.envS ? 1 - Math.exp(-1 / (0.04 * sr)) : 1 - Math.exp(-1 / (0.25 * sr)));
    if (this.envF > this.gate && this.envF > 1.7 * prevS + this.gate * 0.2 && this.t - this.onsetT > 0.08 * sr) {
      onset = true; this.onsetT = this.t; this.onsetIdx = this.decN; this.open = true; this.fastHz = 0;
      this.lockedSinceOnset = false; this.fastSinceOnset = false; this.locked = false;
    }
    if (this.open && this.envF < this.gate * 0.5) { this.open = false; this.locked = false; this.conf = 0; }
    if (!this.open && this.envF > this.gate * 1.5) { this.open = true; this.onsetT = this.t; this.onsetIdx = this.decN; this.fastHz = 0; this.lockedSinceOnset = false; this.fastSinceOnset = false; }
    // decimate for the detector
    const b = this.bq, yo = b.b0 * x + b.b1 * b.x1 + b.b2 * b.x2 - b.a1 * b.y1 - b.a2 * b.y2;
    b.x2 = b.x1; b.x1 = x; b.y2 = b.y1; b.y1 = yo;
    if (this.t % this.D === 0) {
      this.ring[this.ri] = yo; this.ri = (this.ri + 1) & (this.size - 1); this.decN++;
      if (this.open && this.decN % 12 === 0) this.follow();
      if (++this.hop >= 24) { this.hop = 0; if (this.open) this.detect(); }
    }
    this.t++;
    this.onset = onset;
    return onset;
  }
  /**
   * The fast period follower: match the newest stretch of signal (a third of a period) against the
   * same stretch one period earlier, and take the shortest period that matches. It needs only about
   * 1.3 periods of the new note, so it answers before the full detector.
   */
  follow() {
    const avail = this.decN - this.onsetIdx, r = this.ring, m = this.size - 1, end = this.ri, f = this.fol;
    let prev = -1, prev2 = -1, found = 0;
    for (let tau = this.minLag; tau <= this.maxLag; tau++) {
      const W = Math.max(12, Math.ceil(0.35 * tau));
      if (tau + W + 1 > avail) break;
      let ac = 0, e = 0;
      for (let j = 1; j <= W; j++) { const p = r[(end - j) & m], q = r[(end - j - tau) & m]; ac += p * q; e += p * p + q * q; }
      const v = e > 0 ? (2 * ac) / e : 0;
      f[tau] = v;
      if (prev2 >= 0 && prev > 0.93 && prev >= v && prev >= f[tau - 2]) { found = tau - 1; break; }
      prev2 = prev; prev = v;
    }
    if (!found) return;
    const a = f[found - 1], b = f[found], c = f[found + 1], den = a - 2 * b + c, off = den ? clamp((0.5 * (a - c)) / den, -0.5, 0.5) : 0;
    const hz = this.sd / (found + off);
    if (hz < 55 || hz > 1600) return;
    this.fastHz = hz;
    if (!this.fastSinceOnset) { this.fastSinceOnset = true; this.fastLatency = ((this.t - this.onsetT) / this.sr) * 1000; this.firstFastHz = hz; }
  }
  /** normalized autocorrelation over what's been played since the pick (at most two of the longest periods) */
  detect() {
    const L = Math.min(this.Lmax, this.decN - this.onsetIdx), n = this.nsdf;
    if (L < 2 * this.minLag + 4) return;
    const tauMax = Math.min(this.maxLag, Math.floor(L / 2));
    const start = (this.ri - L + this.size) & (this.size - 1), r = this.ring, m = this.size - 1;
    let gmax = 0;
    for (let tau = 0; tau <= tauMax; tau++) {
      let ac = 0, en = 0;
      for (let j = 0; j < L - tau; j++) { const p = r[(start + j) & m], q = r[(start + j + tau) & m]; ac += p * q; en += p * p + q * q; }
      n[tau] = en > 0 ? (2 * ac) / en : 0;
    }
    // key maxima between positive-going and negative-going zero crossings
    const peaks = [];
    let tau = 1;
    while (tau < tauMax && n[tau] > 0) tau++;
    while (tau < tauMax) {
      while (tau < tauMax && n[tau] <= 0) tau++;
      let best = -1, bi = -1;
      while (tau < tauMax && n[tau] > 0) { if (n[tau] > best) { best = n[tau]; bi = tau; } tau++; }
      if (bi > 0 && bi >= this.minLag) { peaks.push(bi); if (best > gmax) gmax = best; }
    }
    if (!peaks.length) { this.conf *= 0.8; if (this.conf < 0.6) this.locked = false; return; }
    const pick = peaks.find((p) => n[p] >= 0.86 * gmax);
    // a peak right at the edge may still be rising: wait for more signal
    if (pick >= tauMax - 1) return;
    const a = n[pick - 1], b = n[pick], c = n[pick + 1], den = a - 2 * b + c;
    const off = den !== 0 ? clamp((0.5 * (a - c)) / den, -0.5, 0.5) : 0;
    const clarity = b - 0.25 * (a - c) * off;
    const hz = this.sd / (pick + off);
    this.conf = clamp(clarity, 0, 1);
    if (clarity < 0.6) this.locked = false; // lost it (noise, or the note fell apart)
    if (clarity > 0.8 && L >= 2 * (pick + 1)) {
      this.hz = hz; this.locked = true;
      if (!this.lockedSinceOnset) { this.lockedSinceOnset = true; this.lockLatency = ((this.t - this.onsetT) / this.sr) * 1000; }
    }
  }
}

// ---- chords for the arpeggiator
export const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] };
export const CHORDS = {
  off: { name: "Off", o: [0] }, key: { name: "In key (triad)", key: 3 }, key7: { name: "In key (7th)", key: 4 },
  maj: { name: "Major", o: [0, 4, 7] }, min: { name: "Minor", o: [0, 3, 7] }, pow: { name: "Power (5th)", o: [0, 7, 12] },
  oct: { name: "Octaves", o: [0, 12] }, maj7: { name: "Major 7", o: [0, 4, 7, 11] }, min7: { name: "Minor 7", o: [0, 3, 7, 10] }, sus4: { name: "Sus4", o: [0, 5, 7] },
};
/** the chord (semitones above the root) for a root note, in a key */
export function chordFor(root, type, key = 0, scale = "major") {
  const c = CHORDS[type] || CHORDS.off;
  if (!c.key) return c.o.slice();
  const sc = SCALES[scale] || SCALES.major, rel = (((root - key) % 12) + 12) % 12;
  let deg = sc.indexOf(rel);
  if (deg < 0) return c.key === 4 ? [0, 4, 7, 10] : [0, 4, 7]; // a note outside the key gets a major chord
  const out = [];
  for (let k = 0; k < c.key; k++) { const i = deg + 2 * k; out.push(sc[i % 7] + 12 * Math.floor(i / 7) - sc[deg]); }
  return out;
}
export function arpOrder(chord, pattern) {
  if (pattern === "down") return chord.slice().reverse();
  if (pattern === "updown") return chord.length > 2 ? chord.concat(chord.slice(1, -1).reverse()) : chord.slice();
  return chord.slice();
}

export const DEFAULTS = {
  quantize: 1, pitchSteps: true, octave: 0, gate: 0.01, dynamics: true, sens: 4,
  pulse: 1, pulseOct: 0, duty: 4, tri: 0, triOct: -1, wave: 0, waveOct: 0, waveShape: "organ", noise: 0, noiseMode: "attack", noiseShort: false,
  chord: "off", key: 0, scale: "major", pattern: "up", arpSpeed: 2, hold: false,
  vib: 0, vibRate: 6, bits: 16, rate: 0, dry: 0, volume: 0.8,
};
export const PRESETS = [
  { id: "lead", name: "Pulse lead", p: { pulse: 1, duty: 4, tri: 0, wave: 0, noise: 0.25, noiseMode: "attack", chord: "off", vib: 0.25, vibRate: 6, quantize: 1 } },
  { id: "arp", name: "Arp in key", p: { pulse: 1, duty: 2, tri: 0.6, triOct: -1, chord: "key", pattern: "up", arpSpeed: 2, quantize: 1, vib: 0 } },
  { id: "power", name: "Power arp", p: { pulse: 0.9, duty: 8, tri: 0.7, triOct: -1, chord: "pow", arpSpeed: 1, quantize: 1 } },
  { id: "bass", name: "Triangle bass", p: { pulse: 0, tri: 1, triOct: -1, wave: 0, noise: 0, chord: "off", octave: 0, quantize: 1 } },
  { id: "organ", name: "Wave organ", p: { pulse: 0, tri: 0, wave: 1, waveShape: "organ", waveOct: 0, chord: "off", vib: 0.12, vibRate: 5 } },
  { id: "crunch", name: "4-bit crunch", p: { pulse: 1, duty: 8, wave: 0.5, waveShape: "saw", bits: 4, rate: 11025, chord: "off" } },
  { id: "follow", name: "Smooth follow (no quantize)", p: { pulse: 1, duty: 8, quantize: 0, pitchSteps: false, chord: "off", vib: 0 } },
  { id: "hold", name: "Held chord", p: { pulse: 0.9, duty: 4, wave: 0.5, waveShape: "sine", chord: "key7", hold: true, arpSpeed: 3, pattern: "updown" } },
];

/**
 * The whole effect. process(input, outL, outR, n). Stats for the screen are in .meter().
 */
export class ChipGuitarFX {
  constructor(sr, params = {}) {
    this.sr = sr; this.tr = new PitchTracker(sr); this.p = { ...DEFAULTS, ...params };
    this.CT = Math.max(16, Math.round(sr / 1500)); // control updates about every 0.7 ms
    this.vo = {
      pulse: { osc: new Osc("2a03", "pulse"), blip: new Blip(this.CT + 4), chip: "2a03", kind: "pulse" },
      tri: { osc: new Osc("2a03", "triangle"), blip: new Blip(this.CT + 4), chip: "2a03", kind: "triangle" },
      wave: { osc: new Osc("dmg", "wave"), blip: new Blip(this.CT + 4), chip: "dmg", kind: "wave" },
      noise: { osc: new Osc("2a03", "noise"), blip: new Blip(this.CT + 4), chip: "2a03", kind: "noise" },
    };
    this.tmp = new Float32Array(this.CT); this.ctl = 0; this.frame = 0; this.frameAcc = 0;
    this.midi = 0; this.root = null; this.gateOn = false; this.held = false; this.noiseT = 1e9; this.vol = 0;
    this.hpX = 0; this.hpY = 0; this.holdV = 0; this.holdN = 0; this.inBuf = new Float32Array(this.CT); this.inN = 0;
    this.setParams(params);
  }
  setParams(p) {
    Object.assign(this.p, p);
    this.tr.gate = this.p.gate;
    const w = WAVES[this.p.waveShape] || WAVES.organ;
    this.vo.wave.osc.wave = w.slice();
    this.vo.noise.osc.short = !!this.p.noiseShort;
  }
  meter() {
    const t = this.tr, m = t.locked && t.hz ? hzToMidi(t.hz) : t.fastHz ? hzToMidi(t.fastHz) : null;
    return { hz: t.locked ? t.hz : t.fastHz, midi: m, conf: t.open ? t.conf : 0, locked: t.locked && t.open, open: t.open, level: t.envS, fastMs: t.fastLatency, lockMs: t.lockLatency, out: this.midi };
  }
  /** the note the voices play right now (before octave and arpeggio) */
  pitchNow() {
    const t = this.tr;
    let base;
    if (t.locked && t.hz) {
      base = hzToMidi(t.hz);
      // fold the fast follower into the detector's octave, then crossfade raw to quantized
      if (t.fastHz) { let f = hzToMidi(t.fastHz); while (f - base > 6) f -= 12; while (base - f > 6) f += 12; if (Math.abs(f - base) < 1) base = 0.5 * base + 0.5 * f; }
    } else if (t.fastHz) base = hzToMidi(t.fastHz);
    else return null;
    const q = clamp(this.p.quantize, 0, 1);
    return (1 - q) * base + q * Math.round(base);
  }
  control() {
    const p = this.p, t = this.tr;
    const was = this.gateOn;
    this.gateOn = t.open && (t.fastHz > 0 || t.locked);
    if (t.onset || (!was && this.gateOn)) { this.frame = 0; this.frameAcc = 0; this.noiseT = 0; this.held = false; }
    const pn = this.pitchNow();
    if (this.gateOn && pn != null) this.root = pn;
    // volume: follows how hard you play (in 16 steps), or stays full
    let vol = 0;
    if (this.gateOn) vol = p.dynamics ? clamp(Math.round(t.envS * p.sens * 15 * 2), 1, 15) : 15;
    else if (p.hold && this.root != null && p.chord !== "off") { vol = this.vol || 12; this.held = true; }
    this.vol = vol;
    const playing = vol > 0 && this.root != null;
    // arpeggio and vibrato step once per frame (60 Hz), like a sound driver
    const fr = Math.floor(this.frame);
    let semi = this.root ?? 60;
    if (p.chord !== "off" && this.root != null) {
      const ch = arpOrder(chordFor(Math.round(this.root), p.chord, p.key, p.scale), p.pattern);
      semi += ch[Math.floor(fr / Math.max(1, p.arpSpeed)) % ch.length];
    }
    if (p.vib > 0) semi += p.vib * Math.sin((2 * Math.PI * p.vibRate * fr) / FRAME_HZ);
    semi += 12 * p.octave;
    this.midi = semi;
    const set = (v, level, oct) => {
      const o = v.osc;
      if (!playing || level <= 0) { o.running = false; o.vol = 0; return; }
      const hz = midiToHz(semi + 12 * oct), sc = stepCycles(v.chip, v.kind, hz, !p.pitchSteps);
      o.period = sc.cyc; o.muted = !sc.ok; o.running = true; o.vol = vol; o.free = !p.pitchSteps;
    };
    set(this.vo.pulse, p.pulse, p.pulseOct); this.vo.pulse.osc.table = dutyTable("2a03", p.duty);
    set(this.vo.tri, p.tri, p.triOct); this.vo.tri.osc.triVol = 15;
    set(this.vo.wave, p.wave, p.waveOct); this.vo.wave.osc.shift = waveShift(vol); this.vo.wave.osc.waveVol = vol / 15;
    const n = this.vo.noise.osc;
    const noiseOn = p.noise > 0 && playing && (p.noiseMode === "follow" || this.noiseT < 0.05 * this.sr);
    if (noiseOn) {
      n.running = true; n.period = noiseCycles("2a03", clamp(Math.round((semi - 28) / 4), 0, 15));
      n.vol = p.noiseMode === "follow" ? vol : Math.max(0, Math.round(15 * (1 - this.noiseT / (0.05 * this.sr))));
    } else { n.running = false; n.vol = 0; }
    this.noiseT += this.CT;
    this.frameAcc += (this.CT / this.sr) * FRAME_HZ;
    if (this.frameAcc >= 1) { const k = Math.floor(this.frameAcc); this.frame += k; this.frameAcc -= k; }
  }
  runVoice(v, gain, n) {
    const o = v.osc, cps = CLOCK[v.chip] / this.sr, end = n * cps;
    let lv = o.level() * gain;
    if (lv !== o.last) { v.blip.add(0, lv - o.last); o.last = lv; }
    if (o.running && o.period > 0.25) {
      let pos = o.counter;
      while (pos < end) { o.clock(); lv = o.level() * gain; if (lv !== o.last) { v.blip.add(pos / cps, lv - o.last); o.last = lv; } pos += o.period; }
      o.counter = Math.max(0, pos - end);
    }
  }
  process(inp, outL, outR, n) {
    const p = this.p, CT = this.CT, tmp = this.tmp;
    for (let i0 = 0; i0 < n; i0 += CT) {
      const m = Math.min(CT, n - i0);
      for (let i = 0; i < m; i++) this.tr.push(inp[i0 + i]);
      this.control();
      for (let i = 0; i < m; i++) tmp[i] = 0;
      const mix = [["pulse", p.pulse * 0.022], ["tri", p.tri * 0.03], ["wave", p.wave * 0.024], ["noise", p.noise * 0.016]];
      for (const [k, g] of mix) {
        const v = this.vo[k];
        this.runVoice(v, g, m);
        v.blip.read(this.inBuf, 0, m);
        for (let i = 0; i < m; i++) tmp[i] += this.inBuf[i];
      }
      // DC block, then bit depth and sample-rate reduction (wet only), then the dry blend
      const levels = p.bits < 16 ? 2 ** (p.bits - 1) : 0, holdN = p.rate > 0 ? this.sr / p.rate : 0;
      for (let i = 0; i < m; i++) {
        let v = tmp[i];
        const y = v - this.hpX + 0.9995 * this.hpY; this.hpX = v; this.hpY = y; v = y;
        if (holdN) { if ((this.holdN += 1) >= holdN) { this.holdN -= holdN; this.holdV = v; } v = this.holdV; }
        if (levels) v = Math.round(v * levels) / levels;
        const o = (v * (1 - p.dry * 0.5) + inp[i0 + i] * p.dry) * p.volume * 2;
        outL[i0 + i] = o; outR[i0 + i] = o;
      }
    }
  }
}

/** run the effect over a whole recording (a file) and collect what the tracker did */
export function processBuffer(x, sr, params = {}, onProgress = null) {
  const fx = new ChipGuitarFX(sr, params), L = new Float32Array(x.length), R = new Float32Array(x.length);
  const B = 1024;
  for (let o = 0; o < x.length; o += B) {
    const n = Math.min(B, x.length - o);
    fx.process(x.subarray(o, o + n), L.subarray(o, o + n), R.subarray(o, o + n), n);
    if (onProgress && (o / B) % 128 === 0) onProgress(o / x.length);
  }
  return { L, R, fx };
}

/** a plucked string (Karplus-Strong): test signal for the tracker, and the page's built-in demo */
export function pluck(sr, hz, dur, { bright = 0.6, amp = 0.6, seed = 1 } = {}) {
  const n = Math.round(dur * sr), out = new Float32Array(n);
  // loop delay = N samples + half a sample (the averaging filter) + an all-pass for the fraction
  let N = Math.floor(sr / hz - 0.5), dAp = sr / hz - N - 0.5;
  if (dAp < 0.1) { N--; dAp += 1; }
  const c = (1 - dAp) / (1 + dAp);
  const line = new Float32Array(N);
  let s = seed >>> 0 || 1; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
  let prev = 0;
  for (let i = 0; i < N; i++) { const r = rnd(); prev = bright * r + (1 - bright) * prev; line[i] = prev * amp; }
  let ap = 0, lastIn = 0;
  let idx = 0, last = 0;
  for (let i = 0; i < n; i++) {
    const v = line[idx];
    const avg = 0.996 * 0.5 * (v + last); last = v;
    const y = c * avg + lastIn - c * ap; lastIn = avg; ap = y;
    line[idx] = y;
    out[i] = v;
    idx = (idx + 1) % N;
  }
  return out;
}
