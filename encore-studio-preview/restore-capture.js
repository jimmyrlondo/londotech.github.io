// Encore Restore: recording a side straight from a turntable or deck. Live's
// recorder does the work unchanged (raw 32-bit float WAV, written to the
// device's private storage about once a second, so a crash loses nothing);
// this only adds the level of each batch, for the meter and for "stop by
// itself in the run-out groove".
import { LiveRecorder, listInputs, deleteRecording, unfinishedRecordings, recoverRecording } from "./live-recorder.js";
export { listInputs, deleteRecording, unfinishedRecordings, recoverRecording };

export class SideRecorder extends LiveRecorder {
  onBatch(msg) {
    if (!msg.done && msg.data && this.onRms) {
      const ch = this.channels, d = msg.data, n = msg.frames, two = Math.min(1, ch - 1);
      let s = 0;
      for (let i = 0; i < n; i++) { const a = d[i * ch], b = d[i * ch + two]; s += a * a + b * b; }
      this.onRms(10 * Math.log10(s / (2 * Math.max(1, n)) + 1e-14), n / this.fs, this.state === "recording");
    }
    super.onBatch(msg);
  }
}
