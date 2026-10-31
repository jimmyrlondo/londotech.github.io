// Encore Convert: containers for the browser's own encoders (WebCodecs), in
// plain JS so tests can check them in Node.
//   muxM4a(frames, { rate, channels, asc, priming, samples, kbps, meta, art })
//     AAC frames (raw, 1024 samples each) in an MP4 file: moov first (starts
//     playing before it's all loaded), an edit list plus iTunSMPB so players
//     skip the encoder's priming and padding, iTunes tags with the cover.
//   muxOggOpus(packets, { channels, preSkip, inputRate, samples, meta, art })
//     Opus packets in Ogg pages (CRC, granule positions, pre-skip), with
//     OpusHead and OpusTags (cover as METADATA_BLOCK_PICTURE).
import { concat } from "./convert-core.js";
import { vorbisComment, pictureBlock } from "./convert-flac.js";

const enc = new TextEncoder();
const u32 = (v) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v); return b; };
const u16 = (v) => Uint8Array.of((v >> 8) & 255, v & 255);
// box types are 4 raw (Latin-1) bytes: the iTunes (c) sign is the one byte 0xA9
const box = (type, ...parts) => { const body = concat(parts.flat()); return concat([u32(body.length + 8), Uint8Array.from(type, (c) => c.charCodeAt(0)), body]); };
const full = (type, version, flags, ...parts) => box(type, Uint8Array.of(version, (flags >> 16) & 255, (flags >> 8) & 255, flags & 255), ...parts);

// ---------- MP4 / M4A ----------
function esds(asc, kbps, maxFrame) {
  const desc = (tag, body) => { const l = body.length; return concat([Uint8Array.of(tag, 0x80 | ((l >> 21) & 127), 0x80 | ((l >> 14) & 127), 0x80 | ((l >> 7) & 127), l & 127), body]); };
  const dsi = desc(0x05, asc);
  const dcd = desc(0x04, concat([Uint8Array.of(0x40, 0x15), Uint8Array.of((maxFrame >> 16) & 255, (maxFrame >> 8) & 255, maxFrame & 255), u32(kbps * 1000), u32(kbps * 1000), dsi]));
  const es = desc(0x03, concat([u16(0), Uint8Array.of(0), dcd, desc(0x06, Uint8Array.of(0x02))]));
  return full("esds", 0, 0, es);
}
const MATRIX = concat([u32(0x00010000), u32(0), u32(0), u32(0), u32(0x00010000), u32(0), u32(0), u32(0), u32(0x40000000)]);

// iTunes-style tags
function ilst(meta, art, extra = []) {
  const data = (type, payload) => box("data", u32(type), u32(0), payload);
  const items = [];
  const text = (key, v) => { if (v !== undefined && v !== null && String(v).trim() !== "") items.push(box(key, data(1, enc.encode(String(v).trim())))); };
  text("\xa9nam", meta.title); text("\xa9ART", meta.artist); text("aART", meta.albumArtist); text("\xa9alb", meta.album);
  text("\xa9day", meta.year); text("\xa9gen", meta.genre); text("\xa9wrt", meta.composer); text("cprt", meta.copyright); text("\xa9cmt", meta.comment);
  text("\xa9too", "Encore Music Studio");
  const num = (key, v, len) => {
    const [a, b] = String(v ?? "").split("/").map((s) => parseInt(s, 10));
    if (!(a > 0)) return;
    const p = new Uint8Array(len); p[2] = (a >> 8) & 255; p[3] = a & 255; if (b > 0) { p[4] = (b >> 8) & 255; p[5] = b & 255; }
    items.push(box(key, data(0, p)));
  };
  num("trkn", meta.track, 8); num("disk", meta.disc, 6);
  if (meta.explicit) items.push(box("rtng", data(21, Uint8Array.of(1))));
  const freeform = (name, v) => items.push(box("----", full("mean", 0, 0, enc.encode("com.apple.iTunes")), full("name", 0, 0, enc.encode(name)), data(1, enc.encode(v))));
  if (meta.isrc) freeform("ISRC", String(meta.isrc).trim());
  for (const [k, v] of extra) freeform(k, v);
  if (art?.bytes?.length) items.push(box("covr", data(art.mime === "image/png" ? 14 : 13, art.bytes)));
  return box("ilst", ...items);
}
export function muxM4a(frames, { rate, channels, asc, priming = 0, samples, kbps, meta = {}, art = null }) {
  const count = frames.length, mediaDur = count * 1024;
  samples = samples ?? Math.max(0, mediaDur - priming);
  const padding = Math.max(0, mediaDur - priming - samples);
  const sizes = frames.map((f) => f.length), dataLen = sizes.reduce((a, b) => a + b, 0), maxFrame = Math.max(0, ...sizes);
  // iTunSMPB: Apple's gapless note (priming, padding, real length, in hex)
  const hx = (v, w = 8) => v.toString(16).toUpperCase().padStart(w, "0");
  const smpb = ` 00000000 ${hx(priming)} ${hx(padding)} ${hx(samples, 16)} 00000000 00000000 00000000 00000000 00000000 00000000 00000000 00000000`;
  const now = Math.floor(Date.now() / 1000) + 2082844800; // seconds since 1904
  const build = (chunkOffset) => {
    const stsd = full("stsd", 0, 0, u32(1), box("mp4a", new Uint8Array(6), u16(1), new Uint8Array(8), u16(channels), u16(16), u16(0), u16(0), u32((rate & 0xffff) * 65536 >>> 0), esds(asc, kbps, maxFrame)));
    const stts = full("stts", 0, 0, u32(1), u32(count), u32(1024));
    const stsc = full("stsc", 0, 0, u32(1), u32(1), u32(count), u32(1));
    const stsz = full("stsz", 0, 0, u32(0), u32(count), ...sizes.map(u32));
    const stco = full("stco", 0, 0, u32(1), u32(chunkOffset));
    const stbl = box("stbl", stsd, stts, stsc, stsz, stco);
    const minf = box("minf", full("smhd", 0, 0, u32(0)), box("dinf", full("dref", 0, 0, u32(1), full("url ", 0, 1))), stbl);
    const mdhd = full("mdhd", 0, 0, u32(now), u32(now), u32(rate), u32(mediaDur), u16(0x55c4), u16(0)); // language "und"
    const hdlr = full("hdlr", 0, 0, u32(0), enc.encode("soun"), new Uint8Array(12), enc.encode("SoundHandler\0"));
    const mdia = box("mdia", mdhd, hdlr, minf);
    // edit list: play from the end of the priming, for exactly `samples`
    const elst = full("elst", 0, 0, u32(1), u32(samples), u32(priming), u16(1), u16(0));
    const tkhd = full("tkhd", 0, 7, u32(now), u32(now), u32(1), u32(0), u32(samples), new Uint8Array(8), u16(0), u16(0), u16(0x0100), u16(0), MATRIX, u32(0), u32(0));
    const trak = box("trak", tkhd, box("edts", elst), mdia);
    const mvhd = full("mvhd", 0, 0, u32(now), u32(now), u32(rate), u32(samples), u32(0x00010000), u16(0x0100), new Uint8Array(10), MATRIX, new Uint8Array(24), u32(2));
    const metaBox = full("meta", 0, 0, full("hdlr", 0, 0, u32(0), enc.encode("mdirappl"), new Uint8Array(9)), ilst(meta, art, [["iTunSMPB", smpb]]));
    return box("moov", mvhd, trak, box("udta", metaBox));
  };
  const ftyp = box("ftyp", enc.encode("M4A "), u32(0), enc.encode("M4A "), enc.encode("mp42"), enc.encode("isom"));
  const moovLen = build(0).length;
  const moov = build(ftyp.length + moovLen + 8);
  const mdatHead = concat([u32(dataLen + 8), enc.encode("mdat")]);
  return new Blob([ftyp, moov, mdatHead, ...frames], { type: "audio/mp4" });
}
// ---------- Ogg / Opus ----------
let oggTable = null;
function oggCrc(u8) {
  if (!oggTable) { oggTable = new Uint32Array(256); for (let i = 0; i < 256; i++) { let r = i << 24; for (let k = 0; k < 8; k++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1; oggTable[i] = r >>> 0; } }
  let c = 0;
  for (let i = 0; i < u8.length; i++) c = ((c << 8) ^ oggTable[((c >>> 24) ^ u8[i]) & 255]) >>> 0;
  return c >>> 0;
}
// Pages from packets: [{ data, granule }] (granule -1 = no packet ends here)
class OggWriter {
  constructor(serial) { this.serial = serial >>> 0; this.seq = 0; this.pages = []; }
  page(segments, payload, granule, flags) {
    const h = new Uint8Array(27 + segments.length), dv = new DataView(h.buffer);
    h.set(enc.encode("OggS"), 0); h[4] = 0; h[5] = flags;
    if (granule < 0) { dv.setUint32(6, 0xffffffff, true); dv.setUint32(10, 0xffffffff, true); }
    else { dv.setUint32(6, granule % 2 ** 32, true); dv.setUint32(10, Math.floor(granule / 2 ** 32), true); }
    dv.setUint32(14, this.serial, true); dv.setUint32(18, this.seq++, true);
    h[26] = segments.length; h.set(segments, 27);
    const page = concat([h, payload]);
    new DataView(page.buffer).setUint32(22, oggCrc(page), true);
    this.pages.push(page);
  }
  // Write packets onto pages; the group's last packet ends its page.
  packets(list, { bos = false, eos = false, maxSegs = 255 } = {}) {
    let segs = [], payload = [], granule = -1, first = true, startsMid = false;
    const flush = (final, midPacket) => {
      const flags = (startsMid ? 1 : 0) | (bos && first ? 2 : 0) | (eos && final ? 4 : 0);
      this.page(Uint8Array.from(segs), concat(payload), granule, flags);
      first = false; segs = []; payload = []; granule = -1; startsMid = midPacket;
    };
    list.forEach(({ data, granule: g }, idx) => {
      let left = data.length, off = 0, started = false;
      for (;;) {
        if (segs.length === maxSegs) flush(false, started);
        const s = Math.min(255, left);
        segs.push(s); payload.push(data.subarray(off, off + s)); off += s; left -= s; started = true;
        if (s < 255) break; // a packet ends on a lacing value under 255
      }
      granule = g;
      if (idx === list.length - 1) flush(true, false);
    });
  }
  blob() { return new Blob(this.pages, { type: "audio/ogg" }); }
}

export function opusHead(channels, preSkip, inputRate) {
  const b = new Uint8Array(19), dv = new DataView(b.buffer);
  b.set(enc.encode("OpusHead"), 0); b[8] = 1; b[9] = channels;
  dv.setUint16(10, preSkip, true); dv.setUint32(12, inputRate, true); dv.setInt16(16, 0, true); b[18] = 0;
  return b;
}
export function muxOggOpus(packets, { channels, preSkip = 312, inputRate = 48000, samples, meta = {}, art = null, serial = 0x45434f52 }) {
  const w = new OggWriter(serial);
  w.packets([{ data: opusHead(channels, preSkip, inputRate), granule: 0 }], { bos: true });
  const extra = [];
  if (art?.bytes?.length) {
    const pic = pictureBlock(art);
    let s = ""; for (let i = 0; i < pic.length; i += 0x8000) s += String.fromCharCode(...pic.subarray(i, i + 0x8000));
    extra.push("METADATA_BLOCK_PICTURE=" + btoa(s));
  }
  w.packets([{ data: concat([enc.encode("OpusTags"), vorbisComment({ ...meta, extraComments: extra }, "Encore Music Studio")]), granule: 0 }]);
  // audio: about a second (50 packets of 20 ms) per page
  let pos = preSkip;
  const total = samples === undefined ? Infinity : preSkip + samples;
  const list = packets.map((p) => { pos += p.samples; return { data: p.data, granule: Math.min(pos, total) }; });
  for (let i = 0; i < list.length; i += 50) {
    const group = list.slice(i, i + 50), last = i + 50 >= list.length;
    w.packets(group, { eos: last });
  }
  if (!list.length) w.packets([{ data: new Uint8Array(0), granule: preSkip }], { eos: true });
  return w.blob();
}

// ---------- readers (for tests and the page's own check) ----------
// Ogg pages: [{ flags, granule, serial, seq, crcOk, segments, packetsEnded }]
export function readOgg(u8) {
  const pages = [];
  for (let p = 0; p + 27 <= u8.length;) {
    if (String.fromCharCode(...u8.subarray(p, p + 4)) !== "OggS") break;
    const dv = new DataView(u8.buffer, u8.byteOffset + p), n = u8[p + 26];
    let len = 0; for (let i = 0; i < n; i++) len += u8[p + 27 + i];
    const page = u8.slice(p, p + 27 + n + len), crc = dv.getUint32(22, true);
    page[22] = page[23] = page[24] = page[25] = 0;
    const lo = dv.getUint32(6, true), hi = dv.getUint32(10, true);
    pages.push({ flags: u8[p + 5], granule: hi === 0xffffffff && lo === 0xffffffff ? -1 : hi * 2 ** 32 + lo, serial: dv.getUint32(14, true), seq: dv.getUint32(18, true),
      crcOk: oggCrc(page) === crc, segs: Array.from(u8.subarray(p + 27, p + 27 + n)), body: u8.subarray(p + 27 + n, p + 27 + n + len) });
    p += 27 + n + len;
  }
  return pages;
}
// MP4 boxes as a tree of { type, start, end, kids }
export function readMp4Boxes(u8, from = 0, to = u8.length, depth = 0) {
  const out = [], containers = ["moov", "trak", "mdia", "minf", "stbl", "udta", "edts", "dinf", "ilst"];
  for (let p = from; p + 8 <= to;) {
    const size = new DataView(u8.buffer, u8.byteOffset + p).getUint32(0), type = String.fromCharCode(...u8.subarray(p + 4, p + 8));
    if (size < 8) break;
    const b = { type, start: p, end: p + size, kids: [] };
    if (containers.includes(type) || (depth > 0 && b.type.charCodeAt(0) === 0xa9) || ["trkn", "covr", "aART", "----", "disk"].includes(type)) b.kids = readMp4Boxes(u8, p + 8, p + size, depth + 1);
    if (type === "meta") b.kids = readMp4Boxes(u8, p + 12, p + size, depth + 1);
    out.push(b);
    p += size;
  }
  return out;
}
