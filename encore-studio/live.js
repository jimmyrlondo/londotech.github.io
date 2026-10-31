// Encore Live: record (or drop) a whole set, find the songs, trim the talking,
// master every track with shared settings, tag it, and hand it to Encore.
import { STYLES, TARGETS } from "./master-core.js";
import { openSource, describeSource as describeAny, inspectChannels, routingForSetup } from "./live-source.js";
import { LiveRecorder, listInputs, buildGainTrack, savedRecordings, openSaved, updateSaved, deleteRecording } from "./live-recorder.js";
import { fillGenreSelect } from "./genres.js";
import { wavFile, id3 } from "./tags.js";
import { zip } from "./zip.js";

const $ = (id) => document.getElementById(id);
const COLORS = ["#ff3b00", "#22d3ee", "#e8b04b", "#7bd3a4", "#c084fc", "#f472b6", "#60a5fa", "#a3e635", "#fb923c", "#2dd4bf"];
const GAP_NAMES = { talk: "talking", applause: "applause", quiet: "quiet", noodling: "tuning / noodling", music: "music" };
const store = { get: (k) => { try { return localStorage.getItem("encore-live-" + k); } catch { return null; } },
                set: (k, v) => { try { localStorage.setItem("encore-live-" + k, v); } catch { /* private mode */ } } };

const state = {
  src: null, fileName: "", recordingName: null, analysis: null, overview: null, markers: [],
  songs: [], keepGap: new Set(), open: new Set(), levelerDb: null, leveler: false, inputDb: 0,
  style: 0, intensity: 0.5, target: 1, eq: { low: 0, mid: 0, high: 0 }, rumble: true, harsh: false,
  even: 0.5, mastered: false, art: null, prepared: null, outputs: null,
};
let nextSongId = 1;

// ---------- formatting ----------
const fmt = (s, tenths = false) => {
  s = Math.max(0, s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const ss = tenths ? sec.toFixed(1).padStart(4, "0") : String(Math.floor(sec)).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
};
const chName = (c) => state.chNames?.[c] ?? `Input ${c + 1}`;
const pad2 = (n) => String(n).padStart(2, "0");
const clean = (s) => String(s ?? "").replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").trim();
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// ---------- background worker (analysis + mastering) ----------
const worker = new Worker("live-worker.js", { type: "module" });
const pending = new Map();
let rid = 0;
worker.onmessage = (e) => {
  const d = e.data, p = pending.get(d.id);
  if (!p) return;
  if (d.type === "progress") { p.onProgress?.(d); return; }
  pending.delete(d.id);
  if (d.type === "error") p.reject(new Error(d.message)); else p.resolve(d);
};
const rpc = (msg, onProgress) => new Promise((resolve, reject) => { const id = ++rid; pending.set(id, { resolve, reject, onProgress }); worker.postMessage({ ...msg, id }); });
const ready = (async () => {
  const wasm = await (await fetch("master.wasm")).arrayBuffer();
  await new Promise((res) => { pending.set(0, { resolve: res }); worker.postMessage({ type: "init", wasm, id: 0 }, [wasm]); });
})();
// the worker answers init with { type: "ready" } and no id; route it
worker.addEventListener("message", (e) => { if (e.data.type === "ready") { pending.get(0)?.resolve(); pending.delete(0); } });

// What the worker needs to read the set. A decoded MP3/M4A set is copied to
// the worker once; after that it's referred to, not copied again.
let bufferSentFor = null;
function describeSource(src) {
  if (src.buffer && bufferSentFor === src) return { kind: "bufferRef", gainTrack: src.gainTrack, routing: src.routing };
  if (src.buffer) bufferSentFor = src;
  return describeAny(src);
}

let ctx = null;
const audio = () => (ctx ??= new AudioContext());

// =====================================================================
// Start screen
// =====================================================================
async function refreshInputs(askPermission) {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  const list = await listInputs({ askPermission });
  const sel = $("inputSel"), keep = sel.value || store.get("input") || "";
  sel.innerHTML = "";
  const named = list.some((d) => !/^Input \d+$/.test(d.label));
  if (!named) sel.append(new Option("Default input", ""));
  for (const d of list) if (named) sel.append(new Option(d.label + (d.bluetooth ? " (Bluetooth: phone-call quality)" : ""), d.id));
  if ([...sel.options].some((o) => o.value === keep)) sel.value = keep;
  state.inputsNamed = named;
}
navigator.mediaDevices?.addEventListener?.("devicechange", () => { if (recorder.state !== "recording") refreshInputs(false); });

async function refreshSaved() {
  const list = await savedRecordings();
  $("recovery").classList.toggle("hidden", !list.length);
  const box = $("recoveryList"); box.innerHTML = "";
  const any = list.some((x) => x.state === "recording");
  $("recovery").querySelector(".label").firstChild.textContent = any ? "Recordings on this device (one didn't finish) " : "Recordings on this device ";
  for (const info of list) {
    const row = document.createElement("div"); row.className = "item";
    const when = info.name.replace(/^live-/, "").replace(/T(\d\d)-(\d\d)-(\d\d)/, " $1:$2");
    row.innerHTML = `<b>${esc(when)}</b><span class="mono">${fmt(info.seconds || 0)}</span><span class="note">${(info.bytes / 1e9).toFixed(2)} GB</span>${info.state === "recording" ? '<span class="badge check">unfinished</span>' : ""}`;
    const open = document.createElement("button"); open.className = "small"; open.textContent = info.state === "recording" ? "Recover" : "Open";
    open.onclick = async () => { const rec = await openSaved(info); loadSet(rec.file, { recording: rec }); };
    const del = document.createElement("button"); del.className = "small"; del.textContent = "Delete";
    del.onclick = async () => { if (confirm("Delete this recording from this device? This can't be undone.")) { await deleteRecording(info.name); refreshSaved(); } };
    row.append(open, del); box.append(row);
  }
}

const drop = $("drop");
drop.addEventListener("click", () => $("file").click());
drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("file").click(); } });
drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); const f = e.dataTransfer.files[0]; if (f) loadSet(f); });
$("file").addEventListener("change", () => { const f = $("file").files[0]; if (f) loadSet(f); $("file").value = ""; });

// =====================================================================
// Soundcheck, then recording
// "Let's go" opens the input and shows levels; nothing is saved until Record.
// =====================================================================
const recorder = new LiveRecorder();
let clipHold = [], heard = [], openedAt = 0;
const warn = (m) => { $("recWarn").innerHTML = `<span class="warn">${esc(m)}</span>`; };

async function openInput() {
  $("recGo").disabled = true; $("recWarn").textContent = "";
  try {
    const ids = [$("inputSel").value || undefined, ...moreChecked()];
    const info = await recorder.open({ deviceIds: ids, safeMode: $("safeMode").checked,
      onLevels: showLevels, onWarn: warn, onLost: (rec) => (rec ? loadRecorded(rec) : resetRecUi()) });
    if (!state.inputsNamed) { await refreshInputs(false); fillMore(); } // names show up once the mic is allowed
    store.set("input", $("inputSel").value);
    buildMeters(info.channels, info.channelNames); buildMeterLabels(); openedAt = performance.now(); buildMonitor();
    const est = await navigator.storage?.estimate?.().catch(() => null);
    const perHour = info.fs * info.channels * 4 * 3600;
    state.roomText = est ? `Room on this device for about ${Math.max(0, (est.quota - est.usage) / perHour).toFixed(1)} hours.` : "";
    const chText = info.channels === 1 ? "1 input" : `${info.channels} inputs`;
    $("inputInfo").textContent = `${chText} at ${(info.fs / 1000).toFixed(1)} kHz. Every input gets recorded; you choose how they combine afterwards (Encore suggests a setup). ${state.roomText}`;
    $("recInfo").innerHTML = `${esc(info.device || "Input")}<br>Soundcheck, not recording`;
    $("recGo").disabled = false;
    return true;
  } catch (err) {
    warn(`Couldn't open that input: ${err.message || err.name}. ${err.name === "NotAllowedError" ? "Allow the microphone for this page (the icon in the address bar) and try again." : "Try another input."}`);
    return false;
  }
}
function resetRecUi() {
  $("recTime").textContent = "0:00:00"; $("recTime").classList.remove("live");
  $("recGo").classList.remove("hidden"); $("recStop").classList.add("hidden"); $("recMark").classList.add("hidden");
  $("scBanner").classList.remove("rec");
  $("scBanner").textContent = "Soundcheck. Nothing is being recorded yet: set your levels, fill in the show, then hit Record.";
  $("inputSel").disabled = false; $("moreInputs").querySelectorAll("input").forEach((x) => { x.disabled = false; }); $("safeMode").disabled = false; $("scBack").classList.remove("hidden");
  $("markCount").textContent = ""; $("levNow").textContent = "";
}
$("recStart").addEventListener("click", async () => {
  state.inputDb = 0; $("inVol").value = 0; $("inVolVal").textContent = "0.0 dB";
  for (const el of document.querySelectorAll("[data-mirror]")) el.value = $(el.dataset.mirror).value; // carry over anything already typed
  resetRecUi(); show("rec"); fillMore(); paintScSetup();
  await openInput();
});
$("inputSel").addEventListener("change", () => { fillMore(); openInput(); });
// "Also record": any number of extra devices recorded side by side. Some
// interfaces show up as several devices (pairs of inputs, e.g. "Analogue 1+2"
// and "Analogue 3+4" of the same box), and you might add a separate USB mic or
// a board's USB out. Devices from the same interface are listed first.
const moreChecked = () => [...$("moreInputs").querySelectorAll("input:checked")].map((x) => x.value);
function fillMore() {
  const keep = new Set(moreChecked()), main = $("inputSel").value, box = $("moreInputs");
  const fam = ($("inputSel").selectedOptions[0]?.text ?? "").match(/\(([^)]+)\)\s*$/)?.[1];
  const opts = [...$("inputSel").options].filter((o) => o.value && o.value !== main)
    .map((o) => ({ id: o.value, text: o.text, same: !!fam && o.text.endsWith(`(${fam})`) }))
    .sort((a, b) => b.same - a.same);
  box.innerHTML = "";
  for (const o of opts) {
    const l = document.createElement("label");
    l.innerHTML = `<input type="checkbox" value="${esc(o.id)}" ${keep.has(o.id) ? "checked" : ""}> ${esc(o.text)} ${o.same ? "<small>same interface</small>" : ""}`;
    l.querySelector("input").addEventListener("change", openInput);
    box.append(l);
  }
  $("moreWrap").classList.toggle("hidden", !opts.length || !state.inputsNamed);
}
// The setup can be chosen now (Auto decides after the show); it's saved with the recording
state.recSetup = store.get("setup") || "auto";
function paintScSetup() {
  [...$("scSetup").children].forEach((b) => b.classList.toggle("on", b.dataset.setup === state.recSetup));
  buildMeterLabels();
}
$("scSetup").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-setup]"); if (!b || recorder.state === "recording") return;
  state.recSetup = b.dataset.setup; store.set("setup", state.recSetup); paintScSetup(); updateMonitor(true);
});
// stereo / board setups: show which inputs are left and right
function buildMeterLabels() {
  const rows = $("meters").children, n = rows.length, s = state.recSetup;
  for (let c = 0; c < n; c++) {
    const base = recorder.channelNames?.[c] ?? `Input ${c + 1}`;
    const lr = (s === "stereo" || s === "boardRoom") && n >= 2 ? (c % 2 ? " R" : " L") : "";
    rows[c].firstElementChild.textContent = base + lr;
  }
}
$("safeMode").addEventListener("change", openInput);
$("scBack").addEventListener("click", async () => { await recorder.close(); show("start"); refreshSaved(); });
// show details typed during soundcheck land in the editor's fields
for (const el of document.querySelectorAll("[data-mirror]")) el.addEventListener("input", () => { $(el.dataset.mirror).value = el.value; $(el.dataset.mirror).dispatchEvent(new Event("input")); });

$("recGo").addEventListener("click", async () => {
  $("recGo").disabled = true;
  try {
    const info = await recorder.record();
    $("recTime").classList.add("live");
    $("recGo").classList.add("hidden"); $("recStop").classList.remove("hidden"); $("recMark").classList.remove("hidden");
    $("scBanner").classList.add("rec");
    $("scBanner").textContent = `Recording. Saving to ${info.storage === "disk" ? "this device as it goes, so a closed tab or dead battery won't lose it" : "memory: keep this tab open"}. Press M or Mark song between songs if you like.`;
    $("inputSel").disabled = true; $("moreInputs").querySelectorAll("input").forEach((x) => { x.disabled = true; }); $("safeMode").disabled = true; $("scBack").classList.add("hidden");
    $("recInfo").innerHTML = `${esc(recorder.deviceLabel || "Input")}<br>${recorder.channels} ch · ${(recorder.fs / 1000).toFixed(1)} kHz · 32-bit float`;
  } catch (err) { warn(`Couldn't start recording: ${err.message}`); }
  finally { $("recGo").disabled = false; }
});

function buildMeters(n, names) {
  const box = $("meters"); box.innerHTML = ""; clipHold = new Array(n).fill(0); heard = new Array(n).fill(-120); $("recHint").textContent = "";
  for (let c = 0; c < n; c++) {
    const row = document.createElement("div"); row.className = "chMeter";
    row.innerHTML = `<span>${names?.[c] ?? `Input ${c + 1}`}</span><div class="track"><div class="zone" title="Good zone for loud parts"></div><div class="fill"></div></div><span class="val">-inf</span><span class="verdict"></span>`;
    box.append(row);
  }
}
// What to do with each input's gain knob, from its recent loudest peaks
function verdict(db, clipping) {
  if (clipping) return ["Clipping: turn the gain down", "bad"];
  if (db > -4) return ["Hot: turn it down a little", "warn"];
  if (db > -20) return ["Good", "good"];
  if (db > -40) return ["Low: turn the gain up", "warn"];
  return ["No sound", ""];
}
function showLevels({ peaks, pinned, leveledDb, seconds, recording }) {
  if (recording) $("recTime").textContent = fmt(seconds).padStart(7, "0:");
  const rows = $("meters").children, now = performance.now();
  peaks.forEach((p, c) => {
    const db = 20 * Math.log10(p + 1e-9), row = rows[c]; if (!row) return; // raw input: what the gain knob controls
    const w = Math.max(0, Math.min(100, ((db + 60) / 60) * 100));
    const fill = row.querySelector(".fill"); fill.style.width = w + "%"; fill.style.setProperty("--w", (100 / Math.max(w, 1)) * 100 + "%");
    if (pinned[c] > 0) clipHold[c] = now + 2500;
    row.classList.toggle("clip", now < clipHold[c]);
    row.querySelector(".val").textContent = now < clipHold[c] ? "CLIP" : db < -90 ? "-inf" : db.toFixed(1);
    heard[c] = Math.max(heard[c] - 0.25, db); // recent loudest, slow fall (about 1 dB a second)
    const [text, cls] = verdict(heard[c], now < clipHold[c]), v = row.querySelector(".verdict");
    v.textContent = text; v.className = "verdict " + cls;
  });
  // which inputs have sound, so nobody has to wonder about one-ear audio
  if (now - openedAt > 3000 && peaks.length > 1) {
    const live = heard.map((db, c) => (db > -50 ? (recorder.channelNames?.[c] ?? `Input ${c + 1}`).replace(/^Input /, "") : "")).filter(Boolean);
    const st = state.recSetup, nOn = live.length;
    if (st === "stereo" && nOn === 1) $("recHint").textContent = `Stereo is picked but only Input ${live[0]} has sound. Check the other side's cable, or pick One input.`;
    else if (st === "single" && nOn > 1) $("recHint").textContent = `One input is picked but inputs ${live.join(", ")} all have sound. Pick Stereo, Blend or Board + more to keep them all, or leave it and choose later.`;
    else if ((st === "blend" || st === "boardRoom") && nOn < 2) $("recHint").textContent = nOn ? `Only Input ${live[0]} has sound so far. Bring up the others to check them.` : "No sound on any input yet.";
    else $("recHint").textContent = !live.length ? "No sound on any input yet. Check the cable, the input's gain knob, and phantom power (48V) for condenser mics."
      : live.length === 1 ? `Sound on Input ${live[0]} only. That's fine: it'll play in both ears afterwards.`
      : `Sound on inputs ${live.join(", ")}. After the show Encore suggests how to combine them (stereo, blended, or board + room), and you can change it.`;
  } else if (now - openedAt > 3000 && heard[0] < -50) $("recHint").textContent = "No sound yet. Check the cable and the gain knob.";
  else if (peaks.length === 1) $("recHint").textContent = "";
  updateMonitor();
  if ($("leveler").checked) $("levNow").textContent = `leveled ${(leveledDb + state.inputDb).toFixed(0)} dB`;
}
// ---------- Listen: hear the inputs during soundcheck/recording ----------
// Mixed the way the recording will be (a mono mic plays in both ears, a
// stereo pair stays left/right), so what you hear is what you'll get.
// Headphones only: a mic plus speakers feeds back. Browsers add a little
// delay, so it's for checking sound, not for playing along to.
let mon = null, monAt = 0;
function buildMonitor() {
  mon = null;
  if (!recorder.ctx || !recorder.input) return;
  const ctx = recorder.ctx, n = recorder.channels;
  const split = ctx.createChannelSplitter(n), merge = ctx.createChannelMerger(2), out = ctx.createGain();
  recorder.input.connect(split);
  const gains = [];
  for (let c = 0; c < n; c++) {
    const gl = ctx.createGain(), gr = ctx.createGain(); gl.gain.value = 0; gr.gain.value = 0;
    split.connect(gl, c); split.connect(gr, c); gl.connect(merge, 0, 0); gr.connect(merge, 0, 1);
    gains.push([gl, gr]);
  }
  out.gain.value = $("monitor").checked ? 1 : 0;
  merge.connect(out).connect(ctx.destination);
  mon = { out, gains, key: "" };
  updateMonitor(true);
}
// left/right gain for each input, from the setup choice and which inputs have sound
function monitorMix() {
  const n = mon.gains.length, s = state.recSetup, mix = Array.from({ length: n }, () => [0, 0]);
  const live = heard.map((db, c) => (db > -50 ? c : -1)).filter((c) => c >= 0);
  const loudest = heard.indexOf(Math.max(...heard));
  const center = (cs, g = 1) => cs.forEach((c) => { mix[c][0] += g / Math.max(1, cs.length) ** 0.5; mix[c][1] += g / Math.max(1, cs.length) ** 0.5; });
  const pair = () => { const c = Math.max(0, (live[0] ?? loudest) - ((live[0] ?? loudest) % 2)); return [c, Math.min(c + 1, n - 1)]; };
  if (n === 1) center([0]);
  else if (s === "single") center([loudest]);
  else if (s === "stereo") { const [a, b] = pair(); mix[a][0] = 1; mix[b][1] = 1; }
  else if (s === "boardRoom") { const [a, b] = pair(); mix[a][0] = 1; mix[b][1] = 1; center(live.filter((c) => c !== a && c !== b), 0.5); }
  else center(live.length ? live : [loudest]); // auto + blend: everything with sound, in the middle
  return mix;
}
function updateMonitor(force) {
  if (!mon || (!force && performance.now() - monAt < 1000)) return;
  monAt = performance.now();
  const mix = monitorMix(), key = JSON.stringify(mix);
  if (key === mon.key) return;
  mon.key = key;
  const t = recorder.ctx.currentTime;
  mix.forEach(([l, r], c) => { mon.gains[c][0].gain.setTargetAtTime(l, t, 0.05); mon.gains[c][1].gain.setTargetAtTime(r, t, 0.05); });
}
$("monitor").addEventListener("change", () => {
  if (mon) mon.out.gain.setTargetAtTime($("monitor").checked ? 1 : 0, recorder.ctx.currentTime, 0.03);
  $("monitorNote").classList.toggle("hidden", !$("monitor").checked);
});
$("inVol").addEventListener("input", () => { state.inputDb = +$("inVol").value; $("inVolVal").textContent = `${state.inputDb.toFixed(1)} dB`; });
$("leveler").addEventListener("change", () => { if (!$("leveler").checked) $("levNow").textContent = "off"; });
$("recMark").addEventListener("click", () => { $("markCount").textContent = `(${recorder.mark()})`; });
$("recStop").addEventListener("click", async () => {
  $("recStop").disabled = true; $("recStop").textContent = "Saving...";
  const rec = await recorder.stop();
  $("recStop").disabled = false; $("recStop").textContent = "Stop";
  if (rec) loadRecorded(rec);
});
async function loadRecorded(rec) {
  rec.leveler = $("leveler").checked; rec.inputDb = state.inputDb; rec.setup = state.recSetup;
  updateSaved(rec.name, { leveler: rec.leveler, inputDb: rec.inputDb, setup: rec.setup });
  loadSet(rec.file, { recording: rec });
}
document.addEventListener("keydown", (e) => {
  if (e.target.closest?.("input, textarea, select")) return;
  if (recorder.state === "recording" && e.key.toLowerCase() === "m") $("recMark").click();
  else if (!$("editor").classList.contains("hidden") && e.code === "Space") { e.preventDefault(); togglePlay(); }
});
window.addEventListener("beforeunload", (e) => { if (recorder.state === "recording") { e.preventDefault(); e.returnValue = ""; } });

function show(view) {
  $("startView").classList.toggle("hidden", view !== "start");
  $("recView").classList.toggle("hidden", view !== "rec");
  $("editor").classList.toggle("hidden", view !== "edit");
  $("newSet").classList.toggle("hidden", view !== "edit");
}
$("newSet").addEventListener("click", () => {
  if (!confirm("Start a new set? Titles and edits for this one aren't saved yet.")) return;
  player.stop(); state.src = null; state.songs = []; state.prepared = null; clearOutputs();
  $("setName").textContent = ""; show("start"); refreshSaved();
});

// =====================================================================
// Loading + finding the songs
// =====================================================================
async function loadSet(file, { recording } = {}) {
  player.stop();
  show("edit");
  state.fileName = file.name; state.recordingName = recording?.name ?? null;
  state.markers = recording?.markers ?? [];
  state.chNames = recording?.channelNames ?? null;
  state.chosenSetup = recording?.setup ?? "auto";
  state.songs = []; state.prepared = null; state.keepGap.clear(); state.open.clear(); state.selected = null; clearOutputs();
  $("setName").textContent = recording ? `Recording from ${recording.name.replace(/^live-/, "").replace(/T(\d\d)-(\d\d)-\d\d$/, " $1:$2")}` : file.name;
  $("analyseText").textContent = "Opening the recording...";
  setBar(0);
  try { state.src = await openSource(file, audio()); }
  catch { $("analyseText").innerHTML = `<span class="bad">Couldn't read that file.</span> Try WAV, MP3, M4A or FLAC.`; return; }
  const src = state.src;
  state.inputDb = recording?.inputDb ?? 0;
  state.leveler = recording ? recording.leveler !== false : false;
  $("gVol").value = state.inputDb; $("gVolVal").textContent = `${state.inputDb.toFixed(1)} dB`; $("gLeveler").checked = state.leveler;
  $("gainPanel").classList.remove("hidden");
  $("analyseText").textContent = "Listening to each input...";
  await setupRouting();
  $("markLegend").classList.toggle("hidden", !state.markers.length);
  if (!$("mDate").value) $("mDate").value = recording ? new Date().toISOString().slice(0, 10) : "";
  resizeTimeline();
  await detect();
}

async function detect() {
  const src = state.src;
  await ready;
  $("analyseText").textContent = `Finding the songs in ${fmt(src.duration)} of audio...`;
  $("analyseBar").classList.remove("hidden");
  const desc = { ...describeSource(src), gainTrack: null }; // detect on the raw level
  const t0 = performance.now();
  const res = await rpc({ type: "analyse", source: desc }, (p) => setBar(p.pct));
  state.analysis = res.result; state.overview = res.overview; state.levelerDb = res.levelerDb;
  applyGain();
  state.songs = res.result.songs.map((s) => newSong(s.start, s.end, { conf: s.confidence, level: s.level }));
  $("analyseBar").classList.add("hidden");
  const n = state.songs.length;
  $("analyseText").textContent = n ? `Found ${n} song${n === 1 ? "" : "s"} in ${((performance.now() - t0) / 1000).toFixed(0)} s. Check the edges, then name them.`
    : "No songs found. Use + Song here to mark them by hand.";
  if (n) state.open.add(state.songs[0].id);
  changed();
  if (n && $("mSetlist").value.trim()) applySetlist(); // a setlist typed during soundcheck names the songs
  player.pos = 0; tick(); // time + scrub bar sized to the set
  state.live = null; if (mnode) refreshLearned();
}
const setBar = (pct) => { $("analyseBar").firstElementChild.style.width = pct + "%"; };

function newSong(start, end, extra = {}) {
  return { id: nextSongId++, start, end, title: "", explicit: false, isrc: "", applause: "short", fadeIn: 0.1, fadeOut: null, conf: 1, level: null, ...extra };
}

// ---------- inputs: what was heard on each, and how to listen to it ----------
// Interfaces put each input on its own channel (a mic on Input 1 is only on
// the left), so nobody should have to guess: listen to every input, pick a
// setup, say what was picked in plain words, and let one click change it.
const SETUP_TEXT = {
  single: (r) => `${chName(r.main[0])} plays in both ears.`,
  stereo: (r) => `${chName(r.main[0])} and ${chName(r.main[1])} play left and right.`,
  blend: (r) => `${chName(r.main[0])} and ${chName(r.main[1])} are blended into the middle, so both ears hear both.`,
  boardRoom: (r) => `Board on ${r.main.map(chName).join(" + ")}, room mics on ${[...new Set(r.room ?? [])].map(chName).join(" + ")} blended in.`,
};
async function setupRouting() {
  const src = state.src, ch = src.channels ?? 1;
  $("routingPanel").classList.toggle("hidden", ch < 2); $("tabInputs").classList.toggle("hidden", ch < 2);
  if (ch < 2 && currentTab === "inputs") showTab("show");
  if (ch < 2) return;
  $("routingInfo").textContent = `${ch} recorded`;
  const info = await inspectChannels(src), sug = routingForSetup(info, state.chosenSetup, state.chNames ?? []);
  state.chanInfo = info; state.setup = sug.setup; src.routing = sug.routing;
  const bars = $("chanBars"); bars.innerHTML = "";
  info.levels.forEach((db, c) => {
    const row = document.createElement("div"); row.className = "chanBar" + (info.active[c] ? "" : " off");
    row.innerHTML = `<span>${chName(c)}</span><div class="track"><div class="fill" style="width:${Math.max(2, Math.min(100, ((db + 70) / 60) * 100))}%"></div></div><span class="st">${info.active[c] ? "sound" : "silent"}</span>`;
    bars.append(row);
  });
  const opt = (sel, items) => { sel.innerHTML = ""; for (const [v, t] of items) sel.append(new Option(t, v)); };
  const singles = Array.from({ length: ch }, (_, c) => [`${c}`, `${chName(c)}${info.active[c] ? "" : " (silent)"}`]);
  const pairs = []; for (let c = 0; c + 1 < ch; c += 2) pairs.push([`${c},${c + 1}`, `${chName(c)} + ${chName(c + 1).replace(/^Input /, "")}`]);
  opt($("pickOne"), singles); opt($("pickA"), singles); opt($("pickB"), singles); opt($("pickPair"), pairs);
  opt($("pickRoom"), [...pairs, ...singles.map(([v, t]) => [`${v},${v}`, t])]);
  [...$("setups").children].forEach((b) => { b.disabled = b.dataset.setup === "boardRoom" ? ch < 3 : false; });
  syncPickers();
  $("routeText").textContent = sug.text;
  $("redetect").classList.add("hidden");
  paintSetup();
}
// show the routing in the pickers
function syncPickers() {
  const r = state.src.routing;
  $("pickOne").value = `${r.main[0]}`; $("pickA").value = `${r.main[0]}`; $("pickB").value = `${r.main[1] ?? r.main[0]}`;
  const pair = `${r.main[0] - (r.main[0] % 2)},${r.main[0] - (r.main[0] % 2) + 1}`;
  if ([...$("pickPair").options].some((o) => o.value === pair)) $("pickPair").value = pair;
  if (r.room) $("pickRoom").value = r.room.join(",");
  $("rRoomDb").value = r.roomDb;
}
function paintSetup() {
  const s = state.setup;
  [...$("setups").children].forEach((b) => b.classList.toggle("on", b.dataset.setup === s));
  const show = { pickOneWrap: s === "single", pickAWrap: s === "blend", pickBWrap: s === "blend", pickPairWrap: s === "stereo" || s === "boardRoom", pickRoomWrap: s === "boardRoom" };
  for (const [id, on] of Object.entries(show)) $(id).classList.toggle("hidden", !on);
  $("pickPairWrap").firstChild.textContent = s === "boardRoom" ? "Board feed" : "Inputs";
  $("roomControls").classList.toggle("hidden", s !== "boardRoom");
}
// a setup button or picker changed: rebuild the routing from the pickers
function routingFromPickers() {
  const r = state.src.routing, s = state.setup, info = state.chanInfo, pair = $("pickPair").value.split(",").map(Number);
  r.mono = false; r.room = null;
  if (s === "single") r.main = [+$("pickOne").value, +$("pickOne").value];
  if (s === "stereo") r.main = pair;
  if (s === "blend") { r.main = [+$("pickA").value, +$("pickB").value]; r.mono = true; }
  if (s === "boardRoom") {
    r.main = pair;
    if ($("pickRoom").value.split(",").some((c) => pair.includes(+c))) { // room can't be the board: take the next live inputs
      const free = info.active.map((a, c) => (a && !pair.includes(c) ? c : -1)).filter((c) => c >= 0);
      $("pickRoom").value = free.length >= 2 && free[1] === free[0] + 1 && free[0] % 2 === 0 ? `${free[0]},${free[1]}` : `${free[0] ?? Math.min(info.levels.length - 1, pair[1] + 1)},${free[0] ?? Math.min(info.levels.length - 1, pair[1] + 1)}`;
    }
    r.room = $("pickRoom").value.split(",").map(Number);
  }
  r.roomDb = +$("rRoomDb").value; r.mainDelay = Math.round((+$("rDelay").value / 1000) * state.src.fs);
  $("rRoomVal").textContent = `${r.roomDb.toFixed(1)} dB`; $("rDelayVal").textContent = `${(+$("rDelay").value).toFixed(1)} ms`;
  $("routeText").textContent = SETUP_TEXT[s](r);
  $("redetect").classList.remove("hidden");
  paintSetup();
  if (player.playing) player.play(player.time()); // hear the change right away
  soundChanged();
}
$("setups").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-setup]"); if (!b || b.disabled) return;
  state.setup = b.dataset.setup;
  // best inputs for this setup from what was heard (same logic as the soundcheck choice)
  const sug = routingForSetup(state.chanInfo, state.setup, state.chNames ?? []), r = state.src.routing;
  state.src.routing = { ...sug.routing, roomDb: r.roomDb, mainDelay: r.mainDelay };
  syncPickers();
  routingFromPickers();
  $("routeText").textContent = sug.text;
});
for (const id of ["pickOne", "pickA", "pickB", "pickPair", "pickRoom"]) $(id).addEventListener("change", routingFromPickers);
const routingChanged = routingFromPickers;
for (const id of ["rRoomDb", "rDelay"]) $(id).addEventListener("input", routingChanged);
$("redetect").addEventListener("click", () => { $("redetect").classList.add("hidden"); detect(); });
// Find how much later the room mics hear things than the board: cross-correlate
// a loud stretch at 8 kHz, then refine at full rate.
$("rAuto").addEventListener("click", async () => {
  const src = state.src, r = src.routing; if (!r.room) return;
  $("rAuto").disabled = true; $("rAuto").textContent = "Listening...";
  const loud = [...state.songs].sort((a, b) => (b.level ?? -99) - (a.level ?? -99))[0];
  const at = loud ? (loud.start + loud.end) / 2 : src.duration / 2, fs = src.fs, n = Math.round(fs * 8);
  const raw = await src.readRaw(Math.max(0, Math.round(at * fs) - n / 2), n);
  const mono = (p) => Float32Array.from(raw[p[0]], (v, i) => 0.5 * (v + raw[p[1] ?? p[0]][i]));
  const a = mono(r.main), b = mono(r.room), dec = Math.max(1, Math.round(fs / 8000));
  const down = (x) => Float32Array.from({ length: Math.floor(x.length / dec) }, (_, i) => { let s = 0; for (let k = 0; k < dec; k++) s += x[i * dec + k]; return s; });
  const A = down(a), B = down(b), maxLag = Math.round((0.15 * fs) / dec);
  const corr = (X, Y, lag, from, to) => { let s = 0; for (let i = from; i < to; i++) s += X[i] * Y[i + lag]; return s; };
  let best = 0, bestV = -Infinity;
  for (let lag = 0; lag <= maxLag; lag++) { const v = corr(A, B, lag, 0, A.length - maxLag); if (v > bestV) { bestV = v; best = lag; } }
  let fine = best * dec, fineV = -Infinity;
  for (let lag = Math.max(0, best * dec - dec); lag <= best * dec + dec; lag++) { const v = corr(a, b, lag, 0, Math.round(fs * 2)); if (v > fineV) { fineV = v; fine = lag; } }
  $("rDelay").value = ((fine / fs) * 1000).toFixed(1);
  $("rAuto").disabled = false; $("rAuto").textContent = "Line up automatically";
  routingChanged();
});

// ---------- level: input volume + smart leveler (non-destructive) ----------
function applyGain() {
  if (state.src) state.src.gainTrack = buildGainTrack(state.levelerDb, state.inputDb, state.leveler);
}
$("gVol").addEventListener("input", () => { state.inputDb = +$("gVol").value; $("gVolVal").textContent = `${state.inputDb.toFixed(1)} dB`; applyGain(); soundChanged(); });
$("gLeveler").addEventListener("change", () => { state.leveler = $("gLeveler").checked; applyGain(); soundChanged(); });

// =====================================================================
// Songs: what gets kept, and how each one ends
// =====================================================================
const songIndex = (id) => state.songs.findIndex((s) => s.id === id);
function applauseAfter(song) { // seconds of applause straight after a song ends
  const t = state.analysis?.timeline ?? [];
  let n = 0, miss = 0;
  for (let x = Math.floor(song.end); x < t.length && n + miss < 30; x++) {
    if (t[x] === "applause") { n += 1 + miss; miss = 0; } else if (++miss > 1) break;
  }
  return n;
}
// The part of the recording that becomes the track
function renderRange(i) {
  const s = state.songs[i], next = state.songs[i + 1], limit = (next ? next.start : state.src.duration) - 0.2;
  const clap = applauseAfter(s);
  let end = s.end, fadeOut = 0.6;
  if (s.applause === "short") { end = s.end + Math.min(clap, 4); fadeOut = clap ? 2 : 0.6; }
  if (s.applause === "full") { end = s.end + Math.min(clap + 1, 15); fadeOut = 2.5; } // long "applause" is usually talk too
  end = Math.max(s.end, Math.min(end, limit));
  return { start: s.start, end, fadeIn: s.fadeIn, fadeOut: s.fadeOut ?? fadeOut };
}
// Kept stretches of the show (for "skip cuts" and the full-show file)
function pieces() {
  const out = [];
  state.songs.forEach((s, i) => {
    const rr = renderRange(i), last = out[out.length - 1];
    if (last && last.joinNext) { last.end = rr.end; last.joinNext = state.keepGap.has(s.id); return; }
    out.push({ start: rr.start, end: rr.end, joinNext: state.keepGap.has(s.id) });
  });
  return out.map((p) => ({ start: p.start, end: p.end })); // a kept gap is inside its piece
}
function gapKind(a, b) {
  const t = state.analysis?.timeline ?? [], counts = {};
  for (let x = Math.floor(a); x < Math.min(t.length, Math.ceil(b)); x++) counts[t[x]] = (counts[t[x]] ?? 0) + 1;
  return Object.entries(counts).sort((x, y) => y[1] - x[1])[0]?.[0] ?? "quiet";
}

// structure changed: renumber, redraw everything, drop stale previews
function changed() {
  state.songs.sort((a, b) => a.start - b.start);
  if (state.selected && songIndex(state.selected) < 0) state.selected = null;
  renderSongs(); selectSong(state.selected); updateSummary(); clearOutputs();
  if (mnode) { clearTimeout(soundTimer); soundTimer = setTimeout(refreshLearned, 800); } // the loudest song may have changed
}
function updateSummary() {
  const N = state.songs.length;
  const total = state.songs.reduce((a, _, i) => { const r = renderRange(i); return a + r.end - r.start; }, 0);
  $("sumTracks").textContent = N; $("sumLength").textContent = fmt(total);
  $("sumCut").textContent = state.src ? fmt(state.src.duration - total) : "0:00";
  $("exportGo").disabled = !N; $("encoreGo").disabled = !N;
}

function renderSongs() {
  const box = $("songs"); box.innerHTML = "";
  const N = state.songs.length;
  state.songs.forEach((s, i) => {
    if (i > 0) box.append(gapRow(state.songs[i - 1], s));
    const color = COLORS[i % COLORS.length], d = document.createElement("details");
    d.className = "song"; d.style.setProperty("--c", color); d.open = state.open.has(s.id); d.dataset.id = s.id;
    const rr = renderRange(i);
    d.innerHTML = `<summary><span class="num">${pad2(i + 1)}</span><span class="sTitle ${s.title ? "" : "untitled"}">${esc(s.title || `Song ${i + 1}`)}</span>
      ${s.conf < 0.5 ? '<span class="badge check" title="The edges of this one were hard to call. Give it a listen.">check edges</span>' : "<span></span>"}
      <span class="sMeta">${fmt(rr.end - rr.start)}</span></summary>
      <div class="songBody">
        <div class="grid2">
          <label class="field wide">Title<input data-k="title" value="${esc(s.title)}" placeholder="Song ${i + 1}" autocomplete="off"></label>
          <label class="field">ISRC <small>(optional)</small><input data-k="isrc" value="${esc(s.isrc)}" autocomplete="off"></label>
          <label class="check" style="align-self:end;padding-bottom:6px"><input type="checkbox" data-k="explicit" ${s.explicit ? "checked" : ""}> Explicit</label>
        </div>
        <div class="edges">
          <div class="edge"><div class="label">Starts <span>drag or click to listen</span></div><canvas data-edge="start"></canvas>
            <div class="row"><span class="t">${fmt(s.start, true)}</span><button data-nudge="start,-1">-1s</button><button data-nudge="start,-0.1">-.1</button><button data-nudge="start,0.1">+.1</button><button data-nudge="start,1">+1s</button><button data-play="start">Play</button></div></div>
          <div class="edge"><div class="label">Ends <span>${applauseAfter(s) ? `${applauseAfter(s)} s of applause after` : ""}</span></div><canvas data-edge="end"></canvas>
            <div class="row"><span class="t">${fmt(s.end, true)}</span><button data-nudge="end,-1">-1s</button><button data-nudge="end,-0.1">-.1</button><button data-nudge="end,0.1">+.1</button><button data-nudge="end,1">+1s</button><button data-play="end">Play end</button></div></div>
        </div>
        <div><div class="label">Applause at the end</div>
          <div class="seg" data-seg="applause">${[["cut", "Cut it"], ["short", "Short tail"], ["full", "Keep it all"]].map(([v, t]) => `<button data-v="${v}" class="${s.applause === v ? "on" : ""}">${t}</button>`).join("")}</div></div>
        <div class="songActions">
          <button class="small" data-act="split" title="Split this song in two where the playhead is">Split at playhead</button>
          ${i < N - 1 ? '<button class="small" data-act="merge" title="One song, not two">Merge with next</button>' : ""}
          <button class="small" data-act="remove" title="Not a song: cut it out">Not a song</button>
          <button class="small" data-act="master" title="Play this song mastered">Hear it mastered</button>
        </div>
      </div>`;
    d.addEventListener("toggle", () => { if (d.open) { state.open.add(s.id); drawEdges(d, s); } else state.open.delete(s.id); });
    d.querySelectorAll("input[data-k]").forEach((inp) => inp.addEventListener(inp.type === "checkbox" ? "change" : "input", () => {
      s[inp.dataset.k] = inp.type === "checkbox" ? inp.checked : inp.value;
      if (inp.dataset.k === "title") { const t = d.querySelector(".sTitle"); t.textContent = s.title || `Song ${i + 1}`; t.classList.toggle("untitled", !s.title); }
      clearOutputs();
    }));
    d.querySelectorAll("[data-nudge]").forEach((b) => b.addEventListener("click", () => { const [edge, by] = b.dataset.nudge.split(","); moveEdge(s, edge, s[edge] + +by); }));
    d.querySelectorAll("[data-play]").forEach((b) => b.addEventListener("click", () => player.play(b.dataset.play === "start" ? s.start : Math.max(s.start, s.end - 6))));
    d.querySelectorAll("[data-seg=applause] button").forEach((b) => b.addEventListener("click", () => { s.applause = b.dataset.v; changed(); }));
    d.querySelector("[data-act=split]").addEventListener("click", () => {
      const t = player.time();
      if (t <= s.start + 5 || t >= s.end - 5) { $("abNote").textContent = "Move the playhead inside this song (at least 5 s from either edge) to split it."; return; }
      const b = newSong(t, s.end); s.end = t; state.songs.push(b); state.open.add(b.id); changed();
    });
    d.querySelector("[data-act=merge]")?.addEventListener("click", () => { const nx = state.songs[i + 1]; s.end = nx.end; state.songs.splice(i + 1, 1); changed(); });
    d.querySelector("[data-act=remove]").addEventListener("click", () => { state.songs.splice(i, 1); changed(); });
    d.querySelector("[data-act=master]").addEventListener("click", () => { setMastered(true); player.play(s.start); });
    box.append(d);
    if (d.open) requestAnimationFrame(() => drawEdges(d, s));
  });
}
function gapRow(a, b) {
  const row = document.createElement("div"); row.className = "gapRow";
  const ia = songIndex(a.id), from = renderRange(ia).end, len = b.start - from;
  const kind = gapKind(from, b.start);
  row.innerHTML = `<span>${fmt(Math.max(0, len))} of <b>${GAP_NAMES[kind] ?? kind}</b> between songs</span>`;
  const sel = document.createElement("select"); sel.className = "field";
  sel.append(new Option("Cut it out", "cut"), new Option("Keep it (full show file)", "keep"));
  sel.value = state.keepGap.has(a.id) ? "keep" : "cut";
  sel.addEventListener("change", () => { if (sel.value === "keep") state.keepGap.add(a.id); else state.keepGap.delete(a.id); drawTimeline(); updateSummary(); clearOutputs(); });
  const play = document.createElement("button"); play.className = "small"; play.textContent = "Listen";
  play.onclick = () => player.play(from);
  row.append(sel, play);
  return row;
}
function moveEdge(s, edge, t) {
  // Dragging into a neighbour pushes its edge along; squeeze it under 5 s and
  // it's absorbed (a false split gets fixed just by dragging over it).
  let i = songIndex(s.id), absorbed = false;
  if (edge === "start") {
    s.start = Math.max(0, Math.min(t, s.end - 5));
    for (let prev = state.songs[i - 1]; prev && s.start < prev.end + 0.3; prev = state.songs[i - 1]) {
      if (s.start - 0.3 - prev.start < 5) { state.songs.splice(i - 1, 1); i--; absorbed = true; }
      else { prev.end = +(s.start - 0.3).toFixed(2); break; }
    }
  } else {
    s.end = Math.min(state.src.duration, Math.max(t, s.start + 5));
    for (let next = state.songs[i + 1]; next && s.end > next.start - 0.3; next = state.songs[i + 1]) {
      if (next.end - (s.end + 0.3) < 5) { state.songs.splice(i + 1, 1); absorbed = true; }
      else { next.start = +(s.end + 0.3).toFixed(2); break; }
    }
  }
  s.start = +s.start.toFixed(2); s.end = +s.end.toFixed(2);
  if (absorbed) { renderSongs(); drawTimeline(); updateSummary(); clearOutputs(); return; }
  const d = document.querySelector(`details.song[data-id="${s.id}"]`);
  if (d) {
    const [ts, te] = d.querySelectorAll(".edge .t"); ts.textContent = fmt(s.start, true); te.textContent = fmt(s.end, true);
    const rr = renderRange(i); d.querySelector(".sMeta").textContent = fmt(rr.end - rr.start);
    drawEdges(d, s, edge);
  }
  drawTimeline(); updateSummary(); clearOutputs();
 
  debounceRebuild();
}
let rebuildTimer = 0;
function debounceRebuild() { clearTimeout(rebuildTimer); rebuildTimer = setTimeout(() => { if (!document.querySelector(".edge canvas.dragging")) renderSongs(); }, 1200); }

// Close-up waveforms of a song's start and end (16 s around each edge)
const edgeView = new WeakMap();
async function drawEdges(d, s, only) {
  for (const cv of d.querySelectorAll("canvas[data-edge]")) {
    const edge = cv.dataset.edge;
    if (only && only !== edge && edgeView.has(cv)) continue;
    let view = edgeView.get(cv);
    if (!view || view.songId !== s.id || !cv.classList.contains("dragging") && (s[edge] < view.a + 2 || s[edge] > view.b - 2)) {
      const a = Math.max(0, s[edge] - 8), b = Math.min(state.src.duration, s[edge] + 8);
      view = { songId: s.id, a, b, peaks: null }; edgeView.set(cv, view);
      const fs = state.src.fs, { l, r } = await state.src.read(Math.round(a * fs), Math.round((b - a) * fs));
      const W = 400, per = Math.max(1, Math.floor(l.length / W)), pk = new Float32Array(W);
      for (let x = 0; x < W; x++) { let m = 0; for (let k = x * per; k < (x + 1) * per && k < l.length; k += 2) m = Math.max(m, Math.abs(l[k]), Math.abs(r[k])); pk[x] = m; }
      view.peaks = pk;
      if (!cv.dataset.wired) wireEdge(cv, d);
    }
    paintEdge(cv, view, s, edge, COLORS[songIndex(s.id) % COLORS.length]);
  }
}
function paintEdge(cv, view, s, edge, color) {
  const dpr = devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
  if (!W) return;
  cv.width = W * dpr; cv.height = H * dpr;
  const g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  const pk = view.peaks; if (!pk) return;
  const mx = Math.max(0.05, ...pk), tx = (t) => ((t - view.a) / (view.b - view.a)) * W, ex = tx(s[edge]);
  for (let x = 0; x < W; x++) {
    const v = pk[Math.floor((x / W) * pk.length)] / mx, h = Math.max(1, v * (H / 2 - 4)), t = view.a + (x / W) * (view.b - view.a);
    const inSong = edge === "start" ? t >= s[edge] : t <= s[edge];
    g.fillStyle = inSong ? color : "rgba(145,136,125,0.35)";
    g.fillRect(x, H / 2 - h, 1, h * 2);
  }
  g.fillStyle = "#f2efe8"; g.fillRect(Math.round(ex) - 1, 0, 2, H);
  const pt = player.time();
  if (pt >= view.a && pt <= view.b) { g.fillStyle = "rgba(242,239,232,0.6)"; g.fillRect(Math.round(tx(pt)), 0, 1, H); }
}
function wireEdge(cv, d) {
  cv.dataset.wired = 1;
  let down = null;
  const timeAt = (e) => { const v = edgeView.get(cv), rc = cv.getBoundingClientRect(); return v.a + ((e.clientX - rc.left) / rc.width) * (v.b - v.a); };
  cv.addEventListener("pointerdown", (e) => { cv.setPointerCapture(e.pointerId); down = { x: e.clientX, moved: false }; });
  cv.addEventListener("pointermove", (e) => {
    if (!down) return;
    if (Math.abs(e.clientX - down.x) > 3) { down.moved = true; cv.classList.add("dragging"); }
    if (down.moved) { const s = state.songs[songIndex(+d.dataset.id)]; moveEdge(s, cv.dataset.edge, timeAt(e)); }
  });
  cv.addEventListener("pointerup", (e) => {
    if (down && !down.moved) player.play(timeAt(e));
    down = null; cv.classList.remove("dragging"); debounceRebuild();
  });
}

$("addSong").addEventListener("click", () => {
  const t = player.time();
  if (state.songs.some((s) => t >= s.start && t < s.end)) { $("abNote").textContent = "The playhead is inside a song. Use Split at playhead on that song instead."; return; }
  const next = state.songs.find((s) => s.start > t);
  const s = newSong(t, Math.min(t + 180, next ? next.start - 0.5 : state.src.duration));
  if (s.end - s.start < 5) { $("abNote").textContent = "Not enough room for a song here."; return; }
  state.songs.push(s); state.open.add(s.id); changed();
});
$("applySetlist").addEventListener("click", () => applySetlist());
function applySetlist() {
  const lines = $("mSetlist").value.split(/\r?\n/).map((x) => x.replace(/^\s*\d+\s*[.)\-:]?\s+/, "").trim()).filter(Boolean);
  lines.forEach((t, i) => { if (state.songs[i]) state.songs[i].title = t; });
  if (lines.length !== state.songs.length) $("abNote").textContent = `The setlist has ${lines.length} songs and ${state.songs.length} were found. Titles were filled in order; check the ones at the end.`;
  changed();
}

// =====================================================================
// Timeline: the whole set, songs in colour, cuts in grey
// =====================================================================
const tl = $("timeline");
function resizeTimeline() { const dpr = devicePixelRatio || 1; tl.width = tl.clientWidth * dpr; tl.height = tl.clientHeight * dpr; drawTimeline(); }
window.addEventListener("resize", () => { resizeTimeline(); document.querySelectorAll("details.song[open]").forEach((d) => { const s = state.songs[songIndex(+d.dataset.id)]; if (s) drawEdges(d, s); }); });
function drawTimeline() {
  const ov = state.overview, src = state.src;
  const dpr = devicePixelRatio || 1, W = tl.clientWidth, H = tl.clientHeight, g = tl.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  if (!ov || !src) return;
  const dur = src.duration, X = (t) => (t / dur) * W, top = 18, mid = top + (H - top - 14) / 2, half = (H - top - 14) / 2;
  const regions = state.songs.map((s, i) => ({ ...renderRange(i), song: s, color: COLORS[i % COLORS.length] }));
  const kept = pieces();
  const mx = Math.max(0.05, ...ov.peaks);
  for (let x = 0; x < W; x++) {
    const t = ((x + 0.5) / W) * dur, c0 = Math.floor((x / W) * ov.cols), c1 = Math.max(c0 + 1, Math.floor(((x + 1) / W) * ov.cols));
    let p = 0, lv = 0; for (let c = c0; c < c1 && c < ov.cols; c++) { p = Math.max(p, ov.peaks[c]); lv = Math.max(lv, ov.level[c]); }
    const reg = regions.find((r) => t >= r.start && t < r.end), keep = kept.some((k) => t >= k.start && t < k.end);
    const h = Math.max(1, Math.sqrt(p / mx) * half), hl = Math.max(0.5, Math.sqrt(lv / mx) * half);
    g.fillStyle = reg ? reg.color : keep ? "rgba(242,239,232,0.45)" : "rgba(145,136,125,0.28)";
    g.globalAlpha = reg ? 0.55 : 1; g.fillRect(x, mid - h, 1, h * 2);
    if (reg) { g.globalAlpha = 1; g.fillRect(x, mid - hl, 1, hl * 2); }
  }
  g.globalAlpha = 1;
  g.font = "600 11px 'DM Sans', sans-serif"; g.textBaseline = "top";
  regions.forEach((r, i) => {
    const a = X(r.song.start), b = X(r.song.end);
    g.fillStyle = r.color; g.fillRect(a, top - 4, Math.max(2, b - a), 3);
    g.fillRect(Math.round(a), top - 4, 2, H - top); g.fillRect(Math.round(b) - 2, top - 4, 2, H - top);
    if (b - a > 18) { g.fillStyle = r.color; g.fillText(String(i + 1).padStart(2, "0"), a + 4, 1); }
    if (b - a > 90 && r.song.title) { g.fillStyle = "#bdb4a9"; g.fillText(r.song.title.slice(0, Math.floor((b - a - 30) / 6)), a + 24, 1); }
    if (r.song.id === state.selected) { g.strokeStyle = "#f2efe8"; g.lineWidth = 2; g.strokeRect(a + 1, top - 3, Math.max(2, b - a - 2), H - top - 12); }
  });
  // "Join" where two songs (nearly) touch: one click undoes a false split
  joinChips = [];
  g.font = "700 10px 'DM Sans', sans-serif"; g.textBaseline = "middle";
  for (let i = 0; i + 1 < state.songs.length; i++) {
    const s = state.songs[i], nx = state.songs[i + 1];
    if (nx.start - s.end > 3) continue;
    const x = X((s.end + nx.start) / 2), w = 34, h = 16, y = top + 4;
    g.fillStyle = "#0c0a09"; g.strokeStyle = "#f2efe8"; g.lineWidth = 1;
    g.beginPath(); g.roundRect?.(x - w / 2, y, w, h, 8); g.fill(); g.stroke();
    g.fillStyle = "#f2efe8"; g.textAlign = "center"; g.fillText("Join", x, y + h / 2 + 0.5); g.textAlign = "start";
    joinChips.push({ i, x0: x - w / 2, x1: x + w / 2, y0: y, y1: y + h });
  }
  g.font = "600 11px 'DM Sans', sans-serif";
  g.fillStyle = "#91887d"; g.textBaseline = "bottom";
  for (let i = 0; i <= state.songs.length; i++) { // label what's in each cut
    const from = i ? regions[i - 1].end : 0, to = i < regions.length ? regions[i].start : dur;
    if (X(to) - X(from) > 70) { const k = gapKind(from, to); g.fillText(`${GAP_NAMES[k] ?? k} ${fmt(to - from)}`, X(from) + 4, H - 1); }
  }
  g.fillStyle = "#e8b04b";
  for (const m of state.markers) g.fillRect(Math.round(X(m)), top, 1, H - top - 14);
  const pt = player.time();
  g.fillStyle = "#f2efe8"; g.fillRect(Math.round(X(pt)), 0, 2, H);
}
// click to listen; drag a song's edge to move it
let tlDrag = null;
const tlTime = (e) => { const rc = tl.getBoundingClientRect(); return Math.max(0, Math.min(state.src.duration, ((e.clientX - rc.left) / rc.width) * state.src.duration)); };
function edgeAt(e) {
  const rc = tl.getBoundingClientRect(), px = e.clientX - rc.left, W = rc.width, dur = state.src.duration;
  let best = null;
  for (const s of state.songs) for (const edge of ["start", "end"]) {
    const d = Math.abs((s[edge] / dur) * W - px);
    if (d < 7 && (!best || d < best.d)) best = { s, edge, d };
  }
  return best;
}
let joinChips = [];
const chipAt = (e) => { const rc = tl.getBoundingClientRect(), x = e.clientX - rc.left, y = e.clientY - rc.top; return joinChips.find((c) => x >= c.x0 - 3 && x <= c.x1 + 3 && y >= c.y0 - 3 && y <= c.y1 + 3); };
tl.addEventListener("pointerdown", (e) => {
  if (!state.src) return;
  const chip = chipAt(e);
  if (chip) { joinSongs(chip.i); return; }
  const hit = edgeAt(e);
  tl.setPointerCapture(e.pointerId);
  // on an edge: it only moves once you actually drag; a plain click plays from there
  tlDrag = hit ? { ...hit, x0: e.clientX, moved: false } : { seek: true };
  if (!hit) {
    const t = tlTime(e);
    selectSong(state.songs.find((x) => t >= x.start && t < x.end)?.id ?? null);
    player.play(t);
  }
});
tl.addEventListener("pointermove", (e) => {
  if (!state.src) return;
  if (tlDrag?.s) {
    if (!tlDrag.moved && Math.abs(e.clientX - tlDrag.x0) > 4) tlDrag.moved = true;
    if (tlDrag.moved) moveEdge(tlDrag.s, tlDrag.edge, tlTime(e));
  }
  else if (tlDrag?.seek) player.play(tlTime(e));
  else tl.style.cursor = chipAt(e) ? "pointer" : edgeAt(e) ? "ew-resize" : "pointer";
});

// ---------- song tools: join / remove / split, from the timeline ----------
function joinSongs(i) { // song i and i+1 become one
  const a = state.songs[i], b = state.songs[i + 1]; if (!a || !b) return;
  a.end = b.end; a.title ||= b.title; state.songs.splice(i + 1, 1);
 
  selectSong(a.id); changed();
  $("abNote").textContent = `Joined into song ${i + 1}.`;
}
function removeSong(id) {
  const i = songIndex(id); if (i < 0) return;
  state.songs.splice(i, 1); state.selected = null; changed();
  $("abNote").textContent = `Removed. That part is now cut out (drag a neighbour's edge over it to keep it in a song).`;
}
function splitSong(id) {
  const s = state.songs[songIndex(id)], t = player.time();
  if (!s || t <= s.start + 5 || t >= s.end - 5) { $("abNote").textContent = "Put the playhead inside this song (at least 5 s from either edge) to split it there."; return; }
  const b = newSong(t, s.end); s.end = t; state.songs.push(b); state.open.add(b.id);
  selectSong(b.id); changed();
  $("abNote").textContent = "Split in two. If that was wrong, hit Join on the timeline.";
}
function selectSong(id) {
  state.selected = id;
  const i = songIndex(id), bar = $("songTools");
  bar.classList.toggle("hidden", i < 0);
  if (i >= 0) {
    const s = state.songs[i], rr = renderRange(i);
    $("toolName").textContent = `${pad2(i + 1)} ${s.title || `Song ${i + 1}`} · ${fmt(rr.end - rr.start)}`;
    $("toolPrev").disabled = i === 0; $("toolNext").disabled = i === state.songs.length - 1;
  }
  drawTimeline();
}
$("toolPlay").addEventListener("click", () => { const s = state.songs[songIndex(state.selected)]; if (s) player.play(s.start); });
$("toolPrev").addEventListener("click", () => { const i = songIndex(state.selected); if (i > 0) joinSongs(i - 1); });
$("toolNext").addEventListener("click", () => { const i = songIndex(state.selected); if (i >= 0) joinSongs(i); });
$("toolRemove").addEventListener("click", () => removeSong(state.selected));
$("toolSplit").addEventListener("click", () => splitSong(state.selected));
$("toolOpen").addEventListener("click", () => {
  const id = state.selected; state.open.add(id); renderSongs();
  document.querySelector(`details.song[data-id="${id}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
});
document.addEventListener("keydown", (e) => {
  if (e.target.closest?.("input, textarea, select") || $("editor").classList.contains("hidden") || !state.selected) return;
  if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); removeSong(state.selected); }
  if (e.key === "Escape") selectSong(null);
});
tl.addEventListener("pointerup", () => {
  const d = tlDrag; tlDrag = null;
  if (!d?.s) return;
  if (d.moved) { renderSongs(); return; }
  // clicked a song's edge: play from its start (or the last few seconds of its end)
  selectSong(d.s.id);
  player.play(d.edge === "start" ? d.s.start : Math.max(d.s.start, d.s.end - 6));
});
tl.addEventListener("dblclick", (e) => {
  const t = tlTime(e), s = state.songs.find((x) => t >= x.start && t < x.end);
  if (s) { state.open.add(s.id); renderSongs(); document.querySelector(`details.song[data-id="${s.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }
});

// =====================================================================
// Player: streams the set in 1 s pieces (never loads the whole show), plays
// mastered songs when "Mastered" is on, and can skip the cut parts.
// =====================================================================
const player = {
  gen: 0, playing: false, segs: [], sources: [], pos: 0, timer: 0, busy: false,
  time() {
    if (!this.playing || !ctx) return this.pos;
    const now = ctx.currentTime, seg = this.segs.find((s) => now >= s.t && now < s.t + s.dur);
    if (seg) return seg.pos + (now - seg.t);
    const last = this.segs[this.segs.length - 1];
    return last && now >= last.t + last.dur ? last.pos + last.dur : this.pos;
  },
  play(at) {
    if (!state.src) return;
    this.stop(true); audio().resume();
    this.pos = Math.max(0, Math.min(at ?? this.pos, state.src.duration - 0.05));
    this.playing = true; this.gen++;
    this.nextPos = this.pos; this.nextTime = ctx.currentTime + 0.08;
    this.timer = setInterval(() => this.pump(), 80); this.pump();
    setPlayIcon(true); tick();
  },
  stop(keep) {
    if (this.playing) this.pos = this.time();
    this.gen++; this.playing = false; clearInterval(this.timer);
    for (const s of this.sources) { try { s.stop(); } catch { /* done */ } }
    this.sources = []; this.segs = []; this.busy = false;
    if (!keep) { setPlayIcon(false); drawTimeline(); }
  },
  async pump() {
    if (this.busy || !this.playing) return;
    this.busy = true; const gen = this.gen;
    try {
      await ensureMasterGraph();
      while (this.playing && gen === this.gen && this.nextTime < ctx.currentTime + 1.2) {
        if (this.nextPos >= state.src.duration - 0.01) { if (ctx.currentTime > this.nextTime) { this.stop(); this.pos = 0; } break; }
        const chunk = await audioAt(this.nextPos);
        if (gen !== this.gen) return;
        if (chunk.jump !== undefined) { this.nextPos = chunk.jump; continue; }
        const n = chunk.l.length; if (!n) { this.nextPos += 0.5; continue; }
        const buf = ctx.createBuffer(2, n, chunk.fs); buf.copyToChannel(chunk.l, 0); buf.copyToChannel(chunk.r, 1);
        const node = ctx.createBufferSource(); node.buffer = buf; node.connect(playIn);
        if (this.nextTime < ctx.currentTime + 0.02) this.nextTime = ctx.currentTime + 0.05; // fell behind: small gap, carry on
        node.start(this.nextTime);
        node.onended = () => { this.sources = this.sources.filter((s) => s !== node); };
        this.sources.push(node);
        const dur = n / chunk.fs;
        this.segs.push({ t: this.nextTime, pos: this.nextPos, dur }); if (this.segs.length > 40) this.segs.shift();
        this.nextTime += dur; this.nextPos += dur;
      }
    } finally { if (gen === this.gen) this.busy = false; }
  },
};
async function audioAt(pos) {
  const src = state.src, fs = src.fs;
  const ranges = state.songs.map((_, i) => renderRange(i)), si = ranges.findIndex((r) => pos >= r.start && pos < r.end);
  if ($("skipCuts").checked && si < 0 && !pieces().some((p) => pos >= p.start && pos < p.end)) {
    const nx = ranges.find((r) => r.start > pos);
    return { jump: nx ? nx.start : src.duration };
  }
  // stop each piece at song boundaries (keeps skip-cuts exact)
  const bounds = ranges.flatMap((r) => [r.start, r.end]).filter((b) => b > pos + 1e-3);
  const end = Math.min(pos + 1, src.duration, ...bounds), n = Math.max(1, Math.round((end - pos) * fs));
  const { l, r } = await src.read(Math.round(pos * fs), n);
  return { l, r, fs };
}
function setPlayIcon(on) { $("playIcon").setAttribute("d", on ? "M6 5h4v14H6zM14 5h4v14h-4z" : "M7 5v14l12-7z"); $("play").setAttribute("aria-label", on ? "Pause" : "Play"); }
// scrub bar: drag to find your place anywhere in the set
let scrubbing = false;
$("scrub").addEventListener("input", () => {
  scrubbing = true; const t = +$("scrub").value;
  $("time").textContent = `${fmt(t)} / ${fmt(state.src.duration)}`;
  player.pos = t; if (!player.playing) drawTimeline();
});
$("scrub").addEventListener("change", () => { scrubbing = false; const t = +$("scrub").value; if (player.playing) player.play(t); else { player.pos = t; tick(); } });
const togglePlay = () => (player.playing ? player.stop() : player.play());
$("play").addEventListener("click", togglePlay);
$("rw").addEventListener("click", () => { const t = Math.max(0, player.time() - 10); player.playing ? player.play(t) : (player.pos = t, drawTimeline()); });
$("ff").addEventListener("click", () => { const t = Math.min(state.src.duration, player.time() + 10); player.playing ? player.play(t) : (player.pos = t, drawTimeline()); });
let lastSong = null;
function tick() {
  if (!state.src) return;
  const t = player.time();
  $("time").textContent = `${fmt(t)} / ${fmt(state.src.duration)}`;
  if (!scrubbing) { $("scrub").max = state.src.duration; $("scrub").value = t; }
  drawTimeline();
  const s = state.songs.find((x, i) => { const r = renderRange(i); return t >= r.start && t < r.end; });
  if ((s?.id ?? null) !== lastSong) {
    document.querySelectorAll("details.song.playing").forEach((d) => d.classList.remove("playing"));
    if (s) document.querySelector(`details.song[data-id="${s.id}"]`)?.classList.add("playing");
    lastSong = s?.id ?? null;
    applyLearnedForSong(s);
  }
  document.querySelectorAll("details.song[open]").forEach((d) => {
    const so = state.songs[songIndex(+d.dataset.id)];
    d.querySelectorAll("canvas[data-edge]").forEach((cv) => { const v = edgeView.get(cv); if (v?.peaks && so && t >= v.a - 1 && t <= v.b + 1) paintEdge(cv, v, so, cv.dataset.edge, COLORS[songIndex(so.id) % COLORS.length]); });
  });
  if (player.playing) requestAnimationFrame(tick);
}

// ---------- A/B: original vs mastered ----------
function setMastered(on, note) {
  state.mastered = on;
  $("abOrig").classList.toggle("on", !on); $("abMaster").classList.toggle("on", on);
  mnode?.port.postMessage({ type: "compare", on: !on }); // smooth crossfade, no restart
  $("abNote").textContent = note ?? (on ? "Mastered: the Sound settings change what you hear right away." : "Original: as recorded, played at the same loudness as the master so you can compare fairly.");
}
$("abOrig").addEventListener("click", () => setMastered(false));
$("abMaster").addEventListener("click", () => setMastered(true));

// =====================================================================
// Sound: one set of settings for the whole show
// =====================================================================
function settings() {
  // Low / Mid / High drive the engine's own broad EQ (160 Hz shelf, 1.2 kHz,
  // 5 kHz shelf); "tame harsh phone mic" dips the style's 3.5 kHz band.
  return { style: state.style, intensity: state.intensity, targetLufs: TARGETS[state.target].lufs,
           eq: { ...state.eq }, tone: [0, 0, 0, state.harsh ? -3 : 0, 0] };
}
function loudestSong() {
  const withLevel = state.songs.filter((s) => s.level !== null);
  if (withLevel.length) return withLevel.reduce((a, b) => (b.level > a.level ? b : a));
  return state.songs.reduce((a, b) => (b.end - b.start > a.end - a.start ? b : a));
}

// learning doesn't depend on "song to song" (that's applied per song), so leave it out of the key
const learnKey = () => JSON.stringify([settings(), state.rumble, state.src?.routing ?? null, state.inputDb, state.leveler]);
async function prepare(onText) {
  const key = learnKey(), loud = loudestSong(), lk = key + loud.start + loud.end;
  if (state.prepared?.key === lk) return state.prepared;
  if (state.preparing?.key === lk) return state.preparing.promise;
  await ready;
  const promise = rpc({ type: "prepare", source: describeSource(state.src), song: { start: loud.start, end: loud.end }, settings: settings(), rumble: state.rumble },
    (p) => onText?.(p.text)).then((res) => {
    if (state.preparing?.key === lk) state.preparing = null;
    const prep = { key: lk, learned: res.learned, lufs: res.lufs, origLufs: res.origLufs };
    if (learnKey() + loud.start + loud.end === lk) state.prepared = prep;
    return prep;
  }, (err) => { if (state.preparing?.key === lk) state.preparing = null; throw err; });
  state.preparing = { key: lk, promise };
  return promise;
}
async function masterSong(i, onText) {
  const prep = await prepare(onText);
  return rpc({ type: "song", source: describeSource(state.src), song: renderRange(i), settings: settings(), learned: prep.learned, rumble: state.rumble,
    even: state.even, refLufs: prep.lufs });
}

// ---------- live mastering while you listen ----------
// The same engine as the Master page runs on the audio thread, so style,
// intensity and EQ change instantly. The set's loudness ("learned" drive) is
// worked out in the background on the loudest song and swapped in when ready;
// "song to song" nudges the drive per song as playback moves through the set.
let mnode = null, playIn = null, rumbleHp = null, graphReady = null;
function ensureMasterGraph() {
  if (graphReady) return graphReady;
  graphReady = (async () => {
    const c = audio();
    await c.audioWorklet.addModule("worklet.js");
    mnode = new AudioWorkletNode(c, "encore-master", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
    playIn = c.createGain();
    rumbleHp = c.createBiquadFilter(); rumbleHp.type = "highpass"; rumbleHp.Q.value = 0.7071;
    rumbleHp.frequency.value = state.rumble ? 30 : 5;
    playIn.connect(rumbleHp).connect(mnode).connect(c.destination);
    const wasm = await (await fetch("master.wasm")).arrayBuffer();
    const up = new Promise((res) => { mnode.port.onmessage = (e) => { if (e.data.type === "ready") res(); }; });
    mnode.port.postMessage({ type: "init", wasm }, [wasm]);
    mnode.port.postMessage({ type: "settings", settings: settings() });
    mnode.port.postMessage({ type: "compare", on: !state.mastered });
    await up;
    refreshLearned();
  })();
  return graphReady;
}
let learnToken = 0;
async function refreshLearned() {
  if (!state.src || !state.songs.length) return;
  const token = ++learnToken;
  const t0 = setTimeout(() => { if (token === learnToken && state.mastered) $("abNote").textContent = "Setting the loudness for these settings..."; }, 400);
  try {
    const prep = await prepare();
    if (token !== learnToken) return;
    state.live = prep;
    applyLearnedForSong(state.songs.find((x) => x.id === lastSong) ?? null, true);
    // Original plays at the master's loudness, so A/B compares sound, not volume
    if (prep.origLufs > -90) mnode?.port.postMessage({ type: "match", gain: Math.pow(10, (prep.lufs - prep.origLufs) / 20) });
    if (state.mastered) $("abNote").textContent = `Mastered: loudest song at ${prep.lufs.toFixed(1)} LUFS. The Sound settings change what you hear right away.`;
  } catch (err) { if (token === learnToken) $("abNote").textContent = `Couldn't set the loudness: ${err.message}`; }
  finally { clearTimeout(t0); }
}
let lastLearnedKey = "";
function applyLearnedForSong(song, force) {
  if (!mnode || !state.live) return;
  const learned = state.live.learned.slice(), loud = loudestSong();
  const lift = song && song.level !== null && loud?.level !== null ? Math.max(0, loud.level - song.level) * state.even : 0;
  learned[2] = Math.max(-6, Math.min(24, learned[2] + lift));
  const key = learned.join();
  if (!force && key === lastLearnedKey) return;
  lastLearnedKey = key;
  mnode.port.postMessage({ type: "learned", learned });
}
let soundTimer = 0;
function soundChanged(fromSound) {
  clearOutputs();
  if (!state.src) return;
  // hear it straight away
  mnode?.port.postMessage({ type: "settings", settings: settings() });
  if (rumbleHp) rumbleHp.frequency.setTargetAtTime(state.rumble ? 30 : 5, rumbleHp.context.currentTime, 0.02);
  applyLearnedForSong(state.songs.find((x) => x.id === lastSong) ?? null);
  if (fromSound && !state.mastered && !$("editor").classList.contains("hidden")) setMastered(true, "Switched to Mastered so you can hear the Sound settings. Original is one click away.");
  // then the exact loudness for these settings, in the background
  clearTimeout(soundTimer);
  soundTimer = setTimeout(refreshLearned, 600);
}

function setupSound() {
  const box = $("styles");
  STYLES.slice(0, 4).forEach((s, i) => { // only the styles fitted to measurements
    const b = document.createElement("button"); b.textContent = s.name; b.title = s.blurb;
    b.addEventListener("click", () => { state.style = i; paintSound(); soundChanged(true); });
    box.append(b);
  });
  TARGETS.forEach((t, i) => {
    const b = document.createElement("button"); b.innerHTML = `${t.name}<br><small>${t.lufs} LUFS</small>`;
    b.addEventListener("click", () => { state.target = i; paintSound(); soundChanged(true); });
    $("targets").append(b);
  });
  $("intensity").addEventListener("input", () => {
    state.intensity = $("intensity").value / 100; const v = +$("intensity").value;
    $("intensityVal").textContent = v === 50 ? "Normal" : v < 50 ? `Light (${v}%)` : `Heavy (${v}%)`; soundChanged(true);
  });
  for (const [k, id] of [["low", "eqLow"], ["mid", "eqMid"], ["high", "eqHigh"]]) {
    const el = $(id), out = $(id + "Val");
    el.addEventListener("input", () => { state.eq[k] = +el.value; out.textContent = `${(+el.value).toFixed(1)} dB`; soundChanged(true); });
    el.addEventListener("dblclick", () => { el.value = 0; el.dispatchEvent(new Event("input")); });
  }
  $("even").addEventListener("input", () => {
    state.even = $("even").value / 100; const v = +$("even").value;
    $("evenVal").textContent = v === 0 ? "As played" : v === 100 ? "All equal" : `${v}% evened out`; soundChanged(true);
  });
  $("rumble").addEventListener("change", () => { state.rumble = $("rumble").checked; soundChanged(true); });
  $("harsh").addEventListener("change", () => { state.harsh = $("harsh").checked; soundChanged(true); });
  paintSound();
}
function paintSound() {
  [...$("styles").children].forEach((b, i) => b.classList.toggle("on", i === state.style));
  [...$("targets").children].forEach((b, i) => b.classList.toggle("on", i === state.target));
  $("blurb").textContent = STYLES[state.style].blurb;
}

// =====================================================================
// Show details, export, Encore
// =====================================================================
fillGenreSelect($("mGenre"));
$("mArt").addEventListener("change", async () => {
  const f = $("mArt").files[0]; if (!f) { state.art = null; $("mArtPreview").classList.add("hidden"); return; }
  state.art = { bytes: new Uint8Array(await f.arrayBuffer()), mime: f.type || "image/jpeg", name: f.name };
  $("mArtPreview").src = URL.createObjectURL(f); $("mArtPreview").classList.remove("hidden"); clearOutputs();
});
for (const id of ["mArtist", "mTitle", "mVenue", "mCity", "mDate", "mGenre"]) $(id).addEventListener("input", () => {
  clearOutputs();
  if (id === "mTitle" || id === "mVenue" || id === "mArtist") $("setName").textContent = releaseTitle() + ($("mArtist").value ? ` · ${$("mArtist").value}` : "");
});
function releaseTitle() {
  const v = $("mVenue").value.trim();
  return $("mTitle").value.trim() || (v ? `Live at ${v}` : "Live");
}
function showMeta() {
  const date = $("mDate").value, where = [$("mVenue").value.trim(), $("mCity").value.trim()].filter(Boolean).join(", ");
  return { artist: $("mArtist").value.trim(), album: releaseTitle(), venue: $("mVenue").value.trim(), city: $("mCity").value.trim(), date,
           year: date ? date.slice(0, 4) : String(new Date().getFullYear()), genre: $("mGenre").value,
           comment: `Recorded live${where ? ` at ${where}` : ""}${date ? `, ${date}` : ""}` };
}
const trackName = (i, s) => `${pad2(i + 1)} - ${clean(s.title) || `Song ${i + 1}`}`;

let outputUrls = [];
function clearOutputs() {
  if (!state.outputs && !outputUrls.length) return;
  state.outputs = null;
  outputUrls.forEach((u) => URL.revokeObjectURL(u)); outputUrls = [];
  $("exportResults").innerHTML = ""; $("exportStatus").textContent = "";
}
function link(blob, name, label) {
  const a = document.createElement("a"), url = URL.createObjectURL(blob); outputUrls.push(url);
  a.href = url; a.download = name; a.className = "dl"; a.textContent = `${label} (${(blob.size / 1e6).toFixed(1)} MB)`;
  $("exportResults").append(a);
}
const mp3Of = (l, r, fs, onPct) => new Promise((resolve, reject) => {
  const w = new Worker("mp3-worker.js");
  w.onmessage = (e) => { if (e.data.type === "progress") onPct?.(e.data.pct); else { resolve(e.data.mp3); w.terminate(); } };
  w.onerror = (e) => { reject(new Error(e.message)); w.terminate(); };
  w.postMessage({ l, r, fs, kbps: 320 }, [l.buffer, r.buffer]);
});

async function exportAll() {
  if (state.outputs) return state.outputs;
  const meta = showMeta(), N = state.songs.length, status = (t) => { $("exportStatus").textContent = t; };
  const wantWav = $("fWav").checked, wantMp3 = $("fMp3").checked;
  if (!wantWav && !wantMp3) { status("Pick at least one format."); return null; }
  player.stop(); $("exportGo").disabled = true; $("encoreGo").disabled = true;
  try {
    const files = [], tracks = [];
    for (let i = 0; i < N; i++) {
      const s = state.songs[i];
      status(`Mastering ${i + 1} of ${N}: ${s.title || `Song ${i + 1}`}...`);
      const res = await masterSong(i, (t) => status(t));
      const tags = { ...meta, title: s.title || `Song ${i + 1}`, track: `${i + 1}/${N}`, isrc: s.isrc };
      const base = trackName(i, s), t = { n: i + 1, title: tags.title, explicit: s.explicit, isrc: s.isrc || null,
        seconds: +(res.l.length / res.fs).toFixed(2), lufs: +res.lufs.toFixed(1), peakDb: +res.peakDb.toFixed(1), files: {} };
      if (wantWav) { const name = `${base}.wav`; files.push({ name, blob: wavFile(res.l, res.r, res.fs, 24, tags, state.art), label: `${base}.wav` }); t.files.wav = name; }
      if (wantMp3) {
        const mp3 = await mp3Of(res.l, res.r, res.fs, (p) => status(`Encoding MP3 ${i + 1} of ${N}... ${p}%`));
        const name = `${base}.mp3`; files.push({ name, blob: new Blob([id3(tags, state.art), mp3], { type: "audio/mpeg" }), label: name }); t.files.mp3 = name;
      }
      tracks.push(t);
    }
    let show = null;
    if ($("fShow").checked) {
      status("Making the full-show file...");
      const prep = await prepare();
      const res = await rpc({ type: "show", source: describeSource(state.src), pieces: pieces(), settings: settings(), learned: prep.learned, rumble: state.rumble,
        bits: 24, meta: { ...meta, title: `${meta.album} (full show)` }, art: state.art }, (p) => status(`Making the full-show file... ${p.pct}%`));
      const name = `${clean(meta.album)} (full show).wav`;
      files.push({ name, blob: res.blob, label: name }); show = { file: name, seconds: +res.seconds.toFixed(1) };
    }
    const st = settings();
    const manifest = {
      kind: "encore-live-release", version: 1, createdWith: "Encore Music Studio Live", createdAt: new Date().toISOString(),
      release: { type: "live", title: meta.album, artist: meta.artist, venue: meta.venue, city: meta.city, date: meta.date || null, year: meta.year,
                 genre: meta.genre || null, cover: state.art ? `cover.${state.art.mime === "image/png" ? "png" : "jpg"}` : null, explicit: tracks.some((t) => t.explicit) },
      tracks, show,
      mastering: { style: STYLES[st.style].name, intensity: st.intensity, targetLufs: st.targetLufs, eq: { ...state.eq }, rumbleFilter: state.rumble, tameHarsh: state.harsh, sharedSettings: true },
    };
    const extra = [{ name: "manifest.json", blob: new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" }) }];
    if (state.art) extra.push({ name: manifest.release.cover, blob: new Blob([state.art.bytes], { type: state.art.mime }) });
    status("Packing the zip...");
    const folder = clean(`${meta.artist ? meta.artist + " - " : ""}${meta.album}`);
    const zipBlob = await zip([...files, ...extra].map((f) => ({ name: `${folder}/${f.name}`, blob: f.blob })));
    $("exportResults").innerHTML = "";
    link(zipBlob, `${folder}.zip`, `Everything (${folder}.zip)`);
    for (const f of files) link(f.blob, f.name, f.label);
    const loudest = Math.max(...tracks.map((t) => t.lufs)), quietest = Math.min(...tracks.map((t) => t.lufs));
    status(`Done. ${N} tracks, ${quietest.toFixed(1)} to ${loudest.toFixed(1)} LUFS (songs keep their live dynamics).`);
    state.outputs = { manifest, files: [...files, ...extra], zip: zipBlob };
    return state.outputs;
  } catch (err) {
    status(`Something went wrong: ${err.message}`); return null;
  } finally { $("exportGo").disabled = false; $("encoreGo").disabled = false; }
}
$("exportGo").addEventListener("click", async () => { if (await exportAll()) showTab("release"); });

// Inside encoremusic.studio the site provides window.EncoreStudio.createLiveRelease
// (see INTEGRATION.md): it uploads the files and opens a new release, ready to price.
$("encoreGo").addEventListener("click", async () => {
  const out = await exportAll(); if (!out) return;
  const hook = window.EncoreStudio?.createLiveRelease;
  if (hook) {
    $("exportStatus").textContent = "Sending to Encore...";
    try { await hook(out.manifest, out.files.map((f) => ({ name: f.name, blob: f.blob }))); $("exportStatus").textContent = "Sent. Finish the sale details on Encore."; }
    catch (err) { $("exportStatus").textContent = `Encore didn't take it: ${err.message}. The files below are ready to upload by hand.`; }
  } else {
    $("exportStatus").textContent = "Running outside the Encore site, so here's the release package instead: the zip has every track, the cover and a manifest.json Encore can read.";
  }
});

// ---------- the Show | Inputs | Sound | Release tabs beside the songs ----------
let currentTab = "show";
function showTab(name) {
  const btn = document.querySelector(`#sidePanel [role=tab][data-tab="${name}"]`);
  if (!btn || btn.classList.contains("hidden")) name = "show";
  currentTab = name;
  for (const b of document.querySelectorAll("#sidePanel [role=tab]")) {
    const on = b.dataset.tab === name;
    b.classList.toggle("on", on); b.setAttribute("aria-selected", on); b.tabIndex = on ? 0 : -1;
  }
  for (const sec of document.querySelectorAll("#sidePanel .tabBody > section")) sec.classList.toggle("show", sec.dataset.tab === name);
  document.querySelector("#sidePanel .tabBody").scrollTop = 0;
  store.set("tab", name);
}
for (const b of document.querySelectorAll("#sidePanel [role=tab]")) {
  b.addEventListener("click", () => showTab(b.dataset.tab));
  b.addEventListener("keydown", (e) => { // arrow keys move between tabs (the WAI-ARIA tabs pattern)
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault(); e.stopPropagation();
    const all = [...document.querySelectorAll("#sidePanel [role=tab]")].filter((x) => !x.classList.contains("hidden")), i = all.indexOf(b);
    const next = e.key === "Home" ? all[0] : e.key === "End" ? all[all.length - 1] : all[(i + (e.key === "ArrowRight" ? 1 : all.length - 1)) % all.length];
    showTab(next.dataset.tab); next.focus();
  });
}

// ---------- go ----------
showTab(store.get("tab") || "show");
setupSound();
show("start");
refreshInputs(false);
refreshSaved();
if (!window.AudioWorkletNode || !navigator.mediaDevices?.getUserMedia) { $("recSupport").textContent = "This browser can't record here. You can still drop a recording."; $("recStart").disabled = true; }
