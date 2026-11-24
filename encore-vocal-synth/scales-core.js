// Encore Scales: the theory with no page in it (the scale library, spelling a scale in any key, steps,
// modes, the chords a scale makes, which scale fits a chord or a progression), so node can test it
// (test-scales.mjs). Where a scale sits on a neck is in scales-neck.js. Spelling and chord naming
// come from chords-core.js, the same rules Encore Chords uses.
import { noteText, parseNote, pcOf, mod12, above, degree, onLetter, TYPES, TYPE, chord, chordTones, parseChord,
         spellings, plainNote, soundsAs } from './chords-core.js';
import { plainNumeral, makeKey } from './chords-keys.js';

// ---- the library. f: the formula (degrees counted up the major scale from the root).
// char: the degree(s) that give it its flavour. near: its nearest relative (for "how it differs").
// prior: how often it's the everyday answer (lower is more common), used to break ties in "which scale fits".
// approx: a 12-tone version of a scale whose real tuning falls between our notes.
// sym: a symmetric scale (spelled the plainest way, not one letter per degree).
const S = (id, name, group, f, extra) => ({ id, name, group, f, aka: [], char: [], prior: 1, approx: '', sym: false, ...extra });

export const GROUPS = [
  ['major', 'Major and its modes'],
  ['minor', 'Minor scales'],
  ['hminor', 'Modes of harmonic minor'],
  ['mminor', 'Modes of melodic minor'],
  ['penta', 'Pentatonic and blues'],
  ['bebop', 'Bebop'],
  ['sym', 'Symmetric'],
  ['world', 'World and folk'],
];

export const SCALES = [
  // the major scale and its seven modes (brightest to darkest: Lydian, Ionian, Mixolydian, Dorian, Aeolian, Phrygian, Locrian)
  S('ionian', 'Major (Ionian)', 'major', ['1', '2', '3', '4', '5', '6', '7'], {
    aka: ['Major', 'Ionian'], char: ['7'], near: 'mixolydian', prior: 0, short: 'Major',
    mood: 'Bright, settled, happy, finished.',
    genres: 'Pop, folk, country, hymns, classical, children\'s songs: most of the music you know.',
    why: 'Its 7th sits a half step under the root and pulls up to it (the leading tone), so melodies feel finished when they land home.' }),
  S('dorian', 'Dorian', 'major', ['1', '2', 'b3', '4', '5', '6', 'b7'], {
    char: ['6'], near: 'aeolian', prior: 0,
    mood: 'Minor but hopeful: cool, soulful, a little sly.',
    genres: 'Funk, soul, modal jazz (Miles Davis\' So What), Santana (Oye Como Va), Celtic and English folk (Scarborough Fair).',
    why: 'A minor scale with a major 6th. That one raised note brightens the minor sound and gives a major IV chord (Am to D), the groove of funk and Santana.' }),
  S('phrygian', 'Phrygian', 'major', ['1', 'b2', 'b3', '4', '5', 'b6', 'b7'], {
    char: ['b2'], near: 'aeolian', prior: 0.7,
    mood: 'Dark, tense, brooding, Spanish-tinged.',
    genres: 'Flamenco, metal (thrash, death, djent), film scores.',
    why: 'Its 2nd is only a half step above the root, so melodies fall heavily onto home. A b2 over a minor chord is the darkest common sound in Western music.' }),
  S('lydian', 'Lydian', 'major', ['1', '2', '3', '#4', '5', '6', '7'], {
    char: ['#4'], near: 'ionian', prior: 0.6,
    mood: 'Bright, dreamy, floating, full of wonder.',
    genres: 'Film and TV scores (flying, magic, wonder), Joe Satriani, Steve Vai, prog rock, jazz over maj7#11 chords.',
    why: 'The raised 4th removes the major scale\'s one clash (the 4th rubbing a half step above the 3rd), so nothing pulls down. It hovers.' }),
  S('mixolydian', 'Mixolydian', 'major', ['1', '2', '3', '4', '5', '6', 'b7'], {
    char: ['b7'], near: 'ionian', prior: 0.3,
    mood: 'Bright but bluesy: laid-back, rocking, earthy.',
    genres: 'Classic rock (Sweet Home Alabama), blues, country, bluegrass, Celtic and bagpipe tunes, funk, jam bands.',
    why: 'Major with a flat 7th. The home chord becomes a dominant 7th, and the bVII chord (G to F in G) gives rock and folk their swagger without the pull of a leading tone.' }),
  S('aeolian', 'Natural minor (Aeolian)', 'major', ['1', '2', 'b3', '4', '5', 'b6', 'b7'], {
    aka: ['Natural minor', 'Aeolian', 'Minor'], char: ['b6'], near: 'dorian', prior: 0.15, short: 'Natural minor',
    mood: 'Sad, serious, reflective.',
    genres: 'Rock, pop ballads, metal, folk: the minor key of most songs.',
    why: 'The b3, b6 and b7 all sit lower than in major, which our ears hear as sad. With no leading tone it settles softly instead of pulling home.' }),
  S('locrian', 'Locrian', 'major', ['1', 'b2', 'b3', '4', 'b5', 'b6', 'b7'], {
    char: ['b5'], near: 'phrygian', prior: 0.4,
    mood: 'Unstable, eerie, unresolved.',
    genres: 'Rare as a song\'s home key. Heard in metal riffs, and in jazz over half-diminished (m7b5) chords.',
    why: 'Its 5th is flat, so its own home chord is diminished. Home itself sounds unsettled, which is why it is mostly used over one chord at a time.' }),

  // minor scales
  S('harmonic_minor', 'Harmonic minor', 'minor', ['1', '2', 'b3', '4', '5', 'b6', '7'], {
    char: ['7'], near: 'aeolian', prior: 0.5,
    mood: 'Dramatic, intense, classical, exotic.',
    genres: 'Classical, neoclassical metal (Yngwie Malmsteen), tango, East European and Middle Eastern flavored music.',
    why: 'Natural minor with its 7th raised, so the V chord turns major and pulls home hard. The gap from b6 up to 7 (a step and a half) gives its exotic edge.' }),
  S('melodic_minor', 'Melodic minor (jazz minor)', 'minor', ['1', '2', 'b3', '4', '5', '6', '7'], {
    aka: ['Jazz minor', 'Ascending melodic minor'], char: ['6', '7'], near: 'dorian', prior: 0.5,
    mood: 'Minor but smooth and sophisticated, bittersweet.',
    genres: 'Jazz (over m(maj7) and m6 chords), classical, film noir.',
    why: 'Major with a minor 3rd: the top half is pure major, so it is minor with a bright, rising pull. Classical players use it going up and natural minor coming down; jazz uses it both ways.' }),
  S('harmonic_major', 'Harmonic major', 'minor', ['1', '2', '3', '4', '5', 'b6', '7'], {
    char: ['b6'], near: 'ionian', prior: 1.2,
    mood: 'Major with a shadow: noble, bittersweet.',
    genres: 'Classical (Rimsky-Korsakov), film scores, jazz.',
    why: 'Major with a b6. The iv chord turns minor (the "sad IV") while the leading tone keeps its pull home.' }),

  // the modes of harmonic minor
  S('locrian_n6', 'Locrian natural 6', 'hminor', ['1', 'b2', 'b3', '4', 'b5', '6', 'b7'], {
    aka: ['Locrian #6'], char: ['6'], near: 'locrian', prior: 0.9,
    mood: 'Dark and tense, with an odd bright glint.',
    genres: 'Jazz over the iiø7 chord of a minor ii, V, i; metal.',
    why: 'Locrian with a major 6th: the same diminished home chord, but the raised 6th (the harmonic minor\'s leading tone) adds a strange light.' }),
  S('ionian_s5', 'Ionian #5 (Ionian augmented)', 'hminor', ['1', '2', '3', '4', '#5', '6', '7'], {
    char: ['#5'], near: 'ionian', prior: 1.0,
    mood: 'Bright and restless, dreamy-strange.',
    genres: 'Jazz over maj7#5 chords, film music.',
    why: 'Major with a raised 5th, so the home chord is augmented and never quite settles.' }),
  S('ukrainian_dorian', 'Ukrainian Dorian (Dorian #4)', 'hminor', ['1', '2', 'b3', '#4', '5', '6', 'b7'], {
    aka: ['Dorian #4', 'Romanian minor', 'Misheberakh (klezmer)', 'Altered Dorian', 'Maqam Nikriz (Arabic and Turkish, 12-tone approximation)'],
    char: ['#4'], near: 'dorian', prior: 1.0,
    mood: 'Plaintive and yearning, with a sob in it.',
    genres: 'Klezmer (the Misheberakh mode), Ukrainian, Romanian and other East European folk, Jewish prayer chant, Greek and Turkish music.',
    why: 'Dorian with a raised 4th. The #4 leans up into the 5th, and the step and a half from b3 up to #4 is the crying "augmented 2nd" of East European melody.' }),
  S('phrygian_dominant', 'Phrygian dominant (Freygish)', 'hminor', ['1', 'b2', '3', '4', '5', 'b6', 'b7'], {
    aka: ['Freygish (klezmer)', 'Ahava Rabbah (Jewish prayer mode)', 'Spanish Phrygian', 'Maqam Hijaz (Arabic, 12-tone approximation)'],
    char: ['b2', '3'], near: 'phrygian', prior: 0.7,
    mood: 'Fiery, exotic, intense.',
    genres: 'Flamenco, klezmer (Freygish), Jewish cantorial music, Middle Eastern and Balkan music, metal.',
    why: 'Phrygian with a major 3rd. The step and a half from b2 up to 3 is the sound people call "exotic". It is the scale of the major V chord in a minor key (E7 in A minor).' }),
  S('lydian_s2', 'Lydian #2', 'hminor', ['1', '#2', '3', '#4', '5', '6', '7'], {
    char: ['#2'], near: 'lydian', prior: 1.4,
    mood: 'Bright, strange, shimmering.',
    genres: 'Jazz, fusion and film music; rare.',
    why: 'Lydian with a raised 2nd: the #2 crowds up against the major 3rd for a bright but uneasy color.' }),
  S('ultralocrian', 'Altered diminished (Ultralocrian)', 'hminor', ['1', 'b2', 'b3', 'b4', 'b5', 'b6', 'bb7'], {
    aka: ['Ultralocrian', 'Super-Locrian bb7'], char: ['bb7'], near: 'altered', prior: 1.2,
    mood: 'Very dark, very tense.',
    genres: 'Jazz over diminished 7th chords; metal.',
    why: 'Its 4th is flat (it sounds like a major 3rd) and its 7th double flat (it sounds like a 6th), so it holds a diminished 7th chord on its root.' }),

  // the modes of melodic minor (the jazz minor)
  S('dorian_b2', 'Dorian b2 (Phrygian natural 6)', 'mminor', ['1', 'b2', 'b3', '4', '5', '6', 'b7'], {
    aka: ['Phrygian #6'], char: ['b2'], near: 'dorian', prior: 0.9,
    mood: 'Dark and mysterious, lighter than Phrygian.',
    genres: 'Jazz over sus(b9) chords, modal jazz, metal.',
    why: 'Dorian with a flat 2nd: the b2 darkens it like Phrygian while the major 6th keeps a little light.' }),
  S('lydian_aug', 'Lydian augmented', 'mminor', ['1', '2', '3', '#4', '#5', '6', '7'], {
    char: ['#5'], near: 'lydian', prior: 0.8,
    mood: 'Brighter than bright, mysterious, futuristic.',
    genres: 'Jazz over maj7#5 chords, film scores.',
    why: 'Lydian with a raised 5th as well: the floating #4 plus an augmented home chord that never settles.' }),
  S('lydian_dominant', 'Lydian dominant', 'mminor', ['1', '2', '3', '#4', '5', '6', 'b7'], {
    aka: ['Overtone scale', 'Acoustic scale', 'Lydian b7', 'Mixolydian #4'], char: ['#4', 'b7'], near: 'mixolydian', prior: 0.7,
    mood: 'Bright, bluesy, playful, a little whimsical.',
    genres: 'Jazz over 7#11 chords, fusion, Brazilian music, Bartok, cartoon and film themes.',
    why: 'It is close to the overtones a single note naturally rings with, so it sounds "right" over a dominant chord: Mixolydian with its clashing 4th raised out of the way.' }),
  S('mixolydian_b6', 'Mixolydian b6', 'mminor', ['1', '2', '3', '4', '5', 'b6', 'b7'], {
    aka: ['Aeolian dominant', 'Melodic major'], char: ['b6'], near: 'mixolydian', prior: 0.8,
    mood: 'Major but melancholy, wistful.',
    genres: 'Film music, rock and pop ballads, jazz over 7b13 chords.',
    why: 'Its lower half is major and its upper half minor: it starts bright and turns sad.' }),
  S('locrian_s2', 'Locrian #2 (half-diminished)', 'mminor', ['1', '2', 'b3', '4', 'b5', 'b6', 'b7'], {
    aka: ['Locrian natural 2', 'Aeolian b5', 'Half-diminished scale'], char: ['2'], near: 'locrian', prior: 0.3,
    mood: 'Dark and unstable, but smoother than Locrian.',
    genres: 'Jazz over m7b5 (half-diminished) chords.',
    why: 'Locrian with a natural 2nd: the same half-diminished home chord without the b2 grinding against the root.' }),
  S('altered', 'Altered (super-Locrian)', 'mminor', ['1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7'], {
    aka: ['Super-Locrian', 'Diminished whole tone'], char: ['b2', 'b3', 'b5', 'b6'], near: 'locrian', prior: 0.6,
    jazz: ['1', 'b9', '#9', '3', '#11', 'b13', 'b7'],
    mood: 'Maximum tension that melts into the next chord.',
    genres: 'Jazz and fusion over altered dominant (7alt) chords just before they resolve.',
    why: 'Over a dominant 7th it keeps the root, 3rd (spelled b4) and 7th, and every other note is an altered tension (b9, #9, #11, b13). Pure tension, so it resolves beautifully.' }),

  // pentatonic and blues
  S('major_pent', 'Major pentatonic', 'penta', ['1', '2', '3', '5', '6'], {
    near: 'ionian', prior: 0.6,
    mood: 'Open, sunny, simple, can\'t-go-wrong.',
    genres: 'Country, folk, rock, gospel, children\'s songs, and music all over the world (Scotland, China, West Africa).',
    why: 'It leaves out the major scale\'s two half steps (the 4th and 7th), so no note clashes with any other. Every note sounds good over the home chord.' }),
  S('minor_pent', 'Minor pentatonic', 'penta', ['1', 'b3', '4', '5', 'b7'], {
    near: 'aeolian', prior: 0.5,
    mood: 'Bluesy, tough, soulful.',
    genres: 'Blues, rock and metal solos, R&B, funk, hip hop.',
    why: 'Natural minor without its 2nd and b6, so it has no half steps at all. Easy to bend and wail on: the first scale most guitarists learn.' }),
  S('blues', 'Blues scale (minor blues)', 'penta', ['1', 'b3', '4', 'b5', '5', 'b7'], {
    aka: ['Minor blues', 'Blues'], char: ['b5'], near: 'minor_pent', prior: 0.8,
    mood: 'Gritty, bluesy, a little sly.',
    genres: 'Blues, rock, jazz, funk, soul.',
    why: 'Minor pentatonic plus the b5, the "blue note". It is a passing note: it rubs for a moment, then slides to the 4th or the 5th.' }),
  S('major_blues', 'Major blues', 'penta', ['1', '2', 'b3', '3', '5', '6'], {
    char: ['b3'], near: 'major_pent', prior: 1.0,
    mood: 'Sweet, sunny and bluesy.',
    genres: 'Country, Western swing, bluegrass, blues, Southern rock.',
    why: 'Major pentatonic plus the b3, which you slide or hammer up to the major 3rd: the country and blues "grace note" sound.' }),

  // bebop: an 8th note added so a run in 8th notes keeps chord tones on the beat
  S('bebop_dominant', 'Bebop dominant', 'bebop', ['1', '2', '3', '4', '5', '6', 'b7', '7'], {
    char: ['7'], near: 'mixolydian', prior: 1.1,
    mood: 'Swinging, flowing, jazzy.',
    genres: 'Bebop and swing (Charlie Parker), jazz lines over dominant 7th chords.',
    why: 'Mixolydian plus a passing major 7th. With eight notes, a run in 8th notes that starts on a chord tone on the beat keeps landing chord tones on the beat.' }),
  S('bebop_major', 'Bebop major', 'bebop', ['1', '2', '3', '4', '5', '#5', '6', '7'], {
    char: ['#5'], near: 'ionian', prior: 1.2,
    mood: 'Smooth, swinging, sophisticated.',
    genres: 'Jazz lines over major and 6th chords (Barry Harris writes the added note as a b6).',
    why: 'Major plus a passing #5. Running it in 8th notes from a chord tone puts the 6th chord\'s notes (1, 3, 5, 6) on every beat.' }),
  S('bebop_dorian', 'Bebop minor (Dorian bebop)', 'bebop', ['1', '2', 'b3', '3', '4', '5', '6', 'b7'], {
    aka: ['Dorian bebop'], char: ['3'], near: 'dorian', prior: 1.2,
    mood: 'Cool, swinging, bluesy minor.',
    genres: 'Jazz lines over minor 7th chords (and the ii of a ii, V, I).',
    why: 'Dorian plus a passing major 3rd between the b3 and the 4th, so 8th-note runs keep the chord tones on the beat.' }),

  // symmetric scales: the same pattern of steps repeats inside the octave
  S('whole_tone', 'Whole tone', 'sym', ['1', '2', '3', '#4', '#5', 'b7'], {
    near: 'lydian_dominant', prior: 0.5, sym: true,
    mood: 'Dreamy, floating, hazy, unresolved.',
    genres: 'Debussy, TV dream sequences, Thelonious Monk, jazz over 7#5 chords.',
    why: 'Every step is a whole step, so no note is more "home" than another and nothing pulls anywhere. There are only two different whole-tone scales.' }),
  S('dim_hw', 'Diminished (half-whole)', 'sym', ['1', 'b2', 'b3', '3', '#4', '5', '6', 'b7'], {
    aka: ['Dominant diminished', 'Octatonic (half-whole)'], char: ['b2', 'b3', '#4'], near: 'mixolydian', prior: 0.6, sym: true,
    differs: 'Compared with Mixolydian: it keeps 1, 3, 5, 6 and b7 (a dominant 13th chord), but trades the 2nd for both a b2 and a #2 (b9 and #9) and raises the 4th to #4.',
    jazz: ['1', 'b9', '#9', '3', '#11', '5', '13', 'b7'],
    mood: 'Tense, angular, jazzy.',
    genres: 'Jazz over 7b9 chords, film tension, metal, Stravinsky and Bartok.',
    why: 'Half step, whole step, over and over: it repeats every 3 frets. Over a dominant 7th it gives b9, #9 and #11 while keeping the natural 5th and 13th.' }),
  S('dim_wh', 'Diminished (whole-half)', 'sym', ['1', '2', 'b3', '4', 'b5', 'b6', '6', '7'], {
    aka: ['Octatonic (whole-half)'], char: ['2', '4', 'b6', '7'], near: 'dim_hw', prior: 0.4, sym: true,
    differs: 'Compared with half-whole diminished: the same alternating pattern, but starting with a whole step. That puts a diminished 7th chord (1 b3 b5 6) on its root instead of a dominant 7th.',
    mood: 'Mysterious, tense, symmetrical.',
    genres: 'Jazz over diminished 7th chords, film tension, metal.',
    why: 'Whole step, half step, over and over. It holds a diminished 7th chord on its root, with a note a whole step above each chord tone.' }),
  S('chromatic', 'Chromatic', 'sym', ['1', 'b2', '2', 'b3', '3', '4', '#4', '5', 'b6', '6', 'b7', '7'], {
    near: null, prior: 99, sym: true,
    mood: 'No flavor of its own: all twelve notes.',
    genres: 'Every style uses chromatic passing notes; whole melodies built on it are modern classical and film.',
    why: 'Every half step. It is the set every other scale is chosen from, so it has no home of its own.' }),

  // world and folk scales (12-tone versions; some are approximations of scales tuned between our notes)
  S('hungarian_minor', 'Hungarian minor', 'world', ['1', '2', 'b3', '#4', '5', 'b6', '7'], {
    aka: ['Double harmonic minor'], char: ['#4'], near: 'harmonic_minor', prior: 1.2,
    note: 'Some older books call it the "Gypsy minor". Hungarian minor is the standard, respectful name.',
    mood: 'Dramatic, dark, passionate.',
    genres: 'Hungarian and Romani music, Liszt, flamenco-tinged and neoclassical metal.',
    why: 'Harmonic minor with a raised 4th: two step-and-a-half gaps (b3 to #4, b6 to 7), each landing a half step under a strong note.' }),
  S('hungarian_major', 'Hungarian major', 'world', ['1', '#2', '3', '#4', '5', '6', 'b7'], {
    char: ['#2', '#4'], near: 'lydian_dominant', prior: 1.5,
    mood: 'Bright, strange, festive.',
    genres: 'Liszt and Hungarian-inspired classical music; jazz over 7#9#11 chords.',
    why: 'A dominant 7th home chord with a #2 and a #4 around it: bright, but tilted.' }),
  S('double_harmonic', 'Double harmonic major (Byzantine)', 'world', ['1', 'b2', '3', '4', '5', 'b6', '7'], {
    aka: ['Byzantine', 'Arabic', 'Maqam Hijaz Kar (Arabic, 12-tone approximation)', 'Raga Bhairav (North Indian, 12-tone approximation)'],
    char: ['b2', 'b6'], near: 'phrygian_dominant', prior: 1.3,
    mood: 'Exotic, ornate, intense.',
    genres: 'Byzantine chant, Arabic, Turkish and Greek music, North Indian classical (Raga Bhairav), surf rock (Misirlou), desert scenes in film.',
    why: 'Two step-and-a-half gaps, each wrapped in half steps (b2 to 3, b6 to 7), so every strong note has a neighbor a half step away.' }),
  S('neapolitan_minor', 'Neapolitan minor', 'world', ['1', 'b2', 'b3', '4', '5', 'b6', '7'], {
    char: ['b2'], near: 'harmonic_minor', prior: 1.3,
    mood: 'Dark, operatic, dramatic.',
    genres: 'Classical and opera, metal.',
    why: 'Harmonic minor with a b2, so the dark Neapolitan chord (bII) lives right in the scale.' }),
  S('neapolitan_major', 'Neapolitan major', 'world', ['1', 'b2', 'b3', '4', '5', '6', '7'], {
    char: ['b2'], near: 'melodic_minor', prior: 1.4,
    mood: 'Dark at the bottom, bright at the top.',
    genres: 'Classical and opera; jazz.',
    why: 'Melodic minor with a b2: a heavy start (1, b2, b3) that climbs into a bright major top half.' }),
  S('persian', 'Persian', 'world', ['1', 'b2', '3', '4', 'b5', 'b6', '7'], {
    char: ['b5'], near: 'double_harmonic', prior: 1.6, approx: 'A Western name. Persian classical music (the dastgah system) uses intervals that fall between our 12 notes, so this is a 12-tone flavor, not a real dastgah.',
    mood: 'Mysterious, tense, exotic.',
    genres: 'Western film and metal music reaching for a Persian color.',
    why: 'Double harmonic with a flat 5th: half steps everywhere, and a home chord that is neither major nor minor but tense.' }),
  S('hirajoshi', 'Hirajoshi', 'world', ['1', '2', 'b3', '5', 'b6'], {
    near: 'aeolian', prior: 1.4, note: 'Sources disagree on this name. This is the version most guitar books use.',
    mood: 'Haunting, spare, still.',
    genres: 'Japanese koto music as taught in the West, metal, film and game music.',
    why: 'Five notes with two half steps (2 to b3, 5 to b6) and two wide leaps: a sparse, bell-like sound.' }),
  S('in', 'In (Miyako-bushi)', 'world', ['1', 'b2', '4', '5', 'b6'], {
    aka: ['Miyako-bushi', 'Sakura scale'], char: ['b2'], near: 'phrygian', prior: 1.4,
    mood: 'Melancholy and still.',
    genres: 'Japanese music for koto and shamisen (the folk song Sakura).',
    why: 'Two half steps (1 to b2, 5 to b6) and two big leaps: tender and sad.' }),
  S('insen', 'Insen', 'world', ['1', 'b2', '4', '5', 'b7'], {
    char: ['b2'], near: 'in', prior: 1.5,
    mood: 'Dark, open, meditative.',
    genres: 'Japanese music, and Western film and game music wanting a Japanese color.',
    why: 'Like In, but with a b7 instead of a b6: one half step fewer, so it sounds more open.' }),
  S('iwato', 'Iwato', 'world', ['1', 'b2', '4', 'b5', 'b7'], {
    char: ['b5'], near: 'locrian', prior: 1.6,
    mood: 'Dark, eerie, unresolved.',
    genres: 'Japanese music; metal and film music.',
    why: 'Five notes from Locrian: the b2 and b5 make it one of the darkest pentatonic scales.' }),
  S('yo', 'Yo', 'world', ['1', '2', '4', '5', '6'], {
    near: 'major_pent', prior: 1.4,
    mood: 'Open, bright, folk-like.',
    genres: 'Japanese folk songs (min\'yo) and court music.',
    why: 'No half steps, like major pentatonic, but with a 4th in place of the 3rd: open, neither major nor minor.' }),
  S('kumoi', 'Kumoi', 'world', ['1', '2', 'b3', '5', '6'], {
    near: 'dorian', prior: 1.5, note: 'Names for Japanese scales vary between sources. This is the version most Western references use.',
    mood: 'Gentle, wistful.',
    genres: 'Japanese-flavored music; also used in jazz.',
    why: 'A minor 3rd and a major 6th with only one half step (2 to b3): soft minor color.' }),
  S('pelog', 'Pelog (12-tone approximation)', 'world', ['1', 'b2', 'b3', '5', 'b6'], {
    near: 'phrygian', prior: 1.6,
    approx: 'Real pelog, from Javanese and Balinese gamelan, has seven uneven steps that differ from one gamelan to the next. This five-note set (close to pelog selisir) is the usual approximation on Western instruments.',
    mood: 'Shimmering, ancient, solemn.',
    genres: 'Javanese and Balinese gamelan (in its real tuning).',
    why: 'Small and large steps side by side (1, b2, b3, then a leap to 5), like the uneven steps of real pelog.' }),
  S('slendro', 'Slendro (12-tone approximation)', 'world', ['1', '2', '4', '5', 'b7'], {
    near: 'minor_pent', prior: 1.6,
    approx: 'Real slendro, from gamelan, divides the octave into five nearly equal steps (about 240 cents each). No set of piano keys can do that, so any 12-tone version is a rough fit; this is a common one.',
    mood: 'Floating, calm, gong-like.',
    genres: 'Javanese and Balinese gamelan (in its real tuning).',
    why: 'Five notes with no half steps, as close as 12 notes get to five equal steps.' }),
];
for (const s of SCALES) {
  s.tones = s.f.map(degree);
  s.semis = s.tones.map(g => mod12(g.semis));
  s.size = s.f.length;
  s.hepta = s.size === 7 && new Set(s.tones.map(g => g.step)).size === 7;
}
export const SCALE = Object.fromEntries(SCALES.map(s => [s.id, s]));

/** The major modes in order of brightness, brightest first (each one darker by a single lowered note) */
export const BRIGHTNESS = ['lydian', 'ionian', 'mixolydian', 'dorian', 'aeolian', 'phrygian', 'locrian'];
/** Families of modes: mode 1, 2, ... built on each degree of the first */
export const FAMILIES = {
  major: ['ionian', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'aeolian', 'locrian'],
  harmonic_minor: ['harmonic_minor', 'locrian_n6', 'ionian_s5', 'ukrainian_dorian', 'phrygian_dominant', 'lydian_s2', 'ultralocrian'],
  melodic_minor: ['melodic_minor', 'dorian_b2', 'lydian_aug', 'lydian_dominant', 'mixolydian_b6', 'locrian_s2', 'altered'],
};
export const FAMILY_NAME = { major: 'major', harmonic_minor: 'harmonic minor', melodic_minor: 'melodic minor' };

// ---- spelling

const accCost = n => Math.abs(n.a) + (Math.abs(n.a) > 1 ? 4 : 0);
const odd = n => Math.abs(n.a) > 1 || (n.a === 1 && (n.L === 2 || n.L === 6)) || (n.a === -1 && (n.L === 0 || n.L === 3));

/**
 * A scale's notes on a spelled root. A 7-note scale gets one letter per degree (so G# harmonic minor
 * has an F##, the way theory books write it). Other scales keep their degree spelling, except that
 * a double sharp or flat is written the plain way (Eb blues: A, not Bbb); a symmetric scale is
 * spelled the plainest way throughout (Db whole tone ends on B, not Cb).
 * Each: { d (degree), note (spelled), pc, semis }.
 */
export function spellScale(scale, root) {
  return scale.tones.map(g => {
    let n = above(root, g);
    if (!scale.hepta && (Math.abs(n.a) > 1 || (scale.sym && odd(n)))) n = plainNote(pcOf(n));
    return { d: g.d, note: n, pc: pcOf(n), semis: mod12(g.semis) };
  });
}
/** How hard a scale is to read on this root: accidentals, with a big cost for double sharps and flats */
export const readCost = (scale, root) => spellScale(scale, root).reduce((s, x) => s + accCost(x.note), 0);
/** The easiest spelled root for a scale on a pitch class (no double accidentals if possible) */
export function easyRoot(pc, scale) {
  let best = null, bestCost = 1e9;
  for (const r of spellings(pc)) {
    const c = readCost(scale, r) + (odd(r) ? 3 : 0) + (r.a !== plainNote(pc).a ? 0.1 : 0);
    if (c < bestCost) { best = r; bestCost = c; }
  }
  return best;
}
/** If the same scale reads much more easily from the other name of its root, that root (else null) */
export function simplerRoot(scale, root) {
  const pc = pcOf(root), alt = easyRoot(pc, scale);
  if (alt.L === root.L && alt.a === root.a) return null;
  return readCost(scale, alt) + 2 <= readCost(scale, root) ? alt : null;
}
/** The roots a player picks from: every note with at most one sharp or flat that is commonly used */
export const ROOTS = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B'];

// ---- steps

/** The steps between neighbouring notes (and back up to the octave), in half steps */
export function stepSizes(scale) {
  const s = scale.semis;
  return s.map((x, i) => i + 1 < s.length ? s[i + 1] - x : 12 - x);
}
const STEP_TEXT = { 1: 'H', 2: 'W', 3: 'W+H', 4: '2W', 5: '2W+H' };
/** Steps as a player says them: H (half step), W (whole step), W+H (a step and a half), 2W ... */
export const stepText = scale => stepSizes(scale).map(n => STEP_TEXT[n] || n + 'H');

// ---- comparing two scales: "Dorian is natural minor with a 6 instead of a b6"

const plainDeg = d => d.replace(/^(bb|b|#)/, '');
const degWord = d => /^(bb|b|#)/.test(d) ? d : 'natural ' + d;
/** What changes from scale b to scale a (both on the same root): { swaps: [[a deg, b deg]], added, removed } */
export function compareScales(a, b) {
  const swaps = [], added = [], removed = [];
  if (a.hepta && b.hepta) {
    for (let step = 0; step < 7; step++) {
      const x = a.tones.find(g => g.step === step), y = b.tones.find(g => g.step === step);
      if (mod12(x.semis) !== mod12(y.semis)) swaps.push([x.d, y.d]);
    }
  } else {
    for (const g of a.tones) if (!b.semis.includes(mod12(g.semis))) added.push(g.d);
    for (const g of b.tones) if (!a.semis.includes(mod12(g.semis))) removed.push(g.d);
    // a note that only moved (b6 to 6), or one note traded for another, reads better as a swap
    for (let i = added.length - 1; i >= 0; i--) {
      const j = removed.findIndex(r => plainDeg(r) === plainDeg(added[i]));
      if (j >= 0) { swaps.push([added[i], removed[j]]); added.splice(i, 1); removed.splice(j, 1); }
    }
    if (added.length === 1 && removed.length === 1) swaps.push([added.pop(), removed.pop()]);
  }
  return { swaps, added, removed };
}
const list = xs => xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1];
/** The comparison in words, e.g. "Dorian is Natural minor (Aeolian) with a natural 6 instead of a b6." */
export function differsText(a, b) {
  if (a.differs) return a.differs;
  if (!b) return '';
  const { swaps, added, removed } = compareScales(a, b);
  let text = '';
  if (swaps.length) text += ' with ' + list(swaps.map(([x, y]) => 'a ' + degWord(x) + ' instead of a ' + degWord(y)));
  if (added.length) text += (text ? ', plus ' : ' plus ') + list(added.map(d => 'a ' + d));
  if (removed.length) text += (text ? ', and without its ' : ' without its ') + list(removed);
  if (!text) return a.name + ' has the same notes as ' + b.name + '.';
  return a.name + ' is ' + b.name + text + '.';
}

// ---- modes: same notes, different home (parent), and same home, different notes (parallel)

/** The scales in the library with exactly these intervals from the root */
export function scalesWithSemis(semis) {
  const key = [...semis].sort((x, y) => x - y).join(',');
  return SCALES.filter(s => [...s.semis].sort((x, y) => x - y).join(',') === key);
}
/** The family a scale is a mode of: { family, mode (1-based), parentId } or null */
export function familyOf(scale) {
  for (const [family, ids] of Object.entries(FAMILIES)) {
    const k = ids.indexOf(scale.id);
    if (k >= 0) return { family, mode: k + 1, parentId: ids[0] };
  }
  return null;
}
/**
 * The scale started from each of its notes: same notes, a different home each time. Each:
 * { root (spelled), deg (which degree of this scale it starts on), scales (library scales it matches) }.
 */
export function rotations(scale, root) {
  const notes = spellScale(scale, root);
  return notes.map((x, k) => {
    const semis = scale.semis.map(s => mod12(s - scale.semis[k]));
    return { root: x.note, deg: x.d, k, scales: scalesWithSemis(semis) };
  });
}
/** The parent scale: for a mode of major, harmonic or melodic minor, its mode-1 scale and root (C major for D Dorian) */
export function parentOf(scale, root) {
  const fam = familyOf(scale);
  if (!fam) return null;
  const k = fam.mode - 1, parent = SCALE[fam.parentId];
  // the parent's root is the note k degrees below: one letter per degree, so D# Dorian's parent is C# major
  const g = parent.tones[k];
  const proot = onLetter(root.L - g.step, pcOf(root) - g.semis);
  return { scale: parent, root: proot, mode: fam.mode, family: fam.family };
}
/** Every mode of the scale's family on its parent root (the "same notes" view), in mode order */
export function familyModes(scale, root) {
  const p = parentOf(scale, root);
  if (!p) return null;
  const pn = spellScale(p.scale, p.root);
  return FAMILIES[p.family].map((id, k) => ({ scale: SCALE[id], root: pn[k].note, mode: k + 1, current: id === scale.id }));
}

// ---- chords from a scale

/** The chord type whose notes are exactly these intervals from the root (null when it has no common name) */
export function typeForSemis(semis) {
  const key = [...new Set(semis.map(mod12))].sort((a, b) => a - b).join(',');
  let best = null;
  for (const t of TYPES) {
    if (t.f.length !== semis.length) continue;
    if ([...new Set(t.tones.map(g => mod12(g.semis)))].sort((a, b) => a - b).join(',') !== key) continue;
    // a stack of 3rds is the normal chord, not an added-tone one (1 b3 5 bb7 is dim7, not something with a 6)
    if (!best || t.cost < best.cost) best = t;
  }
  return best;
}
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
/**
 * The chords a 7-note scale builds on each degree by stacking every other note (3rds). Each:
 * { deg, root (spelled), triad, seventh: { notes, type (or null), symbol, numeral } }.
 * Numerals count against the major scale of the scale's root (bIII, #iv°), like Encore Chords.
 */
export function scaleChords(scale, root) {
  if (!scale.hepta) return [];
  const notes = spellScale(scale, root), key = makeKey(root, 'major');
  return notes.map((x, i) => {
    const pick = n => [0, 2, 4, 6].slice(0, n).map(k => notes[(i + k) % 7].note);
    const build = n => {
      const ns = pick(n), semis = ns.map(m => mod12(pcOf(m) - pcOf(x.note)));
      const t = typeForSemis(semis);
      if (!t) {
        // an odd stack: say what it is, with a plain numeral for its degree
        const step = x.note.L - root.L, alt = mod12(pcOf(x.note) - pcOf(above(root, String(((step % 7) + 7) % 7 + 1))));
        const acc = alt === 0 ? '' : alt <= 6 ? '#'.repeat(alt) : 'b'.repeat(12 - alt);
        return { notes: ns, type: null, symbol: noteText(x.note) + '(' + ns.slice(1).map(m => intervalDeg(x.note, m)).join(' ') + ')',
                 numeral: acc + ROMAN[((step % 7) + 7) % 7] + '?' };
      }
      const c = chord(x.note, t.id);
      return { notes: ns, type: t, chord: c, symbol: noteText(x.note) + t.sym, numeral: plainNumeral(key, c) };
    };
    return { deg: x.d, root: x.note, triad: build(3), seventh: build(4) };
  });
}
/** The degree of note b above note a, as a chord formula writes it (b3, #5, bb7) */
export function intervalDeg(a, b) {
  const step = ((b.L - a.L) % 7 + 7) % 7, want = [0, 2, 4, 5, 7, 9, 11][step];
  let alt = mod12(pcOf(b) - pcOf(a)) - want;
  if (alt > 6) alt -= 12;
  if (alt < -6) alt += 12;
  return (alt > 0 ? '#'.repeat(alt) : 'b'.repeat(-alt)) + (step + 1);
}
// the chord types worth listing as "chords that sit inside" a scale that isn't a stack of 3rds
const INSIDE = ['maj', 'min', 'dim', 'aug', 'sus2', 'sus4', '5', '6', 'm6', 'maj7', '7', 'm7', 'm7b5', 'dim7', 'mMaj7', '7sus4', 'add9', 'madd9', '7#5'];
/** For any scale: the common chords whose every note is in it, rooted on its notes */
export function chordsInside(scale, root) {
  const notes = spellScale(scale, root), pcs = new Set(notes.map(n => n.pc)), key = makeKey(root, 'major');
  const out = [];
  for (const x of notes) for (const id of INSIDE) {
    const c = chord(x.note, id), tones = chordTones(c);
    if (!tones.every(t => pcs.has(t.pc))) continue;
    // spell the chord's notes the way the scale spells them
    const ns = tones.map(t => notes.find(n => n.pc === t.pc).note);
    out.push({ deg: x.d, root: x.note, type: TYPE[id], chord: c, notes: ns, symbol: noteText(x.note) + TYPE[id].sym, numeral: plainNumeral(key, c) });
  }
  return out;
}

// ---- which scale fits a chord or a progression

/** Reads a chord for the fit finder: anything Encore Chords reads, plus 7alt (an altered dominant) */
export function readChord(s) {
  const t = (s || '').trim();
  const alt = /^([A-G](?:##|bb|#|b)?)7?alt$/.exec(t);
  if (alt) {
    const root = parseNote(alt[1]);
    return { text: t, root, alt: true, fam: 'dom', need: ['1', '3', 'b7', 'b9', '#9', 'b13'].map(degree), may: [degree('#11')], symbol: noteText(root) + '7alt' };
  }
  const c = parseChord(t);
  if (!c) return null;
  const type = TYPE[c.type];
  return { text: t, root: c.root, chord: c, fam: type.fam, need: type.tones.filter(g => !type.opt.includes(g.d)), may: type.tones.filter(g => type.opt.includes(g.d)),
           bass: c.bass, symbol: t };
}
/** Splits "Am7 D7 | G" or "Am7, D7, G" into chords; unreadable bits come back in bad */
export function readProgression(text) {
  const parts = (text || '').split(/[\s,|]+/).filter(Boolean);
  const chords = [], bad = [];
  for (const p of parts) { const c = readChord(p); if (c) chords.push(c); else bad.push(p); }
  return { chords, bad };
}
const relPcs = (c, list) => list.map(g => mod12(pcOf(c.root) + g.semis));

/**
 * How a scale on a root sits over one chord: the chord tones it misses, its avoid notes (a scale note a
 * half step above a chord tone, which clashes if you lean on it; over a dominant chord the b9 and b13
 * are wanted tensions, not avoid notes), and its colour notes (tensions that aren't chord tones).
 */
export function fitOver(scale, root, c) {
  const notes = spellScale(scale, root), pcs = new Set(notes.map(n => n.pc));
  const chordPcs = new Set([...relPcs(c, c.need), ...relPcs(c, c.may)]);
  if (c.bass) chordPcs.add(pcOf(c.bass));
  const missNeed = c.need.filter(g => !pcs.has(mod12(pcOf(c.root) + g.semis)));
  const missMay = c.may.filter(g => !pcs.has(mod12(pcOf(c.root) + g.semis)));
  const avoid = [], colour = [];
  for (const n of notes) {
    if (chordPcs.has(n.pc)) continue;
    const below = mod12(n.pc - 1);
    const rel = mod12(n.pc - pcOf(c.root));
    const dominantTension = c.fam === 'dom' && (rel === 1 || rel === 8);
    if (chordPcs.has(below) && !dominantTension) avoid.push(n); else colour.push(n);
  }
  return { missNeed, missMay, avoid, colour, notes };
}
const labelOver = (c, n) => intervalDeg(c.root, n);

// the everyday first choice for each kind of chord, when nothing around it says otherwise
const DEFAULT_FOR = { maj: 'ionian', dom: 'mixolydian', min: 'dorian', hdim: 'locrian', dim: 'dim_wh', aug: 'whole_tone', sus: 'mixolydian', power: 'minor_pent' };
// chords whose extra note already names the scale (a 7#11 is the Lydian dominant chord)
const DEFAULT_TYPE = { m6: 'melodic_minor', m69: 'melodic_minor', mMaj7: 'melodic_minor', mMaj9: 'melodic_minor', '7#11': 'lydian_dominant',
  '9#11': 'lydian_dominant', '13#11': 'lydian_dominant', 'maj7#11': 'lydian', 'maj9#11': 'lydian', addS11: 'lydian', '7#5': 'whole_tone', '7b9': 'dim_hw', '13b9': 'dim_hw' };
const ALTERED = [1, 3, 6, 8];   // b9, #9, #11, b13 above a dominant chord's root

/** Ranked scales for one chord (built on the chord's root, the way chord-scale theory works). Best first. */
export function scalesForChord(c, { limit = 8, context = null } = {}) {
  const out = [];
  // a plain dominant 7th doesn't ask for altered notes; once one is in the chord, the others are welcome
  const asksAltered = c.fam === 'dom' && [...c.need, ...c.may].some(g => ALTERED.includes(mod12(g.semis)));
  for (const s of SCALES) {
    if (s.id === 'chromatic') continue;
    const f = fitOver(s, c.root, c);
    if (f.missNeed.length) continue;
    let score = s.prior + 0.3 * f.avoid.length + 1.0 * f.missMay.length;
    if ((c.chord && DEFAULT_TYPE[c.chord.type] || DEFAULT_FOR[c.fam]) === s.id) score -= 0.5;
    // altered notes the chord didn't ask for: a plain dominant 7th wants none, an altered one tolerates a few
    if (c.fam === 'dom') score += (asksAltered ? 0.25 : 0.4) * f.colour.filter(n => ALTERED.includes(mod12(n.pc - pcOf(c.root)))).length;
    const same = context && sameSet(f.notes.map(n => n.pc), context.pcs);
    if (same) score -= 1.6;
    else if (context) score += 0.3 * f.notes.filter(n => !context.pcs.includes(n.pc)).length;
    out.push({ scale: s, root: c.root, score, fit: f, inKey: !!same, reasons: reasonsFor(s, c, f, same, context) });
  }
  out.sort((a, b) => a.score - b.score);
  return out.slice(0, limit);
}
const sameSet = (a, b) => a.length === new Set(b).size && a.every(p => b.includes(p));

function reasonsFor(s, c, f, same, context) {
  const r = [];
  const sym = c.symbol;
  r.push(f.missMay.length ? 'Has every note of ' + sym + ' you need (it leaves out the optional ' + list(f.missMay.map(g => g.d)) + ').'
                          : 'Has every note of ' + sym + '.');
  if (same && context) r.push('Uses the same notes as the rest of the progression (' + context.name + ').');
  const chr = s.char.map(d => f.notes.find(n => n.d === d)).filter(Boolean);
  if (chr.length) r.push('Its color note' + (chr.length > 1 ? 's' : '') + ': ' + list(chr.map(n => noteText(n.note) + ' (' + labelOver(c, n.note) + ' over the chord)')) + '.');
  if (f.avoid.length) r.push('Careful with ' + list(f.avoid.map(n => noteText(n.note))) + ': a half step above a chord tone, so pass through ' + (f.avoid.length > 1 ? 'them' : 'it') + ' rather than landing there.');
  else r.push('No clashing notes: you can hold any note over this chord.');
  return r;
}

/**
 * Scales for a whole progression: one scale that covers it (ranked, its home guessed from the chords),
 * plus the best scale for each chord heard in that light. Returns
 * { overall: [{ scale, root, score, missing, reasons }], tonic (pc), perChord: [[...ranked]], blues (bool) }.
 */
export function scalesForProgression(chords, { limit = 6 } = {}) {
  if (!chords.length) return { overall: [], perChord: [], tonic: null, blues: false };
  // where home probably is: the last chord, the first, and above all a chord a dominant 7th resolves to
  const weight = new Map();
  const add = (pc, w) => weight.set(pc, (weight.get(pc) || 0) + w);
  chords.forEach(c => add(pcOf(c.root), 0.3));
  // (songs loop, so the last chord is a weaker clue than the first)
  add(pcOf(chords[chords.length - 1].root), 1);
  add(pcOf(chords[0].root), 1.5);
  for (let i = 0; i + 1 < chords.length; i++) {
    const a = chords[i], b = chords[i + 1];
    if (a.fam === 'dom' && mod12(pcOf(a.root) - pcOf(b.root)) === 7 && b.fam !== 'dom') add(pcOf(b.root), 3);
  }
  const needAll = new Set();
  for (const c of chords) relPcs(c, c.need).forEach(p => needAll.add(p));
  // a key whose own notes hold every chord: its major tonic, and more weakly its minor one
  for (let pc = 0; pc < 12; pc++) {
    if (covers(SCALE.ionian, pc, needAll)) add(pc, 1);
    if (covers(SCALE.aeolian, pc, needAll) || covers(SCALE.harmonic_minor, pc, needAll)) add(pc, 0.5);
  }
  const maxW = Math.max(...weight.values());
  const tonic = [...weight.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const needPcs = new Set(), mayPcs = new Set();
  for (const c of chords) { relPcs(c, c.need).forEach(p => needPcs.add(p)); relPcs(c, c.may).forEach(p => mayPcs.add(p)); if (c.bass) needPcs.add(pcOf(c.bass)); }
  const spelled = new Map(chords.map(c => [pcOf(c.root), c.root]));
  // each chord tone as the chords spell it (so a missing note reads G#, not Ab, under an E7)
  const toneName = new Map();
  for (const c of chords) for (const g of [...c.need, ...c.may]) { const n = above(c.root, g); if (!toneName.has(pcOf(n))) toneName.set(pcOf(n), n); }
  const cands = [];
  for (const s of SCALES) {
    // bebop scales are for lines over one chord at a time, so they aren't offered for a whole progression
    if (s.id === 'chromatic' || s.group === 'bebop') continue;
    for (let pc = 0; pc < 12; pc++) {
      const root = spelled.get(pc) || easyRoot(pc, s);
      const notes = spellScale(s, root), pcs = new Set(notes.map(n => n.pc));
      const missNeed = [...needPcs].filter(p => !pcs.has(p)), missMay = [...mayPcs].filter(p => !pcs.has(p) && !needPcs.has(p));
      if (missNeed.length > 2) continue;
      // the scale's own home chord should be the progression's chord on that root, if there is one
      const homeChord = chords.find(c => pcOf(c.root) === pc);
      // notes the chords never use make it less of an answer (G bebop holds Am7 D7 G too, with a spare F)
      const extra = notes.filter(n => !needPcs.has(n.pc) && !mayPcs.has(n.pc)).length;
      let score = s.prior * 0.6 + 2.5 * missNeed.length + 1.2 * missMay.length + 0.35 * extra + 0.6 * (maxW - (weight.get(pc) || 0));
      if (!homeChord) score += 0.8;
      else if (fitOver(s, root, homeChord).missNeed.length) score += 1.5;
      cands.push({ scale: s, root, score, missing: [...missNeed, ...missMay].map(p => toneName.get(p) || plainNote(p)), pcs: notes.map(n => n.pc), notes });
    }
  }
  cands.sort((a, b) => a.score - b.score);
  // one entry per set of notes: A Dorian and G major are the same notes, and the home decides which name fits
  const overall = [], sets = new Set();
  for (const c of cands) {
    const set = [...new Set(c.pcs)].sort((a, b) => a - b).join(',');
    if (sets.has(set)) continue;
    if (overall.length && c.score > overall[0].score + 3.5) break;
    sets.add(set);
    c.reasons = progressionReasons(c, chords, tonic);
    overall.push(c);
    if (overall.length >= limit) break;
  }
  // a blues: dominant 7ths on I and IV (and V). No one 7-note scale holds them; the blues way is the minor
  // pentatonic or blues scale over everything (its b3 rubbing on the chords' major 3rds is the sound),
  // or the major pentatonic for a sweeter, country sound
  const blues = chords.length >= 2 && chords.every(c => c.fam === 'dom') && chords.some(c => mod12(pcOf(c.root) - tonic) === 5)
    && chords.some(c => pcOf(c.root) === tonic);
  if (blues) {
    const home = chords.find(c => pcOf(c.root) === tonic).root;
    const picks = [['minor_pent', 'The classic blues sound: its b3 rubs against the chords\' major 3rds, and that rub is the blues. Bend the b3 up a little.'],
                   ['blues', 'Minor pentatonic plus the b5 blue note: grittier still.'],
                   ['major_pent', 'Sweeter and more country: it fits the home chord and floats over the others.']];
    overall.unshift(...picks.map(([id, why], k) => ({ scale: SCALE[id], root: home, score: -3 + k * 0.1, missing: [], blues: true, reasons: [why],
      pcs: spellScale(SCALE[id], home).map(n => n.pc), notes: spellScale(SCALE[id], home) })));
    overall.splice(limit);
  }
  const best = blues ? null : overall.find(o => !o.missing.length) || overall[0];
  const context = best && { pcs: best.pcs, name: noteText(best.root) + ' ' + best.scale.name };
  const perChord = chords.map(c => scalesForChord(c, { limit: 4, context }));
  return { overall, perChord, tonic, blues };
}
const covers = (scale, pc, need) => { const pcs = new Set(scale.semis.map(x => mod12(x + pc))); return [...need].every(p => pcs.has(p)); };
function progressionReasons(c, chords, tonic) {
  const r = [];
  r.push(c.missing.length ? 'Holds the chords except ' + list(c.missing.map(noteText)) + ', so watch ' + (c.missing.length > 1 ? 'those notes' : 'that note') + ' where the chord has it.'
                         : 'Every note of every chord is in it.');
  if (pcOf(c.root) === tonic) r.push(noteText(c.root) + ' sounds like home here (where the chords come to rest).');
  const fam = parentOf(c.scale, c.root);
  if (fam && fam.mode !== 1) r.push('Same notes as ' + noteText(fam.root) + ' ' + fam.scale.name + ', with ' + noteText(c.root) + ' as home.');
  return r;
}
