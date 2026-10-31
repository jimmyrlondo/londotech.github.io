// Encore Restore: the digitizing project, with no page in it, so Node can test
// every rule (test-restore-project.mjs) and the page and the export worker
// share one copy.
//
// A project is one release being digitized: an LP, a 45, a 78 (or an album of
// them), a cassette, an 8-track, a reel, a CD. It has parts (Side A, Side B,
// Program 1...), each with its own audio, fix settings and tracks, and one set
// of release details (artist, label, credits, images, the transfer chain).
//
//   FORMATS, newProject, addPart, partLabel        the parts a format starts with
//   parseTracklist, applyTracklist                 "A1 Beer Barrel Polka 2:45"
//   parseReleaseInfo                               a pasted Discogs-style block
//   Envelope, gapCandidates, chooseSplits          "this side has N tracks"
//   numberRelease, trackFileName, releaseFolder    numbering and file names
//   tagsFor, describeRestoration                   what goes in every file's tags
//   catalogJSON, catalogCSV                        the archive's own record
//   toProjectFile, fromProjectFile                 save and load
//   releaseProgress                                what's done and what's left
import { defaultSettings, speedCents, nrAmountToDb, CURVES, RPM_FIXES } from "./restore-core.js";
import { toBase64, fromBase64 } from "./tag-bin.js";

// ======================================================================
// Formats and parts
// ======================================================================
// source: the restore-core SOURCES id (the analysis's starting points).
// rpm: the speed the format is cut at (discs only). media: the tag's media
// type. details: a Discogs-style format line to start from.
export const FORMATS = [
  { id: "lp", name: "LP", sub: "12 inch vinyl, 33⅓", source: "lp", media: "Vinyl", details: "Vinyl, LP, Album", rpm: "33", disc: true, word: "Side" },
  { id: "single", name: "45 / single", sub: "7 inch single or EP", source: "lp", media: "Vinyl", details: "Vinyl, 7\", 45 RPM, Single", rpm: "45", disc: true, word: "Side" },
  { id: "78", name: "78", sub: "Shellac, 10 or 12 inch", source: "78", media: "Shellac", details: "Shellac, 10\", 78 RPM", rpm: "78", disc: true, word: "Side" },
  { id: "cassette", name: "Cassette", sub: "Side A and B", source: "cassette", media: "Cassette", details: "Cassette, Album", word: "Side" },
  { id: "8track", name: "8-track", sub: "Programs 1 to 4", source: "8track", media: "8-Track Cartridge", details: "8-Track Cartridge, Album", word: "Program" },
  { id: "reel", name: "Reel-to-reel", sub: "Side 1, Side 2...", source: "reel", media: "Reel-To-Reel", details: "Reel-To-Reel, 7 ½ ips, ¼\"", word: "Side" },
  { id: "cd", name: "CD", sub: "One part per disc", source: "cd", media: "CD", details: "CD, Album", word: "Disc" },
  { id: "other", name: "Other", sub: "Anything else", source: "other", media: "", details: "", word: "Part" },
];
export const formatOf = (id) => FORMATS.find((f) => f.id === id) ?? FORMATS[FORMATS.length - 1];
export const RPMS = [["33", "33⅓", 100 / 3], ["45", "45", 45], ["78", "78", 78], ["16", "16⅔", 50 / 3]];
export const rpmValue = (v) => { const r = RPMS.find((x) => x[0] === String(v)); return r ? r[2] : parseFloat(v); };
export const rpmName = (v) => RPMS.find((x) => x[0] === String(v))?.[1] ?? String(v);

// The Goldmine grading scale (media and sleeve), best first
export const GRADES = [["", "Not graded"], ["M", "Mint (M)"], ["NM", "Near Mint (NM or M-)"], ["VG+", "Very Good Plus (VG+)"], ["VG", "Very Good (VG)"],
  ["G+", "Good Plus (G+)"], ["G", "Good (G)"], ["F", "Fair (F)"], ["P", "Poor (P)"]];
export const SLEEVE_GRADES = [...GRADES, ["generic", "Generic sleeve"], ["none", "No sleeve or case"]];
export const IMAGE_KINDS = [["front", "Front cover", 3], ["back", "Back cover", 4], ["label", "Label", 6], ["insert", "Insert or booklet", 5], ["other", "Other", 0]];

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
// today on this device (not UTC: an evening transfer in Ohio is still today)
export const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

// The parts a format starts with. discs: how many records / tapes / CDs.
export function partsFor(formatId, discs = 1) {
  const f = formatOf(formatId), out = [];
  discs = Math.max(1, Math.min(20, discs | 0 || 1));
  if (f.id === "8track") for (let i = 0; i < 4 * discs; i++) out.push({ letter: LETTERS[i], name: `Program ${i + 1}`, disc: Math.floor(i / 4) + 1 });
  else if (f.id === "reel") for (let i = 0; i < 2 * discs; i++) out.push({ letter: LETTERS[i], name: `Side ${i + 1}`, disc: Math.floor(i / 2) + 1 });
  else if (f.id === "cd" || f.id === "other") for (let i = 0; i < discs; i++) out.push({ letter: f.id === "cd" ? "" : "", name: discs > 1 ? `${f.word} ${i + 1}` : f.id === "cd" ? "Disc" : "Recording", disc: i + 1 });
  else for (let i = 0; i < 2 * discs; i++) out.push({ letter: LETTERS[i], name: `Side ${LETTERS[i]}`, disc: Math.floor(i / 2) + 1 });
  return out;
}

export function newPart(project, { letter = "", name, disc = 1 } = {}) {
  const f = formatOf(project.format);
  return { id: uid(), letter, name: name || `${f.word} ${letter || project.parts.length + 1}`, disc, include: true,
    rpm: f.rpm || "", playedAt: f.rpm || "", audio: null, settings: null, tracks: [], matrix: "", notes: "", restored: null, exported: null, settingsFrom: null };
}

export function newProject(formatId = "lp", { discs = 1, artist = "", title = "" } = {}) {
  const f = formatOf(formatId), now = new Date().toISOString();
  const p = {
    app: "Encore Restore", kind: "project", version: 2, id: uid(), format: f.id, discs: Math.max(1, discs | 0 || 1), created: now, updated: now,
    release: { artist, albumArtist: "", title, label: "", catalog: "", barcode: "", year: "", date: "", country: "", genre: "", style: "", formatDetails: f.details,
      language: "", copyright: "", linerNotes: "", conditionMedia: "", conditionSleeve: "", collection: "" },
    credits: [],
    transfer: { by: "", date: localDate(), deck: "", cartridge: "", stylus: "", preamp: "", adc: "", settings: "", archiveId: "", notes: "" },
    images: [],
    defaults: null,
    export: { formats: ["flac"], usePosition: false, restartEachDisc: false, discFolders: false, raw: true, catalog: true, artwork: true, embedAll: false, scope: "release" },
    parts: [],
  };
  for (const x of partsFor(f.id, p.discs)) p.parts.push(newPart(p, x));
  return p;
}

// One more part: the next side letter, on the disc it belongs to
export function addPart(project) {
  const f = formatOf(project.format), n = project.parts.length;
  const used = new Set(project.parts.map((p) => p.letter));
  const letter = f.id === "cd" || f.id === "other" ? "" : [...LETTERS].find((l) => !used.has(l)) ?? "";
  const per = f.id === "8track" ? 4 : f.id === "cd" || f.id === "other" ? 1 : 2;
  const disc = Math.floor(n / per) + 1;
  const name = f.id === "8track" ? `Program ${n + 1}` : f.id === "reel" ? `Side ${n + 1}` : f.id === "cd" || f.id === "other" ? `${f.word} ${n + 1}` : `Side ${letter}`;
  const part = newPart(project, { letter, name, disc });
  project.parts.push(part);
  project.discs = Math.max(project.discs || 1, disc);
  return part;
}

// ======================================================================
// Tracklists: "A1 Beer Barrel Polka 2:45", Discogs table rows, plain lists
// ======================================================================
const POS_RE = /^(?:([A-Za-z]{1,2})(\d{1,3})([a-z])?|(\d{1,2})-(\d{1,3})|(\d{1,3}))$/;
const LONE_LETTER = /^[A-Ha-h]$/;
export const isPosition = (s) => POS_RE.test(String(s).trim()) || LONE_LETTER.test(String(s).trim());
const DUR_RE = /^[([]?(\d{1,2}):(\d{2})(?::(\d{2}))?[)\]]?$/;
export function parseDuration(s) {
  const m = DUR_RE.exec(String(s).trim());
  if (!m) return null;
  return m[3] != null ? +m[1] * 3600 + +m[2] * 60 + +m[3] : +m[1] * 60 + +m[2];
}
export const fmtDuration = (s) => { if (s == null || !isFinite(s)) return ""; s = Math.round(s); const m = Math.floor(s / 60); return `${m}:${String(s % 60).padStart(2, "0")}`; };

// Credit lines under a track (Discogs puts them there): "Written-By – Frankie Yankovic"
const CREDIT_ROLE = /^(written[- ]by|composed[- ]by|music[- ]by|lyrics[- ]by|words[- ]by|words and music[- ]by|songwriter|arranged[- ]by|arranger|featuring|vocals|lead vocals|backing vocals|producer|produced[- ]by|conductor|conducted[- ]by|orchestra|band|accordion|button box|concertina|clarinet|trumpet|tuba|drums|banjo|piano|violin|saxophone|bass|guitar|engineer|recorded[- ]by|mixed[- ]by|performer|lyricist|composer)\b/i;
const roleKind = (role) => {
  const r = role.toLowerCase();
  if (/^(written|composed|music|songwriter|composer|words and music)/.test(r)) return "composer";
  if (/^(lyrics|words|lyricist)/.test(r)) return "lyricist";
  if (/^featuring/.test(r)) return "featuring";
  if (/^(arranged|arranger)/.test(r)) return "arranger";
  return "other";
};
const cleanArtist = (s) => String(s).replace(/\s*\(\d+\)(?=\s*$|\s*[,&*])/g, "").replace(/\*+/g, "").replace(/\s+/g, " ").trim();
// "Artist – Title" (Discogs's en dash) inside a title cell
function splitArtist(title) {
  const i = title.indexOf(" – ");
  if (i > 0) return { artist: cleanArtist(title.slice(0, i)), title: title.slice(i + 3).trim() };
  return { artist: "", title: title.trim() };
}
// a trailing duration on a line: "Title 2:45", "Title (2:45)", "Title - 2:45", "Title [2:45]"
function takeDuration(s) {
  const m = /\s*(?:[-–]\s*)?[([]?(\d{1,2}:\d{2}(?::\d{2})?)[)\]]?\s*$/.exec(s);
  if (!m || m.index === 0 && !s.slice(0, m.index).trim()) return { text: s, dur: m ? parseDuration(m[1]) : null, only: !!m };
  return { text: s.slice(0, m.index).trim(), dur: parseDuration(m[1]), only: false };
}
// a leading position: "A1 ", "A1. ", "A1) ", "1. ", "B ", "A1Beer" (cells pasted with no space)
function takePosition(s) {
  let m = /^([A-Za-z]{1,2}\d{1,3}[a-z]?|\d{1,2}-\d{1,3})(?:[.):]\s*|\s+[–-]\s+|\s+|(?=[A-Z"'(]))(.+)$/.exec(s);
  if (m && POS_RE.test(m[1])) return { pos: m[1], text: m[2] };
  m = /^(\d{1,3})(?:[.):]\s*|\s+[–-]\s+|\s+)(.+)$/.exec(s);
  if (m && !/^\d{1,2}:\d{2}/.test(s)) return { pos: m[1], text: m[2] };
  m = /^([A-Ha-h])(?:[.)]\s*|\s+[–-]\s+)(.+)$/.exec(s); // a single's "A. Title" or "A – Title" (a plain "A Little Bit" stays a title)
  if (m) return { pos: m[1], text: m[2] };
  return { pos: null, text: s };
}

// -> [{ position, side, disc, index, title, artist, duration, composer, lyricist, featuring, credits: [{ role, name }] }]
export function parseTracklist(text) {
  const out = [];
  let side = null, disc = null, waiting = null; // waiting: a track whose position came on a line of its own
  const add = (t) => { out.push(t); return t; };
  const make = (pos, title, artist, dur) => {
    const t = { position: "", side: null, disc: null, index: null, title: title || "", artist: artist || "", duration: dur ?? null, composer: "", lyricist: "", featuring: "", credits: [] };
    if (pos) {
      const m = POS_RE.exec(pos);
      if (m?.[1]) { t.side = m[1].toUpperCase(); t.index = +m[2]; }
      else if (m?.[4]) { t.disc = +m[4]; t.index = +m[5]; }
      else if (m?.[6]) { t.index = +m[6]; t.side = side; t.disc = disc; }
      else if (LONE_LETTER.test(pos)) { t.side = pos.toUpperCase(); t.index = null; }
      t.position = m?.[6] && side ? `${side}${t.index}` : pos.toUpperCase().replace(/^([A-Z]+\d+)([A-Z])$/, (_, a, b) => a + b.toLowerCase());
    } else { t.side = side; t.disc = disc; }
    return t;
  };
  for (const raw of String(text).replace(/ /g, " ").split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, "");
    const t = line.trim();
    if (!t) continue;
    // headings: "Side A", "Side 1:", "Program 2", "Disc 2", "Tracklist"
    const words = t.replace(/^(side|program|programme|disc|cd|record|tape)\s+(one|two|three|four)\b/i, (_, a, w) => `${a} ${["one", "two", "three", "four"].indexOf(w.toLowerCase()) + 1}`);
    const h = /^(side|program|programme|disc|cd|record|tape)\s*([A-Za-z]|\d{1,2})\s*[:.]?\s*(?:[-–].*)?$/i.exec(words);
    if (h) {
      const k = h[1].toLowerCase(), v = h[2];
      if (k === "disc" || k === "cd" || k === "record") disc = +v || LETTERS.indexOf(v.toUpperCase()) + 1;
      else side = /\d/.test(v) ? LETTERS[+v - 1] : v.toUpperCase();
      waiting = null;
      continue;
    }
    if (/^(track ?list(ing)?|tracks|songs)\s*:?$/i.test(t)) continue;
    // a credit under the last track
    const cm = /^(.+?)\s+[–-]\s+(.+)$/.exec(t);
    if (cm && CREDIT_ROLE.test(cm[1]) && !takePosition(t).pos && out.length && !t.includes("\t")) {
      const last = out[out.length - 1], role = cm[1].replace(/\s*\[[^\]]*\]/g, "").trim(), name = cleanArtist(cm[2]);
      const kind = roleKind(role);
      if (kind === "composer" || kind === "lyricist" || kind === "featuring") last[kind] = last[kind] ? `${last[kind]}, ${name}` : name;
      else last.credits.push({ role, name });
      continue;
    }
    // Discogs table cells, separated by tabs
    const cells = t.split(/\t+/).map((c) => c.trim()).filter((c) => c && c !== "–" && c !== "-");
    if (cells.length > 1) {
      const pos = isPosition(cells[0]) ? cells.shift() : null;
      const dur = cells.length && parseDuration(cells[cells.length - 1]) != null ? parseDuration(cells.pop()) : null;
      let artist = "", title = "";
      if (cells.length >= 2) { artist = cleanArtist(cells[0]); title = cells.slice(1).join(" "); }
      else ({ artist, title } = splitArtist(cells[0] ?? ""));
      if (!title && pos) { waiting = add(make(pos, "", "", dur)); continue; }
      add(make(pos, title, artist, dur)); waiting = null;
      continue;
    }
    // one cell on its own line: a position, a duration, or a whole "A1 Title 2:45"
    if (isPosition(t) && !/^\d{1,3}$/.test(t) || /^[A-Za-z]{1,2}\d{1,3}[a-z]?$/.test(t) || (/^\d{1,3}$/.test(t) && (!out.length || out[out.length - 1].title))) {
      waiting = add(make(t, "", "", null));
      continue;
    }
    if (parseDuration(t) != null) {
      const last = out[out.length - 1];
      if (last && last.duration == null) last.duration = parseDuration(t);
      continue;
    }
    const d = takeDuration(t), p = takePosition(d.text);
    const { artist, title } = splitArtist(p.text);
    if (!p.pos && waiting && !waiting.title) { waiting.title = title; waiting.artist = artist; if (d.dur != null) waiting.duration = d.dur; waiting = null; continue; }
    add(make(p.pos, title, artist, d.dur)); waiting = null;
  }
  // number the ones that came without positions, side by side
  const count = {};
  for (const t of out.filter((x) => x.title || x.position)) {
    const key = `${t.disc ?? ""}|${t.side ?? ""}`;
    count[key] = (count[key] ?? 0) + 1;
    if (t.index == null && !(t.side && t.position === t.side)) t.index = count[key];
    if (!t.position) t.position = `${t.side ?? ""}${t.index}`;
  }
  return out.filter((t) => t.title || t.position);
}

// Puts a parsed tracklist onto the project's parts: lettered positions go to the
// part with that letter, numbered ones (or a list with no positions at all) to
// the current part (or to disc N's part for CD-style "2-05").
// Returns { parts: { partId: count }, unmatched: [tracks] }.
export function applyTracklist(project, parsed, currentPartId) {
  const byPart = new Map(), unmatched = [];
  const lettered = parsed.some((t) => t.side);
  for (const t of parsed) {
    let part = null;
    if (t.side) part = project.parts.find((p) => p.letter === t.side);
    else if (t.disc && !lettered) part = project.parts.filter((p) => p.disc === t.disc)[0];
    else if (!lettered) part = project.parts.find((p) => p.id === currentPartId);
    if (!part) { unmatched.push(t); continue; }
    if (!byPart.has(part.id)) byPart.set(part.id, []);
    byPart.get(part.id).push(t);
  }
  const counts = {};
  for (const [id, list] of byPart) {
    const part = project.parts.find((p) => p.id === id);
    const placed = part.tracks.length === list.length && part.tracks.every((x) => x.start != null);
    part.tracks = list.map((t, i) => ({
      ...(placed ? { start: part.tracks[i].start, end: part.tracks[i].end } : { start: null, end: null }),
      ...blankTrack(), ...keepMeta(placed ? part.tracks[i] : null),
      title: t.title || part.tracks[i]?.title || "", artist: t.artist || "", featuring: t.featuring || "", composer: t.composer || "", lyricist: t.lyricist || "",
      durationHint: t.duration, credits: t.credits || [],
    }));
    part.needsPlacing = !placed;
    counts[id] = list.length;
  }
  return { parts: counts, unmatched };
}
export const blankTrack = () => ({ title: "", artist: "", featuring: "", composer: "", lyricist: "", isrc: "", notes: "", explicit: false, durationHint: null, credits: [] });
const keepMeta = (t) => (t ? { isrc: t.isrc || "", notes: t.notes || "", explicit: !!t.explicit } : {});

// ======================================================================
// Release info pasted from Discogs (or typed the same way)
// ======================================================================
const SECTIONS = { tracklist: "tracklist", "track list": "tracklist", credits: "credits", notes: "notes", "barcode and other identifiers": "ids", identifiers: "ids",
  "companies, etc.": "skip", companies: "skip", images: "skip", videos: "skip", reviews: "skip", "other versions": "skip", "recommendations": "skip", "lists": "skip", "contributors": "skip", "statistics": "skip" };
const KEYS = { label: "label", labels: "label", format: "formatDetails", formats: "formatDetails", country: "country", released: "date", release: "date", year: "year",
  genre: "genre", genres: "genre", style: "style", styles: "style", barcode: "barcode", upc: "barcode", catalog: "catalog", "catalog number": "catalog", "cat#": "catalog",
  artist: "artist", title: "title", album: "title", language: "language", copyright: "copyright" };
// -> { release: {...}, credits: [{ role, name }], tracks: parseTracklist(...), matrix: { A: "..." }, notes }
export function parseReleaseInfo(text) {
  const lines = String(text).replace(/ /g, " ").split(/\r?\n/).map((l) => l.replace(/\s+$/, ""));
  const release = {}, credits = [], matrix = {}, notes = [], trackLines = [];
  let section = null, pendingKey = null;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t) continue;
    const low = t.toLowerCase().replace(/:$/, "");
    if (SECTIONS[low]) { section = SECTIONS[low]; pendingKey = null; continue; }
    if (pendingKey) { setKey(release, pendingKey, t); pendingKey = null; continue; }
    const kv = /^([A-Za-z#][A-Za-z #./]*?)\s*:\s*(.*)$/.exec(t);
    const key = kv && KEYS[kv[1].toLowerCase().trim()];
    if (section === "tracklist") { if (key && kv[2]) { section = null; } else { trackLines.push(lines[i]); continue; } }
    if (section === "credits") { const c = /^(.+?)\s+[–-]\s+(.+)$/.exec(t); if (c) { for (const name of c[2].split(/,\s*(?![^()]*\))/)) credits.push({ role: c[1].trim(), name: cleanArtist(name) }); } continue; }
    if (section === "notes") { notes.push(t); continue; }
    if (section === "ids") {
      const m = /^matrix\s*\/\s*runout\s*(?:\(([^)]*)\))?\s*:?\s*(.*)$/i.exec(t);
      if (m) { const s = /side\s*([A-Za-z0-9])/i.exec(m[1] || "")?.[1]?.toUpperCase() ?? m[1] ?? "?"; matrix[/\d/.test(s) ? LETTERS[+s - 1] : s] = m[2].trim(); continue; }
      const b = /^barcode\s*(?:\([^)]*\))?\s*:?\s*(.+)$/i.exec(t);
      if (b && !release.barcode) release.barcode = b[1].replace(/\s+/g, "");
      continue;
    }
    if (section === "skip") continue;
    if (key) { if (kv[2].trim()) setKey(release, key, kv[2].trim()); else pendingKey = key; continue; }
    // the heading line: "Artist – Title"
    if (!release.title && t.includes(" – ")) { const j = t.indexOf(" – "); release.artist ??= cleanArtist(t.slice(0, j)); release.title = t.slice(j + 3).trim(); continue; }
  }
  if (notes.length) release.linerNotes = notes.join("\n");
  return { release, credits, matrix, tracks: trackLines.length ? parseTracklist(trackLines.join("\n")) : [] };
}
function setKey(r, key, v) {
  if (key === "label") { // "Columbia – CL 1234, Columbia – CL-1234": the first label and its number
    const first = v.split(/,\s*(?=[^,]+ – )/)[0], m = /^(.+?)\s+[–-]\s+(.+)$/.exec(first);
    if (m) { r.label = cleanArtist(m[1]); if (!/^none$/i.test(m[2].trim())) r.catalog = m[2].trim(); } else r.label = cleanArtist(first);
  } else if (key === "date") {
    const iso = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(v), y = /(\d{4})/.exec(v)?.[1];
    if (iso) { r.year = iso[1]; if (iso[2]) r.date = v; } else if (y) { r.year = y; r.date = toIsoDate(v) || ""; }
  } else if (key === "genre" || key === "style") r[key] = v.replace(/\s*,\s*/g, ", ");
  else if (key === "barcode") r.barcode = v.replace(/\s+/g, "");
  else r[key] = v;
}
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
function toIsoDate(v) { // "12 May 1958", "May 1958"
  const m = /(?:(\d{1,2})\s+)?([A-Za-z]{3})[a-z]*\.?\s+(\d{4})/.exec(v);
  if (!m) return "";
  const mo = MONTHS.indexOf(m[2].toLowerCase()) + 1;
  if (!mo) return "";
  return `${m[3]}-${String(mo).padStart(2, "0")}${m[1] ? "-" + String(m[1]).padStart(2, "0") : ""}`;
}
// A genre from the Apple-style list that the pasted genre or style names (Polka, before "Folk, World, & Country")
export function matchGenre(release, genres) {
  const all = Object.values(genres).flat(), lower = new Map(all.map((g) => [g.toLowerCase(), g]));
  for (const s of [release.style, release.genre]) for (const part of String(s || "").split(/\s*,\s*|\s*&\s*/)) { const g = lower.get(part.trim().toLowerCase()); if (g) return g; }
  return "";
}

// ======================================================================
// Finding N tracks: a level envelope, the quiet dips, and the best N-1 of them
// ======================================================================
// Mid-channel level every `hop` seconds, the median of five sub-blocks so a
// click in a gap doesn't make it look loud, after a gentle high-pass (rumble
// and DC aren't music).
export class Envelope {
  constructor(fs, hop = 0.05) { this.fs = fs; this.sub = Math.max(1, Math.round(fs * hop / 5)); this.hop = 5 * this.sub / fs; this.subs = []; this.acc = 0; this.n = 0; this.out = []; this.y = 0; this.xp = 0; this.a = Math.exp(-2 * Math.PI * 100 / fs); }
  push(l, r) {
    const a = this.a;
    for (let i = 0; i < l.length; i++) {
      const x = 0.5 * (l[i] + (r ? r[i] : l[i]));
      this.y = a * (this.y + x - this.xp); this.xp = x;
      this.acc += this.y * this.y;
      if (++this.n === this.sub) {
        this.subs.push(this.acc / this.n); this.acc = 0; this.n = 0;
        if (this.subs.length === 5) { const s = this.subs.sort((p, q) => p - q); this.out.push(10 * Math.log10(s[2] + 1e-14)); this.subs = []; }
      }
    }
  }
  result() { return Float32Array.from(this.out); }
}
const pct = (arr, p) => { const s = Float64Array.from(arr).sort(); return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))] : -120; };
function smooth(lv, w = 3) {
  const n = lv.length, out = new Float32Array(n), buf = [];
  for (let j = 0; j < n; j++) { buf.length = 0; for (let k = Math.max(0, j - w); k <= Math.min(n - 1, j + w); k++) buf.push(lv[k]); buf.sort((a, b) => a - b); out[j] = buf[buf.length >> 1]; }
  return out;
}
// Quiet dips that could be gaps between songs, each with a score (deeper and
// longer is more likely), plus where the music starts and ends on the side.
export function gapCandidates(lv, hop = 0.05) {
  const n = lv.length, seconds = n * hop, sm = smooth(lv);
  const live = Array.from(sm).filter((v) => v > -120);
  const floor = pct(live, 0.05), music = pct(live, 0.9), range = music - floor;
  if (n < 20 || range < 6) return { cands: [], musicStart: 0, musicEnd: seconds, seconds, floor, music };
  const strict = floor + Math.max(6, 0.3 * range), loose = floor + 0.55 * range;
  let ms = 0; while (ms < n && sm[ms] < strict) ms++;
  let me = n - 1; while (me > ms && sm[me] < strict) me--;
  const cands = [];
  for (let j = ms; j <= me;) {
    if (sm[j] >= loose) { j++; continue; }
    let k = j; while (k <= me && sm[k] < loose) k++;
    let min = Infinity, minAt = j;
    for (let q = j; q < k; q++) if (sm[q] < min) { min = sm[q]; minAt = q; }
    const dur = (k - j) * hop, depth = Math.max(0, Math.min(1, (music - min) / range));
    if (dur >= 0.2) {
      // the next song starts at the end of the dip; the split sits a moment before it
      const start = j * hop, end = k * hop, at = Math.max(start, end - Math.min(0.5, dur / 3));
      cands.push({ start: +start.toFixed(2), end: +end.toFixed(2), at: +at.toFixed(2), min: +min.toFixed(1), depth: +depth.toFixed(3), score: +(depth * depth * Math.min(1, 0.35 + dur / 2)).toFixed(3) });
    }
    j = k;
  }
  return { cands, musicStart: +(ms * hop).toFixed(2), musicEnd: +((me + 1) * hop).toFixed(2), seconds: +seconds.toFixed(2), floor: +floor.toFixed(1), music: +music.toFixed(1) };
}
// The n tracks: the n-1 best gaps (in time order), or, with durations (from a
// pasted tracklist), the gaps nearest where those durations say the splits
// are. Returns { tracks: [{ start, end }], byTiming: how many splits had no
// gap near them and were placed by timing alone }.
export function chooseSplits(g, n, durations = null) {
  const { cands, musicStart: ms, musicEnd: me, seconds } = g;
  n = Math.max(1, n | 0);
  const span = Math.max(1, me - ms), k = n - 1;
  let splits = [], byTiming = 0;
  const known = durations ? durations.filter((d) => d > 0) : [];
  if (k > 0 && known.length >= Math.max(1, Math.ceil(n / 2)) && durations.length === n) {
    const avg = known.reduce((a, b) => a + b, 0) / known.length, d = durations.map((x) => (x > 0 ? x : avg));
    const total = d.reduce((a, b) => a + b, 0), scale = span / total;
    const expected = []; let cum = 0;
    for (let j = 0; j < k; j++) { cum += d[j]; expected.push(ms + cum * scale); }
    const tol = Math.max(3, 0.04 * span), m = cands.length;
    // dp over boundaries: each takes a later candidate than the last, or none (placed by timing)
    const MISS = 6;
    let prev = new Map([[-1, { cost: 0, picks: [] }]]);
    for (let j = 0; j < k; j++) {
      const next = new Map();
      for (const [last, st] of prev) {
        const put = (idx, cost, pick) => { const c = st.cost + cost, cur = next.get(idx); if (!cur || c < cur.cost) next.set(idx, { cost: c, picks: [...st.picks, pick] }); };
        put(last, MISS, null);
        for (let i = last + 1; i < m; i++) {
          const z = (cands[i].at - expected[j]) / tol;
          if (Math.abs(z) > 4) continue;
          put(i, z * z - 3 * cands[i].score, i);
        }
      }
      // keep the state space small: the best few
      prev = new Map([...next].sort((a, b) => a[1].cost - b[1].cost).slice(0, 400));
    }
    const best = [...prev.values()].sort((a, b) => a.cost - b.cost)[0];
    splits = best.picks.map((i, j) => (i == null ? (byTiming++, +expected[j].toFixed(2)) : cands[i].at));
    // keep the order strict (a timing guess could land before a chosen gap)
    for (let j = 1; j < splits.length; j++) if (splits[j] <= splits[j - 1] + 1) splits[j] = +(splits[j - 1] + 1).toFixed(2);
  } else if (k > 0) {
    const minSpace = Math.max(8, Math.min(30, 0.25 * span / n));
    const ranked = cands.filter((c) => c.at - ms > 5 && me - c.at > 5).sort((a, b) => b.score - a.score);
    for (const c of ranked) {
      if (splits.length >= k) break;
      if (splits.every((s) => Math.abs(s - c.at) >= minSpace)) splits.push(c.at);
    }
    splits.sort((a, b) => a - b);
    // not enough gaps: split the longest stretch in the middle until there are n
    while (splits.length < k) {
      const edges = [ms, ...splits, me];
      let bi = 0, bl = -1;
      for (let i = 0; i + 1 < edges.length; i++) if (edges[i + 1] - edges[i] > bl) { bl = edges[i + 1] - edges[i]; bi = i; }
      splits.splice(bi, 0, +((edges[bi] + edges[bi + 1]) / 2).toFixed(2));
      splits.sort((a, b) => a - b);
      byTiming++;
    }
  }
  const starts = [+Math.max(0, ms - 0.5).toFixed(2), ...splits];
  const tracks = starts.map((s, i) => ({ start: s, end: i < starts.length - 1 ? starts[i + 1] : +Math.min(seconds, me + 2).toFixed(2) }));
  return { tracks, byTiming };
}

// ======================================================================
// Numbering, names
// ======================================================================
// Every track in the release, in order, with its position (A1), its number and
// its disc. Skipped parts are left out. Numbering runs 1..N across the whole
// release unless restartEachDisc.
export function numberRelease(project, opts = {}) {
  const restart = opts.restartEachDisc ?? project.export?.restartEachDisc ?? false;
  const parts = project.parts.filter((p) => p.include !== false && (!opts.only || opts.only.includes(p.id)));
  const allIncluded = project.parts.filter((p) => p.include !== false);
  const discs = [...new Set(allIncluded.map((p) => p.disc || 1))].sort((a, b) => a - b);
  const discTotal = discs.length || 1;
  const discNo = (p) => discs.indexOf(p.disc || 1) + 1;
  const perDiscTotal = {}; let total = 0;
  for (const p of allIncluded) { perDiscTotal[discNo(p)] = (perDiscTotal[discNo(p)] ?? 0) + p.tracks.length; total += p.tracks.length; }
  const out = [], perDisc = {};
  let n = 0;
  for (const p of allIncluded) {
    p.tracks.forEach((t, i) => {
      n++;
      const d = discNo(p);
      perDisc[d] = (perDisc[d] ?? 0) + 1;
      if (!parts.includes(p)) return;
      const position = p.letter ? (p.tracks.length === 1 && formatOf(project.format).id === "single" ? p.letter : `${p.letter}${i + 1}`) : String(i + 1);
      out.push({ part: p, track: t, index: i + 1, position, number: restart ? perDisc[d] : n, trackTotal: restart ? perDiscTotal[d] : total, disc: d, discTotal });
    });
  }
  return out;
}
export function cleanName(s, max = 120) {
  let x = String(s ?? "").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "").replace(/^\.+/, "");
  if (x.length > max) x = x.slice(0, max).replace(/[. ]+$/, "");
  return x;
}
export function releaseFolder(release) {
  const who = cleanName(release.albumArtist || release.artist) || "Unknown artist", what = cleanName(release.title) || "Untitled";
  const year = /^\d{4}/.exec(release.year || release.date || "")?.[0];
  return cleanName(`${who} - ${what}${year ? ` (${year})` : ""}`, 160);
}
// "01 - Title.flac", "A1 - Title.flac", "1-01 - Title.flac" (multi-disc, restarted);
// a track by someone other than the album artist gets "Artist - Title"
export function trackFileName(item, project, ext, opts = {}) {
  const usePosition = opts.usePosition ?? project.export?.usePosition, restart = opts.restartEachDisc ?? project.export?.restartEachDisc;
  const r = project.release, t = item.track;
  const width = Math.max(2, String(item.trackTotal || 0).length);
  const num = (restart && item.discTotal > 1 && !opts.discFolders ? `${item.disc}-` : "") + String(item.number).padStart(width, "0");
  const lead = usePosition ? item.position : num;
  const who = t.artist && cleanName(t.artist) !== cleanName(r.albumArtist || r.artist) ? `${cleanName(t.artist)} - ` : "";
  const title = cleanName(t.title) || `Track ${item.number}`;
  return cleanName(`${lead} - ${who}${title}`, 150) + "." + ext;
}
// unique names: a second "01 - Polka.flac" becomes "01 - Polka (2).flac"
export function uniquePaths(paths) {
  const seen = new Map();
  return paths.map((p) => {
    const k = p.toLowerCase();
    if (!seen.has(k)) { seen.set(k, 1); return p; }
    const n = seen.get(k) + 1; seen.set(k, n);
    return p.replace(/(\.[^./]+)?$/, (e) => ` (${n})${e}`);
  });
}

// ======================================================================
// Tags
// ======================================================================
export function describeRestoration(s, clicks = null) {
  if (!s) return "not restored";
  const done = [], c = speedCents(s);
  if (Math.abs(c) > 0.05) done.push(`speed ${c > 0 ? "+" : ""}${c.toFixed(1)} cents${s.speed.rpm && s.speed.rpm !== "none" ? ` (${RPM_FIXES.find((r) => r.id === s.speed.rpm)?.name ?? s.speed.rpm})` : ""}`);
  if (s.wow.on && s.wow.curve) done.push(`wow steadied ${s.wow.amount}%`);
  if (s.channels.on) done.push([s.channels.mode !== "stereo" ? `mono (${s.channels.mode === "sum" ? "both channels" : s.channels.mode + " channel"})` : "", s.channels.alignOn ? `azimuth aligned ${(+s.channels.delay).toFixed(2)} samples` : "", s.channels.balanceOn ? "balance" : "", s.channels.flip ? "polarity flipped" : ""].filter(Boolean).join(", "));
  if (s.declick.on) done.push(`de-click ${s.declick.clicks}/crackle ${s.declick.crackle}${clicks ? ` (${clicks.total} repaired)` : ""}`);
  if (s.dehum.on && s.dehum.harmonics.length) done.push(`de-hum ${(+s.dehum.hz).toFixed(1)} Hz x${s.dehum.harmonics.length}`);
  if (s.denoise.on) done.push(`noise reduction ${nrAmountToDb(s.denoise.amount).toFixed(0)} dB`);
  if (s.eq.on && s.eq.curve !== "none") done.push(`EQ ${CURVES.find((x) => x.id === s.eq.curve)?.name ?? `custom ${s.eq.turnover} Hz`}`);
  if (s.eq.on && s.eq.air > 0) done.push(`air +${s.eq.air} dB`);
  if (s.rumble.on) done.push(`rumble filter ${s.rumble.hz} Hz`);
  return done.filter(Boolean).join(", ") || "no changes";
}
const CREDIT_FIELD = [[/^produc/i, "producer"], [/^(engineer|recorded|recording engineer|mastered)/i, "engineer"], [/^(arrang)/i, "arranger"], [/^(conduct)/i, "conductor"], [/^(mix)/i, "mixer"]];
// The fields and custom fields for one track's file (keys as tag-fields.js)
export function tagsFor(project, item, opts = {}) {
  const r = project.release, t = item.track, p = item.part, x = project.transfer || {}, f = formatOf(project.format);
  const artist = (t.artist || r.artist || "") + (t.featuring ? ` feat. ${t.featuring}` : "");
  const fields = {
    title: t.title || `Track ${item.number}`, artist, album: r.title || "", albumArtist: r.albumArtist || (t.artist && t.artist !== r.artist ? r.artist : "") || "",
    track: String(item.number), trackTotal: String(item.trackTotal), disc: item.discTotal > 1 || opts.alwaysDisc ? String(item.disc) : "", discTotal: item.discTotal > 1 || opts.alwaysDisc ? String(item.discTotal) : "",
    date: r.date || r.year || "", genre: r.genre || "", composer: t.composer || "", lyricist: t.lyricist || "", isrc: t.isrc || "",
    explicit: t.explicit ? "explicit" : "", label: r.label || "", catalogNumber: r.catalog || "", barcode: r.barcode || "", media: f.media || "",
    language: r.language || "", copyright: r.copyright || "", encodedBy: x.by || "", encoder: "Encore Restore", grouping: r.collection || "",
  };
  // credits with a field of their own (producer, engineer...), the rest as performers
  const performers = [];
  for (const c of [...(project.credits || []), ...(t.credits || [])]) {
    if (!c.name) continue;
    const k = CREDIT_FIELD.find(([re]) => re.test(c.role || ""))?.[1];
    if (k) fields[k] = fields[k] ? `${fields[k]}; ${c.name}` : c.name;
    else performers.push(c.role ? `${c.name} (${c.role})` : c.name);
  }
  const comment = [`Source: ${[r.formatDetails || f.media, r.label && `label ${r.label}`, r.catalog && `catalog ${r.catalog}`, p.name].filter(Boolean).join(", ")}.`];
  const chain = [x.deck, x.cartridge, x.stylus, x.preamp, x.adc].filter(Boolean).join(" / ");
  if (chain || x.date || x.by) comment.push(`Transfer: ${[chain, x.date && `on ${x.date}`, x.by && `by ${x.by}`].filter(Boolean).join(" ")}.`);
  comment.push(`Restored with Encore Restore: ${describeRestoration(p.settings, p.restored?.clicks)}.`);
  if (t.notes) comment.push(t.notes);
  fields.comment = comment.join(" ");
  const custom = [
    ["TRACK_POSITION", item.position], ["SIDE", p.name], ["RELEASECOUNTRY", r.country], ["STYLE", r.style], ["RELEASE_FORMAT", r.formatDetails],
    ["MATRIX_RUNOUT", p.matrix], ["CONDITION_MEDIA", r.conditionMedia], ["CONDITION_SLEEVE", r.conditionSleeve], ["PERFORMERS", performers.join("; ")],
    ["TRANSFER_DATE", x.date], ["TRANSFERRED_BY", x.by], ["TRANSFER_DECK", x.deck], ["TRANSFER_CARTRIDGE", x.cartridge], ["TRANSFER_STYLUS", x.stylus],
    ["TRANSFER_PREAMP", x.preamp], ["TRANSFER_ADC", x.adc], ["TRANSFER_SETTINGS", x.settings],
    ["TRANSFER_SPEED", p.rpm ? `${rpmName(p.rpm)} rpm${p.playedAt && p.playedAt !== p.rpm ? `, played at ${rpmName(p.playedAt)}` : ""}` : ""],
    ["ARCHIVE_ID", x.archiveId], ["ARCHIVE_NOTES", x.notes], ["RESTORATION", describeRestoration(p.settings, p.restored?.clicks)],
    ["LINER_NOTES", opts.linerNotes === false ? "" : r.linerNotes], ["SIDE_NOTES", p.notes],
  ].filter(([, v]) => v != null && String(v).trim() !== "").map(([name, value]) => ({ name, value: String(value) }));
  for (const k of Object.keys(fields)) if (fields[k] === "") delete fields[k];
  return { fields, custom };
}
// The pictures for one track: the front cover always (if there is one), the rest when embedAll
export function picturesFor(project, item, embedAll = false) {
  const kinds = Object.fromEntries(IMAGE_KINDS.map(([k, , n]) => [k, n]));
  return (project.images || []).filter((im) => im.kind === "front" || (embedAll && (im.kind !== "label" || !im.part || im.part === item.part.id)))
    .sort((a, b) => (a.kind === "front" ? -1 : b.kind === "front" ? 1 : 0)).map((im) => ({ type: kinds[im.kind] ?? 0, kind: im.kind, desc: imageName(project, im), image: im }));
}
export function imageName(project, im) {
  const k = IMAGE_KINDS.find((x) => x[0] === im.kind)?.[1] ?? "Image";
  const part = im.part ? project.parts.find((p) => p.id === im.part) : null;
  const same = (project.images || []).filter((x) => x.kind === im.kind && x.part === im.part);
  return `${k}${part ? ` ${part.name}` : ""}${same.length > 1 ? ` ${same.indexOf(im) + 1}` : ""}`;
}

// ======================================================================
// The catalog: JSON and CSV describing the release, tracks, transfer, fixes
// ======================================================================
const slimSettings = (s) => (s ? JSON.parse(JSON.stringify(s, (k, v) => (ArrayBuffer.isView(v) ? undefined : k === "curve" && v && typeof v === "object" ? "(measured wow curve)" : v))) : null);
// files: { [trackKey]: { flac: "path", ... } } ; extra: { raw: { partId: path }, artwork: [{ kind, path }] }
export function catalogJSON(project, items, files = {}, extra = {}) {
  const r = project.release;
  return JSON.stringify({
    app: "Encore Restore", catalogVersion: 1, exported: extra.exported || new Date().toISOString(), projectId: project.id,
    release: { ...r, format: formatOf(project.format).name, media: formatOf(project.format).media, discs: items.length ? items[0].discTotal : 0 },
    credits: project.credits || [], transfer: project.transfer || {},
    artwork: extra.artwork || [],
    parts: project.parts.map((p) => ({ name: p.name, letter: p.letter, disc: p.disc, included: p.include !== false, speedRpm: p.rpm || null, playedAtRpm: p.playedAt || null,
      matrix: p.matrix || "", notes: p.notes || "", source: p.audio ? { file: p.audio.name, recorded: !!p.audio.recorded, seconds: p.audio.seconds, sampleRate: p.audio.fs, bits: p.audio.bits, channels: p.audio.channels, device: p.audio.device || undefined } : null,
      rawTransfer: extra.raw?.[p.id] || null, restoration: { summary: describeRestoration(p.settings, p.restored?.clicks), settings: slimSettings(p.settings), clicksRepaired: p.restored?.clicks?.total ?? null, lufsIn: p.restored?.lufsIn ?? null, lufsOut: p.restored?.lufsOut ?? null },
      tracks: p.tracks.length })),
    tracks: items.map((it) => ({ number: it.number, trackTotal: it.trackTotal, disc: it.disc, position: it.position, side: it.part.name,
      title: it.track.title, artist: it.track.artist || r.artist, featuring: it.track.featuring || "", composer: it.track.composer || "", lyricist: it.track.lyricist || "",
      isrc: it.track.isrc || "", explicit: !!it.track.explicit, notes: it.track.notes || "", credits: it.track.credits || [],
      start: it.track.start, end: it.track.end, duration: it.track.start != null ? +(it.track.end - it.track.start).toFixed(2) : null, files: files[trackKey(it)] || {} })),
  }, null, 2);
}
export const trackKey = (it) => `${it.part.id}:${it.index}`;
const csvCell = (v) => { const s = String(v ?? ""); return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function catalogCSV(project, items, files = {}) {
  const r = project.release, fmts = [...new Set(Object.values(files).flatMap((f) => Object.keys(f)))];
  const head = ["disc", "track", "position", "side", "title", "artist", "featuring", "composer", "lyricist", "duration", "start", "end", "isrc", "explicit", "notes",
    "album", "album_artist", "label", "catalog", "year", "country", "genre", "style", ...fmts.map((f) => `file_${f}`)];
  const rows = items.map((it) => { const t = it.track; return [it.disc, it.number, it.position, it.part.name, t.title, t.artist || r.artist, t.featuring, t.composer, t.lyricist,
    t.start != null ? fmtDuration(t.end - t.start) : "", t.start != null ? t.start.toFixed(2) : "", t.end != null ? t.end.toFixed(2) : "", t.isrc, t.explicit ? "yes" : "", t.notes,
    r.title, r.albumArtist || r.artist, r.label, r.catalog, r.year || r.date, r.country, r.genre, r.style, ...fmts.map((f) => files[trackKey(it)]?.[f] ?? "")]; });
  return "﻿" + [head, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

// ======================================================================
// Copying fix choices between sides
// ======================================================================
// "Use the same settings as Side A": the choices (which fixes, how strong) come
// across; what was measured on this side (its noise, hum, speed, wobble,
// azimuth) stays this side's own.
export function copyChoices(from, to) {
  const out = structuredClone(to);
  for (const m of ["rumble", "declick", "eq"]) out[m] = { ...structuredClone(from[m]) };
  out.channels = { ...out.channels, on: from.channels.on, mode: from.channels.mode, alignOn: from.channels.alignOn && out.channels.alignOn, balanceOn: from.channels.balanceOn, flip: from.channels.flip };
  out.dehum = { ...out.dehum, on: from.dehum.on && out.dehum.harmonics.length > 0, width: from.dehum.width };
  out.denoise = { ...out.denoise, on: from.denoise.on && !!out.denoise.profile, amount: from.denoise.amount };
  out.speed = { ...out.speed, rpm: from.speed.rpm, a4: from.speed.a4 };
  out.wow = { ...out.wow, amount: from.wow.amount, on: from.wow.on && !!out.wow.curve };
  return out;
}

// ======================================================================
// Speed per part
// ======================================================================
// The RPM_FIXES entry for "cut at X, played at Y", or the cents it needs when
// there's no entry for that pair
export function speedFix(cutRpm, playedRpm) {
  const cut = rpmValue(cutRpm), played = rpmValue(playedRpm);
  if (!(cut > 0) || !(played > 0) || Math.abs(cut - played) < 1e-6) return { rpm: "none", cents: 0 };
  const hit = RPM_FIXES.find((r) => r.from && Math.abs(r.from - played) < 0.05 && Math.abs(r.to - cut) < 0.05);
  return hit ? { rpm: hit.id, cents: 0 } : { rpm: "none", cents: +(1200 * Math.log2(cut / played)).toFixed(2) };
}

// ======================================================================
// Save and load
// ======================================================================
const reviveF32 = (v) => (v && typeof v === "object" ? (Array.isArray(v.f32) ? Float32Array.from(v.f32) : Array.isArray(v) ? v.map(reviveF32) : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, reviveF32(x)]))) : v);
const plainF32 = (s) => JSON.parse(JSON.stringify(s, (k, v) => (ArrayBuffer.isView(v) ? { f32: Array.from(v, (x) => +x.toPrecision(6)) } : v)));
// images: [{ ..., bytes: Uint8Array }] (the page reads its Blobs first). The
// audio isn't in the file: each part says which file it came from.
export function toProjectFile(project, images = project.images) {
  const p = plainF32({ ...project, images: [], parts: project.parts.map((x) => ({ ...x, restored: x.restored ? { key: x.restored.key, clicks: x.restored.clicks && { total: x.restored.clicks.total, long: x.restored.clicks.long }, lufsIn: x.restored.lufsIn, lufsOut: x.restored.lufsOut } : null, audio: x.audio ? { ...x.audio, store: undefined } : null })) });
  p.images = images.map((im) => ({ id: im.id, kind: im.kind, part: im.part || null, name: im.name || "", mime: im.mime, b64: toBase64(im.bytes) }));
  p.savedAt = new Date().toISOString();
  return JSON.stringify(p);
}
export function fromProjectFile(text) {
  const p = typeof text === "string" ? JSON.parse(text) : text;
  if (p?.app !== "Encore Restore") throw new Error("That isn't an Encore Restore project file.");
  if (p.kind !== "project") return upgradeV1(p);
  const out = reviveF32({ ...p, images: [] });
  out.images = (p.images || []).map((im) => ({ id: im.id || uid(), kind: im.kind, part: im.part || null, name: im.name || "", mime: im.mime, bytes: fromBase64(im.b64 || "") }));
  for (const part of out.parts) { part.audio = part.audio ? { ...part.audio, store: null, missing: true } : null; part.tracks ??= []; }
  return out;
}
// The old one-file project (version 1): one part, the notes as release and transfer fields
function upgradeV1(old) {
  const fmt = { lp: "lp", 78: "78", cassette: "cassette", "8track": "8track", reel: "reel", cd: "cd" }[old.source] ?? "other";
  const p = newProject(fmt);
  p.parts = [p.parts[0]];
  const n = old.notes || {}, part = p.parts[0];
  Object.assign(p.release, { artist: n.artist || "", title: n.album || "", year: n.year || "", label: n.label || "", catalog: n.catalog || "", formatDetails: n.format || p.release.formatDetails });
  Object.assign(p.transfer, { deck: n.deck || "", cartridge: n.cartridge || "", stylus: n.stylus || "", date: n.date || p.transfer.date, by: n.who || "", notes: n.notes || "" });
  if (n.side) part.name = n.side;
  part.settings = old.settings ? reviveF32(old.settings) : null;
  part.tracks = (old.tracks || []).map((t) => ({ ...blankTrack(), ...t }));
  part.audio = old.file ? { name: old.file.name, size: old.file.size, seconds: old.file.seconds, missing: true } : null;
  return p;
}

// ======================================================================
// Progress: what's done, what's left
// ======================================================================
// rt(partId) -> { restoredFresh } (what only the page knows). Returns
// { rows: [{ part, audio, tracks, named, placed, restored, exported }], left: [text], done: n, of: n }
export function releaseProgress(project, rt = () => ({})) {
  const rows = [], left = [];
  for (const p of project.parts) {
    const info = rt(p.id) || {};
    const placed = p.tracks.filter((t) => t.start != null).length, named = p.tracks.filter((t) => String(t.title || "").trim() && !/^Track \d+$/.test(t.title)).length;
    const row = { part: p, include: p.include !== false, audio: !!p.audio && !p.audio.missing, missing: !!p.audio?.missing, tracks: p.tracks.length, placed, named,
      restored: !!info.restoredFresh, exported: !!info.exportedFresh };
    rows.push(row);
    if (!row.include) continue;
    if (!row.audio) { left.push(row.missing ? `${p.name}: open its audio file again (${p.audio.name})` : `${p.name}: record it or open its file`); continue; }
    if (!p.tracks.length) left.push(`${p.name}: find or set its tracks`);
    else if (placed < p.tracks.length) left.push(`${p.name}: place ${p.tracks.length - placed} track split${p.tracks.length - placed === 1 ? "" : "s"}`);
    if (p.tracks.length && named < p.tracks.length) left.push(`${p.name}: name ${p.tracks.length - named} track${p.tracks.length - named === 1 ? "" : "s"}`);
    if (!row.restored) left.push(`${p.name}: restore it (or let the export do it)`);
  }
  const r = project.release;
  if (!r.artist && !r.albumArtist) left.push("Release: add the artist");
  if (!r.title) left.push("Release: add the title");
  if (!(project.images || []).some((im) => im.kind === "front")) left.push("Release: add a front cover image");
  const inc = rows.filter((x) => x.include);
  if (inc.length && !inc.every((x) => x.exported)) left.push("Export: not exported with the latest changes yet");
  const steps = inc.length * 4, done = inc.reduce((a, x) => a + (x.audio ? 1 : 0) + (x.tracks && x.placed === x.tracks ? 1 : 0) + (x.tracks && x.named === x.tracks ? 1 : 0) + (x.restored ? 1 : 0), 0);
  return { rows, left, done, of: steps };
}

export { defaultSettings };

// ======================================================================
// Recording a side: is it over? (the run-out groove, or the tape running on)
// ======================================================================
// Fed the level of each ~quarter-second batch while recording. Says "it's
// over" once the last `seconds` have all sat down at the side's own noise
// floor (the lead-in groove, the gaps: the quietest it has been), well under
// its music, or in digital silence, and only after some music. Judged against
// the side itself, so a hissy 78 or a humming transfer stops as surely as a
// quiet LP.
export class QuietWatch {
  constructor({ seconds = 15, minMusic = 20 } = {}) { this.seconds = seconds; this.minMusic = minMusic; this.hist = new Uint32Array(240); this.count = 0; this.recent = []; this.quietFor = 0; this.music = 0; }
  pct(p) { // from a 0.5 dB histogram of -120..0 dBFS
    const want = Math.max(1, Math.ceil(this.count * p));
    for (let i = 0, acc = 0; i < this.hist.length; i++) { acc += this.hist[i]; if (acc >= want) return -120 + i * 0.5; }
    return 0;
  }
  push(db, sec) {
    this.hist[Math.max(0, Math.min(this.hist.length - 1, Math.round((db + 120) * 2)))]++; this.count++;
    this.recent.push(db); if (this.recent.length > 8) this.recent.shift();
    const med = [...this.recent].sort((x, y) => x - y)[this.recent.length >> 1];
    const floor = this.pct(0.03), ref = this.pct(0.95), range = ref - floor;
    if (range >= 12 && med > floor + 0.5 * range) this.music += sec;
    const quiet = med < -90 || (range >= 12 && med < floor + Math.max(3, 0.25 * range));
    this.quietFor = quiet ? this.quietFor + sec : 0;
    return this.music >= this.minMusic && this.quietFor >= this.seconds;
  }
}

// What the export can write (the encoders are in restore-export.js)
export const EXPORT_FORMATS = [
  { id: "flac", name: "FLAC", sub: "Lossless, the archive copy", ext: "flac", folder: "FLAC" },
  { id: "wav", name: "WAV 24-bit", sub: "Lossless, opens anywhere", ext: "wav", folder: "WAV 24-bit" },
  { id: "mp3", name: "MP3 320", sub: "For sharing and old players", ext: "mp3", folder: "MP3 320" },
  { id: "m4a", name: "AAC 256", sub: "M4A, for Apple Music and phones", ext: "m4a", folder: "AAC 256" },
];
