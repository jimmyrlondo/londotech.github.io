// Reference matching that explains itself: measure a reference song and the
// current master the same way, describe the differences in plain English,
// and nudge Master's tone / loudness / glue toward the reference.
import { integratedLufs } from "./master-core.js";

const db = (x) => 10 * Math.log10(x + 1e-20);

function bandEnergy(x, fs, f, q = 1.41) {
  const w = (2 * Math.PI * f) / fs, al = Math.sin(w) / (2 * q), c = Math.cos(w), a0 = 1 + al;
  const b0 = al / a0, b2 = -al / a0, a1 = (-2 * c) / a0, a2 = (1 - al) / a0;
  let z1 = 0, z2 = 0, y1 = 0, y2 = 0, e = 0, n = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i] + z1; z1 = -a1 * v + z2; z2 = b2 * x[i] - a2 * v;
    const u = b0 * v + y1; y1 = -a1 * u + y2; y2 = b2 * v - a2 * u;
    if ((i & 1) === 0) { e += u * u; n++; }
  }
  return e / Math.max(1, n);
}

// Loudest stretch (by RMS per second)
export function loudestWindow(l, r, fs, seconds) {
  const per = Math.floor(fs), secs = Math.floor(l.length / per), energy = new Float64Array(secs);
  for (let s = 0; s < secs; s++) { let e = 0; for (let i = s * per; i < (s + 1) * per; i += 4) e += l[i] * l[i] + r[i] * r[i]; energy[s] = e; }
  const w = Math.min(seconds, secs);
  let best = 0, bestE = -1, acc = 0;
  for (let s = 0; s < secs; s++) { acc += energy[s]; if (s >= w) acc -= energy[s - w]; if (s >= w - 1 && acc > bestE) { bestE = acc; best = s - w + 1; } }
  return [best * per, Math.min(l.length, (best + w) * per)];
}

// What a song "is", measured on a stretch of it: tone per octave (relative to
// its own loudness), loudness, squash (peak vs average), stereo width.
export const BANDS = [40, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 12000];
export function profile(l, r, fs, from = 0, to = l.length, wholeLufs = null) {
  const n = to - from, mid = new Float32Array(n), side = new Float32Array(n);
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const a = l[from + i], b = r[from + i];
    mid[i] = 0.5 * (a + b); side[i] = 0.5 * (a - b);
    peak = Math.max(peak, Math.abs(a), Math.abs(b));
  }
  const lufs = integratedLufs(l.subarray(from, to), r.subarray(from, to), fs);
  const tone = BANDS.map((f) => db(bandEnergy(mid, fs, f)) - lufs);
  const width = [[100, 0.7], [1000, 0.7], [8000, 0.7]].map(([f, q]) => db(bandEnergy(side, fs, f, q)) - db(bandEnergy(mid, fs, f, q)));
  return { lufs, wholeLufs: wholeLufs ?? lufs, tone, width, plr: 20 * Math.log10(peak + 1e-12) - lufs };
}

// Our five tone controls and the octaves each one should move
export const REGIONS = [
  { name: "deep bass", hz: "40-60 Hz", bands: [0, 1] },
  { name: "low mids (warmth / mud)", hz: "250-500 Hz", bands: [3, 4] },
  { name: "mids (body of vocals and guitars)", hz: "1-2 kHz", bands: [5, 6] },
  { name: "upper mids (bite and edge)", hz: "around 4 kHz", bands: [7] },
  { name: "air and sparkle", hz: "8-12 kHz", bands: [8, 9] },
];

// reference minus master, per tone region (dB)
export function toneGap(ref, master) {
  return REGIONS.map((rg) => rg.bands.reduce((a, k) => a + (ref.tone[k] - master.tone[k]), 0) / rg.bands.length);
}

// Plain-English differences, biggest first
export function explain(ref, master) {
  const out = [];
  toneGap(ref, master).forEach((d, i) => {
    if (Math.abs(d) >= 1.5) out.push({ size: Math.abs(d), text: `The reference has ${Math.abs(d).toFixed(1)} dB ${d > 0 ? "more" : "less"} ${REGIONS[i].name} (${REGIONS[i].hz}) than yours.` });
  });
  const loud = ref.wholeLufs - master.wholeLufs;
  if (Math.abs(loud) >= 1) out.push({ size: Math.abs(loud), text: `The reference is ${Math.abs(loud).toFixed(1)} dB ${loud > 0 ? "louder" : "quieter"} overall (${ref.wholeLufs.toFixed(1)} vs ${master.wholeLufs.toFixed(1)} LUFS).` });
  const squash = master.plr - ref.plr;
  if (Math.abs(squash) >= 1.5) out.push({ size: Math.abs(squash) * 0.8, text: squash > 0
    ? `The reference is more squashed: its peaks sit ${ref.plr.toFixed(1)} dB above its average, yours ${master.plr.toFixed(1)} dB. It'll feel denser and flatter. Matching doesn't copy that: raise Intensity toward Heavy if you want it denser.`
    : `The reference is more dynamic: its peaks sit ${ref.plr.toFixed(1)} dB above its average, yours only ${master.plr.toFixed(1)} dB. It'll feel punchier.` });
  const wHi = ref.width[2] - master.width[2];
  if (Math.abs(wHi) >= 2) out.push({ size: Math.abs(wHi) * 0.6, text: `The reference is ${wHi > 0 ? "wider" : "narrower"} in the highs (cymbals, reverb, doubled guitars).` });
  const wLo = ref.width[0] - master.width[0];
  if (wLo >= 3) out.push({ size: wLo * 0.5, text: "The reference has more stereo spread in the bass." });
  return out.sort((a, b) => b.size - a.size).map((x) => x.text);
}

// Iteratively move Master toward the reference. `measure(settings)` renders
// the song's loud stretch with the given settings and returns its profile.
export function matchReference(ref, baseSettings, measure, passes = 3) {
  const refTone = [0, 0, 0, 0, 0];
  let glue = baseSettings.glue ?? 0.5;
  const settings = () => ({ ...baseSettings, glue, targetLufs: Math.max(-16, Math.min(-6, ref.wholeLufs)), refTone: refTone.slice() });
  let master = measure(settings());
  const before = master;
  for (let p = 0; p < passes; p++) {
    const gap = toneGap(ref, master);
    const squashGap = master.plr - ref.plr; // positive: reference is more squashed
    if (Math.max(...gap.map(Math.abs)) < 0.6 && Math.abs(squashGap) < 1) break;
    gap.forEach((d, i) => { refTone[i] = Math.max(-12, Math.min(12, refTone[i] + 0.9 * d)); });
    // squash isn't matched automatically: the glue can't copy a reference's
    // verse-to-chorus evening-out, and maxing it just over-compresses.
    // explain() still describes it, with a suggestion.
    master = measure(settings());
  }
  return { refTone, glue, targetLufs: settings().targetLufs, before, after: master };
}
