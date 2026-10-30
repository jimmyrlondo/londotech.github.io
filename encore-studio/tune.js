// Encore Tune: the page. Listens to a microphone or interface input in the
// browser (nothing is recorded or sent anywhere) and shows the string or note
// you're playing and how far off it is.
import { estimatePitch, downsample, reading, noteName, noteHz } from './tune-core.js';
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

let strings = [], tuned = [], instrument = null, playing = null, last = null, ctx = null;

function fillTunings(keep) {
  instrument = instruments[+$('instrument').value];
  $('tuning').innerHTML = '';
  instrument.tunings.forEach((t, i) => {
    const notes = t.notes.length ? '  (' + t.notes.map(n => n.replace(/\d+$/, '')).join(' ') + ')' : '';
    $('tuning').append(new Option(t.name + notes, i));
  });
  $('tuning').value = String(Math.min(keep ?? 0, instrument.tunings.length - 1));
  $('tuning').disabled = instrument.tunings.length < 2;
  tuningChanged();
}

function tuningChanged() {
  const t = instrument.tunings[+$('tuning').value] || instrument.tunings[0];
  stopTone();
  strings = t.midi;
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
  strings.forEach((m, i) => {
    const p = document.createElement('button');
    const sounding = playing && playing.string === i;
    p.type = 'button';
    p.className = 'pill' + (r && r.string === i ? ' active' : '') + (tuned[i] ? ' done' : '') + (sounding ? ' playing' : '');
    p.textContent = noteName(m + (instrument.transpose || 0));
    p.title = sounding ? 'Stop' : 'Hear ' + p.textContent;
    if (r && r.string === i && !sounding) { p.style.borderColor = colourFor(r); p.style.background = colourFor(r) + '33'; }
    p.onclick = () => toggleTone(i);
    box.append(p);
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
$('strobe').onchange = () => store.set('strobe', $('strobe').checked ? '1' : '0');
const replay = () => { if (playing) { const i = playing.string; stopTone(); toggleTone(i); } };
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

function toggleTone(i) {
  const again = playing && playing.string === i;
  stopTone();
  if (again) return;
  audio();
  const hz = toneHz(i), steady = $('tone').value === 'steady', now = ctx.currentTime;
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
  const me = { string: i, node, gain, steady };
  node.onended = () => { if (playing === me) { playing = null; drawStrings(last); } };
  playing = me;
  drawStrings(last);
}

function stopTone() {
  if (!playing) return;
  const p = playing, now = ctx.currentTime;
  playing = null;
  p.gain.gain.cancelScheduledValues(now);
  p.gain.gain.setValueAtTime(p.gain.gain.value, now);
  p.gain.gain.setTargetAtTime(0, now, 0.03);
  try { p.node.stop(now + 0.2); } catch {}
  drawStrings(last);
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
    $('status').textContent = strings.length ? 'Play a string' : 'Play a note';
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

function show() {
  const r = last, have = r && r.note >= 0, t = instrument.transpose || 0;
  $('big').innerHTML = have ? noteName(r.note + t, false) + '<sub>' + (Math.floor((r.note + t) / 12) - 1) + '</sub>' : '--';
  $('big').style.color = have ? '' : '#91887d';
  $('concert').textContent = have && t ? 'sounds ' + noteName(r.note) + ' (concert)' : '';
  const status = $('status');
  status.style.color = colourFor(r);
  status.textContent = !have ? (strings.length ? 'Play a string' : 'Play a note')
    : Math.abs(r.cents) <= 3 ? 'In tune'
    : (r.cents < 0 ? 'Flat ' : 'Sharp ') + Math.abs(r.cents).toFixed(0) + ' cents' + (r.string >= 0 ? `  (string ${strings.length - r.string})` : '');
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
