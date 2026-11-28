// ENCORE. SFX: the page. Categories, knobs, history, pack, exports. The synth is sfx-core.js.
import * as S from './sfx-core.js';
import { zip } from './zip.js';

const $ = id => document.getElementById(id);
const STORE = 'encore-sfx-v1';
const HISTORY_MAX = 16;

// ---------------- state

let cur = { name: 'coin', category: 'coin', params: S.generate('coin', 1) };
let history = [], pack = [], locks = new Set(), group = 'tone', histAt = 0, lastFile = null, lastPlayed = null;
let seedCounter = (Date.now() % 100000) + 1;
const nextSeed = () => (seedCounter = (seedCounter * 1103515245 + 12345) % 2147483647) || 1;

(function load() {
  try {
    const d = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (!d) return;
    if (d.cur?.params) cur = { name: String(d.cur.name || 'sound').slice(0, 40), category: String(d.cur.category || 'random'), params: S.clean(d.cur.params) };
    if (Array.isArray(d.history)) history = d.history.slice(0, HISTORY_MAX).map(h => ({ name: String(h.name || 'sound').slice(0, 40), category: String(h.category || ''), params: S.clean(h.params) }));
    if (Array.isArray(d.pack)) pack = S.readPack({ sounds: d.pack }).map(s => ({ ...s, id: newId() }));
    if (Array.isArray(d.locks)) locks = new Set(d.locks.filter(k => S.PARAMS.some(p => p.key === k)));
    if (['22050', '44100', '48000'].includes(String(d.sr))) $('sr').value = String(d.sr);
    if (['8', '16', '24', '32'].includes(String(d.bits))) $('bits').value = String(d.bits);
  } catch {}
})();
function newId() { return 'x' + Math.random().toString(36).slice(2, 10); }
let saveTimer = 0;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(STORE, JSON.stringify({ cur, history, pack: pack.map(({ name, params }) => ({ name, params })), locks: [...locks], sr: +$('sr').value, bits: +$('bits').value })); } catch {}
  }, 200);
}
if (!history.length) history = [{ ...cur }];

/** A new current sound: into the history, saved, shown and played */
function setSound(s, { remember = true, playIt = true } = {}) {
  cur = { name: s.name, category: s.category, params: S.clean(s.params) };
  if (remember) { history.unshift({ ...cur }); if (history.length > HISTORY_MAX) history.pop(); histAt = 0; }
  save(); render();
  if (playIt) play();
}
function make(category) {
  const p = S.generate(category, nextSeed());
  // locked knobs keep their values
  for (const k of locks) p[k] = cur.params[k];
  setSound({ name: category === 'random' ? 'sound' : category, category, params: S.clean(p) });
}

// ---------------- audio

let ctx = null, src = null, playStart = 0, playLen = 0, raf = 0;
const audio = () => ctx ??= new AudioContext();
const exportRate = () => +$('sr').value;
const exportBits = () => +$('bits').value;
let renderCache = { key: '', x: null, sr: 0 };
/** The current sound at the export rate (cached) */
function samples() {
  const sr = exportRate(), key = JSON.stringify(cur.params) + sr;
  if (renderCache.key !== key) renderCache = { key, x: S.render(cur.params, sr), sr };
  return renderCache;
}
/** Plays the WAV you'd download (same rate, same bit depth), so what you hear is what you get */
async function play() {
  const ac = audio();
  try { await ac.resume(); } catch {}
  const { x, sr } = samples();
  const bytes = S.encodeWav(x, sr, exportBits());
  let buf;
  try { buf = await ac.decodeAudioData(bytes.buffer.slice(0)); }
  catch { buf = ac.createBuffer(1, x.length, sr); buf.copyToChannel(x, 0); }
  try { src?.stop(); } catch {}
  src = ac.createBufferSource(); src.buffer = buf; src.connect(ac.destination); src.start();
  playStart = ac.currentTime; playLen = buf.duration; lastPlayed = { samples: x.length, rate: sr, bits: exportBits() };
  cancelAnimationFrame(raf); raf = requestAnimationFrame(drawWave);
}

// ---------------- rendering

function render() {
  renderCats(); renderCur(); renderKnobs(); renderHistory(); renderPack(); renderCode(); drawWave();
}
function renderCats() {
  const box = $('cats');
  if (!box.children.length) S.CATEGORIES.forEach((c, i) => {
    const b = document.createElement('button');
    b.dataset.cat = c.id; b.title = `Make a ${c.name.toLowerCase()} sound (${(i + 1) % 10})`;
    b.innerHTML = `<span></span><small>${(i + 1) % 10}</small>`;
    b.querySelector('span').textContent = c.name;
    box.append(b);
  });
  box.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.cat === cur.category));
}
function renderCur() {
  if (document.activeElement !== $('name')) $('name').value = cur.name;
  const len = S.lengthOf(cur.params);
  $('meta').textContent = `${len.toFixed(2)} s · ${S.WAVES.find(w => w.id === cur.params.wave).name.toLowerCase()}`;
}
function fmt(d, v) {
  if (d.kind === 'bool') return v ? 'on' : 'off';
  if (d.key === 'lpf' && v >= 21999) return 'off';
  if (d.key === 'hpf' && v <= 10.5) return 'off';
  if (d.key === 'bits' && v === 16) return 'off';
  if (d.key === 'down' && v === 1) return 'off';
  const s = Math.abs(v) >= 100 ? Math.round(v) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(d.step < 0.01 ? 3 : 2);
  return s + (d.unit ? ' ' + d.unit : '');
}
const toSlider = (d, v) => d.log ? Math.round(1000 * Math.log(v / d.min) / Math.log(d.max / d.min)) : v;
const fromSlider = (d, s) => d.log ? d.min * Math.pow(d.max / d.min, s / 1000) : +s;
function renderKnobs() {
  const gb = $('groups');
  if (!gb.children.length) for (const g of S.GROUPS) { const b = document.createElement('button'); b.dataset.group = g.id; b.textContent = g.name; gb.append(b); }
  gb.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.group === group));
  const box = $('knobs');
  if (box.dataset.group !== group) {
    box.dataset.group = group; box.textContent = '';
    for (const d of S.PARAMS.filter(p => p.group === group)) {
      if (d.kind === 'wave') {
        const w = document.createElement('div'); w.className = 'waves'; w.setAttribute('role', 'group'); w.setAttribute('aria-label', 'Waveform');
        for (const x of S.WAVES) { const b = document.createElement('button'); b.dataset.wave = x.id; b.textContent = x.name; w.append(b); }
        box.append(w); continue;
      }
      const k = document.createElement('div');
      k.className = 'knob'; k.dataset.key = d.key;
      if (d.kind === 'bool') {
        k.innerHTML = `<label class="toggle"><input type="checkbox" data-bool="${d.key}"> <span></span></label>`;
        k.querySelector('span').textContent = d.name;
      } else {
        k.innerHTML = `<div class="top"><span></span><b></b><input type="checkbox" class="lock" title="Lock: Randomize and Mutate leave it alone" aria-label="Lock ${d.name}"></div>
          <input type="range" min="${d.log ? 0 : d.min}" max="${d.log ? 1000 : d.max}" step="${d.log ? 1 : d.step}" aria-label="${d.name}">`;
        k.querySelector('span').textContent = d.name;
      }
      box.append(k);
    }
  }
  box.querySelectorAll('.waves button').forEach(b => b.classList.toggle('on', b.dataset.wave === cur.params.wave));
  for (const k of box.querySelectorAll('.knob')) {
    const d = S.PARAMS.find(p => p.key === k.dataset.key), v = cur.params[d.key];
    if (d.kind === 'bool') { k.querySelector('input').checked = !!v; continue; }
    const r = k.querySelector('input[type=range]');
    if (document.activeElement !== r) r.value = toSlider(d, v);
    k.querySelector('b').textContent = fmt(d, v);
    k.querySelector('.lock').checked = locks.has(d.key);
  }
}
function renderHistory() {
  const h = $('hist'); h.textContent = '';
  history.forEach((s, i) => {
    const b = document.createElement('button');
    b.dataset.i = i; b.className = i === histAt ? 'on' : '';
    b.textContent = s.name + (history.length - i > 0 ? ' ' + (history.length - i) : '');
    b.title = 'Go back to this sound';
    h.append(b);
  });
}
function renderPack() {
  const ul = $('packList'); ul.textContent = '';
  $('packCount').textContent = pack.length ? `(${pack.length})` : '';
  if (!pack.length) { const li = document.createElement('li'); li.className = 'empty'; li.textContent = 'No sounds yet. Press "Add to pack" on one you like.'; ul.append(li); }
  for (const s of pack) {
    const li = document.createElement('li'); li.dataset.id = s.id;
    li.innerHTML = '<button class="small" data-act="play">Play</button><input type="text" maxlength="40"><button class="small" data-act="edit" title="Load it into the knobs">Edit</button><button class="small" data-act="del" title="Remove from the pack" aria-label="Remove">&times;</button>';
    li.querySelector('input').value = s.name;
    li.querySelector('input').setAttribute('aria-label', 'Name of ' + s.name);
    ul.append(li);
  }
  $('zipBtn').disabled = !pack.length; $('clearPack').disabled = !pack.length; $('savePack').disabled = !pack.length;
}
function renderCode() { if (document.activeElement !== $('code')) $('code').value = S.toCode(cur.params); }

const cv = $('wave'), g = cv.getContext('2d');
function drawWave() {
  const dpr = devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
  if (!w || !h) return;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  const { x } = samples(), mid = h / 2;
  g.strokeStyle = 'rgba(242,239,232,0.12)'; g.beginPath(); g.moveTo(0, mid + 0.5); g.lineTo(w, mid + 0.5); g.stroke();
  // a soft gradient so tall waves read as a shape, not a block; the amplitude leaves breathing room
  const amp = mid * (h > 200 ? 0.8 : 0.95), grad = g.createLinearGradient(0, mid - amp, 0, mid + amp);
  grad.addColorStop(0, '#ff7a3d'); grad.addColorStop(0.5, '#ff3b00'); grad.addColorStop(1, '#c42d00');
  g.fillStyle = grad;
  const per = x.length / w;
  for (let px = 0; px < w; px++) {
    let lo = 0, hi = 0;
    const a = Math.floor(px * per), b = Math.max(a + 1, Math.floor((px + 1) * per));
    for (let i = a; i < b && i < x.length; i++) { if (x[i] < lo) lo = x[i]; if (x[i] > hi) hi = x[i]; }
    g.fillRect(px, mid - hi * amp, 1, Math.max(1, (hi - lo) * amp));
  }
  if (ctx && src && ctx.currentTime - playStart < playLen) {
    const at = (ctx.currentTime - playStart) / playLen * w;
    g.fillStyle = '#f2efe8'; g.fillRect(at, 0, 2, h);
    raf = requestAnimationFrame(drawWave);
  }
}

// ---------------- events

$('cats').addEventListener('click', e => { const b = e.target.closest('button[data-cat]'); if (b) make(b.dataset.cat); });
$('play').addEventListener('click', play);
cv.addEventListener('click', play);
$('randomize').addEventListener('click', () => make(S.CATEGORIES.some(c => c.id === cur.category) ? cur.category : 'random'));
$('mutate').addEventListener('click', () => setSound({ ...cur, params: S.mutate(cur.params, nextSeed(), 0.08, locks) }));
$('vary').addEventListener('click', () => {
  const base = cur.name.replace(/_\d+$/, '') || 'sound';
  for (let k = 0; k < 4; k++) {
    const name = S.nextName(base, pack.map(s => s.name));
    pack.push({ id: newId(), name, params: S.mutate(cur.params, nextSeed(), 0.045, [...locks, 'wave']) });
  }
  save(); renderPack();
  status(`Added 4 variations of "${cur.name}" to the pack.`);
});
$('fav').addEventListener('click', () => {
  const base = cur.name.replace(/_\d+$/, '') || 'sound';
  const name = S.nextName(base, pack.map(s => s.name));
  pack.push({ id: newId(), name, params: S.clean(cur.params) });
  save(); renderPack();
  status(`Added "${name}" to the pack (${pack.length} sound${pack.length === 1 ? '' : 's'}).`);
});
$('name').addEventListener('change', e => { cur.name = e.target.value.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 40) || 'sound'; if (history[histAt]) history[histAt].name = cur.name; save(); render(); });
$('sr').addEventListener('change', () => { save(); drawWave(); });
$('bits').addEventListener('change', () => save());
function download(bytes, name, type) {
  const blob = bytes instanceof Blob ? bytes : new Blob([bytes], { type });
  const a = document.createElement('a'), url = URL.createObjectURL(blob);
  a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  lastFile = { name, size: blob.size };
}
function status(t) { $('status').textContent = t; }
$('download').addEventListener('click', () => {
  const { x, sr } = samples(), f = S.fileName(cur.name);
  download(S.encodeWav(x, sr, exportBits()), f, 'audio/wav');
  status(`Saved ${f} (${sr.toLocaleString('en-US')} Hz, ${exportBits() === 32 ? '32-bit float' : exportBits() + '-bit'}).`);
});
$('hist').addEventListener('click', e => {
  const b = e.target.closest('button[data-i]');
  if (!b) return;
  histAt = +b.dataset.i;
  const s = history[histAt];
  cur = { name: s.name, category: s.category, params: S.clean(s.params) };
  save(); render(); play();
});

// knobs
$('groups').addEventListener('click', e => { const b = e.target.closest('button[data-group]'); if (!b) return; group = b.dataset.group; renderKnobs(); });
let knobTimer = 0;
const knobChanged = (playIt) => {
  renderCur(); renderCode(); drawWave(); save();
  clearTimeout(knobTimer);
  if (playIt) knobTimer = setTimeout(play, 60);
};
$('knobs').addEventListener('click', e => {
  const b = e.target.closest('button[data-wave]');
  if (!b) return;
  remember(); cur.params = S.clean({ ...cur.params, wave: b.dataset.wave }); renderKnobs(); knobChanged(true);
});
$('knobs').addEventListener('input', e => {
  const r = e.target.closest('input[type=range]');
  if (!r) return;
  const d = S.PARAMS.find(p => p.key === r.closest('.knob').dataset.key);
  const next = { ...cur.params, [d.key]: fromSlider(d, +r.value) };
  // knobs that need a partner to be heard: give the partner a sensible value when it's at zero
  if (d.key === 'arp' && next.arp !== 0 && !next.arpTime) next.arpTime = 0.06;
  if (d.key === 'vibDepth' && next.vibDepth > 0 && !next.vibSpeed) next.vibSpeed = 6;
  if (d.key === 'vibSpeed' && next.vibSpeed > 0 && !next.vibDepth) next.vibDepth = 0.5;
  if (d.key === 'flangeDelay' || d.key === 'flangeSweep') { if (!next.flangeMix) next.flangeMix = 0.5; }
  const partner = Object.keys(next).filter(k => next[k] !== cur.params[k] && k !== d.key);
  cur.params = S.clean(next);
  r.closest('.knob').querySelector('b').textContent = fmt(d, cur.params[d.key]);
  if (partner.length) renderKnobs();
  knobChanged(false);
});
$('knobs').addEventListener('change', e => {
  const t = e.target, k = t.closest('.knob');
  if (!k) return;
  const key = k.dataset.key;
  if (t.classList.contains('lock')) { t.checked ? locks.add(key) : locks.delete(key); save(); return; }
  if (t.dataset.bool) { remember(); cur.params = S.clean({ ...cur.params, [key]: t.checked }); knobChanged(true); return; }
  if (t.type === 'range') { remember(); knobChanged(true); }
});
/** A knob edit becomes a new history entry (once per sound, so dragging doesn't flood the list) */
function remember() {
  const top = history[0];
  if (histAt === 0 && top && top.edited) { top.params = cur.params; return; }
  history.unshift({ name: cur.name, category: cur.category, params: cur.params, edited: true });
  if (history.length > HISTORY_MAX) history.pop();
  histAt = 0; renderHistory();
}
// keep the edited history entry in step with the knobs
const syncHistory = () => { if (history[histAt]?.edited) history[histAt].params = cur.params; };
$('knobs').addEventListener('change', syncHistory);
$('unlockAll').addEventListener('click', () => { locks.clear(); save(); renderKnobs(); });
$('resetKnobs').addEventListener('click', () => setSound({ name: 'beep', category: 'blip', params: { ...S.DEFAULTS, seed: nextSeed() } }));

// pack
$('packList').addEventListener('click', async e => {
  const b = e.target.closest('button[data-act]');
  if (!b) return;
  const li = b.closest('li'), s = pack.find(x => x.id === li.dataset.id);
  if (!s) return;
  if (b.dataset.act === 'del') { pack = pack.filter(x => x !== s); save(); renderPack(); status(`Removed "${s.name}".`); }
  else if (b.dataset.act === 'edit') setSound({ name: s.name, category: 'pack', params: s.params });
  else {
    const prev = cur; cur = { ...cur, params: s.params }; await play(); cur = prev; renderCache.key = '';
  }
});
$('packList').addEventListener('change', e => {
  const inp = e.target.closest('input'); if (!inp) return;
  const s = pack.find(x => x.id === inp.closest('li').dataset.id); if (!s) return;
  s.name = inp.value.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 40) || s.name; inp.value = s.name; save();
});
$('zipBtn').addEventListener('click', async () => {
  if (!pack.length) return;
  $('zipBtn').disabled = true; status('Making the zip...');
  try {
    const sr = exportRate(), bits = exportBits(), taken = new Set(), entries = [];
    for (const s of pack) entries.push({ name: 'sfx/' + S.fileName(s.name, taken), blob: new Blob([S.encodeWav(S.render(s.params, sr), sr, bits)], { type: 'audio/wav' }) });
    entries.push({ name: 'sfx/pack.encore-sfx.json', blob: new Blob([S.packJson(pack)], { type: 'application/json' }) });
    entries.push({ name: 'sfx/readme.txt', blob: new Blob([`Made with ENCORE. SFX (${pack.length} sounds, ${sr} Hz, ${bits === 32 ? '32-bit float' : bits + '-bit'} WAV).\r\nYou made these sounds from scratch, so they're yours to use in your games and videos.\r\nOpen pack.encore-sfx.json in ENCORE. SFX to change any of them later.\r\n`], { type: 'text/plain' }) });
    download(await zip(entries), 'sfx-pack.zip', 'application/zip');
    status(`Saved sfx-pack.zip with ${pack.length} sounds.`);
  } catch (err) { status('Couldn\'t make the zip: ' + err.message); }
  $('zipBtn').disabled = !pack.length;
});
$('clearPack').addEventListener('click', () => {
  if (!pack.length) return;
  const was = pack; pack = []; save(); renderPack();
  status(`Emptied the pack (${was.length} sounds). `);
  const u = document.createElement('button'); u.className = 'small'; u.textContent = 'Undo'; u.style.marginLeft = '6px';
  u.addEventListener('click', () => { pack = was.concat(pack); save(); renderPack(); status('Pack is back.'); }, { once: true });
  $('status').append(u);
});
$('savePack').addEventListener('click', () => { download(S.packJson(pack), 'sfx-pack.encore-sfx.json', 'application/json'); status('Saved the pack file.'); });
$('openPack').addEventListener('change', async e => {
  const f = e.target.files?.[0]; e.target.value = '';
  if (!f) return;
  try {
    const list = S.readPack(await f.text());
    if (!list.length) throw new Error('it has no sounds');
    const names = pack.map(s => s.name);
    for (const s of list) { const name = names.includes(s.name) ? S.nextName(s.name.replace(/_\d+$/, ''), names) : s.name; names.push(name); pack.push({ id: newId(), name, params: s.params }); }
    save(); renderPack();
    setSound({ name: list[0].name, category: 'pack', params: list[0].params });
    status(`Opened ${f.name}: ${list.length} sound${list.length === 1 ? '' : 's'} added to the pack.`);
  } catch (err) { status('Couldn\'t open that file: ' + err.message); }
});

// code
$('copyCode').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('code').value); status('Copied the sound code.'); }
  catch { $('code').select(); status('Select the code and copy it (Ctrl+C).'); }
});
$('useCode').addEventListener('click', () => {
  try { setSound({ name: 'pasted', category: 'pack', params: S.fromCode($('code').value) }); status('Made the sound from the code.'); }
  catch (err) { status(err.message); }
});

// tabs and keys
document.querySelector('.tabBar').addEventListener('click', e => {
  const b = e.target.closest('button[data-tab]');
  if (!b) return;
  document.querySelectorAll('.tabBar button').forEach(x => x.classList.toggle('on', x === b));
  document.querySelectorAll('.tabBody > section').forEach(s => s.classList.toggle('show', s.dataset.tab === b.dataset.tab));
});
document.addEventListener('keydown', e => {
  const t = e.target;
  if (t.closest?.('input, select, textarea') || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === ' ' || e.code === 'Space') { if (t.closest?.('button')) return; e.preventDefault(); play(); }
  else if (e.key === 'r' || e.key === 'R') $('randomize').click();
  else if (e.key === 'm' || e.key === 'M') $('mutate').click();
  else if (e.key === 'f' || e.key === 'F') $('fav').click();
  else if (/^[0-9]$/.test(e.key)) { const c = S.CATEGORIES[(+e.key + 9) % 10]; if (c) make(c.id); }
});
let resizeTimer = 0;
addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(drawWave, 100); });

// for the browser tests
window.__sfx = () => ({ name: cur.name, category: cur.category, params: { ...cur.params }, history: history.length, histAt, pack: pack.map(s => s.name),
  locks: [...locks], sr: exportRate(), bits: exportBits(), lastFile, lastPlayed, code: S.toCode(cur.params) });

render();
