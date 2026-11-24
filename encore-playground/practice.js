// ENCORE. Practice: the page. Plays through the shared stretch player (an AudioWorklet) so speed, key,
// loops and the sound tools all change live. Loops, markers and settings are saved per song.
import { decodeAudio, ACCEPT, AUDIO_EXT } from "./audio-decode.js";
import { peaks, fmtTime, encodeWav, Limiter, pitchRatio } from "./stretch-core.js";
import { makeDemoSong } from "./slowed-core.js";
import { SPEED_MIN, SPEED_MAX, clamp, normLoop, halveLoop, doubleLoop, shiftLoop, trainerStart, trainerLoop, trainerTotal, trainerCfg,
         addMarker, removeMarker, sectionAt, prevMarker, nextMarker, viewWindow, zoomAt, timeToX, xToTime, follow, keyAction,
         DEFAULT_SONG, songKey, sanitizeSong, exportSongData, importSongData, speedLabel, keyLabel, parseTime } from "./practice-core.js";
import * as store from "./practice-store.js";

const $ = (id) => document.getElementById(id);
let song = null; // { name, size, key, chans, fs, dur }
let D = { ...DEFAULT_SONG };
let ctx = null, player = null, audioReady = null;
let playing = false, pos = 0, loopCount = 0;
let view = { start: 0, end: 1 };
let trainer = { on: false, st: null };
let vol = 1;
try { const v = parseFloat(localStorage.getItem("encore-practice-vol")); if (isFinite(v)) vol = clamp(v, 0, 1.5); } catch {}
let overPeaks = null, viewPeaks = null, viewKey = "";
let lastErr = "";

// ------------------------------------------------------------------ audio
function ensureAudio() {
  if (audioReady) return audioReady;
  audioReady = (async () => {
    ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: "playback" });
    await ctx.audioWorklet.addModule("stretch-worklet.js");
    player = new AudioWorkletNode(ctx, "encore-stretch", { numberOfInputs: 0, outputChannelCount: [2] });
    const lim = new AudioWorkletNode(ctx, "encore-limiter", { numberOfInputs: 1, outputChannelCount: [2] });
    player.connect(lim); lim.connect(ctx.destination);
    player.port.onmessage = (e) => onPlayer(e.data);
    player.port.postMessage({ type: "volume", v: vol });
  })();
  audioReady.catch((e) => showErr("This browser couldn't start audio: " + e.message));
  return audioReady;
}
function onPlayer(m) {
  if (m.type === "pos") {
    pos = m.pos;
    if (playing) view = follow(view, pos, song ? song.dur : 1);
    redraw();
  } else if (m.type === "looped") {
    loopCount = m.count;
    if (trainer.on) {
      trainer.st = trainerLoop(trainer.st, trainerCfgNow());
      setSpeed(trainer.st.speed, { fromTrainer: true });
      if (trainer.st.done) { trainer.on = false; $("trStatus").textContent = `Done: you're playing it at ${speedLabel(trainer.st.speed)}. Nice.`; showTrainer(); }
      else showTrainer();
    }
    showClock();
  } else if (m.type === "ended") { playing = false; pos = song ? song.dur : 0; showPlay(); redraw(); }
}
const send = (m) => player && player.port.postMessage(m);
function sendRates() { send({ type: "rates", tempo: D.speed, pitch: pitchRatio(D.semis, D.cents) }); }
function sendLoop(jump = false) {
  const l = D.loop;
  send({ type: "loop", on: !!(D.loopOn && l), a: l ? l.a : 0, b: l ? l.b : 0, gap: D.gap, jump });
}
function sendFx() { send({ type: "fx", vocal: D.vocal, focus: D.focus }); }

// ------------------------------------------------------------------ saving
let saveTimer = 0;
function save() {
  if (!song) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { store.saveSong(song.key, { ...D, pos }).catch(() => {}); }, 400);
}

// ------------------------------------------------------------------ loading
async function loadFile(file, fromRecent = false) {
  if (!file) return;
  if (!AUDIO_EXT.test(file.name || "") && !(file.type || "").startsWith("audio")) { showErr("That doesn't look like an audio file. Try MP3, WAV, FLAC, M4A or OGG."); return; }
  hideErr();
  $("songName").textContent = "Opening " + file.name + "...";
  try {
    await ensureAudio();
    const d = await decodeAudio(file, null, (t) => { $("songName").textContent = t; });
    const dur = d.chans[0].length / d.fs, key = songKey(file.name, file.size, dur);
    const saved = await store.loadSong(key).catch(() => null);
    setSong({ name: file.name, size: file.size, key, chans: d.chans, fs: d.fs, dur }, sanitizeSong(saved, dur));
    store.rememberFile(key, file, dur).catch(() => {});
  } catch (e) {
    $("songName").textContent = song ? song.name : "No song yet";
    showErr(e.message || "Couldn't open that file.");
  }
}
async function loadDemo() {
  hideErr();
  await ensureAudio();
  const fs = 48000, chans = makeDemoSong(fs, 20), dur = 20, key = songKey("ENCORE. demo song", 0, dur);
  const saved = await store.loadSong(key).catch(() => null);
  setSong({ name: "ENCORE. demo song", size: 0, key, chans, fs, dur }, sanitizeSong(saved, dur));
}
function setSong(s, data) {
  if (s.chans.length > 2) s.chans = s.chans.slice(0, 2);
  song = s; D = data;
  playing = false; loopCount = 0; trainer = { on: false, st: null };
  send({ type: "pause" });
  send({ type: "load", chans: s.chans.map((c) => c.slice()), fs: s.fs });
  sendRates(); sendFx(); sendLoop();
  pos = D.pos || 0; send({ type: "seek", pos });
  view = viewWindow(0, s.dur, s.dur);
  overPeaks = null; viewKey = "";
  $("songName").textContent = s.name;
  $("drop").classList.add("hidden"); $("player").classList.remove("hidden"); $("swapBtn").classList.remove("hidden");
  $("dlStatus").textContent = "";
  showAll();
}

// ------------------------------------------------------------------ transport and loop
async function togglePlay() {
  if (!song) return;
  await ensureAudio();
  if (ctx.state !== "running") await ctx.resume();
  playing = !playing;
  send({ type: playing ? "play" : "pause" });
  showPlay();
  if (!playing) save();
}
function seek(t) {
  if (!song) return;
  pos = clamp(t, 0, song.dur);
  loopCount = 0;
  send({ type: "seek", pos });
  view = follow(view, pos, song.dur);
  redraw(); showClock();
}
function setLoop(l, { on = true, jump = false } = {}) {
  if (!song) return;
  D.loop = l ? normLoop(l.a, l.b, song.dur) : null;
  D.loopOn = !!(on && D.loop);
  loopCount = 0;
  sendLoop(jump);
  save(); showLoop(); redraw();
}
function setA() {
  if (!song) return;
  const b = D.loop && D.loop.b > pos + 0.1 ? D.loop.b : Math.min(song.dur, pos + 4);
  setLoop({ a: pos, b }, { on: D.loopOn || !D.loop });
}
function setB() {
  if (!song) return;
  const a = D.loop && D.loop.a < pos - 0.1 ? D.loop.a : Math.max(0, pos - 4);
  setLoop({ a, b: pos }, { on: true, jump: true });
  if (playing) seek(D.loop.a);
}
function toggleLoop() {
  if (!song) return;
  if (!D.loop) { setLoop({ a: pos, b: Math.min(song.dur, pos + 4) }); return; }
  setLoop(D.loop, { on: !D.loopOn, jump: true });
}
function restart() { seek(D.loopOn && D.loop ? D.loop.a : 0); }

// ------------------------------------------------------------------ speed, key, sound
function setSpeed(v, { fromTrainer = false } = {}) {
  D.speed = Math.round(clamp(v, SPEED_MIN, SPEED_MAX) * 100) / 100;
  if (!fromTrainer && trainer.on) { trainer.on = false; $("trStatus").textContent = "Trainer stopped (you changed the speed)."; showTrainer(); }
  sendRates(); save(); showSound();
}
function setKey(semis, cents = D.cents) {
  D.semis = Math.round(clamp(semis, -12, 12)); D.cents = Math.round(clamp(cents, -50, 50));
  sendRates(); save(); showSound();
}
function setVocal(v) { D.vocal = clamp(v, 0, 1); sendFx(); save(); showSound(); }
function setFocus(f) { D.focus = f; sendFx(); save(); showSound(); }

// ------------------------------------------------------------------ trainer
function trainerCfgNow() { return { start: +$("trStart").value, step: +$("trStep").value, every: +$("trEvery").value, target: +$("trTarget").value }; }
async function toggleTrainer() {
  if (!song) return;
  if (trainer.on) { trainer.on = false; $("trStatus").textContent = "Trainer stopped."; showTrainer(); return; }
  if (!D.loop) { $("trStatus").textContent = "Make a loop first: drag across the waveform, or press [ and ]."; return; }
  const cfg = trainerCfgNow();
  trainer = { on: true, st: trainerStart(cfg) };
  setLoop(D.loop, { on: true });
  setSpeed(trainer.st.speed, { fromTrainer: true });
  seek(D.loop.a);
  if (!playing) await togglePlay();
  showTrainer();
}
function showTrainer() {
  $("trBtn").textContent = trainer.on ? "Stop the trainer" : "Start the trainer";
  $("trBtn").classList.toggle("on", trainer.on);
  const cfg = trainerCfg(trainerCfgNow());
  if (trainer.on && trainer.st) {
    const done = Math.round((trainer.st.speed - cfg.start) / cfg.step) * cfg.every + trainer.st.loops, total = trainerTotal(cfg) || 1;
    $("trFill").style.width = Math.min(100, (done / total) * 100) + "%";
    $("trStatus").textContent = `Now ${speedLabel(trainer.st.speed)}, ${cfg.every - trainer.st.loops} more ${cfg.every - trainer.st.loops === 1 ? "repeat" : "repeats"} until ${speedLabel(Math.min(cfg.target, trainer.st.speed + cfg.step))}. Goal ${speedLabel(cfg.target)}.`;
  } else if (!trainer.st) {
    $("trFill").style.width = "0%";
    $("trStatus").textContent = `${speedLabel(cfg.start)} to ${speedLabel(cfg.target)} takes ${trainerTotal(cfg)} repeats.`;
  }
}

// ------------------------------------------------------------------ download what you hear
async function download(part) {
  if (!song) return;
  const l = part === "loop" ? D.loop : null;
  if (part === "loop" && !l) { $("dlStatus").textContent = "Make a loop first."; return; }
  const fs = song.fs, start = l ? Math.round(l.a * fs) : 0, end = l ? Math.round(l.b * fs) : song.chans[0].length;
  $("dlBar").classList.remove("hidden"); $("dlFill").style.width = "0%"; $("dlStatus").textContent = "Rendering...";
  for (const id of ["dlLoop", "dlSong"]) $(id).disabled = true;
  try {
    const src = song.chans.map((c) => c.slice(start, end));
    const r = await new Promise((resolve, reject) => {
      const w = new Worker(new URL("stretch-worker.js", import.meta.url), { type: "module" });
      w.onmessage = (e) => { const m = e.data; if (m.type === "progress") $("dlFill").style.width = m.pct + "%"; else { w.terminate(); m.type === "done" ? resolve(m) : reject(new Error(m.message)); } };
      w.onerror = (e) => { w.terminate(); reject(new Error(e.message || "Rendering stopped.")); };
      w.postMessage({ chans: src, fs, tempo: D.speed, pitch: pitchRatio(D.semis, D.cents), fx: { vocal: D.vocal, focus: D.focus } }, src.map((c) => c.buffer));
    });
    const lim = new Limiter(fs), la = lim.latency, n = r.chans[0].length;
    const L = new Float32Array(n + la), R = new Float32Array(n + la);
    L.set(r.chans[0]); R.set(r.chans[1]);
    for (let i = 0; i < n; i++) { L[i] *= vol; R[i] *= vol; }
    lim.process(L, R, 0, n + la);
    const blob = new Blob([encodeWav([L.subarray(la), R.subarray(la)], fs, 16)], { type: "audio/wav" });
    const base = song.name.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[\\/:*?"<>|]+/g, "").slice(0, 70) || "song";
    const bits = [speedLabel(D.speed)];
    if (D.semis || D.cents) bits.push(keyLabel(D.semis, D.cents).replace(/ semitones?/, " st").replace(/ cents/, " c"));
    const name = `${base} (${l ? `loop ${fmtTime(l.a).replace(":", ".")}-${fmtTime(l.b).replace(":", ".")}, ` : ""}${bits.join(", ")}).wav`;
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.append(a); a.click(); a.remove();
    $("dlFill").style.width = "100%";
    $("dlStatus").textContent = `Saved ${name} (${fmtTime(n / fs)}).`;
  } catch (e) {
    $("dlStatus").textContent = "Couldn't render: " + (e.message || e);
  } finally {
    for (const id of ["dlLoop", "dlSong"]) $(id).disabled = false;
    setTimeout(() => $("dlBar").classList.add("hidden"), 800);
  }
}

// ------------------------------------------------------------------ drawing
let drawQueued = false;
function redraw() { if (drawQueued) return; drawQueued = true; requestAnimationFrame(() => { drawQueued = false; drawOver(); drawWave(); showClock(); }); }
function sizeCanvas(cv) {
  const dpr = Math.min(2, window.devicePixelRatio || 1), w = Math.max(50, Math.round(cv.clientWidth * dpr)), h = Math.max(10, Math.round(cv.clientHeight * dpr));
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; return true; }
  return false;
}
function drawOver() {
  const cv = $("over");
  if (!song || cv.offsetParent === null) return;
  if (sizeCanvas(cv)) overPeaks = null;
  const w = cv.width, h = cv.height, g = cv.getContext("2d");
  if (!overPeaks) overPeaks = peaks(song.chans, w);
  g.clearRect(0, 0, w, h);
  const T = (t) => (t / song.dur) * w;
  if (D.loop) { g.fillStyle = D.loopOn ? "rgba(255,59,0,.28)" : "rgba(255,255,255,.08)"; g.fillRect(T(D.loop.a), 0, Math.max(2, T(D.loop.b) - T(D.loop.a)), h); }
  g.fillStyle = "#6b6460";
  for (let x = 0; x < w; x++) { const lo = overPeaks[2 * x], hi = overPeaks[2 * x + 1]; g.fillRect(x, h / 2 - hi * h * 0.48, 1, Math.max(1, (hi - lo) * h * 0.48)); }
  g.fillStyle = "#9a938e";
  for (const m of D.markers) g.fillRect(T(m.t), 0, 1, h);
  g.strokeStyle = "rgba(255,255,255,.7)"; g.lineWidth = 1;
  g.strokeRect(T(view.start) + 0.5, 0.5, Math.max(3, T(view.end) - T(view.start)) - 1, h - 1);
  g.fillStyle = "#fff"; g.fillRect(Math.min(w - 2, T(pos)), 0, 2, h);
}
let dragSel = null; // live selection while dragging
function drawWave() {
  const cv = $("wave");
  if (!song || cv.offsetParent === null) return;
  sizeCanvas(cv);
  const w = cv.width, h = cv.height, g = cv.getContext("2d"), dpr = Math.min(2, window.devicePixelRatio || 1);
  const k = `${view.start.toFixed(4)}:${view.end.toFixed(4)}:${w}`;
  if (k !== viewKey) { viewKey = k; viewPeaks = peaks(song.chans, w, view.start * song.fs, view.end * song.fs); }
  g.clearRect(0, 0, w, h);
  const X = (t) => timeToX(t, view, w);
  const l = dragSel || D.loop;
  if (l) {
    const xa = X(l.a), xb = X(l.b), on = dragSel || D.loopOn;
    g.fillStyle = on ? "rgba(255,59,0,.16)" : "rgba(255,255,255,.06)";
    g.fillRect(xa, 0, xb - xa, h);
    g.fillStyle = on ? "#ff3b00" : "#8a8580";
    g.fillRect(xa - dpr, 0, 2 * dpr, h); g.fillRect(xb - dpr, 0, 2 * dpr, h);
    g.font = `700 ${11 * dpr}px DM Sans, sans-serif`; g.textBaseline = "top";
    g.fillRect(xa, 0, 16 * dpr, 16 * dpr); g.fillRect(xb - 16 * dpr, 0, 16 * dpr, 16 * dpr);
    g.fillStyle = "#fff"; g.fillText("A", xa + 4 * dpr, 2 * dpr); g.fillText("B", xb - 12 * dpr, 2 * dpr);
  }
  const mid = h / 2;
  for (let x = 0; x < w; x++) {
    const lo = viewPeaks[2 * x], hi = viewPeaks[2 * x + 1];
    g.fillStyle = "#8a8580";
    g.fillRect(x, mid - hi * mid * 0.92, 1, Math.max(1, (hi - lo) * mid * 0.92));
  }
  g.font = `600 ${11 * dpr}px DM Sans, sans-serif`; g.textBaseline = "bottom";
  D.markers.forEach((m, i) => {
    const x = X(m.t);
    if (x < -2 || x > w + 2) return;
    g.fillStyle = "#3b82f6"; g.fillRect(x, 18 * dpr, dpr, h - 18 * dpr);
    const label = (i < 9 ? i + 1 + " " : "") + m.name;
    g.fillStyle = "rgba(12,10,9,.75)"; g.fillRect(x + 2 * dpr, h - 17 * dpr, g.measureText(label).width + 6 * dpr, 16 * dpr);
    g.fillStyle = "#cfe0ff"; g.fillText(label, x + 5 * dpr, h - 3 * dpr);
  });
  const px = X(pos);
  if (px >= -2 && px <= w + 2) { g.fillStyle = "#fff"; g.fillRect(px - dpr / 2, 0, 1.5 * dpr, h); }
  $("vStart").textContent = fmtTime(view.start, true); $("vEnd").textContent = fmtTime(view.end, true);
}

// ------------------------------------------------------------------ showing state
function showAll() { showPlay(); showLoop(); showSound(); showMarkers(); showTrainer(); redraw(); }
function showPlay() { $("playBtn").textContent = playing ? "Pause" : "Play"; }
function showClock() {
  if (!song) return;
  $("tNow").textContent = fmtTime(pos, true);
  $("tLen").textContent = "/ " + fmtTime(song.dur);
  $("loopTxt").textContent = D.loop && D.loopOn ? `loop ${fmtTime(D.loop.a, true)} to ${fmtTime(D.loop.b, true)}${loopCount ? ` · x${loopCount + 1}` : ""}` : "";
}
function showLoop() {
  const l = D.loop;
  $("loopBtn").classList.toggle("on", !!(l && D.loopOn));
  $("loopBtn").textContent = l && D.loopOn ? "Loop on" : "Loop";
  if (document.activeElement !== $("aIn")) $("aIn").value = l ? fmtTime(l.a, true) : "";
  if (document.activeElement !== $("bIn")) $("bIn").value = l ? fmtTime(l.b, true) : "";
  $("gap").value = String(D.gap);
  const ul = $("loops"); ul.innerHTML = "";
  D.loops.forEach((sl, i) => {
    const li = document.createElement("li");
    if (l && Math.abs(sl.a - l.a) < 0.002 && Math.abs(sl.b - l.b) < 0.002) li.className = "on";
    const b = document.createElement("button"); b.className = "go2"; b.textContent = sl.name; b.title = "Loop this";
    b.onclick = () => { setLoop(sl, { on: true, jump: true }); seek(sl.a); };
    const sm = document.createElement("small"); sm.textContent = `${fmtTime(sl.a, true)} to ${fmtTime(sl.b, true)}`;
    const x = document.createElement("button"); x.className = "x"; x.innerHTML = "&times;"; x.setAttribute("aria-label", "Delete " + sl.name);
    x.onclick = () => { D.loops.splice(i, 1); save(); showLoop(); };
    li.append(b, sm, x); ul.append(li);
  });
  showClock();
}
function showSound() {
  $("speed").value = D.speed; $("speedOut").textContent = speedLabel(D.speed); $("qSpeed").textContent = speedLabel(D.speed);
  $("semis").value = D.semis; $("semisOut").textContent = (D.semis > 0 ? "+" : "") + D.semis;
  $("cents").value = D.cents; $("centsOut").textContent = (D.cents > 0 ? "+" : "") + D.cents;
  $("qKey").textContent = (D.semis > 0 ? "+" : "") + D.semis + (D.cents ? (D.cents > 0 ? " +" : " ") + D.cents + "c" : "");
  $("vocal").value = D.vocal; $("vocalOut").textContent = D.vocal ? Math.round(D.vocal * 100) + "%" : "off";
  $("qVocal").classList.toggle("on", D.vocal > 0);
  for (const b of $("focus").children) b.classList.toggle("on", b.dataset.f === D.focus);
  for (const b of $("speedQuick").children) b.classList.toggle("on", Math.abs(+b.dataset.v - D.speed) < 0.001);
  $("vol").value = vol; $("volOut").textContent = Math.round(vol * 100) + "%";
}
function showMarkers() {
  const ul = $("markers"); ul.innerHTML = "";
  D.markers.forEach((m, i) => {
    const li = document.createElement("li");
    const t = document.createElement("button"); t.className = "t"; t.textContent = (i < 9 ? `${i + 1}. ` : "") + fmtTime(m.t, true); t.title = "Jump here";
    t.onclick = () => seek(m.t);
    const inp = document.createElement("input"); inp.type = "text"; inp.value = m.name; inp.maxLength = 40; inp.setAttribute("aria-label", "Marker name");
    inp.onchange = () => { m.name = inp.value.trim() || m.name; save(); redraw(); };
    const lp = document.createElement("button"); lp.className = "mini"; lp.textContent = "Loop"; lp.title = "Loop this part";
    lp.onclick = () => { const s = sectionAt(D.markers, m.t, song.dur); setLoop(s, { on: true, jump: true }); seek(s.a); };
    const x = document.createElement("button"); x.className = "x"; x.innerHTML = "&times;"; x.setAttribute("aria-label", "Delete marker " + m.name);
    x.onclick = () => { D.markers = removeMarker(D.markers, i); save(); showMarkers(); redraw(); };
    li.append(t, inp, lp, x); ul.append(li);
  });
  $("markTip").classList.toggle("hidden", D.markers.length > 3);
}
function marker() { if (!song) return; D.markers = addMarker(D.markers, pos); save(); showMarkers(); redraw(); }

async function showRecent() {
  const list = await store.recentFiles().catch(() => []);
  const ul = $("recent"); ul.innerHTML = "";
  for (const r of list) {
    const li = document.createElement("li");
    const b = document.createElement("button"); b.className = "open"; b.textContent = r.name; b.title = "Open " + r.name;
    b.onclick = async () => { const f = await store.getFile(r.key); if (f) { if (!f.name) Object.defineProperty(f, "name", { value: r.name }); loadFile(f, true); } else showErr("That song isn't stored any more. Choose it again."); };
    const sm = document.createElement("small"); sm.textContent = fmtTime(r.dur || 0);
    const x = document.createElement("button"); x.className = "x"; x.innerHTML = "&times;"; x.setAttribute("aria-label", "Forget " + r.name);
    x.onclick = async () => { await store.forgetFile(r.key); showRecent(); };
    li.append(b, sm, x); ul.append(li);
  }
}

function showErr(t) { lastErr = t; $("err").textContent = t; $("err").classList.remove("hidden"); }
function hideErr() { $("err").classList.add("hidden"); }

// ------------------------------------------------------------------ waveform interaction
function wireWave() {
  const cv = $("wave");
  let down = null;
  const tAt = (e) => { const r = cv.getBoundingClientRect(); return clamp(xToTime(e.clientX - r.left, view, r.width), 0, song.dur); };
  cv.addEventListener("pointerdown", (e) => {
    if (!song) return;
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left;
    let mode = "pending";
    if (D.loop) {
      const xa = timeToX(D.loop.a, view, r.width), xb = timeToX(D.loop.b, view, r.width), near = e.pointerType === "touch" ? 16 : 8;
      if (Math.abs(x - xa) <= near && Math.abs(x - xa) <= Math.abs(x - xb)) mode = "a";
      else if (Math.abs(x - xb) <= near) mode = "b";
    }
    down = { mode, x0: x, t0: tAt(e) };
    try { cv.setPointerCapture(e.pointerId); } catch {}
  });
  cv.addEventListener("pointermove", (e) => {
    if (!down || !song) return;
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left, t = tAt(e);
    if (down.mode === "pending" && Math.abs(x - down.x0) > 6) down.mode = "select";
    if (down.mode === "select") dragSel = normLoop(down.t0, t, song.dur);
    else if (down.mode === "a") dragSel = normLoop(t, D.loop.b, song.dur);
    else if (down.mode === "b") dragSel = normLoop(D.loop.a, t, song.dur);
    redraw();
  });
  const up = (e) => {
    if (!down || !song) return;
    const d = down; down = null;
    if (d.mode === "pending") { seek(d.t0); return; }
    const sel = dragSel; dragSel = null;
    if (sel) {
      setLoop(sel, { on: true, jump: d.mode === "select" });
      if (d.mode === "select" || pos < sel.a || pos > sel.b) seek(sel.a);
    }
    redraw();
  };
  cv.addEventListener("pointerup", up);
  cv.addEventListener("pointercancel", () => { down = null; dragSel = null; redraw(); });
  cv.addEventListener("wheel", (e) => {
    if (!song) return;
    e.preventDefault();
    const r = cv.getBoundingClientRect(), t = xToTime(e.clientX - r.left, view, r.width);
    if (e.ctrlKey || e.metaKey) view = zoomAt(view, e.deltaY < 0 ? 1.25 : 0.8, t, song.dur);
    else { const span = view.end - view.start, d = (e.deltaX || e.deltaY) / 600 * span; view = viewWindow(view.start + d, span, song.dur); }
    redraw();
  }, { passive: false });
  const ov = $("over");
  let ovDown = false;
  const ovSeek = (e) => {
    const r = ov.getBoundingClientRect(), t = clamp(((e.clientX - r.left) / r.width) * song.dur, 0, song.dur), span = view.end - view.start;
    view = viewWindow(t - span / 2, span, song.dur);
    seek(t);
  };
  ov.addEventListener("pointerdown", (e) => { if (!song) return; ovDown = true; try { ov.setPointerCapture(e.pointerId); } catch {} ovSeek(e); });
  ov.addEventListener("pointermove", (e) => { if (ovDown && song) ovSeek(e); });
  ov.addEventListener("pointerup", () => { ovDown = false; });
  ov.addEventListener("pointercancel", () => { ovDown = false; });
}

// ------------------------------------------------------------------ wiring
function build() {
  $("file").accept = ACCEPT;
  $("openBtn").onclick = $("swapBtn").onclick = () => $("file").click();
  $("file").addEventListener("change", (e) => { const f = e.target.files[0]; e.target.value = ""; loadFile(f); });
  $("demoBtn").onclick = loadDemo;
  const panel = document.querySelector(".panel");
  panel.addEventListener("dragover", (e) => { e.preventDefault(); $("drop").classList.add("over"); });
  panel.addEventListener("dragleave", () => $("drop").classList.remove("over"));
  panel.addEventListener("drop", (e) => { e.preventDefault(); $("drop").classList.remove("over"); const f = e.dataTransfer.files[0]; if (f) loadFile(f); });

  $("playBtn").onclick = togglePlay;
  $("restartBtn").onclick = restart;
  $("back5").onclick = () => seek(pos - 5);
  $("fwd5").onclick = () => seek(pos + 5);
  $("loopBtn").onclick = toggleLoop;
  $("setA").onclick = setA; $("setB").onclick = setB;
  $("zoomIn").onclick = () => { if (song) { view = zoomAt(view, 2, playing || (pos >= view.start && pos <= view.end) ? pos : (view.start + view.end) / 2, song.dur); redraw(); } };
  $("zoomOut").onclick = () => { if (song) { view = zoomAt(view, 0.5, (view.start + view.end) / 2, song.dur); redraw(); } };
  $("zoomFit").onclick = () => { if (song) { view = viewWindow(0, song.dur, song.dur); redraw(); } };
  $("zoomLoop").onclick = () => { if (song && D.loop) { const pad = (D.loop.b - D.loop.a) * 0.15; view = viewWindow(D.loop.a - pad, D.loop.b - D.loop.a + 2 * pad, song.dur); redraw(); } };
  $("slower").onclick = () => setSpeed(D.speed - 0.05);
  $("faster").onclick = () => setSpeed(D.speed + 0.05);
  $("keyDown").onclick = () => setKey(D.semis - 1);
  $("keyUp").onclick = () => setKey(D.semis + 1);
  $("qVocal").onclick = () => setVocal(D.vocal > 0 ? 0 : 0.85);

  // loop tab
  const timeIn = (id, which) => $(id).addEventListener("change", () => {
    if (!song) return;
    const t = parseTime($(id).value);
    if (!isFinite(t)) { showLoop(); return; }
    const l = D.loop || { a: 0, b: Math.min(song.dur, 4) };
    setLoop(which === "a" ? { a: t, b: Math.max(l.b, t + 0.1) } : { a: Math.min(l.a, t - 0.1), b: t }, { on: true });
  });
  timeIn("aIn", "a"); timeIn("bIn", "b");
  const nudge = (which, d) => () => { if (!song || !D.loop) return; setLoop(which === "a" ? { a: D.loop.a + d, b: D.loop.b } : { a: D.loop.a, b: D.loop.b + d }, { on: D.loopOn }); };
  $("aMinus").onclick = nudge("a", -0.05); $("aPlus").onclick = nudge("a", 0.05);
  $("bMinus").onclick = nudge("b", -0.05); $("bPlus").onclick = nudge("b", 0.05);
  $("halve").onclick = () => { if (song && D.loop) setLoop(halveLoop(D.loop, song.dur), { on: true }); };
  $("double").onclick = () => { if (song && D.loop) setLoop(doubleLoop(D.loop, song.dur), { on: true }); };
  $("prevLen").onclick = () => { if (song && D.loop) { setLoop(shiftLoop(D.loop, -(D.loop.b - D.loop.a), song.dur), { on: true, jump: true }); seek(D.loop.a); } };
  $("nextLen").onclick = () => { if (song && D.loop) { setLoop(shiftLoop(D.loop, D.loop.b - D.loop.a, song.dur), { on: true, jump: true }); seek(D.loop.a); } };
  $("gap").addEventListener("change", (e) => { D.gap = +e.target.value; loopCount = 0; sendLoop(); save(); showClock(); });
  for (let p = 25; p <= 100; p += 5) { const o = new Option(p + "%", p / 100); if (p === 60) o.selected = true; $("trStart").append(o); }
  for (let p = 50; p <= 150; p += 5) { const o = new Option(p + "%", p / 100); if (p === 100) o.selected = true; $("trTarget").append(o); }
  for (const id of ["trStart", "trStep", "trEvery", "trTarget"]) $(id).addEventListener("change", showTrainer);
  $("trBtn").onclick = toggleTrainer;
  $("saveLoop").onclick = () => {
    if (!song || !D.loop) { $("loopName").placeholder = "Make a loop first"; return; }
    const name = $("loopName").value.trim() || `Loop ${D.loops.length + 1} (${fmtTime(D.loop.a)})`;
    D.loops = [...D.loops, { name: name.slice(0, 40), ...D.loop }];
    $("loopName").value = ""; save(); showLoop();
  };
  $("loopName").addEventListener("keydown", (e) => { if (e.key === "Enter") $("saveLoop").click(); });

  // sound tab
  for (const v of [0.5, 0.6, 0.7, 0.75, 0.8, 0.9, 1]) { const b = document.createElement("button"); b.dataset.v = v; b.textContent = speedLabel(v); b.onclick = () => setSpeed(v); $("speedQuick").append(b); }
  $("speed").addEventListener("input", (e) => setSpeed(+e.target.value));
  $("semis").addEventListener("input", (e) => setKey(+e.target.value));
  $("cents").addEventListener("input", (e) => setKey(D.semis, +e.target.value));
  $("resetKey").onclick = () => { setSpeed(1); setKey(0, 0); };
  $("vocal").addEventListener("input", (e) => setVocal(+e.target.value));
  for (const b of $("focus").children) b.onclick = () => setFocus(b.dataset.f);
  $("vol").addEventListener("input", (e) => { vol = +e.target.value; send({ type: "volume", v: vol }); try { localStorage.setItem("encore-practice-vol", String(vol)); } catch {} showSound(); });
  $("dlLoop").onclick = () => download("loop");
  $("dlSong").onclick = () => download("song");

  // markers tab
  $("addMarker").onclick = marker;
  $("exportData").onclick = () => {
    if (!song) return;
    const blob = new Blob([exportSongData(song.name, D)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = song.name.replace(/\.[a-z0-9]{2,5}$/i, "") + " (practice loops).json";
    document.body.append(a); a.click(); a.remove();
  };
  $("importData").onclick = () => { if (song) $("importFile").click(); };
  $("importFile").addEventListener("change", async (e) => {
    const f = e.target.files[0]; e.target.value = "";
    if (!f || !song) return;
    try {
      const d = importSongData(await f.text(), song.dur);
      D.loops = [...D.loops, ...d.loops.filter((n) => !D.loops.some((o) => o.a === n.a && o.b === n.b))];
      for (const m of d.markers) D.markers = addMarker(D.markers, m.t, m.name);
      if (d.loop && !D.loop) setLoop(d.loop, { on: false });
      save(); showAll(); hideErr();
    } catch (err) { showErr(err.message); }
  });

  document.querySelectorAll(".tabBar button").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll(".tabBar button").forEach((x) => x.classList.toggle("on", x === b));
    document.querySelectorAll(".tabBody > section").forEach((s) => s.classList.toggle("show", s.dataset.tab === b.dataset.tab));
  }));

  document.addEventListener("keydown", (e) => {
    const t = e.target;
    if (t && ((t.tagName === "INPUT" && !["range", "checkbox"].includes(t.type)) || t.tagName === "SELECT" || t.tagName === "TEXTAREA")) return;
    const a = keyAction(e);
    if (!a || !song) return;
    if (t && t.type === "range" && /back|fwd|faster|slower/.test(a)) return; // let sliders use their arrows
    e.preventDefault();
    const acts = {
      play: togglePlay, setA, setB, loop: toggleLoop, marker, restart, trainer: toggleTrainer,
      back5: () => seek(pos - 5), fwd5: () => seek(pos + 5), back1: () => seek(pos - 1), fwd1: () => seek(pos + 1),
      faster: () => setSpeed(D.speed + 0.05), slower: () => setSpeed(D.speed - 0.05), speed100: () => setSpeed(1),
      keyUp: () => setKey(D.semis + 1), keyDown: () => setKey(D.semis - 1), vocal: () => setVocal(D.vocal > 0 ? 0 : 0.85),
      prevMarker: () => seek(prevMarker(D.markers, pos)), nextMarker: () => seek(nextMarker(D.markers, pos, song.dur)),
    };
    if (acts[a]) acts[a]();
    else if (a.startsWith("marker")) { const m = D.markers[+a.slice(6) - 1]; if (m) seek(m.t); }
  });
  window.addEventListener("resize", () => { overPeaks = null; viewKey = ""; redraw(); });
  window.addEventListener("pagehide", () => { if (song) store.saveSong(song.key, { ...D, pos }).catch(() => {}); });
  wireWave();
  showSound(); showTrainer();
  showRecent();
}
build();

// a peek for the browser tests
window.__practice = () => ({ song: song && { name: song.name, dur: song.dur, fs: song.fs, key: song.key }, D: JSON.parse(JSON.stringify(D)), pos, playing, loopCount,
  view: { ...view }, trainer: { on: trainer.on, st: trainer.st && { ...trainer.st } }, vol, error: lastErr, ctx: ctx && ctx.state });
