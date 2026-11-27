// ENCORE. Learning Tracks: the sound. Each voice part is rendered once (offline, faster than
// real time) into a mono stem at the chosen tempo, with Compose's instruments (recorded piano,
// choir "ah" and voice "oo" samples from sounds/, or a synth voice). Playback and every export
// mix those stems (parts-core.js mixLevels / mixTrack), so switching parts is instant and a
// part never bleeds into the other side of a panned track. MP3 goes through mp3-worker.js.
import { voiceFor, synthVoice, wavBytes } from "./compose-io.js";
import { learnVel, tempoScale, stemLength, levelGain } from "./parts-core.js";

/** Silence at the top of every stem (so the first note's attack is whole); song time 0 is here */
export const PRE = 0.03;
export const SR = 44100;
export const SOUNDS = {
  piano: { label: "Piano", inst: "Piano" },
  ah: { label: 'Choir "ah"', inst: "Choir" },
  oo: { label: 'Voice "oo"', inst: "Voice" },
  synth: { label: "Synth voice", synth: "voice" },
};
function instrumentFor(sound, part) {
  if (part.role === "accomp") return voiceFor("Piano");
  const s = SOUNDS[sound] || SOUNDS.piano;
  return s.synth ? synthVoice(s.synth) : voiceFor(s.inst);
}
// a small room: decaying noise, darker as it fades (no impulse-response file needed)
function roomIR(c) {
  const n = Math.round(c.sampleRate * 1.1), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
  let seed = 11, lp = 0;
  for (let i = 0; i < n; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const t = i / c.sampleRate, white = seed / 2147483648 - 1, k = 0.35 + 0.6 * Math.exp(-t / 0.3);
    lp += k * (white - lp);
    d[i] = lp * Math.exp(-t / 0.26) * (i < c.sampleRate * 0.012 ? i / (c.sampleRate * 0.012) : 1);
  }
  return buf;
}
/**
 * One part as a mono AudioBuffer at a tempo (percent): opts { sound, tempo, room, length (samples), sr }.
 * Samples load first (the synth covers any that can't). The stem is level-matched (parts-core levelGain).
 */
export async function renderStem(song, part, opts = {}) {
  const sr = opts.sr || SR, k = tempoScale(opts.tempo || 100), len = opts.length || stemLength(song, opts.tempo || 100, sr, 2) + Math.ceil(PRE * sr);
  const oc = new OfflineAudioContext(1, len, sr), inst = instrumentFor(opts.sound, part);
  const notes = part.events.map((e) => ({ midi: e.midi, vel: learnVel(e.vel), time: PRE + e.time * k, dur: Math.max(0.06, e.dur * k) }));
  try { await inst.prepare?.(notes); } catch {}
  const dry = oc.createGain(); dry.connect(oc.destination);
  if (opts.room) {
    const cv = oc.createConvolver(), wet = oc.createGain();
    cv.normalize = true; cv.buffer = roomIR(oc); wet.gain.value = 0.2;
    dry.connect(cv); cv.connect(wet); wet.connect(oc.destination);
  }
  for (const n of notes) inst.play(oc, dry, n);
  const buf = await oc.startRendering();
  // every part equally loud (instruments are louder low than high)
  const d = buf.getChannelData(0), g = levelGain(d);
  if (g !== 1) for (let i = 0; i < d.length; i++) d[i] *= g;
  return buf;
}
/** Stereo float channels as an MP3 Blob (kbps 128..320) on a worker */
export function encodeMp3(l, r, sr, kbps = 192, onProgress = null) {
  return new Promise((resolve, reject) => {
    const w = new Worker("mp3-worker.js");
    w.onmessage = (e) => { const m = e.data; if (m.type === "progress") return onProgress?.(m.pct / 100); w.terminate(); resolve(new Blob([m.mp3], { type: "audio/mpeg" })); };
    w.onerror = (e) => { w.terminate(); reject(new Error(e.message || "The MP3 encoder stopped.")); };
    w.postMessage({ l, r, fs: sr, kbps });
  });
}
/** Stereo float channels as a 16-bit WAV Blob */
export const encodeWav = (l, r, sr) => new Blob([wavBytes([l, r], sr, 16)], { type: "audio/wav" });
