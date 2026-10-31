import { STYLES, TARGETS } from "./master-core.js";
import { PLATFORMS, DEVICES, platformGain } from "./streaming.js";
import { wavFile, id3, fileName } from "./tags.js";
import { fillGenreSelect } from "./genres.js";

const $ = (id) => document.getElementById(id);
const savedView = (() => { try { return localStorage.getItem("encore-master-view"); } catch { return null; } })();
const state = { platform: "off", device: "studio", masterStats: null, origPeakDb: 0, ref: null, refTone: [0, 0, 0, 0, 0], refGlue: 0.5, refMatch: false, refTargetLufs: null, view: savedView || "colours", compare: false, bandsOn: { low: true, mid: true, high: true }, style: 0, intensity: 0.5, eq: { low: 0, mid: 0, high: 0 }, target: 0, buffer: null, name: "", playing: false, offset: 0, startedAt: 0, originalLufs: null };
let ctx, node, source, worker, wasmBytes, learnTimer, learnId = 0, analyser, outGain, devIn, devOut, devNodes = [];
let origPeaks = null, masterPeaks = null; // per waveform column, linear (1 = 0 dBFS)
let masterBands = null, origBands = null; // per column: low, mid, high RMS

// ---------- boot ----------
wasmBytes = await (await fetch("master.wasm")).arrayBuffer();
worker = new Worker("worker.js", { type: "module" });
worker.postMessage({ type: "init", wasm: wasmBytes.slice(0) });
worker.onmessage = onWorker;

buildButtons();
drawSpectrum();

// ---------- file loading ----------
const drop = $("drop"), file = $("file");
drop.addEventListener("click", () => file.click());
drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); file.click(); } });
drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); if (e.dataTransfer.files[0]) load(e.dataTransfer.files[0]); });
file.addEventListener("change", () => { if (file.files[0]) load(file.files[0]); });
$("another").addEventListener("click", () => { stop(); file.value = ""; file.click(); });

async function ensureAudio() {
  if (ctx) return;
  ctx = new AudioContext({ latencyHint: "playback" });
  await ctx.audioWorklet.addModule("worklet.js");
  node = new AudioWorkletNode(ctx, "encore-master", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
  analyser = ctx.createAnalyser();
  analyser.fftSize = 8192;
  analyser.smoothingTimeConstant = 0.75;
  // worklet -> platform level -> device simulation -> speakers; the spectrum
  // listens after the device, so it shows what you actually hear
  outGain = ctx.createGain(); devIn = ctx.createGain(); devOut = ctx.createGain();
  node.connect(outGain).connect(devIn);
  devOut.connect(ctx.destination); devOut.connect(analyser);
  applyDevice();
  node.port.onmessage = (e) => { if (e.data.type === "meters") showMeters(e.data); };
  node.port.postMessage({ type: "init", wasm: wasmBytes.slice(0) });
  sendSettings();
}

async function load(f) {
  stop();
  await ensureAudio();
  status(`Opening ${f.name}...`);
  let buf;
  try { buf = await ctx.decodeAudioData(await f.arrayBuffer()); }
  catch { status("Couldn't read that file. Try a WAV or MP3."); return; }

  state.buffer = buf; state.name = f.name; state.offset = 0; state.originalLufs = null;
  drop.classList.add("hidden"); $("hero").classList.add("hidden"); $("app").classList.remove("hidden");
  $("songName").textContent = f.name;
  $("another").classList.remove("hidden");
  $("scrub").max = buf.duration.toFixed(2);
  $("result").textContent = "";
  $("mixList").replaceChildren();
  $("mixSummary").textContent = "checking your mix..."; $("mixSummary").className = "";
  $("origLufs").textContent = "--";
  const l0 = buf.getChannelData(0), r0 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : l0;
  origPeaks = new Float32Array(1200); masterPeaks = null; masterBands = null; origBands = null;
  const per = Math.ceil(l0.length / 1200);
  for (let c = 0; c < 1200; c++) { let m = 0; for (let i = c * per; i < Math.min((c + 1) * per, l0.length); i += 2) m = Math.max(m, Math.abs(l0[i]), Math.abs(r0[i])); origPeaks[c] = m; }
  state.origPeakDb = 20 * Math.log10(Math.max(...origPeaks) + 1e-12);
  state.masterStats = null;
  renderStreaming();
  drawWave();
  updateTime();

  const l = buf.getChannelData(0), r = buf.numberOfChannels > 1 ? buf.getChannelData(1) : buf.getChannelData(0);
  worker.postMessage({ type: "song", l: l.slice(0), r: r.slice(0), fs: buf.sampleRate });
  relearn(true);
}

// ---------- learning (runs in the worker, result goes to the live engine) ----------
function relearn(now) {
  clearTimeout(learnTimer);
  learnTimer = setTimeout(() => {
    status("Listening to the song...");
    $("play").disabled = $("export").disabled = state.buffer === null;
    $("waveStatus").textContent = "Updating waveform...";
    if (state.ref && !state.refMatch) worker.postMessage({ type: "refCompare", settings: settings() });
    worker.postMessage({ type: "preview", id: ++learnId, settings: settings() });
  }, now ? 0 : 250);
}

function onWorker(e) {
  const d = e.data;
  if (d.type === "masterStats") {
    if (d.id !== learnId) return;
    state.masterStats = { lufs: d.lufs, peakDb: d.peakDb };
    renderStreaming(); sendMatch();
  } else if (d.type === "refLoaded") {
    state.ref.wholeLufs = d.wholeLufs; state.ref.start = d.start;
    $("refList").replaceChildren(note("Comparing with your master..."));
  } else if (d.type === "refReport") {
    showRefDiffs(d.differences);
  } else if (d.type === "refMatched") {
    state.refTone = d.refTone; state.refGlue = d.glue; state.refTargetLufs = d.targetLufs; state.refMatch = true;
    $("refMatch").disabled = false; $("refMatch").classList.add("on"); $("refMatch").textContent = "Matched (undo)";
    refreshButtons(); sendSettings(); relearn();
    showRefDiffs(d.after, d.before);
  } else if (d.type === "mixcheck") {
    showMixCheck(d.report);
  } else if (d.type === "origBands") {
    origBands = d.bands;
    drawWave();
  } else if (d.type === "analysed") {
    state.originalLufs = d.originalLufs;
    renderStreaming();
    $("origLufs").textContent = `${d.originalLufs.toFixed(1)} LUFS`;
    sendMatch();
  } else if (d.type === "learned") {
    if (d.id !== learnId) return; // a newer change is already on its way
    node?.port.postMessage({ type: "learned", learned: d.learned });
    $("play").disabled = false; $("export").disabled = false;
    status(state.playing ? "" : "Ready. Press Play.");
  } else if (d.type === "peaks") {
    if (d.id !== learnId) return;
    if (!masterPeaks || masterPeaks.length !== d.peaks.length) masterPeaks = new Float32Array(d.peaks.length);
    masterPeaks.set(d.peaks.subarray(0, d.doneCols)); // sweep the new waveform in from the left
    if (!masterBands || masterBands.length !== d.bands.length) masterBands = new Float32Array(d.bands.length);
    masterBands.set(d.bands.subarray(0, d.doneCols * 3));
    if (d.final) $("waveStatus").textContent = "";
    drawWave();
  } else if (d.type === "progress") {
    $("expStatus").textContent = d.text;
  } else if (d.type === "rendered") {
    finishExport(d);
  }
}

// ---------- settings ----------
function settings() {
  // Low / Mid / High drive the engine's own broad EQ (160 Hz shelf, 1.2 kHz, 5 kHz shelf)
  return { style: state.style, intensity: state.intensity,
           targetLufs: state.refMatch ? state.refTargetLufs : TARGETS[state.target].lufs,
           eq: { ...state.eq },
           refTone: state.refMatch ? state.refTone : [0, 0, 0, 0, 0],
           glue: state.refMatch ? state.refGlue : 0.5 };
}
function sendSettings() {
  node?.port.postMessage({ type: "settings", settings: settings() });
  $("targetLufs").textContent = `${settings().targetLufs.toFixed(1)} LUFS${state.refMatch ? " (ref)" : ""}`;
  sendMatch();
}
// A/B levels. Normally the original is matched to the master's loudness.
// "Listen as <platform>": each version plays at that platform's level
// instead, the way listeners will actually hear it.
function sendMatch() {
  if (state.originalLufs === null || !node) return;
  const masterLufs = state.masterStats?.lufs ?? settings().targetLufs;
  const p = PLATFORMS.find((x) => x.id === state.platform);
  if (!p) {
    const db = Math.max(-24, Math.min(24, masterLufs - state.originalLufs));
    node.port.postMessage({ type: "match", gain: Math.pow(10, db / 20) });
    outGain?.gain.setTargetAtTime(1, ctx.currentTime, 0.02);
    return;
  }
  const gM = platformGain(p, masterLufs, state.masterStats?.peakDb ?? -1);
  const gO = platformGain(p, state.originalLufs, state.origPeakDb);
  node.port.postMessage({ type: "match", gain: Math.pow(10, (gO - gM) / 20) }); // original relative to master
  outGain.gain.setTargetAtTime(Math.pow(10, gM / 20), ctx.currentTime, 0.02);
}

function applyDevice() {
  if (!ctx) return;
  devIn.disconnect(); devNodes.forEach((n) => n.disconnect()); devNodes = [];
  const d = DEVICES.find((x) => x.id === state.device) ?? DEVICES[0];
  let last = devIn;
  if (d.mono) { const m = ctx.createGain(); m.channelCount = 1; m.channelCountMode = "explicit"; m.channelInterpretation = "speakers"; devNodes.push(m); last.connect(m); last = m; }
  for (const f of d.filters) {
    const b = ctx.createBiquadFilter();
    b.type = f.type; b.frequency.value = f.frequency; if (f.Q) b.Q.value = f.Q; if (f.gain) b.gain.value = f.gain;
    devNodes.push(b); last.connect(b); last = b;
  }
  last.connect(devOut);
}

function renderStreaming() {
  const rows = $("platRows"); rows.replaceChildren();
  const fmtDb = (v) => { const span = document.createElement("span"); span.className = v < -0.05 ? "down" : v > 0.05 ? "up" : "flat"; span.textContent = Math.abs(v) < 0.05 ? "0.0 dB" : `${v > 0 ? "+" : ""}${v.toFixed(1)} dB`; return span; };
  const masterLufs = state.masterStats?.lufs, origLufs = state.originalLufs;
  const addRow = (id, label, gm, go) => {
    const tr = document.createElement("tr"); tr.className = "row" + (state.platform === id ? " sel" : "");
    const a = document.createElement("td"); a.textContent = label;
    const b = document.createElement("td"); const c = document.createElement("td");
    if (gm === null) { b.textContent = masterLufs ? `${masterLufs.toFixed(1)} LUFS` : "..."; c.textContent = origLufs !== null ? `${origLufs.toFixed(1)} LUFS` : "..."; }
    else { b.append(gm === undefined ? "..." : fmtDb(gm)); c.append(go === undefined ? "..." : fmtDb(go)); }
    tr.append(a, b, c);
    tr.addEventListener("click", () => { state.platform = id; renderStreaming(); sendMatch(); });
    rows.append(tr);
  };
  addRow("off", "Studio (no normalization)", null, null);
  for (const p of PLATFORMS) addRow(p.id, p.name,
    masterLufs === undefined ? undefined : platformGain(p, masterLufs, state.masterStats.peakDb),
    origLufs === null ? undefined : platformGain(p, origLufs, state.origPeakDb));
}

function buildDevices() {
  const box = $("devices"); box.replaceChildren();
  for (const d of DEVICES) {
    const b = document.createElement("button"); b.textContent = d.name;
    b.classList.toggle("on", d.id === state.device);
    b.addEventListener("click", () => { state.device = d.id; buildDevices(); applyDevice(); });
    box.append(b);
  }
}

function buildButtons() {
  const styles = $("styles");
  STYLES.slice(0, 4).forEach((s, i) => { // only the styles fitted to measurements
    const b = document.createElement("button");
    b.textContent = s.name;
    b.addEventListener("click", () => { state.style = i; refreshButtons(); sendSettings(); relearn(); });
    styles.appendChild(b);
  });
  const targets = $("targets");
  TARGETS.forEach((t, i) => {
    const b = document.createElement("button");
    b.innerHTML = `${t.name}<br><small style="opacity:.75">${t.lufs} LUFS</small>`;
    b.addEventListener("click", () => { state.target = i; if (state.refMatch) unmatch(); refreshButtons(); sendSettings(); relearn(); });
    targets.appendChild(b);
  });
  const inten = $("intensity");
  inten.addEventListener("input", () => {
    state.intensity = inten.value / 100;
    const v = Number(inten.value);
    $("intensityVal").textContent = v === 50 ? "Normal" : v < 50 ? `Light (${v}%)` : `Heavy (${v}%)`;
    sendSettings(); relearn();
  });
  for (const band of ["low", "mid", "high"]) {
    const id = "eq" + band[0].toUpperCase() + band.slice(1), el = $(id);
    const set = (v) => { el.value = v; state.eq[band] = Number(v); $(id + "Val").textContent = `${v > 0 ? "+" : ""}${Number(v).toFixed(1)} dB`; sendSettings(); relearn(); };
    el.addEventListener("input", () => set(el.value));
    el.addEventListener("dblclick", () => set(0));
  }
  $("abMaster").addEventListener("click", () => setCompare(false));
  $("abOriginal").addEventListener("click", () => setCompare(true));
  setupTransport();
  setupViews();
  setupReference();
  buildDevices();
  renderStreaming();
  setupExport();
  refreshButtons();
  $("intensityVal").textContent = "Normal";
}

function refreshButtons() {
  [...$("styles").children].forEach((b, i) => { b.classList.toggle("on", i === state.style); b.setAttribute("aria-pressed", i === state.style); });
  [...$("targets").children].forEach((b, i) => { const on = !state.refMatch && i === state.target; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); });
  $("blurb").textContent = STYLES[state.style].blurb;
}

function setCompare(on) {
  node?.port.postMessage({ type: "compare", on });
  state.compare = on;
  refreshViewControls();
  drawWave();
  $("abMaster").classList.toggle("on", !on);
  $("abOriginal").classList.toggle("on", on);
}

// ---------- transport ----------
const ICON_PLAY = "M7 5v14l12-7z", ICON_PAUSE = "M6 5h4v14H6zM14 5h4v14h-4z";
let scrubbing = null; // position (s) being dragged to, or null

function setPlayIcon(playing) {
  $("playIcon").setAttribute("d", playing ? ICON_PAUSE : ICON_PLAY);
  $("play").setAttribute("aria-label", playing ? "Pause" : "Play");
}

async function play() {
  if (!state.buffer || state.playing) return;
  stopReference();
  if (ctx.state !== "running") await ctx.resume(); // only waits the first time
  source = ctx.createBufferSource();
  source.buffer = state.buffer;
  source.connect(node);
  const me = source;
  source.onended = () => {
    // reached the end by itself (not paused / seeked)
    if (me === source && state.playing && ctx.currentTime - state.startedAt >= state.buffer.duration - 0.05) {
      state.playing = false; state.offset = 0; setPlayIcon(false); drawWave(); updateTime();
    }
  };
  source.start(0, state.offset);
  state.startedAt = ctx.currentTime - state.offset;
  state.playing = true;
  setPlayIcon(true);
  status("");
  requestAnimationFrame(tick);
}
function pause() {
  if (!state.playing) return;
  state.offset = Math.min(state.buffer.duration, ctx.currentTime - state.startedAt);
  state.playing = false;
  source?.stop();
  setPlayIcon(false);
}
function stop() { pause(); state.offset = 0; drawWave(); updateTime(); }

// Jump to t seconds, keep playing if we were
function seekTo(t) {
  if (!state.buffer) return;
  const was = state.playing;
  if (was) pause();
  state.offset = Math.max(0, Math.min(state.buffer.duration - 0.05, t));
  drawWave(); updateTime(); // show the new position right away
  if (was) play();
}

function setupTransport() {
  $("play").addEventListener("click", () => (state.playing ? pause() : play()));
  $("stop").addEventListener("click", stop);
  $("rw").addEventListener("click", () => seekTo(position() - 10));
  $("ff").addEventListener("click", () => seekTo(position() + 10));

  // drag bar: preview while dragging, jump on release
  const scrub = $("scrub");
  scrub.addEventListener("input", () => { scrubbing = Number(scrub.value); drawWave(); updateTime(); });
  scrub.addEventListener("change", () => { const t = Number(scrub.value); scrubbing = null; seekTo(t); });

  // click or drag directly on the waveform
  const wave = $("wave");
  const timeAt = (e) => { const r = wave.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * (state.buffer?.duration ?? 0); };
  wave.addEventListener("pointerdown", (e) => { if (!state.buffer) return; wave.setPointerCapture(e.pointerId); scrubbing = timeAt(e); drawWave(); updateTime(); });
  wave.addEventListener("pointermove", (e) => { if (scrubbing === null || !wave.hasPointerCapture(e.pointerId)) return; scrubbing = timeAt(e); drawWave(); updateTime(); });
  wave.addEventListener("pointerup", (e) => { if (scrubbing === null) return; const t = timeAt(e); scrubbing = null; seekTo(t); });

  // keyboard: Space play/pause, arrows +/-10 s (unless typing or on a slider)
  document.addEventListener("keydown", (e) => {
    if (!state.buffer || e.target.closest?.("input, select, textarea")) return;
    if (e.code === "Space" && !e.target.closest?.("button")) { e.preventDefault(); state.playing ? pause() : play(); }
    else if (e.code === "ArrowLeft") { e.preventDefault(); seekTo(position() - 10); }
    else if (e.code === "ArrowRight") { e.preventDefault(); seekTo(position() + 10); }
  });
}

function tick() {
  if (!state.playing) return;
  drawWave(); updateTime(); drawSpectrum();
  requestAnimationFrame(tick);
}
function position() {
  if (scrubbing !== null) return scrubbing;
  return state.playing ? ctx.currentTime - state.startedAt : state.offset;
}
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
function updateTime() {
  if (!state.buffer) return;
  const p = position();
  $("time").textContent = `${fmt(p)} / ${fmt(state.buffer.duration)}`;
  if (scrubbing === null || document.activeElement !== $("scrub")) $("scrub").value = p.toFixed(2);
}

// ---------- mix check ----------
function showMixCheck(rep) {
  const { problems, warnings } = rep.summary;
  const sum = $("mixSummary");
  sum.textContent = problems + warnings === 0 ? "looks good" : [problems && `${problems} problem${problems > 1 ? "s" : ""}`, warnings && `${warnings} to look at`].filter(Boolean).join(", ");
  sum.className = problems ? "bad" : problems + warnings === 0 ? "ok" : "";
  const list = $("mixList");
  list.replaceChildren();
  for (const f of rep.findings) {
    const el = document.createElement("div");
    el.className = "finding";
    const dot = document.createElement("span"); dot.className = `dot ${f.severity}`; dot.title = f.severity;
    const title = document.createElement("b"); title.textContent = f.title;
    el.append(dot, title);
    if (f.severity !== "good") {
      const p = document.createElement("p"); p.textContent = f.detail; el.append(p);
      if (f.fix) { const fix = document.createElement("p"); fix.className = "fix"; fix.textContent = "Fix: " + f.fix; el.append(fix); }
    } else {
      const p = document.createElement("p"); p.textContent = f.detail; el.append(p);
    }
    if (f.times?.length) {
      const times = document.createElement("div"); times.className = "times";
      for (const t of f.times) {
        const b = document.createElement("button");
        b.textContent = fmt(t); b.title = "Jump here and play";
        b.addEventListener("click", () => { seekTo(Math.max(0, t - 1)); play(); });
        times.append(b);
      }
      el.append(times);
    }
    list.append(el);
  }
}

// ---------- reference ----------
const note = (t) => { const p = document.createElement("p"); p.className = "hint"; p.textContent = t; return p; };
let refSource = null, refGain = null;

function setupReference() {
  const panes = { tabMix: "mixList", tabRef: "refPane", tabStream: "streamPane" };
  const showTab = (tab) => {
    if (!panes[tab]) tab = "tabMix";
    for (const [t, p] of Object.entries(panes)) {
      const on = t === tab;
      $(t).classList.toggle("on", on); $(t).setAttribute("aria-selected", on); $(t).tabIndex = on ? 0 : -1;
      $(p).classList.toggle("hidden", !on);
    }
    try { localStorage.setItem("encore-master-tab", tab); } catch {}
  };
  for (const t of Object.keys(panes)) {
    $(t).addEventListener("click", () => showTab(t));
    $(t).addEventListener("keydown", (e) => { // arrow keys move between the tabs (WAI-ARIA tabs pattern) instead of seeking
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
      e.preventDefault(); e.stopPropagation();
      const ids = Object.keys(panes), i = ids.indexOf(t);
      const next = e.key === "Home" ? ids[0] : e.key === "End" ? ids[ids.length - 1] : ids[(i + (e.key === "ArrowRight" ? 1 : ids.length - 1)) % ids.length];
      showTab(next); $(next).focus();
    });
  }
  showTab((() => { try { return localStorage.getItem("encore-master-tab"); } catch { return null; } })()); // runs before saved() exists
  const pick = () => { $("refFile").value = ""; $("refFile").click(); };
  $("refLoad").addEventListener("click", pick);
  $("refChange").addEventListener("click", pick);
  $("refFile").addEventListener("change", () => { if ($("refFile").files[0]) loadReference($("refFile").files[0]); });
  $("refMatch").addEventListener("click", () => {
    if (state.refMatch) { unmatch(); return; }
    $("refMatch").disabled = true; $("refMatch").textContent = "Matching...";
    $("refList").replaceChildren(note("Listening to both and adjusting Master. A few seconds..."));
    worker.postMessage({ type: "matchRef", settings: { ...settings(), refTone: [0, 0, 0, 0, 0] } });
  });
  $("refListen").addEventListener("click", () => (refSource ? stopReference() : playReference()));
}

async function loadReference(f) {
  await ensureAudio();
  let buf;
  try { buf = await ctx.decodeAudioData(await f.arrayBuffer()); } catch { $("refList").replaceChildren(note("Couldn't read that file.")); return; }
  stopReference(); unmatch(false);
  state.ref = { name: f.name, buffer: buf };
  $("refEmpty").classList.add("hidden"); $("refLoaded").classList.remove("hidden");
  $("refName").textContent = f.name; $("refSummary").textContent = "loaded";
  $("refList").replaceChildren(note("Measuring the reference..."));
  const l = buf.getChannelData(0), r = buf.numberOfChannels > 1 ? buf.getChannelData(1) : l;
  worker.postMessage({ type: "reference", l: l.slice(0), r: r.slice(0), fs: buf.sampleRate, settings: settings() });
}

function unmatch(refresh = true) {
  state.refMatch = false; state.refTone = [0, 0, 0, 0, 0]; state.refTargetLufs = null;
  $("refMatch").classList.remove("on"); $("refMatch").disabled = false; $("refMatch").textContent = "Match it";
  if (refresh) { refreshButtons(); sendSettings(); relearn(); if (state.ref) worker.postMessage({ type: "refCompare", settings: settings() }); }
}

function showRefDiffs(after, before) {
  const list = $("refList"); list.replaceChildren();
  const block = (title, items, done) => {
    if (title) { const h = document.createElement("h4"); h.textContent = title; list.append(h); }
    if (!items.length) { list.append(note(done ? "Within about 1 dB everywhere: a close match." : "Very close already: no big differences.")); return; }
    for (const t of items) { const el = document.createElement("div"); el.className = "diff"; const dot = document.createElement("span"); dot.className = `dot${done ? " done" : ""}`; const p = document.createElement("span"); p.textContent = t; el.append(dot, p); list.append(el); }
  };
  if (before) { block("What was different", before, false); block("After matching", after, true); }
  else block("", after, false);
  $("refSummary").textContent = before ? "matched" : after.length ? `${after.length} difference${after.length > 1 ? "s" : ""}` : "close";
}

// The reference's loudest part, at the same loudness as your master
async function playReference() {
  if (!state.ref?.buffer) return;
  if (state.playing) pause();
  if (ctx.state !== "running") await ctx.resume();
  refGain = ctx.createGain();
  refGain.gain.value = Math.pow(10, (settings().targetLufs - (state.ref.wholeLufs ?? settings().targetLufs)) / 20);
  refSource = ctx.createBufferSource();
  refSource.buffer = state.ref.buffer;
  refSource.connect(refGain).connect(devIn); // through the device simulation too
  refSource.onended = () => stopReference();
  refSource.start(0, state.ref.start ?? 0);
  $("refListen").classList.add("on"); $("refListen").textContent = "Stop reference";
  const spin = () => { if (refSource) { drawSpectrum(); requestAnimationFrame(spin); } };
  requestAnimationFrame(spin);
}
function stopReference() {
  if (refSource) { try { refSource.stop(); } catch {} refSource.disconnect(); refGain?.disconnect(); }
  refSource = null; refGain = null;
  $("refListen").classList.remove("on"); $("refListen").textContent = "Hear reference";
}

// ---------- view switcher ----------
function setupViews() {
  for (const b of $("views").children) b.addEventListener("click", () => {
    state.view = b.dataset.view;
    try { localStorage.setItem("encore-master-view", state.view); } catch {}
    refreshViewControls(); drawWave();
  });
  for (const chip of document.querySelectorAll(".chip")) chip.addEventListener("click", () => {
    const band = chip.dataset.band;
    state.bandsOn[band] = !state.bandsOn[band];
    if (!state.bandsOn.low && !state.bandsOn.mid && !state.bandsOn.high) state.bandsOn[band] = true; // keep one on
    refreshViewControls(); drawWave();
  });
  refreshViewControls();
}

function refreshViewControls() {
  for (const b of $("views").children) { b.classList.toggle("on", b.dataset.view === state.view); b.setAttribute("aria-pressed", b.dataset.view === state.view); }
  for (const chip of document.querySelectorAll(".chip")) {
    chip.classList.toggle("hidden", state.view !== "colours");
    chip.setAttribute("aria-pressed", state.bandsOn[chip.dataset.band]);
  }
  const which = state.compare ? "Original" : "Mastered";
  $("showing").textContent = state.view === "overlay" ? (state.compare ? "Original as outline, master filled" : "Master as outline, original filled")
    : state.view === "level" ? `${which} highlighted`
    : `Showing: ${which} (other one faint behind)`;
}

// ---------- waveform + spectrum ----------
const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

// ---------- waveform views ----------
// Colours: frequency-coloured waveform (lows centre, mids, highs outside)
// Plain:   one colour
// Overlay: original and master on top of each other (see the squash)
// Level:   loudness over time, original vs master
function drawWave() {
  const c = $("wave"), dpr = window.devicePixelRatio || 1;
  const w = c.clientWidth, h = c.clientHeight;
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
  const g = c.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  if (!state.buffer || !origPeaks) return;

  const col = { accent: cssVar("--accent"), dim: cssVar("--dim"), red: cssVar("--red"), text: cssVar("--text"), blue: cssVar("--blue"), edge: cssVar("--edge") };
  const played = (position() / state.buffer.duration) * w;
  const n = origPeaks.length, colOf = (x) => Math.min(n - 1, Math.floor((x / w) * n));
  const master = masterPeaks ? { peaks: masterPeaks, bands: masterBands } : null;
  const orig = { peaks: origPeaks, bands: origBands };
  const front = state.compare ? orig : master, back = state.compare ? master : orig;
  const frontColour = state.compare ? col.text : col.accent;

  if (state.view === "level") drawLevel(g, w, h, col, played, colOf);
  else {
    const mid = h / 2, scale = h / 2 - 4; // full height = 0 dBFS
    g.fillStyle = col.edge;
    g.fillRect(0, mid - scale, w, 1); g.fillRect(0, mid + scale, w, 1);

    for (let x = 0; x < w; x++) {
      const i = colOf(x), fade = x < played ? 1 : 0.75;

      if (state.view === "overlay") {
        // the version you're NOT hearing is filled; the one you are hearing is
        // traced as a smooth outline on top (drawn after this loop)
        const fill = front === orig ? master : orig;
        if (fill) { const fh = Math.min(1, fill.peaks[i]) * scale; g.globalAlpha = 0.5 * fade; g.fillStyle = fill === orig ? col.dim : col.accent; g.fillRect(x, mid - fh, 1, fh * 2); }
      } else {
        // the other version faintly behind
        if (back) { const bh = Math.min(1, back.peaks[i]) * scale; g.globalAlpha = 0.28; g.fillStyle = col.dim; g.fillRect(x, mid - bh, 1, bh * 2); }
        if (front) {
          const total = Math.min(1, front.peaks[i]) * scale;
          g.globalAlpha = fade;
          if (state.view === "plain" || !front.bands) {
            g.fillStyle = frontColour; g.fillRect(x, mid - total, 1, total * 2);
          } else {
            const lo = front.bands[i * 3], mi = front.bands[i * 3 + 1], hi = front.bands[i * 3 + 2], sum = lo + mi + hi || 1;
            const hLo = total * (lo / sum), hMi = total * (mi / sum), hHi = total - hLo - hMi;
            const paint = (on, colour) => { g.globalAlpha = on ? fade : 0.12; g.fillStyle = on ? colour : col.dim; };
            paint(state.bandsOn.low, col.accent); g.fillRect(x, mid - hLo, 1, hLo * 2);
            paint(state.bandsOn.mid, col.text);   g.fillRect(x, mid - hLo - hMi, 1, hMi); g.fillRect(x, mid + hLo, 1, hMi);
            paint(state.bandsOn.high, col.blue);  g.fillRect(x, mid - total, 1, hHi);     g.fillRect(x, mid + hLo + hMi, 1, hHi);
          }
        }
      }
      // where the original mix goes over 0 dBFS
      if (origPeaks[i] > 1) { g.globalAlpha = 0.9; g.fillStyle = col.red; g.fillRect(x, mid - scale - 2, 1, 4); g.fillRect(x, mid + scale - 2, 1, 4); }
    }
  }
  if (state.view === "overlay" && front) {
    // smooth envelope of the version you're hearing
    const mid = h / 2, scale = h / 2 - 4, env = new Float32Array(w);
    for (let x = 0; x < w; x++) env[x] = Math.min(1, front.peaks[colOf(x)]) * scale;
    for (let pass = 0; pass < 2; pass++) for (let x = 1; x < w - 1; x++) env[x] = Math.max(env[x], (env[x - 1] + env[x] + env[x + 1]) / 3);
    g.globalAlpha = 1; g.strokeStyle = front === orig ? col.text : col.accent; g.lineWidth = 1.5;
    for (const sign of [-1, 1]) {
      g.beginPath();
      for (let x = 0; x < w; x++) { const y = mid + sign * env[x]; if (x === 0) g.moveTo(x, y); else g.lineTo(x, y); }
      g.stroke();
    }
  }
  g.globalAlpha = 1;
  g.fillStyle = col.text;
  g.fillRect(Math.round(played), 0, 1, h); // playhead
}

// Level per column in dB (from the lows/mids/highs RMS), lightly smoothed
function levelCurve(bands, n) {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = bands[i * 3] ** 2 + bands[i * 3 + 1] ** 2 + bands[i * 3 + 2] ** 2;
    out[i] = p > 0 ? 10 * Math.log10(p) : -100;
  }
  for (let pass = 0; pass < 2; pass++) for (let i = 1; i < n - 1; i++) out[i] = (out[i - 1] + 2 * out[i] + out[i + 1]) / 4;
  return out;
}

function drawLevel(g, w, h, col, played, colOf) {
  const top = -3, bottom = -42, yOf = (db) => 6 + (h - 18) * (top - Math.max(bottom, Math.min(top, db))) / (top - bottom);
  g.font = "10px system-ui";
  for (const db of [-6, -12, -18, -24, -30, -36]) {
    g.globalAlpha = 0.35; g.fillStyle = col.edge; g.fillRect(0, yOf(db), w, 1);
    g.globalAlpha = 0.8; g.fillStyle = col.dim; g.fillText(`${db} dB`, 4, yOf(db) - 2);
  }
  const lines = [];
  if (origBands) lines.push([levelCurve(origBands, origPeaks.length), state.compare ? col.text : col.dim, state.compare ? 2.5 : 1.5]);
  if (masterBands) lines.push([levelCurve(masterBands, origPeaks.length), col.accent, state.compare ? 1.5 : 2.5]);
  if (state.compare) lines.reverse(); // the one you're hearing on top
  for (const [curve, colour, width] of lines) {
    g.globalAlpha = 1; g.strokeStyle = colour; g.lineWidth = width;
    g.beginPath();
    for (let x = 0; x < w; x++) { const y = yOf(curve[colOf(x)]); if (x === 0) g.moveTo(x, y); else g.lineTo(x, y); }
    g.stroke();
  }
  g.globalAlpha = 0.8; g.fillStyle = col.dim;
  g.fillText("level over time (RMS): the closer the lines, the less the song's dynamics changed", w - 420, h - 4);
}

window.addEventListener("resize", () => { drawWave(); drawSpectrum(); });
// the layout sizes these canvases to fit the window, so redraw whenever their box changes (not only on window resize)
if (window.ResizeObserver) { const ro = new ResizeObserver(() => { drawWave(); drawSpectrum(); }); ro.observe($("wave")); ro.observe($("spectrum")); }

function drawSpectrum() {
  const c = $("spectrum"), dpr = window.devicePixelRatio || 1;
  const w = c.clientWidth, h = c.clientHeight;
  if (!w) return;
  if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
  const g = c.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  const xFor = (f) => (Math.log(f / 30) / Math.log(16000 / 30)) * w;
  g.fillStyle = cssVar("--dim"); g.font = "10px system-ui";
  for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) {
    const x = xFor(f);
    g.globalAlpha = 0.25; g.fillRect(x, 0, 1, h - 12);
    g.globalAlpha = 0.8; g.fillText(f >= 1000 ? f / 1000 + "k" : String(f), x + 2, h - 2);
  }
  g.globalAlpha = 1;
  if (!analyser) return;
  const bins = new Float32Array(analyser.frequencyBinCount);
  analyser.getFloatFrequencyData(bins);
  const rate = ctx.sampleRate, n = analyser.fftSize;
  g.beginPath();
  for (let x = 0; x <= w; x += 2) {
    const f = 30 * Math.pow(16000 / 30, x / w), b = Math.min(bins.length - 1, Math.round((f / rate) * n));
    // +4.5 dB/octave tilt so a balanced mix reads roughly flat
    const db = bins[b] + 4.5 * Math.log2(f / 1000);
    const y = (h - 14) * (1 - Math.max(0, Math.min(1, (db + 90) / 80)));
    if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.lineTo(w, h - 12); g.lineTo(0, h - 12); g.closePath();
  g.fillStyle = cssVar("--accent"); g.globalAlpha = 0.25; g.fill();
  g.globalAlpha = 1; g.strokeStyle = cssVar("--accent"); g.lineWidth = 1.5; g.stroke();
}

// ---------- meters ----------
function showMeters(m) {
  $("lufsNow").textContent = m.st > -70 ? m.st.toFixed(1) : "--";
  $("grBar").style.width = `${Math.min(100, (-m.gr / 12) * 100)}%`;
  if (m.settling && state.playing) status("Adjusting loudness for this style...");
}
function status(t) { $("status").textContent = t; }

// ---------- export (tagged WAV / MP3, properly named) ----------
const saved = (k, fallback = "") => { try { return localStorage.getItem("encore-master-" + k) ?? fallback; } catch { return fallback; } };
const remember = (k, v) => { try { localStorage.setItem("encore-master-" + k, v); } catch {} };
let exportArt = null, exportUrls = [];

function setupExport() {
  fillGenreSelect($("expGenre"));
  $("export").addEventListener("click", openExport);
  $("expClose").addEventListener("click", () => $("exportDlg").close());
  $("expArt").addEventListener("change", async () => {
    const f = $("expArt").files[0];
    if (!f) return;
    exportArt = { bytes: new Uint8Array(await f.arrayBuffer()), mime: f.type || "image/jpeg" };
    $("expArtPreview").src = URL.createObjectURL(f);
    $("expArtPreview").classList.remove("hidden");
  });
  for (const id of ["expArtist", "expTitle", "expAlbum", "expYear", "expTrack", "expIsrc"]) $(id).addEventListener("input", previewNames);
  for (const id of ["fmtWav24", "fmtWav16", "fmtMp3"]) $(id).addEventListener("change", previewNames);
  $("expGo").addEventListener("click", startExport);
}

function exportMeta() {
  const v = (id) => $(id).value.trim();
  return { artist: v("expArtist"), title: v("expTitle"), album: v("expAlbum"), year: v("expYear"), genre: v("expGenre"),
           track: v("expTrack"), isrc: v("expIsrc"), comment: `Mastered with Encore Music Studio (${STYLES[state.style].name})` };
}

function chosenFormats() {
  const f = [];
  if ($("fmtWav24").checked) f.push({ kind: "wav", bits: 24, ext: "wav", suffix: "", label: "WAV 24-bit (for distribution)" });
  if ($("fmtWav16").checked) f.push({ kind: "wav", bits: 16, ext: "wav", suffix: "(16-bit)", label: "WAV 16-bit (CD)" });
  if ($("fmtMp3").checked) f.push({ kind: "mp3", ext: "mp3", suffix: "", label: "MP3 320 kbps" });
  return f;
}

function previewNames() {
  const m = exportMeta();
  $("expNames").replaceChildren(...chosenFormats().map((f) => { const li = document.createElement("li"); li.textContent = fileName(m, f.ext, f.suffix); return li; }));
}

function openExport() {
  // sensible starting values: title from the file name, artist remembered
  if (!$("expTitle").value) $("expTitle").value = state.name.replace(/\.[^.]+$/, "");
  if (!$("expArtist").value) $("expArtist").value = saved("artist");
  if (!$("expYear").value) $("expYear").value = String(new Date().getFullYear());
  $("expResults").replaceChildren();
  $("expStatus").textContent = "";
  $("expGo").disabled = false;
  previewNames();
  $("exportDlg").showModal();
}

function startExport() {
  if (!chosenFormats().length) { $("expStatus").textContent = "Pick at least one format."; return; }
  remember("artist", $("expArtist").value.trim());
  exportUrls.forEach((u) => URL.revokeObjectURL(u)); exportUrls = [];
  $("expResults").replaceChildren();
  $("expGo").disabled = true;
  $("expStatus").textContent = "Mastering the whole song...";
  worker.postMessage({ type: "render", settings: settings() });
}

function addDownload(blob, name, label) {
  const url = URL.createObjectURL(blob); exportUrls.push(url);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.className = "dl";
  a.textContent = `${label}: ${name} (${(blob.size / 1048576).toFixed(1)} MB)`;
  $("expResults").append(a);
}

// called when the worker has the mastered song
async function finishExport(d) {
  const meta = exportMeta(), formats = chosenFormats();
  $("expStatus").textContent = `Mastered: ${d.lufs.toFixed(1)} LUFS, peak ${d.peakDb.toFixed(2)} dBFS. Creating files...`;
  for (const f of formats) {
    if (f.kind === "wav") {
      await new Promise((r) => setTimeout(r, 0));
      addDownload(wavFile(d.l, d.r, d.fs, f.bits, meta, exportArt), fileName(meta, f.ext, f.suffix), f.label);
    } else {
      const mp3 = await new Promise((resolve) => {
        const w = new Worker("mp3-worker.js");
        w.onmessage = (e) => {
          if (e.data.type === "progress") $("expStatus").textContent = `Encoding MP3... ${e.data.pct}%`;
          else { resolve(e.data.mp3); w.terminate(); }
        };
        w.postMessage({ l: d.l, r: d.r, fs: d.fs, kbps: 320 });
      });
      addDownload(new Blob([id3(meta, exportArt), mp3], { type: "audio/mpeg" }), fileName(meta, f.ext, f.suffix), f.label);
    }
  }
  $("expStatus").textContent = `Ready: ${d.lufs.toFixed(1)} LUFS, peak ${d.peakDb.toFixed(2)} dBFS. Click to save:`;
  $("expGo").disabled = false;
}
