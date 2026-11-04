// ENCORE. Studio: open any audio file the tools understand, at its own sample
// rate, as Float32 channels. WAV, AIFF, Apple Lossless, CAF, AU, Wave64 and
// DSD are read here (exact samples, the same in every browser); everything
// else goes to the browser's decoder. Used by Journey (Convert has its own copy
// of the same steps).
import { readFileInfo, decodeWav } from "./lastcall-core.js";
import { decodeAiff } from "./convert-core.js";
import { decodeCaf, decodeAu, decodeW64, decodeWavCodec } from "./convert-read.js";

let alacMod = null;
const alac = async () => (alacMod ||= await import("./convert-alac.js"));

/** The file types worth offering in a file picker */
export const AUDIO_EXT = /\.(wav|wave|flac|aif|aiff|aifc|mp3|m4a|mp4|m4b|aac|ogg|oga|opus|webm|caf|weba|alac|au|snd|w64|dsf|dff)$/i;
export const ACCEPT = "audio/*,.wav,.flac,.aif,.aiff,.aifc,.mp3,.m4a,.mp4,.aac,.ogg,.oga,.opus,.webm,.caf,.au,.snd,.w64,.dsf,.dff";

/**
 * file: a File or Blob. info: readFileInfo's result (read here if not given).
 * onStatus: plain-words progress for slow formats (DSD). Returns { chans, fs, info }.
 */
export async function decodeAudio(file, info = null, onStatus = () => {}) {
  let buf = await file.arrayBuffer();
  const u8 = new Uint8Array(buf);
  info ||= readFileInfo(u8, file.name || "");
  const done = (d) => ({ chans: d.chans, fs: d.fs, info });
  if (info.container === "wav") { const d = decodeWav(buf) || decodeWavCodec(u8, info); if (d?.chans.length) return done(d); }
  if (info.container === "aiff") { const d = decodeAiff(buf); if (d?.chans.length) return done(d); }
  if (info.container === "m4a" && info.codec === "alac") {
    const d = (await alac()).decodeAlac(u8);
    if (d?.chans.length) return done(d);
    throw new Error("Couldn't read the Apple Lossless audio in this file.");
  }
  if (info.container === "caf") {
    const d = decodeCaf(u8, info.codec === "alac" ? (await alac()).decodeAlac : null);
    if (d?.chans) return done(d);
    if (d?.adts) buf = d.adts.slice().buffer;
  }
  if (info.container === "au") return done(decodeAu(u8));
  if (info.container === "w64") return done(decodeW64(u8));
  if (info.container === "dsd") {
    // a few seconds of filtering per channel, so it runs in Convert's worker
    onStatus(`Turning ${info.label} into PCM...`);
    return new Promise((resolve, reject) => {
      const w = new Worker(new URL("convert-worker.js", import.meta.url), { type: "module" });
      w.onmessage = (e) => {
        const m = e.data;
        if (m.type === "progress") return onStatus(`Turning ${info.label} into PCM... ${Math.round(m.pct * 100)}%`);
        w.terminate();
        m.type === "dsd" ? resolve({ chans: m.chans, fs: m.fs, info }) : reject(new Error(m.message));
      };
      w.onerror = (e) => { w.terminate(); reject(new Error(e.message || "The DSD reader stopped unexpectedly.")); };
      w.postMessage({ dsd: buf }, [buf]);
    });
  }
  const rate = info.sampleRate >= 3000 && info.sampleRate <= 768000 ? info.sampleRate : 48000;
  try {
    const ab = await new OfflineAudioContext(1, 1, rate).decodeAudioData(buf);
    const chans = [];
    for (let c = 0; c < ab.numberOfChannels; c++) { const a = new Float32Array(ab.length); ab.copyFromChannel(a, c); chans.push(a); }
    return { chans, fs: ab.sampleRate, info };
  } catch {
    throw new Error(info.container === "unknown" ? "This doesn't look like an audio file this browser can read." : `This browser can't decode this ${info.label} file.`);
  }
}
