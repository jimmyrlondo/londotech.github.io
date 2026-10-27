// Encore Album background thread. The page runs a few of these at once and
// hands each track to whichever is free. Tracks arrive as WAV blobs (the page
// turns MP3/FLAC/AAC into float WAVs first) and are read straight from the
// blob, so no worker holds the whole album in memory.
//
// Messages in (every reply carries the same id and job):
//   init     { wasm }                                         -> ready
//   measure  { id, job, file }                                -> measured { seconds, fs, lufs, peakDb, peaks, trim, mix }
//   learn    { id, job, file, settings, cut }                 -> learned { learned }
//   tune     { id, job, file, settings, learned, cut }        -> tuned { learned, lufs, peakDb, peaks }
//   render   { id, job, file, settings, learned, cut, wav: [24, 16], meta, art, pcm }
//                                                             -> rendered { learned, lufs, peakDb, seconds, wavs, l?, r? }
// cut = { start, end, fadeIn, fadeOut } in seconds (the part of the file that's the track).
// settings.targetLufs is this track's own target (see album.js trackTargets).
import { loadMaster, integratedLufs } from "./master-core.js";
import { parseWavHeader, sourceFromDescription } from "./live-source.js";
import { mixCheck } from "./mix-check.js";
import { wavFile } from "./tags.js";
import { findTrim } from "./album.js";

let M = null;
const COLS = 600;

async function readTrack(file, cut) {
  const h = await parseWavHeader(file);
  if (!h) throw new Error("That file isn't a WAV this reader understands.");
  const src = sourceFromDescription({ kind: "wav", file, header: h });
  const a = cut ? Math.max(0, Math.round(cut.start * h.fs)) : 0, b = cut ? Math.min(h.frames, Math.round(cut.end * h.fs)) : h.frames;
  const { l, r } = await src.read(a, Math.max(1, b - a));
  return { l, r, fs: h.fs };
}

function fades(l, r, fs, fadeIn, fadeOut) {
  const fi = Math.min(l.length, Math.round((fadeIn || 0) * fs)), fo = Math.min(l.length, Math.round((fadeOut || 0) * fs));
  for (let i = 0; i < fi; i++) { const g = Math.sin((i / fi) * Math.PI / 2) ** 2; l[i] *= g; r[i] *= g; }
  for (let i = 0; i < fo; i++) { const g = Math.sin((i / fo) * Math.PI / 2) ** 2, j = l.length - 1 - i; l[j] *= g; r[j] *= g; }
}

function stats(l, r, fs) {
  const per = Math.max(1, Math.ceil(l.length / COLS)), peaks = new Float32Array(COLS);
  let pk = 0;
  for (let i = 0; i < l.length; i++) {
    const m = Math.max(Math.abs(l[i]), Math.abs(r[i]));
    if (m > pk) pk = m;
    const c = (i / per) | 0; if (m > peaks[c]) peaks[c] = m;
  }
  return { lufs: integratedLufs(l, r, fs), peakDb: 20 * Math.log10(pk + 1e-12), peaks };
}

// Render with the learned settings; if the whole track misses its target,
// nudge the drive and render again (the same as Master's export).
function renderTuned(l, r, fs, settings, learned, passes) {
  let tuned = learned.slice(), out = null, lufs = -100;
  for (let pass = 0; pass < passes; pass++) {
    out = M.renderOffline(l, r, fs, settings, tuned);
    lufs = integratedLufs(out[0], out[1], fs);
    const err = (settings.targetLufs ?? -14) - lufs;
    if (Math.abs(err) < 0.25 || pass === passes - 1) break;
    tuned = tuned.slice(); tuned[2] = Math.max(-6, Math.min(24, tuned[2] + err));
  }
  return { out, lufs, learned: tuned };
}

self.onmessage = async (e) => {
  const d = e.data, reply = (m, transfer) => self.postMessage({ id: d.id, job: d.job, ...m }, transfer ?? []);
  try {
    if (d.type === "init") { M = await loadMaster(d.wasm); self.postMessage({ type: "ready" }); return; }

    if (d.type === "measure") {
      const { l, r, fs } = await readTrack(d.file, null);
      const st = stats(l, r, fs), rep = mixCheck(l, r, fs);
      reply({ type: "measured", seconds: l.length / fs, fs, lufs: st.lufs, peakDb: st.peakDb, peaks: st.peaks, trim: findTrim(l, r, fs),
        mix: { findings: rep.findings, problems: rep.summary.problems, warnings: rep.summary.warnings } });
      return;
    }

    if (d.type === "learn") {
      const { l, r, fs } = await readTrack(d.file, d.cut);
      reply({ type: "learned", learned: M.learnOffline(l, r, fs, d.settings) });
      return;
    }

    if (d.type === "tune" || d.type === "render") {
      const { l, r, fs } = await readTrack(d.file, d.cut);
      const learned = d.learned ?? M.learnOffline(l, r, fs, d.settings);
      // tuning is the background check (two renders at most); the export gets three
      const res = renderTuned(l, r, fs, d.settings, learned, d.type === "tune" ? 2 : 3);
      const [ol, or] = res.out;
      fades(ol, or, fs, d.cut?.fadeIn ?? 0, d.cut?.fadeOut ?? 0);
      const st = stats(ol, or, fs);
      if (d.type === "tune") { reply({ type: "tuned", learned: res.learned, lufs: res.lufs, peakDb: st.peakDb, peaks: st.peaks }); return; }
      const wavs = {};
      for (const bits of d.wav ?? []) wavs[bits] = wavFile(ol, or, fs, bits, d.meta ?? {}, d.art ?? null);
      const msg = { type: "rendered", learned: res.learned, lufs: st.lufs, peakDb: st.peakDb, seconds: ol.length / fs, fs, wavs };
      if (d.pcm) reply({ ...msg, l: ol, r: or }, [ol.buffer, or.buffer]); else reply(msg);
      return;
    }
  } catch (err) {
    reply({ type: "error", message: err?.message ?? String(err) });
  }
};
