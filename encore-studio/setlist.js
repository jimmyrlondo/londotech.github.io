// ENCORE. Set List: chord charts and set lists for worship teams and gigging bands.
// The library and sets live in this browser (setlist-store.js, IndexedDB). The logic is
// setlist-core.js; reading chord sheets is Songbook's (songbook-core.js).
import * as C from "./setlist-core.js";
import { parseSong, chordsUsed } from "./songbook-core.js";
import * as store from "./setlist-store.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const TIMES = ["4/4", "3/4", "6/8", "2/4", "12/8", "2/2", "5/4", "7/8", "9/8"];

const S = {
  songs: {}, sets: {}, sel: null, ctx: null, activeSet: "", view: "chords", diagrams: false, libTab: "songs", tab: "song",
  editing: false, q: "", paper: "letter", stage: null, stageSize: 34, speed: 1, ready: false,
};

// ---------- little helpers ----------

let toastTimer = 0;
function toast(msg, ms = 2800) {
  const t = $("toast");
  t.textContent = msg; t.classList.remove("hidden");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add("hidden"), ms);
}
const timers = new Map();
function later(key, fn, ms = 350) { clearTimeout(timers.get(key)); timers.set(key, setTimeout(() => { timers.delete(key); fn(); }, ms)); }
function flushAll() { for (const [k, t] of timers) { clearTimeout(t); timers.delete(k); } for (const s of dirtySongs) store.put("songs", s); for (const s of dirtySets) store.put("sets", s); dirtySongs.clear(); dirtySets.clear(); }
const dirtySongs = new Set(), dirtySets = new Set();
function saveSong(song, now = false) {
  song.updated = Date.now(); dirtySongs.add(song);
  later("songs", () => { for (const s of dirtySongs) store.put("songs", s); dirtySongs.clear(); }, now ? 0 : 350);
}
function saveSet(set, now = false) {
  set.updated = Date.now(); dirtySets.add(set);
  later("sets", () => { for (const s of dirtySets) store.put("sets", s); dirtySets.clear(); }, now ? 0 : 350);
}
function savePrefs() {
  later("prefs", () => store.setPref("ui", { view: S.view, diagrams: S.diagrams, paper: S.paper, libTab: S.libTab, tab: S.tab, stageSize: S.stageSize, speed: S.speed, sel: S.sel, ctx: S.ctx, activeSet: S.activeSet }), 300);
}
window.addEventListener("pagehide", flushAll);
store.whenStorageFails(() => toast("This browser won't save here (private window or storage off). Your work lasts until you close the page, so download a backup in Share.", 6000));
function download(name, text, type = "application/json") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const fileSafe = (s) => String(s || "untitled").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_").slice(0, 60) || "untitled";
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const sortedSongs = () => Object.values(S.songs).sort((a, b) => (a.title || "").localeCompare(b.title || "", undefined, { sensitivity: "base" }));
const sortedSets = () => Object.values(S.sets).sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.updated || 0) - (a.updated || 0));
const keyOrDash = (k) => k || "?";

// ---------- what's open ----------

/** The song open now, with the key and capo it's shown in (the set's when opened from a set) */
function current() {
  if (!S.sel || S.sel.kind !== "song") return null;
  const song = S.songs[S.sel.id];
  if (!song) return null;
  const set = S.ctx ? S.sets[S.ctx.setId] : null;
  const item = set ? set.items.find((i) => i.id === S.ctx.itemId) : null;
  if (S.ctx && !item) S.ctx = null;
  const key = item ? item.key || C.songKey(song) : C.songKey(song);
  const capo = item ? +item.capo || 0 : +song.capo || 0;
  return { song, set: item ? set : null, item, key, capo };
}
const songItems = (set) => set.items.filter((i) => i.kind === "song" && S.songs[i.songId]);

function openSong(id, ctx = null) {
  S.sel = { kind: "song", id }; S.ctx = ctx; S.editing = false;
  if (S.tab === "share" || S.tab === "help" || S.tab === "add") { /* keep */ }
  renderAll(); savePrefs();
  $("centerScroll").scrollTop = 0;
}
function openSet(id) {
  S.sel = { kind: "set", id }; S.ctx = null; S.activeSet = id; S.editing = false;
  renderAll(); savePrefs();
  $("centerScroll").scrollTop = 0;
}

// ---------- library ----------

function renderLib() {
  $("songCount").textContent = Object.keys(S.songs).length || "";
  $("setCount").textContent = Object.keys(S.sets).length || "";
  for (const b of document.querySelectorAll("[data-lib]")) b.classList.toggle("on", b.dataset.lib === S.libTab);
  $("q").placeholder = S.libTab === "songs" ? "Search songs" : "Search sets";
  $("newBtn").textContent = S.libTab === "songs" ? "+ New" : "+ New set";
  $("newBtn").title = S.libTab === "songs" ? "New song" : "New set";
  const q = S.q.toLowerCase().trim();
  const active = S.sets[S.activeSet];
  let html = "";
  if (S.libTab === "songs") {
    const list = sortedSongs().filter((s) => !q || `${s.title} ${s.artist} ${s.body}`.toLowerCase().includes(q));
    html = list.map((s) => `<div class="item${S.sel?.kind === "song" && S.sel.id === s.id ? " on" : ""}"><button class="main" data-song="${s.id}"><span class="t">${esc(s.title || "Untitled song")}${s.artist ? `<small>${esc(s.artist)}</small>` : ""}</span><span class="kb">${esc(keyOrDash(C.songKey(s)))}</span></button>${active ? `<button class="ib" data-add="${s.id}" title="Add to ${esc(active.name)}" aria-label="Add ${esc(s.title)} to ${esc(active.name)}">+</button>` : ""}</div>`).join("")
      || `<div class="empty">${q ? "No songs match." : "No songs yet. Paste one in the Add tab."}</div>`;
  } else {
    const list = sortedSets().filter((s) => !q || s.name.toLowerCase().includes(q));
    html = list.map((s) => {
      const t = C.setTiming(s.items, S.songs, s.gap || 0);
      return `<div class="item${S.sel?.kind === "set" && S.sel.id === s.id ? " on" : ""}"><button class="main" data-set="${s.id}"><span class="t">${esc(s.name || "Untitled set")}<small>${esc(s.date || "No date")} · ${t.songs} song${t.songs === 1 ? "" : "s"} · ${C.formatLong(t.total)}</small></span></button></div>`;
    }).join("") || `<div class="empty">${q ? "No sets match." : "No sets yet. Press + New set."}</div>`;
  }
  $("list").innerHTML = html;
}
$("list").addEventListener("click", (e) => {
  const add = e.target.closest("[data-add]");
  if (add) { addToSet(S.activeSet, add.dataset.add); return; }
  const s = e.target.closest("[data-song]");
  if (s) { openSong(s.dataset.song); return; }
  const t = e.target.closest("[data-set]");
  if (t) openSet(t.dataset.set);
});
for (const b of document.querySelectorAll("[data-lib]")) b.addEventListener("click", () => { S.libTab = b.dataset.lib; S.q = ""; $("q").value = ""; renderLib(); savePrefs(); });
$("q").addEventListener("input", () => { S.q = $("q").value; renderLib(); });
$("newBtn").addEventListener("click", () => (S.libTab === "songs" ? newSong() : newSet()));
function newSong(fields = {}) {
  const song = C.makeSong({ title: "New song", body: "[Verse 1]\n", ...fields });
  S.songs[song.id] = song; saveSong(song, true);
  S.libTab = "songs";
  openSong(song.id);
  S.editing = true; renderCenter();
  setTimeout(() => { const b = $("editBox"); if (b) { b.focus(); b.setSelectionRange(b.value.length, b.value.length); } }, 0);
  return song;
}
function newSet() {
  const set = C.makeSet({ name: "New set", date: today() });
  S.sets[set.id] = set; saveSet(set, true);
  S.libTab = "sets";
  openSet(set.id);
  setTimeout(() => { const n = $("setName"); if (n) { n.focus(); n.select(); } }, 0);
}
function addToSet(setId, songId) {
  const set = S.sets[setId], song = S.songs[songId];
  if (!set || !song) return;
  set.items.push(C.setItem(song));
  saveSet(set);
  toast(`Added ${song.title || "the song"} to ${set.name}.`);
  renderLib();
  if (S.sel?.kind === "set" && S.sel.id === setId) renderCenter();
}

// ---------- the chart ----------

function numText(sym, key) { const n = C.nashville(sym, key); return n ? n.text : sym; }
/** A song body as HTML: chords over the words (or numbers, or just the words) */
function chartHTML(body, mode, key) {
  const out = [];
  const label = (c) => esc(mode === "numbers" ? numText(c, key) : c);
  let sec = 0;
  for (const l of parseSong(body)) {
    if (l.type === "section") { out.push(`<div class="sec" data-sec="${++sec}">${esc(l.name)}</div>`); continue; }
    if (l.type === "note") { if (mode !== "lyrics") out.push(`<div class="nt">${esc(l.text)}</div>`); continue; }
    if (l.type === "blank") { out.push(`<div class="gap"></div>`); continue; }
    if (l.type !== "lyric") continue;
    const hasChord = l.parts.some((p) => p.chord), hasWords = l.parts.some((p) => p.text.trim());
    if (!hasWords) {
      if (mode !== "lyrics" && hasChord) out.push(`<div class="ln chordsLine">${l.parts.filter((p) => p.chord).map((p) => `<span class="pc"><b>${label(p.chord)}</b></span>`).join(" ")}</div>`);
      continue;
    }
    const seq = [];
    for (const p of l.parts) {
      p.text.split(/(\s+)/).forEach((bit, i) => {
        if (i === 0) { if (bit !== "" || p.chord) seq.push({ chord: p.chord, text: bit }); }
        else if (/^\s+$/.test(bit)) seq.push(null);
        else if (bit) seq.push({ chord: null, text: bit });
      });
    }
    let html = "", open = false;
    seq.forEach((piece, k) => {
      if (piece === null) { if (open) { html += "</span>"; open = false; } html += " "; return; }
      if (!open) { html += `<span class="tk">`; open = true; }
      // a chord inside a word: a thin line joins the word back up if the chord pushes it apart
      const mid = piece.text && seq[k + 1] && seq[k + 1] !== null;
      html += `<span class="pc${mid ? " mid" : ""}"><b>${piece.chord ? label(piece.chord) : ""}</b><i>${esc(piece.text)}</i></span>`;
    });
    if (open) html += "</span>";
    out.push(`<div class="ln${hasChord ? "" : " bare"}">${html}</div>`);
  }
  return `<div class="chart${mode === "lyrics" ? " lyrics" : ""}">${out.join("")}</div>`;
}
/** A small guitar chord box */
function diagramSVG(sym) {
  const sh = C.guitarShape(sym);
  if (!sh) return "";
  const fretted = sh.frets.filter((f) => f > 0), max = fretted.length ? Math.max(...fretted) : 0, min = fretted.length ? Math.min(...fretted) : 1;
  const base = max <= 4 ? 1 : min, X = (i) => 10 + i * 10, Y = (j) => 16 + j * 13;
  let g = "";
  for (let i = 0; i < 6; i++) g += `<line x1="${X(i)}" y1="${Y(0)}" x2="${X(i)}" y2="${Y(4)}" stroke="currentColor" stroke-width="1"/>`;
  for (let j = 0; j <= 4; j++) g += `<line x1="${X(0)}" y1="${Y(j)}" x2="${X(5)}" y2="${Y(j)}" stroke="currentColor" stroke-width="${j === 0 && base === 1 ? 3 : 1}"/>`;
  sh.frets.forEach((f, i) => {
    if (f < 0) g += `<text x="${X(i)}" y="11" font-size="9" text-anchor="middle" fill="currentColor">x</text>`;
    else if (f === 0) g += `<circle cx="${X(i)}" cy="8" r="3" fill="none" stroke="currentColor"/>`;
    else g += `<circle cx="${X(i)}" cy="${Y(f - base + 0.5)}" r="4.2" fill="#ff3b00"/>`;
  });
  if (base > 1) g += `<text x="64" y="${Y(0.8)}" font-size="9" fill="currentColor">${base}fr</text>`;
  return `<figure><svg width="76" height="72" viewBox="0 0 76 72" role="img" aria-label="${esc(sym)} chord shape">${g}</svg>${esc(sym)}</figure>`;
}

function capoLine(cur) {
  if (!cur.key) return "No chords yet, so no key. Edit the song to add some.";
  const forSet = cur.item ? " Key and capo are for this set only." : "";
  if (cur.capo) return `Capo ${cur.capo}: play <b>${esc(C.shapeKey(cur.key, cur.capo))}</b> shapes, sounds in ${esc(cur.key)}.${forSet}`;
  return `Key of ${esc(cur.key)}.${forSet}`;
}
function renderSongView() {
  const cur = current();
  const head = $("centerHead"), body = $("centerBody");
  if (!cur) return renderWelcome();
  const { song, set, item } = cur;
  const dur = C.songDuration(song);
  let ctx = "";
  if (set) {
    const list = songItems(set), at = list.findIndex((i) => i.id === item.id);
    ctx = `<div class="ctx"><span>Set: <b>${esc(set.name)}</b> · song ${at + 1} of ${list.length}</span>
      <button class="small" id="ctxPrev" ${at <= 0 ? "disabled" : ""}>&lsaquo; Previous</button><button class="small" id="ctxNext" ${at >= list.length - 1 ? "disabled" : ""}>Next &rsaquo;</button><button class="small" id="ctxBack">Back to the set</button></div>`;
  }
  const keyOpts = cur.key ? C.keyChoices(cur.key).map((k) => `<option${k === cur.key ? " selected" : ""}>${k}</option>`).join("") : `<option>No key</option>`;
  const capoOpts = Array.from({ length: 10 }, (_, i) => `<option value="${i}"${i === cur.capo ? " selected" : ""}>${i ? `Capo ${i}` : "No capo"}</option>`).join("");
  head.innerHTML = `${ctx}<div class="titleRow"><span class="songTitle" id="songTitle">${esc(song.title || "Untitled song")}</span><span class="songSub">${esc([song.artist, song.tempo ? `${song.tempo} BPM` : "", song.time, `${dur.estimated ? "about " : ""}${C.formatTime(dur.sec)}`].filter(Boolean).join(" · "))}</span></div>
    <div class="tb">
      <label>Key <select id="keySel" ${cur.key ? "" : "disabled"} aria-label="Key">${keyOpts}</select></label>
      <select id="capoSel" aria-label="Capo">${capoOpts}</select>
      <span class="seg" id="viewSeg"><button data-v="chords">Chords</button><button data-v="numbers">Numbers</button><button data-v="lyrics">Lyrics</button></span>
      <label class="toggle"><input type="checkbox" id="diagT" ${S.diagrams ? "checked" : ""}> Diagrams</label>
      <button class="small${S.editing ? " on" : ""}" id="editBtn">${S.editing ? "Done" : "Edit"}</button>
      <button class="small" id="stageBtn">Stage</button>
      <button class="small" id="printBtn">Print</button>
    </div>
    <div class="capoNote" id="capoNote">${capoLine(cur)}</div>`;
  for (const b of head.querySelectorAll("#viewSeg button")) b.classList.toggle("on", b.dataset.v === S.view);
  if (S.editing) {
    body.innerHTML = `<div class="wrap" style="margin-bottom:8px"><span class="tip" style="margin:0;flex:1">Chords in [brackets] before the word, [Verse 1] on its own line for a part, {note: ...} for a band note. ${set && C.normKey(cur.key) !== C.songKey(song) ? `Shown in the song's own key (${esc(C.songKey(song))}).` : ""}</span><button class="small" id="tidyBtn" title="Chords written above the words move into them">Tidy pasted chords</button></div>
      <textarea id="editBox" spellcheck="false" aria-label="Song text">${esc(song.body)}</textarea>`;
    return;
  }
  const chart = C.chartFor(song, cur.key, cur.capo);
  let html = "";
  if (S.diagrams && S.view === "chords") {
    const used = chordsUsed(chart.body);
    html += used.length ? `<div class="diagrams">${used.map(diagramSVG).join("")}</div>` : "";
  }
  html += song.body.trim() ? chartHTML(chart.body, S.view, chart.shapes) : `<p class="tip">This song is empty. Press Edit to type or paste it.</p>`;
  if (song.notes) html += `<div class="note" style="margin-top:14px"><b>Notes:</b> ${esc(song.notes)}</div>`;
  body.innerHTML = html;
}
function renderWelcome() {
  $("centerHead").innerHTML = `<div class="songTitle">Set List</div><div class="songSub">Chord charts and set lists, any key, on stage or on paper.</div>`;
  $("centerBody").innerHTML = `<p>Pick a song or a set on the left, or paste a chord sheet in the <b>Add</b> tab.</p>
    <ul class="tip"><li>Change a song's key and every chord moves, spelled for the new key.</li><li>Build a set, give each song its own key, and see the total time.</li><li>Stage view has big text, auto-scroll and foot pedal page turns.</li></ul>`;
}

$("centerHead").addEventListener("change", (e) => {
  const cur = current();
  if (!cur) return;
  if (e.target.id === "keySel") {
    const to = e.target.value;
    if (cur.item) { cur.item.key = to; saveSet(cur.set); }
    else {
      const from = C.songKey(cur.song);
      cur.song.body = C.transposeBody(cur.song.body, from, to); cur.song.key = to; saveSong(cur.song);
      renderLib();
    }
    renderCenter(); renderSide();
  } else if (e.target.id === "capoSel") {
    const c = +e.target.value;
    if (cur.item) { cur.item.capo = c; saveSet(cur.set); } else { cur.song.capo = c; saveSong(cur.song); }
    renderCenter(); renderSide();
  } else if (e.target.id === "diagT") { S.diagrams = e.target.checked; savePrefs(); renderCenter(); }
});
$("centerHead").addEventListener("click", (e) => {
  const cur = current();
  const v = e.target.closest("#viewSeg button");
  if (v) { S.view = v.dataset.v; savePrefs(); renderCenter(); return; }
  const id = e.target.closest("button")?.id;
  if (!id) return;
  if (id === "editBtn") { S.editing = !S.editing; renderCenter(); if (S.editing) $("editBox")?.focus(); }
  else if (id === "stageBtn") openStage();
  else if (id === "printBtn" && cur) printCharts([chartJob(cur)]);
  else if (id === "ctxBack" && cur?.set) openSet(cur.set.id);
  else if ((id === "ctxPrev" || id === "ctxNext") && cur?.set) {
    const list = songItems(cur.set), at = list.findIndex((i) => i.id === cur.item.id), to = list[at + (id === "ctxNext" ? 1 : -1)];
    if (to) openSong(to.songId, { setId: cur.set.id, itemId: to.id });
  }
  // set view buttons
  else if (id === "setStage") openStage();
  else if (id === "setProj") { openStage(); openProjector(); }
  else if (id === "setPrintCharts") printSetCharts();
  else if (id === "setPrintList") printSetList();
  else if (id === "setExport") exportCurrentSet();
  else if (id === "setDelete") deleteSet();
  else if (id === "setDup") duplicateSet();
});
$("centerBody").addEventListener("input", (e) => {
  if (e.target.id !== "editBox") return;
  const cur = current();
  if (!cur) return;
  cur.song.body = e.target.value;
  if (!C.normKey(cur.song.key)) { /* key follows the chords until one is set */ }
  saveSong(cur.song);
  later("editHead", () => { renderLib(); }, 600);
});
$("centerBody").addEventListener("click", (e) => {
  if (e.target.id === "tidyBtn") {
    const cur = current(), box = $("editBox");
    if (!cur || !box) return;
    const [s] = C.importText(box.value);
    if (!s) return;
    box.value = s.body; cur.song.body = s.body;
    if (!cur.song.key && s.key) cur.song.key = s.key;
    saveSong(cur.song); toast("Tidied: chords moved into the words.");
  }
});

// ---------- a set ----------

function renderSetView() {
  const set = S.sets[S.sel.id];
  if (!set) { S.sel = null; return renderWelcome(); }
  const t = C.setTiming(set.items, S.songs, set.gap || 0);
  const flow = C.setFlow(set.items, S.songs);
  $("centerHead").innerHTML = `<div class="setHead"><label>Set name<input type="text" id="setName" value="${esc(set.name)}"></label><label>Date<input type="date" id="setDate" value="${esc(set.date)}"></label></div>
    <div class="total"><span><b id="setTotal">${t.estimated ? "~" : ""}${C.formatTime(t.total)}</b> total</span><span>${t.songs} song${t.songs === 1 ? "" : "s"}</span>${t.estimated ? `<span>~ some lengths are guesses from tempo</span>` : ""}</div>
    <div class="tb"><button class="go" id="setStage">Stage</button><button class="small" id="setProj">Projector</button><button class="small" id="setPrintCharts">Print charts</button><button class="small" id="setPrintList">Print set list</button><button class="small" id="setExport">Share file</button><button class="small" id="setDup">Duplicate</button><button class="small danger" id="setDelete">Delete</button></div>`;
  const songsOpts = sortedSongs().map((s) => `<option value="${s.id}">${esc(s.title || "Untitled song")} (${esc(keyOrDash(C.songKey(s)))})</option>`).join("");
  const rows = t.rows.map((r, i) => {
    const it = r.item, f = flow.find((x) => x.index === i);
    let flowHtml = "";
    if (f && f.text && (f.level !== "ok" || it.segue)) flowHtml = `<div class="flow ${f.level}"><i>${f.level === "ok" ? "&#10003;" : "!"}</i><span>${esc(f.text)}${f.pivot ? ` Lead in with ${esc(f.pivot)}.` : ""}</span></div>`;
    const acts = `<div class="acts">${i > 0 ? `<label class="segue" title="Runs straight in from the song before, no stop"><input type="checkbox" class="iseg" ${it.segue ? "checked" : ""}> Segue</label>` : ""}<button class="ib" data-up title="Move up" aria-label="Move up">&uarr;</button><button class="ib" data-down title="Move down" aria-label="Move down">&darr;</button><button class="ib" data-del title="Take out of the set" aria-label="Take out of the set">&times;</button></div>`;
    const dur = `<input type="text" class="dur" inputmode="numeric" value="${it.duration ? C.formatTime(it.duration) : ""}" placeholder="${C.formatTime(r.sec)}" title="Length (m:ss). Empty uses the song's length${r.estimated ? " (a guess from its tempo)" : ""}." aria-label="Length">`;
    if (it.kind === "gap") {
      return `${flowHtml}<div class="srow gapRow" data-id="${it.id}"><span class="grip" title="Drag to reorder">&#8942;&#8942;</span><span class="n"></span><span class="st">${C.formatTime(r.start)}</span>
        <div class="nm"><input type="text" class="gt" value="${esc(it.title)}" aria-label="What happens here"></div><span class="ikey"></span><span class="icapo"></span>${dur}${acts}</div>`;
    }
    const song = r.song;
    if (!song) return `<div class="srow" data-id="${it.id}"><span class="grip">&#8942;&#8942;</span><span class="n">${i + 1}</span><span class="st"></span><div class="nm">Missing song</div><span></span><span></span><span></span>${acts}</div>`;
    const key = it.key || C.songKey(song);
    const keyOpts = key ? C.keyChoices(key).map((k) => `<option${k === key ? " selected" : ""}>${k}</option>`).join("") : `<option>?</option>`;
    const capoOpts = Array.from({ length: 10 }, (_, c) => `<option value="${c}"${c === (+it.capo || 0) ? " selected" : ""}>${c ? `Capo ${c}` : "No capo"}</option>`).join("");
    const num = set.items.slice(0, i + 1).filter((x) => x.kind === "song").length;
    return `${flowHtml}<div class="srow" data-id="${it.id}"><span class="grip" title="Drag to reorder">&#8942;&#8942;</span><span class="n">${num}</span><span class="st" title="Starts at">${C.formatTime(r.start)}</span>
      <div class="nm"><button data-open title="Open the chart in this set's key">${esc(song.title || "Untitled song")}${key && key !== C.songKey(song) ? ` <span class="kb" title="Song's own key">${esc(C.songKey(song))}</span>` : ""}</button><input type="text" class="inote" value="${esc(it.note)}" placeholder="Note (who leads, intro, ending)" aria-label="Note for this song"></div>
      <select class="ikey" aria-label="Key in this set" ${key ? "" : "disabled"}>${keyOpts}</select><select class="icapo" aria-label="Capo in this set">${capoOpts}</select>${dur}${acts}</div>`;
  }).join("");
  $("centerBody").innerHTML = `<div class="addRow"><select id="addSong" aria-label="Song to add">${songsOpts || `<option value="">No songs in the library yet</option>`}</select><button class="go" id="addSongBtn" ${songsOpts ? "" : "disabled"}>Add song</button><button class="small" id="addGap" title="A welcome, a prayer, a tuning break">Add a break</button></div>
    <div class="rows" id="rows">${rows || `<div class="empty">No songs in this set yet. Add them above, or with the + next to a song in the library.</div>`}</div>
    <div class="row" style="margin-top:12px"><label>Time between songs (not segues)<select id="setGap">${[0, 15, 30, 60, 120].map((g) => `<option value="${g}"${g === (+set.gap || 0) ? " selected" : ""}>${g ? (g < 60 ? `${g} seconds` : `${g / 60} min`) : "None"}</option>`).join("")}</select></label></div>
    <label style="margin-top:8px">Set notes<textarea id="setNotes" rows="3" placeholder="Rehearsal time, who's on what, anything for the band">${esc(set.notes)}</textarea></label>`;
}
function setOpen() { return S.sel?.kind === "set" ? S.sets[S.sel.id] : null; }
const rowItem = (el, set) => { const r = el.closest(".srow"); return r ? set.items.find((i) => i.id === r.dataset.id) : null; };
$("centerHead").addEventListener("input", (e) => {
  const set = setOpen();
  if (!set) return;
  if (e.target.id === "setName") { set.name = e.target.value; saveSet(set); later("lib", renderLib, 300); }
  if (e.target.id === "setDate") { set.date = e.target.value; saveSet(set); renderLib(); }
});
$("centerBody").addEventListener("change", (e) => {
  const set = setOpen();
  if (!set) return;
  const it = rowItem(e.target, set), cl = e.target.classList;
  if (e.target.id === "setGap") { set.gap = +e.target.value; saveSet(set); renderSetView(); renderLib(); return; }
  if (!it) return;
  if (cl.contains("ikey")) it.key = e.target.value;
  else if (cl.contains("icapo")) it.capo = +e.target.value;
  else if (cl.contains("iseg")) it.segue = e.target.checked;
  else if (cl.contains("dur")) it.duration = C.parseDuration(e.target.value);
  else return;
  saveSet(set); renderSetView(); renderLib();
});
$("centerBody").addEventListener("input", (e) => {
  const set = setOpen();
  if (!set) return;
  if (e.target.id === "setNotes") { set.notes = e.target.value; saveSet(set); return; }
  const it = rowItem(e.target, set);
  if (!it) return;
  if (e.target.classList.contains("inote")) { it.note = e.target.value; saveSet(set); }
  if (e.target.classList.contains("gt")) { it.title = e.target.value; saveSet(set); }
});
$("centerBody").addEventListener("click", (e) => {
  const set = setOpen();
  if (!set) return;
  const b = e.target.closest("button");
  if (!b) return;
  if (b.id === "addSongBtn") { const id = $("addSong").value; if (id) addToSet(set.id, id); return; }
  if (b.id === "addGap") { set.items.push(C.gapItem("Break", 120)); saveSet(set); renderSetView(); renderLib(); return; }
  const it = rowItem(b, set);
  if (!it) return;
  const i = set.items.indexOf(it);
  if (b.hasAttribute("data-open")) { openSong(it.songId, { setId: set.id, itemId: it.id }); return; }
  if (b.hasAttribute("data-up")) set.items = C.moveItem(set.items, i, i - 1);
  else if (b.hasAttribute("data-down")) set.items = C.moveItem(set.items, i, i + 1);
  else if (b.hasAttribute("data-del")) set.items.splice(i, 1);
  else return;
  if (set.items[0]) set.items[0].segue = false;
  saveSet(set); renderSetView(); renderLib();
});
// drag to reorder: only from the grip, so typing in a row's boxes still selects text
let dragId = null;
$("centerBody").addEventListener("pointerdown", (e) => { const g = e.target.closest(".grip"); if (g) g.closest(".srow").draggable = true; });
$("centerBody").addEventListener("dragstart", (e) => {
  const r = e.target.closest?.(".srow");
  if (!r || !r.draggable) { e.preventDefault(); return; }
  dragId = r.dataset.id; r.classList.add("dragging");
  try { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", dragId); } catch {}
});
$("centerBody").addEventListener("dragover", (e) => {
  if (!dragId) return;
  const r = e.target.closest(".srow");
  e.preventDefault();
  for (const x of document.querySelectorAll(".srow.over")) if (x !== r) x.classList.remove("over");
  if (r && r.dataset.id !== dragId) r.classList.add("over");
});
$("centerBody").addEventListener("drop", (e) => {
  const set = setOpen();
  if (!set || !dragId) return;
  e.preventDefault();
  const r = e.target.closest(".srow");
  const from = set.items.findIndex((i) => i.id === dragId);
  let to = r ? set.items.findIndex((i) => i.id === r.dataset.id) : set.items.length - 1;
  if (from >= 0 && to >= 0 && from !== to) {
    set.items = C.moveItem(set.items, from, to);
    if (set.items[0]) set.items[0].segue = false;
    saveSet(set);
  }
  dragId = null; renderSetView(); renderLib();
});
$("centerBody").addEventListener("dragend", () => { dragId = null; for (const x of document.querySelectorAll(".srow")) { x.classList.remove("dragging", "over"); x.draggable = false; } });

function deleteSet() {
  const set = setOpen();
  if (!set || !confirm(`Delete the set "${set.name}"? The songs stay in the library.`)) return;
  delete S.sets[set.id]; store.remove("sets", set.id);
  if (S.activeSet === set.id) S.activeSet = "";
  S.sel = null; renderAll(); savePrefs();
}
function duplicateSet() {
  const set = setOpen();
  if (!set) return;
  const copy = C.makeSet({ ...JSON.parse(JSON.stringify(set)), id: C.newId("t"), name: set.name + " (copy)", date: today() });
  copy.items = copy.items.map((i) => ({ ...i, id: C.newId("i") }));
  S.sets[copy.id] = copy; saveSet(copy, true); openSet(copy.id); toast("Copied. Change the date and the keys for the new service or gig.");
}

// ---------- the side tabs ----------

function renderSide() {
  for (const b of document.querySelectorAll("#sideTabs button")) b.classList.toggle("on", b.dataset.tab === S.tab);
  for (const s of document.querySelectorAll(".tabBody > section")) s.classList.toggle("show", s.dataset.tab === S.tab);
  renderSongTab(); renderCapoTab(); renderShareTab();
}
for (const b of document.querySelectorAll("#sideTabs button")) b.addEventListener("click", () => { S.tab = b.dataset.tab; renderSide(); savePrefs(); if (S.tab === "add") checkSongbook(); });

function renderSongTab() {
  const cur = current(), el = $("songTab");
  if (!cur) { el.innerHTML = `<p class="tip">Pick a song in the library to see its details here.</p>`; return; }
  const s = cur.song, est = C.songDuration({ ...s, duration: 0 });
  el.innerHTML = `<div class="fields">
    <label class="full">Title<input type="text" data-f="title" value="${esc(s.title)}"></label>
    <label class="full">Artist or writer<input type="text" data-f="artist" value="${esc(s.artist)}"></label>
    <label>Tempo (BPM)<input type="number" min="0" max="400" data-f="tempo" value="${s.tempo || ""}" placeholder="e.g. 72"></label>
    <label>&nbsp;<button class="small" id="tapBtn" type="button" title="Tap along to set the tempo">Tap tempo</button></label>
    <label>Time<select data-f="time">${TIMES.map((t) => `<option${t === s.time ? " selected" : ""}>${t}</option>`).join("")}</select></label>
    <label>Length (m:ss)<input type="text" data-f="duration" value="${s.duration ? C.formatTime(s.duration) : ""}" placeholder="about ${C.formatTime(est.sec)}"></label>
    <label class="full">CCLI song number<input type="text" data-f="ccli" value="${esc(s.ccli)}" placeholder="optional"></label>
    <label class="full">Notes for the band<textarea data-f="notes" rows="3" placeholder="Feel, intro, who sings what">${esc(s.notes)}</textarea></label>
  </div>
  <p class="tip">Key: <b>${esc(keyOrDash(C.songKey(s)))}</b>. ${cur.item ? "The key above the chart is just for this set." : "Change it above the chart and the chords move with it."}</p>
  <div class="wrap" style="margin-top:8px"><button class="small" id="dupSong">Duplicate</button><button class="small danger" id="delSong">Delete song</button></div>`;
}
let taps = [];
$("songTab").addEventListener("input", (e) => {
  const cur = current(), f = e.target.dataset.f;
  if (!cur || !f) return;
  const s = cur.song;
  if (f === "tempo") s.tempo = Math.max(0, Math.min(400, Math.round(+e.target.value || 0)));
  else if (f === "duration") s.duration = C.parseDuration(e.target.value);
  else s[f] = e.target.value;
  saveSong(s);
  later("songHead", () => { if (f === "title") renderLib(); if (!S.editing || f !== "notes") renderCenter(); }, 250);
});
$("songTab").addEventListener("change", (e) => { if (e.target.dataset.f === "time") { const cur = current(); if (cur) { cur.song.time = e.target.value; saveSong(cur.song); renderCenter(); } } });
$("songTab").addEventListener("click", (e) => {
  const cur = current();
  if (!cur) return;
  const id = e.target.closest("button")?.id;
  if (id === "tapBtn") {
    const now = performance.now();
    taps = taps.filter((t) => now - t < 2500); taps.push(now);
    if (taps.length >= 3) {
      const gaps = taps.slice(1).map((t, i) => t - taps[i]).slice(-6), bpm = Math.round(60000 / (gaps.reduce((a, b) => a + b, 0) / gaps.length));
      cur.song.tempo = bpm; saveSong(cur.song);
      const inp = document.querySelector('#songTab [data-f="tempo"]'); if (inp) inp.value = bpm;
      renderCenter();
    }
  } else if (id === "dupSong") {
    const copy = C.makeSong({ ...cur.song, id: C.newId("s"), title: cur.song.title + " (copy)", created: Date.now() });
    S.songs[copy.id] = copy; saveSong(copy, true); openSong(copy.id); toast("Copied.");
  } else if (id === "delSong") {
    const inSets = Object.values(S.sets).filter((t) => t.items.some((i) => i.songId === cur.song.id));
    if (!confirm(`Delete "${cur.song.title}"?${inSets.length ? ` It comes out of ${inSets.length} set${inSets.length === 1 ? "" : "s"} too.` : ""}`)) return;
    for (const t of inSets) { t.items = t.items.filter((i) => i.songId !== cur.song.id); saveSet(t); }
    delete S.songs[cur.song.id]; store.remove("songs", cur.song.id);
    S.sel = null; S.ctx = null; renderAll(); savePrefs();
  }
});

function renderCapoTab() {
  const cur = current(), el = $("capoTab");
  if (!cur || !cur.key) { el.innerHTML = `<p class="tip">Open a song with chords to see capo ideas.</p>`; return; }
  const sounding = C.chartFor(cur.song, cur.key, 0).body;
  const sug = C.capoSuggestions(cur.key, chordsUsed(sounding));
  const minor = C.isMinorKey(cur.key);
  const shapes = minor ? ["Em", "Am", "Dm", "Bm"] : ["G", "C", "D", "A", "E"];
  el.innerHTML = `<p>The song sounds in <b>${esc(cur.key)}</b>${cur.item ? " in this set" : ""}. A capo lets you play easier shapes in the same key.</p>
    <h3>Play in the shapes of</h3>
    <div class="wrap">${shapes.filter((k) => C.capoFor(cur.key, k) <= 7).map((k) => { const c = C.capoFor(cur.key, k); return `<button class="small${c === cur.capo ? " on" : ""}" data-capo="${c}" title="${c ? `Capo ${c}` : "No capo"}">${k}${c ? ` (capo ${c})` : ""}</button>`; }).join("")}</div>
    <h3>Every capo, easiest first</h3>
    <ul class="capoList">${sug.map((o) => `<li class="${o.capo === cur.capo ? "cur" : ""}"><span><b>${o.capo ? `Capo ${o.capo}` : "No capo"}</b>: play in ${esc(o.shapeKey)}${o.open ? "" : ""}<small>${esc(o.shapes.join("  "))}</small></span><button class="small" data-capo="${o.capo}" ${o.capo === cur.capo ? "disabled" : ""}>Use</button></li>`).join("")}</ul>
    <p class="tip">Easiest is worked out from real guitar fingerings near the nut. The band still reads ${esc(cur.key)}; only the guitar shapes change.</p>`;
}
$("capoTab").addEventListener("click", (e) => {
  const b = e.target.closest("[data-capo]");
  const cur = current();
  if (!b || !cur) return;
  const c = +b.dataset.capo;
  if (cur.item) { cur.item.capo = c; saveSet(cur.set); } else { cur.song.capo = c; saveSong(cur.song); }
  renderCenter(); renderSide();
});

function renderShareTab() {
  const set = shareSet();
  $("exportSet").disabled = !set;
  $("printCharts2").disabled = !set; $("printSetList2").disabled = !set;
  $("shareWhich").textContent = set ? `Set: ${set.name} (${set.items.filter((i) => i.kind === "song").length} songs)` : "Open a set first.";
  const cur = current();
  $("exportCho").disabled = !cur; $("copyCho").disabled = !cur; $("printSong2").disabled = !cur;
  $("paper").value = S.paper;
}
const shareSet = () => setOpen() || (S.ctx ? S.sets[S.ctx.setId] : null) || null;
function exportCurrentSet() {
  const set = shareSet();
  if (!set) return;
  download(`${fileSafe(set.name)}${set.date ? "_" + set.date : ""}.setlist.json`, C.exportSet(set, S.songs));
  toast("Set file downloaded. Send it to the band.");
}
$("exportSet").addEventListener("click", exportCurrentSet);
$("exportCho").addEventListener("click", () => { const cur = current(); if (cur) download(`${fileSafe(cur.song.title)}.cho`, C.exportChordPro(cur.song), "text/plain"); });
$("copyCho").addEventListener("click", async () => { const cur = current(); if (!cur) return; try { await navigator.clipboard.writeText(C.exportChordPro(cur.song)); toast("ChordPro copied."); } catch { toast("Couldn't copy here. Use Download instead."); } });
$("backup").addEventListener("click", () => download(`encore-setlist-backup_${today()}.json`, C.exportLibrary(Object.values(S.sets), Object.values(S.songs))));
$("paper").addEventListener("change", () => { S.paper = $("paper").value; savePrefs(); });
$("printSong2").addEventListener("click", () => { const cur = current(); if (cur) printCharts([chartJob(cur)]); });
$("printCharts2").addEventListener("click", printSetCharts);
$("printSetList2").addEventListener("click", printSetList);

// ---------- adding songs ----------

function addSongs(list) {
  for (const s of list) { S.songs[s.id] = s; saveSong(s, true); }
  if (list.length) { S.libTab = "songs"; openSong(list[0].id); }
}
$("pasteAdd").addEventListener("click", () => {
  const text = $("pasteBox").value;
  const list = C.importText(text);
  $("addErr").classList.toggle("hidden", list.length > 0);
  if (!list.length) { $("addErr").textContent = "Nothing to add yet. Paste a chord sheet first."; return; }
  addSongs(list); $("pasteBox").value = "";
  toast(list.length === 1 ? `Added ${list[0].title}.` : `Added ${list.length} songs.`);
});
$("blankSong").addEventListener("click", () => newSong());
$("fileIn").addEventListener("change", async (e) => {
  const files = [...e.target.files];
  e.target.value = "";
  let added = [], msgs = [];
  for (const f of files) {
    let text = "";
    try { text = await f.text(); } catch { msgs.push(`Couldn't read ${f.name}.`); continue; }
    if (/\.json$/i.test(f.name) || /^\s*\{\s*"format"\s*:\s*"encore-setlist"/.test(text)) {
      const r = C.importSetFile(text, S.songs, S.sets);
      if (r.error) { msgs.push(r.error); continue; }
      for (const s of r.songs) { S.songs[s.id] = s; store.put("songs", s); }
      for (const t of r.sets) { S.sets[t.id] = t; store.put("sets", t); }
      msgs.push(`${r.sets.length ? `Set "${r.sets[0].name}" opened. ` : ""}${r.added} new song${r.added === 1 ? "" : "s"}, ${r.updated} updated, ${r.kept} already here.`);
      if (r.sets.length) { S.libTab = "sets"; openSet(r.sets[0].id); } else renderAll();
    } else {
      const list = C.importText(text, f.name);
      if (!list.length) msgs.push(`${f.name} had no song in it.`);
      added = added.concat(list);
    }
  }
  if (added.length) { addSongs(added); msgs.unshift(added.length === 1 ? `Added ${added[0].title}.` : `Added ${added.length} songs.`); }
  if (msgs.length) toast(msgs.join(" "), 4500);
});
function songbookSongs() {
  try { const d = JSON.parse(localStorage.getItem("encore.songbook.v1") || "null"); return Array.isArray(d?.songs) ? d.songs.filter((s) => s && typeof s.body === "string") : []; } catch { return []; }
}
function checkSongbook() {
  const have = new Set(Object.values(S.songs).map((s) => s.fromSongbook).filter(Boolean));
  const all = songbookSongs(), fresh = all.filter((s) => !have.has(s.id) && s.body.trim());
  $("sbInfo").textContent = !all.length ? "No ENCORE. Songbook songs in this browser yet." : fresh.length ? `${fresh.length} Songbook song${fresh.length === 1 ? "" : "s"} not here yet. Keys and capos come with them.` : "Every Songbook song is already here.";
  $("sbImport").disabled = !fresh.length;
  return fresh;
}
$("sbImport").addEventListener("click", () => {
  const fresh = checkSongbook();
  const list = fresh.map((s) => C.fromSongbook(s));
  addSongs(list); checkSongbook();
  toast(`Brought in ${list.length} song${list.length === 1 ? "" : "s"} from Songbook.`);
});

// ---------- stage ----------

function stageList() {
  const set = setOpen() || (S.ctx ? S.sets[S.ctx.setId] : null);
  if (set) {
    const list = set.items.filter((i) => i.kind === "gap" || S.songs[i.songId]).map((i) => i.kind === "gap" ? { kind: "gap", title: i.title, sec: i.duration, item: i } :
      { kind: "song", song: S.songs[i.songId], key: i.key || C.songKey(S.songs[i.songId]), capo: +i.capo || 0, item: i });
    let at = 0;
    if (S.ctx) at = Math.max(0, list.findIndex((x) => x.item.id === S.ctx.itemId));
    return { list, at, set };
  }
  const cur = current();
  return cur ? { list: [{ kind: "song", song: cur.song, key: cur.key, capo: cur.capo, item: null }], at: 0, set: null } : null;
}
function openStage() {
  const sl = stageList();
  if (!sl || !sl.list.length) { toast("Add a song first."); return; }
  flushAll();
  S.stage = { list: sl.list, i: sl.at, set: sl.set, auto: false, slide: 0, black: false };
  $("stage").classList.remove("hidden");
  document.body.style.overflow = "hidden";
  renderStage();
  $("stageBody").focus({ preventScroll: true });
}
function closeStage() {
  stopAuto();
  S.stage = null;
  $("stage").classList.add("hidden");
  document.body.style.overflow = "";
}
const entryKeyText = (x) => (x.kind !== "song" ? "" : x.capo ? `${x.key}, capo ${x.capo} (${C.shapeKey(x.key, x.capo)} shapes)` : x.key || "");
function renderStage() {
  const st = S.stage;
  if (!st) return;
  const x = st.list[st.i], next = st.list[st.i + 1];
  $("stTitle").innerHTML = x.kind === "song" ? `${esc(x.song.title || "Untitled song")}<small>${esc(entryKeyText(x))}</small>` : esc(x.title || "Break");
  $("stInfo").textContent = `${st.i + 1} / ${st.list.length}${x.kind === "song" && x.song.tempo ? ` · ${x.song.tempo} BPM` : ""}`;
  $("stNext").textContent = next ? `Next: ${next.kind === "song" ? `${next.song.title} (${entryKeyText(next)})` : next.title}${next.item?.segue ? ", segue" : ""}` : "Last one";
  for (const b of document.querySelectorAll("#stView button")) b.classList.toggle("on", b.dataset.v === S.view);
  $("stSpeed").textContent = S.speed.toFixed(1) + "x";
  $("stAuto").classList.toggle("on", st.auto);
  $("stBlack").classList.toggle("on", st.black);
  $("stPrev").disabled = st.i === 0; $("stNextBtn").disabled = st.i >= st.list.length - 1;
  const body = $("stageBody");
  if (x.kind === "gap") body.innerHTML = `<div class="stGap">${esc(x.title || "Break")}<small>${C.formatTime(x.sec)}</small>${x.item?.note ? `<small>${esc(x.item.note)}</small>` : ""}</div>`;
  else {
    const chart = C.chartFor(x.song, x.key, x.capo);
    body.innerHTML = (x.item?.note ? `<div class="nt" style="color:#ff9466;font-size:20px;margin-bottom:10px">${esc(x.item.note)}</div>` : "") + chartHTML(chart.body, S.view, chart.shapes)
      + `<div class="stEnd">${next ? `End. Next: ${esc(next.kind === "song" ? next.song.title : next.title)}${next.item?.segue ? " (segue)" : ""}. Page down to go on.` : "End of the set."}</div>`;
    body.querySelector(".chart").style.setProperty("--stageSize", S.stageSize + "px");
  }
  body.scrollTop = 0;
  st.slide = 0;
  updateProgress();
  sendProjector();
}
function stageGo(d) {
  const st = S.stage;
  if (!st) return;
  const to = Math.max(0, Math.min(st.list.length - 1, st.i + d));
  if (to === st.i) return;
  const wasAuto = st.auto;
  stopAuto(); st.i = to; renderStage();
  if (wasAuto) startAuto();
}
function stagePage(d) {
  const b = $("stageBody"), max = b.scrollHeight - b.clientHeight;
  if (d > 0) { if (b.scrollTop >= max - 4 || contentEndVisible()) return stageGo(1); b.scrollTop = Math.min(max, b.scrollTop + b.clientHeight * 0.85); }
  else { if (b.scrollTop <= 4) return stageGo(-1); b.scrollTop = Math.max(0, b.scrollTop - b.clientHeight * 0.85); }
  updateProgress(); followSection();
}
// the song's last line is on screen (the padding under it is only there so it can scroll up)
function contentEndVisible() {
  const b = $("stageBody"), end = b.querySelector(".stEnd, .stGap");
  if (!end) return true;
  return end.getBoundingClientRect().bottom <= b.getBoundingClientRect().bottom + 2;
}
function updateProgress() {
  const b = $("stageBody"), end = b.querySelector(".stEnd");
  const total = end ? Math.max(1, end.offsetTop + end.offsetHeight - b.clientHeight) : 1;
  $("stProgBar").style.width = Math.min(100, (b.scrollTop / total) * 100) + "%";
}
let autoRaf = 0, autoLast = 0, autoPos = 0;
function startAuto() {
  const st = S.stage;
  if (!st) return;
  st.auto = true; $("stAuto").classList.add("on");
  autoLast = performance.now(); autoPos = $("stageBody").scrollTop;
  cancelAnimationFrame(autoRaf);
  const tick = (now) => {
    if (!S.stage || !S.stage.auto) return;
    const b = $("stageBody"), x = S.stage.list[S.stage.i], end = b.querySelector(".stEnd");
    const dist = end ? end.offsetTop + end.offsetHeight - b.clientHeight : 0;
    const secs = x.kind === "song" ? (+x.item?.duration || C.songDuration(x.song).sec) : (x.sec || 60);
    const pxPerSec = Math.max(4, dist / Math.max(20, secs * 0.92)) * S.speed;
    const dt = Math.min(0.1, (now - autoLast) / 1000); autoLast = now;
    if (Math.abs(b.scrollTop - autoPos) > 3) autoPos = b.scrollTop; // someone scrolled by hand: carry on from there
    autoPos += pxPerSec * dt;
    b.scrollTop = autoPos;
    updateProgress(); followSection();
    if (dist > 0 && b.scrollTop >= dist - 1) { stopAuto(); return; }
    autoRaf = requestAnimationFrame(tick);
  };
  autoRaf = requestAnimationFrame(tick);
}
function stopAuto() { cancelAnimationFrame(autoRaf); if (S.stage) S.stage.auto = false; $("stAuto").classList.remove("on"); }
function setStageSize(d) {
  S.stageSize = Math.max(16, Math.min(80, S.stageSize + d)); savePrefs();
  $("stageBody").querySelector(".chart")?.style.setProperty("--stageSize", S.stageSize + "px");
}
$("stPrev").addEventListener("click", () => stageGo(-1));
$("stNextBtn").addEventListener("click", () => stageGo(1));
$("stAuto").addEventListener("click", () => (S.stage?.auto ? stopAuto() : startAuto()));
$("stSlower").addEventListener("click", () => { S.speed = Math.max(0.3, Math.round((S.speed - 0.1) * 10) / 10); $("stSpeed").textContent = S.speed.toFixed(1) + "x"; savePrefs(); });
$("stFaster").addEventListener("click", () => { S.speed = Math.min(3, Math.round((S.speed + 0.1) * 10) / 10); $("stSpeed").textContent = S.speed.toFixed(1) + "x"; savePrefs(); });
$("stSmaller").addEventListener("click", () => setStageSize(-3));
$("stBigger").addEventListener("click", () => setStageSize(3));
$("stExit").addEventListener("click", closeStage);
$("stProj").addEventListener("click", openProjector);
$("stBlack").addEventListener("click", () => { if (!S.stage) return; S.stage.black = !S.stage.black; $("stBlack").classList.toggle("on", S.stage.black); sendProjector(); });
$("stView").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; S.view = b.dataset.v; savePrefs(); const top = $("stageBody").scrollTop; renderStage(); $("stageBody").scrollTop = top; });
$("stageBody").addEventListener("scroll", () => { if (!S.stage?.auto) { updateProgress(); followSection(); } }, { passive: true });

document.addEventListener("keydown", (e) => {
  if (!S.stage) return;
  if (e.target.closest?.("input, textarea, select")) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key;
  if (k === "PageDown" || k === " " || k === "ArrowDown" || k === "ArrowRight" || k === "Enter") { e.preventDefault(); stagePage(1); }
  else if (k === "PageUp" || k === "ArrowUp" || k === "ArrowLeft" || k === "Backspace") { e.preventDefault(); stagePage(-1); }
  else if (k === "n" || k === "N") stageGo(1);
  else if (k === "p" || k === "P") stageGo(-1);
  else if (k === "a" || k === "A") S.stage.auto ? stopAuto() : startAuto();
  else if (k === "+" || k === "=") setStageSize(3);
  else if (k === "-" || k === "_") setStageSize(-3);
  else if (k === "b" || k === "B") $("stBlack").click();
  else if (k === "Home") { e.preventDefault(); $("stageBody").scrollTop = 0; }
  else if (k === "Escape") closeStage();
});

// ---------- projector (a second window with just the words) ----------

let chan = null;
try { chan = new BroadcastChannel("encore-setlist-show"); } catch {}
let projWin = null;
function projectorState() {
  const st = S.stage;
  if (!st) return null;
  const x = st.list[st.i];
  if (x.kind !== "song") return { type: "show", title: x.title || "", slides: [], index: 0, black: st.black };
  return { type: "show", title: x.song.title || "", slides: C.lyricSlides(x.song.body, 4), index: st.slide, black: st.black };
}
function sendProjector() { const m = projectorState(); if (m && chan) try { chan.postMessage(m); } catch {} }
if (chan) chan.onmessage = (e) => {
  const m = e.data || {};
  if (m.type === "hello") sendProjector();
  if (m.type === "slide" && S.stage) S.stage.slide = +m.index || 0;
};
function openProjector() {
  try { projWin = window.open("setlist-projector.html", "encore-setlist-projector", "popup,width=1280,height=720"); } catch { projWin = null; }
  if (!projWin) { toast("The browser blocked the projector window. Allow pop-ups for this page, then press Projector again.", 5000); return; }
  setTimeout(sendProjector, 400);
}
// the stage follows along: the part near the top of the screen (the top fifth) is the slide showing
function followSection() {
  const st = S.stage;
  if (!st) return;
  const x = st.list[st.i];
  if (x.kind !== "song") return;
  const b = $("stageBody"), line = b.getBoundingClientRect().top + b.clientHeight * 0.2;
  let sec = 0;
  for (const h of b.querySelectorAll(".sec[data-sec]")) { if (h.getBoundingClientRect().top <= line) sec = +h.dataset.sec; else break; }
  const slides = C.lyricSlides(x.song.body, 4), idx = Math.max(0, slides.findIndex((s) => s.sec === sec));
  if (sec && idx !== st.slide) { st.slide = idx; sendProjector(); }
}

// ---------- printing (one chart a page, and the set list) ----------

const PAGES = { letter: { w: 720, h: 960, css: "size: letter; margin: 0.5in;" }, a4: { w: 698, h: 1026, css: "size: A4; margin: 12.7mm;" } };
function chartJob(cur, pos = "") { return { song: cur.song, key: cur.key, capo: cur.capo, note: cur.item?.note || "", pos }; }
function chartPage(job) {
  const { song } = job, chart = C.chartFor(song, job.key, job.capo), dur = C.songDuration(song);
  const meta = [job.key ? `Key <b>${esc(job.key)}</b>` : "", job.capo ? `Capo <b>${job.capo}</b> (play ${esc(chart.shapes)} shapes)` : "", song.tempo ? `<b>${song.tempo}</b> BPM` : "", song.time ? esc(song.time) : "",
    `${dur.estimated ? "about " : ""}${C.formatTime(dur.sec)}`, song.ccli ? `CCLI ${esc(song.ccli)}` : ""].filter(Boolean).join(" &middot; ");
  return `<div class="pp"><div class="ph"><h1>${esc(song.title || "Untitled song")}</h1><div class="meta">${song.artist ? esc(song.artist) + " &middot; " : ""}${meta}${job.pos ? ` &middot; ${esc(job.pos)}` : ""}</div></div>
    ${job.note || song.notes ? `<div class="pn">${esc([job.note, song.notes].filter(Boolean).join(" / "))}</div>` : ""}<div class="pbody">${chartHTML(chart.body, S.view, chart.shapes)}</div><div class="ft">ENCORE. Set List</div></div>`;
}
/** Shrink the text (then try two columns) until each chart fits its page */
function fitPages(area, page) {
  for (const pp of area.querySelectorAll(".pp")) {
    pp.style.width = page.w + "px"; pp.style.height = page.h + "px";
    const body = pp.querySelector(".pbody, .ptable");
    if (!body) continue;
    const avail = page.h - body.offsetTop - 18;
    body.style.height = avail + "px"; body.style.overflow = "hidden";
    const target = body.firstElementChild;
    let fit = false;
    for (let size = 20; size >= 10 && !fit; size -= 0.5) { target.style.fontSize = size + "px"; fit = target.offsetHeight <= avail; }
    if (!fit && body.classList.contains("pbody")) {
      body.classList.add("two");
      for (let size = 14; size >= 7 && !fit; size -= 0.5) { target.style.fontSize = size + "px"; fit = body.scrollWidth <= body.clientWidth + 1; }
    }
    pp.dataset.fit = fit ? "yes" : "no";
  }
}
let printing = false;
function doPrint(html) {
  const area = $("printArea"), page = PAGES[S.paper] || PAGES.letter;
  area.innerHTML = html;
  fitPages(area, page);
  let st = $("pageStyle");
  if (!st) { st = document.createElement("style"); st.id = "pageStyle"; document.head.appendChild(st); }
  st.textContent = `@page { ${page.css} }`;
  printing = true;
  try { window.print(); } finally { printing = false; }
}
function printCharts(jobs) { if (jobs.length) doPrint(jobs.map(chartPage).join("")); }
function setJobs(set) {
  const list = songItems(set);
  return list.map((it, i) => ({ song: S.songs[it.songId], key: it.key || C.songKey(S.songs[it.songId]), capo: +it.capo || 0, note: it.note, pos: `${set.name}, song ${i + 1} of ${list.length}` }));
}
function printSetCharts() { const set = shareSet(); if (!set) return; const jobs = setJobs(set); if (!jobs.length) { toast("This set has no songs yet."); return; } printCharts(jobs); }
function printSetList() {
  const set = shareSet();
  if (!set) return;
  const t = C.setTiming(set.items, S.songs, set.gap || 0);
  let n = 0;
  const rows = t.rows.map((r) => {
    const it = r.item;
    if (it.kind === "gap") return `<tr><td></td><td><i>${esc(it.title)}</i>${it.note ? `<small>${esc(it.note)}</small>` : ""}</td><td></td><td></td><td class="mono">${C.formatTime(r.sec)}</td><td class="mono">${C.formatTime(r.start)}</td></tr>`;
    if (!r.song) return "";
    n++;
    const key = it.key || C.songKey(r.song);
    return `<tr><td class="mono">${n}</td><td class="big">${it.segue ? `<span class="segueMark">&rarr; segue</span><br>` : ""}${esc(r.song.title || "Untitled song")}${it.note || r.song.artist ? `<small>${esc([r.song.artist, it.note].filter(Boolean).join(" / "))}</small>` : ""}</td>
      <td class="big">${esc(key)}${it.capo ? `<small>capo ${it.capo}, ${esc(C.shapeKey(key, it.capo))} shapes</small>` : ""}</td><td class="mono">${r.song.tempo || ""}</td><td class="mono">${C.formatTime(r.sec)}</td><td class="mono">${C.formatTime(r.start)}</td></tr>`;
  }).join("");
  doPrint(`<div class="pp"><div class="ph"><h1>${esc(set.name)}</h1><div class="meta">${set.date ? esc(set.date) + " &middot; " : ""}${t.songs} songs &middot; ${t.estimated ? "about " : ""}${C.formatLong(t.total)}</div></div>
    <div class="ptable"><div><table><thead><tr><th>#</th><th>Song</th><th>Key</th><th>BPM</th><th>Length</th><th>Starts</th></tr></thead><tbody>${rows}</tbody></table>${set.notes ? `<p style="margin-top:12px;font-size:14px">${esc(set.notes)}</p>` : ""}</div></div><div class="ft">ENCORE. Set List</div></div>`);
}
// printing from the browser menu prints the chart that's open
// (and with a set open, the set list)
window.addEventListener("beforeprint", () => {
  if (printing) return;
  const cur = current(), set = setOpen(), area = $("printArea");
  if (cur) area.innerHTML = chartPage(chartJob(cur));
  else if (set) { printing = true; const real = window.print; window.print = () => {}; try { printSetList(); } finally { window.print = real; printing = false; } return; }
  else return;
  fitPages(area, PAGES[S.paper] || PAGES.letter);
});
// after pressing a stage button, keys (and pedals) go back to the stage, not the button
$("stage").addEventListener("click", (e) => { if (e.target.closest("button")) $("stageBody").focus({ preventScroll: true }); });

// ---------- everything ----------

function renderCenter() {
  if (S.sel?.kind === "set") renderSetView();
  else if (S.sel?.kind === "song") renderSongView();
  else renderWelcome();
}
function renderAll() { renderLib(); renderCenter(); renderSide(); }

// songs to start with: public domain hymns and a traditional song, so a first visit shows how it works
function starter() {
  const grace = C.makeSong({ title: "Amazing Grace", artist: "John Newton (public domain)", key: "G", tempo: 72, time: "3/4", body:
`[Verse 1]
A[G]mazing grace, how [C]sweet the [G]sound
That saved a wretch like [D]me
I [G]once was lost, but [C]now am [G]found
Was [Em]blind, but [D]now I [G]see

[Verse 2]
'Twas [G]grace that taught my [C]heart to [G]fear
And grace my fears re[D]lieved
How [G]precious did that [C]grace ap[G]pear
The [Em]hour I [D]first be[G]lieved

{note: last verse a cappella, then everyone in}` });
  const vision = C.makeSong({ title: "Be Thou My Vision", artist: "Traditional Irish (public domain)", key: "D", tempo: 84, time: "3/4", body:
`[Verse 1]
[D]Be thou my [G]vi[D]sion, O [Bm]Lord of my [G]heart
[D]Naught be all [G]else to me, [A]save that thou [D]art
[G]Thou my best [D]thought, by [G]day or by [A]night
[D]Waking or [G]sleep[D]ing, thy [Bm]presence my [A]li[D]ght

[Verse 2]
[D]Be thou my [G]wis[D]dom, and [Bm]thou my true [G]word
[D]I ever [G]with thee and [A]thou with me, [D]Lord
[G]Thou my great [D]Father, [G]I thy true [A]son
[D]Thou in me [G]dwel[D]ling, and [Bm]I with thee [A]o[D]ne` });
  const light = C.makeSong({ title: "This Little Light of Mine", artist: "Traditional (public domain)", key: "A", tempo: 112, time: "4/4", body:
`[Chorus]
[A]This little light of mine, I'm gonna let it shine
[D]This little light of mine, I'm gonna let it [A]shine
This little light of mine, I'm gonna let it [F#m]shine
Let it [A]shine, let it [E]shine, let it [A]shine

[Verse 1]
[A]Everywhere I go, I'm gonna let it shine
[D]Everywhere I go, I'm gonna let it [A]shine
Everywhere I go, I'm gonna let it [F#m]shine
Let it [A]shine, let it [E]shine, let it [A]shine` });
  const set = C.makeSet({ name: "Sunday morning (example)", date: today(), gap: 30, notes: "Example set. Change anything, or delete it.",
    items: [C.gapItem("Welcome", 90), C.setItem(light), C.setItem(grace, { key: "A", segue: true, note: "Keys only intro" }), C.setItem(vision, { capo: 2 })] });
  return { songs: [grace, vision, light], sets: [set] };
}

async function boot() {
  const [songs, sets, ui, seeded] = await Promise.all([store.loadAll("songs"), store.loadAll("sets"), store.getPref("ui", null), store.getPref("seeded", false)]);
  for (const s of songs) S.songs[s.id] = s;
  for (const t of sets) S.sets[t.id] = t;
  if (!songs.length && !sets.length && !seeded) {
    const st = starter();
    for (const s of st.songs) { S.songs[s.id] = s; store.put("songs", s); }
    for (const t of st.sets) { S.sets[t.id] = t; store.put("sets", t); }
    store.setPref("seeded", true);
    S.sel = { kind: "set", id: st.sets[0].id }; S.activeSet = st.sets[0].id; S.libTab = "sets";
  }
  if (ui) {
    for (const k of ["view", "diagrams", "paper", "libTab", "tab", "stageSize", "speed", "activeSet"]) if (ui[k] !== undefined && ui[k] !== null) S[k] = ui[k];
    if (ui.sel && (ui.sel.kind === "song" ? S.songs[ui.sel.id] : S.sets[ui.sel.id])) { S.sel = ui.sel; S.ctx = ui.ctx && S.sets[ui.ctx.setId] ? ui.ctx : null; }
  }
  if (!["chords", "numbers", "lyrics"].includes(S.view)) S.view = "chords";
  if (!S.sets[S.activeSet]) S.activeSet = "";
  S.ready = true;
  renderAll();
  checkSongbook();
}
boot();

// for the flow test: what's on screen, in plain values
window.__setlist = () => ({
  ready: S.ready, songs: Object.values(S.songs).map((s) => ({ id: s.id, title: s.title, key: C.songKey(s), capo: s.capo, tempo: s.tempo, body: s.body })),
  sets: Object.values(S.sets).map((t) => ({ id: t.id, name: t.name, items: t.items.map((i) => ({ kind: i.kind, songId: i.songId, key: i.key, capo: i.capo, segue: i.segue, title: i.title })) })),
  sel: S.sel, ctx: S.ctx, view: S.view, tab: S.tab,
  stage: S.stage ? { i: S.stage.i, n: S.stage.list.length, auto: S.stage.auto, slide: S.stage.slide, title: $("stTitle").textContent, scroll: $("stageBody").scrollTop } : null,
});
