// ENCORE. Slowed + Reverb: the page. Live preview through the shared stretch player (an AudioWorklet)
// and the Web Audio effect chain; export renders the whole song offline with the same engine.
import { ACCEPT, AUDIO_EXT } from "./audio-decode.js";
import { openAudio } from "./load-progress.js";
import { peaks, fmtTime, encodeWav, Limiter } from "./stretch-core.js";
import { DEFAULTS, PRESETS, REVERBS, presetSettings, matchPreset, sanitize, rates, semitones, lowpassHz,
         makeDemoSong, exportName, trimTail, peakDb } from "./slowed-core.js";
import { buildFx } from "./slowed-fx.js";

const $ = (id) => document.getElementById(id);
const KEY = "encore-slowed-settings";
let S = { ...DEFAULTS };
try { const j = JSON.parse(localStorage.getItem(KEY) || "null"); if (j) S = sanitize(j); } catch {}

let song = null; // { name, chans, fs, dur }
let ctx = null, player = null, fx = null, limiter = null, audioReady = null;
let playing = false, pos = 0, original = false, exporting = false;
let wavePeaks = null, lastErr = "";

// ------------------------------------------------------------------ audio
function ensureAudio() {
  if (audioReady) return audioReady;
  audioReady = (async () => {
    ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: "playback" });
    await ctx.audioWorklet.addModule("stretch-worklet.js");
    player = new AudioWorkletNode(ctx, "encore-stretch", { numberOfInputs: 0, outputChannelCount: [2] });
    limiter = new AudioWorkletNode(ctx, "encore-limiter", { numberOfInputs: 1, outputChannelCount: [2] });
    fx = buildFx(ctx, S);
    player.connect(fx.input); fx.output.connect(limiter); limiter.connect(ctx.destination);
    fx.start(0);
    player.port.onmessage = (e) => {
      const m = e.data;
      if (m.type === "pos") { pos = m.pos; if (!m.playing && playing && !original) { /* paused by the player */ } drawWave(); showTimes(); }
      else if (m.type === "ended") { playing = false; pos = song ? song.dur : 0; showPlay(); drawWave(); showTimes(); }
    };
    sendRates();
  })();
  audioReady.catch((e) => showErr("This browser couldn't start audio: " + e.message));
  return audioReady;
}
function sendRates() {
  if (!player) return;
  const r = original ? { tempo: 1, pitch: 1 } : rates(S);
  player.port.postMessage({ type: "rates", ...r });
  fx && fx.set(S, original);
}

// ------------------------------------------------------------------ loading
async function loadFile(file) {
  if (!file) return;
  if (!AUDIO_EXT.test(file.name || "") && !(file.type || "").startsWith("audio")) { showErr("That doesn't look like an audio file. Try MP3, WAV, FLAC, M4A or OGG."); return; }
  hideErr();
  $("songName").textContent = "Opening " + file.name + "...";
  try {
    await ensureAudio();
    const d = await openAudio(file, null, (t) => { $("songName").textContent = t; });
    setSong(file.name, d.chans, d.fs);
  } catch (e) {
    $("songName").textContent = song ? song.name : "No song yet";
    showErr(e.message || "Couldn't open that file.");
  }
}
async function loadDemo() {
  hideErr();
  await ensureAudio();
  const fs = 48000;
  setSong("ENCORE. demo beat", makeDemoSong(fs, 20), fs);
}
function setSong(name, chans, fs) {
  if (chans.length > 2) chans = chans.slice(0, 2);
  song = { name, chans, fs, dur: chans[0].length / fs };
  playing = false; pos = 0;
  player.port.postMessage({ type: "pause" });
  player.port.postMessage({ type: "load", chans: chans.map((c) => c.slice()), fs });
  sendRates();
  $("songName").textContent = name;
  $("drop").classList.add("hidden");
  $("waveBox").classList.remove("hidden");
  for (const id of ["playBtn", "restartBtn", "abBtn", "exportBtn"]) $(id).disabled = false;
  wavePeaks = null;
  $("files").innerHTML = ""; $("expStatus").textContent = "";
  showPlay(); showMeta(); drawWave(); showTimes();
}

// ------------------------------------------------------------------ transport
async function togglePlay() {
  if (!song) return;
  await ensureAudio();
  if (ctx.state !== "running") await ctx.resume();
  playing = !playing;
  player.port.postMessage({ type: playing ? "play" : "pause" });
  showPlay();
}
function seek(t) {
  if (!song || !player) return;
  pos = Math.max(0, Math.min(song.dur, t));
  player.port.postMessage({ type: "seek", pos });
  drawWave(); showTimes();
}
function setOriginal(on) {
  if (!song) return;
  original = on;
  $("abBtn").classList.toggle("on", on);
  $("abBtn").textContent = on ? "Hearing original" : "Hear original";
  sendRates();
}

// ------------------------------------------------------------------ settings
function apply(next, { fromPreset = false } = {}) {
  S = sanitize({ ...S, ...next });
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {}
  if (original && !fromPreset) setOriginal(false);
  if (fromPreset && original) setOriginal(false);
  sendRates();
  showSettings();
}
function showSettings() {
  $("speed").value = S.speed;
  const st = semitones(S);
  $("speedOut").textContent = `${S.speed.toFixed(2)}x` + (S.keepPitch || Math.abs(st) < 0.05 ? "" : ` (${st > 0 ? "+" : ""}${st.toFixed(1)} semitones)`);
  $("keepPitch").checked = S.keepPitch;
  $("pitchTip").textContent = S.keepPitch ? "Keep the key: only the speed changes. Every note stays where it was." : "Vinyl style: slower is lower, faster is higher, like a record.";
  $("underwater").value = S.underwater;
  const hz = lowpassHz(S.underwater);
  $("uwOut").textContent = hz ? (hz >= 1000 ? (hz / 1000).toFixed(1) + " kHz" : hz + " Hz") : "off";
  $("bass").value = S.bass; $("bassOut").textContent = (S.bass ? "+" : "") + S.bass + " dB";
  $("rotate").value = S.rotate; $("rotOut").textContent = S.rotate > 0 ? `one turn every ${(1 / S.rotate).toFixed(0)} s` : "off";
  $("crackle").value = S.crackle; $("crOut").textContent = S.crackle > 0 ? Math.round(S.crackle * 100) + "%" : "off";
  $("mix").value = S.mix; $("mixOut").textContent = Math.round(S.mix * 100) + "%";
  $("length").value = S.length; $("lenOut").textContent = S.length.toFixed(2).replace(/0$/, "") + "x";
  $("clean").checked = S.clean;
  for (const b of $("revType").children) b.classList.toggle("on", b.dataset.r === S.reverb);
  for (const b of $("speedQuick").children) b.classList.toggle("on", Math.abs(+b.dataset.v - S.speed) < 0.001);
  const pid = matchPreset(S);
  for (const b of $("presets").children) b.classList.toggle("on", b.dataset.p === pid);
  $("revTip").textContent = S.reverb === "off" ? "No reverb. Pick a space above." : `${REVERBS[S.reverb].name}: rings for about ${(REVERBS[S.reverb].T * S.length).toFixed(1)} seconds. At 50% the song and the reverb are both at full level.`;
  showMeta(); showTimes();
}
function showMeta() {
  if (!song) { $("songMeta").textContent = ""; return; }
  const out = song.dur / S.speed;
  $("songMeta").textContent = `${fmtTime(song.dur)} → ${fmtTime(out)} · ${(song.fs / 1000).toFixed(1)} kHz`;
}
function showTimes() {
  if (!song) return;
  const sp = original ? 1 : S.speed;
  $("tNow").textContent = fmtTime(pos / sp);
  $("tLen").textContent = fmtTime(song.dur / sp);
}
function showPlay() { $("playBtn").textContent = playing ? "Pause" : "Play"; }

// ------------------------------------------------------------------ waveform
function drawWave() {
  const cv = $("wave");
  if (!song || cv.offsetParent === null) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1), w = Math.max(50, Math.round(cv.clientWidth * dpr)), h = Math.round(cv.clientHeight * dpr);
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; wavePeaks = null; }
  if (!wavePeaks) wavePeaks = peaks(song.chans, w);
  const g = cv.getContext("2d");
  g.clearRect(0, 0, w, h);
  const mid = h / 2, px = Math.round((pos / song.dur) * w);
  for (let x = 0; x < w; x++) {
    const lo = wavePeaks[2 * x], hi = wavePeaks[2 * x + 1];
    g.fillStyle = x <= px ? "#ff3b00" : "#6b6460";
    g.fillRect(x, mid - hi * mid * 0.95, 1, Math.max(1, (hi - lo) * mid * 0.95));
  }
  g.fillStyle = "#fff"; g.fillRect(Math.min(w - 2, px), 0, 2 * dpr, h);
}
function waveSeek(e) {
  if (!song) return;
  const r = $("wave").getBoundingClientRect();
  seek(((e.clientX - r.left) / r.width) * song.dur);
}

// ------------------------------------------------------------------ export
function runWorker(msg, transfer, onProgress) {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL("stretch-worker.js", import.meta.url), { type: "module" });
    w.onmessage = (e) => {
      const m = e.data;
      if (m.type === "progress") onProgress && onProgress(m.pct);
      else { w.terminate(); m.type === "done" ? resolve(m) : reject(new Error(m.message)); }
    };
    w.onerror = (e) => { w.terminate(); reject(new Error(e.message || "The export stopped unexpectedly.")); };
    w.postMessage(msg, transfer);
  });
}
function encodeMp3(l, r, fs, onProgress) {
  return new Promise((resolve, reject) => {
    const w = new Worker("mp3-worker.js");
    w.onmessage = (e) => { if (e.data.type === "progress") onProgress(e.data.pct); else { w.terminate(); resolve(e.data.mp3); } };
    w.onerror = (e) => { w.terminate(); reject(new Error(e.message || "MP3 encoding failed.")); };
    w.postMessage({ l, r, fs, kbps: 320 });
  });
}
function limitOffline(chans, fs) {
  const lim = new Limiter(fs), la = lim.latency, n = chans[0].length;
  const L = new Float32Array(n + la), R = new Float32Array(n + la);
  L.set(chans[0]); R.set(chans[1]);
  lim.process(L, R, 0, n + la);
  return [L.subarray(la), R.subarray(la)];
}
async function exportSong() {
  if (!song || exporting) return;
  exporting = true;
  const s = { ...S }, fmt = $("fmt").value, fs = song.fs;
  const prog = (p, t) => { $("expFill").style.width = Math.round(p) + "%"; if (t) $("expStatus").textContent = t; };
  $("exportBtn").disabled = true; $("expBar").classList.remove("hidden"); $("expErr").classList.add("hidden");
  const t0 = performance.now();
  try {
    const { tempo, pitch } = rates(s);
    let chans;
    if (Math.abs(tempo - 1) < 1e-6 && Math.abs(pitch - 1) < 1e-6) chans = song.chans.length > 1 ? song.chans : [song.chans[0], song.chans[0]];
    else {
      prog(0, s.keepPitch ? "Changing the speed (keeping the key)..." : "Changing the speed...");
      const src = song.chans.map((c) => c.slice());
      const r = await runWorker({ chans: src, fs, tempo, pitch }, src.map((c) => c.buffer), (p) => prog(p * 0.6));
      chans = r.chans;
    }
    prog(60, "Adding the reverb and effects...");
    const tmp = buildFx(new OfflineAudioContext(2, 1, fs), s);
    const tail = Math.ceil(tmp.irSeconds() * fs);
    const oac = new OfflineAudioContext(2, chans[0].length + tail, fs);
    const buf = oac.createBuffer(2, chans[0].length, fs);
    buf.copyToChannel(chans[0], 0); buf.copyToChannel(chans[1] || chans[0], 1);
    const src = oac.createBufferSource(); src.buffer = buf;
    const chain = buildFx(oac, s);
    src.connect(chain.input); chain.output.connect(oac.destination);
    chain.start(0); src.start(0);
    const rendered = await oac.startRendering();
    prog(80, "Making sure nothing clips...");
    let out = limitOffline([rendered.getChannelData(0), rendered.getChannelData(1)], fs);
    out = trimTail(out, fs, chans[0].length);
    const name = exportName(song.name, s, fmt === "mp3" ? "mp3" : "wav");
    let blob;
    if (fmt === "mp3") {
      let l = out[0], r = out[1], mfs = fs;
      if (![32000, 44100, 48000].includes(fs)) {
        prog(85, "Converting the sample rate for MP3...");
        const rs = await runWorker({ chans: [l.slice(), r.slice()], fs, tempo: 1, pitch: 1, outFs: 48000 }, []);
        l = rs.chans[0]; r = rs.chans[1]; mfs = 48000;
      }
      prog(88, "Encoding MP3...");
      const mp3 = await encodeMp3(l, r, mfs, (p) => prog(88 + p * 0.12, `Encoding MP3... ${p}%`));
      blob = new Blob([mp3], { type: "audio/mpeg" });
    } else {
      prog(92, "Writing the WAV...");
      blob = new Blob([encodeWav(out, fs, fmt === "wav24" ? 24 : 16)], { type: "audio/wav" });
    }
    prog(100, `Done in ${((performance.now() - t0) / 1000).toFixed(1)} s: ${fmtTime(out[0].length / fs)}, peak ${peakDb(out).toFixed(1)} dBFS.`);
    addDownload(blob, name);
  } catch (e) {
    $("expErr").textContent = "Export failed: " + (e.message || e) + (/memory|allocation|Array buffer/i.test(String(e)) ? " The song may be too long for this device's memory." : "");
    $("expErr").classList.remove("hidden");
    $("expStatus").textContent = "";
  } finally {
    exporting = false; $("exportBtn").disabled = !song;
    setTimeout(() => $("expBar").classList.add("hidden"), 800);
  }
}
function addDownload(blob, name) {
  const url = URL.createObjectURL(blob);
  const li = document.createElement("li");
  const a = document.createElement("a"); a.href = url; a.download = name; a.textContent = name;
  const sz = document.createElement("small"); sz.textContent = (blob.size / 1048576).toFixed(1) + " MB";
  li.append(a, sz);
  $("files").prepend(li);
  a.click();
}

// ------------------------------------------------------------------ errors
function showErr(t) { lastErr = t; $("err").textContent = t; $("err").classList.remove("hidden"); }
function hideErr() { $("err").classList.add("hidden"); }

// ------------------------------------------------------------------ wiring
function build() {
  PRESETS.forEach((p, i) => {
    const b = document.createElement("button");
    b.textContent = p.name; b.dataset.p = p.id; b.title = `${p.name} (${i + 1})`;
    b.onclick = () => apply(presetSettings(p.id), { fromPreset: true });
    $("presets").append(b);
  });
  for (const v of [0.75, 0.8, 0.85, 0.9, 1, 1.1, 1.25, 1.3]) {
    const b = document.createElement("button"); b.dataset.v = v; b.textContent = v.toFixed(2) + "x";
    b.onclick = () => apply({ speed: v });
    $("speedQuick").append(b);
  }
  for (const [id, name] of [["off", "Off"], ...Object.entries(REVERBS).map(([k, r]) => [k, r.name])]) {
    const b = document.createElement("button"); b.dataset.r = id; b.textContent = name;
    b.onclick = () => apply({ reverb: id, mix: id !== "off" && S.mix === 0 ? 0.3 : S.mix });
    $("revType").append(b);
  }
  for (const id of ["speed", "underwater", "bass", "rotate", "crackle", "mix", "length"]) $(id).addEventListener("input", (e) => apply({ [id]: +e.target.value }));
  $("keepPitch").addEventListener("change", (e) => apply({ keepPitch: e.target.checked }));
  $("clean").addEventListener("change", (e) => apply({ clean: e.target.checked }));

  $("file").accept = ACCEPT;
  $("openBtn").onclick = $("swapBtn").onclick = () => $("file").click();
  $("file").addEventListener("change", (e) => { const f = e.target.files[0]; e.target.value = ""; loadFile(f); });
  $("demoBtn").onclick = loadDemo;
  $("playBtn").onclick = togglePlay;
  $("restartBtn").onclick = () => seek(0);
  $("abBtn").onclick = () => setOriginal(!original);
  $("exportBtn").onclick = exportSong;

  const drop = document.querySelector(".panel");
  drop.addEventListener("dragover", (e) => { e.preventDefault(); $("drop").classList.add("over"); });
  drop.addEventListener("dragleave", () => $("drop").classList.remove("over"));
  drop.addEventListener("drop", (e) => { e.preventDefault(); $("drop").classList.remove("over"); const f = e.dataTransfer.files[0]; if (f) loadFile(f); });

  const cv = $("wave");
  let dragging = false;
  cv.addEventListener("pointerdown", (e) => { dragging = true; try { cv.setPointerCapture(e.pointerId); } catch {} waveSeek(e); });
  cv.addEventListener("pointermove", (e) => { if (dragging) waveSeek(e); });
  const up = () => { dragging = false; };
  cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);

  document.querySelectorAll(".tabBar button").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll(".tabBar button").forEach((x) => x.classList.toggle("on", x === b));
    document.querySelectorAll(".tabBody > section").forEach((s) => s.classList.toggle("show", s.dataset.tab === b.dataset.tab));
  }));

  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t && (t.tagName === "INPUT" && t.type !== "range" && t.type !== "checkbox" || t.tagName === "SELECT" || t.tagName === "TEXTAREA")) return;
    if (e.code === "Space") { e.preventDefault(); togglePlay(); }
    else if (e.key === "b" || e.key === "B") setOriginal(!original);
    else if (e.key === "ArrowLeft" && t.type !== "range") { e.preventDefault(); seek(pos - 5); }
    else if (e.key === "ArrowRight" && t.type !== "range") { e.preventDefault(); seek(pos + 5); }
    else if (e.key === "Home") { e.preventDefault(); seek(0); }
    else if (/^[1-8]$/.test(e.key)) { const p = PRESETS[+e.key - 1]; apply(presetSettings(p.id), { fromPreset: true }); }
  });
  window.addEventListener("resize", () => { wavePeaks = null; drawWave(); });
  showSettings();
}
build();

// a peek for the browser tests
window.__slowed = () => ({ settings: { ...S }, song: song && { name: song.name, dur: song.dur, fs: song.fs }, playing, pos, original, exporting, preset: matchPreset(S), error: lastErr, ctx: ctx && ctx.state });
