// Encore Tag: reading and writing tags for every format, with no page in it,
// so the same code runs in the browser and in Node (test-tag.mjs).
//   readTags      what's in a file: format info, every tag (nothing hidden:
//                 tags we don't edit are listed in model.other and kept)
//   writeTags     a new copy of the file with the new tags. The audio bytes
//                 are copied untouched; only the tag parts are rebuilt.
//   verifyWrite   the safety check after writing: the audio bytes compared
//                 one for one with the original's, the new file read back
//                 with our reader and with Last Call's (an independent one)
//   helpers       file-name patterns, title case, CSV / JSON for an album
//
// The model (one per file):
//   { format: mp3 | wav | aiff | flac | ogg | opus | m4a,
//     fields: { title, artist, ... } (strings; see tag-fields.js),
//     multi: { key: [values] }   a field that had several values (shown joined
//                                with "; "; written back separately if unedited)
//     custom: [{ name, value }], pictures: [{ type, mime, desc, bytes }],
//     synced: LRC text, other: [kept items], notes: [plain-English notes],
//     readOnly: null or why this file can't be written, info: { format info } }
import { FIELDS, FIELD, SYSTEM, canStore } from "./tag-fields.js";
import { str, le32, be32, be16, concat, u32le, u32be, equalBytes, utf8Bytes, utf8OrLatin1, latin1Bytes, latin1, sniffMime } from "./tag-bin.js";
import { parseId3v2, id3ToModel, buildId3v2, readId3v1, buildId3v1, lrcToLines, genreName } from "./tag-id3.js";
import { readComments, buildComments, commentsToModel, modelToComments, readPictureBlock, buildPictureBlock, validName } from "./tag-vorbis.js";
import { readMp4Tags, writeMp4, mp4Chunks, mp4Storable, locate, boxes } from "./tag-mp4.js";
import { readOgg, writeOgg, oggPages, oggCrc } from "./tag-ogg.js";
import { readFileInfo, imageInfo, isrcCheck } from "./lastcall-core.js";

export { FIELDS, FIELD, canStore, imageInfo, isrcCheck };
export const EXTENSIONS = { mp3: "mp3", wav: "wav", aiff: "aiff", flac: "flac", ogg: "ogg", opus: "opus", m4a: "m4a" };

const emptyModel = (format) => ({ format, fields: {}, multi: {}, custom: [], pictures: [], synced: "", other: [], notes: [], readOnly: null, info: {}, id3: {} });

export function detect(u8) {
  const h4 = str(u8, 0, 4);
  if (h4 === "RIFF" && str(u8, 8, 4) === "WAVE") return "wav";
  if (h4 === "RF64" && str(u8, 8, 4) === "WAVE") return "wav";
  if (h4 === "FORM" && /^AIF[FC]$/.test(str(u8, 8, 4))) return "aiff";
  if (h4 === "OggS") return "ogg";
  if (str(u8, 4, 4) === "ftyp") return "m4a";
  if (h4 === "fLaC") return "flac";
  if (str(u8, 0, 3) === "ID3") { // MP3, or a FLAC with an ID3 tag stuck on the front
    let o = 0;
    while (str(u8, o, 3) === "ID3" && o + 10 <= u8.length) { const t = parseId3v2(u8, o); if (!t || t.size <= 10 && !t.frames.length && t.unsupported) break; o += t.size; }
    if (str(u8, o, 4) === "fLaC") return "flac";
    return "mp3";
  }
  const info = readFileInfo(u8.subarray(0, Math.min(u8.length, 1 << 18)));
  return info.container === "mp3" ? "mp3" : null;
}

// ---------- layouts: where the tags and the audio are ----------
function mp3Layout(u8) {
  const tags = [];
  let o = 0;
  while (o + 10 <= u8.length && str(u8, o, 3) === "ID3") { const t = parseId3v2(u8, o); tags.push(t); o += t.size; }
  let end = u8.length;
  const v1 = readId3v1(u8);
  if (v1) end -= 128;
  return { tags, start: Math.min(o, u8.length), end, v1, ape: end >= 32 && str(u8, end - 32, 8) === "APETAGEX", id3End: end >= 10 && str(u8, end - 10, 3) === "3DI" };
}
function riffChunks(u8, bigEndian, from) {
  const out = [], size32 = bigEndian ? be32 : le32;
  let p = from;
  while (p + 8 <= u8.length) {
    const id = str(u8, p, 4), size = size32(u8, p + 4);
    if (!/^[\x20-\x7e]{4}$/.test(id)) throw new Error(`The file has damaged data near byte ${p}.`);
    const end = p + 8 + size;
    if (end > u8.length) {
      if (id === "data" || id === "SSND") throw new Error("This file looks cut short: its audio is shorter than its header says. Tagging it could make it worse, so it's read only.");
      throw new Error(`The file has a damaged ${id.trim()} section at its end.`);
    }
    out.push({ id, start: p, body: p + 8, end });
    p = end + (size & 1 && end < u8.length ? 1 : 0); // chunks are word aligned (the pad byte may be missing at the very end)
  }
  if (p < u8.length) out.trailing = u8.subarray(p);
  return out;
}
function flacLayout(u8) {
  let o = 0;
  while (str(u8, o, 3) === "ID3") { const t = parseId3v2(u8, o); o += t.size; }
  if (str(u8, o, 4) !== "fLaC") throw new Error("This isn't a FLAC file.");
  const blocks = [];
  let p = o + 4, last = false;
  while (!last) {
    if (p + 4 > u8.length) throw new Error("This FLAC file's header is cut short.");
    last = !!(u8[p] & 0x80);
    const type = u8[p] & 0x7f, len = (u8[p + 1] << 16) | (u8[p + 2] << 8) | u8[p + 3];
    if (p + 4 + len > u8.length) throw new Error("This FLAC file's header is cut short.");
    blocks.push({ type, start: p, body: p + 4, end: p + 4 + len });
    p += 4 + len;
  }
  if (!blocks.length || blocks[0].type !== 0) throw new Error("This FLAC file's stream info block is missing.");
  return { prefix: o, blocks, audio: p };
}

// RIFF INFO ids written into WAV files
const RIFF_KEY = Object.fromEntries(FIELDS.filter((f) => f.riff).map((f) => [f.riff, f.key]));
RIFF_KEY.IPRT = "track";

// ---------- reading ----------
export function readTags(bytes, name = "") {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const format = detect(u8);
  if (!format) { const m = emptyModel(null); m.readOnly = "This doesn't look like an audio file this tool knows (MP3, WAV, FLAC, M4A, AIFF, Ogg Vorbis or Opus)."; return m; }
  const m = emptyModel(format);
  const li = readFileInfo(u8, name);
  m.info = { name, size: u8.length, label: li.label, codec: li.codec, sampleRate: li.sampleRate, bitDepth: li.bitDepth, float: li.float, channels: li.channels,
    bitrate: li.bitrate, vbr: li.vbr, duration: li.duration, lossy: li.lossy, tagFormats: [] };
  try {
    if (format === "mp3") readMp3(u8, m);
    else if (format === "wav") readWav(u8, m);
    else if (format === "aiff") readAiff(u8, m);
    else if (format === "flac") readFlac(u8, m);
    else if (format === "m4a") { readMp4Tags(u8, m); m.info.tagFormats.push("iTunes-style (ilst)"); }
    else readOggFile(u8, m);
  } catch (e) { m.readOnly = e.message || "This file is damaged."; }
  for (const k of Object.keys(m.fields)) if (m.fields[k] === undefined || m.fields[k] === null) delete m.fields[k];
  return m;
}

function readMp3(u8, m) {
  const L = mp3Layout(u8);
  for (const t of L.tags) {
    if (t.unsupported) { m.notes.push(`This file has an ID3v2.${t.ver} tag this tool can't read; it will be replaced.`); continue; }
    id3ToModel(t, m);
    m.info.tagFormats.push(`ID3v2.${t.ver}`);
  }
  if (L.tags.length > 1) m.notes.push(`This file had ${L.tags.length} ID3 tags in a row. The saved copy has one, with everything from all of them.`);
  m.id3.version = L.tags[0]?.ver === 4 ? 4 : 3;
  m.id3.hadV1 = !!L.v1;
  if (L.v1) {
    m.info.tagFormats.push("ID3v1");
    for (const [k, v] of Object.entries(L.v1)) if (v && (m.fields[k] === undefined || m.fields[k] === "")) m.fields[k] = v;
  }
  if (L.ape) m.notes.push("This file also has an APE tag at the end. It's kept as is (this tool edits the ID3 tag, which nearly every player reads).");
  if (L.id3End) m.notes.push("This file has a second ID3 tag at its end. It's kept as is.");
  if (L.start >= L.end) m.readOnly = "This MP3 has no audio after its tags.";
}

function readInfoList(u8, c, m, into) {
  for (let p = c.body + 4; p + 8 <= c.end;) {
    const id = str(u8, p, 4), size = le32(u8, p + 4), body = u8.subarray(p + 8, Math.min(c.end, p + 8 + size));
    const text = utf8OrLatin1(body).replace(/\0+$/, "");
    const key = RIFF_KEY[id] ?? (id === "ISRC" && isrcCheck(text).valid ? "isrc" : null);
    if (key && into[key] === undefined) into[key] = text;
    else m.other.push({ sys: "riff", id, label: "RIFF INFO " + id, text, size, raw: u8.slice(p, p + 8 + size) });
    p += 8 + size + (size & 1);
  }
}
function readWav(u8, m) {
  if (str(u8, 0, 4) === "RF64") { m.readOnly = "This is an RF64 (very large) WAV. Reading it works, but writing tags into RF64 isn't supported yet."; }
  const info = {};
  for (const c of riffChunks(u8, false, 12)) {
    if (c.id === "LIST" && str(u8, c.body, 4) === "INFO") { readInfoList(u8, c, m, info); m.info.tagFormats.push("RIFF INFO"); }
    else if (c.id === "id3 " || c.id === "ID3 ") {
      const t = parseId3v2(u8, c.body);
      if (t && !t.unsupported) { id3ToModel(t, m); m.info.tagFormats.push(`ID3v2.${t.ver} (id3 chunk)`); m.id3.version ??= t.ver === 4 ? 4 : 3; }
    } else if (c.id === "data" && (le32(u8, c.start + 4) === 0 || le32(u8, c.start + 4) === 0xffffffff)) m.readOnly = "This WAV's audio size isn't filled in (it was saved while still recording). Tagging it isn't safe.";
  }
  for (const [k, v] of Object.entries(info)) if (m.fields[k] === undefined || m.fields[k] === "") m.fields[k] = k === "track" ? v.split("/")[0] : v;
}
const AIFF_TEXT = { NAME: "title", AUTH: "artist", "(c) ": "copyright", ANNO: "comment" };
function readAiff(u8, m) {
  const text = {};
  for (const c of riffChunks(u8, true, 12)) {
    if (c.id === "ID3 " || c.id === "id3 ") {
      const t = parseId3v2(u8, c.body);
      if (t && !t.unsupported) { id3ToModel(t, m); m.info.tagFormats.push(`ID3v2.${t.ver} (ID3 chunk)`); m.id3.version ??= t.ver === 4 ? 4 : 3; }
    } else if (AIFF_TEXT[c.id] && text[AIFF_TEXT[c.id]] === undefined) {
      text[AIFF_TEXT[c.id]] = utf8OrLatin1(u8.subarray(c.body, c.end)).replace(/\0+$/, "");
      m.info.tagFormats.includes("AIFF text") || m.info.tagFormats.push("AIFF text");
    }
  }
  for (const [k, v] of Object.entries(text)) if (m.fields[k] === undefined || m.fields[k] === "") m.fields[k] = v;
}
function readFlac(u8, m) {
  const L = flacLayout(u8);
  if (L.prefix) m.notes.push("This FLAC file also has an ID3 tag in front of it, which isn't standard for FLAC and makes some players show old tags. The saved copy leaves it out (the FLAC tags edited here are the real ones).");
  for (const b of L.blocks) {
    const body = u8.subarray(b.body, b.end);
    if (b.type === 4) { const r = readComments(body); m.vendor ??= r.vendor; commentsToModel(r.list, m); m.info.tagFormats.push("Vorbis comments"); }
    else if (b.type === 6) m.pictures.push(readPictureBlock(body));
  }
}
function readOggFile(u8, m) {
  const o = readOgg(u8);
  if (o.codec !== "vorbis" && o.codec !== "opus") { m.readOnly = o.codec === "flac" ? "FLAC inside Ogg is rare and isn't supported for tagging. Plain .flac files are." : "This Ogg file holds a kind of audio this tool doesn't tag (only Vorbis and Opus)."; return; }
  m.format = o.codec === "opus" ? "opus" : "ogg";
  m.vendor = o.vendor;
  commentsToModel(o.list, m, { pictures: true });
  m.info.tagFormats.push(o.codec === "opus" ? "OpusTags" : "Vorbis comments");
  if (o.duration) m.info.duration = o.duration;
}

// ---------- normalizing ----------
// Names that are really a standard field in this format (a custom "LABEL" is the Record label field)
const NAME_KEY = { id3: {}, vorbis: {}, mp4: {} };
for (const f of FIELDS) {
  if (f.id3?.startsWith("TXXX:")) NAME_KEY.id3[f.id3.slice(5).toUpperCase()] = f.key;
  if (f.vorbis) NAME_KEY.vorbis[f.vorbis] = f.key;
  for (const a of f.valt || []) NAME_KEY.vorbis[a] = f.key;
  if (f.mp4?.startsWith("----:")) NAME_KEY.mp4[f.mp4.slice(5).toUpperCase()] = f.key;
}
Object.assign(NAME_KEY.id3, { EXPLICIT: "explicit", UPC: "barcode", LABEL: "label", "CATALOG NUMBER": "catalogNumber", INITIALKEY: "key", ORIGINALYEAR: "originalDate" });
NAME_KEY.vorbis.EXPLICIT = "explicit";
Object.assign(NAME_KEY.mp4, { KEY: "key", UPC: "barcode" });
const SPECIAL = new Set(["explicit", "compilation", "podcast", "rating", "track", "trackTotal", "disc", "discTotal", "movement", "movementTotal", "bpm"]);

export function cloneModel(m) {
  return { ...m, fields: { ...m.fields }, multi: Object.fromEntries(Object.entries(m.multi || {}).map(([k, v]) => [k, [...v]])), custom: (m.custom || []).map((c) => ({ ...c })),
    pictures: (m.pictures || []).map((p) => ({ ...p })), other: (m.other || []).map((o) => ({ ...o })), notes: [...(m.notes || [])], id3: { ...(m.id3 || {}) } };
}

// A copy ready to write: custom fields with a standard name moved into that field,
// empty custom rows dropped, text cleaned of zero characters
export function normalizeModel(model) {
  const m = cloneModel(model), sys = SYSTEM[m.format];
  for (const k of Object.keys(m.fields)) {
    const v = m.fields[k];
    if (v === undefined || v === null) delete m.fields[k];
    else m.fields[k] = String(v).replace(/\0/g, "");
  }
  const keep = [];
  for (const c of m.custom) {
    const name = String(c.name ?? "").trim(), value = String(c.value ?? "").replace(/\0/g, "");
    if (!name || value.trim() === "") continue;
    if (sys === "vorbis" && !validName(name)) { m.notes.push(`The custom field name "${name}" has characters FLAC and Ogg names can't use (only plain letters, numbers, spaces and punctuation other than "="). It was left out.`); continue; }
    const key = NAME_KEY[sys]?.[name.toUpperCase()];
    if (key && !SPECIAL.has(key)) {
      const cur = m.fields[key];
      if (cur === undefined || cur.trim() === "") { m.fields[key] = value; delete m.multi[key]; }
      else {
        const vals = [...(m.multi[key] && m.multi[key].join("; ") === cur ? m.multi[key] : [cur]), ...(c.values && c.values.join("; ") === value ? c.values : [value])];
        m.multi[key] = vals; m.fields[key] = vals.join("; ");
      }
      continue;
    }
    keep.push({ ...c, name, value });
  }
  m.custom = keep;
  return m;
}

// ---------- writing ----------
// opts: { id3Version: 3 | 4 (MP3, WAV, AIFF), id3v1: "update" | "remove" }
export function writeTags(bytes, model, opts = {}) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (model.readOnly) throw new Error(model.readOnly);
  const m = normalizeModel(model), notes = [];
  for (const [k, v] of Object.entries(m.fields)) if (v.trim() !== "" && canStore(m.format, k) !== true) notes.push(`${FIELD[k]?.label ?? k} can't be stored in this format and was left out.`);
  const ver = opts.id3Version === 4 ? 4 : opts.id3Version === 3 ? 3 : m.id3?.version === 4 ? 4 : 3;
  let out;
  if (m.format === "mp3") {
    const L = mp3Layout(u8), tag = buildId3v2(m, { version: ver });
    notes.push(...tag.notes);
    const v1 = L.v1 && opts.id3v1 !== "remove" ? buildId3v1(m.fields) : new Uint8Array(0);
    out = concat([tag.bytes, u8.subarray(L.start, L.end), v1]);
  } else if (m.format === "wav") out = writeWav(u8, m, ver, notes);
  else if (m.format === "aiff") out = writeAiff(u8, m, ver, notes);
  else if (m.format === "flac") out = writeFlac(u8, m);
  else if (m.format === "m4a") { const r = writeMp4(u8, m); notes.push(...r.notes); out = r.bytes; }
  else if (m.format === "ogg" || m.format === "opus") out = writeOgg(u8, modelToComments(m, { pictures: true, format: m.format }));
  else throw new Error("This file can't be written.");
  return { bytes: out, notes };
}

function riffChunk(id, body, bigEndian) {
  const head = concat([latin1Bytes(id), bigEndian ? u32be(body.length) : u32le(body.length)]);
  return concat([head, body, body.length & 1 ? new Uint8Array(1) : new Uint8Array(0)]);
}
function writeWav(u8, m, ver, notes) {
  const parts = [], kept = riffChunks(u8, false, 12);
  for (const c of kept) {
    if ((c.id === "LIST" && str(u8, c.body, 4) === "INFO") || c.id === "id3 " || c.id === "ID3 ") continue;
    parts.push(riffChunk(c.id, u8.subarray(c.body, c.end), false)); // copied as is (its pad byte added if it was missing)
  }
  if (kept.trailing?.length) notes.push(`${kept.trailing.length} stray byte(s) at the end of the file were left out (they weren't part of any section).`);
  // tags after the audio: the id3 chunk (what music apps read, with the cover), then INFO (Windows)
  const tag = buildId3v2(m, { version: ver, padding: 0 });
  notes.push(...tag.notes);
  parts.push(riffChunk("id3 ", tag.bytes, false));
  const info = [latin1Bytes("INFO")];
  for (const f of FIELDS) {
    if (!f.riff) continue;
    const v = m.fields[f.key];
    if (v === undefined || v.trim() === "") continue;
    info.push(riffChunk(f.riff, concat([utf8Bytes(v), new Uint8Array(1)]), false)); // zero-terminated text
  }
  for (const o of m.other) if (o.sys === "riff" && !o.remove) info.push(concat([o.raw, o.raw.length & 1 ? new Uint8Array(1) : new Uint8Array(0)]));
  if (info.length > 1) parts.push(riffChunk("LIST", concat(info), false));
  const body = concat(parts), riffSize = 4 + body.length;
  if (riffSize > 0xffffffff) throw new Error("The file would be over 4 GB, which WAV can't hold.");
  return concat([latin1Bytes("RIFF"), u32le(riffSize), latin1Bytes("WAVE"), body]);
}
function writeAiff(u8, m, ver, notes) {
  const parts = [], kept = riffChunks(u8, true, 12);
  const tag = buildId3v2(m, { version: ver, padding: 0 }), id3Chunk = riffChunk("ID3 ", tag.bytes, true);
  notes.push(...tag.notes);
  for (const c of kept) {
    if (c.id === "ID3 " || c.id === "id3 ") continue;
    const key = AIFF_TEXT[c.id];
    if (key) { // the old AIFF text chunks: kept in step with the tags
      const v = m.fields[key];
      if (v?.trim()) parts.push(riffChunk(c.id, utf8Bytes(v), true));
      continue;
    }
    parts.push(riffChunk(c.id, u8.subarray(c.body, c.end), true));
    // the ID3 chunk goes right after COMM, ahead of the old text chunks, so readers that take the first title they meet get the full one
    if (c.id === "COMM") parts.push(id3Chunk);
  }
  if (!kept.some((c) => c.id === "COMM")) parts.push(id3Chunk);
  if (kept.trailing?.length) notes.push(`${kept.trailing.length} stray byte(s) at the end of the file were left out.`);
  const body = concat(parts);
  return concat([latin1Bytes("FORM"), u32be(4 + body.length), u8.subarray(8, 12), body]);
}
function flacBlock(type, body, last) {
  if (body.length >= 1 << 24) throw new Error(type === 6 ? "A picture is over 16 MB, which FLAC can't hold. Use a smaller image." : "The tags are over 16 MB, which FLAC can't hold.");
  return concat([new Uint8Array([(last ? 0x80 : 0) | type, body.length >> 16, (body.length >> 8) & 255, body.length & 255]), body]);
}
function writeFlac(u8, m) {
  const L = flacLayout(u8), keep = L.blocks.filter((b) => b.type !== 1 && b.type !== 4 && b.type !== 6);
  const bodies = keep.map((b) => [b.type, u8.subarray(b.body, b.end)]);
  bodies.push([4, buildComments(m.vendor ?? "Encore Tag", modelToComments(m, { format: "flac" }))]);
  for (const p of m.pictures) if (p.bytes?.length) bodies.push([6, buildPictureBlock(p)]);
  // padding: keep the file the same size when the new tags fit in the old space, else leave 4 KB for next time
  const oldLen = L.audio - L.prefix - 4, newLen = bodies.reduce((a, [, b]) => a + 4 + b.length, 0);
  bodies.push([1, new Uint8Array(newLen + 4 <= oldLen ? oldLen - newLen - 4 : 4096)]);
  return concat([latin1Bytes("fLaC"), ...bodies.map(([t, b], i) => flacBlock(t, b, i === bodies.length - 1)), u8.subarray(L.audio)]);
}

// ---------- the audio, for comparing ----------
// Every part of the file that isn't tags, as named byte ranges
export function audioParts(bytes, format) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const out = [];
  if (format === "mp3") { const L = mp3Layout(u8); out.push(["audio", u8.subarray(L.start, L.end)]); }
  else if (format === "wav" || format === "aiff") {
    const tagIds = format === "wav" ? ["id3 ", "ID3 "] : ["ID3 ", "id3 ", ...Object.keys(AIFF_TEXT)];
    for (const c of riffChunks(u8, format === "aiff", 12)) {
      if (tagIds.includes(c.id) || (format === "wav" && c.id === "LIST" && str(u8, c.body, 4) === "INFO")) continue;
      out.push([c.id.trim(), u8.subarray(c.body, c.end)]);
    }
    out.push(["header type", u8.subarray(8, 12)]);
  } else if (format === "flac") {
    const L = flacLayout(u8);
    for (const b of L.blocks) if (![1, 4, 6].includes(b.type)) out.push(["block " + b.type, u8.subarray(b.body, b.end)]);
    out.push(["audio frames", u8.subarray(L.audio)]);
  } else if (format === "ogg" || format === "opus") {
    const o = readOgg(u8);
    out.push(["first header", o.headers[0]]);
    if (o.codec === "vorbis") out.push(["setup header", o.headers[2]]);
    for (const p of o.pages.slice(o.headerPages)) out.push(["page", concat([new Uint8Array([p.flags]), p.granule, u32le(p.serial), p.lace, p.body])]);
  } else if (format === "m4a") {
    const loc = locate(u8);
    if (loc.error) throw new Error(loc.error);
    for (const c of mp4Chunks(u8)) out.push([`track ${c.track} chunk`, u8.subarray(c.offset, c.offset + c.size)]);
    for (const b of loc.top) if (b.type !== "moov" && b.type !== "free" && b.type !== "skip") out.push([b.type, u8.subarray(b.start, b.end)]);
    // the tracks' own headers, with the chunk offsets (which may move) blanked out
    for (const t of boxes(u8, loc.moov.body, loc.moov.end)) if (t.type !== "udta") out.push([t.type, maskOffsets(u8, t)]);
  }
  return out;
}
function maskOffsets(u8, b) {
  const copy = u8.slice(b.start, b.end);
  const walk = (from, to) => {
    for (const c of boxes(copy, from, to)) {
      if (["trak", "mdia", "minf", "stbl"].includes(c.type)) walk(c.body, c.end);
      else if (c.type === "stco" || c.type === "co64") copy.fill(0, c.body + 8, c.end);
    }
  };
  if (["trak", "mdia", "minf", "stbl"].includes(b.type)) walk(8, copy.length);
  return copy;
}

// ---------- what a format will actually store ----------
const v23Date = (d) => { const x = /^(\d{4})(?:-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?)?/.exec(d); return !x ? d : x[1] + (x[3] ? `-${x[2]}-${x[3]}` + (x[5] ? `T${x[4]}:${x[5]}` : "") : ""); };
export function storableModel(model, opts = {}) {
  const m = normalizeModel(model), sys = SYSTEM[m.format];
  const ver = opts.id3Version === 4 ? 4 : opts.id3Version === 3 ? 3 : m.id3?.version === 4 ? 4 : 3;
  const f = {};
  for (const [k, v0] of Object.entries(m.fields)) {
    let v = v0;
    if (v.trim() === "" || canStore(m.format, k) !== true) continue;
    const t = FIELD[k]?.type;
    if (k === "explicit") v = v === "explicit" || v === "clean" ? v : "";
    else if (t === "flag") v = v === "1" ? "1" : "";
    else if (t === "rating") { const n = parseInt(v, 10); v = n >= 1 && n <= 5 ? String(n) : ""; }
    else if (sys === "mp4") v = mp4Storable(k, v);
    if (sys === "id3") {
      if (["track", "trackTotal", "disc", "discTotal", "movement", "movementTotal"].includes(k)) v = v.trim().split("/")[0].trim();
      if (k === "date" && ver === 3) v = v23Date(v.trim());
      if (k === "date" && ver === 4) v = v.trim();
      if (k === "originalDate" && ver === 3) v = (/^(\d{4})/.exec(v.trim()) || [, v.trim()])[1];
      if (k === "genre") v = (m.multi.genre?.join("; ") === v ? m.multi.genre : [v]).map(genreName).join("; ");
      if (k === "mbRecordingId") v = v.slice(0, 64);
      if ((FIELD[k]?.id3?.[0] === "W" && FIELD[k].id3 !== "WFED") || k === "mbRecordingId") v = latin1(latin1Bytes(v)); // stored as plain Latin-1
    }
    if (sys === "vorbis" && (k === "track" || k === "disc")) v = v.split("/")[0].trim();
    if (v !== "") f[k] = v;
  }
  if (sys === "mp4") { // a total with no number is still stored (as number 0)
    for (const [a, b] of [["track", "trackTotal"], ["disc", "discTotal"]]) if (!f[a] && f[b]) delete f[a];
  }
  const pictures = m.pictures.filter((p) => p.bytes?.length).map((p, i) => sys === "mp4"
    ? { type: i ? 0 : 3, mime: ["image/jpeg", "image/png", "image/bmp", "image/gif"].includes(p.mime) ? p.mime : sniffMime(p.bytes) || "image/jpeg", desc: "", bytes: p.bytes }
    : { type: p.type ?? 3, mime: String(p.mime || (sys === "vorbis" ? sniffMime(p.bytes) || "image/jpeg" : "image/jpeg")).toLowerCase(), desc: p.desc || "", bytes: p.bytes });
  const synced = sys === "id3" && lrcToLines(m.synced || "").length ? m.synced : "";
  return { format: m.format, fields: f, custom: m.custom.map((c) => ({ name: c.name, value: c.value })), pictures, synced, other: m.other.filter((o) => !o.remove && (sys !== "id3" || !o.frame || o.frame.data || o.frame.ver === ver)) };
}

// ---------- the check after writing ----------
// Returns { ok, checks: [{ name, ok, detail }], audioBytes }
export function verifyWrite(original, written, model, opts = {}) {
  const a = original instanceof Uint8Array ? original : new Uint8Array(original), b = written instanceof Uint8Array ? written : new Uint8Array(written);
  const checks = [], add = (name, ok, detail = "") => checks.push({ name, ok, detail });
  const format = model.format;
  let audioBytes = 0;
  // 1) the audio, byte for byte
  try {
    const pa = audioParts(a, format), pb = audioParts(b, format);
    let same = pa.length === pb.length, where = same ? "" : `${pa.length} parts before, ${pb.length} after`;
    for (let i = 0; same && i < pa.length; i++) {
      if (pa[i][0] !== pb[i][0] || !equalBytes(pa[i][1], pb[i][1])) { same = false; where = `${pa[i][0]} differs`; }
      audioBytes += pa[i][1].length;
    }
    add("Audio untouched", same, same ? `${audioBytes.toLocaleString("en-US")} bytes of audio compared, all identical` : where);
  } catch (e) { add("Audio untouched", false, e.message); }
  // 2) the structure
  if (format === "ogg" || format === "opus") {
    try {
      const A = readOgg(a), B = readOgg(b), pages = B.pages, bad = pages.filter((p) => oggCrc(b.subarray(p.start, p.end)) !== p.crc).length;
      // header pages numbered on from the first page; every later page keeps its place, shifted by the change in header pages
      const delta = B.headerPages - A.headerPages, base = A.pages[0].seq;
      const seqOk = pages.slice(0, B.headerPages).every((p, i) => p.seq === base + i) && pages.length - B.headerPages === A.pages.length - A.headerPages
        && pages.slice(B.headerPages).every((p, i) => p.seq === A.pages[A.headerPages + i].seq + delta);
      add("Ogg pages", !bad && seqOk, bad ? `${bad} page(s) with a bad checksum` : !seqOk ? "pages are numbered wrong" : `${pages.length} pages, numbered in order, checksums right`);
    } catch (e) { add("Ogg pages", false, e.message); }
  }
  if (format === "m4a") {
    try {
      const ca = mp4Chunks(a), cb = mp4Chunks(b), ok = ca.length === cb.length && cb.every((c) => c.offset + c.size <= b.length);
      add("Audio chunk offsets", ok, `${cb.length} chunks, all inside the file`);
    } catch (e) { add("Audio chunk offsets", false, e.message); }
  }
  // 3) the tags, read back
  const expect = storableModel(model, opts), back = readTags(b, model.info?.name || "");
  if (back.readOnly) add("Tags read back", false, back.readOnly);
  else {
    const got = storableModel(back, opts), bad = [];
    for (const k of new Set([...Object.keys(expect.fields), ...Object.keys(got.fields)])) {
      if ((expect.fields[k] ?? "") !== (got.fields[k] ?? "")) bad.push(`${FIELD[k]?.label ?? k}: expected "${short(expect.fields[k])}", read "${short(got.fields[k])}"`);
    }
    const cs = (l) => l.map((c) => (SYSTEM[format] === "vorbis" ? c.name.toUpperCase() : c.name) + "=" + c.value).sort().join("\n");
    if (cs(expect.custom) !== cs(got.custom)) bad.push(`custom fields differ (expected ${expect.custom.length}, read ${got.custom.length})`);
    if (expect.pictures.length !== got.pictures.length) bad.push(`expected ${expect.pictures.length} picture(s), read ${got.pictures.length}`);
    else expect.pictures.forEach((p, i) => {
      const q = got.pictures[i];
      if (!equalBytes(p.bytes, q.bytes)) bad.push(`picture ${i + 1}'s image differs`);
      else if (p.type !== q.type || p.mime !== q.mime || p.desc !== q.desc) bad.push(`picture ${i + 1}: kind, type or description differs`);
    });
    if (lrcToLines(expect.synced).map((l) => l.ms + l.text).join() !== lrcToLines(back.synced || "").map((l) => l.ms + l.text).join()) bad.push("synced lyrics differ");
    const ids = (l) => l.map((o) => o.sys + ":" + o.id).sort().join(",");
    if (ids(expect.other) !== ids(got.other)) bad.push(`kept items differ (expected ${ids(expect.other)}, read ${ids(got.other)})`);
    const n = Object.keys(expect.fields).length + expect.custom.length + expect.pictures.length;
    add("Tags read back", !bad.length, bad.length ? bad.join("; ") : `${n} field(s) and picture(s) read back exactly`);
  }
  // 4) an independent reader (Last Call's)
  if (format === "ogg" || format === "opus") add("Second reader", true, "Last Call's reader doesn't read Ogg tags (skipped)");
  else {
    const li = readFileInfo(b), t = li.tags, e = expect.fields, bad = [];
    const nm = normalizeModel(model), m4 = format === "m4a";
    // it keeps only one value of a field: the first (the last, for M4A), trimmed
    const accept = (k) => { const mv = nm.multi[k]; return [e[k].trim(), ...(mv ? [mv[0].trim(), mv[mv.length - 1].trim()] : [])]; };
    for (const k of ["title", "artist", "album", "genre", "isrc"]) {
      if (m4 && k === "isrc") continue;
      if (e[k] ? !accept(k).includes(t[k]) : t[k]) bad.push(`${k}: "${short(t[k])}"`);
    }
    if (e.date ? !(t.year && e.date.trim().startsWith(t.year.slice(0, 4)) && t.year.length >= 4) : t.year) bad.push(`year: "${short(t.year)}"`);
    if (!m4 && (e.track || "") !== String(t.track ?? "").split("/")[0].trim()) bad.push(`track: "${short(t.track)}"`);
    const ex = e.explicit === "explicit" ? true : e.explicit === "clean" ? false : undefined;
    if (ex !== t.explicit) bad.push(`explicit: ${t.explicit}`);
    const front = expect.pictures.find((p) => p.type === 3) || expect.pictures[0];
    if (!!front !== !!li.art || (front && !equalBytes(front.bytes, li.art.bytes) && !expect.pictures.some((p) => equalBytes(p.bytes, li.art.bytes)))) bad.push("cover art");
    add("Second reader", !bad.length, bad.length ? "Last Call's reader disagrees: " + bad.join("; ") : `Last Call's reader agrees (${li.label}${li.duration ? ", " + li.duration.toFixed(1) + " s" : ""})`);
  }
  return { ok: checks.every((c) => c.ok), checks, audioBytes };
}
const short = (s) => (s === undefined ? "(none)" : String(s).length > 60 ? String(s).slice(0, 57) + "..." : String(s));

// ---------- helpers for the page ----------
const SMALL = new Set(["a", "an", "the", "and", "but", "or", "nor", "for", "so", "yet", "as", "at", "by", "in", "of", "off", "on", "per", "to", "up", "via", "vs", "vs.", "from", "into", "with"]);
export function titleCase(s) {
  const words = String(s).split(/(\s+)/);
  const idx = words.map((w, i) => (/\S/.test(w) ? i : -1)).filter((i) => i >= 0), first = idx[0], last = idx[idx.length - 1];
  return words.map((w, i) => {
    if (!/\S/.test(w)) return w;
    if (/[A-Z]/.test(w.slice(1)) || /\d/.test(w) && /[A-Z]/.test(w)) return w; // acronyms and stylized names (AC/DC, McCartney, 2Pac) stay
    const lw = w.toLowerCase();
    if (i !== first && i !== last && SMALL.has(lw)) return lw;
    return lw.replace(/(^|[-("'“‘/])(\p{L})/gu, (_, a, c) => a + c.toUpperCase());
  }).join("");
}
export const tidy = (s) => String(s).replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").trim();

// "01 - Artist - Title" style patterns: {track} {disc} {artist} {title} {album} {albumArtist} {date} {genre} {skip}
const TOKENS = ["track", "disc", "artist", "title", "album", "albumArtist", "date", "genre", "trackTotal", "composer", "skip"];
export function parseFileName(name, pattern) {
  const base = String(name).replace(/\.[a-z0-9]{2,5}$/i, "").replace(/_/g, " ");
  const keys = [];
  let re = "^";
  for (const part of String(pattern).split(/(\{[a-zA-Z]+\})/)) {
    const t = /^\{([a-zA-Z]+)\}$/.exec(part);
    if (t && TOKENS.includes(t[1])) { keys.push(t[1]); re += ["track", "disc", "trackTotal"].includes(t[1]) ? "\\s*(\\d+)\\s*" : t[1] === "date" ? "\\s*(\\d{4}(?:-\\d{2}(?:-\\d{2})?)?)\\s*" : "(.+?)"; }
    else re += part.replace(/\s+/g, "\u0001").replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\u0001/g, "\\s*");
  }
  const x = new RegExp(re + "$", "u").exec(base);
  if (!x) return null;
  const out = {};
  keys.forEach((k, i) => { if (k !== "skip") out[k] = ["track", "disc", "trackTotal"].includes(k) ? String(parseInt(x[i + 1], 10)) : x[i + 1].trim(); });
  return out;
}
export function fileNameFor(m, pattern, ext, original) {
  if (!pattern?.trim()) return original;
  const pad = (v) => (/^\d+$/.test(v || "") ? v.padStart(2, "0") : v || "");
  const name = pattern.replace(/\{([a-zA-Z]+)\}/g, (_, k) => (k === "track" || k === "disc" ? pad(m.fields[k]) : m.fields[k] || ""))
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "").replace(/\s+/g, " ").replace(/^[\s.\-]+|[\s.\-]+$/g, "").trim();
  return (name || String(original).replace(/\.[^.]+$/, "")) + "." + ext;
}

// ---------- genres: a primary and a secondary ----------
// The model keeps genres as fields.genre ("Rock; Pop") plus multi.genre ([Rock, Pop])
// when there are several. Each writer stores them its own way: ID3v2.4 separate
// values in TCON, ID3v2.3 "Rock; Pop", Vorbis two GENRE comments, M4A one atom
// "Rock; Pop". Reading splits any of those back apart.
const splitGenres = (list) => list.flatMap((x) => String(x ?? "").split(";")).map((x) => x.trim()).filter(Boolean);
export function genresOf(m) {
  const v = m.fields.genre;
  if (v === undefined || v === null || String(v).trim() === "") return [];
  return splitGenres(m.multi?.genre && m.multi.genre.join("; ") === v ? m.multi.genre : [v]);
}
export function setGenres(m, list) {
  const vals = splitGenres(list);
  m.multi ??= {};
  if (!vals.length) { delete m.fields.genre; delete m.multi.genre; }
  else { m.fields.genre = vals.join("; "); if (vals.length > 1) m.multi.genre = vals; else delete m.multi.genre; }
  return m;
}
// The two boxes on the page: [primary, secondary (any further ones joined with "; ")].
// Kept on the model while typing, so emptying Primary doesn't move Secondary up.
export function genreSlots(m) {
  const g = genresOf(m), keep = m.genreSlots;
  if (keep && splitGenres(keep).join("; ") === g.join("; ")) return [...keep];
  return [g[0] ?? "", g.slice(1).join("; ")];
}
export function setGenreSlot(m, slot, value) {
  const s = genreSlots(m);
  s[slot] = String(value ?? "");
  m.genreSlots = s;
  return setGenres(m, s);
}

// ---------- album artist: follows Artist until someone types their own ----------
// m.aaFollow: true while Album artist mirrors Artist. Set when a file is loaded:
// an empty album artist, or one that's the same as the artist, follows.
export function initAlbumArtist(m) {
  const a = String(m.fields.artist ?? "").trim(), aa = String(m.fields.albumArtist ?? "").trim();
  m.aaFollow = aa === "" || aa === a;
  return mirrorAlbumArtist(m);
}
export function mirrorAlbumArtist(m) {
  if (!m.aaFollow) return m;
  m.multi ??= {};
  const v = m.fields.artist;
  if (v === undefined || v === null || String(v) === "") { delete m.fields.albumArtist; delete m.multi.albumArtist; }
  else {
    m.fields.albumArtist = v;
    if (m.multi.artist && m.multi.artist.join("; ") === v) m.multi.albumArtist = [...m.multi.artist]; else delete m.multi.albumArtist;
  }
  return m;
}
export function setAlbumArtistFollow(m, on) { m.aaFollow = !!on; return mirrorAlbumArtist(m); }

// ---------- cover art: square is the rule; size is only advice ----------
// { level: "none" | "ok" | "note" | "warn", text }. "note" is a gentle remark, never an error.
export function coverRule(img) {
  if (!img) return { level: "none", text: "No cover art yet." };
  if (!img.width || !img.height) return { level: "warn", text: "Couldn't read this image's size. JPG or PNG work in every player and store." };
  const size = `${img.width} x ${img.height}`;
  if (img.width !== img.height) return { level: "warn", text: `Not square (${size}). Stores want a square cover: crop it so both sides match.` };
  if (img.type && img.type !== "jpeg" && img.type !== "png") return { level: "warn", text: `Square, ${size}, but it's a ${img.type.toUpperCase()} file. Stores and most players want JPG or PNG.` };
  if (img.width < 1000) return { level: "note", text: `Square, ${size}. Many stores like 1000 x 1000 or bigger; scans of older covers are often smaller, and that's fine to keep.` };
  return { level: "ok", text: `Square, ${size}. Good to go.` };
}

// ---------- reading titles from file names: preset patterns ----------
export const NAME_PRESETS = [
  { id: "title", label: "Title only", example: "you know acoustic" },
  { id: "track-title", label: "01 Title", example: "01 You Know" },
  { id: "track-dash-title", label: "01 - Title", example: "01 - You Know" },
  { id: "artist-title", label: "Artist - Title", example: "Skeleton Drive - You Know" },
  { id: "track-artist-title", label: "01 - Artist - Title", example: "01 - Skeleton Drive - You Know" },
  { id: "artist-album-track-title", label: "Artist - Album - 01 - Title", example: "Skeleton Drive - Basement - 01 - You Know" },
];
const baseName = (name) => String(name).replace(/^.*[\\/]/, "").replace(/\.[a-z0-9]{2,5}$/i, "").replace(/_/g, " ").replace(/\s+/g, " ").trim();
const PRESET_PARTS = {
  title: ["title"],
  "track-title": ["track", "sp", "title"],
  "track-dash-title": ["track", "dash", "title"],
  "artist-title": ["artist", "dash", "title"],
  "track-artist-title": ["track", "dash", "artist", "dash", "title"],
  "artist-album-track-title": ["artist", "dash", "album", "dash", "track", "dash", "title"],
};
// The parts of a file name for a preset, or null if it doesn't fit.
// opts (Title only): { spaces: dashes to spaces, titleCase, stripNumber: drop a leading "01 " }
export function presetFill(name, id, opts = {}) {
  if (id === "custom") return opts.pattern ? parseFileName(name, opts.pattern) : null;
  const parts = PRESET_PARTS[id];
  if (!parts) return null;
  const base = baseName(name);
  // " - " splits when the name has it (so "Jay-Z - Song" keeps Jay-Z whole); otherwise any dash
  const dash = /\s[-\u2013\u2014]\s/.test(base) ? "\\s+[-\\u2013\\u2014]\\s+" : "\\s*[-\\u2013\\u2014]\\s*";
  const keys = [];
  let re = "^";
  for (const p of parts) {
    if (p === "dash") re += dash;
    else if (p === "sp") re += "(?:\\s*[.)]\\s*|\\s+)";
    else { keys.push(p); re += p === "track" ? "(\\d{1,3})\\.?" : p === "title" ? "(.+)" : "(.+?)"; }
  }
  const x = new RegExp(re + "$", "u").exec(base);
  if (!x) return null;
  const out = {};
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i], v = x[i + 1].trim();
    if (k === "track") { out.track = String(parseInt(v, 10)); continue; }
    if (!v || /^[-\u2013\u2014.,]|[-\u2013\u2014,]$/.test(v)) return null; // a part that starts or ends with a separator: the pattern doesn't really fit
    out[k] = v;
  }
  if (id === "title") {
    let t = out.title;
    if (opts.stripNumber) t = t.replace(/^\d{1,3}(?:\s*[-\u2013\u2014.)]\s*|\s+)(?=\S)/, "");
    if (opts.spaces) t = t.replace(/[-\u2013\u2014]+/g, " ").replace(/\s+/g, " ").trim();
    if (opts.titleCase) t = titleCase(t);
    if (!t) return null;
    out.title = t;
  }
  return out;
}
// how much a fit says: more parts is more specific; an artist or album that's only digits is suspect
const fitScore = (r) => Object.keys(r).length - Object.entries(r).filter(([k, v]) => k !== "track" && /^\d+$/.test(v)).length * 0.5;
// The preset that fits the most file names (ties: the more specific one)
export function pickPreset(names, opts = {}) {
  let best = null;
  for (const p of NAME_PRESETS) {
    let n = 0, score = 0;
    for (const name of names) { const r = presetFill(name, p.id, opts); if (r) { n++; score += fitScore(r); } }
    if (n && (!best || n > best.n || (n === best.n && score > best.score))) best = { id: p.id, n, score };
  }
  return best ? best.id : "title";
}
// What applying a preset would do: [{ name, match, values, changes }] (changes: only what differs)
export function fillPreview(files, id, opts = {}) {
  return files.map(({ name, fields = {} }) => {
    const r = presetFill(name, id, opts);
    if (!r) return { name, match: false, values: {}, changes: {} };
    const changes = {};
    for (const [k, v] of Object.entries(r)) if (String(fields[k] ?? "") !== v) changes[k] = v;
    return { name, match: true, values: r, changes };
  });
}

// ---------- album sheets: JSON and CSV ----------
export function toJSON(tracks) {
  return JSON.stringify({ tool: "Encore Tag", version: 1, exported: new Date().toISOString(), tracks: tracks.map(({ name, model: m }) => ({
    file: name, format: m.format, fields: Object.fromEntries(Object.entries(m.fields).filter(([, v]) => String(v).trim() !== "")),
    custom: m.custom.filter((c) => c.name && c.value !== ""), synced: m.synced || undefined,
    pictures: m.pictures.map((p) => { const im = imageInfo(p.bytes); return { type: p.type, mime: p.mime, desc: p.desc || "", width: im.width, height: im.height, bytes: p.bytes.length }; }),
  })) }, null, 2);
}
const csvCell = (v) => { const s = String(v ?? ""); return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function toCSV(tracks) {
  const keys = FIELDS.map((f) => f.key).filter((k) => tracks.some((t) => String(t.model.fields[k] ?? "").trim() !== ""));
  const customs = [...new Set(tracks.flatMap((t) => t.model.custom.filter((c) => c.name).map((c) => c.name)))];
  const head = ["file", ...keys, ...customs.map((c) => "custom:" + c)];
  const rows = tracks.map(({ name, model: m }) => [name, ...keys.map((k) => m.fields[k] ?? ""), ...customs.map((c) => m.custom.find((x) => x.name === c)?.value ?? "")]);
  return "﻿" + [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
export function parseCSV(text) {
  const rows = [], s = String(text).replace(/^﻿/, "");
  let row = [], cell = "", q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && s[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c !== ""));
}
// Rows from a JSON or CSV sheet: [{ file, fields, custom }]
export function readSheet(text) {
  const t = String(text).trim();
  if (t.startsWith("{") || t.startsWith("[")) {
    const j = JSON.parse(t), list = Array.isArray(j) ? j : j.tracks || [];
    return list.map((x) => ({ file: x.file || x.name || "", fields: x.fields || {}, custom: x.custom || [], synced: x.synced }));
  }
  const rows = parseCSV(t);
  if (!rows.length) return [];
  const head = rows[0].map((h) => h.trim()), labelKey = Object.fromEntries(FIELDS.map((f) => [f.label.toLowerCase(), f.key]));
  return rows.slice(1).map((r) => {
    const out = { file: "", fields: {}, custom: [] };
    head.forEach((h, i) => {
      const v = r[i] ?? "";
      if (h.toLowerCase() === "file") out.file = v;
      else if (h.startsWith("custom:")) { if (v !== "") out.custom.push({ name: h.slice(7), value: v }); }
      else { const k = FIELD[h] ? h : labelKey[h.toLowerCase()]; if (k) out.fields[k] = v; }
    });
    return out;
  });
}
