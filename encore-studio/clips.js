// ENCORE. Clips: drop in a finished song, get promo videos ready to post.
// The page: your song, art and words on the left; the video preview, the hook finder
// and the waveform in the middle; looks, lyric timing and export on the right.
// Everything runs in this browser. Nothing is uploaded.
import { FORMATS, FORMAT_ORDER, CLIP_LENGTHS, CANVAS_MIN, CANVAS_MAX, ACCENTS, BACKGROUNDS, LOOKS, looksFor, MIN_CLIP, MAX_CLIP, analyzeSong, suggestClips, lyricLines, songParts, lineTimes, activeLine,
  formatTime, parseTime, clampClip, fileName, paletteFrom, safeRects, pickSettings, mergeSettings } from "./clips-core.js";
import { drawFrame, placeholderCover } from "./clips-draw.js";
import { recordVideo, clipBuffer, pickMime, canRecord, inspectVideo } from "./clips-export.js";
import { decodeAudio, ACCEPT } from "./audio-decode.js";
import { toLyrics } from "./songbook-core.js";

const $ = (id) => document.getElementById(id);
const SETTINGS_KEY = "encore-clips-settings";

// ---------- state ----------
let saved = null;
try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null"); } catch {}
const state = mergeSettings({ artist: "", cta: "Out now", ctaCustom: "", fmt: "vertical", look: "spotlight", canvasLook: "drift", len: 30, canvasLen: 6,
  showTitle: true, showCta: true, showDate: true, showLyrics: true, canvasText: false, safe: false, safeWhich: "all", showMark: true }, saved);
let saveTimer = 0;
const remember = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(pickSettings(state))); } catch {} }, 300); };

const song = { name: "", chans: null, fs: 0, duration: 0, an: null, buffer: null, picks: [], pick: -1 };
const cover = { img: null, id: 0, palette: null, fromFile: false };
let accent = "";                       // "" = from the cover
let bgPick = "";                       // "" = from the cover
const clip = { start: 0, end: 30 };
const words = { lines: [], timed: [], mode: "even" };
let title = "", date = "";
let previewT = 0;                      // song seconds shown in the preview
const caches = {};                     // per format: the blurred backdrop
let placeholder = null, placeholderKey = "";

// ---------- small helpers ----------
let toastTimer = 0;
function toast(msg, ms = 2600) {
  let t = document.querySelector(".toast");
  if (!t) { t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); document.body.append(t); }
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}
function status(msg, err = false) { const s = $("status"); s.textContent = msg; s.classList.toggle("err", err); }
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const fmtNow = () => FORMATS[state.fmt];
const isCanvas = () => state.fmt === "canvas";
const clipLen = () => clip.end - clip.start;
const ctaText = () => (state.cta === "custom" ? state.ctaCustom.trim() : state.cta);

function coverImage() {
  if (cover.img) return cover.img;
  const key = title + "|" + (accent || "#ff3b00");
  if (placeholderKey !== key) { placeholder = placeholderCover(title, accent || "#ff3b00"); placeholderKey = key; }
  return placeholder;
}
function colors() {
  const p = cover.palette;
  return { accent: accent || p?.accent || "#ff3b00", bg: bgPick || p?.bg || "#14110f" };
}
/** Everything a frame needs, for a format (export takes a copy so later edits don't change a video being made) */
function scene(fmt = state.fmt, snapshot = false) {
  const sc = {
    fmt, look: state.look, canvasLook: state.canvasLook, cover: coverImage(), placeholder: !cover.img, coverId: cover.img ? cover.id : "ph" + placeholderKey,
    colors: colors(), title, artist: state.artist.trim(), cta: ctaText(), date: date.trim(),
    show: { title: state.showTitle, cta: state.showCta, date: state.showDate, lyrics: state.showLyrics },
    lyrics: { lines: words.lines.slice(), timed: words.mode === "timed" ? words.timed.slice() : null },
    clip: { start: clip.start, end: clip.end }, an: song.an, canvasLen: state.canvasLen, canvasText: state.canvasText, mark: state.showMark,
  };
  sc.cache = snapshot ? {} : (caches[fmt] ||= {});
  return sc;
}

// ---------- audio playback ----------
let actx = null;
const audioCtx = () => (actx ||= new AudioContext());
let playing = null;   // { src, gain, t0, from, to, kind }
function songBuffer() {
  if (song.buffer) return song.buffer;
  const a = audioCtx(), b = a.createBuffer(Math.min(2, song.chans.length), song.chans[0].length, song.fs);
  for (let c = 0; c < b.numberOfChannels; c++) b.copyToChannel(song.chans[c], c);
  return (song.buffer = b);
}
function stopPlay() {
  if (!playing) return;
  try { playing.src.onended = null; playing.src.stop(); } catch {}
  const kind = playing.kind;
  playing = null;
  if (kind === "tap") endTap();
  updatePlay();
  previewT = Math.min(Math.max(previewT, clip.start), clip.end);
  requestDraw();
}
function playFrom(from, to, kind = "clip") {
  stopPlay();
  if (!song.chans) return;
  const a = audioCtx(); a.resume();
  const src = a.createBufferSource(), gain = a.createGain();
  src.buffer = songBuffer(); src.connect(gain); gain.connect(a.destination);
  const t0 = a.currentTime + 0.05, len = to - from;
  if (kind === "clip") {   // the same short fades the video gets
    gain.gain.setValueAtTime(0, t0); gain.gain.linearRampToValueAtTime(1, t0 + Math.min(0.2, len / 4));
    gain.gain.setValueAtTime(1, t0 + len - Math.min(0.9, len / 3)); gain.gain.linearRampToValueAtTime(0, t0 + len);
  }
  src.start(t0, from, len);
  src.onended = () => { if (playing?.src === src) stopPlay(); };
  playing = { src, gain, t0, from, to, kind };
  updatePlay();
}
const playPos = () => (playing ? Math.min(playing.to, playing.from + Math.max(0, actx.currentTime - playing.t0)) : previewT);
function updatePlay() {
  const b = $("play");
  b.disabled = !song.chans && !isCanvas();
  b.innerHTML = playing || loopPlaying ? "&#10074;&#10074; Stop" : isCanvas() ? "&#9654; Play loop" : "&#9654; Play clip";
}
let loopPlaying = false, loopT0 = 0;
function togglePlay() {
  if (isCanvas()) { loopPlaying = !loopPlaying; loopT0 = performance.now(); updatePlay(); requestDraw(); return; }
  if (playing) stopPlay(); else playFrom(clip.start, clip.end);
}

// ---------- loading a song ----------
async function loadAudio(file) {
  if (!file) return;
  stopPlay();
  status(`Opening ${file.name}...`);
  $("audioDrop").classList.remove("over");
  try {
    const d = await decodeAudio(file, null, (m) => status(m));
    const info = d.info;
    song.name = file.name; song.chans = d.chans; song.fs = d.fs; song.duration = d.chans[0].length / d.fs; song.buffer = null;
    // the file's own title, artist and art fill in anything still empty
    const tg = info?.tags || {};
    if (tg.title && (!title || $("title").dataset.auto)) { title = tg.title.trim(); $("title").value = title; $("title").dataset.auto = "1"; }
    if (tg.artist && !state.artist) { state.artist = tg.artist.trim(); $("artist").value = state.artist; remember(); }
    if (info?.art?.bytes?.length && (!cover.img || cover.fromFile)) {
      try { await setCover(new Blob([info.art.bytes], { type: info.art.mime || "image/jpeg" }), true); } catch {}
    }
    if (!title) { title = file.name.replace(/\.[^.]+$/, "").replace(/^\d+[\s._-]+/, "").replace(/[_]+/g, " ").trim(); $("title").value = title; $("title").dataset.auto = "1"; }
    status("Finding the best parts...");
    await new Promise((r) => setTimeout(r, 30));
    const t = performance.now();
    song.an = analyzeSong(song.chans, song.fs);
    console.debug(`Clips: analysed in ${Math.round(performance.now() - t)} ms`);
    $("audioDrop").classList.add("loaded");
    $("audioDrop").innerHTML = `<span style="min-width:0"><b>${esc(file.name)}</b><span class="small dim" style="display:block">${formatTime(song.duration)} long${info?.label ? ", " + esc(info.label) : ""}</span></span><span class="btn sm">Change</span>`;
    status("");
    thumbsSoon();
    $("stageEmpty").classList.add("hidden");
    refreshPicks(true);
    updateAll();
  } catch (e) {
    console.warn(e);
    status(e.message || "Couldn't open that file.", true);
  }
}
function refreshPicks(choose = false) {
  if (!song.an) return;
  const len = isCanvas() ? state.len : clipLen() || state.len;
  song.picks = suggestClips(song.an.hooks, Math.min(len, song.duration));
  if (choose && song.picks.length) usePick(0, false);
  renderHooks();
}
function usePick(i, play = false) {
  const p = song.picks[i];
  if (!p) return;
  song.pick = i;
  setClip(p.start, state.len, false);
  song.pick = i;
  renderHooks();
  if (play) playFrom(clip.start, clip.end);
}
function setClip(start, len, clearPick = true) {
  const c = clampClip(start, len, song.duration || Math.max(len, 1), Math.min(MIN_CLIP, song.duration || MIN_CLIP), MAX_CLIP);
  clip.start = c.start; clip.end = c.end;
  if (clearPick) song.pick = song.picks.findIndex((p) => Math.abs(p.start - clip.start) < 0.3);
  previewT = clip.start + Math.min(4, clipLen() / 3);
  if (words.mode === "even") renderLines();
  renderHooks(); renderLen(); drawWave(); requestDraw(); updateWhat(); thumbsSoon();
}

// ---------- cover art ----------
async function setCover(blob, fromFile = false) {
  const img = await createImageBitmap(blob);
  if (!img.width || !img.height) throw new Error("That picture is empty.");
  cover.img = img; cover.id++; cover.fromFile = fromFile;
  const c = document.createElement("canvas"); c.width = c.height = 48;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(img, 0, 0, 48, 48);
  cover.palette = paletteFrom(g.getImageData(0, 0, 48, 48).data);
  accent = "";
  const btn = $("coverBtn"); btn.textContent = "";
  const th = document.createElement("canvas"); th.width = th.height = 152;
  const tg = th.getContext("2d"), k = Math.max(152 / img.width, 152 / img.height);
  tg.drawImage(img, (152 - img.width * k) / 2, (152 - img.height * k) / 2, img.width * k, img.height * k);
  btn.append(th);
  $("coverClear").classList.remove("hidden");
  $("coverNote").textContent = fromFile ? "from your song file" : img.width < 640 ? `${img.width}x${img.height}, a bigger picture will look sharper` : "";
  renderSwatches(); requestDraw(); thumbsSoon();
}
function clearCover() {
  cover.img = null; cover.palette = null; cover.fromFile = false; cover.id++; accent = "";
  $("coverBtn").innerHTML = "Drop or<br>pick art"; $("coverClear").classList.add("hidden"); $("coverNote").textContent = "";
  renderSwatches(); requestDraw(); thumbsSoon();
}
async function coverFromFile(file) {
  try { await setCover(file, false); } catch { toast("That file isn't a picture this browser can open."); }
}

// ---------- preview ----------
const view = $("view"), vctx = view.getContext("2d");
let needDraw = true;
const requestDraw = () => { needDraw = true; };
function sizeView() {
  const st = $("stage"), f = fmtNow(), cs = getComputedStyle(st);
  const aw = st.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), ah = st.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  if (aw <= 0 || ah <= 0) return;
  const k = Math.min(aw / f.w, ah / f.h), w = Math.floor(f.w * k), h = Math.floor(f.h * k), dpr = Math.min(2, window.devicePixelRatio || 1);
  view.style.width = w + "px"; view.style.height = h + "px";
  const bw = Math.min(f.w, Math.round(w * dpr)), bh = Math.round(bw * f.h / f.w);
  if (view.width !== bw || view.height !== bh) { view.width = bw; view.height = bh; }
  requestDraw();
}
new ResizeObserver(() => { sizeView(); drawWave(); }).observe($("stage"));
new ResizeObserver(() => drawWave()).observe($("wave"));

function drawPreview(t) {
  const f = fmtNow(), k = view.width / f.w;
  vctx.setTransform(k, 0, 0, k, 0, 0);
  drawFrame(vctx, scene(), t);
  if (state.safe && f.safe) {
    for (const r of safeRects(state.safeWhich, f.w, f.h)) {
      vctx.fillStyle = "rgb(255 59 0 / 0.22)"; vctx.fillRect(r.x, r.y, r.w, r.h);
      vctx.strokeStyle = "rgb(255 108 64 / 0.9)"; vctx.lineWidth = 3 / k; vctx.setLineDash([16, 10]); vctx.strokeRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4); vctx.setLineDash([]);
      vctx.font = `700 ${Math.round(30)}px "DM Sans", sans-serif`; vctx.fillStyle = "#fff"; vctx.textBaseline = "top"; vctx.textAlign = r.w < 300 ? "right" : "left";
      if (r.w < 300) { vctx.save(); vctx.translate(r.x + r.w / 2 + 10, r.y + 20); vctx.rotate(Math.PI / 2); vctx.textAlign = "left"; vctx.fillText(r.label, 0, 0); vctx.restore(); }
      else vctx.fillText(r.label, r.x + 24, r.y + Math.max(12, r.h / 2 - 15));
    }
  }
}
function frame() {
  const animating = !!playing || (isCanvas() && loopPlaying);
  if (playing) previewT = playPos();
  if (animating || needDraw) {
    needDraw = false;
    if (isCanvas()) drawPreview(loopPlaying ? ((performance.now() - loopT0) / 1000) % state.canvasLen : state.canvasLen * 0.3);
    else drawPreview(previewT);
    updateTime();
    if (playing) { drawWave(); if (tap.on) markNowLine(); }
  }
  requestAnimationFrame(frame);
}
function updateTime() {
  if (isCanvas()) { $("time").textContent = `${state.canvasLen} s loop`; return; }
  $("time").textContent = `${formatTime(Math.max(0, previewT - clip.start))} / ${formatTime(clipLen())}`;
}

// ---------- waveform with the clip box ----------
const wave = $("wave"), wctx = wave.getContext("2d");
function drawWave() {
  const dpr = Math.min(2, window.devicePixelRatio || 1), w = wave.clientWidth, h = wave.clientHeight;
  if (!w || !h) return;
  if (wave.width !== Math.round(w * dpr)) { wave.width = Math.round(w * dpr); wave.height = Math.round(h * dpr); }
  wctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  wctx.clearRect(0, 0, w, h);
  const an = song.an;
  if (!an) {
    wctx.fillStyle = "rgb(242 239 232 / 0.12)";
    for (let x = 4; x < w - 4; x += 4) { const v = 0.15 + 0.12 * Math.sin(x * 0.05) * Math.sin(x * 0.013); wctx.fillRect(x, h / 2 - v * h / 2, 2, v * h); }
    return;
  }
  const D = an.duration, X = (t) => (t / D) * w;
  const sx = X(clip.start), ex = X(clip.end);
  // the song
  const per = an.peaks.length / w;
  for (let x = 0; x < w; x += 2) {
    let m = 0; for (let k = Math.floor(x * per), e = Math.floor((x + 2) * per); k < e && k < an.level.length; k++) m = Math.max(m, an.level[k]);
    const bh = Math.max(1, m ** 1.5 * (h - 18));
    wctx.fillStyle = x >= sx && x <= ex ? "rgb(242 239 232 / 0.9)" : "rgb(242 239 232 / 0.32)";
    wctx.fillRect(x, 9 + (h - 18 - bh) / 2, 1.5, bh);
  }
  // the suggestions
  if (!isCanvas()) song.picks.forEach((p, i) => {
    const x = X(p.start);
    wctx.fillStyle = i === song.pick ? "#ff3b00" : "rgb(255 59 0 / 0.55)";
    wctx.beginPath(); wctx.arc(x + 8, 9, 7, 0, Math.PI * 2); wctx.fill();
    wctx.fillStyle = "#fff"; wctx.font = "800 10px 'DM Sans', sans-serif"; wctx.textAlign = "center"; wctx.textBaseline = "middle"; wctx.fillText(String(i + 1), x + 8, 9.5);
  });
  // the clip box
  if (!isCanvas()) {
    wctx.fillStyle = "rgb(255 59 0 / 0.16)"; wctx.fillRect(sx, 0, ex - sx, h);
    wctx.strokeStyle = "#ff3b00"; wctx.lineWidth = 2; wctx.strokeRect(sx + 1, 1, Math.max(2, ex - sx - 2), h - 2);
    wctx.fillStyle = "#ff3b00";
    for (const x of [sx, ex]) { wctx.fillRect(x - 3, h / 2 - 12, 6, 24); }
    wctx.fillStyle = "#fff"; wctx.font = "700 11px 'Space Mono', monospace"; wctx.textBaseline = "bottom";
    wctx.textAlign = sx > w - 90 ? "right" : "left"; wctx.fillText(formatTime(clip.start), sx > w - 90 ? ex - 8 : sx + 8, h - 3);
    // playhead
    if (playing || previewT > clip.start + 0.01) { const px = X(playing ? playPos() : previewT); wctx.fillStyle = "#fff"; wctx.fillRect(px - 1, 2, 2, h - 4); }
  } else {
    wctx.fillStyle = "rgb(17 14 13 / 0.88)"; wctx.fillRect(0, 0, w, h);
    wctx.fillStyle = "rgb(242 239 232 / 0.8)"; wctx.font = "600 12.5px 'DM Sans', sans-serif"; wctx.textAlign = "center"; wctx.textBaseline = "middle";
    wctx.fillText(w < 420 ? "No song part needed for a Canvas" : "A Canvas is silent and loops, so no part of the song is needed", w / 2, h / 2);
  }
}
{
  let drag = null;
  const tAt = (e) => { const r = wave.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * song.duration; };
  wave.addEventListener("pointerdown", (e) => {
    if (!song.an || isCanvas()) return;
    const r = wave.getBoundingClientRect(), x = e.clientX - r.left, X = (t) => (t / song.duration) * r.width;
    const sx = X(clip.start), ex = X(clip.end), grab = e.pointerType === "touch" ? 16 : 8, t = tAt(e);
    if (Math.abs(x - sx) <= grab) drag = { mode: "start" };
    else if (Math.abs(x - ex) <= grab) drag = { mode: "end" };
    else if (x > sx && x < ex) drag = { mode: "move", off: t - clip.start };
    else { stopPlay(); setClip(t - clipLen() / 2, clipLen()); drag = { mode: "move", off: clipLen() / 2 }; }
    wave.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  wave.addEventListener("pointermove", (e) => {
    if (!song.an || isCanvas()) return;
    const t = tAt(e);
    if (!drag) {
      const r = wave.getBoundingClientRect(), x = e.clientX - r.left, X = (q) => (q / song.duration) * r.width;
      wave.style.cursor = Math.abs(x - X(clip.start)) <= 8 || Math.abs(x - X(clip.end)) <= 8 ? "ew-resize" : x > X(clip.start) && x < X(clip.end) ? "grab" : "pointer";
      return;
    }
    if (playing) stopPlay();
    if (drag.mode === "move") setClip(t - drag.off, clipLen());
    else if (drag.mode === "start") { const end = clip.end, s = Math.min(t, end - MIN_CLIP); setClip(Math.max(s, end - MAX_CLIP), end - Math.max(s, end - MAX_CLIP)); }
    else { const e2 = Math.max(t, clip.start + MIN_CLIP); setClip(clip.start, Math.min(e2, clip.start + MAX_CLIP) - clip.start); }
  });
  const end = () => { if (drag && drag.mode !== "move") { state.len = Math.round(clipLen()); remember(); refreshPicks(false); renderLen(); } drag = null; };
  wave.addEventListener("pointerup", end); wave.addEventListener("pointercancel", end);
}

// ---------- hooks and length ----------
function renderHooks() {
  const box = $("hooks");
  if (isCanvas()) { box.innerHTML = `<span class="lead">Canvas</span><span class="small dim">A short silent loop of your cover for Spotify. Pick a look on the right.</span>`; return; }
  if (!song.an) return;
  box.innerHTML = `<span class="lead">Best parts</span>` + song.picks.map((p, i) => `<button class="hook${i === song.pick ? " on" : ""}" data-i="${i}" type="button" title="${esc(p.why)}. Click to use it, double-click to hear it."><i>${i + 1}</i><b>${formatTime(p.start)}</b><span>${esc(p.why)}</span></button>`).join("");
}
$("hooks").addEventListener("click", (e) => { const b = e.target.closest(".hook"); if (b) usePick(+b.dataset.i, false); });
$("hooks").addEventListener("dblclick", (e) => { const b = e.target.closest(".hook"); if (b) usePick(+b.dataset.i, true); });
function renderLen() {
  const seg = $("lenSeg");
  if (isCanvas()) {
    $("lenLabel").textContent = "Loop";
    seg.classList.add("slide");
    if (!$("canvasLen")) seg.innerHTML = `<input type="range" id="canvasLen" min="${CANVAS_MIN}" max="${CANVAS_MAX}" step="0.5" aria-label="Loop length in seconds"><output id="canvasLenOut"></output>`;
    $("canvasLen").value = state.canvasLen; $("canvasLenOut").textContent = state.canvasLen + " s";
    return;
  }
  $("lenLabel").textContent = "Length";
  const L = Math.round(clipLen()), custom = !CLIP_LENGTHS.includes(L);
  seg.classList.remove("slide");
  seg.innerHTML = CLIP_LENGTHS.map((s) => `<button data-l="${s}" class="${s === L ? "on" : ""}" type="button" ${song.duration && s > song.duration + 0.5 ? "disabled" : ""}>${s} s</button>`).join("") + (custom && song.an ? `<button class="on" type="button" disabled>${L} s</button>` : "");
}
$("lenSeg").addEventListener("input", (e) => {
  if (e.target.id !== "canvasLen") return;
  state.canvasLen = +e.target.value; $("canvasLenOut").textContent = state.canvasLen + " s"; loopT0 = performance.now();
  remember(); requestDraw(); updateWhat(); thumbsSoon();
});
$("lenSeg").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-l]"); if (!b) return;
  const L = +b.dataset.l;
  stopPlay();
  state.len = L; remember();
  if (song.an) {
    // keep the same hook if one was chosen, otherwise grow from the same start
    const was = song.pick;
    song.picks = suggestClips(song.an.hooks, Math.min(L, song.duration));
    if (was >= 0 && song.picks[was]) usePick(was); else setClip(clip.start, L);
  } else { clip.end = clip.start + L; renderLen(); updateWhat(); }
});

// ---------- formats ----------
function setFormat(f) {
  stopPlay(); loopPlaying = false;
  state.fmt = f; remember();
  for (const b of $("fmtSeg").children) b.classList.toggle("on", b.dataset.f === f);
  const F = fmtNow();
  $("fmtNote").textContent = `${F.w}x${F.h}, ${F.where}`;
  $("safeWrap").classList.toggle("hidden", !F.safe);
  $("textOpts").classList.toggle("hidden", isCanvas());
  $("canvasOpts").classList.toggle("hidden", !isCanvas());
  $("stageEmpty").classList.toggle("hidden", !!song.an || isCanvas());
  sizeView(); renderLooks(); renderHooks(); renderLen(); drawWave(); updatePlay(); updateWhat(); requestDraw();
}
$("fmtSeg").addEventListener("click", (e) => { const b = e.target.closest("button[data-f]"); if (b) setFormat(b.dataset.f); });
$("safe").addEventListener("change", (e) => { state.safe = e.target.checked; remember(); requestDraw(); });

// ---------- looks ----------
function renderLooks() {
  const list = looksFor(state.fmt), cur = isCanvas() ? state.canvasLook : state.look, F = fmtNow();
  $("looks").innerHTML = list.map((l) => `<button class="lookBtn${l.id === cur ? " on" : ""}" data-look="${l.id}" type="button" aria-pressed="${l.id === cur}"><div class="th"><canvas width="${F.w > F.h ? 176 : F.w === F.h ? 104 : 60}" height="${F.w > F.h ? 99 : 104}"></canvas></div><b>${l.label}</b><span>${l.about}</span></button>`).join("");
  $("lookNote").textContent = isCanvas() ? "for a Canvas" : "";
  thumbsSoon();
}
$("looks").addEventListener("click", (e) => {
  const b = e.target.closest(".lookBtn"); if (!b) return;
  if (isCanvas()) state.canvasLook = b.dataset.look; else state.look = b.dataset.look;
  remember();
  for (const x of $("looks").children) { x.classList.toggle("on", x === b); x.setAttribute("aria-pressed", x === b); }
  requestDraw(); updateWhat();
});
let thumbTimer = 0;
function thumbsSoon() { clearTimeout(thumbTimer); thumbTimer = setTimeout(drawThumbs, 180); }
function drawThumbs() {
  const F = fmtNow();
  for (const b of $("looks").children) {
    const c = b.querySelector("canvas"), g = c.getContext("2d"), k = Math.max(c.width / F.w, c.height / F.h) * 2;
    c.width = Math.round(F.w * k); c.height = Math.round(F.h * k); c.style.aspectRatio = `${F.w} / ${F.h}`;
    g.setTransform(k, 0, 0, k, 0, 0);
    const sc = scene(); if (isCanvas()) sc.canvasLook = b.dataset.look; else sc.look = b.dataset.look;
    sc.cache = (caches["thumb" + state.fmt] ||= {});
    try { drawFrame(g, sc, isCanvas() ? state.canvasLen * 0.3 : clip.start + Math.min(4, clipLen() / 3)); } catch (e) { console.warn(e); }
  }
}

// ---------- colours ----------
const swatchRow = (list, cur, kind) => list.map((c) => `<button class="sw${cur === c ? " on" : ""}" data-k="${kind}" data-c="${c}" style="background:${c}" type="button" aria-label="${kind === "bg" ? "Background" : "Accent"} colour ${c}" aria-pressed="${cur === c}"></button>`).join("");
const customSw = (id, val, label) => `<label class="sw custom" title="${label}"><input type="color" id="${id}" value="${val}" aria-label="${label}"></label>`;
function renderSwatches() {
  const p = cover.palette, cur = colors();
  const fromCover = p ? p.swatches.filter((c) => !ACCENTS.includes(c)) : [];
  $("swatches").innerHTML = `<button class="sw auto${!accent ? " on" : ""}" data-k="accent" data-c="" type="button" title="Pick from the cover">Auto</button>` +
    swatchRow(fromCover, accent, "accent") + (fromCover.length ? `<span class="swsep" aria-hidden="true"></span>` : "") +
    swatchRow(ACCENTS, accent, "accent") + customSw("customColor", cur.accent, "Your own accent colour");
  const coverBg = p?.bg && !BACKGROUNDS.includes(p.bg) ? [p.bg] : [];
  $("bgSwatches").innerHTML = `<button class="sw auto${!bgPick ? " on" : ""}" data-k="bg" data-c="" type="button" title="Pick from the cover">Auto</button>` +
    swatchRow([...coverBg, ...BACKGROUNDS], bgPick, "bg") + customSw("customBg", cur.bg, "Your own background colour");
}
const freshBackdrops = () => { for (const k in caches) caches[k] = {}; };   // the blurred backdrop is tinted with the background
function pickColour(kind, c) {
  if (kind === "bg") bgPick = c; else accent = c;
  freshBackdrops(); renderSwatches(); requestDraw(); thumbsSoon();
}
for (const id of ["swatches", "bgSwatches"]) {
  $(id).addEventListener("click", (e) => { const b = e.target.closest("button.sw"); if (b) pickColour(b.dataset.k, b.dataset.c); });
  $(id).addEventListener("input", (e) => {
    if (e.target.id === "customColor") accent = e.target.value; else if (e.target.id === "customBg") bgPick = e.target.value; else return;
    freshBackdrops(); requestDraw(); thumbsSoon();
  });
  $(id).addEventListener("change", (e) => { if (e.target.type === "color") renderSwatches(); });
}

// ---------- words and timing ----------
function setLyricsText(text, fromUser = true) {
  const before = words.lines.join("\n");
  words.lines = lyricLines(text);
  if (words.lines.join("\n") !== before) {
    if (words.timed.length !== words.lines.length) {
      const had = words.mode === "timed";
      words.timed = words.lines.map((_, i) => words.timed[i] ?? NaN);
      if (had && fromUser) toast("The number of lines changed. Check the times in Lyric timing.");
    }
  }
  $("lineCount").textContent = words.lines.length ? `${words.lines.length} line${words.lines.length > 1 ? "s" : ""} on screen` : "";
  renderLines(); requestDraw(); thumbsSoon();
}
function renderLines() {
  const L = words.lines, times = lineTimes(L, words.mode === "timed" ? words.timed : null, clip);
  $("wordsIntro").innerHTML = L.length
    ? (words.mode === "even" ? "Right now the lines are spread evenly over the clip. For lines that land on the beat, press <b>Tap along</b>: the clip plays (from 2 seconds early) and you tap as each line starts." : "Your timing. Type a time to fix one line (minutes:seconds in the song), or tap along again.")
    : "Add lyrics in <b>Your song</b> (paste them or bring them from your Songbook) to show the words in time.";
  for (const b of $("timeSeg").children) b.classList.toggle("on", b.dataset.v === words.mode);
  $("tapStart").disabled = !L.length || !song.chans;
  $("tapClear").disabled = !words.timed.some(Number.isFinite);
  $("lines").innerHTML = L.map((l, i) => {
    const t = times[i], out = Number.isFinite(t) && (t >= clip.end || (t < clip.start && Number.isFinite(times[i + 1]) && times[i + 1] <= clip.start));
    return `<div class="ln${out ? " out" : ""}" data-i="${i}"><span class="n">${i + 1}</span><input class="t" value="${Number.isFinite(t) ? formatTime(t, true) : ""}" placeholder="--" aria-label="Time for line ${i + 1}" ${words.mode === "even" ? "readonly title=\"Spread evenly. Choose My timing to type times.\"" : ""}><span title="${esc(l)}">${esc(l)}</span></div>`;
  }).join("");
}
$("lines").addEventListener("change", (e) => {
  const row = e.target.closest(".ln"); if (!row || words.mode !== "timed") return;
  const v = e.target.value.trim(), t = v ? parseTime(v) : NaN;
  if (v && !Number.isFinite(t)) { e.target.classList.add("bad"); toast("Write times like 1:02.5 (minutes:seconds)."); return; }
  e.target.classList.remove("bad");
  words.timed[+row.dataset.i] = t;
  renderLines(); requestDraw();
});
$("timeSeg").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-v]"); if (!b) return;
  words.mode = b.dataset.v;
  if (words.mode === "timed" && !words.timed.some(Number.isFinite)) words.timed = lineTimes(words.lines, null, clip).slice();   // start from the even spread
  renderLines(); requestDraw(); thumbsSoon();
});
$("tapClear").addEventListener("click", () => { words.timed = words.lines.map(() => NaN); words.mode = "even"; renderLines(); requestDraw(); });
const tap = { on: false, i: 0 };
function startTap() {
  if (!words.lines.length || !song.chans) return;
  if (isCanvas()) setFormat("vertical");
  words.mode = "timed"; words.timed = words.lines.map(() => NaN);
  tap.on = true; tap.i = 0;
  $("tapBox").classList.remove("hidden"); $("tapStart").disabled = true;
  updateTapLabel(); renderLines();
  playFrom(Math.max(0, clip.start - 2), clip.end, "tap");
  $("tapBtn").focus();
}
function doTap() {
  if (!tap.on || !playing) return;
  if (tap.i < words.lines.length) { words.timed[tap.i] = +playPos().toFixed(2); tap.i++; }
  updateTapLabel(); renderLines(); requestDraw();
  if (tap.i >= words.lines.length) toast("All lines timed. Let it play out or press Stop.");
}
function updateTapLabel() {
  const next = words.lines[tap.i];
  $("tapNext").textContent = next ? `Next: ${next}` : "All lines timed";
}
function endTap() {
  if (!tap.on) return;
  tap.on = false;
  $("tapBox").classList.add("hidden");
  const n = words.timed.filter(Number.isFinite).length;
  if (!n) { words.mode = "even"; }
  renderLines(); requestDraw(); thumbsSoon();
  toast(n ? `Timed ${n} of ${words.lines.length} line${words.lines.length > 1 ? "s" : ""}. Play the clip to check it.` : "No taps, so the lines stay spread evenly.");
}
function markNowLine() {
  const i = activeLine(words.timed, playPos());
  for (const r of $("lines").children) r.classList.toggle("now", +r.dataset.i === i);
}
$("tapStart").addEventListener("click", startTap);
$("tapBtn").addEventListener("pointerdown", (e) => { e.preventDefault(); doTap(); });
$("tapBtn").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); doTap(); } });
$("tapStop").addEventListener("click", () => stopPlay());

// ---------- Songbook ----------
let sbSongs = [], sbPick = null, sbParts = [], sbOn = new Set();
function openSongbook() {
  let d = null;
  try { d = JSON.parse(localStorage.getItem("encore.songbook.v1") || "null"); } catch {}
  sbSongs = (d?.songs || []).filter((s) => s.body && s.body.trim()).sort((a, b) => (b.updated || 0) - (a.updated || 0));
  sbPick = null; sbOn = new Set();
  $("sbSearch").value = "";
  renderSb();
  $("sbParts").classList.add("hidden"); $("sbPrev").classList.add("hidden"); $("sbUse").disabled = true;
  $("sbDlg").showModal();
  if (!sbSongs.length) $("sbList").innerHTML = `<p class="note" style="padding:10px">No songs in your Songbook on this browser yet. <a href="songbook.html" style="color:#ff6c40">Open Songbook</a> to write one, or paste the words here instead.</p>`;
}
const sbTitle = (s) => s.title || toLyrics(s.body).split("\n").find((l) => l.trim() && !/^\[.*\]$/.test(l)) || "Untitled";
function renderSb() {
  if (!sbSongs.length) return;
  const q = $("sbSearch").value.trim().toLowerCase();
  const list = sbSongs.filter((s) => !q || (sbTitle(s) + " " + (s.artist || "") + " " + s.body).toLowerCase().includes(q));
  $("sbList").innerHTML = list.length ? list.map((s) => `<button class="sbSong${s === sbPick ? " on" : ""}" data-id="${esc(s.id)}" type="button">${esc(sbTitle(s))}<span>${esc(s.artist || "")}</span></button>`).join("") : `<p class="note" style="padding:10px">No song matches.</p>`;
}
function pickSb(s) {
  sbPick = s;
  sbParts = songParts(toLyrics(s.body));
  const chorus = sbParts.findIndex((p) => /chorus|hook|refrain/i.test(p.name));
  sbOn = new Set([chorus >= 0 ? chorus : 0]);
  renderSb(); renderParts();
}
function renderParts() {
  $("sbParts").classList.toggle("hidden", !sbParts.length);
  $("partChips").innerHTML = sbParts.map((p, i) => `<button class="${sbOn.has(i) ? "on" : ""}" data-i="${i}" type="button">${esc(p.name)}</button>`).join("");
  const lines = sbParts.filter((_, i) => sbOn.has(i)).flatMap((p) => p.lines);
  $("sbPrev").textContent = lines.join("\n") || "Pick a part above.";
  $("sbPrev").classList.remove("hidden");
  $("sbUse").disabled = !lines.length;
}
$("fromSongbook").addEventListener("click", openSongbook);
$("sbSearch").addEventListener("input", renderSb);
$("sbList").addEventListener("click", (e) => { const b = e.target.closest(".sbSong"); if (b) pickSb(sbSongs.find((s) => s.id === b.dataset.id)); });
$("partChips").addEventListener("click", (e) => { const b = e.target.closest("button[data-i]"); if (!b) return; const i = +b.dataset.i; sbOn.has(i) ? sbOn.delete(i) : sbOn.add(i); renderParts(); });
$("sbCancel").addEventListener("click", () => $("sbDlg").close());
$("sbUse").addEventListener("click", async () => {
  const lines = sbParts.filter((_, i) => sbOn.has(i)).flatMap((p) => p.lines);
  $("lyrics").value = lines.join("\n");
  words.mode = "even"; words.timed = [];
  setLyricsText($("lyrics").value, false);
  if (sbPick?.title && !title) { title = sbPick.title; $("title").value = title; }
  if (sbPick?.artist && !state.artist) { state.artist = sbPick.artist; $("artist").value = state.artist; remember(); }
  // the song's cover from the Songbook, when there's no art yet
  if (!cover.img && sbPick) {
    try {
      const { getCover } = await import("./songbook-covers.js");
      const url = (await getCover(sbPick.id)) || (await getCover(sbPick.folderId));
      if (url) await setCover(await (await fetch(url)).blob(), false);
    } catch {}
  }
  $("sbDlg").close();
  toast(`${lines.length} line${lines.length > 1 ? "s" : ""} added. Time them in Lyric timing.`);
  updateAll();
});

// ---------- export ----------
const jobs = [];
let running = null;
function updateWhat() {
  const F = fmtNow(), mime = canRecord() ? pickMime(F.audio) : "";
  const kind = !mime ? "" : /mp4/.test(mime) ? "MP4" : "WebM";
  const look = LOOKS[isCanvas() ? state.canvasLook : state.look].label;
  const len = isCanvas() ? `${state.canvasLen} s loop, no sound` : `${Math.round(clipLen())} s`;
  $("what").innerHTML = `<b>${F.label}</b> ${F.w}x${F.h}, ${len}, ${esc(look)}${kind ? `, ${kind}` : ""}`;
  const ready = canRecord() && !!mime && (isCanvas() || !!song.chans);
  $("make").disabled = !ready;
  $("makeAll").disabled = !(canRecord() && song.chans);
  const note = $("recNote");
  if (!canRecord() || !mime) { note.textContent = "This browser can't record video. Use the latest Chrome or Edge on a computer."; note.classList.remove("hidden"); }
  else if (kind === "WebM") { note.innerHTML = "This browser saves <b>WebM</b> videos. YouTube and TikTok take WebM. Instagram, X and Spotify want MP4, so for those make your videos in the latest Chrome or Edge, or convert them first."; note.classList.remove("hidden"); }
  else if (!song.chans && !isCanvas()) { note.textContent = "Add your song to make videos. A Canvas works with just your cover."; note.classList.remove("hidden"); }
  else { note.textContent = "Videos are made in real time (a 30 second clip takes 30 seconds). Keep this tab open while they record. Nothing is uploaded."; note.classList.remove("hidden"); }
}
function queue(fmts) {
  for (const f of fmts) {
    if (FORMATS[f].audio && !song.chans) continue;
    jobs.push({ id: Math.random().toString(36).slice(2), fmt: f, scene: scene(f, true), clip: { ...clip }, state: "waiting", progress: 0, name: "", url: "", info: null });
  }
  renderJobs();
  if (!running) runQueue();
}
async function runQueue() {
  let job;
  while ((job = jobs.find((j) => j.state === "waiting"))) {
    const F = FORMATS[job.fmt], ctrl = new AbortController();
    running = { job, ctrl };
    job.state = "recording"; renderJobs();
    const sc = job.scene, len = F.loop ? sc.canvasLen : job.clip.end - job.clip.start;
    let audio = null;
    if (F.audio) { const a = audioCtx(); await a.resume(); audio = { actx: a, buffer: clipBuffer(a, song.chans, song.fs, job.clip.start, len) }; }
    try {
      const r = await recordVideo({
        w: F.w, h: F.h, seconds: len, audio, signal: ctrl.signal,
        draw: (ctx, t) => { ctx.setTransform(1, 0, 0, 1, 0, 0); drawFrame(ctx, sc, F.loop ? t : job.clip.start + t); },
        onProgress: (p) => { job.progress = p; updateJobMeter(job); },
      });
      job.name = fileName(sc.artist, sc.title, job.fmt, r.ext);
      job.blob = r.blob; job.url = URL.createObjectURL(r.blob); job.state = "done"; job.mime = r.mime;
      renderJobs();
      download(job);
      try { job.info = await inspectVideo(r.blob); renderJobs(); } catch {}
    } catch (e) {
      job.state = e.message === "cancelled" ? "cancelled" : "failed";
      job.error = e.message;
      renderJobs();
    }
    running = null;
  }
  renderJobs();
}
function download(job) {
  const a = document.createElement("a");
  a.href = job.url; a.download = job.name; document.body.append(a); a.click(); a.remove();
}
function cancelAll() {
  for (const j of jobs) if (j.state === "waiting") j.state = "cancelled";
  running?.ctrl.abort();
  renderJobs();
}
const kb = (n) => (n > 1e6 ? (n / 1e6).toFixed(1) + " MB" : Math.round(n / 1e3) + " KB");
function renderJobs() {
  const box = $("jobs");
  const shown = jobs.filter((j) => j.state !== "cancelled" || j === jobs[jobs.length - 1]).slice(-6);
  const busy = jobs.some((j) => j.state === "recording" || j.state === "waiting");
  box.innerHTML = shown.map((j) => {
    const F = FORMATS[j.fmt];
    const st = j.state === "waiting" ? "Waiting" : j.state === "recording" ? `Recording ${Math.round(j.progress * 100)}%` : j.state === "done" ? (j.info ? `${kb(j.blob.size)}, ${j.info.width}x${j.info.height}` : kb(j.blob.size)) : j.state === "cancelled" ? "Stopped" : "Didn't work";
    return `<div class="job ${j.state}" data-id="${j.id}"><div class="top"><span class="nm" title="${esc(j.name || F.file)}">${esc(j.name || F.label)}</span><span class="st">${esc(st)}</span>` +
      (j.state === "done" ? `<a class="btn sm" href="${j.url}" download="${esc(j.name)}">Save</a>` : "") + `</div>` +
      (j.state === "recording" || j.state === "waiting" ? `<div class="meter"><i style="width:${Math.round(j.progress * 100)}%"></i></div>` : "") +
      (j.state === "failed" ? `<span class="small" style="color:#ff8a8a">${esc(j.error || "")}</span>` : "") + `</div>`;
  }).join("") + (busy ? `<button class="btn sm" id="cancel" type="button">Stop making videos</button>` : "");
  if (busy) { $("make").disabled = true; $("makeAll").disabled = true; } else updateWhat();
}
function updateJobMeter(job) {
  const el = document.querySelector(`.job[data-id="${job.id}"]`);
  if (!el) return;
  const i = el.querySelector(".meter i"), st = el.querySelector(".st");
  if (i) i.style.width = Math.round(job.progress * 100) + "%";
  if (st) st.textContent = `Recording ${Math.round(job.progress * 100)}%`;
}
$("jobs").addEventListener("click", (e) => { if (e.target.id === "cancel") cancelAll(); });
$("make").addEventListener("click", () => { stopPlay(); queue([state.fmt]); });
$("makeAll").addEventListener("click", () => { stopPlay(); queue(FORMAT_ORDER); });

// ---------- inputs ----------
$("audioDrop").addEventListener("click", () => $("audioFile").click());
$("audioFile").accept = ACCEPT;
$("audioFile").addEventListener("change", (e) => { loadAudio(e.target.files[0]); e.target.value = ""; });
$("coverBtn").addEventListener("click", () => $("coverFile").click());
$("coverPick").addEventListener("click", () => $("coverFile").click());
$("coverClear").addEventListener("click", clearCover);
$("coverFile").addEventListener("change", (e) => { if (e.target.files[0]) coverFromFile(e.target.files[0]); e.target.value = ""; });
$("title").addEventListener("input", (e) => { title = e.target.value; delete e.target.dataset.auto; requestDraw(); thumbsSoon(); });
$("artist").addEventListener("input", (e) => { state.artist = e.target.value; remember(); requestDraw(); thumbsSoon(); });
$("cta").addEventListener("change", (e) => { state.cta = e.target.value; $("ctaCustom").classList.toggle("hidden", state.cta !== "custom"); if (state.cta === "custom") $("ctaCustom").focus(); remember(); requestDraw(); thumbsSoon(); });
$("ctaCustom").addEventListener("input", (e) => { state.ctaCustom = e.target.value; remember(); requestDraw(); thumbsSoon(); });
$("date").addEventListener("input", (e) => { date = e.target.value; requestDraw(); thumbsSoon(); });
$("lyrics").addEventListener("input", (e) => setLyricsText(e.target.value));
for (const id of ["showTitle", "showCta", "showDate", "showLyrics", "canvasText", "showMark"]) $(id).addEventListener("change", (e) => { state[id] = e.target.checked; remember(); requestDraw(); thumbsSoon(); });
$("play").addEventListener("click", togglePlay);
$("ttabs").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-t]"); if (!b) return;
  for (const x of $("ttabs").children) x.classList.toggle("on", x === b);
  $("tabLook").classList.toggle("hidden", b.dataset.t !== "look"); $("tabWords").classList.toggle("hidden", b.dataset.t !== "words");
});
$("mtabs").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-m]"); if (!b) return;
  $("main").dataset.m = b.dataset.m;
  for (const x of $("mtabs").children) x.classList.toggle("on", x === b);
  requestAnimationFrame(() => { sizeView(); drawWave(); thumbsSoon(); });
});
// drop a song or a picture anywhere on the page
const isImage = (f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|avif|bmp)$/i.test(f.name);
window.addEventListener("dragover", (e) => { if ([...(e.dataTransfer?.items || [])].some((i) => i.kind === "file")) { e.preventDefault(); $("audioDrop").classList.add("over"); } });
window.addEventListener("dragleave", (e) => { if (!e.relatedTarget) $("audioDrop").classList.remove("over"); });
window.addEventListener("drop", (e) => {
  const files = [...(e.dataTransfer?.files || [])];
  if (!files.length) return;
  e.preventDefault(); $("audioDrop").classList.remove("over");
  const img = files.find(isImage), aud = files.find((f) => !isImage(f));
  if (img) coverFromFile(img);
  if (aud) loadAudio(aud);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && tap.on) { stopPlay(); return; }
  if (e.code !== "Space" || e.repeat) return;
  const el = document.activeElement;
  if (el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable) && el.id !== "tapBtn") return;
  if ($("sbDlg").open) return;
  e.preventDefault();
  if (tap.on) doTap(); else togglePlay();
});

function updateAll() { renderLen(); renderHooks(); renderLines(); drawWave(); updatePlay(); updateWhat(); requestDraw(); thumbsSoon(); }

// ---------- start ----------
$("artist").value = state.artist;
$("cta").value = [...$("cta").options].some((o) => o.value === state.cta) ? state.cta : "";
state.cta = $("cta").value;
$("ctaCustom").value = state.ctaCustom; $("ctaCustom").classList.toggle("hidden", state.cta !== "custom");
for (const id of ["showTitle", "showCta", "showDate", "showLyrics", "canvasText", "safe", "showMark"]) $(id).checked = !!state[id];
clip.start = 0; clip.end = state.len;
renderSwatches();
setFormat(state.fmt);
setLyricsText("", false);
updateAll();
document.fonts?.ready.then(() => { placeholderKey = ""; requestDraw(); thumbsSoon(); drawWave(); });
Promise.all([document.fonts?.load('800 40px "DM Sans"'), document.fonts?.load('700 20px "Space Mono"')]).then(() => { placeholderKey = ""; requestDraw(); thumbsSoon(); }).catch(() => {});
requestAnimationFrame(frame);

// for the browser tests: read-only peeks at what the page is doing
window.__clips = { state, song, clip, words, jobs, cover, inspectVideo, setFormat, usePick, queue };
