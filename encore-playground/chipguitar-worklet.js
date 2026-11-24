// ENCORE. Chip Guitar: the live effect on the audio thread. Input (guitar or a file) in, chip voices out.
import { ChipGuitarFX } from "./chipguitar-core.js";

class EncoreChipGuitar extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.fx = new ChipGuitarFX(sampleRate, options.processorOptions?.params || {});
    this.chan = -1; this.mono = new Float32Array(128); this.spare = new Float32Array(128);
    this.rec = false; this.recSize = Math.round(sampleRate * 0.25); this.recBuf = new Float32Array(this.recSize); this.recN = 0;
    this.n = 0; this.every = Math.round(sampleRate / 30); this.inPk = 0; this.outPk = 0;
    this.port.onmessage = (e) => {
      const m = e.data;
      if (m.type === "params") this.fx.setParams(m.params);
      else if (m.type === "chan") this.chan = m.chan;
      else if (m.type === "rec") { if (m.on) { this.rec = true; this.recN = 0; } else { this.flush(); this.rec = false; this.port.postMessage({ type: "recDone" }); } }
    };
  }
  flush() {
    if (!this.recN) return;
    const data = this.recBuf.slice(0, this.recN);
    this.port.postMessage({ type: "rec", data }, [data.buffer]);
    this.recN = 0;
  }
  process(inputs, outputs) {
    const inp = inputs[0], out = outputs[0], L = out[0], R = out[1] || this.spare, n = L.length;
    if (this.mono.length < n) { this.mono = new Float32Array(n); this.spare = new Float32Array(n); }
    const x = this.mono;
    if (!inp || !inp.length) x.fill(0, 0, n);
    else if (this.chan >= 0) x.set((inp[this.chan] || inp[0]).subarray(0, n));
    else if (inp.length === 1) x.set(inp[0].subarray(0, n));
    else for (let i = 0; i < n; i++) { let s = 0; for (let c = 0; c < inp.length; c++) s += inp[c][i]; x[i] = s / inp.length; }
    for (let i = 0; i < n; i++) { const a = Math.abs(x[i]); if (a > this.inPk) this.inPk = a; }
    this.fx.process(x, L, R, n);
    for (let i = 0; i < n; i++) { const a = Math.abs(L[i]); if (a > this.outPk) this.outPk = a; }
    if (this.rec) {
      for (let i = 0; i < n; i++) { this.recBuf[this.recN++] = L[i]; if (this.recN === this.recSize) this.flush(); }
    }
    this.n += n;
    if (this.n >= this.every) {
      this.n = 0;
      this.port.postMessage({ type: "meter", m: this.fx.meter(), inPk: this.inPk, outPk: this.outPk });
      this.inPk = 0; this.outPk = 0;
    }
    return true;
  }
}
registerProcessor("encore-chip-guitar", EncoreChipGuitar);
