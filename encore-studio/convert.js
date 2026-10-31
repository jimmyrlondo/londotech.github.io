// Encore Convert: the page. Drop files, pick a preset, press Convert. Reading
// and decoding happen here (decodeAudioData lives on the main thread); the
// processing and encoding run in convert-worker.js, one file at a time.
import { readFileInfo, decodeWav, fmtTime } from "./lastcall-core.js";
import { PRESETS, FORMATS, plan, honesty, estimateSize, fmtBytes, outName, uniqueNames, NAME_PATTERNS, readTags, decodeAiff } from "./convert-core.js";
import { zip } from "./zip.js";

const $ = (id) => document.getElementById(id);
const AUDIO_EXT = /\.(wav|wave|flac|aif|aiff|aifc|mp3|m4a|mp4|m4b|aac|ogg|oga|opus|webm|caf|weba)$/i;
const state = { files: [], sel: null, preset: "mp3-320", running: false, worker: null, cancel: false, caps: { m4a: null, opus: false }, nextId: 1 };
window.__convert = state; // read by the headless browser check

// ---------- what this browser can encode ----------
async function detectCaps() {
  const caps = { m4a: null, opus: false };
  if (typeof AudioEncoder !== "undefined") {
    const ok = async (c) => { try { return (await AudioEncoder.isConfigSupported(c)).supported; } catch { return false; } };
    const rates = [], kbps = [];
    for (const r of [44100, 48000]) if (await ok({ codec: "mp4a.40.2", sampleRate: r, numberOfChannels: 2, bitrate: 128000 })) rates.push(r);
    if (rates.length) for (const k of [96, 128, 160, 192, 224, 256, 320]) if (await ok({ codec: "mp4a.40.2", sampleRate: rates[0], numberOfChannels: 2, bitrate: k * 1000 })) kbps.push(k);
    if (rates.length && kbps.length) caps.m4a = { rates, kbps };
    caps.opus = await ok({ codec: "opus", sampleRate: 48000, numberOfChannels: 2, bitrate: 160000 });
  }
  state.caps = caps;
  const missing = [];
  if (!caps.m4a) missing.push("AAC (M4A)");
  if (!caps.opus) missing.push("Opus");
  if (missing.length) {
    $("capsHelp").textContent = `${missing.join(" and ")} ${missing.length > 1 ? "aren't" : "isn't"} available because this browser has no ${missing.length > 1 ? "encoders" : "encoder"} for ${missing.length > 1 ? "them" : "it"}. Chrome and Edge can make both; Firefox makes Opus but not AAC. Everything else works here.`;
    $("capsHelp").classList.remove("hidden");
  }
  renderPresets();
}
const presetUsable = (p) => (p.kind === "m4a" ? !!state.caps.m4a : p.kind === "opus" ? state.caps.opus : true);

// ---------- presets ----------
function renderPresets() {
  const box = $("presets");
  box.innerHTML = "";
  for (const p of PRESETS) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "preset" + (p.id === state.preset ? " on" : ""); b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", String(p.id === state.preset)); b.dataset.id = p.id;
    const usable = presetUsable(p);
    b.disabled = !usable;
    let sub = p.sub;
    if (p.kind === "m4a" && state.caps.m4a && Math.max(...state.caps.m4a.kbps) < p.kbps) sub = `Up to ${Math.max(...state.caps.m4a.kbps)} kbps here`;
    if (!usable) sub = "Not in this browser";
    b.innerHTML = `<b></b><span></span>`;
    b.querySelector("b").textContent = p.label; b.querySelector("span").textContent = sub;
    b.onclick = () => { state.preset = p.id; try { localStorage.setItem("encore.convert.preset", p.id); } catch {} renderPresets(); renderAll(); };
    box.appendChild(b);
  }
  $("presetHelp").innerHTML = presetHelp(PRESETS.find((p) => p.id === state.preset));
}
function presetHelp(p) {
  const lines = {
    mp3: "<b>MP3</b> plays everywhere. Constant bitrate, joint stereo, with your tags and cover art.",
    wav: "<b>WAV</b> is uncompressed, for DAWs, CDs and distributors. Tags and cover art go in too.",
    flac: "<b>FLAC</b> is lossless: the exact same audio as a WAV in about half the space.",
    aiff: "<b>AIFF</b> is Apple's uncompressed format (Logic, GarageBand, iTunes).",
    m4a: "<b>AAC (M4A)</b> is what Apple Music and iPhones use. Made by your browser's own encoder.",
    opus: "<b>Opus</b> sounds better than MP3 at the same size. Plays in browsers, Android, VLC; not in older Apple apps.",
  };
  return lines[p.kind] + (p.id === "voice" ? " Mono 128 kbps keeps voice memos and rehearsal takes small." : "");
}

// ---------- options ----------
const parseTime = (s) => {
  s = String(s || "").trim();
  if (!s) return 0;
  const parts = s.split(":").map(Number);
  if (parts.some((x) => !Number.isFinite(x) || x < 0)) return NaN;
  return parts.reduce((a, x) => a * 60 + x, 0);
};
function options() {
  const rate = $("optRate").value;
  return {
    rate: rate === "keep" ? -1 : Number(rate), bits: Number($("optBits").value), channels: $("optChannels").value, kbps: Number($("optKbps").value),
    // Convert just changes the file type: no trimming, fades, level changes or renaming (same name, new extension)
    start: 0, end: 0, fadeIn: 0, fadeOut: 0, normalize: "off", pattern: "{name}",
  };
}
function optionsChanged() {
  const o = options();
  return !!(o.rate || o.bits || o.channels !== "keep" || o.kbps);
}
function setupOptions() {
  const changed = () => { $("optDot").classList.toggle("hidden", !optionsChanged()); renderAll(); };
  for (const id of ["optRate", "optBits", "optChannels", "optKbps"]) { $(id).addEventListener("change", changed); $(id).addEventListener("input", changed); }
  $("resetOpts").onclick = () => {
    for (const id of ["optRate", "optBits", "optKbps"]) $(id).value = "0";
    $("optChannels").value = "keep";
    changed();
  };
}

// The plan for one file with the current preset and options
function planFor(f, srcOverride) {
  const o = options(), preset = PRESETS.find((p) => p.id === state.preset), src = srcOverride || f.src;
  return plan(preset, src, { rate: o.rate === -1 ? src.fs : o.rate, bits: o.bits, channels: o.channels, kbps: o.kbps }, state.caps);
}
const chName = (n) => (n === 1 ? "mono" : n === 2 ? "stereo" : `${n} channels`);
function planText(p) {
  const what = p.kind === "mp3" || p.kind === "m4a" || p.kind === "opus" ? `${FORMATS[p.kind].name} ${p.kbps} kbps` : `${FORMATS[p.kind].name} ${p.float ? "32-bit float" : p.bits + "-bit"}`;
  return `${what}, ${p.rate / 1000} kHz, ${chName(p.channels)}`;
}

// ---------- files ----------
async function addFiles(list) {
  const files = [...list].filter((f) => AUDIO_EXT.test(f.name) || (f.type || "").startsWith("audio/") || (f.type || "") === "video/webm");
  const skipped = list.length - files.length;
  for (const file of files) {
    const f = { id: state.nextId++, file, name: file.name, size: file.size, status: "ready", pct: 0, result: null, error: "", notes: [] };
    try {
      // the real format and the tags, from the file's own bytes (tags can sit
      // at the end: WAV's id3 chunk, an MP4's index)
      const bytes = new Uint8Array(await file.arrayBuffer());
      f.info = readFileInfo(bytes, file.name);
      const t = readTags(bytes, f.info);
      f.meta = { ...t.tags };
      f.art = t.art ? { bytes: t.art.bytes, mime: t.art.mime || "image/jpeg" } : null;
    } catch {
      f.info = { container: "unknown", label: "Unknown", tags: {} }; f.meta = {}; f.art = null;
    }
    f.src = srcFrom(f.info);
    state.files.push(f);
    if (!state.sel) state.sel = f.id;
  }
  setStatus(skipped > 0 ? `${skipped} ${skipped === 1 ? "file isn't" : "files aren't"} audio and ${skipped === 1 ? "was" : "were"} skipped.` : state.files.length ? "Ready. Press Convert." : "");
  renderAll(); renderTags();
}
function srcFrom(info) {
  const lossy = info.lossy ?? true;
  return { fs: info.sampleRate || 44100, channels: info.channels || 2, bitDepth: info.bitDepth || 0, float: !!info.float, lossy, label: info.container === "unknown" ? "compressed audio" : info.label, duration: info.duration || 0 };
}
function srcText(f) {
  const i = f.info, bits = [];
  bits.push(i.container === "unknown" ? "Audio" : i.label);
  if (i.lossy && i.bitrate) bits.push(`${i.bitrate} kbps${i.vbr ? " VBR" : ""}`);
  else if (!i.lossy && i.bitDepth) bits.push(i.float ? "32-bit float" : `${i.bitDepth}-bit`);
  if (i.sampleRate) bits.push(`${i.sampleRate / 1000} kHz`);
  if (i.channels) bits.push(chName(i.channels));
  if (i.duration) bits.push(fmtTime(i.duration));
  bits.push(fmtBytes(f.size));
  return bits.join(", ");
}

// ---------- the list ----------
function renderAll() {
  const list = $("list");
  $("empty").classList.toggle("hidden", state.files.length > 0);
  for (const el of [...list.querySelectorAll(".item")]) if (!state.files.some((f) => String(f.id) === el.dataset.id)) el.remove();
  for (const f of state.files) {
    let el = list.querySelector(`.item[data-id="${f.id}"]`);
    if (!el) {
      el = document.createElement("li"); el.className = "item"; el.dataset.id = f.id;
      el.innerHTML = `<div class="top"><span class="name"></span><button class="x" type="button" aria-label="Remove from the list">&times;</button></div><div class="src"></div><div class="out"></div><div class="warn hidden"></div><div class="prog hidden"><i></i></div><div class="status-line"></div>`;
      el.onclick = (e) => { if (e.target.closest(".x") || e.target.closest("a")) return; state.sel = f.id; renderAll(); renderTags(); };
      el.querySelector(".x").onclick = () => removeFile(f.id);
      list.appendChild(el);
    }
    renderItem(f, el);
  }
  const n = state.files.length, done = state.files.filter((f) => f.result).length;
  $("listCount").textContent = n ? `${n} ${n === 1 ? "file" : "files"}${done ? `, ${done} converted` : ""}` : "No files yet";
  $("clearBtn").classList.toggle("hidden", !n || state.running);
  $("convertBtn").disabled = !n || state.running || !presetUsable(PRESETS.find((p) => p.id === state.preset));
  $("convertBtn").textContent = n > 1 ? `Convert ${n} files` : "Convert";
  $("zipBtn").classList.toggle("hidden", done < 2 || state.running);
}
function renderItem(f, el) {
  el.classList.toggle("sel", f.id === state.sel);
  el.querySelector(".name").textContent = f.name; el.querySelector(".name").title = f.name;
  el.querySelector(".src").textContent = srcText(f);
  const p = planFor(f), o = options();
  let secs = f.src.duration;
  if (secs) { const end = o.end > 0 ? Math.min(o.end, secs) : secs; secs = Math.max(0, end - Math.min(o.start || 0, end)); }
  el.querySelector(".out").innerHTML = `To <b></b>${secs ? `, about ${fmtBytes(estimateSize(p, secs))}` : ""}`;
  el.querySelector(".out b").textContent = planText(p);
  const notes = [...honesty(f.src, p), ...p.notes];
  const warn = el.querySelector(".warn");
  warn.textContent = notes.join(" "); warn.classList.toggle("hidden", !notes.length);
  const prog = el.querySelector(".prog");
  prog.classList.toggle("hidden", f.status !== "working");
  prog.firstChild.style.width = `${Math.round(f.pct * 100)}%`;
  const line = el.querySelector(".status-line");
  line.className = "status-line";
  if (f.status === "error") { line.className += " err"; line.textContent = f.error; }
  else if (f.status === "cancelled") { line.className += " err"; line.textContent = "Canceled."; }
  else if (f.result) {
    line.className += " done";
    line.innerHTML = `Done: <span></span>, ${fmtBytes(f.result.blob.size)}. <a download>Download</a>`;
    line.querySelector("span").textContent = f.result.name;
    const a = line.querySelector("a"); a.href = f.result.url; a.download = f.result.name;
    if (f.result.extra) line.append(" " + f.result.extra);
  } else line.textContent = f.status === "working" ? f.stage || "Working..." : "";
}
function removeFile(id) {
  if (state.running) return;
  const f = state.files.find((x) => x.id === id);
  if (f?.result) URL.revokeObjectURL(f.result.url);
  state.files = state.files.filter((x) => x.id !== id);
  if (state.sel === id) state.sel = state.files[0]?.id ?? null;
  renderAll(); renderTags();
}
const setStatus = (s) => { $("status").textContent = s; };

// ---------- tags ----------
function renderTags() {
  if (!$("tagsForm")) return;   // tag editing lives in Tag now; tags and cover come along from the original
  const f = state.files.find((x) => x.id === state.sel);
  $("tagsNone").classList.toggle("hidden", !!f); $("tagsForm").classList.toggle("hidden", !f);
  if (!f) return;
  $("tagsFor").textContent = `Tags for ${f.name}${state.files.length > 1 ? " (click another file to edit its tags)" : ""}`;
  for (const inp of document.querySelectorAll("[data-tag]")) inp.value = f.meta[inp.dataset.tag] ?? "";
  const box = $("coverBox");
  if (f.coverUrl) URL.revokeObjectURL(f.coverUrl), (f.coverUrl = null);
  if (f.art) {
    f.coverUrl = URL.createObjectURL(new Blob([f.art.bytes], { type: f.art.mime }));
    box.innerHTML = `<img alt="Cover art">`; box.firstChild.src = f.coverUrl;
    $("coverInfo").textContent = `${f.art.mime === "image/png" ? "PNG" : "JPEG"}, ${fmtBytes(f.art.bytes.length)}`;
  } else { box.innerHTML = `<span class="none">No cover</span>`; $("coverInfo").textContent = "No cover art in this file."; }
  $("coverAdd").textContent = f.art ? "Replace" : "Add cover";
  $("coverDel").classList.toggle("hidden", !f.art);
}
function setupTags() {
  if (!$("tagsForm")) return;
  for (const inp of document.querySelectorAll("[data-tag]")) inp.addEventListener("input", () => {
    const f = state.files.find((x) => x.id === state.sel);
    if (!f) return;
    const v = inp.value.trim();
    if (v) f.meta[inp.dataset.tag] = inp.value; else delete f.meta[inp.dataset.tag];
    if (["artist", "title", "track", "album", "year"].includes(inp.dataset.tag)) renderAll();
  });
  $("coverAdd").onclick = () => $("coverFile").click();
  $("coverDel").onclick = () => { const f = state.files.find((x) => x.id === state.sel); if (f) { f.art = null; renderTags(); } };
  $("coverFile").onchange = async () => {
    const file = $("coverFile").files[0], f = state.files.find((x) => x.id === state.sel);
    $("coverFile").value = "";
    if (!file || !f) return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const png = bytes[0] === 0x89 && bytes[1] === 0x50, jpg = bytes[0] === 0xff && bytes[1] === 0xd8;
    if (!png && !jpg) { setStatus("Cover art needs to be a JPEG or PNG image."); return; }
    f.art = { bytes, mime: png ? "image/png" : "image/jpeg" };
    renderTags();
  };
}

// ---------- decoding ----------
// At the file's own sample rate, so nothing is resampled behind our back.
// WAV and AIFF are read directly (exact samples, any bit depth).
async function decode(f) {
  const buf = await f.file.arrayBuffer(), info = f.info;
  if (info.container === "wav") { const d = decodeWav(buf); if (d?.chans.length) return { chans: d.chans, fs: d.fs }; }
  if (info.container === "aiff") { const d = decodeAiff(buf); if (d?.chans.length) return { chans: d.chans, fs: d.fs }; }
  const rate = info.sampleRate >= 3000 && info.sampleRate <= 768000 ? info.sampleRate : 48000;
  try {
    const ctx = new OfflineAudioContext(1, 1, rate);
    const ab = await ctx.decodeAudioData(buf);
    const chans = [];
    for (let c = 0; c < ab.numberOfChannels; c++) { const a = new Float32Array(ab.length); ab.copyFromChannel(a, c); chans.push(a); }
    return { chans, fs: ab.sampleRate };
  } catch {
    throw new Error(info.container === "unknown" ? "This doesn't look like an audio file this browser can read." : `This browser can't decode this ${info.label} file.`);
  }
}

// ---------- converting ----------
function runWorker(msg, transfer, onProgress) {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL("convert-worker.js", import.meta.url), { type: "module" });
    state.worker = w;
    w.onmessage = (e) => {
      const m = e.data;
      if (m.type === "progress") onProgress(m.pct, m.stage);
      else { w.terminate(); state.worker = null; m.type === "done" ? resolve(m) : reject(new Error(m.message)); }
    };
    w.onerror = (e) => { w.terminate(); state.worker = null; reject(new Error(e.message || "The converter stopped unexpectedly.")); };
    state.rejectCurrent = reject;
    w.postMessage(msg, transfer);
  });
}
async function convertAll() {
  if (state.running || !state.files.length) return;
  const o = options();
  if (Number.isNaN(o.start) || Number.isNaN(o.end)) { setStatus("Start and end times look like 1:23 or 83.5 (seconds)."); return; }
  state.running = true; state.cancel = false;
  $("cancelBtn").classList.remove("hidden");
  for (const f of state.files) { if (f.result) URL.revokeObjectURL(f.result.url); f.result = null; f.status = "ready"; f.error = ""; f.pct = 0; }
  renderAll();
  const used = new Set();
  let ok = 0, i = 0;
  for (const f of state.files) {
    i++;
    if (state.cancel) break;
    const label = state.files.length > 1 ? `Converting ${i} of ${state.files.length}: ` : "Converting ";
    f.status = "working"; f.pct = 0; f.stage = "Reading the file..."; renderAll();
    setStatus(label + f.name);
    try {
      const d = await decode(f);
      if (state.cancel) throw new Error("cancelled");
      // the real format now that it's decoded (a file without a header the reader knows)
      const src = { ...f.src, fs: d.fs, channels: d.chans.length };
      const p = planFor(f, src);
      if (o.end && o.start >= o.end) throw new Error("The end time has to be after the start time.");
      const meta = Object.fromEntries(Object.entries(f.meta).map(([k, v]) => [k, typeof v === "string" ? v.trim() : v]).filter(([, v]) => v !== "" && v !== undefined));
      const msg = { chans: d.chans, fs: d.fs, plan: { ...p, inputRate: d.fs }, opts: { start: o.start, end: o.end, fadeIn: o.fadeIn, fadeOut: o.fadeOut, normalize: o.normalize }, meta, art: f.art };
      const res = await runWorker(msg, d.chans.map((c) => c.buffer), (pct, stage) => {
        f.pct = pct; f.stage = `${stage} ${Math.round(pct * 100)}%`;
        const el = document.querySelector(`.item[data-id="${f.id}"]`); if (el) renderItem(f, el);
        setStatus(`${label}${f.name} (${Math.round(pct * 100)}%)`);
      });
      // a name that doesn't clash with another file in this batch
      let name = outName(o.pattern, f.name, meta, p);
      if (used.has(name.toLowerCase())) name = uniqueNames([...used, name]).pop();
      used.add(name.toLowerCase());
      const r = res.report, extra = [];
      if (r.gainDb && Math.abs(r.gainDb) > 0.05) extra.push(`Level ${r.gainDb > 0 ? "+" : ""}${r.gainDb.toFixed(1)} dB.`);
      if (r.normNote) extra.push(r.normNote);
      if (r.clipped && o.normalize === "off") extra.push("Some peaks were over 0 dBFS and got clipped; try Normalize peaks.");
      f.result = { blob: res.blob, url: URL.createObjectURL(res.blob), name, report: r, plan: p, extra: extra.join(" ") };
      f.status = "done"; ok++;
    } catch (err) {
      if (state.cancel) { f.status = "cancelled"; }
      else { f.status = "error"; f.error = err.message || String(err); }
    }
    renderAll();
  }
  state.running = false; state.worker = null;
  $("cancelBtn").classList.add("hidden");
  const failed = state.files.filter((f) => f.status === "error").length;
  if (state.cancel) setStatus(`Canceled. ${ok} ${ok === 1 ? "file" : "files"} finished.`);
  else if (state.files.length === 1 && ok === 1) { setStatus("Done. Your download has started."); download(state.files[0].result); }
  else setStatus(`${ok} of ${state.files.length} converted${failed ? `, ${failed} couldn't be` : ""}.${ok > 1 ? " Download them one by one or all at once as a zip." : ""}`);
  renderAll();
}
function download(r) {
  const a = document.createElement("a");
  a.href = r.url; a.download = r.name; document.body.appendChild(a); a.click(); a.remove();
}
async function downloadZip() {
  const done = state.files.filter((f) => f.result);
  if (!done.length) return;
  setStatus("Making the zip...");
  const blob = await zip(done.map((f) => ({ name: f.result.name, blob: f.result.blob })));
  const pr = PRESETS.find((p) => p.id === state.preset);
  const url = URL.createObjectURL(blob);
  download({ url, name: `Encore Convert (${pr.label.replace(/\//g, "-")}).zip` });
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  setStatus(`Zip ready: ${done.length} files, ${fmtBytes(blob.size)}.`);
}

// ---------- drag and drop (files and folders) ----------
async function entriesToFiles(items) {
  const out = [];
  const walk = async (entry) => {
    if (!entry) return;
    if (entry.isFile) out.push(await new Promise((res, rej) => entry.file(res, rej)));
    else if (entry.isDirectory) {
      const reader = entry.createReader();
      for (;;) { const batch = await new Promise((res, rej) => reader.readEntries(res, rej)); if (!batch.length) break; for (const e of batch) await walk(e); }
    }
  };
  for (const it of items) await walk(it.webkitGetAsEntry?.());
  return out;
}
function setupDrop() {
  const drop = $("drop");
  drop.onclick = (e) => { if (!e.target.closest("#folderBtn")) $("files").click(); };
  drop.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("files").click(); } };
  $("folderBtn").onclick = (e) => { e.stopPropagation(); $("folder").click(); };
  $("files").onchange = () => { addFiles($("files").files); $("files").value = ""; };
  $("folder").onchange = () => { addFiles($("folder").files); $("folder").value = ""; };
  document.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
  document.addEventListener("dragleave", (e) => { if (!e.relatedTarget) drop.classList.remove("over"); });
  document.addEventListener("drop", async (e) => {
    e.preventDefault(); drop.classList.remove("over");
    if (state.running) return;
    const items = [...(e.dataTransfer.items || [])].filter((i) => i.kind === "file");
    const viaEntries = items.length && items[0].webkitGetAsEntry ? await entriesToFiles(items) : null;
    addFiles(viaEntries?.length ? viaEntries : e.dataTransfer.files);
  });
}

// ---------- tabs ----------
function setupTabs() {
  for (const b of document.querySelectorAll(".tabBar button")) b.onclick = () => {
    for (const x of document.querySelectorAll(".tabBar button")) x.classList.toggle("on", x === b);
    for (const s of document.querySelectorAll(".tabBody > section")) s.classList.toggle("show", s.dataset.tab === b.dataset.tab);
  };
}

// ---------- start ----------
try { const saved = localStorage.getItem("encore.convert.preset"); if (saved && PRESETS.some((p) => p.id === saved)) state.preset = saved; } catch {}
setupTabs(); setupOptions(); setupTags(); setupDrop();
renderPresets(); renderAll(); renderTags();
$("convertBtn").onclick = convertAll;
$("cancelBtn").onclick = () => { if (!state.running) return; state.cancel = true; if (state.worker) { state.worker.terminate(); state.worker = null; state.rejectCurrent?.(new Error("cancelled")); } setStatus("Canceling..."); };
$("zipBtn").onclick = downloadZip;
$("clearBtn").onclick = () => { for (const f of state.files) if (f.result) URL.revokeObjectURL(f.result.url); state.files = []; state.sel = null; renderAll(); renderTags(); setStatus("Add a track to start."); };
detectCaps().then(renderAll);
