// ENCORE. Songbook: write lyrics with chords, keep them in project folders, see
// every chord on any instrument, find the right word, and copy it anywhere.
// Songs live in this browser for now (localStorage), with backup and import.
// The plain logic is songbook-core.js; the theory and shapes are Chords' own
// (chords-core, chords-keys, chords-voicing); rhymes and words are words.js.
import { PARTS, nextPartName, insertPart, repeatableParts, parseSong, quickFormat, insertChord, removeChordAt, transposeText, respellText, fillSection, sections, chordsUsed, chordSequence, guessKey,
  likelyChords, nextChords, numeral, toChordsAbove, toLyrics, toInline, toChordPro, toUltimateGuitar, lineSyllables, newSong, newId, titleOf, songMetaFrom, stripMeta, isChord } from "./songbook-core.js";
import { parseChord, chordSymbol, chordTones, noteText, pcOf, mod12, plainNote } from "./chords-core.js";
import { makeKey, keyName, keyBySemis, MAJOR_KEYS, MINOR_KEYS } from "./chords-keys.js";
import { frettable, coursesOf, fretVoicings, pianoVoicing, capoOptions, courseNotes, shapeText } from "./chords-voicing.js";
import { TUNINGS } from "./tunings.js";
import { getCover, setCover, allCovers, imageToCover } from "./songbook-covers.js";
import { renderBook, PAPER } from "./songbook-print.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const KEY = "encore.songbook.v1";

// ---------- the library (this browser) ----------
// Categories (Albums, Works in progress, Singles, Graveyard, your own) hold folders (an album, a project),
// folders hold songs in the order you set (track order for an album). Folders have a color.
const DEFAULT_CATEGORIES = ["Albums", "Works in progress", "Singles", "Graveyard"];
const COLORS = ["", "#ff3b00", "#f59e0b", "#eab308", "#22c55e", "#14b8a6", "#3b82f6", "#a855f7", "#ec4899", "#94a3b8"];
function load() {
  let d = null;
  try { d = JSON.parse(localStorage.getItem(KEY) || "null"); } catch {}
  if (!d?.songs) {
    const folder = { id: newId("f"), name: "My songs", open: true };
    const s = newSong(folder.id, "[Verse 1]\n[G]Paste or type your [C]lyrics here,\nthe [D]chords go in [G]brackets.\n\n[Chorus]\n[Em]Tap a chord on the [C]right to put it in,\nor [G]switch to Chords to tap a [D]word.");
    s.title = "Start here"; s.key = "G";
    d = { folders: [folder], songs: [s], openId: s.id, prefs: {} };
  }
  // older songbooks: give them the categories, with their folders under Works in progress
  if (!d.categories) {
    d.categories = DEFAULT_CATEGORIES.map((name) => ({ id: newId("c"), name, open: true }));
    const wip = d.categories[1].id;
    for (const f of d.folders) f.categoryId ||= wip;
  }
  // a track order inside each folder (oldest first, the order they were made)
  for (const f of d.folders) d.songs.filter((s) => s.folderId === f.id && s.order === undefined).sort((a, b) => (a.created || 0) - (b.created || 0)).forEach((s, i) => { s.order = i; });
  return d;
}
const db = load();
db.prefs ||= {};
let saveTimer = 0;
function save(now = false) {
  clearTimeout(saveTimer);
  const go = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { toast("Couldn't save in this browser (it may be full). Download a backup from Share."); } };
  now ? go() : (saveTimer = setTimeout(go, 400));
}
window.addEventListener("beforeunload", () => save(true));
const song = () => db.songs.find((s) => s.id === db.openId) || null;
const touch = (s) => { s.updated = Date.now(); save(); };

const state = { view: db.prefs.view || "write", tab: db.prefs.tab || "chords", armed: null, selChord: -1, query: "", side: 0 };

// ---------- library panel ----------
const lib = $("lib");
const inFolder = (fid) => db.songs.filter((s) => (s.folderId || "") === fid).sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9) || (a.created || 0) - (b.created || 0));
const nextOrder = (fid) => Math.max(-1, ...db.songs.filter((s) => s.folderId === fid).map((s) => s.order ?? -1)) + 1;
function renderLib() {
  const q = state.query.toLowerCase().trim();
  const match = (s) => !q || (titleOf(s) + " " + s.artist + " " + s.body).toLowerCase().includes(q);
  const songRows = (list, numbered) => list.filter(match).map((s, i) => `<button class="songrow${s.id === db.openId ? " on" : ""}" draggable="true" data-s="${s.id}">${numbered ? `<span class="tn">${i + 1}</span>` : ""}${esc(titleOf(s))}${s.key ? `<span class="k">${esc(s.key)}</span>` : ""}</button>`).join("");
  const folderBox = (f) => {
    const list = inFolder(f.id), shown = list.filter(match);
    if (q && !shown.length) return "";
    const closed = f.open === false && !q;
    return `<div class="folder${closed ? " collapsed" : ""}" data-f="${f.id}" style="--fc:${f.color || "var(--divider-strong)"}">
      <div class="fhead" data-f="${f.id}" draggable="true"><span class="nm" data-a="toggle" title="${esc(f.name)}">${closed ? "&#9656;" : "&#9662;"} ${covers[f.id] ? `<img class="fcov" src="${covers[f.id]}" alt="">` : ""}${esc(f.name)} <span class="dim">${list.length}</span></span>
      <button class="ib" data-a="newIn" title="New song in ${esc(f.name)}" aria-label="New song in ${esc(f.name)}">+</button><button class="ib" data-a="fmenu" title="Rename, color, move or delete" aria-label="Folder options for ${esc(f.name)}">&#8943;</button></div>
      ${songRows(list, true)}</div>`;
  };
  let html = db.categories.map((c) => {
    const folders = db.folders.filter((f) => f.categoryId === c.id), inner = folders.map(folderBox).join("");
    if (q && !inner) return "";
    const closed = c.open === false && !q;
    return `<div class="cat${closed ? " collapsed" : ""}" data-c="${c.id}"><div class="chead" data-c="${c.id}"><span class="nm" data-a="ctoggle">${closed ? "&#9656;" : "&#9662;"} ${esc(c.name)}</span>
      <button class="ib" data-a="newFolderIn" title="New folder in ${esc(c.name)}" aria-label="New folder in ${esc(c.name)}">+</button><button class="ib" data-a="cmenu" title="Rename or delete" aria-label="Category options for ${esc(c.name)}">&#8943;</button></div>
      <div class="cbody">${inner || (q ? "" : `<div class="cempty">No folders yet. Tap + to make one.</div>`)}</div></div>`;
  }).join("");
  // songs not in any folder, and folders whose category is gone
  const lost = db.folders.filter((f) => !db.categories.some((c) => c.id === f.categoryId));
  if (lost.length) html += `<div class="cat" data-c=""><div class="chead"><span class="nm">Other folders</span></div><div class="cbody">${lost.map(folderBox).join("")}</div></div>`;
  const loose = db.songs.filter((s) => !s.folderId || !db.folders.some((f) => f.id === s.folderId));
  if (loose.some(match)) html += `<div class="folder" data-f=""><div class="fhead" data-f=""><span class="nm">Not in a folder</span></div>${songRows(loose, false)}</div>`;
  lib.innerHTML = (html || `<div class="empty">No songs match.</div>`) + (q ? "" : `<button class="btn sm addcat" data-a="newCat">+ Category</button>`);
}
function menu(anchor, items) {
  closeMenu();
  const m = document.createElement("div");
  m.className = "menu"; m.innerHTML = items;
  document.body.appendChild(m);
  const r = anchor.getBoundingClientRect();
  m.style.left = Math.min(innerWidth - m.offsetWidth - 8, r.left) + "px";
  m.style.top = Math.min(innerHeight - m.offsetHeight - 8, r.bottom + 4) + "px";
  setTimeout(() => document.addEventListener("pointerdown", outside), 0);
  return m;
}
function outside(e) { if (!e.target.closest(".menu")) closeMenu(); }
function closeMenu() { document.querySelector(".menu")?.remove(); document.removeEventListener("pointerdown", outside); }
function folderMenu(anchor, f) {
  const m = menu(anchor, `<button data-m="details">Cover and details</button><button data-m="print">Print this album</button><button data-m="rename">Rename</button>
    <div class="swatches">${COLORS.map((c) => `<button class="sw${(f.color || "") === c ? " on" : ""}" data-color="${c}" style="background:${c || "transparent"}" title="${c ? "Color" : "No color"}" aria-label="${c ? "Color " + c : "No color"}"></button>`).join("")}</div>
    <label>Move to <select class="t" data-m="cat">${db.categories.map((c) => `<option value="${c.id}" ${c.id === f.categoryId ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></label>
    <button data-m="del" class="danger">Delete folder</button>`);
  m.onclick = (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.color !== undefined) { f.color = b.dataset.color; save(); renderLib(); folderMenu(lib.querySelector(`.fhead[data-f="${f.id}"] [data-a=fmenu]`) || anchor, f); return; }
    if (b.dataset.m === "details") { closeMenu(); folderDetails(f); return; }
    if (b.dataset.m === "print") { closeMenu(); const first = inFolder(f.id)[0]; if (!first) { toast("No songs in this folder yet."); return; } if (song()?.folderId !== f.id) openSong(first.id); openPrint("folder"); return; }
    if (b.dataset.m === "rename") { closeMenu(); const n = prompt("Folder name", f.name); if (n && n.trim()) { f.name = n.trim(); save(); renderLib(); } }
    if (b.dataset.m === "del") {
      closeMenu();
      const n = db.songs.filter((s) => s.folderId === f.id).length;
      if (!confirm(n ? `Delete the folder "${f.name}"? Its ${n} song${n > 1 ? "s" : ""} stay, moved out of the folder.` : `Delete the folder "${f.name}"?`)) return;
      db.songs.forEach((s) => { if (s.folderId === f.id) s.folderId = ""; });
      db.folders = db.folders.filter((x) => x !== f); save(); renderLib();
    }
  };
  m.querySelector("select").onchange = (e) => { f.categoryId = e.target.value; save(); closeMenu(); renderLib(); toast(`Moved to ${db.categories.find((c) => c.id === f.categoryId)?.name}.`); };
}
function categoryMenu(anchor, c) {
  const m = menu(anchor, `<button data-m="rename">Rename</button><button data-m="up">Move up</button><button data-m="down">Move down</button><button data-m="del" class="danger">Delete category</button>`);
  m.onclick = (e) => {
    const b = e.target.closest("button"); if (!b) return;
    const i = db.categories.indexOf(c);
    closeMenu();
    if (b.dataset.m === "rename") { const n = prompt("Category name", c.name); if (n && n.trim()) c.name = n.trim(); }
    if (b.dataset.m === "up" && i > 0) [db.categories[i - 1], db.categories[i]] = [db.categories[i], db.categories[i - 1]];
    if (b.dataset.m === "down" && i < db.categories.length - 1) [db.categories[i + 1], db.categories[i]] = [db.categories[i], db.categories[i + 1]];
    if (b.dataset.m === "del") {
      const n = db.folders.filter((f) => f.categoryId === c.id).length, to = db.categories.find((x) => x !== c);
      if (!to) { toast("Keep at least one category."); return; }
      if (!confirm(n ? `Delete "${c.name}"? Its ${n} folder${n > 1 ? "s" : ""} move to ${to.name}.` : `Delete "${c.name}"?`)) return;
      db.folders.forEach((f) => { if (f.categoryId === c.id) f.categoryId = to.id; });
      db.categories = db.categories.filter((x) => x !== c);
    }
    save(); renderLib();
  };
}
function newFolder(categoryId) {
  const c = db.categories.find((x) => x.id === categoryId) || db.categories[0];
  const n = prompt(`New folder in ${c.name} (an album, a project...)`, c.name === "Albums" ? "New album" : "New folder");
  if (!n || !n.trim()) return null;
  const f = { id: newId("f"), name: n.trim(), open: true, categoryId: c.id, color: "" };
  db.folders.push(f); c.open = true; save(); renderLib();
  return f;
}
lib.addEventListener("click", (e) => {
  const row = e.target.closest(".songrow");
  if (row) { openSong(row.dataset.s); setMobile("song"); return; }
  const b = e.target.closest("[data-a]"); if (!b) return;
  const fid = e.target.closest("[data-f]")?.dataset.f, cid = e.target.closest("[data-c]")?.dataset.c;
  const f = db.folders.find((x) => x.id === fid), c = db.categories.find((x) => x.id === cid);
  if (b.dataset.a === "toggle" && f) { f.open = f.open === false; save(); renderLib(); }
  if (b.dataset.a === "ctoggle" && c) { c.open = c.open === false; save(); renderLib(); }
  if (b.dataset.a === "newIn") addSong(fid);
  if (b.dataset.a === "fmenu" && f) folderMenu(b, f);
  if (b.dataset.a === "cmenu" && c) categoryMenu(b, c);
  if (b.dataset.a === "newFolderIn") newFolder(cid);
  if (b.dataset.a === "newCat") { const n = prompt("New category (e.g. EPs, Covers, Side project)"); if (n && n.trim()) { db.categories.push({ id: newId("c"), name: n.trim(), open: true }); save(); renderLib(); } }
});
// dragging: a song onto a folder (to the end) or onto another song (to just before it, the track order);
// a folder onto a category
const clearDrop = () => lib.querySelectorAll(".drop, .dropBefore").forEach((x) => x.classList.remove("drop", "dropBefore"));
lib.addEventListener("dragstart", (e) => {
  const r = e.target.closest(".songrow");
  if (r) { e.dataTransfer.setData("text/x-song", r.dataset.s); e.dataTransfer.effectAllowed = "move"; return; }
  const fh = e.target.closest(".fhead[data-f]");
  if (fh && fh.dataset.f) { e.dataTransfer.setData("text/x-folder", fh.dataset.f); e.dataTransfer.effectAllowed = "move"; }
});
lib.addEventListener("dragover", (e) => {
  const types = e.dataTransfer.types;
  if (types.includes("text/x-song")) {
    const row = e.target.closest(".songrow"), fold = e.target.closest(".folder");
    if (!fold) return;
    e.preventDefault(); clearDrop();
    if (row && fold.dataset.f) row.classList.add("dropBefore"); else fold.querySelector(".fhead").classList.add("drop");
  } else if (types.includes("text/x-folder")) {
    const cat = e.target.closest(".cat[data-c]");
    if (!cat || !cat.dataset.c) return;
    e.preventDefault(); clearDrop(); cat.querySelector(".chead").classList.add("drop");
  }
});
lib.addEventListener("dragleave", (e) => { if (!lib.contains(e.relatedTarget)) clearDrop(); });
lib.addEventListener("drop", (e) => {
  clearDrop();
  const sid = e.dataTransfer.getData("text/x-song"), fid = e.dataTransfer.getData("text/x-folder");
  if (sid) {
    const fold = e.target.closest(".folder"), row = e.target.closest(".songrow"), s = db.songs.find((x) => x.id === sid);
    if (!fold || !s) return;
    e.preventDefault();
    const to = fold.dataset.f || "", list = inFolder(to).filter((x) => x !== s);
    const before = row && to ? list.findIndex((x) => x.id === row.dataset.s) : -1;
    list.splice(before < 0 ? list.length : before, 0, s);
    s.folderId = to;
    list.forEach((x, i) => { x.order = i; });
    touch(s); renderLib();
    toast(to ? `${db.folders.find((f) => f.id === to)?.name}: track ${list.indexOf(s) + 1}.` : "Moved out of the folder.");
  } else if (fid) {
    const cat = e.target.closest(".cat[data-c]"), f = db.folders.find((x) => x.id === fid);
    if (!cat || !f || !cat.dataset.c) return;
    e.preventDefault(); f.categoryId = cat.dataset.c; save(); renderLib();
  }
});
$("search").oninput = (e) => { state.query = e.target.value; renderLib(); };
$("newSong").onclick = () => addSong(song()?.folderId ?? db.folders[0]?.id ?? "");
$("newFolder").onclick = () => newFolder(db.folders.find((f) => f.id === song()?.folderId)?.categoryId || db.categories[0]?.id);
function addSong(folderId, body = "") {
  const s = newSong(folderId || "", body);
  s.order = nextOrder(s.folderId);
  db.songs.push(s); db.openId = s.id; save(); renderAll(); setMobile("song");
  state.view = "write"; renderSong(); $("title").focus();
  return s;
}
function openSong(id) { db.openId = id; state.armed = null; state.selChord = -1; save(); renderAll(); }

// ---------- the song ----------
const write = $("write"), sheet = $("sheet");
function songKey(s = song()) {
  if (!s) return null;
  if (s.key) { const m = /^([A-G][#b]?)(m?)$/.exec(s.key); if (m) return makeKey(m[1], m[2] ? "minor" : "major"); }
  return guessKey(chordSequence(s.body));
}
const keyText = (k) => (k ? noteText(k.tonic) + (k.mode === "minor" ? "m" : "") : "");
function fillKeySelect() {
  const s = song(), g = s ? guessKey(chordSequence(s.body)) : null;
  $("key").innerHTML = `<option value="">${g ? `Auto (${esc(keyName(g))})` : "Auto"}</option>` +
    `<optgroup label="Major">${MAJOR_KEYS.map((t) => `<option value="${t}">${t} major</option>`).join("")}</optgroup><optgroup label="Minor">${MINOR_KEYS.map((t) => `<option value="${t}m">${t} minor</option>`).join("")}</optgroup>`;
  $("key").value = s?.key || "";
}
$("capo").innerHTML = Array.from({ length: 10 }, (_, i) => `<option value="${i}">${i ? `Fret ${i}` : "None"}</option>`).join("");
function renderSong() {
  const s = song();
  const off = !s;
  for (const id of ["title", "artist", "write", "key", "capo", "quickFormat", "addInst", "printBtn"]) $(id).disabled = off;
  if (!s) { write.value = ""; sheet.innerHTML = `<div class="empty">No song open. Make one with + Song.</div>`; $("title").value = ""; $("artist").value = ""; return; }
  if (document.activeElement !== $("title")) $("title").value = s.title;
  if (document.activeElement !== $("artist")) $("artist").value = s.artist;
  if (document.activeElement !== write && write.value !== s.body) write.value = s.body;
  fillKeySelect();
  $("capo").value = String(s.capo || 0);
  for (const b of $("viewSeg").children) b.classList.toggle("on", b.dataset.v === state.view);
  for (const b of $("sideSeg").children) b.classList.toggle("on", +b.dataset.v === state.side);
  write.classList.toggle("hidden", state.view !== "write");
  sheet.classList.toggle("hidden", state.view !== "sheet");
  renderTags();
  renderParts();
  renderCoverBtn();
  if (state.view === "sheet") renderSheet();
  renderHint();
}
function renderHint() {
  const s = song();
  $("hint").innerHTML = !s ? "" : state.view === "write"
    ? `<span>Tap a chord on the right to put it in where you're typing. <b>Chords</b> view shows them over the words.</span>`
    : state.armed ? `<span>Tap a word to put <b>${esc(state.armed)}</b> on it. Tap a chord to take it off. <button class="btn sm" id="disarm">Done</button></span>`
    : `<span>Pick a chord on the right, then tap the words it goes over. Tap a chord here to change or remove it.</span>`;
  $("disarm") && ($("disarm").onclick = () => { state.armed = null; renderSong(); renderTools(); });
}
$("title").oninput = (e) => { const s = song(); if (!s) return; s.title = e.target.value; touch(s); renderLib(); };
$("coverBtn").onclick = () => songDetails();
$("printBtn").onclick = () => openPrint("song");
$("artist").oninput = (e) => { const s = song(); if (!s) return; s.artist = e.target.value; touch(s); };
write.oninput = () => { const s = song(); if (!s) return; s.body = write.value; touch(s); renderLibSoon(); renderToolsSoon(); };
let libTimer = 0, toolTimer = 0;
const renderLibSoon = () => { clearTimeout(libTimer); libTimer = setTimeout(renderLib, 500); };
const renderToolsSoon = () => { clearTimeout(toolTimer); toolTimer = setTimeout(() => { fillKeySelect(); renderParts(); if (state.tab !== "words") renderTools(); }, 450); };
write.addEventListener("paste", () => setTimeout(() => {
  const s = song(); if (!s) return;
  // a whole sheet pasted into an empty song: offer to tidy it up
  if (s.body.length > 40 && s.body.split("\n").length > 3 && s.body !== quickFormat(s.body)) toast("Pasted. Press Quick format to tidy it (and move chords into place).", 4000);
}, 0));
$("key").onchange = (e) => { const s = song(); if (!s) return; s.key = e.target.value; touch(s); renderLib(); renderTools(); };
$("capo").onchange = (e) => { const s = song(); if (!s) return; s.capo = +e.target.value; touch(s); renderTools(); };
$("viewSeg").onclick = (e) => { const b = e.target.closest("button"); if (!b) return; state.view = b.dataset.v; db.prefs.view = state.view; save(); renderSong(); };
$("quickFormat").onclick = () => {
  const s = song(); if (!s) return;
  const meta = songMetaFrom(s.body);
  const f = quickFormat(stripMeta(s.body));
  if (f === s.body) { toast("Already tidy."); return; }
  undoPush(s);
  if (meta.title && !s.title) s.title = meta.title;
  if (meta.artist && !s.artist) s.artist = meta.artist;
  if (meta.key && !s.key) s.key = meta.key;
  s.body = f; touch(s); renderAll(); toast("Tidied up. Undo with Ctrl+Z.");
};
function transposeBy(semis) {
  const s = song(); if (!s) return;
  const k = songKey(s);
  undoPush(s);
  s.body = transposeText(s.body, semis, k, state.side);
  if (s.key && k) s.key = keyText(keyBySemis(k, semis));
  touch(s); renderAll();
}
$("up").onclick = () => transposeBy(1);
$("down").onclick = () => transposeBy(-1);
$("sideSeg").onclick = (e) => {
  const b = e.target.closest("button"); const s = song(); if (!b || !s) return;
  const v = +b.dataset.v; state.side = state.side === v ? 0 : v;
  if (state.side) { undoPush(s); s.body = respellText(s.body, state.side, songKey(s)); touch(s); }
  renderAll();
};

// undo for the big changes (quick format, transpose, fills); typing has the browser's own undo
const undo = [];
function undoPush(s) { undo.push({ id: s.id, body: s.body, key: s.key }); if (undo.length > 30) undo.shift(); }
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey && document.activeElement !== write && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName)) {
    const u = undo.pop(); const s = u && db.songs.find((x) => x.id === u.id);
    if (s) { e.preventDefault(); s.body = u.body; s.key = u.key; touch(s); renderAll(); toast("Undone."); }
  }
  if (e.key === "Escape" && state.armed) { state.armed = null; renderSong(); renderTools(); }
});

// instruments the song is played on (tags), and which one the Play tab shows
const INSTRUMENTS = [...TUNINGS.families.flatMap((f) => f.instruments.map((i) => ({ ...i, family: f.name }))), { name: "Piano / keys", part: "keys", transpose: 0, tunings: [], family: "Keys" },
  { name: "Vocals", part: "voice", transpose: 0, tunings: [], family: "Voice" }, { name: "Drums", part: "drums", transpose: 0, tunings: [], family: "Drums" }];
$("addInst").innerHTML = `<option value="">+ Instrument</option>` + [...new Set(INSTRUMENTS.map((i) => i.family))].map((f) => `<optgroup label="${esc(f)}">${INSTRUMENTS.filter((i) => i.family === f).map((i) => `<option>${esc(i.name)}</option>`).join("")}</optgroup>`).join("");
$("addInst").onchange = (e) => { const s = song(), n = e.target.value; e.target.value = ""; if (!s || !n || s.instruments.includes(n)) return; s.instruments.push(n); touch(s); if (!db.prefs.inst || db.prefs.inst === "Guitar (6-string)") db.prefs.inst = n; renderTags(); renderTools(); };
function renderTags() {
  const s = song();
  $("instTags").innerHTML = (s?.instruments || []).map((n) => `<span class="tag">${esc(n)}<button data-n="${esc(n)}" aria-label="Remove ${esc(n)}">&#10005;</button></span>`).join("");
}
$("instTags").onclick = (e) => { const b = e.target.closest("button"); const s = song(); if (!b || !s) return; s.instruments = s.instruments.filter((n) => n !== b.dataset.n); touch(s); renderTags(); };

// ---------- parts of the song: [Verse 1], [Chorus], ... in one tap ----------
const MAIN_PARTS = ["Intro", "Verse", "Pre-Chorus", "Chorus", "Bridge", "Refrain", "Hook", "Solo", "Outro"];
function renderParts() {
  const s = song();
  if (!s) { $("parts").innerHTML = ""; return; }
  const rep = repeatableParts(s.body);
  $("parts").innerHTML = `<span class="pl">Add</span>` + MAIN_PARTS.map((p) => `<button class="pt" data-p="${p}" title="Put a [${esc(nextPartName(s.body, p))}] line in where you are">${p}</button>`).join("") +
    `<select class="t" id="moreParts" aria-label="More parts"><option value="">More...</option>${PARTS.filter((p) => !MAIN_PARTS.includes(p)).map((p) => `<option>${p}</option>`).join("")}<option value="*">Your own name...</option></select>` +
    rep.map((n) => `<button class="pt rep" data-p="${esc(n)}" data-rep="1" title="The ${esc(n)} again, with its words and chords">&#8635; ${esc(n)} again</button>`).join("");
  $("moreParts").onchange = (e) => { let n = e.target.value; e.target.value = ""; if (n === "*") n = (prompt("Name this part (e.g. Rap verse, Choir, Key change)") || "").trim(); if (n) addPart(n); };
}
$("parts").addEventListener("click", (e) => { const b = e.target.closest(".pt"); if (b) addPart(b.dataset.p, !!b.dataset.rep); });
function addPart(base, repeat = false) {
  const s = song(); if (!s) return;
  const name = repeat ? base : nextPartName(s.body, base);
  // where you're typing in Write; at the end in the Chords view
  const at = state.view === "write" && document.activeElement === write ? write.selectionStart : state.view === "write" && lastCaret != null ? lastCaret : s.body.length;
  undoPush(s);
  const r = insertPart(s.body, at, name, repeat);
  s.body = r.text; touch(s);
  if (state.view === "write") { setWriteText(s.body, r.caret); lastCaret = r.caret; }
  renderSong(); renderToolsSoon();
  if (state.view === "sheet") sheet.scrollTop = sheet.scrollHeight;
  toast(repeat ? `${name} again, words and chords included.` : `Added [${name}].`);
}
let lastCaret = null;
write.addEventListener("blur", () => { lastCaret = write.selectionStart; });

// ---------- the chord sheet: chords over the words, tap to place ----------
function renderSheet() {
  const s = song(), lines = parseSong(s.body);
  let html = "", chordIdx = 0;
  for (const l of lines) {
    if (l.type === "blank") { html += `<div class="gap"></div>`; continue; }
    if (l.type === "meta") continue;
    if (l.type === "section") { html += `<div class="sec">${esc(l.name)}</div>`; continue; }
    html += `<div class="ln">` + l.parts.map((p) => {
      // the words as tappable pieces, each knowing where it starts in the text
      const words = []; const re = /\S+\s*|\s+/g; let m;
      while ((m = re.exec(p.text))) words.push(`<span class="w" data-at="${p.at + m.index}">${esc(m[0])}</span>`);
      if (!words.length) words.push(`<span class="w" data-at="${p.at}">${p.chord ? "&nbsp;&nbsp;" : "&nbsp;"}</span>`);
      // the bracket sits just before the words, so its own position is the words' start minus its length
      const ch = p.chord ? `<span class="ch${chordIdx === state.selChord ? " sel" : ""}" data-at="${p.at - p.chord.length - 2}" data-i="${chordIdx++}" title="Tap to change or remove">${esc(p.chord)}</span>` : `<span class="ch"></span>`;
      return `<span class="seg2">${ch}<span class="tx">${words.join("")}</span></span>`;
    }).join("") + `<span class="syl" title="Syllables in this line">${lineSyllables(l.parts.map((p) => p.text).join("")) || ""}</span></div>`;
  }
  sheet.innerHTML = html || `<div class="empty">No words yet. Write them in the Write view.</div>`;
  sheet.classList.toggle("placing", !!state.armed);
  countSyllables();
}
sheet.addEventListener("click", (e) => {
  const s = song(); if (!s) return;
  const ch = e.target.closest(".ch[data-at]");
  if (ch) {
    const at = +ch.dataset.at;
    if (state.armed) { undoPush(s); s.body = insertChord(removeChordAt(s.body, at), at, state.armed); touch(s); renderSheet(); renderToolsSoon(); return; }
    state.selChord = +ch.dataset.i === state.selChord ? -1 : +ch.dataset.i;
    renderSheet(); renderTools();
    if (state.selChord >= 0) toast(`${ch.textContent}: tap a chord on the right to swap it, or press Delete to remove it.`, 3000);
    return;
  }
  const w = e.target.closest(".w");
  if (w && state.armed) { undoPush(s); s.body = insertChord(s.body, +w.dataset.at, state.armed); touch(s); renderSheet(); renderToolsSoon(); return; }
  // no chord picked: a tapped word goes to the Words tab
  if (w) { const word = w.textContent.replace(/[^\p{L}'’-]/gu, ""); if (word) { sheet.querySelectorAll(".w.pick").forEach((x) => x.classList.remove("pick")); w.classList.add("pick"); lookupWord(word); } }
});
document.addEventListener("keydown", (e) => {
  if ((e.key === "Delete" || e.key === "Backspace") && state.view === "sheet" && state.selChord >= 0 && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) {
    const el = sheet.querySelector(`.ch[data-i="${state.selChord}"]`), s = song();
    if (el && s) { e.preventDefault(); undoPush(s); s.body = removeChordAt(s.body, +el.dataset.at); state.selChord = -1; touch(s); renderSheet(); renderToolsSoon(); }
  }
});

// new text in the editor without losing your place: replacing a textarea's value jumps it to the end,
// so the scroll position comes back and the caret goes where the change was
function setWriteText(text, caret) {
  const top = write.scrollTop;
  write.value = text;
  write.focus({ preventScroll: true });
  write.setSelectionRange(caret, caret);
  write.scrollTop = top;
  requestAnimationFrame(() => { write.scrollTop = top; });
}

// a chord from the tools: into the text at the cursor (Write), or armed for tapping words (Chords view)
function useChord(sym) {
  const s = song(); if (!s || !isChord(sym)) return;
  if (state.view === "sheet") {
    if (state.selChord >= 0) {
      const el = sheet.querySelector(`.ch[data-i="${state.selChord}"]`);
      if (el) { undoPush(s); const at = +el.dataset.at; s.body = insertChord(removeChordAt(s.body, at), at, sym); state.selChord = -1; touch(s); renderSheet(); renderTools(); return; }
    }
    state.armed = state.armed === sym ? null : sym; renderSong(); renderTools(); return;
  }
  const at = write.selectionStart ?? write.value.length;
  const before = s.body;
  s.body = insertChord(s.body, at, sym);
  const moved = s.body.length - before.length;
  touch(s);
  setWriteText(s.body, at + moved);
  renderToolsSoon();
}

// ---------- tools ----------
const tbody = $("tbody");
$("ttabs").onclick = (e) => { const b = e.target.closest("button"); if (!b) return; state.tab = b.dataset.t; db.prefs.tab = state.tab; save(); renderTools(); };
function renderTools() {
  for (const b of $("ttabs").children) b.classList.toggle("on", b.dataset.t === state.tab);
  if (state.tab === "chords") renderChordsTab();
  else if (state.tab === "play") renderPlayTab();
  else if (state.tab === "words") renderWordsTab();
  else renderShareTab();
}
const chip = (sym, label = "", fn = "", tip = "") => `<button class="cc${fn ? " fn-" + fn : ""}${state.armed === sym ? " armed" : ""}" data-c="${esc(sym)}" title="${esc(tip || sym)}">${esc(sym)}${label ? `<i>${esc(label)}</i>` : ""}</button>`;
function chordBefore() {
  const s = song(); if (!s) return null;
  const at = state.view === "write" ? (write.selectionStart ?? s.body.length) : s.body.length;
  const m = [...s.body.slice(0, at).matchAll(/\[([^\]\n]+)\]/g)].map((x) => x[1]).filter(isChord);
  return m.length ? m[m.length - 1] : null;
}
function renderChordsTab() {
  const s = song();
  if (!s) { tbody.innerHTML = `<div class="empty">Open a song.</div>`; return; }
  const k = songKey(s), used = chordsUsed(s.body), prev = chordBefore();
  const L = k ? likelyChords(k) : null, next = k && prev ? nextChords(k, prev, 6) : [];
  const nm = (sym) => (k ? numeral(k, sym) : "");
  tbody.innerHTML = `
    <div class="lbl"><span>${state.view === "write" ? "Tap to put it in" : state.armed ? "Now tap the words" : "Pick one, then tap the words"}</span><span class="dim">${k ? (s.key ? keyName(k) : `sounds like ${keyName(k)}`) : "set a key for suggestions"}</span></div>
    <div class="row"><input class="t" id="anyChord" placeholder="Any chord: F#m7b5, G/B..." style="flex:1 1 auto" aria-label="Type any chord"><button class="btn sm" id="anyGo">Add</button></div>
    ${next.length ? `<div class="lbl"><span>Likely after ${esc(prev)}</span></div><div class="chips">${next.map((n) => chip(n.symbol, nm(n.symbol), "", n.why)).join("")}</div>` : ""}
    ${used.length ? `<div class="lbl"><span>In this song</span></div><div class="chips">${used.map((u) => chip(u, nm(u))).join("")}</div>` : ""}
    ${L ? `<div class="lbl"><span>In ${esc(L.key)}</span><span class="dim">home, away, tension</span></div><div class="chips">${L.home.map((c) => chip(c.symbol, c.label, c.fn, c.why)).join("")}</div>
      <div class="lbl"><span>With 7ths</span></div><div class="chips">${L.sevenths.map((c) => chip(c.symbol, c.label, c.fn, c.why)).join("")}</div>
      <div class="lbl"><span>Borrowed and spice</span></div><div class="chips">${[...L.borrowed, ...L.secondary].map((c) => chip(c.symbol, c.label, c.fn, c.why)).join("")}</div>
      ${L.relative.length ? `<div class="lbl"><span>Relative key</span></div><div class="chips">${L.relative.map((c) => chip(c.symbol, c.label, c.fn, c.why)).join("")}</div>` : ""}` : `<p class="small dim">Pick the song's key at the top (or put in a few chords and it guesses) to see the chords that usually come up.</p>`}
    <div class="lbl"><span>Progressions</span><span class="dim">name a part, fill it in one tap</span></div>
    <div id="progs">${(s.progressions || []).map((p, i) => `<div class="prog" data-i="${i}"><div class="row"><input class="t" data-k="name" value="${esc(p.name)}" style="width:80px" aria-label="Progression name"><input class="t" data-k="chords" value="${esc(p.chords.join(" "))}" aria-label="Chords" placeholder="G D Em C"><button class="ib" data-a="del" aria-label="Delete progression">&#10005;</button></div>
      <div class="row" style="margin-top:5px">${p.chords.filter(isChord).map((c) => chip(c, nm(c))).join("")}</div>
      <div class="row" style="margin-top:6px"><select class="t" data-k="section" aria-label="Section to fill">${sections(s.body).map((x, j) => `<option value="${j}">${esc(x.name)}</option>`).join("") || `<option value="-1">(add a [Section] line first)</option>`}</select>
      <select class="t" data-k="per" aria-label="Chords per line"><option value="1">1 per line</option><option value="2">2 per line</option></select><button class="btn sm" data-a="fill">Fill</button></div></div>`).join("")}</div>
    <button class="btn sm" id="addProg">+ Progression</button>`;
  $("anyGo").onclick = () => { const v = $("anyChord").value.trim(); if (!isChord(v)) { toast("That isn't a chord name I know."); return; } useChord(chordSymbol(parseChord(v)) || v); };
  $("anyChord").onkeydown = (e) => { if (e.key === "Enter") $("anyGo").click(); };
  $("addProg").onclick = () => {
    const secs = sections(s.body), name = secs[0]?.name.replace(/\s*\d+$/, "") || "Verse";
    const guess = k ? (k.mode === "minor" ? ["i", "bVI", "bIII", "bVII"] : ["I", "V", "vi", "IV"]).map((rn) => L.home.find((c) => c.label === rn)?.symbol).filter(Boolean) : [];
    s.progressions = [...(s.progressions || []), { name, chords: guess }]; touch(s); renderChordsTab();
  };
  $("progs").oninput = (e) => {
    const box = e.target.closest(".prog"), p = s.progressions[+box.dataset.i];
    if (e.target.dataset.k === "name") p.name = e.target.value;
    if (e.target.dataset.k === "chords") p.chords = e.target.value.split(/[\s,|]+/).filter(Boolean);
    touch(s);
  };
  $("progs").addEventListener("change", (e) => { if (e.target.dataset.k === "chords") renderChordsTab(); });
  $("progs").onclick = (e) => {
    const b = e.target.closest("[data-a]"), box = e.target.closest(".prog");
    if (!b || !box) return;
    const i = +box.dataset.i, p = s.progressions[i];
    if (b.dataset.a === "del") { s.progressions.splice(i, 1); touch(s); renderChordsTab(); }
    if (b.dataset.a === "fill") {
      const secs = sections(s.body), j = +box.querySelector('[data-k="section"]').value, per = +box.querySelector('[data-k="per"]').value;
      const good = p.chords.filter(isChord);
      if (!secs[j] || !good.length) { toast(secs[j] ? "Put some chords in the progression first." : "Add a section line like [Verse 1] first."); return; }
      undoPush(s); s.body = fillSection(s.body, secs[j], good, per); touch(s); renderAll(); toast(`Filled ${secs[j].name}. Undo with Ctrl+Z.`);
    }
  };
}
tbody.addEventListener("click", (e) => { const c = e.target.closest(".cc[data-c]"); if (c) { e.preventDefault(); useChord(c.dataset.c); } });

// ---------- Play: how to play every chord on any instrument ----------
function instrument() { return INSTRUMENTS.find((i) => i.name === (db.prefs.inst || song()?.instruments?.[0])) || INSTRUMENTS[0]; }
function renderPlayTab() {
  const s = song();
  if (!s) { tbody.innerHTML = `<div class="empty">Open a song.</div>`; return; }
  const inst = instrument(), ti = Math.min(db.prefs.tuning || 0, Math.max(0, inst.tunings.length - 1)), tuning = inst.tunings[ti];
  const used = chordsUsed(s.body).map(parseChord).filter(Boolean), capo = s.capo || 0;
  const fam = [...new Set(INSTRUMENTS.map((i) => i.family))];
  let html = `<div class="row"><select class="t" id="pInst" aria-label="Instrument" style="flex:1 1 auto">${(s.instruments || []).length ? `<optgroup label="In this song">${s.instruments.map((n) => `<option>${esc(n)}</option>`).join("")}</optgroup>` : ""}
    ${fam.map((f) => `<optgroup label="${esc(f)}">${INSTRUMENTS.filter((i) => i.family === f).map((i) => `<option>${esc(i.name)}</option>`).join("")}</optgroup>`).join("")}</select>
    ${inst.tunings.length > 1 ? `<select class="t" id="pTuning" aria-label="Tuning">${inst.tunings.map((t, i) => `<option value="${i}">${esc(t.name)}</option>`).join("")}</select>` : ""}</div>`;
  if (!used.length) html += `<p class="small dim">Put some chords in the song and they show up here, ready to play.</p>`;
  else if (inst.part === "string" && frettable(inst) && tuning) {
    const courses = coursesOf(tuning, inst.name);
    // with a capo, the shapes are the chords moved down; the capo helper suggests easier spots
    const opts = capoOptions(used, courses, 7).slice(0, 3);
    html += `<p class="small dim" style="margin:8px 0 4px">${capo ? `Capo on fret ${capo}: the shapes below are what you finger.` : ""} Tap a chord to hear it.</p>`;
    html += `<div class="diagrams">${used.map((c) => { const sh = capo ? shapeOf(c, capo) : c; const vs = fretVoicings(sh, courses, { capo: 0, maxFret: 12, limit: 3 });
      return `<div class="dg" data-c="${esc(chordSymbol(c))}"><b>${esc(chordSymbol(c))}</b>${capo ? `<span class="alt">shape ${esc(chordSymbol(sh))}</span>` : ""}${vs[0] ? box(vs[0], courses, pcOf(sh.root)) + `<div class="alt">${esc(shapeText(vs[0].frets))}</div>` : `<div class="alt">no easy shape</div>`}</div>`; }).join("")}</div>`;
    if (opts[0] && opts[0].capo !== capo) html += `<div class="lbl"><span>Easier with a capo?</span></div><div class="small muted">${opts.map((o) => `<button class="btn sm" data-capo="${o.capo}">${o.capo ? `Capo ${o.capo}` : "No capo"}: ${o.shapes.map((x) => esc(chordSymbol(x))).join(" ")}</button>`).join(" ")}</div>`;
  } else if (inst.part === "keys") {
    html += `<div class="diagrams" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr))">${used.map((c) => `<div class="dg" data-c="${esc(chordSymbol(c))}"><b>${esc(chordSymbol(c))}</b>${keys(pianoVoicing(c).notes)}<div class="notes">${chordTones(c).map((t) => esc(noteText(t.note))).join(" ")}</div></div>`).join("")}</div>`;
  } else if (inst.part === "drums") {
    html += `<p class="small dim">Drums don't play chords. The tempo and feel are in the song details; try Beatpad or Metronome for the groove.</p>`;
  } else {
    // one note at a time (voice, winds, brass, fretless strings): the chord's notes to outline it, written for the instrument
    const tr = inst.transpose || 0;
    html += `<p class="small dim" style="margin:8px 0 4px">${inst.part === "voice" ? "The notes of each chord, to find harmonies." : `One note at a time: play these to outline each chord${tr ? ` (written for ${esc(inst.name)}, ${tr > 0 ? "up" : "down"} ${Math.abs(tr)} half steps from concert pitch)` : ""}.`}</p>`;
    html += `<div class="diagrams" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr))">${used.map((c) => { const tones = chordTones(c).map((t) => t.note);
      return `<div class="dg" data-c="${esc(chordSymbol(c))}"><b>${esc(chordSymbol(c))}</b><div class="notes">${tones.map((n) => esc(noteText(tr ? plainNote(pcOf(n) + tr) : n))).join(" ")}</div>${tr ? `<div class="alt">concert ${tones.map((n) => esc(noteText(n))).join(" ")}</div>` : ""}</div>`; }).join("")}</div>`;
  }
  tbody.innerHTML = html;
  $("pInst").value = inst.name;
  $("pInst").onchange = (e) => { db.prefs.inst = e.target.value; db.prefs.tuning = 0; save(); renderPlayTab(); };
  $("pTuning") && ($("pTuning").value = String(ti), $("pTuning").onchange = (e) => { db.prefs.tuning = +e.target.value; save(); renderPlayTab(); });
  tbody.querySelectorAll("[data-capo]").forEach((b) => (b.onclick = () => { s.capo = +b.dataset.capo; touch(s); $("capo").value = String(s.capo); renderPlayTab(); }));
  tbody.querySelectorAll(".dg[data-c]").forEach((d) => (d.onclick = () => strum(parseChord(d.dataset.c), inst, tuning)));
}
function shapeOf(c, capo) { const t = transposeText(`[${chordSymbol(c)}]`, -capo).slice(1, -1); return parseChord(t); }
function box(v, courses, rootPc) {
  const n = courses.length, gap = n > 8 ? 9 : 12, left = 16, top = 16, rowH = 13;
  const fretted = v.frets.filter((f) => f > 0), maxF = fretted.length ? Math.max(...fretted) : 0;
  const base = maxF <= 5 ? 1 : v.pos, rows = Math.max(4, Math.min(5, maxF - base + 1));
  const W = left + (n - 1) * gap + 12, H = top + rows * rowH + 6, x = (i) => left + i * gap;
  let s = `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true">`;
  for (let r = 0; r <= rows; r++) s += `<line x1="${x(0)}" x2="${x(n - 1)}" y1="${top + r * rowH}" y2="${top + r * rowH}" stroke="#6b625a" stroke-width="${r === 0 && base === 1 ? 3 : 1}"/>`;
  for (let i = 0; i < n; i++) s += `<line x1="${x(i)}" x2="${x(i)}" y1="${top}" y2="${top + rows * rowH}" stroke="#c9bfb3"/>`;
  if (base > 1) s += `<text x="1" y="${top + rowH * 0.75}" font-size="8" fill="#bdb4a9">${base}fr</text>`;
  if (v.barre && v.barre.to > v.barre.from) s += `<rect x="${x(v.barre.from) - 5}" y="${top + (v.barre.fret - base + 0.5) * rowH - 5}" width="${x(v.barre.to) - x(v.barre.from) + 10}" height="10" rx="5" fill="#f2efe8" opacity=".85"/>`;
  v.frets.forEach((f, i) => {
    if (f < 0) { s += `<text x="${x(i)}" y="${top - 4}" font-size="9" fill="#ef4444" text-anchor="middle">x</text>`; return; }
    const notes = courseNotes(courses[i], f, 0), root = notes && mod12(notes[0]) === rootPc;
    if (f === 0) { s += `<circle cx="${x(i)}" cy="${top - 7}" r="3.2" fill="none" stroke="${root ? "#ff6c40" : "#f2efe8"}" stroke-width="1.3"/>`; return; }
    s += `<circle cx="${x(i)}" cy="${top + (f - base + 0.5) * rowH}" r="5" fill="${root ? "#ff3b00" : "#f2efe8"}"/>`;
  });
  return s + "</svg>";
}
function keys(notes) {
  const lo = 36, hi = 84, white = [], W = 7;
  for (let m = lo; m <= hi; m++) if (![1, 3, 6, 8, 10].includes(mod12(m))) white.push(m);
  let s = `<svg viewBox="0 0 ${white.length * W} 34" aria-hidden="true">`;
  white.forEach((m, i) => { s += `<rect x="${i * W}" y="0" width="${W - 0.6}" height="34" rx="1" fill="${notes.includes(m) ? "#ff3b00" : "#f2efe8"}"/>`; });
  for (let m = lo; m <= hi; m++) if ([1, 3, 6, 8, 10].includes(mod12(m))) { const i = white.indexOf(m - 1); s += `<rect x="${i * W + W * 0.62}" y="0" width="${W * 0.7}" height="21" rx="1" fill="${notes.includes(m) ? "#ff3b00" : "#1b1714"}"/>`; }
  return s + "</svg>";
}
// a quick plucked strum (or a soft chord on keys and everything else) to hear it
let actx = null;
function strum(c, inst, tuning) {
  if (!c) return;
  actx ||= new AudioContext();
  let notes;
  if (inst.part === "string" && frettable(inst) && tuning) { const courses = coursesOf(tuning, inst.name), v = fretVoicings(c, courses, { maxFret: 12, limit: 1 })[0]; notes = v ? v.frets.map((f, i) => (f < 0 ? null : courseNotes(courses[i], f, 0)?.[0])).filter((x) => x != null) : null; }
  notes ||= pianoVoicing(c).notes;
  const t0 = actx.currentTime + 0.03, out = actx.createGain(); out.gain.value = 0.22; out.connect(actx.destination);
  notes.forEach((m, i) => {
    const o = actx.createOscillator(), g = actx.createGain(), f = actx.createBiquadFilter();
    o.type = "sawtooth"; o.frequency.value = 440 * 2 ** ((m - 69) / 12); f.type = "lowpass"; f.frequency.value = 2400;
    const t = t0 + i * 0.03; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5, t + 0.005); g.gain.exponentialRampToValueAtTime(0.001, t + 1.8);
    o.connect(f); f.connect(g); g.connect(out); o.start(t); o.stop(t + 1.9);
  });
}

// ---------- Words: rhymes, near rhymes, meanings (words.js, all on this device) ----------
let W = null, wLoading = null;
const wstate = { word: "", mode: db.prefs.wmode || "rhymes", syl: "", also: [], like: "", starts: "", common: false, names: true, phrases: true, clean: false, ...(db.prefs.words || {}), data: null, err: "" };
async function words() {
  if (W) return W;
  wLoading ||= import("./words.js").then((m) => m.openWords("en", { ready: (p) => { const el = $("wLoad"); if (el && p?.total) el.textContent = `Loading the dictionary... ${Math.round((p.loaded / p.total) * 100)}%`; },
    // the two-word phrases arrive a moment later: ask again so they show up
    phrases: () => { if (state.tab === "words" && wstate.word && wstate.phrases && wstate.mode !== "define") runWords(true); } }))
    .then((w) => { W = w; if (state.view === "sheet") countSyllables(); return w; });
  return wLoading;
}
function lookupWord(word) { wstate.word = word; state.tab = "words"; setMobile("tools"); renderTools(); runWords(); }
// what each tab looks for: true rhymes (with two-word ones), near rhymes (sound alike), meaning, related, definition
const MODES = [["rhymes", "Rhymes", ["perfect", "phrase"]], ["near", "Near rhymes", ["family", "near", "phrase"]], ["similar", "Means like"], ["related", "Related"], ["define", "Definition"]];
const SYL_TABS = [["", "All"], ["1", "1"], ["2", "2"], ["3", "3"], ["4", "4"], ["5", "5+"]];
const PAGE = 150;
const fmt = (n) => Number(n || 0).toLocaleString();
function renderWordsTab() {
  tbody.innerHTML = `<div class="wsearch"><input class="t" id="wq" value="${esc(wstate.word)}" placeholder="A word or phrase" aria-label="Word" autocomplete="off" spellcheck="false"><button class="btn sm go" id="wgo">Find</button></div>
    <div class="wtabs" id="wmodes">${MODES.map(([k, n]) => `<button data-m="${k}" class="${wstate.mode === k ? "on" : ""}">${n}</button>`).join("")}</div>
    <div class="filters">
      <label>Also rhymes with <input class="t" id="fAlso" placeholder="word, then Enter"></label>
      <label>Means like <input class="t" id="fLike" value="${esc(wstate.like)}" placeholder="a meaning"></label>
      <label>Starts with <input class="t" id="fStart" value="${esc(wstate.starts)}" style="width:60px"></label>
      <label title="Only words most people know"><input type="checkbox" id="fCommon" ${wstate.common ? "checked" : ""}> Common only</label>
      <label title="Hide names of people and places"><input type="checkbox" id="fNames" ${wstate.names ? "checked" : ""}> Names</label>
      <label title="Two-word rhymes like talk show, let go"><input type="checkbox" id="fPhrases" ${wstate.phrases ? "checked" : ""}> Phrases</label>
      <label><input type="checkbox" id="fClean" ${wstate.clean ? "checked" : ""}> Clean</label>
    </div>
    <div class="chain" id="chain">${wstate.also.map((w, i) => `<span>also rhymes with <b>${esc(w)}</b><button data-i="${i}" aria-label="Remove">&#10005;</button></span>`).join("")}</div>
    <div class="syltabs" id="syltabs" role="tablist" aria-label="Syllables"></div>
    <div class="results" id="wres"><p class="small dim" id="wLoad">${wstate.word ? "" : "Type a word, or tap a word in the Chords view of your song. Pick how many syllables with the tabs, then narrow it down: also rhymes with another word, means something like."}</p></div>
    <p class="small dim" style="margin-top:14px">Rhymes: CMU Pronouncing Dictionary. Thesaurus and phrases: WordNet (Princeton University) and Moby. <a href="words/LICENSES.txt" target="_blank" rel="noopener" style="color:inherit">Licenses</a></p>`;
  const q = $("wq");
  $("wgo").onclick = () => { wstate.word = q.value.trim(); runWords(); };
  q.onkeydown = (e) => { if (e.key === "Enter") $("wgo").click(); };
  $("wmodes").onclick = (e) => { const b = e.target.closest("button"); if (!b) return; wstate.mode = b.dataset.m; db.prefs.wmode = wstate.mode; save(); renderWordsTab(); runWords(); };
  $("syltabs").onclick = (e) => { const b = e.target.closest("button"); if (!b) return; wstate.syl = b.dataset.s; runWords(true); };
  $("fAlso").onkeydown = (e) => { if (e.key === "Enter" && e.target.value.trim()) { wstate.also.push(e.target.value.trim()); e.target.value = ""; renderWordsTab(); runWords(); } };
  $("fLike").onchange = (e) => { wstate.like = e.target.value.trim(); runWords(); };
  $("fStart").onchange = (e) => { wstate.starts = e.target.value.trim(); runWords(); };
  for (const [id, k] of [["fCommon", "common"], ["fNames", "names"], ["fPhrases", "phrases"], ["fClean", "clean"]]) $(id).onchange = (e) => { wstate[k] = e.target.checked; db.prefs.words = { common: wstate.common, names: wstate.names, phrases: wstate.phrases, clean: wstate.clean }; save(); runWords(); };
  $("chain").onclick = (e) => { const b = e.target.closest("button"); if (b) { wstate.also.splice(+b.dataset.i, 1); renderWordsTab(); runWords(); } };
  if (wstate.data || wstate.err) showWords();
}
const sylOpt = () => (wstate.syl === "5" ? [5, 99] : wstate.syl ? +wstate.syl : undefined);
// names and phrases off: dropped here, so the counts on the tabs stay true
const isPhrase = (it) => /\s/.test(it.w) || (it.flags || []).includes("phrase");
const keep = (it) => (wstate.names || !(it.flags || []).includes("name")) && (wstate.phrases || !isPhrase(it));
let wSeq = 0;
// a fresh look-up (or a new syllable tab): the first page; more come as you scroll
async function runWords(tabOnly = false) {
  const word = wstate.word;
  if (!word) return;
  const my = ++wSeq;
  const res = $("wres"); if (res && !W) res.innerHTML = `<p class="small dim" id="wLoad">Loading the dictionary...</p>`;
  try {
    const w = await words();
    if (my !== wSeq) return;
    const f = { rhymesWith: wstate.also.length ? wstate.also.map((x) => ({ word: x, kind: "near" })) : undefined,
      relatedTo: wstate.like || undefined, startsWith: wstate.starts || undefined, common: wstate.common ? 50 : undefined, clean: wstate.clean || undefined };
    const mode = MODES.find((m) => m[0] === wstate.mode);
    if (mode[2]) {
      // the rhymes come sorted best first; names and phrases are dropped by asking for the whole list only when they're off
      const kinds = wstate.phrases ? mode[2] : mode[2].filter((k) => k !== "phrase");
      let whole = null;
      const src = async (offset) => {
        if (wstate.names && wstate.phrases) return w.rhymes(word, { kinds, ...f, offset, limit: PAGE, syllables: sylOpt() });
        whole ||= await w.rhymes(word, { kinds, ...f, offset: 0, limit: 1e6 }).then((all) => ({ ...all, list: all.results.filter(keep) }));
        return { ...whole, ...pageList(whole.list, offset) };
      };
      const r = await src(0);
      if (my !== wSeq) return;
      wstate.data = { kind: "list", head: r, items: r.results, total: r.total, totals: r.totals, more: r.more, next: src };
    } else {
      const t = await w.thesaurus(word);
      if (wstate.mode === "define") wstate.data = { kind: "define", t };
      else {
        const pool = wstate.mode === "similar" ? [...t.senses.flatMap((s) => [...s.synonyms, ...s.similar]), ...(t.more || [])] : [...(t.related || []), ...t.senses.flatMap((s) => [...s.broader, ...s.narrower])];
        const seen = new Set(), uniq = pool.filter((x) => !seen.has(x.w) && seen.add(x.w) && x.w !== word.toLowerCase());
        const got = await w.filter(uniq.map((x) => x.w), f), list = got.results || got;
        const src = async (offset) => pageList(list, offset);
        const r = await src(0);
        wstate.data = { kind: "list", head: { found: t.found }, items: r.results, total: r.total, totals: r.totals, more: r.more, next: src };
      }
    }
    wstate.err = "";
  } catch (err) { wstate.data = null; wstate.err = err.message || String(err); }
  if (my === wSeq && state.tab === "words") showWords(tabOnly);
}
// paging a list we already have: the counts for every tab, then this tab's slice
function pageList(list, offset) {
  const totals = { all: list.length, 1: 0, 2: 0, 3: 0, 4: 0, "5+": 0 };
  for (const r of list) totals[r.syl >= 5 ? "5+" : Math.max(1, r.syl || 1)]++;
  const s = sylOpt(), [lo, hi] = Array.isArray(s) ? s : [s, s];
  const view = s === undefined ? list : list.filter((r) => r.syl >= lo && r.syl <= hi);
  const results = view.slice(offset, offset + PAGE);
  return { total: view.length, totals, results, more: offset + results.length < view.length };
}
let moreBusy = false;
async function loadMore() {
  const d = wstate.data; if (!d || d.kind !== "list" || !d.more || moreBusy) return;
  moreBusy = true;
  const my = wSeq;
  try {
    const r = await d.next(d.items.length);
    if (my !== wSeq || d !== wstate.data) return;
    d.items.push(...r.results); d.more = r.more;
    const grid = $("wgrid"); if (grid) grid.insertAdjacentHTML("beforeend", r.results.map(wordBtn).join(""));
    const st = $("wmore"); if (st) st.textContent = d.more ? "More..." : d.items.length > 40 ? `That's all ${fmt(d.total)}.` : "";
  } finally { moreBusy = false; }
  // still room on screen: keep going
  const st = $("wmore"); if (st && d.more && st.getBoundingClientRect().top < tbody.getBoundingClientRect().bottom + 300) loadMore();
}
const KIND = { perfect: "rhyme", family: "close rhyme", near: "near rhyme", consonant: "same end consonants", phrase: "two-word rhyme" };
const POS = { n: "noun", v: "verb", a: "adjective", s: "adjective", r: "adverb" };
function wordBtn(it) {
  const fl = it.flags || [];
  const cls = ["wd", it.kind && it.kind !== "perfect" ? "near" : "", fl.includes("rare") ? "rare" : "", fl.includes("name") ? "name" : "", isPhrase(it) ? "phr" : ""].filter(Boolean).join(" ");
  const tip = [KIND[it.kind], it.homophone && "sounds the same", it.end && "rhymes on the last syllable", fl.includes("name") && "a name", fl.includes("rare") && "rare word", it.syl && `${it.syl} syllable${it.syl > 1 ? "s" : ""}`].filter(Boolean).join(", ");
  return `<button class="${cls}" data-w="${esc(it.w)}" title="${esc(tip)}">${esc(it.w)}${it.homophone ? `<i class="hm">=</i>` : ""}${wstate.syl === "" && it.syl ? `<sup>${it.syl}</sup>` : ""}</button>`;
}
function showWords(tabOnly = false) {
  const res = $("wres"); if (!res) return;
  const tabs = $("syltabs");
  if (tabs) tabs.innerHTML = "";
  if (wstate.err) { res.innerHTML = `<p class="small dim">The word finder couldn't load: ${esc(wstate.err)}</p>`; return; }
  const d = wstate.data; if (!d) return;
  if (d.kind === "define") {
    const t = d.t;
    res.innerHTML = t.found && t.senses.length ? t.senses.map((s) => `<div class="sense"><b>${esc(POS[s.pos] || s.pos || "")}</b> <span class="def">${esc(s.def)}</span>${s.example ? `<div class="dim small">"${esc(s.example)}"</div>` : ""}
      ${s.synonyms.length ? `<div>${s.synonyms.slice(0, 12).map((x) => `<button class="wd" data-w="${esc(x.w)}">${esc(x.w)}</button>`).join("")}</div>` : ""}${s.antonyms.length ? `<div class="small dim">Opposite: ${s.antonyms.map((x) => `<button class="wd" data-w="${esc(x.w)}">${esc(x.w)}</button>`).join("")}</div>` : ""}</div>`).join("")
      : `<p class="small dim">No definition for that one.</p>`;
    return;
  }
  // a tab for each syllable count, with how many are in it
  const T = d.totals || {};
  if (tabs) tabs.innerHTML = SYL_TABS.map(([v, n]) => { const c = v === "" ? T.all : v === "5" ? T["5+"] : T[v]; return `<button role="tab" data-s="${v}" class="${wstate.syl === v ? "on" : ""}" aria-selected="${wstate.syl === v}"${!c && v !== wstate.syl ? " disabled" : ""}>${n}<span>${fmt(c)}</span></button>`; }).join("");
  const guess = d.head?.guess ? `<p class="small dim">"${esc(d.head.word)}" isn't in the dictionary, so it's rhymed by how it's spelled${d.head.like ? ` (like "${esc(d.head.like)}")` : ""}.</p>` : "";
  if (!d.items.length) { res.innerHTML = guess + `<p class="small dim">${T.all ? "None with that many syllables. Try another tab." : "Nothing left with those filters. Loosen one."}</p>`; return; }
  const what = wstate.mode === "rhymes" ? "rhyme" : wstate.mode === "near" ? "near rhyme" : "word";
  res.innerHTML = guess + `<p class="small dim wcount">${fmt(d.total)} ${what}${d.total === 1 ? "" : "s"}${wstate.syl ? ` with ${wstate.syl === "5" ? "5 or more" : wstate.syl} syllable${wstate.syl === "1" ? "" : "s"}` : ""}, best first. Tap to copy, shift-tap to look it up.
    <span class="legend"><span class="rare">rare</span> <span class="name">name</span> <span class="phr">phrase</span> <i class="hm">=</i> sounds the same</span></p>
    <div class="wgrid" id="wgrid">${d.items.map(wordBtn).join("")}</div><div class="small dim wmore" id="wmore">${d.more ? "More..." : ""}</div>`;
  if (tabOnly) tbody.scrollTop = Math.min(tbody.scrollTop, Math.max(0, res.offsetTop - 120));
  // endless scrolling: the next page when the end comes into view
  const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) loadMore(); }, { root: tbody, rootMargin: "0px 0px 600px 0px" });
  io.observe($("wmore"));
}
tbody.addEventListener("click", (e) => {
  const b = e.target.closest(".wd"); if (!b) return;
  const word = b.dataset.w;
  if (e.shiftKey) { wstate.word = word; renderWordsTab(); runWords(); return; }
  navigator.clipboard?.writeText(word).then(() => toast(`Copied "${word}".`), () => toast(word));
});
// real syllable counts from the dictionary once it's loaded (the spelling guess until then)
async function countSyllables() {
  if (!W || state.view !== "sheet") return;
  const rows = [...sheet.querySelectorAll(".ln")];
  if (!rows.length) return;
  const text = rows.map((r) => [...r.querySelectorAll(".tx")].map((x) => x.textContent).join("")).join("\n");
  try {
    const r = await W.syllables(text);
    r.lines.forEach((l, i) => { const el = rows[i]?.querySelector(".syl"); if (el) el.textContent = l.min !== l.max ? `${l.min}-${l.max}` : String(l.syllables || ""); });
  } catch {}
}

// ---------- Share: copy anywhere, download, print, back up ----------
function renderShareTab() {
  const s = song();
  if (!s) { tbody.innerHTML = `<div class="empty">Open a song.</div>`; return; }
  const k = songKey(s);
  const head = [titleOf(s), s.artist && `by ${s.artist}`].filter(Boolean).join(" ") + "\n" + [k && `Key: ${keyName(k)}`, s.capo && `Capo ${s.capo}`, s.tempo && `${s.tempo} BPM`].filter(Boolean).join(" · ");
  const formats = [
    ["above", "Chords over the words", "Plain text that lines up anywhere with a fixed-width font: forums, texts, most chord sites.", () => head.trim() + "\n\n" + toChordsAbove(s.body)],
    ["ug", "Ultimate Guitar", "Their own markup, so the chords stay over the right words when you paste into their editor.", () => toUltimateGuitar(s.body)],
    ["inline", "Chords in brackets", "[G]Here comes the [C]sun. Notes apps, OnSong, SongbookPro, ChordPro.", () => toInline(s.body)],
    ["lyrics", "Just the words", "For lyric sites, captions and liner notes.", () => toLyrics(s.body)],
  ];
  tbody.innerHTML = `<div class="lbl"><span>Copy</span><span class="dim">one tap, paste anywhere</span></div>
    <div class="copies">${formats.map(([id, n, d]) => `<button class="copy" data-copy="${id}"><b>${n}</b><span>${d}</span></button>`).join("")}</div>
    <div class="lbl"><span>Preview</span></div><pre class="preview" id="preview">${esc(formats[0][3]())}</pre>
    <div class="lbl"><span>Download</span></div>
    <div class="row"><button class="btn sm" id="dlCho">ChordPro (.cho)</button><button class="btn sm" id="dlTxt">Text (.txt)</button></div>
    <div class="lbl"><span>Print or PDF</span><span class="dim">fitted to 1 or 2 pages</span></div>
    <div class="row"><button class="btn sm go" id="print">This song</button>${folderOf(s) ? `<button class="btn sm" id="printAlbum">Album: ${esc(folderOf(s).name)}</button>` : ""}<button class="btn sm" id="printAll">Whole songbook</button><button class="btn sm" id="details">Cover and details</button></div>
    <div class="lbl"><span>Your whole songbook</span><span class="dim">kept in this browser</span></div>
    <div class="row"><button class="btn sm" id="backup">Download a backup</button><button class="btn sm" id="import">Import songs</button></div>
    <p class="small dim">Import takes a backup, or ChordPro and text files from other apps. Songs are saved in this browser only, so download a backup now and then. Saving to your ENCORE. account is coming.</p>`;
  tbody.querySelectorAll("[data-copy]").forEach((b) => {
    const f = formats.find((x) => x[0] === b.dataset.copy);
    b.onmouseenter = b.onfocus = () => { $("preview").textContent = f[3](); };
    b.onclick = () => navigator.clipboard?.writeText(f[3]()).then(() => toast(`Copied: ${f[1]}.`), () => toast("Couldn't copy (your browser said no)."));
  });
  const fname = (ext) => `${[s.artist, titleOf(s)].filter(Boolean).join(" - ").replace(/[\\/:*?"<>|]+/g, "") || "song"}.${ext}`;
  $("dlCho").onclick = () => download(new Blob([toChordPro({ ...s, title: titleOf(s), key: s.key || keyText(k) })], { type: "text/plain" }), fname("cho"));
  $("dlTxt").onclick = () => download(new Blob([(head.trim() + "\n\n" + toChordsAbove(s.body)).replace(/\n/g, "\r\n")], { type: "text/plain" }), fname("txt"));
  $("print").onclick = () => openPrint("song");
  $("printAlbum") && ($("printAlbum").onclick = () => openPrint("folder"));
  $("printAll").onclick = () => openPrint("all");
  $("details").onclick = () => songDetails();
  $("backup").onclick = async () => download(new Blob([JSON.stringify({ app: "ENCORE. Songbook", version: 3, saved: new Date().toISOString(), categories: db.categories, folders: db.folders, songs: db.songs, covers: await allCovers() }, null, 1)], { type: "application/json" }), `ENCORE Songbook backup ${new Date().toISOString().slice(0, 10)}.json`);
  $("import").onclick = () => $("importFile").click();
}
$("importFile").onchange = async () => {
  const files = [...$("importFile").files]; $("importFile").value = "";
  let n = 0;
  for (const f of files) {
    const text = await f.text();
    if (/\.json$/i.test(f.name)) {
      try {
        const d = JSON.parse(text);
        if (!Array.isArray(d.songs)) throw new Error();
        const map = new Map();
        // categories by name, folders by name (new ones keep their color and category)
        const cmap = new Map();
        for (const c of d.categories || []) { const ex = db.categories.find((x) => x.name === c.name); if (ex) cmap.set(c.id, ex.id); else { const nc = { id: newId("c"), name: c.name, open: true }; db.categories.push(nc); cmap.set(c.id, nc.id); } }
        for (const fo of d.folders || []) { const ex = db.folders.find((x) => x.name === fo.name); if (ex) map.set(fo.id, ex.id); else { const nf = { ...fo, id: newId("f"), open: true, color: fo.color || "", categoryId: cmap.get(fo.categoryId) || db.categories[1]?.id || db.categories[0].id }; db.folders.push(nf); map.set(fo.id, nf.id); } }
        const added = new Set();
        for (const s of d.songs) { if (db.songs.some((x) => x.id === s.id)) continue; db.songs.push({ ...newSong(), ...s, folderId: map.get(s.folderId) || "" }); added.add(s.id); n++; }
        // covers come along: a new song's own, and a folder's when this browser's folder has none yet
        for (const [id, url] of Object.entries(d.covers || {})) { const to = map.get(id) || (added.has(id) ? id : null); if (to && !covers[to]) await putCover(to, url); }
      } catch { toast(`${f.name} isn't a Songbook backup.`); }
    } else {
      const s = newSong(song()?.folderId || db.folders[0]?.id || "", text);
      s.body = quickFormat(s.body);
      if (!s.title) s.title = f.name.replace(/\.[^.]+$/, "");
      db.songs.push(s); db.openId = s.id; n++;
    }
  }
  save(); renderAll(); if (n) toast(`Imported ${n} song${n > 1 ? "s" : ""}.`);
};
function download(blob, name) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }

// ---------- covers and details: album art and the facts that print at the top ----------
const covers = {};
allCovers().then((all) => { Object.assign(covers, all); renderLib(); renderCoverBtn(); });
async function putCover(id, url) { if (url) covers[id] = url; else delete covers[id]; await setCover(id, url); renderLib(); renderCoverBtn(); }
const folderOf = (s) => db.folders.find((f) => f.id === s?.folderId) || null;
const coverFor = (s) => covers[s?.id] || covers[folderOf(s)?.id] || null;
function renderCoverBtn() {
  const s = song(), c = s && coverFor(s), b = $("coverBtn");
  if (!b) return;
  b.disabled = !s;
  b.innerHTML = c ? `<img src="${c}" alt="">` : "&#9998;";
  b.title = s ? (c ? "Cover and details" : "Add a cover and details (writers, year, notes)") : "";
}
function dialog(html, cls = "") {
  document.querySelector("dialog.dlg")?.remove();
  const d = document.createElement("dialog");
  d.className = "dlg " + cls; d.innerHTML = html;
  document.body.appendChild(d);
  d.addEventListener("close", () => setTimeout(() => d.remove(), 0));
  d.addEventListener("click", (e) => { if (e.target === d) d.close(); });
  d.showModal();
  return d;
}
// pick a picture and shrink it to print size
function pickCover(id, then) {
  const i = document.createElement("input");
  i.type = "file"; i.accept = "image/*";
  i.onchange = async () => {
    const f = i.files[0]; if (!f) return;
    try { await putCover(id, await imageToCover(f)); then?.(); } catch (err) { toast(err.message || "Couldn't use that picture."); }
  };
  i.click();
}
const coverBlock = (id, fallback, fallbackName) => `<div class="cv">${covers[id] ? `<img src="${covers[id]}" alt="Cover">` : fallback ? `<img src="${fallback}" alt="" class="inh">` : `<div class="none">No cover</div>`}
  <div class="cvb"><button class="btn sm" data-a="pick">${covers[id] ? "Change picture" : "Add a picture"}</button>${covers[id] ? `<button class="btn sm" data-a="rmcover">Remove</button>` : ""}
  <span class="small dim">${!covers[id] && fallback ? `Using the cover of ${esc(fallbackName)}.` : "A square picture works best. It prints at the top."}</span></div></div>`;
const field = (k, label, v, ph = "", wide = false) => `<label class="fl${wide ? " wide" : ""}"><span>${label}</span><input class="t" data-k="${k}" value="${esc(v ?? "")}" placeholder="${esc(ph)}"></label>`;
function songDetails() {
  const s = song(); if (!s) return;
  const f = folderOf(s);
  const draw = () => {
    const d = dialog(`<form method="dialog"><h3>Song details</h3>${coverBlock(s.id, f && covers[f.id], f?.name)}
      <div class="fgrid">${field("writers", "Words and music by", s.writers, "Who wrote it", true)}${field("year", "Year", s.year, "2026")}${field("tempo", "Tempo (BPM)", s.tempo || "", "96")}
      ${field("time", "Time", s.time, "4/4")}${field("copyright", "Copyright or publisher", s.copyright, "© 2026 Your Name", true)}
      <label class="fl wide"><span>Notes (print at the bottom)</span><textarea class="t" data-k="notes" rows="2" placeholder="Feel, arrangement, who plays what">${esc(s.notes || "")}</textarea></label></div>
      <div class="row end"><button class="btn go" value="ok">Done</button></div></form>`);
    d.oninput = (e) => { const k = e.target.dataset.k; if (!k) return; s[k] = k === "tempo" ? +e.target.value || 0 : e.target.value; touch(s); };
    d.querySelector(".cv").onclick = (e) => {
      const a = e.target.closest("[data-a]")?.dataset.a;
      if (a === "pick") pickCover(s.id, () => { d.close(); draw(); });
      if (a === "rmcover") putCover(s.id, null).then(() => { d.close(); draw(); });
    };
  };
  draw();
}
function folderDetails(f) {
  const draw = () => {
    const d = dialog(`<form method="dialog"><h3>${esc(f.name)}</h3>${coverBlock(f.id)}
      <div class="fgrid">${field("name", "Name", f.name, "", true)}${field("artist", "Artist", f.artist, "Who it's by")}${field("year", "Year", f.year, "2026")}
      ${field("label", "Label or credits", f.label, "Sick & Sad Records", true)}
      <label class="fl wide"><span>Notes (print on the album page)</span><textarea class="t" data-k="notes" rows="3" placeholder="Liner notes, thank yous, the story">${esc(f.notes || "")}</textarea></label></div>
      <div class="row end"><button class="btn go" value="ok">Done</button></div></form>`);
    d.oninput = (e) => { const k = e.target.dataset.k; if (!k) return; if (k === "name" && !e.target.value.trim()) return; f[k] = k === "name" ? e.target.value.trim() : e.target.value; save(); renderLib(); };
    d.querySelector(".cv").onclick = (e) => {
      const a = e.target.closest("[data-a]")?.dataset.a;
      if (a === "pick") pickCover(f.id, () => { d.close(); draw(); });
      if (a === "rmcover") putCover(f.id, null).then(() => { d.close(); draw(); });
    };
  };
  draw();
}

// ---------- print: a song, an album, or the whole songbook ----------
const pp = () => (db.prefs.print ||= { scope: "song", fit: "smart", paper: /^en-(US|CA)|es-(MX|US)/.test(navigator.language) ? "letter" : "a4", chords: true, repeats: true, covers: true, boxes: false, color: true, albumPages: true, contents: true, title: "" });
// chord boxes print in black on white
const inkBox = (svg) => svg.replace(/#f2efe8/g, "#111").replace(/#c9bfb3/g, "#555").replace(/#6b625a/g, "#111").replace(/#bdb4a9/g, "#444").replace(/#ff6c40/g, "#c2410c").replace(/#ff3b00/g, "#c2410c");
function printBoxes(s) {
  const inst = instrument(), tuning = inst.tunings[Math.min(db.prefs.tuning || 0, Math.max(0, inst.tunings.length - 1))];
  if (!(inst.part === "string" && frettable(inst) && tuning)) return [];
  const courses = coursesOf(tuning, inst.name), capo = s.capo || 0;
  return chordsUsed(s.body).map(parseChord).filter(Boolean).map((c) => {
    const sh = capo ? shapeOf(c, capo) : c, v = fretVoicings(sh, courses, { capo: 0, maxFret: 12, limit: 1 })[0];
    return v && { name: chordSymbol(c), svg: inkBox(box(v, courses, pcOf(sh.root))) };
  }).filter(Boolean);
}
function printSong(s, f, track) {
  const k = songKey(s);
  const meta = [f && (track ? `${f.name}, track ${track}` : f.name), k && `Key of ${keyName(k)}`, s.capo && `Capo ${s.capo}`, s.tempo && `${s.tempo} BPM`, s.time, s.year || f?.year].filter(Boolean);
  const credit = [s.writers && `Words and music by ${s.writers}`, s.copyright].filter(Boolean).join(". ");
  return { id: s.id, title: titleOf(s), artist: s.artist || f?.artist || "", meta, credit, notes: s.notes || "", cover: coverFor(s), body: s.body, boxes: pp().boxes ? printBoxes(s) : [], key: s.key || keyText(k) };
}
function printFolder(f, songs, ownCovers = true) {
  return { id: f.id, name: f.name, color: f.color, artist: f.artist || "", meta: [f.year, f.label].filter(Boolean), notes: f.notes || "", cover: covers[f.id] || null,
    songs: songs.map((s, i) => { const p = printSong(s, f, i + 1); if (!ownCovers && !covers[s.id]) p.cover = null; return p; }) };
}
function bookFor(scope) {
  const s = song(), f = folderOf(s);
  if (scope === "song" && s) return { kind: "song", title: titleOf(s), groups: [{ folders: [{ ...printFolder(f || { id: "", name: "" }, []), songs: [printSong(s, f, f ? inFolder(f.id).indexOf(s) + 1 : 0)] }] }] };
  if (scope === "folder" && f) return { kind: "album", title: f.name, groups: [{ folders: [printFolder(f, inFolder(f.id))] }] };
  // everything: by category, then folder in its order, then songs not in a folder
  const groups = db.categories.map((c) => ({ name: c.name, folders: db.folders.filter((x) => x.categoryId === c.id).map((x) => printFolder(x, inFolder(x.id))).filter((x) => x.songs.length) })).filter((g) => g.folders.length);
  const loose = db.songs.filter((x) => !x.folderId || !db.folders.some((y) => y.id === x.folderId) || !db.categories.some((c) => c.id === db.folders.find((y) => y.id === x.folderId)?.categoryId));
  if (loose.length) groups.push({ name: "Other songs", folders: [{ id: "loose", name: "", songs: loose.map((x) => printSong(x, folderOf(x), 0)) }] });
  const artists = db.songs.map((x) => x.artist).filter(Boolean), top = artists.sort((a, b) => artists.filter((x) => x === b).length - artists.filter((x) => x === a).length)[0] || "";
  return { kind: "all", title: pp().title || "Songbook", artist: top, date: new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }), groups };
}
function openPrint(scope) {
  const o = pp();
  if (scope) o.scope = scope;
  if (o.scope === "folder" && !folderOf(song())) o.scope = song() ? "song" : "all";
  if (o.scope === "song" && !song()) o.scope = "all";
  const f = folderOf(song());
  const seg = (k, opts) => `<div class="seg wrap" data-o="${k}">${opts.map(([v, n, dis]) => `<button type="button" data-v="${v}" class="${String(o[k]) === String(v) ? "on" : ""}"${dis ? " disabled" : ""}>${esc(n)}</button>`).join("")}</div>`;
  const chk = (k, n, tip = "") => `<label class="ck" title="${esc(tip)}"><input type="checkbox" data-c="${k}" ${o[k] ? "checked" : ""}> ${esc(n)}</label>`;
  const inst = instrument();
  const d = dialog(`<div class="pside">
      <h3>Print</h3>
      <div class="plbl">What</div>${seg("scope", [["song", "This song", !song()], ["folder", f ? `Album: ${f.name}` : "This folder", !f], ["all", "Whole songbook"]])}
      <div class="plbl">Fit</div>${seg("fit", [["smart", "1 or 2 pages"], ["one", "1 page"], ["natural", "Don't shrink"]])}
      <div class="plbl">Paper</div>${seg("paper", [["letter", "Letter"], ["a4", "A4"]])}
      <div class="plbl">On the page</div>
      ${chk("chords", "Chords over the words")}${chk("repeats", "Repeated parts print once", "A chorus that's the same words and chords prints once, then says Chorus (repeat)")}
      ${chk("covers", "Covers")}${chk("boxes", `Chord boxes (${inst.name})`, "Uses the instrument picked in the Play tab")}${chk("color", "Chords in color")}
      <div class="bookonly">${chk("albumPages", "A page for each album")}${chk("contents", "Contents with page numbers")}
      <label class="fl"><span>Book title</span><input class="t" id="pTitle" value="${esc(o.title)}" placeholder="Songbook"></label></div>
      <p class="small dim" id="pSum">Laying it out...</p>
      <div class="row"><button type="button" class="btn go" id="pGo">Print or save as PDF</button><button type="button" class="btn" id="pClose">Close</button></div>
      <p class="small dim">Save as PDF is in the print window's printer list. Turn off the browser's own headers and footers there for clean pages.</p>
    </div><div class="pview" id="pView"><iframe id="pFrame" title="Print preview"></iframe></div>`, "printDlg");
  const frame = d.querySelector("#pFrame");
  let busy = Promise.resolve(), seq = 0;
  const draw = () => {
    d.querySelector(".bookonly").classList.toggle("hidden", o.scope !== "all");
    const my = ++seq;
    busy = busy.then(async () => {
      if (my !== seq) return;
      const view = d.querySelector("#pView"), P = PAPER[o.paper];
      const r = await renderBook(frame, bookFor(o.scope), { ...o, zoom: Math.max(0.3, Math.min(1, (view.clientWidth - 40) / P.w)) });
      const many = r.songs.length > 1, one = r.songs.filter((x) => x.pages === 1).length;
      const sz = (x) => `${x.fs}pt${x.cols === 2 ? ", two columns" : ""}`;
      d.querySelector("#pSum").textContent = !r.songs.length ? "No songs to print." : many ? `${r.pages} pages, ${r.songs.length} songs (${one} on one page).` : `${r.pages} page${r.pages > 1 ? "s" : ""}, ${sz(r.songs[0])}.`;
    }).catch((err) => { d.querySelector("#pSum").textContent = "Couldn't lay it out: " + (err.message || err); });
  };
  d.addEventListener("click", (e) => {
    const b = e.target.closest(".seg[data-o] button");
    if (b && !b.disabled) { const k = b.parentElement.dataset.o; o[k] = b.dataset.v; b.parentElement.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b)); save(); draw(); }
  });
  d.addEventListener("change", (e) => { const k = e.target.dataset.c; if (k) { o[k] = e.target.checked; save(); draw(); } });
  d.querySelector("#pTitle").oninput = (e) => { o.title = e.target.value; save(); clearTimeout(d._t); d._t = setTimeout(draw, 400); };
  d.querySelector("#pClose").onclick = () => d.close();
  d.querySelector("#pGo").onclick = async () => { await busy; frame.contentWindow.focus(); frame.contentWindow.print(); };
  draw();
}
document.addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") { e.preventDefault(); openPrint(); } });

// ---------- little things ----------
let toastTimer = 0;
function toast(t, ms = 2400) {
  let el = document.querySelector(".toast");
  if (!el) { el = document.createElement("div"); el.className = "toast"; el.setAttribute("role", "status"); document.body.appendChild(el); }
  el.textContent = t; clearTimeout(toastTimer); toastTimer = setTimeout(() => el.remove(), ms);
}
function setMobile(m) { document.querySelector("main").dataset.m = m; for (const b of $("mtabs").children) b.classList.toggle("on", b.dataset.m === m); }
$("mtabs").onclick = (e) => { const b = e.target.closest("button"); if (b) setMobile(b.dataset.m); };
write.addEventListener("keyup", () => { if (state.tab === "chords") renderToolsSoon(); });
write.addEventListener("click", () => { if (state.tab === "chords") renderToolsSoon(); });
function renderAll() { renderLib(); renderSong(); renderTools(); }
renderAll();
