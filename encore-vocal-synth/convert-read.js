// ENCORE. Convert: the file types browsers can't open, read here instead, so
// Convert works the same in every browser (and in Node for test-convert.mjs).
//   decodeCaf     Core Audio Format: PCM, mu-law, A-law; AAC inside comes out
//                 as ADTS for the browser, ALAC goes to convert-alac.js
//   decodeAu      Sun/NeXT .au and .snd
//   decodeW64     Sony Wave64 (a WAV with 64-bit sizes)
//   decodeDsd     DSD from SACD rips and hi-res stores (.dsf, .dff), filtered
//                 down to 88.2 kHz (or 176.4 kHz from DSD256 and up) PCM
//   decodeWavCodec  the old WAV codecs: mu-law, A-law, IMA and Microsoft ADPCM
//                 (dictaphones, answering machines, early field recorders)
// Each returns { chans, fs, bitDepth, float, label } or null if the bytes
// aren't that kind of file; a file we know but can't read throws a message.

const str = (u8, o, n) => String.fromCharCode(...u8.subarray(o, o + n));
const be16 = (u8, o) => (u8[o] << 8) | u8[o + 1];
const be32 = (u8, o) => ((u8[o] << 24) | (u8[o + 1] << 16) | (u8[o + 2] << 8) | u8[o + 3]) >>> 0;
const be64 = (u8, o) => be32(u8, o) * 4294967296 + be32(u8, o + 4);
const le16 = (u8, o) => u8[o] | (u8[o + 1] << 8);
const le32 = (u8, o) => (u8[o] | (u8[o + 1] << 8) | (u8[o + 2] << 16) | (u8[o + 3] << 24)) >>> 0;
const le64 = (u8, o) => le32(u8, o) + le32(u8, o + 4) * 4294967296;
const asU8 = (b) => (b instanceof Uint8Array ? b : new Uint8Array(b));

// ---------- G.711 ----------
function ulaw(v) {
  v = ~v & 0xff;
  const t = (((v & 0x0f) << 3) + 0x84) << ((v & 0x70) >> 4);
  return (v & 0x80 ? 0x84 - t : t - 0x84) / 32768;
}
function alaw(v) {
  v ^= 0x55;
  let t = (v & 0x0f) << 4;
  const seg = (v & 0x70) >> 4;
  t = seg === 0 ? t + 8 : seg === 1 ? t + 0x108 : (t + 0x108) << (seg - 1);
  return (v & 0x80 ? t : -t) / 32768;
}
const ULAW = Float32Array.from({ length: 256 }, (_, i) => ulaw(i)), ALAW = Float32Array.from({ length: 256 }, (_, i) => alaw(i));

/**
 * Interleaved samples to channels. fmt: 'int' | 'float' | 'ulaw' | 'alaw' | 'u8' (unsigned 8-bit)
 */
function pcmToChans(u8, off, len, ch, bits, fmt, little) {
  const bps = bits / 8, frames = Math.floor(len / (ch * bps));
  const dv = new DataView(u8.buffer, u8.byteOffset + off, frames * ch * bps);
  const chans = Array.from({ length: ch }, () => new Float32Array(frames));
  for (let i = 0, o = 0; i < frames; i++) {
    for (let c = 0; c < ch; c++, o += bps) {
      let v;
      if (fmt === "float") v = bps === 8 ? dv.getFloat64(o, little) : dv.getFloat32(o, little);
      else if (fmt === "ulaw") v = ULAW[dv.getUint8(o)];
      else if (fmt === "alaw") v = ALAW[dv.getUint8(o)];
      else if (bps === 1) v = fmt === "u8" ? (dv.getUint8(o) - 128) / 128 : dv.getInt8(o) / 128;
      else if (bps === 2) v = dv.getInt16(o, little) / 32768;
      else if (bps === 3) {
        const b0 = dv.getUint8(o), b1 = dv.getUint8(o + 1), b2 = dv.getUint8(o + 2);
        v = (little ? (b2 << 24) | (b1 << 16) | (b0 << 8) : (b0 << 24) | (b1 << 16) | (b2 << 8)) / 2147483648;
      } else v = dv.getInt32(o, little) / 2147483648;
      chans[c][i] = v;
    }
  }
  return chans;
}

// ---------- WAV codecs: G.711 and ADPCM ----------
const IMA_STEP = [7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45, 50, 55, 60, 66, 73, 80, 88, 97, 107, 118, 130, 143,
  157, 173, 190, 209, 230, 253, 279, 307, 337, 371, 408, 449, 494, 544, 598, 658, 724, 796, 876, 963, 1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066,
  2272, 2499, 2749, 3024, 3327, 3660, 4026, 4428, 4871, 5358, 5894, 6484, 7132, 7845, 8630, 9493, 10442, 11487, 12635, 13899, 15289, 16818, 18500,
  20350, 22385, 24623, 27086, 29794, 32767];
const IMA_IDX = [-1, -1, -1, -1, 2, 4, 6, 8];
const clamp16 = (v) => (v > 32767 ? 32767 : v < -32768 ? -32768 : v);
function imaNibble(s, n) {
  const step = IMA_STEP[s.i];
  let d = step >> 3;
  if (n & 1) d += step >> 2;
  if (n & 2) d += step >> 1;
  if (n & 4) d += step;
  s.p = clamp16(n & 8 ? s.p - d : s.p + d);
  s.i = Math.max(0, Math.min(88, s.i + IMA_IDX[n & 7]));
  return s.p;
}
// IMA (DVI) ADPCM, WAV format 0x11: per block a 4-byte header per channel, then
// 4-byte groups of 8 nibbles per channel in turn
function decodeImaWav(u8, off, len, ch, block) {
  const per = (block - 4 * ch) * 8 / (4 * ch) + 1, nb = Math.floor(len / block), rest = len - nb * block;
  const total = nb * per + (rest > 4 * ch ? Math.floor((rest - 4 * ch) * 2 / ch) + 1 : 0);
  const chans = Array.from({ length: ch }, () => new Float32Array(total));
  let n = 0;
  for (let b = off; b + 4 * ch <= off + len; b += block) {
    const end = Math.min(b + block, off + len), st = [];
    for (let c = 0; c < ch; c++) {
      const p = b + 4 * c, s = { p: (le16(u8, p) << 16) >> 16, i: Math.min(88, u8[p + 2]) };
      st.push(s);
      chans[c][n] = s.p / 32768;
    }
    let k = 1;
    for (let p = b + 4 * ch; p + 4 * ch <= end; p += 4 * ch, k += 8) {
      for (let c = 0; c < ch; c++) {
        for (let j = 0; j < 4; j++) {
          const byte = u8[p + 4 * c + j];
          if (n + k + 2 * j < total) chans[c][n + k + 2 * j] = imaNibble(st[c], byte & 15) / 32768;
          if (n + k + 2 * j + 1 < total) chans[c][n + k + 2 * j + 1] = imaNibble(st[c], byte >> 4) / 32768;
        }
      }
    }
    n += k;
  }
  return chans.map((x) => x.subarray(0, Math.min(n, total)));
}
// Microsoft ADPCM, WAV format 2
const MS_ADAPT = [230, 230, 230, 230, 307, 409, 512, 614, 768, 614, 512, 409, 307, 230, 230, 230];
const MS_COEF = [[256, 0], [512, -256], [0, 0], [192, 64], [240, 0], [460, -208], [392, -232]];
function decodeMsAdpcm(u8, off, len, ch, block, coefs = MS_COEF) {
  const per = (block - 7 * ch) * 2 / ch + 2, nb = Math.ceil(len / block);
  const chans = Array.from({ length: ch }, () => new Float32Array(nb * per));
  let n = 0;
  for (let b = off; b + 7 * ch <= off + len; b += block) {
    const end = Math.min(b + block, off + len), st = [];
    let p = b;
    for (let c = 0; c < ch; c++) st.push({ c: coefs[Math.min(u8[p++], coefs.length - 1)] });
    for (let c = 0; c < ch; c++, p += 2) st[c].d = (le16(u8, p) << 16) >> 16;
    for (let c = 0; c < ch; c++, p += 2) st[c].s1 = (le16(u8, p) << 16) >> 16;
    for (let c = 0; c < ch; c++, p += 2) st[c].s2 = (le16(u8, p) << 16) >> 16;
    for (let c = 0; c < ch; c++) { chans[c][n] = st[c].s2 / 32768; chans[c][n + 1] = st[c].s1 / 32768; }
    let k = 2, c = 0;
    const one = (s, nib) => {
      const signed = nib & 8 ? nib - 16 : nib;
      const pred = clamp16(((s.s1 * s.c[0] + s.s2 * s.c[1]) >> 8) + signed * s.d);
      s.s2 = s.s1; s.s1 = pred;
      s.d = Math.max(16, (MS_ADAPT[nib] * s.d) >> 8);
      return pred / 32768;
    };
    for (; p < end; p++) {
      for (const nib of [u8[p] >> 4, u8[p] & 15]) {
        chans[c][n + k] = one(st[c], nib);
        if (++c === ch) { c = 0; k++; }
      }
    }
    n += k;
  }
  return chans.map((x) => x.subarray(0, n));
}
/**
 * The WAV codecs browsers don't all read. info: readFileInfo's result for the WAV.
 */
export function decodeWavCodec(bytes, info) {
  const u8 = asU8(bytes), w = info.wav, ch = info.channels || 1;
  if (!w || w.dataOffset === undefined) return null;
  const len = Math.min(w.dataLength, u8.length - w.dataOffset);
  const out = (chans, label) => ({ chans, fs: info.sampleRate, bitDepth: 16, float: false, label });
  if (w.code === 7) return out(pcmToChans(u8, w.dataOffset, len, ch, 8, "ulaw"), "mu-law WAV");
  if (w.code === 6) return out(pcmToChans(u8, w.dataOffset, len, ch, 8, "alaw"), "A-law WAV");
  if (w.code === 0x11 && info.bitDepth === 4) return out(decodeImaWav(u8, w.dataOffset, len, ch, w.blockAlign), "IMA ADPCM WAV");
  if (w.code === 2 && info.bitDepth === 4) return out(decodeMsAdpcm(u8, w.dataOffset, len, ch, w.blockAlign), "Microsoft ADPCM WAV");
  return null;
}
// ---------- Sun / NeXT .au ----------
export function decodeAu(bytes) {
  const u8 = asU8(bytes);
  if (str(u8, 0, 4) !== ".snd") return null;
  const off = be32(u8, 4), size = be32(u8, 8), code = be32(u8, 12), fs = be32(u8, 16), ch = be32(u8, 20) || 1;
  const len = size === 0xffffffff || off + size > u8.length ? u8.length - off : size;
  const kind = { 1: [8, "ulaw"], 2: [8, "int"], 3: [16, "int"], 4: [24, "int"], 5: [32, "int"], 6: [32, "float"], 7: [64, "float"], 27: [8, "alaw"] }[code];
  if (!kind) throw new Error(`This .au file uses encoding ${code}, which Convert can't read.`);
  return { chans: pcmToChans(u8, off, len, ch, kind[0], kind[1], false), fs, bitDepth: kind[1] === "ulaw" || kind[1] === "alaw" ? 16 : kind[0], float: kind[1] === "float", label: "AU" };
}

// ---------- Sony Wave64 ----------
// chunk ids are GUIDs; the first 4 bytes spell the familiar names
const W64_RIFF = "72696666-2e91-cf11-a5d6-28db04c10000", W64_WAVE = "77617665-f3ac-d311-8cd1-00c04f8edb8a";
const guid = (u8, o) => Array.from(u8.subarray(o, o + 16), (b) => b.toString(16).padStart(2, "0")).join("").replace(/^(.{8})(.{4})(.{4})(.{4})/, "$1-$2-$3-$4-");
export function decodeW64(bytes) {
  const u8 = asU8(bytes);
  if (u8.length < 40 || guid(u8, 0) !== W64_RIFF || guid(u8, 24) !== W64_WAVE) return null;
  let fmt = null, data = null;
  for (let p = 40; p + 24 <= u8.length;) {
    const id = str(u8, p, 4), size = le64(u8, p + 16);
    if (size < 24) break;
    if (id === "fmt ") fmt = { code: le16(u8, p + 24), ch: le16(u8, p + 26), fs: le32(u8, p + 28), bits: le16(u8, p + 38), ext: le16(u8, p + 24) === 0xfffe ? le16(u8, p + 48) : 0 };
    else if (id === "data") data = { off: p + 24, len: Math.min(size - 24, u8.length - p - 24) };
    p += Math.ceil(size / 8) * 8;
  }
  if (!fmt || !data) throw new Error("This Wave64 file is missing its format or audio.");
  const code = fmt.code === 0xfffe ? fmt.ext : fmt.code;
  const kind = code === 3 ? "float" : code === 1 ? (fmt.bits === 8 ? "u8" : "int") : code === 7 ? "ulaw" : code === 6 ? "alaw" : null;
  if (!kind) throw new Error(`This Wave64 file uses format 0x${code.toString(16)}, which Convert can't read.`);
  return { chans: pcmToChans(u8, data.off, data.len, fmt.ch, fmt.bits, kind, true), fs: fmt.fs, bitDepth: fmt.bits, float: kind === "float", label: "Wave64" };
}

// ---------- Core Audio Format ----------
const AAC_RATES = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];
// the MPEG-4 descriptor walk inside a kuki/esds to find the AudioSpecificConfig
function findAsc(b) {
  for (let p = 0; p < b.length - 2; p++) {
    if (b[p] !== 0x05) continue;
    let q = p + 1, len = 0, k = 0;
    do { len = (len << 7) | (b[q] & 0x7f); } while (b[q++] & 0x80 && ++k < 4);
    if (len >= 2 && len <= 64 && q + len <= b.length) {
      const obj = b[q] >> 3, idx = ((b[q] & 7) << 1) | (b[q + 1] >> 7);
      if (obj >= 1 && obj <= 4 && idx < 13) return b.subarray(q, q + len);
    }
  }
  return null;
}
// CAF packet table sizes (variable-length integers)
function paktSizes(u8, off, count) {
  const sizes = new Array(count);
  let p = off;
  for (let i = 0; i < count; i++) {
    let v = 0;
    do { v = v * 128 + (u8[p] & 0x7f); } while (u8[p++] & 0x80);
    sizes[i] = v;
  }
  return sizes;
}
/**
 * Core Audio Format. decodeAlac: convert-alac.js's decoder (it reads CAF ALAC itself).
 * AAC inside CAF comes back as { adts } for the browser's decoder.
 */
export function decodeCaf(bytes, decodeAlac = null) {
  const u8 = asU8(bytes);
  if (str(u8, 0, 4) !== "caff") return null;
  let desc = null, data = null, kuki = null, pakt = null;
  for (let p = 8; p + 12 <= u8.length;) {
    const id = str(u8, p, 4);
    let size = be64(u8, p + 4);
    if (id === "data" && (size === 2 ** 64 - 1 || size > 2 ** 53 || p + 12 + size > u8.length)) size = u8.length - p - 12; // -1: runs to the end
    const a = p + 12;
    if (id === "desc") {
      const fs = new DataView(u8.buffer, u8.byteOffset + a, 8).getFloat64(0, false);
      desc = { fs, format: str(u8, a + 8, 4), flags: be32(u8, a + 12), bytesPerPacket: be32(u8, a + 16), framesPerPacket: be32(u8, a + 20), ch: be32(u8, a + 24), bits: be32(u8, a + 28) };
    } else if (id === "data") data = { off: a + 4, len: size - 4 };
    else if (id === "kuki") kuki = u8.subarray(a, a + size);
    else if (id === "pakt") pakt = { packets: be64(u8, a), frames: be64(u8, a + 8), priming: be32(u8, a + 16), remainder: be32(u8, a + 20), off: a + 24 };
    p = a + size;
  }
  if (!desc || !data) throw new Error("This CAF file is missing its format or audio.");
  const { format, flags, ch, bits } = desc, fs = Math.round(desc.fs);
  if (format === "lpcm") {
    const float = (flags & 1) !== 0, little = (flags & 2) !== 0;
    return { chans: pcmToChans(u8, data.off, data.len, ch, bits, float ? "float" : "int", little), fs, bitDepth: bits, float, label: "CAF" };
  }
  if (format === "ulaw" || format === "alaw") return { chans: pcmToChans(u8, data.off, data.len, ch, 8, format), fs, bitDepth: 16, float: false, label: "CAF" };
  if (format === "alac") {
    const d = decodeAlac ? decodeAlac(u8) : null;
    if (!d) throw new Error("Convert couldn't read the Apple Lossless audio in this CAF file.");
    return { ...d, label: "Apple Lossless (CAF)" };
  }
  if (format === "aac ") {
    // rewrap the packets as ADTS frames, which every browser decodes
    const asc = kuki && findAsc(kuki);
    if (!asc || !pakt) throw new Error("This CAF file's AAC audio is missing its setup.");
    const obj = asc[0] >> 3, idx = ((asc[0] & 7) << 1) | (asc[1] >> 7), chc = (asc[1] >> 3) & 15;
    const sizes = paktSizes(u8, pakt.off, pakt.packets), out = new Uint8Array(data.len + 7 * sizes.length);
    let src = data.off, o = 0;
    for (const n of sizes) {
      const fl = n + 7;
      out.set([0xff, 0xf1, ((obj - 1) << 6) | (idx << 2) | (chc >> 2), ((chc & 3) << 6) | (fl >> 11), (fl >> 3) & 0xff, ((fl & 7) << 5) | 0x1f, 0xfc], o);
      out.set(u8.subarray(src, src + n), o + 7);
      src += n; o += fl;
    }
    return { adts: out.subarray(0, o), fs: AAC_RATES[idx] || fs, priming: pakt.priming, frames: pakt.frames, label: "AAC (CAF)" };
  }
  throw new Error(`This CAF file holds '${format.trim()}' audio, which Convert can't read.`);
}

// ---------- DSD (.dsf, .dff) ----------
// One bit at 2.8 MHz (DSD64) and up. A long low-pass filter, run a byte at a
// time from lookup tables, takes it down to 88.2 kHz (176.4 kHz from DSD256),
// keeping everything up to 30 kHz and leaving out DSD's ultrasonic noise.
// A DSD bit is +1 or -1, so a full-scale (0 dB SACD) signal comes out near
// -6 dBFS, the usual way, with room for the hottest SACD masters.
const DSD_CUTOFF = 30000;
function dsdFilter(fsIn, decim) {
  // windowed sinc, 128 taps per output step's worth of input (enough for ~100 dB of stopband)
  const taps = Math.ceil(decim * 32 / 8) * 8, h = new Float64Array(taps), fc = DSD_CUTOFF / fsIn, mid = (taps - 1) / 2;
  let sum = 0;
  for (let i = 0; i < taps; i++) {
    const x = i - mid, sinc = x === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * x) / (Math.PI * x);
    // Blackman-Harris
    const w = 0.35875 - 0.48829 * Math.cos((2 * Math.PI * i) / (taps - 1)) + 0.14128 * Math.cos((4 * Math.PI * i) / (taps - 1)) - 0.01168 * Math.cos((6 * Math.PI * i) / (taps - 1));
    h[i] = sinc * w; sum += h[i];
  }
  // one table per byte of taps: what each possible byte (MSB = earliest bit) adds
  const bytes = taps / 8, lut = new Float32Array(bytes * 256);
  for (let k = 0; k < bytes; k++) {
    for (let v = 0; v < 256; v++) {
      let acc = 0;
      for (let b = 0; b < 8; b++) acc += h[k * 8 + b] / sum * ((v >> (7 - b)) & 1 ? 1 : -1);
      lut[k * 256 + v] = acc;
    }
  }
  return { bytes, lut };
}
const REVERSE = Uint8Array.from({ length: 256 }, (_, v) => { let r = 0; for (let b = 0; b < 8; b++) r |= ((v >> b) & 1) << (7 - b); return r; });
// bits: one channel's DSD as bytes in time order, MSB first
function dsdToPcm(bits, fsIn, onProgress) {
  const fsOut = fsIn >= 11289600 ? 176400 : 88200, decim = fsIn / fsOut, step = decim / 8;
  if (!Number.isInteger(step)) throw new Error(`Convert can't read DSD at ${fsIn} Hz.`);
  const { bytes, lut } = dsdFilter(fsIn, decim), n = Math.max(0, Math.floor((bits.length - bytes) / step) + 1), out = new Float32Array(n);
  for (let i = 0, p = 0; i < n; i++, p += step) {
    let acc = 0;
    for (let k = 0; k < bytes; k++) acc += lut[(k << 8) | bits[p + k]];
    out[i] = acc;
    if (onProgress && (i & 0xffff) === 0) onProgress(i / n);
  }
  return { pcm: out, fs: fsOut };
}
export function decodeDsd(bytes, onProgress) {
  const u8 = asU8(bytes);
  let ch, fs, chanBits;
  if (str(u8, 0, 4) === "DSD " && str(u8, 28, 4) === "fmt ") {
    // DSF: blocks of blockSize bytes per channel in turn, LSB first (or 8-bit MSB first)
    const f = 28, size = le64(u8, f + 4);
    ch = le32(u8, f + 24); fs = le32(u8, f + 28);
    const bitsPer = le32(u8, f + 32), count = le64(u8, f + 36), block = le32(u8, f + 44);
    const d = f + size;
    if (str(u8, d, 4) !== "data") throw new Error("This DSF file is missing its audio.");
    const len = Math.min(le64(u8, d + 4) - 12, u8.length - d - 12), off = d + 12;
    const per = Math.min(Math.ceil(count / 8), Math.floor(len / (block * ch)) * block);
    chanBits = Array.from({ length: ch }, () => new Uint8Array(per));
    for (let b = 0; b * block < per; b++) {
      for (let c = 0; c < ch; c++) {
        const src = off + (b * ch + c) * block, dst = b * block, n = Math.min(block, per - dst);
        for (let i = 0; i < n; i++) chanBits[c][dst + i] = bitsPer === 1 ? REVERSE[u8[src + i]] : u8[src + i];
      }
    }
  } else if (str(u8, 0, 4) === "FRM8" && str(u8, 12, 4) === "DSD ") {
    // DSDIFF: big-endian chunks; the audio is bytes interleaved channel by channel, MSB first
    let data = null;
    const walk = (p, end) => {
      while (p + 12 <= end) {
        const id = str(u8, p, 4), size = be64(u8, p + 4), a = p + 12;
        if (id === "PROP") walk(a + 4, a + size);
        else if (id === "FS  ") fs = be32(u8, a);
        else if (id === "CHNL") ch = be16(u8, a);
        else if (id === "CMPR" && str(u8, a, 4) === "DST ") throw new Error("This DFF file is DST-compressed, which Convert can't read yet. Save it as uncompressed DSD (or DSF) in the program that made it.");
        else if (id === "DSD ") data = { off: a, len: Math.min(size, u8.length - a) };
        p = a + size + (size & 1);
      }
    };
    walk(16, u8.length);
    if (!data || !ch || !fs) throw new Error("This DFF file is missing its format or audio.");
    const per = Math.floor(data.len / ch);
    chanBits = Array.from({ length: ch }, () => new Uint8Array(per));
    for (let i = 0, o = data.off; i < per; i++) for (let c = 0; c < ch; c++) chanBits[c][i] = u8[o++];
  } else return null;
  if (!ch || !fs) throw new Error("This DSD file is missing its format.");
  const chans = [];
  let outFs = 0;
  chanBits.forEach((bits, c) => {
    const r = dsdToPcm(bits, fs, onProgress && ((p) => onProgress((c + p) / ch)));
    chans.push(r.pcm); outFs = r.fs;
  });
  return { chans, fs: outFs, bitDepth: 24, float: false, label: `DSD${Math.round(fs / 44100)}`, dsdRate: fs };
}
