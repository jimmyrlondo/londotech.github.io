// ENCORE. Green Room: the shared player (Practice, Slowed + Reverb). Runs on the audio thread:
// holds the song, stretches and pitch-shifts it live with stretch-core.js, handles A-B loops
// (seamless, or with a rest between repeats), the practice sound tools, and tells the page where
// the playhead is. A second processor is the lookahead limiter, so the preview never clips.
import { Stretcher, SongReader, PlayerFx, Limiter, fftSizeFor } from "./stretch-core.js";

class EncoreStretch extends AudioWorkletProcessor {
  constructor() {
    super();
    this.st = new Stretcher({ channels: 2 });
    this.fx = new PlayerFx(sampleRate);
    this.reader = null; this.fs = sampleRate; this.len = 0;
    this.playing = false; this.gain = 0; this.vol = 1;
    this.tempo = 1; this.pitch = 1;
    this.loop = { on: false, a: 0, b: 0, gap: 0 };
    this.loopCount = 0; this.gapLeft = 0;
    this.tick = 0;
    this.port.onmessage = (e) => this.onMsg(e.data);
  }
  onMsg(m) {
    if (m.type === "load") {
      this.reader = new SongReader(m.chans, m.fs);
      this.fs = m.fs; this.len = m.chans[0].length;
      this.st = new Stretcher({ channels: 2, fftSize: fftSizeFor(m.fs) });
      this.st.setRates({ tempo: this.tempo, pitch: this.pitch, ratio: m.fs / sampleRate });
      this.applyLoop(); this.st.reset(0); this.playing = false; this.gain = 0;
      this.report(true);
    } else if (m.type === "play") { if (this.reader) { if (this.realPos() >= this.len - 1 && !this.loop.on) this.seek(0); this.playing = true; } }
    else if (m.type === "pause") this.playing = false;
    else if (m.type === "seek") this.seek(m.pos * this.fs);
    else if (m.type === "rates") {
      this.tempo = m.tempo; this.pitch = m.pitch;
      this.st.setRates({ tempo: m.tempo, pitch: m.pitch });
    } else if (m.type === "loop") {
      const was = JSON.stringify(this.loop);
      this.loop = { on: !!m.on, a: m.a * this.fs, b: m.b * this.fs, gap: m.gap || 0 };
      if (JSON.stringify(this.loop) !== was && this.reader) {
        // keep playing from the same spot in the song (or jump into the new loop)
        let p = this.realPos();
        this.applyLoop();
        if (this.loop.on && (p > this.loop.b || (m.jump && p < this.loop.a))) p = this.loop.a;
        this.loopCount = 0;
        this.st.reset(p, true);
      }
    } else if (m.type === "fx") this.fx.set(m);
    else if (m.type === "volume") this.vol = m.v;
  }
  applyLoop() { if (this.reader) this.reader.setLoop(this.loop.a, this.loop.b, this.loop.on, this.loop.gap > 0); }
  realPos() { return this.reader ? this.reader.real(this.st.position) : 0; }
  seek(p) { p = Math.max(0, Math.min(this.len, p)); this.loopCount = 0; this.gapLeft = 0; this.st.reset(p, this.playing); this.report(true); }
  report(force) {
    if (!force && ++this.tick % 10) return;
    this.port.postMessage({ type: "pos", pos: this.realPos() / this.fs, playing: this.playing, loops: this.loopCount });
  }
  process(inputs, outputs) {
    const out = outputs[0], L = out[0], R = out[1] || out[0], n = L.length;
    if (!this.reader || (!this.playing && this.gain <= 0)) { L.fill(0); if (R !== L) R.fill(0); return true; }
    if (this.gapLeft > 0) {
      L.fill(0); if (R !== L) R.fill(0);
      if (!this.playing) { this.gain = 0; return true; }
      this.gapLeft -= n;
      if (this.gapLeft <= 0) { this.gapLeft = 0; this.st.reset(this.loop.a); this.loopCount++; this.port.postMessage({ type: "looped", count: this.loopCount }); }
      this.report(false);
      return true;
    }
    this.st.process(this.reader.read, [L, R], n);
    this.fx.process(L, R, 0, n);
    // 6 ms fades on play and pause, so they never click
    const target = this.playing ? 1 : 0, stepG = 1 / (0.006 * sampleRate);
    for (let i = 0; i < n; i++) {
      if (this.gain < target) this.gain = Math.min(target, this.gain + stepG);
      else if (this.gain > target) this.gain = Math.max(target, this.gain - stepG);
      const g = this.gain * this.vol;
      L[i] *= g; R[i] *= g;
    }
    const v = this.st.position, lp = this.loop;
    if (lp.on && this.reader.on) {
      if (lp.gap > 0) {
        if (v >= this.reader.b) { this.gapLeft = Math.max(1, Math.round(lp.gap * sampleRate)); this.gain = 0; }
      } else if (v >= this.reader.b) {
        const c = Math.floor((v - this.reader.b) / (this.reader.b - this.reader.a)) + 1;
        if (c > this.loopCount) { this.loopCount = c; this.port.postMessage({ type: "looped", count: c }); }
      }
    } else if (v >= this.len) {
      this.playing = false; this.gain = 0;
      this.st.reset(this.len);
      this.port.postMessage({ type: "ended" });
    }
    this.report(false);
    return true;
  }
}
registerProcessor("encore-stretch", EncoreStretch);

class EncoreLimiter extends AudioWorkletProcessor {
  constructor() { super(); this.lim = new Limiter(sampleRate); this.on = true; this.port.onmessage = (e) => { if ("on" in e.data) this.on = !!e.data.on; }; }
  process(inputs, outputs) {
    const inp = inputs[0], out = outputs[0];
    if (!inp || !inp.length) { for (const c of out) c.fill(0); return true; }
    const L = out[0], R = out[1] || out[0];
    L.set(inp[0]); R.set(inp[1] || inp[0]);
    if (this.on) this.lim.process(L, R, 0, L.length);
    return true;
  }
}
registerProcessor("encore-limiter", EncoreLimiter);
