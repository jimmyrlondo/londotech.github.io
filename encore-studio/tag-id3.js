// Encore Tag: ID3 tags (MP3 files, and the "id3 " chunk inside WAV and AIFF).
//   parseId3v2 / id3ToModel   every frame of an ID3v2.2, 2.3 or 2.4 tag, into
//                             the editor's model; frames we don't edit are kept
//                             byte for byte in model.other
//   buildId3v2                a fresh v2.3 (UTF-16) or v2.4 (UTF-8) tag
//   readId3v1 / buildId3v1    the old 128-byte tag at the end of some MP3s
import { FIELDS, ID3_GENRES } from "./tag-fields.js";
import { str, be32, syncsafe, concat, u32be, syncsafeBytes, latin1, latin1Bytes, utf8, utf8Bytes, utf16, utf16Bytes, enc8 } from "./tag-bin.js";

// ---------- the field table, turned around for reading ----------
const TEXT_KEY = {}, TXXX_KEY = {}, URL_KEY = {}, ROLE_KEY = {};
for (const f of FIELDS) {
  const id = f.id3;
  if (!id) continue;
  if (id.startsWith("TXXX:")) TXXX_KEY[id.slice(5).toUpperCase()] = f.key;
  else if (id.startsWith("*role:")) ROLE_KEY[id.slice(6)] = f.key;
  else if (id.startsWith("*")) continue;
  else if (id[0] === "W" && id !== "WFED") URL_KEY[id] = f.key;
  else TEXT_KEY[id] = f.key;
}
TXXX_KEY.EXPLICIT = "explicit"; // other taggers' names for the same things
TXXX_KEY.UPC = "barcode";
TXXX_KEY.LABEL = "label";
TXXX_KEY["CATALOG NUMBER"] = "catalogNumber";
TXXX_KEY.INITIALKEY = "key";
TXXX_KEY.ORIGINALYEAR = "originalDate";
TEXT_KEY.GRP1 = "grouping"; // iTunes 12.5+ writes grouping here

// ID3v2.2 used 3-letter frame names; these are the ones with a v2.3 twin
const V22 = { TT1: "TIT1", TT2: "TIT2", TT3: "TIT3", TP1: "TPE1", TP2: "TPE2", TP3: "TPE3", TP4: "TPE4", TCM: "TCOM", TXT: "TEXT", TLA: "TLAN", TCO: "TCON",
  TAL: "TALB", TPA: "TPOS", TRK: "TRCK", TRC: "TSRC", TYE: "TYER", TDA: "TDAT", TIM: "TIME", TRD: "TRDA", TMT: "TMED", TFT: "TFLT", TBP: "TBPM", TCR: "TCOP",
  TPB: "TPUB", TEN: "TENC", TSS: "TSSE", TOF: "TOFN", TLE: "TLEN", TSI: "TSIZ", TDY: "TDLY", TKE: "TKEY", TOT: "TOAL", TOA: "TOPE", TOL: "TOLY", TOR: "TORY",
  TXX: "TXXX", WAF: "WOAF", WAR: "WOAR", WAS: "WOAS", WCM: "WCOM", WCP: "WCOP", WPB: "WPUB", WXX: "WXXX", IPL: "IPLS", ULT: "USLT", COM: "COMM", POP: "POPM",
  UFI: "UFID", SLT: "SYLT", PIC: "APIC", CNT: "PCNT", GEO: "GEOB", TCP: "TCMP", TST: "TSOT", TSP: "TSOP", TSA: "TSOA", TS2: "TSO2", TSC: "TSOC", TDR: "TDRC" };

const FRAME_NAMES = { PRIV: "Private data from another app", GEOB: "An attached file", MCDI: "CD table of contents", PCNT: "Play count", POPM: "Play count / rating",
  COMM: "Comment", USLT: "Lyrics", SYLT: "Synced lyrics", APIC: "Picture", UFID: "Unique file ID", WXXX: "Web link", TXXX: "Custom text", TLEN: "Length",
  TDRL: "Release date", TDEN: "Encoding date", TDTG: "Tagging date", TSST: "Disc subtitle", TMCL: "Musician credits", TIPL: "Involved people", IPLS: "Involved people",
  TFLT: "File type", TOFN: "Original file name", TOAL: "Original album", TOLY: "Original lyricist", TOWN: "File owner", TRSN: "Radio station", TRSO: "Radio station owner",
  TDLY: "Playlist delay", TSIZ: "Size", TRDA: "Recording dates", ETCO: "Event timing codes", MLLT: "MPEG lookup table", SYTC: "Synced tempo codes", RVA2: "Volume adjustment",
  RVAD: "Volume adjustment", EQU2: "Equalisation", RVRB: "Reverb", USER: "Terms of use", OWNE: "Ownership", COMR: "Commercial frame", ENCR: "Encryption method",
  GRID: "Group ID", SIGN: "Signature", SEEK: "Seek frame", ASPI: "Audio seek index", LINK: "Linked information", POSS: "Position sync", AENC: "Audio encryption",
  RBUF: "Recommended buffer size", CHAP: "Chapter", CTOC: "Table of contents", NCON: "MusicMatch data", XRVA: "Volume adjustment" };

// ---------- text ----------
const isWide = (e) => e === 1 || e === 2;
function decodeText(e, b) {
  return e === 0 ? latin1(b) : e === 1 ? utf16(b, false) : e === 2 ? utf16(b, true) : utf8(b);
}
// where the zero terminator starts (one byte, or two aligned bytes for UTF-16)
function term(b, from, e) {
  if (isWide(e)) { for (let i = from; i + 1 < b.length; i += 2) if (b[i] === 0 && b[i + 1] === 0) return i; return b.length; }
  const i = b.indexOf(0, from);
  return i < 0 ? b.length : i;
}
const termLen = (e) => (isWide(e) ? 2 : 1);
// a text frame's values (v2.4 separates several with zeros)
function textValues(e, b) {
  const out = [];
  for (let p = 0; p < b.length;) {
    const t = term(b, p, e);
    out.push(decodeText(e, b.subarray(p, t)));
    p = t + termLen(e);
  }
  while (out.length > 1 && out[out.length - 1] === "") out.pop();
  return out.length ? out : [""];
}
function unsync(b) { // undo unsynchronisation (FF 00 -> FF)
  let n = 0;
  for (let i = 0; i < b.length; i++) if (b[i] === 0xff && b[i + 1] === 0) n++;
  if (!n) return b;
  const out = new Uint8Array(b.length - n);
  for (let i = 0, o = 0; i < b.length; i++) { out[o++] = b[i]; if (b[i] === 0xff && b[i + 1] === 0) i++; }
  return out;
}

// ---------- reading ----------
// The tag at off: its frames, each with its decoded body (null when the frame
// is compressed or encrypted, which we keep but can't read)
export function parseId3v2(u8, off = 0) {
  if (off + 10 > u8.length || str(u8, off, 3) !== "ID3") return null;
  const ver = u8[off + 3], rev = u8[off + 4], flags = u8[off + 5], size = syncsafe(u8, off + 6);
  const tag = { ver, rev, flags, size: 10 + size + (ver === 4 && flags & 0x10 ? 10 : 0), frames: [], dropped: [] };
  if (ver < 2 || ver > 4) { tag.unsupported = true; return tag; }
  let body = u8.subarray(off + 10, Math.min(u8.length, off + 10 + size));
  if ((flags & 0x80) && ver < 4) body = unsync(body);
  let p = 0;
  if (flags & 0x40) { // extended header
    if (ver === 3) p = 4 + be32(body, 0);
    else if (ver === 4) p = syncsafe(body, 0);
    else { tag.unsupported = true; return tag; } // v2.2 "compression" bit: no known scheme
  }
  const idLen = ver === 2 ? 3 : 4, hLen = ver === 2 ? 6 : 10, validId = (s) => (ver === 2 ? /^[A-Z0-9]{3}$/ : /^[A-Z0-9]{4}$/).test(s);
  while (p + hLen <= body.length) {
    const rawId = str(body, p, idLen);
    if (!validId(rawId)) break; // padding (or junk after the last frame)
    let fsize = ver === 2 ? (body[p + 3] << 16) | (body[p + 4] << 8) | body[p + 5] : ver === 4 ? syncsafe(body, p + 4) : be32(body, p + 4);
    // some v2.4 writers (old iTunes) store plain sizes: use whichever lands on the next frame
    if (ver === 4 && fsize >= 0x80) {
      const plain = be32(body, p + 4), next = (s) => p + hLen + s;
      const ok = (s) => next(s) === body.length || next(s) + 4 > body.length || body[next(s)] === 0 || validId(str(body, next(s), 4));
      if (!ok(fsize) && ok(plain)) fsize = plain;
    }
    const f1 = ver === 2 ? 0 : body[p + 8], f2 = ver === 2 ? 0 : body[p + 9];
    const raw = body.subarray(p + hLen, Math.min(body.length, p + hLen + fsize));
    p += hLen + fsize;
    let id = rawId, data = raw;
    if (ver === 2) {
      id = V22[rawId];
      if (!id) { tag.dropped.push(rawId); continue; } // no v2.3 twin: can't be carried into a newer tag
      if (rawId === "PIC") data = picToApic(raw);
    } else if (ver === 4) {
      let q = 0;
      if (f2 & 0x40) q += 1; // group id
      if (f2 & 0x04) q += 1; // encryption method
      if (f2 & 0x01) q += 4; // data length indicator
      data = raw.subarray(q);
      if ((f2 & 0x02) || (flags & 0x80)) data = unsync(data);
      if (f2 & 0x0c) data = null; // compressed or encrypted
    } else if (f2 & 0xc0) data = null; // v2.3 compressed or encrypted
    else if (f2 & 0x20) data = raw.subarray(1); // v2.3 group id
    tag.frames.push({ id, f1, f2, raw, data, ver });
  }
  return tag;
}
function picToApic(b) { // v2.2 PIC: a 3-letter image type instead of a MIME type
  const fmt = str(b, 1, 3).toUpperCase(), mime = fmt === "PNG" ? "image/png" : fmt === "JPG" ? "image/jpeg" : "image/" + fmt.toLowerCase();
  return concat([b.subarray(0, 1), enc8.encode(mime), new Uint8Array([0]), b.subarray(4)]);
}

export function genreName(s) { // "(17)", "17", "(17)Rock refinement", "(RX)", "(CR)"
  let rest = s.trim(), names = [], m;
  while ((m = /^\((\d+|RX|CR)\)/.exec(rest))) {
    names.push(m[1] === "RX" ? "Remix" : m[1] === "CR" ? "Cover" : ID3_GENRES[+m[1]] ?? m[1]);
    rest = rest.slice(m[0].length);
  }
  if (rest.startsWith("((")) rest = rest.slice(1);
  if (rest) return /^\d+$/.test(rest) && ID3_GENRES[+rest] ? ID3_GENRES[+rest] : rest; // a refinement wins over the number
  return names.join("; ");
}

const ROLE_NAMES = { mix: "mix", producer: "producer", engineer: "engineer", arranger: "arranger" };
const setField = (m, key, values) => {
  if (m.fields[key] !== undefined && m.fields[key] !== "") return false; // first one wins; later duplicates stay in "other"
  m.fields[key] = values.join("; ");
  if (values.length > 1) m.multi[key] = values;
  return true;
};
function otherFrame(m, fr, text) {
  const label = FRAME_NAMES[fr.id] || (fr.id[0] === "T" ? "Text frame " + fr.id : fr.id[0] === "W" ? "Web link " + fr.id : "Frame " + fr.id);
  m.other.push({ sys: "id3", id: fr.id, label, text: text ?? (fr.data ? null : "(compressed or encrypted)"), size: fr.raw.length, frame: fr });
}

// LRC <-> SYLT: synced lyrics are edited as LRC text ("[01:02.50]line")
export function lrcToLines(lrc) {
  const out = [];
  for (const row of String(lrc).split(/\r?\n/)) {
    const stamps = [...row.matchAll(/\[(\d+):(\d{1,2}(?:[.:]\d{1,3})?)\]/g)];
    if (!stamps.length) continue;
    const text = row.replace(/\[[^\]]*\]/g, "").trim();
    for (const s of stamps) out.push({ ms: Math.round((+s[1] * 60 + parseFloat(s[2].replace(":", "."))) * 1000), text });
  }
  return out.sort((a, b) => a.ms - b.ms);
}
export function linesToLrc(lines) {
  return lines.map(({ ms, text }) => {
    const m = Math.floor(ms / 60000), s = (ms % 60000) / 1000;
    return `[${String(m).padStart(2, "0")}:${s.toFixed(2).padStart(5, "0")}]${text}`;
  }).join("\n");
}

// Fill model (fields / multi / custom / pictures / synced / other) from a parsed tag
export function id3ToModel(tag, m) {
  const date = {}, roles = [];
  m.id3 = { ...(m.id3 || {}), readVersion: tag.ver };
  if (tag.dropped.length) m.notes.push(`This old ID3v2.2 tag has ${tag.dropped.length} frame(s) (${[...new Set(tag.dropped)].join(", ")}) with no modern equivalent; they won't be in the saved copy.`);
  for (const fr of tag.frames) {
    const { id, data } = fr;
    if (!data || !data.length) { otherFrame(m, fr); continue; }
    const e = data[0];
    try {
      if (id === "TXXX") {
        const t = term(data, 1, e), desc = decodeText(e, data.subarray(1, t)), vals = textValues(e, data.subarray(t + termLen(e)));
        const key = TXXX_KEY[desc.toUpperCase()];
        if (!key) { m.custom.push({ name: desc, value: vals.join("; "), ...(vals.length > 1 ? { values: vals } : {}) }); continue; }
        if (key === "explicit") {
          const v = vals[0].trim();
          if (m.fields.explicit === undefined) { m.fields.explicit = /^(1|4|yes|true|explicit)$/i.test(v) ? "explicit" : /^(2|clean)$/i.test(v) ? "clean" : ""; continue; }
        } else if (setField(m, key, vals)) continue;
        otherFrame(m, fr, desc + ": " + vals.join("; "));
      } else if (id === "TRCK" || id === "TPOS" || id === "MVIN") {
        const [n, t] = textValues(e, data.subarray(1))[0].split("/");
        const [a, b] = id === "TRCK" ? ["track", "trackTotal"] : id === "TPOS" ? ["disc", "discTotal"] : ["movement", "movementTotal"];
        if (m.fields[a] !== undefined) { otherFrame(m, fr); continue; }
        m.fields[a] = (n ?? "").trim();
        if (t !== undefined && t.trim()) m.fields[b] = t.trim();
      } else if (id === "TCON") {
        if (m.fields.genre !== undefined) { otherFrame(m, fr); continue; }
        const vals = textValues(e, data.subarray(1)).map(genreName).filter(Boolean);
        setField(m, "genre", vals.length ? vals : [""]);
      } else if (["TDRC", "TYER", "TDAT", "TIME", "TORY", "TDOR"].includes(id)) {
        if (date[id] !== undefined) { otherFrame(m, fr); continue; }
        date[id] = textValues(e, data.subarray(1))[0].trim();
      } else if (id === "TIPL" || id === "IPLS") {
        const vals = textValues(e, data.subarray(1));
        for (let i = 0; i + 1 < vals.length; i += 2) roles.push([vals[i], vals[i + 1]]);
      } else if (id === "COMM" || id === "USLT") {
        const lang = str(data, 1, 3), t = term(data, 4, e), desc = decodeText(e, data.subarray(4, t)), text = decodeText(e, data.subarray(t + termLen(e))).replace(/\0+$/, "");
        const key = id === "COMM" ? "comment" : "lyrics";
        // the plain comment / lyrics have no description; iTunes keeps its own data in described comments (iTunNORM...)
        if (desc === "" && m.fields[key] === undefined) { m.fields[key] = text; m.id3[key + "Lang"] = lang; }
        else otherFrame(m, fr, (desc ? desc + ": " : "") + text.slice(0, 200));
      } else if (id === "SYLT") {
        const lang = str(data, 1, 3), stampFmt = data[4], kind = data[5];
        let p = term(data, 6, e) + termLen(e);
        if (stampFmt !== 2 || m.synced) { otherFrame(m, fr, stampFmt !== 2 ? "Synced lyrics timed in MPEG frames" : null); continue; }
        const lines = [];
        while (p < data.length) {
          const t = term(data, p, e), text = decodeText(e, data.subarray(p, t));
          p = t + termLen(e);
          if (p + 4 > data.length) break;
          lines.push({ ms: be32(data, p), text: text.replace(/^\n/, "") }); p += 4;
        }
        m.synced = linesToLrc(lines);
        m.id3.syncedLang = lang; m.id3.syncedKind = kind;
      } else if (id === "APIC") {
        const me = term(data, 1, 0), mime = latin1(data.subarray(1, me)).toLowerCase(), type = data[me + 1];
        const de = term(data, me + 2, e), desc = decodeText(e, data.subarray(me + 2, de));
        m.pictures.push({ type, mime: mime === "jpg" ? "image/jpeg" : mime.includes("/") ? mime : "image/" + mime, desc, bytes: data.slice(de + termLen(e)) });
      } else if (id === "POPM") {
        const t = term(data, 0, 0), email = latin1(data.subarray(0, t)), r = data[t + 1];
        if (m.fields.rating !== undefined) { otherFrame(m, fr, `${email}: ${r}/255`); continue; }
        m.fields.rating = r ? String(r < 32 ? 1 : r < 96 ? 2 : r < 160 ? 3 : r < 224 ? 4 : 5) : "";
        m.id3.popm = { email, rest: data.slice(t + 2) }; // the play counter, kept as is
      } else if (id === "UFID") {
        const t = term(data, 0, 0), owner = latin1(data.subarray(0, t));
        if (owner === "http://musicbrainz.org" && m.fields.mbRecordingId === undefined) m.fields.mbRecordingId = latin1(data.subarray(t + 1));
        else otherFrame(m, fr, owner);
      } else if (URL_KEY[id]) {
        if (m.fields[URL_KEY[id]] !== undefined) { otherFrame(m, fr); continue; }
        m.fields[URL_KEY[id]] = latin1(data.subarray(0, term(data, 0, 0)));
      } else if (TEXT_KEY[id]) {
        const vals = textValues(e, data.subarray(1));
        const key = TEXT_KEY[id];
        if (key === "compilation") { if (m.fields.compilation === undefined) { m.fields.compilation = vals[0].trim() === "1" ? "1" : ""; continue; } }
        else if (setField(m, key, vals)) continue;
        otherFrame(m, fr, vals.join("; "));
      } else otherFrame(m, fr, id[0] === "T" ? textValues(e, data.subarray(1)).join("; ") : id[0] === "W" ? latin1(data.subarray(0, term(data, 0, 0))) : null);
    } catch { otherFrame(m, fr, "(damaged)"); }
  }
  // dates: TDRC (v2.4) wins; v2.3 splits it into year, day-month and time
  const full = date.TDRC || (date.TYER ? date.TYER + (/^\d{4}$/.test(date.TDAT || "") ? `-${date.TDAT.slice(2)}-${date.TDAT.slice(0, 2)}` + (/^\d{4}$/.test(date.TIME || "") ? `T${date.TIME.slice(0, 2)}:${date.TIME.slice(2)}` : "") : "") : "");
  if (full && m.fields.date === undefined) m.fields.date = full;
  const orig = date.TDOR || date.TORY;
  if (orig && m.fields.originalDate === undefined) m.fields.originalDate = orig;
  const rest = [];
  for (const [role, who] of roles) {
    const key = ROLE_KEY[ROLE_NAMES[role.toLowerCase()] || ""];
    if (key && m.fields[key] === undefined) m.fields[key] = who;
    else if (key && m.multi[key]) m.multi[key].push(who), m.fields[key] = m.multi[key].join("; ");
    else if (key) { m.multi[key] = [m.fields[key], who]; m.fields[key] = m.multi[key].join("; "); }
    else rest.push([role, who]);
  }
  m.id3.otherRoles = rest; // other credits in TIPL (kept, written back)
  if (rest.length) m.other.push({ sys: "id3", id: "TIPL-rest", label: "Other credits", text: rest.map((r) => r.join(": ")).join("; "), size: 0 });
  return m;
}

// ---------- ID3v1 ----------
export function readId3v1(u8) {
  const o = u8.length - 128;
  if (o < 0 || str(u8, o, 3) !== "TAG") return null;
  const t = (a, n) => latin1(u8.subarray(o + a, o + a + n)).replace(/\0.*$/s, "").trim();
  const v1 = { title: t(3, 30), artist: t(33, 30), album: t(63, 30), date: t(93, 4), comment: t(97, 30), genre: ID3_GENRES[u8[o + 127]] || "" };
  if (u8[o + 125] === 0 && u8[o + 126]) { v1.comment = t(97, 28); v1.track = String(u8[o + 126]); }
  return v1;
}
export function buildId3v1(fields) {
  const out = new Uint8Array(128);
  out.set(enc8.encode("TAG"));
  const put = (s, a, n) => out.set(latin1Bytes(String(s ?? "").normalize("NFC")).subarray(0, n), a);
  put(fields.title, 3, 30); put(fields.artist, 33, 30); put(fields.album, 63, 30); put(String(fields.date ?? "").slice(0, 4), 93, 4);
  put(fields.comment?.split("\n")[0], 97, 28);
  const tr = parseInt(fields.track, 10);
  out[126] = tr > 0 && tr < 256 ? tr : 0;
  const g = ID3_GENRES.findIndex((x) => x.toLowerCase() === String(fields.genre ?? "").split(";")[0].trim().toLowerCase());
  out[127] = g >= 0 ? g : 255;
  return out;
}

// ---------- writing ----------
// Values to write for a field: the original list if the field wasn't edited
export const valuesOf = (m, key) => {
  const v = m.fields[key];
  if (v === undefined || v === null || String(v).trim() === "") return null;
  return m.multi?.[key] && m.multi[key].join("; ") === v ? m.multi[key] : [String(v)];
};

export const customValues = (c) => (c.values && c.values.join("; ") === c.value ? c.values : [String(c.value)]);

function frameBytes(id, body, ver, f1 = 0, f2 = 0) {
  const h = new Uint8Array(10);
  h.set(enc8.encode(id), 0);
  h.set(ver === 4 ? syncsafeBytes(body.length) : u32be(body.length), 4);
  h[8] = f1; h[9] = f2;
  return concat([h, body]);
}
// one string in the tag's text encoding: v2.3 UTF-16 with a BOM, v2.4 UTF-8
const encText = (s, ver) => (ver === 4 ? utf8Bytes(s) : utf16Bytes(s));
const encByte = (ver) => new Uint8Array([ver === 4 ? 3 : 1]);
const zero = (ver) => new Uint8Array(ver === 4 ? 1 : 2);
function textFrame(id, values, ver) {
  const parts = [encByte(ver)];
  // v2.4 keeps several values apart with zeros; v2.3 has no such thing
  const list = ver === 4 ? values : [values.join("; ")];
  list.forEach((v, i) => { if (i) parts.push(zero(ver)); parts.push(encText(v, ver)); });
  return frameBytes(id, concat(parts), ver);
}
const txxx = (desc, values, ver) => frameBytes("TXXX", concat([encByte(ver), encText(desc, ver), zero(ver), ...(ver === 4 ? values : [values.join("; ")]).flatMap((v, i) => (i ? [zero(ver), encText(v, ver)] : [encText(v, ver)]))]), ver);
const langText = (id, lang, desc, text, ver) => frameBytes(id, concat([encByte(ver), latin1Bytes((lang || "eng").padEnd(3, " ").slice(0, 3)), encText(desc, ver), zero(ver), encText(text, ver)]), ver);

// re-encode a kept text frame whose encoding the new version doesn't have
function convertFrame(fr, ver) {
  const d = fr.data;
  if (!d) return null;
  if (ver === 3 && fr.id[0] === "T" && d[0] === 3) {
    if (fr.id === "TXXX") { const t = term(d, 1, 3); return txxx(utf8(d.subarray(1, t)), textValues(3, d.subarray(t + 1)), 3); }
    return textFrame(fr.id, textValues(3, d.subarray(1)), 3);
  }
  if (ver === 3 && (fr.id === "COMM" || fr.id === "USLT") && d[0] === 3) {
    const t = term(d, 4, 3);
    return langText(fr.id, str(d, 1, 3), utf8(d.subarray(4, t)), utf8(d.subarray(t + 1)), 3);
  }
  return frameBytes(fr.id, d, ver);
}

const TIPL_ROLE = { mixer: "mix", producer: "producer", engineer: "engineer", arranger: "arranger" };

// The full tag. opts: { version: 3 | 4, padding }. Returns { bytes, notes }
export function buildId3v2(m, opts = {}) {
  const ver = opts.version === 4 ? 4 : 3, frames = [], notes = [];
  const add = (b) => frames.push(b);
  const v = (k) => valuesOf(m, k);
  const done = new Set();
  for (const f of FIELDS) {
    const id = f.id3, vals = v(f.key);
    if (!id || done.has(id)) continue;
    if (id === "*track" || id === "*disc" || id === "*movement") {
      done.add(id);
      const [a, b, fid] = id === "*track" ? ["track", "trackTotal", "TRCK"] : id === "*disc" ? ["disc", "discTotal", "TPOS"] : ["movement", "movementTotal", "MVIN"];
      const n = m.fields[a]?.trim() || "", t = m.fields[b]?.trim() || "";
      if (n || t) add(textFrame(fid, [t ? `${n}/${t}` : n], ver));
      continue;
    }
    if (!vals) continue;
    if (id === "*date" || id === "*origdate") {
      const d = vals[0].trim();
      if (ver === 4) add(textFrame(id === "*date" ? "TDRC" : "TDOR", [d], ver));
      else {
        const x = /^(\d{4})(?:-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?)?/.exec(d);
        if (id === "*origdate") add(textFrame("TORY", [x ? x[1] : d], ver));
        else if (!x) add(textFrame("TYER", [d], ver));
        else {
          add(textFrame("TYER", [x[1]], ver));
          if (x[3]) add(textFrame("TDAT", [x[3] + x[2]], ver));
          if (x[5]) add(textFrame("TIME", [x[4] + x[5]], ver));
        }
      }
    } else if (id === "*genre") add(textFrame("TCON", vals, ver));
    else if (id === "*comment") add(langText("COMM", m.id3?.commentLang, "", vals.join("; "), ver));
    else if (id === "*lyrics") add(langText("USLT", m.id3?.lyricsLang, "", vals.join("; "), ver));
    else if (id === "*rating") {
      const stars = Math.max(0, Math.min(5, parseInt(vals[0], 10) || 0));
      if (stars) add(frameBytes("POPM", concat([latin1Bytes(m.id3?.popm?.email ?? "Windows Media Player 9 Series"), new Uint8Array([0, [0, 1, 64, 128, 196, 255][stars]]), m.id3?.popm?.rest ?? new Uint8Array(4)]), ver));
    } else if (id === "*ufid") add(frameBytes("UFID", concat([latin1Bytes("http://musicbrainz.org"), new Uint8Array([0]), latin1Bytes(vals[0].slice(0, 64))]), ver));
    else if (id.startsWith("*role:")) continue; // all credits go in one frame, below
    else if (id === "TXXX:ITUNESADVISORY") { const x = vals[0]; if (x === "explicit" || x === "clean") add(txxx("ITUNESADVISORY", [x === "explicit" ? "1" : "2"], ver)); }
    else if (id.startsWith("TXXX:")) add(txxx(id.slice(5), vals, ver));
    else if (id === "TCMP") { if (vals[0] === "1") add(textFrame("TCMP", ["1"], ver)); }
    else if (id[0] === "W" && id !== "WFED") add(frameBytes(id, latin1Bytes(vals[0]), ver));
    else add(textFrame(id, vals, ver));
  }
  // credits: v2.4 TIPL, v2.3 IPLS (same layout: role, name, role, name...)
  const roles = [];
  for (const [key, role] of Object.entries(TIPL_ROLE)) for (const who of v(key) || []) roles.push(role, who);
  for (const [r, who] of m.id3?.otherRoles || []) roles.push(r, who);
  if (roles.length) add(frameBytes(ver === 4 ? "TIPL" : "IPLS", concat([encByte(ver), ...roles.flatMap((s, i) => (i ? [zero(ver), encText(s, ver)] : [encText(s, ver)]))]), ver));
  if (m.synced?.trim()) {
    const lines = lrcToLines(m.synced);
    const parts = [encByte(ver), latin1Bytes((m.id3?.syncedLang || "eng").slice(0, 3)), new Uint8Array([2, m.id3?.syncedKind ?? 1]), zero(ver)];
    for (const l of lines) parts.push(encText(l.text, ver), zero(ver), u32be(l.ms));
    if (lines.length) add(frameBytes("SYLT", concat(parts), ver));
    else notes.push("The synced lyrics have no [mm:ss] timings, so they weren't saved.");
  }
  for (const c of m.custom || []) if (c.name?.trim() && String(c.value ?? "").trim() !== "") add(txxx(c.name.trim(), customValues(c), ver));
  // frames we don't edit, kept as they were
  let lost = 0;
  for (const o of m.other || []) {
    if (o.sys !== "id3" || !o.frame || o.remove) continue;
    const fr = o.frame;
    if (fr.ver === ver) add(frameBytes(fr.id, fr.raw, ver, fr.f1, fr.f2));
    else { const b = convertFrame(fr, ver); if (b) add(b); else lost++; }
  }
  if (lost) notes.push(`${lost} compressed or encrypted frame(s) can't be moved to ID3v2.${ver} and were left out.`);
  for (const p of m.pictures || []) {
    if (!p.bytes?.length) continue;
    add(frameBytes("APIC", concat([encByte(ver), latin1Bytes(p.mime || "image/jpeg"), new Uint8Array([0, p.type ?? 3]), encText(p.desc || "", ver), zero(ver), p.bytes]), ver));
  }
  const body = concat(frames), padding = opts.padding ?? 1024, size = body.length + padding;
  if (size >= 1 << 28) throw new Error("The tags are bigger than an ID3 tag can hold (256 MB). Use a smaller cover image.");
  const head = new Uint8Array(10);
  head.set(enc8.encode("ID3"), 0); head[3] = ver; head[4] = 0; head[5] = 0; head.set(syncsafeBytes(size), 6);
  return { bytes: concat([head, body, new Uint8Array(padding)]), notes };
}
