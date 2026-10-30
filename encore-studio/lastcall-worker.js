// Encore Last Call background thread: measures one decoded song at a time so
// the page stays responsive on long files.
//
// Messages in:   analyze { id, chans: [Float32Array...], fs, bitDepth, float }
// Messages out:  progress { id, fraction }   done { id, m }   error { id, message }
import { analyze } from "./lastcall-core.js";

self.onmessage = (e) => {
  const { id, chans, fs, bitDepth, float } = e.data;
  try {
    let last = 0;
    const m = analyze(chans, fs, {
      bitDepth, float,
      onProgress: (fraction) => { if (fraction - last >= 0.04 || fraction === 1) { last = fraction; self.postMessage({ type: "progress", id, fraction }); } },
    });
    self.postMessage({ type: "done", id, m });
  } catch (err) {
    self.postMessage({ type: "error", id, message: String(err?.message || err) });
  }
};
