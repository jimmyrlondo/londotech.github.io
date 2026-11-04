// ENCORE. Compose: say what you want, it does it. One box at the caret takes
// what musicians already write on a page ("pp", "cresc.", "Cmaj7", "3/4",
// "q = 120", "rit.", "pizz.", "D.S. al Coda", "A") and the command search
// (Ctrl+K) finds everything else by name. This file only turns words into
// actions; compose.js carries them out. No page in here (test-compose-commands.mjs).
import { parseChord, chordSymbol } from "./chords-core.js";

// action shapes compose.js knows:
//   { kind: "event", patch }        on the selected note(s): dyn, artic, tech, orn, trem, arp, fermata...
//   { kind: "note", patch }         on the selected note's notes (or every note of a run): finger, head, harm
//   { kind: "span", type }          over the selected run: slur, cresc, dim, 8va, 8vb, pedal, trill, gliss
//   { kind: "bar", patch }          on the caret's bar: tempo, time, key, mode, text, mark, nav, volta, repeatStart, repeatEnd, barline, clef
//   { kind: "chord", chord }        a chord symbol on the selected note
//   { kind: "lyric", text }         a lyric on the selected note
//   { kind: "command", id }         a page command (play, record, transpose-up...)
//   { kind: "error", message }
const DYNAMICS = ["pppp", "ppp", "pp", "p", "mp", "mf", "f", "ff", "fff", "ffff", "sfz", "sf", "sffz", "fp", "sfp", "rfz", "fz"];
const ARTICS = { "stacc": "staccato", "staccato": "staccato", ".": "staccato", "staccatissimo": "staccatissimo", "acc": "accent", "accent": "accent", ">": "accent",
  "ten": "tenuto", "tenuto": "tenuto", "-": "tenuto", "marc": "marcato", "marcato": "marcato", "^": "marcato", "ferm": "fermata", "fermata": "fermata", "u": "fermata" };
const TECHS = ["pizz.", "arco", "con sord.", "senza sord.", "mute", "open", "let ring", "palm mute", "harmonic", "sul pont.", "sul tasto", "col legno", "normal"];
const ORNS = { tr: "trill", trill: "trill", turn: "turn", "inv turn": "invturn", mordent: "mordent", mord: "mordent", "inv mordent": "invmordent", "upper mordent": "invmordent" };
const NAVS = ["Segno", "Coda", "To Coda", "Fine", "D.C.", "D.C. al Fine", "D.C. al Coda", "D.S.", "D.S. al Fine", "D.S. al Coda"];
const TEXT_DIRECTIONS = ["rit.", "ritard.", "rall.", "accel.", "a tempo", "tempo primo", "poco rit.", "molto rit.", "swing", "straight", "dolce", "espressivo", "cantabile", "legato",
  "marcato", "rubato", "simile", "tutti", "solo", "div.", "unis.", "sim.", "D.C.", "fine"];
const KEYS = { C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, "F#": 6, "C#": 7, F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5, Gb: -6, Cb: -7 };
const REL = { A: "C", E: "G", B: "D", "F#": "A", "C#": "E", "G#": "B", "D#": "F#", "A#": "C#", D: "F", G: "Bb", C: "Eb", F: "Ab", Bb: "Db", Eb: "Gb", Ab: "Cb" };
const CLEFS = { treble: "treble", bass: "bass", alto: "alto", tenor: "tenor", "treble 8vb": "treble8vb", "8vb": "treble8vb", percussion: "percussion" };

/** What a bit of typed text means. ctx: { hasSelection, hasRange } (so "f" can be a dynamic) */
export function parseCommand(input, ctx = {}) {
  const raw = String(input || "").trim(), t = raw.toLowerCase().replace(/\s+/g, " ");
  if (!t) return { kind: "error", message: "Type something: pp, cresc., Cmaj7, 3/4, q = 120, rit., pizz., A ..." };
  // dynamics
  if (DYNAMICS.includes(t)) return { kind: "event", patch: { dyn: t }, label: `dynamic ${t}` };
  // hairpins and lines over a run
  if (/^(cresc\.?|crescendo|<)$/.test(t)) return { kind: "span", type: "cresc", label: "crescendo" };
  if (/^(dim\.?|diminuendo|decresc\.?|decrescendo|>>|>)$/.test(t) && t !== ">" ) return { kind: "span", type: "dim", label: "diminuendo" };
  if (t === ">" && ctx.hasRange) return { kind: "span", type: "dim", label: "diminuendo" };
  if (/^(slur|legato line)$/.test(t)) return { kind: "span", type: "slur", label: "slur" };
  if (/^(8va|ottava)$/.test(t)) return { kind: "span", type: "8va", label: "8va" };
  if (/^(8vb|ottava bassa)$/.test(t)) return { kind: "span", type: "8vb", label: "8vb" };
  if (/^(ped\.?|pedal)$/.test(t)) return { kind: "span", type: "pedal", label: "pedal" };
  if (/^(gliss\.?|glissando|slide)$/.test(t)) return { kind: "span", type: "gliss", label: "glissando" };
  if (/^(trill line|tr~+)$/.test(t)) return { kind: "span", type: "trill", label: "trill line" };
  // on the notes themselves: fingering, noteheads, harmonics
  const fing = /^(?:finger(?:ing)?|fing\.?)\s*([1-5]|p|i|m|a)$/.exec(t);
  if (fing) return { kind: "note", patch: { finger: fing[1] }, label: `fingering ${fing[1]}` };
  const head = /^(?:head|notehead)\s+(normal|x|cross|diamond|slash|triangle|circle-x)$/.exec(t);
  if (head) return { kind: "note", patch: { head: head[1] === "cross" ? "x" : head[1] }, label: `${head[1]} notehead` };
  if (/^(harm|harmonic|natural harmonic)$/.test(t)) return { kind: "note", patch: { harm: true }, label: "harmonic" };
  // articulations, ornaments, techniques, tremolo, arpeggio
  if (ARTICS[t]) return { kind: "event", patch: { artic: [ARTICS[t]] }, label: ARTICS[t] };
  if (ORNS[t]) return { kind: "event", patch: { orn: ORNS[t] }, label: ORNS[t] };
  if (/^(tr|trill)(#|b|n)$/.test(t)) return { kind: "event", patch: { orn: "trill", ornAcc: { "#": 1, b: -1, n: 0 }[t.slice(-1)] }, label: "trill" };
  const tech = TECHS.find((x) => x.replace(/\./g, "") === t.replace(/\./g, ""));
  if (tech) return { kind: "event", patch: { tech }, label: tech };
  const trem = /^(trem\.?|tremolo)\s*([123])?$/.exec(t) || /^\/{1,3}$/.exec(t);
  if (trem) return { kind: "event", patch: { trem: trem[2] ? +trem[2] : trem[0].startsWith("/") ? trem[0].length : 3 }, label: "tremolo" };
  if (/^(arp\.?|arpeggio|arpeggiate)$/.test(t)) return { kind: "event", patch: { arp: true }, label: "arpeggio" };
  if (/^(grace|acciaccatura|appoggiatura)$/.test(t)) return { kind: "command", id: "grace", arg: t !== "appoggiatura", label: "grace note" };
  // tempo: "q = 120", "120", "tempo 96", "bpm 100"
  const tempo = /^(?:q\s*=\s*|tempo\s*|bpm\s*|=\s*)?(\d{2,3})(?:\s*bpm)?$/.exec(t);
  if (tempo && +tempo[1] >= 20 && +tempo[1] <= 320) return { kind: "bar", patch: { tempo: +tempo[1] }, label: `tempo ${tempo[1]}` };
  // time signatures, with groupings: "7/8", "7/8 2+2+3"
  const time = /^(\d{1,2})\/(1|2|4|8|16|32)(?:\s+((?:\d\+)+\d))?$/.exec(t);
  if (time) {
    const n = +time[1], d = +time[2], groups = time[3] ? time[3].split("+").map(Number) : null;
    if (groups && groups.reduce((a, b) => a + b, 0) !== n) return { kind: "error", message: `${time[3]} adds up to ${groups.reduce((a, b) => a + b, 0)}, not ${n}.` };
    return { kind: "bar", patch: { time: groups ? { n, d, groups } : { n, d } }, label: `time ${n}/${d}` };
  }
  // keys: "key G", "G major", "Bbm", "F# minor", "key change Eb"
  // a key needs the word: "key Bbm", "Bb minor" ("Bbm" on its own is the chord)
  const key = /^(?:key(?: change)?\s+)?([a-g])(#|b)?\s*(m|min|minor|maj|major)?$/i.exec(raw.trim());
  if (key && (/^key\b/i.test(raw.trim()) || /\s*(major|minor)$/i.test(raw.trim()))) {
    const name = key[1].toUpperCase() + (key[2] || ""), minor = /^(m|min|minor)$/i.test(key[3] || "");
    const major = minor ? REL[name] : name;
    if (KEYS[major] === undefined) return { kind: "error", message: `${name}${minor ? " minor" : " major"} isn't a key with a usual signature. Try its enharmonic.` };
    return { kind: "bar", patch: { key: KEYS[major], mode: minor ? "minor" : "major" }, label: `key ${name} ${minor ? "minor" : "major"}` };
  }
  // clefs
  const clef = /^(?:clef\s+)?(treble 8vb|treble|bass|alto|tenor|8vb|percussion)(?:\s+clef)?$/.exec(t);
  if (clef) return { kind: "bar", patch: { clef: CLEFS[clef[1]] }, label: `${clef[1]} clef` };
  // repeats, endings, barlines, navigation, rehearsal marks
  if (/^(\|:|repeat start|start repeat)$/.test(t)) return { kind: "bar", patch: { repeatStart: true }, label: "start repeat" };
  const rep = /^(?::\||repeat end|end repeat|repeat)(?:\s*x?\s*(\d))?$/.exec(t);
  if (rep) return { kind: "bar", patch: { repeatEnd: rep[1] ? +rep[1] : 2 }, label: "end repeat" };
  const volta = /^(?:ending\s+)?((?:\d\s*[,.]\s*)*\d)\.?(?:\s*ending)?$/.exec(t);
  if (volta && /\.|ending|,/.test(t)) return { kind: "bar", patch: { volta: volta[1].split(/[,.]\s*/).filter(Boolean).map(Number) }, label: `${volta[1]}. ending` };
  if (/^(double bar|\|\|)$/.test(t)) return { kind: "bar", patch: { barline: "double" }, label: "double barline" };
  if (/^(final bar|end|\|\|\.?|fine bar)$/.test(t)) return { kind: "bar", patch: { barline: "final" }, label: "final barline" };
  const nav = NAVS.find((n) => n.toLowerCase() === t || n.toLowerCase().replace(/\./g, "") === t.replace(/\./g, ""));
  if (nav) return { kind: "bar", patch: { nav }, label: nav };
  const mark = /^(?:rehearsal\s+|mark\s+|\[)?([a-z]{1,2}|\d{1,3})\]?$/.exec(t);
  if (mark && /^(rehearsal|mark|\[)/.test(t)) return { kind: "bar", patch: { mark: mark[1].toUpperCase() }, label: `rehearsal ${mark[1].toUpperCase()}` };
  // chord symbols (before plain words: "A" alone is a chord when a note is selected)
  const c = parseChord(raw.trim());
  if (c && !/^(f|p|mp|mf|ff)$/i.test(raw.trim())) return { kind: "chord", chord: chordSymbol(c) || raw.trim(), label: `chord ${chordSymbol(c) || raw.trim()}` };
  // lyrics: "lyric word" or quoted text
  const lyr = /^(?:lyric|lyrics|sing)\s+(.+)$/i.exec(raw.trim()) || /^"(.+)"$/.exec(raw.trim());
  if (lyr) return { kind: "lyric", text: lyr[1], label: "lyric" };
  // tempo and expression words
  if (TEXT_DIRECTIONS.includes(t) || /^(text|direction)\s+/.test(t)) return { kind: "bar", patch: { text: raw.replace(/^(text|direction)\s+/i, "") }, label: `text "${raw.replace(/^(text|direction)\s+/i, "")}"` };
  return { kind: "error", message: `"${raw}" isn't something I know yet. Try pp, cresc., Cmaj7, 3/4, q = 120, rit., pizz., tr, 1. ending, D.S. al Coda.` };
}

/** Everything the page can do, for the command search: [{ id, name, keys, words }] */
export const COMMANDS = [
  ["play", "Play or stop", "Space", "listen hear playback start"],
  ["record", "Record", "", "midi mic capture take"],
  ["loop", "Loop the selection", "L", "cycle repeat practice"],
  ["undo", "Undo", "Ctrl+Z", ""], ["redo", "Redo", "Ctrl+Y", ""],
  ["copy", "Copy", "Ctrl+C", ""], ["paste", "Paste", "Ctrl+V", ""], ["select-all", "Select all in this voice", "Ctrl+A", ""],
  ["transpose-up", "Transpose up a half step", "", "higher semitone"], ["transpose-down", "Transpose down a half step", "", "lower semitone"],
  ["transpose-octave-up", "Up an octave", "Ctrl+Up", ""], ["transpose-octave-down", "Down an octave", "Ctrl+Down", ""],
  ["insert-mode", "Insert mode (push music along)", "", "write"], ["over-mode", "Over mode (write over what's there)", "", "overwrite"],
  ["new-score", "New score from a template", "", "start create choir band quartet orchestra lead sheet"],
  ["add-instrument", "Add an instrument", "", "part staff player"],
  ["check", "Check the score (proofread)", "", "proofread errors range mistakes"],
  ["analysis", "Show harmony analysis (Roman numerals)", "", "roman nashville numbers theory"],
  ["written", "Written pitch on or off", "", "transposed concert"],
  ["export-musicxml", "Download MusicXML", "", "save export sibelius dorico musescore finale"],
  ["export-midi", "Download MIDI", "", "daw export"], ["export-wav", "Download audio (WAV)", "", "render bounce mixdown"],
  ["export-stems", "Download stems (one file per instrument)", "", "render bounce parts audio"],
  ["print", "Print or save PDF", "Ctrl+P", ""], ["print-part", "Print one part", "", "player extract"],
  ["history", "Version history", "", "restore earlier backup undo"],
  ["paper", "Light or dark paper", "", "theme colors page"],
  ["shortcuts", "Keyboard shortcuts", "?", "help keys"],
].map(([id, name, keys, words]) => ({ id, name, keys, words }));

/** Search the commands and what typed text would do, best first */
export function searchCommands(q, ctx = {}) {
  const s = String(q || "").trim().toLowerCase();
  const scored = COMMANDS.map((c) => {
    if (!s) return { c, score: 1 };
    const hay = (c.name + " " + c.words + " " + c.id).toLowerCase();
    let score = 0;
    if (c.name.toLowerCase().startsWith(s)) score += 10;
    for (const w of s.split(/\s+/)) if (hay.includes(w)) score += 3; else score -= 2;
    return { c, score };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).map((x) => ({ kind: "command", id: x.c.id, label: x.c.name, keys: x.c.keys }));
  const parsed = s ? parseCommand(q, ctx) : null;
  return parsed && parsed.kind !== "error" ? [{ ...parsed, typed: true }, ...scored] : scored;
}
