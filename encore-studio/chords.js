// Encore Chords: the page. Name any chord you put on a fretboard or keyboard (and find shapes for
// any chord), then pick a key and build a progression with every move explained, hear it, move it
// to another key, and save it. All the theory is in chords-core.js, chords-voicing.js and chords-keys.js.
import { TYPE, TYPE_GROUPS, chord, chordTones, chordSymbol, noteText, parseNote, pcOf, mod12, nameNotes,
         spellBass, plainNote, soundsAs, parseChord } from './chords-core.js';
import { frettable, coursesOf, courseNotes, fretVoicings, shapeText, pianoVoicing, capoOptions, shapeFor } from './chords-voicing.js';
import { MAJOR_KEYS, MINOR_KEYS, makeKey, keyName, keyPalette, numeralOf, relate, nextMoves, modulations, STYLES, styleChords,
         transposeChord, keyInterval, keyBySemis, chartText, signature, scaleNotes, numeralChord } from './chords-keys.js';
import { GLOSSARY, quizQuestion } from './chords-teach.js';
import { TUNINGS } from './tunings.js';

const $ = id => document.getElementById(id);
const store = {
  get: (k, d) => { try { const v = localStorage.getItem('encoreChords.' + k); return v === null ? d : v; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem('encoreChords.' + k, v); } catch {} },
};
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ACCENT = '#ff3b00', ACCENT_SOFT = '#ff6c40', PAPER = '#f2efe8', INK = '#0c0a09';

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
$('tone').value = store.get('tone', 'guitar');
$('volume').value = store.get('volume', '70');

let instrument = null, tuning = null, courses = [], capo = 0, frets = 15;
const voicingCache = new Map();
function fillTunings(keep) {
  instrument = instruments[+$('instrument').value];
  const sel = $('tuning');
  sel.innerHTML = '';
  instrument.tunings.forEach((t, i) => { if (t.midi.length >= 2) sel.append(new Option(t.name + (t.notes.length ? ' (' + t.notes.map(n => n.replace(/\d/g, '')).join(' ') + ')' : ''), i)); });
  sel.value = String(instrument.tunings[keep] && instrument.tunings[keep].midi.length >= 2 ? keep : sel.options[0].value);
  setupTuning();
}
function setupTuning() {
  tuning = instrument.tunings[+$('tuning').value];
  courses = coursesOf(tuning, instrument.name);
  capo = +$('capo').value;
  frets = +$('frets').value;
  fretState = courses.map(() => -1);
  voicingCache.clear();
}
let fretState = [];
$('capo').value = store.get('capo', '0');
fillTunings(+store.get('tuning', '0'));

$('instrument').onchange = () => { store.set('instrument', instruments[+$('instrument').value].name); fillTunings(0); store.set('tuning', $('tuning').value); everything(); };
$('tuning').onchange = () => { store.set('tuning', $('tuning').value); setupTuning(); everything(); };
$('capo').onchange = () => { store.set('capo', $('capo').value); const keep = fretState; setupTuning(); fretState = keep.map(f => (f > 0 && f < capo) ? -1 : f); everything(); };
$('frets').onchange = () => { store.set('frets', $('frets').value); const keep = fretState; setupTuning(); fretState = keep.map(f => f > frets ? -1 : f); everything(); };
$('tone').onchange = () => store.set('tone', $('tone').value);
$('volume').oninput = () => { store.set('volume', $('volume').value); if (master) master.gain.value = vol(); };

/** Voicings for a chord on the current instrument, tuning and capo (frets counted from the capo) */
function voicings(c) {
  const k = $('instrument').value + ':' + $('tuning').value + ':' + capo + ':' + frets + ':' + chordSymbol(c);
  if (!voicingCache.has(k)) voicingCache.set(k, fretVoicings(c, courses, { capo, maxFret: Math.max(5, frets - capo), limit: 18 }));
  return voicingCache.get(k);
}

// ---- sound: plucked strings or a piano-ish tone, built sample by sample like Tune's reference tone

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
function voice(kind, midi, when, gain, dur) {
  const src = ctx.createBufferSource(), g = ctx.createGain();
  src.buffer = noteBuffer(kind, midi);
  g.gain.setValueAtTime(gain, when);
  g.gain.setTargetAtTime(0, when + dur, 0.05);
  src.connect(g).connect(master);
  src.start(when);
  src.stop(when + dur + 0.4);
}
/** Plays notes as a strum (spread seconds apart, low to high or high to low) or all at once (spread 0) */
function sound(notes, when, { spread = 0.022, gain = 1, dur = 2.4, up = false, kind = $('tone').value } = {}) {
  const list = up ? [...notes].reverse() : notes;
  const each = gain * 0.5 / Math.sqrt(Math.max(1, notes.length));
  list.forEach((m, i) => voice(kind, m, when + i * spread, each, dur - i * spread));
}
function hear(notes, strum = true) {
  if (!notes.length) return;
  audio();
  sound(notes, ctx.currentTime + 0.03, { spread: strum ? 0.03 : 0, dur: 2.8 });
}

// ---- drawing: the neck, a piano, a chord box

const NECK = { left: 58, open: 34, row: 30, top: 22, bottom: 28 };
const fretWidth = n => 64 * Math.pow(0.966, n - 1);
function fretX(n) { let x = NECK.left + NECK.open; for (let k = 1; k <= n; k++) x += fretWidth(k); return x; }
const fretMid = n => n === 0 ? NECK.left + NECK.open / 2 - 2 : (fretX(n - 1) + fretX(n)) / 2;
const INLAYS = [3, 5, 7, 9, 15, 17, 19, 21];

/** What a placed note says on its dot: its degree in the chosen name, or its spelled name */
function dotLabel(pc) {
  const r = names[pick];
  if (labelMode === 'interval' && r && r.labels[pc] && r.labels[pc] !== 'bass') return r.labels[pc];
  const spelled = r && r.notes ? r.notes.find(n => pcOf(n) === pc) : null;
  if (spelled) return noteText(spelled);
  if (r && r.chord && r.chord.bass && pcOf(r.chord.bass) === pc) return noteText(r.chord.bass);
  return noteText(plainNote(pc));
}
function isRoot(pc) { const r = names[pick]; return !!(r && r.labels && r.labels[pc] === 'R'); }

function drawNeck() {
  const n = courses.length, H = NECK.top + (n - 1) * NECK.row + NECK.bottom, W = fretX(frets) + 18;
  const svg = $('neck');
  svg.setAttribute('width', W); svg.setAttribute('height', H); svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  svg.style.setProperty('--w', Math.round(W));
  const y = i => NECK.top + (n - 1 - i) * NECK.row;
  const opens = courses.map(c => c.open), lo = Math.min(...opens), hi = Math.max(...opens);
  let s = `<rect x="${fretX(0)}" y="${NECK.top - 12}" width="${fretX(frets) - fretX(0)}" height="${(n - 1) * NECK.row + 24}" fill="#1f1a16" rx="3"/>`;
  for (const f of INLAYS) if (f <= frets) s += `<circle cx="${fretMid(f)}" cy="${NECK.top + (n - 1) * NECK.row / 2}" r="5" fill="#3a332d"/>`;
  for (const f of [12, 24]) if (f <= frets) {
    const cy = NECK.top + (n - 1) * NECK.row / 2, d = Math.max(NECK.row * 0.9, (n - 1) * NECK.row / 4);
    s += `<circle cx="${fretMid(f)}" cy="${cy - d}" r="5" fill="#3a332d"/><circle cx="${fretMid(f)}" cy="${cy + d}" r="5" fill="#3a332d"/>`;
  }
  for (let f = 0; f <= frets; f++) {
    s += `<line x1="${fretX(f)}" x2="${fretX(f)}" y1="${NECK.top - 12}" y2="${NECK.top + (n - 1) * NECK.row + 12}" stroke="${f ? '#6b625a' : PAPER}" stroke-width="${f ? 2 : 5}"/>`;
    if (f) s += `<text x="${fretMid(f)}" y="${H - 6}" font-size="11" fill="#91887d" text-anchor="middle">${f}</text>`;
  }
  if (capo > 0) {
    s += `<rect x="${fretX(0) + 3}" y="${NECK.top - 12}" width="${fretX(capo) - 16 - fretX(0)}" height="${(n - 1) * NECK.row + 24}" fill="rgb(12 10 9 / .55)"/>`;
    s += `<rect x="${fretX(capo) - 15}" y="${NECK.top - 16}" width="10" height="${(n - 1) * NECK.row + 32}" rx="4" fill="${ACCENT}" opacity=".9"/>`;
  }
  courses.forEach((c, i) => {
    const thick = hi > lo ? 1 + 2.2 * (1 - (c.open - lo) / (hi - lo)) : 1.6;
    const x0 = c.start ? fretX(c.start) : fretX(0);
    if (c.midi.length > 1) {
      s += `<line x1="${x0}" x2="${fretX(frets)}" y1="${y(i) - 2.5}" y2="${y(i) - 2.5}" stroke="#c9bfb3" stroke-width="${Math.max(1, thick * 0.7)}"/>`;
      s += `<line x1="${x0}" x2="${fretX(frets)}" y1="${y(i) + 2.5}" y2="${y(i) + 2.5}" stroke="#c9bfb3" stroke-width="${Math.max(1, thick * 0.7)}"/>`;
    } else s += `<line x1="${x0}" x2="${fretX(frets)}" y1="${y(i)}" y2="${y(i)}" stroke="#c9bfb3" stroke-width="${thick}"/>`;
    if (c.start) s += `<circle cx="${x0}" cy="${y(i)}" r="4" fill="#c9bfb3"/>`;
  });
  // what each string is doing, and its open note (tap to open or mute it)
  courses.forEach((c, i) => {
    const f = fretState[i], openPc = mod12((c.start ? c.open : c.open + capo));
    const mark = f < 0 ? 'x' : f === 0 ? 'o' : '';
    s += `<g class="lbl" data-c="${i}" data-f="open"><rect x="0" y="${y(i) - NECK.row / 2}" width="${NECK.left - 4}" height="${NECK.row}" fill="transparent"/>`
      + `<text x="10" y="${y(i) + 5}" font-size="14" font-weight="700" fill="${f < 0 ? '#ef4444' : PAPER}">${mark}</text>`
      + `<text x="${NECK.left - 10}" y="${y(i) + 5}" font-size="13" fill="#bdb4a9" text-anchor="end">${noteText(plainNote(openPc))}</text></g>`;
  });
  // all of the chord's tones up the neck, faintly
  const r = names[pick];
  if (ghost && r && r.labels) {
    const pcs = new Set(Object.keys(r.labels).map(Number));
    courses.forEach((c, i) => {
      for (let f = 0; f <= frets; f++) {
        if (f === fretState[i] || (f > 0 && f < capo)) continue;
        const m = f === 0 ? courseNotes(c, 0, capo) : courseNotes(c, f - capo, capo);
        if (!m || !pcs.has(mod12(m[0]))) continue;
        const pc = mod12(m[0]);
        s += `<circle cx="${fretMid(f)}" cy="${y(i)}" r="8" fill="none" stroke="${isRoot(pc) ? ACCENT_SOFT : '#91887d'}" stroke-width="1.5"/>`
          + `<text x="${fretMid(f)}" y="${y(i) + 3.5}" font-size="9" fill="${isRoot(pc) ? ACCENT_SOFT : '#bdb4a9'}" text-anchor="middle">${esc(dotLabel(pc))}</text>`;
      }
    });
  }
  // tap targets: the open zone and every fret
  courses.forEach((c, i) => {
    for (let f = 0; f <= frets; f++) {
      if (f > 0 && c.start && f <= c.start) continue;
      const x0 = f === 0 ? NECK.left : fretX(f - 1), x1 = f === 0 ? fretX(0) : fretX(f);
      s += `<rect class="hit" data-c="${i}" data-f="${f}" x="${x0}" y="${y(i) - NECK.row / 2}" width="${x1 - x0}" height="${NECK.row}"/>`;
    }
  });
  courses.forEach((c, i) => {
    const f = fretState[i];
    if (f < 0) return;
    const m = soundingOf(i);
    if (!m) return;
    const pc = mod12(m[0]), root = isRoot(pc), cx = f === 0 ? fretMid(0) : fretMid(f);
    s += `<g pointer-events="none"><circle cx="${cx}" cy="${y(i)}" r="12" fill="${root ? ACCENT : (f === 0 ? 'none' : PAPER)}" stroke="${root ? ACCENT : PAPER}" stroke-width="2"/>`
      + `<text x="${cx}" y="${y(i) + 4.5}" font-size="12" font-weight="700" fill="${root ? '#fff' : (f === 0 ? PAPER : INK)}" text-anchor="middle">${esc(dotLabel(pc))}</text></g>`;
  });
  svg.innerHTML = s;
}
/** The notes a course is sounding on the neck right now (null when muted) */
function soundingOf(i) {
  const f = fretState[i], c = courses[i];
  if (f < 0) return null;
  if (f === 0) return courseNotes(c, 0, capo);
  return courseNotes(c, f - capo, capo);
}
$('neck').addEventListener('click', e => {
  const t = e.target.closest('[data-c]');
  if (!t) return;
  const i = +t.dataset.c;
  if (t.dataset.f === 'open') fretState[i] = fretState[i] < 0 ? 0 : -1;
  else {
    const f = +t.dataset.f;
    if (f > 0 && f < capo) return;
    fretState[i] = fretState[i] === f ? -1 : f;
  }
  source = 'fret';
  analyse();
  const m = soundingOf(i);
  if (m) { audio(); sound(m, ctx.currentTime + 0.01, { spread: 0, dur: 1.6, gain: 0.7 }); }
});

const BLACK = [1, 3, 6, 8, 10];
/** A keyboard from lo to hi (MIDI). on: MIDI note to { label, root } */
function drawPiano(svg, lo, hi, on, small = false) {
  const ww = small ? 20 : 28, wh = small ? 80 : 118, bw = small ? 12 : 17, bh = small ? 50 : 74;
  const whites = [];
  for (let m = lo; m <= hi; m++) if (!BLACK.includes(mod12(m))) whites.push(m);
  const W = whites.length * ww + 2, H = wh + 2;
  svg.setAttribute('width', W); svg.setAttribute('height', H); svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  svg.style.setProperty('--w', W);
  let s = '';
  const xOf = new Map();
  whites.forEach((m, i) => {
    const x = 1 + i * ww, a = on.get(m);
    xOf.set(m, x);
    s += `<rect class="key" data-m="${m}" x="${x}" y="1" width="${ww - 1}" height="${wh}" rx="3" fill="${a ? (a.root ? ACCENT_SOFT : '#ffd2c2') : PAPER}" stroke="#0c0a09"/>`;
    if (a) s += `<text x="${x + ww / 2}" y="${wh - 8}" font-size="${small ? 9 : 11}" font-weight="700" fill="${INK}" text-anchor="middle" pointer-events="none">${esc(a.label)}</text>`;
    else if (mod12(m) === 0 && !small) s += `<text x="${x + ww / 2}" y="${wh - 8}" font-size="10" fill="#91887d" text-anchor="middle" pointer-events="none">C${Math.floor(m / 12) - 1}</text>`;
  });
  for (let m = lo; m <= hi; m++) {
    if (!BLACK.includes(mod12(m))) continue;
    const left = xOf.get(m - 1);
    if (left === undefined) continue;
    const x = left + ww - bw / 2, a = on.get(m);
    s += `<rect class="key" data-m="${m}" x="${x}" y="1" width="${bw}" height="${bh}" rx="2" fill="${a ? (a.root ? ACCENT : '#c2410c') : '#1b1714'}" stroke="#0c0a09"/>`;
    if (a) s += `<text x="${x + bw / 2}" y="${bh - 6}" font-size="${small ? 7 : 9}" font-weight="700" fill="#fff" text-anchor="middle" pointer-events="none">${esc(a.label)}</text>`;
  }
  svg.innerHTML = s;
}

/** A chord box: strings top to bottom of the page as columns (low string on the left), as on chord charts */
function chordBox(v, rootPc, labelOf = null) {
  const n = courses.length, gap = n > 8 ? 12 : 16, left = 22, top = 20, rowH = 17;
  const fretted = v.frets.filter(f => f > 0), maxF = fretted.length ? Math.max(...fretted) : 0;
  const base = maxF <= 5 ? 1 : v.pos, rows = Math.max(4, Math.min(5, maxF - base + 1));
  const W = left + (n - 1) * gap + 14, H = top + rows * rowH + 16;
  const x = i => left + i * gap;
  let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;
  for (let r = 0; r <= rows; r++) s += `<line x1="${x(0)}" x2="${x(n - 1)}" y1="${top + r * rowH}" y2="${top + r * rowH}" stroke="#6b625a" stroke-width="${r === 0 && base === 1 ? 4 : 1}"/>`;
  for (let i = 0; i < n; i++) s += `<line x1="${x(i)}" x2="${x(i)}" y1="${top}" y2="${top + rows * rowH}" stroke="#c9bfb3" stroke-width="1"/>`;
  if (base > 1) s += `<text x="2" y="${top + rowH * 0.7}" font-size="10" fill="#bdb4a9">${base}fr</text>`;
  if (v.barre && v.barre.to > v.barre.from) {
    const yb = top + (v.barre.fret - base + 0.5) * rowH;
    s += `<rect x="${x(v.barre.from) - 6}" y="${yb - 6}" width="${x(v.barre.to) - x(v.barre.from) + 12}" height="12" rx="6" fill="${PAPER}" opacity=".85"/>`;
  }
  v.frets.forEach((f, i) => {
    const notes = courseNotes(courses[i], f, capo);
    if (f < 0) { s += `<text x="${x(i)}" y="${top - 6}" font-size="11" fill="#ef4444" text-anchor="middle">x</text>`; return; }
    const pc = notes ? mod12(notes[0]) : -1, root = pc === rootPc;
    if (f === 0) { s += `<circle cx="${x(i)}" cy="${top - 9}" r="4" fill="none" stroke="${root ? ACCENT_SOFT : PAPER}" stroke-width="1.5"/>`; return; }
    const yy = top + (f - base + 0.5) * rowH;
    s += `<circle cx="${x(i)}" cy="${yy}" r="6.5" fill="${root ? ACCENT : PAPER}"/>`;
    if (labelOf) s += `<text x="${x(i)}" y="${yy + 3}" font-size="7.5" font-weight="700" fill="${root ? '#fff' : INK}" text-anchor="middle">${esc(labelOf(pc))}</text>`;
  });
  return s + '</svg>';
}

// ---- Name a chord

let source = 'fret', pianoNotes = new Set(), names = [], pick = 0, labelMode = store.get('labels', 'interval'), ghost = store.get('ghost', '0') === '1';
$('ghost').checked = ghost;
for (const b of $('labelSeg').children) b.classList.toggle('on', b.dataset.v === labelMode);
$('labelSeg').onclick = e => { const b = e.target.closest('button'); if (!b) return; labelMode = b.dataset.v; store.set('labels', labelMode); for (const x of $('labelSeg').children) x.classList.toggle('on', x === b); renderName(); };
$('ghost').onchange = () => { ghost = $('ghost').checked; store.set('ghost', ghost ? '1' : '0'); drawNeck(); };
/** Neck or piano: one input on screen at a time (whatever you played last still gets named) */
let inputView = store.get('input', 'neck') === 'piano' ? 'piano' : 'neck';
function setInput(v) {
  inputView = v;
  store.set('input', v);
  for (const b of $('inputSeg').children) { const on = b.dataset.v === v; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); }
  $('neckWrap').classList.toggle('hidden', v !== 'neck');
  $('pianoWrap').classList.toggle('hidden', v !== 'piano');
  $('ghostWrap').classList.toggle('hidden', v !== 'neck');
  $('neckClear').classList.toggle('hidden', v !== 'neck');
  $('pianoClear').classList.toggle('hidden', v !== 'piano');
  if (v === 'piano') centerScroll($('pianoBox'));
}
const centerScroll = box => { if (box.scrollLeft === 0) box.scrollLeft = Math.max(0, (box.scrollWidth - box.clientWidth) / 2); };
$('inputSeg').onclick = e => { const b = e.target.closest('button'); if (b) setInput(b.dataset.v); };
$('neckClear').onclick = () => { fretState = courses.map(() => -1); source = 'fret'; analyse(); };
$('pianoClear').onclick = () => { pianoNotes.clear(); source = 'piano'; analyse(); };

const KEY_OPTIONS = [...MAJOR_KEYS.map(t => [t, 'major']), ...MINOR_KEYS.map(t => [t, 'minor'])];
$('spellKey').append(new Option('Any key (fewest sharps and flats)', ''));
for (const [t, m] of KEY_OPTIONS) $('spellKey').append(new Option(t + ' ' + m, t + ':' + m));
$('spellKey').value = store.get('spellKey', '');
$('spellKey').onchange = () => { store.set('spellKey', $('spellKey').value); analyse(); };
const spellKey = () => { const v = $('spellKey').value; if (!v) return null; const [t, m] = v.split(':'); return makeKey(t, m); };

function currentNotes() {
  if (source === 'piano') return [...pianoNotes].sort((a, b) => a - b);
  const out = [];
  courses.forEach((c, i) => { const m = soundingOf(i); if (m) out.push(...m); });
  return out.sort((a, b) => a - b);
}
function analyse() { names = nameNotes(currentNotes(), spellKey()); pick = 0; renderName(); }

const TERM_FOR = { power: 'power', sus: 'sus', dim: 'diminished', hdim: 'halfdim', aug: 'augmented' };
function renderName() {
  drawNeck();
  const notes = currentNotes(), r = names[pick];
  const on = new Map();
  for (const m of notes) on.set(m, { label: dotLabel(mod12(m)), root: isRoot(mod12(m)) });
  drawPiano($('piano'), 36, 84, on);
  for (const id of ['strumBtn', 'blockBtn']) $(id).disabled = !notes.length;
  $('toProg').disabled = $('toShapes').disabled = !(r && r.kind === 'chord');
  if (!r) {
    $('bigName').textContent = '--';
    $('bigText').textContent = 'Tap some notes and the name shows up here.';
    $('formula').innerHTML = $('inversion').innerHTML = $('alts').innerHTML = $('altWhy').innerHTML = '';
    return;
  }
  $('bigName').textContent = r.symbol;
  let text = esc(r.text);
  if (r.type) {
    const t = r.type, terms = [];
    if (TERM_FOR[t.fam]) terms.push(TERM_FOR[t.fam]);
    if (t.f.some(d => /^(9|11|13)$/.test(d))) terms.push('extension');
    if (t.f.some(d => /^(b9|#9|#11|b13)$/.test(d))) terms.push('altered');
    if (/add/.test(t.id)) terms.push('add');
    if (t.f.length >= 4 && t.f.some(d => /7$/.test(d))) terms.push('seventh');
    if (terms.length) text += '. Read more: ' + terms.map(k => `<span class="term" data-term="${k}">${esc(GLOSSARY[k][0].toLowerCase())}</span>`).join(', ');
  }
  $('bigText').innerHTML = text;
  if (r.kind === 'chord') {
    const tones = chordTones(chord(r.chord.root, r.chord.type));
    $('formula').innerHTML = `<span class="term muted" data-term="formula" style="align-self:center">Formula</span>` + tones.map(x => {
      const gone = r.missing.includes(x.d);
      const odd = soundsAs(x.note);
      return `<div class="tone${x.d === '1' ? ' root' : ''}${gone ? ' gone' : ''}" ${odd ? `data-tip="${esc(noteText(x.note) + ' is spelled that way because it is the ' + x.d + ' of the chord. It sounds the same as ' + odd + '.')}"` : gone ? `data-tip="Left out here. The chord still works without it."` : ''}><b>${esc(noteText(x.note))}</b><span>${esc(x.d)}</span></div>`;
    }).join('') + (r.foreign ? `<div class="tone" data-tip="The bass note is not part of the chord above it."><b>${esc(noteText(r.chord.bass))}</b><span>bass</span></div>` : '');
    let inv = '';
    if (r.inversion) inv = `<span class="term" data-term="${r.foreign ? 'slash' : 'inversion'}">${r.foreign ? 'Slash chord' : 'Inversion'}</span>: ${esc(r.inversion)}.`;
    if (r.missing.length) inv += (inv ? ' ' : '') + 'Left out: the ' + r.missing.join(', ') + (r.missing.length > 1 ? ' (that\'s normal for this chord).' : ' (that\'s normal for this chord).');
    if (r.missing.includes('3') && r.symbol.includes('(no3)')) inv = inv.replace(' (that\'s normal for this chord).', ' (so it is neither major nor minor).');
    $('inversion').innerHTML = inv;
  } else {
    $('formula').innerHTML = '';
    $('inversion').textContent = '';
  }
  $('alts').innerHTML = names.map((x, i) => `<button class="alt${i === pick ? ' on' : ''}" data-i="${i}">${esc(x.symbol)}</button>`).join('');
  $('altWhy').innerHTML = names.length > 1 ? (pick === 0 ? 'Why this one first: ' + whyFirst(names) : esc(r.symbol) + ': the same notes heard with ' + esc(r.kind === 'chord' ? noteText(r.chord.root) : '') + ' as the root. Which name is right depends on the bass and on the chords around it.')
    : (r.kind === 'chord' ? 'Only one name fits these notes.' : '');
}
function whyFirst(list) {
  const a = list[0];
  if (a.kind !== 'chord') return 'with two notes, it is an interval more than a chord.';
  if (!a.chord.bass) return 'its root (' + esc(noteText(a.chord.root)) + ') is in the bass, and it is the simplest name that fits.';
  return 'it is the simplest name that fits with this bass note.';
}
$('alts').onclick = e => { const b = e.target.closest('.alt'); if (!b) return; pick = +b.dataset.i; renderName(); };
$('piano').addEventListener('click', e => {
  const k = e.target.closest('.key');
  if (!k) return;
  const m = +k.dataset.m;
  if (source !== 'piano') { pianoNotes = new Set(currentNotes()); source = 'piano'; fretState = courses.map(() => -1); }
  if (pianoNotes.has(m)) pianoNotes.delete(m); else { pianoNotes.add(m); audio(); sound([m], ctx.currentTime + 0.01, { spread: 0, dur: 1.4, gain: 0.7, kind: 'piano' }); }
  analyse();
});
$('strumBtn').onclick = () => hear(currentNotes(), true);
$('blockBtn').onclick = () => hear(currentNotes(), false);
$('toProg').onclick = () => { const r = names[pick]; if (r && r.chord) { addChord(r.chord); toast('Added ' + chordSymbol(r.chord) + ' to your progression'); } };
$('toShapes').onclick = () => {
  const r = names[pick];
  if (!r || !r.chord) return;
  setLookup(r.chord);
  setTab('shapes');
};

// ---- Find the shapes for a chord

const ROOTS = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B'];
for (const r of ROOTS) $('luRoot').append(new Option(r, r));
for (const [g, ids] of TYPE_GROUPS) {
  const og = document.createElement('optgroup');
  og.label = g;
  for (const id of ids) og.append(new Option(TYPE[id].sym ? TYPE[id].sym + '  (' + TYPE[id].name + ')' : TYPE[id].name, id));
  $('luType').append(og);
}
$('luRoot').value = store.get('luRoot', 'C');
$('luType').value = store.get('luType', 'maj');
function fillBass(keep = '') {
  const root = parseNote($('luRoot').value), c = chord(root, $('luType').value);
  const sel = $('luBass');
  sel.innerHTML = '';
  sel.append(new Option('Root in the bass', ''));
  for (const t of chordTones(c)) if (t.d !== '1') sel.append(new Option(noteText(t.note) + ' (its ' + t.d + ') in the bass', noteText(t.note)));
  const og = document.createElement('optgroup');
  og.label = 'Another bass note (slash chord)';
  const used = new Set(chordTones(c).map(t => t.pc));
  for (let pc = 0; pc < 12; pc++) if (!used.has(pc)) { const n = spellBass(pc, root); og.append(new Option(noteText(n) + ' in the bass', noteText(n))); }
  sel.append(og);
  sel.value = [...sel.options].some(o => o.value === keep) ? keep : '';
}
fillBass();
$('luRoot').onchange = () => { store.set('luRoot', $('luRoot').value); fillBass($('luBass').value); renderLookup(); };
$('luType').onchange = () => { store.set('luType', $('luType').value); fillBass($('luBass').value); renderLookup(); };
$('luBass').onchange = () => renderLookup();
function setLookup(c) {
  $('luRoot').value = ROOTS.includes(noteText(c.root)) ? noteText(c.root) : noteText(plainNote(pcOf(c.root)));
  $('luType').value = c.type;
  fillBass(c.bass ? noteText(c.bass) : '');
  renderLookup();
}
let lookupList = [];
function lookupChord() { const root = parseNote($('luRoot').value), b = $('luBass').value; return chord(root, $('luType').value, b ? parseNote(b) : null); }
function renderLookup() {
  const c = lookupChord(), tones = chordTones(c), t = TYPE[c.type];
  lookupList = voicings(c);
  $('luPicked').innerHTML = '';
  $('luInfo').innerHTML = `<b>${esc(chordSymbol(c))}</b>: ${esc(t.name)}, ${tones.map(x => esc(noteText(x.note)) + ' <span class="muted">(' + esc(x.d) + ')</span>').join(' ')}`
    + (t.opt.length ? `. The ${t.opt.join(' and ')} can be left out.` : '.')
    + (capo ? ` Shapes are counted from the capo at fret ${capo}.` : '');
  const label = pc => { const x = tones.find(y => y.pc === pc); return x ? (x.d === '1' ? 'R' : x.d) : ''; };
  $('luShapes').innerHTML = lookupList.length ? lookupList.map((v, i) => `<button class="shape" data-i="${i}">${chordBox(v, pcOf(c.root), label)}<div class="cap">${esc(shapeText(v.frets))}</div><div class="sub">${v.pos ? 'fret ' + v.pos : 'open'}${v.barre ? ', barre' : ''}${v.rootless ? ', no root' : ''}</div></button>`).join('')
    : '<div class="empty">No comfortable shape for this chord on this instrument and tuning (try fewer notes, another tuning, or more frets).</div>';
  const pv = pianoVoicing(c), on = new Map();
  for (const m of pv.notes) { const x = tones.find(y => y.pc === mod12(m)); on.set(m, { label: noteText(x ? x.note : plainNote(m)), root: mod12(m) === pcOf(c.root) }); }
  drawPiano($('luPiano'), 36, 84, on, true);
}
$('luShapes').onclick = e => {
  const b = e.target.closest('.shape');
  if (!b) return;
  const v = lookupList[+b.dataset.i];
  fretState = v.frets.map(f => f < 0 ? -1 : f === 0 ? 0 : f + capo);
  source = 'fret';
  analyse();
  hear(currentNotes(), true);
  for (const x of $('luShapes').children) x.classList.toggle('on', x === b);
  const r = names[pick];
  $('luPicked').innerHTML = `<span>On the neck now: <b>${esc(shapeText(v.frets))}</b>${r ? ' (' + esc(r.symbol) + ')' : ''}</span><button class="small" id="luEdit">Edit it on the neck</button>`;
};
$('luPicked').onclick = e => { if (e.target.closest('#luEdit')) { setTab('name'); setInput('neck'); } };

// ---- Write a progression

let prog = loadProg(store.get('prog', '')) || { key: makeKey('C'), items: [], tempo: 96, name: '' };
let palette = keyPalette(prog.key), sel = -1, styleBeats = 4;
const serial = p => JSON.stringify({ k: noteText(p.key.tonic), m: p.key.mode, t: p.tempo, n: p.name,
  i: p.items.map(it => ({ r: noteText(it.chord.root), y: it.chord.type, b: it.chord.bass ? noteText(it.chord.bass) : '', n: it.rn || '', d: it.beats, v: it.vi ?? null })) });
function loadProg(s) {
  try {
    const o = typeof s === 'string' ? JSON.parse(s) : s;
    if (!o || !o.k) return null;
    return { key: makeKey(o.k, o.m), tempo: o.t || 96, name: o.n || '',
      items: o.i.filter(x => TYPE[x.y]).map(x => ({ chord: chord(parseNote(x.r), x.y, x.b ? parseNote(x.b) : null), rn: x.n || '', beats: x.d || 4, vi: x.v })) };
  } catch { return null; }
}
const saveCurrent = () => store.set('prog', serial(prog));

function fillKeys() {
  const list = prog.key.mode === 'minor' ? MINOR_KEYS : MAJOR_KEYS;
  $('keySel').innerHTML = '';
  for (const t of list) {
    const k = makeKey(t, prog.key.mode), sg = signature(k);
    $('keySel').append(new Option(t + (k.mode === 'minor' ? ' minor' : ' major') + '  (' + (sg ? Math.abs(sg) + (sg > 0 ? ' sharp' : ' flat') + (Math.abs(sg) > 1 ? 's' : '') : 'no sharps or flats') + ')', t));
  }
  $('keySel').value = noteText(prog.key.tonic);
  $('modeSel').value = prog.key.mode;
}
for (const s of STYLES) $('styleSel').append(new Option(s.name + ' (' + s.mode + ')', s.id));
$('tempo').value = prog.tempo;
$('rhythm').value = store.get('rhythm', 'strum');
$('loop').checked = store.get('loop', '1') === '1';
$('tempo').onchange = () => { prog.tempo = Math.max(30, Math.min(260, +$('tempo').value || 96)); $('tempo').value = prog.tempo; saveCurrent(); if (playing) restartPlay(); };
$('rhythm').onchange = () => { store.set('rhythm', $('rhythm').value); if (playing) restartPlay(); };
$('loop').onchange = () => store.set('loop', $('loop').checked ? '1' : '0');

function setKey(k, transpose) {
  if (transpose) {
    const iv = keyInterval(prog.key, k);
    prog.items = prog.items.map(it => ({ ...it, chord: transposeChord(it.chord, iv), vi: null }));
  } else prog.items = prog.items.map(it => ({ ...it, rn: '' }));
  prog.key = k;
  palette = keyPalette(k);
  saveCurrent();
  renderWrite();
}
$('keySel').onchange = () => setKey(makeKey($('keySel').value, prog.key.mode), true);
$('modeSel').onchange = () => {
  const mode = $('modeSel').value, list = mode === 'minor' ? MINOR_KEYS : MAJOR_KEYS;
  const t = noteText(prog.key.tonic);
  setKey(makeKey(list.includes(t) ? t : noteText(plainNote(pcOf(prog.key.tonic))), mode), false);
};
$('transUp').onclick = () => setKey(keyBySemis(prog.key, 1), true);
$('transDown').onclick = () => setKey(keyBySemis(prog.key, -1), true);
$('progClear').onclick = () => { stopPlay(); prog.items = []; sel = -1; saveCurrent(); renderWrite(); };
$('styleSel').onchange = () => {
  const s = STYLES.find(x => x.id === $('styleSel').value);
  if (!s) { $('styleWhy').textContent = ''; renderDetail(); return; }
  stopPlay();
  const t = noteText(prog.key.tonic), list = s.mode === 'minor' ? MINOR_KEYS : MAJOR_KEYS;
  const k = makeKey(list.includes(t) ? t : noteText(plainNote(pcOf(prog.key.tonic))), s.mode);
  const r = styleChords(s, k);
  prog = { ...prog, key: r.key, items: r.items.map(it => ({ ...it, vi: null })), tempo: s.tempo, name: s.name };
  palette = keyPalette(prog.key);
  styleBeats = s.beats || 4;
  $('tempo').value = s.tempo;
  $('rhythm').value = s.sound || 'strum';
  store.set('rhythm', $('rhythm').value);
  $('progName').value = s.name;
  sel = -1;
  $('styleWhy').innerHTML = '<b>' + esc(s.name) + ':</b> ' + esc(s.why);
  saveCurrent();
  renderWrite();
};

function addChord(c, rn = '') {
  const at = sel >= 0 && sel < prog.items.length ? sel + 1 : prog.items.length;
  prog.items.splice(at, 0, { chord: c, rn, beats: styleBeats, vi: null });
  sel = at;
  saveCurrent();
  renderWrite();
  audio();
  const v = voicedNotes();
  if (v[at]) sound(v[at], ctx.currentTime + 0.02, { spread: $('tone').value === 'piano' ? 0 : 0.025, dur: 2 });
}

/** The shape each bar uses: the one you picked, or one near the bar before so your hand moves least */
function autoShapes() {
  let prevPos = null;
  return prog.items.map(it => {
    const list = voicings(it.chord);
    if (!list.length) return { list, v: null };
    let v = it.vi != null && list[it.vi] ? list[it.vi] : null;
    if (!v) {
      let best = 1e9;
      for (const x of list.slice(0, 8)) {
        const cost = x.score + (prevPos == null ? 0 : 0.35 * Math.abs(x.pos - prevPos));
        if (cost < best) { best = cost; v = x; }
      }
    }
    prevPos = v.pos;
    return { list, v };
  });
}
/** The notes each bar plays: the shape on the strings, or a smooth piano voicing */
function voicedNotes() {
  if ($('tone').value === 'piano') {
    let prev = null;
    return prog.items.map(it => { const p = pianoVoicing(it.chord, prev); prev = p.rh; return p.notes; });
  }
  const shapes = autoShapes();
  let prev = null;
  return prog.items.map((it, i) => {
    if (shapes[i].v) return shapes[i].v.notes;
    const p = pianoVoicing(it.chord, prev); prev = p.rh; return p.notes;
  });
}
const numeralFor = i => prog.items[i].rn || numeralOf(prog.key, prog.items[i].chord, palette, prog.items[i + 1] && prog.items[i + 1].chord);
const KIND_WORD = { resolve: 'resolves', surprise: 'surprise', strong: 'strong', smooth: 'smooth', step: 'step', leap: 'leap', colour: 'colour' };

function renderWrite() {
  fillKeys();
  const k = prog.key, notes = scaleNotes(k), sg = signature(k);
  const rel = k.mode === 'major' ? numeralChord(k, 'vi') : numeralChord(k, 'bIII');
  $('keyInfo').innerHTML = esc(keyName(k)) + ': ' + notes.map(noteText).join(' ') + '. ' + (sg ? Math.abs(sg) + (sg > 0 ? ' sharp' : ' flat') + (Math.abs(sg) > 1 ? 's' : '') : 'No sharps or flats')
    + '. <span class="term" data-term="relative">Relative ' + (k.mode === 'major' ? 'minor' : 'major') + '</span>: ' + esc(noteText(rel.root) + (k.mode === 'major' ? ' minor' : ' major')) + '.';
  $('mapKey').textContent = keyName(k);
  renderTimeline();
  renderDetail();
  renderMoves();
  renderMap();
  renderMods();
  renderCapo();
  renderSaved();
}

function renderTimeline() {
  const shapes = autoShapes();
  $('timelineEmpty').classList.toggle('hidden', prog.items.length > 0);
  $('timeline').innerHTML = prog.items.map((it, i) => {
    const c = it.chord, sh = shapes[i];
    const rel = i > 0 ? relate(prog.key, prog.items[i - 1].chord, c, palette) : null;
    const shapeName = capo ? chordSymbol(shapeFor(c, capo)) : '';
    const box = sh.v ? chordBox(sh.v, pcOf(c.root)) : '<div class="muted" style="font-size:11px;padding:16px 0">no shape</div>';
    return `<div class="bar-card${i === sel ? ' sel' : ''}" data-i="${i}">
      <span class="idx">${i + 1}</span><span class="beats" title="Beats in this bar">${it.beats} beat${it.beats > 1 ? 's' : ''}</span>
      <div class="nm">${esc(chordSymbol(c))}</div>
      <div class="rn">${esc(numeralFor(i))}</div>
      <div class="why">${rel ? `<span class="kind ${rel.kind}" data-tip="${esc(rel.why)}">${KIND_WORD[rel.kind]}</span>` : '<span class="kind">start</span>'}</div>
      ${box}${shapeName && shapeName !== chordSymbol(c) ? `<div class="muted" style="font-size:11px">${esc(shapeName)} shape</div>` : ''}
      <div class="tools2"><button data-act="left" title="Move left">&lsaquo;</button><button data-act="beats" title="Change how many beats">&#9833;</button><button data-act="right" title="Move right">&rsaquo;</button><button data-act="del" title="Remove">&times;</button></div>
    </div>`;
  }).join('');
}
$('timeline').onclick = e => {
  const card = e.target.closest('.bar-card');
  if (!card) return;
  const i = +card.dataset.i, act = e.target.closest('button') && e.target.closest('button').dataset.act;
  if (act === 'del') { prog.items.splice(i, 1); sel = Math.min(sel, prog.items.length - 1); }
  else if (act === 'left' && i > 0) { [prog.items[i - 1], prog.items[i]] = [prog.items[i], prog.items[i - 1]]; sel = i - 1; }
  else if (act === 'right' && i < prog.items.length - 1) { [prog.items[i + 1], prog.items[i]] = [prog.items[i], prog.items[i + 1]]; sel = i + 1; }
  else if (act === 'beats') { const order = [4, 2, 1, 8, 3]; prog.items[i].beats = order[(order.indexOf(prog.items[i].beats) + 1) % order.length]; sel = i; }
  else if (!act) {
    sel = sel === i ? -1 : i;
    if (sel >= 0 && phone.matches) setProgTab('bar');
    if (sel >= 0) { audio(); sound(voicedNotes()[i], ctx.currentTime + 0.02, { spread: $('tone').value === 'piano' ? 0 : 0.025, dur: 2 }); }
  }
  saveCurrent();
  renderTimeline(); renderDetail(); renderMoves(); renderCapo();
};

function renderDetail() {
  const box = $('detail');
  const idle = sel < 0 || !prog.items[sel];
  $('sidePanel').classList.toggle('idle', idle && !$('styleWhy').textContent);
  if (idle) {
    box.innerHTML = '<h2>This bar</h2><div class="muted">' + (prog.items.length ? 'Tap a bar in your progression to see it up close: its notes, what it does, why it works after the chord before, and other shapes to play it with.'
      : 'Build a progression first: start from a style, or tap chords in Next chord or Key map. Then tap a bar to see it up close here.') + '</div>'
      + '<div class="hint">' + $('keyInfo').innerHTML + '</div>';
    return;
  }
  const it = prog.items[sel], c = it.chord, tones = chordTones(c), shapes = autoShapes()[sel];
  const entry = palette.all.find(e => pcOf(e.chord.root) === pcOf(c.root) && e.chord.type === c.type);
  const rel = sel > 0 ? relate(prog.key, prog.items[sel - 1].chord, c, palette) : null;
  let html = `<div><div class="muted">Bar ${sel + 1}</div><div class="big" style="font-size:38px">${esc(chordSymbol(c))}</div>
    <div class="rn" style="font-family:var(--family-mono);color:var(--soft);font-size:13px">${esc(numeralFor(sel))} in ${esc(keyName(prog.key))}</div>
    <div class="formula">${tones.map(x => `<div class="tone${x.d === '1' ? ' root' : ''}"><b>${esc(noteText(x.note))}</b><span>${esc(x.d)}</span></div>`).join('')}</div>`;
  if (entry) html += `<p class="explain"><b>What it does:</b> ${esc(entry.why)}</p>`;
  if (rel) html += `<p class="explain"><b>Why ${esc(chordSymbol(prog.items[sel - 1].chord))} to ${esc(chordSymbol(c))}?</b> <span class="kind ${rel.kind}">${KIND_WORD[rel.kind]}</span>${esc(rel.why)}</p>`;
  const odd = soundsAs(c.root);
  if (odd) html += `<p class="explain">${esc(noteText(c.root))} is the theory-book spelling here; it sounds the same as ${esc(odd)}.</p>`;
  html += `<div class="row" style="margin-top:8px"><button class="small primary" data-dact="hear">Hear it</button><button class="small" data-dact="shapes">Open in Name it</button></div></div>`;
  html += `<div class="sect"><h3>Shapes on ${esc(instrument.name.toLowerCase())}${capo ? ' (capo ' + capo + ')' : ''}</h3><div class="shapes">`
    + (shapes.list.slice(0, 8).map((v, i) => `<button class="shape${shapes.v === v ? ' on' : ''}" data-vi="${i}">${chordBox(v, pcOf(c.root))}<div class="cap">${esc(shapeText(v.frets))}</div></button>`).join('') || '<div class="empty">No comfortable shape here.</div>')
    + `</div><h3 style="margin-top:10px">On piano</h3><div class="scroller piano"><svg id="detailPiano"></svg></div></div>`;
  box.innerHTML = html;
  let prev = null;
  for (let i = 0; i < sel; i++) prev = pianoVoicing(prog.items[i].chord, prev).rh;
  const pv = pianoVoicing(c, prev), on = new Map();
  for (const m of pv.notes) { const x = tones.find(y => y.pc === mod12(m)); on.set(m, { label: x ? noteText(x.note) : noteText(c.bass || plainNote(m)), root: mod12(m) === pcOf(c.root) }); }
  drawPiano($('detailPiano'), 36, 84, on, true);
}
$('detail').onclick = e => {
  const b = e.target.closest('button');
  if (!b || sel < 0) return;
  if (b.dataset.vi != null) { prog.items[sel].vi = +b.dataset.vi; saveCurrent(); renderTimeline(); renderDetail(); hear(autoShapes()[sel].v.notes); return; }
  if (b.dataset.dact === 'hear') hear(voicedNotes()[sel], $('tone').value !== 'piano');
  if (b.dataset.dact === 'shapes') {
    const c = prog.items[sel].chord;
    setTab('name');
    setInput('neck');
    setLookup(c);
    const v = voicings(c)[0];
    if (v) { fretState = v.frets.map(f => f < 0 ? -1 : f === 0 ? 0 : f + capo); source = 'fret'; analyse(); }
  }
};

function chip(e, extraTip = '') {
  let tip = e.why + extraTip;
  if (e.alias) tip += ' (In theory books: ' + e.alias + '.)';
  const odd = soundsAs(e.chord.root);
  if (odd) tip += ' (' + noteText(e.chord.root) + ' sounds the same as ' + odd + '.)';
  return `<button class="chip fn-${e.fn || 'x'}" data-rn="${esc(e.label)}" data-sym="${esc(chordSymbol(e.chord))}" data-tip="${esc(tip)}" data-tip-title="${esc(e.label + ': ' + chordSymbol(e.chord))}"><span class="rn">${esc(e.label)}</span><span class="nm">${esc(chordSymbol(e.chord))}</span></button>`;
}
const GROUP_TERM = { secondary: 'secondary', borrowed: 'borrowed', spice: null, diatonic: 'key', sevenths: 'seventh' };
function renderMap() {
  $('groups').innerHTML = palette.groups.map(g => `<div class="group"><div><h3>${GROUP_TERM[g.id] ? `<span class="term" data-term="${GROUP_TERM[g.id]}">${esc(g.title)}</span>` : esc(g.title)}</h3>
    <div class="gb">${esc(g.blurb)}${g.id === 'spice' ? ' Read more: <span class="term" data-term="neapolitan">Neapolitan</span>, <span class="term" data-term="secdim">secondary diminished</span>, <span class="term" data-term="tritonesub">tritone substitution</span>.' : ''}</div></div>
    <div class="chips">${g.items.map(e => chip(e)).join('')}</div></div>`).join('');
}
function chipChord(b) {
  const e = palette.all.find(x => x.label === b.dataset.rn && chordSymbol(x.chord) === b.dataset.sym);
  return e ? { c: e.chord, rn: e.label } : null;
}
/** The key map's one explanation area: the chord you last pointed at or added */
function mapInfo(b) { $('mapInfo').innerHTML = '<b>' + esc(b.dataset.tipTitle || '') + '</b> ' + esc(b.dataset.tip || ''); }
for (const ev of ['pointerover', 'focusin']) $('groups').addEventListener(ev, e => { const b = e.target.closest('.chip'); if (b) mapInfo(b); });
for (const id of ['groups', 'moves', 'mods']) $(id).addEventListener('click', e => {
  const b = e.target.closest('.chip');
  if (b) { const x = chipChord(b) || modChord(b); if (x) { addChord(x.c, x.rn); if (id === 'groups') mapInfo(b); } return; }
  const r = e.target.closest('[data-route]');
  if (r) {
    const m = modulations(prog.key)[+r.dataset.route];
    for (const c of m.route) addChord(c, '');
    toast('Added the way to ' + m.name + '. Change the key at the top to keep writing there.');
  }
});
function modChord(b) {
  if (!b.dataset.mod) return null;
  const [i, j] = b.dataset.mod.split(':').map(Number);
  return { c: modulations(prog.key)[i].route[j], rn: '' };
}

function renderMoves() {
  const from = sel >= 0 ? prog.items[sel] : prog.items[prog.items.length - 1];
  if (!from) {
    $('nextTitle').textContent = 'Where to start?';
    $('nextSub').innerHTML = 'Most songs start at home (<span class="term" data-term="tonic">the tonic</span>). Tap it, then follow the suggestions.';
    const home = palette.all.filter(e => e.group === 'diatonic');
    $('moves').innerHTML = `<div class="chips">${home.map(e => chip(e)).join('')}</div>`;
    return;
  }
  const i = sel >= 0 ? sel : prog.items.length - 1;
  $('nextTitle').textContent = 'Where can ' + chordSymbol(from.chord) + ' go next?';
  $('nextSub').innerHTML = 'From bar ' + (i + 1) + ' (' + esc(numeralFor(i)) + '). Strongest first. Tap one to add it after bar ' + (i + 1) + '. Ranked by <span class="term" data-term="rootmotion">root motion</span>, <span class="term" data-term="common">shared notes</span> and what each chord wants to do.';
  const moves = nextMoves(prog.key, from.chord, 8, palette);
  $('moves').innerHTML = moves.map(m => `<div class="move">${chip(m.entry)}<p><span class="kind ${m.kind}">${KIND_WORD[m.kind]}</span>${esc(m.why)}</p></div>`).join('');
}

function renderMods() {
  const mods = modulations(prog.key);
  $('mods').innerHTML = mods.map((m, i) => `<div class="capoRow modRow"><div style="min-width:0;flex:1 1 300px"><b>To ${esc(m.name)}</b> <span class="muted">(${esc(m.what)})</span>
      <div class="chips">${m.route.map((c, j) => `<button class="chip fn-${j === 0 ? 'S' : j === 1 ? 'D' : 'T'}" data-mod="${i}:${j}" data-tip="${esc(m.why)}"><span class="rn">${j === 0 ? esc(m.pivot.here + ' = ' + m.pivot.there) : j === 1 ? 'V7 there' : 'new home'}</span><span class="nm">${esc(chordSymbol(c))}</span></button>`).join('')}</div>
      <div class="why2">${esc(m.why)}</div></div>
      <button class="small" data-route="${i}">Add all three</button></div>`).join('');
}

function renderCapo() {
  const box = $('capoList');
  if (!prog.items.length) { box.innerHTML = '<div class="empty">Add some chords first.</div>'; return; }
  const opts = capoOptions(prog.items.map(it => it.chord), courses, 7).slice(0, 4);
  box.innerHTML = opts.map(o => `<div class="capoRow"><div><b>${o.capo ? 'Capo ' + o.capo : 'No capo'}</b>: play ${esc([...new Set(o.all.map(chordSymbol))].join(' '))}</div>
    ${o.capo === capo ? '<span class="muted">in use</span>' : `<button class="small" data-capo="${o.capo}">Use this</button>`}</div>`).join('')
    + '<div class="muted" style="margin-top:6px">Easiest first (open shapes near the nut count as easy). It sounds the same either way; the shapes on each bar follow the capo you pick.</div>';
}
$('capoList').onclick = e => {
  const b = e.target.closest('[data-capo]');
  if (!b) return;
  $('capo').value = b.dataset.capo;
  $('capo').onchange();
  toast('Capo on fret ' + b.dataset.capo + '. The shapes in each bar now use it.');
};

// saving, the chart
const savedList = () => { try { return JSON.parse(store.get('saved', '[]')) || []; } catch { return []; } };
function renderSaved() {
  const list = savedList();
  if (!$('progName').value && prog.name) $('progName').value = prog.name;
  $('savedList').innerHTML = list.length ? list.map((s, i) => {
    const p = loadProg(s);
    return p ? `<div class="savedRow"><div><b>${esc(p.name || 'Untitled')}</b> <span class="muted">${esc(keyName(p.key))}, ${p.items.length} bars</span></div><div class="row"><button class="small" data-load="${i}">Open</button><button class="small" data-delsaved="${i}">Delete</button></div></div>` : '';
  }).join('') : '<div class="muted">Saved progressions stay in this browser.</div>';
}
$('saveBtn').onclick = () => {
  prog.name = $('progName').value.trim() || 'Untitled';
  const list = savedList().filter(s => (loadProg(s) || {}).name !== prog.name);
  list.unshift(JSON.parse(serial(prog)));
  store.set('saved', JSON.stringify(list.slice(0, 50)));
  saveCurrent();
  renderSaved();
  toast('Saved "' + prog.name + '"');
};
$('savedList').onclick = e => {
  const l = e.target.closest('[data-load]'), d = e.target.closest('[data-delsaved]');
  const list = savedList();
  if (l) { const p = loadProg(list[+l.dataset.load]); if (p) { stopPlay(); prog = p; palette = keyPalette(p.key); sel = -1; $('tempo').value = p.tempo; $('progName').value = p.name; saveCurrent(); renderWrite(); } }
  if (d) { list.splice(+d.dataset.delsaved, 1); store.set('saved', JSON.stringify(list)); renderSaved(); }
};
const chart = () => chartText({ name: $('progName').value.trim() || prog.name || 'Progression', key: prog.key, items: prog.items, tempo: prog.tempo })
  + (capo ? '\n\nCapo ' + capo + ': play ' + prog.items.map(it => chordSymbol(shapeFor(it.chord, capo))).join(' ') : '');
$('copyChart').onclick = async () => {
  const text = chart();
  $('chartPre').textContent = text;
  $('chartPre').classList.remove('hidden');
  try { await navigator.clipboard.writeText(text); toast('Chord chart copied'); } catch { toast('Here it is below: select it to copy'); }
};
$('dlChart').onclick = () => {
  const text = chart(), a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  a.download = ($('progName').value.trim() || 'progression').replace(/[^\w\- ]+/g, '') + '.txt';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};

// ---- playing the progression: a look-ahead scheduler on the audio clock

let playing = null;
$('playBtn').onclick = () => { if (playing) stopPlay(); else startPlay(); };
/** Every hit in one pass of the progression: times in beats */
function buildEvents() {
  const rhythm = $('rhythm').value, notes = voicedNotes(), events = [], starts = [];
  let t = 0, bassFlip = 0;
  prog.items.forEach((it, i) => {
    starts.push(t);
    const n = notes[i] || [], low = n[0], up = n.slice(1);
    const fifth = n.find(m => mod12(m - pcOf(it.chord.bass || it.chord.root)) === 7 && m < (low + 12)) ?? (low != null ? low - 5 : null);
    for (let b = 0; b < it.beats; b++) {
      if (rhythm === 'hold') { if (b === 0) events.push({ t, notes: n, spread: 0.03, gain: 1, dur: it.beats }); }
      else if (rhythm === 'oompah') {
        if (b % 2 === 0) { events.push({ t: t + b, notes: [bassFlip % 2 && fifth != null ? fifth : low], spread: 0, gain: 1.1, dur: 0.9 }); bassFlip++; }
        else events.push({ t: t + b, notes: up, spread: 0.005, gain: 0.75, dur: 0.4 });
      } else events.push({ t: t + b, notes: n, spread: 0.018, gain: b === 0 ? 1 : 0.72, dur: 1 });
    }
    t += it.beats;
  });
  return { events, starts, total: t };
}
function startPlay() {
  if (!prog.items.length) return;
  audio();
  const spb = 60 / prog.tempo;
  const pass = buildEvents();
  // make every note's sound before the first beat, so nothing stutters
  for (const e of pass.events) for (const m of e.notes) if (m != null) noteBuffer($('tone').value, m);
  playing = { pass, spb, start: ctx.currentTime + 0.12, next: 0, offset: 0 };
  $('playBtn').textContent = 'Stop';
  playing.timer = setInterval(schedule, 25);
  schedule();
  playing.raf = requestAnimationFrame(follow);
}
function schedule() {
  const p = playing;
  if (!p) return;
  const horizon = ctx.currentTime + 0.15, kind = $('tone').value;
  while (true) {
    if (p.next >= p.pass.events.length) {
      if (!$('loop').checked) { if (ctx.currentTime > p.start + (p.offset + p.pass.total) * p.spb) stopPlay(); return; }
      p.offset += p.pass.total;
      p.pass = buildEvents();
      p.next = 0;
      if (!p.pass.events.length) { stopPlay(); return; }
    }
    const e = p.pass.events[p.next], when = p.start + (p.offset + e.t) * p.spb;
    if (when > horizon) return;
    const ns = e.notes.filter(m => m != null);
    if (ns.length) sound(ns, Math.max(when, ctx.currentTime), { spread: kind === 'piano' ? 0 : e.spread, gain: e.gain, dur: e.dur * p.spb + (kind === 'piano' ? 0.1 : 0.05), kind });
    p.next++;
  }
}
function follow() {
  const p = playing;
  if (!p) return;
  const beat = (ctx.currentTime - p.start) / p.spb - p.offset;
  let idx = -1;
  p.pass.starts.forEach((s, i) => { if (beat >= s) idx = i; });
  document.querySelectorAll('.bar-card').forEach((el, i) => el.classList.toggle('now', i === idx && beat >= 0));
  p.raf = requestAnimationFrame(follow);
}
function stopPlay() {
  if (!playing) return;
  clearInterval(playing.timer);
  cancelAnimationFrame(playing.raf);
  playing = null;
  $('playBtn').textContent = 'Play';
  document.querySelectorAll('.bar-card.now').forEach(el => el.classList.remove('now'));
  if (master) { const now = ctx.currentTime; master.gain.cancelScheduledValues(now); master.gain.setValueAtTime(master.gain.value, now); master.gain.setTargetAtTime(0, now, 0.03); master.gain.setTargetAtTime(vol(), now + 0.25, 0.01); }
}
function restartPlay() { stopPlay(); startPlay(); }

// ---- quiz

let quizKind = 'numeral', quiz = null, quizRight = 0, quizTotal = 0;
$('quizSeg').onclick = e => { const b = e.target.closest('button'); if (!b) return; quizKind = b.dataset.v; for (const x of $('quizSeg').children) x.classList.toggle('on', x === b); newQuestion(); };
function newQuestion() {
  quiz = quizQuestion(quizKind);
  quiz.done = false;
  $('quizQ').textContent = quiz.prompt;
  $('quizOpts').innerHTML = quiz.options.map((o, i) => `<button data-i="${i}">${esc(o)}</button>`).join('');
  $('quizWhy').textContent = '';
}
$('quizOpts').onclick = e => {
  const b = e.target.closest('button');
  if (!b || quiz.done) return;
  quiz.done = true;
  quizTotal++;
  const i = +b.dataset.i, ok = i === quiz.answer;
  if (ok) quizRight++;
  [...$('quizOpts').children].forEach((x, k) => { if (k === quiz.answer) x.classList.add('right'); else if (k === i) x.classList.add('wrong'); });
  $('quizWhy').textContent = (ok ? 'Right. ' : 'Not quite. ') + quiz.explain;
  $('quizScore').textContent = quizRight + ' right of ' + quizTotal;
  hear(pianoVoicing(quiz.chord).notes, false);
};
$('quizNext').onclick = newQuestion;
$('quizHear').onclick = () => quiz && hear(pianoVoicing(quiz.chord).notes, false);

// ---- tabs, the explanation bubble, toasts

const VIEWS = { name: 'nameView', shapes: 'shapesView', write: 'writeView', quiz: 'quizView' };
function setTab(t) {
  if (!VIEWS[t]) t = 'name';
  store.set('tab', t);
  selectTab($('mainTabs'), t);
  for (const [v, id] of Object.entries(VIEWS)) $(id).classList.toggle('hidden', v !== t);
  $('instrumentControls').classList.toggle('hidden', t === 'quiz');
  if (t === 'quiz' && !quiz) newQuestion();
  if (t === 'shapes') centerScroll($('luPiano').parentElement);
  hidePop();
}
/** Marks one tab of a tablist selected (aria-selected, and only it in the Tab order) */
function selectTab(list, v) {
  for (const b of list.querySelectorAll('[role=tab]')) {
    const on = b.dataset.v === v;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
    b.tabIndex = on ? 0 : -1;
  }
}
/** Click, or arrow keys / Home / End, to move between tabs */
function tabKeys(list, pick) {
  list.addEventListener('click', e => { const b = e.target.closest('[role=tab]'); if (b) pick(b.dataset.v); });
  list.addEventListener('keydown', e => {
    const tabs = [...list.querySelectorAll('[role=tab]')], i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    const j = e.key === 'ArrowRight' ? (i + 1) % tabs.length : e.key === 'ArrowLeft' ? (i - 1 + tabs.length) % tabs.length : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -1;
    if (j < 0) return;
    e.preventDefault();
    pick(tabs[j].dataset.v);
    tabs[j].focus();
  });
}
tabKeys($('mainTabs'), setTab);

const phone = matchMedia('(max-width: 760px)');
const PROG_TABS = { bar: 'sidePanel', next: 'ptNext', map: 'ptMap', mods: 'ptMods', capo: 'ptCapo', save: 'ptSave' };
function setProgTab(t) {
  if (!PROG_TABS[t] || (t === 'bar' && !phone.matches)) t = 'next';
  store.set('progTab', t);
  selectTab($('progTabs'), t);
  for (const [v, id] of Object.entries(PROG_TABS)) $(id).classList.toggle('show', v === t);
  hidePop();
}
tabKeys($('progTabs'), setProgTab);

// the small menus: sound and frets, and About
function toggleMenu(btn, box, open = box.classList.contains('hidden')) {
  box.classList.toggle('hidden', !open);
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
}
$('moreBtn').onclick = () => toggleMenu($('moreBtn'), $('moreMenu'));
$('aboutBtn').onclick = () => { toggleMenu($('aboutBtn'), $('about')); store.set('about', $('about').classList.contains('hidden') ? '0' : '1'); };
document.addEventListener('pointerdown', e => { if (!$('moreMenu').classList.contains('hidden') && !e.target.closest('.popWrap')) toggleMenu($('moreBtn'), $('moreMenu'), false); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('moreMenu').classList.contains('hidden')) { toggleMenu($('moreBtn'), $('moreMenu'), false); $('moreBtn').focus(); } });

const pop = $('pop');
let popFor = null;
function showPop(el) {
  let title = '', text = '';
  if (el.dataset.term && GLOSSARY[el.dataset.term]) [title, text] = GLOSSARY[el.dataset.term];
  else { title = el.dataset.tipTitle || ''; text = el.dataset.tip || ''; }
  if (!text) return;
  pop.innerHTML = (title ? '<b>' + esc(title) + '</b>' : '') + esc(text);
  pop.classList.remove('hidden');
  const r = el.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight;
  let x = Math.min(Math.max(12, r.left + r.width / 2 - pw / 2), window.innerWidth - pw - 12);
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
  if (el) { if (popFor === el) hidePop(); else showPop(el); return; }
  if (popFor && !(e.pointerType === 'mouse')) hidePop();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') hidePop(); });
// inner panels scroll too, so listen in the capture phase
document.addEventListener('scroll', () => { if (popFor) hidePop(); }, { passive: true, capture: true });

let toastTimer = 0;
function toast(text) {
  $('toast').textContent = text;
  $('toast').classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.add('hidden'), 2200);
}

function everything() { analyse(); renderLookup(); renderWrite(); }
everything();
setInput(inputView);
setProgTab(store.get('progTab', 'next'));
setTab(store.get('tab', 'name'));
if (store.get('about', '0') === '1') toggleMenu($('aboutBtn'), $('about'), true);
// the keyboards open on the octaves around middle C (they scroll sideways on a narrow screen)
for (const id of ['piano', 'luPiano']) centerScroll($(id).parentElement);
// a link straight to a chord's shapes: chords.html?chord=Am7 (Scales links its chords here)
{
  const q = new URLSearchParams(location.search).get('chord'), c = q && parseChord(q);
  if (c && TYPE[c.type]) { setLookup(c); setTab('shapes'); }
}
