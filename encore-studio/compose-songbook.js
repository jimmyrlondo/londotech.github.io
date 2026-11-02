// ENCORE. Compose: Songbook songs (same browser) as lead sheets. A song's
// sections and chord lines become rehearsal marks and chord symbols over bars;
// compose-core's fromLeadSheet does the music, this does the reading.
import { parseSong, chordSequence, guessKey } from "./songbook-core.js";
import { noteText } from "./chords-core.js";

/** The songs in Songbook, newest first: [{ id, title, artist, key, tempo, body }] */
export function songbookSongs() {
  try {
    const d = JSON.parse(localStorage.getItem("encore.songbook.v1") || "null");
    return (d?.songs || []).filter((s) => (s.body || "").trim()).sort((a, b) => (b.updated || 0) - (a.updated || 0));
  } catch { return []; }
}
// a key name ("G", "Em", "Bb") as fifths and mode
const FIFTHS = { C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, "F#": 6, "C#": 7, F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5, Gb: -6, Cb: -7 };
const REL_MAJOR = { A: "C", E: "G", B: "D", "F#": "A", "C#": "E", "G#": "B", "D#": "F#", "A#": "C#", D: "F", G: "Bb", C: "Eb", F: "Ab", Bb: "Db", Eb: "Gb", Ab: "Cb" };
export function keyOf(name) {
  const m = /^([A-G][#b]?)(m?)$/.exec(String(name || "").trim());
  if (!m) return null;
  const minor = !!m[2], major = minor ? REL_MAJOR[m[1]] : m[1];
  return FIFTHS[major] === undefined ? null : { key: FIFTHS[major], mode: minor ? "minor" : "major" };
}
/** A Songbook song as fromLeadSheet's input */
export function leadSheetFrom(song) {
  let k = keyOf(song.key);
  if (!k) { const g = guessKey(chordSequence(song.body)); if (g) k = keyOf(noteText(g.tonic) + (g.mode === "minor" ? "m" : "")); }
  const sections = [];
  let cur = null;
  for (const l of parseSong(song.body)) {
    if (l.type === "section") { cur = { name: l.name, lines: [] }; sections.push(cur); continue; }
    if (l.type !== "lyric") continue;
    if (!cur) { cur = { name: "", lines: [] }; sections.push(cur); }
    const chords = l.parts.map((p) => p.chord).filter(Boolean);
    const lyric = l.parts.map((p) => p.text).join("").replace(/\s+/g, " ").trim();
    if (chords.length || lyric) cur.lines.push({ chords, lyric });
  }
  return { title: song.title || "Untitled song", artist: song.artist || "", key: k?.key ?? 0, mode: k?.mode || "major", tempo: song.tempo || 96,
    time: { n: 4, d: 4 }, sections: sections.filter((s) => s.lines.length) };
}
