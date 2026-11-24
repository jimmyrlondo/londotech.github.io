// ENCORE. Compose: the music, with no page in it (test-compose.mjs). The score model is
// in COMPOSE-MODEL.md. This file turns that model into engraved measures (notatable values,
// ties, beams, tuplets, accidentals by the measure), reads a MIDI keyboard take into notes
// (quantize), edits, transposes, plays repeats and jumps in order, and reads and writes
// MusicXML and MIDI files. v2: several parts, grand staves, up to four voices, spans
// (slurs, hairpins, octave lines, pedal) and bar marks (key, time and tempo changes,
// repeats, endings, D.C./D.S./Coda/Fine, rehearsal marks).
import { parseChord, chordSymbol, TYPE } from "./chords-core.js";
import { notationOf, stringsOf, tabVoice, capoOf, tuningByOpens, tabClef } from "./compose-tab.js";

export const TPQ = 480;
const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
const mod = (n, m) => ((n % m) + m) % m;
let idSeq = 0;
export const newId = (p = "e") => `${p}${Date.now().toString(36)}${(idSeq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const clone = (o) => JSON.parse(JSON.stringify(o));

// ---------- the score ----------

const fullBar = (time) => time.n * (1920 / time.d);
/** A bar's length: the opening time signature's (v1), or bar i's own, following time changes and the pickup */
export function barTicks(score, barIndex) {
  if (barIndex === undefined) return fullBar(score.time);
  const at = Object.keys(score.bars || {}).map(Number).filter((k) => k <= barIndex && score.bars[k].time).sort((a, b) => a - b);
  const full = fullBar(at.length ? score.bars[at[at.length - 1]].time : score.time);
  return barIndex === 0 && score.pickup > 0 && score.pickup < full ? score.pickup : full;
}
export function newScore(opts = {}) {
  const now = Date.now();
  const s = {
    v: 2, id: newId("c"), title: opts.title ?? "Untitled", subtitle: "", composer: opts.composer ?? "", lyricist: "",
    tempo: opts.tempo ?? 100, time: opts.time ?? { n: 4, d: 4 }, key: opts.key ?? 0, mode: opts.mode ?? "major", pickup: opts.pickup ?? 0,
    parts: opts.parts ?? [newPart(opts.part)], bars: {}, spans: [], created: now, updated: now,
  };
  return opts.bars === 0 ? s : fillRests(s, { bars: opts.bars ?? 4 });
}
/** A part: one staff, or a grand staff (staves 2, clefs [top, bottom]) for piano, harp, organ */
export function newPart(o = {}) {
  const staves = o.staves === 2 ? 2 : 1;
  const clefs = staves === 2 ? (o.clefs?.length === 2 ? [...o.clefs] : [o.clef ?? "treble", "bass"]) : [o.clefs?.[0] ?? o.clef ?? "treble"];
  return { id: newId("p"), name: o.name ?? "Melody", instrument: o.instrument ?? "Piano", clef: clefs[0], clefs, staves, transpose: o.transpose ?? 0,
    voices: staves === 2 ? [[], [], []] : [[]], voiceStaff: staves === 2 ? [0, 0, 1, 1] : [0, 0, 0, 0], mute: false, solo: false, volume: 0.8 };
}
// a part's staves, clefs and which staff each voice sits on (v1 parts have none of these set)
const stavesOf = (p) => (p.staves === 2 ? 2 : 1);
// one staff: part.clef is the clef (v1 pages set only that); a grand staff: part.clefs
const clefsOf = (p) => (stavesOf(p) === 2 ? (p.clefs?.length === 2 ? p.clefs : [p.clef || "treble", "bass"]) : [p.clef || p.clefs?.[0] || "treble"]);
const staffOfVoice = (p, v) => (stavesOf(p) === 1 ? 0 : p.voiceStaff?.[v] ?? (v >= 2 ? 1 : 0));
/** A v1 score (or anything partial) as a full v2 score: bars, spans, staves, clefs, voice staves, mixer settings */
export function upgrade(score) {
  const s = clone(score);
  s.v = 2; s.bars ||= {}; s.spans ||= [];
  for (const p of s.parts) {
    p.staves = stavesOf(p); p.clefs = [...clefsOf(p)]; p.clef = p.clefs[0];
    p.voiceStaff = [0, 1, 2, 3].map((v) => staffOfVoice(p, v));
    if (!p.voices?.length) p.voices = [[]];
    if (p.staves === 2 && !p.voices.some((v, i) => p.voiceStaff[i] === 1)) while (p.voices.length < 3) p.voices.push([]);
    p.mute ??= false; p.solo ??= false; p.volume ??= 0.8;
  }
  return s;
}
export const addPart = (score, part) => { const s = clone(score); s.parts.push(part); return touch(s); };
export function removePart(score, index) {
  const s = clone(score); s.parts.splice(index, 1);
  s.spans = (s.spans || []).filter((x) => x.part !== index).map((x) => (x.part > index ? { ...x, part: x.part - 1 } : x));
  if (!s.parts.length) s.parts.push(newPart());
  return touch(s);
}
export function movePart(score, index, to) {
  const s = clone(score), [p] = s.parts.splice(index, 1); s.parts.splice(to, 0, p);
  const order = score.parts.map((_, i) => i); const [x] = order.splice(index, 1); order.splice(to, 0, x); // order[newIndex] = oldIndex
  s.spans = (s.spans || []).map((sp) => ({ ...sp, part: order.indexOf(sp.part) }));
  return touch(s);
}

// ---------- bars: lengths, keys, times and tempos as they change, and the marks on them ----------

const MARKS = ["repeatStart", "repeatEnd", "volta", "voltaBars", "barline", "mark", "nav", "text", "clefs"];
const sameTime = (a, b) => a.n === b.n && a.d === b.d && String(a.groups || "") === String(b.groups || "");
/**
 * Every bar of the piece, bar for bar the same for all parts:
 * [{ index, number, start, ticks, full, pickup, key, mode, time, tempo, keyChange, timeChange, tempoChange, ...marks }]
 * full: the time signature's whole bar (a pickup's ticks are less). opts.bars: at least this many bars.
 */
export function barInfo(score, opts = {}) {
  const marks = score.bars || {};
  let end = 0;
  for (const p of score.parts) for (const v of p.voices) end = Math.max(end, voiceLength(v));
  const markMax = Object.keys(marks).reduce((a, k) => Math.max(a, +k + 1), 0), least = Math.max(1, opts.bars || 0, markMax);
  const out = [];
  let key = score.key, mode = score.mode, time = score.time, tempo = score.tempo, start = 0;
  for (let i = 0; i < 100000; i++) {
    if (i >= least && start >= end) break;
    const mk = marks[i] || {}, pk = key, pt = time, pte = tempo;
    if (mk.key !== undefined) key = mk.key;
    if (mk.mode) mode = mk.mode;
    if (mk.time) time = mk.time;
    if (mk.tempo) tempo = mk.tempo;
    const full = fullBar(time), pickup = i === 0 && score.pickup > 0 && score.pickup < full, ticks = pickup ? score.pickup : full;
    const b = { index: i, number: score.pickup > 0 && score.pickup < fullBar(score.time) ? i : i + 1, start, ticks, full, pickup, key, mode, time, tempo,
      keyChange: i > 0 && key !== pk, timeChange: i > 0 && !sameTime(time, pt), tempoChange: i > 0 && tempo !== pte };
    for (const k of MARKS) if (mk[k] !== undefined && mk[k] !== null) b[k] = mk[k];
    out.push(b);
    start += ticks;
  }
  return out;
}
const barIndexAt = (bars, t) => { let lo = 0, hi = bars.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (bars[m].start <= t) lo = m; else hi = m - 1; } return lo; };
/** Set marks on a bar (a patch; null deletes a key). An emptied bar is removed. */
export function setBar(score, barIndex, patch) {
  const s = clone(score); s.bars ||= {};
  const b = { ...(s.bars[barIndex] || {}) };
  for (const [k, v] of Object.entries(patch)) { if (v === null || v === undefined) delete b[k]; else b[k] = v; }
  if (Object.keys(b).length) s.bars[barIndex] = b; else delete s.bars[barIndex];
  return touch(s);
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

// ---------- layout: each voice as engraved measures ----------

/**
 * Measures for one voice of one part, ready to draw:
 * [{ index, number, start, ticks, pickup, voice, staff, key, time, stem, events: [piece] }] where each piece is
 * { ref, start, pos, ticks, written, type, dots, rest, full, filler, slash, notes: [{ midi, step, alter, octave, tie, showAcc }],
 *   chord, lyric, lyricHyphen, artic, dyn, tuplet: { id, n, of, first, last } | null, tiedFromPrev, beam: id | null, spans: [] }
 * start: ticks from the top of the piece; pos: within the bar. midi/step are written pitch when opts.transposed.
 * Bars follow barInfo (time and key changes), so every part and voice lines up bar for bar.
 * opts: { transposed: false, courtesy: false, voice: 0, bars: minimum number of bars }
 */
export function layout(score, partIndex = 0, opts = {}) {
  return layoutVoice(score, partIndex, opts.voice || 0, barInfo(score, { bars: opts.bars }), opts, true);
}
/**
 * The whole score laid out: { bars: barInfo, parts: [{ index, name, instrument, transpose, staves: [{ clef, voices: [measures] }] }] }.
 * Each staff lists its voices (the first one always, with bar rests; the others only in bars where they have music:
 * events [] elsewhere). measure.stem is "up" / "down" where two voices on a staff both have notes in that bar, else null.
 */
export function layoutScore(score, opts = {}) {
  const bars = barInfo(score, { bars: opts.bars });
  const parts = score.parts.map((p, pi) => {
    const staves = clefsOf(p).map((clef, st) => {
      let vs = p.voices.map((_, v) => v).filter((v) => staffOfVoice(p, v) === st);
      if (!vs.length) vs = [[0, 1, 2, 3].find((v) => staffOfVoice(p, v) === st) ?? st * 2];
      const voices = vs.map((v, k) => layoutVoice(score, pi, v, bars, opts, k === 0));
      for (let i = 0; i < bars.length; i++) {
        const sounding = voices.filter((ms) => ms[i].events.some((e) => !e.rest));
        if (sounding.length >= 2) sounding.forEach((ms, k) => (ms[i].stem = k === 0 ? "up" : "down"));
      }
      return { clef, voices };
    });
    return { index: pi, name: p.name, instrument: p.instrument, transpose: p.transpose || 0, staves };
  });
  return { bars, parts };
}
// primary: the first voice on its staff, which shows bar rests where it has nothing
function layoutVoice(score, partIndex, vi, bars, opts, primary) {
  const part = score.parts[partIndex], voice = part.voices[vi] || [];
  const shift = opts.transposed ? part.transpose || 0 : 0;
  // the clef in each bar: the staff's own, then any change set on a bar (bars[i].clefs["part:staff"])
  const staffNo = staffOfVoice(part, vi), clefKey = `${partIndex}:${staffNo}`;
  let clefNow = clefsOf(part)[staffNo] || "treble";
  const measures = bars.map((b) => {
    const nc = b.clefs?.[clefKey], change = !!nc && nc !== clefNow && b.index > 0;
    if (nc) clefNow = nc;
    return { index: b.index, number: b.number, start: b.start, ticks: b.ticks, pickup: b.pickup, voice: vi, staff: staffNo,
      key: shift ? writtenKey(b.key, shift) : b.key, time: b.time, clef: clefNow, clefChange: change, stem: null, events: [] };
  });
  // a pickup is the end of a bar, so its beats are counted from where it would sit
  const offOf = (m) => (m.pickup ? bars[m.index].full - m.ticks : 0);
  const barAt = (t) => barIndexAt(bars, t);
  // tuplet groups: consecutive events with the same ratio, closed when their written total makes n notes of the unit
  // (with no unit: n of one plain value). Nested tuplets: the outer groups first, then the inner ones inside each.
  const tupletOf = new Map(), outerOf = new Map(); let tid = 0;
  const sig = (t) => (t ? `${t.n}:${t.of}:${t.unit || ""}` : "");
  const groupRuns = (get, writtenOf, into, sameOuter) => {
    for (let i = 0; i < voice.length; i++) {
      const tu = get(voice[i]); if (!tu) continue;
      const ids = [i]; let written = writtenOf(voice[i]), minW = written;
      for (let j = i + 1; ; j++) {
        if (tu.unit) { if (written >= tu.n * tu.unit - 0.5) break; }
        else { const base = written / tu.n; if (TYPE_TICKS[valueOf(base)?.type] === base && written >= tu.n * Math.min(minW, base)) break; }
        const e = voice[j], t2 = e && get(e); if (!t2 || sig(t2) !== sig(tu) || (sameOuter && !sameOuter(i, j))) break;
        ids.push(j); const w = writtenOf(e); written += w; minW = Math.min(minW, w);
      }
      const id = ++tid;
      ids.forEach((k, x) => into.set(k, { id, n: tu.n, of: tu.of, first: x === 0, last: x === ids.length - 1 }));
      i = ids[ids.length - 1];
    }
  };
  // nested: a run of events at one outer ratio (each either nested inside it, or a plain note of it), holding at least one
  // nested event, is an outer group; its plain notes are the outer level itself
  const outerLevel = new Set();
  for (let i = 0; i < voice.length; i++) {
    const e0 = voice[i], X = e0.tuplet?.outer || e0.tuplet; if (!X) continue;
    const key = sig(X), at = (e) => (e?.tuplet?.outer && sig(e.tuplet.outer) === key ? "in" : e?.tuplet && !e.tuplet.outer && sig(e.tuplet) === key ? "plain" : null);
    const ids = []; let written = 0;
    for (let j = i; j < voice.length && at(voice[j]); j++) {
      ids.push(j); written += (voice[j].dur * X.n) / X.of;
      if (X.unit ? written >= X.n * X.unit - 0.5 : false) break;
    }
    if (!ids.some((k) => at(voice[k]) === "in")) continue;
    const id = ++tid;
    ids.forEach((k, x) => { outerOf.set(k, { id, n: X.n, of: X.of, first: x === 0, last: x === ids.length - 1 }); if (at(voice[k]) === "plain") outerLevel.add(k); });
    i = ids[ids.length - 1];
  }
  groupRuns((e) => e.tuplet, (e) => e.dur * tupletScale(e.tuplet), tupletOf, (a, b) => outerOf.get(a)?.id === outerOf.get(b)?.id && !outerLevel.has(a) === !outerLevel.has(b));
  // a plain note of an outer group is drawn as that group (its own level), the nested ones carry the outer bracket
  for (const [k, t] of tupletOf) t.outer = outerLevel.has(k) ? null : outerOf.get(k) || null;
  for (const k of outerLevel) tupletOf.set(k, { ...outerOf.get(k), outer: null });
  // events cut at barlines and into written values
  let t = 0;
  voice.forEach((e, ref) => {
    const end = t + e.dur;
    if (e.tuplet) {
      const sc = tupletScale(e.tuplet), w = Math.round(e.dur * sc), parts = valueOf(w) ? [valueOf(w)] : durationParts(w);
      let s = t;
      parts.forEach((v, k) => {
        const ticks = v.ticks / sc, m = measures[barAt(s)];
        m.events.push(piece(e, ref, s, s - m.start, ticks, v, k > 0, k < parts.length - 1, tupletOf.get(ref)));
        s += ticks;
      });
    } else {
      let s = t, first = true;
      while (s < end) {
        const m = measures[barAt(s)], mEnd = m.start + m.ticks, segEnd = Math.min(end, mEnd), off = offOf(m);
        const pieces = mEnd <= s ? [] : splitNotation(s - m.start + off, segEnd - m.start + off, m.time, e.rest);
        if (!pieces.length) break;
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
  // the rest of a bar the voice doesn't fill is rest (the first voice on a staff: every bar; others: only bars they play in)
  for (const m of measures) {
    const used = m.events.reduce((a, p) => a + p.ticks, 0);
    if (used < m.ticks && (primary || m.events.length)) {
      const off = offOf(m);
      for (const v of splitNotation(used + off, m.ticks + off, m.time, true)) m.events.push({ ref: -1, start: m.start + v.start - off, pos: v.start - off, ticks: v.ticks, written: v.ticks, type: v.type, dots: v.dots, rest: true, full: false, notes: [], chord: null, lyric: null, lyricHyphen: false, artic: [], dyn: null, tuplet: null, tiedFromPrev: false, beam: null, filler: true, slash: false, spans: [] });
    }
    // a bar of nothing but rest is one whole-bar rest (unless later rests carry chords or slashes, as on a lead sheet)
    if (m.events.length && m.events.every((p) => p.rest) && !m.pickup && !m.events.some((p) => p.slash) && m.events.slice(1).every((p) => !p.chord && !p.lyric)) {
      const firstRef = m.events.find((p) => p.ref >= 0)?.ref ?? -1, f = m.events[0];
      m.events = [{ ref: firstRef, start: m.start, pos: 0, ticks: m.ticks, written: m.ticks, type: "whole", dots: 0, rest: true, full: true, notes: [], chord: f.chord || null, lyric: null, lyricHyphen: false, artic: [], dyn: f.dyn || null, tuplet: null, tiedFromPrev: false, beam: null, filler: firstRef < 0, slash: false, spans: [] }];
    }
  }
  // pitches: spelled in each bar's key, with the direction of the line for notes outside it
  const flat = []; for (const m of measures) for (const p of m.events) flat.push([p, m.key]);
  const line = flat.filter(([p]) => !p.rest).map(([p]) => p.notes[p.notes.length - 1].midi);
  let li = 0, last = new Map(), lastKey = null; // a repeated note keeps the spelling it just had
  for (const [p, key] of flat) {
    if (p.rest) continue;
    if (key !== lastKey) { last = new Map(); lastKey = key; }
    const prev = line[li - 1], next = line[li + 1], cur = line[li++];
    const dir = prev !== undefined && next !== undefined && Math.sign(cur - prev) === Math.sign(next - cur) ? Math.sign(next - cur) : prev !== undefined ? Math.sign(cur - prev) : 0;
    const now = new Map();
    p.notes = p.notes.map((n) => {
      const ov = n.spell && shift ? null : n.spell; // an override is for concert pitch; written pitch spells itself
      const m = n.midi + shift, sp = ov || !last.has(m) || (dir && !p.tiedFromPrev && prev !== cur) ? spell(m, key, ov, dir, score.mode) : last.get(m);
      now.set(m, sp);
      const extra = {}; for (const k of ["finger", "head", "harm"]) if (n[k] !== undefined) extra[k] = n[k];
      return { midi: m, ...sp, tie: n.tie, showAcc: false, ...extra };
    });
    // grace notes: spelled in the key, leaning towards the note they lead into
    if (p.graces) for (const gr of p.graces) gr.notes = gr.notes.map((n) => { const gm = n.midi + shift; return { midi: gm, ...spell(gm, key, null, Math.sign(cur - gm) || 0, score.mode), showAcc: false }; });
    last = now;
  }
  // accidentals by the measure: the key signature, then whatever an earlier note in the bar set (by staff position)
  let prevBar = new Map(), prevKey = null;
  for (const m of measures) {
    if (m.key !== prevKey) { prevBar = new Map(); prevKey = m.key; } // a new key signature restates everything
    const now = new Map();
    for (const p of m.events) {
      // grace notes come first and set accidentals like any other note
      if (p.graces) for (const gr of p.graces) for (const n of gr.notes) {
        const k = n.step + n.octave, cur = now.has(k) ? now.get(k) : keyAlter(LETTERS.indexOf(n.step), m.key);
        if (n.alter !== cur) n.showAcc = true;
        now.set(k, n.alter);
      }
      for (const n of p.notes) {
        const k = n.step + n.octave, sig = keyAlter(LETTERS.indexOf(n.step), m.key);
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
  if (shift) for (const m of measures) for (const e of m.events) if (e.chord) e.chord = transposeChordSymbol(e.chord, shift, m.key);
  // beams: eighths and shorter, grouped by beat (by the half bar in 4/4 when it's all eighths), broken by rests
  for (const m of measures) beamMeasure(m, m.time, offOf(m));
  // spans: marked on the first piece of the event they start on and the last piece of the one they end on
  const spans = (score.spans || []).filter((sp) => (sp.part ?? 0) === partIndex && (sp.voice ?? 0) === vi);
  if (spans.length) {
    const firstOf = new Map(), lastOf = new Map();
    for (const m of measures) for (const p of m.events) if (p.ref >= 0) { if (!firstOf.has(p.ref)) firstOf.set(p.ref, p); lastOf.set(p.ref, p); }
    const idx = new Map(voice.map((e, i) => [e.id, i]));
    for (const sp of spans) {
      let a = idx.get(sp.from), b = idx.get(sp.to);
      if (a === undefined || b === undefined) continue;
      if (a > b) [a, b] = [b, a];
      const ps = firstOf.get(a), pe = lastOf.get(b);
      if (!ps || !pe) continue;
      if (ps === pe) ps.spans.push({ id: sp.id, type: sp.type, start: true, end: true });
      else { ps.spans.push({ id: sp.id, type: sp.type, start: true, end: false }); pe.spans.push({ id: sp.id, type: sp.type, start: false, end: true }); }
    }
  }
  return measures;
}
// written length over sounding length for a tuplet (and its outer tuplet when nested)
export const tupletScale = (t) => (t ? (t.n / t.of) * (t.outer ? t.outer.n / t.outer.of : 1) : 1);
// the v3 marks a piece carries: grace notes, ornament, arpeggio and technique on the first piece of an event,
// tremolo on every piece (it's how each piece is played)
function v3Fields(e, tiedFromPrev) {
  const o = {};
  if (!tiedFromPrev) {
    if (e.graces?.length) o.graces = e.graces.map((g) => ({ slash: g.slash !== false, notes: (g.notes || []).map((n) => ({ midi: n.midi })) }));
    if (e.orn) { o.orn = e.orn; if (e.ornAcc !== undefined && e.ornAcc !== null) o.ornAcc = e.ornAcc; }
    if (e.arp) { o.arp = true; if (e.arpDir) o.arpDir = e.arpDir; }
    if (e.tech) o.tech = e.tech;
  }
  if (e.trem) o.trem = e.trem;
  return o;
}
function piece(e, ref, start, pos, ticks, v, tiedFromPrev, tiedOn, tuplet = null) {
  return { ref, start, pos, ticks, written: v.ticks, type: v.type, dots: v.dots, rest: !!e.rest, full: false, filler: false, slash: !!(e.rest && e.slash),
    notes: e.rest ? [] : e.notes.map((n) => ({ midi: n.midi, spell: n.spell || null, tie: tiedOn || !!n.tie, ...(n.finger && !tiedFromPrev ? { finger: String(n.finger) } : {}), ...(n.head && n.head !== "normal" ? { head: n.head } : {}), ...(n.harm ? { harm: true } : {}) })),
    chord: tiedFromPrev ? null : e.chord || null, lyric: tiedFromPrev ? null : e.lyric || null, lyricHyphen: !tiedFromPrev && !!e.lyricHyphen,
    artic: tiedFromPrev ? [] : e.artic || [], dyn: tiedFromPrev ? null : e.dyn || null,
    tuplet: tuplet && { ...tuplet, first: tuplet.first && !tiedFromPrev, last: tuplet.last && !tiedOn, outer: tuplet.outer ? { ...tuplet.outer, first: tuplet.outer.first && tuplet.first && !tiedFromPrev, last: tuplet.outer.last && tuplet.last && !tiedOn } : null },
    tiedFromPrev, beam: null, spans: [], ...v3Fields(e, tiedFromPrev) };
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
    const unit = p.tuplet ? `t${p.tuplet.outer?.id ?? p.tuplet.id}` : unitOf(p.pos + offset);
    if (!beamable(p) || unit !== runUnit) close();
    if (beamable(p)) { run.push(p); runUnit = unit; }
  }
  close();
}

// ---------- editing (each returns a new score; the old one is untouched, for undo) ----------

const touch = (s) => { s.updated = Date.now(); return s; };
const voiceOf = (s, pi, vi) => { const p = s.parts[pi]; while (p.voices.length <= vi) p.voices.push([]); return p.voices[vi]; };
// spans whose ends are gone (deleted or overwritten events) go with them
function dropLooseSpans(s) {
  if (!s.spans?.length) return s;
  s.spans = s.spans.filter((sp) => { const v = s.parts[sp.part ?? 0]?.voices[sp.voice ?? 0]; return v && v.some((e) => e.id === sp.from) && v.some((e) => e.id === sp.to); });
  return s;
}
export function insertAt(score, partIndex, index, event, voiceIndex = 0) { const s = clone(score); voiceOf(s, partIndex, voiceIndex).splice(index, 0, event); return touch(s); }
export function replaceAt(score, partIndex, index, event, voiceIndex = 0) { const s = clone(score); voiceOf(s, partIndex, voiceIndex)[index] = event; return touch(dropLooseSpans(s)); }
export function deleteAt(score, partIndex, index, voiceIndex = 0) { const s = clone(score); voiceOf(s, partIndex, voiceIndex).splice(index, 1); return touch(dropLooseSpans(s)); }
/** Change one note of an event (noteIndex), or add one (noteIndex = -1); a rest becomes a note */
export function setPitch(score, partIndex, index, noteIndex, midi, voiceIndex = 0) {
  const s = clone(score), e = voiceOf(s, partIndex, voiceIndex)[index];
  if (!e) return score;
  if (e.rest || noteIndex < 0) { if (e.rest) e.notes = []; e.rest = false; delete e.slash; e.notes.push({ midi, tie: false, spell: null }); }
  else if (e.notes[noteIndex]) e.notes[noteIndex] = { ...e.notes[noteIndex], midi, spell: null };
  e.notes.sort((a, b) => a.midi - b.midi);
  return touch(s);
}
/** The event sounding at a tick: { index, start } (or the end of the voice) */
export function eventAt(score, partIndex, tick, voiceIndex = 0) {
  const v = score.parts[partIndex].voices[voiceIndex] || []; let t = 0;
  for (let i = 0; i < v.length; i++) { if (tick < t + v[i].dur) return { index: i, start: t }; t += v[i].dur; }
  return { index: v.length, start: t };
}
/**
 * Write events into a voice at a tick. mode "insert": what follows moves later (a note cut by the tick is split, the
 * second half sounding again after the new music). mode "overwrite": exactly that much time is replaced, so other parts
 * and voices stay lined up; a note cut at the start keeps its first half (its tie into the new music is dropped), a note
 * cut at the end leaves rest for the rest of its length. A voice shorter than the tick is padded with rest.
 */
export function writeAt(score, partIndex, voiceIndex, tick, events, mode = "insert") {
  const s = clone(score), v = voiceOf(s, partIndex, voiceIndex);
  const evs = clone(events).map((e) => ({ ...e, id: e.id || newId() }));
  let len = voiceLength(v);
  if (tick > len) { v.push(newEvent(tick - len)); len = tick; }
  // an event boundary at t (splitting the event there): { index, split, rest of the cut event as its own event }
  const cut = (t) => {
    let acc = 0;
    for (let i = 0; i < v.length; i++) {
      const e = v[i];
      if (acc === t) return { index: i, split: false };
      if (t < acc + e.dur) {
        const left = { ...clone(e), dur: t - acc }, right = { ...clone(e), id: newId(), dur: acc + e.dur - t };
        // the attack's markings stay with the first half
        delete right.chord; delete right.lyric; delete right.lyricHyphen; delete right.dyn; right.artic = [];
        if (!e.rest) left.notes.forEach((n) => (n.tie = false));
        v.splice(i, 1, left, right);
        return { index: i + 1, split: true };
      }
      acc += e.dur;
    }
    return { index: v.length, split: false };
  };
  if (mode === "overwrite") {
    const total = evs.reduce((a, e) => a + e.dur, 0), end = tick + total;
    if (end > len) v.push(newEvent(end - len));
    const a = cut(tick), b = cut(end);
    // the tail of a note whose start is overwritten is silence now
    if (b.split && v[b.index] && !v[b.index].rest) Object.assign(v[b.index], { rest: true, notes: [] });
    const prev = v[a.index - 1]; if (prev && !prev.rest) prev.notes.forEach((n) => (n.tie = false));
    v.splice(a.index, b.index - a.index, ...evs);
  } else {
    const a = cut(tick);
    v.splice(a.index, 0, ...evs);
  }
  return touch(dropLooseSpans(s));
}
/** Copies of events from..to (inclusive) with new ids, ready to paste; the last one no longer ties out of the range */
export function copyRange(score, partIndex, voiceIndex, from, to) {
  const v = score.parts[partIndex].voices[voiceIndex] || [], [a, b] = from <= to ? [from, to] : [to, from];
  const out = clone(v.slice(a, b + 1)).map((e) => ({ ...e, id: newId() }));
  const last = out[out.length - 1]; if (last && !last.rest) last.notes.forEach((n) => (n.tie = false));
  return out;
}
/** Paste events before event `index` (at the end when index is the voice's length) */
export function pasteAt(score, partIndex, voiceIndex, index, events, mode = "insert") {
  const v = score.parts[partIndex].voices[voiceIndex] || [], st = eventStarts(v);
  const tick = index < st.length ? st[index] : voiceLength(v);
  return writeAt(score, partIndex, voiceIndex, tick, events.map((e) => ({ ...clone(e), id: newId() })), mode);
}
/** Delete events from..to (inclusive): "insert" closes the gap, "overwrite" leaves rest so everything after stays put */
export function deleteRange(score, partIndex, voiceIndex, from, to, mode = "insert") {
  const s = clone(score), v = voiceOf(s, partIndex, voiceIndex), [a, b] = from <= to ? [from, to] : [to, from];
  const gone = v.slice(a, b + 1), total = gone.reduce((x, e) => x + e.dur, 0);
  const prev = v[a - 1]; if (prev && !prev.rest) prev.notes.forEach((n) => (n.tie = false));
  v.splice(a, gone.length, ...(mode === "overwrite" && total ? [newEvent(total)] : []));
  return touch(dropLooseSpans(s));
}
/** Every note in events from..to (inclusive) up or down, chord symbols with them */
export function transposeRange(score, partIndex, voiceIndex, from, to, semis) {
  const s = clone(score), v = voiceOf(s, partIndex, voiceIndex), [a, b] = from <= to ? [from, to] : [to, from];
  for (let i = a; i <= b && i < v.length; i++) {
    const e = v[i];
    for (const n of e.notes || []) { n.midi = Math.max(0, Math.min(127, n.midi + semis)); n.spell = null; }
    if (e.chord) e.chord = transposeChordSymbol(e.chord, semis, s.key);
  }
  return touch(s);
}
/** A slur, hairpin (cresc / dim), octave line (8va / 8vb) or pedal from one event to another in the same voice */
export function addSpan(score, span) {
  const s = clone(score); s.spans ||= [];
  s.spans.push({ id: span.id || newId("s"), type: span.type, part: span.part ?? 0, voice: span.voice ?? 0, from: span.from, to: span.to });
  return touch(s);
}
export const removeSpan = (score, id) => { const s = clone(score); s.spans = (s.spans || []).filter((x) => x.id !== id); return touch(s); };
/** Every voice padded with rests to the end of its bar (and to at least opts.bars bars, a pickup counting as one) */
export function fillRests(score, opts = {}) {
  const s = clone(score), bars = barInfo(s, { bars: opts.bars });
  const endOf = (n) => (n <= 0 ? 0 : n <= bars.length ? bars[n - 1].start + bars[n - 1].ticks : bars[bars.length - 1].start + bars[bars.length - 1].ticks); // where bar n ends
  const nextLine = (t) => { const b = bars[barIndexAt(bars, t)]; return t < b.start + b.ticks ? b.start + b.ticks : b.start + b.ticks + b.full; };
  for (const p of s.parts) p.voices.forEach((v, vi) => {
    // only the first voice on a staff is padded out; the others keep just what was written
    if (p.voices.findIndex((_, k) => staffOfVoice(p, k) === staffOfVoice(p, vi)) !== vi) return;
    let len = voiceLength(v);
    const target = Math.max(endOf(opts.bars || 0), len === 0 || endOf(0) === len ? len : nextLine(len - 1));
    while (len < target) { const d = Math.min(target, nextLine(len)) - len; v.push(newEvent(d)); len += d; }
  });
  return touch(s);
}
/** Ties merged and spellings that match the default dropped, so two scores that print the same compare equal */
export function normalize(score) {
  const s = clone(score);
  delete s.id; delete s.created; delete s.updated;
  s.v = 2;
  const where = new Map(); // event id -> "part:voice:index" after merging
  s.parts.forEach((p, pi) => {
    delete p.id;
    p.voices = p.voices.map((v, vi) => {
      const out = [];
      for (const e of v) {
        const prev = out[out.length - 1];
        const plain = (x) => !x.chord && !x.lyric && !x.tuplet && !(x.artic || []).length && !x.dyn && !x.slash && !x.graces?.length && !x.orn && !x.trem && !x.arp && !x.tech
          && !(x.notes || []).some((n) => n.finger || (n.head && n.head !== "normal") || n.harm);
        if (prev && !prev.rest && !e.rest && !prev.tuplet && plain(e) && prev.notes.every((n) => n.tie) && prev.notes.length === e.notes.length && prev.notes.every((n, i) => n.midi === e.notes[i].midi)) {
          prev.dur += e.dur; prev.notes.forEach((n, i) => (n.tie = e.notes[i].tie)); where.set(e.id, `${pi}:${vi}:${out.length - 1}`); continue;
        }
        if (prev && prev.rest && e.rest && plain(e) && plain(prev)) { prev.dur += e.dur; where.set(e.id, `${pi}:${vi}:${out.length - 1}`); continue; }
        const c = { dur: e.dur, rest: !!e.rest, notes: e.rest ? [] : e.notes.map((n) => {
          const o = { midi: n.midi, tie: !!n.tie, spell: n.spell || null };
          if (n.finger) o.finger = String(n.finger); if (n.head && n.head !== "normal") o.head = n.head; if (n.harm) o.harm = true; if (n.string) o.string = n.string;
          return o;
        }).sort((a, b) => a.midi - b.midi) };
        if (e.graces?.length) c.graces = e.graces.map((g) => ({ slash: g.slash !== false, notes: (g.notes || []).map((n) => ({ midi: n.midi })).sort((a, b) => a.midi - b.midi) }));
        for (const k of ["orn", "trem", "tech"]) if (e[k]) c[k] = e[k];
        if (e.orn && e.ornAcc !== undefined && e.ornAcc !== null) c.ornAcc = e.ornAcc;
        if (e.arp) { c.arp = true; if (e.arpDir && e.arpDir !== "up") c.arpDir = e.arpDir; }
        for (const k of ["chord", "lyric", "dyn"]) if (e[k]) c[k] = e[k];
        if (e.lyricHyphen) c.lyricHyphen = true;
        if (e.rest && e.slash) c.slash = true;
        if (e.tuplet) { c.tuplet = { n: e.tuplet.n, of: e.tuplet.of }; if (e.tuplet.unit) c.tuplet.unit = e.tuplet.unit; if (e.tuplet.outer) c.tuplet.outer = { n: e.tuplet.outer.n, of: e.tuplet.outer.of, ...(e.tuplet.outer.unit ? { unit: e.tuplet.outer.unit } : {}) }; }
        if ((e.artic || []).length) c.artic = [...e.artic].sort();
        where.set(e.id, `${pi}:${vi}:${out.length}`);
        out.push(c);
      }
      // rests that only round out the last bar are implied by the layout
      while (out.length && out[out.length - 1].rest && Object.keys(out[out.length - 1]).length === 3) out.pop();
      return out;
    });
    // empty voices at the end, and settings left at their defaults, are the same as not there
    while (p.voices.length > 1 && !p.voices[p.voices.length - 1].length && !(stavesOf(p) === 2 && p.voices.length <= 3)) p.voices.pop();
    const clefs = clefsOf(p);
    p.clef = clefs[0];
    if (stavesOf(p) === 1) { delete p.staves; delete p.clefs; delete p.voiceStaff; } else { p.clefs = [...clefs]; p.voiceStaff = [0, 1, 2, 3].map((v) => staffOfVoice(p, v)); }
    for (const [k, d] of [["mute", false], ["solo", false], ["volume", 0.8], ["notation", "standard"], ["capo", 0], ["tuning", null]]) if (p[k] === undefined || p[k] === d) delete p[k];
  });
  // spans by position instead of id; bars without anything on them dropped
  s.spans = (s.spans || []).map((sp) => {
    const a = where.get(sp.from), b = where.get(sp.to);
    return a && b ? { type: sp.type, from: a, to: b } : null;
  }).filter(Boolean).sort((x, y) => (x.from + x.type).localeCompare(y.from + y.type));
  const bars = {};
  for (const k of Object.keys(s.bars || {}).map(Number).sort((a, b) => a - b)) {
    const b = {}; for (const kk of Object.keys(s.bars[k]).sort()) { const vv = s.bars[k][kk]; if (vv !== null && vv !== undefined) b[kk] = vv; }
    if (Object.keys(b).length) bars[k] = b;
  }
  s.bars = bars;
  return s;
}

// ---------- transposing ----------

/** Every note up or down; the key moves with it (spelled the simpler way) */
export function transposeScore(score, semis) {
  const s = clone(score);
  s.key = writtenKey(s.key, semis);
  for (const b of Object.values(s.bars || {})) if (b.key !== undefined) b.key = writtenKey(b.key, semis); // key changes move too
  const bars = barInfo(s);
  for (const p of s.parts) for (const v of p.voices) {
    let t = 0;
    for (const e of v) {
      for (const n of e.notes || []) { n.midi += semis; n.spell = null; }
      if (e.chord) e.chord = transposeChordSymbol(e.chord, semis, bars[barIndexAt(bars, t)].key);
      t += e.dur;
    }
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

// ---------- playing in order: repeats, endings, D.C. / D.S. / Coda / Fine ----------

const navsOf = (b) => [].concat(b?.nav || []);
/**
 * Where each ending (volta) runs: Map start bar -> { numbers, end }. An ending runs to the bar with the repeat sign
 * that closes it, or to the bar before the next ending starts; one with neither lasts one bar (or voltaBars bars).
 */
export function voltaRegions(bars) {
  const out = new Map();
  bars.forEach((b, i) => {
    if (!b.volta?.length) return;
    let end = i;
    if (b.voltaBars > 0) end = Math.min(bars.length - 1, i + b.voltaBars - 1);
    else for (let j = i; j < bars.length; j++) { if (bars[j].repeatEnd) { end = j; break; } if (j > i && bars[j].volta?.length) { end = j - 1; break; } if (j === bars.length - 1) end = i; }
    out.set(i, { numbers: b.volta, end });
  });
  return out;
}
/**
 * The bars in the order they're played. Repeats play repeatEnd times in all (2 by default), taking the ending whose
 * number matches the pass. D.C. goes back to the top, D.S. to the Segno; after the jump repeats aren't taken again
 * (the usual convention), "al Fine" (or a plain D.C./D.S. when there's a Fine) stops at the Fine, and "al Coda" jumps
 * from To Coda to the Coda.
 */
export function playOrder(score, opts = {}) {
  const bars = opts.barList || barInfo(score), n = bars.length, regions = voltaRegions(bars), out = [];
  const find = (name) => bars.findIndex((b) => navsOf(b).includes(name));
  const hasFine = find("Fine") >= 0;
  let i = 0, pass = 1, repStart = 0, jumped = false, target = null, guard = 0;
  const count = new Map();
  while (i < n && guard++ < 50000) {
    const b = bars[i], r = regions.get(i);
    if (r) {
      // after a D.C./D.S. only the last ending is played; before it, the ending for this pass
      if (jumped ? !!bars[r.end].repeatEnd : !r.numbers.includes(pass)) { i = r.end + 1; if (bars[i]?.repeatStart && !jumped) { repStart = i; pass = 1; } continue; }
    }
    out.push(i);
    if (b.repeatEnd && !jumped) {
      const times = Math.max(2, b.repeatEnd | 0), c = count.get(i) || 1;
      if (c < times) { count.set(i, c + 1); pass = c + 1; i = repStart; continue; }
      count.delete(i); pass = 1; repStart = i + 1;
    }
    let moved = false;
    for (const nav of navsOf(b)) {
      if (nav === "Fine" && jumped && target === "fine") return out;
      if (nav === "To Coda" && jumped && target === "coda") { const c = find("Coda"); if (c >= 0) { i = c; target = null; moved = true; break; } }
      if (/^D\.[CS]\./.test(nav) && !jumped) {
        jumped = true; target = /Coda/.test(nav) ? "coda" : /Fine/.test(nav) || hasFine ? "fine" : "end";
        const seg = /^D\.S\./.test(nav) ? find("Segno") : 0;
        i = Math.max(0, seg); pass = 1; repStart = i; count.clear(); moved = true; break;
      }
    }
    if (moved) continue;
    i++;
    if (bars[i]?.repeatStart && !jumped) { repStart = i; pass = 1; }
  }
  return out;
}
/**
 * The piece as played, bar by bar with its clock time: { segments: [{ bar, start, ticks, tempo, time, dur, ptick }],
 * duration, at(seconds) -> { segment, bar, tick } }. tempo is quarter notes a minute; ptick counts ticks as played (repeats unrolled).
 */
export function timeline(score, opts = {}) {
  const bars = opts.barList || barInfo(score), order = playOrder(score, { barList: bars }), segments = [];
  let time = 0, ptick = 0;
  for (const bi of order) {
    const b = bars[bi], dur = (b.ticks * 60) / (b.tempo * TPQ);
    segments.push({ bar: bi, start: b.start, ticks: b.ticks, tempo: b.tempo, time, dur, ptick });
    time += dur; ptick += b.ticks;
  }
  const at = (sec) => {
    let lo = 0, hi = segments.length - 1;
    if (hi < 0) return { segment: -1, bar: 0, tick: 0 };
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (segments[m].time <= sec) lo = m; else hi = m - 1; }
    const sg = segments[lo];
    return { segment: lo, bar: sg.bar, tick: sg.start + Math.min(sg.ticks, Math.max(0, ((sec - sg.time) * sg.tempo * TPQ) / 60)) };
  };
  return { segments, duration: time, at };
}
/** Seconds at a tick straight through the piece (no repeats), following tempo changes; .toTick(seconds) goes back */
export function tickToTime(score) {
  const bars = barInfo(score), starts = []; let t = 0;
  for (const b of bars) { starts.push(t); t += (b.ticks * 60) / (b.tempo * TPQ); }
  const f = (tick) => {
    if (tick >= bars[bars.length - 1].start + bars[bars.length - 1].ticks) { const b = bars[bars.length - 1]; return starts[bars.length - 1] + ((tick - b.start) * 60) / (b.tempo * TPQ); }
    const i = barIndexAt(bars, tick), b = bars[i]; return starts[i] + ((tick - b.start) * 60) / (b.tempo * TPQ);
  };
  f.toTick = (sec) => { let i = 0; while (i + 1 < bars.length && starts[i + 1] <= sec) i++; const b = bars[i]; return b.start + ((sec - starts[i]) * b.tempo * TPQ) / 60; };
  return f;
}

// ---------- playback ----------

const DYN_VEL = { ppp: 30, pp: 42, p: 56, mp: 70, mf: 84, f: 98, ff: 112, fff: 124 };
/**
 * Sounds to play, in the order the piece is played (repeats and jumps unrolled):
 * [{ time, dur, midi, vel, part, voice, ref, bar, ptick, pticks }] with time in seconds after opts.from (concert pitch),
 * ties joined, staccato shortened, accents louder, dynamics carried forward per voice, tempo changes followed.
 * Muted parts (and, when any part is soloed, the others) are left out; volume scales velocity (0.8 = as written).
 * opts: { from: tick (where to start, first time through), parts: [indexes], all: true (ignore mute and solo) }
 */
export function playbackEvents(score, opts = {}) {
  const bars = barInfo(score), tl = timeline(score, { barList: bars }), anySolo = score.parts.some((p) => p.solo);
  // what each voice sounds, in score ticks
  const byBar = new Map();
  score.parts.forEach((p, pi) => {
    if (opts.parts && !opts.parts.includes(pi)) return;
    if (!opts.all && (p.mute || (anySolo && !p.solo))) return;
    const gain = (p.volume ?? 0.8) / 0.8;
    p.voices.forEach((v, vi) => {
      let vel = 84, t = 0, dynName = "mf"; const open = new Map(); // midi -> sound being held by a tie
      // v3 spans on this voice by event index: gliss (from -> the note it slides to), trill lines (every event inside)
      const idx = new Map(v.map((e, i) => [e.id, i])), glissTo = new Map(), trilled = new Set();
      for (const sp of score.spans || []) {
        if ((sp.part ?? 0) !== pi || (sp.voice ?? 0) !== vi) continue;
        let a = idx.get(sp.from), b = idx.get(sp.to); if (a === undefined || b === undefined) continue; if (a > b) [a, b] = [b, a];
        if (sp.type === "gliss" && v[b] && !v[b].rest) glissTo.set(a, v[b].notes[0].midi);
        if (sp.type === "trill") for (let k = a; k <= b; k++) trilled.add(k);
      }
      v.forEach((e, ref) => {
        if (e.dyn && DYN_VEL[e.dyn]) { vel = DYN_VEL[e.dyn]; dynName = e.dyn; }
        if (!e.rest) e.notes.forEach((n, ni) => {
          const held = open.get(n.midi);
          if (held) { held.len += e.dur; held.sound += e.dur; if (!n.tie) open.delete(n.midi); return; }
          const artic = e.artic || [], f = artic.includes("staccato") ? 0.5 : artic.includes("tenuto") ? 1 : 0.92;
          const snd = { tick: t, len: e.dur, sound: e.dur * f, midi: n.midi, vel: Math.max(1, Math.min(127, Math.round((vel + (artic.includes("accent") ? 16 : 0)) * gain))), part: pi, voice: vi, ref,
            artic: [...artic], dyn: dynName };
          // how it's played (compose-play.js shapes these): graces ride on the chord's first note only
          if (ni === 0 && e.graces?.length) snd.graces = e.graces.map((g) => ({ slash: g.slash !== false, midis: (g.notes || []).map((x) => x.midi) }));
          if (e.orn) { snd.orn = e.orn; if (e.ornAcc !== undefined && e.ornAcc !== null) snd.ornAcc = e.ornAcc; }
          if (e.trem) snd.trem = e.trem;
          if (e.arp) { snd.arp = e.arpDir || "up"; snd.arpIndex = ni; snd.arpCount = e.notes.length; }
          if (e.tech) snd.tech = e.tech;
          if (n.harm) snd.harm = true;
          if (n.head && n.head !== "normal") snd.head = n.head;
          if (glissTo.has(ref) && ni === 0) snd.gliss = glissTo.get(ref);
          if (trilled.has(ref)) snd.trill = true;
          const bi = barIndexAt(bars, t); if (!byBar.has(bi)) byBar.set(bi, []); byBar.get(bi).push(snd);
          if (n.tie) open.set(n.midi, snd);
        });
        for (const [m] of open) if (!e.notes?.some((n) => n.midi === m)) open.delete(m);
        t += e.dur;
      });
    });
  });
  // laid out along the played bars
  const from = opts.from || 0;
  let first = tl.segments.findIndex((sg) => from < sg.start + sg.ticks);
  if (first < 0) first = tl.segments.length;
  const startSeg = tl.segments[first], t0 = startSeg ? startSeg.time + (Math.max(0, from - startSeg.start) * 60) / (startSeg.tempo * TPQ) : tl.duration;
  const out = [];
  for (let k = first; k < tl.segments.length; k++) {
    const sg = tl.segments[k], spt = 60 / (sg.tempo * TPQ);
    for (const s of byBar.get(sg.bar) || []) {
      const time = sg.time + (s.tick - sg.start) * spt, dur = s.sound * spt;
      if (time + dur <= t0 + 1e-9) continue;
      const ev = { time: Math.max(0, time - t0), dur: Math.min(dur, time + dur - t0), midi: s.midi, vel: s.vel, part: s.part, voice: s.voice, ref: s.ref, bar: sg.bar,
        ptick: sg.ptick + s.tick - sg.start, pticks: Math.max(1, Math.round(s.sound)), artic: s.artic, dyn: s.dyn };
      for (const k of ["graces", "orn", "ornAcc", "trem", "arp", "arpIndex", "arpCount", "tech", "harm", "head", "gliss", "trill"]) if (s[k] !== undefined) ev[k] = s[k];
      out.push(ev);
    }
  }
  return out.sort((a, b) => a.time - b.time || a.midi - b.midi);
}

// ---------- MusicXML ----------

const xesc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const CLEFS = { treble: ["G", 2, 0], bass: ["F", 4, 0], alto: ["C", 3, 0], tenor: ["C", 4, 0], treble8vb: ["G", 2, -1], percussion: ["percussion", 2, 0] };
const KIND = { maj: "major", min: "minor", dim: "diminished", aug: "augmented", sus4: "suspended-fourth", sus2: "suspended-second", 5: "power", 6: "major-sixth", m6: "minor-sixth",
  maj7: "major-seventh", 7: "dominant", m7: "minor-seventh", mMaj7: "major-minor", dim7: "diminished-seventh", m7b5: "half-diminished", "7#5": "augmented-seventh", 9: "dominant-ninth",
  maj9: "major-ninth", m9: "minor-ninth", 11: "dominant-11th", m11: "minor-11th", 13: "dominant-13th", maj13: "major-13th", m13: "minor-13th" };
const ACC = { "-2": "flat-flat", "-1": "flat", 0: "natural", 1: "sharp", 2: "double-sharp" };
const DIV = TPQ;
/**
 * A MusicXML 4.0 score (partwise): every part, grand staves (<staff>), voices (with <backup>), key, time and tempo
 * changes, repeats and endings, segno / coda / D.C. / D.S. / Fine, rehearsal marks, slurs, hairpins, octave lines,
 * pedal. Transposing parts are written at written pitch with their transposition.
 */
export function toMusicXML(score) {
  const L = layoutScore(score, { transposed: true }), bars = L.bars, regions = voltaRegions(bars), x = [];
  x.push('<?xml version="1.0" encoding="UTF-8" standalone="no"?>',
    '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">',
    '<score-partwise version="4.0">', `  <work><work-title>${xesc(score.title)}</work-title></work>`,
    "  <identification>", score.composer ? `    <creator type="composer">${xesc(score.composer)}</creator>` : "", score.lyricist ? `    <creator type="lyricist">${xesc(score.lyricist)}</creator>` : "",
    `    <encoding><software>ENCORE. Compose</software><encoding-date>${new Date().toISOString().slice(0, 10)}</encoding-date></encoding>`, "  </identification>",
    score.subtitle ? `  <credit page="1"><credit-type>subtitle</credit-type><credit-words>${xesc(score.subtitle)}</credit-words></credit>` : "",
    "  <part-list>");
  score.parts.forEach((p, i) => x.push(`    <score-part id="P${i + 1}"><part-name>${xesc(p.name)}</part-name><score-instrument id="P${i + 1}-I1"><instrument-name>${xesc(p.instrument)}</instrument-name></score-instrument><midi-instrument id="P${i + 1}-I1"><midi-channel>${i >= 9 ? i + 2 : i + 1}</midi-channel><midi-program>${programOf(p.instrument) + 1}</midi-program><volume>${Math.round((p.volume ?? 0.8) * 100)}</volume></midi-instrument></score-part>`));
  x.push("  </part-list>");
  const clefXML = (name, num) => { const [sign, line, oct] = CLEFS[name] || CLEFS.treble; return `        <clef${num ? ` number="${num}"` : ""}><sign>${sign}</sign>${sign === "percussion" ? "" : `<line>${line}</line>`}${oct ? `<clef-octave-change>${oct}</clef-octave-change>` : ""}</clef>`; };
  const timeXML = (t) => `        <time><beats>${t.groups?.length ? t.groups.join("+") : t.n}</beats><beat-type>${t.d}</beat-type></time>`;
  const metronome = (tempo, pi) => pi === 0 ? `      <direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${tempo}</per-minute></metronome></direction-type><sound tempo="${tempo}"/></direction>` : "";
  score.parts.forEach((p, pi) => {
    const P = L.parts[pi], tr = p.transpose || 0;
    // TAB: "tab" writes one TAB staff; "both" adds a TAB staff (staff 2) with the notes again; notes carry string and fret
    const tabMode = notationOf(p), tabStrings = tabMode !== "standard" ? stringsOf(p) : [];
    const tabOf = new Map(); if (tabStrings.length) p.voices.forEach((v, vi) => tabOf.set(vi, tabVoice(p, v)));
    const both = tabMode === "both", nst = both ? 2 : P.staves.length;
    const tabFret = (m, ev, ni) => (ev.ref >= 0 ? tabOf.get(m.voice)?.[ev.ref]?.[ni] : null) || null;
    const techTab = (t) => (t?.string ? `<string>${t.string}</string><fret>${t.fret}</fret>` : "");
    const staffDetails = (num) => {
      const lines = tabStrings.slice().reverse().map((s, k) => {
        const [, step, acc, oct] = /^([A-G])(#|b)?(-?\d+)$/.exec(s.full || "") || [null, "E", "", "4"];
        return `<staff-tuning line="${k + 1}"><tuning-step>${step}</tuning-step>${acc ? `<tuning-alter>${acc === "#" ? 1 : -1}</tuning-alter>` : ""}<tuning-octave>${oct}</tuning-octave></staff-tuning>`;
      }).join("");
      return `        <staff-details${num ? ` number="${num}"` : ""}><staff-lines>${tabStrings.length}</staff-lines>${lines}${capoOf(p) ? `<capo>${capoOf(p)}</capo>` : ""}</staff-details>`;
    };
    const tabClefXML = (num) => `        <clef${num ? ` number="${num}"` : ""}><sign>TAB</sign><line>5</line></clef>`;
    x.push(`  <part id="P${pi + 1}">`);
    const syll = new Map(), slurNo = new Map(); let nextSlur = 1;
    bars.forEach((b, i) => {
      x.push(`    <measure number="${b.number}"${b.pickup ? ' implicit="yes"' : ""}>`);
      // left barline: a start repeat, an ending starting
      const r = regions.get(i);
      if (b.repeatStart || r) x.push(`      <barline location="left">${b.repeatStart ? "<bar-style>heavy-light</bar-style>" : ""}${r ? `<ending number="${r.numbers.join(", ")}" type="start">${r.numbers.join(", ")}.</ending>` : ""}${b.repeatStart ? '<repeat direction="forward"/>' : ""}</barline>`);
      const attrs = [];
      if (i === 0) {
        attrs.push(`        <divisions>${DIV}</divisions>`, `        <key><fifths>${writtenKey(b.key, tr)}</fifths><mode>${b.mode === "minor" ? "minor" : "major"}</mode></key>`, timeXML(b.time));
        if (nst > 1) attrs.push(`        <staves>${nst}</staves>`);
        if (tabMode === "tab") attrs.push(tabClefXML(0), staffDetails(0));
        else if (both) attrs.push(clefXML(P.staves[0].clef, 1), tabClefXML(2), staffDetails(2));
        else P.staves.forEach((st, k) => attrs.push(clefXML(st.clef, nst > 1 ? k + 1 : 0)));
        if (tr) { const d = diatonicSteps(tr); attrs.push(`        <transpose><diatonic>${-d}</diatonic><chromatic>${-tr}</chromatic></transpose>`); }
      } else {
        if (b.keyChange) attrs.push(`        <key><fifths>${writtenKey(b.key, tr)}</fifths><mode>${b.mode === "minor" ? "minor" : "major"}</mode></key>`);
        if (b.timeChange) attrs.push(timeXML(b.time));
        // a clef change on any of this part's staves
        if (tabMode !== "tab") P.staves.forEach((st, k) => { const m0 = st.voices[0]?.[i]; if (m0?.clefChange) attrs.push(clefXML(m0.clef, nst > 1 ? k + 1 : 0)); });
      }
      if (attrs.length) x.push("      <attributes>", ...attrs, "      </attributes>");
      // the first part carries the marks that belong to the whole score
      if (pi === 0) {
        if (i === 0 || b.tempoChange) x.push(metronome(b.tempo, pi));
        if (b.mark) x.push(`      <direction placement="above"><direction-type><rehearsal>${xesc(b.mark)}</rehearsal></direction-type></direction>`);
        for (const nav of navsOf(b)) {
          if (nav === "Segno") x.push('      <direction placement="above"><direction-type><segno/></direction-type><sound segno="segno"/></direction>');
          if (nav === "Coda") x.push('      <direction placement="above"><direction-type><coda/></direction-type><sound coda="coda"/></direction>');
        }
        if (b.text) x.push(`      <direction placement="above"><direction-type><words>${xesc(b.text)}</words></direction-type></direction>`);
      }
      // each staff's voices in turn, backing up to the start of the bar between them
      let wrote = false;
      P.staves.forEach((st, si) => st.voices.forEach((ms) => {
        const m = ms[i];
        if (!m.events.length) return;
        srcVoiceTuplets = p.voices[m.voice] || null;
        if (wrote) x.push(`      <backup><duration>${b.ticks}</duration></backup>`);
        wrote = true;
        const vnum = m.voice + 1, staff = nst > 1 ? `<staff>${si + 1}</staff>` : "";
        const dir = (inner, place = "below") => `      <direction placement="${place}"><direction-type>${inner}</direction-type><voice>${vnum}</voice>${staff}</direction>`;
        for (const ev of m.events) {
          for (const sp of ev.spans) if (sp.start) {
            if (sp.type === "cresc" || sp.type === "dim") x.push(dir(`<wedge type="${sp.type === "cresc" ? "crescendo" : "diminuendo"}"/>`));
            if (sp.type === "8va" || sp.type === "8vb") x.push(dir(`<octave-shift type="${sp.type === "8va" ? "down" : "up"}" size="8"/>`, sp.type === "8va" ? "above" : "below"));
            if (sp.type === "pedal") x.push(dir('<pedal type="start" line="yes"/>'));
          }
          if (ev.dyn) x.push(dir(`<dynamics><${ev.dyn}/></dynamics>`));
          if (ev.tech) x.push(dir(`<words>${xesc(ev.tech)}</words>`, "above"));
          // grace notes before the note they lead into (a single one as an eighth, several as beamed 16ths)
          if (ev.graces?.length && !ev.rest) ev.graces.forEach((gr, gi) => gr.notes.forEach((gn, ni) => {
            const many = ev.graces.length > 1, bm = many && ni === 0 ? `<beam number="1">${gi === 0 ? "begin" : gi === ev.graces.length - 1 ? "end" : "continue"}</beam>` : "";
            x.push(`      <note><grace${gr.slash ? ' slash="yes"' : ""}/>${ni ? "<chord/>" : ""}<pitch><step>${gn.step}</step>${gn.alter ? `<alter>${gn.alter}</alter>` : ""}<octave>${gn.octave}</octave></pitch><voice>${vnum}</voice><type>${many ? "16th" : "eighth"}</type>${gn.showAcc ? `<accidental>${ACC[gn.alter]}</accidental>` : ""}<stem>up</stem>${staff}${bm}</note>`);
          }));
          if (ev.chord) { const h = harmonyXML(ev.chord, tr); if (h) x.push(h.replace("</harmony>", `${staff}</harmony>`)); }
          if (ev.full) x.push(`      <note><rest measure="yes"/><duration>${m.ticks}</duration><voice>${vnum}</voice>${staff}</note>`);
          else {
            const notes = ev.rest ? [null] : ev.notes;
            notes.forEach((n, ni) => {
              const o = ["      <note>"];
              if (ni > 0) o.push("<chord/>");
              o.push(n ? `<pitch><step>${n.step}</step>${n.alter ? `<alter>${n.alter}</alter>` : ""}<octave>${n.octave}</octave></pitch>` : "<rest/>");
              o.push(`<duration>${ev.ticks}</duration>`);
              if (n && ev.tiedFromPrev) o.push('<tie type="stop"/>');
              if (n && n.tie) o.push('<tie type="start"/>');
              o.push(`<voice>${vnum}</voice>`, `<type>${ev.type}</type>`, "<dot/>".repeat(ev.dots));
              if (n && n.showAcc) o.push(`<accidental${n.showAcc === "courtesy" ? ' parentheses="yes"' : ""}>${ACC[n.alter]}</accidental>`);
              if (ev.tuplet) {
                // nested tuplets multiply; the unit, when set, is the normal type
                const tu = srcTuplet(ev), on = tu?.outer ? tu.outer.n : 1, oo = tu?.outer ? tu.outer.of : 1, unitT = tu?.unit ? valueOf(tu.unit) : null;
                o.push(`<time-modification><actual-notes>${ev.tuplet.n * on}</actual-notes><normal-notes>${ev.tuplet.of * oo}</normal-notes>${unitT && !tu.outer ? `<normal-type>${unitT.type}</normal-type>${"<normal-dot/>".repeat(unitT.dots)}` : ""}</time-modification>`);
              }
              if (n && m.stem) o.push(`<stem>${m.stem}</stem>`);
              if (ev.slash) o.push("<notehead>slash</notehead>");
              else if (n && (n.harm || (n.head && n.head !== "normal"))) o.push(`<notehead>${n.harm ? "diamond" : n.head}</notehead>`);
              o.push(staff);
              if (ev.beam && ni === 0) o.push(`<beam number="1">${beamPos(m, ev)}</beam>`);
              const nots = [];
              if (n && ev.tiedFromPrev) nots.push('<tied type="stop"/>');
              if (n && n.tie) nots.push('<tied type="start"/>');
              if (ni === 0) for (const sp of ev.spans) if (sp.type === "slur") {
                if (sp.start) { if (!slurNo.has(sp.id)) { slurNo.set(sp.id, nextSlur); nextSlur = (nextSlur % 6) + 1; } nots.push(`<slur type="start" number="${slurNo.get(sp.id)}"/>`); }
                if (sp.end) nots.push(`<slur type="stop" number="${slurNo.get(sp.id) || 1}"/>`);
              }
              if (ni === 0 && ev.tuplet) {
                const tu = srcTuplet(ev), nested = !!ev.tuplet.outer;
                const tupEl = (num, t, ref) => `<tuplet type="start" number="${num}" bracket="yes"><tuplet-actual><tuplet-number>${t.n}</tuplet-number>${ref?.unit && valueOf(ref.unit) ? `<tuplet-type>${valueOf(ref.unit).type}</tuplet-type>` : ""}</tuplet-actual><tuplet-normal><tuplet-number>${t.of}</tuplet-number>${ref?.unit && valueOf(ref.unit) ? `<tuplet-type>${valueOf(ref.unit).type}</tuplet-type>` : ""}</tuplet-normal></tuplet>`;
                if (nested && ev.tuplet.outer.first) nots.push(tupEl(1, ev.tuplet.outer, tu?.outer));
                if (ev.tuplet.first) nots.push(nested || tu?.unit ? tupEl(nested ? 2 : 1, ev.tuplet, tu) : '<tuplet type="start" bracket="yes"/>');
                if (ev.tuplet.last) nots.push(`<tuplet type="stop"${nested ? ' number="2"' : ""}/>`);
                if (nested && ev.tuplet.outer.last) nots.push('<tuplet type="stop" number="1"/>');
              }
              // ornaments, tremolo and trill lines; fingering and harmonics; arpeggio; gliss
              const orn = [];
              if (ni === 0) {
                const trillStart = ev.spans.some((q) => q.type === "trill" && q.start), trillEnd = ev.spans.some((q) => q.type === "trill" && q.end);
                if (ev.orn === "trill" || trillStart) orn.push("<trill-mark/>");
                if (ev.orn && ev.orn !== "trill") orn.push({ turn: "<turn/>", invturn: "<inverted-turn/>", mordent: "<mordent/>", invmordent: "<inverted-mordent/>" }[ev.orn] || "");
                if (trillStart) orn.push('<wavy-line type="start" number="1"/>');
                if (trillEnd) orn.push('<wavy-line type="stop" number="1"/>');
                if (ev.orn && ev.ornAcc !== undefined && ev.ornAcc !== null) orn.push(`<accidental-mark>${ACC[ev.ornAcc]}</accidental-mark>`);
                if (ev.trem) orn.push(`<tremolo type="${ev.trem === 3 ? "unmeasured" : "single"}">${ev.trem === 3 ? 0 : ev.trem}</tremolo>`);
              }
              if (orn.length) nots.push(`<ornaments>${orn.join("")}</ornaments>`);
              const tech = [];
              if (n && n.finger) tech.push(/^[pima]$/.test(n.finger) ? `<pluck>${n.finger}</pluck>` : `<fingering>${xesc(n.finger)}</fingering>`);
              if (n && n.harm) tech.push("<harmonic><natural/></harmonic>");
              if (n && tabStrings.length) tech.push(techTab(tabFret(m, ev, ni)));
              if (tech.join("")) nots.push(`<technical>${tech.join("")}</technical>`);
              if (n && ev.arp) nots.push(`<arpeggiate${ev.arpDir === "down" ? ' direction="down"' : ev.arpDir === "up" ? ' direction="up"' : ""}/>`);
              if (ni === 0) for (const sp of ev.spans) if (sp.type === "gliss") {
                if (sp.start) nots.push('<glissando type="start" line-type="solid" number="1">gliss.</glissando>');
                if (sp.end) nots.push('<glissando type="stop" number="1"/>');
              }
              const arts = (ev.artic || []).filter((a) => a !== "fermata");
              if (ni === 0 && arts.length) nots.push(`<articulations>${arts.map((a) => `<${a}/>`).join("")}</articulations>`);
              if (ni === 0 && (ev.artic || []).includes("fermata")) nots.push("<fermata/>");
              if (nots.length) o.push(`<notations>${nots.join("")}</notations>`);
              if (ni === 0 && ev.lyric) {
                const open = syll.get(m.voice), sy = open ? (ev.lyricHyphen ? "middle" : "end") : ev.lyricHyphen ? "begin" : "single";
                syll.set(m.voice, ev.lyricHyphen);
                o.push(`<lyric number="1"><syllabic>${sy}</syllabic><text>${xesc(ev.lyric)}</text></lyric>`);
              }
              o.push("</note>");
              x.push(o.join(""));
            });
          }
          for (const sp of ev.spans) if (sp.end) {
            if (sp.type === "cresc" || sp.type === "dim") x.push(dir('<wedge type="stop"/>'));
            if (sp.type === "8va" || sp.type === "8vb") x.push(dir('<octave-shift type="stop" size="8"/>', sp.type === "8va" ? "above" : "below"));
            if (sp.type === "pedal") x.push(dir('<pedal type="stop" line="yes"/>'));
          }
        }
      }));
      // notes and TAB: the same notes again on the TAB staff (staff 2, voices from 5), with their strings and frets
      if (both) P.staves[0].voices.forEach((ms) => {
        const m = ms[i];
        if (!m.events.length) return;
        if (wrote) x.push(`      <backup><duration>${b.ticks}</duration></backup>`);
        wrote = true;
        const vnum = m.voice + 5;
        srcVoiceTuplets = p.voices[m.voice] || null;
        for (const ev of m.events) {
          if (ev.full) { x.push(`      <note><rest measure="yes"/><duration>${m.ticks}</duration><voice>${vnum}</voice><staff>2</staff></note>`); continue; }
          (ev.rest ? [null] : ev.notes).forEach((n, ni) => {
            const tu = ev.tuplet ? srcTuplet(ev) : null, on = tu?.outer ? tu.outer.n : 1, oo = tu?.outer ? tu.outer.of : 1;
            const t = n ? techTab(tabFret(m, ev, ni)) : "";
            const nots = [n && ev.tiedFromPrev ? '<tied type="stop"/>' : "", n && n.tie ? '<tied type="start"/>' : "", t ? `<technical>${t}</technical>` : ""].join("");
            x.push(`      <note>${ni ? "<chord/>" : ""}${n ? `<pitch><step>${n.step}</step>${n.alter ? `<alter>${n.alter}</alter>` : ""}<octave>${n.octave}</octave></pitch>` : "<rest/>"}<duration>${ev.ticks}</duration>`
              + `${n && ev.tiedFromPrev ? '<tie type="stop"/>' : ""}${n && n.tie ? '<tie type="start"/>' : ""}<voice>${vnum}</voice><type>${ev.type}</type>${"<dot/>".repeat(ev.dots)}`
              + `${ev.tuplet ? `<time-modification><actual-notes>${ev.tuplet.n * on}</actual-notes><normal-notes>${ev.tuplet.of * oo}</normal-notes></time-modification>` : ""}<staff>2</staff>`
              + `${ev.beam && ni === 0 ? `<beam number="1">${beamPos(m, ev)}</beam>` : ""}${nots ? `<notations>${nots}</notations>` : ""}</note>`);
          });
        }
      });
      // the end of the bar: jumps, then the right barline
      if (pi === 0) for (const nav of navsOf(b)) {
        if (nav === "Segno" || nav === "Coda") continue;
        const snd = nav === "Fine" ? ' fine="yes"' : /^D\.C\./.test(nav) ? ' dacapo="yes"' : /^D\.S\./.test(nav) ? ' dalsegno="segno"' : nav === "To Coda" ? ' tocoda="coda"' : "";
        x.push(`      <direction placement="above"><direction-type><words>${xesc(nav)}</words></direction-type>${snd ? `<sound${snd}/>` : ""}</direction>`);
      }
      const endsHere = [...regions.entries()].find(([, rr]) => rr.end === i);
      const style = b.repeatEnd ? "light-heavy" : b.barline === "double" ? "light-light" : b.barline === "dashed" ? "dashed" : b.barline === "final" || i === bars.length - 1 ? "light-heavy" : "";
      if (style || endsHere) x.push(`      <barline location="right">${style ? `<bar-style>${style}</bar-style>` : ""}${endsHere ? `<ending number="${endsHere[1].numbers.join(", ")}" type="${b.repeatEnd ? "stop" : "discontinue"}"/>` : ""}${b.repeatEnd ? `<repeat direction="backward"${b.repeatEnd > 2 ? ` times="${b.repeatEnd}"` : ""}/>` : ""}</barline>`);
      x.push("    </measure>");
    });
    x.push("  </part>");
  });
  x.push("</score-partwise>", "");
  return x.filter((l) => l !== "").join("\n");
}
// the voice's own tuplet (with its unit and outer ratio) for a laid-out piece, found through the layout's source map
let srcVoiceTuplets = null;
const srcTuplet = (ev) => (srcVoiceTuplets && ev.ref >= 0 ? srcVoiceTuplets[ev.ref]?.tuplet : null) || ev.tuplet;
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
 * Read MusicXML (partwise; what toMusicXML writes, and MuseScore, Finale and Sibelius files): every part, grand staves,
 * up to two voices a staff (four in a one-staff part), key / time / tempo changes, repeats and endings, segno / coda /
 * D.C. / D.S. / Fine / To Coda, rehearsal marks, slurs, hairpins, octave lines, pedal. Grace and cue notes are skipped.
 */
const NAVS = ["Fine", "D.C.", "D.C. al Fine", "D.C. al Coda", "D.S.", "D.S. al Fine", "D.S. al Coda", "To Coda"];
/** Playing techniques written as text over the staff (v3 event.tech) */
export const TECHS = ["pizz.", "arco", "con sord.", "senza sord.", "mute", "open", "let ring", "palm mute", "harmonic", "sul pont.", "sul tasto", "col legno", "normal"];
export function fromMusicXML(text) {
  const doc = parseXML(String(text)), sp = kid(doc, "score-partwise");
  if (!sp) throw new Error(kid(doc, "score-timewise") ? "Timewise MusicXML isn't supported yet; save it as partwise." : "This isn't a MusicXML score.");
  const score = newScore({ bars: 0, parts: [] });
  score.title = txt(kid(sp, "work"), "work-title") || txt(sp, "movement-title") || "Untitled";
  for (const c of kids(kid(sp, "identification"), "creator")) { if (c.attrs.type === "composer") score.composer = c.text.trim(); if (c.attrs.type === "lyricist") score.lyricist = c.text.trim(); }
  for (const c of kids(sp, "credit")) if (txt(c, "credit-type") === "subtitle") score.subtitle = txt(c, "credit-words");
  const names = new Map();
  for (const sp2 of kids(kid(sp, "part-list"), "score-part")) {
    const mi = kid(sp2, "midi-instrument"), vol = mi && kid(mi, "volume") ? +txt(mi, "volume") / 100 : null;
    names.set(sp2.attrs.id, { name: txt(sp2, "part-name"), instrument: txt(kid(sp2, "score-instrument"), "instrument-name"), volume: vol });
  }
  const bars = {}, setMark = (i, k, v) => { (bars[i] ||= {})[k] = v; };
  const endingOpen = new Map(); // ending start bar -> its numbers, until a stop or discontinue
  score.bars = bars;
  let first = true, key0 = 0;
  for (const pel of kids(sp, "part")) {
    const nm = names.get(pel.attrs.id) || {}, pi = score.parts.length;
    const part = newPart({ name: nm.name || "Part", instrument: nm.instrument || nm.name || "Piano" });
    if (nm.volume !== null && nm.volume !== undefined && Number.isFinite(nm.volume)) part.volume = nm.volume;
    let div = 1, tr = 0, measureStart = 0, staves = 1, writtenFifths = 0, tabStaff = 0, tabTuning = null, tabCapo = 0;
    const clefs = ["treble", "bass"], clefSeen = new Set(), vmap = new Map(), lastOf = new Map();
    const openSlurs = new Map(), openDir = new Map(); // slur number -> { from, voice }; span type -> { from, voice }
    let pendingChord = null, pendingDyn = [], dirStarts = [];
    const pendingGraces = new Map(), pendingTech = [], tupStack = new Map(), openGliss = new Map(), openTrill = new Map(); // per voice
    // a MusicXML (staff, voice) as one of ours: two a staff on a grand staff (0-1 top, 2-3 bottom), four on one staff
    const ourVoice = (staff, vnum) => {
      const k = `${staff}:${vnum}`;
      if (vmap.has(k)) return vmap.get(k);
      const taken = [...vmap.values()];
      const pool = staves === 2 ? (staff === 2 ? [2, 3] : [0, 1]) : [0, 1, 2, 3];
      const v = pool.find((x) => !taken.includes(x));
      vmap.set(k, v ?? -1);
      return v ?? -1;
    };
    // a direction belongs to the voice it names, or to whichever voice plays next on its staff (-1)
    const dirVoice = (staff, vnum) => {
      if (vnum && vmap.has(`${staff}:${vnum}`)) return vmap.get(`${staff}:${vnum}`);
      if (vnum) return ourVoice(staff, vnum);
      const on = [...vmap.entries()].filter(([k]) => k.startsWith(`${staff}:`)).map(([, v]) => v).filter((v) => v >= 0);
      return on.length ? Math.min(...on) : -1;
    };
    const voiceArr = (v) => { while (part.voices.length <= v) part.voices.push([]); return part.voices[v]; };
    const measures = kids(pel, "measure");
    measures.forEach((mel, mi) => {
      let pos = 0, maxPos = 0;
      for (const el of mel.kids) {
        if (el.name === "attributes") {
          if (kid(el, "divisions")) div = +txt(el, "divisions") || 1;
          if (kid(el, "staves")) { staves = +txt(el, "staves") === 2 ? 2 : 1; if (staves === 2) { part.staves = 2; part.voiceStaff = [0, 0, 1, 1]; } }
          const k = kid(el, "key");
          if (k && kid(k, "fifths")) {
            writtenFifths = +txt(k, "fifths"); const mode = txt(k, "mode") === "minor" ? "minor" : "major";
            if (first) { if (mi === 0) score.mode = mode; else { setMark(mi, "key", writtenKey(writtenFifths, -tr)); if (mode !== score.mode) setMark(mi, "mode", mode); } }
            if (mi === 0 && first) key0 = writtenFifths;
          }
          const t = kid(el, "time");
          if (t && first && kid(t, "beats")) {
            const beats = txt(t, "beats"), groups = beats.includes("+") ? beats.split("+").map(Number) : null;
            const time = { n: groups ? groups.reduce((a, g) => a + g, 0) : +beats, d: +txt(t, "beat-type") };
            if (groups) time.groups = groups;
            if (mi === 0) score.time = time; else setMark(mi, "time", time);
          }
          // a TAB staff: its tuning and capo (line 1 is the lowest string); its notes repeat the other staff's, so they're skipped
          for (const sd of kids(el, "staff-details")) {
            const num = +(sd.attrs.number || 1), tun = kids(sd, "staff-tuning").sort((a, b) => +a.attrs.line - +b.attrs.line);
            if (tun.length) tabTuning = { num, opens: tun.map((t) => midiOf(txt(t, "tuning-step"), +txt(t, "tuning-alter") || 0, +txt(t, "tuning-octave"))) };
            if (kid(sd, "capo")) tabCapo = +txt(sd, "capo") || 0;
          }
          for (const c of kids(el, "clef")) {
            if (txt(c, "sign") === "TAB") { tabStaff = +(c.attrs.number || 1); continue; }
            const s = txt(c, "sign"), l = +txt(c, "line"), o = +txt(c, "clef-octave-change") || 0, num = +(c.attrs.number || 1);
            const name = s === "F" ? "bass" : s === "C" ? (l === 4 ? "tenor" : "alto") : s === "percussion" ? "percussion" : o === -1 ? "treble8vb" : "treble";
            if (!clefSeen.has(num)) { clefs[num - 1] = name; clefSeen.add(num); if (mi > 0) setMark(mi, "clefs", { ...(bars[mi]?.clefs || {}), [`${pi}:${num - 1}`]: name }); }
            else setMark(mi, "clefs", { ...(bars[mi]?.clefs || {}), [`${pi}:${num - 1}`]: name }); // a clef change from this bar on
          }
          const tp = kid(el, "transpose"); if (tp) { tr = -(+txt(tp, "chromatic") || 0) - 12 * (+txt(tp, "octave-change") || 0); part.transpose = tr; }
        } else if (el.name === "barline") {
          if (!first) continue;
          const rep = kid(el, "repeat"), end = kid(el, "ending"), style = txt(el, "bar-style");
          if (rep?.attrs.direction === "forward") setMark(mi, "repeatStart", true);
          if (rep?.attrs.direction === "backward") setMark(mi, "repeatEnd", +(rep.attrs.times || 2));
          if (end?.attrs.type === "start") { const nums = String(end.attrs.number || "1").split(/[,\s]+/).filter(Boolean).map(Number); setMark(mi, "volta", nums); endingOpen.set(mi, nums); }
          if (end && (end.attrs.type === "stop" || end.attrs.type === "discontinue")) { for (const [st] of endingOpen) { (bars[st].__end = mi); endingOpen.delete(st); } }
          if ((el.attrs.location || "right") === "right" && !rep) {
            if (style === "light-light") setMark(mi, "barline", "double");
            else if (style === "dashed") setMark(mi, "barline", "dashed");
            else if (style === "light-heavy" && mi < measures.length - 1) setMark(mi, "barline", "final");
          }
        } else if (el.name === "direction") {
          const types = kids(el, "direction-type").flatMap((d) => d.kids), snd = kid(el, "sound");
          const dv = dirVoice(+(txt(el, "staff") || 1), txt(el, "voice") || "");
          for (const d of types) {
            if (d.name === "metronome" && first && kid(d, "per-minute")) {
              const tempo = Math.round(+txt(d, "per-minute") * (txt(d, "beat-unit") === "half" ? 2 : txt(d, "beat-unit") === "eighth" ? 0.5 : 1) * (kid(d, "beat-unit-dot") ? 1.5 : 1));
              if (mi === 0 && pos === 0) score.tempo = tempo; else setMark(mi, "tempo", tempo);
            }
            if (d.name === "dynamics" && d.kids[0] && DYN_VEL[d.kids[0].name]) pendingDyn.push({ voice: dv, dyn: d.kids[0].name });
            if (d.name === "rehearsal" && first) setMark(mi, "mark", d.text.trim());
            if (d.name === "segno" && first) addNav(mi, "Segno");
            if (d.name === "coda" && first) addNav(mi, "Coda");
            if (d.name === "words" && TECHS.includes(d.text.trim().toLowerCase())) { pendingTech.push({ voice: dv, tech: d.text.trim().toLowerCase() }); continue; }
            if (d.name === "words" && first) {
              const w = d.text.trim(), nav = NAVS.find((n) => n.toLowerCase() === w.toLowerCase());
              if (nav) addNav(mi, nav); else if (w) setMark(mi, "text", bars[mi]?.text ? bars[mi].text + " " + w : w);
            }
            const spanType = d.name === "wedge" ? (d.attrs.type === "crescendo" ? "cresc" : d.attrs.type === "diminuendo" ? "dim" : "stop:wedge")
              : d.name === "octave-shift" ? (d.attrs.type === "down" ? "8va" : d.attrs.type === "up" ? "8vb" : "stop:octave")
              : d.name === "pedal" ? (d.attrs.type === "start" ? "pedal" : d.attrs.type === "stop" ? "stop:pedal" : null) : null;
            if (spanType && !spanType.startsWith("stop:")) dirStarts.push({ type: spanType, voice: dv });
            else if (spanType) {
              const fam = spanType.slice(5), types2 = fam === "wedge" ? ["cresc", "dim"] : fam === "octave" ? ["8va", "8vb"] : ["pedal"];
              for (const ty of types2) { const o = openDir.get(ty); if (o) { const lastEv = lastOf.get(o.voice); if (lastEv) score.spans.push({ id: newId("s"), type: ty, part: pi, voice: o.voice, from: o.from, to: lastEv.id }); openDir.delete(ty); } }
            }
          }
          if (snd?.attrs.tempo && first && !types.some((d) => d.name === "metronome")) { const tempo = Math.round(+snd.attrs.tempo); if (mi === 0 && pos === 0) score.tempo = tempo; else setMark(mi, "tempo", tempo); }
        } else if (el.name === "harmony") {
          const r = kid(el, "root"), kd = kid(el, "kind"), b = kid(el, "bass");
          if (r) {
            const nameOf = (s, a) => s + (a > 0 ? "#".repeat(a) : "b".repeat(-a));
            const root = nameOf(txt(r, "root-step"), +txt(r, "root-alter") || 0), kindTxt = kd?.attrs.text;
            const id = KIND_BACK[txt(kd)] || null, suffix = kindTxt !== undefined ? kindTxt : id ? TYPE[id].sym : "";
            const sym = root + suffix + (b ? "/" + nameOf(txt(b, "bass-step"), +txt(b, "bass-alter") || 0) : "");
            pendingChord = parseChord(sym) ? sym : parseChord(root + (id ? TYPE[id].sym : "")) ? root + (id ? TYPE[id].sym : "") : root;
            // a transposing part's chord symbols are written for the player: back to concert
            if (tr) pendingChord = transposeChordSymbol(pendingChord, -tr, writtenKey(writtenFifths, -tr));
          }
        } else if (el.name === "backup") pos -= Math.round(+txt(el, "duration") * TPQ / div);
        else if (el.name === "forward") { pos += Math.round(+txt(el, "duration") * TPQ / div); maxPos = Math.max(maxPos, pos); }
        else if (el.name === "note") {
          if (kid(el, "cue")) continue;
          const isChord = !!kid(el, "chord"), d = Math.round(+txt(el, "duration") * TPQ / div);
          if (tabStaff && staves === 2 && +(txt(el, "staff") || 1) === tabStaff) { if (!isChord && !kid(el, "grace")) { pos += d; maxPos = Math.max(maxPos, pos); } continue; }
          const v = ourVoice(+(txt(el, "staff") || 1), txt(el, "voice") || "1");
          const pitch = kid(el, "pitch"), rest = kid(el, "rest"), nots = kid(el, "notations"), techEl = kid(nots, "technical");
          let n = null;
          if (pitch) {
            const step = txt(pitch, "step"), alter = +txt(pitch, "alter") || 0, oct = +txt(pitch, "octave");
            n = { midi: midiOf(step, alter, oct) - tr, tie: kids(el, "tie").some((t) => t.attrs.type === "start"), spell: { step, alter } };
            // how this note is played and shown: fingering, notehead, harmonic
            const fg = txt(techEl, "fingering") || txt(techEl, "pluck"); if (fg) n.finger = fg;
            const head = txt(el, "notehead");
            const strNo = +txt(techEl, "string"); if (Number.isInteger(strNo) && strNo > 0) n.string = strNo;
            if (kid(techEl, "harmonic")) n.harm = true;
            else if (["x", "diamond", "slash", "triangle", "circle-x"].includes(head)) n.head = head;
          }
          // grace notes wait for the note they lead into (a chord of graces stacks)
          if (kid(el, "grace")) {
            if (!n || v < 0) continue;
            const list = pendingGraces.get(v) || []; pendingGraces.set(v, list);
            const gn = { midi: n.midi };
            if (isChord && list.length) list[list.length - 1].notes.push(gn); else list.push({ slash: kid(el, "grace").attrs.slash === "yes", notes: [gn] });
            continue;
          }
          if (isChord) { const le = lastOf.get(v); if (le && n && !le.rest) { le.notes.push(n); if (kid(nots, "arpeggiate")) le.arp = true; } continue; }
          const at = measureStart + pos;
          pos += d; maxPos = Math.max(maxPos, pos);
          if (v < 0) continue; // a fifth voice: no room for it
          const arr = voiceArr(v), have = voiceLength(arr);
          if (at < have) continue; // overlapping music in one voice can't be held
          if (at > have) arr.push(newEvent(at - have));
          const ev = rest || !n ? newEvent(rest?.attrs.measure === "yes" && !d ? barTicks(score, mi) : d) : { id: newId(), dur: d, rest: false, notes: [n] };
          if (txt(el, "notehead") === "slash" && (rest || !n)) { ev.rest = true; ev.notes = []; ev.slash = true; } // rhythm slashes: a lead sheet's beats
          const tm = kid(el, "time-modification");
          // tuplets: the open <tuplet> brackets give each level's ratio (nested ones multiply into time-modification)
          const stack = tupStack.get(v) || []; tupStack.set(v, stack);
          const tupEls = kids(nots, "tuplet"), typeTicks = (t) => (t ? TYPE_TICKS[t] || null : null);
          for (const te of tupEls) if (te.attrs.type === "start") {
            const ta = kid(te, "tuplet-actual"), tn = kid(te, "tuplet-normal");
            stack.push({ num: te.attrs.number || "1", n: ta ? +txt(ta, "tuplet-number") : null, of: tn ? +txt(tn, "tuplet-number") : null, unit: typeTicks(txt(tn, "tuplet-type")) });
          }
          if (tm) {
            const A = +txt(tm, "actual-notes"), N = +txt(tm, "normal-notes"), nt = typeTicks(txt(tm, "normal-type"));
            const full = stack.filter((x) => x.n && x.of);
            if (full.length >= 2) {
              const [o, inner] = full.slice(-2);
              ev.tuplet = { n: inner.n, of: inner.of, ...(inner.unit ? { unit: inner.unit } : {}), outer: { n: o.n, of: o.of, ...(o.unit ? { unit: o.unit } : {}) } };
            } else {
              ev.tuplet = { n: A, of: N };
              const u = nt ? nt * (kids(tm, "normal-dot").length ? 1.5 : 1) : full[0]?.unit || null;
              if (u) ev.tuplet.unit = u;
            }
          }
          for (const te of tupEls) if (te.attrs.type === "stop") { const k = stack.map((x) => x.num).lastIndexOf(te.attrs.number || "1"); if (k >= 0) stack.splice(k, 1); }
          // ornaments, tremolo, arpeggio, technique, graces
          const ornEl = kid(nots, "ornaments");
          if (ornEl) {
            const names = ornEl.kids.map((k) => k.name), wavy = kids(ornEl, "wavy-line");
            const o = names.includes("inverted-mordent") ? "invmordent" : names.includes("mordent") ? "mordent" : names.includes("inverted-turn") ? "invturn" : names.includes("turn") ? "turn" : null;
            const trillLine = wavy.some((w) => w.attrs.type === "start");
            if (o) ev.orn = o; else if (names.includes("trill-mark") && !trillLine) ev.orn = "trill";
            const am = txt(ornEl, "accidental-mark"); if (am && ev.orn) { const back = { "flat-flat": -2, flat: -1, natural: 0, sharp: 1, "double-sharp": 2 }; if (back[am] !== undefined) ev.ornAcc = back[am]; }
            const trem = kid(ornEl, "tremolo"); if (trem) ev.trem = trem.attrs.type === "unmeasured" ? 3 : Math.max(1, Math.min(3, +trem.text.trim() || 1));
            if (trillLine) openTrill.set(v, ev.id);
            if (wavy.some((w) => w.attrs.type === "stop")) { const from = openTrill.get(v); if (from) { score.spans.push({ id: newId("s"), type: "trill", part: pi, voice: v, from, to: ev.id }); openTrill.delete(v); } }
          }
          const arpEl = kid(nots, "arpeggiate"); if (arpEl) { ev.arp = true; if (arpEl.attrs.direction) ev.arpDir = arpEl.attrs.direction; }
          for (const gl of [...kids(nots, "glissando"), ...kids(nots, "slide")]) {
            if (gl.attrs.type === "start") openGliss.set(v, ev.id);
            else if (gl.attrs.type === "stop") { const from = openGliss.get(v); if (from) { score.spans.push({ id: newId("s"), type: "gliss", part: pi, voice: v, from, to: ev.id }); openGliss.delete(v); } }
          }
          const tk = pendingTech.findIndex((x) => x.voice === v || x.voice < 0); if (tk >= 0) { ev.tech = pendingTech[tk].tech; pendingTech.splice(tk, 1); }
          if (pendingGraces.get(v)?.length) { if (!ev.rest) ev.graces = pendingGraces.get(v); pendingGraces.set(v, []); }
          const lyr = kid(el, "lyric");
          if (lyr && txt(lyr, "text")) { ev.lyric = txt(lyr, "text"); const syl = txt(lyr, "syllabic"); if (syl === "begin" || syl === "middle") ev.lyricHyphen = true; }
          const arts = kid(nots, "articulations");
          const artic = [...(arts?.kids || []).map((a) => a.name).filter((a) => ["staccato", "accent", "tenuto"].includes(a)), ...(kid(nots, "fermata") ? ["fermata"] : [])];
          if (artic.length) ev.artic = artic;
          if (pendingChord) { ev.chord = pendingChord; pendingChord = null; }
          const dyn = pendingDyn.findIndex((x) => x.voice === v || x.voice < 0);
          if (dyn >= 0) { ev.dyn = pendingDyn[dyn].dyn; pendingDyn.splice(dyn, 1); }
          arr.push(ev); lastOf.set(v, ev);
          // spans: directions that start here, slurs from the notations
          dirStarts = dirStarts.filter((ds) => { if (ds.voice === v || ds.voice < 0) { openDir.set(ds.type, { from: ev.id, voice: v }); return false; } return true; });
          for (const sl of kids(nots, "slur")) {
            const num = sl.attrs.number || "1";
            if (sl.attrs.type === "start") openSlurs.set(num, { from: ev.id, voice: v });
            else if (sl.attrs.type === "stop") { const o = openSlurs.get(num); if (o && o.voice === v) score.spans.push({ id: newId("s"), type: "slur", part: pi, voice: v, from: o.from, to: ev.id }); openSlurs.delete(num); }
          }
        }
      }
      if (mi === 0 && mel.attrs.implicit === "yes" && first) score.pickup = maxPos;
      // the bar is as long as its music (a pickup, an odd last bar), or the time signature's bar when it's empty
      measureStart += maxPos > 0 ? maxPos : barTicks(score, mi);
    });
    // TAB: notes and TAB (two staves) or TAB only become one staff shown that way, with the tuning and capo
    if (tabStaff) {
      const tabOnly = staves === 1;
      if (!tabOnly) { staves = 1; part.staves = 1; if (tabStaff === 1) clefs[0] = clefs[1]; }
      if (tabOnly || !clefSeen.has(tabStaff === 1 ? 2 : 1)) clefs[0] = tabClef(part.instrument);
      part.notation = tabOnly ? "tab" : "both";
      const tn = tabTuning ? tuningByOpens(part.instrument, tabTuning.opens) : null;
      if (tn) part.tuning = tn;
      if (tabCapo) part.capo = tabCapo;
    }
    part.clefs = staves === 2 ? [clefs[0], clefs[1]] : [clefs[0]];
    part.clef = part.clefs[0];
    if (staves === 1) part.voiceStaff = [0, 0, 0, 0];
    // the score's key is the concert key: undo the part's transposition
    if (first) score.key = writtenKey(key0, -tr);
    score.parts.push(part);
    first = false;
  }
  if (!score.parts.length) score.parts.push(newPart());
  if (score.pickup >= barTicks(score)) score.pickup = 0;
  // endings: keep how many bars each runs only where that differs from the usual rule
  for (const [k, b] of Object.entries(bars)) {
    const end = b.__end; delete b.__end;
    if (end === undefined || !b.volta) continue;
    const usual = voltaRegions(barInfo(score)).get(+k)?.end;
    if (usual !== end) b.voltaBars = end - +k + 1;
  }
  score.bars = bars;
  function addNav(i, nav) { const cur = bars[i]?.nav; setMark(i, "nav", cur === undefined ? nav : [].concat(cur, nav)); }
  // keep a written spelling only where it differs from how the layout would spell it anyway
  const plain = { ...score, parts: score.parts.map((q) => ({ ...q, voices: q.voices.map((v) => v.map((e) => ({ ...e, notes: (e.notes || []).map((n) => ({ ...n, spell: null })) }))) })) };
  score.parts.forEach((p, pi) => p.voices.forEach((voice, vi) => {
    const lay = layout(plain, pi, { transposed: !!p.transpose, voice: vi });
    const byRef = new Map(); for (const m of lay) for (const ev of m.events) if (ev.ref >= 0 && !byRef.has(ev.ref)) byRef.set(ev.ref, ev);
    voice.forEach((e, ref) => {
      const l = byRef.get(ref);
      (e.notes || []).forEach((n) => {
        const got = l?.notes.find((x) => x.midi === n.midi + (p.transpose || 0));
        n.spell = got && n.spell && (got.step !== n.spell.step || got.alter !== n.spell.alter) && !p.transpose ? n.spell : null;
      });
      if (e.notes) e.notes.sort((a, b) => a.midi - b.midi);
    });
  }));
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
/**
 * A Standard MIDI File (type 1): a conductor track (tempo map, time and key signatures as played, repeats unrolled),
 * then one track per part on its own channel (skipping 10, the drum channel). Muted parts are still written.
 */
export function toMidiFile(score) {
  const meta = (type, data) => [0xff, type, ...vlq(data.length), ...data];
  const tl = timeline(score), bars = barInfo(score), tracks = [];
  // the conductor track: what changes where, in played ticks
  const cond = [[0, meta(0x03, str(score.title || "Untitled"))]];
  let prev = null;
  for (const sg of tl.segments) {
    const b = bars[sg.bar];
    if (!prev || prev.tempo !== b.tempo) { const us = Math.round(60e6 / b.tempo); cond.push([sg.ptick, meta(0x51, [(us >> 16) & 255, (us >> 8) & 255, us & 255])]); }
    if (!prev || !sameTime(prev.time, b.time)) cond.push([sg.ptick, meta(0x58, [b.time.n, Math.log2(b.time.d), (24 * 4) / b.time.d * (isCompound(b.time) ? 3 : 1), 8])]);
    if (!prev || prev.key !== b.key || prev.mode !== b.mode) cond.push([sg.ptick, meta(0x59, [b.key & 255, b.mode === "minor" ? 1 : 0])]);
    prev = b;
  }
  if (!tl.segments.length) { const us = Math.round(60e6 / score.tempo); cond.push([0, meta(0x51, [(us >> 16) & 255, (us >> 8) & 255, us & 255])]); }
  const t0 = []; let last = 0;
  for (const [t, bytes] of cond.sort((a, b) => a[0] - b[0])) { t0.push(...vlq(t - last), ...bytes); last = t; }
  t0.push(0, 0xff, 0x2f, 0);
  tracks.push(t0);
  const sounds = playbackEvents(score, { all: true });
  score.parts.forEach((p, pi) => {
    const ch = pi >= 9 ? pi + 1 : pi, evs = [];
    for (const s of sounds.filter((x) => x.part === pi)) {
      const on = s.ptick, off = Math.max(on + 1, on + s.pticks);
      evs.push([on, 1, [0x90 | ch, s.midi & 127, s.vel & 127]], [off, 0, [0x80 | ch, s.midi & 127, 0]]);
    }
    evs.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const out = [0, ...meta(0x03, str(p.name || `Part ${pi + 1}`)), 0, 0xc0 | ch, programOf(p.instrument) & 127, 0, 0xb0 | ch, 7, Math.round((p.volume ?? 0.8) * 127) & 127];
    let lt = 0;
    for (const [t, , bytes] of evs) { out.push(...vlq(t - lt), ...bytes); lt = t; }
    out.push(0, 0xff, 0x2f, 0);
    tracks.push(out);
  });
  const head = chunk("MThd", [0, 1, 0, tracks.length, (TPQ >> 8) & 255, TPQ & 255]);
  return Uint8Array.from([...head, ...tracks.flatMap((t) => chunk("MTrk", t))]);
}
/** Read a MIDI file's notes back: { format, division, tracks: [{ name, program, notes: [{ midi, tick, dur, vel, ch }] }], tempo, tempos: [{ tick, bpm }], time, key } */
export function readMidiFile(bytes) {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const s4 = (o) => String.fromCharCode(u[o], u[o + 1], u[o + 2], u[o + 3]), be32 = (o) => ((u[o] << 24) | (u[o + 1] << 16) | (u[o + 2] << 8) | u[o + 3]) >>> 0;
  if (s4(0) !== "MThd") throw new Error("Not a MIDI file.");
  const format = (u[8] << 8) | u[9], ntr = (u[10] << 8) | u[11], division = (u[12] << 8) | u[13];
  const out = { format, division, tracks: [], tempo: 120, tempos: [], time: null, key: null };
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
        if (type === 0x03) tr.name = new TextDecoder().decode(d);
        if (type === 0x51) { const bpm = Math.round((60e6 / ((d[0] << 16) | (d[1] << 8) | d[2])) * 100) / 100; if (!out.tempos.length) out.tempo = Math.round(bpm); out.tempos.push({ tick: t, bpm }); }
        if (type === 0x58 && !out.time) out.time = { n: d[0], d: 2 ** d[1] }; if (type === 0x59 && !out.key) out.key = { fifths: d[0] > 127 ? d[0] - 256 : d[0], minor: !!d[1] }; continue; }
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

// ---------- a lead sheet from a song's chords and words (ENCORE. Songbook) ----------

/** A key as fifths from a name ("G", "Em", "Bb minor") or a number; { key, mode } */
export function parseKey(k) {
  if (typeof k === "number") return { key: Math.max(-7, Math.min(7, k)), mode: "major" };
  const m = /^\s*([A-Ga-g])([#b]?)\s*(m|min|minor|maj|major)?\s*$/.exec(String(k || ""));
  if (!m) return { key: 0, mode: "major" };
  const tonic = m[1].toUpperCase() + m[2], mode = m[3] && /^m(in(or)?)?$/i.test(m[3]) ? "minor" : "major";
  const found = [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6, 7, -7].find((f) => keyName(f, mode).split(" ")[0] === tonic);
  return { key: found ?? 0, mode };
}
/**
 * A lead sheet: { title, artist, key: "G" | "Em" | fifths, tempo, time, sections: [{ name, lines: [{ chords: [...], lyric }] }] }.
 * One part of rhythm slashes: each chord gets a bar (two to a bar when a line has more than four chords), a line with
 * none gets one bar; the line's words sit over its first bar (bar text) and each section starts with a rehearsal mark.
 */
export function fromLeadSheet(sheet) {
  const time = sheet.time || { n: 4, d: 4 }, { key, mode } = parseKey(sheet.key), bar = fullBar(time);
  const s = newScore({ title: sheet.title || "Untitled", tempo: sheet.tempo || 100, time, key, mode, bars: 0, part: { name: "Lead sheet", instrument: "Voice (soprano, alto)" } });
  s.composer = sheet.artist || "";
  const v = s.parts[0].voices[0];
  // one slash a beat (the way lead sheets are written), the chord on the beat it starts
  const beat = 1920 / time.d, perBar = Math.max(1, Math.round(bar / beat));
  const slashes = (dur, chord) => { const out = []; for (let t = 0; t < dur; t += beat) out.push({ ...newEvent(Math.min(beat, dur - t)), slash: true, ...(t === 0 && chord ? { chord } : {}) }); return out; };
  let bi = 0;
  for (const sec of sheet.sections || []) {
    let firstOfSection = true;
    for (const line of sec.lines || []) {
      const chords = (line.chords || []).map((c) => String(c).trim()).filter((c) => parseChord(c));
      const startBar = bi, first = v.length;
      if (!chords.length) { v.push(...slashes(bar)); bi++; }
      else if (chords.length <= 4) for (const c of chords) { v.push(...slashes(bar, c)); bi++; }
      else for (let i = 0; i < chords.length; i += 2) { v.push(...slashes(bar / 2, chords[i]), ...slashes(bar / 2, chords[i + 1])); bi++; } // an odd last chord holds its bar's second half
      // the line's words under its beats: spread out when there's room, a few to a beat when there isn't
      const words = String(line.lyric || "").trim().split(/\s+/).filter(Boolean), slots = v.slice(first);
      if (words.length && slots.length) {
        if (words.length <= slots.length) words.forEach((w, i) => { slots[Math.floor((i * slots.length) / words.length)].lyric = w; });
        else slots.forEach((e, j) => { const a = Math.floor((j * words.length) / slots.length), b = Math.floor(((j + 1) * words.length) / slots.length); if (b > a) e.lyric = words.slice(a, b).join(" "); });
      }
      if (firstOfSection && sec.name) s.bars[startBar] = { ...(s.bars[startBar] || {}), mark: sec.name };
      firstOfSection = false;
      void perBar;
    }
    if (firstOfSection && sec.name) { s.bars[bi] = { mark: sec.name }; v.push(...slashes(bar)); bi++; } // a section with no lines still gets its bar
  }
  return s;
}
