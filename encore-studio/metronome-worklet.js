// Encore Metronome: the AudioWorklet. Renders every click at its exact sample
// on the audio thread (so a busy page can't make it late or uneven), tells the
// page about each count as it's played, and passes the input (for Time check)
// back with the frame number of its first sample, on the same clock as the clicks.
import { ClickEngine } from './metronome-core.js';

class EncoreMetronome extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.engine = new ClickEngine(sampleRate);
    // a starting state can come with the node itself (an offline render needs it there, before any message)
    const o = options && options.processorOptions;
    if (o && o.sounds) this.engine.setSounds(o.sounds);
    if (o && o.settings) this.engine.set(o.settings);
    if (o && o.start !== undefined) this.engine.start(o.start, { countIn: !!o.countIn, seed: o.seed ?? 1 });
    this.listen = false;
    this.chunk = new Float32Array(1024);
    this.fill = 0;
    this.chunkFrame = 0;
    this.port.onmessage = e => {
      const m = e.data;
      if (m.type === 'sounds') this.engine.setSounds(m.sounds);
      else if (m.type === 'settings') this.engine.set(m.settings);
      // at: the frame to start on (a test can line it up exactly); otherwise one block on, so the first click is whole
      else if (m.type === 'start') this.engine.start(m.at ?? currentFrame + 128, { countIn: !!m.countIn, seed: m.seed ?? ((Math.random() * 2 ** 31) | 0) });
      else if (m.type === 'stop') { this.engine.stop(); this.port.postMessage({ type: 'stopped', frame: currentFrame }); }
      else if (m.type === 'listen') { this.listen = !!m.on; this.fill = 0; }
    };
  }
  process(inputs, outputs) {
    const out = outputs[0];
    const events = this.engine.render(out[0], currentFrame);
    for (let c = 1; c < out.length; c++) out[c].set(out[0]);
    if (events.length) this.port.postMessage({ type: 'counts', events });
    // the input, mixed to mono, in 1024-frame batches
    const inp = inputs[0];
    if (this.listen && inp && inp.length) {
      const n = inp[0].length, ch = inp.length;
      for (let i = 0; i < n; i++) {
        if (this.fill === 0) this.chunkFrame = currentFrame + i;
        let v = 0;
        for (let c = 0; c < ch; c++) v += inp[c][i];
        this.chunk[this.fill++] = v / ch;
        if (this.fill === this.chunk.length) {
          const data = this.chunk;
          this.port.postMessage({ type: 'input', frame: this.chunkFrame, data }, [data.buffer]);
          this.chunk = new Float32Array(1024);
          this.fill = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('encore-metronome', EncoreMetronome);
