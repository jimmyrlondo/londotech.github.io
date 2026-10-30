// Encore Tune: the parts with no page in them (pitch detection and what a pitch
// means for the chosen instrument), so node can test them (test-tune.mjs).
// The same YIN detector and string matching as Encore: Studio's tuner.

/** YIN pitch estimate (de Cheveigne & Kawahara): Hz, or 0 when there's no clear note */
export function estimatePitch(x, sampleRate, minHz = 25, maxHz = 2100) {
  const n = x.length;
  const tauMin = Math.max(2, Math.floor(sampleRate / maxHz));
  const tauMax = Math.min(n >> 1, Math.floor(sampleRate / minHz));
  const w = n - tauMax;
  if (w <= 0) return 0;
  let energy = 0;
  for (let i = 0; i < w; i++) energy += x[i] * x[i];
  if (energy / w < 1e-6) return 0; // quieter than about -60 dB
  const d = new Float32Array(tauMax + 1);
  for (let tau = 1; tau <= tauMax; tau++) {
    let s = 0;
    for (let i = 0; i < w; i++) { const diff = x[i] - x[i + tau]; s += diff * diff; }
    d[tau] = s;
  }
  let running = 0;
  d[0] = 1;
  for (let tau = 1; tau <= tauMax; tau++) {
    running += d[tau];
    d[tau] = running > 0 ? d[tau] * tau / running : 1;
  }
  let best = -1;
  for (let tau = tauMin; tau <= tauMax; tau++) {
    if (d[tau] < 0.12) {
      while (tau + 1 <= tauMax && d[tau + 1] < d[tau]) tau++;
      best = tau;
      break;
    }
  }
  if (best < 0) {
    let lowest = tauMin;
    for (let tau = tauMin; tau <= tauMax; tau++) if (d[tau] < d[lowest]) lowest = tau;
    if (d[lowest] < 0.3) best = lowest;
  }
  if (best < 0) return 0;
  let t = best;
  if (best > 1 && best < tauMax) {
    const a = d[best - 1], b = d[best], c = d[best + 1], denom = a - 2 * b + c;
    if (Math.abs(denom) > 1e-9) t += 0.5 * (a - c) / denom;
  }
  return sampleRate / t;
}

/** Averages a block down by `stride` (cheaper detection, plenty for 2 kHz) */
export function downsample(x, stride) {
  if (stride <= 1) return x;
  const out = new Float32Array(Math.floor(x.length / stride));
  for (let i = 0; i < out.length; i++) {
    let s = 0;
    for (let k = 0; k < stride; k++) s += x[i * stride + k];
    out[i] = s / stride;
  }
  return out;
}

const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
export function noteName(midi, withOctave = true) {
  if (midi < 0 || midi == null) return '--';
  return NAMES[((midi % 12) + 12) % 12] + (withOctave ? String(Math.floor(midi / 12) - 1) : '');
}

/**
 * What to show for a tuning: each course's notes, a pair or group at one pitch shown once with its count.
 * midi: every string, low side first. courses: strings per course (empty or all 1: single strings).
 */
export function pillsFor(midi, courses) {
  const pills = [];
  let s = 0;
  (courses && courses.length ? courses : midi.map(() => 1)).forEach((size, course) => {
    for (const note of midi.slice(s, s + size)) {
      const same = pills.find(p => p.course === course && p.note === note);
      if (same) same.count++; else pills.push({ note, course, count: 1 });
    }
    s += size;
  });
  return pills;
}

/** The pitch a note should be, in Hz, at reference `a4` in the temperament (offsets turned to `root`) */
export function noteHz(midi, a4, offsets, root) {
  return a4 * Math.pow(2, (midi + offsets[(((midi - root) % 12) + 12) % 12] / 100 - 69) / 12);
}

/**
 * What a pitch means: the string it's nearest (within 3.5 semitones) or the nearest note,
 * and how many cents off. strings: MIDI notes of the tuning (empty: chromatic).
 * offsets: the temperament's cents for C..B, turned to the key `root` (0 = C).
 */
export function reading(hz, a4, strings, offsets, root) {
  const r = { note: -1, string: -1, cents: 0, targetHz: 0 };
  if (!(hz > 0)) return r;
  const m = 69 + 12 * Math.log2(hz / a4);
  const target = n => n + offsets[(((n - root) % 12) + 12) % 12] / 100;
  if (strings.length) {
    let best = 1e9;
    strings.forEach((s, i) => {
      const c = (m - target(s)) * 100;
      if (Math.abs(c) < Math.abs(best)) { best = c; r.string = i; }
    });
    if (Math.abs(best) <= 350) { r.note = strings[r.string]; r.cents = best; }
    else r.string = -1;
  }
  if (r.string < 0) {
    let n = Math.round(m);
    for (const k of [n - 1, n + 1]) if (Math.abs(m - target(k)) < Math.abs(m - target(n))) n = k;
    r.note = n;
    r.cents = (m - target(n)) * 100;
  }
  r.targetHz = noteHz(r.note, a4, offsets, root);
  return r;
}

// ---- drums: a drum's hit isn't one clean pitch (its overtones don't line up and it dies away fast),
// so instead of following a note, each hit is caught and its spectrum's main peak measured

/** In-place radix-2 FFT (re, im: Float64Array, length a power of two) */
export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

/**
 * The main note of a drum hit, in Hz (0 when there isn't one). x: the sound just after the hit.
 * lowest: take the lowest clear peak (within 10 dB of the strongest) instead of the strongest one;
 * that's the drum's own note when you hit the middle, where the strongest peak can be an overtone.
 */
export function drumPeak(x, sampleRate, minHz, maxHz, lowest = false, size = 32768) {
  const n = Math.min(x.length, size), re = new Float64Array(size), im = new Float64Array(size);
  let energy = 0;
  for (let i = 0; i < n; i++) { re[i] = x[i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1))); energy += x[i] * x[i]; }
  if (energy / n < 1e-6) return 0;
  fft(re, im);
  const lo = Math.max(2, Math.floor(minHz * size / sampleRate)), hi = Math.min(size / 2 - 2, Math.ceil(maxHz * size / sampleRate));
  const mag = k => Math.log(re[k] * re[k] + im[k] * im[k] + 1e-20);
  let best = lo;
  for (let k = lo; k <= hi; k++) if (mag(k) > mag(best)) best = k;
  if (lowest) {
    const floor = mag(best) - Math.log(10);  // 10 dB under the strongest, in power
    for (let k = lo + 1; k < best; k++)
      if (mag(k) > floor && mag(k) >= mag(k - 1) && mag(k) >= mag(k + 1)) { best = k; break; }
  }
  const a = mag(best - 1), b = mag(best), c = mag(best + 1), denom = a - 2 * b + c;
  const shift = Math.abs(denom) > 1e-12 ? 0.5 * (a - c) / denom : 0;
  return (best + shift) * sampleRate / size;
}

/** How far each rod's pitch is from the average of the ones measured, in cents (null where not measured yet) */
export function rodSpread(hz) {
  const got = hz.filter(h => h > 0);
  if (!got.length) return { mean: 0, cents: hz.map(() => null) };
  const mean = Math.pow(2, got.reduce((s, h) => s + Math.log2(h), 0) / got.length);
  return { mean, cents: hz.map(h => h > 0 ? 1200 * Math.log2(h / mean) : null) };
}

/** Notes for toms tuned in steps: the highest tom's note, then each one `step` semitones lower */
export function tomSteps(top, count, step) {
  return Array.from({ length: count }, (_, i) => top - i * step);
}
