// Encore Last Call: the page. A release preflight: each file is read and
// decoded in the browser (nothing is uploaded), measured in a worker
// (lastcall-worker.js), and shown as pass / note / warning / fail with how to
// fix each problem. The checks themselves live in lastcall-core.js.
import { readFileInfo, decodeWav, imageInfo, buildChecks, coverCheck, albumChecks, verdict, reportText, STATUS, worst, fmtTime, fmtLength, isSegue } from "./lastcall-core.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const f1 = (x) => (Math.round(x * 10) / 10).toFixed(1);

// ---------- the worker ----------
const worker = new Worker("lastcall-worker.js", { type: "module" });
const jobs = new Map();
let jobId = 0;
worker.onmessage = (e) => {
  const d = e.data, j = jobs.get(d.id);
  if (!j) return;
  if (d.type === "progress") return j.onProgress(d.fraction);
  jobs.delete(d.id);
  if (d.type === "done") j.resolve(d.m); else j.reject(new Error(d.message));
};
worker.onerror = (e) => { for (const j of jobs.values()) j.reject(new Error(e.message || "The measuring thread stopped.")); jobs.clear(); };
const measure = (chans, fs, info, onProgress) => new Promise((resolve, reject) => {
  const id = ++jobId;
  jobs.set(id, { resolve, reject, onProgress });
  worker.postMessage({ id, chans, fs, bitDepth: info.bitDepth, float: info.float }, chans.map((c) => c.buffer));
});

// ---------- state ----------
const state = { tracks: [], album: [], gaps: [], cover: null, coverCheck: null, added: null, running: false };
window.__lastcall = state; // read by the headless browser check

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|bmp|tiff?|heic|avif)$/i;
const isImage = (f) => (f.type || "").startsWith("image/") || IMAGE_EXT.test(f.name);

// Decode at the file's own sample rate so nothing is resampled before measuring
async function decode(file, info) {
  const rate = info.sampleRate >= 3000 && info.sampleRate <= 768000 ? info.sampleRate : 48000;
  try {
    const ctx = new OfflineAudioContext(1, 1, rate);
    const buf = await ctx.decodeAudioData(await file.arrayBuffer());
    const chans = [];
    for (let c = 0; c < buf.numberOfChannels; c++) { const a = new Float32Array(buf.length); buf.copyFromChannel(a, c); chans.push(a); }
    return { chans, fs: buf.sampleRate };
  } catch (err) {
    // a WAV the browser won't take (an unusual header): read the samples ourselves
    if (info.container === "wav") { const d = decodeWav(await file.arrayBuffer()); if (d && d.chans.length) return { chans: d.chans, fs: d.fs }; }
    throw new Error(info.container === "unknown" ? "This doesn't look like an audio file." : "Your browser couldn't decode this file.");
  }
}

// ---------- cover art ----------
async function setCover(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (state.added?.url) URL.revokeObjectURL(state.added.url);
  state.added = { name: file.name, img: imageInfo(bytes), url: URL.createObjectURL(file) };
  showCoverName();
}
function showCoverName() {
  const el = $("coverName");
  el.innerHTML = state.added ? `<b>${esc(state.added.name)}</b> added. <button class="linkish" id="coverRemove" type="button">Remove</button>` : "";
  $("coverRemove")?.addEventListener("click", (e) => { e.stopPropagation(); if (state.added?.url) URL.revokeObjectURL(state.added.url); state.added = null; showCoverName(); });
}
function pickCover() {
  if (state.cover?.url && state.cover.url !== state.added?.url) URL.revokeObjectURL(state.cover.url);
  state.cover = null;
  if (state.added) { state.cover = { url: state.added.url, img: state.added.img, source: "added" }; return; }
  const t = state.tracks.find((x) => x.info?.art?.bytes?.length);
  if (t) state.cover = { url: URL.createObjectURL(new Blob([t.info.art.bytes], { type: t.info.art.mime || "image/jpeg" })), img: imageInfo(t.info.art.bytes),
    source: state.tracks.length > 1 ? `embedded in "${t.name}"` : "embedded in the file" };
}

// ---------- running the checks ----------
async function run(files) {
  state.running = true;
  document.body.dataset.state = "working";
  $("startView").classList.add("hidden"); $("report").classList.add("hidden");
  $("err").classList.add("hidden");
  const prog = $("progress");
  prog.classList.remove("hidden"); prog.innerHTML = "";

  // read every header first: that's how the album is put in order
  const tracks = [];
  for (const file of files) {
    let info;
    try { info = readFileInfo(new Uint8Array(await file.arrayBuffer()), file.name); }
    catch { info = readFileInfo(new Uint8Array(0), file.name); }
    tracks.push({ file, name: file.name.replace(/\.[^.]+$/, ""), info, m: null, checks: [], error: "" });
  }
  const num = (t) => parseInt(String(t.info.tags.track || ""), 10);
  if (tracks.length > 1 && tracks.every((t) => num(t) > 0) && new Set(tracks.map(num)).size === tracks.length) tracks.sort((a, b) => num(a) - num(b));
  else tracks.sort((a, b) => a.file.name.localeCompare(b.file.name, undefined, { numeric: true, sensitivity: "base" }));

  const rows = tracks.map((t) => {
    const row = document.createElement("div");
    row.className = "prow";
    row.innerHTML = `<span class="pname">${esc(t.file.name)}</span><span class="pstate">Waiting</span><span class="ptrack"><i></i></span>`;
    prog.append(row);
    return { state: row.querySelector(".pstate"), bar: row.querySelector("i") };
  });
  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i], row = rows[i];
    try {
      row.state.textContent = "Decoding";
      const { chans, fs } = await decode(t.file, t.info);
      row.state.textContent = "Measuring";
      t.m = await measure(chans, fs, t.info, (f) => { row.bar.style.width = `${Math.round(f * 100)}%`; });
      row.bar.style.width = "100%"; row.state.textContent = "Done";
    } catch (err) {
      t.error = err.message || String(err);
      row.state.textContent = "Couldn't read it";
    }
  }
  state.tracks = tracks;
  finish();
  state.running = false;
}

function finish() {
  const tracks = state.tracks, ok = tracks.filter((t) => t.m);
  // album first: a track that runs into the next one isn't "cut off"
  const order = ok.map((t) => ({ name: t.name, info: t.info, m: t.m }));
  const alb = tracks.length > 1 ? albumChecks(order) : { checks: [], gaps: [] };
  state.album = alb.checks; state.gaps = alb.gaps;
  ok.forEach((t, i) => {
    const segueIn = i > 0 && isSegue(ok[i - 1].m, t.m), segueOut = i + 1 < ok.length && isSegue(t.m, ok[i + 1].m);
    t.checks = buildChecks(t.m, t.info, { segueIn, segueOut });
  });
  for (const t of tracks) if (!t.m) t.checks = [{ id: "read", title: "Reading the file", status: "fail", value: "couldn't read it", detail: t.error,
    fix: "Export the master again as a WAV (24-bit or 16-bit, 44.1 or 48 kHz) and check that one." }];
  pickCover();
  state.coverCheck = coverCheck(state.cover?.img || null, state.cover?.source || "");
  render();
}

// ---------- the report ----------
function checkHtml(c) {
  let extra = "";
  if (c.data?.platforms) {
    extra = `<div class="mini">${c.data.platforms.map((p) => `<div class="mrow"><b>${esc(p.name)}</b><span>${esc(p.text)}</span><span class="num">plays at ${f1(p.plays)} LUFS</span></div>`).join("")}</div>`;
  }
  if (c.data?.bands && c.status !== "pass") {
    extra = `<div class="mini">${c.data.bands.map((b) => {
      const v = Math.max(-1, Math.min(1, b.corr)), left = v < 0 ? 50 + v * 50 : 50, width = Math.abs(v) * 50;
      const color = v < 0 ? "var(--red)" : v < 0.5 ? "var(--warn)" : "var(--green)";
      return `<div class="mrow"><b>${esc(b.name)} <span class="tmeta">${esc(b.hz)}</span></b><span class="corrbar" title="left/right correlation: +1 same, 0 unrelated, -1 opposite"><i style="left:${left}%;width:${width}%;background:${color}"></i></span><span class="num">${b.corr.toFixed(2)}</span></div>`;
    }).join("")}<div class="tmeta">Bars: how alike left and right are in each range (+1 the same, below 0 canceling in mono).</div></div>`;
  }
  return `<div class="check s-${c.status}"><div class="badge">${STATUS[c.status]}</div><div class="cbody">
    <div class="ctitle">${esc(c.title)} <span class="val">${esc(c.value)}</span></div>
    ${c.detail ? `<p>${esc(c.detail)}</p>` : ""}
    ${c.fix && c.status !== "pass" ? `<p class="fix"><b>How to fix:</b> ${esc(c.fix)}</p>` : ""}${extra}</div></div>`;
}

// short-term loudness across the song, with a mark wherever a check found something
function timelineHtml(t) {
  const tl = t.m.timeline || [], dur = t.m.duration;
  if (tl.length < 2 || !dur) return "";
  const W = 600, H = 54, bw = W / tl.length;
  const bars = tl.map((v, i) => { const h = Math.max(1, Math.min(1, (v + 45) / 45) * (H - 10)); return `<rect x="${(i * bw).toFixed(1)}" y="${(H - 4 - h).toFixed(1)}" width="${Math.max(0.6, bw - 0.6).toFixed(1)}" height="${h.toFixed(1)}" fill="var(--soft)" opacity="0.35"/>`; }).join("");
  const colors = { fail: "var(--red)", warn: "var(--warn)", note: "var(--blue)" };
  const marks = [];
  for (const c of t.checks) if (c.times?.length && colors[c.status]) for (const s of c.times.slice(0, 40)) {
    const x = Math.max(1.5, Math.min(W - 1.5, (s / dur) * W));
    marks.push(`<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="3" y2="${H - 3}" stroke="${colors[c.status]}" stroke-width="2"><title>${esc(c.title)} at ${fmtTime(s)}</title></line>`);
  }
  const legend = [...new Set(t.checks.filter((c) => c.times?.length && colors[c.status]).map((c) => c.status))]
    .map((s) => `<span><i style="background:${colors[s]}"></i>${STATUS[s]}</span>`).join("");
  return `<div class="timeline"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Loudness across the song${marks.length ? ", with marks where problems were found" : ""}">${bars}${marks.join("")}</svg>
    <div class="tlabels"><span>0:00</span><span class="tlegend">${legend || "Loudness across the song"}</span><span>${fmtTime(dur)}</span></div></div>`;
}

function formatShort(info, m) {
  if (!info) return "";
  const rate = info.sampleRate || m?.fs;
  return [info.label, info.lossy ? (info.bitrate ? `${info.bitrate} kbps` : "") : info.bitDepth ? `${info.bitDepth}-bit${info.float ? " float" : ""}` : "", rate ? `${Number((rate / 1000).toFixed(2))} kHz` : ""].filter(Boolean).join(" ");
}

function render() {
  const all = [...state.album, state.coverCheck, ...state.tracks.flatMap((t) => t.checks)];
  const v = verdict(all);
  $("verdict").className = `verdict v-${v.key}`;
  $("vicon").textContent = v.key === "ready" ? "✓" : "!";
  $("vlabel").textContent = v.label;
  $("vsum").textContent = `${state.tracks.length > 1 ? `${state.tracks.length} tracks. ` : ""}${v.summary}`;

  // album: a table of every track, then the album checks
  const album = $("albumBlock");
  if (state.tracks.length > 1) {
    const gapAfter = new Map(state.gaps.map((g) => [g.from, g]));
    const rows = state.tracks.map((t, i) => {
      const st = worst(t.checks.map((c) => c.status)), g = gapAfter.get(t.name);
      return `<tr><td class="n">${i + 1}</td><td class="name"><span class="dot s-${st}"></span>${esc(t.name)}</td><td class="n">${t.m ? fmtLength(t.m.duration) : ""}</td>
        <td class="n">${t.m ? f1(t.m.lufs) + " LUFS" : ""}</td><td class="n">${t.m ? f1(t.m.truePeakDb) + " dBTP" : ""}</td><td>${esc(formatShort(t.info, t.m))}</td>
        <td class="n">${g ? (g.segue ? "segue" : f1(g.gap) + " s") : ""}</td></tr>`;
    }).join("");
    album.innerHTML = `<section class="block"><h3>Album</h3><div class="tablewrap"><table class="tracks"><thead><tr><th>#</th><th>Track</th><th>Length</th><th>Loudness</th><th>True peak</th><th>Format</th><th>Gap after</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="checks">${state.album.map(checkHtml).join("")}</div></section>`;
  } else album.innerHTML = "";

  $("coverChecks").innerHTML = checkHtml(state.coverCheck);
  const thumb = $("thumb");
  if (state.cover?.url && ["jpeg", "png", "gif", "webp", "bmp", "avif"].includes(state.cover.img.type)) { thumb.src = state.cover.url; thumb.classList.remove("hidden"); }
  else { thumb.removeAttribute("src"); thumb.classList.add("hidden"); }

  const many = state.tracks.length > 1;
  $("tracks").innerHTML = state.tracks.map((t, i) => {
    const st = worst(t.checks.map((c) => c.status)), open = !many || st === "fail" || st === "warn";
    const meta = t.m ? [fmtLength(t.m.duration), `${f1(t.m.lufs)} LUFS`, formatShort(t.info, t.m)].join(" · ") : "";
    // problems first, then notes, then what passed
    const rank = { fail: 0, warn: 1, note: 2, pass: 3 }, sorted = t.checks.map((c, k) => ({ c, k })).sort((a, b) => rank[a.c.status] - rank[b.c.status] || a.k - b.k).map((x) => x.c);
    // what passed folds into one line, so what needs a look stands out
    const issues = sorted.filter((c) => c.status !== "pass"), passed = sorted.filter((c) => c.status === "pass");
    const passedHtml = passed.length ? `<details class="passed"><summary><span class="dot s-pass"></span>${passed.length} check${passed.length > 1 ? "s" : ""} passed: ${esc(passed.map((c) => c.title).join(", "))}</summary>
      <div class="checks">${passed.map(checkHtml).join("")}</div></details>` : "";
    return `<details class="track" ${open ? "open" : ""}><summary><span class="dot s-${st}"></span><span class="tname">${many ? `${i + 1}. ` : ""}${esc(t.name)}</span><span class="tmeta">${esc(meta)}</span></summary>
      ${t.m ? timelineHtml(t) : ""}<div class="checks">${issues.map(checkHtml).join("")}</div>${passedHtml}</details>`;
  }).join("");

  $("progress").classList.add("hidden");
  $("report").classList.remove("hidden");
  document.body.dataset.state = "done";
}

function textReport() {
  return reportText({ tracks: state.tracks.map((t) => ({ name: t.name, m: t.m, checks: t.checks })), album: state.album, cover: state.coverCheck });
}

// ---------- wiring ----------
async function handle(list) {
  if (state.running) return;
  const files = [...list], images = files.filter(isImage), audio = files.filter((f) => !isImage(f));
  if (images.length) await setCover(images[0]);
  if (audio.length) return run(audio);
  if (images.length && state.tracks.length) { // a new cover for the report on screen
    pickCover();
    state.coverCheck = coverCheck(state.cover?.img || null, state.cover?.source || "");
    render();
  }
}

$("files").addEventListener("change", (e) => { handle(e.target.files); e.target.value = ""; });
$("coverFile").addEventListener("change", (e) => { handle(e.target.files); e.target.value = ""; });
$("drop").addEventListener("click", (e) => { if (!e.target.closest("button")) $("files").click(); });
$("chooseBtn").addEventListener("click", () => $("files").click());
$("coverBtn").addEventListener("click", (e) => { e.stopPropagation(); $("coverFile").click(); });
$("coverBtn2").addEventListener("click", () => $("coverFile").click());

// drop anywhere on the page
let dragDepth = 0;
window.addEventListener("dragenter", (e) => { e.preventDefault(); dragDepth++; $("drop").classList.add("over"); });
window.addEventListener("dragleave", () => { if (--dragDepth <= 0) { dragDepth = 0; $("drop").classList.remove("over"); } });
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => { e.preventDefault(); dragDepth = 0; $("drop").classList.remove("over"); if (e.dataTransfer?.files?.length) handle(e.dataTransfer.files); });

// print: every track opened up, then back as it was
let wasOpen = [];
window.addEventListener("beforeprint", () => { wasOpen = [...document.querySelectorAll("details.track, details.passed")].map((d) => d.open); document.querySelectorAll("details.track, details.passed").forEach((d) => (d.open = true)); });
window.addEventListener("afterprint", () => { document.querySelectorAll("details.track, details.passed").forEach((d, i) => (d.open = wasOpen[i] ?? d.open)); });
$("printBtn").addEventListener("click", () => window.print());

$("copyBtn").addEventListener("click", async () => {
  const text = textReport();
  try { await navigator.clipboard.writeText(text); }
  catch {
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.append(ta); ta.select();
    try { document.execCommand("copy"); } catch {}
    ta.remove();
  }
  $("copied").classList.remove("hidden");
  setTimeout(() => $("copied").classList.add("hidden"), 1800);
});
$("againBtn").addEventListener("click", () => {
  $("report").classList.add("hidden"); $("startView").classList.remove("hidden");
  document.body.dataset.state = "idle";
  window.scrollTo(0, 0);
});
window.__lastcallText = textReport;
document.body.dataset.state = "idle";
