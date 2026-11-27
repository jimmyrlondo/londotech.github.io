// ENCORE. Tabs: the music, with no page in it (test-tabs.mjs). Instruments and tunings
// (kalimba tines in their real left-to-right order, handpan ding and fields, tongue drum
// tongues), a tune model (notes with pitch, length in beats and a lyric), number and letter
// tabs as text, best-fit conversion between instruments, transposition, lyric placement,
// live-take quantizing, a plucked-note catcher for the mic, MusicXML/MIDI melody import
// (through compose-core.js) and a shareable file / link format.

export const TABS_VERSION = 1;
const mod = (n, m) => ((n % m) + m) % m;
const SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

// ---------- notes ----------
/** "C4" -> 60, "Bb3" -> 58, "F#5" -> 78; null when it isn't a note */
export function parseNote(s) {
  const m = /^\s*([A-Ga-g])([#b♯♭]?)(-?\d)\s*$/.exec(String(s ?? ""));
  if (!m) return null;
  const acc = m[2] === "#" || m[2] === "♯" ? 1 : m[2] === "b" || m[2] === "♭" ? -1 : 0;
  return (+m[3] + 1) * 12 + LETTER_PC[m[1].toUpperCase()] + acc;
}
/** 60 -> "C4"; flats: spell black keys as flats; spell: { pc: "C#" } overrides */
export function noteName(midi, flats = false, spell = null) {
  const pc = mod(midi, 12), oct = Math.floor(midi / 12) - 1;
  const name = spell?.[pc] || (flats ? FLAT : SHARP)[pc];
  // B# and Cb style overrides keep the octave of the sounding pitch's letter
  return name + oct;
}
export const pcName = (pc, flats = false, spell = null) => spell?.[mod(pc, 12)] || (flats ? FLAT : SHARP)[mod(pc, 12)];
export const midiToHz = (m) => 440 * 2 ** ((m - 69) / 12);
const parseList = (s) => (Array.isArray(s) ? s : String(s).trim().split(/[\s,]+/)).map((x) => (typeof x === "number" ? x : parseNote(x)));

// ---------- instruments and tunings ----------
// kalimba notes are in physical order, left to right as you hold it (tines away from you, longest in the middle).
// handpan: the ding first, then the fields low to high. drum: tongues low to high.
export const KINDS = { kalimba: "Kalimba", handpan: "Handpan", drum: "Tongue drum" };
export const TUNINGS = [
  { id: "k17", kind: "kalimba", notes: "D6 B5 G5 E5 C5 A4 F4 D4 C4 E4 G4 B4 D5 F5 A5 C6 E6", key: 0 },
  { id: "k21", kind: "kalimba", notes: "D6 B5 G5 E5 C5 A4 F4 D4 B3 G3 F3 A3 C4 E4 G4 B4 D5 F5 A5 C6 E6", key: 0 },
  { id: "k10", kind: "kalimba", notes: "E5 C5 A4 F4 D4 C4 E4 G4 B4 D5", key: 0 },
  { id: "k8", kind: "kalimba", notes: "C5 A4 F4 D4 C4 E4 G4 B4", key: 0 },
  { id: "hp-kurd9", kind: "handpan", scale: "Kurd", notes: "D3 A3 Bb3 C4 D4 E4 F4 G4 A4", key: 2, minor: true },
  { id: "hp-kurd10", kind: "handpan", scale: "Kurd", notes: "D3 A3 Bb3 C4 D4 E4 F4 G4 A4 C5", key: 2, minor: true },
  { id: "hp-celtic", kind: "handpan", scale: "Celtic minor", notes: "D3 A3 C4 D4 E4 F4 G4 A4 C5", key: 2, minor: true },
  { id: "hp-integral", kind: "handpan", scale: "Integral", notes: "D3 A3 Bb3 C4 D4 E4 F4 A4", key: 2, minor: true },
  { id: "hp-hijaz", kind: "handpan", scale: "Hijaz", notes: "D3 A3 Bb3 C#4 D4 E4 F4 G4 A4", key: 2, minor: true, spell: { 1: "C#" } },
  { id: "hp-pygmy", kind: "handpan", scale: "Pygmy", notes: "F3 G3 Ab3 C4 Eb4 F4 G4 Ab4 C5", key: 5, minor: true },
  { id: "hp-major", kind: "handpan", scale: "Major", notes: "C3 G3 A3 B3 C4 D4 E4 F4 G4", key: 0 },
  { id: "td8", kind: "drum", scale: "major", notes: "C4 D4 E4 F4 G4 A4 B4 C5", key: 0 },
  { id: "td8p", kind: "drum", scale: "pentatonic", notes: "C4 D4 E4 G4 A4 C5 D5 E5", key: 0 },
  { id: "td11", kind: "drum", scale: "major", notes: "A3 B3 C#4 D4 E4 F#4 G4 A4 B4 C#5 D5", key: 2 },
  { id: "td13", kind: "drum", scale: "major", notes: "G3 A3 B3 C4 D4 E4 F4 G4 A4 B4 C5 D5 E5", key: 0 },
  { id: "td15", kind: "drum", scale: "major", notes: "F#3 G3 A3 B3 C#4 D4 E4 F#4 G4 A4 B4 C#5 D5 E5 F#5", key: 2 },
];
const count = (t) => String(t.notes).trim().split(/\s+/).length;
/** A preset's name in a key: "17 keys in C", "D Kurd 9", "11 notes, D major" */
export function tuningName(t, keyName) {
  if (t.kind === "kalimba") return `${count(t)} keys in ${keyName}`;
  if (t.kind === "handpan") return `${keyName} ${t.scale} ${count(t)}`;
  return `${count(t)} notes, ${keyName} ${t.scale}`;
}
export const tuningsFor = (kind) => TUNINGS.filter((t) => t.kind === kind);
/** Keys an instrument can be pitched in: semitones from its preset (kalimbas and drums are sold in many keys; handpans by ding) */
export const SHIFTS = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6];
const FLAT_KEYS = new Set([5, 10, 3, 8, 1]); // F Bb Eb Ab Db
const MINOR_FLAT_KEYS = new Set([2, 7, 0, 5, 10, 3]); // D G C F Bb Eb minor

/**
 * A playable instrument from a reference { kind, tuning, shift, custom }:
 * { kind, tuning, shift, custom, name, label, notes (layout order), sorted (low to high), key (tonic pc),
 *   ref (the midi written "1" or the ding), flats, spell }
 */
export function makeInstrument(ref = {}) {
  const preset = TUNINGS.find((t) => t.id === ref.tuning) || TUNINGS.find((t) => t.kind === (ref.kind || "kalimba")) || TUNINGS[0];
  const shift = Math.max(-12, Math.min(12, Math.round(+ref.shift || 0)));
  const custom = Array.isArray(ref.custom) && ref.custom.length ? ref.custom.map(Number).filter((m) => Number.isFinite(m) && m >= 24 && m <= 108) : null;
  const base = custom || parseList(preset.notes);
  const notes = custom ? base.slice() : base.map((m) => m + shift);
  const key = mod((custom ? ref.key ?? preset.key : preset.key + shift), 12);
  const flats = preset.minor ? MINOR_FLAT_KEYS.has(key) : FLAT_KEYS.has(key);
  const spell = shift === 0 && !custom ? preset.spell || null : null;
  const sorted = [...notes].sort((a, b) => a - b);
  let ref1;
  if (preset.kind === "handpan") ref1 = notes[0];
  else ref1 = sorted.find((m) => mod(m, 12) === key) ?? sorted[0] - mod(sorted[0] - key, 12) + 12;
  const keyName = pcName(key, flats, spell);
  const name = custom ? `${KINDS[preset.kind]} (custom)` : tuningName(preset, keyName);
  return { kind: preset.kind, tuning: preset.id, shift: custom ? 0 : shift, custom, key, name, label: `${KINDS[preset.kind]}, ${name}`, notes, sorted, ref: ref1, flats, spell };
}
export const instRef = (inst) => ({ kind: inst.kind, tuning: inst.tuning, shift: inst.shift, ...(inst.custom ? { custom: inst.custom, key: inst.key } : {}) });
export const hasNote = (inst, midi) => inst.notes.includes(midi);
/** Parse a typed tuning ("D6 B5 G5 ...") into midi notes; throws with a plain message on a bad note */
export function parseTuning(text) {
  const parts = String(text).trim().split(/[\s,]+/).filter(Boolean);
  if (parts.length < 3) throw new Error("Type at least three notes, like C4 E4 G4.");
  if (parts.length > 40) throw new Error("That's more than 40 notes.");
  return parts.map((p) => { const m = parseNote(p); if (m === null || m < 24 || m > 108) throw new Error(`"${p}" isn't a note. Use a letter, an optional # or b, and an octave number, like F#4.`); return m; });
}

// ---------- tab tokens ----------
const DEG = { 0: "1", 1: "#1", 2: "2", 3: "b3", 4: "3", 5: "4", 6: "#4", 7: "5", 8: "#5", 9: "6", 10: "b7", 11: "7" };
/**
 * How one note is written in a number tab: { text, oct, missing }.
 * kalimba / drum: the scale degree of the instrument's key (1 = the lowest tonic), oct = octaves above (+) or below (-).
 * handpan: "D" for the ding, then 1, 2, 3 for the fields from low to high (oct 0).
 */
export function numberOf(inst, midi) {
  const missing = !inst.notes.includes(midi);
  if (inst.kind === "handpan") {
    if (midi === inst.notes[0]) return { text: "D", oct: 0, missing: false };
    const fields = inst.notes.slice(1).sort((a, b) => a - b), i = fields.indexOf(midi);
    if (i >= 0) return { text: String(i + 1), oct: 0, missing: false };
    return { text: noteName(midi, inst.flats, inst.spell), oct: 0, missing: true };
  }
  const rel = midi - inst.ref;
  return { text: DEG[mod(rel, 12)], oct: Math.floor(rel / 12), missing };
}
export const letterOf = (inst, midi) => noteName(midi, inst.flats, inst.spell);
/** A number token as plain text: ° for each octave up, a comma for each octave down (the legend says so) */
export const numberText = (n) => n.text + (n.oct > 0 ? "°".repeat(n.oct) : n.oct < 0 ? ",".repeat(-n.oct) : "") + (n.missing ? "?" : "");
/** One note (or chord, or rest) as a plain-text token: view "number" | "letter" */
export function tokenText(inst, note, view = "number") {
  if (!note.m.length) return "0";
  const ms = [...note.m].sort((a, b) => a - b);
  const one = (m) => (view === "letter" ? letterOf(inst, m) : numberText(numberOf(inst, m)));
  if (ms.length === 1) return one(ms[0]);
  const parts = ms.map(one);
  const joiner = view === "letter" || inst.kind === "handpan" ? "+" : "";
  return "(" + parts.join(joiner) + ")";
}
/** Rhythm marks for a length in beats (quarter = 1): { holds, under, dot } (holds: extra "-" beats, under: underline count) */
export function durMarks(d) {
  d = Math.max(0.125, +d || 1);
  if (d >= 1) {
    const whole = Math.floor(d + 1e-6), frac = d - whole;
    return { holds: whole - 1, under: 0, dot: frac >= 0.375 && frac < 0.875, extraHold: frac >= 0.875 ? 1 : 0 };
  }
  let under = 0, x = d;
  while (x < 0.99 && under < 3) { x *= 2; under++; }
  return { holds: 0, under, dot: x > 1.25 };
}
const markText = (d) => { const k = durMarks(d); return "_".repeat(k.under) + (k.dot ? "." : "") + " -".repeat(k.holds + (k.extraHold || 0)); };
export const DURS = [
  { d: 4, name: "Whole", key: "z" }, { d: 2, name: "Half", key: "x" }, { d: 1, name: "Quarter", key: "c" },
  { d: 0.5, name: "Eighth", key: "v" }, { d: 0.25, name: "Sixteenth", key: "b" },
];

// ---------- the tune ----------
/** A note: { m: [midi...] (empty = rest), d: beats, l: lyric, h: true if the lyric hyphenates to the next } */
export const newNote = (m = [], d = 1, extra = {}) => ({ m: (Array.isArray(m) ? m : [m]).filter((x) => Number.isFinite(x)), d, ...extra });
export function newTune(o = {}) {
  return { v: TABS_VERSION, title: o.title ?? "Untitled tune", by: o.by ?? "", tempo: o.tempo ?? 90, beats: o.beats ?? 4, inst: o.inst ?? { kind: "kalimba", tuning: "k17", shift: 0 }, notes: o.notes ?? [] };
}
/** A tune checked and tidied (from a file, a link or storage); throws if it isn't one */
export function cleanTune(t) {
  if (!t || typeof t !== "object" || !Array.isArray(t.notes)) throw new Error("That isn't an ENCORE. Tabs file.");
  const inst = t.inst && typeof t.inst === "object" ? t.inst : {};
  const tune = newTune({
    title: String(t.title ?? "Untitled tune").slice(0, 120), by: String(t.by ?? "").slice(0, 120),
    tempo: Math.max(30, Math.min(260, Math.round(+t.tempo || 90))), beats: [2, 3, 4, 6].includes(+t.beats) ? +t.beats : 4,
    inst: instRef(makeInstrument(inst)),
    notes: t.notes.slice(0, 4000).map((n) => {
      const m = (Array.isArray(n?.m) ? n.m : []).map(Number).filter((x) => Number.isFinite(x) && x >= 12 && x <= 120).slice(0, 8);
      const out = newNote(m, Math.max(0.125, Math.min(16, +n?.d || 1)));
      if (n?.l) out.l = String(n.l).slice(0, 40);
      if (n?.h) out.h = true;
      return out;
    }),
  });
  return tune;
}
export const tuneBeats = (tune) => tune.notes.reduce((a, n) => a + n.d, 0);
export const tunePitches = (tune) => tune.notes.flatMap((n) => n.m);
export function transposeTune(tune, semis) {
  return { ...tune, notes: tune.notes.map((n) => ({ ...n, m: n.m.map((x) => x + semis) })) };
}

/** Bars: [{ start (note index), end (exclusive), beats }] breaking after the note that reaches each bar line */
export function barsOf(tune) {
  const out = []; let start = 0, acc = 0;
  tune.notes.forEach((n, i) => {
    acc += n.d;
    if (acc >= tune.beats - 1e-6) { out.push({ start, end: i + 1, beats: acc }); start = i + 1; acc = Math.max(0, acc - tune.beats) % tune.beats; if (acc < 1e-6) acc = 0; }
  });
  if (start < tune.notes.length) out.push({ start, end: tune.notes.length, beats: acc });
  return out;
}
/**
 * The tune as plain text: a header, a legend, then lines of bars ("| 1 1 5 5 | 6 6 5 - |") with the lyric line under each.
 * opts: { view: "number" | "letter" | "both", barsPerLine (4), header (true), legend (true) }
 */
export function tabText(tune, inst = makeInstrument(tune.inst), opts = {}) {
  const view = opts.view || "number", per = opts.barsPerLine || 4, out = [];
  if (opts.header !== false) {
    out.push(tune.title || "Untitled tune");
    if (tune.by) out.push(tune.by);
    out.push(`${inst.label} · ${tune.tempo} BPM · ${tune.beats}/4`);
    out.push("");
  }
  const bars = barsOf(tune);
  const views = view === "both" ? ["number", "letter"] : [view];
  for (let b = 0; b < bars.length; b += per) {
    const group = bars.slice(b, b + per), rows = views.map(() => ""), lyr = [""];
    let anyLyric = false;
    for (const bar of group) {
      const cells = views.map(() => []), lcells = [];
      for (let i = bar.start; i < bar.end; i++) {
        const n = tune.notes[i], marks = markText(n.d);
        const toks = views.map((v) => tokenText(inst, n, v) + marks);
        const ly = (n.l || "") + (n.h ? "-" : "");
        if (ly) anyLyric = true;
        const w = Math.max(...toks.map((t) => t.length), ly.length);
        toks.forEach((t, k) => cells[k].push(t.padEnd(w)));
        lcells.push(ly.padEnd(w));
      }
      cells.forEach((c, k) => { rows[k] += "| " + c.join(" ") + " "; });
      lyr[0] += "  " + lcells.join(" ") + " ";
    }
    out.push(...rows.map((r) => (r + "|").replace(/ +\|$/, " |")));
    if (anyLyric) out.push(lyr[0].replace(/\s+$/, ""));
    out.push("");
  }
  if (opts.legend !== false) out.push(legendText(inst));
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}
export function legendText(inst) {
  const how = inst.kind === "handpan" ? "D = ding (the middle), 1 2 3... = fields from low to high."
    : `1-7 = notes of the ${pcName(inst.key, inst.flats)} scale (1 = ${letterOf(inst, inst.ref)}). ° = one octave up, comma = one octave down.`;
  return `How to read: ${how} (13) = play together. 0 = rest. - = hold one more beat. _ = half as long (__ a quarter). . after a note = one and a half times as long. ? = not on this instrument.`;
}

// ---------- lyrics ----------
/** Split typed words into syllables: "Twin-kle twin-kle" -> [{ s: "Twin", h: true }, { s: "kle" }, ...]; "_" skips a note */
export function syllables(text) {
  const out = [];
  for (const w of String(text || "").split(/\s+/).filter(Boolean)) {
    const parts = w.split("-");
    parts.forEach((p, i) => { if (p === "") return; out.push(i < parts.length - 1 ? { s: p === "_" ? "" : p, h: true } : { s: p === "_" ? "" : p }); });
  }
  return out;
}
/** Put syllables on the notes (rests are skipped), starting at note `from`; notes past the words lose their lyric */
export function assignLyrics(tune, text, from = 0) {
  const syl = syllables(text); let k = 0;
  const notes = tune.notes.map((n, i) => {
    if (i < from) return n;
    const c = { ...n }; delete c.l; delete c.h;
    if (!n.m.length) return c;
    const s = syl[k++];
    if (s && s.s) { c.l = s.s; if (s.h) c.h = true; }
    return c;
  });
  return { ...tune, notes };
}
/** The lyrics back as typed text ("Twin-kle twin-kle lit-tle star") */
export function lyricsText(tune) {
  let out = "";
  for (const n of tune.notes) {
    if (!n.m.length) continue;
    const s = n.l || "_";
    out += s + (n.h ? "-" : " ");
  }
  return out.replace(/(_ )+$/g, "").trim();
}

// ---------- converting between instruments ----------
/**
 * How well a tune fits an instrument at each transposition: [{ shift, exact, foldable, total, pct }] best first.
 * exact: note-beats that land on the instrument; foldable: missing ones whose letter exists in another octave.
 */
export function rankShifts(tune, inst, range = 24) {
  const notes = tune.notes.filter((n) => n.m.length), total = notes.reduce((a, n) => a + n.d * n.m.length, 0) || 1;
  const set = new Set(inst.notes), pcs = new Set(inst.notes.map((m) => mod(m, 12)));
  const out = [];
  for (let s = -range; s <= range; s++) {
    let exact = 0, foldable = 0;
    for (const n of notes) for (const m of n.m) { if (set.has(m + s)) exact += n.d; else if (pcs.has(mod(m + s, 12))) foldable += n.d; }
    out.push({ shift: s, exact, foldable, total, pct: Math.round((exact / total) * 100), score: exact + foldable * 0.35 - Math.abs(s) * 0.002 - (mod(s, 12) === 0 ? 0 : 0.001) });
  }
  return out.sort((a, b) => b.score - a.score);
}
/** The nearest note the instrument has with the same letter (another octave), or null */
export function foldNote(inst, midi) {
  let best = null;
  for (const m of inst.notes) if (mod(m, 12) === mod(midi, 12) && (best === null || Math.abs(m - midi) < Math.abs(best - midi))) best = m;
  return best;
}
/**
 * The tune moved onto an instrument: opts { shift (default: the best), fold (move missing notes to another octave, true) }.
 * -> { tune, shift, missing: [{ index, midi, name }], folded: [{ index, from, to }], pct, warnings: [text] }
 */
export function fitTune(tune, target, opts = {}) {
  const inst = target.notes ? target : makeInstrument(target);
  const shift = opts.shift ?? rankShifts(tune, inst)[0].shift, fold = opts.fold !== false;
  const missing = [], folded = [];
  const notes = tune.notes.map((n, index) => {
    const m = [];
    for (const x of n.m) {
      const y = x + shift;
      if (inst.notes.includes(y)) { m.push(y); continue; }
      const f = fold ? foldNote(inst, y) : null;
      if (f !== null) { folded.push({ index, from: y, to: f }); m.push(f); } else { missing.push({ index, midi: y, name: noteName(y, inst.flats, inst.spell) }); m.push(y); }
    }
    return { ...n, m: [...new Set(m)] };
  });
  const total = tune.notes.reduce((a, n) => a + n.m.length, 0) || 1;
  const pct = Math.round(((total - missing.length - folded.length) / total) * 100);
  const warnings = [];
  if (shift) warnings.push(`Moved ${shift > 0 ? "up" : "down"} ${Math.abs(shift)} semitone${Math.abs(shift) === 1 ? "" : "s"} to fit${mod(shift, 12) === 0 ? " (whole octaves, so it sounds the same tune)" : ""}.`);
  if (folded.length) warnings.push(`${folded.length} note${folded.length === 1 ? " was" : "s were"} moved to another octave because the instrument doesn't reach ${uniqNames(folded.map((f) => f.from), inst)}.`);
  if (missing.length) warnings.push(`${missing.length} note${missing.length === 1 ? "" : "s"} can't be played on this instrument: ${uniqNames(missing.map((x) => x.midi), inst)}. They're marked with a ? in the tab.`);
  if (!warnings.length) warnings.push("Every note fits as it is.");
  return { tune: { ...tune, inst: instRef(inst), notes }, shift, missing, folded, pct, warnings };
}
const uniqNames = (ms, inst) => [...new Set(ms.map((m) => noteName(m, inst.flats, inst.spell)))].join(", ");

// ---------- step entry helpers ----------
/** The instrument's notes for computer-key digits: digit 1-7 in octave `oct` (0 = the reference octave) -> midi or null */
export function digitNote(inst, digit, oct = 0) {
  if (inst.kind === "handpan") {
    if (digit === 0) return inst.notes[0];
    const fields = inst.notes.slice(1).sort((a, b) => a - b);
    return fields[digit - 1 + oct * 9] ?? null;
  }
  if (digit < 1 || digit > 7) return null;
  const steps = [0, 2, 4, 5, 7, 9, 11];
  const m = inst.ref + oct * 12 + steps[digit - 1];
  return inst.notes.includes(m) ? m : null;
}
/** Snap a heard or played pitch onto the instrument: the nearest of its notes within maxDist semitones, else null */
export function snapToInst(inst, midi, maxDist = 0.75) {
  let best = null, dist = Infinity;
  for (const m of inst.notes) { const d = Math.abs(m - midi); if (d < dist) { dist = d; best = m; } }
  return dist <= maxDist ? best : null;
}

/**
 * A live take into notes: onsets [{ midi, t (seconds) }] -> notes on a grid of `grid` beats at `tempo`, chords for
 * onsets within 60 ms, rests for long gaps. opts: { tempo, grid (0.25), start (count-in end), end (stop time) }
 */
export function quantizeTake(onsets, opts = {}) {
  const tempo = opts.tempo || 90, grid = opts.grid || 0.25, spb = 60 / tempo;
  const list = [...onsets].sort((a, b) => a.t - b.t);
  if (!list.length) return [];
  const groups = [];
  for (const o of list) { const g = groups[groups.length - 1]; if (g && o.t - g.t < 0.06) { if (!g.m.includes(o.midi)) g.m.push(o.midi); } else groups.push({ t: o.t, m: [o.midi] }); }
  const start = opts.start ?? groups[0].t;
  const q = (t) => Math.round(((t - start) / spb) / grid) * grid;
  const beatsAt = groups.map((g) => Math.max(0, q(g.t)));
  const notes = [];
  if (beatsAt[0] > 0) pushRests(notes, beatsAt[0]);
  for (let i = 0; i < groups.length; i++) {
    const next = i + 1 < groups.length ? beatsAt[i + 1] : opts.end !== undefined ? Math.max(beatsAt[i] + grid, q(opts.end)) : beatsAt[i] + 1;
    let len = Math.max(grid, next - beatsAt[i]);
    if (i + 1 < groups.length && next <= beatsAt[i]) { len = grid; beatsAt[i + 1] = beatsAt[i] + grid; }
    // a long gap: the note rings for up to 2 beats, then rests
    const ring = Math.min(len, len > 2 ? 2 : len);
    notes.push(newNote(groups[i].m.sort((a, b) => a - b), ring));
    if (len - ring > 1e-6) pushRests(notes, len - ring);
  }
  return notes;
}
function pushRests(notes, beats) {
  while (beats > 1e-6) { const d = beats >= 4 ? 4 : beats >= 2 ? 2 : beats >= 1 ? 1 : beats >= 0.5 ? 0.5 : 0.25; notes.push(newNote([], d)); beats -= d; }
}

/**
 * Catches plucked or struck notes from pitch frames ({ t, midi (or null), rms }) of the mic.
 * feed(frame) -> midi of a new note, or null. A note is caught when the pitch holds for `hold` frames, again when the
 * pitch changes, or when the same pitch is struck again (the level jumps after decaying).
 */
export class PluckCatcher {
  constructor({ snap = null, hold = 3, gap = 0.12 } = {}) { Object.assign(this, { snap, hold, gap }); this.reset(); }
  reset() { this.run = []; this.active = null; this.lastVoiced = -1; this.minRms = Infinity; this.peakRms = 0; this.pending = null; }
  feed(fr) {
    if (fr.midi === null || fr.midi === undefined || !Number.isFinite(fr.midi)) {
      if (fr.t - this.lastVoiced > this.gap) { this.active = null; this.run = []; this.pending = null; }
      if (Number.isFinite(fr.rms)) this.minRms = Math.min(this.minRms, fr.rms);
      return null;
    }
    this.lastVoiced = fr.t;
    const run = this.run;
    if (run.length && Math.abs(fr.midi - run[run.length - 1].midi) > 0.5) run.length = 0;
    run.push(fr);
    if (run.length > 8) run.shift();
    if (run.length < this.hold) { this.minRms = Math.min(this.minRms, fr.rms ?? 0); return null; }
    const pitch = median(run.slice(-this.hold).map((x) => x.midi));
    const target = this.snap ? this.snap(pitch) : Math.round(pitch);
    if (target === null || target === undefined) return null;
    const rms = fr.rms ?? 0;
    let fire = false;
    if (this.active === null || target !== this.active) { fire = true; this.pending = null; }
    else if (this.pending !== null) {
      // a re-strike of the same note: only once it has held a few frames (a new note's attack also jumps the level)
      if (++this.pending >= 4) { fire = true; this.pending = null; }
    } else if (this.minRms < Infinity && rms > this.minRms * 1.8 && rms > this.peakRms * 0.6 && this.minRms < this.peakRms * 0.55) this.pending = 0;
    if (fire) { this.active = target; this.peakRms = rms; this.minRms = rms; return target; }
    this.peakRms = Math.max(this.peakRms * 0.999, rms); this.minRms = Math.min(this.minRms, rms);
    return null;
  }
}
function median(a) { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; }

// ---------- import: MusicXML / MIDI (via compose-core) ----------
const nearestDur = (beats) => Math.max(0.25, Math.round(beats * 4) / 4);
/**
 * A tune from a Compose score (fromMusicXML): the first part that has notes, voice 1, top note of each chord unless
 * opts.chords. Lyrics come along. -> tune (instrument left to the caller)
 */
export function tuneFromScore(score, opts = {}) {
  const part = score.parts.find((p) => p.voices?.[0]?.some((e) => !e.rest && e.notes?.length)) || score.parts[0];
  const voice = part?.voices?.[0] || [];
  const notes = [];
  for (const e of voice) {
    const d = nearestDur(e.dur / 480);
    const ms = e.rest ? [] : e.notes.map((n) => n.midi).sort((a, b) => a - b);
    const prev = notes[notes.length - 1];
    // a tie carries on the note before it
    if (prev && prev.tied && ms.length && prev.m.join() === (opts.chords ? ms : ms.slice(-1)).join()) { prev.d += d; prev.tied = e.notes.some((n) => n.tie); continue; }
    const n = newNote(opts.chords ? ms : ms.slice(-1), d);
    if (e.lyric) { n.l = String(e.lyric); if (e.lyricHyphen) n.h = true; }
    if (!e.rest && e.notes.some((x) => x.tie)) n.tied = true;
    notes.push(n);
  }
  notes.forEach((n) => delete n.tied);
  return newTune({ title: score.title && score.title !== "Untitled" ? score.title : "Imported tune", by: score.composer || "", tempo: Math.round(score.tempo || 90), beats: [2, 3, 4, 6].includes(score.time?.n) ? score.time.n : 4, notes: mergeRests(notes) });
}
/** A tune from readMidiFile() output: the busiest non-drum track, top note of each chord, quantized to sixteenths */
export function tuneFromMidi(mid, opts = {}) {
  const tracks = mid.tracks.map((t) => ({ ...t, notes: t.notes.filter((n) => n.ch !== 9) })).filter((t) => t.notes.length);
  if (!tracks.length) throw new Error("That MIDI file has no notes.");
  const tr = tracks.reduce((a, b) => (b.notes.length > a.notes.length ? b : a));
  const div = mid.division || 480, chordWin = div / 16;
  const groups = [];
  for (const n of tr.notes) { const g = groups[groups.length - 1]; if (g && n.tick - g.tick <= chordWin) { g.ms.push(n.midi); g.end = Math.max(g.end, n.tick + n.dur); } else groups.push({ tick: n.tick, ms: [n.midi], end: n.tick + n.dur }); }
  const q = (tick) => Math.round((tick / div) * 4) / 4;
  const notes = [];
  let at = 0;
  groups.forEach((g, i) => {
    const s = q(g.tick);
    if (s > at + 1e-6) { pushRests(notes, s - at); at = s; }
    if (s < at - 1e-6) return; // two onsets in one sixteenth: keep the first
    const sounding = Math.max(0.25, q(g.end) - s);
    const last = i + 1 >= groups.length;
    const len = last ? Math.max(0.25, Math.ceil(sounding * 2 - 0.3) / 2) : Math.max(0.25, q(groups[i + 1].tick) - s);
    // a note played a little short (as most MIDI is) still fills its beat; a real gap becomes a rest
    const d = len - sounding <= Math.max(0.25, len * 0.25) ? len : sounding;
    const ms = [...new Set(g.ms)].sort((a, b) => a - b);
    notes.push(newNote(opts.chords ? ms : ms.slice(-1), d));
    at = s + d;
  });
  const head = mid.tracks[0] && !mid.tracks[0].notes.length ? mid.tracks[0].name : "";
  return newTune({ title: head || tr.name || opts.title || "Imported tune", tempo: Math.round(mid.tempo || 120), beats: [2, 3, 4, 6].includes(mid.time?.n) ? mid.time.n : 4, notes: mergeRests(notes) });
}
function mergeRests(notes) {
  // trim leading and trailing rests
  let a = 0, b = notes.length;
  while (a < b && !notes[a].m.length) a++;
  while (b > a && !notes[b - 1].m.length) b--;
  return notes.slice(a, b);
}
/** A Compose score for exporting MIDI / MusicXML: needs compose-core's newScore and newEvent (passed in, so Node tests stay light) */
export function scoreFromTune(tune, { newScore, newEvent }) {
  const s = newScore({ bars: 0, title: tune.title, tempo: tune.tempo, time: { n: tune.beats, d: 4 } });
  s.composer = tune.by || "";
  const inst = makeInstrument(tune.inst);
  s.parts[0].name = KINDS[inst.kind]; s.parts[0].instrument = inst.kind === "kalimba" ? "Kalimba" : inst.kind === "handpan" ? "Steel drums" : "Steel drums";
  s.parts[0].voices[0] = tune.notes.map((n) => {
    const e = newEvent(Math.round(n.d * 480), n.m);
    if (n.l) e.lyric = n.l;
    if (n.h) e.lyricHyphen = true;
    return e;
  });
  return s;
}

// ---------- sharing ----------
export const FILE_EXT = ".encoretab";
export function toFile(tune) { return JSON.stringify({ app: "encore-tabs", v: TABS_VERSION, tune }, null, 1); }
export function fromFile(text) {
  let o;
  try { o = JSON.parse(text); } catch { throw new Error("That file couldn't be read. Is it an ENCORE. Tabs file?"); }
  return cleanTune(o && o.app === "encore-tabs" ? o.tune : o);
}
/** A compact link fragment for a tune (everything is in the link, nothing is uploaded) */
export function toHash(tune) {
  const t = { t: tune.title, b: tune.by || undefined, s: tune.tempo, m: tune.beats, i: tune.inst, n: tune.notes.map((n) => [n.m, n.d, n.l || 0, n.h ? 1 : 0]) };
  return "t=" + b64url(JSON.stringify(t));
}
export function fromHash(hash) {
  const m = /(?:^|[#&])t=([A-Za-z0-9_-]+)/.exec(String(hash || ""));
  if (!m) return null;
  const o = JSON.parse(unb64url(m[1]));
  return cleanTune({ title: o.t, by: o.b, tempo: o.s, beats: o.m, inst: o.i, notes: (o.n || []).map(([mm, d, l, h]) => ({ m: mm, d, l: l || undefined, h: !!h })) });
}
function b64url(s) {
  const bytes = new TextEncoder().encode(s); let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unb64url(s) {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}
/** A safe file name from a title */
export const fileBase = (title) => (String(title || "tune").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_").slice(0, 60) || "tune");

// ---------- starter songs (public domain melodies and words) ----------
/** "C4 D4:2 R:.5 C4+E4" -> notes; a token is NOTE[:beats], R is a rest, + joins a chord */
export function parseMelody(text) {
  return String(text).trim().split(/\s+/).filter((t) => t && t !== "|").map((tok) => {
    const [p, d] = tok.split(":");
    const beats = d ? +d : 1;
    if (/^R$/i.test(p)) return newNote([], beats);
    const ms = p.split("+").map(parseNote);
    if (ms.some((x) => x === null)) throw new Error("bad note " + tok);
    return newNote(ms, beats);
  });
}
