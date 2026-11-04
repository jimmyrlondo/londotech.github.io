// Encore Tune: the page. Listens to a microphone or interface input in the
// browser (nothing is recorded or sent anywhere) and shows the string or note
// you're playing and how far off it is.
import { estimatePitch, downsample, reading, noteName, noteHz, pillsFor, drumPeak, rodSpread, tomSteps } from './tune-core.js';
import { TUNINGS } from './tunings.js';

const $ = id => document.getElementById(id);
const store = {
  get: (k, d) => { try { const v = localStorage.getItem('encoreTune.' + k); return v === null ? d : v; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem('encoreTune.' + k, v); } catch {} },
};

const instruments = [];
// instruments, by family
for (const f of TUNINGS.families) {
  const group = document.createElement('optgroup');
  group.label = f.name;
  for (const i of f.instruments) {
    const o = new Option(i.name, instruments.length);
    instruments.push(i);
    group.append(o);
  }
  $('instrument').append(group);
}
TUNINGS.temperaments.forEach((t, i) => $('temperament').append(new Option(t.name, i)));
['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'].forEach((n, i) => $('root').append(new Option('in ' + n, i)));
$('a4preset').append(new Option('Presets', ''));
TUNINGS.references.forEach(r => $('a4preset').append(new Option(r.name, r.hz)));

const startInstrument = instruments.findIndex(i => i.name === store.get('instrument', 'Guitar (6-string)'));
$('instrument').value = String(Math.max(0, startInstrument));
$('a4').value = store.get('a4', '440');
$('temperament').value = store.get('temperament', '0');
$('root').value = store.get('root', '0');
$('strobe').checked = store.get('strobe', '0') === '1';
$('tone').value = store.get('tone', 'pluck');
$('volume').value = store.get('volume', '60');

// strings: what a pitch is matched against, one per pill (a pair at one pitch is one pill)
let pills = [], strings = [], tuned = [], instrument = null, playing = null, last = null, ctx = null, hasCourses = false;

function fillTunings(keep) {
  instrument = instruments[+$('instrument').value];
  $('tuning').innerHTML = '';
  instrument.tunings.forEach((t, i) => {
    // one name per course
    let at = 0;
    const firsts = t.courses.map(size => { const n = t.notes[at]; at += size; return n.replace(/\d+$/, ''); });
    const notes = t.notes.length ? '  (' + firsts.join(' ') + ')' : '';
    $('tuning').append(new Option(t.name + notes, i));
  });
  $('tuning').value = String(Math.min(keep ?? 0, instrument.tunings.length - 1));
  $('tuning').disabled = instrument.tunings.length < 2;
  tuningChanged();
}

function tuningChanged() {
  const t = instrument.tunings[+$('tuning').value] || instrument.tunings[0];
  stopTone();
  pills = pillsFor(t.midi, t.courses);
  hasCourses = t.courses.some(c => c > 1);
  strings = pills.map(p => p.note);
  tuned = strings.map(() => false);
  store.set('instrument', instrument.name);
  store.set('tuning', $('tuning').value);
  let tip = t.note || '';
  if (instrument.transpose) tip = `Shows the note you read (concert pitch ${instrument.transpose > 0 ? '-' : '+'}${Math.abs(instrument.transpose)} semitones). ` + tip;
  $('tip').textContent = tip;
  drawStrings(null);
}

function drawStrings(r) {
  const box = $('strings');
  box.innerHTML = '';
  let group = null;
  strings.forEach((m, i) => {
    if (!group || pills[i].course !== pills[i - 1].course) {
      group = document.createElement('div');
      const size = instrument.tunings[+$('tuning').value]?.courses[pills[i].course] || 1;
      group.className = 'course' + (size > 1 ? ' paired' : '');
      box.append(group);
    }
    const p = document.createElement('button');
    const sounding = playing && playing.key === i;
    p.type = 'button';
    p.className = 'pill' + (r && r.string === i ? ' active' : '') + (tuned[i] ? ' done' : '') + (sounding ? ' playing' : '');
    p.textContent = noteName(m + (instrument.transpose || 0));
    p.title = sounding ? 'Stop' : 'Hear ' + p.textContent;
    if (pills[i].count > 1) {
      const c = document.createElement('span');
      c.className = 'count';
      c.textContent = '\u00d7' + pills[i].count;
      p.append(c);
      p.title += ' (' + pills[i].count + ' strings at this pitch)';
    }
    if (r && r.string === i && !sounding) { p.style.borderColor = colourFor(r); p.style.background = colourFor(r) + '33'; }
    p.onclick = () => toggleTone(i);
    group.append(p);
  });
  $('hearHint').classList.toggle('hidden', !strings.length);
}

const colourFor = r => !r || r.note < 0 ? '#91887d' : Math.abs(r.cents) <= 3 ? '#22c55e' : Math.abs(r.cents) <= 15 ? '#eab308' : '#ef4444';

$('instrument').onchange = () => fillTunings(0);
$('tuning').onchange = tuningChanged;
$('a4').onchange = () => { $('a4').value = Math.min(480, Math.max(400, +$('a4').value || 440)); store.set('a4', $('a4').value); };
$('a4preset').onchange = () => { if ($('a4preset').value) { $('a4').value = $('a4preset').value; store.set('a4', $('a4').value); } $('a4preset').value = ''; };
$('temperament').onchange = () => { store.set('temperament', $('temperament').value); $('root').disabled = $('temperament').value === '0'; };
$('root').onchange = () => store.set('root', $('root').value);
$('root').disabled = $('temperament').value === '0';
const strobeHint = () => $('strobeHint').classList.toggle('hidden', !$('strobe').checked);
$('strobe').onchange = () => { store.set('strobe', $('strobe').checked ? '1' : '0'); strobeHint(); };
strobeHint();
const replay = () => { if (playing) { const { key, hz } = playing; stopTone(); playTone(key, typeof key === 'number' ? toneHz(key) : hz); } };
$('tone').onchange = () => { store.set('tone', $('tone').value); replay(); };
$('volume').oninput = () => { store.set('volume', $('volume').value); if (playing) playing.gain.gain.setTargetAtTime(volume(), ctx.currentTime, 0.03); };
// a new reference pitch or temperament retunes a steady tone that's sounding
for (const id of ['a4', 'a4preset', 'temperament', 'root']) $(id).addEventListener('change', () => { if (playing && playing.steady) replay(); });
fillTunings(+store.get('tuning', '0'));

// ---- reference tones: tap a string to hear it (no microphone needed)
const volume = () => Math.pow(+$('volume').value / 100, 2) * 0.5;
// a string-like spectrum: a full fundamental plus fading overtones, so low notes still come through small speakers
const HARMONICS = [1, 0.62, 0.42, 0.3, 0.2, 0.14, 0.09, 0.06];

function audio() {
  ctx = ctx || new AudioContext();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function toneHz(i) {
  return noteHz(strings[i], +$('a4').value || 440, TUNINGS.temperaments[+$('temperament').value].cents, +$('root').value);
}

/** A plucked note, built sample by sample so the pitch is exact: each overtone dies away faster than the last */
function pluck(hz, seconds) {
  const sr = ctx.sampleRate, n = Math.floor(sr * seconds), data = new Float32Array(n);
  const parts = HARMONICS.map((a, k) => ({ w: 2 * Math.PI * hz * (k + 1) / sr, a, decay: Math.exp(-(1.1 + k * 0.9) / sr) }))
                         .filter(p => p.w < Math.PI * 0.9);
  for (const p of parts) {
    let amp = p.a;
    for (let t = 0; t < n; t++) { data[t] += amp * Math.sin(p.w * t); amp *= p.decay; }
  }
  let peak = 0;
  for (let t = 0; t < n; t++) peak = Math.max(peak, Math.abs(data[t]));
  const attack = Math.floor(sr * 0.004), tail = Math.floor(sr * 0.25);
  for (let t = 0; t < n; t++) {
    let g = 1 / (peak || 1);
    if (t < attack) g *= t / attack;
    if (t > n - tail) g *= (n - t) / tail;
    data[t] *= g;
  }
  const buffer = ctx.createBuffer(1, n, sr);
  buffer.copyToChannel(data, 0);
  return buffer;
}

function toggleTone(i) { playTone(i, toneHz(i)); }

/** Plays a reference tone; the same key again stops it */
function playTone(key, hz) {
  const again = playing && playing.key === key;
  stopTone();
  if (again) return;
  audio();
  const steady = $('tone').value === 'steady', now = ctx.currentTime;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(volume(), now + (steady ? 0.05 : 0.004));
  gain.connect(ctx.destination);
  let node;
  if (steady) {
    const real = new Float32Array(HARMONICS.length + 1), imag = new Float32Array(HARMONICS.length + 1);
    HARMONICS.forEach((a, k) => { imag[k + 1] = a * Math.pow(0.8, k); });
    node = ctx.createOscillator();
    node.setPeriodicWave(ctx.createPeriodicWave(real, imag));
    node.frequency.value = hz;
  } else {
    node = ctx.createBufferSource();
    node.buffer = pluck(hz, 5);
  }
  node.connect(gain);
  node.start(now);
  const me = { key, hz, node, gain, steady };
  node.onended = () => { if (playing === me) { playing = null; redrawTones(); } };
  playing = me;
  redrawTones();
}
function redrawTones() { drawStrings(last); drawTomNotes(); }

function stopTone() {
  if (!playing) return;
  const p = playing, now = ctx.currentTime;
  playing = null;
  p.gain.gain.cancelScheduledValues(now);
  p.gain.gain.setValueAtTime(p.gain.gain.value, now);
  p.gain.gain.setTargetAtTime(0, now, 0.03);
  try { p.node.stop(now + 0.2); } catch {}
  redrawTones();
}

// ---- listening
let analyser = null, source = null, stream = null, buf = null;
let quiet = 0, smoothed = 0, inTuneFrames = 0, lastString = -1, strobePhase = 0;

async function listen(deviceId) {
  if (stream) stream.getTracks().forEach(t => t.stop());
  stream = await navigator.mediaDevices.getUserMedia({ audio: {
    deviceId: deviceId ? { exact: deviceId } : undefined,
    echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  audio();
  if (source) source.disconnect();
  source = ctx.createMediaStreamSource(stream);
  analyser = analyser || ctx.createAnalyser();
  analyser.fftSize = 8192;
  buf = new Float32Array(analyser.fftSize);
  source.connect(analyser);
  // the inputs, now that there's permission to see their names
  const devices = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput');
  const sel = $('input'), keep = deviceId || '';
  sel.innerHTML = '';
  sel.append(new Option('Default microphone', ''));
  devices.forEach(d => { if (d.deviceId && d.deviceId !== 'default') sel.append(new Option(d.label || 'Input', d.deviceId)); });
  sel.value = keep;
}

$('input').onchange = () => listen($('input').value).catch(showError);
$('startBtn').onclick = async () => {
  try {
    await listen('');
    $('startView').classList.add('hidden');
    $('status').textContent = playPrompt();
    requestAnimationFrame(frame);
  } catch (e) { showError(e); }
};
function showError(e) {
  $('err').classList.remove('hidden');
  $('err').textContent = e && e.name === 'NotAllowedError' ? 'The browser wasn\'t allowed to use the microphone. Allow it (the icon in the address bar) and try again.'
                                                         : 'Couldn\'t open the input: ' + (e && e.message || e);
}

let tick = 0;
function frame() {
  requestAnimationFrame(frame);
  if (!analyser) return;
  if (mode === 'drums') { drumFrame(); return; }
  if (++tick % 3 === 0) {
    analyser.getFloatTimeDomainData(buf);
    const stride = Math.max(1, Math.round(ctx.sampleRate / 24000));
    const hz = estimatePitch(downsample(buf, stride), ctx.sampleRate / stride);
    if (hz > 0) {
      quiet = 0;
      smoothed = smoothed > 0 && Math.abs(hz / smoothed - 1) < 0.03 ? smoothed * 0.6 + hz * 0.4 : hz;
      const temper = TUNINGS.temperaments[+$('temperament').value].cents;
      last = reading(smoothed, +$('a4').value || 440, strings, temper, +$('root').value);
      if (last.string >= 0 && Math.abs(last.cents) <= 3 && last.string === lastString) { if (++inTuneFrames >= 6) tuned[last.string] = true; }
      else inTuneFrames = 0;
      lastString = last.string;
    } else if (++quiet > 8) { last = null; smoothed = 0; }
    show();
  }
  if (last && last.note >= 0) strobePhase += last.cents * 0.18;
  drawMeter();
}

// "  (string 6)", or for paired strings "  (course 6)" and, when the pair has two pitches, which one
function whichString(r) {
  if (r.string < 0 || !instrument.part) return '';
  const p = pills[r.string], courses = pills[pills.length - 1].course + 1;
  if (instrument.part !== 'string') return `  (${instrument.part} ${p.course + 1})`;
  if (!hasCourses) return `  (string ${courses - p.course})`;
  const same = pills.filter(q => q.course === p.course).map(q => q.note);
  const which = same.length < 2 ? '' : p.note === Math.max(...same) ? ', high string' : ', low string';
  return `  (course ${courses - p.course}${which})`;
}

const playPrompt = () => strings.length && instrument.part === 'string' ? 'Play a string' : instrument.part === 'drum' ? 'Play a drum' : 'Play a note';

function show() {
  const r = last, have = r && r.note >= 0, t = instrument.transpose || 0;
  $('big').innerHTML = have ? noteName(r.note + t, false) + '<sub>' + (Math.floor((r.note + t) / 12) - 1) + '</sub>' : '--';
  $('big').style.color = have ? '' : '#91887d';
  $('concert').textContent = have && t ? 'sounds ' + noteName(r.note) + ' (concert)' : '';
  const status = $('status');
  status.style.color = colourFor(r);
  status.textContent = !have ? playPrompt()
    : Math.abs(r.cents) <= 3 ? 'In tune'
    : (r.cents < 0 ? 'Flat ' : 'Sharp ') + Math.abs(r.cents).toFixed(0) + ' cents' + whichString(r);
  $('hz').textContent = have ? `${smoothed.toFixed(1)} Hz   (target ${r.targetHz.toFixed(1)} Hz)` : '';
  drawStrings(r);
}

function drawMeter() {
  const c = $('meter'), dpr = window.devicePixelRatio || 1;
  const w = c.clientWidth, h = c.clientHeight;
  if (c.width !== w * dpr) { c.width = w * dpr; c.height = h * dpr; }
  const g = c.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = '#2c2723';
  g.fillRect(0, 0, w, h);
  const r = last, have = r && r.note >= 0, colour = colourFor(r);
  if ($('strobe').checked) {
    g.fillStyle = have ? colour : '#91887d55';
    const stripe = 18;
    for (let x = -stripe * 2 + (strobePhase % (stripe * 2) + stripe * 2) % (stripe * 2); x < w; x += stripe * 2) g.fillRect(x, 0, stripe, h);
    return;
  }
  for (let cents = -50; cents <= 50; cents += 10) {
    const x = (cents + 50) / 100 * w;
    g.fillStyle = cents === 0 ? '#f2efe8' : '#91887d';
    g.fillRect(x - (cents === 0 ? 1 : 0.5), 6, cents === 0 ? 2 : 1, h - 12);
  }
  if (have) {
    const x = (Math.max(-50, Math.min(50, r.cents)) + 50) / 100 * w;
    g.fillStyle = colour;
    g.beginPath();
    g.roundRect ? g.roundRect(x - 4, 2, 8, h - 4, 3) : g.rect(x - 4, 2, 8, h - 4);
    g.fill();
  }
}
drawMeter();

// ---- drums: catch each hit and measure it
const DRUMS = [['Snare 13"', 8], ['Snare 14"', 10], ['Rack tom 8"', 6], ['Rack tom 10"', 6], ['Rack tom 12"', 6], ['Rack tom 13"', 6],
               ['Floor tom 14"', 8], ['Floor tom 16"', 8], ['Floor tom 18"', 8], ['Kick 18"', 8], ['Kick 20"', 8], ['Kick 22"', 10], ['Kick 24"', 10], ['Other', 8]];
DRUMS.forEach(([name], i) => $('drum').append(new Option(name, i)));
for (let n = 3; n <= 16; n++) $('rods').append(new Option(n + ' rods', n));
$('drumTarget').append(new Option('The nearest note', ''));
for (let m = 24; m <= 72; m++) $('drumTarget').append(new Option(noteName(m), m));
for (let m = 36; m <= 60; m++) $('tomTop').append(new Option(noteName(m), m));

let mode = 'pitch', drumSeg = 'rods', rodHz = [], nextRod = 0, drumLast = null;
let lastRms = 0, hitAt = 0, pending = false;

function setMode(m) {
  mode = m;
  store.set('mode', m);
  stopTone();
  $('tabPitch').classList.toggle('on', m === 'pitch');
  $('tabDrums').classList.toggle('on', m === 'drums');
  $('pitchView').classList.toggle('hidden', m !== 'pitch');
  $('drumView').classList.toggle('hidden', m !== 'drums');
  if (m === 'drums') { drawRods(); drawDrumMeter(); }
}
function setSeg(seg) {
  drumSeg = seg;
  store.set('drumSeg', seg);
  $('segRods').classList.toggle('on', seg === 'rods');
  $('segCenter').classList.toggle('on', seg === 'center');
  $('rodsPanel').classList.toggle('hidden', seg !== 'rods');
  $('centerPanel').classList.toggle('hidden', seg !== 'center');
  drawDrumMeter();
}
function resetRods() {
  rodHz = new Array(+$('rods').value).fill(0);
  nextRod = 0;
  drawRods();
}
$('tabPitch').onclick = () => setMode('pitch');
$('tabDrums').onclick = () => setMode('drums');
$('segRods').onclick = () => setSeg('rods');
$('segCenter').onclick = () => setSeg('center');
$('drum').onchange = () => { store.set('drum', $('drum').value); $('rods').value = DRUMS[+$('drum').value][1]; store.set('rods', $('rods').value); resetRods(); };
$('rods').onchange = () => { store.set('rods', $('rods').value); resetRods(); };
$('rodsReset').onclick = resetRods;
$('drumTarget').onchange = () => { store.set('drumTarget', $('drumTarget').value); showDrum(); };
$('drumHear').onclick = () => { const t = drumTargetNote(); if (t !== null) playTone('drumTarget', noteHz(t, +$('a4').value || 440, new Array(12).fill(0), 0)); };
for (const id of ['tomTop', 'tomCount', 'tomStep']) $(id).onchange = () => { store.set(id, $(id).value); drawTomNotes(); };

const drumTargetNote = () => $('drumTarget').value === '' ? (drumLast ? drumLast.note : null) : +$('drumTarget').value;
const a4 = () => +$('a4').value || 440;
const centsColour = c => c === null ? '#91887d' : Math.abs(c) <= 8 ? '#22c55e' : Math.abs(c) <= 20 ? '#eab308' : '#ef4444';

function drumFrame() {
  analyser.getFloatTimeDomainData(buf);
  const now = performance.now(), sr = ctx.sampleRate;
  // a hit: the level jumps well above where it just was
  let sum = 0;
  for (let i = buf.length - 1024; i < buf.length; i++) sum += buf[i] * buf[i];
  const rms = Math.sqrt(sum / 1024);
  if (!pending && rms > 0.01 && rms > lastRms * 3 + 0.003 && now - hitAt > 400) { hitAt = now; pending = true; }
  lastRms = rms;
  // measure once the buffer holds the ring after the hit (skipping the first 25 ms of stick noise)
  const span = buf.length / sr * 1000;
  if (pending && now - hitAt >= span + 25) {
    pending = false;
    const hz = drumSeg === 'rods' ? drumPeak(buf, sr, 50, 1500) : drumPeak(buf, sr, 30, 500, true);
    if (hz > 0) drumSeg === 'rods' ? rodHit(hz) : centerHit(hz);
  }
  drawDrumMeter();
}

function rodHit(hz) {
  rodHz[nextRod] = hz;
  const n = rodHz.length;
  // on to the next rod not measured yet, else the next one round
  let k = 1;
  while (k < n && rodHz[(nextRod + k) % n] > 0) k++;
  nextRod = (nextRod + (k < n ? k : 1)) % n;
  drawRods(hz);
}

function drawRods(lastHz) {
  const n = rodHz.length, { mean, cents } = rodSpread(rodHz), svg = $('rodsSvg');
  const NS = 'http://www.w3.org/2000/svg', el = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
  svg.innerHTML = '';
  svg.append(el('circle', { cx: 160, cy: 160, r: 112, fill: 'rgb(255 255 255 / 0.03)', stroke: '#3a332e', 'stroke-width': 2 }));
  const centre = el('text', { x: 160, y: 156, 'text-anchor': 'middle', fill: '#f2efe8', 'font-size': 26, 'font-weight': 800 });
  centre.textContent = mean ? mean.toFixed(1) + ' Hz' : '--';
  svg.append(centre);
  const sub = el('text', { x: 160, y: 182, 'text-anchor': 'middle', fill: '#91887d', 'font-size': 13 });
  sub.textContent = mean ? 'average, about ' + noteName(Math.round(69 + 12 * Math.log2(mean / a4()))) : 'tap near rod 1';
  svg.append(sub);
  for (let i = 0; i < n; i++) {
    const ang = -Math.PI / 2 + i * 2 * Math.PI / n, x = 160 + 112 * Math.cos(ang), y = 160 + 112 * Math.sin(ang);
    const g = el('g', { class: 'rod' });
    g.append(el('circle', { cx: x, cy: y, r: 17, fill: rodHz[i] ? centsColour(cents[i]) + '33' : '#171412', stroke: i === nextRod ? '#ff3b00' : rodHz[i] ? centsColour(cents[i]) : '#5a514a', 'stroke-width': i === nextRod ? 3 : 1.5 }));
    const label = el('text', { x, y: y + 5, 'text-anchor': 'middle', fill: '#f2efe8', 'font-size': 14, 'font-weight': 700 });
    label.textContent = i + 1;
    g.append(label);
    if (cents[i] !== null) {
      const off = el('text', { x: 160 + 146 * Math.cos(ang), y: 160 + 146 * Math.sin(ang) + 4, 'text-anchor': 'middle', fill: centsColour(cents[i]), 'font-size': 12, 'font-weight': 700 });
      off.textContent = (cents[i] >= 0 ? '+' : '') + cents[i].toFixed(0);
      g.append(off);
    }
    g.onclick = () => { nextRod = i; drawRods(); };
    svg.append(g);
  }
  // what to do next
  const done = rodHz.filter(h => h > 0).length, status = $('rodStatus');
  let worst = -1;
  cents.forEach((c, i) => { if (c !== null && (worst < 0 || Math.abs(c) > Math.abs(cents[worst]))) worst = i; });
  if (done < 2) { status.textContent = `Tap lightly about an inch in from rod ${nextRod + 1}`; status.style.color = ''; }
  else if (Math.abs(cents[worst]) <= 8) { status.textContent = done < n ? `Even so far. Now rod ${nextRod + 1}` : 'Even all the way round'; status.style.color = '#22c55e'; }
  else {
    const c = cents[worst];
    status.textContent = `Rod ${worst + 1} is ${Math.abs(c).toFixed(0)} cents ${c < 0 ? 'low: tighten it a little' : 'high: loosen it a little'}` + (done < n ? `. Next: rod ${nextRod + 1}` : '');
    status.style.color = centsColour(c);
  }
  $('rodHz').textContent = lastHz ? `last tap ${lastHz.toFixed(1)} Hz (numbers by each rod are cents from the average)` : '';
}

function centerHit(hz) {
  const m = 69 + 12 * Math.log2(hz / a4());
  drumLast = { hz, note: Math.round(m) };
  showDrum();
}

function showDrum() {
  const d = drumLast, target = drumTargetNote();
  if (!d || target === null) return;
  const cents = 1200 * Math.log2(d.hz / noteHz(target, a4(), new Array(12).fill(0), 0));
  d.cents = cents;
  $('drumBig').innerHTML = noteName(d.note, false) + '<sub>' + (Math.floor(d.note / 12) - 1) + '</sub>';
  const status = $('drumStatus');
  status.style.color = centsColour(cents);
  status.textContent = Math.abs(cents) <= 8 ? `On ${noteName(target)}` : `${Math.abs(cents).toFixed(0)} cents ${cents < 0 ? 'flat' : 'sharp'} of ${noteName(target)}: ${cents < 0 ? 'tighten' : 'loosen'} every rod evenly`;
  $('drumHz').textContent = `${d.hz.toFixed(1)} Hz`;
  drawDrumMeter();
}

function drawDrumMeter() {
  const c = $('drumMeter'), dpr = window.devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight;
  if (!w) return;
  if (c.width !== w * dpr) { c.width = w * dpr; c.height = h * dpr; }
  const g = c.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = '#2c2723';
  g.fillRect(0, 0, w, h);
  for (let cents = -50; cents <= 50; cents += 10) {
    const x = (cents + 50) / 100 * w;
    g.fillStyle = cents === 0 ? '#f2efe8' : '#91887d';
    g.fillRect(x - (cents === 0 ? 1 : 0.5), 6, cents === 0 ? 2 : 1, h - 12);
  }
  if (drumLast && drumLast.cents !== undefined) {
    const x = (Math.max(-50, Math.min(50, drumLast.cents)) + 50) / 100 * w;
    g.fillStyle = centsColour(drumLast.cents);
    g.beginPath();
    g.roundRect ? g.roundRect(x - 4, 2, 8, h - 4, 3) : g.rect(x - 4, 2, 8, h - 4);
    g.fill();
  }
}

function drawTomNotes() {
  const box = $('tomNotes');
  if (!box) return;
  box.innerHTML = '';
  tomSteps(+$('tomTop').value, +$('tomCount').value, +$('tomStep').value).forEach((m, i) => {
    const p = document.createElement('button'), key = 'tom' + i, sounding = playing && playing.key === key;
    p.type = 'button';
    p.className = 'pill' + (sounding ? ' playing' : '') + (+$('drumTarget').value === m && $('drumTarget').value !== '' ? ' active' : '');
    p.textContent = noteName(m);
    p.title = 'Tom ' + (i + 1) + ': hear it and tune to it';
    p.onclick = () => {
      $('drumTarget').value = m;
      store.set('drumTarget', m);
      showDrum();
      playTone(key, noteHz(m, a4(), new Array(12).fill(0), 0));
    };
    box.append(p);
  });
}

// the drum page as it was left
$('drum').value = store.get('drum', '1');
$('rods').value = store.get('rods', String(DRUMS[+$('drum').value][1]));
$('drumTarget').value = store.get('drumTarget', '');
$('tomTop').value = store.get('tomTop', '50');
$('tomCount').value = store.get('tomCount', '3');
$('tomStep').value = store.get('tomStep', '5');
resetRods();
drawTomNotes();
setSeg(store.get('drumSeg', 'rods'));
setMode(store.get('mode', 'pitch'));
