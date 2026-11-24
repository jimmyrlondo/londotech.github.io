// ENCORE. SFX: the sound effect synth, the category generators, mutate, WAV files and sound codes.
// Written from scratch for ENCORE. (no code from sfxr or its ports). Pure: no DOM, no Web Audio, so Node tests it
// and every export is exactly what the page plays. Deterministic: the same parameters (seed included) always render
// the same samples.

/** Every parameter: key, name, group, range, step, unit. kind: 'num' (default), 'wave', 'bool' */
export const WAVES = [
  { id: 'square', name: 'Square' }, { id: 'saw', name: 'Saw' }, { id: 'triangle', name: 'Triangle' }, { id: 'sine', name: 'Sine' },
  { id: 'noise', name: 'Noise' }, { id: 'pink', name: 'Soft noise' }, { id: 'crunch', name: 'Chip noise' },
];
export const GROUPS = [
  { id: 'tone', name: 'Tone' }, { id: 'pitch', name: 'Pitch' }, { id: 'env', name: 'Envelope' }, { id: 'filter', name: 'Filter' }, { id: 'fx', name: 'Effects' },
];
export const PARAMS = [
  { key: 'wave', name: 'Waveform', group: 'tone', kind: 'wave' },
  { key: 'freq', name: 'Start pitch', group: 'tone', min: 30, max: 4000, step: 1, unit: 'Hz', log: true },
  { key: 'duty', name: 'Square width', group: 'tone', min: 0.05, max: 0.5, step: 0.01, unit: '' },
  { key: 'dutySweep', name: 'Width sweep', group: 'tone', min: -2, max: 2, step: 0.01, unit: '/s' },
  { key: 'noise', name: 'Noise mixed in', group: 'tone', min: 0, max: 1, step: 0.01, unit: '' },
  { key: 'sub', name: 'Low thump', group: 'tone', min: 0, max: 1, step: 0.01, unit: '' },
  { key: 'slide', name: 'Pitch slide', group: 'pitch', min: -24, max: 24, step: 0.1, unit: 'oct/s' },
  { key: 'dslide', name: 'Slide curve', group: 'pitch', min: -60, max: 60, step: 0.5, unit: 'oct/s²' },
  { key: 'freqMin', name: 'Lowest pitch', group: 'pitch', min: 20, max: 2000, step: 1, unit: 'Hz', log: true },
  { key: 'vibDepth', name: 'Vibrato depth', group: 'pitch', min: 0, max: 12, step: 0.1, unit: 'st' },
  { key: 'vibSpeed', name: 'Vibrato speed', group: 'pitch', min: 0, max: 40, step: 0.1, unit: 'Hz' },
  { key: 'arp', name: 'Arpeggio jump', group: 'pitch', min: -24, max: 24, step: 1, unit: 'st' },
  { key: 'arpTime', name: 'Arpeggio time', group: 'pitch', min: 0, max: 0.5, step: 0.005, unit: 's' },
  { key: 'arpRepeat', name: 'Keep arpeggiating', group: 'pitch', kind: 'bool' },
  { key: 'repeat', name: 'Repeat every', group: 'pitch', min: 0, max: 0.6, step: 0.005, unit: 's' },
  { key: 'attack', name: 'Attack', group: 'env', min: 0, max: 1, step: 0.001, unit: 's' },
  { key: 'sustain', name: 'Hold', group: 'env', min: 0, max: 2, step: 0.001, unit: 's' },
  { key: 'punch', name: 'Punch', group: 'env', min: 0, max: 1, step: 0.01, unit: '' },
  { key: 'decay', name: 'Decay', group: 'env', min: 0, max: 3, step: 0.001, unit: 's' },
  { key: 'lpf', name: 'Low-pass cutoff', group: 'filter', min: 60, max: 22000, step: 1, unit: 'Hz', log: true },
  { key: 'lpfSweep', name: 'Low-pass sweep', group: 'filter', min: -12, max: 12, step: 0.1, unit: 'oct/s' },
  { key: 'lpfRes', name: 'Resonance', group: 'filter', min: 0, max: 0.95, step: 0.01, unit: '' },
  { key: 'hpf', name: 'High-pass cutoff', group: 'filter', min: 10, max: 8000, step: 1, unit: 'Hz', log: true },
  { key: 'hpfSweep', name: 'High-pass sweep', group: 'filter', min: -12, max: 12, step: 0.1, unit: 'oct/s' },
  { key: 'flangeMix', name: 'Flanger', group: 'fx', min: 0, max: 1, step: 0.01, unit: '' },
  { key: 'flangeDelay', name: 'Flanger delay', group: 'fx', min: 0.1, max: 12, step: 0.1, unit: 'ms' },
  { key: 'flangeSweep', name: 'Flanger sweep', group: 'fx', min: -20, max: 20, step: 0.1, unit: 'ms/s' },
  { key: 'bits', name: 'Bit depth (crush)', group: 'fx', min: 1, max: 16, step: 1, unit: 'bits' },
  { key: 'down', name: 'Sample rate cut', group: 'fx', min: 1, max: 32, step: 1, unit: 'x' },
  { key: 'volume', name: 'Volume', group: 'fx', min: -24, max: 0, step: 0.5, unit: 'dB' },
];
const P = Object.fromEntries(PARAMS.map(p => [p.key, p]));

export const DEFAULTS = {
  wave: 'square', freq: 440, duty: 0.5, dutySweep: 0, noise: 0, sub: 0,
  slide: 0, dslide: 0, freqMin: 20, vibDepth: 0, vibSpeed: 0, arp: 0, arpTime: 0, arpRepeat: false, repeat: 0,
  attack: 0, sustain: 0.1, punch: 0, decay: 0.2,
  lpf: 22000, lpfSweep: 0, lpfRes: 0, hpf: 10, hpfSweep: 0,
  flangeMix: 0, flangeDelay: 2, flangeSweep: 0, bits: 16, down: 1, volume: -3, seed: 1,
};

export const CATEGORIES = [
  { id: 'coin', name: 'Coin' }, { id: 'jump', name: 'Jump' }, { id: 'laser', name: 'Laser' }, { id: 'explosion', name: 'Explosion' },
  { id: 'powerup', name: 'Power-up' }, { id: 'hit', name: 'Hit' }, { id: 'blip', name: 'Blip' }, { id: 'click', name: 'UI click' },
  { id: 'whoosh', name: 'Whoosh' }, { id: 'random', name: 'Anything' },
];

export const MAX_SECONDS = 5;

// ---------------- randomness

/** xorshift32: fast, seeded, the same everywhere */
export function rng(seed) {
  let s = (seed >>> 0) || 0x6d2b79f5;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

/** Parameters made safe: unknown keys dropped, numbers clamped to their ranges, the wave known */
export function clean(p = {}) {
  const out = { ...DEFAULTS };
  for (const d of PARAMS) {
    const v = p[d.key];
    if (d.kind === 'wave') out.wave = WAVES.some(w => w.id === v) ? v : DEFAULTS.wave;
    else if (d.kind === 'bool') out[d.key] = !!v;
    else { const n = +v; out[d.key] = Number.isFinite(n) ? Math.min(d.max, Math.max(d.min, n)) : DEFAULTS[d.key]; }
  }
  const s = Math.round(+p.seed);
  out.seed = Number.isFinite(s) && s > 0 ? s % 4294967296 : 1;
  return out;
}

/** How long a sound is, in seconds (attack + hold + decay, a short flanger tail, capped) */
export const lengthOf = p => Math.min(MAX_SECONDS, Math.max(0.01, p.attack + p.sustain + p.decay + (p.flangeMix > 0 ? p.flangeDelay / 1000 + 0.01 : 0)));

// ---------------- the synth

/**
 * Render a sound to mono samples at `sr`. Returns a Float32Array, normalized to -1 dBFS and then set to the volume,
 * with a short fade at the end so it never clicks off.
 */
export function render(params, sr = 44100) {
  const p = clean(params);
  const n = Math.max(1, Math.round(lengthOf(p) * sr));
  const out = new Float32Array(n);
  const r = rng(p.seed * 2654435761 + 12345);
  const tA = p.attack, tS = p.sustain, tD = p.decay;
  const nyq = sr * 0.45;
  // oscillator state
  let phase = 0, noiseVal = r() * 2 - 1, noiseCount = 0, lfsr = 0x7fff;
  let pk0 = 0, pk1 = 0, pk2 = 0; // soft noise filter
  let subPhase = 0;
  // filters (topology-preserving state variable filters: stable at any setting)
  let lpS1 = 0, lpS2 = 0, hpS1 = 0, hpS2 = 0;
  let lpG = 0, lpK = 0, hpG = 0, hpK = 0;
  const useLp = p.lpf < 21999 || p.lpfSweep !== 0, useHp = p.hpf > 10.5 || p.hpfSweep > 0;
  // flanger
  const flMax = Math.ceil(sr * 0.05) + 2, fl = p.flangeMix > 0 ? new Float32Array(flMax) : null;
  let flPos = 0;
  // crush and sample rate cut
  let held = 0, holdCount = 0;
  const levels = p.bits < 16 ? Math.pow(2, p.bits - 1) : 0;
  const blep = (t, dt) => t < dt ? (t /= dt, t + t - t * t - 1) : t > 1 - dt ? (t = (t - 1) / dt, t * t + t + t + 1) : 0;

  for (let i = 0; i < n; i++) {
    const t = i / sr;
    // repeat: the pitch, arpeggio and width start over every `repeat` seconds
    const tl = p.repeat > 0 ? t % p.repeat : t;
    // pitch: slide (octaves per second) with a curve, vibrato, arpeggio
    let oct = p.slide * tl + 0.5 * p.dslide * tl * tl;
    if (p.vibDepth > 0 && p.vibSpeed > 0) oct += p.vibDepth / 12 * Math.sin(2 * Math.PI * p.vibSpeed * t);
    if (p.arp !== 0 && p.arpTime > 0) {
      const k = Math.floor(tl / p.arpTime);
      if (p.arpRepeat ? k % 2 === 1 : k >= 1) oct += p.arp / 12;
    }
    let f = p.freq * Math.pow(2, Math.max(-20, Math.min(20, oct)));
    if (f < p.freqMin) f = p.freqMin;
    if (f > nyq) f = nyq;
    const dt = f / sr;
    const duty = Math.min(0.5, Math.max(0.02, p.duty + p.dutySweep * tl));
    // the oscillator
    let v;
    switch (p.wave) {
      case 'square': v = (phase < duty ? 1 : -1) + blep(phase, dt) - blep((phase - duty + 1) % 1, dt); break;
      case 'saw': v = 2 * phase - 1 - blep(phase, dt); break;
      case 'triangle': v = phase < 0.5 ? 4 * phase - 1 : 3 - 4 * phase; break;
      case 'sine': v = Math.sin(2 * Math.PI * phase); break;
      case 'noise': case 'pink': case 'crunch': {
        // noise is clocked by the pitch, so pitch and slide still shape it (32 steps per cycle)
        noiseCount += dt * 32;
        while (noiseCount >= 1) {
          noiseCount -= 1;
          if (p.wave === 'crunch') { const bit = (lfsr ^ (lfsr >> 1)) & 1; lfsr = (lfsr >> 1) | (bit << 14); lfsr = (lfsr & ~(1 << 6)) | (bit << 6); noiseVal = lfsr & 1 ? 1 : -1; }
          else noiseVal = r() * 2 - 1;
        }
        v = noiseVal;
        if (p.wave === 'pink') { pk0 = 0.99765 * pk0 + v * 0.099; pk1 = 0.963 * pk1 + v * 0.2965; pk2 = 0.57 * pk2 + v * 1.0527; v = (pk0 + pk1 + pk2 + v * 0.1848) * 0.3; }
        if (p.wave === 'crunch') v *= 0.8;
        break;
      }
      default: v = 0;
    }
    phase += dt; if (phase >= 1) phase -= Math.floor(phase);
    if (p.noise > 0) v = v * (1 - p.noise) + (r() * 2 - 1) * p.noise;
    // low thump: a sine that drops from 150 to 45 Hz, for impacts and explosions
    if (p.sub > 0) {
      const sf = 45 + 105 * Math.exp(-t / 0.05);
      subPhase += sf / sr;
      v += p.sub * 1.4 * Math.sin(2 * Math.PI * subPhase) * Math.exp(-t / Math.max(0.05, 0.6 * (tS + tD)));
    }
    // filters, coefficients refreshed every 16 samples
    if ((i & 15) === 0) {
      if (useLp) { const c = Math.min(nyq, Math.max(30, p.lpf * Math.pow(2, Math.max(-14, Math.min(14, p.lpfSweep * t))))); lpG = Math.tan(Math.PI * c / sr); lpK = 2 - 2 * p.lpfRes * 0.98; }
      if (useHp) { const c = Math.min(nyq, Math.max(10, p.hpf * Math.pow(2, Math.max(-14, Math.min(14, p.hpfSweep * t))))); hpG = Math.tan(Math.PI * c / sr); hpK = 1.414; }
    }
    if (useLp) {
      const a1 = 1 / (1 + lpG * (lpG + lpK)), a2 = lpG * a1, a3 = lpG * a2;
      const v3 = v - lpS2, v1 = a1 * lpS1 + a2 * v3, v2 = lpS2 + a2 * lpS1 + a3 * v3;
      lpS1 = 2 * v1 - lpS1; lpS2 = 2 * v2 - lpS2;
      v = v2;
    }
    if (useHp) {
      const a1 = 1 / (1 + hpG * (hpG + hpK)), a2 = hpG * a1, a3 = hpG * a2;
      const v3 = v - hpS2, v1 = a1 * hpS1 + a2 * v3, v2 = hpS2 + a2 * hpS1 + a3 * v3;
      hpS1 = 2 * v1 - hpS1; hpS2 = 2 * v2 - hpS2;
      v = v - hpK * v1 - v2;
    }
    // envelope: attack up, hold (with punch), decay down
    let env;
    if (t < tA) env = t / tA;
    else if (t < tA + tS) env = 1 + p.punch * (1 - (t - tA) / tS);
    else if (t < tA + tS + tD) env = Math.pow(1 - (t - tA - tS) / tD, 1.6);
    else env = 0;
    v *= env;
    // flanger: the sound plus a copy delayed by a few sweeping milliseconds
    if (fl) {
      fl[flPos] = v;
      const dly = Math.min(flMax - 2, Math.max(1, (p.flangeDelay + p.flangeSweep * t) / 1000 * sr));
      let rp = flPos - dly; if (rp < 0) rp += flMax;
      const k = Math.floor(rp), fr = rp - k, a = fl[k], b = fl[(k + 1) % flMax];
      v = v * (1 - p.flangeMix * 0.5) + (a + (b - a) * fr) * p.flangeMix * 0.5 * 2;
      flPos = (flPos + 1) % flMax;
    }
    // sample rate cut and bit crush
    if (p.down > 1) { if (holdCount <= 0) { held = v; holdCount = p.down; } holdCount--; v = held; }
    if (levels) v = Math.round(Math.max(-1, Math.min(1, v)) * levels) / levels;
    out[i] = v;
  }
  // normalize to -1 dBFS, then the volume; a short fade at the very end
  let peak = 0;
  for (let i = 0; i < n; i++) { const a = Math.abs(out[i]); if (a > peak) peak = a; }
  const g = peak > 1e-9 ? Math.pow(10, -1 / 20) / peak * Math.pow(10, p.volume / 20) : 0;
  const fade = Math.min(n, Math.round(sr * 0.003));
  for (let i = 0; i < n; i++) out[i] *= g * (i >= n - fade ? (n - i) / fade : 1);
  return out;
}

// ---------------- generators and mutation

/** A new sound in a category. seed picks the variation (and becomes the sound's noise seed). */
export function generate(category, seed = 1) {
  const r = rng(seed * 7919 + category.length * 104729 + category.charCodeAt(0));
  const rr = (a, b) => a + (b - a) * r(), pick = a => a[Math.floor(r() * a.length)], chance = x => r() < x;
  const p = { ...DEFAULTS, seed };
  switch (category) {
    case 'coin':
      Object.assign(p, { wave: pick(['square', 'square', 'triangle', 'saw']), freq: rr(700, 1800), duty: rr(0.2, 0.5), attack: 0, sustain: rr(0.02, 0.08), punch: rr(0.2, 0.6), decay: rr(0.1, 0.35) });
      if (chance(0.8)) Object.assign(p, { arp: pick([5, 7, 12, 4]), arpTime: rr(0.03, 0.09) });
      break;
    case 'jump':
      Object.assign(p, { wave: pick(['square', 'square', 'triangle', 'sine']), freq: rr(180, 520), slide: rr(2.5, 7), dslide: rr(-6, 0), duty: rr(0.15, 0.5),
        attack: 0, sustain: rr(0.04, 0.14), punch: rr(0, 0.3), decay: rr(0.08, 0.25), hpf: chance(0.5) ? rr(60, 250) : 10 });
      break;
    case 'laser':
      Object.assign(p, { wave: pick(['square', 'saw', 'sine', 'square']), freq: rr(700, 2600), slide: -rr(4, 12), dslide: rr(0, 15), freqMin: rr(60, 300), duty: rr(0.1, 0.5),
        dutySweep: chance(0.4) ? rr(-1, 1) : 0, attack: 0, sustain: rr(0.03, 0.15), punch: rr(0, 0.5), decay: rr(0.05, 0.3) });
      if (chance(0.3)) Object.assign(p, { flangeMix: rr(0.3, 0.8), flangeDelay: rr(0.5, 4), flangeSweep: rr(-8, 8) });
      if (chance(0.3)) p.hpf = rr(100, 600);
      break;
    case 'explosion':
      Object.assign(p, { wave: pick(['noise', 'noise', 'crunch', 'pink']), freq: rr(60, 400), slide: rr(-3, 0.5), attack: 0, sustain: rr(0.05, 0.3), punch: rr(0.3, 0.8),
        decay: rr(0.4, 1.4), lpf: rr(1500, 9000), lpfSweep: -rr(0.5, 3), sub: chance(0.7) ? rr(0.3, 0.9) : 0 });
      if (chance(0.3)) Object.assign(p, { repeat: rr(0.15, 0.4) });
      if (chance(0.3)) Object.assign(p, { flangeMix: rr(0.2, 0.6), flangeDelay: rr(2, 9), flangeSweep: rr(-10, 10) });
      break;
    case 'powerup':
      Object.assign(p, { wave: pick(['square', 'triangle', 'saw', 'square']), freq: rr(200, 600), slide: rr(0.8, 4), duty: rr(0.2, 0.5), attack: 0, sustain: rr(0.15, 0.4),
        punch: rr(0, 0.3), decay: rr(0.15, 0.45) });
      if (chance(0.6)) Object.assign(p, { repeat: rr(0.06, 0.16) });
      else Object.assign(p, { vibDepth: rr(0.3, 1.5), vibSpeed: rr(8, 20) });
      if (chance(0.4)) Object.assign(p, { arp: pick([7, 12, 5]), arpTime: rr(0.03, 0.08), arpRepeat: true });
      break;
    case 'hit':
      Object.assign(p, { wave: pick(['noise', 'square', 'saw', 'crunch']), freq: rr(120, 700), slide: -rr(2, 9), attack: 0, sustain: rr(0.005, 0.05), punch: rr(0.2, 0.7),
        decay: rr(0.06, 0.25), sub: chance(0.5) ? rr(0.2, 0.7) : 0, lpf: chance(0.5) ? rr(1200, 6000) : 22000 });
      if (p.wave === 'square') p.noise = rr(0.1, 0.5);
      break;
    case 'blip':
      Object.assign(p, { wave: pick(['square', 'triangle', 'sine', 'square']), freq: rr(400, 1600), duty: rr(0.2, 0.5), attack: 0, sustain: rr(0.02, 0.07), punch: 0, decay: rr(0.01, 0.08),
        hpf: chance(0.4) ? rr(100, 400) : 10 });
      break;
    case 'click':
      Object.assign(p, { wave: pick(['sine', 'triangle', 'noise', 'square']), freq: rr(800, 3500), slide: chance(0.5) ? -rr(2, 8) : 0, attack: 0, sustain: rr(0.002, 0.012), punch: rr(0, 0.5),
        decay: rr(0.01, 0.05), hpf: rr(200, 1500), lpf: rr(5000, 16000), volume: -6 });
      break;
    case 'whoosh':
      Object.assign(p, { wave: pick(['pink', 'noise', 'pink']), freq: rr(800, 3000), attack: rr(0.1, 0.4), sustain: rr(0, 0.15), decay: rr(0.2, 0.6), lpf: rr(300, 1200),
        lpfSweep: rr(2, 6), lpfRes: rr(0.2, 0.7), hpf: rr(80, 300), hpfSweep: rr(0, 2) });
      if (chance(0.5)) Object.assign(p, { lpf: rr(4000, 9000), lpfSweep: -rr(2, 5) });
      if (chance(0.3)) Object.assign(p, { flangeMix: rr(0.3, 0.8), flangeDelay: rr(1, 6), flangeSweep: rr(-6, 6) });
      break;
    default: { // anything: every knob at random, kept within things that make a sound
      for (const d of PARAMS) {
        if (d.kind === 'wave') p.wave = pick(WAVES).id;
        else if (d.kind === 'bool') p[d.key] = chance(0.3);
        else p[d.key] = d.log ? Math.exp(rr(Math.log(d.min), Math.log(d.max))) : rr(d.min, d.max);
      }
      Object.assign(p, { attack: chance(0.7) ? rr(0, 0.05) : rr(0, 0.4), sustain: rr(0.02, 0.4), decay: rr(0.05, 0.8), slide: rr(-8, 8), dslide: rr(-10, 10), freqMin: 20,
        lpf: chance(0.5) ? 22000 : rr(800, 12000), lpfSweep: rr(-2, 2), hpf: chance(0.6) ? 10 : rr(20, 800), hpfSweep: 0, bits: chance(0.8) ? 16 : Math.round(rr(4, 12)),
        down: chance(0.8) ? 1 : Math.round(rr(2, 8)), volume: -3, repeat: chance(0.7) ? 0 : rr(0.05, 0.3), flangeMix: chance(0.7) ? 0 : rr(0.2, 0.8) });
      if (!p.arpRepeat && chance(0.6)) p.arp = 0;
    }
  }
  return clean(p);
}

/**
 * Nudge a sound: every unlocked number moves by up to `amount` of its range (pitch-like knobs on a log scale),
 * and the noise seed changes. locks: Set or array of keys to leave alone.
 */
export function mutate(params, seed = 1, amount = 0.08, locks = []) {
  const lock = new Set(locks), r = rng(seed * 48271 + 11);
  const p = clean(params);
  for (const d of PARAMS) {
    if (lock.has(d.key) || d.kind) continue;
    const v = p[d.key];
    // knobs that are off stay off most of the time (so a mutate doesn't suddenly add a flanger or vibrato)
    const offAt = { noise: 0, sub: 0, vibDepth: 0, arp: 0, repeat: 0, flangeMix: 0, dutySweep: 0, dslide: 0, lpfSweep: 0, hpfSweep: 0, lpfRes: 0 }[d.key];
    if (offAt !== undefined && v === offAt && r() < 0.85) continue;
    if ((d.key === 'lpf' && v >= 21999) || (d.key === 'hpf' && v <= 10.5) || (d.key === 'bits' && v === 16) || (d.key === 'down' && v === 1)) { if (r() < 0.9) continue; }
    const u = (r() + r() - 1) * amount;
    if (d.log) p[d.key] = Math.exp(Math.log(v) + u * Math.log(d.max / d.min));
    else p[d.key] = v + u * (d.max - d.min);
    if (d.step >= 1) p[d.key] = Math.round(p[d.key]);
  }
  if (!lock.has('seed')) p.seed = 1 + Math.floor(r() * 2147483646);
  return clean(p);
}

// ---------------- files

/**
 * WAV bytes from mono samples. bits: 8 (unsigned), 16, 24 (PCM) or 32 (float). 8 and 16 bit are dithered with seeded
 * noise, so the same sound always makes the same file.
 */
export function encodeWav(x, sr, bits = 16) {
  if (![8, 16, 24, 32].includes(bits)) throw new Error('bits must be 8, 16, 24 or 32');
  const float = bits === 32, bps = bits / 8, n = x.length, dataLen = n * bps;
  const fmtLen = float ? 18 : 16, factLen = float ? 12 : 0;
  const head = 12 + 8 + fmtLen + factLen + 8;
  const buf = new ArrayBuffer(head + dataLen + (dataLen & 1)), v = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, buf.byteLength - 8, true); w(8, 'WAVE');
  w(12, 'fmt '); v.setUint32(16, fmtLen, true); v.setUint16(20, float ? 3 : 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * bps, true); v.setUint16(32, bps, true); v.setUint16(34, bits, true);
  let o = 20 + fmtLen;
  if (float) { v.setUint16(36, 0, true); w(o, 'fact'); v.setUint32(o + 4, 4, true); v.setUint32(o + 8, n, true); o += 12; }
  w(o, 'data'); v.setUint32(o + 4, dataLen, true); o += 8;
  const r = rng(0x5eed);
  const clip = s => s > 1 ? 1 : s < -1 ? -1 : s;
  for (let i = 0; i < n; i++) {
    const s = x[i];
    if (float) { v.setFloat32(o, clip(s), true); o += 4; }
    else if (bits === 24) { const q = Math.round(clip(s) * 8388607); v.setUint8(o, q & 255); v.setUint8(o + 1, (q >> 8) & 255); v.setUint8(o + 2, (q >> 16) & 255); o += 3; }
    else if (bits === 16) { const q = Math.round(clip(s + (r() - r()) / 32767) * 32767); v.setInt16(o, Math.max(-32768, Math.min(32767, q)), true); o += 2; }
    else { const q = Math.round(clip(s + (r() - r()) / 127) * 127) + 128; v.setUint8(o, Math.max(0, Math.min(255, q))); o += 1; }
  }
  return new Uint8Array(buf);
}

/** Reads the header of a WAV this module wrote (used by the tests and the pack check) */
export function readWavHeader(b) {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength), s = (o, n) => String.fromCharCode(...b.subarray(o, o + n));
  if (s(0, 4) !== 'RIFF' || s(8, 4) !== 'WAVE') return null;
  let o = 12, fmt = null, data = null;
  while (o + 8 <= b.length) {
    const id = s(o, 4), len = v.getUint32(o + 4, true);
    if (id === 'fmt ') fmt = { format: v.getUint16(o + 8, true), channels: v.getUint16(o + 10, true), sr: v.getUint32(o + 12, true), byteRate: v.getUint32(o + 16, true), align: v.getUint16(o + 20, true), bits: v.getUint16(o + 22, true) };
    if (id === 'data') { data = { offset: o + 8, length: len }; break; }
    o += 8 + len + (len & 1);
  }
  return fmt && data ? { ...fmt, ...data, riffSize: v.getUint32(4, true), samples: data.length / (fmt.bits / 8) / fmt.channels } : null;
}

/** A short text code for a sound (so it can be shared or pasted back): only the knobs that differ from the defaults */
export function toCode(params) {
  const p = clean(params), d = {};
  for (const k of Object.keys(DEFAULTS)) if (p[k] !== DEFAULTS[k]) d[k] = p[k];
  const json = JSON.stringify(d);
  const b64 = typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(json))) : Buffer.from(json).toString('base64');
  return 'sfx1:' + b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function fromCode(code) {
  const m = /^\s*sfx1:([A-Za-z0-9_-]+)\s*$/.exec(code || '');
  if (!m) throw new Error('That isn\'t an ENCORE. SFX sound code.');
  const b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
  const json = typeof atob === 'function' ? decodeURIComponent(escape(atob(b64))) : Buffer.from(b64, 'base64').toString();
  return clean(JSON.parse(json));
}

/** A file name for a sound: lower case, safe characters, no clashes within a pack */
export function fileName(name, taken = new Set()) {
  const base = String(name || 'sound').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'sound';
  let f = base + '.wav', k = 2;
  while (taken.has(f)) f = `${base}_${k++}.wav`;
  taken.add(f);
  return f;
}

/** The next free name in a category: coin_01, coin_02 ... */
export function nextName(base, names) {
  const used = new Set(names);
  for (let k = 1; k < 1000; k++) { const nm = `${base}_${String(k).padStart(2, '0')}`; if (!used.has(nm)) return nm; }
  return base + '_' + Date.now();
}

/** A saved pack (or one sound) read from JSON, made safe: [{ name, params }] */
export function readPack(json) {
  const d = typeof json === 'string' ? JSON.parse(json) : json;
  const list = Array.isArray(d) ? d : Array.isArray(d?.sounds) ? d.sounds : d?.params ? [d] : null;
  if (!list) throw new Error('That file has no ENCORE. SFX sounds in it.');
  return list.slice(0, 500).filter(s => s && typeof s === 'object').map((s, i) => ({
    name: (typeof s.name === 'string' ? s.name : '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 40) || 'sound_' + String(i + 1).padStart(2, '0'),
    params: clean(s.params || (typeof s.code === 'string' ? fromCode(s.code) : {})),
  }));
}
export const packJson = sounds => JSON.stringify({ format: 'encore-sfx', version: 1, sounds: sounds.map(s => ({ name: s.name, code: toCode(s.params), params: clean(s.params) })) }, null, 1);
