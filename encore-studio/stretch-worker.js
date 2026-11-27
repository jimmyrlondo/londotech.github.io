// ENCORE. Green Room: renders a whole song (or a part of it) through the stretch engine off the main
// thread, for exports. The same code as the live player, so the file sounds like the preview.
//   in:  { chans, fs, tempo, pitch, outFs?, start?, end?, fx?: { vocal, focus } }
//   out: { type: "progress", pct } ... then { type: "done", chans, fs }
import { renderStretched, PlayerFx } from "./stretch-core.js";

self.onmessage = (e) => {
  const m = e.data;
  try {
    const outFs = m.outFs || m.fs;
    let fx = null;
    if (m.fx && (m.fx.vocal > 0 || (m.fx.focus && m.fx.focus !== "off"))) { fx = new PlayerFx(outFs); fx.set(m.fx); }
    let last = -1;
    const chans = renderStretched(m.chans, m.fs, {
      tempo: m.tempo, pitch: m.pitch, outFs, start: m.start || 0, end: m.end || m.chans[0].length, fx,
      onProgress: (p) => { const pct = Math.floor(p * 100); if (pct !== last) { last = pct; self.postMessage({ type: "progress", pct }); } },
    });
    self.postMessage({ type: "done", chans, fs: outFs }, chans.map((c) => c.buffer));
  } catch (err) {
    self.postMessage({ type: "error", message: String(err && err.message || err) });
  }
};
