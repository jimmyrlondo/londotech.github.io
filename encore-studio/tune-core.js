// Encore Tune: the parts with no page in them (pitch detection and what a pitch
// means for the chosen instrument), so node can test them (test-tune.mjs).
// The same YIN detector and string matching as Encore: Studio's tuner.

/** YIN pitch estimate (de Cheveigne & Kawahara): Hz, or 0 when there's no clear note */
export function estimatePitch(x, sampleRate, minHz = 28, maxHz = 2100) {
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
  r.targetHz = a4 * Math.pow(2, (target(r.note) - 69) / 12);
  return r;
}
