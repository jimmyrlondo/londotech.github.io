// ENCORE. Compose: write music by clicking the staff, typing, tapping the piano
// or playing a MIDI keyboard; record with a click and see it written out; add
// chords and lyrics; hear it; export MusicXML, MIDI or PDF. Scores live in this
// browser for now. The music rules are compose-core.js, the drawing is
// compose-render.js, sound and MIDI are compose-io.js (COMPOSE-MODEL.md).
import { TPQ, barTicks, newScore, newEvent, newId, eventStarts, voiceLength, insertAt, replaceAt, deleteAt, setPitch, transposeScore, changeKey, quantize,
  playbackEvents, toMusicXML, fromMusicXML, toMidiFile, readMidiFile, keyName, spell, normalize } from "./compose-core.js";
import { render } from "./compose-render.js";
import { audio, noteOn, noteOff, allOff, metronome, startMidi, midiStatus, onNotes, playNote, KEYMAP } from "./compose-io.js";
import { TUNINGS } from "./tunings.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const KEY = "encore.compose.v1";

// ---------- instruments: Tune's list plus piano and voices, with clef and transposition ----------
const INSTRUMENTS = [{ name: "Piano", transpose: 0, clef: "treble" }, { name: "Voice (soprano, alto)", transpose: 0, clef: "treble" }, { name: "Voice (tenor)", transpose: 0, clef: "treble8vb" },
  { name: "Voice (bass, baritone)", transpose: 0, clef: "bass" }, ...TUNINGS.families.flatMap((f) => f.instruments).filter((i) => i.part !== "drum").map((i) => ({ name: i.name, transpose: i.transpose || 0, clef: clefFor(i) }))];
function clefFor(i) {
  const n = i.name;
  if (/^Viola(?! da)/.test(n)) return "alto";
  if (/Bass|Cello|Trombone|Tuba|Bassoon|Euphonium|Guitarron|Mandocello|double bass/i.test(n) && !/clarinet|saxophone|ukulele|guitar \(acoustic/i.test(n)) return "bass";
  if (/Guitar|Requinto|Bajo|Baritone guitar|Tenor guitar|Dobro|Lap steel|Pedal steel/i.test(n)) return "treble8vb";
  return "treble";
}

// ---------- the library ----------
function load() {
  try { const d = JSON.parse(localStorage.getItem(KEY) || "null"); if (d?.scores?.length) return d; } catch {}
  const s = newScore({ title: "My first piece", bars: 0 });
  return { scores: [s], openId: s.id, prefs: {} };
}
const db = load();
db.prefs ||= {};
let saveTimer = 0;
const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { toast("Couldn't save in this browser. Download a backup from Share."); } }, 300); };
window.addEventListener("beforeunload", () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch {} });
const score = () => db.scores.find((s) => s.id === db.openId) || db.scores[0];
const voice = () => score().parts[0].voices[0];

// every change is a new score: undo keeps the old ones
const undoStack = [], redoStack = [];
function commit(next, keepCaret = false) {
  const cur = score(), i = db.scores.indexOf(cur);
  undoStack.push(cur); if (undoStack.length > 200) undoStack.shift(); redoStack.length = 0;
  next.updated = Date.now();
  db.scores[i] = next; save();
  if (!keepCaret) clampCaret();
  draw(); renderLib();
}
function undo() { const prev = undoStack.pop(); if (!prev) return; const i = db.scores.findIndex((s) => s.id === prev.id); redoStack.push(db.scores[i]); db.scores[i] = prev; save(); clampCaret(); draw(); renderTools(); }
function redo() { const nx = redoStack.pop(); if (!nx) return; const i = db.scores.findIndex((s) => s.id === nx.id); undoStack.push(db.scores[i]); db.scores[i] = nx; save(); clampCaret(); draw(); renderTools(); }

// ---------- where you are: the caret (insert point) and the selected event ----------
const ui = { caret: voice().length, sel: -1, selNote: 0, dur: db.prefs.dur || 480, dots: 0, rest: false, tab: db.prefs.tab || "write", octave: 4, transposed: false, playing: null, recording: null, triplet: false };
function clampCaret() { const n = voice().length; ui.caret = Math.max(0, Math.min(n, ui.caret)); if (ui.sel >= n) ui.sel = n - 1; }
const curDur = () => (ui.triplet ? Math.round((ui.dur * 2) / 3) : ui.dots === 1 ? ui.dur * 1.5 : ui.dots === 2 ? ui.dur * 1.75 : ui.dur);
const caretTick = () => { const st = eventStarts(voice()); return ui.caret < st.length ? st[ui.caret] : voiceLength(voice()); };

// ---------- drawing ----------
const paper = $("paper");
let hit = null, drawQueued = false, playTick = null;
function draw() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => {
    drawQueued = false;
    const s = score(), bars = Math.max(4, Math.ceil((voiceLength(s.parts[0].voices[0]) + 1) / barTicks(s)) + 1);
    hit = render(paper, s, { width: paper.clientWidth - 28, scale: innerWidth < 700 ? 0.8 : 1, selection: ui.sel >= 0 ? { event: ui.sel, note: ui.selNote } : null, cursor: ui.playing ? null : { tick: caretTick() },
      playhead: playTick, transposed: ui.transposed, bars });
    renderPos();
  });
}
function renderPos() {
  const s = score(), t = caretTick(), bt = barTicks(s), bar = Math.floor((t - (s.pickup || 0)) / bt) + (s.pickup ? 1 : 1), beat = ((t - (s.pickup || 0)) % bt + bt) % bt;
  const e = ui.sel >= 0 ? voice()[ui.sel] : null;
  $("pos").textContent = `Bar ${Math.max(s.pickup ? 0 : 1, bar)}, beat ${(beat / (1920 / s.time.d) + 1).toFixed(beat % (1920 / s.time.d) ? 2 : 0)}` + (e && !e.rest ? `  ·  ${e.notes.map((n) => noteName(n.midi)).join(" ")}` : "");
}
function noteName(m) { const sp = spell(m, score().key); return sp.step + (sp.alter > 0 ? "#".repeat(sp.alter) : "b".repeat(-sp.alter)) + sp.octave; }

// ---------- entering notes ----------
let lastMidi = 67, chordWindow = 0;
function enterNote(midi, { addToChord = false } = {}) {
  const s = score();
  if (addToChord && ui.sel >= 0 && !voice()[ui.sel].rest) { commit(setPitch(s, 0, ui.sel, -1, midi), true); ui.selNote = voice()[ui.sel].notes.length - 1; }
  else {
    const ev = newEvent(curDur(), [midi], ui.triplet ? { tuplet: { n: 3, of: 2 } } : {});
    commit(insertAt(s, 0, ui.caret, ev), true);
    ui.sel = ui.caret; ui.selNote = 0; ui.caret++;
  }
  ui.picked = false;
  lastMidi = midi; draw(); renderTools();
}
function enterRest() {
  commit(insertAt(score(), 0, ui.caret, newEvent(curDur(), [])), true);
  ui.sel = ui.caret; ui.caret++; draw(); renderTools();
}
// a letter name: the nearest such note to the last one
function letterNote(letter) {
  const pcs = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }, sp = score().key;
  // the key's own version of the letter (F# in G)
  let pc = pcs[letter];
  const inKey = spell(60 + pc, sp); if (inKey.step.toLowerCase() !== letter) { const up = spell(61 + pc, sp); if (up.step.toLowerCase() === letter) pc += 1; else { const dn = spell(59 + pc, sp); if (dn.step.toLowerCase() === letter) pc -= 1; } }
  let best = 0, bd = 99;
  for (let o = 1; o <= 8; o++) { const m = o * 12 + pc; if (Math.abs(m - lastMidi) < bd) { bd = Math.abs(m - lastMidi); best = m; } }
  return best;
}
function changeSelected(fn) {
  if (ui.sel < 0) return;
  const s = score(), e = voice()[ui.sel];
  const next = fn(structuredClone(e));
  if (next) commit(replaceAt(s, 0, ui.sel, next), true);
  renderTools();
}
function moveSelected(semis) {
  if (ui.sel < 0 || voice()[ui.sel].rest) return;
  changeSelected((e) => { e.notes = e.notes.map((n, i) => (i === ui.selNote || e.notes.length === 1 || ui.selNote < 0 ? { ...n, midi: Math.max(12, Math.min(120, n.midi + semis)), spell: null } : n)); return e; });
  const n = voice()[ui.sel].notes[Math.max(0, ui.selNote)]; if (n) { lastMidi = n.midi; preview([n.midi]); }
}
function setDuration(ticks) {
  ui.dur = ticks; db.prefs.dur = ticks; save();
  // a note you picked out changes length; otherwise this is the length of the next note you put in
  if (ui.sel >= 0 && ui.picked) changeSelected((e) => { e.dur = curDur(); return e; });
  renderTools();
}
function preview(midis) { for (const m of midis) noteOn(m, 0.7, 0, 0.5); }
function deleteSel(back = false) {
  const i = back ? ui.caret - 1 : ui.sel;
  if (i < 0 || i >= voice().length) return;
  commit(deleteAt(score(), 0, i), true);
  ui.caret = Math.min(i, voice().length); ui.sel = Math.min(i, voice().length) - (back ? 1 : 0); if (ui.sel >= voice().length) ui.sel = voice().length - 1;
  draw(); renderTools();
}

// the keyboard on the score: letters, numbers, arrows (MuseScore-style, so people who know it feel at home)
const DUR_KEYS = { 1: 60, 2: 120, 3: 240, 4: 480, 5: 960, 6: 1920 };
paper.addEventListener("keydown", (e) => {
  // while recording, the letter keys are the piano
  if (e.ctrlKey || e.metaKey || ui.recording) return;
  const k = e.key.toLowerCase();
  if (/^[a-g]$/.test(k)) { e.preventDefault(); const m = letterNote(k); preview([m]); enterNote(m, { addToChord: e.shiftKey }); return; }
  if (DUR_KEYS[k]) { e.preventDefault(); ui.dots = 0; setDuration(DUR_KEYS[k]); return; }
  if (k === "." ) { e.preventDefault(); ui.dots = (ui.dots + 1) % 3; setDuration(ui.dur); return; }
  if (k === "0" || k === "r") { e.preventDefault(); enterRest(); return; }
  if (k === "t") { e.preventDefault(); changeSelected((ev) => { if (ev.rest) return null; ev.notes = ev.notes.map((n) => ({ ...n, tie: !ev.notes.every((x) => x.tie) })); return ev; }); return; }
  if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); moveSelected((e.key === "ArrowUp" ? 1 : -1) * (e.altKey ? 12 : 1)); return; }
  if (e.key === "ArrowLeft") { e.preventDefault(); ui.caret = Math.max(0, ui.caret - 1); ui.sel = ui.caret - 1 >= 0 ? ui.caret - 1 : -1; ui.picked = true; draw(); renderTools(); return; }
  if (e.key === "ArrowRight") { e.preventDefault(); ui.caret = Math.min(voice().length, ui.caret + 1); ui.sel = ui.caret - 1; ui.picked = true; draw(); renderTools(); return; }
  if (e.key === "Home") { e.preventDefault(); ui.caret = 0; ui.sel = -1; draw(); return; }
  if (e.key === "End") { e.preventDefault(); ui.caret = voice().length; ui.sel = ui.caret - 1; draw(); return; }
  if (e.key === "Delete") { e.preventDefault(); deleteSel(false); return; }
  if (e.key === "Backspace") { e.preventDefault(); deleteSel(true); return; }
  if (e.key === "Escape") { ui.sel = -1; draw(); renderTools(); }
});
document.addEventListener("keydown", (e) => {
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
  if ((e.ctrlKey || e.metaKey) && !typing) {
    if (e.key.toLowerCase() === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
    else if (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey)) { e.preventDefault(); redo(); }
    else if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); moveSelected(e.key === "ArrowUp" ? 12 : -12); }
    return;
  }
  if (e.key === " " && !typing) { e.preventDefault(); ui.playing ? stopAll() : play(); }
  // the computer keys as a piano while recording
  if (ui.recording && !typing && !e.repeat && KEYMAP[e.key.toLowerCase()] !== undefined) { e.preventDefault(); playNote("on", 12 * (ui.octave + 1) + KEYMAP[e.key.toLowerCase()]); }
});
document.addEventListener("keyup", (e) => { if (ui.recording && KEYMAP[e.key.toLowerCase()] !== undefined) playNote("off", 12 * (ui.octave + 1) + KEYMAP[e.key.toLowerCase()]); });

// clicking the staff: a note selects it; empty staff or a rest puts a note where you clicked
paper.addEventListener("pointerdown", (e) => {
  if (!hit) return;
  paper.focus({ preventScroll: true });
  const r = paper.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  const ev = hit.events.find((h) => x >= h.x - 4 && x <= h.x + h.w + 4 && y >= h.y - 4 && y <= h.y + h.h + 4);
  const sys = hit.systems.find((s) => y >= s.top - 30 && y <= s.top + s.h + 10) || hit.systems[hit.systems.length - 1];
  if (ev && ev.event >= 0 && !voice()[ev.event]?.rest) {
    ui.sel = ev.event; ui.caret = ev.event + 1; ui.picked = true;
    ui.selNote = ev.notes?.length ? ev.notes.reduce((b, n, i) => (Math.abs(n.y - y) < Math.abs(ev.notes[b].y - y) ? i : b), 0) : 0;
    preview(voice()[ev.event].notes.map((n) => n.midi)); draw(); renderTools(); return;
  }
  if (!sys) return;
  const midi = hit.pitchAt(sys.index, y);
  if (ev && ev.event >= 0 && voice()[ev.event]?.rest) {
    // a rest you clicked becomes that note, the same length
    const old = voice()[ev.event];
    commit(replaceAt(score(), 0, ev.event, { ...old, rest: false, notes: [{ midi, tie: false, spell: null }] }), true);
    ui.sel = ev.event; ui.caret = ev.event + 1; lastMidi = midi; preview([midi]); draw(); renderTools(); return;
  }
  // anywhere else: a new note at the end (or at the caret if the click is before the end)
  const tick = hit.tickAt(sys.index, x), st = eventStarts(voice());
  if (tick < voiceLength(voice())) { let i = st.findIndex((t) => t > tick); ui.caret = i < 0 ? st.length : Math.max(0, i - 1) + 1; }
  else ui.caret = voice().length;
  preview([midi]); enterNote(midi, { addToChord: e.shiftKey });
});

// ---------- the on-screen piano ----------
const pianoEl = $("piano");
function renderPiano() {
  const lo = 12 * (ui.octave + 1) - 12 + 12, span = innerWidth < 700 ? 1 : 2, hi = lo + 12 * span + 1;
  const whites = []; for (let m = lo; m <= hi; m++) if (![1, 3, 6, 8, 10].includes(m % 12)) whites.push(m);
  const w = 100 / whites.length;
  let html = whites.map((m, i) => `<div class="wk" data-m="${m}" style="left:${i * w}%;width:${w}%">${m % 12 === 0 ? `<span>C${Math.floor(m / 12) - 1}</span>` : ""}</div>`).join("");
  for (let m = lo; m <= hi; m++) if ([1, 3, 6, 8, 10].includes(m % 12)) { const i = whites.indexOf(m - 1); html += `<div class="bk" data-m="${m}" style="left:${(i + 0.68) * w}%;width:${w * 0.64}%"></div>`; }
  pianoEl.innerHTML = html;
}
pianoEl.addEventListener("pointerdown", (e) => { const k = e.target.closest("[data-m]"); if (!k) return; e.preventDefault(); pianoEl.setPointerCapture(e.pointerId); playNote("on", +k.dataset.m); pianoEl.dataset.down = k.dataset.m; });
pianoEl.addEventListener("pointerup", () => { if (pianoEl.dataset.down) { playNote("off", +pianoEl.dataset.down); delete pianoEl.dataset.down; } });
$("octUp").onclick = () => { ui.octave = Math.min(7, ui.octave + 1); renderPiano(); };
$("octDown").onclick = () => { ui.octave = Math.max(1, ui.octave - 1); renderPiano(); };
addEventListener("resize", () => { renderPiano(); draw(); });
function lightKey(m, on) { pianoEl.querySelector(`[data-m="${m}"]`)?.classList.toggle("on", on); }

// every note from anywhere (MIDI, piano, computer keys): sound it, and write it (step entry) or capture it (recording)
onNotes((ev) => {
  if (ev.type === "devices") { renderTools(); return; }
  if (ev.type === "on") {
    noteOn(ev.midi, ev.vel); lightKey(ev.midi, true);
    if (ui.recording) { ui.recording.open.set(ev.midi, { midi: ev.midi, on: ev.t - ui.recording.t0, vel: ev.vel }); return; }
    if (ui.playing) return;
    // keys pressed together make a chord
    const now = performance.now(), together = now - chordWindow < 60;
    chordWindow = now;
    enterNote(ev.midi, { addToChord: together });
  } else if (ev.type === "off") {
    noteOff(ev.midi); lightKey(ev.midi, false);
    const r = ui.recording; if (r && r.open.has(ev.midi)) { const n = r.open.get(ev.midi); r.open.delete(ev.midi); n.off = ev.t - r.t0; r.notes.push(n); }
  }
});

// ---------- play and record ----------
function play() {
  stopAll();
  const s = score(), a = audio(), from = ui.caret >= voice().length ? 0 : caretTick();
  const evs = playbackEvents(s, { from }), t0 = a.currentTime + 0.12, beat = 60 / s.tempo * (1920 / s.time.d) / TPQ;
  for (const e of evs) noteOn(e.midi, e.vel / 127, t0 + e.time, e.dur);
  const end = evs.length ? Math.max(...evs.map((e) => e.time + e.dur)) : 0;
  const met = db.prefs.click ? metronome(t0 - ((from % barTicks(s)) / TPQ) * (60 / s.tempo) + Math.ceil((from % barTicks(s)) / (1920 / s.time.d)) * beat, beat, s.time.n, {}) : null;
  ui.playing = { t0, from, met, end };
  $("playBtn").innerHTML = "&#9632;"; $("playBtn").classList.add("on");
  const step = () => {
    if (!ui.playing) return;
    const t = audio().currentTime - t0;
    if (t > end + 0.3) { stopAll(); return; }
    playTick = from + Math.max(0, t) * (s.tempo / 60) * TPQ; draw();
    ui.playing.raf = setTimeout(step, 50);
  };
  step();
}
function stopAll() {
  if (ui.playing) { ui.playing.met?.stop(); clearTimeout(ui.playing.raf); ui.playing = null; }
  allOff(); playTick = null;
  $("playBtn").innerHTML = "&#9654;"; $("playBtn").classList.remove("on");
  if (ui.recording) finishRecording();
  draw();
}
$("playBtn").onclick = () => (ui.playing || ui.recording ? stopAll() : play());
async function record() {
  if (ui.recording) { stopAll(); return; }
  stopAll();
  await startMidi();
  const s = score(), a = audio(), beat = (60 / s.tempo) * (4 / s.time.d), bar = beat * s.time.n, count = db.prefs.countIn ?? 1;
  const t0 = a.currentTime + 0.25 + bar * count; // the first downbeat, after the count-in
  const overlay = document.createElement("div"); overlay.className = "count"; paper.appendChild(overlay);
  const met = metronome(t0 - bar * count, beat, s.time.n, { on: true, onBeat: (i) => { const left = count * s.time.n - i; overlay.textContent = left > 0 ? String(((i) % s.time.n) + 1) : ""; if (left <= 0) overlay.remove(); } });
  // the existing music plays along from the caret (overdub-style listening), unless it's empty
  ui.recording = { t0, met, notes: [], open: new Map(), at: ui.caret, overlay };
  $("recBtn").classList.add("on"); $("recBtn").innerHTML = "&#9632; Stop";
  renderTools();
  toast(midiStatus().devices.length ? `Recording from ${midiStatus().devices[0]}. Count in, then play.` : "Recording. No MIDI keyboard found: play the piano below or your computer keys (A W S E D...).", 3500);
}
function finishRecording() {
  const r = ui.recording; ui.recording = null;
  r.met.stop(); r.overlay.remove();
  const end = audio().currentTime - r.t0;
  for (const n of r.open.values()) { n.off = end; r.notes.push(n); }
  $("recBtn").classList.remove("on"); $("recBtn").innerHTML = "&#9679; Record";
  if (!r.notes.length) { toast("Nothing was played."); renderTools(); return; }
  const s = score(), q = quantize(r.notes.sort((a, b) => a.on - b.on), { tempo: s.tempo, time: s.time, grid: db.prefs.grid || 120, triplets: db.prefs.triplets === false ? false : "auto", chords: !!db.prefs.recChords });
  let next = s;
  q.events.forEach((ev, i) => { next = insertAt(next, 0, r.at + i, ev); });
  commit(next, true);
  ui.caret = r.at + q.events.length; ui.sel = ui.caret - 1;
  draw(); renderTools();
  toast(`Wrote ${q.events.filter((e) => !e.rest).length} notes. Undo with Ctrl+Z if you want another take.`, 3500);
}
$("recBtn").onclick = record;
$("clickBtn").onclick = () => { db.prefs.click = !db.prefs.click; save(); $("clickBtn").classList.toggle("on", !!db.prefs.click); };
$("tempo").onchange = (e) => { const v = Math.max(20, Math.min(320, +e.target.value || 100)); commit({ ...score(), tempo: v }, true); };
$("undoBtn").onclick = undo; $("redoBtn").onclick = redo;
$("transUp").onclick = () => commit(transposeScore(score(), 1), true);
$("transDown").onclick = () => commit(transposeScore(score(), -1), true);
$("written").onchange = (e) => { ui.transposed = e.target.checked; draw(); };

// ---------- the side panel ----------
const tbody = $("tbody");
$("ttabs").onclick = (e) => { const b = e.target.closest("button"); if (!b) return; ui.tab = b.dataset.t; db.prefs.tab = ui.tab; save(); renderTools(); };
const NOTE_ICON = (type) => {
  const filled = !["whole", "half"].includes(type), stem = type !== "whole", flags = { eighth: 1, "16th": 2, "32nd": 3 }[type] || 0;
  let s = `<svg viewBox="0 0 26 32" aria-hidden="true"><ellipse cx="9" cy="25" rx="5.5" ry="4" transform="rotate(-20 9 25)" fill="${filled ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.6"/>`;
  if (stem) s += `<line x1="14" y1="24" x2="14" y2="3" stroke="currentColor" stroke-width="1.6"/>`;
  for (let i = 0; i < flags; i++) s += `<path d="M14 ${3 + i * 5} q7 4 5 11" fill="none" stroke="currentColor" stroke-width="1.8"/>`;
  return s + "</svg>";
};
const PALETTE = [[1920, "whole", 6], [960, "half", 5], [480, "quarter", 4], [240, "eighth", 3], [120, "16th", 2], [60, "32nd", 1]];
function renderTools() {
  for (const b of $("ttabs").children) b.classList.toggle("on", b.dataset.t === ui.tab);
  const s = score(), e = ui.sel >= 0 ? voice()[ui.sel] : null;
  $("tempo").value = s.tempo;
  $("clickBtn").classList.toggle("on", !!db.prefs.click);
  $("undoBtn").disabled = !undoStack.length; $("redoBtn").disabled = !redoStack.length;
  const tr = s.parts[0].transpose || 0;
  $("writtenWrap").classList.toggle("hidden", !tr);
  if (ui.tab === "write") {
    tbody.innerHTML = `<div class="lbl"><span>Note length</span><span class="dim">keys 1 to 6</span></div>
      <div class="grid" id="durs">${PALETTE.map(([t, type, k]) => `<button class="pal${ui.dur === t ? " on" : ""}" data-d="${t}" title="${type}">${NOTE_ICON(type)}<kbd>${k}</kbd></button>`).join("")}</div>
      <div class="grid" style="margin-top:5px">
        <button class="pal${ui.dots === 1 ? " on" : ""}" id="dotBtn" title="Dotted (.)">&#9679;<kbd>.</kbd></button>
        <button class="pal${ui.triplet ? " on" : ""}" id="tripBtn" title="Triplet: three in the time of two">3</button>
        <button class="pal" id="restBtn" title="Put a rest in (0 or R)">Rest<kbd>0</kbd></button>
        <button class="pal" id="tieBtn" title="Tie to the next note (T)" ${e && !e.rest ? "" : "disabled"}>Tie<kbd>T</kbd></button>
        <button class="pal" id="sharpBtn" title="Up a half step (Up arrow)" ${e && !e.rest ? "" : "disabled"}>&#9839;</button>
        <button class="pal" id="flatBtn" title="Down a half step (Down arrow)" ${e && !e.rest ? "" : "disabled"}>&#9837;</button>
        <button class="pal" id="delBtn" title="Delete the selected note (Delete)" ${e ? "" : "disabled"}>&#10005;</button>
      </div>
      <div class="lbl"><span>${e ? (e.rest ? "Selected rest" : `Selected: ${e.notes.map((n) => noteName(n.midi)).join(" ")}`) : "Chord and lyric"}</span><span class="dim">${e ? "on the selected note" : "select a note first"}</span></div>
      <div class="form">
        <label>Chord symbol<input class="t" id="chordIn" value="${esc(e?.chord || "")}" placeholder="G7, Am, F/A" ${e ? "" : "disabled"}></label>
        <label>Lyric<input class="t" id="lyricIn" value="${esc((e?.lyric || "") + (e?.lyricHyphen ? "-" : ""))}" placeholder="love, or mer- for a hyphen" ${e ? "" : "disabled"}></label>
        <label>Articulation<select class="t" id="articIn" ${e && !e.rest ? "" : "disabled"}><option value="">None</option>${["staccato", "accent", "tenuto", "fermata"].map((a) => `<option ${e?.artic?.includes(a) ? "selected" : ""}>${a}</option>`).join("")}</select></label>
        <label>Dynamic<select class="t" id="dynIn" ${e ? "" : "disabled"}><option value="">None</option>${["pp", "p", "mp", "mf", "f", "ff"].map((d) => `<option ${e?.dyn === d ? "selected" : ""}>${d}</option>`).join("")}</select></label>
      </div>
      <p class="note">Type a lyric and press Enter or Tab to move to the next note. End a syllable with - to join it to the next one.</p>
      <div class="lbl"><span>How to write</span></div>
      <div class="keys"><b>Click the staff</b> where a note goes (Shift-click adds to a chord), or <b>tap the piano</b>, or <b>play a MIDI keyboard</b>. Keys: <kbd>A</kbd>-<kbd>G</kbd> note names (Shift adds to the chord), <kbd>1</kbd>-<kbd>6</kbd> lengths, <kbd>.</kbd> dot, <kbd>0</kbd> rest, <kbd>T</kbd> tie, <kbd>&#8593;</kbd><kbd>&#8595;</kbd> half step, <kbd>Ctrl</kbd>+<kbd>&#8593;</kbd> octave, <kbd>&#8592;</kbd><kbd>&#8594;</kbd> move, <kbd>Space</kbd> play.</div>`;
    $("durs").onclick = (ev) => { const b = ev.target.closest("[data-d]"); if (b) { ui.triplet = false; setDuration(+b.dataset.d); } };
    $("dotBtn").onclick = () => { ui.dots = ui.dots === 1 ? 0 : 1; ui.triplet = false; setDuration(ui.dur); };
    $("tripBtn").onclick = () => { ui.triplet = !ui.triplet; ui.dots = 0; renderTools(); };
    $("restBtn").onclick = () => { enterRest(); paper.focus(); };
    $("tieBtn").onclick = () => { paper.focus(); paper.dispatchEvent(new KeyboardEvent("keydown", { key: "t", bubbles: true })); };
    $("sharpBtn").onclick = () => moveSelected(1);
    $("flatBtn").onclick = () => moveSelected(-1);
    $("delBtn").onclick = () => deleteSel(false);
    $("chordIn").onchange = (ev) => changeSelected((x) => { x.chord = ev.target.value.trim() || undefined; return x; });
    const lyr = $("lyricIn");
    lyr.onkeydown = (ev) => {
      if (ev.key !== "Enter" && ev.key !== "Tab") return;
      ev.preventDefault();
      const v = lyr.value.trim(), hyph = v.endsWith("-");
      changeSelected((x) => { x.lyric = v.replace(/-$/, "") || undefined; x.lyricHyphen = hyph; return x; });
      // on to the next note that sounds
      let i = ui.sel + 1; while (i < voice().length && voice()[i].rest) i++;
      if (i < voice().length) { ui.sel = i; ui.picked = true; draw(); renderTools(); $("lyricIn").focus(); }
    };
    $("articIn").onchange = (ev) => changeSelected((x) => { x.artic = ev.target.value ? [ev.target.value] : []; return x; });
    $("dynIn").onchange = (ev) => changeSelected((x) => { x.dyn = ev.target.value || null; return x; });
  } else if (ui.tab === "record") {
    const st = midiStatus();
    tbody.innerHTML = `<div class="lbl"><span>Record</span></div>
      <p class="note" style="margin-top:0">Press <b>Record</b>, listen to the count-in, and play. When you stop, ENCORE. writes what you played into the score at the caret, lined up to the beat. Undo for another take.</p>
      <div class="row"><button class="btn rec${ui.recording ? " on" : ""}" id="recBig">${ui.recording ? "&#9632; Stop" : "&#9679; Record"}</button><button class="btn sm" id="midiBtn">${st.state === "on" ? "MIDI on" : "Use a MIDI keyboard"}</button></div>
      <p class="note">${st.state === "unsupported" ? "This browser can't use MIDI keyboards (Chrome and Edge can). The piano below and your computer keys still work." : st.state === "denied" ? "MIDI was blocked. Allow it in the address bar, or use the piano below." : st.devices.length ? `Connected: ${esc(st.devices.join(", "))}.` : "No MIDI keyboard yet: plug one in, or play the piano below or your computer keys (A W S E D F T G Y H U J K, the octave buttons move it)."}</p>
      <div class="lbl"><span>Count-in and click</span></div>
      <div class="form">
        <label>Count-in<select class="t" id="countIn"><option value="0">None</option><option value="1">1 bar</option><option value="2">2 bars</option></select></label>
        <label>Click<select class="t" id="clickSel"><option value="1">On</option><option value="0">Off while playing back</option></select></label>
      </div>
      <div class="lbl"><span>How it's written</span></div>
      <div class="form">
        <label>Shortest note<select class="t" id="gridSel"><option value="240">8th notes</option><option value="120">16th notes</option><option value="60">32nd notes</option></select></label>
        <label>Triplets and swing<select class="t" id="tripSel"><option value="auto">Find them</option><option value="off">Straight only</option></select></label>
        <label class="wide"><span><input type="checkbox" id="chordsChk" ${db.prefs.recChords ? "checked" : ""}> Keep chords (off: just the top line, for melodies)</span></label>
      </div>
      <p class="note">Tip: a steady tempo you're comfortable with gives the cleanest page. Slow it down, record, then speed the tempo back up: the notes stay the same.</p>`;
    $("recBig").onclick = record;
    $("midiBtn").onclick = async () => { await startMidi(); renderTools(); };
    $("countIn").value = String(db.prefs.countIn ?? 1); $("countIn").onchange = (ev) => { db.prefs.countIn = +ev.target.value; save(); };
    $("clickSel").value = db.prefs.click ? "1" : "0"; $("clickSel").onchange = (ev) => { db.prefs.click = ev.target.value === "1"; save(); renderTools(); };
    $("gridSel").value = String(db.prefs.grid || 120); $("gridSel").onchange = (ev) => { db.prefs.grid = +ev.target.value; save(); };
    $("tripSel").value = db.prefs.triplets === false ? "off" : "auto"; $("tripSel").onchange = (ev) => { db.prefs.triplets = ev.target.value === "auto" ? "auto" : false; save(); };
    $("chordsChk").onchange = (ev) => { db.prefs.recChords = ev.target.checked; save(); };
  } else if (ui.tab === "score") {
    const p = s.parts[0];
    tbody.innerHTML = `<div class="form">
        <label class="wide">Title<input class="t" id="fTitle" value="${esc(s.title)}"></label>
        <label>Composer<input class="t" id="fComposer" value="${esc(s.composer)}"></label>
        <label>Lyrics by<input class="t" id="fLyricist" value="${esc(s.lyricist)}"></label>
        <label>Key<select class="t" id="fKey">${Array.from({ length: 15 }, (_, i) => i - 7).map((k) => `<option value="${k}">${esc(keyName(k, s.mode))}</option>`).join("")}</select></label>
        <label>Major or minor<select class="t" id="fMode"><option value="major">Major</option><option value="minor">Minor</option></select></label>
        <label>Time<select class="t" id="fTime">${["4/4", "3/4", "2/4", "2/2", "6/8", "9/8", "12/8", "5/4", "5/8", "7/8", "3/8"].map((t) => `<option>${t}</option>`).join("")}</select></label>
        <label>Pickup<select class="t" id="fPickup"><option value="0">None</option>${[1, 2, 3].map((b) => `<option value="${b * (1920 / s.time.d)}">${b} beat${b > 1 ? "s" : ""}</option>`).join("")}</select></label>
        <label class="wide">Instrument<select class="t" id="fInst">${INSTRUMENTS.map((i) => `<option>${esc(i.name)}</option>`).join("")}</select></label>
        <label>Clef<select class="t" id="fClef">${[["treble", "Treble"], ["bass", "Bass"], ["alto", "Alto"], ["tenor", "Tenor"], ["treble8vb", "Treble (octave down)"]].map(([v, n]) => `<option value="${v}">${n}</option>`).join("")}</select></label>
        <label>Change key<select class="t" id="fMove"><option value="">Keep the notes</option><option value="1">Move the notes too</option></select></label>
      </div>
      <p class="note">${tr ? `${esc(p.instrument)} reads ${tr > 0 ? "above" : "below"} concert pitch. Tick <b>Written pitch</b> at the top to see the part as the player reads it.` : "Moving to a new key with the notes moving too transposes the whole piece."}</p>`;
    const bind = (id, f) => ($(id).onchange = (ev) => f(ev.target.value));
    bind("fTitle", (v) => commit({ ...score(), title: v }, true));
    bind("fComposer", (v) => commit({ ...score(), composer: v }, true));
    bind("fLyricist", (v) => commit({ ...score(), lyricist: v }, true));
    $("fKey").value = String(s.key); $("fMode").value = s.mode; $("fTime").value = `${s.time.n}/${s.time.d}`; $("fPickup").value = String(s.pickup || 0);
    $("fInst").value = p.instrument; $("fClef").value = p.clef;
    bind("fKey", (v) => commit(changeKey(score(), +v, { transpose: $("fMove").value === "1", mode: score().mode }), true));
    bind("fMode", (v) => commit({ ...score(), mode: v }, true));
    bind("fTime", (v) => { const [n, d] = v.split("/").map(Number); commit({ ...score(), time: { n, d } }, true); renderTools(); });
    bind("fPickup", (v) => commit({ ...score(), pickup: +v }, true));
    bind("fInst", (v) => { const i = INSTRUMENTS.find((x) => x.name === v); const sc = structuredClone(score()); Object.assign(sc.parts[0], { instrument: v, name: v, transpose: i.transpose, clef: i.clef }); commit(sc, true); renderTools(); });
    bind("fClef", (v) => { const sc = structuredClone(score()); sc.parts[0].clef = v; commit(sc, true); });
  } else {
    tbody.innerHTML = `<div class="lbl"><span>Download</span></div>
      <div class="row"><button class="btn sm" id="dlXml">MusicXML</button><button class="btn sm" id="dlMid">MIDI</button><button class="btn sm" id="dlPdf">Print or PDF</button></div>
      <p class="note">MusicXML opens in MuseScore, Sibelius, Finale, Dorico and Guitar Pro. MIDI opens in any DAW, including Basement Studio.</p>
      <div class="lbl"><span>Open</span></div>
      <div class="row"><button class="btn sm" id="openFile">MusicXML or MIDI file</button></div>
      <div class="lbl"><span>Your scores</span><span class="dim">kept in this browser</span></div>
      <div class="row"><button class="btn sm" id="backup">Download a backup</button><button class="btn sm" id="dup">Make a copy</button><button class="btn sm" id="delScore">Delete this score</button></div>
      <div class="lbl"><span>Page</span></div>
      <div class="row"><label class="small"><input type="checkbox" id="paperChk" ${db.prefs.paper ? "checked" : ""}> Light paper</label></div>`;
    const fname = (ext) => `${(s.title || "score").replace(/[\\/:*?"<>|]+/g, "")}.${ext}`;
    $("dlXml").onclick = () => download(new Blob([toMusicXML(s)], { type: "application/vnd.recordare.musicxml+xml" }), fname("musicxml"));
    $("dlMid").onclick = () => download(new Blob([toMidiFile(s)], { type: "audio/midi" }), fname("mid"));
    $("dlPdf").onclick = () => window.print();
    $("openFile").onclick = () => { $("importFile").accept = ".musicxml,.xml,.mid,.midi,.json"; $("importFile").click(); };
    $("backup").onclick = () => download(new Blob([JSON.stringify({ app: "ENCORE. Compose", version: 1, scores: db.scores }, null, 1)], { type: "application/json" }), `ENCORE Compose backup ${new Date().toISOString().slice(0, 10)}.json`);
    $("dup").onclick = () => { const c = { ...structuredClone(s), id: newId("sc"), title: (s.title || "Untitled") + " (copy)", created: Date.now(), updated: Date.now() }; db.scores.push(c); db.openId = c.id; save(); openScore(c.id); };
    $("delScore").onclick = () => { if (!confirm(`Delete "${s.title || "Untitled"}"? This can't be undone (unless you have a backup).`)) return; db.scores = db.scores.filter((x) => x !== s); if (!db.scores.length) db.scores.push(newScore({ title: "Untitled", bars: 0 })); openScore(db.scores[0].id); };
    $("paperChk").onchange = (ev) => { db.prefs.paper = ev.target.checked; save(); document.body.classList.toggle("light", db.prefs.paper); };
  }
}
$("importFile").onchange = async () => {
  const f = $("importFile").files[0]; $("importFile").value = ""; if (!f) return;
  try {
    let sc;
    if (/\.json$/i.test(f.name)) { const d = JSON.parse(await f.text()); for (const x of d.scores || []) if (!db.scores.some((y) => y.id === x.id)) db.scores.push(x); save(); renderLib(); toast(`Imported ${d.scores?.length || 0} scores.`); return; }
    if (/\.midi?$/i.test(f.name)) sc = fromMidi(new Uint8Array(await f.arrayBuffer()), f.name);
    else sc = fromMusicXML(await f.text());
    sc.id = newId("sc"); sc.created = sc.updated = Date.now();
    db.scores.push(sc); save(); openScore(sc.id); toast(`Opened ${f.name}.`);
  } catch (err) { toast(`Couldn't open it: ${err.message || err}`, 4000); }
};
// a MIDI file: its notes played back through the recorder's quantizer, so it reads like music, not machine timing
function fromMidi(bytes, name) {
  const m = readMidiFile(bytes), tempo = Math.round(m.tempo || 120), time = m.time || { n: 4, d: 4 };
  const track = m.tracks.find((t) => t.notes.length) || { notes: [] }, secPerTick = 60 / tempo / m.division;
  const notes = track.notes.map((n) => ({ midi: n.midi, on: n.tick * secPerTick, off: (n.tick + n.dur) * secPerTick, vel: n.vel / 127 }));
  const q = quantize(notes, { tempo, time, grid: 120, triplets: "auto", chords: true });
  const sc = newScore({ title: name.replace(/\.[^.]+$/, ""), tempo, time, key: m.key ?? 0, bars: 0 });
  sc.parts[0].voices[0] = q.events; sc.pickup = q.pickup || 0;
  return sc;
}
function download(blob, name) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }

// ---------- library ----------
function renderLib() {
  $("lib").innerHTML = [...db.scores].sort((a, b) => (b.updated || 0) - (a.updated || 0)).map((s) => `<button class="scoreRow${s.id === db.openId ? " on" : ""}" data-id="${s.id}">${esc(s.title || "Untitled")}<span class="d">${esc(keyName(s.key, s.mode))}, ${s.time.n}/${s.time.d}, ${s.parts[0].voices[0].filter((e) => !e.rest).length} notes</span></button>`).join("");
}
$("lib").onclick = (e) => { const b = e.target.closest(".scoreRow"); if (b) { openScore(b.dataset.id); setMobile("score"); } };
$("newScore").onclick = () => { const s = newScore({ title: "Untitled", bars: 0, tempo: 100 }); db.scores.push(s); openScore(s.id); ui.tab = "score"; renderTools(); };
function openScore(id) { stopAll(); db.openId = id; undoStack.length = 0; redoStack.length = 0; ui.caret = voice().length; ui.sel = ui.caret - 1; save(); renderLib(); renderTools(); draw(); }

// ---------- little things ----------
let toastTimer = 0;
function toast(t, ms = 2400) {
  let el = document.querySelector(".toast");
  if (!el) { el = document.createElement("div"); el.className = "toast"; el.setAttribute("role", "status"); document.body.appendChild(el); }
  el.textContent = t; clearTimeout(toastTimer); toastTimer = setTimeout(() => el.remove(), ms);
}
function setMobile(m) { document.querySelector("main").dataset.m = m; for (const b of $("mtabs").children) b.classList.toggle("on", b.dataset.m === m); }
$("mtabs").onclick = (e) => { const b = e.target.closest("button"); if (b) setMobile(b.dataset.m); };
document.body.classList.toggle("light", !!db.prefs.paper);
void normalize; void spell;
renderPiano(); renderLib(); renderTools(); draw();
// MIDI keyboards are picked up without asking again once the browser has said yes
navigator.permissions?.query({ name: "midi" }).then((p) => { if (p.state === "granted") startMidi().then(renderTools); }).catch(() => {});
