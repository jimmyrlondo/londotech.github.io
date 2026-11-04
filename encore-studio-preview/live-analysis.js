// Encore Live: find the songs in a single-file live recording.
//
// The set is read once, a chunk at a time (so a 90-minute show never has to
// sit in memory), and boiled down to a few features per 0.1 s frame. Every
// second is then classified as music / talk / applause / quiet, with
// thresholds that adapt to this recording (a punk set and a folk set are
// very different), and the music runs become songs.
//
// Usage:
//   const a = new LiveAnalyzer(sampleRate);
//   a.push(left, right)  ...repeat for every chunk, in order...
//   const result = a.finish();   // { songs, gaps, seconds, timeline }

const HOP_SEC = 0.1;

// --- small helpers -----------------------------------------------------------
function biquad(type, f, fs, q = 0.7071) {
  const w = (2 * Math.PI * f) / fs, al = Math.sin(w) / (2 * q), c = Math.cos(w), a0 = 1 + al;
  const k = type === "lp" ? [(1 - c) / 2, 1 - c, (1 - c) / 2] : type === "hp" ? [(1 + c) / 2, -(1 + c), (1 + c) / 2] : [al, 0, -al];
  const b0 = k[0] / a0, b1 = k[1] / a0, b2 = k[2] / a0, a1 = (-2 * c) / a0, a2 = (1 - al) / a0;
  let z1 = 0, z2 = 0;
  return (x) => { const y = b0 * x + z1; z1 = b1 * x - a1 * y + z2; z2 = b2 * x - a2 * y; return y; };
}
const db = (p) => 10 * Math.log10(p + 1e-12);
const median = (arr) => { const s = [...arr].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const percentile = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; };
function medianFilter(arr, half) {
  const out = new Float32Array(arr.length);
  for (let i = 0; i < arr.length; i++) out[i] = median(arr.slice(Math.max(0, i - half), Math.min(arr.length, i + half + 1)));
  return out;
}

// In-place radix-2 FFT (re/im arrays, length a power of two)
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k], ai = im[i + k], br = re[i + k + len / 2], bi = im[i + k + len / 2];
        const tr = br * cr - bi * ci, ti = br * ci + bi * cr;
        re[i + k] = ar + tr; im[i + k] = ai + ti; re[i + k + len / 2] = ar - tr; im[i + k + len / 2] = ai - ti;
        const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}

export class LiveAnalyzer {
  constructor(fs) {
    this.fs = fs;
    this.hop = Math.round(fs * HOP_SEC);
    // band splitters (on the mono mix)
    const lp1 = biquad("lp", 150, fs), lp2 = biquad("lp", 150, fs);
    const bp1 = biquad("bp", 1500, fs, 0.5), bp2 = biquad("bp", 1500, fs, 0.5);
    const hp1 = biquad("hp", 5000, fs), hp2 = biquad("hp", 5000, fs);
    this.split = (x) => [lp2(lp1(x)), bp2(bp1(x)), hp2(hp1(x))];
    this.acc = [0, 0, 0, 0]; // total, low, mid, high energy in the current frame
    this.absAcc = 0; this.n = 0; this.prevMid = 0; this.zc = 0;
    this.frames = []; // per hop: { total, low, mid, high, crest, flat }
    this.peak = 0;
    // a ~11-12 kHz copy for the tonality measure (spectral flatness)
    this.dec = Math.max(1, Math.round(fs / 11025));
    this.decRate = fs / this.dec;
    const d1 = biquad("lp", 0.4 * this.decRate, fs), d2 = biquad("lp", 0.4 * this.decRate, fs);
    this.decFilter = (x) => d2(d1(x));
    this.N = 1024;
    this.ring = new Float32Array(this.N); this.ringPos = 0; this.decCount = 0;
    this.win = Float32Array.from({ length: this.N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (this.N - 1)));
    this.re = new Float32Array(this.N); this.im = new Float32Array(this.N);
    this.binLo = Math.ceil((150 / this.decRate) * this.N); this.binHi = Math.floor((5000 / this.decRate) * this.N);
  }

  // Spectral flatness of the last 1024 decimated samples: ~0 for pure tones
  // and chords, ~1 for noise (applause), in between for talk
  flatness() {
    const N = this.N;
    for (let i = 0; i < N; i++) { this.re[i] = this.ring[(this.ringPos + i) % N] * this.win[i]; this.im[i] = 0; }
    fft(this.re, this.im);
    let logSum = 0, sum = 0, n = 0;
    for (let k = this.binLo; k <= this.binHi; k++) { const p = this.re[k] ** 2 + this.im[k] ** 2 + 1e-12; logSum += Math.log(p); sum += p; n++; }
    return Math.exp(logSum / n) / (sum / n);
  }

  push(l, r) {
    const len = l.length;
    for (let i = 0; i < len; i++) {
      const m = 0.5 * (l[i] + (r ? r[i] : l[i]));
      const [lo, mi, hi] = this.split(m);
      this.acc[0] += m * m; this.acc[1] += lo * lo; this.acc[2] += mi * mi; this.acc[3] += hi * hi;
      this.absAcc = Math.max(this.absAcc, Math.abs(m));
      const dm = this.decFilter(m);
      if (++this.decCount >= this.dec) { this.decCount = 0; this.ring[this.ringPos] = dm; this.ringPos = (this.ringPos + 1) % this.N; }
      if (++this.n >= this.hop) {
        const n = this.n;
        this.frames.push({ total: this.acc[0] / n, low: this.acc[1] / n, mid: this.acc[2] / n, high: this.acc[3] / n, flat: this.flatness() });
        this.peak = Math.max(this.peak, this.absAcc);
        this.acc = [0, 0, 0, 0]; this.absAcc = 0; this.n = 0;
      }
    }
  }

  finish(opts = {}) {
    const minSongSec = opts.minSongSec ?? 40;     // shorter music runs are tuning / noodling
    const mergeGapSec = opts.mergeGapSec ?? 6;    // quiet breakdowns inside a song
    const F = this.frames, nf = F.length;
    const seconds = Math.floor(nf * HOP_SEC);
    if (seconds < 5) return { songs: [], gaps: [], seconds, timeline: [] };
    const per = Math.round(1 / HOP_SEC);

    // frame-level tonality (log10 flatness), lightly smoothed
    const frameFlat = medianFilter(F.map((f) => Math.log10(f.flat + 1e-9)), 2);
    const frameDb = F.map((f) => db(f.total));

    // ---- per-second features --------------------------------------------
    const sec = [];
    for (let s = 0; s < seconds; s++) {
      const fr = F.slice(s * per, (s + 1) * per);
      const tot = fr.reduce((a, f) => a + f.total, 0) / fr.length;
      const lo = fr.reduce((a, f) => a + f.low, 0) / fr.length;
      const mi = fr.reduce((a, f) => a + f.mid, 0) / fr.length;
      const hi = fr.reduce((a, f) => a + f.high, 0) / fr.length;
      const lv = fr.map((f) => db(f.total)), meanLv = lv.reduce((x, v) => x + v, 0) / lv.length;
      const wobble = Math.sqrt(lv.reduce((x, v) => x + (v - meanLv) ** 2, 0) / lv.length);
      sec.push({ level: db(tot), lowRatio: db(lo) - db(tot), midRatio: db(mi) - db(tot), highRatio: db(hi) - db(tot), wobble,
                 flat: median(frameFlat.slice(s * per, (s + 1) * per)) });
    }

    // ---- adaptive thresholds for THIS recording ---------------------------
    const levels = sec.map((s) => s.level);
    const loud = percentile(levels, 0.95);
    // quiet = well below the loud parts of THIS set (a wall-to-wall punk set
    // has no quiet percentile to lean on)
    const isQuiet = sec.map((s) => s.level < Math.max(loud - 30, -65));
    const audible = sec.filter((_, i) => !isQuiet[i]);
    const tonalThr = otsu(audible.map((s) => s.flat));      // tonal (music) vs noisy (applause, breath, room)
    const wobRef = Math.max(0.5, median(audible.map((s) => s.wobble)));
    // loudness judged against the surrounding 90 s, not the whole set, so a
    // quiet song between loud ones still counts
    const localMax = levels.map((_, i) => Math.max(...levels.slice(Math.max(0, i - 90), i + 91)));

    const clamp01 = (v) => Math.max(0, Math.min(1, v));
    const score = sec.map((s, i) => {
      if (isQuiet[i]) return 0;
      const tonal = clamp01((tonalThr - s.flat) / 0.6 + 0.5);
      const steady = clamp01(1 - s.wobble / (2.5 * wobRef));
      const present = clamp01((s.level - (localMax[i] - 24)) / 24);
      return 1.0 * tonal + 0.45 * steady + 0.45 * present;
    });
    const smooth = medianFilter(score, 2);
    const thr = otsu(smooth.filter((_, i) => !isQuiet[i]));
    const isMusic = Array.from(smooth, (v, i) => !isQuiet[i] && v > thr);
    // applause: audible, clearly noisy, little low end
    const lowRef = percentile(audible.map((s) => s.lowRatio), 0.6);
    const isApplause = sec.map((s, i) => !isQuiet[i] && !isMusic[i] && s.flat > tonalThr + 0.1 && s.lowRatio < lowRef);

    // ---- runs -> songs ----------------------------------------------------
    // a quiet breakdown inside a song is merged back in; applause never is
    let runs = [];
    for (let s = 0; s < seconds; s++) {
      if (!isMusic[s]) continue;
      const last = runs[runs.length - 1];
      const gapHasApplause = last && isApplause.slice(last.end, s).filter(Boolean).length >= 2;
      if (last && s - last.end <= mergeGapSec && !gapHasApplause) last.end = s + 1;
      else runs.push({ start: s, end: s + 1 });
    }
    runs = runs.filter((r) => r.end - r.start >= minSongSec);

    // refine edges to 0.1 s: start where tonal sound comes in; end where the
    // tonal sound stops (ring-out included, applause excluded)
    const tonalFrame = (k, lvl) => frameFlat[k] < tonalThr && frameDb[k] > lvl - 22;
    const songs = runs.map((r, i) => {
      const songLevel = percentile(frameDb.slice(r.start * per, r.end * per), 0.6);
      let a = r.start * per;
      for (let k = a; k >= Math.max(0, a - 6 * per); k--) { if (!tonalFrame(k, songLevel) && frameDb[k] < songLevel - 18) break; a = k; }
      let b = Math.max(a, (r.end - 1) * per);
      for (let k = b; k < Math.min(nf, b + 12 * per); k++) { if (tonalFrame(k, songLevel)) b = k; else if (k - b > 8) break; }
      const startSec = Math.max(0, a * HOP_SEC - 0.3);
      const endSec = Math.min(nf * HOP_SEC, b * HOP_SEC + 0.6);
      const body = smooth.slice(r.start, r.end);
      const conf = clamp01((body.reduce((x, v) => x + v, 0) / body.length - thr) / 0.5);
      return { n: i + 1, start: +startSec.toFixed(1), end: +endSec.toFixed(1), confidence: +conf.toFixed(2), level: +songLevel.toFixed(1) };
    });

    // ---- what's between the songs ------------------------------------------
    const kindOf = (s) => {
      if (isQuiet[s]) return "quiet";
      if (isMusic[s]) return "music";
      if (isApplause[s]) return "applause";
      if (sec[s].wobble > wobRef) return "talk";
      return "noodling";
    };
    const gaps = [];
    const edges = [0, ...songs.flatMap((x) => [x.start, x.end]), seconds];
    for (let i = 0; i < edges.length; i += 2) {
      const a = edges[i], b = edges[i + 1];
      if (b - a < 1) continue;
      const counts = {};
      for (let x = Math.floor(a); x < Math.min(seconds, Math.ceil(b)); x++) { const k = kindOf(x); counts[k] = (counts[k] ?? 0) + 1; }
      const main = Object.entries(counts).sort((x, y) => y[1] - x[1])[0]?.[0] ?? "quiet";
      gaps.push({ start: a, end: b, kind: main, detail: counts });
    }

    return { songs, gaps, seconds, timeline: sec.map((_, x) => kindOf(x)), threshold: thr, peak: this.peak };
  }
}

// Otsu's method: the score that best splits the set into two groups
function otsu(values) {
  const lo = Math.min(...values), hi = Math.max(...values), bins = 64;
  if (hi - lo < 1e-6) return hi;
  const hist = new Array(bins).fill(0);
  for (const v of values) hist[Math.min(bins - 1, Math.floor(((v - lo) / (hi - lo)) * bins))]++;
  const total = values.length;
  let sumAll = 0; for (let i = 0; i < bins; i++) sumAll += i * hist[i];
  let sumB = 0, wB = 0, best = 0, bestVar = -1;
  for (let i = 0; i < bins; i++) {
    wB += hist[i]; if (!wB) continue;
    const wF = total - wB; if (!wF) break;
    sumB += i * hist[i];
    const mB = sumB / wB, mF = (sumAll - sumB) / wF, between = wB * wF * (mB - mF) ** 2;
    if (between > bestVar) { bestVar = between; best = i; }
  }
  return lo + ((best + 0.5) / bins) * (hi - lo);
}
