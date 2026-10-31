// Encore Convert: everything that isn't the page, so the same code runs in the
// worker and in Node (test-convert.mjs). Five parts:
//   PRESETS / plan          what each one-click button makes, and the exact
//                           output settings for one source (rate, bits, kbps)
//   process                 channels, trim, resample, fades, normalize
//   quantize / onGrid       float to integers, with TPDF dither only when the
//                           audio really needs rounding (a 16-bit file stays
//                           bit-for-bit 16-bit)
//   writeWav / writeAiff    PCM containers with tags (tags.js ID3 inside)
//   mp3InfoFrame / lame     the Xing/LAME header for MP3 durations and gapless,
//                           and the lamejs build with the options we need
// Plus readTags (the tag fields Last Call doesn't read), decodeAiff, md5,
// file names, size estimates and the plain-English notes.
import { id3 } from "./tags.js";
import { Resampler } from "./restore-dsp.js";
import { integratedLufs } from "./master-core.js";

const enc = new TextEncoder();
export const concat = (parts) => { const n = parts.reduce((a, p) => a + p.length, 0), out = new Uint8Array(n); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };

// ======================================================================
// Presets and the output plan
// ======================================================================
// kind: mp3 | wav | flac | aiff | m4a | opus. bits 0 = keep (as close to the
// source as the format allows), rate 0 = keep.
export const PRESETS = [
  { id: "mp3-320", label: "MP3 320", sub: "Best MP3", kind: "mp3", kbps: 320 },
  { id: "mp3-256", label: "MP3 256", sub: "Smaller, still great", kind: "mp3", kbps: 256 },
  { id: "mp3-192", label: "MP3 192", sub: "Good for sharing", kind: "mp3", kbps: 192 },
  { id: "mp3-128", label: "MP3 128", sub: "Smallest, for demos", kind: "mp3", kbps: 128 },
  { id: "wav-16-44", label: "WAV 16-bit 44.1", sub: "CD quality", kind: "wav", bits: 16, rate: 44100 },
  { id: "wav-24", label: "WAV 24-bit", sub: "Studio, same rate", kind: "wav", bits: 24 },
  { id: "flac", label: "FLAC", sub: "Lossless, half the size", kind: "flac", bits: 0 },
  { id: "aiff", label: "AIFF", sub: "Lossless, for Apple apps", kind: "aiff", bits: 0 },
  { id: "m4a-256", label: "AAC / M4A 256", sub: "Apple Music, iPhone", kind: "m4a", kbps: 256 },
  { id: "opus-160", label: "Opus / OGG 160", sub: "Small and modern", kind: "opus", kbps: 160 },
  { id: "voice", label: "Voice memo", sub: "Mono MP3, 128 kbps", kind: "mp3", kbps: 128, channels: "mono" },
];
export const FORMATS = {
  mp3: { ext: "mp3", mime: "audio/mpeg", name: "MP3", lossy: true },
  wav: { ext: "wav", mime: "audio/wav", name: "WAV", lossy: false },
  flac: { ext: "flac", mime: "audio/flac", name: "FLAC", lossy: false },
  aiff: { ext: "aiff", mime: "audio/aiff", name: "AIFF", lossy: false },
  m4a: { ext: "m4a", mime: "audio/mp4", name: "AAC (M4A)", lossy: true },
  opus: { ext: "opus", mime: "audio/ogg", name: "Opus (OGG)", lossy: true },
};
export const MP3_KBPS = [32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const MP3_RATES = [32000, 44100, 48000];

const nearestMp3Rate = (r) => (r >= 46000 ? (r % 44100 === 0 ? 44100 : 48000) : r >= 38000 ? 44100 : r > 0 && r < 38000 ? (r >= 32000 ? 32000 : 44100) : 44100);

// The exact settings for one source. src = { fs, channels, bitDepth, float,
// lossy }. opts (More options): { rate, bits, channels, kbps }. caps = what
// this browser can encode: { m4a: { rates, kbps }, opus: bool }.
export function plan(preset, src, opts = {}, caps = {}) {
  const kind = preset.kind, notes = [];
  const out = { kind, ext: FORMATS[kind].ext, mime: FORMATS[kind].mime, kbps: opts.kbps || preset.kbps || 0, rate: 0, bits: 0, float: false };
  // channels: keep, stereo, mono, left, right
  out.channelMode = opts.channels && opts.channels !== "keep" ? opts.channels : preset.channels || "keep";
  const srcCh = src.channels || 2;
  out.channels = out.channelMode === "keep" ? srcCh : out.channelMode === "stereo" ? 2 : 1;
  if (FORMATS[kind].lossy && out.channels > 2) { out.channels = 2; out.channelMode = "stereo"; notes.push(`${FORMATS[kind].name} here is stereo at most, so the ${srcCh} channels are mixed down to stereo.`); }
  // sample rate
  const want = opts.rate || preset.rate || src.fs;
  out.rate = want;
  if (kind === "mp3") {
    out.rate = MP3_RATES.includes(want) ? want : nearestMp3Rate(want);
    if (out.rate !== want) notes.push(`MP3 works at 32, 44.1 or 48 kHz, so this one is made at ${out.rate / 1000} kHz.`);
    if (!MP3_KBPS.includes(out.kbps)) out.kbps = MP3_KBPS.reduce((b, k) => (Math.abs(k - out.kbps) < Math.abs(b - out.kbps) ? k : b), 320);
  } else if (kind === "opus") {
    out.rate = 48000; // Opus always runs at 48 kHz inside
    if (want !== 48000) notes.push("Opus always plays back at 48 kHz, so the audio is resampled to 48 kHz first.");
    out.kbps = Math.max(6, Math.min(510, out.kbps || 160));
  } else if (kind === "m4a") {
    const rates = caps.m4a?.rates?.length ? caps.m4a.rates : [44100, 48000];
    if (!rates.includes(want)) {
      out.rate = rates.includes(want % 44100 === 0 ? 44100 : 48000) ? (want % 44100 === 0 ? 44100 : 48000) : rates[rates.length - 1];
      notes.push(`Your browser's AAC encoder works at ${rates.map((r) => r / 1000).join(" or ")} kHz, so this one is made at ${out.rate / 1000} kHz.`);
    }
    const kb = caps.m4a?.kbps?.length ? caps.m4a.kbps : [128, 192, 256];
    const ok = kb.filter((k) => k <= out.kbps);
    const pick = ok.length ? Math.max(...ok) : Math.min(...kb);
    if (pick !== out.kbps) notes.push(`Your browser's AAC encoder goes up to ${Math.max(...kb)} kbps, so this one is ${pick} kbps.`);
    out.kbps = pick;
  } else if (kind === "flac" && want > 655350) out.rate = 192000;
  // bit depth (PCM formats)
  if (kind === "wav" || kind === "flac" || kind === "aiff") {
    let bits = opts.bits || preset.bits || 0;
    if (bits === 32 && kind !== "wav") bits = 24;
    if (!bits) { // keep
      if (src.lossy) bits = 16; // a lossy file has no real bit depth; 16-bit holds all of it
      else if (src.float || src.bitDepth > 24) bits = kind === "wav" ? 32 : 24;
      else bits = src.bitDepth > 16 ? 24 : 16;
    }
    if (bits === 32 && src.bitDepth && src.bitDepth <= 24 && !src.float && !opts.bits && !preset.bits) bits = 24;
    out.bits = bits === 32 ? 32 : bits >= 24 ? 24 : 16;
    out.float = out.bits === 32;
    if (kind === "flac" && (src.float || src.bitDepth > 24) && !src.lossy) notes.push("FLAC stores whole numbers, so the 32-bit float audio is stored as 24-bit (with dither). That's still far below anything you can hear.");
  } else out.bits = 16; // encoders take 16-bit (MP3) or float (AAC, Opus) input
  return { ...out, notes };
}

// What this conversion does and doesn't do, in plain words
export function honesty(src, p) {
  const notes = [];
  const lossyOut = FORMATS[p.kind].lossy;
  if (src.lossy && !lossyOut) notes.push(`This file is already ${src.label || "lossy"}. Converting it to ${FORMATS[p.kind].name} keeps exactly what's there, but it can't bring back the detail the ${src.label || "lossy"} encoding threw away. The file gets bigger, not better.`);
  if (src.lossy && lossyOut) notes.push(`Going from ${src.label || "one lossy format"} to ${FORMATS[p.kind].name} loses a little more each time. Fine for a quick copy; for the best result convert from the original WAV or FLAC.`);
  if (!src.lossy && src.bitDepth > 16 && p.bits === 16 && !lossyOut) notes.push("Going down to 16-bit adds a faint dither noise far below the music (the standard way to do it), so it can't sound grainy.");
  if (p.rate > src.fs && src.fs) notes.push(`Raising the sample rate (${src.fs / 1000} to ${p.rate / 1000} kHz) doesn't add detail; the file just gets bigger.`);
  return notes;
}

// Approximate output size in bytes
export function estimateSize(p, seconds) {
  const ch = p.channels || 2;
  if (p.kind === "mp3" || p.kind === "m4a" || p.kind === "opus") return Math.round(seconds * p.kbps * 125 * (p.kind === "opus" ? 1.02 : 1));
  const pcm = seconds * p.rate * ch * (p.bits === 32 ? 4 : p.bits / 8);
  return Math.round(p.kind === "flac" ? pcm * 0.58 : pcm);
}
export function fmtBytes(n) {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

// ======================================================================
// File names
// ======================================================================
export const NAME_PATTERNS = [
  { id: "{name}", label: "Same name as the original" },
  { id: "{artist} - {title}", label: "Artist - Title" },
  { id: "{track} {title}", label: "Track number and title" },
  { id: "{name} ({format})", label: "Name plus the format" },
];
const clean = (s) => String(s ?? "").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "").replace(/\s+/g, " ").trim();
export function outName(pattern, sourceName, meta, p) {
  const base = String(sourceName || "").replace(/\.[^.\\/]{1,6}$/, "");
  const track = String(meta.track || "").split("/")[0];
  const fmt = p.kind === "mp3" ? `MP3 ${p.kbps}` : p.kind === "m4a" ? `AAC ${p.kbps}` : p.kind === "opus" ? `Opus ${p.kbps}` : `${FORMATS[p.kind].name} ${p.float ? "32f" : p.bits}`;
  let s = String(pattern || "{name}").replace(/\{(\w+)\}/g, (_, k) => clean(k === "name" ? base : k === "format" ? fmt : k === "track" ? (track ? track.padStart(2, "0") : "") : meta[k]));
  s = clean(s).replace(/^[-. ]+|[-. ]+$/g, "").replace(/\s+-\s+-\s+/g, " - ");
  return `${s || clean(base) || "Untitled"}.${p.ext}`;
}
// "Song.mp3", "Song (2).mp3" ... so a batch never overwrites itself
export function uniqueNames(names) {
  const seen = new Map();
  return names.map((n) => {
    const key = n.toLowerCase();
    if (!seen.has(key)) { seen.set(key, 1); return n; }
    let i = seen.get(key) + 1, m;
    do { m = n.replace(/(\.[^.]+)$/, ` (${i})$1`); i++; } while (seen.has(m.toLowerCase()));
    seen.set(key, i - 1); seen.set(m.toLowerCase(), 1);
    return m;
  });
}

// ======================================================================
// Processing: channels, trim, resample, fades, normalize
// ======================================================================
export function mapChannels(chans, mode) {
  const n = chans[0].length;
  if (mode === "keep" || !mode) return chans;
  if (mode === "left") return [chans[0]];
  if (mode === "right") return [chans[1] || chans[0]];
  if (mode === "stereo") {
    if (chans.length === 1) return [chans[0], chans[0].slice()];
    if (chans.length === 2) return chans;
    // 5.1 and up (L R C LFE Ls Rs ...): the usual ITU fold-down, LFE left out
    const L = new Float32Array(n), R = new Float32Array(n), g = Math.SQRT1_2;
    for (let i = 0; i < n; i++) {
      const c = chans[2] ? chans[2][i] * g : 0, ls = chans[4] ? chans[4][i] * g : 0, rs = chans[5] ? chans[5][i] * g : 0;
      L[i] = chans[0][i] + c + ls; R[i] = chans[1][i] + c + rs;
    }
    return [L, R];
  }
  // mono: the average, so a centred sound keeps its level
  const m = new Float32Array(n), k = 1 / chans.length;
  for (const c of chans) for (let i = 0; i < n; i++) m[i] += c[i] * k;
  return [m];
}

export function trim(chans, fs, start = 0, end = 0) {
  const n = chans[0].length;
  const a = Math.max(0, Math.min(n, Math.round((start || 0) * fs)));
  const b = end > 0 ? Math.max(a, Math.min(n, Math.round(end * fs))) : n;
  return a === 0 && b === n ? chans : chans.map((c) => c.slice(a, b));
}

// High-quality sample rate conversion (restore-dsp's 128-tap Kaiser sinc),
// streamed in blocks so progress can be reported
export function resample(chans, fsIn, fsOut, onProgress) {
  if (fsIn === fsOut) return chans;
  const step = fsIn / fsOut, r = new Resampler(() => step, Math.max(1, step), chans.length);
  const n = chans[0].length, want = Math.round(n * fsOut / fsIn), block = 1 << 16;
  const out = chans.map(() => new Float32Array(want)), put = (parts) => { for (let c = 0; c < parts.length; c++) { const p = parts[c], room = Math.max(0, Math.min(p.length, want - o)); out[c].set(p.subarray(0, room), o); } o += parts[0].length; };
  let o = 0;
  for (let s = 0; s < n; s += block) { put(r.push(chans.map((c) => c.subarray(s, Math.min(n, s + block))))); onProgress?.(Math.min(1, (s + block) / n)); }
  put(r.flush());
  return out;
}

// Equal-power-ish (sine) fades, in place
export function fades(chans, fs, fadeIn = 0, fadeOut = 0) {
  const n = chans[0].length;
  const fi = Math.min(n, Math.round((fadeIn || 0) * fs)), fo = Math.min(n, Math.round((fadeOut || 0) * fs));
  for (const c of chans) {
    for (let i = 0; i < fi; i++) c[i] *= Math.sin((Math.PI / 2) * (i / fi));
    for (let i = 0; i < fo; i++) c[n - 1 - i] *= Math.sin((Math.PI / 2) * (i / fo));
  }
  return chans;
}

export function peakOf(chans) {
  let p = 0;
  for (const c of chans) for (let i = 0; i < c.length; i++) { const a = Math.abs(c[i]); if (a > p) p = a; }
  return p;
}
export function loudnessOf(chans, fs) {
  return chans.length === 1 ? integratedLufs(chans[0], new Float32Array(chans[0].length), fs) : integratedLufs(chans[0], chans[1], fs);
}
// mode: "off" | "peak" (to -1 dBFS) | "lufs" (to -14 LUFS, never past -1 dBFS peak)
export function normalize(chans, fs, mode) {
  if (!mode || mode === "off") return { gainDb: 0 };
  const peak = peakOf(chans);
  if (peak < 1e-9) return { gainDb: 0, note: "The audio is silent, so there's nothing to normalize." };
  const peakRoom = -1 - 20 * Math.log10(peak);
  let gainDb = peakRoom, note = "";
  if (mode === "lufs") {
    const lufs = loudnessOf(chans, fs);
    if (lufs <= -70) return { gainDb: 0, note: "The audio is too quiet to measure loudness." };
    gainDb = -14 - lufs;
    if (gainDb > peakRoom) { note = `Reaching -14 LUFS would push the peaks past -1 dBFS, so it stops at ${(lufs + peakRoom).toFixed(1)} LUFS. Use Encore Master to get louder cleanly.`; gainDb = peakRoom; }
  }
  const g = Math.pow(10, gainDb / 20);
  if (Math.abs(gainDb) > 1e-6) for (const c of chans) for (let i = 0; i < c.length; i++) c[i] *= g;
  return { gainDb, note };
}

// The whole chain. opts: { channelMode, start, end, rate (target), fadeIn,
// fadeOut, normalize }. The caller hands over chans: they may be changed in place.
export function processAudio(chans, fs, opts, onProgress) {
  let x = mapChannels(chans, opts.channelMode);
  x = trim(x, fs, opts.start, opts.end);
  const rate = opts.rate || fs;
  x = resample(x, fs, rate, onProgress);
  if (opts.fadeIn || opts.fadeOut) fades(x, rate, opts.fadeIn, opts.fadeOut);
  const norm = normalize(x, rate, opts.normalize);
  return { chans: x, fs: rate, norm };
}

// ======================================================================
// Quantizing: float to whole numbers
// ======================================================================
// xorshift32: fast and plenty random for dither
export function rng(seed = 0x9e3779b9) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
// True when every sample is already a whole number at this bit depth (a 16-bit
// source, untouched): then rounding is exact and no dither is added
export function onGrid(chans, bits) {
  const scale = 2 ** (bits - 1), max = scale - 1;
  for (const c of chans) for (let i = 0; i < c.length; i++) { const v = c[i] * scale; if (v !== Math.round(v) || v > max || v < -scale) return false; }
  return true;
}
// Int32Array per channel. Full scale is 2^(bits-1) (so 16-bit -32768 maps to
// -1.0 and back exactly); TPDF dither (+-1 LSB triangular) when dither is on.
export function quantize(chans, bits, dither, seed = 22222) {
  const scale = 2 ** (bits - 1), max = scale - 1, min = -scale, r = rng(seed);
  return chans.map((c) => {
    const out = new Int32Array(c.length);
    for (let i = 0; i < c.length; i++) {
      let v = c[i] * scale;
      if (dither) v += r() - r();
      v = Math.round(v);
      out[i] = v > max ? max : v < min ? min : v;
    }
    return out;
  });
}

// ======================================================================
// WAV and AIFF
// ======================================================================
function riffChunk(id, body, le = true) {
  const head = new Uint8Array(8); head.set(enc.encode(id), 0);
  new DataView(head.buffer).setUint32(4, body.length, le);
  return body.length & 1 ? [head, body, new Uint8Array(1)] : [head, body];
}
function infoList(meta) {
  const items = [["INAM", meta.title], ["IART", meta.artist], ["IPRD", meta.album], ["ICRD", meta.year], ["IGNR", meta.genre],
    ["ITRK", meta.track], ["ICOP", meta.copyright], ["ICMT", meta.comment], ["ISFT", "Encore Music Studio"]];
  const parts = [enc.encode("INFO")];
  for (const [id, v] of items) if (v !== undefined && v !== null && String(v).trim() !== "") parts.push(...riffChunk(id, enc.encode(String(v).trim() + "\0")));
  return concat(parts);
}
// Interleaved little-endian PCM bytes. ints: Int32Array per channel (16/24-bit),
// or Float32Array per channel for 32-bit float.
export function pcmBytes(ints, bits, bigEndian = false) {
  const ch = ints.length, n = ints[0].length, bps = bits / 8, out = new Uint8Array(n * ch * bps), dv = new DataView(out.buffer);
  let o = 0;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++, o += bps) {
    const v = ints[c][i];
    if (bits === 32) dv.setFloat32(o, v, !bigEndian);
    else if (bits === 16) dv.setInt16(o, v, !bigEndian);
    else if (bigEndian) { out[o] = (v >> 16) & 255; out[o + 1] = (v >> 8) & 255; out[o + 2] = v & 255; }
    else { out[o] = v & 255; out[o + 1] = (v >> 8) & 255; out[o + 2] = (v >> 16) & 255; }
  }
  return out;
}
// A WAV: 16/24-bit PCM or 32-bit float, any channel count, LIST/INFO and an
// "id3 " chunk (with the cover) after the audio (where Windows reads them).
export function writeWav(data, fs, ch, bits, meta = {}, art = null) {
  const float = bits === 32, bps = bits / 8, ext = ch > 2;
  const fmt = new Uint8Array(ext ? 40 : 16), fv = new DataView(fmt.buffer);
  fv.setUint16(0, ext ? 0xfffe : float ? 3 : 1, true); fv.setUint16(2, ch, true); fv.setUint32(4, fs, true);
  fv.setUint32(8, fs * ch * bps, true); fv.setUint16(12, ch * bps, true); fv.setUint16(14, bits, true);
  if (ext) { // WAVE_FORMAT_EXTENSIBLE for surround: standard speaker positions
    fv.setUint16(16, 22, true); fv.setUint16(18, bits, true);
    fv.setUint32(20, [0, 4, 3, 7, 0x33, 0x37, 0x3f, 0x13f, 0x63f][ch] || 0, true);
    fv.setUint16(24, float ? 3 : 1, true);
    fmt.set([0x00, 0x00, 0x00, 0x00, 0x10, 0x00, 0x80, 0x00, 0x00, 0xaa, 0x00, 0x38, 0x9b, 0x71], 26);
  }
  // id3 first: readers that take the first tag they find get the Unicode one
  const tail = concat([...riffChunk("id3 ", id3(meta, art)), ...riffChunk("LIST", infoList(meta))]);
  const body = [enc.encode("WAVE"), ...riffChunk("fmt ", fmt), ...riffChunk("data", data), tail];
  const size = body.reduce((a, p) => a + p.length, 0);
  const head = new Uint8Array(8); head.set(enc.encode("RIFF"), 0); new DataView(head.buffer).setUint32(4, size, true);
  return new Blob([head, ...body], { type: "audio/wav" });
}
// 80-bit extended float, for AIFF's sample rate
function ext80(x) {
  const out = new Uint8Array(10);
  if (!x) return out;
  let e = Math.floor(Math.log2(x)), m = x / 2 ** e;
  if (m >= 2) { m /= 2; e++; }
  const hi = Math.floor(m * 2 ** 31), lo = Math.round((m * 2 ** 31 - hi) * 2 ** 32);
  const dv = new DataView(out.buffer);
  dv.setUint16(0, e + 16383); dv.setUint32(2, hi); dv.setUint32(6, lo);
  return out;
}
// AIFF (big-endian PCM 16/24-bit) with an ID3 chunk (cover included) plus NAME/AUTH
export function writeAiff(ints, fs, bits, meta = {}, art = null) {
  const ch = ints.length, n = ints[0].length;
  const comm = new Uint8Array(18), cv = new DataView(comm.buffer);
  cv.setUint16(0, ch); cv.setUint32(2, n); cv.setUint16(6, bits); comm.set(ext80(fs), 8);
  const ssnd = concat([new Uint8Array(8), pcmBytes(ints, bits, true)]);
  const parts = [enc.encode("AIFF"), ...riffChunk("COMM", comm, false), ...riffChunk("SSND", ssnd, false), ...riffChunk("ID3 ", id3(meta, art), false)];
  // NAME and AUTH are plain text chunks (Latin-1) for older apps; ID3 has the full Unicode tags
  const latin = (v) => Uint8Array.from(String(v), (c) => (c.charCodeAt(0) < 256 ? c.charCodeAt(0) : 63));
  if (meta.title) parts.push(...riffChunk("NAME", latin(meta.title), false));
  if (meta.artist) parts.push(...riffChunk("AUTH", latin(meta.artist), false));
  const size = parts.reduce((a, p) => a + p.length, 0);
  const head = new Uint8Array(8); head.set(enc.encode("FORM"), 0); new DataView(head.buffer).setUint32(4, size);
  return new Blob([head, ...parts], { type: "audio/aiff" });
}
// PCM from an AIFF/AIFC's bytes (big-endian, "sowt" little-endian, fl32/fl64),
// at its own rate: { chans, fs, bits } or null
export function decodeAiff(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const s4 = (o) => String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]);
  if (s4(0) !== "FORM" || !/^AIF[FC]$/.test(s4(8))) return null;
  let ch = 0, frames = 0, bits = 0, fs = 0, codec = "NONE", data = -1;
  for (let p = 12; p + 8 <= u8.length;) {
    const id = s4(p), size = dv.getUint32(p + 4), a = p + 8;
    if (id === "COMM") {
      ch = dv.getUint16(a); frames = dv.getUint32(a + 2); bits = dv.getUint16(a + 6);
      const e = dv.getUint16(a + 8) & 0x7fff, hi = dv.getUint32(a + 10), lo = dv.getUint32(a + 14);
      fs = Math.round((hi * 2 ** 32 + lo) * 2 ** (e - 16383 - 63));
      if (s4(8) === "AIFC" && size >= 22) codec = s4(a + 18);
    } else if (id === "SSND") data = a + 8 + dv.getUint32(a);
    p += 8 + size + (size & 1);
  }
  if (data < 0 || !ch || !fs) return null;
  const float = /^(fl32|FL32|fl64|FL64)$/.test(codec), le = codec === "sowt";
  if (!float && !["NONE", "twos", "sowt"].includes(codec)) return null;
  const bps = float ? (/64/.test(codec) ? 8 : 4) : Math.ceil(bits / 8);
  frames = Math.min(frames, Math.floor((u8.length - data) / (bps * ch)));
  const chans = Array.from({ length: ch }, () => new Float32Array(frames));
  for (let i = 0, o = data; i < frames; i++) for (let c = 0; c < ch; c++, o += bps) {
    let v;
    if (float) v = bps === 8 ? dv.getFloat64(o, le) : dv.getFloat32(o, le);
    else if (bps === 1) v = dv.getInt8(o) / 128;
    else if (bps === 2) v = dv.getInt16(o, le) / 32768;
    else if (bps === 3) v = (le ? ((u8[o + 2] << 24) | (u8[o + 1] << 16) | (u8[o] << 8)) : ((u8[o] << 24) | (u8[o + 1] << 16) | (u8[o + 2] << 8))) / 2147483648;
    else v = dv.getInt32(o, le) / 2147483648;
    chans[c][i] = v;
  }
  return { chans, fs, bits: float ? 32 : bits, float };
}

// ======================================================================
// MP3: lamejs with the options we want, and the Xing/LAME header
// ======================================================================
// The vendored lamejs hard-codes plain stereo. We patch its source text at
// load (the file on disk stays untouched) so a hook can set joint stereo or
// mono and so we can read the encoder's delay and padding afterwards.
// Measured: lamejs's bit reservoir and VBR are broken or missing (VBR throws,
// the reservoir decodes as noise), so MP3 is constant bitrate only.
export function loadLame(source) {
  const patched = source
    .replace("q.write_id3tag_automatic=!1;u.lame_init_params(q);", "q.write_id3tag_automatic=!1;lamejs.__cfg&&lamejs.__cfg(q,lamejs.__enums);u.lame_init_params(q);this.gfp=q;")
    .replace("lamejs.WavHeader=Fa}lamejs();", "lamejs.WavHeader=Fa;lamejs.__enums={vbr:G,mode:la}}lamejs();");
  if (!patched.includes("this.gfp=q") || !patched.includes("__enums={")) throw new Error("This lamejs build isn't the one Convert knows how to set up.");
  return new Function(patched + ";return lamejs;")();
}
// An encoder for 1 or 2 channels: { encode(L, R) -> Uint8Array, flush(), delay, padding }
export function mp3Encoder(lame, channels, fs, kbps) {
  lame.__cfg = (q, E) => { q.mode = channels === 1 ? E.mode.MONO : E.mode.JOINT_STEREO; };
  const e = new lame.Mp3Encoder(channels, fs, kbps);
  lame.__cfg = null;
  return {
    encode: (L, R) => { const o = e.encodeBuffer(L, R || L); return new Uint8Array(o.buffer, o.byteOffset, o.length); },
    flush: () => { const o = e.flush(); return new Uint8Array(o.buffer, o.byteOffset, o.length); },
    get delay() { return e.gfp.encoder_delay; },
    get lowpass() { return e.gfp.lowpassfreq; },
  };
}

let crc16Table = null;
export function crc16lame(bytes, crc = 0) { // CRC-16/ARC, what the LAME tag uses
  if (!crc16Table) { crc16Table = new Uint16Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xa001 : c >>> 1; crc16Table[n] = c; } }
  for (let i = 0; i < bytes.length; i++) crc = (crc >>> 8) ^ crc16Table[(crc ^ bytes[i]) & 255];
  return crc;
}
// Walk MPEG-1 layer III frames: [{ at, len }]
export function mp3Frames(u8) {
  const out = [];
  for (let p = 0; p + 4 <= u8.length;) {
    if (u8[p] !== 0xff || (u8[p + 1] & 0xfe) !== 0xfa) break;
    const br = MP3_KBPS[(u8[p + 2] >> 4) - 1], rate = [44100, 48000, 32000][(u8[p + 2] >> 2) & 3], pad = (u8[p + 2] >> 1) & 1;
    if (!br || !rate) break;
    const len = Math.floor(144000 * br / rate) + pad;
    out.push({ at: p, len, kbps: br, rate });
    p += len;
  }
  return out;
}
// The first frame of a CBR MP3: an "Info" (Xing) header so players know the
// exact length and can seek, and the LAME extension with the encoder delay and
// padding so decoders trim the silence at both ends (gapless).
// audio: the encoded frames; samples: real samples per channel; delay: the encoder's.
export function mp3InfoFrame(audio, samples, delay, { channels, lowpass = 0, srcRate = 0 } = {}) {
  const frames = mp3Frames(audio);
  if (!frames.length) throw new Error("The MP3 encoder produced no audio.");
  const h1 = audio[1], h2 = audio[2] & ~2, h3 = audio[3]; // the first frame's header, unpadded
  const { kbps, rate } = frames[0], len = Math.floor(144000 * kbps / rate);
  const f = new Uint8Array(len), dv = new DataView(f.buffer);
  f[0] = 0xff; f[1] = h1; f[2] = h2; f[3] = h3;
  const x = 4 + (channels === 1 ? 17 : 32);
  f.set(enc.encode("Info"), x);
  dv.setUint32(x + 4, 0x0f);                      // frames, bytes, TOC and quality are present
  dv.setUint32(x + 8, frames.length);
  dv.setUint32(x + 12, audio.length + len);
  for (let i = 0; i < 100; i++) f[x + 16 + i] = Math.floor(i * 256 / 100); // constant bitrate: a straight line
  dv.setUint32(x + 116, 0);                       // quality (unused for CBR)
  const t = x + 120;                              // LAME extension
  f.set(enc.encode("LAME3.98r"), t);
  f[t + 9] = 0x01;                                // tag revision 0, constant bitrate
  f[t + 10] = Math.min(255, Math.round(lowpass / 100));
  f[t + 20] = Math.min(255, kbps);
  const padding = frames.length * 1152 - delay - samples;
  f[t + 21] = (delay >> 4) & 255; f[t + 22] = ((delay & 15) << 4) | ((padding >> 8) & 15); f[t + 23] = padding & 255;
  f[t + 24] = ((channels === 1 ? 0 : 3) << 2) | ((srcRate > 48000 ? 3 : srcRate === 48000 ? 2 : srcRate === 44100 ? 1 : 0) << 6);
  dv.setUint32(t + 28, audio.length + len);       // music length: this frame and the audio
  dv.setUint16(t + 32, crc16lame(audio));          // music CRC
  dv.setUint16(t + 34, crc16lame(f.subarray(0, 190)));
  return { frame: f, frames: frames.length, padding };
}

// ======================================================================
// Tags: the fields Last Call's reader leaves out (comment, album artist,
// disc, composer, track in M4A), and Ogg's tags and cover
// ======================================================================
const str4 = (u8, o) => String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]);
const be32 = (u8, o) => ((u8[o] << 24) | (u8[o + 1] << 16) | (u8[o + 2] << 8) | u8[o + 3]) >>> 0;
const le32 = (u8, o) => (u8[o] | (u8[o + 1] << 8) | (u8[o + 2] << 16) | (u8[o + 3] << 24)) >>> 0;
const dec8 = new TextDecoder("utf-8");
function text16(b, be) {
  let s = "", i = 0;
  if (b.length >= 2 && ((b[0] === 0xff && b[1] === 0xfe) || (b[0] === 0xfe && b[1] === 0xff))) { be = b[0] === 0xfe; i = 2; }
  for (; i + 1 < b.length; i += 2) s += String.fromCharCode(be ? (b[i] << 8) | b[i + 1] : b[i] | (b[i + 1] << 8));
  return s;
}
const id3Str = (e, b) => (e === 0 ? String.fromCharCode(...b.subarray(0, 4096)) : e === 3 ? dec8.decode(b) : text16(b, e === 2)).replace(/\0+$/, "").split("\0")[0].trim();
function id3Extra(u8, off, t) {
  if (str4(u8, off).slice(0, 3) !== "ID3") return;
  const ver = u8[off + 3], size = ((u8[off + 6] & 127) << 21) | ((u8[off + 7] & 127) << 14) | ((u8[off + 8] & 127) << 7) | (u8[off + 9] & 127);
  if (ver < 3 || ver > 4 || (u8[off + 5] & 0x80)) return; // v2.2 and unsynchronised tags: Last Call's reader has the basics
  const end = Math.min(u8.length, off + 10 + size);
  for (let p = off + 10; p + 10 <= end;) {
    const id = str4(u8, p);
    if (!/^[A-Z0-9]{4}$/.test(id)) break;
    const fs = ver === 4 ? ((u8[p + 4] & 127) << 21) | ((u8[p + 5] & 127) << 14) | ((u8[p + 6] & 127) << 7) | (u8[p + 7] & 127) : be32(u8, p + 4);
    const d = u8.subarray(p + 10, Math.min(end, p + 10 + fs));
    p += 10 + fs;
    const ff = u8[p - fs - 1]; // frame flags: skip compressed / encrypted frames
    if (!d.length || (ver === 3 ? ff & 0xc0 : ff & 0x0d)) continue;
    const e = d[0], two = e === 1 || e === 2;
    if (id === "TPE2") t.albumArtist ??= id3Str(e, d.subarray(1));
    else if (id === "TPOS") t.disc ??= id3Str(e, d.subarray(1));
    else if (id === "TCOM") t.composer ??= id3Str(e, d.subarray(1));
    else if (id === "TCOP") t.copyright ??= id3Str(e, d.subarray(1));
    else if (id === "COMM" && t.comment === undefined) {
      let q = 4; // skip the language and the description
      if (two) { while (q + 1 < d.length && (d[q] || d[q + 1])) q += 2; q += 2; } else { while (q < d.length && d[q]) q++; q++; }
      const v = id3Str(e, d.subarray(q));
      if (v) t.comment = v;
    }
  }
}
function vorbisInto(b, t, artOut) {
  let p = 4 + le32(b, 0);
  const count = le32(b, p); p += 4;
  const map = { TITLE: "title", ARTIST: "artist", ALBUM: "album", DATE: "year", YEAR: "year", GENRE: "genre", TRACKNUMBER: "track", ISRC: "isrc",
    ALBUMARTIST: "albumArtist", "ALBUM ARTIST": "albumArtist", DISCNUMBER: "disc", COMMENT: "comment", DESCRIPTION: "comment", COMPOSER: "composer", COPYRIGHT: "copyright" };
  for (let i = 0; i < count && p + 4 <= b.length; i++) {
    const len = le32(b, p), kv = dec8.decode(b.subarray(p + 4, p + 4 + len)); p += 4 + len;
    const eq = kv.indexOf("="); if (eq < 0) continue;
    const k = kv.slice(0, eq).toUpperCase(), v = kv.slice(eq + 1).trim();
    if (map[k] && t[map[k]] === undefined && v) t[map[k]] = v;
    if (k === "METADATA_BLOCK_PICTURE" && artOut && !artOut.art) {
      try {
        const pic = Uint8Array.from(atob(v), (c) => c.charCodeAt(0));
        const ml = be32(pic, 4), mime = String.fromCharCode(...pic.subarray(8, 8 + ml)).toLowerCase(), dl = be32(pic, 8 + ml), q = 12 + ml + dl + 16;
        artOut.art = { bytes: pic.slice(q + 4, q + 4 + be32(pic, q)), mime, type: be32(pic, 0) };
      } catch { /* a broken picture: skip it */ }
    }
  }
}
// The second Ogg packet (the comment header), across pages
function oggCommentPacket(u8) {
  const packets = [], cur = [];
  for (let p = 0; p + 27 <= u8.length && packets.length < 2 && p < 16 << 20;) {
    if (str4(u8, p) !== "OggS") break;
    const nseg = u8[p + 26], segs = u8.subarray(p + 27, p + 27 + nseg);
    let d = p + 27 + nseg;
    for (const s of segs) { cur.push(u8.subarray(d, d + s)); d += s; if (s < 255) { packets.push(concat(cur)); cur.length = 0; if (packets.length === 2) break; } }
    p = d;
  }
  return packets[1] || null;
}
function mp4Extra(u8, t) {
  const walk = (from, to, inIlst) => {
    for (let p = from; p + 8 <= to;) {
      let size = be32(u8, p); const type = str4(u8, p + 4);
      if (size === 0) size = to - p;
      if (size < 8) break;
      const a = p + 8, b = Math.min(to, p + size);
      if (["moov", "udta", "ilst"].includes(type)) walk(a, b, type === "ilst");
      else if (type === "meta") walk(str4(u8, a + 4) === "hdlr" ? a : a + 4, b, false);
      else if (inIlst) {
        let name = "";
        for (let q = a; q + 8 <= b;) {
          const s = be32(u8, q), tt = str4(u8, q + 4);
          if (s < 8) break;
          if (tt === "name") name = dec8.decode(u8.subarray(q + 12, q + s));
          if (tt === "data") {
            const v = u8.subarray(q + 16, q + s), txt = () => dec8.decode(v).trim();
            if (type === "trkn" && v.length >= 6) t.track ??= String((v[2] << 8) | v[3]) + ((v[4] << 8) | v[5] ? "/" + ((v[4] << 8) | v[5]) : "");
            else if (type === "disk" && v.length >= 6) t.disc ??= String((v[2] << 8) | v[3]);
            else if (type === "aART") t.albumArtist ??= txt();
            else if (type === "\xa9cmt") t.comment ??= txt();
            else if (type === "\xa9wrt") t.composer ??= txt();
            else if (type === "cprt") t.copyright ??= txt();
            else if (type === "----" && name.toUpperCase() === "ISRC") t.isrc ??= txt();
          }
          q += s;
        }
      }
      p += size;
    }
  };
  walk(0, u8.length, false);
}
// Extra tag fields (and Ogg cover art), merged under the ones Last Call found.
// info: readFileInfo's result. Returns { tags, art }.
export function readTags(bytes, info) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const t = { ...info.tags }, holder = { art: info.art };
  try {
    if (info.container === "mp3" || (info.container === "flac" && str4(u8, 0).startsWith("ID3"))) id3Extra(u8, 0, t);
    if (info.container === "wav" || info.container === "aiff") {
      const le = info.container === "wav";
      for (let p = 12; p + 8 <= u8.length;) {
        const id = str4(u8, p), size = le ? le32(u8, p + 4) : be32(u8, p + 4);
        if (id === "id3 " || id === "ID3 ") id3Extra(u8, p + 8, t);
        p += 8 + size + (size & 1);
        if (size > u8.length) break;
      }
    }
    if (info.container === "flac") {
      let p = str4(u8, 0).startsWith("ID3") ? 10 + (((u8[6] & 127) << 21) | ((u8[7] & 127) << 14) | ((u8[8] & 127) << 7) | (u8[9] & 127)) : 0;
      for (p += 4; p + 4 <= u8.length;) {
        const last = u8[p] & 0x80, type = u8[p] & 0x7f, len = (u8[p + 1] << 16) | (u8[p + 2] << 8) | u8[p + 3];
        if (type === 4) vorbisInto(u8.subarray(p + 4, p + 4 + len), t, null);
        p += 4 + len; if (last) break;
      }
    }
    if (info.container === "ogg") {
      const pk = oggCommentPacket(u8);
      if (pk) {
        if (String.fromCharCode(...pk.subarray(0, 8)) === "OpusTags") vorbisInto(pk.subarray(8), t, holder);
        else if (pk[0] === 3 && String.fromCharCode(...pk.subarray(1, 7)) === "vorbis") vorbisInto(pk.subarray(7), t, holder);
      }
    }
    if (info.container === "m4a") mp4Extra(u8, t);
  } catch { /* damaged tags: keep what we have */ }
  for (const k of Object.keys(t)) if (t[k] === undefined || t[k] === "") delete t[k];
  return { tags: t, art: holder.art || null };
}

// ======================================================================
// MD5 (FLAC's STREAMINFO carries one of the raw audio), streaming
// ======================================================================
const MD5_K = Int32Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) | 0);
const MD5_S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
export class MD5 {
  constructor() { this.h = Int32Array.of(0x67452301, 0xefcdab89 | 0, 0x98badcfe | 0, 0x10325476); this.buf = new Uint8Array(64); this.n = 0; this.len = 0; this.w = new Int32Array(16); }
  block(b, o) {
    const w = this.w;
    for (let i = 0; i < 16; i++) w[i] = b[o + i * 4] | (b[o + i * 4 + 1] << 8) | (b[o + i * 4 + 2] << 16) | (b[o + i * 4 + 3] << 24);
    let [a, bb, c, d] = this.h;
    for (let i = 0; i < 64; i++) {
      let f, g;
      if (i < 16) { f = (bb & c) | (~bb & d); g = i; }
      else if (i < 32) { f = (d & bb) | (~d & c); g = (5 * i + 1) & 15; }
      else if (i < 48) { f = bb ^ c ^ d; g = (3 * i + 5) & 15; }
      else { f = c ^ (bb | ~d); g = (7 * i) & 15; }
      const s = MD5_S[(i >> 4) * 4 + (i & 3)], x = (a + f + MD5_K[i] + w[g]) | 0;
      a = d; d = c; c = bb; bb = (bb + ((x << s) | (x >>> (32 - s)))) | 0;
    }
    this.h[0] += a; this.h[1] += bb; this.h[2] += c; this.h[3] += d;
  }
  update(u8) {
    let i = 0;
    this.len += u8.length;
    if (this.n) { while (this.n < 64 && i < u8.length) this.buf[this.n++] = u8[i++]; if (this.n === 64) { this.block(this.buf, 0); this.n = 0; } }
    for (; i + 64 <= u8.length; i += 64) this.block(u8, i);
    while (i < u8.length) this.buf[this.n++] = u8[i++];
    return this;
  }
  digest() {
    const bits = this.len * 8, pad = new Uint8Array(((this.n < 56 ? 56 : 120) - this.n) + 8);
    pad[0] = 0x80;
    const dv = new DataView(pad.buffer);
    dv.setUint32(pad.length - 8, bits >>> 0, true); dv.setUint32(pad.length - 4, Math.floor(bits / 2 ** 32), true);
    this.update(pad);
    const out = new Uint8Array(16), ov = new DataView(out.buffer);
    for (let i = 0; i < 4; i++) ov.setInt32(i * 4, this.h[i], true);
    return out;
  }
}
export const hex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, "0")).join("");
