// Encore Beatpad: the built-in kit, synthesized here (no sample files, so it works offline and loads instantly).
// Every sound is at full level within its first millisecond: the attack is the drum. Plain Float32Arrays, so it runs
// in Node for the tests and in the page (copied into AudioBuffers there).

/** The built-in kits. Three are synthesized here; Acoustic is real recorded drums, fetched (from kits/acoustic/, a
 *  kit folder in the Beatpad format) only when someone picks it. Each pad: [slot, name, sound id, MIDI note, choke group] */
export const KITS = [
  { id: 'encore', name: 'Encore', about: 'A punchy all-round kit, made right here in your browser (works offline).',
    pads: [[1, 'Kick', 'kick', 36], [2, 'Snare', 'snare', 38], [3, 'Closed hat', 'closedHat', 42, 1], [4, 'Clap', 'clap', 39], [5, 'Rim', 'rim', 37],
           [6, 'Open hat', 'openHat', 46, 1], [7, 'High tom', 'highTom', 48], [8, 'Low tom', 'lowTom', 45], [9, 'Crash', 'crash', 49]] },
  { id: 'boom', name: 'Boom', about: 'In the style of the classic analog drum machine: a deep, long, booming kick, a snappy snare, metallic hats and a cowbell.',
    pads: [[1, 'Kick', 'boomKick', 36], [2, 'Snare', 'boomSnare', 38], [3, 'Closed hat', 'boomClosedHat', 42, 1], [4, 'Clap', 'boomClap', 39], [5, 'Rim', 'boomRim', 37],
           [6, 'Open hat', 'boomOpenHat', 46, 1], [7, 'High tom', 'boomHighTom', 48], [8, 'Low tom', 'boomLowTom', 45], [9, 'Cowbell', 'boomCowbell', 56]] },
  { id: 'club', name: 'Club', about: 'In the style of the classic house and techno drum machine: a short punchy kick, a bright snare, crisp hats, ride and crash.',
    pads: [[1, 'Kick', 'clubKick', 36], [2, 'Snare', 'clubSnare', 38], [3, 'Closed hat', 'clubClosedHat', 42, 1], [4, 'Clap', 'clubClap', 39], [5, 'Rim', 'clubRim', 37],
           [6, 'Open hat', 'clubOpenHat', 46, 1], [7, 'Tom', 'clubTom', 48], [8, 'Ride', 'clubRide', 51], [9, 'Crash', 'clubCrash', 49]] },
  { id: 'acoustic', name: 'Acoustic', url: 'kits/acoustic/', about: 'A real drum kit, recorded. It loads the first time you pick it (about 0.7 MB).',
    credit: 'Acoustic kit: Virtuosity Drums by Versilian Studios, CC0' },
];

/** Every synthesized sound, by id, with a name for the "built-in sound" list */
export const BUILTIN = [
  ...KITS.filter(k => k.pads).flatMap(k => k.pads.map(([, name, id]) => ({ id, name: (k.id === 'encore' ? '' : k.name + ': ') + name, kit: k.id }))),
  { id: 'shaker', name: 'Shaker', kit: 'extra' },
];

/** A seeded random source (so the kit sounds the same every time) */
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

/** A biquad filter (RBJ cookbook), in place: 'hp' high-pass, 'lp' low-pass, 'bp' band-pass, 'peak' (gainDb) */
function biquad(x, sr, type, hz, q, gainDb = 0) {
  const w = 2 * Math.PI * Math.min(hz, sr * 0.45) / sr, al = Math.sin(w) / (2 * q), c = Math.cos(w);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'peak') { const A = Math.pow(10, gainDb / 40); b0 = 1 + al * A; b1 = -2 * c; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * c; a2 = 1 - al / A; }
  else {
    a0 = 1 + al; a1 = -2 * c; a2 = 1 - al;
    [b0, b1, b2] = type === 'hp' ? [(1 + c) / 2, -(1 + c), (1 + c) / 2] : type === 'lp' ? [(1 - c) / 2, 1 - c, (1 - c) / 2] : [al, 0, -al];
  }
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i], y = (b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = v; y2 = y1; y1 = y;
    x[i] = y;
  }
  return x;
}

/** A square wave that doesn't alias (polyBLEP), cheap enough to stack six of for cymbal metal */
function square(sr, n, hz, phase0 = 0) {
  const x = new Float32Array(n), dt = hz / sr;
  const blep = t => t < dt ? (t /= dt, t + t - t * t - 1) : t > 1 - dt ? (t = (t - 1) / dt, t * t + t + t + 1) : 0;
  let t = phase0;
  for (let i = 0; i < n; i++) {
    let v = t < 0.5 ? 1 : -1;
    v += blep(t);
    v -= blep((t + 0.5) % 1);
    x[i] = v;
    t += dt; if (t >= 1) t -= 1;
  }
  return x;
}

/** The six clashing square waves of a drum machine's hats and cymbals, `scale` times the classic pitches */
function metal(sr, n, scale = 1) {
  const x = new Float32Array(n);
  [205.3, 304.4, 369.6, 522.7, 540, 800].forEach((hz, k) => { const s = square(sr, n, hz * scale, k * 0.17); for (let i = 0; i < n; i++) x[i] += s[i] / 6; });
  return x;
}

const noise = (n, seed) => { const r = rng(seed), x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = r() * 2 - 1; return x; };
/** Soft saturation: makes a drum dense and loud without hard clipping */
const drive = (x, k) => { const d = Math.tanh(k); for (let i = 0; i < x.length; i++) x[i] = Math.tanh(k * x[i]) / d; return x; };

/** Starts a sound where it first gets loud (filters ease into a hit) */
function onTime(x) {
  let peak = 0;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  let i = 0;
  while (i < x.length && Math.abs(x[i]) < 0.3 * peak) i++;
  return i > 2 ? x.slice(i - 2) : x;
}

/** Peak to `level`, with a short fade at the very end so nothing clicks off */
function finish(x, level) {
  x = onTime(x);
  let peak = 0;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  const fade = Math.min(x.length, 512), g = level / (peak || 1);
  for (let i = 0; i < x.length; i++) x[i] *= g * (i > x.length - fade ? (x.length - i) / fade : 1);
  return x;
}

/** A pitched drum: a sine (starting at its peak, so the hit is instant) that drops from `hiHz` to `loHz`, plus a click.
 *  tau: how long the body rings; drop: how fast the pitch falls */
function body(sr, seconds, hiHz, loHz, tau, drop, { hold = 0, click = 0.25, clickHz = 3500, second = 0, seed = 5 } = {}) {
  const n = Math.floor(sr * seconds), x = new Float32Array(n);
  let ph = 0, ph2 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr, f = loHz + (hiHz - loHz) * Math.exp(-t / drop);
    const env = t < hold ? 1 : Math.exp(-(t - hold) / tau);
    x[i] = env * (Math.cos(ph) + second * Math.cos(ph2) * Math.exp(-t / (tau * 0.5)));
    ph += 2 * Math.PI * f / sr; ph2 += 2 * Math.PI * f * 1.58 / sr;
  }
  if (click) {
    const c = noise(Math.floor(sr * 0.006), seed);
    biquad(c, sr, 'bp', clickHz, 0.8);
    for (let i = 0; i < c.length; i++) x[i] += click * 4 * c[i] * Math.exp(-i / sr / 0.0012);
  }
  return x;
}

/** Filtered noise with an envelope (env: t -> level) */
function hiss(sr, seconds, env, seed, filters) {
  const n = Math.floor(sr * seconds), x = noise(n, seed);
  for (const [type, hz, q, g] of filters) biquad(x, sr, type, hz, q, g);
  for (let i = 0; i < n; i++) x[i] *= env(i / sr);
  return x;
}
const mix = (...parts) => { const n = Math.max(...parts.map(([p]) => p.length)), x = new Float32Array(n); for (const [p, g] of parts) for (let i = 0; i < p.length; i++) x[i] += p[i] * g; return x; };

/** A clap: several hands a few milliseconds apart (gap), then the room (room seconds) */
function clap(sr, gap, room, hz, seed) {
  const hits = [0, gap, gap * 2, gap * 2.9], last = hits[3];
  const env = t => { let v = 0; for (const h of hits) if (t >= h) v = Math.max(v, Math.exp(-(t - h) / 0.0045)); return t >= last ? Math.max(v, 0.6 * Math.exp(-(t - last) / room)) : v; };
  return drive(hiss(sr, room * 3.5, env, seed, [['bp', hz, 1.1], ['hp', 500, 0.7], ['peak', hz * 2.2, 1, 3]]), 1.6);
}

/** Struck wood or metal: decaying sines [[Hz, level, decay seconds]] that start at their peak, plus a noise tick */
function modes(sr, seconds, partials, tick, seed) {
  const n = Math.floor(sr * seconds), x = new Float32Array(n);
  for (const [hz, a, tau] of partials) { const w = 2 * Math.PI * hz / sr; for (let i = 0; i < n; i++) x[i] += a * Math.cos(w * i) * Math.exp(-i / sr / tau); }
  const c = hiss(sr, 0.01, t => Math.exp(-t / 0.0012), seed, [['hp', 2500, 0.7]]);
  for (let i = 0; i < c.length; i++) x[i] += tick * c[i];
  return x;
}

/** A snare: the head (two modes) and the wires (bright noise), both straight in at full level */
function snare(sr, { hz, tau, wires, wireHp, bright, seed, drv = 1.8, head = 0.8, wireMix = 0.9 }) {
  const h = body(sr, wires * 3, hz * 1.4, hz, tau, 0.012, { click: 0.2, clickHz: 5000, second: 0.55, seed });
  const w = hiss(sr, wires * 3, t => Math.exp(-t / wires) * (0.75 + 0.25 * Math.exp(-t / 0.01)), seed + 8, [['hp', wireHp, 0.7], ['peak', bright, 1, 4], ['lp', 13000, 0.7]]);
  return drive(mix([h, head], [w, wireMix]), drv);
}

/** A cymbal: metal and noise high-passed, a splash up front and a wash after; bell: sines for a ride's ping */
function cymbal(sr, seconds, { scale, hp, peakHz, splash, wash, metalMix = 0.55, noiseMix = 0.6, bell = null, seed }) {
  const n = Math.floor(sr * seconds), m = metal(sr, n, scale), z = noise(n, seed), x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = metalMix * m[i] + noiseMix * z[i];
  biquad(x, sr, 'hp', hp, 0.7); biquad(x, sr, 'peak', peakHz, 0.8, 4); biquad(x, sr, 'lp', 14500, 0.6);
  for (let i = 0; i < n; i++) { const t = i / sr; x[i] *= 0.5 * Math.exp(-t / splash) + 0.5 * Math.exp(-t / wash); }
  if (bell) for (const [hz, a, tau] of bell) { const w = 2 * Math.PI * hz / sr; for (let i = 0; i < n; i++) x[i] += a * Math.cos(w * i) * Math.exp(-i / sr / tau); }
  return x;
}

function hat(sr, seconds, env, seed, scale = 1, metalMix = 0.7) {
  const n = Math.floor(sr * seconds), m = metal(sr, n, scale), z = noise(n, seed), x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = metalMix * m[i] + 0.45 * z[i];
  biquad(x, sr, 'bp', 10000, 0.8);
  biquad(x, sr, 'hp', 7000, 0.7);
  biquad(x, sr, 'hp', 7000, 0.7);
  biquad(x, sr, 'lp', 15000, 0.6);
  for (let i = 0; i < n; i++) x[i] *= env(i / sr);
  return x;
}


function tom(sr, hz, tau, seed) {
  return drive(body(sr, tau * 2.6, hz * 1.5, hz, tau, 0.03, { click: 0.22, clickHz: 3000, second: 0.3, seed }), 1.9);
}

const MAKERS = {
  // Encore: a tight, round kick (165 Hz falling fast to 48, a short hold so it thumps, a beater click on top)
  kick: sr => { const x = body(sr, 0.6, 165, 48, 0.2, 0.032, { hold: 0.018, click: 0.35, clickHz: 4000 }); biquad(x, sr, 'peak', 60, 0.8, 3); return drive(x, 2.4); },
  snare: sr => snare(sr, { hz: 185, tau: 0.055, wires: 0.13, wireHp: 1400, bright: 5000, seed: 9 }),
  closedHat: sr => hat(sr, 0.16, t => Math.exp(-t / 0.028), 31),
  openHat: sr => hat(sr, 0.95, t => 0.25 * Math.exp(-t / 0.012) + 0.75 * Math.exp(-t / 0.3), 32),
  clap: sr => clap(sr, 0.0085, 0.11, 1150, 41),
  // a rimshot: the stick on the hoop (a sharp wooden knock) and the head under it
  rim: sr => drive(modes(sr, 0.14, [[1720, 1, 0.014], [510, 0.7, 0.02], [3950, 0.35, 0.006], [880, 0.3, 0.012]], 1.2, 51), 1.5),
  highTom: sr => tom(sr, 205, 0.2, 61),
  lowTom: sr => tom(sr, 120, 0.3, 62),
  crash: sr => cymbal(sr, 2.4, { scale: 1.42, hp: 3200, peakHz: 6500, splash: 0.04, wash: 0.75, seed: 71 }),

  // Boom, the classic analog machine: a nearly pure sine kick that falls slowly and rings a long time
  boomKick: sr => drive(body(sr, 1.5, 125, 47, 0.5, 0.06, { hold: 0.025, click: 0.18, clickHz: 2500, seed: 101 }), 1.5),
  boomSnare: sr => snare(sr, { hz: 238, tau: 0.04, wires: 0.075, wireHp: 1900, bright: 6000, seed: 103, drv: 1.5, head: 0.9, wireMix: 1 }),
  boomClosedHat: sr => hat(sr, 0.12, t => Math.exp(-t / 0.02), 105),
  boomOpenHat: sr => hat(sr, 0.8, t => 0.2 * Math.exp(-t / 0.01) + 0.8 * Math.exp(-t / 0.24), 106),
  boomClap: sr => clap(sr, 0.011, 0.17, 1000, 107),
  boomRim: sr => modes(sr, 0.06, [[1667, 1, 0.006], [455, 0.8, 0.007]], 0.6, 109),
  boomHighTom: sr => drive(body(sr, 0.7, 230, 185, 0.22, 0.05, { click: 0.06, clickHz: 2500, seed: 111 }), 1.3),
  boomLowTom: sr => drive(body(sr, 0.9, 140, 108, 0.3, 0.05, { click: 0.06, clickHz: 2500, seed: 112 }), 1.3),
  // the drum machine cowbell: two square waves a not-quite-fifth apart, band-passed, a sharp drop then a ring
  boomCowbell: sr => {
    const n = Math.floor(sr * 0.45), a = square(sr, n, 540), b = square(sr, n, 800), x = new Float32Array(n);
    for (let i = 0; i < n; i++) x[i] = a[i] + b[i];
    biquad(x, sr, 'bp', 2000, 0.9); biquad(x, sr, 'hp', 400, 0.7);
    for (let i = 0; i < n; i++) { const t = i / sr; x[i] *= 0.7 * Math.exp(-t / 0.012) + 0.3 * Math.exp(-t / 0.13); }
    return x;
  },

  // Club, the house and techno machine: a short kick that starts high and punches, with a hard beater click
  clubKick: sr => { const x = body(sr, 0.5, 260, 52, 0.15, 0.018, { hold: 0.012, click: 0.55, clickHz: 5000, seed: 121 }); biquad(x, sr, 'peak', 70, 0.9, 2); return drive(x, 3); },
  clubSnare: sr => snare(sr, { hz: 210, tau: 0.05, wires: 0.17, wireHp: 2400, bright: 7500, seed: 123, drv: 2.2, head: 0.7, wireMix: 1.1 }),
  clubClosedHat: sr => hat(sr, 0.12, t => Math.exp(-t / 0.022), 125, 1.3, 0.3),
  clubOpenHat: sr => hat(sr, 0.7, t => 0.25 * Math.exp(-t / 0.01) + 0.75 * Math.exp(-t / 0.2), 126, 1.3, 0.3),
  clubClap: sr => clap(sr, 0.0075, 0.14, 1400, 127),
  clubRim: sr => modes(sr, 0.08, [[1950, 1, 0.008], [620, 0.6, 0.01], [4400, 0.3, 0.004]], 0.9, 129),
  clubTom: sr => drive(body(sr, 0.6, 290, 160, 0.17, 0.02, { click: 0.3, clickHz: 4000, seed: 131 }), 2),
  clubRide: sr => cymbal(sr, 2.2, { scale: 2.1, hp: 4200, peakHz: 7000, splash: 0.02, wash: 0.7, metalMix: 0.8, noiseMix: 0.3,
                                    bell: [[3150, 0.12, 0.5], [4730, 0.08, 0.4]], seed: 133 }),
  clubCrash: sr => cymbal(sr, 2.2, { scale: 1.6, hp: 4000, peakHz: 8000, splash: 0.03, wash: 0.6, seed: 135 }),

  shaker: sr => hiss(sr, 0.12, t => Math.exp(-t / 0.03), 91, [['hp', 5500, 0.7], ['peak', 9000, 1, 3]]),
};

/** How loud each sound sits next to the others (peak), so a kit is balanced before anyone touches a slider */
const LEVELS = { kick: 0.98, snare: 0.92, closedHat: 0.55, openHat: 0.55, clap: 0.85, rim: 0.75, highTom: 0.9, lowTom: 0.92, crash: 0.6, shaker: 0.5,
  boomCowbell: 0.6, clubRide: 0.5, clubTom: 0.9 };
/** Boom and Club sounds sit where their Encore namesake does */
const levelOf = id => LEVELS[id] ?? LEVELS[id.replace(/^(boom|club)(.)/, (m, k, c) => c.toLowerCase())] ?? 0.8;

/** One built-in sound as a Float32Array at `sr` (null for a name it doesn't know) */
export function renderSound(id, sr) {
  const make = MAKERS[id];
  return make ? finish(make(sr), levelOf(id)) : null;
}

/** Every built-in sound: { id: Float32Array } */
export function renderKit(sr) {
  const out = {};
  for (const { id } of BUILTIN) out[id] = renderSound(id, sr);
  return out;
}
