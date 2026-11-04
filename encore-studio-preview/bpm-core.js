// Encore Metronome: finding a song's tempo, from your taps or by listening to
// it (the mic or a file). No page in here, so node can test it (test-metronome.mjs).
import { fft } from './tune-core.js';

/**
 * Tempo from taps (ms timestamps): a straight line fitted through every tap, so the answer
 * keeps getting more exact the longer you tap (instead of averaging the last few gaps).
 * A tap that's way off (more than a third of a beat) is left out. null until 3 taps.
 */
export function tapTempo(times) {
  if (times.length < 3) return null;
  const gaps = times.slice(1).map((t, i) => t - times[i]).sort((a, b) => a - b);
  const beat = gaps[gaps.length >> 1];
  // number each tap by the beats since the first (a missed tap still lands on the right beat)
  const pts = times.map(t => ({ t, n: Math.round((t - times[0]) / beat) }));
  let fit = line(pts);
  const kept = pts.filter(p => Math.abs(p.t - (fit.a + fit.b * p.n)) < fit.b / 3);
  if (kept.length >= 3 && kept.length < pts.length) fit = line(kept);
  const used = kept.length >= 3 ? kept : pts;
  const spread = Math.sqrt(used.reduce((s, p) => s + (p.t - (fit.a + fit.b * p.n)) ** 2, 0) / used.length);
  return { bpm: 60000 / fit.b, taps: times.length, used: used.length, spreadMs: spread };
}
function line(pts) {
  const n = pts.length, mx = pts.reduce((s, p) => s + p.n, 0) / n, my = pts.reduce((s, p) => s + p.t, 0) / n;
  let sxy = 0, sxx = 0;
  for (const p of pts) { sxy += (p.n - mx) * (p.t - my); sxx += (p.n - mx) ** 2; }
  const b = sxx > 0 ? sxy / sxx : 500;
  return { a: my - b * mx, b };
}

/**
 * Listens to music and finds its tempo: how much new sound starts in each 1/100 s
 * (spectral flux), then the beat spacing that lines up with those starts best.
 * push() any amount of mono audio at a time; estimate() whenever you like.
 */
const CONF_LOW = 2.5, CONF_HIGH = 6;

export class TempoFinder {
  constructor(sampleRate) {
    this.sr = sampleRate;
    this.hop = Math.round(sampleRate / 100);
    this.fps = sampleRate / this.hop;
    this.size = 2048;
    this.tail = new Float32Array(0);   // audio not analysed yet
    this.prev = null;
    this.env = [];
    this.win = Float64Array.from({ length: this.size }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (this.size - 1)));
  }
  get seconds() { return this.env.length / this.fps; }

  push(x) {
    const all = new Float32Array(this.tail.length + x.length);
    all.set(this.tail);
    all.set(x, this.tail.length);
    // a window of `size` samples every hop
    let pos = 0;
    for (; pos + this.size <= all.length; pos += this.hop) this.frame(all, pos);
    this.tail = all.slice(pos);
  }
  frame(x, at) {
    const re = new Float64Array(this.size), im = new Float64Array(this.size);
    for (let i = 0; i < this.size; i++) re[i] = x[at + i] * this.win[i];
    fft(re, im);
    // log magnitudes up to ~10 kHz: louder starts anywhere count, quiet ones still register
    const bins = Math.min(this.size / 2, Math.ceil(10000 * this.size / this.sr));
    const mag = new Float64Array(bins);
    for (let k = 1; k < bins; k++) mag[k] = Math.log(1 + 1000 * Math.hypot(re[k], im[k]));
    let flux = 0;
    if (this.prev) for (let k = 1; k < bins; k++) flux += Math.max(0, mag[k] - this.prev[k]);
    this.prev = mag;
    this.env.push(flux);
  }

  /** { bpm, confidence 0..1, others: [half, double] } once there are a few seconds, else null */
  estimate(minBpm = 60, maxBpm = 200) {
    if (this.seconds < 4) return null;
    // keep only the starts: take off a running average, and the negative part
    const n = this.env.length, e = new Float64Array(n), w = Math.round(this.fps * 0.5);
    let acc = 0;
    for (let i = 0; i < n; i++) {
      acc += this.env[i] - (i >= w ? this.env[i - w] : 0);
      e[i] = Math.max(0, this.env[i] - acc / Math.min(i + 1, w));
    }
    // score every spacing on a fine grid, at its best phase, with all the beats of the song
    const score = period => {
      let best = 0;
      const phases = Math.ceil(period);
      for (let ph = 0; ph < phases; ph += 1) {
        let s = 0, c = 0;
        for (let t = ph; t < n - 1; t += period) {
          const i = Math.floor(t), f = t - i;
          s += e[i] * (1 - f) + e[i + 1] * f;
          c++;
        }
        if (c && s / c > best) best = s / c;
      }
      return best;
    };
    // the beat plus the off-beats between (a real tempo has sound on both; at half the tempo,
    // the "off-beats" are the real beats, so that doesn't favour counting it slow)
    const total = bpm => {
      const p = this.fps * 60 / bpm;
      return score(p) + score(p / 2);
    };
    // a lean toward the tempos songs are usually counted in (about 90 to 160)
    const prior = bpm => Math.exp(-0.5 * (Math.log2(bpm / 120) / 0.9) ** 2);
    let best = minBpm, bestS = -1;
    const all = [];
    for (let bpm = minBpm; bpm <= maxBpm; bpm += 0.5) {
      const raw = total(bpm), s = raw * prior(bpm);
      all.push(raw);
      if (s > bestS) { bestS = s; best = bpm; }
    }
    for (let bpm = best - 0.5; bpm <= best + 0.5; bpm += 0.02) {
      const s = total(bpm) * prior(bpm);
      if (s > bestS) { bestS = s; best = bpm; }
    }
    // how sure: how far the winner stands above a typical tempo (a steady beat makes one clear peak;
    // random hits or slow chords score about the same at every tempo)
    const typical = [...all].sort((a, b) => a - b)[all.length >> 1] || 1e-9;
    const strength = total(best) / typical;
    const confidence = Math.max(0, Math.min(1, (strength - CONF_LOW) / (CONF_HIGH - CONF_LOW)));
    const others = [best / 2, best * 2].filter(b => b >= 40 && b <= 300);
    return { bpm: best, confidence, strength, others };
  }
}
