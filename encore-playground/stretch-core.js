// ENCORE. Green Room: the shared time-stretch and pitch-shift engine (Practice, Slowed + Reverb).
// Pure JS, no DOM and no Web Audio, so it runs the same in an AudioWorklet, a Worker and Node.
//
// How it works, in short:
//  - A phase vocoder stretches time without touching pitch: FFT frames of about 43 ms, 75% overlap,
//    identity phase locking (bins near a spectral peak keep their phase relation to the peak, which
//    removes most of the "phasey" sound), a phase reset on detected drum hits (keeps them sharp), and
//    one shared phase track taken from the mid channel so the stereo image doesn't smear.
//  - Pitch shifting = stretch by the pitch ratio, then a windowed-sinc resampler plays it back faster
//    or slower. The resampler also converts the file's sample rate to the output's.
//  - With no stretch needed (vinyl-style speed changes, or normal speed) the phase vocoder is skipped
//    and only the resampler runs, so "vinyl" mode is exactly a varispeed tape.

// ---------------------------------------------------------------- FFT (radix 2, in place)
const fftTables = new Map();
function tablesFor(n) {
  let t = fftTables.get(n);
  if (t) return t;
  const bits = Math.round(Math.log2(n));
  if (1 << bits !== n) throw new Error("FFT size must be a power of two");
  const rev = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    let r = 0;
    for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
    rev[i] = r;
  }
  const cos = new Float64Array(n / 2), sin = new Float64Array(n / 2);
  for (let k = 0; k < n / 2; k++) { cos[k] = Math.cos((2 * Math.PI * k) / n); sin[k] = Math.sin((2 * Math.PI * k) / n); }
  t = { rev, cos, sin };
  fftTables.set(n, t);
  return t;
}

/** In-place complex FFT. inverse = true runs the unscaled inverse (divide by n yourself). */
export function fft(re, im, inverse = false) {
  const n = re.length, { rev, cos, sin } = tablesFor(n);
  for (let i = 0; i < n; i++) {
    const j = rev[i];
    if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  const sg = inverse ? -1 : 1;
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1, step = n / size;
    for (let i = 0; i < n; i += size) {
      for (let j = 0, k = 0; j < half; j++, k += step) {
        const a = i + j, b = a + half;
        const c = cos[k], s = sg * sin[k];
        const tr = re[b] * c + im[b] * s, ti = im[b] * c - re[b] * s;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
      }
    }
  }
}

const TWO_PI = 2 * Math.PI;
const wrapPhase = (p) => p - TWO_PI * Math.round(p / TWO_PI);

// ---------------------------------------------------------------- windowed-sinc resampler kernel
const TAPS_HALF = 24, PHASES = 256, XF = 256;
function besselI0(x) { let s = 1, t = 1; for (let k = 1; k < 30; k++) { t *= (x / (2 * k)) ** 2; s += t; } return s; }
const KAISER_BETA = 8, I0B = besselI0(KAISER_BETA);
function makeKernel(cutoff) {
  // rows: fractional offsets 0..PHASES (inclusive), cols: 2*TAPS_HALF taps (Kaiser-windowed sinc)
  const W = 2 * TAPS_HALF, k = new Float32Array((PHASES + 1) * W);
  for (let p = 0; p <= PHASES; p++) {
    const frac = p / PHASES;
    let sum = 0;
    for (let t = 0; t < W; t++) {
      const x = t - TAPS_HALF + 1 - frac;
      const ax = Math.abs(x);
      let v = 0;
      if (ax < TAPS_HALF) {
        const s = x === 0 ? 1 : Math.sin(Math.PI * cutoff * x) / (Math.PI * cutoff * x);
        const r = x / TAPS_HALF, w = besselI0(KAISER_BETA * Math.sqrt(Math.max(0, 1 - r * r))) / I0B;
        v = s * w;
      }
      k[p * W + t] = v; sum += v;
    }
    for (let t = 0; t < W; t++) k[p * W + t] /= sum;
  }
  return k;
}

// ---------------------------------------------------------------- the stretcher
/**
 * Streaming stretcher. Pull audio with process(read, outs, n), where
 * read(start, len, dsts) fills dsts[ch][0..len) with source samples from integer position `start`
 * (zeros outside the song). Positions are source samples.
 *   tempo: 0.5 = half speed. pitch: frequency ratio (2 = an octave up). ratio: srcRate / outRate.
 */
export class Stretcher {
  /**
   * fftSize: the short frame (2048 at 44.1/48 kHz). Two lanes share one frame clock: the lows use
   * frames twice as long (fine pitch resolution, so close bass and chord notes stay clean), the highs
   * use the short frames (drum hits stay sharp). They cross over around 1.1 to 1.8 kHz and share one
   * transient decision, so their phases stay consistent where they overlap.
   */
  constructor({ fftSize = 2048, channels = 2, split = true, overlap = 4 } = {}) {
    const Nh = fftSize, Nl = split ? fftSize * 2 : fftSize;
    this.N = Nl; this.Hs = Nh / overlap; this.C = channels;
    const k1 = Math.round((47 * Nh) / 2048), k2 = Math.round((77 * Nh) / 2048); // ~1.1 and ~1.8 kHz in short-frame bins
    const lowMask = (k, N) => { const f = (k * Nh) / N; return f <= k1 ? 1 : f >= k2 ? 0 : 0.5 + 0.5 * Math.cos((Math.PI * (f - k1)) / (k2 - k1)); };
    this.lanes = split ? [this.makeLane(Nl, (k) => lowMask(k, Nl)), this.makeLane(Nh, (k) => 1 - lowMask(k, Nh))] : [this.makeLane(Nh, () => 1)];
    this.frame = Array.from({ length: 2 }, () => new Float32Array(Nl));
    this.ola = Array.from({ length: 2 }, () => new Float64Array(Nl));
    this.cap = 1 << 15;
    this.fifo = Array.from({ length: 2 }, () => new Float32Array(this.cap));
    this.fpos = new Float64Array(this.cap);
    this.tmp = Array.from({ length: 2 }, () => new Float32Array(this.Hs));
    this.tempo = 1; this.pitch = 1; this.ratio = 1;
    this.cutoff = -1; this.kernel = null;
    this.prevFlux = 0;
    this.transients = 0;
    this.reset(0);
  }

  makeLane(N, maskOf) {
    const B = N / 2 + 1, win = new Float32Array(N), mask = new Float64Array(B);
    for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((TWO_PI * i) / N);
    let last = 0;
    for (let k = 0; k < B; k++) { mask[k] = maskOf(k); if (mask[k] > 0) last = k; }
    let first = 0; while (first < B && mask[first] === 0) first++;
    const f = () => new Float64Array(B);
    return { N, B, win, mask, first, last, olaScale: 1 / ((N / this.Hs) * 0.375), off: 0,
      re: new Float64Array(N), im: new Float64Array(N), mag: f(), prevMag: f(), phi: f(), prevPhi: f(), theta: f(),
      peaks: new Int32Array(B), Lr: f(), Li: f(), Rr: f(), Ri: f(), sumMag: 0, flux: 0 };
  }

  get alpha() { return this.pitch / this.tempo; }
  get step() { return this.pitch * this.ratio; }
  get bypass() { return Math.abs(this.alpha - 1) < 1e-6; }

  setRates({ tempo = this.tempo, pitch = this.pitch, ratio = this.ratio } = {}) {
    this.tempo = Math.max(0.05, tempo); this.pitch = Math.max(0.125, Math.min(8, pitch)); this.ratio = ratio;
    // the stretch range the vocoder handles cleanly
    const a = this.alpha;
    if (a < 0.25) this.tempo = this.pitch / 0.25;
    if (a > 8) this.tempo = this.pitch / 8;
    if (this.mode !== this.bypass) this.needReset = true;
  }

  /**
   * Start again from source position pos (a seek). smooth: crossfade from what was playing over
   * ~5 ms instead of jumping (the live player uses this, so seeks and loop edits never click).
   */
  reset(pos, smooth = false) {
    const N = this.N, Hs = this.Hs;
    if (smooth && this.lastRead && this.flen > 0) {
      // what would have played next (including any crossfade still running), to fade out from
      const t = [new Float32Array(XF), new Float32Array(XF)];
      this.render(this.lastRead, t, XF, 0);
      this.mixTail(t, 0, XF);
      this.tail = t; this.tailLeft = XF;
    } else this.tailLeft = 0;
    this.needReset = false;
    this.mode = this.bypass;
    for (const o of this.ola) o.fill(0);
    this.first = true;
    for (const ln of this.lanes) { ln.prevMag.fill(0); ln.off = (this.N - ln.N) / 2; }
    this.prevFlux = 0;
    // the resampler starts with TAPS_HALF samples of history (zeros)
    this.flen = TAPS_HALF;
    for (const f of this.fifo) f.fill(0, 0, TAPS_HALF);
    this.fpos.fill(pos, 0, TAPS_HALF);
    this.rp = TAPS_HALF - 1;
    this.emitPos = pos;
    if (this.mode) { this.srcPos = pos; this.drop = 0; }
    else {
      // start m frames early so the first output sample already has full overlap, then drop the lead-in
      const m = Math.ceil(N / (2 * Hs)) - 1;
      this.srcPos = pos - (m * Hs) / this.alpha;
      this.drop = m * Hs + N / 2;
    }
    this.lastCenter = null;
  }

  /** The source position of the next sample process() will output. */
  get position() { return this.fpos[Math.min(this.flen - 1, Math.max(0, Math.floor(this.rp + 1)))]; }

  push(chs, len, startPos, inc) {
    if (this.flen + len > this.cap) this.compact();
    if (this.flen + len > this.cap) {
      const cap = Math.max(this.cap * 2, this.flen + len);
      this.fifo = this.fifo.map((f) => { const g = new Float32Array(cap); g.set(f.subarray(0, this.flen)); return g; });
      const p = new Float64Array(cap); p.set(this.fpos.subarray(0, this.flen)); this.fpos = p; this.cap = cap;
    }
    for (let c = 0; c < 2; c++) this.fifo[c].set(chs[c].subarray(0, len), this.flen);
    for (let i = 0; i < len; i++) this.fpos[this.flen + i] = startPos + i * inc;
    this.flen += len;
  }

  compact() {
    const keep = Math.floor(this.rp) - TAPS_HALF;
    if (keep <= 0) return;
    for (const f of this.fifo) f.copyWithin(0, keep, this.flen);
    this.fpos.copyWithin(0, keep, this.flen);
    this.flen -= keep; this.rp -= keep;
  }

  /** Make one more hop of output in the FIFO. */
  hop(read) {
    const Hs = this.Hs;
    if (this.mode) {
      const p = Math.round(this.srcPos);
      read(p, Hs, this.tmp);
      if (this.C === 1) this.tmp[1].set(this.tmp[0]);
      this.push(this.tmp, Hs, p, 1);
      this.srcPos = p + Hs;
      return;
    }
    const N = this.N, a = this.alpha;
    const center = Math.round(this.srcPos);
    read(center - N / 2, N, this.frame);
    const Ha = this.lastCenter === null ? Hs / a : center - this.lastCenter;
    for (const ln of this.lanes) this.analyze(ln);
    // a drum hit: a sudden rise in the highs' spectral energy. Reset phases there (in both lanes, so
    // they stay in step) and the hit stays sharp.
    const hi = this.lanes[this.lanes.length - 1];
    const fluxRatio = hi.sumMag > 1e-9 ? hi.flux / hi.sumMag : 0;
    const onset = !this.first && fluxRatio > 0.45 && fluxRatio > this.prevFlux * 1.5 && hi.sumMag > 1e-3;
    this.prevFlux = fluxRatio;
    if (onset) this.transients++;
    for (const ln of this.lanes) this.synth(ln, this.first || onset || Ha <= 0, Ha);
    // the first Hs samples are complete
    let start = 0;
    if (this.drop > 0) start = Math.min(Hs, this.drop);
    const len = Hs - start;
    if (len > 0) {
      for (let c = 0; c < 2; c++) { const o = this.ola[c], t = this.tmp[c]; for (let i = 0; i < len; i++) t[i] = o[start + i]; }
      this.push(this.tmp, len, this.emitPos, 1 / a);
      this.emitPos += len / a;
    }
    this.drop -= start;
    for (const o of this.ola) { o.copyWithin(0, Hs); o.fill(0, N - Hs); }
    this.first = false;
    this.lastCenter = center;
    this.srcPos += Hs / a;
  }

  /** FFT one lane's window of the current frame (both channels in one transform) and its mid. */
  analyze(ln) {
    const { N, B, win, re, im, mag, phi, prevMag, Lr, Li, Rr, Ri, off } = ln;
    const L = this.frame[0], R = this.C === 1 ? this.frame[0] : this.frame[1];
    for (let i = 0; i < N; i++) { re[i] = L[off + i] * win[i]; im[i] = R[off + i] * win[i]; }
    fft(re, im, false);
    let sumMag = 0, flux = 0;
    for (let k = 0; k < B; k++) {
      const j = k === 0 ? 0 : N - k;
      const ar = re[k], ai = im[k], br = re[j], bi = im[j];
      const lr = (ar + br) / 2, li = (ai - bi) / 2, rr = (ai + bi) / 2, ri = (br - ar) / 2;
      Lr[k] = lr; Li[k] = li; Rr[k] = rr; Ri[k] = ri;
      const mr = (lr + rr) / 2, mi = (li + ri) / 2;
      const m = Math.hypot(mr, mi);
      mag[k] = m; phi[k] = Math.atan2(mi, mr);
      sumMag += m; const d = m - prevMag[k]; if (d > 0) flux += d;
    }
    ln.sumMag = sumMag; ln.flux = flux;
  }

  /** New phases for one lane (identity phase locking), then back to audio into the shared overlap-add. */
  synth(ln, resetPhase, Ha) {
    const { N, B, win, re, im, mag, phi, prevPhi, theta, prevMag, peaks, Lr, Li, Rr, Ri, mask, off } = ln, Hs = this.Hs, half = N / 2;
    if (resetPhase) for (let k = 0; k < B; k++) theta[k] = phi[k];
    else {
      let np = 0;
      for (let k = 0; k < B; k++) {
        const m = mag[k];
        if ((k < 1 || m > mag[k - 1]) && (k < 2 || m >= mag[k - 2]) && (k > B - 2 || m >= mag[k + 1]) && (k > B - 3 || m >= mag[k + 2])) peaks[np++] = k;
      }
      // advance each peak by its true frequency, lock the bins around it to it
      for (let q = 0; q < np; q++) {
        const k = peaks[q];
        const omega = (TWO_PI * k) / N;
        const dev = wrapPhase(phi[k] - prevPhi[k] - omega * Ha);
        theta[k] = wrapPhase(theta[k] + (omega + dev / Ha) * Hs);
      }
      let q = 0;
      for (let k = 0; k < B; k++) {
        while (q < np - 1 && Math.abs(peaks[q + 1] - k) < Math.abs(peaks[q] - k)) q++;
        const p = np ? peaks[q] : k;
        if (p !== k) theta[k] = theta[p] + phi[k] - phi[p];
      }
    }
    for (let k = 0; k < B; k++) { prevPhi[k] = phi[k]; prevMag[k] = mag[k]; }
    // rotate both channels by the same amount (keeps their phase difference, so the stereo image holds)
    re.fill(0); im.fill(0);
    for (let k = ln.first; k <= ln.last; k++) {
      let ur, ui;
      const g = mask[k];
      if (mag[k] > 1e-12) {
        const ct = Math.cos(theta[k]), st = Math.sin(theta[k]);
        const mr = Math.cos(phi[k]), mi = Math.sin(phi[k]);
        ur = (ct * mr + st * mi) * g; ui = (st * mr - ct * mi) * g; // e^{i theta} * conj(e^{i phi}) * mask
      } else { ur = Math.cos(theta[k]) * g; ui = Math.sin(theta[k]) * g; }
      const ylr = Lr[k] * ur - Li[k] * ui, yli = Lr[k] * ui + Li[k] * ur;
      const yrr = Rr[k] * ur - Ri[k] * ui, yri = Rr[k] * ui + Ri[k] * ur;
      if (k === 0 || k === half) { re[k] = ylr; im[k] = yrr; }
      else {
        re[k] = ylr - yri; im[k] = yli + yrr;
        re[N - k] = ylr + yri; im[N - k] = yrr - yli;
      }
    }
    fft(re, im, true);
    const sc = ln.olaScale / N, ol = this.ola[0], orr = this.ola[1];
    for (let i = 0; i < N; i++) { const w = win[i] * sc; ol[off + i] += re[i] * w; orr[off + i] += im[i] * w; }
  }

  /** Fill outs[0..1][off..off+n) with output samples. */
  process(read, outs, n, off = 0) {
    if (this.needReset) this.reset(this.position, true);
    this.lastRead = read;
    this.render(read, outs, n, off);
    this.mixTail(outs, off, n);
  }

  mixTail(outs, off, n) {
    if (this.tailLeft > 0) {
      const o0 = outs[0], o1 = outs[1] || null, m = Math.min(n, this.tailLeft);
      for (let i = 0; i < m; i++) {
        const k = XF - this.tailLeft + i, g = 0.5 - 0.5 * Math.cos((Math.PI * k) / XF);
        o0[off + i] = o0[off + i] * g + this.tail[0][k] * (1 - g);
        if (o1) o1[off + i] = o1[off + i] * g + this.tail[1][k] * (1 - g);
      }
      this.tailLeft -= m;
    }
  }

  render(read, outs, n, off) {
    const step = this.step;
    const cutoff = Math.min(1, 1 / step) * 0.92;
    if (Math.abs(cutoff - this.cutoff) > 1e-4) { this.cutoff = cutoff; this.kernel = makeKernel(cutoff); }
    const need = () => Math.floor(this.rp + n * step) + TAPS_HALF + 2;
    while (this.flen < need()) this.hop(read);
    const K = this.kernel, W = 2 * TAPS_HALF, f0 = this.fifo[0], f1 = this.fifo[1];
    const o0 = outs[0], o1 = outs[1] || null;
    let rp = this.rp;
    const exact = step === 1 && rp === Math.floor(rp);
    for (let i = 0; i < n; i++) {
      rp += step;
      const ip = Math.floor(rp), frac = rp - ip;
      if (exact) { o0[off + i] = f0[ip]; if (o1) o1[off + i] = f1[ip]; continue; }
      const pf = frac * PHASES, p = Math.floor(pf), t = pf - p;
      const r0 = p * W, r1 = r0 + W, base = ip - TAPS_HALF + 1;
      let s0 = 0, s1 = 0;
      for (let k = 0; k < W; k++) {
        const w = K[r0 + k] + (K[r1 + k] - K[r0 + k]) * t;
        s0 += f0[base + k] * w; s1 += f1[base + k] * w;
      }
      o0[off + i] = s0; if (o1) o1[off + i] = s1;
    }
    this.rp = rp;
    if (this.rp > this.cap / 2) this.compact();
  }
}

/** FFT size for a sample rate: about 43 ms (2048 at 44.1/48 kHz, 4096 at 88.2/96 kHz). */
export const fftSizeFor = (fs) => (fs > 64000 ? (fs > 128000 ? 8192 : 4096) : 2048);

// ---------------------------------------------------------------- reading the song, with loops
/**
 * Reads a decoded song (Float32 channels) at "virtual" positions. With a seamless loop on, positions
 * past B carry on from A, and the last few ms before B are crossfaded with the audio just before A, so
 * the loop point never clicks. With a gap (rest between loops) the song fades to silence at B instead.
 */
export class SongReader {
  constructor(chans, fs) {
    this.chans = chans.length >= 2 ? [chans[0], chans[1]] : [chans[0], chans[0]];
    this.len = chans[0].length; this.fs = fs;
    this.on = false; this.a = 0; this.b = this.len; this.gap = false; this.x = 0;
    this.read = this.read.bind(this);
  }
  setLoop(a, b, on, gap = false) {
    a = Math.max(0, Math.min(this.len, Math.round(a))); b = Math.max(0, Math.min(this.len, Math.round(b)));
    if (b < a) [a, b] = [b, a];
    this.on = !!on && b - a >= 0.05 * this.fs; this.a = a; this.b = b; this.gap = !!gap;
    this.x = Math.min(Math.round(0.012 * this.fs), Math.floor((b - a) / 4));
  }
  /** virtual position -> real song position */
  real(v) {
    if (!this.on || this.gap || v < this.b) return v;
    const L = this.b - this.a;
    return this.a + ((v - this.b) % L + L) % L;
  }
  read(start, len, dsts) {
    const [s0, s1] = this.chans, n = this.len, { a, b, x } = this;
    const d0 = dsts[0], d1 = dsts[1];
    for (let i = 0; i < len; i++) {
      const v = start + i;
      let r = this.real(v), l = 0, rr = 0;
      if (r >= 0 && r < n) { l = s0[r]; rr = s1[r]; }
      if (this.on && x > 0 && r >= b - x && r < b) {
        const t = (r - (b - x) + 0.5) / x;
        if (this.gap) { const g = Math.cos((t * Math.PI) / 2); l *= g; rr *= g; }
        else {
          const g0 = Math.cos((t * Math.PI) / 2), g1 = Math.sin((t * Math.PI) / 2), q = a - (b - r);
          const ql = q >= 0 ? s0[q] : 0, qr = q >= 0 ? s1[q] : 0;
          l = l * g0 + ql * g1; rr = rr * g0 + qr * g1;
        }
      } else if (this.on && this.gap && r >= b) { l = 0; rr = 0; }
      d0[i] = l; if (d1) d1[i] = rr;
    }
  }
}

// ---------------------------------------------------------------- filters for the player
/** RBJ biquad, one per channel. */
export class Biquad {
  constructor() { this.b0 = 1; this.b1 = 0; this.b2 = 0; this.a1 = 0; this.a2 = 0; this.z = [[0, 0], [0, 0]]; }
  set(type, f, q, gainDb, fs) {
    const w = (TWO_PI * Math.min(f, fs * 0.49)) / fs, cw = Math.cos(w), sw = Math.sin(w), al = sw / (2 * q), A = Math.pow(10, gainDb / 40);
    let b0, b1, b2, a0, a1, a2;
    if (type === "lowpass") { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; }
    else if (type === "highpass") { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; }
    else if (type === "bandpass") { b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; }
    else if (type === "peak") { b0 = 1 + al * A; b1 = -2 * cw; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cw; a2 = 1 - al / A; }
    else if (type === "lowshelf" || type === "highshelf") {
      const s = type === "lowshelf" ? 1 : -1, sq = 2 * Math.sqrt(A) * al;
      b0 = A * ((A + 1) - s * (A - 1) * cw + sq); b1 = s * 2 * A * ((A - 1) - s * (A + 1) * cw); b2 = A * ((A + 1) - s * (A - 1) * cw - sq);
      a0 = (A + 1) + s * (A - 1) * cw + sq; a1 = -s * 2 * ((A - 1) + s * (A + 1) * cw); a2 = (A + 1) + s * (A - 1) * cw - sq;
    } else { b0 = 1; b1 = 0; b2 = 0; a0 = 1; a1 = 0; a2 = 0; }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
    return this;
  }
  /** process x in place, channel c (0/1) */
  run(x, c = 0, off = 0, n = x.length - off) {
    const z = this.z[c], { b0, b1, b2, a1, a2 } = this;
    let z1 = z[0], z2 = z[1];
    for (let i = off; i < off + n; i++) {
      const v = x[i], y = b0 * v + z1;
      z1 = b1 * v - a1 * y + z2; z2 = b2 * v - a2 * y;
      x[i] = y;
    }
    z[0] = Math.abs(z1) < 1e-25 ? 0 : z1; z[1] = Math.abs(z2) < 1e-25 ? 0 : z2;
  }
}

/**
 * Practice sound tools on the output: vocal reduce (takes out what's in the middle of the stereo
 * image, except below about 150 Hz, so bass and kick stay) and focus EQs.
 *   vocal: 0..1 amount. focus: "off" | "bass" | "vocal" | "guitar".
 * Vocal reduce is out = in - g * (mid - lowpass(mid)): with g = 1 that is side + the mid's lows, so a
 * centred voice cancels exactly (no filter phase left over in the voice's range).
 */
export class PlayerFx {
  constructor(fs) {
    this.fs = fs; this.vocal = 0; this.focus = "off";
    this.lp = new Biquad().set("lowpass", 150, 0.707, 0, fs); this.lp2 = new Biquad().set("lowpass", 150, 0.707, 0, fs);
    this.eq = [];
    this.mid = new Float32Array(128); this.low = new Float32Array(128);
  }
  set({ vocal = this.vocal, focus = this.focus } = {}) {
    this.vocal = Math.max(0, Math.min(1, vocal));
    if (focus !== this.focus) {
      this.focus = focus;
      const fs = this.fs, mk = (...a) => [new Biquad().set(...a, fs), new Biquad().set(...a, fs)];
      this.eq = focus === "bass" ? [mk("lowshelf", 220, 0.707, 9), mk("highshelf", 1200, 0.707, -14), mk("highpass", 32, 0.707, 0)]
        : focus === "vocal" ? [mk("highpass", 160, 0.707, 0), mk("peak", 1800, 0.8, 7), mk("lowshelf", 250, 0.707, -6), mk("highshelf", 7000, 0.707, -6)]
        : focus === "guitar" ? [mk("highpass", 90, 0.707, 0), mk("peak", 900, 0.9, 5), mk("peak", 2800, 1.0, 3), mk("highshelf", 6000, 0.707, -5)]
        : [];
      this.trim = focus === "bass" ? 0.6 : focus === "vocal" ? 0.55 : focus === "guitar" ? 0.7 : 1;
    }
  }
  process(L, R, off = 0, n = L.length - off) {
    if (this.vocal > 0) {
      if (this.mid.length < n) { this.mid = new Float32Array(n); this.low = new Float32Array(n); }
      const m = this.mid, lo = this.low;
      for (let i = 0; i < n; i++) m[i] = lo[i] = 0.5 * (L[off + i] + R[off + i]);
      this.lp.run(lo, 0, 0, n); this.lp2.run(lo, 0, 0, n);
      const g = this.vocal;
      for (let i = 0; i < n; i++) { const c = g * (m[i] - lo[i]); L[off + i] -= c; R[off + i] -= c; }
    }
    if (this.eq.length) {
      for (const [a, b] of this.eq) { a.run(L, 0, off, n); b.run(R, 1, off, n); }
      const t = this.trim;
      for (let i = 0; i < n; i++) { L[off + i] *= t; R[off + i] *= t; }
    }
  }
}

// ---------------------------------------------------------------- a lookahead peak limiter
/**
 * Keeps the peaks under `ceiling` (linear) without the crunch of clipping. Lookahead 5 ms,
 * release 80 ms. Streaming: call process() block by block; output is delayed by `latency` samples.
 */
export class Limiter {
  constructor(fs, { ceiling = Math.pow(10, -1 / 20), lookaheadMs = 5, releaseMs = 80 } = {}) {
    this.ceil = ceiling; this.la = Math.max(1, Math.round((lookaheadMs / 1000) * fs));
    this.rel = Math.exp(-1 / ((releaseMs / 1000) * fs));
    this.latency = this.la;
    const n = this.la + 1;
    this.dl = [new Float32Array(n), new Float32Array(n)]; this.req = new Float32Array(n).fill(1); this.w = 0;
    this.g = 1;
  }
  process(L, R, off = 0, n = L.length - off) {
    const la = this.la, size = la + 1, { dl, req, ceil } = this;
    for (let i = off; i < off + n; i++) {
      const pk = Math.max(Math.abs(L[i]), Math.abs(R ? R[i] : 0));
      req[this.w] = pk > ceil ? ceil / pk : 1;
      dl[0][this.w] = L[i]; if (R) dl[1][this.w] = R[i];
      // the lowest gain anyone in the lookahead window needs
      let need = 1;
      for (let k = 0; k < size; k++) if (req[k] < need) need = req[k];
      // fall fast enough to reach `need` by the time that sample comes out, rise slowly
      if (need < this.g) this.g += (need - this.g) / la * 2.2;
      else this.g = need + (this.g - need) * this.rel;
      const r = (this.w + 1) % size;
      let g = this.g;
      const yL = dl[0][r] * g, yR = R ? dl[1][r] * g : 0;
      // a final safety: the delayed sample itself must fit
      const pk2 = Math.max(Math.abs(yL), Math.abs(yR));
      if (pk2 > ceil) g *= ceil / pk2;
      L[i] = dl[0][r] * g; if (R) R[i] = dl[1][r] * g;
      this.w = r;
    }
  }
}

// ---------------------------------------------------------------- helpers both tools share
/** min/max per column for drawing a waveform: Float32Array(cols*2) */
export function peaks(chans, cols, start = 0, end = chans[0].length) {
  const out = new Float32Array(cols * 2), n = Math.max(1, end - start), per = n / cols;
  const a = chans[0], b = chans[1] || chans[0];
  for (let c = 0; c < cols; c++) {
    const s = Math.floor(start + c * per), e = Math.max(s + 1, Math.floor(start + (c + 1) * per));
    let lo = 0, hi = 0;
    const stride = Math.max(1, Math.floor((e - s) / 400));
    for (let i = s; i < e; i += stride) {
      if (i < 0 || i >= a.length) continue;
      const v = 0.5 * (a[i] + b[i]);
      if (v < lo) lo = v; if (v > hi) hi = v;
    }
    out[2 * c] = lo; out[2 * c + 1] = hi;
  }
  return out;
}

/** "3:07.4" style */
export function fmtTime(sec, tenths = false) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60), s = sec - m * 60;
  return tenths ? `${m}:${s.toFixed(1).padStart(4, "0")}` : `${m}:${String(Math.floor(s)).padStart(2, "0")}`;
}

/** Stretch a whole song offline (a Worker uses this for exports). onProgress(0..1). */
export function renderStretched(chans, fs, { tempo = 1, pitch = 1, outFs = fs, start = 0, end = chans[0].length, fx = null, onProgress = null } = {}) {
  const st = new Stretcher({ channels: 2, fftSize: fftSizeFor(fs) });
  st.setRates({ tempo, pitch, ratio: fs / outFs });
  const reader = new SongReader(chans, fs);
  st.reset(start);
  const total = Math.max(1, Math.round(((end - start) / tempo) * (outFs / fs)));
  const L = new Float32Array(total), R = new Float32Array(total);
  const blk = 8192;
  const endRead = (s, len, d) => {
    reader.read(s, len, d);
    for (let i = 0; i < len; i++) if (s + i >= end) { d[0][i] = 0; d[1][i] = 0; }
  };
  for (let o = 0; o < total; o += blk) {
    const n = Math.min(blk, total - o);
    st.process(endRead, [L, R], n, o);
    if (fx) fx.process(L, R, o, n);
    if (onProgress && (o / blk) % 16 === 0) onProgress(o / total);
  }
  return [L, R];
}

/** 16-bit (TPDF dithered) or 24-bit stereo WAV bytes. */
export function encodeWav(chans, fs, bits = 16) {
  const C = chans.length, n = chans[0].length, bps = bits / 8;
  const buf = new ArrayBuffer(44 + n * C * bps), v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, "RIFF"); v.setUint32(4, 36 + n * C * bps, true); str(8, "WAVE"); str(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, C, true); v.setUint32(24, fs, true);
  v.setUint32(28, fs * C * bps, true); v.setUint16(32, C * bps, true); v.setUint16(34, bits, true);
  str(36, "data"); v.setUint32(40, n * C * bps, true);
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  let o = 44;
  if (bits === 16) {
    for (let i = 0; i < n; i++) for (let c = 0; c < C; c++) {
      const s = Math.max(-32768, Math.min(32767, Math.round(chans[c][i] * 32767 + rnd() - rnd())));
      v.setInt16(o, s, true); o += 2;
    }
  } else {
    for (let i = 0; i < n; i++) for (let c = 0; c < C; c++) {
      const s = Math.max(-8388608, Math.min(8388607, Math.round(chans[c][i] * 8388607)));
      v.setUint8(o, s & 255); v.setUint8(o + 1, (s >> 8) & 255); v.setUint8(o + 2, (s >> 16) & 255); o += 3;
    }
  }
  return new Uint8Array(buf);
}

/** semitones + cents -> frequency ratio */
export const pitchRatio = (semis = 0, cents = 0) => Math.pow(2, (semis + cents / 100) / 12);
