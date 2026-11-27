// ENCORE. Learning Tracks: the page. Open a score, check the parts, pick yours and play it
// loud (or missing, or alone) at any tempo with a count-in and a loop, then export every
// learning track in one zip. Logic in parts-core.js, sound in parts-audio.js, drawing in parts-roll.js.
import { songFromFile, songFromScore, detectParts, mixLevels, mixTrack, leadIn, countInfo, tonicMidi, trackPlan, zipNames, readmeText,
  barAt, loopTimes, noteName, tempoScale, stemLength, layoutSig } from "./parts-core.js";
import { renderStem, encodeMp3, encodeWav, SOUNDS, PRE, SR } from "./parts-audio.js";
import { drawRoll, hitTest } from "./parts-roll.js";
import { satbOpenXml, barbershopXml } from "./parts-fixtures.js";
import { fromMusicXML, upgrade } from "./compose-core.js";
import { zip } from "./zip.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

// ---------- settings (kept in this browser when it can) ----------
const PREF_KEY = "encore.parts.v1";
const DEFAULTS = { sound: "piano", room: true, othersDb: -12, accompDb: -6, pan: "split", countBars: 1, pipe: "key", countOn: true,
  kinds: { predominant: true, missing: true, alone: false, full: true }, slow: false, slowPct: 75, format: "mp3-192", tab: "open", layouts: {} };
let prefs = { ...DEFAULTS };
try { const d = JSON.parse(localStorage.getItem(PREF_KEY) || "null"); if (d && typeof d === "object") prefs = { ...DEFAULTS, ...d, kinds: { ...DEFAULTS.kinds, ...(d.kinds || {}) }, layouts: d.layouts || {} }; } catch {}
if (!SOUNDS[prefs.sound]) prefs.sound = "piano";
let saveTimer = 0;
const savePrefs = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch {} }, 200); };

// ---------- state ----------
const st = {
  song: null, parts: [], split: {}, focus: 0, kind: "predominant", tempo: 100, pos: 0, view: 0,
  loop: { on: false, a: 0, b: 0 }, playing: false, busy: "", exporting: false,
};
const stemCache = new Map(); // part id | sound | tempo | room | role -> AudioBuffer
let refPeak = new Map();     // tempo key -> full-mix peak (for an even playback level)

// ---------- small UI helpers ----------
let toastTimer = 0;
function toast(msg, ms = 2600) { const t = $("toast"); t.textContent = msg; t.classList.remove("hidden"); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add("hidden"), ms); }
function setBusy(msg) { st.busy = msg || ""; $("busy").textContent = st.busy; $("busy").classList.toggle("hidden", !st.busy); }
function showErr(id, msg) { const e = $(id); e.textContent = msg || ""; e.classList.toggle("hidden", !msg); }

// tabs
function showTab(name) {
  document.querySelectorAll(".tabBar button").forEach((b) => b.classList.toggle("on", b.dataset.tab === name));
  document.querySelectorAll(".tabBody > section").forEach((s) => s.classList.toggle("show", s.dataset.tab === name));
  prefs.tab = name; savePrefs();
}
document.querySelector(".tabBar").addEventListener("click", (e) => { const b = e.target.closest("button[data-tab]"); if (b) showTab(b.dataset.tab); });

// ---------- opening ----------
async function openFile(f) {
  if (!f) return;
  showErr("openErr", "");
  try {
    const bytes = new Uint8Array(await f.arrayBuffer());
    setSong(await songFromFile(f.name, bytes));
    toast(`Opened ${f.name}.`);
  } catch (err) { showErr("openErr", `Couldn't open ${f.name}: ${err.message || err}`); toast("Couldn't open that file.", 3000); showTab("open"); }
}
for (const id of ["fileInput", "fileEmpty"]) $(id).addEventListener("change", (e) => { const f = e.target.files[0]; e.target.value = ""; openFile(f); });
const openXml = (xml, title) => { try { setSong(songFromScore(fromMusicXML(xml), title)); } catch (err) { showErr("openErr", String(err.message || err)); } };
$("sampleEmpty").onclick = () => openXml(satbOpenXml(), "Morning Song");
$("sampleHymn").onclick = () => openXml(satbOpenXml(), "Morning Song");
$("sampleTag").onclick = () => openXml(barbershopXml(), "Sweet Harmony Tag");
// drop a file anywhere on the player
const wrap = $("panel");
wrap.addEventListener("dragover", (e) => { if ([...(e.dataTransfer?.types || [])].includes("Files")) { e.preventDefault(); $("empty").classList.add("drag"); } });
wrap.addEventListener("dragleave", () => $("empty").classList.remove("drag"));
wrap.addEventListener("drop", (e) => { e.preventDefault(); $("empty").classList.remove("drag"); const f = e.dataTransfer?.files?.[0]; if (f) openFile(f); });
// scores saved in ENCORE. Compose (same browser)
function composeScores() { try { const d = JSON.parse(localStorage.getItem("encore.compose.v1") || "null"); return Array.isArray(d?.scores) ? d.scores : []; } catch { return []; } }
function fillCompose() {
  const list = composeScores().filter((s) => s?.parts?.some((p) => p.voices?.some((v) => v.some((e) => !e.rest))));
  $("composeBox").classList.toggle("hidden", !list.length);
  $("composeList").innerHTML = list.sort((a, b) => (b.updated || 0) - (a.updated || 0)).map((s) => `<option value="${esc(s.id)}">${esc(s.title || "Untitled")} (${s.parts.length} ${s.parts.length === 1 ? "part" : "parts"})</option>`).join("");
}
$("composeOpen").onclick = () => {
  const s = composeScores().find((x) => x.id === $("composeList").value);
  if (!s) return;
  try { setSong(songFromScore(upgrade(s), s.title || "Untitled")); toast(`Opened ${s.title || "the score"} from Compose.`); } catch (err) { showErr("openErr", String(err.message || err)); }
};

// ---------- the song and its parts ----------
function setSong(song) {
  stop();
  st.song = song; st.split = {}; stemCache.clear(); refPeak.clear();
  const saved = prefs.layouts[layoutSig(song)];
  if (saved?.split) st.split = { ...saved.split };
  st.parts = detectParts(song, { split: st.split });
  applySaved(saved);
  st.focus = Math.max(0, st.parts.findIndex((p) => p.role === "voice"));
  st.pos = 0; st.view = 0;
  st.loop = { on: false, a: 0, b: Math.min(song.bars.length - 1, 3) };
  $("loopOn").checked = false;
  $("fTitle").value = song.title;
  renderAll();
  prepare();
}
// names, order and roles the singer chose for this score last time
function applySaved(saved) {
  if (!saved) return;
  for (const p of st.parts) { if (saved.names?.[p.id]) p.name = saved.names[p.id]; if (saved.roles?.[p.id]) p.role = saved.roles[p.id]; }
  if (saved.order?.length) st.parts.sort((a, b) => { const i = saved.order.indexOf(a.id), j = saved.order.indexOf(b.id); return (i < 0 ? 99 : i) - (j < 0 ? 99 : j); });
}
function rememberLayout() {
  if (!st.song) return;
  const sig = layoutSig(st.song);
  prefs.layouts[sig] = { names: Object.fromEntries(st.parts.map((p) => [p.id, p.name])), roles: Object.fromEntries(st.parts.map((p) => [p.id, p.role])), order: st.parts.map((p) => p.id), split: st.split, at: Date.now() };
  const keys = Object.keys(prefs.layouts);
  if (keys.length > 30) keys.sort((a, b) => (prefs.layouts[a].at || 0) - (prefs.layouts[b].at || 0)).slice(0, keys.length - 30).forEach((k) => delete prefs.layouts[k]);
  savePrefs();
}
const vocalIdx = () => st.parts.map((p, i) => (p.role === "voice" ? i : -1)).filter((i) => i >= 0);

function renderAll() { renderHead(); renderChips(); renderParts(); renderTransport(); renderExport(); draw(); }
function renderHead() {
  const s = st.song;
  $("songTitle").textContent = s ? s.title : "Learning Tracks";
  $("empty").classList.toggle("hidden", !!s);
  if (!s) { $("songMeta").textContent = "No score open yet"; return; }
  const v = vocalIdx().length;
  $("songMeta").textContent = `${v} ${v === 1 ? "part" : "parts"} · ${s.bars.length} bars · ${Math.round(s.tempo)} BPM · ${fmt(s.length)}`;
}
function renderChips() {
  const box = $("chips");
  if (!st.song) { box.innerHTML = `<button class="chip" disabled>None yet</button>`; return; }
  box.innerHTML = vocalIdx().map((i, k) => `<button class="chip${st.focus === i ? " on" : ""}" data-i="${i}" title="${esc(st.parts[i].name)} (key ${k + 1})"><i style="background:${st.parts[i].color}"></i>${esc(st.parts[i].name)}</button>`).join("")
    + `<button class="chip${st.focus === -1 ? " on" : ""}" data-i="-1" title="Everyone: the full mix (key 0)">Everyone</button>`;
  document.querySelectorAll("#modeSeg button").forEach((b) => { b.classList.toggle("on", st.focus >= 0 && b.dataset.v === st.kind); b.disabled = st.focus < 0; });
  const p = st.parts[st.focus];
  $("mixNote").textContent = st.focus < 0 ? "Full mix: every part" : st.kind === "predominant" ? `${p.name} loud${prefs.pan === "split" ? " (left), the others right" : ""}` : st.kind === "missing" ? `Sing ${p.name} with the others` : `${p.name} only`;
  $("pipePart").disabled = st.focus < 0;
}
$("chips").addEventListener("click", (e) => { const b = e.target.closest(".chip[data-i]"); if (b) setFocus(+b.dataset.i); });
$("modeSeg").addEventListener("click", (e) => { const b = e.target.closest("button[data-v]"); if (b && !b.disabled) { st.kind = b.dataset.v; renderChips(); updateMix(); draw(); } });
function setFocus(i) {
  if (!st.song || (i >= 0 && st.parts[i]?.role !== "voice")) return;
  st.focus = i; renderChips(); updateMix(); draw();
}

function renderParts() {
  const box = $("partList");
  if (!st.song) { box.innerHTML = ""; $("partsTip").textContent = "Open a score first."; return; }
  $("partsTip").textContent = "Rename the parts the way your group says them, put them in order, and set what each staff is. Names go on the files.";
  box.innerHTML = st.parts.map((p, i) => {
    const from = p.split ? `split from "${esc(p.rawName || "one staff")}" (${p.split === "upper" ? "upper" : "lower"} notes)` : "";
    const action = p.split ? `<button class="link" data-act="join" data-i="${i}">Keep together</button>` : p.canSplit && p.role !== "accomp" && st.song.streams.find((s) => s.id === p.stream) && hasTwoNotes(p) ? `<button class="link" data-act="split" data-i="${i}">Split in two</button>` : "";
    return `<div class="prow" data-i="${i}">
      <span class="dot" style="background:${p.color}"></span>
      <input type="text" class="pname" data-i="${i}" value="${esc(p.name)}" maxlength="32" aria-label="Name of part ${i + 1}">
      <select class="prole" data-i="${i}" aria-label="What part ${i + 1} is"><option value="voice"${p.role === "voice" ? " selected" : ""}>Voice part</option><option value="accomp"${p.role === "accomp" ? " selected" : ""}>Accompaniment</option><option value="off"${p.role === "off" ? " selected" : ""}>Leave out</option></select>
      <button class="mini" data-act="up" data-i="${i}" ${i === 0 ? "disabled" : ""} aria-label="Move ${esc(p.name)} up">&#8593;</button>
      <button class="mini" data-act="down" data-i="${i}" ${i === st.parts.length - 1 ? "disabled" : ""} aria-label="Move ${esc(p.name)} down">&#8595;</button>
      <small>${noteName(p.low)} to ${noteName(p.high)} · ${p.events.length} notes${p.lyrics ? " · words" : ""}${from ? " · " + from : ""} ${action}</small>
    </div>`;
  }).join("");
}
const hasTwoNotes = (p) => p.events.some((e, i) => p.events[i + 1] && Math.abs(p.events[i + 1].time - e.time) < 0.02);
$("partList").addEventListener("input", (e) => {
  const inp = e.target.closest(".pname"); if (!inp) return;
  st.parts[+inp.dataset.i].name = inp.value.trim() || `Part ${+inp.dataset.i + 1}`;
  renderChips(); renderExport(); rememberLayout(); draw();
});
$("partList").addEventListener("change", (e) => {
  const sel = e.target.closest(".prole"); if (!sel) return;
  const i = +sel.dataset.i; st.parts[i].role = sel.value;
  if (!st.parts[st.focus] || st.parts[st.focus].role !== "voice") st.focus = vocalIdx()[0] ?? -1;
  refPeak.clear(); afterPartsChange();
});
$("partList").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-act]"); if (!b) return;
  const i = +b.dataset.i, act = b.dataset.act, focusId = st.parts[st.focus]?.id;
  if (act === "up" || act === "down") {
    const j = act === "up" ? i - 1 : i + 1; if (j < 0 || j >= st.parts.length) return;
    [st.parts[i], st.parts[j]] = [st.parts[j], st.parts[i]];
  } else if (act === "join" || act === "split") {
    st.split[st.parts[i].stream] = act === "split";
    const old = st.parts;
    st.parts = detectParts(st.song, { split: st.split });
    for (const p of st.parts) { const o = old.find((x) => x.id === p.id); if (o) { p.name = o.name; p.role = o.role; p.color = o.color; } }
    stemCache.clear(); refPeak.clear();
  }
  st.focus = Math.max(-1, st.parts.findIndex((p) => p.id === focusId));
  if (st.focus >= 0 && st.parts[st.focus].role !== "voice") st.focus = vocalIdx()[0] ?? -1;
  if (st.focus < 0 && vocalIdx().length && focusId) st.focus = vocalIdx()[0];
  afterPartsChange();
});
function afterPartsChange() {
  rememberLayout(); renderHead(); renderChips(); renderParts(); renderExport(); draw();
  if (st.playing) restart(); else prepare();
}

// ---------- sound options ----------
$("fSound").innerHTML = Object.entries(SOUNDS).map(([k, s]) => `<option value="${k}">${s.label}</option>`).join("");
function syncOptions() {
  $("fSound").value = prefs.sound; $("fRoom").checked = prefs.room; $("fOthers").value = prefs.othersDb; $("othersVal").textContent = `${prefs.othersDb} dB`;
  $("fAccomp").value = prefs.accompDb; $("accompVal").textContent = `${prefs.accompDb} dB`; $("fPan").value = prefs.pan; $("fCount").value = String(prefs.countBars); $("fPipe").value = prefs.pipe;
  $("countOn").checked = prefs.countOn; $("kPre").checked = prefs.kinds.predominant; $("kMiss").checked = prefs.kinds.missing; $("kAlone").checked = prefs.kinds.alone; $("kFull").checked = prefs.kinds.full;
  $("fSlow").checked = prefs.slow; $("fSlowPct").value = String(prefs.slowPct); $("fFormat").value = prefs.format;
}
syncOptions();
$("fSound").onchange = () => { prefs.sound = $("fSound").value; savePrefs(); soundChanged(); };
$("fRoom").onchange = () => { prefs.room = $("fRoom").checked; savePrefs(); soundChanged(); };
$("fOthers").oninput = () => { prefs.othersDb = +$("fOthers").value; $("othersVal").textContent = `${prefs.othersDb} dB`; savePrefs(); updateMix(); };
$("fAccomp").oninput = () => { prefs.accompDb = +$("fAccomp").value; $("accompVal").textContent = `${prefs.accompDb} dB`; savePrefs(); updateMix(); };
$("fPan").onchange = () => { prefs.pan = $("fPan").value; savePrefs(); renderChips(); updateMix(); };
$("fCount").onchange = () => { prefs.countBars = +$("fCount").value; savePrefs(); };
$("fPipe").onchange = () => { prefs.pipe = $("fPipe").value; savePrefs(); };
$("countOn").onchange = () => { prefs.countOn = $("countOn").checked; savePrefs(); };
const kindBoxes = { kPre: "predominant", kMiss: "missing", kAlone: "alone", kFull: "full" };
for (const [id, k] of Object.entries(kindBoxes)) $(id).onchange = () => { prefs.kinds[k] = $(id).checked; savePrefs(); renderExport(); };
$("fSlow").onchange = () => { prefs.slow = $("fSlow").checked; savePrefs(); renderExport(); };
$("fSlowPct").onchange = () => { prefs.slowPct = +$("fSlowPct").value; savePrefs(); renderExport(); };
$("fFormat").onchange = () => { prefs.format = $("fFormat").value; savePrefs(); renderExport(); };
$("fTitle").oninput = () => renderExport();
function soundChanged() { refPeak.clear(); if (st.playing) restart(); else prepare(); }
const mixOpts = () => ({ othersDb: prefs.othersDb, accompDb: prefs.accompDb, pan: prefs.pan });

// ---------- stems ----------
const stemKey = (p, tempo) => `${p.id}|${p.role === "accomp" ? "piano" : prefs.sound}|${tempo}|${prefs.room ? 1 : 0}|${p.role}`;
let renderChain = Promise.resolve();
/** Every part's stem at a tempo (rendered once, then kept): [AudioBuffer | null] by part index */
function ensureStems(tempo, label = "Getting the sound ready") {
  const job = renderChain.then(async () => {
    const song = st.song, parts = st.parts.slice();
    if (!song) return [];
    const len = stemLength(song, tempo, SR, 2) + Math.ceil(PRE * SR), out = [];
    const todo = parts.filter((p) => p.role !== "off" && !stemCache.has(stemKey(p, tempo)));
    let done = 0;
    for (const p of parts) {
      if (p.role === "off") { out.push(null); continue; }
      const k = stemKey(p, tempo);
      if (!stemCache.has(k)) {
        if (todo.length > 1 || !stemCache.size) setBusy(`${label} (${done + 1} of ${todo.length})`);
        stemCache.set(k, await renderStem(song, p, { sound: prefs.sound, tempo, room: prefs.room, length: len, sr: SR }));
        done++;
      }
      out.push(stemCache.get(k));
    }
    if (st.song !== song) return [];
    // forget stems for other tempos and sounds (a long song's stems are big): keep this set and the player's
    const keep = new Set(parts.flatMap((p) => [stemKey(p, tempo), stemKey(p, st.tempo)]));
    for (const k of [...stemCache.keys()]) if (!keep.has(k)) stemCache.delete(k);
    if (!st.exporting) setBusy("");
    return out;
  });
  renderChain = job.catch(() => {});
  return job;
}
function peakFor(tempo, stems) {
  const key = `${tempo}|${prefs.sound}|${prefs.room}`;
  if (!refPeak.has(key)) {
    const m = mixTrack(stems.map((b) => (b ? b.getChannelData(0) : null)), mixLevels(st.parts, -1, "full", mixOpts()), { peakDb: null });
    refPeak.set(key, m.peak || 1);
  }
  return refPeak.get(key);
}
let prepTimer = 0;
// get the stems ready in the background so Play starts at once
function prepare() { clearTimeout(prepTimer); if (!st.song) return; prepTimer = setTimeout(() => { ensureStems(st.tempo).catch((e) => toast(`Sound problem: ${e.message || e}`)); }, 60); }

// ---------- playback ----------
let actx = null, live = null, raf = 0, playGen = 0;
function ctx() {
  if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: "interactive", sampleRate: SR });
  if (actx.state === "suspended") actx.resume();
  return actx;
}
async function play() {
  if (!st.song || st.exporting) return;
  const gen = ++playGen, c = ctx();
  st.playing = true; renderTransport();
  let stems;
  try { stems = await ensureStems(st.tempo); } catch (e) { st.playing = false; renderTransport(); toast(`Couldn't make the sound: ${e.message || e}`, 4000); return; }
  if (gen !== playGen || !st.playing || !stems.length) return;
  const song = st.song, k = tempoScale(st.tempo), L = st.loop.on ? loopTimes(song, st.loop.a, st.loop.b) : null;
  let from = st.pos;
  if (L && (from < L.start - 0.01 || from >= L.end - 0.05)) from = L.start;
  if (!L && from >= song.length - 0.05) from = 0;
  // the count-in (one bar at this tempo); from the very top it lands the pickup the way it's written
  const info = countInfo(song, st.tempo);
  const lead = prefs.countOn ? leadIn({ sr: c.sampleRate, beatSec: info.beatSec, beats: info.beats, bars: 1, pipeMidi: null, pickup: from < 0.01 ? info.pickup : 0 }) : null;
  const t0 = c.currentTime + 0.08, startAt = t0 + (lead ? lead.musicStart : 0);
  const master = c.createGain(); master.gain.value = 0.8 / peakFor(st.tempo, stems); master.connect(c.destination);
  const levels = currentLevels(), nodes = [];
  stems.forEach((buf, i) => {
    if (!buf) { nodes.push(null); return; }
    const src = c.createBufferSource(), g = c.createGain(), pan = c.createStereoPanner();
    src.buffer = buf; g.gain.value = levels[i].gain; pan.pan.value = levels[i].pan;
    if (L) { src.loop = true; src.loopStart = PRE + L.start * k; src.loopEnd = PRE + L.end * k; }
    src.connect(g); g.connect(pan); pan.connect(master);
    src.start(startAt, PRE + from * k);
    nodes.push({ src, g, pan });
  });
  let leadSrc = null;
  if (lead) { const b = c.createBuffer(1, lead.samples.length, c.sampleRate); b.copyToChannel(lead.samples, 0); leadSrc = c.createBufferSource(); leadSrc.buffer = b; const lg = c.createGain(); lg.gain.value = 0.6; leadSrc.connect(lg); lg.connect(c.destination); leadSrc.start(t0); }
  live = { nodes, master, leadSrc, startAt, from, k, L, gen };
  tick();
}
function currentLevels() { return mixLevels(st.parts, st.focus, st.focus < 0 ? "full" : st.kind, mixOpts()); }
function updateMix() {
  if (!live) return;
  const lv = currentLevels(), now = actx.currentTime;
  live.nodes.forEach((n, i) => { if (!n || !lv[i]) return; n.g.gain.setTargetAtTime(lv[i].gain, now, 0.03); n.pan.pan.setTargetAtTime(lv[i].pan, now, 0.03); });
}
function songTimeNow() {
  if (!live || !actx) return st.pos;
  const el = actx.currentTime - live.startAt;
  if (el < 0) return live.from;
  let t = live.from + el / live.k;
  if (live.L && t >= live.L.end) t = live.L.start + ((t - live.L.start) % (live.L.end - live.L.start));
  return t;
}
function tick() {
  cancelAnimationFrame(raf);
  if (!live) return;
  const t = songTimeNow();
  st.pos = t;
  if (!live.L && t >= st.song.length + 0.4) { stop(); st.pos = 0; st.view = 0; renderTransport(); draw(); return; }
  followView(); renderPos(); draw();
  raf = requestAnimationFrame(tick);
}
function stopNodes() {
  if (!live) return;
  for (const n of live.nodes) if (n) try { n.src.stop(); n.src.disconnect(); } catch {}
  if (live.leadSrc) try { live.leadSrc.stop(); } catch {}
  try { live.master.disconnect(); } catch {}
  live = null;
}
function stop() {
  playGen++;
  cancelAnimationFrame(raf);
  stopNodes();
  st.playing = false;
  if (st.song) renderTransport();
}
// keep going from the same spot with new stems (a tempo, sound or part change while playing)
function restart() { if (!st.playing) return; const t = songTimeNow(); stopNodes(); st.pos = t; play(); }
function togglePlay() { if (!st.song) return; if (st.playing) { const t = songTimeNow(); stop(); st.pos = t; renderPos(); draw(); } else play(); }
$("playBtn").onclick = togglePlay;
$("toStart").onclick = () => seek(st.loop.on ? loopTimes(st.song, st.loop.a, st.loop.b).start : 0);
function seek(t) {
  if (!st.song) return;
  const was = st.playing;
  if (was) { stopNodes(); }
  st.pos = Math.max(0, Math.min(t, st.song.length - 0.01));
  followView(true); renderPos(); draw();
  if (was) play();
}
// the view scrolls with the playhead (a quarter in from the left)
function followView(force = false) {
  const v = rollView;
  if (!v) return;
  const span = v.span;
  if (force || st.pos < st.view || st.pos > st.view + span * 0.8) st.view = Math.max(0, st.pos - span * 0.2);
}

// ---------- the transport ----------
function renderTransport() {
  const has = !!st.song;
  $("playBtn").disabled = !has || st.exporting; $("toStart").disabled = !has; $("pipeKey").disabled = !has; $("pipePart").disabled = !has || st.focus < 0;
  $("playBtn").textContent = st.playing ? "Stop" : "Play";
  $("tempo").value = st.tempo;
  const bpm = st.song ? Math.round((st.song.tempo * st.tempo) / 100) : null;
  $("tempoVal").textContent = `${st.tempo}%${bpm ? ` · ${bpm} BPM` : ""}`;
  if (has) { const top = Math.max(...st.song.bars.map((b) => b.num)); for (const id of ["loopA", "loopB"]) $(id).max = top; $("loopA").value = st.song.bars[st.loop.a].num; $("loopB").value = st.song.bars[st.loop.b].num; }
  renderPos();
}
function renderPos() {
  if (!st.song) { $("pos").textContent = "Bar 1 · 0:00"; return; }
  const bi = barAt(st.song, st.pos), counting = live && actx && actx.currentTime < live.startAt;
  $("pos").textContent = counting ? "Count-in..." : `Bar ${st.song.bars[bi].num} · ${fmt(st.pos * tempoScale(st.tempo))}`;
}
let tempoTimer = 0;
$("tempo").oninput = () => {
  st.tempo = +$("tempo").value; renderTransport();
  clearTimeout(tempoTimer);
  tempoTimer = setTimeout(() => { if (st.playing) restart(); else prepare(); }, 300);
};
function setLoop(a, b, on = true) {
  if (!st.song) return;
  const n = st.song.bars.length;
  st.loop = { on, a: Math.max(0, Math.min(n - 1, Math.min(a, b))), b: Math.max(0, Math.min(n - 1, Math.max(a, b))) };
  $("loopOn").checked = on; renderTransport(); draw();
  if (st.playing) restart();
}
$("loopOn").onchange = () => { if (!st.song) { $("loopOn").checked = false; return; } setLoop(st.loop.a, st.loop.b, $("loopOn").checked); if (st.loop.on && !st.playing) seek(loopTimes(st.song, st.loop.a, st.loop.b).start); };
// the boxes take printed bar numbers; with repeats, a bar number means its first time through
function playedIndex(num, from = 0) {
  const b = st.song.bars, i = b.findIndex((x, k) => k >= from && x.num === num);
  if (i >= 0) return i;
  const j = b.findIndex((x) => x.num === num);
  return j >= 0 ? j : Math.max(0, Math.min(b.length - 1, num - 1));
}
for (const id of ["loopA", "loopB"]) $(id).onchange = () => {
  if (!st.song) return;
  const a = playedIndex(+$("loopA").value || 1), b = playedIndex(+$("loopB").value || 1, a);
  setLoop(a, b, true);
};

// the pitch pipe: the key note or your first note, like blowing a pipe before the count
function pipe(midi) {
  const c = ctx(), l = leadIn({ sr: c.sampleRate, bars: 0, pipeMidi: midi }), b = c.createBuffer(1, l.samples.length, c.sampleRate);
  b.copyToChannel(l.samples, 0);
  const s = c.createBufferSource(), g = c.createGain(); g.gain.value = 0.9; s.buffer = b; s.connect(g); g.connect(c.destination); s.start();
  toast(`${noteName(midi)}`, 1400);
}
const keyNote = () => tonicMidi(st.song, st.focus >= 0 ? st.parts[st.focus].first : 60, st.parts);
$("pipeKey").onclick = () => { if (st.song) pipe(keyNote()); };
$("pipePart").onclick = () => { if (st.song && st.focus >= 0) pipe(st.parts[st.focus].first); };

// ---------- the roll ----------
const canvas = $("roll");
let rollView = null;
function draw() {
  rollView = drawRoll(canvas, { song: st.song, parts: st.parts, focus: st.focus, kind: st.focus < 0 ? "full" : st.kind, pos: st.pos, view: st.view, playing: st.playing,
    loop: st.song && st.loop.on ? { on: true, ...loopTimes(st.song, st.loop.a, st.loop.b) } : null, dpr: Math.min(2, window.devicePixelRatio || 1) });
  if (rollView) st.view = rollView.start;
}
let drag = null;
canvas.addEventListener("pointerdown", (e) => {
  if (!st.song || !rollView) return;
  const r = canvas.getBoundingClientRect(), h = hitTest(rollView, { song: st.song, parts: st.parts, focus: st.focus }, e.clientX - r.left, e.clientY - r.top);
  if (!h) return;
  if (h.area === "ruler") { drag = { a: h.bar, b: h.bar, moved: false, id: e.pointerId }; try { canvas.setPointerCapture(e.pointerId); } catch {} }
  else if (h.area === "note" && h.part !== st.focus) setFocus(h.part);
});
canvas.addEventListener("pointermove", (e) => {
  if (!drag || !rollView) return;
  const r = canvas.getBoundingClientRect(), t = rollView.toTime(e.clientX - r.left), b = barAt(st.song, Math.max(0, t));
  if (b !== drag.b) { drag.b = b; drag.moved = true; st.loop = { on: true, a: Math.min(drag.a, b), b: Math.max(drag.a, b) }; draw(); }
});
const endDrag = () => {
  if (!drag) return;
  const d = drag; drag = null;
  if (d.moved) setLoop(d.a, d.b, true);
  else seek(st.song.bars[d.a].time);
};
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", () => { drag = null; draw(); });
canvas.addEventListener("wheel", (e) => { if (!st.song || st.playing || !rollView) return; if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey) { e.preventDefault(); st.view = Math.max(0, st.view + ((e.deltaX || e.deltaY) / 600) * rollView.span); draw(); } }, { passive: false });
new ResizeObserver(() => draw()).observe($("rollWrap"));

// ---------- export ----------
function plan() {
  if (!st.song) return [];
  const fmtId = prefs.format, ext = fmtId === "wav" ? "wav" : "mp3";
  const tempos = [st.tempo]; if (prefs.slow && prefs.slowPct !== st.tempo) tempos.push(prefs.slowPct);
  return trackPlan(st.parts, { ...mixOpts(), title: ($("fTitle").value || st.song.title).trim() || "Song", kinds: prefs.kinds, tempos, ext, pipe: prefs.pipe, keyMidi: tonicMidi(st.song, 60, st.parts) });
}
function renderExport() {
  const p = plan();
  if (!st.song) { $("exportSummary").textContent = "Open a score first."; $("fileList").innerHTML = ""; $("exportBtn").disabled = true; return; }
  const secs = p.reduce((a, t) => a + st.song.length * tempoScale(t.tempo) + 3, 0), kbps = prefs.format === "wav" ? 1411 : +prefs.format.split("-")[1];
  const mb = (secs * kbps) / 8 / 1024;
  $("exportSummary").textContent = p.length ? `${p.length} ${p.length === 1 ? "track" : "tracks"}, about ${mb < 1 ? mb.toFixed(1) : Math.round(mb)} MB in one zip.` : "Tick at least one kind of track.";
  $("fileList").innerHTML = p.map((t) => `<li title="${esc(t.file)}">${esc(t.file)}</li>`).join("");
  $("exportBtn").disabled = !p.length || st.exporting;
}
async function exportAll() {
  const p = plan();
  if (!p.length || st.exporting) return;
  stop();
  st.exporting = true; renderTransport(); renderExport(); showErr("exportErr", "");
  const prog = $("exportProg"), bar = prog.querySelector("i"); prog.classList.remove("hidden"); bar.style.width = "0%";
  const status = (s) => { $("exportStatus").textContent = s; };
  try {
    const title = ($("fTitle").value || st.song.title).trim() || "Song", names = zipNames(title), entries = [];
    const tempos = [...new Set(p.map((t) => t.tempo))], stemsBy = new Map();
    for (const tempo of tempos) { status(`Getting the sound ready${tempo !== 100 ? ` at ${tempo}%` : ""}...`); stemsBy.set(tempo, (await ensureStems(tempo, "Getting the sound ready")).map((b) => (b ? b.getChannelData(0) : null))); }
    setBusy("");
    for (let i = 0; i < p.length; i++) {
      const t = p[i], stems = stemsBy.get(t.tempo), info = countInfo(st.song, t.tempo);
      status(`Making ${i + 1} of ${p.length}: ${t.label}${t.tempo !== 100 ? ` (${t.tempo}%)` : ""}`);
      const lead = leadIn({ sr: SR, beatSec: info.beatSec, beats: info.beats, bars: prefs.countBars, pipeMidi: t.pipeMidi, pickup: info.pickup });
      const offset = Math.max(0, Math.round((lead.musicStart - PRE) * SR)), len = offset + Math.max(...stems.map((s) => (s ? s.length : 0)));
      const m = mixTrack(stems, t.levels, { offset, leadIn: lead.samples, length: len, peakDb: -1 });
      const blob = prefs.format === "wav" ? encodeWav(m.l, m.r, SR) : await encodeMp3(m.l, m.r, SR, +prefs.format.split("-")[1], (f) => { bar.style.width = `${((i + f) / (p.length + 0.5)) * 100}%`; });
      entries.push({ name: `${names.folder}/${t.file}`, blob });
      bar.style.width = `${((i + 1) / (p.length + 0.5)) * 100}%`;
      await new Promise((r) => setTimeout(r, 0));
    }
    entries.push({ name: `${names.folder}/readme.txt`, blob: new Blob([readmeText(title, p, st.parts, mixOpts())], { type: "text/plain" }) });
    status("Packing the zip...");
    const z = await zip(entries);
    const a = document.createElement("a"); a.href = URL.createObjectURL(z); a.download = names.zip; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 8000);
    bar.style.width = "100%";
    status(`Done: ${p.length} tracks in "${names.zip}".`);
    window.__partsExport = { zip: names.zip, files: entries.map((e) => e.name), sizes: entries.map((e) => e.blob.size) };
  } catch (err) {
    showErr("exportErr", `The export stopped: ${err.message || err}`); status("");
  } finally {
    st.exporting = false; setBusy(""); renderTransport(); renderExport();
    setTimeout(() => prog.classList.add("hidden"), 1500);
  }
}
$("exportBtn").onclick = exportAll;

// ---------- keys ----------
document.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const tag = e.target.tagName;
  if (tag === "INPUT" && !["checkbox", "range", "radio"].includes(e.target.type) || tag === "SELECT" || tag === "TEXTAREA") return;
  if (!st.song) return;
  if (e.code === "Space") { e.preventDefault(); togglePlay(); }
  else if (/^Digit[0-9]$/.test(e.code)) { const n = +e.code.slice(5), v = vocalIdx(); if (n === 0) setFocus(-1); else if (v[n - 1] !== undefined) setFocus(v[n - 1]); }
  else if (e.key === "l" || e.key === "L") { $("loopOn").checked = !st.loop.on; $("loopOn").onchange(); }
  else if (e.key === "Home") { e.preventDefault(); $("toStart").onclick(); }
  else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
    if (tag === "INPUT") return;
    e.preventDefault();
    const bi = barAt(st.song, st.pos), to = Math.max(0, Math.min(st.song.bars.length - 1, bi + (e.key === "ArrowRight" ? 1 : st.pos - st.song.bars[bi].time > 0.3 ? 0 : -1)));
    seek(st.song.bars[to].time);
  }
});

// ---------- start ----------
fillCompose();
showTab(["open", "parts", "sound", "export", "help"].includes(prefs.tab) ? prefs.tab : "open");
renderAll();
window.addEventListener("storage", (e) => { if (e.key === "encore.compose.v1") fillCompose(); });
// for tests: a snapshot of what the page holds
window.__parts = () => ({
  title: st.song?.title || null, bars: st.song?.bars.length || 0, parts: st.parts.map((p) => ({ name: p.name, role: p.role, split: p.split, notes: p.events.length, lyrics: p.lyrics })),
  focus: st.focus, kind: st.kind, tempo: st.tempo, pos: st.pos, playing: st.playing, loop: { ...st.loop }, busy: st.busy, exporting: st.exporting, stems: stemCache.size,
  levels: st.song ? currentLevels() : [], plan: plan().map((t) => t.file), audioTime: actx ? actx.currentTime : 0,
});
