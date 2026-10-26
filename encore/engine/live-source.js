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

// routing: which recorded inputs become the left/right we hear.
//   main: [chL, chR]  (the same channel twice = one input in both ears)
//   mono: true        blend main's two inputs to the center (two separate
//                     mics/instruments, not a stereo pair)
//   room: [chL, chR] | null, roomDb: blend level for room/crowd mics
//   mainDelay: frames the main feed is delayed to line up with the room
export const DEFAULT_ROUTING = { main: [0, 1], mono: false, room: null, roomDb: -6, mainDelay: 0 };

class Routed {
  initRouting() { this.routing = { ...DEFAULT_ROUTING, main: [0, Math.min(1, this.channels - 1)] }; }

  async read(start, count) {
    start = Math.max(0, Math.floor(start)); count = Math.max(0, Math.min(count, this.frames - start));
    const rt = this.routing, d = Math.max(0, rt.mainDelay | 0);
    const raw = await this.readRaw(start - d, count + d);
    const pick = (c) => raw[Math.max(0, Math.min(raw.length - 1, c))];
    const l = new Float32Array(count), r = new Float32Array(count);
    const mL = pick(rt.main[0]), mR = pick(rt.main[1] ?? rt.main[0]);
    if (rt.mono && mL !== mR) for (let i = 0; i < count; i++) { const m = 0.5 * (mL[i] + mR[i]); l[i] = m; r[i] = m; }
    else for (let i = 0; i < count; i++) { l[i] = mL[i]; r[i] = mR[i]; } // main, delayed by d (raw starts d frames early)
    if (rt.room && this.channels > 2) {
      const g = Math.pow(10, rt.roomDb / 20), rL = pick(rt.room[0]), rR = pick(rt.room[1] ?? rt.room[0]);
      for (let i = 0; i < count; i++) { l[i] += g * rL[i + d]; r[i] += g * rR[i + d]; }
    }
    applyGainTrack(this.gainTrack, this.fs, start, l, r);
    return { l, r };
  }
}

class WavSource extends Routed {
  constructor(file, h) {
    super();
    this.file = file; this.h = h; this.fs = h.fs; this.frames = h.frames; this.duration = h.frames / h.fs;
    this.channels = h.channels; this.gainTrack = null; this.initRouting();
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
}

// a decoded file (MP3, M4A, FLAC...): chans = one Float32Array per channel
class BufferSource extends Routed {
  constructor(chans, fs) {
    super();
    this.chans = chans; this.fs = fs; this.frames = chans[0].length; this.duration = this.frames / fs;
    this.channels = chans.length; this.gainTrack = null; this.buffer = true; this.initRouting();
  }
  async readRaw(start, count) {
    const a = Math.max(0, Math.floor(start)), skip = a - Math.floor(start);
    return this.chans.map((ch) => {
      const out = new Float32Array(count), end = Math.min(ch.length, a + count - skip);
      if (end > a) out.set(ch.subarray(a, end), skip);
      return out;
    });
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
  return new BufferSource(Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c)), buffer.sampleRate);
}

// For workers: everything needed to rebuild the source on the other side
export function describeSource(src) {
  return src instanceof WavSource
    ? { kind: "wav", file: src.file, header: src.h, gainTrack: src.gainTrack, routing: src.routing }
    : { kind: "buffer", fs: src.fs, chans: src.chans, gainTrack: src.gainTrack, routing: src.routing };
}
export function sourceFromDescription(d) {
  const s = d.kind === "wav" ? new WavSource(d.file, d.header) : new BufferSource(d.chans, d.fs);
  s.gainTrack = d.gainTrack; if (d.routing) s.routing = d.routing;
  return s;
}

// ---------------------------------------------------------------------------
// What's on each input, and a sensible way to listen to it.
// Samples a dozen 2 s windows across the recording (fast even for long
// shows), measures each channel's level and how alike neighbouring channels are.
export async function inspectChannels(src) {
  const ch = src.channels, fs = src.fs, win = Math.min(Math.round(fs * 2), src.frames), spots = 12;
  const pow = new Float64Array(ch), xy = new Float64Array(ch);
  let n = 0;
  for (let k = 0; k < spots; k++) {
    const at = Math.max(0, Math.round(((k + 0.5) / spots) * src.frames) - Math.round(win / 2));
    const raw = await src.readRaw(at, win);
    for (let i = 0; i < raw[0].length; i += 2) {
      for (let c = 0; c < ch; c++) { const v = raw[c][i]; pow[c] += v * v; if (c + 1 < ch) xy[c] += v * raw[c + 1][i]; }
      n++;
    }
  }
  const levels = Array.from(pow, (p) => 10 * Math.log10(p / Math.max(1, n) + 1e-12));
  const loudest = Math.max(...levels);
  const active = levels.map((l) => l > -70 && l > loudest - 30); // more than just hiss
  const corr = Array.from(xy, (v, c) => (c + 1 < ch ? v / Math.sqrt(pow[c] * pow[c + 1] + 1e-20) : 0));
  return { levels, active, corr };
}

// Turn what was heard into routing plus a plain-English explanation.
// names: what to call each channel (defaults to Input 1, 2, ...).
export function suggestRouting(info, names = []) {
  const on = info.active.map((a, c) => (a ? c : -1)).filter((c) => c >= 0);
  const name = (c) => names[c] ?? `Input ${c + 1}`;
  const both = (a, b) => `${name(a)} and ${name(b).replace(/^Input /, "")}`.replace(/^Input (\S+) and/, "Inputs $1 and");
  const base = { ...DEFAULT_ROUTING };
  if (on.length <= 1) {
    const c = on[0] ?? 0;
    return { setup: "single", routing: { ...base, main: [c, c] },
      text: on.length ? `Sound on ${name(c)} only, so it plays in both ears.` : `Hardly any sound on any input. Playing ${name(0)} in both ears; check the cable and gain next time.` };
  }
  // neighbouring live inputs (1+2, 3+4...) that move together = a stereo pair
  const pairs = [];
  for (const c of on) if (c % 2 === 0 && info.active[c + 1]) pairs.push({ a: c, b: c + 1, stereo: info.corr[c] > 0.35 });
  const rest = (used) => on.filter((c) => !used.includes(c));
  const main = pairs.find((p) => p.stereo);
  if (main && rest([main.a, main.b]).length) {
    // a stereo feed plus more: the pair is the board, the rest gets blended on top
    const others = rest([main.a, main.b]), r = pairs.find((p) => p !== main && others.includes(p.a));
    const room = r ? [r.a, r.b] : [others[0], others[0]];
    const roomText = r ? both(r.a, r.b).replace(/^Inputs /, "inputs ") : name(others[0]);
    return { setup: "boardRoom", routing: { ...base, main: [main.a, main.b], room },
      text: `${both(main.a, main.b)} sound like a stereo board feed, so they stay left and right with ${roomText} blended in on top.` };
  }
  if (pairs.length && pairs[0].stereo && !rest([pairs[0].a, pairs[0].b]).length) {
    const p = pairs[0];
    return { setup: "stereo", routing: { ...base, main: [p.a, p.b] },
      text: `${both(p.a, p.b)} move together like a stereo pair (a board's L/R out, or a stereo mic), so they stay left and right.` };
  }
  // separate sources (vocal mic + guitar, two mics...): blend them to the center
  const [a, b] = on;
  return { setup: "blend", routing: { ...base, main: [a, b], mono: true },
    text: `${name(a)} and ${name(b)} sound like separate mics or instruments, so they're blended into the middle and both ears hear both.` };
}

// The setup was chosen (at the soundcheck or in the editor): pick the inputs
// that fit it best from what was heard, plus a plain-English line.
export function routingForSetup(info, setup, names = []) {
  if (setup === "auto" || !setup) return suggestRouting(info, names);
  const ch = info.levels.length, name = (c) => names[c] ?? `Input ${c + 1}`;
  const byLevel = info.levels.map((l, c) => c).sort((a, b) => info.levels[b] - info.levels[a]);
  const live = byLevel.filter((c) => info.active[c]);
  const base = { ...DEFAULT_ROUTING };
  const pairs = []; for (let c = 0; c + 1 < ch; c += 2) pairs.push({ a: c, b: c + 1, e: Math.pow(10, info.levels[c] / 10) + Math.pow(10, info.levels[c + 1] / 10), corr: info.corr[c] });
  const loudestPair = pairs.slice().sort((x, y) => y.e - x.e)[0] ?? { a: 0, b: Math.min(1, ch - 1) };
  if (setup === "single") { const c = live[0] ?? 0; return { setup, routing: { ...base, main: [c, c] }, text: `${name(c)} plays in both ears.` }; }
  if (setup === "stereo") {
    const p = loudestPair, one = info.active[p.a] !== info.active[p.b];
    return { setup, routing: { ...base, main: [p.a, p.b] },
      text: one ? `${name(p.a)} (left) and ${name(p.b)} (right), but only ${name(info.active[p.a] ? p.a : p.b)} has sound. If that's not a stereo source, pick One input.`
        : `${name(p.a)} plays left and ${name(p.b)} plays right.` };
  }
  if (setup === "blend") {
    const [a, b] = live.length >= 2 ? live.slice(0, 2).sort((x, y) => x - y) : [live[0] ?? 0, live[0] ?? 0];
    return { setup, routing: { ...base, main: [a, b], mono: true }, text: `${name(a)} and ${name(b)} are blended into the middle, so both ears hear both.` };
  }
  // boardRoom: the most stereo-looking loud pair is the board, the rest blends on top
  const board = pairs.filter((p) => info.active[p.a] && info.active[p.b]).sort((x, y) => y.corr - x.corr)[0] ?? loudestPair;
  const others = live.filter((c) => c !== board.a && c !== board.b).sort((x, y) => x - y);
  const op = pairs.find((p) => p !== board && others.includes(p.a) && others.includes(p.b));
  const room = op ? [op.a, op.b] : others.length ? [others[0], others[0]] : null;
  return { setup, routing: { ...base, main: [board.a, board.b], room },
    text: room ? `Board on ${name(board.a)} and ${name(board.b)}, with ${op ? `${name(op.a)} and ${name(op.b)}` : name(others[0])} blended in.` : `Board on ${name(board.a)} and ${name(board.b)}; nothing else has sound to blend in.` };
}
