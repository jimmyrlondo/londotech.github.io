// Encore Restore: one restored track to finished, tagged files. The encoders
// are Convert's (FLAC, WAV, MP3 via lamejs, AAC via the browser's own encoder)
// and the tags are written by Tag's writer (every field, custom fields as
// TXXX / Vorbis / iTunes freeform, the cover), so a file from here reads the
// same in Tag, Last Call and any player. No page in it: the export worker runs
// it, and Node tests FLAC, WAV and MP3 (test-restore-project.mjs).
import { quantize, pcmBytes, writeWav, mp3Encoder, mp3InfoFrame, concat, resample } from "./convert-core.js";
import { encodeFlac } from "./convert-flac.js";
import { muxM4a } from "./convert-mux.js";
import { readTags, writeTags } from "./tag-core.js";

import { EXPORT_FORMATS } from "./restore-project.js";
export { EXPORT_FORMATS };
export const exportFormat = (id) => EXPORT_FORMATS.find((f) => f.id === id);

// MP3 and AAC need 44.1 or 48 kHz; a 96 kHz transfer goes to 48 (88.2 to 44.1)
export const lossyRate = (fs) => (fs === 44100 || fs === 48000 ? fs : fs % 44100 === 0 ? 44100 : 48000);

// chans: [Float32Array] (1 or 2), restored, already at the export level.
// Returns the untagged file's bytes.
export async function encodeTrack(chans, fs, fmt, { lame = null, onProgress } = {}) {
  if (fmt === "flac") return encodeFlac(quantize(chans, 24, true), fs, 24, { meta: {}, onProgress });
  if (fmt === "wav") return new Uint8Array(await writeWav(pcmBytes(quantize(chans, 24, true), 24), fs, chans.length, 24, {}).arrayBuffer());
  if (fmt === "mp3") {
    if (!lame) throw new Error("The MP3 encoder isn't loaded.");
    const rate = lossyRate(fs), x = resample(chans, fs, rate), ch = x.length;
    const e = mp3Encoder(lame, ch, rate, 320), ints = quantize(x, 16, true), n = ints[0].length, block = 1152 * 32, parts = [];
    const L = new Int16Array(block), R = new Int16Array(block);
    for (let s = 0; s < n; s += block) {
      const len = Math.min(block, n - s);
      for (let i = 0; i < len; i++) { L[i] = ints[0][s + i]; if (ch > 1) R[i] = ints[1][s + i]; }
      const out = e.encode(L.subarray(0, len), ch > 1 ? R.subarray(0, len) : L.subarray(0, len));
      if (out.length) parts.push(out.slice());
      onProgress?.((s + len) / n);
    }
    parts.push(e.flush().slice());
    const audio = concat(parts), info = mp3InfoFrame(audio, n, e.delay, { channels: ch, lowpass: e.lowpass, srcRate: rate });
    return concat([info.frame, audio]);
  }
  if (fmt === "m4a") return aac(chans, fs, onProgress);
  throw new Error("Unknown export format " + fmt);
}

// AAC-LC 256 kbps with the browser's AudioEncoder (Chrome, Edge, Safari), in an M4A
async function aac(chans, fs, onProgress) {
  if (typeof AudioEncoder === "undefined") throw new Error("This browser can't encode AAC. Use FLAC, WAV or MP3.");
  const ch = chans.length, rate = await aacRate(fs, ch);
  if (!rate) throw new Error("This browser can't encode AAC.");
  const x = resample(chans, fs, rate), n = x[0].length;
  const config = { codec: "mp4a.40.2", sampleRate: rate, numberOfChannels: ch, bitrate: 256000 };
  const chunks = [];
  let desc = null, failed = null, firstTs = null;
  const enc = new AudioEncoder({
    output: (c, m) => {
      if (m?.decoderConfig?.description && !desc) desc = new Uint8Array(m.decoderConfig.description.buffer ? m.decoderConfig.description.buffer.slice(0) : m.decoderConfig.description);
      if (firstTs === null) firstTs = c.timestamp;
      const b = new Uint8Array(c.byteLength); c.copyTo(b); chunks.push(b);
    },
    error: (e) => { failed = e; },
  });
  enc.configure(config);
  const block = 4096;
  for (let s = 0; s < n; s += block) {
    if (failed) throw failed;
    const len = Math.min(block, n - s), d = new Float32Array(len * ch);
    for (let c = 0; c < ch; c++) d.set(x[c].subarray(s, s + len), c * len);
    enc.encode(new AudioData({ format: "f32-planar", sampleRate: rate, numberOfFrames: len, numberOfChannels: ch, timestamp: Math.round(s * 1e6 / rate), data: d }));
    while (enc.encodeQueueSize > 16) await new Promise((r) => setTimeout(r, 1));
    onProgress?.((s + len) / n);
  }
  await enc.flush(); enc.close();
  if (failed) throw failed;
  const idx = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350].indexOf(rate);
  const asc = desc?.length >= 2 ? desc : Uint8Array.of((2 << 3) | (idx >> 1), ((idx & 1) << 7) | (ch << 3));
  const priming = Math.max(0, Math.round(-(firstTs || 0) * rate / 1e6));
  const blob = muxM4a(chunks, { rate, channels: ch, asc, priming, samples: n, kbps: 256, meta: {} });
  return new Uint8Array(await blob.arrayBuffer());
}

// The rate AAC is written at: 44.1 or 48 kHz as the side suggests, or the other one
// when this browser's encoder only takes that (some only do 48), or 0 for none
export async function aacRate(fs, channels = 2) {
  if (typeof AudioEncoder === "undefined") return 0;
  const first = lossyRate(fs);
  for (const rate of [first, first === 48000 ? 44100 : 48000]) {
    const ok = await AudioEncoder.isConfigSupported({ codec: "mp4a.40.2", sampleRate: rate, numberOfChannels: channels, bitrate: 256000 }).then((r) => r.supported, () => false);
    if (ok) return rate;
  }
  return 0;
}

// Tags onto an encoded file, with Tag's writer. tags: { fields, custom: [{ name, value }],
// pictures: [{ type, mime, desc, bytes }] }. Returns { bytes, notes }.
export function applyTags(bytes, tags) {
  const m = readTags(bytes);
  if (m.readOnly) throw new Error(m.readOnly);
  m.fields = { ...tags.fields };
  m.custom = (tags.custom || []).map((c) => ({ name: c.name, value: c.value }));
  m.pictures = (tags.pictures || []).filter((p) => p.bytes?.length).map((p) => ({ type: p.type ?? 3, mime: p.mime || "image/jpeg", desc: p.desc || "", bytes: p.bytes }));
  return writeTags(bytes, m, { id3Version: 3 });
}
