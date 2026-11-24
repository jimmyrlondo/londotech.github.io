// ENCORE. Voicebank: the voicebank recorder page. Plays a count-in and the note, records each sound,
// checks it, sets the oto.ini timing automatically, keeps everything in this browser and exports
// an OpenUtau-ready zip.
import { analyzeTake, analyzeLine, kindOf, levelCheck, midiToHz, noteName, wavMono16, readWavMono16, resampleLinear, buildVoicebank, TERMS, folderName } from "./voicebank-core.js";
import { LISTS, ALL_ENTRIES, hintFor, sayFor, customEntry, syllables } from "./voicebank-lists.js";
import * as store from "./voicebank-store.js";
import { zip } from "./zip.js";

const $ = (id) => document.getElementById(id);
const OUT_SR = 44100;
const DEFAULTS = { name: "New voicebank", author: "", list: "basic", midi: 57, tempo: 100, auto: true, guideHold: false, extras: [], terms: "open", web: "", micId: "", channel: -1 };

let project = null, takes = new Map(), idx = 0, busy = false, lastTake = null;
let ctx = null, stream = null, node = null, srcNode = null, pendingTake = null, iconBlob = null;

// ---------- data ----------
const entries = () => [...LISTS[project.list].entries, ...(project.extras || [])];
const cur = () => entries()[idx];
const takesHere = () => [...takes.values()].filter((t) => t.midi === project.midi);
const takeFor = (key) => takes.get(store.takeId(project.id, project.midi, key));

async function loadProject(p) {
  project = { ...DEFAULTS, ...p };
  takes = new Map((await store.listTakes(project.id)).map((t) => [t.id, t]));
  iconBlob = project.icon ?? null;
  idx = Math.max(0, entries().findIndex((e) => !takeFor(e.key)));
  if (idx < 0) idx = 0;
  lastTake = null;
  try { localStorage.setItem("encore-vocalsynth-last", project.id); } catch {}
  fillSetup(); render();
}
async function newProject() {
  const p = { ...DEFAULTS, id: "vb" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) };
  await store.saveProject(p);
  await loadProject(p);
  renderBanks();
}
const save = () => store.saveProject(project).then(renderBanks);

// ---------- audio ----------
async function ensureAudio() {
  if (!ctx) {
    ctx = new AudioContext({ latencyHint: "interactive" });
    await ctx.audioWorklet.addModule("voicebank-worklet.js");
  }
  if (ctx.state !== "running") await ctx.resume();
}
async function micOn() {
  await ensureAudio();
  if (stream) stream.getTracks().forEach((t) => t.stop());
  if (srcNode) srcNode.disconnect();
  const audio = { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 2 } };
  if (project.micId) audio.deviceId = { exact: project.micId };
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio });
  } catch (e) {
    if (project.micId) { project.micId = ""; save(); return micOn(); }
    throw new Error("We couldn't open the microphone. Allow microphone access for this page in the browser's address bar, then try again.");
  }
  const track = stream.getAudioTracks()[0], st = track.getSettings?.() ?? {};
  srcNode = ctx.createMediaStreamSource(stream);
  if (!node) {
    node = new AudioWorkletNode(ctx, "voicebank-capture", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], channelCountMode: "explicit", channelCount: Math.max(1, st.channelCount || 2) });
    const sink = ctx.createGain(); sink.gain.value = 0;
    node.connect(sink).connect(ctx.destination);
    node.port.onmessage = onWorklet;
  } else node.channelCount = Math.max(1, st.channelCount || 2);
  srcNode.connect(node);
  node.port.postMessage({ cmd: "channel", channel: Number(project.channel) });
  $("micName").textContent = track.label || "Microphone";
  // what the browser would not switch off, and wireless delay
  const warn = [];
  if (st.noiseSuppression || st.echoCancellation || st.autoGainControl) warn.push("This browser kept some of its voice processing on (noise suppression, echo cancelling or automatic volume). Takes can sound dull or pumpy. Chrome or Edge on a computer usually lets it switch off.");
  if (/bluetooth|hands-?free/i.test(track.label || "")) warn.push("This looks like a wireless microphone or headset. Wireless adds delay and lowers quality; a wired microphone makes a much better voicebank.");
  $("micWarn").textContent = warn.join(" ");
  $("micWarn").classList.toggle("hidden", !warn.length);
  await fillDevices(st.channelCount || 1);
  $("micOn").textContent = "Restart the microphone";
}
async function fillDevices(channels) {
  const devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput");
  const sel = $("fMic");
  sel.innerHTML = `<option value="">Default microphone</option>` + devs.filter((d) => d.deviceId && d.deviceId !== "default").map((d) => `<option value="${d.deviceId}">${escapeHtml(d.label || "Microphone")}</option>`).join("");
  sel.value = project.micId || "";
  const ch = $("fChan");
  ch.innerHTML = `<option value="-1">All channels mixed</option>` + Array.from({ length: channels > 1 ? channels : 0 }, (_, i) => `<option value="${i}">Input ${i + 1} only</option>`).join("");
  ch.value = String(channels > 1 ? project.channel : -1);
}
function onWorklet(e) {
  const m = e.data;
  if (m.take) { pendingTake?.(m); pendingTake = null; return; }
  const dB = m.peak > 0 ? 20 * Math.log10(m.peak) : -90;
  const bar = $("meterBar");
  bar.style.width = Math.max(0, Math.min(100, ((dB + 60) / 60) * 100)) + "%";
  bar.className = m.pinned ? "clip" : dB > -6 ? "hot" : "";
  $("meterDb").textContent = dB > -89 ? `${dB.toFixed(0)} dB` : "";
}

function tone(midi, at, len, level = 0.16) {
  const f = midiToHz(midi), g = ctx.createGain();
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(level, at + 0.03);
  g.gain.setValueAtTime(level, at + Math.max(0.04, len - 0.08));
  g.gain.linearRampToValueAtTime(0, at + len);
  g.connect(ctx.destination);
  for (const [mul, amp] of [[1, 1], [2, 0.35], [3, 0.12]]) {
    const o = ctx.createOscillator(), a = ctx.createGain();
    o.frequency.value = f * mul; a.gain.value = amp;
    o.connect(a).connect(g); o.start(at); o.stop(at + len + 0.02);
  }
}
function click(at, accent) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = "square"; o.frequency.value = accent ? 2000 : 1400;
  g.gain.setValueAtTime(accent ? 0.22 : 0.15, at);
  g.gain.exponentialRampToValueAtTime(0.0005, at + 0.04);
  o.connect(g).connect(ctx.destination); o.start(at); o.stop(at + 0.05);
}

async function hearNote() {
  try { await ensureAudio(); tone(project.midi, ctx.currentTime + 0.05, 1.2, 0.2); } catch (e) { showErr(e.message); }
}

// ---------- example pronunciation (the device's Japanese speaking voice) ----------
function voiceFor(lang) {
  if (!("speechSynthesis" in window)) return null;
  const vs = speechSynthesis.getVoices().filter((v) => new RegExp("^" + lang, "i").test(v.lang));
  const pref = lang === "en" ? vs.filter((v) => /en[-_]US/i.test(v.lang)) : [];
  return [...pref, ...vs].find((v) => /natural|online/i.test(v.name)) ?? pref[0] ?? vs[0] ?? null;
}
const exampleVoice = (e) => (e.custom || e.key === "br" ? null : voiceFor(e.lang === "en" ? "en" : "ja"));
function sayExample() {
  const e = cur(), v = exampleVoice(e);
  if (!v) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(e.lang === "en" ? syllables(e.phones).map((x) => x.text).join(", ") : e.kana);
  u.voice = v; u.lang = v.lang; u.rate = e.lang === "en" ? 0.7 : 0.75;
  speechSynthesis.speak(u);
}
if ("speechSynthesis" in window) speechSynthesis.addEventListener?.("voiceschanged", () => project && render());

async function record() {
  if (busy) return;
  showErr("");
  try {
    if (!stream) await micOn(); else await ensureAudio();
  } catch (e) { showErr(e.message); return; }
  busy = true;
  $("recBtn").disabled = true; $("recBtn").textContent = "Listening...";
  const e = cur(), beat = 60 / project.tempo, isLine = e.lang === "en", nSyl = isLine ? syllables(e.phones).length : 1;
  const singLen = isLine ? nSyl * beat + 0.45 : Math.max(1.6, 2.5 * beat);
  const T = ctx.currentTime + 0.15, singAt = T + 3 * beat, dur = 3 * beat + singLen + 0.6;
  const got = new Promise((res) => { pendingTake = res; });
  node.port.postMessage({ cmd: "rec", at: T, dur });
  for (let i = 0; i < 3; i++) click(T + i * beat, i === 0);
  tone(project.midi, T, 3 * beat - 0.1, 0.13);
  if (project.guideHold) tone(project.midi, singAt, singLen, 0.08);
  lights(T, beat, singAt, singLen, isLine ? nSyl : 0);
  const { take: x, sr } = await got;
  $("recBtn").textContent = "Checking...";
  try {
    await finishTake(e, x, sr, 3 * beat + (ctx.outputLatency || ctx.baseLatency || 0.01), beat);
  } catch (err) { showErr("Something went wrong checking that take: " + err.message); }
  busy = false;
  $("recBtn").disabled = false; $("recBtn").textContent = takeFor(cur().key) ? "Redo" : "Record";
}
function lights(T, beat, singAt, singLen, nSyl) {
  const spans = [...$("count").children], syl = [...$("kana").querySelectorAll("span")];
  const tick = () => {
    const t = ctx.currentTime;
    if (nSyl) { const k = Math.floor((t - singAt) / beat); syl.forEach((s, i) => s.classList.toggle("now", t >= singAt && i === Math.min(k, nSyl - 1) && t < singAt + singLen)); }
    spans.forEach((s, i) => {
      if (i < 3) s.classList.toggle("lit", t >= T + i * beat && t < T + i * beat + beat * 0.45);
      else s.classList.toggle("lit", t >= singAt && t < singAt + singLen);
    });
    if (t < singAt + singLen + 0.05) requestAnimationFrame(tick);
    else { spans.forEach((s) => s.classList.remove("lit")); syl.forEach((s) => s.classList.remove("now")); }
  };
  requestAnimationFrame(tick);
}

async function finishTake(e, x, sr, expectedStart, beat) {
  const kind = kindOf(e);
  const r = kind === "line" ? analyzeLine(x, sr, { expectedStart, beat, phones: e.phones, targetMidi: project.midi }) : analyzeTake(x, sr, { expectedStart, targetMidi: project.midi, kind });
  const same = (t) => (kind === "line") === (t.kind === "line");
  const lc = r.levelDb > -100 && kind !== "breath" && kind !== "custom" ? levelCheck(r.levelDb, takesHere().filter((t) => t.key !== e.key && t.kind !== "breath" && t.kind !== "custom" && same(t)).map((t) => t.levelDb)) : null;
  if (lc) { r.checks.push(lc); if (r.level === "ok") r.level = "warn"; }
  if (r.level === "fail") {
    showResult(r, null, takeFor(e.key) ? "Your earlier take of this sound is kept." : "");
    return;
  }
  // keep just the sound plus a little room either side, at 44.1 kHz
  const a = Math.max(0, r.onset - 0.25), b = Math.min(x.length / sr, r.end + 0.3);
  const cut = x.subarray(Math.floor(a * sr), Math.ceil(b * sr));
  const y = await resample(cut, sr);
  const move = (o) => ({ ...o, offset: Math.max(0, Math.round(o.offset - a * 1000)) });
  const oto = kind === "line" ? r.otos.map(move) : move(r.oto);
  const segments = kind === "line" ? r.segments.map((g) => ({ ph: g.ph, start: Math.round((g.start - a) * 1000), end: Math.round((g.end - a) * 1000) })) : null;
  const t = await store.saveTake({ projectId: project.id, midi: project.midi, key: e.key, kind, wav: new Blob([wavMono16(y, OUT_SR)], { type: "audio/wav" }),
    oto, segments, level: r.level, checks: r.checks, levelDb: r.levelDb, cents: r.cents });
  takes.set(t.id, t);
  lastTake = { take: t, samples: y };
  save();
  showResult(r, lastTake);
  render();
  if (project.auto && r.level === "ok") setTimeout(() => { if (!busy && cur() === e) { goNextEmpty(); } }, 700);
}
async function resample(x, sr) {
  if (sr === OUT_SR) return x;
  try {
    const n = Math.ceil((x.length * OUT_SR) / sr), off = new OfflineAudioContext(1, n, OUT_SR);
    const buf = off.createBuffer(1, x.length, sr); buf.copyToChannel(x, 0);
    const s = off.createBufferSource(); s.buffer = buf; s.connect(off.destination); s.start();
    return (await off.startRendering()).getChannelData(0).slice();
  } catch { return resampleLinear(x, sr, OUT_SR); }
}
async function playTake() {
  const t = takeFor(cur().key);
  if (!t) return;
  await ensureAudio();
  const buf = await ctx.decodeAudioData(await t.wav.arrayBuffer());
  const s = ctx.createBufferSource(); s.buffer = buf; s.connect(ctx.destination); s.start();
}

// ---------- results and the marker editor ----------
const COLORS = { offset: "#8a8580", overlap: "#22c55e", preutter: "#ff3b00", consonant: "#3b82f6", cutoff: "#8a8580" };
let wave = null; // { samples, abs: {offset, overlap, preutter, consonant, cutoff} in ms, take }

function showResult(r, lt, extra = "") {
  const ul = $("checks");
  const lines = r.checks.length ? r.checks : [{ level: "ok", text: r.cents != null ? `Good take. On pitch (${r.cents >= 0 ? "+" : ""}${r.cents} cents).` : "Good take." }];
  ul.innerHTML = lines.map((c) => `<li class="${c.level}">${escapeHtml(c.text)}</li>`).join("") + (extra ? `<li class="warn">${escapeHtml(extra)}</li>` : "");
  $("resultTip").classList.add("hidden");
  if (lt) loadWave(lt.take, lt.samples); else hideWave();
}
async function showStored() {
  const t = takeFor(cur().key);
  $("playBtn").disabled = !t;
  if (!t) { $("checks").innerHTML = ""; $("resultTip").classList.remove("hidden"); hideWave(); return; }
  $("resultTip").classList.add("hidden");
  const lines = t.checks?.length ? t.checks : [{ level: "ok", text: "Recorded. Looks good." }];
  $("checks").innerHTML = lines.map((c) => `<li class="${c.level}">${escapeHtml(c.text)}</li>`).join("");
  const { x } = readWavMono16(new Uint8Array(await t.wav.arrayBuffer()));
  if (takeFor(cur().key) === t) loadWave(t, x);
}
function hideWave() { wave = null; $("wave").classList.add("hidden"); $("legend").classList.add("hidden"); $("otoNums").textContent = ""; }
function loadWave(t, samples) {
  const o = t.oto;
  if (Array.isArray(o)) {
    wave = { take: t, samples, segments: t.segments || [] };
    $("wave").classList.remove("hidden"); $("legend").classList.add("hidden");
    drawWave();
    return;
  }
  wave = { take: t, samples, abs: { offset: o.offset, overlap: o.offset + o.overlap, preutter: o.offset + o.preutter, consonant: o.offset + o.consonant, cutoff: o.offset - o.cutoff } };
  $("wave").classList.remove("hidden"); $("legend").classList.remove("hidden");
  drawWave();
}
function drawWave() {
  if (!wave) return;
  const c = $("wave"), dpr = window.devicePixelRatio || 1, W = c.clientWidth, H = c.clientHeight;
  c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
  const g = c.getContext("2d"); g.scale(dpr, dpr); g.clearRect(0, 0, W, H);
  const s = wave.samples, durMs = (s.length / OUT_SR) * 1000, X = (ms) => (ms / durMs) * W;
  if (wave.segments) { drawSegments(g, s, W, H, X); return; }
  const a = wave.abs;
  g.fillStyle = "rgba(255,255,255,0.05)"; g.fillRect(X(a.consonant), 0, X(a.cutoff) - X(a.consonant), H);
  g.fillStyle = "rgba(255,59,0,0.10)"; g.fillRect(X(a.offset), 0, X(a.preutter) - X(a.offset), H);
  g.strokeStyle = "rgba(245,240,235,0.75)"; g.beginPath();
  const step = s.length / W;
  for (let px = 0; px < W; px++) {
    let lo = 0, hi = 0;
    for (let i = Math.floor(px * step); i < Math.floor((px + 1) * step); i++) { if (s[i] < lo) lo = s[i]; if (s[i] > hi) hi = s[i]; }
    g.moveTo(px + 0.5, H / 2 - hi * H * 0.48); g.lineTo(px + 0.5, H / 2 - lo * H * 0.48);
  }
  g.stroke();
  g.fillStyle = "rgba(0,0,0,0.35)";
  g.fillRect(0, 0, X(a.offset), H); g.fillRect(X(a.cutoff), 0, W - X(a.cutoff), H);
  for (const k of ["offset", "overlap", "preutter", "consonant", "cutoff"]) {
    g.strokeStyle = COLORS[k]; g.lineWidth = k === "preutter" ? 2.5 : 2;
    g.beginPath(); g.moveTo(X(a[k]), 0); g.lineTo(X(a[k]), H); g.stroke();
  }
  const o = wave.take.oto;
  $("otoNums").textContent = `oto: start ${o.offset} · fixed ${o.consonant} · end ${o.cutoff} · note start ${o.preutter} · overlap ${o.overlap} (ms)`;
}
function drawPeaks(g, s, W, H) {
  g.strokeStyle = "rgba(245,240,235,0.75)"; g.lineWidth = 1; g.beginPath();
  const step = s.length / W;
  for (let px = 0; px < W; px++) {
    let lo = 0, hi = 0;
    for (let i = Math.floor(px * step); i < Math.floor((px + 1) * step); i++) { if (s[i] < lo) lo = s[i]; if (s[i] > hi) hi = s[i]; }
    g.moveTo(px + 0.5, H / 2 - hi * H * 0.48); g.lineTo(px + 0.5, H / 2 - lo * H * 0.48);
  }
  g.stroke();
}
// English takes: each sound shaded and labelled (vowels orange, consonants blue)
function drawSegments(g, s, W, H, X) {
  const V = /^(aa|ae|ah|ao|aw|ay|eh|er|ey|ih|iy|ow|oy|uh|uw)$/;
  for (const seg of wave.segments) {
    g.fillStyle = V.test(seg.ph) ? "rgba(255,59,0,0.16)" : "rgba(59,130,246,0.22)";
    g.fillRect(X(seg.start), 0, Math.max(1, X(seg.end) - X(seg.start)), H);
  }
  drawPeaks(g, s, W, H);
  g.font = "11px Space Mono, monospace"; g.textBaseline = "top"; g.fillStyle = "#f5f0eb";
  for (const seg of wave.segments) g.fillText(seg.ph, X(seg.start) + 2, 3);
  $("otoNums").textContent = `${wave.take.oto.length} joins cut from this line automatically. If one sounds off, fine-tune it in OpenUtau's oto editor.`;
}
function markerDrag() {
  const c = $("wave");
  let drag = null;
  const msAt = (ev) => { const r = c.getBoundingClientRect(); return ((ev.clientX - r.left) / r.width) * (wave.samples.length / OUT_SR) * 1000; };
  c.addEventListener("pointerdown", (ev) => {
    if (!wave || wave.segments) return;
    const r = c.getBoundingClientRect(), durMs = (wave.samples.length / OUT_SR) * 1000;
    let best = null, bd = 12;
    for (const k of ["preutter", "overlap", "consonant", "offset", "cutoff"]) {
      const d = Math.abs(((wave.abs[k] / durMs) * r.width) - (ev.clientX - r.left));
      if (d < bd) { bd = d; best = k; }
    }
    if (!best) return;
    drag = best; c.setPointerCapture(ev.pointerId); ev.preventDefault();
  });
  c.addEventListener("pointermove", (ev) => {
    if (!drag || !wave || wave.segments) return;
    const a = wave.abs, durMs = (wave.samples.length / OUT_SR) * 1000;
    let v = Math.max(0, Math.min(durMs, msAt(ev)));
    if (drag === "offset") v = Math.min(v, a.preutter, a.overlap);
    if (drag === "overlap") v = Math.max(a.offset, Math.min(v, a.consonant));
    if (drag === "preutter") v = Math.max(a.offset, Math.min(v, a.consonant));
    if (drag === "consonant") v = Math.max(a.preutter, Math.min(v, a.cutoff - 20));
    if (drag === "cutoff") v = Math.max(a.consonant + 20, v);
    a[drag] = Math.round(v);
    wave.take.oto = { offset: a.offset, overlap: a.overlap - a.offset, preutter: a.preutter - a.offset, consonant: a.consonant - a.offset, cutoff: -(a.cutoff - a.offset) };
    drawWave();
  });
  const end = async () => { if (!drag) return; drag = null; const t = await store.saveTake(wave.take); takes.set(t.id, t); };
  c.addEventListener("pointerup", end); c.addEventListener("pointercancel", end);
}

// ---------- navigation and rendering ----------
function go(i) {
  const n = entries().length;
  idx = ((i % n) + n) % n;
  lastTake = null;
  render();
}
function goNextEmpty() {
  const list = entries(), n = list.length;
  for (let k = 1; k <= n; k++) { const i = (idx + k) % n; if (!takeFor(list[i].key)) return go(i); }
  go(idx + 1);
}
function render() {
  const list = entries(), e = cur();
  const k = $("kana");
  k.lang = e.lang === "en" ? "en" : "ja";
  k.classList.toggle("line", e.lang === "en");
  if (e.lang === "en") k.innerHTML = syllables(e.phones).map((x) => `<span>${escapeHtml(x.text)}</span>`).join(" ");
  else k.textContent = e.custom ? e.label : e.kana;
  k.style.fontSize = e.custom && e.label.length > 5 ? "48px" : "";
  $("romaji").textContent = e.custom ? "extra" : e.lang === "en" ? e.phones.join(" ") : e.key;
  $("hint").textContent = hintFor(e);
  $("say").textContent = sayFor(e);
  $("guideBtn").textContent = `Hear ${noteName(project.midi)}`;
  $("exampleBtn").disabled = !exampleVoice(e);
  $("bankName").textContent = project.name || "Untitled voicebank";
  const here = list.map((x) => takeFor(x.key)), done = here.filter(Boolean).length;
  $("bankMeta").textContent = `note ${noteName(project.midi)} · ${done} of ${list.length}`;
  const cnt = { ok: 0, warn: 0, fail: 0 };
  here.forEach((t) => t && cnt[t.level]++);
  const pct = (n) => (n / list.length) * 100 + "%";
  $("progress").innerHTML = `<i style="width:${pct(cnt.ok)};background:var(--green)"></i><i style="width:${pct(cnt.warn)};background:var(--warn)"></i>`;
  $("recBtn").textContent = busy ? $("recBtn").textContent : takeFor(e.key) ? "Redo" : "Record";
  renderGrid(list);
  const missing = list.length - done;
  const sum = `<span><b>${cnt.ok}</b> good</span><span><b>${cnt.warn}</b> to check</span><span><b>${missing}</b> to record</span>`;
  $("summary").innerHTML = sum;
  const notes = [...new Set([...takes.values()].map((t) => t.midi))].sort((a, b) => a - b);
  $("exportSummary").innerHTML = `<span><b>${[...takes.values()].filter((t) => t.level !== "fail").length}</b> sounds recorded</span><span>notes: <b>${notes.length ? notes.map(noteName).join(", ") : "none yet"}</b></span>`;
  $("exportBtn").disabled = !takes.size || !$("fConsent").checked;
  if (lastTake && lastTake.take.key === e.key) { $("playBtn").disabled = false; } else showStored();
}
function renderGrid(list) {
  let html = "", group = null;
  list.forEach((e, i) => {
    const g = e.custom ? "Extras" : e.group === "en-c" ? "English: consonants" : e.group === "en-vv" ? "English: vowel glides" : e.group === "en-cc" ? "English: consonant pairs" : e.group === "foreign" || e.group === "f" || e.group === "v" || e.group === "w2" || e.group === "breath" ? "Extended" : "Japanese";
    if (g !== group) { if (group) html += "</div>"; html += `<div class="groupTitle">${g}</div><div class="grid">`; group = g; }
    const t = takeFor(e.key);
    html += `<button class="cell ${t ? t.level : ""} ${i === idx ? "cur" : ""}" data-i="${i}" title="${escapeHtml(e.custom ? e.label : e.key)}"><b lang="${e.lang === "en" ? "en" : "ja"}">${escapeHtml(e.custom ? e.label.slice(0, 6) : e.lang === "en" ? e.short : e.kana)}</b><small>${escapeHtml(e.custom ? "extra" : e.lang === "en" ? String(Number(e.key.slice(2))) : e.key)}</small></button>`;
  });
  $("grid").innerHTML = html + (group ? "</div>" : "");
  $("grid").querySelector(".cur")?.scrollIntoView({ block: "nearest" });
}
async function renderBanks() {
  const ps = await store.listProjects(), all = await Promise.all(ps.map(async (p) => [p, (await store.listTakes(p.id)).length]));
  $("banks").innerHTML = all.map(([p, n]) => `<li class="${p.id === project.id ? "on" : ""}"><span>${escapeHtml(p.name || "Untitled")}<small>${n} sound${n === 1 ? "" : "s"}${p.author ? " · " + escapeHtml(p.author) : ""}</small></span>${p.id === project.id ? "" : `<button class="small" data-open="${p.id}">Open</button>`}</li>`).join("");
}
function fillSetup() {
  $("fName").value = project.name; $("fAuthor").value = project.author;
  $("fList").innerHTML = Object.entries(LISTS).map(([k, l]) => `<option value="${k}">${l.name}</option>`).join("");
  $("fList").value = project.list; $("listNote").textContent = LISTS[project.list].note;
  $("fNote").innerHTML = Array.from({ length: 45 }, (_, i) => 40 + i).map((m) => `<option value="${m}">${noteName(m)}</option>`).join("");
  $("fNote").value = String(project.midi);
  $("fTempo").value = String(project.tempo); $("fAuto").checked = project.auto; $("fGuideHold").checked = project.guideHold;
  $("fTerms").value = project.terms; $("termsText").textContent = TERMS[project.terms]; $("fWeb").value = project.web;
}

// ---------- export ----------
async function exportZip() {
  $("exportErr").classList.add("hidden");
  const btn = $("exportBtn"); btn.disabled = true; btn.textContent = "Packing...";
  try {
    const byKey = new Map([...ALL_ENTRIES, ...(project.extras || []).map((e) => [e.key, e])]);
    const good = [...takes.values()].filter((t) => t.level !== "fail" && t.oto && byKey.has(t.key));
    if (!good.length) throw new Error("Record a few sounds first.");
    const folder = folderName(project.name);
    const vb = buildVoicebank({ name: project.name || "Voicebank", author: project.author, web: project.web, terms: TERMS[project.terms], image: iconBlob ? "icon.png" : null,
      takes: good.map((t) => ({ entry: byKey.get(t.key), midi: t.midi, oto: t.oto, level: t.level })) });
    const files = vb.files.map((f) => ({ name: `${folder}/${f.path}`, blob: new Blob([f.text], { type: "text/plain" }) }));
    for (const t of good) files.push({ name: `${folder}/${vb.multi ? noteName(t.midi) + "/" : ""}${t.key}.wav`, blob: t.wav });
    if (iconBlob) files.push({ name: `${folder}/icon.png`, blob: iconBlob });
    const blob = await zip(files);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = folder + ".zip";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  } catch (e) {
    $("exportErr").textContent = e.message; $("exportErr").classList.remove("hidden");
  }
  btn.textContent = "Download the voicebank (.zip)"; btn.disabled = !$("fConsent").checked;
}
async function iconFrom(file) {
  const img = await createImageBitmap(file), c = document.createElement("canvas");
  c.width = c.height = 100;
  const s = Math.max(100 / img.width, 100 / img.height), w = img.width * s, h = img.height * s;
  c.getContext("2d").drawImage(img, (100 - w) / 2, (100 - h) / 2, w, h);
  return new Promise((res) => c.toBlob(res, "image/png"));
}

// ---------- wiring ----------
function showErr(msg) { $("err").textContent = msg; $("err").classList.toggle("hidden", !msg); }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]); }

function wire() {
  $("recBtn").onclick = record;
  $("guideBtn").onclick = hearNote;
  $("exampleBtn").onclick = sayExample;
  $("playBtn").onclick = playTake;
  $("prev").onclick = () => go(idx - 1);
  $("next").onclick = () => go(idx + 1);
  $("grid").onclick = (ev) => { const b = ev.target.closest(".cell"); if (b) go(Number(b.dataset.i)); };
  document.querySelectorAll(".tabBar button").forEach((b) => b.onclick = () => {
    document.querySelectorAll(".tabBar button").forEach((x) => x.classList.toggle("on", x === b));
    document.querySelectorAll(".tabBody > section").forEach((s) => s.classList.toggle("show", s.dataset.tab === b.dataset.tab));
  });
  $("extraAdd").onclick = () => {
    const e = customEntry($("extraName").value);
    if (!e) return;
    if (entries().some((x) => x.key === e.key)) { go(entries().findIndex((x) => x.key === e.key)); return; }
    project.extras = [...(project.extras || []), e];
    $("extraName").value = ""; save(); go(entries().length - 1);
  };
  $("extraName").onkeydown = (ev) => { if (ev.key === "Enter") $("extraAdd").click(); };
  $("fName").oninput = () => { project.name = $("fName").value; $("bankName").textContent = project.name || "Untitled voicebank"; save(); };
  $("fAuthor").oninput = () => { project.author = $("fAuthor").value; save(); };
  $("fList").onchange = () => { project.list = $("fList").value; $("listNote").textContent = LISTS[project.list].note; idx = 0; save(); render(); };
  $("fNote").onchange = () => { project.midi = Number($("fNote").value); idx = Math.max(0, entries().findIndex((e) => !takeFor(e.key))); lastTake = null; save(); render(); };
  $("fTempo").onchange = () => { project.tempo = Number($("fTempo").value); save(); };
  $("fAuto").onchange = () => { project.auto = $("fAuto").checked; save(); };
  $("fGuideHold").onchange = () => { project.guideHold = $("fGuideHold").checked; save(); };
  $("fMic").onchange = async () => { project.micId = $("fMic").value; save(); try { await micOn(); } catch (e) { showErr(e.message); } };
  $("fChan").onchange = () => { project.channel = Number($("fChan").value); save(); node?.port.postMessage({ cmd: "channel", channel: project.channel }); };
  $("micOn").onclick = async () => { try { await micOn(); showErr(""); } catch (e) { showErr(e.message); } };
  $("fTerms").onchange = () => { project.terms = $("fTerms").value; $("termsText").textContent = TERMS[project.terms]; save(); };
  $("fWeb").oninput = () => { project.web = $("fWeb").value.trim(); save(); };
  $("fIcon").onchange = async () => { const f = $("fIcon").files[0]; if (!f) return; try { iconBlob = await iconFrom(f); project.icon = iconBlob; save(); } catch { showErr("That image couldn't be read. Try a PNG or JPG."); } };
  $("fConsent").onchange = () => { $("exportBtn").disabled = !takes.size || !$("fConsent").checked; };
  $("exportBtn").onclick = exportZip;
  $("newBank").onclick = newProject;
  $("delBank").onclick = async () => {
    if (!confirm(`Delete "${project.name}" and all ${takes.size} of its takes from this browser? This can't be undone.`)) return;
    await store.deleteProject(project.id);
    const ps = await store.listProjects();
    if (ps.length) await loadProject(ps[0]); else await newProject();
    renderBanks();
  };
  $("banks").onclick = async (ev) => { const id = ev.target.closest("[data-open]")?.dataset.open; if (id) { await loadProject(await store.getProject(id)); renderBanks(); } };
  markerDrag();
  window.addEventListener("resize", drawWave);
  document.addEventListener("keydown", (ev) => {
    if (ev.target.closest("input, select, textarea") || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (ev.code === "Space" || ev.key === " ") { ev.preventDefault(); record(); }
    else if (ev.key === "ArrowLeft") go(idx - 1);
    else if (ev.key === "ArrowRight") go(idx + 1);
    else if (ev.key === "p" || ev.key === "P") playTake();
    else if (ev.key === "g" || ev.key === "G") hearNote();
    else if (ev.key === "e" || ev.key === "E") sayExample();
  });
}

// read-only peek for the browser tests
window.__voicebank = () => ({ idx, name: project?.name, midi: project?.midi, extras: project?.extras?.length ?? 0,
  takes: [...takes.values()].map((t) => ({ key: t.key, midi: t.midi, level: t.level, oto: t.oto })),
  wave: wave && { abs: { ...wave.abs }, durMs: (wave.samples.length / OUT_SR) * 1000 } });

(async function start() {
  wire();
  try {
    const ps = await store.listProjects();
    let last = null;
    try { last = localStorage.getItem("encore-vocalsynth-last"); } catch {}
    const p = ps.find((x) => x.id === last) ?? ps[0];
    if (p) await loadProject(p); else await newProject();
    renderBanks();
  } catch (e) {
    showErr("This browser won't let the page save takes (private browsing can do this). You can still record, but takes won't be kept.");
    project = { ...DEFAULTS, id: "temp" }; fillSetup(); render();
  }
})();
