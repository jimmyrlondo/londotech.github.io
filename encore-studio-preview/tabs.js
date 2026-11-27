// ENCORE. Tabs: the page. Write a tune for kalimba, handpan or tongue drum by clicking the
// instrument, typing, a MIDI keyboard or the mic; see it as number tab, letters and the lit-up
// instrument; play it back; convert it; import MusicXML / MIDI; print, PNG and share.
import {
  makeInstrument, instRef, TUNINGS, tuningsFor, SHIFTS, tuningName, noteName, pcName, newTune, newNote, cleanTune, tuneBeats,
  fitTune, rankShifts, transposeTune, assignLyrics, lyricsText, digitNote, snapToInst, quantizeTake, PluckCatcher,
  tuneFromScore, tuneFromMidi, scoreFromTune, toFile, fromFile, toHash, fromHash, tabText, fileBase, DURS, parseNote, parseTuning, KINDS,
} from "./tabs-core.js";
import { drawInstrument, svg, renderStrip as stripSvg, sheetPages } from "./tabs-draw.js";
import { audio, pluck, hush, click, playTune, renderWav } from "./tabs-audio.js";
import { starterSongs } from "./tabs-songs.js";

const $ = (id) => document.getElementById(id);
const STORE = "encore-tabs-v1";
const KEYMAP = { a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12, o: 13, l: 14, p: 15, ";": 16 };

// ---------- state ----------
const st = {
  tune: null, inst: null, sel: 0, dur: 1, dotted: false, oct: 0, view: "both",
  now: -1, player: null, loop: false, lit: new Map(), hitTimer: 0,
  undo: [], redo: [], saved: [], status: "", warn: "",
  rec: null, mic: null, midiOn: false, convShift: null,
};
const load = () => { try { return JSON.parse(localStorage.getItem(STORE) || "null"); } catch { return null; } };
const save = () => { try { localStorage.setItem(STORE, JSON.stringify({ cur: st.tune, saved: st.saved, view: st.view })); } catch {} };

function setTune(t, { keepSel = false, record = true } = {}) {
  if (record && st.tune) { st.undo.push(JSON.stringify(st.tune)); if (st.undo.length > 150) st.undo.shift(); st.redo = []; }
  st.tune = t;
  st.inst = makeInstrument(t.inst);
  if (!keepSel || st.sel > t.notes.length) st.sel = t.notes.length;
  save();
  renderAll();
}
const edit = (fn, opts) => { const t = JSON.parse(JSON.stringify(st.tune)); fn(t); setTune(t, { keepSel: true, ...opts }); };
function undo() { if (!st.undo.length) return; st.redo.push(JSON.stringify(st.tune)); setTune(JSON.parse(st.undo.pop()), { keepSel: true, record: false }); }
function redo() { if (!st.redo.length) return; st.undo.push(JSON.stringify(st.tune)); setTune(JSON.parse(st.redo.pop()), { keepSel: true, record: false }); }
const curDur = () => st.dur * (st.dotted ? 1.5 : 1);
function say(text, warn = false) { st.status = text; st.warn = warn; renderStatus(); }

// ---------- entering notes ----------
function enter(midis, { chord = false, sound = true, fromMic = false } = {}) {
  const ms = (Array.isArray(midis) ? midis : [midis]).filter((m) => m !== null && m !== undefined);
  if (st.rec) { const c = audio(); for (const m of ms) st.rec.onsets.push({ midi: m, t: c.currentTime }); if (sound && !fromMic) for (const m of ms) pluck(st.inst.kind, m, { ding: m === dingOf() }); flash(ms); return; }
  const n = st.tune.notes.length;
  if (chord && (st.sel < n || n > 0)) {
    const at = st.sel < n ? st.sel : n - 1;
    edit((t) => { const note = t.notes[at]; for (const m of ms) { const k = note.m.indexOf(m); if (k >= 0 && note.m.length > 1) note.m.splice(k, 1); else if (k < 0) note.m.push(m); } note.m.sort((a, b) => a - b); });
  } else if (st.sel < n) {
    const at = st.sel;
    edit((t) => { t.notes[at].m = ms.slice().sort((a, b) => a - b); });
    st.sel = Math.min(at + 1, st.tune.notes.length);
  } else {
    edit((t) => { t.notes.push(newNote(ms.slice().sort((a, b) => a - b), curDur())); });
    st.sel = st.tune.notes.length;
  }
  if (sound && !fromMic) for (const m of ms) pluck(st.inst.kind, m, { ding: m === dingOf() });
  const off = ms.filter((m) => !st.inst.notes.includes(m));
  if (off.length) say(`${off.map((m) => noteName(m, st.inst.flats)).join(", ")} isn't on this instrument. It's marked with a red ? in the tab.`, true);
  else say("");
  flash(ms);
  renderAll();
}
const dingOf = () => (st.inst.kind === "handpan" ? st.inst.notes[0] : null);
function addRest() {
  if (st.rec) return;
  const n = st.tune.notes.length;
  if (st.sel < n) { const at = st.sel; edit((t) => { t.notes[at].m = []; delete t.notes[at].l; delete t.notes[at].h; }); st.sel = Math.min(at + 1, st.tune.notes.length); }
  else { edit((t) => t.notes.push(newNote([], curDur()))); st.sel = st.tune.notes.length; }
  renderAll();
}
function del() {
  const n = st.tune.notes.length;
  if (!n) return;
  const at = st.sel < n ? st.sel : n - 1;
  edit((t) => t.notes.splice(at, 1));
  st.sel = st.sel < n ? Math.min(at, st.tune.notes.length) : st.tune.notes.length;
  renderAll();
}
function setDur(d) {
  st.dur = d;
  if (st.sel < st.tune.notes.length) { const at = st.sel; edit((t) => { t.notes[at].d = curDur(); }); }
  renderTools();
}
function toggleDot() {
  st.dotted = !st.dotted;
  if (st.sel < st.tune.notes.length) { const at = st.sel; edit((t) => { t.notes[at].d = curDur(); }); }
  renderTools();
}
function select(i, play = true) {
  st.sel = Math.max(0, Math.min(i, st.tune.notes.length));
  const n = st.tune.notes[st.sel];
  if (n) {
    // the length buttons follow the selected note
    const base = [4, 2, 1, 0.5, 0.25].find((d) => Math.abs(n.d - d) < 1e-6 || Math.abs(n.d - d * 1.5) < 1e-6);
    if (base) { st.dur = base; st.dotted = Math.abs(n.d - base * 1.5) < 1e-6 && Math.abs(n.d - base) > 1e-6; }
    if (play) for (const m of n.m) pluck(st.inst.kind, m, { ding: m === dingOf() });
    flash(n.m);
  }
  renderAll();
}
function flash(ms) {
  clearTimeout(st.hitTimer);
  st.lit = new Map(ms.map((m) => [m, "now"]));
  renderDiagram();
  st.hitTimer = setTimeout(() => { st.lit = new Map(); renderDiagram(); }, 260);
}

// ---------- drawing ----------
function selLit() {
  const m = new Map(), n = st.tune.notes[st.sel];
  if (n && st.now < 0) for (const x of n.m) m.set(x, "sel");
  for (const [k, v] of st.lit) m.set(k, v);
  return m;
}
function renderDiagram() { $("diagram").innerHTML = svg(drawInstrument(st.inst, { lit: selLit(), labels: st.view }), `role="img" aria-label="${st.inst.label}"`); }
let stripW = 760;
function renderStrip() {
  const box = $("stripBox");
  stripW = Math.max(300, Math.round(box.clientWidth || 760));
  if (!st.tune.notes.length && !st.rec) { box.innerHTML = `<div class="stripEmpty">Click the instrument above (or type 1 to 7) to write your first note. Or load a song from the Songs tab.</div>`; return; }
  const r = stripSvg(st.tune, st.inst, { width: stripW, view: st.view, sel: st.now >= 0 ? -1 : st.sel, now: st.now, cursor: st.now >= 0 ? -1 : st.sel });
  box.innerHTML = r.svg;
  // keep the selected or playing note in view
  const i = st.now >= 0 ? st.now : st.sel;
  const el = box.querySelector(`.tn[data-i="${i}"]`) || box.querySelector(".caret");
  if (el) { const b = el.getBoundingClientRect(), bb = box.getBoundingClientRect(); if (b.bottom > bb.bottom - 4 || b.top < bb.top + 4) box.scrollTop += b.top - bb.top - bb.height / 3; }
}
function renderTools() {
  $("durs").innerHTML = DURS.map((d) => `<button data-d="${d.d}" class="${d.d === st.dur ? "on" : ""}" title="${d.name} note (${d.key.toUpperCase()})" aria-pressed="${d.d === st.dur}"><span class="durIcon">${durGlyph(d.d)}</span><span class="durName"> ${d.name}</span></button>`).join("");
  $("dotBtn").classList.toggle("on", st.dotted); $("dotBtn").setAttribute("aria-pressed", st.dotted);
  $("undoBtn").disabled = !st.undo.length; $("redoBtn").disabled = !st.redo.length;
  $("loopBtn").classList.toggle("on", st.loop); $("loopBtn").setAttribute("aria-pressed", st.loop);
  for (const b of $("views").children) b.classList.toggle("on", b.dataset.view === st.view);
  $("playBtn").textContent = st.player ? "Stop" : "Play";
  $("recBtn").innerHTML = st.rec ? `<span class="recDot"></span>Stop recording` : "Record in time";
  $("recBtn").classList.toggle("on", !!st.rec);
  if (document.activeElement !== $("tempo")) $("tempo").value = st.tune.tempo;
}
const durGlyph = (d) => ({ 4: "1 - - -", 2: "1 -", 1: "1", 0.5: "1̲", 0.25: "1̳" }[d] || "1");
function renderHead() {
  if (document.activeElement !== $("title")) $("title").value = st.tune.title;
  const beats = tuneBeats(st.tune), secs = Math.round((beats * 60) / st.tune.tempo);
  $("meta").textContent = `${st.inst.label} · ${st.tune.notes.length} notes · ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
}
function renderStatus() {
  const n = st.tune.notes.length, sel = st.sel < n ? `Note ${st.sel + 1} of ${n} selected (the next note replaces it).` : "";
  const keys = st.inst.kind === "handpan" ? "0 = ding, 1-9 = fields" : `Number keys: 1 = ${noteName(st.inst.ref + st.oct * 12, st.inst.flats)}`;
  $("status").innerHTML = st.status ? `<span class="${st.warn ? "warn" : ""}">${esc(st.status)}</span>` : `<span>${esc(sel)}</span><span>${esc(keys)}</span>`;
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function renderWrite() {
  const inst = st.inst;
  $("fKind").value = inst.kind;
  fillTunings($("fTuning"), inst.kind, inst.custom ? "" : inst.tuning, true);
  fillShifts($("fShift"), inst.custom ? null : TUNINGS.find((t) => t.id === inst.tuning), inst.shift);
  $("fShift").disabled = !!inst.custom;
  if (document.activeElement !== $("fCustom")) $("fCustom").value = inst.notes.map((m) => noteName(m, inst.flats, inst.spell)).join(" ");
  $("tuneHint").textContent = inst.kind === "kalimba" ? "Left to right, as you hold it. Change a tine you've retuned, or type a whole new layout." : inst.kind === "handpan" ? "The ding first, then the fields from low to high." : "From the lowest tongue to the highest.";
  const n = st.tune.notes[st.sel];
  const ly = $("fLyric");
  ly.disabled = !n || !n.m.length; ly.placeholder = n ? (n.m.length ? "Type a syllable" : "Rests don't get words") : "Click a note first";
  if (document.activeElement !== ly) ly.value = n?.l ? n.l + (n.h ? "-" : "") : "";
  if (document.activeElement !== $("fBy")) $("fBy").value = st.tune.by || "";
  $("fBeats").value = String(st.tune.beats);
}
function fillTunings(sel, kind, current, allowCustom) {
  const opts = tuningsFor(kind).map((t) => `<option value="${t.id}">${esc(tuningName(t, pcName(t.key, !!t.minor && [2, 7, 0, 5].includes(t.key), t.spell)))}</option>`);
  if (allowCustom && !current) opts.push(`<option value="" selected>Custom notes</option>`);
  sel.innerHTML = opts.join("");
  if (current) sel.value = current;
}
function fillShifts(sel, preset, cur) {
  if (!preset) { sel.innerHTML = `<option>Custom</option>`; return; }
  sel.innerHTML = SHIFTS.map((s) => { const i = makeInstrument({ tuning: preset.id, shift: s }); const ding = preset.kind === "handpan" ? `${noteName(i.notes[0], i.flats)} ding` : `${pcName(i.key, i.flats)}`; return `<option value="${s}">${esc(ding)}${s === 0 ? " (as sold)" : ""}</option>`; }).join("");
  sel.value = String(cur);
}
function renderAll() { renderHead(); renderDiagram(); renderTools(); renderStrip(); renderStatus(); renderWrite(); if (activeTab === "convert") renderConvert(); if (activeTab === "songs") renderSongs(); }

// ---------- instrument ----------
function changeInstrument(ref, { refit = true } = {}) {
  const inst = makeInstrument(ref);
  if (refit && st.tune.notes.some((n) => n.m.length)) {
    // keep the tune where it is if it fits, else move it to the best key for the new instrument
    const exact = fitTune(st.tune, inst, { shift: 0, fold: false });
    const r = exact.missing.length ? fitTune(st.tune, inst) : exact;
    setTune(r.tune);
    say(r.warnings.join(" "), !!(r.missing.length || r.folded.length));
  } else { edit((t) => { t.inst = instRef(inst); }); }
}

// ---------- tabs ----------
let activeTab = "write";
for (const b of document.querySelectorAll(".tabBar button")) b.addEventListener("click", () => {
  activeTab = b.dataset.tab;
  for (const x of document.querySelectorAll(".tabBar button")) x.classList.toggle("on", x === b);
  for (const s of document.querySelectorAll(".tabBody > section")) s.classList.toggle("show", s.dataset.tab === activeTab);
  if (activeTab === "convert") renderConvert();
  if (activeTab === "songs") renderSongs();
});

// ---------- songs ----------
const STARTERS = starterSongs();
function fitTag(tune) {
  const r = fitTune(tune, st.inst, { fold: false });
  const pct = r.pct, cls = pct === 100 ? "ok" : pct >= 85 ? "part" : "bad";
  return `<span class="fit ${cls}" title="${esc(r.warnings.join(" "))}">${pct === 100 ? "fits" : pct + "% fits"}</span>`;
}
function renderSongs() {
  $("starter").innerHTML = STARTERS.map((s, i) => `<li><span>${esc(s.title)}<small>${esc(s.by)}</small></span>${fitTag(s)}<button class="small" data-starter="${i}">Load</button></li>`).join("");
  $("mine").innerHTML = st.saved.length ? st.saved.map((s, i) => `<li><span>${esc(s.title)}<small>${esc(makeInstrument(s.inst).label)} · ${s.notes.length} notes</small></span><button class="small" data-mine="${i}">Load</button><button class="small" data-del="${i}" aria-label="Delete ${esc(s.title)}">Delete</button></li>`).join("") : `<li><span class="tip" style="margin:0">Nothing saved yet. "Save to my tunes" is on the Write tab.</span></li>`;
}
function loadTune(t, label) {
  stop();
  const base = cleanTune(t);
  const r = fitTune(base, st.inst);
  const exact = fitTune(base, st.inst, { shift: 0, fold: false });
  const use = exact.missing.length ? r : exact;
  setTune(use.tune);
  st.sel = 0;
  renderAll();
  say(`${label}${use.shift || use.folded.length || use.missing.length ? ": " + use.warnings.join(" ") : ". Press Play to hear it."}`, !!(use.missing.length));
}
$("starter").addEventListener("click", (e) => { const b = e.target.closest("[data-starter]"); if (b) loadTune(STARTERS[+b.dataset.starter], `Loaded ${STARTERS[+b.dataset.starter].title}`); });
$("mine").addEventListener("click", (e) => {
  const l = e.target.closest("[data-mine]"), d = e.target.closest("[data-del]");
  if (l) { const t = st.saved[+l.dataset.mine]; stop(); setTune(cleanTune(t)); st.sel = 0; renderAll(); say(`Loaded ${t.title}.`); }
  if (d) { const i = +d.dataset.del; if (confirm(`Delete "${st.saved[i].title}" from my tunes?`)) { st.saved.splice(i, 1); save(); renderSongs(); } }
});
$("fImport").addEventListener("change", async (e) => {
  const f = e.target.files[0]; e.target.value = "";
  $("importErr").classList.add("hidden");
  if (!f) return;
  try {
    let tune;
    if (/\.(mid|midi)$/i.test(f.name)) {
      const { readMidiFile } = await import("./compose-core.js");
      tune = tuneFromMidi(readMidiFile(new Uint8Array(await f.arrayBuffer())), { title: f.name.replace(/\.[^.]+$/, "") });
    } else {
      const text = await f.text();
      if (/^\s*\{/.test(text)) tune = fromFile(text);
      else {
        const { fromMusicXML } = await import("./compose-core.js");
        tune = tuneFromScore(fromMusicXML(text));
      }
    }
    if (!tune.notes.some((n) => n.m.length)) throw new Error("That file has no melody notes.");
    if (/\.(encoretab|json)$/i.test(f.name)) { stop(); setTune(tune); st.sel = 0; renderAll(); say(`Opened ${tune.title}.`); }
    else loadTune(tune, `Imported ${tune.title}`);
  } catch (err) {
    $("importErr").textContent = (err && err.message) || "That file couldn't be read.";
    $("importErr").classList.remove("hidden");
  }
});

// ---------- convert ----------
function convTarget() {
  const kind = $("cKind").value, tuning = $("cTuning").value || tuningsFor(kind)[0].id;
  return makeInstrument({ kind, tuning, shift: +$("cShift").value || 0 });
}
function initConvert() {
  $("cKind").value = st.inst.kind;
  fillTunings($("cTuning"), st.inst.kind, st.inst.custom ? tuningsFor(st.inst.kind)[0].id : st.inst.tuning, false);
  fillShifts($("cShift"), TUNINGS.find((t) => t.id === $("cTuning").value), st.inst.custom ? 0 : st.inst.shift);
}
function renderConvert() {
  if (!$("cTuning").options.length) initConvert();
  const target = convTarget();
  const ranks = rankShifts(st.tune, target).slice(0, 5);
  if (st.convShift === null || !ranks.some((r) => r.shift === st.convShift)) st.convShift = ranks[0]?.shift ?? 0;
  $("shifts").innerHTML = st.tune.notes.some((n) => n.m.length) ? ranks.map((r) => `<button data-shift="${r.shift}" class="${r.shift === st.convShift ? "on" : ""}">${r.shift === 0 ? "As written" : (r.shift > 0 ? "Up " : "Down ") + Math.abs(r.shift)}<small>${r.pct}% land${r.foldable ? `, ${Math.round((r.foldable / r.total) * 100)}% can move an octave` : ""}</small></button>`).join("") : `<span class="tip" style="margin:0">Write or load a tune first.</span>`;
  const r = fitTune(st.tune, target, { shift: st.convShift, fold: $("cFold").checked });
  $("cWarn").innerHTML = r.warnings.map((w) => `<li class="${/can't/.test(w) ? "bad" : /octave|Moved/.test(w) ? "warn" : ""}">${esc(w)}</li>`).join("");
  $("convertBtn").textContent = `Convert to ${target.label}`;
}
$("cKind").addEventListener("change", () => { fillTunings($("cTuning"), $("cKind").value, tuningsFor($("cKind").value)[0].id, false); fillShifts($("cShift"), TUNINGS.find((t) => t.id === $("cTuning").value), 0); st.convShift = null; renderConvert(); });
$("cTuning").addEventListener("change", () => { fillShifts($("cShift"), TUNINGS.find((t) => t.id === $("cTuning").value), 0); st.convShift = null; renderConvert(); });
$("cShift").addEventListener("change", () => { st.convShift = null; renderConvert(); });
$("cFold").addEventListener("change", renderConvert);
$("shifts").addEventListener("click", (e) => { const b = e.target.closest("[data-shift]"); if (b) { st.convShift = +b.dataset.shift; renderConvert(); } });
$("convertBtn").addEventListener("click", () => {
  if (!st.tune.notes.length) return;
  const target = convTarget(), r = fitTune(st.tune, target, { shift: st.convShift ?? undefined, fold: $("cFold").checked });
  stop(); setTune(r.tune); st.convShift = null; initConvert(); renderConvert();
  say(`Converted to ${target.label}. ${r.warnings.join(" ")}`, !!r.missing.length);
});
const transpose = (s) => { if (!st.tune.notes.length) return; setTune(transposeTune(st.tune, s), { keepSel: true }); const off = st.tune.notes.reduce((a, n) => a + n.m.filter((m) => !st.inst.notes.includes(m)).length, 0); say(off ? `${off} note${off === 1 ? " doesn't" : "s don't"} fit now (red ?).` : "Every note fits.", !!off); };
$("tDown").addEventListener("click", () => transpose(-1)); $("tUp").addEventListener("click", () => transpose(1));
$("tOctDown").addEventListener("click", () => transpose(-12)); $("tOctUp").addEventListener("click", () => transpose(12));

// ---------- playback ----------
function play() {
  if (st.player) { stop(); return; }
  if (!st.tune.notes.length) { say("Nothing to play yet. Write a few notes first."); return; }
  hush();
  const from = st.sel < st.tune.notes.length ? st.sel : 0;
  st.player = playTune(st.tune, st.inst, {
    from, loop: st.loop,
    onNote: (i) => { st.now = i; st.lit = new Map(st.tune.notes[i].m.map((m) => [m, "now"])); renderDiagram(); renderStrip(); },
    onEnd: () => { st.player = null; st.now = -1; st.lit = new Map(); renderAll(); },
  });
  renderTools();
}
function stop() { if (st.player) { st.player.stop(); st.player = null; } st.now = -1; st.lit = new Map(); if (st.tune) renderAll(); }

// ---------- record in time ----------
function toggleRec() {
  if (st.rec) { finishRec(); return; }
  stop();
  const c = audio(), spb = 60 / st.tune.tempo, t0 = c.currentTime + 0.15, start = t0 + spb * st.tune.beats;
  st.rec = { onsets: [], start, timer: 0, beat: 0 };
  const tick = () => {
    if (!st.rec) return;
    while (t0 + st.rec.beat * spb < c.currentTime + 0.15) { click(t0 + st.rec.beat * spb, st.rec.beat % st.tune.beats === 0); st.rec.beat++; }
    const left = Math.ceil((start - c.currentTime) / spb);
    say(left > 0 ? `Get ready: ${left}` : "Recording. Play the tune in time with the click, then press Stop recording.");
    st.rec.timer = setTimeout(tick, 40);
  };
  tick();
  renderTools();
}
function finishRec() {
  const r = st.rec; st.rec = null; clearTimeout(r.timer);
  const c = audio();
  const onsets = r.onsets.filter((o) => o.t >= r.start - 0.25);
  if (!onsets.length) { say("Nothing was recorded. Play notes after the count-in."); renderAll(); return; }
  const notes = quantizeTake(onsets, { tempo: st.tune.tempo, grid: 0.25, start: r.start, end: c.currentTime });
  const at = st.sel;
  edit((t) => t.notes.splice(at, 0, ...notes));
  st.sel = Math.min(at + notes.length, st.tune.notes.length);
  renderAll();
  say(`Recorded ${notes.filter((n) => n.m.length).length} notes with their rhythm.`);
}

// ---------- MIDI and mic ----------
$("midiBtn").addEventListener("click", async () => {
  if (st.midiOn) return;
  if (!navigator.requestMIDIAccess) { $("heard").textContent = "This browser can't use MIDI keyboards. Try Chrome or Edge."; return; }
  try {
    const access = await navigator.requestMIDIAccess();
    const hook = () => { for (const inp of access.inputs.values()) inp.onmidimessage = onMidi; const names = [...access.inputs.values()].map((i) => i.name); $("heard").textContent = names.length ? `MIDI: ${names.join(", ")}` : "No MIDI keyboard found. Plug one in."; };
    access.onstatechange = hook; hook();
    st.midiOn = true; $("midiBtn").textContent = "MIDI keyboard on"; $("midiBtn").classList.add("on");
  } catch { $("heard").textContent = "MIDI wasn't allowed. Check the browser's site permissions."; }
});
const midiHeld = new Set();
let chordTimer = 0, chordBuf = [];
function onMidi(e) {
  const [s, d1, d2] = e.data, kind = s & 0xf0;
  if (kind === 0x90 && d2 > 0) {
    midiHeld.add(d1);
    // keys pressed together (within 40 ms) become a chord
    chordBuf.push(d1); clearTimeout(chordTimer);
    chordTimer = setTimeout(() => { const ms = chordBuf.splice(0); enter(ms); }, 40);
  } else if (kind === 0x80 || (kind === 0x90 && d2 === 0)) midiHeld.delete(d1);
}
$("micBtn").addEventListener("click", async () => { if (st.mic) stopMic(); else await startMic(); });
async function startMic() {
  try {
    const c = audio();
    const { VoiceTracker } = await import("./voice-core.js");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    const src = c.createMediaStreamSource(stream), an = c.createAnalyser(); an.fftSize = 4096; src.connect(an);
    const buf = new Float32Array(an.fftSize), tracker = new VoiceTracker({ minHz: 90, maxHz: 1500, minClarity: 0.8 });
    const catcher = new PluckCatcher({ snap: (p) => snapToInst(st.inst, p, 0.6) });
    const timer = setInterval(() => {
      an.getFloatTimeDomainData(buf);
      const fr = tracker.feed(buf, c.sampleRate, c.currentTime);
      $("micBar").style.width = Math.min(100, Math.round((fr.rms || 0) * 400)) + "%";
      const m = catcher.feed(fr);
      if (m !== null) { $("heard").textContent = `Heard ${noteName(m, st.inst.flats, st.inst.spell)}`; enter(m, { fromMic: true }); }
    }, 10);
    st.mic = { stream, src, timer };
    $("micBtn").textContent = "Stop listening"; $("micBtn").classList.add("on"); $("micMeter").classList.remove("hidden");
    $("heard").textContent = "Listening. Play one note at a time, and let each ring.";
  } catch { $("heard").textContent = "The microphone wasn't allowed, or there isn't one."; }
}
function stopMic() {
  if (!st.mic) return;
  clearInterval(st.mic.timer); st.mic.stream.getTracks().forEach((t) => t.stop()); try { st.mic.src.disconnect(); } catch {}
  st.mic = null; $("micBtn").textContent = "Listen with the mic"; $("micBtn").classList.remove("on"); $("micMeter").classList.add("hidden"); $("heard").textContent = "";
}

// ---------- export ----------
function download(data, name, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const exportMsg = (t) => { $("exportMsg").textContent = t; $("exportMsg").classList.remove("hidden"); };
const needNotes = () => { if (st.tune.notes.length) return true; exportMsg("Write or load a tune first."); return false; };
$("printBtn").addEventListener("click", () => {
  if (!needNotes()) return;
  $("printArea").innerHTML = sheetPages(st.tune, st.inst, { view: $("eView").value }).map((p) => `<div class="page">${p}</div>`).join("");
  window.print();
});
$("pngBtn").addEventListener("click", async () => {
  if (!needNotes()) return;
  const pages = sheetPages(st.tune, st.inst, { view: $("eView").value }), scale = 2, W = 816, H = 1056;
  const cv = document.createElement("canvas"); cv.width = W * scale; cv.height = H * scale * pages.length;
  const g = cv.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, cv.width, cv.height);
  for (let k = 0; k < pages.length; k++) {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(pages[k]); });
    g.drawImage(img, 0, H * scale * k, W * scale, H * scale);
  }
  cv.toBlob((b) => { download(b, fileBase(st.tune.title) + "-tab.png", "image/png"); exportMsg(`Saved a picture of the tab (${pages.length} page${pages.length === 1 ? "" : "s"}).`); }, "image/png");
});
$("fileBtn").addEventListener("click", () => { if (needNotes()) { download(toFile(st.tune), fileBase(st.tune.title) + ".encoretab", "application/json"); exportMsg("Saved the tab file."); } });
$("linkBtn").addEventListener("click", async () => {
  if (!needNotes()) return;
  const url = location.href.split("#")[0] + "#" + toHash(st.tune);
  try { await navigator.clipboard.writeText(url); exportMsg("Link copied. Anyone who opens it sees this tune."); }
  catch { $("textOut").textContent = url; $("textOut").classList.remove("hidden"); exportMsg("Copy this link:"); }
});
$("textBtn").addEventListener("click", async () => {
  if (!needNotes()) return;
  const txt = tabText(st.tune, st.inst, { view: $("eView").value });
  $("textOut").textContent = txt; $("textOut").classList.remove("hidden");
  try { await navigator.clipboard.writeText(txt); exportMsg("Copied as text. Paste it anywhere."); } catch { exportMsg("Here it is as text:"); }
});
$("wavBtn").addEventListener("click", async () => {
  if (!needNotes()) return;
  exportMsg("Making the audio...");
  try { download(await renderWav(st.tune, st.inst), fileBase(st.tune.title) + ".wav", "audio/wav"); exportMsg("Saved the audio."); } catch { exportMsg("This browser couldn't make the audio file."); }
});
async function composeOut(kind) {
  if (!needNotes()) return;
  const cc = await import("./compose-core.js");
  const score = scoreFromTune(st.tune, cc);
  if (kind === "midi") { download(cc.toMidiFile(score), fileBase(st.tune.title) + ".mid", "audio/midi"); exportMsg("Saved MIDI. It opens in ENCORE. Compose and any music program."); }
  else { download(cc.toMusicXML(score), fileBase(st.tune.title) + ".musicxml", "application/vnd.recordare.musicxml+xml"); exportMsg("Saved MusicXML (sheet music) for ENCORE. Compose, MuseScore and others."); }
}
$("midiOutBtn").addEventListener("click", () => composeOut("midi"));
$("xmlBtn").addEventListener("click", () => composeOut("xml"));

// ---------- controls ----------
$("durs").addEventListener("click", (e) => { const b = e.target.closest("[data-d]"); if (b) setDur(+b.dataset.d); });
$("dotBtn").addEventListener("click", toggleDot);
$("restBtn").addEventListener("click", addRest);
$("delBtn").addEventListener("click", del);
$("undoBtn").addEventListener("click", undo); $("redoBtn").addEventListener("click", redo);
$("playBtn").addEventListener("click", play);
$("loopBtn").addEventListener("click", () => { st.loop = !st.loop; renderTools(); });
$("recBtn").addEventListener("click", toggleRec);
$("views").addEventListener("click", (e) => { const b = e.target.closest("[data-view]"); if (b) { st.view = b.dataset.view; save(); renderAll(); } });
$("tempo").addEventListener("change", () => { const v = Math.max(30, Math.min(260, Math.round(+$("tempo").value || 90))); edit((t) => { t.tempo = v; }); });
$("title").addEventListener("change", () => edit((t) => { t.title = $("title").value.trim() || "Untitled tune"; }));
$("fBy").addEventListener("change", () => edit((t) => { t.by = $("fBy").value.trim(); }));
$("fBeats").addEventListener("change", () => edit((t) => { t.beats = +$("fBeats").value; }));
$("fLyric").addEventListener("input", () => {
  const at = st.sel; if (!st.tune.notes[at]?.m.length) return;
  const v = $("fLyric").value.trim();
  const t = JSON.parse(JSON.stringify(st.tune)), n = t.notes[at];
  if (v) { n.l = v.replace(/-$/, ""); if (/-$/.test(v)) n.h = true; else delete n.h; } else { delete n.l; delete n.h; }
  st.tune = t; save(); renderStrip();
});
$("fLyric").addEventListener("keydown", (e) => { if (e.key === "Enter" || (e.key === " " && !e.shiftKey)) { e.preventDefault(); const nx = st.tune.notes.findIndex((n, i) => i > st.sel && n.m.length); if (nx >= 0) { select(nx, false); $("fLyric").focus(); } } });
$("wordsApply").addEventListener("click", () => { setTune(assignLyrics(st.tune, $("fWords").value), { keepSel: true }); say("Words placed. Click a note to fix one syllable."); });
$("newBtn").addEventListener("click", () => { stop(); setTune(newTune({ inst: instRef(st.inst), tempo: st.tune.tempo })); $("fWords").value = ""; say("New tune. Click the instrument to start."); });
$("saveBtn").addEventListener("click", () => {
  const i = st.saved.findIndex((s) => s.title === st.tune.title);
  const copy = JSON.parse(JSON.stringify(st.tune));
  if (i >= 0) st.saved[i] = copy; else st.saved.unshift(copy);
  save(); say(`Saved "${st.tune.title}" to my tunes.`);
});
$("fKind").addEventListener("change", () => { const k = $("fKind").value; changeInstrument({ kind: k, tuning: tuningsFor(k)[0].id, shift: 0 }); });
$("fTuning").addEventListener("change", () => { if ($("fTuning").value) changeInstrument({ kind: st.inst.kind, tuning: $("fTuning").value, shift: 0 }); });
$("fShift").addEventListener("change", () => changeInstrument({ kind: st.inst.kind, tuning: st.inst.tuning, shift: +$("fShift").value }));
$("customApply").addEventListener("click", () => {
  $("customErr").classList.add("hidden");
  try { const notes = parseTuning($("fCustom").value); changeInstrument({ kind: st.inst.kind, tuning: st.inst.tuning, custom: notes, key: st.inst.key }, { refit: false }); say("Using your notes."); }
  catch (err) { $("customErr").textContent = err.message; $("customErr").classList.remove("hidden"); }
});
$("diagram").addEventListener("click", (e) => {
  const k = e.target.closest(".key"); if (!k) return;
  enter(+k.dataset.midi, { chord: e.shiftKey });
});
$("stripBox").addEventListener("click", (e) => {
  const n = e.target.closest(".tn");
  if (n) select(+n.dataset.i);
  else if (e.target.closest("svg") && st.tune.notes.length) { st.sel = st.tune.notes.length; renderAll(); }
});
document.addEventListener("keydown", (e) => {
  const tag = (e.target.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select" || e.altKey || e.metaKey) return;
  if (e.ctrlKey) {
    if (e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if (e.key.toLowerCase() === "y") { e.preventDefault(); redo(); }
    return;
  }
  const key = e.key.toLowerCase();
  if (e.key === " ") { if (tag === "button") return; e.preventDefault(); play(); return; }
  const digit = /^Digit(\d)$/.exec(e.code);
  if (digit) {
    const d = +digit[1];
    if (d === 0 && st.inst.kind !== "handpan") { addRest(); e.preventDefault(); return; }
    const m = digitNote(st.inst, d, st.oct);
    if (m !== null) enter(m, { chord: e.shiftKey }); else say(`There's no ${d} in that octave on this instrument.`, true);
    e.preventDefault(); return;
  }
  if (key in KEYMAP) {
    const m = st.inst.ref - (((st.inst.ref % 12) + 12) % 12) + st.oct * 12 + KEYMAP[key];
    enter(m, { chord: e.shiftKey }); e.preventDefault(); return;
  }
  const dur = DURS.find((d) => d.key === key);
  if (dur) { setDur(dur.d); return; }
  if (key === "n") { toggleDot(); return; }
  if (key === "r") { addRest(); return; }
  if (e.key === "Backspace" || e.key === "Delete") { e.preventDefault(); del(); return; }
  if (e.key === "ArrowLeft") { e.preventDefault(); select(Math.max(0, st.sel - 1)); return; }
  if (e.key === "ArrowRight") { e.preventDefault(); select(Math.min(st.tune.notes.length, st.sel + 1)); return; }
  if (e.key === "Escape") { st.sel = st.tune.notes.length; renderAll(); return; }
  if (e.key === "[") { st.oct = Math.max(-2, st.oct - 1); renderStatus(); return; }
  if (e.key === "]") { st.oct = Math.min(2, st.oct + 1); renderStatus(); return; }
});
let resizeT = 0;
addEventListener("resize", () => { clearTimeout(resizeT); resizeT = setTimeout(renderStrip, 120); });

// ---------- start ----------
(function start() {
  const saved = load();
  if (saved) { st.saved = Array.isArray(saved.saved) ? saved.saved.filter((t) => t && Array.isArray(t.notes)) : []; if (["number", "letter", "both"].includes(saved.view)) st.view = saved.view; }
  let tune = null, from = "";
  try { tune = fromHash(location.hash); if (tune) from = "link"; } catch { from = "badlink"; }
  if (!tune && saved?.cur) { try { tune = cleanTune(saved.cur); } catch {} }
  if (!tune) tune = cleanTune(STARTERS[0]);
  st.tune = tune; st.inst = makeInstrument(tune.inst); st.sel = tune.notes.length;
  initConvert();
  renderAll();
  if (from === "link") say(`Opened "${tune.title}" from a share link.`);
  else if (from === "badlink") say("That share link is damaged, so your last tune is open instead.", true);
})();

// a share link opened while the page is already open
addEventListener("hashchange", () => {
  try { const t = fromHash(location.hash); if (t) { stop(); setTune(t); st.sel = 0; renderAll(); say(`Opened "${t.title}" from a share link.`); } }
  catch { say("That share link is damaged.", true); }
});

// for the flow test
window.__tabs = () => ({ title: st.tune.title, notes: st.tune.notes.length, sel: st.sel, inst: st.inst.label, kind: st.inst.kind, tuning: st.inst.tuning, shift: st.inst.shift,
  playing: !!st.player, now: st.now, status: st.status, view: st.view, saved: st.saved.length, undo: st.undo.length, rec: !!st.rec, tune: JSON.parse(JSON.stringify(st.tune)) });
