// Encore Chords: the theory with no page in it (spelled notes, chord types, naming a set of
// notes), so node can test it (test-chords.mjs). Voicings are in chords-voicing.js, keys and
// progressions in chords-keys.js.

export const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
const MAJOR = [0, 2, 4, 5, 7, 9, 11];   // semitones of the major scale's degrees 1..7
export const mod12 = n => ((n % 12) + 12) % 12;
const mod7 = n => ((n % 7) + 7) % 7;

// ---- spelled notes: a letter and an accidental, so F# and Gb stay different things

/** A spelled note: letter 0..6 (C..B) and accidental (-2 bb, -1 b, 0, 1 #, 2 ##) */
export const note = (L, a = 0) => ({ L: mod7(L), a });
export const pcOf = n => mod12(LETTER_PC[n.L] + n.a);
export const sameNote = (x, y) => x.L === y.L && x.a === y.a;
export function noteText(n) { return LETTERS[n.L] + (n.a > 0 ? '#'.repeat(n.a) : 'b'.repeat(-n.a)); }
export function parseNote(s) {
  const m = /^\s*([A-Ga-g])(##|bb|#|b|x)?\s*$/.exec(s || '');
  if (!m) return null;
  return note(LETTERS.indexOf(m[1].toUpperCase()), { '##': 2, x: 2, '#': 1, b: -1, bb: -2 }[m[2]] || 0);
}
/** The note with letter L that sounds as pitch class pc */
export function onLetter(L, pc) {
  let a = mod12(pc - LETTER_PC[mod7(L)]);
  if (a > 6) a -= 12;
  return note(L, a);
}
/** Every reasonable spelling of a pitch class (one accidental at most), naturals first */
export function spellings(pc) {
  const out = [];
  for (let L = 0; L < 7; L++) { const n = onLetter(L, pc); if (Math.abs(n.a) <= 1) out.push(n); }
  return out.sort((x, y) => Math.abs(x.a) - Math.abs(y.a));
}
// how we spell a pitch class with nothing else to go on: the names most players use
const PLAIN = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'].map(parseNote);
export const plainNote = pc => PLAIN[mod12(pc)];
/** For a note like Cb, Fb, E#, B# or anything with a double accidental: the plain note it sounds as ('' otherwise) */
export function soundsAs(n) {
  const odd = Math.abs(n.a) > 1 || (n.a === 1 && (n.L === 2 || n.L === 6)) || (n.a === -1 && (n.L === 0 || n.L === 3));
  return odd ? noteText(PLAIN[pcOf(n)]) : '';
}
/** MIDI note as text, e.g. 60 = C4 (spelled as given, or plainly) */
export function midiText(midi, spelled) {
  const n = spelled || plainNote(midi);
  // B# is written in the octave below its sound, Cb in the one above
  const oct = Math.floor((midi - n.a) / 12) - 1;
  return noteText(n) + oct;
}

// ---- intervals as degrees ('b3', '#11'): the way chord formulas are written

/** A degree like 'b7' or '#11': its scale step (0..6), size in semitones, and the alteration */
export function degree(d) {
  const m = /^(bb|b|#)?(\d+)$/.exec(d);
  const acc = { bb: -2, b: -1, '#': 1 }[m[1]] || 0, n = +m[2], step = (n - 1) % 7;
  return { d, n, step, acc, semis: MAJOR[step] + acc + 12 * Math.floor((n - 1) / 7) };
}
/** The note a degree above a spelled root, e.g. ('F#', 'b5') = C */
export function above(root, d) {
  const g = typeof d === 'string' ? degree(d) : d;
  return onLetter(root.L + g.step, pcOf(root) + g.semis);
}
/** Spelled interval between two notes, as steps (letters) and semitones */
export const intervalBetween = (a, b) => ({ steps: mod7(b.L - a.L), semis: mod12(pcOf(b) - pcOf(a)) });
export const moveBy = (n, iv) => onLetter(n.L + iv.steps, pcOf(n) + iv.semis);

const IV_NAMES = ['unison', 'minor 2nd', 'major 2nd', 'minor 3rd', 'major 3rd', 'perfect 4th', 'tritone',
                  'perfect 5th', 'minor 6th', 'major 6th', 'minor 7th', 'major 7th'];
export const intervalName = semis => IV_NAMES[mod12(semis)];

// ---- chord types. f: the formula. opt: tones that can be left out and it's still that chord.
// cost: how rarely the name is the right one (lower wins when a set of notes has several names).
// num: what follows the roman numeral (the case of the numeral already says major or minor).
const T = (id, sym, name, f, cost, extra = {}) => ({ id, sym, name, f, cost, opt: [], ...extra });
export const TYPES = [
  T('maj', '', 'major', ['1', '3', '5'], 0, { fam: 'maj', num: '' }),
  T('min', 'm', 'minor', ['1', 'b3', '5'], 0, { fam: 'min', num: '' }),
  T('dim', 'dim', 'diminished', ['1', 'b3', 'b5'], 0.8, { fam: 'dim', num: '°' }),
  T('aug', 'aug', 'augmented', ['1', '3', '#5'], 1.0, { fam: 'aug', num: '+' }),
  T('sus4', 'sus4', 'suspended 4th', ['1', '4', '5'], 1.0, { fam: 'sus', num: 'sus4' }),
  T('sus2', 'sus2', 'suspended 2nd', ['1', '2', '5'], 1.2, { fam: 'sus', num: 'sus2' }),
  T('5', '5', 'power chord', ['1', '5'], 0.6, { fam: 'power', num: '5' }),
  T('b5', '(b5)', 'major flat five', ['1', '3', 'b5'], 3.5, { fam: 'maj', num: '(b5)' }),
  T('6', '6', 'major sixth', ['1', '3', '5', '6'], 1.8, { fam: 'maj', num: '6', opt: ['5'] }),
  T('m6', 'm6', 'minor sixth', ['1', 'b3', '5', '6'], 1.8, { fam: 'min', num: '6', opt: ['5'] }),
  T('69', '6/9', 'six nine', ['1', '3', '5', '6', '9'], 2.2, { fam: 'maj', num: '6/9', opt: ['5'] }),
  T('m69', 'm6/9', 'minor six nine', ['1', 'b3', '5', '6', '9'], 2.6, { fam: 'min', num: '6/9', opt: ['5'] }),
  T('maj7', 'maj7', 'major seventh', ['1', '3', '5', '7'], 1.2, { fam: 'maj', num: 'maj7', opt: ['5'] }),
  T('7', '7', 'dominant seventh', ['1', '3', '5', 'b7'], 0.9, { fam: 'dom', num: '7', opt: ['5'] }),
  T('m7', 'm7', 'minor seventh', ['1', 'b3', '5', 'b7'], 1.0, { fam: 'min', num: '7', opt: ['5'] }),
  T('mMaj7', 'm(maj7)', 'minor major seventh', ['1', 'b3', '5', '7'], 2.2, { fam: 'min', num: '(maj7)', opt: ['5'] }),
  T('dim7', 'dim7', 'diminished seventh', ['1', 'b3', 'b5', 'bb7'], 1.4, { fam: 'dim', num: '°7' }),
  T('m7b5', 'm7b5', 'half-diminished (minor seven flat five)', ['1', 'b3', 'b5', 'b7'], 1.3, { fam: 'hdim', num: 'ø7' }),
  T('7#5', '7#5', 'augmented seventh', ['1', '3', '#5', 'b7'], 2.2, { fam: 'dom', num: '+7' }),
  T('maj7#5', 'maj7#5', 'augmented major seventh', ['1', '3', '#5', '7'], 2.8, { fam: 'aug', num: '+maj7' }),
  T('7b5', '7b5', 'seven flat five', ['1', '3', 'b5', 'b7'], 2.6, { fam: 'dom', num: '7b5' }),
  T('7sus4', '7sus4', 'seven suspended 4th', ['1', '4', '5', 'b7'], 1.6, { fam: 'dom', num: '7sus4', opt: ['5'] }),
  T('add9', 'add9', 'added ninth', ['1', '3', '5', '9'], 1.5, { fam: 'maj', num: 'add9', opt: ['5'] }),
  T('madd9', 'm(add9)', 'minor added ninth', ['1', 'b3', '5', '9'], 1.8, { fam: 'min', num: '(add9)', opt: ['5'] }),
  T('add11', 'add11', 'added eleventh', ['1', '3', '5', '11'], 2.4, { fam: 'maj', num: 'add11', opt: ['5'] }),
  T('madd11', 'm(add11)', 'minor added eleventh', ['1', 'b3', '5', '11'], 2.5, { fam: 'min', num: '(add11)', opt: ['5'] }),
  T('addS11', 'add#11', 'added sharp eleventh', ['1', '3', '5', '#11'], 3.2, { fam: 'maj', num: 'add#11' }),
  T('sus4add9', 'sus4(add9)', 'suspended 4th, added ninth', ['1', '4', '5', '9'], 2.8, { fam: 'sus', num: 'sus4(add9)' }),
  T('9', '9', 'dominant ninth', ['1', '3', '5', 'b7', '9'], 1.6, { fam: 'dom', num: '9', opt: ['5'] }),
  T('maj9', 'maj9', 'major ninth', ['1', '3', '5', '7', '9'], 1.9, { fam: 'maj', num: 'maj9', opt: ['5'] }),
  T('m9', 'm9', 'minor ninth', ['1', 'b3', '5', 'b7', '9'], 1.8, { fam: 'min', num: '9', opt: ['5'] }),
  T('mMaj9', 'm(maj9)', 'minor major ninth', ['1', 'b3', '5', '7', '9'], 3.0, { fam: 'min', num: '(maj9)', opt: ['5'] }),
  T('m9b5', 'm9b5', 'half-diminished ninth', ['1', 'b3', 'b5', 'b7', '9'], 3.2, { fam: 'hdim', num: 'ø9' }),
  T('9sus4', '9sus4', 'nine suspended 4th', ['1', '4', '5', 'b7', '9'], 2.4, { fam: 'dom', num: '9sus4', opt: ['5'] }),
  T('7b9', '7b9', 'seven flat nine', ['1', '3', '5', 'b7', 'b9'], 2.2, { fam: 'dom', num: '7b9', opt: ['5'] }),
  T('7#9', '7#9', 'seven sharp nine', ['1', '3', '5', 'b7', '#9'], 2.2, { fam: 'dom', num: '7#9', opt: ['5'] }),
  T('7#11', '7#11', 'seven sharp eleven', ['1', '3', '5', 'b7', '#11'], 2.8, { fam: 'dom', num: '7#11', opt: ['5'] }),
  T('7b13', '7b13', 'seven flat thirteen', ['1', '3', '5', 'b7', 'b13'], 3.0, { fam: 'dom', num: '7b13', opt: ['5'] }),
  T('7b9b13', '7b9b13', 'seven flat nine flat thirteen', ['1', '3', '5', 'b7', 'b9', 'b13'], 3.4, { fam: 'dom', num: '7b9b13', opt: ['5'] }),
  T('7#9b13', '7#9b13', 'seven sharp nine flat thirteen', ['1', '3', '5', 'b7', '#9', 'b13'], 3.4, { fam: 'dom', num: '7#9b13', opt: ['5'] }),
  T('7b9#11', '7b9#11', 'seven flat nine sharp eleven', ['1', '3', '5', 'b7', 'b9', '#11'], 3.6, { fam: 'dom', num: '7b9#11', opt: ['5'] }),
  T('9#11', '9#11', 'nine sharp eleven', ['1', '3', '5', 'b7', '9', '#11'], 3.0, { fam: 'dom', num: '9#11', opt: ['5'] }),
  T('maj7#11', 'maj7#11', 'major seven sharp eleven', ['1', '3', '5', '7', '#11'], 2.6, { fam: 'maj', num: 'maj7#11', opt: ['5'] }),
  T('maj9#11', 'maj9#11', 'major nine sharp eleven', ['1', '3', '5', '7', '9', '#11'], 3.2, { fam: 'maj', num: 'maj9#11', opt: ['5'] }),
  T('11', '11', 'dominant eleventh', ['1', '3', '5', 'b7', '9', '11'], 2.8, { fam: 'dom', num: '11', opt: ['3', '5'] }),
  T('m11', 'm11', 'minor eleventh', ['1', 'b3', '5', 'b7', '9', '11'], 2.4, { fam: 'min', num: '11', opt: ['5', '9'] }),
  T('13', '13', 'dominant thirteenth', ['1', '3', '5', 'b7', '9', '13'], 2.2, { fam: 'dom', num: '13', opt: ['5', '9'] }),
  T('13b9', '13b9', 'thirteen flat nine', ['1', '3', '5', 'b7', 'b9', '13'], 3.2, { fam: 'dom', num: '13b9', opt: ['5'] }),
  T('13#11', '13#11', 'thirteen sharp eleven', ['1', '3', '5', 'b7', '9', '#11', '13'], 3.4, { fam: 'dom', num: '13#11', opt: ['5', '9'] }),
  T('13sus4', '13sus4', 'thirteen suspended 4th', ['1', '4', '5', 'b7', '9', '13'], 3.0, { fam: 'dom', num: '13sus4', opt: ['5', '9'] }),
  T('maj13', 'maj13', 'major thirteenth', ['1', '3', '5', '7', '9', '13'], 2.6, { fam: 'maj', num: 'maj13', opt: ['5', '9'] }),
  T('m13', 'm13', 'minor thirteenth', ['1', 'b3', '5', 'b7', '9', '11', '13'], 2.8, { fam: 'min', num: '13', opt: ['5', '9', '11'] }),
];
for (const t of TYPES) t.tones = t.f.map(degree);
export const TYPE = Object.fromEntries(TYPES.map(t => [t.id, t]));
export const typeBySym = sym => TYPES.find(t => t.sym === sym);
/** Types grouped for a picker (the order a player looks for them) */
export const TYPE_GROUPS = [
  ['Triads', ['maj', 'min', 'dim', 'aug', 'sus2', 'sus4', '5']],
  ['Sixths and added tones', ['6', 'm6', '69', 'm69', 'add9', 'madd9', 'add11', 'madd11', 'sus4add9', 'addS11']],
  ['Sevenths', ['maj7', '7', 'm7', 'mMaj7', 'm7b5', 'dim7', '7sus4', '7#5', '7b5', 'maj7#5']],
  ['Ninths and up', ['9', 'maj9', 'm9', 'mMaj9', '9sus4', 'm9b5', '11', 'm11', '13', 'maj13', 'm13', '13sus4']],
  ['Altered', ['7b9', '7#9', '7#11', '7b13', '7b9b13', '7#9b13', '7b9#11', '9#11', '13b9', '13#11', 'maj7#11', 'maj9#11', 'b5']],
];

/** A chord: spelled root, type id, and (for slash chords) a spelled bass note */
export const chord = (root, type, bass = null) => ({ root, type, bass: bass && !sameNote(bass, root) ? bass : null });
/** The chord's notes, spelled, with their degrees (omit: degrees left out) */
export function chordTones(c, omit = []) {
  return TYPE[c.type].tones.filter(g => !omit.includes(g.d)).map(g => ({ d: g.d, note: above(c.root, g), pc: pcOf(above(c.root, g)), semis: g.semis }));
}
export function chordSymbol(c) {
  return noteText(c.root) + TYPE[c.type].sym + (c.bass ? '/' + noteText(c.bass) : '');
}
/** Reads a chord symbol like 'F#m7b5', 'C/E' or 'Bbmaj9' (null when it isn't one we know) */
export function parseChord(s) {
  const m = /^\s*([A-G](?:##|bb|#|b)?)(.*?)(?:\/([A-G](?:##|bb|#|b)?))?\s*$/.exec(s || '');
  if (!m) return null;
  const aliases = { M: '', maj: '', min: 'm', '-': 'm', '°': 'dim', o: 'dim', '+': 'aug', ø: 'm7b5', 'ø7': 'm7b5', 'o7': 'dim7', '°7': 'dim7', '-7': 'm7', M7: 'maj7', 'Δ': 'maj7', 'Δ7': 'maj7', sus: 'sus4', mMaj7: 'm(maj7)', madd9: 'm(add9)', '+7': '7#5', aug7: '7#5' };
  const sym = m[2] in aliases ? aliases[m[2]] : m[2];
  const t = typeBySym(sym);
  if (!t) return null;
  return chord(parseNote(m[1]), t.id, m[3] ? parseNote(m[3]) : null);
}

/** Pitch classes of a chord (with its bass) */
export function chordPcs(c) {
  const pcs = chordTones(c).map(t => t.pc);
  if (c.bass && !pcs.includes(pcOf(c.bass))) pcs.unshift(pcOf(c.bass));
  return pcs;
}

// ---- spelling a chord's root: in a key when there is one, otherwise the way with fewest accidentals

// the degree (and alteration from the major scale) we use for each chromatic note in any key
const KEY_STEP = [[0, 0], [1, -1], [1, 0], [2, -1], [2, 0], [3, 0], [3, 1], [4, 0], [5, -1], [5, 0], [6, -1], [6, 0]];
/** A pitch class spelled in a key (key.tonic: a spelled note) */
export function inKey(pc, key) {
  const [step] = KEY_STEP[mod12(pc - pcOf(key.tonic))];
  return onLetter(key.tonic.L + step, pc);
}
const accCost = n => Math.abs(n.a) + (Math.abs(n.a) > 1 ? 4 : 0);
/** How to spell a chord's root: the way its tones need the fewest accidentals (no key), or the key's way */
export function spellRoot(pc, type, key = null) {
  if (key) {
    const n = inKey(pc, key);
    if (Math.abs(n.a) <= 1) return n;
  }
  // a white key keeps its plain name (Cdim7, not B#dim7); a black key goes sharp or flat, whichever reads easier
  if (PLAIN[pc].a === 0) return PLAIN[pc];
  let best = null, bestCost = 1e9;
  for (const r of spellings(pc)) {
    if (r.a === 0) continue;
    let cost = TYPE[type].tones.reduce((s, g) => s + accCost(above(r, g)), 0);
    if (!sameNote(r, PLAIN[pc])) cost += 0.05;
    if (cost < bestCost) { best = r; bestCost = cost; }
  }
  return best;
}
/** A bass note under a chord, spelled to match the root's side (sharps with sharps) */
export function spellBass(pc, root, key = null) {
  if (key) { const n = inKey(pc, key); if (Math.abs(n.a) <= 1) return n; }
  const opts = spellings(pc);
  if (opts[0].a === 0) return opts[0];
  return opts.find(n => n.a === (root.a < 0 ? -1 : root.a > 0 ? 1 : PLAIN[pc].a)) || opts[0];
}

// ---- naming a set of notes

const INV_WORDS = { '3': 'first inversion (its 3rd in the bass)', 'b3': 'first inversion (its 3rd in the bass)',
  '5': 'second inversion (its 5th in the bass)', 'b5': 'second inversion (its 5th in the bass)', '#5': 'second inversion (its 5th in the bass)',
  'b7': 'third inversion (its 7th in the bass)', '7': 'third inversion (its 7th in the bass)', 'bb7': 'third inversion (its 7th in the bass)' };
const ROOT_LABEL = d => d === '1' ? 'R' : d;

// the chords still worth naming with their 3rd left out (C7(no3) is a real voicing; A7#9(no3) is not)
const NO3_OK = ['7', 'maj7', '9', 'maj9', '13', '6'];
// how far behind the best name another can be and still be worth showing
const SHOW_WITHIN = 3.6;

function matchAll(pcs, bassPc, foreign, out, upperLow) {
  for (const r of pcs) {
    const rel = new Set(pcs.map(p => mod12(p - r)));
    for (const t of TYPES) {
      if (t.f.length < 3 && pcs.length > 2) continue;
      const have = new Map(t.tones.map(g => [mod12(g.semis), g.d]));
      if ([...rel].some(s => !have.has(s))) continue;
      if (foreign && have.has(mod12(bassPc - r))) continue; // that's an inversion, named by the other pass
      const missing = t.tones.filter(g => !rel.has(mod12(g.semis))).map(g => g.d);
      let cost = t.cost, ok = true, no3 = false;
      for (const d of missing) {
        if (t.opt.includes(d)) cost += d === '5' ? (t.f.length >= 4 ? 0.5 : 2.5) : 0.3;
        else if (d === '3' && NO3_OK.includes(t.id) && !foreign && !no3 && rel.size >= 3) { cost += 3; no3 = true; }
        else ok = false;
      }
      if (!ok) continue;
      const bassDeg = foreign ? null : have.get(mod12(bassPc - r));
      if (!foreign && bassPc !== r) {
        cost += 1.5;
        const g = degree(bassDeg);
        if (g.n > 7 || g.d === '6' || g.d === '2' || g.d === '4') cost += 1; // an added tone in the bass is a rarer name
      }
      if (foreign) {
        if (t.cost > 2.5) continue;
        // a diminished 7th or augmented chord has no one root; over a foreign bass, name it from its lowest note
        if ((t.id === 'dim7' || t.id === 'aug') && r !== upperLow) continue;
        cost += 2.8;
      }
      out.push({ rootPc: r, type: t.id, cost, missing, no3, bassPc, foreign, bassDeg });
    }
  }
}

/**
 * Every plausible name for a set of sounding notes, best first.
 * midis: MIDI notes (the lowest is the bass). key: spell for this key (null: fewest accidentals).
 * Each result: chord (spelled), symbol, cost, formula (degrees, with missing ones marked),
 * labels (pitch class to its degree label), inversion text, and whether the bass is outside the chord.
 */
export function nameNotes(midis, key = null) {
  const sorted = [...new Set(midis)].sort((a, b) => a - b);
  if (!sorted.length) return [];
  const pcs = [...new Set(sorted.map(mod12))], bassPc = mod12(sorted[0]);
  if (pcs.length === 1) {
    const n = key ? inKey(bassPc, key) : plainNote(bassPc);
    return [{ kind: 'note', symbol: noteText(n), text: 'Just one note (' + noteText(n) + '). Add another to hear a chord.', notes: [n], labels: { [bassPc]: 'R' }, cost: 0 }];
  }
  if (pcs.length === 2) return nameTwo(pcs, bassPc, key);
  const found = [];
  matchAll(pcs, bassPc, false, found);
  if (pcs.length >= 4) matchAll(pcs.filter(p => p !== bassPc), bassPc, true, found, mod12(sorted.find(m => mod12(m) !== bassPc)));
  const best = new Map();
  for (const m of found) {
    const k = m.rootPc + ':' + m.type + ':' + (m.foreign ? 'f' : '');
    if (!best.has(k) || best.get(k).cost > m.cost) best.set(k, m);
  }
  const list = [...best.values()].sort((a, b) => a.cost - b.cost || a.missing.length - b.missing.length);
  const seen = new Set(), out = [];
  for (const m of list) {
    if (m.cost > list[0].cost + SHOW_WITHIN) break;
    const r = describe(m, key);
    if (seen.has(r.symbol)) continue;
    seen.add(r.symbol);
    out.push(r);
  }
  return out;
}

function describe(m, key) {
  const root = spellRoot(m.rootPc, m.type, key);
  const bass = m.bassPc !== m.rootPc ? (m.foreign ? spellBass(m.bassPc, root, key) : null) : null;
  let c = chord(root, m.type, bass);
  const tones = chordTones(c);
  if (!m.foreign && m.bassPc !== m.rootPc) c = chord(root, m.type, tones.find(t => t.pc === m.bassPc).note);
  const t = TYPE[m.type];
  let symbol = noteText(root) + t.sym;
  if (m.no3) symbol += '(no3)';
  if (c.bass) symbol += '/' + noteText(c.bass);
  const labels = {};
  for (const x of tones) if (!m.missing.includes(x.d)) labels[x.pc] = ROOT_LABEL(x.d);
  if (m.foreign) labels[m.bassPc] = 'bass';
  const notes = tones.filter(x => !m.missing.includes(x.d)).map(x => x.note);
  let inversion = '';
  if (m.foreign) inversion = noteText(c.bass) + ' in the bass under a ' + noteText(root) + t.sym + ' chord (a slash chord)';
  else if (m.bassPc !== m.rootPc) inversion = INV_WORDS[m.bassDeg] || 'with its ' + m.bassDeg + ' in the bass';
  return {
    kind: 'chord', chord: c, symbol, cost: m.cost, type: t, notes, labels, inversion, foreign: m.foreign,
    formula: t.f.map(d => m.missing.includes(d) ? '(' + d + ')' : d),
    missing: m.missing,
    text: noteText(root) + ' ' + t.name + (m.no3 ? ' without its 3rd' : ''),
  };
}

function nameTwo(pcs, bassPc, key) {
  const other = pcs.find(p => p !== bassPc), semis = mod12(other - bassPc);
  const low = key ? inKey(bassPc, key) : plainNote(bassPc);
  const out = [];
  const power = (rootPc, bassAbove) => {
    const root = spellRoot(rootPc, '5', key), fifth = above(root, '5');
    const c = chord(root, '5', bassAbove ? fifth : null);
    out.push({ kind: 'chord', chord: c, symbol: chordSymbol(c), type: TYPE['5'], cost: bassAbove ? 1.5 : 0.6,
      notes: [root, fifth], labels: { [rootPc]: 'R', [pcOf(fifth)]: '5' }, formula: ['1', '5'], missing: [],
      inversion: bassAbove ? 'its 5th in the bass' : '', text: noteText(root) + ' power chord (root and 5th, no 3rd: neither major nor minor)' });
  };
  if (semis === 7) power(bassPc, false);
  if (semis === 5) power(other, true);
  // any other pair is an interval: say what chord it most often stands for
  const hint = { 3: ['min', bassPc], 4: ['maj', bassPc], 8: ['maj', other], 9: ['min', other] }[semis];
  const up = hint ? spellRoot(hint[1], hint[0], key) : null;
  const top = up ? (hint[1] === bassPc ? above(up, hint[0] === 'min' ? 'b3' : '3') : up) : onLetter(low.L + [0, 1, 1, 2, 2, 3, 3, 4, 5, 5, 6, 6][semis], other);
  const lowN = up && hint[1] === bassPc ? up : up ? above(up, hint[0] === 'min' ? 'b3' : '3') : low;
  let text = 'Two notes a ' + intervalName(semis) + ' apart (' + noteText(lowN) + ' and ' + noteText(top) + ')';
  if (hint) text += ': the core of ' + noteText(up) + TYPE[hint[0]].sym + (hint[1] === bassPc ? '' : '/' + noteText(lowN)) + ' with its 5th left out';
  if (semis === 6) text += ': the tense heart of a dominant 7th chord';
  out.push({ kind: 'interval', symbol: noteText(lowN) + ' + ' + noteText(top), text, cost: 5, notes: [lowN, top],
    labels: hint ? { [hint[1]]: 'R', [hint[1] === bassPc ? other : bassPc]: hint[0] === 'min' ? 'b3' : '3' } : { [bassPc]: 'R', [other]: intervalLabel(semis) } });
  return out;
}
const intervalLabel = s => ['R', 'b2', '2', 'b3', '3', '4', 'b5', '5', 'b6', '6', 'b7', '7'][mod12(s)];
