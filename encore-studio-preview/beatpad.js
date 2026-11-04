// Encore Beatpad: the page. Nine pads you play with taps (several fingers at once), keys, or a MIDI controller;
// your own sounds in a library kept on this device; kits you can save, share (.beatpad files) and bring in;
// and a small loop recorder with note repeat. Every sound is decoded ahead of time and started straight from
// the key, touch or MIDI event (not a click), so a hit is as quick as the device's audio allows. Nothing leaves the browser.
import { SLOTS, GRID_ORDER, presetKit, cleanKit, cleanPad, buildKitJson, parseKitJson, keyLabel, slotForKey, slotForNote, assignNote,
         resetNotes, velocityGain, parseMidi, midiLabel, gmNoteFor, guessTags, assignFiles, nameFromFile, safeFileName, isAudioName, autoTrimStart, hitPlan,
         chokeTargets, encodeWav, beatInLoop, quantizeBeat, loopHitsBetween, clicksBetween, nextGridTime, readZip, findKitJson, matchFile, QUANTIZE,
         KEY_LAYOUTS, defaultLayout, cleanKeyState, activeKeys, pickLayout, remapOverwritesCustom, remapKey, keyCode } from './beatpad-core.js';
import { KITS, BUILTIN, renderSound } from './beatpad-kit.js';
import { makeSounds } from './metronome-core.js';
import { zip, crc32 } from './zip.js';
import * as db from './beatpad-store.js';

const $ = id => document.getElementById(id);
const store = {
  get: (k, d) => { try { const v = localStorage.getItem('encoreBeatpad.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem('encoreBeatpad.' + k, JSON.stringify(v)); } catch {} },
};
const P = { active: { preset: 'encore' }, numpad: true, bpm: 90, bars: 2, quantize: 4, click: true, repeatRate: 4, latch: false, trimDb: -40, vel: true, alias: true,
            midi: false, tab: 'pad', sel: 1, ...store.get('page', {}) };
const savePage = () => store.set('page', P);
// the keys: a ready-made layout, or Custom (what you mapped yourself, kept when you switch to a layout)
let keyState = cleanKeyState(store.get('keyState', null),
  defaultLayout({ coarse: matchMedia('(pointer: coarse)').matches, screenWidth: screen.width, mac: /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) }));
let keys = activeKeys(keyState);
const saveKeys = () => { keys = activeKeys(keyState); store.set('keyState', keyState); renderLayoutPick(); };
const layoutName = id => id === 'custom' ? 'Custom' : KEY_LAYOUTS.find(l => l.id === id).name;
function renderLayoutPick() {
  for (const id of ['keyLayout', 'keyLayout2']) {
    const sel = $(id);
    if (!sel.options.length) {
      for (const l of KEY_LAYOUTS) sel.append(new Option(l.name, l.id));
      sel.append(new Option('Custom', 'custom'));
      sel.onchange = () => chooseLayout(sel.value);
    }
    sel.lastChild.disabled = !keyState.custom;
    sel.lastChild.textContent = keyState.custom ? 'Custom (your own)' : 'Custom (map keys to make it)';
    sel.value = keyState.layout;
  }
  const l = KEY_LAYOUTS.find(x => x.id === keyState.layout);
  $('layoutAbout').textContent = l ? l.about + '.' : 'Your own keys. Pick a layout to switch; these stay here as Custom.';
}
function chooseLayout(id) {
  const r = pickLayout(keyState, id);
  if (r.confirm && !confirm('Switch to ' + layoutName(id) + '? Your own keys are kept: pick Custom to get them back.')) { renderLayoutPick(); return; }
  keyState = r.state;
  saveKeys();
  renderPads(); renderMap(); renderEditor();
  for (const id2 of ['keyLayout', 'keyLayout2']) $(id2).blur();
  say('Keys: ' + layoutName(keyState.layout), false, 2500);
}
const keyPads = () => Array.from({ length: SLOTS }, (_, i) => ({ slot: i + 1, key: keys[i + 1] || null }));
const fmtS = s => s < 1 ? Math.round(s * 1000) + ' ms' : s.toFixed(2) + ' s';

// for the page's own checks (headless tests): every hit, and how many sounds are playing
const stats = { hits: [] };
window.beatpadTest = { stats, voices: () => player ? player.count() : 0, kit: () => kit, keys: () => keys, keyState: () => keyState, loaded: () => bufs.slice(1).map(b => b ? Math.round(b.duration * 1000) / 1000 : 0), events: () => events, samples: () => samples, transport: () => T };

let toastTimer = 0;
function toast(msg, ms = 2600) { const t = $('toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('hidden'), ms); }
let msgTimer = 0;
function say(msg, bad = false, ms = 4000) { const m = $('flashMsg'); m.textContent = msg; m.classList.toggle('bad', bad); clearTimeout(msgTimer); if (ms) msgTimer = setTimeout(() => { if (!mapMode && !learnMode) m.textContent = ''; }, ms); }

// ---- audio: one context, a master bus with a soft limiter (no lookahead, so it adds no delay), one player for the pads

let ctx = null, master = null, player = null, clickBufs = null;
function audio() {
  if (!ctx) {
    ctx = new AudioContext({ latencyHint: 'interactive' });
    master = ctx.createGain();
    master.gain.value = 0.85;
    const shaper = ctx.createWaveShaper(), n = 2048, curve = new Float32Array(n);
    // straight through up to 0.7, then bending smoothly toward 1: several pads at once never clip harshly
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1, a = Math.abs(x); curve[i] = Math.sign(x) * (a < 0.7 ? a : 0.7 + 0.3 * Math.tanh((a - 0.7) / 0.3)); }
    shaper.curve = curve;
    master.connect(shaper).connect(ctx.destination);
    player = new Player(ctx, master);
  }
  return ctx;
}
/** Wakes the audio up (phones only allow that inside a touch or key press) */
function wake() { const c = audio(); if (c.state !== 'running') c.resume().then(showLatency, () => {}); return c; }

/** Plays pad sounds into a context (the live one, or an offline one for saving the loop): chokes, retrigger, layers */
class Player {
  constructor(c, dest) { this.c = c; this.dest = dest; this.voices = Array.from({ length: SLOTS + 1 }, () => []); }
  play(slot, pad, buf, vel, when, pads) {
    for (const s of chokeTargets(pads, slot)) this.stop(s, when);
    const plan = hitPlan(pad, buf.duration, vel);
    if (plan.gain <= 0) return null;
    const c = this.c, src = c.createBufferSource(), g = c.createGain();
    src.buffer = buf;
    src.playbackRate.value = plan.rate;
    g.gain.setValueAtTime(plan.gain, when);
    if (plan.fade > 0) { g.gain.setValueAtTime(plan.gain, when + plan.fadeAt); g.gain.linearRampToValueAtTime(0, when + plan.length); }
    src.connect(g);
    let out = g;
    if (plan.pan) { const p = c.createStereoPanner(); p.pan.value = plan.pan; g.connect(p); out = p; }
    out.connect(this.dest);
    src.start(when, plan.offset, plan.duration);
    const list = this.voices[slot], v = { src, g, when };
    list.push(v);
    if (list.length > 16) this.end(list.shift(), when);
    src.onended = () => { const i = list.indexOf(v); if (i >= 0) list.splice(i, 1); try { out.disconnect(); } catch {} };
    return v;
  }
  /** Cuts a pad's sounds that started before `when`, with a few ms of fade so it doesn't click */
  stop(slot, when) {
    const list = this.voices[slot];
    for (let i = list.length - 1; i >= 0; i--) if (list[i].when < when) { this.end(list[i], when); list.splice(i, 1); }
  }
  end(v, when) {
    const g = v.g.gain;
    if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(when); else g.cancelScheduledValues(when);
    g.setTargetAtTime(0, when, 0.004);
    try { v.src.stop(when + 0.04); } catch {}
  }
  count() { return this.voices.reduce((n, l) => n + l.length, 0); }
}

function showLatency() {
  if (!ctx) return;
  const ms = Math.round(((ctx.baseLatency || 0) + (ctx.outputLatency || 0)) * 1000);
  $('latencyInfo').textContent = ms ? 'Sound delay on this device: about ' + ms + ' ms from a hit to the speaker (the browser and your audio hardware decide this). Wired headphones or speakers are quicker than Bluetooth.' : '';
}

// ---- sounds: built-in (synthesized here), from your library, or a built-in kit's files; decoded once, kept

const decoded = new Map();   // 'b:kick' / 'id:...' / 'u:...' -> AudioBuffer (or a promise of one)
let samples = [];            // the library: what each sample is (the bytes stay in IndexedDB)
const sampleById = id => samples.find(s => s.id === id);
const decode = bytes => new Promise((res, rej) => audio().decodeAudioData(bytes, res, rej));

function toBuffer(x) { const c = audio(), b = c.createBuffer(1, x.length, c.sampleRate); b.copyToChannel(x, 0); return b; }

/** The AudioBuffer for a pad's sample, or null when there's none (or it's gone) */
function bufferFor(sample) {
  if (!sample) return Promise.resolve(null);
  const key = sample.builtin ? 'b:' + sample.builtin : sample.id ? 'id:' + sample.id : 'u:' + sample.url;
  if (!decoded.has(key)) {
    const p = (async () => {
      if (sample.builtin) { const x = renderSound(sample.builtin, audio().sampleRate); return x ? toBuffer(x) : null; }
      if (sample.id) { const bytes = await db.sampleBytes(sample.id).catch(() => null); return bytes ? decode(bytes.slice(0)) : null; }
      return decode((await urlBytes(sample.url)).slice(0));
    })().then(b => { decoded.set(key, b); return b; }, e => { decoded.delete(key); throw e; });
    decoded.set(key, p);
  }
  return Promise.resolve(decoded.get(key));
}

/** A built-in kit's file: from this device if it was fetched before (so it works offline), else fetched and kept */
async function urlBytes(url) {
  const id = 'url:' + url, kept = await db.get('audio', id).catch(() => null);
  if (kept?.bytes) return kept.bytes;
  const r = await fetch(url);
  if (!r.ok) throw new Error('Couldn\'t download ' + url.split('/').pop() + ' (' + r.status + '). Check your connection and try again.');
  const bytes = await r.arrayBuffer();
  db.put('audio', { id, bytes }).catch(() => {});
  return bytes;
}

// ---- the kit you're playing

let kit = null;                   // { name, author, bpm, pads, id (yours) or preset (built-in), credit }
let userKits = [];                // your saved kits
const bufs = new Array(SLOTS + 1).fill(null);
let loadGen = 0;

async function loadBuffers() {
  const gen = ++loadGen, missing = [];
  renderPads();
  await Promise.all(kit.pads.map(async p => {
    bufs[p.slot] = null;
    padEls[p.slot]?.classList.add('isLoading');
    let b = null;
    try { b = await bufferFor(p.sample); } catch (e) { missing.push(p.name + ': ' + (e.message || 'couldn\'t be read')); }
    if (gen !== loadGen) return;
    if (!b && p.sample?.id) missing.push(p.name + ': its sound isn\'t in your library any more');
    bufs[p.slot] = b;
  }));
  if (gen !== loadGen) return;
  renderPads();
  renderEditor();
  if (missing.length) say(missing.slice(0, 2).join('; ') + (missing.length > 2 ? ' (and ' + (missing.length - 2) + ' more)' : ''), true, 8000);
}

function setKit(k, active) {
  kit = k;
  P.active = active;
  savePage();
  $('credit').textContent = kit.credit || '';
  $('credit').classList.toggle('hidden', !kit.credit);
  renderKitPick();
  renderKits();
  renderMap();
  return loadBuffers();
}

async function loadPreset(id) {
  const pre = KITS.find(k => k.id === id) || KITS[0];
  if (pre.pads) return setKit({ ...presetKit(pre), preset: pre.id }, { preset: pre.id });
  // a recorded kit: its own folder in the Beatpad format, fetched only now
  say('Loading the ' + pre.name + ' kit...', false, 0);
  try {
    const text = new TextDecoder().decode(await urlBytes(pre.url + 'kit.json'));
    const { kit: k, files } = parseKitJson(text);
    for (const p of k.pads) p.sample = files[p.slot] ? { url: pre.url + files[p.slot] } : null;
    await setKit({ ...k, preset: pre.id, credit: pre.credit }, { preset: pre.id });
    say(pre.name + ' kit ready', false, 2000);
  } catch (e) {
    say('The ' + pre.name + ' kit didn\'t load: ' + e.message, true, 10000);
    if (!kit) await loadPreset('encore');
  }
}

async function loadUserKit(id) {
  const k = userKits.find(x => x.id === id);
  if (!k) return loadPreset('encore');
  return setKit({ ...cleanKit(k), id: k.id, credit: k.credit || '' }, { kit: k.id });
}

const uniqueName = base => { let n = base.slice(0, 24), i = 2; while (userKits.some(k => k.name === n)) n = (base.slice(0, 21) + ' ' + i++); return n; };

/** Every change to the kit goes through here. A built-in kit becomes your own copy the first time you change it */
let saveTimer = 0;
function changed(why = '') {
  if (!kit.id) {
    const was = kit.name;
    kit.id = db.newId();
    kit.name = uniqueName('My ' + was);
    delete kit.preset;
    P.active = { kit: kit.id };
    savePage();
    userKits.push(snapshot());
    renderKitPick();
    toast('Built-in kits stay as they are, so your changes are saved as a new kit: "' + kit.name + '"', 4200);
  }
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveKit, 400);
  renderKits();
  if (why !== 'quiet') renderPads();
}
const snapshot = () => ({ id: kit.id, name: kit.name, author: kit.author, bpm: kit.bpm, pads: kit.pads.map(p => ({ ...p })), credit: kit.credit || '', updated: Date.now() });
async function saveKit() {
  if (!kit?.id) return;
  const s = snapshot(), i = userKits.findIndex(k => k.id === s.id);
  if (i >= 0) userKits[i] = s; else userKits.push(s);
  try { await db.put('kits', s); } catch (e) { say(e.message, true, 8000); }
}

// ---- the pads

const padEls = [];
function buildPads() {
  const box = $('pads');
  box.innerHTML = '';
  for (const slot of GRID_ORDER) {
    const el = document.createElement('div');
    el.className = 'pad';
    el.dataset.slot = slot;
    el.setAttribute('role', 'button');
    el.innerHTML = '<div class="flash"></div><div><div class="nm"></div><div class="src"></div></div><div class="foot"><kbd></kbd><span class="midi"></span></div>';
    padEls[slot] = el;
    box.append(el);
    el.addEventListener('pointerdown', e => onPadDown(e, slot));
    el.addEventListener('pointerup', e => release('p' + e.pointerId));
    el.addEventListener('pointercancel', e => release('p' + e.pointerId));
    el.addEventListener('lostpointercapture', e => release('p' + e.pointerId));
    el.addEventListener('contextmenu', e => e.preventDefault());
    el.addEventListener('dragover', e => { if (dragKind(e)) { e.preventDefault(); e.stopPropagation(); el.classList.add('drop'); hidePageDrop(); } });
    el.addEventListener('dragleave', () => el.classList.remove('drop'));
    el.addEventListener('drop', e => { e.preventDefault(); e.stopPropagation(); el.classList.remove('drop'); hidePageDrop(); dropOnPad(e, slot); });
  }
}

function soundName(p) {
  const s = p.sample;
  if (!s) return 'empty';
  if (s.builtin) return 'built-in';
  if (s.id) return sampleById(s.id)?.name || 'missing sound';
  return kit.preset ? (KITS.find(k => k.id === kit.preset)?.name || '') + ' kit' : s.url.split('/').pop();
}

function renderPads() {
  if (!kit) return;
  for (const p of kit.pads) {
    const el = padEls[p.slot];
    el.querySelector('.nm').textContent = p.name;
    el.querySelector('.src').textContent = soundName(p);
    el.querySelector('kbd').textContent = keys[p.slot] ? keyLabel(keys[p.slot]) : '-';
    el.querySelector('kbd').classList.toggle('hidden', !keys[p.slot] && !mapMode);
    el.querySelector('.midi').textContent = p.midi ?? '';
    el.classList.toggle('empty', !p.sample);
    el.classList.toggle('muted', p.mute);
    el.classList.toggle('sel', p.slot === P.sel);
    el.setAttribute('aria-label', 'Pad ' + p.slot + ': ' + p.name + (keys[p.slot] ? ', key ' + keyLabel(keys[p.slot]) : ''));
  }
  $('pads').classList.toggle('mapping', mapMode || learnMode);
}

function flash(slot, vel = 1) {
  const el = padEls[slot];
  if (!el) return;
  el.firstChild.animate([{ opacity: 0.35 + 0.6 * vel }, { opacity: 0 }], { duration: 240, easing: 'cubic-bezier(.2,.8,.3,1)' });
  el.animate([{ transform: 'scale(0.965)' }, { transform: 'none' }], { duration: 110, easing: 'ease-out' });
}

/** A hit, now: the sound, the light, and into the loop if it's recording */
function hit(slot, vel = 1, how = 'key') {
  if (!slot || !kit) return;
  const c = wake(), when = c.currentTime, pad = kit.pads[slot - 1], buf = bufs[slot];
  if (buf) player.play(slot, pad, buf, vel, when, kit.pads);
  flash(slot, vel);
  stats.hits.push({ slot, how, vel: Math.round(vel * 100) / 100, sounded: !!buf && !pad.mute });
  if (stats.hits.length > 500) stats.hits.splice(0, 100);
  record(slot, vel, when, false);
}

/** A hit at a set time (the loop playing back, or note repeat): the light comes on when you hear it */
function hitAt(slot, vel, when, rec, how = rec ? 'repeat' : 'loop') {
  const pad = kit.pads[slot - 1], buf = bufs[slot];
  if (buf) player.play(slot, pad, buf, vel, when, kit.pads);
  const lag = Math.max(0, (when - ctx.currentTime + (ctx.outputLatency || 0)) * 1000);
  setTimeout(() => flash(slot, vel), lag);
  stats.hits.push({ slot, how, vel: Math.round(vel * 100) / 100, sounded: !!buf && !pad.mute });
  if (rec) record(slot, vel, when, true);
}

function selectPad(slot) {
  if (P.sel === slot) return;
  P.sel = slot;
  savePage();
  renderPads();
  renderEditor();
}

// ---- playing: touch and mouse, keys, MIDI

const held = new Map();          // what's holding a pad down (a finger, a key, a MIDI note) -> slot, for note repeat
function onPadDown(e, slot) {
  e.preventDefault();
  try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
  wake();
  if (mapMode || learnMode) { selectPad(slot); say(mapMode ? 'Now press the key for ' + kit.pads[slot - 1].name + ' (Esc when you\'re done)' : 'Now hit a pad or key on your MIDI controller for ' + kit.pads[slot - 1].name, false, 0); return; }
  if (e.button > 0) return;
  // a pen gives pressure; fingers and mice play at full
  const vel = e.pointerType === 'pen' && e.pressure > 0 ? Math.max(0.2, e.pressure) : 1;
  hit(slot, vel, e.pointerType === 'touch' ? 'touch' : 'pointer');
  press('p' + e.pointerId, slot, vel);
  if (e.pointerType !== 'touch' || !e.isPrimary || P.sel !== slot) selectPad(slot);
}

const isTyping = t => t && (t.isContentEditable || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || (t.tagName === 'INPUT' && !/^(range|checkbox|radio|button|file|color)$/i.test(t.type)));
let spaceHeld = false, strayLetters = 0;

document.addEventListener('keydown', e => {
  if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
  if (mapMode) {
    e.preventDefault();
    if (e.repeat) return;
    if (e.code === 'Escape') { endMapMode(); return; }
    const code = keyCode(e.code, e.location), r = remapKey(keyState, P.sel, code);
    if (r.refused) { say(r.refused, true); return; }
    keyState = r.state;
    saveKeys();
    const me = kit.pads[P.sel - 1].name;
    say(me + ' is now ' + keyLabel(code) + (r.swapped ? '; ' + kit.pads[r.swapped - 1].name + ' gets ' + (keys[r.swapped] ? keyLabel(keys[r.swapped]) : 'no key') + ' (they swapped)' : '') + '. Click the next pad, or Esc to finish.', false, 0);
    flash(P.sel);
    if (mapOnce) endMapMode(); else { const i = GRID_ORDER.indexOf(P.sel); P.sel = GRID_ORDER[(i + 1) % SLOTS]; }
    renderPads(); renderEditor(); renderMap();
    return;
  }
  if (e.code === 'Escape' && learnMode) { endLearn(); return; }
  const code = keyCode(e.code, e.location), slot = slotForKey(keyPads(), code, P.numpad);
  if (!slot && keyState.layout === 'numpad' && /^Key[A-Z]$/.test(code) && ++strayLetters === 4)
    say('No number pad? Pick QWE / ASD / ZXC (or another layout) from the Keys list.', false, 9000);
  if (slot) {
    e.preventDefault();
    if (e.repeat) return;      // holding a key doesn't machine-gun the pad (that's what Repeat is for)
    hit(slot, 1, 'key');
    press('k' + code, slot, 1);
    return;
  }
  if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) { spaceHeld = true; repeatChanged(); } }
});
document.addEventListener('keyup', e => {
  if (e.code === 'Space' && spaceHeld) { e.preventDefault(); spaceHeld = false; repeatChanged(); }
  release('k' + keyCode(e.code, e.location));
});
window.addEventListener('blur', () => { held.clear(); spaceHeld = false; repeatChanged(); });
document.addEventListener('pointerdown', () => { if (ctx && ctx.state !== 'running') ctx.resume(); }, true);

// MIDI: asked for only when you turn it on
let midi = null, learnMode = false;
async function midiOn(quiet = false) {
  if (!navigator.requestMIDIAccess) { if (!quiet) say('This browser doesn\'t do MIDI. Chrome and Edge do (and Firefox with a site permission).', true, 8000); return; }
  try {
    midi = await navigator.requestMIDIAccess({ sysex: false });
    midi.onstatechange = hookMidi;
    hookMidi();
    P.midi = true;
    savePage();
  } catch (e) {
    if (!quiet) say('MIDI wasn\'t allowed. You can allow it in the browser\'s site settings (the icon left of the address).', true, 8000);
    P.midi = false; savePage();
  }
  renderMidi();
}
function hookMidi() {
  if (!midi) return;
  for (const input of midi.inputs.values()) input.onmidimessage = onMidi;
  renderMidi();
}
function onMidi(e) {
  const m = parseMidi(e.data);
  if (!m || !kit) return;
  if (m.type === 'off') { release('m' + m.note); return; }
  if (learnMode) {
    const r = assignNote(kit.pads, P.sel, m.note);
    kit.pads = r.pads;
    changed();
    say(kit.pads[P.sel - 1].name + ' is now note ' + midiLabel(m.note) + (r.swapped ? '; ' + kit.pads[r.swapped - 1].name + ' gets its old note' : '') + '. Hit the next pad on screen, or Esc.', false, 0);
    flash(P.sel); renderEditor(); renderMap();
    return;
  }
  const slot = slotForNote(kit.pads, m.note, P.alias);
  if (!slot) return;
  const vel = P.vel ? velocityGain(m.velocity) : 1;
  hit(slot, vel, 'midi');
  press('m' + m.note, slot, vel);
}
function renderMidi() {
  const names = midi ? [...midi.inputs.values()].map(i => i.name) : [];
  $('midiBtn').textContent = midi ? 'MIDI: ' + (names.length ? names.length + ' connected' : 'on') : 'MIDI';
  $('midiBtn').classList.toggle('on', !!midi && names.length > 0);
  $('midiOnBtn').textContent = midi ? 'MIDI is on' : 'Turn on MIDI';
  $('midiOnBtn').disabled = !!midi;
  $('midiLearn').disabled = !midi;
  $('midiLearn').classList.toggle('on', learnMode);
  $('midiStatus').textContent = !midi ? 'Play the pads from a MIDI pad controller, drum kit or keyboard. The browser asks first.'
    : names.length ? 'Listening to: ' + names.join(', ') + '.' : 'MIDI is on, but nothing is plugged in yet. Plug a controller in and it shows up here.';
}
function startLearn() { endMapMode(); learnMode = true; say('Learn notes: hit a pad on screen, then a pad or key on your controller. Esc when you\'re done.', false, 0); renderPads(); renderMidi(); }
function endLearn() { learnMode = false; say('', false, 1); renderPads(); renderMidi(); }

// key mapping
let mapMode = false, mapOnce = false;
function startMapMode(once = false) {
  if (remapOverwritesCustom(keyState) && !confirm('Mapping keys starts from ' + layoutName(keyState.layout) + ' and replaces your saved Custom keys. Go ahead?')) return;
  endLearn(); mapMode = true; mapOnce = once; $('mapKeysBtn').classList.add('on'); $('mapKeysBtn2').classList.add('on');
  say(once ? 'Press the key for ' + kit.pads[P.sel - 1].name + ' (Esc to cancel)' : 'Map keys: click a pad, then press its key. Esc when you\'re done.', false, 0); renderPads(); }
function endMapMode() { if (!mapMode) return; mapMode = false; $('mapKeysBtn').classList.remove('on'); $('mapKeysBtn2').classList.remove('on'); say('Keys saved', false, 2000); renderPads(); }

// ---- note repeat: hold Repeat (or Space) and a pad, and it plays in time at 1/8, 1/16...

let repeatHeld = false, repeatLatched = false, repeatTimer = 0;
const repeating = new Map();     // slot -> { vel, next }
const repeatOn = () => repeatHeld || repeatLatched || spaceHeld;
function press(id, slot, vel) {
  held.set(id, slot);
  if (repeatOn()) {
    const c = ctx, iv = 60 / P.bpm / P.repeatRate, origin = T.playing ? T.start : c.currentTime;
    let next = nextGridTime(c.currentTime + 0.002, origin, iv);
    if (next - c.currentTime < iv * 0.5) next += iv;   // just played it: the next one is a full step away
    repeating.set(slot, { vel, next });
    runClock();
  }
}
function release(id) {
  const slot = held.get(id);
  if (!slot) return;
  held.delete(id);
  if (![...held.values()].includes(slot)) repeating.delete(slot);
}
function repeatChanged() {
  $('repeatBtn').classList.toggle('on', repeatOn());
  if (!repeatOn()) repeating.clear();
  else { for (const [id, slot] of held) if (!repeating.has(slot)) repeating.set(slot, { vel: 1, next: 0 }); runClock(); }
}

// ---- the loop recorder

const T = { playing: false, recording: false, start: 0, scheduledTo: 0, take: 0 };
let events = [];                  // { slot, beat, vel, take, notBefore }
const loopBeats = () => P.bars * 4;
const spb = () => 60 / P.bpm;
let clockTimer = 0;

function runClock() { if (!clockTimer) clockTimer = setInterval(tick, 20); tick(); }
function tick() {
  if (!ctx) return;
  const now = ctx.currentTime, to = now + 0.1;
  if (T.playing) {
    const from = Math.max(T.scheduledTo, now);
    if (to > from) {
      for (const c of clicksBetween(from, to, T.start, P.bpm)) if (P.click || c.beat < 0) playClick(c.time, c.down || c.beat < 0 && c.beat === -4);
      for (const h of loopHitsBetween(events.filter(ev => ev.beat < loopBeats()), from, to, T.start, P.bpm, loopBeats())) hitAt(h.ev.slot, h.ev.vel, h.time, false);
      T.scheduledTo = to;
    }
  }
  if (repeatOn()) for (const [slot, r] of repeating) {
    const iv = 60 / P.bpm / P.repeatRate;
    if (!r.next) r.next = nextGridTime(now + 0.01, T.playing ? T.start : now + 0.01, iv);
    while (r.next < to) { if (r.next >= now - 0.005) hitAt(slot, r.vel, Math.max(r.next, now), true); r.next += iv; }
  }
  if (!T.playing && !(repeatOn() && repeating.size)) { clearInterval(clockTimer); clockTimer = 0; }
}

function playClick(when, down) {
  if (!clickBufs) { const s = makeSounds('classic', ctx.sampleRate); clickBufs = { down: toBuffer(s.accent), beat: toBuffer(s.beat) }; }
  const src = ctx.createBufferSource(), g = ctx.createGain();
  src.buffer = down ? clickBufs.down : clickBufs.beat;
  g.gain.value = down ? 0.32 : 0.22;
  src.connect(g).connect(master);
  src.start(when);
}

/** Into the loop: when it's recording, at the beat you played it (your device's sound delay taken off, since you
 *  play to the click you hear), snapped to the grid when Quantize is on */
function record(slot, vel, when, exact) {
  if (!T.playing || !T.recording) return;
  const t = exact ? when : when - (ctx.baseLatency || 0) - (ctx.outputLatency || 0), L = loopBeats();
  if (t < T.start) { if (T.start - t > 0.25 * spb()) return; }    // a hit in the count-in, just early for beat 1, counts as beat 1
  let beat = t < T.start ? 0 : beatInLoop(t, T.start, P.bpm, L);
  if (P.quantize) beat = quantizeBeat(beat, P.quantize, L);
  // it just played live: don't play it again on this pass when quantize moved it a little later
  events.push({ slot, beat, vel, take: T.take, notBefore: exact ? 0 : when + L * spb() / 2 });
  loopButtons();
  drawLane();
}

function startTransport(rec) {
  const c = wake(), now = c.currentTime;
  T.start = now + 0.08 + (rec ? 4 * spb() : 0);
  T.scheduledTo = now;
  T.playing = true;
  T.recording = rec;
  if (rec) T.take++;
  runClock();
  loopButtons();
  requestAnimationFrame(animateLane);
}
function stopTransport() {
  T.playing = false; T.recording = false;
  loopButtons();
  drawLane();
}
function loopButtons() {
  $('playBtn').classList.toggle('on', T.playing);
  $('playBtn').lastChild.textContent = T.playing ? 'Stop' : 'Play';
  $('recBtn').classList.toggle('on', T.recording);
  $('undoBtn').disabled = !events.length;
  $('clearBtn').disabled = !events.length;
  $('exportLoopBtn').disabled = !events.length;
  loopInfo();
}
function loopInfo() {
  const n = events.length;
  let pos = '';
  if (T.playing && ctx) {
    const b = (ctx.currentTime - T.start) / spb();
    pos = b < 0 ? 'count-in ' + Math.ceil(-b) : 'bar ' + (Math.floor((b % loopBeats()) / 4) + 1) + '.' + (Math.floor(b % 4) + 1);
  }
  $('loopInfo').textContent = (pos ? pos + ' · ' : '') + n + ' hit' + (n === 1 ? '' : 's');
}

function setBpm(v) {
  const b = Math.min(240, Math.max(40, Math.round(+v || 90)));
  if (T.playing && ctx) {   // keep the place in the loop: the same beat, now at the new tempo
    const beat = (ctx.currentTime - T.start) / spb();
    P.bpm = b;
    T.start = ctx.currentTime - beat * spb();
  } else P.bpm = b;
  $('bpm').value = b;
  savePage();
}
function setBars(n) {
  const old = loopBeats();
  P.bars = n;
  const L = loopBeats();
  // a longer loop repeats what you have; a shorter one keeps only what fits
  if (L > old) { const copies = []; for (let k = 1; k < L / old; k++) for (const ev of events) if (ev.beat < old) copies.push({ ...ev, beat: ev.beat + k * old, notBefore: 0 }); events.push(...copies); }
  else events = events.filter(ev => ev.beat < L);
  savePage(); loopButtons(); drawLane();
}

// the lane: every hit in the loop, one row per pad (kick at the bottom), and where it's playing
const laneRow = slot => [9, 8, 7, 6, 5, 4, 3, 2, 1].indexOf(slot);
function drawLane() {
  const cv = $('lane'), dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
  if (!w || !h) return;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const g = cv.getContext('2d'), L = loopBeats(), rh = h / SLOTS;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  for (let b = 0; b <= L; b++) { g.fillStyle = b % 4 === 0 ? 'rgb(242 239 232 / 0.22)' : 'rgb(242 239 232 / 0.07)'; g.fillRect(Math.round(b / L * w), 0, 1, h); }
  for (const ev of events) {
    if (ev.beat >= L) continue;
    g.fillStyle = ev.take === T.take && T.recording ? '#ff6c40' : '#ff3b00';
    g.globalAlpha = 0.45 + 0.55 * ev.vel;
    g.fillRect(ev.beat / L * w, laneRow(ev.slot) * rh + 0.5, Math.max(2, w / L / 8), Math.max(1, rh - 1));
  }
  g.globalAlpha = 1;
  if (T.playing && ctx) {
    const b = (ctx.currentTime - (ctx.outputLatency || 0) - T.start) / spb();
    if (b >= 0) { g.fillStyle = '#f2efe8'; g.fillRect((b % L) / L * w, 0, 2, h); }
  }
  if (!events.length && !T.playing) { g.fillStyle = 'rgb(242 239 232 / 0.4)'; g.font = '12px "DM Sans", sans-serif'; g.fillText('Press Rec to record a loop (one bar of count-in first)', 10, h / 2 + 4); }
}
function animateLane() { drawLane(); loopInfo(); if (T.playing) requestAnimationFrame(animateLane); }

/** The loop as a WAV that loops cleanly: rendered offline, and the tails that ring past the end mixed back into the start */
async function exportLoop() {
  const sr = 48000, L = loopBeats() * spb(), tail = 3, n = Math.ceil((L + tail) * sr), len = Math.round(L * sr);
  const oc = new OfflineAudioContext(2, n, sr), g = oc.createGain();
  g.gain.value = 0.85;
  g.connect(oc.destination);
  const p = new Player(oc, g);
  for (const ev of [...events].filter(e => e.beat < loopBeats()).sort((a, b) => a.beat - b.beat)) if (bufs[ev.slot]) p.play(ev.slot, kit.pads[ev.slot - 1], bufs[ev.slot], ev.vel, ev.beat * spb(), kit.pads);
  const r = await oc.startRendering(), chans = [];
  for (let c = 0; c < 2; c++) {
    const d = r.getChannelData(c), out = d.slice(0, len);
    for (let i = len; i < n; i++) out[(i - len) % len] += d[i];
    for (let i = 0; i < len; i++) out[i] = Math.max(-1, Math.min(1, out[i]));
    chans.push(out);
  }
  download(new Blob([encodeWav(chans, sr)], { type: 'audio/wav' }), safeFileName(kit.name + ' loop ' + P.bpm + ' bpm') + '.wav');
}

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}

// ---- the Pad tab: everything about the selected pad

const pad = () => kit.pads[P.sel - 1];
function renderEditor() {
  if (!kit) return;
  const p = pad(), b = bufs[p.slot], dur = b ? b.duration : 1;
  $('pdNum').textContent = 'Pad ' + p.slot;
  if (document.activeElement !== $('pdName')) $('pdName').value = p.name;
  const s = p.sample;
  $('pdSound').textContent = !s ? 'No sound yet: load a file, drop one on the pad, or pick a built-in sound.'
    : s.builtin ? 'Built-in sound: ' + (BUILTIN.find(x => x.id === s.builtin)?.name || s.builtin)
    : s.id ? (sampleById(s.id) ? 'Your sample: ' + sampleById(s.id).name + (b ? ' (' + fmtS(b.duration) + ')' : '') : 'Its sound isn\'t in your library any more.')
    : 'From the ' + (KITS.find(k => k.id === kit.preset)?.name || 'built-in') + ' kit' + (b ? ' (' + fmtS(b.duration) + ')' : '');
  $('pdBuiltin').value = s?.builtin || '';
  const ms = Math.max(1, Math.round(dur * 1000));
  for (const id of ['pdStart', 'pdEnd']) $(id).max = ms;
  $('pdVolume').value = Math.round(p.volume * 100);
  $('pdPitch').value = p.pitch;
  $('pdPan').value = Math.round(p.pan * 100);
  $('pdStart').value = Math.round(p.start * 1000);
  $('pdEnd').value = p.end === null ? ms : Math.round(p.end * 1000);
  const plan = hitPlan(p, dur);
  $('pdFade').max = Math.max(1, Math.round(plan.length * 1000));
  $('pdFade').value = Math.round(p.fade * 1000);
  $('vVolume').textContent = Math.round(p.volume * 100) + '%' + (p.volume > 0 ? ' (' + (p.volume === 1 ? '0' : (20 * Math.log10(p.volume)).toFixed(1)) + ' dB)' : '');
  $('vPitch').textContent = (p.pitch > 0 ? '+' : '') + p.pitch + ' st';
  $('vPan').textContent = Math.abs(p.pan) < 0.005 ? 'center' : (p.pan < 0 ? 'L ' : 'R ') + Math.round(Math.abs(p.pan) * 100);
  $('vStart').textContent = fmtS(p.start);
  $('vEnd').textContent = p.end === null ? 'to the end (' + fmtS(Math.max(0, dur - p.start)) + ')' : fmtS(p.end - p.start);
  $('vFade').textContent = p.fade ? fmtS(p.fade) : 'none';
  $('pdChoke').value = p.choke;
  for (const btn of $('pdMode').children) btn.classList.toggle('on', btn.dataset.v === p.mode);
  $('pdMute').checked = p.mute;
  $('pdKey').textContent = keys[p.slot] ? keyLabel(keys[p.slot]) : 'none';
  $('pdMidi').textContent = midiLabel(p.midi);
  $('trimDb').value = P.trimDb;
  drawWave();
}

function drawWave() {
  const cv = $('wave'), dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
  if (!w || !h) return;
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  const g = cv.getContext('2d'), p = pad(), b = bufs[p.slot];
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  if (!b) { g.fillStyle = 'rgb(242 239 232 / 0.35)'; g.font = '12px "DM Sans", sans-serif'; g.fillText(p.sample ? 'Loading...' : 'No sound on this pad', 10, h / 2 + 4); return; }
  const chans = Array.from({ length: b.numberOfChannels }, (_, c) => b.getChannelData(c)), n = chans[0].length, dur = b.duration;
  const plan = hitPlan(p, dur), x0 = plan.offset / dur * w, x1 = (plan.offset + plan.duration) / dur * w;
  g.fillStyle = 'rgb(255 59 0 / 0.08)';
  g.fillRect(x0, 0, x1 - x0, h);
  for (let x = 0; x < w; x++) {
    const a = Math.floor(x / w * n), e = Math.max(a + 1, Math.floor((x + 1) / w * n));
    let pk = 0;
    for (const c of chans) for (let i = a; i < e; i += Math.max(1, (e - a) >> 6)) pk = Math.max(pk, Math.abs(c[i]));
    const y = Math.min(1, pk) * (h / 2 - 2);
    g.fillStyle = x >= x0 && x <= x1 ? '#ff6c40' : 'rgb(242 239 232 / 0.25)';
    g.fillRect(x, h / 2 - y, 1, Math.max(1, 2 * y));
  }
  g.fillStyle = '#f2efe8';
  g.fillRect(x0, 0, 2, h); g.fillRect(x1 - 2, 0, 2, h);
  if (plan.fade > 0) {   // where the fade starts, down to the end
    const xf = (plan.offset + plan.fadeAt * plan.rate) / dur * w;
    g.strokeStyle = '#22d3ee'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(xf, 2); g.lineTo(x1, h - 2); g.stroke();
  }
}

function editorEvents() {
  const sel = $('pdBuiltin');
  sel.innerHTML = '<option value="">Built-in sounds...</option>';
  for (const k of [...KITS.filter(k => k.pads), { id: 'extra', name: 'More' }]) {
    const og = document.createElement('optgroup');
    og.label = k.name;
    for (const b of BUILTIN.filter(b => b.kit === k.id)) og.append(new Option(b.name.replace(/^[^:]+: /, ''), b.id));
    sel.append(og);
  }
  for (let i = 1; i <= 8; i++) $('pdChoke').append(new Option('Group ' + i, i));
  $('pdName').addEventListener('input', () => { pad().name = $('pdName').value.slice(0, 24) || 'Pad ' + P.sel; changed(); });
  const slider = (id, f) => $(id).addEventListener('input', () => { f(+$(id).value); changed('quiet'); renderEditor(); });
  slider('pdVolume', v => pad().volume = v / 100);
  slider('pdPitch', v => pad().pitch = v);
  slider('pdPan', v => pad().pan = v / 100);
  slider('pdFade', v => pad().fade = v / 1000);
  slider('pdStart', v => { const p = pad(); p.start = v / 1000; if (p.end !== null && p.end <= p.start + 0.001) p.end = null; });
  slider('pdEnd', v => { const p = pad(), max = +$('pdEnd').max; p.end = v >= max ? null : Math.max(p.start + 0.001, v / 1000); });
  // hear what you're changing: a slider let go plays the pad
  for (const id of ['pdVolume', 'pdPitch', 'pdPan', 'pdFade', 'pdStart', 'pdEnd']) $(id).addEventListener('change', () => hit(P.sel, 1, 'edit'));
  $('pdChoke').addEventListener('change', () => { pad().choke = +$('pdChoke').value; changed(); });
  $('pdMode').addEventListener('click', e => { const v = e.target.dataset?.v; if (v) { pad().mode = v; changed(); renderEditor(); } });
  $('pdMute').addEventListener('change', () => { pad().mute = $('pdMute').checked; changed(); });
  $('pdAutoTrim').addEventListener('click', () => {
    const b = bufs[P.sel];
    if (!b) return;
    const chans = Array.from({ length: b.numberOfChannels }, (_, c) => b.getChannelData(c)), t = autoTrimStart(chans, b.sampleRate, P.trimDb);
    pad().start = t;
    if (pad().end !== null && pad().end <= t) pad().end = null;
    changed(); renderEditor(); hit(P.sel, 1, 'edit');
    say(t > 0 ? 'Cut ' + fmtS(t) + ' of silence from the front' : 'This sound already starts right away', false, 3000);
  });
  $('trimDb').addEventListener('change', () => { P.trimDb = +$('trimDb').value; savePage(); });
  sel.addEventListener('change', () => {
    if (!sel.value) return;
    const p = pad(), id = sel.value, name = BUILTIN.find(b => b.id === id).name.replace(/^[^:]+: /, '');
    Object.assign(p, { sample: { builtin: id }, name, start: 0, end: null, fade: 0 });
    changed(); reloadPad(p.slot, true);
  });
  $('pdFile').addEventListener('click', () => $('pdFileInput').click());
  $('pdFileInput').addEventListener('change', async () => {
    const f = $('pdFileInput').files[0];
    $('pdFileInput').value = '';
    if (f) await fileToPad(f, P.sel);
  });
  $('pdClear').addEventListener('click', () => { pad().sample = null; changed(); reloadPad(P.sel); });
  $('pdKeyBtn').addEventListener('click', () => startMapMode(true));
  $('pdMidiBtn').addEventListener('click', async () => { if (!midi) await midiOn(); if (midi) startLearn(); });
}

async function reloadPad(slot, play = false) {
  try { bufs[slot] = await bufferFor(kit.pads[slot - 1].sample); }
  catch (e) { bufs[slot] = null; say(kit.pads[slot - 1].name + ': ' + e.message, true, 8000); }
  renderPads();
  if (slot === P.sel) renderEditor();
  if (play && bufs[slot]) hit(slot, 1, 'edit');
}

// ---- the library

let libTag = 'all';
const TAGS = ['all', 'kick', 'snare', 'hat', 'clap', 'tom', 'cymbal', 'perc', 'other'];
async function loadLibrary() {
  try { samples = await db.getAll('samples'); } catch (e) { samples = []; say(e.message, true, 10000); }
  renderLibrary();
}

/** A sound file into the library (the same file twice is kept once). Returns what it is */
async function addSample(name, bytes, type = '') {
  if (bytes.byteLength > 50 * 1024 * 1024) throw new Error(name + ' is over 50 MB. Drum sounds are usually much shorter: trim it first.');
  const hash = await crc32(new Blob([bytes]));
  const same = samples.find(s => s.hash === hash && s.size === bytes.byteLength);
  if (same) return same;
  let b;
  try { b = await decode(bytes.slice(0)); }
  catch { throw new Error(name + ' isn\'t a sound this browser can read. Try WAV, MP3, FLAC or OGG.'); }
  const chans = Array.from({ length: b.numberOfChannels }, (_, c) => b.getChannelData(c));
  const meta = { id: db.newId(), name: String(name).split('/').pop().slice(0, 120), size: bytes.byteLength, type, duration: b.duration, sampleRate: b.sampleRate,
                 channels: b.numberOfChannels, tags: guessTags(name), trim: autoTrimStart(chans, b.sampleRate, P.trimDb), hash, added: Date.now() };
  await db.putSample(meta, bytes);
  samples.push(meta);
  decoded.set('id:' + meta.id, b);
  if (samples.length === 1) db.keepFiles();
  return meta;
}

async function addFiles(files) {
  let ok = 0;
  const bad = [];
  for (const f of files) {
    if (!isAudioName(f.name) && !/^audio\//.test(f.type || '')) { bad.push(f.name + ' isn\'t a sound file'); continue; }
    try { await addSample(f.name, await f.arrayBuffer(), f.type); ok++; } catch (e) { bad.push(e.message); }
  }
  renderLibrary();
  if (ok) toast('Added ' + ok + ' sound' + (ok === 1 ? '' : 's') + ' to your library');
  if (bad.length) say(bad.slice(0, 2).join(' ') + (bad.length > 2 ? ' (' + (bad.length - 2) + ' more)' : ''), true, 9000);
  return ok;
}

function putOnPad(slot, meta) {
  const p = kit.pads[slot - 1];
  Object.assign(p, { sample: { id: meta.id }, name: nameFromFile(meta.name), start: meta.trim || 0, end: null, fade: 0 });
  changed();
  reloadPad(slot, true);
}

async function fileToPad(file, slot) {
  try { const meta = await addSample(file.name, await file.arrayBuffer(), file.type); putOnPad(slot, meta); renderLibrary(); selectPad(slot); }
  catch (e) { say(e.message, true, 9000); }
}

function renderLibrary() {
  const q = $('libSearch').value.trim().toLowerCase();
  $('libTags').innerHTML = '';
  for (const t of TAGS) {
    const n = t === 'all' ? samples.length : samples.filter(s => t === 'other' ? !s.tags.length : s.tags.includes(t)).length;
    if (t !== 'all' && !n) continue;
    const b = document.createElement('button');
    b.textContent = (t === 'all' ? 'All' : t === 'perc' ? 'Percussion' : t[0].toUpperCase() + t.slice(1)) + ' ' + n;
    b.classList.toggle('on', libTag === t);
    b.onclick = () => { libTag = t; renderLibrary(); };
    $('libTags').append(b);
  }
  const list = $('libList');
  list.innerHTML = '';
  const shown = samples.filter(s => (!q || s.name.toLowerCase().includes(q)) && (libTag === 'all' || (libTag === 'other' ? !s.tags.length : s.tags.includes(libTag))))
    .sort((a, b) => b.added - a.added);
  for (const s of shown.slice(0, 300)) {
    const li = document.createElement('li');
    li.className = 'item';
    li.draggable = true;
    li.innerHTML = '<div class="what"><b></b><small></small></div><button class="mini" title="Hear it">Play</button><button class="mini" title="Put it on the selected pad">Use</button><button class="mini" title="Delete from the library" aria-label="Delete">&times;</button>';
    li.querySelector('b').textContent = s.name;
    li.querySelector('small').textContent = fmtS(s.duration) + (s.channels > 1 ? ' stereo' : '') + (s.tags.length ? ' · ' + s.tags.join(', ') : '') + (s.trim > 0.0005 ? ' · trimmed ' + fmtS(s.trim) : '');
    const [play, use, del] = li.querySelectorAll('button');
    play.onclick = () => preview(s);
    use.onclick = () => putOnPad(P.sel, s);
    del.onclick = () => deleteSample(s);
    li.addEventListener('dragstart', e => { e.dataTransfer.setData('application/x-beatpad-sample', s.id); e.dataTransfer.effectAllowed = 'copy'; });
    list.append(li);
  }
  $('libInfo').textContent = !samples.length ? 'Nothing here yet. Bring in your own kicks, snares and anything else.' : shown.length > 300 ? 'Showing 300 of ' + shown.length + '. Search to find the rest.' : '';
  db.usage().then(u => { if (u && samples.length) $('libInfo').textContent += (($('libInfo').textContent ? ' ' : '') + 'Using ' + (u.used / 1048576).toFixed(1) + ' MB on this device.'); });
}

async function preview(s) {
  wake();
  try {
    const b = await bufferFor({ id: s.id });
    if (b) player.play(0, { volume: 1, pitch: 0, start: s.trim || 0, end: null, fade: 0, pan: 0, mute: false, mode: 'retrigger', choke: 0 }, b, 1, ctx.currentTime, [{ slot: 0, mode: 'retrigger', choke: 0 }]);
  } catch (e) { say(e.message, true); }
}

async function deleteSample(s) {
  const all = [...userKits.filter(k => k.id !== kit.id), ...(kit.id ? [snapshot()] : [])];
  const using = all.filter(k => k.pads.some(p => p.sample?.id === s.id)).map(k => k.name);
  if (using.length && !confirm('"' + s.name + '" is on a pad in ' + using.join(', ') + '. Delete it anyway? Those pads go quiet.')) return;
  await db.removeSample(s.id);
  samples = samples.filter(x => x.id !== s.id);
  decoded.delete('id:' + s.id);
  for (const p of kit.pads) if (p.sample?.id === s.id) { bufs[p.slot] = null; }
  renderLibrary(); renderPads(); renderEditor();
}

// ---- kits: built-in, yours, export and import

function renderKitPick() {
  const sel = $('kitSelect');
  sel.innerHTML = '';
  const a = document.createElement('optgroup'); a.label = 'Built in';
  for (const k of KITS) a.append(new Option(k.name, 'p:' + k.id));
  sel.append(a);
  if (userKits.length) {
    const b = document.createElement('optgroup'); b.label = 'Yours';
    for (const k of [...userKits].sort((x, y) => x.name.localeCompare(y.name))) b.append(new Option(k.name, 'k:' + k.id));
    sel.append(b);
  }
  sel.value = kit?.id ? 'k:' + kit.id : 'p:' + (kit?.preset || 'encore');
}

function renderKits() {
  if (!kit) return;
  const pre = $('presets');
  pre.innerHTML = '';
  for (const k of KITS) {
    const b = document.createElement('button');
    b.innerHTML = '<b></b><small></small>';
    b.querySelector('b').textContent = k.name;
    b.querySelector('small').textContent = k.about;
    b.classList.toggle('on', kit.preset === k.id);
    b.onclick = () => loadPreset(k.id);
    pre.append(b);
  }
  const list = $('kitList');
  list.innerHTML = '';
  for (const k of [...userKits].sort((x, y) => (y.updated || 0) - (x.updated || 0))) {
    const li = document.createElement('li');
    li.className = 'item' + (k.id === kit.id ? ' on' : '');
    li.innerHTML = '<div class="what"><b></b><small></small></div><button class="mini">Play it</button>';
    li.querySelector('b').textContent = k.name;
    li.querySelector('small').textContent = k.pads.filter(p => p.sample).length + ' pads' + (k.author ? ' · by ' + k.author : '') + (k.updated ? ' · ' + new Date(k.updated).toLocaleDateString() : '');
    li.querySelector('button').onclick = () => loadUserKit(k.id);
    li.querySelector('button').disabled = k.id === kit.id;
    list.append(li);
  }
  if (!userKits.length) list.innerHTML = '<li class="tip">None yet. Change anything in a built-in kit, or import one, and it shows up here.</li>';
  if (document.activeElement !== $('kitName')) $('kitName').value = kit.name;
  if (document.activeElement !== $('kitAuthor')) $('kitAuthor').value = kit.author || '';
  $('kitDel').disabled = !kit.id;
}

async function deleteKit() {
  if (!kit.id || !confirm('Delete the kit "' + kit.name + '"? Its sounds stay in your library.')) return;
  await db.remove('kits', kit.id);
  userKits = userKits.filter(k => k.id !== kit.id);
  await loadPreset('encore');
}
async function duplicateKit() {
  const copy = { ...snapshot(), id: db.newId(), name: uniqueName(kit.name.slice(0, 19) + ' copy'), updated: Date.now() };
  userKits.push(copy);
  await db.put('kits', copy);
  await loadUserKit(copy.id);
  toast('Made a copy: "' + copy.name + '"');
}

/** The kit as a .beatpad file: kit.json and the sounds (yours as they were; built-in ones rendered to WAV) */
async function exportKit() {
  const entries = [], files = {}, used = new Set();
  for (const p of kit.pads) {
    const s = p.sample;
    if (!s) continue;
    let bytes, ext;
    try {
      if (s.builtin) { bytes = encodeWav([renderSound(s.builtin, 48000)], 48000); ext = 'wav'; }
      else if (s.id) { bytes = await db.sampleBytes(s.id); ext = (sampleById(s.id)?.name.match(/\.([a-z0-9]{1,5})$/i)?.[1] || 'wav').toLowerCase(); }
      else { bytes = await urlBytes(s.url); ext = s.url.split('.').pop().toLowerCase(); }
    } catch { bytes = null; }
    if (!bytes) continue;
    let name = String(p.slot).padStart(2, '0') + '-' + safeFileName(p.name.toLowerCase().replace(/\s+/g, '-')) + '.' + ext;
    while (used.has(name)) name = name.replace(/(\.[^.]+)$/, '_$1');
    used.add(name);
    files[p.slot] = name;
    entries.push({ name, blob: new Blob([bytes]) });
  }
  const forFile = { ...kit, bpm: P.bpm, pads: kit.pads.map(p => ({ ...p, key: keys[p.slot] || null })) };
  entries.unshift({ name: 'kit.json', blob: new Blob([buildKitJson(forFile, files)], { type: 'application/json' }) });
  if (kit.credit) entries.push({ name: 'CREDITS.txt', blob: new Blob([kit.credit + '\n']) });
  download(await zip(entries), safeFileName(kit.name) + '.beatpad');
  toast('Exported "' + kit.name + '" (' + Object.keys(files).length + ' sounds)');
}

/**
 * A kit from a zip's entries or a folder's files ([{ name: path, data }]): with a kit.json, as it says; without one,
 * the sound files go on pads by their names. It becomes one of your kits, and its sounds go into your library.
 */
async function importEntries(entries, fallbackName) {
  const names = entries.map(e => e.name), warn = [], kj = findKitJson(names);
  let k, added = 0, kitKeys = null;
  if (kj) {
    const parsed = parseKitJson(new TextDecoder().decode(entries[kj.index].data));
    warn.push(...parsed.warnings);
    k = parsed.kit;
    kitKeys = Object.fromEntries(k.pads.map(p => [p.slot, p.key]));
    for (const p of k.pads) {
      const file = parsed.files[p.slot];
      p.sample = null;
      if (!file) continue;
      const i = matchFile(names, kj.dir, file);
      if (i < 0) { warn.push('Pad ' + p.slot + ': "' + file + '" isn\'t in the kit.'); continue; }
      try { p.sample = { id: (await addSample(names[i], entries[i].data.buffer.slice(entries[i].data.byteOffset, entries[i].data.byteOffset + entries[i].data.byteLength))).id }; added++; }
      catch (e) { warn.push('Pad ' + p.slot + ': ' + e.message); }
    }
  } else {
    const audioIdx = names.map((n, i) => i).filter(i => isAudioName(names[i]));
    if (!audioIdx.length) throw new Error('There\'s no kit.json and no sound files in there.');
    const { slots, leftOver } = assignFiles(audioIdx.map(i => names[i]));
    k = cleanKit({ name: fallbackName, pads: [] });
    for (const p of k.pads) p.sample = null;
    const metas = {};
    for (const [slot, j] of Object.entries(slots)) {
      const i = audioIdx[j];
      try { metas[slot] = await addSample(names[i], entries[i].data.buffer.slice(entries[i].data.byteOffset, entries[i].data.byteOffset + entries[i].data.byteLength)); }
      catch (e) { warn.push(e.message); }
    }
    for (const [slot, m] of Object.entries(metas)) {
      const p = k.pads[slot - 1];
      Object.assign(p, { sample: { id: m.id }, name: nameFromFile(m.name), start: m.trim || 0 });
      p.midi = gmNoteFor(p.name, p.slot);
      if (m.tags.includes('hat')) p.choke = 1;                   // hats choke each other, like a real hi-hat
      if (m.tags.includes('cymbal')) p.mode = 'layer';
      added++;
    }
    for (const j of leftOver) { try { await addSample(names[audioIdx[j]], entries[audioIdx[j]].data.buffer.slice(0)); } catch {} }
    if (leftOver.length) warn.push(leftOver.length + ' more sound' + (leftOver.length === 1 ? '' : 's') + ' didn\'t fit (a kit has 9 pads); ' + (leftOver.length === 1 ? 'it\'s' : 'they\'re') + ' in your library.');
  }
  if (!added) throw new Error('None of its sounds could be read.' + (warn.length ? ' ' + warn[0] : ''));
  const rec = { ...k, id: db.newId(), name: uniqueName(k.name), credit: '', updated: Date.now() };
  userKits.push(rec);
  await db.put('kits', rec);
  await loadUserKit(rec.id);
  renderLibrary();
  // your keys stay yours; offer the kit's when it brought different ones
  const differs = kitKeys && Object.entries(kitKeys).some(([s, c]) => c && c !== keys[s]);   // (Custom keeps them; your layout stays until you choose)
  const rep = $('kitReport');
  rep.innerHTML = '';
  const head = document.createElement('div');
  head.textContent = 'Imported "' + rec.name + '": ' + added + ' pad' + (added === 1 ? '' : 's') + ' with sound.';
  rep.append(head);
  if (warn.length) { const ul = document.createElement('ul'); for (const w of warn.slice(0, 8)) { const li = document.createElement('li'); li.textContent = w; ul.append(li); } rep.append(ul); }
  if (differs) {
    const b = document.createElement('button');
    b.className = 'small'; b.textContent = 'Use this kit\'s keys';
    b.onclick = () => {
      if (keyState.custom && !confirm('Use the kit\'s keys? They replace your saved Custom keys.')) return;
      keyState = { layout: 'custom', custom: { ...kitKeys } }; saveKeys(); renderPads(); renderMap(); renderEditor(); b.remove(); toast('Using the kit\'s keys (as Custom)');
    };
    rep.append(b);
  }
  toast('Imported "' + rec.name + '"');
}

async function importFile(f) {
  try {
    const data = new Uint8Array(await f.arrayBuffer());
    const entries = await readZip(data);
    await importEntries(entries, nameFromFile(f.name.replace(/\.(beatpad|zip)$/i, '')));
  } catch (e) { showImportError(e); }
}
async function importFolder(files) {
  try {
    const list = await Promise.all(files.map(async f => ({ name: f.webkitRelativePath || f.relPath || f.name, data: new Uint8Array(await f.arrayBuffer()) })));
    const top = (list[0]?.name || 'Kit').split('/')[0];
    await importEntries(list, nameFromFile(top.includes('.') ? 'Imported kit' : top));
  } catch (e) { showImportError(e); }
}
function showImportError(e) {
  $('kitReport').innerHTML = '';
  const d = document.createElement('div');
  d.className = 'err';
  d.textContent = 'That kit didn\'t import: ' + e.message;
  $('kitReport').append(d);
  showTab('kits');
  say('That kit didn\'t import: ' + e.message, true, 9000);
}

// ---- drag and drop: onto a pad (that pad), onto the kit box (a kit), anywhere else (the library, or a kit file)

const dragKind = e => { const t = [...(e.dataTransfer?.types || [])]; return t.includes('Files') ? 'files' : t.includes('application/x-beatpad-sample') ? 'sample' : ''; };
function hidePageDrop() { $('pageDrop').classList.add('hidden'); }

async function dropOnPad(e, slot) {
  const id = e.dataTransfer.getData('application/x-beatpad-sample');
  if (id) { const s = sampleById(id); if (s) { putOnPad(slot, s); selectPad(slot); } return; }
  const files = [...e.dataTransfer.files];
  if (!files.length) return;
  if (files.length === 1 && /\.(beatpad|zip)$/i.test(files[0].name)) { importFile(files[0]); return; }
  const audioFiles = files.filter(f => isAudioName(f.name) || /^audio\//.test(f.type));
  if (!audioFiles.length) { say(files[0].name + ' isn\'t a sound file.', true); return; }
  await fileToPad(audioFiles[0], slot);
  if (audioFiles.length > 1) await addFiles(audioFiles.slice(1));
}

/** Files from a drop, folders opened up (with their paths), or null when there's no folder in it */
async function droppedFolder(dt) {
  const roots = [...(dt.items || [])].map(i => i.webkitGetAsEntry?.()).filter(Boolean);
  if (!roots.some(r => r.isDirectory)) return null;
  const out = [];
  const walk = (entry, path) => new Promise(res => {
    if (entry.isFile) entry.file(f => { f.relPath = path + f.name; out.push(f); res(); }, () => res());
    else {
      const reader = entry.createReader(), all = [];
      const more = () => reader.readEntries(async batch => { if (batch.length) { all.push(...batch); more(); } else { for (const c of all) await walk(c, path + entry.name + '/'); res(); } }, () => res());
      more();
    }
  });
  for (const r of roots) await walk(r, '');
  return out;
}

function dropEvents() {
  let depth = 0;
  document.addEventListener('dragenter', e => { if (dragKind(e) === 'files') { depth++; $('pageDrop').classList.remove('hidden'); } });
  document.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; hidePageDrop(); } });
  document.addEventListener('dragover', e => { if (dragKind(e)) e.preventDefault(); });
  document.addEventListener('drop', async e => {
    e.preventDefault(); depth = 0; hidePageDrop();
    if (dragKind(e) !== 'files') return;
    const dt = e.dataTransfer, files = [...dt.files], onKits = !!e.target.closest?.('#kitDrop');
    const folder = droppedFolder(dt);   // must start inside the drop event
    const kitFile = files.find(f => /\.(beatpad|zip)$/i.test(f.name));
    if (kitFile) { importFile(kitFile); return; }
    const inFolder = await folder;
    if (inFolder) { importFolder(inFolder); return; }
    if (onKits) { importFolder(files); return; }
    if (await addFiles(files)) showTab('lib');
  });
  for (const id of ['libDrop', 'kitDrop']) {
    const el = $(id);
    el.addEventListener('dragover', e => { if (dragKind(e) === 'files') { e.preventDefault(); el.classList.add('over'); } });
    el.addEventListener('dragleave', () => el.classList.remove('over'));
    el.addEventListener('drop', () => el.classList.remove('over'));
  }
}

// ---- the Keys and MIDI tab

function renderMap() {
  if (!kit) return;
  const t = $('mapTable');
  t.innerHTML = '';
  for (const slot of GRID_ORDER) {
    const p = kit.pads[slot - 1], tr = t.insertRow();
    tr.insertCell().textContent = slot;
    tr.insertCell().textContent = p.name;
    tr.insertCell().textContent = (keys[slot] ? keyLabel(keys[slot]) : 'no key') + (P.numpad && !Object.values(keys).includes('Numpad' + slot) ? ', Num ' + slot : '');
    tr.insertCell().textContent = 'MIDI ' + midiLabel(p.midi);
  }
}

// ---- tabs, and the sheet on a phone

const phone = matchMedia('(max-width: 760px)');
function showTab(name, fromPhone = false) {
  if (name === 'loop' && !phone.matches) name = 'pad';
  if (phone.matches && fromPhone && $('side').classList.contains('open') && P.tab === name) { closeSheet(); return; }
  P.tab = name;
  $('tabBar').dataset.title = { pad: 'Pad ' + P.sel, lib: 'Library', kits: 'Kits', keys: 'Keys and MIDI', loop: 'Loop', help: 'Help' }[name];
  savePage();
  for (const b of document.querySelectorAll('.tabBar [data-tab]')) b.classList.toggle('on', b.dataset.tab === name);
  for (const s of document.querySelectorAll('.tabBody > section')) s.classList.toggle('show', s.id === 'tab-' + name);
  if (phone.matches && fromPhone) $('side').classList.add('open');
  for (const b of document.querySelectorAll('.phoneTabs button')) b.classList.toggle('on', $('side').classList.contains('open') && b.dataset.tab === name);
  if (name === 'pad') requestAnimationFrame(drawWave);
  if (name === 'loop') requestAnimationFrame(drawLane);
}
function closeSheet() { $('side').classList.remove('open'); for (const b of document.querySelectorAll('.phoneTabs button')) b.classList.remove('on'); }
/** On a phone, the loop's settings live in the Loop sheet; on a bigger screen, under the pads */
function placeMore() {
  const more = $('more');
  if (phone.matches) $('tab-loop').append(more); else $('transport').after(more);
  if (!phone.matches) closeSheet();
  showTab(P.tab);
  drawLane();
}

// ---- wiring it up

function wire() {
  for (const b of document.querySelectorAll('.tabBar [data-tab]')) b.onclick = () => showTab(b.dataset.tab);
  for (const b of document.querySelectorAll('.phoneTabs button')) b.onclick = () => showTab(b.dataset.tab, true);
  $('closeSheet').onclick = closeSheet;
  phone.addEventListener('change', placeMore);
  addEventListener('resize', () => { drawLane(); drawWave(); });

  $('kitSelect').onchange = () => { const v = $('kitSelect').value; if (v.startsWith('p:')) loadPreset(v.slice(2)); else loadUserKit(v.slice(2)); $('kitSelect').blur(); };
  $('mapKeysBtn').onclick = $('mapKeysBtn2').onclick = () => mapMode ? endMapMode() : startMapMode(false);
  renderLayoutPick();
  $('numpadOn').checked = P.numpad;
  $('numpadOn').onchange = () => { P.numpad = $('numpadOn').checked; savePage(); renderMap(); };
  $('midiBtn').onclick = () => { if (!midi) midiOn(); else showTab('keys', true); };
  $('midiOnBtn').onclick = () => midiOn();
  $('midiLearn').onclick = () => learnMode ? endLearn() : startLearn();
  $('resetNotes').onclick = () => { kit.pads = resetNotes(kit.pads); changed(); renderMap(); renderEditor(); toast('MIDI notes back to General MIDI'); };
  $('velOn').checked = P.vel; $('velOn').onchange = () => { P.vel = $('velOn').checked; savePage(); };
  $('aliasOn').checked = P.alias; $('aliasOn').onchange = () => { P.alias = $('aliasOn').checked; savePage(); };

  $('playBtn').addEventListener('pointerdown', e => { e.preventDefault(); T.playing ? stopTransport() : startTransport(false); });
  $('recBtn').addEventListener('pointerdown', e => {
    e.preventDefault();
    if (!T.playing) startTransport(true);
    else { T.recording = !T.recording; if (T.recording) T.take++; loopButtons(); }
  });
  // Repeat: hold it (or Space), or set it to stay on
  const rb = $('repeatBtn');
  rb.addEventListener('pointerdown', e => { e.preventDefault(); wake(); try { rb.setPointerCapture(e.pointerId); } catch {} if (P.latch) repeatLatched = !repeatLatched; else repeatHeld = true; repeatChanged(); });
  const up = () => { if (repeatHeld) { repeatHeld = false; repeatChanged(); } };
  rb.addEventListener('pointerup', up); rb.addEventListener('pointercancel', up); rb.addEventListener('lostpointercapture', up);
  rb.addEventListener('contextmenu', e => e.preventDefault());
  $('repeatLatch').checked = P.latch;
  $('repeatLatch').onchange = () => { P.latch = $('repeatLatch').checked; repeatLatched = false; savePage(); repeatChanged(); };
  $('repeatRate').value = P.repeatRate;
  $('repeatRate').onchange = () => { P.repeatRate = +$('repeatRate').value; savePage(); };
  $('bpm').value = P.bpm;
  $('bpm').onchange = () => setBpm($('bpm').value);
  $('bpmDown').onclick = () => setBpm(P.bpm - 1);
  $('bpmUp').onclick = () => setBpm(P.bpm + 1);
  $('clickOn').checked = P.click;
  $('clickOn').onchange = () => { P.click = $('clickOn').checked; savePage(); };
  $('bars').value = P.bars;
  $('bars').onchange = () => setBars(+$('bars').value);
  for (const q of QUANTIZE) $('quantize').append(new Option(q.name, q.id));
  $('quantize').value = P.quantize;
  $('quantize').onchange = () => { P.quantize = +$('quantize').value; savePage(); };
  $('undoBtn').onclick = () => { const last = Math.max(...events.map(e => e.take)); events = events.filter(e => e.take !== last); loopButtons(); drawLane(); };
  $('clearBtn').onclick = () => { events = []; loopButtons(); drawLane(); };
  $('exportLoopBtn').onclick = () => exportLoop().catch(e => say('Saving the loop failed: ' + e.message, true));

  $('libAdd').onclick = () => $('libInput').click();
  $('libInput').onchange = async () => { const f = [...$('libInput').files]; $('libInput').value = ''; await addFiles(f); };
  $('libSearch').oninput = renderLibrary;

  $('kitName').oninput = () => { const v = $('kitName').value.trim(); if (v) { kit.name = v.slice(0, 24); changed('quiet'); renderKitPick(); } };
  $('kitAuthor').oninput = () => { kit.author = $('kitAuthor').value.slice(0, 60); changed('quiet'); };
  $('kitDup').onclick = duplicateKit;
  $('kitDel').onclick = deleteKit;
  $('kitExport').onclick = () => exportKit().catch(e => say('Export failed: ' + e.message, true));
  $('kitImport').onclick = () => $('kitInput').click();
  $('kitInput').onchange = () => { const f = $('kitInput').files[0]; $('kitInput').value = ''; if (f) importFile(f); };
  $('kitFolder').onclick = () => $('folderInput').click();
  $('folderInput').onchange = () => { const f = [...$('folderInput').files]; $('folderInput').value = ''; if (f.length) importFolder(f); };
}

async function init() {
  buildPads();
  editorEvents();
  wire();
  dropEvents();
  audio();
  try { userKits = await db.getAll('kits'); } catch (e) { userKits = []; say(e.message, true, 10000); }
  await loadLibrary();
  placeMore();
  if (P.active?.kit && userKits.some(k => k.id === P.active.kit)) await loadUserKit(P.active.kit);
  else await loadPreset(P.active?.preset || 'encore');
  loopButtons();
  drawLane();
  showLatency();
  // MIDI comes back on by itself only when the browser already allows it (it never asks without you pressing MIDI)
  if (P.midi && navigator.permissions?.query) navigator.permissions.query({ name: 'midi' }).then(s => { if (s.state === 'granted') midiOn(true); }, () => {});
  renderMidi();
}
init();
