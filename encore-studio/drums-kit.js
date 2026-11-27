// ENCORE. Drums: which sound plays each drum, for each kit. Pure (Node runs it for the tests).
// The synthesized sounds come from Beatpad's kit (beatpad-kit.js, read only); the Acoustic kit is Beatpad's recorded
// kit folder (kits/acoustic/, CC0), decoded by the page and handed in here as Float32Arrays.
import { renderSound } from './beatpad-kit.js';

/** Each lane: [sound id or file, playback speed, gain] */
export const DRUM_KITS = [
  { id: 'encore', name: 'ENCORE. (synth)', lanes: {
    crash: ['crash', 1, 0.9], china: ['@china:crash', 1.12, 0.85], ride: ['clubRide', 0.9, 0.9], bell: ['clubRide', 1.4, 1], openhat: ['openHat', 1, 0.8],
    hat: ['closedHat', 1, 0.75], pedal: ['closedHat', 0.85, 0.5], tom1: ['highTom', 1, 0.9], tom2: ['lowTom', 1.25, 0.9], tom3: ['lowTom', 0.86, 0.95],
    snare: ['snare', 1, 1], stick: ['rim', 1, 0.8], kick: ['kick', 1, 1] } },
  { id: 'metal', name: 'Metal (synth)', lanes: {
    crash: ['clubCrash', 1, 0.85], china: ['@china:clubCrash', 1.05, 0.85], ride: ['clubRide', 0.9, 0.85], bell: ['clubRide', 1.45, 1], openhat: ['clubOpenHat', 1, 0.7],
    hat: ['clubClosedHat', 1, 0.7], pedal: ['clubClosedHat', 0.85, 0.45], tom1: ['clubTom', 0.9, 0.9], tom2: ['clubTom', 0.72, 0.9], tom3: ['clubTom', 0.56, 0.95],
    snare: ['clubSnare', 0.92, 1], stick: ['clubRim', 1, 0.8], kick: ['@click:clubKick', 1, 1] } },
  { id: 'boom', name: 'Boom (analog machine)', lanes: {
    crash: ['crash', 1, 0.8], china: ['@china:crash', 1.1, 0.8], ride: ['clubRide', 1, 0.8], bell: ['boomCowbell', 1, 0.8], openhat: ['boomOpenHat', 1, 0.8],
    hat: ['boomClosedHat', 1, 0.8], pedal: ['boomClosedHat', 0.85, 0.5], tom1: ['boomHighTom', 1, 0.9], tom2: ['boomLowTom', 1.2, 0.9], tom3: ['boomLowTom', 0.9, 0.95],
    snare: ['boomSnare', 1, 1], stick: ['boomRim', 1, 0.8], kick: ['boomKick', 1, 1] } },
  { id: 'acoustic', name: 'Acoustic (recorded)', url: 'kits/acoustic/', credit: 'Acoustic kit: Virtuosity Drums by Versilian Studios, CC0', lanes: {
    crash: ['08-crash.flac', 1, 0.9], china: ['@china:08-crash.flac', 1.1, 0.85], ride: ['09-ride.flac', 1, 0.9], bell: ['09-ride.flac', 1.3, 1], openhat: ['04-open-hat.flac', 1, 0.85],
    hat: ['03-closed-hat.flac', 1, 0.85], pedal: ['03-closed-hat.flac', 0.9, 0.5], tom1: ['07-high-tom.flac', 1, 0.9], tom2: ['06-low-tom.flac', 1.2, 0.9], tom3: ['06-low-tom.flac', 0.88, 0.95],
    snare: ['02-snare.flac', 1, 1], stick: ['05-rim.flac', 1, 0.85], kick: ['01-kick.flac', 1, 1] } },
];

/** The files a recorded kit needs */
export const kitFiles = kit => [...new Set(Object.values(kit.lanes).map(([id]) => id.replace(/^@\w+:/, '')))];

/** A china from a crash: trashier (driven), quicker to die away, with a bright edge */
export function chinaFrom(x, sr) {
  const y = new Float32Array(x.length);
  let prev = 0;
  for (let i = 0; i < x.length; i++) {
    const t = i / sr, v = Math.tanh(4 * x[i]) * 0.6;
    y[i] = (v - prev * 0.6) * (0.35 + 0.65 * Math.exp(-t / 0.5));
    prev = v;
  }
  let peak = 0; for (const v of y) peak = Math.max(peak, Math.abs(v));
  const g = 0.7 / (peak || 1);
  for (let i = 0; i < y.length; i++) y[i] *= g;
  return y;
}

/** A harder beater click on a kick (metal kicks need to cut through fast double kick) */
export function clickFrom(x, sr) {
  const y = Float32Array.from(x), n = Math.floor(sr * 0.004);
  let s = 12345;
  for (let i = 0; i < n && i < y.length; i++) { s = (s * 1103515245 + 12345) >>> 0; y[i] += (s / 4294967296 - 0.5) * 0.9 * (1 - i / n); }
  let peak = 0; for (const v of y) peak = Math.max(peak, Math.abs(v));
  if (peak > 1) for (let i = 0; i < y.length; i++) y[i] /= peak;
  return y;
}

/**
 * The sounds for every lane: { lane: { data, rate, gain } }. files: { name: Float32Array } for a recorded kit.
 * Missing sounds are left out (that drum stays silent) rather than failing.
 */
export function laneSounds(kitId, sr, files = {}) {
  const kit = DRUM_KITS.find(k => k.id === kitId) || DRUM_KITS[0];
  const cache = {}, out = {};
  const base = id => cache[id] ??= (kit.url ? files[id] || null : renderSound(id, sr));
  for (const [lane, [id, rate, gain]] of Object.entries(kit.lanes)) {
    const m = /^@(\w+):(.+)$/.exec(id);
    let data;
    if (m) { const b = base(m[2]); data = b ? (cache[id] ??= (m[1] === 'china' ? chinaFrom(b, sr) : clickFrom(b, sr))) : null; }
    else data = base(id);
    if (data) out[lane] = { data, rate, gain };
  }
  return out;
}
