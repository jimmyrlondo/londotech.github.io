// Encore Metronome: the page. The clicks are rendered on the audio thread by
// metronome-worklet.js, sample-exact whatever the page is doing; this file is
// the controls, the beat display (lined up with what you hear, not with when
// the click was sent), the setlist, stage view, and Time check: it listens to
// you play and measures every note against the grid. Nothing leaves the browser.
import { clampBpm, SUBDIVISIONS, subFractions, groupingOptions, defaultGroups, parseGroups, defaultAccents, groupMap, groupsLabel,
         unitOptions, noteValueName, tempoName, TapTempo, cleanSettings, SOUND_SETS, makeSounds, sliderGain,
         OnsetDetector, measureLatency, TimeCheck, summarize } from './metronome-core.js';
import { TempoFinder, tapTempo } from './bpm-core.js';

const $ = id => document.getElementById(id);
const store = {
  get: (k, d) => { try { const v = localStorage.getItem('encoreMetronome.' + k); return v === null ? d : v; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem('encoreMetronome.' + k, v); } catch {} },
};
const loadJSON = (k, d) => { try { const v = JSON.parse(store.get(k, 'null')); return v ?? d; } catch { return d; } };
const TEST = new URLSearchParams(location.search).has('selftest');

// ---- what the clock plays (S, the same object the worklet gets) and the page's own choices (P)
let S = cleanSettings(loadJSON('settings', null));
const VOL = { master: 80, accent: 90, beat: 75, sub: 50, poly: 65 };
const P = { sound: 'classic', countIn: false, flashOffset: 0, tcOn: false, listen: 'same', sens: 50, inputId: '', latency: null, latencyHow: '', latencyWhen: '', song: -1, ...loadJSON('page', {}) };
P.vol = { ...VOL, ...(P.vol || {}) };
let songs = loadJSON('songs', []);
if (!Array.isArray(songs)) songs = [];
const save = () => { store.set('settings', JSON.stringify(S)); store.set('page', JSON.stringify(P)); };
const saveSongs = () => store.set('songs', JSON.stringify(songs));
const fmtBpm = b => Math.abs(b - Math.round(b)) < 0.05 ? String(Math.round(b)) : b.toFixed(1);
const allOnes = g => g.every(x => x === 1);

// ---- audio: one context, the worklet, a master volume
let ctx = null, node = null, master = null, ready = null, running = false, testStartAt = null;
function audio() {
  if (!ready) ready = (async () => {
    ctx = new AudioContext({ latencyHint: 'interactive' });   // made inside the tap that started it (phones need that)
    if (!ctx.audioWorklet) throw new Error('This browser can\'t run the metronome\'s audio engine (AudioWorklet). Try a current Chrome, Edge, Firefox or Safari.');
    await ctx.audioWorklet.addModule('metronome-worklet.js');
    node = new AudioWorkletNode(ctx, 'encore-metronome', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
    master = ctx.createGain();
    master.gain.value = masterGain();
    node.connect(master).connect(ctx.destination);
    node.port.onmessage = onWorklet;
    sendSounds();
    sendSettings();
  })();
  if (ctx && ctx.state === 'suspended') ctx.resume();
  return ready.then(() => { if (ctx.state === 'suspended') return ctx.resume(); });
}
const masterGain = () => sliderGain(P.vol.master) * 0.8;   // headroom for an accent, a subdivision and the polyrhythm landing together
function sendSounds(id = P.sound) { if (node) node.port.postMessage({ type: 'sounds', sounds: makeSounds(id, ctx.sampleRate) }); }
function sendSettings() { if (node && !calib) node.port.postMessage({ type: 'settings', settings: { ...S, vol: P.vol } }); }
/** Every change to the clock goes through here: saved, sent (it lands on the next beat), shown */
function changed(rebuild = true) { S = cleanSettings(S); save(); sendSettings(); if (rebuild) refresh(); }

async function start() {
  try {
    await audio();
    if (running || calib) return;
    if (P.tcOn) await beginTake();
    queue = []; firstBar = null; shown = null;
    node.port.postMessage({ type: 'start', countIn: P.countIn, at: testStartAt ?? undefined });
    testStartAt = null;
    running = true;
    showRunning();
    keepAwake(true);
  } catch (e) { showError(e); }
}
function stop() {
  if (!running) return;
  node.port.postMessage({ type: 'stop' });
  running = false;
  showRunning();
  // the last notes are still on their way in: finish this take a moment later (unless a new one has started)
  const t = take;
  if (t && !t.done) setTimeout(() => { if (take === t) finishTake(); }, (t.latencyMs || 0) + 300);
  if ($('stage').classList.contains('hidden')) keepAwake(false);
}
const toggle = () => running ? stop() : start();
function showRunning() {
  for (const b of [$('playBtn'), $('stagePlay')]) { b.textContent = running ? 'Stop' : 'Start'; b.classList.toggle('running', running); }
  if (!running) { clearNow(); $('bpm').textContent = fmtBpm(S.bpm); }
}
function showError(e) {
  const el = $('err');
  el.classList.remove('hidden');
  el.textContent = e && e.name === 'NotAllowedError' ? 'The browser wasn\'t allowed to use the microphone. Allow it (the icon in the address bar) and try again.' : String(e && e.message || e);
  console.warn(e);
}

// ---- keeping the screen on while it runs (phones dim and lock otherwise)
let wake = null;
async function keepAwake(on) {
  try {
    if (on && !wake && 'wakeLock' in navigator) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); }
    else if (!on && wake) { const w = wake; wake = null; await w.release(); }
  } catch {}
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && (running || !$('stage').classList.contains('hidden'))) keepAwake(true); });

// ---- what the worklet says: each count as it's played, and the input for Time check
let queue = [], firstBar = null, shown = null;
function onWorklet(e) {
  const m = e.data;
  if (m.type === 'counts') {
    for (const ev of m.events) {
      if (calib) { calib.clicks.push(ev); if (calib.clicks.length >= calib.need) calib.resolve(); continue; }
      queue.push(ev);
      if (TEST) { const log = window.__metroCounts ||= []; if (log.length < 5000) log.push({ frame: ev.frame, len: ev.len, bar: ev.bar, count: ev.count, ahead: ev.frame - heardFrame() - P.flashOffset / 1000 * ctx.sampleRate }); }
      if (firstBar === null && !ev.countIn) firstBar = ev.frame;
      if (take && !take.done) addCountToTake(ev);
    }
  } else if (m.type === 'input') {
    if (finder) finder.push(m.data);
    if (calib) calib.onsets.push(...calib.det.push(m.data, m.frame));
    else if (take && !take.done) { const o = take.det.push(m.data, m.frame); if (o.length) { take.tc.addOnsets(o); take.dirty = true; } }
  }
}

// ---- the beat display: lit when you hear it
/** The output frame being heard right now (what's playing out of the speakers, not what's being computed) */
function heardFrame() {
  const sr = ctx.sampleRate;
  let t = null;
  if (ctx.getOutputTimestamp) {
    const ts = ctx.getOutputTimestamp();
    if (ts.contextTime > 0 && ts.performanceTime > 0) t = ts.contextTime + (performance.now() - ts.performanceTime) / 1000;
  }
  if (t === null) t = ctx.currentTime - (ctx.outputLatency || 0) - (ctx.baseLatency || 0);
  return (t - P.flashOffset / 1000) * sr;
}

let blocks = [], stageDots = [];
function buildBeats() {
  const box = $('beats');
  box.innerHTML = '';
  blocks = [];
  const nsub = subFractions(S.sub, S.swing).length;
  let i = 0;
  S.groups.forEach(g => {
    const grp = document.createElement('div');
    grp.className = 'grp';
    for (let k = 0; k < g; k++, i++) {
      const b = document.createElement('button'), n = i;
      b.type = 'button';
      b.className = 'beat';
      b.dataset.level = S.accents[n];
      b.innerHTML = `<span class="fill"></span><span class="num">${n + 1}</span>` + (nsub > 1 ? `<span class="dots">${'<i></i>'.repeat(nsub)}</span>` : '');
      b.title = `Beat ${n + 1}: tap to change (accent, normal, soft, silent)`;
      b.onclick = () => { S.accents[n] = (S.accents[n] + 3) % 4; b.dataset.level = S.accents[n]; changed(false); buildStageDots(); };
      grp.append(b);
      blocks.push(b);
    }
    box.append(grp);
  });
  buildStageDots();
}
function buildStageDots() {
  const box = $('stageDots');
  box.innerHTML = '';
  stageDots = S.accents.map(a => { const d = document.createElement('i'); if (a === 3) d.className = 'acc'; box.append(d); return d; });
}
function clearNow() {
  for (const b of blocks) { b.classList.remove('now', 'muted'); b.querySelectorAll('.dots i').forEach(d => d.classList.remove('now')); }
  for (const d of stageDots) d.classList.remove('on');
  $('stageCount').textContent = '1';
  $('counter').innerHTML = '&nbsp;';
}

let lastSub = -1;
function draw() {
  requestAnimationFrame(draw);
  if (take && take.dirty) { take.dirty = false; drawTake(false); }
  if (!ctx || !running && !queue.length) { drawPoly(null, 0); return; }
  const hf = heardFrame();
  while (queue.length > 1 && queue[1].frame <= hf) queue.shift();
  const ev = queue[0];
  if (!ev || ev.frame > hf || (!running && hf > ev.frame + ev.len)) { if (!running) { queue = []; clearNow(); } drawPoly(null, 0); return; }
  const frac = Math.min(0.9999, (hf - ev.frame) / ev.len);
  if (ev !== shown) { showCount(ev, shown); shown = ev; lastSub = -1; }
  // the subdivision dots
  let k = 0;
  while (k + 1 < ev.subs.length && ev.subs[k + 1] <= frac) k++;
  if (k !== lastSub && blocks[ev.count]) {
    const dots = blocks[ev.count].querySelectorAll('.dots i');
    dots.forEach((d, i) => d.classList.toggle('now', i === k && !ev.muted));
    lastSub = k;
  }
  drawPoly(ev, frac);
}

function showCount(ev, prev) {
  if (prev && blocks[prev.count]) { blocks[prev.count].classList.remove('now', 'muted'); blocks[prev.count].querySelectorAll('.dots i').forEach(d => d.classList.remove('now')); }
  if (ev.top !== blocks.length) return;   // a meter change waiting for the bar to finish
  const b = blocks[ev.count];
  b.classList.add('now');
  b.classList.toggle('muted', ev.muted);
  stageDots.forEach((d, i) => d.classList.toggle('on', i === ev.count && !ev.muted));
  const pulse = allOnes(ev.groups) ? ev.count + 1 : ev.group + 1;
  $('stageCount').textContent = ev.muted ? '·' : String(pulse);
  $('stageCount').style.color = ev.countIn ? '#91887d' : ev.level === 3 ? '#ff3b00' : '';
  if (!ev.muted && ev.level > 0 && !$('stage').classList.contains('hidden')) {
    const f = $('stageFlash');
    f.style.background = ev.level === 3 ? 'rgb(255 59 0 / 0.55)' : ev.level === 2 ? 'rgb(242 239 232 / 0.18)' : 'rgb(242 239 232 / 0.08)';
    f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
  }
  const t = firstBar === null || ev.countIn ? 0 : Math.max(0, (ev.frame - firstBar) / ctx.sampleRate);
  const clock = Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
  const info = ev.countIn ? 'Count-in' : `Bar ${ev.bar + 1}  ·  ${clock}` + (ev.gap ? '  ·  silent bar' : '');
  $('counter').textContent = info + (S.trainer.mode !== 'off' && !ev.countIn ? `  ·  trainer ${fmtBpm(ev.bpm)} BPM` : '');
  if (S.trainer.mode !== 'off') $('bpm').textContent = fmtBpm(ev.bpm);
  $('stageInfo').textContent = [songs[P.song]?.name, fmtBpm(ev.bpm) + ' BPM', ev.countIn ? 'count-in' : 'bar ' + (ev.bar + 1)].filter(Boolean).join('  ·  ');
}

/** The polyrhythm against the bar: the counts on top, the other rhythm below, and where you are */
function drawPoly(ev, frac) {
  const c = $('polyCanvas');
  if (!S.poly.on) return;
  const dpr = window.devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight;
  if (!w) return;
  if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
  const g = c.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  const top = S.top, n = S.poly.n, x0 = 10, x1 = w - 10, X = p => x0 + (x1 - x0) * p, mid = h / 2;
  const at = ev && ev.top === top ? (ev.count + frac) / top : -1;
  g.fillStyle = '#2c2723';
  g.fillRect(x0, mid - 1, x1 - x0, 2);
  for (let i = 0; i < top; i++) {
    const on = at >= i / top && at < (i + 1) / top;
    g.fillStyle = on ? '#f2efe8' : '#5a514a';
    g.fillRect(X(i / top) - 3, 6, 6, mid - 10);
  }
  for (let j = 0; j < n; j++) {
    const p = j / n, on = at >= p && at < p + Math.min(0.08, 0.6 / n);
    g.fillStyle = on ? '#ff3b00' : 'rgb(255 59 0 / 0.35)';
    g.beginPath(); g.arc(X(p), mid + 16, on ? 8 : 6, 0, 2 * Math.PI); g.fill();
  }
  if (at >= 0) { g.fillStyle = 'rgb(242 239 232 / 0.6)'; g.fillRect(X(at) - 1, 2, 2, h - 4); }
  g.fillStyle = '#91887d'; g.font = '11px DM Sans, sans-serif';
  g.fillText(`${n} over ${top}`, x0, h - 2);
}

// ---- tempo: the big number (drag, scroll, tap to type), the slider, steps, tap tempo
function setBpm(v, fromUser = true) {
  const b = Math.round(clampBpm(v) * 10) / 10;
  if (fromUser && S.trainer.mode !== 'off') { S.trainer = { ...S.trainer, mode: 'off' }; $('trMode').value = 'off'; showTrainer(); toast('Tempo trainer off: you set the tempo yourself'); }
  S.bpm = b;
  changed(false);
  showTempo();
}
function showTempo() {
  if (!(running && S.trainer.mode !== 'off')) $('bpm').textContent = fmtBpm(S.bpm);
  $('tempoSlider').value = Math.round(S.bpm);
  $('tempoName').textContent = tempoName(S.bpm);
  $('unitName').textContent = noteValueName(S.units, S.bottom);
}
{
  const el = $('bpm');
  let drag = null;
  el.addEventListener('pointerdown', e => { drag = { y: e.clientY, from: S.bpm, moved: false }; el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointermove', e => {
    if (!drag) return;
    const dy = drag.y - e.clientY;
    if (Math.abs(dy) > 4) drag.moved = true;
    if (drag.moved) setBpm(drag.from + Math.round(dy / 4));
  });
  el.addEventListener('pointerup', () => { const d = drag; drag = null; if (d && !d.moved) editBpm(); });
  el.addEventListener('pointercancel', () => { drag = null; });
  el.addEventListener('wheel', e => { e.preventDefault(); setBpm(S.bpm + (e.deltaY < 0 ? 1 : -1) * (e.shiftKey ? 10 : 1)); }, { passive: false });
  el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); editBpm(); } });
}
function editBpm() {
  const el = $('bpm'), input = document.createElement('input');
  input.type = 'number'; input.min = 20; input.max = 400; input.step = 'any'; input.inputMode = 'decimal';
  input.className = 'bpmEdit'; input.value = fmtBpm(S.bpm); input.setAttribute('aria-label', 'Type a tempo');
  el.replaceWith(input);
  input.focus(); input.select();
  let done = false;
  const finish = ok => { if (done) return; done = true; if (ok && input.value !== '') setBpm(+input.value); input.replaceWith(el); showTempo(); };
  input.onkeydown = e => { if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); e.stopPropagation(); };
  input.onblur = () => finish(true);
}
$('tempoSlider').oninput = () => setBpm(+$('tempoSlider').value);
// hold + or - to keep going
for (const [id, d] of [['minus', -1], ['plus', 1]]) {
  const b = $(id);
  let timer = null;
  const go = () => setBpm(Math.round(S.bpm) + d);
  b.addEventListener('pointerdown', e => { e.preventDefault(); go(); let wait = 420; const rep = () => { go(); wait = Math.max(50, wait * 0.8); timer = setTimeout(rep, wait); }; timer = setTimeout(rep, wait); });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => clearTimeout(timer));
  b.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
}
const tapper = new TapTempo();
function tap() {
  const b = tapper.tap(performance.now());
  $('tapBtn').animate([{ background: 'rgb(255 59 0 / 0.5)' }, { background: 'transparent' }], { duration: 160 });
  if (b) setBpm(Math.round(b));
}
$('tapBtn').addEventListener('pointerdown', e => { e.preventDefault(); tap(); });
$('tapBtn').addEventListener('keydown', e => { if (e.key === 'Enter') tap(); });
$('playBtn').onclick = toggle;

// ---- meter, grouping, accents, subdivision
for (let n = 1; n <= 16; n++) $('top').append(new Option(String(n), n));
SOUND_SETS.forEach(s => $('sound').append(new Option(s.name, s.id)));
for (let n = 2; n <= 16; n++) $('polyN').append(new Option(n + ' clicks', n));
SUBDIVISIONS.forEach(d => {
  const b = document.createElement('button');
  b.type = 'button'; b.textContent = d.name; b.dataset.id = d.id;
  b.onclick = () => { S.sub = d.id; changed(); };
  $('subSeg').append(b);
});

function newMeter() {
  S.groups = defaultGroups(S.top, S.bottom);
  S.units = S.bottom >= 8 && S.groups.length > 1 && S.groups.every(g => g === 3) ? 3 : 1;
  S.accents = defaultAccents(S.groups);
  changed();
}
$('top').onchange = () => { S.top = +$('top').value; newMeter(); };
$('bottom').onchange = () => { S.bottom = +$('bottom').value; newMeter(); };
$('groups').onchange = () => {
  const v = $('groups').value;
  $('customWrap').classList.toggle('hidden', v !== 'custom');
  if (v === 'custom') { $('custom').value = S.groups.join('+'); $('custom').focus(); return; }
  S.groups = v.split('+').map(Number);
  S.accents = defaultAccents(S.groups);
  if (!unitOptions(S.groups, S.bottom).some(u => u.units === S.units)) S.units = 1;
  changed();
};
$('custom').onchange = () => {
  const g = parseGroups($('custom').value, S.top);
  if (!g) { toast(`That grouping has to add up to ${S.top}, like ${defaultGroups(S.top, S.bottom).join('+')}`); return; }
  S.groups = g; S.accents = defaultAccents(g); S.units = 1;
  changed();
};
$('units').onchange = () => { S.units = +$('units').value; changed(); };
$('accPulse').onclick = () => { S.accents = groupMap(S.groups).map((m, i) => i === 0 ? 3 : m.start ? 2 : 0); changed(); };
$('accAll').onclick = () => { S.accents = S.accents.map((_, i) => i === 0 ? 3 : 2); changed(); };
$('accReset').onclick = () => { S.accents = defaultAccents(S.groups); changed(); };
$('swing').oninput = () => { S.swing = +$('swing').value; changed(false); showSwing(); };
function showSwing() {
  const v = S.swing;
  $('swingText').textContent = `${v}%  (${v <= 50 ? 'straight' : v < 60 ? 'light' : v < 69 ? 'triplet feel' : 'hard, dotted'})`;
  $('swingWrap').classList.toggle('hidden', !SUBDIVISIONS.find(d => d.id === S.sub)?.swing);
}

// ---- sound
$('sound').onchange = () => { P.sound = $('sound').value; save(); if (ctx && !calib) sendSounds(); };
for (const [id, key] of [['volMaster', 'master'], ['volAccent', 'accent'], ['volBeat', 'beat'], ['volSub', 'sub'], ['volPoly', 'poly']]) {
  $(id).value = P.vol[key];
  $(id + 'V').textContent = P.vol[key];
  $(id).oninput = () => {
    P.vol[key] = +$(id).value;
    $(id + 'V').textContent = P.vol[key];
    if (key === 'master') { if (master && !calib) master.gain.setTargetAtTime(masterGain(), ctx.currentTime, 0.02); save(); }
    else changed(false);
  };
}
let muted = false;
function toggleMute() {
  muted = !muted;
  if (master && !calib) master.gain.setTargetAtTime(muted ? 0 : masterGain(), ctx.currentTime, 0.01);
  toast(muted ? 'Muted (M to unmute). The beats still show.' : 'Sound on');
}
$('flashOffset').value = P.flashOffset;
const showOffset = () => { $('offsetText').textContent = P.flashOffset ? `${P.flashOffset > 0 ? 'later' : 'earlier'} by ${Math.abs(P.flashOffset)} ms` : 'lined up with the sound'; };
$('flashOffset').oninput = () => { P.flashOffset = +$('flashOffset').value; save(); showOffset(); };

// ---- polyrhythm and practice
$('polyOn').onchange = () => { S.poly = { ...S.poly, on: $('polyOn').checked }; changed(); };
$('polyN').onchange = () => { S.poly = { ...S.poly, n: +$('polyN').value }; changed(); };
$('countIn').onchange = () => { P.countIn = $('countIn').checked; save(); };
$('trMode').onchange = () => {
  S.trainer = { ...S.trainer, mode: $('trMode').value };
  changed(false); showTrainer();
  if (S.trainer.mode !== 'off') toast(running ? 'Trainer on: it counts bars from when you pressed Start' : 'Trainer on: it starts when you press Start');
};
for (const [id, key] of [['trFrom', 'from'], ['trTo', 'to'], ['trStep', 'step'], ['trEvery', 'every'], ['trMinutes', 'minutes']])
  $(id).onchange = () => { S.trainer = { ...S.trainer, [key]: +$(id).value }; changed(false); showTrainer(); };
$('trLoop').onchange = () => { S.trainer = { ...S.trainer, loop: $('trLoop').checked }; changed(false); };
function showTrainer() {
  const t = S.trainer, on = t.mode !== 'off';
  $('trSteps').classList.toggle('hidden', !on);
  document.querySelectorAll('.trStep').forEach(e => e.classList.toggle('hidden', t.mode !== 'steps'));
  document.querySelectorAll('.trRamp').forEach(e => e.classList.toggle('hidden', t.mode !== 'ramp'));
  $('trFrom').value = t.from; $('trTo').value = t.to; $('trStep').value = t.step; $('trEvery').value = t.every; $('trMinutes').value = t.minutes; $('trLoop').checked = !!t.loop;
}
$('gapOn').onchange = () => { S.gap = { ...S.gap, on: $('gapOn').checked }; changed(false); $('gapFields').classList.toggle('hidden', !S.gap.on); };
$('gapPlay').onchange = () => { S.gap = { ...S.gap, play: +$('gapPlay').value }; changed(false); };
$('gapMute').onchange = () => { S.gap = { ...S.gap, mute: +$('gapMute').value }; changed(false); };
$('randomMute').oninput = () => { S.randomMute = +$('randomMute').value; changed(false); showRandom(); };
const showRandom = () => { $('randText').textContent = S.randomMute ? `${S.randomMute}% of beats go silent at random` : 'off'; };

/** Puts every control in line with S and P */
function refresh() {
  $('top').value = S.top;
  $('bottom').value = S.bottom;
  const opts = groupingOptions(S.top, S.bottom), sel = $('groups'), cur = S.groups.join('+');
  sel.innerHTML = '';
  opts.forEach(g => sel.append(new Option(groupsLabel(g), g.join('+'))));
  sel.append(new Option('Custom...', 'custom'));
  const known = opts.some(g => g.join('+') === cur);
  sel.value = known ? cur : 'custom';
  $('customWrap').classList.toggle('hidden', known);
  if (!known) $('custom').value = cur;
  $('units').innerHTML = '';
  unitOptions(S.groups, S.bottom).forEach(u => $('units').append(new Option(u.units > 1 ? `The beat (${u.name})` : `Each ${u.name}`, u.units)));
  $('units').value = S.units;
  $('subSeg').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.id === S.sub));
  $('swing').value = S.swing;
  showSwing();
  $('sound').value = P.sound;
  $('polyOn').checked = S.poly.on;
  $('polyN').value = S.poly.n;
  $('polyCanvas').classList.toggle('hidden', !S.poly.on);
  $('polyText').textContent = `${S.poly.n} evenly spaced clicks against the ${S.top} beat${S.top > 1 ? 's' : ''} of each bar (${S.poly.n} over ${S.top}), in their own sound. Its volume is under Sound.`;
  $('countIn').checked = P.countIn;
  $('trMode').value = S.trainer.mode;
  showTrainer();
  $('gapOn').checked = S.gap.on; $('gapPlay').value = S.gap.play; $('gapMute').value = S.gap.mute || 4;
  $('gapFields').classList.toggle('hidden', !S.gap.on);
  $('randomMute').value = S.randomMute;
  showRandom();
  showTempo();
  showOffset();
  buildBeats();
  drawSongs();
}

// ---- setlist
const SONG_KEYS = ['bpm', 'top', 'bottom', 'groups', 'units', 'accents', 'sub', 'swing', 'poly', 'trainer', 'gap', 'randomMute'];
const songOf = name => ({ name, ...Object.fromEntries(SONG_KEYS.map(k => [k, JSON.parse(JSON.stringify(S[k]))])), sound: P.sound, countIn: P.countIn });
const songLine = s => `${fmtBpm(clampBpm(s.bpm))} BPM · ${s.top}/${s.bottom}` + (s.groups && !allOnes(s.groups) ? ` (${s.groups.join('+')})` : '') + (s.sub && s.sub !== 'none' ? ` · ${SUBDIVISIONS.find(d => d.id === s.sub)?.name}` : '');
function loadSong(i) {
  if (!songs.length) return;
  i = (i + songs.length) % songs.length;
  const s = songs[i];
  P.song = i;
  S = cleanSettings({ ...S, ...Object.fromEntries(SONG_KEYS.filter(k => k in s).map(k => [k, s[k]])) });
  if (s.sound && s.sound !== P.sound) { P.sound = s.sound; if (ctx) sendSounds(); }
  if ('countIn' in s) P.countIn = !!s.countIn;
  changed();
  toast(`${i + 1}. ${s.name}  (${songLine(s)})`);
}
function drawSongs() {
  const ul = $('songs');
  ul.innerHTML = '';
  songs.forEach((s, i) => {
    const li = document.createElement('li');
    li.className = 'song' + (i === P.song ? ' on' : '');
    const load = document.createElement('button');
    load.className = 'load';
    load.textContent = `${i + 1}. ${s.name}`;
    const small = document.createElement('small');
    small.textContent = songLine(s);
    load.append(small);
    load.onclick = () => loadSong(i);
    li.append(load);
    for (const [label, title, fn] of [['↑', 'Move up', () => move(i, -1)], ['↓', 'Move down', () => move(i, 1)], ['×', 'Delete', () => del(i)]]) {
      const b = document.createElement('button');
      b.className = 'mini'; b.textContent = label; b.title = title; b.setAttribute('aria-label', title + ' ' + s.name);
      b.onclick = fn;
      li.append(b);
    }
    ul.append(li);
  });
  if (!songs.length) { const li = document.createElement('li'); li.className = 'sub'; li.textContent = 'No songs yet. Set it up the way a song goes, name it, and save.'; ul.append(li); }
  $('songUpdate').disabled = !(P.song >= 0 && P.song < songs.length);
}
function move(i, d) {
  const j = i + d;
  if (j < 0 || j >= songs.length) return;
  [songs[i], songs[j]] = [songs[j], songs[i]];
  if (P.song === i) P.song = j; else if (P.song === j) P.song = i;
  saveSongs(); save(); drawSongs();
}
function del(i) {
  const s = songs[i];
  songs.splice(i, 1);
  if (P.song === i) P.song = -1; else if (P.song > i) P.song--;
  saveSongs(); save(); drawSongs();
  toast(`Deleted ${s.name}`);
}
$('songSave').onclick = () => {
  const name = $('songName').value.trim() || `Song ${songs.length + 1}`;
  songs.push(songOf(name));
  P.song = songs.length - 1;
  $('songName').value = '';
  saveSongs(); save(); drawSongs();
  toast(`Saved ${name}`);
};
$('songName').onkeydown = e => { if (e.key === 'Enter') $('songSave').click(); };
$('songUpdate').onclick = () => {
  if (!(P.song >= 0 && P.song < songs.length)) return;
  songs[P.song] = songOf(songs[P.song].name);
  saveSongs(); drawSongs();
  toast(`Updated ${songs[P.song].name}`);
};
$('songPrev').onclick = () => loadSong(P.song < 0 ? songs.length - 1 : P.song - 1);
$('songNext').onclick = () => loadSong(P.song + 1);
$('songExport').onclick = () => {
  const blob = new Blob([JSON.stringify({ app: 'encore-metronome', version: 1, songs }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'encore-metronome-setlist.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};
$('songImport').onclick = () => $('songFile').click();
$('songFile').onchange = async () => {
  const f = $('songFile').files[0];
  $('songFile').value = '';
  if (!f) return;
  try {
    const data = JSON.parse(await f.text()), list = Array.isArray(data) ? data : data.songs;
    if (!Array.isArray(list)) throw new Error('no songs in it');
    const good = list.filter(s => s && typeof s === 'object').map(s => ({ ...s, name: String(s.name || 'Song').slice(0, 80) }));
    songs.push(...good);
    saveSongs(); drawSongs();
    toast(`Added ${good.length} song${good.length === 1 ? '' : 's'}`);
  } catch (e) { toast('That file isn\'t a setlist: ' + e.message); }
};

// ---- stage view: a huge count, a flash on every beat, big buttons for a gig
function openStage() {
  $('stage').classList.remove('hidden');
  const el = $('stage');
  if (el.requestFullscreen && !document.fullscreenElement) el.requestFullscreen().catch(() => {});
  keepAwake(true);
}
function closeStage() {
  $('stage').classList.add('hidden');
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  if (!running) keepAwake(false);
}
$('stageBtn').onclick = openStage;
$('stageExit').onclick = closeStage;
$('stagePlay').onclick = toggle;
$('stagePrev').onclick = () => $('songPrev').click();
$('stageNext').onclick = () => $('songNext').click();
$('stage').addEventListener('click', e => { if (e.target.closest('button')) return; toggle(); });
// leaving fullscreen (Esc, or the phone's back gesture) also leaves stage view
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && !$('stage').classList.contains('hidden')) closeStage(); });

// ---- keyboard
document.addEventListener('keydown', e => {
  const t = e.target, tag = t && t.tagName;
  if (e.key === 'Escape' && !$('stage').classList.contains('hidden')) { closeStage(); return; }
  if (tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'INPUT' && !['checkbox', 'range'].includes(t.type)) return;
  if (tag === 'INPUT' && t.type === 'range' && e.key.startsWith('Arrow')) return;   // a focused slider keeps its arrows
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const stageToggle = () => $('stage').classList.contains('hidden') ? openStage() : closeStage();
  const fn = {
    ' ': toggle,
    ArrowUp: () => setBpm(Math.round(S.bpm) + (e.shiftKey ? 10 : 1)),
    ArrowDown: () => setBpm(Math.round(S.bpm) - (e.shiftKey ? 10 : 1)),
    ArrowRight: () => setBpm(Math.round(S.bpm) + 5),
    ArrowLeft: () => setBpm(Math.round(S.bpm) - 5),
    t: tap, b: () => { showTab('bpm'); findTap(); }, s: nextSub, f: stageToggle, m: toggleMute,
    c: () => { P.countIn = !P.countIn; $('countIn').checked = P.countIn; save(); toast('Count-in ' + (P.countIn ? 'on' : 'off')); },
    l: () => { $('tcOn').checked = !$('tcOn').checked; $('tcOn').onchange(); },
    '[': () => $('songPrev').click(), ']': () => $('songNext').click(),
    PageUp: () => $('songPrev').click(), PageDown: () => $('songNext').click(),
  }[k];
  if (!fn || e.repeat && k !== 'ArrowUp' && k !== 'ArrowDown' && k !== 'ArrowLeft' && k !== 'ArrowRight') return;
  e.preventDefault();
  fn();
});
function nextSub() {
  const i = SUBDIVISIONS.findIndex(d => d.id === S.sub);
  S.sub = SUBDIVISIONS[(i + 1) % SUBDIVISIONS.length].id;
  changed();
  toast('Subdivision: ' + SUBDIVISIONS.find(d => d.id === S.sub).name);
}

let toastTimer = null;
function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 2600);
}

// ---- Time check: the input
let stream = null, micNode = null, testInput = null;
async function openInput() {
  await audio();
  if (testInput) return;
  if (stream && stream.getTracks().some(t => t.readyState === 'live') && micNode && micNode.deviceId === P.inputId) return;
  closeInput();
  stream = await navigator.mediaDevices.getUserMedia({ audio: {
    deviceId: P.inputId ? { exact: P.inputId } : undefined,
    echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  micNode = ctx.createMediaStreamSource(stream);
  micNode.deviceId = P.inputId;
  micNode.connect(node);
  // the inputs, now that there's permission to see their names
  const devices = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput');
  const sel = $('input');
  sel.innerHTML = '';
  sel.append(new Option('Default microphone', ''));
  devices.forEach(d => { if (d.deviceId && d.deviceId !== 'default') sel.append(new Option(d.label || 'Input', d.deviceId)); });
  sel.value = [...sel.options].some(o => o.value === P.inputId) ? P.inputId : '';
}
function closeInput() {
  if (micNode) { micNode.disconnect(); micNode = null; }
  if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
}
$('input').onchange = async () => { P.inputId = $('input').value; save(); if (stream) { closeInput(); try { await openInput(); } catch (e) { showError(e); } } showLatency(); };
$('listen').value = P.listen;
$('listen').onchange = () => { P.listen = $('listen').value; save(); };
$('sens').value = P.sens;
const showSens = () => { $('sensText').textContent = P.sens < 35 ? 'only clear, loud notes' : P.sens > 70 ? 'picks up soft notes (and more noise)' : 'normal'; };
$('sens').oninput = () => { P.sens = +$('sens').value; save(); showSens(); };
$('tcOn').checked = P.tcOn;
$('tcOn').onchange = async () => {
  P.tcOn = $('tcOn').checked;
  save();
  if (P.tcOn) {
    try { await openInput(); } catch (e) { showError(e); P.tcOn = false; $('tcOn').checked = false; save(); return; }
    if (running && (!take || take.done)) { await beginTake(); toast('Listening from now on'); }
    else toast('Time check will listen when you press Start');
  } else {
    if (take && !take.done) finishTake();
    if (!calib) closeInput();
  }
};

// a rough guess when there's no calibration: twice what the browser says the output delay is
const latencyNow = () => P.latency ?? ((ctx.outputLatency || 0) + (ctx.baseLatency || 0)) * 2000;
function showLatency() {
  const el = $('latText');
  if (P.latency === null) { el.textContent = 'Not calibrated yet: early and late will be off by your device\'s delay'; el.classList.remove('ok'); return; }
  el.textContent = `Round trip ${P.latency.toFixed(1)} ms (measured ${P.latencyHow === 'clap' ? 'by clapping' : 'with speakers'}${P.latencyWhen ? ', ' + P.latencyWhen : ''})`;
  el.classList.add('ok');
}

// ---- Time check: calibration. The click goes out, round through the speakers and mic, and comes back this late.
let calib = null;
async function calibrate(kind) {
  if (calib) return;
  try { await audio(); await openInput(); } catch (e) { showError(e); return; }
  if (running) stop();
  const sr = ctx.sampleRate, clap = kind === 'clap', need = clap ? 17 : 13;
  let resolve;
  const done = new Promise(r => { resolve = r; });
  calib = { kind, need, resolve, det: new OnsetDetector(sr, { sensitivity: 60 }), clicks: [], onsets: [] };
  for (const b of [$('calSpk'), $('calClap'), $('playBtn')]) b.disabled = true;
  $('latText').classList.remove('ok');
  $('latText').textContent = clap ? 'Clap with every click, right on it...' : 'Listening for the clicks: stay quiet...';
  // plain, sharp, loud clicks
  node.port.postMessage({ type: 'sounds', sounds: makeSounds('classic', sr) });
  node.port.postMessage({ type: 'settings', settings: { ...cleanSettings({ bpm: clap ? 90 : 100, top: 4, accents: [3, 3, 3, 3] }), vol: { accent: 100, beat: 100, sub: 0, poly: 0 } } });
  master.gain.cancelScheduledValues(ctx.currentTime);
  master.gain.value = Math.max(masterGain(), 0.6);
  node.port.postMessage({ type: 'listen', on: true });
  node.port.postMessage({ type: 'start', countIn: false });
  await done;
  node.port.postMessage({ type: 'stop' });
  await new Promise(r => setTimeout(r, 700));
  const c = calib;
  calib = null;
  // back to the user's sound
  master.gain.value = muted ? 0 : masterGain();
  sendSounds(); sendSettings();
  node.port.postMessage({ type: 'listen', on: !!(take && !take.done) || !!finder });
  for (const b of [$('calSpk'), $('calClap'), $('playBtn')]) b.disabled = false;
  const clicks = (clap ? c.clicks.slice(4, 16) : c.clicks.slice(0, 12)).map(e => e.frame);
  const r = measureLatency(clicks, c.onsets, sr, clap ? { minS: -0.1, maxS: 0.45, maxSpreadMs: 25 } : {});
  if (r.ok) {
    P.latency = r.ms; P.latencyHow = kind; P.latencyWhen = new Date().toLocaleDateString();
    save();
    showLatency();
    $('latText').textContent += clap ? `  (your claps spread ${r.spreadMs.toFixed(0)} ms)` : '';
    toast(`Calibrated: ${r.ms.toFixed(1)} ms round trip`);
  } else {
    showLatency();
    $('latText').classList.remove('ok');
    $('latText').textContent = (clap ? `Heard ${r.matched} of ${r.total} claps line up. Clap right on each click, steadily, and try again.`
      : `Only heard ${r.matched} of ${r.total} clicks clearly. Turn the speakers up, bring the mic closer, keep the room quiet, and try again.`) + (P.latency !== null ? ` (Still using ${P.latency.toFixed(1)} ms.)` : '');
  }
  if (!P.tcOn && !finder) closeInput();
  return r;
}
$('calSpk').onclick = () => calibrate('speakers');
$('calClap').onclick = () => calibrate('clap');

// ---- Time check: a take (from Start to Stop)
let take = null;
async function beginTake() {
  await openInput();
  const sr = ctx.sampleRate;
  take = { det: new OnsetDetector(sr, { sensitivity: P.sens }), tc: new TimeCheck(sr, { latencyMs: latencyNow(), listen: P.listen }),
           latencyMs: latencyNow(), guessed: P.latency === null, gaps: [], start: null, done: false, dirty: true, word: allOnes(S.groups) ? 'beat' : 'count' };
  node.port.postMessage({ type: 'listen', on: true });
  $('tcLive').classList.remove('hidden');
}
function addCountToTake(ev) {
  take.tc.addCount(ev);
  if (take.start === null && !ev.countIn) take.start = ev.frame;
  if (ev.gap && take.start !== null) {
    const a = (ev.frame - take.start) / ctx.sampleRate, b = a + ev.len / ctx.sampleRate, last = take.gaps[take.gaps.length - 1];
    if (last && Math.abs(last[1] - a) < 1e-3) last[1] = b; else take.gaps.push([a, b]);
  }
}
function finishTake() {
  if (!take || take.done) return;
  take.tc.resolve(true);
  take.done = true;
  if (!calib && !finder) node.port.postMessage({ type: 'listen', on: false });
  drawTake(true);
}

const errColour = e => Math.abs(e) <= 10 ? '#7bd3a4' : Math.abs(e) <= 25 ? '#e8b04b' : '#ef4444';
function canvas(id) {
  const c = $(id), dpr = window.devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight;
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
  const g = c.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  g.font = '11px DM Sans, sans-serif';
  return { g, w, h };
}
let reportAt = 0;
function drawTake(final) {
  if (!take) return;
  const hits = take.tc.hits.filter(h => !h.countIn), last = hits[hits.length - 1];
  // the last note, big
  const lh = $('lastHit');
  if (last) {
    lh.style.color = errColour(last.err);
    lh.innerHTML = '';
    lh.append(Math.abs(last.err) < 2 ? 'Right on' : `${Math.abs(last.err).toFixed(0)} ms ${last.err < 0 ? 'early' : 'late'}`);
    const sm = document.createElement('small');
    sm.textContent = `last note: bar ${last.bar + 1}, ${positionLabel(last)}` + (last.gap ? ' (silent bar)' : '');
    lh.append(sm);
  } else lh.innerHTML = `<small>${final ? 'No notes heard.' : 'Listening... play along with the click.'}</small>`;
  // the last 16 notes on an early/late line
  {
    const { g, w, h } = canvas('hitMeter'), R = 60, X = e => w / 2 + Math.max(-1, Math.min(1, e / R)) * (w / 2 - 10);
    for (let e = -R; e <= R; e += 10) { g.fillStyle = e === 0 ? '#f2efe8' : '#3a332e'; g.fillRect(X(e) - (e === 0 ? 1 : 0.5), 8, e === 0 ? 2 : 1, h - 16); }
    g.fillStyle = '#91887d';
    g.fillText('-60 ms', 4, h - 3); g.fillText('+60 ms', w - 42, h - 3);
    const recent = hits.slice(-16);
    recent.forEach((hit, i) => {
      const newest = i === recent.length - 1;
      g.globalAlpha = 0.25 + 0.75 * (i + 1) / recent.length;
      g.fillStyle = errColour(hit.err);
      g.beginPath(); g.arc(X(hit.err), h / 2, newest ? 9 : 5, 0, 2 * Math.PI); g.fill();
    });
    g.globalAlpha = 1;
  }
  const now = performance.now();
  if (!final && now - reportAt < 400) return;
  reportAt = now;
  const sum = summarize(take.tc.hits, { word: take.word });
  // each beat position
  {
    const { g, w, h } = canvas('posChart'), pos = sum.positions, mid = h / 2 - 6;
    const R = Math.max(20, ...pos.map(p => Math.abs(p.mean) + p.spread)) * 1.1, Y = e => mid - Math.max(-1, Math.min(1, e / R)) * (mid - 8);
    g.fillStyle = '#3a332e'; g.fillRect(0, Y(0), w, 1);
    g.fillStyle = '#91887d'; g.fillText(`±${R.toFixed(0)} ms`, 4, 12);
    const slot = (w - 40) / Math.max(1, pos.length);
    pos.forEach((p, i) => {
      const x = 36 + slot * i + slot / 2, bw = Math.max(4, Math.min(28, slot * 0.55));
      g.fillStyle = errColour(p.mean);
      g.fillRect(x - bw / 2, Math.min(Y(0), Y(p.mean)), bw, Math.max(1, Math.abs(Y(p.mean) - Y(0))));
      g.fillStyle = 'rgb(242 239 232 / 0.6)';
      g.fillRect(x - 0.5, Y(p.mean + p.spread), 1, Y(p.mean - p.spread) - Y(p.mean + p.spread));
      g.fillRect(x - 4, Y(p.mean + p.spread), 8, 1); g.fillRect(x - 4, Y(p.mean - p.spread), 8, 1);
      g.fillStyle = p.sub ? '#91887d' : '#f2efe8';
      const label = p.sub ? ({ 2: ['', '&'], 3: ['', 't', 'l'], 4: ['', 'e', '&', 'a'] }[p.nsub]?.[p.sub] ?? '.') : String(p.count + 1);
      if (slot >= 9 || !p.sub) g.fillText(label, x - g.measureText(label).width / 2, h - 2);
    });
  }
  // over time, with the silent bars shaded
  {
    const { g, w, h } = canvas('driftChart'), T = Math.max(10, last ? last.at + 1 : 10), x0 = 36;
    const R = Math.max(30, ...hits.map(hh => Math.min(120, Math.abs(hh.err)))) * 1.1, X = t => x0 + (w - x0 - 6) * t / T, Y = e => h / 2 - Math.max(-1, Math.min(1, e / R)) * (h / 2 - 10);
    g.fillStyle = 'rgb(145 136 125 / 0.14)';
    for (const [a, b] of take.gaps) g.fillRect(X(a), 0, Math.max(1, X(b) - X(a)), h);
    g.fillStyle = '#3a332e'; g.fillRect(x0, Y(0), w - x0, 1);
    g.fillStyle = '#91887d'; g.fillText(`+${R.toFixed(0)}`, 4, 12); g.fillText(`-${R.toFixed(0)}`, 4, h - 4); g.fillText(`${Math.round(T)} s`, w - 30, h - 4);
    for (const hit of hits) { g.fillStyle = errColour(hit.err); g.globalAlpha = 0.7; g.fillRect(X(hit.at) - 1.5, Y(hit.err) - 1.5, 3, 3); }
    g.globalAlpha = 1;
    // the running average of the last 8 notes
    g.strokeStyle = '#f2efe8'; g.lineWidth = 1.5; g.beginPath();
    hits.forEach((hit, i) => { const s = hits.slice(Math.max(0, i - 7), i + 1), m = s.reduce((a, b) => a + b.err, 0) / s.length; i ? g.lineTo(X(hit.at), Y(m)) : g.moveTo(X(hit.at), Y(m)); });
    g.stroke();
  }
  // the report
  const rep = $('report');
  rep.innerHTML = '';
  if (sum.n >= 4) {
    const sc = document.createElement('div');
    sc.className = 'score';
    sc.innerHTML = `<b>${sum.score}</b><span></span>`;
    sc.querySelector('span').textContent = sum.grade + (final ? '' : '  (so far)');
    rep.append(sc);
  }
  const ul = document.createElement('ul');
  if (take.guessed) sum.lines.unshift('Not calibrated: these numbers include your device\'s own delay (a guess was taken off). Calibrate for real ones.');
  for (const line of sum.lines) { const li = document.createElement('li'); li.textContent = line; ul.append(li); }
  rep.append(ul);
  const st = document.createElement('div');
  st.className = 'stats';
  st.textContent = sum.n >= 4 ? `${sum.n} notes  ·  average ${sum.mean >= 0 ? '+' : ''}${sum.mean.toFixed(1)} ms  ·  spread ${sum.spread.toFixed(1)} ms  ·  round trip ${take.latencyMs.toFixed(1)} ms` +
    (take.tc.extra ? `  ·  ${take.tc.extra} off the grid (ignored)` : '') : '';
  rep.append(st);
  if (TEST) window.__metroReport = { ...sum, hits: hits.length, extra: take.tc.extra, final };
}
const positionLabel = h => {
  const word = take.word, n = h.count + 1;
  if (!h.sub) return `${word} ${n}`;
  const names = { 2: ['', '&'], 3: ['', 'trip', 'let'], 4: ['', 'e', '&', 'a'] }[h.nsub];
  return names ? `the ${names[h.sub]} of ${n}` : `${word} ${n}, note ${h.sub + 1}`;
};

// ---- test hooks (only with ?selftest in the address): a loopback "room" and a fed-in player, to check it all end to end
if (TEST) window.__metro = {
  audio, get ctx() { return ctx; }, get running() { return running; }, get latency() { return P.latency; },
  /** the clicks straight back into the input, `sec` later: a speaker and mic with a known round trip */
  loopback(sec) { const d = ctx.createDelay(2); d.delayTime.value = sec; master.connect(d); d.connect(node); testInput = d; },
  unloop() { if (testInput) { try { master.disconnect(testInput); } catch {} testInput.disconnect(); } testInput = { connect() {}, disconnect() {} }; },
  /** a recorded player: plays `samples` into the input starting at frame `at`, and starts the metronome on frame `startAt` */
  feed(samples, at, startAt) {
    const b = ctx.createBuffer(1, samples.length, ctx.sampleRate);
    b.copyToChannel(Float32Array.from(samples), 0);
    const src = ctx.createBufferSource();
    src.buffer = b; src.connect(node); src.start(at / ctx.sampleRate);
    testInput = src; testStartAt = startAt;
  },
  calibrate, start, stop, get take() { return take; }, setLatency(ms) { P.latency = ms; save(); showLatency(); },
};

// ---- the page as it was left
refresh();
showSens();
showLatency();
requestAnimationFrame(draw);

// ---- Find the BPM: tap along, or let it listen (the mic, or a song file)
let found = null, findTaps = [], finder = null, finderTimer = null;
function showFound(bpm, info) {
  found = bpm;
  $('findBpm').textContent = bpm ? bpm.toFixed(1) : '--';
  $('findUse').disabled = !bpm;
  if (info !== undefined) $('findInfo').textContent = info;
}
function findTap() {
  const now = performance.now();
  // a pause of 3 s starts over
  if (findTaps.length && now - findTaps[findTaps.length - 1] > 3000) findTaps = [];
  findTaps.push(now);
  $('tapPad').animate([{ background: 'rgb(255 59 0 / 0.35)' }, { background: 'rgb(255 255 255 / 0.04)' }], { duration: 180 });
  const t = tapTempo(findTaps);
  if (!t || findTaps.length < 4) { showFound(null, findTaps.length < 2 ? 'Keep tapping...' : `${findTaps.length} taps, keep going...`); return; }
  const steady = t.spreadMs < 12 ? 'very steady' : t.spreadMs < 25 ? 'steady' : 'a bit uneven, keep going';
  showFound(t.bpm, `${t.taps} taps, ${steady} (within ${Math.round(t.spreadMs)} ms). Stop for 3 seconds to start over.`);
}
$('tapPad').addEventListener('pointerdown', e => { e.preventDefault(); findTap(); });
$('tapPad').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); findTap(); } });
$('findHalf').onclick = () => { if (found) showFound(found / 2); };
$('findDouble').onclick = () => { if (found) showFound(found * 2); };
$('findReset').onclick = () => { findTaps = []; stopListening(); showFound(null, 'Tap along with the song on the beat.'); };
$('findUse').onclick = () => { if (found) { setBpm(found); toast(`Tempo set to ${(Math.round(found * 10) / 10)} BPM`); } };

function listenResult(r, seconds, done) {
  if (!r) { showFound(null, `Listening... (${Math.floor(seconds)} s)`); return; }
  const sure = r.confidence > 0.6 ? 'Sure of it' : r.confidence > 0.25 ? 'Fairly sure' : 'Not sure: the beat isn\'t clear. Try tapping along instead';
  const alt = r.others.length ? ` Could also be counted as ${r.others.map(b => b.toFixed(1)).join(' or ')}.` : '';
  showFound(r.bpm, `${sure}.${alt}` + (done ? '' : ` (listening, ${Math.floor(seconds)} s)`));
}
async function startListening() {
  try {
    await openInput();
    finder = new TempoFinder(ctx.sampleRate);
    node.port.postMessage({ type: 'listen', on: true });
    $('findListen').textContent = 'Stop listening';
    showFound(null, 'Listening... play the song near the mic.');
    finderTimer = setInterval(() => {
      if (!finder) return;
      listenResult(finder.estimate(), finder.seconds, false);
      if (finder.seconds >= 30) stopListening();
    }, 1000);
  } catch (e) { finder = null; showError(e); }
}
function stopListening() {
  if (!finder) return;
  const f = finder;
  finder = null;
  clearInterval(finderTimer);
  $('findListen').textContent = 'Listen through the mic';
  if (!(take && !take.done) && !calib) node.port.postMessage({ type: 'listen', on: false });
  if (!P.tcOn && !calib) closeInput();
  listenResult(f.estimate(), f.seconds, true);
}
$('findListen').onclick = () => finder ? stopListening() : startListening();

$('findFile').onclick = () => $('findFileInput').click();
$('findFileInput').onchange = async () => {
  const file = $('findFileInput').files[0];
  $('findFileInput').value = '';
  if (!file) return;
  try {
    await audio();
    showFound(null, `Reading ${file.name}...`);
    const buf = await ctx.decodeAudioData(await file.arrayBuffer());
    // mono, then through the finder a slice at a time so the page stays responsive
    const n = buf.length, mono = new Float32Array(n), chans = buf.numberOfChannels;
    for (let c = 0; c < chans; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) mono[i] += d[i] / chans; }
    const f = new TempoFinder(buf.sampleRate), step = buf.sampleRate * 10;
    for (let i = 0; i < n; i += step) {
      f.push(mono.subarray(i, Math.min(n, i + step)));
      showFound(null, `Listening to ${file.name}... ${Math.round(Math.min(n, i + step) / n * 100)}%`);
      await new Promise(r => setTimeout(r, 0));
    }
    const r = f.estimate();
    if (!r) { showFound(null, 'That file is too short to find a tempo (it needs a few seconds).'); return; }
    listenResult(r, f.seconds, true);
  } catch (e) {
    showFound(null, 'Couldn\'t read that file. Try a WAV or MP3.');
  }
};

// ---- the tabs beside (or under) the metronome
function showTab(name) {
  if (!document.querySelector(`.tabBar [data-tab="${name}"]`) || getComputedStyle(document.querySelector(`.tabBar [data-tab="${name}"]`)).display === 'none') name = 'rhythm';
  for (const b of document.querySelectorAll('.tabBar button')) {
    b.classList.toggle('on', b.dataset.tab === name);
    b.setAttribute('aria-selected', b.dataset.tab === name);
    // keep the chosen tab in view when the bar scrolls sideways (phones)
    if (b.dataset.tab === name) { const bar = b.parentElement; bar.scrollLeft = Math.max(0, b.offsetLeft - (bar.clientWidth - b.offsetWidth) / 2); }
  }
  for (const sec of document.querySelectorAll('.tabBody > section')) sec.classList.toggle('show', sec.dataset.tab === name);
  store.set('tab', name);
  // charts drawn while hidden have no size: draw them again now they're showing
  if (name === 'time' && take) drawTake(take.done);
}
for (const b of document.querySelectorAll('.tabBar button')) b.onclick = () => showTab(b.dataset.tab);
// a dot on Time check while it's listening, so you can see it's on from any tab
function markListening() {
  const t = $('tabTime');
  const on = $('tcOn').checked;
  if (on && !t.querySelector('.dot')) t.insertAdjacentHTML('beforeend', '<span class="dot" aria-label="listening"></span>');
  if (!on) t.querySelector('.dot')?.remove();
}
{ const prev = $('tcOn').onchange; $('tcOn').onchange = function (e) { const r = prev && prev.call(this, e); markListening(); return r; }; }
markListening();
showTab(store.get('tab', 'rhythm'));
