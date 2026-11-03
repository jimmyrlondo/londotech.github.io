// ENCORE. Compose: sound and input. The instruments (synth voices now, with a
// slot for each to be replaced by samples later), a small mixer with a part bus
// each (volume, pan) and a reverb send, a scheduler that streams a performance
// (compose-play.js) in chunks with loop support, offline rendering to WAV, MP3
// and the rest, plus MIDI keyboards, the computer keyboard as a piano, the mic
// and a metronome click. Times are AudioContext seconds, so recorded notes, the
// click and playback all share one clock.
import { perform, performanceLength } from "./compose-play.js";

let ctx = null, graph = null;
export function audio() {
  if (!ctx) { ctx = new AudioContext({ latencyHint: "interactive" }); graph = buildGraph(ctx); }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}
export const now = () => audio().currentTime;

// ---------- the mixer: part buses into a dry/reverb mix, a gentle compressor at the end ----------
/** The signal path for one AudioContext (live or offline): { input, reverb, bus(part, { volume, pan }) } */
export function buildGraph(c) {
  const comp = c.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.2;
  const master = c.createGain(); master.gain.value = 1; master.connect(comp); comp.connect(c.destination);
  const reverb = makeReverb(c); reverb.output.connect(master);
  const input = c.createGain(); input.connect(master); input.connect(reverb.input);
  const buses = new Map();
  const bus = (part = -1, o = {}) => {
    if (buses.has(part)) { const b = buses.get(part); if (o.volume !== undefined) b.gain.gain.value = o.volume / 0.8; if (o.pan !== undefined && b.pan) b.pan.pan.value = o.pan; return b.gain; }
    const gain = c.createGain(); gain.gain.value = (o.volume ?? 0.8) / 0.8;
    let pan = null;
    if (c.createStereoPanner) { pan = c.createStereoPanner(); pan.pan.value = o.pan ?? 0; gain.connect(pan); pan.connect(master); pan.connect(reverb.input); }
    else { gain.connect(master); gain.connect(reverb.input); }
    buses.set(part, { gain, pan });
    return gain;
  };
  return { input, reverb, master, bus };
}
// a small hall without an impulse response: four damped feedback delays in parallel, then two allpass smears
function makeReverb(c) {
  const input = c.createGain(); input.gain.value = 0.16;
  const output = c.createGain(); output.gain.value = 0.55;
  const pre = c.createDelay(0.1); pre.delayTime.value = 0.018; input.connect(pre);
  const ap1 = c.createBiquadFilter(), ap2 = c.createBiquadFilter();
  ap1.type = ap2.type = "allpass"; ap1.frequency.value = 900; ap2.frequency.value = 2400; ap1.connect(ap2); ap2.connect(output);
  [0.0297, 0.0371, 0.0411, 0.0437].forEach((d, i) => {
    const dl = c.createDelay(0.2), fb = c.createGain(), lp = c.createBiquadFilter();
    dl.delayTime.value = d * 1.6; fb.gain.value = 0.78 - i * 0.02; lp.type = "lowpass"; lp.frequency.value = 3600 - i * 300;
    pre.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(ap1);
  });
  return { input, output };
}
/** Where a part sits left to right when the score doesn't say: spread around the middle */
export const defaultPan = (i, n) => (n <= 1 ? 0 : Math.max(-0.5, Math.min(0.5, (i / (n - 1) - 0.5) * (n === 2 ? 0.6 : 1))));

// ---------- the instruments ----------
// Each family is a small synth patch. An instrument is anything with play(ctx, dest, note) -> a handle
// { at, stop(t) } (and g/oscs for the synth): a sample player can be registered for a family or a name
// with registerInstrument and nothing else changes.
const FAMILIES = {
  piano: { osc: [["triangle", 1, 1], ["sine", 2.002, 0.22], ["sine", 3.01, 0.06]], a: 0.004, d1: 0.09, s1: 0.55, d2: 1.6, s2: 0.0, rel: 0.12, bright: 7, velBright: 1 },
  strings: { osc: [["sawtooth", 1, 0.5], ["sawtooth", 1.0045, 0.4], ["sawtooth", 0.9962, 0.3]], a: 0.11, sus: 1, rel: 0.3, bright: 2.8, vib: 5.4, vibDepth: 0.0045, swells: true },
  brass: { osc: [["sawtooth", 1, 1], ["square", 1, 0.12]], a: 0.04, d1: 0.18, s1: 0.82, rel: 0.12, bright: 4.6, swell: true, swells: true },
  winds: { osc: [["triangle", 1, 1], ["sine", 2, 0.28], ["sine", 3, 0.1]], a: 0.05, sus: 1, rel: 0.1, bright: 5, vib: 4.9, vibDepth: 0.003, swells: true, breath: true },
  pluck: { osc: [["sawtooth", 1, 0.6], ["triangle", 1, 0.55]], a: 0.002, d1: 0.06, s1: 0.5, d2: 0.9, s2: 0, rel: 0.1, bright: 9, pluck: true },
  bass: { osc: [["triangle", 1, 1], ["sine", 1, 0.7], ["sawtooth", 1, 0.1]], a: 0.006, d1: 0.15, s1: 0.65, d2: 1.6, s2: 0.2, rel: 0.09, bright: 3 },
  organ: { osc: [["sine", 1, 1], ["sine", 2, 0.55], ["sine", 3, 0.3], ["sine", 4, 0.18], ["sine", 8, 0.06]], a: 0.012, sus: 1, rel: 0.06, bright: 10 },
  voice: { osc: [["sine", 1, 1], ["triangle", 1, 0.3], ["sine", 2, 0.12]], a: 0.08, sus: 1, rel: 0.2, bright: 2.6, vib: 5.6, vibDepth: 0.006, swells: true, formant: true },
  mallets: { osc: [["sine", 1, 1], ["sine", 3.99, 0.25], ["sine", 10.1, 0.05]], a: 0.002, d1: 0.05, s1: 0.4, d2: 1.1, s2: 0, rel: 0.5, bright: 12, pluck: true },
  pizz: { osc: [["triangle", 1, 1], ["sine", 2, 0.3]], a: 0.002, d1: 0.04, s1: 0.35, d2: 0.35, s2: 0, rel: 0.08, bright: 5, pluck: true },
  harmonic: { osc: [["sine", 1, 1], ["sine", 2, 0.05]], a: 0.02, d1: 0.3, s1: 0.6, d2: 2.5, s2: 0.2, rel: 0.3, bright: 3 },
};
/** The family for an instrument name (from tunings.js or the page's extras) */
export function soundFor(name = "") {
  const n = name.toLowerCase();
  if (/organ/.test(n)) return "organ";
  if (/voice|choir|vocal/.test(n)) return "voice";
  if (/violin|viola|cello|fiddle|double bass|nyckelharpa|gamba|erhu|hurdy/.test(n)) return "strings";
  if (/trumpet|cornet|flugel|horn|mellophone|trombone|euphonium|tuba/.test(n)) return "brass";
  if (/flute|piccolo|oboe|clarinet|bassoon|saxophone|english horn/.test(n)) return "winds";
  if (/bass/.test(n)) return "bass";
  if (/kalimba|marimba|xylophone|vibra|glock|timpani|harp/.test(n)) return "mallets";
  if (/guitar|ukulele|banjo|mandol|lute|bouzouki|oud|dulcimer|balalaika|domra|charango|cavaquinho|cuatro|tres|vihuela|tiple|bandurria|laud|pipa|ruan|shamisen|koto|kantele|dobro|steel|guitalele|requinto|bajo|guitarron/.test(n)) return "pluck";
  return "piano";
}
const velGain = (v) => Math.pow(Math.max(1, Math.min(127, v)) / 127, 1.5);
/**
 * A synth voice for a family. play(c, dest, note): note = { midi, vel (1..127), velEnd, time (context seconds),
 * dur (seconds; 0 = held until stop), legato, muted, sound ("pizz" | "harmonic" | "bright" | "dark"), bend: { to, at } }.
 */
export function synthVoice(family) {
  return {
    family,
    play(c, dest, n) {
      const P = FAMILIES[n.sound === "pizz" || n.sound === "harmonic" ? n.sound : family] || FAMILIES.piano;
      const at = Math.max(c.currentTime, n.time ?? c.currentTime), f = 440 * 2 ** ((n.midi - 69) / 12), v = n.vel ?? 90, dur = n.dur || 0;
      const g = c.createGain(), lp = c.createBiquadFilter();
      lp.type = "lowpass"; lp.Q.value = 0.6;
      // brightness follows how hard the note is played; muted and sul tasto are darker, sul pont. brighter
      const bright = P.bright * (n.muted ? 0.4 : n.sound === "dark" ? 0.55 : n.sound === "bright" ? 1.8 : 1) * (0.45 + (v / 127) * 0.9);
      const cut = Math.min(14000, 450 + f * bright);
      lp.frequency.setValueAtTime(cut, at);
      if (P.pluck) lp.frequency.setTargetAtTime(Math.min(14000, 300 + f * 2.2), at + 0.008, 0.18);
      if (P.swell) { lp.frequency.setValueAtTime(350 + f, at); lp.frequency.linearRampToValueAtTime(cut, at + 0.07 + (1 - v / 127) * 0.06); }
      let tail = lp;
      if (P.formant) { const bp = c.createBiquadFilter(); bp.type = "peaking"; bp.frequency.value = 800; bp.Q.value = 1.4; bp.gain.value = 6; lp.connect(bp); tail = bp; }
      const oscs = P.osc.map(([type, mul, lvl]) => { const o = c.createOscillator(), og = c.createGain(); o.type = type; o.frequency.setValueAtTime(f * mul, at); og.gain.value = lvl; o.connect(og); og.connect(lp); return o; });
      // a slide to another note (glissando) across the end of the note
      if (n.bend && dur) { const tf = 440 * 2 ** ((n.bend.to - 69) / 12); oscs.forEach((o, i) => { const mul = P.osc[i][1]; o.frequency.setValueAtTime(f * mul, at + dur * (n.bend.at ?? 0.35)); o.frequency.exponentialRampToValueAtTime(tf * mul, at + dur); }); }
      // vibrato that comes in after the note settles (not for short notes)
      if (P.vib && (!dur || dur > 0.25)) {
        const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = P.vib * (0.96 + ((n.midi * 7) % 9) / 100);
        lg.gain.setValueAtTime(0, at); lg.gain.linearRampToValueAtTime(f * P.vibDepth, at + 0.45);
        lfo.connect(lg); for (const o of oscs) lg.connect(o.frequency); oscs.push(lfo);
      }
      // a breath of noise at the start of a wind note
      if (P.breath && !n.legato) { const nb = c.createBufferSource(), buf = c.createBuffer(1, Math.round(c.sampleRate * 0.08), c.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length); nb.buffer = buf; const ng = c.createGain(); ng.gain.value = 0.05 * (v / 127); nb.connect(ng); ng.connect(lp); oscs.push(nb); }
      tail.connect(g); g.connect(dest);
      const peak = 0.34 * velGain(v) * (n.gain ?? 1) * Math.min(1, 1.25 - (n.midi - 60) / 90) / Math.sqrt(P.osc.length * 0.6) * (n.muted ? 0.7 : 1);
      // a slurred note slides in (no new attack); everything else speaks with its family's attack
      const attack = n.legato ? Math.max(P.a, 0.03) : P.a;
      g.gain.setValueAtTime(n.legato ? peak * 0.35 : 0, at); g.gain.linearRampToValueAtTime(peak, at + attack);
      if (P.d1) { g.gain.setTargetAtTime(peak * P.s1, at + attack, P.d1); if (P.d2) g.gain.setTargetAtTime(peak * (P.s2 ?? 0), at + attack + P.d1 * 3, P.d2); }
      // a held note under a hairpin keeps swelling or fading to where the hairpin goes
      else if (P.swells && dur > 0.3 && n.velEnd && Math.abs(n.velEnd - v) > 3) g.gain.linearRampToValueAtTime(peak * velGain(n.velEnd) / velGain(v), at + dur);
      for (const o of oscs) o.start(at);
      const h = { g, oscs, at, rel: P.rel, stop(t) { release(h, t); } };
      if (dur) release(h, at + dur);
      return h;
    },
  };
}
function release(h, t) {
  const when = Math.max(t, h.at + 0.02);
  h.g.gain.cancelScheduledValues(when); h.g.gain.setTargetAtTime(0, when, h.rel);
  for (const o of h.oscs) try { o.stop(when + h.rel * 8 + 0.1); } catch {}
}
const custom = new Map(); // a name or family -> an instrument (a sample player, later)
/** Use another instrument (a sample player) for an instrument name or a whole family */
export function registerInstrument(nameOrFamily, instrument) { custom.set(String(nameOrFamily).toLowerCase(), instrument); }
/** The instrument that plays a part: a registered one for its name or family, or the family's synth voice */
export function voiceFor(instrumentName = "") {
  const fam = soundFor(instrumentName);
  return custom.get(String(instrumentName).toLowerCase()) || custom.get(fam) || synthVoice(fam);
}

// ---------- notes now (the piano, MIDI keyboards, previews) ----------
const live = new Map();
// notes scheduled ahead (playback): kept so Stop can silence the ones still to come
const scheduled = new Set();
const track = (h) => { scheduled.add(h); if (h.oscs?.[0]) h.oscs[0].onended = () => scheduled.delete(h); return h; };
/** Sound a note now (or at time t) until noteOff, or for dur seconds. opts: { sound (a family), gain, part } */
export function noteOn(midi, vel = 0.8, t = 0, dur = 0, opts = {}) {
  const a = audio(), v = FAMILIES[opts.sound] ? synthVoice(opts.sound) : voiceFor(opts.instrument || "");
  const h = v.play(a, opts.part !== undefined ? graph.bus(opts.part) : graph.input, { midi, vel: vel <= 1 ? vel * 127 : vel, time: t || a.currentTime, dur, gain: opts.gain ?? 1 });
  if (dur) { track(h); return null; }
  noteOff(midi); live.set(midi, h);
  return h;
}
export function noteOff(midi, t = 0) { const h = live.get(midi); if (h) { live.delete(midi); h.stop(t || audio().currentTime); } }
export function allOff() {
  for (const m of [...live.keys()]) noteOff(m);
  stopStreams();
  // everything scheduled: fade out now, and the notes that haven't started yet never will
  const now = audio().currentTime;
  for (const h of scheduled) {
    try { if (h.g) { h.g.gain.cancelScheduledValues(now); h.g.gain.setValueAtTime(h.at > now ? 0 : h.g.gain.value, now); h.g.gain.setTargetAtTime(0, now, 0.015); } } catch {}
    if (h.oscs) for (const o of h.oscs) try { o.stop(now + 0.08); } catch {}
    else try { h.stop(now); } catch {}
  }
  scheduled.clear();
}

// ---------- playing a performance: streamed a little ahead, looped if asked ----------
const streams = new Set();
function stopStreams() { for (const s of streams) s.cancel(); streams.clear(); }
/**
 * Play performance events (compose-play.js perform) from context time t0.
 * opts: { t0, parts: [{ instrument, volume, pan }] (by part index), loop: { start, end } (performance seconds),
 * lookahead (seconds, default 1.2), onEnd } -> { t0, stop(), timeAt(contextTime) -> performance seconds }.
 * Only what's due in the next lookahead is scheduled, so a long score starts at once; Stop (or allOff) cancels it all.
 */
export function playEvents(events, opts = {}) {
  const a = audio(), t0 = opts.t0 ?? a.currentTime + 0.1, look = opts.lookahead ?? 1.2, parts = opts.parts || [];
  const voices = new Map(), voiceOf = (p) => { if (!voices.has(p)) voices.set(p, voiceFor(parts[p]?.instrument || "")); return voices.get(p); };
  parts.forEach((p, i) => graph.bus(i, { volume: p.volume ?? 0.8, pan: p.pan ?? defaultPan(i, parts.length) }));
  const loop = opts.loop && opts.loop.end > opts.loop.start ? opts.loop : null;
  const list = loop ? events.filter((e) => e.time >= loop.start && e.time < loop.end) : events;
  const len = loop ? loop.end - loop.start : performanceLength(events);
  let i = 0, cycle = 0, timer = 0, done = false;
  const s = {
    t0,
    cancel() { done = true; clearTimeout(timer); },
    stop() { s.cancel(); allOff(); },
    timeAt(ct) { const t = ct - t0; return loop ? loop.start + (((t % len) + len) % len) : t; },
  };
  const pump = () => {
    if (done) return;
    const horizon = a.currentTime + look;
    while (!done) {
      if (i >= list.length) {
        if (!loop) break;
        i = 0; cycle++;
      }
      const e = list[i], when = t0 + (loop ? cycle * len + (e.time - loop.start) : e.time);
      if (when > horizon) break;
      i++;
      if (when + e.dur < a.currentTime) continue;
      // in a loop, a note that runs past the loop end is cut there
      const dur = loop ? Math.min(e.dur, loop.end - e.time + 0.05) : e.dur;
      track(voiceOf(e.part).play(a, graph.bus(e.part), { ...e, time: when, dur }));
    }
    if (!loop && i >= list.length) { const endAt = t0 + len; timer = setTimeout(() => { if (!done) { done = true; streams.delete(s); opts.onEnd?.(); } }, Math.max(0, (endAt - a.currentTime) * 1000 + 300)); return; }
    timer = setTimeout(pump, 120);
  };
  streams.add(s);
  pump();
  return s;
}
/** Perform a score and play it: the whole thing in one call. opts as perform() plus playEvents() */
export function playScore(score, opts = {}) {
  const events = perform(score, opts);
  const parts = score.parts.map((p, i) => ({ instrument: p.instrument, volume: p.volume ?? 0.8, pan: p.pan ?? defaultPan(i, score.parts.length) }));
  return { events, player: playEvents(events, { ...opts, parts }) };
}

// ---------- rendering to a file ----------
/**
 * The score as audio, offline (faster than real time): opts { parts: [indexes] (default all), sampleRate (48000),
 * from, swing, humanize, seed, tail (seconds of reverb after the last note, 2.5), normalize (peak in dBFS, default -1;
 * null leaves the level as played, which keeps stems in balance with each other) } -> AudioBuffer (stereo).
 */
export async function renderAudio(score, opts = {}) {
  const events = perform(score, { ...opts, all: opts.all ?? !opts.parts });
  const keep = opts.parts ? events.filter((e) => opts.parts.includes(e.part)) : events;
  const fs = opts.sampleRate || 48000, secs = Math.max(0.5, performanceLength(keep) + (opts.tail ?? 2.5));
  const oc = new OfflineAudioContext(2, Math.ceil(secs * fs), fs), g = buildGraph(oc);
  const n = score.parts.length, voices = score.parts.map((p) => voiceFor(p.instrument));
  score.parts.forEach((p, i) => g.bus(i, { volume: p.volume ?? 0.8, pan: p.pan ?? defaultPan(i, n) }));
  for (const e of keep) voices[e.part].play(oc, g.bus(e.part), { ...e, time: e.time + 0.05 });
  const buf = await oc.startRendering();
  const target = opts.normalize === undefined ? -1 : opts.normalize;
  if (target !== null) {
    let pk = 0; for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > pk) pk = a; } }
    const gain = pk > 0 ? 10 ** (target / 20) / pk : 1;
    for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] *= gain; }
  }
  return buf;
}
/** One buffer per part (stems): [{ part, name, buffer }] */
export async function renderStems(score, opts = {}) {
  const out = [];
  // stems keep the mix's own levels (not each normalized), so they add back up to the mix
  for (let i = 0; i < score.parts.length; i++) out.push({ part: i, name: score.parts[i].name || `Part ${i + 1}`, buffer: await renderAudio(score, { normalize: null, ...opts, parts: [i], all: true }) });
  return out;
}
/** WAV file bytes from channels: bits 16 or 24 (PCM, dithered by rounding) or 32 (float). Pure, so node tests it. */
export function wavBytes(chans, fs, bits = 24) {
  const ch = chans.length, n = chans[0].length, bps = bits / 8, data = n * ch * bps, out = new Uint8Array(44 + data), dv = new DataView(out.buffer);
  const tag = (o, s) => { for (let i = 0; i < 4; i++) out[o + i] = s.charCodeAt(i); };
  tag(0, "RIFF"); dv.setUint32(4, 36 + data, true); tag(8, "WAVE"); tag(12, "fmt "); dv.setUint32(16, 16, true);
  dv.setUint16(20, bits === 32 ? 3 : 1, true); dv.setUint16(22, ch, true); dv.setUint32(24, fs, true); dv.setUint32(28, fs * ch * bps, true);
  dv.setUint16(32, ch * bps, true); dv.setUint16(34, bits, true); tag(36, "data"); dv.setUint32(40, data, true);
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) {
    const x = Math.max(-1, Math.min(1, chans[c][i]));
    if (bits === 32) dv.setFloat32(o, chans[c][i], true);
    else if (bits === 16) dv.setInt16(o, Math.round(x * 32767), true);
    else { const v = Math.round(x * 8388607); out[o] = v & 255; out[o + 1] = (v >> 8) & 255; out[o + 2] = (v >> 16) & 255; }
    o += bps;
  }
  return out;
}
/** An AudioBuffer as a WAV Blob */
export function toWav(buffer, bits = 24) {
  const chans = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
  return new Blob([wavBytes(chans, buffer.sampleRate, bits)], { type: "audio/wav" });
}
/**
 * An AudioBuffer as any format Convert makes (MP3, FLAC, Apple Lossless, AAC, Opus, Ogg Vorbis, WAV...) through
 * convert-worker.js: presetId from convert-core PRESETS ("mp3-320", "flac", ...), meta = tags. -> Blob
 */
export async function encodeAudio(buffer, presetId = "mp3-320", meta = {}, onProgress = null) {
  const { PRESETS, plan } = await import("./convert-core.js");
  const preset = PRESETS.find((p) => p.id === presetId) || PRESETS[0];
  const chans = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c).slice());
  const pl = plan(preset, { fs: buffer.sampleRate, channels: chans.length, bitDepth: 32, float: true, lossy: false });
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL("convert-worker.js", import.meta.url), { type: "module" });
    w.onmessage = (e) => { const m = e.data; if (m.type === "progress") return onProgress?.(m.pct); w.terminate(); m.type === "done" ? resolve(m.blob) : reject(new Error(m.message)); };
    w.onerror = (e) => { w.terminate(); reject(new Error(e.message || "The encoder stopped.")); };
    w.postMessage({ chans, fs: buffer.sampleRate, plan: pl, opts: { start: 0, end: 0, fadeIn: 0, fadeOut: 0, normalize: "off" }, meta, art: null }, chans.map((c) => c.buffer));
  });
}

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
