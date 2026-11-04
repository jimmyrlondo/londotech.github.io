// Encore Tag: the page. Drop tracks, edit their tags (one track or several at
// once), save new copies. Reading, writing and the safety check all live in
// tag-core.js; this file is the editor around them. Nothing is uploaded.
import { readTags, writeTags, verifyWrite, FIELDS, FIELD, canStore, imageInfo, isrcCheck, titleCase, tidy, fileNameFor, toCSV, toJSON, readSheet,
  genreSlots, setGenreSlot, initAlbumArtist, mirrorAlbumArtist, setAlbumArtistFollow, coverRule, NAME_PRESETS, presetFill, pickPreset, fillPreview } from "./tag-core.js";
import { PICTURE_TYPES, FORMAT_NAME, SYSTEM } from "./tag-fields.js";
import { sniffMime } from "./tag-bin.js";
import { lrcToLines } from "./tag-id3.js";
import { fmtTime } from "./lastcall-core.js";
import { GENRES } from "./genres.js";
import { zip } from "./zip.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const store = { get(k, d) { try { return localStorage.getItem("encoreTag." + k) ?? d; } catch { return d; } }, set(k, v) { try { localStorage.setItem("encoreTag." + k, v); } catch { /* private window */ } } };
const andList = (a) => (a.length <= 1 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1]);
const kb = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");

// ---------- state ----------
let nextId = 1;
const state = { files: [], sel: new Set(), focus: null, added: new Set(), tab: store.get("tab", "main") };
window.__tag = state; // read by the headless browser check

const byId = (id) => state.files.find((f) => f.id === id);
// the tracks being edited: the selected ones, in list order
const targets = () => state.files.filter((f) => state.sel.has(f.id));
const editable = () => targets().filter((f) => !f.model.readOnly);
const formats = () => [...new Set(editable().map((f) => f.model.format))];

// ---------- loading ----------
const AUDIO = /\.(mp3|wav|wave|flac|m4a|mp4|aac|alac|aif|aiff|aifc|ogg|oga|opus)$/i, IMAGE = /\.(jpe?g|png|gif|webp|bmp)$/i;
const isImage = (f) => (f.type || "").startsWith("image/") || IMAGE.test(f.name);
async function addFiles(list) {
  const files = [...list].filter((f) => !isImage(f));
  if (!files.length) return;
  setStatus("busy", `Reading ${files.length} file${files.length > 1 ? "s" : ""}...`);
  const added = [];
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let model;
    try { model = readTags(bytes, file.name); } catch (e) { model = { format: null, fields: {}, multi: {}, custom: [], pictures: [], other: [], notes: [], readOnly: e.message, info: { name: file.name, size: bytes.length } }; }
    if (!model.format && !AUDIO.test(file.name)) continue;
    if (!model.readOnly) initAlbumArtist(model);
    const f = { id: nextId++, name: file.name, bytes, model, dirty: false, saved: null };
    state.files.push(f); added.push(f);
  }
  if (!added.length) { setStatus("bad", "Those don't look like audio files."); return; }
  state.sel = new Set(added.map((f) => f.id));
  state.focus = added[0].id;
  setStatus("", "");
  renderAll();
}

// ---------- editing helpers ----------
function touch(list = editable()) { for (const f of list) { f.dirty = true; f.saved = null; } renderList(); }
function setField(key, value) {
  for (const f of editable()) {
    if (value === "") delete f.model.fields[key]; else f.model.fields[key] = value;
    delete f.model.multi?.[key];
    fieldChanged(f, key);
  }
  touch();
}
// after a field changed on one file: album artist follows artist; typing an album artist stops that
function fieldChanged(f, key) {
  if (key === "albumArtist") f.model.aaFollow = false;
  if (key === "artist") mirrorAlbumArtist(f.model);
  if (key === "genre") delete f.model.genreSlots;
}
// a field across the selected tracks: { value, mixed }
function fieldState(key) {
  const vals = editable().map((f) => f.model.fields[key] ?? "");
  const same = vals.every((v) => v === vals[0]);
  return { value: same ? vals[0] ?? "" : "", mixed: !same };
}
// where this field can't be saved, in words ("" if everywhere)
function whyNot(key) {
  const fm = formats(), bad = fm.filter((x) => canStore(x, key) !== true);
  if (!bad.length) return "";
  if (bad.length === fm.length) return canStore(bad[0], key);
  return `Not saved in ${andList(bad.map((x) => FORMAT_NAME[x]))} files.`;
}
const allBlocked = (key) => { const fm = formats(); return fm.length > 0 && fm.every((x) => canStore(x, key) !== true); };

// ---------- the file list and the current track ----------
function renderList() {
  document.body.classList.toggle("hasFiles", state.files.length > 0);
  $("filesCard").classList.toggle("hidden", !state.files.length);
  $("emptyView").classList.toggle("hidden", !!state.files.length);
  $("fileList").innerHTML = state.files.map((f) => {
    const m = f.model, badge = m.readOnly ? '<span class="badge ro">READ ONLY</span>' : f.saved?.ok ? '<span class="badge saved">SAVED</span>' : f.saved && !f.saved.ok ? '<span class="badge fail">NOT SAVED</span>' : f.dirty ? '<span class="badge edited">EDITED</span>' : `<span class="badge">${esc(FORMAT_NAME[m.format] || "?")}</span>`;
    const sub = [m.fields.track ? "#" + m.fields.track : "", m.fields.title || "", m.fields.artist || ""].filter(Boolean).join("  ");
    const on = player.id === f.id && !audio.paused;
    return `<li data-id="${f.id}" class="${f.id === state.focus ? "focus" : ""}"><input type="checkbox" ${state.sel.has(f.id) ? "checked" : ""} aria-label="Select ${esc(f.name)}">
      <button class="pbtn${on ? " on" : ""}" data-play="${f.id}" title="${on ? "Pause" : "Play"} (Alt+P plays the open track)" aria-label="${on ? "Pause" : "Play"} ${esc(f.name)}">${on ? ICON.pause : ICON.play}</button>
      <div style="min-width:0"><div class="fname">${esc(f.name)}</div><div class="fsub">${esc(sub || (m.info?.duration ? fmtTime(m.info.duration) : ""))}</div></div>${badge}</li>`;
  }).join("");
  const n = state.sel.size;
  $("selCount").textContent = `${n} of ${state.files.length} selected`;
  $("selAll").checked = n === state.files.length && n > 0;
  $("selAll").indeterminate = n > 0 && n < state.files.length;
  const t = targets(), ed = editable();
  $("saveBtn").disabled = !ed.length;
  $("saveBtn").textContent = ed.length > 1 ? `Save ${ed.length} copies (zip)` : "Save a copy";
}

const urls = new WeakMap();
const picUrl = (p) => { if (!urls.has(p.bytes)) urls.set(p.bytes, URL.createObjectURL(new Blob([p.bytes], { type: p.mime || sniffMime(p.bytes) || "image/jpeg" }))); return urls.get(p.bytes); };
const frontOf = (m) => m.pictures.find((p) => p.type === 3) || m.pictures[0];
const sameBytes = (a, b) => a === b || (a && b && a.length === b.length && a.every((x, i) => x === b[i]));
const firstSentence = (t) => t.split(/(?<=\.)\s/)[0];
function imgText(p) { const im = imageInfo(p.bytes); return [im.width ? `${im.width} x ${im.height}` : "", { jpeg: "JPG", png: "PNG", gif: "GIF", webp: "WebP", bmp: "BMP" }[im.type] || "unknown type", kb(p.bytes.length)].filter(Boolean).join(", "); }

function renderCurrent() {
  const t = targets();
  $("currentCard").classList.toggle("hidden", !t.length);
  if (!t.length) return;
  const fronts = t.map((f) => frontOf(f.model)), same = fronts.every((p) => sameBytes(p?.bytes, fronts[0]?.bytes));
  const box = $("coverBox"), p = fronts[0];
  box.innerHTML = same && p ? `<img src="${picUrl(p)}" alt="Cover art">` : same ? "Drop cover art<br>or tap to add" : "Different covers";
  $("coverRemove").disabled = !fronts.some(Boolean);
  $("coverPick").textContent = fronts.some(Boolean) ? "Replace" : "Add";
  let check = "";
  if (same && p) { const c = coverRule(imageInfo(p.bytes)); check = `<div class="coverNote ${c.level}">${esc(c.text)}</div>`; }
  if (t.length > 1) {
    const fm = [...new Set(t.map((f) => FORMAT_NAME[f.model.format] || "?"))];
    $("meta").innerHTML = `<div class="t">${t.length} tracks selected</div><div class="line">${esc(fm.join(", "))}</div><div class="line">${esc(fmtTime(t.reduce((a, f) => a + (f.model.info?.duration || 0), 0)))} in all</div>
      <div class="line muted">Edits apply to all of them. A cover added here goes on every one.</div>${check}`;
    refreshCoverCell();
    return;
  }
  const m = t[0].model, i = m.info || {};
  const quality = [i.sampleRate ? `${Number((i.sampleRate / 1000).toFixed(2))} kHz` : "", i.bitDepth && !i.lossy ? `${i.bitDepth}-bit${i.float ? " float" : ""}` : "", i.bitrate ? `${i.bitrate} kbps${i.vbr ? " VBR" : ""}` : "", i.channels ? (i.channels === 1 ? "mono" : i.channels === 2 ? "stereo" : i.channels + " ch") : ""].filter(Boolean).join(", ");
  $("meta").innerHTML = `<div class="t">${esc(m.fields.title || t[0].name)}</div><div class="line">${esc(m.fields.artist || "")}</div>
    <div class="line">${esc(i.label || FORMAT_NAME[m.format] || "Unknown")}${i.duration ? ", " + esc(fmtTime(i.duration)) : ""}</div><div class="line muted">${esc(quality)}</div>
    <div class="line muted">${esc(kb(i.size || t[0].bytes.length))}${i.tagFormats?.length ? ", tags: " + esc(i.tagFormats.join(", ")) : ", no tags yet"}</div>
    ${m.readOnly ? `<div class="coverNote fail">${esc(m.readOnly)}</div>` : ""}${check}`;
  refreshCoverCell();
}

// ---------- field inputs ----------
const genreList = Object.values(GENRES).flat();
function control(f, idSuffix = "") {
  const st = fieldState(f.key), blocked = allBlocked(f.key), id = "f_" + f.key + idSuffix;
  const ph = st.mixed ? "(different, leave to keep)" : f.key === "date" ? "2026 or 2026-05-01" : f.key === "isrc" ? "US-ABC-26-00001" : "";
  const attrs = `id="${id}" data-key="${f.key}" ${blocked ? "disabled" : ""} placeholder="${esc(ph)}" class="${st.mixed ? "mixed" : ""}"`;
  if (f.type === "explicit") return `<select ${attrs}>${st.mixed ? '<option value="\u0001">(different)</option>' : ""}<option value="">Not set</option><option value="explicit">Explicit</option><option value="clean">Clean</option></select>`;
  if (f.type === "flag") return `<select ${attrs}>${st.mixed ? '<option value="\u0001">(different)</option>' : ""}<option value="">No</option><option value="1">Yes</option></select>`;
  if (f.type === "rating") return `<select ${attrs}>${st.mixed ? '<option value="\u0001">(different)</option>' : ""}<option value="">No rating</option>${[1, 2, 3, 4, 5].map((n) => `<option value="${n}">${"★".repeat(n)}${"☆".repeat(5 - n)}</option>`).join("")}</select>`;
  if (f.type === "long") return `<textarea ${attrs} rows="${f.key === "comment" ? 2 : 3}">${esc(st.value)}</textarea>`;
  return `<input ${attrs} value="${esc(st.value)}" ${f.type === "num" ? 'inputmode="numeric"' : ""} ${f.key === "genre" ? 'list="genres"' : ""} spellcheck="${f.type === "num" || f.key === "isrc" || /^mb|^url|^rg/.test(f.key) ? "false" : "true"}" autocomplete="off">`;
}
// the main fields whose name alone isn't enough
const MAIN_HINTS = new Set(["featured", "isrc", "explicit", "phonographic", "copyright"]);
function fieldCell(f, { removable = false, cls = "" } = {}) {
  const why = whyNot(f.key);
  return `<label class="${cls}" ${f.hint ? `title="${esc(f.hint)}"` : ""}><span class="lbl"><span>${esc(f.label)}</span>${removable ? `<button class="x" data-remove="${f.key}" title="Remove this field" aria-label="Remove ${esc(f.label)}">×</button>` : ""}</span>${control(f)}
    ${why ? `<span class="why">${esc(why)}</span>` : f.hint && (!f.main || MAIN_HINTS.has(f.key)) ? `<span class="hint">${esc(f.hint)}</span>` : ""}${f.key === "isrc" ? '<span class="why hidden" id="isrcBad">That doesn\'t look like an ISRC: 12 characters, like US-ABC-26-00001.</span>' : ""}</label>`;
}
function pairCell(a, b, label, cls = "") {
  const fa = FIELD[a], fb = FIELD[b], why = whyNot(a);
  return `<label class="${cls}"><span class="lbl">${esc(label)}</span><span class="pair">${control(fa)}<span>of</span>${control(fb)}</span>${why ? `<span class="why">${esc(why)}</span>` : ""}</label>`;
}
function wireInputs(root) {
  for (const el of root.querySelectorAll("[data-key]")) {
    const key = el.dataset.key;
    if (el.tagName === "SELECT") { const st = fieldState(key); el.value = st.mixed ? "" : st.value; }
    el.addEventListener(el.tagName === "SELECT" ? "change" : "input", () => {
      if (el.value === "\u0001") return;
      el.classList.remove("mixed"); el.placeholder = "";
      setField(key, el.value);
      if (key === "isrc") checkIsrc(el);
      if (key === "title" || key === "artist" || key === "track") { renderCurrentTitleOnly(); }
      if (key === "artist") refreshAA({ value: true });
    });
    if (key === "isrc") checkIsrc(el);
  }
}
function checkIsrc(el) { const v = el.value.trim(), bad = v !== "" && !isrcCheck(v).valid; el.classList.toggle("bad", bad); $("isrcBad")?.classList.toggle("hidden", !bad); }
function renderCurrentTitleOnly() { const t = targets(); if (t.length === 1) { const el = $("meta").querySelector(".t"); if (el) el.textContent = t[0].model.fields.title || t[0].name; } }

// album artist: follows Artist (shown dimmer, "same as artist") until someone types their own
function aaState() {
  const t = editable(), n = t.filter((f) => f.model.aaFollow).length;
  return { all: t.length > 0 && n === t.length, some: n, total: t.length };
}
function albumArtistCell() {
  const f = FIELD.albumArtist, st = fieldState("albumArtist"), a = aaState();
  const ph = st.mixed ? "(different, leave to keep)" : "";
  return `<label class="wideOnPhone" title="${esc(f.hint)}"><span class="lbl"><span>Album artist</span><button class="link${a.all ? " hidden" : ""}" id="aaLink" style="padding:0;font-size:11.5px" title="Make Album artist follow Artist again">use artist</button></span>
    <input id="f_albumArtist" data-aa value="${esc(st.value)}" placeholder="${esc(ph)}" class="${[st.mixed ? "mixed" : "", a.all ? "follow" : ""].join(" ")}" spellcheck="true" autocomplete="off">
    <span class="hint" id="aaHint">${esc(aaHintText(a))}</span></label>`;
}
function aaHintText(a = aaState()) {
  if (a.all) return a.total > 1 ? "Same as artist (each track's own)" : "Same as artist";
  if (a.some) return `${a.some} of ${a.total} tracks follow their artist`;
  return "Your own. \"use artist\" links it back.";
}
// after Artist or Album artist changed: update the album artist box without redrawing it (that would lose the cursor)
function refreshAA({ value = false } = {}) {
  const el = $("f_albumArtist"); if (!el) return;
  const a = aaState(), st = fieldState("albumArtist");
  if (value) { el.value = st.value; el.classList.toggle("mixed", st.mixed); }
  el.classList.toggle("follow", a.all);
  el.placeholder = st.mixed ? "(different, leave to keep)" : "";
  $("aaHint").textContent = aaHintText(a);
  $("aaLink").classList.toggle("hidden", a.all);
}
// genres: Primary and Secondary, saved the way each format holds them
function genreState(slot) {
  const vals = editable().map((f) => genreSlots(f.model)[slot] ?? "");
  const same = vals.every((v) => v === vals[0]);
  return { value: same ? vals[0] ?? "" : "", mixed: !same };
}
// how a second genre is saved, for the formats being edited: [short line under the box, full explanation]
function genreHint() {
  const fm = formats(), sys = new Set(fm.map((x) => SYSTEM[x])), short = [], long = [];
  if (sys.has("id3")) {
    if ($("id3Ver").value === "4") { short.push("MP3/WAV/AIFF: two genres (ID3v2.4)."); long.push("MP3, WAV and AIFF with ID3v2.4 tags keep both as separate genres."); }
    else { short.push('MP3/WAV/AIFF: "Primary; Secondary".'); long.push('ID3v2.3 (MP3, WAV, AIFF) has one genre box, so both go in it as "Primary; Secondary", the usual way to write two genres there. Pick ID3v2.4 in the save bar to keep them as separate genres.'); }
  }
  if (sys.has("vorbis")) { short.push("FLAC/Ogg: two GENRE tags."); long.push("FLAC and Ogg save two GENRE tags."); }
  if (sys.has("mp4")) { short.push('M4A: one genre, "Primary; Secondary".'); long.push("M4A holds only one genre, so it's saved as \"Primary; Secondary\"."); }
  return [short.join(" "), long.join(" ")];
}
function genreCell(slot) {
  const st = genreState(slot), label = slot ? "Secondary genre" : "Genre", [hint, why] = slot ? genreHint() : ["", ""];
  return `<label class="wideOnPhone" ${why ? `title="${esc(why)}"` : ""}><span class="lbl"><span>${label}</span>${slot ? '<span class="hint">optional</span>' : ""}</span>
    <input id="f_genre${slot}" data-genre="${slot}" value="${esc(st.value)}" list="genres" placeholder="${st.mixed ? "(different, leave to keep)" : ""}" class="${st.mixed ? "mixed" : ""}" spellcheck="true" autocomplete="off">
    ${slot && hint ? `<span class="hint" id="genreHint">${esc(hint)}</span>` : ""}</label>`;
}
// cover art: square is the rule, size is only advice
function coverCell() {
  const t = editable(), fronts = t.map((f) => frontOf(f.model)), same = fronts.every((p) => sameBytes(p?.bytes, fronts[0]?.bytes)), p = fronts[0];
  const c = !same ? { level: "note", text: "The selected tracks have different covers." } : coverRule(p ? imageInfo(p.bytes) : null);
  return `<div class="coverCell wide" id="coverCell"><span class="lbl" style="justify-content:flex-start;gap:10px"><span>Cover art</span><span class="hint">A square image. JPG or PNG work everywhere.</span></span>
    <div class="stat">${same && p ? `<img src="${picUrl(p)}" alt="">` : ""}<span class="coverNote ${c.level}">${esc(c.text)}</span>
    <button class="small" id="mainCover">${fronts.some(Boolean) ? "Replace" : "Add cover"}</button><button class="link" id="mainPics">All pictures</button></div></div>`;
}
const LANGS = [["eng", "English"], ["spa", "Spanish"], ["fra", "French"], ["deu", "German"], ["ita", "Italian"], ["por", "Portuguese"], ["pol", "Polish"], ["slv", "Slovenian"], ["hrv", "Croatian"],
  ["ces", "Czech"], ["slk", "Slovak"], ["hun", "Hungarian"], ["nld", "Dutch"], ["swe", "Swedish"], ["nor", "Norwegian"], ["dan", "Danish"], ["fin", "Finnish"], ["rus", "Russian"], ["ukr", "Ukrainian"],
  ["ell", "Greek"], ["tur", "Turkish"], ["ara", "Arabic"], ["heb", "Hebrew"], ["hin", "Hindi"], ["jpn", "Japanese"], ["kor", "Korean"], ["zho", "Chinese"], ["som", "Somali"], ["nep", "Nepali"],
  ["mul", "Several languages"], ["zxx", "No words (instrumental)"]];
function renderMain() {
  const t = editable();
  $("batchNote").classList.toggle("hidden", t.length < 2);
  $("batchNote").textContent = t.length > 1 ? `Editing ${t.length} tracks at once. "(different)" means each keeps its own value unless you type a new one. Titles and numbers per track: Album tools.` : "";
  const F = (k, o) => fieldCell(FIELD[k], o);
  $("mainGrid").innerHTML = (targets().length && !t.length) ? `<div class="wide why">${esc(targets()[0].model.readOnly)}</div>` : [
    F("title", { cls: "wideOnPhone" }), F("artist", { cls: "wideOnPhone" }), F("featured", { cls: "wideOnPhone" }), F("album", { cls: "wideOnPhone" }), albumArtistCell(),
    pairCell("track", "trackTotal", "Track number"), F("date"), genreCell(0), genreCell(1), F("composer", { cls: "wideOnPhone" }), F("isrc"), F("barcode"),
    F("label", { cls: "wideOnPhone" }), F("phonographic", { cls: "wideOnPhone" }), F("copyright", { cls: "wideOnPhone" }), F("explicit"), F("language"), coverCell(),
  ].join("") + `<datalist id="genres">${genreList.map((g) => `<option value="${esc(g)}">`).join("")}</datalist><datalist id="langs">${LANGS.map(([c, n]) => `<option value="${c}">${esc(n)}</option>`).join("")}</datalist>`;
  $("f_language")?.setAttribute("list", "langs");
  $("f_language")?.setAttribute("spellcheck", "false");
  wireInputs($("mainGrid"));
  const aa = $("f_albumArtist");
  if (aa) {
    aa.oninput = () => { for (const f of editable()) { f.model.aaFollow = false; if (aa.value === "") delete f.model.fields.albumArtist; else f.model.fields.albumArtist = aa.value; delete f.model.multi?.albumArtist; } touch(); refreshAA(); };
    $("aaLink").onclick = (e) => { e.preventDefault(); for (const f of editable()) setAlbumArtistFollow(f.model, true); touch(); refreshAA({ value: true }); };
  }
  for (const el of $("mainGrid").querySelectorAll("[data-genre]")) el.oninput = () => {
    for (const f of editable()) setGenreSlot(f.model, +el.dataset.genre, el.value);
    el.classList.remove("mixed"); el.placeholder = ""; touch();
  };
  wireCoverCell();
}
function wireCoverCell() { if ($("mainCover")) { $("mainCover").onclick = () => $("coverInput").click(); $("mainPics").onclick = () => showTab("pictures"); } }
// the cover changed: redraw just the cover box on the Main tab
function refreshCoverCell() { const el = $("coverCell"); if (!el || !editable().length) return; el.outerHTML = coverCell(); wireCoverCell(); }

// ---------- more fields ----------
const MORE = FIELDS.filter((f) => !f.main);
const PAIRED = { trackTotal: 1, discTotal: 1, movementTotal: 1 };
const PAIR_OF = { disc: ["discTotal", "Disc number"], movement: ["movementTotal", "Movement"] };
function renderMore() {
  const t = editable();
  const shown = MORE.filter((f) => !PAIRED[f.key] && (state.added.has(f.key) || t.some((x) => String(x.model.fields[f.key] ?? "") !== "" || (PAIR_OF[f.key] && x.model.fields[PAIR_OF[f.key][0]]))));
  $("moreGrid").innerHTML = shown.length ? shown.map((f) => PAIR_OF[f.key] ? pairCell(f.key, PAIR_OF[f.key][0], PAIR_OF[f.key][1], "") : fieldCell(f, { removable: true })).join("")
    : '<div class="wide hint">No extra fields yet. Add any of the ones below: disc number, BPM, key, comment, credits, catalog numbers, sort names, MusicBrainz IDs, ReplayGain, web links and more.</div>';
  wireInputs($("moreGrid"));
  for (const b of $("moreGrid").querySelectorAll("[data-remove]")) b.onclick = (e) => { e.preventDefault(); const k = b.dataset.remove; setField(k, ""); if (PAIR_OF[k]) setField(PAIR_OF[k][0], ""); state.added.delete(k); renderMore(); };
  renderAddList();
  renderCustom();
  updateTabCounts();
}
function renderAddList() {
  const t = editable(), q = $("addSearch").value.trim().toLowerCase();
  const shownKeys = new Set([...$("moreGrid").querySelectorAll("[data-key]")].map((e) => e.dataset.key));
  const list = MORE.filter((f) => !PAIRED[f.key] && !shownKeys.has(f.key) && (!q || [f.label, f.hint, f.cat, f.key].join(" ").toLowerCase().includes(q)));
  let html = "", cat = "";
  for (const f of list) {
    if (f.cat !== cat) { cat = f.cat; html += `<div class="cat">${esc(cat)}</div>`; }
    const blocked = t.length && allBlocked(f.key);
    html += `<button data-add="${f.key}" ${blocked || !t.length ? "disabled" : ""} title="${esc(blocked ? whyNot(f.key) : f.hint || "")}">${esc(f.label)}<small>${esc(blocked ? whyNot(f.key) : f.hint || "")}</small></button>`;
  }
  $("addList").innerHTML = html || '<div class="hint">No standard field matches. Add it as a custom field below.</div>';
  for (const b of $("addList").querySelectorAll("[data-add]")) b.onclick = () => {
    state.added.add(b.dataset.add); $("addSearch").value = ""; renderMore();
    $("f_" + b.dataset.add)?.focus();
  };
}
function renderCustom() {
  const t = editable(), fm = formats();
  const sysText = { id3: "a TXXX frame (MP3, WAV, AIFF)", vorbis: "a NAME=value comment (FLAC, Ogg)", mp4: "an iTunes freeform item (M4A)" };
  $("customHint").textContent = `Any name you like. Saved as ${[...new Set(fm.map((x) => sysText[SYSTEM[x]]))].join(", ") || "the format's own custom tag"}. Most players won't show these, but they're kept in the file.`;
  const names = [...new Set(t.flatMap((f) => f.model.custom.map((c) => c.name)))];
  $("customList").innerHTML = names.map((n, i) => {
    const vals = t.map((f) => f.model.custom.find((c) => c.name === n)?.value ?? null), same = vals.every((v) => v === vals[0]);
    return `<div class="customRow" data-i="${i}"><input value="${esc(n)}" data-cname aria-label="Custom field name" placeholder="NAME" spellcheck="false"><input value="${esc(same ? vals[0] ?? "" : "")}" data-cval class="${same ? "" : "mixed"}" placeholder="${same ? "" : "(different, leave to keep)"}" aria-label="Value"><button class="small" data-cdel aria-label="Remove">×</button></div>`;
  }).join("");
  $("customList").querySelectorAll(".customRow").forEach((row) => {
    let name = names[+row.dataset.i];
    row.querySelector("[data-cname]").oninput = (e) => { const nn = e.target.value; for (const f of t) for (const c of f.model.custom) if (c.name === name) { c.name = nn; delete c.values; } name = nn; touch(); };
    row.querySelector("[data-cval]").oninput = (e) => {
      for (const f of t) { const c = f.model.custom.find((x) => x.name === name); if (c) { c.value = e.target.value; delete c.values; } else f.model.custom.push({ name, value: e.target.value }); }
      e.target.classList.remove("mixed"); e.target.placeholder = ""; touch();
    };
    row.querySelector("[data-cdel]").onclick = () => { for (const f of t) f.model.custom = f.model.custom.filter((c) => c.name !== name); touch(); renderCustom(); };
  });
}
$("addCustom").onclick = () => {
  const t = editable(); if (!t.length) return;
  let n = "CUSTOM", k = 1; const has = (x) => t.some((f) => f.model.custom.some((c) => c.name === x));
  while (has(n)) n = "CUSTOM" + ++k;
  for (const f of t) f.model.custom.push({ name: n, value: "" });
  renderCustom();
  const rows = $("customList").querySelectorAll("[data-cname]"); rows[rows.length - 1]?.select();
};
$("addSearch").oninput = renderAddList;

// ---------- lyrics ----------
function renderLyrics() {
  const t = editable(), st = fieldState("lyrics");
  const ly = $("lyrics"); ly.value = st.value; ly.placeholder = st.mixed ? "(different for each track, leave to keep)" : ""; ly.disabled = !t.length;
  const sv = t.map((f) => f.model.synced || ""), same = sv.every((v) => v === sv[0]);
  const sy = $("synced"); sy.value = same ? sv[0] ?? "" : ""; sy.placeholder = same ? "[00:12.00]First line\n[00:15.50]Second line" : "(different for each track, leave to keep)";
  const bad = formats().filter((x) => SYSTEM[x] !== "id3");
  sy.disabled = !t.length || (bad.length && bad.length === formats().length);
  $("syncedWhy").classList.toggle("hidden", !bad.length);
  $("syncedWhy").textContent = bad.length ? `${andList(bad.map((x) => FORMAT_NAME[x]))} files have no standard synced-lyrics tag. Paste LRC text into Lyrics instead: players that understand LRC will show it in time.` : "";
}
$("lyrics").oninput = (e) => setField("lyrics", e.target.value);
$("synced").oninput = (e) => { for (const f of editable()) if (SYSTEM[f.model.format] === "id3") f.model.synced = e.target.value; touch(); };
$("lrcImport").onclick = () => $("lrcInput").click();
$("lrcInput").onchange = async (e) => {
  const file = e.target.files[0]; e.target.value = "";
  if (!file) return;
  const text = await file.text(), lines = lrcToLines(text);
  if (!lines.length) { setStatus("bad", "That file has no [mm:ss] timings, so it isn't LRC. Paste it into Lyrics instead."); return; }
  $("synced").value = text.replace(/\r/g, "").trim();
  $("synced").dispatchEvent(new Event("input"));
  setStatus("ok", `Imported ${lines.length} timed lines from ${file.name}.`);
};
$("lrcToPlain").onclick = () => {
  const lines = lrcToLines($("synced").value);
  if (!lines.length) return;
  $("lyrics").value = lines.map((l) => l.text).join("\n");
  setField("lyrics", $("lyrics").value);
};

// ---------- pictures ----------
function setFront(bytes, mime) {
  for (const f of editable()) {
    const pics = f.model.pictures, i = pics.findIndex((p) => p.type === 3);
    const pic = { type: 3, mime, desc: "", bytes };
    if (i >= 0) pics[i] = pic; else pics.unshift(pic);
  }
  touch(); renderCurrent(); renderPictures();
}
async function readImage(file) {
  const bytes = new Uint8Array(await file.arrayBuffer()), mime = sniffMime(bytes);
  if (!mime) { setStatus("bad", `${file.name} isn't an image this tool can embed (JPG or PNG work everywhere).`); return null; }
  return { bytes, mime };
}
function renderPictures() {
  const t = editable(), f = t[0];
  const m4a = formats().includes("m4a");
  $("picHint").textContent = !t.length ? "" : (t.length > 1 ? `Showing the pictures in ${f.name}. Adding one adds it to all ${t.length} selected tracks.` : "") +
    (m4a ? " M4A files keep pictures but not their kind or description; the first is the cover." : "") + " JPG or PNG work everywhere. Stores want a square cover; 3000 x 3000 is the best size if you have it, but any square image is fine to use.";
  $("addPic").disabled = !t.length;
  $("pics").innerHTML = !f ? "" : f.model.pictures.map((p, i) => {
    const c = p.type === 3 ? coverRule(imageInfo(p.bytes)) : null;
    return `<div class="pic" data-i="${i}"><img src="${picUrl(p)}" alt=""><div class="stack">
      <select data-ptype aria-label="Picture kind" ${t.length > 1 ? "disabled" : ""}>${PICTURE_TYPES.map((n, k) => `<option value="${k}" ${k === p.type ? "selected" : ""}>${esc(n)}</option>`).join("")}</select>
      <input data-pdesc value="${esc(p.desc || "")}" placeholder="Description (optional)" aria-label="Description" ${t.length > 1 ? "disabled" : ""}>
      <span class="hint">${esc(imgText(p))}</span>${c && c.level !== "ok" ? `<span class="coverNote ${c.level}">${esc(c.text)}</span>` : ""}
      <span class="row"><button class="small" data-pdel ${t.length > 1 ? "disabled" : ""}>Remove</button>${i ? `<button class="small" data-pfront ${t.length > 1 ? "disabled" : ""}>Make it the cover</button>` : ""}</span></div></div>`;
  }).join("") || (f ? '<div class="hint">No pictures in this file.</div>' : "");
  $("pics").querySelectorAll(".pic").forEach((el) => {
    const p = f.model.pictures[+el.dataset.i];
    el.querySelector("[data-ptype]").onchange = (e) => { p.type = +e.target.value; touch(); renderCurrent(); };
    el.querySelector("[data-pdesc]").oninput = (e) => { p.desc = e.target.value; touch(); };
    el.querySelector("[data-pdel]").onclick = () => { f.model.pictures.splice(+el.dataset.i, 1); touch(); renderPictures(); renderCurrent(); };
    const fr = el.querySelector("[data-pfront]");
    if (fr) fr.onclick = () => { const pics = f.model.pictures; for (const q of pics) if (q.type === 3) q.type = 0; p.type = 3; pics.splice(+el.dataset.i, 1); pics.unshift(p); touch(); renderPictures(); renderCurrent(); };
  });
  updateTabCounts();
}
$("addPic").onclick = () => $("picInput").click();
$("picInput").onchange = async (e) => {
  for (const file of [...e.target.files]) {
    const im = await readImage(file); if (!im) continue;
    for (const f of editable()) f.model.pictures.push({ type: f.model.pictures.some((p) => p.type === 3) ? 0 : 3, mime: im.mime, desc: "", bytes: im.bytes });
  }
  e.target.value = ""; touch(); renderPictures(); renderCurrent();
};
$("coverPick").onclick = () => $("coverInput").click();
$("coverBox").onclick = () => $("coverInput").click();
$("coverInput").onchange = async (e) => { const file = e.target.files[0]; e.target.value = ""; if (!file) return; const im = await readImage(file); if (im) setFront(im.bytes, im.mime); };
$("coverRemove").onclick = () => {
  for (const f of editable()) { const pics = f.model.pictures, i = pics.findIndex((p) => p.type === 3); if (i >= 0) pics.splice(i, 1); else if (pics.length) pics.shift(); }
  touch(); renderCurrent(); renderPictures();
};
for (const ev of ["dragenter", "dragover"]) $("coverBox").addEventListener(ev, (e) => { e.preventDefault(); e.stopPropagation(); $("coverBox").classList.add("over"); });
$("coverBox").addEventListener("dragleave", () => $("coverBox").classList.remove("over"));
$("coverBox").addEventListener("drop", async (e) => {
  e.preventDefault(); e.stopPropagation(); $("coverBox").classList.remove("over"); document.body.classList.remove("dragging");
  const file = [...e.dataTransfer.files].find(isImage); if (!file) return;
  const im = await readImage(file); if (im) setFront(im.bytes, im.mime);
});

// ---------- album tools ----------
const albumSet = () => (editable().length > 1 ? editable() : state.files.filter((f) => !f.model.readOnly));
function renderAlbum() {
  const list = albumSet();
  $("albumScope").textContent = editable().length > 1 ? `Working on the ${list.length} selected tracks, in list order.` : `Working on all ${list.length} track${list.length === 1 ? "" : "s"} in the list, in order. Select several to work on just those.`;
  $("albumRows").innerHTML = list.map((f) => `<tr data-id="${f.id}"><td class="num"><input value="${esc(f.model.fields.track || "")}" data-k="track" inputmode="numeric" aria-label="Track number"></td>
    <td><input value="${esc(f.model.fields.title || "")}" data-k="title" aria-label="Title"></td><td><input value="${esc(f.model.fields.artist || "")}" data-k="artist" aria-label="Artist"></td><td class="file" title="${esc(f.name)}">${esc(f.name)}</td></tr>`).join("");
  $("albumRows").querySelectorAll("tr").forEach((tr) => {
    const f = byId(+tr.dataset.id);
    tr.querySelectorAll("input").forEach((inp) => inp.oninput = () => { const k = inp.dataset.k; if (inp.value === "") delete f.model.fields[k]; else f.model.fields[k] = inp.value; delete f.model.multi?.[k]; fieldChanged(f, k); touch([f]); });
  });
  renderFill();
}
// reading titles from file names: preset patterns, picked for you, previewed before anything changes
const fill = { preset: null, auto: true, names: "" };
const tidyOpts = () => ({ spaces: $("tdSpaces").checked, titleCase: $("tdCase").checked, stripNumber: $("tdNum").checked, pattern: $("namePatternIn").value });
for (const [id, key, d] of [["tdSpaces", "tdSpaces", "1"], ["tdCase", "tdCase", "1"], ["tdNum", "tdNum", "1"]]) {
  $(id).checked = store.get(key, d) === "1";
  $(id).onchange = () => { store.set(key, $(id).checked ? "1" : "0"); renderFill(); };
}
$("namePatternIn").value = store.get("fillPattern", $("namePatternIn").value);
$("namePatternIn").oninput = () => { store.set("fillPattern", $("namePatternIn").value); renderFill(); };
function renderFill() {
  const list = albumSet(), names = list.map((f) => f.name), o = tidyOpts();
  // a new set of files: pick the preset again (unless the person chose one for this set)
  if (names.join("\n") !== fill.names) { fill.names = names.join("\n"); fill.auto = true; }
  if (fill.auto || !fill.preset) fill.preset = names.length ? pickPreset(names, o) : "title";
  const fits = Object.fromEntries(NAME_PRESETS.map((p) => [p.id, names.filter((n) => presetFill(n, p.id, o)).length]));
  $("presets").innerHTML = NAME_PRESETS.map((p) => `<button role="radio" aria-checked="${p.id === fill.preset}" class="${p.id === fill.preset ? "on" : ""}" data-preset="${p.id}">${esc(p.label)}<span class="fit">${names.length ? `fits ${fits[p.id]} of ${names.length}` : ""}</span><small>${esc(p.example)}</small></button>`).join("")
    + `<button role="radio" aria-checked="${fill.preset === "custom"}" class="${fill.preset === "custom" ? "on" : ""}" data-preset="custom">Custom...<small>your own pattern</small></button>`;
  for (const b of $("presets").querySelectorAll("[data-preset]")) b.onclick = () => { fill.preset = b.dataset.preset; fill.auto = false; renderFill(); };
  $("customRow").classList.toggle("hidden", fill.preset !== "custom");
  $("tidyRow").classList.toggle("hidden", fill.preset !== "title");
  const rows = fillPreview(list.map((f) => ({ name: f.name, fields: f.model.fields })), fill.preset, o);
  const cell = (r, k) => (!r.values[k] ? '<td class="nc">no change</td>' : k in r.changes ? `<td>${esc(r.values[k])}</td>` : `<td class="nc" title="${esc(r.values[k])}">no change</td>`);
  $("fillRows").innerHTML = rows.map((r) => `<tr><td class="file" title="${esc(r.name)}">${esc(r.name)}</td>${r.match ? cell(r, "title") + cell(r, "artist") + cell(r, "track") : '<td class="miss" colspan="3">Doesn\'t fit this pattern, so it\'s left as it is.</td>'}</tr>`).join("")
    || '<tr><td class="miss" colspan="4">No tracks.</td></tr>';
  const changing = rows.filter((r) => Object.keys(r.changes).length).length, missed = rows.filter((r) => !r.match).length;
  $("fillApply").disabled = !changing;
  $("fillApply").textContent = changing ? `Apply to ${changing} track${changing === 1 ? "" : "s"}` : "Apply";
  $("fillSummary").textContent = !rows.length ? "" : !changing ? (missed === rows.length ? "None of the names fit this pattern. Try another one above." : "Nothing would change: the tags already match.")
    : missed ? `${missed} file name${missed === 1 ? " doesn't" : "s don't"} fit and will be left as they are.` : "";
}
$("fillApply").onclick = () => {
  const list = albumSet(), o = tidyOpts();
  let n = 0;
  for (const f of list) {
    const r = presetFill(f.name, fill.preset, o); if (!r) continue;
    let changed = false;
    for (const [k, v] of Object.entries(r)) { if (String(f.model.fields[k] ?? "") === v) continue; f.model.fields[k] = v; delete f.model.multi?.[k]; fieldChanged(f, k); changed = true; }
    if (changed) { n++; touch([f]); }
  }
  setStatus("ok", `Filled in ${n} track${n === 1 ? "" : "s"} from ${n === 1 ? "its file name" : "their file names"}.`);
  renderAll();
};
$("numberTracks").onclick = () => {
  const list = albumSet();
  list.forEach((f, i) => { f.model.fields.track = String(i + 1); f.model.fields.trackTotal = String(list.length); });
  touch(list); setStatus("ok", `Numbered ${list.length} tracks 1 to ${list.length}, in list order.`); renderAll();
};
$("titleCaseBtn").onclick = () => { const list = albumSet(); for (const f of list) if (f.model.fields.title) f.model.fields.title = titleCase(f.model.fields.title); touch(list); setStatus("ok", `Title Cased ${list.length} title${list.length === 1 ? "" : "s"}.`); renderAll(); };
$("trimBtn").onclick = () => {
  const list = albumSet();
  for (const f of list) {
    for (const [k, v] of Object.entries(f.model.fields)) { const t = FIELD[k]?.type === "long" ? String(v).replace(/[ \t]+$/gm, "").trim() : tidy(v); if (t !== v) { f.model.fields[k] = t; delete f.model.multi?.[k]; } }
    for (const c of f.model.custom) { c.value = tidy(c.value); c.name = c.name.trim(); }
    mirrorAlbumArtist(f.model); delete f.model.genreSlots;
  }
  touch(list); setStatus("ok", "Trimmed extra spaces."); renderAll();
};
function download(blob, name) {
  const a = document.createElement("a"), url = URL.createObjectURL(blob);
  a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
const sheetTracks = () => (state.files).map((f) => ({ name: f.name, model: f.model }));
$("expJson").onclick = () => download(new Blob([toJSON(sheetTracks())], { type: "application/json" }), "tags.json");
$("expCsv").onclick = () => download(new Blob([toCSV(sheetTracks())], { type: "text/csv" }), "tags.csv");
$("impSheet").onclick = () => $("sheetInput").click();
$("sheetInput").onchange = async (e) => {
  const file = e.target.files[0]; e.target.value = "";
  if (!file) return;
  let rows;
  try { rows = readSheet(await file.text()); } catch { setStatus("bad", "That file isn't a tag sheet this tool can read (JSON or CSV)."); return; }
  let n = 0;
  for (const r of rows) {
    const f = state.files.find((x) => x.name.toLowerCase() === String(r.file).toLowerCase());
    if (!f || f.model.readOnly) continue;
    for (const [k, v] of Object.entries(r.fields)) { if (!FIELD[k]) continue; if (String(v) === "") delete f.model.fields[k]; else f.model.fields[k] = String(v); delete f.model.multi?.[k]; if (k !== "artist") fieldChanged(f, k); }
    if ("albumArtist" in r.fields && String(r.fields.albumArtist) === String(f.model.fields.artist ?? "")) f.model.aaFollow = true;
    if ("artist" in r.fields) fieldChanged(f, "artist");
    for (const c of r.custom) { const ex = f.model.custom.find((x) => x.name === c.name); if (ex) { ex.value = String(c.value); delete ex.values; } else f.model.custom.push({ name: c.name, value: String(c.value) }); }
    if (typeof r.synced === "string" && SYSTEM[f.model.format] === "id3") f.model.synced = r.synced;
    touch([f]); n++;
  }
  setStatus(n ? "ok" : "bad", n ? `Imported tags for ${n} of ${rows.length} rows (matched by file name).` : "No rows matched a loaded file's name.");
  renderAll();
};

// ---------- file info ----------
function renderFile() {
  const t = targets(), f = t[0];
  if (!f) { $("fileInfo").innerHTML = ""; return; }
  const m = f.model, i = m.info || {};
  const rows = [["File", f.name], ["Format", i.label || FORMAT_NAME[m.format] || "Unknown"], ["Codec", i.codec], ["Length", i.duration ? fmtTime(i.duration) + ` (${i.duration.toFixed(2)} s)` : ""],
    ["Sample rate", i.sampleRate ? `${i.sampleRate.toLocaleString("en-US")} Hz` : ""], ["Bit depth", i.bitDepth && !i.lossy ? `${i.bitDepth}-bit${i.float ? " float" : ""}` : ""],
    ["Bitrate", i.bitrate ? `${i.bitrate} kbps${i.vbr ? " (variable)" : ""}` : ""], ["Channels", i.channels || ""], ["Size", `${kb(f.bytes.length)} (${f.bytes.length.toLocaleString("en-US")} bytes)`],
    ["Tags found", i.tagFormats?.join(", ") || "none"], ["Encoder", m.vendor || ""]].filter((r) => r[1] !== "" && r[1] !== undefined);
  const kept = m.other || [];
  $("fileInfo").innerHTML = (t.length > 1 ? `<div class="batchNote">Showing the first of ${t.length} selected tracks.</div>` : "") +
    `<dl class="info">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>` +
    (m.readOnly ? `<p class="why">${esc(m.readOnly)}</p>` : "") +
    (m.notes?.length ? `<ul class="notes">${m.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : "") +
    `<h3>Other tags in this file</h3>` + (kept.length ? `<div class="hint" style="margin-bottom:6px">Tags this editor doesn't change: they're copied into the saved file as they are. Untick one to leave it out.</div>
    <div class="kept">${kept.map((o, k) => `<input type="checkbox" data-k="${k}" ${o.remove ? "" : "checked"} ${t.length > 1 ? "disabled" : ""} aria-label="Keep ${esc(o.label)}"><div class="k">${esc(o.label)} <small>${esc(o.id)}${o.size ? ", " + o.size.toLocaleString("en-US") + " bytes" : ""}</small>${o.text ? `<br><small>${esc(String(o.text).slice(0, 300))}</small>` : ""}</div>`).join("")}</div>`
      : '<div class="hint">None. Every tag in this file is shown in the other tabs.</div>');
  $("fileInfo").querySelectorAll("[data-k]").forEach((cb) => cb.onchange = () => { kept[+cb.dataset.k].remove = !cb.checked; touch([f]); });
}

// ---------- tabs ----------
function updateTabCounts() {
  const t = editable(), f = t[0];
  const counts = { more: f ? MORE.filter((x) => String(f.model.fields[x.key] ?? "") !== "").length + f.model.custom.length : 0, pictures: f ? f.model.pictures.length : 0, lyrics: f && (f.model.fields.lyrics || f.model.synced) ? "✓" : "" };
  for (const b of $("tabBar").querySelectorAll("button")) {
    const n = counts[b.dataset.tab];
    b.innerHTML = esc(b.textContent.replace(/\s*[\d✓]+$/, "")) + (n ? `<span class="n">${n}</span>` : "");
  }
}
function showTab(tab) {
  state.tab = tab; store.set("tab", tab);
  for (const b of $("tabBar").querySelectorAll("button")) {
    b.classList.toggle("on", b.dataset.tab === tab);
    if (b.dataset.tab === tab) { const bar = $("tabBar"); if (b.offsetLeft + b.offsetWidth > bar.scrollLeft + bar.clientWidth || b.offsetLeft < bar.scrollLeft) bar.scrollLeft = b.offsetLeft - 12; } // keep the open tab in view on phones
  }
  for (const s of $("tabBody").querySelectorAll("section")) s.classList.toggle("show", s.dataset.tab === tab && state.files.length > 0);
}
$("tabBar").onclick = (e) => { const b = e.target.closest("button"); if (b) { showTab(b.dataset.tab); if (b.dataset.tab === "album") renderAlbum(); } };

// ---------- save ----------
function setStatus(kind, html) { const s = $("status"); s.className = "status " + (kind || ""); s.innerHTML = html; }
const opts = () => ({ id3Version: +$("id3Ver").value, id3v1: $("v1Mode").value });
function renderSaveBar() {
  const fm = new Set(state.files.map((f) => f.model.format));
  $("id3Opt").classList.toggle("hidden", ![...fm].some((x) => SYSTEM[x] === "id3"));
  $("v1Opt").classList.toggle("hidden", !state.files.some((f) => f.model.id3?.hadV1));
  $("namePattern").classList.toggle("hidden", $("nameMode").value !== "pattern");
}
$("id3Ver").value = store.get("id3", "3");
$("nameMode").value = store.get("nameMode", "same");
$("namePattern").value = store.get("namePattern", $("namePattern").value);
$("id3Ver").onchange = () => { store.set("id3", $("id3Ver").value); if ($("genreHint")) { const [h, w] = genreHint(); $("genreHint").textContent = h; $("genreHint").closest("label").title = w; } };
$("nameMode").onchange = () => { store.set("nameMode", $("nameMode").value); renderSaveBar(); };
$("namePattern").oninput = () => store.set("namePattern", $("namePattern").value);
$("optToggle").onclick = () => $("saveBar").classList.toggle("more");

const extOf = (name) => (/\.([a-z0-9]{2,5})$/i.exec(name)?.[1] || "").toLowerCase();
async function save() {
  const list = editable();
  if (!list.length) return;
  setStatus("busy", `Saving ${list.length > 1 ? list.length + " tracks" : "the track"} and checking ${list.length > 1 ? "each copy" : "the copy"}...`);
  await new Promise((r) => setTimeout(r, 30));
  const done = [], failed = [], notes = [], used = new Set();
  for (const f of list) {
    try {
      const o = opts(), out = writeTags(f.bytes, f.model, o), v = verifyWrite(f.bytes, out.bytes, f.model, o);
      f.saved = { ok: v.ok, checks: v.checks, notes: out.notes };
      if (!v.ok) { failed.push([f, v.checks.filter((c) => !c.ok).map((c) => `${c.name}: ${c.detail}`).join("; ")]); continue; }
      let name = $("nameMode").value === "pattern" ? fileNameFor(f.model, $("namePattern").value, extOf(f.name) || f.model.format, f.name) : f.name;
      for (let k = 2; used.has(name.toLowerCase()); k++) name = name.replace(/( \(\d+\))?(\.[^.]+)$/, ` (${k})$2`);
      used.add(name.toLowerCase());
      done.push({ f, name, blob: new Blob([out.bytes], { type: f.model.format === "mp3" ? "audio/mpeg" : "application/octet-stream" }), v });
      notes.push(...out.notes.map((n) => (list.length > 1 ? `${f.name}: ` : "") + n));
      f.dirty = false;
    } catch (e) { f.saved = { ok: false }; failed.push([f, e.message]); }
  }
  if (done.length === 1) download(done[0].blob, done[0].name);
  else if (done.length > 1) download(await zip(done.map(({ name, blob }) => ({ name, blob }))), (list[0].model.fields.album || "Tagged tracks").replace(/[\\/:*?"<>|]+/g, "").trim() + ".zip");
  renderList();
  const audio = done.reduce((a, d) => a + d.v.audioBytes, 0);
  const detail = done.length ? `<details><summary>What was checked</summary><ul>${done.slice(0, 1).flatMap((d) => d.v.checks.map((c) => `<li>${esc(c.name)}: ${esc(c.detail)}</li>`)).join("")}${done.length > 1 ? `<li>The same checks passed for all ${done.length} tracks.</li>` : ""}${notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul></details>` : "";
  if (!failed.length) setStatus("ok", `<b>Saved, audio untouched.</b> ${done.length > 1 ? done.length + " copies in a zip; " : ""}${audio.toLocaleString("en-US")} bytes of audio compared with the original, all identical, and every tag read back.${detail}`);
  else setStatus("bad", `<b>${failed.length} track${failed.length > 1 ? "s were" : " was"} not saved</b> because the check after writing didn't pass, so nothing unsafe was downloaded.<ul>${failed.map(([f, why]) => `<li>${esc(f.name)}: ${esc(why)}</li>`).join("")}</ul>${done.length ? `${done.length} other track(s) saved.` : ""}${detail}`);
}
$("saveBtn").onclick = save;
document.addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); save(); } });
window.addEventListener("beforeunload", (e) => { if (state.files.some((f) => f.dirty)) { e.preventDefault(); e.returnValue = ""; } });

// ---------- the list: selecting ----------
$("fileList").onclick = (e) => {
  const li = e.target.closest("li"); if (!li) return;
  const id = +li.dataset.id;
  if (e.target.closest("[data-play]")) { playToggle(id); return; }
  if (e.target.tagName === "INPUT") { if (e.target.checked) state.sel.add(id); else state.sel.delete(id); state.focus = id; }
  else if (e.shiftKey && state.focus) { const a = state.files.findIndex((f) => f.id === state.focus), b2 = state.files.findIndex((f) => f.id === id); for (const f of state.files.slice(Math.min(a, b2), Math.max(a, b2) + 1)) state.sel.add(f.id); }
  else if (e.ctrlKey || e.metaKey) { if (state.sel.has(id)) state.sel.delete(id); else state.sel.add(id); state.focus = id; }
  else { state.sel = new Set([id]); state.focus = id; }
  renderAll();
};
$("selAll").onchange = (e) => { state.sel = e.target.checked ? new Set(state.files.map((f) => f.id)) : new Set(); renderAll(); };
$("sortName").onclick = () => { state.files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })); renderAll(); };
$("clearAll").onclick = () => {
  if (state.files.some((f) => f.dirty) && !confirm("Some tracks have changes you haven't saved. Clear the list anyway?")) return;
  stopPlayer(); state.files = []; state.sel = new Set(); state.focus = null; state.added.clear(); setStatus("", ""); renderAll();
};

// ---------- dropping files ----------
const pick = () => $("fileInput").click();
$("drop").onclick = pick;
$("emptyPick").onclick = pick;
$("drop").onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } };
$("fileInput").onchange = (e) => { addFiles(e.target.files); e.target.value = ""; };
let dragDepth = 0;
window.addEventListener("dragenter", (e) => { if ([...e.dataTransfer.types].includes("Files")) { dragDepth++; document.body.classList.add("dragging"); } });
window.addEventListener("dragleave", () => { if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove("dragging"); } });
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", async (e) => {
  e.preventDefault(); dragDepth = 0; document.body.classList.remove("dragging");
  const files = [...e.dataTransfer.files];
  const imgs = files.filter(isImage), audio = files.filter((f) => !isImage(f));
  if (audio.length) await addFiles(audio);
  else if (imgs.length && editable().length) { const im = await readImage(imgs[0]); if (im) setFront(im.bytes, im.mime); }
});

// ---------- listening: one track at a time, with an <audio> element ----------
// The play button on a file plays that file. Choosing another file stops what's
// playing and loads the new one, paused: it plays when you press play (or Alt+P).
// Space is left alone, so it types spaces in the fields.
const ICON = { play: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 1.2v9.6L10.5 6z"/></svg>', pause: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 1.2h3v9.6H2zM7 1.2h3v9.6H7z"/></svg>' };
const audio = new Audio();
audio.preload = "metadata";
const player = { id: null, url: null, seeking: false };
window.__player = { audio, player }; // read by the headless browser check
const MIME = { mp3: "audio/mpeg", wav: "audio/wav", aiff: "audio/aiff", flac: "audio/flac", m4a: "audio/mp4", ogg: "audio/ogg", opus: "audio/ogg" };
function loadPlayer(id) {
  if (player.id === id) return;
  audio.pause();
  if (player.url) URL.revokeObjectURL(player.url);
  player.id = id; player.url = null;
  $("pErr").classList.add("hidden");
  const f = byId(id);
  if (f) { player.url = URL.createObjectURL(new Blob([f.bytes], { type: MIME[f.model.format] || "application/octet-stream" })); audio.src = player.url; }
  else audio.removeAttribute("src");
  renderPlayer();
}
function stopPlayer() { audio.pause(); if (player.url) URL.revokeObjectURL(player.url); player.id = null; player.url = null; audio.removeAttribute("src"); renderPlayer(); }
async function playToggle(id = player.id ?? state.focus) {
  if (id == null) return;
  if (id !== player.id) loadPlayer(id);
  if (audio.paused) { try { await audio.play(); } catch (e) { if (e.name !== "AbortError") showPlayErr(); } } else audio.pause();
}
function showPlayErr() {
  const f = byId(player.id);
  $("pErr").textContent = `This browser can't play ${f ? FORMAT_NAME[f.model.format] || "this" : "this"} file${f?.model.format === "aiff" ? " (most browsers don't play AIFF)" : ""}. Tagging and saving still work.`;
  $("pErr").classList.remove("hidden");
}
const dur = () => (Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : byId(player.id)?.model.info?.duration || 0);
function renderPlayer() {
  $("playerCard").classList.toggle("hidden", !state.files.length);
  const f = byId(player.id), on = !!f && !audio.paused;
  $("pPlay").innerHTML = on ? ICON.pause : ICON.play;
  $("pPlay").classList.toggle("on", on);
  $("pPlay").setAttribute("aria-label", on ? "Pause" : "Play");
  $("pName").textContent = f ? (f.model.fields.title || f.name) : "Choose a track to listen";
  $("pName").title = f ? f.name : "";
  renderTime();
  for (const b of $("fileList").querySelectorAll("[data-play]")) {
    const me = +b.dataset.play === player.id && on;
    b.classList.toggle("on", me); b.innerHTML = me ? ICON.pause : ICON.play;
    b.title = (me ? "Pause" : "Play") + " (Alt+P plays the open track)";
  }
}
function renderTime() {
  const d = dur();
  $("pCur").textContent = fmtTime(audio.currentTime || 0);
  $("pDur").textContent = fmtTime(d);
  if (!player.seeking) $("pSeek").value = d ? Math.round((audio.currentTime / d) * 1000) : 0;
}
for (const ev of ["play", "pause", "ended", "loadedmetadata", "emptied"]) audio.addEventListener(ev, renderPlayer);
audio.addEventListener("timeupdate", renderTime);
audio.addEventListener("error", () => { if (audio.getAttribute("src")) showPlayErr(); });
$("pPlay").onclick = () => playToggle();
$("pSeek").oninput = () => { player.seeking = true; const d = dur(); $("pCur").textContent = fmtTime((+$("pSeek").value / 1000) * d); };
$("pSeek").onchange = () => { const d = dur(); if (d) audio.currentTime = (+$("pSeek").value / 1000) * d; player.seeking = false; };
const jump = (t) => { if (player.id == null && state.focus != null) loadPlayer(state.focus); const d = dur(); audio.currentTime = Math.max(0, Math.min(d ? d - 0.25 : 0, t)); renderTime(); };
$("pBack").onclick = () => jump(audio.currentTime - 10);
$("pFwd").onclick = () => jump(audio.currentTime + 30);
$("pMid").onclick = () => jump(dur() / 2);
document.addEventListener("keydown", (e) => { if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === "KeyP") { e.preventDefault(); playToggle(); } });
// the open track changed: stop the old one, load the new one paused
function followFocus() {
  if (state.focus == null) { if (player.id != null && !byId(player.id)) stopPlayer(); else renderPlayer(); return; }
  if (player.id !== state.focus) loadPlayer(state.focus); else renderPlayer();
}

// ---------- everything ----------
function renderAll() {
  if (state.focus && !state.sel.has(state.focus)) state.focus = targets()[0]?.id ?? null;
  renderList(); renderCurrent(); renderMain(); renderMore(); renderLyrics(); renderPictures(); renderFile(); renderSaveBar(); followFocus();
  if (state.tab === "album") renderAlbum();
  showTab(state.tab);
}
renderAll();
