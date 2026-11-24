// Encore Scales: the teaching bits. Short plain explanations for the words the page uses (tap or hover
// one to read it), the ear-training questions, and following a player note by note. No page in here.
import { SCALE } from './scales-core.js';
import { mod12 } from './chords-core.js';

export const GLOSSARY = {
  scale: ['Scale', 'A set of notes, in order, that a melody or solo is made from. The first note is home (the root).'],
  root: ['Root', 'The scale\'s home note, the one it is named after. A melody in the scale tends to end on it.'],
  mode: ['Mode', 'A scale started from a different note of another scale. D Dorian has the same notes as C major, but D is home, so it sounds different.'],
  formula: ['Formula', 'The scale counted against the major scale on the same root: 1 2 3 4 5 6 7 is major. A b (flat) lowers that degree a half step, a # (sharp) raises it. Dorian is 1 2 b3 4 5 6 b7.'],
  degree: ['Degree', 'A note\'s place in the scale, counted from the root: the 1st, 2nd, 3rd and so on. Dots on the neck can show degrees instead of note names.'],
  steps: ['Steps (W and H)', 'The distance from each note to the next. H is a half step (one fret, or the next key on a piano), W a whole step (two frets). W+H is a step and a half (three frets).'],
  half: ['Half step', 'The smallest step in Western music: one fret on a guitar, or the very next key on a piano (black keys included).'],
  char: ['Color note', 'The note that makes a scale sound like itself and not its neighbor. Dorian\'s natural 6th is what makes it Dorian rather than natural minor. Lean on it to bring the flavor out.'],
  parent: ['Parent scale (same notes)', 'The scale a mode comes from. D Dorian, E Phrygian and G Mixolydian all use the notes of C major, their parent, each with a different home.'],
  parallel: ['Parallel (same root)', 'Scales built on the same home note with different notes. C major and C Dorian are parallel: compare them to hear what each changed note does.'],
  brightness: ['Brightness', 'The seven modes of the major scale in order, from brightest (Lydian) to darkest (Locrian). Each one is the last with a single note lowered a half step.'],
  avoid: ['Avoid note', 'A scale note a half step above a chord tone. It clashes if you hold it over the chord (F over C major), so pass through it instead of landing on it. It is still part of the scale.'],
  tension: ['Tensions', 'Scale notes that aren\'t in the chord but sound good over it, adding color: the 9th, 11th and 13th (the 2nd, 4th and 6th an octave up).'],
  pentatonic: ['Pentatonic', 'A five-note scale. The common ones leave out the half steps, so nothing clashes: an easy, strong sound used all over the world.'],
  blue: ['Blue note', 'A note bent or slid between the cracks: the b3 against a major chord, the b5, the b7. The rub is the blues.'],
  leading: ['Leading tone', 'A 7th a half step below the root. It pulls up to home, which makes major and harmonic minor feel resolved.'],
  aug2: ['Augmented 2nd (W+H)', 'A step and a half between neighboring notes of a scale, like b6 to 7 in harmonic minor. It is the sound most people call "exotic".'],
  tritone: ['Tritone', 'Three whole steps (6 half steps), like the 1 and #4 of Lydian: the most restless interval.'],
  symmetric: ['Symmetric scale', 'A scale whose step pattern repeats inside the octave (whole tone: all whole steps; diminished: half, whole, half, whole). It has no strong home, so it is used for tension.'],
  approx: ['12-tone approximation', 'A scale whose real tuning falls between our 12 notes (gamelan, maqam, Persian music). On frets or piano keys we can only show the nearest notes, so treat it as a flavor, not the real thing.'],
  enharmonic: ['Spelling (enharmonic)', 'Two names for one sound, like F# and Gb. A 7-note scale uses each letter once, so sometimes a note gets an odd name (E# or F##). That keeps the formula readable; it sounds the same as its plainer name.'],
  position: ['Position (box)', 'The scale played in one spot on the neck, a hand\'s width (about 4 frets) with one finger per fret, so you can play it without shifting.'],
  caged: ['CAGED', 'A map of the guitar neck in five shapes named after the open chords C, A, G, E and D. Each scale position wraps around one of those chord shapes of the key, so you can see the chord inside the scale.'],
  nps: ['Notes per string', 'Patterns with the same number of notes (three, or two for a pentatonic) on every string. They spread across more frets but make fast picking and legato even.'],
  drone: ['Drone', 'A note held underneath while you play. It keeps home in your ear so you can hear exactly what each scale note does against it.'],
  chordscale: ['Chord and scale', 'Each chord has scales that fit it: ones that contain all its notes. Play the scale built on the chord\'s root, and the chord tones are your safe landing places.'],
  numeral: ['Roman numerals', 'A chord\'s place in the scale: I on the 1st note, V on the 5th. Upper case is major, lower case minor, ° diminished, ø half-diminished, + augmented. A b in front (bVII) means a half step lower than in the major scale.'],
  triad: ['Triad', 'A three-note chord: a root, a 3rd and a 5th, made by stacking every other note of a scale.'],
  seventh: ['7th chord', 'A triad with one more 3rd on top (every other scale note again). Richer: the sound of jazz, soul and R&B.'],
};

// sets of scales for the ear training, easiest first
export const EAR_SETS = {
  basic: { name: 'Major, minor and pentatonic', ids: ['ionian', 'aeolian', 'major_pent', 'minor_pent'] },
  minor: { name: 'The three minors', ids: ['aeolian', 'harmonic_minor', 'melodic_minor', 'dorian'] },
  modes: { name: 'The seven modes', ids: ['lydian', 'ionian', 'mixolydian', 'dorian', 'aeolian', 'phrygian', 'locrian'] },
  colour: { name: 'Spicy ones', ids: ['phrygian_dominant', 'ukrainian_dorian', 'harmonic_minor', 'lydian_dominant', 'whole_tone', 'blues', 'double_harmonic', 'altered'] },
};

/** An ear-training question: { scale, options (up to 4 scales, shuffled, the right one included), answer (index) } */
export function earQuestion(setId, rand = Math.random, last = null) {
  const ids = EAR_SETS[setId].ids;
  let id;
  do { id = ids[Math.floor(rand() * ids.length)]; } while (ids.length > 1 && id === last);
  const others = ids.filter(x => x !== id);
  for (let i = others.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [others[i], others[j]] = [others[j], others[i]]; }
  const options = [id, ...others.slice(0, 3)];
  for (let i = options.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [options[i], options[j]] = [options[j], options[i]]; }
  return { scale: SCALE[id], options: options.map(x => SCALE[x]), answer: options.indexOf(id) };
}

// ---- following a player: turns a stream of pitch readings into notes, and checks them against the exercise

/**
 * Note finder. Feed it readings ({ t: seconds, midi: nearest note, cents, level }) every few milliseconds;
 * it reports a note once the same pitch has held for `hold` readings, and again only after the pitch
 * changes, goes quiet, or is plucked again (the level jumps).
 */
export function noteFinder({ hold = 3, quietReset = 4 } = {}) {
  let cand = null, count = 0, current = null, quiet = 0, lastLevel = 0, firstT = 0;
  return function feed(r) {
    if (!r || r.midi == null) {
      if (++quiet >= quietReset) { current = null; cand = null; count = 0; }
      lastLevel = r ? r.level || 0 : 0;
      return null;
    }
    quiet = 0;
    const replucked = current === r.midi && r.level > lastLevel * 2.2 && r.level > 0.01;
    lastLevel = r.level || 0;
    if (replucked) { current = null; cand = null; count = 0; }
    if (r.midi === current) return null;
    if (r.midi !== cand) { cand = r.midi; count = 1; firstT = r.t; } else count++;
    if (count >= hold) { current = cand; cand = null; count = 0; return { midi: current, t: firstT }; }
    return null;
  };
}

/**
 * Checks played notes against a list of expected notes, in order. Pitch classes are compared (a note in
 * another octave still counts, and is marked so). A wrong note is marked and you try again; playing the
 * note after the expected one skips it (marked missed). Returns { marks, at, done, score }.
 */
export function exerciseChecker(expected) {
  const marks = expected.map(() => ({ state: 'todo', t: null, octave: false }));
  const wrong = [];
  let at = 0;
  const api = {
    marks, wrong,
    get at() { return at; },
    get done() { return at >= expected.length; },
    play(midi, t) {
      if (at >= expected.length) return { kind: 'done' };
      const want = expected[at];
      if (mod12(midi) === mod12(want.midi)) {
        marks[at] = { state: 'right', t, octave: midi !== want.midi, heard: midi };
        at++;
        return { kind: 'right', index: at - 1 };
      }
      const next = expected[at + 1];
      if (next && mod12(midi) === mod12(next.midi)) {
        marks[at] = { state: 'missed', t: null, octave: false };
        marks[at + 1] = { state: 'right', t, octave: midi !== next.midi, heard: midi };
        at += 2;
        return { kind: 'skipped', index: at - 1 };
      }
      wrong.push({ midi, t, index: at });
      if (marks[at].state === 'todo') marks[at].state = 'tried';
      return { kind: 'wrong', index: at };
    },
    score() {
      const right = marks.filter(m => m.state === 'right').length, missed = marks.filter(m => m.state === 'missed').length;
      const total = expected.length + wrong.length;
      return { right, missed, wrong: wrong.length, percent: total ? Math.round(100 * right / total) : 0 };
    },
  };
  return api;
}

/** Timing against a click: each note's offset from its beat (ms), and a summary { mean, spread, onTime (share within `ok` ms) } */
export function timingReport(times, beatTimes, ok = 0.07) {
  const offs = [];
  times.forEach((t, i) => { if (t != null && beatTimes[i] != null) offs.push(t - beatTimes[i]); });
  if (!offs.length) return null;
  const mean = offs.reduce((a, b) => a + b, 0) / offs.length;
  const spread = Math.sqrt(offs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / offs.length);
  return { offsets: offs.map(x => Math.round(x * 1000)), mean: Math.round(mean * 1000), spread: Math.round(spread * 1000),
           onTime: Math.round(100 * offs.filter(x => Math.abs(x) <= ok).length / offs.length) };
}
