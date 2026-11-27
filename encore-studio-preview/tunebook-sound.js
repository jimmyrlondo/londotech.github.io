// ENCORE. Tune Book: the sound. Recorded instruments from Green Room's sounds/ folder (the same
// MuseScore General and VSCO 2 sets Compose uses, read with compose-samples.js's helpers), a synth
// voice from compose-io.js for any note whose sample hasn't arrived yet (or a browser that can't
// decode the samples), and a click. Every playback runs through its own gain, so Stop silences
// the notes already scheduled ahead as well as the ones sounding.
import { zonesFor, rateFor, manifestPath, validManifest, chunksFor } from "./compose-samples.js";
import { synthVoice } from "./compose-io.js";

/** The melody instruments: ref = which recording (sounds/<set>/...), family = the synth stand-in, octave = played this many octaves up */
export const INSTRUMENTS = [
  { id: "accordion", name: "Accordion", ref: "gm:0:21", family: "organ" },
  { id: "fiddle", name: "Fiddle", ref: "vsco:violin", alt: "gm:0:40", family: "strings" },
  { id: "whistle", name: "Tin whistle", ref: "gm:0:74", family: "winds", octave: 1 },
  { id: "flute", name: "Flute", ref: "vsco:flute", alt: "gm:0:73", family: "winds" },
  { id: "concertina", name: "Concertina (reed)", ref: "gm:0:23", family: "organ" },
  { id: "piano", name: "Piano", ref: "gm:0:0", family: "piano" },
  { id: "banjo", name: "Banjo", ref: "gm:0:105", family: "pluck" },
  { id: "mandolin", name: "Mandolin", ref: "gm:16:25", alt: "gm:0:25", family: "pluck" },
  { id: "guitar", name: "Guitar", ref: "gm:0:25", family: "pluck" },
  { id: "clarinet", name: "Clarinet", ref: "vsco:clarinet", alt: "gm:0:71", family: "winds" },
  { id: "trumpet", name: "Trumpet", ref: "vsco:trumpet", alt: "gm:0:56", family: "brass" },
  { id: "harmonica", name: "Harmonica", ref: "gm:0:22", family: "winds" },
  { id: "tuba", name: "Tuba", ref: "vsco:tuba", alt: "gm:0:58", family: "bass" },
  { id: "bass", name: "Upright bass", ref: "vsco:contrabass-pizz", alt: "gm:0:32", family: "bass" },
];
export const MELODY_INSTRUMENTS = INSTRUMENTS.filter((i) => !["tuba", "bass"].includes(i.id));
/** Backing from the chord symbols: who plays the bass notes and who plays the chords */
export const BACKINGS = [
  { id: "off", name: "No backing" },
  { id: "oompah", name: "Oom-pah band", bass: "tuba", chord: "accordion" },
  { id: "guitar", name: "Guitar and bass", bass: "bass", chord: "guitar" },
  { id: "piano", name: "Piano", bass: "piano", chord: "piano" },
  { id: "banjo", name: "Banjo and bass", bass: "bass", chord: "banjo" },
];
export const instrumentById = (id) => INSTRUMENTS.find((i) => i.id === id) || INSTRUMENTS[0];

const BASE = (() => { try { return new URL("./sounds/", import.meta.url).href; } catch { return "./sounds/"; } })();
const CACHE = "encore-sounds-v1"; // shared with Compose, so sounds loaded there are already here
// level trims (dB) so the recordings sit together; the same numbers Compose measured where they overlap
const TRIM = { "gm:0:0": 13.5, "gm:0:25": 6.9, "gm:0:105": 1, "gm:16:25": 1.1, "vsco:violin": 1.2, "vsco:flute": 12, "vsco:clarinet": 6.4, "vsco:trumpet": 3.4, "vsco:tuba": 6.9, "vsco:contrabass-pizz": -0.4, "gm:0:21": 1, "gm:0:23": 0, "gm:0:74": 6, "gm:0:22": 2 };
const trimFor = (ref) => 10 ** ((TRIM[ref] ?? (ref.startsWith("gm:") ? 4 : 0)) / 20);
const TAU = (t) => Math.max(0.004, t / 11.5);
const velCurve = (v) => Math.pow(Math.max(1, Math.min(127, v)) / 127, 1.7);

let oggOK = null;
const banks = new Map();
async function getBytes(url) {
  let cache = null;
  try { cache = typeof caches !== "undefined" ? await caches.open(CACHE) : null; } catch { cache = null; }
  if (cache) { try { const hit = await cache.match(url); if (hit) return new Uint8Array(await hit.arrayBuffer()); } catch {} }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  if (cache) try { await cache.put(url, new Response(buf.slice(), { headers: { "Content-Type": "application/octet-stream" } })); } catch {}
  return buf;
}
const decoders = new Map();
function decode(bytes, rate) {
  if (!decoders.has(rate)) decoders.set(rate, new OfflineAudioContext(1, 1, rate));
  const c = decoders.get(rate);
  return new Promise((ok, bad) => { const p = c.decodeAudioData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), ok, bad); if (p && p.then) p.then(ok, bad); });
}
class Bank {
  constructor(ref) { this.ref = ref; this.m = null; this.failed = false; this.buffers = new Map(); this.loads = new Map(); this.ready = this.load(); }
  async load() {
    try {
      if (typeof OfflineAudioContext === "undefined") throw new Error("no decoder");
      const r = await fetch(BASE + manifestPath(this.ref));
      if (!r.ok) throw new Error(String(r.status));
      const m = await r.json();
      if (!validManifest(m)) throw new Error("bad manifest");
      this.m = m;
    } catch { this.failed = true; }
    return this;
  }
  async prepare(notes) {
    await this.ready;
    if (this.failed || oggOK === false) return this;
    await Promise.all(chunksFor(this.m, notes).map((c) => this.chunk(c)));
    return this;
  }
  chunk(c) {
    if (!this.loads.has(c)) {
      this.loads.set(c, (async () => {
        const url = BASE + this.ref.split(":")[0] + "/" + this.m.chunks[c].file;
        let bytes;
        try { bytes = await getBytes(url); } catch { this.loads.delete(c); return; }
        await Promise.all(this.m.samples.map((s, i) => [s, i]).filter(([s]) => s.c === c).map(async ([s, i]) => {
          try { this.buffers.set(i, await decode(bytes.subarray(s.o, s.o + s.n), s.rate)); if (oggOK === null) oggOK = true; }
          catch { if (oggOK === null) oggOK = false; }
        }));
      })());
    }
    return this.loads.get(c);
  }
  zones(midi, vel) { return this.m && !this.failed && oggOK !== false ? zonesFor(this.m, midi, vel) : []; }
  has(zs) { return zs.length > 0 && zs.every((z) => this.buffers.has(z.s)); }
}
function bank(ref) { if (!banks.has(ref)) banks.set(ref, new Bank(ref)); return banks.get(ref); }
// a recording that won't load falls back to its General MIDI twin
function liveBank(inst) { const b = bank(inst.ref); return b.failed && inst.alt ? bank(inst.alt) : b; }

/**
 * The sound engine. -> { ctx, begin(), end(fade), prepare(id, notes), play(id, note), click(t, accent), ready(id, notes), credits }
 * note: { midi, vel (1..127), time (context seconds), dur (seconds) }
 */
export function createSound() {
  let ctx = null, out = null, session = null;
  const synths = new Map();
  const audio = () => {
    if (!ctx) {
      ctx = new AudioContext({ latencyHint: "interactive" });
      const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.2;
      out = ctx.createGain(); out.gain.value = 0.9; out.connect(comp); comp.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  };
  const dest = () => { audio(); if (!session) begin(); return session; };
  function begin() { audio(); session = ctx.createGain(); session.gain.value = 1; session.connect(out); return session; }
  /** Silence everything this playback scheduled (fade), and start a fresh bus for the next one */
  function end(fade = 0.03) {
    if (!session || !ctx) return;
    const g = session, t = ctx.currentTime;
    try { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.setTargetAtTime(0, t, fade); } catch {}
    setTimeout(() => { try { g.disconnect(); } catch {} }, fade * 8000 + 100);
    session = null;
  }
  function synthFor(inst) { if (!synths.has(inst.family)) synths.set(inst.family, synthVoice(inst.family)); return synths.get(inst.family); }
  async function prepare(id, notes = [{ midi: 72, vel: 90 }]) {
    const inst = instrumentById(id), oct = 12 * (inst.octave || 0);
    const list = notes.map((n) => ({ midi: n.midi + oct, vel: n.vel ?? 90 }));
    const b = bank(inst.ref); await b.ready;
    await liveBank(inst).prepare(list);
    return ready(id, notes);
  }
  function ready(id, notes) {
    const inst = instrumentById(id), oct = 12 * (inst.octave || 0), b = liveBank(inst);
    return !!b.m && notes.every((n) => b.has(b.zones(n.midi + oct, n.vel ?? 90)));
  }
  function play(id, n, gainMul = 1) {
    const c = audio(), d = dest(), inst = instrumentById(id);
    const midi = n.midi + 12 * (inst.octave || 0), vel = n.vel ?? 90, at = Math.max(c.currentTime, n.time ?? c.currentTime), dur = Math.max(0.03, n.dur || 0.3);
    const b = liveBank(inst), zs = b.zones(midi, vel);
    if (!b.has(zs)) {
      if (b.m && !b.failed) b.prepare([{ midi, vel }]);
      return synthFor(inst).play(c, d, { midi, vel, time: at, dur, gain: gainMul * 0.8 });
    }
    const m = b.m, all = 0.62 * trimFor(b.ref) * (m.gain ?? 1) * velCurve(vel) * gainMul;
    for (const z of zs) {
      const s = m.samples[z.s], src = c.createBufferSource();
      src.buffer = b.buffers.get(z.s);
      src.playbackRate.value = rateFor(z, midi);
      const ls = (s.ls ?? -1) + (z.ls || 0), le = (s.le ?? -1) + (z.le || 0);
      if ((z.mode === 1 || z.mode === 3) && ls >= 0 && le > ls + 8) { src.loop = true; src.loopStart = ls / s.rate; src.loopEnd = le / s.rate; }
      let node = src;
      if (z.fc && z.fc < 16000) { const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = Math.max(80, z.fc * 2 ** (-(1 - vel / 127) * 2)); lp.Q.value = z.q || 0.0001; node.connect(lp); node = lp; }
      const g = c.createGain(); node.connect(g); g.connect(d);
      const e = z.env, peak = all * z.gain, t0 = at + e.delay;
      g.gain.setValueAtTime(e.attack > 0.001 ? 0 : peak, at);
      if (e.attack > 0.001) g.gain.linearRampToValueAtTime(peak, t0 + e.attack); else g.gain.setValueAtTime(peak, t0);
      if (e.decay > 0 && e.sustain < 0.999) g.gain.setTargetAtTime(peak * e.sustain, t0 + e.attack + e.hold, TAU(e.decay));
      const rel = Math.max(0.03, Math.min(1.2, e.release));
      const stopAt = Math.max(at + 0.02, at + dur);
      g.gain.setTargetAtTime(0, stopAt, TAU(rel) * 1.5);
      src.start(at); src.stop(stopAt + rel + 0.1);
    }
    return true;
  }
  /** A short click at time t (accent: the first beat of a bar; count: the count-in, a little louder) */
  function click(t, accent = false, vol = 0.5) {
    const c = audio(), o = c.createOscillator(), g = c.createGain();
    o.type = "square"; o.frequency.value = accent ? 1760 : 1175;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol * (accent ? 0.42 : 0.26), t + 0.001); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    o.connect(g); g.connect(dest()); o.start(t); o.stop(t + 0.06);
  }
  return { get ctx() { return audio(); }, now: () => audio().currentTime, begin, end, prepare, ready, play, click, samplesOK: () => oggOK !== false };
}
