// ENCORE. Compose: write music by clicking the staff, typing, tapping the piano,
// playing a MIDI keyboard or singing; record with a click (hearing the rest of the
// score) and see it written out; several instruments, piano on two staves, two
// voices a staff; slurs, hairpins, repeats, endings and jumps; chords and lyrics;
// Songbook songs as lead sheets; MusicXML, MIDI and PDF out, one player's part too.
// Scores live in this browser for now. The music rules are compose-core.js, the
// drawing is compose-render.js, sound, MIDI and the mic are compose-io.js
// (COMPOSE-MODEL.md is the contract between them).
import { TPQ, barTicks, newScore, newEvent, newId, newPart, eventStarts, voiceLength, insertAt, replaceAt, deleteAt, setPitch, transposeScore, changeKey,
  quantize, playbackEvents, timeline, toMusicXML, fromMusicXML, toMidiFile, readMidiFile, keyName, spell, upgrade, addPart, removePart, movePart, barInfo,
  setBar, copyRange, pasteAt, deleteRange, transposeRange, addSpan, removeSpan, writeAt, fromLeadSheet } from "./compose-core.js";
import { render } from "./compose-render.js";
import { audio, noteOn, noteOff, allOff, metronome, startMidi, midiStatus, onNotes, playNote, KEYMAP, soundFor, startMic, stopMic, playScore, playEvents, renderAudio, renderStems, toWav, encodeAudio } from "./compose-io.js";
import { perform, performanceLength } from "./compose-play.js";
import { songbookSongs, leadSheetFrom } from "./compose-songbook.js";
import { parseCommand, searchCommands } from "./compose-commands.js";
import { TEMPLATES } from "./compose-templates.js";
import { proofread, analyze } from "./compose-proof.js";
import { TUNINGS } from "./tunings.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const KEY = "encore.compose.v1";

// ---------- instruments: Tune's list plus piano and voices, with clef, staves and transposition ----------
const GRAND = ["Piano", "Organ", "Harp"];
const INSTRUMENTS = [{ name: "Piano", transpose: 0, clef: "treble" }, { name: "Organ", transpose: 0, clef: "treble" }, { name: "Harp", transpose: 0, clef: "treble" },
  { name: "Voice (soprano, alto)", transpose: 0, clef: "treble" }, { name: "Voice (tenor)", transpose: 0, clef: "treble8vb" }, { name: "Voice (bass, baritone)", transpose: 0, clef: "bass" },
  ...TUNINGS.families.flatMap((f) => f.instruments).filter((i) => i.part !== "drum").map((i) => ({ name: i.name, transpose: i.transpose || 0, clef: clefFor(i) }))];
function clefFor(i) {
  const n = i.name;
  if (/^Viola(?! da)/.test(n)) return "alto";
  if (/Bass|Cello|Trombone|Tuba|Bassoon|Euphonium|Guitarron|Mandocello|double bass/i.test(n) && !/clarinet|saxophone|ukulele/i.test(n)) return "bass";
  if (/Guitar|Requinto|Bajo|Dobro|Lap steel|Pedal steel/i.test(n)) return "treble8vb";
  return "treble";
}
function partFor(name) {
  const i = INSTRUMENTS.find((x) => x.name === name) || INSTRUMENTS[0], grand = GRAND.includes(name);
  return newPart({ name, instrument: name, clef: i.clef, transpose: i.transpose, staves: grand ? 2 : 1, clefs: grand ? ["treble", "bass"] : [i.clef] });
}

// ---------- the library ----------
function load() {
  try { const d = JSON.parse(localStorage.getItem(KEY) || "null"); if (d?.scores?.length) { d.scores = d.scores.map(upgrade); return d; } } catch {}
  const s = newScore({ title: "My first piece", bars: 0 });
  return { scores: [s], openId: s.id, prefs: {} };
}
const db = load();
db.prefs ||= {};
let saveTimer = 0;
const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { toast("Couldn't save in this browser. Download a backup from Share."); } }, 300); };
window.addEventListener("beforeunload", () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch {} });
const score = () => db.scores.find((s) => s.id === db.openId) || db.scores[0];

// where you are: the part and voice you're writing in, the caret (insert point), the selected event, a range
const ui = { part: 0, voice: 0, caret: 0, sel: -1, selNote: 0, range: null, picked: false, dur: db.prefs.dur || 480, dots: 0, triplet: false,
  mode: db.prefs.mode || "insert", tab: db.prefs.tab || "write", octave: 4, transposed: false, playing: null, recording: null };
const part = () => score().parts[Math.min(ui.part, score().parts.length - 1)];
const voice = () => part().voices[ui.voice] || [];
const staffOfVoice = (v) => (part().voiceStaff || [0, 0, 1, 1])[v] || 0;
ui.caret = voice().length;

// every change is a new score: undo keeps the old ones
const undoStack = [], redoStack = [];
function commit(next, keepCaret = true) {
  const cur = score(), i = db.scores.indexOf(cur);
  undoStack.push(cur); if (undoStack.length > 200) undoStack.shift(); redoStack.length = 0;
  next.updated = Date.now();
  db.scores[i] = next; save(); snapshot(next);
  if (!keepCaret) ui.caret = voice().length;
  clamp(); draw(); renderLib();
}
function undo() { const prev = undoStack.pop(); if (!prev) return; const i = db.scores.findIndex((s) => s.id === prev.id); redoStack.push(db.scores[i]); db.scores[i] = prev; save(); clamp(); draw(); renderTools(); }
function redo() { const nx = redoStack.pop(); if (!nx) return; const i = db.scores.findIndex((s) => s.id === nx.id); undoStack.push(db.scores[i]); db.scores[i] = nx; save(); clamp(); draw(); renderTools(); }
function clamp() {
  ui.part = Math.min(ui.part, score().parts.length - 1);
  if (!part().voices[ui.voice]) ui.voice = 0;
  const n = voice().length;
  ui.caret = Math.max(0, Math.min(n, ui.caret)); if (ui.sel >= n) ui.sel = n - 1;
  if (ui.range && (ui.range.from >= n || ui.range.to >= n)) ui.range = null;
}
const curDur = () => (ui.triplet ? Math.round((ui.dur * 2) / 3) : ui.dots === 1 ? ui.dur * 1.5 : ui.dots === 2 ? ui.dur * 1.75 : ui.dur);
const caretTick = () => { const st = eventStarts(voice()); return ui.caret < st.length ? st[ui.caret] : voiceLength(voice()); };
// what a "range" means for the tools: the shift-selected run, or just the selected note
const rangeNow = () => (ui.range ? { from: Math.min(ui.range.from, ui.range.to), to: Math.max(ui.range.from, ui.range.to) } : ui.sel >= 0 ? { from: ui.sel, to: ui.sel } : null);
const barAtCaret = () => { const t = caretTick(), info = barInfo(score(), { bars: 0 }); let b = 0; for (const x of info) if (x.start <= t) b = x.index; return b; };

// ---------- drawing ----------
const paper = $("paper");
let hit = null, drawQueued = false, playTick = null;
function draw() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => {
    drawQueued = false;
    const s = score(), longest = Math.max(...s.parts.flatMap((p) => p.voices.map(voiceLength)), 0);
    const bars = Math.max(4, Math.ceil((longest + 1) / barTicks(s)) + 1), r = rangeNow();
    hit = render(paper, s, { width: paper.clientWidth - 28, scale: innerWidth < 700 ? 0.78 : 1,
      selection: ui.sel >= 0 && !ui.range ? { part: ui.part, voice: ui.voice, event: ui.sel, note: ui.selNote } : null,
      range: ui.range && r ? { part: ui.part, voice: ui.voice, from: r.from, to: r.to } : null,
      cursor: ui.playing ? null : { part: ui.part, voice: ui.voice, tick: caretTick() }, playhead: playTick, transposed: ui.transposed, bars });
    renderPos();
  });
}
function renderPos() {
  const t = caretTick(), b = barAtCaret(), info = barInfo(score(), { bars: b + 1 })[b], beatT = 1920 / (info?.time?.d || 4);
  const e = ui.sel >= 0 ? voice()[ui.sel] : null, raw = t - (info?.start || 0), past = info && raw >= info.ticks, pos = past ? 0 : raw;
  queueMicrotask(announce);
  $("pos").textContent = `${part().name || "Part"}${part().voices.length > 1 ? `, voice ${ui.voice + 1}` : ""} · bar ${(info?.number ?? b + 1) + (past ? 1 : 0)}, beat ${(pos / beatT + 1).toFixed(pos % beatT ? 2 : 0)}` + (e && !e.rest ? ` · ${e.notes.map((n) => noteName(n.midi)).join(" ")}` : "");
}
function noteName(m) { const sp = spell(m, score().key); return sp.step + (sp.alter > 0 ? "#".repeat(sp.alter) : "b".repeat(-sp.alter)) + sp.octave; }

// ---------- entering notes ----------
let lastMidi = 67, chordWindow = 0;
function put(ev) {
  // insert shifts what follows; overwrite replaces that much time, so other parts stay lined up
  const s = score();
  if (ui.mode === "overwrite") {
    const t = caretTick();
    commit(writeAt(s, ui.part, ui.voice, t, [ev], "overwrite"));
    const st = eventStarts(voice()); ui.sel = st.indexOf(t); if (ui.sel < 0) ui.sel = st.findIndex((x) => x > t) - 1; ui.caret = ui.sel + 1;
  } else { commit(insertAt(s, ui.part, ui.caret, ev, ui.voice)); ui.sel = ui.caret; ui.caret++; }
}
function enterNote(midi, { addToChord = false } = {}) {
  ui.range = null;
  if (addToChord && ui.sel >= 0 && !voice()[ui.sel].rest) { commit(setPitch(score(), ui.part, ui.sel, -1, midi, ui.voice)); ui.selNote = voice()[ui.sel].notes.length - 1; }
  else { put(newEvent(curDur(), [midi], ui.triplet ? { tuplet: { n: 3, of: 2 } } : {})); ui.selNote = 0; }
  ui.picked = false; lastMidi = midi; draw(); renderTools();
}
function enterRest() { ui.range = null; put(newEvent(curDur(), [])); ui.picked = false; draw(); renderTools(); }
// a letter name: the key's version of it (F# in G), the nearest one to the last note
function letterNote(letter) {
  const pcs = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }, k = score().key;
  let pc = pcs[letter];
  if (spell(60 + pc, k).step.toLowerCase() !== letter) { if (spell(61 + pc, k).step.toLowerCase() === letter) pc += 1; else if (spell(59 + pc, k).step.toLowerCase() === letter) pc -= 1; }
  let best = 60 + pc, bd = 99;
  for (let o = 1; o <= 8; o++) { const m = o * 12 + pc; if (Math.abs(m - lastMidi) < bd) { bd = Math.abs(m - lastMidi); best = m; } }
  return best;
}
function changeSelected(fn) {
  if (ui.sel < 0) return;
  const next = fn(structuredClone(voice()[ui.sel]));
  if (next) commit(replaceAt(score(), ui.part, ui.sel, next, ui.voice));
  renderTools();
}
function moveSelected(semis) {
  const r = rangeNow(); if (!r) return;
  if (ui.range || voice()[r.from].rest || voice()[r.from].notes.length === 1 || ui.selNote < 0) commit(transposeRange(score(), ui.part, ui.voice, r.from, r.to, semis));
  else changeSelected((e) => { e.notes = e.notes.map((n, i) => (i === ui.selNote ? { ...n, midi: Math.max(12, Math.min(120, n.midi + semis)), spell: null } : n)); return e; });
  const e = voice()[r.to]; if (e && !e.rest && !ui.range) { const n = e.notes[Math.max(0, ui.selNote)] || e.notes[0]; lastMidi = n.midi; preview([n.midi]); }
}
function setDuration(ticks) {
  ui.dur = ticks; db.prefs.dur = ticks; save();
  // a note you picked out changes length; otherwise this is the length of the next note you put in
  if (ui.sel >= 0 && ui.picked && !ui.range) changeSelected((e) => { e.dur = curDur(); return e; });
  renderTools();
}
function preview(midis) { const snd = soundFor(part().instrument); for (const m of midis) noteOn(m, 0.7, 0, 0.5, { sound: snd }); }
function deleteSel(back = false) {
  const r = ui.range ? rangeNow() : null;
  if (r) { commit(deleteRange(score(), ui.part, ui.voice, r.from, r.to, ui.mode)); ui.caret = r.from; ui.sel = r.from - 1; ui.range = null; draw(); renderTools(); return; }
  const i = back ? ui.caret - 1 : ui.sel;
  if (i < 0 || i >= voice().length) return;
  commit(ui.mode === "overwrite" ? deleteRange(score(), ui.part, ui.voice, i, i, "overwrite") : deleteAt(score(), ui.part, i, ui.voice));
  ui.caret = Math.min(i + (ui.mode === "overwrite" ? 1 : 0), voice().length); ui.sel = Math.min(i, voice().length - 1);
  draw(); renderTools();
}
// copy, cut and paste a range (in this browser, between scores too)
let clip = null;
function copySel(cut = false) {
  const r = rangeNow(); if (!r) return;
  clip = copyRange(score(), ui.part, ui.voice, r.from, r.to);
  try { localStorage.setItem("encore.compose.clip", JSON.stringify(clip)); } catch {}
  if (cut) deleteSel();
  toast(`${cut ? "Cut" : "Copied"} ${clip.length} note${clip.length > 1 ? "s" : ""}.`);
}
function pasteSel() {
  if (!clip) try { clip = JSON.parse(localStorage.getItem("encore.compose.clip") || "null"); } catch {}
  if (!clip?.length) return;
  commit(pasteAt(score(), ui.part, ui.voice, ui.caret, clip, ui.mode));
  ui.sel = ui.caret + clip.length - 1; ui.caret += clip.length; ui.range = null; draw(); renderTools();
}

// the keyboard on the score: letters, numbers, arrows (MuseScore-style, so people who know it feel at home)
const DUR_KEYS = { 1: 60, 2: 120, 3: 240, 4: 480, 5: 960, 6: 1920 };
paper.addEventListener("keydown", (e) => {
  if (ui.recording) return; // while recording, the letter keys are the piano
  if (e.key === "/" && !e.ctrlKey) { e.preventDefault(); openPalette(); return; }
  const k = e.key.toLowerCase();
  if (e.ctrlKey || e.metaKey) {
    if (k === "c") { e.preventDefault(); copySel(); } else if (k === "x") { e.preventDefault(); copySel(true); } else if (k === "v") { e.preventDefault(); pasteSel(); }
    else if (k === "a") { e.preventDefault(); if (voice().length) { ui.range = { from: 0, to: voice().length - 1 }; draw(); renderTools(); } }
    return;
  }
  if (/^[a-g]$/.test(k)) { e.preventDefault(); const m = letterNote(k); preview([m]); enterNote(m, { addToChord: e.shiftKey }); return; }
  if (DUR_KEYS[k]) { e.preventDefault(); ui.dots = 0; ui.triplet = false; setDuration(DUR_KEYS[k]); return; }
  if (k === ".") { e.preventDefault(); ui.dots = (ui.dots + 1) % 3; setDuration(ui.dur); return; }
  if (k === "0" || k === "r") { e.preventDefault(); enterRest(); return; }
  if (k === "t") { e.preventDefault(); changeSelected((ev) => { if (ev.rest) return null; const all = ev.notes.every((x) => x.tie); ev.notes = ev.notes.map((n) => ({ ...n, tie: !all })); return ev; }); return; }
  if (k === "s" && e.altKey) { e.preventDefault(); spanOn("slur"); return; }
  if (k === "l") { e.preventDefault(); toggleLoop(); return; }
  if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); moveSelected((e.key === "ArrowUp" ? 1 : -1) * (e.altKey ? 12 : 1)); return; }
  if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
    e.preventDefault();
    const d = e.key === "ArrowLeft" ? -1 : 1;
    if (e.shiftKey) {
      // grow or shrink the run from where it started
      if (voice().length) {
        const anchor = ui.range ? ui.range.from : Math.max(0, ui.sel), cur = ui.range ? ui.range.to : anchor;
        ui.range = { from: anchor, to: Math.max(0, Math.min(voice().length - 1, cur + d)) };
      }
    } else { ui.range = null; ui.caret = Math.max(0, Math.min(voice().length, ui.caret + d)); ui.sel = ui.caret - 1; ui.picked = true; }
    draw(); renderTools(); return;
  }
  if (e.key === "Home") { e.preventDefault(); ui.caret = 0; ui.sel = -1; ui.range = null; draw(); return; }
  if (e.key === "End") { e.preventDefault(); ui.caret = voice().length; ui.sel = ui.caret - 1; ui.range = null; draw(); return; }
  if (e.key === "Delete") { e.preventDefault(); deleteSel(false); return; }
  if (e.key === "Backspace") { e.preventDefault(); deleteSel(!ui.range); return; }
  if (e.key === "Escape") { ui.sel = -1; ui.range = null; draw(); renderTools(); }
});
document.addEventListener("keydown", (e) => {
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openPalette(); return; }
  if ((e.ctrlKey || e.metaKey) && !typing) {
    if (e.key.toLowerCase() === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
    else if (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey)) { e.preventDefault(); redo(); }
    else if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); moveSelected(e.key === "ArrowUp" ? 12 : -12); }
    return;
  }
  if (e.key === " " && !typing) { e.preventDefault(); ui.playing || ui.recording ? stopAll() : play(); }
  // the computer keys as a piano while recording
  if (ui.recording && !typing && !e.repeat && KEYMAP[e.key.toLowerCase()] !== undefined) { e.preventDefault(); playNote("on", 12 * (ui.octave + 1) + KEYMAP[e.key.toLowerCase()]); }
});
document.addEventListener("keyup", (e) => { if (ui.recording && KEYMAP[e.key.toLowerCase()] !== undefined) playNote("off", 12 * (ui.octave + 1) + KEYMAP[e.key.toLowerCase()]); });

// clicking the staff: a note selects it (shift-click: a run); empty staff or a rest puts a note where you clicked
const near = (h, x, y) => x >= h.x - 4 && x <= h.x + h.w + 4 && y >= h.y - 4 && y <= h.y + h.h + 4;
paper.addEventListener("pointerdown", (e) => {
  if (!hit) return;
  paper.focus({ preventScroll: true });
  const r = paper.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  const ev = hit.events.find((h) => h.event >= 0 && near(h, x, y));
  if (ev && (ev.part ?? 0) !== ui.part || ev && (ev.voice ?? 0) !== ui.voice) { ui.part = ev.part ?? 0; ui.voice = ev.voice ?? 0; ui.range = null; }
  const evData = ev ? voice()[ev.event] : null;
  if (ev && evData && !evData.rest) {
    if (e.shiftKey && ui.sel >= 0) ui.range = { from: ui.range ? ui.range.from : ui.sel, to: ev.event };
    else { ui.range = null; ui.sel = ev.event; ui.caret = ev.event + 1; ui.picked = true; }
    ui.selNote = ev.notes?.length ? ev.notes.reduce((b, n, i) => (Math.abs(n.y - y) < Math.abs(ev.notes[b].y - y) ? i : b), 0) : 0;
    preview(evData.notes.map((n) => n.midi)); draw(); renderTools(); return;
  }
  const sys = hit.systems.find((s) => y >= s.top - 30 && y <= s.top + s.h + 10) || hit.systems[hit.systems.length - 1];
  if (!sys) return;
  let p = hit.pitchInfo ? hit.pitchInfo(sys.index, y, x) : hit.pitchAt(sys.index, y);
  if (typeof p === "number") p = { part: ui.part, staff: staffOfVoice(ui.voice), midi: p };
  // the staff you clicked becomes where you write (its first voice, unless you're already in one of its voices)
  if (p.part !== undefined && p.part !== ui.part) { ui.part = p.part; ui.voice = Math.max(0, (part().voiceStaff || [0]).indexOf(p.staff ?? 0)); ui.range = null; }
  else if (p.staff !== undefined && staffOfVoice(ui.voice) !== p.staff) { ui.voice = Math.max(0, (part().voiceStaff || [0]).indexOf(p.staff)); ui.range = null; }
  const midi = p.midi;
  if (ev && evData && evData.rest) {
    // a rest you clicked becomes that note, the same length
    commit(replaceAt(score(), ui.part, ev.event, { ...evData, rest: false, notes: [{ midi, tie: false, spell: null }] }, ui.voice));
    ui.sel = ev.event; ui.caret = ev.event + 1; lastMidi = midi; preview([midi]); draw(); renderTools(); return;
  }
  // anywhere else: a note there (in the music, at that point; past the end, at the end)
  const tick = hit.tickAt(sys.index, x), st = eventStarts(voice());
  if (tick < voiceLength(voice())) { const i = st.findIndex((t) => t > tick); ui.caret = i < 0 ? st.length : Math.max(0, i - 1) + 1; } else ui.caret = voice().length;
  preview([midi]); enterNote(midi, { addToChord: e.shiftKey });
});

// ---------- the on-screen piano ----------
const pianoEl = $("piano");
function renderPiano() {
  const lo = 12 * (ui.octave + 1), span = innerWidth < 700 ? 1 : 2, hi = lo + 12 * span + 1;
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
    noteOn(ev.midi, ev.vel, 0, 0, { sound: soundFor(part().instrument) }); lightKey(ev.midi, true);
    if (ui.recording) { if (ui.recording.source !== "mic") ui.recording.open.set(ev.midi, { midi: ev.midi, on: ev.t - ui.recording.t0, vel: ev.vel }); return; }
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
// the score as performed (dynamics, hairpins, slurs, ornaments, swing...) from a tick, through the mixer
const perfOpts = (from) => ({ from, swing: db.prefs.swing || undefined, humanize: db.prefs.humanize ?? 0.3 });
// where a tick first comes in the played timeline (seconds)
function secondsAt(tl, tick) { const seg = tl.segments.find((g) => tick >= g.start && tick < g.start + g.ticks); return seg ? seg.time + ((tick - seg.start) / seg.ticks) * seg.dur : 0; }
function play() {
  stopAll();
  const s = score(), a = audio(), loop = ui.loop && rangeNow();
  const from = loop ? eventStarts(voice())[loop.from] : ui.caret >= voice().length && !ui.range ? 0 : caretTick();
  const t0 = a.currentTime + 0.12;
  let loopSec = null;
  if (loop) {
    // the loop runs from the start of the run to the end of its last note, in performed seconds
    const evs = perform(s, perfOpts(from)), mine = evs.filter((e) => e.part === ui.part && e.voice === ui.voice && e.ref >= loop.from && e.ref <= loop.to);
    const end = mine.length ? Math.max(...mine.map((e) => e.time + e.dur)) : 1;
    loopSec = { start: 0, end };
  }
  const r = playScore(s, { ...perfOpts(from), t0, loop: loopSec });
  const end = loopSec ? Infinity : performanceLength(r.events);
  const tl = timeline(s), startSec = secondsAt(tl, from);
  // the click lines up with the bar the playing starts in
  const b = barInfo(s, { bars: 0 }).filter((x) => x.start <= from).pop() || { start: 0, time: s.time, tempo: s.tempo };
  const beat = (60 / (b.tempo || s.tempo)) * (4 / b.time.d), beatTicks = 1920 / b.time.d, into = (from - b.start) % beatTicks;
  const met = db.prefs.click && !loopSec ? metronome(t0 + (into ? ((beatTicks - into) / TPQ) * (60 / (b.tempo || s.tempo)) : 0), beat, b.time.n, {}) : null;
  ui.playing = { t0, from, met, end, player: r.player };
  $("playBtn").innerHTML = "&#9632;"; $("playBtn").classList.add("on");
  const step = () => {
    if (!ui.playing) return;
    const t = r.player.timeAt ? r.player.timeAt(audio().currentTime) : audio().currentTime - t0;
    if (t > end + 0.3) { stopAll(); return; }
    // the playhead follows repeats, jumps and the loop through the timeline
    playTick = t <= 0 ? from : (tl.at(startSec + t)?.tick ?? from); draw();
    ui.playing.raf = setTimeout(step, 50);
  };
  step();
}
function toggleLoop() {
  if (!ui.loop && !ui.range) { toast("Select a run first (click a note, shift-click another), then loop it."); return; }
  ui.loop = !ui.loop; $("loopBtn")?.classList.toggle("on", ui.loop);
  if (ui.loop) play(); else stopAll();
}
// the whole mix, or one file per instrument, as audio
async function exportAudio(stems = false, preset = db.prefs.audioFormat || "wav") {
  const s = score(), name = (s.title || "score").replace(/[\\/:*?"<>|]+/g, "");
  toast(stems ? "Rendering each instrument..." : "Rendering the mix...", 8000);
  try {
    const meta = { title: s.title, artist: s.composer };
    const asFile = async (buf, label) => (preset === "wav" ? toWav(buf, 24) : await encodeAudio(buf, preset, { ...meta, title: label }));
    const ext = preset === "wav" ? "wav" : (await import("./convert-core.js")).FORMATS[(await import("./convert-core.js")).PRESETS.find((p) => p.id === preset)?.kind || "mp3"].ext;
    if (!stems) { const buf = await renderAudio(s, perfOpts(0)); download(await asFile(buf, s.title), `${name}.${ext}`); toast("Your mix is downloading."); return; }
    const list = await renderStems(s, perfOpts(0)), entries = [];
    for (const st of list) entries.push({ name: `${name} stems/${String(st.part + 1).padStart(2, "0")} ${st.name.replace(/[\\/:*?"<>|]+/g, "")}.${ext}`, blob: await asFile(st.buffer, st.name) });
    const { zip } = await import("./zip.js");
    download(await zip(entries), `${name} stems.zip`); toast(`${entries.length} stems are downloading.`);
  } catch (err) { toast(`Couldn't render it: ${err.message || err}`, 4000); }
}
function stopAll() {
  if (ui.playing) { ui.playing.met?.stop(); ui.playing.player?.stop?.(); clearTimeout(ui.playing.raf); ui.playing = null; }
  if (ui.backing) { ui.backing.stop?.(); ui.backing = null; }
  allOff(); playTick = null;
  $("playBtn").innerHTML = "&#9654;"; $("playBtn").classList.remove("on");
  if (ui.recording) finishRecording();
  draw();
}
$("playBtn").onclick = () => (ui.playing || ui.recording ? stopAll() : play());
async function record() {
  if (ui.recording) { stopAll(); return; }
  stopAll();
  const source = db.prefs.recSource || "keys";
  if (source === "mic") { try { await startMic(); } catch { toast("The mic wasn't allowed. Allow it in the address bar, or record from the keys."); return; } }
  else await startMidi();
  const s = score(), a = audio(), beat = (60 / s.tempo) * (4 / s.time.d), bar = beat * s.time.n, count = db.prefs.countIn ?? 1;
  const t0 = a.currentTime + 0.25 + bar * count; // the first downbeat, after the count-in
  const overlay = document.createElement("div"); overlay.className = "count"; paper.appendChild(overlay);
  const met = metronome(t0 - bar * count, beat, s.time.n, { on: true, onBeat: (i) => { const left = count * s.time.n - i; overlay.textContent = left > 0 ? String((i % s.time.n) + 1) : ""; if (left <= 0) overlay.remove(); } });
  // hear the rest of the score from the caret while you play (the part you're recording stays quiet)
  if (db.prefs.hearScore !== false) { const others = s.parts.map((_, i) => i).filter((i) => i !== ui.part); if (others.length) { const parts = s.parts.map((p) => ({ instrument: p.instrument, volume: p.volume ?? 0.8, pan: p.pan })); ui.backing = playEvents(perform(s, { ...perfOpts(caretTick()), parts: others }), { t0, parts }); } }
  ui.recording = { t0, met, notes: [], open: new Map(), at: ui.caret, atTick: caretTick(), overlay, source };
  $("recBtn").classList.add("on"); $("recBtn").innerHTML = "&#9632; Stop";
  renderTools();
  toast(source === "mic" ? "Recording from the mic: sing or play one note at a time (headphones keep the click out)." : midiStatus().devices.length ? `Recording from ${midiStatus().devices[0]}. Count in, then play.` : "Recording. No MIDI keyboard found: play the piano below or your computer keys (A W S E D...).", 3500);
}
async function finishRecording() {
  const r = ui.recording; ui.recording = null;
  r.met.stop(); r.overlay.remove(); allOff();
  const end = audio().currentTime - r.t0;
  if (r.source === "mic") { const heard = await stopMic(); for (const n of heard) r.notes.push({ ...n, on: n.on - r.t0, off: n.off - r.t0 }); }
  for (const n of r.open.values()) { n.off = end; r.notes.push(n); }
  $("recBtn").classList.remove("on"); $("recBtn").innerHTML = "&#9679; Record";
  const notes = r.notes.filter((n) => n.off > -0.2).sort((a, b) => a.on - b.on);
  if (!notes.length) { toast("Nothing was heard."); renderTools(); return; }
  const s = score(), q = quantize(notes, { tempo: s.tempo, time: s.time, grid: db.prefs.grid || 120, triplets: db.prefs.triplets === false ? false : "auto", chords: r.source !== "mic" && !!db.prefs.recChords });
  // overwrite keeps the other parts lined up; insert pushes this part's later music along
  commit(ui.mode === "overwrite" ? writeAt(s, ui.part, ui.voice, r.atTick, q.events, "overwrite") : q.events.reduce((sc, ev, i) => insertAt(sc, ui.part, r.at + i, ev, ui.voice), s));
  ui.caret = r.at + q.events.length; ui.sel = ui.caret - 1; ui.range = null;
  draw(); renderTools();
  toast(`Wrote ${q.events.filter((e) => !e.rest).length} notes. Undo with Ctrl+Z for another take.`, 3500);
}
$("recBtn").onclick = record;
$("loopBtn").onclick = () => toggleLoop();
$("clickBtn").onclick = () => { db.prefs.click = !db.prefs.click; save(); $("clickBtn").classList.toggle("on", !!db.prefs.click); };
$("tempo").onchange = (e) => { const v = Math.max(20, Math.min(320, +e.target.value || 100)); commit({ ...score(), tempo: v }); };
$("undoBtn").onclick = undo; $("redoBtn").onclick = redo;
$("transUp").onclick = () => { const r = ui.range ? rangeNow() : null; commit(r ? transposeRange(score(), ui.part, ui.voice, r.from, r.to, 1) : transposeScore(score(), 1)); };
$("transDown").onclick = () => { const r = ui.range ? rangeNow() : null; commit(r ? transposeRange(score(), ui.part, ui.voice, r.from, r.to, -1) : transposeScore(score(), -1)); };
$("written").onchange = (e) => { ui.transposed = e.target.checked; draw(); };

// spans (slur, hairpin, octave, pedal) over the run
function spanOn(type) {
  const r = rangeNow(); if (!r) { toast("Select notes first: click one, then shift-click another."); return; }
  const v = voice(), to = r.to === r.from && type === "slur" ? r.from + 1 : r.to;
  if (!v[r.from] || !v[to]) { toast("A slur needs at least two notes."); return; }
  commit(addSpan(score(), { type, part: ui.part, voice: ui.voice, from: v[r.from].id, to: v[to].id }));
  renderTools();
}

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
const NAVS = ["Segno", "Coda", "To Coda", "Fine", "D.C.", "D.C. al Fine", "D.C. al Coda", "D.S.", "D.S. al Fine", "D.S. al Coda"];
const TIMES = ["4/4", "3/4", "2/4", "2/2", "6/8", "9/8", "12/8", "5/4", "5/8", "7/8", "3/8"];
function renderTools() {
  for (const b of $("ttabs").children) b.classList.toggle("on", b.dataset.t === ui.tab);
  const s = score(), e = ui.sel >= 0 && !ui.range ? voice()[ui.sel] : null, r = rangeNow();
  $("tempo").value = s.tempo;
  $("clickBtn").classList.toggle("on", !!db.prefs.click);
  $("undoBtn").disabled = !undoStack.length; $("redoBtn").disabled = !redoStack.length;
  $("writtenWrap").classList.toggle("hidden", !s.parts.some((p) => p.transpose));
  for (const b of $("modeSeg").children) b.classList.toggle("on", b.dataset.v === ui.mode);
  const p = part(), staffVoices = p.voices.map((_, v) => v).filter((v) => staffOfVoice(v) === staffOfVoice(ui.voice));
  if (ui.tab === "write") {
    tbody.innerHTML = `<div class="lbl"><span>Writing in</span><span class="dim">click a staff to switch</span></div>
      <div class="row"><select class="t" id="partSel" style="flex:1 1 auto">${s.parts.map((x, i) => `<option value="${i}" ${i === ui.part ? "selected" : ""}>${esc(x.name || x.instrument)}</option>`).join("")}</select>
        <span class="seg" id="voiceSeg">${staffVoices.map((v, i) => `<button data-v="${v}" class="${v === ui.voice ? "on" : ""}" title="Voice ${i + 1}${p.staves === 2 ? (staffOfVoice(v) ? " (lower staff)" : " (upper staff)") : ""}">${p.staves === 2 && staffOfVoice(v) ? "L" : "V"}${i + 1}</button>`).join("")}${staffVoices.length < 2 && p.voices.length < 4 ? `<button data-add="1" title="A second voice on this staff">+V</button>` : ""}</span></div>
      <div class="lbl"><span>Note length</span><span class="dim">keys 1 to 6</span></div>
      <div class="grid" id="durs">${PALETTE.map(([t, type, k]) => `<button class="pal${ui.dur === t && !ui.triplet ? " on" : ""}" data-d="${t}" title="${type}">${NOTE_ICON(type)}<kbd>${k}</kbd></button>`).join("")}</div>
      <div class="grid" style="margin-top:5px">
        <button class="pal${ui.dots === 1 ? " on" : ""}" id="dotBtn" title="Dotted (.)">&#9679;<kbd>.</kbd></button>
        <button class="pal${ui.triplet ? " on" : ""}" id="tripBtn" title="Triplet: three in the time of two">3</button>
        <button class="pal" id="restBtn" title="Put a rest in (0 or R)">Rest<kbd>0</kbd></button>
        <button class="pal" id="tieBtn" title="Tie to the next note (T)" ${e && !e.rest ? "" : "disabled"}>Tie<kbd>T</kbd></button>
        <button class="pal" id="sharpBtn" title="Up a half step (Up arrow)" ${r ? "" : "disabled"}>&#9839;</button>
        <button class="pal" id="flatBtn" title="Down a half step (Down arrow)" ${r ? "" : "disabled"}>&#9837;</button>
        <button class="pal" id="delBtn" title="Delete (Delete)" ${r ? "" : "disabled"}>&#10005;</button>
      </div>
      <div class="lbl"><span>${ui.range ? `${r.to - r.from + 1} notes selected` : "Marks over notes"}</span><span class="dim">shift-click to select a run</span></div>
      <div class="row" id="spans"><button class="btn sm" data-span="slur">Slur</button><button class="btn sm" data-span="cresc">Cresc. &lt;</button><button class="btn sm" data-span="dim">Dim. &gt;</button><button class="btn sm" data-span="8va">8va</button><button class="btn sm" data-span="pedal">Pedal</button>
        ${ui.range ? `<button class="btn sm" id="copyBtn">Copy</button>` : ""}<button class="btn sm" id="pasteBtn">Paste</button>${spansHere().length ? `<button class="btn sm" id="unspan">Remove marks</button>` : ""}</div>
      <div class="lbl"><span>${e ? (e.rest ? "Selected rest" : `Selected: ${e.notes.map((n) => noteName(n.midi)).join(" ")}`) : "Chord and lyric"}</span><span class="dim">${e ? "on the selected note" : "select a note first"}</span></div>
      <div class="form">
        <label>Chord symbol<input class="t" id="chordIn" value="${esc(e?.chord || "")}" placeholder="G7, Am, F/A" ${e ? "" : "disabled"}></label>
        <label>Lyric<input class="t" id="lyricIn" value="${esc((e?.lyric || "") + (e?.lyricHyphen ? "-" : ""))}" placeholder="love, or mer- for a hyphen" ${e ? "" : "disabled"}></label>
        <label>Articulation<select class="t" id="articIn" ${e && !e.rest ? "" : "disabled"}><option value="">None</option>${["staccato", "accent", "tenuto", "fermata"].map((a) => `<option ${e?.artic?.includes(a) ? "selected" : ""}>${a}</option>`).join("")}</select></label>
        <label>Dynamic<select class="t" id="dynIn" ${e ? "" : "disabled"}><option value="">None</option>${["pp", "p", "mp", "mf", "f", "ff"].map((d) => `<option ${e?.dyn === d ? "selected" : ""}>${d}</option>`).join("")}</select></label>
      </div>
      <div class="lbl"><span>How to write</span></div>
      <div class="keys"><b>Click the staff</b> where a note goes (Shift-click a note to select a run), <b>tap the piano</b>, or <b>play a MIDI keyboard</b>. <kbd>A</kbd>-<kbd>G</kbd> notes (Shift adds to the chord), <kbd>1</kbd>-<kbd>6</kbd> lengths, <kbd>.</kbd> dot, <kbd>0</kbd> rest, <kbd>T</kbd> tie, <kbd>&#8593;</kbd><kbd>&#8595;</kbd> half step, <kbd>Ctrl</kbd>+<kbd>&#8593;</kbd> octave, <kbd>Shift</kbd>+<kbd>&#8592;</kbd><kbd>&#8594;</kbd> select, <kbd>Ctrl</kbd>+<kbd>C</kbd>/<kbd>V</kbd> copy and paste, <kbd>Space</kbd> play.</div>`;
    $("partSel").onchange = (ev) => { ui.part = +ev.target.value; ui.voice = 0; ui.range = null; ui.caret = voice().length; ui.sel = ui.caret - 1; draw(); renderTools(); };
    $("voiceSeg").onclick = (ev) => {
      const b = ev.target.closest("button"); if (!b) return;
      if (b.dataset.add) {
        // a second voice on this staff: the next free slot (1 on the top staff, 3 on the lower)
        const sc = structuredClone(score()), x = sc.parts[ui.part], st = staffOfVoice(ui.voice), slot = st ? 3 : 1;
        while (x.voices.length <= slot) x.voices.push([]);
        x.voiceStaff = x.voiceStaff || [0, 0, 1, 1];
        commit(upgrade(sc)); ui.voice = slot;
      } else ui.voice = +b.dataset.v;
      ui.range = null; ui.caret = voice().length; ui.sel = ui.caret - 1; draw(); renderTools();
    };
    $("durs").onclick = (ev) => { const b = ev.target.closest("[data-d]"); if (b) { ui.triplet = false; ui.dots = 0; setDuration(+b.dataset.d); } };
    $("dotBtn").onclick = () => { ui.dots = ui.dots === 1 ? 0 : 1; ui.triplet = false; setDuration(ui.dur); };
    $("tripBtn").onclick = () => { ui.triplet = !ui.triplet; ui.dots = 0; renderTools(); };
    $("restBtn").onclick = () => { enterRest(); paper.focus(); };
    $("tieBtn").onclick = () => { paper.focus(); paper.dispatchEvent(new KeyboardEvent("keydown", { key: "t", bubbles: true })); };
    $("sharpBtn").onclick = () => moveSelected(1);
    $("flatBtn").onclick = () => moveSelected(-1);
    $("delBtn").onclick = () => deleteSel(false);
    $("spans").onclick = (ev) => { const b = ev.target.closest("[data-span]"); if (b) spanOn(b.dataset.span); };
    $("copyBtn") && ($("copyBtn").onclick = () => copySel());
    $("pasteBtn").onclick = () => pasteSel();
    $("unspan") && ($("unspan").onclick = () => { let sc = score(); for (const sp of spansHere()) sc = removeSpan(sc, sp.id); commit(sc); renderTools(); });
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
  } else if (ui.tab === "bar") {
    const b = barAtCaret(), info = barInfo(s, { bars: b + 1 })[b] || {}, m = s.bars?.[b] || {};
    const letters = Object.values(s.bars || {}).map((x) => x.mark).filter(Boolean), nextMark = String.fromCharCode(65 + letters.length);
    tbody.innerHTML = `<div class="lbl"><span>Bar ${info.number ?? b + 1}</span><span class="dim">the bar the caret is in</span></div>
      <div class="row"><button class="btn sm${m.repeatStart ? " on" : ""}" data-bar="repeatStart">|: Repeat from here</button><button class="btn sm${m.repeatEnd ? " on" : ""}" data-bar="repeatEnd">:| Repeat back</button></div>
      <div class="form" style="margin-top:8px">
        <label>Times played<select class="t" id="bTimes" ${m.repeatEnd ? "" : "disabled"}>${[2, 3, 4].map((n) => `<option ${m.repeatEnd === n ? "selected" : ""}>${n}</option>`).join("")}</select></label>
        <label>Ending<select class="t" id="bVolta"><option value="">None</option>${[[1], [2], [1, 2], [3]].map((v) => `<option value="${v.join(",")}" ${String(m.volta || "") === v.join(",") ? "selected" : ""}>${v.join(", ")}.</option>`).join("")}</select></label>
        <label>Barline at the end<select class="t" id="bLine"><option value="">Normal</option>${[["double", "Double"], ["final", "Final"], ["dashed", "Dashed"]].map(([v, n]) => `<option value="${v}" ${m.barline === v ? "selected" : ""}>${n}</option>`).join("")}</select></label>
        <label>Rehearsal mark<span class="row"><input class="t" id="bMark" value="${esc(m.mark || "")}" style="width:56px"><button class="btn sm" id="bMarkAuto" ${m.mark ? "disabled" : ""}>${nextMark}</button></span></label>
        <label class="wide">Jump or sign<select class="t" id="bNav"><option value="">None</option>${NAVS.map((n) => `<option ${[].concat(m.nav || []).includes(n) ? "selected" : ""}>${n}</option>`).join("")}</select></label>
        <label>New key here<select class="t" id="bKey"><option value="">No change</option>${Array.from({ length: 15 }, (_, i) => i - 7).map((k) => `<option value="${k}" ${m.key === k ? "selected" : ""}>${esc(keyName(k, s.mode))}</option>`).join("")}</select></label>
        <label>New time here<select class="t" id="bTime"><option value="">No change</option>${TIMES.map((t) => `<option ${m.time && `${m.time.n}/${m.time.d}` === t ? "selected" : ""}>${t}</option>`).join("")}</select></label>
        <label>New tempo here<input class="t" id="bTempo" type="number" min="20" max="320" value="${m.tempo || ""}" placeholder="same"></label>
        <label>Text<input class="t" id="bText" value="${esc(m.text || "")}" placeholder="rit., a tempo, swing"></label>
      </div>
      <p class="note">Playback follows it all: repeats, 1st and 2nd endings, D.S. al Coda and Fine, tempo changes.</p>`;
    const set = (patch) => commit(setBar(score(), b, patch));
    tbody.querySelectorAll("[data-bar]").forEach((x) => (x.onclick = () => { const k = x.dataset.bar; set({ [k]: m[k] ? null : k === "repeatEnd" ? 2 : true }); renderTools(); }));
    $("bTimes").onchange = (ev) => set({ repeatEnd: +ev.target.value });
    $("bVolta").onchange = (ev) => set({ volta: ev.target.value ? ev.target.value.split(",").map(Number) : null });
    $("bLine").onchange = (ev) => set({ barline: ev.target.value || null });
    $("bMark").onchange = (ev) => { set({ mark: ev.target.value.trim() || null }); renderTools(); };
    $("bMarkAuto").onclick = () => { set({ mark: nextMark }); renderTools(); };
    $("bNav").onchange = (ev) => set({ nav: ev.target.value || null });
    $("bKey").onchange = (ev) => set({ key: ev.target.value === "" ? null : +ev.target.value });
    $("bTime").onchange = (ev) => { if (!ev.target.value) return set({ time: null }); const [n, d] = ev.target.value.split("/").map(Number); set({ time: { n, d } }); };
    $("bTempo").onchange = (ev) => set({ tempo: ev.target.value ? Math.max(20, Math.min(320, +ev.target.value)) : null });
    $("bText").onchange = (ev) => set({ text: ev.target.value.trim() || null });
  } else if (ui.tab === "record") {
    const st = midiStatus(), src = db.prefs.recSource || "keys";
    tbody.innerHTML = `<div class="lbl"><span>Record</span></div>
      <p class="note" style="margin-top:0">Press <b>Record</b>, listen to the count-in, and play. When you stop, ENCORE. writes what you played into <b>${esc(part().name)}</b> at the caret, lined up to the beat. Undo for another take.</p>
      <div class="row"><button class="btn rec${ui.recording ? " on" : ""}" id="recBig">${ui.recording ? "&#9632; Stop" : "&#9679; Record"}</button>
        <span class="seg" id="srcSeg"><button data-v="keys" class="${src === "keys" ? "on" : ""}">Keyboard</button><button data-v="mic" class="${src === "mic" ? "on" : ""}">Mic</button></span></div>
      <p class="note">${src === "mic" ? "Sing, hum or play one note at a time into the mic. Headphones keep the click and the score out of it." : st.state === "unsupported" ? "This browser can't use MIDI keyboards (Chrome and Edge can). The piano below and your computer keys still work." : st.state === "denied" ? "MIDI was blocked. Allow it in the address bar, or use the piano below." : st.devices.length ? `Connected: ${esc(st.devices.join(", "))}.` : `No MIDI keyboard yet: plug one in (<button class="linkish" id="midiBtn">look again</button>), or play the piano below or your computer keys (A W S E D F T G Y H U J K).`}</p>
      <div class="lbl"><span>While recording</span></div>
      <div class="form">
        <label>Count-in<select class="t" id="countIn"><option value="0">None</option><option value="1">1 bar</option><option value="2">2 bars</option></select></label>
        <label>Hear the score<select class="t" id="hearSel"><option value="1">The other parts</option><option value="0">Just the click</option></select></label>
        <label>Writes<select class="t" id="recMode"><option value="insert">Inserts (pushes on)</option><option value="overwrite">Over what's there</option></select></label>
        <label>Click on playback<select class="t" id="clickSel"><option value="1">On</option><option value="0">Off</option></select></label>
      </div>
      <div class="lbl"><span>How it's written</span></div>
      <div class="form">
        <label>Shortest note<select class="t" id="gridSel"><option value="240">8th notes</option><option value="120">16th notes</option><option value="60">32nd notes</option></select></label>
        <label>Triplets and swing<select class="t" id="tripSel"><option value="auto">Find them</option><option value="off">Straight only</option></select></label>
        <label class="wide"><span><input type="checkbox" id="chordsChk" ${db.prefs.recChords ? "checked" : ""}> Keep chords (off: just the top line, for melodies)</span></label>
      </div>
      <p class="note">Tip: slow the tempo down, record, then speed it back up. The notes stay the same.</p>`;
    $("recBig").onclick = record;
    $("srcSeg").onclick = (ev) => { const b = ev.target.closest("button"); if (b) { db.prefs.recSource = b.dataset.v; save(); renderTools(); } };
    $("midiBtn") && ($("midiBtn").onclick = async () => { await startMidi(); renderTools(); });
    $("countIn").value = String(db.prefs.countIn ?? 1); $("countIn").onchange = (ev) => { db.prefs.countIn = +ev.target.value; save(); };
    $("hearSel").value = db.prefs.hearScore === false ? "0" : "1"; $("hearSel").onchange = (ev) => { db.prefs.hearScore = ev.target.value === "1"; save(); };
    $("recMode").value = ui.mode; $("recMode").onchange = (ev) => setMode(ev.target.value);
    $("clickSel").value = db.prefs.click ? "1" : "0"; $("clickSel").onchange = (ev) => { db.prefs.click = ev.target.value === "1"; save(); renderTools(); };
    $("gridSel").value = String(db.prefs.grid || 120); $("gridSel").onchange = (ev) => { db.prefs.grid = +ev.target.value; save(); };
    $("tripSel").value = db.prefs.triplets === false ? "off" : "auto"; $("tripSel").onchange = (ev) => { db.prefs.triplets = ev.target.value === "auto" ? "auto" : false; save(); };
    $("chordsChk").onchange = (ev) => { db.prefs.recChords = ev.target.checked; save(); };
  } else if (ui.tab === "score") {
    tbody.innerHTML = `<div class="form">
        <label class="wide">Title<input class="t" id="fTitle" value="${esc(s.title)}"></label>
        <label>Composer<input class="t" id="fComposer" value="${esc(s.composer)}"></label>
        <label>Lyrics by<input class="t" id="fLyricist" value="${esc(s.lyricist)}"></label>
        <label>Key<select class="t" id="fKey">${Array.from({ length: 15 }, (_, i) => i - 7).map((k) => `<option value="${k}">${esc(keyName(k, s.mode))}</option>`).join("")}</select></label>
        <label>Major or minor<select class="t" id="fMode"><option value="major">Major</option><option value="minor">Minor</option></select></label>
        <label>Time<select class="t" id="fTime">${TIMES.map((t) => `<option>${t}</option>`).join("")}</select></label>
        <label>Pickup<select class="t" id="fPickup"><option value="0">None</option>${[1, 2, 3].map((n) => `<option value="${n * (1920 / s.time.d)}">${n} beat${n > 1 ? "s" : ""}</option>`).join("")}</select></label>
        <label class="wide">Change key<select class="t" id="fMove"><option value="">Keep the notes (re-spell)</option><option value="1">Move the notes too (transpose)</option></select></label>
      </div>
      <div class="lbl"><span>How it plays</span></div>
      <div class="form"><label>Feel<select class="t" id="fSwing"><option value="">Straight</option><option value="0.6">Light swing</option><option value="0.667">Swing</option><option value="0.72">Hard swing</option></select></label>
        <label>Human touch<input type="range" id="fHuman" min="0" max="1" step="0.1" value="${db.prefs.humanize ?? 0.3}"></label></div>
      <div class="lbl"><span>Instruments</span><span class="dim">top to bottom</span></div>
      <div id="parts">${s.parts.map((x, i) => `<div class="partRow${i === ui.part ? " on" : ""}" data-i="${i}">
        <select class="t" data-k="inst" aria-label="Instrument">${INSTRUMENTS.map((n) => `<option ${n.name === x.instrument ? "selected" : ""}>${esc(n.name)}</option>`).join("")}</select>
        <div class="row">
          <button class="ib sm${x.mute ? " on" : ""}" data-k="mute" title="Mute">M</button><button class="ib sm${x.solo ? " on" : ""}" data-k="solo" title="Solo">S</button>
          <input type="range" data-k="vol" min="0" max="1" step="0.05" value="${x.volume ?? 0.8}" aria-label="Volume" title="Volume" style="width:56px">
          <input type="range" data-k="pan" min="-1" max="1" step="0.1" value="${x.pan ?? 0}" aria-label="Pan" title="Pan (left to right)" style="width:44px">
          <select class="t" data-k="clef" aria-label="Clef">${[["treble", "Treble"], ["bass", "Bass"], ["alto", "Alto"], ["tenor", "Tenor"], ["treble8vb", "Treble 8vb"]].map(([v, n]) => `<option value="${v}" ${x.clef === v ? "selected" : ""}>${n}</option>`).join("")}</select>
          <label class="small"><input type="checkbox" data-k="grand" ${x.staves === 2 ? "checked" : ""}> 2 staves</label>
          <button class="ib sm" data-k="up" ${i ? "" : "disabled"} title="Move up">&#9650;</button><button class="ib sm" data-k="down" ${i < s.parts.length - 1 ? "" : "disabled"} title="Move down">&#9660;</button>
          <button class="ib sm" data-k="rm" title="Remove">&#10005;</button>
        </div></div>`).join("")}</div>
      <div class="row" style="margin-top:6px"><select class="t" id="addInst" style="flex:1 1 auto"><option value="">+ Add an instrument</option>${INSTRUMENTS.map((n) => `<option>${esc(n.name)}</option>`).join("")}</select></div>
      <p class="note">${s.parts.some((x) => x.transpose) ? "Some instruments read at a different pitch: tick <b>Written pitch</b> at the top to see their parts as the players read them." : "Moving to a new key with the notes moving too transposes the whole piece."}</p>`;
    const bind = (id, f) => ($(id).onchange = (ev) => f(ev.target.value));
    bind("fTitle", (v) => commit({ ...score(), title: v }));
    bind("fComposer", (v) => commit({ ...score(), composer: v }));
    bind("fLyricist", (v) => commit({ ...score(), lyricist: v }));
    $("fKey").value = String(s.key); $("fMode").value = s.mode; $("fTime").value = `${s.time.n}/${s.time.d}`; $("fPickup").value = String(s.pickup || 0);
    bind("fKey", (v) => commit(changeKey(score(), +v, { transpose: $("fMove").value === "1", mode: score().mode })));
    bind("fMode", (v) => commit({ ...score(), mode: v }));
    bind("fTime", (v) => { const [n, d] = v.split("/").map(Number); commit({ ...score(), time: { n, d } }); renderTools(); });
    bind("fPickup", (v) => commit({ ...score(), pickup: +v }));
    $("fSwing").value = String(db.prefs.swing || ""); $("fSwing").onchange = (ev) => { db.prefs.swing = ev.target.value ? +ev.target.value : 0; save(); };
    $("fHuman").onchange = (ev) => { db.prefs.humanize = +ev.target.value; save(); };
    $("parts").addEventListener("input", (ev) => {
      const k = ev.target.dataset.k; if (k !== "vol" && k !== "pan") return;
      const row = ev.target.closest(".partRow"), sc = structuredClone(score());
      sc.parts[+row.dataset.i][k === "vol" ? "volume" : "pan"] = +ev.target.value; db.scores[db.scores.indexOf(score())] = sc; save();
    });
    $("parts").addEventListener("change", (ev) => {
      const row = ev.target.closest(".partRow"), k = ev.target.dataset.k; if (!row || k === "vol" || k === "pan") return;
      const i = +row.dataset.i, sc = structuredClone(score()), x = sc.parts[i];
      if (k === "inst") {
        const n = INSTRUMENTS.find((y) => y.name === ev.target.value), fresh = partFor(n.name);
        Object.assign(x, { instrument: n.name, name: n.name, transpose: n.transpose, clef: n.clef });
        if ((fresh.staves || 1) !== (x.staves || 1)) Object.assign(x, { staves: fresh.staves, clefs: fresh.clefs, voiceStaff: fresh.voiceStaff, voices: fresh.staves === 2 ? [...x.voices, ...fresh.voices.slice(x.voices.length)] : x.voices.filter((_, v) => (x.voiceStaff || [])[v] !== 1) });
      }
      if (k === "clef") { x.clef = ev.target.value; if (x.clefs) x.clefs[0] = x.clef; }
      if (k === "grand") {
        if (ev.target.checked) { const g = newPart({ name: x.name, instrument: x.instrument, clef: x.clef, staves: 2, clefs: [x.clef, "bass"] }); Object.assign(x, { staves: 2, clefs: g.clefs, voiceStaff: g.voiceStaff, voices: [...x.voices, ...g.voices.slice(x.voices.length)] }); }
        else { if (x.voices.some((v, j) => (x.voiceStaff || [])[j] === 1 && v.some((e) => !e.rest)) && !confirm("The lower staff has notes. Remove it and its notes?")) { renderTools(); return; } x.voices = x.voices.filter((_, j) => (x.voiceStaff || [])[j] !== 1); x.staves = 1; x.clefs = [x.clef]; x.voiceStaff = x.voices.map(() => 0); }
      }
      commit(upgrade(sc)); clamp(); renderTools();
    });
    $("parts").onclick = (ev) => {
      const b = ev.target.closest("button[data-k]"), row = ev.target.closest(".partRow"); if (!row) return;
      const i = +row.dataset.i;
      if (!b) { if (ev.target.closest("select, input, label")) return; ui.part = i; ui.voice = 0; ui.caret = voice().length; draw(); renderTools(); return; }
      const k = b.dataset.k;
      if (k === "mute" || k === "solo") { const sc = structuredClone(score()); sc.parts[i][k] = !sc.parts[i][k]; commit(sc); }
      if (k === "up" || k === "down") { commit(movePart(score(), i, i + (k === "up" ? -1 : 1))); if (ui.part === i) ui.part += k === "up" ? -1 : 1; }
      if (k === "rm") { const x = score().parts[i]; if (x.voices.some((v) => v.some((e) => !e.rest)) && !confirm(`Remove ${x.name} and everything written for it?`)) return; commit(removePart(score(), i)); ui.part = Math.max(0, ui.part - (ui.part >= i ? 1 : 0)); }
      clamp(); renderTools(); draw();
    };
    $("addInst").onchange = (ev) => { const n = ev.target.value; if (!n) return; commit(addPart(score(), partFor(n))); ui.part = score().parts.length - 1; ui.voice = 0; ui.caret = 0; ui.sel = -1; renderTools(); draw(); };
  } else if (ui.tab === "check") {
    renderCheck(s);
  } else {
    const sb = songbookSongs();
    tbody.innerHTML = `<div class="lbl"><span>Download</span></div>
      <div class="row"><button class="btn sm" id="dlXml">MusicXML</button><button class="btn sm" id="dlMid">MIDI</button><button class="btn sm" id="dlPdf">Print or PDF</button></div>
      ${s.parts.length > 1 ? `<div class="row" style="margin-top:6px"><select class="t" id="partPrint" style="flex:1 1 auto">${s.parts.map((x, i) => `<option value="${i}">${esc(x.name)}</option>`).join("")}</select><button class="btn sm" id="printPart">Print this part</button></div>` : ""}
      <p class="note">MusicXML opens in MuseScore, Sibelius, Finale, Dorico and Guitar Pro. MIDI opens in any DAW, including Basement Studio. A part prints the way that player reads it.</p>
      <div class="lbl"><span>Audio</span><span class="dim">played the way it's written</span></div>
      <div class="row"><select class="t" id="audFmt">${[["wav", "WAV 24-bit"], ["mp3-320", "MP3 320"], ["flac", "FLAC"], ["alac", "Apple Lossless"], ["m4a-256", "AAC 256"], ["opus-160", "Opus"], ["ogg-vorbis", "Ogg Vorbis"]].map(([v, n]) => `<option value="${v}" ${(db.prefs.audioFormat || "wav") === v ? "selected" : ""}>${n}</option>`).join("")}</select>
        <button class="btn sm" id="dlMix">The mix</button><button class="btn sm" id="dlStems">Stems (one per instrument)</button></div>
      <p class="note">Ready for <a href="master.html" style="color:inherit">Master</a> or <a href="journey.html" style="color:inherit">Journey</a>, or a DAW like Basement Studio.</p>
      <div class="lbl"><span>From Songbook</span><span class="dim">a lead sheet: chords, sections, the words</span></div>
      ${sb.length ? `<div class="row"><select class="t" id="sbSong" style="flex:1 1 auto">${sb.map((x) => `<option value="${x.id}">${esc(x.title || "Untitled song")}</option>`).join("")}</select><button class="btn sm" id="sbGo">Make the lead sheet</button></div>` : `<p class="note" style="margin-top:0">Songs you write in <a href="songbook.html" style="color:inherit">Songbook</a> show up here.</p>`}
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
    $("printPart") && ($("printPart").onclick = () => printPart(+$("partPrint").value));
    $("audFmt").onchange = (ev) => { db.prefs.audioFormat = ev.target.value; save(); };
    $("dlMix").onclick = () => exportAudio(false);
    $("dlStems").onclick = () => exportAudio(true);
    $("sbGo") && ($("sbGo").onclick = () => {
      const song = sb.find((x) => x.id === $("sbSong").value); if (!song) return;
      const sc = upgrade(fromLeadSheet(leadSheetFrom(song)));
      sc.id = newId("sc"); sc.created = sc.updated = Date.now();
      db.scores.push(sc); save(); openScore(sc.id); toast(`Made a lead sheet from "${song.title || "your song"}". Write the melody over the slashes.`, 3500);
    });
    $("openFile").onclick = () => { $("importFile").accept = ".musicxml,.xml,.mid,.midi,.json"; $("importFile").click(); };
    $("backup").onclick = () => download(new Blob([JSON.stringify({ app: "ENCORE. Compose", version: 2, scores: db.scores }, null, 1)], { type: "application/json" }), `ENCORE Compose backup ${new Date().toISOString().slice(0, 10)}.json`);
    $("dup").onclick = () => { const c = { ...structuredClone(s), id: newId("sc"), title: (s.title || "Untitled") + " (copy)", created: Date.now(), updated: Date.now() }; db.scores.push(c); save(); openScore(c.id); };
    $("delScore").onclick = () => { if (!confirm(`Delete "${s.title || "Untitled"}"? This can't be undone (unless you have a backup).`)) return; db.scores = db.scores.filter((x) => x !== s); if (!db.scores.length) db.scores.push(newScore({ title: "Untitled", bars: 0 })); openScore(db.scores[0].id); };
    $("paperChk").onchange = (ev) => { db.prefs.paper = ev.target.checked; save(); document.body.classList.toggle("light", db.prefs.paper); };
  }
}
function spansHere() {
  const r = rangeNow(); if (!r) return [];
  const ids = new Set(voice().slice(r.from, r.to + 1).map((e) => e.id));
  return (score().spans || []).filter((sp) => sp.part === ui.part && sp.voice === ui.voice && (ids.has(sp.from) || ids.has(sp.to)));
}
// one player's part on its own, at written pitch, then the print dialog
function printPart(i) {
  const box = document.createElement("div");
  box.className = "printPart"; document.body.appendChild(box);
  render(box, score(), { width: 760, scale: 1, parts: [i], transposed: true, bars: 0 });
  document.body.classList.add("printingPart");
  setTimeout(() => { window.print(); document.body.classList.remove("printingPart"); box.remove(); }, 50);
}
function setMode(m) { ui.mode = m; db.prefs.mode = m; save(); renderTools(); }
$("modeSeg").onclick = (e) => { const b = e.target.closest("button"); if (b) setMode(b.dataset.v); };
$("importFile").onchange = async () => {
  const f = $("importFile").files[0]; $("importFile").value = ""; if (!f) return;
  try {
    let sc;
    if (/\.json$/i.test(f.name)) { const d = JSON.parse(await f.text()); for (const x of d.scores || []) if (!db.scores.some((y) => y.id === x.id)) db.scores.push(upgrade(x)); save(); renderLib(); toast(`Imported ${d.scores?.length || 0} scores.`); return; }
    if (/\.midi?$/i.test(f.name)) sc = fromMidi(new Uint8Array(await f.arrayBuffer()), f.name);
    else sc = fromMusicXML(await f.text());
    sc = upgrade(sc); sc.id = newId("sc"); sc.created = sc.updated = Date.now();
    db.scores.push(sc); save(); openScore(sc.id); toast(`Opened ${f.name}.`);
  } catch (err) { toast(`Couldn't open it: ${err.message || err}`, 4000); }
};
// a MIDI file: each track's notes through the recorder's quantizer, so it reads like music, not machine timing
function fromMidi(bytes, name) {
  const m = readMidiFile(bytes), tempo = Math.round(m.tempo || 120), time = m.time || { n: 4, d: 4 }, secPerTick = 60 / tempo / m.division;
  let sc = newScore({ title: name.replace(/\.[^.]+$/, ""), tempo, time, key: m.key ?? 0, bars: 0 });
  const tracks = m.tracks.filter((t) => t.notes.length).slice(0, 16);
  tracks.forEach((t, ti) => {
    const notes = t.notes.map((n) => ({ midi: n.midi, on: n.tick * secPerTick, off: (n.tick + n.dur) * secPerTick, vel: n.vel / 127 }));
    const q = quantize(notes, { tempo, time, grid: 120, triplets: "auto", chords: true });
    const low = notes.reduce((a, n) => a + n.midi, 0) / notes.length < 55;
    const p = newPart({ name: t.name || `Track ${ti + 1}`, instrument: "Piano", clef: low ? "bass" : "treble" });
    p.voices[0] = q.events;
    sc = ti === 0 ? { ...sc, parts: [p], pickup: q.pickup || 0 } : addPart(sc, p);
  });
  return sc;
}
function download(blob, name) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }

// ---------- library ----------
function renderLib() {
  $("lib").innerHTML = [...db.scores].sort((a, b) => (b.updated || 0) - (a.updated || 0)).map((s) => `<button class="scoreRow${s.id === db.openId ? " on" : ""}" data-id="${s.id}">${esc(s.title || "Untitled")}<span class="d">${s.parts.length > 1 ? `${s.parts.length} instruments, ` : ""}${esc(keyName(s.key, s.mode))}, ${s.time.n}/${s.time.d}</span></button>`).join("");
}
$("lib").onclick = (e) => { const b = e.target.closest(".scoreRow"); if (b) { openScore(b.dataset.id); setMobile("score"); } };
$("newScore").onclick = () => openWizard();
$("sayBtn").onclick = () => openPalette();
function openScore(id) { stopAll(); db.openId = id; undoStack.length = 0; redoStack.length = 0; ui.part = 0; ui.voice = 0; ui.range = null; ui.caret = voice().length; ui.sel = ui.caret - 1; save(); renderLib(); renderTools(); draw(); }

// ---------- say it: the command box (Ctrl+K, or / on the score) ----------
// Type a mark the way it's written on paper (pp, cresc., Cmaj7, 3/4, q = 120, rit., pizz., 1. ending, D.S. al Coda)
// or the name of anything the page does. Enter does the first result.
function openPalette(prefill = "") {
  closeModal();
  const m = modal(`<input class="t palIn" id="palIn" placeholder="pp, cresc., Cmaj7, 3/4, q = 120, rit., pizz., or a command" autocomplete="off" spellcheck="false" value="${esc(prefill)}"><div class="palList" id="palList" role="listbox"></div>
    <p class="note">Marks go on the selected note or run, bar things on the caret's bar. <kbd>Enter</kbd> does the top one, <kbd>&#8593;</kbd><kbd>&#8595;</kbd> to choose, <kbd>Esc</kbd> to close.</p>`, "palette");
  const inp = $("palIn"), list = $("palList");
  let items = [], at = 0;
  const show = () => {
    items = searchCommands(inp.value, { hasSelection: ui.sel >= 0, hasRange: !!ui.range }).slice(0, 9);
    if (!items.length && inp.value.trim()) { const p = parseCommand(inp.value); items = [p]; }
    at = Math.min(at, Math.max(0, items.length - 1));
    list.innerHTML = items.map((it, i) => `<div class="palItem${i === at ? " on" : ""}" role="option" data-i="${i}">${it.kind === "error" ? `<span class="dim">${esc(it.message)}</span>` : `${it.typed ? "<b>Put in:</b> " : ""}${esc(it.label)}${it.keys ? `<kbd>${esc(it.keys)}</kbd>` : ""}`}</div>`).join("");
  };
  inp.oninput = () => { at = 0; show(); };
  inp.onkeydown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); at = Math.min(items.length - 1, at + 1); show(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); at = Math.max(0, at - 1); show(); }
    else if (e.key === "Enter") { e.preventDefault(); const it = items[at]; if (it && it.kind !== "error") { closeModal(); runAction(it); } }
    else if (e.key === "Escape") { closeModal(); paper.focus(); }
  };
  list.onclick = (e) => { const r = e.target.closest(".palItem"); if (r) { const it = items[+r.dataset.i]; if (it && it.kind !== "error") { closeModal(); runAction(it); } } };
  show(); inp.focus(); inp.select();
  void m;
}
// carry out an action from the command box (or anywhere else)
function runAction(a) {
  const r = rangeNow();
  if (a.kind === "event") {
    if (!r) { toast("Select a note first (click it), then type the mark."); return; }
    let sc = score();
    for (let i = r.from; i <= r.to; i++) {
      const e = structuredClone(voice()[i]);
      if (e.rest && !("dyn" in a.patch)) continue;
      // an articulation adds to what's there, or comes off if it was already on (checked before changing anything)
      const had = e.artic || [], art = a.patch.artic?.[0];
      Object.assign(e, a.patch);
      if (art) e.artic = had.includes(art) ? had.filter((x) => x !== art) : [...had, art];
      sc = replaceAt(sc, ui.part, i, e, ui.voice);
      if ("dyn" in a.patch) break; // a dynamic goes on the first note of a run
    }
    commit(sc); toast(`${a.label}.`);
  } else if (a.kind === "note") {
    if (!r) { toast("Select a note first (click it), then type it."); return; }
    let sc = score();
    for (let i = r.from; i <= r.to; i++) {
      const e = structuredClone(voice()[i]); if (e.rest) continue;
      // one note of a chord when you picked it out, otherwise every note
      e.notes = e.notes.map((n, j) => (ui.range || e.notes.length === 1 || j === ui.selNote ? { ...n, ...a.patch } : n));
      sc = replaceAt(sc, ui.part, i, e, ui.voice);
    }
    commit(sc); toast(`${a.label}.`);
  } else if (a.kind === "span") spanOn(a.type);
  else if (a.kind === "bar") {
    const b = barAtCaret();
    let patch = a.patch;
    if (patch.clef) { const cur = score().bars?.[b]?.clefs || {}; patch = { clefs: { ...cur, [`${ui.part}:${staffOfVoice(ui.voice)}`]: patch.clef } }; }
    if (patch.nav) { const cur = [].concat(score().bars?.[b]?.nav || []); patch = { nav: cur.includes(patch.nav) ? cur : [...cur, patch.nav] }; }
    commit(setBar(score(), b, patch)); toast(`${a.label} at bar ${b + 1}.`);
  } else if (a.kind === "chord" || a.kind === "lyric") {
    if (ui.sel < 0) { toast("Select a note first (click it), then type it."); return; }
    changeSelected((e) => { if (a.kind === "chord") e.chord = a.chord; else { const v = a.text.trim(); e.lyric = v.replace(/-$/, ""); e.lyricHyphen = v.endsWith("-"); } return e; });
    toast(`${a.label}.`);
  } else if (a.kind === "command") runCommand(a.id, a.arg);
  draw(); renderTools();
  // back to the score, so the next key goes to the music
  if (!$("modalBack") && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName || "")) paper.focus({ preventScroll: true });
}
function runCommand(id, arg) {
  const r = rangeNow();
  const go = {
    play: () => (ui.playing || ui.recording ? stopAll() : play()), record: () => record(), loop: () => toggleLoop(),
    undo, redo, copy: () => copySel(), paste: () => pasteSel(),
    "select-all": () => { if (voice().length) ui.range = { from: 0, to: voice().length - 1 }; },
    "transpose-up": () => $("transUp").click(), "transpose-down": () => $("transDown").click(),
    "transpose-octave-up": () => moveSelected(12), "transpose-octave-down": () => moveSelected(-12),
    "insert-mode": () => setMode("insert"), "over-mode": () => setMode("overwrite"),
    "new-score": () => openWizard(), "add-instrument": () => { ui.tab = "score"; renderTools(); $("addInst")?.focus(); },
    check: () => { ui.tab = "check"; db.prefs.tab = "check"; renderTools(); }, analysis: () => { ui.analysis = !ui.analysis; ui.tab = "check"; renderTools(); draw(); },
    written: () => { ui.transposed = !ui.transposed; $("written").checked = ui.transposed; },
    "export-musicxml": () => download(new Blob([toMusicXML(score())], { type: "application/vnd.recordare.musicxml+xml" }), fileName("musicxml")),
    "export-midi": () => download(new Blob([toMidiFile(score())], { type: "audio/midi" }), fileName("mid")),
    "export-wav": () => exportAudio(false), "export-stems": () => exportAudio(true),
    print: () => window.print(), "print-part": () => { ui.tab = "share"; renderTools(); },
    history: () => openHistory(), paper: () => { db.prefs.paper = !db.prefs.paper; save(); document.body.classList.toggle("light", db.prefs.paper); },
    shortcuts: () => { ui.tab = "write"; renderTools(); $("tbody").querySelector(".keys")?.scrollIntoView({ block: "center" }); },
    grace: () => addGrace(arg !== false),
  }[id];
  if (go) go(); else toast("That one isn't ready yet.");
  void r;
}
const fileName = (ext) => `${(score().title || "score").replace(/[\\/:*?"<>|]+/g, "")}.${ext}`;
// a grace note before the selected note: a step above it, slashed (acciaccatura) unless asked otherwise
function addGrace(slash) {
  if (ui.sel < 0 || voice()[ui.sel].rest) { toast("Select the note the grace note leads into."); return; }
  changeSelected((e) => { const top = Math.max(...e.notes.map((n) => n.midi)); e.graces = [...(e.graces || []), { notes: [{ midi: top + 2 }], slash }]; return e; });
}

// ---------- the score checker: proofreading and harmony ----------
const FIXOPS = { transposeRange, replaceAt };
const SEV = { error: "Must fix", warn: "Worth a look", tip: "Tips" };
function renderCheck(s) {
  const level = db.prefs.checkLevel || "beginner", style = db.prefs.analysis || "roman";
  let found = [];
  try { found = proofread(s, { level }); } catch (err) { found = []; console.error(err); }
  const counts = { error: 0, warn: 0, tip: 0 }; for (const f of found) counts[f.severity]++;
  const shown = found.filter((f) => !db.prefs.hideTips || f.severity !== "tip").slice(0, 200);
  let harm = [];
  try { harm = analyze(s, { style }); } catch {}
  tbody.innerHTML = `<div class="row"><span class="seg" id="lvlSeg"><button data-v="beginner" class="${level === "beginner" ? "on" : ""}">Learning</button><button data-v="pro" class="${level === "pro" ? "on" : ""}">Pro</button></span>
      <label class="small"><input type="checkbox" id="hideTips" ${db.prefs.hideTips ? "checked" : ""}> Hide tips</label></div>
    <p class="note">${found.length ? `<b>${counts.error}</b> to fix, <b>${counts.warn}</b> worth a look, <b>${counts.tip}</b> tips.` : "Nothing to flag. Nice."} Click one to go there.</p>
    <div id="finds">${["error", "warn", "tip"].map((sv) => { const list = shown.filter((f) => f.severity === sv); return list.length ? `<div class="lbl"><span>${SEV[sv]}</span><span class="dim">${list.length}</span></div>` + list.map((f) => `<div class="find ${sv}" data-k="${found.indexOf(f)}"><div><b>Bar ${f.bar}${s.parts.length > 1 ? `, ${esc(s.parts[f.part]?.name || "")}` : ""}:</b> ${esc(f.message)}</div><div class="dim small">${esc(f.why)}</div>${f.fix ? `<button class="btn sm" data-fix="${found.indexOf(f)}">${esc(f.fix.label)}</button>` : ""}</div>`).join("") : ""; }).join("")}</div>
    <div class="lbl"><span>Harmony</span><span class="seg" id="anaSeg"><button data-v="roman" class="${style === "roman" ? "on" : ""}">I IV V</button><button data-v="nashville" class="${style === "nashville" ? "on" : ""}">1 4 5</button></span></div>
    <div class="harm">${harm.length ? harm.slice(0, 120).map((h) => `<span class="hb"><span class="dim small">${h.bar}</span> ${esc(h.chord || "")} <b>${esc(h.label || "")}</b></span>`).join("") : `<p class="dim small">Chord symbols or notes in a few bars show the harmony here.</p>`}</div>`;
  $("lvlSeg").onclick = (e) => { const b = e.target.closest("button"); if (b) { db.prefs.checkLevel = b.dataset.v; save(); renderTools(); } };
  $("anaSeg").onclick = (e) => { const b = e.target.closest("button"); if (b) { db.prefs.analysis = b.dataset.v; save(); renderTools(); } };
  $("hideTips").onchange = (e) => { db.prefs.hideTips = e.target.checked; save(); renderTools(); };
  $("finds").onclick = (e) => {
    const fx = e.target.closest("[data-fix]");
    if (fx) { const f = found[+fx.dataset.fix], op = FIXOPS[f.fix.op]; if (op) { commit(op(score(), ...f.fix.args)); toast(`${f.fix.label}.`); renderTools(); } return; }
    const row = e.target.closest(".find"); if (!row) return;
    const f = found[+row.dataset.k];
    if (f.event != null && f.event >= 0) { ui.part = f.part ?? 0; ui.voice = f.voice ?? 0; ui.sel = f.event; ui.caret = f.event + 1; ui.range = null; ui.picked = true; }
    draw(); renderPos();
    requestAnimationFrame(() => paper.querySelector(".sel, [class*=selected]")?.scrollIntoView({ block: "center", behavior: "smooth" }));
  };
}

// ---------- a modal ----------
function modal(html, cls = "") {
  closeModal();
  const back = document.createElement("div"); back.className = "modalBack"; back.id = "modalBack";
  back.innerHTML = `<div class="modal ${cls}" role="dialog" aria-modal="true">${html}</div>`;
  back.addEventListener("pointerdown", (e) => { if (e.target === back) closeModal(); });
  document.body.appendChild(back);
  return back.firstChild;
}
function closeModal() { const was = !!$("modalBack"); $("modalBack")?.remove(); if (was && document.activeElement === document.body) paper.focus({ preventScroll: true }); }
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && $("modalBack")) closeModal(); });

// ---------- a new score from a template ----------
function openWizard() {
  const m = modal(`<h2>New score</h2>
    <div class="tpls" id="tpls">${TEMPLATES.map((t, i) => `<button class="tpl${i === 0 ? " on" : ""}" data-id="${t.id}"><b>${esc(t.name)}</b><span>${esc(t.blurb)}</span></button>`).join("")}</div>
    <div class="form" style="margin-top:10px">
      <label class="wide">Title<input class="t" id="wTitle" placeholder="Untitled"></label>
      <label class="hidden wide" id="wSoloWrap">Instrument<select class="t" id="wSolo">${INSTRUMENTS.map((n) => `<option ${n.name === "Flute" ? "selected" : ""}>${esc(n.name)}</option>`).join("")}</select></label>
      <label>Key<select class="t" id="wKey">${Array.from({ length: 15 }, (_, i) => i - 7).map((k) => `<option value="${k}" ${k === 0 ? "selected" : ""}>${esc(keyName(k, "major"))}</option>`).join("")}</select></label>
      <label>Time<select class="t" id="wTime">${TIMES.map((t) => `<option>${t}</option>`).join("")}</select></label>
      <label>Tempo<input class="t" id="wTempo" type="number" min="20" max="320" value="100"></label>
      <label>Pickup<select class="t" id="wPick"><option value="0">None</option><option value="1">1 beat</option><option value="2">2 beats</option><option value="3">3 beats</option></select></label>
    </div>
    <div class="row" style="margin-top:12px;justify-content:flex-end"><button class="btn" id="wCancel">Cancel</button><button class="btn go" id="wGo">Make it</button></div>`, "wizard");
  let pick = TEMPLATES[0];
  $("tpls").onclick = (e) => { const b = e.target.closest(".tpl"); if (!b) return; pick = TEMPLATES.find((t) => t.id === b.dataset.id); for (const x of $("tpls").children) x.classList.toggle("on", x === b); $("wSoloWrap").classList.toggle("hidden", !pick.pick); };
  $("wCancel").onclick = closeModal;
  $("wGo").onclick = () => {
    const [n, d] = $("wTime").value.split("/").map(Number), names = pick.pick ? [$("wSolo").value] : pick.parts;
    let s = newScore({ title: $("wTitle").value.trim() || "Untitled", bars: 0, tempo: Math.max(20, Math.min(320, +$("wTempo").value || 100)), key: +$("wKey").value, time: { n, d } });
    s.pickup = (+$("wPick").value) * (1920 / d);
    names.forEach((name, i) => { const p = partFor(name); if (pick.names?.[i]) p.name = pick.names[i]; if (pick.single) { p.staves = 1; p.clefs = [p.clef]; p.voiceStaff = [0, 0]; p.voices = [[]]; } s = i === 0 ? { ...s, parts: [p] } : addPart(s, p); });
    s = upgrade(s); db.scores.push(s); closeModal(); openScore(s.id); toast(`${pick.name}: ready. Click the staff, type note names, or press Record.`, 3000);
  };
  void m; $("wTitle").focus();
}

// ---------- version history: a snapshot every couple of minutes of work, kept in this browser ----------
const HIST = "encore.compose.history";
function loadHist() { try { return JSON.parse(localStorage.getItem(HIST) || "{}"); } catch { return {}; } }
function snapshot(s, force = false) {
  const h = loadHist(), list = h[s.id] || [], last = list[list.length - 1];
  if (!force && last && Date.now() - last.t < 120000) return;
  list.push({ t: Date.now(), score: s }); while (list.length > 25) list.shift();
  h[s.id] = list;
  try { localStorage.setItem(HIST, JSON.stringify(h)); } catch { list.splice(0, Math.ceil(list.length / 2)); try { localStorage.setItem(HIST, JSON.stringify(h)); } catch {} }
}
function openHistory() {
  const list = (loadHist()[score().id] || []).slice().reverse();
  modal(`<h2>Version history</h2><p class="note" style="margin-top:0">A snapshot is kept every couple of minutes while you work (the last 25). Opening one makes it a copy, so nothing is lost.</p>
    <div class="histList">${list.length ? list.map((v, i) => `<div class="histRow"><span>${new Date(v.t).toLocaleString()}</span><span class="dim">${v.score.parts.reduce((a, p) => a + p.voices.reduce((b, x) => b + x.filter((e) => !e.rest).length, 0), 0)} notes</span><button class="btn sm" data-i="${i}">Open a copy</button></div>`).join("") : `<p class="dim">No snapshots yet. They start as you write.</p>`}</div>
    <div class="row" style="justify-content:flex-end;margin-top:10px"><button class="btn" id="hClose">Close</button></div>`, "history");
  $("hClose").onclick = closeModal;
  document.querySelector(".histList").onclick = (e) => {
    const b = e.target.closest("[data-i]"); if (!b) return;
    const v = list[+b.dataset.i], c = { ...structuredClone(v.score), id: newId("sc"), title: `${v.score.title || "Untitled"} (${new Date(v.t).toLocaleTimeString()})`, updated: Date.now() };
    db.scores.push(upgrade(c)); closeModal(); openScore(c.id); toast("Opened the earlier version as a copy.");
  };
}

// ---------- spoken position for screen readers ----------
const TYPE_NAME = { 1920: "whole", 960: "half", 480: "quarter", 240: "eighth", 120: "sixteenth", 60: "thirty-second" };
function announce() {
  const el = $("sr"); if (!el) return;
  const e = ui.sel >= 0 ? voice()[ui.sel] : null;
  const len = e ? (TYPE_NAME[e.dur] || (TYPE_NAME[e.dur / 1.5] ? "dotted " + TYPE_NAME[e.dur / 1.5] : `${e.dur} ticks`)) : "";
  el.textContent = e ? `${e.rest ? `${len} rest` : `${e.notes.map((n) => noteName(n.midi)).join(" ")} ${len}`}${e.chord ? `, chord ${e.chord}` : ""}${e.lyric ? `, lyric ${e.lyric}` : ""}. ${$("pos").textContent}` : $("pos").textContent;
}

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
renderPiano(); renderLib(); renderTools(); draw();
// MIDI keyboards are picked up without asking again once the browser has said yes
navigator.permissions?.query({ name: "midi" }).then((p) => { if (p.state === "granted") startMidi().then(renderTools); }).catch(() => {});
