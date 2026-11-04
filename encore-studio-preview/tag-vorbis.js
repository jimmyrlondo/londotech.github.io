// Encore Tag: Vorbis comments (FLAC, Ogg Vorbis, Opus) and FLAC-style picture
// blocks (FLAC PICTURE, and Ogg's METADATA_BLOCK_PICTURE).
//   readComments / commentsToModel   NAME=value pairs into the model; names we
//                                    don't know become custom fields
//   modelToComments / buildComments  the model back into NAME=value pairs
import { FIELDS } from "./tag-fields.js";
import { le32, be32, u32le, u32be, concat, latin1, latin1Bytes, utf8, utf8Bytes, toBase64, fromBase64, sniffMime } from "./tag-bin.js";
import { valuesOf, customValues } from "./tag-id3.js";
import { imageInfo } from "./lastcall-core.js";

const KEY = {};
for (const f of FIELDS) {
  if (f.vorbis) KEY[f.vorbis] = f.key;
  for (const a of f.valt || []) KEY[a] = KEY[a] || f.key;
}
KEY.EXPLICIT = "explicit";

// The comment list: { vendor, list: [[name, value]], end } (end = where it stopped)
export function readComments(b, from = 0) {
  let p = from;
  const vlen = le32(b, p), vendor = utf8(b.subarray(p + 4, p + 4 + vlen));
  p += 4 + vlen;
  const count = le32(b, p); p += 4;
  const list = [];
  for (let i = 0; i < count; i++) {
    if (p + 4 > b.length) throw new Error("The comment list is cut short.");
    const len = le32(b, p);
    if (p + 4 + len > b.length) throw new Error("The comment list is cut short.");
    const kv = utf8(b.subarray(p + 4, p + 4 + len)); p += 4 + len;
    const eq = kv.indexOf("=");
    list.push(eq < 0 ? [kv, null] : [kv.slice(0, eq), kv.slice(eq + 1)]);
  }
  return { vendor, list, end: p };
}

export function buildComments(vendor, list) {
  const parts = [], v = utf8Bytes(vendor);
  parts.push(u32le(v.length), v, u32le(list.length));
  for (const [k, val] of list) { const kv = utf8Bytes(val === null ? k : `${k}=${val}`); parts.push(u32le(kv.length), kv); }
  return concat(parts);
}

// ---------- pictures ----------
export function readPictureBlock(b) {
  let p = 0;
  const type = be32(b, p), ml = be32(b, p + 4), mime = latin1(b.subarray(p + 8, p + 8 + ml)).toLowerCase(); p += 8 + ml;
  const dl = be32(b, p), desc = utf8(b.subarray(p + 4, p + 4 + dl)); p += 4 + dl;
  p += 16; // width, height, color depth, palette size: worked out again on writing
  const len = be32(b, p);
  if (p + 4 + len > b.length) throw new Error("A picture is cut short.");
  return { type, mime, desc, bytes: b.slice(p + 4, p + 4 + len) };
}
export function buildPictureBlock(pic) {
  const img = imageInfo(pic.bytes), mime = latin1Bytes(pic.mime || sniffMime(pic.bytes) || "image/jpeg"), desc = utf8Bytes(pic.desc || "");
  const depth = img.color === "Grayscale" ? (img.alpha ? 16 : 8) : img.alpha ? 32 : 24;
  return concat([u32be(pic.type ?? 3), u32be(mime.length), mime, u32be(desc.length), desc,
    u32be(img.width || 0), u32be(img.height || 0), u32be(img.width ? depth : 0), u32be(0), u32be(pic.bytes.length), pic.bytes]);
}

// ---------- into and out of the model ----------
export function commentsToModel(list, m, { pictures = false } = {}) {
  const groups = new Map(); // NAME -> { name (as written), values }
  for (const [k, v] of list) {
    if (v === null) { m.other.push({ sys: "vorbis", id: k, label: "A comment with no name", text: k, size: k.length, raw: [k, null] }); continue; }
    const up = k.toUpperCase();
    if (!groups.has(up)) groups.set(up, { name: k, values: [] });
    groups.get(up).values.push(v);
  }
  let legacyArt = null;
  for (const [up, { name, values }] of groups) {
    const key = KEY[up];
    if (pictures && up === "METADATA_BLOCK_PICTURE") {
      for (const v of values) { try { m.pictures.push(readPictureBlock(fromBase64(v))); } catch { m.other.push({ sys: "vorbis", id: name, label: "A damaged picture", text: null, size: v.length, raw: [name, v] }); } }
    } else if (pictures && (up === "COVERART" || up === "COVERARTMIME")) {
      legacyArt = legacyArt || {};
      legacyArt[up] = values[0];
    } else if (up === "TRACKNUMBER" || up === "DISCNUMBER") {
      const [n, t] = values[0].split("/"), [a, b] = up === "TRACKNUMBER" ? ["track", "trackTotal"] : ["disc", "discTotal"];
      m.fields[a] = n.trim();
      if (t?.trim() && m.fields[b] === undefined) m.fields[b] = t.trim();
      if (values.length > 1) m.other.push({ sys: "vorbis", id: name, label: name, text: values.slice(1).join("; "), size: 0, raw: values.slice(1).map((x) => [name, x]) });
    } else if (key === "explicit") {
      const v = values[0].trim();
      m.fields.explicit = /^(1|4|yes|true|explicit)$/i.test(v) ? "explicit" : /^(2|clean)$/i.test(v) ? "clean" : "";
    } else if (key === "compilation" || key === "podcast") m.fields[key] = values[0].trim() === "1" ? "1" : "";
    else if (key === "rating") { const r = parseFloat(values[0]); m.fields.rating = !(r > 0) ? "" : String(Math.min(5, Math.round(r > 5 ? r / 20 : r))); }
    else if (key && (m.fields[key] === undefined || m.fields[key] === "")) {
      m.fields[key] = values.join("; ");
      if (values.length > 1) m.multi[key] = values;
    } else if (key) m.custom.push({ name, value: values.join("; "), ...(values.length > 1 ? { values } : {}) }); // a second name for a field we already have
    else m.custom.push({ name, value: values.join("; "), ...(values.length > 1 ? { values } : {}) });
  }
  if (legacyArt?.COVERART) {
    const bytes = fromBase64(legacyArt.COVERART);
    m.pictures.push({ type: 3, mime: legacyArt.COVERARTMIME || sniffMime(bytes) || "image/jpeg", desc: "", bytes });
    m.notes.push("The cover is stored the old way (COVERART). The saved copy stores it the standard way, which more players read.");
  }
  return m;
}

// The model as NAME=value pairs. opts.format decides what's allowed (Opus: no ReplayGain)
export function modelToComments(m, { pictures = false, format = "flac" } = {}) {
  const out = [];
  const put = (k, vals) => { for (const v of vals) out.push([k, v]); };
  for (const f of FIELDS) {
    if (!f.vorbis || f.why?.[format]) continue;
    const vals = valuesOf(m, f.key);
    if (!vals) continue;
    if (f.key === "explicit") { if (vals[0] === "explicit" || vals[0] === "clean") put(f.vorbis, [vals[0] === "explicit" ? "1" : "2"]); }
    else if (f.type === "flag") { if (vals[0] === "1") put(f.vorbis, ["1"]); }
    else if (f.type === "rating") { const n = parseInt(vals[0], 10); if (n >= 1 && n <= 5) put(f.vorbis, [String(n)]); }
    else put(f.vorbis, vals);
  }
  for (const c of m.custom || []) if (c.name?.trim() && String(c.value ?? "").trim() !== "") put(c.name.trim(), customValues(c));
  for (const o of m.other || []) if (o.sys === "vorbis" && !o.remove) { if (Array.isArray(o.raw[0])) out.push(...o.raw); else out.push(o.raw); }
  if (pictures) for (const p of m.pictures || []) if (p.bytes?.length) out.push(["METADATA_BLOCK_PICTURE", toBase64(buildPictureBlock(p))]);
  return out;
}

// Vorbis comment names: printable ASCII, no "="
export const validName = (n) => /^[\x20-\x3c\x3e-\x7d]+$/.test(n);
