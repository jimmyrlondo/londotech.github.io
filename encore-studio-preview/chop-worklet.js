// ENCORE. Chop: the lo-fi chain on the audio thread, so what you hear while playing
// is the same processing the export uses (lofi-core.js). The page sends the settings and
// the frame where beat 1 is (for the pump).
import { LofiChain } from "./lofi-core.js";

class ChopLofi extends AudioWorkletProcessor {
  constructor() {
    super();
    this.chain = new LofiChain(sampleRate, 2, 3);
    this.on = true;
    this.frame0 = 0;
    this.port.onmessage = (e) => {
      const m = e.data;
      if (m.set) this.chain.set(m.set);
      if ("on" in m) this.on = !!m.on;
      if (m.frame0 !== undefined) this.frame0 = m.frame0;
    };
  }
  process(inputs, outputs) {
    const inp = inputs[0] || [], out = outputs[0];
    for (let c = 0; c < out.length; c++) {
      const src = inp[c] || inp[0];
      if (src) out[c].set(src); else out[c].fill(0);
    }
    if (this.on && out.length >= 2) this.chain.process([out[0], out[1]], currentFrame - this.frame0);
    return true;
  }
}
registerProcessor("chop-lofi", ChopLofi);
