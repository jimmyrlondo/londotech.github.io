// ENCORE. Chip: the page. A piano roll over chip-accurate voices (chip-synth.js), the song model
// and the hardware rules (chip-core.js), the roll and tracker views (chip-roll.js).
import * as C from "./chip-core.js";
import { PianoRoll, CH_COLORS, cellText, trackerRows, TRACKER_KEYS } from "./chip-roll.js";
import { stemStereo } from "./chip-synth.js";
import { zip } from "./zip.js";

const $ = (id) => document.getElementById(id);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
};
const KEY_CUR = "encore-chip-current", KEY_SONGS = "encore-chip-songs";

let proj;
const S = { ci: 0, row: 0, sel: new Set(), tool: "draw", noteLen: 2, playStep: 0, cursor: 0, playing: false, playMode: "row", view: "roll", newVol: 12, curInst: {}, trk: { r: 0 }, trkOct: 4, lastMsg: "", mutes: [], solo: -1 };
let undo = [], redo = [], lastSaved = "", clip = null;

// ---- start: last song on this device, else the demo
try { const j = store.get(KEY_CUR); proj = j ? C.loadProject(JSON.parse(j)) : C.demoSong("overworld"); } catch { proj = C.demoSong("overworld"); }
lastSaved = JSON.stringify(proj);

// ---- audio
let ctx = null, node = null, audioReady = null;
function ensureAudio() {
  if (audioReady) { ctx?.resume?.(); return audioReady; }
  audioReady = (async () => {
    ctx = new AudioContext({ latencyHint: "interactive" });
    await ctx.audioWorklet.addModule("chip-worklet.js");
    node = new AudioWorkletNode(ctx, "encore-chip", { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
    node.connect(ctx.destination);
    node.port.onmessage = (e) => onWorklet(e.data);
    sendProject(); sendMutes();
    await ctx.resume();
  })().catch((err) => { audioReady = null; say("Sound couldn't start in this browser: " + err.message, true); throw err; });
  return audioReady;
}
const sendProject = () => node?.port.postMessage({ type: "load", project: proj });
function sendMutes() {
  const m = proj.channels.map((_, i) => (S.solo >= 0 ? i !== S.solo : !!S.mutes[i]));
  node?.port.postMessage({ type: "mutes", mutes: m });
}
function onWorklet(m) {
  if (m.type === "error") { say("Playback problem: " + m.message, true); return; }
  if (m.type !== "pos") return;
  const was = S.playing;
  S.playStep = m.step; S.playing = m.playing;
  if (was !== S.playing) renderTransport();
  const L = proj.patLen;
  if (S.playing && S.playMode === "song" && !roll.drag) {
    const r = Math.min(proj.order.length - 1, Math.floor(m.step / L));
    if (r !== S.row) { S.row = r; S.sel.clear(); renderRows(); renderNoteTab(); renderArrangement(); if (S.view === "trk") renderTracker(); }
  }
  $("pos").textContent = posText(S.playing ? m.step : S.cursor);
  [...$("rows").querySelectorAll("button[data-row]")].forEach((b) => b.classList.toggle("playing", S.playing && +b.dataset.row === Math.floor(m.step / L)));
  [...$("chans").querySelectorAll(".vu")].forEach((v, i) => { v.style.width = Math.min(100, (m.peaks[i] || 0) * 260) + "%"; });
  roll.draw();
  if (S.view === "trk") markTrackerRow();
}
const posText = (step) => { const L = proj.patLen, r = Math.floor(step / L), s = Math.floor(step - r * L); return `${r + 1}.${Math.floor(s / proj.spb) + 1}.${(s % proj.spb) + 1}`; };

async function togglePlay() {
  await ensureAudio();
  if (S.playing) { node.port.postMessage({ type: "stop" }); S.playing = false; renderTransport(); return; }
  const L = proj.patLen;
  sendProject();
  if (S.playMode === "row") {
    const from = S.cursor >= S.row * L && S.cursor < (S.row + 1) * L ? S.cursor : S.row * L;
    node.port.postMessage({ type: "play", from, range: [S.row * L, (S.row + 1) * L] });
  } else node.port.postMessage({ type: "play", from: S.cursor < C.songSteps(proj) ? S.cursor : 0 });
  S.playing = true; renderTransport();
}
async function preview(p, note) {
  try { await ensureAudio(); } catch { return; }
  const kind = proj.channels[S.ci].kind;
  const n = note ? { ...note } : { s: 0, l: 4, p, v: kind === "triangle" ? 15 : S.newVol, i: curInst(kind) };
  sendProject();
  node.port.postMessage({ type: "preview", ci: S.ci, note: n });
}

// ---- messages under the roll
let msgTimer = 0;
function say(text, limit = false) {
  S.lastMsg = text;
  const el = $("status");
  el.textContent = text; el.classList.toggle("limit", !!limit);
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => { if (el.textContent === text) { el.textContent = ""; } }, 12000);
}
const sayCodes = (codes) => { if (codes.length) say(C.limitText(codes[0], proj, rangeExtra()), true); };
const rangeExtra = () => { const k = proj.channels[S.ci].kind, [lo, hi] = C.noteRange(proj.chip, k); return { kind: k, lo, hi }; };

// ---- editing
const curKind = () => proj.channels[S.ci].kind;
function curInst(kind) {
  const id = S.curInst[kind];
  if (id && proj.instruments.some((i) => i.id === id && i.kind === kind)) return id;
  const first = proj.instruments.find((i) => i.kind === kind);
  return first ? first.id : "";
}
function pattern(create) {
  let pat = C.patternAt(proj, S.row, S.ci);
  if (!pat && create) { proj.patterns[S.ci].push({ notes: [] }); proj.order[S.row][S.ci] = proj.patterns[S.ci].length - 1; pat = C.patternAt(proj, S.row, S.ci); }
  return pat;
}
/** after any change: undo point, autosave, sound and screen */
function commit() {
  const now = JSON.stringify(proj);
  if (now !== lastSaved) { undo.push(lastSaved); if (undo.length > 150) undo.shift(); redo = []; lastSaved = now; }
  store.set(KEY_CUR, now);
  sendProject();
  renderAll();
}
function replaceProject(p, msg) {
  proj = p; S.sel.clear(); S.ci = Math.min(S.ci, proj.channels.length - 1); S.row = Math.min(S.row, proj.order.length - 1); S.cursor = S.row * proj.patLen;
  if (S.playing && node) { node.port.postMessage({ type: "stop" }); S.playing = false; }
  commit();
  if (msg) say(msg);
}
function doUndo(back = true) {
  const from = back ? undo : redo, to = back ? redo : undo;
  if (!from.length) return;
  to.push(JSON.stringify(proj));
  proj = C.loadProject(JSON.parse(from.pop()));
  lastSaved = JSON.stringify(proj); S.sel.clear();
  S.ci = Math.min(S.ci, proj.channels.length - 1); S.row = Math.min(S.row, proj.order.length - 1);
  store.set(KEY_CUR, lastSaved); sendProject(); renderAll();
}
/** one note at a time: a note that runs into the next one stops there; one that starts on top of another replaces it */
function settle(pat, moved, mode) {
  const set = new Set(moved);
  let hit = false;
  for (const m of moved) {
    for (const o of [...pat.notes]) {
      if (set.has(o)) continue;
      const overlap = o.s < m.s + m.l && m.s < o.s + o.l;
      if (!overlap) continue;
      hit = true;
      if (o.s > m.s) m.l = o.s - m.s;
      else if (o.s < m.s) o.l = m.s - o.s;
      else pat.notes.splice(pat.notes.indexOf(o), 1);
    }
  }
  return hit;
}
function legalizeInPlace(notes) {
  const codes = [];
  for (const n of notes) { const r = C.legalizeNote(proj, S.ci, n); Object.assign(n, r.note); codes.push(...r.codes); }
  return codes;
}
function addNote(s, p) {
  const pat = pattern(true), kind = curKind(), L = proj.patLen;
  const n = { s, l: Math.max(1, Math.min(S.noteLen, L - s)), p, v: kind === "triangle" ? 15 : S.newVol, i: curInst(kind) };
  const r = C.legalizeNote(proj, S.ci, n);
  pat.notes.push(r.note);
  S.sel = new Set([r.note]);
  preview(null, r.note);
  if (r.codes.length) sayCodes(r.codes);
  renderNoteTab();
  return r.note;
}
const api = {
  state: () => ({ proj, ci: S.ci, row: S.row, sel: S.sel, tool: S.tool, noteLen: S.noteLen, playStep: S.playing ? S.playStep : S.cursor, playing: S.playing }),
  pattern, addNote,
  commit(mode, notes) {
    const pat = pattern(true);
    const codes = legalizeInPlace(notes);
    const hit = settle(pat, notes, mode);
    if (codes.length) sayCodes(codes); else if (hit) say(C.limitText("overlap", proj), true);
    commit();
  },
  remove(notes) { const pat = pattern(false); if (!pat) return; pat.notes = pat.notes.filter((n) => !notes.includes(n)); notes.forEach((n) => S.sel.delete(n)); commit(); },
  select(set) { S.sel = set; renderNoteTab(); roll.draw(); },
  preview: (p, note) => preview(p, note),
  seek(step) { S.cursor = S.row * proj.patLen + step; $("pos").textContent = posText(S.cursor); if (S.playing) togglePlay().then(togglePlay); roll.draw(); },
};
const roll = new PianoRoll($("roll"), api);

// ---- the panel
function renderTransport() {
  $("playBtn").textContent = S.playing ? "Stop" : "Play";
  $("modeRow").classList.toggle("on", S.playMode === "row"); $("modeSong").classList.toggle("on", S.playMode === "song");
  $("toolDraw").classList.toggle("on", S.tool === "draw"); $("toolSel").classList.toggle("on", S.tool === "select");
  $("viewRoll").classList.toggle("on", S.view === "roll"); $("viewTrk").classList.toggle("on", S.view === "trk");
  setVal($("bpm"), +proj.bpm.toFixed(2));
  if (!S.playing) $("pos").textContent = posText(S.cursor);
}
function setVal(el, v) { if (document.activeElement !== el && String(el.value) !== String(v)) el.value = v; }
function renderHead() {
  $("songName").textContent = `${proj.name} · ${C.CHIPS[proj.chip].name}`;
  const issues = C.checkProject(proj), b = $("badge");
  if (!issues.length) { b.textContent = proj.free ? "Free mode (still hardware-legal)" : "Hardware-legal"; b.classList.remove("free"); }
  else { const n = issues.reduce((a, i) => a + i.count, 0); b.textContent = `Free mode: ${n} thing${n === 1 ? "" : "s"} a real ${C.CHIPS[proj.chip].name} can't do`; b.classList.add("free"); }
}
function renderChans() {
  const box = $("chans");
  box.innerHTML = "";
  proj.channels.forEach((ch, i) => {
    const d = document.createElement("div");
    d.className = "chan" + (i === S.ci ? " on" : "");
    d.style.setProperty("--c", CH_COLORS[i % CH_COLORS.length]);
    const nm = document.createElement("button"); nm.className = "nm"; nm.textContent = ch.name; nm.title = `Edit ${ch.name} (${i + 1})`;
    nm.onclick = () => selectChannel(i);
    const m = document.createElement("button"); m.className = "ms" + (S.mutes[i] ? " on" : ""); m.textContent = "M"; m.title = "Mute"; m.setAttribute("aria-label", `Mute ${ch.name}`);
    m.onclick = () => { S.mutes[i] = !S.mutes[i]; sendMutes(); renderChans(); };
    const s = document.createElement("button"); s.className = "ms" + (S.solo === i ? " on" : ""); s.textContent = "S"; s.title = "Solo"; s.setAttribute("aria-label", `Solo ${ch.name}`);
    s.onclick = () => { S.solo = S.solo === i ? -1 : i; sendMutes(); renderChans(); };
    const vu = document.createElement("i"); vu.className = "vu";
    d.append(nm, m, s, vu);
    box.append(d);
  });
}
function selectChannel(i) {
  if (i < 0 || i >= proj.channels.length) return;
  S.ci = i; S.sel.clear(); renderAll();
}
function renderRows() {
  const box = $("rows");
  box.innerHTML = '<span class="lbl">Rows</span>';
  proj.order.forEach((_, r) => {
    const b = document.createElement("button");
    b.textContent = r + 1; b.dataset.row = r; b.className = r === S.row ? "on" : ""; b.title = `Edit row ${r + 1}`;
    b.onclick = () => selectRow(r);
    box.append(b);
  });
  const add = document.createElement("button"); add.textContent = "+"; add.title = "Add a row (a copy of this one's drums, new melody patterns)"; add.setAttribute("aria-label", "Add a row");
  add.onclick = () => addRow(false);
  box.append(add);
}
function selectRow(r) { S.row = r; S.sel.clear(); S.cursor = r * proj.patLen; renderAll(); }
function addRow(duplicate) {
  const row = proj.order[S.row];
  const nr = duplicate ? row.slice() : row.map((pi, ci) => {
    const k = proj.channels[ci].kind;
    if (k === "noise" || k === "dpcm") return pi; // keep the beat going
    proj.patterns[ci].push({ notes: [] }); return proj.patterns[ci].length - 1;
  });
  proj.order.splice(S.row + 1, 0, nr);
  S.row++; S.sel.clear(); S.cursor = S.row * proj.patLen;
  commit();
  say(duplicate ? "Row copied. It uses the same patterns, so edits show up in both." : "New row: fresh patterns for the melody channels, the same drums.");
}

// ---- tracker view
function renderTracker() {
  const L = proj.patLen, box = $("trk");
  const cols = proj.channels.map((ch, ci) => trackerRows(C.patternAt(proj, S.row, ci), L));
  let h = "<table><thead><tr><th>Row</th>" + proj.channels.map((ch, ci) => `<th style="color:${CH_COLORS[ci % CH_COLORS.length]}">${esc(ch.name)}</th>`).join("") + "</tr></thead><tbody>";
  for (let r = 0; r < L; r++) {
    h += `<tr data-r="${r}" class="${r % proj.spb === 0 ? "beat" : ""}"><td class="rn">${String(r).padStart(2, "0")}</td>`;
    cols.forEach((col, ci) => {
      const c = col[r], txt = c.n ? cellText(proj, ci, c.n, false) : c.off ? "===  -- - ---" : c.inside ? "  |          " : "---  -- - ---";
      h += `<td data-r="${r}" data-c="${ci}" class="${!c.n && !c.off ? "dim" : ""}${ci === S.ci && r === S.trk.r ? " cur" : ""}">${esc(txt)}</td>`;
    });
    h += "</tr>";
  }
  box.innerHTML = h + "</tbody></table>";
  markTrackerRow();
}
function markTrackerRow() {
  const L = proj.patLen, ps = (S.playing ? S.playStep : -1) - S.row * L;
  $("trk").querySelectorAll("tr[data-r]").forEach((tr) => tr.classList.toggle("now", S.playing && Math.floor(ps) === +tr.dataset.r));
}
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
$("trk").addEventListener("click", (e) => {
  const td = e.target.closest("td[data-c]");
  if (!td) return;
  S.trk.r = +td.dataset.r;
  if (+td.dataset.c !== S.ci) { S.ci = +td.dataset.c; renderChans(); renderSoundTab(); }
  const pat = pattern(false), n = pat?.notes.find((x) => x.s === S.trk.r);
  S.sel = n ? new Set([n]) : new Set();
  renderTracker(); renderNoteTab();
  $("trk").focus();
});
function trackerKey(e) {
  const L = proj.patLen, k = e.key.toLowerCase();
  if (e.key === "ArrowDown") { S.trk.r = Math.min(L - 1, S.trk.r + 1); }
  else if (e.key === "ArrowUp") { S.trk.r = Math.max(0, S.trk.r - 1); }
  else if (e.key === "ArrowRight") { S.ci = Math.min(proj.channels.length - 1, S.ci + 1); renderChans(); }
  else if (e.key === "ArrowLeft") { S.ci = Math.max(0, S.ci - 1); renderChans(); }
  else if (e.key === "PageUp") { S.trkOct = Math.min(7, S.trkOct + 1); say(`Tracker keys now start at octave ${S.trkOct}.`); }
  else if (e.key === "PageDown") { S.trkOct = Math.max(1, S.trkOct - 1); say(`Tracker keys now start at octave ${S.trkOct}.`); }
  else if (e.key === "Delete" || e.key === "Backspace" || e.key === ".") {
    const pat = pattern(false);
    if (pat) {
      const at = pat.notes.find((n) => n.s === S.trk.r), inside = pat.notes.find((n) => n.s < S.trk.r && n.s + n.l > S.trk.r);
      if (at) pat.notes.splice(pat.notes.indexOf(at), 1); else if (inside) inside.l = S.trk.r - inside.s;
      S.sel.clear(); commit();
    }
  } else if (TRACKER_KEYS[k] != null && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const semi = TRACKER_KEYS[k], kind = curKind();
    const rows = C.rowsFor(proj.chip, kind);
    const p = C.isMelodic(kind) ? (S.trkOct + 1) * 12 + semi : rows[Math.min(rows.length - 1, semi)].p;
    const pat = pattern(true);
    const old = pat.notes.find((n) => n.s === S.trk.r);
    if (old) pat.notes.splice(pat.notes.indexOf(old), 1);
    const n = addNote(S.trk.r, p);
    api.commit("move", [n]);
    S.trk.r = Math.min(L - 1, S.trk.r + 1);
  } else return false;
  renderTracker();
  return true;
}

// ---- Note tab
function fillSelect(el, items) { el.innerHTML = items.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join(""); }
const instItems = (kind) => proj.instruments.filter((i) => i.kind === kind).map((i) => [i.id, i.name]);
function renderNoteTab() {
  const kind = curKind(), ch = proj.channels[S.ci];
  const sel = [...S.sel];
  $("noteNone").classList.toggle("hidden", sel.length > 0);
  $("noteEdit").classList.toggle("hidden", sel.length === 0);
  if (!sel.length) {
    fillSelect($("newInst"), instItems(kind)); $("newInst").value = curInst(kind);
    setVal($("newVol"), S.newVol); $("newVolV").textContent = S.newVol;
    $("chanInfo").textContent = chanInfo(ch);
    return;
  }
  const n = sel[0], inst = C.instFor(proj, kind, n.i), fx = { ...C.DEFAULT_FX, ...inst.fx, ...(n.fx || {}) };
  const label = C.isMelodic(kind) ? C.noteName(n.p) : kind === "dpcm" ? C.KIT[n.p] : `Noise ${n.p + 1}`;
  $("noteTitle").textContent = sel.length > 1 ? `${sel.length} notes` : `${label}, step ${n.s + 1}, ${n.l} step${n.l > 1 ? "s" : ""} long`;
  let info = "";
  if (C.isMelodic(kind) && !proj.free) {
    const c = C.centsOff(proj.chip, kind, n.p);
    info = Math.abs(c) >= 3 ? `On the chip this note plays ${Math.abs(c).toFixed(0)} cents ${c > 0 ? "sharp" : "flat"} (its pitch steps get coarse up high).` : "On the chip this note is in tune.";
  }
  $("noteInfo").textContent = info;
  fillSelect($("nInst"), instItems(kind)); $("nInst").value = inst.id;
  setVal($("nVol"), n.v ?? 12); $("nVolV").textContent = n.v ?? 12;
  fillSelect($("nArp"), Object.entries(C.ARPS).map(([k, a]) => [k, a.name])); $("nArp").value = fx.arp;
  $("nArpSpeed").value = fx.arpSpeed; $("nVib").value = fx.vib; $("nVibSpeed").value = fx.vibSpeed || 2;
  setVal($("nSlide"), fx.slide); $("nGlide").value = [0, 3, 6, 12].includes(fx.glide) ? fx.glide : 6;
  const hwOnly = proj.chip === "dmg" && !proj.free && (kind === "pulse" || kind === "noise");
  fillSelect($("nEnv"), [["inst", `The sound's own (${C.ENVS[inst.env]?.name || "Flat"})`], ...Object.entries(C.ENVS).map(([k, e]) => [k, e.name + (hwOnly && !e.hw ? " (needs Free mode)" : "")])]);
  $("nEnv").value = n.fx?.env || "inst";
  $("nSweep").value = fx.sweep; $("nSweepL").classList.toggle("hidden", kind !== "pulse");
  $("nRateL").classList.toggle("hidden", kind !== "dpcm");
  fillSelect($("nRate"), C.DMC_RATES.map((r, i) => [i, `${i} (${(C.CLOCK["2a03"] / r / 1000).toFixed(1)} kHz)`])); $("nRate").value = fx.rate;
  for (const id of ["nVib", "nVibSpeed", "nSlide", "nGlide"]) $(id).disabled = !C.isMelodic(kind);
}
function chanInfo(ch) {
  const chip = C.CHIPS[proj.chip].name, k = ch.kind;
  if (proj.free) return `${ch.name}: Free mode, so no chip limits apply.`;
  const [lo, hi] = C.noteRange(proj.chip, k);
  if (k === "pulse") return `${ch.name}: a ${chip} pulse channel. Four widths (12.5%, 25%, 50%, 75%), volume 0 to 15, notes ${C.noteName(lo)} and up.`;
  if (k === "triangle") return `${ch.name}: the ${chip} triangle, a 32-step 4-bit wave. No volume control (on or off), notes ${C.noteName(lo)} and up. Great for bass and kick drops.`;
  if (k === "wave") return `${ch.name}: the ${chip} wave channel plays a 32-step 4-bit wave you draw in Sounds. Four volume levels (off, 25%, 50%, 100%), notes ${C.noteName(lo)} and up.`;
  if (k === "noise") return `${ch.name}: 16 noise pitches from a shift register, in two modes (hiss or metallic). Volume 0 to 15.`;
  if (k === "dpcm") return `${ch.name}: 1-bit delta samples, 16 fixed playback speeds, no volume control. The kit here is synthesized, not taken from any game.`;
  return "";
}
function editSel(fn) {
  const sel = [...S.sel]; if (!sel.length) return;
  sel.forEach(fn);
  const codes = legalizeInPlace(sel);
  if (codes.length) sayCodes(codes);
  commit();
}
const setFx = (key, val) => editSel((n) => { n.fx = { ...(n.fx || {}), [key]: val }; });
$("nInst").onchange = (e) => editSel((n) => { n.i = e.target.value; });
$("nVol").oninput = (e) => { $("nVolV").textContent = e.target.value; };
$("nVol").onchange = (e) => {
  const v = +e.target.value, kind = curKind();
  if (kind === "triangle" && !proj.free) { say(C.limitText("triVol", proj), true); renderNoteTab(); return; }
  editSel((n) => { n.v = v; });
};
$("nArp").onchange = (e) => setFx("arp", e.target.value);
$("nArpSpeed").onchange = (e) => setFx("arpSpeed", +e.target.value);
$("nVib").onchange = (e) => setFx("vib", +e.target.value);
$("nVibSpeed").onchange = (e) => setFx("vibSpeed", +e.target.value);
$("nSlide").onchange = (e) => setFx("slide", Math.max(-24, Math.min(24, Math.round(+e.target.value || 0))));
$("nGlide").onchange = (e) => setFx("glide", +e.target.value);
$("nEnv").onchange = (e) => setFx("env", e.target.value);
$("nSweep").onchange = (e) => setFx("sweep", e.target.value);
$("nRate").onchange = (e) => setFx("rate", +e.target.value);
$("nClear").onclick = () => editSel((n) => { delete n.fx; });
$("nDel").onclick = () => api.remove([...S.sel]);
$("nPlay").onclick = () => { const n = [...S.sel][0]; if (n) preview(null, n); };
$("newInst").onchange = (e) => { S.curInst[curKind()] = e.target.value; renderSoundTab(); };
$("newVol").oninput = (e) => { S.newVol = +e.target.value; $("newVolV").textContent = S.newVol; if (curKind() === "triangle" && !proj.free) say(C.limitText("triVol", proj), true); };

// ---- Sounds tab
const selInst = () => { const k = curKind(); return proj.instruments.find((i) => i.id === curInst(k) && i.kind === k); };
function renderSoundTab() {
  const kind = curKind();
  $("sKind").textContent = C.KIND_NAME[kind];
  const list = $("instList"); list.innerHTML = "";
  const cur = curInst(kind);
  proj.instruments.filter((i) => i.kind === kind).forEach((i) => {
    const li = document.createElement("li"), b = document.createElement("button");
    b.className = i.id === cur ? "on" : "";
    b.innerHTML = `<span>${esc(i.name)}</span><small>${kind === "pulse" ? C.dutyLabel(i.duty) + " · " : ""}${esc(C.ENVS[i.env]?.name || "")}</small>`;
    b.onclick = () => { S.curInst[kind] = i.id; renderSoundTab(); renderNoteTab(); preview(kind === "dpcm" ? 0 : kind === "noise" ? 12 : 64); };
    li.append(b); list.append(li);
  });
  const inst = selInst();
  $("sEdit").classList.toggle("hidden", !inst);
  if (!inst) return;
  setVal($("sName"), inst.name);
  $("sDutyBox").classList.toggle("hidden", kind !== "pulse");
  $("sWaveBox").classList.toggle("hidden", kind !== "wave");
  $("sNoiseBox").classList.toggle("hidden", kind !== "noise");
  const db = $("sDuty"); db.innerHTML = "";
  for (const d of C.LEGAL_DUTIES) {
    const b = document.createElement("button"); b.textContent = C.dutyLabel(d); b.className = inst.duty === d ? "on" : "";
    b.onclick = () => editInst((i) => { i.duty = d; });
    db.append(b);
  }
  $("sDutyFree").classList.remove("hidden"); setVal($("sDutyFree"), inst.duty);
  $("sDutyFree").title = `Fine width: ${C.dutyLabel(inst.duty)}`;
  $("sShort").checked = !!inst.short;
  const hwOnly = proj.chip === "dmg" && !proj.free && (kind === "pulse" || kind === "noise");
  fillSelect($("sEnv"), Object.entries(C.ENVS).map(([k, e]) => [k, e.name + (hwOnly && !e.hw ? " (needs Free mode)" : "")])); $("sEnv").value = inst.env;
  setVal($("sRel"), inst.release || 0);
  fillSelect($("sArp"), Object.entries(C.ARPS).map(([k, a]) => [k, a.name])); $("sArp").value = inst.fx.arp || "none";
  $("sVib").value = inst.fx.vib || 0;
  drawEnv(inst); drawWave(inst);
  const wp = $("sWavePresets"); wp.innerHTML = "";
  for (const name of Object.keys(C.WAVES)) {
    const b = document.createElement("button"); b.textContent = name;
    b.onclick = () => editInst((i) => { i.wave = C.WAVES[name].slice(); });
    wp.append(b);
  }
}
function editInst(fn) {
  const inst = selInst(); if (!inst) return;
  fn(inst);
  const r = C.legalizeInstrument(proj, inst);
  Object.assign(inst, r.inst);
  if (r.codes.length) say(C.limitText(r.codes[0], proj), true);
  commit();
}
$("sName").oninput = (e) => { const i = selInst(); if (i) { i.name = e.target.value.slice(0, 40) || "Sound"; } };
$("sName").onchange = () => commit();
$("sDutyFree").oninput = (e) => { $("sDutyFree").title = `Fine width: ${C.dutyLabel(+e.target.value)}`; };
$("sDutyFree").onchange = (e) => editInst((i) => { i.duty = +e.target.value; });
$("sShort").onchange = (e) => editInst((i) => { i.short = e.target.checked; });
$("sEnv").onchange = (e) => editInst((i) => { i.env = e.target.value; });
$("sRel").onchange = (e) => editInst((i) => { i.release = Math.max(0, Math.min(60, Math.round(+e.target.value || 0))); });
$("sArp").onchange = (e) => editInst((i) => { i.fx.arp = e.target.value; });
$("sVib").onchange = (e) => editInst((i) => { i.fx.vib = +e.target.value; });
$("sPlay").onclick = () => { const k = curKind(); preview(k === "dpcm" ? 0 : k === "noise" ? 12 : 64); };
$("sNew").onclick = () => {
  const k = curKind(), n = proj.instruments.filter((i) => i.kind === k).length + 1;
  const inst = C.makeInstrument({ kind: k, name: `My ${C.KIND_NAME[k]} ${n}`, duty: 8, env: "pluck" });
  proj.instruments.push(inst); S.curInst[k] = inst.id; commit();
};
$("sDup").onclick = () => { const i = selInst(); if (!i) return; const d = C.makeInstrument({ ...i, id: undefined, name: i.name + " copy" }); proj.instruments.push(d); S.curInst[i.kind] = d.id; commit(); };
$("sDel").onclick = () => {
  const i = selInst(); if (!i) return;
  if (proj.instruments.filter((x) => x.kind === i.kind).length <= 1) { say("Every channel type needs at least one sound, so this one stays."); return; }
  proj.instruments = proj.instruments.filter((x) => x !== i); delete S.curInst[i.kind]; commit();
  say("Sound deleted. Notes that used it now use the first sound in the list.");
};
function canvasCtx(c) {
  const dpr = window.devicePixelRatio || 1, r = c.getBoundingClientRect();
  if (!r.width) return null;
  c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr);
  const g = c.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { g, w: r.width, h: r.height };
}
function drawEnv(inst) {
  const cc = canvasCtx($("sEnvView")); if (!cc) return;
  const { g, w, h } = cc, N = 90;
  const hw = proj.chip === "dmg" && !proj.free && (inst.kind === "pulse" || inst.kind === "noise");
  g.fillStyle = "#ff3b00";
  let v = 15, cnt = 0; const he = C.hwEnvFor(inst.env, 15);
  v = he.vol;
  for (let t = 0; t < N; t++) {
    let val;
    if (hw) { val = v; for (let k = 0; k < 64 / 60 && he.pace; k++) { if (++cnt >= he.pace) { cnt = 0; v = Math.max(0, Math.min(15, v + he.dir)); } } }
    else val = C.envValue(inst.env, t);
    const bh = (val / 15) * (h - 4);
    g.fillRect((t / N) * w, h - bh, w / N - 1, bh);
  }
}
function drawWave(inst) {
  if (inst.kind !== "wave") return;
  const cc = canvasCtx($("sWave")); if (!cc) return;
  const { g, w, h } = cc;
  g.strokeStyle = "rgba(255,255,255,0.08)";
  for (let y = 0; y <= 15; y++) { g.beginPath(); g.moveTo(0, (y / 15) * h); g.lineTo(w, (y / 15) * h); g.stroke(); }
  g.fillStyle = CH_COLORS[S.ci % CH_COLORS.length];
  inst.wave.forEach((v, i) => { const bh = ((v + 1) / 16) * h; g.fillRect((i / 32) * w + 1, h - bh, w / 32 - 2, bh); });
}
{
  let painting = false;
  const paint = (e) => {
    const inst = selInst(); if (!inst || inst.kind !== "wave") return;
    const r = $("sWave").getBoundingClientRect();
    const i = Math.max(0, Math.min(31, Math.floor(((e.clientX - r.left) / r.width) * 32)));
    const v = Math.max(0, Math.min(15, Math.round((1 - (e.clientY - r.top) / r.height) * 16 - 0.5)));
    inst.wave[i] = v; drawWave(inst);
  };
  $("sWave").addEventListener("pointerdown", (e) => { painting = true; $("sWave").setPointerCapture?.(e.pointerId); paint(e); });
  $("sWave").addEventListener("pointermove", (e) => { if (painting) paint(e); });
  $("sWave").addEventListener("pointerup", () => { if (painting) { painting = false; commit(); preview(64); } });
}

// ---- Song tab
function renderSongTab() {
  setVal($("gName"), proj.name);
  $("gChip").value = proj.chip; $("gMode").value = proj.free ? "free" : "chip";
  $("gLen").value = proj.patLen; $("gFilter").checked = proj.filter !== false; $("gLoop").checked = proj.loop !== false;
  const issues = C.checkProject(proj), gi = $("gIssues");
  if (proj.free && issues.length) gi.innerHTML = `<ul class="issues">${issues.map((i) => `<li>${esc(i.text)} <b>(${i.count})</b></li>`).join("")}</ul><button class="small" id="gFix">Make it hardware-legal</button>`;
  else if (proj.free) gi.innerHTML = '<p class="tip">Free mode is on, but everything here would still play on the real chip.</p>';
  else gi.innerHTML = '<p class="tip">Chip mode: the song stays within what the real chip can play.</p>';
  if ($("gFix")) $("gFix").onclick = () => setMode("chip");
  const fps = C.framesPerStep(proj.bpm, proj.spb);
  $("gTempo").textContent = Number.isInteger(+fps.toFixed(3)) ? `At ${+proj.bpm.toFixed(2)} BPM every step is exactly ${fps.toFixed(0)} frames, so the timing is rock steady on the chip.` : `At ${+proj.bpm.toFixed(2)} BPM a step is ${fps.toFixed(2)} frames, so the chip plays steps of ${Math.floor(fps)} and ${Math.ceil(fps)} frames (a slight swing, like real chip songs). These tempos are exact:`;
  const tb = $("gTempos"); tb.innerHTML = "";
  for (const t of C.frameExactTempos(proj.spb)) {
    const b = document.createElement("button"); b.textContent = t.bpm; b.className = Math.abs(t.bpm - proj.bpm) < 0.01 ? "on" : ""; b.title = `${t.frames} frames per step`;
    b.onclick = () => { proj.bpm = t.bpm; commit(); };
    tb.append(b);
  }
  renderArrangement();
  fillSelect($("gLoopRow"), proj.order.map((_, r) => [r, `Row ${r + 1}`])); $("gLoopRow").value = proj.loopRow || 0;
  // pan
  const pb = $("panBox"); pb.innerHTML = "";
  proj.channels.forEach((ch, ci) => {
    const row = document.createElement("div"); row.className = "row"; row.style.marginTop = "4px"; row.style.alignItems = "center";
    const nm = document.createElement("span"); nm.textContent = ch.name; nm.style.fontSize = "14px";
    let ctl;
    if (proj.free) { ctl = document.createElement("input"); ctl.type = "range"; ctl.min = -1; ctl.max = 1; ctl.step = 0.05; ctl.value = ch.pan || 0; ctl.setAttribute("aria-label", `${ch.name} pan`); }
    else { ctl = document.createElement("select"); ctl.innerHTML = '<option value="-1">Left</option><option value="0">Center</option><option value="1">Right</option>'; ctl.value = String(C.panFor(proj, ch.pan || 0)); ctl.setAttribute("aria-label", `${ch.name} pan`); }
    ctl.onchange = () => {
      const v = +ctl.value;
      if (!proj.free && C.CHIPS[proj.chip].pan === "mono" && v !== 0) { say(C.limitText("mono", proj), true); ctl.value = "0"; return; }
      ch.pan = v; commit();
    };
    row.append(nm, ctl);
    if (ci >= C.CHIPS[proj.chip].channels.length) {
      const del = document.createElement("button"); del.className = "small"; del.textContent = "Remove"; del.style.flex = "none";
      del.onclick = () => { proj.channels.splice(ci, 1); proj.patterns.splice(ci, 1); proj.order.forEach((r) => r.splice(ci, 1)); S.ci = Math.min(S.ci, proj.channels.length - 1); commit(); };
      row.append(del);
    }
    pb.append(row);
  });
  const ab = $("addChBox"); ab.innerHTML = "";
  for (const k of C.CHIPS[proj.chip].extraKinds) {
    const b = document.createElement("button"); b.className = "small"; b.textContent = `Add ${C.KIND_NAME[k]} channel`;
    b.onclick = () => {
      if (!proj.free) { say(C.limitText("channels", proj), true); return; }
      if (proj.channels.length >= 12) { say("Twelve channels is the most this tool handles."); return; }
      C.addChannel(proj, k); S.ci = proj.channels.length - 1; commit();
    };
    ab.append(b);
  }
  renderSaved();
}
function renderArrangement() {
  const t = $("arr");
  let h = "<thead><tr><th>Row</th>" + proj.channels.map((c) => `<th>${esc(c.name)}</th>`).join("") + "</tr></thead><tbody>";
  proj.order.forEach((row, r) => {
    h += `<tr class="${r === S.row ? "on" : ""}"><td><button class="rb" data-row="${r}" title="Edit row ${r + 1}">${r + 1}${(proj.loopRow || 0) === r && proj.loop !== false ? "&#8634;" : ""}</button></td>`;
    row.forEach((pi, ci) => {
      const opts = [`<option value="-1"${pi < 0 ? " selected" : ""}>off</option>`].concat(proj.patterns[ci].map((p, k) => `<option value="${k}"${k === pi ? " selected" : ""}>${k + 1}${p.notes.length ? "" : " (empty)"}</option>`), [`<option value="new">new</option>`]);
      h += `<td><select data-row="${r}" data-ch="${ci}" aria-label="Row ${r + 1}, ${esc(proj.channels[ci].name)} pattern">${opts.join("")}</select></td>`;
    });
    h += "</tr>";
  });
  t.innerHTML = h + "</tbody>";
  t.querySelectorAll("button.rb").forEach((b) => { b.onclick = () => selectRow(+b.dataset.row); });
  t.querySelectorAll("select").forEach((s) => {
    s.onchange = () => {
      const r = +s.dataset.row, ci = +s.dataset.ch;
      if (s.value === "new") { proj.patterns[ci].push({ notes: [] }); proj.order[r][ci] = proj.patterns[ci].length - 1; }
      else proj.order[r][ci] = +s.value;
      S.sel.clear(); commit();
    };
  });
}
function setMode(mode) {
  if (mode === "free" && !proj.free) { proj.free = true; commit(); say("Free mode: the chip's limits are off. The badge lists anything a real chip couldn't play.");
  } else if (mode === "chip" && proj.free) {
    const { proj: p, issues } = C.fixProject(proj);
    const what = issues.map((i) => `${i.count} × ${SHORT[i.code] || i.code}`).join(", ");
    replaceProject(p, issues.length ? `Back in Chip mode. Fixed so the real chip can play it: ${what}.` : "Back in Chip mode. Nothing needed fixing.");
  }
}
const SHORT = { channels: "extra channels removed", overlap: "overlapping notes trimmed", duty: "pulse widths snapped", range: "notes moved an octave", triVol: "triangle volumes set to full", waveVol: "wave volumes snapped", dmgEnv: "envelopes changed to a one-way ramp", mono: "pans centered", pan3: "pans snapped to left, center or right", vol: "volumes rounded", wave4: "wave steps rounded" };
$("gName").oninput = (e) => { proj.name = e.target.value.slice(0, 80) || "Untitled song"; renderHead(); };
$("gName").onchange = () => commit();
$("gChip").onchange = (e) => {
  const { proj: p, dropped } = C.convertChip(proj, e.target.value);
  replaceProject(p, `Moved the song to the ${C.CHIPS[p.chip].name}.` + (dropped.length ? ` The ${dropped.join(" and ")} channel${dropped.length > 1 ? "s have" : " has"} no place on this chip, so ${dropped.length > 1 ? "they were" : "it was"} left out.` : "") + (p.chip === "dmg" ? " The triangle part now plays on the wave channel." : ""));
};
$("gMode").onchange = (e) => setMode(e.target.value);
$("gLen").onchange = (e) => { proj.patLen = +e.target.value; S.cursor = S.row * proj.patLen; commit(); };
$("gFilter").onchange = (e) => { proj.filter = e.target.checked; commit(); };
$("gLoop").onchange = (e) => { proj.loop = e.target.checked; commit(); };
$("gLoopRow").onchange = (e) => { proj.loopRow = +e.target.value; commit(); };
$("rAdd").onclick = () => addRow(false);
$("rDup").onclick = () => addRow(true);
$("rDel").onclick = () => {
  if (proj.order.length <= 1) { say("A song needs at least one row."); return; }
  proj.order.splice(S.row, 1); S.row = Math.min(S.row, proj.order.length - 1); proj.loopRow = Math.min(proj.loopRow || 0, proj.order.length - 1); S.sel.clear(); commit();
};
const moveRow = (d) => { const r = S.row, t = r + d; if (t < 0 || t >= proj.order.length) return; [proj.order[r], proj.order[t]] = [proj.order[t], proj.order[r]]; S.row = t; commit(); };
$("rUp").onclick = () => moveRow(-1);
$("rDown").onclick = () => moveRow(1);

// songs on this device
function songs() { try { return JSON.parse(store.get(KEY_SONGS) || "{}") || {}; } catch { return {}; } }
function renderSaved() {
  const ul = $("saved"), all = songs(), names = Object.keys(all).sort((a, b) => (all[b].at || 0) - (all[a].at || 0));
  ul.innerHTML = names.length ? "" : '<li><span class="tip">No saved songs yet.</span></li>';
  for (const name of names) {
    const li = document.createElement("li");
    const sp = document.createElement("span"); sp.textContent = name;
    const o = document.createElement("button"); o.className = "small"; o.textContent = "Open";
    o.onclick = () => { try { replaceProject(C.loadProject(JSON.parse(songs()[name].json)), `Opened "${name}".`); } catch (err) { say("Couldn't open that song: " + err.message, true); } };
    const d = document.createElement("button"); d.className = "small"; d.textContent = "Delete"; d.setAttribute("aria-label", `Delete ${name}`);
    d.onclick = () => { const a = songs(); delete a[name]; store.set(KEY_SONGS, JSON.stringify(a)); renderSaved(); say(`Deleted "${name}" from this device.`); };
    li.append(sp, o, d); ul.append(li);
  }
}
$("pSave").onclick = () => {
  const a = songs(); a[proj.name] = { json: JSON.stringify(proj), at: Date.now() };
  say(store.set(KEY_SONGS, JSON.stringify(a)) ? `Saved "${proj.name}" on this device.` : "This browser won't let the page save. Use Download song file instead.");
  renderSaved();
};
$("pNew").onclick = () => replaceProject(C.newProject(proj.chip), "New song. Click in the piano roll to add notes.");
$("pDown").onclick = () => download(new Blob([JSON.stringify(proj, null, 1)], { type: "application/json" }), safeName(proj.name) + ".chip.json");
$("pOpen").onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = "";
  if (!f) return;
  try { if (f.size > 4e6) throw new Error("the file is too big to be a song"); replaceProject(C.loadProject(JSON.parse(await f.text())), `Opened "${f.name}".`); }
  catch (err) { say("Couldn't open that file: " + err.message, true); }
};
fillSelect($("pDemo"), [["", "Pick a demo..."], ...C.DEMOS.map((d) => [d.id, d.name])]);
$("pDemo").onchange = (e) => { if (!e.target.value) return; const d = C.demoSong(e.target.value); e.target.value = ""; S.row = 0; replaceProject(d, `Loaded the demo "${d.name}". Press Play.`); };

// ---- Export
const safeName = (s) => (String(s).replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_") || "chip-song").slice(0, 60);
function download(blob, name) {
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  const link = document.createElement("a"); link.href = url; link.download = name; link.textContent = `Save ${name} again (${(blob.size / 1024).toFixed(0)} KB)`;
  $("xLinks").append(link);
}
let exporting = false;
$("xGo").onclick = async () => {
  if (exporting) return;
  const want = { wav: $("xWav").checked, mp3: $("xMp3").checked, stems: $("xStems").checked, midi: $("xMidi").checked };
  if (!Object.values(want).some(Boolean)) { $("xStatus").textContent = "Pick at least one thing to make."; return; }
  exporting = true; $("xGo").disabled = true; $("xLinks").innerHTML = "";
  const name = safeName(proj.name), sr = +$("xRate").value, loops = +$("xLoops").value;
  try {
    if (want.midi) download(new Blob([C.writeMidi(proj)], { type: "audio/midi" }), name + ".mid");
    if (want.wav || want.mp3 || want.stems) {
      $("xStatus").textContent = "Playing the chip into a file...";
      const r = await new Promise((resolve, reject) => {
        const w = new Worker("chip-render-worker.js", { type: "module" });
        w.onmessage = (e) => {
          if (e.data.type === "progress") $("xStatus").textContent = `Playing the chip into a file... ${e.data.pct}%`;
          else { w.terminate(); e.data.type === "done" ? resolve(e.data) : reject(new Error(e.data.message)); }
        };
        w.onerror = (e) => { w.terminate(); reject(new Error(e.message || "The renderer stopped.")); };
        w.postMessage({ project: proj, sr, stems: want.stems, loops, tail: 1.2 });
      });
      if (want.wav) download(new Blob([C.writeWav([r.L, r.R], sr)], { type: "audio/wav" }), name + ".wav");
      if (want.stems) {
        $("xStatus").textContent = "Zipping the stems...";
        const entries = r.chans.map((mono, i) => ({ name: `${name}/${String(i + 1).padStart(2, "0")} ${r.names[i].replace(/[^\w\- ]+/g, "")}.wav`, blob: new Blob([C.writeWav(stemStereo(mono, r.pans[i]), sr)]) }));
        entries.push({ name: `${name}/00 Mix.wav`, blob: new Blob([C.writeWav([r.L, r.R], sr)]) });
        download(await zip(entries), name + " stems.zip");
      }
      if (want.mp3) {
        $("xStatus").textContent = "Encoding MP3...";
        const mp3 = await new Promise((resolve) => {
          const w = new Worker("mp3-worker.js");
          w.onmessage = (e) => { if (e.data.type === "progress") $("xStatus").textContent = `Encoding MP3... ${e.data.pct}%`; else { w.terminate(); resolve(e.data.mp3); } };
          w.postMessage({ l: r.L, r: r.R, fs: sr, kbps: 320 });
        });
        download(new Blob([mp3], { type: "audio/mpeg" }), name + ".mp3");
      }
      $("xStatus").textContent = `Done: ${(r.length / sr).toFixed(1)} seconds. Your browser saved the files; the links below save them again.`;
    } else $("xStatus").textContent = "Done.";
  } catch (err) { $("xStatus").textContent = "Export failed: " + err.message; }
  exporting = false; $("xGo").disabled = false;
};

// ---- tabs, buttons, keys
document.querySelectorAll(".tabBar button").forEach((b) => b.addEventListener("click", () => {
  document.querySelectorAll(".tabBar button").forEach((x) => x.classList.toggle("on", x === b));
  document.querySelectorAll(".tabBody > section").forEach((s) => s.classList.toggle("show", s.dataset.tab === b.dataset.tab));
  if (b.dataset.tab === "sound") renderSoundTab();
}));
const showTab = (t) => document.querySelector(`.tabBar button[data-tab="${t}"]`)?.click();
$("badge").onclick = () => { showTab("song"); if (!C.checkProject(proj).length) say(proj.free ? "Free mode is on, but a real chip could still play every note." : "Hardware-legal: a real chip could play every note of this song."); };
$("playBtn").onclick = () => togglePlay();
$("modeRow").onclick = () => { S.playMode = "row"; if (S.playing) togglePlay(); renderTransport(); };
$("modeSong").onclick = () => { S.playMode = "song"; if (S.playing) togglePlay(); renderTransport(); };
$("toolDraw").onclick = () => { S.tool = "draw"; renderTransport(); roll.draw(); };
$("toolSel").onclick = () => { S.tool = "select"; renderTransport(); roll.draw(); };
$("noteLen").onchange = (e) => { S.noteLen = +e.target.value; };
$("bpm").onchange = (e) => { const v = Math.max(30, Math.min(400, +e.target.value || 150)); proj.bpm = v; commit(); };
$("viewRoll").onclick = () => setView("roll");
$("viewTrk").onclick = () => setView("trk");
function setView(v) {
  S.view = v;
  $("roll").classList.toggle("hidden", v !== "roll"); $("trk").classList.toggle("hidden", v !== "trk");
  if (v === "trk") { renderTracker(); $("trk").focus(); } else roll.resize();
  renderTransport();
}
document.addEventListener("keydown", (e) => {
  const t = e.target;
  if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA") && t.type !== "checkbox" && t.type !== "range") return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); doUndo(!e.shiftKey); return; }
  if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); doUndo(false); return; }
  if (e.key === " " && !(t && t.tagName === "BUTTON")) { e.preventDefault(); togglePlay(); return; }
  if (S.view === "trk" && document.activeElement === $("trk")) { if (trackerKey(e)) { e.preventDefault(); return; } }
  if (mod && e.key.toLowerCase() === "c" && S.sel.size) { const sel = [...S.sel], s0 = Math.min(...sel.map((n) => n.s)); clip = { kind: curKind(), notes: sel.map((n) => ({ ...n, s: n.s - s0 })) }; say(`Copied ${sel.length} note${sel.length > 1 ? "s" : ""}.`); return; }
  if (mod && e.key.toLowerCase() === "v" && clip) {
    e.preventDefault();
    const pat = pattern(true), L = proj.patLen, at = Math.max(0, Math.min(L - 1, S.cursor - S.row * L));
    const added = clip.notes.filter((n) => at + n.s < L).map((n) => ({ ...n, s: at + n.s, l: Math.min(n.l, L - at - n.s), fx: n.fx ? { ...n.fx } : undefined }));
    if (clip.kind !== curKind()) added.forEach((n) => { n.i = curInst(curKind()); });
    pat.notes.push(...added); S.sel = new Set(added); api.commit("move", added); return;
  }
  if ((e.key === "Delete" || e.key === "Backspace") && S.sel.size) { e.preventDefault(); api.remove([...S.sel]); return; }
  if (S.sel.size && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
    e.preventDefault();
    const L = proj.patLen, sel = [...S.sel], kind = curKind(), rows = C.rowsFor(proj.chip, kind).map((r) => r.p);
    const lo = Math.min(...rows), hi = Math.max(...rows);
    const dp = e.key === "ArrowUp" ? (e.shiftKey ? 12 : 1) : e.key === "ArrowDown" ? (e.shiftKey ? -12 : -1) : 0;
    const ds = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (sel.some((n) => n.s + ds < 0 || n.s + n.l + ds > L || n.p + dp < lo || n.p + dp > hi)) return;
    sel.forEach((n) => { n.s += ds; n.p += dp; });
    if (dp) preview(null, sel[0]);
    api.commit("move", sel); return;
  }
  if (!mod && /^[1-9]$/.test(e.key)) { selectChannel(+e.key - 1); return; }
});

function renderAll() {
  renderTransport(); renderHead(); renderChans(); renderRows();
  roll.draw();
  if (S.view === "trk") renderTracker();
  renderNoteTab(); renderSongTab();
  if (document.querySelector('.tabBar button[data-tab="sound"]').classList.contains("on")) renderSoundTab();
}
renderAll();
roll.resize();

// for the flow test
window.__chip = () => {
  const pat = C.patternAt(proj, S.row, S.ci);
  return { name: proj.name, chip: proj.chip, free: proj.free, channels: proj.channels.length, ci: S.ci, row: S.row, rows: proj.order.length, view: S.view,
    notes: pat ? pat.notes.length : 0, total: proj.patterns.reduce((a, ps) => a + ps.reduce((b, p) => b + p.notes.length, 0), 0), sel: S.sel.size,
    legal: C.checkProject(proj).length === 0, playing: S.playing, step: S.playStep, msg: S.lastMsg, undo: undo.length, audio: !!node, bpm: proj.bpm,
    lastNote: pat && pat.notes.length ? { ...pat.notes[pat.notes.length - 1] } : null };
};
window.__chipProject = () => JSON.parse(JSON.stringify(proj));
// screen position of a step and pitch in the piano roll (null when scrolled out of view)
window.__chipXY = (step, p) => {
  const r = $("roll").getBoundingClientRect(), rows = roll.rows(), i = rows.findIndex((x) => x.p === p) - roll.scroll;
  if (i < 0 || i >= roll.visibleRows()) return null;
  return { x: r.left + 54 + (step + 0.5) * roll.cw(), y: r.top + 22 + (i + 0.5) * roll.rh };
};
window.__chipVisibleP = (k) => roll.rows()[roll.scroll + k]?.p;
