// Encore Live recorder.
//
// - Records every channel the input device exposes, raw, as 32-bit float WAV
//   (can't clip digitally), straight into the browser's private storage
//   (OPFS) about once a second, so a crash or dead battery doesn't lose the
//   show. Unfinished recordings can be recovered on the next visit.
// - Phone/computer "call" processing (echo cancellation, noise suppression,
//   auto gain) is switched off: it mangles music. "Safe mode" turns auto gain
//   back on for phones whose mic would otherwise overload.
// - Input volume and the smart leveler are NOT burned into the audio: they're
//   stored as a gain track next to it and applied on playback/export, so they
//   can be changed or switched off later.
// - Keeps the screen awake while recording (Wake Lock).

const HOP = 0.1; // gain track resolution, seconds

// Slow automatic level rider: aims the short-term level at the target,
// at most ~1 dB per second (no pumping), and holds still between songs.
export class SmartLeveler {
  constructor(fs, { targetDb = -18, rangeDb = 12 } = {}) {
    this.fs = fs; this.targetDb = targetDb; this.rangeDb = rangeDb;
    this.hopN = Math.round(fs * HOP); this.acc = 0; this.n = 0;
    this.env = 1e-6; this.gainDb = 0; this.track = [];
    this.envCoef = 1 - Math.exp(-HOP / 3); // ~3 s level average
  }
  push(l, r) {
    for (let i = 0; i < l.length; i++) {
      const m = 0.5 * (l[i] + (r ? r[i] : l[i]));
      this.acc += m * m;
      if (++this.n === this.hopN) {
        const now = 10 * Math.log10(this.acc / this.n + 1e-12);
        const playing = now > this.targetDb - 30 && now > 10 * Math.log10(this.env + 1e-12) - 12;
        if (playing) this.env += this.envCoef * (this.acc / this.n - this.env); // silence doesn't drag the average down
        const level = 10 * Math.log10(this.env + 1e-12);
        if (playing) { // something's playing: ride toward target
          const want = Math.max(-this.rangeDb, Math.min(this.rangeDb, this.targetDb - level));
          const step = 1.0 * HOP; // dB per hop
          this.gainDb += Math.max(-step, Math.min(step, want - this.gainDb));
        }
        this.track.push(this.gainDb);
        this.acc = 0; this.n = 0;
      }
    }
  }
  levelDb() { return 10 * Math.log10(this.env + 1e-12) + this.gainDb; }
}

// The gain track a source should use: input volume (+ leveler, if on)
export function buildGainTrack(levelerDb, inputDb, levelerOn) {
  if (!levelerOn || !levelerDb?.length) return inputDb ? { hop: HOP, db: Float32Array.of(inputDb) } : null;
  return { hop: HOP, db: Float32Array.from(levelerDb, (v) => v + inputDb) };
}

function wavHeader(fs, channels, dataBytes) {
  const h = new DataView(new ArrayBuffer(44));
  const str = (o, s) => { for (let i = 0; i < s.length; i++) h.setUint8(o + i, s.charCodeAt(i)); };
  str(0, "RIFF"); h.setUint32(4, 36 + dataBytes, true); str(8, "WAVE");
  str(12, "fmt "); h.setUint32(16, 16, true); h.setUint16(20, 3, true); h.setUint16(22, channels, true);
  h.setUint32(24, fs, true); h.setUint32(28, fs * channels * 4, true); h.setUint16(32, channels * 4, true); h.setUint16(34, 32, true);
  str(36, "data"); h.setUint32(40, dataBytes, true);
  return h.buffer;
}

async function opfsDir() {
  try { return await (await navigator.storage.getDirectory()).getDirectoryHandle("encore-live", { create: true }); }
  catch { return null; }
}

// Any input the OS exposes: USB/Thunderbolt interfaces, USB mics, field
// recorders in interface mode, mixers with a USB out, built-in and phone mics.
// Browsers only show real names after mic permission, so ask once if needed.
// Chrome on Windows also lists "Default" / "Communications" aliases of real
// devices; those are folded away. Bluetooth headsets are flagged: their mics
// drop to phone-call quality while recording.
export async function listInputs({ askPermission = true } = {}) {
  let all = await navigator.mediaDevices.enumerateDevices();
  if (askPermission && all.some((d) => d.kind === "audioinput" && !d.label)) {
    try { const s = await navigator.mediaDevices.getUserMedia({ audio: true }); s.getTracks().forEach((t) => t.stop()); } catch { /* denied */ }
    all = await navigator.mediaDevices.enumerateDevices();
  }
  const inputs = all.filter((d) => d.kind === "audioinput");
  const real = inputs.filter((d) => d.deviceId !== "default" && d.deviceId !== "communications");
  const list = (real.length ? real : inputs).map((d, i) => {
    const label = d.label || `Input ${i + 1}`;
    return { id: d.deviceId, label: label.replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)\s*$/i, ""), groupId: d.groupId,
      bluetooth: /bluetooth|hands-?free|airpods|headset|buds/i.test(label),
      isDefault: inputs.some((x) => x.deviceId === "default" && x.groupId === d.groupId) };
  });
  return list.sort((a, b) => b.isDefault - a.isDefault);
}

// Open a device just long enough to see what it offers (channels, sample rate)
export async function probeInput(deviceId) {
  const s = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: deviceId ? { exact: deviceId } : undefined,
    echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  const t = s.getAudioTracks()[0], caps = t.getCapabilities?.() ?? {}, set = t.getSettings();
  s.getTracks().forEach((x) => x.stop());
  return { channels: Math.max(set.channelCount || 1, caps.channelCount?.max || 0), sampleRate: set.sampleRate || caps.sampleRate?.max || null };
}

// Ask for the most channels a device can give. Browsers default many
// interfaces to 2 (or 1); asking for the reported maximum gets the rest.
async function openInput(deviceId, safeMode) {
  const base = { deviceId: deviceId ? { exact: deviceId } : undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: !!safeMode };
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { ...base, channelCount: { ideal: 32 } } });
  const track = stream.getAudioTracks()[0];
  const max = track.getCapabilities?.().channelCount?.max ?? 0;
  if (max > (track.getSettings().channelCount || 1)) {
    try { await track.applyConstraints({ ...base, channelCount: { exact: max } }); } catch { /* keep what we got */ }
  }
  return stream;
}

export class LiveRecorder {
  constructor() { this.state = "idle"; this.markers = []; }

  async start({ deviceId, safeMode = false, onLevels, onWarn, onLost } = {}) {
    this.onLevels = onLevels; this.onWarn = onWarn;
    this.stream = await openInput(deviceId, safeMode);
    const track = this.stream.getAudioTracks()[0], settings = track.getSettings();
    this.channels = Math.max(1, settings.channelCount || 2);
    this.deviceLabel = track.label;
    // run at the device's own rate (44.1/48/88.2/96 kHz...) so nothing gets resampled
    try { this.ctx = new AudioContext({ latencyHint: "interactive", sampleRate: settings.sampleRate || undefined }); }
    catch { this.ctx = new AudioContext({ latencyHint: "interactive" }); }
    this.fs = this.ctx.sampleRate;
    if (/bluetooth|hands-?free|airpods|headset|buds/i.test(track.label)) onWarn?.("Bluetooth mics record at phone-call quality. Use a wired mic or interface if you can.");
    // cable pulled / interface unplugged / phone call grabbed the mic: save what we have
    track.onended = () => { if (this.state === "recording") { onWarn?.("The input disconnected. Everything up to now is saved."); this.stop().then((r) => onLost?.(r)); } };
    track.onmute = () => { if (this.state === "recording") onWarn?.("The input went silent (another app may have taken it)."); };
    await this.ctx.audioWorklet.addModule("capture-worklet.js");
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.ctx, "encore-capture", {
      numberOfInputs: 1, numberOfOutputs: 1, channelCount: this.channels, channelCountMode: "explicit",
      channelInterpretation: "discrete", processorOptions: { channels: this.channels },
    });
    const mute = this.ctx.createGain(); mute.gain.value = 0;
    src.connect(this.node).connect(mute).connect(this.ctx.destination); // keeps the graph running, silently

    // storage: OPFS if available (crash-safe), otherwise memory
    const t = new Date(), p2 = (n) => String(n).padStart(2, "0"); // local time, so the list reads right
    this.name = `live-${t.getFullYear()}-${p2(t.getMonth() + 1)}-${p2(t.getDate())}T${p2(t.getHours())}-${p2(t.getMinutes())}-${p2(t.getSeconds())}`;
    this.dir = await opfsDir();
    this.bytes = 0; this.parts = []; this.writeChain = Promise.resolve();
    if (this.dir) {
      try {
        this.fileHandle = await this.dir.getFileHandle(this.name + ".wav", { create: true });
        this.writable = await this.fileHandle.createWritable();
        await this.writable.write(wavHeader(this.fs, this.channels, 0));
        await this.writeSidecar("recording");
      } catch { this.writable = null; }
    }
    if (!this.writable) this.parts.push(wavHeader(this.fs, this.channels, 0));

    this.leveler = new SmartLeveler(this.fs);
    this.startedAt = performance.now();
    this.frames = 0; this.pinnedTotal = new Array(this.channels).fill(0);
    this.node.port.onmessage = (e) => this.onBatch(e.data);
    await this.keepAwake();
    document.addEventListener("visibilitychange", this.reawake = () => { if (document.visibilityState === "visible" && this.state === "recording") this.keepAwake(); });
    this.state = "recording";
    return { channels: this.channels, fs: this.fs, device: this.deviceLabel, storage: this.writable ? "disk" : "memory" };
  }

  onBatch(msg) {
    if (msg.done) { this.doneResolve?.(); return; }
    const { data, frames, peaks, pinned } = msg;
    this.frames += frames;
    const bytes = new Uint8Array(data.buffer.slice(0));
    this.bytes += bytes.length;
    if (this.writable) this.writeChain = this.writeChain.then(() => this.writable.write(bytes)).catch((err) => this.onWarn?.(`Saving failed: ${err.message}`));
    else this.parts.push(bytes);
    // leveler listens to the first two channels (the main pair)
    const l = new Float32Array(frames), r = new Float32Array(frames), ch = this.channels;
    for (let i = 0; i < frames; i++) { l[i] = data[i * ch]; r[i] = data[i * ch + Math.min(1, ch - 1)]; }
    this.leveler.push(l, r);
    pinned.forEach((p, c) => { this.pinnedTotal[c] += p; });
    if (pinned.some((p) => p > 2)) this.onWarn?.("Input is clipping at the device. Turn the gain down on your interface or mic (software can't undo this).");
    this.onLevels?.({ peaks, pinned, leveledDb: this.leveler.levelDb(), seconds: this.frames / this.fs, bytes: this.bytes });
    if (this.writable && this.frames % (this.fs * 10) < frames) this.writeSidecar("recording"); // refresh progress ~every 10 s
  }

  mark() { if (this.state === "recording") this.markers.push(+(this.frames / this.fs).toFixed(1)); return this.markers.length; }

  async stop() {
    if (this.state !== "recording") return null;
    this.state = "stopping";
    const done = new Promise((res) => { this.doneResolve = res; });
    this.node.port.postMessage("stop");
    await Promise.race([done, new Promise((res) => setTimeout(res, 1500))]);
    this.stream.getTracks().forEach((t) => { t.onended = null; t.onmute = null; t.stop(); });
    await this.writeChain;
    let file;
    if (this.writable) {
      await this.writable.write({ type: "write", position: 0, data: wavHeader(this.fs, this.channels, this.bytes) });
      await this.writable.close();
      await this.writeSidecar("done");
      file = await this.fileHandle.getFile();
    } else {
      this.parts[0] = wavHeader(this.fs, this.channels, this.bytes);
      file = new File(this.parts, this.name + ".wav", { type: "audio/wav" });
    }
    this.wakeLock?.release?.().catch(() => {}); this.wakeLock = null;
    document.removeEventListener("visibilitychange", this.reawake);
    await this.ctx.close();
    this.state = "idle";
    return { file, name: this.name, fs: this.fs, channels: this.channels, levelerDb: Float32Array.from(this.leveler.track), markers: this.markers.slice(), clippedSamples: this.pinnedTotal };
  }

  async writeSidecar(state) {
    if (!this.dir) return;
    try {
      const fh = await this.dir.getFileHandle(this.name + ".json", { create: true }), w = await fh.createWritable();
      await w.write(JSON.stringify({ name: this.name, state, fs: this.fs, channels: this.channels, device: this.deviceLabel,
        seconds: this.frames / this.fs, markers: this.markers, levelerDb: state === "done" ? Array.from(this.leveler.track) : undefined }));
      await w.close();
    } catch { /* best effort */ }
  }

  async keepAwake() { try { this.wakeLock = await navigator.wakeLock?.request("screen"); } catch { /* not supported / denied */ } }
}

// Recordings left behind by a crash / closed tab, newest first
export async function unfinishedRecordings() {
  const dir = await opfsDir(); if (!dir) return [];
  const out = [];
  for await (const [name, h] of dir.entries()) {
    if (!name.endsWith(".json")) continue;
    try { const info = JSON.parse(await (await h.getFile()).text()); if (info.state === "recording") out.push(info); } catch { /* skip */ }
  }
  return out.sort((a, b) => (a.name < b.name ? 1 : -1));
}

// Make an unfinished recording playable: fix the WAV header from the file size
export async function recoverRecording(info) {
  const dir = await opfsDir();
  const fh = await dir.getFileHandle(info.name + ".wav");
  const size = (await fh.getFile()).size, dataBytes = Math.max(0, size - 44);
  const usable = dataBytes - (dataBytes % (info.channels * 4));
  const w = await fh.createWritable({ keepExistingData: true });
  await w.write({ type: "write", position: 0, data: wavHeader(info.fs, info.channels, usable) });
  await w.close();
  const side = await dir.getFileHandle(info.name + ".json"), sw = await side.createWritable();
  await sw.write(JSON.stringify({ ...info, state: "done", recovered: true })); await sw.close();
  return { file: await fh.getFile(), name: info.name, fs: info.fs, channels: info.channels, markers: info.markers ?? [], levelerDb: null };
}

export async function deleteRecording(name) {
  const dir = await opfsDir(); if (!dir) return;
  for (const ext of [".wav", ".json"]) { try { await dir.removeEntry(name + ext); } catch { /* gone */ } }
}

// Every recording kept on this device (finished or not), newest first, with size
export async function savedRecordings() {
  const dir = await opfsDir(); if (!dir) return [];
  const out = [];
  for await (const [name, h] of dir.entries()) {
    if (!name.endsWith(".json")) continue;
    try {
      const info = JSON.parse(await (await h.getFile()).text());
      try { info.bytes = (await (await dir.getFileHandle(info.name + ".wav")).getFile()).size; } catch { continue; }
      out.push(info);
    } catch { /* skip */ }
  }
  return out.sort((a, b) => (a.name < b.name ? 1 : -1));
}

// Open a saved recording (repairing it first if it never finished)
export async function openSaved(info) {
  if (info.state === "recording") return recoverRecording(info);
  const dir = await opfsDir(), fh = await dir.getFileHandle(info.name + ".wav");
  return { file: await fh.getFile(), name: info.name, fs: info.fs, channels: info.channels, markers: info.markers ?? [],
    levelerDb: info.levelerDb ? Float32Array.from(info.levelerDb) : null, leveler: info.leveler, inputDb: info.inputDb };
}

// Remember choices made while recording (input volume, leveler on/off) with the file
export async function updateSaved(name, patch) {
  const dir = await opfsDir(); if (!dir) return;
  try {
    const h = await dir.getFileHandle(name + ".json"), info = JSON.parse(await (await h.getFile()).text());
    const w = await h.createWritable(); await w.write(JSON.stringify({ ...info, ...patch })); await w.close();
  } catch { /* best effort */ }
}
