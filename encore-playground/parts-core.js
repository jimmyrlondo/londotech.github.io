// ENCORE. Learning Tracks: the logic, with no page and no Web Audio in it (test-parts.mjs).
// A score (MusicXML, compressed .mxl, MIDI, or a Compose score) becomes a "song": the bars as
// played (repeats unrolled) and one note stream per staff voice or MIDI track. Streams become
// voice parts (two voices sharing a staff, or two-note chords, are split into upper and lower),
// get singer-friendly names, and every learning track is a mix of the part stems: your part
// loud (and panned), the others quiet; a part missing; your part alone; the full mix.
import { fromMusicXML, readMidiFile, timeline, barInfo, TPQ } from "./compose-core.js";
import { perform } from "./compose-play.js";

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const dbToGain = (db) => (db <= -120 ? 0 : 10 ** (db / 20));
const NOTE = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
/** "C4", "Bb3" */
export const noteName = (m) => NOTE[((Math.round(m) % 12) + 12) % 12] + (Math.floor(Math.round(m) / 12) - 1);
export const midiHz = (m) => 440 * 2 ** ((m - 69) / 12);

// ---------- reading files ----------

/** Unzip one entry from a zip's bytes (stored or deflated). inflate(bytes) -> Promise<Uint8Array> for deflate. */
export async function unzipEntries(bytes, inflate = inflateRaw) {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
  let eocd = -1;
  for (let i = u.length - 22; i >= Math.max(0, u.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("This .mxl file isn't a readable zip.");
  const n = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out = new Map(), dec = new TextDecoder();
  for (let k = 0; k < n; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true), name = dec.decode(u.subarray(p + 46, p + 46 + nlen));
    const lstart = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true), data = u.subarray(lstart, lstart + csize);
    out.set(name, { method, data });
    p += 46 + nlen + xlen + clen;
  }
  return {
    names: [...out.keys()],
    async read(name) { const e = out.get(name); if (!e) return null; return e.method === 0 ? e.data : e.method === 8 ? inflate(e.data) : Promise.reject(new Error("Unknown compression in the .mxl file.")); },
  };
}
async function inflateRaw(data) {
  if (typeof DecompressionStream === "undefined") throw new Error("This browser can't open .mxl files. Save the score as uncompressed MusicXML (.musicxml) instead.");
  const ds = new DecompressionStream("deflate-raw");
  const buf = await new Response(new Blob([data]).stream().pipeThrough(ds)).arrayBuffer();
  return new Uint8Array(buf);
}
/** The MusicXML text inside an .mxl (follows META-INF/container.xml, else the first score file) */
export async function readMxl(bytes, inflate) {
  const z = await unzipEntries(bytes, inflate), dec = new TextDecoder();
  let path = null;
  const cont = await z.read("META-INF/container.xml");
  if (cont) { const m = /full-path\s*=\s*"([^"]+)"/.exec(dec.decode(cont)); if (m) path = m[1]; }
  if (!path || !z.names.includes(path)) path = z.names.find((n) => !n.startsWith("META-INF") && /\.(musicxml|xml)$/i.test(n));
  if (!path) throw new Error("No score inside this .mxl file.");
  return dec.decode(await z.read(path));
}
/** What kind of file this is from its name and first bytes: "midi" | "mxl" | "xml" | null */
export function sniff(name = "", bytes = new Uint8Array(0)) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b[0] === 0x4d && b[1] === 0x54 && b[2] === 0x68 && b[3] === 0x64) return "midi";
  if (b[0] === 0x50 && b[1] === 0x4b) return "mxl";
  if (/\.midi?$/i.test(name)) return "midi";
  if (/\.mxl$/i.test(name)) return "mxl";
  const head = new TextDecoder().decode(b.subarray(0, 600));
  if (/<score-(partwise|timewise)|<\?xml/.test(head) || /\.(musicxml|xml)$/i.test(name)) return "xml";
  return null;
}
/** Any supported file's bytes as a song */
export async function songFromFile(name, bytes, inflate) {
  const kind = sniff(name, bytes), base = String(name).replace(/\.[^.]+$/, "");
  if (kind === "midi") return songFromMidi(bytes, base);
  if (kind === "mxl") return songFromScore(fromMusicXML(await readMxl(bytes, inflate)), base);
  if (kind === "xml") return songFromScore(fromMusicXML(new TextDecoder().decode(bytes)), base);
  throw new Error("That isn't a MusicXML or MIDI file.");
}

// ---------- the song ----------
/**
 * A song: { title, tempo (first, quarter BPM), time {n, d}, key { fifths, mode } | null, pickup (seconds),
 * bars: [{ num, time, dur, beats }] (as played, seconds at 100%), length (seconds),
 * streams: [{ id, name, instrument, clef, events: [{ time, dur, midi, vel, lyric?, hyphen? }] }] }
 */
export function songFromScore(score, fallbackTitle = "Untitled") {
  const evs = perform(score, { all: true, humanize: 0 });
  const bars = barInfo(score), tl = timeline(score, { barList: bars });
  const streams = new Map();
  for (const e of evs) {
    if (e.grace) continue;
    const id = e.part + ":" + e.voice;
    if (!streams.has(id)) {
      const p = score.parts[e.part], staff = p.staves === 2 ? (p.voiceStaff?.[e.voice] ?? (e.voice >= 2 ? 1 : 0)) : 0;
      streams.set(id, { id, part: e.part, voice: e.voice, name: p.name || "", instrument: p.instrument || "", clef: (p.clefs || [p.clef])[staff] || "treble", staves: p.staves || 1, voicesOnStaff: 0, events: [] });
    }
    const src = score.parts[e.part]?.voices[e.voice]?.[e.ref], ev = { time: e.time, dur: e.dur, midi: e.midi, vel: e.vel };
    // every note of the event carries its lyric for now; only the top one keeps it (below)
    if (src?.lyric) { ev.lyric = src.lyric; if (src.lyricHyphen) ev.hyphen = true; }
    ev.ref = e.ref; ev.ptick = e.ptick;
    streams.get(id).events.push(ev);
  }
  // how many voices share each staff (a staff with two voices names them "Tenor/Lead" style)
  const list = [...streams.values()].sort((a, b) => a.part - b.part || a.voice - b.voice);
  for (const s of list) s.voicesOnStaff = list.filter((x) => x.part === s.part && x.clef === s.clef).length;
  for (const s of list) {
    s.events.sort((a, b) => a.time - b.time || b.midi - a.midi);
    const seen = new Set();
    for (const e of s.events) { const k = e.ref + ":" + e.ptick; if (seen.has(k)) { delete e.lyric; delete e.hyphen; } seen.add(k); delete e.ref; delete e.ptick; }
  }
  const songBars = tl.segments.map((sg) => {
    const b = bars[sg.bar];
    return { num: b.number, time: sg.time, dur: sg.dur, beats: countBeats(b.time, sg.ticks) };
  });
  const full = tl.segments.length && bars[tl.segments[0].bar].pickup ? tl.segments[0].dur : 0;
  return finishSong({
    title: score.title && score.title !== "Untitled" ? score.title : fallbackTitle, tempo: score.tempo, time: score.time,
    key: { fifths: score.key || 0, mode: score.mode || "major" }, pickup: full, bars: songBars, streams: list, length: tl.duration,
  });
}
// beats to count in a bar: compound meters (6/8, 9/8, 12/8) count dotted quarters
function countBeats(time, ticks) {
  const compound = time.d === 8 && time.n % 3 === 0 && time.n > 3, unit = compound ? (TPQ * 1.5) : (TPQ * 4) / time.d;
  return Math.max(1, Math.round(ticks / unit));
}
/** A MIDI file as a song: one stream per track and channel (drums left out), exact timing (no quantizing) */
export function songFromMidi(bytes, title = "Untitled") {
  const m = readMidiFile(bytes), div = m.division || 480;
  const tempos = (m.tempos.length ? m.tempos : [{ tick: 0, bpm: 120 }]).slice().sort((a, b) => a.tick - b.tick);
  if (tempos[0].tick > 0) tempos.unshift({ tick: 0, bpm: tempos[0].bpm });
  const secAt = (tick) => {
    let s = 0;
    for (let i = 0; i < tempos.length; i++) {
      const t0 = tempos[i].tick, t1 = i + 1 < tempos.length ? tempos[i + 1].tick : Infinity;
      if (tick <= t0) break;
      s += ((Math.min(tick, t1) - t0) / div) * (60 / tempos[i].bpm);
    }
    return s;
  };
  const streams = [];
  let lastTick = 0;
  m.tracks.forEach((t, ti) => {
    const chans = [...new Set(t.notes.map((n) => n.ch))].filter((c) => c !== 9).sort((a, b) => a - b);
    for (const ch of chans) {
      const notes = t.notes.filter((n) => n.ch === ch);
      if (!notes.length) continue;
      const name = t.name ? (chans.length > 1 ? `${t.name} ${ch + 1}` : t.name) : "";
      streams.push({
        id: `t${ti}c${ch}`, name: name.trim(), instrument: "", clef: "",
        voicesOnStaff: 1, events: notes.map((n) => { lastTick = Math.max(lastTick, n.tick + n.dur); const time = secAt(n.tick); return { time, dur: Math.max(0.05, secAt(n.tick + n.dur) - time), midi: n.midi, vel: n.vel }; }),
      });
    }
  });
  const time = m.time || { n: 4, d: 4 }, perBar = Math.round(div * 4 * time.n / time.d), nBars = Math.max(1, Math.ceil(lastTick / perBar - 1e-6));
  const bars = [];
  for (let i = 0; i < nBars; i++) { const a = secAt(i * perBar), b = secAt((i + 1) * perBar); bars.push({ num: i + 1, time: a, dur: b - a, beats: countBeats(time, (TPQ * 4 * time.n) / time.d) }); }
  return finishSong({
    title, tempo: Math.round(tempos[0].bpm), time, key: m.key ? { fifths: m.key.fifths, mode: m.key.minor ? "minor" : "major" } : null,
    pickup: 0, bars, streams, length: secAt(lastTick),
  });
}
function finishSong(s) {
  for (const st of s.streams) st.events.sort((a, b) => a.time - b.time || b.midi - a.midi);
  s.streams = s.streams.filter((st) => st.events.length);
  if (!s.streams.length) throw new Error("No notes found in this file.");
  s.length = Math.max(s.length || 0, ...s.streams.map((st) => st.events.reduce((a, e) => Math.max(a, e.time + e.dur), 0)));
  return s;
}

// ---------- finding the voice parts ----------
const ACCOMP = /piano|organ|keys|keyboard|accomp|guitar|harp|pno|kbd|rehearsal|reduction|celesta|bass guitar|strings|synth/i;
const EPS = 0.02;
/** Onset groups: notes that start together (within 20 ms) */
function onsetGroups(events) {
  const groups = [];
  for (const e of events) { const g = groups[groups.length - 1]; if (g && Math.abs(g[0].time - e.time) < EPS) g.push(e); else groups.push([e]); }
  return groups;
}
/** How a stream moves: { maxPoly (most notes sounding at once), chordFrac (share of onsets that are 2-note chords), overlapFrac } */
export function streamShape(events) {
  const groups = onsetGroups(events);
  // notes count as sounding together only over the first 60% of each (legato overlaps from a played take don't count)
  const ends = events.map((e) => e.time + Math.max(EPS * 2, e.dur * 0.6));
  const hit = new Uint8Array(events.length), edges = [];
  for (let i = 0; i < events.length; i++) {
    edges.push([events[i].time, 1], [ends[i], -1]);
    for (let j = i + 1; j < events.length && events[j].time < ends[i] - EPS; j++) if (events[j].time > events[i].time + EPS || events[j].time < events[i].time - EPS) { hit[i] = 1; hit[j] = 1; }
  }
  edges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let poly = 0, maxPoly = 0;
  for (const [, d] of edges) { poly += d; if (poly > maxPoly) maxPoly = poly; }
  const chords = groups.filter((g) => g.length === 2).length, overlapped = hit.reduce((a, b) => a + b, 0);
  return { maxPoly, chordFrac: groups.length ? chords / groups.length : 0, overlapFrac: events.length ? overlapped / events.length : 0, groups: groups.length };
}
/** Can this stream be split into two singers? (two notes at most at once, and a fair share of two-note moments) */
export function splittable(events) {
  const sh = streamShape(events);
  return sh.maxPoly === 2 && (sh.chordFrac >= 0.15 || sh.overlapFrac >= 0.2);
}
/**
 * Split a two-voice stream into { upper, lower }. Two notes together: the higher is upper. A single note: when the
 * stream is mostly chords (hymnal style) it's a unison and goes to both; otherwise it goes to the voice that's free
 * (or nearest in pitch to where that voice was).
 */
export function splitStream(events) {
  const groups = onsetGroups(events), chordal = groups.filter((g) => g.length >= 2).length / Math.max(1, groups.length) >= 0.6;
  const upper = [], lower = [];
  let lastU = null, lastL = null;
  const busyUntil = { u: -1, l: -1 };
  for (const g of groups) {
    const sorted = g.slice().sort((a, b) => b.midi - a.midi);
    if (sorted.length >= 2) {
      const hi = sorted[0], lo = sorted[sorted.length - 1];
      upper.push({ ...hi }); lower.push({ ...lo }); lastU = hi.midi; lastL = lo.midi;
      busyUntil.u = hi.time + hi.dur; busyUntil.l = lo.time + lo.dur;
      continue;
    }
    const e = sorted[0], t = e.time + EPS;
    const uFree = busyUntil.u <= t, lFree = busyUntil.l <= t;
    let to;
    if (uFree && lFree) to = chordal ? "both" : lastU === null || lastL === null ? (lastU === null && lastL === null ? "both" : lastU === null ? "u" : "l") : Math.abs(e.midi - lastU) <= Math.abs(e.midi - lastL) ? "u" : "l";
    else if (uFree) to = "u";
    else if (lFree) to = "l";
    else to = Math.abs(e.midi - (lastU ?? e.midi)) <= Math.abs(e.midi - (lastL ?? e.midi)) ? "u" : "l";
    // a lone note above what the lower voice holds belongs on top (and below the upper voice, at the bottom)
    if (to === "u" && !lFree && e.midi < (lastL ?? -1)) to = "l";
    if (to === "u" || to === "both") { upper.push({ ...e }); lastU = e.midi; busyUntil.u = e.time + e.dur; }
    if (to === "l" || to === "both") { lower.push({ ...e }); lastL = e.midi; busyUntil.l = e.time + e.dur; }
  }
  // a chord's lyric sits on one of its notes; both voices sing the same words
  const lyr = new Map(events.filter((e) => e.lyric).map((e) => [Math.round(e.time * 1000), e]));
  for (const e of [...upper, ...lower]) if (!e.lyric) { const u = lyr.get(Math.round(e.time * 1000)); if (u) { e.lyric = u.lyric; if (u.hyphen) e.hyphen = true; } }
  return { upper, lower, chordal };
}

const ABBR = [
  [/^(s|sop|sopr|soprano)\.?$/i, "Soprano"], [/^(a|alt|alto)\.?$/i, "Alto"], [/^(t|ten|tenor)\.?$/i, "Tenor"], [/^(b|bs|bass)\.?$/i, "Bass"],
  [/^(bar|bari|bari\.|baritone)\.?$/i, "Baritone"], [/^(l|ld|lead)\.?$/i, "Lead"], [/^(mez|mezzo|ms)\.?$/i, "Mezzo"], [/^(m|mel|melody)\.?$/i, "Melody"],
];
/** A part name as singers say it: "T1" -> "Tenor 1", "Bari" -> "Baritone", "s." -> "Soprano" */
export function expandName(raw = "") {
  const s = String(raw).replace(/\s+/g, " ").trim();
  const m = /^([a-z.]+?)(?:\s*([0-9]+)|\s+(i{1,3}|iv))?$/i.exec(s);
  if (m) {
    const hit = ABBR.find(([re]) => re.test(m[1]));
    if (hit) {
      const roman = { i: 1, ii: 2, iii: 3, iv: 4 }, num = m[2] || (m[3] ? roman[m[3].toLowerCase()] : "");
      return hit[1] + (num ? " " + num : "");
    }
  }
  return s;
}
/** "Tenor/Lead", "S & A", "Bari + Bass", "Women 1 and 2"... -> the names inside, expanded; one name stays one */
export function splitName(raw = "") {
  const s = String(raw).trim();
  const parts = s.split(/\s*(?:\/|&|\+|,|\n|\band\b)\s*/i).map((x) => x.trim()).filter(Boolean);
  if (parts.length === 2 && /^\d+$/.test(parts[1])) { const base = parts[0].replace(/\s*\d+$/, ""); return [expandName(`${base} ${parts[0].match(/\d+$/)?.[0] || 1}`), expandName(`${base} ${parts[1]}`)]; }
  return parts.map(expandName);
}
const GENERIC = /^(|track|part|staff|voice|voices|instrument|untitled|music|melody line|choir|chorus|vocals?|women|men|ladies|gentlemen|treble|upper|lower|sat?b|ttbb|ssaa)\s*\d*$/i;
export const isGenericName = (s) => GENERIC.test(String(s || "").trim()) || /^(track|part|staff|channel)\s*\d+/i.test(String(s || "").trim());
/** The usual names by how many voices there are and whether it's a men's group (highest voice low), top to bottom */
export function nameSet(n, mens = false, womens = false) {
  if (n === 1) return ["Melody"];
  if (n === 2) return mens ? ["Tenor", "Bass"] : womens ? ["Soprano", "Alto"] : ["Melody", "Harmony"];
  if (n === 3) return mens ? ["Tenor", "Baritone", "Bass"] : womens ? ["Soprano", "Mezzo", "Alto"] : ["Soprano", "Alto", "Baritone"];
  if (n === 4) return mens ? ["Tenor", "Lead", "Baritone", "Bass"] : womens ? ["Tenor", "Lead", "Baritone", "Bass"] : ["Soprano", "Alto", "Tenor", "Bass"];
  if (n === 5) return ["Soprano 1", "Soprano 2", "Alto", "Tenor", "Bass"];
  if (n === 6) return ["Soprano 1", "Soprano 2", "Alto", "Tenor 1", "Tenor 2", "Bass"];
  if (n === 8) return ["Soprano 1", "Soprano 2", "Alto 1", "Alto 2", "Tenor 1", "Tenor 2", "Bass 1", "Bass 2"];
  return Array.from({ length: n }, (_, i) => `Voice ${i + 1}`);
}
const mean = (evs) => evs.reduce((a, e) => a + e.midi, 0) / Math.max(1, evs.length);
export const PART_COLORS = ["#3b82f6", "#22c55e", "#eab308", "#a855f7", "#ec4899", "#14b8a6", "#f97316", "#84cc16", "#06b6d4", "#f43f5e"];
/**
 * The voice parts in a song: [{ id, name, stream, split: null|"upper"|"lower", role: "voice"|"accomp", events, low, high, mean, first, lyrics }].
 * opts.split: { [streamId]: true|false } forces a stream split or kept whole.
 */
export function detectParts(song, opts = {}) {
  const out = [];
  for (const st of song.streams) {
    const sh = streamShape(st.events), named = splitName(st.name);
    const accomp = ACCOMP.test(st.name) || ACCOMP.test(st.instrument) || sh.maxPoly >= 3 || st.staves === 2 && !/voice|choir|vocal/i.test(st.instrument);
    const force = opts.split?.[st.id];
    const canSplit = !accomp && sh.maxPoly === 2;
    const doSplit = canSplit && (force === undefined ? splittable(st.events) : force);
    if (doSplit) {
      const { upper, lower } = splitStream(st.events);
      const names = named.length === 2 ? named : [null, null];
      out.push(mk(st, "upper", upper, names[0]), mk(st, "lower", lower, names[1]));
    } else {
      // a staff with two voices names them in order: voice 1 takes the first name ("Tenor/Lead" -> Tenor, Lead)
      const onStaff = song.streams.filter((x) => x.part !== undefined && x.part === st.part && x.clef === st.clef);
      let name = st.name;
      if (onStaff.length === 2 && named.length === 2) name = named[onStaff.indexOf(st)];
      else if (named.length === 1) name = named[0];
      else if (named.length > 1) name = null;
      const p = mk(st, null, st.events, name);
      p.role = accomp ? "accomp" : "voice";
      p.canSplit = canSplit;
      out.push(p);
    }
  }
  nameParts(out, song);
  out.forEach((p, i) => { p.color = PART_COLORS[i % PART_COLORS.length]; });
  return out;
  function mk(st, split, events, name) {
    const ms = events.map((e) => e.midi);
    return { id: st.id + (split ? ":" + split[0] : ""), stream: st.id, split, role: "voice", name: name ?? null, rawName: st.name, clef: st.clef, canSplit: true,
      events, low: Math.min(...ms), high: Math.max(...ms), mean: mean(events), first: events[0]?.midi ?? 60, lyrics: events.some((e) => e.lyric) };
  }
}
// give every vocal part a name: its own (expanded) if it has a real one, otherwise the usual name for its place by pitch
function nameParts(parts, song) {
  const vocal = parts.filter((p) => p.role === "voice");
  const ranked = vocal.slice().sort((a, b) => b.mean - a.mean);
  const top = ranked[0]?.mean ?? 70, bottom = ranked[ranked.length - 1]?.mean ?? 50;
  const lowClefs = vocal.length > 1 && vocal.every((p) => p.clef === "treble8vb" || p.clef === "bass" || p.clef === "tenor");
  const hint = vocal.map((p) => p.rawName).join(" ");
  const mens = /\b(lead|bari)/i.test(hint) || lowClefs || (vocal.length >= 2 && top < 65.5 && bottom < 52);
  const womens = !mens && bottom >= 55;
  const set = nameSet(vocal.length, mens, womens);
  for (const p of parts) {
    if (p.role !== "voice") { p.name = p.name && !isGenericName(p.name) ? expandName(p.name) : "Accompaniment"; continue; }
    if (p.name && !isGenericName(p.name)) { p.name = expandName(p.name); continue; }
    p.name = set[ranked.indexOf(p)] || `Voice ${ranked.indexOf(p) + 1}`;
  }
  // the same name twice gets numbers
  const seen = new Map();
  for (const p of parts) seen.set(p.name, (seen.get(p.name) || 0) + 1);
  const n = new Map();
  for (const p of parts) if (seen.get(p.name) > 1) { const k = (n.get(p.name) || 0) + 1; n.set(p.name, k); p.name = `${p.name} ${k}`; }
  void song;
}

// ---------- the mixes ----------
export const KINDS = ["predominant", "missing", "alone", "full"];
export const KIND_LABEL = { predominant: "predominant", missing: "missing", alone: "alone", full: "Full mix" };
/** Where each voice sits in the full mix: spread evenly across -spread..+spread in part order */
export const spreadPan = (i, n, spread = 0.5) => (n <= 1 ? 0 : clamp((i / (n - 1)) * 2 - 1, -1, 1) * spread);
/**
 * The level and pan of every part for one track: [{ gain (linear), pan (-1..1) }] by part index.
 * kind: predominant | missing | alone | full; focus: the part index it's for.
 * opts: { othersDb (-12), accompDb (-6), pan: "split" (your part left, the rest right) | "soft" | "center", spread (0.5), accompInAlone (false) }
 */
export function mixLevels(parts, focus, kind, opts = {}) {
  const othersDb = opts.othersDb ?? -12, accompDb = opts.accompDb ?? -6, pan = opts.pan ?? "split", spread = opts.spread ?? 0.5;
  const vocal = parts.map((p, i) => (p.role === "voice" ? i : -1)).filter((i) => i >= 0);
  const fullPan = (i) => spreadPan(vocal.indexOf(i), vocal.length, spread);
  const side = pan === "split" ? 1 : pan === "soft" ? 0.6 : 0;
  return parts.map((p, i) => {
    if (p.role === "off" || p.role === "mute") return { gain: 0, pan: 0 };
    const isFocus = i === focus;
    if (p.role === "accomp") {
      if (kind === "alone" && !opts.accompInAlone) return { gain: 0, pan: 0 };
      if (kind === "predominant") return { gain: dbToGain(accompDb + othersDb), pan: side };
      return { gain: dbToGain(accompDb), pan: 0 };
    }
    if (kind === "full") return { gain: 1, pan: fullPan(i) };
    if (kind === "missing") return { gain: isFocus ? 0 : 1, pan: fullPan(i) };
    if (kind === "alone") return { gain: isFocus ? 1 : 0, pan: 0 };
    // predominant
    return isFocus ? { gain: 1, pan: -side } : { gain: dbToGain(othersDb), pan: side };
  });
}
/** Equal-power pan law: pan -1 (left) .. 1 (right) -> [left gain, right gain]; the middle is -3 dB a side */
export function panGains(pan) {
  const a = ((clamp(pan, -1, 1) + 1) * Math.PI) / 4;
  return [Math.cos(a), Math.sin(a)];
}
/**
 * Mix mono stems into stereo: stems [Float32Array] (each starting at music time 0), levels from mixLevels.
 * opts: { offset (samples before the music: the count-in), leadIn (Float32Array, mono, centred), leadGain (0.7), length (samples), peakDb (-1; null = no normalize) }
 * -> { l, r, peak (before normalizing) }
 */
export function mixTrack(stems, levels, opts = {}) {
  const off = opts.offset || 0, stemLen = Math.max(0, ...stems.map((s) => (s ? s.length : 0)));
  const n = opts.length ?? Math.max(off + stemLen, opts.leadIn ? opts.leadIn.length : 0);
  const l = new Float32Array(n), r = new Float32Array(n);
  stems.forEach((s, k) => {
    const lv = levels[k];
    if (!s || !lv || lv.gain <= 0) return;
    const [gl, gr] = panGains(lv.pan), a = gl * lv.gain, b = gr * lv.gain, m = Math.min(s.length, n - off);
    for (let i = 0; i < m; i++) { const x = s[i]; l[off + i] += a * x; r[off + i] += b * x; }
  });
  if (opts.leadIn) {
    const g = (opts.leadGain ?? 0.7) * Math.SQRT1_2, m = Math.min(opts.leadIn.length, n);
    for (let i = 0; i < m; i++) { l[i] += g * opts.leadIn[i]; r[i] += g * opts.leadIn[i]; }
  }
  let peak = 0;
  for (let i = 0; i < n; i++) { const a = Math.abs(l[i]), b = Math.abs(r[i]); if (a > peak) peak = a; if (b > peak) peak = b; }
  const target = opts.peakDb === undefined ? -1 : opts.peakDb;
  if (target !== null && peak > 0) { const g = dbToGain(target) / peak; for (let i = 0; i < n; i++) { l[i] *= g; r[i] *= g; } }
  return { l, r, peak };
}

/**
 * The gain that brings a stem to an even loudness: RMS over the blocks where it's actually sounding (quiet gaps and the
 * tail don't count), so a high soprano and a low bass come out equally clear whatever the instrument does by register.
 * -> gain (clamped 0.05..40); 1 for silence.
 */
export function levelGain(samples, targetDb = -20, block = 2048) {
  const rms = [];
  for (let o = 0; o + block <= samples.length; o += block) { let e = 0; for (let i = o; i < o + block; i++) e += samples[i] * samples[i]; rms.push(Math.sqrt(e / block)); }
  const loud = Math.max(0, ...rms);
  if (loud < 1e-6) return 1;
  const gate = loud * dbToGain(-30), used = rms.filter((r) => r >= gate);
  const level = Math.sqrt(used.reduce((a, r) => a + r * r, 0) / used.length);
  return clamp(dbToGain(targetDb) / level, 0.05, 40);
}

// ---------- tempo, the count-in and the pitch pipe ----------
/** The song scaled to a tempo (percent of the written tempo): every time and length stretches by 100 / pct */
export const tempoScale = (pct) => 100 / clamp(pct || 100, 10, 400);
/** The length of a part's stem at a tempo, in samples (music plus a tail for the last note to ring) */
export const stemLength = (song, pct, sr, tail = 2) => Math.ceil((song.length * tempoScale(pct) + tail) * sr);
/** The first full bar: its beat length and beats (for the count-in) */
export function countInfo(song, pct = 100) {
  const k = tempoScale(pct), b = song.bars.find((x, i) => !(i === 0 && song.pickup > 0)) || song.bars[0];
  const beats = b?.beats || song.time?.n || 4;
  return { beats, beatSec: ((b?.dur || 2) / beats) * k, pickup: (song.pickup || 0) * k };
}
/** The key note (the tonic) nearest a pitch: from the key signature, or the bass's last note when there isn't one */
export function tonicMidi(song, near = 60, parts = null) {
  let pc;
  if (song.key) pc = (((song.key.fifths * 7) % 12) + 12 + (song.key.mode === "minor" ? 9 : 0)) % 12;
  else {
    const all = (parts || []).filter((p) => p.role === "voice").flatMap((p) => p.events);
    const evs = all.length ? all : song.streams.flatMap((s) => s.events);
    const end = Math.max(...evs.map((e) => e.time)), last = evs.filter((e) => e.time >= end - 0.05);
    pc = ((Math.min(...last.map((e) => e.midi)) % 12) + 12) % 12;
  }
  let best = pc;
  for (let m = pc; m < 128; m += 12) if (Math.abs(m - near) < Math.abs(best - near)) best = m;
  return best;
}
/**
 * The lead-in before the music: an optional pitch-pipe note, then count-in clicks.
 * opts: { sr, beatSec, beats (a bar), bars (0..2 count-in bars), pipeMidi (null = no pipe), pickup (seconds of pickup) }
 * -> { samples: Float32Array (mono), musicStart (seconds: where the song's time 0 lands), clicks: [seconds], pipe: { start, end } | null }
 * With a pickup the music comes in over the end of the count, the way a director counts "three, four" and the pickup lands.
 */
export function leadIn(opts = {}) {
  const sr = opts.sr || 44100, beatSec = opts.beatSec || 0.6, beats = opts.beats || 4, bars = opts.bars ?? 1, pickup = opts.pickup || 0;
  const pipeLen = 1.4, hasPipe = opts.pipeMidi !== null && opts.pipeMidi !== undefined;
  const c0 = hasPipe ? pipeLen + 0.5 : bars ? 0.15 : 0;
  const downbeat = c0 + bars * beats * beatSec;
  const musicStart = Math.max(hasPipe ? pipeLen + 0.35 : 0, downbeat - pickup) + (bars || hasPipe ? 0 : 0.1);
  const clicks = [];
  for (let k = 0; k < bars * beats; k++) { const t = c0 + k * beatSec; if (t < musicStart - 0.02) clicks.push(t); }
  const n = Math.ceil(Math.max(musicStart, hasPipe ? pipeLen + 0.2 : 0) * sr) + 1, x = new Float32Array(n);
  if (hasPipe) {
    // a pitch pipe: a reedy tone (harmonics falling away), soft start and end
    const f = midiHz(opts.pipeMidi), N = Math.round(pipeLen * sr), amps = [1, 0.55, 0.38, 0.22, 0.14, 0.08], norm = 0.32 / amps.reduce((a, b) => a + b, 0);
    for (let i = 0; i < N && i < n; i++) {
      const t = i / sr, env = Math.min(1, t / 0.04) * Math.min(1, (pipeLen - t) / 0.18);
      let v = 0; for (let h = 0; h < amps.length; h++) if (f * (h + 1) < sr / 2) v += amps[h] * Math.sin(2 * Math.PI * f * (h + 1) * t);
      x[i] += v * env * norm * (1 + 0.04 * Math.sin(2 * Math.PI * 5 * t));
    }
  }
  clicks.forEach((t, k) => {
    const accent = k % beats === 0, f = accent ? 1600 : 1150, s = Math.round(t * sr), N = Math.round(0.045 * sr);
    for (let i = 0; i < N && s + i < n; i++) x[s + i] += (accent ? 0.55 : 0.4) * Math.exp(-i / (0.009 * sr)) * Math.sin(2 * Math.PI * f * (i / sr));
  });
  return { samples: x, musicStart, clicks, pipe: hasPipe ? { start: 0, end: pipeLen } : null };
}

// ---------- the set of tracks and their file names ----------
/** A file or folder name that works on every computer (no \ / : * ? " < > |, no trailing dots, not too long) */
export function safeName(s, max = 80) {
  // eslint-disable-next-line no-control-regex
  let t = String(s ?? "").replace(/[\u0000-\u001f\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "");
  if (t.length > max) t = t.slice(0, max).trim();
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(t)) t = "_" + t;
  return t || "Untitled";
}
/** "Song - Tenor predominant.mp3", "Song - Full mix (75% tempo).wav" */
export function trackFileName({ title, part, kind, tempo = 100, ext = "mp3" }) {
  const what = kind === "full" ? "Full mix" : `${part} ${KIND_LABEL[kind]}`;
  return `${safeName(title, 60)} - ${safeName(what, 60)}${tempo !== 100 ? ` (${tempo}% tempo)` : ""}.${ext}`;
}
/**
 * Every track to make: [{ file, kind, focus (part index, -1 for the full mix), tempo, levels, pipeMidi, label }].
 * opts: { title, kinds: { predominant, missing, alone, full }, tempos: [100, 75], ext, pipe: "off"|"key"|"part", keyMidi, ...mixLevels opts }
 */
export function trackPlan(parts, opts = {}) {
  const kinds = opts.kinds || { predominant: true, missing: true, full: true }, tempos = opts.tempos?.length ? opts.tempos : [100], ext = opts.ext || "mp3";
  const out = [], vocal = parts.map((p, i) => (p.role === "voice" ? i : -1)).filter((i) => i >= 0);
  const pipeFor = (focus, kind) => (opts.pipe === "off" || !opts.pipe ? null : opts.pipe === "part" && focus >= 0 && kind !== "missing" ? parts[focus].first : opts.keyMidi ?? 60);
  for (const tempo of tempos) {
    if (kinds.full) out.push({ kind: "full", focus: -1, tempo, levels: mixLevels(parts, -1, "full", opts), pipeMidi: pipeFor(-1, "full"), label: "Full mix", file: trackFileName({ title: opts.title, kind: "full", tempo, ext }) });
    for (const i of vocal) for (const kind of ["predominant", "missing", "alone"]) {
      if (!kinds[kind]) continue;
      out.push({ kind, focus: i, tempo, levels: mixLevels(parts, i, kind, opts), pipeMidi: pipeFor(i, kind), label: `${parts[i].name} ${KIND_LABEL[kind]}`, file: trackFileName({ title: opts.title, part: parts[i].name, kind, tempo, ext }) });
    }
  }
  // two tracks can't share a file name (two parts with the same name): number the repeats
  const used = new Map();
  for (const t of out) {
    const k = t.file.toLowerCase(), c = used.get(k) || 0; used.set(k, c + 1);
    if (c) t.file = t.file.replace(/(\.[a-z0-9]+)$/i, ` (${c + 1})$1`);
  }
  return out;
}
/** The folder inside the zip and the zip's own name */
export const zipNames = (title) => ({ folder: `${safeName(title, 60)} - learning tracks`, zip: `${safeName(title, 60)} - learning tracks.zip` });
/** A short readme for the zip: what each kind of track is for */
export function readmeText(title, plan, parts, opts = {}) {
  const lines = [`${title}: learning tracks`, "", "Made with ENCORE. Learning Tracks. One track per voice part:", ""];
  if (plan.some((t) => t.kind === "predominant")) lines.push(`- "predominant": your part loud${opts.pan === "split" ? " in the left ear, everyone else quieter in the right (turn the balance to hear more or less of your part)" : ", the other parts quieter"}.`);
  if (plan.some((t) => t.kind === "missing")) lines.push('- "missing": every part except yours. Sing your part with the group.');
  if (plan.some((t) => t.kind === "alone")) lines.push('- "alone": just your part.');
  if (plan.some((t) => t.kind === "full")) lines.push('- "Full mix": everyone, the way it should sound.');
  if (plan.some((t) => t.tempo !== 100)) lines.push("- Tracks marked with a tempo are slower practice copies.");
  lines.push("", "Parts: " + parts.filter((p) => p.role === "voice").map((p) => `${p.name} (${noteName(p.low)} to ${noteName(p.high)})`).join(", "), "", "Learn the notes from these, then learn the music from your director.");
  return lines.join("\r\n") + "\r\n";
}

// ---------- the timeline on screen ----------
/** The played bar at a song time (seconds at 100%): index into song.bars */
export function barAt(song, t) {
  const b = song.bars;
  let lo = 0, hi = b.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (b[m].time <= t + 1e-6) lo = m; else hi = m - 1; }
  return lo;
}
/** A loop from played bar a to bar b (inclusive, indexes into song.bars) as song seconds { start, end } */
export function loopTimes(song, a, b) {
  const n = song.bars.length, i = clamp(Math.min(a, b), 0, n - 1), j = clamp(Math.max(a, b), 0, n - 1);
  return { start: song.bars[i].time, end: song.bars[j].time + song.bars[j].dur };
}
/** The lyric words of a part laid out by time: [{ time, text, hyphen }] */
export const lyricLine = (part) => (part?.events || []).filter((e) => e.lyric).map((e) => ({ time: e.time, text: e.lyric, hyphen: !!e.hyphen }));
/** A gentler spread of loudness for learning (every note clearly heard), from a score velocity 1..127 */
export const learnVel = (v) => Math.round(clamp(72 + ((v ?? 84) - 84) * 0.45, 45, 108));
/** A short id for a song's part layout, so names and order the singer set come back next time */
export const layoutSig = (song) => `${song.title}|${song.streams.map((s) => s.id + ":" + s.events.length).join(",")}`;
