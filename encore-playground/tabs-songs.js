// ENCORE. Tabs: starter songs. Public domain melodies and words only (traditional songs,
// Beethoven's Ode to Joy with Henry van Dyke's 1907 words, Gruber's Silent Night, Pierpont's
// Jingle Bells). Written for a 17-key C kalimba or a D Kurd handpan; the converter moves them.
import { parseMelody, assignLyrics, newTune } from "./tabs-core.js";

const K17 = { kind: "kalimba", tuning: "k17", shift: 0 };
const SONGS = [
  { id: "twinkle", title: "Twinkle, Twinkle, Little Star", by: "Traditional", tempo: 96, beats: 4, inst: K17,
    melody: "C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2 G4 G4 F4 F4 E4 E4 D4:2 G4 G4 F4 F4 E4 E4 D4:2 C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2",
    words: "Twin-kle twin-kle lit-tle star, how I won-der what you are. Up a-bove the world so high, like a dia-mond in the sky. Twin-kle twin-kle lit-tle star, how I won-der what you are." },
  { id: "hotcross", title: "Hot Cross Buns", by: "Traditional", tempo: 100, beats: 4, inst: K17,
    melody: "E4 D4 C4:2 E4 D4 C4:2 C4:.5 C4:.5 C4:.5 C4:.5 D4:.5 D4:.5 D4:.5 D4:.5 E4 D4 C4:2",
    words: "Hot cross buns, hot cross buns, one a pen-ny, two a pen-ny, hot cross buns." },
  { id: "mary", title: "Mary Had a Little Lamb", by: "Traditional", tempo: 104, beats: 4, inst: K17,
    melody: "E4 D4 C4 D4 E4 E4 E4:2 D4 D4 D4:2 E4 G4 G4:2 E4 D4 C4 D4 E4 E4 E4 E4 D4 D4 E4 D4 C4:4",
    words: "Ma-ry had a lit-tle lamb, lit-tle lamb, lit-tle lamb, Ma-ry had a lit-tle lamb, its fleece was white as snow." },
  { id: "ode", title: "Ode to Joy", by: "Ludwig van Beethoven, words by Henry van Dyke", tempo: 100, beats: 4, inst: K17,
    melody: "E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4:1.5 D4:.5 D4:2 E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4:1.5 C4:.5 C4:2",
    words: "Joy-ful, joy-ful, we a-dore Thee, God of glo-ry, Lord of love; hearts un-fold like flow'rs be-fore Thee, op'-ning to the sun a-bove." },
  { id: "jacques", title: "Frère Jacques", by: "Traditional", tempo: 100, beats: 4, inst: K17,
    melody: "G4 A4 B4 G4 G4 A4 B4 G4 B4 C5 D5:2 B4 C5 D5:2 D5:.5 E5:.5 D5:.5 C5:.5 B4 G4 D5:.5 E5:.5 D5:.5 C5:.5 B4 G4 G4 D4 G4:2 G4 D4 G4:2",
    words: "Are you sleep-ing, are you sleep-ing, Broth-er John, Broth-er John? Morn-ing bells are ring-ing, morn-ing bells are ring-ing, ding dang dong, ding dang dong." },
  { id: "jingle", title: "Jingle Bells (chorus)", by: "James Lord Pierpont", tempo: 120, beats: 4, inst: K17,
    melody: "E4 E4 E4:2 E4 E4 E4:2 E4 G4 C4:1.5 D4:.5 E4:4 F4 F4 F4:1.5 F4:.5 F4 E4 E4 E4:.5 E4:.5 E4 D4 D4 E4 D4:2 G4:2 E4 E4 E4:2 E4 E4 E4:2 E4 G4 C4:1.5 D4:.5 E4:4 F4 F4 F4:1.5 F4:.5 F4 E4 E4 E4:.5 E4:.5 G4 G4 F4 D4 C4:4",
    words: "Jin-gle bells, jin-gle bells, jin-gle all the way. Oh what fun it is to ride in a one horse o-pen sleigh, hey! Jin-gle bells, jin-gle bells, jin-gle all the way. Oh what fun it is to ride in a one horse o-pen sleigh." },
  { id: "silent", title: "Silent Night", by: "Franz Xaver Gruber, words by Joseph Mohr (English: John Freeman Young)", tempo: 84, beats: 3, inst: K17,
    melody: "G4:1.5 A4:.5 G4 E4:3 G4:1.5 A4:.5 G4 E4:3 D5:2 D5 B4:3 C5:2 C5 G4:3 A4:2 A4 C5:1.5 B4:.5 A4 G4:1.5 A4:.5 G4 E4:3 A4:2 A4 C5:1.5 B4:.5 A4 G4:1.5 A4:.5 G4 E4:3 D5:2 D5 F5:1.5 D5:.5 B4 C5:3 E5:3 C5 G4 E4 G4:1.5 F4:.5 D4 C4:3",
    words: "Si-lent _ night, ho-ly _ night, all is calm, all is bright, round yon vir- _ gin moth-er and child, ho-ly in-fant so ten-der and mild, sleep in hea-ven-ly peace, _ sleep in hea-ven-ly peace. _" },
  { id: "sailor", title: "Drunken Sailor", by: "Traditional sea shanty", tempo: 132, beats: 4, inst: K17,
    melody: "A4 A4:.5 A4:.5 A4 A4:.5 A4:.5 A4 D4 F4 A4 G4 G4:.5 G4:.5 G4 G4:.5 G4:.5 G4 C4 E4 G4 A4 A4:.5 A4:.5 A4 A4:.5 A4:.5 A4 B4 C5 D5 C5 A4 G4 E4 D4:2 D4:2",
    words: "What shall we do with a drunk-en sail-or, what shall we do with a drunk-en sail-or, what shall we do with a drunk-en sail-or, ear-ly in the morn-ing?" },
  { id: "godrest", title: "God Rest Ye Merry, Gentlemen", by: "Traditional English carol", tempo: 108, beats: 4, inst: { kind: "handpan", tuning: "hp-kurd9", shift: 0 },
    melody: "D4 D4 A4 A4 G4 F4 E4 D4 C4 D4 E4 F4 G4 A4:3 D4 D4 A4 A4 G4 F4 E4 D4 C4 D4 E4 F4 G4 A4:3",
    words: "God rest ye mer-ry gen-tle-men, let noth-ing you dis-may, re-mem-ber Christ our Sa-vi-our was born on Christ-mas day." },
];
/** The starter songs as tunes (fresh copies) */
export function starterSongs() {
  return SONGS.map((s) => ({ id: s.id, ...assignLyrics(newTune({ title: s.title, by: s.by, tempo: s.tempo, beats: s.beats, inst: { ...s.inst }, notes: parseMelody(s.melody) }), s.words) }));
}
export const SONG_IDS = SONGS.map((s) => s.id);
