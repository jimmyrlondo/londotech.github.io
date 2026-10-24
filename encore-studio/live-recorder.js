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

// Names that match the hardware: "LINE IN 3/4 (Volt 476)" -> Input 3, Input 4
export function channelNames(labels, counts) {
  const names = []; let next = 1;
  labels.forEach((label, k) => {
    const m = label.match(/(\d+)\s*[/&+-]\s*(\d+)/);
    if (m && counts[k] === 2 && +m[2] === +m[1] + 1) { names.push(`Input ${m[1]}`, `Input ${m[2]}`); next = Math.max(next, +m[2] + 1); }
    else for (let c = 0; c < counts[k]; c++) names.push(`Input ${next++}`);
  });
  return names;
}

export class LiveRecorder {
  constructor() { this.state = "idle"; this.markers = []; }

  // Soundcheck: open the input(s) and report levels, nothing is saved yet.
  // deviceIds can name several devices: some interfaces show up as more than
  // one (Windows lists a Volt 476 as "INPUT 1/2" and "LINE IN 3/4"). Their
  // channels are recorded side by side as Input 1, 2, 3...
  async open({ deviceId, deviceIds, safeMode = false, onLevels, onWarn, onLost } = {}) {
    if (this.state !== "idle") await this.close();
    this.onLevels = onLevels; this.onWarn = onWarn;
    const ids = deviceIds?.length ? deviceIds : [deviceId];
    this.streams = [];
    try { for (const id of ids) this.streams.push(await openInput(id, safeMode)); }
    catch (err) { this.streams.forEach((s) => s.getTracks().forEach((t) => t.stop())); throw err; }
    const tracks = this.streams.map((s) => s.getAudioTracks()[0]), settings = tracks[0].getSettings();
    const counts = tracks.map((t) => Math.max(1, t.getSettings().channelCount || 2));
    this.channels = counts.reduce((a, b) => a + b, 0);
    this.deviceLabel = tracks.map((t) => t.label).join(" + ");
    this.channelNames = channelNames(tracks.map((t) => t.label), counts);
    // run at the (first) device's own rate (44.1/48/88.2/96 kHz...) so nothing gets resampled
    try { this.ctx = new AudioContext({ latencyHint: "interactive", sampleRate: settings.sampleRate || undefined }); }
    catch { this.ctx = new AudioContext({ latencyHint: "interactive" }); }
    this.fs = this.ctx.sampleRate;
    if (tracks.some((t) => /bluetooth|hands-?free|airpods|headset|buds/i.test(t.label))) onWarn?.("Bluetooth mics record at phone-call quality. Use a wired mic or interface if you can.");
    for (const track of tracks) {
      // cable pulled / interface unplugged / phone call grabbed the mic: save what we have
      track.onended = () => {
        if (this.state === "recording") { onWarn?.("An input disconnected. Everything up to now is saved."); this.stop().then((r) => onLost?.(r)); }
        else if (this.state === "armed") { onWarn?.("The input disconnected. Plug it back in and choose it again."); this.close().then(() => onLost?.(null)); }
      };
      track.onmute = () => { if (this.state !== "idle") onWarn?.("An input went silent (another app may have taken it)."); };
    }
    await this.ctx.audioWorklet.addModule("capture-worklet.js");
    this.node = new AudioWorkletNode(this.ctx, "encore-capture", {
      numberOfInputs: 1, numberOfOutputs: 1, channelCount: this.channels, channelCountMode: "explicit",
      channelInterpretation: "discrete", processorOptions: { channels: this.channels },
    });
    if (this.streams.length === 1) this.ctx.createMediaStreamSource(this.streams[0]).connect(this.node);
    else { // lay every device's channels side by side
      const merge = this.ctx.createChannelMerger(this.channels);
      let at = 0;
      this.streams.forEach((s, k) => {
        const src = this.ctx.createMediaStreamSource(s), split = this.ctx.createChannelSplitter(counts[k]);
        src.connect(split);
        for (let c = 0; c < counts[k]; c++) split.connect(merge, c, at + c);
        at += counts[k];
      });
      merge.connect(this.node);
    }
    const mute = this.ctx.createGain(); mute.gain.value = 0;
    this.node.connect(mute).connect(this.ctx.destination); // keeps the graph running, silently
    await this.ctx.resume();
    this.leveler = new SmartLeveler(this.fs);
    this.frames = 0; this.bytes = 0; this.markers = [];
    this.node.port.onmessage = (e) => this.onBatch(e.data);
    await this.keepAwake();
    document.addEventListener("visibilitychange", this.reawake = () => { if (document.visibilityState === "visible" && this.state !== "idle") this.keepAwake(); });
    this.state = "armed";
    return { channels: this.channels, fs: this.fs, device: this.deviceLabel, channelNames: this.channelNames };
  }

  // Start saving (after open)
  async record() {
    if (this.state !== "armed") throw new Error("Open an input first");
    // storage: OPFS if available (crash-safe), otherwise memory
    const t = new Date(), p2 = (n) => String(n).padStart(2, "0"); // local time, so the list reads right
    this.name = `live-${t.getFullYear()}-${p2(t.getMonth() + 1)}-${p2(t.getDate())}T${p2(t.getHours())}-${p2(t.getMinutes())}-${p2(t.getSeconds())}`;
    this.dir = await opfsDir();
    this.bytes = 0; this.parts = []; this.writeChain = Promise.resolve(); this.writable = null;
    if (this.dir) {
      try {
        this.fileHandle = await this.dir.getFileHandle(this.name + ".wav", { create: true });
        this.writable = await this.fileHandle.createWritable();
        await this.writable.write(wavHeader(this.fs, this.channels, 0));
      } catch { this.writable = null; }
    }
    if (!this.writable) this.parts.push(wavHeader(this.fs, this.channels, 0));
    this.leveler = new SmartLeveler(this.fs);
    this.frames = 0; this.markers = []; this.pinnedTotal = new Array(this.channels).fill(0);
    this.startedAt = performance.now();
    this.state = "recording";
    await this.writeSidecar("recording");
    return { storage: this.writable ? "disk" : "memory" };
  }

  async start(opts) { const info = await this.open(opts); return { ...info, ...(await this.record()) }; }

  // Leave the soundcheck without recording
  async close() {
    if (this.state === "recording") return this.stop();
    if (this.state === "idle") return null;
    this.state = "idle";
    this.streams?.flatMap((x) => x.getTracks()).forEach((t) => { t.onended = null; t.onmute = null; t.stop(); });
    this.wakeLock?.release?.().catch(() => {}); this.wakeLock = null;
    document.removeEventListener("visibilitychange", this.reawake);
    await this.ctx?.close().catch(() => {});
    return null;
  }

  onBatch(msg) {
    if (msg.done) { this.doneResolve?.(); return; }
    const { data, frames, peaks, pinned } = msg;
    const ch = this.channels;
    const l = new Float32Array(frames), r = new Float32Array(frames);
    for (let i = 0; i < frames; i++) { l[i] = data[i * ch]; r[i] = data[i * ch + Math.min(1, ch - 1)]; }
    if (pinned.some((p) => p > 2)) this.onWarn?.("Input is clipping at the device. Turn the gain down on your interface or mic (software can't undo this).");
    if (this.state === "recording") {
      this.frames += frames;
      const bytes = new Uint8Array(data.buffer.slice(0));
      this.bytes += bytes.length;
      if (this.writable) this.writeChain = this.writeChain.then(() => this.writable.write(bytes)).catch((err) => this.onWarn?.(`Saving failed: ${err.message}`));
      else this.parts.push(bytes);
      pinned.forEach((p, c) => { this.pinnedTotal[c] += p; });
      if (this.writable && this.frames % (this.fs * 10) < frames) this.writeSidecar("recording"); // refresh progress ~every 10 s
    }
    this.leveler.push(l, r); // leveler listens to the first two channels (the main pair)
    this.onLevels?.({ peaks, pinned, leveledDb: this.leveler.levelDb(), seconds: this.frames / this.fs, bytes: this.bytes, recording: this.state === "recording" });
  }

  mark() { if (this.state === "recording") this.markers.push(+(this.frames / this.fs).toFixed(1)); return this.markers.length; }

  async stop() {
    if (this.state !== "recording") return null;
    this.state = "stopping";
    const done = new Promise((res) => { this.doneResolve = res; });
    this.node.port.postMessage("stop");
    await Promise.race([done, new Promise((res) => setTimeout(res, 1500))]);
    this.streams.flatMap((x) => x.getTracks()).forEach((t) => { t.onended = null; t.onmute = null; t.stop(); });
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
    return { file, name: this.name, fs: this.fs, channels: this.channels, levelerDb: Float32Array.from(this.leveler.track), markers: this.markers.slice(), clippedSamples: this.pinnedTotal, channelNames: this.channelNames };
  }

  async writeSidecar(state) {
    if (!this.dir) return;
    try {
      const fh = await this.dir.getFileHandle(this.name + ".json", { create: true }), w = await fh.createWritable();
      await w.write(JSON.stringify({ name: this.name, state, fs: this.fs, channels: this.channels, device: this.deviceLabel, channelNames: this.channelNames,
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
  return { file: await fh.getFile(), name: info.name, fs: info.fs, channels: info.channels, markers: info.markers ?? [], levelerDb: null, channelNames: info.channelNames };
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
    levelerDb: info.levelerDb ? Float32Array.from(info.levelerDb) : null, leveler: info.leveler, inputDb: info.inputDb, channelNames: info.channelNames };
}

// Remember choices made while recording (input volume, leveler on/off) with the file
export async function updateSaved(name, patch) {
  const dir = await opfsDir(); if (!dir) return;
  try {
    const h = await dir.getFileHandle(name + ".json"), info = JSON.parse(await (await h.getFile()).text());
    const w = await h.createWritable(); await w.write(JSON.stringify({ ...info, ...patch })); await w.close();
  } catch { /* best effort */ }
}
