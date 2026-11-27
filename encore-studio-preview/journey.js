// ENCORE. Journey: drop your songs once and take them from finished mix to
// release: Master, Details (tags and cover), Check (Last Call) and Release
// (every format, tagged, in one zip). The heavy lifting is the same code the
// single tools use: album-worker.js masters, lastcall-worker.js measures,
// convert-worker.js makes each format. The plain logic is in journey-core.js.
import { STEPS, releaseKind, guessTitle, guessRelease, songMeta, masterTargets, releaseInfo, RELEASE_FORMATS, DEFAULT_FORMATS,
  releaseFolder, releasePath, stepStatus, checkKey } from "./journey-core.js";
import { decodeAudio, AUDIO_EXT, ACCEPT } from "./audio-decode.js";
import { loadFile } from "./load-progress.js";
import { floatWavBlob, tracklistText } from "./album.js";
import { STYLES, TARGETS } from "./master-core.js";
import { readFileInfo, decodeWav, buildChecks, albumChecks, coverCheck, verdict, reportText, imageInfo, isSegue, STATUS, fmtTime } from "./lastcall-core.js";
import { readTags, plan, FORMATS, PRESETS, fmtBytes } from "./convert-core.js";
import { fillGenreSelect } from "./genres.js";
import { zip } from "./zip.js";
import { toLyrics } from "./songbook-core.js";
import { icon } from "./gr-shell.js";

// lyrics written in ENCORE. Songbook (same browser) can go into the files
function songbookSongs() {
  try { return (JSON.parse(localStorage.getItem("encore.songbook.v1") || "null")?.songs || []).map((x) => ({ id: x.id, title: x.title || "", body: x.body || "" })).filter((x) => x.body.trim()); } catch { return []; }
}
// the words alone: no [Verse] lines, at most one blank line in a row
const plainLyrics = (body) => toLyrics(body).split("\n").filter((l) => !/^\[[^\]]+\]$/.test(l.trim())).join("\n").replace(/\n{3,}/g, "\n\n").trim();

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const store = {
  get: (k, d) => { try { const v = localStorage.getItem("encore.journey." + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem("encore.journey." + k, JSON.stringify(v)); } catch {} },
};
const saved = store.get("settings", {});
// Only who-you-are details carry over to the next release. The title, UPC, year and cover belong to one release.
const KEEP = ["artist", "genre", "publisher", "copyright"];
const keepOnly = (r) => Object.fromEntries(KEEP.filter((k) => r?.[k]).map((k) => [k, r[k]]));
const state = {
  step: "songs", songs: [], sel: -1, nextId: 1,
  release: { artist: "", title: "", year: String(new Date().getFullYear()), genre: "", publisher: "", copyright: "", upc: "", ...keepOnly(store.get("release", {})) },
  typed: new Set(), // release fields typed in for this release (the songs' own tags don't overwrite those)
  art: null,
  skipMaster: false, style: saved.style ?? 0, intensity: saved.intensity ?? 0.5, target: saved.target ?? 0, flow: saved.flow ?? 0.5,
  formats: new Set(saved.formats ?? DEFAULT_FORMATS),
  checked: false, checkedKey: "", check: null, released: null, busy: "",
};
const saveSettings = () => store.set("settings", { style: state.style, intensity: state.intensity, target: state.target, flow: state.flow, formats: [...state.formats] });

// ---------- workers ----------
let wasm = null, masterPool = [];
async function pool() {
  if (masterPool.length) return masterPool;
  wasm ||= await (await fetch("master.wasm")).arrayBuffer();
  const n = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 2) - 1));
  masterPool = await Promise.all(Array.from({ length: n }, () => new Promise((resolve, reject) => {
    const w = new Worker(new URL("album-worker.js", import.meta.url), { type: "module" });
    w.onmessage = (e) => { if (e.data.type === "ready") { w.onmessage = null; resolve({ w, busy: false }); } };
    w.onerror = (e) => reject(new Error(e.message || "The mastering engine didn't start."));
    w.postMessage({ type: "init", wasm: wasm.slice(0) });
  })));
  return masterPool;
}
let jobId = 0;
async function masterJob(msg) {
  const p = await pool();
  let slot;
  while (!(slot = p.find((s) => !s.busy))) await new Promise((r) => setTimeout(r, 30));
  slot.busy = true;
  const id = ++jobId;
  try {
    return await new Promise((resolve, reject) => {
      slot.w.onmessage = (e) => { if (e.data.id !== id) return; e.data.type === "error" ? reject(new Error(e.data.message)) : resolve(e.data); };
      slot.w.postMessage({ ...msg, id, job: id });
    });
  } finally { slot.busy = false; }
}
function oneShot(script, msg, transfer, onProgress) {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL(script, import.meta.url), { type: "module" });
    w.onmessage = (e) => {
      const m = e.data;
      if (m.type === "progress") { onProgress?.(m.pct ?? m.fraction ?? 0); return; }
      w.terminate();
      m.type === "error" ? reject(new Error(m.message)) : resolve(m);
    };
    w.onerror = (e) => { w.terminate(); reject(new Error(e.message || "A background task stopped unexpectedly.")); };
    w.postMessage(msg, transfer);
  });
}

// ---------- songs ----------
const songsEl = $("songs");
$("files").accept = ACCEPT;
$("files").onchange = () => { addFiles($("files").files); $("files").value = ""; };
const drop = $("drop");
for (const ev of ["dragenter", "dragover"]) drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); });
for (const ev of ["dragleave", "drop"]) drop.addEventListener(ev, () => drop.classList.remove("over"));
drop.addEventListener("drop", (e) => { e.preventDefault(); addFiles(e.dataTransfer.files); });
document.addEventListener("dragover", (e) => e.preventDefault());
document.addEventListener("drop", (e) => { e.preventDefault(); if (e.target.closest?.("#cover, #drop")) return; addFiles(e.dataTransfer.files); }); // the drop zone and the cover handle their own drops

let queue = Promise.resolve();
// A new release: clear what belonged to the last one (the title, UPC, year and cover) and let the new songs' tags fill in
function newRelease() {
  Object.assign(state.release, { title: "", upc: "", year: String(new Date().getFullYear()) });
  state.typed = new Set();
  if (state.art?.url) URL.revokeObjectURL(state.art.url);
  state.art = null;
}
function addFiles(list) {
  const files = [...list].filter((f) => AUDIO_EXT.test(f.name) || (f.type || "").startsWith("audio/"));
  if (!files.length) { setStatus("Those don't look like audio files."); return; }
  if (!state.songs.length && state.hadSongs) newRelease(); // the list was emptied, so these are a different release
  state.hadSongs = true;
  for (const file of files) {
    const s = { id: state.nextId++, file, name: file.name, title: guessTitle(file.name), featuring: "", composer: "", isrc: "", explicit: false, nudgeDb: 0,
      status: "Waiting", blob: null, fs: 0, seconds: 0, origLufs: null, master: null, err: "" };
    state.songs.push(s);
    queue = queue.then(() => prepare(s));
  }
  if (state.sel < 0) state.sel = 0;
  invalidate();
  render();
}
// read the file once: its tags, its audio (kept as a float WAV the workers read a piece at a time) and its loudness
async function prepare(s) {
  if (!state.songs.includes(s)) return;
  try {
    s.status = "Reading"; renderSongs();
    const d = await loadFile(s.file, (buf, st) => {
      const bytes = new Uint8Array(buf), info = readFileInfo(bytes, s.name), t = readTags(bytes, info);
      s.info = info; s.tags = t.tags || {};
      s.title = guessTitle(s.name, s.tags);
      if (s.tags.isrc) s.isrc = s.tags.isrc;
      if (s.tags.composer) s.composer = s.tags.composer;
      if (!state.art && t.art?.bytes?.length) setArt(t.art.bytes, t.art.mime || "image/jpeg", "from " + s.name);
      return decodeAudio({ name: s.file.name, arrayBuffer: async () => buf }, info, (m) => { st(m); s.status = m; renderSongs(); });
    }, { name: s.name });
    s.channels = d.chans.length;
    s.blob = floatWavBlob(d.chans.length === 1 ? [d.chans[0], d.chans[0]] : d.chans, d.fs);
    s.fs = d.fs; s.seconds = d.chans[0].length / d.fs;
    s.peaks = peaksOf(d.chans);
    s.status = "Measuring"; renderSongs();
    const m = await masterJob({ type: "measure", file: s.blob });
    s.origLufs = m.lufs; s.origPeakDb = m.peakDb; s.mix = m.mix;
    s.status = "";
    // release details from the songs' own tags, unless typed in for this release (remembered details give way to the tags)
    const g = guessRelease(state.songs.filter((x) => x.tags).map((x) => x.tags));
    for (const k of Object.keys(g)) if (g[k] && !state.typed.has(k)) state.release[k] = g[k];
  } catch (err) {
    s.err = err.message || String(err); s.status = "";
  }
  invalidate();
  render();
}
// a small picture of the song for the list: the loudest moment in each of 64 slices
function peaksOf(chans, n = 64) {
  const len = chans[0].length, step = Math.max(1, Math.floor(len / n)), out = [];
  for (let b = 0; b < n; b++) {
    let m = 0;
    for (const c of chans) for (let i = b * step, e = Math.min(len, i + step); i < e; i += 16) { const v = Math.abs(c[i]); if (v > m) m = v; }
    out.push(m);
  }
  const top = Math.max(...out, 1e-6);
  return out.map((v) => v / top);
}
const waveSvg = (peaks) => peaks ? `<svg class="wave" viewBox="0 0 ${peaks.length * 4} 22" preserveAspectRatio="none" aria-hidden="true">${peaks.map((v, i) => { const h = Math.max(2, Math.round(v * 20)); return `<rect x="${i * 4}" y="${(22 - h) / 2}" width="2.4" height="${h}" rx="1.2"/>`; }).join("")}</svg>` : "";
function moveSong(i, d) {
  const j = i + d;
  if (j < 0 || j >= state.songs.length) return;
  [state.songs[i], state.songs[j]] = [state.songs[j], state.songs[i]];
  if (state.sel === i) state.sel = j; else if (state.sel === j) state.sel = i;
  invalidate(); render();
}
function removeSong(i) {
  const [s] = state.songs.splice(i, 1);
  if (s && state.playing === s) stopAudio();
  state.sel = Math.min(state.sel, state.songs.length - 1);
  invalidate(); render();
}
songsEl.onclick = (e) => {
  const b = e.target.closest("button"), li = e.target.closest(".song");
  if (!li) return;
  const i = [...songsEl.children].indexOf(li);
  if (b?.dataset.a === "up") return moveSong(i, -1);
  if (b?.dataset.a === "down") return moveSong(i, 1);
  if (b?.dataset.a === "rm") return removeSong(i);
  state.sel = i;
  if (b?.dataset.a === "play") return play(state.songs[i]);
  renderSongs(); renderPlayer();
};
const lufsText = (v) => (Number.isFinite(v) ? `${v.toFixed(1)} LUFS` : "");
function renderSongs() {
  const n = state.songs.length;
  $("kind").textContent = n ? `${n} song${n > 1 ? "s" : ""}, a${releaseKind(n) === "EP" ? "n" : ""} ${releaseKind(n)}` : "";
  drop.querySelector("b").textContent = n ? "Add more songs" : "Drop your finished mixes here";
  drop.querySelector(".sub").textContent = n ? "WAV, FLAC, MP3, Apple Lossless and more." : "One song for a single, a few for an EP or a whole album. WAV, FLAC, MP3, Apple Lossless and more.";
  $("songsPanel").classList.toggle("isEmpty", !n);
  songsEl.innerHTML = state.songs.map((s, i) => {
    let meta;
    const m = s.master && s.master.key === masterKey(s) ? s.master : null;
    if (s.err) meta = `<span class="pill bad">Couldn't read it</span> ${esc(s.err)}`;
    else if (s.status) meta = `<span class="pill busy">${esc(s.status)}</span>`;
    else meta = `${fmtTime(s.seconds)} · ${esc(s.info?.label || "")} · ${m ? `${Number.isFinite(s.origLufs) ? s.origLufs.toFixed(1) : "?"} &#8594; <span class="ok">${m.lufs.toFixed(1)} LUFS</span>` : lufsText(s.origLufs)}`;
    return `<li class="song${i === state.sel ? " sel" : ""}${m ? " mastered" : ""}"><span class="n">${String(i + 1).padStart(2, "0")}</span><span class="t" title="${esc(s.name)}">${esc(s.title)}</span>
      <span class="acts"><button class="ib play" data-a="play" aria-label="Play ${esc(s.title)}" ${s.blob ? "" : "disabled"}>&#9654;</button>
      <button class="ib" data-a="up" aria-label="Move up" ${i ? "" : "disabled"}>&#9650;</button><button class="ib" data-a="down" aria-label="Move down" ${i < n - 1 ? "" : "disabled"}>&#9660;</button>
      <button class="ib" data-a="rm" aria-label="Remove">&#10005;</button></span><span class="meta">${meta}</span>${waveSvg(s.peaks)}</li>`;
  }).join("");
  renderRelCard();
}
// the release at a glance, above the songs: cover, title, artist, how long
function renderRelCard() {
  const n = state.songs.length, el = $("relCard");
  el.classList.toggle("hidden", !n);
  if (!n) return;
  const r = state.release, kind = releaseKind(n), title = r.title.trim() || (n === 1 ? state.songs[0].title : `Untitled ${kind}`);
  const secs = state.songs.reduce((a, s) => a + (s.seconds || 0), 0);
  el.innerHTML = `<div class="art">${state.art ? `<img alt="" src="${state.art.url}">` : icon("journey")}</div>
    <div style="min-width:0"><b>${esc(title)}</b><div class="who">${r.artist.trim() ? esc(r.artist) : '<span class="dim">Add the artist in Details</span>'}</div>
    <div class="facts">${kind} · ${n} song${n > 1 ? "s" : ""}${secs ? ` · ${fmtTime(secs)}` : ""}${r.year ? ` · ${esc(r.year)}` : ""}</div></div>`;
}

// ---------- listening: the mix or the master, at the same spot ----------
const audio = $("audio");
let ab = "orig", urls = new Map();
const urlOf = (blob) => { if (!urls.has(blob)) urls.set(blob, URL.createObjectURL(blob)); return urls.get(blob); };
function play(s) {
  if (!s?.blob) return;
  if (state.playing === s && !audio.paused) { audio.pause(); renderPlayer(); return; }
  const mastered = s.master && s.master.key === masterKey(s);
  if (!mastered) ab = "orig";
  const src = urlOf(ab === "master" && mastered ? s.master.blob : s.blob);
  if (audio.src !== src) { const t = state.playing === s ? audio.currentTime : 0; audio.src = src; audio.currentTime = t; }
  state.playing = s;
  audio.play().catch(() => {});
  renderPlayer();
}
function stopAudio() { audio.pause(); audio.removeAttribute("src"); state.playing = null; renderPlayer(); }
$("playBtn").onclick = () => play(state.playing || state.songs[state.sel]);
$("abSeg").onclick = (e) => {
  const b = e.target.closest("button"); if (!b || b.disabled) return;
  ab = b.dataset.v;
  const s = state.playing || state.songs[state.sel];
  if (s && state.playing === s) { const t = audio.currentTime, was = !audio.paused; audio.src = urlOf(ab === "master" ? s.master.blob : s.blob); audio.currentTime = t; if (was) audio.play().catch(() => {}); }
  renderPlayer();
};
audio.onplay = audio.onpause = audio.onended = () => renderPlayer();
function renderPlayer() {
  const s = state.playing || state.songs[state.sel];
  const mastered = !!(s?.master && s.master.key === masterKey(s));
  $("playBtn").disabled = !s?.blob;
  $("playBtn").innerHTML = state.playing && !audio.paused ? "&#10074;&#10074;" : "&#9654;";
  $("nowPlaying").innerHTML = s ? `<b>${esc(s.title)}</b><span class="dim">${ab === "master" && mastered ? "The master" : "Your mix"}${s.seconds ? ` · ${fmtTime(s.seconds)}` : ""}</span>` : `<span class="dim">Pick a song to listen</span>`;
  const [o, m] = $("abSeg").children;
  m.disabled = !mastered; if (!mastered) ab = "orig";
  o.classList.toggle("on", ab === "orig"); m.classList.toggle("on", ab === "master");
}

// ---------- master ----------
function soundSettings() { return { style: state.style, intensity: state.intensity, ceilingDb: -1, eq: { low: 0, mid: 0, high: 0 } }; }
function targets() { return masterTargets(state.songs, TARGETS[state.target].lufs, state.flow); }
function masterKey(s) {
  const i = state.songs.indexOf(s);
  return JSON.stringify([soundSettings(), targets()[i] ?? null]);
}
async function masterAll() {
  if (state.busy) return;
  const todo = state.songs.filter((s) => s.blob && !(s.master && s.master.key === masterKey(s)));
  if (!todo.length) { setStatus("Every song is already mastered with these settings."); return; }
  state.busy = "master"; render();
  let done = 0;
  setStatus(`Mastering ${todo.length} song${todo.length > 1 ? "s" : ""}...`);
  await Promise.all(todo.map(async (s) => {
    const key = masterKey(s), target = targets()[state.songs.indexOf(s)];
    try {
      s.status = "Mastering"; renderSongs();
      const r = await masterJob({ type: "render", file: s.blob, settings: { ...soundSettings(), targetLufs: target }, pcm: true, wav: [] });
      s.master = { key, blob: floatWavBlob([r.l, r.r], r.fs), lufs: r.lufs, peakDb: r.peakDb, target };
    } catch (err) { s.err = "Mastering failed: " + (err.message || err); }
    s.status = ""; done++;
    setStatus(`Mastered ${done} of ${todo.length}.`);
    renderSongs(); renderPlayer();
  }));
  state.busy = "";
  invalidate();
  setStatus(state.songs.every((s) => s.master) ? "All mastered. Listen with Mix / Master below the songs, then go on to Details." : "Done, with problems (see the songs).");
  render();
}

// ---------- the step pages ----------
const body = $("body");
function render() {
  renderSongs(); renderPlayer(); renderSteps(); renderBody();
  $("songsPanel").classList.toggle("away", state.step !== "songs");
  document.querySelector("main").classList.toggle("atSongs", state.step === "songs");
  const i = STEPS.findIndex((s) => s.id === state.step);
  $("backBtn").disabled = i === 0;
  $("nextBtn").textContent = i === STEPS.length - 1 ? "Start over" : `Next: ${STEPS[i + 1].name}`;
  $("nextBtn").disabled = !state.songs.length || !!state.busy;
}
function renderSteps() {
  const st = stepStatus(state);
  $("steps").innerHTML = STEPS.map((s, i) => `<button class="step ${st[s.id]}${s.id === state.step ? " on" : ""}" data-s="${s.id}" ${s.id === state.step ? 'aria-current="step"' : ""}>
    <span class="k"><span class="num">${st[s.id] === "done" ? "&#10003;" : st[s.id] === "skipped" ? "&#8211;" : i + 1}</span>${s.name}</span><span class="b">${s.blurb}</span></button>`).join("");
}
$("steps").onclick = (e) => { const b = e.target.closest(".step"); if (b) go(b.dataset.s); };
$("backBtn").onclick = () => { const i = STEPS.findIndex((s) => s.id === state.step); if (i > 0) go(STEPS[i - 1].id); };
$("nextBtn").onclick = () => {
  const i = STEPS.findIndex((s) => s.id === state.step);
  if (i === STEPS.length - 1) { if (confirm("Clear the songs and start a new release? Your artist name, label, genre and copyright are kept; the title, UPC and cover are cleared.")) startOver(); return; }
  go(STEPS[i + 1].id);
};
function go(step) { state.step = step; body.scrollTop = 0; render(); if (step === "check" && !state.busy && state.songs.length && stepStatus(state).check !== "done") runCheck(); }
function startOver() { stopAudio(); for (const u of urls.values()) URL.revokeObjectURL(u); urls.clear(); state.songs = []; state.sel = -1; state.released = null; state.checked = false; newRelease(); go("songs"); }

// the head of each step: which step, its name and one line on what it does
const stepHead = (id, title, lede) => { const i = STEPS.findIndex((s) => s.id === id); return `<div class="gr-kicker">Step ${i + 1} of ${STEPS.length}</div><h3>${title}</h3>${lede ? `<p class="lede">${lede}</p>` : ""}`; };
const STEP_ICON = { master: "master", details: "tag", check: "lastcall", release: "convert" };
const flowCards = () => `<div class="flow">${STEPS.slice(1).map((s, i) => `<button class="flowStep" data-go="${s.id}"><span class="fn">0${i + 2}</span><span class="fi">${icon(STEP_ICON[s.id])}</span><b>${s.name}</b><span>${s.blurb}</span></button>`).join("")}</div>`;
const LOCK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>`;
const stat = (label, value, unit, sub, cls = "") => `<div class="stat ${cls}"><div class="sl">${label}</div><div class="sv">${value}${unit ? `<small>${unit}</small>` : ""}</div>${sub ? `<div class="ss">${sub}</div>` : ""}</div>`;
const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : "?");
const FILE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>`;
const FOLDER = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>`;
const VERDICT_ICON = { ready: '<path d="m5 12.5 4.5 4.5L19 7.5"/>', notes: '<path d="M12 8v5M12 16.5v.5"/><circle cx="12" cy="12" r="9"/>', fix: '<path d="M12 7v6M12 16.5v.5"/><path d="M10.3 3.6 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0z"/>' };

function renderBody() {
  const n = state.songs.length;
  if (state.step === "songs") {
    const secs = state.songs.reduce((a, s) => a + (s.seconds || 0), 0), louds = state.songs.map((s) => s.origLufs).filter(Number.isFinite);
    const fmts = [...new Set(state.songs.map((s) => s.info?.label).filter(Boolean))];
    body.innerHTML = n ? `<div class="hero">${stepHead("songs", "Your songs, in release order", "Put them in the order they'll be released (the arrows on each song move it). From here, every step works on all of them at once.")}
        <div class="stats">${stat("Songs", n, "", `a${releaseKind(n) === "EP" ? "n" : ""} ${releaseKind(n)}`)}${stat("Running time", fmtTime(secs), "", "in all")}
          ${stat("Loudest mix", louds.length ? f1(Math.max(...louds)) : "...", louds.length ? "LUFS" : "", louds.length > 1 ? `quietest ${f1(Math.min(...louds))} LUFS` : "measured on your device")}
          ${stat("Files", esc(fmts.join(", ") || "..."), "", state.songs.some((s) => s.status) ? "still reading" : "ready to master")}</div>
        ${flowCards()}
        ${state.songs.some((s) => s.mix?.problems) ? `<p class="note">Some mixes have things worth a look before mastering (they show in Check). You can still go ahead.</p>` : ""}
        <div class="note lock">${LOCK}Everything happens on your device. Nothing is uploaded.</div></div>`
      : `<div class="hero"><div class="heroBadge">${icon("journey")}</div><div class="gr-kicker">ENCORE. Journey</div>
        <h3>From finished mix to release, in one place.</h3>
        <p class="lede">Drop in your finished mixes on the left, one for a single or several for an EP or album. Journey masters them so they sound like one release, puts your details and cover in every file, checks it all the way stores do and hands you every format in one download.</p>
        ${flowCards()}
        <div class="note lock">${LOCK}Everything happens on your device. Nothing is uploaded.</div></div>`;
    body.querySelector(".flow").onclick = (e) => { const b = e.target.closest("[data-go]"); if (b && n) go(b.dataset.go); else if (b) $("files").click(); };
    return;
  }
  if (state.step === "master") {
    const tg = n ? targets() : [];
    // the loudness plan: each song's mix and where it lands, on one scale
    const vals = state.songs.flatMap((s, i) => [s.origLufs, tg[i], s.master?.lufs]).filter(Number.isFinite);
    let lo = Math.floor((Math.min(-16, ...vals) - 3) / 2) * 2, hi = Math.ceil((Math.max(-12, ...vals) + 3) / 2) * 2;
    if (hi - lo < 12) { lo -= Math.ceil((12 - (hi - lo)) / 4) * 2; hi = lo + Math.max(12, hi - lo); }
    const every = hi - lo > 16 ? 4 : 2, pos = (v) => `${(((v - lo) / (hi - lo)) * 100).toFixed(2)}%`;
    const ticks = []; for (let v = lo; v <= hi; v += 2) ticks.push(v);
    const plan = n ? `<div class="plan">${state.songs.map((s, i) => {
        const a = s.origLufs, b = tg[i], done = s.master && s.master.key === masterKey(s);
        const ok = Number.isFinite(a) && Number.isFinite(b);
        return `<div class="planRow"><span class="pn" title="${esc(s.title)}">${esc(s.title)}</span><div class="track">${ticks.map((v) => `<i class="tick" style="left:${pos(v)}"></i>`).join("")}
          ${ok ? `<i class="span" style="left:${pos(Math.min(a, b))};width:calc(${pos(Math.max(a, b))} - ${pos(Math.min(a, b))})"></i><i class="dot mix" style="left:${pos(a)}"></i><i class="dot tg" style="left:${pos(b)}"></i>` : ""}</div>
          <span class="pv">${f1(a)} &#8594; ${done ? `<b>${f1(s.master.lufs)}</b>` : `<i>${f1(b)}</i>`}</span></div>`;
      }).join("")}
      <div class="planScale"><span></span><div class="sc">${ticks.filter((v) => v % every === 0).map((v) => `<span style="left:${pos(v)}">${v}</span>`).join("")}</div><span style="text-align:right">LUFS</span></div></div>
      <div class="legend"><span><i class="mix"></i>Your mix</span><span><i class="tg"></i>${state.songs.some((s) => s.master && s.master.key === masterKey(s)) ? "Mastered (green numbers are measured)" : "Where it lands"}</span></div>` : `<p class="note">Add songs to see where each one lands.</p>`;
    body.innerHTML = `${stepHead("master", "Master", "One sound for the whole release. Every song gets the same style; the loudest lands on your loudness, and the rest keep a little of their difference so a ballad still sits under the single.")}
      <label class="switch"><input type="checkbox" id="skipMaster" ${state.skipMaster ? "checked" : ""}><div><b>These are already mastered</b><span>Skip this step and release the files as they are.</span></div></label>
      <div id="masterOpts" class="${state.skipMaster ? "hidden" : ""}">
        <div class="label">Sound</div>
        <div class="chips" id="styles">${STYLES.map((s, i) => `<button class="chip${i === state.style ? " on" : ""}" data-i="${i}"><b>${esc(s.name)}</b><span>${esc(s.blurb)}</span></button>`).join("")}</div>
        <div class="masterGrid">
          <div class="card">
            <div class="ctl"><div class="label">Loudness</div><div class="seg" id="targets">${TARGETS.map((t, i) => `<button data-i="${i}" class="${i === state.target ? "on" : ""}">${esc(t.name)} ${t.lufs}</button>`).join("")}</div></div>
            <div class="ctl"><div class="label"><span>How much</span><span class="v">${Math.round(state.intensity * 100)}%</span></div><input type="range" id="intensity" min="0" max="1" step="0.05" value="${state.intensity}" aria-label="How much"></div>
            ${n > 1 ? `<div class="ctl"><div class="label"><span>Quiet songs stay quieter</span><span class="v">${Math.round(state.flow * 100)}%</span></div><input type="range" id="flow" min="0" max="1" step="0.25" value="${state.flow}" aria-label="Quiet songs stay quieter"></div>` : ""}
          </div>
          <div class="card"><div class="label">Each song's loudness</div>${plan}</div>
        </div>
        <div class="actRow"><button class="btn go" id="masterBtn" ${n && !state.busy ? "" : "disabled"}>${state.songs.some((s) => s.master) ? "Master again with these settings" : `Master ${n > 1 ? `all ${n} songs` : "it"}`}</button>
        <span class="small muted">Then listen with <b>Mix / Master</b> under the songs.</span></div>
      </div>`;
    $("skipMaster").onchange = (e) => { state.skipMaster = e.target.checked; invalidate(); render(); };
    $("styles")?.addEventListener("click", (e) => { const b = e.target.closest(".chip"); if (b) { state.style = +b.dataset.i; saveSettings(); invalidate(); render(); } });
    $("targets")?.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { state.target = +b.dataset.i; saveSettings(); invalidate(); render(); } });
    const slide = (id, k) => { const el = $(id); if (el) el.onchange = () => { state[k] = +el.value; saveSettings(); invalidate(); render(); }; };
    slide("intensity", "intensity"); slide("flow", "flow");
    $("masterBtn") && ($("masterBtn").onclick = masterAll);
    return;
  }
  if (state.step === "details") {
    const r = state.release, sb = songbookSongs();
    // a Songbook song with the same title brings its lyrics along
    for (const s of state.songs) if (s.lyricsFrom === undefined) { const m = sb.find((x) => x.title.trim().toLowerCase() === s.title.trim().toLowerCase()); s.lyricsFrom = m ? m.id : ""; }
    for (const s of state.songs) { const m = sb.find((x) => x.id === s.lyricsFrom); s.lyrics = m ? plainLyrics(m.body) : ""; }
    body.innerHTML = `${stepHead("details", "Details", "What goes into every file: the release, each song's credits and the cover. Filled in from your files' own tags where they had them.")}
      <div class="detailsGrid"><div class="grid2">
        <label class="f">Artist<input id="r_artist" value="${esc(r.artist)}" autocomplete="off"></label>
        <label class="f">${releaseKind(n) === "single" ? "Release title (the song's title if empty)" : `${releaseKind(n)} title`}<input id="r_title" value="${esc(r.title)}" autocomplete="off"></label>
        <label class="f">Year<input id="r_year" value="${esc(r.year)}" inputmode="numeric" maxlength="4"></label>
        <label class="f">Genre<select id="r_genre"></select></label>
        <label class="f">Label<input id="r_publisher" value="${esc(r.publisher)}" placeholder="Self-released" autocomplete="off"></label>
        <label class="f">Copyright<input id="r_copyright" value="${esc(r.copyright)}" placeholder="${esc(`${r.year} ${r.artist}`.trim())}" autocomplete="off"></label>
        <label class="f">UPC (optional)<input id="r_upc" value="${esc(r.upc)}" inputmode="numeric" autocomplete="off"></label>
      </div>
      <div><div class="cover${state.art ? " has" : ""}" id="cover" tabindex="0" role="button" aria-label="Cover art">${state.art ? `<img alt="Cover art" src="${state.art.url}">` : `<div>${icon("tag")}Drop the cover art here, or tap to choose (JPEG or PNG, 3000 px square is best)</div>`}</div>
        <input type="file" id="coverFile" accept="image/jpeg,image/png" hidden><div class="coverMeta">${state.art ? `<b>${state.art.img.width} x ${state.art.img.height} ${state.art.img.type.toUpperCase()}</b>${state.art.source ? "<br>" + esc(state.art.source) : ""}` : ""}</div></div></div>
      <div class="label">Songs</div>
      <div class="tableCard"><table class="tracks"><thead><tr><th></th><th>Title</th><th class="opt">Featuring</th><th class="opt">Written by</th><th>ISRC</th><th class="opt">Lyrics</th><th class="x">Explicit</th></tr></thead>
      <tbody id="trackRows">${state.songs.map((s, i) => `<tr data-i="${i}"><td class="n">${String(i + 1).padStart(2, "0")}</td><td><input data-k="title" value="${esc(s.title)}" aria-label="Title of song ${i + 1}"></td>
        <td class="opt"><input data-k="featuring" value="${esc(s.featuring)}" aria-label="Featuring"></td><td class="opt"><input data-k="composer" value="${esc(s.composer)}" aria-label="Written by"></td>
        <td><input data-k="isrc" value="${esc(s.isrc)}" placeholder="US-AB1-26-00001" aria-label="ISRC" class="mono"></td>
        <td class="opt"><select data-k="lyricsFrom" aria-label="Lyrics from Songbook" class="lyr"><option value="">${sb.length ? "None" : "None yet"}</option>${sb.map((x) => `<option value="${x.id}" ${s.lyricsFrom === x.id ? "selected" : ""}>${esc(x.title || "Untitled")}</option>`).join("")}</select></td><td class="x"><input type="checkbox" data-k="explicit" ${s.explicit ? "checked" : ""} aria-label="Explicit"></td></tr>`).join("")}</tbody></table></div>
      <p class="note">ISRCs come from your distributor or your country's ISRC agency. Leave them empty if you don't have them yet. Lyrics come from <a href="songbook.html">Songbook</a> and go into the files (players like Apple Music and foobar show them).</p>`;
    $("r_genre").append(new Option("(none)", ""));
    fillGenreSelect($("r_genre"));
    $("r_genre").value = r.genre || "";
    for (const k of ["artist", "title", "year", "genre", "publisher", "copyright", "upc"]) {
      $("r_" + k).addEventListener("input", (e) => { state.release[k] = e.target.value; state.typed.add(k); store.set("release", keepOnly(state.release)); invalidate(); renderSteps(); renderRelCard(); });
    }
    $("trackRows").addEventListener("input", (e) => {
      const inp = e.target, i = +inp.closest("tr").dataset.i, s = state.songs[i];
      s[inp.dataset.k] = inp.type === "checkbox" ? inp.checked : inp.value;
      if (inp.dataset.k === "lyricsFrom") { const m = songbookSongs().find((x) => x.id === inp.value); s.lyrics = m ? plainLyrics(m.body) : ""; }
      invalidate(); renderSongs(); renderSteps();
    });
    const cover = $("cover");
    cover.onclick = () => $("coverFile").click();
    cover.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("coverFile").click(); } };
    cover.ondragover = (e) => { e.preventDefault(); cover.classList.add("over"); };
    cover.ondragleave = () => cover.classList.remove("over");
    cover.ondrop = (e) => { e.preventDefault(); cover.classList.remove("over"); const f = e.dataTransfer.files[0]; if (f) coverFrom(f); };
    $("coverFile").onchange = () => { const f = $("coverFile").files[0]; $("coverFile").value = ""; if (f) coverFrom(f); };
    return;
  }
  if (state.step === "check") {
    const c = state.check, fresh = stepStatus(state).check === "done";
    const lede = `Last Call listens to exactly what you're about to release (${state.skipMaster ? "your files" : "the masters"}, with the details you typed) and checks it against what Spotify, Apple Music and distributors expect.`;
    if (!c || state.busy === "check") {
      body.innerHTML = `${stepHead("check", "Check", lede)}
        <div class="card"><div class="label">${state.busy === "check" ? "Listening" : "Ready when you are"}</div><div class="bar2"><i id="checkBar"></i></div><p class="note" id="checkNote">${state.busy === "check" ? "Listening..." : "Loudness, peaks, format, tags and cover art, for every song and the release as a whole."}</p>
        ${state.busy ? "" : `<div class="actRow"><button class="btn go" id="checkBtn" ${n ? "" : "disabled"}>Check the release</button></div>`}</div>`;
      $("checkBtn") && ($("checkBtn").onclick = runCheck);
      return;
    }
    const v = c.verdict, order = { fail: 0, warn: 1, note: 2, pass: 3 };
    const list = (checks) => [...checks].sort((a, b) => order[a.status] - order[b.status]).map((x) => `<div class="check"><span class="st ${x.status}">${STATUS[x.status]}</span>
      <div><b>${esc(x.title)}</b>: ${esc(x.value)}<div class="dim">${esc(x.detail || "")}</div>${x.fix && x.status !== "pass" ? `<div class="fix">How to fix: ${esc(x.fix)}</div>` : ""}</div></div>`).join("");
    const worstOf = (checks) => checks.reduce((w, x) => (order[x.status] < order[w] ? x.status : w), "pass");
    const passed = (checks) => checks.filter((x) => x.status === "pass").length;
    const all = [...c.album, c.cover, ...c.tracks.flatMap((t) => t.checks)].filter(Boolean);
    const ms = c.tracks.map((t) => t.m).filter((m) => m && Number.isFinite(m.lufs) && m.lufs > -70);
    const lu = ms.map((m) => m.lufs), tp = ms.map((m) => m.truePeakDb).filter(Number.isFinite);
    const secs = state.songs.reduce((a, s) => a + (s.seconds || 0), 0);
    const whole = [...c.album, c.cover].filter(Boolean);
    body.innerHTML = `${stepHead("check", "Check", "")}
      ${fresh ? "" : `<p class="note"><b>Something changed since this check.</b> <button class="btn" id="checkBtn">Check again</button></p>`}
      <div class="verdict ${v.key}"><span class="vi"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${VERDICT_ICON[v.key] || VERDICT_ICON.notes}</svg></span><div><b>${esc(v.label)}</b><span class="vs">${esc(v.summary)}</span></div></div>
      <div class="stats">${stat("Loudness", lu.length ? f1(lu.reduce((a, x) => a + x, 0) / lu.length) : "?", "LUFS", lu.length > 1 ? `${f1(Math.max(...lu) - Math.min(...lu))} LU between songs` : "integrated")}
        ${stat("True peak", tp.length ? f1(Math.max(...tp)) : "?", "dBTP", "the highest of any song", tp.length && Math.max(...tp) <= -1 ? "good" : "")}
        ${stat("Running time", fmtTime(secs), "", `${n} song${n > 1 ? "s" : ""}`)}
        ${stat("Checks passed", `${passed(all)}<span class="dim">/${all.length}</span>`, "", `${all.filter((x) => x.status === "warn" || x.status === "fail").length || "nothing"} to look at`, passed(all) === all.length ? "good" : "")}</div>
      <div class="resCols"><div>${whole.length ? `<details class="res" open><summary><span class="st ${worstOf(whole)}">${STATUS[worstOf(whole)]}</span><span class="rn">The whole ${releaseKind(n)}</span><span class="cnt">${passed(whole)}/${whole.length}</span></summary>${list(whole)}</details>` : ""}</div>
      <div>${c.tracks.map((t, i) => `<details class="res"${worstOf(t.checks) === "fail" || worstOf(t.checks) === "warn" ? " open" : ""}><summary><span class="st ${worstOf(t.checks)}">${STATUS[worstOf(t.checks)]}</span><span class="rn">${i + 1}. ${esc(t.name)}</span><span class="cnt">${passed(t.checks)}/${t.checks.length}</span></summary>${list(t.checks)}</details>`).join("")}
      <div class="actRow"><button class="btn" id="copyReport">Copy the report</button>${fresh ? `<button class="btn" id="checkBtn">Check again</button>` : ""}</div></div></div>`;
    $("checkBtn") && ($("checkBtn").onclick = runCheck);
    $("copyReport").onclick = () => navigator.clipboard?.writeText(c.text).then(() => toast("Report copied."), () => toast("Couldn't copy (your browser said no)."));
    return;
  }
  if (state.step === "release") {
    const est = (id) => { const p = PRESETS.find((x) => x.id === id); return state.songs.reduce((a, s) => a + estimate(p, s), 0); };
    const total = [...state.formats].reduce((a, id) => a + est(id), 0);
    const picked = RELEASE_FORMATS.filter((p) => state.formats.has(p.id)), folder = releaseFolder(state.release, state.songs);
    const checked = state.check && stepStatus(state).check === "done";
    body.innerHTML = `${stepHead("release", "Release", "Pick every format you need. You get one zip: a folder per format with every song tagged and numbered, plus the cover, a tracklist and the check report.")}
      <div class="relGrid"><div>
      <div class="formats" id="formats">${RELEASE_FORMATS.map((p) => `<button class="chip${state.formats.has(p.id) ? " on" : ""}" data-id="${p.id}" aria-pressed="${state.formats.has(p.id)}"><b>${esc(p.label)}</b><span>${esc(p.sub)}</span></button>`).join("")}</div>
      <p class="note">${state.formats.size ? `${state.formats.size} format${state.formats.size > 1 ? "s" : ""} for ${n} song${n > 1 ? "s" : ""}, about ${fmtBytes(total)}.` : "Pick at least one format."} Distributors usually want WAV (16 or 24-bit); MP3 is for sharing and your own site.</p>
      <div class="actRow"><button class="btn go" id="makeBtn" ${state.formats.size && n && !state.busy ? "" : "disabled"}>Make the release</button>
        ${window.EncoreStudio?.createRelease ? `<button class="btn" id="sendBtn" ${state.released ? "" : "disabled"}>Send to ENCORE.</button>` : ""}
        ${state.released ? `<button class="btn" id="againBtn">Download again</button>` : ""}</div>
      <div class="bar2 ${state.busy === "release" ? "" : "hidden"}"><i id="relBar"></i></div>
      <p class="note" id="relNote">${state.released ? `Done: ${esc(state.released.name)}, ${fmtBytes(state.released.blob.size)}.` : ""}</p>
      ${checked ? "" : `<p class="note">Tip: run <b>Check</b> first so the report in the zip matches what you release.</p>`}
      </div>
      <div class="card zip"><div class="zh"><div class="label">What's in the zip</div><b>${esc(folder)}.zip</b><span class="mono">${n ? `about ${fmtBytes(total)}` : ""}</span></div>
        <ul>${picked.map((p, k) => `<li class="dir">${FOLDER}<span class="zn">${esc(p.label)}</span><span class="zs">${n} file${n > 1 ? "s" : ""}, ${fmtBytes(est(p.id))}</span></li>` +
            (k ? "" : state.songs.slice(0, 3).map((s, i) => `<li class="sub">${FILE}<span class="zn">${esc(releasePath(state.release, state.songs, i, p.id).split("/").pop())}</span><span class="zs"></span></li>`).join("") + (n > 3 ? `<li class="sub"><span></span><span class="zn dim">and ${n - 3} more</span><span></span></li>` : ""))).join("")}
          ${state.art ? `<li>${FILE}<span class="zn">cover.${state.art.mime === "image/png" ? "png" : "jpg"}</span><span class="zs">${fmtBytes(state.art.bytes.length)}</span></li>` : ""}
          <li>${FILE}<span class="zn">tracklist.txt</span><span class="zs"></span></li>
          ${checked ? `<li>${FILE}<span class="zn">Last Call report.txt</span><span class="zs"></span></li>` : ""}</ul></div>
      </div>`;
    $("formats").onclick = (e) => { const b = e.target.closest(".chip"); if (!b) return; const id = b.dataset.id; state.formats.has(id) ? state.formats.delete(id) : state.formats.add(id); saveSettings(); state.released = null; render(); };
    $("makeBtn").onclick = makeRelease;
    $("againBtn") && ($("againBtn").onclick = () => download(state.released));
    $("sendBtn") && ($("sendBtn").onclick = sendToEncore);
  }
}
function estimate(p, s) {
  const pl = plan(p, srcOf(s));
  const k = FORMATS[pl.kind];
  if (k.lossy) return s.seconds * pl.kbps * 125;
  const pcm = s.seconds * pl.rate * pl.channels * (pl.bits / 8);
  return pl.kind === "flac" ? pcm * 0.58 : pl.kind === "alac" ? pcm * 0.6 : pcm;
}
async function coverFrom(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const png = bytes[0] === 0x89 && bytes[1] === 0x50, jpg = bytes[0] === 0xff && bytes[1] === 0xd8;
  if (!png && !jpg) { toast("Cover art needs to be a JPEG or PNG."); return; }
  setArt(bytes, png ? "image/png" : "image/jpeg", file.name);
  invalidate(); render();
}
function setArt(bytes, mime, source) {
  if (state.art?.url) URL.revokeObjectURL(state.art.url);
  state.art = { bytes, mime, source, img: imageInfo(bytes), url: URL.createObjectURL(new Blob([bytes], { type: mime })) };
}

// ---------- check (Last Call) ----------
// what each song releases as: the master, or the file itself when mastering is skipped
const releaseBlob = (s) => (!state.skipMaster && s.master ? s.master.blob : s.blob);
function srcOf(s) {
  if (!state.skipMaster && s.master) return { fs: s.fs, channels: 2, bitDepth: 32, float: true, lossy: false, label: "master" };
  const i = s.info || {};
  return { fs: s.fs || i.sampleRate || 44100, channels: 2, bitDepth: i.bitDepth || 0, float: !!i.float, lossy: i.lossy ?? true, label: i.label || "audio" };
}
async function runCheck() {
  if (state.busy || !state.songs.length) return;
  if (!state.skipMaster && state.songs.some((s) => !(s.master && s.master.key === masterKey(s)))) {
    if (!confirm("Some songs aren't mastered with the current settings yet. Master them first? (Cancel checks the unmastered mixes instead.)")) state.skipMaster = true;
    else { go("master"); await masterAll(); state.step = "check"; }
  }
  state.busy = "check"; render();
  const songs = state.songs.filter((s) => s.blob), tracks = [];
  try {
    for (let i = 0; i < songs.length; i++) {
      const s = songs[i], d = decodeWav(await releaseBlob(s).arrayBuffer());
      $("checkNote") && ($("checkNote").textContent = `Listening to ${s.title} (${i + 1} of ${songs.length})...`);
      const r = await oneShot("lastcall-worker.js", { id: 1, chans: d.chans, fs: d.fs, bitDepth: 24, float: false }, d.chans.map((c) => c.buffer),
        (f) => { const bar = $("checkBar"); if (bar) bar.style.width = `${Math.round(((i + f) / songs.length) * 100)}%`; });
      const meta = songMeta(state.release, state.songs, state.songs.indexOf(s));
      tracks.push({ name: s.title, m: r.m, info: releaseInfo(meta, d.fs, s.seconds, state.art) });
    }
    const alb = tracks.length > 1 ? albumChecks(tracks) : { checks: [] };
    tracks.forEach((t, i) => { t.checks = buildChecks(t.m, t.info, { segueIn: i > 0 && isSegue(tracks[i - 1].m, t.m), segueOut: i + 1 < tracks.length && isSegue(t.m, tracks[i + 1].m) }); });
    const cover = coverCheck(state.art?.img || null, state.art?.source || "");
    const all = [...alb.checks, cover, ...tracks.flatMap((t) => t.checks)];
    state.check = { tracks, album: alb.checks, cover, verdict: verdict(all), text: reportText({ tracks, album: alb.checks, cover }) };
    state.checked = true; state.checkedKey = checkKey(state);
    setStatus(state.check.verdict.label + ".");
  } catch (err) {
    setStatus("The check stopped: " + (err.message || err));
  }
  state.busy = ""; render();
}

// ---------- release ----------
async function makeRelease() {
  if (state.busy) return;
  const songs = state.songs.filter((s) => s.blob), formats = RELEASE_FORMATS.filter((p) => state.formats.has(p.id));
  if (!songs.length || !formats.length) return;
  if (!state.skipMaster && songs.some((s) => !(s.master && s.master.key === masterKey(s)))) {
    if (!confirm("Some songs aren't mastered with the current settings. Release the unmastered mixes for those? (Cancel to go master them first.)")) { go("master"); return; }
  }
  state.busy = "release"; state.released = null; render();
  const entries = [], failed = new Set(), total = songs.length * formats.length, folder = releaseFolder(state.release, state.songs), rows = [];
  let done = 0;
  const bar = () => $("relBar"), note = (t) => { const n = $("relNote"); if (n) n.textContent = t; };
  try {
    for (const s of songs) {
      const i = state.songs.indexOf(s), meta = songMeta(state.release, state.songs, i), art = state.art ? { bytes: state.art.bytes, mime: state.art.mime } : null;
      const d = decodeWav(await releaseBlob(s).arrayBuffer());
      for (const p of formats) {
        note(`${s.title}: ${p.label} (${done + 1} of ${total})`);
        const pl = plan(p, srcOf(s)), chans = d.chans.map((c) => c.slice());
        try {
          const r = await oneShot("convert-worker.js", { chans, fs: d.fs, plan: pl, opts: { start: 0, end: 0, fadeIn: 0, fadeOut: 0, normalize: "off" }, meta, art }, chans.map((c) => c.buffer),
            (f) => { const b = bar(); if (b) b.style.width = `${Math.round(((done + f) / total) * 100)}%`; });
          entries.push({ name: releasePath(state.release, state.songs, i, p.id), blob: r.blob });
        } catch (err) { failed.add(`${p.label} (${err.message || err})`); }
        done++;
      }
      rows.push({ title: s.title, featuring: s.featuring, composer: s.composer, isrc: s.isrc, explicit: s.explicit, seconds: s.seconds,
        lufs: !state.skipMaster && s.master ? s.master.lufs : s.origLufs, peakDb: !state.skipMaster && s.master ? s.master.peakDb : s.origPeakDb });
    }
    note("Packing the zip...");
    if (state.art) entries.push({ name: `${folder}/cover.${state.art.mime === "image/png" ? "png" : "jpg"}`, blob: new Blob([state.art.bytes], { type: state.art.mime }) });
    entries.push({ name: `${folder}/tracklist.txt`, blob: new Blob([tracklistText({ ...state.release, title: state.release.title || (state.songs.length === 1 ? state.songs[0].title : "") }, rows)], { type: "text/plain" }) });
    if (state.check && stepStatus(state).check === "done") entries.push({ name: `${folder}/Last Call report.txt`, blob: new Blob([state.check.text.replace(/\n/g, "\r\n")], { type: "text/plain" }) });
    const blob = await zip(entries);
    state.released = { name: `${folder}.zip`, blob, url: URL.createObjectURL(blob), files: entries };
    download(state.released);
    setStatus(failed.size ? `Your release is downloading, without ${[...failed].join(", ")}.` : "Your release is downloading.");
  } catch (err) {
    setStatus("Making the release stopped: " + (err.message || err));
  }
  state.busy = ""; render();
}
function download(r) { const a = document.createElement("a"); a.href = r.url; a.download = r.name; document.body.appendChild(a); a.click(); a.remove(); }
// on the ENCORE. site the page provides this hook; here it isn't there and the button stays hidden
async function sendToEncore() {
  const hook = window.EncoreStudio?.createRelease;
  if (!hook || !state.released) return;
  try { await hook({ release: state.release, songs: state.songs.map((s, i) => songMeta(state.release, state.songs, i)) }, state.released.files); toast("Sent to ENCORE."); }
  catch (err) { toast("ENCORE. didn't take it: " + (err.message || err)); }
}

// ---------- little things ----------
// anything that changes the files (audio, tags, cover) means the last zip is out of date
function invalidate() { state.released = null; }
function setStatus(t) { $("status").textContent = t; }
let toastTimer = 0;
function toast(t) {
  let el = document.querySelector(".toast");
  if (!el) { el = document.createElement("div"); el.className = "toast"; el.setAttribute("role", "status"); document.body.appendChild(el); }
  el.textContent = t; clearTimeout(toastTimer); toastTimer = setTimeout(() => el.remove(), 2600);
}
window.addEventListener("beforeunload", (e) => { if (state.songs.length && !state.released) { e.preventDefault(); e.returnValue = ""; } });

render();
setStatus("Start by adding your songs.");
