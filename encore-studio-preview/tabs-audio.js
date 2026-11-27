// ENCORE. Tabs: the sounds, made from scratch (no samples). A kalimba tine (a sine that
// rings, the tine's bright inharmonic bend mode near 6x that dies fast, a thumb click), a
// handpan field (fundamental, octave and fifth above it, each a hair detuned so it shimmers,
// soft hand thump), and a steel tongue drum (rounder, shorter, a mallet tick). All through
// a small room reverb. Plus the tune player, a count-in click and an offline WAV render.
import { midiToHz } from "./tabs-core.js";

let ctx = null, bus = null;
export function audio() {
  if (!ctx) { ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: "interactive" }); bus = buildBus(ctx); }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}
const noiseCache = new WeakMap();
function noise(c) {
  if (noiseCache.has(c)) return noiseCache.get(c);
  const b = c.createBuffer(1, Math.round(c.sampleRate * 0.25), c.sampleRate), d = b.getChannelData(0);
  let s = 12345;
  for (let i = 0; i < d.length; i++) { s = (s * 1103515245 + 12345) >>> 0; d[i] = s / 2147483648 - 1; }
  noiseCache.set(c, b);
  return b;
}
function impulse(c, seconds = 2.2) {
  const n = Math.round(c.sampleRate * seconds), b = c.createBuffer(2, n, c.sampleRate);
  let s = 777;
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    for (let i = 0; i < n; i++) { s = (s * 1103515245 + 12345) >>> 0; const t = i / c.sampleRate; d[i] = (s / 2147483648 - 1) * Math.exp(-t * 3.1) * (t < 0.012 ? t / 0.012 : 1); }
  }
  return b;
}
/** The mix: dry + reverb into a gentle compressor */
export function buildBus(c) {
  const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3; comp.attack.value = 0.004; comp.release.value = 0.25;
  const master = c.createGain(); master.gain.value = 0.9; master.connect(comp); comp.connect(c.destination);
  const verb = c.createConvolver(); verb.buffer = impulse(c);
  const wet = c.createGain(); wet.gain.value = 0.22; verb.connect(wet); wet.connect(master);
  // a little body warmth on everything
  const body = c.createBiquadFilter(); body.type = "peaking"; body.frequency.value = 320; body.Q.value = 0.8; body.gain.value = 2.5;
  const input = c.createGain(); input.connect(body); body.connect(master); body.connect(verb);
  return { input, wet, master };
}
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
// one decaying sine partial
function partial(c, dest, f, at, gain, tau, attack, detuneCents = 0, end = null) {
  if (f > c.sampleRate * 0.45) return null;
  const o = c.createOscillator(), g = c.createGain();
  o.type = "sine"; o.frequency.setValueAtTime(f, at); if (detuneCents) o.detune.setValueAtTime(detuneCents, at);
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(gain, at + attack);
  g.gain.setTargetAtTime(0, at + attack, tau);
  const stop = end ?? at + attack + tau * 7;
  o.connect(g); g.connect(dest); o.start(at); o.stop(stop);
  return { o, g };
}
function burst(c, dest, at, { gain = 0.2, len = 0.012, type = "bandpass", freq = 2000, q = 1 } = {}) {
  const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  src.buffer = noise(c); f.type = type; f.frequency.value = Math.min(freq, c.sampleRate * 0.45); f.Q.value = q;
  g.gain.setValueAtTime(gain, at); g.gain.exponentialRampToValueAtTime(0.0001, at + len);
  src.connect(f); f.connect(g); g.connect(dest); src.start(at, Math.random() * 0.2); src.stop(at + len + 0.02);
  return { o: src, g };
}
/** Voices: play(c, dest, { midi, time, vel (0..1), ding }) -> { stop(t) } */
export const VOICES = {
  kalimba(c, dest, n) {
    const f = midiToHz(n.midi), at = n.time, v = n.vel ?? 0.8, out = c.createGain();
    out.gain.value = 0.42 * v; out.connect(dest);
    const tau = clamp(1.25 * Math.sqrt(262 / f), 0.35, 2.0);
    const parts = [
      partial(c, out, f, at, 1, tau, 0.002),
      partial(c, out, f * 2, at, 0.06, tau * 0.25, 0.002),
      partial(c, out, f * 6.27, at, 0.16 * (0.6 + v * 0.5), 0.045, 0.001),
      partial(c, out, f * 3.01, at, 0.025, tau * 0.18, 0.002, 7),
      burst(c, out, at, { gain: 0.16 * v, len: 0.014, freq: f * 4, q: 0.9 }),
    ].filter(Boolean);
    return handle(parts, out, c);
  },
  handpan(c, dest, n) {
    const f = midiToHz(n.midi), at = n.time, v = n.vel ?? 0.8, out = c.createGain();
    out.gain.value = (n.ding ? 0.5 : 0.36) * v; out.connect(dest);
    const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 0.5;
    lp.frequency.setValueAtTime(Math.min(9000, f * 9), at); lp.frequency.setTargetAtTime(Math.min(6000, f * 4.5), at + 0.01, 0.25);
    lp.connect(out);
    const k = Math.pow(196 / f, 0.35), atk = 0.009;
    const parts = [];
    for (const [mul, gain, tau] of [[1, 0.55, 2.9 * k], [2, 0.26, 1.5 * k], [3, 0.09, 0.75 * k]]) {
      parts.push(partial(c, lp, f * mul, at, gain, tau, atk, -1.6), partial(c, lp, f * mul, at, gain, tau, atk, 1.6));
    }
    parts.push(burst(c, out, at, { gain: 0.22 * v, len: 0.05, type: "lowpass", freq: 320, q: 0.7 }));
    if (n.ding) parts.push(partial(c, lp, f * 0.5, at, 0.08, 1.2, 0.012));
    return handle(parts.filter(Boolean), out, c);
  },
  drum(c, dest, n) {
    const f = midiToHz(n.midi), at = n.time, v = n.vel ?? 0.8, out = c.createGain();
    out.gain.value = 0.4 * v; out.connect(dest);
    const k = Math.pow(262 / f, 0.3);
    const parts = [
      partial(c, out, f, at, 0.8, 1.7 * k, 0.004),
      partial(c, out, f * 2.01, at, 0.22, 0.6 * k, 0.003),
      partial(c, out, f * 2.93, at, 0.08, 0.22 * k, 0.002),
      partial(c, out, f * 5.4, at, 0.03, 0.05, 0.001),
      burst(c, out, at, { gain: 0.12 * v, len: 0.008, type: "highpass", freq: 3500, q: 0.7 }),
    ].filter(Boolean);
    return handle(parts, out, c);
  },
};
function handle(parts, out, c) {
  return {
    stop(t) { const at = Math.max(c.currentTime, t ?? c.currentTime); try { out.gain.cancelScheduledValues(at); out.gain.setTargetAtTime(0, at, 0.03); } catch {} for (const p of parts) try { p.o.stop(at + 0.25); } catch {} },
  };
}

// ---------- now and later ----------
const sounding = new Set();
/** Sound one note now (or at time t) on an instrument kind */
export function pluck(kind, midi, opts = {}) {
  const c = audio(), v = VOICES[kind] || VOICES.kalimba;
  const h = v(c, bus.input, { midi, time: opts.time ?? c.currentTime + 0.005, vel: opts.vel ?? 0.85, ding: opts.ding });
  sounding.add(h); setTimeout(() => sounding.delete(h), 8000);
  return h;
}
export function hush() { const c = audio(); for (const h of sounding) h.stop(c.currentTime); sounding.clear(); }
/** One count-in click at time t */
export function click(t, accent = false) {
  const c = audio(), o = c.createOscillator(), g = c.createGain();
  o.type = "square"; o.frequency.value = accent ? 1760 : 1175;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(accent ? 0.22 : 0.14, t + 0.001); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + 0.06);
}

/** When each note starts, in seconds: [{ i, t, dur, m }] */
export function timeline(tune, from = 0, speed = 1) {
  const spb = 60 / (tune.tempo * speed), out = []; let beat = 0;
  tune.notes.forEach((n, i) => { if (i >= from) { out.push({ i, t: beat * spb, dur: n.d * spb, m: n.m }); beat += n.d; } });
  return { events: out, length: beat * spb };
}
/**
 * Play a tune: opts { from (note index), speed (1), loop, click (count clicks on each beat), onNote(i), onEnd() } -> { stop() }.
 * Notes are scheduled a little ahead on the audio clock; onNote fires as each one sounds (to light the tab and the tines).
 */
export function playTune(tune, inst, opts = {}) {
  const c = audio(), { events, length } = timeline(tune, opts.from || 0, opts.speed || 1);
  const kind = inst.kind, ding = inst.kind === "handpan" ? inst.notes[0] : null;
  const spb = 60 / (tune.tempo * (opts.speed || 1));
  let t0 = c.currentTime + 0.12, k = 0, beatK = 0, timer = 0, done = false;
  const timers = new Set(), handles = new Set();
  const later = (fn, at) => { const id = setTimeout(() => { timers.delete(id); if (!done) fn(); }, Math.max(0, (at - c.currentTime) * 1000)); timers.add(id); };
  const pump = () => {
    if (done) return;
    const horizon = c.currentTime + 0.25;
    while (k < events.length && t0 + events[k].t < horizon) {
      const e = events[k++], at = t0 + e.t;
      for (const m of e.m) { const h = VOICES[kind](c, bus.input, { midi: m, time: at, vel: 0.85, ding: m === ding }); handles.add(h); }
      later(() => opts.onNote?.(e.i), at);
    }
    if (opts.click) while (t0 + beatK * spb < horizon && beatK * spb < length) { click(t0 + beatK * spb, beatK % tune.beats === 0); beatK++; }
    if (k >= events.length) {
      if (opts.loop && length > 0) { t0 += length; k = 0; beatK = 0; }
      else { later(() => { done = true; clearTimeout(timer); opts.onEnd?.(); }, t0 + length + 0.05); return; }
    }
    timer = setTimeout(pump, 50);
  };
  pump();
  return {
    stop() { done = true; clearTimeout(timer); for (const id of timers) clearTimeout(id); timers.clear(); for (const h of handles) h.stop(c.currentTime); handles.clear(); },
  };
}

/** The tune rendered offline to a 16-bit stereo WAV (Uint8Array) */
export async function renderWav(tune, inst, sampleRate = 44100) {
  const { events, length } = timeline(tune);
  const secs = length + 3.2, oc = new OfflineAudioContext(2, Math.ceil(secs * sampleRate), sampleRate), b = buildBus(oc);
  const ding = inst.kind === "handpan" ? inst.notes[0] : null;
  for (const e of events) for (const m of e.m) VOICES[inst.kind](oc, b.input, { midi: m, time: 0.1 + e.t, vel: 0.85, ding: m === ding });
  const buf = await oc.startRendering();
  return wav16([buf.getChannelData(0), buf.getChannelData(1)], sampleRate);
}
export function wav16(chans, fs) {
  const n = chans[0].length, nc = chans.length, data = n * nc * 2, out = new Uint8Array(44 + data), dv = new DataView(out.buffer);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) out[o + i] = s.charCodeAt(i); };
  w(0, "RIFF"); dv.setUint32(4, 36 + data, true); w(8, "WAVE"); w(12, "fmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, nc, true);
  dv.setUint32(24, fs, true); dv.setUint32(28, fs * nc * 2, true); dv.setUint16(32, nc * 2, true); dv.setUint16(34, 16, true); w(36, "data"); dv.setUint32(40, data, true);
  let peak = 0; for (const ch of chans) for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(ch[i]));
  const gain = peak > 0.98 ? 0.98 / peak : 1;
  let o = 44;
  for (let i = 0; i < n; i++) for (let ch = 0; ch < nc; ch++) { dv.setInt16(o, Math.round(clamp(chans[ch][i] * gain, -1, 1) * 32767), true); o += 2; }
  return out;
}
