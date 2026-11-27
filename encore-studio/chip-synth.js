// ENCORE. Chip: the sound chips themselves. Each channel runs at the chip's own clock (the
// waveform sequencers, the noise shift register, the 1-bit sample counter), and every change in
// its output is placed into the audio stream as a band-limited step, so high notes stay clean
// instead of aliasing. No DOM, no Web Audio: the worklet, the export worker and Node all use it.
import { CLOCK, FRAME_HZ, TRI_SEQ, DMC_RATES, dutyTable, stepCycles, noiseCycles, frameState, hwEnvFor, usesHwEnv, waveShift, midiToHz, compileSong, KIT, isMelodic } from "./chip-core.js";

// ---- band-limited steps: a windowed-sinc impulse table, summed into a buffer and integrated
const W = 16, P = 64;
const KERNEL = (() => {
  const k = new Float64Array(P * W), fc = 0.45;
  for (let p = 0; p < P; p++) {
    let sum = 0;
    for (let j = 0; j < W; j++) {
      const x = j - (W / 2 - 1) - p / P;
      const s = x === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * x) / (Math.PI * x);
      const w = Math.abs(x) >= W / 2 ? 0 : 0.42 + 0.5 * Math.cos((2 * Math.PI * x) / W) + 0.08 * Math.cos((4 * Math.PI * x) / W);
      k[p * W + j] = s * w; sum += s * w;
    }
    for (let j = 0; j < W; j++) k[p * W + j] /= sum;
  }
  return k;
})();
export const BLIP_DELAY = W / 2 - 1;

export class Blip {
  constructor(maxSpan, bandlimited = true) { this.buf = new Float64Array(maxSpan + W + 4); this.acc = 0; this.bl = bandlimited; }
  add(t, d) {
    const b = this.buf;
    if (!this.bl) { b[Math.round(t)] += d; return; }
    let i = Math.floor(t), p = Math.round((t - i) * P);
    if (p === P) { p = 0; i++; }
    const o = p * W;
    for (let j = 0; j < W; j++) b[i + j] += d * KERNEL[o + j];
  }
  read(out, off, n) {
    const b = this.buf; let a = this.acc;
    for (let i = 0; i < n; i++) { a += b[i]; out[off + i] = a; }
    this.acc = a;
    b.copyWithin(0, n, n + W + 4); b.fill(0, W + 4);
  }
}

// ---- 1-bit delta samples, synthesized here (no recordings from anywhere)
let kitCache = null;
export function makeKit() {
  if (kitCache) return kitCache;
  const sr = CLOCK["2a03"] / DMC_RATES[15];
  let seed = 12345; const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296) * 2 - 1;
  const gen = (dur, f) => { const n = Math.round(dur * sr), x = new Float64Array(n); for (let i = 0; i < n; i++) x[i] = f(i / sr, i); return x; };
  let ph = 0;
  const sweep = (f0, f1, k) => (t) => { const f = f1 + (f0 - f1) * Math.exp(-t / k); ph += (2 * Math.PI * f) / sr; return Math.sin(ph); };
  const shapes = {
    Kick: () => { ph = 0; const s = sweep(170, 45, 0.03); return gen(0.24, (t) => 0.95 * s(t) * Math.exp(-t / 0.09)); },
    Snare: () => { ph = 0; const s = sweep(240, 180, 0.02); return gen(0.2, (t) => (0.45 * s(t) + 0.7 * rnd()) * Math.exp(-t / 0.06)); },
    "Low tom": () => { ph = 0; const s = sweep(150, 90, 0.06); return gen(0.28, (t) => 0.9 * s(t) * Math.exp(-t / 0.12)); },
    "High tom": () => { ph = 0; const s = sweep(240, 150, 0.05); return gen(0.22, (t) => 0.9 * s(t) * Math.exp(-t / 0.09)); },
    Clap: () => gen(0.18, (t) => rnd() * (t < 0.03 ? (Math.floor(t / 0.01) % 2 ? 0.3 : 0.9) : 0.8 * Math.exp(-(t - 0.03) / 0.04))),
    Hat: () => { let last = 0; return gen(0.08, (t) => { const r = rnd(), v = r - last; last = r; return 0.6 * v * Math.exp(-t / 0.02); }); },
    "Bass hit": () => { ph = 0; return gen(0.3, (t) => { ph += (2 * Math.PI * 82.4) / sr; return 0.9 * Math.sign(Math.sin(ph)) * 0.7 * Math.exp(-t / 0.12) + 0.3 * Math.sin(ph * 2) * Math.exp(-t / 0.05); }); },
    Zap: () => { ph = 0; const s = sweep(2400, 120, 0.04); return gen(0.2, (t) => 0.8 * s(t) * Math.exp(-t / 0.08)); },
  };
  kitCache = KIT.map((name) => {
    const x = shapes[name]();
    // encode: each bit moves the 7-bit counter up or down by 2, as the 2A03's sample unit does
    let c = 64; const bits = [];
    for (let i = 0; i < x.length; i++) {
      const target = 64 + x[i] * 42;
      if (target > c && c <= 125) { bits.push(1); c += 2; } else if (c >= 2) { bits.push(0); c -= 2; } else bits.push(1);
    }
    // the hardware plays 16*L+1 bytes; pad with alternating bits so the level just holds
    const bytes = Math.ceil(bits.length / 8), L = Math.ceil((bytes - 1) / 16), total = (16 * L + 1) * 8;
    while (bits.length < total) bits.push(bits.length & 1);
    return { name, bits: Uint8Array.from(bits), bytes: total / 8 };
  });
  return kitCache;
}

// ---- one channel's oscillator, stepped at the chip clock
export class Osc {
  constructor(chip, kind) {
    this.chip = chip; this.kind = kind; this.period = 0; this.counter = 0; this.step = 0; this.running = false; this.muted = false;
    this.vol = 0; this.table = dutyTable(chip, 8); this.lfsr = chip === "dmg" ? 0 : 1; this.short = false;
    this.wave = TRI_SEQ.slice(); this.shift = 0; this.waveVol = 1; this.free = false; this.triVol = 15;
    this.bits = null; this.bi = 0; this.dmc = 64; this.last = 0;
  }
  level() {
    switch (this.kind) {
      case "pulse": return this.running && !this.muted ? this.table[this.step] * this.vol : 0;
      case "triangle": return TRI_SEQ[this.step] * (this.triVol / 15); // a halted triangle holds its level
      case "noise": return this.running ? ((this.chip === "dmg" ? this.lfsr & 1 : ~this.lfsr & 1) ? this.vol : 0) : 0;
      case "wave": return this.running ? (this.free ? this.wave[this.step] * this.waveVol : this.wave[this.step] >> this.shift) : 0;
      case "dpcm": return this.dmc;
    }
    return 0;
  }
  clock() {
    switch (this.kind) {
      case "pulse": this.step = (this.step + 1) & 15; break;
      case "triangle": case "wave": this.step = (this.step + 1) & 31; break;
      case "noise":
        if (this.chip === "dmg") {
          const l = this.lfsr, b = ~(l ^ (l >> 1)) & 1;
          let n = (l & 0x7fff) | (b << 15);
          if (this.short) n = (n & ~0x80) | (b << 7);
          this.lfsr = n >> 1;
        } else {
          const l = this.lfsr, fb = (l ^ (l >> (this.short ? 6 : 1))) & 1;
          this.lfsr = (l >> 1) | (fb << 14);
        }
        break;
      case "dpcm":
        if (this.bits && this.bi < this.bits.length) {
          if (this.bits[this.bi++]) { if (this.dmc <= 125) this.dmc += 2; } else if (this.dmc >= 2) this.dmc -= 2;
        } else this.running = false;
        break;
    }
  }
}

// gains per channel: the 2A03 numbers are the NESdev linear mixer approximation (linear, so
// stems add up exactly to the mix); the DMG's four DACs are equal
const GAIN = { "2a03": { pulse: 0.00752, triangle: 0.00851, noise: 0.00494, dpcm: 0.00335 }, dmg: { pulse: 1 / 15, wave: 1 / 15, noise: 1 / 15 } };
const MASTER = { "2a03": 2.5, dmg: 0.42 };

function onePole(sr, hz) { return Math.exp((-2 * Math.PI * hz) / sr); }

export class ChipEngine {
  /** opts: { bandlimited = true, filters = true (the console's output filters), block = 1024 } */
  constructor(sr, opts = {}) {
    this.sr = sr; this.bl = opts.bandlimited !== false; this.filtersOn = opts.filters !== false; this.maxSpan = Math.max(1024, opts.block || 1024);
    this.spt = sr / FRAME_HZ; this.spe = sr / 64; this.toTick = 0; this.toEnv = 0;
    this.song = null; this.ch = []; this.prev = []; this.tickPos = 0; this.playing = false; this.loopRange = null; this.loopsLeft = Infinity;
    this.mutes = []; this.peaks = []; this.tmp = new Float32Array(this.maxSpan); this.kit = makeKit(); this.ptick = 0;
  }
  latency() { return this.bl ? BLIP_DELAY : 0; }
  makeState(kind, chip, pan) {
    return { kind, osc: new Osc(chip, kind), blip: new Blip(this.maxSpan, this.bl), gain: GAIN[chip][kind] * MASTER[chip], pan, events: [], ei: 0, cur: null, t: 0, rel: -1, hw: null, f: [0, 0, 0, 0, 0] };
  }
  /** load (or reload while playing) a project; keeps the play position */
  load(project) {
    const song = compileSong(project), chip = song.chip;
    const sameChip = this.song && this.song.chip === chip;
    this.song = song; this.songLoop = project.loop !== false;
    const fresh = [];
    song.channels.forEach((c, i) => {
      let st = this.ch[i];
      if (!st || st.kind !== c.kind || !sameChip) st = this.makeState(c.kind, chip, c.pan);
      st.pan = c.pan; st.events = c.events; st.osc.free = song.free;
      // keep a sounding note if it's still in the song, otherwise let the new song take over
      st.ei = lowerBound(c.events, this.tickPos);
      if (st.cur) { const same = c.events.find((e) => e.on === st.cur.on && e.p === st.cur.p); if (same) st.cur = same; else if (st.rel < 0) { st.cur = null; st.osc.running = false; } }
      fresh.push(st);
    });
    this.ch = fresh;
    this.setFilters();
  }
  setFilters() {
    const sr = this.sr, chip = this.song?.chip;
    // 2A03 output: high-pass at 90 Hz and 440 Hz, low-pass at 14 kHz. DMG: the output capacitor.
    this.fc = !this.filtersOn ? null : !this.song?.filter ? { hp: [onePole(sr, 10)], lp: 0 } :
      chip === "dmg" ? { hp: [Math.pow(0.999958, CLOCK.dmg / sr)], lp: 0 } : { hp: [onePole(sr, 90), onePole(sr, 440)], lp: 1 - onePole(sr, 14000) };
  }
  /** play from a song step; range = [fromStep, toStep] to loop a stretch, or null for the song's own loop */
  play(fromStep = 0, range = null, loops = Infinity) {
    if (!this.song) return;
    const tk = (s) => this.song.tickOf(s);
    this.loopRange = range ? [tk(range[0]), tk(range[1])] : null;
    this.loopsLeft = loops;
    this.seek(tk(fromStep));
    this.playing = true;
  }
  seek(tick) {
    this.tickPos = tick;
    for (const st of this.ch) { st.ei = lowerBound(st.events, tick); st.cur = null; st.rel = -1; st.hw = null; st.osc.running = false; }
  }
  stop() { this.playing = false; for (const st of this.ch) if (st.cur && st.rel < 0) st.rel = 0; }
  position() { return this.song ? this.song.stepOfTick(this.tickPos) : 0; }
  /** audition one note on a channel (used when you click or draw) */
  preview(ci, note, project) {
    const c = project.channels[ci];
    if (!c || !this.song) return;
    const one = compileSong({ ...project, order: [project.channels.map((_, i) => (i === ci ? 0 : -1))], patterns: project.channels.map((_, i) => (i === ci ? [{ notes: [{ ...note, s: 0 }] }] : [])) });
    const ev = one.channels[ci].events[0];
    if (!ev) return;
    const on = this.ptick;
    const e = { ...ev, on, off: on + Math.min(ev.off - ev.on, 40) };
    let st = this.prev.find((s) => s.kind === c.kind && s.ci === ci);
    if (!st) { st = this.makeState(c.kind, this.song.chip, 0); st.ci = ci; this.prev.push(st); if (this.prev.length > 6) this.prev.shift(); }
    st.osc.free = this.song.free; st.events = [e]; st.ei = 0; st.cur = null; st.rel = -1;
  }
  trigger(st, ev, t) {
    const chip = this.song.chip, o = st.osc;
    const wasSilent = !st.cur || st.rel >= 0 || !o.running;
    st.cur = ev; st.t = t; st.rel = -1;
    if (st.kind === "pulse" && chip === "2a03" && wasSilent) o.step = 0; // writing the high period byte restarts the sequencer
    if (st.kind === "wave") { o.step = 0; o.wave = ev.inst.wave.map((x) => (this.song.free ? x : Math.round(x))); }
    if (st.kind === "noise" && chip === "dmg") o.lfsr = 0; // a DMG trigger clears the shift register
    if (st.kind === "dpcm") {
      const smp = this.kit[Math.max(0, Math.min(this.kit.length - 1, Math.round(ev.p)))];
      o.bits = smp.bits; o.bi = 0; o.period = DMC_RATES[ev.fx.rate ?? 15]; o.running = true; o.counter = 0;
    }
    st.hw = usesHwEnv(chip, this.song.free, st.kind) ? hwEnvFor(frameState(chip, false, st.kind, ev, 0).env, ev.v) : null;
    o.running = true;
  }
  /** the sound driver's once-a-frame update for one channel */
  updateChannel(st, tick) {
    const evs = st.events;
    while (st.ei < evs.length && evs[st.ei].on <= tick) {
      const ev = evs[st.ei++];
      if (ev.off > tick) this.trigger(st, ev, tick - ev.on);
    }
    const o = st.osc, song = this.song, chip = song.chip, free = song.free;
    if (!st.cur) { if (st.kind !== "dpcm") o.running = false; return; }
    const ev = st.cur;
    if (st.rel < 0 && tick >= ev.off) {
      st.rel = 0;
      const R = ev.inst.release || 0;
      if (st.hw) { if (R > 0 && st.hw.vol > 0) st.hw = { vol: st.hw.vol, dir: -1, pace: Math.max(1, Math.min(7, Math.round((R * 64) / FRAME_HZ / st.hw.vol))), cnt: 0 }; else st.hw.vol = 0; }
    }
    const fs = frameState(chip, free, st.kind, ev, st.t, st.rel);
    if (st.kind === "dpcm") { if (st.rel >= 0) { o.running = false; st.cur = null; } st.t++; return; }
    if (isMelodic(st.kind)) {
      const sc = stepCycles(chip, st.kind, midiToHz(fs.semi), free);
      o.period = sc.cyc; o.muted = !sc.ok;
    } else { o.period = noiseCycles(chip, fs.semi); o.short = fs.short; }
    if (st.kind === "pulse") o.table = dutyTable(chip, fs.duty);
    if (st.kind === "triangle") { o.triVol = free ? fs.vol : 15; o.running = free || fs.vol > 0; }
    if (st.kind === "wave") { o.shift = waveShift(fs.vol); o.waveVol = fs.vol / 15; }
    o.vol = st.hw ? st.hw.vol : fs.vol;
    st.t++;
    if (st.rel >= 0) {
      st.rel++;
      const R = ev.inst.release || 0;
      const done = st.hw ? st.hw.vol <= 0 || st.rel > 120 : st.rel > R;
      if (done) { st.cur = null; o.running = false; }
    }
  }
  tick() {
    const s = this.song;
    if (this.playing && s) {
      const end = this.loopRange ? this.loopRange[1] : s.endTick;
      if (this.tickPos >= end) {
        if ((this.loopRange || this.songLoop) && this.loopsLeft > 1) { this.loopsLeft--; this.seek(this.loopRange ? this.loopRange[0] : s.loopTick); }
        else this.stop();
      }
    }
    if (s) {
      if (this.playing) { for (const st of this.ch) this.updateChannel(st, this.tickPos); this.tickPos++; }
      else for (const st of this.ch) if (st.cur) this.updateChannel(st, -1e9); // releases finish after Stop
      for (const st of this.prev) this.updateChannel(st, this.ptick);
    }
    this.ptick++;
  }
  envTick() {
    for (const st of [...this.ch, ...this.prev]) {
      const h = st.hw;
      if (!h || !h.pace) continue;
      if (++h.cnt >= h.pace) { h.cnt = 0; h.vol = Math.max(0, Math.min(15, h.vol + h.dir)); }
      st.osc.vol = h.vol;
    }
  }
  runOsc(st, n) {
    const o = st.osc, blip = st.blip, g = st.gain, cps = CLOCK[o.chip] / this.sr, end = n * cps;
    let lv = o.level() * g;
    if (lv !== o.last) { blip.add(0, lv - o.last); o.last = lv; }
    if (!o.running || !(o.period > 0.25)) return;
    let pos = o.counter;
    while (pos < end) {
      o.clock();
      lv = o.level() * g;
      if (lv !== o.last) { blip.add(pos / cps, lv - o.last); o.last = lv; }
      if (!o.running) break;
      pos += o.period;
    }
    o.counter = Math.max(0, pos - end);
  }
  filter(st, x, off, n) {
    const fc = this.fc; if (!fc) return;
    const f = st.f;
    for (let i = off; i < off + n; i++) {
      let v = x[i];
      for (let k = 0; k < fc.hp.length; k++) { const a = fc.hp[k], y = a * (f[2 * k + 1] + v - f[2 * k]); f[2 * k] = v; f[2 * k + 1] = y; v = y; }
      if (fc.lp) { f[4] += fc.lp * (v - f[4]); v = f[4]; }
      x[i] = v;
    }
  }
  /**
   * Render n samples. L/R get the mix; chans (optional) gets each channel's own mono signal
   * (before panning), all on the same clock, so stems line up to the sample.
   */
  process(L, R, n, chans = null) {
    let done = 0;
    if (!this.peaks.length || this.peaks.length !== this.ch.length) this.peaks = this.ch.map(() => 0);
    const env = this.song && usesHwEnvAny(this.song);
    while (done < n) {
      if (this.toTick <= 0) { this.tick(); this.toTick += this.spt; }
      if (env && this.toEnv <= 0) { this.envTick(); this.toEnv += this.spe; }
      let span = Math.min(n - done, Math.ceil(this.toTick), this.maxSpan);
      if (env) span = Math.min(span, Math.ceil(this.toEnv));
      span = Math.max(1, span);
      this.renderSpan(L, R, done, span, chans);
      this.toTick -= span; if (env) this.toEnv -= span;
      done += span;
    }
  }
  renderSpan(L, R, off, n, chans) {
    for (let i = off; i < off + n; i++) { L[i] = 0; R[i] = 0; }
    const tmp = this.tmp;
    const all = this.ch.concat(this.prev);
    for (let c = 0; c < all.length; c++) {
      const st = all[c];
      this.runOsc(st, n);
      st.blip.read(tmp, 0, n);
      this.filter(st, tmp, 0, n);
      const isPrev = c >= this.ch.length;
      if (!isPrev && chans && chans[c]) chans[c].set(tmp.subarray(0, n), off);
      if (!isPrev && this.mutes[c]) continue;
      const gl = Math.min(1, 1 - st.pan), gr = Math.min(1, 1 + st.pan);
      let pk = 0;
      for (let i = 0; i < n; i++) { const v = tmp[i]; L[off + i] += v * gl; R[off + i] += v * gr; const a = v < 0 ? -v : v; if (a > pk) pk = a; }
      if (!isPrev && pk > this.peaks[c]) this.peaks[c] = pk;
    }
  }
}
function usesHwEnvAny(song) { return song.chip === "dmg" && !song.free; }
function lowerBound(evs, tick) { let lo = 0, hi = evs.length; while (lo < hi) { const m = (lo + hi) >> 1; if (evs[m].on < tick) lo = m + 1; else hi = m; } return lo; }

/**
 * Render the whole song offline. loops: times through the song (the loop section repeats);
 * tail: seconds after the end for releases. Returns { L, R, chans, pans, names, sr, length }.
 * Everything starts at sample zero: the band-limiting delay is trimmed off the front.
 */
export function renderSong(project, sr = 48000, { stems = false, loops = 1, tail = 1, bandlimited = true, filters = true, onProgress = null } = {}) {
  const eng = new ChipEngine(sr, { bandlimited, filters, block: 4096 });
  eng.load(project);
  const s = eng.song;
  s.loopOn = eng.songLoop;
  const loopLen = s.endTick - s.loopTick;
  const ticks = s.endTick + (s.loopOn ? Math.max(0, loops - 1) * loopLen : 0);
  const lat = eng.latency();
  const length = Math.ceil((ticks / FRAME_HZ + tail) * sr);
  const total = length + lat;
  eng.play(0, null, s.loopOn ? loops : 1);
  const nCh = s.channels.length;
  const Lf = new Float32Array(total), Rf = new Float32Array(total);
  const chans = stems ? s.channels.map(() => new Float32Array(total)) : null;
  const block = 4096;
  for (let o = 0; o < total; o += block) {
    const n = Math.min(block, total - o);
    eng.process(Lf.subarray(o), Rf.subarray(o), n, chans ? chans.map((c) => c.subarray(o)) : null);
    if (onProgress && (o / block) % 64 === 0) onProgress(o / total);
  }
  const cut = (a) => a.slice(lat, lat + length);
  return { L: cut(Lf), R: cut(Rf), chans: chans ? chans.map(cut) : null, pans: s.channels.map((c) => c.pan), names: s.channels.map((c) => c.name), kinds: s.channels.map((c) => c.kind), sr, length, nCh };
}
/** a stem as stereo, panned exactly as in the mix (so the stems add up to the mix) */
export function stemStereo(mono, pan) {
  const gl = Math.min(1, 1 - pan), gr = Math.min(1, 1 + pan), l = new Float32Array(mono.length), r = new Float32Array(mono.length);
  for (let i = 0; i < mono.length; i++) { l[i] = mono[i] * gl; r[i] = mono[i] * gr; }
  return [l, r];
}
