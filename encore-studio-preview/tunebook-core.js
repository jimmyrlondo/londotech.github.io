// ENCORE. Tune Book: the pure logic (no DOM, no Web Audio), so Node can test it.
// ABC headers, multi-tune files (split, join, renumber), the library (search, tags, sets),
// tune types and tempos, parts (A/B) found in the ABC text, the playback timeline built from
// abcjs's note events (swing, click grid, loops, practice speed-up), and a transposition wrapper
// around abcjs's strTranspose. abcjs itself is passed in where it's needed (the page loads it
// from vendor/abcjs-basic-min.js; the tests load the same file).

// ---------- tune types ----------
/** The tune types people browse by, with a default tempo (beats per minute of the tune's own beat) */
export const TYPES = [
  { id: "reel", name: "Reel", bpm: 200, meter: "4/4" },
  { id: "jig", name: "Jig", bpm: 110, meter: "6/8" },
  { id: "slip jig", name: "Slip jig", bpm: 110, meter: "9/8" },
  { id: "polka", name: "Polka", bpm: 120, meter: "2/4" },
  { id: "slide", name: "Slide", bpm: 120, meter: "12/8" },
  { id: "hornpipe", name: "Hornpipe", bpm: 150, meter: "4/4" },
  { id: "waltz", name: "Waltz", bpm: 120, meter: "3/4" },
  { id: "mazurka", name: "Mazurka", bpm: 120, meter: "3/4" },
  { id: "march", name: "March", bpm: 100, meter: "2/4" },
  { id: "barndance", name: "Barndance", bpm: 160, meter: "4/4" },
  { id: "schottische", name: "Schottische", bpm: 140, meter: "4/4" },
  { id: "strathspey", name: "Strathspey", bpm: 120, meter: "4/4" },
  { id: "two-step", name: "Two-step", bpm: 110, meter: "2/4" },
  { id: "breakdown", name: "Breakdown", bpm: 110, meter: "2/2" },
  { id: "song", name: "Song or air", bpm: 80, meter: "3/4" },
  { id: "other", name: "Other", bpm: 120, meter: "4/4" },
];
const TYPE_ALIASES = { "single jig": "jig", "double jig": "jig", "set dance": "other", air: "song", "slow air": "song", polska: "other", "old-time": "reel", "old time": "reel",
  "fling": "schottische", "highland": "schottische", "barn dance": "barndance", "slipjig": "slip jig", "valse": "waltz", "vals": "waltz", "polkka": "polka", "polca": "polka" };
export const typeById = (id) => TYPES.find((t) => t.id === id) || TYPES[TYPES.length - 1];

/** The tune type from an R: field, or a guess from the meter */
export function tuneType(rhythm = "", meter = "") {
  const r = String(rhythm).toLowerCase().trim();
  if (r) {
    if (TYPES.some((t) => t.id === r)) return r;
    if (TYPE_ALIASES[r]) return TYPE_ALIASES[r];
    const hit = TYPES.find((t) => r.includes(t.id)) || Object.entries(TYPE_ALIASES).find(([k]) => r.includes(k));
    if (hit) return hit.id || hit[1];
  }
  const m = String(meter).replace(/\s/g, "");
  if (m === "6/8") return "jig";
  if (m === "9/8") return "slip jig";
  if (m === "12/8") return "slide";
  if (m === "2/4") return "polka";
  if (m === "3/4" || m === "3/8") return "waltz";
  if (m === "4/4" || m === "C" || m === "C|" || m === "2/2") return "reel";
  return "other";
}

// ---------- ABC headers ----------
const FIELD = /^([A-Za-z]):\s?(.*)$/;
/** The header of one tune: { x, titles, title, key, meter, length, rhythm, composer, origin, tempo, notes, tags, type } */
export function parseHeader(abc = "") {
  const h = { x: null, titles: [], title: "", key: "", meter: "", length: "", rhythm: "", composer: "", origin: "", tempo: "", notes: "", tags: [] };
  for (const raw of String(abc).split(/\r?\n/)) {
    const line = raw.trim();
    const tg = /^%\s*tags?:\s*(.*)$/i.exec(line);
    if (tg) { h.tags.push(...splitTags(tg[1])); continue; }
    const m = FIELD.exec(line);
    if (!m) continue;
    const [, f, v] = m, val = v.replace(/%.*$/, "").trim();
    if (f === "X") h.x = parseInt(val, 10) || null;
    else if (f === "T") { if (val) h.titles.push(val); }
    else if (f === "M" && !h.meter) h.meter = val;
    else if (f === "L" && !h.length) h.length = val;
    else if (f === "R" && !h.rhythm) h.rhythm = val;
    else if (f === "C" && !h.composer) h.composer = val;
    else if (f === "O" && !h.origin) h.origin = val;
    else if (f === "Q" && !h.tempo) h.tempo = val;
    else if (f === "N") h.notes = h.notes ? h.notes + " " + val : val;
    else if (f === "K") { h.key = val; break; } // the body starts after the first K:
  }
  h.title = h.titles[0] || "Untitled";
  h.type = tuneType(h.rhythm, h.meter);
  return h;
}
/** "polka, Session  tunes" -> ["polka", "session tunes"] (lower case, trimmed, no duplicates) */
export function splitTags(s = "") {
  const out = [];
  for (const t of String(s).split(/[,;#]/)) { const v = t.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 32); if (v && !out.includes(v)) out.push(v); }
  return out;
}
/** A Q: field as beats per minute of the tune's own beat, or null. "1/4=120" in 6/8 -> 80 (dotted quarter) */
export function tempoFromQ(q = "", meter = "4/4") {
  const s = String(q).replace(/"[^"]*"/g, "").trim();
  if (!s) return null;
  const m = /^((?:\d+\/\d+\s*)+)=\s*(\d+(?:\.\d+)?)/.exec(s);
  let len, bpm;
  if (m) { len = m[1].trim().split(/\s+/).reduce((a, f) => { const [n, d] = f.split("/").map(Number); return a + n / d; }, 0); bpm = +m[2]; }
  else if (/^\d+(\.\d+)?$/.test(s)) { len = 1 / 4; bpm = +s; }
  else return null;
  if (!(bpm > 0) || !(len > 0)) return null;
  return Math.round((bpm * len) / beatOf(meter));
}
/** Change one header field (or add it before K:) */
export function setField(abc, field, value) {
  const lines = String(abc).split(/\r?\n/);
  const re = new RegExp("^" + field + ":");
  const kAt = lines.findIndex((l) => /^K:/.test(l.trim()));
  const at = lines.findIndex((l, i) => (kAt < 0 || i < kAt) && re.test(l.trim()));
  if (value === null || value === undefined || value === "") { if (at >= 0) lines.splice(at, 1); return lines.join("\n"); }
  const line = `${field}:${value}`;
  if (at >= 0) lines[at] = line;
  else if (field === "X") lines.unshift(line);
  else if (kAt >= 0) lines.splice(kAt, 0, line);
  else lines.splice(1, 0, line);
  return lines.join("\n");
}
/** The tags comment line in a tune's text (written on export so tags survive a round trip) */
export function withTags(abc, tags = []) {
  const lines = String(abc).split(/\r?\n/).filter((l) => !/^%\s*tags?:/i.test(l.trim()));
  if (tags.length) { const k = lines.findIndex((l) => /^K:/.test(l.trim())); lines.splice(k >= 0 ? k : lines.length, 0, "% tags: " + tags.join(", ")); }
  return lines.join("\n");
}
/** Is this text plausibly ABC (has a K: line or notes after a header)? */
export const looksLikeAbc = (s = "") => /^\s*K:/m.test(s) || /^\s*X:/m.test(s);

// ---------- multi-tune files ----------
/**
 * Split an .abc file into tunes. -> { header: [lines before the first X:, comments kept], tunes: [text], sets: [{ name, from, count }] }.
 * The file header (fields and %% directives above the first tune) applies to every tune, so it's copied into each one
 * just after its X: line (unless the tune sets that field itself). A file with no X: at all but a K: is one tune.
 * "% set: Name" comments (what Tune Book writes) mark the tunes that follow as a set.
 */
export function splitAbcFile(text = "") {
  const src = String(text).replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const lines = src.split("\n");
  const first = lines.findIndex((l) => /^X:/.test(l));
  if (first < 0) return { header: [], tunes: looksLikeAbc(src) && src.trim() ? [src.trim()] : [], sets: [] };
  const header = lines.slice(0, first);
  const headerFields = header.filter((l) => /^([A-Za-z]:|%%)/.test(l) && !/^[XTK]:/.test(l));
  const tunes = [], sets = [];
  let cur = null, pendingSet = null;
  const collectSets = (ls) => { for (const l of ls) { const m = /^%\s*set:\s*(.+)$/i.exec(l.trim()); if (m) pendingSet = { name: m[1].trim(), from: -1, count: 0 }; } };
  collectSets(header);
  const flush = () => {
    if (!cur) return;
    // trailing blank and free-text lines between tunes belong to nobody; set markers start a set
    while (cur.length && !cur[cur.length - 1].trim()) cur.pop();
    const tail = [];
    while (cur.length > 1 && /^%\s*set:/i.test(cur[cur.length - 1].trim())) tail.unshift(cur.pop());
    while (cur.length && !cur[cur.length - 1].trim()) cur.pop();
    const own = new Set(cur.filter((l) => FIELD.test(l)).map((l) => l[0]));
    const extra = headerFields.filter((l) => l.startsWith("%%") || !own.has(l[0]));
    const t = [cur[0], ...extra, ...cur.slice(1)].join("\n").trim();
    if (pendingSet && pendingSet.from < 0) { pendingSet.from = tunes.length; sets.push(pendingSet); }
    if (pendingSet) pendingSet.count++;
    tunes.push(t);
    cur = null;
    collectSets(tail);
  };
  for (let i = first; i < lines.length; i++) {
    const l = lines[i];
    if (/^X:/.test(l)) { flush(); cur = [l]; continue; }
    if (!cur) { collectSets([l]); continue; }
    // a blank line ends a tune (the standard); anything after it until the next X: is free text
    if (!l.trim()) { cur.ended = true; cur.push(l); continue; }
    if (cur.ended) { if (/^%\s*set:/i.test(l.trim())) { flush(); collectSets([l]); } else if (/^%\s*end set/i.test(l.trim())) { flush(); pendingSet = null; } continue; }
    if (/^%\s*end set/i.test(l.trim())) { flush(); pendingSet = null; continue; }
    cur.push(l);
  }
  flush();
  return { header, tunes, sets: sets.filter((s) => s.count > 0) };
}
/** Put X:n at the top of a tune (replacing any X: line) */
export function setX(abc, n) {
  const lines = String(abc).replace(/\r\n?/g, "\n").trim().split("\n");
  const at = lines.findIndex((l) => /^X:/.test(l));
  if (at >= 0) lines.splice(at, 1);
  return [`X:${n}`, ...lines].join("\n");
}
/** Tunes into one .abc file, numbered X:1..N, a blank line between. opts: { title (a comment at the top), sets: [{ name, start, count }] } */
export function joinAbcFile(tunes, opts = {}) {
  const out = ["%abc-2.1"];
  if (opts.title) out.push(`% ${opts.title}`);
  out.push("% Made with ENCORE. Tune Book", "");
  const marks = new Map((opts.sets || []).map((s) => [s.start, s]));
  const ends = new Set((opts.sets || []).map((s) => s.start + s.count));
  tunes.forEach((t, i) => {
    if (ends.has(i)) out.push("% end set", "");
    if (marks.has(i)) out.push(`% set: ${marks.get(i).name}`, "");
    out.push(setX(t, i + 1), "");
  });
  if (ends.has(tunes.length)) out.push("% end set", "");
  return out.join("\n");
}
/** A tune's music without X:, comments or spacing, for spotting a tune that's already in the book */
export function fingerprint(abc = "") {
  return String(abc).replace(/\r/g, "").split("\n").filter((l) => !/^\s*(X:|%)/.test(l)).join("\n").replace(/\s+/g, "").toLowerCase();
}
/** A safe file name from a title */
export const fileName = (title = "tune", ext = "abc") => (String(title).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9 _-]+/g, "").trim().replace(/\s+/g, "_").slice(0, 60) || "tune") + "." + ext;

// ---------- the library ----------
let idSeq = 0;
export const newId = () => Date.now().toString(36) + "-" + (idSeq++).toString(36) + Math.random().toString(36).slice(2, 6);

/** An empty library */
export const emptyLibrary = () => ({ v: 1, tunes: [], sets: [] });
/** A tune record from ABC text */
export function makeTune(abc, opts = {}) {
  const h = parseHeader(abc);
  const tags = splitTags([...(opts.tags || []), ...h.tags].join(","));
  const now = opts.now ?? Date.now();
  return { id: opts.id || newId(), abc: withTags(String(abc).trim(), []), tags, transpose: opts.transpose | 0, bpm: opts.bpm || null, added: now, updated: now };
}
/** Add a tune (returns the record) */
export function addTune(lib, abc, opts = {}) { const t = makeTune(abc, opts); lib.tunes.push(t); return t; }
export const getTune = (lib, id) => lib.tunes.find((t) => t.id === id) || null;
/** Change a tune's fields: { abc, tags, transpose, bpm } */
export function updateTune(lib, id, patch = {}) {
  const t = getTune(lib, id);
  if (!t) return null;
  if (patch.abc !== undefined) t.abc = String(patch.abc);
  if (patch.tags !== undefined) t.tags = splitTags(Array.isArray(patch.tags) ? patch.tags.join(",") : patch.tags);
  if (patch.transpose !== undefined) t.transpose = clampInt(patch.transpose, -12, 12);
  if (patch.bpm !== undefined) t.bpm = patch.bpm ? clampInt(patch.bpm, 20, 400) : null;
  t.updated = patch.now ?? Date.now();
  return t;
}
/** Remove a tune (and take it out of every set) */
export function removeTune(lib, id) {
  const n = lib.tunes.length;
  lib.tunes = lib.tunes.filter((t) => t.id !== id);
  for (const s of lib.sets) s.ids = s.ids.filter((x) => x !== id);
  return lib.tunes.length < n;
}
/** A tune already in the book with the same music, or null */
export function findDuplicate(lib, abc) { const f = fingerprint(abc); return lib.tunes.find((t) => fingerprint(t.abc) === f) || null; }
/** Every tag in the book with its count, most used first */
export function allTags(lib) {
  const c = new Map();
  for (const t of lib.tunes) for (const g of t.tags) c.set(g, (c.get(g) || 0) + 1);
  return [...c].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([tag, count]) => ({ tag, count }));
}
/** How many tunes of each type */
export function typeCounts(lib) {
  const c = {};
  for (const t of lib.tunes) { const ty = parseHeader(t.abc).type; c[ty] = (c[ty] || 0) + 1; }
  return c;
}

// search: words match anywhere (title, other titles, type, key, tags, composer, origin), all words must match
export const norm = (s = "") => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/['\u2019`]/g, "").replace(/[^a-z0-9#/ ]+/g, " ").replace(/\s+/g, " ").trim();
const noThe = (s) => s.replace(/^(the|an|a) /, "");
/**
 * Search the library. query: free words (all must match); filters: { type, tag }.
 * Returns tune records, best first (title matches before other matches, then alphabetical).
 */
export function search(lib, query = "", filters = {}) {
  let words = norm(query).split(" ").filter(Boolean);
  if (words.some((w) => !["the", "a", "an"].includes(w))) words = words.filter((w) => !["the", "a", "an"].includes(w));
  const out = [];
  for (const t of lib.tunes) {
    const h = parseHeader(t.abc);
    if (filters.type && h.type !== filters.type) continue;
    if (filters.tag && !t.tags.includes(filters.tag)) continue;
    const titles = h.titles.map((x) => noThe(norm(x)));
    const hay = [titles.join(" "), h.type, typeById(h.type).name.toLowerCase(), norm(h.key), "key " + norm(h.key).split(" ")[0], t.tags.join(" "), norm(h.composer), norm(h.origin), norm(h.rhythm), norm(h.notes)].join(" | ");
    let score = 0, ok = true;
    for (const w of words) {
      const ww = w;
      if (titles.some((x) => x === ww)) score += 100;
      else if (titles.some((x) => x.startsWith(ww))) score += 50;
      else if (titles.some((x) => x.split(" ").some((p) => p.startsWith(ww)))) score += 25;
      else if (hay.includes(ww)) score += 5;
      else { ok = false; break; }
    }
    if (ok) out.push({ t, score, title: titles[0] || "" });
  }
  out.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  return out.map((o) => o.t);
}

// ---------- sets ----------
/** A new set: { id, name, ids, times (times through each tune) } */
export function addSet(lib, name = "New set", ids = [], opts = {}) {
  const s = { id: opts.id || newId(), name: String(name).trim().slice(0, 80) || "New set", ids: ids.filter((id) => getTune(lib, id)), times: clampInt(opts.times ?? 2, 1, 8) };
  lib.sets.push(s);
  return s;
}
export const getSet = (lib, id) => lib.sets.find((s) => s.id === id) || null;
export function removeSet(lib, id) { const n = lib.sets.length; lib.sets = lib.sets.filter((s) => s.id !== id); return lib.sets.length < n; }
/** Add a tune at the end of a set (a tune can be in a set once) */
export function addToSet(lib, setId, tuneId) {
  const s = getSet(lib, setId);
  if (!s || !getTune(lib, tuneId) || s.ids.includes(tuneId)) return false;
  s.ids.push(tuneId);
  return true;
}
/** Take the tune at position i out of a set */
export function removeFromSet(lib, setId, i) { const s = getSet(lib, setId); if (!s || i < 0 || i >= s.ids.length) return false; s.ids.splice(i, 1); return true; }
/** Move the tune at position from to position to */
export function moveInSet(lib, setId, from, to) {
  const s = getSet(lib, setId);
  if (!s || from < 0 || from >= s.ids.length) return false;
  const t = Math.max(0, Math.min(s.ids.length - 1, to));
  const [id] = s.ids.splice(from, 1);
  s.ids.splice(t, 0, id);
  return true;
}
/** The tune records of a set, in order */
export const setTunes = (lib, set) => (set ? set.ids.map((id) => getTune(lib, id)).filter(Boolean) : []);
/** A set's name from its tunes ("Egan's / John Ryan's") */
export const setNameFrom = (tunes) => tunes.map((t) => parseHeader(t.abc).title.replace(/\s+(polka|reel|jig|hornpipe|waltz)$/i, "")).join(" / ").slice(0, 80) || "New set";

// ---------- import / export ----------
/**
 * Import an .abc file's text into the library. Tunes already in the book (same music) are skipped.
 * Sets marked in the file become sets (unless the same set is already there). -> { added, skipped: [titles], sets: [new set records], sameSets }
 */
export function importAbc(lib, text, opts = {}) {
  const { tunes, sets } = splitAbcFile(text);
  const added = [], skipped = [], byIndex = [];
  for (const abc of tunes) {
    if (!/^\s*K:/m.test(abc)) { skipped.push(parseHeader(abc).title); byIndex.push(null); continue; }
    const dup = findDuplicate(lib, abc);
    if (dup) { skipped.push(parseHeader(abc).title); byIndex.push(dup.id); continue; }
    const r = addTune(lib, abc, { tags: opts.tags || [] });
    added.push(r); byIndex.push(r.id);
  }
  // a set that's already in the book (same name, same tunes in the same order) isn't made twice
  const madeSets = [], sameSets = [];
  for (const s of sets) {
    const ids = byIndex.slice(s.from, s.from + s.count).filter(Boolean);
    const same = lib.sets.find((x) => x.name === s.name && x.ids.join() === ids.join());
    if (same) sameSets.push(same); else madeSets.push(addSet(lib, s.name, ids));
  }
  return { added, skipped, sets: madeSets, sameSets };
}
/** The text of tunes ready to save as .abc (tags written as a comment so they come back on import) */
export function exportTunes(lib, ids, opts = {}) {
  const ts = ids.map((id) => getTune(lib, id)).filter(Boolean);
  return joinAbcFile(ts.map((t) => withTags(t.abc, t.tags)), opts);
}
export function exportSet(lib, setId) {
  const s = getSet(lib, setId);
  if (!s) return "";
  return exportTunes(lib, s.ids, { title: s.name, sets: [{ name: s.name, start: 0, count: s.ids.filter((id) => getTune(lib, id)).length }] });
}
/** The whole book: every tune, then each set's tunes are marked as sets by reference in a comment block */
export function exportLibrary(lib, title = "My tune book") {
  const ids = lib.tunes.map((t) => t.id);
  let text = exportTunes(lib, ids, { title });
  // sets as their own marked blocks at the end would duplicate tunes; list them as comments instead
  if (lib.sets.length) {
    const lines = ["% Sets in this book:"];
    for (const s of lib.sets) lines.push(`% ${s.name}: ${setTunes(lib, s).map((t) => parseHeader(t.abc).title).join(", ")}`);
    text += lines.join("\n") + "\n";
  }
  return text;
}

// ---------- saving ----------
/** The library as JSON */
export const serialize = (lib) => JSON.stringify({ v: 1, tunes: lib.tunes, sets: lib.sets });
/** A library from saved JSON (bad or missing data gives an empty one; broken records are dropped) */
export function deserialize(json) {
  let o;
  try { o = typeof json === "string" ? JSON.parse(json) : json; } catch { return emptyLibrary(); }
  if (!o || typeof o !== "object" || !Array.isArray(o.tunes)) return emptyLibrary();
  const lib = emptyLibrary();
  for (const t of o.tunes) {
    if (!t || typeof t.abc !== "string" || typeof t.id !== "string") continue;
    lib.tunes.push({ id: t.id, abc: t.abc, tags: Array.isArray(t.tags) ? splitTags(t.tags.join(",")) : [], transpose: clampInt(t.transpose || 0, -12, 12), bpm: t.bpm ? clampInt(t.bpm, 20, 400) : null, added: +t.added || 0, updated: +t.updated || 0 });
  }
  for (const s of Array.isArray(o.sets) ? o.sets : []) {
    if (!s || typeof s.id !== "string" || !Array.isArray(s.ids)) continue;
    lib.sets.push({ id: s.id, name: String(s.name || "Set").slice(0, 80), ids: s.ids.filter((id) => lib.tunes.some((t) => t.id === id)), times: clampInt(s.times ?? 2, 1, 8) });
  }
  return lib;
}

// ---------- transposition ----------
const MAJOR_NAMES = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const MINOR_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"];
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const MODE_OFFSET = { maj: 0, ion: 0, mix: 5, dor: 10, m: 9, min: 9, aeo: 9, phr: 8, lyd: 7, loc: 1 };
/** Parse a K: value: { root: 0..11, name, mode: "maj"|"m"|"dor"|..., rest } or null (K:none, K:HP and so on) */
export function parseKey(k = "") {
  const m = /^\s*([A-Ga-g])([#b]?)\s*(maj(?:or)?|ion(?:ian)?|mix(?:olydian)?|dor(?:ian)?|phr(?:ygian)?|lyd(?:ian)?|loc(?:rian)?|aeo(?:lian)?|min(?:or)?|m)?(.*)$/i.exec(k);
  if (!m) return null;
  const root = (PC[m[1].toUpperCase()] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0) + 12) % 12;
  let mode = (m[3] || "maj").toLowerCase();
  mode = mode === "m" || mode.startsWith("min") ? "m" : mode.slice(0, 3);
  if (mode === "aeo") mode = "m";
  if (mode === "ion") mode = "maj";
  return { root, name: m[1].toUpperCase() + (m[2] || ""), mode, rest: m[4] || "" };
}
/** A key moved by some semitones, for labels: keyAfter("Ador", 2) -> "Bdor", keyAfter("D", 1) -> "Eb" */
export function keyAfter(k, steps) {
  const p = parseKey(k);
  if (!p) return k;
  const root = (((p.root + steps) % 12) + 12) % 12;
  // spell by the key signature it would have: majors and modes by their parent major, minors by the minor list
  const parent = (root + 12 - (MODE_OFFSET[p.mode] || 0)) % 12;
  const flatParent = [1, 3, 5, 8, 10].includes(parent);
  const sharpNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"], flatNames = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
  let name = p.mode === "maj" ? MAJOR_NAMES[root] : p.mode === "m" ? MINOR_NAMES[root] : (flatParent ? flatNames : sharpNames)[root];
  if (p.mode === "m" && parent === 3) name = flatNames[root]; // relative of E-flat major (C minor) etc.
  return name + (p.mode === "maj" ? "" : p.mode);
}
/** Quick transpositions: who reads the tune where */
export const READ_AS = [
  { id: "concert", name: "As written", steps: 0 },
  { id: "bb", name: "B-flat instrument (clarinet, trumpet, tenor sax)", steps: 2 },
  { id: "eb", name: "E-flat instrument (alto sax)", steps: -3 },
  { id: "f", name: "F instrument (horn)", steps: 7 },
];
/** Keep a transposition in -12..12 */
export const clampSteps = (n) => clampInt(n, -12, 12);
/**
 * Transpose one tune's ABC text with abcjs (notes, key signature and chord symbols all move).
 * A: the abcjs module. -> { abc, steps, ok, error }. Zero steps, or text abcjs can't parse, gives the text back unchanged.
 */
export function transposeAbc(A, abc, steps) {
  const s = clampSteps(steps);
  if (!s) return { abc, steps: 0, ok: true };
  try {
    const tunes = A.parseOnly(abc);
    if (!tunes.length) return { abc, steps: 0, ok: false, error: "no tune found" };
    let out = A.strTranspose(abc, tunes, s);
    if (typeof out !== "string" || !out.trim()) return { abc, steps: 0, ok: false, error: "transpose failed" };
    // abcjs leaves K: lines it can't move (K:none, K:HP) alone, which is right
    return { abc: out, steps: s, ok: true };
  } catch (e) {
    return { abc, steps: 0, ok: false, error: String(e && e.message || e) };
  }
}

// ---------- timing ----------
/** [num, den] of a meter; C = 4/4, C| = 2/2; free meter = 4/4 */
export function meterFraction(meter = "4/4") {
  const m = String(meter).replace(/\s/g, "");
  if (m === "C") return [4, 4];
  if (m === "C|") return [2, 2];
  const f = /^(\d+)(?:\+\d+)*\/(\d+)$/.exec(m);
  if (!f) return [4, 4];
  const num = m.split("/")[0].split("+").reduce((a, x) => a + (+x), 0);
  return [num, +f[2]];
}
/** The tune's beat as a fraction of a whole note: dotted quarter in 6/8, 9/8, 12/8; half in 2/2; else 1/den */
export function beatOf(meter = "4/4") {
  const [n, d] = meterFraction(meter);
  if (d === 8 && n % 3 === 0 && n > 3) return 3 / 8;
  if (d === 2) return 1 / 2;
  return 1 / d;
}
export const barOf = (meter) => { const [n, d] = meterFraction(meter); return n / d; };
/** Seconds per whole note at bpm beats per minute */
export const secondsPerWhole = (bpm, meter) => 60 / Math.max(1, bpm) / beatOf(meter);
/** A tune's starting tempo: its own saved tempo, its Q: field, or its type's default */
export function defaultBpm(tune) {
  if (tune && tune.bpm) return tune.bpm;
  const h = parseHeader(tune ? tune.abc : "");
  return tempoFromQ(h.tempo, h.meter || "4/4") || typeById(h.type).bpm;
}
/** Swing is for tunes counted in quarter notes (hornpipes, polkas, schottisches); never for jigs */
export const swingFits = (meter) => { const b = beatOf(meter); return b === 1 / 4 || b === 1 / 2; };

/**
 * The playback timeline from abcjs's setUpAudio() result, in whole notes:
 * [{ w (start), dw (length), midi, vel (1..127), track: "melody"|"bass"|"chord", c0, c1 (source characters, melody only) }],
 * sorted by start. Notes from the abc carry character positions; the chord accompaniment abcjs makes from "G" symbols doesn't,
 * and is split into bass (one note on the beat) and chord (the notes struck together).
 */
export function timelineFrom(audio) {
  const out = [];
  for (const tr of (audio && audio.tracks) || []) {
    const notes = tr.filter((e) => e.cmd === "note" && e.pitch >= 0);
    const counts = new Map();
    for (const n of notes) if (n.startChar === undefined) { const k = n.start.toFixed(6); counts.set(k, (counts.get(k) || 0) + 1); }
    for (const n of notes) {
      const melody = n.startChar !== undefined;
      out.push({ w: n.start, dw: Math.max(0.001, n.duration - (n.gap || 0)), midi: n.pitch, vel: Math.max(1, Math.min(127, n.volume ?? 90)),
        track: melody ? "melody" : counts.get(n.start.toFixed(6)) > 1 ? "chord" : "bass", c0: melody ? n.startChar : -1, c1: melody ? n.endChar : -1 });
    }
  }
  out.sort((a, b) => a.w - b.w || (a.track === "melody" ? -1 : 1));
  return out;
}
/** Total length of a timeline in whole notes */
export const timelineLength = (tl) => tl.reduce((m, e) => Math.max(m, e.w + e.dw), 0);
/** The melody's end (where the tune is over, ignoring a chord tail) */
export const melodyEnd = (tl) => tl.filter((e) => e.track === "melody").reduce((m, e) => Math.max(m, e.w + e.dw), 0);

/**
 * Swing: inside each beat-half pair, the first note gets longer. amount 0 (straight) .. 1 (full dotted, 3:1).
 * Times are whole notes; grid starts at `origin` (the first full bar). Returns the warped time.
 */
export function swingWarp(w, amount, unit = 1 / 4, origin = 0) {
  if (!amount) return w;
  const s = 0.5 + 0.25 * Math.max(0, Math.min(1, amount)); // where the off-beat lands: 0.5 straight, 0.75 = dotted
  const rel = w - origin, k = Math.floor(rel / unit + 1e-9), p = rel / unit - k;
  const q = p < 0.5 ? (p / 0.5) * s : s + ((p - 0.5) / 0.5) * (1 - s);
  return origin + (k + q) * unit;
}
/** A timeline with swing applied (starts and lengths) */
export function applySwing(tl, amount, unit = 1 / 4, origin = 0) {
  if (!amount) return tl;
  return tl.map((e) => { const a = swingWarp(e.w, amount, unit, origin), b = swingWarp(e.w + e.dw, amount, unit, origin); return { ...e, w: a, dw: Math.max(0.001, b - a) }; });
}
/** The click: [{ w, accent }] every beat from 0 to len, lined up with the bars (pickup = length of the opening partial bar) */
export function beatGrid(len, meter, pickup = 0) {
  const beat = beatOf(meter), bar = barOf(meter), out = [];
  const startK = -Math.floor(pickup / beat + 1e-9);
  for (let k = startK; ; k++) {
    const w = pickup + k * beat;
    if (w >= len - 1e-9) break;
    if (w < -1e-9) continue;
    const inBar = (((k * beat) % bar) + bar) % bar;
    out.push({ w: Math.max(0, w), accent: inBar < 1e-6 || bar - inBar < 1e-6 });
  }
  return out;
}
/**
 * The opening partial bar's length in whole notes (0 if the tune starts on a full bar): how far the melody has got
 * when it reaches the first bar line that comes after a note. Works for pickups inside a repeat (|:AF|DAFA...) too.
 */
export function pickupLength(tl, meter, abc = "") {
  const bar = barOf(meter);
  const mel = tl.filter((e) => e.track === "melody");
  if (!mel.length) return 0;
  const at = firstBarAfterNote(abc);
  if (at < 0) return 0;
  const next = mel.find((e) => e.c0 > at);
  if (!next) return 0;
  const w = next.w;
  return w > 1e-6 && bar - w > 1e-6 ? w : 0;
}
/** Character position of the first bar line that follows a note in the tune body (-1 if none) */
export function firstBarAfterNote(abc = "") {
  const s = String(abc);
  let body = 0, pos = 0;
  for (const l of s.split("\n")) { if (/^\s*K:/.test(l)) { body = pos + l.length + 1; break; } pos += l.length + 1; }
  let seen = false;
  for (let i = body; i < s.length; i++) {
    const ch = s[i];
    const lineStart = s[i - 1] === "\n";
    if (lineStart && /^[A-Za-z]:/.test(s.slice(i, i + 2))) { const e = s.indexOf("\n", i); if (e < 0) return -1; i = e; continue; }
    if (ch === "%") { const e = s.indexOf("\n", i); if (e < 0) return -1; i = e; continue; }
    if (ch === '"' || ch === "!" || ch === "{") { const e = s.indexOf(ch === "{" ? "}" : ch, i + 1); if (e < 0) return -1; i = e; continue; }
    if (ch === "[" && /^\[[A-Za-z]:/.test(s.slice(i, i + 3))) { const e = s.indexOf("]", i); if (e < 0) return -1; i = e; continue; }
    if (/[A-Ga-g]/.test(ch)) seen = true;
    else if (ch === "|" && seen) return i;
  }
  return -1;
}
/** Events between w0 and w1, moved to start at 0 (notes running past w1 are cut there) */
export function sliceTimeline(tl, w0, w1) {
  const out = [];
  for (const e of tl) {
    if (e.w < w0 - 1e-9 || e.w >= w1 - 1e-9) continue;
    out.push({ ...e, w: e.w - w0, dw: Math.min(e.dw, w1 - e.w) });
  }
  return out;
}

// ---------- parts and selections ----------
/**
 * The parts of a tune (A, B, C...) as character ranges of its ABC text: [{ label, c0, c1 }].
 * A part runs from a start repeat (or the start) to an end repeat, double bar or final bar; first and second endings
 * stay in their part, and a pickup before the first bar joins the part it leads into. A tune with no sections is one part.
 */
export function partsOf(abc = "") {
  const s = String(abc);
  const lines = s.split("\n");
  // where the body starts: the line after the first K:
  let pos = 0, body = 0;
  for (const l of lines) { if (/^\s*K:/.test(l)) { body = pos + l.length + 1; break; } pos += l.length + 1; }
  const parts = [];
  let cur = { c0: body, notes: false, bars: 0 };
  const close = (at) => { if (cur.notes) parts.push({ c0: cur.c0, c1: at }); cur = { c0: at, notes: false, bars: 0 }; };
  let i = body;
  const n = s.length;
  while (i < n) {
    const ch = s[i];
    const lineStart = i === 0 || s[i - 1] === "\n";
    if (lineStart && /^[A-Za-z]:/.test(s.slice(i, i + 2)) && !/^[|:]/.test(ch)) { const e = s.indexOf("\n", i); i = e < 0 ? n : e + 1; continue; } // a field line in the body
    if (ch === "%") { const e = s.indexOf("\n", i); i = e < 0 ? n : e + 1; continue; }
    if (ch === '"') { const e = s.indexOf('"', i + 1); i = e < 0 ? n : e + 1; continue; }
    if (ch === "!") { const e = s.indexOf("!", i + 1); const nl = s.indexOf("\n", i + 1); i = e < 0 || (nl >= 0 && nl < e) ? i + 1 : e + 1; continue; }
    if (ch === "[" && /^\[[A-Za-z]:/.test(s.slice(i, i + 3))) { const e = s.indexOf("]", i); i = e < 0 ? n : e + 1; continue; }
    if (ch === "{") { const e = s.indexOf("}", i); i = e < 0 ? n : e + 1; continue; } // grace notes don't start a part
    // bar lines
    const m = /^(:*\|+\]?:*|:*\[\|:*|::+)/.exec(s.slice(i, i + 6));
    if (m && (ch === "|" || ch === ":" || (ch === "[" && s[i + 1] === "|"))) {
      const tok = m[1];
      const endRep = tok.startsWith(":"), startRep = tok.endsWith(":") && tok.length > 1, final = /\|\]|\|\||\[\|/.test(tok);
      const after = s.slice(i + tok.length).replace(/^[ \t]*/, "");
      const ending = /^\[?\d/.test(after);
      if (endRep && startRep) { close(i + tok.length - (tok.match(/:+$/)[0].length)); i += tok.length; continue; }
      if (startRep) {
        // a pickup on its own (no bar yet) joins the part it leads into
        if (cur.notes && cur.bars > 0) close(i);
        i += tok.length; continue;
      }
      if ((endRep || final) && !ending) { cur.bars++; close(i + tok.length); i += tok.length; continue; }
      cur.bars++;
      i += tok.length;
      continue;
    }
    if (/[A-Ga-g]/.test(ch)) cur.notes = true;
    i++;
  }
  close(n);
  // a trailing part with only a bar or two of leftovers after the last section stays its own part; label them
  return parts.map((p, k) => ({ label: String.fromCharCode(65 + Math.min(k, 25)), c0: p.c0, c1: p.c1 }));
}
/**
 * The span of time (whole notes) the melody notes from characters c0..c1 cover: the first unbroken run of them in playing order.
 * -> { w0, w1 } or null. Used for "loop this part" and "loop the notes I picked".
 */
export function rangeForChars(tl, c0, c1) {
  const mel = tl.filter((e) => e.track === "melody");
  const inside = (e) => e.c0 >= c0 && e.c0 < c1;
  const first = mel.findIndex(inside);
  if (first < 0) return null;
  let last = first;
  while (last + 1 < mel.length && inside(mel[last + 1])) last++;
  const w0 = mel[first].w;
  const w1 = Math.max(...mel.slice(first, last + 1).map((e) => e.w + e.dw));
  return { w0, w1 };
}
/** The time range for a loop choice: "all" | "A" | "B"... | "sel" (with sel = { c0, c1 }) */
export function loopRange(tl, parts, choice, sel = null) {
  if (choice === "sel" && sel) return rangeForChars(tl, Math.min(sel.c0, sel.c1), Math.max(sel.c0, sel.c1));
  const p = parts.find((x) => x.label === choice);
  if (p) return rangeForChars(tl, p.c0, p.c1);
  return { w0: 0, w1: Math.max(melodyEnd(tl), timelineLength(tl.filter((e) => e.track === "melody"))) };
}

// ---------- practice: loop and speed up ----------
/** The speed (percent of the chosen tempo) for loop pass i: start at from, add step every `every` passes, stop at to */
export function speedForPass(i, { from = 60, to = 100, step = 5, every = 2 } = {}) {
  const f = clampInt(from, 10, 200), t = clampInt(to, 10, 200), st = Math.max(0, +step || 0), ev = Math.max(1, every | 0);
  if (t <= f) return f;
  return Math.min(t, f + Math.floor(Math.max(0, i) / ev) * st);
}
/** How many passes until the practice loop reaches its target speed */
export function passesToTarget(opts = {}) {
  const { from = 60, to = 100, step = 5, every = 2 } = opts;
  if (to <= from) return 0;
  if (!(step > 0)) return Infinity;
  return Math.ceil((to - from) / step) * Math.max(1, every | 0);
}

function clampInt(v, lo, hi) { const n = Math.round(+v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo < 0 && hi > 0 ? 0 : lo; }
