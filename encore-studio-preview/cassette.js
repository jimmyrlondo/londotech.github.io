// ENCORE. Cassette: plan a tape release. Songs on side A and B, live time left, balance tips,
// a tape-sound preview that matches the export exactly, side exports for duplicators or a
// tape-style release, and a printable J-card. Everything stays on this device.
import { decodeAudio, ACCEPT } from "./audio-decode.js";
import { resample } from "./convert-core.js";
import { sideCapacity, sideStatus, advice, bestSplit, recommendTape, timelineFrames, tracklistText, fmt, safeName } from "./cassette-core.js";
import { TapeProcessor, tapeSettings, cleanTape, resampleLinear, wavHeader, pcmBlock, rng, gainToDb } from "./lofi-core.js";
import { drawCard, printFace } from "./cassette-jcard.js";

const $ = (id) => document.getElementById(id);
const SIDES = ["A", "B"];

// ---- state
const S = {
  tape: "C60", custom: 64, gap: 2, lead: 0, age: 0.35, fx: cleanTape(tapeSettings(0.35)), tapeOn: true,
  expKind: "dup", fmt: "wav16", rate: 44100,
  card: { title: "", artist: "", label: "", cat: "", year: String(new Date().getFullYear()), font: "DM Sans", panels: 3, fit: "fill", textPos: "bottom", spineDir: "down", bg: "#141210", fg: "#f2ede4", accent: "#ff3b00", notes: "", listFlap: false },
};
const songs = new Map();      // id -> { id, title, duration, fs, frames, peak, file }
const sides = { A: [], B: [] };
let cover = null, coverBlob = null;
let busy = false, lastExport = null;
const downloads = [];

const capacity = () => sideCapacity(S.tape, S.custom);
const durs = (side) => sides[side].map((id) => songs.get(id).duration);
const tapeName = () => (S.tape === "custom" ? "C" + S.custom : S.tape);
const say = (t, err = false) => { const el = $("status"); el.textContent = t; el.style.color = err ? "var(--red)" : ""; };

// ---- saving (IndexedDB; the tool works fine without it)
const DBN = "encore-cassette";
function idb() {
  return new Promise((res, rej) => {
    try {
      const r = indexedDB.open(DBN, 1);
      r.onupgradeneeded = () => r.result.createObjectStore("p");
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    } catch (e) { rej(e); }
  });
}
async function dbGet() {
  try { const db = await idb(); return await new Promise((res) => { const q = db.transaction("p").objectStore("p").get("project"); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); }); } catch { return null; }
}
let saveTimer = 0;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      const db = await idb();
      const data = { S: { ...S, card: { ...S.card } }, songs: [...songs.values()], sides: { A: [...sides.A], B: [...sides.B] }, coverBlob };
      db.transaction("p", "readwrite").objectStore("p").put(data, "project");
    } catch {}
  }, 350);
}
async function load() {
  const d = await dbGet();
  if (!d) return;
  try {
    Object.assign(S, d.S || {}, { card: { ...S.card, ...(d.S?.card || {}) } });
    S.fx = cleanTape(S.fx);
    for (const s of d.songs || []) if (s && s.file && s.duration > 0) songs.set(s.id, s);
    for (const k of SIDES) sides[k] = (d.sides?.[k] || []).filter((id) => songs.has(id));
    if (d.coverBlob) { coverBlob = d.coverBlob; cover = await bitmap(coverBlob).catch(() => null); }
  } catch {}
}

// ---- adding songs
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
// Songs still loading: shown as rows with a progress bar so a slow file never looks stuck.
// Reading the bytes is the part that can be slow (a cloud folder that downloads on open, a USB
// or network drive), so it gets a real percentage; decoding is quick and shows a pulse.
const pending = [];
const MB = (b) => (b / 1048576).toFixed(b < 10485760 ? 1 : 0);
function pendingRow(p) {
  const li = document.createElement("li");
  li.className = "song loading"; li.dataset.pid = p.id;
  li.innerHTML = `<span class="grip" aria-hidden="true">&#8987;</span><span class="t"></span><span class="d"></span><span class="lbar"><i></i></span><span class="lnote"></span>`;
  li.querySelector(".t").textContent = p.title;
  paintPending(p, li);
  return li;
}
function paintPending(p, li = document.querySelector(`.song.loading[data-pid="${p.id}"]`)) {
  if (!li) return;
  const pct = p.size ? Math.min(100, Math.round((p.loaded / p.size) * 100)) : 0;
  const secs = p.t0 ? Math.floor((performance.now() - p.t0) / 1000) : 0;
  li.classList.toggle("waiting", p.stage === "wait");
  li.classList.toggle("decoding", p.stage === "decode");
  li.querySelector(".lbar i").style.width = pct + "%";
  li.querySelector(".d").textContent = p.stage === "wait" ? "waiting" : p.stage === "decode" ? "decoding" : p.stage === "ready" ? "ready" : pct + "%";
  let note = "";
  if (p.stage === "read") {
    note = `Reading ${MB(p.loaded)} of ${MB(p.size)} MB` + (secs >= 3 ? `, ${secs}s` : "");
    const rate = secs ? p.loaded / ((performance.now() - p.t0) / 1000) : Infinity;
    if (secs >= 5 && rate < 2 * 1048576) note += ". Reading slowly: if this file is in a cloud folder or on a USB or network drive, it's being copied over first.";
  } else if (p.stage === "decode") {
    const ds = Math.floor((performance.now() - p.td) / 1000);
    note = ds >= 3 ? `Decoding, ${ds}s` : "";
  }
  li.querySelector(".lnote").textContent = note;
  li.setAttribute("aria-label", `${p.title}, loading, ${li.querySelector(".d").textContent}`);
}
let pendTick = 0;
function tickPending() {
  for (const p of pending) paintPending(p);
  if (pending.length && !pendTick) pendTick = setInterval(tickPending, 500);
  if (!pending.length && pendTick) { clearInterval(pendTick); pendTick = 0; }
}
async function readWithProgress(f, p) {
  p.stage = "read"; p.t0 = performance.now(); p.loaded = 0; paintPending(p);
  if (!f.stream) { const b = await f.arrayBuffer(); p.loaded = p.size; p.stage = "ready"; paintPending(p); return b; }
  const out = new Uint8Array(f.size);
  const reader = f.stream().getReader();
  let last = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (p.loaded + value.length > out.length) throw new Error("The file changed while it was being read.");
    out.set(value, p.loaded); p.loaded += value.length;
    const now = performance.now();
    if (now - last > 100) { last = now; paintPending(p); }
  }
  p.stage = "ready"; paintPending(p);
  return p.loaded === out.length ? out.buffer : out.slice(0, p.loaded).buffer;
}
const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

async function addFiles(files) {
  const list = [...files];
  if (!list.length) return;
  const items = list.map((f) => ({ f, p: { id: uid(), title: f.name.replace(/\.[^.]+$/, "").replace(/_+/g, " ").trim() || "Untitled", size: f.size, loaded: 0, stage: "wait" } }));
  pending.push(...items.map((x) => x.p));
  renderSides(); tickPending();
  // read up to two files ahead while the current one decodes
  const reads = new Array(items.length);
  let nextRead = 0;
  const startRead = () => { if (nextRead < items.length) { const k = nextRead++; reads[k] = readWithProgress(items[k].f, items[k].p); reads[k].catch(() => {}); } };
  startRead(); startRead();
  let added = 0;
  for (let i = 0; i < items.length; i++) {
    const { f, p } = items[i];
    say(`Loading ${i + 1} of ${list.length}: ${p.title}`);
    try {
      const buf = await reads[i].finally(startRead);
      p.stage = "decode"; p.td = performance.now(); paintPending(p);
      await frame(); // let the bar paint before a decode that can hold the page for a moment
      const d = await decodeAudio({ name: f.name, arrayBuffer: async () => buf });
      const frames = d.chans[0].length;
      if (!frames) throw new Error("empty");
      let pk = 0;
      for (const c of d.chans) for (let j = 0; j < c.length; j++) { const a = Math.abs(c[j]); if (a > pk) pk = a; }
      const s = { id: uid(), title: f.name.replace(/\.[^.]+$/, "").replace(/_+/g, " ").trim() || "Untitled", duration: frames / d.fs, fs: d.fs, frames, peak: pk, file: f };
      songs.set(s.id, s);
      // side A until it's full, then side B
      const fitsA = sideStatus([...durs("A"), s.duration], capacity(), S.gap, S.lead).left >= 0;
      (fitsA && !sides.B.length ? sides.A : sides.B).push(s.id);
      added++;
      pending.splice(pending.indexOf(p), 1);
      renderSides();
    } catch (e) {
      pending.splice(pending.indexOf(p), 1);
      renderSides();
      say(`Couldn't read ${f.name}. ${e.message && e.message.length < 120 ? e.message : ""}`, true);
      await new Promise((r) => setTimeout(r, 1200));
    }
  }
  tickPending();
  if (added) {
    const hot = [...songs.values()].filter((s) => s.peak > 0.999).length;
    say(`Added ${added} song${added === 1 ? "" : "s"}.` + (hot ? ` ${hot} peak${hot === 1 ? "s" : ""} at 0 dB: tape likes a little headroom, so think about mastering to around -1 dB.` : ""));
  }
  renderSides(); save(); drawCardSoon();
}

// ---- the side lists
function moveSong(id, to, idx = Infinity) {
  for (const k of SIDES) { const i = sides[k].indexOf(id); if (i >= 0) sides[k].splice(i, 1); }
  const list = sides[to];
  list.splice(Math.max(0, Math.min(list.length, idx)), 0, id);
  stopIfEdited(); renderSides(); save(); drawCardSoon();
}
function removeSong(id) {
  for (const k of SIDES) { const i = sides[k].indexOf(id); if (i >= 0) sides[k].splice(i, 1); }
  songs.delete(id); cache.delete(id);
  stopIfEdited(); renderSides(); save(); drawCardSoon();
}
function sideOf(id) { return SIDES.find((k) => sides[k].includes(id)); }
function stopIfEdited() { if (P) stop(); }

let suggestion = null;
function renderSides() {
  const cap = capacity();
  let num = 1;
  for (const k of SIDES) {
    const list = $("list" + k);
    list.textContent = "";
    if (!sides[k].length && !(pending.length && k === "A")) {
      const li = document.createElement("li"); li.className = "empty";
      li.textContent = songs.size ? "Drag songs here" : k === "A" ? "Add songs to start" : "";
      list.append(li);
    }
    for (const id of sides[k]) {
      const s = songs.get(id), li = document.createElement("li");
      li.className = "song"; li.tabIndex = 0; li.dataset.id = id; li.dataset.side = k;
      li.title = "Drag to move. Arrow keys work too.";
      li.innerHTML = `<span class="grip" aria-hidden="true">&#8942;&#8942;</span><span class="num">${num++}</span><span class="t"></span><span class="d">${fmt(s.duration)}</span>
        <span class="rowBtns"><button class="ib" data-act="play" title="Play from this song" aria-label="Play from this song">&#9654;</button><button class="ib" data-act="flip" title="Move to side ${k === "A" ? "B" : "A"}" aria-label="Move to side ${k === "A" ? "B" : "A"}">&#8644;</button><button class="ib" data-act="del" title="Remove" aria-label="Remove">&times;</button></span>`;
      li.querySelector(".t").textContent = s.title;
      li.setAttribute("aria-label", `${s.title}, ${fmt(s.duration)}, side ${k}`);
      list.append(li);
    }
    if (pending.length && k === (sides.B.length ? "B" : "A")) for (const p of pending) list.append(pendingRow(p));
    const st = sideStatus(durs(k), cap, S.gap, S.lead);
    $("time" + k).textContent = `${fmt(st.length)} / ${fmt(cap)}`;
    const fill = $("fill" + k);
    fill.style.width = Math.min(100, (st.length / cap) * 100) + "%";
    fill.className = st.status === "over" ? "over" : st.status === "tight" ? "tight" : "";
    const left = $("left" + k);
    left.textContent = st.left < 0 ? `${fmt(-st.left)} too long` : `${fmt(st.left)} left`;
    left.className = "left" + (st.left < 0 ? " over" : "");
  }
  const names = { A: sides.A.map((id) => songs.get(id).title), B: sides.B.map((id) => songs.get(id).title) };
  const adv = advice(durs("A"), durs("B"), cap, S.gap, S.lead, names);
  $("advice").innerHTML = "";
  suggestion = null;
  for (const a of adv) {
    const li = document.createElement("li"); li.className = a.level; li.textContent = a.text; $("advice").append(li);
    if (a.move) suggestion = a.move;
  }
  $("applyMove").classList.toggle("hidden", !suggestion);
  const total = sides.A.length + sides.B.length;
  const split = bestSplit([...durs("A"), ...durs("B")], S.gap, S.lead);
  const nowDiff = Math.abs(sideStatus(durs("A"), cap, S.gap, S.lead).length - sideStatus(durs("B"), cap, S.gap, S.lead).length);
  $("splitBtn").classList.toggle("hidden", total < 2 || split.at === sides.A.length || nowDiff - split.diff < 5);
  const any = total > 0;
  $("playA").disabled = !sides.A.length; $("playB").disabled = !sides.B.length;
  $("expA").disabled = busy || !sides.A.length; $("expB").disabled = busy || !sides.B.length; $("expList").disabled = !any;
  markPlaying();
  drawScrub();
}

$("applyMove").onclick = () => {
  const m = suggestion; if (!m) return;
  const other = m.from === "A" ? "B" : "A";
  if (m.kind === "move") moveSong(sides[m.from][m.i], other);
  else {
    const a = sides[m.from][m.i], b = sides[other][m.j];
    sides[m.from][m.i] = b; sides[other][m.j] = a;
    stopIfEdited(); renderSides(); save(); drawCardSoon();
  }
};
$("splitBtn").onclick = () => {
  const all = [...sides.A, ...sides.B], sp = bestSplit(all.map((id) => songs.get(id).duration), S.gap, S.lead);
  sides.A = all.slice(0, sp.at); sides.B = all.slice(sp.at);
  stopIfEdited(); renderSides(); save(); drawCardSoon();
};

// row buttons and keys
for (const k of SIDES) {
  const list = $("list" + k);
  list.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-act]"); if (!b) return;
    const id = b.closest(".song").dataset.id, side = sideOf(id);
    if (b.dataset.act === "del") removeSong(id);
    else if (b.dataset.act === "flip") moveSong(id, side === "A" ? "B" : "A");
    else if (b.dataset.act === "play") play(side, startOf(side, id));
  });
  list.addEventListener("keydown", (e) => {
    const li = e.target.closest(".song"); if (!li || e.target !== li) return;
    const id = li.dataset.id, side = sideOf(id), i = sides[side].indexOf(id);
    let handled = true;
    if (e.key === "ArrowUp" && i > 0) moveSong(id, side, i - 1);
    else if (e.key === "ArrowDown" && i < sides[side].length - 1) moveSong(id, side, i + 1);
    else if (e.key === "ArrowLeft" && side === "B") moveSong(id, "A", i);
    else if (e.key === "ArrowRight" && side === "A") moveSong(id, "B", i);
    else if (e.key === "Delete" || e.key === "Backspace") removeSong(id);
    else if (e.key === "Enter") play(side, startOf(side, id));
    else handled = false;
    if (handled) { e.preventDefault(); const again = document.querySelector(`.song[data-id="${id}"]`); again?.focus(); }
  });
  list.addEventListener("dblclick", (e) => {
    const t = e.target.closest(".t"); if (!t) return;
    const id = t.closest(".song").dataset.id, s = songs.get(id);
    const inp = document.createElement("input"); inp.type = "text"; inp.value = s.title; inp.maxLength = 80;
    inp.style.cssText = "min-height:28px;padding:3px 6px;width:100%";
    t.replaceWith(inp); inp.focus(); inp.select();
    const done = (ok) => { if (ok && inp.value.trim()) s.title = inp.value.trim(); renderSides(); save(); drawCardSoon(); };
    inp.addEventListener("keydown", (ev) => { ev.stopPropagation(); if (ev.key === "Enter") done(true); if (ev.key === "Escape") done(false); });
    inp.addEventListener("blur", () => done(true), { once: true });
  });
}

// dragging songs (mouse anywhere on a row; touch from the grip so lists still scroll)
let drag = null;
document.addEventListener("pointerdown", (e) => {
  const li = e.target.closest(".song:not(.loading)");
  if (!li || e.button > 0 || e.target.closest("button, input")) return;
  if (e.pointerType !== "mouse" && !e.target.closest(".grip")) return;
  drag = { id: li.dataset.id, li, x: e.clientX, y: e.clientY, on: false, pid: e.pointerId };
});
document.addEventListener("pointermove", (e) => {
  if (!drag || e.pointerId !== drag.pid) return;
  if (!drag.on) {
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
    drag.on = true;
    drag.li.classList.add("dragging");
    drag.ghost = document.createElement("div"); drag.ghost.className = "ghost"; drag.ghost.textContent = songs.get(drag.id).title;
    document.body.append(drag.ghost);
    drag.marker = document.createElement("li"); drag.marker.className = "marker";
  }
  e.preventDefault();
  drag.ghost.style.left = e.clientX + 12 + "px"; drag.ghost.style.top = e.clientY - 14 + "px";
  const side = document.elementFromPoint(e.clientX, e.clientY)?.closest(".side");
  document.querySelectorAll(".side").forEach((s) => s.classList.toggle("drop", s === side));
  drag.target = null;
  if (side) {
    const k = side.dataset.side, list = $("list" + k);
    const rows = [...list.querySelectorAll(".song:not(.loading)")].filter((r) => r !== drag.li);
    let idx = rows.findIndex((r) => { const b = r.getBoundingClientRect(); return e.clientY < b.top + b.height / 2; });
    if (idx < 0) idx = rows.length;
    drag.target = { side: k, idx };
    if (idx < rows.length) list.insertBefore(drag.marker, rows[idx]); else list.append(drag.marker);
  } else drag.marker.remove();
}, { passive: false });
function endDrag(commit) {
  if (!drag) return;
  const d = drag; drag = null;
  if (!d.on) return;
  d.ghost.remove(); d.marker.remove(); d.li.classList.remove("dragging");
  document.querySelectorAll(".side").forEach((s) => s.classList.remove("drop"));
  if (commit && d.target) moveSong(d.id, d.target.side, d.target.idx);
}
document.addEventListener("pointerup", () => endDrag(true));
document.addEventListener("pointercancel", () => endDrag(false));

// ---- tape settings
$("fTape").onchange = () => { S.tape = $("fTape").value; $("customWrap").classList.toggle("hidden", S.tape !== "custom"); renderSides(); save(); };
$("fCustom").onchange = () => { S.custom = Math.max(4, Math.min(200, Math.round((+$("fCustom").value || 64) / 2) * 2)); $("fCustom").value = S.custom; renderSides(); save(); };
$("fGap").onchange = () => { S.gap = +$("fGap").value; stopIfEdited(); renderSides(); save(); };
$("addBtn").onclick = () => $("fileIn").click();
$("fileIn").accept = ACCEPT;
$("fileIn").onchange = (e) => { if (e.target.files.length) addFiles(e.target.files); e.target.value = ""; };
// drop files anywhere on the page
document.addEventListener("dragover", (e) => { if (e.dataTransfer?.types?.includes("Files")) e.preventDefault(); });
document.addEventListener("drop", (e) => {
  if (!e.dataTransfer?.files?.length) return;
  e.preventDefault();
  const imgs = [...e.dataTransfer.files].filter((f) => f.type.startsWith("image/"));
  const aud = [...e.dataTransfer.files].filter((f) => !f.type.startsWith("image/"));
  if (imgs.length) setCover(imgs[0]);
  if (aud.length) addFiles(aud);
});

// ---- preview playback: the same TapeProcessor as the export, fed in small chunks
let ctx = null;
const audio = () => (ctx ||= new (window.AudioContext || window.webkitAudioContext)());
const cache = new Map(); // id -> { p, v }
function songAudio(id) {
  let e = cache.get(id);
  if (!e) {
    e = { v: null };
    e.p = (async () => {
      const s = songs.get(id), d = await decodeAudio(s.file);
      let ch = d.chans.length === 1 ? [d.chans[0], d.chans[0]] : d.chans.slice(0, 2);
      const fs = audio().sampleRate;
      if (d.fs !== fs) ch = ch.map((c) => resampleLinear(c, d.fs, fs));
      e.v = ch;
      return ch;
    })().catch((err) => { cache.delete(id); say(`Couldn't play ${songs.get(id)?.title}.`, true); throw err; });
    cache.set(id, e);
    // keep only a few songs in memory
    while (cache.size > 4) { const old = [...cache.keys()].find((k) => k !== id); cache.delete(old); }
  }
  return e;
}
const seedFor = (side) => (side === "A" ? 1001 : 2002);
let P = null;
const rateNow = () => (ctx ? ctx.sampleRate : 48000);
function sideParts(side) {
  return timelineFrames(sides[side].map((id) => songs.get(id)), rateNow(), S.gap, S.lead);
}
function startOf(side, id) {
  const { parts } = sideParts(side), p = parts.find((q) => q.kind === "song" && q.song.id === id);
  return p ? p.start / rateNow() : 0;
}
async function play(side, from = 0) {
  if (!sides[side].length) return;
  stop(true);
  const c = audio();
  try { await c.resume(); } catch {}
  const { parts, frames } = sideParts(side);
  P = { side, parts, total: frames, frame: Math.max(0, Math.min(frames - 1, Math.round(from * c.sampleRate))), nextTime: c.currentTime + 0.15,
        chunks: [], sources: new Set(), tape: new TapeProcessor(c.sampleRate, 2, S.fx, seedFor(side)), waiting: false };
  P.timer = setInterval(pump, 40);
  pump();
  $("stopBtn").disabled = false;
  lastSide = side;
  requestAnimationFrame(tick);
}
function stop(quiet = false) {
  if (!P) return;
  clearInterval(P.timer);
  for (const s of P.sources) { try { s.stop(); } catch {} }
  P = null;
  $("stopBtn").disabled = true;
  if (!quiet) { markPlaying(); drawScrub(); $("nowSong").textContent = "Stopped"; }
}
function pump() {
  if (!P || !ctx) return;
  const fs = ctx.sampleRate, N = Math.round(fs * 0.2);
  while (P && P.nextTime < ctx.currentTime + 0.9 && P.frame < P.total) {
    const a = P.frame, b = Math.min(P.total, a + N), n = b - a;
    const over = P.parts.filter((p) => p.start < b && p.start + p.frames > a);
    // every song this chunk needs must be decoded; fetch the next one early
    let ready = true;
    for (const p of over) if (p.kind === "song") { const e = songAudio(p.song.id); if (!e.v) { ready = false; e.p.catch(() => {}); } }
    const ahead = P.parts.find((p) => p.kind === "song" && p.start >= b && p.start < b + fs * 20);
    if (ahead) songAudio(ahead.song.id).p.catch(() => {});
    if (!ready) { P.waiting = true; return; }
    if (P.waiting || P.nextTime < ctx.currentTime + 0.02) { P.nextTime = Math.max(P.nextTime, ctx.currentTime + 0.06); P.waiting = false; }
    const L = new Float32Array(n), R = new Float32Array(n);
    for (const p of over) {
      if (p.kind !== "song") continue;
      const ch = cache.get(p.song.id).v, s0 = Math.max(a, p.start), s1 = Math.min(b, p.start + p.frames);
      for (let f = s0; f < s1; f++) { const j = f - p.start; L[f - a] = ch[0][j] || 0; R[f - a] = ch[1][j] || 0; }
    }
    const oL = new Float32Array(n), oR = new Float32Array(n);
    P.tape.process([L, R], [oL, oR]);
    const buf = ctx.createBuffer(2, n, fs);
    buf.copyToChannel(S.tapeOn ? oL : L, 0); buf.copyToChannel(S.tapeOn ? oR : R, 1);
    const src = ctx.createBufferSource();
    src.buffer = buf; src.connect(ctx.destination); src.start(P.nextTime);
    const set = P.sources; set.add(src); src.onended = () => set.delete(src);
    P.chunks.push({ t: P.nextTime, frame: a }); if (P.chunks.length > 40) P.chunks.shift();
    P.frame = b; P.nextTime += n / fs;
  }
  if (P && P.frame >= P.total && ctx.currentTime > P.nextTime + 0.05) { stop(); $("nowSong").textContent = `End of side ${lastSide}`; }
}
function posFrame() {
  if (!P || !ctx) return 0;
  const now = ctx.currentTime;
  let c = null;
  for (const ch of P.chunks) if (ch.t <= now) c = ch;
  if (!c) return P.chunks[0]?.frame ?? P.frame;
  return Math.min(P.total, c.frame + (now - c.t) * ctx.sampleRate);
}
let lastSide = "A", spin = 0, lastT = 0;
function tick(t) {
  if (!P) return;
  const dt = lastT ? (t - lastT) / 1000 : 0; lastT = t;
  spin += dt * 2.6;
  markPlaying(); drawScrub(); drawReels();
  requestAnimationFrame(tick);
}
function partAt(frame) { return P?.parts.find((p) => frame >= p.start && frame < p.start + p.frames) || null; }
function markPlaying() {
  const f = posFrame(), part = P ? partAt(f) : null, id = part?.kind === "song" ? part.song.id : null;
  document.querySelectorAll(".song").forEach((li) => li.classList.toggle("playing", li.dataset.id === id));
  if (P) {
    const fs = ctx.sampleRate;
    $("nowSong").textContent = P.waiting ? "Loading the next song..." : part?.kind === "song" ? `Side ${P.side}: ${part.song.title}` : `Side ${P.side}: gap`;
    $("nowTime").textContent = `${fmt(f / fs)} / ${fmt(P.total / fs)}`;
  }
}
function drawScrub() {
  const el = $("scrub"), side = P ? P.side : lastSide;
  el.querySelectorAll(".seg").forEach((s) => s.remove());
  if (!sides[side].length) { $("head").style.left = "0"; if (!P) $("nowTime").textContent = "0:00 / 0:00"; return; }
  const { parts, frames } = P ? P : sideParts(side);
  for (const p of parts) if (p.kind === "song") {
    const d = document.createElement("div"); d.className = "seg";
    d.style.left = (p.start / frames) * 100 + "%"; d.style.width = (p.frames / frames) * 100 + "%";
    d.title = p.song.title; el.insertBefore(d, $("head"));
  }
  $("head").style.left = P ? (posFrame() / frames) * 100 + "%" : "0";
  if (!P) $("nowTime").textContent = `0:00 / ${fmt(frames / rateNow())}`;
}
$("scrub").addEventListener("click", (e) => {
  const side = P ? P.side : lastSide;
  if (!sides[side].length) return;
  const r = $("scrub").getBoundingClientRect(), frac = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  const { frames } = sideParts(side);
  play(side, (frac * frames) / rateNow());
});
$("playA").onclick = () => play("A");
$("playB").onclick = () => play("B");
$("stopBtn").onclick = () => stop();
$("fTapeOn").onchange = () => { S.tapeOn = $("fTapeOn").checked; save(); };

// the little cassette: reels fill and empty as the side plays
function drawReels() {
  const c = $("reels"), g = c.getContext("2d"), W = c.width, H = c.height;
  g.clearRect(0, 0, W, H);
  const p = P ? posFrame() / P.total : 0;
  g.fillStyle = "#26211d"; g.strokeStyle = "#4a423b"; g.lineWidth = 3;
  g.beginPath(); g.roundRect(4, 4, W - 8, H - 8, 12); g.fill(); g.stroke();
  g.fillStyle = "#ff3b00"; g.fillRect(18, 16, W - 36, 18);
  g.fillStyle = "#fff"; g.font = "700 13px 'DM Sans', sans-serif"; g.textBaseline = "middle";
  g.fillText(P ? `SIDE ${P.side}` : tapeName(), 26, 25);
  g.fillStyle = "#0d0b0a"; g.beginPath(); g.roundRect(46, 50, W - 92, 58, 8); g.fill();
  const rMin = 13, rMax = 27;
  const packs = [rMin + (rMax - rMin) * Math.sqrt(1 - p), rMin + (rMax - rMin) * Math.sqrt(p)];
  [[70, 79], [W - 70, 79]].forEach(([x, y], i) => {
    g.fillStyle = "#5a4636"; g.beginPath(); g.arc(x, y, packs[i], 0, 7); g.fill();
    g.fillStyle = "#ddd5ca"; g.beginPath(); g.arc(x, y, 11, 0, 7); g.fill();
    g.strokeStyle = "#26211d"; g.lineWidth = 3;
    for (let k = 0; k < 3; k++) { const a = spin * (i ? 1.0 : 1.0) + (k * Math.PI * 2) / 3; g.beginPath(); g.moveTo(x + Math.cos(a) * 4, y + Math.sin(a) * 4); g.lineTo(x + Math.cos(a) * 10, y + Math.sin(a) * 10); g.stroke(); }
  });
  g.fillStyle = "#4a423b"; g.beginPath(); g.moveTo(60, H - 6); g.lineTo(76, H - 26); g.lineTo(W - 76, H - 26); g.lineTo(W - 60, H - 6); g.fill();
}

// ---- tape sound controls
const FX = [
  ["fWow", "oWow", "wowCents", (v) => `${(+v).toFixed(1)} c`],
  ["fFlutter", "oFlutter", "flutterCents", (v) => `${(+v).toFixed(1)} c`],
  ["fHiss", "oHiss", "hissDb", (v) => (v <= -89 ? "off" : `${Math.round(v)} dB`)],
  ["fSat", "oSat", "saturation", (v) => `${Math.round(v * 100)}%`],
  ["fRoll", "oRoll", "rolloffHz", (v) => `${(v / 1000).toFixed(1)} k`],
  ["fDrop", "oDrop", "dropouts", (v) => `${(+v).toFixed(1)}/min`],
  ["fBump", "oBump", "bump", (v) => `${(+v).toFixed(1)} dB`],
];
function showFx() {
  $("fAge").value = S.age; $("oAge").textContent = Math.round(S.age * 100) + "%";
  for (const [i, o, k, f] of FX) { $(i).value = S.fx[k]; $(o).textContent = f(S.fx[k]); }
  document.querySelectorAll("#presets button").forEach((b) => b.classList.toggle("on", Math.abs(+b.dataset.age - S.age) < 0.005 && JSON.stringify(cleanTape(tapeSettings(S.age))) === JSON.stringify(S.fx)));
}
function fxChanged() { if (P) P.tape.set(S.fx); showFx(); save(); }
$("fAge").oninput = () => { S.age = +$("fAge").value; S.fx = cleanTape(tapeSettings(S.age)); fxChanged(); };
for (const [i, , k] of FX) $(i).oninput = () => { S.fx = cleanTape({ ...S.fx, [k]: +$(i).value }); fxChanged(); };
document.querySelectorAll("#presets button").forEach((b) => (b.onclick = () => { S.age = +b.dataset.age; S.fx = cleanTape(tapeSettings(S.age)); fxChanged(); }));

// ---- export
function expTip() {
  const kind = S.expKind;
  $("expTip").textContent = kind === "dup"
    ? "Clean audio, no tape sound: the real tape adds its own. Most duplicators want WAV at 44.1 kHz, 16-bit. MP3 is not accepted by most."
    : "The tape sound from the Tape sound tab is printed in, the same as you heard it.";
}
document.querySelectorAll("input[name=expKind]").forEach((r) => (r.onchange = () => {
  S.expKind = document.querySelector("input[name=expKind]:checked").value;
  if (S.expKind === "dup" && S.fmt === "mp3") { S.fmt = "wav16"; $("fFmt").value = "wav16"; }
  expTip(); save();
}));
$("fFmt").onchange = () => { S.fmt = $("fFmt").value; save(); };
$("fRate").onchange = () => { S.rate = +$("fRate").value; save(); };
$("fLead").onchange = () => { S.lead = +$("fLead").value; stopIfEdited(); renderSides(); save(); };

const tick0 = () => new Promise((r) => setTimeout(r, 0));
function addDownload(blob, name, label) {
  const url = URL.createObjectURL(blob);
  const old = downloads.findIndex((d) => d.name === name);
  if (old >= 0) { URL.revokeObjectURL(downloads[old].url); downloads.splice(old, 1); }
  downloads.unshift({ name, url, label, size: blob.size });
  const box = $("downloads"); box.textContent = "";
  for (const d of downloads) {
    const a = document.createElement("a"); a.href = d.url; a.download = d.name;
    a.innerHTML = `<span></span><small>${(d.size / 1048576).toFixed(1)} MB</small>`;
    a.firstChild.textContent = d.label;
    box.append(a);
  }
  return url;
}
function fitLength(ch, n) {
  return ch.map((c) => { if (c.length === n) return c; const o = new Float32Array(n); o.set(c.subarray(0, Math.min(n, c.length))); return o; });
}
async function exportSide(side) {
  if (busy || !sides[side].length) return;
  stop();
  busy = true; renderSides();
  const fs = S.rate, tapeOn = S.expKind === "tape", fmtSel = S.fmt, bits = fmtSel === "wav24" ? 24 : 16, mp3 = fmtSel === "mp3";
  const list = sides[side].map((id) => songs.get(id));
  const plan = list.map((s) => ({ ...s, frames: s.fs === fs ? s.frames : Math.round((s.frames * fs) / s.fs), fs }));
  const { parts, frames: total } = timelineFrames(plan, fs, S.gap, S.lead);
  const tape = tapeOn ? new TapeProcessor(fs, 2, S.fx, seedFor(side)) : null;
  let skip = tape ? tape.latency : 0, written = 0, pk = 0;
  const out = [];
  let worker = null, pending = 0, wake = null;
  if (mp3) {
    worker = new Worker("cassette-mp3-worker.js");
    worker.postMessage({ type: "init", fs, kbps: 320 });
    worker.onmessage = (e) => { if (e.data.type === "ack") { pending--; wake?.(); } else if (e.data.type === "done") worker.done(e.data.blob); };
  } else out.push(wavHeader(total, fs, 2, bits));
  const dither = rng(4242);
  $("expBar").classList.remove("hidden"); $("expFill").style.width = "0";
  const status = (t) => ($("expStatus").textContent = t);
  const emit = async (L, R) => {
    if (tape) tape.process([L, R], [L, R]);
    let a = 0;
    if (skip) { a = Math.min(skip, L.length); skip -= a; }
    let n = Math.min(L.length - a, total - written);
    if (n <= 0) return;
    const l = L.subarray(a, a + n), r = R.subarray(a, a + n);
    for (let i = 0; i < n; i++) { const x = Math.max(Math.abs(l[i]), Math.abs(r[i])); if (x > pk) pk = x; }
    if (mp3) {
      while (pending > 6) await new Promise((res) => (wake = res));
      pending++;
      const lc = l.slice(), rc = r.slice();
      worker.postMessage({ type: "chunk", l: lc, r: rc }, [lc.buffer, rc.buffer]);
    } else out.push(pcmBlock([l, r], bits, dither));
    written += n;
    $("expFill").style.width = ((written / total) * 100).toFixed(1) + "%";
  };
  const B = 65536;
  try {
    for (const p of parts) {
      if (p.kind === "gap") {
        for (let s = 0; s < p.frames; s += B) { const n = Math.min(B, p.frames - s); await emit(new Float32Array(n), new Float32Array(n)); }
        continue;
      }
      status(`Side ${side}: ${p.song.title}...`);
      await tick0();
      const d = await decodeAudio(p.song.file);
      let ch = d.chans.length === 1 ? [d.chans[0], d.chans[0]] : d.chans.slice(0, 2);
      if (d.fs !== fs) { status(`Side ${side}: ${p.song.title} (changing the sample rate)...`); await tick0(); ch = resample(ch, d.fs, fs); }
      ch = fitLength(ch, p.frames);
      for (let s = 0; s < p.frames; s += B) {
        const e = Math.min(p.frames, s + B);
        await emit(ch[0].slice(s, e), ch[1].slice(s, e));
        if ((s / B) % 8 === 7) await tick0();
      }
    }
    // the tape's small delay: feed silence until every frame is out
    while (written < total) { const n = Math.min(B, total - written + skip); await emit(new Float32Array(n), new Float32Array(n)); }
    let blob;
    if (mp3) {
      while (pending > 0) await new Promise((res) => (wake = res));
      blob = await new Promise((res) => { worker.done = res; worker.postMessage({ type: "end" }); });
      worker.terminate();
    } else blob = new Blob(out, { type: "audio/wav" });
    const name = `${safeName(S.card.title || S.card.artist || "Tape")} - Side ${side}.${mp3 ? "mp3" : "wav"}`;
    const label = `Side ${side} (${fmt(total / fs)}, ${mp3 ? "MP3 320k" : `WAV ${bits}-bit`}, ${fs / 1000} kHz${tapeOn ? ", tape sound" : ""})`;
    addDownload(blob, name, label);
    lastExport = { side, name, frames: total, fs, bits: mp3 ? null : bits, size: blob.size, peakDb: gainToDb(pk), tape: tapeOn, format: mp3 ? "mp3" : "wav" };
    status(`Side ${side} is ready: ${fmt(total / fs)}, peak ${pk > 0 ? gainToDb(pk).toFixed(1) : "-inf"} dB.${pk > 0.99 && !tapeOn ? " The loudest moment is at 0 dB; a little headroom (-1 dB) is kinder to tape." : ""} Click it below to save.`);
  } catch (e) {
    status(`The export stopped: ${e.message || e}`);
    worker?.terminate();
  } finally {
    busy = false; renderSides();
    setTimeout(() => $("expBar").classList.add("hidden"), 800);
  }
}
$("expA").onclick = () => exportSide("A");
$("expB").onclick = () => exportSide("B");
$("expList").onclick = () => {
  const obj = (id) => songs.get(id);
  const txt = tracklistText({ title: S.card.title, artist: S.card.artist, tape: tapeName(), A: sides.A.map(obj), B: sides.B.map(obj), gap: S.gap, lead: S.lead });
  const rec = recommendTape(sideStatus(durs("A"), 1e9, S.gap, S.lead).length, sideStatus(durs("B"), 1e9, S.gap, S.lead).length);
  const full = txt + `\r\nShortest stock tape that fits: ${rec.stock || "none (longer than a C90)"}. Custom length: ${rec.custom}.\r\n`;
  addDownload(new Blob([full], { type: "text/plain" }), `${safeName(S.card.title || "Tape")} - tracklist.txt`, "Tracklist (.txt)");
  $("expStatus").textContent = "Tracklist ready below.";
};

// ---- J-card
const CARD_FIELDS = { cTitle: "title", cArtist: "artist", cLabel: "label", cCat: "cat", cYear: "year", cFont: "font", cPanels: "panels", cFit: "fit", cTextPos: "textPos", cSpineDir: "spineDir", cBg: "bg", cFg: "fg", cAccent: "accent", cNotes: "notes", cListFlap: "listFlap" };
let face = "outside";
function showCard() {
  for (const [id, k] of Object.entries(CARD_FIELDS)) { const el = $(id); if (el.type === "checkbox") el.checked = !!S.card[k]; else el.value = S.card[k]; }
  $("coverClear").classList.toggle("hidden", !cover);
}
for (const [id, k] of Object.entries(CARD_FIELDS)) {
  const el = $(id);
  el.addEventListener(el.tagName === "SELECT" || el.type === "checkbox" || el.type === "color" ? "change" : "input", () => {
    S.card[k] = el.type === "checkbox" ? el.checked : k === "panels" ? +el.value : el.value;
    drawCardSoon(); save();
  });
  if (el.type === "color") el.addEventListener("input", () => { S.card[k] = el.value; drawCardSoon(); });
}
async function bitmap(blob) {
  if (window.createImageBitmap) return createImageBitmap(blob);
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(blob); });
}
async function setCover(file) {
  try { cover = await bitmap(file); coverBlob = file; showCard(); drawCardSoon(); save(); }
  catch { say("That image couldn't be opened.", true); }
}
$("coverBtn").onclick = () => $("coverIn").click();
$("coverIn").onchange = (e) => { if (e.target.files[0]) setCover(e.target.files[0]); e.target.value = ""; };
$("coverClear").onclick = () => { cover = null; coverBlob = null; showCard(); drawCardSoon(); save(); };
$("faceOut").onclick = () => { face = "outside"; $("faceOut").classList.add("on"); $("faceIn").classList.remove("on"); drawCardSoon(); };
$("faceIn").onclick = () => { face = "inside"; $("faceIn").classList.add("on"); $("faceOut").classList.remove("on"); drawCardSoon(); };
$("fGuides").onchange = () => drawCardSoon();
const cardSides = () => ({ A: sides.A.map((id) => songs.get(id)), B: sides.B.map((id) => songs.get(id)) });
let cardQueued = false;
function drawCardSoon() {
  if (cardQueued) return;
  cardQueued = true;
  requestAnimationFrame(async () => {
    cardQueued = false;
    try { await document.fonts.load(`700 20px "${S.card.font}"`); await document.fonts.load(`500 20px "${S.card.font}"`); } catch {}
    if ($("cardView").classList.contains("hidden")) return;
    const L = drawCard($("cardCanvas"), { ...S.card, gap: S.gap }, cover, cardSides(), { face, dpi: 200, guides: $("fGuides").checked });
    $("cardNote").textContent = `${face === "outside" ? "Outside" : "Inside"}: ${L.width.toFixed(1)} x ${L.height.toFixed(1)} mm trimmed (${(L.width / 25.4).toFixed(3)} x ${(L.height / 25.4).toFixed(2)} in), ${L.full.width.toFixed(1)} x ${L.full.height.toFixed(1)} mm with bleed.`;
  });
}
async function cardPng(which) {
  try { await document.fonts.load(`700 20px "${S.card.font}"`); } catch {}
  const c = document.createElement("canvas");
  drawCard(c, { ...S.card, gap: S.gap }, cover, cardSides(), { face: which, dpi: 300, guides: false });
  const blob = await new Promise((r) => c.toBlob(r, "image/png"));
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = `${safeName(S.card.title || "Tape")} J-card ${which}.png`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  lastCardPng = { which, width: c.width, height: c.height, size: blob.size };
}
let lastCardPng = null;
$("pngOut").onclick = () => cardPng("outside");
$("pngIn").onclick = () => cardPng("inside");
$("printBtn").onclick = async () => {
  try { await document.fonts.load(`700 20px "${S.card.font}"`); } catch {}
  const sheet = $("printSheet"); sheet.textContent = "";
  const loads = [];
  for (const which of ["outside", "inside"]) {
    const f = printFace({ ...S.card, gap: S.gap }, cover, cardSides(), which);
    const p = document.createElement("p");
    p.textContent = which === "outside" ? "J-card outside. Print at 100% (actual size). Cut on the corner marks, fold on the dashed marks." : "J-card inside. Print on the back of the same sheet, flipped on the long edge.";
    const img = new Image();
    img.style.width = f.widthMm.toFixed(2) + "mm"; img.style.height = f.heightMm.toFixed(2) + "mm";
    loads.push(new Promise((r) => { img.onload = r; img.onerror = r; }));
    img.src = f.canvas.toDataURL("image/png");
    sheet.append(p, img);
  }
  await Promise.all(loads);
  window.print();
};

// ---- tabs: the J-card tab swaps the main panel to the card preview
document.querySelectorAll(".tabBar button").forEach((b) => (b.onclick = () => {
  document.querySelectorAll(".tabBar button").forEach((x) => x.classList.toggle("on", x === b));
  document.querySelectorAll(".tabBody > section").forEach((s) => s.classList.toggle("show", s.dataset.tab === b.dataset.tab));
  const card = b.dataset.tab === "card";
  $("cardView").classList.toggle("hidden", !card);
  $("sidesView").style.display = card ? "none" : "contents";
  if (card) drawCardSoon();
}));

// keys: space plays or stops the last side (when not typing)
document.addEventListener("keydown", (e) => {
  if (e.target.closest?.("input, textarea, select, button, .song")) return;
  if (e.code === "Space") { e.preventDefault(); if (P) stop(); else if (sides[lastSide].length) play(lastSide); else if (sides.A.length) play("A"); }
});
window.addEventListener("resize", () => drawCardSoon());

// for the flow test
window.__cassetteAdd = (files) => addFiles(files); // test hook
window.__cassette = () => ({
  songs: [...songs.values()].map((s) => ({ id: s.id, title: s.title, duration: s.duration })),
  A: sides.A.map((id) => songs.get(id).title), B: sides.B.map((id) => songs.get(id).title),
  playing: !!P, side: P?.side || null, pos: P ? posFrame() / ctx.sampleRate : 0, waiting: !!P?.waiting,
  loading: pending.map((p) => ({ title: p.title, stage: p.stage, pct: p.size ? Math.round((p.loaded / p.size) * 100) : 0 })),
  busy, lastExport, lastCardPng, downloads: downloads.map((d) => d.name), card: { ...S.card }, fx: { ...S.fx }, age: S.age, tape: S.tape,
  advice: [...document.querySelectorAll("#advice li")].map((l) => l.textContent),
});

// ---- start
(async () => {
  await load();
  $("fTape").value = S.tape; $("customWrap").classList.toggle("hidden", S.tape !== "custom");
  $("fCustom").value = S.custom; $("fGap").value = String(S.gap); $("fLead").value = String(S.lead);
  $("fTapeOn").checked = S.tapeOn; $("fFmt").value = S.fmt; $("fRate").value = String(S.rate);
  document.querySelector(`input[name=expKind][value=${S.expKind}]`).checked = true;
  showFx(); showCard(); expTip(); renderSides(); drawReels();
  if (songs.size) say(`Welcome back: ${songs.size} song${songs.size === 1 ? "" : "s"} on your ${tapeName()}.`);
})();
