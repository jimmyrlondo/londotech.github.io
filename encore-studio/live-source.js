// Encore Live: audio sources that never need the whole recording in memory.
//
//   const src = await openSource(file, audioContext)
//   src.duration, src.fs
//   const { l, r } = await src.read(startFrame, frameCount)
//
// WAV files (including recordings made here) are read lazily straight from
// disk with File.slice(). Compressed files (MP3, M4A, FLAC...) are decoded
// once by the browser. A source can carry a gain track (input volume +
// smart leveler moves), applied as it's read, so those stay non-destructive.

export async function parseWavHeader(file) {
  const head = new DataView(await file.slice(0, Math.min(file.size, 1 << 16)).arrayBuffer());
  const tag = (o) => String.fromCharCode(head.getUint8(o), head.getUint8(o + 1), head.getUint8(o + 2), head.getUint8(o + 3));
  if (head.byteLength < 12 || tag(0) !== "RIFF" || tag(8) !== "WAVE") return null;
  let off = 12, fmt = null, dataOff = -1, dataLen = 0;
  while (off + 8 <= head.byteLength) {
    const id = tag(off), size = head.getUint32(off + 4, true);
    if (id === "fmt ") {
      let format = head.getUint16(off + 8, true);
      const channels = head.getUint16(off + 10, true), fs = head.getUint32(off + 12, true), bits = head.getUint16(off + 22, true);
      if (format === 0xfffe && size >= 26) format = head.getUint16(off + 32, true); // WAVE_FORMAT_EXTENSIBLE
      fmt = { format, channels, fs, bits };
    }
    if (id === "data") {
      dataOff = off + 8;
      // recordings in progress (or recovered after a crash) may have a 0 / wrong size
      dataLen = size === 0 || dataOff + size > file.size ? file.size - dataOff : size;
      break;
    }
    off += 8 + size + (size & 1);
  }
  if (!fmt || dataOff < 0) return null;
  if (!((fmt.format === 1 && [16, 24, 32].includes(fmt.bits)) || (fmt.format === 3 && fmt.bits === 32))) return null;
  return { ...fmt, dataOff, dataLen, frames: Math.floor(dataLen / (fmt.channels * fmt.bits / 8)) };
}

// routing (multi-input recordings): { main: [chL, chR], room: [chL, chR] | null,
//   roomDb, mainDelay (frames; delays the board so it lines up with room mics) }
export const DEFAULT_ROUTING = { main: [0, 1], room: null, roomDb: -6, mainDelay: 0 };

class WavSource {
  constructor(file, h) {
    this.file = file; this.h = h; this.fs = h.fs; this.frames = h.frames; this.duration = h.frames / h.fs;
    this.channels = h.channels; this.gainTrack = null;
    this.routing = { ...DEFAULT_ROUTING, main: [0, Math.min(1, h.channels - 1)] };
  }

  // every channel, raw, for frames [start, start+count) (zeros outside the file)
  async readRaw(start, count) {
    const h = this.h, bps = h.bits / 8, frameBytes = bps * h.channels;
    const a = Math.max(0, Math.floor(start)), b = Math.min(h.frames, Math.floor(start) + count);
    const chans = Array.from({ length: h.channels }, () => new Float32Array(count));
    if (b <= a) return chans;
    const buf = new DataView(await this.file.slice(h.dataOff + a * frameBytes, h.dataOff + b * frameBytes).arrayBuffer());
    const rd = h.format === 3 ? (o) => buf.getFloat32(o, true)
      : h.bits === 16 ? (o) => buf.getInt16(o, true) / 32768
      : h.bits === 24 ? (o) => ((buf.getUint8(o) | (buf.getUint8(o + 1) << 8) | (buf.getInt8(o + 2) << 16)) / 8388608)
      : (o) => buf.getInt32(o, true) / 2147483648;
    const skip = a - Math.floor(start);
    for (let i = 0; i < b - a; i++) for (let c = 0; c < h.channels; c++) chans[c][skip + i] = rd(i * frameBytes + c * bps);
    return chans;
  }

  async read(start, count) {
    start = Math.max(0, Math.floor(start)); count = Math.max(0, Math.min(count, this.frames - start));
    const rt = this.routing, d = Math.max(0, rt.mainDelay | 0);
    const raw = await this.readRaw(start - d, count + d);
    const pick = (c) => raw[Math.min(raw.length - 1, c)];
    const l = new Float32Array(count), r = new Float32Array(count);
    const mL = pick(rt.main[0]), mR = pick(rt.main[1] ?? rt.main[0]);
    for (let i = 0; i < count; i++) { l[i] = mL[i]; r[i] = mR[i]; } // board, delayed by d (raw starts d frames early)
    if (rt.room && this.channels > 2) {
      const g = Math.pow(10, rt.roomDb / 20), rL = pick(rt.room[0]), rR = pick(rt.room[1] ?? rt.room[0]);
      for (let i = 0; i < count; i++) { l[i] += g * rL[i + d]; r[i] += g * rR[i + d]; }
    }
    applyGainTrack(this.gainTrack, this.fs, start, l, r);
    return { l, r };
  }
}

class BufferSource {
  constructor(buffer) {
    this.buffer = buffer; this.fs = buffer.sampleRate; this.frames = buffer.length; this.duration = buffer.duration;
    this.channels = buffer.numberOfChannels; this.gainTrack = null;
  }
  async read(start, count) {
    start = Math.max(0, Math.floor(start)); count = Math.max(0, Math.min(count, this.frames - start));
    const l = this.buffer.getChannelData(0).slice(start, start + count);
    const r = (this.channels > 1 ? this.buffer.getChannelData(1) : this.buffer.getChannelData(0)).slice(start, start + count);
    applyGainTrack(this.gainTrack, this.fs, start, l, r);
    return { l, r };
  }
}

// gainTrack = { hop: seconds per value, db: Float32Array } (e.g. leveler moves)
export function applyGainTrack(track, fs, start, l, r) {
  if (!track?.db?.length) return;
  const per = track.hop * fs, n = track.db.length;
  for (let i = 0; i < l.length; i++) {
    const pos = (start + i) / per, k = Math.min(n - 1, Math.floor(pos)), f = Math.min(1, pos - k);
    const g = Math.pow(10, (track.db[k] + f * ((track.db[Math.min(n - 1, k + 1)]) - track.db[k])) / 20);
    l[i] *= g; r[i] *= g;
  }
}

export async function openSource(file, ctx) {
  const h = await parseWavHeader(file);
  if (h) return new WavSource(file, h);
  // compressed formats: the browser decodes the whole thing (fine for typical sets)
  const buffer = await ctx.decodeAudioData(await file.arrayBuffer());
  return new BufferSource(buffer);
}

// For workers: everything needed to rebuild the source on the other side
export function describeSource(src) {
  return src instanceof WavSource
    ? { kind: "wav", file: src.file, header: src.h, gainTrack: src.gainTrack, routing: src.routing }
    : { kind: "buffer", fs: src.fs, l: src.buffer.getChannelData(0), r: src.channels > 1 ? src.buffer.getChannelData(1) : src.buffer.getChannelData(0), gainTrack: src.gainTrack };
}
export function sourceFromDescription(d) {
  if (d.kind === "wav") { const s = new WavSource(d.file, d.header); s.gainTrack = d.gainTrack; if (d.routing) s.routing = d.routing; return s; }
  const fake = { sampleRate: d.fs, length: d.l.length, duration: d.l.length / d.fs, numberOfChannels: 2, getChannelData: (c) => (c ? d.r : d.l) };
  const s = new BufferSource(fake); s.gainTrack = d.gainTrack; return s;
}
