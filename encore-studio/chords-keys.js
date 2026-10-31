// Encore Chords: keys and progressions. Roman numerals, the map of chords a key offers (its own
// chords, secondary dominants, borrowed chords, the spicy ones, ways to change key), where a chord
// can go next and why, starter progressions, transposing and a text chart. No page in here.
import { TYPE, typeBySym, note, noteText, parseNote, pcOf, mod12, above, degree, chord, chordTones, chordSymbol,
         onLetter, sameNote, intervalBetween, moveBy, spellRoot, inKey } from './chords-core.js';

const mod7 = n => ((n % 7) + 7) % 7;
export const MAJOR_KEYS = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb'];
export const MINOR_KEYS = ['A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'A#', 'D', 'G', 'C', 'F', 'Bb', 'Eb', 'Ab'];
export const makeKey = (tonic, mode = 'major') => ({ tonic: typeof tonic === 'string' ? parseNote(tonic) : tonic, mode });
export const keyName = k => noteText(k.tonic) + (k.mode === 'minor' ? ' minor' : ' major');
const ALT = { major: [0, 0, 0, 0, 0, 0, 0], minor: [0, 0, -1, 0, 0, -1, -1] };
/** The key's seven notes, spelled (natural minor for a minor key) */
export function scaleNotes(key) {
  return ALT[key.mode].map((a, step) => above(key.tonic, (a < 0 ? 'b' : '') + (step + 1)));
}
/** How many sharps (positive) or flats (negative) the key signature has */
export function signature(key) {
  return scaleNotes(key).reduce((s, n) => s + n.a, 0);
}

// ---- roman numerals. We count every chord against the major scale of the key's tonic, so in a minor
// key the 3rd, 6th and 7th chords carry a flat (i, ii°, bIII, iv, v, bVI, bVII), the way pop and jazz write them.

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
const RN_RE = /^(b|#)?(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)([^/]*)((?:\/[^/]+)*)$/;

/**
 * The chord a numeral means in a key: 'V7', 'bVI', 'iiø7', 'vii°7/V' (secondary: counted from that chord's root),
 * 'I/3' (an inversion: the slash number says which of its tones is in the bass).
 */
export function numeralChord(key, rn) {
  const m = RN_RE.exec(rn.trim());
  if (!m) throw new Error('not a numeral: ' + rn);
  const [, acc = '', roman, suffix, rest] = m;
  const upper = roman === roman.toUpperCase(), step = ROMAN.indexOf(roman.toUpperCase());
  let ref = key.tonic, inv = null;
  for (const part of rest.split('/').filter(Boolean)) {
    if (/^(b|#)?\d+$/.test(part)) inv = part;
    else ref = numeralChord(key, part).root;
  }
  const root = above(ref, acc + (step + 1));
  let sym;
  if (suffix.startsWith('°')) sym = suffix === '°7' ? 'dim7' : 'dim';
  else if (suffix.startsWith('ø')) sym = suffix === 'ø9' ? 'm9b5' : 'm7b5';
  else if (suffix === '+') sym = 'aug';
  else if (suffix === '+7') sym = '7#5';
  else if (upper) sym = suffix;
  else sym = 'm' + ({ maj7: '(maj7)', add9: '(add9)', add11: '(add11)', maj9: '(maj9)' }[suffix] || suffix);
  const t = typeBySym(sym);
  if (!t) throw new Error('unknown chord quality in ' + rn);
  let bass = null;
  if (inv) {
    const n = inv.replace(/^[b#]+/, '');
    const tone = chordTones(chord(root, t.id)).find(x => x.d.replace(/^[b#]+/, '') === n);
    bass = tone ? tone.note : null;
  }
  return chord(root, t.id, bass);
}

const FAM_LOWER = ['min', 'dim', 'hdim'];
/** A numeral for any chord in a key, worked out from its root and quality (e.g. F#m7b5 in C = #ivø7) */
export function plainNumeral(key, c) {
  const step = mod7(c.root.L - key.tonic.L), ref = above(key.tonic, String(step + 1));
  let alt = mod12(pcOf(c.root) - pcOf(ref));
  if (alt > 6) alt -= 12;
  const t = TYPE[c.type], lower = FAM_LOWER.includes(t.fam);
  const r = ROMAN[step];
  return (alt < 0 ? 'b'.repeat(-alt) : '#'.repeat(alt)) + (lower ? r.toLowerCase() : r) + t.num;
}
/** The slash part of a numeral: which tone is in the bass ('/3'), or the bass note if it isn't a chord tone */
export function inversionPart(c) {
  if (!c.bass) return '';
  const tone = chordTones(c).find(x => sameNote(x.note, c.bass));
  return tone ? '/' + tone.d.replace(/^[b#]+/, '') : ' over ' + noteText(c.bass);
}
const sameChord = (a, b) => pcOf(a.root) === pcOf(b.root) && a.type === b.type;
/** The numeral to show for a chord in a key: the map's name for it if it's on the map, else worked out */
export function numeralOf(key, c, palette = null, next = null) {
  const p = palette || keyPalette(key);
  let hit = p.all.find(e => sameChord(e.chord, c));
  // a secondary dominant that doesn't go to its target is just a 7th chord here (the blues I7 isn't heading to IV)
  if (hit && hit.target && next && pcOf(next.root) !== pcOf(numeralChord(key, hit.target).root)) hit = null;
  return (hit ? hit.label : plainNumeral(key, c)) + inversionPart(c);
}

// ---- the map of a key

/** Fills {3}, {b7}, {root}... with this chord's tones, {tonic} with the key's, {I} with the home chord, {target}, {tr} */
function fill(text, c, key, extra = {}) {
  const tones = chordTones(c);
  return text.replace(/\{([^}]+)\}/g, (all, k) => {
    if (k === 'root') return noteText(c.root);
    if (k === 'name') return chordSymbol(c);
    if (k === 'tonic') return noteText(key.tonic);
    if (k === 'I') return chordSymbol(numeralChord(key, key.mode === 'minor' ? 'i' : 'I'));
    if (k in extra) return extra[k];
    const t = tones.find(x => x.d === k);
    return t ? noteText(t.note) : all;
  });
}

// fn: T home (tonic), S away (subdominant, sets up tension), D tension (dominant, wants to resolve)
const MAJOR_TRIADS = [
  ['I', 'T', 'Home. The chord the song is about; every other chord is heard against it.'],
  ['ii', 'S', 'Away, gently. It shares two notes with IV and is the classic step before V (ii, V, I).'],
  ['iii', 'T', 'A soft stand-in for home: it shares two notes with {I}. Often walks on to vi or IV.'],
  ['IV', 'S', 'Away from home but relaxed. It leans back to {I} (the "amen" ending) or pushes on to V.'],
  ['V', 'D', 'Tension. Its 3rd ({3}) is a half step under {tonic} and wants to rise to it.'],
  ['vi', 'T', 'Home\'s darker twin (the relative minor): it shares two of {I}\'s three notes. A favorite surprise after V.'],
  ['vii°', 'D', 'Tense and unstable. It is V7 without its root, so it pulls home just as hard.'],
];
const MAJOR_SEVENTHS = [
  ['Imaj7', 'T', 'Home with a soft, dreamy major 7th ({7}) on top. Jazz, soul and bossa nova use it as home.'],
  ['ii7', 'S', 'The jazz favorite before V7: its root falls a 5th to V.'],
  ['iii7', 'T', 'A mellow stand-in for home that leads nicely to vi.'],
  ['IVmaj7', 'S', 'Lush and open. Its 7th ({7}) is the 3rd of the key, so it floats instead of pulling.'],
  ['V7', 'D', 'The strongest pull in music. Its 3rd ({3}) and 7th ({b7}) clash a tritone apart and resolve inward into {I}.'],
  ['vi7', 'T', 'The relative minor with a 7th: warm and a little wistful.'],
  ['viiø7', 'D', 'Half-diminished: like V9 without its root. A softer, jazzier pull home.'],
];
const MINOR_TRIADS = [
  ['i', 'T', 'Home, in minor: dark, serious, settled.'],
  ['ii°', 'S', 'Away, with a bite: a tense diminished chord that sets up V.'],
  ['bIII', 'T', 'Bright relief: the relative major\'s home chord, a second home inside the minor key.'],
  ['iv', 'S', 'The minor key\'s away chord: heavy and soulful. It leans back to i or pushes on to V.'],
  ['v', 'D', 'The natural minor v: no leading tone, so it pushes gently. Folk, modal and rock songs love it.'],
  ['V', 'D', 'The major V (from the harmonic minor scale): its 3rd ({3}) pulls up to {tonic}. That\'s why minor songs still feel like they end.'],
  ['bVI', 'S', 'Warm and big. It shares two notes with i and with iv; it often moves to bVII or V.'],
  ['bVII', 'D', 'A whole step under home: a strong, rock-style return to i with no leading tone.'],
];
const MINOR_SEVENTHS = [
  ['i7', 'T', 'Home in minor with a 7th: smooth and jazzy.'],
  ['iiø7', 'S', 'Where the minor ii, V, i starts: half-diminished, moody, it sets up V7.'],
  ['bIIImaj7', 'T', 'The relative major\'s home, made dreamy with a major 7th.'],
  ['iv7', 'S', 'A soulful minor iv with a 7th.'],
  ['bVImaj7', 'S', 'Lush and sad-beautiful; a favorite in ballads and R&B.'],
  ['bVII7', 'D', 'A bluesy return home. It is also the V7 of bIII, so it can take you to the relative major.'],
  ['V7', 'D', 'The full-strength pull home in minor: its 3rd ({3}) rises to {tonic}, its 7th ({b7}) falls.'],
  ['vii°7', 'D', 'The diminished 7th: every note leans toward a note of i. Maximum suspense (and the sound of silent-film villains).'],
];
const SECONDARY = {
  major: [['V7/ii', 'ii'], ['V7/iii', 'iii'], ['V7/IV', 'IV'], ['V7/V', 'V'], ['V7/vi', 'vi']],
  minor: [['V7/iv', 'iv'], ['V7/V', 'V'], ['V7/bVI', 'bVI'], ['V7/bVII', 'bVII']],
};
const SECONDARY_WHY = '{target}\'s own V7: its 3rd ({3}) is a half step under {tr}, so it pulls straight to {target}.';
const SECONDARY_COLOUR = {
  'V7/vi': ' A dramatic swing into the relative minor.',
  'V7/IV': ' It turns home into a launch pad (very bluesy).',
  'V7/V': ' The ragtime, swing and country "two-chord": it makes V feel like an arrival.',
  'V7/ii': ' Brightens the ii chord, common in old standards.',
  'V7/iii': ' A surprising, emotional detour.',
};
const BORROWED = {
  major: [
    ['iv', 'S', 'The "sad IV", borrowed from {tonic} minor. Its {b3} sinks a half step as you go home: bittersweet (think the Beatles and Radiohead).'],
    ['bVII', 'D', 'Rock\'s favorite borrowed chord (from the Mixolydian mode). It goes home with no leading tone: strong but laid-back.'],
    ['bVI', 'S', 'Big and cinematic, borrowed from {tonic} minor. Try bVI, bVII, I for a heroic finish.'],
    ['bIII', 'T', 'A bold, rocky major chord a minor 3rd above home, borrowed from {tonic} minor.'],
    ['i', 'T', 'Home turned minor (borrowed from {tonic} minor): a sudden shadow over the song.'],
    ['iiø7', 'S', 'The minor key\'s ii: a darker, tenser way to set up V.'],
    ['v', 'D', 'A minor v (Mixolydian flavor): a gentle, folky dominant with no leading tone.'],
    ['II', 'S', 'A major II from the Lydian mode: bright and dreamy. Unlike V/V it doesn\'t have to go to V.'],
  ],
  minor: [
    ['I', 'T', 'The Picardy third: end a minor song on a major home chord, a ray of light.'],
    ['IV', 'S', 'A major IV (from the Dorian mode): soulful and hopeful. Funk, Santana and Celtic tunes live here.'],
    ['ii', 'S', 'A minor ii borrowed from {tonic} major: smoother than ii°, still leads to V.'],
  ],
};

/**
 * Every chord on the map of a key, grouped. Each entry: rn (what we parse), label (what we show), chord,
 * fn ('T' home, 'S' away, 'D' tension, or '' for colour), group, why (one plain line), target (the chord it pulls to).
 */
export function keyPalette(key) {
  const groups = [];
  const add = (id, title, blurb, list) => { groups.push({ id, title, blurb, items: list }); return list; };
  const entry = (group, rn, fn, why, extra = {}) => {
    let c = numeralChord(key, rn), alias = null;
    // a borrowed or chromatic chord that would need a double flat or sharp is written the simpler way (Fb7 as E7)
    if (group !== 'diatonic' && group !== 'sevenths' && chordTones(c).some(x => Math.abs(x.note.a) > 1)) {
      alias = chordSymbol(c);
      c = chord(spellRoot(pcOf(c.root), c.type), c.type);
    }
    return { group, rn, label: extra.label || rn, chord: c, alias, fn, why: fill(why, c, key, extra.fillWith || {}), target: extra.target || null };
  };
  const minor = key.mode === 'minor';
  add('diatonic', 'In the key', minor ? 'The chords made from the key\'s own notes (natural minor, plus the major V the harmonic minor gives you).'
    : 'The seven chords made only from the key\'s own notes.',
    (minor ? MINOR_TRIADS : MAJOR_TRIADS).map(([rn, fn, why]) => entry('diatonic', rn, fn, why)));
  add('sevenths', 'In the key, with 7ths', 'The same chords with one more note stacked on top: richer, jazzier.',
    (minor ? MINOR_SEVENTHS : MAJOR_SEVENTHS).map(([rn, fn, why]) => entry('sevenths', rn, fn, why)));
  add('secondary', 'Secondary dominants', 'Borrow the V7 of another chord in the key to make that chord feel like a little home of its own.',
    SECONDARY[key.mode].map(([rn, t]) => {
      const target = numeralChord(key, t);
      return entry('secondary', rn, 'D', SECONDARY_WHY + (SECONDARY_COLOUR[rn] || ''), { target: t,
        fillWith: { target: chordSymbol(target), tr: noteText(target.root) } });
    }));
  add('borrowed', 'Borrowed chords', minor ? 'Chords borrowed from ' + noteText(key.tonic) + ' major and its cousins (modal interchange): same home, new colors.'
    : 'Chords borrowed from ' + noteText(key.tonic) + ' minor and its cousins (modal interchange): same home, darker or bolder colors.',
    BORROWED[key.mode].map(([rn, fn, why]) => entry('borrowed', rn, fn, why)));
  const spice = [];
  spice.push(entry('spice', 'bII', 'S', 'The Neapolitan: a major chord a half step above home. It usually comes right before V, often with its 3rd ({3}) in the bass. Dark and dramatic.', { label: 'N (bII)', target: 'V' }));
  for (const t of minor ? ['V', 'iv', 'bVI'] : ['ii', 'V', 'vi', 'IV']) {
    const target = numeralChord(key, t);
    spice.push(entry('spice', 'vii°7/' + t, 'D', 'Its root ({root}) is a half step under {tr} and every note leans into {target}: a smooth, chromatic step.',
      { target: t, fillWith: { target: chordSymbol(target), tr: noteText(target.root) } }));
  }
  for (const t of minor ? ['i', 'V', 'iv'] : ['I', 'V', 'ii', 'vi']) {
    const target = numeralChord(key, t), orig = numeralChord(key, 'V7/' + t);
    spice.push(entry('spice', 'bII7/' + t, 'D', 'The tritone substitute for {orig}: same tense tritone ({3} and {b7}), but it slides down a half step into {target}. Smooth and jazzy.',
      { label: 'subV7/' + t, target: t, fillWith: { orig: chordSymbol(orig), target: chordSymbol(target) } }));
  }
  add('spice', 'Spice', 'Stronger flavors: the Neapolitan, diminished passing chords, and jazz\'s tritone substitutions.', spice);
  return { key, groups, all: groups.flatMap(g => g.items) };
}

// ---- moving to a new key through a chord both keys share (a pivot chord)

const TRIADS = { major: ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'], minor: ['i', 'ii°', 'bIII', 'iv', 'v', 'V', 'bVI', 'bVII'] };
const MOD_TARGETS = {
  major: [['V', 'the dominant key: one sharp more, brighter and lifted'], ['vi', 'the relative minor: the same notes with a darker home'],
          ['IV', 'the subdominant key: one flat more, relaxed'], ['ii', 'a close minor key, often used for a bridge'], ['iii', 'a close minor key, moody and fresh']],
  minor: [['bIII', 'the relative major: the same notes with a brighter home'], ['iv', 'the subdominant minor: deeper and darker'],
          ['v', 'the minor dominant key, a lift'], ['bVI', 'a warm major key a major 3rd down'], ['bVII', 'a bold major key a step down']],
};
/** Ways to change key: for each close key, a chord both keys share, then the new key's V7, then its home */
export function modulations(key) {
  const out = [];
  for (const [rn, what] of MOD_TARGETS[key.mode]) {
    const tonicChord = numeralChord(key, rn);
    const nk = makeKey(tonicChord.root, rn === rn.toLowerCase() ? 'minor' : 'major');
    const here = TRIADS[key.mode].map(r => ({ r, c: numeralChord(key, r) }));
    const there = TRIADS[nk.mode].map(r => ({ r, c: numeralChord(nk, r) }));
    const shared = [];
    for (const h of here) for (const t of there) if (sameChord(h.c, t.c) && !/^i$|^I$/.test(h.r) && !/^i$|^I$/.test(t.r)) shared.push({ here: h.r, there: t.r, chord: t.c });
    // a pivot that is an "away" chord in the new key leads into its V most naturally
    shared.sort((a, b) => rank(a.there) - rank(b.there));
    const pivot = shared[0];
    if (!pivot) continue;
    const v7 = numeralChord(nk, 'V7'), home = numeralChord(nk, nk.mode === 'minor' ? 'i' : 'I');
    out.push({ key: nk, name: keyName(nk), what, pivot, shared, route: [pivot.chord, v7, home],
      why: chordSymbol(pivot.chord) + ' is ' + pivot.here + ' here and ' + pivot.there + ' in ' + keyName(nk) + ', so it belongs to both keys. Then '
        + chordSymbol(v7) + ' (the V7 of ' + keyName(nk) + ') points straight at ' + chordSymbol(home) + '.' });
  }
  return out;
}
const rank = rn => ({ ii: 0, IV: 1, iv: 1, 'ii°': 2, vi: 3, bVI: 3, iii: 4, bIII: 4 }[rn] ?? 5);

// ---- where can it go next, and why

const FN_BY_STEP = { major: ['T', 'S', 'T', 'S', 'D', 'T', 'D'], minor: ['T', 'S', 'T', 'S', 'D', 'S', 'D'] };
function infoOf(key, c, palette) {
  const hit = palette.all.find(e => sameChord(e.chord, c));
  const t = TYPE[c.type];
  let fn = hit ? hit.fn : '';
  if (!fn) fn = t.fam === 'dom' || t.fam === 'dim' ? 'D' : FN_BY_STEP[key.mode][mod7(c.root.L - key.tonic.L)];
  const third = chordTones(c).find(x => x.d === '3');
  const dominant = (t.fam === 'dom' && !!third) || (t.id === 'maj' && hit && hit.fn === 'D' && hit.group !== 'borrowed' && hit.rn !== 'bVII');
  const leading = t.fam === 'dim' || (t.fam === 'hdim' && fn === 'D');
  return { entry: hit, fn, dominant, leading, tones: chordTones(c), t };
}
const toneOf = (info, d) => info.tones.find(x => x.d === d);
const names = list => list.map(noteText).join(' and ');
const stay = list => names(list) + (list.length === 1 ? ' stays' : ' stay') + ' put';
const HOME_TYPES = { major: ['maj', 'maj7', '6', 'add9', 'maj9', '69'], minor: ['min', 'm7', 'm6', 'madd9', 'm9', 'mMaj7', 'm69'] };
const isHome = (key, c) => mod12(pcOf(c.root) - pcOf(key.tonic)) === 0 && HOME_TYPES[key.mode].includes(c.type);
const STABLE = ['maj', 'min', 'dom'];
// real V chords (the key's own, or a secondary one) are the ones whose surprises count as deceptive cadences
const isRealV = info => !!info.entry && ['diatonic', 'sevenths', 'secondary'].includes(info.entry.group);

/**
 * How one chord moves to another in a key: a score (higher is a stronger, more usual move), a kind
 * (resolve, surprise, strong, smooth, step, leap, colour) and one or two plain sentences of why.
 */
export function relate(key, from, to, palette = null) {
  const p = palette || keyPalette(key);
  const a = infoOf(key, from, p), b = infoOf(key, to, p);
  const F = chordSymbol(from), Tn = chordSymbol(to), d = mod12(pcOf(to.root) - pcOf(from.root));
  const common = b.tones.filter(x => a.tones.some(y => y.pc === x.pc)).map(x => x.note);
  const toHome = isHome(key, to);
  let score = 0, kind = '', why = '';
  const a3 = toneOf(a, '3'), a7 = toneOf(a, 'b7'), b3 = toneOf(b, '3') || toneOf(b, 'b3');
  if (a.dominant && d === 5 && STABLE.includes(b.t.fam)) {
    kind = 'resolve'; score = 10 + (toHome ? 1 : 0);
    why = (toHome ? 'The classic cadence (' + (key.mode === 'minor' ? 'V to i' : 'V to I') + '). ' : F + ' is ' + Tn + '\'s own ' + (a7 ? 'V7' : 'V') + ', so it lands there. ')
      + 'Its 3rd (' + noteText(a3.note) + ') rises a half step to ' + noteText(to.root);
    if (a7 && b3) { const fall = mod12(a7.pc - b3.pc); if (fall === 1 || fall === 2) why += ', and its 7th (' + noteText(a7.note) + ') settles down to ' + noteText(b3.note); }
    why += '.';
  } else if (a.dominant && a.t.fam === 'dom' && d === 11 && !isRealV(a) && STABLE.includes(b.t.fam)) {
    kind = 'resolve'; score = 9 + (toHome ? 0.5 : 0);
    why = 'A tritone substitute: ' + F + ' slides down a half step into ' + Tn + ', keeping the same tense tritone ('
      + names([a3.note, a7 ? a7.note : a3.note]) + ') as the usual V7.';
  } else if (a.leading && d === 1 && STABLE.includes(b.t.fam)) {
    kind = 'resolve'; score = 9 + (toHome ? 0.5 : 0);
    why = 'Every note of ' + F + ' leans toward ' + Tn + ': its root (' + noteText(from.root) + ') is a half step under ' + noteText(to.root) + '.';
  } else if (a.dominant && isRealV(a) && ((d === 2 && b.t.fam === 'min') || (d === 1 && b.t.fam === 'maj'))) {
    const expected = onLetter(from.root.L + 3, pcOf(from.root) + 5);
    kind = 'surprise'; score = 7;
    // how gentle it is depends on how much of the chord you expected it keeps (vi keeps two notes of I; bVI only one)
    const exp = p.groups.find(g => g.id === 'diatonic').items.find(e => pcOf(e.chord.root) === pcOf(expected));
    const kept = exp ? b.tones.filter(x => infoOf(key, exp.chord, p).tones.some(y => y.pc === x.pc)).map(x => x.note) : [];
    why = 'A deceptive cadence: the ear expects ' + noteText(expected) + ', gets ' + Tn + ' instead. '
      + (kept.length >= 2 ? Tn + ' keeps ' + names(kept) + ' from the ' + chordSymbol(exp.chord) + ' chord you expected, so it is a gentle surprise that keeps the song going.'
         : kept.length === 1 ? 'Only ' + names(kept) + ' carries over from the ' + chordSymbol(exp.chord) + ' chord you expected, so it is a bolder, more dramatic swerve.'
         : 'Nothing carries over from the chord you expected: a bold, dramatic swerve.');
  } else if (toHome && d === 7 && a.fn === 'S') {
    kind = 'resolve'; score = 7.5;
    why = 'A plagal cadence, the "amen" ending: ' + F + ' relaxes back home with no leading tone.';
    const m3 = toneOf(a, 'b3'), b5 = toneOf(b, '5');
    if (m3 && b5 && mod12(m3.pc - b5.pc) === 1) why += ' Its ' + noteText(m3.note) + ' sinks a half step to ' + noteText(b5.note) + ': bittersweet.';
  } else if (toHome && d === 2 && a.t.fam !== 'min' && mod12(pcOf(from.root) - pcOf(key.tonic)) === 10) {
    kind = 'resolve'; score = 7;
    why = F + ' steps up a whole step to home: a strong, rock-and-roll return with no leading tone (the "backdoor" way home).';
  } else {
    const shared = common.length ? ' They share ' + names(common) + '.' : '';
    const MOTION = {
      5: [6, 'strong', 'The root falls a 5th (' + noteText(from.root) + ' down to ' + noteText(to.root) + '): the strongest, most natural move in harmony, the circle of fifths.'],
      7: [5, 'strong', 'The root rises a 5th: a solid, open move.'],
      8: [4.6, 'smooth', 'The root falls a 3rd, so the chords share two notes: a smooth change of color.'],
      9: [4.6, 'smooth', 'The root falls a 3rd, so the chords share two notes: a smooth change of color.'],
      3: [3, 'smooth', 'The root rises a 3rd: a fresh shift of color.'],
      4: [3, 'smooth', 'The root rises a 3rd: a fresh shift of color.'],
      2: [4, 'step', 'The root steps up a whole step: it moves the song forward.'],
      1: [2.5, 'step', 'It creeps up a half step: tense and dramatic.'],
      10: [3.2, 'step', 'The root steps down: an easy walk downhill (great for bass lines).'],
      11: [2.5, 'step', 'It slides down a half step: smooth and chromatic.'],
      6: [1, 'leap', 'A tritone leap: unsettled and dramatic. Use it on purpose.'],
      0: [1.5, 'colour', 'Same root, new color: only the quality changes.'],
    }[d];
    [score, kind, why] = MOTION;
    if ((d === 8 || d === 9 || d === 3 || d === 4) && common.length !== 2) why = why.replace(', so the chords share two notes', '');
    why += shared && !(d === 8 || d === 9) ? shared : (d === 8 || d === 9) && common.length ? ' (' + stay(common) + '.)' : '';
    const fromHome = isHome(key, from);
    const flow = {
      TS: [1.5, fromHome ? ' It leaves home for an "away" chord.' : ' It heads away.'], TD: [1, fromHome ? ' Straight from home to tension.' : ' It builds tension.'],
      SD: [2, ' Away into tension: the classic setup.'], DT: [1.5, toHome ? ' Tension lands home.' : ' The tension eases.'], ST: [0.5, ''],
      DS: [-1, ' It backs off the tension instead of resolving (common in rock, rarer in classical).'], SS: [0.5, ''], TT: [0, ''], DD: [0, ''],
    }[a.fn + b.fn];
    if (flow) { score += flow[0]; why += flow[1]; }
    if (a.dominant) score -= 2.5;
  }
  const g = b.entry ? b.entry.group : 'outside';
  score += { diatonic: 0, sevenths: -0.3, secondary: -1, borrowed: -1.5, spice: -2, outside: -2 }[g];
  if (b.entry && b.entry.target && kind !== 'resolve') why += ' Next, ' + Tn + ' wants to go to ' + chordSymbol(numeralChord(key, b.entry.target)) + '.';
  return { score, kind, why };
}

/** The best places to go from a chord in a key, with reasons. Uses the map's triads, V7 and the colour chords. */
export function nextMoves(key, from, limit = 8, palette = null) {
  const p = palette || keyPalette(key);
  const pool = p.all.filter(e => e.group !== 'sevenths' || /^(V7|vii°7|viiø7|bVII7)$/.test(e.rn));
  const all = [], seen = new Set();
  for (const e of pool) {
    if (sameChord(e.chord, from)) continue;
    const s = chordSymbol(e.chord);
    if (seen.has(s)) continue;
    seen.add(s);
    all.push({ entry: e, chord: e.chord, ...relate(key, from, e.chord, p) });
  }
  // no more than two chords on one root, so the list shows real choices
  const perRoot = new Map(), out = [];
  for (const m of all.sort((x, y) => y.score - x.score)) {
    const k = pcOf(m.chord.root), n = perRoot.get(k) || 0;
    if (n >= 2) continue;
    perRoot.set(k, n + 1);
    out.push(m);
    if (out.length >= limit) break;
  }
  return out;
}

// ---- starter progressions. bars: one numeral per bar. beats: per bar (polkas are in 2).

export const STYLES = [
  { id: 'pop', name: 'Pop anthem', mode: 'major', bars: ['I', 'V', 'vi', 'IV'], tempo: 100,
    why: 'Home, tension, the sad twin, then away: four chords behind countless hits. Start it on vi and it turns moodier.' },
  { id: 'doowop', name: 'Doo-wop (1950s)', mode: 'major', bars: ['I', 'vi', 'IV', 'V'], tempo: 84,
    why: 'Home, its minor twin, away, tension, and round again. The V at the end pulls you back to the top.' },
  { id: 'blues', name: '12-bar blues', mode: 'major', bars: ['I7', 'I7', 'I7', 'I7', 'IV7', 'IV7', 'I7', 'I7', 'V7', 'IV7', 'I7', 'V7'], tempo: 96,
    why: 'Blues makes every chord a dominant 7th for grit. Four bars home, two away (IV), two home, then V, IV, home, and V turns it around.' },
  { id: 'jazz', name: 'Jazz ii, V, I', mode: 'major', bars: ['ii7', 'V7', 'Imaj7', 'Imaj7'], tempo: 120,
    why: 'Roots falling in 5ths (away, tension, home). Jazz tunes are chains of these, often in new keys.' },
  { id: 'jazzminor', name: 'Minor ii, V, i', mode: 'minor', bars: ['iiø7', 'V7b9', 'i7', 'i7'], tempo: 110,
    why: 'The minor-key version: a half-diminished ii, an altered V7 (the b9 adds bite), home in minor.' },
  { id: 'andalusian', name: 'Andalusian cadence', mode: 'minor', bars: ['i', 'bVII', 'bVI', 'V'], tempo: 104,
    why: 'Flamenco\'s walk down by step from home to the major V. Surf rock and "Hit the Road Jack" use it too.' },
  { id: 'canon', name: 'Pachelbel-style canon', mode: 'major', bars: ['I', 'V', 'vi', 'iii', 'IV', 'I', 'IV', 'V'], tempo: 80,
    why: 'The bass walks down while the chords fall in 4ths and rise in steps. Wedding standard, pop ballad engine.' },
  { id: 'epic', name: 'Minor epic', mode: 'minor', bars: ['i', 'bVI', 'bIII', 'bVII'], tempo: 92,
    why: 'Film-score and power-ballad loop: every chord is in the minor key, and none of them is a tense V, so it rolls on forever.' },
  { id: 'gospel', name: 'Gospel amen', mode: 'major', bars: ['I', 'I7', 'IV', 'iv', 'I', 'I'], tempo: 72,
    why: 'I7 makes home lean toward IV, then the borrowed iv melts back home: the plagal "amen" with a sigh.' },
  { id: 'polka', name: 'Polka (verse)', mode: 'major', bars: ['I', 'I', 'V7', 'V7', 'V7', 'V7', 'I', 'I'], tempo: 120, beats: 2, sound: 'oompah',
    why: 'The polka engine: home and V7 trading places in 2/4, bass on the beat and chord on the off-beat (oom-pah).' },
  { id: 'polkatrio', name: 'Polka trio (moves to IV)', mode: 'major', bars: ['IV', 'IV', 'V7/IV', 'V7/IV', 'V7/IV', 'V7/IV', 'IV', 'IV'], tempo: 120, beats: 2, sound: 'oompah',
    why: 'A polka\'s trio usually moves to the key of IV. The old home chord comes back as a 7th (V7/IV) so it pulls into the new key.' },
  { id: 'turnaround', name: 'Turnaround (I, vi, ii, V)', mode: 'major', bars: ['I', 'vi7', 'ii7', 'V7'], tempo: 120,
    why: 'Roots falling in 5ths from vi back to I: the loop behind "rhythm changes" and endless standards.' },
  { id: 'mixo', name: 'Rock (Mixolydian)', mode: 'major', bars: ['I', 'bVII', 'IV', 'I'], tempo: 112,
    why: 'The borrowed bVII sits a whole step under home; each chord is a 4th below the last. Pure classic rock.' },
  { id: 'heroic', name: 'Heroic finish', mode: 'major', bars: ['I', 'IV', 'bVI', 'bVII', 'I'], tempo: 100,
    why: 'Two borrowed chords stepping up to home (bVI, bVII, I): the video-game victory and stadium-rock ending.' },
  { id: 'sadfour', name: 'Sad IV', mode: 'major', bars: ['I', 'IV', 'iv', 'I'], tempo: 76,
    why: 'Turning IV minor for one bar (the borrowed iv) gives that bittersweet, "Creep"-style ache.' },
];
/** A starter progression's chords in a key (major styles take the key's tonic as major, and so on) */
export function styleChords(style, key) {
  const k = makeKey(key.tonic, style.mode);
  return { key: k, items: style.bars.map(rn => ({ chord: numeralChord(k, rn), beats: style.beats || 4, rn })) };
}

// ---- transposing

/** The spelled interval that moves one key's tonic to another's */
export const keyInterval = (from, to) => intervalBetween(from.tonic, to.tonic);
/** A chord moved by a spelled interval (spellings follow, so V7/V stays a V7/V) */
export function transposeChord(c, iv) {
  const fix = n => (Math.abs(n.a) > 1 ? spellRoot(pcOf(n), c.type) : n);
  const root = fix(moveBy(c.root, iv));
  return chord(root, c.type, c.bass ? fix(moveBy(c.bass, iv)) : null);
}
/** The key a number of semitones up (or down), spelled the usual way for that mode */
export function keyBySemis(key, semis) {
  const pc = mod12(pcOf(key.tonic) + semis);
  const list = key.mode === 'minor' ? MINOR_KEYS : MAJOR_KEYS;
  const options = list.map(parseNote).filter(n => pcOf(n) === pc)
    .sort((a, b) => Math.abs(signature(makeKey(a, key.mode))) - Math.abs(signature(makeKey(b, key.mode))));
  // where there's a choice (F#/Gb, Db/C#), keep to the side the key was on
  const pick = options.find(n => Math.sign(signature(makeKey(n, key.mode))) === Math.sign(signature(key))) || options[0];
  return makeKey(pick, key.mode);
}

// ---- a chord chart as text

/** A text chart: four bars to a line, numerals under the chords */
export function chartText(prog) {
  const { key, items, tempo, name } = prog;
  const p = keyPalette(key);
  const lines = [(name || 'Progression') + '  (' + keyName(key) + (tempo ? ', ' + tempo + ' BPM' : '') + ')', ''];
  const cells = items.map((it, i) => {
    const sym = chordSymbol(it.chord), rn = it.rn || numeralOf(key, it.chord, p, items[i + 1] && items[i + 1].chord);
    const w = Math.max(sym.length, rn.length) + 2;
    return { sym, rn, w, beats: it.beats };
  });
  for (let i = 0; i < cells.length; i += 4) {
    const row = cells.slice(i, i + 4);
    lines.push('| ' + row.map(c => c.sym.padEnd(c.w) + (c.beats !== 4 ? '(' + c.beats + ') ' : '')).join('| ') + '|');
    lines.push('  ' + row.map(c => c.rn.padEnd(c.w) + (c.beats !== 4 ? ' '.repeat(String(c.beats).length + 3) : '')).join('  '));
  }
  return lines.join('\n');
}
