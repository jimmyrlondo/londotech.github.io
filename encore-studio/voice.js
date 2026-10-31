// Encore Voice: the page. A vocal trainer that listens to the microphone in the
// browser (nothing is recorded or sent anywhere), draws your pitch on note lanes,
// and runs the exercises: range, warm-up, pitch matching, long notes, sing back,
// song key, and progress kept in this browser.
import { VoiceTracker, TRACK_WINDOW, midiToHz, noteName, analyzeRange, tessitura, voiceTypeHint, VOICE_TYPES, scoreMatch, matchFeedback,
         closeness, analyzeSustain, sustainFeedback, scoreSingBack, intervalName, nextMatchNote, adaptLevel, buildSingBack, buildWarmup,
         warmupSeconds, patternSeconds, glideAt, scorePattern, scoreSiren, notesFeedback, suggestKeys, shiftWords, capoFor, KEY_NAMES,
         safeRange, streak, dayOf, validateImport, median } from './voice-core.js';

const $ = id => document.getElementById(id);
const store = {
  get: (k, d) => { try { const v = localStorage.getItem('encoreVoice.' + k); return v === null ? d : v; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem('encoreVoice.' + k, v); } catch {} },
};

// ---- saved progress: { range, history: [{ kind, t, ... }] }
let data = { range: null, history: [] };
try { data = validateImport(JSON.parse(store.get('data', 'null')) || { app: 'encore-voice' }); } catch {}
const save = () => store.set('data', JSON.stringify({ app: 'encore-voice', version: 1, range: data.range, history: data.history }));
const remember = entry => { data.history.push({ t: new Date().toISOString(), ...entry }); if (data.history.length > 2000) data.history.shift(); save(); };

// until there's a range test: a middle range that suits most voices well enough
const FALLBACK = { low: 48, high: 69, tessLo: 53, tessHi: 62, fallback: true };
const myRange = () => data.range || FALLBACK;
const presetRange = v => { const c = Math.round((v.low + v.high) / 2 - 2); return { low: v.low + 2, high: v.high - 3, tessLo: c - 5, tessHi: c + 5, preset: v.name }; };
const nn = m => noteName(Math.round(m));
const colours = { good: '#22c55e', close: '#eab308', off: '#ef4444', miss: '#5a514a' };

// ---- settings
$('sound').value = store.get('sound', 'piano');
$('volume').value = store.get('volume', '60');
$('phones').checked = store.get('phones', '0') === '1';
$('sound').onchange = () => store.set('sound', $('sound').value);
$('volume').oninput = () => { store.set('volume', $('volume').value); if (drone) drone.gain.gain.setTargetAtTime(vol() * 0.5, ctx.currentTime, 0.05); };
$('phones').onchange = () => { store.set('phones', $('phones').checked ? '1' : '0'); describeWarmupMode(); };
const phones = () => $('phones').checked;

// ---- sound: guide notes (a soft piano, or a steady tone), sirens and a drone
let ctx = null;
const voices = new Set();
let guideBusy = [];   // [start, end] times a guide is sounding (the microphone would hear it)
const vol = () => Math.pow(+$('volume').value / 100, 2) * 0.6;
const PIANO = [1, 0.5, 0.32, 0.2, 0.13, 0.08, 0.05, 0.03], SOFT = [1, 0.25, 0.08, 0.03];
const waves = {};
function audio() {
  ctx = ctx || new AudioContext();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
function wave(name) {
  if (!waves[name]) {
    const h = name === 'piano' ? PIANO : SOFT, real = new Float32Array(h.length + 1), imag = new Float32Array(h.length + 1);
    h.forEach((a, k) => { imag[k + 1] = a; });
    waves[name] = ctx.createPeriodicWave(real, imag);
  }
  return waves[name];
}

/** One guide note (or a siren when glide is given) at context time `at` for `dur` seconds */
function tone(midi, at, dur, { level = 1, glide = null, steady = false } = {}) {
  const c = audio(), piano = !steady && !glide && $('sound').value === 'piano', hz = midiToHz(midi);
  const osc = c.createOscillator(), filter = c.createBiquadFilter(), g = c.createGain(), v = vol() * level;
  osc.setPeriodicWave(wave(piano ? 'piano' : 'soft'));
  osc.frequency.setValueAtTime(hz, at);
  if (glide) {
    osc.frequency.setValueAtTime(midiToHz(glide.from), at);
    osc.frequency.exponentialRampToValueAtTime(midiToHz(glide.to), at + glide.up);
    osc.frequency.exponentialRampToValueAtTime(midiToHz(glide.from), at + glide.up + glide.down);
  }
  filter.type = 'lowpass';
  g.gain.setValueAtTime(0, at);
  if (piano) {
    // a struck string: a bright start that mellows and fades
    g.gain.linearRampToValueAtTime(v, at + 0.006);
    g.gain.setTargetAtTime(v * 0.3, at + 0.006, 0.4);
    filter.frequency.setValueAtTime(Math.min(12000, hz * 9), at);
    filter.frequency.setTargetAtTime(Math.min(12000, hz * 3.5), at, 0.35);
  } else {
    g.gain.linearRampToValueAtTime(v * 0.75, at + 0.06);
    filter.frequency.value = Math.min(12000, hz * 6);
  }
  g.gain.setTargetAtTime(0, at + dur, 0.04);
  osc.connect(filter).connect(g).connect(c.destination);
  osc.start(at);
  osc.stop(at + dur + 0.3);
  const me = { osc, g };
  voices.add(me);
  osc.onended = () => voices.delete(me);
  guideBusy.push([at, at + dur + 0.2]);
  return me;
}
function stopAll() {
  if (!ctx) return;
  const now = ctx.currentTime;
  for (const v of voices) { v.g.gain.cancelScheduledValues(now); v.g.gain.setTargetAtTime(0, now, 0.02); try { v.osc.stop(now + 0.15); } catch {} }
  voices.clear();
  guideBusy = guideBusy.filter(([a]) => a < now).map(([a, b]) => [a, Math.min(b, now + 0.2)]);
}
const guideSounding = t => !phones() && guideBusy.some(([a, b]) => t >= a && t <= b + 0.05);

// the drone: one steady note to sing against, until it's turned off
let drone = null;
for (let m = 36; m <= 84; m++) $('drone').append(new Option(noteName(m), m));
$('drone').onchange = () => {
  if (drone) { drone.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05); drone.osc.stop(ctx.currentTime + 0.3); drone = null; }
  if ($('drone').value === '') return;
  const c = audio(), osc = c.createOscillator(), gain = c.createGain();
  osc.setPeriodicWave(wave('soft'));
  osc.frequency.value = midiToHz(+$('drone').value);
  gain.gain.setValueAtTime(0, c.currentTime);
  gain.gain.linearRampToValueAtTime(vol() * 0.5, c.currentTime + 0.3);
  osc.connect(gain).connect(c.destination);
  osc.start();
  drone = { osc, gain };
};

// ---- listening
let analyser = null, source = null, stream = null, buf = null;
const tracker = new VoiceTracker();
const hist = [];   // { t, midi } for the pitch view, the last few seconds
let lastVoice = null;

async function listen(deviceId) {
  if (stream) stream.getTracks().forEach(t => t.stop());
  stream = await navigator.mediaDevices.getUserMedia({ audio: {
    deviceId: deviceId ? { exact: deviceId } : undefined,
    echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  audio();
  if (source) source.disconnect();
  source = ctx.createMediaStreamSource(stream);
  analyser = analyser || ctx.createAnalyser();
  analyser.fftSize = 4096;
  buf = new Float32Array(analyser.fftSize);
  source.connect(analyser);
  const devices = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput');
  const sel = $('input'), keep = deviceId || '';
  sel.innerHTML = '';
  sel.append(new Option('Default microphone', ''));
  devices.forEach(d => { if (d.deviceId && d.deviceId !== 'default') sel.append(new Option(d.label || 'Input', d.deviceId)); });
  sel.value = keep;
}
async function ensureMic() {
  if (analyser) { audio(); return true; }
  try { await listen(''); $('startView').classList.add('hidden'); return true; }
  catch (e) { showError(e); return false; }
}
function showError(e) {
  $('startView').classList.remove('hidden');
  $('err').classList.remove('hidden');
  $('err').textContent = e && e.name === 'NotAllowedError' ? 'The browser wasn\'t allowed to use the microphone. Allow it (the icon in the address bar) and try again.'
                                                         : 'Couldn\'t open the microphone: ' + (e && e.message || e);
  window.scrollTo(0, 0);
}
$('input').onchange = () => listen($('input').value).catch(showError);
$('startBtn').onclick = () => ensureMic();

// ---- the exercise runner: a generator yields steps (listen, sing, wait) and gets each sung step back with its frames
let job = null, targets = [];
function runJob(gen) { stopJob(false); job = { gen }; advance(undefined); }
function stopJob(reset = true) {
  if (!job) return;
  const j = job;
  job = null;
  stopAll();
  try { j.gen.return(); } catch {}
  targets = targets.filter(x => x.result);
  setPhase('');
  if (reset) resetControls();
}
// every mode's buttons back to their resting state (a job can be cut short by a tab change or Stop)
function resetControls() {
  warmupUi(false); matchUi(false); holdUi(false); backUi(false);
  $('rangeGo').classList.remove('hidden'); $('rangeDone').classList.add('hidden'); $('rangeCount').textContent = '';
  $('keySing').classList.remove('hidden'); $('keySingDone').classList.add('hidden');
}
function advance(prev) {
  const j = job;
  let r;
  try { r = j.gen.next(prev); } catch (e) { console.error(e); job = null; setPhase(''); return; }
  if (job !== j) return;
  if (r.done) { job = null; setPhase(''); return; }
  j.step = r.value;
}
function beginStep(s, now) {
  s.t0 = now + (s.lead ?? 0.25);
  s.frames = [];
  s.shift = s.kind === 'sing' && s.guide ? (ctx.outputLatency || 0) + (ctx.baseLatency || 0) : 0;
  const style = s.kind === 'listen' ? 'listen' : 'sing';
  if (s.kind === 'listen' || (s.kind === 'sing' && s.guide)) {
    for (const n of s.notes || []) tone(n.midi, s.t0 + n.at, n.dur * (s.kind === 'sing' ? 1 : 0.95), { level: s.kind === 'sing' ? 0.7 : 1, steady: n.dur >= 2 });
    if (s.glide) tone(s.glide.from, s.t0, s.glide.up + s.glide.down, { glide: s.glide });
  }
  s.marks = (s.notes || []).map(n => { const m = { midi: n.midi, a: s.t0 + n.at, b: s.t0 + n.at + n.dur, style, result: null }; targets.push(m); return m; });
  if (s.glide) { s.glideMark = { glide: s.glide, a: s.t0, b: s.t0 + s.glide.up + s.glide.down, style, result: null }; targets.push(s.glideMark); }
  setPhase(s.label ?? (s.kind === 'listen' ? 'Listen' : s.kind === 'sing' ? 'Your turn' : ''), s.kind);
}
function tickJob(now) {
  for (let guard = 0; job && guard < 4; guard++) {
    const s = job.step;
    if (!s) return;
    if (s.t0 === undefined) beginStep(s, now);
    const ended = now >= s.t0 + s.dur + 0.06 || s.stop || (s.until && now >= s.t0 && s.until(s, now - s.t0));
    if (!ended) return;
    job.step = null;
    advance(s);
  }
}
let phaseKind = '';
function setPhase(text, kind = '') {
  phaseKind = text ? kind : '';
  $('phase').textContent = text;
  $('phase').className = 'phase' + (text ? '' : ' hidden') + (kind === 'listen' ? ' listen' : kind === 'sing' ? ' sing' : '');
}

// ---- every frame: read the pitch, feed the running step, draw
function frame() {
  requestAnimationFrame(frame);
  if (analyser) {
    analyser.getFloatTimeDomainData(buf);
    const t = ctx.currentTime - TRACK_WINDOW / 2;
    let f = tracker.feed(buf, ctx.sampleRate, t);
    // while a guide sounds through speakers, the microphone hears it, not you: leave it out
    if (guideSounding(t)) { tracker.reset(); f = { t, midi: null }; }
    hist.push({ t, midi: f.midi });
    while (hist.length && hist[0].t < t - 12) hist.shift();
    if (targets.length > 40) targets = targets.filter(x => x.b > t - 15);
    if (f.midi !== null) lastVoice = { t, midi: f.midi };
    const s = job && job.step;
    if (s && s.kind === 'sing' && s.t0 !== undefined && t >= s.t0 + s.shift && t <= s.t0 + s.shift + s.dur) s.frames.push({ t: t - s.t0 - s.shift, midi: f.midi });
    readout(t);
  }
  if (ctx) tickJob(ctx.currentTime);
  drawRoll();
}

/** The target being sung at time t (abs), as a pitch, or null */
function targetAt(t) {
  for (let i = targets.length - 1; i >= 0; i--) {
    const x = targets[i];
    if (x.style === 'sing' && t >= x.a && t <= x.b) return x.glide ? glideAt(x.glide, t - x.a) : x.midi;
  }
  return null;
}
/** The voice's pitch around hist[i], averaged over 0.2 s (voiced frames only) */
function centred(i) {
  const t = hist[i].t;
  let s = 0, n = 0;
  for (let j = i; j >= 0 && t - hist[j].t <= 0.1; j--) if (hist[j].midi !== null) { s += hist[j].midi; n++; }
  for (let j = i + 1; j < hist.length && hist[j].t - t <= 0.1; j++) if (hist[j].midi !== null) { s += hist[j].midi; n++; }
  return n ? s / n : hist[i].midi;
}
/** How a pitch reads against its target (or the nearest note when there's none): cents and a colour band */
function judge(t, midi) {
  const target = targetAt(t);
  if (target !== null) { let c = (midi - target) * 100; c -= 1200 * Math.round(c / 1200); return { cents: c, band: closeness(c), target }; }
  const c = (midi - Math.round(midi)) * 100;
  return { cents: c, band: Math.abs(c) <= 15 ? 'good' : Math.abs(c) <= 30 ? 'close' : 'off', target: null };
}

function readout(t) {
  const v = lastVoice && t - lastVoice.t < 0.35 ? lastVoice : null;
  if (!v) { $('big').innerHTML = '--'; $('big').style.color = '#91887d'; $('cents').textContent = ''; $('hz').textContent = ''; return; }
  const near = hist.filter(f => f.midi !== null && f.t > v.t - 0.2).map(f => f.midi);
  const j = judge(v.t, near.length ? near.reduce((a, b) => a + b, 0) / near.length : v.midi), shown = j.target !== null ? Math.round(j.target) + Math.round(j.cents / 100) : Math.round(v.midi);
  $('big').innerHTML = noteName(shown, false) + '<sub>' + (Math.floor(shown / 12) - 1) + '</sub>';
  $('big').style.color = '';
  $('cents').style.color = colours[j.band];
  const c = Math.round(j.cents);
  $('cents').textContent = j.target !== null ? (Math.abs(c) <= 20 ? 'On the note' : `${Math.abs(c)} cents ${c < 0 ? 'low' : 'high'}`) + ` (target ${nn(j.target)})`
                                            : Math.abs(c) <= 5 ? 'In tune' : `${Math.abs(c)} cents ${c < 0 ? 'flat' : 'sharp'}`;
  $('hz').textContent = midiToHz(v.midi).toFixed(1) + ' Hz';
}

// ---- the pitch view: note lanes, target bars, the voice's line, time running right to left
const view = { lo: 50, hi: 70 };
function drawRoll() {
  const c = $('roll'), dpr = window.devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight;
  if (!w || !h) return;
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
  const g = c.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const now = ctx ? ctx.currentTime : 0, busy = !!job || targets.some(x => x.b > now - 1);
  const past = busy ? 5.5 : 7, future = busy ? 2.5 : 0.4, gutter = 40, pw = w - gutter;
  const X = t => gutter + (t - (now - past)) / (past + future) * pw;
  // which notes to show: the targets in view, else where the voice is, else the comfortable middle
  const r = myRange(), rows = Math.max(12, Math.min(26, Math.round(h / 15)));
  const inView = targets.filter(x => x.b > now - past && x.a < now + future);
  let lo, hi;
  if (inView.length) {
    lo = Math.min(...inView.map(x => x.glide ? Math.min(x.glide.from, x.glide.to) : x.midi));
    hi = Math.max(...inView.map(x => x.glide ? Math.max(x.glide.from, x.glide.to) : x.midi));
  } else if (lastVoice && now - lastVoice.t < 2) {
    const recent = hist.filter(f => f.midi !== null && f.t > now - 2).map(f => f.midi);
    lo = hi = recent.length ? median(recent) : lastVoice.midi;
  } else { lo = r.tessLo; hi = r.tessHi; }
  const span = Math.max(rows, hi - lo + 5), centre = (lo + hi) / 2;
  view.lo += (centre - span / 2 - view.lo) * 0.08;
  view.hi += (centre + span / 2 - view.hi) * 0.08;
  const rowH = h / (view.hi - view.lo), Y = m => h - (m - view.lo) * rowH;
  g.fillStyle = '#110e0d';
  g.fillRect(0, 0, w, h);
  const safe = safeRange(r);
  g.font = '11px "DM Sans", system-ui, sans-serif';
  g.textBaseline = 'middle';
  for (let m = Math.floor(view.lo); m <= Math.ceil(view.hi); m++) {
    const y = Y(m), black = [1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12);
    if (black) { g.fillStyle = '#171412'; g.fillRect(gutter, y - rowH / 2, pw, rowH); }
    // outside the saved range: dimmed, so it's clear where not to go
    if (m < safe.lo || m > safe.hi) { g.fillStyle = 'rgb(0 0 0 / 0.35)'; g.fillRect(gutter, y - rowH / 2, pw, rowH); }
    if (m % 12 === 0) { g.fillStyle = '#2c2723'; g.fillRect(gutter, y + rowH / 2 - 0.5, pw, 1); }
    if (!black && (rowH >= 11 || m % 12 === 0)) {
      g.fillStyle = m % 12 === 0 ? '#bdb4a9' : '#91887d';
      g.fillText(noteName(m), 6, y);
    }
    if (m >= r.tessLo && m <= r.tessHi) { g.fillStyle = 'rgb(255 59 0 / 0.5)'; g.fillRect(gutter - 4, y - rowH / 2 + 1, 2, rowH - 2); }
  }
  // targets
  for (const x of inView) {
    const fill = x.result ? colours[x.result] : x.style === 'listen' ? '#16a0b8' : '#91887d';
    if (x.glide) {
      g.strokeStyle = fill + (x.result ? 'aa' : '88');
      g.lineWidth = Math.max(6, rowH * 0.7);
      g.lineCap = 'round';
      g.beginPath();
      for (let t = x.a; t <= x.b + 1e-6; t += 0.05) { const px = X(t), py = Y(glideAt(x.glide, t - x.a)); t === x.a ? g.moveTo(px, py) : g.lineTo(px, py); }
      g.stroke();
      continue;
    }
    const x0 = Math.max(gutter, X(x.a)), x1 = X(x.b) - 2, y = Y(x.midi), bh = Math.max(6, rowH * 0.8);
    if (x1 <= x0) continue;
    g.fillStyle = fill + (x.result ? '66' : x.style === 'listen' ? '33' : '44');
    g.strokeStyle = fill;
    g.lineWidth = 1.5;
    g.beginPath();
    g.roundRect ? g.roundRect(x0, y - bh / 2, x1 - x0, bh, 4) : g.rect(x0, y - bh / 2, x1 - x0, bh);
    g.fill();
    if (x.style === 'listen' && !x.result) g.setLineDash([4, 3]);
    g.stroke();
    g.setLineDash([]);
  }
  // the voice, coloured by where it's centred over 0.2 s (so a vibrato around the note reads as on it)
  g.lineWidth = 3;
  g.lineCap = 'round';
  for (let i = 1; i < hist.length; i++) {
    const a = hist[i - 1], b = hist[i];
    if (a.midi === null || b.midi === null || b.t - a.t > 0.1 || b.t < now - past) continue;
    g.strokeStyle = colours[judge(b.t, centred(i)).band];
    g.beginPath();
    g.moveTo(X(a.t), Y(a.midi));
    g.lineTo(X(b.t), Y(b.midi));
    g.stroke();
  }
  // now
  g.fillStyle = 'rgb(242 239 232 / 0.35)';
  g.fillRect(X(now) - 0.5, 0, 1, h);
  if (!analyser) {
    g.fillStyle = '#91887d';
    g.textAlign = 'center';
    g.font = '14px "DM Sans", system-ui, sans-serif';
    g.fillText('Press Start listening, then sing', gutter + pw / 2, h / 2);
    g.textAlign = 'left';
  }
}
$('rangeLegend').innerHTML = '<i style="background:#ff3b00;width:3px"></i>your comfortable notes';

// ---- modes
let mode = 'live';
const NEEDS_RANGE = ['warmup', 'match', 'hold', 'back', 'key'];
function setMode(m) {
  if (job && m !== mode) stopJob();
  mode = m;
  store.set('mode', m);
  document.querySelectorAll('#tabs button').forEach(b => { b.classList.toggle('on', b.dataset.mode === m); if (b.dataset.mode === m && b.scrollIntoView) b.scrollIntoView({ block: 'nearest', inline: 'nearest' }); });
  document.querySelectorAll('.mode').forEach(s => s.classList.toggle('hidden', s.id !== 'm-' + m));
  $('graphPanel').classList.toggle('hidden', m === 'progress' || m === 'key');
  showBanner();
  if (m === 'progress') drawProgress();
  if (m === 'key') showKeys();
  if (m === 'warmup') describeWarmupMode();
  if (m === 'match') $('matchLevel').textContent = `Level ${matchLevel} of 5`;
  if (m === 'back') $('backLevel').textContent = `Level ${backLevel} of 5`;
}
document.querySelectorAll('#tabs button').forEach(b => { b.onclick = () => setMode(b.dataset.mode); });
function showBanner() {
  const r = data.range, b = $('rangeBanner');
  b.classList.toggle('hidden', !NEEDS_RANGE.includes(mode) || (r && !r.preset));
  if (!r) b.innerHTML = `Using a typical middle range (${nn(FALLBACK.low)} to ${nn(FALLBACK.high)}) until you find your own. <button class="linkish" id="goRange">Find your range</button> (about a minute) so every exercise fits your voice.`;
  else if (r.preset) b.innerHTML = `Using a typical ${r.preset} range (${nn(r.low)} to ${nn(r.high)}). <button class="linkish" id="goRange">Find your own range</button> for a better fit.`;
  const go = $('goRange');
  if (go) go.onclick = () => setMode('range');
}

// ---- range finder
const RANGE_SECONDS = [15, 15, 25];
let rangeStep = 0, rangeFrames = [null, null, null];
VOICE_TYPES.forEach(v => $('preset').append(new Option(v.name, v.name)));
$('preset').onchange = () => {
  const v = VOICE_TYPES.find(x => x.name === $('preset').value);
  if (!v) return;
  data.range = presetRange(v);
  save();
  $('preset').value = '';
  afterRangeChange();
};
function drawRangeSteps() {
  document.querySelectorAll('#rangeSteps li').forEach((li, i) => {
    li.classList.toggle('now', i === rangeStep && rangeStep < 3);
    li.classList.toggle('done', !!rangeFrames[i] && i < rangeStep);
  });
  $('rangeGo').textContent = rangeStep >= 3 ? 'Test again' : `Start step ${rangeStep + 1}`;
}
$('rangeGo').onclick = async () => {
  if (!(await ensureMic())) return;
  if (rangeStep >= 3) { rangeStep = 0; rangeFrames = [null, null, null]; [0, 1, 2].forEach(i => { $('got' + i).textContent = ''; }); }
  const i = rangeStep;
  $('rangeGo').classList.add('hidden');
  $('rangeDone').classList.remove('hidden');
  drawRangeSteps();
  runJob((function* () {
    const s = yield { kind: 'sing', dur: RANGE_SECONDS[i], lead: 0.1, label: ['Slide down', 'Slide up', 'Sing comfortably'][i],
                      until: (st, el) => { $('rangeCount').textContent = Math.max(0, Math.ceil(RANGE_SECONDS[i] - el)) + ' s'; return false; } };
    rangeStepDone(i, s.frames);
  })());
};
$('rangeDone').onclick = () => { if (job && job.step) job.step.stop = true; };
function rangeStepDone(i, frames) {
  $('rangeGo').classList.remove('hidden');
  $('rangeDone').classList.add('hidden');
  $('rangeCount').textContent = '';
  const r = analyzeRange(frames);
  if (!r) { $('got' + i).textContent = 'I didn\'t catch enough singing that time. Try again, a little louder or closer to the microphone.'; drawRangeSteps(); return; }
  rangeFrames[i] = frames;
  if (i === 0) $('got' + i).textContent = `Lowest: ${nn(r.low)}`;
  if (i === 1) $('got' + i).textContent = `Highest: ${nn(r.high)}`;
  if (i === 2) { const t = tessitura(frames); $('got' + i).textContent = t ? `You sat mostly around ${nn(t.lo)} to ${nn(t.hi)}` : 'Got it (not many long notes, so the comfortable range will be an estimate)'; }
  rangeStep = i + 1;
  drawRangeSteps();
  if (rangeStep >= 3) finishRange();
}
function finishRange() {
  // all three together for the edges (each step's times moved apart so they don't overlap); step 3 for the comfortable middle
  const all = rangeFrames.flatMap((fr, k) => (fr || []).map(f => ({ t: f.t + k * 1000, midi: f.midi })));
  const r = analyzeRange(all, rangeFrames[2]);
  if (!r) return;
  data.range = { low: r.low, high: r.high, tessLo: r.tessLo, tessHi: r.tessHi, measured: r.tessMeasured, t: new Date().toISOString() };
  remember({ kind: 'range', low: r.low, high: r.high, tessLo: r.tessLo, tessHi: r.tessHi });
  afterRangeChange();
}
function showRangeResult() {
  const r = data.range, box = $('rangeResult');
  if (!r) { box.classList.add('hidden'); return; }
  const hints = voiceTypeHint(r), span = r.high - r.low;
  const alt = hints[1] && hints[1].distance - hints[0].distance < 3 ? ` (or perhaps ${hints[1].name})` : '';
  box.classList.remove('hidden');
  box.innerHTML = `<div class="stats">
      <div class="stat"><div class="k">Lowest</div><div class="v">${nn(r.low)}</div></div>
      <div class="stat"><div class="k">Highest</div><div class="v">${nn(r.high)}</div></div>
      <div class="stat"><div class="k">Comfortable${r.preset || r.measured ? '' : ' (estimate)'}</div><div class="v">${nn(r.tessLo)} <small>to</small> ${nn(r.tessHi)}</div></div>
      <div class="stat"><div class="k">Span</div><div class="v">${span} <small>semitones (${(span / 12).toFixed(1)} octaves)</small></div></div>
    </div>
    <div>${r.preset ? `Using a typical <b>${r.preset}</b> range.` : `Your range looks closest to a typical <b>${hints[0].name}</b>${alt}.`}
    <span class="hint">That's only a rough guide: voice type also depends on the color of your voice and where it changes gear, and ranges usually grow with practice. Sing what feels good.</span></div>
    <div class="hint" style="margin-top:8px">${r.preset ? '' : 'Saved as your range. '}Exercises stay inside it, and the lanes outside it are dimmed on the pitch view.</div>`;
}

// ---- warm-up
let skipExercise = false;
$('wuLength').value = store.get('wuLength', 'short');
function describeWarmupMode() {
  const ex = buildWarmup(myRange(), $('wuLength').value);
  $('wuTime').textContent = `About ${Math.round(warmupSeconds(ex, phones()) / 60)} minutes, ${ex.length} exercises`;
  $('wuMode').textContent = phones() ? 'Headphones on: you\'ll sing along with each pattern as it plays.'
    : 'No headphones: each pattern plays first (blue bars), then it\'s your turn (gray bars), so the microphone only hears you. With headphones you can sing along instead.';
}
$('wuLength').onchange = () => { store.set('wuLength', $('wuLength').value); describeWarmupMode(); };
$('wuSkip').onclick = () => { skipExercise = true; if (job && job.step) job.step.stop = true; };
$('wuStop').onclick = () => { stopJob(); warmupUi(false); };
function warmupUi(on) {
  $('wuGo').classList.toggle('hidden', on);
  $('wuSkip').classList.toggle('hidden', !on);
  $('wuStop').classList.toggle('hidden', !on);
  $('wuCard').classList.toggle('hidden', !on);
}
$('wuGo').onclick = async () => {
  if (!(await ensureMic())) return;
  const exercises = buildWarmup(myRange(), $('wuLength').value);
  $('wuResults').classList.add('hidden');
  $('wuResults').innerHTML = '';
  warmupUi(true);
  runJob(warmupJob(exercises));
};
function* warmupJob(exercises) {
  const started = Date.now(), allScored = [], results = [];
  for (const [ei, e] of exercises.entries()) {
    skipExercise = false;
    $('wuWhere').textContent = `Exercise ${ei + 1} of ${exercises.length}`;
    $('wuName').textContent = `${e.name} (on "${e.sound}")`;
    $('wuHow').textContent = e.how;
    $('wuDots').innerHTML = '';
    $('wuNow').textContent = 'Starting in a moment. Read the tip, take an easy breath.';
    yield { kind: 'wait', dur: ei === 0 ? 6 : 8, lead: 0, label: 'Get ready', until: () => skipExercise };
    if (skipExercise) continue;
    const scored = [], sirens = [], holds = [];
    for (const [pi, p] of e.patterns.entries()) {
      if (skipExercise) break;
      const dur = patternSeconds(p), notes = p.notes, glide = p.glide;
      const span = glide ? `${nn(glide.from)} up to ${nn(glide.to)} and back` : `${nn(Math.min(...notes.map(n => n.midi)))} to ${nn(Math.max(...notes.map(n => n.midi)))}`;
      $('wuNow').textContent = `Pattern ${pi + 1} of ${e.patterns.length}: ${span}.` + (pi === e.patterns.length - 1 && e.patterns.length > 2 ? ' The last one.' : '')
        + (pi >= e.patterns.length - 2 && !glide && e.id !== 'sustain' ? ' If the top feels tight, it\'s fine to skip the rest.' : '');
      if (!phones()) yield { kind: 'listen', dur, notes, glide, lead: 0.3, until: () => skipExercise };
      if (skipExercise) break;
      const s = yield { kind: 'sing', dur, notes, glide, guide: phones(), lead: phones() ? 0.3 : 0.45, label: phones() ? 'Sing along' : 'Your turn', until: () => skipExercise };
      if (skipExercise) break;
      const dot = document.createElement('span');
      dot.className = 'dot';
      if (glide) {
        const sr = scoreSiren(s.frames, glide);
        sirens.push(sr);
        if (s.glideMark) s.glideMark.result = sr.coverage >= 0.8 ? 'good' : sr.coverage >= 0.5 ? 'close' : 'off';
        dot.textContent = Math.round(sr.coverage * 100) + '%';
        dot.classList.add(sr.coverage >= 0.8 ? 'good' : sr.coverage >= 0.5 ? 'close' : 'off');
      } else {
        const res = scorePattern(s.frames, notes).notes;
        res.forEach((n, k) => { s.marks[k].result = n.cents === null ? 'miss' : closeness(n.cents); });
        scored.push(...res);
        if (e.id === 'sustain') { const h = analyzeSustain(s.frames, notes[0].midi); if (h) holds.push(h); }
        const heard = res.filter(n => n.cents !== null), good = heard.filter(n => Math.abs(n.cents) <= 25).length;
        dot.textContent = `${good}/${res.length}`;
        dot.classList.add(!heard.length ? 'off' : good / res.length >= 0.8 ? 'good' : good / res.length >= 0.5 ? 'close' : 'off');
      }
      $('wuDots').append(dot);
    }
    // what to take from it
    let fb = [];
    if (sirens.length) {
      const best = sirens.reduce((a, b) => b.coverage > a.coverage ? b : a), jumps = sirens.filter(x => x.jumpAt !== null);
      fb.push(best.lowest === null ? 'I couldn\'t hear the sirens. "ng" is quiet: try a soft "oo", or get a little closer.'
        : `Your best siren covered ${nn(best.lowest)} to ${nn(best.highest)} (${Math.round(best.coverage * 100)}% of the slide).`);
      if (jumps.length) fb.push(`There was a jump around ${nn(jumps[0].jumpAt)}. That's often where a voice changes gear; go lighter as you pass through it and it smooths out with practice.`);
      else if (best.lowest !== null) fb.push('Smooth all the way, no breaks. Nice.');
      if (best.lowest !== null && best.coverage < 0.6) fb.push('Let the slide go a little further each time, but only as far as is easy.');
    } else if (scored.length) {
      fb = notesFeedback(scored);
      if (holds.length) fb.push(sustainFeedback(holds.reduce((a, b) => b.wobble < a.wobble ? b : a))[holds[0].cents !== null ? 1 : 0]);
      allScored.push(...scored);
    }
    if (fb.length) {
      results.push({ name: e.name, fb });
      $('wuResults').classList.remove('hidden');
      $('wuResults').innerHTML = results.map(r => `<b>${r.name}</b><ul class="feedback">${r.fb.map(x => `<li>${x}</li>`).join('')}</ul>`).join('');
    }
  }
  warmupUi(false);
  const heard = allScored.filter(n => n.cents !== null), pct = heard.length ? Math.round(100 * heard.filter(n => Math.abs(n.cents) <= 25).length / heard.length) : 0;
  const minutes = Math.max(1, Math.round((Date.now() - started) / 60000));
  $('wuResults').classList.remove('hidden');
  $('wuResults').insertAdjacentHTML('afterbegin', `<div class="say">Warm-up done${heard.length ? `: ${pct}% of notes in tune` : ''}.</div><div class="hint" style="margin-bottom:10px">Your voice is ready. Sip some water and sing something you love.</div>`);
  remember({ kind: 'warmup', minutes, inTune: pct, notes: heard.length });
}

// ---- pitch matching
let matchLevel = +store.get('matchLevel', '1'), backLevel = +store.get('backLevel', '1');
$('matchStop').onclick = () => { stopJob(); matchUi(false); };
function matchUi(on) { $('matchGo').classList.toggle('hidden', on); $('matchStop').classList.toggle('hidden', !on); $('matchCard').classList.toggle('hidden', !on && !$('matchDots').children.length); }
$('matchGo').onclick = async () => {
  if (!(await ensureMic())) return;
  $('matchSummary').classList.add('hidden');
  $('matchDots').innerHTML = '';
  matchUi(true);
  runJob(matchJob());
};
function* matchJob() {
  const range = myRange(), all = [];
  let prev = null, since = [];
  for (let i = 0; i < 10; i++) {
    const target = nextMatchNote(matchLevel, range, prev), gdur = matchLevel >= 4 ? 0.8 : 1.3;
    prev = target;
    $('matchLevel').textContent = `Level ${matchLevel} of 5`;
    $('matchWhere').textContent = `Note ${i + 1} of 10`;
    $('matchSay').textContent = 'Listen...';
    $('matchFb').textContent = '';
    yield { kind: 'listen', dur: gdur, notes: [{ midi: target, at: 0, dur: gdur }], lead: 0.4 };
    if (matchLevel >= 5) { $('matchSay').textContent = 'Keep it in your head...'; yield { kind: 'wait', dur: 1, lead: 0, label: 'Wait for it' }; }
    $('matchSay').textContent = 'Now sing it and hold it';
    let checked = 0;
    const s = yield { kind: 'sing', dur: 3.5, lead: 0.3, notes: [{ midi: target, at: 0, dur: 3.5 }],
      // done early once it's found and held for a second
      until: st => {
        if (++checked % 8) return false;
        const r = scoreMatch(st.frames, target), v = st.frames.filter(f => f.midi !== null);
        return r.heard && r.settle !== null && v.length && v[v.length - 1].t - v[0].t - r.settle >= 1.0;
      } };
    const r = scoreMatch(s.frames, target);
    s.marks[0].b = s.t0 + (s.frames.length ? s.frames[s.frames.length - 1].t : 0.3);
    s.marks[0].result = r.heard ? closeness(r.cents) : 'miss';
    all.push({ target, ...r });
    since.push(r.score);
    $('matchSay').textContent = r.heard ? `${r.score} points` : 'Not heard';
    $('matchFb').textContent = matchFeedback(r, nn(target));
    const dot = document.createElement('span');
    dot.className = 'dot ' + (r.heard ? closeness(r.cents) : 'off');
    dot.textContent = r.heard ? r.score : '-';
    dot.title = nn(target) + (r.heard ? `: ${Math.round(r.cents)} cents` : ': not heard');
    $('matchDots').append(dot);
    const next = adaptLevel(matchLevel, since);
    if (next !== matchLevel) { $('matchFb').textContent += next > matchLevel ? ` Level up: ${next}.` : ' Let\'s make it a little easier for a bit.'; matchLevel = next; since = []; store.set('matchLevel', matchLevel); }
    yield { kind: 'wait', dur: 2.2, lead: 0, label: '' };
  }
  matchUi(false);
  const heard = all.filter(r => r.heard), avg = Math.round(all.reduce((a, r) => a + r.score, 0) / all.length);
  const cents = heard.length ? Math.round(heard.reduce((a, r) => a + Math.abs(r.cents), 0) / heard.length) : null;
  const settle = heard.filter(r => r.settle !== null);
  const flat = heard.filter(r => r.cents < -20).length, sharp = heard.filter(r => r.cents > 20).length;
  const tips = [];
  if (flat >= 3 && flat > sharp * 2) tips.push('You tended to land a little flat. Picture each note slightly higher before you sing it, and keep the breath moving.');
  if (sharp >= 3 && sharp > flat * 2) tips.push('You tended to land a little sharp. Ease into each note rather than reaching up to it.');
  if (settle.length && median(settle.map(r => r.settle)) > 0.8) tips.push('You often slid around before settling. Try humming the note quietly in your head before you open your mouth.');
  if (all.length - heard.length >= 3) tips.push('A few notes didn\'t come through. Sing out a bit, and hold each note until the next one plays.');
  $('matchSummary').classList.remove('hidden');
  $('matchSummary').innerHTML = `<div class="stats">
      <div class="stat"><div class="k">Average score</div><div class="v">${avg}</div></div>
      <div class="stat"><div class="k">Average distance</div><div class="v">${cents === null ? '--' : cents} <small>cents</small></div></div>
      <div class="stat"><div class="k">Typical time to settle</div><div class="v">${settle.length ? median(settle.map(r => r.settle)).toFixed(1) : '--'} <small>s</small></div></div>
      <div class="stat"><div class="k">Level now</div><div class="v">${matchLevel} <small>of 5</small></div></div></div>
    <div>${avg >= 85 ? 'Excellent ear.' : avg >= 65 ? 'Good, solid matching.' : avg >= 40 ? 'Getting there. Pitch matching improves quickly with a few minutes a day.' : 'A start. Everyone begins somewhere, and this skill grows fast with practice.'}</div>
    ${tips.length ? `<ul class="feedback">${tips.map(t => `<li>${t}</li>`).join('')}</ul>` : ''}`;
  remember({ kind: 'match', score: avg, cents, level: matchLevel });
}

// ---- long notes
function fillHoldNotes() {
  const r = myRange(), safe = safeRange(r), keep = store.get('holdNote', '');
  $('holdNote').innerHTML = '';
  for (let m = safe.lo; m <= safe.hi; m++) $('holdNote').append(new Option(noteName(m) + (m >= r.tessLo && m <= r.tessHi ? '' : ' (outside your comfortable notes)'), m));
  const mid = Math.round((r.tessLo + r.tessHi) / 2);
  $('holdNote').value = keep !== '' && +keep >= safe.lo && +keep <= safe.hi ? keep : String(mid);
}
$('holdNote').onchange = () => store.set('holdNote', $('holdNote').value);
$('holdHear').onclick = () => { audio(); tone(+$('holdNote').value, ctx.currentTime + 0.02, 1.5, { steady: $('sound').value !== 'piano' }); };
$('holdStop').onclick = () => { if (job && job.step && job.step.kind === 'sing') job.step.stop = true; else { stopJob(); holdUi(false); } };
function holdUi(on) { $('holdGo').classList.toggle('hidden', on); $('holdStop').classList.toggle('hidden', !on); $('holdCard').classList.toggle('hidden', !on); }
$('holdGo').onclick = async () => {
  if (!(await ensureMic())) return;
  $('holdResult').classList.add('hidden');
  holdUi(true);
  runJob(holdJob(+$('holdNote').value));
};
function* holdJob(note) {
  $('holdSay').textContent = `Listen: ${nn(note)}`;
  $('holdSub').textContent = 'Breathe in low and easy while it plays.';
  yield { kind: 'listen', dur: 1.6, notes: [{ midi: note, at: 0, dur: 1.6 }], lead: 0.3 };
  $('holdSay').textContent = 'Now hold it on "ah"';
  $('holdSub').textContent = 'About six seconds. Steady and easy, not loud.';
  const s = yield { kind: 'sing', dur: 10, lead: 0.3, notes: [{ midi: note, at: 0, dur: 7 }], until: (st, el) => {
    const v = st.frames.filter(f => f.midi !== null);
    if (!v.length) return el > 6;   // nothing at all after 6 s: stop and say so
    const held = v[v.length - 1].t - v[0].t;
    return held >= 6.5 || (held >= 2.5 && el - v[v.length - 1].t > 0.7);
  } };
  holdUi(false);
  const a = analyzeSustain(s.frames, note), box = $('holdResult');
  box.classList.remove('hidden');
  if (!a) { box.innerHTML = '<div class="say">Not long enough to judge</div><div class="sub">I need at least two seconds of one steady note. Try again, and keep the "ah" going until the bar ends.</div>'; return; }
  if (s.marks[0]) s.marks[0].result = closeness(a.cents);
  const v = a.vibrato;
  box.innerHTML = `<div class="stats">
      <div class="stat"><div class="k">On the note</div><div class="v">${Math.round(a.cents) > 0 ? '+' : ''}${Math.round(a.cents)} <small>cents</small></div></div>
      <div class="stat"><div class="k">Steadiness (wander)</div><div class="v">${Math.round(a.wobble)} <small>cents</small></div></div>
      <div class="stat"><div class="k">Drift over the hold</div><div class="v">${Math.round(a.drift) > 0 ? '+' : ''}${Math.round(a.drift)} <small>cents</small></div></div>
      <div class="stat"><div class="k">Vibrato</div><div class="v">${v ? v.rate.toFixed(1) + ' <small>per second, &plusmn;' + Math.round(v.width / 2) + ' cents</small>' : '<small>none</small>'}</div></div></div>
    <ul class="feedback">${sustainFeedback(a).map(t => `<li>${t}</li>`).join('')}</ul>
    <div class="hint">Measured over ${a.seconds.toFixed(1)} s, leaving out the first moment (the start of a note always moves a little).</div>`;
  remember({ kind: 'sustain', note, cents: Math.round(a.cents), wobble: Math.round(a.wobble), drift: Math.round(a.drift), vibratoRate: v ? +v.rate.toFixed(1) : null, vibratoWidth: v ? Math.round(v.width) : null });
}

// ---- sing back
$('backStop').onclick = () => { stopJob(); backUi(false); };
function backUi(on) { $('backGo').classList.toggle('hidden', on); $('backStop').classList.toggle('hidden', !on); $('backCard').classList.toggle('hidden', !on); }
$('backGo').onclick = async () => {
  if (!(await ensureMic())) return;
  $('backSummary').classList.add('hidden');
  backUi(true);
  runJob(backJob());
};
const jumpWords = j => {
  if (j.cents === null) return `${intervalName(j.target)}: not heard`;
  const c = Math.round(j.cents), small = Math.sign(c) !== Math.sign(j.target) && j.target !== 0;
  return `${intervalName(j.target)}: ` + (Math.abs(c) <= 25 ? 'right on' : `${Math.abs(c)} cents too ${small ? 'small' : 'big'}`);
};
function* backJob() {
  const range = myRange(), scores = [];
  let since = [];
  for (let i = 0; i < 5; i++) {
    const notes = buildSingBack(backLevel, range), step = 0.75;
    const pat = notes.map((m, k) => ({ midi: m, at: k * step, dur: step - 0.08 }));
    $('backLevel').textContent = `Level ${backLevel} of 5`;
    $('backWhere').textContent = `Tune ${i + 1} of 5`;
    $('backSay').textContent = `Listen: ${notes.length} notes`;
    $('backFb').textContent = '';
    yield { kind: 'listen', dur: notes.length * step, notes: pat, lead: 0.4 };
    $('backSay').textContent = 'Now sing them back on "la"';
    const sing = pat.map(n => ({ ...n, dur: n.dur + 0.05 }));
    const s = yield { kind: 'sing', dur: notes.length * step + 1.6, lead: 0.4, notes: sing };
    const r = scoreSingBack(s.frames, notes);
    r.notes.forEach((n, k) => { if (s.marks[k]) s.marks[k].result = n.cents === null ? 'miss' : closeness(n.cents); });
    scores.push(r.score);
    since.push(r.score);
    $('backSay').textContent = `${r.score} points`;
    $('backFb').innerHTML = 'Notes: ' + r.notes.map(n => `${nn(n.target)} ${n.cents === null ? '(not heard)' : Math.abs(n.cents) <= 25 ? '(on it)' : `(${Math.round(Math.abs(n.cents))} cents ${n.cents < 0 ? 'low' : 'high'})`}`).join(', ')
      + '<br>Jumps: ' + r.jumps.map(jumpWords).join(', ')
      + (r.octaves ? '<br>You sang it an octave ' + (r.octaves < 0 ? 'lower' : 'higher') + ', which counts.' : '');
    const next = adaptLevel(backLevel, since);
    if (next !== backLevel) { backLevel = next; since = []; store.set('backLevel', backLevel); }
    yield { kind: 'wait', dur: 2.8, lead: 0, label: '' };
  }
  backUi(false);
  const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  $('backSummary').classList.remove('hidden');
  $('backSummary').innerHTML = `<div class="say">Average ${avg} points</div><div class="sub">${avg >= 80 ? 'A good ear for intervals.' : avg >= 50 ? 'Nice work. The jumps get easier the more tunes you sing back.' : 'Good start. Try humming each tune quietly before singing it out.'} Now at level ${backLevel} of 5.</div>`;
  remember({ kind: 'singback', score: avg, level: backLevel });
}

// ---- song key
for (let m = 36; m <= 88; m++) { $('keyLow').append(new Option(noteName(m), m)); $('keyHigh').append(new Option(noteName(m), m)); }
KEY_NAMES.forEach((k, i) => $('keyOrig').append(new Option(k, i)));
$('keyLow').value = store.get('keyLow', '55');
$('keyHigh').value = store.get('keyHigh', '67');
$('keyOrig').value = store.get('keyOrig', '');
for (const id of ['keyLow', 'keyHigh', 'keyOrig']) $(id).onchange = () => { store.set(id, $(id).value); showKeys(); };
function showKeys() {
  const r = myRange(), lo = +$('keyLow').value, hi = +$('keyHigh').value, orig = $('keyOrig').value;
  const list = suggestKeys(lo, hi, r, orig === '' ? null : +orig), best = list[0], asIs = list.find(k => k.shift === 0);
  const fit = k => k.comfortable ? '<span class="tag ok">comfortable</span>' : k.fits ? `<span class="tag mid">fits, ${k.high > r.tessHi && k.low < r.tessLo ? 'stretches both ends' : 'a bit ' + (k.high > r.tessHi ? 'high' : 'low')}</span>` : '<span class="tag no">out of range</span>';
  const keyOf = k => k.key ? ` (key of ${k.key})` : '';
  let head;
  if (!best.fits) head = `<div class="say">This melody spans ${Math.abs(hi - lo)} semitones, wider than your range (${r.high - r.low}).</div><div class="sub">The closest fit is ${shiftWords(best.shift)}${keyOf(best)}: a few notes will still sit outside. You could take the highest phrase down an octave, or keep practicing: ranges grow.</div>`;
  else if (best.shift === 0) head = `<div class="say">Sing it as written${keyOf(best)}.</div><div class="sub">The melody (${nn(lo)} to ${nn(hi)}) ${best.comfortable ? 'sits right in your comfortable notes.' : 'fits your range.'}</div>`;
  else {
    const capo = capoFor(best.shift);
    head = `<div class="say">Move it ${shiftWords(best.shift)}${keyOf(best)}.</div><div class="sub">The melody would run ${nn(best.low)} to ${nn(best.high)}${best.comfortable ? ', all inside your comfortable notes' : ''}. As written it's ${asIs.fits ? (asIs.comfortable ? 'comfortable too' : 'singable but a bit ' + (asIs.high > r.tessHi ? 'high' : 'low')) : 'out of your range'}.${capo ? ` On guitar: capo ${capo}, same chord shapes.` : ''}</div>`;
  }
  const rows = [...list.filter(k => k.fits).slice(0, 6)];
  if (!rows.includes(asIs)) rows.push(asIs);
  if (!rows.length) rows.push(...list.slice(0, 3));
  rows.sort((a, b) => a.shift - b.shift);
  $('keyResult').innerHTML = head + `<table><thead><tr><th>Move</th>${orig !== '' ? '<th>Key</th>' : ''}<th>Melody</th><th>Fit</th></tr></thead><tbody>`
    + rows.map(k => `<tr class="${k === best ? 'best' : ''}"><td>${k.shift === 0 ? 'As written' : (k.shift > 0 ? '+' : '') + k.shift}</td>${orig !== '' ? `<td>${k.key}</td>` : ''}<td>${nn(k.low)} to ${nn(k.high)}</td><td>${fit(k)}</td></tr>`).join('')
    + `</tbody></table><div class="hint" style="margin-top:8px">Your range: ${nn(r.low)} to ${nn(r.high)}, comfortable ${nn(r.tessLo)} to ${nn(r.tessHi)}.</div>`;
}
$('keySing').onclick = async () => {
  if (!(await ensureMic())) return;
  $('keySing').classList.add('hidden');
  $('keySingDone').classList.remove('hidden');
  $('graphPanel').classList.remove('hidden');
  runJob((function* () {
    const s = yield { kind: 'sing', dur: 90, lead: 0.1, label: 'Sing the melody', until: (st, el) => { $('keyCount').textContent = `Listening... ${Math.floor(el)} s`; return false; } };
    $('keySing').classList.remove('hidden');
    $('keySingDone').classList.add('hidden');
    $('keyCount').textContent = '';
    $('graphPanel').classList.add('hidden');
    const r = analyzeRange(s.frames);
    if (!r) { $('keyCount').textContent = 'I didn\'t catch enough of the melody. Try again, a little louder.'; return; }
    $('keyLow').value = r.low; $('keyHigh').value = r.high;
    store.set('keyLow', r.low); store.set('keyHigh', r.high);
    $('keyCount').textContent = `Caught it: ${nn(r.low)} to ${nn(r.high)}.`;
    showKeys();
  })());
};
$('keySingDone').onclick = () => { if (job && job.step) job.step.stop = true; };

// ---- progress
const fmtDay = iso => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
function describe(h) {
  switch (h.kind) {
    case 'range': return ['Range test', `${nn(h.low)} to ${nn(h.high)}, comfortable ${nn(h.tessLo)} to ${nn(h.tessHi)}`];
    case 'match': return ['Pitch matching', `${h.score} points${h.cents !== null && h.cents !== undefined ? `, ${h.cents} cents average` : ''}, level ${h.level}`];
    case 'warmup': return ['Warm-up', `${h.minutes} min, ${h.inTune}% of notes in tune`];
    case 'sustain': return ['Long note', `${nn(h.note)}: wander ${h.wobble} cents${h.vibratoRate ? `, vibrato ${h.vibratoRate} per second` : ''}`];
    case 'singback': return ['Sing back', `${h.score} points, level ${h.level}`];
    default: return [h.kind, ''];
  }
}
function drawProgress() {
  const hs = data.history, days = [...new Set(hs.map(h => dayOf(h.t)))], today = dayOf(Date.now());
  const matches = hs.filter(h => h.kind === 'match'), ranges = hs.filter(h => h.kind === 'range');
  const lastWeek = matches.filter(h => Date.now() - new Date(h.t) < 7 * 864e5);
  $('progStats').innerHTML = `
    <div class="stat"><div class="k">Practice streak</div><div class="v">${streak(days, today)} <small>day${streak(days, today) === 1 ? '' : 's'}</small></div></div>
    <div class="stat"><div class="k">Days practiced</div><div class="v">${days.length}</div></div>
    <div class="stat"><div class="k">Your range</div><div class="v">${data.range ? `${nn(data.range.low)} <small>to</small> ${nn(data.range.high)}` : '<small>not tested yet</small>'}</div></div>
    <div class="stat"><div class="k">Matching, last 7 days</div><div class="v">${lastWeek.length ? Math.round(lastWeek.reduce((a, h) => a + h.score, 0) / lastWeek.length) + ' <small>points</small>' : '<small>no rounds yet</small>'}</div></div>`;
  chart($('chartRange'), $('tipRange'), ranges, 'range');
  chart($('chartMatch'), $('tipMatch'), matches, 'match');
  $('progTable').innerHTML = hs.length ? hs.slice(-25).reverse().map(h => { const [what, res] = describe(h); return `<tr><td>${fmtDay(h.t)}</td><td>${what}</td><td>${res}</td></tr>`; }).join('')
                                       : '<tr><td colspan="3" class="hint">Nothing yet. Every range test, warm-up and round you finish shows up here.</td></tr>';
}

/** A small chart: range tests as bars (lowest to highest, the comfortable part solid), or match scores as a line; hover for details */
function chart(c, tip, items, kind) {
  const dpr = window.devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight;
  if (!w) return;
  c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
  const g = c.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  g.font = '11px "DM Sans", system-ui, sans-serif';
  const left = 40, right = 10, top = 8, bottom = 22, pw = w - left - right, ph = h - top - bottom;
  if (!items.length) {
    g.fillStyle = '#91887d'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(kind === 'range' ? 'No range tests yet' : 'No matching rounds yet', w / 2, h / 2);
    c.onmousemove = null; return;
  }
  const shown = items.slice(-30), n = shown.length, slot = pw / n, Xc = i => left + slot * (i + 0.5);
  let lo, hi;
  if (kind === 'range') { lo = Math.min(...shown.map(r => r.low)) - 2; hi = Math.max(...shown.map(r => r.high)) + 2; } else { lo = 0; hi = 100; }
  const Y = v => top + ph - (v - lo) / (hi - lo) * ph;
  // recessive grid and labels
  g.textBaseline = 'middle'; g.textAlign = 'right';
  const ticks = kind === 'range' ? Array.from({ length: hi - lo + 1 }, (_, k) => lo + k).filter(m => m % 12 === 0 || (hi - lo < 18 && m % 12 === 7)) : [0, 50, 100];
  for (const v of ticks) { g.fillStyle = '#2c2723'; g.fillRect(left, Math.round(Y(v)), pw, 1); g.fillStyle = '#91887d'; g.fillText(kind === 'range' ? noteName(v) : String(v), left - 6, Y(v)); }
  g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  const every = Math.ceil(n / Math.max(1, Math.floor(pw / 56)));
  shown.forEach((it, i) => { if (i % every === 0) { g.fillStyle = '#91887d'; g.fillText(fmtDay(it.t), Xc(i), h - 6); } });
  if (kind === 'range') {
    const bw = Math.max(4, Math.min(14, slot * 0.45));
    shown.forEach((r, i) => {
      const x = Xc(i) - bw / 2;
      g.fillStyle = 'rgb(22 160 184 / 0.4)';
      g.beginPath(); g.roundRect ? g.roundRect(x, Y(r.high), bw, Y(r.low) - Y(r.high), 4) : g.rect(x, Y(r.high), bw, Y(r.low) - Y(r.high)); g.fill();
      g.fillStyle = '#16a0b8';
      g.beginPath(); g.roundRect ? g.roundRect(x, Y(r.tessHi), bw, Math.max(2, Y(r.tessLo) - Y(r.tessHi)), 4) : g.rect(x, Y(r.tessHi), bw, Y(r.tessLo) - Y(r.tessHi)); g.fill();
    });
  } else {
    g.strokeStyle = '#f2551f'; g.lineWidth = 2; g.lineJoin = 'round';
    g.beginPath(); shown.forEach((m, i) => i ? g.lineTo(Xc(i), Y(m.score)) : g.moveTo(Xc(i), Y(m.score))); g.stroke();
    shown.forEach((m, i) => { g.fillStyle = '#171412'; g.beginPath(); g.arc(Xc(i), Y(m.score), 5, 0, 7); g.fill(); g.fillStyle = '#f2551f'; g.beginPath(); g.arc(Xc(i), Y(m.score), 4, 0, 7); g.fill(); });
  }
  const hover = (clientX) => {
    const rect = c.getBoundingClientRect(), i = Math.max(0, Math.min(n - 1, Math.floor((clientX - rect.left - left) / slot))), it = shown[i];
    tip.classList.remove('hidden');
    tip.innerHTML = `<b>${fmtDay(it.t)}</b><br>` + (kind === 'range' ? `${nn(it.low)} to ${nn(it.high)}<br>comfortable ${nn(it.tessLo)} to ${nn(it.tessHi)}` : `${it.score} points, level ${it.level}${it.cents !== null && it.cents !== undefined ? `<br>${it.cents} cents average` : ''}`);
    const x = Xc(i) + 12, flip = x + tip.offsetWidth > w;
    tip.style.left = (flip ? Xc(i) - 12 - tip.offsetWidth : x) + 'px';
    tip.style.top = (c.offsetTop + 10) + 'px';
  };
  c.onmousemove = e => hover(e.clientX);
  c.ontouchstart = e => hover(e.touches[0].clientX);
  c.onmouseleave = () => tip.classList.add('hidden');
}
window.addEventListener('resize', () => { if (mode === 'progress') drawProgress(); });

$('exportBtn').onclick = () => {
  const blob = new Blob([JSON.stringify({ app: 'encore-voice', version: 1, exported: new Date().toISOString(), range: data.range, history: data.history }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `encore-voice-progress-${dayOf(Date.now())}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};
$('importBtn').onclick = () => $('importFile').click();
$('importFile').onchange = async () => {
  const file = $('importFile').files[0];
  $('importFile').value = '';
  if (!file) return;
  try {
    const got = validateImport(JSON.parse(await file.text()));
    // merged with what's here: sessions joined (no doubles), the newer range kept
    const seen = new Set(data.history.map(h => h.t + h.kind));
    data.history = [...data.history, ...got.history.filter(h => !seen.has(h.t + h.kind))].sort((a, b) => a.t < b.t ? -1 : 1);
    if (got.range && (!data.range || (got.range.t || '') > (data.range.t || ''))) data.range = got.range;
    save();
    drawProgress();
    afterRangeChange();
    alert(`Imported ${got.history.length} sessions.`);
  } catch (e) { alert(e.message && e.message.includes('Encore Voice') ? e.message : 'That file couldn\'t be read as an Encore Voice progress file.'); }
};
$('clearBtn').onclick = () => {
  if (!confirm('Clear your saved range and all progress on this device? Export first if you want a copy.')) return;
  data = { range: null, history: [] };
  save();
  drawProgress();
  afterRangeChange();
};
function afterRangeChange() { showRangeResult(); showBanner(); fillHoldNotes(); }

// ---- start
fillHoldNotes();
showRangeResult();
drawRangeSteps();
describeWarmupMode();
setMode(store.get('mode', 'live'));
requestAnimationFrame(frame);
