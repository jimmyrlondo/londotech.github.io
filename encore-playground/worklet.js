// AudioWorklet: runs the mastering chain live on the audio thread, plus a
// latency-aligned, loudness-matched copy of the original for A/B.
import { loadMaster } from "./master-core.js";

class EncoreMasterProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.rt = null;
    this.queue = [];
    this.compare = false;
    this.mix = 1;            // 1 = mastered, 0 = original (smoothed)
    this.matchGain = 1;      // original level matched to the master
    this.tmpL = new Float32Array(128);
    this.tmpR = new Float32Array(128);
    this.blocks = 0;
    this.port.onmessage = (e) => this.onMessage(e.data);
  }

  async onMessage(d) {
    if (d.type === "init") {
      const M = await loadMaster(d.wasm);
      this.rt = M.createRealtime(sampleRate);
      this.ringL = new Float32Array(this.rt.latency + 1);
      this.ringR = new Float32Array(this.rt.latency + 1);
      this.ringIdx = 0;
      for (const q of this.queue) this.apply(q);
      this.queue = [];
      this.port.postMessage({ type: "ready", latency: this.rt.latency });
      return;
    }
    if (!this.rt) this.queue.push(d); else this.apply(d);
  }

  apply(d) {
    if (d.type === "settings") this.rt.settings(d.settings);
    else if (d.type === "learned") this.rt.lockLearned(d.learned);
    else if (d.type === "compare") this.compare = d.on;
    else if (d.type === "match") this.matchGain = d.gain;
  }

  process(inputs, outputs) {
    const out = outputs[0], inp = inputs[0];
    if (!inp || inp.length === 0 || !out || out.length < 2) { for (const ch of out ?? []) ch.fill(0); return true; }
    const l = inp[0], r = inp[1] ?? inp[0], n = l.length;
    if (!this.rt) { out[0].set(l); out[1].set(r); return true; }

    this.tmpL.set(l); this.tmpR.set(r);
    this.rt.process(this.tmpL, this.tmpR);

    const target = this.compare ? 0 : 1, step = 1 / (0.02 * sampleRate);
    const len = this.ringL.length;
    for (let i = 0; i < n; i++) {
      const ol = this.ringL[this.ringIdx], or = this.ringR[this.ringIdx];
      this.ringL[this.ringIdx] = l[i]; this.ringR[this.ringIdx] = r[i];
      this.ringIdx = (this.ringIdx + 1) % len;
      this.mix += Math.max(-step, Math.min(step, target - this.mix));
      out[0][i] = this.tmpL[i] * this.mix + ol * this.matchGain * (1 - this.mix);
      out[1][i] = this.tmpR[i] * this.mix + or * this.matchGain * (1 - this.mix);
    }

    if (++this.blocks % 8 === 0)
      this.port.postMessage({ type: "meters", st: this.rt.get(0), m: this.rt.get(1), gr: this.rt.get(4), settling: this.rt.get(7) > 0.5 });
    return true;
  }
}

registerProcessor("encore-master", EncoreMasterProcessor);
