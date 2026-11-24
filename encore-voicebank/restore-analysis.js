// Encore Restore: the analysis pass. Listens to the whole transfer once (a
// chunk at a time) and works out what's wrong with it, in plain English, plus
// the settings to fix it. Pure JS, no page in it: Node tests each detector
// with signals whose answers are known (test-restore.mjs).
//
//   const a = new Analyzer(fs, frames);  a.push(l, r) ...;  const base = a.finish();
//   then detectHum / detectTuning / detectWow / detectDropouts / findTracks on
//   base's ~12 kHz copies, and noiseProfile / measureChannels / click counts on
//   windows read back from the file.
import { fftFor, hann, db, median, percentile, medianInPlace, Decimator, BiquadChain, butterworth, zeroPhase } from "./restore-dsp.js";
import { Declicker } from "./restore-declick.js";
import { defaultSettings, nrFrame, SOURCES } from "./restore-core.js";

export const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

// ---------- the streaming pass ----------
export class Analyzer {
  constructor(fs, frames, cols = 3000) {
    this.fs = fs; this.frames = frames;
    this.factor = Math.max(1, Math.round(fs / 11025));   // ~11-12 kHz analysis copies
    this.fsd = fs / this.factor;
    this.dl = new Decimator(fs, this.factor); this.dr = new Decimator(fs, this.factor);
    this.decL = new Float32Array(Math.ceil(frames / this.factor) + 16); this.decR = new Float32Array(this.decL.length); this.nd = 0;
    // waveform overview
    this.cols = cols; this.per = Math.max(1, Math.ceil(frames / cols));
    this.peakL = new Float32Array(cols); this.peakR = new Float32Array(cols); this.rms = new Float64Array(cols); this.cnt = new Uint32Array(cols);
    // quiet-frame finder: energy per noise-reduction hop
    this.N = nrFrame(fs); this.hop = this.N >> 1; this.hopE = []; this.acc = 0; this.accN = 0;
    // flat-topped runs (digital clipping), DC, channel likeness per second
    this.runs = []; this.run = [0, 0]; this.runStart = [0, 0]; this.lastV = [NaN, NaN]; this.max = 0;
    this.sum = [0, 0]; this.n = 0;
    this.sec = []; this.secAcc = [0, 0, 0, 0]; this.secN = 0;
    this.pos = 0;
  }

  push(l, r) {
    r = r || l;
    const n = l.length, fs = this.fs;
    const a = this.dl.push(l), b = this.dr.push(r);
    this.decL.set(a, this.nd); this.decR.set(b, this.nd); this.nd += a.length;
    for (let i = 0; i < n; i++) {
      const x = l[i], y = r[i], at = this.pos + i, c = Math.min(this.cols - 1, Math.floor(at / this.per));
      const ax = Math.abs(x), ay = Math.abs(y);
      if (ax > this.peakL[c]) this.peakL[c] = ax;
      if (ay > this.peakR[c]) this.peakR[c] = ay;
      this.rms[c] += 0.5 * (x * x + y * y); this.cnt[c]++;
      if (ax > this.max) this.max = ax;
      if (ay > this.max) this.max = ay;
      this.sum[0] += x; this.sum[1] += y;
      this.acc += x * x + y * y;
      if (++this.accN === this.hop) { this.hopE.push(this.acc / (2 * this.hop)); this.acc = 0; this.accN = 0; }
      // runs of 3+ identical loud samples
      for (let ch = 0; ch < 2; ch++) {
        const v = ch ? y : x;
        if (Math.abs(v) > 0.25 && v === this.lastV[ch]) { if (!this.run[ch]) this.runStart[ch] = at - 1; this.run[ch]++; }
        else { if (this.run[ch] >= 2) this.runs.push({ at: this.runStart[ch], len: this.run[ch] + 1, level: Math.abs(this.lastV[ch]), ch }); this.run[ch] = 0; }
        this.lastV[ch] = v;
      }
      const s = this.secAcc;
      s[0] += x * x; s[1] += y * y; s[2] += x * y;
      if (++this.secN === Math.round(fs)) { this.sec.push({ ll: s[0], rr: s[1], lr: s[2] }); this.secAcc = [0, 0, 0, 0]; this.secN = 0; }
    }
    this.pos += n;
  }

  finish() {
    const fs = this.fs, n = Math.max(1, this.pos);
    const decL = this.decL.subarray(0, this.nd), decR = this.decR.subarray(0, this.nd);
    const mid = new Float32Array(this.nd);
    for (let i = 0; i < this.nd; i++) mid[i] = 0.5 * (decL[i] + decR[i]);
    // clipping: flat tops at the very top of what's on the file
    const clip = this.max > 0.5 ? this.runs.filter((r) => r.level >= 0.985 * this.max) : [];
    return {
      fs, frames: this.pos, seconds: this.pos / fs, fsd: this.fsd, decL, decR, mid,
      overview: { cols: this.cols, per: this.per, peakL: this.peakL, peakR: this.peakR, rms: Float32Array.from(this.rms, (v, c) => Math.sqrt(v / Math.max(1, this.cnt[c]))) },
      peakDb: 20 * Math.log10(this.max + 1e-12),
      dc: [this.sum[0] / n, this.sum[1] / n],
      hopEnergy: Float32Array.from(this.hopE), hop: this.hop, N: this.N,
      clipping: groupEvents(clip.map((r) => r.at), fs, 0.05).map((e) => ({ ...e, start: e.start, end: e.end })),
      clipSamples: clip.reduce((a, r) => a + r.len, 0),
      seconds1: this.sec,
    };
  }
}

// Positions (samples) to events: anything within `gap` seconds is one event
export function groupEvents(positions, fs, gap = 0.25) {
  const out = [];
  for (const p of positions.slice().sort((a, b) => a - b)) {
    const t = p / fs, last = out[out.length - 1];
    if (!last || t - last.end > gap) out.push({ start: t, end: t, n: 1 });
    else { last.end = t; last.n++; }
  }
  return out;
}

// ---------- averaged spectrum (Welch), for hum ----------
function welch(chans, fs, N, maxSegs = 64) {
  const hop = N >> 1, total = chans[0].length, segs = Math.max(1, Math.floor((total - N) / hop) + 1);
  const pick = Math.min(segs, maxSegs), w = hann(N), f = fftFor(N), P = new Float64Array(N / 2 + 1);
  const re = new Float64Array(N), im = new Float64Array(N);
  let used = 0;
  for (let s = 0; s < pick; s++) {
    const at = Math.floor((s + 0.5) * (segs / pick)) * hop;
    if (at + N > total) continue;
    for (const x of chans) {
      for (let i = 0; i < N; i++) { re[i] = x[at + i] * w[i]; im[i] = 0; }
      f.forward(re, im);
      for (let k = 0; k <= N / 2; k++) P[k] += re[k] * re[k] + im[k] * im[k];
    }
    used++;
  }
  if (total < N) { // short file: one zero-padded frame
    for (const x of chans) { re.fill(0); im.fill(0); for (let i = 0; i < total; i++) re[i] = x[i] * w[Math.floor(i * N / total)]; f.forward(re, im); for (let k = 0; k <= N / 2; k++) P[k] += re[k] * re[k] + im[k] * im[k]; }
    used = 1;
  }
  for (let k = 0; k <= N / 2; k++) P[k] /= Math.max(1, used);
  return { P, df: fs / N, N, windowPower: 3 * N / 8 };
}

// ---------- hum ----------
// Mains hum is a perfectly steady line at 50 or 60 Hz (or a little off, when
// the deck ran off speed while the hum was recorded) plus whole-number
// multiples of it. Music lines are short and wander, so in a long average
// they're broad hills; hum is a needle. Each candidate frequency is scored by
// how far its harmonics stand above their immediate neighbourhood (0.6 to 3 Hz away).
export function detectHum(decL, decR, fsd) {
  const N = 1 << Math.min(17, Math.max(12, Math.round(Math.log2(fsd * 5.5)))); // ~5.5 s windows: 0.18 Hz resolution
  const all = welch([decL, decR], fsd, N);
  // and the quietest 3 s stretches on their own (lead-in groove, gaps): hum is
  // always there, the music isn't, so that's where it shows most clearly
  const quiet = quietWelch(decL, decR, fsd, 1 << Math.round(Math.log2(fsd * 2.6)));
  const lines = (sp) => {
    const { P, df } = sp, L = P.map((v) => db(v));
    // how far a line at F stands above its neighbourhood (0.6 to 3 Hz away), in dB
    return (F) => {
      const k = F / df, k0 = Math.round(k);
      if (k0 < 3 || k0 > P.length - 40) return { prom: -99, peakHz: F, level: -200 };
      let best = k0;
      for (let j = k0 - 1; j <= k0 + 1; j++) if (L[j] > L[best]) best = j;
      const a = L[best - 1], b = L[best], c = L[best + 1], den = a - 2 * b + c;
      const shift = Math.abs(den) > 1e-9 ? Math.max(-0.5, Math.min(0.5, 0.5 * (a - c) / den)) : 0;
      const lo = Math.max(2, Math.round(0.6 / df)), hi = Math.max(lo + 3, Math.round(3 / df));
      const ring = [];
      for (let j = lo; j <= hi; j++) { if (best - j > 0) ring.push(L[best - j]); if (best + j < L.length) ring.push(L[best + j]); }
      // against the loud end of the neighbourhood: a lone needle is hum; a needle
      // with needles either side is a repeating pattern in the music
      return { prom: b - percentile(ring, 0.85), peakHz: (best + shift) * df, level: b };
    };
  };
  const pa = lines(all), pq = quiet ? lines(quiet) : null;
  const prominence = (F) => { const a = pa(F); if (!pq) return a; const b = pq(F); return b.prom > a.prom ? { ...b, peakHz: a.prom > 6 ? a.peakHz : b.peakHz } : a; };
  const { P, df } = all;
  let bestF = 0, bestScore = -1;
  for (let f = 45; f <= 66; f += 0.02) {
    let score = 0;
    for (let h = 1; h <= 8; h++) score += Math.max(0, Math.min(40, prominence(f * h).prom)) / Math.sqrt(h);
    if (score > bestScore) { bestScore = score; bestF = f; }
  }
  // refine on the harmonics that clearly stand out
  let wsum = 0, fsum = 0;
  const harmonics = [];
  for (let h = 1; h <= 24 && bestF * h < 0.45 * fsd; h++) {
    const p = prominence(bestF * h);
    if (p.prom >= 8 && Math.abs(p.peakHz / h - bestF) < 0.3) {
      harmonics.push({ h, prom: +p.prom.toFixed(1), hz: p.peakHz });
      if (h <= 12) { const w = Math.pow(10, Math.min(p.prom, 40) / 20) * h; wsum += w; fsum += w * p.peakHz / h; }
    }
  }
  const hz = wsum ? fsum / wsum : bestF;
  const strongLow = harmonics.filter((x) => x.h <= 6 && x.prom >= 10).length;
  const found = harmonics.length >= 2 && strongLow >= 1;
  // hum level: the power in its lines (dBFS), from the averaged spectrum
  // (from the quiet stretches when there are some: there the music doesn't add to it)
  const sp = quiet || all;
  let pw = 0;
  for (const x of harmonics) { const k = Math.round(x.hz / sp.df); for (let j = k - 2; j <= k + 2; j++) pw += sp.P[j] || 0; }
  const levelDb = db(2 * pw / (sp.N * 3 * sp.N / 8) / 2); // Hann-window Parseval, per channel
  // drift: the first and second half separately
  let drift = 0;
  if (found && decL.length > fsd * 30) {
    const half = decL.length >> 1;
    const a = quickHum(decL.subarray(0, half), decR.subarray(0, half), fsd, hz), b = quickHum(decL.subarray(half), decR.subarray(half), fsd, hz);
    if (a && b) drift = Math.abs(a - b);
  }
  return { found, hz: +hz.toFixed(2), harmonics: found ? harmonics : [], levelDb: found ? +levelDb.toFixed(1) : null, drift: +drift.toFixed(2), score: +bestScore.toFixed(1) };
}
function quietWelch(l, r, fsd, N) {
  const hop = N >> 1, segs = Math.floor((l.length - N) / hop) + 1;
  if (segs < 6) return null;
  const e = [];
  for (let s = 0; s < segs; s++) { let v = 0; for (let i = s * hop; i < s * hop + N; i += 4) v += l[i] * l[i] + r[i] * r[i]; e.push([v, s]); }
  e.sort((a, b) => a[0] - b[0]);
  // only stretches about as quiet as the quietest (within 5 dB), at most a fifth of the file
  const pick = e.filter((x, i) => i === 0 || (x[0] <= 3 * e[0][0] && i < Math.max(1, Math.round(segs * 0.2)))).map((x) => x[1] * hop);
  const L = new Float32Array(pick.length * N), R = new Float32Array(pick.length * N);
  // stitched end to end: welch() then takes each one as a window of its own
  pick.forEach((at, j) => { L.set(l.subarray(at, at + N), j * N); R.set(r.subarray(at, at + N), j * N); });
  const w = welchAt([L, R], fsd, N, pick.map((_, j) => j * N));
  return w;
}
function welchAt(chans, fs, N, starts) {
  const w = hann(N), f = fftFor(N), P = new Float64Array(N / 2 + 1), re = new Float64Array(N), im = new Float64Array(N);
  for (const at of starts) for (const x of chans) {
    for (let i = 0; i < N; i++) { re[i] = x[at + i] * w[i]; im[i] = 0; }
    f.forward(re, im);
    for (let k = 0; k <= N / 2; k++) P[k] += re[k] * re[k] + im[k] * im[k];
  }
  for (let k = 0; k <= N / 2; k++) P[k] /= starts.length;
  return { P, df: fs / N, N };
}
function quickHum(l, r, fsd, near) {
  const N = 1 << Math.min(17, Math.max(12, Math.round(Math.log2(fsd * 5.5))));
  if (l.length < N) return 0;
  const { P, df } = welch([l, r], fsd, N, 24);
  let best = Math.round(near / df);
  for (let k = Math.round((near - 1) / df); k <= Math.round((near + 1) / df); k++) if (P[k] > P[best]) best = k;
  return best * df;
}

// ---------- tuning / speed ----------
// Polka bands tuned to A440 (mostly). Every steady note in the recording sits
// a whole number of semitones from A440, so the cents left over (mod 100) pile
// up at one value: how far off the whole transfer is. A long average over many
// notes, so one out-of-tune instrument doesn't decide it. Returns cents sharp
// (positive) or flat (negative), between -50 and +50.
export function detectTuning(mid, fsd, a4 = 440) {
  const N = 4096, Z = 8192, hop = 2048, w = hann(N), f = fftFor(Z);
  const total = Math.max(0, Math.floor((mid.length - N) / hop) + 1), use = Math.min(total, 2400);
  const hist = new Float64Array(100), re = new Float64Array(Z), im = new Float64Array(Z), mag = new Float64Array(Z / 2);
  const lo = Math.ceil(100 * Z / fsd), hi = Math.min(Z / 2 - 2, Math.floor(2500 * Z / fsd));
  let peaks = 0, voiced = 0;
  for (let s = 0; s < use; s++) {
    const at = Math.floor((s + 0.5) * total / use) * hop;
    re.fill(0); im.fill(0);
    let e = 0;
    for (let i = 0; i < N; i++) { const v = mid[at + i]; re[i] = v * w[i]; e += v * v; }
    if (e / N < 1e-7) continue; // quieter than about -70 dB: nothing to hear
    f.forward(re, im);
    let mx = -1e9;
    for (let k = lo - 2; k <= hi + 2; k++) { mag[k] = db(re[k] * re[k] + im[k] * im[k]); if (k >= lo && k <= hi && mag[k] > mx) mx = mag[k]; }
    // the strongest clear peaks in this frame
    const cand = [];
    for (let k = lo; k <= hi; k++) {
      if (mag[k] < mx - 30 || mag[k] < mag[k - 1] || mag[k] < mag[k + 1]) continue;
      // stands well clear of its surroundings (a real tone, not a noise wiggle)
      const ring = (mag[k - 8] + mag[k + 8] + mag[k - 12] + mag[k + 12]) / 4;
      if (mag[k] - ring < 10) continue;
      cand.push(k);
    }
    cand.sort((x, y) => mag[y] - mag[x]);
    if (cand.length) voiced++;
    for (const k of cand.slice(0, 10)) {
      const a = mag[k - 1], b = mag[k], c = mag[k + 1], den = a - 2 * b + c;
      const shift = Math.abs(den) > 1e-9 ? 0.5 * (a - c) / den : 0;
      const hz = (k + shift) * fsd / Z, cents = 1200 * Math.log2(hz / a4);
      const dev = ((cents % 100) + 150) % 100 - 50;  // -50..50 from the nearest note
      const weight = Math.pow(10, (b - mx) / 40);    // louder peaks count more (gently)
      const bin = ((Math.round(dev) % 100) + 100) % 100;
      hist[bin] += weight; peaks++;
    }
  }
  if (peaks < 30) return { found: false, cents: 0, confidence: 0, peaks, voiced, hist: Array.from(hist) };
  // circular smoothing, peak, then a weighted circular mean around it
  const sm = new Float64Array(100);
  for (let i = 0; i < 100; i++) for (let j = -6; j <= 6; j++) sm[i] += hist[(i + j + 100) % 100] * Math.exp(-(j * j) / (2 * 2.5 * 2.5));
  let top = 0;
  for (let i = 0; i < 100; i++) if (sm[i] > sm[top]) top = i;
  let sx = 0, sy = 0, inside = 0, all = 0;
  for (let i = 0; i < 100; i++) {
    all += hist[i];
    const d = ((i - top + 150) % 100) - 50;
    if (Math.abs(d) <= 15) { const ang = 2 * Math.PI * i / 100; sx += hist[i] * Math.cos(ang); sy += hist[i] * Math.sin(ang); }
    if (Math.abs(d) <= 10) inside += hist[i];
  }
  let cents = Math.atan2(sy, sx) / (2 * Math.PI) * 100;
  cents = ((cents + 150) % 100) - 50;
  // shift the bin index frame back: bin i holds deviations around i (0..99) mapped as -50..49
  const dev = ((cents % 100) + 100) % 100;
  const offset = dev >= 50 ? dev - 100 : dev;
  const share = inside / Math.max(1e-12, all);      // a uniform spread would put 21% within 10 cents
  const confidence = Math.max(0, Math.min(1, (share - 0.21) / 0.5));
  return { found: confidence > 0.15, cents: +offset.toFixed(1), confidence: +confidence.toFixed(2), peaks, voiced, hist: Array.from(hist) };
}

// Plain English for a tuning offset (cents sharp > 0)
export function describeSpeed(cents, a4 = 440) {
  const pct = (Math.pow(2, Math.abs(cents) / 1200) - 1) * 100;
  if (Math.abs(cents) < 5) return `This transfer is in tune with A${a4} (within 5 cents), so the speed is right.`;
  const sharp = cents > 0;
  return `This transfer runs ${Math.abs(cents).toFixed(0)} cents ${sharp ? "sharp" : "flat"}, about ${pct.toFixed(1)}% ${sharp ? "fast" : "slow"} (the deck was likely running ${sharp ? "fast" : "slow"}).`;
}

// ---------- wow (slow pitch wobble) ----------
// Wow is the slow wobble of a warped record or a stretched tape: the whole
// band drifts sharp and flat a few times a second. Every steady partial in the
// music wobbles together, so the frame-to-frame pitch change of many partials
// (measured precisely from the phase, like a phase vocoder) is combined with a
// weighted median, added up into a pitch curve, and kept to 0.25..6 Hz.
// Returns { rate: 50, cents: Float32Array (50 per second over the input),
//           peak, rms, hz (the main wobble rate), confidence 0..1 per value }.
export function detectWow(mid, fsd) {
  // ~5.5-6 kHz copy is plenty for partials up to 2.5 kHz
  const f2 = Math.round(fsd / 5800) || 1, fs = fsd / f2;
  const dec = new Decimator(fsd, f2).push(mid);
  const N = 512, H = 128, w = hann(N), F = fftFor(N), half = N / 2;    // 87 ms frames: shorter than a polka note
  const frames = Math.max(0, Math.floor((dec.length - N) / H) + 1);
  const re = new Float64Array(N), im = new Float64Array(N), mag = new Float64Array(half), phase = new Float64Array(half), prevPhase = new Float64Array(half);
  const ifr = new Float64Array(half), prevIf = new Float64Array(half), prevMag = new Float64Array(half);
  const D = new Float64Array(frames), used = new Float64Array(frames), flux = new Float64Array(frames);
  const lo = Math.ceil(150 * N / fs), hi = Math.min(half - 2, Math.floor(2500 * N / fs));
  const expect = (k) => 2 * Math.PI * k * H / N;
  const wrap = (a) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
  for (let t = 0; t < frames; t++) {
    const at = t * H;
    for (let i = 0; i < N; i++) { re[i] = dec[at + i] * w[i]; im[i] = 0; }
    F.forward(re, im);
    let mx = 0, up = 0, tot = 0;
    for (let k = 0; k < half; k++) {
      mag[k] = Math.hypot(re[k], im[k]); phase[k] = Math.atan2(im[k], re[k]);
      if (k >= lo && k <= hi) { if (mag[k] > mx) mx = mag[k]; up += Math.max(0, mag[k] - prevMag[k]); tot += mag[k]; }
    }
    flux[t] = tot > 0 ? up / tot : 0;   // how much new sound arrived (a note or a hit starting)
    for (let k = lo; k <= hi; k++) ifr[k] = (k + wrap(phase[k] - prevPhase[k] - expect(k)) / expect(1)) * fs / N;
    if (t >= 2 && mx > 1e-5) {
      const ds = [], ws = [];
      for (let k = lo; k <= hi; k++) {
        if (mag[k] < 0.03 * mx || mag[k] < mag[k - 1] || mag[k] < mag[k + 1]) continue;
        // the same partial a hop ago (it can move a bin)
        let pk = -1, pd = 1e9;
        for (let j = k - 1; j <= k + 1; j++) if (prevMag[j] > 0.3 * mag[k] && Math.abs(prevIf[j] - ifr[k]) < pd) { pd = Math.abs(prevIf[j] - ifr[k]); pk = j; }
        if (pk < 0 || prevIf[pk] <= 0 || ifr[k] <= 0) continue;
        const d = 1200 * Math.log2(ifr[k] / prevIf[pk]);
        if (Math.abs(d) > 8 || Math.abs(prevMag[pk] - mag[k]) > 0.5 * mag[k]) continue; // a note change or an onset, not wobble
        ds.push(d); ws.push(mag[k]);
      }
      if (ds.length >= 2) { D[t] = weightedMedian(ds, ws); used[t] = ds.length; }
    }
    prevPhase.set(phase); prevIf.set(ifr); prevMag.set(mag);
  }
  // When a chord changes, a harmonic of the new chord can sit a few cents from
  // one of the old (a fifth's third harmonic against an octave), which reads as
  // a tiny pitch step; hundreds of those would add up to a wobble that isn't
  // there. So the frames around each note or hit starting are skipped, and the
  // slope is bridged across them from either side (wow changes slowly).
  const fluxRef = median(Array.from(flux).filter((v) => v > 0)) || 0;
  const bad = new Uint8Array(frames), span = Math.ceil(N / H) + 1;
  for (let t = 1; t < frames; t++) if (flux[t] > Math.max(0.08, 2.5 * fluxRef)) for (let j = t; j < Math.min(frames, t + span); j++) bad[j] = 1;
  for (let t = 0; t < frames; t++) if (!used[t]) bad[t] = 1;
  const rate = fs / H;
  for (let t = 0; t < frames;) {
    if (!bad[t]) { t++; continue; }
    let k = t; while (k < frames && bad[k]) k++;
    const a = t > 0 ? D[t - 1] : 0, b = k < frames ? D[k] : a, gap = k - t;
    const fillable = gap <= rate * 0.6;                 // bridge up to 0.6 s, else assume no change
    for (let j = t; j < k; j++) { D[j] = fillable ? a + (b - a) * (j - t + 1) / (gap + 1) : 0; used[j] = fillable ? 2 : 0; }
    t = k;
  }
  // add up the changes into a pitch curve, then keep only the wobble band
  const c = new Float64Array(frames);
  for (let t = 1; t < frames; t++) c[t] = c[t - 1] + D[t];
  if (frames < rate * 4) return { rate: 50, cents: new Float32Array(Math.ceil(mid.length / fsd * 50)), peak: 0, rms: 0, hz: 0, confidence: 0, found: false };
  let curve = zeroPhase(butterworth("hp", 0.25, rate, 2), c);
  curve = zeroPhase(butterworth("lp", 6, rate, 4), curve);
  // where too few partials were heard, trust the curve less (fade it out)
  const conf = new Float64Array(frames);
  for (let t = 0; t < frames; t++) conf[t] = Math.min(1, used[t] / 2);
  const confS = zeroPhase(butterworth("lp", 1, rate, 2), conf);
  // onto a 50-per-second grid over the input's own time (frame t is centred at (t*H + N/2) / fs; D[t] is between t-1 and t)
  const seconds = mid.length / fsd, out = new Float32Array(Math.ceil(seconds * 50) + 1), cOut = new Float32Array(out.length);
  for (let i = 0; i < out.length; i++) {
    const t = ((i / 50) * fs - N / 2) / H + 0.5, j = Math.floor(t), fr = t - j;
    const get = (a, q) => a[Math.max(0, Math.min(frames - 1, q))];
    const cv = get(curve, j) + fr * (get(curve, j + 1) - get(curve, j));
    const cc = Math.max(0, Math.min(1, get(confS, j) + fr * (get(confS, j + 1) - get(confS, j))));
    out[i] = cv * cc; cOut[i] = cc;
  }
  let peak = 0, ss = 0, cn = 0;
  for (let i = 0; i < out.length; i++) { if (cOut[i] > 0.5) { peak = Math.max(peak, Math.abs(out[i])); ss += out[i] * out[i]; cn++; } }
  const rms = cn ? Math.sqrt(ss / cn) : 0;
  const { hz, prominence } = mainRate(out, 50);
  const confidence = cn / out.length;
  // On busy polka with no wow at all, the curve wanders 1 to 2.5 cents RMS by
  // itself, slowly and without a beat. Wow counts when it's bigger than that
  // and repeats at a clear rate (a beat 12 dB over the rest, at least 0.4 times a
  // second; damaged transfers with no wow measured up to 13 in testing).
  const found = rms >= 2 && confidence > 0.3 && prominence >= 15 && hz >= 0.4;
  return { rate: 50, cents: out, confidence: +confidence.toFixed(2), peak: +peak.toFixed(1), rms: +rms.toFixed(2), hz: +hz.toFixed(2), prominence: +prominence.toFixed(1), found };
}
function weightedMedian(v, w) {
  const idx = v.map((_, i) => i).sort((a, b) => v[a] - v[b]);
  const total = w.reduce((a, b) => a + b, 0);
  let acc = 0;
  for (const i of idx) { acc += w[i]; if (acc >= total / 2) return v[i]; }
  return v[idx[idx.length - 1]];
}
// the strongest repetition rate in a curve (0.3..6 Hz) and how clearly it
// stands out: a warp or an off-centre hole repeats once per turn, a sharp peak;
// the measuring noise wanders without one
function mainRate(x, rate) {
  let N = 1; while (N < x.length) N <<= 1;
  N = Math.min(N, 1 << 16);
  const re = new Float64Array(N), im = new Float64Array(N), w = hann(Math.min(N, x.length));
  for (let i = 0; i < Math.min(N, x.length); i++) re[i] = x[i] * w[i];
  fftFor(N).forward(re, im);
  // whitened (times f squared): the measuring noise adds up like a random walk,
  // whose spectrum falls as 1/f^2, so this flattens it and a real beat stands out
  const lo = Math.ceil(0.3 * N / rate), hi = Math.floor(6 * N / rate), P = [];
  for (let k = lo; k <= hi; k++) P.push((re[k] * re[k] + im[k] * im[k]) * k * k);
  // smoothed over about 0.05 Hz so a peak's few bins count together
  const half = Math.max(1, Math.round(0.025 * N / rate)), sm = P.map((_, i) => { let s = 0, c = 0; for (let j = Math.max(0, i - half); j <= Math.min(P.length - 1, i + half); j++) { s += P[j]; c++; } return s / c; });
  let bk = -1;
  const from = Math.max(0, Math.ceil(0.4 * N / rate) - lo);
  for (let i = from; i < sm.length; i++) if (bk < 0 || sm[i] > sm[bk]) bk = i;
  if (bk < 0) return { hz: 0, prominence: 0 };
  return { hz: (lo + bk) * rate / N, prominence: sm[bk] / (median(sm) + 1e-30) };
}
export function describeWow(w) {
  if (!w || !w.found) return "No noticeable wow (slow pitch wobble).";
  const turns = [[100 / 3 / 60, "one turn of a 33 rpm record"], [45 / 60, "one turn of a 45"], [78 / 60, "one turn of a 78"]];
  const match = turns.find(([f]) => Math.abs(w.hz - f) / f < 0.06);
  const why = match ? ` That's ${match[1]}, so it's likely an off-centre hole or a warp.` : "";
  return `Wow (a slow pitch wobble, like a warped record or a stretched tape): up to ${w.peak.toFixed(0)} cents, about ${w.hz.toFixed(2)} times a second.${why}`;
}

// ---------- tape dropouts ----------
// A dropout is a moment where the tape lost contact with the head: the highs
// vanish, hiss and all. Music never goes quieter than the tape's own hiss, so a
// dip of the treble below the hiss floor is a dropout, not a quiet bar.
// noise: the learned noise profile ({ profile, N, fs }), which says exactly how
// loud the hiss is up there; without one, the quietest 1% of the file stands in.
export function detectDropouts(decL, decR, fsd, noise = null) {
  const hop = Math.round(0.005 * fsd), out = [];
  const hpHz = Math.min(3000, 0.3 * fsd);
  let hissDb = null;
  if (noise?.profile) {
    const { profile, N, fs } = noise;
    let p = 0;
    for (let k = Math.ceil(hpHz * N / fs); k <= Math.floor(0.42 * fsd * N / fs) && k < profile.length; k++) p += profile[k];
    hissDb = db(2 * p / (N * 3 * N / 8) / 2);
  }
  for (const [ch, x] of [[0, decL], [1, decR]]) {
    const y = Float64Array.from(x);
    new BiquadChain(butterworth("hp", hpHz, fsd, 4), 1).process(0, y);
    const nf = Math.floor(y.length / hop), env = new Float64Array(nf);
    for (let j = 0; j < nf; j++) { let s = 0; for (let i = j * hop; i < (j + 1) * hop; i++) s += y[i] * y[i]; env[j] = db(s / hop); }
    const live = Array.from(env).filter((v) => v > -110);            // ignore digital silence
    if (live.length < 200) continue;
    const floor = hissDb ?? percentile(live, 0.01);                    // the hiss
    if (percentile(live, 0.5) < floor + 6) continue;                    // highs barely above the hiss: nothing to lose
    const thr = floor - 6;
    let j = 0;
    while (j < nf) {
      if (env[j] < thr && env[j] > -110) {
        let k = j; let low = env[j];
        while (k + 1 < nf && env[k + 1] < thr + 2 && env[k + 1] > -110) { k++; low = Math.min(low, env[k]); }
        const dur = (k - j + 1) * hop / fsd;
        if (dur >= 0.01 && dur <= 1.0) out.push({ start: +(j * hop / fsd).toFixed(3), end: +((k + 1) * hop / fsd).toFixed(3), depthDb: +(floor - low).toFixed(1), ch });
        j = k + 1;
      } else j++;
    }
  }
  // the same dropout in both channels is one event
  out.sort((a, b) => a.start - b.start);
  const merged = [];
  for (const d of out) {
    const last = merged[merged.length - 1];
    if (last && d.start <= last.end + 0.01) { last.end = Math.max(last.end, d.end); last.depthDb = Math.max(last.depthDb, d.depthDb); last.ch = last.ch === d.ch ? d.ch : 2; }
    else merged.push({ ...d });
  }
  return merged;
}

// ---------- track gaps ----------
// The songs on an LP or tape side are separated by a few seconds of groove
// noise or hiss: quieter than any music, louder than silence. Frames well below
// the music and near the side's own noise floor, for long enough, are a gap.
export function findTracks(mid, fsd, { minGap = 1.2, minSong = 20 } = {}) {
  const y = Float64Array.from(mid);
  new BiquadChain(butterworth("hp", 100, fsd, 2), 1).process(0, y);
  const hop = Math.round(0.05 * fsd), nf = Math.floor(y.length / hop), lv = new Float64Array(nf);
  for (let j = 0; j < nf; j++) { let s = 0; for (let i = j * hop; i < (j + 1) * hop; i++) s += y[i] * y[i]; lv[j] = db(s / hop); }
  const seconds = nf * 0.05;
  if (nf < 40) return { tracks: [{ start: 0, end: seconds }], gaps: [], seconds };
  const live = Array.from(lv).filter((v) => v > -120);
  const floor = percentile(live, 0.05), music = percentile(live, 0.9);
  const thr = floor + Math.max(6, 0.3 * (music - floor));
  // smooth a little so one loud click in a gap doesn't split it
  const sm = new Float64Array(nf);
  for (let j = 0; j < nf; j++) { const a = Math.max(0, j - 3), b = Math.min(nf, j + 4); const t = Float64Array.from(lv.subarray(a, b)); sm[j] = medianInPlace(t, t.length); }
  const quiet = Array.from(sm, (v) => v < thr);
  // music runs, joined across short dips
  let runs = [], j = 0;
  while (j < nf) {
    if (quiet[j]) { j++; continue; }
    let k = j; while (k < nf && !quiet[k]) k++;
    runs.push([j, k]); j = k;
  }
  const gapF = Math.round(minGap / 0.05);
  const joined = [];
  for (const r of runs) { const last = joined[joined.length - 1]; if (last && r[0] - last[1] < gapF) last[1] = r[1]; else joined.push([...r]); }
  // drop slivers (a needle drop, a thump) and merge songs shorter than minSong into a neighbour
  let songs = joined.filter((r) => (r[1] - r[0]) * 0.05 >= 3);
  for (let changed = true; changed && songs.length > 1;) {
    changed = false;
    for (let i = 0; i < songs.length; i++) {
      if ((songs[i][1] - songs[i][0]) * 0.05 >= minSong) continue;
      const prevGap = i > 0 ? songs[i][0] - songs[i - 1][1] : 1e9, nextGap = i < songs.length - 1 ? songs[i + 1][0] - songs[i][1] : 1e9;
      if (prevGap <= nextGap && i > 0) { songs[i - 1][1] = songs[i][1]; songs.splice(i, 1); }
      else if (i < songs.length - 1) { songs[i + 1][0] = songs[i][0]; songs.splice(i, 1); }
      else continue;
      changed = true; break;
    }
  }
  if (!songs.length) return { tracks: [{ start: 0, end: seconds }], gaps: [], seconds };
  const gaps = [];
  for (let i = 1; i < songs.length; i++) gaps.push({ start: +(songs[i - 1][1] * 0.05).toFixed(2), end: +(songs[i][0] * 0.05).toFixed(2) });
  // tracks butt together (so the side can be played back seamlessly): each split
  // sits just before the next song starts, the gap's groove noise ends the track before
  const tracks = songs.map((s, i) => {
    const start = i === 0 ? Math.max(0, s[0] * 0.05 - 0.5) : Math.max(gaps[i - 1].start, gaps[i - 1].end - Math.min(0.5, (gaps[i - 1].end - gaps[i - 1].start) / 3));
    return { start: +start.toFixed(2) };
  });
  tracks.forEach((t, i) => { t.end = i < tracks.length - 1 ? tracks[i + 1].start : +Math.min(seconds, songs[i][1] * 0.05 + 2).toFixed(2); });
  return { tracks, gaps, seconds, floorDb: +floor.toFixed(1), musicDb: +music.toFixed(1) };
}

// ---------- noise profile ----------
// The quietest stretches (the lead-in groove, the gaps between songs, tape
// leader) are mostly noise. Pick them by energy; reject any with clicks or a
// clear musical note; average their spectra. hum: Hz lines to ignore when judging "a note".
export function quietSpots(hopEnergy, hop, N, want = 160) {
  const idx = [];
  for (let i = 0; i < hopEnergy.length; i++) if (hopEnergy[i] > 1e-13) idx.push(i);  // not digital silence
  idx.sort((a, b) => hopEnergy[a] - hopEnergy[b]);
  const take = idx.slice(0, Math.min(idx.length, Math.max(want, Math.round(idx.length * 0.03))));
  return take.slice(0, want * 3).map((i) => i * hop);
}
export function noiseProfile(frames, fs, { hum = null } = {}) {
  // frames: [{ l, r }] each N samples long
  const N = frames[0]?.l.length || nrFrame(fs), half = N / 2, w = hann(N), F = fftFor(N);
  const re = new Float64Array(N), im = new Float64Array(N), keep = [];
  const humBins = new Set();
  if (hum?.found) for (const x of hum.harmonics) { const k = Math.round(x.hz * N / fs); for (let j = k - 3; j <= k + 3; j++) humBins.add(j); }
  for (const { l, r } of frames) {
    // a click in it? (a peak far above the stretch's own level, after a high-pass)
    let pk = 0, ss = 0;
    for (let i = 1; i < N; i++) { const d = l[i] - l[i - 1]; pk = Math.max(pk, Math.abs(d)); ss += d * d; }
    if (pk > 8 * Math.sqrt(ss / N)) continue;
    for (let i = 0; i < N; i++) { re[i] = l[i] * w[i]; im[i] = r[i] * w[i]; }
    F.forward(re, im);
    const P = new Float64Array(half + 1);
    for (let k = 0; k <= half; k++) { const k2 = (N - k) % N; P[k] = 0.5 * (re[k] * re[k] + im[k] * im[k] + re[k2] * re[k2] + im[k2] * im[k2]); }
    // a musical note: a line far above its neighbourhood (hum lines excepted)
    let tonal = false;
    for (let k = 8; k < half - 8 && !tonal; k++) {
      if (humBins.has(k) || P[k] < P[k - 1] || P[k] < P[k + 1]) continue;
      const ring = (P[k - 6] + P[k + 6] + P[k - 8] + P[k + 8]) / 4;
      if (P[k] > 300 * ring && P[k] > 1e-9) tonal = true;
    }
    if (!tonal) keep.push(P);
    if (keep.length >= 160) break;
  }
  if (keep.length < 6) return null;
  // per frequency: the mean of the quieter 80% (a stray louder moment doesn't count), with that trim's bias undone
  const prof = new Float32Array(half + 1), col = new Float64Array(keep.length);
  const m = Math.max(3, Math.floor(keep.length * 0.8));
  for (let k = 0; k <= half; k++) {
    for (let j = 0; j < keep.length; j++) col[j] = keep[j][k];
    const s = Float64Array.from(col).sort();
    let sum = 0; for (let j = 0; j < m; j++) sum += s[j];
    prof[k] = sum / m * 1.25;
  }
  // hum lines aren't noise: de-hum takes them out before noise reduction runs,
  // and leaving them in would make noise reduction turn the tuba down there too.
  // Bridge each hum line with the noise on either side of it.
  if (hum?.found) {
    const mask = new Uint8Array(half + 1);
    for (const x of hum.harmonics) { const k = Math.round(x.hz * N / fs); for (let j = Math.max(1, k - 3); j <= Math.min(half, k + 3); j++) mask[j] = 1; }
    for (let j = 1; j <= half;) {
      if (!mask[j]) { j++; continue; }
      let e = j; while (e + 1 <= half && mask[e + 1]) e++;
      // anchored on the clean neighbours (not the DC bin), straight across in dB
      const hi = e + 1 <= half ? prof[e + 1] : prof[j - 1], lo = j - 1 > 0 ? prof[j - 1] : hi;
      const a = Math.log(lo + 1e-30), b = Math.log(hi + 1e-30);
      for (let q = j; q <= e; q++) prof[q] = Math.min(prof[q], Math.exp(a + (b - a) * (q - j + 1) / (e - j + 2)));
      j = e + 1;
    }
  }
  return { profile: prof, frames: keep.length, rmsDb: profileDb(prof, N) };
}
// the noise level a profile describes, dBFS RMS per channel
export function profileDb(prof, N) {
  let t = 0;
  for (let k = 0; k < prof.length; k++) t += (k === 0 || k === prof.length - 1 ? 1 : 2) * prof[k];
  return +db(t / (N * (3 * N / 8)) / 2).toFixed(1);
}

// ---------- channels ----------
// From loud windows (full rate): how alike the channels are, which is louder,
// whether one is upside down, and how far one lags the other (cassette azimuth:
// a head tilted a fraction of a degree delays one track by tens of microseconds
// and dulls the highs when they're summed).
export function measureChannels(windows, fs) {
  let ll = 0, rr = 0, lr = 0, mm = 0, ss = 0;
  const delays = [], levelDiffs = [];
  const maxLag = Math.max(4, Math.round(0.0008 * fs));
  for (const { l, r } of windows) {
    let a = 0, b = 0, c = 0;
    for (let i = 0; i < l.length; i++) { a += l[i] * l[i]; b += r[i] * r[i]; c += l[i] * r[i]; const m = l[i] + r[i], s = l[i] - r[i]; mm += m * m; ss += s * s; }
    ll += a; rr += b; lr += c;
    if (a > 1e-9 && b > 1e-9) levelDiffs.push(10 * Math.log10(a / b));
    // delay from the highs (where it matters, and where the peak is sharp)
    const hpL = Float64Array.from(l), hpR = Float64Array.from(r), f = butterworth("hp", Math.min(1000, 0.2 * fs), fs, 4);
    new BiquadChain(f, 1).process(0, hpL); new BiquadChain(f, 1).process(0, hpR);
    const xc = new Float64Array(2 * maxLag + 1);
    let el = 0, er = 0;
    for (let i = maxLag; i < hpL.length - maxLag; i++) { el += hpL[i] * hpL[i]; er += hpR[i] * hpR[i]; }
    for (let d = -maxLag; d <= maxLag; d++) { let s = 0; for (let i = maxLag; i < hpL.length - maxLag; i++) s += hpL[i] * hpR[i + d]; xc[d + maxLag] = s / Math.sqrt(el * er + 1e-30); }
    let bi = 0; for (let k = 1; k < xc.length; k++) if (Math.abs(xc[k]) > Math.abs(xc[bi])) bi = k;
    if (Math.abs(xc[bi]) > 0.4 && bi > 0 && bi < xc.length - 1) {
      const y0 = Math.abs(xc[bi - 1]), y1 = Math.abs(xc[bi]), y2 = Math.abs(xc[bi + 1]), den = y0 - 2 * y1 + y2;
      delays.push({ d: bi - maxLag + (Math.abs(den) > 1e-12 ? 0.5 * (y0 - y2) / den : 0), c: xc[bi] });
    }
  }
  const corr = lr / Math.sqrt(ll * rr + 1e-30);
  // the side (left minus right) with the two levels matched first, so a mono
  // record with one channel quieter still reads as mono: 2 (1 - corr) / 2 (1 + corr)
  const sideDb = 10 * Math.log10((1 - corr + 1e-12) / (1 + corr + 1e-12));
  const goodDelays = delays.filter((d) => Math.abs(d.c) > 0.5).map((d) => d.d);
  const delay = goodDelays.length >= 3 ? median(goodDelays) : 0;
  return {
    corr: +corr.toFixed(3), sideDb: +sideDb.toFixed(1), balanceDb: +(levelDiffs.length ? median(levelDiffs) : 0).toFixed(2),
    delay: +delay.toFixed(2), delayUs: +(delay / fs * 1e6).toFixed(1), delayN: goodDelays.length,
    // stricter than it needs to be: better to leave a narrow stereo mix alone than to fold it to mono
    mono: sideDb < -26, nearlyMono: sideDb < -14, flipped: corr < -0.5,
  };
}

// ---------- clicks (sampled) ----------
// How clicky is it? The de-clicker in "just count" mode on a few dozen short
// windows across the file, each channel separately (for picking the better
// channel of a mono record).
export function countClicks(windows, fs, settings = { clicks: 50, crackle: 40 }) {
  const per = [{ click: 0, crackle: 0 }, { click: 0, crackle: 0 }], all = [];
  let seconds = 0;
  for (const { l, r, at } of windows) {
    const d = new Declicker(fs, { ...settings, detectOnly: true });
    d.push([l, r]); d.flush();
    for (const e of d.events) { if (e.kind !== "long") per[e.ch][e.kind]++; if (e.ch === 0) all.push(at + e.at); }
    seconds += l.length / fs;
  }
  const perMin = (c) => +((c.click + c.crackle) / Math.max(1e-9, seconds) * 60).toFixed(0);
  return { seconds: +seconds.toFixed(1), left: per[0], right: per[1], perMinute: [perMin(per[0]), perMin(per[1])], positions: all };
}

// ---------- putting it together ----------
// report: everything the detectors found. Returns { settings, findings }:
// settings as defaultSettings(source) with modules switched on where they're
// needed; findings: [{ module, text, level: "ok" | "info" | "fix" | "warn" }].
export function recommend(report, source = "lp") {
  const s = defaultSettings(source), F = [];
  const say = (module, level, text) => F.push({ module, level, text });
  const src = SOURCES.find((x) => x.id === source)?.name ?? "this source";
  const tape = ["cassette", "8track", "reel"].includes(source);
  // level and clipping
  if (report.clipSamples > 0) say("clip", "warn", `Clipping: ${report.clipping.length} spot${report.clipping.length === 1 ? "" : "s"} where the transfer hit the top and flattened out (first at ${fmtTime(report.clipping[0].start)}). That can't be undone here; if you can, transfer it again with the input level a little lower.`);
  else say("clip", "ok", `No clipping. The loudest peak is ${report.peakDb.toFixed(1)} dBFS.`);
  // DC
  if (Math.max(Math.abs(report.dc[0]), Math.abs(report.dc[1])) > 0.002) say("rumble", "fix", "There's a DC offset (the waveform sits off-centre). The rumble filter takes it out.");
  // noise
  const nz = report.noise;
  if (nz) {
    const snr = report.musicDb != null ? report.musicDb - nz.rmsDb : null;
    const what = tape ? "tape hiss" : source === "78" || source === "lp" ? "surface noise" : "background noise";
    const lvl = snr == null ? "" : snr < 35 ? "That's heavy." : snr < 50 ? "That's clearly audible in quiet parts." : snr < 65 ? "That's gentle." : "That's very quiet already.";
    say("denoise", snr != null && snr < 65 ? "fix" : "ok", `Background noise (${what}) sits at about ${nz.rmsDb.toFixed(0)} dBFS${snr != null ? `, ${snr.toFixed(0)} dB under the music` : ""}. ${lvl} Learned from ${nz.frames} quiet moments${nz.from ? " " + nz.from : ""}.`);
    s.denoise.profile = nz.profile;
    s.denoise.on = snr != null ? snr < 65 && source !== "cd" : false;
    if (snr != null && snr < 40) s.denoise.amount = Math.max(s.denoise.amount, 55);
  } else say("denoise", "info", "No quiet passages to learn the noise from (it's music all the way through). Pick a stretch of just noise on the timeline and press Learn noise, if you want noise reduction.");
  // hum
  const h = report.hum;
  if (h?.found) {
    const off = Math.abs(h.hz - 60) < Math.abs(h.hz - 50) ? 60 : 50;
    const shifted = Math.abs(h.hz - off) > 0.3 ? ` (${off} Hz mains, shifted by the off-speed transfer)` : "";
    say("dehum", "fix", `Hum at ${h.hz.toFixed(1)} Hz${shifted} with ${h.harmonics.length} harmonic${h.harmonics.length === 1 ? "" : "s"}, about ${h.levelDb.toFixed(0)} dBFS. The fix is a set of very narrow notches, so the tuba and bass are left alone.`);
    s.dehum = { on: true, hz: h.hz, harmonics: h.harmonics.map((x) => x.h), width: Math.max(0.6, Math.min(3, 3 * (h.drift || 0))) };
  } else say("dehum", "ok", "No mains hum.");
  // clicks
  const c = report.clicks;
  if (c) {
    const rate = Math.max(...c.perMinute);
    if (rate >= 4) {
      say("declick", "fix", `Clicks and crackle: about ${rate} a minute${c.perMinute[0] !== c.perMinute[1] ? ` (left ${c.perMinute[0]}, right ${c.perMinute[1]})` : ""}.`);
      s.declick.on = true;
      if (rate > 600) { s.declick.crackle = Math.max(s.declick.crackle, 60); }
    } else { say("declick", "ok", tape ? "No clicks (as you'd expect from tape)." : "Hardly any clicks."); s.declick.on = source === "lp" || source === "78" ? rate > 0 : false; }
  }
  // channels
  const ch = report.channels;
  if (ch) {
    s.channels.on = s.channels.on || false;
    if (ch.flipped) { say("channels", "fix", "One channel is upside down (polarity flipped). Flipping it back."); s.channels.on = true; s.channels.flip = true; }
    if (ch.mono || (source === "78" && ch.nearlyMono)) {
      // a mono record: sum, or the cleaner side if one is much worse
      const [cl, cr] = c ? c.perMinute : [0, 0];
      let mode = "sum", why = "Summing both channels cancels some of the groove noise.";
      if (c && cl > 2 * cr + 10) { mode = "right"; why = `The right channel has far fewer clicks (${cr} vs ${cl} a minute), so it's used on its own.`; }
      else if (c && cr > 2 * cl + 10) { mode = "left"; why = `The left channel has far fewer clicks (${cl} vs ${cr} a minute), so it's used on its own.`; }
      say("channels", "fix", `This is a mono recording (the two channels are ${ch.mono ? "the same" : "nearly the same"}). ${why}`);
      s.channels.on = true; s.channels.mode = mode;
      if (Math.abs(ch.balanceDb) > 0.5) { s.channels.balanceOn = true; s.channels.balanceDb = ch.balanceDb; }
    } else if (Math.abs(ch.balanceDb) > 3 && ch.corr > 0.6) say("channels", "info", `The left channel is ${Math.abs(ch.balanceDb).toFixed(1)} dB ${ch.balanceDb > 0 ? "louder" : "quieter"} than the right. If it's a stereo mix that may be on purpose; turn on Balance to even it out.`);
    if (Math.abs(ch.delay) >= 0.2 && ch.delayN >= 3 && (tape || ch.mono || ch.nearlyMono)) {
      say("channels", "fix", `The right channel ${ch.delay > 0 ? "lags" : "leads"} the left by ${Math.abs(ch.delayUs).toFixed(0)} microseconds (${Math.abs(ch.delay).toFixed(2)} samples). On tape that's the head's azimuth (its tilt); lining them up brings back the highs.`);
      s.channels.on = true; s.channels.alignOn = true; s.channels.delay = ch.delay;
    } else if (Math.abs(ch.delay) >= 0.2 && ch.delayN >= 3) say("channels", "info", `The right channel ${ch.delay > 0 ? "lags" : "leads"} the left by ${Math.abs(ch.delayUs).toFixed(0)} microseconds. On a stereo record that may be the recording itself; Align is there if you want it.`);
    if (!s.channels.on) say("channels", "ok", ch.corr > 0.98 ? "The channels match." : "Stereo, balanced, lined up.");
  }
  // speed / tuning
  const t = report.tuning;
  if (t?.found) {
    const sure = t.confidence >= 0.35 ? "" : " (not certain: few steady notes to go on)";
    const text = describeSpeed(t.cents) + sure;
    if (Math.abs(t.cents) >= 5) {
      say("speed", "fix", text + " Or the band tuned away from A440: older bands sometimes played at A=435 or A=452. Use Tune to if that's what you hear.");
      s.speed.on = t.confidence >= 0.35; s.speed.cents = -t.cents;
    } else say("speed", "ok", text);
  } else say("speed", "info", "Not enough steady notes to check the speed. Set it by ear if needed.");
  // wow
  const w = report.wow;
  if (w) {
    // switched on by itself only for an unmistakable, steady beat; otherwise it's shown for you to judge
    const clear = w.found && w.prominence >= 25 && w.rms >= 3;
    if (w.found) { say("wow", clear ? "fix" : "info", describeWow(w) + (clear ? " The fix gently follows the wobble back to steady pitch." : " It's mild or irregular; look at the graph and listen before turning on the fix.")); s.wow.on = clear; s.wow.curve = { rate: w.rate, cents: w.cents }; }
    else { say("wow", "ok", describeWow(w)); s.wow.curve = w.cents ? { rate: w.rate, cents: w.cents } : null; }
  }
  // dropouts
  const d = report.dropouts;
  if (d?.length) say("dropouts", "warn", `${d.length} dropout${d.length === 1 ? "" : "s"} (moments where the tape lost the head and the highs vanish), first at ${fmtTime(d[0].start)}. They're marked on the timeline; check those spots, and consider another pass of the tape.`);
  else if (tape) say("dropouts", "ok", "No dropouts.");
  // tracks
  const tr = report.tracks;
  if (tr?.tracks?.length > 1) say("tracks", "info", `Found ${tr.tracks.length} songs on this side. Check the split points on the timeline, then name them.`);
  return { settings: s, findings: F };
}
