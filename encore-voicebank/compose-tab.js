// ENCORE. Compose: guitar TAB. Which instruments can show TAB, their tunings (from
// tunings.js, the list Tune uses) and capo, and the fret picker: every note on a TAB
// part sounds a pitch (note.midi, concert pitch); note.string (1 = the highest string,
// the top TAB line) is optional, and the fret follows from pitch + string + tuning + capo.
// A note with no string (or one it can't be played on) gets one picked here: low
// positions first, the hand kept in one place across nearby notes, chords spread over
// the strings with one note a string, tied notes kept on their string. Pure, no page
// (test-compose-tab.mjs). Strings are courses (a 12-string's pairs are one TAB line),
// worked out by chords-voicing.js so a banjo's short 5th string behaves the same here.
import { TUNINGS } from "./tunings.js";
import { coursesOf, courseNotes, frettable } from "./chords-voicing.js";

export const MAX_FRET = 24;
const INSTRUMENTS = TUNINGS.families.flatMap((f) => f.instruments.map((i) => ({ ...i, family: f.name })));
// the families where TAB is what players read, so a new part shows it under the notes from the start
const TAB_FAMILIES = ["Guitars", "Basses", "Ukuleles", "Mandolins", "Banjos"];
const NO_TAB_DEFAULT = ["Upright / double bass"];

/** The tunings.js instrument behind a part's instrument name, when it can be shown as TAB (else null) */
export function tabInstrument(name) {
  const i = INSTRUMENTS.find((x) => x.name === name);
  return i && frettable(i) && i.tunings.some((t) => t.midi.length >= 3) ? i : null;
}
export const tabCapable = (name) => !!tabInstrument(name);
/** How a new part of this instrument is shown: "both" (notes and TAB) for guitars, basses, ukuleles, banjos and mandolins */
export function defaultNotation(name) {
  const i = tabInstrument(name);
  return i && TAB_FAMILIES.includes(i.family) && !NO_TAB_DEFAULT.includes(i.name) ? "both" : "standard";
}
/** "standard" | "tab" | "both": what the part shows (a part that can't show TAB is always standard) */
export function notationOf(part) {
  const n = part?.notation;
  if ((n === "tab" || n === "both") && tabCapable(part.instrument) && (part.staves || 1) === 1) return n;
  return "standard";
}
export const showsTab = (part) => notationOf(part) !== "standard";

const pc = (name) => String(name).replace(/-?\d+$/, "");
/** The part's tuning: { name, midi, notes, standard, courses } (part.tuning is a tuning name for its instrument; the first is standard) */
export function tuningOf(part) {
  const inst = tabInstrument(part?.instrument);
  if (!inst) return null;
  const list = inst.tunings.filter((t) => t.midi.length >= 3);
  const t = list.find((x) => x.name === part.tuning) || list[0];
  const courses = coursesOf(t, inst.name);
  // one name per course (a pair shows its main string)
  let k = 0;
  const full = (t.courses?.length ? t.courses : t.midi.map(() => 1)).map((size) => { const n = t.notes[k] || ""; k += size; return n; }), notes = full.map(pc);
  return { name: t.name, midi: t.midi, notes, full, standard: t === list[0], courses, instrument: inst.name };
}
/** The tunings an instrument has (names), standard first */
export function tuningNames(instrument) {
  const inst = tabInstrument(instrument);
  return inst ? inst.tunings.filter((t) => t.midi.length >= 3).map((t) => t.name) : [];
}
/**
 * The part's strings in TAB order: [string 1 (top line, highest), string 2, ...], each
 * { number, open (its lowest sounding pitch), midi (every string in the course), start (fret a short string begins at) }.
 */
export function stringsOf(part) {
  const t = tuningOf(part);
  if (!t) return [];
  const n = t.courses.length;
  return t.courses.map((c, i) => ({ ...c, name: t.notes[i], full: t.full[i], number: n - i })).reverse();
}
export const capoOf = (part) => Math.max(0, Math.min(12, Math.round(+part?.capo || 0)));
/** The words over a TAB staff when it isn't plain standard tuning: "Drop D (D A D G B E), capo 2" */
export function tuningLabel(part) {
  const t = tuningOf(part), capo = capoOf(part);
  if (!t) return "";
  const parts = [];
  if (!t.standard) parts.push(`Tuning: ${t.name} (${t.notes.join(" ")})`);
  if (capo) parts.push(parts.length ? `capo ${capo}` : `Capo ${capo}`);
  return parts.join(", ");
}

/** The pitch a string sounds at a fret (fret counted from the capo), or null */
export function pitchFor(str, fret, capo = 0) {
  const n = courseNotes(str, fret, capo);
  return n ? Math.min(...n) : null;
}
/** The fret that plays a pitch on a string (counted from the capo), or null when it can't */
export function fretFor(str, midi, capo = 0, maxFret = MAX_FRET) {
  let f;
  if (str.start > 0) {
    // a short string (banjo 5th): open, or fretted from its own start; it has its own capo
    if (midi === str.open) return 0;
    f = midi - str.open + str.start - capo;
    if (f + capo <= str.start) return null;
  } else f = midi - str.open - capo;
  return f >= 0 && f <= maxFret ? f : null;
}

/**
 * Strings for one chord (or one note). midis: the pitches; strings: stringsOf(part); opts:
 * { capo, fixed: [string number or null per note], pos: the hand's position (the fret under the first finger; null: anywhere) }.
 * The hand covers four frets from pos (a fret either side is a stretch); a note outside it means moving the hand.
 * Returns [string number or null per note] (null: it doesn't fit, more notes than strings or out of range).
 */
export function placeChord(midis, strings, opts = {}) {
  const capo = opts.capo || 0, fixed = opts.fixed || [], pos = opts.pos ?? null;
  const byNum = new Map(strings.map((s) => [s.number, s]));
  const cands = midis.map((m, i) => {
    const f = fixed[i], s = f ? byNum.get(f) : null;
    if (s && fretFor(s, m, capo) !== null) return [{ n: f, fret: fretFor(s, m, capo) }];
    return strings.map((st) => ({ n: st.number, fret: fretFor(st, m, capo) })).filter((c) => c.fret !== null);
  });
  // notes with the fewest choices first, so the search is small
  const order = midis.map((_, i) => i).sort((a, b) => cands[a].length - cands[b].length);
  let best = null, bestCost = Infinity;
  const pick = new Array(midis.length).fill(null), used = new Set();
  // a chord (three notes or more) is a shape: low, easy shapes matter more than staying put
  const chord = midis.length >= 3, low = pos === null || chord ? 0.15 : 0.05;
  const cost = () => {
    let c = 0;
    const fretted = [];
    for (let i = 0; i < pick.length; i++) {
      const p = pick[i];
      if (!p) { c += 100; continue; }
      const f = p.fret;
      c += low * f + (f > 12 ? 0.3 * (f - 12) : 0);
      if (f > 0) fretted.push(f);
      else if (pos !== null && pos > 5) c += 0.6; // open strings far from the hand are possible, just less handy
    }
    if (fretted.length) {
      const lo = Math.min(...fretted), hi = Math.max(...fretted), span = hi - lo;
      if (span > 3) c += 1.5 * (span - 3) + (span > 4 ? 4 * (span - 4) : 0);
      if (pos !== null) {
        // inside the hand (four frets from pos): free; a fret either side: a stretch; further: the hand moves,
        // a small cost for the move and a little more the further it goes
        const out = Math.max(pos - lo, hi - pos - 3, 0);
        c += (out === 0 ? 0 : out === 1 && span <= 3 ? 0.5 : 1 + Math.min(out, 5) * 0.5) * (chord ? 0.5 : 1);
      }
    }
    return c;
  };
  const go = (k) => {
    if (k === order.length) { const c = cost(); if (c < bestCost) { bestCost = c; best = pick.slice(); } return; }
    const i = order[k];
    let placed = false;
    for (const c of cands[i]) {
      if (used.has(c.n)) continue;
      placed = true;
      used.add(c.n); pick[i] = c; go(k + 1); used.delete(c.n); pick[i] = null;
    }
    // left out only when it can't go anywhere free (more notes than strings, or out of range)
    if (!placed) { pick[i] = null; go(k + 1); }
  };
  go(0);
  return (best || pick).map((p) => (p ? p.n : null));
}

/**
 * The TAB for a voice: per event, null for a rest, else [{ string, fret, auto }] per note (in the event's note order;
 * string and fret null when the note can't be played). Notes with a playable note.string keep it (auto false).
 * Picked left to right, so writing on doesn't move the frets before it.
 */
export function tabVoice(part, voice) {
  const strings = stringsOf(part), capo = capoOf(part);
  if (!strings.length) return (voice || []).map(() => null);
  const byNum = new Map(strings.map((s) => [s.number, s]));
  let pos = null, tied = new Map(); // midi -> string, for notes tied over from the event before
  return (voice || []).map((e) => {
    if (e.rest || !e.notes?.length) { tied = new Map(); return null; }
    const midis = e.notes.map((n) => n.midi);
    const own = e.notes.map((n) => (n.string && byNum.has(n.string) && fretFor(byNum.get(n.string), n.midi, capo) !== null ? n.string : null));
    const fixed = own.map((s, i) => s ?? tied.get(midis[i]) ?? null);
    const strs = placeChord(midis, strings, { capo, fixed, pos });
    const out = strs.map((s, i) => ({ string: s, fret: s ? fretFor(byNum.get(s), midis[i], capo) : null, auto: own[i] === null }));
    const fretted = out.filter((x) => x.fret > 0).map((x) => x.fret);
    // the hand moves only as far as it has to (it starts with the first finger a fret below the first note)
    if (fretted.length) {
      const lo = Math.min(...fretted), hi = Math.max(...fretted);
      if (pos === null) pos = Math.max(1, lo - (hi - lo >= 3 ? 0 : 1));
      else if (lo < pos) pos = lo;
      else if (hi > pos + 3) pos = Math.min(lo, hi - 3);
    }
    tied = new Map(e.notes.map((n, i) => [n.tie && out[i].string ? n.midi : null, out[i].string]).filter(([m]) => m !== null));
    return out;
  });
}

/**
 * Move one note of an event to the next string up (toward string 1, the top line) or down, keeping its pitch.
 * Every note of the event is pinned where it is now; a note already on the target string swaps over when it fits.
 * Returns the new event (a copy) or null when there's no string to go to.
 */
export function moveString(part, voice, index, noteIndex, up) {
  const e = voice?.[index];
  if (!e || e.rest || !e.notes?.[noteIndex]) return null;
  const strings = stringsOf(part), capo = capoOf(part), now = tabVoice(part, voice)[index];
  const byNum = new Map(strings.map((s) => [s.number, s]));
  const cur = now[noteIndex].string, midi = e.notes[noteIndex].midi;
  if (!cur) return null;
  const next = structuredCloneish(e);
  next.notes.forEach((n, i) => { if (now[i].string) n.string = now[i].string; });
  for (let s = cur + (up ? -1 : 1); s >= 1 && s <= strings.length; s += up ? -1 : 1) {
    if (fretFor(byNum.get(s), midi, capo) === null) continue;
    const other = now.findIndex((x, i) => i !== noteIndex && x.string === s);
    if (other >= 0) {
      if (fretFor(byNum.get(cur), e.notes[other].midi, capo) === null) continue;
      next.notes[other].string = cur;
    }
    next.notes[noteIndex].string = s;
    return next;
  }
  return null;
}
const structuredCloneish = (o) => JSON.parse(JSON.stringify(o));

/** The pitch for a fret typed on a string of the part (null when it can't be played there) */
export function pitchOnString(part, string, fret) {
  const s = stringsOf(part).find((x) => x.number === string);
  if (!s || !(fret >= 0) || fret > MAX_FRET) return null;
  const m = pitchFor(s, Math.round(fret), capoOf(part));
  return m === null || fretFor(s, m, capoOf(part)) !== Math.round(fret) ? null : m;
}

/** The tuning name of an instrument whose strings (lowest TAB line first) are these open pitches, or null */
export function tuningByOpens(instrument, opens) {
  for (const name of tuningNames(instrument)) {
    const s = stringsOf({ instrument, tuning: name }).reverse();
    if (s.length === opens.length && s.every((x, i) => x.open === opens[i])) return name;
  }
  return null;
}
/** The usual clef for notes of a TAB instrument: bass clef for basses, treble 8vb for guitars, treble for the rest */
export function tabClef(instrument) {
  const i = tabInstrument(instrument);
  return !i ? "treble" : i.family === "Basses" ? "bass" : i.family === "Guitars" ? "treble8vb" : "treble";
}
