// ENCORE. Chip: the live player. Runs the same chip engine as the export, on the audio thread.
import { ChipEngine } from "./chip-synth.js";

class EncoreChip extends AudioWorkletProcessor {
  constructor() {
    super();
    this.eng = new ChipEngine(sampleRate, { block: 256 });
    this.project = null; this.n = 0; this.every = Math.round(sampleRate / 30);
    this.port.onmessage = (e) => {
      const m = e.data, eng = this.eng;
      try {
        if (m.type === "load") { this.project = m.project; eng.load(m.project); }
        else if (m.type === "play") eng.play(m.from || 0, m.range || null);
        else if (m.type === "stop") eng.stop();
        else if (m.type === "preview" && this.project) eng.preview(m.ci, m.note, this.project);
        else if (m.type === "mutes") eng.mutes = m.mutes;
      } catch (err) { this.port.postMessage({ type: "error", message: String(err && err.message || err) }); }
    };
  }
  process(_in, outputs) {
    const out = outputs[0], L = out[0], R = out[1] || out[0];
    if (!L) return true;
    this.eng.process(L, R === L ? new Float32Array(L.length) : R, L.length);
    this.n += L.length;
    if (this.n >= this.every) {
      this.n = 0;
      this.port.postMessage({ type: "pos", step: this.eng.position(), playing: this.eng.playing, peaks: this.eng.peaks.slice() });
      this.eng.peaks.fill(0);
    }
    return true;
  }
}
registerProcessor("encore-chip", EncoreChip);
