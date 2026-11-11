// ENCORE. Credits: the page. A catalog of releases and songs with their codes, splits,
// credits, samples and registrations. The logic lives in credits-core.js; this file is
// the editor around it. Everything stays in this browser (localStorage); nothing is sent.
import {
  esc, checkIsrc, checkIswc, checkUpc, checkIpi, parseDuration, formatDuration, CODE_HELP, PROS, PRO_LINKS, WRITER_ROLES, CREDIT_ROLES, SAMPLE_STATUS, STATUS, RELEASE_TYPES, EXPLICIT,
  SONG_CHECKLIST, RELEASE_CHECKLIST, COUNTRY_NOTE, regOf, emptyReg, progressOf, splitStatus, splitEvenly, toHundredths, fmtShare,
  newRelease, newSong, newWriter, newOwner, newCredit, newSample, emptyCatalog, songTitle, releaseTitle, releaseOf, releaseSongs, moveSongToRelease, typeLabel,
  songFromTags, guessReleaseType, catalogHealth, songIssues, catalogSummary, catalogCsv, splitsCsv, songDetailsText, COPY_FORMS, splitSheetHtml,
  makeBackup, readBackup, mergeCatalog, normalizeCatalog, knownWriters, knownNames, STORAGE_PREFIX, normalizeIsrc, normalizeIswc, normalizeUpc, normalizeIpi,
} from "./credits-core.js";

const $ = (id) => document.getElementById(id);
const K = { cat: STORAGE_PREFIX + "catalog", ui: STORAGE_PREFIX + "ui", backup: STORAGE_PREFIX + "backup" };
const load = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
const phone = () => matchMedia("(max-width: 899px)").matches;
const COLORS = ["#ff3b00", "#22d3ee", "#e8b04b", "#a78bfa", "#7bd3a4", "#f472b6", "#60a5fa", "#fb923c", "#94a3b8", "#facc15"];

// ---------- state ----------
let cat = normalizeCatalog(load(K.cat, emptyCatalog()));
const ui = Object.assign({ kind: "", id: "", tab: "details", side: "todo", m: "song" }, load(K.ui, {}));
const meta = Object.assign({ last: 0, changes: 0 }, load(K.backup, {}));
let filter = "";
window.__credits = { get cat() { return cat; }, ui }; // read by the headless browser check

const song = () => (ui.kind === "song" ? cat.songs.find((s) => s.id === ui.id) : null);
const rel = () => (ui.kind === "release" ? cat.releases.find((r) => r.id === ui.id) : null);

let saveTimer = 0;
function save(changed = true) {
  if (changed) meta.changes++;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 250);
}
function saveNow() {
  clearTimeout(saveTimer);
  if (!store(K.cat, cat)) toast("Couldn't save in this browser (it may be full). Download a backup from the Backup tab.");
  store(K.backup, meta);
  saveHint();
}
const saveUi = () => store(K.ui, { kind: ui.kind, id: ui.id, tab: ui.tab, side: ui.side });
addEventListener("pagehide", saveNow);
addEventListener("beforeunload", saveNow);

function toast(msg) {
  document.querySelector(".toast")?.remove();
  const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; t.setAttribute("role", "status");
  document.body.append(t); setTimeout(() => t.remove(), 2600);
}
function download(name, text, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.append(ta); ta.select();
    let ok = false; try { ok = document.execCommand("copy"); } catch {} ta.remove(); return ok;
  }
}
const fileStamp = () => new Date().toISOString().slice(0, 10);
const ago = (t) => { if (!t) return "never"; const d = Math.floor((Date.now() - t) / 86400000); return d <= 0 ? "today" : d === 1 ? "yesterday" : d + " days ago"; };

// ---------- selecting ----------
function select(kind, id, tab) {
  ui.kind = kind; ui.id = id;
  if (tab) ui.tab = tab;
  saveUi();
  renderList(); renderMid(); renderSide();
  if (phone()) setM("song");
}
function setM(m) {
  ui.m = m; document.querySelector("main").dataset.m = m;
  for (const b of $("mtabs").children) b.classList.toggle("on", b.dataset.m === m);
}
$("mtabs").addEventListener("click", (e) => { const b = e.target.closest("button[data-m]"); if (b) setM(b.dataset.m); });

// ---------- the catalog list ----------
function matches(s) {
  if (!filter) return true;
  const hay = [s.title, s.version, s.artist, s.featured, s.isrc, s.iswc, s.genre, ...s.writers.map((w) => w.name), ...s.owners.map((o) => o.name), ...s.credits.map((c) => c.name)].join(" ").toLowerCase();
  return hay.includes(filter) || hay.replace(/[-.\s]/g, "").includes(filter.replace(/[-.\s]/g, ""));
}
function songRow(s, n) {
  const p = progressOf(s), bad = songIssues(cat, s).some((i) => i.kind === "fix");
  return `<button class="srow${ui.kind === "song" && ui.id === s.id ? " on" : ""}" data-song="${s.id}" title="${esc(songTitle(s))}">${n ? `<span class="tn">${n}</span>` : ""}<span class="nm">${esc(songTitle(s))}</span>${bad ? '<span class="dot" title="Something needs fixing"></span>' : ""}<span class="pg${p.done === p.total ? " full" : ""}" title="${p.done} of ${p.total} registrations done">${p.done}/${p.total}</span></button>`;
}
function renderList() {
  const rels = [...cat.releases].sort((a, b) => (b.date || "0").localeCompare(a.date || "0") || b.created - a.created);
  let h = "";
  for (const r of rels) {
    const songs = releaseSongs(cat, r), shown = songs.filter(matches);
    if (filter && !shown.length && !releaseTitle(r).toLowerCase().includes(filter)) continue;
    h += `<div class="grp"><button class="ghead${ui.kind === "release" && ui.id === r.id ? " on" : ""}" data-rel="${r.id}">${r.cover ? `<img class="cov" src="${esc(r.cover)}" alt="">` : `<span class="cov">&#9673;</span>`}<span class="gt"><b>${esc(releaseTitle(r))}</b><span>${esc(typeLabel(r.type))}${r.date ? " &middot; " + esc(r.date) : ""} &middot; ${songs.length} song${songs.length === 1 ? "" : "s"}</span></span></button>`;
    h += (filter ? shown : songs).map((s) => songRow(s, songs.indexOf(s) + 1)).join("") + "</div>";
  }
  const loose = cat.songs.filter((s) => !s.releaseId).sort((a, b) => a.title.localeCompare(b.title)).filter(matches);
  if (loose.length) h += `<div class="glabel">Songs not on a release</div>` + loose.map((s) => songRow(s, 0)).join("");
  if (!cat.songs.length && !cat.releases.length) h = `<div class="lempty">Your catalog is empty. Type a song title above and press Enter, or drop audio files.</div>`;
  else if (!h) h = `<div class="lempty">Nothing matches "${esc(filter)}".</div>`;
  $("list").innerHTML = h;
}
$("list").addEventListener("click", (e) => {
  const s = e.target.closest("[data-song]"), r = e.target.closest("[data-rel]");
  if (s) select("song", s.dataset.song); else if (r) select("release", r.dataset.rel);
});
$("search").addEventListener("input", (e) => { filter = e.target.value.trim().toLowerCase(); renderList(); });

function addSong(fields = {}, open = true) {
  const s = newSong(fields);
  cat.songs.push(s);
  if (s.releaseId) { const r = cat.releases.find((x) => x.id === s.releaseId); if (r) r.songIds.push(s.id); }
  save();
  if (open) select("song", s.id, "details"); else renderList();
  return s;
}
$("quickForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const t = $("quickTitle").value.trim();
  if (!t) { $("quickTitle").focus(); return; }
  // a new song goes on the release you're looking at
  const r = rel() || (song() && song().releaseId ? releaseOf(cat, song()) : null);
  addSong({ title: t, artist: r?.artist || song()?.artist || "", releaseId: r?.id || "" });
  $("quickTitle").value = "";
  if (!phone()) $("quickTitle").focus();
  toast(`Added "${t}"${r ? " to " + releaseTitle(r) : ""}`);
});
$("newRelease").addEventListener("click", () => {
  const r = newRelease({ artist: cat.songs.at(-1)?.artist || "" });
  cat.releases.push(r); save(); select("release", r.id);
  setTimeout(() => document.querySelector('[data-rf="title"]')?.focus(), 30);
});

// ---------- audio files ----------
$("dropBtn").addEventListener("click", () => $("audioIn").click());
$("audioIn").addEventListener("change", (e) => { addAudio(e.target.files); e.target.value = ""; });
const panel = $("catPanel");
panel.addEventListener("dragover", (e) => { if ([...(e.dataTransfer?.types || [])].includes("Files")) { e.preventDefault(); panel.classList.add("dragging"); } });
panel.addEventListener("dragleave", (e) => { if (!panel.contains(e.relatedTarget)) panel.classList.remove("dragging"); });
panel.addEventListener("drop", (e) => { e.preventDefault(); panel.classList.remove("dragging"); addAudio(e.dataTransfer.files); });
document.addEventListener("dragover", (e) => e.preventDefault());
document.addEventListener("drop", (e) => { if (!panel.contains(e.target)) e.preventDefault(); });

async function coverFrom(pictures) {
  const p = (pictures || []).find((x) => x.type === 3) || (pictures || [])[0];
  if (!p?.bytes?.length) return "";
  try { return await thumb(new Blob([p.bytes], { type: p.mime || "image/jpeg" })); } catch { return ""; }
}
async function thumb(blob, size = 240) {
  const bmp = await createImageBitmap(blob);
  const s = Math.min(1, size / Math.max(bmp.width, bmp.height)), c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(bmp.width * s)); c.height = Math.max(1, Math.round(bmp.height * s));
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.82);
}
async function addAudio(list) {
  const files = [...(list || [])].filter((f) => !(f.type || "").startsWith("image/"));
  if (!files.length) return;
  toast(`Reading ${files.length} file${files.length > 1 ? "s" : ""}...`);
  let readTags;
  try { ({ readTags } = await import("./tag-core.js")); } catch { toast("Couldn't load the tag reader. Check your connection and try again."); return; }
  const made = [], skipped = [];
  for (const f of files) {
    let model;
    try { model = readTags(new Uint8Array(await f.arrayBuffer()), f.name); } catch { model = null; }
    if (!model || !model.format) { skipped.push(f.name); continue; }
    const { song: s, release: r } = songFromTags(model, f.name);
    if (r) {
      let R = cat.releases.find((x) => x.title.trim().toLowerCase() === r.title.toLowerCase() && (!r.artist || !x.artist || x.artist.toLowerCase() === r.artist.toLowerCase()));
      if (!R) { R = newRelease({ title: r.title, artist: r.artist, date: r.date, label: r.label, upc: r.upc, type: guessReleaseType(r.total) }); cat.releases.push(R); }
      if (!R.cover) R.cover = await coverFrom(model.pictures);
      for (const k of ["date", "label", "upc"]) if (!R[k] && r[k]) R[k] = r[k];
      s.releaseId = R.id; s._track = r.track;
    }
    cat.songs.push(s); made.push(s);
  }
  // track numbers from the tags put each release in order
  for (const s of [...made].sort((a, b) => (a._track || 999) - (b._track || 999))) { if (s.releaseId) cat.releases.find((x) => x.id === s.releaseId).songIds.push(s.id); delete s._track; }
  save();
  if (made.length) select("song", made[0].id, "details"); else renderList();
  toast(made.length ? `Added ${made.length} song${made.length > 1 ? "s" : ""} from ${made.length > 1 ? "their" : "its"} tags${skipped.length ? `. Couldn't read ${skipped.length}.` : ""}` : "Those files couldn't be read as audio (MP3, WAV, FLAC, M4A, AIFF, Ogg or Opus).");
}

// ---------- the middle: a song ----------
const TABS = [["details", "Details"], ["writing", "Songwriting"], ["master", "Master"], ["credits", "Credits"], ["samples", "Samples"], ["regs", "Registrations"]];
const opt = (list, v) => list.map((o) => `<option value="${esc(o.id)}"${o.id === (v || "") ? " selected" : ""}>${esc(o.label)}</option>`).join("");
const val = (v) => `value="${esc(v)}"`;
function codeBox(key, f, value, extra = "") {
  const h = CODE_HELP[key];
  return `<div class="code" data-code="${f}"><label class="lab" for="f-${f}">${h.name} <span>(${esc(h.long)})</span></label>
    <input class="t mono" id="f-${f}" data-f="${f}" data-check="${key}" ${val(value)} placeholder="${key === "isrc" ? "US-ABC-26-00001" : key === "iswc" ? "T-123.456.789-0" : "12 or 13 digits"}" spellcheck="false" autocomplete="off" ${extra}>
    <span class="msg" data-msg="${f}"></span>
    <span class="ex">${esc(h.text)} ${esc(h.who)}${h.link ? ` <a href="${h.link}" target="_blank" rel="noopener">${esc(h.link.replace(/^https?:\/\/(www\.)?/, ""))}</a>` : ""}</span></div>`;
}
function renderMid() {
  const s = song(), r = rel();
  const el = $("songPanel");
  if (s) el.innerHTML = songView(s);
  else if (r) el.innerHTML = releaseView(r);
  else { el.innerHTML = welcome(); return; }
  validateAll();
  if (s) refreshSplit();
}
function welcome() {
  const any = cat.songs.length || cat.releases.length;
  return `<div class="scroll"><div class="welcome">
    <h2>${any ? "Pick a song" : "Every song's paperwork, in one place"}</h2>
    <p>${any ? "Choose a song or release on the left, or look at what's missing on the right." : "Independent artists lose royalties when codes, credits and splits are scattered or missing. Credits keeps them together and tells you, in plain words, what each one is for and where to register it."}</p>
    <ol class="steps">
      <li><b>Add your songs.</b> Type a title on the left and press Enter, or drop your audio files to fill in the details from their tags.</li>
      <li><b>Fill in who wrote it and who owns the recording.</b> The splits have to add up to 100%. Print a split sheet for everyone to sign.</li>
      <li><b>Work through the registrations.</b> Your PRO, The MLC, SoundExchange and the rest. The To do list shows what's missing across your whole catalog.</li>
    </ol>
    <p class="small dim">Everything stays in this browser. Nothing is uploaded. Download a backup now and then from the Backup tab.</p>
    ${any ? "" : `<button class="btn go" id="demoBtn">Try it with an example song</button>`}
  </div></div>`;
}
function songView(s) {
  const p = progressOf(s), iss = songIssues(cat, s);
  const badTab = (t) => iss.some((i) => i.kind === "fix" && i.items[0].tab === t);
  const relOpts = `<option value="">Not on a release</option>` + cat.releases.map((r) => `<option value="${r.id}"${r.id === s.releaseId ? " selected" : ""}>${esc(releaseTitle(r))} (${esc(typeLabel(r.type))})</option>`).join("");
  return `<div class="songHead">
    <div class="titleRow">
      <input class="titleIn" data-f="title" ${val(s.title)} placeholder="Song title" aria-label="Song title" autocomplete="off">
      <input class="verIn" data-f="version" ${val(s.version)} placeholder="Version (optional)" aria-label="Version, like Radio Edit or Live" title="Like Radio Edit, Live or Acoustic. Each version is its own recording with its own ISRC." autocomplete="off">
      <span class="pill${p.done === p.total ? " full" : ""}" id="pill" title="Registrations done for this song">${p.done} of ${p.total} done</span>
    </div>
    <div class="actRow">
      <label for="relPick">On</label><select class="t" id="relPick" aria-label="Release this song is on">${relOpts}</select>
      <span class="sp"></span>
      <button class="btn sm" id="sheetBtn" title="A printable split sheet for everyone to sign">Split sheet</button>
      <button class="btn sm" id="copyBtn" title="Song details as text, ready to paste into registration forms">Copy details</button>
      <button class="ib" id="delSong" title="Delete this song" aria-label="Delete this song">&#128465;</button>
    </div>
    <div class="stabs" id="stabs" role="tablist">${TABS.map(([id, label]) => `<button data-tab="${id}" class="${ui.tab === id ? "on" : ""}" role="tab">${label}${badTab(id) ? '<span class="bd" title="Something here needs fixing"></span>' : ""}</button>`).join("")}</div>
  </div>
  <div class="scroll body" id="tabBody">${tabBody(s)}</div>`;
}
function tabBody(s) {
  switch (ui.tab) {
    case "writing": return writingTab(s);
    case "master": return masterTab(s);
    case "credits": return creditsTab(s);
    case "samples": return samplesTab(s);
    case "regs": return regsTab(s, SONG_CHECKLIST, "song");
    default: return detailsTab(s);
  }
}
function detailsTab(s) {
  const r = releaseOf(cat, s);
  return `<p class="intro">The basics distributors and registration forms ask for. Codes are checked as you type.</p>
  <div class="fgrid">
    <label class="fl w3">Main artist(s)<input class="t" data-f="artist" ${val(s.artist)} placeholder="${esc(r?.artist || "Artist name")}" autocomplete="off" list="dlNames"></label>
    <label class="fl w3">Featured artist(s)<input class="t" data-f="featured" ${val(s.featured)} placeholder="Leave empty if none" autocomplete="off" list="dlNames"></label>
    ${codeBox("isrc", "isrc", s.isrc)}
    ${codeBox("iswc", "iswc", s.iswc)}
    <label class="fl w1 half">Duration<input class="t mono" data-f="duration" data-check="duration" ${val(s.duration)} placeholder="3:25" autocomplete="off"><span class="msg" data-msg="duration"></span></label>
    <label class="fl w1 half">Explicit<select class="t" data-f="explicit">${opt(EXPLICIT, s.explicit)}</select></label>
    <label class="fl">Genre<input class="t" data-f="genre" ${val(s.genre)} placeholder="Like Indie Rock" autocomplete="off"></label>
    <label class="fl">Language of the lyrics<input class="t" data-f="language" ${val(s.language)} placeholder="Like English" autocomplete="off"></label>
    <div class="fl w3">Lyrics<div class="seg full" data-seg="lyrics"><button data-v="yes" class="${s.lyrics === "yes" ? "on" : ""}">Has lyrics</button><button data-v="no" class="${s.lyrics === "no" ? "on" : ""}">Instrumental</button></div></div>
    <label class="fl w3">Recording date<input class="t" type="date" data-f="recorded" ${val(s.recorded)}></label>
    <label class="fl w6">Notes<textarea class="t" data-f="notes" rows="3" placeholder="Anything worth remembering: where it was recorded, who to ask about what...">${esc(s.notes)}</textarea></label>
  </div>`;
}
function splitBox(rows, what) {
  return `<div class="splitbox" id="splitBox" data-what="${what}"></div>`;
}
function refreshSplit() {
  const box = $("splitBox"), s = song();
  if (!box || !s) return;
  const rows = box.dataset.what === "writers" ? s.writers : s.owners;
  const st = splitStatus(rows, box.dataset.what === "writers" ? "songwriting split" : "master split");
  const totalH = rows.reduce((a, r) => a + Math.max(0, toHundredths(r.share) ?? 0), 0);
  const scale = Math.max(10000, totalH);
  const segs = rows.map((r, i) => { const h = Math.max(0, toHundredths(r.share) ?? 0); return h ? `<i style="width:${(h / scale) * 100}%;background:${COLORS[i % COLORS.length]}" title="${esc(r.name || "No name")}: ${esc(fmtShare(r.share))}"></i>` : ""; }).join("");
  const over = totalH > 10000 ? `<i class="over" style="width:${((totalH - 10000) / scale) * 100}%" title="Over 100%"></i>` : "";
  box.innerHTML = `<div class="stotal ${st.state === "ok" && st.ok ? "ok" : rows.length ? "bad" : ""}"><span>Total <b>${esc(fmtShare(st.total) || "0%")}</b></span><span class="smsg">${esc(st.message)}</span></div>
    <div class="sbar" role="img" aria-label="${esc(st.message)}">${segs}${over}</div>
    ${rows.length ? `<div class="slegend">${rows.map((r, i) => `<span style="--c:${COLORS[i % COLORS.length]}">${esc(r.name || "No name")} ${esc(fmtShare(r.share) || "0%")}</span>`).join("")}</div>` : ""}`;
  document.querySelectorAll("#tabBody .card[data-i]").forEach((c, i) => c.style.setProperty("--c", COLORS[i % COLORS.length]));
}
function writingTab(s) {
  const cards = s.writers.map((w) => `<div class="card" data-row="writers" data-i="${w.id}">
    <label class="fl c5">Writer's name<input class="t" data-r="name" ${val(w.name)} placeholder="Full legal name" list="dlNames" autocomplete="off"></label>
    <label class="fl c4">Wrote<select class="t" data-r="role">${opt(WRITER_ROLES, w.role)}</select></label>
    <label class="fl">Share<span class="shareIn"><input class="t" data-r="share" ${val(w.share)} inputmode="decimal" placeholder="0" aria-label="Share in percent"></span></label>
    <label class="fl">PRO<select class="t" data-r="pro">${opt(PROS, w.pro)}</select></label>
    <label class="fl">IPI number<input class="t mono" data-r="ipi" data-check="ipi" ${val(w.ipi)} placeholder="9 to 11 digits" inputmode="numeric" autocomplete="off"><span class="msg"></span></label>
    <label class="fl">Publisher<input class="t" data-r="publisher" ${val(w.publisher)} placeholder="Self-published / none" autocomplete="off"></label>
    <label class="fl">Publisher's IPI<input class="t mono" data-r="publisherIpi" data-check="ipi" ${val(w.publisherIpi)} placeholder="If there is one" inputmode="numeric" autocomplete="off"><span class="msg"></span></label>
    <button class="ib del" data-del="writers" aria-label="Remove this writer" title="Remove this writer">&#10005;</button></div>`).join("");
  return `<p class="intro"><b>Who wrote the song (the words and music), and each writer's share.</b> Your PRO (performing rights organization, like ASCAP or BMI) and The MLC (Mechanical Licensing Collective) pay songwriters by these shares. Agree on them early, while everyone remembers who wrote what.</p>
  ${splitBox(s.writers, "writers")}
  ${cards || `<div class="none">No songwriters yet. Add everyone who wrote words or music, yourself included.</div>`}
  <div class="rowbtns"><button class="btn sm go" data-add="writers">+ Writer</button><button class="btn sm" data-even="writers"${s.writers.length < 2 ? " disabled" : ""}>Split evenly</button></div>
  <p class="note">A writer's IPI (Interested Party Information) number is on their PRO account. No publisher? Choose nothing: as a self-published writer you collect the publisher's share yourself once you're set up for it (some PROs ask you to register a publishing name for that).</p>`;
}
function masterTab(s) {
  const cards = s.owners.map((o) => `<div class="card" data-row="owners" data-i="${o.id}">
    <label class="fl c5">Owner<input class="t" data-r="name" ${val(o.name)} placeholder="Person or company" list="dlNames" autocomplete="off"></label>
    <label class="fl c2">Share<span class="shareIn"><input class="t" data-r="share" ${val(o.share)} inputmode="decimal" placeholder="0" aria-label="Share in percent"></span></label>
    <label class="fl c5">Notes<input class="t" data-r="notes" ${val(o.notes)} placeholder="Like: artist, label, producer points" autocomplete="off"></label>
    <button class="ib del" data-del="owners" aria-label="Remove this owner" title="Remove this owner">&#10005;</button></div>`).join("");
  return `<p class="intro"><b>Who owns the recording (the master), separate from who wrote the song.</b> If you paid for and made the recording yourself, it's usually all yours. Streaming money for the recording and SoundExchange's owner share go by this split.</p>
  ${splitBox(s.owners, "owners")}
  ${cards || `<div class="none">No owners yet. Independent and made it yourself? Add yourself at 100%.</div>`}
  <div class="rowbtns"><button class="btn sm go" data-add="owners">+ Owner</button><button class="btn sm" data-even="owners"${s.owners.length < 2 ? " disabled" : ""}>Split evenly</button>${!s.owners.length && (s.artist || releaseOf(cat, s)?.artist) ? `<button class="btn sm" id="ownAll">${esc(s.artist || releaseOf(cat, s).artist)} owns 100%</button>` : ""}</div>`;
}
function creditsTab(s) {
  const cards = s.credits.map((c) => `<div class="card" data-row="credits" data-i="${c.id}">
    <label class="fl c4">Role<input class="t" data-r="role" ${val(c.role)} placeholder="Producer, Bass..." list="dlRoles" autocomplete="off"></label>
    <label class="fl c4">Name<input class="t" data-r="name" ${val(c.name)} list="dlNames" autocomplete="off"></label>
    <label class="fl c4">Instrument or detail<input class="t" data-r="detail" ${val(c.detail)} placeholder="Like: bass, synths, harmony vocals" autocomplete="off"></label>
    <button class="ib del" data-del="credits" aria-label="Remove this credit" title="Remove this credit">&#10005;</button></div>`).join("");
  return `<p class="intro"><b>Everyone who worked on the recording.</b> Streaming services show these credits, and they help people find each other's work. Any role is fine.</p>
  <div class="quickroles">Add: ${["Producer", "Co-producer", "Recording engineer", "Mixing engineer", "Mastering engineer", "Musician", "Lead vocals", "Background vocals"].map((r) => `<button class="btn sm" data-addrole="${r}">${r}</button>`).join("")}</div>
  ${cards || `<div class="none">No credits yet. Tap a role above to add one.</div>`}
  <div class="rowbtns"><button class="btn sm go" data-add="credits">+ Credit</button></div>`;
}
function samplesTab(s) {
  const cards = s.samples.map((p) => `<div class="card" data-row="samples" data-i="${p.id}">
    <label class="fl c6">What was used<input class="t" data-r="what" ${val(p.what)} placeholder="Song, artist and which part" autocomplete="off"></label>
    <label class="fl c6">Rights holder (who to ask)<input class="t" data-r="owner" ${val(p.owner)} placeholder="Label, publisher or person" autocomplete="off"></label>
    <div class="fl c6">Kind<div class="seg full" data-rseg="kind"><button data-v="sample" class="${p.kind !== "interpolation" ? "on" : ""}">Sample (their recording)</button><button data-v="interpolation" class="${p.kind === "interpolation" ? "on" : ""}">Interpolation (re-played)</button></div></div>
    <label class="fl c2">Status<select class="t" data-r="status">${opt(SAMPLE_STATUS, p.status)}</select></label>
    <label class="fl c4">Notes<input class="t" data-r="notes" ${val(p.notes)} placeholder="Who you talked to, terms..." autocomplete="off"></label>
    <button class="ib del" data-del="samples" aria-label="Remove this sample" title="Remove this sample">&#10005;</button></div>`).join("");
  return `<p class="intro"><b>Anything from someone else's music, so it gets cleared before release.</b> A sample uses a piece of their actual recording, which usually needs permission from whoever owns that recording and whoever owns the song. An interpolation re-plays or re-sings part of their song, which usually needs the song owner's permission. Uncleared samples can get a release taken down.</p>
  ${cards || `<div class="none">No samples or interpolations. If the song uses none, there's nothing to do here.</div>`}
  <div class="rowbtns"><button class="btn sm go" data-add="samples">+ Sample or interpolation</button></div>
  <p class="note">General information, not legal advice.</p>`;
}
function regsTab(item, list, kind) {
  const p = progressOf(item, list);
  return `<p class="intro"><b>Where to register ${kind === "song" ? "this song" : "this release"}, and why each one pays you.</b> <span id="regCount">${p.done} of ${p.total} done.</span> Mark anything that doesn't apply as not needed.</p>
  ${list.map((c) => regCard(item, c, kind)).join("")}
  <p class="note">${esc(COUNTRY_NOTE)}</p>`;
}
function regCard(item, c, kind) {
  const r = regOf(item, c.id);
  const links = c.links.map(([t, u]) => `<a href="${u}" target="_blank" rel="noopener">${esc(t)}</a>`).join("");
  const proLinks = c.id === "pro" && kind === "song" ? [...new Set(item.writers.map((w) => w.pro).filter((x) => PRO_LINKS[x] && !["ASCAP", "BMI", "SESAC"].includes(x)))].map((x) => `<a href="${PRO_LINKS[x]}" target="_blank" rel="noopener">${x}</a>`).join("") : "";
  return `<div class="reg st-${r.status}" id="reg-${c.id}" data-reg="${c.id}" data-kind="${kind}">
    <div class="rtop"><h3>${esc(c.name)}<span>${esc(c.short)}</span></h3>
      <div class="seg" data-status="${c.id}" aria-label="Status">${STATUS.map((st) => `<button data-v="${st.id}" class="s-${st.id}${r.status === st.id ? " on" : ""}">${st.label}</button>`).join("")}</div></div>
    <div class="rtext">${esc(c.what)} <span class="why">${esc(c.why)}</span>${links || proLinks ? ` <span class="rlinks">${links}${proLinks}</span>` : ""}</div>
    <div class="rfields">
      <input class="t" type="date" data-rg="date" ${val(r.date)} aria-label="Date for ${esc(c.name)}" title="When you did it">
      <input class="t mono" data-rg="ref" ${val(r.ref)} placeholder="Reference number" aria-label="Reference number for ${esc(c.name)}" autocomplete="off">
      <input class="t rn" data-rg="notes" ${val(r.notes)} placeholder="Notes" aria-label="Notes for ${esc(c.name)}" autocomplete="off">
      ${c.copy && kind === "song" ? `<button class="btn sm" data-copyform="${c.copy}" title="Copy this song's details, ready to paste into the form">Copy details</button>` : "<span></span>"}
    </div></div>`;
}

// ---------- the middle: a release ----------
function releaseView(r) {
  const songs = releaseSongs(cat, r), loose = cat.songs.filter((s) => !s.releaseId);
  const p = progressOf(r, RELEASE_CHECKLIST);
  return `<div class="songHead"><div class="titleRow">
      <input class="titleIn" data-rf="title" ${val(r.title)} placeholder="Release title" aria-label="Release title" autocomplete="off">
      <span class="pill${p.done === p.total ? " full" : ""}">${p.done} of ${p.total} done</span>
      <button class="ib" id="delRel" title="Delete this release (its songs are kept)" aria-label="Delete this release">&#128465;</button></div>
    <div class="actRow"><div class="seg" data-relseg="type">${RELEASE_TYPES.map((t) => `<button data-v="${t.id}" class="${r.type === t.id ? "on" : ""}">${t.label}</button>`).join("")}</div><span class="sp"></span><span class="small dim">${songs.length} song${songs.length === 1 ? "" : "s"}</span></div>
    <div style="height:8px"></div></div>
  <div class="scroll body" id="tabBody" style="border-top:1px solid var(--divider)">
    <div class="relTop">
      <button class="coverBtn" id="coverBtn" title="Cover art (a small copy is kept, for your list)">${r.cover ? `<img src="${esc(r.cover)}" alt="Cover art">` : "Add cover<br>art"}</button>
      <div class="fgrid" style="flex:1 1 auto">
        <label class="fl w3">Artist<input class="t" data-rf="artist" ${val(r.artist)} list="dlNames" autocomplete="off"></label>
        <label class="fl w3">Release date<input class="t" type="date" data-rf="date" ${val(r.date)}></label>
        <label class="fl w3">Label<input class="t" data-rf="label" ${val(r.label)} placeholder="Your own name is fine" autocomplete="off"></label>
        ${codeBox("upc", "upc", r.upc, 'data-relcode="1"').replace('data-f="upc"', 'data-rf="upc"')}
      </div>
    </div>
    <div class="lbl">Track list <span class="dim">click a song to open it</span></div>
    <div class="tracks">${songs.map((s, i) => `<div class="trk"><span class="n">${i + 1}</span><button class="nm" data-song="${s.id}">${esc(songTitle(s))}</button>
      <button class="ib" data-mv="-1" data-sid="${s.id}" aria-label="Move up" title="Move up"${i ? "" : " disabled"}>&#9650;</button><button class="ib" data-mv="1" data-sid="${s.id}" aria-label="Move down" title="Move down"${i < songs.length - 1 ? "" : " disabled"}>&#9660;</button>
      <button class="ib" data-off="${s.id}" aria-label="Take off this release" title="Take off this release (the song is kept)">&#10005;</button></div>`).join("") || `<div class="trk dim">No songs yet.</div>`}</div>
    <div class="rowbtns"><form id="relAdd" class="quick" style="padding:0;flex:1 1 220px"><input class="t" id="relAddTitle" placeholder="Add a new song to this release" aria-label="New song on this release" autocomplete="off"><button class="btn sm go">+ Song</button></form>
      ${loose.length ? `<select class="t" id="relLoose" style="width:auto;flex:0 1 230px" aria-label="Put a song you already have on this release"><option value="">Put an existing song here...</option>${loose.map((s) => `<option value="${s.id}">${esc(songTitle(s))}</option>`).join("")}</select>` : ""}</div>
    <label class="fl w6" style="margin-top:8px">Notes<textarea class="t" data-rf="notes" rows="2">${esc(r.notes)}</textarea></label>
    <div class="lbl">Release checklist</div>
    ${RELEASE_CHECKLIST.map((c) => regCard(r, c, "release")).join("")}
    <p class="note">Each song on the release has its own checklist too (open a song, then Registrations). ${esc(COUNTRY_NOTE)}</p>
  </div>`;
}

// ---------- validation ----------
function validateInput(el) {
  const kind = el.dataset.check, v = el.value.trim();
  if (!kind) return;
  const msg = el.closest(".code, .fl")?.querySelector(".msg");
  let r;
  if (kind === "isrc") r = checkIsrc(v); else if (kind === "iswc") r = checkIswc(v); else if (kind === "upc") r = checkUpc(v); else if (kind === "ipi") r = checkIpi(v);
  else if (kind === "duration") { const d = parseDuration(v); r = d === null ? { empty: true } : Number.isNaN(d) ? { valid: false, message: "Like 3:25 (minutes:seconds)." } : { valid: true, value: formatDuration(d) }; }
  const typing = document.activeElement === el && el.dataset.touched !== "1";
  const bad = !r.empty && !r.valid && !(typing && v.length < 6);
  el.classList.toggle("bad", bad); el.classList.toggle("good", !!r.valid && kind !== "duration");
  if (msg) { msg.textContent = bad ? r.message : r.valid && kind !== "duration" && kind !== "ipi" ? `Looks right${r.kind ? ` (${r.kind})` : ""}: ${r.value}` : ""; msg.classList.toggle("ok", !bad && !!r.valid); }
}
const validateAll = () => document.querySelectorAll("#songPanel [data-check]").forEach((el) => { el.dataset.touched = "1"; validateInput(el); });

// ---------- editing (one listener for everything in the middle) ----------
const mid = $("songPanel");
function rowOf(el) {
  const card = el.closest("[data-row]"), s = song();
  if (!card || !s) return null;
  return { list: s[card.dataset.row], item: s[card.dataset.row].find((x) => x.id === card.dataset.i), card, kind: card.dataset.row };
}
function lightRefresh() {
  renderList(); refreshSplit(); refreshPill();
  if (ui.side === "todo") renderSide();
  saveHint();
}
function refreshPill() {
  const s = song(); if (!s) return;
  const p = progressOf(s), el = $("pill");
  if (el) { el.textContent = `${p.done} of ${p.total} done`; el.classList.toggle("full", p.done === p.total); }
  if ($("regCount")) $("regCount").textContent = `${p.done} of ${p.total} done.`;
  const iss = songIssues(cat, s);
  document.querySelectorAll("#stabs button").forEach((b) => {
    const bad = iss.some((i) => i.kind === "fix" && i.items[0].tab === b.dataset.tab);
    const bd = b.querySelector(".bd");
    if (bad && !bd) b.insertAdjacentHTML("beforeend", '<span class="bd" title="Something here needs fixing"></span>'); else if (!bad && bd) bd.remove();
  });
}
mid.addEventListener("input", (e) => {
  const el = e.target, s = song(), r = rel();
  if (el.dataset.f && s) { s[el.dataset.f] = el.value; }
  else if (el.dataset.rf && r) { r[el.dataset.rf] = el.value; }
  else if (el.dataset.r) { const row = rowOf(el); if (row?.item) row.item[el.dataset.r] = el.value; }
  else if (el.dataset.rg) { const item = s || r, id = el.closest("[data-reg]").dataset.reg; item.regs[id] = { ...regOf(item, id), [el.dataset.rg]: el.value }; }
  else return;
  if (el.dataset.check) validateInput(el);
  save(); lightRefresh();
});
mid.addEventListener("change", (e) => {
  const el = e.target, s = song(), r = rel();
  if (el.id === "relPick" && s) { moveSongToRelease(cat, s.id, el.value); save(); renderList(); renderSide(); return; }
  if (el.id === "relLoose" && r && el.value) { moveSongToRelease(cat, el.value, r.id); save(); renderMid(); renderList(); renderSide(); return; }
  // tidy codes into their standard form when you leave the box
  const norm = { isrc: normalizeIsrc, iswc: normalizeIswc, upc: normalizeUpc, ipi: normalizeIpi, duration: (v) => { const d = parseDuration(v); return d && !Number.isNaN(d) ? formatDuration(d) : v.trim(); } }[el.dataset.check];
  if (norm) {
    const v = norm(el.value);
    if (v !== el.value) { el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); }
    el.dataset.touched = "1"; validateInput(el);
  }
  // a writer's name you've used before brings back their PRO, IPI and publisher
  if (el.dataset.r === "name") {
    const row = rowOf(el);
    if (row?.kind === "writers") {
      const k = knownWriters({ songs: cat.songs.filter((x) => x.id !== song().id), releases: [] }).find((w) => w.name.toLowerCase() === el.value.trim().toLowerCase());
      if (k && !row.item.pro && !row.item.ipi && !row.item.publisher) { Object.assign(row.item, { pro: k.pro, ipi: k.ipi, publisher: k.publisher, publisherIpi: k.publisherIpi }); save(); rerenderTab(); toast(`Filled in ${k.name}'s PRO and IPI from another song`); }
    }
    refreshNames();
  }
  if (el.dataset.r === "role" || el.dataset.r === "pro" || el.dataset.r === "status" || el.dataset.f === "explicit") { save(); lightRefresh(); }
});
mid.addEventListener("focusout", (e) => { if (e.target.dataset?.check) { e.target.dataset.touched = "1"; validateInput(e.target); } });
mid.addEventListener("submit", (e) => {
  if (e.target.id !== "relAdd") return;
  e.preventDefault();
  const r = rel(), t = $("relAddTitle").value.trim();
  if (!r || !t) return;
  addSong({ title: t, artist: r.artist, releaseId: r.id }, false);
  renderMid(); renderSide(); $("relAddTitle").focus();
  toast(`Added "${t}" to ${releaseTitle(r)}`);
});
function rerenderTab() {
  const s = song(); if (!s) return;
  const y = $("tabBody").scrollTop;
  $("tabBody").innerHTML = tabBody(s); $("tabBody").scrollTop = y;
  validateAll(); refreshSplit(); refreshPill();
}
mid.addEventListener("click", async (e) => {
  const t = e.target.closest("button, a"); if (!t || t.tagName === "A") return;
  const s = song(), r = rel();
  if (t.id === "demoBtn") return addExample();
  if (t.dataset.tab) { ui.tab = t.dataset.tab; saveUi(); document.querySelectorAll("#stabs button").forEach((b) => b.classList.toggle("on", b === t)); t.scrollIntoView({ block: "nearest", inline: "nearest" }); rerenderTab(); $("tabBody").scrollTop = 0; renderSide(); return; }
  if (t.dataset.song) return select("song", t.dataset.song);
  if (t.closest("[data-seg]") && s) { const k = t.closest("[data-seg]").dataset.seg; s[k] = s[k] === t.dataset.v ? "" : t.dataset.v; t.parentElement.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.v === s[k])); save(); lightRefresh(); return; }
  if (t.closest("[data-rseg]")) { const row = rowOf(t); row.item[t.closest("[data-rseg]").dataset.rseg] = t.dataset.v; t.parentElement.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b === t)); save(); return; }
  if (t.closest("[data-relseg]") && r) { r.type = t.dataset.v; t.parentElement.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b === t)); save(); renderList(); return; }
  if (t.closest("[data-status]")) {
    const item = s || r, id = t.closest("[data-status]").dataset.status, card = t.closest(".reg");
    const cur = regOf(item, id), status = t.dataset.v;
    item.regs[id] = { ...cur, status, date: status === "done" && !cur.date ? new Date().toISOString().slice(0, 10) : cur.date };
    card.className = `reg st-${status}`;
    t.parentElement.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b === t));
    if (item.regs[id].date !== cur.date) card.querySelector('[data-rg="date"]').value = item.regs[id].date;
    save(); lightRefresh();
    if (r) renderMid();
    return;
  }
  if (t.dataset.add && s) {
    const make = { writers: newWriter, owners: newOwner, credits: newCredit, samples: newSample }[t.dataset.add];
    const extra = t.dataset.add === "writers" && !s.writers.length ? { share: 100 } : t.dataset.add === "owners" && !s.owners.length ? { share: 100 } : {};
    s[t.dataset.add].push(make(extra)); save(); rerenderTab(); lightRefresh();
    const cards = document.querySelectorAll(`#tabBody [data-row="${t.dataset.add}"]`);
    cards[cards.length - 1]?.querySelector("input")?.focus();
    return;
  }
  if (t.dataset.addrole && s) { s.credits.push(newCredit({ role: t.dataset.addrole })); save(); rerenderTab(); const cards = document.querySelectorAll('#tabBody [data-row="credits"]'); cards[cards.length - 1]?.querySelector('[data-r="name"]')?.focus(); return; }
  if (t.dataset.even && s) { s[t.dataset.even] = splitEvenly(s[t.dataset.even]); save(); rerenderTab(); lightRefresh(); toast("Split evenly"); return; }
  if (t.dataset.del && s) { const row = rowOf(t); s[row.kind] = row.list.filter((x) => x !== row.item); save(); rerenderTab(); lightRefresh(); return; }
  if (t.id === "ownAll" && s) { s.owners.push(newOwner({ name: s.artist || releaseOf(cat, s)?.artist || "", share: 100 })); save(); rerenderTab(); lightRefresh(); return; }
  if (t.dataset.copyform && s) return copyDialog(s, t.dataset.copyform);
  if (t.id === "copyBtn" && s) return copyDialog(s, "all");
  if (t.id === "sheetBtn" && s) return openSheet(s);
  if (t.id === "delSong" && s) {
    if (!confirm(`Delete "${songTitle(s)}" and everything you entered for it? This can't be undone (unless you have a backup).`)) return;
    moveSongToRelease(cat, s.id, ""); cat.songs = cat.songs.filter((x) => x !== s); ui.kind = ""; ui.id = ""; save(); saveUi(); renderAll(); toast("Song deleted"); return;
  }
  if (t.id === "delRel" && r) {
    if (!confirm(`Delete the release "${releaseTitle(r)}"? Its songs are kept, as songs not on a release.`)) return;
    for (const x of cat.songs) if (x.releaseId === r.id) x.releaseId = "";
    cat.releases = cat.releases.filter((x) => x !== r); ui.kind = ""; ui.id = ""; save(); saveUi(); renderAll(); toast("Release deleted"); return;
  }
  if (t.id === "coverBtn" && r) return $("coverIn").click();
  if (t.dataset.mv && r) {
    const ids = releaseSongs(cat, r).map((x) => x.id), i = ids.indexOf(t.dataset.sid), j = i + Number(t.dataset.mv);
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]]; r.songIds = ids; save(); renderMid(); renderList(); return;
  }
  if (t.dataset.off && r) { moveSongToRelease(cat, t.dataset.off, ""); save(); renderMid(); renderList(); renderSide(); return; }
});
$("coverIn").addEventListener("change", async (e) => {
  const f = e.target.files[0], r = rel(); e.target.value = "";
  if (!f || !r) return;
  try { r.cover = await thumb(f); save(); renderMid(); renderList(); } catch { toast("That image couldn't be read."); }
});

// ---------- copy details ----------
function copyDialog(s, form) {
  const d = $("dlg");
  const draw = () => {
    const text = songDetailsText(cat, s, form);
    d.innerHTML = `<h3>Copy details: ${esc(songTitle(s))}</h3>
      <div class="seg" style="flex-wrap:wrap;border-radius:12px">${COPY_FORMS.map((f) => `<button data-form="${f.id}" class="${f.id === form ? "on" : ""}">${f.label}</button>`).join("")}</div>
      <pre class="preview" id="copyText">${esc(text)}</pre>
      <div class="row end"><button class="btn" data-close>Close</button><button class="btn go" id="doCopy">Copy</button></div>`;
    d.querySelector("#doCopy").onclick = async () => { toast((await copyText(text)) ? "Copied. Paste it into the form." : "Couldn't copy. Select the text and copy it yourself."); };
  };
  d.onclick = (e) => { const b = e.target.closest("button"); if (!b) { if (e.target === d) d.close(); return; } if (b.dataset.form) { form = b.dataset.form; draw(); } if ("close" in b.dataset) d.close(); };
  draw(); d.showModal();
}

// ---------- split sheet ----------
const sheetFor = (s) => splitSheetHtml(cat, s, { date: new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) });
function openSheet(s) {
  $("paper").innerHTML = sheetFor(s);
  $("printRoot").innerHTML = sheetFor(s);
  $("sheetDlg").showModal();
}
$("printSheet").addEventListener("click", () => window.print());
$("closeSheet").addEventListener("click", () => $("sheetDlg").close());
$("sheetDlg").addEventListener("click", (e) => { if (e.target === $("sheetDlg")) $("sheetDlg").close(); });
// Ctrl+P on a song prints its split sheet
addEventListener("beforeprint", () => { const s = song(); if (s) $("printRoot").innerHTML = sheetFor(s); else if (!$("printRoot").innerHTML) $("printRoot").innerHTML = `<p class="ss">Open a song to print its split sheet.</p>`; });

// ---------- the right side ----------
$("ttabs").addEventListener("click", (e) => { const b = e.target.closest("button[data-t]"); if (!b) return; ui.side = b.dataset.t; saveUi(); renderSide(); });
function renderSide() {
  for (const b of $("ttabs").children) b.classList.toggle("on", b.dataset.t === ui.side);
  $("side").innerHTML = ui.side === "help" ? helpView() : ui.side === "backup" ? backupView() : todoView();
}
function backupNudge() {
  if (!cat.songs.length) return "";
  const days = meta.last ? (Date.now() - meta.last) / 86400000 : Infinity;
  if (meta.changes < 15 && days < 7) return "";
  return `<div class="nudge"><b>Back up your catalog.</b> It lives only in this browser, so clearing your browsing data or switching computers would lose it. Last backup: ${ago(meta.last)}. <button class="btn sm" data-act="backup" style="margin-top:6px">Download a backup</button></div>`;
}
function todoView() {
  if (!cat.songs.length && !cat.releases.length) return `<div class="gl"><b>Nothing to do yet.</b> Add a song and this list shows what's missing across your whole catalog: codes, splits that don't add up, and registrations still to do.</div>`;
  const sum = catalogSummary(cat), iss = catalogHealth(cat);
  const fix = iss.filter((i) => i.kind === "fix"), todo = iss.filter((i) => i.kind === "todo");
  const issue = (i) => `<div><button class="iss ${i.kind}" data-jump="${i.id}"><span class="it">${esc(i.text)}<span class="go">${i.count > 1 ? "Next" : "Fix"} &#8250;</span></span></button>
    ${i.count > 1 ? `<div class="chips" style="margin:-2px 0 8px 16px">${i.items.slice(0, 6).map((x, n) => `<button class="chip" data-jump="${i.id}" data-n="${n}">${esc(x.name)}</button>`).join("")}${i.count > 6 ? `<span class="small dim">and ${i.count - 6} more</span>` : ""}</div>` : ""}</div>`;
  return `<div class="sumbox"><div class="big">${sum.pct}%</div><div class="small muted">of registrations done across ${sum.songs} song${sum.songs === 1 ? "" : "s"} and ${sum.releases} release${sum.releases === 1 ? "" : "s"} (${sum.done} of ${sum.total})</div><div class="pbar"><i style="width:${sum.pct}%"></i></div></div>
  ${backupNudge()}
  <div class="lbl">Needs fixing <span class="dim">${fix.length ? "" : "nothing"}</span></div>
  ${fix.map(issue).join("") || `<div class="allgood">No mistakes found.</div>`}
  <div class="lbl">Still to do <span class="dim">${todo.length ? "" : "nothing"}</span></div>
  ${todo.map(issue).join("") || `<div class="allgood">All done. Nice work.</div>`}`;
}
const jumpAt = {};
function jump(issueId, n) {
  const i = catalogHealth(cat).find((x) => x.id === issueId); if (!i) return;
  // clicking the same issue again moves on to the next song that has it
  if (n == null) { const cur = i.items.findIndex((x) => (x.songId || x.releaseId) === ui.id); n = cur >= 0 ? (cur + 1) % i.items.length : 0; }
  const it = i.items[n] || i.items[0];
  if (it.songId) select("song", it.songId, it.tab); else select("release", it.releaseId);
  requestAnimationFrame(() => {
    let el = null;
    if (it.tab === "regs" || it.tab === "release") el = it.field ? $("reg-" + it.field) || document.querySelector(`[data-code="${it.field}"]`) : null;
    else if (it.field) el = document.querySelector(`[data-code="${it.field}"]`);
    if (!el && (it.tab === "writing" || it.tab === "master")) el = document.querySelector("#tabBody .card") || document.querySelector("#tabBody .none");
    if (!el && it.tab === "samples") el = [...document.querySelectorAll('#tabBody [data-row="samples"]')].find((c) => c.querySelector('[data-r="status"]').value !== "cleared");
    if (el) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      el.classList.add("flash"); setTimeout(() => el.classList.remove("flash"), 1600);
      const inp = el.querySelector("input:not([type=date])"); if (inp && it.field && it.tab !== "regs" && it.tab !== "release") inp.focus({ preventScroll: true });
    }
  });
}
function helpView() {
  const tabHelp = {
    details: "<b>Details.</b> The basics every form asks for. Each version of a song (Radio Edit, Live, Acoustic) is its own recording, so it gets its own song here and its own ISRC.",
    writing: "<b>Songwriting split.</b> Who wrote the song and each writer's share of it. Shares must add up to 100%. Agree on them before release and get everyone's signature on a split sheet.",
    master: "<b>Master split.</b> Who owns the recording itself, separate from the song. A label deal, a paid producer or a band can each change this.",
    credits: "<b>Credits.</b> Everyone who made the recording: producers, engineers, musicians, vocals. Streaming services show credits and they help you get hired.",
    samples: "<b>Samples.</b> Clear anything from someone else's music before release. Uncleared samples can get a song taken down or its money held.",
    regs: "<b>Registrations.</b> Each place collects a different kind of money. Missing one means that money waits for you, or goes to someone else.",
  };
  const g = (k) => { const h = CODE_HELP[k]; return `<div class="gl"><b>${h.name}</b> (${esc(h.long)}). ${esc(h.text)} ${esc(h.who)}</div>`; };
  return `${ui.kind === "song" ? `<div class="gl">${tabHelp[ui.tab] || tabHelp.details}</div>` : ui.kind === "release" ? `<div class="gl"><b>Release.</b> A single, EP or album as a product: one UPC (Universal Product Code), one release date, and a track list. Each song on it keeps its own codes and splits.</div>` : ""}
  <div class="lbl">The codes</div>${g("isrc")}${g("iswc")}${g("upc")}${g("ipi")}
  <div class="lbl">Who pays what</div>
  <div class="gl"><b>The song and the recording earn separately.</b> The song (words and music) is owned by its writers and publishers. The recording (the master) is owned by whoever made or paid for it. Each has its own money and its own registrations.</div>
  <div class="gl"><b>PRO</b> (performing rights organization: ASCAP, BMI, SESAC, GMR in the US). Pays songwriters and publishers when the song is played in public, on radio, TV, in venues and on streaming.</div>
  <div class="gl"><b>The MLC</b> (Mechanical Licensing Collective). Pays US streaming mechanical royalties to songwriters and publishers. Money it can't match is eventually paid out to registered songs by market share, so register.</div>
  <div class="gl"><b>SoundExchange.</b> Pays performers and recording owners when the recording plays on US digital radio.</div>
  <div class="gl"><b>Distributor.</b> The service that sends your music to streaming services and stores and pays you the recording's streaming money.</div>
  <div class="gl"><b>Publisher / publishing administrator.</b> A company that manages a song's rights and collects the publisher's share. Self-published writers do this themselves.</div>
  <p class="note">${esc(COUNTRY_NOTE)}</p>`;
}
function backupView() {
  return `<div class="gl"><b>Your catalog lives only in this browser.</b> Nothing is uploaded anywhere. That keeps it private, but clearing your browsing data, a private window or a new computer means starting over, unless you have a backup file. Last backup: <b>${ago(meta.last)}</b>.</div>
  <div class="copies">
    <button class="copy" data-act="backup"><b>Download a backup</b><span>One file with everything. Keep it somewhere safe, like your cloud drive.</span></button>
    <button class="copy" data-act="restore"><b>Open a backup</b><span>Bring a backup file back in, on this or another computer.</span></button>
    <button class="copy" data-act="csv"><b>Catalog spreadsheet (CSV)</b><span>One row per song: codes, release, writers, owners, registrations.</span></button>
    <button class="copy" data-act="splits"><b>Splits spreadsheet (CSV)</b><span>One row per writer and per master owner, with PROs, IPIs and publishers.</span></button>
  </div>
  <div class="lbl">Start over</div>
  <div class="copies"><button class="copy danger" data-act="wipe"><b>Erase this browser's catalog</b><span>Download a backup first. This can't be undone.</span></button></div>`;
}
$("side").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.jump) return jump(b.dataset.jump, b.dataset.n != null ? Number(b.dataset.n) : null);
  const act = b.dataset.act;
  if (act === "backup") return doBackup();
  if (act === "restore") return $("backupIn").click();
  if (act === "csv") { download(`credits-catalog-${fileStamp()}.csv`, catalogCsv(cat), "text/csv;charset=utf-8"); toast("Catalog spreadsheet downloaded"); return; }
  if (act === "splits") { download(`credits-splits-${fileStamp()}.csv`, splitsCsv(cat), "text/csv;charset=utf-8"); toast("Splits spreadsheet downloaded"); return; }
  if (act === "wipe") {
    if (!confirm("Erase every song and release in this browser? Download a backup first if you might want them back.")) return;
    cat = emptyCatalog(); ui.kind = ""; ui.id = ""; meta.changes = 0; saveNow(); saveUi(); renderAll(); toast("Catalog erased");
  }
});
function doBackup() {
  download(`credits-backup-${fileStamp()}.json`, JSON.stringify(makeBackup(cat), null, 1), "application/json");
  meta.last = Date.now(); meta.changes = 0; store(K.backup, meta); renderSide(); saveHint();
  toast("Backup downloaded. Keep it somewhere safe.");
}
$("backupIn").addEventListener("change", async (e) => {
  const f = e.target.files[0]; e.target.value = "";
  if (!f) return;
  let incoming;
  try { incoming = readBackup(await f.text()); } catch (err) { toast(err.message); return; }
  const apply = (mode) => {
    cat = mode === "replace" ? incoming : mergeCatalog(cat, incoming);
    save(); saveNow(); renderAll();
    toast(`Backup opened: ${incoming.songs.length} song${incoming.songs.length === 1 ? "" : "s"}, ${incoming.releases.length} release${incoming.releases.length === 1 ? "" : "s"}`);
  };
  if (!cat.songs.length && !cat.releases.length) return apply("replace");
  const d = $("dlg");
  d.innerHTML = `<h3>Open this backup</h3><p class="muted" style="margin:0">It has ${incoming.songs.length} song${incoming.songs.length === 1 ? "" : "s"} and ${incoming.releases.length} release${incoming.releases.length === 1 ? "" : "s"}. You have ${cat.songs.length} song${cat.songs.length === 1 ? "" : "s"} here now.</p>
    <div class="copies" style="margin-top:12px"><button class="copy" data-mode="merge"><b>Add to my catalog</b><span>Songs from the backup are added. Ones you already have are updated to the backup's copy.</span></button>
    <button class="copy" data-mode="replace"><b>Replace my catalog</b><span>Everything here is swapped for the backup.</span></button></div>
    <div class="row end"><button class="btn" data-close>Cancel</button></div>`;
  d.onclick = (ev) => { const b = ev.target.closest("button"); if (!b) { if (ev.target === d) d.close(); return; } if (b.dataset.mode) { d.close(); apply(b.dataset.mode); } if ("close" in b.dataset) d.close(); };
  d.showModal();
});
function saveHint() {
  const n = cat.songs.length;
  $("saveHint").innerHTML = `<span>Saved in this browser only. ${n ? `Last backup: <b>${ago(meta.last)}</b>.` : ""}</span>`;
}

// ---------- remembered names for the boxes ----------
function refreshNames() {
  $("dlNames").innerHTML = knownNames(cat).map((n) => `<option value="${esc(n)}">`).join("");
}
$("dlRoles").innerHTML = CREDIT_ROLES.map((r) => `<option value="${esc(r)}">`).join("");

// ---------- an example song, to see how it works ----------
function addExample() {
  const r = newRelease({ title: "Night Shift", artist: "Your Band", type: "ep", date: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10), label: "Your Band" });
  cat.releases.push(r);
  const s = newSong({ title: "Neon Rain", artist: "Your Band", duration: "3:25", genre: "Indie Rock", language: "English", lyrics: "yes", releaseId: r.id,
    writers: [newWriter({ name: "You", pro: "BMI", share: 50 }), newWriter({ name: "Your Co-writer", pro: "ASCAP", share: 40, role: "music" })],
    owners: [newOwner({ name: "Your Band", share: 100, notes: "Artist" })], credits: [newCredit({ role: "Producer", name: "You" }), newCredit({ role: "Mixing engineer", name: "A Friend" })],
    regs: { distributor: { ...emptyReg(), status: "doing" } } });
  cat.songs.push(s); r.songIds.push(s.id);
  save(); select("song", s.id, "writing");
  toast("Example added. The split adds up to 90%: try Split evenly, or fix a share.");
}

// ---------- start ----------
function renderAll() { refreshNames(); renderList(); renderMid(); renderSide(); saveHint(); }
if (ui.kind && !(ui.kind === "song" ? song() : rel())) { ui.kind = ""; ui.id = ""; }
if (!ui.kind && cat.songs.length) { ui.kind = "song"; ui.id = cat.songs[0].id; }
if (!TABS.some(([id]) => id === ui.tab)) ui.tab = "details";
setM(phone() && !ui.kind ? "cat" : "song");
renderAll();
