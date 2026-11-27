// ENCORE. Clips: recording a video in the browser. A canvas is painted frame by frame
// while the clip's audio plays into a recorder (MediaRecorder), so a 30 second clip
// takes 30 seconds. Nothing leaves the computer.
import { mimeCandidates, extFor, fadeGain } from "./clips-core.js";

/** The best format this browser can record, or "" if it can't record at all */
export function pickMime(audio) {
  if (typeof MediaRecorder === "undefined") return "";
  return mimeCandidates(audio).find((m) => { try { return MediaRecorder.isTypeSupported(m); } catch { return false; } }) || "";
}
export function canRecord() {
  return typeof MediaRecorder !== "undefined" && typeof HTMLCanvasElement !== "undefined" && "captureStream" in HTMLCanvasElement.prototype;
}

/** A steady clock that keeps ticking when the tab is in the background (timers in a tiny worker) */
function ticker(fps, onTick) {
  let worker = null, raf = 0, stopped = false;
  try {
    const src = `let id=0;onmessage=(e)=>{clearInterval(id);if(e.data>0)id=setInterval(()=>postMessage(0),e.data)}`;
    const url = URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
    worker = new Worker(url); URL.revokeObjectURL(url);
    worker.onmessage = () => { if (!stopped) onTick(); };
    worker.postMessage(Math.floor(1000 / fps / 2));
  } catch { worker = null; }
  if (!worker) { const loop = () => { if (stopped) return; onTick(); raf = requestAnimationFrame(loop); }; raf = requestAnimationFrame(loop); }
  return () => { stopped = true; if (worker) { worker.postMessage(0); worker.terminate(); } cancelAnimationFrame(raf); };
}

/** The clip's audio, cut from the song, with short fades in and out */
export function clipBuffer(actx, chans, fs, start, len) {
  const a = Math.max(0, Math.floor(start * fs)), n = Math.max(1, Math.min(chans[0].length - a, Math.round(len * fs)));
  const buf = actx.createBuffer(Math.min(2, chans.length), n, fs);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const src = chans[c], out = buf.getChannelData(c);
    for (let i = 0; i < n; i++) out[i] = src[a + i] * fadeGain(i / fs, n / fs);
  }
  return buf;
}

/**
 * Record one video. draw(ctx, t) paints the frame for t seconds into the clip.
 * audio: { actx, buffer } or null for a silent video (a Spotify Canvas).
 * Resolves to { blob, mime, ext, seconds } or rejects with an Error("cancelled") when signal aborts.
 */
export function recordVideo({ w, h, seconds, draw, audio = null, fps = 30, bitrate = 0, onProgress = () => {}, signal = null }) {
  return new Promise((resolve, reject) => {
    const mime = pickMime(!!audio);
    if (!mime) { reject(new Error("This browser can't record video. Try the latest Chrome or Edge.")); return; }
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d", { alpha: false });
    draw(ctx, 0);
    const stream = canvas.captureStream(fps);
    let src = null, dest = null;
    if (audio) {
      dest = audio.actx.createMediaStreamDestination();
      src = audio.actx.createBufferSource(); src.buffer = audio.buffer; src.connect(dest);
      for (const tr of dest.stream.getAudioTracks()) stream.addTrack(tr);
    }
    const px = w * h;
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bitrate || (px >= 1920 * 1080 * 0.9 ? 10_000_000 : 7_000_000), ...(audio ? { audioBitsPerSecond: 192_000 } : {}) });
    const chunks = [];
    let cancelled = false, stopTick = () => {}, finished = false;
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onerror = (e) => { cleanup(); reject(new Error("The recorder stopped: " + (e.error?.message || "unknown problem"))); };
    rec.onstop = () => {
      cleanup();
      if (cancelled) { reject(new Error("cancelled")); return; }
      const type = mime.split(";")[0];
      resolve({ blob: new Blob(chunks, { type }), mime, ext: extFor(mime), seconds });
    };
    function cleanup() {
      stopTick();
      try { src?.stop(); } catch {}
      try { src?.disconnect(); } catch {}
      for (const tr of stream.getTracks()) tr.stop();
      signal?.removeEventListener("abort", onAbort);
    }
    function onAbort() { cancelled = true; if (rec.state !== "inactive") rec.stop(); else { cleanup(); reject(new Error("cancelled")); } }
    signal?.addEventListener("abort", onAbort);
    if (signal?.aborted) { onAbort(); return; }

    rec.start(1000);
    let clock;
    if (audio) {
      const t0 = audio.actx.currentTime + 0.08;
      src.start(t0);
      clock = () => audio.actx.currentTime - t0;
    } else {
      const t0 = performance.now() + 80;
      clock = () => (performance.now() - t0) / 1000;
    }
    let lastFrame = -1;
    stopTick = ticker(fps, () => {
      if (finished) return;
      const t = clock();
      if (t < 0) return;
      if (t >= seconds) {
        finished = true;
        draw(ctx, Math.max(0, seconds - 1 / fps));
        onProgress(1);
        setTimeout(() => { if (rec.state !== "inactive") rec.stop(); }, 120);
        return;
      }
      const f = Math.floor(t * fps);
      if (f === lastFrame) return;
      lastFrame = f;
      draw(ctx, f / fps);
      onProgress(t / seconds);
    });
  });
}

/** Read a finished video back: size, length and how bright a frame in the middle is (to catch black frames) */
export async function inspectVideo(blob) {
  const url = URL.createObjectURL(blob), v = document.createElement("video");
  v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = url;
  try {
    await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error("can't read it back")); setTimeout(() => rej(new Error("timed out")), 10000); });
    let duration = v.duration;
    if (!Number.isFinite(duration)) {   // WebM from a recorder often leaves the length out
      await new Promise((res) => { v.ondurationchange = () => { if (Number.isFinite(v.duration)) res(); }; v.currentTime = 1e7; setTimeout(res, 4000); });
      duration = v.duration;
    }
    const seek = (t) => new Promise((res) => { v.onseeked = res; v.currentTime = t; setTimeout(res, 3000); });
    const c = document.createElement("canvas"); c.width = 48; c.height = 48;
    const g = c.getContext("2d", { willReadFrequently: true });
    const bright = [];
    for (const k of [0.25, 0.6]) {
      await seek(Math.max(0, (Number.isFinite(duration) ? duration : 1) * k));
      g.drawImage(v, 0, 0, 48, 48);
      const d = g.getImageData(0, 0, 48, 48).data;
      let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2];
      bright.push(s / (d.length / 4) / 3);
    }
    return { width: v.videoWidth, height: v.videoHeight, duration, brightness: bright, size: blob.size, type: blob.type };
  } finally { URL.revokeObjectURL(url); }
}
