// ENCORE. Chip: renders the song for export off the main thread (module worker).
import { renderSong } from "./chip-synth.js";

self.onmessage = (e) => {
  const { project, sr, stems, loops, tail } = e.data;
  try {
    const r = renderSong(project, sr, { stems, loops, tail, onProgress: (p) => self.postMessage({ type: "progress", pct: Math.round(p * 100) }) });
    const transfer = [r.L.buffer, r.R.buffer, ...(r.chans ? r.chans.map((c) => c.buffer) : [])];
    self.postMessage({ type: "done", ...r }, transfer);
  } catch (err) { self.postMessage({ type: "error", message: String(err && err.message || err) }); }
};
