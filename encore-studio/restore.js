// Encore Restore: the page. Opens a transfer (read in place, never changed),
// shows what the analysis heard, lets you switch each fix on and off and hear
// original against restored at the same loudness, restores the whole thing in
// the background and exports tagged 24-bit WAVs. The work happens in
// restore-worker.js; the DSP is restore-core.js and friends.
import { SOURCES, RPM_FIXES, CURVES, defaultSettings, speedCents, toRestoredTime, toOriginalTime, nrAmountToDb, LufsMeter } from "./restore-core.js";
import { fmtTime, describeSpeed, describeWow } from "./restore-analysis.js";
import { openAudio, describe, F32Reader } from "./restore-io.js";
import { fileName } from "./tags.js";

const $ = (id) => document.getElementById(id);
const store = {
  get: (k, d) => { try { const v = localStorage.getItem("encoreRestore." + k); return v === null ? d : v; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem("encoreRestore." + k, v); } catch {} },
};
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (t) => { t = Math.max(0, t); const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s < 10 ? "0" : ""}${s.toFixed(1)}`; };
const parseTime = (v) => { const p = String(v).trim().split(":").map(Number); if (p.some((x) => !isFinite(x))) return NaN; return p.length === 2 ? p[0] * 60 + p[1] : p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0]; };

const state = {
  source: store.get("source", "lp"), file: null, src: null, report: null, settings: null, suggested: null,
  restored: null, preview: null, tracks: [], sel: null, playhead: 0, view: "orig", mode: "rest", notes: {}, busy: false, pendingProject: null,
};

// ---------- the worker ----------
const worker = new Worker("restore-worker.js", { type: "module" });
const pending = new Map();
let rid = 0;
worker.onmessage = (e) => {
  const m = e.data, p = pending.get(m.id);
  if (!p) return;
  if (m.type === "progress") { p.onProgress?.(m); return; }
  pending.delete(m.id);
  if (m.type === "error") { console.error(m.stack); p.reject(new Error(m.message)); } else p.resolve(m);
};
worker.onerror = (e) => console.error("worker", e.message);
const rpc = (msg, onProgress) => new Promise((resolve, reject) => { const id = ++rid; pending.set(id, { resolve, reject, onProgress }); worker.postMessage({ ...msg, id }); });

let ctx = null;
const audio = () => { ctx ??= new AudioContext({ latencyHint: "playback" }); if (ctx.state === "suspended") ctx.resume(); return ctx; };

// ---------- source pickers ----------
function fillSources(segId, blurbId) {
  const seg = $(segId);
  seg.innerHTML = "";
  for (const s of SOURCES) {
    const b = document.createElement("button");
    b.textContent = s.name; b.dataset.id = s.id; b.setAttribute("role", "radio");
    b.onclick = () => setSource(s.id);
    seg.append(b);
  }
  const sync = () => {
    for (const b of seg.children) { b.classList.toggle("on", b.dataset.id === state.source); b.setAttribute("aria-checked", b.dataset.id === state.source); }
    $(blurbId).textContent = SOURCES.find((s) => s.id === state.source)?.blurb ?? "";
  };
  sync();
  return sync;
}
const syncA = fillSources("srcSeg", "srcBlurb"), syncB = fillSources("srcSeg2", "srcBlurb2");
function setSource(id) {
  state.source = id; store.set("source", id); syncA(); syncB();
  if (!$("nFormat").value || SOURCES.some((s) => s.name === $("nFormat").value)) $("nFormat").value = SOURCES.find((s) => s.id === id)?.name ?? "";
  if (state.report) analyse(); // a different source: different starting points
}

// ---------- opening ----------
const drop = $("drop");
drop.addEventListener("click", () => $("file").click());
drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("file").click(); } });
drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); const f = e.dataTransfer.files[0]; if (f) openFile(f); });
$("file").addEventListener("change", () => { const f = $("file").files[0]; if (f) openFile(f); $("file").value = ""; });
$("newFile").onclick = () => { player.stop(); $("work").classList.add("hidden"); $("startView").classList.remove("hidden"); };

async function openFile(file) {
  player.stop();
  $("startErr").classList.add("hidden");
  state.file = file; state.restored = null; state.preview = null; state.sel = null; state.playhead = 0; state.report = null;
  $("startView").classList.add("hidden"); $("work").classList.remove("hidden");
  $("fileName").textContent = file.name;
  $("fileInfo").textContent = "Opening...";
  $("findings").innerHTML = ""; $("procSummary").textContent = ""; $("trackRows").innerHTML = "";
  try { state.src = await openAudio(file, (ab) => audio().decodeAudioData(ab)); }
  catch (err) {
    $("work").classList.add("hidden"); $("startView").classList.remove("hidden");
    $("startErr").textContent = "Couldn't read that file. Try WAV, FLAC or MP3."; $("startErr").classList.remove("hidden");
    return;
  }
  const s = state.src, bits = s.kind === "wav" ? `${s.h.bits}-bit${s.h.format === 3 ? " float" : ""}` : "decoded";
  $("fileInfo").textContent = `${fmtTime(s.frames / s.fs)} long, ${(s.fs / 1000).toFixed(1)} kHz, ${bits}, ${s.channels === 1 ? "mono" : s.channels === 2 ? "stereo" : s.channels + " channels (the first two are used)"}. Read in place: your file is never changed.`;
  loadNotes();
  resize();
  await analyse();
}

// ---------- analysis ----------
async function analyse() {
  const s = state.src;
  if (!s) return;
  player.stop();
  setBar("anaBar", 0); $("anaBar").classList.remove("hidden");
  $("anaText").textContent = "Listening through the whole recording...";
  $("findings").innerHTML = "";
  let res;
  try { res = await rpc({ type: "analyse", source: describe(s), sourceType: state.source }, (p) => { setBar("anaBar", p.pct); if (p.text) $("anaText").textContent = p.text; }); }
  catch (err) { $("anaText").innerHTML = `<span class="err">The analysis stopped: ${esc(err.message)}</span>`; return; }
  const r = state.report = res.report;
  state.suggested = r.settings;
  $("anaBar").classList.add("hidden");
  $("anaText").textContent = `Listened to ${fmtTime(r.seconds)} in ${(r.ms / 1000).toFixed(1)} s. Each fix below is switched on where it's needed, at a gentle starting point.`;
  $("findings").innerHTML = r.findings.map((f) => `<li class="${f.level}"><span class="dot"></span><span>${esc(f.text)}</span></li>`).join("");
  // settings: the suggestions, unless this file was worked on here before
  const saved = loadSaved();
  state.settings = clone(r.settings);
  if (saved?.settings) {
    mergeSettings(state.settings, saved.settings);
    $("anaText").textContent += " Your own settings for this file from last time are back; Use these suggestions resets them.";
  }
  state.tracks = saved?.tracks?.length ? saved.tracks : r.tracks.tracks.map((t, i) => ({ start: t.start, end: t.end, title: `Track ${i + 1}` }));
  if (state.pendingProject) { applyProject(state.pendingProject); state.pendingProject = null; }
  renderModules(); renderTracks(); draw(); drawWow(); updateButtons();
}
$("reanalyse").onclick = () => analyse();
$("useRec").onclick = () => { if (!state.suggested) return; state.settings = clone(state.suggested); settingsChanged(); renderModules(); };

// settings carry big arrays (noise profile, wow curve); keep them out of saved copies and comparisons
const clone = (s) => structuredClone(s);
const keyOf = (s) => JSON.stringify(s, (k, v) => (ArrayBuffer.isView(v) ? `[${v.length}:${v[0]}:${v[v.length >> 1]}]` : v));
const slim = (s) => JSON.parse(JSON.stringify(s, (k, v) => (ArrayBuffer.isView(v) ? undefined : v)));
function mergeSettings(into, from) {
  for (const [k, v] of Object.entries(from)) {
    if (v && typeof v === "object" && !Array.isArray(v) && into[k] && typeof into[k] === "object") mergeSettings(into[k], v);
    else if (v !== undefined) into[k] = v;
  }
}

// ---------- modules ----------
const findingsFor = (id) => (state.report?.findings ?? []).filter((f) => f.module === id).map((f) => f.text).join(" ");
const MODULES = [
  { id: "rumble", name: "Rumble and DC", what: "Takes out turntable rumble, footsteps and the waveform sitting off-centre (DC). Nothing musical lives down there; the tuba's lowest notes are untouched.",
    found: () => findingsFor("rumble") || "Always worth having on for records.",
    controls: [{ type: "range", label: "Cut below", min: 10, max: 80, step: 1, get: (s) => s.rumble.hz, set: (s, v) => (s.rumble.hz = v), fmt: (v) => `${v} Hz` }] },
  { id: "channels", name: "Channels", what: "Mono records (most 78s, early LPs) sound best with both channels summed, or with the cleaner one alone. Cassettes often have the tape head a hair out of line (azimuth), which smears the highs: lining up the channels brings them back.",
    found: () => findingsFor("channels"),
    controls: [
      { type: "select", label: "Play as", options: [["stereo", "Stereo"], ["sum", "Mono: both channels together"], ["left", "Mono: left channel only"], ["right", "Mono: right channel only"]], get: (s) => s.channels.mode, set: (s, v) => (s.channels.mode = v) },
      { type: "check", label: "Line up the channels (azimuth)", get: (s) => s.channels.alignOn, set: (s, v) => (s.channels.alignOn = v) },
      { type: "number", label: "Right channel late by (samples)", step: 0.01, get: (s) => s.channels.delay, set: (s, v) => (s.channels.delay = v) },
      { type: "check", label: "Even out the balance", get: (s) => s.channels.balanceOn, set: (s, v) => (s.channels.balanceOn = v) },
      { type: "number", label: "Left louder by (dB)", step: 0.1, get: (s) => s.channels.balanceDb, set: (s, v) => (s.channels.balanceDb = v) },
      { type: "check", label: "Flip the right channel (polarity)", get: (s) => s.channels.flip, set: (s, v) => (s.channels.flip = v) },
    ] },
  { id: "declick", name: "De-click and de-crackle", what: "Finds clicks and crackle and rebuilds the music underneath from both sides of each one. Drum hits and accordion attacks are told apart and left alone.", removable: true,
    found: () => findingsFor("declick") + (state.restored?.clicks ? ` Last restore repaired ${state.restored.clicks.total}${state.restored.clicks.long ? `, and marked ${state.restored.clicks.long} too long to rebuild safely (a scratch?)` : ""}.` : ""),
    controls: [
      { type: "range", label: "Clicks", min: 0, max: 100, step: 1, get: (s) => s.declick.clicks, set: (s, v) => (s.declick.clicks = v), fmt: (v) => (v ? v : "off") },
      { type: "range", label: "Crackle", min: 0, max: 100, step: 1, get: (s) => s.declick.crackle, set: (s, v) => (s.declick.crackle = v), fmt: (v) => (v ? v : "off") },
      { type: "range", label: "Longest click to rebuild", min: 1, max: 8, step: 0.5, get: (s) => s.declick.maxMs, set: (s, v) => (s.declick.maxMs = v), fmt: (v) => `${v} ms`, full: true },
    ] },
  { id: "dehum", name: "De-hum", what: "Removes mains hum (50 or 60 Hz, a little off when the deck ran off speed) and its harmonics with very narrow notches, so the tuba and bass are kept.", removable: true,
    found: () => findingsFor("dehum"),
    controls: [
      { type: "number", label: "Hum at (Hz)", step: 0.01, get: (s) => s.dehum.hz, set: (s, v) => (s.dehum.hz = v) },
      { type: "number", label: "Harmonics", step: 1, min: 1, max: 24, get: (s) => s.dehum.harmonics.length ? Math.max(...s.dehum.harmonics) : 0, set: (s, v) => { const keep = s.dehum.harmonics.filter((h) => h <= v); s.dehum.harmonics = keep.length || v < 1 ? keep : Array.from({ length: v }, (_, i) => i + 1); if (v > Math.max(0, ...keep)) s.dehum.harmonics = Array.from({ length: v }, (_, i) => i + 1); } },
      { type: "range", label: "Notch width", min: 0.3, max: 3, step: 0.1, get: (s) => s.dehum.width, set: (s, v) => (s.dehum.width = v), fmt: (v) => `${v.toFixed(1)} Hz`, full: true },
    ] },
  { id: "denoise", name: "Noise reduction", what: "Turns down hiss and surface noise, learned from the quiet parts (the lead-in groove, the gaps between songs). Some is always left on purpose: taking it all makes music sound underwater.", removable: true,
    found: () => findingsFor("denoise"),
    controls: [
      { type: "range", label: "Turn the noise down by", min: 0, max: 100, step: 1, get: (s) => s.denoise.amount, set: (s, v) => (s.denoise.amount = v), fmt: (v) => `${nrAmountToDb(v).toFixed(0)} dB`, full: true },
      { type: "button", label: "Learn the noise from the selection", run: () => learnNoise() },
    ] },
  { id: "eq", name: "Playback EQ", what: "Optional. Records before 1955 used many different recording curves; a normal phono preamp applies the modern (RIAA) one. Pick the curve the label used, and add a little air to a dull transfer. Off unless you choose.",
    found: () => "Off by default. Use your ears and the label's era.",
    controls: [
      { type: "select", label: "78 curve", options: CURVES.map((c) => [c.id, c.name]), get: (s) => s.eq.curve, set: (s, v) => (s.eq.curve = v), full: true },
      { type: "number", label: "Bass turnover (Hz)", step: 10, get: (s) => s.eq.turnover, set: (s, v) => { s.eq.turnover = v; s.eq.curve = "custom"; } },
      { type: "number", label: "Treble roll-off at 10 kHz (dB)", step: 1, get: (s) => s.eq.rolloff, set: (s, v) => { s.eq.rolloff = Math.min(0, v); s.eq.curve = "custom"; } },
      { type: "check", label: "My phono preamp applied RIAA", get: (s) => s.eq.riaaApplied, set: (s, v) => (s.eq.riaaApplied = v), full: true },
      { type: "range", label: "Air (a gentle lift above 9 kHz)", min: 0, max: 4, step: 0.5, get: (s) => s.eq.air, set: (s, v) => (s.eq.air = v), fmt: (v) => (v ? `+${v} dB` : "none"), full: true },
    ] },
  { id: "speed", name: "Speed and pitch", what: "Fixes a transfer that ran fast or slow (a deck off speed, a 78 cut at 76 or 80), by exact resampling: speed and pitch move together, like the real thing, with nothing smeared.",
    found: () => findingsFor("speed"),
    controls: [
      { type: "number", label: "Change pitch by (cents)", step: 0.5, get: (s) => +(s.speed.cents || 0).toFixed(1), set: (s, v) => { s.speed.cents = v; s.speed.on = true; } },
      { type: "select", label: "Tune to", options: [[440, "A = 440 (modern)"], [435, "A = 435 (old continental)"], [442, "A = 442"], [445, "A = 445"], [452, "A = 452 (old high pitch)"]], get: (s) => s.speed.a4 ?? 440, set: (s, v) => { s.speed.a4 = +v; retune(s); s.speed.on = true; } },
      { type: "select", label: "Played at the wrong speed", options: RPM_FIXES.map((r) => [r.id, r.name]), get: (s) => s.speed.rpm, set: (s, v) => { s.speed.rpm = v; if (v !== "none") s.speed.on = true; }, full: true },
    ] },
  { id: "wow", name: "Wow", what: "Wow is a slow wobble in pitch, a few times a second: a warped record, an off-centre hole, a stretched tape. This follows the measured wobble and steadies it. The measurement is good but not perfect on busy music, so it starts gentle.",
    found: () => describeWow(state.report?.wow),
    controls: [{ type: "range", label: "Steady it by", min: 0, max: 100, step: 5, get: (s) => s.wow.amount, set: (s, v) => (s.wow.amount = v), fmt: (v) => `${v}%`, full: true }] },
];
// "Tune to": the measured offset is against A440; a band at A435 is 20 cents flat of that on purpose
function retune(s) {
  const t = state.report?.tuning;
  if (!t?.found) return;
  let d = t.cents - 1200 * Math.log2((s.speed.a4 || 440) / 440);
  d = ((d + 150) % 100 + 100) % 100 - 50;
  s.speed.cents = +(-d).toFixed(1);
}

function renderModules() {
  const box = $("modules"), s = state.settings;
  box.innerHTML = "";
  if (!s) return;
  for (const m of MODULES) {
    const card = document.createElement("section");
    card.className = "mod" + (s[m.id].on ? " on" : "");
    const id = `m_${m.id}`;
    card.innerHTML = `<header><h3>${esc(m.name)}</h3><label class="switch" title="On or off"><input type="checkbox" id="${id}" ${s[m.id].on ? "checked" : ""} aria-label="${esc(m.name)} on"><span></span></label></header>
      <div class="what">${esc(m.what)}</div><div class="found">${esc(m.found() || "Nothing to fix.")}</div>${m.removable ? `<button class="small listen" data-listen="${m.id}" title="Preview the selection and listen to only what this takes out">Hear what it removes</button>` : ""}<div class="ctl"></div>`;
    card.querySelector(`#${id}`).onchange = (e) => { s[m.id].on = e.target.checked; card.classList.toggle("on", e.target.checked); settingsChanged(); if (m.id === "wow") drawWow(); };
    card.querySelector("[data-listen]")?.addEventListener("click", () => { $("removedBy").value = m.id; setMode("removed"); preview(true); });
    const ctl = card.querySelector(".ctl");
    for (const c of m.controls) ctl.append(control(c, s));
    box.append(card);
  }
}

function control(c, s) {
  const wrap = document.createElement("label");
  if (c.full) wrap.className = "full";
  if (c.type === "button") { const b = document.createElement("button"); b.className = "small full"; b.textContent = c.label; b.onclick = c.run; return b; }
  if (c.type === "check") {
    wrap.className = "toggle" + (c.full ? " full" : "");
    const i = document.createElement("input"); i.type = "checkbox"; i.checked = !!c.get(s);
    i.onchange = () => { c.set(s, i.checked); settingsChanged(); };
    wrap.append(i, document.createTextNode(c.label));
    return wrap;
  }
  const head = document.createElement("span"); head.textContent = c.label;
  wrap.append(head);
  let input;
  if (c.type === "select") {
    input = document.createElement("select");
    for (const [v, n] of c.options) input.append(new Option(n, v));
    input.value = String(c.get(s));
    input.onchange = () => { c.set(s, input.value); settingsChanged(); renderModules(); };
  } else if (c.type === "number") {
    input = document.createElement("input"); input.type = "number"; input.step = c.step ?? "any";
    if (c.min != null) input.min = c.min; if (c.max != null) input.max = c.max;
    input.value = c.get(s);
    input.onchange = () => { const v = parseFloat(input.value); if (isFinite(v)) { c.set(s, v); settingsChanged(); renderModules(); } };
  } else {
    const val = document.createElement("span"); val.className = "val"; val.textContent = c.fmt ? c.fmt(c.get(s)) : c.get(s);
    head.append(val);
    input = document.createElement("input"); input.type = "range"; input.min = c.min; input.max = c.max; input.step = c.step; input.value = c.get(s);
    input.oninput = () => { val.textContent = c.fmt ? c.fmt(+input.value) : input.value; };
    input.onchange = () => { c.set(s, +input.value); settingsChanged(); };
  }
  wrap.append(input);
  return wrap;
}

function settingsChanged() {
  state.preview = null;
  if (state.restored) $("procText").innerHTML = state.restored.key === keyOf(state.settings) ? "Up to date." : `<span class="stale">Settings changed since the last restore. Restore it again to hear and export the new version of the whole recording.</span>`;
  saveLocal();
  updateButtons();
}

// ---------- waveform ----------
const wave = $("wave");
function resize() {
  const dpr = window.devicePixelRatio || 1;
  for (const c of [wave, $("wowGraph")]) { c.width = Math.round(c.clientWidth * dpr); c.height = Math.round(c.clientHeight * dpr); }
  draw(); drawWow();
}
window.addEventListener("resize", resize);
const duration = () => (state.src ? state.src.frames / state.src.fs : 0);
const cents = () => (state.restored ? state.restored.cents : 0);

function draw() {
  const g = wave.getContext("2d"), W = wave.width, H = wave.height, dpr = window.devicePixelRatio || 1;
  g.clearRect(0, 0, W, H);
  const r = state.report, dur = duration();
  if (!r || !dur) return;
  const css = getComputedStyle(document.documentElement);
  // the waveform: original, or restored mapped back onto the original's time
  const rest = state.view === "rest" && state.restored, ov = rest ? state.restored.overview : r.overview;
  const colTime = (c) => (c * ov.per) / (state.src.fs);
  const mid = H / 2;
  for (let x = 0; x < W; x++) {
    let t0 = (x / W) * dur, t1 = ((x + 1) / W) * dur;
    if (rest) { t0 = toRestoredTime(t0, cents()); t1 = toRestoredTime(t1, cents()); }
    const c0 = Math.max(0, Math.floor(t0 * state.src.fs / ov.per)), c1 = Math.min(ov.cols - 1, Math.max(c0, Math.ceil(t1 * state.src.fs / ov.per) - 1));
    let pk = 0, rm = 0;
    for (let c = c0; c <= c1; c++) { pk = Math.max(pk, ov.peakL[c], ov.peakR[c]); rm = Math.max(rm, ov.rms[c]); }
    g.fillStyle = rest ? "rgb(123 211 164 / 0.55)" : "rgb(255 59 0 / 0.45)";
    g.fillRect(x, mid - pk * mid * 0.95, 1, Math.max(1, 2 * pk * mid * 0.95));
    g.fillStyle = rest ? "rgb(123 211 164 / 0.95)" : "rgb(255 110 40 / 0.95)";
    g.fillRect(x, mid - rm * mid * 0.95, 1, Math.max(1, 2 * rm * mid * 0.95));
  }
  void colTime;
  const X = (t) => (t / dur) * W;
  // selection
  if (state.sel) { g.fillStyle = "rgb(242 239 232 / 0.16)"; g.fillRect(X(state.sel.a), 0, Math.max(1, X(state.sel.b) - X(state.sel.a)), H); }
  // dropouts, clipping, clicks
  g.fillStyle = "rgb(232 176 75 / 0.55)";
  for (const d of r.dropouts || []) g.fillRect(X(d.start), 0, Math.max(2 * dpr, X(d.end) - X(d.start)), H);
  g.fillStyle = "#ef4444";
  for (const c of r.clipping || []) g.fillRect(X(c.start), H - 10 * dpr, Math.max(2 * dpr, X(c.end) - X(c.start)), 10 * dpr);
  g.fillStyle = "#ff3b00";
  const clicks = state.restored?.clicks?.at ?? (r.clicks?.positions || []).map((p) => p / r.fs);
  for (const t of clicks) g.fillRect(X(t), 0, Math.max(1, dpr), 7 * dpr);
  // song splits
  g.strokeStyle = "#22d3ee"; g.fillStyle = "#22d3ee"; g.lineWidth = 1.5 * dpr; g.font = `${11 * dpr}px ${css.getPropertyValue("--family-mono") || "monospace"}`;
  state.tracks.forEach((t, i) => {
    const x = X(t.start);
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke();
    g.fillText(String(i + 1), x + 3 * dpr, 20 * dpr);
  });
  if (state.tracks.length) { const x = X(state.tracks[state.tracks.length - 1].end); g.setLineDash([4 * dpr, 4 * dpr]); g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); g.setLineDash([]); }
  // playhead
  g.fillStyle = "#f2efe8"; g.fillRect(X(state.playhead) - dpr / 2, 0, Math.max(1, dpr), H);
}

function drawWow() {
  const cv = $("wowGraph"), w = state.report?.wow;
  // only when there's wow to see (or you've turned the fix on): otherwise it's just measuring noise
  const show = !!(w && w.cents && w.cents.length && (w.found || state.settings?.wow.on));
  cv.classList.toggle("hidden", !show); $("wowLegend").classList.toggle("hidden", !show);
  if (!show) return;
  if (!cv.width) { const dpr = window.devicePixelRatio || 1; cv.width = Math.round(cv.clientWidth * dpr); cv.height = Math.round(cv.clientHeight * dpr); }
  const g = cv.getContext("2d"), W = cv.width, H = cv.height, dpr = window.devicePixelRatio || 1, dur = duration();
  g.clearRect(0, 0, W, H);
  const lim = Math.max(5, Math.ceil(w.peak / 5) * 5);
  g.strokeStyle = "rgb(242 239 232 / 0.15)"; g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke();
  g.strokeStyle = "#91887d"; g.lineWidth = 1.2 * dpr; g.beginPath();
  for (let x = 0; x < W; x++) {
    const t = (x / W) * dur, i = Math.min(w.cents.length - 1, Math.round(t * w.rate));
    const y = H / 2 - (w.cents[i] / lim) * (H / 2 - 4 * dpr);
    x ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.stroke();
  g.fillStyle = "#91887d"; g.font = `${10 * dpr}px sans-serif`;
  g.fillText(`+${lim} cents (sharp)`, 4 * dpr, 11 * dpr); g.fillText(`-${lim} cents (flat)`, 4 * dpr, H - 4 * dpr);
}

// click: playhead; drag: selection; near a song split: move it
let dragging = null;
wave.addEventListener("pointerdown", (e) => {
  if (!state.report) return;
  const rect = wave.getBoundingClientRect(), t = ((e.clientX - rect.left) / rect.width) * duration();
  const px = (tt) => (tt / duration()) * rect.width;
  const near = state.tracks.findIndex((tr, i) => i > 0 && Math.abs(px(tr.start) - (e.clientX - rect.left)) < 6);
  dragging = near > 0 ? { kind: "split", i: near } : { kind: "sel", t0: t, x0: e.clientX };
  wave.setPointerCapture(e.pointerId);
});
wave.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  const rect = wave.getBoundingClientRect(), t = Math.max(0, Math.min(duration(), ((e.clientX - rect.left) / rect.width) * duration()));
  if (dragging.kind === "split") {
    const i = dragging.i, lo = state.tracks[i - 1].start + 1, hi = state.tracks[i].end - 1;
    const v = Math.max(lo, Math.min(hi, t));
    state.tracks[i].start = v; state.tracks[i - 1].end = v;
  } else if (Math.abs(e.clientX - dragging.x0) > 4) {
    let a = Math.min(dragging.t0, t), b = Math.max(dragging.t0, t);
    if (b - a > 60) { if (t > dragging.t0) b = a + 60; else a = b - 60; }
    state.sel = { a, b };
    showSel();
  }
  draw();
});
wave.addEventListener("pointerup", (e) => {
  if (!dragging) return;
  const d = dragging; dragging = null;
  if (d.kind === "split") { renderTracks(); saveLocal(); return; }
  if (Math.abs(e.clientX - d.x0) <= 4) { // a click: move the playhead (and keep playing from there)
    seek(d.t0);
  } else { state.preview = null; seek(state.sel.a); }
});
function showSel() { $("selInfo").textContent = state.sel ? `Selected ${fmt(state.sel.a)} to ${fmt(state.sel.b)} (${(state.sel.b - state.sel.a).toFixed(1)} s)` : ""; }
function seek(t) {
  state.playhead = Math.max(0, Math.min(duration(), t));
  if (player.playing) player.play(state.playhead); else { draw(); $("time").textContent = fmt(state.playhead); }
}

// ---------- playing ----------
// Streams a second at a time from the original file, the restored Blob, or a
// preview held in memory, always shown on the original's timeline.
class Player {
  constructor() { this.playing = false; this.gen = 0; this.blocks = []; }
  async play(t) {
    this.stop(true);
    const my = ++this.gen, c = audio();
    const stream = await streamFor(state.mode, t);
    if (my !== this.gen) return;
    if (!stream) { this.stop(); return; }
    this.stream = stream; this.playing = true; $("playBtn").innerHTML = "&#10074;&#10074;"; $("playBtn").setAttribute("aria-label", "Stop");
    this.gain = c.createGain(); this.gain.gain.value = stream.gain; this.gain.connect(c.destination);
    this.next = c.currentTime + 0.06; this.pos = stream.from; this.blocks = []; this.sources = [];
    const pump = async () => {
      if (my !== this.gen) return;
      while (this.next - c.currentTime < 1.2 && my === this.gen) {
        let n = Math.round(stream.fs * 0.75);
        const loopEnd = stream.loopTo ?? stream.end;
        if (this.pos >= loopEnd) { if (stream.loopTo != null) this.pos = stream.loopFrom; else { this.ending = true; break; } }
        n = Math.min(n, loopEnd - this.pos);
        const { l, r } = await stream.read(this.pos, n);
        if (my !== this.gen) return;
        const buf = c.createBuffer(2, n, stream.fs);
        buf.copyToChannel(l, 0); buf.copyToChannel(r, 1);
        const s = c.createBufferSource(); s.buffer = buf; s.connect(this.gain); s.start(this.next);
        this.sources.push(s); if (this.sources.length > 8) this.sources.shift();
        this.blocks.push({ when: this.next, pos: this.pos, n, fs: stream.fs }); if (this.blocks.length > 8) this.blocks.shift();
        this.next += n / stream.fs; this.pos += n;
      }
      if (this.ending && c.currentTime > this.next) { this.stop(); return; }
      this.timer = setTimeout(pump, 150);
    };
    pump();
    const tick = () => {
      if (my !== this.gen) return;
      const now = c.currentTime, b = [...this.blocks].reverse().find((x) => x.when <= now);
      if (b) { const p = b.pos + Math.min(b.n, (now - b.when) * b.fs); state.playhead = stream.toTimeline(p); $("time").textContent = fmt(state.playhead) + (stream.label ? "  " + stream.label : ""); draw(); }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  stop(keep) {
    this.gen++;
    clearTimeout(this.timer);
    for (const s of this.sources || []) try { s.stop(); } catch {}
    this.sources = []; this.blocks = []; this.ending = false;
    try { this.gain?.disconnect(); } catch {}
    if (!keep) { this.playing = false; $("playBtn").innerHTML = "&#9654;"; $("playBtn").setAttribute("aria-label", "Play"); }
  }
}
const player = new Player();

// What to play for a mode, starting at original-timeline time t
async function streamFor(mode, t) {
  const fs = state.src.fs, loop = $("loop").checked && state.sel ? state.sel : null;
  if (mode === "orig") {
    const toF = (x) => Math.round(x * fs);
    const pv = currentPreview(t);
    // matched to whichever restored version you'd be comparing with
    const gain = $("match").checked ? Math.pow(10, ((pv ? pv.lufsOut - pv.lufsIn : state.restored ? state.restored.lufsOut - state.restored.lufsIn : 0)) / 20) : 1;
    return { fs, from: toF(t), end: state.src.frames, loopFrom: loop ? toF(loop.a) : null, loopTo: loop ? toF(loop.b) : null, read: (a, n) => state.src.read(a, n), toTimeline: (p) => p / fs, gain, label: "original" };
  }
  // restored or what-was-removed: a preview that covers t, else the whole restored file, else make a preview now
  let pv = currentPreview(t);
  const needRemoved = mode === "removed";
  if (needRemoved && pv && pv.removedBy !== $("removedBy").value) pv = null;
  if (!pv && (needRemoved || !restoredFresh())) pv = await preview(needRemoved, state.sel && t >= state.sel.a && t < state.sel.b ? null : t);
  if (pv) {
    const ratio = Math.pow(2, pv.cents / 1200), base = Math.round(pv.outStart * fs), len = pv.l.length;
    const L = needRemoved ? pv.rl : pv.l, R = needRemoved ? pv.rr : pv.r;
    if (!L) return null;
    const toF = (x) => Math.max(0, Math.min(len, Math.round(toRestoredTime(x, pv.cents) * fs) - base));
    const read = async (a, n) => ({ l: L.slice(a, a + n), r: R.slice(a, a + n) });
    const lp = loop && loop.a >= pv.start - 0.01 && loop.b <= pv.end + 0.01 ? loop : { a: pv.start, b: pv.end };
    return { fs, from: toF(Math.max(t, pv.start)), end: len, loopFrom: toF(lp.a), loopTo: loop ? toF(lp.b) : null, read, toTimeline: (p) => toOriginalTime((base + p) / fs, pv.cents), gain: needRemoved ? 1 : 1, label: needRemoved ? "what was removed" : "restored (preview)" };
  }
  const R = state.restored, rd = new F32Reader(R.blob, R.fs, R.frames), toF = (x) => Math.round(toRestoredTime(x, R.cents) * R.fs);
  return { fs: R.fs, from: toF(t), end: R.frames, loopFrom: loop ? toF(loop.a) : null, loopTo: loop ? toF(loop.b) : null, read: (a, n) => rd.read(a, n), toTimeline: (p) => toOriginalTime(p / R.fs, R.cents), gain: 1, label: "restored" };
}
const restoredFresh = () => state.restored && state.restored.key === keyOf(state.settings);
const currentPreview = (t) => { const p = state.preview; return p && p.key === keyOf(state.settings) && t >= p.start - 0.05 && t < p.end ? p : null; };

function setMode(m) { state.mode = m; for (const b of $("abSeg").children) b.classList.toggle("on", b.dataset.m === m); if (player.playing) player.play(state.playhead); }
for (const b of $("abSeg").children) b.onclick = () => setMode(b.dataset.m);
for (const b of $("viewSeg").children) b.onclick = () => { state.view = b.dataset.v; for (const x of $("viewSeg").children) x.classList.toggle("on", x === b); draw(); };
$("playBtn").onclick = () => (player.playing ? player.stop() : player.play(state.playhead));
$("loop").onchange = () => { if (player.playing) player.play(state.playhead); };
$("match").onchange = () => { if (player.playing) player.play(state.playhead); };
$("removedBy").onchange = () => { if (state.preview) state.preview.removedBy = null; if (state.mode === "removed" && player.playing) player.play(state.playhead); };
document.addEventListener("keydown", (e) => {
  if (!state.report || /INPUT|SELECT|TEXTAREA|BUTTON/.test(e.target.tagName)) return;
  if (e.code === "Space") { e.preventDefault(); $("playBtn").click(); }
  if (e.key === "b" || e.key === "B") setMode(state.mode === "orig" ? "rest" : "orig");
});

// ---------- preview ----------
// The selection (or 20 s from the playhead), restored with the current settings
async function preview(withRemoved = false, at = null) {
  if (!state.src || !state.settings) return null;
  const sel = at == null && state.sel ? state.sel : { a: at ?? state.playhead, b: Math.min(duration(), (at ?? state.playhead) + 20) };
  if (sel.b - sel.a < 0.5) return null;
  const removedBy = withRemoved || state.mode === "removed" ? $("removedBy").value : null;
  $("playNote").textContent = `Restoring ${fmt(sel.a)} to ${fmt(sel.b)} with the current settings${removedBy ? " (and working out what's taken out)" : ""}...`;
  $("previewBtn").disabled = true;
  try {
    const res = await rpc({ type: "preview", source: describe(state.src), start: sel.a, end: sel.b, settings: state.settings, removed: removedBy });
    // loudness of both sides of the A/B, over the same stretch
    const fs = state.src.fs, a = Math.round(sel.a * fs), n = Math.round((sel.b - sel.a) * fs);
    const o = await state.src.read(a, n), mi = new LufsMeter(fs), mo = new LufsMeter(fs);
    mi.push(o.l, o.r); mo.push(res.l, res.r);
    state.preview = { ...res, start: sel.a, end: sel.b, key: keyOf(state.settings), removedBy, cents: speedCents(state.settings), lufsIn: mi.value(), lufsOut: mo.value() };
    $("playNote").textContent = `Preview ready: ${fmt(sel.a)} to ${fmt(sel.b)}${res.clicks.length ? `, ${res.clicks.length} clicks repaired in it` : ""}. ${restoredFresh() ? "" : "Restore the whole recording to play all of it."}`;
    return state.preview;
  } catch (err) { $("playNote").innerHTML = `<span class="err">Preview failed: ${esc(err.message)}</span>`; return null; }
  finally { $("previewBtn").disabled = false; }
}
$("previewBtn").onclick = async () => { const pv = await preview(state.mode === "removed"); if (pv) { state.playhead = pv.start; if (state.mode === "orig") setMode("rest"); player.play(pv.start); } };

async function learnNoise() {
  if (!state.sel) { $("playNote").textContent = "Select a stretch with only noise in it (the lead-in groove, a gap between songs, tape leader) first, by dragging on the waveform."; return; }
  const r = state.report;
  const res = await rpc({ type: "learn", source: describe(state.src), start: state.sel.a, end: state.sel.b, hum: r.hum, N: r.noise?.N ?? (state.src.fs <= 50000 ? 2048 : state.src.fs <= 100000 ? 4096 : 8192) });
  if (!res.noise) { $("playNote").textContent = "That stretch was too short or too busy to learn from. Pick at least half a second of just noise."; return; }
  state.settings.denoise.profile = res.noise.profile; state.settings.denoise.on = true;
  const f = r.findings.find((x) => x.module === "denoise");
  const text = `Learned the noise from ${fmt(state.sel.a)} to ${fmt(state.sel.b)}: about ${res.noise.rmsDb.toFixed(0)} dBFS.`;
  if (f) f.text = text; else r.findings.push({ module: "denoise", level: "fix", text });
  settingsChanged(); renderModules();
  $("playNote").textContent = text;
}
$("learnBtn").onclick = () => learnNoise();

// ---------- the whole recording ----------
$("processBtn").onclick = async () => {
  if (!state.settings || state.busy) return;
  player.stop();
  state.busy = true; updateButtons();
  $("procBar").classList.remove("hidden"); $("cancelBtn").classList.remove("hidden"); setBar("procBar", 0);
  $("procText").textContent = "Restoring...";
  const settings = clone(state.settings), key = keyOf(state.settings);
  try {
    const res = await rpc({ type: "process", source: describe(state.src), settings }, (p) => { setBar("procBar", p.pct); $("procText").textContent = p.text; });
    if (res.type === "cancelled") { $("procText").textContent = "Stopped. Nothing was changed."; return; }
    state.restored = { ...res, key, cents: speedCents(settings) };
    state.preview = null;
    const speedNote = Math.abs(state.restored.cents) > 0.5 ? ` Now ${fmtTime(res.frames / res.fs)} long (speed changed by ${state.restored.cents.toFixed(1)} cents).` : "";
    $("procText").textContent = "Up to date.";
    $("procSummary").textContent = `Restored ${fmtTime(duration())} in ${fmtTime(res.seconds)} (${(duration() / Math.max(0.1, res.seconds)).toFixed(1)}x real time).` +
      (settings.declick.on ? ` ${res.clicks.total} clicks repaired${res.clicks.long ? `, ${res.clicks.long} too long to rebuild (marked)` : ""}.` : "") +
      ` Loudness: original ${res.lufsIn.toFixed(1)} LUFS, restored ${res.lufsOut.toFixed(1)} LUFS (played back matched). Peak ${res.peakDb.toFixed(1)} dBFS.${speedNote}`;
    setMode("rest");
    state.view = "rest"; for (const x of $("viewSeg").children) x.classList.toggle("on", x.dataset.v === "rest");
    renderModules(); draw();
  } catch (err) { $("procText").innerHTML = `<span class="err">Restoring stopped: ${esc(err.message)}</span>`; }
  finally { state.busy = false; $("procBar").classList.add("hidden"); $("cancelBtn").classList.add("hidden"); updateButtons(); }
};
$("cancelBtn").onclick = () => worker.postMessage({ type: "cancel" });

// ---------- songs ----------
function renderTracks() {
  const body = $("trackRows");
  body.innerHTML = "";
  state.tracks.forEach((t, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${i + 1}</td><td><input type="text" value="${esc(t.title)}" aria-label="Title of song ${i + 1}"></td><td><input class="t" value="${fmt(t.start)}" aria-label="Start"></td><td><input class="t" value="${fmt(t.end)}" aria-label="End"></td>
      <td class="acts"><button class="small" data-a="play">Play</button><button class="small" data-a="wav" ${restoredFresh() ? "" : "disabled"}>WAV</button><button class="small" data-a="del" ${state.tracks.length > 1 ? "" : "disabled"} title="Join with the song before">Join</button></td>`;
    const [title, st, en] = tr.querySelectorAll("input");
    title.onchange = () => { t.title = title.value; saveLocal(); };
    st.onchange = () => { const v = parseTime(st.value); if (isFinite(v)) { t.start = Math.max(0, Math.min(t.end - 1, v)); if (i > 0) state.tracks[i - 1].end = t.start; } renderTracks(); draw(); saveLocal(); };
    en.onchange = () => { const v = parseTime(en.value); if (isFinite(v)) { t.end = Math.min(duration(), Math.max(t.start + 1, v)); if (i < state.tracks.length - 1) state.tracks[i + 1].start = t.end; } renderTracks(); draw(); saveLocal(); };
    tr.querySelector('[data-a="play"]').onclick = () => { state.playhead = t.start; player.play(t.start); };
    tr.querySelector('[data-a="wav"]').onclick = () => exportTracks([i], false);
    tr.querySelector('[data-a="del"]').onclick = () => { if (i === 0) { state.tracks[1].start = t.start; state.tracks.splice(0, 1); } else { state.tracks[i - 1].end = t.end; state.tracks.splice(i, 1); } renderTracks(); draw(); saveLocal(); };
    body.append(tr);
  });
}
$("splitBtn").onclick = () => {
  const t = state.playhead, i = state.tracks.findIndex((x) => t > x.start + 1 && t < x.end - 1);
  if (i < 0) return;
  const cur = state.tracks[i];
  state.tracks.splice(i + 1, 0, { start: t, end: cur.end, title: `Track ${state.tracks.length + 1}` });
  cur.end = t;
  renderTracks(); draw(); saveLocal();
};
$("findBtn").onclick = () => { if (!state.report) return; state.tracks = state.report.tracks.tracks.map((t, i) => ({ start: t.start, end: t.end, title: state.tracks[i]?.title ?? `Track ${i + 1}` })); renderTracks(); draw(); saveLocal(); };

// ---------- export ----------
const NOTE_FIELDS = { artist: "nArtist", album: "nAlbum", year: "nYear", format: "nFormat", label: "nLabel", catalog: "nCatalog", side: "nSide", deck: "nDeck", cartridge: "nCart", stylus: "nStylus", date: "nDate", who: "nWho", notes: "nNotes" };
const notes = () => Object.fromEntries(Object.entries(NOTE_FIELDS).map(([k, id]) => [k, $(id).value.trim()]));
// the comment tag: the source and the transfer, then what was done to it
function comment() {
  const n = notes(), s = state.settings, out = [];
  const src = [n.format || SOURCES.find((x) => x.id === state.source)?.name, n.label && `label ${n.label}`, n.catalog && `catalog ${n.catalog}`, n.side].filter(Boolean).join(", ");
  if (src) out.push(`Source: ${src}.`);
  const tr = [n.deck, n.cartridge, n.stylus].filter(Boolean).join(" / ");
  if (tr || n.date || n.who) out.push(`Transfer: ${[tr, n.date && `on ${n.date}`, n.who && `by ${n.who}`].filter(Boolean).join(" ")}.`);
  const done = [];
  const c = speedCents(s);
  if (Math.abs(c) > 0.05) done.push(`speed ${c > 0 ? "+" : ""}${c.toFixed(1)} cents`);
  if (s.wow.on && s.wow.curve) done.push(`wow steadied ${s.wow.amount}%`);
  if (s.channels.on) done.push([s.channels.mode !== "stereo" ? `mono (${s.channels.mode === "sum" ? "both channels" : s.channels.mode + " channel"})` : "", s.channels.alignOn ? `azimuth aligned ${s.channels.delay.toFixed(2)} samples` : "", s.channels.balanceOn ? "balance" : "", s.channels.flip ? "polarity flipped" : ""].filter(Boolean).join(", "));
  if (s.declick.on) done.push(`de-click${state.restored?.clicks ? ` (${state.restored.clicks.total} repaired)` : ""}`);
  if (s.dehum.on && s.dehum.harmonics.length) done.push(`de-hum ${s.dehum.hz.toFixed(1)} Hz`);
  if (s.denoise.on) done.push(`noise reduction ${nrAmountToDb(s.denoise.amount).toFixed(0)} dB`);
  if (s.eq.on && s.eq.curve !== "none") done.push(`EQ ${CURVES.find((x) => x.id === s.eq.curve)?.name ?? "custom"}`);
  if (s.eq.on && s.eq.air > 0) done.push(`air +${s.eq.air} dB`);
  if (s.rumble.on) done.push(`rumble filter ${s.rumble.hz} Hz`);
  out.push(`Restored with Encore Restore: ${done.filter(Boolean).join(", ") || "no changes"}.`);
  if (n.notes) out.push(n.notes);
  return out.join(" ");
}
async function exportTracks(which, zipIt) {
  if (!restoredFresh()) return;
  const n = notes(), R = state.restored, list = which ?? state.tracks.map((_, i) => i);
  const tracks = list.map((i) => {
    const t = state.tracks[i], meta = { title: t.title, artist: n.artist, album: n.album, year: n.year, track: String(i + 1), comment: comment() };
    return { start: toRestoredTime(t.start, R.cents), end: toRestoredTime(t.end, R.cents), meta, fileName: `${String(i + 1).padStart(2, "0")} ${fileName(meta, "wav")}` };
  });
  await runExport(tracks, zipIt, `${[n.artist, n.album, n.side].filter(Boolean).join(" - ") || "Restored"}.zip`);
}
async function runExport(tracks, zipIt, zipName) {
  const R = state.restored;
  $("exportText").textContent = "Writing...";
  state.busy = true; updateButtons();
  try {
    const res = await rpc({ type: "export", restored: { blob: R.blob, fs: R.fs, frames: R.frames, peakDb: R.peakDb }, tracks, zip: zipIt, bits: 24 }, (p) => { $("exportText").textContent = p.text; });
    if (zipIt) download(res.zip, zipName.replace(/[\\/:*?"<>|]+/g, ""));
    else for (const f of res.files) download(f.blob, f.name);
    $("exportText").textContent = `Saved ${zipIt ? zipName : res.files.map((f) => f.name).join(", ")}.` + (res.gainDb < -0.01 ? ` Turned down ${(-res.gainDb).toFixed(1)} dB so nothing clips.` : "");
  } catch (err) { $("exportText").innerHTML = `<span class="err">Export failed: ${esc(err.message)}</span>`; }
  finally { state.busy = false; updateButtons(); }
}
function download(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}
$("exportZip").onclick = () => exportTracks(null, true);
$("exportSide").onclick = async () => {
  if (!restoredFresh()) return;
  const n = notes(), meta = { title: [n.album, n.side].filter(Boolean).join(", ") || state.file.name.replace(/\.[^.]+$/, "") + " (restored)", artist: n.artist, album: n.album, year: n.year, comment: comment() };
  await runExport([{ start: 0, end: state.restored.frames / state.restored.fs, meta, fileName: fileName(meta, "wav", "(restored)") }], false);
};

function updateButtons() {
  const fresh = restoredFresh();
  $("exportZip").disabled = !fresh || state.busy; $("exportSide").disabled = !fresh || state.busy;
  $("processBtn").disabled = state.busy || !state.settings;
  if (!fresh && !state.busy) $("exportText").textContent = state.restored ? "Restore it again with the new settings to export." : "Restore the recording first. Exports are 24-bit WAV, tagged with your archive notes.";
  for (const b of document.querySelectorAll('#trackRows [data-a="wav"]')) b.disabled = !fresh || state.busy;
}
function setBar(id, pct) { $(id).firstElementChild.style.width = `${Math.max(0, Math.min(100, pct))}%`; }

// ---------- archive notes and projects ----------
const fileKey = () => (state.file ? `p.${state.file.name}.${state.file.size}` : null);
function loadSaved() { try { return JSON.parse(store.get(fileKey(), "null")); } catch { return null; } }
function saveLocal() {
  if (!fileKey() || !state.settings) return;
  store.set(fileKey(), JSON.stringify({ source: state.source, settings: slim(state.settings), tracks: state.tracks, notes: notes(), savedAt: new Date().toISOString() }));
  store.set("lastNotes", JSON.stringify(notes()));
}
function loadNotes() {
  let n = null;
  try { n = JSON.parse(store.get(fileKey(), "null"))?.notes ?? null; } catch {}
  if (!n) { // a new file: keep the transfer chain from last time (same deck, same stylus), clear the record's own details
    try { const last = JSON.parse(store.get("lastNotes", "null")); if (last) n = { deck: last.deck, cartridge: last.cartridge, stylus: last.stylus, who: last.who }; } catch {}
  }
  for (const [k, id] of Object.entries(NOTE_FIELDS)) $(id).value = n?.[k] ?? "";
  if (!$("nFormat").value) $("nFormat").value = SOURCES.find((s) => s.id === state.source)?.name ?? "";
  if (!$("nDate").value) $("nDate").value = new Date().toISOString().slice(0, 10);
}
for (const id of Object.values(NOTE_FIELDS)) $(id).addEventListener("change", saveLocal);

// A project file: everything needed to pick the work up again (the audio itself stays where it is)
$("saveProject").onclick = () => {
  if (!state.settings) return;
  const plain = JSON.parse(JSON.stringify(state.settings, (k, v) => (ArrayBuffer.isView(v) ? { f32: Array.from(v, (x) => +x.toPrecision(6)) } : v)));
  const proj = { app: "Encore Restore", version: 1, file: { name: state.file.name, size: state.file.size, seconds: duration() }, source: state.source, settings: plain, tracks: state.tracks, notes: notes(), savedAt: new Date().toISOString() };
  download(new Blob([JSON.stringify(proj, null, 1)], { type: "application/json" }), state.file.name.replace(/\.[^.]+$/, "") + ".restore.json");
};
$("openProject").onclick = () => $("projectFile").click();
$("projectFile").onchange = async () => {
  const f = $("projectFile").files[0]; $("projectFile").value = "";
  if (!f) return;
  let p;
  try { p = JSON.parse(await f.text()); if (p.app !== "Encore Restore") throw new Error(); } catch { $("startErr").textContent = "That isn't an Encore Restore project file."; $("startErr").classList.remove("hidden"); return; }
  if (state.report) { applyProject(p); renderModules(); renderTracks(); draw(); return; }
  state.pendingProject = p;
  $("projectNote").textContent = `Project for ${p.file?.name ?? "a recording"} loaded. Now open that recording.`; $("projectNote").classList.remove("hidden");
};
function applyProject(p) {
  const revive = (v) => (v && typeof v === "object" ? (Array.isArray(v.f32) ? Float32Array.from(v.f32) : Array.isArray(v) ? v.map(revive) : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, revive(x)]))) : v);
  if (p.source) { state.source = p.source; syncA(); syncB(); }
  if (p.settings) { const s = revive(p.settings); mergeSettings(state.settings, s); }
  if (p.tracks?.length) state.tracks = p.tracks;
  if (p.notes) for (const [k, id] of Object.entries(NOTE_FIELDS)) if (p.notes[k] != null) $(id).value = p.notes[k];
  settingsChanged();
}

// for the automated browser check (and the curious): the current state
window.encoreRestore = { state, keyOf };
