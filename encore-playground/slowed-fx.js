// ENCORE. Slowed + Reverb: the effect chain, built from Web Audio nodes. The same function builds the
// live preview (AudioContext) and the export (OfflineAudioContext), so the file sounds like the preview.
//
//   in -> bass shelf -> low-pass x2 ("underwater") -+-> dry -> rotating pan (8D) -+-> out
//                                                    +-> 180 Hz high-pass -> reverb -> wet -+
//   vinyl crackle ---------------------------------------------------------------------------+
import { REVERBS, makeIR, makeCrackle, lowpassHz, mixGains } from "./slowed-core.js";

const irCache = new Map();
function irBuffer(ctx, type, length) {
  const key = `${type}:${length.toFixed(2)}:${ctx.sampleRate}`;
  let chans = irCache.get(key);
  if (!chans) { chans = makeIR(type, ctx.sampleRate, length); irCache.set(key, chans); if (irCache.size > 6) irCache.delete(irCache.keys().next().value); }
  const b = ctx.createBuffer(2, chans[0].length, ctx.sampleRate);
  b.copyToChannel(chans[0], 0); b.copyToChannel(chans[1], 1);
  return b;
}
let crackleChans = null;

/** settings: see slowed-core DEFAULTS. Returns { input, output, set(settings, bypass), start(), irSeconds() }. */
export function buildFx(ctx, settings) {
  const g = (v = 1) => { const n = ctx.createGain(); n.gain.value = v; return n; };
  const input = g(), output = g();
  const bass = ctx.createBiquadFilter(); bass.type = "lowshelf"; bass.frequency.value = 110;
  const lp1 = ctx.createBiquadFilter(), lp2 = ctx.createBiquadFilter();
  lp1.type = lp2.type = "lowpass"; lp1.Q.value = 0.54; lp2.Q.value = 1.31; // a 4th-order Butterworth
  const dry = g(), wet = g(0);
  const send = ctx.createBiquadFilter(); send.type = "highpass"; send.Q.value = 0.707;
  const conv = ctx.createConvolver(); conv.normalize = false;
  const pan = ctx.createStereoPanner();
  const lfo = ctx.createOscillator(); lfo.type = "sine";
  const depth = g(0);
  const crackle = ctx.createBufferSource(), crackleGain = g(0);
  crackleChans ||= makeCrackle(44100);
  const cb = ctx.createBuffer(2, crackleChans[0].length, 44100);
  cb.copyToChannel(crackleChans[0], 0); cb.copyToChannel(crackleChans[1], 1);
  crackle.buffer = cb; crackle.loop = true;

  input.connect(bass); bass.connect(lp1); lp1.connect(lp2);
  lp2.connect(dry); dry.connect(pan); pan.connect(output);
  lp2.connect(send); send.connect(conv); conv.connect(wet); wet.connect(output);
  lfo.connect(depth); depth.connect(pan.pan);
  crackle.connect(crackleGain); crackleGain.connect(output);

  let irKey = "", cur = null;
  const nyq = ctx.sampleRate / 2;
  const fx = {
    input, output,
    set(s, bypass = false) {
      cur = s;
      const t = ctx.currentTime, tc = ctx instanceof OfflineAudioContext ? 0 : 0.03;
      const to = (param, v) => { if (tc) param.setTargetAtTime(v, t, tc); else param.value = v; };
      const live = !bypass;
      to(bass.gain, live ? s.bass : 0);
      const hz = live ? lowpassHz(s.underwater) : 0, f = hz ? Math.min(hz, nyq * 0.98) : nyq;
      to(lp1.frequency, f); to(lp2.frequency, f);
      const hasRev = live && s.reverb !== "off" && REVERBS[s.reverb] && s.mix > 0;
      const { dry: dg, wet: wg } = mixGains(hasRev ? s.mix : 0);
      to(dry.gain, dg); to(wet.gain, hasRev ? wg : 0);
      send.frequency.value = s.clean ? 180 : 20;
      if (s.reverb !== "off" && REVERBS[s.reverb]) {
        const k = `${s.reverb}:${s.length}`;
        if (k !== irKey) { irKey = k; conv.buffer = irBuffer(ctx, s.reverb, s.length); }
      }
      lfo.frequency.value = Math.max(0.01, s.rotate || 0.1);
      to(depth.gain, live && s.rotate > 0 ? 0.85 : 0);
      if (!(live && s.rotate > 0)) to(pan.pan, 0);
      to(crackleGain.gain, live ? s.crackle * 0.5 : 0);
    },
    start(at = 0) { lfo.start(at); crackle.start(at); },
    /** how long the reverb rings after the music stops */
    irSeconds() { return cur && cur.reverb !== "off" && REVERBS[cur.reverb] && cur.mix > 0 ? REVERBS[cur.reverb].T * cur.length * 1.15 + REVERBS[cur.reverb].pre : 0.05; },
  };
  fx.set(settings);
  return fx;
}
