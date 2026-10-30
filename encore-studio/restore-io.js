// Encore Restore: reading audio without holding a 25-minute side in memory.
//
// WAV files are read lazily straight from disk (File.slice), so the original is
// only ever read, never touched. Compressed files (FLAC, MP3...) are decoded
// once by the browser and parked in a Blob of 32-bit floats; the restored
// audio lives in one of those too. Browsers keep big Blobs on disk, and the
// page and the worker share one without copying it.
//
//   src.fs, src.frames, src.channels;  const { l, r } = await src.read(start, count)
import { parseWavHeader } from "./live-source.js";

export class WavReader {
  constructor(file, h) { this.file = file; this.h = h; this.fs = h.fs; this.frames = h.frames; this.channels = h.channels; this.kind = "wav"; }
  async read(start, count) {
    const h = this.h, bps = h.bits / 8, fb = bps * h.channels;
    start = Math.floor(start);
    const l = new Float32Array(Math.max(0, count)), r = new Float32Array(Math.max(0, count));
    const a = Math.max(0, start), b = Math.min(h.frames, start + count);
    if (b <= a) return { l, r };
    const v = new DataView(await this.file.slice(h.dataOff + a * fb, h.dataOff + b * fb).arrayBuffer());
    const rd = h.format === 3 ? (o) => v.getFloat32(o, true)
      : h.bits === 16 ? (o) => v.getInt16(o, true) / 32768
      : h.bits === 24 ? (o) => (v.getUint8(o) | (v.getUint8(o + 1) << 8) | (v.getInt8(o + 2) << 16)) / 8388608
      : (o) => v.getInt32(o, true) / 2147483648;
    const second = h.channels > 1 ? bps : 0, skip = a - start;
    for (let i = 0; i < b - a; i++) { const o = i * fb; l[skip + i] = rd(o); r[skip + i] = rd(o + second); }
    return { l, r };
  }
}

// interleaved stereo float32 in a Blob
export class F32Reader {
  constructor(blob, fs, frames, channels = 2) { this.blob = blob; this.fs = fs; this.frames = frames; this.channels = channels; this.kind = "f32"; }
  async read(start, count) {
    start = Math.floor(start);
    const l = new Float32Array(Math.max(0, count)), r = new Float32Array(Math.max(0, count));
    const a = Math.max(0, start), b = Math.min(this.frames, start + count);
    if (b <= a) return { l, r };
    const f = new Float32Array(await this.blob.slice(a * 8, b * 8).arrayBuffer()), skip = a - start;
    for (let i = 0; i < b - a; i++) { l[skip + i] = f[2 * i]; r[skip + i] = f[2 * i + 1]; }
    return { l, r };
  }
}

// One interleaved block for an F32 Blob
export function interleave(l, r) {
  const out = new Float32Array(l.length * 2);
  for (let i = 0; i < l.length; i++) { out[2 * i] = l[i]; out[2 * i + 1] = r[i]; }
  return out;
}

// A file: WAV is read in place; anything else is decoded by `decode` (the page
// passes a function using AudioContext.decodeAudioData) and parked in a Blob.
export async function openAudio(file, decode) {
  const h = await parseWavHeader(file);
  if (h) return new WavReader(file, h);
  const buf = await decode(await file.arrayBuffer());
  const n = buf.length, step = 1 << 18, parts = [];
  const L = new Float32Array(step), R = new Float32Array(step);
  for (let at = 0; at < n; at += step) {
    const m = Math.min(step, n - at);
    buf.copyFromChannel(L, 0, at);
    if (buf.numberOfChannels > 1) buf.copyFromChannel(R, 1, at); else R.set(L);
    parts.push(new Blob([interleave(L.subarray(0, m), R.subarray(0, m))]));
  }
  const src = new F32Reader(new Blob(parts), buf.sampleRate, n, buf.numberOfChannels);
  src.decoded = true;
  return src;
}

// for postMessage: what the other side needs to read the same audio
export const describe = (s) => (s.kind === "wav" ? { kind: "wav", file: s.file, h: s.h } : { kind: "f32", blob: s.blob, fs: s.fs, frames: s.frames, channels: s.channels });
export const fromDescription = (d) => (d.kind === "wav" ? new WavReader(d.file, d.h) : new F32Reader(d.blob, d.fs, d.frames, d.channels));
