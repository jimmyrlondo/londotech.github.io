// Encore Chords: the teaching bits. Short plain explanations for the words the page uses
// (tap or hover one to read it), and the quiz questions. No page in here.
import { TYPE, chordSymbol, chordTones, noteText, chord, spellRoot, mod12 } from './chords-core.js';
import { makeKey, keyName, keyPalette, nextMoves } from './chords-keys.js';

export const GLOSSARY = {
  root: ['Root', 'The note a chord is built on and named after. C major is built up from C.'],
  triad: ['Triad', 'A three-note chord: a root, a 3rd and a 5th stacked up. Major, minor, diminished and augmented are the four kinds.'],
  third: ['The 3rd', 'The note that makes a chord major (4 half steps above the root) or minor (3 half steps). Leave it out and the chord is neither.'],
  fifth: ['The 5th', 'The note 7 half steps above the root. It makes a chord solid but adds little colour, so it is the first note to leave out.'],
  seventh: ['7th chords', 'A triad with one more 3rd on top. A b7 (10 half steps up) gives a bluesy dominant 7th; a natural 7 (11 half steps) gives a dreamy maj7.'],
  interval: ['Interval', 'The distance between two notes, counted in letter names (a 3rd, a 5th) and half steps (a minor 3rd is 3 half steps, a major 3rd is 4).'],
  formula: ['Chord formula', 'The recipe for a chord, counted up the major scale from the root: 1 3 5 is major, 1 b3 5 is minor, 1 3 5 b7 is a dominant 7th. A flat (b) lowers a note a half step, a sharp (#) raises it.'],
  inversion: ['Inversion', 'The same chord with a note other than the root at the bottom. C/E is C major with its 3rd (E) in the bass: same chord, smoother bass line.'],
  slash: ['Slash chord', 'Written chord/bass, like C/E or D/C: play the chord on the left over the bass note on the right.'],
  power: ['Power chord', 'Just a root and a 5th (C5), no 3rd, so it is neither major nor minor. Rock\'s best friend, especially with distortion.'],
  sus: ['Suspended (sus)', 'The 3rd is swapped for a 2nd or a 4th. Open and unresolved: it often "resolves" back to the plain chord.'],
  add: ['Added tones (add9)', 'A triad plus one extra note, with no 7th in between. Cadd9 is C E G plus D.'],
  extension: ['Extensions (9, 11, 13)', 'Notes stacked past the 7th: the 9th is the 2nd an octave up, the 11th the 4th, the 13th the 6th. They add colour and sophistication.'],
  altered: ['Altered tones', 'A 9th, 11th or 13th raised or lowered a half step (b9, #9, #11, b13). They add bite to a dominant chord just before it resolves.'],
  diminished: ['Diminished', 'A minor 3rd on a minor 3rd (1 b3 b5): tense, unstable. The diminished 7th adds another (bb7) and splits the octave into four equal steps.'],
  halfdim: ['Half-diminished (m7b5)', 'A diminished triad with a b7 on top (1 b3 b5 b7). It is the ii in a minor key and the vii in a major key.'],
  augmented: ['Augmented', 'Two major 3rds stacked (1 3 #5): dreamy, eerie, restless. It splits the octave into three equal steps.'],
  enharmonic: ['Enharmonic spelling', 'Two names for one sound, like F# and Gb. The right name depends on the chord: F#m7b5 is F# A C E, so the A stays an A. We spell each chord the way theory books would.'],
  key: ['Key', 'A home note and the scale built on it. In C major, C feels like home and the other chords of the scale lead away and back.'],
  relative: ['Relative major and minor', 'Two keys that share every note: C major and A minor. They just call a different chord home.'],
  parallel: ['Parallel key', 'The same home note in the other mode: C major and C minor. Borrowed chords come from the parallel key.'],
  numeral: ['Roman numerals', 'A chord\'s place in the key: I is built on the 1st note, V on the 5th. Upper case means major, lower case minor; ° means diminished and ø half-diminished. A flat in front (bVII) means a half step below where the scale would put it. A slash and a number (I/3) says which chord tone is in the bass.'],
  tonic: ['Home (tonic)', 'The I chord (or i in minor) and its stand-ins, iii and vi. Restful: the song can stop here.'],
  subdominant: ['Away (subdominant)', 'IV and ii: chords that move the song away from home without much tension. They usually lead to V or back to I.'],
  dominant: ['Tension (dominant)', 'V, V7 and vii°: chords with the leading tone in them, so they want to resolve home.'],
  leading: ['Leading tone', 'The 7th note of the scale, a half step below home (B in C). It pulls up to the tonic, which is why V and vii° sound like they need to resolve.'],
  tritone: ['Tritone', 'Three whole steps (6 half steps), like B to F: the most restless interval. A dominant 7th\'s 3rd and 7th are a tritone apart, and resolving it is what makes V7 to I feel so final.'],
  cadence: ['Cadence', 'A chord move that ends a phrase, like punctuation. V to I is a full stop; IV to I an "amen"; V to vi a surprise; ending on V a question mark.'],
  deceptive: ['Deceptive cadence', 'V goes somewhere other than I, usually to vi. The ear is promised home and gets its minor twin instead: a gentle twist that keeps the song going.'],
  plagal: ['Plagal ("amen") cadence', 'IV to I (or the minor iv to I): a soft landing with no leading tone, the "a-men" at the end of a hymn.'],
  secondary: ['Secondary dominant', 'The V7 of a chord that isn\'t home, written V7/x ("five of x"). E7 in C is V7/vi: it makes Am feel like a little home for a moment.'],
  borrowed: ['Borrowed chord (modal interchange)', 'A chord taken from the parallel key or a mode with the same home note, like Fm or Bb in C major. Same home, new colour.'],
  neapolitan: ['Neapolitan', 'A major chord built a half step above home (Db in C, written bII). It usually comes just before V, often with its 3rd in the bass. Dark, dramatic, very classical (and very metal).'],
  secdim: ['Secondary diminished', 'A diminished 7th chord built a half step below a target chord (vii°7/x). Every note leans into the target, so it makes a smooth chromatic passing step.'],
  tritonesub: ['Tritone substitution', 'Swap a dominant 7th for the one a tritone away (Db7 for G7). They share the same tritone, so it pulls home just as well, but the bass slides down by a half step. A jazz staple.'],
  pivot: ['Pivot chord', 'A chord that belongs to two keys at once (Am is vi in C and ii in G). Use it to step into the new key without a jolt.'],
  modulation: ['Changing key (modulation)', 'Moving the song\'s home to a new note. A pivot chord, then the new key\'s V7, then its I does it smoothly.'],
  rootmotion: ['Root motion', 'How far the root moves from one chord to the next. Down a 5th (up a 4th) is the strongest move; by a 3rd is smooth (the chords share notes); by a step is forward motion.'],
  common: ['Common tones', 'Notes two chords share. The more they share, the smoother the change sounds.'],
  voicing: ['Voicing', 'Which notes of a chord you play, in what order and octave. x32010 and x35553 are both C major: two voicings.'],
  barre: ['Barre', 'One finger pressed flat across several strings at the same fret, so the whole shape can move up the neck.'],
  capo: ['Capo', 'A clamp across the neck that raises every open string. With a capo at fret 3, a G shape sounds as Bb, so you can play in hard keys with easy shapes.'],
  shapes: ['Shapes and frets', 'Shapes are written low string first: x means don\'t play that string, 0 means play it open, a number is the fret.'],
  quality: ['Chord quality', 'What kind of chord it is (major, minor, dominant 7th...), apart from which note it starts on.'],
  oompah: ['Oom-pah', 'The polka and march accompaniment: a bass note on the beat ("oom"), the chord on the off-beat ("pah"), with the bass swapping between root and 5th.'],
};

/** A quiz question: { kind, prompt, options (text), answer (index), explain, chord (to play), key } */
export function quizQuestion(kind, rand = Math.random) {
  const pick = list => list[Math.floor(rand() * list.length)];
  const shuffle = list => { const a = list.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const finish = (q, right, wrong) => {
    const options = shuffle([right, ...shuffle(wrong.filter((w, i) => w !== right && wrong.indexOf(w) === i)).slice(0, 3)]);
    return { ...q, options, answer: options.indexOf(right) };
  };
  if (kind === 'numeral') {
    const minor = rand() < 0.35;
    const key = makeKey(pick(minor ? ['A', 'E', 'D', 'B', 'G', 'C'] : ['C', 'G', 'D', 'A', 'E', 'F', 'Bb', 'Eb']), minor ? 'minor' : 'major');
    const p = keyPalette(key);
    const pool = p.all.filter(e => e.group === 'diatonic' || (rand() < 0.4 && (e.group === 'secondary' || e.rn === 'V7')));
    const e = pick(pool);
    const wrong = p.all.filter(x => x.group === e.group || x.group === 'diatonic').map(x => x.label);
    return finish({ kind, key, chord: e.chord, prompt: 'In ' + keyName(key) + ', which numeral is ' + chordSymbol(e.chord) + '?',
      explain: chordSymbol(e.chord) + ' is ' + e.label + ' in ' + keyName(key) + '. ' + e.why }, e.label, wrong);
  }
  if (kind === 'name') {
    const types = ['maj', 'min', '7', 'm7', 'maj7', 'dim', 'sus4', 'sus2', 'm7b5', '6', 'add9', 'aug', 'dim7', 'm6', '9'];
    const pc = Math.floor(rand() * 12), t = pick(types);
    const c = chord(spellRoot(pc, t), t);
    const notes = chordTones(c).map(x => noteText(x.note)).join(' ');
    const wrong = [...types.map(x => chordSymbol(chord(c.root, x))), ...[3, 4, 5, 7, 9].map(k => chordSymbol(chord(spellRoot(mod12(pc + k), t), t)))];
    return finish({ kind, chord: c, prompt: 'Which chord is spelled ' + notes + '?',
      explain: chordSymbol(c) + ' is ' + TYPE[t].f.join(' ') + ' from ' + noteText(c.root) + ': ' + notes + '.' }, chordSymbol(c), shuffle(wrong));
  }
  // where does it want to go
  const key = makeKey(pick(['C', 'G', 'D', 'F', 'A', 'Bb']), 'major');
  const p = keyPalette(key);
  const from = pick(p.all.filter(e => ['V7', 'V7/ii', 'V7/V', 'V7/vi', 'V7/IV', 'vii°7/V', 'IV'].includes(e.rn)));
  const moves = nextMoves(key, from.chord, 12, p);
  const best = moves[0];
  const wrong = moves.slice(4).map(m => chordSymbol(m.chord));
  return finish({ kind, key, chord: from.chord, prompt: 'In ' + keyName(key) + ', where does ' + chordSymbol(from.chord) + ' (' + from.label + ') most want to go?',
    explain: best.why }, chordSymbol(best.chord), wrong.length >= 3 ? wrong : p.all.map(e => chordSymbol(e.chord)));
}
