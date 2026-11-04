// Encore Restore: the small DSP building blocks the restoration modules share
// (FFT, filters, AR models, gap filling, high-quality resampling). Pure JS,
// no page in it, so Node can test it (test-restore.mjs) and a worker can run it.

// ---------- FFT ----------
// Complex radix-2 FFT with its tables built once per size (a long recording
// runs hundreds of thousands of these, so the tables pay for themselves)
const fftCache = new Map();
export function fftFor(n) {
  let f = fftCache.get(n);
  if (!f) { f = new FFT(n); fftCache.set(n, f); }
  return f;
}

export class FFT {
  constructor(n) {
    if (n & (n - 1)) throw new Error("FFT size must be a power of two");
    this.n = n;
    this.rev = new Uint32Array(n);
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      this.rev[i] = j;
    }
    this.cos = new Float64Array(n >> 1); this.sin = new Float64Array(n >> 1);
    for (let i = 0; i < n >> 1; i++) { this.cos[i] = Math.cos(-2 * Math.PI * i / n); this.sin[i] = Math.sin(-2 * Math.PI * i / n); }
  }
  // in place, forward (e^-j)
  forward(re, im) {
    const n = this.n, rev = this.rev, C = this.cos, S = this.sin;
    for (let i = 1; i < n; i++) {
      const j = rev[i];
      if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const half = len >> 1, step = n / len;
      for (let i = 0; i < n; i += len) {
        for (let k = 0, t = 0; k < half; k++, t += step) {
          const a = i + k, b = a + half, wr = C[t], wi = S[t];
          const tr = re[b] * wr - im[b] * wi, ti = re[b] * wi + im[b] * wr;
          re[b] = re[a] - tr; im[b] = im[a] - ti;
          re[a] += tr; im[a] += ti;
        }
      }
    }
  }
  // in place, inverse (scaled by 1/n): the forward transform with re and im swapped
  inverse(re, im) {
    this.forward(im, re);
    const s = 1 / this.n;
    for (let i = 0; i < this.n; i++) { re[i] *= s; im[i] *= s; }
  }
}

export const hann = (n) => Float64Array.from({ length: n }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / n)); // periodic: sums flat when overlapped

// ---------- small helpers ----------
export const db = (p) => 10 * Math.log10(p + 1e-30);         // power to dB
export const dbAmp = (a) => 20 * Math.log10(Math.abs(a) + 1e-30);
export const fromDb = (d) => Math.pow(10, d / 20);
export function median(arr) {
  const s = Float64Array.from(arr).sort();
  return s.length ? (s.length & 1 ? s[s.length >> 1] : 0.5 * (s[(s.length >> 1) - 1] + s[s.length >> 1])) : 0;
}
export function percentile(arr, p) {
  const s = Float64Array.from(arr).sort();
  return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.floor(p * s.length)))] : 0;
}
// median of a small Float64Array in place (quickselect), for hot loops
export function medianInPlace(a, n = a.length) {
  let lo = 0, hi = n - 1;
  const k = n >> 1;
  while (lo < hi) {
    const pivot = a[(lo + hi) >> 1];
    let i = lo, j = hi;
    while (i <= j) {
      while (a[i] < pivot) i++;
      while (a[j] > pivot) j--;
      if (i <= j) { const t = a[i]; a[i] = a[j]; a[j] = t; i++; j--; }
    }
    if (j < k) lo = i;
    if (k < i) hi = j;
    if (j < k && k < i) break;
  }
  return a[k];
}

// ---------- biquads (Float64 state: narrow notches at 96 kHz need the precision) ----------
// coefficient sets: [b0, b1, b2, a1, a2], already divided by a0
export function biquadCoefs(type, f, fs, q = Math.SQRT1_2, gainDb = 0) {
  const w = 2 * Math.PI * f / fs, c = Math.cos(w), s = Math.sin(w), al = s / (2 * q);
  let b0, b1, b2, a0, a1, a2;
  const A = Math.pow(10, gainDb / 40);
  switch (type) {
    case "lp": b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; break;
    case "hp": b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; break;
    case "bp": b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; break;
    case "notch": b0 = 1; b1 = -2 * c; b2 = 1; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; break;
    case "highshelf": {
      const sq = 2 * Math.sqrt(A) * al;
      b0 = A * ((A + 1) + (A - 1) * c + sq); b1 = -2 * A * ((A - 1) + (A + 1) * c); b2 = A * ((A + 1) + (A - 1) * c - sq);
      a0 = (A + 1) - (A - 1) * c + sq; a1 = 2 * ((A - 1) - (A + 1) * c); a2 = (A + 1) - (A - 1) * c - sq; break;
    }
    default: throw new Error("unknown filter " + type);
  }
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}

// A chain of biquads run over several channels, with its state kept between chunks
export class BiquadChain {
  constructor(sections, channels = 2) {
    this.k = sections;
    this.z = Array.from({ length: channels }, () => new Float64Array(sections.length * 2));
  }
  process(ch, x) {
    const z = this.z[ch], K = this.k;
    for (let s = 0; s < K.length; s++) {
      const [b0, b1, b2, a1, a2] = K[s];
      let z1 = z[2 * s], z2 = z[2 * s + 1];
      for (let i = 0; i < x.length; i++) {
        const v = x[i], y = b0 * v + z1;
        z1 = b1 * v - a1 * y + z2; z2 = b2 * v - a2 * y;
        x[i] = y;
      }
      z[2 * s] = z1; z[2 * s + 1] = z2;
    }
  }
}

// Butterworth sections of a given (even) order
export function butterworth(type, f, fs, order = 4) {
  const out = [];
  for (let k = 0; k < order / 2; k++) out.push(biquadCoefs(type, f, fs, 1 / (2 * Math.cos(Math.PI * (2 * k + 1) / (2 * order)))));
  return out;
}

// |H(f)| of a list of biquad sections (for tests and the EQ curve display)
export function sectionsResponse(sections, f, fs) {
  const w = 2 * Math.PI * f / fs, cr = Math.cos(w), ci = -Math.sin(w), c2r = Math.cos(2 * w), c2i = -Math.sin(2 * w);
  let mag = 1;
  for (const [b0, b1, b2, a1, a2] of sections) {
    const nr = b0 + b1 * cr + b2 * c2r, ni = b1 * ci + b2 * c2i, dr = 1 + a1 * cr + a2 * c2r, di = a1 * ci + a2 * c2i;
    mag *= Math.sqrt((nr * nr + ni * ni) / (dr * dr + di * di));
  }
  return mag;
}

// Filter a whole array forward then backward: no phase shift (analysis only)
export function zeroPhase(sections, x) {
  const y = Float64Array.from(x);
  const f = new BiquadChain(sections, 1);
  f.process(0, y);
  y.reverse();
  new BiquadChain(sections, 1).process(0, y);
  return y.reverse();
}

// Low-passes and keeps every `factor`-th sample, a chunk at a time (analysis copies at ~12 kHz)
export class Decimator {
  constructor(fs, factor) {
    this.factor = factor;
    this.f = factor > 1 ? new BiquadChain(butterworth("lp", 0.42 * fs / factor, fs, 8), 1) : null;
    this.phase = 0;
  }
  push(x) {
    if (!this.f) return Float32Array.from(x);
    const y = Float64Array.from(x);
    this.f.process(0, y);
    const out = new Float32Array(Math.ceil((y.length - this.phase) / this.factor));
    let o = 0, i = this.phase;
    for (; i < y.length; i += this.factor) out[o++] = y[i];
    this.phase = i - y.length;
    return out.subarray(0, o);
  }
}

// ---------- AR (linear prediction) models ----------
// Autocorrelation of x[from, from+n) windowed by w, lags 0..p
export function autocorr(x, from, n, w, p, out = new Float64Array(p + 1)) {
  const seg = new Float64Array(n);
  for (let i = 0; i < n; i++) seg[i] = (x[from + i] || 0) * w[i];
  for (let k = 0; k <= p; k++) {
    let s = 0;
    for (let i = k; i < n; i++) s += seg[i] * seg[i - k];
    out[k] = s;
  }
  return out;
}

// Levinson-Durbin: predictor a[1..p] with x[n] ~ sum a[k] x[n-k]; returns { a, err }
export function levinson(r, p) {
  const a = new Float64Array(p + 1), tmp = new Float64Array(p + 1);
  let err = r[0] * (1 + 1e-9) + 1e-20; // a hair of white noise keeps it stable on silence
  for (let i = 1; i <= p; i++) {
    let acc = r[i];
    for (let j = 1; j < i; j++) acc -= a[j] * r[i - j];
    const k = acc / err;
    tmp.set(a);
    a[i] = k;
    for (let j = 1; j < i; j++) a[j] = tmp[j] - k * tmp[i - j];
    err *= 1 - k * k;
    if (err <= 0) { err = 1e-20; break; }
  }
  return { a, err };
}

// Least-squares AR interpolation (Janssen / Vaseghi): the missing samples that
// make the prediction error over the surrounding stretch as small as possible.
// x is changed in place. missing: sorted sample indices. a: predictor (a[0] unused).
// Uses the fact that the normal equations are banded Toeplitz in the error filter's
// autocorrelation, so it costs O(m p^2) instead of O(m^3).
export function lsarFill(x, missing, a, p) {
  const m = missing.length;
  if (!m) return;
  // error filter b: e[n] = sum_{k=0..p} b[k] x[n-k], b[0]=1, b[k]=-a[k]
  const b = new Float64Array(p + 1);
  b[0] = 1;
  for (let k = 1; k <= p; k++) b[k] = -a[k];
  const rb = new Float64Array(p + 1);
  for (let k = 0; k <= p; k++) { let s = 0; for (let l = 0; l + k <= p; l++) s += b[l] * b[l + k]; rb[k] = s; }
  for (const t of missing) x[t] = 0;
  // the prediction errors that touch a missing sample, with the missing ones at zero
  const t0 = missing[0], t1 = missing[m - 1] + p, e0 = new Float64Array(t1 - t0 + 1);
  for (let n = t0; n <= t1; n++) {
    let s = 0;
    for (let k = 0; k <= p; k++) { const v = x[n - k]; if (v !== undefined) s += b[k] * v; }
    e0[n - t0] = s;
  }
  const rhs = new Float64Array(m);
  for (let i = 0; i < m; i++) {
    let s = 0;
    const ti = missing[i];
    for (let k = 0; k <= p; k++) s += b[k] * e0[ti + k - t0];
    rhs[i] = -s;
  }
  // banded symmetric matrix R[i][j] = rb[|ti - tj|]; band in index space is at most p
  const bw = Math.min(p, m - 1), L = new Float64Array(m * (bw + 1)); // L[i*(bw+1) + (i-j)]
  const at = (i, j) => L[i * (bw + 1) + (i - j)];
  for (let i = 0; i < m; i++) {
    for (let j = Math.max(0, i - bw); j <= i; j++) {
      const d = missing[i] - missing[j];
      let s = d <= p ? rb[d] : 0;
      if (i === j) s *= 1 + 1e-9;
      for (let k = Math.max(0, i - bw); k < j; k++) s -= at(i, k) * at(j, k);
      if (i === j) L[i * (bw + 1)] = Math.sqrt(Math.max(s, 1e-24));
      else L[i * (bw + 1) + (i - j)] = s / at(j, j);
    }
  }
  const y = new Float64Array(m);
  for (let i = 0; i < m; i++) {
    let s = rhs[i];
    for (let k = Math.max(0, i - bw); k < i; k++) s -= at(i, k) * y[k];
    y[i] = s / at(i, i);
  }
  for (let i = m - 1; i >= 0; i--) {
    let s = y[i];
    for (let k = i + 1; k <= Math.min(m - 1, i + bw); k++) s -= at(k, i) * y[k];
    y[i] = s / at(i, i);
  }
  for (let i = 0; i < m; i++) x[missing[i]] = y[i];
}

// ---------- windowed-sinc interpolation ----------
function besselI0(x) {
  let s = 1, t = 1;
  for (let k = 1; k < 40; k++) { t *= (x / (2 * k)) * (x / (2 * k)); s += t; if (t < 1e-14 * s) break; }
  return s;
}

// Kaiser-windowed sinc, tabulated: kernel(t) for |t| < half zero crossings
export class SincTable {
  constructor(half = 64, beta = 9.5, res = 4096) {
    this.half = half; this.res = res;
    const n = half * res + 2;
    this.t = new Float64Array(n);
    const i0b = besselI0(beta);
    for (let i = 0; i < n; i++) {
      const x = i / res;
      const sinc = x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
      const r = x / half;
      this.t[i] = r >= 1 ? 0 : sinc * besselI0(beta * Math.sqrt(1 - r * r)) / i0b;
    }
  }
  at(x) { // x in zero crossings
    const u = Math.abs(x) * this.res, i = u | 0;
    if (i >= this.t.length - 1) return 0;
    const f = u - i;
    return this.t[i] + f * (this.t[i + 1] - this.t[i]);
  }
}
let sharedSinc = null;
export const sincTable = () => (sharedSinc ??= new SincTable());

// Streaming resampler: reads the input at a position that moves `step(pos)`
// input samples per output sample (constant for a speed fix, wobbling for a
// wow fix). Windowed-sinc, 128 taps at full bandwidth, wider (and lower cut-off)
// when it has to squeeze the audio, so nothing folds back as aliasing.
//   stepAt(pos): input samples per output sample at input position pos
//   maxStep: the largest step it will see (sets the anti-alias cut-off)
export class Resampler {
  constructor(stepAt, maxStep = 1, channels = 2) {
    this.stepAt = stepAt;
    this.fc = 0.97 * Math.min(1, 1 / maxStep);   // cut-off as a fraction of the input's Nyquist
    this.k = sincTable();
    this.W = Math.ceil(this.k.half / this.fc);   // input samples each side of the read point
    this.ch = channels;
    this.base = -this.W;                          // absolute index of buf[0] (zeros before the start)
    this.buf = Array.from({ length: channels }, () => new Float32Array(this.W));
    this.pos = 0; this.inTotal = 0; this.done = false;
    this.w = new Float64Array(2 * this.W + 2);
  }
  push(chans) {
    const n = chans[0].length;
    this.buf = this.buf.map((b, c) => { const nb = new Float32Array(b.length + n); nb.set(b); nb.set(chans[c] || chans[0], b.length); return nb; });
    this.inTotal += n;
    return this.run(false);
  }
  flush() {
    // zeros after the end, so the last samples get their full window
    this.buf = this.buf.map((b) => { const nb = new Float32Array(b.length + this.W + 2); nb.set(b); return nb; });
    return this.run(true);
  }
  run(final) {
    const end = this.base + this.buf[0].length; // absolute index past the last buffered sample
    const limit = final ? this.inTotal : end - this.W - 1;
    const fc = this.fc, k = this.k, W = this.W, w = this.w;
    let cap = Math.max(16, Math.ceil((limit - this.pos) / (0.8 * this.stepAt(this.pos))) + 16), o = 0;
    let out = Array.from({ length: this.ch }, () => new Float32Array(cap));
    while (this.pos < limit) {
      if (o >= cap) { cap *= 2; out = out.map((a) => { const b = new Float32Array(cap); b.set(a); return b; }); }
      const p = this.pos, i0 = Math.floor(p), lo = i0 - W + 1, hi = i0 + W;
      let ws = 0, n = 0;
      for (let j = lo; j <= hi; j++, n++) { const v = k.at((j - p) * fc); w[n] = v; ws += v; }
      const off = lo - this.base;
      for (let c = 0; c < this.ch; c++) {
        const b = this.buf[c];
        let s = 0;
        for (let q = 0; q < n; q++) s += w[q] * b[off + q];
        out[c][o] = s * fc;
      }
      o++;
      this.pos += this.stepAt(p);
    }
    // drop what no future output needs
    const keepFrom = Math.max(this.base, Math.floor(this.pos) - W - 2);
    if (keepFrom > this.base) { const d = keepFrom - this.base; this.buf = this.buf.map((b) => b.slice(d)); this.base = keepFrom; }
    return out.map((a) => a.slice(0, o));
  }
}

// A fixed fractional delay per channel (in samples, may be negative) as a
// windowed-sinc FIR, streaming. Every channel comes out `latency` samples late
// on top of its own delay; a whole-number delay is a plain copy (no filtering).
export class FracDelay {
  constructor(delays) {
    this.k = sincTable();
    const half = this.k.half;
    this.latency = Math.ceil(Math.max(0, ...delays.map((d) => -d)));
    this.chans = delays.map((d) => {
      const total = this.latency + d, whole = Math.round(total);
      if (Math.abs(total - whole) < 1e-6) return { shift: whole, h: null, n: whole + 1 };
      // y[n] = sum_j h[j] x[n - j - lo], kernel centred on `total`
      const lo = Math.floor(total) - half + 1, len = 2 * half, h = new Float64Array(len);
      let s = 0;
      for (let j = 0; j < len; j++) { const v = this.k.at(lo + j - total); h[j] = v; s += v; }
      for (let j = 0; j < len; j++) h[j] /= s;
      return { lo, h, n: Math.max(1, lo + len) };
    });
    this.hist = this.chans.map((c) => new Float64Array(c.n + 2 * half + 2));
  }
  process(ch, x) {
    const c = this.chans[ch], hist = this.hist[ch], H = hist.length;
    const ext = new Float64Array(H + x.length);
    ext.set(hist); for (let i = 0; i < x.length; i++) ext[H + i] = x[i];
    if (!c.h) { for (let i = 0; i < x.length; i++) x[i] = ext[H + i - c.shift]; }
    else {
      const h = c.h, len = h.length, lo = c.lo;
      for (let i = 0; i < x.length; i++) {
        let s = 0;
        const base = H + i - lo;
        for (let j = 0; j < len; j++) s += h[j] * ext[base - j];
        x[i] = s;
      }
    }
    this.hist[ch] = ext.slice(ext.length - H);
  }
}
