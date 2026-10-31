// Encore Restore: the page. A project is one release being digitized (an LP,
// a 45, a 78, a tape, a CD); each part (Side A, Side B, Program 1...) is
// recorded here from an input or opened from a file, listened to, fixed,
// split into tracks and named; the release gets its details, pictures and
// transfer chain; the export writes every track as tagged FLAC / WAV / MP3 /
// AAC with the raw transfers and a catalog, in one zip. Projects are kept on
// this device, so a release can be done a side a day.
//   restore-worker.js        analysis, previews, the restore itself (the DSP)
//   restore-side-worker.js   side levels for "N tracks", encoding, the zip
//   restore-project.js       the rules (parts, parsing, numbering, tags, catalog)
//   restore-store.js         saving projects and recordings on the device
//   restore-capture.js       recording a side (Live's recorder)
//   restore-meta.js          the Release tab's form
import { SOURCES, RPM_FIXES, CURVES, speedCents, toRestoredTime, toOriginalTime, nrAmountToDb, LufsMeter } from "./restore-core.js";
import { fmtTime, describeWow } from "./restore-analysis.js";
import { openAudio, describe, F32Reader } from "./restore-io.js";
import * as P from "./restore-project.js";
import * as S from "./restore-store.js";
import { SideRecorder, listInputs, deleteRecording, unfinishedRecordings, recoverRecording } from "./restore-capture.js";
import { renderRelease, renderImages, datalists } from "./restore-meta.js";
import { GENRES } from "./genres.js";

const $ = (id) => document.getElementById(id);
const store = {
  get: (k, d) => { try { const v = localStorage.getItem("encoreRestore." + k); return v === null ? d : v; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem("encoreRestore." + k, v); } catch {} },
};
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (t) => { t = Math.max(0, t); const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s < 10 ? "0" : ""}${s.toFixed(1)}`; };
const parseTime = (v) => { const p = String(v).trim().split(":").map(Number); if (p.some((x) => !isFinite(x))) return NaN; return p.length === 2 ? p[0] * 60 + p[1] : p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0]; };
const fmtBytes = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(0)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);
const uid = () => Math.random().toString(36).slice(2, 10);
$("datalists").innerHTML = datalists();

// ---------- the workers ----------
function rpcFor(url) {
  const w = new Worker(url, { type: "module" }), pending = new Map();
  let rid = 0;
  w.onmessage = (e) => {
    const m = e.data, p = pending.get(m.id);
    if (!p) return;
    if (m.type === "progress") { p.onProgress?.(m); return; }
    pending.delete(m.id);
    if (m.type === "error") { console.error(m.stack); p.reject(new Error(m.message)); } else p.resolve(m);
  };
  w.onerror = (e) => console.error("worker", e.message);
  const call = (msg, onProgress) => new Promise((resolve, reject) => { const id = ++rid; pending.set(id, { resolve, reject, onProgress }); w.postMessage({ ...msg, id }); });
  call.worker = w;
  return call;
}
const rpc = rpcFor("restore-worker.js");       // analysis, previews, restoring
const srpc = rpcFor("restore-side-worker.js"); // levels, encoding, the zip
const worker = rpc.worker;
// can this browser write AAC? (asked once; the encoder lives in the worker)
let aacOk = null;
const aacSupport = srpc({ type: "aac" }).then((r) => (aacOk = r.rates.some(Boolean)), () => (aacOk = false));

let ctx = null;
const audio = () => { ctx ??= new AudioContext({ latencyHint: "playback" }); if (ctx.state === "suspended") ctx.resume(); return ctx; };
const decode = (ab) => audio().decodeAudioData(ab);

// ---------- state ----------
// The project, the part on screen, and for each part what only this page
// knows (the open audio, the analysis, the restored audio): runOf(partId).
const runs = new Map();
const runOf = (id) => { if (!runs.has(id)) runs.set(id, { src: null, file: null, report: null, restored: null, preview: null, suggested: null, gaps: null, analysing: null }); return runs.get(id); };
const state = { project: null, partId: null, sel: null, playhead: 0, view: "orig", mode: "rest", busy: false, capturing: false, recording: null, cancelExport: false };
Object.defineProperties(state, {
  part: { get: () => state.project?.parts.find((p) => p.id === state.partId) ?? null },
  run: { get: () => (state.partId ? runOf(state.partId) : {}) },
  src: { get: () => state.run.src ?? null },
  file: { get: () => state.run.file ?? null },
  report: { get: () => state.run.report ?? null, set: (v) => { state.run.report = v; } },
  restored: { get: () => state.run.restored ?? null, set: (v) => { state.run.restored = v; } },
  preview: { get: () => state.run.preview ?? null, set: (v) => { if (state.partId) state.run.preview = v; } },
  suggested: { get: () => state.run.suggested ?? null },
  settings: { get: () => state.part?.settings ?? null, set: (v) => { if (state.part) state.part.settings = v; } },
  tracks: { get: () => state.part?.tracks ?? [], set: (v) => { if (state.part) state.part.tracks = v; } },
  source: { get: () => P.formatOf(state.project?.format).source },
});

// ---------- saving ----------
let saveTimer = null;
function touch() {
  if (!state.project) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => S.saveProject(state.project).catch((err) => console.error("save", err)), 350);
}
const saveNow = async () => { clearTimeout(saveTimer); if (state.project) await S.saveProject(state.project); };
window.addEventListener("pagehide", () => { if (state.project) S.saveProject(state.project); });

// ======================================================================
// The start: a new release, or carry on with a saved one
// ======================================================================
let newFormat = store.get("newFormat", "lp");
function renderStart() {
  const g = $("fmtGrid");
  g.innerHTML = P.FORMATS.map((f) => `<button role="radio" data-f="${f.id}" aria-checked="${f.id === newFormat}" class="${f.id === newFormat ? "on" : ""}"><b>${esc(f.name)}</b><span>${esc(f.sub)}</span></button>`).join("");
  for (const b of g.children) b.onclick = () => { newFormat = b.dataset.f; store.set("newFormat", newFormat); renderStart(); };
  const f = P.formatOf(newFormat), sel = $("newDiscs"), keep = +sel.value || 1;
  const word = f.disc ? ["record", "records"] : f.id === "cd" ? ["disc", "discs"] : f.id === "other" ? ["part", "parts"] : ["tape", "tapes"];
  sel.innerHTML = Array.from({ length: 10 }, (_, i) => `<option value="${i + 1}">${i + 1} ${word[i ? 1 : 0]}</option>`).join("");
  sel.value = String(keep);
  const parts = P.partsFor(newFormat, +sel.value);
  $("newSummary").textContent = `${parts.map((p) => p.name).join(", ")}. Skip or add parts any time.`;
}
$("newDiscs").onchange = renderStart;
$("newProject").onclick = async () => {
  const p = P.newProject(newFormat, { discs: +$("newDiscs").value, artist: $("newArtist").value.trim(), title: $("newTitle").value.trim() });
  carryTransfer(p);
  await S.saveProject(p); S.askToPersist();
  $("newArtist").value = ""; $("newTitle").value = "";
  await openProject(p);
  showTab("side");
};
// a new project keeps the transfer chain from the last one (same deck, same stylus)
function carryTransfer(p) {
  try { const last = JSON.parse(store.get("lastTransfer", "null")); if (last) for (const k of ["by", "deck", "cartridge", "stylus", "preamp", "adc", "settings"]) if (last[k]) p.transfer[k] = last[k]; } catch {}
}

async function renderProjects() {
  const box = $("projectList");
  let list = [];
  try { list = await S.listProjects(); } catch (err) { box.innerHTML = `<div class="err">Saved projects can't be read here (${esc(err.message)}).</div>`; return; }
  if (!list.length) { box.innerHTML = `<div class="note">Nothing saved yet. Projects are kept on this device as you work.</div>`; }
  else box.innerHTML = list.map((p) => {
    const f = P.formatOf(p.format), inc = p.parts.filter((x) => x.include !== false);
    const got = inc.filter((x) => x.audio).length, tracks = inc.reduce((a, x) => a + x.tracks.length, 0);
    const title = [p.release.artist, p.release.title].filter(Boolean).join(" - ") || `Untitled ${f.name}`;
    return `<div class="proj" data-id="${p.id}"><div class="grow"><b>${esc(title)}</b><div class="note">${esc(f.name)}, ${got} of ${inc.length} ${inc.length === 1 ? "part" : "parts"} in, ${tracks} track${tracks === 1 ? "" : "s"}. Saved ${new Date(p.updated).toLocaleString()}</div></div>
      <button class="small" data-open="${p.id}">Open</button><button class="small danger" data-del="${p.id}">Delete</button></div>`;
  }).join("");
  for (const b of box.querySelectorAll("[data-open]")) b.onclick = async () => openProject(await S.loadProject(b.dataset.open));
  for (const b of box.querySelectorAll("[data-del]")) twoStep(b, "Really delete?", async () => { await S.deleteProject(await S.loadProject(b.dataset.del)); renderProjects(); showStorage(); });
  showStorage();
}
async function showStorage() {
  const s = await S.storageInfo();
  $("storageNote").textContent = s ? `Using ${fmtBytes(s.used)} of the ${fmtBytes(s.quota)} this browser allows here.${s.persisted ? "" : " The browser may clear it if the device runs low on space: export finished releases."}` : "";
}
// a destructive button asks once more instead of a pop-up
function twoStep(b, ask, run) {
  const label = b.textContent;
  b.onclick = async () => {
    if (b.dataset.armed) { b.disabled = true; try { await run(); } finally { b.disabled = false; } return; }
    b.dataset.armed = "1"; b.textContent = ask;
    setTimeout(() => { delete b.dataset.armed; b.textContent = label; }, 4000);
  };
}

// open one file straight away: a new project of the picked kind, the file as its first part
const drop = $("drop");
drop.addEventListener("click", () => $("file").click());
drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("file").click(); } });
drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); const f = e.dataTransfer.files[0]; if (f) quickOpen(f); });
$("file").addEventListener("change", () => { const f = $("file").files[0]; if (f) quickOpen(f); $("file").value = ""; });
async function quickOpen(file) {
  const p = P.newProject(newFormat, { title: file.name.replace(/\.[^.]+$/, "") });
  carryTransfer(p);
  await S.saveProject(p);
  await openProject(p);
  await openFileForPart(p.parts[0], file);
}

$("importProject").onclick = () => $("projectFile").click();
$("projectFile").onchange = async () => {
  const f = $("projectFile").files[0]; $("projectFile").value = "";
  if (!f) return;
  let p;
  try { p = P.fromProjectFile(await f.text()); }
  catch (err) { $("startErr").textContent = err.message || "That isn't an Encore Restore project file."; $("startErr").classList.remove("hidden"); return; }
  if (await S.loadProject(p.id)) p.id = uid() + uid();
  p.images = p.images.map((im) => ({ id: im.id, kind: im.kind, part: im.part, name: im.name, mime: im.mime, blob: new Blob([im.bytes], { type: im.mime }) }));
  await S.saveProject(p);
  await openProject(p);
  showTab("overview");
};

// a recording that was cut off (tab closed, crash): offer it back
async function checkInterrupted() {
  const rec = await S.getMeta("recording");
  if (!rec) return;
  const list = await unfinishedRecordings().catch(() => []), info = list.find((x) => x.name === rec.name);
  if (!info) { S.setMeta("recording", null); return; }
  const proj = await S.loadProject(rec.projectId), part = proj?.parts.find((x) => x.id === rec.partId);
  if (!part) return;
  const b = $("recoverBanner");
  b.innerHTML = `${esc(part.name)} of "${esc(proj.release.title || P.formatOf(proj.format).name)}" was being recorded when the page closed (${fmtTime(info.seconds || 0)} saved). <button class="small" id="recoverIt">Recover it</button> <button class="small" id="recoverNo">Discard it</button>`;
  b.classList.remove("hidden");
  $("recoverIt").onclick = async () => {
    b.classList.add("hidden");
    const res = await recoverRecording(info);
    await openProject(proj);
    selectPart(part.id);
    await attachRecording(part, { ...res, frames: Math.floor((res.file.size - 44) / (4 * res.channels)), device: info.device });
  };
  $("recoverNo").onclick = async () => { b.classList.add("hidden"); await deleteRecording(info.name); S.setMeta("recording", null); };
}

// ======================================================================
// A project on screen
// ======================================================================
function showWork(on) {
  $("work").classList.toggle("hidden", !on); $("startView").classList.toggle("hidden", on);
  document.body.classList.toggle("working", on);
}
$("toProjects").onclick = async () => {
  if (state.recording) { $("capNote").textContent = "Stop the recording first."; return; }
  player.stop(); await saveNow(); closeRecorder();
  state.project = null; state.partId = null; runs.clear();
  showWork(false); renderProjects();
};
async function openProject(p) {
  player.stop();
  runs.clear();
  for (const im of p.images || []) if (!im.blob && im.bytes) im.blob = new Blob([im.bytes], { type: im.mime });
  state.project = p;
  showWork(true);
  $("startErr").classList.add("hidden");
  renderReleaseTab(); renderExportTab();
  const first = p.parts.find((x) => x.include !== false && x.audio && !x.audio.missing) ?? p.parts.find((x) => x.include !== false) ?? p.parts[0];
  await selectPart(first.id);
}
function projectTitle() {
  const r = state.project.release;
  return [r.artist || r.albumArtist, r.title].filter(Boolean).join(" - ") || `Untitled ${P.formatOf(state.project.format).name}`;
}
function renderHeader() {
  const part = state.part, f = P.formatOf(state.project.format);
  $("projTitle").textContent = projectTitle(); $("projTitle").title = projectTitle();
  const a = part?.audio, s = state.src;
  let info = `${f.name}. ${part?.name ?? ""}: `;
  if (state.recording?.partId === part?.id) info += "recording...";
  else if (!a) info += "not in yet.";
  else if (a.missing) info += `open ${a.name} again to work on it.`;
  else if (s) { const bits = s.kind === "wav" ? `${s.h.bits}-bit${s.h.format === 3 ? " float" : ""}` : "decoded"; info += `${fmtTime(s.frames / s.fs)}, ${(s.fs / 1000).toFixed(1)} kHz, ${bits}${a.recorded ? ", recorded here" : ""}.`; }
  else info += "opening...";
  $("projInfo").textContent = info; $("projInfo").title = info;
  $("processBtn").textContent = `Restore ${part?.name ?? "it"}`;
}
// the parts, as tabs in the bar: a dot for in (blue), restored (green), recording (red)
function renderPartBar() {
  const bar = $("partBar");
  bar.innerHTML = state.project.parts.map((p) => {
    const r = runOf(p.id), fresh = r.restored && r.restored.key === keyOf(p.settings);
    const dot = state.recording?.partId === p.id ? "rec" : fresh ? "done" : p.audio && !p.audio.missing ? "audio" : "";
    return `<button role="tab" data-p="${p.id}" aria-selected="${p.id === state.partId}" class="${p.include === false ? "skip" : ""}" title="${esc(p.name)}${p.include === false ? " (skipped)" : ""}: ${p.tracks.length} track${p.tracks.length === 1 ? "" : "s"}"><span class="pdot ${dot}"></span>${esc(p.name)}</button>`;
  }).join("") + `<button data-add="1" title="Add a part (another side or disc)" aria-label="Add a part">+</button>`;
  for (const b of bar.querySelectorAll("[data-p]")) b.onclick = () => selectPart(b.dataset.p);
  bar.querySelector("[data-add]").onclick = () => addPartNow();
}
function addPartNow() {
  const p = P.addPart(state.project);
  touch(); selectPart(p.id); renderReleaseTab();
}

async function selectPart(id) {
  if (state.recording && state.recording.partId !== id) { $("capNote").textContent = `Stop recording ${state.part?.name} first.`; return; }
  player.stop();
  state.partId = id; state.sel = null; state.playhead = 0; state.capturing = false;
  state.view = state.restored ? "rest" : "orig";
  for (const x of $("viewSeg").children) x.classList.toggle("on", x.dataset.v === state.view);
  renderAll();
  const part = state.part;
  if (part.audio && !part.audio.missing) {
    if (!state.src) {
      showStatus("Opening the audio...");
      await ensureLoaded(part);
      if (part.id !== state.partId) return;
      renderAll();
    }
    if (state.src && !state.report) await analysePart(part);
  }
}
function renderAll() {
  if (!state.project) return;
  renderHeader(); renderPartBar(); showPanels(); renderSideTab(); renderCopyFrom(); renderModules(); renderFindings(); renderTracks(); renderOverview(); renderExportScope(); renderStatus(); updateButtons();
  resize();
}
// left column: the recorder / file opener while a part has no audio, else Listen
function showPanels() {
  const part = state.part, need = !part.audio || part.audio.missing || state.capturing;
  $("capturePanel").classList.toggle("hidden", !need); $("listenPanel").classList.toggle("hidden", need);
  if (need) {
    $("capTitle").textContent = part.audio?.missing ? `Find ${part.name} again` : `${state.capturing ? "Record" : "Get"} ${part.name}`;
    $("capStart").textContent = `Record ${part.name}`;
    $("capFileNote").textContent = part.audio?.missing ? `This side came from ${part.audio.name} (${fmtBytes(part.audio.size || 0)}), which wasn't kept on this device. Open it again and everything you did carries on.` : "";
    if (part.audio?.missing) setCapMode("file");
    if (capMode === "rec") fillInputs(false);
    drawCapWave();
  }
}
async function ensureLoaded(part) {
  const run = runOf(part.id);
  if (run.src) return run.src;
  if (!part.audio?.store) { if (part.audio) part.audio.missing = true; return null; }
  const file = await S.getAudio(part.audio.store);
  if (!file) { part.audio.missing = true; touch(); return null; }
  try { run.src = await openAudio(file, decode); run.file = file; }
  catch { part.audio.missing = true; return null; }
  return run.src;
}

// ---------- the status line under the bar ----------
function showStatus(text, pct = null) {
  $("anaLine").classList.remove("hidden"); $("procLine").classList.add("hidden");
  $("anaBar").classList.toggle("hidden", pct == null); if (pct != null) setBar("anaBar", pct);
  $("anaText").textContent = text;
}
function renderStatus() {
  const part = state.part, run = state.run;
  if (run.analysing) return;
  $("anaLine").classList.add("hidden"); $("procLine").classList.remove("hidden");
  let t;
  if (state.recording?.partId === part.id) t = `Recording ${part.name}. Stop it when the side ends${$("capAuto").checked ? ", or it stops by itself in the run-out groove" : ""}.`;
  else if (!part.audio) t = `Record ${part.name} or open its file (left).`;
  else if (part.audio.missing) t = `Open ${part.audio.name} again to carry on with ${part.name}.`;
  else if (!state.report) t = "Opening...";
  else if (restoredFresh()) t = "Up to date. Name the tracks under Tracks; export under Export.";
  else if (state.restored) t = `<span class="stale">Settings changed since the last restore. Restore it again to hear the whole side with them (the export does it too).</span>`;
  else t = "Nothing is changed in your file: the restored version is made alongside it.";
  $("procText").innerHTML = t;
}

// ======================================================================
// Getting a side in: record it, or open its file
// ======================================================================
let capMode = store.get("capMode", "rec");
function setCapMode(m) { capMode = m; store.set("capMode", m); for (const b of $("capSeg").children) b.classList.toggle("on", b.dataset.c === m); $("capRec").classList.toggle("hidden", m !== "rec"); $("capFile").classList.toggle("hidden", m !== "file"); if (m === "rec") fillInputs(false); }
for (const b of $("capSeg").children) b.onclick = () => setCapMode(b.dataset.c);
setCapMode(capMode);
const capDrop = $("capDrop");
capDrop.addEventListener("click", () => $("capFileIn").click());
capDrop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("capFileIn").click(); } });
capDrop.addEventListener("dragover", (e) => { e.preventDefault(); capDrop.classList.add("over"); });
capDrop.addEventListener("dragleave", () => capDrop.classList.remove("over"));
capDrop.addEventListener("drop", (e) => { e.preventDefault(); capDrop.classList.remove("over"); const f = e.dataTransfer.files[0]; if (f) openFileForPart(state.part, f); });
$("capFileIn").addEventListener("change", () => { const f = $("capFileIn").files[0]; $("capFileIn").value = ""; if (f) openFileForPart(state.part, f); });
$("keepCopy").checked = store.get("keepCopy", "1") === "1";
$("keepCopy").onchange = () => store.set("keepCopy", $("keepCopy").checked ? "1" : "0");

async function openFileForPart(part, file) {
  player.stop();
  const run = runOf(part.id), same = part.audio?.missing && part.audio.name === file.name && part.audio.size === file.size;
  $("capFileNote").textContent = "Opening...";
  let src;
  try { src = await openAudio(file, decode); }
  catch { $("capFileNote").innerHTML = `<span class="err">Couldn't read ${esc(file.name)}. Try WAV, FLAC or MP3.</span>`; $("startErr").textContent = "Couldn't read that file. Try WAV, FLAC or MP3."; $("startErr").classList.remove("hidden"); return; }
  let kept = null, storeName = null;
  if ($("keepCopy").checked) {
    storeName = `${state.project.id}-${part.id}-${Date.now()}${/\.[a-z0-9]{2,5}$/i.exec(file.name)?.[0].toLowerCase() ?? ".audio"}`;
    try {
      kept = await S.storeAudio(storeName, file, (p) => { $("capFileNote").textContent = `Keeping a copy on this device... ${Math.round(100 * p)}%`; if (part.id === state.partId) showStatus(`Keeping a copy of ${file.name} on this device...`, 100 * p); });
      if (src.kind === "wav") src = await openAudio(kept, decode);
    } catch (err) { kept = null; storeName = null; $("capFileNote").textContent = `Couldn't keep a copy (${err.message}); working from the file itself.`; }
  }
  if (part.audio?.store && part.audio.store !== storeName) await S.removeAudio(part.audio.store);
  const bits = src.kind === "wav" ? src.h.bits : null;
  part.audio = { name: file.name, size: file.size, seconds: src.frames / src.fs, fs: src.fs, bits, float: src.kind === "wav" && src.h.format === 3, channels: src.channels, recorded: false, store: storeName, at: new Date().toISOString() };
  runs.set(part.id, { ...runOf(part.id), src, file: kept ?? file, report: null, restored: null, preview: null, suggested: null, gaps: null, analysing: null });
  if (!same) {
    S.deleteReport(`${state.project.id}:${part.id}`);
    part.settings = null; part.restored = null;
    if (part.tracks.some((t) => t.start != null)) part.needsPlacing = true;
  }
  if (!state.project.release.title && state.project.parts.length === 1) state.project.release.title = file.name.replace(/\.[^.]+$/, "");
  $("capFileNote").textContent = "";
  touch();
  state.capturing = false;
  if (part.id === state.partId) renderAll();
  await analysePart(part, !same);
}

// ---------- recording ----------
let rec = null, quiet = null, capPeaks = [], capFs = 48000;
async function fillInputs(ask) {
  const sel = $("capInput");
  if (fillInputs.busy || (!ask && sel.dataset.filled)) return;
  fillInputs.busy = true;
  try {
    const list = await listInputs({ askPermission: !!ask }); // names show once the browser has the mic permission
    const want = store.get("capInput", "");
    sel.innerHTML = list.length ? list.map((d) => `<option value="${esc(d.id)}">${esc(d.label)}${d.bluetooth ? " (Bluetooth: phone-call quality)" : ""}</option>`).join("") : `<option value="">No inputs found</option>`;
    if (list.some((d) => d.id === want)) sel.value = want;
    sel.dataset.filled = "1";
  } catch (err) { sel.innerHTML = `<option value="">Inputs can't be listed: ${esc(err.message)}</option>`; }
  finally { fillInputs.busy = false; }
}
$("capRefresh").onclick = () => { delete $("capInput").dataset.filled; fillInputs(true); };
$("capInput").onchange = async () => { store.set("capInput", $("capInput").value); if (rec && rec.state === "armed") { await closeRecorder(); await armRecorder(); } };
function closeRecorder() { const r = rec; rec = null; setMeter(null); return r?.close().catch(() => {}); }
async function armRecorder() {
  if (rec && rec.state !== "idle") return rec;
  rec = new SideRecorder();
  try {
    const info = await rec.open({ deviceId: $("capInput").value || undefined, onLevels: onCapLevels, onWarn: (w) => { $("capNote").textContent = w; }, onLost: (r) => { if (r) attachRecording(state.recording?.part ?? state.part, r); } });
    capFs = info.fs;
    delete $("capInput").dataset.filled; fillInputs(true);
    rec.onRms = (db, sec, recording) => { if (recording && quiet && $("capAuto").checked && quiet.push(db, sec)) stopRecording("auto"); };
    $("capInfo").textContent = `${info.device}: ${(info.fs / 1000).toFixed(1)} kHz, ${info.channels} channel${info.channels === 1 ? "" : "s"}`;
    $("capArm").textContent = "Stop checking";
    return rec;
  } catch (err) { rec = null; $("capNote").innerHTML = `<span class="err">The input couldn't be opened: ${esc(err.message)}. Check the browser's microphone permission.</span>`; return null; }
}
$("capArm").onclick = async () => { if (rec && rec.state === "armed") { await closeRecorder(); $("capArm").textContent = "Check the level"; return; } await armRecorder(); };
$("capStart").onclick = async () => {
  const part = state.part;
  if (!(await armRecorder())) return;
  quiet = new P.QuietWatch({ seconds: Math.max(5, +$("capAutoSec").value || 15) });
  capPeaks = [];
  const r = await rec.record();
  state.recording = { partId: part.id, part, name: rec.name };
  S.setMeta("recording", { projectId: state.project.id, partId: part.id, name: rec.name });
  $("capStart").classList.add("hidden"); $("capStop").classList.remove("hidden"); $("capArm").disabled = true; $("capInput").disabled = true;
  $("capNote").textContent = r.storage === "disk" ? "Recording. It's saved on this device as it goes." : "Recording (into memory: this browser has no private file storage, so keep the tab open).";
  renderPartBar(); renderHeader(); renderStatus();
};
$("capStop").onclick = () => stopRecording("button");
async function stopRecording(why) {
  if (!rec || rec.state !== "recording") return;
  const part = state.recording.part;
  $("capStop").disabled = true;
  const res = await rec.stop();
  rec = null;
  $("capStop").disabled = false; $("capStop").classList.add("hidden"); $("capStart").classList.remove("hidden"); $("capArm").disabled = false; $("capInput").disabled = false; $("capArm").textContent = "Check the level";
  setMeter(null);
  if (!res) return;
  $("capNote").textContent = why === "auto" ? "Stopped by itself: the side ended." : "Stopped.";
  await attachRecording(part, res);
}
async function attachRecording(part, res) {
  const frames = res.frames ?? Math.floor((res.file.size - 44) / (4 * res.channels));
  const name = `${state.project.id}-${part.id}-${Date.now()}.wav`;
  showStatus("Keeping the recording with the project...", 0);
  let file;
  try { file = await S.storeAudio(name, res.file, (p) => showStatus("Keeping the recording with the project...", 100 * p)); await deleteRecording(res.name); }
  catch { file = res.file; } // stays in Live's folder; still usable
  if (part.audio?.store && part.audio.store !== name) await S.removeAudio(part.audio.store);
  const device = res.device || $("capInfo").textContent.split(":")[0];
  part.audio = { name: `${P.cleanName(part.name)} (recorded ${P.localDate()}).wav`, size: file.size, seconds: frames / res.fs, fs: res.fs, bits: 32, float: true, channels: res.channels, recorded: true, device, store: file === res.file ? null : name, at: new Date().toISOString() };
  const x = state.project.transfer;
  if (!x.adc && device) x.adc = device;
  if (!x.settings) x.settings = `${(res.fs / 1000).toFixed(1)} kHz, 32-bit float, recorded in Encore Restore`;
  if (!x.date) x.date = P.localDate();
  S.setMeta("recording", null);
  state.recording = null;
  const src = await openAudio(file, decode);
  runs.set(part.id, { ...runOf(part.id), src, file, report: null, restored: null, preview: null, suggested: null, gaps: null, analysing: null });
  S.deleteReport(`${state.project.id}:${part.id}`);
  part.settings = null; part.restored = null;
  if (part.tracks.some((t) => t.start != null)) part.needsPlacing = true;
  state.capturing = false;
  touch(); renderReleaseTab();
  if (part.id === state.partId) renderAll();
  await analysePart(part, true);
}
function onCapLevels(m) {
  const pk = m.peaks || [0, 0];
  setMeter([pk[0] ?? 0, pk[1] ?? pk[0] ?? 0], m.pinned);
  if (m.recording) {
    capPeaks.push(Math.max(pk[0] ?? 0, pk[1] ?? pk[0] ?? 0));
    $("capTime").textContent = `${fmtTime(m.seconds)}  ${fmtBytes(m.bytes)}`;
    drawCapWave();
  }
}
function setMeter(pk, pinned) {
  for (const [i, id] of [[0, "L"], [1, "R"]]) {
    const v = pk ? pk[i] : 0, db = v > 0 ? 20 * Math.log10(v) : -Infinity, w = pk ? Math.max(0, Math.min(100, (db + 60) / 60 * 100)) : 0;
    const bar = $("m" + id); bar.style.width = `${w}%`; bar.parentElement.style.setProperty("--mw", `${bar.parentElement.clientWidth}px`);
    const t = $(`m${id}db`); t.textContent = pk ? (isFinite(db) ? `${db.toFixed(1)} dB` : "-inf") : "-"; t.classList.toggle("clip", !!(pinned && pinned[i] > 2) || db > -0.5);
  }
}
function drawCapWave() {
  const c = $("capWave"), dpr = window.devicePixelRatio || 1;
  if (!c.clientWidth) return;
  if (c.width !== Math.round(c.clientWidth * dpr) || c.height !== Math.round(c.clientHeight * dpr)) { c.width = Math.round(c.clientWidth * dpr); c.height = Math.round(c.clientHeight * dpr); }
  const g = c.getContext("2d"), W = c.width, H = c.height, n = capPeaks.length;
  g.clearRect(0, 0, W, H);
  g.fillStyle = "rgb(242 239 232 / 0.35)"; g.font = `${11 * dpr}px sans-serif`;
  if (!n) { g.fillText(state.recording ? "Recording..." : "The recording shows here as it comes in.", 10 * dpr, 18 * dpr); return; }
  const span = Math.max(n, 240), mid = H / 2; // at least a minute across (4 batches a second)
  g.fillStyle = "rgb(239 68 68 / 0.75)";
  for (let x = 0; x < W; x++) {
    const a = Math.floor(x / W * span), b = Math.max(a + 1, Math.floor((x + 1) / W * span));
    if (a >= n) break;
    let pk = 0; for (let i = a; i < Math.min(n, b); i++) pk = Math.max(pk, capPeaks[i]);
    g.fillRect(x, mid - pk * mid * 0.95, 1, Math.max(1, 2 * pk * mid * 0.95));
  }
}

// ======================================================================
// Listening: the analysis of a side, and its track splits
// ======================================================================
async function analysePart(part, force = false) {
  const run = runOf(part.id);
  if (!run.src) return;
  if (run.analysing) return run.analysing;
  const cur = () => part.id === state.partId;
  run.analysing = (async () => {
    const key = `${state.project.id}:${part.id}`, src = run.src, sourceType = P.formatOf(state.project.format).source;
    if (cur()) { showStatus("Listening through the whole side...", 0); $("anaSummary").textContent = "Listening..."; $("findings").innerHTML = ""; renderModules(); }
    let report = force ? null : await S.loadReport(key);
    if (report && (report.frames !== src.frames || report.fs !== src.fs || report.sourceType !== sourceType)) report = null;
    if (!report) {
      try {
        const res = await rpc({ type: "analyse", source: describe(src), sourceType }, (p) => { if (cur()) showStatus(p.text || "Listening...", p.pct); });
        report = res.report; report.sourceType = sourceType;
        S.saveReport(key, report);
      } catch (err) { if (cur()) { showStatus(`The analysis stopped: ${err.message}`); $("anaSummary").textContent = "The analysis stopped."; } return; }
    }
    run.report = report; run.suggested = report.settings;
    if (!part.settings) initSettings(part, report);
    if (!run.gaps) {
      if (cur()) showStatus("Measuring the gaps between tracks...", 0);
      try { const lv = await srpc({ type: "levels", source: describe(src) }, (p) => { if (cur()) showStatus("Measuring the gaps between tracks...", p.pct); }); run.gaps = P.gapCandidates(lv.lv, lv.hop); }
      catch (err) { console.error(err); }
    }
    if (!part.tracks.length) part.tracks = report.tracks.tracks.map((t) => ({ ...P.blankTrack(), start: t.start, end: t.end }));
    else if (part.needsPlacing) placeN(part, part.tracks.length, part.tracks.map((t) => t.durationHint));
    touch();
  })();
  try { await run.analysing; } finally { run.analysing = null; }
  if (cur()) { renderAll(); draw(); drawWow(); }
  else renderPartBar();
}
// a new side's settings: what the analysis suggests, the project's defaults on top, and its speed
function initSettings(part, report) {
  let s = clone(report.settings);
  if (state.project.defaults) s = P.copyChoices(state.project.defaults, s);
  part.speedExtra = 0;
  part.settings = s;
  applySpeed(part);
}
function renderFindings() {
  const r = state.report;
  if (!r) { $("anaSummary").textContent = state.part?.audio ? "Listening..." : "Nothing to listen to yet."; $("findings").innerHTML = ""; $("heardCount").textContent = ""; $("lastRestore").classList.add("hidden"); }
  else {
    $("anaSummary").textContent = `Listened to ${fmtTime(r.seconds)}${r.ms ? ` in ${(r.ms / 1000).toFixed(1)} s` : ""}. Each fix is switched on where it's needed, at a gentle starting point.`;
    $("findings").innerHTML = r.findings.map((f) => `<li class="${f.level}"><span class="dot"></span><span>${esc(f.text)}</span></li>`).join("");
    const n = r.findings.filter((f) => f.level === "fix" || f.level === "warn").length;
    $("heardCount").textContent = n ? `(${n})` : "";
    $("lastRestore").classList.toggle("hidden", !state.restored);
    if (state.restored) $("procSummary").textContent = restoredSummary(state.restored, state.settings);
  }
  const s = SOURCES.find((x) => x.id === state.source);
  $("srcBlurb2").textContent = s ? `${P.formatOf(state.project.format).name} (restored as ${s.name}): ${s.blurb}.` : "";
}
$("reanalyse").onclick = () => { if (state.part) { runOf(state.part.id).gaps = null; analysePart(state.part, true); } };
$("useRec").onclick = () => { if (!state.suggested) return; state.settings = clone(state.suggested); state.part.speedExtra = 0; applySpeed(state.part); settingsChanged(); renderModules(); };

// settings carry big arrays (noise profile, wow curve); keep them out of comparisons
const clone = (s) => structuredClone(s);
const keyOf = (s) => (s ? JSON.stringify(s, (k, v) => (ArrayBuffer.isView(v) ? `[${v.length}:${v[0]}:${v[v.length >> 1]}]` : v)) : "");

// ---------- copying fixes between sides ----------
function renderCopyFrom() {
  const sel = $("copyFrom"), others = state.project.parts.filter((p) => p.id !== state.partId && p.settings);
  sel.innerHTML = (state.project.defaults ? `<option value="defaults">the project defaults</option>` : "") + others.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("");
  const none = !sel.options.length;
  sel.disabled = none || !state.settings; $("copyBtn").disabled = none || !state.settings; $("makeDefault").disabled = !state.settings;
  if (none) sel.innerHTML = `<option>another side (none done yet)</option>`;
}
$("copyBtn").onclick = () => {
  const v = $("copyFrom").value, from = v === "defaults" ? state.project.defaults : state.project.parts.find((p) => p.id === v)?.settings;
  if (!from || !state.settings) return;
  state.settings = P.copyChoices(from, state.settings);
  settingsChanged(); renderModules();
  $("copyNote").textContent = `Copied from ${v === "defaults" ? "the defaults" : state.project.parts.find((p) => p.id === v).name}. This side keeps its own measured noise, hum, speed and wobble.`;
};
$("makeDefault").onclick = () => {
  if (!state.settings) return;
  state.project.defaults = clone(state.settings);
  touch(); renderCopyFrom();
  $("copyNote").textContent = `New sides will start from ${state.part.name}'s choices.`;
};

// ======================================================================
// The fixes (one row each; open one for its settings)
// ======================================================================
const findingsFor = (id) => (state.report?.findings ?? []).filter((f) => f.module === id).map((f) => f.text).join(" ");
const MODULES = [
  { id: "rumble", name: "Rumble and DC", what: "Takes out turntable rumble, footsteps and the waveform sitting off-center (DC). Nothing musical lives down there; the tuba's lowest notes are untouched.",
    found: () => findingsFor("rumble") || "Always worth having on for records.",
    controls: [{ type: "range", label: "Cut below", min: 10, max: 80, step: 1, get: (s) => s.rumble.hz, set: (s, v) => (s.rumble.hz = v), fmt: (v) => `${v} Hz` }] },
  { id: "channels", name: "Channels", what: "Mono records (most 78s, early LPs) sound best with both channels summed, or with the cleaner one alone. Cassettes often have the tape head a hair out of line (azimuth), which smears the highs: lining up the channels brings them back. A mono record is exported as mono files.",
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
  { id: "speed", name: "Speed and pitch", what: "Fixes a transfer that ran fast or slow (a deck off speed, a 78 cut at 76 or 80, a 45 played at 33), by exact resampling: speed and pitch move together, like the real thing, with nothing smeared. The record's speed and the speed it was played at are under Side.",
    found: () => findingsFor("speed"),
    controls: [
      { type: "number", label: "Change pitch by (cents)", step: 0.5, get: (s) => +(s.speed.cents || 0).toFixed(1), set: (s, v) => { s.speed.cents = v; s.speed.on = true; } },
      { type: "select", label: "Tune to", options: [[440, "A = 440 (modern)"], [435, "A = 435 (old continental)"], [442, "A = 442"], [445, "A = 445"], [452, "A = 452 (old high pitch)"]], get: (s) => s.speed.a4 ?? 440, set: (s, v) => { s.speed.a4 = +v; retune(s); s.speed.on = true; } },
      { type: "select", label: "Played at the wrong speed", options: RPM_FIXES.map((r) => [r.id, r.name]), get: (s) => s.speed.rpm, set: (s, v) => { s.speed.rpm = v; if (v !== "none") s.speed.on = true; }, full: true },
    ] },
  { id: "wow", name: "Wow", what: "Wow is a slow wobble in pitch, a few times a second: a warped record, an off-center hole, a stretched tape. This follows the measured wobble and steadies it. The measurement is good but not perfect on busy music, so it starts gentle.",
    found: () => describeWow(state.report?.wow),
    controls: [{ type: "range", label: "Steady it by", min: 0, max: 100, step: 5, get: (s) => s.wow.amount, set: (s, v) => (s.wow.amount = v), fmt: (v) => `${v}%`, full: true }] },
];
// "Tune to": the measured offset is against A440; a band at A435 is 20 cents flat of that on purpose
function retune(s) {
  const t = state.report?.tuning;
  if (!t?.found) return;
  let d = t.cents - 1200 * Math.log2((s.speed.a4 || 440) / 440);
  d = ((d + 150) % 100 + 100) % 100 - 50;
  s.speed.cents = +(-d + (state.part?.speedExtra || 0)).toFixed(1);
}
const firstSentence = (t) => (String(t || "").match(/^.*?[.!?](\s|$)/)?.[0] ?? String(t || "")).trim();
const STATUS = {
  rumble: (s) => `Cut below ${s.rumble.hz} Hz`,
  channels: (s) => [{ stereo: "Stereo", sum: "Mono, both channels", left: "Mono, left only", right: "Mono, right only" }[s.channels.mode], s.channels.alignOn && "lined up", s.channels.balanceOn && "balanced", s.channels.flip && "right flipped"].filter(Boolean).join(", "),
  declick: (s) => `Clicks ${s.declick.clicks || "off"}, crackle ${s.declick.crackle || "off"}` + (state.restored?.clicks && restoredFresh() ? `, ${state.restored.clicks.total} repaired` : ""),
  dehum: (s) => (s.dehum.harmonics.length ? `${s.dehum.hz.toFixed(1)} Hz, ${s.dehum.harmonics.length} harmonic${s.dehum.harmonics.length === 1 ? "" : "s"}` : `${s.dehum.hz.toFixed(1)} Hz, no harmonics set`),
  denoise: (s) => `Noise down ${nrAmountToDb(s.denoise.amount).toFixed(0)} dB` + (s.denoise.profile ? "" : ", nothing learned yet"),
  eq: (s) => [s.eq.curve === "custom" ? `Custom, ${s.eq.turnover} Hz` : CURVES.find((c) => c.id === s.eq.curve)?.name, s.eq.air ? `air +${s.eq.air} dB` : ""].filter(Boolean).join(", "),
  speed: (s) => { const c = speedCents(s); return `${c > 0 ? "+" : ""}${c.toFixed(1)} cents` + (s.speed.rpm !== "none" ? `, ${RPM_FIXES.find((r) => r.id === s.speed.rpm)?.name}` : ""); },
  wow: (s) => `Steadied ${s.wow.amount}%`,
};
function statusOf(m, s) {
  if (s[m.id].on) return STATUS[m.id](s);
  const heard = firstSentence(findingsFor(m.id));
  return heard ? `Off. ${heard}` : "Off";
}
let openMod = null;
function renderModules() {
  const box = $("modules"), s = state.settings;
  const focusKey = box.contains(document.activeElement) ? document.activeElement.dataset.key : null;
  box.innerHTML = "";
  if (!s) { box.innerHTML = `<div class="note">${state.part?.audio ? "Listening to the side first..." : `The fixes appear once ${esc(state.part?.name ?? "the side")} is in.`}</div>`; return; }
  for (const m of MODULES) {
    const card = document.createElement("div");
    const open = openMod === m.id, id = `m_${m.id}`;
    card.className = "mod" + (s[m.id].on ? " on" : "");
    card.dataset.mod = m.id;
    card.innerHTML = `<div class="modRow"><label class="switch" title="On or off"><input type="checkbox" id="${id}" data-key="${m.id}:on" ${s[m.id].on ? "checked" : ""} aria-label="${esc(m.name)} on"><span></span></label>
      <button class="modHead" data-key="${m.id}:head" aria-expanded="${open}" aria-controls="md_${m.id}" title="Settings and what it does"><span class="modName">${esc(m.name)}</span><span class="modStat"></span><span class="chev" aria-hidden="true">&#9660;</span></button></div>
      <div class="modBody" id="md_${m.id}" ${open ? "" : "hidden"}><div class="what">${esc(m.what)}</div><div class="found">${esc(m.found() || "Nothing to fix.")}</div>${m.removable ? `<button class="small listen" data-listen="${m.id}" data-key="${m.id}:listen" title="Preview the selection and listen to only what this takes out">Hear what it removes</button>` : ""}<div class="ctl"></div></div>`;
    const stat = card.querySelector(".modStat");
    const showStat = () => { stat.textContent = statusOf(m, s); stat.title = stat.textContent; };
    showStat();
    card.querySelector(`#${id}`).onchange = (e) => { s[m.id].on = e.target.checked; card.classList.toggle("on", e.target.checked); showStat(); settingsChanged(); if (m.id === "wow") drawWow(); };
    card.querySelector(".modHead").onclick = () => { openMod = open ? null : m.id; renderModules(); };
    card.querySelector("[data-listen]")?.addEventListener("click", () => { $("removedBy").value = m.id; setMode("removed"); preview(true); });
    const ctl = card.querySelector(".ctl");
    m.controls.forEach((c, i) => { const el = control(c, s, showStat); (el.matches("input, select, button") ? el : el.querySelector("input, select"))?.setAttribute("data-key", `${m.id}:${i}`); ctl.append(el); });
    box.append(card);
  }
  if (focusKey) box.querySelector(`[data-key="${focusKey}"]`)?.focus();
}
function control(c, s, showStat = () => {}) {
  const wrap = document.createElement("label");
  if (c.full) wrap.className = "full";
  if (c.type === "button") { const b = document.createElement("button"); b.className = "small full"; b.textContent = c.label; b.onclick = c.run; return b; }
  if (c.type === "check") {
    wrap.className = "toggle" + (c.full ? " full" : "");
    const i = document.createElement("input"); i.type = "checkbox"; i.checked = !!c.get(s);
    i.onchange = () => { c.set(s, i.checked); showStat(); settingsChanged(); };
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
    input.onchange = () => { c.set(s, +input.value); showStat(); settingsChanged(); };
  }
  wrap.append(input);
  return wrap;
}
function settingsChanged() {
  state.preview = null;
  renderStatus();
  touch(); renderPartBar(); renderOverview(); renderSideSpeed();
  updateButtons();
}

// ======================================================================
// The waveform
// ======================================================================
const wave = $("wave");
function resize() {
  const dpr = window.devicePixelRatio || 1;
  for (const c of [wave, $("wowGraph")]) { if (!c.clientWidth) continue; c.width = Math.round(c.clientWidth * dpr); c.height = Math.round(c.clientHeight * dpr); }
  draw(); drawWow(); drawCapWave();
}
window.addEventListener("resize", resize);
if (window.ResizeObserver) { let last = ""; new ResizeObserver(() => { const k = wave.clientWidth + "x" + wave.clientHeight; if (wave.clientWidth && k !== last) { last = k; resize(); } }).observe(wave); new ResizeObserver(() => drawCapWave()).observe($("capWave")); }
const duration = () => (state.src ? state.src.frames / state.src.fs : 0);
const cents = () => (state.restored ? state.restored.cents : 0);

function draw() {
  const g = wave.getContext("2d"), W = wave.width, H = wave.height, dpr = window.devicePixelRatio || 1;
  g.clearRect(0, 0, W, H);
  const r = state.report, dur = duration();
  if (!r || !dur || !W) return;
  const css = getComputedStyle(document.documentElement);
  const rest = state.view === "rest" && state.restored, ov = rest ? state.restored.overview : r.overview;
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
  const X = (t) => (t / dur) * W;
  if (state.sel) { g.fillStyle = "rgb(242 239 232 / 0.16)"; g.fillRect(X(state.sel.a), 0, Math.max(1, X(state.sel.b) - X(state.sel.a)), H); }
  g.fillStyle = "rgb(232 176 75 / 0.55)";
  for (const d of r.dropouts || []) g.fillRect(X(d.start), 0, Math.max(2 * dpr, X(d.end) - X(d.start)), H);
  g.fillStyle = "#ef4444";
  for (const c of r.clipping || []) g.fillRect(X(c.start), H - 10 * dpr, Math.max(2 * dpr, X(c.end) - X(c.start)), 10 * dpr);
  g.fillStyle = "#ff3b00";
  const clicks = state.restored?.clicks?.at ?? (r.clicks?.positions || []).map((p) => p / r.fs);
  for (const t of clicks) g.fillRect(X(t), 0, Math.max(1, dpr), 7 * dpr);
  // track splits, labelled with their positions
  g.strokeStyle = "#22d3ee"; g.fillStyle = "#22d3ee"; g.lineWidth = 1.5 * dpr; g.font = `${11 * dpr}px ${css.getPropertyValue("--family-mono") || "monospace"}`;
  const placed = state.tracks.filter((t) => t.start != null);
  state.tracks.forEach((t, i) => {
    if (t.start == null) return;
    const x = X(t.start);
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke();
    g.fillText(posOf(state.part, i), x + 3 * dpr, 20 * dpr);
  });
  if (placed.length) { const x = X(placed[placed.length - 1].end); g.setLineDash([4 * dpr, 4 * dpr]); g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); g.setLineDash([]); }
  g.fillStyle = "#f2efe8"; g.fillRect(X(state.playhead) - dpr / 2, 0, Math.max(1, dpr), H);
}
const posOf = (part, i) => (part.letter ? (part.tracks.length === 1 && state.project.format === "single" ? part.letter : `${part.letter}${i + 1}`) : String(i + 1));

function drawWow() {
  const cv = $("wowGraph"), w = state.report?.wow;
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

// click: playhead; drag: selection; near a track split: move it
let dragging = null;
wave.addEventListener("pointerdown", (e) => {
  if (!state.report) return;
  const rect = wave.getBoundingClientRect(), t = ((e.clientX - rect.left) / rect.width) * duration();
  const px = (tt) => (tt / duration()) * rect.width;
  const near = state.tracks.findIndex((tr, i) => i > 0 && tr.start != null && state.tracks[i - 1].start != null && Math.abs(px(tr.start) - (e.clientX - rect.left)) < 6);
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
  if (d.kind === "split") { renderTracks(); touch(); return; }
  if (Math.abs(e.clientX - d.x0) <= 4) seek(d.t0);
  else { state.preview = null; seek(state.sel.a); }
});
function showSel() { $("selInfo").textContent = state.sel ? `Selected ${fmt(state.sel.a)} to ${fmt(state.sel.b)} (${(state.sel.b - state.sel.a).toFixed(1)} s)` : ""; }
function seek(t) {
  state.playhead = Math.max(0, Math.min(duration(), t));
  if (player.playing) player.play(state.playhead); else { draw(); $("time").textContent = fmt(state.playhead); }
}

// ======================================================================
// Playing: a second at a time from the original, the restored Blob, or a
// preview, always on the original's timeline
// ======================================================================
class Player {
  constructor() { this.playing = false; this.gen = 0; this.blocks = []; }
  async play(t) {
    if (!state.src) return;
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
async function streamFor(mode, t) {
  const fs = state.src.fs, loop = $("loop").checked && state.sel ? state.sel : null;
  if (mode === "orig") {
    const toF = (x) => Math.round(x * fs);
    const pv = currentPreview(t);
    const gain = $("match").checked ? Math.pow(10, ((pv ? pv.lufsOut - pv.lufsIn : state.restored ? state.restored.lufsOut - state.restored.lufsIn : 0)) / 20) : 1;
    return { fs, from: toF(t), end: state.src.frames, loopFrom: loop ? toF(loop.a) : null, loopTo: loop ? toF(loop.b) : null, read: (a, n) => state.src.read(a, n), toTimeline: (p) => p / fs, gain, label: "original" };
  }
  let pv = currentPreview(t);
  const needRemoved = mode === "removed";
  if (needRemoved && pv && pv.removedBy !== $("removedBy").value) pv = null;
  if (!pv && (needRemoved || !restoredFresh())) pv = await preview(needRemoved, state.sel && t >= state.sel.a && t < state.sel.b ? null : t);
  if (pv) {
    const base = Math.round(pv.outStart * fs), len = pv.l.length;
    const L = needRemoved ? pv.rl : pv.l, R = needRemoved ? pv.rr : pv.r;
    if (!L) return null;
    const toF = (x) => Math.max(0, Math.min(len, Math.round(toRestoredTime(x, pv.cents) * fs) - base));
    const read = async (a, n) => ({ l: L.slice(a, a + n), r: R.slice(a, a + n) });
    const lp = loop && loop.a >= pv.start - 0.01 && loop.b <= pv.end + 0.01 ? loop : { a: pv.start, b: pv.end };
    return { fs, from: toF(Math.max(t, pv.start)), end: len, loopFrom: toF(lp.a), loopTo: loop ? toF(lp.b) : null, read, toTimeline: (p) => toOriginalTime((base + p) / fs, pv.cents), gain: 1, label: needRemoved ? "what was removed" : "restored (preview)" };
  }
  const R = state.restored, rd = new F32Reader(R.blob, R.fs, R.frames), toF = (x) => Math.round(toRestoredTime(x, R.cents) * R.fs);
  return { fs: R.fs, from: toF(t), end: R.frames, loopFrom: loop ? toF(loop.a) : null, loopTo: loop ? toF(loop.b) : null, read: (a, n) => rd.read(a, n), toTimeline: (p) => toOriginalTime(p / R.fs, R.cents), gain: 1, label: "restored" };
}
const freshFor = (part) => { const r = runOf(part.id).restored; return !!(r && part.settings && r.key === keyOf(part.settings)); };
const restoredFresh = () => (state.part ? freshFor(state.part) : false);
const currentPreview = (t) => { const p = state.preview; return p && p.key === keyOf(state.settings) && t >= p.start - 0.05 && t < p.end ? p : null; };

function setMode(m) { state.mode = m; for (const b of $("abSeg").children) b.classList.toggle("on", b.dataset.m === m); if (player.playing) player.play(state.playhead); }
for (const b of $("abSeg").children) b.onclick = () => setMode(b.dataset.m);
for (const b of $("viewSeg").children) b.onclick = () => { state.view = b.dataset.v; for (const x of $("viewSeg").children) x.classList.toggle("on", x === b); draw(); };
$("playBtn").onclick = () => (player.playing ? player.stop() : player.play(state.playhead));
$("loop").onchange = () => { if (player.playing) player.play(state.playhead); };
$("match").onchange = () => { if (player.playing) player.play(state.playhead); };
$("removedBy").onchange = () => { if (state.preview) state.preview.removedBy = null; if (state.mode === "removed" && player.playing) player.play(state.playhead); };
document.addEventListener("keydown", (e) => {
  if (!state.report || $("listenPanel").classList.contains("hidden") || /INPUT|SELECT|TEXTAREA|BUTTON/.test(e.target.tagName)) return;
  if (e.code === "Space") { e.preventDefault(); $("playBtn").click(); }
  if (e.key === "b" || e.key === "B") setMode(state.mode === "orig" ? "rest" : "orig");
});

// ---------- preview ----------
async function preview(withRemoved = false, at = null) {
  if (!state.src || !state.settings) return null;
  const sel = at == null && state.sel ? state.sel : { a: at ?? state.playhead, b: Math.min(duration(), (at ?? state.playhead) + 20) };
  if (sel.b - sel.a < 0.5) return null;
  const removedBy = withRemoved || state.mode === "removed" ? $("removedBy").value : null;
  $("playNote").textContent = `Restoring ${fmt(sel.a)} to ${fmt(sel.b)} with the current settings${removedBy ? " (and working out what's taken out)" : ""}...`;
  $("previewBtn").disabled = true;
  try {
    const res = await rpc({ type: "preview", source: describe(state.src), start: sel.a, end: sel.b, settings: state.settings, removed: removedBy });
    const fs = state.src.fs, a = Math.round(sel.a * fs), n = Math.round((sel.b - sel.a) * fs);
    const o = await state.src.read(a, n), mi = new LufsMeter(fs), mo = new LufsMeter(fs);
    mi.push(o.l, o.r); mo.push(res.l, res.r);
    state.preview = { ...res, start: sel.a, end: sel.b, key: keyOf(state.settings), removedBy, cents: speedCents(state.settings), lufsIn: mi.value(), lufsOut: mo.value() };
    $("playNote").textContent = `Preview ready: ${fmt(sel.a)} to ${fmt(sel.b)}${res.clicks.length ? `, ${res.clicks.length} clicks repaired in it` : ""}. ${restoredFresh() ? "" : "Restore the whole side to play all of it."}`;
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

// ======================================================================
// Restoring a whole side
// ======================================================================
async function processPart(part, onProgress) {
  const run = runOf(part.id);
  const settings = clone(part.settings), key = keyOf(part.settings);
  const res = await rpc({ type: "process", source: describe(run.src), settings }, onProgress);
  if (res.type === "cancelled") return null;
  run.restored = { ...res, key, cents: speedCents(settings) };
  run.preview = null;
  part.restored = { key, clicks: { total: res.clicks.total, long: res.clicks.long }, lufsIn: res.lufsIn, lufsOut: res.lufsOut, peakDb: res.peakDb };
  touch();
  return run.restored;
}
function restoredSummary(res, settings) {
  const dur = res.frames / res.fs;
  return `Restored ${fmtTime(dur)} in ${fmtTime(res.seconds)} (${(dur / Math.max(0.1, res.seconds)).toFixed(1)}x real time).` +
    (settings?.declick.on ? ` ${res.clicks.total} clicks repaired${res.clicks.long ? `, ${res.clicks.long} too long to rebuild (marked)` : ""}.` : "") +
    ` Loudness: original ${res.lufsIn.toFixed(1)} LUFS, restored ${res.lufsOut.toFixed(1)} LUFS (played back matched). Peak ${res.peakDb.toFixed(1)} dBFS.` +
    (Math.abs(res.cents) > 0.5 ? ` Speed changed by ${res.cents.toFixed(1)} cents.` : "");
}
$("processBtn").onclick = async () => {
  const part = state.part;
  if (!part?.settings || state.busy || !state.src) return;
  player.stop();
  state.busy = true; updateButtons();
  $("anaLine").classList.add("hidden"); $("procLine").classList.remove("hidden");
  $("procBar").classList.remove("hidden"); $("cancelBtn").classList.remove("hidden"); setBar("procBar", 0);
  $("procText").textContent = "Restoring...";
  try {
    const r = await processPart(part, (p) => { if (part.id === state.partId) { setBar("procBar", p.pct); $("procText").textContent = p.text; } });
    if (!r) { $("procText").textContent = "Stopped. Nothing was changed."; return; }
    if (part.id === state.partId) {
      setMode("rest");
      state.view = "rest"; for (const x of $("viewSeg").children) x.classList.toggle("on", x.dataset.v === "rest");
    }
  } catch (err) { $("procText").innerHTML = `<span class="err">Restoring stopped: ${esc(err.message)}</span>`; return; }
  finally { state.busy = false; $("procBar").classList.add("hidden"); $("cancelBtn").classList.add("hidden"); updateButtons(); }
  renderAll(); draw();
};
$("cancelBtn").onclick = () => worker.postMessage({ type: "cancel" });

// ======================================================================
// Tracks
// ======================================================================
let openTrack = null; // the track whose details are open
function renderTracks() {
  const part = state.part, body = $("trackRows");
  body.innerHTML = "";
  if (!part) return;
  const nums = P.numberRelease(state.project), my = new Map(nums.filter((x) => x.part === part).map((x) => [x.index - 1, x]));
  part.tracks.forEach((t, i) => {
    const tr = document.createElement("tr"), placed = t.start != null, n = my.get(i);
    tr.innerHTML = `<td class="pos" title="${n ? `Track ${n.number} of ${n.trackTotal}${n.discTotal > 1 ? `, disc ${n.disc}` : ""}` : "Not in the export (this part is skipped)"}">${esc(posOf(part, i))}</td><td><input type="text" value="${esc(t.title)}" placeholder="Track ${i + 1}" aria-label="Title of ${posOf(part, i)}"></td>
      <td><input class="t" value="${placed ? fmt(t.start) : ""}" placeholder="${t.durationHint ? "" : "-"}" aria-label="Start" ${state.src ? "" : "disabled"}></td><td><input class="t" value="${placed ? fmt(t.end) : ""}" aria-label="End" ${state.src ? "" : "disabled"}></td>
      <td class="len">${placed ? P.fmtDuration(t.end - t.start) : t.durationHint ? `(${P.fmtDuration(t.durationHint)})` : ""}</td>
      <td class="acts"><button class="small" data-a="play" ${placed && state.src ? "" : "disabled"}>Play</button><button class="small" data-a="more" aria-expanded="${openTrack === i}">More</button><button class="small" data-a="del" ${part.tracks.length > 1 ? "" : "disabled"} title="Join with the track before">Join</button></td>`;
    const [title, st, en] = tr.querySelectorAll("input");
    title.onchange = () => { t.title = title.value.trim(); touch(); renderOverview(); };
    st.onchange = () => { const v = parseTime(st.value); if (isFinite(v) && placed) { t.start = Math.max(0, Math.min(t.end - 1, v)); if (i > 0 && part.tracks[i - 1].start != null) part.tracks[i - 1].end = t.start; } renderTracks(); draw(); touch(); };
    en.onchange = () => { const v = parseTime(en.value); if (isFinite(v) && placed) { t.end = Math.min(duration(), Math.max(t.start + 1, v)); if (i < part.tracks.length - 1 && part.tracks[i + 1].start != null) part.tracks[i + 1].start = t.end; } renderTracks(); draw(); touch(); };
    tr.querySelector('[data-a="play"]').onclick = () => { state.playhead = t.start; player.play(t.start); };
    tr.querySelector('[data-a="more"]').onclick = () => { openTrack = openTrack === i ? null : i; renderTracks(); };
    tr.querySelector('[data-a="del"]').onclick = () => {
      if (i === 0) { const nx = part.tracks[1]; if (t.start != null && nx.start != null) nx.start = t.start; part.tracks.splice(0, 1); }
      else { const pv = part.tracks[i - 1]; if (pv.start != null && t.start != null) pv.end = t.end; part.tracks.splice(i, 1); }
      openTrack = null; renderTracks(); draw(); touch(); renderOverview();
    };
    body.append(tr);
    if (openTrack === i) {
      const more = document.createElement("tr"); more.className = "more";
      const f = (k, label, ph = "") => `<label>${label} <input type="text" data-k="${k}" value="${esc(t[k])}" placeholder="${esc(ph)}"></label>`;
      more.innerHTML = `<td></td><td colspan="5"><div class="moreGrid">${f("artist", "Track artist", state.project.release.artist || "If not the album's")}${f("featuring", "Featuring")}${f("composer", "Composer")}${f("lyricist", "Lyricist")}${f("isrc", "ISRC", "If it has one")}
        <label class="toggle"><input type="checkbox" data-k="explicit" ${t.explicit ? "checked" : ""}> Explicit</label><label class="full">Notes <input type="text" data-k="notes" value="${esc(t.notes)}" placeholder="A skip at 1:12, a repaired crack..."></label></div></td>`;
      for (const el of more.querySelectorAll("[data-k]")) el.onchange = () => { t[el.dataset.k] = el.type === "checkbox" ? el.checked : el.value.trim(); touch(); };
      body.append(more);
    }
  });
  if (!part.tracks.length) body.innerHTML = `<tr><td colspan="6" class="note">${state.src ? "No tracks yet: find them, or say how many there are." : `No tracks yet. You can paste the tracklist now; the splits are placed when ${esc(part.name)} is in.`}</td></tr>`;
  $("songsCount").textContent = part.tracks.length ? `(${part.tracks.length})` : "";
  if (document.activeElement !== $("nTracks")) $("nTracks").value = part.tracks.length || "";
  $("findBtn").disabled = !state.report; $("nBtn").disabled = !$("nTracks").value; $("splitBtn").disabled = !state.report;
}
$("nTracks").oninput = () => { $("nBtn").disabled = !(+$("nTracks").value >= 1); };
// n tracks on a side: keeps the names in order, places the splits in the n-1 best gaps
function placeN(part, n, durations = null) {
  const run = runOf(part.id);
  const old = part.tracks;
  const meta = (t) => { const { start, end, ...rest } = t; return rest; };
  if (!run.gaps) {
    part.tracks = Array.from({ length: n }, (_, i) => ({ ...P.blankTrack(), ...(old[i] ? meta(old[i]) : {}), start: null, end: null }));
    part.needsPlacing = true;
    return null;
  }
  const res = P.chooseSplits(run.gaps, n, durations && durations.length === n ? durations : null);
  part.tracks = res.tracks.map((t, i) => ({ ...P.blankTrack(), ...(old[i] ? meta(old[i]) : {}), start: t.start, end: t.end }));
  part.needsPlacing = false;
  return res;
}
$("nBtn").onclick = () => {
  const part = state.part, n = Math.max(1, Math.min(60, +$("nTracks").value | 0));
  const hints = part.tracks.length === n ? part.tracks.map((t) => t.durationHint) : null;
  const res = placeN(part, n, hints && hints.filter((d) => d > 0).length ? hints : null);
  $("trackNote").textContent = res ? `${n} tracks: ${n - 1 - res.byTiming} split${n - 1 - res.byTiming === 1 ? "" : "s"} in gaps${res.byTiming ? `, ${res.byTiming} by timing alone (no gap found near it: check those on the waveform)` : ""}.` : `${n} tracks. The splits are placed once ${part.name} is in.`;
  renderTracks(); draw(); touch(); renderOverview(); renderPartBar();
};
$("findBtn").onclick = () => {
  if (!state.report) return;
  const part = state.part, old = part.tracks;
  part.tracks = state.report.tracks.tracks.map((t, i) => ({ ...P.blankTrack(), ...(old[i] ? { ...old[i] } : {}), start: t.start, end: t.end }));
  part.needsPlacing = false;
  $("trackNote").textContent = `Found ${part.tracks.length} track${part.tracks.length === 1 ? "" : "s"} by the gaps between them.`;
  renderTracks(); draw(); touch(); renderOverview();
};
$("splitBtn").onclick = () => {
  const t = state.playhead, i = state.tracks.findIndex((x) => x.start != null && t > x.start + 1 && t < x.end - 1);
  if (i < 0) return;
  const cur = state.tracks[i];
  state.tracks.splice(i + 1, 0, { ...P.blankTrack(), start: t, end: cur.end });
  cur.end = t;
  renderTracks(); draw(); touch(); renderOverview();
};
$("pasteBtn").onclick = () => { const box = $("pasteBox"), open = box.classList.toggle("hidden") === false; $("pasteBtn").setAttribute("aria-expanded", open); if (open) $("pasteText").focus(); };
$("pasteCancel").onclick = () => { $("pasteBox").classList.add("hidden"); $("pasteBtn").setAttribute("aria-expanded", "false"); };
$("pasteApply").onclick = () => {
  const parsed = P.parseTracklist($("pasteText").value);
  if (!parsed.length) { $("trackNote").textContent = "No tracks found in that text. One track a line, like: A1 Beer Barrel Polka 2:45"; return; }
  $("trackNote").textContent = applyParsedTracks(parsed);
  $("pasteBox").classList.add("hidden"); $("pasteText").value = "";
  renderAll(); draw();
};
// a parsed tracklist onto the project; returns what happened, in words
function applyParsedTracks(parsed) {
  const res = P.applyTracklist(state.project, parsed, state.partId), said = [];
  for (const [id, n] of Object.entries(res.parts)) {
    const part = state.project.parts.find((p) => p.id === id);
    let how = "";
    if (part.needsPlacing && runOf(id).gaps) {
      const durs = part.tracks.map((t) => t.durationHint), r = placeN(part, part.tracks.length, durs.filter((d) => d > 0).length ? durs : null);
      how = r?.byTiming ? ` (${r.byTiming} split${r.byTiming === 1 ? "" : "s"} by timing alone: check them)` : ", splits placed";
    } else if (part.needsPlacing) how = ", placed once it's in";
    said.push(`${part.name}: ${n}${how}`);
  }
  touch();
  return `Tracklist used. ${said.join("; ")}.` + (res.unmatched.length ? ` ${res.unmatched.length} had positions with no matching part (${res.unmatched.slice(0, 4).map((t) => t.position).join(", ")}): add a part for them.` : "");
}

// ======================================================================
// Side: its name, letter, disc, skip it, its audio, speed and details
// ======================================================================
function renderSideTab() {
  const p = state.part, f = P.formatOf(state.project.format);
  $("sName").value = p.name; $("sLetter").value = p.letter; $("sDisc").value = p.disc || 1; $("sInclude").checked = p.include !== false;
  const a = p.audio, s = runOf(p.id).src;
  $("sAudio").textContent = !a ? "Not in yet: record it or open its file (left)." : a.missing ? `From ${a.name}, which isn't on this device: open it again (left).`
    : `${a.recorded ? `Recorded here from ${a.device || "an input"}` : `From ${a.name}`}: ${fmtTime(a.seconds || 0)}, ${((a.fs || 0) / 1000).toFixed(1)} kHz, ${a.float ? "32-bit float" : a.bits ? a.bits + "-bit" : "decoded"}, ${a.channels === 1 ? "mono" : (a.channels || 2) + " channels"}, ${fmtBytes(a.size || 0)}. ${a.store ? "Kept on this device with the project." : "Not kept on this device (open the file again next time)."}`;
  $("sRecord").textContent = a ? "Record it again" : "Record it";
  $("sOpen").textContent = a ? "Open a different file" : "Open its file";
  $("sRemoveAudio").disabled = !a;
  $("sMatrix").value = p.matrix || ""; $("sNotes").value = p.notes || "";
  $("speedBox").classList.toggle("hidden", !f.disc && !p.rpm);
  const known = ["33", "45", "78", "16"];
  $("sRpm").value = known.includes(p.rpm) ? p.rpm : p.rpm ? "custom" : "33";
  $("sRpmCustomBox").classList.toggle("hidden", $("sRpm").value !== "custom");
  $("sRpmCustom").value = known.includes(p.rpm) ? "" : p.rpm || "";
  $("sPlayed").value = known.includes(p.playedAt) ? p.playedAt : "33";
  renderSideSpeed();
}
function renderSideSpeed() {
  const p = state.part;
  if (!p) return;
  const s = p.settings;
  $("sCents").value = s ? +(s.speed.cents || 0).toFixed(1) : ""; $("sCents").disabled = !s;
  const fix = P.speedFix(p.rpm, p.playedAt);
  $("sSpeedNote").textContent = !p.rpm ? "" : fix.rpm === "none" && !fix.cents ? `Played at its own speed (${P.rpmName(p.rpm)}): no speed change.${s && Math.abs(speedCents(s)) > 0.05 ? ` The fine pitch fix is ${speedCents(s).toFixed(1)} cents (from the tuning, under Fixes).` : ""}`
    : `Cut at ${P.rpmName(p.rpm)}, played at ${P.rpmName(p.playedAt)}: ${fix.rpm !== "none" ? RPM_FIXES.find((r) => r.id === fix.rpm).name.toLowerCase() : `${fix.cents > 0 ? "+" : ""}${fix.cents.toFixed(1)} cents`}, corrected when it's restored.`;
}
// the record's speed and the speed it was played at, into the side's speed fix
function applySpeed(part) {
  const s = part.settings;
  if (!s || !part.rpm) return;
  const fix = P.speedFix(part.rpm, part.playedAt || part.rpm);
  s.speed.rpm = fix.rpm;
  s.speed.cents = +((s.speed.cents || 0) - (part.speedExtra || 0) + fix.cents).toFixed(2);
  part.speedExtra = fix.cents;
  if (fix.rpm !== "none" || fix.cents) s.speed.on = true;
}
$("sName").onchange = () => { state.part.name = $("sName").value.trim() || state.part.name; touch(); renderAll(); renderReleaseTab(); };
$("sLetter").onchange = () => { state.part.letter = $("sLetter").value.trim().toUpperCase(); touch(); renderAll(); draw(); };
$("sDisc").onchange = () => { state.part.disc = Math.max(1, +$("sDisc").value | 0); state.project.discs = Math.max(...state.project.parts.map((p) => p.disc || 1)); touch(); renderAll(); };
$("sInclude").onchange = () => { state.part.include = $("sInclude").checked; touch(); renderAll(); };
$("sMatrix").onchange = () => { state.part.matrix = $("sMatrix").value.trim(); touch(); };
$("sNotes").onchange = () => { state.part.notes = $("sNotes").value.trim(); touch(); };
const speedChanged = () => {
  const p = state.part, v = $("sRpm").value;
  $("sRpmCustomBox").classList.toggle("hidden", v !== "custom");
  p.rpm = v === "custom" ? String(+$("sRpmCustom").value || "") : v;
  p.playedAt = $("sPlayed").value;
  if (p.rpm) applySpeed(p);
  settingsChanged(); renderModules();
};
$("sRpm").onchange = speedChanged; $("sRpmCustom").onchange = speedChanged; $("sPlayed").onchange = speedChanged;
$("sCents").onchange = () => { const s = state.settings, v = parseFloat($("sCents").value); if (!s || !isFinite(v)) return; s.speed.cents = v; s.speed.on = true; settingsChanged(); renderModules(); };
$("sRecord").onclick = () => { state.capturing = true; setCapMode("rec"); showPanels(); };
$("sOpen").onclick = () => $("capFileIn").click();
twoStep($("sRemoveAudio"), "Really remove it?", async () => {
  const p = state.part;
  if (p.audio?.store) await S.removeAudio(p.audio.store);
  S.deleteReport(`${state.project.id}:${p.id}`);
  p.audio = null; p.settings = null; p.restored = null;
  if (p.tracks.some((t) => t.start != null)) p.needsPlacing = true;
  runs.delete(p.id);
  touch(); renderAll(); draw();
});

// ======================================================================
// Release: the details, credits, pictures, transfer; and pasted release info
// ======================================================================
const imgUrls = new Map();
const urlFor = (im) => { if (!imgUrls.has(im.id)) imgUrls.set(im.id, URL.createObjectURL(im.blob)); return imgUrls.get(im.id); };
let imgTarget = null;
function renderReleaseTab() {
  renderRelease($("releaseForm"), state.project, {
    onChange: (what) => { touch(); renderHeader(); renderOverview(); renderExportPreview(); if (what === "transfer") store.set("lastTransfer", JSON.stringify(state.project.transfer)); },
    onImage, urlFor,
  });
}
function onImage(req) {
  const p = state.project;
  if (req.remove) { p.images = p.images.filter((im) => im.id !== req.remove); touch(); redrawImages(); return; }
  if (req.file) return addImage(req, req.file);
  imgTarget = req; $("imgFile").click();
}
$("imgFile").onchange = () => { const f = $("imgFile").files[0]; $("imgFile").value = ""; if (f && imgTarget) addImage(imgTarget, f); };
async function addImage(req, file) {
  if (!/^image\//.test(file.type) && !/\.(jpe?g|png|webp|gif|tiff?|bmp)$/i.test(file.name)) return;
  const p = state.project, single = req.kind !== "insert" && req.kind !== "other";
  const im = { id: uid() + uid(), kind: req.kind, part: req.part || null, name: file.name, mime: file.type || "image/jpeg", blob: file.slice(0, file.size, file.type) };
  if (req.replace) p.images = p.images.filter((x) => x.id !== req.replace);
  else if (single) p.images = p.images.filter((x) => !(x.kind === req.kind && (x.part || null) === (req.part || null)));
  p.images.push(im);
  touch(); redrawImages(); renderOverview();
}
const redrawImages = () => { const g = $("imgGrid"); if (g) renderImages(g, state.project, { onImage, urlFor }); renderExportPreview(); };
$("relPasteBtn").onclick = () => { const box = $("relPasteBox"), open = box.classList.toggle("hidden") === false; $("relPasteBtn").setAttribute("aria-expanded", open); if (open) $("relPasteText").focus(); };
$("relPasteCancel").onclick = () => { $("relPasteBox").classList.add("hidden"); $("relPasteBtn").setAttribute("aria-expanded", "false"); };
$("relPasteApply").onclick = () => {
  const p = state.project, got = P.parseReleaseInfo($("relPasteText").value), said = [];
  const fields = Object.entries(got.release).filter(([, v]) => v);
  for (const [k, v] of fields) p.release[k] = v;
  if (got.release.genre || got.release.style) { const g = P.matchGenre(got.release, GENRES); if (g) p.release.genre = g; }
  if (fields.length) said.push(`${fields.length} field${fields.length === 1 ? "" : "s"}`);
  const newCredits = got.credits.filter((c) => !p.credits.some((x) => x.name === c.name && x.role === c.role));
  p.credits.push(...newCredits);
  if (newCredits.length) said.push(`${newCredits.length} credit${newCredits.length === 1 ? "" : "s"}`);
  const mx = Object.entries(got.matrix).filter(([letter]) => p.parts.some((x) => x.letter === letter));
  for (const [letter, v] of mx) p.parts.find((x) => x.letter === letter).matrix = v;
  if (mx.length) said.push(`matrix for ${mx.map(([l]) => l).join(", ")}`);
  let trackText = "";
  if (got.tracks.length) trackText = " " + applyParsedTracks(got.tracks);
  $("relPasteNote").textContent = said.length || got.tracks.length ? `Filled in ${said.join(", ") || "nothing else"}.${trackText}` : "Nothing recognizable in that text. It reads lines like \"Label: Columbia – CL 1234\" and \"Released: 1958\".";
  $("relPasteBox").classList.add("hidden"); $("relPasteText").value = "";
  touch(); renderReleaseTab(); renderAll();
};
for (const a of document.querySelectorAll("nav.jump a")) a.onclick = (e) => { e.preventDefault(); document.querySelector(a.getAttribute("href"))?.scrollIntoView({ block: "start", behavior: "smooth" }); };

// ======================================================================
// Overview: every part, and what's left
// ======================================================================
const exportSig = (p) => keyOf(p.settings) + JSON.stringify(p.tracks) + JSON.stringify([p.name, p.letter, p.disc, p.matrix, p.notes, p.include]) +
  JSON.stringify([state.project.release, state.project.credits, state.project.transfer, state.project.export, state.project.images.map((i) => i.id)]);
const progressInfo = (id) => { const p = state.project.parts.find((x) => x.id === id); return { restoredFresh: freshFor(p), exportedFresh: !!p.exported && p.exported.sig === exportSig(p) }; };
function renderOverview() {
  if (!state.project) return;
  const g = P.releaseProgress(state.project, progressInfo), yes = (v, t = "Yes") => `<td class="${v ? "y" : "n"}">${v ? t : "No"}</td>`;
  $("ovRows").innerHTML = g.rows.map((r) => {
    const p = r.part, a = p.audio;
    const audioTxt = !a ? "Not yet" : r.missing ? "Open again" : `${a.recorded ? "Recorded" : "File"}, ${fmtTime(a.seconds || 0)}`;
    return `<tr class="${r.include ? "" : "skip"}"><td><button class="small" data-sel="${p.id}" title="Work on ${esc(p.name)}">${esc(p.name)}</button>${p.disc > 1 || state.project.discs > 1 ? ` <span class="note">disc ${p.disc}</span>` : ""}</td>
      <td class="${r.audio ? "y" : "n"}" data-l="Audio">${esc(audioTxt)}</td><td data-l="Tracks">${r.tracks}${r.placed < r.tracks ? ` (${r.tracks - r.placed} to place)` : ""}</td><td data-l="Named">${r.named} of ${r.tracks}</td>
      ${yes(r.restored).replace("<td", '<td data-l="Restored"')}<td data-l="In the export"><label class="toggle"><input type="checkbox" data-inc="${p.id}" ${r.include ? "checked" : ""}> ${r.include ? (r.exported ? "Exported" : "Yes") : "Skipped"}</label></td>
      <td class="acts"><button class="small danger" data-rm="${p.id}" ${state.project.parts.length > 1 ? "" : "disabled"}>Remove</button></td></tr>`;
  }).join("");
  for (const b of $("ovRows").querySelectorAll("[data-sel]")) b.onclick = () => { selectPart(b.dataset.sel); showTab("side"); };
  for (const c of $("ovRows").querySelectorAll("[data-inc]")) c.onchange = () => { state.project.parts.find((p) => p.id === c.dataset.inc).include = c.checked; touch(); renderAll(); };
  for (const b of $("ovRows").querySelectorAll("[data-rm]")) twoStep(b, "Really?", async () => {
    const p = state.project.parts.find((x) => x.id === b.dataset.rm);
    if (p.audio?.store) await S.removeAudio(p.audio.store);
    S.deleteReport(`${state.project.id}:${p.id}`);
    state.project.parts = state.project.parts.filter((x) => x !== p);
    state.project.images = state.project.images.filter((im) => im.part !== p.id);
    runs.delete(p.id);
    touch();
    if (state.partId === p.id) await selectPart(state.project.parts[0].id); else renderAll();
    renderReleaseTab();
  });
  $("ovLeft").className = g.left.length ? "left" : "left done";
  $("ovLeft").innerHTML = g.left.length ? g.left.map((t) => `<li>${esc(t)}</li>`).join("") : "<li>Nothing left. Every part is in, named, restored and exported.</li>";
  const inc = g.rows.filter((r) => r.include), tracks = inc.reduce((a, r) => a + r.tracks, 0);
  $("ovSummary").textContent = `${P.formatOf(state.project.format).name}: ${inc.filter((r) => r.audio).length} of ${inc.length} part${inc.length === 1 ? "" : "s"} in, ${tracks} track${tracks === 1 ? "" : "s"}, ${g.done} of ${g.of} steps done.`;
  $("ovCount").textContent = g.left.length ? `(${g.left.length})` : "";
}
$("addPart").onclick = () => addPartNow();
$("saveProject").onclick = async () => {
  const p = state.project;
  const images = await Promise.all(p.images.map(async (im) => ({ ...im, bytes: await S.blobToBytes(im.blob) })));
  download(new Blob([P.toProjectFile(p, images)], { type: "application/json" }), `${P.releaseFolder(p.release)}.restore.json`);
};
twoStep($("deleteProject"), "Really delete it all?", async () => {
  await S.deleteProject(state.project);
  state.project = null; runs.clear();
  showWork(false); renderProjects();
});

// ======================================================================
// Export: every track, tagged, plus the raw transfers, pictures and catalog
// ======================================================================
function renderExportTab() {
  const ex = state.project.export;
  $("exFormats").innerHTML = P.EXPORT_FORMATS.map((f) => `<label><input type="checkbox" data-f="${f.id}" ${ex.formats.includes(f.id) ? "checked" : ""}><div><b>${esc(f.name)}</b><span>${esc(f.sub)}</span></div></label>`).join("");
  for (const c of $("exFormats").querySelectorAll("input")) c.onchange = () => {
    const on = [...$("exFormats").querySelectorAll("input:checked")].map((x) => x.dataset.f);
    if (!on.length) { c.checked = true; return; }
    ex.formats = P.EXPORT_FORMATS.map((f) => f.id).filter((id) => on.includes(id)); touch(); renderExportPreview(); renderOverview();
  };
  aacSupport.then((ok) => {
    const m4a = $("exFormats").querySelector('[data-f="m4a"]');
    if (ok || !m4a) return;
    m4a.disabled = true; m4a.checked = false; m4a.closest("label").title = "This browser can't encode AAC";
    m4a.closest("label").querySelector("span").textContent = "This browser can't write AAC (Chrome, Edge and Safari can)";
    renderExportPreview(); // the saved choice stays (another browser may write AAC); this one just leaves it out
  });
  $("exNum").checked = !ex.usePosition; $("exPos").checked = !!ex.usePosition;
  $("exRestart").checked = !!ex.restartEachDisc; $("exDiscFolders").checked = !!ex.discFolders;
  $("exRaw").checked = ex.raw !== false; $("exCatalog").checked = ex.catalog !== false; $("exArtwork").checked = ex.artwork !== false; $("exEmbedAll").checked = !!ex.embedAll;
  $("exScopeAll").checked = ex.scope !== "side"; $("exScopeSide").checked = ex.scope === "side";
  renderExportScope();
}
const exBind = (id, key, val = (el) => el.checked) => { $(id).onchange = () => { state.project.export[key] = val($(id)); touch(); renderExportPreview(); renderOverview(); renderTracks(); }; };
exBind("exNum", "usePosition", () => false); exBind("exPos", "usePosition", () => true);
exBind("exRestart", "restartEachDisc"); exBind("exDiscFolders", "discFolders"); exBind("exRaw", "raw"); exBind("exCatalog", "catalog"); exBind("exArtwork", "artwork"); exBind("exEmbedAll", "embedAll");
exBind("exScopeAll", "scope", () => "release"); exBind("exScopeSide", "scope", () => "side");
function renderExportScope() {
  if (!state.project) return;
  const multi = new Set(state.project.parts.filter((p) => p.include !== false).map((p) => p.disc || 1)).size > 1;
  $("exRestartBox").classList.toggle("hidden", !multi); $("exDiscFoldersBox").classList.toggle("hidden", !multi);
  $("exSideName").textContent = state.part?.name ?? "this side";
  $("exportBtn").textContent = state.project.export.scope === "side" ? `Export ${state.part?.name ?? "this side"}` : "Export the release";
  renderExportPreview();
}
// The zip's layout, from the project as it stands
function exportPlan() {
  const p = state.project, ex = p.export, root = P.releaseFolder(p.release);
  const only = ex.scope === "side" ? [state.partId] : null;
  const items = P.numberRelease(p, { only });
  const multiDisc = items.length && items[0].discTotal > 1, discFolders = multiDisc && ex.discFolders;
  const fmts = ex.formats.filter((f) => f !== "m4a" || aacOk !== false);
  const tracks = [];
  for (const it of items) for (const f of fmts) {
    const ef = P.EXPORT_FORMATS.find((x) => x.id === f);
    tracks.push({ item: it, fmt: f, path: [root, fmts.length > 1 ? ef.folder : null, discFolders ? `Disc ${it.disc}` : null, P.trackFileName(it, p, ef.ext, { discFolders })].filter(Boolean).join("/") });
  }
  const paths = P.uniquePaths(tracks.map((t) => t.path));
  tracks.forEach((t, i) => { t.path = paths[i]; });
  const parts = [...new Set(items.map((it) => it.part))];
  const raw = ex.raw ? parts.map((pt) => ({ part: pt, path: `${root}/Raw transfers/${P.cleanName(pt.name)} (raw transfer)${extOf(runOf(pt.id).file?.name || pt.audio?.name || ".wav")}` })) : [];
  const art = ex.artwork ? p.images.filter((im) => !only || !im.part || only.includes(im.part)).map((im) => ({ image: im, path: `${root}/Artwork/${P.cleanName(P.imageName(p, im))}${imgExt(im)}` })) : [];
  return { root, items, tracks, raw, art, parts, catalog: ex.catalog ? [`${root}/catalog.json`, `${root}/catalog.csv`] : [] };
}
const extOf = (n) => (/\.[a-z0-9]{2,5}$/i.exec(n)?.[0].toLowerCase() ?? ".wav");
const imgExt = (im) => ({ "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif", "image/tiff": ".tif", "image/bmp": ".bmp" }[im.mime] ?? extOf(im.name || ".jpg"));
function renderExportPreview() {
  if (!state.project) return;
  const plan = exportPlan(), all = [...plan.tracks.map((t) => t.path), ...plan.raw.map((r) => r.path), ...plan.art.map((a) => a.path), ...plan.catalog];
  const show = all.slice(0, 14);
  $("exPreview").innerHTML = show.map((x) => `<li title="${esc(x)}">${esc(x)}</li>`).join("") + (all.length > show.length ? `<li>... and ${all.length - show.length} more</li>` : "") || "<li>Nothing to export yet.</li>";
  $("exPreviewBox").querySelector("summary").textContent = `What's in the zip (${all.length} file${all.length === 1 ? "" : "s"})`;
}
function exStatus(text, pct = null) { $("exportText").textContent = text; $("exBar").classList.toggle("hidden", pct == null); if (pct != null) setBar("exBar", pct); }
$("exportCancel").onclick = () => { state.cancelExport = true; worker.postMessage({ type: "cancel" }); exStatus("Stopping..."); };
$("exportBtn").onclick = () => exportRelease();
async function exportRelease() {
  if (state.busy) return;
  const p = state.project;
  let plan = exportPlan();
  if (!plan.items.length) { exStatus("Nothing to export: no tracks in the parts being exported."); return; }
  const missing = plan.parts.filter((pt) => !pt.audio || pt.audio.missing);
  if (missing.length) { exStatus(`${missing.map((x) => x.name).join(", ")} ${missing.length === 1 ? "isn't" : "aren't"} in yet. Record or open ${missing.length === 1 ? "it" : "them"}, or skip ${missing.length === 1 ? "it" : "them"} under Overview.`); return; }
  player.stop();
  state.busy = true; state.cancelExport = false; updateButtons();
  $("exportCancel").classList.remove("hidden");
  const t0 = Date.now();
  try {
    // every part open, listened to, its tracks placed, and restored with its current settings
    for (const [k, pt] of plan.parts.entries()) {
      exStatus(`Getting ${pt.name} ready (${k + 1} of ${plan.parts.length})...`, 0);
      if (!(await ensureLoaded(pt))) throw new Error(`${pt.name}'s audio can't be opened.`);
      if (!runOf(pt.id).report) await analysePart(pt);
      if (!pt.settings) throw new Error(`${pt.name} couldn't be listened to.`);
      if (pt.needsPlacing || pt.tracks.some((t) => t.start == null)) placeN(pt, pt.tracks.length, pt.tracks.map((t) => t.durationHint));
      if (!freshFor(pt)) {
        const r = await processPart(pt, (m) => exStatus(`Restoring ${pt.name} (${k + 1} of ${plan.parts.length})... ${m.text.replace(/^Restoring\.\.\.\s*/, "")}`, m.pct));
        if (!r) throw new Error("cancelled");
      }
      if (state.cancelExport) throw new Error("cancelled");
    }
    plan = exportPlan(); // the splits may have moved
    // one level for the whole release, so sides keep their loudness relative to each other; never clipped
    const peak = Math.max(...plan.parts.map((pt) => runOf(pt.id).restored.peakDb)), gain = peak > -0.1 ? Math.pow(10, (-0.1 - peak) / 20) : 1;
    const entries = [], files = {};
    const embedCache = new Map(), done = { n: 0 }, skipped = new Map();
    const byItem = new Map();
    for (const t of plan.tracks) { const k = P.trackKey(t.item); if (!byItem.has(k)) byItem.set(k, []); byItem.get(k).push(t); }
    for (const [k, list] of byItem) {
      if (state.cancelExport) throw new Error("cancelled");
      const it = list[0].item, pt = it.part, R = runOf(pt.id).restored, s = pt.settings;
      const tags = P.tagsFor(p, it);
      tags.pictures = [];
      for (const pic of P.picturesFor(p, it, p.export.embedAll)) {
        if (!embedCache.has(pic.image.id)) embedCache.set(pic.image.id, await embeddable(pic.image));
        const e = embedCache.get(pic.image.id);
        if (e) tags.pictures.push({ type: pic.type, mime: e.mime, desc: pic.desc, bytes: e.bytes });
      }
      const mono = s.channels.on && s.channels.mode !== "stereo";
      exStatus(`Writing ${it.position} ${it.track.title || ""} (${done.n + 1} of ${byItem.size})...`, 100 * done.n / byItem.size);
      const res = await srpc({ type: "encode", restored: { blob: R.blob, fs: R.fs, frames: R.frames }, start: toRestoredTime(it.track.start, R.cents), end: toRestoredTime(it.track.end, R.cents), gain, mono, formats: list.map((x) => x.fmt), tags },
        (m) => exStatus(`Writing ${it.position} ${it.track.title || ""} (${done.n + 1} of ${byItem.size})...`, 100 * (done.n + m.pct / 100) / byItem.size));
      files[k] = {};
      for (const f of res.files) {
        if (f.error) { skipped.set(f.fmt, f.error); continue; }
        const t = list.find((x) => x.fmt === f.fmt); entries.push({ name: t.path, blob: f.blob }); files[k][f.fmt] = t.path.slice(plan.root.length + 1);
      }
      done.n++;
    }
    const raw = {};
    for (const r of plan.raw) { entries.push({ name: r.path, blob: runOf(r.part.id).file }); raw[r.part.id] = r.path.slice(plan.root.length + 1); }
    for (const a of plan.art) entries.push({ name: a.path, blob: a.image.blob });
    if (plan.catalog.length) {
      const artwork = plan.art.map((a) => ({ kind: a.image.kind, side: a.image.part ? p.parts.find((x) => x.id === a.image.part)?.name : null, file: a.path.slice(plan.root.length + 1) }));
      entries.push({ name: plan.catalog[0], blob: new Blob([P.catalogJSON(p, plan.items, files, { raw, artwork })], { type: "application/json" }) });
      entries.push({ name: plan.catalog[1], blob: new Blob([P.catalogCSV(p, plan.items, files)], { type: "text/csv" }) });
    }
    exStatus("Packing the zip...", 0);
    const z = await srpc({ type: "zip", entries }, (m) => exStatus("Packing the zip...", m.pct));
    const name = `${plan.root}${p.export.scope === "side" ? ` - ${P.cleanName(state.part.name)}` : ""}.zip`;
    download(z.zip, name);
    window.encoreRestore.lastZip = z.zip;
    window.encoreRestore.lastExport = { name, skipped: [...skipped], size: z.zip.size, files: entries.map((e) => e.name), seconds: (Date.now() - t0) / 1000, gainDb: 20 * Math.log10(gain) };
    for (const pt of plan.parts) pt.exported = { at: new Date().toISOString(), sig: exportSig(pt) };
    touch();
    exStatus(`Saved ${name}: ${plan.items.length} track${plan.items.length === 1 ? "" : "s"}, ${entries.length} files, ${fmtBytes(z.zip.size)}, in ${fmtTime((Date.now() - t0) / 1000)}.${gain < 0.999 ? ` Turned down ${(-20 * Math.log10(gain)).toFixed(1)} dB so nothing clips.` : ""}` +
      [...skipped].map(([f, why]) => ` ${P.EXPORT_FORMATS.find((x) => x.id === f).name} left out: ${why}`).join(""));
  } catch (err) {
    exStatus(err.message === "cancelled" ? "Stopped. Nothing was saved." : `The export stopped: ${err.message}`);
    if (err.message !== "cancelled") console.error(err);
  } finally {
    state.busy = false; $("exportCancel").classList.add("hidden"); updateButtons(); renderAll(); draw();
  }
}
// a picture fit to go inside every file: JPEG or PNG under 2.5 MB as it is, else a 1600 px JPEG
async function embeddable(im) {
  if ((im.mime === "image/jpeg" || im.mime === "image/png") && im.blob.size <= 2.5e6) return { mime: im.mime, bytes: await S.blobToBytes(im.blob) };
  try {
    const bmp = await createImageBitmap(im.blob), k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    const b = await new Promise((res) => c.toBlob(res, "image/jpeg", 0.9));
    return { mime: "image/jpeg", bytes: await S.blobToBytes(b) };
  } catch { return null; }
}

function download(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name.replace(/[\\/:*?"<>|]+/g, "");
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 120000);
}
function updateButtons() {
  const part = state.part;
  $("processBtn").disabled = state.busy || !part?.settings || !state.src;
  $("exportBtn").disabled = state.busy;
  $("copyBtn").disabled = $("copyFrom").disabled || state.busy;
}
function setBar(id, pct) { $(id).firstElementChild.style.width = `${Math.max(0, Math.min(100, pct))}%`; }

// ======================================================================
// Tabs: Overview | Side | Fixes | What it heard | Tracks | Release | Export
// ======================================================================
const tabs = [...document.querySelectorAll('.tabBar [role="tab"]')];
function showTab(name, focus = false) {
  if (!tabs.some((t) => t.dataset.tab === name)) name = "fixes";
  for (const t of tabs) {
    const on = t.dataset.tab === name;
    t.setAttribute("aria-selected", on); t.tabIndex = on ? 0 : -1;
    $(t.getAttribute("aria-controls")).hidden = !on;
    if (on && focus) t.focus();
    if (on) t.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
  document.querySelector(".tabBody").scrollTop = 0;
  store.set("tab", name);
}
for (const t of tabs) {
  t.onclick = () => showTab(t.dataset.tab);
  t.onkeydown = (e) => {
    const i = tabs.indexOf(t), go = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (go == null) return;
    e.preventDefault();
    showTab(tabs[(go + tabs.length) % tabs.length].dataset.tab, true);
  };
}
showTab(store.get("tab", "fixes"));

// ---------- go ----------
renderStart(); renderProjects(); checkInterrupted();
// for the automated browser check (and the curious): the current state
window.encoreRestore = { state, runs, keyOf, P, S, exportPlan, exportSig, embeddable, openProject, selectPart, showTab };
