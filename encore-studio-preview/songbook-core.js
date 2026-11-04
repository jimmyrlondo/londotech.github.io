// ENCORE. Songbook: lyrics with chords, with no page in it (test-songbook.mjs).
// A song's words are kept the way most songwriters already type them: chords in
// square brackets right where they change ("[G]Here comes the [C]sun"), the
// ChordPro way that OnSong, SongbookPro and others read. Section names sit on
// their own line ("[Verse 1]"). Everything else here turns that into what a
// player needs: chords above the words, any key, sharps or flats, and the
// formats people paste into other places (Ultimate Guitar, notes, a text).
import { parseChord, chordSymbol, chordTones, pcOf, mod12, spellRoot, spellBass, chord, noteText } from "./chords-core.js";
import { makeKey, keyName, keyPalette, keyBySemis, MAJOR_KEYS, MINOR_KEYS, nextMoves, numeralOf } from "./chords-keys.js";

// ---------- reading ----------

const SECTION_WORDS = "intro|verse|pre[- ]?chorus|chorus|post[- ]?chorus|bridge|hook|refrain|interlude|instrumental|solo|breakdown|outro|coda|tag|ending|vamp|break|middle 8|drop|build|riff";
const SECTION_RE = new RegExp(`^\\s*[\\[(]?\\s*((?:${SECTION_WORDS})(?:\\s*\\d+|\\s+[a-z])?(?:\\s*[x×]\\s*\\d+)?)\\s*[\\])]?\\s*:?\\s*$`, "i");
/** A chord name we understand (plus N.C. for "no chord") */
export function isChord(s) {
  const t = String(s || "").trim();
  if (!t) return false;
  if (/^(N\.?C\.?|x|%)$/i.test(t)) return true;
  return !!parseChord(t);
}
/** "verse 2:" or "(CHORUS)" as a section name, "Verse 2" / "Chorus" */
export function sectionName(line) {
  const m = SECTION_RE.exec(line);
  if (!m) return "";
  return m[1].replace(/\s+/g, " ").trim().toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/**
 * A song's text as lines. Each line:
 *   { type: 'section', name, at }         [Verse 1] on its own line
 *   { type: 'note', text, at, end }       {note: let ring}: for the player, not part of the song
 *   { type: 'lyric', parts: [{ chord, text, at }], at, end }   at: where each part's words start in the text
 *   { type: 'blank' } | { type: 'meta', key, value } ({title: ...} ChordPro directives)
 */
export function parseSong(text) {
  const lines = [], src = String(text ?? "").replace(/\r\n?/g, "\n");
  let at = 0;
  for (const raw of src.split("\n")) {
    const start = at;
    at += raw.length + 1;
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) { lines.push({ type: "blank", at: start }); continue; }
    const dir = /^\s*\{\s*([a-z_]+)\s*(?::\s*(.*?))?\s*\}\s*$/i.exec(line);
    if (dir) {
      const k = dir[1].toLowerCase(), v = dir[2] ?? "";
      // a note for the player ("let ring", "2x", "palm mute"): {note: ...}, or a ChordPro comment that isn't a part's name
      if (/^(note|n|ci|comment_italic|cb|comment_box)$/.test(k) || (/^(c|comment)$/.test(k) && v && !sectionName(v))) {
        if (v) lines.push({ type: "note", text: v, at: start, end: start + raw.length });
        continue;
      }
      if (/^(c|comment|soc|start_of_chorus|sov|start_of_verse|sob|start_of_bridge)$/.test(k)) {
        const name = v || { soc: "Chorus", start_of_chorus: "Chorus", sov: "Verse", start_of_verse: "Verse", sob: "Bridge", start_of_bridge: "Bridge" }[k] || "";
        if (name) lines.push({ type: "section", name, at: start });
      } else if (!/^(eoc|end_of_chorus|eov|end_of_verse|eob|end_of_bridge)$/.test(k)) lines.push({ type: "meta", key: k, value: v, at: start });
      continue;
    }
    // a line that's only a bracketed name that isn't a chord: a section
    const only = /^\s*\[([^\]]+)\]\s*$/.exec(line);
    if (only && !isChord(only[1])) { lines.push({ type: "section", name: only[1].trim(), at: start }); continue; }
    const parts = [];
    const re = /\[([^\]]*)\]/g;
    let last = 0, chordNow = null, m;
    while ((m = re.exec(line))) {
      if (!isChord(m[1])) continue; // [laughs] and other notes stay in the words
      if (m.index > last || chordNow !== null) parts.push({ chord: chordNow, text: line.slice(last, m.index), at: start + last });
      chordNow = m[1].trim(); last = m.index + m[0].length;
    }
    parts.push({ chord: chordNow, text: line.slice(last), at: start + last });
    lines.push({ type: "lyric", parts: parts.filter((p, i) => p.chord !== null || p.text !== "" || i === parts.length - 1), at: start, end: start + raw.length });
  }
  return lines;
}
/** The song's details from ChordPro directives ({title}, {artist}, {key}, {capo}, {tempo}, {time}) */
export function songMetaFrom(text) {
  const out = {};
  for (const l of parseSong(text)) if (l.type === "meta") {
    const k = { t: "title", st: "artist", subtitle: "artist" }[l.key] || l.key;
    if (["title", "artist", "key", "capo", "tempo", "time", "album", "year", "composer", "lyricist"].includes(k)) out[k] = l.value;
  }
  return out;
}
/** The chords a song uses, in the order they first come */
export function chordsUsed(text) {
  const seen = new Set(), out = [];
  for (const l of parseSong(text)) if (l.type === "lyric") for (const p of l.parts) if (p.chord && !seen.has(p.chord) && parseChord(p.chord)) { seen.add(p.chord); out.push(p.chord); }
  return out;
}
/** The parts of a song, the buttons Songbook offers (most used first) */
export const PARTS = ["Intro", "Verse", "Pre-Chorus", "Chorus", "Post-Chorus", "Bridge", "Refrain", "Hook", "Solo", "Interlude", "Breakdown", "Instrumental", "Tag", "Outro"];
// the parts that get numbers as they come back (Verse 1, Verse 2); a chorus is the same chorus each time
const NUMBERED = ["Verse", "Pre-Chorus", "Bridge", "Solo", "Interlude"];
/** The name for a new part: "Verse 3" after two verses, "Chorus" for a chorus */
export function nextPartName(text, base) {
  if (!NUMBERED.includes(base)) return base;
  const re = new RegExp(`^${base.replace("-", "[- ]?")}\\s*(\\d+)?$`, "i");
  const had = parseSong(text).filter((l) => l.type === "section" && re.test(l.name));
  return `${base} ${had.length + 1}`;
}
/**
 * Put a part's [Name] line in at a place in the text: on its own line, a blank line before it,
 * with the words of an earlier part of that name copied in when repeat is on (a chorus coming back).
 * Returns { text, caret } with the caret on the line after the name.
 */
export function insertPart(text, at, name, repeat = false) {
  let p = Math.max(0, Math.min(text.length, at));
  // to the start of the line, or the next line when the caret is mid-line
  const lineStart = text.lastIndexOf("\n", p - 1) + 1, lineEnd = text.indexOf("\n", p) < 0 ? text.length : text.indexOf("\n", p);
  if (text.slice(lineStart, lineEnd).trim() !== "") p = lineEnd === text.length ? text.length : lineEnd + 1;
  else p = lineStart;
  let body = "";
  if (repeat) {
    const secs = sections(text), from = [...secs].reverse().find((s) => s.name.toLowerCase() === name.toLowerCase());
    if (from) body = text.replace(/\r\n?/g, "\n").split("\n").slice(from.from, from.to).join("\n").replace(/\s+$/, "");
  }
  const before = text.slice(0, p), after = text.slice(p);
  const lead = before === "" ? "" : before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
  const block = `${lead}[${name}]\n${body ? body + "\n" : ""}`;
  const tail = after && !after.startsWith("\n") && body ? "\n" : "";
  const out = before + block + tail + after;
  return { text: out, caret: (before + block).length };
}
/** Parts already in the song that usually come back (to offer "repeat") */
export function repeatableParts(text) {
  const names = [];
  for (const s of sections(text)) if (s.to > s.from && /^(chorus|refrain|hook|post-chorus|pre-chorus|tag)$/i.test(s.name) && !names.includes(s.name)) names.push(s.name);
  return names;
}
/** Every chord as it's played, start to end (for guessing the key) */
export function chordSequence(text) {
  const out = [];
  for (const l of parseSong(text)) if (l.type === "lyric") for (const p of l.parts) if (p.chord && parseChord(p.chord)) out.push(p.chord);
  return out;
}
/** The sections, with the line range each covers (for "fill this section with a progression") */
export function sections(text) {
  const lines = parseSong(text), out = [];
  let cur = null;
  lines.forEach((l, i) => {
    if (l.type === "section") { cur = { name: l.name, from: i + 1, to: i + 1, at: l.at }; out.push(cur); }
    else if (cur && l.type === "lyric") cur.to = i + 1;
  });
  return out;
}

// ---------- tidying pasted text ----------

const chordLine = (line) => {
  const toks = line.trim().split(/\s+/).filter(Boolean);
  return toks.length > 0 && toks.every((t) => isChord(t.replace(/^[|(]+|[|)]+$/g, "")) || /^[|/.\-x\d]+$/.test(t)) && toks.some((t) => isChord(t.replace(/^[|(]+|[|)]+$/g, "")));
};
/** Chords written above the words (by column) merged into the words: "G     C" over "Here comes the" */
export function mergeChordLine(chords, words) {
  const marks = [];
  const re = /\S+/g;
  let m;
  while ((m = re.exec(chords))) { const t = m[0].replace(/^[|(]+|[|)]+$/g, ""); if (isChord(t)) marks.push({ col: m.index + (m[0].length - m[0].replace(/^[|(]+/, "").length), chord: t }); }
  let out = words, shift = 0;
  for (const { col, chord: c } of marks) {
    let p = Math.min(col, words.length);
    // a chord over the middle of a word goes where it was put; past the end of the words it's padded out
    if (col > words.length) { out += " ".repeat(Math.max(0, col - words.length - (out.length - words.length - shift))); p = out.length - shift; }
    const ins = `[${c}]`;
    out = out.slice(0, p + shift) + ins + out.slice(p + shift);
    shift += ins.length;
  }
  return out.replace(/\s+$/, "");
}
/**
 * Quick format: tidy any pasted lyrics into the Songbook's shape.
 * - chords written above the words (Ultimate Guitar, a chord sheet) move into the words
 * - "Verse 1:", "(CHORUS)", "[ch]G[/ch]" and ChordPro {c:} all become [Verse 1] style
 * - stray spaces go, one blank line between sections, smart quotes kept
 */
export function quickFormat(text) {
  let src = String(text ?? "").replace(/\r\n?/g, "\n").replace(/\t/g, "    ").replace(/ /g, " ");
  src = src.replace(/\[ch\](.*?)\[\/ch\]/gi, "$1").replace(/\[\/?tab\]/gi, "");
  const lines = src.split("\n"), out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\s+$/, "");
    const sec = sectionName(line);
    if (sec) { if (out.length && out[out.length - 1] !== "") out.push(""); out.push(`[${sec}]`); continue; }
    if (chordLine(line)) {
      const next = (lines[i + 1] ?? "").replace(/\s+$/, "");
      if (next.trim() && !chordLine(next) && !sectionName(next) && !/^\s*\[[^\]]+\]\s*$/.test(next)) { out.push(mergeChordLine(line, next).replace(/^\s+/, "")); i++; continue; }
      out.push(line.trim().split(/\s+/).map((t) => t.replace(/^[|(]+|[|)]+$/g, "")).filter(isChord).map((t) => `[${t}]`).join(" "));
      continue;
    }
    out.push(line.replace(/^\s+/, "").replace(/ {2,}/g, " "));
  }
  // at most one blank line in a row, none at the ends
  const tidy = [];
  for (const l of out) { if (l === "" && (tidy.length === 0 || tidy[tidy.length - 1] === "")) continue; tidy.push(l); }
  while (tidy.length && tidy[tidy.length - 1] === "") tidy.pop();
  return tidy.join("\n");
}

// ---------- editing ----------

/** Put a chord at a place in the text (moved to the start of the word it lands in) */
export function insertChord(text, at, symbol) {
  let p = Math.max(0, Math.min(text.length, at));
  // inside a [chord] already: replace it
  const open = text.lastIndexOf("[", p), close = text.indexOf("]", open);
  if (open >= 0 && close >= p - 1 && text.lastIndexOf("\n", p) < open && isChord(text.slice(open + 1, close)) && p <= close) return text.slice(0, open) + `[${symbol}]` + text.slice(close + 1);
  while (p > 0 && /[^\s\]\n]/.test(text[p - 1])) p--;
  return text.slice(0, p) + `[${symbol}]` + text.slice(p);
}
/** Take out the chord whose bracket starts at `at` */
export function removeChordAt(text, at) {
  if (text[at] !== "[") return text;
  const close = text.indexOf("]", at);
  return close < 0 ? text : text.slice(0, at) + text.slice(close + 1);
}
/** Every chord in the text, rewritten by fn(symbol) (transposing, respelling) */
export function mapChords(text, fn) {
  return String(text).replace(/\[([^\]\n]+)\]/g, (all, s) => { const c = parseChord(s.trim()); if (!c) return all; const n = fn(c, s.trim()); return n ? `[${n}]` : all; });
}
/** Every chord moved by a number of semitones, spelled for the new key (or sharp/flat when side is 1/-1) */
export function transposeText(text, semis, key = null, side = 0) {
  const to = key ? keyBySemis(key, semis) : null;
  const move = (n, type, root) => {
    const pc = mod12(pcOf(n) + semis);
    return root ? spellRoot(pc, type, to, side) : null;
  };
  return mapChords(text, (c) => {
    const root = move(c.root, c.type, true);
    const bass = c.bass ? spellBass(mod12(pcOf(c.bass) + semis), root, to, side) : null;
    return chordSymbol(chord(root, c.type, bass));
  });
}
/** Every black-key chord as a sharp (1) or flat (-1) name; 0 spells them for the key */
export const respellText = (text, side, key = null) => transposeText(text, 0, key, side);

/**
 * Fill a section's lines with a progression: one chord at the start of each line, or two
 * (the second where the line's words are about halfway), going round the progression.
 */
export function fillSection(text, section, progression, perLine = 1) {
  if (!progression.length) return text;
  const lines = String(text).replace(/\r\n?/g, "\n").split("\n");
  let k = 0;
  for (let i = section.from; i < section.to && i < lines.length; i++) {
    const bare = lines[i].replace(/\[[^\]]*\]/g, (all) => (isChord(all.slice(1, -1)) ? "" : all));
    if (!bare.trim() || /^\s*\[[^\]]+\]\s*$/.test(bare)) continue;
    let line = bare.replace(/^\s+/, "");
    const take = () => progression[k++ % progression.length];
    if (perLine >= 2) {
      const mid = Math.floor(line.length / 2), sp = line.indexOf(" ", mid), at = sp >= 0 ? sp + 1 : -1;
      const a = take(), b = take();
      line = at > 0 ? `[${a}]${line.slice(0, at)}[${b}]${line.slice(at)}` : `[${a}]${line}`;
    } else line = `[${take()}]${line}`;
    lines[i] = line;
  }
  return lines.join("\n");
}

// ---------- keys ----------

/** How a song's chords are written: "shapes" (what you finger with the capo on, the usual way
 *  guitar charts are written, and the default) or "sounding" (the real chords). */
export const writtenAsShapes = (song) => (song?.written || "shapes") === "shapes";
/** Half steps from the chords as written to how they sound: the capo, when they're shapes */
export const soundShift = (song) => (writtenAsShapes(song) ? +song?.capo || 0 : 0);

/** The song's key both ways. `sounding` is the real key (what the Key setting means, and what
 *  fans and other players need); `written` is the key of the chords on the page. With capo 1 and
 *  C G Am F written as shapes, it's written in C and sounds in Db. `set`: the key was chosen, not guessed. */
export function songKeys(song) {
  const shift = soundShift(song);
  const m = /^([A-G][#b]?)(m?)$/.exec(song?.key || "");
  if (m) {
    const sounding = makeKey(m[1], m[2] ? "minor" : "major");
    return { sounding, written: shift ? keyBySemis(sounding, -shift) : sounding, shift, set: true };
  }
  const written = guessKey(chordSequence(song?.body || ""));
  return { written, sounding: written && shift ? keyBySemis(written, shift) : written, shift, set: false };
}

/** The key the chords most likely belong to (null with no chords): symbols as played (chordSequence).
 *  Diatonic fit, plus a pull for home being first, last and often. */
export function guessKey(symbols) {
  const cs = symbols.map((s) => parseChord(s)).filter(Boolean);
  if (!cs.length) return null;
  let best = null, bestScore = -1e9;
  for (const [list, mode] of [[MAJOR_KEYS, "major"], [MINOR_KEYS, "minor"]]) {
    for (const t of list) {
      const key = makeKey(t, mode), pal = keyPalette(key), dia = pal.groups.find((g) => g.id === "diatonic").items, sev = pal.groups.find((g) => g.id === "sevenths").items;
      const fits = (c) => [...dia, ...sev].some((e) => pcOf(e.chord.root) === pcOf(c.root) && sameQuality(e.chord.type, c.type));
      const home = (c) => pcOf(c.root) === pcOf(key.tonic) && (mode === "minor" ? /^m(?!aj)/.test(c.type) : !/^m(?!aj)|dim/.test(c.type));
      let score = cs.reduce((a, c) => a + (fits(c) ? 1 : -0.6), 0) + (home(cs[0]) ? 1.2 : 0) + (home(cs[cs.length - 1]) ? 1.5 : 0) + cs.filter(home).length * 0.3;
      score -= Math.abs(signatureOf(key)) * 0.01; // fewer sharps or flats breaks a tie (C over B#)
      if (score > bestScore) { bestScore = score; best = key; }
    }
  }
  return best;
}
const minorish = (t) => /^m(?!aj)/.test(t) || /dim|m7b5/.test(t);
const sameQuality = (a, b) => minorish(a) === minorish(b) && /dim/.test(a) === /dim/.test(b);
const signatureOf = (key) => { const sharps = { C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, "F#": 6, "C#": 7, F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5, Gb: -6, Cb: -7 };
  const rel = key.mode === "minor" ? noteText(keyBySemis(key, 3).tonic) : noteText(key.tonic); return sharps[rel] ?? 0; };
/** Chords that most often come up in a key: its own seven, then the sevenths and the favorite borrowed ones */
export function likelyChords(key) {
  const pal = keyPalette(key), g = (id) => pal.groups.find((x) => x.id === id)?.items || [];
  const pick = (items, n) => items.slice(0, n).map((e) => ({ symbol: chordSymbol(e.chord), label: e.label, fn: e.fn, why: e.why }));
  return { key: keyName(key), home: pick(g("diatonic"), 8), sevenths: pick(g("sevenths"), 8), borrowed: pick(g("borrowed"), 4), secondary: pick(g("secondary"), 3), relative: pick(g("relative"), 5) };
}
/** What usually comes after this chord in this key, best first */
export function nextChords(key, symbol, limit = 6) {
  const c = parseChord(symbol);
  if (!c || !key) return [];
  return nextMoves(key, c, limit).map((m) => ({ symbol: chordSymbol(m.entry.chord), why: m.why, kind: m.kind }));
}
/** A chord's Roman numeral in a key (for the "I V vi IV" under a progression) */
export function numeral(key, symbol) { const c = parseChord(symbol); return c && key ? numeralOf(key, c) : ""; }

// ---------- writing out ----------

/**
 * Chords above the words, lined up in a monospace font (what Ultimate Guitar and most chord
 * sheets use). Sections as [Verse 1]. chordsOnly lines stay as a row of chords.
 */
export function toChordsAbove(text) {
  const out = [];
  for (const l of parseSong(text)) {
    if (l.type === "blank") { out.push(""); continue; }
    if (l.type === "section") { out.push(`[${l.name}]`); continue; }
    if (l.type === "meta") continue;
    if (l.type === "note") { out.push(`(${l.text})`); continue; }
    let top = "", words = "";
    for (const p of l.parts) {
      if (p.chord) {
        if (top.length > words.length) words = words.padEnd(top.length, p.text ? " " : " ");
        top = top.padEnd(words.length, " ") + p.chord + " ";
      }
      words += p.text;
    }
    top = top.replace(/\s+$/, "");
    if (top) out.push(top);
    if (words.trim()) out.push(words.replace(/\s+$/, ""));
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
/** Just the words */
export function toLyrics(text) {
  return parseSong(text).map((l) => (l.type === "lyric" ? l.parts.map((p) => p.text).join("").replace(/\s+$/, "") : l.type === "section" ? `[${l.name}]` : l.type === "blank" ? "" : null))
    .filter((x) => x !== null).filter((x, i, a) => !(x === "" && a[i - 1] === "")).join("\n").trim();
}
/** Chords in brackets inside the words (the way notes apps and ChordPro do it) */
export const toInline = (text) => parseSong(text).map((l) => (l.type === "lyric" ? l.parts.map((p) => (p.chord ? `[${p.chord}]` : "") + p.text).join("") : l.type === "section" ? `[${l.name}]` : l.type === "note" ? `(${l.text})` : l.type === "blank" ? "" : null)).filter((x) => x !== null).join("\n").trim();
/** A ChordPro file (.cho / .chopro): the details as directives, then the song */
export function toChordPro(song) {
  const d = [["title", song.title], ["artist", song.artist], ["key", song.key], ["capo", song.capo ? String(song.capo) : ""], ["tempo", song.tempo ? String(song.tempo) : ""], ["time", song.time]];
  const head = d.filter(([, v]) => v).map(([k, v]) => `{${k}: ${v}}`);
  const body = parseSong(song.body).map((l) => (l.type === "section" ? `{comment: ${l.name}}` : l.type === "note" ? `{comment_italic: ${l.text}}` : l.type === "blank" ? "" : l.type === "meta" ? null : l.parts.map((p) => (p.chord ? `[${p.chord}]` : "") + p.text).join(""))).filter((x) => x !== null);
  return [...head, "", ...body].join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
/** Ultimate Guitar's own markup: [ch]G[/ch] over the words, inside [tab] blocks, sections as [Verse] */
export function toUltimateGuitar(text) {
  const lines = toChordsAbove(text).split("\n"), out = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l && chordLine(l) && !/^\[[^\]]+\]$/.test(l)) {
      const marked = l.replace(/\S+/g, (t) => (isChord(t) ? `[ch]${t}[/ch]` : t));
      const next = lines[i + 1];
      if (next !== undefined && next.trim() && !chordLine(next) && !/^\[[^\]]+\]$/.test(next)) { out.push("[tab]" + marked, next + "[/tab]"); i++; }
      else out.push(marked);
    } else out.push(l);
  }
  return out.join("\n");
}

// ---------- counting ----------

/** Syllables in a word, by spelling (a good guess; the Words panel has the dictionary) */
export function guessSyllables(word) {
  let w = String(word).toLowerCase().replace(/[^a-z']/g, "");
  if (!w) return 0;
  if (w.length <= 3) return 1;
  w = w.replace(/(?:[^laeiouy]es|[^laeiouy]ed|[^laeiouy]e)$/, "").replace(/^y/, "");
  const groups = w.match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}
export const lineSyllables = (line) => String(line).replace(/\[[^\]]*\]/g, "").split(/[\s\-]+/).reduce((a, w) => a + guessSyllables(w), 0);

// ---------- the library ----------

let seq = 0;
export const newId = (p = "s") => `${p}${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export function newSong(folderId = "", body = "") {
  const meta = songMetaFrom(body);
  return { id: newId("s"), folderId, title: meta.title || "", artist: meta.artist || "", key: meta.key || "", capo: +meta.capo || 0, tempo: +meta.tempo || 0, time: meta.time || "",
    instruments: [], progressions: [], notes: "", body: body ? stripMeta(body) : "", created: Date.now(), updated: Date.now() };
}
/** The song body without the {title:}-style lines (they become the song's details) */
export const stripMeta = (text) => String(text).replace(/\r\n?/g, "\n").split("\n").filter((l) => !/^\s*\{\s*(t|title|st|subtitle|artist|key|capo|tempo|time|album|year|composer|lyricist)\s*:/i.test(l)).join("\n").replace(/^\n+/, "");
/** A title from the first words when the song has none yet */
export function titleOf(song) {
  if (song.title) return song.title;
  const first = toLyrics(song.body).split("\n").find((l) => l.trim() && !/^\[.*\]$/.test(l));
  return first ? first.split(/\s+/).slice(0, 6).join(" ") + (first.split(/\s+/).length > 6 ? "..." : "") : "Untitled song";
}
