// Encore Live recorder: captures every input channel raw on the audio thread
// and hands them to the page in ~0.25 s interleaved batches, with each
// channel's peak and whether the device itself was clipping (samples pinned
// at full scale). Channels are kept discrete (no down-mixing), so a 4-input
// interface records board L/R + room mics as four separate channels.
class EncoreCapture extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.ch = Math.max(1, options.processorOptions?.channels ?? 2);
    this.size = Math.round(sampleRate * 0.25);
    this.buf = new Float32Array(this.size * this.ch);
    this.n = 0; this.on = true;
    this.peaks = new Float32Array(this.ch); this.pinned = new Uint32Array(this.ch);
    this.port.onmessage = (e) => { if (e.data === "stop") { this.flush(); this.on = false; this.port.postMessage({ done: true }); } };
  }
  flush() {
    if (!this.n) return;
    const data = this.buf.slice(0, this.n * this.ch);
    this.port.postMessage({ data, frames: this.n, peaks: Array.from(this.peaks), pinned: Array.from(this.pinned) }, [data.buffer]);
    this.n = 0; this.peaks.fill(0); this.pinned.fill(0);
  }
  process(inputs) {
    if (!this.on) return false;
    const inp = inputs[0];
    if (!inp || !inp.length) return true;
    const frames = inp[0].length, ch = this.ch;
    for (let i = 0; i < frames; i++) {
      for (let c = 0; c < ch; c++) {
        const x = (inp[c] ?? inp[inp.length - 1])[i];
        this.buf[this.n * ch + c] = x;
        const m = Math.abs(x);
        if (m > this.peaks[c]) this.peaks[c] = m;
        if (m >= 0.999) this.pinned[c]++;
      }
      if (++this.n === this.size) this.flush();
    }
    return true;
  }
}
registerProcessor("encore-capture", EncoreCapture);
