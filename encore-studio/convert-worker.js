// Encore Convert's heavy lifting, off the main thread (module worker). The
// page sends decoded audio (transferred, not copied) and the plan; this does
// the processing, the encoding and the container, and sends back a Blob.
//   in:  { chans, fs, plan, opts: { start, end, fadeIn, fadeOut, normalize }, meta, art }
//   out: { type: "progress", pct, stage } ... { type: "done", blob, report } | { type: "error", message }
// Cancel = the page terminates the worker.
import { processAudio, onGrid, quantize, pcmBytes, writeWav, writeAiff, loadLame, mp3Encoder, mp3InfoFrame, concat, peakOf } from "./convert-core.js";
import { encodeFlac } from "./convert-flac.js";
import { muxM4a, muxOggOpus } from "./convert-mux.js";
import { id3 } from "./tags.js";

let lame = null;
const progress = (pct, stage) => self.postMessage({ type: "progress", pct: Math.max(0, Math.min(1, pct)), stage });

self.onmessage = async (e) => {
  try {
    const { chans, fs, plan, opts, meta, art } = e.data;
    // 1) channels, trim, sample rate, fades, normalize (the first 15%)
    const pre = processAudio(chans, fs, { ...opts, channelMode: plan.channelMode, rate: plan.rate }, (p) => progress(0.15 * p, "Resampling"));
    const x = pre.chans, rate = pre.fs, samples = x[0].length;
    if (!samples) throw new Error("There's no audio left to convert (check the trim times).");
    progress(0.15, "Encoding");
    const report = { samples, rate, channels: x.length, gainDb: pre.norm.gainDb, normNote: pre.norm.note || "", dithered: false, clipped: peakOf(x) > 1 };
    const enc = (p) => progress(0.15 + 0.85 * p, "Encoding");
    let blob;
    if (plan.kind === "wav" || plan.kind === "aiff" || plan.kind === "flac") {
      let ints;
      if (plan.float) ints = x;
      else {
        // dither only when the audio needs rounding (an untouched 16-bit file stays exact)
        report.dithered = !onGrid(x, plan.bits);
        ints = quantize(x, plan.bits, report.dithered);
      }
      report.bits = plan.bits;
      if (plan.kind === "flac") blob = new Blob([encodeFlac(ints, rate, plan.bits, { meta, art, onProgress: enc })], { type: "audio/flac" });
      else if (plan.kind === "aiff") blob = writeAiff(ints, rate, plan.bits, meta, art);
      else blob = writeWav(pcmBytes(ints, plan.bits), rate, ints.length, plan.bits, meta, art);
    } else if (plan.kind === "mp3") blob = await mp3(x, rate, plan, meta, art, report, enc);
    else if (plan.kind === "m4a") blob = await webcodecs("m4a", x, rate, plan, meta, art, report, enc);
    else if (plan.kind === "opus") blob = await webcodecs("opus", x, rate, plan, meta, art, report, enc);
    else throw new Error("Unknown output format.");
    progress(1, "Done");
    self.postMessage({ type: "done", blob, report });
  } catch (err) {
    self.postMessage({ type: "error", message: err?.message || String(err) });
  }
};

// ---------- MP3 (lamejs, constant bitrate, joint stereo) ----------
async function mp3(x, rate, plan, meta, art, report, onProgress) {
  if (!lame) lame = loadLame(await (await fetch(new URL("vendor/lame.min.js", import.meta.url))).text());
  const ch = Math.min(2, x.length), e = mp3Encoder(lame, ch, rate, plan.kbps);
  report.dithered = !onGrid(x, 16);
  const ints = quantize(x, 16, report.dithered), n = ints[0].length, block = 1152 * 32, parts = [];
  const L = new Int16Array(block), R = new Int16Array(block);
  for (let s = 0; s < n; s += block) {
    const len = Math.min(block, n - s);
    for (let i = 0; i < len; i++) { L[i] = ints[0][s + i]; if (ch > 1) R[i] = ints[1][s + i]; }
    const out = e.encode(L.subarray(0, len), ch > 1 ? R.subarray(0, len) : L.subarray(0, len));
    if (out.length) parts.push(out.slice());
    onProgress((s + len) / n);
  }
  parts.push(e.flush().slice());
  const audio = concat(parts);
  const info = mp3InfoFrame(audio, n, e.delay, { channels: ch, lowpass: e.lowpass, srcRate: rate });
  Object.assign(report, { kbps: plan.kbps, frames: info.frames, delay: e.delay, padding: info.padding });
  return new Blob([id3(meta, art), info.frame, audio], { type: "audio/mpeg" });
}

// ---------- AAC and Opus (the browser's own encoders) ----------
async function webcodecs(kind, x, rate, plan, meta, art, report, onProgress) {
  if (typeof AudioEncoder === "undefined") throw new Error("This browser can't encode " + (kind === "m4a" ? "AAC" : "Opus") + ".");
  const ch = Math.min(2, x.length), n = x[0].length;
  const config = { codec: kind === "m4a" ? "mp4a.40.2" : "opus", sampleRate: rate, numberOfChannels: ch, bitrate: plan.kbps * 1000 };
  if (kind === "opus") config.opus = { complexity: 10, frameDuration: 20000 };
  const sup = await AudioEncoder.isConfigSupported(config).catch(() => ({ supported: false }));
  if (!sup.supported) { delete config.opus; if (!(await AudioEncoder.isConfigSupported(config)).supported) throw new Error(`This browser can't encode ${kind === "m4a" ? "AAC" : "Opus"} at ${rate / 1000} kHz, ${plan.kbps} kbps.`); }
  const chunks = [];
  let desc = null, failed = null, firstTs = null;
  const encoder = new AudioEncoder({
    output: (c, m) => {
      if (m?.decoderConfig?.description && !desc) desc = new Uint8Array(m.decoderConfig.description.buffer ? m.decoderConfig.description.buffer.slice(0) : m.decoderConfig.description);
      if (firstTs === null) firstTs = c.timestamp;
      const b = new Uint8Array(c.byteLength); c.copyTo(b);
      chunks.push({ data: b, duration: c.duration });
    },
    error: (err) => { failed = err; },
  });
  encoder.configure(config);
  const block = 4096;
  for (let s = 0; s < n; s += block) {
    if (failed) throw failed;
    const len = Math.min(block, n - s), d = new Float32Array(len * ch);
    for (let c = 0; c < ch; c++) d.set(x[c].subarray(s, s + len), c * len);
    encoder.encode(new AudioData({ format: "f32-planar", sampleRate: rate, numberOfFrames: len, numberOfChannels: ch, timestamp: Math.round(s * 1e6 / rate), data: d }));
    // keep the queue short so memory stays flat on long files
    while (encoder.encodeQueueSize > 16) await new Promise((r) => setTimeout(r, 1));
    onProgress((s + len) / n * 0.97);
  }
  await encoder.flush();
  encoder.close();
  if (failed) throw failed;
  if (!chunks.length) throw new Error("The encoder produced no audio.");
  if (kind === "m4a") {
    // the AudioSpecificConfig; build one if the browser didn't give it
    const asc = desc?.length >= 2 ? desc : ascFor(rate, ch);
    // priming the encoder put in front (Chrome reports it as a negative first timestamp)
    const priming = Math.max(0, Math.round(-(firstTs || 0) * rate / 1e6));
    Object.assign(report, { kbps: plan.kbps, frames: chunks.length, priming });
    return muxM4a(chunks.map((c) => c.data), { rate, channels: ch, asc, priming, samples: n, kbps: plan.kbps, meta, art });
  }
  // Opus: pre-skip from the encoder's own OpusHead (Chrome: 312)
  const preSkip = desc?.length >= 12 && String.fromCharCode(...desc.subarray(0, 8)) === "OpusHead" ? desc[10] | (desc[11] << 8) : 312;
  const packets = chunks.map((c) => ({ data: c.data, samples: Math.round((c.duration || 20000) * 48000 / 1e6) }));
  Object.assign(report, { kbps: plan.kbps, packets: packets.length, preSkip });
  return muxOggOpus(packets, { channels: ch, preSkip, inputRate: plan.inputRate || rate, samples: n, meta, art });
}
function ascFor(rate, ch) { // AAC-LC AudioSpecificConfig
  const idx = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350].indexOf(rate);
  return Uint8Array.of((2 << 3) | (idx >> 1), ((idx & 1) << 7) | (ch << 3));
}
