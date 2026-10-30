// Encore Last Call: the release preflight's measurements and checks, with no
// page in them, so the same code runs in a worker and in Node
// (test-lastcall.mjs). Three parts:
//   readFileInfo / imageInfo   what the file really is (the browser's decoder
//                              resamples and hides the real format), its tags
//                              and embedded cover art
//   analyze                    every measurement, in one go over the audio
//   buildChecks / coverCheck / albumChecks / verdict / reportText
//                              turn measurements into pass / note / warning /
//                              fail, in plain English, each with how to fix it
import { integratedLufs } from "./master-core.js";
import { PLATFORMS, platformGain } from "./streaming.js";
import { fft } from "./tune-core.js";

const db10 = (x) => 10 * Math.log10(x + 1e-20);
const db20 = (x) => 20 * Math.log10(x + 1e-12);
const f1 = (x) => (Math.round(x * 10) / 10).toFixed(1).replace("-0.0", "0.0");
const signed = (x) => (x > 0.049 ? "+" : "") + f1(x);

export const fmtTime = (s) => {
  s = Math.max(0, s);
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
};
export const fmtLength = (s) => (s < 60 ? `${f1(s)} s` : fmtTime(s));

// "at 0:12, 1:40 and 2:14" (one time per second, the rest counted)
export function timeList(times, max = 6) {
  const t = [...new Set(times.map((x) => Math.floor(x)))].sort((a, b) => a - b).map(fmtTime);
  const shown = [...new Set(t)];
  if (!shown.length) return "";
  const head = shown.slice(0, max), more = shown.length - head.length;
  if (more > 0) return `at ${head.join(", ")} and ${more} more`;
  return "at " + (head.length === 1 ? head[0] : head.slice(0, -1).join(", ") + " and " + head[head.length - 1]);
}

const andList = (a) => (a.length <= 1 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1]);
const plural = (n, word, many = word + "s") => `${n} ${n === 1 ? word : many}`;

// ======================================================================
// File info: format, tags and cover art, read from the file's own bytes
// ======================================================================

const str = (u8, o, n) => { let s = ""; for (let i = 0; i < n && o + i < u8.length; i++) s += String.fromCharCode(u8[o + i]); return s; };
const be32 = (u8, o) => ((u8[o] << 24) | (u8[o + 1] << 16) | (u8[o + 2] << 8) | u8[o + 3]) >>> 0;
const le32 = (u8, o) => (u8[o] | (u8[o + 1] << 8) | (u8[o + 2] << 16) | (u8[o + 3] << 24)) >>> 0;
const be16 = (u8, o) => (u8[o] << 8) | u8[o + 1];
const le16 = (u8, o) => u8[o] | (u8[o + 1] << 8);
const syncsafe = (u8, o) => ((u8[o] & 127) << 21) | ((u8[o + 1] & 127) << 14) | ((u8[o + 2] & 127) << 7) | (u8[o + 3] & 127);
const latin1 = (b) => { let s = ""; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return s; };
const utf8 = (b) => new TextDecoder("utf-8").decode(b);
function utf16(b, bigEndian) {
  let s = "", i = 0;
  if (b.length >= 2 && ((b[0] === 0xff && b[1] === 0xfe) || (b[0] === 0xfe && b[1] === 0xff))) { bigEndian = b[0] === 0xfe; i = 2; }
  for (; i + 1 < b.length; i += 2) s += String.fromCharCode(bigEndian ? (b[i] << 8) | b[i + 1] : b[i] | (b[i + 1] << 8));
  return s;
}
const cleanText = (s) => s.replace(/\0+$/, "").split("\0")[0].trim();

// ---------- ID3v2 (MP3, and the "id3 " chunk in WAV/AIFF) ----------
function id3Text(enc, b) {
  return cleanText(enc === 0 ? latin1(b) : enc === 1 ? utf16(b, false) : enc === 2 ? utf16(b, true) : utf8(b));
}
function id3Term(b, from, enc) { // index of the text terminator (1 zero byte, or 2 for UTF-16)
  if (enc === 1 || enc === 2) { for (let i = from; i + 1 < b.length; i += 2) if (b[i] === 0 && b[i + 1] === 0) return i; return b.length; }
  const i = b.indexOf(0, from);
  return i < 0 ? b.length : i;
}
function unsync(b) { // undo ID3 unsynchronisation (FF 00 -> FF)
  const out = [];
  for (let i = 0; i < b.length; i++) { out.push(b[i]); if (b[i] === 0xff && b[i + 1] === 0) i++; }
  return Uint8Array.from(out);
}

export function readId3(u8, off = 0) {
  if (off + 10 > u8.length || str(u8, off, 3) !== "ID3") return null;
  const ver = u8[off + 3], flags = u8[off + 5], size = syncsafe(u8, off + 6);
  const out = { format: `ID3v2.${ver}`, tags: {}, art: null, size: 10 + size + (flags & 0x10 ? 10 : 0) };
  if (ver < 2 || ver > 4) return out;
  let body = u8.subarray(off + 10, Math.min(u8.length, off + 10 + size));
  if ((flags & 0x80) && ver < 4) body = unsync(body);
  let p = 0;
  if ((flags & 0x40) && ver >= 3) p += ver === 4 ? syncsafe(body, 0) : be32(body, 0) + 4; // extended header
  const idLen = ver === 2 ? 3 : 4, hLen = ver === 2 ? 6 : 10, validId = (s) => /^[A-Z0-9]{3,4}$/.test(s);
  while (p + hLen <= body.length) {
    const id = str(body, p, idLen);
    if (!validId(id)) break; // padding
    let fsize = ver === 2 ? (body[p + 3] << 16) | (body[p + 4] << 8) | body[p + 5] : ver === 4 ? syncsafe(body, p + 4) : be32(body, p + 4);
    // some v2.4 writers (old iTunes) store plain sizes: use whichever lands on the next frame
    if (ver === 4 && fsize >= 0x80) {
      const plain = be32(body, p + 4), next = (s) => p + hLen + s;
      const ok = (s) => next(s) === body.length || next(s) + 4 > body.length || body[next(s)] === 0 || validId(str(body, next(s), 4));
      if (!ok(fsize) && ok(plain)) fsize = plain;
    }
    const fflags = ver === 2 ? 0 : body[p + 9];
    let data = body.subarray(p + hLen, Math.min(body.length, p + hLen + fsize));
    p += hLen + fsize;
    if (ver === 4) { if (fflags & 0x0c) continue; if (fflags & 0x01) data = data.subarray(4); if (fflags & 0x02) data = unsync(data); }
    if (ver === 3 && (fflags & 0xc0)) continue; // compressed or encrypted
    if (!data.length) continue;
    const t = out.tags, enc = data[0];
    const text = () => id3Text(enc, data.subarray(1));
    switch (id) {
      case "TIT2": case "TT2": t.title = text(); break;
      case "TPE1": case "TP1": t.artist = text(); break;
      case "TALB": case "TAL": t.album = text(); break;
      case "TSRC": case "TRC": t.isrc = text(); break;
      case "TCON": case "TCO": t.genre = text(); break;
      case "TRCK": case "TRK": t.track = text(); break;
      case "TYER": case "TDRC": case "TYE": t.year = t.year || text(); break;
      case "TXXX": case "TXX": {
        const e = id3Term(data, 1, enc), desc = id3Text(enc, data.subarray(1, e)).toUpperCase();
        const val = id3Text(enc, data.subarray(e + (enc === 1 || enc === 2 ? 2 : 1)));
        if (desc === "ITUNESADVISORY") t.explicit = val === "1" ? true : val === "2" ? false : t.explicit;
        if (desc === "EXPLICIT") t.explicit = /^(1|yes|true|explicit)$/i.test(val);
        if (desc === "ISRC" && !t.isrc) t.isrc = val;
        break;
      }
      case "APIC": case "PIC": {
        let mime, type, s;
        if (id === "PIC") { const fmt = str(data, 1, 3).toUpperCase(); mime = fmt === "PNG" ? "image/png" : "image/jpeg"; type = data[4]; s = 5; }
        else { const me = id3Term(data, 1, 0); mime = latin1(data.subarray(1, me)).toLowerCase(); type = data[me + 1]; s = me + 2; }
        const de = id3Term(data, s, enc), bytes = data.slice(de + (enc === 1 || enc === 2 ? 2 : 1));
        if (bytes.length && (!out.art || (type === 3 && out.art.type !== 3))) out.art = { bytes, mime, type };
        break;
      }
    }
  }
  return out;
}

// ---------- RIFF INFO (WAV) ----------
function readRiffInfo(u8, from, to, tags) {
  const map = { INAM: "title", IART: "artist", IPRD: "album", ICRD: "year", IGNR: "genre", ITRK: "track", IPRT: "track" };
  for (let p = from; p + 8 <= to;) {
    const id = str(u8, p, 4), size = le32(u8, p + 4), v = cleanText(latin1(u8.subarray(p + 8, Math.min(to, p + 8 + size))));
    if (map[id] && v && !tags[map[id]]) tags[map[id]] = v;
    // RIFF's "ISRC" means "source", not the recording code: only take it if it looks like one
    if (id === "ISRC" && isrcCheck(v).valid && !tags.isrc) tags.isrc = v;
    p += 8 + size + (size & 1);
  }
}

// ---------- FLAC ----------
function readVorbisComments(b, tags) {
  let p = 4 + le32(b, 0); // vendor string
  const count = le32(b, p); p += 4;
  for (let i = 0; i < count && p + 4 <= b.length; i++) {
    const len = le32(b, p), kv = utf8(b.subarray(p + 4, p + 4 + len)); p += 4 + len;
    const eq = kv.indexOf("="); if (eq < 0) continue;
    const k = kv.slice(0, eq).toUpperCase(), v = kv.slice(eq + 1).trim();
    const map = { TITLE: "title", ARTIST: "artist", ALBUM: "album", DATE: "year", GENRE: "genre", TRACKNUMBER: "track", ISRC: "isrc" };
    if (map[k] && !tags[map[k]]) tags[map[k]] = v;
    if (k === "ITUNESADVISORY") tags.explicit = v === "1" ? true : v === "2" ? false : tags.explicit;
    if (k === "EXPLICIT") tags.explicit = /^(1|yes|true|explicit)$/i.test(v);
  }
}
function readFlacPicture(b) {
  const type = be32(b, 0), ml = be32(b, 4), mime = latin1(b.subarray(8, 8 + ml)).toLowerCase();
  const dl = be32(b, 8 + ml), p = 12 + ml + dl + 16, len = be32(b, p);
  return { type, mime, bytes: b.slice(p + 4, p + 4 + len) };
}

// ---------- MP3 / AAC frame headers ----------
const MP3_RATES = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };
const MP3_KBPS = {
  "1-3": [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  "1-2": [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
  "1-1": [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
  "2-3": [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
  "2-2": [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
  "2-1": [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
};
function mp3Frame(u8, p) {
  if (p + 4 > u8.length || u8[p] !== 0xff || (u8[p + 1] & 0xe0) !== 0xe0) return null;
  const ver = (u8[p + 1] >> 3) & 3, layerBits = (u8[p + 1] >> 1) & 3, br = u8[p + 2] >> 4, sr = (u8[p + 2] >> 2) & 3, pad = (u8[p + 2] >> 1) & 1;
  if (ver === 1 || layerBits === 0 || br === 0 || br === 15 || sr === 3) return null;
  const layer = 4 - layerBits, kbps = MP3_KBPS[`${ver === 3 ? 1 : 2}-${layer}`][br], rate = MP3_RATES[ver][sr];
  const channels = (u8[p + 3] >> 6) === 3 ? 1 : 2;
  const len = layer === 1 ? (Math.floor(12000 * kbps / rate) + pad) * 4 : Math.floor((layer === 3 && ver !== 3 ? 72000 : 144000) * kbps / rate) + pad;
  return { ver, layer, kbps, rate, channels, len };
}
function findMp3(u8, from) {
  const end = Math.min(u8.length - 4, from + (1 << 17));
  for (let p = from; p < end; p++) {
    const f = mp3Frame(u8, p);
    if (f && f.len > 0) {
      const g = mp3Frame(u8, p + f.len); // a real frame is followed by another
      if (g && g.rate === f.rate && g.layer === f.layer) return { ...f, at: p };
    }
  }
  return null;
}
const AAC_RATES = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];

// ---------- MP4 / M4A boxes ----------
function mp4Boxes(u8, from, to, visit) {
  for (let p = from; p + 8 <= to;) {
    let size = be32(u8, p), head = 8;
    const type = str(u8, p + 4, 4);
    if (size === 1) { size = be32(u8, p + 8) * 4294967296 + be32(u8, p + 12); head = 16; }
    else if (size === 0) size = to - p;
    if (size < head) break;
    visit(type, p + head, Math.min(to, p + size));
    p += size;
  }
}
function readMp4(u8, info) {
  const t = info.tags;
  const walk = (from, to, path) => mp4Boxes(u8, from, to, (type, a, b) => {
    const here = path + "/" + type;
    if (["moov", "trak", "mdia", "minf", "stbl", "udta", "ilst"].includes(type)) walk(a, b, here);
    else if (type === "meta") walk(str(u8, a + 4, 4) === "hdlr" ? a : a + 4, b, here); // a full box, except in QuickTime files
    else if (type === "mdhd" && !info.duration) {
      const v = u8[a], ts = v === 1 ? be32(u8, a + 20) : be32(u8, a + 12), d = v === 1 ? be32(u8, a + 24) * 4294967296 + be32(u8, a + 28) : be32(u8, a + 16);
      if (ts) info.duration = d / ts;
    } else if (type === "stsd" && !info.codec) {
      const e = a + 8, codec = str(u8, e + 4, 4);
      if (["mp4a", "alac", "ac-3", "ec-3", "Opus", "fLaC"].includes(codec)) {
        info.codec = codec; info.channels = be16(u8, e + 24); info.bitDepth = be16(u8, e + 26); info.sampleRate = be16(u8, e + 32);
        if (codec === "alac") { // the alac box inside has the real bit depth and rate
          mp4Boxes(u8, e + 36, b, (bt, ba) => { if (bt === "alac") { info.bitDepth = u8[ba + 9]; info.sampleRate = be32(u8, ba + 24) || info.sampleRate; } });
        }
      }
    } else if (path.endsWith("/ilst")) {
      mp4Boxes(u8, a, b, (dt, da, dbEnd) => {
        if (dt !== "data") return;
        const val = u8.subarray(da + 8, dbEnd), kind = be32(u8, da) & 0xffffff;
        const map = { "\xa9nam": "title", "\xa9ART": "artist", "\xa9alb": "album", "\xa9day": "year", "\xa9gen": "genre" };
        if (map[type]) t[map[type]] = utf8(val).trim();
        if (type === "rtng") t.explicit = val[0] === 1 || val[0] === 4 ? true : val[0] === 2 ? false : t.explicit;
        if (type === "covr" && !info.art) info.art = { bytes: val.slice(), mime: kind === 14 ? "image/png" : "image/jpeg", type: 3 };
      });
    }
  });
  walk(0, u8.length, "");
}

// ---------- the whole file ----------
// What the file really is. bytes: the file's ArrayBuffer or Uint8Array (read
// this BEFORE decodeAudioData, which takes the buffer away). Never throws: an
// unreadable file comes back as container "unknown".
export function readFileInfo(bytes, name = "") {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const info = { name, size: u8.length, container: "unknown", label: "Unknown", codec: "", lossy: null, sampleRate: 0, bitDepth: 0, float: false,
    channels: 0, bitrate: 0, vbr: false, duration: 0, tags: {}, tagFormats: [], art: null, wav: null };
  const id3into = (o) => {
    const r = readId3(u8, o);
    if (!r) return 0;
    info.tagFormats.push(r.format);
    for (const [k, v] of Object.entries(r.tags)) if (v !== undefined && v !== "" && info.tags[k] === undefined) info.tags[k] = v;
    if (r.art && !info.art) info.art = r.art;
    return r.size;
  };
  try {
    const head4 = str(u8, 0, 4);
    if ((head4 === "RIFF" || head4 === "RF64") && str(u8, 8, 4) === "WAVE") {
      Object.assign(info, { container: "wav", label: "WAV" });
      for (let p = 12; p + 8 <= u8.length;) {
        const id = str(u8, p, 4); let size = le32(u8, p + 4);
        if (id === "data" && (size === 0xffffffff || size === 0 || p + 8 + size > u8.length)) size = u8.length - p - 8; // RF64, or a file still being written
        if (id === "fmt ") {
          let code = le16(u8, p + 8);
          info.channels = le16(u8, p + 10); info.sampleRate = le32(u8, p + 12); info.bitDepth = le16(u8, p + 22);
          const blockAlign = le16(u8, p + 20);
          if (code === 0xfffe && size >= 40) code = le16(u8, p + 32); // WAVE_FORMAT_EXTENSIBLE: the real format is in the sub-format
          info.wav = { ...(info.wav || {}), code, blockAlign };
          info.float = code === 3;
          const names = { 1: "PCM", 3: "PCM (float)", 2: "ADPCM", 0x11: "IMA ADPCM", 6: "A-law", 7: "mu-law", 0x50: "MPEG", 0x55: "MP3", 0xff: "AAC", 0x1610: "AAC", 0x161: "WMA" };
          info.codec = names[code] || `format 0x${code.toString(16)}`;
          info.lossy = !(code === 1 || code === 3);
          if (code === 0x55 || code === 0x50) info.bitrate = Math.round(le32(u8, p + 16) * 8 / 1000);
        } else if (id === "data") {
          info.wav = { ...(info.wav || {}), dataOffset: p + 8, dataLength: size };
        } else if (id === "LIST" && str(u8, p + 8, 4) === "INFO") {
          info.tagFormats.push("RIFF INFO");
          readRiffInfo(u8, p + 12, Math.min(u8.length, p + 8 + size), info.tags);
        } else if (id === "id3 " || id === "ID3 ") id3into(p + 8);
        p += 8 + size + (size & 1);
      }
      if (info.wav?.blockAlign && info.sampleRate) info.duration = (info.wav.dataLength || 0) / info.wav.blockAlign / info.sampleRate;
      return info;
    }
    let o = 0;
    if (str(u8, 0, 3) === "ID3") o = id3into(0); // MP3s, and FLACs with a stray ID3 tag in front
    if (str(u8, o, 4) === "fLaC") {
      Object.assign(info, { container: "flac", label: "FLAC", codec: "FLAC", lossy: false });
      for (let p = o + 4; p + 4 <= u8.length;) {
        const last = u8[p] & 0x80, type = u8[p] & 0x7f, len = (u8[p + 1] << 16) | (u8[p + 2] << 8) | u8[p + 3], b = u8.subarray(p + 4, p + 4 + len);
        if (type === 0) {
          info.sampleRate = (b[10] << 12) | (b[11] << 4) | (b[12] >> 4);
          info.channels = ((b[12] >> 1) & 7) + 1;
          info.bitDepth = (((b[12] & 1) << 4) | (b[13] >> 4)) + 1;
          const total = (b[13] & 15) * 4294967296 + be32(b, 14);
          if (info.sampleRate) info.duration = total / info.sampleRate;
        } else if (type === 4) { info.tagFormats.push("Vorbis comments"); readVorbisComments(b, info.tags); }
        else if (type === 6) { const pic = readFlacPicture(b); if (!info.art || (pic.type === 3 && info.art.type !== 3)) info.art = pic; }
        p += 4 + len;
        if (last) break;
      }
      return info;
    }
    if (head4 === "FORM" && (str(u8, 8, 4) === "AIFF" || str(u8, 8, 4) === "AIFC")) {
      Object.assign(info, { container: "aiff", label: "AIFF", codec: "PCM", lossy: false });
      for (let p = 12; p + 8 <= u8.length;) {
        const id = str(u8, p, 4), size = be32(u8, p + 4), a = p + 8;
        if (id === "COMM") {
          info.channels = be16(u8, a); const frames = be32(u8, a + 2); info.bitDepth = be16(u8, a + 6);
          // 80-bit extended float sample rate
          const exp = ((u8[a + 8] & 0x7f) << 8) | u8[a + 9], mant = be32(u8, a + 10) * 4294967296 + be32(u8, a + 14);
          info.sampleRate = Math.round(mant * Math.pow(2, exp - 16383 - 63));
          if (info.sampleRate) info.duration = frames / info.sampleRate;
          if (str(u8, 8, 4) === "AIFC" && size >= 22) {
            const c = str(u8, a + 18, 4);
            info.float = /^(fl32|FL32|fl64|FL64)$/.test(c);
            info.lossy = !(c === "NONE" || c === "sowt" || c === "twos" || info.float);
            info.codec = info.float ? "PCM (float)" : info.lossy ? c.trim() : "PCM";
          }
        } else if (id === "ID3 " || id === "id3 ") id3into(a);
        else if (id === "NAME" && !info.tags.title) info.tags.title = cleanText(latin1(u8.subarray(a, a + size)));
        else if (id === "AUTH" && !info.tags.artist) info.tags.artist = cleanText(latin1(u8.subarray(a, a + size)));
        p += 8 + size + (size & 1);
      }
      return info;
    }
    if (str(u8, 4, 4) === "ftyp") {
      Object.assign(info, { container: "m4a", label: "M4A" });
      readMp4(u8, info);
      if (info.codec === "alac") Object.assign(info, { label: "Apple Lossless (M4A)", lossy: false });
      else if (info.codec === "fLaC") Object.assign(info, { label: "FLAC in MP4", lossy: false });
      else Object.assign(info, { label: info.codec === "mp4a" ? "AAC (M4A)" : "M4A", lossy: true, bitDepth: 0 });
      if (info.tags.title || info.tags.artist) info.tagFormats.push("iTunes tags");
      return info;
    }
    if (head4 === "OggS") {
      const seg = u8[26], pk = 27 + seg;
      if (str(u8, pk + 1, 6) === "vorbis") Object.assign(info, { codec: "Vorbis", label: "Ogg Vorbis", channels: u8[pk + 11], sampleRate: le32(u8, pk + 12), bitrate: Math.round(le32(u8, pk + 20) / 1000) });
      else if (str(u8, pk, 8) === "OpusHead") Object.assign(info, { codec: "Opus", label: "Opus", channels: u8[pk + 9], sampleRate: le32(u8, pk + 12) || 48000 });
      else if (str(u8, pk + 1, 4) === "FLAC") Object.assign(info, { codec: "FLAC", label: "FLAC (Ogg)" });
      Object.assign(info, { container: "ogg", lossy: info.codec !== "FLAC" });
      return info;
    }
    // AAC in ADTS frames (.aac)
    if (u8[o] === 0xff && (u8[o + 1] & 0xf6) === 0xf0) {
      Object.assign(info, { container: "aac", label: "AAC", codec: "AAC", lossy: true,
        sampleRate: AAC_RATES[(u8[o + 2] >> 2) & 15] || 0, channels: ((u8[o + 2] & 1) << 2) | (u8[o + 3] >> 6) });
      return info;
    }
    const f = findMp3(u8, o);
    if (f) {
      Object.assign(info, { container: "mp3", label: f.layer === 3 ? "MP3" : `MPEG layer ${f.layer}`, codec: "MP3", lossy: true, sampleRate: f.rate, channels: f.channels, bitrate: f.kbps });
      // a Xing/Info header in the first frame: VBR (Xing) and the frame count
      const side = f.ver === 3 ? (f.channels === 1 ? 17 : 32) : (f.channels === 1 ? 9 : 17), x = f.at + 4 + side, xing = str(u8, x, 4);
      if (xing === "Xing" || xing === "Info") {
        info.vbr = xing === "Xing";
        if (u8[x + 7] & 1) { const frames = be32(u8, x + 8); info.duration = frames * (f.ver === 3 ? 1152 : 576) / f.rate; }
        if (info.vbr && info.duration) info.bitrate = Math.round((u8.length - f.at) * 8 / info.duration / 1000);
      }
      if (!info.duration && f.kbps) info.duration = (u8.length - f.at) * 8 / (f.kbps * 1000);
      return info;
    }
  } catch { /* a damaged header: report what we have */ }
  return info;
}

// Plain PCM from a WAV's bytes (the page's fallback when the browser can't
// decode a WAV; Node tests use it to check real files end to end).
export function decodeWav(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const info = readFileInfo(u8);
  const w = info.wav;
  if (!w || w.dataOffset === undefined || !(w.code === 1 || w.code === 3)) return null;
  const ch = info.channels, bps = info.bitDepth / 8, frames = Math.floor(w.dataLength / (ch * bps));
  const dv = new DataView(u8.buffer, u8.byteOffset + w.dataOffset, Math.min(w.dataLength, frames * ch * bps));
  const chans = Array.from({ length: ch }, () => new Float32Array(frames));
  for (let i = 0, o = 0; i < frames; i++) {
    for (let c = 0; c < ch; c++, o += bps) {
      let v;
      if (w.code === 3) v = bps === 8 ? dv.getFloat64(o, true) : dv.getFloat32(o, true);
      else if (bps === 1) v = (dv.getUint8(o) - 128) / 128;
      else if (bps === 2) v = dv.getInt16(o, true) / 32768;
      else if (bps === 3) v = (((dv.getUint8(o + 2) << 24) | (dv.getUint8(o + 1) << 16) | (dv.getUint8(o) << 8)) >> 8) / 8388608;
      else v = dv.getInt32(o, true) / 2147483648;
      chans[c][i] = v;
    }
  }
  return { chans, fs: info.sampleRate, info };
}

// ---------- images ----------
// Type, size and color model of a cover image, from its bytes
export function imageInfo(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const out = { type: "unknown", width: 0, height: 0, color: "", alpha: false, progressive: false, size: u8.length };
  if (u8[0] === 0xff && u8[1] === 0xd8) {
    out.type = "jpeg";
    let adobe = -1;
    for (let p = 2; p + 4 <= u8.length;) {
      if (u8[p] !== 0xff) { p++; continue; }
      const mk = u8[p + 1];
      if (mk === 0xff) { p++; continue; }
      if (mk === 0xd8 || mk === 0x01 || (mk >= 0xd0 && mk <= 0xd7)) { p += 2; continue; }
      if (mk === 0xd9 || mk === 0xda) break;
      const len = be16(u8, p + 2);
      if (mk === 0xee && str(u8, p + 4, 5) === "Adobe") adobe = u8[p + 15];
      if (mk >= 0xc0 && mk <= 0xcf && mk !== 0xc4 && mk !== 0xc8 && mk !== 0xcc) {
        out.height = be16(u8, p + 5); out.width = be16(u8, p + 7);
        const comps = u8[p + 9];
        out.color = comps === 1 ? "Grayscale" : comps === 4 ? "CMYK" : "RGB";
        out.progressive = mk === 0xc2 || mk === 0xc6 || mk === 0xca || mk === 0xce;
      }
      p += 2 + len;
    }
    if (out.color === "CMYK" && adobe === 2) out.color = "CMYK"; // YCCK is CMYK for our purposes
  } else if (str(u8, 1, 3) === "PNG" && u8[0] === 0x89) {
    out.type = "png"; out.width = be32(u8, 16); out.height = be32(u8, 20);
    const ct = u8[25];
    out.color = ct === 0 || ct === 4 ? "Grayscale" : ct === 3 ? "Palette" : "RGB";
    out.alpha = ct === 4 || ct === 6;
    // a palette or gray image with a transparency chunk
    for (let p = 8; p + 8 <= u8.length && !out.alpha;) { const len = be32(u8, p), t = str(u8, p + 4, 4); if (t === "tRNS") out.alpha = true; if (t === "IDAT" || t === "IEND") break; p += 12 + len; }
  } else if (str(u8, 0, 4) === "GIF8") { out.type = "gif"; out.width = le16(u8, 6); out.height = le16(u8, 8); }
  else if (str(u8, 0, 2) === "BM") { out.type = "bmp"; out.width = le32(u8, 18); out.height = Math.abs(le32(u8, 22) | 0); }
  else if (str(u8, 0, 4) === "RIFF" && str(u8, 8, 4) === "WEBP") {
    out.type = "webp";
    const k = str(u8, 12, 4);
    if (k === "VP8X") { out.width = 1 + (u8[24] | (u8[25] << 8) | (u8[26] << 16)); out.height = 1 + (u8[27] | (u8[28] << 8) | (u8[29] << 16)); }
    else if (k === "VP8 ") { out.width = le16(u8, 26) & 0x3fff; out.height = le16(u8, 28) & 0x3fff; }
    else if (k === "VP8L") { const b = le32(u8, 21); out.width = (b & 0x3fff) + 1; out.height = ((b >> 14) & 0x3fff) + 1; }
  } else if (str(u8, 0, 4) === "II*\0" || str(u8, 0, 4) === "MM\0*") out.type = "tiff";
  else if (str(u8, 4, 4) === "ftyp" && /^(heic|heix|mif1|avif)/.test(str(u8, 8, 4))) out.type = str(u8, 8, 4) === "avif" ? "avif" : "heic";
  return out;
}

// ======================================================================
// Measurements
// ======================================================================

// RBJ biquads: [b0, b1, b2, a1, a2]
function lowpass(f, fs, q = Math.SQRT1_2) {
  const w = 2 * Math.PI * f / fs, al = Math.sin(w) / (2 * q), c = Math.cos(w), a0 = 1 + al;
  return [(1 - c) / 2 / a0, (1 - c) / a0, (1 - c) / 2 / a0, -2 * c / a0, (1 - al) / a0];
}
function highpass(f, fs, q = Math.SQRT1_2) {
  const w = 2 * Math.PI * f / fs, al = Math.sin(w) / (2 * q), c = Math.cos(w), a0 = 1 + al;
  return [(1 + c) / 2 / a0, -(1 + c) / a0, (1 + c) / 2 / a0, -2 * c / a0, (1 - al) / a0];
}
function biquad(x, [b0, b1, b2, a1, a2]) { // in place
  let z1 = 0, z2 = 0;
  for (let i = 0; i < x.length; i++) { const v = x[i], y = b0 * v + z1; z1 = b1 * v - a1 * y + z2; z2 = b2 * v - a2 * y; x[i] = y; }
}
// low-pass then keep every d-th sample (the cheap way to look at the low end)
function decimate(x, fs, d) {
  const tmp = Float32Array.from(x), c = lowpass(1000, fs);
  biquad(tmp, c); biquad(tmp, c);
  const out = new Float32Array(Math.floor(x.length / d));
  for (let i = 0; i < out.length; i++) out[i] = tmp[i * d];
  return out;
}

// K-weighted energy per 100 ms (the same filter as master-core's integratedLufs)
function kBlocks(x, fs, hop) {
  let K = Math.tan(Math.PI * 1681.974450955533 / fs);
  const Vh = Math.pow(10, 3.999843853973347 / 20), Vb = Math.pow(Vh, 0.4996667741545416), Q = 0.7071752369554196;
  let a0 = 1 + K / Q + K * K;
  const s = [(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0];
  K = Math.tan(Math.PI * 38.13547087602444 / fs);
  const Q2 = 0.5003270373238773;
  a0 = 1 + K / Q2 + K * K;
  const h3 = 2 * (K * K - 1) / a0, h4 = (1 - K / Q2 + K * K) / a0;
  const nb = Math.floor(x.length / hop), out = new Float64Array(nb);
  let z1 = 0, z2 = 0, y1 = 0, y2 = 0, acc = 0, c = 0, k = 0;
  for (let i = 0; i < nb * hop; i++) {
    const x0 = x[i];
    const y = s[0] * x0 + z1; z1 = s[1] * x0 - s[3] * y + z2; z2 = s[2] * x0 - s[4] * y;
    const o = y + y1; y1 = -2 * y - h3 * o + y2; y2 = y - h4 * o;
    acc += o * o;
    if (++c === hop) { out[k++] = acc; acc = 0; c = 0; }
  }
  return out;
}

// 4x oversampling taps (Kaiser-windowed sinc, 16 per phase) for the in-between points
const TP_HALF = 8;
const TP_TAPS = (() => {
  const i0 = (x) => { let s = 1, t = 1; for (let k = 1; k < 30; k++) { t *= (x / (2 * k)) ** 2; s += t; } return s; };
  const beta = 7, norm = i0(beta);
  return [0.25, 0.5, 0.75].map((t) => {
    const h = new Float64Array(2 * TP_HALF);
    let sum = 0;
    for (let j = -TP_HALF + 1; j <= TP_HALF; j++) {
      const u = j - t, sinc = Math.sin(Math.PI * u) / (Math.PI * u), w = i0(beta * Math.sqrt(Math.max(0, 1 - (u / TP_HALF) ** 2))) / norm;
      h[j + TP_HALF - 1] = sinc * w; sum += sinc * w;
    }
    for (let k = 0; k < h.length; k++) h[k] /= sum;
    return h;
  });
})();

// Groups sample positions into events (anything within `gap` seconds is one)
function eventList(fs, gap = 0.5) {
  const ev = [];
  return {
    ev,
    add(i, v = 0) {
      const t = i / fs, e = ev[ev.length - 1];
      if (e && t - e.end <= gap) { e.end = t; e.n++; e.max = Math.max(e.max, v); }
      else ev.push({ start: t, end: t, n: 1, max: v });
    },
  };
}

// Events from several channels, in time order, merged the same way
function mergeEvents(lists, gap) {
  const out = [];
  for (const e of lists.flatMap((x) => x.ev).sort((a, b) => a.start - b.start)) {
    const last = out[out.length - 1];
    if (last && e.start - last.end <= gap) { last.end = Math.max(last.end, e.end); last.n += e.n; last.max = Math.max(last.max, e.max); }
    else out.push({ ...e });
  }
  return out;
}

// True peak (BS.1770 style, 4x oversampled). Only looks between samples where
// one of them is within 8 dB of the channel's sample peak: an in-between peak
// far above both neighbours doesn't happen in real music.
function truePeak(x, fs, overLevel, overs) {
  let sp = 0;
  for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > sp) sp = a; }
  const thr = sp * 0.4, n = x.length;
  let peak = sp, at = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.abs(x[i]);
    if (a === sp && !at) at = i;
    if (a > overLevel) overs.add(i, a);
    if (a < thr && (i + 1 >= n || Math.abs(x[i + 1]) < thr)) continue;
    for (const h of TP_TAPS) {
      let y = 0;
      const from = i - TP_HALF + 1;
      if (from >= 0 && from + h.length <= n) for (let k = 0; k < h.length; k++) y += x[from + k] * h[k];
      else for (let k = 0; k < h.length; k++) { const j = from + k; if (j >= 0 && j < n) y += x[j] * h[k]; }
      y = Math.abs(y);
      if (y > peak) { peak = y; at = i; }
      if (y > overLevel) overs.add(i, y);
    }
  }
  return { peak, at, samplePeak: sp };
}

// Flat-topped peaks: 3+ samples in a row stuck at the channel's own top level,
// reached steeply (a clipped wave hits the ceiling fast; a smooth wave that
// happens to sit near its top for a few samples creeps up to it).
function flatRuns(x, level, tol, ev) {
  const n = x.length, thr = level - tol;
  let start = -1, sign = 0, runs = 0, longest = 0;
  for (let i = 0; i <= n; i++) {
    const v = i < n ? x[i] : 0, s = v >= thr ? 1 : v <= -thr ? -1 : 0;
    if (s === sign) continue;
    if (sign !== 0 && i - start >= 3) {
      const before = start > 0 ? Math.abs(x[start - 1]) : 0, after = i < n ? Math.abs(x[i]) : 0;
      if (level - before > 4 * tol && level - after > 4 * tol) { runs++; longest = Math.max(longest, i - start); ev.add(start, i - start); }
    }
    start = i; sign = s;
  }
  return { runs, longest };
}

// Average spectrum of the song (mid), in 250 Hz bands, and the sharpest
// "cliff" in the top octave: MP3/AAC encoders cut everything above a fixed
// frequency (about 16 kHz at 128 kbps, 19-20 kHz at 320), which no natural
// mix does that steeply.
function spectrumCliff(l, r, fs) {
  const N = 8192, n = l.length, frames = Math.min(160, Math.floor(n / N));
  if (frames < 4) return null;
  const re = new Float64Array(N), im = new Float64Array(N), pow = new Float64Array(N / 2), win = new Float64Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
  const step = Math.floor((n - N) / Math.max(1, frames - 1));
  let used = 0;
  for (let f = 0; f < frames; f++) {
    const s = f * step;
    let e = 0;
    for (let i = 0; i < N; i++) { const v = 0.5 * (l[s + i] + r[s + i]); re[i] = v * win[i]; e += v * v; }
    if (e / N < 1e-5) continue; // quieter than -50 dB: an intro, a gap
    im.fill(0); fft(re, im);
    for (let k = 0; k < N / 2; k++) pow[k] += re[k] * re[k] + im[k] * im[k];
    used++;
  }
  if (used < 4) return null;
  const bw = 250, nb = Math.floor(fs / 2 / bw), lev = new Float64Array(nb), lin = new Float64Array(nb);
  for (let b = 0; b < nb; b++) {
    const k0 = Math.floor(b * bw * N / fs), k1 = Math.max(k0 + 1, Math.floor((b + 1) * bw * N / fs));
    let s = 0; for (let k = k0; k < k1 && k < N / 2; k++) s += pow[k];
    lin[b] = s / (k1 - k0); lev[b] = db10(lin[b]);
  }
  const meanDb = (a, b) => { let s = 0, c = 0; for (let k = a; k <= b; k++) { s += lin[k]; c++; } return db10(s / Math.max(1, c)); };
  const ref = meanDb(4, 15); // 1-4 kHz
  const scanTo = fs > 50000 ? 24500 : 19000; // 44.1/48 kHz files have a natural resampling edge around 20 kHz
  let best = null;
  for (let b = 40; b * bw <= scanTo; b++) { // from 10 kHz up
    if (b + 7 > nb - 1) break;
    const below = meanDb(b - 6, b - 1);
    let above = -Infinity;
    for (let k = b + 3; k <= Math.min(nb - 2, b + 14); k++) above = Math.max(above, lev[k]);
    const drop = below - above;
    if (drop > 24 && below > ref - 50 && (!best || drop > best.drop)) best = { b, drop, below };
  }
  if (!best) return { cliffHz: 0, drop: 0 };
  // the edge itself: the first band well under the music just below it
  let edge = best.b;
  for (let k = best.b - 6; k <= best.b + 2; k++) {
    let gone = true;
    for (let j = k; j <= best.b + 2; j++) if (lev[j] >= best.below - 20) gone = false;
    if (gone) { edge = k; break; } // from here up it stays gone
  }
  return { cliffHz: edge * bw, drop: best.drop };
}

const BANDS = [
  { name: "Sub bass", hz: "below 60 Hz", lo: 20, hi: 60, low: true },
  { name: "Bass", hz: "60-120 Hz", lo: 60, hi: 120, low: true },
  { name: "Low mids", hz: "120-250 Hz", lo: 120, hi: 250, low: true },
  { name: "Mids", hz: "250 Hz-2 kHz", lo: 250, hi: 2000 },
  { name: "Highs", hz: "above 2 kHz", lo: 2000, hi: 0 },
];

/**
 * Every measurement Last Call makes, from decoded audio.
 * chans: Float32Array per channel (1 = mono, 2 = stereo, more: the first two
 * are checked). opts: { bitDepth, float, onProgress(fraction) }.
 * Returns plain numbers and short arrays (safe to post from a worker).
 */
export function analyze(chans, fs, opts = {}) {
  const progress = opts.onProgress || (() => {});
  const l = chans[0], r = chans.length > 1 ? chans[1] : chans[0], n = l.length;
  const m = { fs, channels: chans.length, frames: n, duration: n / fs };
  if (!n) return { ...m, empty: true };

  // ---- one pass: peaks, DC, energy, correlation ----
  let pkL = 0, pkR = 0, sL = 0, sR = 0, eL = 0, eR = 0, xLR = 0, maxDiff = 0, oversL = 0, oversR = 0, pkAt = 0, pkMax = 0;
  for (let i = 0; i < n; i++) {
    const a = l[i], b = r[i], aa = Math.abs(a), ab = Math.abs(b);
    if (aa > pkL) pkL = aa; if (ab > pkR) pkR = ab;
    if (aa > pkMax || ab > pkMax) { pkMax = Math.max(aa, ab); pkAt = i; }
    if (aa > 1) oversL++; if (ab > 1) oversR++;
    sL += a; sR += b; eL += a * a; eR += b * b; xLR += a * b;
    const d = Math.abs(a - b); if (d > maxDiff) maxDiff = d;
  }
  const eMid = (eL + eR + 2 * xLR) / 4, eSide = Math.max(0, (eL + eR - 2 * xLR) / 4);
  Object.assign(m, {
    samplePeakDb: db20(pkMax), samplePeakAt: pkAt / fs, peakLDb: db20(pkL), peakRDb: db20(pkR),
    dcL: sL / n, dcR: sR / n, oversFloat: oversL + oversR,
    corr: eL > 1e-12 && eR > 1e-12 ? xLR / Math.sqrt(eL * eR) : 1,
    monoLossDb: db10(eMid) - db10((eL + eR) / 2),
    sideToMidDb: db10(eSide) - db10(eMid),
    identical: maxDiff === 0, maxDiff,
    silentL: chans.length > 1 && pkL < 1e-4 && pkR > 1e-3, silentR: chans.length > 1 && pkR < 1e-4 && pkL > 1e-3,
    silent: pkMax < 1e-4,
  });
  progress(0.08);

  // ---- loudness: integrated (master-core), short-term, range, balance ----
  m.lufs = integratedLufs(l, r, fs);
  progress(0.2);
  const hop = Math.round(0.1 * fs), kL = kBlocks(l, fs, hop), kR = chans.length > 1 ? kBlocks(r, fs, hop) : kL, nb = kL.length;
  const loud = (from, count) => { let e = 0; for (let k = from; k < from + count; k++) e += kL[k] + kR[k]; return -0.691 + 10 * Math.log10(e / (count * hop) + 1e-20); };
  const stLen = Math.min(30, nb), st = [];
  for (let k = 0; k + stLen <= nb; k++) st.push(loud(k, stLen));
  let stMax = -100, stMaxAt = 0;
  st.forEach((v, k) => { if (v > stMax) { stMax = v; stMaxAt = (k + stLen / 2) * 0.1; } });
  m.shortTermMax = st.length ? stMax : -100; m.shortTermMaxAt = stMaxAt;
  // loudness range (EBU Tech 3342): short-term values, gated, 10th to 95th percentile
  const absG = st.filter((v) => v > -70);
  if (absG.length > 1) {
    const mean = 10 * Math.log10(absG.reduce((a, v) => a + Math.pow(10, v / 10), 0) / absG.length);
    const g = absG.filter((v) => v > mean - 20).sort((a, b) => a - b);
    m.lra = g.length > 1 ? g[Math.round(0.95 * (g.length - 1))] - g[Math.round(0.1 * (g.length - 1))] : 0;
  } else m.lra = 0;
  // a line of short-term loudness per second, for the timeline
  m.timeline = [];
  for (let k = 0; k < st.length; k += 10) m.timeline.push(Math.max(-60, Math.round(st[k] * 10) / 10));
  // L vs R, over the 400 ms blocks that count toward the song's loudness
  let bL = 0, bR = 0;
  const gate = Math.max(-70, m.lufs - 10);
  for (let k = 0; k + 4 <= nb; k++) if (loud(k, 4) > gate) for (let j = k; j < k + 4; j++) { bL += kL[j]; bR += kR[j]; }
  m.balanceDb = bL > 0 && bR > 0 ? db10(bL) - db10(bR) : 0;
  progress(0.32);

  // ---- true peak, and where it goes over -1 dBTP ----
  // which seconds of the song go over -1 dBTP, and over 0
  const secOver = new Set(), secZero = new Set();
  const seconds = { add: (i, v) => { const s2 = Math.floor(i / fs); secOver.add(s2); if (v > 1) secZero.add(s2); } };
  const tl = truePeak(l, fs, 0.8913, seconds), tr = chans.length > 1 ? truePeak(r, fs, 0.8913, seconds) : tl;
  const tpBest = tl.peak >= tr.peak ? tl : tr, sorted = (set) => [...set].sort((a, b) => a - b);
  m.truePeakDb = db20(tpBest.peak); m.truePeakAt = tpBest.at / fs;
  m.tpOvers = sorted(secOver).slice(0, 40); m.tpOverCount = secOver.size;
  m.tpOverZero = sorted(secZero).slice(0, 40); m.tpOverZeroCount = secZero.size;
  progress(0.5);

  // ---- clipping: flat-topped peaks ----
  const bits = opts.float ? 0 : opts.bitDepth || 0;
  const tol = bits ? Math.max(1.5 / Math.pow(2, bits - 1), 2e-6) : 1e-5;
  const clipLists = [];
  let runs = 0, longest = 0, clipLevel = 0;
  for (const [x, pk] of chans.length > 1 ? [[l, pkL], [r, pkR]] : [[l, pkL]]) {
    if (pk < 0.5) continue; // nothing near the top
    const ev = eventList(fs, 0.05), fr = flatRuns(x, pk, tol, ev);
    clipLists.push(ev);
    if (fr.runs) { runs += fr.runs; longest = Math.max(longest, fr.longest); clipLevel = Math.max(clipLevel, pk); }
  }
  const clipEv = mergeEvents(clipLists, 0.05);
  m.clip = { runs, events: clipEv.length, longest, levelDb: runs ? db20(clipLevel) : null, times: clipEv.slice(0, 40).map((e) => e.start) };
  progress(0.56);

  // ---- mono compatibility per band, and seconds where the low end is out of phase ----
  const D = Math.max(1, Math.round(fs / 6000)), fsd = fs / D;
  const dl = decimate(l, fs, D), dr = chans.length > 1 ? decimate(r, fs, D) : dl;
  progress(0.62);
  const totalE = (eL + eR) / 2 / n;
  const bandStats = (x1, x2, stages, perSec = 0) => {
    const a = Float32Array.from(x1), b = x1 === x2 ? a : Float32Array.from(x2);
    for (const s of stages) { biquad(a, s); if (b !== a) biquad(b, s); }
    let ll = 0, rr = 0, lr = 0, wl = 0, wr = 0, wlr = 0;
    const secs = [];
    for (let i = 0; i < a.length; i++) {
      const p = a[i], q = b[i];
      ll += p * p; rr += q * q; lr += p * q;
      if (perSec) { wl += p * p; wr += q * q; wlr += p * q; if ((i + 1) % perSec === 0) { secs.push([wl, wr, wlr]); wl = wr = wlr = 0; } }
    }
    const len = Math.max(1, a.length);
    return {
      corr: ll > 1e-12 && rr > 1e-12 ? lr / Math.sqrt(ll * rr) : 1,
      monoLossDb: db10((ll + rr + 2 * lr) / 4) - db10((ll + rr) / 2),
      shareDb: db10((ll + rr) / 2 / len) - db10(totalE), secs, len,
    };
  };
  m.bands = BANDS.map((bd) => {
    const rate = bd.low ? fsd : fs, stages = [];
    if (bd.lo) stages.push(highpass(bd.lo, rate), highpass(bd.lo, rate));
    if (bd.hi) stages.push(lowpass(bd.hi, rate), lowpass(bd.hi, rate));
    const s = bd.low ? bandStats(dl, dr, stages) : bandStats(l, r, stages);
    return { name: bd.name, hz: bd.hz, corr: s.corr, monoLossDb: s.monoLossDb, shareDb: s.shareDb };
  });
  progress(0.8);
  // everything under 120 Hz together (kick, bass, sub): what cancels on a mono club system
  const lowS = bandStats(dl, dr, [highpass(20, fsd), lowpass(120, fsd), lowpass(120, fsd)], Math.round(fsd));
  const avgSec = lowS.secs.reduce((a, s) => a + s[0] + s[1], 0) / Math.max(1, lowS.secs.length);
  m.low = {
    corr: lowS.corr, monoLossDb: lowS.monoLossDb, shareDb: lowS.shareDb,
    outTimes: lowS.secs.map((s, k) => ({ k, c: s[0] > 0 && s[1] > 0 ? s[2] / Math.sqrt(s[0] * s[1]) : 1, e: s[0] + s[1] }))
      .filter((s) => s.c < -0.2 && s.e > avgSec * 0.03).map((s) => s.k),
  };
  progress(0.86);

  // ---- the start and the end ----
  const quiet = (i) => Math.max(Math.abs(l[i]), Math.abs(r[i])) < 0.001; // -60 dBFS
  let lead = 0; while (lead < n && quiet(lead)) lead++;
  let tail = 0; while (tail < n - lead && quiet(n - 1 - tail)) tail++;
  const rms = (from, to) => { from = Math.max(0, from); to = Math.min(n, to); let e = 0; for (let i = from; i < to; i++) e += (l[i] * l[i] + r[i] * r[i]) / 2; return db10(e / Math.max(1, to - from)); };
  Object.assign(m, {
    leadSec: lead / fs, tailSec: tail / fs,
    firstSampleDb: db20(Math.max(Math.abs(l[0]), Math.abs(r[0]))), lastSampleDb: db20(Math.max(Math.abs(l[n - 1]), Math.abs(r[n - 1]))),
    headRmsDb: rms(0, Math.round(0.05 * fs)),
    endRmsDb: rms(n - Math.round(0.1 * fs), n),
    endDecayDb: rms(n - Math.round(1.1 * fs), n - Math.round(1.0 * fs)) - rms(n - Math.round(0.1 * fs), n),
  });

  // ---- hidden lossy past, real bit depth ----
  m.spectrum = spectrumCliff(l, r, fs);
  progress(0.97);
  if (opts.bitDepth > 16 && !opts.float) {
    // 24-bit file holding 16-bit audio: every value lands on the 16-bit grid
    let checked = 0, offGrid = 0;
    const stride = Math.max(1, Math.floor(n / 400000));
    for (const x of chans.length > 1 ? [l, r] : [l]) for (let i = 0; i < n; i += stride) {
      const v = x[i] * 32768;
      if (v !== 0) { checked++; if (Math.abs(v - Math.round(v)) > 1e-4) { offGrid++; break; } }
    }
    m.padded16 = checked > 5000 && offGrid === 0;
  }
  progress(1);
  return m;
}

// ======================================================================
// Checks: pass / note / warn / fail, with plain-English advice
// ======================================================================

export const STATUS = { pass: "Pass", note: "Note", warn: "Warning", fail: "Fail" };
const RANK = { pass: 0, note: 1, warn: 2, fail: 3 };
export const worst = (list) => list.reduce((w, s) => (RANK[s] > RANK[w] ? s : w), "pass");

// ISRC: CC-XXX-YY-NNNNN (country, registrant, year, designation), 12 characters
export function isrcCheck(raw) {
  const code = String(raw ?? "").toUpperCase().replace(/[\s-]/g, "");
  const valid = /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(code);
  return { code, valid, pretty: valid ? `${code.slice(0, 2)}-${code.slice(2, 5)}-${code.slice(5, 7)}-${code.slice(7)}` : code };
}

// What each streaming service will do to this song
export function platformResults(lufs, truePeakDb) {
  return PLATFORMS.map((p) => {
    const gain = platformGain(p, lufs, truePeakDb);
    return { id: p.id, name: p.name, ref: p.ref, gain, plays: lufs + gain,
      text: gain < -0.05 ? `turned down ${f1(-gain)} dB` : gain > 0.05 ? `turned up ${f1(gain)} dB` : "left as is" };
  });
}

const RATE_TEXT = (hz) => `${Number((hz / 1000).toFixed(2))} kHz`;
const depthText = (info) => (info.lossy || !info.bitDepth ? "" : `${info.bitDepth}-bit${info.float ? " float" : ""}`);

function formatCheck(info, m) {
  const parts = [], fixes = [];
  let status = "pass";
  const bump = (s) => { status = worst([status, s]); };
  const fs = info.sampleRate || m.fs, bits = info.bitDepth, ch = info.channels || m.channels;
  const valueParts = [info.label];
  if (info.lossy) {
    valueParts.push(info.bitrate ? `${info.bitrate} kbps${info.vbr ? " (variable)" : ""}` : info.codec);
  } else if (bits) valueParts.push(info.float ? `${bits}-bit float` : `${bits}-bit`);
  if (fs) valueParts.push(RATE_TEXT(fs));
  valueParts.push(ch === 1 ? "mono" : ch === 2 ? "stereo" : `${ch} channels`);

  if (info.container === "unknown") {
    bump("warn");
    parts.push("Last Call couldn't recognise this file type from its header, so it can't confirm the real format.");
    fixes.push("Export the master as a WAV (24-bit or 16-bit, 44.1 or 48 kHz). Every distributor takes that.");
  } else if (info.lossy) {
    bump("fail");
    const what = info.container === "wav" ? `This WAV actually holds ${info.codec} audio (a compressed format).` : `This is a ${info.label} file, a compressed (lossy) format.`;
    parts.push(`${what} Spotify, Apple Music and the rest re-encode whatever you send, so a compressed file gets compressed twice and loses quality. Most distributors reject it outright.`);
    fixes.push(`Upload the WAV, not the ${info.container === "wav" ? "converted file" : info.label}. Export (or ask your mastering engineer for) the master as a 24-bit or 16-bit WAV or FLAC. Converting this file to WAV won't bring the quality back.`);
  } else if (info.container === "m4a" || info.container === "aiff" || info.container === "ogg") {
    bump(info.container === "aiff" ? "note" : "warn");
    parts.push(info.container === "aiff"
      ? "AIFF is full quality. Many distributors take it, but some only accept WAV or FLAC."
      : `${info.label} is full quality, but most distributors only take WAV or FLAC.`);
    fixes.push("If your distributor turns it down, export the same master as a WAV.");
  } else parts.push(`${info.label} is what distributors want.`);

  if (!info.lossy && bits) {
    if (bits === 16 || bits === 24) parts.push(`${bits}-bit is right for release${bits === 24 ? " (and the best choice when you have it)" : ""}.`);
    else if (bits === 32 || bits === 64) {
      bump("warn");
      parts.push(`It's a ${bits}-bit${info.float ? " float" : ""} file. Some distributors don't accept ${bits}-bit and ask for 16 or 24-bit.`);
      fixes.push("Export a 24-bit WAV (with dither if your software offers it).");
    } else if (bits <= 8) {
      bump("fail");
      parts.push(`${bits}-bit audio is far below release quality: it's audibly noisy.`);
      fixes.push("Export from your session again at 24-bit or 16-bit.");
    } else { bump("warn"); parts.push(`${bits}-bit is unusual. Distributors expect 16 or 24-bit.`); fixes.push("Export a 24-bit WAV."); }
  }
  if (m.padded16 && bits > 16) parts.push(`(The audio inside is really 16-bit, saved as ${bits}-bit. That's fine.)`);

  if (fs) {
    if (fs === 44100 || fs === 48000) parts.push(`${RATE_TEXT(fs)} is a standard rate.`);
    else if ([88200, 96000, 176400, 192000].includes(fs)) parts.push(`${RATE_TEXT(fs)} is high resolution. Most distributors accept it (Apple Music and Amazon list it as Hi-Res); a few only take 44.1 kHz.`);
    else if (fs < 44100) {
      bump("fail");
      parts.push(`${RATE_TEXT(fs)} is lower than CD quality: the highs are missing. Distributors need at least 44.1 kHz.`);
      fixes.push("Export from your session at 44.1 or 48 kHz. Converting this file up won't restore the missing highs.");
    } else if (fs > 192000) { bump("warn"); parts.push(`${RATE_TEXT(fs)} is higher than distributors accept.`); fixes.push("Export at 44.1, 48 or 96 kHz."); }
    else { bump("warn"); parts.push(`${RATE_TEXT(fs)} is an unusual sample rate.`); fixes.push("Export at 44.1 or 48 kHz."); }
  }
  if (ch > 2) {
    bump("warn");
    parts.push(`It has ${ch} channels. A normal release is stereo (surround and Dolby Atmos go through a separate process).`);
    fixes.push("Export a stereo mixdown for the standard release.");
  } else if (ch === 1) {
    bump("note");
    parts.push("It's a mono file. Most distributors take mono, but a few ask for stereo.");
    fixes.push("If yours asks for stereo, export the same master as a stereo file (both sides the same).");
  }
  return { id: "format", title: "File format", status, value: valueParts.join(", "), detail: parts.join(" "), fix: fixes.join(" ") };
}

function sourceCheck(info, m) {
  if (info.lossy || !m.spectrum) return null;
  const c = m.spectrum.cliffHz;
  if (c && c <= 19500) return { id: "source", title: "Hidden MP3 check", status: "warn", value: `cuts off at ${(c / 1000).toFixed(1)} kHz`,
    detail: `There's almost nothing above about ${(c / 1000).toFixed(1)} kHz, and it stops like a wall. That's the fingerprint of an MP3 or other compressed file somewhere along the way (the mix, a bounce, or a sample), even though this file is ${info.label}.`,
    fix: "If the mix or master went through an MP3 at any point, export again from the original session files. If you put a steep low-pass filter on the master on purpose, you can ignore this." };
  if (c && m.fs >= 88200) return { id: "source", title: "Hidden MP3 check", status: "note", value: `nothing above ${(c / 1000).toFixed(1)} kHz`,
    detail: `The file is ${RATE_TEXT(m.fs)}, but nothing is above about ${(c / 1000).toFixed(1)} kHz, so it was made at 44.1 or 48 kHz and converted up. No harm done, it just isn't true high resolution.`,
    fix: "Nothing to fix. If you want to list it as Hi-Res, master from a high-rate session; otherwise a 44.1 or 48 kHz file is just as good." };
  return { id: "source", title: "Hidden MP3 check", status: "pass", value: "full range",
    detail: "The highs roll off naturally, with no sign of an MP3 or other compressed file in its past.", fix: "" };
}

function loudnessCheck(m) {
  if (m.lufs <= -70) return { id: "loudness", title: "Loudness", status: "fail", value: "silent", detail: "The file is silent (or nearly).", fix: "Check you exported the right file." };
  const plats = platformResults(m.lufs, m.truePeakDb);
  const groups = new Map();
  for (const p of plats) { if (!groups.has(p.text)) groups.set(p.text, []); groups.get(p.text).push(p.name); }
  const sentence = [...groups].map(([t, names]) => `${andList(names)}: ${t}`).join(". ") + ".";
  let status = "pass", detail = `Estimated, from each service's published loudness level. ${sentence}`, fix = "";
  const spotify = plats.find((p) => p.id === "spotify"), short = spotify.ref - spotify.plays;
  detail += ` Loudest moment: ${f1(m.shortTermMax)} LUFS short-term, at ${fmtTime(m.shortTermMaxAt)}.`;
  if (m.lufs > -14.5 && spotify.gain < -3) {
    detail = `Most services will turn this down, so it won't play any louder than quieter masters. ${detail}`;
    if (m.lufs > -8) { status = "note"; fix = "Nothing has to change. Just know the extra loudness is undone on playback: if you'd like more punch, a master around -10 to -14 LUFS keeps more of it and plays at the same level."; }
  } else if (short > 2 || plats.some((p) => p.ref - p.plays > 4)) {
    const flat = plats.filter((p) => !p.gain && p.ref - p.plays > 4).map((p) => p.name);
    status = short > 6 ? "warn" : "note";
    detail = `This is a quiet master. ${short > 0.5 ? `Services that turn quiet songs up only do it as far as the peaks allow, so it will play about ${f1(short)} dB quieter than other songs on Spotify.` : "Spotify can turn it up to match other songs."}${flat.length ? ` ${andList(flat)} never turn songs up, so there it plays ${f1(Math.max(...plats.filter((p) => !p.gain).map((p) => p.ref - p.plays)))} dB quieter than other releases.` : ""} ${detail}`;
    fix = "Fine for quiet, dynamic music. If it should sit level with other releases, master it louder (around -14 LUFS) with the peaks limited to -1 dB.";
  }
  return { id: "loudness", title: "Loudness", status, value: `${f1(m.lufs)} LUFS`, detail, fix, data: { platforms: plats } };
}

function dynamicsCheck(m) {
  if (m.lufs <= -70) return null;
  const plr = m.truePeakDb - m.lufs;
  const base = `Peaks sit ${f1(plr)} dB above the average level, and the loudness range is ${f1(m.lra)} LU.`;
  if (plr < 8) return { id: "dynamics", title: "Dynamics", status: "note", value: `${f1(plr)} dB peak to loudness`,
    detail: `${base} That's very squashed (heavily limited). Streaming services turn loud songs down, so next to more dynamic songs this one can sound flatter and smaller, not louder.`,
    fix: "This is advice, not a rule: if the squashed sound is the style you want, keep it. Otherwise back the limiter off 2 to 4 dB so the drums hit harder." };
  if (m.lra > 20) return { id: "dynamics", title: "Dynamics", status: "note", value: `${f1(m.lra)} LU range`,
    detail: `${base} That's a very wide range: the quiet parts may get lost in a car or on headphones on a bus. Normal for classical, film and ambient music.`,
    fix: "If it's a pop, rock or hip-hop release, a little more compression on the quietest sections will help them carry." };
  return { id: "dynamics", title: "Dynamics", status: "pass", value: `${f1(plr)} dB peak to loudness`, detail: `${base} Healthy for most music.`, fix: "" };
}

function truePeakCheck(m) {
  const tp = m.truePeakDb, sp = m.samplePeakDb;
  const value = `${signed(tp)} dBTP`, where = timeList(m.tpOvers);
  const peaks = `The highest sample is ${signed(sp)} dBFS; between samples (where the speaker actually goes) the wave reaches ${signed(tp)} dB.`;
  if (tp > 0.05) return { id: "truepeak", title: "True peak", status: "fail", value, times: m.tpOverZero,
    detail: `${peaks} That's over full scale. When the services convert the song to their own formats, those peaks clip and can crackle${m.tpOverZero.length ? ` (in ${plural(m.tpOverZeroCount, "second")} of the song, ${timeList(m.tpOverZero)})` : ""}.`,
    fix: "Turn on true peak (or ISP) mode in your limiter, set the ceiling to -1 dB, and export again. If someone else mastered it, ask for a version with a -1 dBTP ceiling." };
  if (tp > -1) return { id: "truepeak", title: "True peak", status: "warn", value, times: m.tpOvers,
    detail: `${peaks} Above -1 dB, the MP3/AAC versions the services make can clip a little${where ? ` (in ${plural(m.tpOverCount, "second")} of the song, ${where})` : ""}. Loud masters are the most at risk.`,
    fix: "Set your limiter's ceiling to -1 dB with true peak mode on, then export again. You won't hear a loudness difference." };
  return { id: "truepeak", title: "True peak", status: "pass", value, detail: `${peaks} That leaves room for the services' encoders, so nothing will clip.`, fix: "" };
}

function clippingCheck(m, info) {
  const c = m.clip;
  if (info.float && m.oversFloat > 0) return { id: "clipping", title: "Clipping", status: "fail", value: `peaks over 0 dB`, times: m.tpOverZero,
    detail: `This is a floating-point file with samples above 0 dB (up to ${signed(m.samplePeakDb)} dB). Nothing is lost yet, but every release format (16 or 24-bit) cuts them off, which clips.`,
    fix: "Bring the master down (or put a limiter with a -1 dB ceiling last in the chain) and export again." };
  if (!c.runs) return { id: "clipping", title: "Clipping", status: "pass", value: "none found", detail: "No flattened peaks: the waveform is never squared off at the top.", fix: "" };
  const full = c.levelDb > -0.1, where = timeList(c.times);
  const count = plural(c.events, "place");
  if (full) {
    const status = c.runs >= 30 || c.longest >= 10 ? "fail" : c.runs >= 3 ? "warn" : "note";
    return { id: "clipping", title: "Clipping", status, value: `${count}`, times: c.times,
      detail: `The waveform is flattened against 0 dB in ${count} (${where}). That's clipping: it adds crunchy distortion${status === "note" ? ", though this little is unlikely to be heard" : ", and mastering or the services can't remove it"}. The longest flat spot is ${c.longest} samples.`,
      fix: "Turn the master down 1 to 2 dB before the limiter (or lower the limiter's ceiling to -1 dB) and export again. If the mix itself was clipping, fix it there and re-master." };
  }
  const status = c.runs >= 30 ? "warn" : "note";
  return { id: "clipping", title: "Clipping", status, value: `${count} at ${f1(c.levelDb)} dB`, times: c.times,
    detail: `Peaks are squared off flat at ${f1(c.levelDb)} dB in ${count} (${where}). That's a clipper or a very hard limiter, or clipped audio that was turned down afterwards.`,
    fix: "If you used a clipper on purpose and it sounds right, that's fine. Otherwise ease off the clipper or limiter, or check the mix for clipping before mastering." };
}

function monoCheck(m) {
  if (m.channels === 1 || m.identical) return { id: "mono", title: "Mono compatibility", status: "pass", value: "mono", detail: "The song is mono, so nothing can cancel out.", fix: "", data: { bands: m.bands } };
  const corr = m.corr, low = m.low, lowMatters = low.shareDb > -30;
  const value = `correlation ${corr.toFixed(2)}, ${f1(m.monoLossDb)} dB in mono`;
  const times = low.outTimes, where = timeList(times);
  const lossText = `Played in mono (phone speakers, Bluetooth speakers, club and bar systems) it ${m.monoLossDb > -1 ? "keeps its level" : `drops ${f1(-m.monoLossDb)} dB`}`;
  const bassText = lowMatters ? `, and the low end (under 120 Hz) ${low.monoLossDb > -1 ? "holds up" : `drops ${f1(-low.monoLossDb)} dB`}` : "";
  const fixBass = "Keep the kick, bass and sub centered and mono below about 120 Hz. Look for a stereo widener, chorus or 'stereo' synth patch on low instruments, or two bass mics/DI out of phase. Many mastering tools have a 'mono bass' switch.";
  // a flipped channel turns every range upside down, not just the bass
  const flipped = corr < -0.6 && m.bands.filter((b) => b.shareDb > -40 && !/bass/i.test(b.name)).every((b) => b.corr < -0.3);
  if (flipped) return { id: "mono", title: "Mono compatibility", status: "fail", value, data: { bands: m.bands },
    detail: `One side looks flipped upside down (polarity): left and right mostly cancel each other. ${lossText}${bassText}. On a phone or a mono speaker, much of the song disappears.`,
    fix: "Flip the polarity (phase) of one channel back, or check the export settings and the stereo tools on the master bus." };
  if (lowMatters && low.corr < -0.1) return { id: "mono", title: "Mono compatibility", status: "fail", value, times, data: { bands: m.bands },
    detail: `Your bass is out of phase between left and right, so it partly cancels on phone speakers and club systems (which play the low end in mono). ${lossText}${bassText}${where ? `. Worst ${where}` : ""}.`, fix: fixBass };
  if (lowMatters && low.corr < 0.5) return { id: "mono", title: "Mono compatibility", status: "warn", value, times, data: { bands: m.bands },
    detail: `The low end is spread wide in stereo, so your bass partly cancels on phone speakers and club systems. ${lossText}${bassText}${where ? `. Out of phase ${where}` : ""}.`, fix: fixBass };
  if (m.monoLossDb < -4) return { id: "mono", title: "Mono compatibility", status: "warn", value, data: { bands: m.bands },
    detail: `${lossText}${bassText}. The stereo is very wide, so parts of the song (often reverbs, doubled guitars or wide synths) get much quieter in mono.`,
    fix: "Check stereo wideners and the width setting on the master; pull them back until the mono version still sounds complete." };
  return { id: "mono", title: "Mono compatibility", status: "pass", value, data: { bands: m.bands },
    detail: `${lossText}${bassText}. Nothing important cancels out.`, fix: "" };
}

function stereoCheck(m) {
  if (m.channels === 1) return null;
  if (m.silentL || m.silentR) return { id: "stereo", title: "Stereo balance", status: "fail", value: `${m.silentL ? "left" : "right"} channel silent`,
    detail: `The ${m.silentL ? "left" : "right"} channel is silent. Listeners would hear the song in one ear only.`,
    fix: "Export again with both channels. If the song is meant to be mono, export it with the same audio on both sides (or as a mono file)." };
  if (m.identical || m.sideToMidDb < -50) return { id: "stereo", title: "Stereo balance", status: "note", value: "mono in a stereo file",
    detail: `Left and right are ${m.identical ? "identical" : "practically identical"}: this is a mono song saved as stereo. That's completely fine for release.`, fix: "" };
  const b = m.balanceDb, side = b > 0 ? "left" : "right";
  if (Math.abs(b) > 3) return { id: "stereo", title: "Stereo balance", status: "warn", value: `${f1(Math.abs(b))} dB to the ${side}`,
    detail: `The ${side} side is ${f1(Math.abs(b))} dB louder than the other, enough to feel lopsided on headphones.`,
    fix: "Check the panning of the main parts (vocal, kick, bass, snare) and any balance or stereo tools on the master bus." };
  if (Math.abs(b) > 1.5) return { id: "stereo", title: "Stereo balance", status: "note", value: `${f1(Math.abs(b))} dB to the ${side}`,
    detail: `The ${side} side is ${f1(Math.abs(b))} dB louder. Slightly lopsided, which can be on purpose.`, fix: "If it isn't on purpose, check the panning of the main parts." };
  return { id: "stereo", title: "Stereo balance", status: "pass", value: Math.abs(b) < 0.05 ? "centered" : `${f1(Math.abs(b))} dB to the ${side}`, detail: "Left and right are evenly balanced.", fix: "" };
}

function dcCheck(m) {
  const dc = Math.max(Math.abs(m.dcL), Math.abs(m.dcR)), dcDb = db20(dc);
  if (dc > 0.01) return { id: "dc", title: "DC offset", status: "warn", value: `${f1(dcDb)} dB`,
    detail: "The waveform sits off center (a DC offset). It wastes headroom and can cause clicks where the song starts, stops or is edited.",
    fix: "Put a low cut (high-pass) at 10 to 20 Hz on the master, or use your editor's 'remove DC offset', then export again." };
  if (dc > 0.003) return { id: "dc", title: "DC offset", status: "note", value: `${f1(dcDb)} dB`, detail: "There's a small DC offset (the waveform sits slightly off center). Harmless at this size.", fix: "A 10-20 Hz low cut on the master removes it." };
  return { id: "dc", title: "DC offset", status: "pass", value: "none", detail: "The waveform is centered.", fix: "" };
}

function startCheck(m, segueIn) {
  const lead = m.leadSec, click = m.firstSampleDb > -34;
  if (lead > 2) return { id: "start", title: "Start", status: "warn", value: `${f1(lead)} s of silence`, times: [0],
    detail: `The song starts with ${f1(lead)} seconds of silence. Listeners hear nothing at first, and on playlists many will skip.`,
    fix: "Trim the start to a fraction of a second (keep a count-in or intro noise if it's part of the song)." };
  if (click && !segueIn) return { id: "start", title: "Start", status: "warn", value: "starts with a click", times: [0],
    detail: `The very first sample is already at ${f1(m.firstSampleDb)} dB, so the song jumps straight from silence to sound with a click or pop.`,
    fix: "Add a tiny fade-in (5 to 10 ms) at the very start. You won't hear the fade, just the click going away." };
  if (lead > 0.5) return { id: "start", title: "Start", status: "note", value: `${f1(lead)} s of silence`,
    detail: `There's ${f1(lead)} seconds of silence before the song starts. Fine if that's on purpose.`, fix: "Trim it to under half a second if you want the song to start right away." };
  return { id: "start", title: "Start", status: "pass", value: lead < 0.05 ? "starts right away" : `${f1(lead)} s lead-in`,
    detail: segueIn && click ? "Starts mid-sound, carrying on from the previous track (a segue). That's fine as long as the album plays gapless." : "Starts cleanly, without a click.", fix: "" };
}

function endCheck(m, segueOut) {
  const tail = m.tailSec, cut = m.endRmsDb > -40 && m.endDecayDb < 10, click = m.lastSampleDb > -34, end = [m.duration];
  if (tail > 10) return { id: "end", title: "End", status: "warn", value: `${f1(tail)} s of silence`, times: end,
    detail: `The file ends with ${f1(tail)} seconds of silence. On playlists and in shuffle, listeners sit through it before the next song.`,
    fix: "Trim the silence to a second or two. (A hidden track after a long silence is better released as its own track.)" };
  if ((cut || click) && !segueOut) return { id: "end", title: "End", status: "warn", value: cut ? "cut off" : "ends with a click", times: end,
    detail: cut ? `The sound is still going (at ${f1(m.endRmsDb)} dB) when the file stops, so the last note or the reverb tail gets chopped off${click ? ", with a click" : ""}.`
      : `The very last sample is at ${f1(m.lastSampleDb)} dB, so playback stops with a click or pop.`,
    fix: cut ? "Export a little longer so the last note and reverb ring out, then add a short fade at the very end. If the sudden stop is on purpose, ignore this." : "Add a short fade-out (10 to 50 ms) at the very end." };
  if (tail > 4) return { id: "end", title: "End", status: "note", value: `${f1(tail)} s of silence`,
    detail: `There's ${f1(tail)} seconds of silence after the song. A little is fine; this much delays the next song.`, fix: "Trim it to a second or two unless it's on purpose." };
  return { id: "end", title: "End", status: "pass", value: tail < 0.05 ? "ends on sound" : `${f1(tail)} s after the last sound`,
    detail: segueOut && (cut || click) ? "Ends mid-sound, running straight into the next track (a segue). That's fine as long as the album plays gapless." : "Ends cleanly: the sound fades or rings out before the file stops.", fix: "" };
}

function tagsCheck(info) {
  const t = info.tags, have = (k) => t[k] !== undefined && String(t[k]).trim() !== "";
  const found = [];
  if (have("title")) found.push(`title "${t.title}"`);
  if (have("artist")) found.push(`artist "${t.artist}"`);
  if (have("album")) found.push(`album "${t.album}"`);
  const explicit = t.explicit === true ? "marked explicit" : t.explicit === false ? "marked clean" : "";
  if (!found.length && !have("isrc") && !explicit) return { id: "tags", title: "Tags", status: "note", value: "none",
    detail: "The file has no tags. That's normal: distributors take the title, artist, ISRC and explicit flag in their upload form, not from the file.",
    fix: "Nothing to fix for the release. Tags only help when you send the file to people directly." };
  let status = "pass", fix = "", isrcText = "";
  if (have("isrc")) {
    const c = isrcCheck(t.isrc);
    if (c.valid) isrcText = ` ISRC ${c.pretty} is correctly formatted.`;
    else { status = "warn"; isrcText = ` The ISRC "${t.isrc}" isn't valid: an ISRC is 12 characters, like US-AB1-26-00001 (country, registrant, year, number).`; fix = "Check the ISRC with whoever issued it (your distributor or national ISRC agency) and type the same code in the upload form."; }
  }
  const missing = ["title", "artist"].filter((k) => !have(k));
  if (missing.length && status === "pass") { status = "note"; fix = "Distributors use their upload form, so this only matters when you share the file directly."; }
  return { id: "tags", title: "Tags", status, value: [have("title") ? "title" : "", have("artist") ? "artist" : "", have("isrc") ? "ISRC" : "", explicit ? (t.explicit ? "explicit" : "clean") : ""].filter(Boolean).join(", ") || "partial",
    detail: `Found ${found.length ? andList(found) : "no title or artist"}${explicit ? `, ${explicit}` : ""}.${isrcText}${missing.length ? ` No ${andList(missing)} tag.` : ""} Distributors take the metadata from their upload form, so make sure it matches.`, fix };
}

/**
 * All checks for one track. info: readFileInfo(); m: analyze().
 * opts: { segueIn, segueOut } when the track runs straight into its neighbour on an album.
 */
export function buildChecks(m, info, opts = {}) {
  if (m.empty || m.silent) return [{ id: "audio", title: "Audio", status: "fail", value: "silent", detail: "There's no audio in this file (it's silent).", fix: "Check that you exported the right file and that the master bus wasn't muted." }];
  return [
    formatCheck(info, m), sourceCheck(info, m), loudnessCheck(m), dynamicsCheck(m), truePeakCheck(m), clippingCheck(m, info),
    monoCheck(m), stereoCheck(m), dcCheck(m), startCheck(m, opts.segueIn), endCheck(m, opts.segueOut), tagsCheck(info),
  ].filter(Boolean);
}

/** Cover art: img = imageInfo(bytes) (or null for no cover) */
export function coverCheck(img, source = "") {
  if (!img) return { id: "cover", title: "Cover art", status: "note", value: "not checked",
    detail: "No cover art was found in the file or added here.", fix: "Drop your cover image here to check it (distributors want a square JPG or PNG, 3000 x 3000 pixels)." };
  const parts = [], fixes = [], st = [];
  const kind = { jpeg: "JPG", png: "PNG", gif: "GIF", bmp: "BMP", webp: "WebP", tiff: "TIFF", heic: "HEIC", avif: "AVIF" }[img.type] || "unknown type";
  const mb = img.size / 1048576;
  const value = [img.width ? `${img.width} x ${img.height}` : "", kind, img.color, mb >= 0.1 ? `${mb.toFixed(1)} MB` : `${Math.round(img.size / 1024)} KB`].filter(Boolean).join(", ");
  if (img.type !== "jpeg" && img.type !== "png") { st.push("fail"); parts.push(`It's a ${kind} file. Distributors take JPG or PNG.`); fixes.push("Save the cover as a JPG (high quality) or PNG."); }
  if (img.width && img.height) {
    const ratio = img.width / img.height;
    if (Math.abs(ratio - 1) > 0.01) { st.push("fail"); parts.push(`It isn't square (${img.width} x ${img.height}). Stores only take square covers.`); fixes.push("Crop it to a square."); }
    else if (img.width !== img.height) { st.push("warn"); parts.push(`It's almost square (${img.width} x ${img.height}); some stores insist on exactly square.`); fixes.push("Crop it to exactly square."); }
    const side = Math.min(img.width, img.height);
    if (side < 1400) { st.push("fail"); parts.push(`At ${side} pixels it's too small: stores need at least 1400 x 1400, and most distributors ask for 3000 x 3000.`); fixes.push("Export the artwork at 3000 x 3000 from the original design file (scaling a small image up looks blurry and can be rejected)."); }
    else if (side < 3000) { st.push("warn"); parts.push(`${side} pixels works on some stores, but most distributors (and Apple Music) ask for 3000 x 3000.`); fixes.push("Export the artwork at 3000 x 3000 if you can."); }
    else parts.push(`${img.width} x ${img.height} is big enough for every store.`);
  } else if (img.type === "jpeg" || img.type === "png") { st.push("warn"); parts.push("Couldn't read the image size."); }
  if (img.color === "CMYK") { st.push("fail"); parts.push("It's in CMYK (print colors). Stores need RGB, and CMYK images can show wrong colors or be rejected."); fixes.push("Convert it to RGB (sRGB) in your image editor and save again."); }
  else if (img.color === "Grayscale") { st.push("note"); parts.push("It's a grayscale image. Most stores accept that, but a few want RGB."); fixes.push("If your distributor rejects it, save it as RGB (it will still look black and white)."); }
  if (img.alpha) { st.push("note"); parts.push("It has transparent areas, which stores show as black or white."); fixes.push("Flatten it onto a solid background."); }
  if (mb > 10) { st.push("warn"); parts.push(`At ${mb.toFixed(1)} MB it's larger than some distributors accept (often 10 MB or less).`); fixes.push("Save as a high-quality JPG (quality 90 or so): it will look the same and be much smaller."); }
  if (!st.length || worst(st) === "pass") parts.push("Format and color are fine.");
  return { id: "cover", title: "Cover art", status: worst(st), value: value + (source ? ` (${source})` : ""), detail: parts.join(" "), fix: fixes.join(" ") };
}

// Does track a run straight into track b (no gap, sound at both edges)?
export function isSegue(a, b) {
  // both edges are mid-sound: a track that fades in from zero, however fast, isn't a segue
  return a.tailSec < 0.05 && a.endRmsDb > -40 && a.lastSampleDb > -50 && b.leadSec < 0.05 && b.headRmsDb > -40 && b.firstSampleDb > -50;
}

/**
 * Checks across an album. tracks: [{ name, info, m }] in running order (measured ones only).
 * Returns { checks, gaps: [{ from, to, gap, segue }] }.
 */
export function albumChecks(tracks) {
  const checks = [], ok = tracks.filter((t) => t.m && !t.m.empty && !t.m.silent && t.m.lufs > -70);
  if (ok.length < 2) return { checks, gaps: [] };
  // loudness between tracks: against the median track
  const louds = ok.map((t) => t.m.lufs), med = [...louds].sort((a, b) => a - b)[Math.floor(louds.length / 2)];
  const off = ok.map((t) => ({ name: t.name, d: t.m.lufs - med })).filter((x) => Math.abs(x.d) >= 2.5).sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
  const spread = Math.max(...louds) - Math.min(...louds);
  if (off.length) {
    const big = off.some((x) => Math.abs(x.d) >= 4);
    checks.push({ id: "album-loudness", title: "Loudness between tracks", status: big ? "warn" : "note", value: `${f1(spread)} LU spread`,
      detail: `Most tracks sit around ${f1(med)} LUFS. ${off.map((x) => `"${x.name}" is ${f1(Math.abs(x.d))} dB ${x.d > 0 ? "louder" : "quieter"}`).join("; ")}. In album playback the services keep these differences${big ? ", so the jump will be obvious" : ""}.`,
      fix: big ? "If it isn't a deliberate quiet song or interlude, master that track closer to the others (within 2 or 3 dB)." : "Fine for a ballad or an interlude. Otherwise bring it a little closer to the rest." });
  } else checks.push({ id: "album-loudness", title: "Loudness between tracks", status: "pass", value: `${f1(spread)} LU spread`,
    detail: `Every track sits within ${f1(Math.max(...ok.map((t) => Math.abs(t.m.lufs - med))))} dB of ${f1(med)} LUFS, so the album plays at an even level.`, fix: "" });
  // the same format throughout
  const rates = [...new Set(ok.map((t) => t.info.sampleRate || t.m.fs))], depths = [...new Set(ok.map((t) => depthText(t.info)))];
  if (rates.length > 1 || depths.length > 1) checks.push({ id: "album-format", title: "Same format on every track", status: "warn",
    value: [rates.length > 1 ? `${rates.length} sample rates` : "", depths.length > 1 ? `${depths.length} bit depths` : ""].filter(Boolean).join(", "),
    detail: `The tracks don't all match: ${andList(ok.map((t) => `"${t.name}" ${RATE_TEXT(t.info.sampleRate || t.m.fs)}${depthText(t.info) ? `/${depthText(t.info)}` : ""}`))}. Distributors usually accept a mix, but it often means some tracks came from an older export.`,
    fix: "Export every track from the final masters with the same settings (for example 24-bit, 44.1 kHz)." });
  else checks.push({ id: "album-format", title: "Same format on every track", status: "pass", value: `${RATE_TEXT(rates[0])}${depths[0] ? `, ${depths[0]}` : ""}`, detail: "Every track has the same sample rate and bit depth.", fix: "" });
  // lengths, and how stores will list it
  const total = ok.reduce((a, t) => a + t.m.duration, 0), shorties = ok.filter((t) => t.m.duration < 30);
  const longest = Math.max(...ok.map((t) => t.m.duration));
  const kind = ok.length <= 3 && longest < 600 ? "a single" : ok.length <= 6 && total < 1800 ? "an EP" : "an album";
  checks.push({ id: "album-length", title: "Track lengths", status: shorties.length ? "note" : "pass", value: `${ok.length} tracks, ${fmtTime(total)}`,
    detail: `${ok.length} tracks, ${fmtTime(total)} in total. Spotify and Apple Music usually list that as ${kind}.${shorties.length ? ` ${andList(shorties.map((t) => `"${t.name}" (${fmtLength(t.m.duration)})`))} ${shorties.length > 1 ? "are" : "is"} under 30 seconds: plays that short don't count as streams for royalties on Spotify.` : ""}`,
    fix: shorties.length ? "Fine for intros and interludes; just don't count on them earning streams." : "" });
  // gaps between tracks
  const gaps = [];
  for (let i = 0; i + 1 < ok.length; i++) {
    const a = ok[i].m, b = ok[i + 1].m;
    gaps.push({ from: ok[i].name, to: ok[i + 1].name, gap: a.tailSec + b.leadSec, segue: isSegue(a, b) });
  }
  const long = gaps.filter((g) => g.gap > 4), segues = gaps.filter((g) => g.segue);
  checks.push({ id: "album-gaps", title: "Gaps between tracks", status: long.length ? "note" : "pass",
    value: `${f1(Math.min(...gaps.map((g) => g.gap)))} to ${f1(Math.max(...gaps.map((g) => g.gap)))} s`,
    detail: [long.length ? `${andList(long.map((g) => `"${g.from}" to "${g.to}" (${f1(g.gap)} s)`))} ${long.length > 1 ? "have" : "has"} a long silence between ${long.length > 1 ? "them" : "the two"}.` : "The silences between tracks are a natural length.",
      segues.length ? `${andList(segues.map((g) => `"${g.from}" runs straight into "${g.to}"`))}: tell your distributor the album is gapless so the services don't add a pause or a crossfade.` : ""].filter(Boolean).join(" "),
    fix: long.length ? "Trim the silence at the end of one track or the start of the next, unless the pause is part of the album." : "" });
  return { checks, gaps };
}

/** Overall verdict from every check */
export function verdict(checks) {
  const n = (s) => checks.filter((c) => c.status === s).length;
  const counts = { fail: n("fail"), warn: n("warn"), note: n("note"), pass: n("pass") };
  const key = counts.fail ? "fix" : counts.warn ? "notes" : "ready";
  const label = { fix: "Fix before releasing", notes: "Ready, with notes", ready: "Ready to release" }[key];
  const bits = [counts.fail ? plural(counts.fail, "problem") + " to fix" : "", counts.warn ? plural(counts.warn, "warning") : "", counts.note ? plural(counts.note, "note") : ""].filter(Boolean);
  const summary = key === "ready" ? (counts.note ? `Everything checks out (${plural(counts.note, "note")} worth reading).` : "Everything checks out.") : bits.join(", ") + ".";
  return { key, label, summary, counts };
}

/** The whole report as plain text (Copy report) */
export function reportText({ tracks, album = [], cover = null, when = new Date() }) {
  const all = [...album, ...(cover ? [cover] : []), ...tracks.flatMap((t) => t.checks)];
  const v = verdict(all), out = [];
  const line = (c, ind = "  ") => {
    out.push(`${ind}[${STATUS[c.status].toUpperCase()}] ${c.title}: ${c.value}`);
    if (c.detail) out.push(`${ind}    ${c.detail}`);
    if (c.fix && c.status !== "pass") out.push(`${ind}    How to fix: ${c.fix}`);
  };
  out.push("Encore: Last Call, release check", `Checked ${when.toLocaleString()}`, "", `Verdict: ${v.label}. ${v.summary}`, "");
  if (album.length) { out.push("Album"); album.forEach((c) => line(c)); out.push(""); }
  if (cover) { out.push("Cover art"); line(cover); out.push(""); }
  tracks.forEach((t, i) => {
    out.push(`${tracks.length > 1 ? `${i + 1}. ` : ""}${t.name}${t.m?.duration ? ` (${fmtLength(t.m.duration)})` : ""}`);
    t.checks.forEach((c) => line(c));
    out.push("");
  });
  out.push("Measured on your own device with Encore Music Studio. Streaming figures are estimates: services change their settings from time to time.");
  return out.join("\n");
}
