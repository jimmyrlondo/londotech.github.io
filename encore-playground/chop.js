// ENCORE. Chop: a beginner-friendly sample chopper. Slices by hits, equal parts or by hand,
// 16 pads (mouse, touch, keyboard, MIDI), a step sequencer with swing, live recording,
// lo-fi effects that sound the same live and in the export, and WAV/MP3/zip exports.
import { decodeAudio, ACCEPT } from "./audio-decode.js";
import { TempoFinder, tapTempo } from "./bpm-core.js";
import { parseMidi } from "./beatpad-core.js";
import { zip } from "./zip.js";
import { detectTransients, equalSlices, slicesToRegions, makePads, PAD_DEFAULT, padAudio, rateOf, emptyPattern, resizePattern, stepTime,
         patternSeconds, quantizeHit, renderPattern, velGain, loopTempos, settleTempo, KEYS, padForNote, mono, PADS, STEPS_PER_BAR } from "./chop-core.js";
import { LofiChain, LOFI_OFF, dust, encodeWav, peak, gainToDb } from "./lofi-core.js";

const $ = (id) => document.getElementById(id);
const RATES = [0, 32000, 26040, 16000, 11025];
const RATE_LABEL = ["off", "32 k", "26 k", "16 k", "11 k"];

// ---- state
let sample = null;            // { chans: [L, R], fs, name }
let slices = [];              // slice start samples
let pads = makePads([]);
let pattern = emptyPattern(1);
const S = { mode: "hits", sens: 0.5, parts: 16, fromHit: true, bpm: 90, swing: 0.56, sel: 0, page: 0, click: false, quant: true,
            lofiOn: true, dust: 0, lofi: { ...LOFI_OFF }, eLoops: 4, eFmt: "wav16", eLoop: true, eSliceLofi: false, bpmNote: "" };
const undo = [];
const say = (t, err = false) => { const el = $("status"); el.textContent = t; el.style.color = err ? "var(--red)" : ""; };

// ---- saving (IndexedDB; works without it)
function idb() {
  return new Promise((res, rej) => {
    try { const r = indexedDB.open("encore-chop", 1); r.onupgradeneeded = () => r.result.createObjectStore("p"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }
    catch (e) { rej(e); }
  });
}
let saveTimer = 0;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try { const db = await idb(); db.transaction("p", "readwrite").objectStore("p").put({ S: { ...S, lofi: { ...S.lofi } }, sample, slices, pads, pattern }, "project"); } catch {}
  }, 400);
}
async function load() {
  try {
    const db = await idb();
    const d = await new Promise((res) => { const q = db.transaction("p").objectStore("p").get("project"); q.onsuccess = () => res(q.result); q.onerror = () => res(null); });
    if (!d) return false;
    Object.assign(S, d.S || {}, { lofi: { ...LOFI_OFF, ...(d.S?.lofi || {}) } });
    if (d.sample?.chans?.length) { sample = d.sample; slices = d.slices || []; pads = d.pads?.length === PADS ? d.pads : makePads(slicesToRegions(slices, sample.chans[0].length)); }
    if (d.pattern?.steps?.length) pattern = d.pattern;
    return !!sample;
  } catch { return false; }
}

// ---- undo
function snap() { undo.push(JSON.stringify({ slices, pads, pattern, mode: S.mode })); if (undo.length > 60) undo.shift(); $("undoBtn").disabled = false; }
const sampleUndo = [];
function doUndo() {
  if (!undo.length) return;
  const u = JSON.parse(undo.pop());
  if (u.sampleMark && sampleUndo.length) { sample = sampleUndo.pop(); buildBuffers(); }
  slices = u.slices; pads = u.pads; pattern = u.pattern; S.mode = u.mode;
  S.page = Math.min(S.page, pattern.bars - 1);
  $("undoBtn").disabled = !undo.length;
  refreshAll(); save(); say("Undone.");
}

// ---- audio
let ctx = null, bus = null, lofiNode = null, fwd = null, rev = null;
function audio() {
  if (ctx) return ctx;
  ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: "interactive" });
  bus = ctx.createGain(); bus.gain.value = 0.8;
  bus.connect(ctx.destination);
  ctx.audioWorklet?.addModule("chop-worklet.js").then(() => {
    lofiNode = new AudioWorkletNode(ctx, "chop-lofi", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
    bus.disconnect(); bus.connect(lofiNode); lofiNode.connect(ctx.destination);
    sendLofi();
  }).catch(() => say("Lo-fi effects can't run live in this browser, but they still go into exports."));
  buildBuffers();
  return ctx;
}
function buildBuffers() {
  if (!ctx || !sample) return;
  const n = sample.chans[0].length;
  fwd = ctx.createBuffer(2, n, sample.fs); rev = ctx.createBuffer(2, n, sample.fs);
  for (let c = 0; c < 2; c++) {
    const x = sample.chans[c] || sample.chans[0];
    fwd.copyToChannel(x, c);
    const r = new Float32Array(n); for (let i = 0; i < n; i++) r[i] = x[n - 1 - i];
    rev.copyToChannel(r, c);
  }
}
function lofiParams() { return { ...S.lofi, bpm: S.bpm, pump: seq ? S.lofi.pump : 0 }; }
function sendLofi() { lofiNode?.port.postMessage({ set: lofiParams(), on: S.lofiOn }); }

// voices: one per hit; a choked pad cuts the last choked voice
let lastChoke = null;
const held = new Map();
function playPad(i, vel = 110, when = 0, hold = false) {
  const p = pads[i];
  if (!p || p.empty || !sample) return null;
  const c = audio();
  if (!fwd) buildBuffers();
  const t = Math.max(c.currentTime, when || c.currentTime), fs = sample.fs, rate = rateOf(p);
  const a = p.start, b = Math.max(p.start + 1, p.end), n = sample.chans[0].length;
  const offset = (p.reverse ? n - b : a) / fs, dur = (b - a) / fs, real = dur / rate;
  const src = c.createBufferSource(); src.buffer = p.reverse ? rev : fwd; src.playbackRate.value = rate;
  const g = c.createGain(), lvl = (p.gain ?? 1) * velGain(vel), fade = Math.min(real / 2, (p.fade ?? 5) / 1000);
  g.gain.setValueAtTime(fade > 0.0005 ? 0 : lvl, t);
  if (fade > 0.0005) { g.gain.linearRampToValueAtTime(lvl, t + fade); g.gain.setValueAtTime(lvl, t + real - fade); g.gain.linearRampToValueAtTime(0, t + real); }
  src.connect(g); g.connect(bus);
  src.start(t, offset, dur);
  const v = { src, g, t, end: t + real, pad: i };
  if (p.choke) {
    if (lastChoke && lastChoke.end > t) { const o = lastChoke; o.g.gain.cancelScheduledValues(t); o.g.gain.setValueAtTime(o.g.gain.value, t); o.g.gain.linearRampToValueAtTime(0, t + 0.004); try { o.src.stop(t + 0.006); } catch {} }
    lastChoke = v;
  }
  const delay = Math.max(0, (t - c.currentTime) * 1000);
  setTimeout(() => flashPad(i), delay);
  return v;
}
function releaseVoice(v) {
  if (!v || !ctx) return;
  const t = ctx.currentTime;
  if (v.end <= t) return;
  v.g.gain.cancelScheduledValues(t); v.g.gain.setValueAtTime(v.g.gain.value, t); v.g.gain.linearRampToValueAtTime(0, t + 0.01);
  try { v.src.stop(t + 0.015); } catch {}
}
function clickAt(t, accent) {
  const c = audio(), o = c.createOscillator(), g = c.createGain();
  o.frequency.value = accent ? 1760 : 1175;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(accent ? 0.35 : 0.2, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + 0.06);
}

// ---- the sequencer
let seq = null; // { t0, loopLen, next (absolute step count), timer, rec, countUntil }
const totalSteps = () => pattern.bars * STEPS_PER_BAR;
function startSeq(countIn = false) {
  const c = audio();
  c.resume?.();
  const beat = 60 / S.bpm;
  const t0 = c.currentTime + 0.12 + (countIn ? beat * 4 : 0);
  seq = { t0, next: 0, timer: 0, countUntil: countIn ? t0 : 0, skip: new Set() };
  if (countIn) for (let k = 0; k < 4; k++) clickAt(t0 - beat * (4 - k), k === 0);
  lofiNode?.port.postMessage({ frame0: Math.round(t0 * c.sampleRate) });
  sendLofi();
  seq.timer = setInterval(schedule, 25);
  schedule();
  $("playBtn").textContent = "Stop";
  requestAnimationFrame(drawNow);
}
function stopSeq() {
  if (!seq) return;
  clearInterval(seq.timer); seq = null;
  if (recording) setRec(false);
  sendLofi();
  $("playBtn").textContent = "Play";
  renderSteps(); drawGrid();
}
function stepAbsTime(k) {
  const n = totalSteps(), loop = Math.floor(k / n), s = k % n;
  return seq.t0 + loop * patternSeconds(pattern, S.bpm) + stepTime(s, S.bpm, S.swing);
}
function schedule() {
  if (!seq || !ctx) return;
  const ahead = ctx.currentTime + 0.12;
  while (stepAbsTime(seq.next) < ahead) {
    const k = seq.next, s = k % totalSteps(), t = stepAbsTime(k);
    if (t >= ctx.currentTime - 0.01) {
      pattern.steps[s].forEach((v, pad) => {
        if (v <= 0) return;
        const key = k * 16 + pad;
        if (seq.skip.has(key)) { seq.skip.delete(key); return; }
        playPad(pad, v, t);
      });
      if (S.click && s % 4 === 0) clickAt(t, s % 16 === 0);
    }
    seq.next++;
  }
}
// tempo changes keep the playhead where it is
function retime(newBpm) {
  if (!seq || !ctx) { S.bpm = newBpm; return; }
  const now = ctx.currentTime, oldLen = patternSeconds(pattern, S.bpm);
  const pos = ((now - seq.t0) % oldLen + oldLen) % oldLen, frac = pos / oldLen;
  S.bpm = newBpm;
  const len = patternSeconds(pattern, S.bpm);
  seq.t0 = now - frac * len;
  // next step from here
  const n = totalSteps();
  let k = Math.floor((now - seq.t0) / len) * n;
  while (stepAbsTime(k) < now + 0.005) k++;
  seq.next = k;
  lofiNode?.port.postMessage({ frame0: Math.round(seq.t0 * ctx.sampleRate) });
  sendLofi();
}
function currentStep() {
  if (!seq || !ctx) return -1;
  const now = ctx.currentTime - (ctx.outputLatency || 0);
  if (now < seq.t0) return -1;
  const len = patternSeconds(pattern, S.bpm), pos = (now - seq.t0) % len, n = totalSteps();
  let s = 0;
  for (let k = 0; k < n; k++) if (stepTime(k, S.bpm, S.swing) <= pos) s = k;
  return s;
}

// ---- live recording
let recording = false, recPass = false;
function setRec(on) {
  recording = on;
  $("recBtn").classList.toggle("on", on);
  $("recBtn").textContent = on ? "Recording" : "Record";
  if (on) {
    recPass = false;
    if (!sample) { setRec(false); say("Load a sample first."); return; }
    if (!seq) startSeq(true);
    say("Recording: play the pads in time. Everything you play is added to the pattern. Press Record again to stop.");
  }
}
function recordHit(pad, vel) {
  if (!recording || !seq || !ctx) return;
  const lat = (ctx.outputLatency || 0) + (ctx.baseLatency || 0);
  const t = ctx.currentTime - lat - seq.t0;
  if (t < -0.15) return; // still in the count-in
  if (!recPass) { snap(); recPass = true; }
  const len = patternSeconds(pattern, S.bpm), n = totalSteps();
  const s = S.quant ? quantizeHit(t, S.bpm, S.swing, n) : quantizeHit(t, S.bpm, 0.5, n);
  pattern.steps[s][pad] = Math.max(pattern.steps[s][pad], vel);
  // if that step is still coming up this time round, don't play it twice
  const loop = Math.floor((t + len * 0.5 / n) / len);
  const k = loop * n + s;
  if (k >= seq.next) seq.skip.add(k * 16 + pad);
  renderSteps(); drawGrid(); save();
}

// ---- loading and slicing
async function loadFile(f) {
  say(`Opening ${f.name}...`);
  try {
    const d = await decodeAudio(f);
    let chans = d.chans.length === 1 ? [d.chans[0], d.chans[0]] : d.chans.slice(0, 2);
    const secs = chans[0].length / d.fs;
    if (secs > 600) throw new Error("That's longer than 10 minutes. Trim it to the part you want to chop first.");
    if (secs < 0.05) throw new Error("That's too short to chop.");
    setSample({ chans, fs: d.fs, name: f.name }, true);
  } catch (e) { say(e.message || "Couldn't open that file.", true); }
}
function setSample(s, fresh) {
  stopSeq();
  sample = s;
  if (ctx) buildBuffers();
  S.sel = 0;
  pads = makePads([]); slices = [];
  if (S.mode === "manual") S.mode = "hits";
  findTempo();
  doSlice(false);
  if (fresh) say(`Loaded ${s.name}: ${(s.chans[0].length / s.fs).toFixed(1)} s, cut into ${slices.length} slices. Hit the pads!`);
  refreshAll(); save();
}
function doSlice(keepUndo = true) {
  if (!sample) return;
  if (keepUndo) snap();
  const n = sample.chans[0].length, m = mono(sample.chans);
  if (S.mode === "hits") slices = detectTransients(m, sample.fs, { sensitivity: S.sens });
  else if (S.mode === "equal") {
    const first = S.fromHit ? (detectTransients(m, sample.fs, { sensitivity: 0.5 })[0] || 0) : 0;
    const startAt = first > sample.fs * 0.5 ? 0 : first;
    slices = equalSlices(n, S.parts, startAt, n);
  }
  // manual keeps the cuts it has; each pad keeps its sound settings
  const regs = slicesToRegions(slices, n), old = pads;
  pads = makePads(regs).map((p, i) => {
    if (p.empty) return p;
    const o = old[i] && !old[i].empty ? old[i] : PAD_DEFAULT;
    return { ...PAD_DEFAULT, pitch: o.pitch, fine: o.fine, gain: o.gain, reverse: o.reverse, choke: o.choke, fade: o.fade, mode: o.mode, start: p.start, end: p.end };
  });
}
function findTempo() {
  const secs = sample.chans[0].length / sample.fs;
  let det = null;
  if (secs >= 4) {
    const tf = new TempoFinder(sample.fs);
    tf.push(mono(sample.chans));
    const e = tf.estimate(60, 180);
    if (e && e.confidence > 0.1) det = e.bpm;
  }
  const bpm = settleTempo(det, secs);
  const lt = loopTempos(secs).find((c) => Math.abs(c.bpm - bpm) < 0.01);
  S.bpm = Math.round(bpm * 10) / 10;
  S.bpmNote = det || lt ? `Sounds like <b>${S.bpm} BPM</b>${lt ? ` (a ${lt.bars}-bar loop)` : ""}.` : `Couldn't hear a steady beat, so the tempo is set to <b>${S.bpm} BPM</b>. Tap it if you know it.`;
}

// ---- drawing: waveform with cuts
const wave = $("wave");
let peaks = null;
function waveSize() {
  const r = wave.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
  const w = Math.max(10, Math.round(r.width * dpr)), h = Math.max(10, Math.round(r.height * dpr));
  if (wave.width !== w || wave.height !== h) { wave.width = w; wave.height = h; peaks = null; }
  return { w, h, dpr };
}
function computePeaks(w) {
  const x = sample.chans[0], y = sample.chans[1], n = x.length, out = new Float32Array(w * 2);
  for (let i = 0; i < w; i++) {
    const a = Math.floor((i * n) / w), b = Math.max(a + 1, Math.floor(((i + 1) * n) / w));
    let lo = 0, hi = 0;
    for (let j = a; j < b; j += Math.max(1, ((b - a) / 200) | 0)) { const v = (x[j] + y[j]) / 2; if (v < lo) lo = v; if (v > hi) hi = v; }
    out[2 * i] = lo; out[2 * i + 1] = hi;
  }
  return out;
}
let flashRegion = null;
function drawWave() {
  const { w, h, dpr } = waveSize(), g = wave.getContext("2d");
  g.clearRect(0, 0, w, h);
  if (!sample) {
    g.fillStyle = "#8a8580"; g.font = `${13 * dpr}px "DM Sans", sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText("No sample yet", w / 2, h / 2);
    return;
  }
  const n = sample.chans[0].length, X = (s) => (s / n) * w;
  if (!peaks || peaks.length !== w * 2) peaks = computePeaks(w);
  const p = pads[S.sel];
  if (p && !p.empty) { g.fillStyle = "rgba(255,59,0,.16)"; g.fillRect(X(p.start), 0, Math.max(1, X(p.end) - X(p.start)), h); }
  if (flashRegion) { g.fillStyle = "rgba(255,255,255,.12)"; g.fillRect(X(flashRegion.start), 0, X(flashRegion.end) - X(flashRegion.start), h); }
  const pk = Math.max(0.05, ...peaks.map(Math.abs));
  g.fillStyle = "#c9c2b8";
  for (let i = 0; i < w; i++) { const lo = peaks[2 * i] / pk, hi = peaks[2 * i + 1] / pk; g.fillRect(i, h / 2 - hi * h * 0.44, 1, Math.max(1, (hi - lo) * h * 0.44)); }
  // cuts, numbered like the pads
  g.font = `700 ${11 * dpr}px "DM Sans", sans-serif`; g.textBaseline = "top"; g.textAlign = "left";
  pads.forEach((q, i) => {
    if (q.empty) return;
    const x = Math.round(X(q.start));
    g.fillStyle = i === S.sel ? "#ff3b00" : "rgba(255,255,255,.75)";
    g.fillRect(x, 0, Math.max(1, dpr), h);
    g.fillRect(x, 0, 16 * dpr, 14 * dpr);
    g.fillStyle = i === S.sel ? "#fff" : "#141210"; g.fillText(String(i + 1), x + 3 * dpr, 1.5 * dpr);
  });
  // the selected pad's own end, if trimmed short of the next cut
  if (p && !p.empty) { g.fillStyle = "rgba(255,59,0,.8)"; g.fillRect(Math.round(X(p.end)) - dpr, h - 10 * dpr, 2 * dpr, 10 * dpr); }
}
// clicking and dragging on the waveform
let wdrag = null;
function sampleAt(e) { const r = wave.getBoundingClientRect(); return Math.max(0, Math.min(sample.chans[0].length - 1, Math.round(((e.clientX - r.left) / r.width) * sample.chans[0].length))); }
function cutNear(e) {
  const r = wave.getBoundingClientRect(), n = sample.chans[0].length;
  let best = -1, bd = 8;
  pads.forEach((q, i) => { if (q.empty) return; const x = r.left + (q.start / n) * r.width, d = Math.abs(e.clientX - x); if (d < bd) { bd = d; best = i; } });
  return best;
}
wave.addEventListener("pointerdown", (e) => {
  if (!sample || e.button > 0) return;
  const i = cutNear(e);
  if (i >= 0) { wdrag = { i, moved: false, x: e.clientX }; wave.setPointerCapture(e.pointerId); return; }
  const at = sampleAt(e);
  if (S.mode === "manual") {
    if (slices.length >= PADS) { say("All 16 pads have a slice. Remove a cut first (double-click it)."); return; }
    snap();
    slices = [...slices, at].sort((a, b) => a - b);
    applyManual();
    S.sel = slices.indexOf(at);
    refreshAll(); save();
    playPad(S.sel);
    return;
  }
  // select and hear the slice under the pointer
  const k = pads.findIndex((q) => !q.empty && at >= q.start && at < q.end);
  if (k >= 0) { selectPad(k); playPad(k); }
});
wave.addEventListener("pointermove", (e) => {
  if (!wdrag) { if (sample) wave.style.cursor = cutNear(e) >= 0 ? "ew-resize" : ""; return; }
  if (!wdrag.moved && Math.abs(e.clientX - wdrag.x) < 3) return;
  if (!wdrag.moved) { snap(); wdrag.moved = true; if (S.mode !== "manual") { S.mode = "manual"; renderMode(); } slices = pads.filter((q) => !q.empty).map((q) => q.start); }
  const at = sampleAt(e), i = wdrag.i;
  const prev = i > 0 ? pads[i - 1].start + 64 : 0, next = pads[i + 1] && !pads[i + 1].empty ? pads[i + 1].start - 64 : sample.chans[0].length - 64;
  const v = Math.max(prev, Math.min(next, at));
  slices[i] = v;
  applyManual(true);
  drawWave();
});
wave.addEventListener("pointerup", (e) => {
  if (!wdrag) return;
  const d = wdrag; wdrag = null;
  if (d.moved) { refreshAll(); save(); say("Cut moved. You're cutting by hand now, so your changes stay."); }
  else { selectPad(d.i); playPad(d.i); }
});
function removeCut(e) {
  if (!sample) return;
  const i = cutNear(e);
  if (i < 0) return;
  e.preventDefault();
  snap();
  if (S.mode !== "manual") { S.mode = "manual"; renderMode(); }
  slices = pads.filter((q) => !q.empty).map((q) => q.start).filter((_, k) => k !== i);
  if (!slices.length) slices = [0];
  applyManual();
  S.sel = Math.min(S.sel, slices.length - 1);
  refreshAll(); save();
}
wave.addEventListener("dblclick", removeCut);
wave.addEventListener("contextmenu", removeCut);
function applyManual(keepPads = false) {
  const regs = slicesToRegions(slices, sample.chans[0].length);
  const old = pads;
  pads = makePads(regs).map((p, i) => (p.empty ? p : { ...(old[i] && !old[i].empty ? old[i] : PAD_DEFAULT), start: p.start, end: p.end, empty: false }));
  if (!keepPads) slices = regs.map((r) => r.start);
}

// ---- pads
const padEls = [];
function buildPads() {
  const box = $("pads");
  // pad 1 at the bottom-left: rows top to bottom are 13-16, 9-12, 5-8, 1-4
  for (let row = 3; row >= 0; row--) for (let col = 0; col < 4; col++) {
    const i = row * 4 + col, b = document.createElement("button");
    b.className = "pad"; b.dataset.i = i;
    b.innerHTML = `<canvas></canvas><span class="pn">${i + 1}</span><span class="pk">${KEYS[i]}</span><span class="pi"></span>`;
    b.setAttribute("aria-label", `Pad ${i + 1} (key ${KEYS[i].toUpperCase()})`);
    box.append(b); padEls[i] = b;
  }
  box.addEventListener("pointerdown", (e) => {
    const b = e.target.closest(".pad"); if (!b || e.button > 0) return;
    e.preventDefault();
    const i = +b.dataset.i;
    hit(i, 110, "p" + e.pointerId);
    try { b.setPointerCapture(e.pointerId); } catch {}
  });
  const up = (e) => release("p" + e.pointerId);
  box.addEventListener("pointerup", up); box.addEventListener("pointercancel", up);
  box.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.closest(".pad")) { e.preventDefault(); hit(+e.target.closest(".pad").dataset.i, 110, "enter"); } });
  box.addEventListener("contextmenu", (e) => e.preventDefault());
}
function hit(i, vel, key) {
  audio(); ctx.resume?.();
  selectPad(i);
  if (!sample) { say("Load a sample (or try the demo loop) and the pads will play its slices."); return; }
  if (pads[i].empty) { say(`Pad ${i + 1} has no slice yet.`); return; }
  const v = playPad(i, vel);
  if (key) held.set(key, { v, pad: i });
  recordHit(i, vel);
}
function release(key) {
  const h = held.get(key); if (!h) return;
  held.delete(key);
  if (pads[h.pad]?.mode === "hold") releaseVoice(h.v);
}
function flashPad(i) {
  const b = padEls[i]; if (!b) return;
  b.classList.add("hit");
  clearTimeout(b._t); b._t = setTimeout(() => b.classList.remove("hit"), 110);
  flashRegion = pads[i]; drawWave();
  clearTimeout(flashPad._t); flashPad._t = setTimeout(() => { flashRegion = null; drawWave(); }, 140);
}
function selectPad(i) {
  if (S.sel === i) return;
  S.sel = i;
  renderPads(); renderPadPanel(); renderSteps(); drawWave(); drawGrid();
}
function renderPads() {
  pads.forEach((p, i) => {
    const b = padEls[i];
    b.classList.toggle("sel", i === S.sel); b.classList.toggle("empty", !!p.empty);
    const tags = [];
    if (!p.empty) { tags.push(((p.end - p.start) / sample.fs / rateOf(p)).toFixed(2) + "s"); if (p.pitch || p.fine) tags.push((p.pitch > 0 ? "+" : "") + p.pitch + (p.fine ? "." + Math.abs(p.fine) : "")); if (p.reverse) tags.push("rev"); }
    b.querySelector(".pi").textContent = tags.join(" ");
    const c = b.querySelector("canvas"), r = b.getBoundingClientRect();
    const w = Math.max(10, Math.round(r.width)), h = Math.max(6, Math.round(r.height * 0.4));
    if (c.width !== w) c.width = w;
    if (c.height !== h) c.height = h;
    const g = c.getContext("2d"); g.clearRect(0, 0, w, h);
    if (p.empty || !sample) return;
    const x = sample.chans[0], len = p.end - p.start;
    g.fillStyle = "#c9c2b8";
    for (let k = 0; k < w; k++) {
      const a = p.start + Math.floor((k * len) / w), bb = p.start + Math.floor(((k + 1) * len) / w);
      let m = 0; for (let j = a; j < bb; j += Math.max(1, ((bb - a) / 50) | 0)) m = Math.max(m, Math.abs(x[j]));
      const kk = p.reverse ? w - 1 - k : k;
      g.fillRect(kk, h - m * h, 1, m * h);
    }
  });
}

// ---- pad panel
function renderPadPanel() {
  const p = pads[S.sel];
  $("padTitle").textContent = `Pad ${S.sel + 1}` + (p.empty ? " (empty)" : "");
  const dis = !!p.empty || !sample;
  for (const id of ["pPitch", "pFine", "pGain", "pFade", "pReverse", "pChoke", "pHold", "padPlay", "padReset"]) $(id).disabled = dis;
  document.querySelectorAll("[data-nudge]").forEach((b) => (b.disabled = dis));
  $("pPitch").value = p.pitch || 0; $("oPitch").textContent = `${p.pitch > 0 ? "+" : ""}${p.pitch || 0} st`;
  $("pFine").value = p.fine || 0; $("oFine").textContent = `${p.fine > 0 ? "+" : ""}${p.fine || 0} c`;
  $("pGain").value = p.gain ?? 1; $("oGain").textContent = (p.gain ?? 1) > 0 ? `${gainToDb(p.gain ?? 1).toFixed(1)} dB` : "off";
  $("pFade").value = p.fade ?? 5; $("oFade").textContent = `${p.fade ?? 5} ms`;
  $("pReverse").checked = !!p.reverse; $("pChoke").checked = !!p.choke; $("pHold").checked = p.mode === "hold";
  $("oStart").textContent = sample && !p.empty ? `${((p.start / sample.fs)).toFixed(3)} s` : "";
  $("oEnd").textContent = sample && !p.empty ? `${((p.end / sample.fs)).toFixed(3)} s` : "";
}
let padEditSnap = 0;
function padEdit(fn) {
  const p = pads[S.sel]; if (p.empty) return;
  if (Date.now() - padEditSnap > 800) snap();
  padEditSnap = Date.now();
  fn(p);
  renderPadPanel(); renderPads(); drawWave(); save();
}
$("pPitch").oninput = () => padEdit((p) => (p.pitch = +$("pPitch").value));
$("pFine").oninput = () => padEdit((p) => (p.fine = +$("pFine").value));
$("pGain").oninput = () => padEdit((p) => (p.gain = +$("pGain").value));
$("pFade").oninput = () => padEdit((p) => (p.fade = +$("pFade").value));
for (const id of ["pPitch", "pFine", "pGain", "pFade"]) $(id).onchange = () => playPad(S.sel);
$("pReverse").onchange = () => { padEdit((p) => (p.reverse = $("pReverse").checked)); playPad(S.sel); };
$("pChoke").onchange = () => padEdit((p) => (p.choke = $("pChoke").checked));
$("pHold").onchange = () => padEdit((p) => (p.mode = $("pHold").checked ? "hold" : "oneshot"));
$("padPlay").onclick = () => playPad(S.sel);
$("padReset").onclick = () => { snap(); doSliceKeep(); };
function doSliceKeep() {
  const regs = slicesToRegions(slices, sample.chans[0].length), r = regs[S.sel];
  if (r) pads[S.sel] = { ...PAD_DEFAULT, ...r };
  renderPadPanel(); renderPads(); drawWave(); save();
}
document.querySelectorAll("[data-nudge]").forEach((b) => (b.onclick = () => padEdit((p) => {
  const d = Math.round((+b.dataset.ms / 1000) * sample.fs), n = sample.chans[0].length;
  if (b.dataset.nudge === "start") p.start = Math.max(0, Math.min(p.end - 64, p.start + d));
  else p.end = Math.max(p.start + 64, Math.min(n, p.end + d));
  playPad(S.sel);
})));

// ---- steps (the selected pad) and the full grid
const stepEls = [];
function buildSteps() {
  for (let k = 0; k < 16; k++) {
    const b = document.createElement("button"); b.className = "step"; b.dataset.k = k;
    b.setAttribute("aria-label", `Step ${k + 1}`);
    $("steps").append(b); stepEls.push(b);
  }
  $("steps").addEventListener("click", (e) => {
    const b = e.target.closest(".step"); if (!b) return;
    toggleStep(S.page * 16 + +b.dataset.k, S.sel);
  });
}
function toggleStep(s, pad) {
  if (!sample) { say("Load a sample first, then click steps to make a beat."); return; }
  snap();
  pattern.steps[s][pad] = pattern.steps[s][pad] > 0 ? 0 : 110;
  if (pattern.steps[s][pad] && !seq) playPad(pad);
  renderSteps(); drawGrid(); save();
}
function renderSteps() {
  const cur = currentStep();
  stepEls.forEach((b, k) => {
    const s = S.page * 16 + k, v = pattern.steps[s]?.[S.sel] || 0;
    b.classList.toggle("on", v > 0);
    b.style.opacity = v > 0 ? 0.55 + 0.45 * (v / 127) : "";
    b.classList.toggle("now", s === cur);
  });
  $("stepsLabel").textContent = `Steps for pad ${S.sel + 1}` + (pattern.bars > 1 ? `, bar ${S.page + 1} of ${pattern.bars}` : "");
  const bb = $("barBtns");
  if (bb.childElementCount !== pattern.bars) {
    bb.textContent = "";
    if (pattern.bars > 1) for (let i = 0; i < pattern.bars; i++) { const b = document.createElement("button"); b.textContent = String(i + 1); b.dataset.page = i; b.setAttribute("aria-label", `Show bar ${i + 1}`); bb.append(b); }
  }
  [...bb.children].forEach((b, i) => { b.classList.toggle("on", i === S.page); b.classList.toggle("play", cur >= 0 && Math.floor(cur / 16) === i); });
}
$("barBtns").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; S.page = +b.dataset.page; renderSteps(); drawGrid(); });
const grid = $("grid");
function drawGrid() {
  const r = grid.getBoundingClientRect(); if (!r.width) return;
  const dpr = Math.min(2, devicePixelRatio || 1), W = Math.round(r.width * dpr), cell = (W - 28 * dpr) / 16, H = Math.round(r.height * dpr);
  if (grid.width !== W || grid.height !== H) { grid.width = W; grid.height = H; }
  const g = grid.getContext("2d"), ch = (H - 2 * dpr) / 16, left = 28 * dpr, cur = currentStep();
  g.clearRect(0, 0, W, H);
  g.font = `${10 * dpr}px "Space Mono", monospace`; g.textBaseline = "middle"; g.textAlign = "right";
  for (let pad = 0; pad < 16; pad++) {
    const y = (15 - pad) * ch + dpr;
    g.fillStyle = pad === S.sel ? "#ff3b00" : pads[pad].empty ? "#5a544e" : "#8a8580";
    g.fillText(String(pad + 1), left - 6 * dpr, y + ch / 2);
    for (let k = 0; k < 16; k++) {
      const s = S.page * 16 + k, v = pattern.steps[s]?.[pad] || 0, x = left + k * cell;
      g.fillStyle = v > 0 ? `rgba(255,59,0,${0.5 + 0.5 * v / 127})` : k % 4 === 0 ? "rgba(255,255,255,.10)" : "rgba(255,255,255,.05)";
      if (s === cur && v <= 0) g.fillStyle = "rgba(255,255,255,.22)";
      g.fillRect(x + dpr, y + dpr, cell - 2 * dpr, ch - 2 * dpr);
    }
    if (pad === S.sel) { g.strokeStyle = "rgba(255,59,0,.6)"; g.lineWidth = dpr; g.strokeRect(left, y, cell * 16, ch); }
  }
}
grid.addEventListener("click", (e) => {
  const r = grid.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, left = 28, cell = (r.width - left) / 16, ch = r.height / 16;
  if (x < left) { selectPad(15 - Math.floor(y / ch)); return; }
  const k = Math.floor((x - left) / cell), pad = 15 - Math.floor(y / ch);
  if (k < 0 || k > 15 || pad < 0 || pad > 15) return;
  selectPad(pad);
  toggleStep(S.page * 16 + k, pad);
});
function drawNow() {
  if (!seq) return;
  renderSteps();
  if ($("grid").closest("section").classList.contains("show")) drawGrid();
  requestAnimationFrame(drawNow);
}

// ---- transport controls
function swingLabel(v) { return v <= 50 ? "straight" : v < 54 ? "a touch" : v <= 62 ? "laid back" : v < 66 ? "bouncy" : v <= 68 ? "triplet" : "heavy"; }
$("playBtn").onclick = () => { if (seq) stopSeq(); else if (!sample) say("Load a sample (or try the demo loop) first."); else startSeq(false); };
$("recBtn").onclick = () => setRec(!recording);
$("fClick").onchange = () => { S.click = $("fClick").checked; save(); };
$("fBpm").onchange = () => { const v = Math.max(50, Math.min(200, +$("fBpm").value || 90)); retime(Math.round(v * 10) / 10); $("fBpm").value = S.bpm; save(); };
$("fSwing").oninput = () => { S.swing = +$("fSwing").value / 100; $("oSwing").textContent = `${Math.round(S.swing * 100)}% ${swingLabel(S.swing * 100)}`; save(); };
$("fBars").onchange = () => { snap(); pattern = resizePattern(pattern, +$("fBars").value); S.page = Math.min(S.page, pattern.bars - 1); if (seq) { stopSeq(); startSeq(false); } renderSteps(); drawGrid(); save(); };
$("fQuant").onchange = () => { S.quant = $("fQuant").checked; save(); };
$("clearPad").onclick = () => { snap(); pattern.steps.forEach((row) => (row[S.sel] = 0)); renderSteps(); drawGrid(); save(); };
$("clearAll").onclick = () => { snap(); pattern = emptyPattern(pattern.bars); renderSteps(); drawGrid(); save(); };
$("undoBtn").onclick = doUndo;
$("starter").onclick = () => {
  if (!sample) { say("Load a sample first."); return; }
  snap();
  const n = totalSteps();
  for (let s = 0; s < n; s++) {
    const b = s % 16;
    pattern.steps[s][0] = b === 0 || b === 10 ? 120 : 0;
    pattern.steps[s][1] = b === 4 || b === 12 ? 115 : 0;
    pattern.steps[s][2] = b % 2 === 0 ? 85 : 0;
    pattern.steps[s][3] = b === 7 || b === 14 ? 90 : 0;
  }
  renderSteps(); drawGrid(); save();
  say("A simple beat is on pads 1 to 4. Press Play, then change it.");
};

// ---- chop tab
function renderMode() {
  document.querySelectorAll("[data-mode]").forEach((b) => b.classList.toggle("on", b.dataset.mode === S.mode));
  $("modeHits").classList.toggle("hidden", S.mode !== "hits");
  $("modeEqual").classList.toggle("hidden", S.mode !== "equal");
  $("modeManual").classList.toggle("hidden", S.mode !== "manual");
  wave.classList.toggle("manual", S.mode === "manual");
  $("waveTip").textContent = !sample ? "Load a sample, or try the demo loop." : S.mode === "manual" ? "Click to add a cut, drag to move, double-click to remove." : "Click a slice to hear it. Drag a cut to move it.";
}
document.querySelectorAll("[data-mode]").forEach((b) => (b.onclick = () => {
  S.mode = b.dataset.mode; renderMode();
  if (sample && S.mode !== "manual") { doSlice(); refreshAll(); save(); say(`Cut into ${slices.length} slices.`); }
  save();
}));
let sensTimer = 0;
$("fSens").oninput = () => {
  S.sens = +$("fSens").value; $("oSens").textContent = Math.round(S.sens * 100) + "%";
  clearTimeout(sensTimer); sensTimer = setTimeout(() => { if (sample && S.mode === "hits") { doSlice(); refreshAll(); save(); say(`Found ${slices.length} hits.`); } }, 120);
};
$("fParts").onchange = () => { S.parts = +$("fParts").value; if (sample) { doSlice(); refreshAll(); } save(); };
$("fFromHit").onchange = () => { S.fromHit = $("fFromHit").checked; if (sample) { doSlice(); refreshAll(); } save(); };
$("clearCuts").onclick = () => { if (!sample) return; snap(); slices = [0]; applyManual(); S.sel = 0; refreshAll(); save(); };
$("bpmHalf").onclick = () => { retime(Math.max(50, Math.round(S.bpm * 5) / 10)); $("fBpm").value = S.bpm; renderBpm(); save(); };
$("bpmDouble").onclick = () => { retime(Math.min(200, Math.round(S.bpm * 20) / 10)); $("fBpm").value = S.bpm; renderBpm(); save(); };
const taps = [];
function tap() {
  const now = performance.now();
  if (taps.length && now - taps[taps.length - 1] > 2000) taps.length = 0;
  taps.push(now); if (taps.length > 12) taps.shift();
  const r = tapTempo(taps);
  if (r) { retime(Math.max(50, Math.min(200, Math.round(r.bpm * 10) / 10))); $("fBpm").value = S.bpm; S.bpmNote = `Tapped: <b>${S.bpm} BPM</b>.`; renderBpm(); save(); }
  else { $("bpmInfo").textContent = "Keep tapping..."; }
}
$("tapBtn").onclick = tap;
function renderBpm() { $("bpmInfo").innerHTML = S.bpmNote || "Load a sample and the tempo is found for you."; }

// MIDI
let midi = null;
$("midiBtn").onclick = async () => {
  if (!navigator.requestMIDIAccess) { $("midiInfo").textContent = "This browser doesn't do MIDI. Chrome and Edge do."; return; }
  try {
    midi = await navigator.requestMIDIAccess({ sysex: false });
    const hook = () => { let names = []; for (const inp of midi.inputs.values()) { inp.onmidimessage = onMidi; names.push(inp.name); } $("midiInfo").textContent = names.length ? `Listening to ${names.join(", ")}. Notes 36 to 51 play pads 1 to 16.` : "No MIDI device found yet. Plug one in."; };
    midi.onstatechange = hook; hook();
  } catch { $("midiInfo").textContent = "MIDI wasn't allowed. You can allow it in the site settings (the icon left of the address)."; }
};
function onMidi(e) {
  const m = parseMidi(e.data); if (!m) return;
  const i = padForNote(m.note);
  if (m.type === "on") hit(i, m.velocity, "m" + m.note); else release("m" + m.note);
}

// ---- lo-fi tab
const LOFI = [
  ["lCrackle", "oCrackle", "crackle", (v) => Math.round(v * 100) + "%"],
  ["lTape", "oTape", "tape", (v) => Math.round(v * 100) + "%"],
  ["lBits", "oBits", "bits", (v) => (v >= 16 ? "off" : v + "-bit")],
  ["lRate", "oRate", "rate", null],
  ["lLow", "oLow", "lowpass", (v) => (v >= 20000 ? "off" : (v / 1000).toFixed(1) + " k")],
  ["lPump", "oPump", "pump", (v) => Math.round(v * 100) + "%"],
];
function renderLofi() {
  $("lOn").checked = S.lofiOn;
  $("lDust").value = S.dust; $("oDust").textContent = Math.round(S.dust * 100) + "%";
  for (const [i, o, k, f] of LOFI) {
    if (k === "rate") { const idx = Math.max(0, RATES.indexOf(S.lofi.rate)); $(i).value = idx; $(o).textContent = RATE_LABEL[idx]; continue; }
    $(i).value = S.lofi[k]; $(o).textContent = f(S.lofi[k]);
  }
}
$("lOn").onchange = () => { S.lofiOn = $("lOn").checked; sendLofi(); save(); };
$("lDust").oninput = () => {
  S.dust = +$("lDust").value;
  const d = dust(S.dust);
  S.lofi = S.dust < 0.01 ? { ...LOFI_OFF } : { ...S.lofi, ...d, rate: RATES.reduce((a, r) => (Math.abs(r - d.rate) < Math.abs(a - d.rate) ? r : a), 0) };
  renderLofi(); sendLofi(); save();
};
for (const [i, , k] of LOFI) $(i).oninput = () => {
  S.lofi = { ...S.lofi, [k]: k === "rate" ? RATES[+$(i).value] : +$(i).value };
  renderLofi(); sendLofi(); save();
};

// ---- exports
const downloads = [];
function addDownload(blob, name, label) {
  const old = downloads.findIndex((d) => d.name === name);
  if (old >= 0) { URL.revokeObjectURL(downloads[old].url); downloads.splice(old, 1); }
  downloads.unshift({ name, url: URL.createObjectURL(blob), label, size: blob.size });
  const box = $("downloads"); box.textContent = "";
  for (const d of downloads) { const a = document.createElement("a"); a.href = d.url; a.download = d.name; a.innerHTML = `<span></span><small>${d.size > 1048576 ? (d.size / 1048576).toFixed(1) + " MB" : Math.ceil(d.size / 1024) + " KB"}</small>`; a.firstChild.textContent = d.label; box.append(a); }
}
const baseName = () => (sample?.name || "beat").replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]+/g, "").trim().slice(0, 50) || "beat";
const lofiForExport = () => (S.lofiOn && JSON.stringify({ ...S.lofi, bpm: 0 }) !== JSON.stringify({ ...LOFI_OFF, bpm: 0 }) ? { ...S.lofi } : null);
let lastExport = null, busy = false;
async function mp3Of(l, r, fs) {
  return new Promise((resolve, reject) => {
    const w = new Worker("mp3-worker.js");
    w.onmessage = (e) => { if (e.data.type === "done") { resolve(e.data.mp3); w.terminate(); } else if (e.data.type === "progress") $("expStatus").textContent = `Encoding MP3... ${e.data.pct}%`; };
    w.onerror = (e) => { w.terminate(); reject(new Error(e.message || "MP3 encoder failed")); };
    w.postMessage({ l, r, fs: fs === 44100 || fs === 48000 || fs === 32000 ? fs : 44100, kbps: 320 });
  });
}
$("expPattern").onclick = async () => {
  if (busy || !sample) return;
  if (!pattern.steps.some((r) => r.some((v) => v > 0))) { $("expStatus").textContent = "The pattern is empty. Add some steps first (or press Start me off in the Pattern tab)."; return; }
  busy = true; $("expStatus").textContent = "Rendering...";
  await new Promise((r) => setTimeout(r, 20));
  try {
    let fs = sample.fs, src = sample;
    const fmt = $("eFmt").value;
    // MP3 needs a standard rate; render at 44.1k from a resampled copy if the sample is odd
    if (fmt === "mp3" && ![32000, 44100, 48000].includes(fs)) { src = { ...sample, chans: sample.chans.map((c) => resampleLin(c, fs, 44100)), fs: 44100 }; fs = 44100; }
    const padsAt = src === sample ? pads : pads.map((p) => (p.empty ? p : { ...p, start: Math.round((p.start * 44100) / sample.fs), end: Math.round((p.end * 44100) / sample.fs) }));
    const out = renderPattern(pattern, padsAt, src, S.bpm, S.swing, { loops: +$("eLoops").value, loopReady: $("eLoop").checked, lofi: lofiForExport() });
    let blob, ext;
    if (fmt === "mp3") { const mp3 = await mp3Of(out[0], out[1], fs); blob = new Blob([mp3], { type: "audio/mpeg" }); ext = "mp3"; }
    else { blob = new Blob([encodeWav(out, fs, fmt === "wav24" ? 24 : 16)], { type: "audio/wav" }); ext = "wav"; }
    const name = `${baseName()} ${Math.round(S.bpm)} BPM.${ext}`;
    addDownload(blob, name, `Pattern x${$("eLoops").value} (${(out[0].length / fs).toFixed(1)} s, ${ext.toUpperCase()})`);
    lastExport = { kind: "pattern", name, frames: out[0].length, fs, format: ext, peakDb: gainToDb(peak(out)), size: blob.size };
    $("expStatus").textContent = `Ready below: ${(out[0].length / fs).toFixed(2)} s at ${S.bpm} BPM, peak ${gainToDb(peak(out)).toFixed(1)} dB.`;
  } catch (e) { $("expStatus").textContent = "The export stopped: " + (e.message || e); }
  busy = false;
};
function resampleLin(x, a, b) { const n = Math.round((x.length * b) / a), o = new Float32Array(n), st = a / b; for (let i = 0; i < n; i++) { const p = i * st, j = Math.floor(p), f = p - j; o[i] = (x[j] || 0) + ((x[j + 1] ?? x[j] ?? 0) - (x[j] || 0)) * f; } return o; }
$("expSlices").onclick = async () => {
  if (busy || !sample) return;
  busy = true; $("expStatus").textContent = "Cutting the slices...";
  try {
    const entries = [], lf = $("eSliceLofi").checked ? lofiForExport() : null, base = baseName();
    pads.forEach((p, i) => {
      if (p.empty) return;
      let a = padAudio(sample.chans, sample.fs, p);
      if (a[0].length === 0) return;
      if (lf) { const ch = new LofiChain(sample.fs, 2, 21 + i); ch.set({ ...lf, pump: 0, bpm: S.bpm }); a = [a[0].slice(), (a[1] || a[0]).slice()]; ch.process(a, 0); }
      entries.push({ name: `${base}/Pad ${String(i + 1).padStart(2, "0")}.wav`, blob: new Blob([encodeWav(a.length === 1 ? [a[0], a[0]] : a, sample.fs, 16)]) });
    });
    const blob = await zip(entries);
    addDownload(blob, `${base} slices.zip`, `${entries.length} slices (.zip of WAVs)`);
    lastExport = { kind: "slices", count: entries.length, size: blob.size };
    $("expStatus").textContent = `${entries.length} slices ready below.`;
  } catch (e) { $("expStatus").textContent = "The export stopped: " + (e.message || e); }
  busy = false;
};
$("bounceBtn").onclick = () => {
  if (!sample || !pattern.steps.some((r) => r.some((v) => v > 0))) { $("expStatus").textContent = "Make a pattern first, then bounce it."; return; }
  const out = renderPattern(pattern, pads, sample, S.bpm, S.swing, { loops: 1, loopReady: true, lofi: lofiForExport() });
  snap(); undo[undo.length - 1] = JSON.stringify({ ...JSON.parse(undo[undo.length - 1]), sampleMark: true }); sampleUndo.push(sample);
  S.mode = "equal"; S.parts = 16; S.fromHit = false;
  pattern = emptyPattern(pattern.bars);
  setSample({ chans: out, fs: sample.fs, name: `${baseName()} (bounced)` }, false);
  S.bpmNote = `Bounced at <b>${S.bpm} BPM</b>.`;
  renderBpm(); renderMode();
  $("expStatus").textContent = `Bounced into a new ${(out[0].length / sample.fs).toFixed(2)} s sample, cut into 16 equal parts. Undo brings the old sample back.`;
};

// ---- a demo loop to practise on (made here, no recordings): 2 bars at 90 BPM
function demoLoop() {
  const fs = 44100, bpm = 90, beat = 60 / bpm, n = Math.round(beat * 8 * fs);
  const L = new Float32Array(n), R = new Float32Array(n);
  let seed = 9;
  const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296 - 0.5; };
  const add = (at, v, pan = 0) => { if (at >= 0 && at < n) { L[at] += v * (1 - pan); R[at] += v * (1 + pan); } };
  const kick = (t, a) => { let ph = 0; const s = Math.round(t * fs); for (let i = 0; i < fs * 0.4; i++) { const f = 48 + 100 * Math.exp(-i / (fs * 0.025)); ph += 2 * Math.PI * f / fs; add(s + i, a * Math.sin(ph) * Math.exp(-i / (fs * 0.14))); } };
  const snare = (t, a) => { const s = Math.round(t * fs); let lp = 0; for (let i = 0; i < fs * 0.25; i++) { lp += (rnd() - lp) * 0.5; add(s + i, a * (lp * 1.6 * Math.exp(-i / (fs * 0.06)) + 0.35 * Math.sin(2 * Math.PI * 185 * i / fs) * Math.exp(-i / (fs * 0.05))), 0.05); } };
  const hat = (t, a) => { const s = Math.round(t * fs); let p = 0; for (let i = 0; i < fs * 0.05; i++) { const v = rnd(); add(s + i, a * (v - p) * Math.exp(-i / (fs * 0.01)), -0.2); p = v; } };
  const sw = (k) => (k % 2 ? (Math.floor(k / 2) * 2 + 2 * 0.57) : k) * beat / 4;
  for (let bar = 0; bar < 2; bar++) {
    const b0 = bar * beat * 4;
    kick(b0, 0.85); kick(b0 + sw(10), 0.7); if (bar === 1) kick(b0 + sw(7), 0.5);
    snare(b0 + beat, 0.55); snare(b0 + beat * 3, 0.55);
    for (let k = 0; k < 16; k += 2) hat(b0 + sw(k), k % 4 ? 0.18 : 0.26);
    hat(b0 + sw(15), 0.12);
  }
  // a soft electric-piano chord on each bar (Fmaj9, then Em7)
  const chords = [[53, 57, 60, 64, 67], [52, 55, 59, 62, 64]];
  chords.forEach((ch, bar) => {
    const s0 = Math.round(bar * beat * 4 * fs), len = Math.round(beat * 4 * fs);
    for (const m of ch) {
      const f = 440 * Math.pow(2, (m - 69) / 12);
      for (let i = 0; i < len; i++) {
        const t = i / fs, env = Math.min(1, i / 300) * Math.exp(-t * 0.9) * Math.min(1, (len - i) / 2000);
        const trem = 1 + 0.15 * Math.sin(2 * Math.PI * 4.5 * t);
        const v = (Math.sin(2 * Math.PI * f * t) + 0.25 * Math.sin(4 * Math.PI * f * t) * Math.exp(-t * 3)) * env * trem * 0.045;
        L[s0 + i] += v * (1 - (m % 2 ? 0.25 : -0.25)); R[s0 + i] += v * (1 + (m % 2 ? 0.25 : -0.25));
      }
    }
  });
  const pk = Math.max(peak([L, R]), 1e-6);
  for (let i = 0; i < n; i++) { L[i] *= 0.89 / pk; R[i] *= 0.89 / pk; }
  return { chans: [L, R], fs, name: "Demo loop (90 BPM)" };
}
$("demoBtn").onclick = () => { if (sample) snap(); S.mode = "hits"; renderMode(); setSample(demoLoop(), true); };
$("loadBtn").onclick = () => $("fileIn").click();
$("fileIn").accept = ACCEPT;
$("fileIn").onchange = (e) => { if (e.target.files[0]) loadFile(e.target.files[0]); e.target.value = ""; };
document.addEventListener("dragover", (e) => { if (e.dataTransfer?.types?.includes("Files")) e.preventDefault(); });
document.addEventListener("drop", (e) => { if (e.dataTransfer?.files?.[0]) { e.preventDefault(); loadFile(e.dataTransfer.files[0]); } });

// ---- keys
const keyDown = new Set();
document.addEventListener("keydown", (e) => {
  if (e.target.closest?.("input[type=text], input[type=number], textarea, select")) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); doUndo(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (e.code === "Space") { e.preventDefault(); if (e.repeat) return; $("playBtn").click(); return; }
  const i = KEYS.indexOf(k);
  if (i >= 0) { e.preventDefault(); if (e.repeat || keyDown.has(k)) return; keyDown.add(k); hit(i, 110, "k" + k); return; }
  if (k === "t" && !e.repeat) { tap(); return; }
  if (e.key === "Enter" && !e.repeat && !e.target.closest?.("button, a")) { e.preventDefault(); setRec(!recording); }
});
document.addEventListener("keyup", (e) => { const k = e.key.toLowerCase(); if (keyDown.delete(k)) release("k" + k); });
window.addEventListener("blur", () => { keyDown.clear(); for (const key of [...held.keys()]) release(key); });

// ---- tabs
document.querySelectorAll(".tabBar button").forEach((b) => (b.onclick = () => {
  document.querySelectorAll(".tabBar button").forEach((x) => x.classList.toggle("on", x === b));
  document.querySelectorAll(".tabBody > section").forEach((s) => s.classList.toggle("show", s.dataset.tab === b.dataset.tab));
  if (b.dataset.tab === "pattern") requestAnimationFrame(drawGrid);
}));
window.addEventListener("resize", () => { peaks = null; drawWave(); renderPads(); drawGrid(); });
document.addEventListener("pointerdown", () => { if (ctx && ctx.state !== "running") ctx.resume(); }, true);

function refreshAll() {
  renderMode(); renderPads(); renderPadPanel(); renderSteps(); drawWave(); drawGrid(); renderBpm(); renderLofi();
  $("fBpm").value = S.bpm; $("fSwing").value = Math.round(S.swing * 100); $("oSwing").textContent = `${Math.round(S.swing * 100)}% ${swingLabel(S.swing * 100)}`;
  $("fSens").value = S.sens; $("oSens").textContent = Math.round(S.sens * 100) + "%";
  $("fParts").value = String(S.parts); $("fFromHit").checked = S.fromHit; $("fClick").checked = S.click; $("fQuant").checked = S.quant;
  $("fBars").value = String(pattern.bars);
  $("sampleName").innerHTML = sample ? `<b></b> ${(sample.chans[0].length / sample.fs).toFixed(2)} s, ${slices.length || pads.filter((p) => !p.empty).length} slices` : "No sample yet";
  if (sample) $("sampleName").querySelector("b").textContent = sample.name;
  $("waveInfo").textContent = sample ? `${S.bpm} BPM` : "";
  for (const id of ["expPattern", "expSlices", "bounceBtn"]) $(id).disabled = !sample;
  $("undoBtn").disabled = !undo.length;
}

// for the flow test
window.__chop = () => ({
  sample: sample ? { name: sample.name, frames: sample.chans[0].length, fs: sample.fs } : null,
  slices: [...slices], pads: pads.map((p) => (p.empty ? null : { start: p.start, end: p.end, pitch: p.pitch, reverse: p.reverse, gain: p.gain })),
  sel: S.sel, mode: S.mode, bpm: S.bpm, swing: S.swing, playing: !!seq, recording, step: currentStep(),
  hits: pattern.steps.reduce((a, r) => a + r.filter((v) => v > 0).length, 0), bars: pattern.bars,
  pattern: pattern.steps.map((r) => r.map((v) => (v > 0 ? 1 : 0)).join("")),
  lofi: { ...S.lofi }, lofiOn: S.lofiOn, worklet: !!lofiNode, lastExport, downloads: downloads.map((d) => d.name), undo: undo.length,
  ctxTime: ctx ? ctx.currentTime : 0,
});

// ---- start
buildPads(); buildSteps();
(async () => {
  const had = await load();
  refreshAll();
  if (had) say(`Welcome back: ${sample.name} is loaded.`);
})();
