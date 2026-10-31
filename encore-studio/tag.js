// Encore Tag: the page. Drop tracks, edit their tags (one track or several at
// once), save new copies. Reading, writing and the safety check all live in
// tag-core.js; this file is the editor around them. Nothing is uploaded.
import { readTags, writeTags, verifyWrite, FIELDS, FIELD, canStore, imageInfo, isrcCheck, titleCase, tidy, parseFileName, fileNameFor, toCSV, toJSON, readSheet } from "./tag-core.js";
import { PICTURE_TYPES, FORMAT_NAME, SYSTEM } from "./tag-fields.js";
import { sniffMime } from "./tag-bin.js";
import { lrcToLines } from "./tag-id3.js";
import { coverCheck, fmtTime } from "./lastcall-core.js";
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
  }
  touch();
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
    return `<li data-id="${f.id}" class="${f.id === state.focus ? "focus" : ""}"><input type="checkbox" ${state.sel.has(f.id) ? "checked" : ""} aria-label="Select ${esc(f.name)}">
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
  if (same && p) { const c = coverCheck(imageInfo(p.bytes)); check = `<div class="coverNote ${c.status === "pass" ? "pass" : c.status === "fail" ? "fail" : "warn"}">${esc(imgText(p))}. ${esc(c.status === "pass" ? "Good for every store." : firstSentence(c.detail))}</div>`; }
  if (t.length > 1) {
    const fm = [...new Set(t.map((f) => FORMAT_NAME[f.model.format] || "?"))];
    $("meta").innerHTML = `<div class="t">${t.length} tracks selected</div><div class="line">${esc(fm.join(", "))}</div><div class="line">${esc(fmtTime(t.reduce((a, f) => a + (f.model.info?.duration || 0), 0)))} in all</div>
      <div class="line muted">Edits apply to all of them. A cover added here goes on every one.</div>${check}`;
    return;
  }
  const m = t[0].model, i = m.info || {};
  const quality = [i.sampleRate ? `${Number((i.sampleRate / 1000).toFixed(2))} kHz` : "", i.bitDepth && !i.lossy ? `${i.bitDepth}-bit${i.float ? " float" : ""}` : "", i.bitrate ? `${i.bitrate} kbps${i.vbr ? " VBR" : ""}` : "", i.channels ? (i.channels === 1 ? "mono" : i.channels === 2 ? "stereo" : i.channels + " ch") : ""].filter(Boolean).join(", ");
  $("meta").innerHTML = `<div class="t">${esc(m.fields.title || t[0].name)}</div><div class="line">${esc(m.fields.artist || "")}</div>
    <div class="line">${esc(i.label || FORMAT_NAME[m.format] || "Unknown")}${i.duration ? ", " + esc(fmtTime(i.duration)) : ""}</div><div class="line muted">${esc(quality)}</div>
    <div class="line muted">${esc(kb(i.size || t[0].bytes.length))}${i.tagFormats?.length ? ", tags: " + esc(i.tagFormats.join(", ")) : ", no tags yet"}</div>
    ${m.readOnly ? `<div class="coverNote fail">${esc(m.readOnly)}</div>` : ""}${check}`;
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
const MAIN_HINTS = new Set(["albumArtist", "isrc", "explicit"]); // the main fields whose name alone isn't enough
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
    });
    if (key === "isrc") checkIsrc(el);
  }
}
function checkIsrc(el) { const v = el.value.trim(), bad = v !== "" && !isrcCheck(v).valid; el.classList.toggle("bad", bad); $("isrcBad")?.classList.toggle("hidden", !bad); }
function renderCurrentTitleOnly() { const t = targets(); if (t.length === 1) { const el = $("meta").querySelector(".t"); if (el) el.textContent = t[0].model.fields.title || t[0].name; } }

function renderMain() {
  const t = editable();
  $("batchNote").classList.toggle("hidden", t.length < 2);
  $("batchNote").textContent = t.length > 1 ? `Editing ${t.length} tracks at once. "(different)" means each keeps its own value unless you type a new one. Titles and numbers per track: Album tools.` : "";
  const F = (k, o) => fieldCell(FIELD[k], o);
  $("mainGrid").innerHTML = (targets().length && !t.length) ? `<div class="wide why">${esc(targets()[0].model.readOnly)}</div>` : [
    F("title", { cls: "wideOnPhone" }), F("artist", { cls: "wideOnPhone" }), F("album", { cls: "wideOnPhone" }), F("albumArtist", { cls: "wideOnPhone" }),
    pairCell("track", "trackTotal", "Track"), pairCell("disc", "discTotal", "Disc"), F("date"), F("genre"), F("composer"), F("isrc"), F("explicit"), F("bpm"), F("key"),
    F("comment", { cls: "wide" }),
  ].join("") + `<datalist id="genres">${genreList.map((g) => `<option value="${esc(g)}">`).join("")}</datalist>`;
  wireInputs($("mainGrid"));
}

// ---------- more fields ----------
const MORE = FIELDS.filter((f) => !f.main);
const PAIRED = { trackTotal: 1, discTotal: 1, movementTotal: 1 };
function renderMore() {
  const t = editable();
  const shown = MORE.filter((f) => !PAIRED[f.key] && (state.added.has(f.key) || t.some((x) => String(x.model.fields[f.key] ?? "") !== "" || (f.key === "movement" && x.model.fields.movementTotal))));
  $("moreGrid").innerHTML = shown.length ? shown.map((f) => f.key === "movement" ? pairCell("movement", "movementTotal", "Movement", "") : fieldCell(f, { removable: true })).join("")
    : '<div class="wide hint">No extra fields yet. Add any of the ones below: credits, label and catalog numbers, sort names, MusicBrainz IDs, ReplayGain, web links and more.</div>';
  wireInputs($("moreGrid"));
  for (const b of $("moreGrid").querySelectorAll("[data-remove]")) b.onclick = (e) => { e.preventDefault(); const k = b.dataset.remove; setField(k, ""); if (k === "movement") setField("movementTotal", ""); state.added.delete(k); renderMore(); };
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
    (m4a ? " M4A files keep pictures but not their kind or description; the first is the cover." : "") + " JPG or PNG work everywhere; stores want a square cover, 3000 x 3000.";
  $("addPic").disabled = !t.length;
  $("pics").innerHTML = !f ? "" : f.model.pictures.map((p, i) => {
    const c = p.type === 3 ? coverCheck(imageInfo(p.bytes)) : null;
    return `<div class="pic" data-i="${i}"><img src="${picUrl(p)}" alt=""><div class="stack">
      <select data-ptype aria-label="Picture kind" ${t.length > 1 ? "disabled" : ""}>${PICTURE_TYPES.map((n, k) => `<option value="${k}" ${k === p.type ? "selected" : ""}>${esc(n)}</option>`).join("")}</select>
      <input data-pdesc value="${esc(p.desc || "")}" placeholder="Description (optional)" aria-label="Description" ${t.length > 1 ? "disabled" : ""}>
      <span class="hint">${esc(imgText(p))}${c && c.status !== "pass" ? "" : ""}</span>${c && c.status !== "pass" ? `<span class="why">${esc(firstSentence(c.detail))}</span>` : ""}
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
  $("albumRows").innerHTML = list.map((f) => `<tr data-id="${f.id}"><td class="num"><input value="${esc(f.model.fields.track || "")}" data-k="track" inputmode="numeric" aria-label="Track number"></td>
    <td><input value="${esc(f.model.fields.title || "")}" data-k="title" aria-label="Title"></td><td><input value="${esc(f.model.fields.artist || "")}" data-k="artist" aria-label="Artist"></td><td class="file" title="${esc(f.name)}">${esc(f.name)}</td></tr>`).join("");
  $("albumRows").querySelectorAll("tr").forEach((tr) => {
    const f = byId(+tr.dataset.id);
    tr.querySelectorAll("input").forEach((inp) => inp.oninput = () => { if (inp.value === "") delete f.model.fields[inp.dataset.k]; else f.model.fields[inp.dataset.k] = inp.value; delete f.model.multi?.[inp.dataset.k]; touch([f]); });
  });
  namePreview();
}
function namePreview() {
  const f = albumSet()[0];
  if (!f) { $("namePreview").textContent = ""; return; }
  const r = parseFileName(f.name, $("namePatternIn").value);
  $("namePreview").textContent = r ? `${f.name} gives: ` + Object.entries(r).map(([k, v]) => `${FIELD[k]?.label || k} "${v}"`).join(", ") : `"${f.name}" doesn't match that pattern.`;
}
$("namePatternIn").value = store.get("fillPattern", $("namePatternIn").value);
$("namePatternIn").oninput = () => { store.set("fillPattern", $("namePatternIn").value); namePreview(); };
$("fillFromName").onclick = () => {
  let n = 0;
  const list = albumSet();
  for (const f of list) { const r = parseFileName(f.name, $("namePatternIn").value); if (!r) continue; Object.assign(f.model.fields, r); for (const k of Object.keys(r)) delete f.model.multi?.[k]; n++; touch([f]); }
  setStatus(n ? "ok" : "bad", n ? `Filled in ${n} of ${list.length} tracks from their file names.` : "None of the file names match that pattern.");
  renderAll();
};
$("numberTracks").onclick = () => {
  const list = albumSet();
  list.forEach((f, i) => { f.model.fields.track = String(i + 1); f.model.fields.trackTotal = String(list.length); });
  touch(list); setStatus("ok", `Numbered ${list.length} tracks 1 to ${list.length}, in list order.`); renderAll();
};
$("titleCaseBtn").onclick = () => { const list = albumSet(); for (const f of list) if (f.model.fields.title) f.model.fields.title = titleCase(f.model.fields.title); touch(list); renderAll(); };
$("trimBtn").onclick = () => {
  const list = albumSet();
  for (const f of list) {
    for (const [k, v] of Object.entries(f.model.fields)) { const t = FIELD[k]?.type === "long" ? String(v).replace(/[ \t]+$/gm, "").trim() : tidy(v); if (t !== v) { f.model.fields[k] = t; delete f.model.multi?.[k]; } }
    for (const c of f.model.custom) { c.value = tidy(c.value); c.name = c.name.trim(); }
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
    for (const [k, v] of Object.entries(r.fields)) { if (!FIELD[k]) continue; if (String(v) === "") delete f.model.fields[k]; else f.model.fields[k] = String(v); delete f.model.multi?.[k]; }
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
$("id3Ver").onchange = () => store.set("id3", $("id3Ver").value);
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
  state.files = []; state.sel = new Set(); state.focus = null; state.added.clear(); setStatus("", ""); renderAll();
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

// ---------- everything ----------
function renderAll() {
  if (state.focus && !state.sel.has(state.focus)) state.focus = targets()[0]?.id ?? null;
  renderList(); renderCurrent(); renderMain(); renderMore(); renderLyrics(); renderPictures(); renderFile(); renderSaveBar();
  if (state.tab === "album") renderAlbum();
  showTab(state.tab);
}
renderAll();
