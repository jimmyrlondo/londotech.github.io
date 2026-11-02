// ENCORE. Compose: the music, with no page in it (test-compose.mjs). The score model is
// in COMPOSE-MODEL.md. This file turns that model into engraved measures (notatable values,
// ties, beams, tuplets, accidentals by the measure), reads a MIDI keyboard take into notes
// (quantize), edits, transposes, and reads and writes MusicXML and MIDI files.
import { parseChord, chordSymbol, TYPE } from "./chords-core.js";

export const TPQ = 480;
const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
const mod = (n, m) => ((n % m) + m) % m;
let idSeq = 0;
export const newId = (p = "e") => `${p}${Date.now().toString(36)}${(idSeq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const clone = (o) => JSON.parse(JSON.stringify(o));

// ---------- the score ----------

export const barTicks = (score) => score.time.n * (1920 / score.time.d);
export function newScore(opts = {}) {
  const now = Date.now();
  const s = {
    v: 1, id: newId("c"), title: opts.title ?? "Untitled", subtitle: "", composer: opts.composer ?? "", lyricist: "",
    tempo: opts.tempo ?? 100, time: opts.time ?? { n: 4, d: 4 }, key: opts.key ?? 0, mode: opts.mode ?? "major", pickup: opts.pickup ?? 0,
    parts: opts.parts ?? [newPart(opts.part)], created: now, updated: now,
  };
  return opts.bars === 0 ? s : fillRests(s, { bars: opts.bars ?? 4 });
}
export function newPart(o = {}) {
  return { id: newId("p"), name: o.name ?? "Melody", instrument: o.instrument ?? "Piano", clef: o.clef ?? "treble", transpose: o.transpose ?? 0, voices: [[]] };
}
/** An event: a rest (midis empty) or a note or chord */
export function newEvent(dur, midis = [], extra = {}) {
  const list = Array.isArray(midis) ? midis : [midis];
  return { id: newId(), dur, rest: !list.length, notes: list.map((m) => ({ midi: m, tie: false, spell: null })), ...extra };
}
/** Where each event in a voice starts (sounding ticks from the top of the piece) */
export function eventStarts(voice) {
  const out = []; let t = 0;
  for (const e of voice) { out.push(t); t += e.dur; }
  return out;
}
export const voiceLength = (voice) => voice.reduce((a, e) => a + e.dur, 0);

// ---------- keys and spelling ----------

const SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6]; // F C G D A E B (letter indexes)
const FLAT_ORDER = [6, 2, 5, 1, 4, 0, 3];  // B E A D G C F
/** The alteration the key signature gives a letter (0..6) */
export function keyAlter(L, key) {
  if (key > 0) return SHARP_ORDER.indexOf(L) < key ? 1 : 0;
  if (key < 0) return FLAT_ORDER.indexOf(L) < -key ? -1 : 0;
  return 0;
}
const keyPc = (L, key) => mod(LETTER_PC[L] + keyAlter(L, key), 12);
/** The tonic letter (0..6) of a key in fifths, major or minor */
function tonicLetter(key, mode) {
  const major = mod(key * 4, 7); // each fifth up moves the tonic four letters
  return mode === "minor" ? mod(major + 5, 7) : major;
}
// each chromatic degree from the tonic: [letter steps up, alteration from the key signature]
const DEG_MAJOR = [[0, 0], [1, -1], [1, 0], [2, -1], [2, 0], [3, 0], [3, 1], [4, 0], [5, -1], [5, 0], [6, -1], [6, 0]];
// minor: the raised 6th and 7th (melodic and harmonic minor) and the Picardy 3rd are sharps of the key's notes
const DEG_MINOR = [[0, 0], [1, -1], [1, 0], [2, 0], [2, 1], [3, 0], [3, 1], [4, 0], [5, 0], [5, 1], [6, 0], [6, 1]];
/**
 * A MIDI note spelled in a key: { step: "C".."B", alter, octave }.
 * override: { step, alter } from the event wins. dir: +1 rising, -1 falling, 0 neither, for notes
 * outside the key (a chromatic passing tone takes a sharp going up and a flat going down).
 */
export function spell(midi, key = 0, override = null, dir = 0, mode = "major") {
  const pc = mod(midi, 12);
  let L, alter;
  if (override && LETTERS.includes(override.step)) { L = LETTERS.indexOf(override.step); alter = override.alter ?? 0; }
  else {
    const inKey = [0, 1, 2, 3, 4, 5, 6].find((x) => keyPc(x, key) === pc);
    if (inKey !== undefined) { L = inKey; alter = keyAlter(L, key); }
    else if (dir) {
      // up: the key note a half step below, raised; down: the key note a half step above, lowered
      L = [0, 1, 2, 3, 4, 5, 6].find((x) => mod(pc - keyPc(x, key), 12) === (dir > 0 ? 1 : 11));
      alter = keyAlter(L, key) + (dir > 0 ? 1 : -1);
    }
    if (L === undefined) {
      const t = tonicLetter(key, mode), tPc = keyPc(t, key), [steps, d] = (mode === "minor" ? DEG_MINOR : DEG_MAJOR)[mod(pc - tPc, 12)];
      L = mod(t + steps, 7); alter = keyAlter(L, key) + d;
    }
    if (Math.abs(alter) > 2) { L = [0, 1, 2, 3, 4, 5, 6].find((x) => Math.abs(mod(pc - LETTER_PC[x] + 6, 12) - 6) <= 1); alter = mod(pc - LETTER_PC[L] + 6, 12) - 6; }
  }
  return { step: LETTERS[L], alter, octave: Math.floor((midi - alter) / 12) - 1 };
}
export const midiOf = (step, alter, octave) => (octave + 1) * 12 + LETTER_PC[LETTERS.indexOf(step)] + alter;
/** The key (fifths) a transposing instrument reads for a concert key: Bb trumpet (+2) in C reads D */
export function writtenKey(key, transpose) {
  let d = mod(transpose * 7, 12); if (d > 6) d -= 12;
  let k = key + d;
  if (k > 7) k -= 12; if (k < -7) k += 12;
  return k;
}
export const toWritten = (midi, part) => midi + (part?.transpose || 0);
export const toConcert = (midi, part) => midi - (part?.transpose || 0);
export function keyName(key, mode = "major") {
  const L = tonicLetter(key, mode), a = keyAlter(L, key);
  return LETTERS[L] + (a > 0 ? "#" : a < 0 ? "b" : "") + (mode === "minor" ? " minor" : " major");
}

// ---------- durations ----------

const BASE = [[1920, "whole"], [960, "half"], [480, "quarter"], [240, "eighth"], [120, "16th"], [60, "32nd"], [30, "64th"]];
const TYPE_TICKS = Object.fromEntries(BASE.map(([t, n]) => [n, t]));
/** A single written value for a length, or null: { type, dots, ticks } (up to two dots) */
export function valueOf(ticks) {
  for (const [t, type] of BASE) {
    if (ticks === t) return { type, dots: 0, ticks };
    if (ticks === t * 1.5) return { type, dots: 1, ticks };
    if (ticks === t * 1.75) return { type, dots: 2, ticks };
  }
  return null;
}
/** Any length as written values, biggest first (ties between them) */
export function durationParts(ticks) {
  const out = []; let left = ticks;
  while (left >= 30) {
    let v = null;
    for (const [t] of BASE) { for (const m of [1.75, 1.5, 1]) if (t * m <= left && (!v || t * m > v.ticks)) v = valueOf(t * m); }
    out.push(v); left -= v.ticks;
  }
  return out;
}

// ---------- meter: how strong each point in a bar is ----------

/**
 * The bar's beat groups in ticks, e.g. 4/4 [480x4], 6/8 [720, 720], 7/8 [480, 480, 720].
 * time.groups (in units of 1/time.d) overrides: 7/8 { groups: [3, 2, 2] }.
 */
export function beatGroups(time) {
  const u = 1920 / time.d, n = time.n;
  if (time.groups?.length) return time.groups.map((g) => g * u);
  if (time.d >= 8 && n % 3 === 0 && n > 3) return Array(n / 3).fill(3 * u);   // compound: dotted beats
  if (time.d >= 8 && n > 3) {                                                   // 5/8, 7/8, 11/8: twos then a three
    const out = []; let left = n;
    while (left > 3) { out.push(2 * u); left -= 2; }
    out.push(left * u); return out;
  }
  return Array(n).fill(u);
}
const isCompound = (time) => !time.groups && time.d >= 8 && time.n % 3 === 0 && time.n > 3;
/** Strength of a point in a bar: 4 the downbeat, 3 the middle (4/4, 12/8), 2 a beat, 1.5 the last beat of 3/4, then smaller in the beat */
export function strength(pos, time) {
  if (pos === 0) return 4;
  const bar = time.n * (1920 / time.d), groups = beatGroups(time);
  if (groups.length >= 4 && groups.length % 2 === 0) { let acc = 0; for (let i = 0; i < groups.length / 2; i++) acc += groups[i]; if (pos === acc && acc * 2 === bar) return 3; }
  let acc = 0;
  for (let i = 0; i < groups.length; i++) {
    if (pos === acc) return groups.length === 3 && !isCompound(time) && time.d <= 4 && i === 2 ? 1.5 : 2;
    if (pos > acc && pos < acc + groups[i]) {
      const g = groups[i], within = pos - acc, sub = g === 3 * (1920 / time.d) ? g / 3 : g / 2; // a beat of three units divides in threes
      if (within % sub === 0) return 1;
      let s = 0.5, step = sub / 2;
      while (step >= 15) { if (within % step === 0) return s; s /= 2; step /= 2; }
      return 0.01;
    }
    acc += groups[i];
  }
  return 0.01;
}
// the strongest point strictly inside (a, b), earliest first on a tie
function strongestInside(a, b, time) {
  let best = -1, at = -1;
  for (let p = Math.ceil((a + 1) / 15) * 15; p < b; p += 15) { const s = strength(p, time); if (s > best) { best = s; at = p; } }
  return at;
}
function crossesBeat(a, b, time) { for (let p = Math.ceil((a + 1) / 15) * 15; p < b; p += 15) if (strength(p, time) >= 1.5) return true; return false; }
/**
 * Can [a, b) in a bar be written as one value? Notes may cross weaker points than where they start
 * (a half note on beat 1 or 3 of 4/4, but not on beat 2, which would hide the middle of the bar).
 * Rests are stricter: only undotted, and only across a beat from the downbeat or the middle.
 */
function oneValue(a, b, time, rest) {
  const v = valueOf(b - a);
  if (!v) return false;
  const sa = strength(a, time);
  if (v.dots === 2 && sa < 1.5) return false;
  for (let p = Math.ceil((a + 1) / 15) * 15; p < b; p += 15) { const s = strength(p, time); if (s >= 1.5 && s >= sa) return false; }
  if (rest) {
    if (crossesBeat(a, b, time)) return v.dots === 0 && sa >= 3;
    if (v.dots && sa < 1) return false;
  }
  return true;
}
/** [a, b) in a bar split into written values the way an engraver would (positions within the bar) */
export function splitNotation(a, b, time, rest = false) {
  if (b <= a) return [];
  if (oneValue(a, b, time, rest)) return [{ start: a, ...valueOf(b - a) }];
  const p = strongestInside(a, b, time);
  if (p < 0) return durationParts(b - a).reduce((out, v) => { const s = out.length ? out[out.length - 1].start + out[out.length - 1].ticks : a; out.push({ start: s, ...v }); return out; }, []);
  return [...splitNotation(a, p, time, rest), ...splitNotation(p, b, time, rest)];
}

// ---------- layout: the voice as engraved measures ----------

/**
 * Measures for one part, ready to draw:
 * [{ index, number, start, ticks, pickup, events: [piece] }] where each piece is
 * { ref, start, pos, ticks, written, type, dots, rest, full, notes: [{ midi, step, alter, octave, tie, showAcc }],
 *   chord, lyric, lyricHyphen, artic, dyn, tuplet: { id, n, of, first, last } | null, tiedFromPrev, beam: id | null }
 * start: ticks from the top of the piece; pos: within the bar. midi/step are written pitch when opts.transposed.
 * opts: { transposed: false, courtesy: false, voice: 0, bars: minimum number of bars }
 */
export function layout(score, partIndex = 0, opts = {}) {
  const part = score.parts[partIndex], voice = part.voices[opts.voice || 0] || [];
  const time = score.time, bar = barTicks(score), pick = score.pickup > 0 && score.pickup < bar ? score.pickup : 0;
  const shift = opts.transposed ? part.transpose || 0 : 0, key = opts.transposed ? writtenKey(score.key, part.transpose || 0) : score.key;
  const total = voiceLength(voice);
  const barStart = (i) => (i === 0 ? 0 : pick ? pick + (i - 1) * bar : i * bar);
  const barLen = (i) => (i === 0 && pick ? pick : bar);
  let nBars = 0; while (barStart(nBars) < total) nBars++;
  nBars = Math.max(nBars, opts.bars || 1);
  const measures = Array.from({ length: nBars }, (_, i) => ({ index: i, number: pick ? i : i + 1, start: barStart(i), ticks: barLen(i), pickup: i === 0 && !!pick, events: [] }));
  const barAt = (t) => { let i = 0; while (i + 1 < nBars && barStart(i + 1) <= t) i++; return i; };
  // tuplet groups: consecutive events with the same ratio, closed when their written total is n of one plain value
  const tupletOf = new Map(); let tid = 0;
  for (let i = 0; i < voice.length; i++) {
    const tu = voice[i].tuplet; if (!tu) continue;
    const ids = [i]; let written = voice[i].dur * tu.n / tu.of, minW = written;
    for (let j = i + 1; ; j++) {
      const base = written / tu.n;
      if (TYPE_TICKS[valueOf(base)?.type] === base && written >= tu.n * Math.min(minW, base)) break;
      const e = voice[j]; if (!e || !e.tuplet || e.tuplet.n !== tu.n || e.tuplet.of !== tu.of) break;
      ids.push(j); const w = e.dur * tu.n / tu.of; written += w; minW = Math.min(minW, w);
    }
    const id = ++tid;
    ids.forEach((k, x) => tupletOf.set(k, { id, n: tu.n, of: tu.of, first: x === 0, last: x === ids.length - 1 }));
    i = ids[ids.length - 1];
  }
  // events cut at barlines and into written values
  let t = 0;
  voice.forEach((e, ref) => {
    const end = t + e.dur;
    if (e.tuplet) {
      const w = e.dur * e.tuplet.n / e.tuplet.of, parts = valueOf(w) ? [valueOf(w)] : durationParts(w);
      let s = t;
      parts.forEach((v, k) => {
        const ticks = v.ticks * e.tuplet.of / e.tuplet.n, m = measures[barAt(s)];
        m.events.push(piece(e, ref, s, s - m.start, ticks, v, k > 0, k < parts.length - 1, tupletOf.get(ref)));
        s += ticks;
      });
    } else {
      let s = t, first = true;
      while (s < end) {
        const mi = barAt(s), m = measures[mi], mEnd = m.start + m.ticks, segEnd = Math.min(end, mEnd), off = m.pickup ? bar - m.ticks : 0;
        // a pickup is the end of a bar, so its beats are counted from where it would sit
        const pieces = splitNotation(s - m.start + off, segEnd - m.start + off, time, e.rest);
        pieces.forEach((v, k) => {
          const last = segEnd === end && k === pieces.length - 1;
          m.events.push(piece(e, ref, m.start + v.start - off, v.start - off, v.ticks, v, !first, !last));
          first = false;
        });
        s = segEnd;
      }
    }
    t = end;
  });
  // bars the voice doesn't reach yet are a whole-bar rest
  for (const m of measures) {
    const used = m.events.reduce((a, p) => a + p.ticks, 0);
    if (used < m.ticks) {
      const off = m.pickup ? bar - m.ticks : 0;
      for (const v of splitNotation(used + off, m.ticks + off, time, true)) m.events.push({ ref: -1, start: m.start + v.start - off, pos: v.start - off, ticks: v.ticks, written: v.ticks, type: v.type, dots: v.dots, rest: true, full: false, notes: [], chord: null, lyric: null, lyricHyphen: false, artic: [], dyn: null, tuplet: null, tiedFromPrev: false, beam: null, filler: true });
    }
    // a bar of nothing but rest is one whole-bar rest
    if (m.events.length && m.events.every((p) => p.rest) && !m.pickup) {
      const firstRef = m.events.find((p) => p.ref >= 0)?.ref ?? -1;
      m.events = [{ ref: firstRef, start: m.start, pos: 0, ticks: m.ticks, written: m.ticks, type: "whole", dots: 0, rest: true, full: true, notes: [], chord: null, lyric: null, lyricHyphen: false, artic: [], dyn: null, tuplet: null, tiedFromPrev: false, beam: null, filler: firstRef < 0 }];
    }
  }
  // pitches: spelled in the key, with the direction of the line for notes outside it
  const flat = measures.flatMap((m) => m.events);
  const line = flat.filter((p) => !p.rest).map((p) => p.notes[p.notes.length - 1].midi);
  let li = 0, last = new Map(); // a repeated note keeps the spelling it just had
  for (const p of flat) {
    if (p.rest) continue;
    const prev = line[li - 1], next = line[li + 1], cur = line[li++];
    const dir = prev !== undefined && next !== undefined && Math.sign(cur - prev) === Math.sign(next - cur) ? Math.sign(next - cur) : prev !== undefined ? Math.sign(cur - prev) : 0;
    const now = new Map();
    p.notes = p.notes.map((n) => {
      const ov = n.spell && shift ? null : n.spell; // an override is for concert pitch; written pitch spells itself
      const m = n.midi + shift, sp = ov || !last.has(m) || (dir && !p.tiedFromPrev && prev !== cur) ? spell(m, key, ov, dir, score.mode) : last.get(m);
      now.set(m, sp);
      return { midi: m, ...sp, tie: n.tie, showAcc: false };
    });
    last = now;
  }
  // accidentals by the measure: the key signature, then whatever an earlier note in the bar set (by staff position)
  let prevBar = new Map();
  for (const m of measures) {
    const now = new Map();
    for (const p of m.events) {
      for (const n of p.notes) {
        const k = n.step + n.octave, sig = keyAlter(LETTERS.indexOf(n.step), key);
        const cur = now.has(k) ? now.get(k) : sig;
        if (p.tiedFromPrev && p.pos === 0) continue; // a tie into the bar doesn't show (and doesn't carry)
        if (p.tiedFromPrev) { now.set(k, n.alter); continue; }
        if (n.alter !== cur) n.showAcc = true;
        else if (opts.courtesy && !now.has(k) && prevBar.has(k) && prevBar.get(k) !== n.alter) n.showAcc = "courtesy";
        now.set(k, n.alter);
      }
    }
    prevBar = now;
  }
  // the written part reads its chord symbols in its own key too (concert C is D for a Bb trumpet)
  if (shift) for (const m of measures) for (const e of m.events) if (e.chord) e.chord = transposeChordSymbol(e.chord, shift, key);
  // beams: eighths and shorter, grouped by beat (by the half bar in 4/4 when it's all eighths), broken by rests
  for (const m of measures) beamMeasure(m, time, m.pickup ? bar - m.ticks : 0);
  return measures;
}
function piece(e, ref, start, pos, ticks, v, tiedFromPrev, tiedOn, tuplet = null) {
  return { ref, start, pos, ticks, written: v.ticks, type: v.type, dots: v.dots, rest: !!e.rest, full: false,
    notes: e.rest ? [] : e.notes.map((n) => ({ midi: n.midi, spell: n.spell || null, tie: tiedOn || !!n.tie })),
    chord: tiedFromPrev ? null : e.chord || null, lyric: tiedFromPrev ? null : e.lyric || null, lyricHyphen: !tiedFromPrev && !!e.lyricHyphen,
    artic: tiedFromPrev ? [] : e.artic || [], dyn: tiedFromPrev ? null : e.dyn || null, tuplet: tuplet && { ...tuplet, first: tuplet.first && !tiedFromPrev, last: tuplet.last && !tiedOn }, tiedFromPrev, beam: null };
}
let beamSeq = 0;
function beamMeasure(m, time, offset) {
  const groups = beatGroups(time), bounds = []; let acc = 0;
  for (const g of groups) { bounds.push([acc, acc + g]); acc += g; }
  // 4/4 and 2/2 style: a half bar of plain eighths beams as one group of four
  const halves = groups.length === 4 && !isCompound(time) && time.d === 4 ? [[0, 960], [960, 1920]] : groups.length === 2 && time.n === 2 && time.d === 4 ? [[0, 960]] : [];
  const beamable = (p) => !p.rest && TYPE_TICKS[p.type] < 480;
  const unitOf = (pos) => {
    for (const [a, b] of halves) {
      if (pos >= a && pos < b) {
        const inside = m.events.filter((p) => p.pos + offset >= a && p.pos + offset < b);
        if (inside.length && inside.every((p) => !p.rest && p.type === "eighth" && !p.tuplet && !p.dots) && inside.reduce((x, p) => x + p.ticks, 0) === b - a) return `h${a}`;
      }
    }
    for (const [a, b] of bounds) if (pos >= a && pos < b) return `b${a}`;
    return "x";
  };
  let run = [], runUnit = null;
  const close = () => { if (run.length >= 2) { const id = ++beamSeq; run.forEach((p) => (p.beam = id)); } run = []; runUnit = null; };
  for (const p of m.events) {
    const unit = p.tuplet ? `t${p.tuplet.id}` : unitOf(p.pos + offset);
    if (!beamable(p) || unit !== runUnit) close();
    if (beamable(p)) { run.push(p); runUnit = unit; }
  }
  close();
}

// ---------- editing (each returns a new score; the old one is untouched, for undo) ----------

const touch = (s) => { s.updated = Date.now(); return s; };
export function insertAt(score, partIndex, index, event, voiceIndex = 0) { const s = clone(score); s.parts[partIndex].voices[voiceIndex].splice(index, 0, event); return touch(s); }
export function replaceAt(score, partIndex, index, event, voiceIndex = 0) { const s = clone(score); s.parts[partIndex].voices[voiceIndex][index] = event; return touch(s); }
export function deleteAt(score, partIndex, index, voiceIndex = 0) { const s = clone(score); s.parts[partIndex].voices[voiceIndex].splice(index, 1); return touch(s); }
/** Change one note of an event (noteIndex), or add one (noteIndex = -1); a rest becomes a note */
export function setPitch(score, partIndex, index, noteIndex, midi, voiceIndex = 0) {
  const s = clone(score), e = s.parts[partIndex].voices[voiceIndex][index];
  if (!e) return score;
  if (e.rest || noteIndex < 0) { if (e.rest) e.notes = []; e.rest = false; e.notes.push({ midi, tie: false, spell: null }); }
  else if (e.notes[noteIndex]) e.notes[noteIndex] = { ...e.notes[noteIndex], midi, spell: null };
  e.notes.sort((a, b) => a.midi - b.midi);
  return touch(s);
}
/** The event sounding at a tick: { index, start } (or the end of the voice) */
export function eventAt(score, partIndex, tick, voiceIndex = 0) {
  const v = score.parts[partIndex].voices[voiceIndex]; let t = 0;
  for (let i = 0; i < v.length; i++) { if (tick < t + v[i].dur) return { index: i, start: t }; t += v[i].dur; }
  return { index: v.length, start: t };
}
/** Every voice padded with rests to the end of its bar (and to at least opts.bars bars, a pickup counting as one) */
export function fillRests(score, opts = {}) {
  const s = clone(score), bar = barTicks(s), pick = s.pickup > 0 && s.pickup < bar ? s.pickup : 0;
  const endOf = (n) => (n <= 0 ? 0 : pick ? pick + (n - 1) * bar : n * bar);     // where bar n ends
  const nextLine = (t) => { let n = 1; while (endOf(n) <= t) n++; return endOf(n); }; // the first barline after t
  for (const p of s.parts) for (const v of p.voices) {
    let len = voiceLength(v);
    const target = Math.max(endOf(opts.bars || 0), len === 0 || endOf(0) === len ? len : nextLine(len - 1));
    while (len < target) { const d = Math.min(target, nextLine(len)) - len; v.push(newEvent(d)); len += d; }
  }
  return touch(s);
}
/** Ties merged and spellings that match the default dropped, so two scores that print the same compare equal */
export function normalize(score) {
  const s = clone(score);
  delete s.id; delete s.created; delete s.updated;
  for (const p of s.parts) {
    delete p.id;
    p.voices = p.voices.map((v) => {
      const out = [];
      for (const e of v) {
        const prev = out[out.length - 1];
        const plain = (x) => !x.chord && !x.lyric && !x.tuplet && !(x.artic || []).length && !x.dyn;
        if (prev && !prev.rest && !e.rest && !prev.tuplet && plain(e) && prev.notes.every((n) => n.tie) && prev.notes.length === e.notes.length && prev.notes.every((n, i) => n.midi === e.notes[i].midi)) {
          prev.dur += e.dur; prev.notes.forEach((n, i) => (n.tie = e.notes[i].tie)); continue;
        }
        if (prev && prev.rest && e.rest && plain(e) && plain(prev)) { prev.dur += e.dur; continue; }
        const c = { dur: e.dur, rest: !!e.rest, notes: e.rest ? [] : e.notes.map((n) => ({ midi: n.midi, tie: !!n.tie, spell: n.spell || null })).sort((a, b) => a.midi - b.midi) };
        for (const k of ["chord", "lyric", "dyn"]) if (e[k]) c[k] = e[k];
        if (e.lyricHyphen) c.lyricHyphen = true;
        if (e.tuplet) c.tuplet = { n: e.tuplet.n, of: e.tuplet.of };
        if ((e.artic || []).length) c.artic = [...e.artic].sort();
        out.push(c);
      }
      // rests that only round out the last bar are implied by the layout
      while (out.length && out[out.length - 1].rest && Object.keys(out[out.length - 1]).length === 3) out.pop();
      return out;
    });
  }
  return s;
}

// ---------- transposing ----------

/** Every note up or down; the key moves with it (spelled the simpler way) */
export function transposeScore(score, semis) {
  const s = clone(score);
  s.key = writtenKey(s.key, semis);
  for (const p of s.parts) for (const v of p.voices) for (const e of v) {
    for (const n of e.notes || []) { n.midi += semis; n.spell = null; }
    if (e.chord) e.chord = transposeChordSymbol(e.chord, semis, s.key);
  }
  return touch(s);
}
/** A new key signature: transpose the music into it (nearest way), or just re-spell it (transpose: false) */
export function changeKey(score, key, { transpose = true, mode } = {}) {
  if (!transpose) { const s = clone(score); s.key = key; if (mode) s.mode = mode; return touch(s); }
  const tonicPc = (k) => mod(k * 7, 12);
  let semis = mod(tonicPc(key) - tonicPc(score.key), 12); if (semis > 6) semis -= 12;
  const s = transposeScore(score, semis); s.key = key; if (mode) s.mode = mode;
  return s;
}
function transposeChordSymbol(sym, semis, key) {
  const c = parseChord(sym); if (!c) return sym;
  const root = spell(mod(LETTER_PC[c.root.L] + c.root.a + semis, 12) + 60, key);
  const bass = c.bass ? spell(mod(LETTER_PC[c.bass.L] + c.bass.a + semis, 12) + 60, key) : null;
  const name = (x) => x.step + (x.alter > 0 ? "#".repeat(x.alter) : "b".repeat(-x.alter));
  return name(root) + TYPE[c.type].sym + (bass ? "/" + name(bass) : "");
}

// ---------- recording: a MIDI keyboard take into notes ----------

/**
 * notes: [{ midi, on, off, vel }] in seconds from the first downbeat (a pickup is played before it: negative times).
 * opts: { tempo, time: { n, d }, grid: 120 (16ths) | 240 (8ths) | 60, triplets: "auto" | true | false, pickup: ticks, chords: false }
 * Returns { events, pickup } ready to be a voice: rests in the gaps, chords where notes start together
 * (or the top note alone when chords is false), triplets where the playing was in threes.
 */
export function quantize(notes, opts = {}) {
  const tempo = opts.tempo || 100, time = opts.time || { n: 4, d: 4 }, grid = opts.grid || 120, pickup = opts.pickup || 0;
  const tps = (tempo * TPQ) / 60;                 // ticks per second
  const groups = beatGroups(time), bar = time.n * (1920 / time.d);
  // keys come up a little before the beat they're held to, so ends get ~45 ms of grace before snapping
  const release = Math.min(0.045 * tps, grid * 0.45);
  const raw = notes.filter((n) => n.off > n.on).map((n) => ({ midi: n.midi, a: n.on * tps + pickup, b: n.off * tps + pickup + release, vel: n.vel ?? 90 }));
  if (!raw.length) return { events: [], pickup };
  // the beat each tick belongs to (beats repeat bar by bar from the pickup)
  const beatOf = (t) => {
    const into = t - pickup, b = Math.floor(into / bar), within = into - b * bar;
    let acc = 0; for (const g of groups) { if (within < acc + g) return { start: pickup + b * bar + acc, len: g }; acc += g; }
    return { start: pickup + b * bar + bar - groups[groups.length - 1], len: groups[groups.length - 1] };
  };
  // per beat: straight grid or threes (the one that fits the onsets clearly better)
  const tripBeats = new Map();
  if (opts.triplets !== false) {
    const byBeat = new Map();
    for (const n of raw) { const bt = beatOf(n.a + grid / 2 - 1); const k = bt.start; if (!byBeat.has(k)) byBeat.set(k, { bt, on: [] }); byBeat.get(k).on.push(n.a); }
    const pairs = []; // beats with one note off the beat: straight or swung is decided for the whole take
    for (const [k, { bt, on }] of byBeat) {
      if (bt.len % 3 === 0 && isCompound(time)) continue; // a compound beat already counts in threes
      const tg = bt.len / 3, inside = on.filter((a) => a >= bt.start - tg / 2 && a < bt.start + bt.len - tg / 2);
      if (opts.triplets === true) { if (inside.length) tripBeats.set(k, tg); continue; }
      const offBeat = inside.filter((a) => Math.abs(a - bt.start) > tg / 3);
      if (!offBeat.length) continue;
      const err = (g) => offBeat.reduce((s, a) => s + Math.abs((a - bt.start) - Math.round((a - bt.start) / g) * g), 0) / offBeat.length;
      const straight = err(grid), trip = err(tg);
      if (offBeat.length === 1 && opts.triplets !== true) { pairs.push({ k, tg, straight, trip }); continue; }
      // three notes evenly across the beat are a triplet even when one is played a little off
      const three = [...inside].sort((x, y) => x - y);
      if (three.length === 3 && Math.abs(three[0] - bt.start) < tg * 0.35 && trip <= straight) {
        const gaps = [three[1] - three[0], three[2] - three[1], bt.start + bt.len - three[2]];
        if (gaps.every((g) => Math.abs(g - tg) < tg * 0.3)) { tripBeats.set(k, tg); continue; }
      }
      if (trip < straight * 0.6 && trip < tg * 0.26) tripBeats.set(k, tg);
    }
    // a long-short beat alone can't tell a dotted rhythm from swing at speed; all of them together can
    if (pairs.length) {
      const st = pairs.reduce((x, p) => x + p.straight, 0), tr = pairs.reduce((x, p) => x + p.trip, 0);
      if (tr < st * (pairs.length > 1 ? 0.8 : 0.6) && tr / pairs.length < pairs[0].tg * 0.26) for (const p of pairs) tripBeats.set(p.k, p.tg);
    }
  }
  const snap = (t) => { const bt = beatOf(t), g = tripBeats.get(bt.start) || grid; const s = bt.start + Math.round((t - bt.start) / g) * g; return s; };
  // onsets together are one chord; each note lasts to its own snapped end, cut at the next onset
  const byStart = new Map();
  for (const n of raw) { const s = Math.max(0, snap(n.a)); if (!byStart.has(s)) byStart.set(s, []); byStart.get(s).push(n); }
  const starts = [...byStart.keys()].sort((x, y) => x - y), sounds = [];
  starts.forEach((s, i) => {
    let list = byStart.get(s).sort((x, y) => x.midi - y.midi);
    if (!opts.chords) list = [list[list.length - 1]];
    const next = starts[i + 1] ?? Infinity;
    let end = Math.max(...list.map((n) => snap(n.b)));
    const minLen = tripBeats.get(beatOf(s).start) || grid;
    if (end <= s) end = s + minLen;
    // players let go a little early: a short gap before the next note is legato, not a rest
    if (next < Infinity && next - end <= Math.max(minLen, 0.3 * (next - s))) end = next;
    end = Math.min(end, next);
    sounds.push({ s, e: end, midis: [...new Set(list.map((n) => n.midi))], vel: Math.max(...list.map((n) => n.vel)) });
  });
  // a timeline of rests and notes, cut at the edges of triplet beats
  const cuts = new Set();
  for (const k of tripBeats.keys()) { cuts.add(k); cuts.add(k + beatOf(k).len); }
  const events = []; let t = 0;
  const push = (a, b, midis) => {
    const pts = [a, ...[...cuts].filter((c) => c > a && c < b).sort((x, y) => x - y), b];
    for (let i = 0; i + 1 < pts.length; i++) {
      const s = pts[i], e = pts[i + 1], trip = tripBeats.has(beatOf(s).start);
      const ev = newEvent(e - s, midis);
      if (trip) ev.tuplet = { n: 3, of: 2 };
      if (i + 2 < pts.length && midis.length) ev.notes.forEach((n) => (n.tie = true));
      events.push(ev);
    }
  };
  for (const sd of sounds) {
    if (sd.s > t) push(t, sd.s, []);
    push(sd.s, sd.e, sd.midis);
    t = sd.e;
  }
  // round the last bar out with rest
  const into = t - pickup, endBar = pickup + Math.ceil(into / bar) * bar;
  if (endBar > t) push(t, endBar, []);
  return { events, pickup };
}

// ---------- playback ----------

const DYN_VEL = { ppp: 30, pp: 42, p: 56, mp: 70, mf: 84, f: 98, ff: 112, fff: 124 };
/**
 * Sounds to play: [{ time, dur, midi, vel, part, ref }] in seconds (concert pitch), ties joined,
 * staccato shortened, accents louder, dynamics carried forward. opts: { from: tick, parts: [indexes] }
 */
export function playbackEvents(score, opts = {}) {
  const spt = 60 / (score.tempo * TPQ), out = [];
  score.parts.forEach((p, pi) => {
    if (opts.parts && !opts.parts.includes(pi)) return;
    let vel = 84;
    for (const v of p.voices) {
      let t = 0; const open = new Map(); // midi -> sound being held by a tie
      v.forEach((e, ref) => {
        if (e.dyn && DYN_VEL[e.dyn]) vel = DYN_VEL[e.dyn];
        if (!e.rest) for (const n of e.notes) {
          const held = open.get(n.midi);
          if (held) { held.dur += e.dur * spt; if (!n.tie) open.delete(n.midi); continue; }
          const artic = e.artic || [];
          const snd = { time: t * spt, dur: e.dur * spt * (artic.includes("staccato") ? 0.5 : artic.includes("tenuto") ? 1 : 0.92), midi: n.midi, vel: Math.min(127, vel + (artic.includes("accent") ? 16 : 0)), part: pi, ref };
          out.push(snd);
          if (n.tie) open.set(n.midi, snd);
        }
        for (const [m, snd] of open) if (!e.notes?.some((n) => n.midi === m)) open.delete(m);
        t += e.dur;
      });
    }
  });
  const from = (opts.from || 0) * spt;
  return out.filter((x) => x.time + x.dur > from).sort((a, b) => a.time - b.time || a.midi - b.midi);
}

// ---------- MusicXML ----------

const xesc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const CLEFS = { treble: ["G", 2, 0], bass: ["F", 4, 0], alto: ["C", 3, 0], tenor: ["C", 4, 0], treble8vb: ["G", 2, -1], percussion: ["percussion", 2, 0] };
const KIND = { maj: "major", min: "minor", dim: "diminished", aug: "augmented", sus4: "suspended-fourth", sus2: "suspended-second", 5: "power", 6: "major-sixth", m6: "minor-sixth",
  maj7: "major-seventh", 7: "dominant", m7: "minor-seventh", mMaj7: "major-minor", dim7: "diminished-seventh", m7b5: "half-diminished", "7#5": "augmented-seventh", 9: "dominant-ninth",
  maj9: "major-ninth", m9: "minor-ninth", 11: "dominant-11th", m11: "minor-11th", 13: "dominant-13th", maj13: "major-13th", m13: "minor-13th" };
const ACC = { "-2": "flat-flat", "-1": "flat", 0: "natural", 1: "sharp", 2: "double-sharp" };
const DIV = TPQ;
/** A MusicXML 4.0 score (partwise): written pitch for transposing parts, with their transposition */
export function toMusicXML(score) {
  const bar = barTicks(score), x = [];
  x.push('<?xml version="1.0" encoding="UTF-8" standalone="no"?>',
    '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">',
    '<score-partwise version="4.0">', `  <work><work-title>${xesc(score.title)}</work-title></work>`,
    "  <identification>", score.composer ? `    <creator type="composer">${xesc(score.composer)}</creator>` : "", score.lyricist ? `    <creator type="lyricist">${xesc(score.lyricist)}</creator>` : "",
    `    <encoding><software>ENCORE. Compose</software><encoding-date>${new Date().toISOString().slice(0, 10)}</encoding-date></encoding>`, "  </identification>",
    score.subtitle ? `  <credit page="1"><credit-type>subtitle</credit-type><credit-words>${xesc(score.subtitle)}</credit-words></credit>` : "",
    "  <part-list>");
  score.parts.forEach((p, i) => x.push(`    <score-part id="P${i + 1}"><part-name>${xesc(p.name)}</part-name><score-instrument id="P${i + 1}-I1"><instrument-name>${xesc(p.instrument)}</instrument-name></score-instrument><midi-instrument id="P${i + 1}-I1"><midi-channel>${i >= 9 ? i + 2 : i + 1}</midi-channel><midi-program>${programOf(p.instrument) + 1}</midi-program></midi-instrument></score-part>`));
  x.push("  </part-list>");
  score.parts.forEach((p, pi) => {
    const tr = p.transpose || 0, measures = layout(score, pi, { transposed: !!tr }), key = writtenKey(score.key, tr), [sign, line, oct] = CLEFS[p.clef] || CLEFS.treble;
    x.push(`  <part id="P${pi + 1}">`);
    let syllOpen = false;
    measures.forEach((m) => {
      x.push(`    <measure number="${m.number}"${m.pickup ? ' implicit="yes"' : ""}>`);
      if (m.index === 0) {
        x.push("      <attributes>", `        <divisions>${DIV}</divisions>`, `        <key><fifths>${key}</fifths><mode>${score.mode === "minor" ? "minor" : "major"}</mode></key>`,
          `        <time><beats>${score.time.n}</beats><beat-type>${score.time.d}</beat-type></time>`,
          `        <clef><sign>${sign}</sign>${sign === "percussion" ? "" : `<line>${line}</line>`}${oct ? `<clef-octave-change>${oct}</clef-octave-change>` : ""}</clef>`);
        if (tr) { const d = diatonicSteps(tr); x.push(`        <transpose><diatonic>${-d}</diatonic><chromatic>${-tr}</chromatic></transpose>`); }
        x.push("      </attributes>");
        if (pi === 0) x.push(`      <direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${score.tempo}</per-minute></metronome></direction-type><sound tempo="${score.tempo}"/></direction>`);
      }
      for (const ev of m.events) {
        if (ev.dyn) x.push(`      <direction placement="below"><direction-type><dynamics><${ev.dyn}/></dynamics></direction-type></direction>`);
        if (ev.chord) { const h = harmonyXML(ev.chord, tr); if (h) x.push(h); }
        if (ev.full) { x.push(`      <note><rest measure="yes"/><duration>${m.ticks}</duration><voice>1</voice></note>`); continue; }
        const notes = ev.rest ? [null] : ev.notes;
        notes.forEach((n, ni) => {
          const o = ["      <note>"];
          if (ni > 0) o.push("<chord/>");
          o.push(n ? `<pitch><step>${n.step}</step>${n.alter ? `<alter>${n.alter}</alter>` : ""}<octave>${n.octave}</octave></pitch>` : "<rest/>");
          o.push(`<duration>${ev.ticks}</duration>`);
          if (n && ev.tiedFromPrev) o.push('<tie type="stop"/>');
          if (n && n.tie) o.push('<tie type="start"/>');
          o.push("<voice>1</voice>", `<type>${ev.type}</type>`, "<dot/>".repeat(ev.dots));
          if (n && n.showAcc) o.push(`<accidental${n.showAcc === "courtesy" ? ' parentheses="yes"' : ""}>${ACC[n.alter]}</accidental>`);
          if (ev.tuplet) o.push(`<time-modification><actual-notes>${ev.tuplet.n}</actual-notes><normal-notes>${ev.tuplet.of}</normal-notes></time-modification>`);
          if (ev.beam && ni === 0) o.push(`<beam number="1">${beamPos(m, ev)}</beam>`);
          const nots = [];
          if (n && ev.tiedFromPrev) nots.push('<tied type="stop"/>');
          if (n && n.tie) nots.push('<tied type="start"/>');
          if (ni === 0 && ev.tuplet?.first) nots.push('<tuplet type="start" bracket="yes"/>');
          if (ni === 0 && ev.tuplet?.last) nots.push('<tuplet type="stop"/>');
          const arts = (ev.artic || []).filter((a) => a !== "fermata");
          if (ni === 0 && arts.length) nots.push(`<articulations>${arts.map((a) => `<${a}/>`).join("")}</articulations>`);
          if (ni === 0 && (ev.artic || []).includes("fermata")) nots.push("<fermata/>");
          if (nots.length) o.push(`<notations>${nots.join("")}</notations>`);
          if (ni === 0 && ev.lyric) {
            const syl = syllOpen ? (ev.lyricHyphen ? "middle" : "end") : ev.lyricHyphen ? "begin" : "single";
            syllOpen = ev.lyricHyphen;
            o.push(`<lyric number="1"><syllabic>${syl}</syllabic><text>${xesc(ev.lyric)}</text></lyric>`);
          }
          o.push("</note>");
          x.push(o.join(""));
        });
      }
      x.push("    </measure>");
    });
    x.push("  </part>");
  });
  x.push("</score-partwise>", "");
  return x.filter((l) => l !== "").join("\n");
}
function beamPos(m, ev) {
  const same = m.events.filter((p) => p.beam === ev.beam), i = same.indexOf(ev);
  return i === 0 ? "begin" : i === same.length - 1 ? "end" : "continue";
}
// letter steps for a transposition in semitones (2 = a major 2nd = 1 step; 9 = a major 6th = 5)
const diatonicSteps = (semis) => { const s = Math.sign(semis), a = Math.abs(semis), oct = Math.floor(a / 12); return s * (oct * 7 + [0, 1, 1, 2, 2, 3, 3, 4, 5, 5, 6, 6][a % 12]); };
function harmonyXML(sym, tr) {
  const c = parseChord(sym); if (!c) return "";
  const root = c.root, kind = KIND[c.type] || "other", text = TYPE[c.type].sym;
  const step = (n) => `<root-step>${LETTERS[n.L]}</root-step>${n.a ? `<root-alter>${n.a}</root-alter>` : ""}`;
  void tr;
  return `      <harmony><root>${step(root)}</root><kind text="${xesc(text)}">${kind}</kind>${c.bass ? `<bass><bass-step>${LETTERS[c.bass.L]}</bass-step>${c.bass.a ? `<bass-alter>${c.bass.a}</bass-alter>` : ""}</bass>` : ""}</harmony>`;
}

// a small XML reader: elements with attributes, children and text (enough for MusicXML)
function parseXML(src) {
  const root = { name: "#root", attrs: {}, kids: [], text: "" }, stack = [root];
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[\s\S]*?>|<\/([\w:.-]+)\s*>|<([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  const unesc = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&amp;/g, "&");
  let m;
  while ((m = re.exec(src))) {
    const top = stack[stack.length - 1];
    if (m[1] !== undefined) top.text += m[1];
    else if (m[2]) { if (stack.length > 1) stack.pop(); }
    else if (m[3]) {
      const attrs = {}; const ar = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g; let a;
      while ((a = ar.exec(m[4] || ""))) attrs[a[1]] = unesc(a[2] ?? a[3]);
      const el = { name: m[3], attrs, kids: [], text: "" };
      top.kids.push(el);
      if (!m[5]) stack.push(el);
    } else if (m[6] !== undefined) top.text += unesc(m[6]);
  }
  return root;
}
const kid = (el, name) => el?.kids.find((k) => k.name === name) || null;
const kids = (el, name) => el?.kids.filter((k) => k.name === name) || [];
const txt = (el, name) => { const k = name ? kid(el, name) : el; return k ? k.text.trim() : ""; };
const KIND_BACK = Object.fromEntries(Object.entries(KIND).map(([id, k]) => [k, id]));
/**
 * Read MusicXML (partwise; what toMusicXML writes, and MuseScore, Finale and Sibelius files).
 * v1 keeps voice 1 of each part, the first time and key, and skips what the model can't hold.
 */
export function fromMusicXML(text) {
  const doc = parseXML(String(text)), sp = kid(doc, "score-partwise");
  if (!sp) throw new Error(kid(doc, "score-timewise") ? "Timewise MusicXML isn't supported yet; save it as partwise." : "This isn't a MusicXML score.");
  const score = newScore({ bars: 0, parts: [] });
  score.title = txt(kid(sp, "work"), "work-title") || txt(sp, "movement-title") || "Untitled";
  for (const c of kids(kid(sp, "identification"), "creator")) { if (c.attrs.type === "composer") score.composer = c.text.trim(); if (c.attrs.type === "lyricist") score.lyricist = c.text.trim(); }
  for (const c of kids(sp, "credit")) if (txt(c, "credit-type") === "subtitle") score.subtitle = txt(c, "credit-words");
  const names = new Map();
  for (const sp2 of kids(kid(sp, "part-list"), "score-part")) names.set(sp2.attrs.id, { name: txt(sp2, "part-name"), instrument: txt(kid(sp2, "score-instrument"), "instrument-name") });
  let first = true;
  for (const pel of kids(sp, "part")) {
    const nm = names.get(pel.attrs.id) || {}, part = newPart({ name: nm.name || "Part", instrument: nm.instrument || nm.name || "Piano" });
    const voice = part.voices[0];
    let div = 1, tr = 0, lastEvent = null, pendingChord = null, pendingDyn = null, writtenKeyFifths = 0;
    const measures = kids(pel, "measure");
    measures.forEach((mel, mi) => {
      let measureTicks = 0;
      for (const el of mel.kids) {
        if (el.name === "attributes") {
          if (kid(el, "divisions")) div = +txt(el, "divisions") || 1;
          const k = kid(el, "key"); if (k && kid(k, "fifths")) { writtenKeyFifths = +txt(k, "fifths"); if (first) score.mode = txt(k, "mode") === "minor" ? "minor" : "major"; }
          const t = kid(el, "time"); if (t && first && kid(t, "beats")) score.time = { n: +txt(t, "beats"), d: +txt(t, "beat-type") };
          const c = kid(el, "clef");
          if (c) { const s = txt(c, "sign"), l = +txt(c, "line"), o = +txt(c, "clef-octave-change") || 0; part.clef = s === "F" ? "bass" : s === "C" ? (l === 4 ? "tenor" : "alto") : s === "percussion" ? "percussion" : o === -1 ? "treble8vb" : "treble"; }
          const tp = kid(el, "transpose"); if (tp) { tr = -(+txt(tp, "chromatic") || 0) - 12 * (+txt(tp, "octave-change") || 0); part.transpose = tr; }
        } else if (el.name === "direction") {
          const met = kid(kid(el, "direction-type"), "metronome"), snd = kid(el, "sound");
          if (first && snd?.attrs.tempo) score.tempo = Math.round(+snd.attrs.tempo);
          else if (first && met && kid(met, "per-minute")) score.tempo = Math.round(+txt(met, "per-minute") * (txt(met, "beat-unit") === "half" ? 2 : txt(met, "beat-unit") === "eighth" ? 0.5 : 1) * (kid(met, "beat-unit-dot") ? 1.5 : 1));
          const dyn = kid(kid(el, "direction-type"), "dynamics"); if (dyn?.kids[0] && DYN_VEL[dyn.kids[0].name]) pendingDyn = dyn.kids[0].name;
        } else if (el.name === "harmony") {
          const r = kid(el, "root"), kd = kid(el, "kind"), b = kid(el, "bass");
          if (r) {
            const nameOf = (s, a) => s + (a > 0 ? "#".repeat(a) : "b".repeat(-a));
            const root = nameOf(txt(r, "root-step"), +txt(r, "root-alter") || 0), kindTxt = kd?.attrs.text;
            const id = KIND_BACK[txt(kd)] || null, suffix = kindTxt !== undefined ? kindTxt : id ? TYPE[id].sym : "";
            const sym = root + suffix + (b ? "/" + nameOf(txt(b, "bass-step"), +txt(b, "bass-alter") || 0) : "");
            pendingChord = parseChord(sym) ? sym : parseChord(root + (id ? TYPE[id].sym : "")) ? root + (id ? TYPE[id].sym : "") : root;
          }
        } else if (el.name === "backup") measureTicks -= +txt(el, "duration") * TPQ / div;
        else if (el.name === "forward") { const d = Math.round(+txt(el, "duration") * TPQ / div); if ((txt(el, "voice") || "1") === "1") { voice.push(newEvent(d)); measureTicks += d; } }
        else if (el.name === "note") {
          if (kid(el, "grace") || kid(el, "cue")) continue;
          if ((txt(el, "voice") || "1") !== "1") continue;
          const isChord = !!kid(el, "chord"), d = Math.round(+txt(el, "duration") * TPQ / div);
          const pitch = kid(el, "pitch"), rest = kid(el, "rest");
          let n = null;
          if (pitch) {
            const step = txt(pitch, "step"), alter = +txt(pitch, "alter") || 0, oct = +txt(pitch, "octave");
            n = { midi: midiOf(step, alter, oct) - tr, tie: kids(el, "tie").some((t) => t.attrs.type === "start"), spell: { step, alter }, written: true };
          }
          if (isChord && lastEvent && n) { lastEvent.notes.push(n); continue; }
          const ev = rest || !n ? newEvent(rest?.attrs.measure === "yes" && !d ? barTicks(score) : d) : { id: newId(), dur: d, rest: false, notes: [n] };
          const tm = kid(el, "time-modification");
          if (tm) ev.tuplet = { n: +txt(tm, "actual-notes"), of: +txt(tm, "normal-notes") };
          const lyr = kid(el, "lyric");
          if (lyr && txt(lyr, "text")) { ev.lyric = txt(lyr, "text"); const syl = txt(lyr, "syllabic"); if (syl === "begin" || syl === "middle") ev.lyricHyphen = true; }
          const nots = kid(el, "notations"), arts = kid(nots, "articulations");
          const artic = [...(arts?.kids || []).map((a) => a.name).filter((a) => ["staccato", "accent", "tenuto"].includes(a)), ...(kid(nots, "fermata") ? ["fermata"] : [])];
          if (artic.length) ev.artic = artic;
          if (pendingChord) { ev.chord = pendingChord; pendingChord = null; }
          if (pendingDyn) { ev.dyn = pendingDyn; pendingDyn = null; }
          voice.push(ev); lastEvent = ev; measureTicks += d;
        }
      }
      if (mi === 0 && mel.attrs.implicit === "yes" && first) score.pickup = measureTicks;
    });
    // the score's key is the concert key: undo the part's transposition
    if (first) score.key = writtenKey(writtenKeyFifths, -tr);
    score.parts.push(part);
    first = false;
  }
  if (!score.parts.length) score.parts.push(newPart());
  if (score.pickup >= barTicks(score)) score.pickup = 0;
  // keep a written spelling only where it differs from how the layout would spell it anyway
  const plain = { ...score, parts: score.parts.map((q) => ({ ...q, voices: [q.voices[0].map((e) => ({ ...e, notes: (e.notes || []).map((n) => ({ ...n, spell: null })) }))] })) };
  score.parts.forEach((p, pi) => {
    const lay = layout(plain, pi, { transposed: !!p.transpose });
    const byRef = new Map(); for (const m of lay) for (const ev of m.events) if (ev.ref >= 0 && !byRef.has(ev.ref)) byRef.set(ev.ref, ev);
    p.voices[0].forEach((e, ref) => {
      const l = byRef.get(ref);
      (e.notes || []).forEach((n) => {
        const got = l?.notes.find((x) => x.midi === n.midi + (p.transpose || 0));
        n.spell = got && n.spell && (got.step !== n.spell.step || got.alter !== n.spell.alter) && !p.transpose ? n.spell : null;
        delete n.written;
      });
      if (e.notes) e.notes.sort((a, b) => a.midi - b.midi);
    });
  });
  return score;
}

// ---------- MIDI files ----------

const PROGRAMS = [[/piano|keys/i, 0], [/voice|vocal|choir/i, 52], [/nylon|classical|requinto|guitalele/i, 24], [/12-string|acoustic|resonator|dobro/i, 25], [/steel|lap/i, 25], [/guitar/i, 25],
  [/upright|double bass/i, 32], [/bass(?! clarinet)/i, 33], [/violin|fiddle/i, 40], [/viola(?! da)/i, 41], [/cello|gamba/i, 42], [/harp/i, 46], [/timpani/i, 47], [/trumpet|cornet|flugel/i, 56],
  [/trombone|euphonium/i, 57], [/tuba/i, 58], [/horn|mellophone/i, 60], [/soprano sax/i, 64], [/alto sax/i, 65], [/tenor sax/i, 66], [/baritone sax/i, 67], [/oboe|english horn/i, 68],
  [/bassoon/i, 70], [/clarinet/i, 71], [/piccolo/i, 72], [/flute/i, 73], [/banjo/i, 105], [/shamisen/i, 106], [/koto/i, 107], [/kalimba/i, 108], [/mandolin|bouzouki|ukulele|uke|charango|cavaquinho|lute|oud/i, 25]];
export const programOf = (name) => (PROGRAMS.find(([re]) => re.test(name || "")) || [0, 0])[1];
const vlq = (n) => { const out = [n & 0x7f]; while ((n >>= 7)) out.unshift((n & 0x7f) | 0x80); return out; };
const str = (s) => [...new TextEncoder().encode(s)];
function chunk(id, bytes) { return [...str(id), (bytes.length >>> 24) & 255, (bytes.length >>> 16) & 255, (bytes.length >>> 8) & 255, bytes.length & 255, ...bytes]; }
/** A Standard MIDI File (type 1): a tempo track, then one track per part on its own channel */
export function toMidiFile(score) {
  const spt = 60 / (score.tempo * TPQ), tracks = [];
  const meta = (type, data) => [0xff, type, ...vlq(data.length), ...data];
  const usPerQ = Math.round(60e6 / score.tempo);
  const t0 = [0, ...meta(0x03, str(score.title || "Untitled")), 0, ...meta(0x51, [(usPerQ >> 16) & 255, (usPerQ >> 8) & 255, usPerQ & 255]),
    0, ...meta(0x58, [score.time.n, Math.log2(score.time.d), 24 * 4 / score.time.d * (isCompound(score.time) ? 3 : 1), 8]),
    0, ...meta(0x59, [score.key & 255, score.mode === "minor" ? 1 : 0]), 0, 0xff, 0x2f, 0];
  tracks.push(t0);
  const sounds = playbackEvents(score);
  score.parts.forEach((p, pi) => {
    const ch = pi >= 9 ? pi + 1 : pi, evs = [];
    for (const s of sounds.filter((x) => x.part === pi)) {
      const on = Math.round(s.time / spt), off = Math.max(on + 1, Math.round((s.time + s.dur) / spt));
      evs.push([on, 1, [0x90 | ch, s.midi & 127, s.vel & 127]], [off, 0, [0x80 | ch, s.midi & 127, 0]]);
    }
    evs.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const out = [0, ...meta(0x03, str(p.name || `Part ${pi + 1}`)), 0, 0xc0 | ch, programOf(p.instrument) & 127];
    let last = 0;
    for (const [t, , bytes] of evs) { out.push(...vlq(t - last), ...bytes); last = t; }
    out.push(0, 0xff, 0x2f, 0);
    tracks.push(out);
  });
  const head = chunk("MThd", [0, 1, 0, tracks.length, (TPQ >> 8) & 255, TPQ & 255]);
  return Uint8Array.from([...head, ...tracks.flatMap((t) => chunk("MTrk", t))]);
}
/** Read a MIDI file's notes back (for tests, and later for importing): { division, tracks: [{ name, notes: [{ midi, tick, dur, vel, ch }] }], tempo, time, key } */
export function readMidiFile(bytes) {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const s4 = (o) => String.fromCharCode(u[o], u[o + 1], u[o + 2], u[o + 3]), be32 = (o) => ((u[o] << 24) | (u[o + 1] << 16) | (u[o + 2] << 8) | u[o + 3]) >>> 0;
  if (s4(0) !== "MThd") throw new Error("Not a MIDI file.");
  const format = (u[8] << 8) | u[9], ntr = (u[10] << 8) | u[11], division = (u[12] << 8) | u[13];
  const out = { format, division, tracks: [], tempo: 120, time: null, key: null };
  let p = 8 + be32(4);
  for (let tn = 0; tn < ntr && p < u.length; tn++) {
    if (s4(p) !== "MTrk") throw new Error("Bad track.");
    const len = be32(p + 4), end = p + 8 + len; let q = p + 8, t = 0, run = 0;
    const tr = { name: "", notes: [], program: null }, open = new Map();
    const rv = () => { let v = 0, b; do { b = u[q++]; v = (v << 7) | (b & 0x7f); } while (b & 0x80); return v; };
    while (q < end) {
      t += rv();
      let st = u[q];
      if (st < 0x80) st = run; else q++;
      if (st === 0xff) { const type = u[q++], l = rv(), d = u.subarray(q, q + l); q += l;
        if (type === 0x03) tr.name = new TextDecoder().decode(d); if (type === 0x51) out.tempo = Math.round(60e6 / ((d[0] << 16) | (d[1] << 8) | d[2]));
        if (type === 0x58) out.time = { n: d[0], d: 2 ** d[1] }; if (type === 0x59) out.key = { fifths: d[0] > 127 ? d[0] - 256 : d[0], minor: !!d[1] }; continue; }
      if (st === 0xf0 || st === 0xf7) { q += rv(); continue; }
      run = st;
      const kind = st & 0xf0, ch = st & 15, a = u[q++], b = kind === 0xc0 || kind === 0xd0 ? 0 : u[q++];
      if (kind === 0xc0) tr.program = a;
      if (kind === 0x90 && b > 0) open.set(ch * 128 + a, { midi: a, tick: t, vel: b, ch });
      else if (kind === 0x80 || (kind === 0x90 && b === 0)) { const n = open.get(ch * 128 + a); if (n) { n.dur = t - n.tick; tr.notes.push(n); open.delete(ch * 128 + a); } }
    }
    tr.notes.sort((x, y) => x.tick - y.tick || x.midi - y.midi);
    out.tracks.push(tr); p = end;
  }
  return out;
}
