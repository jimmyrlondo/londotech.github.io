// ENCORE. Vocal Synth recorder: records one input channel (or a mix of all) starting at an exact
// audio-clock time, so a take lines up with the count-in, and reports the live level for the meter.
class VocalSynthCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.channel = -1;                       // -1 = mix every input channel
    this.rec = null;                         // { at, frames, buf, n }
    this.peak = 0; this.pinned = 0; this.sinceMeter = 0;
    this.port.onmessage = (e) => {
      const m = e.data;
      if (m.cmd === "channel") this.channel = m.channel;
      else if (m.cmd === "rec") this.rec = { at: m.at, frames: Math.round(m.dur * sampleRate), buf: new Float32Array(Math.round(m.dur * sampleRate)), n: 0 };
      else if (m.cmd === "cancel") this.rec = null;
    };
  }
  process(inputs) {
    const inp = inputs[0];
    if (!inp || !inp.length) return true;
    const frames = inp[0].length, nch = inp.length, ch = this.channel;
    const r = this.rec;
    for (let i = 0; i < frames; i++) {
      let x;
      if (ch >= 0) x = (inp[ch] ?? inp[nch - 1])[i];
      else { x = 0; for (let c = 0; c < nch; c++) x += inp[c][i]; x /= nch; }
      const a = Math.abs(x);
      if (a > this.peak) this.peak = a;
      if (a >= 0.999) this.pinned++;
      if (r && r.n < r.frames && currentTime + i / sampleRate >= r.at) r.buf[r.n++] = x;
    }
    if (r && r.n >= r.frames) { this.port.postMessage({ take: r.buf, sr: sampleRate }, [r.buf.buffer]); this.rec = null; }
    this.sinceMeter += frames;
    if (this.sinceMeter >= sampleRate / 30) {
      this.port.postMessage({ peak: this.peak, pinned: this.pinned });
      this.peak = 0; this.pinned = 0; this.sinceMeter = 0;
    }
    return true;
  }
}
registerProcessor("vocalsynth-capture", VocalSynthCapture);
