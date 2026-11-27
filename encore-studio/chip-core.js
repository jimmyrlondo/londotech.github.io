// ENCORE. Chip: the song model, the chip rules and the files, with no DOM and no Web Audio
// (Node tests import it, and so does the audio worklet). Chip behaviour follows the public
// hardware documentation (the NESdev wiki for the 2A03, Pan Docs for the DMG); the code is ours.

export const FRAME_HZ = 60; // sound drivers update the chip once per video frame
export const NOTE = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export const noteName = (m) => NOTE[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
export const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12);
export const hzToMidi = (f) => 69 + 12 * Math.log2(f / 440);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const num = (x, d) => (Number.isFinite(+x) ? +x : d);

export const CLOCK = { "2a03": 1789773, dmg: 4194304 };
export const NES_NOISE_PERIODS = [4, 8, 16, 32, 64, 96, 128, 160, 202, 254, 380, 508, 762, 1016, 2034, 4068];
export const DMC_RATES = [428, 380, 340, 320, 286, 254, 226, 214, 190, 160, 142, 128, 106, 84, 72, 54];
// pulse widths are stored in sixteenths of a cycle; the chips have these four
export const LEGAL_DUTIES = [2, 4, 8, 12];
export const dutyLabel = (d) => ({ 2: "12.5%", 4: "25%", 8: "50%", 12: "75%" })[d] || `${+(d * 6.25).toFixed(2)}%`;
// the 8-step duty sequences each chip actually plays
export const NES_DUTY8 = { 2: [0, 1, 0, 0, 0, 0, 0, 0], 4: [0, 1, 1, 0, 0, 0, 0, 0], 8: [0, 1, 1, 1, 1, 0, 0, 0], 12: [1, 0, 0, 1, 1, 1, 1, 1] };
export const DMG_DUTY8 = { 2: [0, 0, 0, 0, 0, 0, 0, 1], 4: [1, 0, 0, 0, 0, 0, 0, 1], 8: [1, 0, 0, 0, 0, 1, 1, 1], 12: [0, 1, 1, 1, 1, 1, 1, 0] };
export const TRI_SEQ = Array.from({ length: 32 }, (_, i) => (i < 16 ? 15 - i : i - 16));

/** a 16-step table for a pulse width: the chip's own sequence (each step doubled) or, in Free mode, any width */
export function dutyTable(chip, d16) {
  const t8 = (chip === "dmg" ? DMG_DUTY8 : NES_DUTY8)[d16];
  if (t8) return t8.flatMap((b) => [b, b]);
  const d = clamp(Math.round(d16), 1, 15);
  return Array.from({ length: 16 }, (_, i) => (i < d ? 1 : 0));
}

// DMG noise: 262144 / (r * 2^s) Hz with r = 0 read as 0.5 (shift 14 and 15 stop the channel).
// We offer 16 settings, each the nearest DMG setting to the 2A03's 16 noise rates.
export const DMG_NOISE = (() => {
  const cands = [];
  for (let r = 0; r < 8; r++) for (let s = 0; s < 14; s++) cands.push({ r, s, cyc: 16 * (r || 0.5) * 2 ** s });
  return NES_NOISE_PERIODS.map((p) => {
    const target = CLOCK["2a03"] / p;
    let best = cands[0];
    for (const c of cands) if (Math.abs(Math.log(CLOCK.dmg / c.cyc / target)) < Math.abs(Math.log(CLOCK.dmg / best.cyc / target))) best = c;
    return best;
  });
})();

export const KIT = ["Kick", "Snare", "Low tom", "High tom", "Clap", "Hat", "Bass hit", "Zap"];

export const CHIPS = {
  "2a03": {
    id: "2a03", name: "2A03", blurb: "8-bit console style: two pulses, a triangle, noise and 1-bit samples",
    channels: [{ kind: "pulse", name: "Pulse 1" }, { kind: "pulse", name: "Pulse 2" }, { kind: "triangle", name: "Triangle" }, { kind: "noise", name: "Noise" }, { kind: "dpcm", name: "Samples" }],
    extraKinds: ["pulse", "triangle", "noise"], pan: "mono",
  },
  dmg: {
    id: "dmg", name: "DMG", blurb: "8-bit handheld style: two pulses, a 4-bit wave channel and noise, in stereo",
    channels: [{ kind: "pulse", name: "Pulse 1" }, { kind: "pulse", name: "Pulse 2" }, { kind: "wave", name: "Wave" }, { kind: "noise", name: "Noise" }],
    extraKinds: ["pulse", "wave", "noise"], pan: "hard",
  },
};
export const KIND_NAME = { pulse: "pulse", triangle: "triangle", noise: "noise", dpcm: "sample", wave: "wave" };
export const isMelodic = (kind) => kind === "pulse" || kind === "triangle" || kind === "wave";

// ---- pitch: what register value the chip uses for a frequency, and how long each waveform step lasts
const REG = {
  "2a03:pulse": { lo: 8, hi: 2047, reg: (f) => Math.round(CLOCK["2a03"] / (16 * f) - 1), hz: (r) => CLOCK["2a03"] / (16 * (r + 1)) },
  "2a03:triangle": { lo: 2, hi: 2047, reg: (f) => Math.round(CLOCK["2a03"] / (32 * f) - 1), hz: (r) => CLOCK["2a03"] / (32 * (r + 1)) },
  "dmg:pulse": { lo: 0, hi: 2047, reg: (f) => Math.round(2048 - 131072 / f), hz: (r) => 131072 / (2048 - r) },
  "dmg:wave": { lo: 0, hi: 2047, reg: (f) => Math.round(2048 - 65536 / f), hz: (r) => 65536 / (2048 - r) },
};
const STEPS = { pulse: 16, triangle: 32, wave: 32 };
export const regInfo = (chip, kind) => REG[chip + ":" + kind] || null;

/**
 * Clock cycles per waveform step for a note. Chip mode rounds to the chip's register (so high
 * notes go slightly out of tune, as on the hardware) and clamps to its range; Free mode is exact.
 * Returns { cyc, reg, hz, ok }; ok is false when the chip couldn't play it (a 2A03 pulse under
 * register 8 is silenced by the hardware).
 */
export function stepCycles(chip, kind, hz, free = false) {
  const R = REG[chip + ":" + kind], steps = STEPS[kind];
  if (!R || !(hz > 0)) return { cyc: 0, reg: 0, hz: 0, ok: false };
  if (free) return { cyc: CLOCK[chip] / (steps * hz), reg: R.reg(hz), hz, ok: true };
  const raw = R.reg(hz), reg = clamp(raw, R.lo, R.hi);
  const ok = raw >= R.lo && raw <= R.hi;
  const realHz = R.hz(reg);
  return { cyc: CLOCK[chip] / (steps * realHz), reg, hz: realHz, ok: ok || !(chip === "2a03" && kind === "pulse" && raw < R.lo) };
}
/** the lowest and highest MIDI notes the chip channel can play */
export function noteRange(chip, kind) {
  const R = REG[chip + ":" + kind];
  if (!R) return [0, 15];
  let lo = 127, hi = 0;
  for (let m = 0; m < 128; m++) { const r = R.reg(midiToHz(m)); if (r >= R.lo && r <= R.hi) { lo = Math.min(lo, m); hi = Math.max(hi, m); } }
  return [lo, hi];
}
/** how far off the chip's nearest register is, in cents */
export function centsOff(chip, kind, midi) {
  const R = REG[chip + ":" + kind];
  if (!R) return 0;
  return 1200 * Math.log2(R.hz(clamp(R.reg(midiToHz(midi)), R.lo, R.hi)) / midiToHz(midi));
}
export function noiseCycles(chip, idx) {
  const i = clamp(Math.round(idx), 0, 15); // row 0 is the lowest rumble, 15 the brightest hiss
  return chip === "dmg" ? DMG_NOISE[15 - i].cyc : NES_NOISE_PERIODS[15 - i];
}
export function rowsFor(chip, kind) {
  if (kind === "noise") return Array.from({ length: 16 }, (_, i) => ({ p: i, label: `Noise ${i + 1}` }));
  if (kind === "dpcm") return KIT.map((label, p) => ({ p, label }));
  const out = [];
  for (let m = 24; m <= 107; m++) out.push({ p: m, label: noteName(m) });
  return out;
}

// ---- effects and envelopes (all step once per frame, like a real sound driver)
export const ARPS = {
  none: { name: "None", o: [0] }, maj: { name: "Major", o: [0, 4, 7] }, min: { name: "Minor", o: [0, 3, 7] },
  maj7: { name: "Major 7", o: [0, 4, 7, 11] }, min7: { name: "Minor 7", o: [0, 3, 7, 10] }, sus4: { name: "Sus4", o: [0, 5, 7] },
  dim: { name: "Diminished", o: [0, 3, 6] }, pow: { name: "Power (5th)", o: [0, 7] }, oct: { name: "Octave", o: [0, 12] }, oct2: { name: "Two octaves", o: [0, 12, 24] },
};
export const VIB_DEPTH = [0, 0.12, 0.25, 0.5, 1.0]; // semitones
export const VIB_RATE = [0, 4, 6, 8, 12]; // Hz
export const SWEEPS = { none: null, up: { d: [2, 4, 8, 12] }, down: { d: [12, 8, 4, 2] }, cycle: { d: [2, 4, 8, 12, 8, 4], loop: true } };
const ramp = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => Math.round(a + ((b - a) * i) / n));
export const ENVS = {
  flat: { name: "Flat", m: [15], hw: { dir: 0, pace: 0 } },
  pluck: { name: "Pluck", m: [15, 13, 11, 10, 9, 8, 8, 7, 7, 7, 6], hw: { dir: -1, pace: 2 } },
  decay: { name: "Decay", m: ramp(15, 0, 45), hw: { dir: -1, pace: 3 } },
  fade: { name: "Long fade", m: ramp(15, 0, 110), hw: { dir: -1, pace: 7 } },
  swell: { name: "Swell", m: ramp(2, 15, 24), hw: { dir: 1, pace: 2, start: 2 } },
  staccato: { name: "Staccato", m: [15, 15, 12, 8, 4, 0], hw: { dir: -1, pace: 1 } },
  tremolo: { name: "Tremolo", m: [15, 15, 14, 12, 10, 9, 10, 12, 14], loop: 1, hw: null },
  echo: { name: "Echo", m: [15, 15, 15, 15, 15, 15, 0, 0, 0, 7, 7, 7, 7, 7, 0, 0, 0, 3, 3, 3, 3, 0], hw: null },
};
export const envValue = (env, t) => {
  const e = ENVS[env] || ENVS.flat, m = e.m;
  if (t < m.length) return m[t];
  if (e.loop != null) return m[e.loop + ((t - e.loop) % (m.length - e.loop))];
  return m[m.length - 1];
};
export const DEFAULT_FX = { arp: "none", arpSpeed: 1, vib: 0, vibSpeed: 2, vibDelay: 6, slide: 0, glide: 0, env: "inst", sweep: "none", sweepSpeed: 4, rate: 15 };
export const FX_KEYS = Object.keys(DEFAULT_FX);

/**
 * What a sound driver writes to the chip on frame t of a note (t frames after it started;
 * rel = frames since release, or -1). Returns { semi, vol, duty, short } with vol 0..15
 * (whole steps in Chip mode, smooth in Free mode).
 */
export function frameState(chip, free, kind, ev, t, rel = -1) {
  const fx = ev.fx, inst = ev.inst;
  let semi = ev.p;
  const arp = ARPS[fx.arp];
  if (arp && arp.o.length > 1) semi += arp.o[Math.floor(t / Math.max(1, fx.arpSpeed)) % arp.o.length];
  if (fx.glide > 0 && ev.prevP != null) semi += (ev.prevP - ev.p) * Math.max(0, 1 - t / fx.glide);
  if (fx.slide) semi += fx.slide * Math.min(1, t / Math.max(1, ev.off - ev.on));
  if (fx.vib > 0 && isMelodic(kind) && t >= fx.vibDelay) semi += VIB_DEPTH[fx.vib] * Math.sin((2 * Math.PI * VIB_RATE[fx.vibSpeed || 2] * (t - fx.vibDelay)) / FRAME_HZ);
  if (!isMelodic(kind)) semi = Math.round(semi);
  const env = fx.env && fx.env !== "inst" ? fx.env : inst.env;
  const m = envValue(env, t);
  let vol;
  if (free) vol = (m * ev.v) / 15;
  else { vol = Math.round((m * ev.v) / 15); if (m > 0 && ev.v > 0 && vol === 0) vol = 1; }
  if (rel >= 0) {
    const R = inst.release || 0;
    const k = R > 0 && !(kind === "triangle" && !free) ? Math.max(0, 1 - rel / R) : 0;
    vol = free ? vol * k : Math.round(vol * k);
  }
  if (kind === "triangle" && !free) vol = vol > 0 ? 15 : 0; // no volume control: on or off
  let duty = inst.duty || 8;
  const sw = SWEEPS[fx.sweep];
  if (sw && kind === "pulse") {
    const i = Math.floor(t / Math.max(1, fx.sweepSpeed));
    duty = sw.loop ? sw.d[i % sw.d.length] : sw.d[Math.min(i, sw.d.length - 1)];
  }
  return { semi, vol, duty, short: !!inst.short, env };
}
/** the DMG's hardware envelope for a note: one straight ramp, up or down, ticking at 64 Hz */
export function hwEnvFor(env, v) {
  const h = (ENVS[env] || ENVS.flat).hw || ENVS.decay.hw;
  return { vol: h.start ?? clamp(Math.round(v), 0, 15), dir: h.dir, pace: h.pace, cnt: 0 };
}
export const usesHwEnv = (chip, free, kind) => chip === "dmg" && !free && (kind === "pulse" || kind === "noise");
/** DMG wave channel output level (as a right shift: 0 = 100%, 1 = 50%, 2 = 25%, 4 = off) */
export const waveShift = (vol) => (vol >= 12 ? 0 : vol >= 6 ? 1 : vol >= 1 ? 2 : 4);

// ---- instruments
export const WAVES = {
  triangle: TRI_SEQ.slice(),
  sine: Array.from({ length: 32 }, (_, i) => Math.round(7.5 + 7.5 * Math.sin((2 * Math.PI * i) / 32))),
  saw: Array.from({ length: 32 }, (_, i) => Math.floor(i / 2)),
  square: Array.from({ length: 32 }, (_, i) => (i < 16 ? 15 : 0)),
  bass: Array.from({ length: 32 }, (_, i) => Math.round(15 * Math.abs(Math.sin((Math.PI * i) / 32)))),
  organ: Array.from({ length: 32 }, (_, i) => Math.round(7.5 + 4.5 * Math.sin((2 * Math.PI * i) / 32) + 3 * Math.sin((4 * Math.PI * i) / 32))),
};
let instSeq = 0;
export const instId = () => "i" + Date.now().toString(36) + (instSeq++).toString(36);
export function makeInstrument(o) {
  return { id: o.id || instId(), name: o.name || "Instrument", kind: o.kind || "pulse", duty: o.duty ?? 8, env: o.env || "flat", release: o.release ?? 0,
    short: !!o.short, wave: (o.wave || WAVES.triangle).slice(), fx: { ...(o.fx || {}) } };
}
export function defaultInstruments(chip) {
  const list = [
    { id: "lead", name: "Lead 25%", kind: "pulse", duty: 4, env: "pluck", release: 3, fx: { vib: 1, vibSpeed: 2 } },
    { id: "thin", name: "Thin lead 12.5%", kind: "pulse", duty: 2, env: "decay", fx: {} },
    { id: "square", name: "Square 50%", kind: "pulse", duty: 8, env: "flat", fx: {} },
    { id: "pad", name: "Soft pad 75%", kind: "pulse", duty: 12, env: "swell", release: 8, fx: {} },
    { id: "chord", name: "Chord arp", kind: "pulse", duty: 2, env: "flat", fx: { arp: "maj" } },
    { id: "hat", name: "Hi-hat", kind: "noise", env: "staccato", fx: {} },
    { id: "snare", name: "Snare", kind: "noise", env: "pluck", release: 2, fx: {} },
    { id: "metal", name: "Metal tick", kind: "noise", env: "staccato", short: true, fx: {} },
  ];
  if (chip === "2a03") list.push(
    { id: "bass", name: "Triangle bass", kind: "triangle", env: "flat", fx: {} },
    { id: "kick", name: "Triangle kick", kind: "triangle", env: "staccato", fx: { slide: -24 } },
    { id: "drums", name: "Sample kit", kind: "dpcm", env: "flat", fx: {} });
  else list.push(
    { id: "wbass", name: "Wave bass", kind: "wave", env: "flat", wave: WAVES.bass, fx: {} },
    { id: "worgan", name: "Wave organ", kind: "wave", env: "flat", wave: WAVES.organ, fx: { vib: 1 } },
    { id: "wsaw", name: "Wave saw", kind: "wave", env: "flat", wave: WAVES.saw, fx: {} });
  return list.map(makeInstrument);
}
export const instFor = (proj, kind, id) => proj.instruments.find((i) => i.id === id && i.kind === kind) || proj.instruments.find((i) => i.kind === kind) || makeInstrument({ kind });

// ---- projects
export function newProject(chip = "2a03", name = "Untitled song") {
  const c = CHIPS[chip] ? chip : "2a03";
  return { v: 1, name, chip: c, free: false, bpm: 150, spb: 4, patLen: 32, filter: true, loop: true, loopRow: 0,
    channels: CHIPS[c].channels.map((ch) => ({ kind: ch.kind, name: ch.name, pan: 0 })),
    instruments: defaultInstruments(c), patterns: CHIPS[c].channels.map(() => [{ notes: [] }]), order: [CHIPS[c].channels.map(() => 0)] };
}
export const stepSeconds = (proj) => 60 / proj.bpm / proj.spb;
export const songSteps = (proj) => proj.order.length * proj.patLen;
export const framesPerStep = (bpm, spb = 4) => (FRAME_HZ * 60) / (bpm * spb);
/** tempos where every step is a whole number of frames (no groove jitter on the chip) */
export const frameExactTempos = (spb = 4) => [3, 4, 5, 6, 7, 8, 9, 10, 12].map((f) => ({ frames: f, bpm: +((FRAME_HZ * 60) / (f * spb)).toFixed(2) }));
export const patternAt = (proj, row, ci) => { const i = proj.order[row]?.[ci]; return i == null || i < 0 ? null : proj.patterns[ci][i] || null; };

/** sort a pattern's notes and cut overlaps so the channel plays one note at a time */
export function monoNotes(notes, patLen) {
  const out = notes.filter((n) => n.l > 0 && n.s < patLen && n.s >= 0).sort((a, b) => a.s - b.s || b.l - a.l);
  const res = [];
  for (const n of out) {
    const prev = res[res.length - 1];
    if (prev && prev.s === n.s) continue;
    if (prev && prev.s + prev.l > n.s) prev.l = n.s - prev.s;
    res.push({ ...n, l: Math.min(n.l, patLen - n.s) });
  }
  return res;
}
export const overlaps = (notes) => { const s = [...notes].sort((a, b) => a.s - b.s); for (let i = 1; i < s.length; i++) if (s[i - 1].s + s[i - 1].l > s[i].s) return true; return false; };

/**
 * The song as per-channel note events in frames from the start. In Chip mode notes start on a
 * frame, like a real driver (tempos that aren't frame-exact get the chip's natural groove).
 */
export function compileSong(proj) {
  const secs = stepSeconds(proj), L = proj.patLen;
  const tickOf = (s) => Math.round(s * secs * FRAME_HZ);
  const channels = proj.channels.map((ch, ci) => {
    const events = [];
    proj.order.forEach((row, r) => {
      const pat = patternAt(proj, r, ci);
      if (!pat) return;
      for (const n of monoNotes(pat.notes, L)) {
        const inst = instFor(proj, ch.kind, n.i);
        const s = r * L + n.s;
        events.push({ on: tickOf(s), off: Math.max(tickOf(s) + 1, tickOf(s + n.l)), p: n.p, v: n.v ?? 12, inst, fx: { ...DEFAULT_FX, ...inst.fx, ...(n.fx || {}) }, s, e: s + n.l });
      }
    });
    events.sort((a, b) => a.on - b.on);
    for (let i = 0; i < events.length; i++) {
      if (i + 1 < events.length && events[i].off > events[i + 1].on) events[i].off = Math.max(events[i].on + 1, events[i + 1].on);
      events[i].prevP = i > 0 && events[i - 1].off >= events[i].on - 1 ? events[i - 1].p : null;
    }
    return { kind: ch.kind, name: ch.name, pan: panFor(proj, ch.pan), events };
  });
  return { chip: proj.chip, free: !!proj.free, filter: proj.filter !== false, channels, endTick: tickOf(songSteps(proj)), loopTick: tickOf((proj.loopRow || 0) * L), tickOf, stepOfTick: (t) => t / (secs * FRAME_HZ) };
}
export function panFor(proj, pan) {
  const c = CHIPS[proj.chip];
  if (proj.free) return clamp(num(pan, 0), -1, 1);
  if (c.pan === "mono") return 0;
  return pan < -0.33 ? -1 : pan > 0.33 ? 1 : 0;
}

// ---- Chip mode: the hardware limits, in plain words
export function limitText(code, proj, extra = {}) {
  const c = CHIPS[proj.chip];
  switch (code) {
    case "channels": return `The ${c.name} has exactly ${c.channels.length} channels (${c.channels.map((x) => x.name).join(", ")}). Free mode lets you add more.`;
    case "overlap": return "Each channel plays one note at a time, on the real chip too. For a chord, try the Arpeggio effect or put the other notes on another channel.";
    case "duty": return "Pulse channels on this chip have four widths: 12.5%, 25%, 50% and 75%. Free mode allows any width.";
    case "range": return `The ${KIND_NAME[extra.kind]} channel on this chip plays from ${noteName(extra.lo)} to ${noteName(extra.hi)}. Notes outside that were moved by an octave to fit.`;
    case "triVol": return "The triangle channel has no volume control on this chip. It's either on or off, so it plays at full volume. Free mode adds volume.";
    case "waveVol": return "The wave channel has four volume levels: off, 25%, 50% and 100%. Snapped to the nearest one.";
    case "dmgEnv": return "On this chip the volume envelope only ramps one way (up or down). Tremolo and echo need Free mode, so this uses a decay.";
    case "mono": return "This chip has one mono output, so panning needs Free mode.";
    case "pan3": return "This chip pans each channel hard left, center or hard right. Free mode allows anything in between.";
    case "vol": return "Volume has 16 steps (0 to 15) on this chip.";
    case "wave4": return "The wave channel holds 32 steps of 4-bit samples (0 to 15).";
    default: return "";
  }
}
const snapDuty = (d) => LEGAL_DUTIES.reduce((a, b) => (Math.abs(b - d) < Math.abs(a - d) ? b : a), 8);
const snapWaveVol = (v) => (v <= 0 ? 0 : [4, 8, 15].reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a)));

/** make one note legal on the chip; returns { note, codes } (codes say what changed) */
export function legalizeNote(proj, ci, note) {
  const kind = proj.channels[ci]?.kind, n = { ...note, fx: { ...(note.fx || {}) } }, codes = [];
  if (proj.free || !kind) return { note: n, codes };
  if (isMelodic(kind)) {
    const [lo, hi] = noteRange(proj.chip, kind);
    let moved = false;
    while (n.p < lo) { n.p += 12; moved = true; }
    while (n.p > hi) { n.p -= 12; moved = true; }
    if (moved) codes.push("range");
  } else n.p = clamp(Math.round(n.p), 0, kind === "dpcm" ? KIT.length - 1 : 15);
  const v = clamp(Math.round(n.v ?? 12), 0, 15);
  if (v !== n.v && n.v != null) codes.push("vol");
  n.v = v;
  if (kind === "triangle" && n.v !== 15) { n.v = 15; codes.push("triVol"); }
  if (kind === "wave" && proj.chip === "dmg") { const w = snapWaveVol(n.v); if (w !== n.v) { n.v = w; codes.push("waveVol"); } }
  if (proj.chip === "dmg" && (kind === "pulse" || kind === "noise") && n.fx.env && ENVS[n.fx.env] && !ENVS[n.fx.env].hw) { n.fx.env = "decay"; codes.push("dmgEnv"); }
  return { note: n, codes };
}
export function legalizeInstrument(proj, inst) {
  const i = { ...inst, fx: { ...inst.fx }, wave: inst.wave.slice() }, codes = [];
  if (proj.free) return { inst: i, codes };
  if (i.kind === "pulse" && !LEGAL_DUTIES.includes(i.duty)) { i.duty = snapDuty(i.duty); codes.push("duty"); }
  if (proj.chip === "dmg" && (i.kind === "pulse" || i.kind === "noise") && ENVS[i.env] && !ENVS[i.env].hw) { i.env = "decay"; codes.push("dmgEnv"); }
  if (i.fx.env && ENVS[i.fx.env] && !ENVS[i.fx.env].hw && proj.chip === "dmg" && (i.kind === "pulse" || i.kind === "noise")) { i.fx.env = "decay"; codes.push("dmgEnv"); }
  if (i.wave.some((x) => x !== Math.round(clamp(x, 0, 15)))) { i.wave = i.wave.map((x) => Math.round(clamp(x, 0, 15))); codes.push("wave4"); }
  return { inst: i, codes };
}
/** everything in the song a real chip couldn't do: [{ code, text, count }] */
export function checkProject(proj) {
  const counts = new Map(), extra = {};
  const add = (code, x) => { counts.set(code, (counts.get(code) || 0) + 1); if (x) extra[code] = x; };
  const c = CHIPS[proj.chip];
  if (proj.channels.length !== c.channels.length || proj.channels.some((ch, i) => ch.kind !== c.channels[i].kind)) add("channels");
  proj.channels.forEach((ch) => {
    const p = num(ch.pan, 0);
    if (c.pan === "mono" && p !== 0) add("mono");
    if (c.pan === "hard" && ![-1, 0, 1].includes(p)) add("pan3");
  });
  const strict = { ...proj, free: false };
  for (const inst of proj.instruments) for (const code of legalizeInstrument(strict, inst).codes) add(code);
  proj.channels.forEach((ch, ci) => {
    for (const pat of proj.patterns[ci] || []) {
      if (overlaps(pat.notes)) add("overlap");
      for (const n of pat.notes) for (const code of legalizeNote(strict, ci, n).codes) add(code, code === "range" ? { kind: ch.kind, lo: noteRange(proj.chip, ch.kind)[0], hi: noteRange(proj.chip, ch.kind)[1] } : null);
    }
  });
  return [...counts].map(([code, count]) => ({ code, count, text: limitText(code, proj, extra[code]) }));
}
/** make the whole song hardware-legal (used when switching back to Chip mode) */
export function fixProject(proj) {
  const p = structuredCloneSafe(proj), issues = checkProject(proj);
  p.free = false;
  const c = CHIPS[p.chip];
  // keep the chip's own channels, in order; drop the extras
  const keep = c.channels.map((cc, k) => { let idx = p.channels.findIndex((ch, i) => ch.kind === cc.kind && i >= k); if (idx < 0) idx = p.channels.findIndex((ch) => ch.kind === cc.kind); return idx; });
  p.channels = c.channels.map((cc, k) => ({ kind: cc.kind, name: cc.name, pan: keep[k] >= 0 ? panFor(p, proj.channels[keep[k]].pan) : 0 }));
  p.patterns = c.channels.map((cc, k) => (keep[k] >= 0 ? proj.patterns[keep[k]].map((pt) => ({ notes: pt.notes.map((n) => ({ ...n })) })) : [{ notes: [] }]));
  p.order = proj.order.map((row) => c.channels.map((cc, k) => (keep[k] >= 0 ? row[keep[k]] ?? -1 : 0)));
  p.instruments = p.instruments.map((i) => legalizeInstrument(p, i).inst);
  p.patterns.forEach((pats, ci) => pats.forEach((pt) => { pt.notes = monoNotes(pt.notes.map((n) => legalizeNote(p, ci, n).note), p.patLen); }));
  return { proj: p, issues };
}
function structuredCloneSafe(x) { return JSON.parse(JSON.stringify(x)); }

/** read a project from untrusted JSON: every field checked and clamped */
export function loadProject(obj) {
  if (!obj || typeof obj !== "object") throw new Error("This isn't an ENCORE. Chip song.");
  const chip = CHIPS[obj.chip] ? obj.chip : null;
  if (!chip) throw new Error("This song is for a chip this version doesn't know.");
  const p = newProject(chip, String(obj.name || "Untitled song").slice(0, 80));
  p.free = !!obj.free; p.filter = obj.filter !== false; p.loop = obj.loop !== false;
  p.bpm = clamp(num(obj.bpm, 150), 30, 400); p.spb = clamp(Math.round(num(obj.spb, 4)), 1, 8);
  p.patLen = [16, 32, 48, 64].includes(obj.patLen) ? obj.patLen : 32;
  const kinds = CHIPS[chip].extraKinds.concat(CHIPS[chip].channels.map((c) => c.kind));
  if (Array.isArray(obj.channels) && obj.channels.length) {
    p.channels = obj.channels.slice(0, 16).filter((c) => c && kinds.includes(c.kind)).map((c) => ({ kind: c.kind, name: String(c.name || KIND_NAME[c.kind]).slice(0, 24), pan: clamp(num(c.pan, 0), -1, 1) }));
    if (!p.channels.length) throw new Error("This song has no channels.");
  }
  if (Array.isArray(obj.instruments) && obj.instruments.length) {
    p.instruments = obj.instruments.slice(0, 64).filter((i) => i && typeof i === "object" && kinds.concat("dpcm").includes(i.kind)).map((i) => makeInstrument({
      id: String(i.id || instId()).slice(0, 40), name: String(i.name || "Instrument").slice(0, 40), kind: i.kind,
      duty: clamp(Math.round(num(i.duty, 8)), 1, 15), env: ENVS[i.env] ? i.env : "flat", release: clamp(Math.round(num(i.release, 0)), 0, 60), short: !!i.short,
      wave: Array.isArray(i.wave) && i.wave.length === 32 ? i.wave.map((x) => clamp(num(x, 0), 0, 15)) : WAVES.triangle, fx: cleanFx(i.fx),
    }));
  }
  const cleanNote = (n) => ({ s: clamp(Math.round(num(n.s, 0)), 0, 63), l: clamp(Math.round(num(n.l, 1)), 1, 64), p: clamp(Math.round(num(n.p, 60)), 0, 127), v: clamp(Math.round(num(n.v, 12)), 0, 15), i: String(n.i || "").slice(0, 40), ...(n.fx ? { fx: cleanFx(n.fx) } : {}) });
  p.patterns = p.channels.map((_, ci) => {
    const src = Array.isArray(obj.patterns?.[ci]) ? obj.patterns[ci].slice(0, 128) : [];
    const pats = src.map((pt) => ({ notes: Array.isArray(pt?.notes) ? pt.notes.slice(0, 1024).filter((n) => n && typeof n === "object").map(cleanNote) : [] }));
    return pats.length ? pats : [{ notes: [] }];
  });
  if (Array.isArray(obj.order) && obj.order.length) p.order = obj.order.slice(0, 256).map((row) => p.channels.map((_, ci) => { const v = Math.round(num(row?.[ci], -1)); return v >= 0 && v < p.patterns[ci].length ? v : -1; }));
  else p.order = [p.channels.map(() => 0)];
  p.loopRow = clamp(Math.round(num(obj.loopRow, 0)), 0, p.order.length - 1);
  return p;
}
export function cleanFx(fx) {
  const o = {};
  if (!fx || typeof fx !== "object") return o;
  if (ARPS[fx.arp]) o.arp = fx.arp;
  if (fx.arpSpeed != null) o.arpSpeed = clamp(Math.round(num(fx.arpSpeed, 1)), 1, 8);
  if (fx.vib != null) o.vib = clamp(Math.round(num(fx.vib, 0)), 0, 4);
  if (fx.vibSpeed != null) o.vibSpeed = clamp(Math.round(num(fx.vibSpeed, 2)), 1, 4);
  if (fx.vibDelay != null) o.vibDelay = clamp(Math.round(num(fx.vibDelay, 6)), 0, 60);
  if (fx.slide != null) o.slide = clamp(Math.round(num(fx.slide, 0)), -24, 24);
  if (fx.glide != null) o.glide = clamp(Math.round(num(fx.glide, 0)), 0, 30);
  if (fx.env === "inst" || ENVS[fx.env]) o.env = fx.env;
  if (SWEEPS[fx.sweep] !== undefined) o.sweep = fx.sweep;
  if (fx.sweepSpeed != null) o.sweepSpeed = clamp(Math.round(num(fx.sweepSpeed, 4)), 1, 16);
  if (fx.rate != null) o.rate = clamp(Math.round(num(fx.rate, 15)), 0, 15);
  return o;
}

/** add a channel (Free mode only) */
export function addChannel(proj, kind) {
  const n = proj.channels.filter((c) => c.kind === kind).length + 1;
  proj.channels.push({ kind, name: `${KIND_NAME[kind][0].toUpperCase() + KIND_NAME[kind].slice(1)} ${n}`, pan: 0 });
  proj.patterns.push([{ notes: [] }]);
  proj.order.forEach((row) => row.push(0));
}

// ---- files
/** 16-bit PCM WAV from Float32 channels */
export function writeWav(chans, sr) {
  const n = chans[0].length, ch = chans.length, data = n * ch * 2, b = new ArrayBuffer(44 + data), v = new DataView(b);
  const s = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  s(0, "RIFF"); v.setUint32(4, 36 + data, true); s(8, "WAVE"); s(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true); s(36, "data"); v.setUint32(40, data, true);
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { v.setInt16(o, Math.max(-32768, Math.min(32767, Math.round(chans[c][i] * 32767))), true); o += 2; }
  return new Uint8Array(b);
}
export function readWav(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let o = 12, fmt = null;
  while (o + 8 <= bytes.length) {
    const id = String.fromCharCode(...bytes.subarray(o, o + 4)), sz = v.getUint32(o + 4, true);
    if (id === "fmt ") fmt = { ch: v.getUint16(o + 10, true), sr: v.getUint32(o + 12, true), bits: v.getUint16(o + 22, true) };
    if (id === "data" && fmt) {
      const n = Math.floor(sz / (2 * fmt.ch)), chans = Array.from({ length: fmt.ch }, () => new Float32Array(n));
      for (let i = 0; i < n; i++) for (let c = 0; c < fmt.ch; c++) chans[c][i] = v.getInt16(o + 8 + (i * fmt.ch + c) * 2, true) / 32768;
      return { sr: fmt.sr, chans };
    }
    o += 8 + sz + (sz & 1);
  }
  return null;
}

const GM_PROGRAM = { pulse: 80, triangle: 38, wave: 81 };
const KIT_GM = [36, 38, 45, 50, 39, 42, 35, 81];
const noiseGM = (p) => (p >= 12 ? 42 : p >= 8 ? 38 : p >= 4 ? 46 : 49);
/** a type-1 standard MIDI file: one track per channel, noise and samples on the drum channel */
export function writeMidi(proj) {
  const TPQ = 96, per = TPQ / proj.spb, L = proj.patLen;
  const vlq = (n) => { const a = [n & 127]; while ((n >>= 7)) a.unshift((n & 127) | 128); return a; };
  const str = (t) => [...t].map((c) => c.charCodeAt(0) & 127);
  const chunk = (id, data) => [...str(id), (data.length >>> 24) & 255, (data.length >>> 16) & 255, (data.length >>> 8) & 255, data.length & 255, ...data];
  const tracks = [];
  const us = Math.round(60000000 / proj.bpm);
  tracks.push([0, 255, 3, ...vlq(str(proj.name).length), ...str(proj.name), 0, 255, 81, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255, 0, 255, 88, 4, 4, 2, 24, 8, 0, 255, 47, 0]);
  let mc = 0;
  proj.channels.forEach((ch, ci) => {
    const drum = ch.kind === "noise" || ch.kind === "dpcm";
    const midiCh = drum ? 9 : mc++ % 16 === 9 ? mc++ % 16 : (mc - 1) % 16;
    const evs = [];
    proj.order.forEach((row, r) => {
      const pat = patternAt(proj, r, ci);
      if (!pat) return;
      for (const n of monoNotes(pat.notes, L)) {
        const key = ch.kind === "noise" ? noiseGM(n.p) : ch.kind === "dpcm" ? KIT_GM[n.p] ?? 36 : clamp(n.p, 0, 127);
        const vel = clamp(Math.round(((n.v ?? 12) / 15) * 112) + 15, 1, 127);
        const t0 = (r * L + n.s) * per, t1 = (r * L + n.s + n.l) * per;
        evs.push([t0, 1, [0x90 | midiCh, key, vel]], [t1, 0, [0x80 | midiCh, key, 0]]);
      }
    });
    evs.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const d = [0, 255, 3, ...vlq(str(ch.name).length), ...str(ch.name)];
    if (!drum) d.push(0, 0xc0 | midiCh, GM_PROGRAM[ch.kind] ?? 80);
    let last = 0;
    for (const [t, , bytes] of evs) { d.push(...vlq(t - last), ...bytes); last = t; }
    d.push(0, 255, 47, 0);
    tracks.push(d);
  });
  const out = [...chunk("MThd", [0, 1, 0, tracks.length, (TPQ >> 8) & 255, TPQ & 255])];
  for (const t of tracks) out.push(...chunk("MTrk", t));
  return new Uint8Array(out);
}
/** a tiny MIDI reader, enough for the tests to check our own files */
export function readMidiNotes(bytes) {
  let o = 14; const notes = [];
  const ntr = (bytes[10] << 8) | bytes[11];
  for (let t = 0; t < ntr; t++) {
    const len = (bytes[o + 4] << 24) | (bytes[o + 5] << 16) | (bytes[o + 6] << 8) | bytes[o + 7];
    let p = o + 8; const end = p + len; let time = 0, run = 0; const on = new Map();
    while (p < end) {
      let d = 0, b; do { b = bytes[p++]; d = (d << 7) | (b & 127); } while (b & 128);
      time += d;
      let st = bytes[p];
      if (st & 128) p++; else st = run;
      if (st === 255) { const ty = bytes[p++]; let l = 0; do { b = bytes[p++]; l = (l << 7) | (b & 127); } while (b & 128); p += l; if (ty === 47) break; continue; }
      run = st;
      const hi = st & 0xf0;
      if (hi === 0x90 || hi === 0x80) { const k = bytes[p++], v = bytes[p++]; const key = (st & 15) * 128 + k; if (hi === 0x90 && v > 0) on.set(key, { t: time, v }); else if (on.has(key)) { const s = on.get(key); notes.push({ track: t, ch: st & 15, key: k, start: s.t, end: time, vel: s.v }); on.delete(key); } }
      else if (hi === 0xc0 || hi === 0xd0) p += 1; else p += 2;
    }
    o = end;
  }
  return notes;
}

// ---- demo songs (written here in a tiny melody shorthand: "C5 - E5 ." where - holds and . rests)
export function seq(text, base = {}) {
  const out = [];
  text.trim().split(/\s+/).forEach((tok, s) => {
    if (tok === "-") { if (out.length) out[out.length - 1].l++; return; }
    if (tok === ".") return;
    const m = /^([A-G]#?)(-?\d)$/.exec(tok);
    const p = m ? NOTE.indexOf(m[1]) + (+m[2] + 1) * 12 : +tok;
    out.push({ s, l: 1, p, v: base.v ?? 12, i: base.i || "", ...(base.fx ? { fx: { ...base.fx } } : {}) });
  });
  return out;
}
const withFx = (notes, step, fx) => { const n = notes.find((x) => x.s === step); if (n) n.fx = { ...(n.fx || {}), ...fx }; return notes; };
export function demoSong(id) {
  if (id === "cave") {
    const p = newProject("dmg", "Night Cave");
    p.bpm = 112.5; p.patLen = 32;
    p.channels[0].pan = 0; p.channels[1].pan = 1; p.channels[3].pan = -1;
    const lead = (t) => seq(t, { i: "square", v: 13, fx: { vib: 2, vibDelay: 10 } });
    p.patterns[0] = [
      { notes: lead("A4 - - - C5 - E5 - - - D5 - C5 - B4 - C5 - - - - - A4 - - - - - . . . .") },
      { notes: withFx(lead("F4 - - - A4 - C5 - - - B4 - A4 - G4 - E5 - - - - - - - D5 - - - B4 - - -"), 16, { vib: 3 }) },
    ];
    p.patterns[1] = [{ notes: [["A3", "min"], ["F3", "maj"], ["G3", "maj"], ["E3", "maj"]].flatMap(([r, a], k) => seq(r, { i: "chord", v: 8, fx: { arp: a, arpSpeed: 2 } }).map((n) => ({ ...n, s: k * 8, l: 8 }))) }];
    p.patterns[2] = [{ notes: seq("A2 - . A2 A3 . A2 . F2 - . F2 F3 . F2 . G2 - . G2 G3 . G2 . E2 - . E2 E3 . G#2 .", { i: "wbass", v: 15 }) }];
    p.patterns[3] = [{ notes: seq("15 . 15 . 9 . 15 . 15 . 15 . 9 . 15 15 15 . 15 . 9 . 15 . 15 . 15 . 9 . 9 9", { i: "hat", v: 10 }).map((n) => (n.p === 9 ? { ...n, i: "snare", v: 13 } : n)) }];
    p.order = [[0, 0, 0, 0], [1, 0, 0, 0]];
    return p;
  }
  const p = newProject("2a03", "Sunny Overworld");
  p.bpm = 150; p.patLen = 32;
  const lead = (t) => seq(t, { i: "lead", v: 13 });
  p.patterns[0] = [
    { notes: lead("E5 - G5 - C6 - - - B5 - A5 - G5 - - - A5 - - - E5 - - - C5 - D5 - E5 - - -") },
    { notes: withFx(lead("F5 - A5 - C6 - - - A5 - F5 - A5 - - - G5 - - - B5 - D6 - B5 - - - G5 - . ."), 28, { slide: -12 }) },
    { notes: withFx(lead("C6 - - - - - - - B5 - A5 - G5 - E5 - F5 - - - E5 - D5 - C5 - - - - - - -"), 0, { glide: 6, vib: 2 }) },
  ];
  const chords = (list) => list.flatMap(([r, a], k) => seq(r, { i: "chord", v: 7, fx: { arp: a } }).map((n) => ({ ...n, s: k * 16, l: 16 })));
  p.patterns[1] = [{ notes: chords([["C4", "maj"], ["A3", "min"]]) }, { notes: chords([["F3", "maj"], ["G3", "maj"]]) }, { notes: chords([["F3", "maj7"], ["G3", "sus4"]]) }];
  p.patterns[2] = [{ notes: seq("C3 . C4 . C3 . C4 . C3 . C4 . C3 . C4 . A2 . A3 . A2 . A3 . A2 . A3 . A2 . A3 .", { i: "bass", v: 15 }) },
    { notes: seq("F2 . F3 . F2 . F3 . F2 . F3 . F2 . F3 . G2 . G3 . G2 . G3 . G2 . G3 . G2 . G3 .", { i: "bass", v: 15 }) }];
  p.patterns[3] = [{ notes: seq("13 . 13 . 7 . 13 . 13 . 13 . 7 . 13 13 13 . 13 . 7 . 13 . 13 . 13 . 7 . 13 7", { i: "hat", v: 9 }).map((n) => (n.p === 7 ? { ...n, i: "snare", v: 12 } : n)) }];
  p.patterns[4] = [{ notes: seq("0 . . . . . . . 0 . 0 . . . . . 0 . . . . . . . 0 . 0 . . . 4 .", { i: "drums", v: 15 }) }];
  p.order = [[0, 0, 0, 0, 0], [1, 1, 1, 0, 0], [0, 0, 0, 0, 0], [2, 2, 1, 0, 0]];
  return p;
}
export const DEMOS = [{ id: "overworld", name: "Sunny Overworld (2A03)" }, { id: "cave", name: "Night Cave (DMG)" }];

/**
 * Move a song to the other chip. Channels map by kind (the triangle and the wave channel swap
 * places); the 2A03's sample channel has no home on the DMG and is left out. Returns { proj, dropped }.
 */
export function convertChip(proj, chip) {
  if (proj.chip === chip || !CHIPS[chip]) return { proj, dropped: [] };
  const swap = { triangle: "wave", wave: "triangle", pulse: "pulse", noise: "noise", dpcm: chip === "2a03" ? "dpcm" : null };
  const p = newProject(chip, proj.name);
  Object.assign(p, { bpm: proj.bpm, spb: proj.spb, patLen: proj.patLen, filter: proj.filter, loop: proj.loop, loopRow: proj.loopRow, free: proj.free });
  const base = CHIPS[chip].channels, used = new Set(), dropped = [];
  const map = proj.channels.map((ch) => {
    const k = swap[ch.kind];
    if (!k) { dropped.push(ch.name); return -1; }
    const bi = base.findIndex((b, i) => b.kind === k && !used.has(i));
    if (bi >= 0) { used.add(bi); return bi; }
    if (!proj.free) { dropped.push(ch.name); return -1; }
    return { extra: k, name: ch.name };
  });
  const chans = base.map((b) => ({ kind: b.kind, name: b.name, pan: 0 })), pats = base.map(() => [{ notes: [] }]), from = base.map(() => -1);
  map.forEach((m, oi) => {
    if (m === -1) return;
    let ni = m;
    if (typeof m === "object") { chans.push({ kind: m.extra, name: m.name, pan: 0 }); pats.push(null); from.push(oi); ni = chans.length - 1; }
    from[ni] = oi; chans[ni].pan = proj.channels[oi].pan || 0;
  });
  p.channels = chans;
  p.patterns = chans.map((c, ni) => (from[ni] >= 0 ? proj.patterns[from[ni]].map((pt) => ({ notes: pt.notes.map((n) => ({ ...n, fx: n.fx ? { ...n.fx } : undefined })) })) : pats[ni] || [{ notes: [] }]));
  p.order = proj.order.map((row) => chans.map((c, ni) => (from[ni] >= 0 ? row[from[ni]] ?? -1 : 0)));
  // keep the pulse and noise sounds, swap triangle and wave sounds, add the new chip's defaults for anything missing
  const rename = (i) => (i.kind === "triangle" ? i.name.replace(/Triangle/g, "Wave") : i.kind === "wave" ? i.name.replace(/Wave/g, "Triangle") : i.name);
  const keep = proj.instruments.filter((i) => swap[i.kind]).map((i) => makeInstrument({ ...i, name: rename(i), kind: swap[i.kind], wave: i.kind === "triangle" ? TRI_SEQ : i.wave }));
  const defs = defaultInstruments(chip).filter((d) => !keep.some((k) => k.id === d.id));
  p.instruments = keep.concat(defs);
  const seen = new Map();
  for (const i of p.instruments) { const k = i.kind + ":" + i.name, n = (seen.get(k) || 0) + 1; seen.set(k, n); if (n > 1) i.name += " " + n; }
  p.loopRow = Math.min(p.loopRow || 0, p.order.length - 1);
  if (!p.free) return { proj: fixProject(p).proj, dropped };
  return { proj: p, dropped };
}
