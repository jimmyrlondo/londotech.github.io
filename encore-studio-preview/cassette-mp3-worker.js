// ENCORE. Cassette: MP3 encoding a whole tape side in pieces, so a 45-minute side never
// has to sit in memory as one block. Classic worker so it can load lamejs.
// lamejs (LGPL-3.0) is kept as a separate file: vendor/lame.min.js
importScripts("vendor/lame.min.js");

let encoder = null, chunks = [], seed = 33333;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const q = (x) => Math.max(-32768, Math.min(32767, Math.round(x * 32767 + rnd() - rnd()))); // TPDF dither

self.onmessage = (e) => {
  const m = e.data;
  if (m.type === "init") { encoder = new lamejs.Mp3Encoder(2, m.fs, m.kbps || 320); chunks = []; return; }
  if (m.type === "chunk") {
    const n = m.l.length, block = 1152 * 16, L = new Int16Array(block), R = new Int16Array(block);
    for (let s = 0; s < n; s += block) {
      const len = Math.min(block, n - s);
      for (let i = 0; i < len; i++) { L[i] = q(m.l[s + i]); R[i] = q(m.r[s + i]); }
      const out = encoder.encodeBuffer(L.subarray(0, len), R.subarray(0, len));
      if (out.length) chunks.push(new Uint8Array(out));
    }
    self.postMessage({ type: "ack" });
    return;
  }
  if (m.type === "end") {
    const tail = encoder.flush();
    if (tail.length) chunks.push(new Uint8Array(tail));
    const blob = new Blob(chunks, { type: "audio/mpeg" });
    chunks = [];
    self.postMessage({ type: "done", blob });
  }
};
