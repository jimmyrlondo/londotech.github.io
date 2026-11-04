// Encore Tag: Ogg Vorbis and Opus. The tags live in the second header packet
// (the Vorbis comment, or OpusTags). Writing replaces that packet, lays the
// header packets out on fresh pages, and renumbers every page after them (new
// sequence numbers and checksums). The audio pages' contents are copied as is.
import { str, le32, concat, u32le, latin1Bytes } from "./tag-bin.js";
import { readComments, buildComments } from "./tag-vorbis.js";

// ---------- pages ----------
let CRC = null;
function crcTable() {
  CRC = new Uint32Array(256);
  for (let i = 0; i < 256; i++) { let r = i << 24; for (let k = 0; k < 8; k++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1; CRC[i] = r >>> 0; }
  return CRC;
}
export function oggCrc(page) { // over the whole page with its checksum field zeroed
  const t = CRC ?? crcTable();
  let c = 0;
  for (let i = 0; i < page.length; i++) c = ((c << 8) ^ t[((c >>> 24) ^ (i >= 22 && i < 26 ? 0 : page[i])) & 255]) >>> 0;
  return c;
}

export function oggPages(u8) {
  const pages = [];
  for (let p = 0; p < u8.length;) {
    if (p + 27 > u8.length || str(u8, p, 4) !== "OggS" || u8[p + 4] !== 0) throw new Error(`This Ogg file is damaged near byte ${p} (expected a page there).`);
    const n = u8[p + 26], lace = u8.subarray(p + 27, p + 27 + n);
    let body = 0;
    for (const v of lace) body += v;
    const end = p + 27 + n + body;
    if (end > u8.length) throw new Error("This Ogg file is cut short (its last page is incomplete).");
    pages.push({ start: p, end, flags: u8[p + 5], granule: u8.subarray(p + 6, p + 14), serial: le32(u8, p + 14), seq: le32(u8, p + 18), crc: le32(u8, p + 22), lace, body: u8.subarray(p + 27 + n, end) });
    p = end;
  }
  return pages;
}

function makePage(flags, granule, serial, seq, lace, body) {
  const page = new Uint8Array(27 + lace.length + body.length);
  page.set(latin1Bytes("OggS"), 0); page[4] = 0; page[5] = flags; page.set(granule, 6);
  page.set(u32le(serial), 14); page.set(u32le(seq), 18);
  page[26] = lace.length; page.set(lace, 27); page.set(body, 27 + lace.length);
  page.set(u32le(oggCrc(page)), 22);
  return page;
}
const ZERO_GRANULE = new Uint8Array(8), NO_GRANULE = new Uint8Array(8).fill(255);

// Packets laid out on as few pages as possible, the last page ending with the last packet
export function paginate(packets, serial, firstSeq) {
  const segs = []; // [length, packet index, is last segment of the packet]
  packets.forEach((pk, i) => {
    let left = pk.length;
    while (left >= 255) { segs.push([255, i, false]); left -= 255; }
    segs.push([left, i, true]);
  });
  const out = [];
  let s = 0, pos = 0, all = concat(packets), seq = firstSeq, continued = false;
  while (s < segs.length) {
    const run = segs.slice(s, s + 255), size = run.reduce((a, x) => a + x[0], 0);
    const ends = run.some((x) => x[2]);
    out.push(makePage(continued ? 1 : 0, ends ? ZERO_GRANULE : NO_GRANULE, serial, seq++, Uint8Array.from(run.map((x) => x[0])), all.subarray(pos, pos + size)));
    continued = !run[run.length - 1][2];
    pos += size; s += run.length;
  }
  return out;
}

// ---------- reading ----------
// The stream's header packets and where they end. Throws (with a plain reason) if this isn't an Ogg we can safely edit.
export function readOgg(u8) {
  const pages = oggPages(u8);
  if (!pages.length) throw new Error("This Ogg file is empty.");
  if (pages.some((p) => p.serial !== pages[0].serial) || pages.slice(1).some((p) => p.flags & 2))
    throw new Error("This Ogg file holds more than one stream (or several songs chained together). Editing those isn't supported.");
  const first = pages[0].body;
  const codec = str(first, 1, 6) === "vorbis" && first[0] === 1 ? "vorbis" : str(first, 0, 8) === "OpusHead" ? "opus" : str(first, 1, 4) === "FLAC" ? "flac" : str(first, 0, 8) === "Speex   " ? "speex" : "other";
  const out = { pages, codec, headers: [], headerPages: 0 };
  if (codec !== "vorbis" && codec !== "opus") return out;
  const need = codec === "vorbis" ? 3 : 2;
  let cur = [];
  for (let i = 0; i < pages.length && out.headers.length < need; i++) {
    const pg = pages[i];
    let o = 0;
    pg.lace.forEach((v, k) => {
      cur.push(pg.body.subarray(o, o + v)); o += v;
      if (v < 255) {
        out.headers.push(concat(cur)); cur = [];
        if (out.headers.length === need && k !== pg.lace.length - 1) out.mixed = true; // audio shares the last header page
        if (i === 0 && k !== pg.lace.length - 1) out.mixed = true; // the first page should hold only the first header
      }
    });
    out.headerPages = i + 1;
  }
  if (out.headers.length < need) throw new Error("This Ogg file's headers are incomplete.");
  if (out.mixed) throw new Error("This Ogg file's pages are laid out in an unusual way (audio shares a page with the headers). Editing it safely isn't supported.");
  const c = out.headers[1];
  if (codec === "vorbis") {
    if (c[0] !== 3 || str(c, 1, 6) !== "vorbis") throw new Error("This Ogg Vorbis file's comment header is missing.");
    const r = readComments(c, 7);
    Object.assign(out, { vendor: r.vendor, list: r.list });
  } else {
    if (str(c, 0, 8) !== "OpusTags") throw new Error("This Opus file's tag header is missing.");
    const r = readComments(c, 8);
    Object.assign(out, { vendor: r.vendor, list: r.list, extra: c.slice(r.end) }); // anything after the tags (kept)
  }
  // length: the last page's granule position (samples), less Opus's pre-skip
  const last = pages[pages.length - 1].granule, g = le32(last, 0) + le32(last, 4) * 4294967296;
  if (codec === "opus") out.duration = Math.max(0, g - (first[10] | (first[11] << 8))) / 48000;
  else { const rate = le32(first, 12); if (rate) out.duration = g / rate; }
  return out;
}

// ---------- writing ----------
export function writeOgg(u8, list) {
  const o = readOgg(u8);
  if (o.codec !== "vorbis" && o.codec !== "opus") throw new Error("Only Ogg Vorbis and Opus files can be tagged here.");
  const packet = o.codec === "vorbis"
    ? concat([new Uint8Array([3]), latin1Bytes("vorbis"), buildComments(o.vendor, list), new Uint8Array([1])])
    : concat([latin1Bytes("OpusTags"), buildComments(o.vendor, list), o.extra]);
  const serial = o.pages[0].serial;
  const head = paginate(o.codec === "vorbis" ? [packet, o.headers[2]] : [packet], serial, 1);
  const delta = 1 + head.length - o.headerPages, parts = [u8.subarray(o.pages[0].start, o.pages[0].end), ...head];
  for (const pg of o.pages.slice(o.headerPages)) {
    if (!delta) { parts.push(u8.subarray(pg.start, pg.end)); continue; }
    parts.push(makePage(pg.flags, pg.granule, serial, pg.seq + delta, pg.lace, pg.body));
  }
  return concat(parts);
}

// A check of a whole Ogg file: every checksum right, pages numbered 0, 1, 2...
export function checkOgg(u8) {
  const pages = oggPages(u8), problems = [];
  pages.forEach((p, i) => {
    if (oggCrc(u8.subarray(p.start, p.end)) !== p.crc) problems.push(`page ${i} has a bad checksum`);
    if (p.seq !== i) problems.push(`page ${i} is numbered ${p.seq}`);
  });
  return problems;
}
