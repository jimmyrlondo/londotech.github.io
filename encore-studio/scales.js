// Encore Scales: the page. Pick a root and a scale, see it on any fretted instrument or a piano, hear
// it, learn what gives it its flavour, find the chords it makes and the scale that fits a chord or a
// progression, and practise it with the app listening. The theory is in scales-core.js, the neck
// patterns in scales-neck.js, the teaching and note following in scales-teach.js.
import { noteText, parseNote, pcOf, mod12, above, soundsAs, plainNote } from './chords-core.js';
import { frettable, coursesOf, courseNotes } from './chords-voicing.js';
import { SCALES, SCALE, GROUPS, ROOTS, BRIGHTNESS, FAMILIES, FAMILY_NAME, spellScale, stepText, stepSizes, differsText,
         parentOf, familyModes, rotations, scaleChords, chordsInside, readProgression, scalesForProgression, scalesForChord,
         simplerRoot, easyRoot, intervalDeg } from './scales-core.js';
import { neckNotes, boxPositions, perStringPatterns, isStandardSix, ascending, upAndDown } from './scales-neck.js';
import { GLOSSARY, EAR_SETS, earQuestion, noteFinder, exerciseChecker, timingReport } from './scales-teach.js';
import { estimatePitch, downsample } from './tune-core.js';
import { TUNINGS } from './tunings.js';

const $ = id => document.getElementById(id);
const store = {
  get: (k, d) => { try { const v = localStorage.getItem('encoreScales.' + k); return v === null ? d : v; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem('encoreScales.' + k, v); } catch {} },
};
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ACCENT = '#ff3b00', ACCENT_SOFT = '#ff6c40', PAPER = '#f2efe8', INK = '#0c0a09', BLUE = '#22d3ee', GREEN = '#7bd3a4', RED = '#ef4444';
const nt = n => noteText(n);
const term = (k, text) => `<span class="term" data-term="${k}">${esc(text)}</span>`;

// ---- the scale picker

for (const r of ROOTS) $('root').append(new Option(r, r));
for (const [g, title] of GROUPS) {
  const og = document.createElement('optgroup');
  og.label = title;
  for (const s of SCALES.filter(x => x.group === g)) og.append(new Option(s.name, s.id));
  $('scale').append(og);
}
const params = new URLSearchParams(location.search);
let root = parseNote(params.get('root') || store.get('root', 'C')) || parseNote('C');
let scale = SCALE[params.get('scale') || store.get('scale', 'ionian')] || SCALE.ionian;
if (!ROOTS.includes(nt(root))) root = parseNote('C');
$('root').value = nt(root);
$('scale').value = scale.id;
function setScale(r, s, why = '') {
  root = r; scale = s;
  // a root we don't list (E#, Fb...) is shown by its plain name in the picker but kept as spelled
  if (ROOTS.includes(nt(root))) $('root').value = nt(root);
  $('scale').value = scale.id;
  store.set('root', nt(root)); store.set('scale', scale.id);
  stopPlaying();
  stopPractice();
  render();
  if (why) toast(why);
}
$('root').onchange = () => setScale(parseNote($('root').value), scale);
$('scale').onchange = () => setScale(root, SCALE[$('scale').value]);
const stepScale = d => { const i = SCALES.indexOf(scale); setScale(root, SCALES[(i + d + SCALES.length) % SCALES.length]); };
$('prevScale').onclick = () => stepScale(-1);
$('nextScale').onclick = () => stepScale(1);

// ---- instrument, tuning, capo

const instruments = [];
for (const f of TUNINGS.families) {
  const list = f.instruments.filter(frettable);
  if (!list.length) continue;
  const group = document.createElement('optgroup');
  group.label = f.name;
  for (const i of list) { group.append(new Option(i.name, instruments.length)); instruments.push(i); }
  $('instrument').append(group);
}
for (let c = 0; c <= 12; c++) $('capo').append(new Option(c ? 'Fret ' + c : 'No capo', c));
$('instrument').value = String(Math.max(0, instruments.findIndex(i => i.name === store.get('instrument', 'Guitar (6-string)'))));
$('frets').value = store.get('frets', '15');
$('capo').value = store.get('capo', '0');
$('tone').value = store.get('tone', 'guitar');
$('volume').value = store.get('volume', '70');
$('lefty').value = store.get('lefty', '0');
$('tempo').value = store.get('tempo', '100');
$('drone').checked = store.get('drone', '0') === '1';

let instrument = null, tuning = null, courses = [], capo = 0, frets = 15, lefty = false;
function fillTunings(keep) {
  instrument = instruments[+$('instrument').value];
  const sel = $('tuning');
  sel.innerHTML = '';
  instrument.tunings.forEach((t, i) => { if (t.midi.length >= 2) sel.append(new Option(t.name + ' (' + t.notes.map(n => n.replace(/\d/g, '')).join(' ') + ')', i)); });
  sel.value = String(instrument.tunings[keep] && instrument.tunings[keep].midi.length >= 2 ? keep : sel.options[0].value);
  setupTuning();
}
function setupTuning() {
  tuning = instrument.tunings[+$('tuning').value];
  courses = coursesOf(tuning, instrument.name);
  capo = +$('capo').value;
  frets = +$('frets').value;
  lefty = $('lefty').value === '1';
}
fillTunings(+store.get('tuning', '0'));
$('instrument').onchange = () => { store.set('instrument', instruments[+$('instrument').value].name); fillTunings(0); store.set('tuning', $('tuning').value); render(); };
$('tuning').onchange = () => { store.set('tuning', $('tuning').value); setupTuning(); render(); };
$('capo').onchange = () => { store.set('capo', $('capo').value); setupTuning(); render(); };
$('frets').onchange = () => { store.set('frets', $('frets').value); setupTuning(); render(); };
$('lefty').onchange = () => { store.set('lefty', $('lefty').value); setupTuning(); drawMain(); };
$('tone').onchange = () => store.set('tone', $('tone').value);
$('volume').oninput = () => { store.set('volume', $('volume').value); if (master) master.gain.value = vol(); };
const tempoText = () => { $('tempoV').textContent = $('tempo').value + ' BPM'; };
$('tempo').oninput = () => { store.set('tempo', $('tempo').value); tempoText(); };
tempoText();
$('drone').onchange = () => { store.set('drone', $('drone').checked ? '1' : '0'); if (!$('drone').checked) stopDrone(); };

// ---- sound: plucked strings or a piano-ish tone, built sample by sample (the same synth as Encore Chords)

let ctx = null, master = null;
const vol = () => Math.pow(+$('volume').value / 100, 2) * 0.9;
const SOUNDS = {
  guitar: { h: [1, 0.62, 0.42, 0.3, 0.2, 0.14, 0.09, 0.06], decay: k => 1.1 + k * 0.9, seconds: 3 },
  piano: { h: [1, 0.5, 0.32, 0.2, 0.12, 0.08, 0.05, 0.03], decay: k => 0.8 + k * 1.4, seconds: 3 },
};
const buffers = new Map();
function audio() {
  if (!ctx) {
    ctx = new AudioContext();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    master = ctx.createGain();
    master.gain.value = vol();
    master.connect(comp).connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
/** One note's sound (cached): each overtone dies away faster than the last */
function noteBuffer(kind, midi) {
  const k = kind + midi;
  if (buffers.has(k)) return buffers.get(k);
  const s = SOUNDS[kind], sr = ctx.sampleRate, n = Math.floor(sr * s.seconds), data = new Float32Array(n);
  const hz = 440 * Math.pow(2, (midi - 69) / 12);
  for (let p = 0; p < s.h.length; p++) {
    const w = 2 * Math.PI * hz * (p + 1) / sr;
    if (w >= Math.PI * 0.9) break;
    const decay = Math.exp(-s.decay(p) / sr);
    let amp = s.h[p];
    for (let t = 0; t < n; t++) { data[t] += amp * Math.sin(w * t); amp *= decay; }
  }
  let peak = 0;
  for (let t = 0; t < n; t++) peak = Math.max(peak, Math.abs(data[t]));
  const attack = Math.floor(sr * 0.003), tail = Math.floor(sr * 0.3);
  for (let t = 0; t < n; t++) {
    let g = 1 / (peak || 1);
    if (t < attack) g *= t / attack;
    if (t > n - tail) g *= (n - t) / tail;
    data[t] *= g;
  }
  const b = ctx.createBuffer(1, n, sr);
  b.copyToChannel(data, 0);
  buffers.set(k, b);
  return b;
}
const live = new Set();
function voice(kind, midi, when, gain, dur) {
  const src = ctx.createBufferSource(), g = ctx.createGain();
  src.buffer = noteBuffer(kind, midi);
  g.gain.setValueAtTime(gain, when);
  g.gain.setTargetAtTime(0, when + dur, 0.05);
  src.connect(g).connect(master);
  src.start(when);
  src.stop(when + dur + 0.4);
  live.add(src);
  src.onended = () => live.delete(src);
}
function hearNote(midi, kind = $('tone').value) { audio(); voice(kind, midi, ctx.currentTime + 0.01, 0.45, 1.4); }
function hearChord(midis) {
  audio();
  const each = 0.5 / Math.sqrt(midis.length);
  midis.forEach((m, i) => voice($('tone').value, m, ctx.currentTime + 0.02 + i * 0.03, each, 2.2));
}
// a held drone on the root: a soft reedy tone an octave or two down
let drone = null;
function startDrone(midi, when) {
  stopDrone();
  const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  o1.type = 'sawtooth'; o2.type = 'sine';
  o1.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
  o2.frequency.value = o1.frequency.value * 2;
  f.type = 'lowpass'; f.frequency.value = 900;
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(0.09, when + 0.4);
  o1.connect(f); o2.connect(f); f.connect(g).connect(master);
  o1.start(when); o2.start(when);
  drone = { o1, o2, g };
}
function stopDrone() {
  if (!drone) return;
  const d = drone, now = ctx.currentTime;
  drone = null;
  d.g.gain.cancelScheduledValues(now);
  d.g.gain.setValueAtTime(d.g.gain.value, now);
  d.g.gain.setTargetAtTime(0, now, 0.12);
  d.o1.stop(now + 0.8); d.o2.stop(now + 0.8);
}
// a short click for practising in time (accent on the count-in's first beat)
function click(when, accent) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.value = accent ? 1800 : 1200;
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(accent ? 0.5 : 0.32, when + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
  o.connect(g).connect(master);
  o.start(when); o.stop(when + 0.06);
}

// ---- where on the neck: the whole neck, a box position, or a per-string pattern

let patterns = [], pattern = null;
const isFretted = () => courses.length >= 2;
function findPatterns() {
  const opts = { capo, frets, standard: isStandardSix(courses) };
  const boxes = boxPositions(scale, root, courses, opts).map((p, i) => ({ ...p, key: 'box:' + i }));
  const nps = scale.size >= 5 && scale.size <= 8 ? perStringPatterns(scale, root, courses, opts).map((p, i) => ({ ...p, key: 'nps:' + i })) : [];
  patterns = [...boxes, ...nps];
  const sel = $('position'), keep = store.get('pos', 'all');
  sel.innerHTML = '';
  sel.append(new Option('Whole neck', 'all'));
  if (boxes.length) {
    const g = document.createElement('optgroup'); g.label = opts.standard ? 'Positions (CAGED-style boxes)' : 'Positions (boxes)';
    for (const p of boxes) g.append(new Option(p.name + ', frets ' + (p.lo + capo) + ' to ' + (p.hi + capo) + (p.shape ? ' (' + p.shape + ')' : ''), p.key));
    sel.append(g);
  }
  if (nps.length) {
    const g = document.createElement('optgroup'); g.label = nps[0].name.startsWith('3') ? '3 notes per string' : '2 notes per string';
    for (const p of nps) g.append(new Option(p.name.replace(/ \d+$/, '') + ' from the ' + p.startDeg + ', frets ' + (p.lo + capo) + ' to ' + (p.hi + capo), p.key));
    sel.append(g);
  }
  pattern = patterns.find(p => p.key === keep) || null;
  sel.value = pattern ? pattern.key : 'all';
  sel.disabled = view !== 'neck';
}
$('position').onchange = () => {
  store.set('pos', $('position').value);
  pattern = patterns.find(p => p.key === $('position').value) || null;
  stopPlaying();
  drawMain();
  scrollToPattern();
};

// ---- drawing: the neck and a piano

const NECK = { left: 58, open: 34, row: 30, top: 22, bottom: 28 };
const fretWidth = n => 64 * Math.pow(0.966, n - 1);
function fretX(n) { let x = NECK.left + NECK.open; for (let k = 1; k <= n; k++) x += fretWidth(k); return x; }
const fretMid = n => n === 0 ? NECK.left + NECK.open / 2 - 2 : (fretX(n - 1) + fretX(n)) / 2;
const INLAYS = [3, 5, 7, 9, 15, 17, 19, 21];
let view = store.get('view', 'neck'), labels = store.get('labels', 'deg');
// what's lit up right now: the note playing, and in practice the next note and the ones you got
let nowMidi = null, practiceMarks = null;

const labelFor = n => labels === 'deg' ? n.d : nt(n.note);
function drawNeck() {
  const n = courses.length, H = NECK.top + (n - 1) * NECK.row + NECK.bottom, W = fretX(frets) + 18;
  const svg = $('neck');
  // (left-handed: everything mirrored, so the string names sit on the right)
  svg.dataset.w = W; svg.dataset.h = H;
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  const X = x => lefty ? W - x : x;
  const y = i => NECK.top + (n - 1 - i) * NECK.row;
  const opens = courses.map(c => c.open), lo = Math.min(...opens), hi = Math.max(...opens);
  const x0 = Math.min(X(fretX(0)), X(fretX(frets))), x1 = Math.max(X(fretX(0)), X(fretX(frets)));
  let s = `<rect x="${x0}" y="${NECK.top - 12}" width="${x1 - x0}" height="${(n - 1) * NECK.row + 24}" fill="#1f1a16" rx="3"/>`;
  for (const f of INLAYS) if (f <= frets) s += `<circle cx="${X(fretMid(f))}" cy="${NECK.top + (n - 1) * NECK.row / 2}" r="5" fill="#3a332d"/>`;
  for (const f of [12, 24]) if (f <= frets) {
    const cy = NECK.top + (n - 1) * NECK.row / 2, d = Math.max(NECK.row * 0.9, (n - 1) * NECK.row / 4);
    s += `<circle cx="${X(fretMid(f))}" cy="${cy - d}" r="5" fill="#3a332d"/><circle cx="${X(fretMid(f))}" cy="${cy + d}" r="5" fill="#3a332d"/>`;
  }
  // the box being shown, shaded
  if (pattern) {
    const a = X(fretX(Math.max(0, pattern.lo + capo - 1))), b = X(fretX(pattern.hi + capo));
    s += `<rect x="${Math.min(a, b)}" y="${NECK.top - 12}" width="${Math.abs(b - a)}" height="${(n - 1) * NECK.row + 24}" fill="rgb(255 59 0 / 0.07)"/>`;
  }
  for (let f = 0; f <= frets; f++) {
    s += `<line x1="${X(fretX(f))}" x2="${X(fretX(f))}" y1="${NECK.top - 12}" y2="${NECK.top + (n - 1) * NECK.row + 12}" stroke="${f ? '#6b625a' : PAPER}" stroke-width="${f ? 2 : 5}"/>`;
    if (f) s += `<text x="${X(fretMid(f))}" y="${H - 6}" font-size="11" fill="${pattern && f >= pattern.lo + capo && f <= pattern.hi + capo ? '#bdb4a9' : '#6b625a'}" text-anchor="middle">${f}</text>`;
  }
  if (capo > 0) {
    const a = X(fretX(0) + 3), b = X(fretX(capo) - 13);
    s += `<rect x="${Math.min(a, b)}" y="${NECK.top - 12}" width="${Math.abs(b - a)}" height="${(n - 1) * NECK.row + 24}" fill="rgb(12 10 9 / .55)"/>`;
    s += `<rect x="${X(fretX(capo) - (lefty ? 5 : 15))}" y="${NECK.top - 16}" width="10" height="${(n - 1) * NECK.row + 32}" rx="4" fill="${ACCENT}" opacity=".9"/>`;
  }
  courses.forEach((c, i) => {
    const thick = hi > lo ? 1 + 2.2 * (1 - (c.open - lo) / (hi - lo)) : 1.6;
    const a = X(c.start ? fretX(c.start) : fretX(0)), b = X(fretX(frets));
    const xa = Math.min(a, b), xb = Math.max(a, b);
    if (c.midi.length > 1) {
      s += `<line x1="${xa}" x2="${xb}" y1="${y(i) - 2.5}" y2="${y(i) - 2.5}" stroke="#c9bfb3" stroke-width="${Math.max(1, thick * 0.7)}"/>`;
      s += `<line x1="${xa}" x2="${xb}" y1="${y(i) + 2.5}" y2="${y(i) + 2.5}" stroke="#c9bfb3" stroke-width="${Math.max(1, thick * 0.7)}"/>`;
    } else s += `<line x1="${xa}" x2="${xb}" y1="${y(i)}" y2="${y(i)}" stroke="#c9bfb3" stroke-width="${thick}"/>`;
    if (c.start) s += `<circle cx="${a}" cy="${y(i)}" r="4" fill="#c9bfb3"/>`;
    const openPc = mod12(c.start ? c.open : c.open + capo);
    s += `<text x="${X(NECK.left - 10)}" y="${y(i) + 5}" font-size="13" fill="#bdb4a9" text-anchor="${lefty ? 'start' : 'end'}">${esc(nt(plainNote(openPc)))}</text>`;
  });
  // tap targets: every fret of every string plays its note
  courses.forEach((c, i) => {
    for (let f = 0; f <= frets; f++) {
      if (f > 0 && f < capo) continue;
      if (f > 0 && c.start && f <= c.start) continue;
      const a = X(f === 0 ? NECK.left : f === capo && capo ? fretX(f - 1) : fretX(f - 1)), b = X(f === 0 ? fretX(0) : fretX(f));
      s += `<rect class="hit" data-c="${i}" data-f="${f}" x="${Math.min(a, b)}" y="${y(i) - NECK.row / 2}" width="${Math.abs(b - a)}" height="${NECK.row}"/>`;
    }
  });
  // the scale's notes
  const inPat = pattern ? new Set(pattern.notes.map(x => x.course + ':' + x.fret)) : null;
  const want = practiceMarks ? practiceMarks.next : null;
  for (const x of neckNotes(scale, root, courses, { capo, frets })) {
    const abs = x.fret + capo;
    const cx = X(abs === 0 ? fretMid(0) : x.fret === 0 ? fretX(capo) - 10 : fretMid(abs)), cy = y(x.course);
    const faint = inPat && !inPat.has(x.course + ':' + x.fret);
    const isRoot = x.d === '1', isChar = scale.char.includes(x.d);
    const lit = nowMidi != null && x.midi === nowMidi && !faint;
    const got = practiceMarks && practiceMarks.right.has(x.course + ':' + x.fret + ':' + x.midi);
    if (faint) {
      s += `<g pointer-events="none"><circle cx="${cx}" cy="${cy}" r="8.5" fill="#1f1a16" stroke="${isRoot ? '#8a3a1e' : '#5a524b'}" stroke-width="1.5"/>`
        + `<text x="${cx}" y="${cy + 3.5}" font-size="9" fill="${isRoot ? '#b5603f' : '#7d746a'}" text-anchor="middle">${esc(labelFor(x))}</text></g>`;
      continue;
    }
    const fill = got ? GREEN : isRoot ? ACCENT : PAPER, txt = got || !isRoot ? INK : '#fff';
    s += `<g pointer-events="none">`;
    if (lit) s += `<circle cx="${cx}" cy="${cy}" r="16" fill="none" stroke="#fff" stroke-width="3"/>`;
    if (want && want.midi === x.midi && (want.course == null || (want.course === x.course && want.fret === x.fret)))
      s += `<circle cx="${cx}" cy="${cy}" r="16" fill="none" stroke="${ACCENT_SOFT}" stroke-width="3" stroke-dasharray="4 3"/>`;
    s += `<circle cx="${cx}" cy="${cy}" r="11.5" fill="${fill}" stroke="${isChar && !got ? BLUE : fill}" stroke-width="${isChar && !got ? 3 : 1}"/>`
      + `<text x="${cx}" y="${cy + 4}" font-size="${labelFor(x).length > 2 ? 9.5 : 11.5}" font-weight="700" fill="${txt}" text-anchor="middle">${esc(labelFor(x))}</text></g>`;
  }
  svg.innerHTML = s;
  fitSvg(svg, $('neckBox'), 0.66);
}
/** Shrinks a drawing to fit its box on a wide screen; on a narrow one it keeps a readable size and scrolls */
function fitSvg(svg, box, minScale) {
  const W = +svg.dataset.w, H = +svg.dataset.h, avail = box.clientWidth || W;
  const k = Math.max(minScale, Math.min(1, avail / W));
  svg.style.width = (W * k) + 'px';
  svg.style.height = (H * k) + 'px';
}
function scrollToPattern() {
  const box = $('neckBox'), svg = $('neck');
  if (box.scrollWidth <= box.clientWidth) return;
  const k = svg.clientWidth / +svg.dataset.w;
  let x = 0;
  if (pattern) x = (lefty ? +svg.dataset.w - fretX(pattern.hi + capo) : fretX(Math.max(0, pattern.lo + capo - 1))) * k - 30;
  box.scrollLeft = Math.max(0, x);
}
$('neck').addEventListener('click', e => {
  const t = e.target.closest('[data-c]');
  if (!t) return;
  const m = courseNotes(courses[+t.dataset.c], +t.dataset.f, capo);
  if (m) { hearNote(m[0]); flashNote(m[0]); }
});
let flashTimer = 0;
function flashNote(m) { if (playing) return; nowMidi = m; drawMain(); clearTimeout(flashTimer); flashTimer = setTimeout(() => { nowMidi = null; drawMain(); }, 450); }

const BLACK = [1, 3, 6, 8, 10];
function drawPiano() {
  const svg = $('piano'), lo = 48, hi = 84, ww = 28, wh = 118, bw = 17, bh = 74;
  const notes = spellScale(scale, root), byPc = new Map(notes.map(n => [n.pc, n]));
  const whites = [];
  for (let m = lo; m <= hi; m++) if (!BLACK.includes(mod12(m))) whites.push(m);
  const W = whites.length * ww + 2, H = wh + 2;
  svg.dataset.w = W; svg.dataset.h = H;
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  const want = practiceMarks ? practiceMarks.next : null;
  let s = '';
  const xOf = new Map();
  const mark = (m, x, w, h, black) => {
    const n = byPc.get(mod12(m));
    if (!n) return '';
    const isRoot = n.d === '1', got = practiceMarks && practiceMarks.rightMidi.has(m);
    const cy = h - (black ? 12 : 16), cx = x + w / 2;
    let out = '';
    if (nowMidi === m) out += `<circle cx="${cx}" cy="${cy}" r="${black ? 10 : 12}" fill="none" stroke="${black ? '#fff' : INK}" stroke-width="3"/>`;
    if (want && want.midi === m) out += `<circle cx="${cx}" cy="${cy}" r="${black ? 10 : 12}" fill="none" stroke="${ACCENT}" stroke-width="2.5" stroke-dasharray="4 3"/>`;
    out += `<circle cx="${cx}" cy="${cy}" r="${black ? 7.5 : 9.5}" fill="${got ? GREEN : isRoot ? ACCENT : black ? PAPER : '#2c2723'}" stroke="${scale.char.includes(n.d) ? BLUE : 'none'}" stroke-width="2.5"/>`
      + `<text x="${cx}" y="${cy + 3.5}" font-size="${black ? 8 : 9.5}" font-weight="700" fill="${got || (black && !isRoot) ? INK : '#fff'}" text-anchor="middle">${esc(labelFor(n))}</text>`;
    return `<g pointer-events="none">${out}</g>`;
  };
  whites.forEach((m, i) => {
    const x = 1 + i * ww;
    xOf.set(m, x);
    s += `<rect class="key" data-m="${m}" x="${x}" y="1" width="${ww - 1}" height="${wh}" rx="3" fill="${PAPER}" stroke="${INK}"/>`;
    if (mod12(m) === 0) s += `<text x="${x + ww / 2}" y="14" font-size="9" fill="#91887d" text-anchor="middle" pointer-events="none">C${Math.floor(m / 12) - 1}</text>`;
    s += mark(m, x, ww - 1, wh, false);
  });
  for (let m = lo; m <= hi; m++) {
    if (!BLACK.includes(mod12(m))) continue;
    const left = xOf.get(m - 1);
    if (left === undefined) continue;
    const x = left + ww - bw / 2;
    s += `<rect class="key" data-m="${m}" x="${x}" y="1" width="${bw}" height="${bh}" rx="2" fill="#1b1714" stroke="${INK}"/>`;
    s += mark(m, x, bw, bh, true);
  }
  svg.innerHTML = s;
  fitSvg(svg, $('pianoBox'), 0.8);
}
$('piano').addEventListener('click', e => {
  const k = e.target.closest('.key');
  if (!k) return;
  hearNote(+k.dataset.m, 'piano');
  flashNote(+k.dataset.m);
});

for (const b of $('viewSeg').children) b.onclick = () => { view = b.dataset.v; store.set('view', view); stopPlaying(); stopPractice(); render(); };
for (const b of $('labelSeg').children) b.onclick = () => { labels = b.dataset.v; store.set('labels', labels); drawMain(); };
function drawMain() {
  for (const b of $('viewSeg').children) b.classList.toggle('on', b.dataset.v === view);
  for (const b of $('labelSeg').children) b.classList.toggle('on', b.dataset.v === labels);
  $('neckBox').classList.toggle('hidden', view !== 'neck');
  $('pianoBox').classList.toggle('hidden', view !== 'piano');
  $('position').classList.toggle('hidden', view !== 'neck' || !isFretted());
  $('legendFaint').classList.toggle('hidden', !pattern || view !== 'neck');
  if (view === 'neck') drawNeck(); else drawPiano();
  drawTones();
}
window.addEventListener('resize', () => { if (view === 'neck') fitSvg($('neck'), $('neckBox'), 0.66); else fitSvg($('piano'), $('pianoBox'), 0.8); });

// ---- the scale's notes, as chips

function drawTones() {
  const notes = spellScale(scale, root);
  $('tones').innerHTML = notes.map(x => {
    const odd = soundsAs(x.note), isChar = scale.char.includes(x.d);
    const tip = (isChar ? 'A colour note: it gives ' + scale.name + ' its flavour. ' : '') + (odd ? nt(x.note) + ' is spelled that way because it is the ' + x.d + ' of the scale; it sounds the same as ' + odd + '.' : '');
    const lit = nowMidi != null && mod12(nowMidi) === x.pc;
    return `<button class="tone${x.d === '1' ? ' root' : ''}${isChar ? ' char' : ''}${lit ? ' now' : ''}" data-pc="${x.pc}" ${tip ? `data-tip="${esc(tip)}"` : ''}><b>${esc(nt(x.note))}</b><span>${esc(x.d)}</span></button>`;
  }).join('');
}
$('tones').onclick = e => {
  const b = e.target.closest('.tone');
  if (!b) return;
  const pc = +b.dataset.pc, base = view === 'piano' ? 60 : lowestNote();
  const m = base + mod12(pc - base + (view === 'piano' ? 0 : 0));
  hearNote(m); flashNote(m);
};
const lowestNote = () => Math.min(...courses.map(c => (c.start ? c.open : c.open + capo)));

// ---- playing it up and down

/** The notes to play (and to practise): the chosen pattern, or one octave from the root */
function sequence() {
  if (view === 'neck' && pattern) return upAndDown(scale, root, pattern);
  if (view === 'neck' && isFretted()) {
    const low = lowestNote(), base = low + mod12(pcOf(root) - low);
    const seq = upAndDown(scale, root, null, base);
    // show where to play each note: the lowest string that has it within the first few frets
    for (const x of seq) {
      for (let i = 0; i < courses.length; i++) {
        if (courses[i].start) continue;
        const f = x.midi - courses[i].open - capo;
        if (f >= 0 && f <= 4 + (i === courses.length - 1 ? 8 : 0)) { x.course = i; x.fret = f; break; }
      }
    }
    return seq;
  }
  return upAndDown(scale, root, null, 60);
}
let playing = null;
function playScale() {
  if (playing) { stopPlaying(); return; }
  stopPractice();
  audio();
  const seq = sequence(), beat = 60 / +$('tempo').value, t0 = ctx.currentTime + 0.1, kind = $('tone').value;
  seq.forEach((x, i) => voice(kind, x.midi, t0 + i * beat, 0.45, Math.max(0.25, Math.min(1.6, beat * 1.5))));
  if ($('drone').checked) {
    let d = Math.min(...seq.map(x => x.midi)) - 12;
    while (d > 47) d -= 12;
    while (d < 33) d += 12;
    startDrone(d - mod12(d - pcOf(root)), t0 - 0.05);
  }
  playing = { t0, beat, seq, raf: 0 };
  $('playBtn').textContent = 'Stop';
  $('playBtn').classList.add('running');
  const follow = () => {
    if (!playing) return;
    const i = Math.floor((ctx.currentTime - t0) / beat);
    const m = i >= 0 && i < seq.length ? seq[i].midi : null;
    if (m !== nowMidi) { nowMidi = m; drawMain(); }
    if (i >= seq.length) { stopPlaying(); return; }
    playing.raf = requestAnimationFrame(follow);
  };
  playing.raf = requestAnimationFrame(follow);
}
function stopPlaying() {
  if (!playing) return;
  cancelAnimationFrame(playing.raf);
  playing = null;
  for (const s of live) { try { s.stop(); } catch {} }
  live.clear();
  stopDrone();
  nowMidi = null;
  $('playBtn').innerHTML = 'Play<span class="long"> up and down</span>';
  $('playBtn').classList.remove('running');
  drawMain();
}
$('playBtn').onclick = playScale;

// ---- Learn

function renderLearn() {
  const notes = spellScale(scale, root), name = nt(root) + ' ' + scale.name;
  const steps = stepText(scale), sizes = stepSizes(scale);
  const near = scale.near ? SCALE[scale.near] : null;
  const chars = scale.char.map(d => notes.find(n => n.d === d)).filter(Boolean);
  const par = parentOf(scale, root);
  let h = '';
  if (scale.approx) h += `<div class="approx"><b>${term('approx', '12-tone approximation')}.</b> ${esc(scale.approx)}</div>`;
  h += `<div class="why"><b>Why it sounds like that.</b> ${esc(scale.why)}</div>`;
  h += '<dl class="facts">';
  h += `<dt>${term('formula', 'Formula')}</dt><dd class="mono">${scale.f.map(d => scale.char.includes(d) ? `<b style="color:${BLUE}">${esc(d)}</b>` : esc(d)).join(' ')}</dd>`;
  h += `<dt>${term('steps', 'Steps')}</dt><dd><div class="stepsRow">${steps.map((t, i) => `<span class="${sizes[i] === 1 ? 'H' : sizes[i] >= 3 ? 'big' : ''}">${esc(t)}</span>`).join('')}</div></dd>`;
  h += `<dt>Notes</dt><dd>${notes.map(n => esc(nt(n.note))).join(' ')}${notes.some(n => soundsAs(n.note)) ? ` <span class="sub">(${notes.filter(n => soundsAs(n.note)).map(n => esc(nt(n.note)) + ' sounds as ' + esc(soundsAs(n.note))).join(', ')}; see ${term('enharmonic', 'spelling')})</span>` : ''}</dd>`;
  if (chars.length) h += `<dt>${term('char', 'Colour note' + (chars.length > 1 ? 's' : ''))}</dt><dd>${chars.map(n => `<b>${esc(nt(n.note))}</b> (the ${esc(n.d)})`).join(', ')}. ${esc(charLine(chars))}</dd>`;
  h += `<dt>Mood</dt><dd>${esc(scale.mood)}</dd>`;
  h += `<dt>Where you hear it</dt><dd>${esc(scale.genres)}</dd>`;
  if (scale.aka.length) h += `<dt>Also called</dt><dd>${esc(scale.aka.join(', '))}</dd>`;
  h += '</dl>';
  if (scale.note) h += `<p class="sub">${esc(scale.note)}</p>`;
  if (scale.jazz) h += `<p class="sub">Over a ${esc(nt(root))}7 chord, jazz players name these notes as chord tones and tensions: <span class="mono">${scale.jazz.join(' ')}</span> (${scale.jazz.map(d => esc(nt(above(root, d)))).join(' ')}).</p>`;
  if (near) h += `<h2>How it differs from ${esc(near.name)}</h2><p>${esc(differsText(scale, near))} <button class="small" data-go="${near.id}">Show ${esc(near.short || near.name)}</button></p>`;
  if (par && par.mode !== 1) h += `<h2>Its ${term('parent', 'parent scale')}</h2><p>Mode ${par.mode} of ${esc(nt(par.root))} ${esc(FAMILY_NAME[par.family])}: the same notes as ${esc(nt(par.root))} ${esc(par.scale.name)}, but ${esc(nt(root))} is home. <button class="small" data-tabgo="modes">See all the modes</button></p>`;
  else if (par) h += `<h2>Its modes</h2><p>Start ${esc(name)} on each of its notes and you get ${FAMILIES[par.family].length} ${term('mode', 'modes')}, each with its own sound. <button class="small" data-tabgo="modes">See them</button></p>`;
  $('learn').innerHTML = h;
}
function charLine(chars) {
  const d = chars.map(n => n.d);
  if (scale.id === 'ionian') return 'The leading tone, a half step under the root, pulling home.';
  if (d.length === 1) return 'Lean on it over the home chord to bring out the ' + scale.name.replace(/ \(.*\)$/, '') + ' sound.';
  return 'Lean on these over the home chord to bring out the sound.';
}
$('learn').addEventListener('click', e => {
  const b = e.target.closest('[data-go]');
  if (b) { setScale(root, SCALE[b.dataset.go]); return; }
  const t = e.target.closest('[data-tabgo]');
  if (t) showTab(t.dataset.tabgo);
});

// ---- Chords

let chordSize = +store.get('chordSize', '3');
for (const b of $('chordSeg').children) b.onclick = () => { chordSize = +b.dataset.v; store.set('chordSize', chordSize); renderChords(); };
function chordMidis(notes) {
  const base = view === 'piano' ? 48 : 48;
  let m = base + mod12(pcOf(notes[0]) - base);
  const out = [m];
  for (const n of notes.slice(1)) { m = m + 1 + mod12(pcOf(n) - m - 1); out.push(m); }
  return out;
}
// opens the chord's shapes in Encore: Chords (only chords with a common name)
const shapesLink = x => x.type ? `<a class="small shapesLink" href="chords.html?chord=${encodeURIComponent(x.symbol)}" title="See how to play ${esc(x.symbol)}">Shapes</a>` : '';

function renderChords() {
  for (const b of $('chordSeg').children) b.classList.toggle('on', +b.dataset.v === chordSize);
  let rows = '';
  if (scale.hepta) {
    $('chordSeg').parentElement.classList.remove('hidden');
    $('chordsIntro').innerHTML = `Stack every other note of the scale and you get a chord on each degree: ${term('triad', 'triads')} (3 notes) or ${term('seventh', '7th chords')} (4 notes).`;
    for (const c of scaleChords(scale, root)) {
      const x = chordSize === 3 ? c.triad : c.seventh;
      rows += `<div class="crow${x.type ? '' : ' odd'}"><span class="rn">${esc(x.numeral)}</span><span class="nm"><b>${esc(x.symbol)}</b><small>${x.notes.map(nt).map(esc).join(' ')}${x.type ? ' &middot; ' + esc(x.type.name) : ' &middot; an unusual stack with no common name'}</small></span>`
        + `<button class="small" data-notes="${esc(x.notes.map(nt).join(','))}">Play</button>${shapesLink(x)}</div>`;
    }
  } else {
    $('chordSeg').parentElement.classList.add('hidden');
    const inside = chordsInside(scale, root);
    $('chordsIntro').innerHTML = scale.size < 7
      ? 'A ' + scale.size + '-note scale doesn\'t stack into a chord on every degree, so here are the common chords whose notes all sit inside it.'
      : 'This scale has ' + scale.size + ' notes, so stacking every other note doesn\'t make the usual chords. Here are the common chords whose notes all sit inside it.';
    if (!inside.length) rows = '<p class="sub">No common chord fits entirely inside this scale.</p>';
    for (const x of inside.slice(0, 40)) rows += `<div class="crow"><span class="rn">${esc(x.numeral)}</span><span class="nm"><b>${esc(x.symbol)}</b><small>${x.notes.map(nt).map(esc).join(' ')} &middot; ${esc(x.type.name)}</small></span><button class="small" data-notes="${esc(x.notes.map(nt).join(','))}">Play</button>${shapesLink(x)}</div>`;
  }
  $('chordRows').innerHTML = rows;
}
$('chordRows').onclick = e => {
  const b = e.target.closest('[data-notes]');
  if (b) hearChord(chordMidis(b.dataset.notes.split(',').map(parseNote)));
};

// ---- Which scale fits?

const EXAMPLES = ['Am7 D7 G', 'Dm7 G7 Cmaj7', 'Bm7b5 E7 Am', 'C Am F G', 'A7 D7 E7', 'Em D C D', 'G7alt', 'Cmaj7#11', 'D7', 'Cm(maj7)'];
$('fitExamples').innerHTML = EXAMPLES.map(x => `<button class="small" data-ex="${esc(x)}">${esc(x)}</button>`).join('');
$('fitExamples').onclick = e => { const b = e.target.closest('[data-ex]'); if (b) { $('fitText').value = b.dataset.ex; runFit(); } };
$('fitText').value = store.get('fit', 'Am7 D7 G');
$('fitBtn').onclick = runFit;
$('fitText').onkeydown = e => { if (e.key === 'Enter') runFit(); };
let fitResults = [];
function runFit() {
  const text = $('fitText').value;
  store.set('fit', text);
  const { chords, bad } = readProgression(text);
  fitResults = [];
  let h = '';
  if (bad.length) h += `<p class="err">Couldn't read ${bad.map(b => '"' + esc(b) + '"').join(', ')}. Try names like Am7, D7, Gmaj7, F#m7b5, Bb, G7alt.</p>`;
  if (!chords.length) { $('fitOut').innerHTML = h || '<p class="sub">Type a chord above.</p>'; return; }
  const row = (r, best, extra = '') => {
    const i = fitResults.push(r) - 1;
    return `<div class="srow${best ? ' best' : ''}"><span class="t">${esc(nt(r.root))} ${esc(r.scale.name)}${extra}</span>`
      + `<span class="acts"><button class="small" data-hear="${i}">Hear</button><button class="small" data-show="${i}">Show</button></span>`
      + `<ul>${r.reasons.map(x => '<li>' + esc(x) + '</li>').join('')}</ul></div>`;
  };
  if (chords.length === 1) {
    const c = chords[0], list = scalesForChord(c, { limit: 6 });
    h += `<h2>Scales over ${esc(c.symbol)}</h2><p class="sub">Each is built on ${esc(nt(c.root))}, the chord's root. The first is the everyday choice; the others add other colours.</p><div class="rows">`;
    list.forEach((r, k) => { h += row(r, k === 0); });
    h += '</div>';
  } else {
    const res = scalesForProgression(chords, { limit: 5 });
    h += `<h2>One scale for the whole progression</h2>`;
    if (res.blues) h += `<p class="sub">This is a blues: dominant 7th chords on I and IV. No single 7-note scale holds them all, and that's fine: the blues lives in the clash.</p>`;
    h += '<div class="rows">';
    res.overall.forEach((r, k) => { h += row(r, k === 0, r.missing.length ? ' <small>misses ' + r.missing.map(nt).join(', ') + '</small>' : ''); });
    h += '</div>';
    h += `<h2>Chord by chord</h2><p class="sub">${res.blues ? 'Or follow the chords: each one\'s own Mixolydian.' : 'Heard in that light, the scale for each chord (the same notes, a new home each time when they all fit one key).'}</p><div class="perChord">`;
    chords.forEach((c, i) => {
      const best = res.perChord[i][0];
      if (!best) { h += `<span class="ch">${esc(c.symbol)}</span><span class="sub">No scale in the library holds all of its notes.</span>`; return; }
      const k = fitResults.push(best) - 1;
      const second = res.perChord[i][1];
      h += `<span class="ch">${esc(c.symbol)}</span><span><button data-show="${k}">${esc(nt(best.root))} ${esc(best.scale.name)}</button>${best.inKey || res.blues ? '' : ' <small style="display:inline">(outside the key)</small>'}`
        + `<small>${esc(best.reasons.slice(1).find(x => /colour/.test(x)) || best.reasons[0])}${second ? ' Also try ' + esc(nt(second.root) + ' ' + second.scale.name) + '.' : ''}</small></span>`;
    });
    h += '</div>';
  }
  $('fitOut').innerHTML = h;
}
$('fitOut').onclick = e => {
  const s = e.target.closest('[data-show]');
  if (s) { const r = fitResults[+s.dataset.show]; setScale(r.root, r.scale, 'Showing ' + nt(r.root) + ' ' + r.scale.name); if (window.innerWidth < 1000) window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  const h = e.target.closest('[data-hear]');
  if (h) {
    const r = fitResults[+h.dataset.hear];
    stopPlaying(); audio();
    const notes = spellScale(r.scale, r.root), base = 57 + mod12(pcOf(r.root) - 57), beat = 0.24, t0 = ctx.currentTime + 0.05;
    notes.concat([notes[0]]).forEach((x, i) => voice($('tone').value, base + (i === notes.length ? 12 : x.semis), t0 + i * beat, 0.45, 0.5));
  }
};

// ---- Modes: same notes, different home; same home, different notes

function modeRow(s, r, opts = {}) {
  const ns = spellScale(s, r), cur = new Set(spellScale(scale, root).map(x => x.pc));
  const on = s.id === scale.id && pcOf(r) === pcOf(root);
  return `<button class="mrow${on ? ' on' : ''}" data-mroot="${esc(nt(r))}" data-mscale="${s.id}"><span class="mn"><b>${esc(nt(r))} ${esc(s.short || s.name)}</b>${opts.sub ? `<small>${esc(opts.sub)}</small>` : ''}</span>`
    + `<span class="ns">${ns.map((x, k) => `<span class="${k === 0 ? 'home' : ''}${opts.diff && !cur.has(x.pc) ? ' diff' : ''}">${esc(nt(x.note))}</span>`).join('')}</span></button>`;
}
function renderModes() {
  let h = '';
  const fam = familyModes(scale, root);
  if (fam) {
    const par = parentOf(scale, root);
    h += `<h2>Same notes, different home</h2><p class="sub">The ${term('mode', 'modes')} of ${esc(nt(par.root))} ${esc(par.scale.name)}: every one uses these same notes; only the home note (in bold) changes. That change of home is what changes the sound.</p><div class="modeList">`;
    for (const m of fam) h += modeRow(m.scale, m.root, { sub: 'Mode ' + m.mode + (m.scale.char.length ? ', colour: ' + m.scale.char.join(' ') : '') });
    h += '</div>';
  } else {
    const rots = rotations(scale, root).filter(r => r.k > 0 || true);
    const named = rots.filter(r => r.scales.length && !(r.k === 0));
    h += `<h2>Same notes, different home</h2>`;
    if (scale.sym) h += `<p class="sub">${esc(scale.name)} is ${term('symmetric', 'symmetric')}: started on other notes it often gives the same pattern again, so it has fewer distinct modes.</p>`;
    if (named.length) {
      h += `<p class="sub">Start on another of its notes and these same notes make:</p><div class="modeList">`;
      const seen = new Set();
      for (const r of named) for (const s of r.scales) {
        const k = s.id + pcOf(r.root);
        if (seen.has(k)) continue;
        seen.add(k);
        h += modeRow(s, r.root, { sub: 'Starting on its ' + r.deg });
      }
      h += '</div>';
    } else h += `<p class="sub">Started on its other notes, it makes scales without common names.</p>`;
  }
  h += `<h2>Same home, different notes</h2><p class="sub">The seven modes on ${esc(nt(root))}, ${term('brightness', 'brightest to darkest')}. Notes in orange are the ones that differ from ${esc(nt(root))} ${esc(scale.name)}.</p>`;
  h += `<div class="bright"><span>brighter</span><span>darker</span></div><div class="modeList">`;
  for (const id of BRIGHTNESS) h += modeRow(SCALE[id], root, { diff: true, sub: SCALE[id].char.length ? 'Colour: ' + SCALE[id].char.join(' ') : '' });
  h += '</div>';
  const fm = parentOf(scale, root);
  if (fm && fm.family !== 'major') {
    h += `<h2>The ${esc(FAMILY_NAME[fm.family])} modes on ${esc(nt(root))}</h2><div class="modeList">`;
    for (const id of FAMILIES[fm.family]) h += modeRow(SCALE[id], root, { diff: true });
    h += '</div>';
  }
  $('modes').innerHTML = h;
}
$('modes').addEventListener('click', e => {
  const b = e.target.closest('.mrow');
  if (b) setScale(parseNote(b.dataset.mroot), SCALE[b.dataset.mscale]);
});

// ---- Practise: play it (the app listens) or name it (ear training)

let practMode = store.get('pract', 'play');
for (const b of $('practSeg').children) b.onclick = () => { practMode = b.dataset.v; store.set('pract', practMode); stopPractice(); renderPractSeg(); };
function renderPractSeg() {
  for (const b of $('practSeg').children) b.classList.toggle('on', b.dataset.v === practMode);
  $('playPane').classList.toggle('hidden', practMode !== 'play');
  $('earPane').classList.toggle('hidden', practMode !== 'ear');
}
$('clickMode').value = store.get('click', 'off');
$('clickMode').onchange = () => store.set('click', $('clickMode').value);

let mic = null, practice = null;
async function openMic(deviceId) {
  if (mic) { mic.stream.getTracks().forEach(t => t.stop()); mic.source.disconnect(); }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: {
    deviceId: deviceId ? { exact: deviceId } : undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  audio();
  const source = ctx.createMediaStreamSource(stream), analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);
  mic = { stream, source, analyser, buf: new Float32Array(analyser.fftSize) };
  const devices = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput');
  const sel = $('input'), keep = deviceId || '';
  sel.innerHTML = '';
  sel.append(new Option('Default microphone', ''));
  devices.forEach(d => { if (d.deviceId && d.deviceId !== 'default') sel.append(new Option(d.label || 'Input', d.deviceId)); });
  sel.value = keep;
}
$('input').onchange = () => { if (mic) openMic($('input').value).catch(micError); };
function micError(e) {
  $('micErr').classList.remove('hidden');
  $('micErr').textContent = e && e.name === 'NotAllowedError' ? 'The browser wasn\'t allowed to use the microphone. Allow it (the icon in the address bar) and try again.'
    : 'Couldn\'t open the microphone: ' + (e && e.message || e);
}
function describeSeq(seq) {
  const where = view === 'neck' && pattern ? pattern.name.toLowerCase() + ' (frets ' + (pattern.lo + capo) + ' to ' + (pattern.hi + capo) + ')' : 'one octave from ' + nt(root);
  return seq.length + ' notes: ' + nt(root) + ' ' + scale.name + ', ' + where + ', up and back down.';
}
async function startPractice() {
  stopPlaying();
  $('micErr').classList.add('hidden');
  try { await openMic($('input').value); } catch (e) { micError(e); return; }
  const seq = sequence();
  const withClick = $('clickMode').value === 'on', beat = 60 / +$('tempo').value;
  practice = { seq, checker: exerciseChecker(seq), finder: noteFinder(), withClick, beat, beats: null, timer: 0, heardAt: 0 };
  if (withClick) {
    const t0 = ctx.currentTime + 0.3, countIn = 4;
    for (let k = 0; k < countIn + seq.length; k++) click(t0 + k * beat, k === 0 || (k >= countIn && (k - countIn) % 4 === 0 && false));
    practice.beats = seq.map((x, i) => t0 + (countIn + i) * beat + (ctx.outputLatency || 0));
    practice.endAt = t0 + (countIn + seq.length + 2) * beat;
  }
  if ($('drone').checked) startDrone(36 + mod12(pcOf(root) - 36) + (pcOf(root) < 4 ? 12 : 0), ctx.currentTime + 0.05);
  $('practBtn').textContent = 'Stop';
  $('practBtn').classList.add('running');
  $('scoreBox').classList.add('hidden');
  $('practWhat').textContent = describeSeq(seq);
  $('tabPractise').innerHTML = 'Practise<span class="dot"></span>';
  practice.timer = setInterval(listenTick, 12);
  updatePractice('Play the first note: ' + nt(seq[0].note) + (withClick ? ' (after the 4 count-in clicks)' : '') + '.');
}
const SR_DOWN = 24000;
function listenTick() {
  if (!practice || !mic) return;
  const { analyser, buf } = mic;
  analyser.getFloatTimeDomainData(buf);
  let e = 0;
  for (let i = 0; i < buf.length; i++) e += buf[i] * buf[i];
  const level = Math.sqrt(e / buf.length);
  const stride = Math.max(1, Math.round(ctx.sampleRate / SR_DOWN));
  const hz = level > 0.004 ? estimatePitch(downsample(buf, stride), ctx.sampleRate / stride, 60, 1500) : 0;
  let reading = { t: ctx.currentTime, midi: null, level };
  if (hz > 0) {
    const m = 69 + 12 * Math.log2(hz / 440), r = Math.round(m);
    if (Math.abs(m - r) < 0.4) reading = { t: ctx.currentTime, midi: r, level };
    if (ctx.currentTime - practice.heardAt > 0.08) { $('heardNote').textContent = nt(plainNote(r)) + (Math.floor(r / 12) - 1); practice.heardAt = ctx.currentTime; }
  }
  const ev = practice.finder(reading);
  // the analysis window ends now; the note started about half a window (and a few readings) earlier
  if (ev) onPlayed(ev.midi, ev.t - mic.buf.length / ctx.sampleRate / 2);
  if (practice && practice.withClick && ctx.currentTime > practice.endAt) finishPractice();
}
function onPlayed(midi, t) {
  const p = practice, r = p.checker.play(midi, t), want = p.seq[p.checker.at];
  let msg = '';
  if (r.kind === 'right' || r.kind === 'skipped') {
    const m = p.checker.marks[r.index];
    msg = `<span class="ok">Yes, ${esc(nt(p.seq[r.index].note))}${m.octave ? ' (in another octave: fine)' : ''}.</span>` + (r.kind === 'skipped' ? ' You skipped one.' : '');
  } else if (r.kind === 'wrong') msg = `<span class="bad">That was ${esc(nt(plainNote(midi)))}.</span> Looking for ${esc(nt(want.note))} (the ${esc(want.d)}).`;
  if (p.checker.done) { updatePractice(msg); finishPractice(); return; }
  updatePractice(msg + (want && r.kind !== 'wrong' ? ' Next: ' + esc(nt(want.note)) + '.' : ''));
}
function updatePractice(text) {
  const p = practice;
  if (!p) return;
  const marks = p.checker.marks, at = p.checker.at;
  $('heardText').innerHTML = text;
  $('seqBox').innerHTML = p.seq.map((x, i) => `<span class="${i === at ? 'now' : marks[i].state === 'todo' ? '' : marks[i].state}">${esc(labels === 'deg' ? x.d : nt(x.note))}</span>`).join('');
  const right = new Set(), rightMidi = new Set();
  marks.forEach((m, i) => { if (m.state === 'right') { const x = p.seq[i]; right.add(x.course + ':' + x.fret + ':' + x.midi); rightMidi.add(x.midi); } });
  // ring only the notes still to come once; a note played going up stays green
  practiceMarks = { next: p.seq[at] || null, right, rightMidi };
  drawMain();
}
function finishPractice() {
  const p = practice;
  if (!p) return;
  clearInterval(p.timer);
  practice = null;
  const sc = p.checker.score();
  let h = `<div class="big">${sc.percent}%</div><p>${sc.right} of ${p.seq.length} notes right${sc.missed ? ', ' + sc.missed + ' skipped' : ''}${sc.wrong ? ', ' + sc.wrong + ' wrong note' + (sc.wrong > 1 ? 's' : '') + ' along the way' : ''}.</p>`;
  if (p.withClick) {
    const t = timingReport(p.checker.marks.map(m => m.state === 'right' ? m.t : null), p.beats);
    if (t) h += `<p>Timing: ${t.onTime}% of notes within 70 ms of the click. On average you were ${Math.abs(t.mean)} ms ${t.mean < 0 ? 'early' : 'late'} (spread ${t.spread} ms).</p><p class="sub">The app hears you a little after you play, more so over Bluetooth, so a steady small "late" is normal.</p>`;
    else h += `<p class="sub">No notes were caught in time with the click.</p>`;
  }
  const missedNotes = p.checker.marks.map((m, i) => m.state !== 'right' ? nt(p.seq[i].note) : null).filter(Boolean);
  h += sc.percent === 100 ? '<p>Clean run. Try it faster' + (p.withClick ? '' : ', with the click') + ', or in another position.</p>'
    : missedNotes.length ? `<p class="sub">Watch: ${esc([...new Set(missedNotes)].join(', '))}.</p>` : '<p class="sub">Every note made it in the end. Go again and aim for no wrong notes.</p>';
  $('scoreBox').innerHTML = h;
  $('scoreBox').classList.remove('hidden');
  window.encoreScalesLast = { score: sc, marks: p.checker.marks, wrong: p.checker.wrong };
  endPracticeUi();
}
function stopPractice() {
  if (practice) { clearInterval(practice.timer); practice = null; }
  endPracticeUi();
}
function endPracticeUi() {
  if (mic) { mic.stream.getTracks().forEach(t => t.stop()); mic.source.disconnect(); mic = null; }
  if (ctx) stopDrone();
  $('practBtn').textContent = 'Start listening';
  $('practBtn').classList.remove('running');
  $('tabPractise').textContent = 'Practise';
  if (practiceMarks) { practiceMarks = null; drawMain(); }
}
$('practBtn').onclick = () => { if (practice) finishPractice(); else startPractice(); };

// name it: ear training
for (const [k, s] of Object.entries(EAR_SETS)) $('earSet').append(new Option(s.name, k));
$('earSet').value = store.get('earSet', 'basic');
$('earRoot').value = store.get('earRoot', 'random');
$('earSet').onchange = () => { store.set('earSet', $('earSet').value); ear.q = null; ear.right = ear.total = 0; renderEar(); };
$('earRoot').onchange = () => store.set('earRoot', $('earRoot').value);
const ear = { q: null, root: null, right: 0, total: 0, answered: false, last: null };
function playEar() {
  if (!ear.q) return;
  stopPlaying(); audio();
  const notes = spellScale(ear.q.scale, ear.root), base = 57 + mod12(pcOf(ear.root) - 57), beat = 0.32, t0 = ctx.currentTime + 0.08;
  const up = notes.map(x => base + x.semis).concat([base + 12]);
  const seq = up.concat(up.slice(0, -1).reverse());
  seq.forEach((m, i) => voice('piano', m, t0 + i * beat, 0.45, 0.6));
  // the root chord's bass under the start and end, so the ear knows where home is
  voice('piano', base - 12, t0, 0.3, seq.length * beat);
}
$('earNew').onclick = () => {
  ear.q = earQuestion($('earSet').value, Math.random, ear.last);
  ear.last = ear.q.scale.id;
  const pcs = [0, 2, 4, 5, 7, 9, 11, 1, 3, 6, 8, 10];
  ear.root = $('earRoot').value === 'same' ? parseNote('C') : easyRoot(pcs[Math.floor(Math.random() * 12)], ear.q.scale);
  ear.answered = false;
  renderEar();
  playEar();
};
$('earAgain').onclick = playEar;
function renderEar() {
  $('earAgain').disabled = !ear.q;
  $('earScore').textContent = ear.total ? ear.right + ' of ' + ear.total + ' right' : '';
  if (!ear.q) { $('earOpts').innerHTML = ''; $('earFeedback').textContent = 'Press Play a scale. You\'ll hear it go up and back down over its root.'; return; }
  $('earOpts').innerHTML = ear.q.options.map((s, i) => `<button class="small${ear.answered && i === ear.q.answer ? ' right' : ''}${ear.answered && i === ear.picked && i !== ear.q.answer ? ' wrong' : ''}" data-i="${i}" ${ear.answered ? 'disabled' : ''}>${esc(s.short || s.name)}</button>`).join('');
  if (!ear.answered) $('earFeedback').textContent = 'Which scale was that? (' + nt(ear.root) + ' was home.)';
}
$('earOpts').onclick = e => {
  const b = e.target.closest('[data-i]');
  if (!b || ear.answered) return;
  ear.picked = +b.dataset.i; ear.answered = true; ear.total++;
  const right = ear.picked === ear.q.answer, s = ear.q.scale, picked = ear.q.options[ear.picked];
  if (right) ear.right++;
  renderEar();
  const chars = s.char.length ? ' Its colour: the ' + s.char.join(' and ') + '.' : '';
  $('earFeedback').innerHTML = (right ? '<b style="color:var(--green)">Yes!</b> ' + esc(nt(ear.root) + ' ' + s.name) + '.' + esc(chars) + ' ' + esc(s.why)
    : '<b style="color:var(--red)">Not quite.</b> It was ' + esc(nt(ear.root) + ' ' + s.name) + '.' + esc(chars) + ' ' + esc(differsText(s, picked)))
    + ` <button class="small" id="earShow">Show it</button>`;
  $('earShow').onclick = () => setScale(ear.root, s);
};

// ---- the tabs beside (or under) the main view

function showTab(name) {
  if (!document.querySelector(`.tabBar [data-tab="${name}"]`)) name = 'learn';
  for (const b of document.querySelectorAll('.tabBar button')) {
    b.classList.toggle('on', b.dataset.tab === name);
    b.setAttribute('aria-selected', b.dataset.tab === name);
    // keep the chosen tab in view when the bar scrolls sideways (phones)
    if (b.dataset.tab === name) { const bar = b.parentElement; bar.scrollLeft = Math.max(0, b.offsetLeft - (bar.clientWidth - b.offsetWidth) / 2); }
  }
  for (const sec of document.querySelectorAll('.tabBody > section')) sec.classList.toggle('show', sec.dataset.tab === name);
  store.set('tab', name);
}
for (const b of document.querySelectorAll('.tabBar button')) b.onclick = () => showTab(b.dataset.tab);

// ---- explanations on hover or tap

const pop = $('pop');
let popFor = null;
function showPop(el) {
  let title = '', text = '';
  if (el.dataset.term && GLOSSARY[el.dataset.term]) [title, text] = GLOSSARY[el.dataset.term];
  else text = el.dataset.tip || '';
  if (!text) return;
  pop.innerHTML = (title ? '<b>' + esc(title) + '</b>' : '') + esc(text);
  pop.classList.remove('hidden');
  const r = el.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight;
  const x = Math.min(Math.max(12, r.left + r.width / 2 - pw / 2), window.innerWidth - pw - 12);
  let y = r.bottom + 8;
  if (y + ph > window.innerHeight - 8) y = Math.max(8, r.top - ph - 8);
  pop.style.left = x + 'px'; pop.style.top = y + 'px';
  popFor = el;
}
function hidePop() { pop.classList.add('hidden'); popFor = null; }
document.addEventListener('pointerover', e => {
  if (e.pointerType && e.pointerType !== 'mouse') return;
  const el = e.target.closest && e.target.closest('[data-term],[data-tip]');
  if (el) { if (el !== popFor) showPop(el); } else if (popFor) hidePop();
});
document.addEventListener('click', e => {
  const el = e.target.closest('[data-term]');
  if (el) { e.preventDefault(); if (popFor === el) hidePop(); else showPop(el); return; }
  if (popFor && e.pointerType !== 'mouse') hidePop();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') hidePop(); });
window.addEventListener('scroll', () => { if (popFor) hidePop(); }, { passive: true });
$('tabBody').addEventListener('scroll', () => { if (popFor) hidePop(); }, { passive: true });

let toastTimer = 0;
function toast(text) {
  $('toast').textContent = text;
  $('toast').classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.add('hidden'), 2200);
}

// ---- everything for the current scale

function render() {
  const name = nt(root) + ' ' + scale.name;
  document.title = name + ' · Scales · Encore Music Studio';
  $('title').textContent = name;
  $('approxBadge').classList.toggle('hidden', !scale.approx);
  $('headSub').textContent = scale.size + ' notes';
  const easier = simplerRoot(scale, root);
  $('hint').classList.toggle('hidden', !easier);
  if (easier) {
    $('hint').innerHTML = `Easier to read as <button id="easier">${esc(nt(easier) + ' ' + scale.name)}</button> (the same sounds, fewer sharps and flats).`;
    $('easier').onclick = () => setScale(easier, scale);
  }
  if (!isFretted() && view === 'neck') view = 'piano';
  $('instLine').innerHTML = esc(instrument.name + ', ' + tuning.name + (capo ? ', capo at fret ' + capo : '')) + ' &middot; <button data-tabgo="setup">change</button>';
  findPatterns();
  drawMain();
  renderLearn();
  renderChords();
  renderModes();
}
$('instLine').onclick = e => { if (e.target.closest('[data-tabgo]')) showTab('setup'); };

// a small hook for automated checks (the notes the exercise expects)
window.encoreScales = { sequence: () => sequence().map(x => x.midi), get scale() { return scale.id; }, get root() { return nt(root); } };

render();
renderPractSeg();
renderEar();
runFit();
showTab(store.get('tab', 'learn'));
scrollToPattern();
