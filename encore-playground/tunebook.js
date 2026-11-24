// ENCORE. Tune Book: the page. A tune library in ABC notation with live sheet music (abcjs, loaded by
// the page as window.ABCJS), playback on recorded instruments with backing from the chord symbols,
// loops (whole tune, a part, or picked notes) with a gradual speed-up, sets played back to back,
// transposing, import/export of .abc files and a printable tune book. Everything stays on the device.
import * as C from "./tunebook-core.js";
import { STARTER_TUNES, STARTER_SETS } from "./tunebook-tunes.js";
import { createSound, MELODY_INSTRUMENTS, BACKINGS } from "./tunebook-sound.js";

const A = window.ABCJS;
const $ = (id) => document.getElementById(id);
const KEY = "encore-tunebook-v1";
const sound = createSound();

// ---------- saving (the page keeps working if storage is blocked) ----------
const store = {
  get() { try { return localStorage.getItem(KEY); } catch { return null; } },
  set(v) { try { localStorage.setItem(KEY, v); return true; } catch { return false; } },
};
let lib, prefs, saveTimer = 0;
const DEFAULT_PREFS = { inst: "accordion", backing: "oompah", click: false, countIn: true, swing: 0, practice: { on: false, from: 60, to: 100, step: 5, every: 2 }, current: null, setId: null, bookTitle: "My tune book", tab: "book" };
function starterLibrary() {
  const l = C.emptyLibrary();
  for (const t of STARTER_TUNES) C.addTune(l, t.abc, { tags: t.tags });
  for (const s of STARTER_SETS) {
    const ids = s.titles.map((ti) => l.tunes.find((t) => C.parseHeader(t.abc).title === ti)?.id).filter(Boolean);
    C.addSet(l, s.name, ids, { times: 2 });
  }
  return l;
}
function load() {
  let saved = null;
  try { const raw = store.get(); saved = raw ? JSON.parse(raw) : null; } catch { saved = null; }
  lib = saved && saved.lib ? C.deserialize(saved.lib) : null;
  if (!lib || (!lib.tunes.length && !(saved && saved.emptied))) lib = starterLibrary();
  const p = (saved && saved.prefs) || {};
  prefs = { ...DEFAULT_PREFS, ...p, practice: { ...DEFAULT_PREFS.practice, ...(p.practice || {}) } };
  if (!MELODY_INSTRUMENTS.some((i) => i.id === prefs.inst)) prefs.inst = DEFAULT_PREFS.inst;
  if (!BACKINGS.some((b) => b.id === prefs.backing)) prefs.backing = DEFAULT_PREFS.backing;
}
function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 250); }
function saveNow() { clearTimeout(saveTimer); store.set(JSON.stringify({ lib: JSON.parse(C.serialize(lib)), prefs, emptied: !lib.tunes.length })); }
addEventListener("pagehide", saveNow);

// ---------- the open tune ----------
const cur = { id: null, display: "", visual: null, tl: [], parts: [], meter: "4/4", pickup: 0, sel: null, warnings: [], opened: "", noteEls: new Map() };
const tune = () => C.getTune(lib, cur.id);

function openTune(id, { keepTempo = false, fromPlayer = false } = {}) {
  const t = C.getTune(lib, id);
  if (!t) { cur.id = null; renderTune(); return; }
  if (!fromPlayer && player) stop();
  const changed = cur.id !== id;
  cur.id = id; prefs.current = id;
  if (changed) { cur.opened = t.abc; cur.sel = null; }
  renderTune();
  if (changed && !keepTempo) setBpm(C.defaultBpm(t));
  if (!fromPlayer) { fillEditor(); renderList(); renderSet(); }
  saveSoon();
}
function renderTune() {
  const t = tune();
  clearHighlight();
  if (!t) {
    $("paper").innerHTML = ""; $("paperEmpty").classList.remove("hidden");
    $("tuneTitle").textContent = "Tune Book"; $("tuneMeta").textContent = ""; $("keyLbl").textContent = "-";
    cur.visual = null; cur.tl = []; cur.parts = []; fillLoop(); return;
  }
  $("paperEmpty").classList.add("hidden");
  const tr = C.transposeAbc(A, t.abc, t.transpose);
  cur.display = tr.abc;
  let vis = null;
  try {
    // narrow screens: a narrower staff (the tune keeps its own line breaks) so the notes stay big enough to read and tap
    const narrow = narrowPaper();
    vis = A.renderAbc("paper", cur.display, { add_classes: true, responsive: "resize", staffwidth: narrow ? 540 : 760, paddingtop: 8, paddingbottom: 10, paddingleft: narrow ? 4 : 10, paddingright: narrow ? 4 : 10,
      clickListener: onNoteClick, selectionColor: "#ff3b00", dragging: false, foregroundColor: "#1c1917", format: { gchordfont: "DM Sans 12", titlefont: "DM Sans 20", subtitlefont: "DM Sans 14", composerfont: "DM Sans 12" } })[0];
  } catch { vis = null; }
  cur.visual = vis || null;
  cur.warnings = (vis && vis.warnings) || [];
  const h = C.parseHeader(cur.display);
  cur.meter = h.meter || "4/4";
  try { cur.tl = vis ? C.timelineFrom(vis.setUpAudio({})) : []; } catch { cur.tl = []; }
  cur.parts = C.partsOf(cur.display);
  cur.pickup = C.pickupLength(cur.tl, cur.meter, cur.display);
  indexNotes();
  if (cur.sel && !C.rangeForChars(cur.tl, cur.sel.c0, cur.sel.c1)) cur.sel = null;
  showSelection();
  const base = C.parseHeader(t.abc);
  $("tuneTitle").textContent = base.title;
  const type = C.typeById(base.type).name, keyShown = h.key || base.key || "?";
  const hasChords = cur.tl.some((e) => e.track !== "melody");
  $("tuneMeta").textContent = [type, keyShown + (t.transpose ? ` (written in ${base.key || "?"})` : ""), base.meter || "", cur.parts.length > 1 ? cur.parts.map((p) => p.label).join("") + " parts" : "", hasChords ? "" : "no chords"].filter(Boolean).join(" · ");
  $("keyLbl").textContent = (keyShown.split(" ")[0] || "?") + (t.transpose ? ` ${t.transpose > 0 ? "+" : ""}${t.transpose}` : "");
  fillLoop();
  showWarnings();
  sound.prepare(prefs.inst, cur.tl.filter((e) => e.track === "melody")).catch(() => {});
}
function narrowPaper() { const w = $("paperWrap").clientWidth || innerWidth; return w < 560; }
let wasNarrow = null;
addEventListener("resize", () => { const n = narrowPaper(); if (wasNarrow !== null && n !== wasNarrow && cur.id && !player) renderTune(); wasNarrow = n; });
// note elements by source character, for highlighting while playing and for picked notes
function indexNotes() {
  cur.noteEls = new Map();
  if (!cur.visual) return;
  for (const e of cur.tl) {
    if (e.track !== "melody" || cur.noteEls.has(e.c0)) continue;
    let els = [];
    try { const ab = cur.visual.getElementFromChar(e.c0); const set = ab && (ab.abselem ? ab.abselem.elemset : ab.elemset); if (set) els = [...set].filter(Boolean); } catch {}
    cur.noteEls.set(e.c0, els);
  }
}
function setClass(c0, cls, on) { for (const el of cur.noteEls.get(c0) || []) el.classList?.toggle(cls, on); }
let lit = null;
function highlight(c0) {
  if (lit === c0) return;
  if (lit !== null) setClass(lit, "tbNow", false);
  lit = c0;
  if (c0 === null) return;
  setClass(c0, "tbNow", true);
  // keep the playing note in view
  const el = (cur.noteEls.get(c0) || [])[0], wrap = $("paperWrap");
  if (el && el.getBoundingClientRect) {
    const r = el.getBoundingClientRect(), w = wrap.getBoundingClientRect();
    if (r.bottom > w.bottom - 20 || r.top < w.top + 10) wrap.scrollTop += r.top - w.top - w.height * 0.3;
  }
}
function clearHighlight() { highlight(null); }
function showSelection() {
  for (const els of cur.noteEls.values()) for (const el of els) el.classList?.remove("tbSel");
  if (!cur.sel) return;
  for (const c0 of cur.noteEls.keys()) if (c0 >= cur.sel.c0 && c0 < cur.sel.c1) setClass(c0, "tbSel", true);
}
function onNoteClick(el, tuneNumber, classes, analysis, drag, ev) {
  if (!el || el.el_type !== "note" || typeof el.startChar !== "number" || !cur.visual) return;
  const c0 = el.startChar, c1 = el.endChar;
  const s = cur.sel;
  if (s && s.single && s.c0 === c0 && !(ev && ev.shiftKey)) cur.sel = null; // the same note again clears
  else if (s && (s.single || (ev && ev.shiftKey))) cur.sel = { c0: Math.min(s.a0, c0), c1: Math.max(s.a1, c1), a0: Math.min(s.a0, c0), a1: Math.max(s.a1, c1), single: false };
  else cur.sel = { c0, c1, a0: c0, a1: c1, single: true };
  showSelection();
  fillLoop(cur.sel ? "sel" : null);
  // hear the note when nothing's playing
  const ev0 = cur.tl.find((e) => e.track === "melody" && e.c0 === c0);
  if (ev0 && !player) { sound.begin(); sound.play(prefs.inst, { midi: ev0.midi, vel: 90, time: sound.now() + 0.01, dur: 0.4 }); }
  // jump to it in the editor (only when the text shown is the text typed)
  const t = tune();
  if (t && !t.transpose && tabNow === "edit") { const ta = $("abcText"); try { ta.setSelectionRange(cur.sel ? cur.sel.c0 : c0, cur.sel ? cur.sel.c1 : c1); } catch {} }
  status(cur.sel ? (cur.sel.single ? "Picked a note. Click another to loop everything between them." : "Picked notes. Play loops them (choose Loop my notes).") : "Picked notes cleared.");
}
function clearSel() { if (!cur.sel) return; cur.sel = null; showSelection(); fillLoop(); }

function fillLoop(want) {
  const sel = $("loopSel"), was = want || sel.value || "once";
  const opts = [["once", "The tune once"], ["all", "Loop the whole tune"], ...(cur.parts.length > 1 ? cur.parts.map((p) => [p.label, `Loop part ${p.label}`]) : []), ["sel", cur.sel ? "Loop my notes" : "Loop my notes (pick some first)"]];
  sel.innerHTML = opts.map(([v, l]) => `<option value="${v}"${v === "sel" && !cur.sel ? " disabled" : ""}>${l}</option>`).join("");
  sel.value = opts.some(([v]) => v === was) && !(was === "sel" && !cur.sel) ? was : "once";
}
function showWarnings() {
  const w = $("warnings");
  const t = tune();
  if (!t) { w.textContent = ""; return; }
  if (!cur.warnings.length) { w.textContent = cur.tl.length ? "Reads fine." : "No notes yet."; w.classList.toggle("ok", !!cur.tl.length); return; }
  w.classList.remove("ok");
  const first = String(cur.warnings[0]).replace(/<[^>]+>/g, "").replace(/^Music Line:(\d+):(\d+):\s*/, "line $1: ").replace(/\s+/g, " ").slice(0, 160);
  w.textContent = `${cur.warnings.length} thing${cur.warnings.length > 1 ? "s" : ""} to check: ${first}`;
}

// ---------- tempo ----------
let bpm = 120;
function setBpm(v) {
  bpm = Math.max(30, Math.min(320, Math.round(+v || 120)));
  $("bpm").value = bpm; $("bpmVal").textContent = bpm;
  const beat = C.beatOf(cur.meter);
  $("bpmNote").textContent = beat === 3 / 8 ? "(dotted quarter)" : beat === 1 / 2 ? "(half note)" : beat === 1 / 8 ? "(eighth)" : "";
  if (player) player.retime();
  const t = tune();
  if (t) { t.bpm = bpm === C.defaultBpm({ abc: t.abc }) ? null : bpm; saveSoon(); }
}

// ---------- playing ----------
let player = null;
const spwFor = (ps) => C.secondsPerWhole(bpm * (ps.speed || 100) / 100, ps.meter);
/** Everything one tune contributes to playback: its timeline (swing applied), click grid, parts */
function prepared(t, display, visual) {
  const v = visual || A.parseOnly(display)[0];
  const h = C.parseHeader(display), meter = h.meter || "4/4";
  let tl = []; try { tl = C.timelineFrom(v.setUpAudio({})); } catch {}
  const pickup = C.pickupLength(tl, meter, display);
  const swing = C.swingFits(meter) ? prefs.swing / 100 : 0;
  const played = swing ? C.applySwing(tl, swing, 1 / 4, pickup) : tl;
  return { id: t.id, display, meter, pickup, tl, played, swing, parts: C.partsOf(display), len: C.melodyEnd(tl) };
}
function passFrom(p, w0, w1, extra = {}) {
  const warp = (w) => (p.swing ? C.swingWarp(w, p.swing, 1 / 4, p.pickup) : w);
  const a = warp(w0), b = warp(w1);
  const events = C.sliceTimeline(p.played, a, b);
  const grid = C.beatGrid(b + 1e-6, p.meter, p.pickup).filter((g) => g.w >= w0 - 1e-9 && g.w < w1 - 1e-9).map((g) => ({ w: warp(g.w) - a, accent: g.accent, click: true }));
  const items = [...events, ...grid].sort((x, y) => x.w - y.w);
  return { id: p.id, meter: p.meter, len: b - a, items, speed: 100, ...extra };
}
function startTune() {
  const t = tune();
  if (!t || !cur.tl.length) { status(t ? "No notes to play yet." : "Open a tune first."); return; }
  const loop = $("loopSel").value, once = loop === "once";
  const p = prepared(t, cur.display, cur.visual);
  const r = once ? C.loopRange(p.tl, p.parts, "all") : C.loopRange(p.tl, p.parts, loop, cur.sel);
  if (!r) { status("Pick some notes to loop first: click one note, then another."); return; }
  const base = passFrom(p, r.w0, r.w1);
  const pr = prefs.practice, speedUp = pr.on && !once;
  const label = once ? "" : loop === "all" ? "Looping the tune" : loop === "sel" ? "Looping your notes" : `Looping part ${loop}`;
  begin((i) => (once && i > 0 ? null : { ...base, speed: speedUp ? C.speedForPass(i, pr) : 100, label, pass: i }));
}
function startSet() {
  const s = C.getSet(lib, prefs.setId), ts = C.setTunes(lib, s);
  if (!ts.length) { status("This set has no tunes yet."); return; }
  const list = [];
  for (const t of ts) {
    const display = C.transposeAbc(A, t.abc, t.transpose).abc;
    const p = prepared(t, display, null);
    if (!p.tl.length) continue;
    const whole = passFrom(p, 0, p.len);
    for (let k = 0; k < s.times; k++) list.push({ ...whole, label: `${s.name}: ${C.parseHeader(t.abc).title}, ${k + 1} of ${s.times}`, set: true });
  }
  if (!list.length) { status("Nothing in this set has notes to play."); return; }
  if (list[0].id !== cur.id) openTune(list[0].id, { keepTempo: true });
  begin((i) => list[i] || null);
}
function begin(passFor) {
  stop();
  const first = passFor(0);
  if (!first) return;
  sound.end(); sound.begin();
  const c = sound.ctx;
  let t = c.currentTime + 0.15;
  const back = BACKINGS.find((b) => b.id === prefs.backing) || BACKINGS[0];
  if (prefs.countIn) {
    const spw = spwFor(first), beat = C.beatOf(first.meter), n = Math.max(1, Math.round(C.barOf(first.meter) / beat));
    for (let k = 0; k < n; k++) sound.click(t + k * beat * spw, k === 0, 0.7);
    t += n * beat * spw;
  }
  const pl = { passFor, cur: null, qi: 0, index: 0, nextStart: t, starts: [], hl: [], ended: false, timer: 0, shownPass: null, scheduled: 0, back };
  pl.pump = () => {
    if (player !== pl) return;
    const now = c.currentTime, horizon = now + 0.25;
    for (;;) {
      if (!pl.cur || pl.qi >= pl.cur.items.length) {
        if (pl.ended || pl.nextStart > horizon) break;
        const ps = pl.passFor(pl.index);
        if (!ps) { pl.ended = true; break; }
        pl.cur = { ...ps, start: pl.nextStart, spw: spwFor(ps) };
        pl.qi = 0; pl.index++;
        pl.nextStart = pl.cur.start + pl.cur.len * pl.cur.spw;
        pl.starts.push(pl.cur);
      }
      const it = pl.cur.items[pl.qi], when = pl.cur.start + it.w * pl.cur.spw;
      if (when > horizon) break;
      pl.qi++;
      if (when < now - 0.05) continue;
      if (it.click) { if (prefs.click) sound.click(when, it.accent); continue; }
      const dur = it.dw * pl.cur.spw;
      if (it.track === "melody") { sound.play(prefs.inst, { midi: it.midi, vel: it.vel, time: when, dur: Math.max(0.05, dur * 0.94) }); pl.hl.push({ t: when, c0: it.c0, id: pl.cur.id }); pl.scheduled++; }
      else if (pl.back.bass && it.track === "bass") sound.play(pl.back.bass, { midi: it.midi, vel: Math.min(110, it.vel + 30), time: when, dur: Math.max(0.05, dur * 0.85) }, 0.75);
      else if (pl.back.chord && it.track === "chord") sound.play(pl.back.chord, { midi: it.midi, vel: Math.min(100, it.vel + 25), time: when, dur: Math.max(0.05, dur * 0.8) }, 0.42);
    }
    if (pl.ended && now > pl.nextStart + 0.4) { stop(); status("Done."); return; }
    pl.timer = setTimeout(pl.pump, 40);
  };
  // a tempo change while playing: keep the place, change the speed from here
  pl.retime = () => {
    if (!pl.cur) { return; }
    const now = c.currentTime, pos = Math.max(0, (now - pl.cur.start) / pl.cur.spw), spw = spwFor(pl.cur);
    pl.cur.start = now - pos * spw; pl.cur.spw = spw;
    pl.nextStart = pl.cur.start + pl.cur.len * spw;
  };
  player = pl;
  $("playBtn").textContent = "Stop";
  $("playSet").textContent = "Stop";
  pl.pump();
  requestAnimationFrame(frame);
}
function stop() {
  if (!player) return;
  const pl = player; player = null;
  clearTimeout(pl.timer);
  sound.end();
  clearHighlight();
  $("playBtn").textContent = "Play";
  $("playSet").textContent = "Play the set";
}
function frame() {
  const pl = player;
  if (!pl) return;
  const now = sound.ctx.currentTime;
  // which pass is sounding: switch the sheet music in a set, show the speed
  while (pl.starts.length > 1 && pl.starts[1].start <= now) pl.starts.shift();
  const ps = pl.starts[0];
  if (ps && ps.start <= now && pl.shownPass !== ps) {
    pl.shownPass = ps;
    if (ps.id !== cur.id) { openTune(ps.id, { keepTempo: true, fromPlayer: true }); renderList(); renderSet(); }
    const spd = ps.speed !== 100 ? ` · ${ps.speed}% (${Math.round(bpm * ps.speed / 100)} BPM)` : "";
    status((ps.label || "Playing") + (ps.label && !ps.set ? ` · pass ${ps.pass + 1}` : "") + spd);
  }
  while (pl.hl.length > 1 && pl.hl[1].t <= now) pl.hl.shift();
  const h = pl.hl[0];
  if (h && h.t <= now && h.id === cur.id) highlight(h.c0);
  requestAnimationFrame(frame);
}
function togglePlay() { if (player) { stop(); status(""); } else startTune(); }

// ---------- the book list ----------
let shown = [];
function renderList() {
  const q = $("q").value, type = $("typeSel").value, tag = $("tagSel").value;
  shown = C.search(lib, q, { type, tag });
  const ul = $("tuneList");
  ul.innerHTML = "";
  for (const t of shown) {
    const h = C.parseHeader(t.abc);
    const li = document.createElement("li"), b = document.createElement("button");
    b.dataset.id = t.id; if (t.id === cur.id) b.className = "on";
    const s1 = document.createElement("span"); s1.className = "t"; s1.textContent = h.title;
    const s2 = document.createElement("span"); s2.className = "m"; s2.textContent = `${C.typeById(h.type).name} · ${(h.key || "?").split(" ")[0]}${t.transpose ? " (moved)" : ""}`;
    b.append(s1, s2); li.append(b); ul.append(li);
  }
  $("listCount").textContent = `${shown.length} of ${lib.tunes.length} tune${lib.tunes.length === 1 ? "" : "s"}`;
}
function fillFilters() {
  const counts = C.typeCounts(lib), ts = $("typeSel"), was = ts.value;
  ts.innerHTML = `<option value="">All types</option>` + C.TYPES.filter((t) => counts[t.id]).map((t) => `<option value="${t.id}">${t.name} (${counts[t.id]})</option>`).join("");
  ts.value = [...ts.options].some((o) => o.value === was) ? was : "";
  const tg = $("tagSel"), wasT = tg.value;
  tg.innerHTML = `<option value="">All tags</option>`;
  for (const { tag, count } of C.allTags(lib)) { const o = document.createElement("option"); o.value = tag; o.textContent = `${tag} (${count})`; tg.append(o); }
  tg.value = [...tg.options].some((o) => o.value === wasT) ? wasT : "";
}
$("tuneList").addEventListener("click", (e) => { const b = e.target.closest("button[data-id]"); if (b) openTune(b.dataset.id); });
$("q").addEventListener("input", renderList);
$("typeSel").addEventListener("change", renderList);
$("tagSel").addEventListener("change", renderList);
const TEMPLATE = `X:1
T:New tune
R:polka
M:2/4
L:1/8
K:D
|:"D"d2 fd|"A"cB AF|"D"DF Ad|"A"cA "D"d2:|
|:"G"BG Bd|"D"AF Ad|"G"BG "A"Ac|"D"d2 d2:|`;
$("newTune").addEventListener("click", () => {
  const t = C.addTune(lib, TEMPLATE, { tags: [] });
  fillFilters(); openTune(t.id); setTab("edit");
  const ta = $("abcText"); const at = ta.value.indexOf("New tune"); try { ta.focus(); ta.setSelectionRange(at, at + 8); } catch {}
  status("New tune added. Type over the example.");
});

// ---------- the editor ----------
let editTimer = 0;
function fillEditor() {
  const t = tune();
  $("abcText").value = t ? t.abc : "";
  $("abcText").disabled = !t;
  $("tagsIn").value = t ? t.tags.join(", ") : "";
  $("undoBtn").disabled = !t || t.abc === cur.opened;
  $("keepKey").disabled = !t || !t.transpose;
  const ra = $("readAs");
  ra.value = t ? (C.READ_AS.find((r) => r.steps === t.transpose)?.id || "custom") : "concert";
  if (ra.value === "" ) ra.value = "custom";
}
$("abcText").addEventListener("input", () => {
  clearTimeout(editTimer);
  editTimer = setTimeout(() => {
    const t = tune(); if (!t) return;
    const was = C.parseHeader(t.abc);
    C.updateTune(lib, t.id, { abc: $("abcText").value });
    if (player) stop();
    renderTune();
    const now = C.parseHeader(t.abc);
    if (now.title !== was.title || now.type !== was.type || now.key !== was.key) { renderList(); renderSet(); fillFilters(); }
    $("undoBtn").disabled = t.abc === cur.opened;
    saveSoon();
  }, 220);
});
// picking text in the editor picks those notes for a loop
function editorPick() {
  const t = tune(), ta = $("abcText");
  if (!t || t.transpose || ta.selectionStart === ta.selectionEnd) return;
  const c0 = ta.selectionStart, c1 = ta.selectionEnd;
  if (!C.rangeForChars(cur.tl, c0, c1)) return;
  cur.sel = { c0, c1, a0: c0, a1: c1, single: false };
  showSelection(); fillLoop("sel");
}
$("abcText").addEventListener("mouseup", editorPick);
$("abcText").addEventListener("keyup", (e) => { if (e.shiftKey) editorPick(); });
$("tagsIn").addEventListener("change", () => { const t = tune(); if (!t) return; C.updateTune(lib, t.id, { tags: $("tagsIn").value }); $("tagsIn").value = t.tags.join(", "); fillFilters(); renderList(); saveSoon(); });
$("undoBtn").addEventListener("click", () => { const t = tune(); if (!t) return; C.updateTune(lib, t.id, { abc: cur.opened }); renderTune(); fillEditor(); renderList(); fillFilters(); saveSoon(); status("Back to how it was when you opened it."); });
$("readAs").innerHTML = C.READ_AS.map((r) => `<option value="${r.id}">${r.name}</option>`).join("") + `<option value="custom" disabled>Moved by hand</option>`;
$("readAs").addEventListener("change", () => { const r = C.READ_AS.find((x) => x.id === $("readAs").value); if (r) transpose(r.steps, true); });
$("keepKey").addEventListener("click", () => {
  const t = tune(); if (!t || !t.transpose) return;
  C.updateTune(lib, t.id, { abc: cur.display, transpose: 0 });
  renderTune(); fillEditor(); renderList(); saveSoon();
  status("The ABC is now written in this key.");
});
$("dupBtn").addEventListener("click", () => {
  const t = tune(); if (!t) return;
  const h = C.parseHeader(t.abc);
  const copy = C.addTune(lib, C.setField(t.abc, "T", h.title + " (copy)"), { tags: t.tags, transpose: t.transpose });
  fillFilters(); openTune(copy.id); status("Copy made. Change it all you like.");
});
$("delBtn").addEventListener("click", () => {
  const t = tune(); if (!t) return;
  const title = C.parseHeader(t.abc).title;
  if (!confirm(`Delete "${title}" from your book? It's also taken out of any sets.`)) return;
  const at = shown.findIndex((x) => x.id === t.id);
  C.removeTune(lib, t.id);
  fillFilters(); renderList();
  const next = shown[Math.min(at, shown.length - 1)] || lib.tunes[0];
  if (next) openTune(next.id); else { cur.id = null; renderTune(); fillEditor(); }
  renderSet(); saveSoon();
  status(`Deleted "${title}".`);
});

// ---------- transposing ----------
function transpose(to, absolute = false) {
  const t = tune(); if (!t) return;
  const steps = C.clampSteps(absolute ? to : t.transpose + to);
  if (steps === t.transpose) return;
  if (player) stop();
  C.updateTune(lib, t.id, { transpose: steps });
  cur.sel = null;
  renderTune(); fillEditor(); renderList(); saveSoon();
}
$("tUp").addEventListener("click", () => transpose(1));
$("tDown").addEventListener("click", () => transpose(-1));

// ---------- sets ----------
function renderSet() {
  const sel = $("setSel");
  if (!C.getSet(lib, prefs.setId)) prefs.setId = lib.sets[0]?.id || null;
  sel.innerHTML = "";
  for (const s of lib.sets) { const o = document.createElement("option"); o.value = s.id; o.textContent = `${s.name} (${s.ids.length})`; sel.append(o); }
  sel.value = prefs.setId || "";
  const s = C.getSet(lib, prefs.setId);
  $("setBody").classList.toggle("hidden", !s);
  $("noSets").classList.toggle("hidden", !!s);
  $("delSet").disabled = !s;
  if (!s) return;
  if (document.activeElement !== $("setName")) $("setName").value = s.name;
  $("setTimes").value = String(s.times);
  const ol = $("setList"); ol.innerHTML = "";
  C.setTunes(lib, s).forEach((t, i, all) => {
    const li = document.createElement("li");
    const n = document.createElement("span"); n.className = "n"; n.textContent = i + 1;
    const b = document.createElement("button"); b.className = "t" + (t.id === cur.id ? " on" : ""); b.dataset.open = t.id;
    const h = C.parseHeader(t.abc); b.textContent = `${h.title}  ·  ${C.typeById(h.type).name}, ${(h.key || "?").split(" ")[0]}`;
    const mk = (txt, act, label, dis) => { const x = document.createElement("button"); x.className = "ib"; x.innerHTML = txt; x.dataset.act = act; x.dataset.i = i; x.title = label; x.setAttribute("aria-label", label); x.disabled = !!dis; return x; };
    li.append(n, b, mk("&uarr;", "up", "Move up", i === 0), mk("&darr;", "down", "Move down", i === all.length - 1), mk("&times;", "rm", "Take out of the set"));
    ol.append(li);
  });
  $("setAddCur").disabled = !tune() || s.ids.includes(cur.id);
}
$("setSel").addEventListener("change", () => { prefs.setId = $("setSel").value; renderSet(); saveSoon(); });
$("setList").addEventListener("click", (e) => {
  const o = e.target.closest("[data-open]"); if (o) { openTune(o.dataset.open); return; }
  const b = e.target.closest("[data-act]"); if (!b) return;
  const i = +b.dataset.i;
  if (b.dataset.act === "up") C.moveInSet(lib, prefs.setId, i, i - 1);
  if (b.dataset.act === "down") C.moveInSet(lib, prefs.setId, i, i + 1);
  if (b.dataset.act === "rm") C.removeFromSet(lib, prefs.setId, i);
  renderSet(); saveSoon();
});
$("newSet").addEventListener("click", () => {
  const ids = tune() ? [cur.id] : [];
  const s = C.addSet(lib, ids.length ? C.setNameFrom([tune()]) + " set" : "New set", ids, { times: 2 });
  prefs.setId = s.id; renderSet(); saveSoon(); setTab("sets");
  $("setName").focus(); try { $("setName").select(); } catch {}
  status("New set. Add tunes with Add the open tune, then put them in order.");
});
$("delSet").addEventListener("click", () => { const s = C.getSet(lib, prefs.setId); if (!s || !confirm(`Delete the set "${s.name}"? The tunes stay in your book.`)) return; C.removeSet(lib, s.id); prefs.setId = null; renderSet(); saveSoon(); });
$("setName").addEventListener("input", () => { const s = C.getSet(lib, prefs.setId); if (!s) return; s.name = $("setName").value.slice(0, 80) || "Set"; [...$("setSel").options].find((o) => o.value === s.id).textContent = `${s.name} (${s.ids.length})`; saveSoon(); });
$("setTimes").addEventListener("change", () => { const s = C.getSet(lib, prefs.setId); if (s) { s.times = +$("setTimes").value; saveSoon(); } });
$("setAddCur").addEventListener("click", () => { if (C.addToSet(lib, prefs.setId, cur.id)) { renderSet(); saveSoon(); } });
$("addToSetBtn").addEventListener("click", () => {
  if (!tune()) return;
  let s = C.getSet(lib, prefs.setId);
  if (!s) { s = C.addSet(lib, C.setNameFrom([tune()]) + " set", [], { times: 2 }); prefs.setId = s.id; }
  const ok = C.addToSet(lib, s.id, cur.id);
  renderSet(); saveSoon(); setTab("sets");
  status(ok ? `Added to "${s.name}".` : `It's already in "${s.name}".`);
});
$("playSet").addEventListener("click", () => { if (player) { stop(); status(""); } else startSet(); });

// ---------- practice settings ----------
function fillPractice() {
  const pct = [40, 50, 60, 70, 75, 80, 85, 90, 100, 110, 120];
  $("pFrom").innerHTML = pct.filter((p) => p < 100).map((p) => `<option value="${p}">${p}%</option>`).join("");
  $("pTo").innerHTML = pct.filter((p) => p >= 70).map((p) => `<option value="${p}">${p}%</option>`).join("");
  const pr = prefs.practice;
  $("pOn").checked = pr.on; $("pFrom").value = pr.from; $("pTo").value = pr.to; $("pStep").value = pr.step; $("pEvery").value = pr.every;
  if (!$("pFrom").value) $("pFrom").value = "60";
  if (!$("pTo").value) $("pTo").value = "100";
  $("countIn").checked = prefs.countIn; $("clickOn").checked = prefs.click;
  $("swing").value = prefs.swing;
  planText(); swingText();
}
function planText() {
  const pr = prefs.practice, n = C.passesToTarget(pr);
  $("pPlan").textContent = !pr.on ? "Off: loops play at the tempo above." : n === 0 ? `Plays at ${pr.from}% every pass.` : `Starts at ${pr.from}% (${Math.round(bpm * pr.from / 100)} BPM) and reaches ${pr.to}% (${Math.round(bpm * pr.to / 100)} BPM) after ${n} passes, then stays there.`;
}
function swingText() {
  const v = prefs.swing;
  $("swingVal").textContent = v === 0 ? "straight" : v < 40 ? `light (${v}%)` : v < 75 ? `medium (${v}%)` : `heavy (${v}%)`;
  $("swingNote").textContent = C.swingFits(cur.meter) ? "Long-short on pairs of eighth notes. Takes effect the next time you press Play." : "This tune's beat is in threes (a jig or a slip jig), so swing doesn't apply to it.";
}
for (const id of ["pOn", "pFrom", "pTo", "pStep", "pEvery"]) $(id).addEventListener("change", () => {
  prefs.practice = { on: $("pOn").checked, from: +$("pFrom").value, to: +$("pTo").value, step: +$("pStep").value, every: +$("pEvery").value };
  if (prefs.practice.on && $("loopSel").value === "once") fillLoop("all");
  planText(); saveSoon();
});
$("countIn").addEventListener("change", () => { prefs.countIn = $("countIn").checked; saveSoon(); });
$("clickOn").addEventListener("change", () => { prefs.click = $("clickOn").checked; saveSoon(); });
$("swing").addEventListener("input", () => { prefs.swing = +$("swing").value; swingText(); saveSoon(); });

// ---------- files: import, export, print ----------
function fileMsg(text, err = false) { const m = $("fileMsg"); m.textContent = text; m.classList.toggle("err", err); }
function importText(text, from) {
  const r = C.importAbc(lib, text);
  if (!r.added.length && !r.skipped.length) { fileMsg(`No tunes found in ${from}. ABC tunes have a K: line (the key).`, true); return r; }
  const bits = [];
  if (r.added.length) bits.push(`Added ${r.added.length} tune${r.added.length > 1 ? "s" : ""}`);
  if (r.skipped.length) bits.push(`${r.skipped.length} already in your book or missing a key`);
  if (r.sets.length) bits.push(`${r.sets.length} set${r.sets.length > 1 ? "s" : ""}`);
  fileMsg(bits.join(", ") + ".");
  fillFilters(); renderList();
  if (r.sets.length || r.sameSets.length) prefs.setId = (r.sets[0] || r.sameSets[0]).id;
  renderSet();
  if (r.added.length) openTune(r.added[0].id);
  saveSoon();
  return r;
}
$("fileIn").addEventListener("change", async () => {
  const files = [...$("fileIn").files];
  for (const f of files) {
    if (f.size > 8 * 1024 * 1024) { fileMsg(`${f.name} is too big for a tune file.`, true); continue; }
    try { importText(await f.text(), f.name); } catch { fileMsg(`Couldn't read ${f.name}.`, true); }
  }
  $("fileIn").value = "";
});
$("pasteAdd").addEventListener("click", () => {
  const text = $("pasteIn").value;
  if (!text.trim()) { fileMsg("Paste some ABC first.", true); return; }
  // a pasted tune without X: still counts
  const r = importText(C.looksLikeAbc(text) && !/^X:/m.test(text) ? "X:1\n" + text.trim() : text, "what you pasted");
  if (r.added.length) $("pasteIn").value = "";
});
$("restore").addEventListener("click", () => {
  const before = lib.tunes.length;
  for (const t of STARTER_TUNES) if (!C.findDuplicate(lib, t.abc)) C.addTune(lib, t.abc, { tags: t.tags });
  const n = lib.tunes.length - before;
  fillFilters(); renderList(); saveSoon();
  fileMsg(n ? `Put back ${n} starter tune${n > 1 ? "s" : ""}.` : "All the starter tunes are already in your book.");
});
function scopeIds() {
  const sc = $("scope").value;
  if (sc === "tune") return cur.id ? [cur.id] : [];
  if (sc === "set") return C.getSet(lib, prefs.setId)?.ids.slice() || [];
  if (sc === "list") return shown.map((t) => t.id);
  return lib.tunes.map((t) => t.id);
}
function download(name, text) {
  const blob = new Blob([text], { type: "text/vnd.abc;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
$("exportBtn").addEventListener("click", () => {
  const sc = $("scope").value, ids = scopeIds();
  if (!ids.length) { fileMsg(sc === "set" ? "The open set has no tunes." : "No tunes to save.", true); return; }
  let text, name;
  if (sc === "set") { const s = C.getSet(lib, prefs.setId); text = C.exportSet(lib, s.id); name = C.fileName(s.name); }
  else if (sc === "tune") { text = C.exportTunes(lib, ids); name = C.fileName(C.parseHeader(tune().abc).title); }
  else if (sc === "all") { text = C.exportLibrary(lib, prefs.bookTitle); name = C.fileName(prefs.bookTitle || "tune book"); }
  else { text = C.exportTunes(lib, ids, { title: prefs.bookTitle }); name = C.fileName((prefs.bookTitle || "tunes") + " selection"); }
  download(name, text);
  fileMsg(`Saved ${ids.length} tune${ids.length > 1 ? "s" : ""} as ${name}.`);
});
$("bookTitle").addEventListener("input", () => { prefs.bookTitle = $("bookTitle").value.slice(0, 80); saveSoon(); });
$("printBtn").addEventListener("click", () => {
  const ids = scopeIds();
  if (!ids.length) { fileMsg("No tunes to print.", true); return; }
  const book = $("printBook"), inKeys = $("printKeys").checked;
  book.innerHTML = "";
  const ts = ids.map((id) => C.getTune(lib, id)).filter(Boolean);
  const title = $("scope").value === "set" ? C.getSet(lib, prefs.setId).name : $("scope").value === "tune" ? C.parseHeader(ts[0].abc).title : prefs.bookTitle || "My tune book";
  if (ts.length > 1) {
    const cover = document.createElement("div"); cover.className = "cover";
    const h1 = document.createElement("h1"); h1.textContent = title;
    const sub = document.createElement("div"); sub.className = "sub"; sub.textContent = `${ts.length} tunes · ${new Date().toLocaleDateString()}`;
    const ol = document.createElement("ol");
    for (const t of ts) { const h = C.parseHeader(t.abc); const li = document.createElement("li"); li.textContent = `${h.title} (${C.typeById(h.type).name}, ${(inKeys && t.transpose ? C.keyAfter(h.key, t.transpose) : h.key || "?").split(" ")[0]})`; ol.append(li); }
    cover.append(h1, sub, ol); book.append(cover);
  }
  for (const t of ts) {
    const div = document.createElement("div"); div.className = "printTune"; book.append(div);
    const text = inKeys && t.transpose ? C.transposeAbc(A, t.abc, t.transpose).abc : t.abc;
    try { A.renderAbc(div, text, { staffwidth: 680, scale: 0.95, paddingleft: 0, paddingright: 0, foregroundColor: "#000" }); } catch {}
  }
  const foot = document.createElement("div"); foot.className = "foot"; foot.textContent = "Printed from ENCORE. Tune Book"; book.append(foot);
  window.print();
  fileMsg(`Sent ${ts.length} tune${ts.length > 1 ? "s" : ""} to print.`);
});

// ---------- instrument, backing, tempo, loop ----------
$("instSel").innerHTML = MELODY_INSTRUMENTS.map((i) => `<option value="${i.id}">${i.name}</option>`).join("");
$("backSel").innerHTML = BACKINGS.map((b) => `<option value="${b.id}">${b.name}</option>`).join("");
$("instSel").addEventListener("change", () => {
  prefs.inst = $("instSel").value; saveSoon();
  status("Loading the " + $("instSel").selectedOptions[0].textContent.toLowerCase() + " sound...");
  sound.prepare(prefs.inst, cur.tl.filter((e) => e.track === "melody")).then((ok) => status(ok ? "" : sound.samplesOK() ? "" : "Using the built-in synth (this browser can't play the recorded sounds)."), () => status(""));
});
$("backSel").addEventListener("change", () => {
  prefs.backing = $("backSel").value; saveSoon();
  if (player) player.back = BACKINGS.find((b) => b.id === prefs.backing) || BACKINGS[0];
  const b = BACKINGS.find((x) => x.id === prefs.backing);
  if (b && b.bass) { const notes = cur.tl.filter((e) => e.track !== "melody"); sound.prepare(b.bass, notes.filter((e) => e.track === "bass")).catch(() => {}); sound.prepare(b.chord, notes.filter((e) => e.track === "chord")).catch(() => {}); }
  if (b && b.bass && !cur.tl.some((e) => e.track !== "melody")) status("This tune has no chord symbols, so there's nothing to back it with. Add chords in quotes, like \"G\".");
});
$("bpm").addEventListener("input", () => { setBpm($("bpm").value); planText(); });
$("playBtn").addEventListener("click", togglePlay);
$("loopSel").addEventListener("change", () => { if (player) startTune(); });

// ---------- tabs and keys ----------
let tabNow = "book";
function setTab(name) {
  tabNow = name; prefs.tab = name;
  for (const b of document.querySelectorAll(".tabBar button")) b.classList.toggle("on", b.dataset.tab === name);
  for (const s of document.querySelectorAll(".tabBody > section")) s.classList.toggle("show", s.dataset.tab === name);
  if (name === "practice") swingText();
}
for (const b of document.querySelectorAll(".tabBar button")) b.addEventListener("click", () => { setTab(b.dataset.tab); saveSoon(); });
addEventListener("keydown", (e) => {
  const tag = (e.target && e.target.tagName) || "";
  if (/INPUT|TEXTAREA|SELECT/.test(tag) || e.target.isContentEditable || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === " " || e.code === "Space") { if (tag === "BUTTON") return; e.preventDefault(); togglePlay(); }
  else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    const at = shown.findIndex((t) => t.id === cur.id), n = shown[at + (e.key === "ArrowDown" ? 1 : -1)];
    if (n) { e.preventDefault(); openTune(n.id); }
  }
  else if (e.key === "-" || e.key === "_") setBpm(bpm - 5);
  else if (e.key === "=" || e.key === "+") setBpm(bpm + 5);
  else if (e.key === "Escape") clearSel();
});
function status(text) { $("status").textContent = text; }

// ---------- start ----------
load();
$("instSel").value = prefs.inst; $("backSel").value = prefs.backing; $("bookTitle").value = prefs.bookTitle;
fillFilters(); fillPractice();
const first = C.getTune(lib, prefs.current) || lib.tunes[0];
wasNarrow = narrowPaper();
if (first) openTune(first.id); else { renderTune(); fillEditor(); renderList(); renderSet(); }
setTab(prefs.tab || "book");
if (!A) status("The sheet music library didn't load. Reload the page.");

// state for tests
window.__tunebook = () => ({
  tunes: lib.tunes.length, sets: lib.sets.map((s) => ({ name: s.name, n: s.ids.length, times: s.times })), title: tune() ? C.parseHeader(tune().abc).title : null,
  display: cur.display, key: C.parseHeader(cur.display).key, transpose: tune()?.transpose ?? 0, parts: cur.parts.map((p) => p.label), notes: cur.tl.filter((e) => e.track === "melody").length,
  backing: cur.tl.filter((e) => e.track !== "melody").length, playing: !!player, loop: $("loopSel").value, sel: cur.sel, lit, scheduled: player ? player.scheduled : 0,
  pass: player && player.shownPass ? { label: player.shownPass.label || "", speed: player.shownPass.speed, pass: player.shownPass.pass ?? null, id: player.shownPass.id } : null,
  bpm, svg: !!document.querySelector("#paper svg"), noteEls: [...cur.noteEls.values()].filter((v) => v.length).length, warnings: cur.warnings.length, setId: prefs.setId,
  shown: shown.length, inst: prefs.inst, samplesReady: cur.tl.length ? sound.ready(prefs.inst, cur.tl.filter((e) => e.track === "melody").slice(0, 40)) : false, ctxTime: player ? sound.ctx.currentTime : null,
});
