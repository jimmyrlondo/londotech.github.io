// ENCORE. Ear: the page. A fast loop: hear it, answer (button, key or voice), see why, next.
// The scheduling and explanations live in ear-core.js; sounds come from compose-io.js
// (recorded instruments from sounds/, with a synth underneath while they load).
import {
  MODES, CURRICULUM, DEFAULT_SETTINGS, choicesFor, newStats, cleanStats, poolFor, pickItem, pickSequence, makeQuestion, grade, record, afterQuestion,
  explain, pickedSound, resolution, degreeMidi, cadence, weakest, topConfusions, dayStreak, todayCount, today, levelDown, keyboardSVG, sungAnswer,
  SingCatcher, noteName, INTERVALS, CHORDS, NUMERALS, MAJOR, DEG_LABEL, SOLFEGE, itemKey, START,
} from "./ear-core.js";
import { audio, noteOn, allOff, voiceFor } from "./compose-io.js";

const $ = (id) => document.getElementById(id);
const STORE = "encore-ear-v1";
const st = {
  stats: newStats(), settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), mode: "degrees",
  q: null, answers: [], answered: false, asked: 0, startedAt: 0, last: null, confused: null, inRow: 0,
  session: { n: 0, right: 0 }, nextTimer: 0, mic: null, unlock: null, explain: null,
};
try {
  const saved = JSON.parse(localStorage.getItem(STORE) || "null");
  if (saved) {
    st.stats = cleanStats(saved.stats);
    st.settings = { ...st.settings, ...(saved.settings || {}), dirs: { ...DEFAULT_SETTINGS.dirs, ...(saved.settings?.dirs || {}) }, custom: { ...(saved.settings?.custom || {}) } };
    if (MODES.some((m) => m.id === saved.mode)) st.mode = saved.mode;
  }
} catch {}
const save = () => { try { localStorage.setItem(STORE, JSON.stringify({ stats: st.stats, settings: st.settings, mode: st.mode })); } catch {} };
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ---------- sound ----------
const instOpts = () => (st.settings.instrument === "synth" ? { sound: "piano" } : { instrument: st.settings.instrument });
/** Play [{ t, midis, dur }] from now; returns how long it lasts (seconds) */
function playEv(events, delay = 0.08) {
  const a = audio(), t0 = a.currentTime + delay, o = instOpts();
  for (const e of events) for (const m of e.midis) noteOn(m, e.midis.length > 2 ? 0.55 : 0.75, t0 + e.t, e.dur, o);
  return events.reduce((x, e) => Math.max(x, e.t + e.dur), 0) + delay;
}
let prepared = "";
function prepare() {
  const name = st.settings.instrument;
  if (name === "synth" || prepared === name) { $("loading").textContent = ""; return; }
  prepared = name;
  const v = voiceFor(name);
  if (!v.prepare) return;
  $("loading").textContent = `Loading the ${name.toLowerCase()} sound...`;
  const notes = []; for (let m = 36; m <= 84; m += 2) notes.push({ midi: m, vel: 80 });
  v.prepare(notes).then(() => { if (prepared === name) $("loading").textContent = ""; }).catch(() => { $("loading").textContent = ""; });
}

// ---------- the loop ----------
const multi = () => st.mode === "progressions" || st.mode === "melody";
function newQuestion() {
  clearTimeout(st.nextTimer);
  allOff();
  prepare();
  const pool = poolFor(st.stats, st.mode, st.settings);
  const items = multi() ? pickSequence(st.stats, st.mode, pool, (st.mode === "melody" ? st.settings.melLen : st.settings.progLen) - 1, Math.random, st.settings)
    : [pickItem(st.stats, st.mode, pool, Math.random, { last: st.last, confusedWith: st.confused, settings: st.settings })];
  st.q = makeQuestion(st.mode, items, st.settings, Math.random);
  st.answers = []; st.answered = false; st.confused = null; st.explain = null; st.asked++;
  const len = playEv(st.q.events);
  st.startedAt = performance.now() + len * 1000 * 0.6;
  render();
}
function replay() { if (!st.q) return; allOff(); playEv(st.q.focus); }
function hearKey() { if (!st.q) return; allOff(); const ctx = st.q.context?.length ? st.q.context : st.q.tonic !== undefined ? cadence(st.q.tonic, st.settings.quality) : []; if (ctx.length) playEv(ctx); }
function answer(id) {
  if (!st.q || st.answered) return;
  const choice = choicesFor(st.mode, poolFor(st.stats, st.mode, st.settings), st.settings).find((c) => c.id === String(id));
  if (!choice || choice.off) return;
  st.answers.push(String(id));
  if (st.answers.length >= st.q.answerCount) finish();
  else render();
}
function undoAnswer() { if (st.q && !st.answered && st.answers.length) { st.answers.pop(); render(); } }
function finish() {
  const q = st.q, ms = Math.max(300, performance.now() - st.startedAt), g = grade(q, st.answers);
  st.answered = true;
  q.items.forEach((it, i) => record(st.stats, st.mode, it, g.right[i], ms / q.items.length, st.answers[i], st.settings));
  st.unlock = afterQuestion(st.stats, st.mode, g.allRight, st.settings) || st.unlock;
  if (st.unlock) st.unlockMode = st.mode;
  st.session.n++; if (g.allRight) st.session.right++;
  st.inRow = g.allRight ? st.inRow + 1 : 0;
  st.stats.best = Math.max(st.stats.best, st.inRow);
  st.last = q.items[q.items.length - 1];
  if (!g.allRight && !multi()) st.confused = [q.items[0], st.answers[0]];
  st.explain = explain(q, st.answers, st.settings);
  save();
  // what you hear after answering: the note walking home, or yours then the right one
  allOff();
  let len = 0;
  if (st.mode === "degrees") {
    const tgt = q.target[0], base = tgt - degreeMidi(q.tonic, +q.items[0], st.settings.quality);
    const walk = resolution(q.items[0]).map((d, i) => ({ t: i * 0.3, midis: [base + degreeMidi(q.tonic, d, st.settings.quality)], dur: 0.32 }));
    if (g.allRight) len = playEv(walk);
    else { const yours = pickedSound(q, st.answers[0], st.settings); len = playEv([...yours, ...walk.map((e) => ({ ...e, t: e.t + 1.1 }))]); }
  } else if (!g.allRight && !multi()) {
    const yours = pickedSound(q, st.answers[0], st.settings), yl = yours.reduce((x, e) => Math.max(x, e.t + e.dur), 0);
    len = playEv([...yours, ...q.focus.map((e) => ({ ...e, t: e.t + yl + 0.35 }))]);
  }
  if (g.allRight && st.settings.autoNext) st.nextTimer = setTimeout(newQuestion, Math.max(700, len * 1000 + 450));
  render();
}
function hearYours() {
  if (!st.answered || multi()) return;
  allOff(); playEv(pickedSound(st.q, st.answers[0], st.settings));
}
function next() { if (!st.q || st.answered) newQuestion(); }

// ---------- rendering ----------
function render() {
  const pool = poolFor(st.stats, st.mode, st.settings);
  $("modes").innerHTML = MODES.map((m) => `<button role="tab" data-mode="${m.id}" class="${m.id === st.mode ? "on" : ""}" aria-selected="${m.id === st.mode}">${m.name}</button>`).join("");
  const td = todayCount(st.stats), goal = st.settings.goal;
  $("sToday").textContent = `${td.n} / ${goal}`;
  $("sGoal").style.width = Math.min(100, (td.n / goal) * 100) + "%";
  $("sDays").textContent = String(dayStreak(st.stats, goal));
  $("sRow").textContent = String(st.inRow);
  $("sLevel").textContent = `${pool.length} of ${CURRICULUM[st.mode].length}`;
  $("sLevelLabel").textContent = { degrees: "notes in play", intervals: "intervals in play", chords: "chords in play", progressions: "chords in play", melody: "notes in play" }[st.mode];
  const q = st.q;
  $("startBtn").textContent = !q ? "Start" : st.answered ? "Next" : "Skip";
  $("startBtn").title = !q ? "Start (Enter)" : st.answered ? "Next question (Enter)" : "Skip this one";
  $("replayBtn").disabled = !q; $("keyBtn").disabled = !q || !(st.mode === "degrees" || st.mode === "melody" || st.mode === "progressions");
  $("singBtn").disabled = !["degrees", "intervals", "melody"].includes(st.mode);
  $("singBtn").classList.toggle("on", !!st.mic);
  $("singBtn").textContent = st.mic ? "Stop singing" : "Sing it";
  $("prompt").textContent = q ? q.prompt : "Ready when you are";
  $("sub").textContent = q ? q.sub : `Press Start (or Enter). ${MODES.find((m) => m.id === st.mode).name}: ${{ degrees: "you'll hear the key, then one note. Name its number.", intervals: "two notes. Name the distance.", chords: "one chord. Name its kind.", progressions: "a few chords starting on I. Name the rest.", melody: "a short tune starting on 1. Write the rest." }[st.mode]}`;
  // answer buttons
  const choices = choicesFor(st.mode, pool, st.settings), g = st.answered ? grade(q, st.answers) : null;
  $("answers").className = "answers" + (choices.length === 7 ? " seven" : "");
  $("answers").innerHTML = choices.map((c) => {
    let cls = "";
    if (g && !multi()) { if (c.id === String(q.items[0])) cls = "ok"; else if (c.id === st.answers[0]) cls = "bad"; }
    return `<button class="ans ${cls}" data-id="${esc(c.id)}" ${c.off || (st.answered && !cls) ? "disabled" : ""} aria-label="${esc(c.label + ", " + c.sub)}"><kbd>${esc(c.key)}</kbd><b>${esc(c.label)}</b><small>${esc(c.sub)}</small></button>`;
  }).join("");
  // slots for multi-answer drills
  if (q && multi()) {
    const first = st.mode === "progressions" ? "I" : DEG_LABEL[st.settings.quality][0];
    const label = (id) => (st.mode === "melody" ? DEG_LABEL[st.settings.quality][+id - 1] : id);
    $("slots").innerHTML = `<span class="slot given">${first}</span>` + q.items.map((it, i) => {
      const a = st.answers[i];
      const cls = g ? (g.right[i] ? "ok" : "bad") : i === st.answers.length ? "cur" : "";
      return `<span class="slot ${cls}">${a ? esc(label(a)) : "&nbsp;"}${g && !g.right[i] ? ` <small>(${esc(label(it))})</small>` : ""}</span>`;
    }).join("") + (!st.answered && st.answers.length ? ` <button class="pill" id="backBtn" style="min-height:30px;padding:4px 10px">Back</button>` : "");
  } else $("slots").innerHTML = "";
  // why
  if (st.explain) {
    const ok = g.allRight;
    $("why").innerHTML = `<h4 class="${ok ? "ok" : "bad"}">${esc(st.explain.title)}</h4><p>${esc(st.explain.text)}</p>${st.explain.tip ? `<p>${esc(st.explain.tip)}</p>` : ""}
      <div class="qRow">${!ok && !multi() ? `<button class="pill" id="yoursBtn">Hear yours</button>` : ""}<button class="pill" id="rightBtn">Hear the right one</button>${!ok || !st.settings.autoNext ? `<button class="go2" id="nextBtn">Next</button>` : `<span class="tip" style="margin:0">Next one coming...</span>`}</div>`;
  } else $("why").innerHTML = q ? `<p class="tip" style="margin:0">${multi() ? "Pick them in order. Made a slip? Use Back." : "Take your time. Press R to hear it again."}</p>` : "";
  // keyboard
  if (q && st.answered) {
    const marks = new Map();
    for (const e of q.focus) for (const m of e.midis) marks.set(m, "ctx");
    for (const m of q.target) marks.set(m, "ok");
    if (!g.allRight && !multi()) for (const e of pickedSound(q, st.answers[0], st.settings)) for (const m of e.midis) if (!marks.has(m)) marks.set(m, "bad");
    const all = [...marks.keys()];
    $("kb").innerHTML = keyboardSVG(Math.min(48, ...all), Math.max(83, ...all), marks);
  } else $("kb").innerHTML = keyboardSVG(48, 83);
  renderProgress();
}
function renderProgress() {
  const u = st.unlock;
  $("unlock").innerHTML = u ? `<div class="note unlock">New in play: <b>${esc(itemLabel(st.unlockMode || st.mode, u))}</b>. You were getting the others right, so it's time for one more.</div>` : "";
  $("session").textContent = st.session.n ? `${st.session.right} of ${st.session.n} right (${Math.round((st.session.right / st.session.n) * 100)}%). Best run ever: ${st.stats.best} in a row.` : `No answers yet. Best run ever: ${st.stats.best} in a row.`;
  const w = weakest(st.stats, st.mode, st.settings);
  $("weakTitle").textContent = `Weakest first (${MODES.find((m) => m.id === st.mode).name.toLowerCase()})`;
  $("weak").innerHTML = w.length ? w.map((x) => bar(itemLabel(st.mode, x.item), x.acc, `${Math.round(x.acc * 100)}%`)).join("") : `<li class="empty"><span class="tip" style="margin:0">Answer a few to see your scores.</span></li>`;
  const c = topConfusions(st.stats, st.mode);
  $("confused").innerHTML = c.length ? c.map((x) => `<li><span>${esc(itemLabel(st.mode, x.item))}</span><span class="tip" style="margin:0">heard as ${esc(itemLabel(st.mode, x.picked))}</span><span>${x.n}x</span></li>`).join("") : `<li class="empty"><span class="tip" style="margin:0">Nothing yet.</span></li>`;
  const days = []; const d0 = new Date();
  for (let k = 6; k >= 0; k--) { const d = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() - k), key = today(d), v = st.stats.days[key]?.n || 0; days.push(bar(d.toLocaleDateString(undefined, { weekday: "short" }), Math.min(1, v / st.settings.goal), String(v))); }
  $("week").innerHTML = days.join("");
}
const bar = (label, frac, right) => `<li><span>${esc(label)}</span><span class="bar2"><i style="width:${Math.round((frac ?? 0) * 100)}%;background:${frac >= 0.85 ? "var(--green)" : frac >= 0.6 ? "var(--warn)" : "var(--red)"}"></i></span><span>${esc(right)}</span></li>`;
function itemLabel(mode, item) {
  if (mode === "degrees" || mode === "melody") return `${DEG_LABEL[st.settings.quality][+item - 1]} (${SOLFEGE[st.settings.quality][+item - 1]})`;
  if (mode === "intervals") return INTERVALS.find((i) => i.semi === +item)?.name || item;
  if (mode === "chords") return CHORDS.find((c) => c.id === item)?.name || item;
  return item;
}
function renderSettings() {
  const s = st.settings;
  $("fGoal").value = String(s.goal); $("fInst").value = s.instrument; $("fSpeed").value = String(s.speed); $("fAuto").checked = !!s.autoNext;
  $("setTitle").textContent = MODES.find((m) => m.id === st.mode).name;
  const quality = `<label>Key<select data-set="quality"><option value="major">Major</option><option value="minor">Minor</option></select></label>`;
  const context = `<label>Before each question<select data-set="context"><option value="cadence">The key (I IV V I)</option><option value="chord">Just the home chord</option><option value="none">Nothing</option></select></label>`;
  let html = "";
  if (st.mode === "degrees") html = `<div class="row">${quality}${context}</div><label class="toggle"><input type="checkbox" data-set="wide"> Notes from two octaves</label>`;
  if (st.mode === "melody") html = `<div class="row">${quality}${context}</div><div class="row" style="margin-top:8px"><label>Length<select data-set="melLen"><option value="3">3 notes</option><option value="4">4 notes</option><option value="5">5 notes</option><option value="6">6 notes</option></select></label></div>`;
  if (st.mode === "intervals") html = `<div class="chips"><label><input type="checkbox" data-dir="up"> Rising</label><label><input type="checkbox" data-dir="down"> Falling</label><label><input type="checkbox" data-dir="together"> Together</label></div>`;
  if (st.mode === "chords") html = `<label class="toggle"><input type="checkbox" data-set="arpeggio"> Play the notes one by one first</label><label class="toggle"><input type="checkbox" data-set="inversions"> Inversions (any note in the bass)</label>`;
  if (st.mode === "progressions") html = `<label>Length<select data-set="progLen"><option value="3">3 chords</option><option value="4">4 chords</option><option value="5">5 chords</option></select></label>`;
  $("modeSettings").innerHTML = html;
  for (const el of $("modeSettings").querySelectorAll("[data-set]")) { const k = el.dataset.set; if (el.type === "checkbox") el.checked = !!s[k]; else el.value = String(s[k]); }
  for (const el of $("modeSettings").querySelectorAll("[data-dir]")) el.checked = !!s.dirs[el.dataset.dir];
  const custom = s.custom[st.mode] || [];
  $("chips").innerHTML = CURRICULUM[st.mode].map((it) => `<label><input type="checkbox" data-chip="${esc(it)}" ${custom.includes(it) ? "checked" : ""}> ${esc(itemLabel(st.mode, it))}</label>`).join("");
}
function renderExplore() {
  $("explore").innerHTML = CURRICULUM[st.mode].slice().sort((a, b) => (st.mode === "intervals" ? +a - +b : 0)).map((it) => `<button class="pill" data-ex="${esc(it)}">${esc(itemLabel(st.mode, it))}</button>`).join("");
}
function exploreItem(it) {
  allOff();
  prepare();
  const s = { ...st.settings, context: "cadence", dirs: { up: true, down: false, together: false }, inversions: false, arpeggio: true };
  let q;
  if (st.mode === "progressions") q = makeQuestion("progressions", [it, it === "I" ? "V" : "I"], s, () => 0.5);
  else if (st.mode === "melody") q = makeQuestion("degrees", [it], s, () => 0.5);
  else q = makeQuestion(st.mode, [it], s, () => 0.5);
  playEv(q.events);
  const e = explain(q, q.items, s);
  $("exploreWhy").textContent = e.text;
}

// ---------- singing ----------
let holdMsg = 0; // keep a result message up for a moment before "Hearing..." comes back
async function toggleSing() {
  if (st.mic) { stopSing(); return; }
  try {
    const a = audio();
    const { VoiceTracker } = await import("./voice-core.js");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false } });
    const src = a.createMediaStreamSource(stream), an = a.createAnalyser(); an.fftSize = 4096; src.connect(an);
    const buf = new Float32Array(an.fftSize), tracker = new VoiceTracker({ minHz: 70, maxHz: 1100 }), catcher = new SingCatcher(0.3);
    const timer = setInterval(() => {
      an.getFloatTimeDomainData(buf);
      const fr = tracker.feed(buf, a.sampleRate, a.currentTime);
      if (fr.midi !== null && performance.now() > holdMsg) $("heard").textContent = `Hearing ${noteName(Math.round(fr.midi))}`;
      const m = catcher.feed(fr);
      if (m === null || !st.q || st.answered) return;
      holdMsg = performance.now() + 1800;
      const ans = sungAnswer(st.q, m, st.settings);
      if (ans === null) { $("heard").textContent = `${noteName(Math.round(m))} is between the notes in play. Try again.`; return; }
      const pool = poolFor(st.stats, st.mode, st.settings);
      if (!pool.includes(ans)) { $("heard").textContent = `Heard ${noteName(Math.round(m))} (${itemLabel(st.mode, ans)}), which isn't in play yet.`; return; }
      $("heard").textContent = `Heard ${noteName(Math.round(m))}: ${itemLabel(st.mode, ans)}`;
      answer(ans);
    }, 10);
    st.mic = { stream, src, timer };
    $("heard").textContent = "Listening. Sing and hold the note.";
  } catch { $("heard").textContent = "The microphone wasn't allowed, or there isn't one."; }
  render();
}
function stopSing() {
  if (!st.mic) return;
  clearInterval(st.mic.timer); st.mic.stream.getTracks().forEach((t) => t.stop()); try { st.mic.src.disconnect(); } catch {}
  st.mic = null; $("heard").textContent = ""; render();
}

// ---------- events ----------
$("modes").addEventListener("click", (e) => {
  const b = e.target.closest("[data-mode]"); if (!b || b.dataset.mode === st.mode) return;
  st.mode = b.dataset.mode; st.q = null; st.answered = false; st.explain = null; st.last = null; st.confused = null; st.unlock = null;
  clearTimeout(st.nextTimer); allOff();
  if (st.mic && !["degrees", "intervals", "melody"].includes(st.mode)) stopSing();
  save(); render(); renderSettings(); renderExplore();
});
$("startBtn").addEventListener("click", () => newQuestion());
$("replayBtn").addEventListener("click", replay);
$("keyBtn").addEventListener("click", hearKey);
$("singBtn").addEventListener("click", toggleSing);
$("answers").addEventListener("click", (e) => { const b = e.target.closest("[data-id]"); if (b && !b.disabled) answer(b.dataset.id); });
$("slots").addEventListener("click", (e) => { if (e.target.id === "backBtn") undoAnswer(); });
$("why").addEventListener("click", (e) => {
  if (e.target.id === "yoursBtn") hearYours();
  if (e.target.id === "rightBtn") replay();
  if (e.target.id === "nextBtn") newQuestion();
});
for (const b of document.querySelectorAll(".tabBar button")) b.addEventListener("click", () => {
  for (const x of document.querySelectorAll(".tabBar button")) x.classList.toggle("on", x === b);
  for (const s of document.querySelectorAll(".tabBody > section")) s.classList.toggle("show", s.dataset.tab === b.dataset.tab);
});
$("fGoal").addEventListener("change", () => { st.settings.goal = +$("fGoal").value; save(); render(); });
$("fInst").addEventListener("change", () => { st.settings.instrument = $("fInst").value; save(); prepare(); });
$("fSpeed").addEventListener("change", () => { st.settings.speed = +$("fSpeed").value; save(); });
$("fAuto").addEventListener("change", () => { st.settings.autoNext = $("fAuto").checked; save(); });
$("modeSettings").addEventListener("change", (e) => {
  const el = e.target;
  if (el.dataset.set) { const k = el.dataset.set; st.settings[k] = el.type === "checkbox" ? el.checked : /Len$/.test(k) ? +el.value : el.value; }
  if (el.dataset.dir) {
    st.settings.dirs[el.dataset.dir] = el.checked;
    if (!Object.values(st.settings.dirs).some(Boolean)) { st.settings.dirs.up = true; renderSettings(); }
  }
  if (el.dataset.set === "quality") { st.q = null; st.explain = null; renderSettings(); }
  save(); render();
});
$("chips").addEventListener("change", () => {
  const picked = [...$("chips").querySelectorAll("input:checked")].map((i) => i.dataset.chip);
  if (picked.length >= 2) st.settings.custom[st.mode] = picked; else delete st.settings.custom[st.mode];
  save(); render();
});
$("chipsClear").addEventListener("click", () => { delete st.settings.custom[st.mode]; save(); renderSettings(); render(); });
$("explore").addEventListener("click", (e) => { const b = e.target.closest("[data-ex]"); if (b) exploreItem(b.dataset.ex); });
$("easierBtn").addEventListener("click", () => { levelDown(st.stats, st.mode, st.settings); st.unlock = null; save(); render(); });
$("resetBtn").addEventListener("click", () => {
  if (!confirm("Reset all your Ear progress (scores, levels, streaks)?")) return;
  st.stats = newStats(); st.inRow = 0; st.session = { n: 0, right: 0 }; st.unlock = null; save(); render();
});
document.addEventListener("keydown", (e) => {
  const tag = (e.target.tagName || "").toLowerCase();
  if (tag === "input" || tag === "select" || tag === "textarea" || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (e.key === "Enter") { if (!st.q || st.answered) { e.preventDefault(); newQuestion(); } return; }
  if (k === "r" || e.key === " ") { if (e.key === " " && tag === "button") return; e.preventDefault(); if (st.q) replay(); return; }
  if (k === "k") { hearKey(); return; }
  if (k === "m") { if (!$("singBtn").disabled) toggleSing(); return; }
  if (e.key === "Backspace") { undoAnswer(); return; }
  if (st.q && !st.answered) {
    const c = choicesFor(st.mode, poolFor(st.stats, st.mode, st.settings), st.settings).find((x) => x.key === e.key);
    if (c) { e.preventDefault(); answer(c.id); }
  }
});

render(); renderSettings(); renderExplore();

// for the flow test
window.__ear = () => ({
  mode: st.mode, q: st.q && { items: st.q.items, answerCount: st.q.answerCount, dir: st.q.dir, tonic: st.q.tonic, root: st.q.root }, answers: st.answers, answered: st.answered,
  pool: poolFor(st.stats, st.mode, st.settings), inRow: st.inRow, today: todayCount(st.stats).n, asked: st.asked, title: st.explain?.title || "", unlock: st.unlock,
  seen: Object.values(st.stats.items).reduce((a, s) => a + s.seen, 0), settings: JSON.parse(JSON.stringify(st.settings)), mic: !!st.mic,
});
