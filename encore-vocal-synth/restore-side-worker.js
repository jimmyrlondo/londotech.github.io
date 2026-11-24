// Encore Restore's second background thread, for the release workflow (the
// restoring itself stays in restore-worker.js):
//   levels { source }                              -> levels { lv, hop }   a side's level, for "N tracks"
//   encode { restored, start, end, gain, mono, formats, tags }
//                                                  -> progress, encoded { files: [{ fmt, blob, notes }] }
//   zip    { entries: [{ name, blob }] }           -> progress, zipped { zip }
//   aac    {}                                      -> aac { rates }   can this browser write AAC (at 44.1 / 48 kHz)?
import { fromDescription, F32Reader } from "./restore-io.js";
import { Envelope } from "./restore-project.js";
import { encodeTrack, applyTags, aacRate } from "./restore-export.js";
import { loadLame } from "./convert-core.js";
import { zip } from "./zip.js";

const CHUNK = 1 << 17;
let lame = null;
const post = (m, t) => self.postMessage(m, t || []);

async function levels(id, source) {
  const src = fromDescription(source), env = new Envelope(src.fs, 0.05);
  for (let pos = 0; pos < src.frames; pos += CHUNK) {
    const { l, r } = await src.read(pos, Math.min(CHUNK, src.frames - pos));
    env.push(l, r);
    post({ type: "progress", id, pct: Math.round(100 * (pos + CHUNK) / src.frames) });
  }
  const lv = env.result();
  post({ type: "levels", id, lv, hop: env.hop }, [lv.buffer]);
}

async function encode(id, d) {
  const src = new F32Reader(d.restored.blob, d.restored.fs, d.restored.frames), fs = src.fs;
  const a = Math.max(0, Math.round(d.start * fs)), b = Math.min(src.frames, Math.round(d.end * fs));
  const { l, r } = await src.read(a, b - a);
  if (d.gain !== 1) for (let i = 0; i < l.length; i++) { l[i] *= d.gain; r[i] *= d.gain; }
  const chans = d.mono ? [l] : [l, r];
  if (d.formats.includes("mp3") && !lame) lame = loadLame(await (await fetch(new URL("vendor/lame.min.js", import.meta.url))).text());
  const files = [];
  for (let k = 0; k < d.formats.length; k++) {
    const fmt = d.formats[k];
    // one format failing (a browser without an AAC encoder) doesn't stop the others
    try {
      const raw = await encodeTrack(chans, fs, fmt, { lame, onProgress: (p) => post({ type: "progress", id, pct: Math.round(100 * (k + p) / d.formats.length) }) });
      const out = applyTags(raw, d.tags);
      files.push({ fmt, blob: new Blob([out.bytes], { type: { flac: "audio/flac", wav: "audio/wav", mp3: "audio/mpeg", m4a: "audio/mp4" }[fmt] }), notes: out.notes });
    } catch (err) { files.push({ fmt, error: String(err?.message || err) }); }
  }
  post({ type: "encoded", id, files });
}

self.onmessage = async (e) => {
  const d = e.data;
  try {
    if (d.type === "levels") return await levels(d.id, d.source);
    if (d.type === "encode") return await encode(d.id, d);
    if (d.type === "aac") return post({ type: "aac", id: d.id, rates: [await aacRate(44100), await aacRate(48000)] });
    if (d.type === "zip") { const z = await zip(d.entries, (p) => post({ type: "progress", id: d.id, pct: Math.round(100 * p) })); return post({ type: "zipped", id: d.id, zip: z }); }
  } catch (err) {
    post({ type: "error", id: d.id, message: String(err?.message || err), stack: String(err?.stack || "") });
  }
};
