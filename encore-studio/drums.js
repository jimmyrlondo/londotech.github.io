// ENCORE. Drums: the page. Song strip, grid editor, tabs, playback and exports. The logic lives in drums-core.js.
import * as D from './drums-core.js';
import { PATTERNS, STYLES, SECTION_TYPES, FILL_STYLES } from './drums-patterns.js';
import { DRUM_KITS, laneSounds, kitFiles } from './drums-kit.js';
import { encodeWav } from './beatpad-core.js';

const $ = id => document.getElementById(id);
const STORE = 'encore-drums-v1';
const LANE_COLOR = { crash: '#eab308', china: '#eab308', ride: '#eab308', bell: '#eab308', openhat: '#22d3ee', hat: '#22d3ee', pedal: '#22d3ee',
  tom1: '#22c55e', tom2: '#22c55e', tom3: '#22c55e', snare: '#ff3b00', stick: '#ff6e28', kick: '#f2efe8' };
const SEC_COLORS = ['#ff3b00', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#ec4899', '#14b8a6', '#f97316'];

// ---------------- state

function loadSaved() {
  try { const t = localStorage.getItem(STORE); return t ? D.cleanProject(JSON.parse(t)) : null; } catch { return null; }
}
let project = loadSaved() || D.demoProject();
let selPos = 0, selId = project.order[0] || project.sections[0].id;
let view = 'groove', brush = 100, libStyle = 'metal', lastFile = null;
const undoStack = [], redoStack = [];

const sec = () => project.sections.find(s => s.id === selId) || project.sections[0];
let saveTimer = 0;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { try { localStorage.setItem(STORE, JSON.stringify(project)); } catch {} }, 250);
}
function snapshot() {
  undoStack.push(JSON.stringify({ project, selId, selPos }));
  if (undoStack.length > 80) undoStack.shift();
  redoStack.length = 0;
}
/** Change something: an undo step, then fn (which edits `project` or returns a new one), then save and redraw */
function change(fn, { rerender = true } = {}) {
  snapshot();
  const r = fn();
  if (r) project = r;
  afterChange(rerender);
}
function afterChange(rerender = true) {
  if (!project.sections.some(s => s.id === selId)) selId = project.order[0] || project.sections[0].id;
  if (selPos >= project.order.length) selPos = Math.max(0, project.order.length - 1);
  save(); render();
  if (rerender) refreshPlaying();
}
function restore(stackFrom, stackTo) {
  if (!stackFrom.length) return;
  stackTo.push(JSON.stringify({ project, selId, selPos }));
  const s = JSON.parse(stackFrom.pop());
  project = s.project; selId = s.selId; selPos = s.selPos;
  afterChange();
}
const undo = () => restore(undoStack, redoStack);
const redo = () => restore(redoStack, undoStack);
const replaceSec = s2 => { project.sections = project.sections.map(s => s.id === s2.id ? s2 : s); };

// ---------------- audio

let ctx = null, master = null, play = null, raf = 0;
const soundCache = new Map();
function audio() {
  if (!ctx) {
    ctx = new AudioContext({ latencyHint: 'interactive' });
    master = ctx.createGain(); master.gain.value = +$('vol').value; master.connect(ctx.destination);
  }
  return ctx;
}
async function kitSounds(id) {
  const sr = audio().sampleRate, key = id + '@' + sr;
  if (!soundCache.has(key)) {
    soundCache.set(key, (async () => {
      const kit = DRUM_KITS.find(k => k.id === id) || DRUM_KITS[0];
      const files = {};
      if (kit.url) {
        await Promise.all(kitFiles(kit).map(async f => {
          try {
            const res = await fetch(kit.url + f);
            if (!res.ok) return;
            const b = await audio().decodeAudioData(await res.arrayBuffer());
            const x = new Float32Array(b.length);
            for (let c = 0; c < b.numberOfChannels; c++) { const d = b.getChannelData(c); for (let i = 0; i < x.length; i++) x[i] += d[i] / b.numberOfChannels; }
            files[f] = x;
          } catch {}
        }));
      }
      return laneSounds(kit.id, sr, files);
    })());
  }
  return soundCache.get(key);
}

/** Render a list of sections to stereo samples (the player and the exports share this) */
async function renderPcm(order, loop = false) {
  const song = D.buildSong(project, order), hits = D.humanize(song, project.feel), timing = D.songTiming(song);
  const sr = audio().sampleRate, sounds = await kitSounds(project.kit);
  if (!loop) { const m = D.mixdown(hits, sounds, sr, { length: timing.length + 2 }); return { ...m, n: m.l.length, sr, song, timing, hits }; }
  // a loop: whatever rings past the end wraps round onto the start, so it loops without a gap or a cut
  const m = D.mixdown(hits, sounds, sr, { length: timing.length + 2.5 }), n = Math.max(1, Math.round(timing.length * sr));
  const l = m.l.slice(0, n), r = m.r.slice(0, n);
  for (let i = n; i < m.l.length; i++) { l[i % n] += m.l[i]; r[i % n] += m.r[i]; }
  return { l, r, n, sr, song, timing, hits };
}

function position() {
  if (!play) return 0;
  let p = ctx.currentTime - play.t0 + play.offset;
  if (play.loop) p %= play.timing.length || 1;
  return p;
}

async function start(mode, offset = 0) {
  const ac = audio();
  try { await ac.resume(); } catch {}
  const order = mode === 'song' ? project.order : [selId];
  if (!order.length) { setStatus('Add a section to the song first.'); return; }
  const token = {}; startToken = token;
  const r = await renderPcm(order, mode === 'section');
  if (startToken !== token) return;
  stopSource();
  const buf = ac.createBuffer(2, r.n, r.sr);
  buf.copyToChannel(r.l, 0); buf.copyToChannel(r.r, 1);
  const src = ac.createBufferSource();
  src.buffer = buf; src.connect(master);
  const loop = mode === 'section';
  if (loop) { src.loop = true; src.loopStart = 0; src.loopEnd = r.n / r.sr; }
  offset = loop ? offset % (r.timing.length || 1) : Math.min(offset, r.timing.length);
  src.start(0, offset);
  play = { mode, src, t0: ac.currentTime, offset, loop, timing: r.timing, song: r.song, order: order.slice() };
  src.onended = () => { if (play && play.src === src) stop(); };
  cancelAnimationFrame(raf); raf = requestAnimationFrame(tick);
  renderTransport();
}
let startToken = null, refreshTimer = 0;
function stopSource() { if (play?.src) { try { play.src.onended = null; play.src.stop(); } catch {} } }
function stop() {
  startToken = null; stopSource(); play = null;
  cancelAnimationFrame(raf);
  renderTransport(); drawGrid(); renderStripHead();
}
/** After an edit while playing: render again and carry on from the same spot */
function refreshPlaying() {
  if (!play) return;
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => { if (play) start(play.mode, position()); }, 140);
}
function tick() {
  if (!play) return;
  renderStripHead(); drawGrid();
  const p = position();
  $('pos').textContent = clock(p) + ' / ' + clock(play.timing.length);
  raf = requestAnimationFrame(tick);
}
const clock = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');

/** Hear one drum (clicking a name, or painting a hit) */
async function audition(lane, vel = 100) {
  if (play) return;
  const ac = audio();
  try { await ac.resume(); } catch {}
  const s = (await kitSounds(project.kit))[lane];
  if (!s) return;
  const b = ac.createBuffer(1, s.data.length, ac.sampleRate); b.copyToChannel(s.data, 0);
  const src = ac.createBufferSource(), g = ac.createGain();
  src.buffer = b; src.playbackRate.value = s.rate; g.gain.value = D.velGain(vel) * (s.gain ?? 1) * 0.8;
  src.connect(g); g.connect(master); src.start();
}

// ---------------- rendering

function render() {
  renderStrip(); renderSectionForm(); renderLibrary(); renderFeel(); renderExport(); renderGridHead(); drawGrid(); renderTransport();
  $('songName').value = project.name;
}

function renderTransport() {
  $('playSong').textContent = play?.mode === 'song' ? 'Restart song' : 'Play song';
  $('stop').disabled = !play;
  $('playSec').classList.toggle('on', play?.mode === 'section');
  $('undo').disabled = !undoStack.length; $('redo').disabled = !redoStack.length;
  if (!play) { const t = D.songTiming(D.buildSong(project)); $('pos').textContent = '0:00 / ' + clock(t.length); }
}

function renderStrip() {
  const song = D.buildSong(project), t = D.songTiming(song), strip = $('strip');
  const avail = Math.max(200, strip.clientWidth - 4 * project.order.length);
  const pps = t.length ? Math.max(avail / t.length, 1) : 1;
  strip.textContent = '';
  t.spans.forEach((sp, i) => {
    const s = project.sections.find(x => x.id === sp.id);
    const b = document.createElement('button');
    b.className = 'block' + (i === selPos ? ' on' : '');
    b.dataset.pos = i;
    b.style.width = Math.max(56, Math.floor((sp.end - sp.start) * pps)) + 'px';
    b.title = `${s.name}: ${s.bars} bars of ${s.num}/${s.den} at ${tempoText(s)}`;
    b.innerHTML = `<i style="background:${SEC_COLORS[s.color % 8]}"></i><b></b><small>${s.bars} × ${s.num}/${s.den}</small><span class="ph"></span>`;
    b.querySelector('b').textContent = s.name;
    strip.append(b);
  });
  if (!project.order.length) { const p = document.createElement('span'); p.className = 'tip'; p.textContent = 'The song is empty. Add a section below.'; strip.append(p); }
  const pick = $('addPick'), keep = pick.value;
  pick.textContent = '';
  for (const s of project.sections) pick.add(new Option(s.name, s.id));
  pick.value = project.sections.some(s => s.id === keep) ? keep : selId;
  $('moveL').disabled = selPos <= 0 || !project.order.length;
  $('moveR').disabled = selPos >= project.order.length - 1;
  $('removeBtn').disabled = !project.order.length;
  renderStripHead();
}
function renderStripHead() {
  const blocks = $('strip').querySelectorAll('.block');
  blocks.forEach(b => b.classList.remove('playing'));
  if (!play) return;
  const p = position(), spans = play.timing.spans;
  let i = spans.findIndex(sp => p >= sp.start && p < sp.end);
  if (i < 0) return;
  const b = play.mode === 'song' ? blocks[i] : blocks[selPos];
  if (!b || (play.mode === 'section' && project.order[selPos] !== selId)) return;
  const sp = play.mode === 'song' ? spans[i] : spans[0];
  b.classList.add('playing');
  b.querySelector('.ph').style.left = ((p - sp.start) / (sp.end - sp.start) * 100) + '%';
}
const tempoText = s => s.bpmEnd && s.bpmEnd !== s.bpm ? `${Math.round(s.bpm)} to ${Math.round(s.bpmEnd)} BPM` : `${Math.round(s.bpm)} BPM`;

function renderGridHead() {
  const s = sec();
  $('secTitle').textContent = s.name;
  $('secMeta').textContent = `${s.num}/${s.den} · ${tempoText(s)} · ${D.DIVS.find(d => d.id === s.div)?.name || ''}`;
  const hasFill = D.fillSteps(s) > 0;
  if (!hasFill && view === 'fill') view = 'groove';
  $('view').querySelector('[data-view=fill]').disabled = !hasFill;
  $('view').querySelector('[data-view=fill]').title = hasFill ? 'Edit the fill' : 'Turn on "Fill at the end" in the Section tab first';
  $('view').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.view === view));
  $('brush').querySelectorAll('button').forEach(b => b.classList.toggle('on', +b.dataset.vel === brush));
  $('gridTip').textContent = view === 'fill'
    ? `The fill: the last ${s.fill.beats >= s.num ? 'bar' : s.fill.beats + (s.fill.beats === 1 ? ' beat' : ' beats')} of the section. "New fill" in the Section tab makes another.`
    : 'Click or drag to paint hits with the brush. Click a hit again to remove it. Brighter means harder.';
}

// ---- the grid canvas

const cv = $('grid'), g2 = cv.getContext('2d');
let geo = null, cursor = { lane: 10, step: 0 }, cursorShown = false;
function gridData() {
  const s = sec();
  if (view === 'fill' && s.fill.grid) return { s, grid: s.fill.grid, n: D.fillSteps(s), offset: D.stepsPerBar(s.num, s.den, s.div) - D.fillSteps(s) };
  return { s, grid: s.grid, n: s.patBars * D.stepsPerBar(s.num, s.den, s.div), offset: 0 };
}
function drawGrid() {
  const { s, grid, n, offset } = gridData();
  const box = $('gridBox'), phone = innerWidth < 600;
  const labelW = phone ? 76 : 84, rowH = phone ? 21 : 22, headH = 18, minCell = phone ? 16 : 13;
  const avail = Math.max(120, box.clientWidth - labelW - 2);
  const cellW = Math.max(minCell, Math.min(64, avail / n));
  const w = Math.ceil(labelW + cellW * n), h = headH + rowH * D.LANES.length, dpr = devicePixelRatio || 1;
  if (cv.width !== w * dpr || cv.height !== h * dpr) { cv.width = w * dpr; cv.height = h * dpr; cv.style.width = w + 'px'; cv.style.height = h + 'px'; }
  geo = { labelW, rowH, headH, cellW, n, w, h };
  const c = g2;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);
  const spb = D.stepsPerBar(s.num, s.den, s.div), perBeat = s.div / s.den;
  // playhead column
  let playStep = -1;
  if (play) {
    const p = position(), spans = play.timing.spans;
    const i = spans.findIndex(sp => p >= sp.start && p < sp.end);
    const id = i >= 0 ? (play.mode === 'song' ? play.order[i] : selId) : null;
    if (id === s.id) {
      const rel = D.secToTick(p, play.song.tempos) - spans[i].tick, st = D.stepTicks(s.div);
      const g = Math.floor(rel / st), bar = Math.floor(g / spb), inBar = g % spb, fs = D.fillSteps(s);
      const inFill = fs && bar === s.bars - 1 && inBar >= spb - fs;
      if (view === 'groove' && !inFill) playStep = g % n;
      if (view === 'fill' && inFill) playStep = inBar - offset;
    }
  }
  // header: bar and beat numbers
  c.font = '11px "Space Mono", monospace'; c.textBaseline = 'middle';
  for (let i = 0; i < n; i++) {
    const gi = i + offset, x = labelW + i * cellW;
    if (gi % perBeat < 1e-9 || Number.isInteger(gi / perBeat)) {
      const beat = Math.floor((gi % spb) / perBeat) + 1, bar = Math.floor(gi / spb) + 1;
      c.fillStyle = beat === 1 ? '#f2efe8' : '#91887d';
      c.fillText(beat === 1 && view === 'groove' && s.patBars > 1 ? bar + '.' + beat : String(beat), x + 3, headH / 2);
    }
  }
  c.font = (phone ? '11px' : '12px') + ' "DM Sans", system-ui, sans-serif';
  D.LANES.forEach((lane, r) => {
    const y = headH + r * rowH;
    c.fillStyle = r % 2 ? 'rgba(242,239,232,0.025)' : 'rgba(242,239,232,0.05)';
    c.fillRect(0, y, w, rowH);
    c.fillStyle = '#bdb4a9';
    c.fillText(lane.name, 6, y + rowH / 2);
  });
  // beat and bar lines
  for (let i = 0; i <= n; i++) {
    const gi = i + offset, x = Math.round(labelW + i * cellW) + 0.5;
    const isBar = gi % spb === 0, isBeat = Number.isInteger(gi / perBeat);
    if (!isBar && !isBeat && cellW < 10) continue;
    c.strokeStyle = isBar ? 'rgba(242,239,232,0.45)' : isBeat ? 'rgba(242,239,232,0.2)' : 'rgba(242,239,232,0.06)';
    c.beginPath(); c.moveTo(x, headH); c.lineTo(x, h); c.stroke();
  }
  if (playStep >= 0) { c.fillStyle = 'rgba(255,59,0,0.18)'; c.fillRect(labelW + playStep * cellW, headH, cellW, h - headH); }
  // hits
  D.LANES.forEach((lane, r) => {
    const y = headH + r * rowH, row = grid[lane.id];
    for (let i = 0; i < n; i++) {
      const v = row[i], x = labelW + i * cellW;
      if (!v) { if (cellW >= 10) { c.fillStyle = 'rgba(242,239,232,0.10)'; c.fillRect(x + cellW / 2 - 1, y + rowH / 2 - 1, 2, 2); } continue; }
      c.globalAlpha = 0.3 + 0.7 * (v / 127);
      c.fillStyle = LANE_COLOR[lane.id];
      const pad = Math.min(2, cellW * 0.12), hh = v < 50 ? rowH * 0.45 : rowH - 6;
      roundRect(c, x + pad, y + (rowH - hh) / 2, cellW - pad * 2, hh, 3);
      c.globalAlpha = 1;
      if (v >= 115 && cellW >= 9) { c.fillStyle = '#0c0a09'; c.fillRect(x + cellW / 2 - 1.5, y + 5, 3, 3); }
    }
  });
  if (cursorShown && document.activeElement === cv) {
    c.strokeStyle = '#ff3b00'; c.lineWidth = 2;
    c.strokeRect(labelW + cursor.step * cellW + 1, headH + cursor.lane * rowH + 1, cellW - 2, rowH - 2);
    c.lineWidth = 1;
  }
}
function roundRect(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.fill();
}
function cellAt(ev) {
  const r = cv.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
  if (!geo || y < geo.headH || y >= geo.h) return null;
  const lane = Math.floor((y - geo.headH) / geo.rowH);
  if (lane < 0 || lane >= D.LANES.length) return null;
  if (x < geo.labelW) return { lane, step: -1 };
  const step = Math.floor((x - geo.labelW) / geo.cellW);
  return step >= 0 && step < geo.n ? { lane, step } : null;
}
let paint = null;
function setCell(lane, step, value) {
  const { grid } = gridData(), id = D.LANES[lane].id;
  if (grid[id][step] === value) return false;
  grid[id][step] = value;
  return true;
}
cv.addEventListener('pointerdown', ev => {
  if (ev.button !== 0) return;
  const c = cellAt(ev);
  if (!c) return;
  if (c.step < 0) { audition(D.LANES[c.lane].id); return; }
  ev.preventDefault();
  try { cv.setPointerCapture(ev.pointerId); } catch {}
  const { grid } = gridData(), cur = grid[D.LANES[c.lane].id][c.step];
  snapshot();
  paint = { value: cur === brush ? 0 : brush, last: c.lane + ':' + c.step, changed: false };
  cursor = { lane: c.lane, step: c.step };
  paint.changed = setCell(c.lane, c.step, paint.value);
  if (paint.value) audition(D.LANES[c.lane].id, paint.value);
  drawGrid();
});
cv.addEventListener('pointermove', ev => {
  if (!paint) return;
  const c = cellAt(ev);
  if (!c || c.step < 0) return;
  const k = c.lane + ':' + c.step;
  if (k === paint.last) return;
  paint.last = k;
  if (setCell(c.lane, c.step, paint.value)) { paint.changed = true; drawGrid(); }
});
const endPaint = () => {
  if (!paint) return;
  const changed = paint.changed; paint = null;
  if (!changed) undoStack.pop(); // nothing happened: no undo step
  afterChange();
};
cv.addEventListener('pointerup', endPaint);
cv.addEventListener('pointercancel', endPaint);
cv.addEventListener('keydown', ev => {
  const { n } = gridData();
  const mv = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[ev.key];
  if (mv) {
    cursor.lane = Math.max(0, Math.min(D.LANES.length - 1, cursor.lane + mv[0]));
    cursor.step = (cursor.step + mv[1] + n) % n;
    cursorShown = true; ev.preventDefault(); ev.stopPropagation(); drawGrid(); return;
  }
  if (ev.key === 'Enter') {
    ev.preventDefault(); ev.stopPropagation(); cursorShown = true;
    cursor.step = Math.min(cursor.step, n - 1);
    const { grid } = gridData(), cur = grid[D.LANES[cursor.lane].id][cursor.step];
    change(() => { setCell(cursor.lane, cursor.step, cur === brush ? 0 : brush); });
    if (cur !== brush) audition(D.LANES[cursor.lane].id, brush);
  }
});
cv.addEventListener('focus', () => drawGrid());
cv.addEventListener('blur', () => { cursorShown = false; drawGrid(); });

// ---- the section tab

function renderSectionForm() {
  const s = sec();
  $('fName').value = s.name;
  const pick = $('fPick'); pick.textContent = '';
  for (const x of project.sections) pick.add(new Option(x.name, x.id));
  pick.value = s.id;
  $('fBpm').value = Math.round(s.bpm * 100) / 100;
  $('fBpmEnd').value = s.bpmEnd ? Math.round(s.bpmEnd * 100) / 100 : '';
  const div = $('fDiv'); div.textContent = '';
  for (const d of D.DIVS) { const o = new Option(d.name, d.id); o.disabled = !D.gridFits(s.num, s.den, d.id); div.add(o); }
  div.value = s.div;
  $('fNum').value = s.num; $('fDen').value = s.den;
  const pb = $('fPatBars');
  if (![...pb.options].some(o => +o.value === s.patBars)) pb.add(new Option(s.patBars, s.patBars));
  pb.value = s.patBars;
  $('fBars').value = s.bars;
  $('fFill').value = !s.fill.beats ? '0' : s.fill.beats >= s.num ? 'all' : String(s.fill.beats);
  if (![...$('fFill').options].some(o => o.value === $('fFill').value)) $('fFill').value = 'all';
  $('fFillStyle').value = s.fill.style;
  $('newFill').disabled = !D.fillSteps(s);
  $('fCrash').checked = s.crash;
  $('fGhosts').value = s.ghosts;
  $('ghostVal').textContent = s.ghosts ? Math.round(s.ghosts * 100) + '%' : 'off';
  $('delSec').disabled = project.sections.length <= 1;
}
function editSec(fn, opts) { change(() => { const s = fn(structuredClone(sec())); if (s) replaceSec(s); }, opts); }

$('fName').addEventListener('change', e => editSec(s => ({ ...s, name: e.target.value.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 40) || 'Section' })));
$('fPick').addEventListener('change', e => { selId = e.target.value; const p = project.order.indexOf(selId); if (p >= 0) selPos = p; view = 'groove'; render(); if (play?.mode === 'section') refreshPlaying(); });
const num = (el, lo, hi, d) => { const v = +el.value; return Number.isFinite(v) && el.value !== '' ? Math.min(hi, Math.max(lo, v)) : d; };
$('fBpm').addEventListener('change', e => editSec(s => ({ ...s, bpm: num(e.target, 20, 400, s.bpm) })));
$('fBpmEnd').addEventListener('change', e => editSec(s => ({ ...s, bpmEnd: e.target.value === '' ? null : num(e.target, 20, 400, null) })));
$('fDiv').addEventListener('change', e => editSec(s => D.reshapeSection(s, { div: +e.target.value })));
$('fNum').addEventListener('change', e => editSec(s => D.reshapeSection(s, { num: Math.round(num(e.target, 1, 32, s.num)) })));
$('fDen').addEventListener('change', e => editSec(s => D.reshapeSection(s, { den: +e.target.value })));
$('fPatBars').addEventListener('change', e => editSec(s => D.reshapeSection(s, { patBars: +e.target.value })));
$('fBars').addEventListener('change', e => editSec(s => {
  let bars = Math.round(num(e.target, 1, 256, s.bars));
  if (bars % s.patBars) bars += s.patBars - (bars % s.patBars);
  return { ...s, bars };
}));
$('fFill').addEventListener('change', e => editSec(s => {
  const v = e.target.value, beats = v === 'all' ? s.num : Math.min(s.num, +v);
  return D.refreshFill({ ...s, fill: { ...s.fill, beats, grid: null } });
}));
$('fFillStyle').addEventListener('change', e => editSec(s => D.refreshFill({ ...s, fill: { ...s.fill, style: e.target.value, grid: null } })));
$('newFill').addEventListener('click', () => editSec(s => D.refreshFill({ ...s, fill: { ...s.fill, seed: s.fill.seed + 1, grid: null } })));
$('clearGrid').addEventListener('click', () => editSec(s => {
  if (view === 'fill' && s.fill.grid) return { ...s, fill: { ...s.fill, grid: D.emptyGrid(D.fillSteps(s)) } };
  return { ...s, grid: D.emptyGrid(s.grid.kick.length), pattern: null };
}));
$('fCrash').addEventListener('change', e => editSec(s => ({ ...s, crash: e.target.checked })));
let ghostSnap = false;
$('fGhosts').addEventListener('input', e => {
  if (!ghostSnap) { snapshot(); ghostSnap = true; }
  const s = sec(); s.ghosts = +e.target.value; afterChange();
});
$('fGhosts').addEventListener('change', () => { ghostSnap = false; });

for (const t of SECTION_TYPES) $('newType').add(new Option(t.name, t.name));
$('newSec').addEventListener('click', () => change(() => {
  const t = SECTION_TYPES.find(x => x.name === $('newType').value) || SECTION_TYPES[0];
  const used = project.sections.filter(s => s.name.startsWith(t.name)).length;
  let s = D.sectionFromPattern(D.patternById(t.pattern), { name: used ? `${t.name} ${used + 1}` : t.name, bars: t.bars, color: SECTION_TYPES.indexOf(t) % 8 });
  s.bpm = sec().bpm;
  project.sections.push(s);
  const at = project.order.length ? selPos + 1 : 0;
  project.order.splice(at, 0, s.id);
  selId = s.id; selPos = at; view = 'groove';
}));
$('dupSec').addEventListener('click', () => change(() => {
  const s = { ...structuredClone(sec()), id: D.newId() };
  s.name = (s.name + ' B').slice(0, 40);
  project.sections.push(s);
  // the copy takes this spot in the song, so changing it changes only here
  if (project.order[selPos] === selId) project.order[selPos] = s.id;
  else { project.order.splice(selPos + 1, 0, s.id); selPos++; }
  selId = s.id;
}));
$('delSec').addEventListener('click', () => {
  if (project.sections.length <= 1) return;
  change(() => {
    const id = selId;
    project.sections = project.sections.filter(s => s.id !== id);
    project.order = project.order.filter(x => x !== id);
    selPos = Math.min(selPos, Math.max(0, project.order.length - 1));
    selId = project.order[selPos] || project.sections[0].id;
  });
});
for (const f of FILL_STYLES) $('fFillStyle').add(new Option(f.name, f.id));

// ---- the strip

$('strip').addEventListener('click', e => {
  const b = e.target.closest('.block');
  if (!b) return;
  selPos = +b.dataset.pos; selId = project.order[selPos]; view = 'groove';
  render();
  if (play?.mode === 'song') start('song', D.songTiming(D.buildSong(project)).spans[selPos].start);
  else if (play?.mode === 'section') refreshPlaying();
});
$('addBtn').addEventListener('click', () => change(() => {
  const id = $('addPick').value;
  if (!project.sections.some(s => s.id === id)) return;
  const at = project.order.length ? selPos + 1 : 0;
  project.order.splice(at, 0, id);
  selPos = at; selId = id;
}));
const move = d => change(() => {
  const j = selPos + d;
  if (j < 0 || j >= project.order.length) return;
  [project.order[selPos], project.order[j]] = [project.order[j], project.order[selPos]];
  selPos = j;
});
$('moveL').addEventListener('click', () => move(-1));
$('moveR').addEventListener('click', () => move(1));
$('removeBtn').addEventListener('click', () => change(() => {
  if (!project.order.length) return;
  project.order.splice(selPos, 1);
  selPos = Math.min(selPos, Math.max(0, project.order.length - 1));
  if (project.order.length) selId = project.order[selPos];
}));

// ---- grooves tab

function renderLibrary() {
  const chips = $('styleChips');
  if (!chips.children.length) for (const st of STYLES) { const b = document.createElement('button'); b.dataset.style = st.id; b.textContent = st.name; chips.append(b); }
  chips.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.style === libStyle));
  const ul = $('lib'), cur = sec().pattern;
  ul.textContent = '';
  for (const p of PATTERNS.filter(p => p.style === libStyle)) {
    const li = document.createElement('li');
    li.className = p.id === cur ? 'cur' : '';
    li.innerHTML = '<div><b></b><span class="m"></span><small></small></div><button class="small">Use</button>';
    li.querySelector('b').textContent = p.name;
    li.querySelector('.m').textContent = `${p.num}/${p.den} · ${p.bpm} BPM · ${D.DIVS.find(d => d.id === p.div).name}`;
    li.querySelector('small').textContent = p.about;
    li.querySelector('button').dataset.pattern = p.id;
    li.querySelector('button').setAttribute('aria-label', 'Use ' + p.name + ' in ' + sec().name);
    ul.append(li);
  }
}
$('styleChips').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; libStyle = b.dataset.style; renderLibrary(); });
$('lib').addEventListener('click', e => {
  const b = e.target.closest('button[data-pattern]');
  if (!b) return;
  const p = D.patternById(b.dataset.pattern);
  view = 'groove';
  editSec(s => D.applyPattern(s, p, $('libTempo').checked));
  if (!play) start('section');
});

// ---- feel tab

function renderFeel() {
  const f = project.feel;
  $('fTiming').value = f.timing; $('timingVal').textContent = f.timing ? f.timing + ' ms' : 'off';
  $('fVel').value = f.velocity; $('velVal').textContent = f.velocity ? '±' + f.velocity : 'off';
  $('fSwing').value = f.swing; $('swingVal').textContent = f.swing ? Math.round(f.swing * 100) + '%' : 'straight';
  $('fSoftFast').checked = f.softFast; $('fKickTight').checked = f.kickTight;
}
let feelSnap = false;
const feelInput = (id, key, cast = Number) => {
  $(id).addEventListener('input', e => { if (!feelSnap) { snapshot(); feelSnap = true; } project.feel[key] = cast(e.target.value); afterChange(); });
  $(id).addEventListener('change', () => { feelSnap = false; });
};
feelInput('fTiming', 'timing'); feelInput('fVel', 'velocity'); feelInput('fSwing', 'swing');
$('fSoftFast').addEventListener('change', e => change(() => { project.feel.softFast = e.target.checked; }));
$('fKickTight').addEventListener('change', e => change(() => { project.feel.kickTight = e.target.checked; }));
$('reroll').addEventListener('click', () => change(() => { project.feel.seed = (project.feel.seed % 1e9) + 1; }));
$('feelOff').addEventListener('click', () => change(() => { Object.assign(project.feel, { timing: 0, velocity: 0, swing: 0 }); }));

// ---- export tab

function renderExport() {
  const m = $('fMap');
  if (!m.options.length) for (const x of D.MAPS) m.add(new Option(x.name, x.id));
  m.value = project.map.id;
  const t = $('mapTable');
  t.classList.toggle('hidden', project.map.id !== 'custom');
  if (!t.children.length) {
    for (const l of D.LANES) {
      const lab = document.createElement('label');
      lab.innerHTML = '<span></span><input type="number" min="0" max="127" step="1">';
      lab.querySelector('span').textContent = l.name;
      lab.querySelector('input').dataset.lane = l.id;
      t.append(lab);
    }
  }
  for (const inp of t.querySelectorAll('input')) if (document.activeElement !== inp) inp.value = project.map.custom[inp.dataset.lane];
}
$('fMap').addEventListener('change', e => change(() => { project.map.id = e.target.value; }, { rerender: false }));
$('mapTable').addEventListener('change', e => {
  const inp = e.target.closest('input[data-lane]');
  if (!inp) return;
  const v = Math.round(+inp.value);
  change(() => { project.map.custom[inp.dataset.lane] = v >= 0 && v <= 127 ? v : D.LANES.find(l => l.id === inp.dataset.lane).gm; }, { rerender: false });
});
function setStatus(t) { $('status').textContent = t; }
function download(bytes, name, type) {
  const blob = bytes instanceof Blob ? bytes : new Blob([bytes], { type });
  const a = document.createElement('a'), url = URL.createObjectURL(blob);
  a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  lastFile = { name, size: blob.size };
}
function midiFor(order, label) {
  const song = D.buildSong(project, order);
  const bytes = D.writeMidi(song, D.humanize(song, project.feel), { notes: D.mapNotes(project), name: project.name });
  download(bytes, D.safeName(project.name) + label + '.mid', 'audio/midi');
  setStatus(`Saved ${D.safeName(project.name) + label}.mid (${song.events.length} hits).`);
}
$('midiSong').addEventListener('click', () => { if (!project.order.length) return setStatus('The song is empty.'); midiFor(project.order, ''); });
$('midiSec').addEventListener('click', () => midiFor([selId], '_' + D.safeName(sec().name)));
const mp3Of = (l, r, fs) => new Promise((resolve, reject) => {
  const w = new Worker('mp3-worker.js');
  w.onmessage = e => { if (e.data.type === 'progress') setStatus(`Making the MP3... ${e.data.pct}%`); else { resolve(e.data.mp3); w.terminate(); } };
  w.onerror = e => { reject(new Error(e.message || 'MP3 encoder failed')); w.terminate(); };
  w.postMessage({ l, r, fs, kbps: 320 }, [l.buffer, r.buffer]);
});
$('audioBtn').addEventListener('click', async () => {
  const what = $('fAudioWhat').value, fmt = $('fAudio').value;
  const order = what === 'song' ? project.order : [selId];
  if (!order.length) return setStatus('The song is empty.');
  $('audioBtn').disabled = true; setStatus('Rendering the drums...');
  try {
    const r = await renderPcm(order, false);
    const base = D.safeName(project.name) + (what === 'section' ? '_' + D.safeName(sec().name) : '');
    if (fmt === 'mp3') download(await mp3Of(r.l, r.r, r.sr), base + '.mp3', 'audio/mpeg');
    else download(encodeWav([r.l, r.r], r.sr, fmt === 'wav24' ? 24 : 16), base + '.wav', 'audio/wav');
    setStatus(`Saved ${lastFile.name} (${(lastFile.size / 1e6).toFixed(1)} MB).`);
  } catch (e) { setStatus('Couldn\'t make the audio: ' + e.message); }
  $('audioBtn').disabled = false;
});
$('saveSong').addEventListener('click', () => {
  download(JSON.stringify({ format: 'encore-drums', ...project }, null, 1), D.safeName(project.name) + '.drums.json', 'application/json');
  setStatus('Saved the song file.');
});
$('openFile').addEventListener('change', async e => {
  const f = e.target.files?.[0];
  e.target.value = '';
  if (!f) return;
  try {
    const bytes = new Uint8Array(await f.arrayBuffer());
    let next;
    if (bytes[0] === 0x4d && bytes[1] === 0x54 && bytes[2] === 0x68 && bytes[3] === 0x64) {
      const imp = D.importMidi(D.readMidi(bytes), { name: 'Part' });
      next = D.cleanProject({ ...project, name: f.name.replace(/\.(mid|midi)$/i, '').slice(0, 60), sections: imp.sections, order: imp.order });
      setStatus(`Opened ${f.name}: ${imp.sections.length} sections${imp.skipped ? `, ${imp.skipped} notes that aren't drums left out` : ''}.`);
    } else {
      next = D.cleanProject(JSON.parse(new TextDecoder().decode(bytes)));
      setStatus(`Opened ${f.name}.`);
    }
    stop();
    change(() => { selPos = 0; selId = next.order[0] || next.sections[0].id; view = 'groove'; return next; }, { rerender: false });
  } catch (err) { setStatus('Couldn\'t open that file: ' + (err.message || err)); }
});
$('demoSong').addEventListener('click', () => { stop(); change(() => { selPos = 0; selId = 'intro'; view = 'groove'; return D.demoProject(); }, { rerender: false }); });
$('blankSong').addEventListener('click', () => {
  stop();
  change(() => {
    const s = D.sectionFromPattern(D.patternById('rock'), { name: 'Verse', bars: 4 });
    s.grid = D.emptyGrid(s.grid.kick.length); s.pattern = null; s.crash = false;
    selPos = 0; selId = s.id; view = 'groove';
    return { ...D.demoProject(), name: 'New song', sections: [s], order: [s.id], kit: project.kit, map: project.map };
  }, { rerender: false });
});

// ---- transport and the rest

for (const k of DRUM_KITS) $('kit').add(new Option(k.name, k.id));
$('kit').value = project.kit;
const showCredit = () => { $('credit').textContent = DRUM_KITS.find(k => k.id === project.kit)?.credit || 'The synth kits are made right here in your browser.'; };
showCredit();
$('kit').addEventListener('change', e => { change(() => { project.kit = e.target.value; }); showCredit(); });
$('vol').addEventListener('input', e => { if (master) master.gain.value = +e.target.value; });
$('playSong').addEventListener('click', () => start('song', 0));
$('playSec').addEventListener('click', () => { if (play?.mode === 'section') stop(); else start('section'); });
$('stop').addEventListener('click', stop);
$('undo').addEventListener('click', undo);
$('redo').addEventListener('click', redo);
$('songName').addEventListener('change', e => change(() => { project.name = e.target.value.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 60) || 'My song'; }, { rerender: false }));
$('view').addEventListener('click', e => { const b = e.target.closest('button'); if (!b || b.disabled) return; view = b.dataset.view; renderGridHead(); drawGrid(); });
$('brush').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; brush = +b.dataset.vel; renderGridHead(); });
document.querySelector('.tabBar').addEventListener('click', e => {
  const b = e.target.closest('button[data-tab]');
  if (!b) return;
  document.querySelectorAll('.tabBar button').forEach(x => x.classList.toggle('on', x === b));
  document.querySelectorAll('.tabBody > section').forEach(s => s.classList.toggle('show', s.dataset.tab === b.dataset.tab));
});
document.addEventListener('keydown', e => {
  const t = e.target;
  if (t.closest?.('input, select, textarea') || e.altKey || e.metaKey) return;
  if (e.ctrlKey && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (e.ctrlKey && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); redo(); return; }
  if (e.ctrlKey) return;
  if (e.key === ' ' || e.code === 'Space') { if (t.closest?.('button')) return; e.preventDefault(); play ? stop() : start('song', 0); }
  else if (e.key === 'l' || e.key === 'L') { play?.mode === 'section' ? stop() : start('section'); }
});
let resizeTimer = 0;
addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { renderStrip(); drawGrid(); }, 100); });
document.fonts?.ready.then(() => drawGrid());

// for the browser tests
window.__drums = () => {
  const s = sec(), count = g => Object.values(g).reduce((a, r) => a + r.filter(v => v).length, 0);
  return { name: project.name, sections: project.sections.length, order: project.order.slice(), sel: selId, selPos, view, brush, kit: project.kit,
    hits: count(s.grid), fillHits: s.fill.grid ? count(s.fill.grid) : 0, pattern: s.pattern, num: s.num, den: s.den, div: s.div, bpm: s.bpm, bars: s.bars,
    playing: !!play, mode: play?.mode || null, pos: position(), undo: undoStack.length, lastFile, feel: { ...project.feel }, map: project.map.id };
};

render();
