// Encore Beatpad: the logic that doesn't need a browser (runs in Node too): the pads and their defaults,
// the kit file format, keys and MIDI notes, guessing which pad a file belongs on, the sample helpers
// (auto-trim, WAV writing), choke groups, the loop recorder's quantize math, and a small zip reader.

/*
 * THE KIT FORMAT (.beatpad)
 * -------------------------
 * A kit file is an ordinary .zip with a different ending, so anyone can make one by hand:
 *
 *   My Kit.beatpad
 *     kit.json
 *     01-kick.wav
 *     02-snare.wav
 *     ...
 *
 * kit.json (only "pads" is required; anything left out takes the default shown):
 *
 *   {
 *     "format": "beatpad",          // optional, but say it if you can
 *     "version": 1,                 // this is version 1
 *     "name": "My Kit",
 *     "author": "",
 *     "bpm": 90,                    // optional: the tempo the kit was made at
 *     "pads": [
 *       {
 *         "slot": 1,                // 1 to 9, laid out like a computer's numpad: 1-2-3 the bottom row, 7-8-9 the top
 *         "name": "Kick",           // what the pad says (up to 24 letters)
 *         "file": "01-kick.wav",    // the audio file, a path inside the zip next to kit.json. WAV, MP3, FLAC, OGG, M4A...
 *         "volume": 1,              // 0 to 2, 1 = as recorded (2 = twice as loud, +6 dB)
 *         "pitch": 0,               // semitones, -24 to 24 (the sample plays faster or slower)
 *         "start": 0,               // seconds into the file where the hit starts (cuts silence at the front)
 *         "end": null,              // seconds into the file where it stops, null = play to the end
 *         "fade": 0,                // seconds of fade-out before the end (0 = none)
 *         "pan": 0,                 // -1 left to 1 right
 *         "choke": 0,               // 0 = none, 1 to 8: a pad cuts off the others in its group (closed hat stops the open hat)
 *         "mode": "retrigger",      // "retrigger": hitting it again restarts it. "layer": hits ring over each other
 *         "mute": false,
 *         "key": "KeyZ",            // a keyboard key, as KeyboardEvent.code ("KeyZ", "Digit1", "Numpad1", "Space"), or just "z"
 *         "midi": 36                // a MIDI note number, 0 to 127 (General MIDI drums: 36 kick, 38 snare, 42 closed hat...)
 *       }
 *     ]
 *   }
 *
 * A pad with no "file" is empty. Pads left out are empty. Two pads can't share a slot.
 * Without a kit.json, a zip or folder of audio files works too: files go on pads by a number at the front
 * of the name ("03 hat.wav" -> pad 3), then by what the name says ("snare.wav" -> the snare pad), then in order.
 */

export const SLOTS = 9;
export const KIT_VERSION = 1;

/** The pads, slot 1 to 9: 1-2-3 the bottom row, 4-5-6 the middle, 7-8-9 the top, the way a numpad is laid out */
export const DEFAULT_PADS = [
  { slot: 1, name: 'Kick', sound: 'kick', midi: 36 },
  { slot: 2, name: 'Snare', sound: 'snare', midi: 38 },
  { slot: 3, name: 'Closed hat', sound: 'closedHat', midi: 42, choke: 1 },
  { slot: 4, name: 'Clap', sound: 'clap', midi: 39 },
  { slot: 5, name: 'Rim', sound: 'rim', midi: 37 },
  { slot: 6, name: 'Open hat', sound: 'openHat', midi: 46, choke: 1 },
  { slot: 7, name: 'High tom', sound: 'highTom', midi: 48 },
  { slot: 8, name: 'Low tom', sound: 'lowTom', midi: 45 },
  { slot: 9, name: 'Crash', sound: 'crash', midi: 49 },
];

/** Which slot sits where on screen, top row first */
export const GRID_ORDER = [7, 8, 9, 4, 5, 6, 1, 2, 3];

/** The keys every keyboard has: a 3x3 block under the left hand shaped like the pads (Q W E over A S D over Z X C).
 *  These are physical key positions (KeyboardEvent.code), so the block is in the same place on AZERTY or Dvorak. */
export const DEFAULT_KEYS = { 1: 'KeyZ', 2: 'KeyX', 3: 'KeyC', 4: 'KeyA', 5: 'KeyS', 6: 'KeyD', 7: 'KeyQ', 8: 'KeyW', 9: 'KeyE' };
/** And the numpad, when there is one: Numpad1 plays pad 1, and so on (they're laid out the same way) */
export const NUMPAD_KEYS = { 1: 'Numpad1', 2: 'Numpad2', 3: 'Numpad3', 4: 'Numpad4', 5: 'Numpad5', 6: 'Numpad6', 7: 'Numpad7', 8: 'Numpad8', 9: 'Numpad9' };

/** A fresh pad: everything at its default. Fields: see the format above, plus `sample` (what plays: { builtin: 'kick' },
 *  { id: <library id> }, { url: <a built-in kit's file> } or null) which the page keeps instead of a file name */
export function blankPad(slot) {
  const d = DEFAULT_PADS[slot - 1];
  return { slot, name: d.name, sample: null, volume: 1, pitch: 0, start: 0, end: null, fade: 0, pan: 0, choke: 0, mode: 'retrigger', mute: false,
           key: DEFAULT_KEYS[slot], midi: d.midi };
}

/** A kit from one of the built-in synthesized presets (beatpad-kit.js KITS): pads [slot, name, sound, midi, choke] */
export function presetKit(preset) {
  return cleanKit({ name: preset.name, author: '', bpm: 90, pads: preset.pads.map(([slot, name, sound, midi, choke]) =>
    ({ ...blankPad(slot), name, sample: { builtin: sound }, midi, choke: choke || 0, mode: /crash|ride|cymbal/i.test(name) ? 'layer' : 'retrigger' })) });
}

/** The General MIDI drum note a pad's name suggests (a pad called Ride gets 51), else its slot's usual note */
export function gmNoteFor(name, slot) {
  const w = nameWords(name), t = new Set(guessTags(name));
  if (w.includes('ride')) return 51;
  if (w.includes('cowbell')) return 56;
  if (w.some(x => x.startsWith('tamb'))) return 54;
  if (t.has('kick')) return 36;
  if (t.has('snare')) return 38;
  if (t.has('clap')) return 39;
  if (t.has('hat')) return t.has('open') ? 46 : 42;
  if (t.has('tom')) return t.has('low') ? 45 : 48;
  if (t.has('cymbal')) return 49;
  if (t.has('perc')) return 37;
  return DEFAULT_PADS[slot - 1].midi;
}

/** The built-in kit: every pad on its synthesized sound */
export function defaultKit(name = 'Encore kit') {
  return { name, author: '', bpm: 90, pads: DEFAULT_PADS.map(d => ({ ...blankPad(d.slot), sample: { builtin: d.sound }, choke: d.choke || 0 })) };
}

// ---- tidying values (from a file, a slider, or an old save)

const num = (v, lo, hi, d) => { const x = typeof v === 'string' && v.trim() !== '' ? +v : v; return typeof x === 'number' && isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d; };
const MAX_NAME = 24;
export const cleanName = (s, d = '') => (typeof s === 'string' ? s.replace(/[\u0000-\u001f]/g, '').trim().slice(0, MAX_NAME) : '') || d;

/** One pad, every field in range (anything odd falls back to the default) */
export function cleanPad(p, slot) {
  const b = blankPad(slot);
  if (!p || typeof p !== 'object') return b;
  const start = num(p.start, 0, 3600, 0);
  let end = p.end === null || p.end === undefined || p.end === '' ? null : num(p.end, 0, 3600, null);
  if (end !== null && end <= start) end = null;
  const s = p.sample;
  return {
    slot, name: cleanName(p.name, b.name),
    sample: !s || typeof s !== 'object' ? null : typeof s.builtin === 'string' ? { builtin: s.builtin } : typeof s.id === 'string' ? { id: s.id } : typeof s.url === 'string' ? { url: s.url } : null,
    volume: num(p.volume, 0, 2, 1), pitch: Math.round(num(p.pitch, -24, 24, 0) * 100) / 100, start, end, fade: num(p.fade, 0, 60, 0),
    pan: num(p.pan, -1, 1, 0), choke: Math.round(num(p.choke, 0, 8, 0)), mode: p.mode === 'layer' ? 'layer' : 'retrigger', mute: p.mute === true,
    key: p.key === null ? null : normalizeKey(p.key) ?? b.key, midi: p.midi === null ? null : num(p.midi, 0, 127, null) === null ? b.midi : Math.round(+p.midi),
  };
}

/** A whole kit as the page keeps it: name, author, bpm and exactly 9 pads in slot order */
export function cleanKit(k) {
  const pads = Array.from({ length: SLOTS }, (_, i) => cleanPad((k?.pads || []).find(p => p && +p.slot === i + 1), i + 1));
  return { name: cleanName(k?.name, 'My kit'), author: typeof k?.author === 'string' ? k.author.trim().slice(0, 60) : '', bpm: num(k?.bpm, 40, 240, 90), pads };
}

// ---- kit.json: writing and reading

/** kit.json for a kit. files: { slot: 'file name in the zip' } for the pads that have sound */
export function buildKitJson(kit, files) {
  const k = cleanKit(kit);
  return JSON.stringify({
    format: 'beatpad', version: KIT_VERSION, name: k.name, author: k.author, bpm: k.bpm,
    pads: k.pads.map(p => ({ slot: p.slot, name: p.name, file: files[p.slot] || null, volume: round(p.volume, 3), pitch: p.pitch,
      start: round(p.start, 5), end: p.end === null ? null : round(p.end, 5), fade: round(p.fade, 4), pan: round(p.pan, 3), choke: p.choke, mode: p.mode,
      mute: p.mute, key: p.key, midi: p.midi })),
  }, null, 2);
}
const round = (x, d) => Math.round(x * 10 ** d) / 10 ** d;

/**
 * Reads kit.json. Returns { kit, files: { slot: path }, warnings: [] } or throws an Error with a message
 * a person can act on. Unknown fields are ignored; out-of-range values are pulled into range with a warning.
 */
export function parseKitJson(text) {
  let j;
  try { j = JSON.parse(typeof text === 'string' ? text.replace(/^﻿/, '') : text); }
  catch (e) { throw new Error('kit.json isn\'t valid JSON (' + e.message.replace(/^JSON\.parse: /, '') + '). Check for a missing comma or quote.'); }
  if (!j || typeof j !== 'object' || Array.isArray(j)) throw new Error('kit.json should be one { ... } object with a "pads" list.');
  if (j.format !== undefined && j.format !== 'beatpad') throw new Error('This kit.json says it\'s a "' + String(j.format).slice(0, 30) + '" file, not a Beatpad kit.');
  if (j.version !== undefined && !(+j.version >= 1)) throw new Error('kit.json has a version Beatpad doesn\'t know ("' + String(j.version).slice(0, 10) + '").');
  if (!Array.isArray(j.pads)) throw new Error('kit.json needs a "pads" list, like "pads": [{ "slot": 1, "file": "kick.wav" }].');
  const warnings = [];
  if (+j.version > KIT_VERSION) warnings.push('This kit was made by a newer Beatpad (version ' + j.version + '); some settings may be left out.');
  const files = {}, seen = new Set(), pads = [];
  j.pads.forEach((p, i) => {
    if (!p || typeof p !== 'object') { warnings.push('Pad entry ' + (i + 1) + ' isn\'t a { ... } object, skipped.'); return; }
    const slot = +p.slot;
    if (!Number.isInteger(slot) || slot < 1 || slot > SLOTS) { warnings.push('Pad entry ' + (i + 1) + ' has slot ' + JSON.stringify(p.slot) + '; slots go 1 to 9. Skipped.'); return; }
    if (seen.has(slot)) { warnings.push('Two pads use slot ' + slot + '; the second one was skipped.'); return; }
    seen.add(slot);
    for (const [f, lo, hi] of [['volume', 0, 2], ['pitch', -24, 24], ['pan', -1, 1], ['choke', 0, 8], ['midi', 0, 127]])
      if (p[f] !== undefined && p[f] !== null && (typeof p[f] !== 'number' || p[f] < lo || p[f] > hi))
        warnings.push('Pad ' + slot + ': "' + f + '" should be a number from ' + lo + ' to ' + hi + ' (it was ' + JSON.stringify(p[f]).slice(0, 20) + ').');
    if (p.key !== undefined && p.key !== null && normalizeKey(p.key) === null) warnings.push('Pad ' + slot + ': key ' + JSON.stringify(p.key).slice(0, 20) + ' isn\'t a key Beatpad knows; it gets its usual key.');
    if (p.file !== undefined && p.file !== null && typeof p.file !== 'string') warnings.push('Pad ' + slot + ': "file" should be a file name in quotes.');
    if (typeof p.file === 'string' && p.file.trim()) files[slot] = p.file.trim().replace(/\\/g, '/').replace(/^\.\//, '');
    pads.push({ ...p, slot });
  });
  const kit = cleanKit({ name: j.name, author: j.author, bpm: j.bpm, pads });
  // keys a kit leaves out get the usual ones; a key used twice goes to the first pad that has it
  const used = new Set();
  for (const p of kit.pads) { if (p.key && used.has(p.key)) { warnings.push('Pad ' + p.slot + ': key ' + keyLabel(p.key) + ' was already taken, so the pad has no key.'); p.key = null; } if (p.key) used.add(p.key); }
  if (!Object.keys(files).length) warnings.push('No pad in kit.json names a "file", so the kit is empty.');
  return { kit, files, warnings };
}

// ---- keys

const KEY_NAMES = { Space: 'Space', Enter: 'Enter', Tab: 'Tab', Backspace: 'Bksp', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\',
  Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backquote: '`', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
  NumpadAdd: 'Num +', NumpadSubtract: 'Num -', NumpadMultiply: 'Num *', NumpadDivide: 'Num /', NumpadDecimal: 'Num .', NumpadEnter: 'Num Enter',
  ShiftLeft: 'L Shift', ShiftRight: 'R Shift', ControlLeft: 'L Ctrl', ControlRight: 'R Ctrl', AltLeft: 'L Alt', AltRight: 'R Alt', CapsLock: 'Caps',
  Insert: 'Ins', Delete: 'Del', Home: 'Home', End: 'End', PageUp: 'PgUp', PageDown: 'PgDn', IntlBackslash: '\\' };
const SHORT = { ';': 'Semicolon', "'": 'Quote', ',': 'Comma', '.': 'Period', '/': 'Slash', '-': 'Minus', '=': 'Equal', '[': 'BracketLeft', ']': 'BracketRight', '`': 'Backquote', '\\': 'Backslash', ' ': 'Space' };

/** Any way of writing a key ("KeyZ", "z", "Z", "1", "Numpad7", "space") to its KeyboardEvent.code, or null */
export function normalizeKey(k) {
  if (typeof k !== 'string' || !k) return null;
  if (k.length === 1) {
    if (/[a-z]/i.test(k)) return 'Key' + k.toUpperCase();
    if (/[0-9]/.test(k)) return 'Digit' + k;
    return SHORT[k] || null;
  }
  if (/^Key[A-Z]$/.test(k) || /^Digit[0-9]$/.test(k) || /^Numpad[0-9]$/.test(k) || /^F([1-9]|1[0-9]|2[0-4])$/.test(k) || KEY_NAMES[k]) return k;
  const lower = k.toLowerCase();
  if (lower === 'space') return 'Space';
  const m = /^num(?:pad)?\s*([0-9])$/i.exec(k);
  if (m) return 'Numpad' + m[1];
  return null;
}

/** A key code as a person reads it: KeyZ -> Z, Digit1 -> 1, Numpad7 -> Num 7 */
export function keyLabel(code) {
  if (!code) return '';
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^Numpad[0-9]$/.test(code)) return 'Num ' + code.slice(6);
  return KEY_NAMES[code] || code;
}

/** Keys that never play pads: they belong to the browser and the system, or are how you get around the page */
export const RESERVED_KEYS = new Set(['Escape', 'Tab', 'MetaLeft', 'MetaRight', 'OSLeft', 'OSRight', 'ContextMenu', 'F5', 'F11', 'F12', 'NumLock', 'PrintScreen']);

/** Which slot a key plays, or 0. The pad's own key wins; the numpad plays its pad too when numpad is on
 *  and that numpad key isn't some other pad's own key */
export function slotForKey(pads, code, numpad = true) {
  if (!code || RESERVED_KEYS.has(code)) return 0;
  const own = pads.find(p => p.key === code);
  if (own) return own.slot;
  if (numpad) { const m = /^Numpad([1-9])$/.exec(code); if (m) return +m[1]; }
  return 0;
}

/**
 * Gives `slot` the key `code`. If another pad had that key, the two pads swap keys (so nothing loses its key
 * without you seeing it). Returns { pads, swapped: slot or 0, refused: reason or '' }; never changes `pads` in place.
 */
export function assignKey(pads, slot, code) {
  if (RESERVED_KEYS.has(code)) return { pads, swapped: 0, refused: keyLabel(code) + ' is kept for the browser. Pick another key.' };
  const out = pads.map(p => ({ ...p })), me = out.find(p => p.slot === slot);
  if (!me) return { pads, swapped: 0, refused: 'No such pad.' };
  if (me.key === code) return { pads: out, swapped: 0, refused: '' };
  const other = out.find(p => p.key === code && p.slot !== slot);
  if (other) other.key = me.key;
  me.key = code;
  return { pads: out, swapped: other ? other.slot : 0, refused: '' };
}

export const resetKeys = pads => pads.map(p => ({ ...p, key: DEFAULT_KEYS[p.slot] }));

// ---- key layouts: ready-made ones to pick from, plus Custom (whatever you mapped, kept when you switch away)

/** Each layout, slot -> key, laid out the way the pads are (7 8 9 on top) where the keys allow */
export const KEY_LAYOUTS = [
  { id: 'numpad', name: 'Number pad', about: '7 8 9 / 4 5 6 / 1 2 3, laid out just like the pads', keys: { ...NUMPAD_KEYS } },
  { id: 'qwe', name: 'QWE / ASD / ZXC', about: 'Left hand, on any laptop', keys: { ...DEFAULT_KEYS } },
  { id: 'row', name: 'Number row', about: '1 to 9 along the top of the keyboard, in pad order', keys: Object.fromEntries(Array.from({ length: 9 }, (_, i) => [i + 1, 'Digit' + (i + 1)])) },
  { id: 'right', name: 'Right hand', about: 'U I O / J K L / M , . (keeps your left hand free)',
    keys: { 7: 'KeyU', 8: 'KeyI', 9: 'KeyO', 4: 'KeyJ', 5: 'KeyK', 6: 'KeyL', 1: 'KeyM', 2: 'Comma', 3: 'Period' } },
];
export const layoutKeys = id => ({ ...(KEY_LAYOUTS.find(l => l.id === id) || KEY_LAYOUTS[1]).keys });
const sameKeys = (a, b) => Array.from({ length: SLOTS }, (_, i) => i + 1).every(s => (a?.[s] || null) === (b?.[s] || null));

/** Which layout to start with: Number pad on what's probably a desktop keyboard (a mouse, a big screen, not a Mac),
 *  QWE / ASD / ZXC otherwise. The numpad plays the pads as well either way, unless you turn that off. */
export const defaultLayout = ({ coarse = false, screenWidth = 0, mac = false } = {}) => !coarse && !mac && screenWidth >= 1920 ? 'numpad' : 'qwe';

/** A saved key setup, tidied: { layout: one of the ids or 'custom', custom: slot -> key, or null } */
export function cleanKeyState(s, fallback = 'qwe') {
  const custom = s?.custom && typeof s.custom === 'object' ? Object.fromEntries(Array.from({ length: SLOTS }, (_, i) => [i + 1, normalizeKey(s.custom[i + 1]) || null])) : null;
  let layout = s?.layout === 'custom' ? 'custom' : KEY_LAYOUTS.some(l => l.id === s?.layout) ? s.layout : fallback;
  if (layout === 'custom' && !custom) layout = fallback;
  return { layout, custom };
}

/** The keys in use now, slot -> key */
export const activeKeys = state => state.layout === 'custom' ? { ...state.custom } : layoutKeys(state.layout);

/** Picking a layout. Your custom keys are never thrown away by this; `confirm` says to ask first anyway (you're
 *  leaving keys you set up yourself, and they'll be under Custom). */
export function pickLayout(state, id) {
  if (id === 'custom' && !state.custom) return { state, confirm: false };
  const next = { ...state, layout: id };
  return { state: next, confirm: state.layout === 'custom' && id !== 'custom' && !sameKeys(state.custom, layoutKeys(id)) };
}

/** Mapping from a layout replaces the saved Custom keys (when there are some, and they're different): ask first */
export const remapOverwritesCustom = state => state.layout !== 'custom' && !!state.custom && !sameKeys(state.custom, activeKeys(state));

/** One pad gets a key (the pad that had it swaps, as with assignKey). The result is always Custom: it starts from
 *  the keys in use now. Returns { state, swapped, refused } */
export function remapKey(state, slot, code) {
  const pads = Object.entries(activeKeys(state)).map(([s, key]) => ({ slot: +s, key }));
  const r = assignKey(pads, slot, code);
  if (r.refused) return { state, swapped: 0, refused: r.refused };
  return { state: { layout: 'custom', custom: Object.fromEntries(r.pads.map(p => [p.slot, p.key])) }, swapped: r.swapped, refused: '' };
}

/** With NumLock off, some systems send the numpad's other meaning (Home, ArrowUp, Clear...) as the code: on the
 *  numpad itself (location 3) those are still the number keys. Anywhere else they're left alone. */
const NUMLOCK_OFF = { Insert: 'Numpad0', End: 'Numpad1', ArrowDown: 'Numpad2', PageDown: 'Numpad3', ArrowLeft: 'Numpad4', Clear: 'Numpad5',
  ArrowRight: 'Numpad6', Home: 'Numpad7', ArrowUp: 'Numpad8', PageUp: 'Numpad9', Delete: 'NumpadDecimal' };
export const keyCode = (code, location = 0) => location === 3 && NUMLOCK_OFF[code] ? NUMLOCK_OFF[code] : code;

// ---- MIDI

/** General MIDI drum note names, for showing what a note is */
export const GM_DRUMS = { 35: 'Acoustic kick', 36: 'Kick', 37: 'Side stick', 38: 'Snare', 39: 'Clap', 40: 'Electric snare', 41: 'Low floor tom', 42: 'Closed hat',
  43: 'High floor tom', 44: 'Pedal hat', 45: 'Low tom', 46: 'Open hat', 47: 'Low-mid tom', 48: 'High-mid tom', 49: 'Crash', 50: 'High tom', 51: 'Ride',
  52: 'China', 53: 'Ride bell', 54: 'Tambourine', 55: 'Splash', 56: 'Cowbell', 57: 'Crash 2', 59: 'Ride 2' };
/** Other General MIDI drum notes that play the nearest pad when no pad has them: a kit or drum controller that sends
 *  "electric snare" or "pedal hat" still plays something sensible */
export const GM_ALIASES = { 35: 1, 40: 2, 44: 3, 41: 8, 43: 8, 47: 8, 50: 7, 52: 9, 55: 9, 57: 9, 51: 9, 53: 9, 59: 9, 54: 5, 56: 5 };
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
/** MIDI note to a name, middle C (60) = C4 */
export const midiNoteName = n => NOTE_NAMES[n % 12] + (Math.floor(n / 12) - 1);
export const midiLabel = n => n === null || n === undefined ? 'none' : n + ' (' + midiNoteName(n) + (GM_DRUMS[n] ? ', ' + GM_DRUMS[n] : '') + ')';

/** Which slot a MIDI note plays, or 0: a pad's own note first, then the General MIDI neighbors */
export function slotForNote(pads, note, aliases = true) {
  const own = pads.find(p => p.midi === note);
  if (own) return own.slot;
  if (aliases && GM_ALIASES[note] && !pads.some(p => p.midi === note)) return GM_ALIASES[note];
  return 0;
}

/** Gives `slot` the MIDI note; a pad that had it gets this pad's old note (a swap, like keys) */
export function assignNote(pads, slot, note) {
  const out = pads.map(p => ({ ...p })), me = out.find(p => p.slot === slot);
  if (!me) return { pads, swapped: 0 };
  if (me.midi === note) return { pads: out, swapped: 0 };
  const other = out.find(p => p.midi === note && p.slot !== slot);
  if (other) other.midi = me.midi;
  me.midi = note;
  return { pads: out, swapped: other ? other.slot : 0 };
}
/** Every pad back to the General MIDI note for what it is (by its name) */
export const resetNotes = pads => pads.map(p => ({ ...p, midi: gmNoteFor(p.name, p.slot) }));

/** Velocity (1 to 127) to gain: a gentle curve, so soft hits are soft but still there */
export const velocityGain = v => Math.pow(Math.min(127, Math.max(0, +v || 0)) / 127, 1.6);

/** A MIDI message to { type: 'on' | 'off', note, velocity } or null (everything else is ignored) */
export function parseMidi(data) {
  if (!data || data.length < 3) return null;
  const kind = data[0] & 0xf0;
  if (kind === 0x90 && data[2] > 0) return { type: 'on', note: data[1], velocity: data[2] };
  if (kind === 0x80 || (kind === 0x90 && data[2] === 0)) return { type: 'off', note: data[1], velocity: 0 };
  return null;
}

// ---- what a file is, from its name

// each kind: words found anywhere in a name, words that start a name's word, and short forms that must be a whole word
const KINDS = [
  ['kick', ['kick', 'bassdrum'], ['kik', 'kck', 'bass', 'bd', '808', 'boom'], ['bd', 'kd']],
  ['snare', ['snare'], ['snr', 'snar'], ['sd', 'sn']],
  ['clap', ['clap'], ['clp', 'snap'], ['cp', 'cl']],
  ['hat', ['hihat'], ['hat', 'hh', 'chh', 'ohh', 'phh'], ['hh', 'ch', 'oh', 'hhc', 'hho']],
  ['tom', [], ['tom', 'floortom'], ['lt', 'mt', 'ht', 'ft']],
  ['cymbal', ['crash', 'cymbal', 'splash'], ['ride', 'china', 'cym'], ['cy', 'cr', 'rd']],
  ['perc', ['rimshot', 'sidestick', 'cowbell', 'shaker', 'tambourine', 'perc'], ['rim', 'stick', 'bell', 'tamb', 'conga', 'bongo', 'clave', 'block', 'fx', 'wood'], ['rs', 'cb', 'sh']],
];

/** A name's words: "01-ClosedHat_v2.wav" -> ["01", "closed", "hat", "v", "2"] (camelCase and digits split off) */
export function nameWords(name) {
  return String(name || '').split('/').pop().replace(/\.[a-z0-9]{1,5}$/i, '').replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([a-z])([0-9])|([0-9])([a-z])/gi, '$1$3 $2$4').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

/** Tags from a file name: what kind of drum it probably is, plus "open" or "closed" for hats and "high" or "low" for toms */
export function guessTags(name) {
  const words = nameWords(name), joined = words.join(' '), tags = [];
  for (const [tag, anywhere, starts, whole] of KINDS) {
    const hit = anywhere.some(w => joined.includes(w)) || words.some(w => starts.some(s => w.startsWith(s)) || whole.includes(w))
      || (tag === 'hat' && words.some(w => w.endsWith('hat') && !['that', 'what', 'chat'].includes(w)));   // "openhat" 
    if (hit) tags.push(tag);
  }
  if (tags.includes('hat') || tags.includes('cymbal')) {
    if (words.some(w => ['open', 'opn', 'oh', 'ohh', 'hho', 'opened'].includes(w)) || joined.includes('open')) tags.push('open');
    else if (words.some(w => ['closed', 'close', 'cls', 'ch', 'chh', 'hhc', 'pedal', 'phh', 'tight'].includes(w)) || joined.includes('closed')) tags.push('closed');
  }
  if (tags.includes('tom')) {
    if (words.some(w => ['hi', 'high', 'ht', 'small', 'rack', 'mt', 'mid'].includes(w))) tags.push('high');
    else if (words.some(w => ['lo', 'low', 'lt', 'floor', 'ft', 'big', 'floortom'].includes(w)) || joined.includes('floor')) tags.push('low');
  }
  return tags;
}

/** The pad a file belongs on by name, or 0 */
export function slotForTags(tags) {
  const t = new Set(tags);
  if (t.has('kick')) return 1;
  if (t.has('snare')) return 2;
  if (t.has('clap')) return 4;
  if (t.has('hat')) return t.has('open') ? 6 : 3;
  if (t.has('tom')) return t.has('low') ? 8 : 7;
  if (t.has('cymbal')) return 9;
  if (t.has('perc')) return 5;
  return 0;
}

/** A pad number at the front of a file name: "01-kick.wav", "3 hat.wav", "pad7.wav", "[9] crash" -> 1, 3, 7, 9; or 0 */
export function slotFromName(name) {
  const base = String(name || '').split('/').pop();
  const m = /^\s*(?:pad\s*|slot\s*|\[|\()?0*([1-9])(?![0-9])/i.exec(base);
  return m ? +m[1] : 0;
}

/**
 * Puts files on pads: first by a number at the front of the name, then by what the name says (kick, snare, hat...),
 * then whatever's left in order on the empty pads. Returns { slots: { slot: index into names }, leftOver: [index] }.
 */
export function assignFiles(names) {
  const slots = {}, placed = new Set();
  names.forEach((n, i) => { const s = slotFromName(n); if (s && slots[s] === undefined) { slots[s] = i; placed.add(i); } });
  names.forEach((n, i) => {
    if (placed.has(i)) return;
    let s = slotForTags(guessTags(n.split('/').pop()));
    // a second tom, hat or cymbal goes to its neighbor if that's free
    const alt = { 7: 8, 8: 7, 3: 6, 6: 3, 1: 0, 2: 4, 4: 2, 9: 0, 5: 0 }[s];
    if (s && slots[s] !== undefined) s = alt && slots[alt] === undefined ? alt : 0;
    if (s) { slots[s] = i; placed.add(i); }
  });
  const leftOver = [];
  names.forEach((n, i) => {
    if (placed.has(i)) return;
    let s = 1;
    while (s <= SLOTS && slots[s] !== undefined) s++;
    if (s <= SLOTS) { slots[s] = i; placed.add(i); } else leftOver.push(i);
  });
  return { slots, leftOver };
}

/** Is this file name audio we should try? (the browser has the last word: decodeAudioData) */
export const isAudioName = n => /\.(wav|wave|mp3|flac|ogg|oga|opus|m4a|aac|mp4|aif|aiff|aifc|webm|caf)$/i.test(n);
/** A pad name from a file name: "01-Kick_Hard.wav" -> "Kick Hard" */
export const nameFromFile = n => cleanName(String(n).split('/').pop().replace(/\.[a-z0-9]{1,5}$/i, '').replace(/^\s*(?:pad\s*|slot\s*)?0*[1-9](?![0-9])\s*[-_. )\]]*\s*/i, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' '), 'Sample');
/** A file name that's safe inside a zip on every system */
export const safeFileName = n => String(n).replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').replace(/^\.+/, '').trim().slice(0, 80) || 'sample';

// ---- sample helpers

/**
 * Where the sound starts: the first sample above `thresholdDb` below the sound's own peak, less a little lead-in
 * (`preMs`, so the attack's very front isn't shaved off). Returns seconds. All channels count.
 */
export function autoTrimStart(channels, sr, thresholdDb = -40, preMs = 0.5) {
  const chans = Array.isArray(channels) ? channels : [channels];
  let peak = 0;
  for (const c of chans) for (let i = 0; i < c.length; i++) { const a = Math.abs(c[i]); if (a > peak) peak = a; }
  if (peak === 0) return 0;
  const th = peak * Math.pow(10, thresholdDb / 20), n = chans[0].length;
  let first = n;
  for (const c of chans) for (let i = 0; i < Math.min(first, c.length); i++) if (Math.abs(c[i]) >= th) { first = i; break; }
  if (first >= n) return 0;
  return Math.max(0, first - Math.round(preMs * sr / 1000)) / sr;
}

/** Peak level of a stretch, in dB (for the "is this silent?" checks) */
export function peakDb(channels, from = 0, to = Infinity) {
  let peak = 0;
  for (const c of Array.isArray(channels) ? channels : [channels]) for (let i = Math.max(0, from); i < Math.min(c.length, to); i++) peak = Math.max(peak, Math.abs(c[i]));
  return peak > 0 ? 20 * Math.log10(peak) : -Infinity;
}

/**
 * What one hit plays: where in the buffer, for how long, how fast, how loud, where it fades.
 * Returns { offset, duration (buffer seconds), rate, gain, pan, length (real seconds), fadeAt (real seconds from the start) }.
 */
export function hitPlan(pad, bufferSeconds, velocity = 1) {
  const rate = Math.pow(2, (pad.pitch || 0) / 12);
  const offset = Math.min(Math.max(0, pad.start || 0), Math.max(0, bufferSeconds - 0.001));
  const end = pad.end !== null && pad.end !== undefined && pad.end > offset ? Math.min(pad.end, bufferSeconds) : bufferSeconds;
  const duration = Math.max(0.001, end - offset), length = duration / rate;
  const fade = Math.min(Math.max(0, pad.fade || 0), length);
  return { offset, duration, rate, gain: (pad.mute ? 0 : pad.volume) * velocity, pan: pad.pan || 0, length, fadeAt: length - fade, fade };
}

/** The pads a hit on `slot` cuts off: the others in its choke group (and itself, when it retriggers) */
export function chokeTargets(pads, slot) {
  const me = pads.find(p => p.slot === slot);
  if (!me) return [];
  const out = me.mode === 'retrigger' ? [slot] : [];
  if (me.choke) for (const p of pads) if (p.slot !== slot && p.choke === me.choke) out.push(p.slot);
  return out;
}

/** 16-bit PCM WAV bytes from channels of Float32 samples (dithered with a touch of noise, clipped safely) */
export function encodeWav(channels, sr, bits = 16) {
  const chans = Array.isArray(channels) ? channels : [channels], nch = chans.length, n = chans[0].length, bps = bits / 8;
  const buf = new ArrayBuffer(44 + n * nch * bps), v = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * nch * bps, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, nch, true); v.setUint32(24, sr, true); v.setUint32(28, sr * nch * bps, true);
  v.setUint16(32, nch * bps, true); v.setUint16(34, bits, true); w(36, 'data'); v.setUint32(40, n * nch * bps, true);
  let o = 44, seed = 22222;
  const full = bits === 24 ? 8388607 : 32767;
  for (let i = 0; i < n; i++) for (let c = 0; c < nch; c++) {
    seed = (seed * 16807) % 2147483647;
    const d = bits === 16 ? (seed / 2147483647 - 0.5) / full : 0;
    const s = Math.round(Math.max(-1, Math.min(1, chans[c][i] + d)) * full);
    if (bits === 24) { v.setUint8(o, s & 255); v.setUint8(o + 1, (s >> 8) & 255); v.setUint8(o + 2, (s >> 16) & 255); o += 3; }
    else { v.setInt16(o, s, true); o += 2; }
  }
  return new Uint8Array(buf);
}

// ---- the loop recorder: positions are kept in beats, so changing the tempo keeps the groove

export const QUANTIZE = [{ id: 0, name: 'Off' }, { id: 2, name: '1/8' }, { id: 3, name: '1/8 triplet' }, { id: 4, name: '1/16' }, { id: 6, name: '1/16 triplet' }, { id: 8, name: '1/32' }];

/** Seconds to a beat position in the loop (0 to loopBeats), given when beat 0 of the first pass was */
export function beatInLoop(time, startTime, bpm, loopBeats) {
  const b = (time - startTime) * bpm / 60;
  return ((b % loopBeats) + loopBeats) % loopBeats;
}

/** Snap a beat to the nearest 1/steps of a beat (steps 2 = 8ths, 4 = 16ths, 3 = 8th triplets...), wrapping at the loop's end */
export function quantizeBeat(beat, steps, loopBeats) {
  if (!steps) return beat;
  const q = Math.round(beat * steps) / steps;
  return ((q % loopBeats) + loopBeats) % loopBeats;
}

/** The hits of the loop that fall in [from, to) (seconds), as { time, ev }, for every pass of the loop in that window */
export function loopHitsBetween(events, from, to, startTime, bpm, loopBeats) {
  const spb = 60 / bpm, len = loopBeats * spb, out = [];
  if (to <= startTime) return out;
  const k0 = Math.max(0, Math.floor((from - startTime) / len)), k1 = Math.floor((to - startTime) / len);
  for (let k = k0; k <= k1; k++) for (const ev of events) {
    const t = startTime + k * len + ev.beat * spb;
    if (t >= from && t < to && t >= startTime && !(ev.notBefore && t < ev.notBefore)) out.push({ time: t, ev });
  }
  return out.sort((a, b) => a.time - b.time);
}

/** The click times (and whether each is the bar's first beat) in [from, to) */
export function clicksBetween(from, to, startTime, bpm, beatsPerBar = 4) {
  const spb = 60 / bpm, out = [];
  for (let b = Math.ceil((from - startTime) / spb - 1e-9); startTime + b * spb < to; b++)
    out.push({ time: startTime + b * spb, beat: b, down: ((b % beatsPerBar) + beatsPerBar) % beatsPerBar === 0 });
  return out;
}

/** The next time on a grid of `interval` seconds counted from `origin`, at or after `t` */
export const nextGridTime = (t, origin, interval) => origin + Math.ceil((t - origin) / interval - 1e-9) * interval;

// ---- reading a zip (kit files): stored and deflated entries, which is what every zip tool writes

/**
 * Reads a zip. Returns [{ name, data: Uint8Array }] for its files (folders, Mac "__MACOSX" leftovers and dot files left out).
 * Throws an Error with a plain reason when it isn't a zip it can read.
 */
export async function readZip(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 22) throw new Error('This file is too small to be a kit (.beatpad or .zip).');
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('This isn\'t a zip file, so it can\'t be a kit. A .beatpad kit is a zip with kit.json and audio files inside.');
  const count = v.getUint16(eocd + 10, true), cdOffset = v.getUint32(eocd + 16, true);
  if (cdOffset === 0xffffffff || count === 0xffff) throw new Error('This zip is over 4 GB (ZIP64). Kits should be much smaller than that.');
  const out = [], dec = new TextDecoder();
  let p = cdOffset;
  for (let n = 0; n < count; n++) {
    if (p + 46 > bytes.length || v.getUint32(p, true) !== 0x02014b50) throw new Error('This zip looks damaged (its list of files is broken). Try making it again.');
    const flags = v.getUint16(p + 8, true), method = v.getUint16(p + 10, true), csize = v.getUint32(p + 20, true), usize = v.getUint32(p + 24, true);
    const nlen = v.getUint16(p + 28, true), xlen = v.getUint16(p + 30, true), clen = v.getUint16(p + 32, true), local = v.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nlen)).replace(/\\/g, '/');
    p += 46 + nlen + xlen + clen;
    if (name.endsWith('/') || /(^|\/)(__MACOSX|\.)/.test(name)) continue;
    if (flags & 1) throw new Error('"' + name + '" in this zip is password-protected. Kits can\'t be encrypted.');
    if (v.getUint32(local, true) !== 0x04034b50) throw new Error('This zip looks damaged ("' + name + '" is missing). Try making it again.');
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const raw = bytes.subarray(start, start + csize);
    let data;
    if (method === 0) data = raw.slice();
    else if (method === 8) data = await inflate(raw);
    else throw new Error('"' + name + '" in this zip uses a kind of compression browsers can\'t open (method ' + method + '). Zip it again with your system\'s own zip tool.');
    if (data.length !== usize) throw new Error('"' + name + '" in this zip didn\'t unpack to the right size. The file may be damaged.');
    out.push({ name, data });
  }
  return out;
}

async function inflate(raw) {
  if (typeof DecompressionStream === 'undefined') throw new Error('This browser can\'t unpack compressed zips. Try a current Chrome, Edge, Firefox or Safari.');
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([raw]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** In a list of zip entries (or dropped files) with paths, finds kit.json (the one nearest the top) and the folder it's in */
export function findKitJson(names) {
  const hits = names.map((n, i) => ({ n, i })).filter(x => /(^|\/)kit\.json$/i.test(x.n)).sort((a, b) => a.n.split('/').length - b.n.split('/').length);
  if (!hits.length) return null;
  const n = hits[0].n;
  return { index: hits[0].i, dir: n.slice(0, n.length - 'kit.json'.length) };
}

/** The entry a kit.json "file" means: the exact path next to kit.json, else the same name in any case, else the same file name anywhere */
export function matchFile(names, dir, file) {
  const want = (dir + file).replace(/\/+/g, '/'), lower = want.toLowerCase(), base = file.split('/').pop().toLowerCase();
  let i = names.indexOf(want);
  if (i < 0) i = names.findIndex(n => n.toLowerCase() === lower);
  if (i < 0) i = names.findIndex(n => n.split('/').pop().toLowerCase() === base);
  return i;
}
