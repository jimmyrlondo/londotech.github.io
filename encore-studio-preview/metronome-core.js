// Encore Metronome: the parts with no page in them (the beat grid, the click
// sounds, the click engine the AudioWorklet runs, and Time check's onset
// detection and timing analysis), so node can test them (test-metronome.mjs).
// The worklet runs ClickEngine itself, so what node tests is what you hear.

export const MIN_BPM = 20, MAX_BPM = 400;
export const clampBpm = b => Math.min(MAX_BPM, Math.max(MIN_BPM, +b || 120));

// a count's level: 3 strong accent, 2 normal, 1 soft, 0 silent
export const LEVEL_NAMES = ['Silent', 'Soft', 'Normal', 'Accent'];

export const SUBDIVISIONS = [
  { id: 'none', name: 'None', n: 1 },
  { id: '8', name: '8ths', n: 2, swing: true },
  { id: '3', name: 'Triplets', n: 3 },
  { id: '16', name: '16ths', n: 4, swing: true },
  { id: '5', name: 'Quintuplets', n: 5 },
  { id: '6', name: 'Sextuplets', n: 6 },
];

/**
 * Where the clicks inside one count fall, as fractions of the count (always starting at 0).
 * swing: 50 is straight, 66.7 a triplet swing, 75 the hardest (dotted 8th and 16th). Only 8ths and 16ths swing.
 */
export function subFractions(id, swing = 50) {
  const s = Math.min(75, Math.max(50, +swing || 50)) / 100;
  if (id === '8') return [0, s];
  if (id === '16') return [0, s / 2, 0.5, 0.5 + s / 2];
  const n = (SUBDIVISIONS.find(d => d.id === id) || SUBDIVISIONS[0]).n;
  return Array.from({ length: n }, (_, i) => i / n);
}

// ---- meters and groupings: a bar is `top` counts of 1/`bottom` notes, felt in groups (7/8 as 2+2+3)

/** Every way to split n counts into 2s and 3s, in order (2+2+3, 2+3+2, 3+2+2 for 7) */
function twosAndThrees(n) {
  if (n === 0) return [[]];
  const out = [];
  for (const g of [2, 3]) if (n - g >= 0) for (const rest of twosAndThrees(n - g)) out.push([g, ...rest]);
  return out;
}

export const groupsLabel = groups => groups.every(g => g === 1) ? 'Every count' : groups.join('+');

/** The groupings worth offering for a meter: every count, the even ones, then the 2s-and-3s mixes (at most 12) */
export function groupingOptions(top, bottom) {
  const seen = new Set(), out = [];
  const add = g => { const k = g.join('+'); if (g.length && !seen.has(k) && g.reduce((a, b) => a + b, 0) === top) { seen.add(k); out.push(g); } };
  add(new Array(top).fill(1));
  for (const size of [3, 2, 4]) if (top > size && top % size === 0) add(new Array(top / size).fill(size));
  if (top >= 4) {
    const mixes = twosAndThrees(top).filter(g => g.includes(2) && g.includes(3));
    mixes.sort((a, b) => a.length - b.length);
    for (const g of mixes) { if (out.length >= 12) break; add(g); }
  }
  return out;
}

/** How a meter is felt unless you say otherwise: 6/8, 9/8, 12/8 in threes, 5/8 as 3+2, 7/8 as 2+2+3, x/4 on every count */
export function defaultGroups(top, bottom) {
  if (bottom >= 8 && top > 3) {
    if (top % 3 === 0) return new Array(top / 3).fill(3);
    if (top === 5) return [3, 2];
    // odd ones: 2s, with a 3 at the end (7 as 2+2+3, 11 as 2+2+2+2+3)
    if (top % 2) return [...new Array((top - 3) / 2).fill(2), 3];
    return new Array(top / 2).fill(2);
  }
  return new Array(top).fill(1);
}

/** "3+2+2" to [3, 2, 2], or null unless it's whole numbers adding up to `top` */
export function parseGroups(text, top) {
  const parts = String(text).split(/[^0-9]+/).filter(Boolean).map(Number);
  if (!parts.length || parts.some(p => p < 1) || parts.reduce((a, b) => a + b, 0) !== top) return null;
  return parts;
}

/** The accent pattern a grouping starts with: the downbeat strong, each group's first count normal, the counts inside a group soft */
export function defaultAccents(groups) {
  const out = [];
  groups.forEach((g, gi) => { for (let i = 0; i < g; i++) out.push(i === 0 ? (gi === 0 ? 3 : 2) : 1); });
  return out;
}

/** For each count of the bar: which group it's in and whether it starts one */
export function groupMap(groups) {
  const map = [];
  groups.forEach((g, gi) => { for (let i = 0; i < g; i++) map.push({ group: gi, start: i === 0 }); });
  return map;
}

const VALUE_NAMES = { 1: 'whole', 2: 'half', 4: 'quarter', 8: '8th', 16: '16th', 32: '32nd' };
/** The note a beat of `units` counts of 1/`bottom` is: 1 of 8 an 8th, 3 of 8 a dotted quarter, 2 of 4 a half */
export function noteValueName(units, bottom) {
  // units/bottom of a whole note, in lowest terms
  const gcd = (a, b) => b ? gcd(b, a % b) : a, g = gcd(units, bottom), num = units / g, den = bottom / g;
  if (num === 1 && VALUE_NAMES[den]) return VALUE_NAMES[den];
  if (num === 3 && VALUE_NAMES[den / 2]) return 'dotted ' + VALUE_NAMES[den / 2];
  return units + ' × ' + VALUE_NAMES[bottom];
}

/** What the tempo can count: the written note, or the felt beat when every group is the same size (6/8 in dotted quarters) */
export function unitOptions(groups, bottom) {
  const out = [{ units: 1, name: noteValueName(1, bottom) }];
  if (groups.length && groups[0] > 1 && groups.every(g => g === groups[0])) out.push({ units: groups[0], name: noteValueName(groups[0], bottom) });
  return out;
}

/** Seconds per count at `bpm` beats a minute, a beat being `units` counts */
export const countSeconds = (bpm, units = 1) => 60 / bpm / units;

const TEMPO_NAMES = [[24, 'Larghissimo'], [40, 'Grave'], [60, 'Largo'], [66, 'Larghetto'], [76, 'Adagio'], [92, 'Andante'],
                     [108, 'Andantino'], [120, 'Moderato'], [156, 'Allegro'], [176, 'Vivace'], [200, 'Presto'], [Infinity, 'Prestissimo']];
export const tempoName = bpm => TEMPO_NAMES.find(([top]) => bpm < top)[1];

// ---- tap tempo: the average of the last few taps, after throwing out the odd one; a pause starts over
export class TapTempo {
  constructor(resetMs = 2000, keep = 8) { this.resetMs = resetMs; this.keep = keep; this.times = []; }
  /** A tap at `ms` (performance.now()): the tempo so far, or null after the first tap */
  tap(ms) {
    const t = this.times;
    if (t.length && ms - t[t.length - 1] > this.resetMs) t.length = 0;
    t.push(ms);
    if (t.length > this.keep + 1) t.shift();
    if (t.length < 2) return null;
    const gaps = t.slice(1).map((x, i) => x - t[i]);
    const median = [...gaps].sort((a, b) => a - b)[gaps.length >> 1];
    const good = gaps.filter(g => Math.abs(g / median - 1) < 0.35);
    return 60000 / (good.reduce((a, b) => a + b, 0) / good.length);
  }
}

// ---- tempo trainer and gap click

/**
 * The trainer's tempo at bar `bar` (0 = the first bar after any count-in), `seconds` in.
 * steps: from, add `step` every `every` bars until `to` (then stay, or start again with loop).
 * ramp: from to `to` smoothly over `minutes` (then stay, or start again with loop). null when off.
 */
export function trainerTempo(tr, bar, seconds) {
  if (!tr || tr.mode === 'off' || !tr.mode) return null;
  const from = clampBpm(tr.from), to = clampBpm(tr.to), dir = Math.sign(to - from), span = Math.abs(to - from);
  if (tr.mode === 'steps') {
    const step = Math.max(0.1, Math.abs(+tr.step || 1)), every = Math.max(1, Math.round(+tr.every || 1));
    const stages = Math.ceil(span / step - 1e-9) + 1;
    let i = Math.floor(Math.max(0, bar) / every);
    if (tr.loop) i %= stages;
    return from + dir * Math.min(i * step, span);
  }
  const T = Math.max(1, (+tr.minutes || 1) * 60);
  let t = Math.max(0, seconds);
  t = tr.loop ? t % T : Math.min(t, T);
  return from + (to - from) * t / T;
}

/** Gap click: `play` bars with the click, then `mute` silent bars, over and over */
export const isGapBar = (gap, bar) => !!(gap && gap.on && bar >= 0 && gap.mute > 0 && bar % (gap.play + gap.mute) >= gap.play);

/** A small seeded random number generator (mulberry32), so random muting can be repeated in tests */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- the sequencer: works out every count, one after the next, at exact (fractional) sample frames

export const DEFAULT_SETTINGS = {
  bpm: 120, top: 4, bottom: 4, groups: [1, 1, 1, 1], units: 1, accents: [3, 2, 2, 2], sub: 'none', swing: 50,
  poly: { on: false, n: 3 }, trainer: { mode: 'off', from: 80, step: 4, every: 4, to: 120, loop: false, minutes: 5 },
  gap: { on: false, play: 4, mute: 4 }, randomMute: 0,
};

/** Fills in anything missing or broken in a settings object, so a bad preset or old save can't break the clock */
export function cleanSettings(s) {
  const d = DEFAULT_SETTINGS, o = { ...d, ...(s || {}) };
  o.top = Math.min(16, Math.max(1, Math.round(+o.top) || 4));
  o.bottom = [2, 4, 8, 16].includes(+o.bottom) ? +o.bottom : 4;
  o.groups = Array.isArray(o.groups) && o.groups.reduce((a, b) => a + b, 0) === o.top && o.groups.every(g => g >= 1) ? o.groups.map(Math.round) : defaultGroups(o.top, o.bottom);
  o.units = unitOptions(o.groups, o.bottom).some(u => u.units === +o.units) ? +o.units : 1;
  o.accents = Array.isArray(o.accents) && o.accents.length === o.top ? o.accents.map(a => Math.min(3, Math.max(0, Math.round(+a) || 0))) : defaultAccents(o.groups);
  o.bpm = clampBpm(o.bpm);
  o.sub = SUBDIVISIONS.some(x => x.id === o.sub) ? o.sub : 'none';
  o.swing = Math.min(75, Math.max(50, +o.swing || 50));
  o.poly = { ...d.poly, ...(o.poly || {}) };
  o.poly.n = Math.min(16, Math.max(1, Math.round(+o.poly.n) || 3));
  o.trainer = { ...d.trainer, ...(o.trainer || {}) };
  o.gap = { ...d.gap, ...(o.gap || {}) };
  o.gap.play = Math.max(1, Math.round(+o.gap.play) || 1);
  o.gap.mute = Math.max(0, Math.round(+o.gap.mute) || 0);
  o.randomMute = Math.min(100, Math.max(0, +o.randomMute || 0));
  return o;
}

/**
 * Hands out the counts one at a time. A new tempo, accents, subdivision, trainer or gap setting takes
 * effect from the next count; a new meter, grouping or polyrhythm from the next bar (so a bar is never cut short).
 */
export class Sequencer {
  constructor(sampleRate, settings) {
    this.sr = sampleRate;
    this.want = cleanSettings(settings);
    this.s = this.want;
    this.start(0);
  }
  set(settings) { this.want = cleanSettings(settings); }
  /** Starts again: the first count at `frame`, after one count-in bar when countIn */
  start(frame, { countIn = false, seed = 1 } = {}) {
    this.frame = frame;        // where the next count starts (fractional sample frames, so nothing drifts)
    this.count = 0;
    this.bar = countIn ? -1 : 0;
    this.seconds = 0;          // time since bar 0 began, for the ramp trainer
    this.random = rng(seed);
    this.s = this.want;
  }
  next() {
    const w = this.want;
    // a new bar takes everything; mid-bar, only what doesn't change the bar's shape
    if (this.count === 0) this.s = w;
    else this.s = { ...this.s, bpm: w.bpm, units: w.top === this.s.top ? w.units : this.s.units, sub: w.sub, swing: w.swing,
                    accents: w.top === this.s.top ? w.accents : this.s.accents, trainer: w.trainer, gap: w.gap, randomMute: w.randomMute };
    const s = this.s, countIn = this.bar < 0, bar = this.bar, count = this.count;
    const bpm = clampBpm(trainerTempo(s.trainer, Math.max(0, bar), this.seconds) ?? s.bpm);
    const len = this.sr * countSeconds(bpm, s.units);
    const where = groupMap(s.groups)[count];
    let level = s.accents[count] ?? 2;
    if (countIn && level === 0) level = 1;   // the count-in sounds every count
    const gap = !countIn && isGapBar(s.gap, bar);
    const muted = gap || (!countIn && s.randomMute > 0 && this.random() * 100 < s.randomMute);
    // the polyrhythm: n clicks spread evenly over the bar; the ones that land in this count
    const poly = [];
    if (s.poly.on && !countIn) {
      const n = s.poly.n, B = s.top;
      for (let j = Math.ceil(count * n / B - 1e-9); j * B < (count + 1) * n; j++) poly.push({ j, frac: (j * B - count * n) / n });
    }
    const ev = { frame: this.frame, len, bar, count, top: s.top, group: where.group, groupStart: where.start, groups: s.groups,
                 level, countIn, gap, muted, bpm, units: s.units, sub: s.sub, swing: s.swing,
                 subs: countIn ? [0] : subFractions(s.sub, s.swing), poly, polyN: s.poly.on ? s.poly.n : 0 };
    this.frame += len;
    if (!countIn) this.seconds += len / this.sr;
    if (++this.count >= s.top) { this.count = 0; this.bar++; }
    return ev;
  }
}

// ---- the click sounds: synthesized here (no sample files), each starting at full level on its first sample
// so the click is exactly where it was scheduled

export const SOUND_SETS = [
  { id: 'classic', name: 'Classic click' },
  { id: 'woodblock', name: 'Woodblock' },
  { id: 'cowbell', name: 'Cowbell' },
  { id: 'hihat', name: 'Hi-hat' },
  { id: 'rim', name: 'Rim click' },
  { id: 'beep', name: 'Sine beep' },
  { id: 'groove', name: 'Kick and hat' },
];

/** Damped sinusoids plus a burst of noise: partials [[Hz, level, decay seconds]] */
function modal(sr, seconds, partials, noise = 0, noiseDecay = 0.002, seed = 3) {
  const n = Math.floor(sr * seconds), x = new Float32Array(n), r = rng(seed);
  for (const [hz, a, tau] of partials) {
    const w = 2 * Math.PI * hz / sr, k = Math.exp(-1 / (tau * sr));
    let amp = a;
    for (let i = 0; i < n; i++) { x[i] += amp * Math.sin(w * i + 0.6); amp *= k; }
  }
  if (noise) {
    const k = Math.exp(-1 / (noiseDecay * sr));
    let amp = noise, prev = 0;
    for (let i = 0; i < n && amp > 1e-5; i++) { const v = r() * 2 - 1; x[i] += amp * (v - prev); prev = v; amp *= k; }
  }
  return x;
}

/** A square wave without aliasing: its odd harmonics, up to just under half the sample rate */
function square(sr, n, hz) {
  const x = new Float32Array(n);
  for (let k = 1; k * hz < sr * 0.45; k += 2) {
    const w = 2 * Math.PI * k * hz / sr, a = 4 / (Math.PI * k);
    for (let i = 0; i < n; i++) x[i] += a * Math.sin(w * i);
  }
  return x;
}

/** A biquad filter (RBJ cookbook), in place: 'hp' high-pass, 'lp' low-pass, 'bp' band-pass */
function biquad(x, sr, type, hz, q) {
  const w = 2 * Math.PI * hz / sr, al = Math.sin(w) / (2 * q), c = Math.cos(w), a0 = 1 + al;
  const [b0, b1, b2] = type === 'hp' ? [(1 + c) / 2, -(1 + c), (1 + c) / 2] : type === 'lp' ? [(1 - c) / 2, 1 - c, (1 - c) / 2] : [al, 0, -al];
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i], y = (b0 * v + b1 * x1 + b2 * x2 - (-2 * c) * y1 - (1 - al) * y2) / a0;
    x2 = x1; x1 = v; y2 = y1; y1 = y;
    x[i] = y;
  }
  return x;
}

/** Starts a sound where it first gets loud: filters ease into a hit, and a click has to land right on the beat */
function onTime(x) {
  let peak = 0;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  let i = 0;
  while (i < x.length && Math.abs(x[i]) < 0.3 * peak) i++;
  return x.slice(Math.max(0, i - 2));
}

/** The drum machine cowbell: two square waves a not-quite-fifth apart (540 and 800 Hz), band-passed, with a
 *  sharp drop right after the hit and then a ringing tail. pitch scales both */
function cowbell(sr, seconds, pitch = 1, tail = 0.12) {
  const n = Math.floor(sr * seconds), a = square(sr, n, 540 * pitch), b = square(sr, n, 800 * pitch), x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = a[i] + b[i];
  biquad(x, sr, 'bp', 2000 * pitch, 0.9);
  biquad(x, sr, 'hp', 400, 0.7);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    x[i] *= 0.7 * Math.exp(-t / 0.012) + 0.3 * Math.exp(-t / tail);
  }
  return onTime(x);
}

/** A hi-hat: bright noise plus six clashing square waves (the drum machine metal), high-passed. tau: how long it rings
 *  (short for closed, long for open) */
function hihat(sr, seconds, tau, seed = 11) {
  const n = Math.floor(sr * seconds), r = rng(seed), x = new Float32Array(n);
  for (const hz of [205.3, 304.4, 369.6, 522.7, 540, 800]) { const sq = square(sr, n, hz); for (let i = 0; i < n; i++) x[i] += sq[i] / 6; }
  biquad(x, sr, 'bp', 10000, 0.8);
  for (let i = 0; i < n; i++) x[i] = 0.6 * x[i] + 0.5 * (r() * 2 - 1);
  biquad(x, sr, 'hp', 6500, 0.7);
  biquad(x, sr, 'hp', 6500, 0.7);
  // and gently off at the very top, so it's a hat, not just sizzle
  biquad(x, sr, 'lp', 12000, 0.6);
  for (let i = 0; i < n; i++) x[i] *= Math.exp(-i / sr / tau);
  return onTime(x);
}

/** A kick: a sine that drops in pitch, with a click on top */
function kick(sr, seconds, hiHz, loHz, tau) {
  const n = Math.floor(sr * seconds), x = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr, f = loHz + (hiHz - loHz) * Math.exp(-t / 0.03);
    phase += 2 * Math.PI * f / sr;
    x[i] = Math.exp(-t / tau) * Math.sin(phase + Math.PI / 2 * 0) + (i < sr * 0.0015 ? 0.5 * (1 - i / (sr * 0.0015)) : 0);
  }
  return x;
}

function beep(sr, hz, seconds) {
  const n = Math.floor(sr * seconds), x = new Float32Array(n), rel = Math.floor(sr * 0.012);
  for (let i = 0; i < n; i++) x[i] = Math.sin(2 * Math.PI * hz * i / sr + Math.PI / 4) * (i > n - rel ? (n - i) / rel : 1);
  return x;
}

/** Peak to `level`, with a fade at the very end so nothing clicks off */
function finish(x, level) {
  let peak = 0;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  const fade = Math.min(x.length, 256);
  for (let i = 0; i < x.length; i++) x[i] *= (level / (peak || 1)) * (i > x.length - fade ? (x.length - i) / fade : 1);
  return x;
}

/** One sound set's four sounds (accent, beat, sub, poly), as Float32Arrays at `sr` */
export function makeSounds(id, sr) {
  const S = {
    classic: () => ({
      accent: modal(sr, 0.06, [[2400, 1, 0.012], [4800, 0.35, 0.006]], 0.6),
      beat: modal(sr, 0.05, [[1600, 1, 0.011], [3200, 0.3, 0.005]], 0.5),
      sub: modal(sr, 0.03, [[1150, 1, 0.006]], 0.3),
      poly: modal(sr, 0.05, [[3300, 1, 0.01], [990, 0.4, 0.01]], 0.4) }),
    woodblock: () => ({
      accent: modal(sr, 0.15, [[1180, 1, 0.03], [3030, 0.35, 0.012], [5070, 0.15, 0.006]], 0.4, 0.001),
      beat: modal(sr, 0.13, [[880, 1, 0.028], [2260, 0.35, 0.011], [3780, 0.15, 0.006]], 0.35, 0.001),
      sub: modal(sr, 0.08, [[660, 1, 0.015], [1700, 0.3, 0.007]], 0.25, 0.001),
      poly: modal(sr, 0.12, [[1500, 1, 0.025], [3860, 0.3, 0.01]], 0.35, 0.001) }),
    cowbell: () => ({
      accent: cowbell(sr, 0.5, 1, 0.16),
      beat: cowbell(sr, 0.4, 1, 0.11),
      sub: cowbell(sr, 0.15, 1, 0.03),
      poly: cowbell(sr, 0.35, 1.335, 0.09) }),
    // closed on the beats, open on the accent, a tight tick for subdivisions
    hihat: () => ({ accent: hihat(sr, 0.45, 0.13), beat: hihat(sr, 0.12, 0.035), sub: hihat(sr, 0.06, 0.016, 12),
                    poly: modal(sr, 0.15, [[5200, 1, 0.03], [7800, 0.4, 0.02]], 0.3) }),
    rim: () => ({
      accent: modal(sr, 0.06, [[1700, 1, 0.012], [520, 0.6, 0.012], [4100, 0.3, 0.004]], 0.9, 0.0015),
      beat: modal(sr, 0.05, [[1500, 1, 0.009], [470, 0.5, 0.01], [3700, 0.3, 0.004]], 0.8, 0.0012),
      sub: modal(sr, 0.03, [[2100, 1, 0.004]], 0.6, 0.0008),
      poly: modal(sr, 0.05, [[2600, 1, 0.01], [800, 0.4, 0.01]], 0.6, 0.0012) }),
    beep: () => ({ accent: beep(sr, 1760, 0.07), beat: beep(sr, 880, 0.06), sub: beep(sr, 660, 0.03), poly: beep(sr, 1320, 0.05) }),
    // kick on the odd counts (1 and 3), hat on the even ones (2 and 4): `alt` is the sound for counts 2, 4, 6...
    groove: () => ({ accent: kick(sr, 0.4, 170, 48, 0.18), beat: kick(sr, 0.3, 150, 52, 0.12), alt: hihat(sr, 0.12, 0.04),
                     sub: hihat(sr, 0.06, 0.016, 12), poly: modal(sr, 0.18, [[200, 0.6, 0.05], [330, 0.3, 0.04]], 1.2, 0.03) }),
  };
  const set = (S[id] || S.classic)();
  const out = { accent: finish(set.accent, 1), beat: finish(set.beat, 0.8), sub: finish(set.sub, 0.55), poly: finish(set.poly, 0.75) };
  if (set.alt) out.alt = finish(set.alt, 0.75);
  return out;
}

/** Slider (0 to 100) to gain: squared, so the low end isn't all crammed together */
export const sliderGain = v => Math.pow(Math.min(100, Math.max(0, +v || 0)) / 100, 2);

// ---- the click engine: the sequencer plus a mixer. The AudioWorklet calls render() for each 128-frame block.

export class ClickEngine {
  constructor(sampleRate, settings) {
    this.sr = sampleRate;
    this.seq = new Sequencer(sampleRate, settings);
    this.sounds = null;
    this.voices = [];
    this.running = false;
    this.gains = { accent: 1, beat: 0.5, sub: 0.2, poly: 0.4 };
  }
  setSounds(s) { this.sounds = s; }
  /** settings, plus vol: { accent, beat, sub, poly } as 0 to 100 sliders */
  set(settings) {
    this.seq.set(settings);
    const v = settings.vol || {};
    this.gains = { accent: sliderGain(v.accent ?? 100), beat: sliderGain(v.beat ?? 80), sub: sliderGain(v.sub ?? 50), poly: sliderGain(v.poly ?? 70) };
  }
  start(frame, opts) { this.seq.start(frame, opts); this.voices = []; this.running = true; }
  stop() { this.running = false; }
  voice(buf, at, gain) { if (buf && gain > 0) this.voices.push({ buf, at, gain }); }
  /** Mixes frames [frame0, frame0 + out.length) into out; returns the counts that start in this block */
  render(out, frame0) {
    const n = out.length, end = frame0 + n, events = [];
    out.fill(0);
    if (this.running) {
      while (this.seq.frame < end) {
        const ev = this.seq.next();
        events.push(ev);
        if (!this.sounds || ev.muted) continue;
        const g = this.gains, snd = this.sounds;
        if (ev.level > 0) {
          // a set with an `alt` sound (kick and hat) plays it on counts 2, 4, 6...
          const alt = snd.alt && ev.count % 2 === 1;
          this.voice(alt ? snd.alt : ev.level === 3 ? snd.accent : snd.beat, Math.round(ev.frame), ev.level === 3 ? g.accent : ev.level === 2 ? g.beat : g.beat * 0.4);
          for (let k = 1; k < ev.subs.length; k++) this.voice(snd.sub, Math.round(ev.frame + ev.subs[k] * ev.len), g.sub);
        }
        for (const p of ev.poly) this.voice(snd.poly, Math.round(ev.frame + p.frac * ev.len), g.poly);
      }
    }
    let keep = 0;
    for (const v of this.voices) {
      if (v.at < end) {
        const from = Math.max(v.at, frame0), stop = Math.min(end, v.at + v.buf.length);
        for (let f = from; f < stop; f++) out[f - frame0] += v.buf[f - v.at] * v.gain;
      }
      if (v.at + v.buf.length > end) this.voices[keep++] = v;
    }
    this.voices.length = keep;
    return events;
  }
}

// ---- Time check: catching each note you play (onsets) in the input

/**
 * Finds note onsets in a stream of input, and where each one starts to a fraction of a sample.
 * Detection, in 1.3 ms hops, either of two: a high-frequency-weighted energy (x^2 + 4 dx^2: attacks are bright)
 * jumping `ratio` times above the 10 to 50 ms before it (drums, claps, anything after a gap), or the same jump in
 * what a linear predictor (refitted every 10 ms) couldn't see coming: a new note while the last one still rings
 * barely changes the level, but it isn't predictable from what was ringing. Above the noise floor, then a
 * refractory gap. Then the start is found in the samples around it (refine), to a fraction of a sample.
 */
export class OnsetDetector {
  constructor(sampleRate, { sensitivity = 50, refractoryMs = 45 } = {}) {
    this.sr = sampleRate;
    const s = Math.min(100, Math.max(0, sensitivity)) / 100;
    this.ratio = 5 - 3.5 * s;                  // 5x (7 dB) at 0, 1.5x at 100
    this.absMin = Math.pow(10, -(5.5 + 2 * s));  // energy below about -55 to -75 dB is never a note
    this.hop = Math.max(16, Math.round(sampleRate / 750));
    this.refractory = Math.round(sampleRate * refractoryMs / 1000);
    this.size = 1 << Math.ceil(Math.log2(sampleRate * 0.5));
    this.mask = this.size - 1;
    this.x = new Float32Array(this.size);
    this.hops = new Float64Array(64);
    this.res = new Float64Array(64);     // the predictor's miss (residual energy), per hop
    this.P = 20; this.a = null; this.nf2 = Infinity; this.armed = true; this.peakSince = 0;
    this.k = 0; this.acc = 0; this.accN = 0; this.n = 0; this.prev = 0;
    this.origin = null; this.nf = Infinity; this.lastTrig = -1e12; this.pending = [];
    this.smooth = Math.max(4, Math.round(sampleRate * 0.0005));
    this.pre = Math.round(sampleRate * 0.025); this.post = Math.round(sampleRate * 0.025); this.base = Math.round(sampleRate * 0.01);
  }
  /** Feeds samples x whose first one is at frame `frame`; returns the onsets found so far, as fractional frames */
  push(x, frame) {
    if (this.origin === null) this.origin = frame;
    const at = frame - this.origin;
    if (at > this.n) this.n = at;              // a dropout: carry on from where the input picks up
    const out = [];
    for (let i = 0; i < x.length; i++) {
      const v = x[i], d = v - this.prev;
      this.prev = v;
      const e = v * v + 4 * d * d;
      this.x[this.n & this.mask] = v;
      this.acc += e;
      this.n++;
      if (++this.accN === this.hop) { this.hopDone(); this.acc = 0; this.accN = 0; }
    }
    while (this.pending.length && this.n >= this.pending[0] + this.post + this.smooth) out.push(this.origin + this.refine(this.pending.shift()));
    return out;
  }
  hopDone() {
    const h = this.hops, res = this.res, k = this.k++, n = this.n;
    h[k & 63] = this.acc / this.hop;
    // the predictor's miss over this hop (with the coefficients fitted before it)
    let miss = 0;
    if (this.a) {
      const a = this.a, P = this.P, X = this.x, m = this.mask;
      for (let i = n - this.hop; i < n; i++) { let v = X[i & m]; for (let j = 1; j <= P; j++) v += a[j] * X[(i - j) & m]; miss += v * v; }
      miss /= this.hop;
    } else miss = h[k & 63];
    res[k & 63] = miss;
    if (k % 8 === 0 && n > this.sr * 0.03 + this.P) this.a = this.predictor(n - Math.round(this.sr * 0.03), n, this.P);
    const avg = (arr, from, to) => { let s = 0, c = 0; for (let j = from; j <= to; j++) if (k - j >= 0) { s += arr[(k - j) & 63]; c++; } return c ? s / c : 0; };
    const S = avg(h, 0, 3), R = avg(h, 8, 38), S2 = avg(res, 0, 3), R2 = avg(res, 8, 38);
    this.nf = S < this.nf ? S : this.nf * 1.00004;   // the quietest it gets, creeping up slowly (doubles in about 23 s)
    this.nf2 = S2 < this.nf2 ? S2 : this.nf2 * 1.00004;
    const floor = Math.max(this.absMin, this.nf * 5);
    // (the predictor path also wants the level rising a little: a sound dying away while it bends in pitch is not a new note)
    const jump = S > this.ratio * R || (S2 > this.ratio * 2 * R2 && S2 > this.nf2 * 5 && S > 1.1 * R);
    // after a note, wait for its level to stop climbing before the next (a slow swell is one note, not several)
    if (S > this.peakSince) this.peakSince = S; else if (S < this.peakSince * 0.75) this.armed = true;
    if (jump && S > floor && n - this.lastTrig > this.refractory && this.armed) {
      this.lastTrig = this.n;
      this.armed = false;
      this.peakSince = S;
      this.pending.push(this.n);
    }
  }
  /** A linear predictor (order P) for samples [f0, f1): autocorrelation of the windowed stretch, then Levinson-Durbin */
  predictor(f0, f1, P) {
    const N = f1 - f0, xw = new Float64Array(N), X = this.x, m0 = this.mask;
    for (let i = 0; i < N; i++) xw[i] = X[(f0 + i) & m0] * (0.5 - 0.5 * Math.cos(2 * Math.PI * (i + 0.5) / N));
    const r = new Float64Array(P + 1);
    for (let k = 0; k <= P; k++) { let acc = 0; for (let i = k; i < N; i++) acc += xw[i] * xw[i - k]; r[k] = acc; }
    r[0] = r[0] * (1 + 1e-4) + 1e-12;
    let a = new Float64Array(P + 1), err = r[0];
    a[0] = 1;
    for (let m = 1; m <= P; m++) {
      let acc = r[m];
      for (let k = 1; k < m; k++) acc += a[k] * r[m - k];
      const kk = -acc / err, next = a.slice();
      for (let k = 1; k < m; k++) next[k] = a[k] + kk * a[m - k];
      next[m] = kk;
      a = next;
      err *= 1 - kk * kk;
      if (err <= 0) break;
    }
    return a;
  }
  /**
   * Where the note that tripped detection at sample t really starts. A linear predictor is fitted to the 30 ms
   * before it, so whatever was already ringing (the last chord, a held note) is predicted away and what's left
   * (the residual) jumps exactly where something new starts, even a soft note under a loud one.
   */
  refine(t) {
    const sr = this.sr, P = 24, ws = t - this.pre, we = t + this.post, f0 = ws - Math.round(sr * 0.03);
    const L = this.smooth, half = L >> 1, b0 = ws - this.base, lo = b0 - half, hi = we + half;
    const oldest = Math.max(0, this.n - this.size + 1), X = i => this.x[i & this.mask];
    if (f0 - P < oldest) return t;
    const a = this.predictor(f0, ws, P);
    // the residual's energy, smoothed over L samples (centred)
    const len = hi - lo + 1, cum = new Float64Array(len + 1);
    for (let i = 0; i < len; i++) {
      let v = X(lo + i);
      for (let k = 1; k <= P; k++) v += a[k] * X(lo + i - k);
      cum[i + 1] = cum[i] + v * v;
    }
    const s = i => { const p = Math.max(lo, i - half), q = Math.min(hi, i - half + L); return (cum[q - lo] - cum[p - lo]) / Math.max(1, q - p); };
    const base = (cum[ws - lo] - cum[b0 - lo]) / Math.max(1, ws - b0);
    // the note's level: its loudest 5 ms (not one spike, where a chord's strings happen to line up)
    const W = Math.round(sr * 0.005);
    let peak = -1, ip = t, level = 0;
    for (let i = ws; i <= we; i++) { const v = s(i); if (v > peak) { peak = v; ip = i; } }
    for (let i = ws; i + W <= hi; i += 16) level = Math.max(level, (cum[i + W - lo] - cum[i - lo]) / W);
    const th = Math.max(base * 3, base + 0.04 * (Math.min(peak, level) - base));
    if (!(peak > th)) return t;
    // back from the peak, over short dips (a clap's bursts), to the last sample above the threshold
    const maxGap = Math.round(sr * 0.004);
    let on = ip, gap = 0;
    for (let i = ip; i > ws; i--) {
      if (s(i) >= th) { on = i; gap = 0; } else if (++gap > maxGap) break;
    }
    const y0 = s(on - 1), y1 = s(on);
    return on - 1 + (y1 > y0 ? Math.min(1, Math.max(0, (th - y0) / (y1 - y0))) : 1);
  }
}

// ---- latency calibration: the click goes out of the speakers, round to the mic, and comes back this late

/**
 * The round-trip delay, from where the clicks were sent (frames) and the onsets heard (frames).
 * Looks for the delay most clicks agree on (within 3 ms), so a cough or a missed click doesn't move it.
 * minS/maxS: the range of delays to consider. ok: most clicks were heard, and consistently.
 */
export function measureLatency(clicks, onsets, sr, { minS = -0.05, maxS = 0.5, maxSpreadMs = 3 } = {}) {
  const d = [];
  for (const c of clicks) for (const o of onsets) { const x = (o - c) / sr; if (x >= minS && x <= maxS) d.push(x * 1000); }
  if (!d.length) return { ok: false, ms: 0, spreadMs: 0, matched: 0, total: clicks.length };
  d.sort((a, b) => a - b);
  // the 3 ms window holding the most delays
  let best = 0, bi = 0;
  for (let i = 0, j = 0; i < d.length; i++) { while (d[i] - d[j] > 3) j++; if (i - j + 1 > best) { best = i - j + 1; bi = j; } }
  const centre = d[bi] + 1.5, win = Math.max(3, maxSpreadMs * 2);
  const near = d.filter(x => Math.abs(x - centre) <= win);
  const ms = median(near), spreadMs = Math.sqrt(near.reduce((s, x) => s + (x - ms) * (x - ms), 0) / near.length);
  return { ok: near.length >= Math.ceil(clicks.length * 0.6) && spreadMs <= maxSpreadMs, ms, spreadMs, matched: near.length, total: clicks.length };
}

const median = a => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const mean = a => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const sd = a => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / (a.length || 1)); };
/** Least-squares line through (x, y): { slope, at } with at(x) the line's value */
function fitLine(xs, ys) {
  const mx = mean(xs), my = mean(ys);
  let num = 0, den = 0;
  xs.forEach((x, i) => { num += (x - mx) * (ys[i] - my); den += (x - mx) * (x - mx); });
  const slope = den ? num / den : 0;
  return { slope, at: x => my + slope * (x - mx) };
}

// ---- Time check: matching onsets to the beat grid

/**
 * Takes the counts as the metronome plays them and the onsets heard, and works out how early or late each note
 * was against the nearest grid position (beat or subdivision). latencyMs: the calibrated round trip.
 * listen: which grid to hold notes to: 'same' (the subdivision you hear) or a subdivision id.
 */
export class TimeCheck {
  constructor(sampleRate, { latencyMs = 0, listen = 'same' } = {}) {
    this.sr = sampleRate;
    this.lat = latencyMs * sampleRate / 1000;
    this.listen = listen;
    this.grid = [];       // expected arrival frames (count frame + round trip), in order
    this.waiting = [];    // onsets not matched yet (the grid after them isn't known yet)
    this.hits = [];
    this.byGrid = new Map();
    this.extra = 0;
    this.knownUntil = -Infinity;
    this.startFrame = null;
    this.cap = 0.15 * sampleRate;   // no note more than 150 ms off counts as aimed at that grid line
  }
  addCount(ev) {
    if (this.startFrame === null && !ev.countIn) this.startFrame = ev.frame;
    const fr = this.listen === 'same' ? ev.subs : subFractions(this.listen, ev.swing);
    fr.forEach((f, k) => this.grid.push({ frame: ev.frame + f * ev.len + this.lat, bar: ev.bar, count: ev.count, sub: k, nsub: fr.length,
      gap: ev.gap, muted: ev.muted, countIn: ev.countIn, bpm: ev.bpm, clickAt: ev.level > 0 && !ev.muted && (k === 0 || ev.sub !== 'none') }));
    this.knownUntil = ev.frame + ev.len + this.lat;
    this.resolve();
  }
  addOnsets(frames) { for (const o of frames) this.waiting.push(o); this.resolve(); }
  /** Matches the onsets whose neighbourhood of the grid is known; all of them when final */
  resolve(final = false) {
    const g = this.grid;
    while (this.waiting.length && (final || this.waiting[0] + this.cap < this.knownUntil)) {
      const o = this.waiting.shift();
      // nearest grid point (binary search)
      let lo = 0, hi = g.length - 1;
      if (hi < 0) { this.extra++; continue; }
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (g[mid].frame <= o) lo = mid; else hi = mid; }
      const i = Math.abs(g[lo].frame - o) <= Math.abs(g[hi].frame - o) ? lo : hi, p = g[i], err = o - p.frame;
      // how far off still counts as aimed at this point: a third of the way to the neighbour on that side
      const nb = err >= 0 ? g[i + 1] : g[i - 1], room = nb ? Math.abs(nb.frame - p.frame) * 0.35 : this.cap;
      if (Math.abs(err) > Math.min(this.cap, room)) { this.extra++; continue; }
      const hit = { frame: o, at: (p.frame - this.lat - (this.startFrame ?? p.frame)) / this.sr, err: err * 1000 / this.sr,
                    bar: p.bar, count: p.count, sub: p.sub, nsub: p.nsub, gap: p.gap, muted: p.muted, countIn: p.countIn, bpm: p.bpm, clickAt: p.clickAt };
      const had = this.byGrid.get(i);
      if (had) {
        this.extra++;
        if (Math.abs(had.err) <= Math.abs(hit.err)) continue;
        this.hits.splice(this.hits.indexOf(had), 1);
      }
      this.byGrid.set(i, hit);
      this.hits.push(hit);
    }
  }
}

const SUB_NAMES = { 2: ['', '&'], 3: ['', 'trip', 'let'], 4: ['', 'e', '&', 'a'] };
/** "beat 4", "the & of 2", "the e of 3", "beat 2, note 3 of 5" */
export function positionName(count, sub, nsub, word = 'beat') {
  const n = count + 1;
  if (!sub) return word + ' ' + n;
  const names = SUB_NAMES[nsub];
  return names ? `the ${names[sub]} of ${n}` : `${word} ${n}, note ${sub + 1} of ${nsub}`;
}

const ms0 = x => Math.abs(x).toFixed(0) + ' ms';

/**
 * The report: how early or late on average (negative: early, rushing), how steady (spread), each beat position,
 * the silent (gap) bars, a score out of 100 and plain-English lines. word: 'beat' or 'count' in the lines.
 */
export function summarize(allHits, { word = 'beat' } = {}) {
  const hits = allHits.filter(h => !h.countIn);
  const out = { n: hits.length, mean: 0, spread: 0, rms: 0, score: 0, grade: '', positions: [], gap: null, lines: [], bleed: false };
  if (hits.length < 4) { out.lines.push(hits.length ? 'Keep playing: a few more notes and there\'s a report.' : 'No notes heard yet.'); return out; }
  const errs = hits.map(h => h.err);
  out.mean = mean(errs); out.spread = sd(errs); out.rms = Math.sqrt(mean(errs.map(e => e * e)));
  out.score = Math.round(100 * Math.exp(-out.rms / 35));
  out.grade = out.score >= 90 ? 'Locked in' : out.score >= 75 ? 'Tight' : out.score >= 60 ? 'Good' : out.score >= 40 ? 'Getting there' : 'Loose';
  // with the click (not the silent bars, where drifting is the point)
  const clicked = hits.filter(h => !h.gap && !h.muted), clickMean = clicked.length ? mean(clicked.map(h => h.err)) : out.mean;
  // each beat position, measured with the click
  const pos = new Map();
  for (const h of clicked.length >= 4 ? clicked : hits) { const k = h.count * 100 + h.sub; if (!pos.has(k)) pos.set(k, { count: h.count, sub: h.sub, nsub: h.nsub, errs: [] }); pos.get(k).errs.push(h.err); }
  out.positions = [...pos.values()].sort((a, b) => a.count - b.count || a.sub - b.sub)
    .map(p => ({ count: p.count, sub: p.sub, nsub: p.nsub, n: p.errs.length, mean: mean(p.errs), spread: sd(p.errs), name: positionName(p.count, p.sub, p.nsub, word) }));
  // the mic hearing the click: hits too perfect to be a person (people spread at least a few ms)
  const onClick = clicked.filter(h => h.clickAt);
  if (onClick.length >= 8 && sd(onClick.map(h => h.err)) < 1.5 && Math.abs(mean(onClick.map(h => h.err))) < 1.5) out.bleed = true;

  const L = out.lines;
  if (out.bleed) L.push('These look too perfect: the mic is probably hearing the click itself. Wear headphones (or turn the click down) so it only hears you.');
  if (Math.abs(clickMean) < 4) L.push('On average you\'re right on the click (within 4 ms).');
  else L.push(`On average you play ${ms0(clickMean)} ${clickMean < 0 ? 'ahead of the click (rushing)' : 'behind the click (dragging, or laid back if you mean it)'}.`);
  const odd = out.positions.filter(p => p.n >= 4 && Math.abs(p.mean) >= 6 && Math.abs(p.mean - clickMean) >= 5)
    .sort((a, b) => Math.abs(b.mean - clickMean) - Math.abs(a.mean - clickMean)).slice(0, 2);
  for (const p of odd) L.push(`You ${p.mean < 0 ? 'rush' : 'drag'} ${p.name} by ${ms0(p.mean)}.`);
  const sp = clicked.length >= 4 ? sd(clicked.map(h => h.err)) : out.spread;
  L.push(`Steadiness: your notes spread about ${sp.toFixed(0)} ms either way, ${sp < 8 ? 'very steady' : sp < 15 ? 'steady' : sp < 25 ? 'a bit uneven' : 'uneven: slow down and lock in'}.`);
  // drifting over the session (with the click)
  if (clicked.length >= 12) {
    const f = fitLine(clicked.map(h => h.at), clicked.map(h => h.err)), t0 = clicked[0].at, t1 = clicked[clicked.length - 1].at, change = f.at(t1) - f.at(t0);
    out.trend = { msPerMin: f.slope * 60, change };
    if (Math.abs(change) >= 8 && t1 - t0 > 10) L.push(`Over the take you drifted ${ms0(change)} ${change < 0 ? 'earlier (pushing ahead)' : 'later (sitting back more)'} as it went on.`);
  }
  // the silent bars: did you speed up or slow down with no click?
  const gapHits = hits.filter(h => h.gap);
  if (gapHits.length >= 3) {
    // split into the separate silent stretches (a new stretch when bars jump)
    const sections = [];
    for (const h of gapHits) { const last = sections[sections.length - 1]; if (last && h.bar - last[last.length - 1].bar <= 1) last.push(h); else sections.push([h]); }
    const usable = sections.filter(s => s.length >= 3);
    if (usable.length) {
      let endErr = 0, ratio = 0;
      for (const s of usable) {
        const f = fitLine(s.map(h => h.at), s.map(h => h.err));
        endErr += f.at(s[s.length - 1].at) - clickMean;
        ratio += 1 + f.slope / 1000;  // ms of drift per second played: your beat was this much longer
      }
      endErr /= usable.length; ratio /= usable.length;
      const bpm = gapHits[0].bpm, played = bpm / ratio;
      out.gap = { sections: usable.length, n: gapHits.length, mean: mean(gapHits.map(h => h.err)), spread: sd(gapHits.map(h => h.err)), endErr, playedBpm: played, bpm };
      if (Math.abs(endErr) < 8) L.push('In the silent bars you held the tempo well (within 8 ms by the end).');
      else L.push(`In the silent bars you ${endErr < 0 ? 'sped up' : 'slowed down'}: by the end of each gap you were ${ms0(endErr)} ${endErr < 0 ? 'ahead' : 'behind'}` +
                  (Math.abs(played - bpm) >= 0.3 ? ` (about ${played.toFixed(Math.abs(played - bpm) < 3 ? 1 : 0)} BPM instead of ${+bpm.toFixed(1)}).` : '.'));
    }
  }
  return out;
}
