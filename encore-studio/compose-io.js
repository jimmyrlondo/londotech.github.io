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

// ---------- the voice: two detuned partials with a struck envelope, softer up high ----------
const live = new Map();
/** Sound a note now (or at time t) until noteOff, or for dur seconds */
export function noteOn(midi, vel = 0.8, t = 0, dur = 0) {
  const a = audio(), at = Math.max(a.currentTime, t || a.currentTime), f = 440 * 2 ** ((midi - 69) / 12);
  const g = a.createGain(), lp = a.createBiquadFilter();
  lp.type = "lowpass"; lp.frequency.value = Math.min(9000, 1200 + f * 6 * vel); lp.Q.value = 0.4;
  const o1 = a.createOscillator(), o2 = a.createOscillator();
  o1.type = "triangle"; o2.type = "sine"; o1.frequency.value = f; o2.frequency.value = f * 2.001;
  const g2 = a.createGain(); g2.gain.value = 0.18;
  o1.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g); g.connect(out);
  const peak = 0.32 * vel * Math.min(1, 1.3 - (midi - 60) / 80);
  g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(peak, at + 0.006);
  g.gain.setTargetAtTime(peak * 0.35, at + 0.01, 0.35); // the decay of a struck string
  o1.start(at); o2.start(at);
  const v = { g, o1, o2, at };
  if (dur) { release(v, at + dur); return null; }
  noteOff(midi); live.set(midi, v);
  return v;
}
function release(v, t) {
  const a = audio(), when = Math.max(t, v.at + 0.02);
  v.g.gain.cancelScheduledValues(when); v.g.gain.setTargetAtTime(0, when, 0.08);
  v.o1.stop(when + 0.6); v.o2.stop(when + 0.6);
}
export function noteOff(midi, t = 0) { const v = live.get(midi); if (v) { live.delete(midi); release(v, t || audio().currentTime); } }
export function allOff() { for (const m of [...live.keys()]) noteOff(m); }

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
