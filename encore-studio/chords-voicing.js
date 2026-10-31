// Encore Chords: where a chord's notes are on an instrument. Fretted shapes are worked out
// (searched), not looked up, so they work on any instrument and tuning in tunings.js; plus a
// piano voicing and the capo helper. No page in here (test-chords.mjs tests it).
import { TYPE, chordTones, pcOf, mod12, chord, spellRoot, spellBass } from './chords-core.js';

// instruments you don't play chords on by fretting (harps, drones, bowed fiddles with no frets are kept:
// fingering positions still work there)
const NOT_FRETTED = ['Koto (13-string)', 'Kantele (5-string)', 'Hurdy-gurdy', 'Erhu'];
export function frettable(instrument) {
  return instrument.part === 'string' && !NOT_FRETTED.includes(instrument.name)
    && instrument.tunings.some(t => t.midi.length >= 2);
}

/**
 * A tuning as courses (a course is one string, or a pair or group played together).
 * Each: midi (its strings), open (lowest of them), start (a short 5th string on a banjo begins at fret 5).
 */
export function coursesOf(tuning, instrumentName = '') {
  const out = [];
  let s = 0;
  (tuning.courses && tuning.courses.length ? tuning.courses : tuning.midi.map(() => 1)).forEach(size => {
    const midi = tuning.midi.slice(s, s + size);
    out.push({ midi, open: Math.min(...midi), start: 0 });
    s += size;
  });
  if (/^Banjo \(5-string\)/.test(instrumentName) && out.length === 5) out[0].start = 5;
  return out;
}

/**
 * The notes a course sounds at a fret (fret counted from the capo; 0 = open or at the capo; -1 = muted).
 * A banjo's short 5th string ignores the capo (it gets its own spike) and only frets above fret 5.
 */
export function courseNotes(course, fret, capo = 0) {
  if (fret < 0) return null;
  if (course.start > 0) {
    if (fret === 0) return course.midi;
    const abs = fret + capo;
    return abs > course.start ? course.midi.map(m => m + abs - course.start) : null;
  }
  return course.midi.map(m => m + capo + fret);
}
/** Every note a shape sounds, low to high */
export function shapeNotes(courses, frets, capo = 0) {
  const out = [];
  courses.forEach((c, i) => { const n = courseNotes(c, frets[i], capo); if (n) out.push(...n); });
  return out.sort((a, b) => a - b);
}
const ascending = courses => courses.every((c, i) => i === 0 || c.open > courses[i - 1].open);

/** The tones a voicing must have, and the ones it may drop, for a number of courses */
function needs(c, n) {
  const t = TYPE[c.type], tones = chordTones(c);
  let need = tones.filter(x => !t.opt.includes(x.d));
  const may = tones.filter(x => t.opt.includes(x.d));
  // too many notes for the strings: drop the 5th, then the 11th, the 9th, and last the root (a rootless voicing)
  for (const d of ['5', '11', '9', '1']) if (need.length > n) {
    const k = need.findIndex(x => x.d === d);
    if (k >= 0) may.push(...need.splice(k, 1));
  }
  return { need, may, all: tones };
}

/** How many fingers a shape needs, and whether it uses a barre (one finger across several strings) */
export function fingering(frets) {
  const fretted = frets.map((f, i) => ({ f, i })).filter(x => x.f > 0);
  if (!fretted.length) return { fingers: 0, barre: null, partial: false };
  const fmin = Math.min(...fretted.map(x => x.f));
  const atMin = fretted.filter(x => x.f === fmin);
  let barre = null;
  if (atMin.length >= 2) {
    const a = atMin[0].i, b = atMin[atMin.length - 1].i;
    let ok = true;
    for (let j = a; j <= b; j++) if (!(frets[j] >= fmin)) ok = false;   // no open or muted string under the barre
    if (ok) barre = { fret: fmin, from: a, to: b };
  }
  let fingers = barre ? 1 : atMin.length;
  // the rest: one finger each, or one finger flat across neighbouring strings at the same fret if that's needed
  const above = fretted.filter(x => x.f > fmin);
  let runs = 0;
  for (let k = 0; k < above.length; k++) if (k === 0 || above[k].f !== above[k - 1].f || above[k].i !== above[k - 1].i + 1) runs++;
  let partial = false;
  if (fingers + above.length <= 4) fingers += above.length;
  else { fingers += runs; partial = runs < above.length; }
  return { fingers, barre, partial };
}

/**
 * Playable shapes for a chord on an instrument, best first.
 * courses: from coursesOf. opts: capo, maxFret (highest fret to use, counted from the capo), limit.
 * Each: frets (per course: -1 muted, 0 open, n fretted, counted from the capo), score (lower is easier and fuller),
 * pos (lowest fretted fret), fingers, barre, notes (MIDI), rootless, missing (tones left out).
 */
export function fretVoicings(c, courses, opts = {}) {
  const capo = opts.capo || 0, maxFret = opts.maxFret ?? 15, limit = opts.limit ?? 24;
  const n = courses.length, { need, all } = needs(c, n);
  const pcs = new Set(all.map(x => x.pc)), needPcs = [...new Set(need.map(x => x.pc))];
  const rootPc = pcOf(c.root), bassPc = c.bass ? pcOf(c.bass) : rootPc;
  if (c.bass) pcs.add(bassPc);
  // guitars and basses want the root (or the named bass) lowest; on a ukulele or mandolin it's a preference
  const strict = !!c.bass || (ascending(courses) && n >= 5);
  // re-entrant tunings (a ukulele's high G) have no real bass string, so the lowest note matters little there
  const bassMiss = ascending(courses) ? 0.8 : 0.3;
  // four strings or fewer: use them all if that works (a ukulele chord rings all four), otherwise at least three
  const minSound = opts.minSound ?? (n <= 4 ? n : Math.min(n, Math.max(3, needPcs.length + (c.bass && !needPcs.includes(bassPc) ? 1 : 0))));
  // past 8 courses (lutes, pedal steel) only the top 7 are fretted, the rest ring open or stay quiet
  const frettedFrom = n > 8 ? n - 7 : 0;
  const found = new Map();
  for (let pos = 1; pos <= Math.max(1, maxFret); pos++) {
    const span = pos >= 5 ? 4 : 3, hi = Math.min(maxFret, pos + span);
    const options = courses.map((course, i) => {
      const o = [-1];
      const open = courseNotes(course, 0, capo);
      if (pcs.has(mod12(open[0]))) o.push(0);
      if (i >= frettedFrom) for (let f = pos; f <= hi; f++) {
        const m = courseNotes(course, f, capo);
        if (m && pcs.has(mod12(m[0]))) o.push(f);
      }
      return o;
    });
    const frets = new Array(n).fill(-1);
    const walk = (i, started, gap, interior, fretted) => {
      if (fretted > 6 || interior > 1) return;
      if (i === n) { consider(frets.slice(), pos); return; }
      for (const f of options[i]) {
        frets[i] = f;
        if (f < 0) walk(i + 1, started, started, interior, fretted);
        else walk(i + 1, true, false, interior + (gap ? 1 : 0), fretted + (f > 0 ? 1 : 0));
      }
      frets[i] = -1;
    };
    walk(0, false, false, 0, 0);
  }

  function consider(frets, pos) {
    const fretted = frets.filter(f => f > 0);
    if (fretted.length ? Math.min(...fretted) !== pos : pos !== 1) return;
    if (fretted.length && Math.max(...fretted) - pos > (pos >= 5 ? 4 : 3)) return;
    const sounding = frets.filter(f => f >= 0).length;
    if (sounding < minSound) return;
    const notes = shapeNotes(courses, frets, capo);
    const have = new Set(notes.map(mod12));
    if (!needPcs.every(p => have.has(p))) return;
    const lowPc = mod12(notes[0]);
    if (strict && lowPc !== bassPc) return;
    const fg = fingering(frets);
    if (fg.fingers > 4) return;
    let first = frets.findIndex(f => f >= 0), last = n - 1 - [...frets].reverse().findIndex(f => f >= 0);
    let interior = 0;
    for (let j = first; j <= last; j++) if (frets[j] < 0) interior++;
    if (interior > 1) return;
    const opens = frets.filter(f => f === 0).length, span = fretted.length ? Math.max(...fretted) - pos : 0;
    const low = !fretted.length || pos <= 4;
    // open strings make a shape easy near the nut; higher up they make an odd one. Open shapes rarely reach past fret 3.
    let score = (fretted.length ? pos : 0) * 0.3 + (low ? -0.3 : 0.25) * opens - sounding * 0.25
      + (low && opens ? fretted.filter(f => f > 3).length * 0.5 : 0)
      + interior * 1.5 + (n - 1 - last) * 0.6 + first * 0.15
      + (span >= 3 ? (low ? 0.8 : 0.4) : 0) + (span >= 4 ? 1.1 : 0) + (fg.fingers === 4 ? 0.4 : 0)
      + (fg.barre ? 0.5 : 0) + (fg.partial ? 0.3 : 0)
      + all.filter(x => !have.has(x.pc)).length * 0.6
      + (lowPc !== bassPc ? bassMiss : 0);
    const key = frets.join(',');
    if (!found.has(key)) found.set(key, { frets, score, pos: fretted.length ? pos : 0, fingers: fg.fingers, barre: fg.barre, notes,
      rootless: !have.has(rootPc), missing: all.filter(x => !have.has(x.pc)).map(x => x.d) });
  }

  if (!found.size && n <= 4 && minSound > Math.min(3, n)) return fretVoicings(c, courses, { ...opts, minSound: minSound - 1 });
  const sorted = [...found.values()].sort((a, b) => a.score - b.score);
  // no more than four shapes at any one position, so the list covers the neck
  const perPos = new Map(), out = [];
  for (const v of sorted) {
    const k = perPos.get(v.pos) || 0;
    if (k >= 4) continue;
    perPos.set(v.pos, k + 1);
    out.push(v);
    if (out.length >= limit) break;
  }
  return out;
}

/** A shape as text, low string first: x32010 (frets over 9 in brackets so it still reads) */
export const shapeText = frets => frets.map(f => f < 0 ? 'x' : f > 9 ? '(' + f + ')' : String(f)).join('');

/**
 * A piano voicing: the bass note in the left hand (E2 to Eb3), the chord close together in the right
 * (around middle C), in whichever inversion moves least from the last chord's right hand (prev).
 */
export function pianoVoicing(c, prev = null) {
  const tones = chordTones(c);
  const bassPc = c.bass ? pcOf(c.bass) : pcOf(c.root);
  const bass = 40 + mod12(bassPc - 4);
  let rh = tones.slice();
  if (rh.length > 4) rh = rh.filter(x => x.d !== '5');          // a big chord sounds clearer with no 5th up top
  if (rh.length > 5) rh = rh.filter(x => x.d !== '11' || c.type === 'm11');
  const pcs = rh.map(x => x.pc);
  let best = null, bestCost = 1e9;
  for (let inv = 0; inv < pcs.length; inv++) {
    for (let start = 55; start <= 66; start++) {
      if (mod12(start) !== pcs[inv]) continue;
      const stack = [start];
      for (let k = 1; k < pcs.length; k++) {
        let m = stack[k - 1] + 1;
        while (mod12(m) !== pcs[(inv + k) % pcs.length]) m++;
        stack.push(m);
      }
      const centre = stack.reduce((a, b) => a + b, 0) / stack.length;
      let cost = Math.abs(centre - 64) * 0.5;
      if (prev && prev.length) {
        const p = [...prev].sort((a, b) => a - b);
        cost = stack.reduce((s, m, k) => s + Math.abs(m - p[Math.min(k, p.length - 1)]), 0) + Math.abs(centre - 64) * 0.1;
      }
      if (cost < bestCost) { bestCost = cost; best = stack; }
    }
  }
  return { bass, rh: best, notes: [bass, ...best] };
}

/**
 * Capo helper: for each capo fret, the shapes you'd play (the chords moved down by that much) and how
 * easy they are near the nut. Best first. chords: the progression's chords.
 */
export function capoOptions(chords, courses, maxCapo = 7) {
  const unique = [];
  for (const c of chords) if (!unique.some(u => pcOf(u.root) === pcOf(c.root) && u.type === c.type && (u.bass && pcOf(u.bass)) === (c.bass && pcOf(c.bass)))) unique.push(c);
  const out = [];
  for (let capo = 0; capo <= maxCapo; capo++) {
    const shapes = unique.map(c => shapeFor(c, capo));
    const ease = shapes.map(s => { const v = fretVoicings(s, courses, { maxFret: 4, limit: 1 })[0]; return v ? v.score : 6; });
    const total = ease.reduce((a, b) => a + b, 0) / Math.max(1, ease.length) + capo * 0.12;
    out.push({ capo, shapes, ease, score: total, all: chords.map(c => shapeFor(c, capo)) });
  }
  return out.sort((a, b) => a.score - b.score);
}
/** The shape to play for a chord with a capo: the chord moved down, spelled the plain guitar way */
export function shapeFor(c, capo) {
  const pc = mod12(pcOf(c.root) - capo), root = spellRoot(pc, c.type);
  return chord(root, c.type, c.bass ? spellBass(mod12(pcOf(c.bass) - capo), root) : null);
}
