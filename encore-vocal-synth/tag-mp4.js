// Encore Tag: iTunes-style tags in MP4 / M4A files (moov/udta/meta/ilst).
//   readMp4Tags   every ilst item into the model; items we don't edit are
//                 kept byte for byte
//   writeMp4      a new file with a new ilst. The audio (mdat) is never
//                 touched: if the new moov fits in the old moov plus the free
//                 space after it, it is padded to exactly that size so
//                 nothing moves; otherwise everything after it moves and every
//                 chunk offset (stco / co64) pointing past it is moved too.
//   mp4Chunks     where each track's audio chunks are (the verify step reads
//                 them from the old and new file and compares the bytes)
import { FIELDS, ID3_GENRES } from "./tag-fields.js";
import { str, be16, be32, be64, concat, u32be, u16be, latin1, latin1Bytes, utf8, utf8Bytes, sniffMime } from "./tag-bin.js";
import { valuesOf, customValues } from "./tag-id3.js";

// ---------- boxes ----------
export function boxes(u8, from, to) {
  const out = [];
  let p = from;
  while (p + 8 <= to) {
    let size = be32(u8, p), head = 8;
    const type = str(u8, p + 4, 4);
    if (size === 1) { if (p + 16 > to) break; size = be64(u8, p + 8); head = 16; }
    else if (size === 0) size = to - p;
    if (size < head || p + size > to) break;
    out.push({ type, start: p, body: p + head, end: p + size });
    p += size;
  }
  out.tail = p; // anything after this isn't a box (kept as is)
  return out;
}
export function box(type, ...parts) {
  const body = concat(parts);
  if (body.length + 8 > 0xffffffff) throw new Error("A box is too big.");
  return concat([u32be(body.length + 8), latin1Bytes(type), body]);
}
const fullBox = (type, ...parts) => box(type, new Uint8Array(4), ...parts);
const child = (u8, b, type) => boxes(u8, b.body, b.end).find((c) => c.type === type);

// the meta box is a "full box" (4 bytes of version and flags) except in some QuickTime files
const metaKids = (u8, meta) => (str(u8, meta.body + 4, 4) === "hdlr" ? meta.body : meta.body + 4);
const handler = (u8, meta) => { const h = boxes(u8, metaKids(u8, meta), meta.end).find((c) => c.type === "hdlr"); return h ? str(u8, h.body + 8, 4) : ""; };

// ---------- the field table, turned around ----------
const ATOM_KEY = {}, FREE_KEY = {}, CODED_KEY = {};
for (const f of FIELDS) {
  const a = f.mp4;
  if (!a) continue;
  if (a.startsWith("----:")) FREE_KEY[a.slice(5).toUpperCase()] = f.key;
  else if (a.startsWith("*")) (CODED_KEY[a.slice(1)] ??= []).push(f.key);
  else ATOM_KEY[a] = f.key;
}
FREE_KEY.KEY = "key";
FREE_KEY.UPC = "barcode";
// freeform items that are an app's own data, not something to edit
const TECHNICAL = /^(itunsmpb|itunnorm|itunpgap|itunmovi|itunes_cddb_.*|encoding params|itunextc|itunebook)$/i;
const ATOM_NAMES = { stik: "Media kind", hdvd: "HD video flag", apID: "Apple account", cnID: "Catalog ID", atID: "Artist ID", plID: "Playlist ID", geID: "Genre ID",
  sfID: "Store country", akID: "Account kind", cmID: "Composer ID", ownr: "Owner", purd: "Purchase date", "xid ": "Vendor ID", tves: "TV episode", tvsn: "TV season",
  tvsh: "TV show", tven: "TV episode ID", tvnn: "TV network", ldes: "Long description", pgap: "Gapless playback", "\xa9st3": "Subtitle (old)", shwm: "Show movement",
  gnre: "Genre (as a number)", "\xa9enc": "Encoded by (old)", "\xa9des": "Description", "\xa9dir": "Director", "\xa9pub": "Publisher", "\xa9lyr": "Lyrics" };

// ---------- reading ----------
// Finds moov/udta/meta/ilst. Returns { moov, udta, meta, ilst } (any may be missing) or a reason it can't be edited
export function locate(u8) {
  const top = boxes(u8, 0, u8.length), moov = top.find((b) => b.type === "moov");
  if (!moov) return { error: "This MP4 file has no movie header (moov), so it can't be tagged." };
  if (top.some((b) => b.type === "moof") || child(u8, moov, "mvex")) return { error: "This is a fragmented MP4 (the kind streamed in pieces). Tagging it safely isn't supported yet." };
  const udta = child(u8, moov, "udta");
  const meta = udta && boxes(u8, udta.body, udta.end).find((c) => c.type === "meta");
  if (meta && handler(u8, meta) && handler(u8, meta) !== "mdir") return { error: "This file keeps its tags the QuickTime way (not iTunes-style). Editing those isn't supported yet." };
  if (!meta && child(u8, moov, "meta")) return { error: "This file keeps its tags in an unusual place. Editing them isn't supported yet." };
  const ilst = meta && boxes(u8, metaKids(u8, meta), meta.end).find((c) => c.type === "ilst");
  return { top, moov, udta, meta, ilst };
}

function dataBoxes(u8, item) {
  return boxes(u8, item.body, item.end).filter((d) => d.type === "data").map((d) => ({ kind: be32(u8, d.body) & 0xffffff, value: u8.subarray(d.body + 8, d.end) }));
}
const intOf = (v) => (v.length === 1 ? v[0] : v.length === 2 ? be16(v, 0) : v.length >= 4 ? be32(v, v.length - 4) : 0);

export function readMp4Tags(u8, m) {
  const loc = locate(u8);
  if (loc.error) { m.readOnly = loc.error; return m; }
  if (!loc.ilst) return m;
  for (const item of boxes(u8, loc.ilst.body, loc.ilst.end)) {
    const type = item.type, keep = (text) => m.other.push({ sys: "mp4", id: type, label: ATOM_NAMES[type] || "Item " + type.replace(/\xa9/, "©"), text, size: item.end - item.start, raw: u8.slice(item.start, item.end) });
    const data = dataBoxes(u8, item);
    try {
      if (type === "----") {
        const kids = boxes(u8, item.body, item.end), mean = kids.find((k) => k.type === "mean"), name = kids.find((k) => k.type === "name");
        const meanS = mean ? utf8(u8.subarray(mean.body + 4, mean.end)) : "", nameS = name ? utf8(u8.subarray(name.body + 4, name.end)) : "";
        const texts = data.filter((d) => d.kind === 1).map((d) => utf8(d.value));
        if (meanS !== "com.apple.iTunes" || !nameS || TECHNICAL.test(nameS) || texts.length !== data.length || !texts.length) { keep((nameS || "?") + (texts[0] ? ": " + texts[0].slice(0, 120) : "")); continue; }
        const key = FREE_KEY[nameS.toUpperCase()];
        if (key && m.fields[key] === undefined) { m.fields[key] = texts.join("; "); if (texts.length > 1) m.multi[key] = texts; }
        else m.custom.push({ name: nameS, value: texts.join("; "), ...(texts.length > 1 ? { values: texts } : {}) });
      } else if (type === "covr") {
        for (const d of data) m.pictures.push({ type: m.pictures.length ? 0 : 3, mime: d.kind === 14 ? "image/png" : d.kind === 27 ? "image/bmp" : d.kind === 12 ? "image/gif" : sniffMime(d.value) || "image/jpeg", desc: "", bytes: d.value.slice() });
      } else if (type === "trkn" || type === "disk") {
        const v = data[0]?.value;
        if (!v || v.length < 6) { keep(); continue; }
        const [a, b] = type === "trkn" ? ["track", "trackTotal"] : ["disc", "discTotal"], n = be16(v, 2), t = be16(v, 4);
        m.fields[a] = n ? String(n) : ""; if (t) m.fields[b] = String(t);
      } else if (CODED_KEY[type]) {
        const v = data[0]?.value;
        if (!v?.length) { keep(); continue; }
        const key = CODED_KEY[type][0], n = intOf(v);
        if (type === "rtng") m.fields.explicit = n === 1 || n === 4 ? "explicit" : n === 2 ? "clean" : "";
        else if (type === "cpil" || type === "pcst") m.fields[key] = n ? "1" : "";
        else m.fields[key] = n ? String(n) : "";
      } else if (type === "gnre" && data[0]?.value.length >= 2) {
        const g = ID3_GENRES[be16(data[0].value, 0) - 1];
        if (g && m.fields.genre === undefined) m.fields.genre = g; else keep(g);
        m.mp4 = { ...(m.mp4 || {}), hadGnre: true };
      } else if (ATOM_KEY[type] && data.length && m.fields[ATOM_KEY[type]] === undefined) {
        const key = ATOM_KEY[type], texts = data.map((d) => utf8(d.value));
        m.fields[key] = texts.join("; ");
        if (texts.length > 1) m.multi[key] = texts;
      } else keep(data[0] && (data[0].kind === 1 || data[0].kind === 0) && data[0].value.length < 4096 ? utf8(data[0].value).slice(0, 200) : null);
    } catch { keep("(damaged)"); }
  }
  // gnre was only kept as a fallback: once read into Genre it's replaced by a text genre
  if (m.mp4?.hadGnre) m.other = m.other.filter((o) => !(o.sys === "mp4" && o.id === "gnre" && m.fields.genre));
  return m;
}

// ---------- writing ----------
const dataBox = (kind, value) => box("data", u32be(kind), new Uint8Array(4), value);
const IMG_KIND = { "image/jpeg": 13, "image/png": 14, "image/bmp": 27, "image/gif": 12 };
const toInt = (v) => { const n = Math.round(parseFloat(v)); return Number.isFinite(n) && n >= 0 ? n : null; };

// The values as this format will store them (the verify step expects exactly these)
export function mp4Storable(key, value) {
  const f = FIELDS.find((x) => x.key === key);
  if (!f?.mp4?.startsWith("*")) return value;
  if (key === "explicit") return value === "explicit" || value === "clean" ? value : "";
  if (f.type === "flag") return value === "1" ? "1" : "";
  const n = toInt(value);
  return n ? String(Math.min(n, 65535)) : "";
}

export function buildIlst(m) {
  const items = [], notes = [];
  const done = new Set();
  for (const f of FIELDS) {
    const a = f.mp4;
    if (!a || done.has(a)) continue;
    if (a === "*trkn" || a === "*disk") {
      done.add(a);
      const [k1, k2] = a === "*trkn" ? ["track", "trackTotal"] : ["disc", "discTotal"];
      const n = toInt(m.fields[k1]) || 0, t = toInt(m.fields[k2]) || 0;
      if ((m.fields[k1]?.trim() && !n) || (m.fields[k2]?.trim() && !t)) notes.push(`M4A stores ${f.label.toLowerCase()} as a plain number, so "${m.fields[k1] || m.fields[k2]}" can't be saved as written.`);
      if (n || t) items.push(box(a.slice(1), dataBox(0, concat([new Uint8Array(2), u16be(Math.min(n, 65535)), u16be(Math.min(t, 65535)), ...(a === "*trkn" ? [new Uint8Array(2)] : [])]))));
      continue;
    }
    const vals = valuesOf(m, f.key);
    if (!vals) continue;
    if (a.startsWith("*")) {
      const atom = a.slice(1), v = vals[0];
      if (atom === "rtng") { if (v === "explicit" || v === "clean") items.push(box(atom, dataBox(21, new Uint8Array([v === "explicit" ? 1 : 2])))); }
      else if (atom === "cpil" || atom === "pcst") { if (v === "1") items.push(box(atom, dataBox(21, new Uint8Array([1])))); }
      else {
        const n = toInt(v);
        if (n === null) { notes.push(`M4A stores ${f.label} as a whole number, so "${v}" wasn't saved.`); continue; }
        if (String(n) !== v.trim()) notes.push(`M4A stores ${f.label} as a whole number: ${v} is saved as ${n}.`);
        items.push(box(atom, dataBox(21, u16be(Math.min(n, 65535)))));
      }
    } else if (a.startsWith("----:")) items.push(freeform(a.slice(5), vals));
    // M4A players read one genre: several are saved as one "Primary; Secondary" text
    else items.push(box(a, ...(f.key === "genre" ? [vals.join("; ")] : vals).map((v) => dataBox(a === "purl" || a === "egid" ? 0 : 1, utf8Bytes(v)))));
  }
  for (const c of m.custom || []) if (c.name?.trim() && String(c.value ?? "").trim() !== "") items.push(freeform(c.name.trim(), customValues(c)));
  for (const o of m.other || []) if (o.sys === "mp4" && !o.remove && o.raw) items.push(o.raw);
  const pics = (m.pictures || []).filter((p) => p.bytes?.length);
  if (pics.length) items.push(box("covr", ...pics.map((p) => dataBox(IMG_KIND[p.mime] ?? IMG_KIND[sniffMime(p.bytes)] ?? 0, p.bytes))));
  if (pics.some((p, i) => (i === 0 ? p.type !== 3 : p.type !== 0) || p.desc)) notes.push("M4A files keep pictures but not their kind (back cover, artist...) or description; the first picture is the cover.");
  return { bytes: box("ilst", ...items), notes };
}
const freeform = (name, vals) => box("----", fullBox("mean", utf8Bytes("com.apple.iTunes")), fullBox("name", utf8Bytes(name)), ...vals.map((v) => dataBox(1, utf8Bytes(v))));

const HDLR = () => fullBox("hdlr", new Uint8Array(4), latin1Bytes("mdirappl"), new Uint8Array(9));

function newMeta(u8, meta, ilst, pad) {
  const parts = [];
  let full = true;
  if (meta) {
    full = str(u8, meta.body + 4, 4) !== "hdlr";
    const kids = boxes(u8, metaKids(u8, meta), meta.end);
    if (!kids.some((k) => k.type === "hdlr")) parts.push(HDLR());
    for (const k of kids) if (k.type !== "ilst" && k.type !== "free" && k.type !== "skip") parts.push(u8.subarray(k.start, k.end));
    if (kids.tail < meta.end) parts.push(u8.subarray(kids.tail, meta.end));
  } else parts.push(HDLR());
  parts.push(ilst);
  if (pad) parts.push(box("free", new Uint8Array(pad - 8)));
  return full ? fullBox("meta", ...parts) : box("meta", ...parts);
}
function newMoov(u8, loc, ilst, pad) {
  const { moov, udta, meta } = loc, kids = boxes(u8, moov.body, moov.end), parts = [];
  const metaBox = newMeta(u8, meta, ilst, pad);
  for (const k of kids) {
    if (k.start === udta?.start) {
      const uk = boxes(u8, udta.body, udta.end), up = [];
      for (const c of uk) up.push(c.start === meta?.start ? metaBox : u8.subarray(c.start, c.end));
      if (!meta) up.push(metaBox);
      if (uk.tail < udta.end) up.push(u8.subarray(uk.tail, udta.end));
      parts.push(box("udta", ...up));
    } else parts.push(u8.subarray(k.start, k.end));
  }
  if (!udta) parts.push(box("udta", metaBox));
  if (kids.tail < moov.end) parts.push(u8.subarray(kids.tail, moov.end));
  return box("moov", ...parts);
}

// every chunk-offset table (stco 32-bit, co64 64-bit) in a moov, as [box, is64]
function offsetTables(u8, from, to, out = []) {
  for (const b of boxes(u8, from, to)) {
    if (["moov", "trak", "mdia", "minf", "stbl"].includes(b.type)) offsetTables(u8, b.body, b.end, out);
    else if (b.type === "stco" || b.type === "co64") out.push([b, b.type === "co64"]);
  }
  return out;
}

export function writeMp4(u8, m) {
  const loc = locate(u8);
  if (loc.error) throw new Error(loc.error);
  const { top, moov } = loc, { bytes: ilst, notes } = buildIlst(m);
  // the moov's room: itself plus any free space right after it
  let i = top.indexOf(moov), regionEnd = moov.end;
  while (top[i + 1] && (top[i + 1].type === "free" || top[i + 1].type === "skip")) regionEnd = top[++i].end;
  const room = regionEnd - moov.start, core = newMoov(u8, loc, ilst, 0).length, slack = room - core;
  const pad = slack === 0 || slack >= 8 ? slack : 2048; // fits: fill the room exactly. Doesn't: grow, and leave room for next time
  const out = newMoov(u8, loc, ilst, pad), delta = out.length - room;
  if (delta) {
    const dv = new DataView(out.buffer, out.byteOffset, out.byteLength);
    for (const [b, is64] of offsetTables(out, 8, out.length)) {
      const n = be32(out, b.body + 4);
      for (let k = 0; k < n; k++) {
        const at = b.body + 8 + k * (is64 ? 8 : 4), off = is64 ? be64(out, at) : be32(out, at);
        if (off >= moov.start && off < regionEnd) throw new Error("A track's audio seems to sit inside the movie header. Tagging this file safely isn't possible.");
        if (off < regionEnd) continue; // before the moov: doesn't move
        const moved = off + delta;
        if (is64) { dv.setUint32(at, Math.floor(moved / 4294967296)); dv.setUint32(at + 4, moved >>> 0); }
        else if (moved > 0xffffffff) throw new Error("The file is too big to grow its header (over 4 GB with 32-bit offsets).");
        else dv.setUint32(at, moved);
      }
    }
    notes.push(`The new tags didn't fit in the space the file had, so the audio moved ${delta > 0 ? "down" : "up"} by ${Math.abs(delta)} bytes and every track's audio offsets were updated to match.`);
  }
  return { bytes: concat([u8.subarray(0, moov.start), out, u8.subarray(regionEnd)]), notes, moved: delta };
}

// Each track's audio chunks: [{ track, offset, size }], from stsc + stsz + stco/co64
export function mp4Chunks(u8) {
  const loc = locate(u8);
  if (loc.error) return null;
  const out = [];
  let track = 0;
  for (const trak of boxes(u8, loc.moov.body, loc.moov.end).filter((b) => b.type === "trak")) {
    track++;
    const stbl = (() => { const md = child(u8, trak, "mdia"), mi = md && child(u8, md, "minf"); return mi && child(u8, mi, "stbl"); })();
    if (!stbl) continue;
    const kids = boxes(u8, stbl.body, stbl.end), get = (t) => kids.find((k) => k.type === t);
    const stco = get("stco") || get("co64"), stsz = get("stsz"), stsc = get("stsc");
    if (!stco || !stsz || !stsc) continue;
    const is64 = stco.type === "co64", nChunks = be32(u8, stco.body + 4);
    const offs = Array.from({ length: nChunks }, (_, k) => (is64 ? be64(u8, stco.body + 8 + k * 8) : be32(u8, stco.body + 8 + k * 4)));
    const fixed = be32(u8, stsz.body + 4), nSamples = be32(u8, stsz.body + 8);
    const sizeOf = (s) => (fixed ? fixed : be32(u8, stsz.body + 12 + s * 4));
    const runs = Array.from({ length: be32(u8, stsc.body + 4) }, (_, k) => [be32(u8, stsc.body + 8 + k * 12), be32(u8, stsc.body + 12 + k * 12)]);
    let s = 0;
    for (let c = 0; c < nChunks; c++) {
      let per = 0;
      for (const [first, n] of runs) if (first <= c + 1) per = n;
      let size = 0;
      for (let k = 0; k < per && s < nSamples; k++, s++) size += sizeOf(s);
      out.push({ track, offset: offs[c], size });
    }
  }
  return out;
}

