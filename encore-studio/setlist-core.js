// ENCORE. Set List: the plain logic, with no page in it (test-setlist.mjs tests it).
// A song is kept once in the library with its chords written in the song's own key.
// A set lists songs in order, and each place in a set can pick its own key and capo
// (Sunday's singer wants it in A, Wednesday's in G), so the library song never changes.
// Reading chord sheets is Songbook's (songbook-core.js); theory is Chords' (chords-core,
// chords-keys, chords-voicing). This file adds keys by name, transposing to a named key,
// capo math, Nashville numbers, ChordPro in and out, set timing and key-flow checks.
import { parseSong, quickFormat, mapChords, chordSequence, guessKey, toChordPro, isChord, titleOf, toLyrics } from "./songbook-core.js";
import { parseChord, chordSymbol, chord, pcOf, mod12, spellRoot, spellBass, noteText, parseNote } from "./chords-core.js";
import { makeKey, keyBySemis } from "./chords-keys.js";
import { capoOptions, coursesOf, fretVoicings } from "./chords-voicing.js";

// ---------- keys by name ("G", "F#m", "Bbm") ----------

/** The keys a song can be in, the way charts name them (both F# and Gb are offered) */
export const MAJOR_NAMES = ["C", "Db", "D", "Eb", "E", "F", "F#", "Gb", "G", "Ab", "A", "Bb", "B"];
export const MINOR_NAMES = ["Cm", "C#m", "Dm", "D#m", "Ebm", "Em", "Fm", "F#m", "Gm", "G#m", "Am", "Bbm", "Bm"];
// the plain name for a key on each of the 12 notes (for capo shapes and when nothing else says)
const PLAIN_MAJOR = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const PLAIN_MINOR = ["Cm", "C#m", "Dm", "Ebm", "Em", "Fm", "F#m", "Gm", "G#m", "Am", "Bbm", "Bm"];

/** "F#m" as { tonic, mode } (null when it isn't a key name). Takes "F# minor", "Am", "a min" too. */
export function parseKey(s) {
  const m = /^\s*([A-Ga-g])\s*(#|b|♯|♭)?\s*(m|min|minor|-)?\s*(maj|major)?\s*$/.exec(String(s ?? ""));
  if (!m) return null;
  const acc = m[2] === "♯" ? "#" : m[2] === "♭" ? "b" : m[2] || "";
  return makeKey(m[1].toUpperCase() + acc, m[3] ? "minor" : "major");
}
/** A key back to its short name: "F#m", "Bb" */
export const keyStr = (k) => (k ? noteText(k.tonic) + (k.mode === "minor" ? "m" : "") : "");
/** Tidy any key name the person typed ("a minor" to "Am"); "" when it isn't one */
export const normKey = (s) => keyStr(parseKey(s));
/** The pitch class (0-11) of a key's home note */
export const keyPc = (s) => { const k = typeof s === "string" ? parseKey(s) : s; return k ? pcOf(k.tonic) : null; };
export const isMinorKey = (s) => parseKey(s)?.mode === "minor";
/** The key names to offer for a song in this key (same mode) */
export const keyChoices = (s) => (isMinorKey(s) ? MINOR_NAMES : MAJOR_NAMES);
/** The plain name of the key on a pitch class, major or minor */
export const plainKey = (pc, minor = false) => (minor ? PLAIN_MINOR : PLAIN_MAJOR)[mod12(pc)];
/** Half steps up from one key to another, -5..+6 (the short way, which is how singers think) */
export function keyDistance(from, to) {
  const a = keyPc(from), b = keyPc(to);
  if (a === null || b === null) return 0;
  const d = mod12(b - a);
  return d > 6 ? d - 12 : d;
}
/** The key a song is in: what it says, or a guess from its chords ("" with no chords) */
export function songKey(song) {
  const k = normKey(song?.key);
  if (k) return k;
  const g = guessKey(chordSequence(song?.body || ""));
  return g ? keyStr(g) : "";
}

// ---------- transposing ----------

/** One chord symbol moved by semis, spelled for the new key (a key object or name). Not a chord: as it was. */
export function transposeChord(sym, semis, toKey = null) {
  const c = parseChord(sym);
  if (!c) return sym;
  const key = typeof toKey === "string" ? parseKey(toKey) : toKey;
  const root = spellRoot(mod12(pcOf(c.root) + semis), c.type, key);
  const bass = c.bass ? spellBass(mod12(pcOf(c.bass) + semis), root, key) : null;
  return chordSymbol(chord(root, c.type, bass));
}
/** A song body with every chord moved from one key to another (names like "G" and "Bb").
 *  Spelled for the target key, so F# shows sharps and Gb shows flats. */
export function transposeBody(body, fromKey, toKey) {
  const from = parseKey(fromKey), to = parseKey(toKey);
  if (!from || !to) return String(body ?? "");
  const semis = mod12(pcOf(to.tonic) - pcOf(from.tonic));
  if (semis === 0 && keyStr(from) === keyStr(to)) return String(body ?? "");
  return mapChords(body, (c, raw) => transposeChord(raw, semis, to));
}

// ---------- capo ----------

/** The capo fret that makes shapes from one key sound in another (A with G shapes: 2) */
export function capoFor(soundingKey, shapeKey) {
  const a = keyPc(soundingKey), b = keyPc(shapeKey);
  return a === null || b === null ? 0 : mod12(a - b);
}
/** The shapes you finger with the capo on: A with capo 2 is played as G */
export function shapeKey(soundingKey, capo) {
  const k = parseKey(soundingKey);
  if (!k) return "";
  if (!capo) return keyStr(k);
  return plainKey(pcOf(k.tonic) - capo, k.mode === "minor");
}
/** The keys guitarists like to play in with open strings */
export const OPEN_KEYS = ["G", "C", "D", "A", "E", "Em", "Am", "Dm"];
const GUITAR = coursesOf({ midi: [40, 45, 50, 55, 59, 64] });
/**
 * Capo ideas for a song in a key: for each capo 0 to 7, the key of the shapes, the chords you'd
 * finger and how easy they are near the nut (a real fingering search on standard guitar). Best first.
 */
export function capoSuggestions(key, chordSyms = [], maxCapo = 7) {
  const k = parseKey(key);
  if (!k) return [];
  const chords = chordSyms.map((s) => parseChord(s)).filter(Boolean);
  const scores = chords.length ? capoOptions(chords, GUITAR, maxCapo) : [];
  const out = [];
  for (let capo = 0; capo <= maxCapo; capo++) {
    const shape = shapeKey(key, capo);
    const opt = scores.find((o) => o.capo === capo);
    const open = OPEN_KEYS.includes(shape);
    // with no chords to look at, the open keys win
    const score = opt ? opt.score - (open ? 0.25 : 0) : (open ? 0 : 3) + capo * 0.12;
    out.push({ capo, shapeKey: shape, open, score, shapes: opt ? [...new Set(opt.all.map(chordSymbol))] : [] });
  }
  return out.sort((a, b) => a.score - b.score || a.capo - b.capo);
}
/** How to finger a chord on standard guitar near the nut (for a diagram): frets per string, low E first; null if none */
export function guitarShape(sym) {
  const c = parseChord(sym);
  if (!c) return null;
  const v = fretVoicings(c, GUITAR, { maxFret: 12, limit: 1 })[0];
  return v ? { frets: v.frets, barre: v.barre, pos: v.pos } : null;
}

// ---------- Nashville numbers ----------

const DEG = ["1", "b2", "2", "b3", "3", "4", "#4", "5", "b6", "6", "b7", "7"];
const SUP = { 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
/** The degree name of a note in a key, counted from the key's home note: "1", "b7", "#4" */
export const degreeOf = (pc, key) => DEG[mod12(pc - keyPc(key))];
/**
 * A chord as a Nashville number in a key, counted from the home note (in a minor key the home
 * chord is 1m, the way most church and session charts number minor songs).
 * Returns { deg, q, bass, text }: "6m", "5⁷", "4/5", "1(sus4)"; null when it isn't a chord.
 */
export function nashville(sym, key) {
  const c = parseChord(sym), k = typeof key === "string" ? parseKey(key) : key;
  if (!c || !k) return null;
  const deg = degreeOf(pcOf(c.root), k);
  const q = chordSymbol(chord(c.root, c.type)).slice(noteText(c.root).length);
  const bass = c.bass ? degreeOf(pcOf(c.bass), k) : "";
  return { deg, q, bass, text: deg + numberSuffix(q) + (bass ? "/" + bass : "") };
}
/** "7" as a raised ⁷, "m7" as it is, "sus4" as (sus4): readable after a number */
export function numberSuffix(q) {
  if (!q) return "";
  if (/^\d+$/.test(q)) return [...q].map((d) => SUP[d]).join("");
  if (/^m(?!aj)/.test(q) || /^(dim|aug|°|\+|ø)/.test(q)) return q;
  return /^\d/.test(q) ? `(${q})` : q;
}
/** A Nashville number back to a chord in a key: "6m" in G is Em, "4/5" in D is G/A ("" if it isn't one) */
export function chordFromNumber(text, key) {
  const k = typeof key === "string" ? parseKey(key) : key;
  const m = /^\s*([b#]?)([1-7])([^/]*)(?:\/([b#]?)([1-7]))?\s*$/.exec(String(text ?? ""));
  if (!k || !m) return "";
  const pcFor = (acc, d) => mod12(pcOf(k.tonic) + [0, 2, 4, 5, 7, 9, 11][+d - 1] + (acc === "#" ? 1 : acc === "b" ? -1 : 0));
  const q = m[3].replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (s) => String(Object.values(SUP).indexOf(s))).replace(/^\((.*)\)$/, "$1");
  const probe = parseChord("C" + q);
  if (!probe) return "";
  const root = spellRoot(pcFor(m[1], m[2]), probe.type, k);
  const bass = m[5] ? spellBass(pcFor(m[4], m[5]), root, k) : null;
  return chordSymbol(chord(root, probe.type, bass));
}

// ---------- ChordPro and pasted chord sheets ----------

const META_KEYS = { t: "title", title: "title", st: "artist", subtitle: "artist", artist: "artist", key: "key", tempo: "tempo", bpm: "tempo", time: "time",
  duration: "duration", capo: "capo", ccli: "ccli", copyright: "copyright", album: "album", year: "year", x_notes: "notes", x_encore_notes: "notes" };
/** Seconds from "4:30", "270", "4m30s" or "4 min" (0 when it can't tell) */
export function parseDuration(s) {
  const t = String(s ?? "").trim().toLowerCase();
  if (!t) return 0;
  let m = /^(\d+):(\d{1,2})$/.exec(t);
  if (m) return +m[1] * 60 + +m[2];
  m = /^(?:(\d+)\s*m(?:in)?)?\s*(?:(\d+)\s*s(?:ec)?)?$/.exec(t);
  if (m && (m[1] || m[2])) return (+m[1] || 0) * 60 + (+m[2] || 0);
  return /^\d+(\.\d+)?$/.test(t) ? Math.round(+t) : 0;
}
/** 270 as "4:30"; with hours, "1:04:30" */
export function formatTime(sec) {
  const s = Math.max(0, Math.round(+sec || 0)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
}
/** A total for people: "48 min", "1 hr 12 min" */
export function formatLong(sec) {
  const m = Math.round((+sec || 0) / 60), h = Math.floor(m / 60);
  return h ? `${h} hr ${m % 60} min` : `${m} min`;
}

/** ChordPro's {c: Verse 1}, {soc} and friends turned into Songbook's [Verse 1] lines; details pulled out */
function normalizeChordPro(text) {
  const meta = {}, out = [];
  for (const raw of String(text ?? "").replace(/\r\n?/g, "\n").split("\n")) {
    const d = /^\s*\{\s*([a-z_]+)\s*(?::\s*(.*?))?\s*\}\s*$/i.exec(raw);
    if (!d) { out.push(raw); continue; }
    const k = d[1].toLowerCase(), v = (d[2] ?? "").trim();
    if (META_KEYS[k]) { if (v) meta[META_KEYS[k]] = v; continue; }
    if (/^(eoc|end_of_chorus|eov|end_of_verse|eob|end_of_bridge|eot|end_of_tab|eog|end_of_grid|new_page|np|column_break|colb)$/.test(k)) continue;
    if (/^(soc|start_of_chorus|sov|start_of_verse|sob|start_of_bridge)$/.test(k)) { out.push(`[${v || { soc: "Chorus", start_of_chorus: "Chorus", sov: "Verse", start_of_verse: "Verse", sob: "Bridge", start_of_bridge: "Bridge" }[k]}]`); continue; }
    if (/^(c|comment|ci|comment_italic|cb|comment_box|note|n)$/.test(k)) {
      if (!v) continue;
      const isSection = /^(c|comment|cb|comment_box)$/.test(k) && parseSong(`{c: ${v}}`)[0]?.type === "section";
      out.push(isSection ? `[${v.replace(/:$/, "")}]` : `{note: ${v}}`);
      continue;
    }
    // other directives ({define}, {textsize}) don't mean anything here
  }
  return { meta, body: out.join("\n") };
}
/** Whether pasted text has more than one song in it ({new_song} / {ns} between them) */
const splitSongs = (text) => String(text ?? "").replace(/\r\n?/g, "\n").split(/^\s*\{\s*(?:new_song|ns)\s*\}\s*$/im).filter((t) => t.trim());

let seq = 0;
export const newId = (p = "s") => `${p}${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** A new library song. fields may set any detail. */
export function makeSong(fields = {}) {
  const now = Date.now();
  return { id: newId("s"), title: "", artist: "", key: "", tempo: 0, time: "4/4", duration: 0, capo: 0, notes: "", ccli: "", body: "", created: now, updated: now, ...fields };
}
/**
 * Songs from pasted text or a file: ChordPro (.cho, .chopro, .pro), chords written above the words,
 * or Songbook's [G]inline style. A title can come from {title:} or the first line ("Amazing Grace" over
 * the chords). Returns an array of songs (a ChordPro file may hold several).
 */
export function importText(text, fileName = "") {
  const songs = [];
  for (const chunk of splitSongs(text)) {
    let { meta, body } = normalizeChordPro(chunk);
    // a plain sheet often starts with "Title" then "Artist" or "Key: G" lines before the music
    const lines = body.replace(/^\n+/, "").split("\n");
    const header = (l) => /^\s*(key|tempo|bpm|time|capo|ccli|duration|artist|by)\s*[:\-]\s*\S/i.exec(l);
    while (lines.length && lines[0].trim() && (header(lines[0]) || (!meta.title && looksLikeTitle(lines, 0)))) {
      const h = header(lines[0]);
      if (h) {
        const k = h[1].toLowerCase(), v = lines[0].slice(lines[0].search(/[:\-]/) + 1).trim();
        const field = { bpm: "tempo", by: "artist" }[k] || k;
        if (!meta[field]) meta[field] = field === "key" ? v.split(/\s|\(/)[0] : v;
      } else meta.title = lines[0].trim();
      lines.shift();
    }
    body = quickFormat(lines.join("\n"));
    if (!body.trim() && !meta.title) continue;
    const tempo = parseInt(meta.tempo, 10) || 0;
    const key = normKey(meta.key) || (() => { const g = guessKey(chordSequence(body)); return g ? keyStr(g) : ""; })();
    const song = makeSong({ title: meta.title || "", artist: meta.artist || "", key, tempo: tempo > 20 && tempo < 400 ? tempo : 0,
      time: /^\d+\/\d+$/.test(meta.time || "") ? meta.time : "4/4", duration: parseDuration(meta.duration), capo: Math.max(0, Math.min(11, parseInt(meta.capo, 10) || 0)),
      ccli: meta.ccli || "", notes: meta.notes || "", body });
    if (!song.title) song.title = fileName ? fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() : titleOf(song);
    songs.push(song);
  }
  return songs;
}
// a first line that's a title: words, not chords, not a section name, followed by a blank or the music
function looksLikeTitle(lines, i) {
  const l = lines[i].trim();
  if (!l || l.length > 60 || /[\[\]{}]/.test(l) || /[.,;!?]$/.test(l)) return false;
  if (l.split(/\s+/).every((t) => isChord(t))) return false;
  if (parseSong(`[${l}]`)[0]?.type !== "section" ) return false; // [Amazing Grace] would be read as a chord name if it were one
  if (/^(intro|verse|chorus|bridge|pre|outro|tag|ending|instrumental|interlude|refrain|hook|solo)\b/i.test(l)) return false;
  const next = (lines[i + 1] ?? "").trim();
  return next === "" || /^\s*(key|tempo|bpm|time|capo|ccli|artist|by)\s*[:\-]/i.test(next) || next.split(/\s+/).every((t) => isChord(t.replace(/^[|(]+|[|)]+$/g, "")));
}
/** A song as a ChordPro file, with the details other apps read ({key}, {tempo}, {time}, {duration}, {capo}, {ccli}) */
export function exportChordPro(song) {
  let out = toChordPro({ title: song.title, artist: song.artist, key: song.key, capo: song.capo, tempo: song.tempo, time: song.time, body: song.body });
  const extra = [song.duration ? `{duration: ${formatTime(song.duration)}}` : "", song.ccli ? `{ccli: ${song.ccli}}` : "", song.notes ? `{x_notes: ${String(song.notes).replace(/[\r\n]+/g, " ")}}` : ""].filter(Boolean);
  if (extra.length) out = out.replace(/\n\n/, "\n" + extra.join("\n") + "\n\n");
  return out;
}

// ---------- reading a song from ENCORE. Songbook ----------

/**
 * A Songbook song as a Set List song. Songbook's key is the real (sounding) key, and with a capo its
 * chords are usually written as the shapes you finger; here chords are kept in the sounding key and
 * the capo is remembered, so the chart still shows the same shapes with the capo on.
 */
export function fromSongbook(sb) {
  const capo = Math.max(0, Math.min(11, +sb.capo || 0));
  const shapes = (sb.written || "shapes") === "shapes";
  let body = String(sb.body || "").replace(/\r\n?/g, "\n");
  let key = normKey(sb.key);
  if (capo && shapes) {
    const writtenKey = key ? shapeKey(key, capo) : (() => { const g = guessKey(chordSequence(body)); return g ? keyStr(g) : ""; })();
    if (!key && writtenKey) key = keyStr(keyBySemis(parseKey(writtenKey), capo));
    if (writtenKey && key) body = transposeBody(body, writtenKey, key);
  }
  if (!key) { const g = guessKey(chordSequence(body)); key = g ? keyStr(g) : ""; }
  return makeSong({ title: sb.title || titleOf({ title: "", body }), artist: sb.artist || "", key, tempo: +sb.tempo || 0, time: sb.time || "4/4", capo, notes: sb.notes || "", body, fromSongbook: sb.id || "" });
}

// ---------- what to show ----------

/**
 * A song ready to show: the chords moved to the key and capo asked for. Returns
 * { key (sounding), capo, shapes (the key you finger), body (chords as you'd play them) }.
 */
export function chartFor(song, key = "", capo = null) {
  const from = songKey(song), to = normKey(key) || from;
  const cap = capo === null || capo === undefined ? +song.capo || 0 : +capo || 0;
  const sounding = from && to ? transposeBody(song.body, from, to) : song.body;
  const shapes = cap && to ? shapeKey(to, cap) : to;
  const body = cap && to ? transposeBody(sounding, to, shapes) : sounding;
  return { key: to, capo: cap, shapes, body };
}
/**
 * Lyrics as projector slides: one slide per section, long sections split into slides of at most
 * maxLines lines. Each: { name, sec (which section, counting from 1; 0 before the first), lines }.
 */
export function lyricSlides(body, maxLines = 4) {
  const slides = [];
  let cur = null, sec = 0;
  const push = (name) => { cur = { name, sec, lines: [] }; slides.push(cur); };
  for (const l of parseSong(body)) {
    if (l.type === "section") { sec++; push(l.name); continue; }
    if (l.type === "blank") { if (cur && cur.lines.length) cur = null; continue; }
    if (l.type !== "lyric") continue;
    const words = l.parts.map((p) => p.text).join("").replace(/\s+/g, " ").trim();
    if (!words) continue;
    if (!cur) push(slides.length ? slides[slides.length - 1].name : "");
    if (cur.lines.length >= maxLines) { const name = cur.name; push(name); }
    cur.lines.push(words);
  }
  return slides.filter((s) => s.lines.length);
}

// ---------- timing ----------

/** Beats you count in a bar: 4 for 4/4, 3 for 3/4, 2 for 6/8 (felt in two, as charts give 6/8 tempos) */
export function beatsPerBar(time) {
  const m = /^(\d+)\/(\d+)$/.exec(String(time || "4/4"));
  if (!m) return 4;
  const n = +m[1], d = +m[2];
  return d === 8 && n % 3 === 0 && n > 3 ? n / 3 : n;
}
/**
 * How long a song runs: its own duration when set, otherwise a guess from its length and tempo
 * (two bars a line of words, the way most worship and pop songs sit). { sec, estimated }.
 */
export function songDuration(song) {
  if (+song?.duration > 0) return { sec: +song.duration, estimated: false };
  const lines = parseSong(song?.body || "").filter((l) => l.type === "lyric" && l.parts.some((p) => p.chord || p.text.trim())).length;
  if (!lines) return { sec: 240, estimated: true };
  const bpm = +song.tempo > 0 ? +song.tempo : 90;
  const sec = (lines * 2 * beatsPerBar(song.time) * 60) / bpm;
  return { sec: Math.round(Math.max(150, Math.min(600, sec)) / 5) * 5, estimated: true };
}
/**
 * A set's running order with times. items: [{ kind: 'song'|'gap', songId, title, duration, segue }];
 * songs: id -> song. gap: seconds between songs that don't segue (talking, tuning).
 * Returns { rows: [{ item, song, start, sec, estimated }], total, songs, estimated }.
 */
export function setTiming(items, songs, gap = 0) {
  let t = 0, estimated = false, count = 0;
  const rows = items.map((item, i) => {
    const song = item.kind === "song" ? songs[item.songId] || null : null;
    if (i > 0 && !item.segue && gap > 0) t += gap;
    let sec, est = false;
    if (item.kind === "song") {
      if (+item.duration > 0) sec = +item.duration;
      else if (song) { const d = songDuration(song); sec = d.sec; est = d.estimated; }
      else sec = 0;
      count++;
    } else sec = +item.duration || 0;
    estimated ||= est;
    const row = { item, song, start: t, sec, estimated: est };
    t += sec;
    return row;
  });
  return { rows, total: t, songs: count, estimated };
}

// ---------- key flow between songs ----------

const MOVE = {
  0: ["ok", "Same key: flows straight in."],
  1: ["note", "Up a half step: a big lift. Works best with a pivot chord."],
  2: ["ok", "Up a whole step: a natural lift."],
  3: ["note", "Up a minor third: fine with a short pause or a pivot chord."],
  4: ["note", "Up a major third: a bright jump. A pivot chord helps."],
  5: ["ok", "Up a fourth: a smooth move."],
  6: ["warn", "A tritone apart: the hardest jump. Leave a gap or use a pivot chord."],
  7: ["ok", "Up a fifth (down a fourth): a smooth move."],
  8: ["note", "Down a major third: fine with a short pause or a pivot chord."],
  9: ["note", "Down a minor third: fine with a short pause or a pivot chord."],
  10: ["ok", "Down a whole step: easy, slightly calmer."],
  11: ["warn", "Down a half step: can feel like the room sags. A pause or a pivot chord helps."],
};
/**
 * How one song's key leads into the next. segue: no stop between them (jumps matter more).
 * Returns { level: 'ok'|'note'|'warn', text, pivot } (pivot: the new key's V chord to lead in with).
 */
export function keyFlow(fromKey, toKey, { segue = false, fromTempo = 0, toTempo = 0 } = {}) {
  const a = parseKey(fromKey), b = parseKey(toKey);
  if (!a || !b) return { level: "ok", text: "", pivot: "" };
  const up = mod12(pcOf(b.tonic) - pcOf(a.tonic));
  let [level, text] = MOVE[up];
  if (a.mode !== b.mode && ((a.mode === "major" && up === 9) || (a.mode === "minor" && up === 3))) [level, text] = ["ok", "Relative major and minor: they share every note."];
  else if (a.mode !== b.mode && up === 0) [level, text] = ["note", "Same home note, major and minor: a strong change of mood."];
  if (!segue && level === "warn") level = "note";
  if (segue && fromTempo > 0 && toTempo > 0 && Math.abs(fromTempo - toTempo) >= 30) {
    text += ` Tempo jumps ${fromTempo} to ${toTempo} BPM in a segue: count it in.`;
    if (level === "ok") level = "note";
  }
  const pivot = level === "ok" || (up === 0 && a.mode === b.mode) ? "" : chordSymbol(chord(spellRoot(mod12(pcOf(b.tonic) + 7), "7", b), "7"));
  return { level, text, pivot };
}

// ---------- sets ----------

export function makeSet(fields = {}) {
  const now = Date.now();
  return { id: newId("t"), name: "New set", date: "", notes: "", gap: 0, items: [], created: now, updated: now, ...fields };
}
/** A place in a set for a song, in its own key and capo unless told otherwise */
export const setItem = (song, fields = {}) => ({ id: newId("i"), kind: "song", songId: song.id, key: songKey(song), capo: +song.capo || 0, segue: false, note: "", duration: 0, ...fields });
/** A non-song moment in a set (a prayer, a welcome, a tuning break) with a length */
export const gapItem = (title = "Break", duration = 120) => ({ id: newId("i"), kind: "gap", title, duration, segue: false, note: "" });
/** A list with one entry moved from one place to another */
export function moveItem(list, from, to) {
  const out = list.slice();
  if (from < 0 || from >= out.length) return out;
  const [x] = out.splice(from, 1);
  out.splice(Math.max(0, Math.min(out.length, to)), 0, x);
  return out;
}
/** Flow checks for every place in a set after the first: [{ index, level, text, pivot }] */
export function setFlow(items, songs) {
  const out = [];
  let prev = null;
  items.forEach((it, i) => {
    if (it.kind !== "song") { if (!it.segue) prev = null; return; }
    const song = songs[it.songId];
    const key = it.key || (song ? songKey(song) : "");
    if (prev) out.push({ index: i, ...keyFlow(prev.key, key, { segue: !!it.segue, fromTempo: prev.tempo, toTempo: +song?.tempo || 0 }) });
    prev = { key, tempo: +song?.tempo || 0 };
  });
  return out;
}

// ---------- sharing a set ----------

export const FILE_FORMAT = "encore-setlist";
/** A set and every song in it, as one JSON file the band can open in their own Set List */
export function exportSet(set, songs) {
  const used = [...new Set(set.items.filter((i) => i.kind === "song").map((i) => i.songId))].map((id) => songs[id]).filter(Boolean);
  return JSON.stringify({ format: FILE_FORMAT, version: 1, exported: new Date().toISOString(), set, songs: used }, null, 2);
}
/** Everything in the library as one backup file */
export const exportLibrary = (sets, songs) => JSON.stringify({ format: FILE_FORMAT, version: 1, exported: new Date().toISOString(), sets, songs }, null, 2);
/**
 * Read a shared set or backup file and merge it into what's here. The newer copy of a song wins
 * (by its updated time), so the band gets the leader's latest key and chords without losing theirs.
 * Returns { songs: [to save], sets: [to save], added, updated, kept, error }.
 */
export function importSetFile(text, haveSongs = {}, haveSets = {}) {
  let d;
  try { d = JSON.parse(text); } catch { return { error: "That file isn't a set list file (it isn't JSON)." }; }
  if (!d || d.format !== FILE_FORMAT || !Array.isArray(d.songs)) return { error: "That file isn't an ENCORE. Set List file." };
  const songs = [], res = { songs, sets: [], added: 0, updated: 0, kept: 0, error: "" };
  for (const s of d.songs) {
    if (!s || typeof s.id !== "string" || typeof s.body !== "string") continue;
    const clean = makeSong({ ...pick(s, ["id", "title", "artist", "key", "tempo", "time", "duration", "capo", "notes", "ccli", "body", "created", "updated"]) });
    const have = haveSongs[s.id];
    if (!have) { songs.push(clean); res.added++; }
    else if ((+clean.updated || 0) > (+have.updated || 0)) { songs.push(clean); res.updated++; }
    else res.kept++;
  }
  for (const set of d.set ? [d.set] : Array.isArray(d.sets) ? d.sets : []) {
    if (!set || typeof set.id !== "string" || !Array.isArray(set.items)) continue;
    const have = haveSets[set.id];
    if (have && (+have.updated || 0) >= (+set.updated || 0)) continue;
    res.sets.push(makeSet({ ...pick(set, ["id", "name", "date", "notes", "gap", "created", "updated"]), items: set.items.filter((i) => i && (i.kind === "song" || i.kind === "gap")) }));
  }
  return res;
}
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));

// a place to keep the helpers the page reuses together
export { titleOf, toLyrics, parseSong };
