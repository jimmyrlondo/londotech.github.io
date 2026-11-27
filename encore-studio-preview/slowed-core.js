// ENCORE. Slowed + Reverb: the pure parts (no DOM, no Web Audio). Presets, our own generated reverb
// impulse responses, vinyl crackle, a demo song, export naming and tail trimming.

export const SPEED_MIN = 0.5, SPEED_MAX = 1.5;

export const DEFAULTS = Object.freeze({
  speed: 1, keepPitch: false, reverb: "off", mix: 0, length: 1, clean: true,
  underwater: 0, bass: 0, rotate: 0, crackle: 0,
});

export const PRESETS = [
  { id: "slowed", name: "Slowed + Reverb", s: { speed: 0.8, reverb: "hall", mix: 0.38, length: 1.1, underwater: 0.12, bass: 3 } },
  { id: "spedup", name: "Sped Up", s: { speed: 1.25, reverb: "room", mix: 0.08, bass: 1 } },
  { id: "nightcore", name: "Nightcore", s: { speed: 1.32, reverb: "room", mix: 0.12, bass: 2 } },
  { id: "daycore", name: "Daycore", s: { speed: 0.75, reverb: "hall", mix: 0.25, underwater: 0.08, bass: 2 } },
  { id: "8d", name: "8D (rotating)", s: { speed: 1, reverb: "hall", mix: 0.22, rotate: 0.12, bass: 1 } },
  { id: "underwater", name: "Underwater lo-fi", s: { speed: 0.85, reverb: "dreamy", mix: 0.35, underwater: 0.72, bass: 4, crackle: 0.35 } },
  { id: "dreamy", name: "Dreamy", s: { speed: 0.8, reverb: "dreamy", mix: 0.55, length: 1.2, underwater: 0.2, bass: 2 } },
  { id: "original", name: "Original", s: {} },
];

export function presetSettings(id) {
  const p = PRESETS.find((x) => x.id === id);
  return p ? { ...DEFAULTS, ...p.s } : null;
}

/** Which preset (if any) these settings are exactly. */
export function matchPreset(s) {
  for (const p of PRESETS) {
    const q = presetSettings(p.id);
    if (Object.keys(DEFAULTS).every((k) => (typeof q[k] === "number" ? Math.abs(q[k] - s[k]) < 1e-6 : q[k] === s[k]))) return p.id;
  }
  return null;
}

/** Clean up settings from storage or the page. */
export function sanitize(s = {}) {
  const n = (v, lo, hi, d) => (typeof v === "number" && isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
  return {
    speed: n(s.speed, SPEED_MIN, SPEED_MAX, 1),
    keepPitch: !!s.keepPitch,
    reverb: REVERBS[s.reverb] || s.reverb === "off" ? s.reverb : "off",
    mix: n(s.mix, 0, 1, 0), length: n(s.length, 0.5, 1.6, 1), clean: s.clean !== false,
    underwater: n(s.underwater, 0, 1, 0), bass: n(s.bass, 0, 9, 0), rotate: n(s.rotate, 0, 0.5, 0), crackle: n(s.crackle, 0, 1, 0),
  };
}

/** tempo and pitch for the stretch engine */
export const rates = (s) => (s.keepPitch ? { tempo: s.speed, pitch: 1 } : { tempo: s.speed, pitch: s.speed });
/** semitones the song moves in vinyl mode */
export const semitones = (s) => (s.keepPitch ? 0 : 12 * Math.log2(s.speed));
/** the "underwater" amount (0..1) as a low-pass cutoff in Hz (0 = off) */
export const lowpassHz = (u) => (u <= 0.001 ? 0 : Math.round(18000 * Math.pow(350 / 18000, u)));
/** mix 0..1 -> dry and wet gains: both full at the middle, like a DJ mixer */
export const mixGains = (m) => ({ dry: Math.min(1, 2 * (1 - m)), wet: Math.min(1, 2 * m) });

// ------------------------------------------------------------------ reverbs (our own impulse responses)
export const REVERBS = {
  room: { name: "Room", T: 0.8, pre: 0.006, damp: 0.45, att: 0.001, er: 0.5 },
  hall: { name: "Hall", T: 2.4, pre: 0.018, damp: 0.55, att: 0.004, er: 0.35 },
  cathedral: { name: "Cathedral", T: 5.0, pre: 0.035, damp: 0.5, att: 0.01, er: 0.25 },
  dreamy: { name: "Dreamy", T: 6.5, pre: 0.025, damp: 0.85, att: 0.12, er: 0.08 },
};

function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1; }

/**
 * A stereo impulse response: early reflections, then a dense tail where the highs die away faster
 * than the lows (like a real room). Energy normalised so the wet signal is about as loud as the dry.
 */
export function makeIR(type, fs, lengthScale = 1) {
  const p = REVERBS[type];
  if (!p) return null;
  const T = p.T * lengthScale, pre = Math.round(p.pre * fs);
  const n = pre + Math.ceil(T * 1.15 * fs);
  const out = [new Float32Array(n), new Float32Array(n)];
  const ln = Math.log(1000); // 60 dB
  const dl = Math.exp(-ln / (T * 1.15 * fs)), dm = Math.exp(-ln / (T * fs)), dh = Math.exp(-ln / (T * p.damp * fs));
  const a1 = Math.exp((-2 * Math.PI * 500) / fs), a2 = Math.exp((-2 * Math.PI * 4000) / fs);
  for (let c = 0; c < 2; c++) {
    const r = rng(1234 + c * 7919 + Math.round(T * 100)), h = out[c];
    let lo = 0, mid = 0, el = 1, em = 1, eh = 1;
    for (let i = 0; i < n - pre; i++) {
      const w = r();
      lo = (1 - a1) * w + a1 * lo; // below ~500 Hz
      mid = (1 - a2) * w + a2 * mid; // below ~4 kHz
      const band = lo * 3 * el + (mid - lo) * em + (w - mid) * 0.7 * eh;
      const swell = 1 - Math.exp(-i / (p.att * fs));
      h[pre + i] = band * swell;
      el *= dl; em *= dm; eh *= dh;
    }
    // early reflections: a few clear echoes off the walls, different in each ear
    const size = Math.min(1, T / 2.4);
    for (let k = 0; k < 10; k++) {
      const t = pre + Math.round((0.004 + (0.07 * size * (k + 0.5 + 0.4 * r())) / 10) * fs);
      if (t < n) h[t] += p.er * (0.8 - k * 0.06) * (r() > 0 ? 1 : -1) * 4;
    }
  }
  // normalise the energy
  let e = 0;
  for (const h of out) for (let i = 0; i < n; i++) e += h[i] * h[i];
  const g = Math.sqrt(2 / e) * 0.8;
  for (const h of out) for (let i = 0; i < n; i++) h[i] *= g;
  return out;
}

/** RT60 from Schroeder backward integration (T30 x 2), in seconds. */
export function measureRT60(h, fs) {
  const n = h.length, edc = new Float64Array(n);
  let acc = 0;
  for (let i = n - 1; i >= 0; i--) { acc += h[i] * h[i]; edc[i] = acc; }
  const db = (i) => 10 * Math.log10(edc[i] / edc[0] + 1e-30);
  let i5 = -1, i35 = -1;
  for (let i = 0; i < n; i++) { if (i5 < 0 && db(i) <= -5) i5 = i; if (db(i) <= -35) { i35 = i; break; } }
  if (i5 < 0 || i35 < 0) return NaN;
  return ((i35 - i5) / fs) * 2;
}

/** Vinyl crackle: soft pops and a little hiss, a few seconds that loop. */
export function makeCrackle(fs, sec = 7) {
  const n = Math.round(fs * sec), out = [new Float32Array(n), new Float32Array(n)];
  for (let c = 0; c < 2; c++) {
    const r = rng(99 + c * 31), h = out[c];
    let lp = 0;
    for (let i = 0; i < n; i++) { lp = 0.92 * lp + 0.08 * r(); h[i] = lp * 0.02; }
    const pops = Math.round(sec * 14);
    for (let k = 0; k < pops; k++) {
      const at = Math.floor(((r() + 1) / 2) * (n - 400)), big = r() > 0.85, amp = (big ? 0.5 : 0.12) * (0.5 + (r() + 1) / 4);
      const len = big ? 120 : 30, sg = r() > 0 ? 1 : -1;
      for (let i = 0; i < len; i++) h[at + i] += sg * amp * Math.exp(-i / (len / 5)) * (i % 2 ? -0.6 : 1);
    }
  }
  return out;
}

// ------------------------------------------------------------------ a demo song (for trying the tool)
/** About `sec` seconds of a simple synth groove at 96 BPM: drums, bass, chords, a little melody. */
export function makeDemoSong(fs = 48000, sec = 20) {
  const n = Math.round(fs * sec), L = new Float32Array(n), R = new Float32Array(n);
  const bpm = 96, beat = (60 / bpm) * fs, r = rng(5);
  const add = (start, len, fn, pan = 0) => {
    const gl = Math.cos(((pan + 1) * Math.PI) / 4), gr = Math.sin(((pan + 1) * Math.PI) / 4);
    for (let i = 0; i < len && start + i < n; i++) { const v = fn(i / fs, i); L[start + i] += v * gl; R[start + i] += v * gr; }
  };
  const chords = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]; // Am F C G
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const beats = Math.floor(n / beat);
  for (let b = 0; b < beats; b++) {
    const t0 = Math.round(b * beat), ch = chords[Math.floor(b / 4) % 4];
    if (b % 2 === 0) add(t0, Math.round(0.35 * fs), (t) => 0.75 * Math.sin(2 * Math.PI * (45 * t + 60 * (1 - Math.exp(-t * 30)) / 30)) * Math.exp(-t * 9));
    if (b % 2 === 1) add(t0, Math.round(0.2 * fs), (t) => 0.32 * r() * Math.exp(-t * 22) + 0.2 * Math.sin(2 * Math.PI * 190 * t) * Math.exp(-t * 30));
    for (const h of [0, 0.5]) add(t0 + Math.round(h * beat), Math.round(0.05 * fs), (t) => 0.08 * r() * Math.exp(-t * 90), 0.4);
    const bf = hz(ch[0] - 24);
    add(t0, Math.round(beat * 0.9), (t) => 0.3 * Math.tanh(2 * Math.sin(2 * Math.PI * bf * t)) * Math.min(1, t * 200) * Math.exp(-t * 2.5));
    if (b % 4 === 0) for (const m of ch) { const f = hz(m); add(t0, Math.round(beat * 4), (t) => 0.07 * (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(4 * Math.PI * f * 1.003 * t)) * Math.min(1, t * 8) * Math.exp(-t * 0.6), m % 2 ? -0.5 : 0.5); }
    const mel = [69, 72, 76, 74, 72, 69, 67, 64][b % 8];
    if (b % 8 !== 7) { const f = hz(mel); add(t0, Math.round(beat * 0.8), (t) => 0.12 * Math.sin(2 * Math.PI * f * t + 0.5 * Math.sin(2 * Math.PI * 5 * t)) * Math.min(1, t * 60) * Math.exp(-t * 3)); }
  }
  let pk = 0;
  for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]));
  const g = 0.89 / pk;
  for (let i = 0; i < n; i++) { L[i] *= g; R[i] *= g; }
  return [L, R];
}

// ------------------------------------------------------------------ export helpers
/** How the edit is called in a file name. */
export function editLabel(s) {
  const id = matchPreset(s);
  if (id && id !== "original") return PRESETS.find((p) => p.id === id).name.toLowerCase().replace(" (rotating)", "");
  const parts = [];
  if (Math.abs(s.speed - 1) > 0.005) parts.push(s.speed < 1 ? "slowed" : "sped up");
  if (s.reverb !== "off" && s.mix > 0) parts.push("reverb");
  if (s.rotate > 0) parts.push("8d");
  if (s.underwater > 0.3) parts.push("lo-fi");
  return parts.join(" + ") || "edit";
}

export function exportName(songName, s, ext) {
  const base = (songName || "song").replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[\\/:*?"<>|]+/g, "").trim().slice(0, 80) || "song";
  return `${base} (${editLabel(s)}).${ext}`;
}

/** Cut silence off the end (after `minLen`), leaving a 20 ms fade. */
export function trimTail(chans, fs, minLen, thresholdDb = -80) {
  const th = Math.pow(10, thresholdDb / 20), n = chans[0].length;
  let last = Math.min(n, minLen);
  for (let i = n - 1; i >= minLen; i--) { if (chans.some((c) => Math.abs(c[i]) > th)) { last = i + 1; break; } }
  const end = Math.min(n, last + Math.round(0.05 * fs)), fade = Math.min(end, Math.round(0.02 * fs));
  return chans.map((c) => {
    const o = c.slice(0, end);
    for (let i = 0; i < fade; i++) o[end - 1 - i] *= i / fade;
    return o;
  });
}

/** peak level in dBFS */
export function peakDb(chans) {
  let p = 0;
  for (const c of chans) for (let i = 0; i < c.length; i++) { const a = Math.abs(c[i]); if (a > p) p = a; }
  return 20 * Math.log10(p || 1e-12);
}
