// ENCORE. Chip Guitar: the page. Input picker (processing off), live effect in an AudioWorklet,
// a file or a built-in riff as the source, a tuner-style display with measured latency, presets
// and a recorder.
import { DEFAULTS, PRESETS, CHORDS, ChipGuitarFX, pluck } from "./chipguitar-core.js";
import { noteName, NOTE, writeWav, midiToHz, LEGAL_DUTIES, dutyLabel } from "./chip-core.js";
import { ACCEPT } from "./audio-decode.js";
import { openAudio } from "./load-progress.js";

const $ = (id) => document.getElementById(id);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
};
const KEY_P = "encore-chipguitar-params", KEY_MY = "encore-chipguitar-presets";
let params = { ...DEFAULTS };
try { Object.assign(params, JSON.parse(store.get(KEY_P) || "{}")); } catch {}

let ctx = null, node = null, ready = null, micStream = null, micSrc = null, fileSrc = null, fileBuf = null, fileName = "";
let source = "mic", recording = false, recChunks = [], takes = 0, lastMeter = null, rendering = false;
const latency = { fast: null, lock: null, path: null };

function err(msg) { const e = $("err"); e.textContent = msg; e.classList.toggle("hidden", !msg); }
function ensureAudio() {
  if (ready) { ctx?.resume?.(); return ready; }
  ready = (async () => {
    ctx = new AudioContext({ latencyHint: "interactive" });
    await ctx.audioWorklet.addModule("chipguitar-worklet.js");
    node = new AudioWorkletNode(ctx, "encore-chip-guitar", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: "explicit", channelInterpretation: "discrete", processorOptions: { params } });
    node.connect(ctx.destination);
    node.port.onmessage = (e) => onWorklet(e.data);
    node.port.postMessage({ type: "chan", chan: +$("fChan").value });
    await ctx.resume();
    $("recBtn").disabled = false;
  })().catch((e) => { ready = null; err("Sound couldn't start in this browser: " + e.message); throw e; });
  return ready;
}
const send = () => { node?.port.postMessage({ type: "params", params }); store.set(KEY_P, JSON.stringify(params)); };

// ---- the display
function onWorklet(d) {
  if (d.type === "meter") showMeter(d);
  else if (d.type === "rec") recChunks.push(d.data);
  else if (d.type === "recDone") finishTake();
}
function audioPathMs() {
  if (!ctx) return null;
  let ms = ((ctx.baseLatency || 0) + (ctx.outputLatency || 0)) * 1000;
  const s = micStream?.getAudioTracks()[0]?.getSettings?.();
  if (source === "mic" && s && typeof s.latency === "number") ms += s.latency * 1000;
  return ms;
}
// pitch history: the last few seconds of what you played (grey) and what the chip played (orange)
const hist = []; window.__cgHist = hist;
function drawHist() {
  const c = $("hist"), r = c.getBoundingClientRect();
  if (!r.width || !r.height) return;
  const dpr = window.devicePixelRatio || 1;
  if (c.width !== Math.round(r.width * dpr)) { c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr); }
  const g = c.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const w = r.width, h = r.height; g.clearRect(0, 0, w, h);
  const vals = hist.flatMap((p) => [p.raw, p.out]).filter((v) => v != null);
  let lo = vals.length ? Math.floor(Math.min(...vals)) - 3 : 38, hi = vals.length ? Math.ceil(Math.max(...vals)) + 3 : 66;
  if (hi - lo < 24) { const c = (hi + lo) / 2; lo = Math.round(c - 12); hi = lo + 24; }
  const y = (m) => h - 12 - ((m - lo) / (hi - lo)) * (h - 24);
  if (!hist.length) { // first load: say what this lane will show
    g.textBaseline = "middle"; g.textAlign = "center"; g.fillStyle = "rgba(242,239,232,0.55)"; g.font = "600 14px 'DM Sans', system-ui, sans-serif";
    g.fillText("Your pitch history shows here", w / 2, h / 2 - 10);
    g.fillStyle = "rgba(242,239,232,0.32)"; g.font = "12px 'DM Sans', system-ui, sans-serif";
    g.fillText("Play a note: your pitch in grey, the chip's notes in orange", w / 2, h / 2 + 12);
    g.textAlign = "start"; return;
  }
  g.font = "10px 'Space Mono', monospace"; g.textBaseline = "middle";
  for (let m = lo; m <= hi; m++) {
    if (m % 12 === 0 || m % 12 === 4 || m % 12 === 7) { g.fillStyle = "rgba(255,255,255,0.07)"; g.fillRect(0, Math.round(y(m)), w, 1); g.fillStyle = "rgba(255,255,255,0.35)"; g.fillText(noteName(m), 4, y(m)); }
  }
  const N = 180, dx = w / N, off = N - hist.length;
  for (const [key, col, lw] of [["raw", "rgba(220,214,208,0.3)", 6], ["out", "#ff3b00", 2]]) {
    g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); let pen = false;
    hist.forEach((p, i) => { const v = p[key]; if (v == null) { pen = false; return; } const X = (off + i) * dx, Y = y(v); if (!pen) { g.moveTo(X, Y); pen = true; } else g.lineTo(X, Y); });
    g.stroke();
  }
}
function showMeter(d) {
  const m = d.m; lastMeter = { ...m, inPk: d.inPk, outPk: d.outPk };
  hist.push({ raw: m.open && m.midi != null ? m.midi : null, out: m.open || d.outPk > 0.01 ? m.out + 0 : null });
  if (hist.length > 180) hist.shift();
  drawHist();
  $("inBar").style.width = Math.min(100, Math.sqrt(d.inPk) * 110) + "%";
  $("confBar").style.width = Math.round((m.conf || 0) * 100) + "%";
  if (m.open && m.midi != null) {
    const r = Math.round(m.midi), c = (m.midi - r) * 100;
    $("bigNote").innerHTML = `${noteName(r).replace(/(-?\d+)$/, "<small>$1</small>")}`;
    $("centsNeedle").style.left = 50 + Math.max(-50, Math.min(50, c)) + "%";
    $("outNote").textContent = noteName(Math.round(m.out));
  } else if (!m.open) { $("confBar").style.width = "0%"; }
  if (m.fastMs != null || m.lockMs != null) {
    latency.fast = m.fastMs; latency.lock = m.lockMs; latency.path = audioPathMs();
    const parts = [];
    if (m.fastMs != null) parts.push(`fast ${m.fastMs.toFixed(1)} ms`);
    if (m.lockMs != null) parts.push(`lock ${m.lockMs.toFixed(1)} ms`);
    let t = `Last note: ${parts.join(", ")} after the pick`;
    if (latency.path != null) t += ` · audio path ${latency.path.toFixed(1)} ms` + (m.fastMs != null ? ` · pick to sound about ${(latency.path + m.fastMs).toFixed(0)} ms` : "");
    $("lat").textContent = t;
  }
}

// ---- sources
function setSource(s) {
  source = s;
  for (const [id, k] of [["srcMic", "mic"], ["srcFile", "file"], ["srcDemo", "demo"]]) $(id).classList.toggle("on", k === s);
  $("micBox").classList.toggle("hidden", s !== "mic"); $("fileBox").classList.toggle("hidden", s !== "file"); $("demoBox").classList.toggle("hidden", s !== "demo");
  $("srcInfo").textContent = s === "mic" ? "Plug your guitar into an audio interface (or play near the mic), then turn the input on. Use headphones so the speakers don't feed back."
    : s === "file" ? "Pick a recording of single notes (a guitar part works best). Play it through the effect, or render the whole file to a WAV."
    : "A plucked-string riff made right here in your browser (low E up to the 12th fret), so you can try every setting without a guitar.";
  if (s !== "mic") stopMic();
  stopFile();
}
async function startMic() {
  await ensureAudio();
  stopMic();
  try {
    const id = $("fMic").value;
    micStream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: id ? { exact: id } : undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 2 } } });
  } catch (e) { err("The input didn't turn on: " + (e.name === "NotAllowedError" ? "the browser wasn't allowed to use it." : e.message)); return; }
  err("");
  micSrc = ctx.createMediaStreamSource(micStream);
  micSrc.connect(node);
  $("micBtn").textContent = "Turn the input off";
  const tr = micStream.getAudioTracks()[0], st = tr.getSettings?.() || {};
  const off = st.echoCancellation === false && st.noiseSuppression !== true && st.autoGainControl !== true;
  $("srcInfo").textContent = `Listening to ${tr.label || "your input"}${st.sampleRate ? ` at ${st.sampleRate / 1000} kHz` : ""}${st.channelCount ? `, ${st.channelCount} channel${st.channelCount > 1 ? "s" : ""}` : ""}. ${off ? "Voice processing is off." : "This browser may still be processing the input."}`;
  listDevices();
}
function stopMic() {
  if (micSrc) { try { micSrc.disconnect(); } catch {} micSrc = null; }
  if (micStream) { micStream.getTracks().forEach((t) => t.stop()); micStream = null; }
  $("micBtn").textContent = "Turn the input on";
}
async function listDevices() {
  try {
    const devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput");
    const cur = $("fMic").value;
    $("fMic").innerHTML = '<option value="">Default input</option>' + devs.filter((d) => d.deviceId && d.deviceId !== "default").map((d, i) => `<option value="${d.deviceId.replace(/"/g, "")}">${(d.label || `Input ${i + 1}`).replace(/[<&]/g, "")}</option>`).join("");
    $("fMic").value = cur;
  } catch {}
}
function playBuffer(buf, loop) {
  stopFile();
  fileSrc = ctx.createBufferSource(); fileSrc.buffer = buf; fileSrc.loop = loop;
  fileSrc.connect(node);
  fileSrc.onended = () => { if (fileSrc && !fileSrc.loop) { $("filePlay").textContent = "Play through it"; $("demoPlay").textContent = "Play the demo riff"; fileSrc = null; } };
  fileSrc.start();
}
function stopFile() {
  if (fileSrc) { try { fileSrc.onended = null; fileSrc.stop(); fileSrc.disconnect(); } catch {} fileSrc = null; }
  $("filePlay").textContent = "Play through it"; $("demoPlay").textContent = "Play the demo riff";
}
function demoRiff(sr) {
  const notes = [[40, 0], [47, 0.35], [52, 0.7], [55, 1.05], [57, 1.4], [59, 1.75], [64, 2.1], [52, 2.6], [45, 3.1], [57, 3.45], [64, 3.8], [69, 4.15], [76, 4.5]];
  const x = new Float32Array(Math.round(5.4 * sr));
  for (const [m, at] of notes) { const p = pluck(sr, midiToHz(m), 0.9, { seed: m * 7 + 1, amp: 0.5 }), o = Math.round(at * sr); for (let i = 0; i < p.length && o + i < x.length; i++) x[o + i] = x[o + i] * 0.25 + p[i]; }
  return x;
}

// ---- recorder
function toggleRec() {
  if (!node) return;
  recording = !recording;
  if (recording) { recChunks = []; node.port.postMessage({ type: "rec", on: true }); }
  else node.port.postMessage({ type: "rec", on: false });
  $("recBtn").textContent = recording ? "Stop recording" : "Record";
  $("recBtn").classList.toggle("on", recording);
  $("recInfo").textContent = recording ? "Recording what the chip plays..." : "Records what the chip plays (and any dry guitar you blend in).";
}
function finishTake() {
  const n = recChunks.reduce((a, c) => a + c.length, 0);
  if (!n) return;
  const x = new Float32Array(n); let o = 0;
  for (const c of recChunks) { x.set(c, o); o += c.length; }
  recChunks = [];
  takes++;
  const url = URL.createObjectURL(new Blob([writeWav([x, x], ctx.sampleRate)], { type: "audio/wav" }));
  const li = document.createElement("li"), a = document.createElement("a");
  a.href = url; a.download = `ENCORE Chip Guitar take ${takes}.wav`; a.textContent = `Download take ${takes}`;
  const sp = document.createElement("span"); sp.textContent = `${(n / ctx.sampleRate).toFixed(1)} s`;
  li.append(a, sp); $("takes").prepend(li);
}

// ---- file: play through, or render offline with the same effect
async function loadFile(f) {
  err(""); stopFile();
  try {
    const { chans, fs } = await openAudio(f);
    await ensureAudio();
    const n = chans[0].length, mono = new Float32Array(n);
    for (const c of chans) for (let i = 0; i < n; i++) mono[i] += c[i] / chans.length;
    fileBuf = ctx.createBuffer(1, n, fs); fileBuf.copyToChannel(mono, 0);
    fileName = f.name.replace(/\.[^.]+$/, "");
    $("filePlay").disabled = false; $("fileRender").disabled = false;
    $("srcInfo").textContent = `Loaded "${f.name}": ${(n / fs).toFixed(1)} s at ${fs / 1000} kHz.`;
  } catch (e) { err("Couldn't open that file: " + e.message); }
}
async function renderFile() {
  if (!fileBuf || rendering) return;
  rendering = true; $("fileRender").disabled = true;
  const x = fileBuf.getChannelData(0), sr = fileBuf.sampleRate;
  const t0 = performance.now();
  // process in slices so the page stays responsive
  const fx = new ChipGuitarFX(sr, params), L = new Float32Array(x.length), R = new Float32Array(x.length), B = 8192;
  const fastL = [], lockL = [];
  let lastFast = null, lastLock = null;
  for (let o = 0; o < x.length; o += B) {
    const n = Math.min(B, x.length - o);
    fx.process(x.subarray(o, o + n), L.subarray(o, o + n), R.subarray(o, o + n), n);
    const m = fx.meter();
    if (m.fastMs != null && m.fastMs !== lastFast) { fastL.push(m.fastMs); lastFast = m.fastMs; }
    if (m.lockMs != null && m.lockMs !== lastLock) { lockL.push(m.lockMs); lastLock = m.lockMs; }
    if ((o / B) % 16 === 0) { $("srcInfo").textContent = `Rendering... ${Math.round((o / x.length) * 100)}%`; await new Promise((r) => setTimeout(r, 0)); }
  }
  const ms = performance.now() - t0;
  const blob = new Blob([writeWav([L, R], sr)], { type: "audio/wav" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${fileName || "audio"} (Chip Guitar).wav`;
  document.body.append(a); a.click(); a.remove();
  const med = (v) => (v.length ? v.slice().sort((p, q) => p - q)[v.length >> 1] : null);
  window.__cgRender = { ms, len: x.length, fast: med(fastL), lock: med(lockL) };
  $("srcInfo").textContent = `Rendered ${(x.length / sr).toFixed(1)} s in ${(ms / 1000).toFixed(1)} s.` + (med(lockL) != null ? ` Tracking in this file: fast ${med(fastL)?.toFixed(1)} ms, lock ${med(lockL).toFixed(1)} ms after each pick (median).` : "");
  rendering = false; $("fileRender").disabled = false;
}

// ---- controls
function fillOct(sel) { sel.innerHTML = [-2, -1, 0, 1, 2].map((o) => `<option value="${o}">${o > 0 ? "+" : ""}${o === 0 ? "Same" : o + " oct"}</option>`).join(""); }
document.querySelectorAll('select[data-p$="Oct"], select[data-p="octave"]').forEach(fillOct);
$("chordSel").innerHTML = Object.entries(CHORDS).map(([k, c]) => `<option value="${k}">${c.name}</option>`).join("");
$("keySel").innerHTML = NOTE.map((n, i) => `<option value="${i}">${n}</option>`).join("");
const VALS = { quantize: (v) => Math.round(v * 100) + "%", vib: (v) => (+v).toFixed(2) + " st", vibRate: (v) => v + " Hz", dry: (v) => Math.round(v * 100) + "%", volume: (v) => Math.round(v * 100) + "%", gate: (v) => (20 * Math.log10(v)).toFixed(0) + " dB", sens: (v) => v + "x" };
function renderControls() {
  document.querySelectorAll("[data-p]").forEach((el) => {
    const k = el.dataset.p, v = params[k];
    if (el.type === "checkbox") el.checked = !!v; else if (document.activeElement !== el) el.value = String(v);
    const lbl = $("v" + k[0].toUpperCase() + k.slice(1));
    if (lbl && VALS[k]) lbl.textContent = VALS[k](v);
  });
  const d = $("duty"); d.innerHTML = "";
  for (const w of LEGAL_DUTIES) {
    const b = document.createElement("button"); b.textContent = dutyLabel(w); b.className = params.duty === w ? "on" : ""; b.setAttribute("aria-label", `Pulse width ${dutyLabel(w)}`);
    b.onclick = () => { params.duty = w; send(); renderControls(); };
    d.append(b);
  }
}
document.querySelectorAll("[data-p]").forEach((el) => {
  const ev = el.tagName === "SELECT" || el.type === "checkbox" ? "change" : "input";
  el.addEventListener(ev, () => {
    const k = el.dataset.p;
    params[k] = el.type === "checkbox" ? el.checked : el.tagName === "SELECT" && isNaN(+el.value) ? el.value : +el.value;
    markPreset(null);
    send(); renderControls();
  });
});
function renderPresets() {
  const box = $("presets"); box.innerHTML = "";
  for (const p of PRESETS) {
    const b = document.createElement("button"); b.textContent = p.name; b.dataset.id = p.id;
    b.onclick = () => { params = { ...DEFAULTS, ...p.p }; send(); renderControls(); markPreset(p.id); };
    box.append(b);
  }
  const my = $("myPresets"); my.innerHTML = "";
  let list = []; try { list = JSON.parse(store.get(KEY_MY) || "[]"); } catch {}
  if (!list.length) my.innerHTML = '<p class="tip">Nothing saved yet.</p>';
  list.forEach((p, i) => {
    const b = document.createElement("button"); b.textContent = p.name;
    b.onclick = () => { params = { ...DEFAULTS, ...p.p }; send(); renderControls(); markPreset(null); };
    const del = document.createElement("button"); del.textContent = "Delete " + p.name; del.className = "small";
    del.onclick = () => { list.splice(i, 1); store.set(KEY_MY, JSON.stringify(list)); renderPresets(); };
    my.append(b, del);
  });
}
function markPreset(id) { document.querySelectorAll("#presets button").forEach((b) => b.classList.toggle("on", b.dataset.id === id)); }
$("savePreset").onclick = () => {
  let list = []; try { list = JSON.parse(store.get(KEY_MY) || "[]"); } catch {}
  list.push({ name: `My sound ${list.length + 1}`, p: { ...params } });
  if (!store.set(KEY_MY, JSON.stringify(list))) err("This browser won't let the page save presets.");
  renderPresets();
};

document.querySelectorAll(".tabBar button").forEach((b) => b.addEventListener("click", () => {
  document.querySelectorAll(".tabBar button").forEach((x) => x.classList.toggle("on", x === b));
  document.querySelectorAll(".tabBody > section").forEach((s) => s.classList.toggle("show", s.dataset.tab === b.dataset.tab));
}));
$("srcMic").onclick = () => setSource("mic");
$("srcFile").onclick = () => setSource("file");
$("srcDemo").onclick = () => setSource("demo");
$("micBtn").onclick = () => (micStream ? stopMic() : startMic());
$("fChan").onchange = (e) => node?.port.postMessage({ type: "chan", chan: +e.target.value });
$("fMic").onchange = () => { if (micStream) startMic(); };
$("fFile").accept = ACCEPT;
$("fFile").onchange = (e) => { const f = e.target.files[0]; e.target.value = ""; if (f) loadFile(f); };
$("filePlay").onclick = async () => { await ensureAudio(); if (fileSrc) { stopFile(); return; } playBuffer(fileBuf, $("fileLoop").checked); $("filePlay").textContent = "Stop"; };
$("fileRender").onclick = () => renderFile();
$("demoPlay").onclick = async () => {
  await ensureAudio();
  if (fileSrc) { stopFile(); return; }
  const x = demoRiff(ctx.sampleRate), b = ctx.createBuffer(1, x.length, ctx.sampleRate); b.copyToChannel(x, 0);
  playBuffer(b, true); $("demoPlay").textContent = "Stop";
};
$("recBtn").onclick = () => toggleRec();
document.addEventListener("keydown", (e) => {
  const t = e.target;
  if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA" || t.tagName === "BUTTON")) return;
  if (e.key === "r" || e.key === "R") { if (node) toggleRec(); }
});

renderControls(); renderPresets();
requestAnimationFrame(() => drawHist());
addEventListener("resize", () => drawHist());
if (navigator.mediaDevices?.enumerateDevices) listDevices();

window.__chipguitar = () => ({ source, mic: !!micStream, audio: !!node, recording, takes, meter: lastMeter, params: { ...params }, latency: { ...latency }, file: !!fileBuf, render: window.__cgRender || null });
