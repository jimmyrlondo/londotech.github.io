// Encore Scales: where a scale's notes are on a fretted instrument. The whole neck, box positions
// (CAGED-style), and three-notes-per-string patterns, all worked out from the tuning so they work on
// any instrument in tunings.js. No page in here (test-scales.mjs tests it).
import { pcOf, mod12 } from './chords-core.js';
import { courseNotes } from './chords-voicing.js';
import { spellScale, parentOf, SCALE } from './scales-core.js';

/** A course's pitch at a fret counted from the capo (its first string; a pair in octaves shares the pitch class) */
const pitchAt = (course, fret, capo) => { const m = courseNotes(course, fret, capo); return m ? m[0] : null; };
/** True when each course is higher than the one before (a guitar; not a ukulele with a high G or a banjo) */
export const ascending = courses => courses.every((c, i) => i === 0 || (c.open > courses[i - 1].open && !c.start));

/**
 * Every scale note on the neck. Each: { course, fret (from the capo), midi, pc, d (degree), note (spelled) }.
 * frets: the highest fret counted from the nut, so with a capo the frets above it.
 */
export function neckNotes(scale, root, courses, { capo = 0, frets = 15 } = {}) {
  const notes = spellScale(scale, root), byPc = new Map(notes.map(n => [n.pc, n]));
  const out = [];
  courses.forEach((c, i) => {
    for (let f = 0; f + capo <= frets; f++) {
      const m = pitchAt(c, f, capo);
      if (m == null) continue;
      const n = byPc.get(mod12(m));
      if (n) out.push({ course: i, fret: f, midi: m, pc: n.pc, d: n.d, note: n.note });
    }
  });
  return out;
}

/**
 * Box positions: the scale inside a few frets, low string to high, each pitch played once. For each
 * scale note on the lowest string a window starts at that fret or one below (whichever needs fewer
 * stretches), four frets wide plus one stretch up to fill a gap before the next string. On a 6-string
 * guitar in standard tuning these are the familiar boxes, and the ones that match a CAGED chord shape
 * of the parent major key are named after it.
 * Each: { name, lo, hi (frets), notes (as neckNotes, ascending) }.
 */
export function boxPositions(scale, root, courses, { capo = 0, frets = 15, standard = false } = {}) {
  const n = courses.length;
  if (n < 2) return [];
  const asc = ascending(courses);
  const notes = spellScale(scale, root), byPc = new Map(notes.map(x => [x.pc, x]));
  const maxFret = frets - capo;
  // how wide a hand position is: one fret less than the gap between strings (4 frets on a guitar, 6 on a mandolin)
  const gaps = courses.slice(1).map((c, i) => c.open - courses[i].open).filter(g => g > 0);
  // (the usual gap, so one dropped string doesn't widen every box)
  const usual = gaps.length ? [...gaps].sort((a, b) => a - b)[gaps.length >> 1] : 5;
  const core = Math.max(4, Math.min(7, usual)) - 2;
  const anchor = courses.reduce((b, c, i) => (c.start ? b : (b < 0 || c.open < courses[b].open ? i : b)), -1);
  const build = s => {
    const picked = [];
    let last = -1e9, stretches = 0;
    for (let i = 0; i < n; i++) {
      const c = courses[i], here = [];
      for (let f = Math.max(0, s); f <= Math.min(maxFret, s + core); f++) {
        const m = pitchAt(c, f, capo);
        if (m == null || !byPc.has(mod12(m))) continue;
        if (asc && m <= last) continue;
        here.push({ course: i, fret: f, midi: m });
      }
      // one fret further up when the next string can't reach that pitch inside the box
      const f = s + core + 1;
      if (asc && f <= maxFret) {
        const m = pitchAt(c, f, capo), next = courses[i + 1];
        const reach = next ? m - pitchAt(next, 0, capo) : -1, nextReach = reach >= Math.max(0, s) && reach <= s + core;
        // (the top string's last note doesn't count as a stretch: nothing comes after it)
        if (m != null && byPc.has(mod12(m)) && m > last && !nextReach) { here.push({ course: i, fret: f, midi: m }); if (next) stretches++; }
      }
      for (const x of here) { picked.push(x); last = Math.max(last, x.midi); }
    }
    const per = courses.map((c, i) => picked.filter(x => x.course === i).length);
    const uneven = per.reduce((t, k) => t + (k === 0 ? 3 : k > 3 ? k - 3 : 0), 0);
    return { s, picked, cost: stretches + uneven + (s < 0 ? 9 : 0) };
  };
  const out = [], seen = new Set();
  const starts = [];
  for (let f = 0; f <= Math.min(11, maxFret - core); f++) {
    const m = pitchAt(courses[anchor], f, capo);
    if (m != null && byPc.has(mod12(m))) starts.push(f);
  }
  for (const a of starts) {
    // on a tie, start a fret below the note (the box then begins with the index finger behind it)
    const opts = [...(a > 0 ? [build(a - 1)] : []), build(a)].sort((x, y) => x.cost - y.cost);
    const b = opts[0];
    if (!b.picked.length) continue;
    const key = b.picked.map(x => x.course + ':' + x.fret).join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    const lo = Math.min(...b.picked.map(x => x.fret)), hi = Math.max(...b.picked.map(x => x.fret));
    out.push({ lo, hi, s: b.s, notes: b.picked.map(x => dress(x, byPc)) });
  }
  out.sort((a, b) => a.lo - b.lo);
  out.forEach((p, i) => { p.name = 'Position ' + (i + 1); p.shape = standard ? cagedShape(scale, root, p, courses, capo) : ''; });
  return out;
}
const dress = (x, byPc) => { const n = byPc.get(mod12(x.midi)); return { ...x, pc: n.pc, d: n.d, note: n.note }; };

// which CAGED chord shape of the parent major key a box sits on: where that key's root falls in the box
// (6th string at the box's 2nd fret: E shape, at its 4th: G shape; 5th string: A shape and C shape; 4th string: D shape)
function cagedShape(scale, root, p, courses, capo) {
  let home = null;
  const par = parentOf(scale, root);
  if (par && par.family === 'major') home = pcOf(par.root);
  else if (scale.id === 'major_pent' || scale.id === 'ionian') home = pcOf(root);
  else if (scale.id === 'minor_pent' || scale.id === 'blues') home = mod12(pcOf(root) + 3);
  if (home == null) return '';
  const at = (i, f) => { const m = pitchAt(courses[i], f, capo); return m != null && mod12(m) === home; };
  const s = p.s;
  if (at(0, s + 1)) return 'E shape';
  if (at(0, s + 3)) return 'G shape';
  if (at(1, s + 1)) return 'A shape';
  if (at(1, s + 3)) return 'C shape';
  if (at(2, s + 1)) return 'D shape';
  return '';
}

/**
 * Three notes per string (two for a five-note scale): start on each scale note on the lowest string and
 * keep climbing the scale, the same number of notes on every string. Fast legato and alternate-picking
 * patterns. Only for tunings where each string is higher than the last.
 * Each: { name, lo, hi, notes, startDeg }.
 */
export function perStringPatterns(scale, root, courses, { capo = 0, frets = 15 } = {}) {
  const n = courses.length;
  if (n < 3 || !ascending(courses)) return [];
  const nps = scale.size >= 6 ? 3 : 2;
  const notes = spellScale(scale, root), byPc = new Map(notes.map(x => [x.pc, x]));
  const maxFret = frets - capo;
  // the scale as a ladder of pitches, low to high
  const lowest = pitchAt(courses[0], 0, capo);
  const ladder = [];
  for (let m = lowest; m <= lowest + 60; m++) if (byPc.has(mod12(m))) ladder.push(m);
  const out = [];
  for (let k = 0; k < scale.size; k++) {
    const first = ladder.findIndex(m => mod12(m) === notes[k].pc);
    for (let start = first; start >= 0 && start < ladder.length; start += scale.size) {
      const picked = [];
      let ok = true;
      for (let i = 0; i < n && ok; i++) {
        const open = pitchAt(courses[i], 0, capo);
        for (let j = 0; j < nps; j++) {
          const m = ladder[start + i * nps + j];
          const f = m - open;
          if (m == null || f < 0 || f > maxFret) { ok = false; break; }
          picked.push({ course: i, fret: f, midi: m });
        }
      }
      if (!ok) continue;
      // playable: no string needs more than a 5-fret stretch, and the whole pattern stays within 8 frets
      const per = courses.map((c, i) => picked.filter(x => x.course === i).map(x => x.fret));
      if (per.some(fs => Math.max(...fs) - Math.min(...fs) > 5)) continue;
      const lo = Math.min(...picked.map(x => x.fret)), hi = Math.max(...picked.map(x => x.fret));
      if (hi - lo > 8) continue;
      out.push({ startDeg: notes[k].d, lo, hi, notes: picked.map(x => dress(x, byPc)) });
      break;
    }
  }
  out.sort((a, b) => a.lo - b.lo);
  out.forEach((p, i) => { p.name = nps + ' per string ' + (i + 1); });
  return out;
}

/** True when the tuning is a 6-string guitar's standard E A D G B E (at any pitch: Eb standard counts) */
export function isStandardSix(courses) {
  if (courses.length !== 6) return false;
  const g = courses.slice(1).map((c, i) => c.open - courses[i].open);
  return g.join(',') === '5,5,5,4,5';
}

/** The notes to play a scale up and down: a pattern's notes, or one octave up from the root near `around` */
export function upAndDown(scale, root, pattern = null, around = 52) {
  let up;
  if (pattern) up = [...pattern.notes].sort((a, b) => a.midi - b.midi).map(x => ({ midi: x.midi, course: x.course, fret: x.fret, pc: x.pc, d: x.d, note: x.note }));
  else {
    const notes = spellScale(scale, root);
    let base = around + mod12(pcOf(root) - around);
    if (base - around > 6) base -= 12;
    up = notes.map(x => ({ midi: base + x.semis, pc: x.pc, d: x.d, note: x.note }));
    up.push({ midi: base + 12, pc: notes[0].pc, d: notes[0].d, note: notes[0].note });
  }
  const down = up.slice(0, -1).reverse();
  return [...up, ...down];
}
export { SCALE };
