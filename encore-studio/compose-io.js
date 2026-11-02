// ENCORE. Compose: sound and input. MIDI keyboards (Web MIDI), the computer
// keyboard as a piano, a metronome click, and a simple piano-ish voice to hear
// the score. Times are AudioContext seconds, so recorded notes, the click and
// playback all share one clock.

let ctx = null, out = null;
export function audio() {
  if (!ctx) {
    ctx = new AudioContext({ latencyHint: "interactive" });
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3;
    out = ctx.createGain(); out.gain.value = 0.7;
    out.connect(comp); comp.connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}
export const now = () => audio().currentTime;

// ---------- the sounds: one simple voice per instrument family ----------
// Not samples: small synth patches that read clearly in a mix and load instantly.
const SOUNDS = {
  piano: { osc: [["triangle", 1, 1], ["sine", 2.001, 0.18]], a: 0.006, decay: 0.35, sus: 0.35, rel: 0.08, bright: 6 },
  strings: { osc: [["sawtooth", 1, 0.55], ["sawtooth", 1.004, 0.45]], a: 0.09, decay: 0, sus: 1, rel: 0.25, bright: 3.2, vib: 5.2 },
  brass: { osc: [["sawtooth", 1, 1]], a: 0.035, decay: 0.3, sus: 0.8, rel: 0.12, bright: 4.5, swell: true },
  winds: { osc: [["triangle", 1, 1], ["sine", 2, 0.25], ["sine", 3, 0.08]], a: 0.04, decay: 0, sus: 1, rel: 0.1, bright: 5, vib: 4.8 },
  pluck: { osc: [["sawtooth", 1, 0.7], ["triangle", 1, 0.5]], a: 0.002, decay: 0.22, sus: 0.0, rel: 0.12, bright: 8, pluck: true },
  bass: { osc: [["triangle", 1, 1], ["sine", 1, 0.6]], a: 0.008, decay: 0.5, sus: 0.45, rel: 0.1, bright: 3 },
  organ: { osc: [["sine", 1, 1], ["sine", 2, 0.5], ["sine", 3, 0.3], ["sine", 4, 0.15]], a: 0.01, decay: 0, sus: 1, rel: 0.05, bright: 9 },
  voice: { osc: [["sine", 1, 1], ["triangle", 1, 0.25], ["sine", 2, 0.12]], a: 0.07, decay: 0, sus: 1, rel: 0.18, bright: 2.6, vib: 5.5 },
  mallets: { osc: [["sine", 1, 1], ["sine", 3.99, 0.25], ["sine", 10.1, 0.06]], a: 0.002, decay: 0.12, sus: 0, rel: 0.4, bright: 12, pluck: true },
};
/** The sound for an instrument name (from tunings.js or the page's extras) */
export function soundFor(name = "") {
  const n = name.toLowerCase();
  if (/organ/.test(n)) return "organ";
  if (/voice|choir|vocal/.test(n)) return "voice";
  if (/violin|viola|cello|fiddle|double bass|nyckelharpa|gamba|erhu|hurdy/.test(n)) return "strings";
  if (/trumpet|cornet|flugel|horn|mellophone|trombone|euphonium|tuba/.test(n)) return "brass";
  if (/flute|piccolo|oboe|clarinet|bassoon|saxophone|english horn/.test(n)) return "winds";
  if (/bass/.test(n)) return "bass";
  if (/kalimba|marimba|xylophone|vibra|glock|timpani/.test(n)) return "mallets";
  if (/guitar|ukulele|banjo|mandol|lute|bouzouki|oud|dulcimer|balalaika|domra|charango|cavaquinho|cuatro|tres|vihuela|tiple|bandurria|laud|pipa|ruan|shamisen|koto|kantele|dobro|steel|guitalele|requinto|bajo|guitarron/.test(n)) return "pluck";
  return "piano";
}
const live = new Map();
/** Sound a note now (or at time t) until noteOff, or for dur seconds. opts: { sound, gain } */
export function noteOn(midi, vel = 0.8, t = 0, dur = 0, opts = {}) {
  const a = audio(), at = Math.max(a.currentTime, t || a.currentTime), f = 440 * 2 ** ((midi - 69) / 12);
  const P = SOUNDS[opts.sound] || SOUNDS.piano, gain = opts.gain ?? 1;
  const g = a.createGain(), lp = a.createBiquadFilter();
  lp.type = "lowpass"; lp.Q.value = 0.5;
  lp.frequency.setValueAtTime(Math.min(12000, 600 + f * P.bright * (0.5 + vel * 0.6)), at);
  if (P.pluck) lp.frequency.setTargetAtTime(Math.min(12000, 300 + f * 2), at + 0.01, 0.15);
  if (P.swell) { lp.frequency.setValueAtTime(400 + f, at); lp.frequency.linearRampToValueAtTime(Math.min(12000, 600 + f * P.bright), at + 0.08); }
  const oscs = P.osc.map(([type, mul, lvl]) => { const o = a.createOscillator(), og = a.createGain(); o.type = type; o.frequency.value = f * mul; og.gain.value = lvl; o.connect(og); og.connect(lp); return o; });
  if (P.vib) { const lfo = a.createOscillator(), lg = a.createGain(); lfo.frequency.value = P.vib; lg.gain.setValueAtTime(0, at); lg.gain.linearRampToValueAtTime(f * 0.004, at + 0.35); lfo.connect(lg); for (const o of oscs) lg.connect(o.frequency); lfo.start(at); oscs.push(lfo); }
  lp.connect(g); g.connect(out);
  const peak = 0.3 * vel * gain * Math.min(1, 1.3 - (midi - 60) / 80) / Math.sqrt(P.osc.length * 0.7);
  g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(peak, at + P.a);
  if (P.decay) g.gain.setTargetAtTime(peak * P.sus, at + P.a, P.decay);
  for (const o of oscs) o.start(at);
  const v = { g, oscs, at, rel: P.rel };
  if (dur) { release(v, at + dur); return null; }
  noteOff(midi); live.set(midi, v);
  return v;
}
function release(v, t) {
  const when = Math.max(t, v.at + 0.02);
  v.g.gain.cancelScheduledValues(when); v.g.gain.setTargetAtTime(0, when, v.rel);
  for (const o of v.oscs) o.stop(when + v.rel * 8 + 0.1);
}
export function noteOff(midi, t = 0) { const v = live.get(midi); if (v) { live.delete(midi); release(v, t || audio().currentTime); } }
export function allOff() { for (const m of [...live.keys()]) noteOff(m); }

// ---------- the mic: sing or play one note at a time and it becomes notes ----------
// Voice's pitch tracker, read every 10 ms on the audio clock. Headphones keep the click out of it.
let mic = null;
export async function startMic(onFrame = null) {
  const { VoiceTracker } = await import("./voice-core.js");
  const a = audio();
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  const src = a.createMediaStreamSource(stream), an = a.createAnalyser();
  an.fftSize = 4096; src.connect(an);
  const buf = new Float32Array(an.fftSize), tracker = new VoiceTracker({ minHz: 55, maxHz: 1400 }), frames = [];
  const timer = setInterval(() => { an.getFloatTimeDomainData(buf); const fr = tracker.feed(buf, a.sampleRate, a.currentTime); frames.push(fr); onFrame?.(fr); }, 10);
  mic = { stream, src, timer, frames };
  return mic;
}
/** Stop listening; gives the notes heard as [{ midi, on, off, vel }] in audio-clock seconds */
export async function stopMic() {
  if (!mic) return [];
  clearInterval(mic.timer); mic.stream.getTracks().forEach((t) => t.stop()); mic.src.disconnect();
  const { segmentNotes } = await import("./voice-core.js");
  const notes = segmentNotes(mic.frames, 0.08).map((n) => ({ midi: Math.round(n.midi), on: n.start - 0.02, off: n.end + 0.03, vel: 0.8 }));
  mic = null;
  return notes;
}
export const micOn = () => !!mic;

// ---------- the click ----------
/** One click at time t: accent on the downbeat */
export function click(t, accent = false, vol = 0.6) {
  const a = audio(), o = a.createOscillator(), g = a.createGain();
  o.type = "square"; o.frequency.value = accent ? 1760 : 1175;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol * (accent ? 0.5 : 0.32), t + 0.001); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + 0.06);
}
/**
 * A running metronome from time t0: beats of beatSec, accent every perBar.
 * onBeat(index, time) is called just before each beat (for a count-in display).
 * Returns { stop }.
 */
export function metronome(t0, beatSec, perBar, { on = true, onBeat = null, lookahead = 0.12 } = {}) {
  let next = 0, timer = 0, stopped = false;
  const tick = () => {
    if (stopped) return;
    const a = audio();
    while (t0 + next * beatSec < a.currentTime + lookahead) {
      const t = t0 + next * beatSec;
      if (on) click(t, next % perBar === 0);
      if (onBeat) { const i = next; setTimeout(() => !stopped && onBeat(i, t), Math.max(0, (t - a.currentTime) * 1000)); }
      next++;
    }
    timer = setTimeout(tick, 25);
  };
  tick();
  return { stop() { stopped = true; clearTimeout(timer); } };
}

// ---------- MIDI keyboards ----------
const midiListeners = new Set();
let midiAccess = null, midiState = "off";
/** Start listening to every MIDI input (asks the browser once). Returns the device names. */
export async function startMidi() {
  if (!navigator.requestMIDIAccess) { midiState = "unsupported"; return []; }
  if (!midiAccess) {
    try { midiAccess = await navigator.requestMIDIAccess(); } catch { midiState = "denied"; return []; }
    const hook = () => { for (const inp of midiAccess.inputs.values()) inp.onmidimessage = onMidi; };
    midiAccess.onstatechange = () => { hook(); emit({ type: "devices", names: devices() }); };
    hook();
  }
  midiState = "on";
  return devices();
}
const devices = () => (midiAccess ? [...midiAccess.inputs.values()].map((i) => i.name) : []);
export const midiStatus = () => ({ state: midiState, devices: devices() });
let sustain = false;
const held = new Set();
function onMidi(e) {
  const [st, d1, d2] = e.data, kind = st & 0xf0;
  // the event's own timestamp, moved onto the audio clock
  const t = ctx ? ctx.currentTime - (performance.now() - e.timeStamp) / 1000 : 0;
  if (kind === 0x90 && d2 > 0) emit({ type: "on", midi: d1, vel: d2 / 127, t });
  else if (kind === 0x80 || (kind === 0x90 && d2 === 0)) { if (sustain) held.add(d1); else emit({ type: "off", midi: d1, t }); }
  else if (kind === 0xb0 && d1 === 64) { sustain = d2 >= 64; if (!sustain) { for (const m of held) emit({ type: "off", midi: m, t }); held.clear(); } }
}
function emit(ev) { for (const f of midiListeners) f(ev); }
/** Listen to notes from any source (MIDI, the on-screen piano, computer keys): f({ type: 'on'|'off', midi, vel, t }) */
export function onNotes(f) { midiListeners.add(f); return () => midiListeners.delete(f); }
/** For the on-screen piano and computer keys: send a note through the same listeners */
export function playNote(type, midi, vel = 0.8) { emit({ type, midi, vel, t: ctx ? ctx.currentTime : 0 }); }

// ---------- the computer keyboard as a piano (two rows, like most DAWs) ----------
// A W S E D F T G Y H U J K O L P ; = C C# D D# E F F# G G# A A# B C C# D D# E
export const KEYMAP = { a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12, o: 13, l: 14, p: 15, ";": 16 };
