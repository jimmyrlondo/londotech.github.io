// MP3 encoding off the main thread (classic worker so it can load lamejs).
// lamejs (LGPL-3.0) is kept as a separate file: vendor/lame.min.js
importScripts("vendor/lame.min.js");

self.onmessage = (e) => {
  const { l, r, fs, kbps } = e.data;
  const encoder = new lamejs.Mp3Encoder(2, fs, kbps);
  const n = l.length, block = 1152 * 20, chunks = [];
  const L = new Int16Array(block), R = new Int16Array(block);
  let seed = 33333;
  const rng = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const q = (x) => Math.max(-32768, Math.min(32767, Math.round(x * 32767 + rng() - rng()))); // TPDF dither
  let lastReport = 0;
  for (let start = 0; start < n; start += block) {
    const len = Math.min(block, n - start);
    for (let i = 0; i < len; i++) { L[i] = q(l[start + i]); R[i] = q(r[start + i]); }
    const out = encoder.encodeBuffer(L.subarray(0, len), R.subarray(0, len));
    if (out.length) chunks.push(new Uint8Array(out));
    const pct = Math.floor(((start + len) / n) * 100);
    if (pct >= lastReport + 5) { lastReport = pct; self.postMessage({ type: "progress", pct }); }
  }
  const tail = encoder.flush();
  if (tail.length) chunks.push(new Uint8Array(tail));
  const size = chunks.reduce((a, c) => a + c.length, 0), mp3 = new Uint8Array(size);
  let o = 0;
  for (const c of chunks) { mp3.set(c, o); o += c.length; }
  self.postMessage({ type: "done", mp3 }, [mp3.buffer]);
};
