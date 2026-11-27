// ENCORE. Drums: the song model, grooves, fills, humanize, timing, MIDI files and the mixdown.
// Pure logic: no DOM and no Web Audio, so Node runs all of it in the tests.
import { PATTERNS, SECTION_TYPES } from './drums-patterns.js';

export const PPQ = 480;

/** The drums, top to bottom as the grid shows them. gm: General MIDI note. choke: open hat is cut by the others in its group */
export const LANES = [
  { id: 'crash', name: 'Crash', gm: 49 },
  { id: 'china', name: 'China', gm: 52 },
  { id: 'ride', name: 'Ride', gm: 51 },
  { id: 'bell', name: 'Ride bell', gm: 53 },
  { id: 'openhat', name: 'Open hat', gm: 46, choke: 1 },
  { id: 'hat', name: 'Closed hat', gm: 42, choke: 1 },
  { id: 'pedal', name: 'Pedal hat', gm: 44, choke: 1 },
  { id: 'tom1', name: 'High tom', gm: 48 },
  { id: 'tom2', name: 'Mid tom', gm: 45 },
  { id: 'tom3', name: 'Floor tom', gm: 43 },
  { id: 'snare', name: 'Snare', gm: 38 },
  { id: 'stick', name: 'Side stick', gm: 37 },
  { id: 'kick', name: 'Kick', gm: 36 },
];
export const LANE_IDS = LANES.map(l => l.id);
const laneById = Object.fromEntries(LANES.map(l => [l.id, l]));

/** Velocity levels for the brush and the pattern letters */
export const VEL = { accent: 124, normal: 100, soft: 80, ghost: 40 };
const CHAR_VEL = { X: VEL.accent, x: VEL.normal, o: VEL.soft, g: VEL.ghost };
export const velChar = v => !v ? '.' : v >= 115 ? 'X' : v >= 90 ? 'x' : v >= 60 ? 'o' : 'g';

/** Grid resolutions: steps per whole note */
export const DIVS = [
  { id: 8, name: '8th notes' },
  { id: 12, name: '8th triplets' },
  { id: 16, name: '16th notes' },
  { id: 24, name: '16th triplets' },
  { id: 32, name: '32nd notes' },
];
export const DENS = [2, 4, 8, 16];

/** Grid steps in one bar of num/den at `div` steps per whole note (not a whole number: that grid doesn't fit the meter) */
export const stepsPerBar = (num, den, div) => num * div / den;
export const gridFits = (num, den, div) => Number.isInteger(stepsPerBar(num, den, div));
export const stepTicks = div => PPQ * 4 / div;
export const barTicks = (num, den) => PPQ * 4 * num / den;
/** The first grid that fits a meter, trying the one asked for first */
export function fitDiv(num, den, div) {
  if (gridFits(num, den, div)) return div;
  return [16, 32, 8, 24, 12].find(d => gridFits(num, den, d)) || 32;
}

// ---------------- seeded randomness (the same song always plays and exports the same)

export function rng(seed) {
  let s = (seed >>> 0) || 0x9e3779b9;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
/** A number from a few integers, for per-hit randomness that doesn't depend on order */
export function hash(...xs) {
  let h = 2166136261;
  for (const x of xs) { h ^= (x | 0); h = Math.imul(h, 16777619); h ^= h >>> 13; }
  h = Math.imul(h ^ (h >>> 16), 2246822507); h ^= h >>> 13; h = Math.imul(h, 3266489909); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// ---------------- grids and sections

/** An empty grid: { lane: [0, 0, ...] } with `n` steps */
export const emptyGrid = n => Object.fromEntries(LANE_IDS.map(id => [id, new Array(n).fill(0)]));

/** A grid from pattern rows ('x..X'), `n` steps long (rows repeat or cut to fit) */
export function gridFromRows(rows, n) {
  const g = emptyGrid(n);
  for (const [lane, str] of Object.entries(rows || {})) {
    if (!g[lane] || !str) continue;
    for (let i = 0; i < n; i++) g[lane][i] = CHAR_VEL[str[i % str.length]] || 0;
  }
  return g;
}
export const rowsFromGrid = g => Object.fromEntries(LANE_IDS.filter(id => g[id]?.some(v => v)).map(id => [id, g[id].map(velChar).join('')]));

export const patternById = id => PATTERNS.find(p => p.id === id);
/** How many bars a library pattern is */
export function patternBars(p) {
  const spb = stepsPerBar(p.num, p.den, p.div);
  return Math.max(1, Math.round(Math.max(...Object.values(p.rows).map(r => r.length)) / spb));
}

const COLORS = ['#ff3b00', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#ec4899', '#14b8a6', '#f97316'];
let idCounter = 0;
export const newId = () => 's' + Date.now().toString(36) + (idCounter++).toString(36);

/** A section from a library pattern */
export function sectionFromPattern(p, { name = 'Section', bars = 4, id = newId(), color = 0 } = {}) {
  const pb = patternBars(p), spb = stepsPerBar(p.num, p.den, p.div);
  return {
    id, name, color, num: p.num, den: p.den, div: p.div, bpm: p.bpm, bpmEnd: null,
    patBars: pb, bars: Math.max(bars, pb), grid: gridFromRows(p.rows, pb * spb), pattern: p.id,
    fill: { beats: 0, style: 'auto', seed: 1, grid: null }, crash: true, ghosts: 0,
  };
}

/** Put a library pattern into a section (keeps its name, length, fill length and tempo unless `takeTempo`) */
export function applyPattern(sec, p, takeTempo = false) {
  const pb = patternBars(p), spb = stepsPerBar(p.num, p.den, p.div);
  const s = { ...sec, num: p.num, den: p.den, div: p.div, patBars: pb, grid: gridFromRows(p.rows, pb * spb), pattern: p.id };
  if (takeTempo) { s.bpm = p.bpm; s.bpmEnd = null; }
  s.bars = Math.max(s.bars, pb);
  if (s.bars % pb) s.bars += pb - (s.bars % pb);
  return refreshFill(s);
}

/** Change a section's meter or grid, keeping the notes where they still fit (by musical position) */
export function reshapeSection(sec, { num = sec.num, den = sec.den, div = sec.div, patBars = sec.patBars } = {}) {
  div = fitDiv(num, den, div);
  const oldSpb = stepsPerBar(sec.num, sec.den, sec.div), spb = stepsPerBar(num, den, div);
  const g = emptyGrid(spb * patBars), oldT = stepTicks(sec.div), t = stepTicks(div), oldBar = barTicks(sec.num, sec.den), bar = barTicks(num, den);
  // each new bar takes its notes from the matching old bar (a longer pattern repeats the old one)
  for (const id of LANE_IDS) {
    const src = sec.grid[id] || [];
    for (let b = 0; b < patBars; b++) {
      const sb = b % sec.patBars;
      for (let i = 0; i < oldSpb; i++) {
        const v = src[sb * oldSpb + i], within = i * oldT;
        if (!v || within >= bar) continue;
        const j = Math.round(within / t);
        if (j < spb) g[id][b * spb + j] = Math.max(g[id][b * spb + j], v);
      }
    }
  }
  const s = { ...sec, num, den, div, patBars, grid: g };
  s.bars = Math.max(s.bars, patBars);
  if (s.bars % patBars) s.bars += patBars - (s.bars % patBars);
  return refreshFill(s);
}

/** Steps the fill takes up at the end of the section's last bar */
export function fillSteps(sec) {
  const spb = stepsPerBar(sec.num, sec.den, sec.div);
  return Math.min(spb, Math.round(sec.fill.beats * sec.div / sec.den));
}

/** Make the fill again if its size no longer matches the section (keeps a hand-edited fill that still fits) */
export function refreshFill(sec) {
  const n = fillSteps(sec);
  if (!n) return { ...sec, fill: { ...sec.fill, grid: null } };
  if (sec.fill.grid && sec.fill.grid.kick?.length === n && sec.fill.div === sec.div) return sec;
  return { ...sec, fill: { ...sec.fill, div: sec.div, grid: generateFill({ steps: n, div: sec.div, den: sec.den, style: sec.fill.style, seed: sec.fill.seed }) } };
}

// ---------------- fills

const FILL_KINDS = ['roll', 'toms', 'triplets', 'blast', 'unison', 'trade'];

/** A fill `steps` grid steps long: { lane: [velocities] }. Seeded, so the same seed makes the same fill. */
export function generateFill({ steps, div = 16, den = 4, style = 'auto', seed = 1 }) {
  const r = rng(seed * 7919 + steps * 31 + div);
  const kind = style === 'auto' || !FILL_KINDS.includes(style) ? FILL_KINDS[Math.floor(r() * FILL_KINDS.length)] : style;
  const g = emptyGrid(steps);
  // at fine grids, don't hit every step (a 32nd-note roll at 200 BPM is not a drummer)
  const every = div >= 32 ? 2 : 1;
  const beat = div / den; // steps per beat
  const vel = i => Math.round(84 + 40 * (steps > 1 ? i / (steps - 1) : 1));
  const toms = r() < 0.5 ? ['tom1', 'tom2', 'tom3'] : ['snare', 'tom1', 'tom2', 'tom3'];
  const hit = (lane, i, v = vel(i)) => { if (i >= 0 && i < steps) g[lane][i] = Math.max(g[lane][i], Math.min(127, v)); };
  if (kind === 'roll') {
    for (let i = 0; i < steps; i += every) hit('snare', i);
    if (r() < 0.6) hit('tom3', steps - every, 124);
    for (let i = 0; i < steps; i += Math.max(1, Math.round(beat))) hit('kick', i, 100);
  } else if (kind === 'toms') {
    const per = Math.max(1, Math.ceil(steps / toms.length));
    for (let i = 0; i < steps; i += every) hit(toms[Math.min(toms.length - 1, Math.floor(i / per))], i);
    for (let i = 0; i < steps; i += Math.max(1, Math.round(beat))) hit('kick', i, 105);
  } else if (kind === 'triplets') {
    // groups of three: hand, hand, foot, walking down the toms (over the bar line in 16ths, which is the point)
    const hands = [toms[0], ...toms.slice(1)];
    let k = 0;
    for (let i = 0; i + 2 < steps + 2; i += 3, k++) {
      const lane = hands[Math.min(hands.length - 1, Math.floor(k * hands.length / Math.ceil(steps / 3)))];
      hit(lane, i); hit(lane, i + 1, vel(i) - 14); hit('kick', i + 2, 110);
    }
  } else if (kind === 'blast') {
    for (let i = 0; i < steps; i++) i % 2 ? hit('snare', i, Math.round(vel(i) * 0.85)) : hit('kick', i, 105);
    for (let i = 0; i < steps; i += Math.max(1, Math.round(beat))) hit(r() < 0.5 ? 'china' : 'crash', i, 112);
  } else if (kind === 'unison') {
    // accents on a syncopated rhythm, gaps between: the band stops and hits with the drums
    const spots = [];
    for (let i = 0; i < steps; i++) if (i === 0 || r() < 0.33) spots.push(i);
    if (!spots.includes(steps - 1) && steps > 2) spots.push(steps - 1);
    for (const i of spots) { hit('kick', i, 118); hit(r() < 0.5 ? 'crash' : 'china', i, 118); if (r() < 0.5) hit('snare', i, 120); }
  } else { // trade: snare and toms alternating with accents on the beat
    for (let i = 0; i < steps; i += every) {
      const onBeat = Math.abs(i % beat) < 1e-9;
      hit(onBeat ? 'snare' : toms[1 + (i % (toms.length - 1))], i, onBeat ? 122 : vel(i) - 6);
    }
    hit('kick', 0, 110);
  }
  return g;
}

// ---------------- the song: sections in order to timed hits

/** A new song with a demo arrangement, so there's something to play on first load */
export function demoProject() {
  const mk = (type, overrides = {}) => {
    const t = SECTION_TYPES.find(x => x.name === type);
    return { ...sectionFromPattern(patternById(overrides.pattern || t.pattern), { name: type, bars: t.bars, color: SECTION_TYPES.indexOf(t) }), ...overrides };
  };
  let intro = mk('Intro', { bpm: 170 }), verse = mk('Verse', { bpm: 170 }), chorus = mk('Chorus', { bpm: 170 }), bd = mk('Breakdown', { bpm: 170, bpmEnd: null });
  intro = refreshFill({ ...intro, fill: { ...intro.fill, beats: 2, style: 'toms', seed: 3 } });
  verse = refreshFill({ ...verse, fill: { ...verse.fill, beats: 1, style: 'roll', seed: 5 } });
  chorus = refreshFill({ ...chorus, fill: { ...chorus.fill, beats: 2, style: 'triplets', seed: 2 } });
  bd = { ...bd, bpm: 85, crash: true };
  intro.id = 'intro'; verse.id = 'verse'; chorus.id = 'chorus'; bd.id = 'breakdown';
  return {
    v: 1, name: 'My song', sections: [intro, verse, chorus, bd],
    order: ['intro', 'verse', 'chorus', 'verse', 'chorus', 'breakdown'],
    feel: { timing: 6, velocity: 8, softFast: true, kickTight: true, swing: 0, seed: 1 },
    map: { id: 'gm', custom: Object.fromEntries(LANES.map(l => [l.id, l.gm])) },
    kit: 'encore',
  };
}

/** Beats in a section: den-note beats (a 7/8 bar has 7) */
export const sectionBeats = s => s.bars * s.num;
export const sectionTicks = s => s.bars * barTicks(s.num, s.den);

/** The tempo at a beat of a section (a ramp moves one step per beat, ending on bpmEnd on the last beat) */
export function bpmAtBeat(s, k) {
  if (!s.bpmEnd || s.bpmEnd === s.bpm) return s.bpm;
  const n = sectionBeats(s);
  return n <= 1 ? s.bpmEnd : s.bpm + (s.bpmEnd - s.bpm) * k / (n - 1);
}

/**
 * The song (or a list of section ids) to timed hits.
 * Returns { events: [{ tick, lane, vel, step, div, sec }], tempos: [{ tick, bpm }], meters: [{ tick, num, den }],
 *           markers: [{ tick, name }], spans: [{ id, name, tick, endTick }], endTick }
 * Ticks are at PPQ 480, before humanizing.
 */
export function buildSong(project, order = project.order) {
  const byId = Object.fromEntries(project.sections.map(s => [s.id, s]));
  const events = [], tempos = [], meters = [], markers = [], spans = [];
  let t0 = 0, idx = 0;
  for (const id of order) {
    const s = byId[id];
    if (!s) continue;
    const spb = stepsPerBar(s.num, s.den, s.div), st = stepTicks(s.div), bt = barTicks(s.num, s.den), beatT = PPQ * 4 / s.den;
    const patLen = s.patBars * spb, fs = fillSteps(s), fillOn = fs > 0 && s.fill.grid;
    const last = meters[meters.length - 1];
    if (!last || last.num !== s.num || last.den !== s.den) meters.push({ tick: t0, num: s.num, den: s.den });
    const beats = sectionBeats(s);
    for (let k = 0; k < beats; k++) {
      const bpm = bpmAtBeat(s, k), lt = tempos[tempos.length - 1];
      if (!lt || Math.abs(lt.bpm - bpm) > 1e-6) tempos.push({ tick: t0 + k * beatT, bpm });
      if (!s.bpmEnd || s.bpmEnd === s.bpm) break;
    }
    markers.push({ tick: t0, name: s.name });
    const total = s.bars * spb;
    for (let g = 0; g < total; g++) {
      const bar = Math.floor(g / spb), i = g % spb;
      const inFill = fillOn && bar === s.bars - 1 && i >= spb - fs;
      const tick = t0 + bar * bt + i * st;
      const crashHere = s.crash && g === 0;
      for (const lane of LANE_IDS) {
        let v = inFill ? s.fill.grid[lane][i - (spb - fs)] : s.grid[lane][g % patLen];
        if (crashHere && (lane === 'hat' || lane === 'ride' || lane === 'openhat' || lane === 'pedal')) v = 0; // that hand is on the crash
        if (v) events.push({ tick, lane, vel: v, step: i, div: s.div, sec: idx });
      }
      if (crashHere) {
        const has = l => events.some(e => e.tick === tick && e.lane === l);
        if (!has('crash') && !has('china')) events.push({ tick, lane: 'crash', vel: VEL.accent, step: 0, div: s.div, sec: idx });
        if (!has('kick')) events.push({ tick, lane: 'kick', vel: 112, step: 0, div: s.div, sec: idx });
      }
      // ghost notes: quiet snares on the in-between steps, never next to a backbeat or in a fill
      if (s.ghosts > 0 && !inFill && !s.grid.snare[g % patLen] && i % 2 === 1) {
        const prev = s.grid.snare[(g - 1 + patLen) % patLen], next = s.grid.snare[(g + 1) % patLen];
        if (prev < 110 && next < 110 && hash(idx, g, 77) < s.ghosts * 0.45)
          events.push({ tick, lane: 'snare', vel: 28 + Math.round(hash(idx, g, 78) * 16), step: i, div: s.div, sec: idx, ghost: true });
      }
    }
    spans.push({ id, name: s.name, tick: t0, endTick: t0 + s.bars * bt, color: s.color });
    t0 += s.bars * bt;
    idx++;
  }
  if (!tempos.length) tempos.push({ tick: 0, bpm: 120 });
  if (!meters.length) meters.push({ tick: 0, num: 4, den: 4 });
  events.sort((a, b) => a.tick - b.tick || LANE_IDS.indexOf(a.lane) - LANE_IDS.indexOf(b.lane));
  return { events, tempos, meters, markers, spans, endTick: t0 };
}

/** Seconds at a tick, through the tempo map */
export function tickToSec(tick, tempos) {
  let sec = 0, lastT = 0, bpm = tempos[0]?.bpm || 120;
  for (const tp of tempos) {
    if (tp.tick >= tick) break;
    sec += (tp.tick - lastT) / PPQ * 60 / bpm;
    lastT = tp.tick; bpm = tp.bpm;
  }
  return sec + (tick - lastT) / PPQ * 60 / bpm;
}
/** Tick at a time in seconds (the inverse of tickToSec) */
export function secToTick(sec, tempos) {
  let s0 = 0, lastT = 0, bpm = tempos[0]?.bpm || 120;
  for (const tp of tempos) {
    const s1 = s0 + (tp.tick - lastT) / PPQ * 60 / bpm;
    if (s1 > sec) break;
    s0 = s1; lastT = tp.tick; bpm = tp.bpm;
  }
  return lastT + (sec - s0) * bpm / 60 * PPQ;
}
export const bpmAtTick = (tick, tempos) => { let b = tempos[0]?.bpm || 120; for (const t of tempos) { if (t.tick > tick) break; b = t.bpm; } return b; };

/**
 * Make it feel played: swing, softer fast strokes, timing and velocity humanize. Seeded and deterministic.
 * feel: { timing (ms, max push or drag), velocity (max +/-), softFast, kickTight, swing (0 to 1: 1 is full triplet swing), seed }
 * Returns new events with `tick` (float) and `vel` changed, plus `sec` (seconds) and `dt` (ms moved by humanize).
 */
export function humanize(song, feel = {}) {
  const { timing = 0, velocity = 0, softFast = false, kickTight = true, swing = 0, seed = 1 } = feel;
  const lastAt = {};
  return song.events.map((e, n) => {
    const st = stepTicks(e.div);
    let tick = e.tick, vel = e.vel;
    // swing: every second step (on 8th and 16th grids) is pushed later, a third of a step at full swing
    if (swing > 0 && (e.div === 16 || e.div === 8) && e.step % 2 === 1) tick += st * swing / 3;
    const sec0 = tickToSec(e.tick, song.tempos);
    // fast strokes on the same drum come out softer (a real drummer can't hit full force at blast speed)
    if (softFast) {
      const gap = lastAt[e.lane] === undefined ? Infinity : (sec0 - lastAt[e.lane]) * 1000;
      if (gap < 110) vel = vel * (0.84 + 0.16 * Math.max(0, gap) / 110);
    }
    lastAt[e.lane] = sec0;
    if (velocity > 0) vel += (hash(seed, n, 1) * 2 - 1) * velocity;
    vel = Math.max(1, Math.min(127, Math.round(vel)));
    let dt = 0;
    if (timing > 0) {
      const bpm = bpmAtTick(e.tick, song.tempos), stepMs = st / PPQ * 60000 / bpm;
      // never more than a quarter of a step, so fast parts stay in order; kicks stay tighter (they're the grid in metal)
      const max = Math.min(timing, stepMs * 0.25) * (kickTight && e.lane === 'kick' ? 0.4 : 1);
      // a soft bell curve: most hits close to the grid, a few further out
      const u = (hash(seed, n, 2) + hash(seed, n, 3) + hash(seed, n, 4)) / 3 * 2 - 1;
      dt = u * max;
      tick += dt / 60000 * bpm * PPQ;
    }
    if (tick < 0) tick = 0;
    return { ...e, tick, vel, dt, sec: tickToSec(tick, song.tempos) };
  });
}

/** Where each section starts and ends in seconds, and the song's length */
export function songTiming(song) {
  return {
    spans: song.spans.map(s => ({ ...s, start: tickToSec(s.tick, song.tempos), end: tickToSec(s.endTick, song.tempos) })),
    length: tickToSec(song.endTick, song.tempos),
  };
}

// ---------------- MIDI files

/** Note maps: lane -> MIDI note */
export const MAPS = [
  { id: 'gm', name: 'General MIDI (most drum plugins)', notes: Object.fromEntries(LANES.map(l => [l.id, l.gm])) },
  { id: 'gm-35', name: 'General MIDI, kick on 35', notes: { ...Object.fromEntries(LANES.map(l => [l.id, l.gm])), kick: 35 } },
  { id: 'custom', name: 'My own map', notes: null },
];
export function mapNotes(project) {
  const m = MAPS.find(x => x.id === project.map?.id) || MAPS[0];
  if (m.id !== 'custom') return m.notes;
  const out = {};
  for (const l of LANES) { const n = +project.map?.custom?.[l.id]; out[l.id] = Number.isInteger(n) && n >= 0 && n <= 127 ? n : l.gm; }
  return out;
}

const vlq = n => { n = Math.max(0, Math.round(n)); const b = [n & 127]; while ((n >>= 7)) b.unshift((n & 127) | 128); return b; };
const text = s => [...new TextEncoder().encode(s)];
const metaText = (type, s) => { const b = text(s).slice(0, 200); return [0xff, type, ...vlq(b.length), ...b]; };

function track(evs, endTick = 0) {
  evs.sort((a, b) => a.tick - b.tick || a.order - b.order);
  const out = []; let last = 0;
  for (const e of evs) { out.push(...vlq(e.tick - last), ...e.bytes); last = e.tick; }
  out.push(...vlq(Math.max(0, endTick - last)), 0xff, 0x2f, 0);
  return [0x4d, 0x54, 0x72, 0x6b, (out.length >>> 24) & 255, (out.length >>> 16) & 255, (out.length >>> 8) & 255, out.length & 255, ...out];
}

/**
 * A standard MIDI file (format 1, PPQ 480): track 1 holds the tempo map, meters and section markers, track 2 the
 * drums on channel 10. hits: humanized events (float ticks are rounded). notes: lane -> MIDI note.
 */
export function writeMidi(song, hits, { notes = MAPS[0].notes, name = 'ENCORE. Drums', length = 60 } = {}) {
  const cond = [{ tick: 0, order: 0, bytes: metaText(0x03, name) }];
  for (const m of song.meters) cond.push({ tick: m.tick, order: 1, bytes: [0xff, 0x58, 4, m.num, Math.round(Math.log2(m.den)), 24, 8] });
  for (const t of song.tempos) { const us = Math.round(60000000 / t.bpm); cond.push({ tick: t.tick, order: 2, bytes: [0xff, 0x51, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255] }); }
  for (const m of song.markers) cond.push({ tick: m.tick, order: 3, bytes: metaText(0x06, m.name) });
  let end = song.endTick;
  for (const h of hits) end = Math.max(end, Math.round(h.tick) + length);
  const drums = [{ tick: 0, order: 0, bytes: metaText(0x03, 'Drums') }];
  for (const h of hits) {
    const note = notes[h.lane], t = Math.max(0, Math.round(h.tick));
    if (note === undefined || note === null) continue;
    drums.push({ tick: t, order: 2, bytes: [0x99, note & 127, Math.max(1, Math.min(127, h.vel | 0))] });
    drums.push({ tick: t + length, order: 1, bytes: [0x89, note & 127, 64] }); // note offs sort before ons at the same tick
  }
  const t1 = track(cond, end), t2 = track(drums, end); // both tracks end where the song does
  const head = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, 2, (PPQ >> 8) & 255, PPQ & 255];
  return new Uint8Array([...head, ...t1, ...t2]);
}

/** Reads a standard MIDI file: { ppq, format, notes: [{ tick, ch, note, vel }], tempos, meters, markers, endTick } */
export function readMidi(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const str = (o, n) => String.fromCharCode(...b.subarray(o, o + n));
  const u32 = o => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
  const u16 = o => (b[o] << 8) | b[o + 1];
  if (b.length < 14 || str(0, 4) !== 'MThd') throw new Error('That isn\'t a MIDI file.');
  const hlen = u32(4), format = u16(8), ntr = u16(10), div = u16(12);
  if (div & 0x8000) throw new Error('This MIDI file uses SMPTE timing, which isn\'t supported.');
  const out = { ppq: div, format, notes: [], tempos: [], meters: [], markers: [], endTick: 0 };
  let o = 8 + hlen;
  for (let t = 0; t < ntr && o + 8 <= b.length; t++) {
    if (str(o, 4) !== 'MTrk') { o += 8 + u32(o + 4); t--; if (o >= b.length) break; continue; }
    const len = u32(o + 4), end = Math.min(b.length, o + 8 + len);
    let p = o + 8, tick = 0, status = 0;
    const rv = () => { let n = 0, c; do { c = b[p++]; n = (n << 7) | (c & 127); } while (c & 128 && p < end); return n; };
    while (p < end) {
      tick += rv();
      let c = b[p];
      if (c & 0x80) { p++; if (c < 0xf0) status = c; } else c = status;
      if (c === 0xff) {
        const type = b[p++], l = rv(), d = b.subarray(p, p + l); p += l;
        if (type === 0x51 && l === 3) out.tempos.push({ tick, bpm: Math.round(60000000000 / ((d[0] << 16) | (d[1] << 8) | d[2])) / 1000 });
        else if (type === 0x58 && l >= 2) out.meters.push({ tick, num: d[0], den: 2 ** d[1] });
        else if (type === 0x06 || (type === 0x01 && l)) out.markers.push({ tick, name: new TextDecoder().decode(d), kind: type });
        else if (type === 0x2f) break;
      } else if (c === 0xf0 || c === 0xf7) { const l = rv(); p += l; }
      else {
        const kind = c & 0xf0, ch = c & 15, d1 = b[p++];
        const d2 = kind === 0xc0 || kind === 0xd0 ? 0 : b[p++];
        if (kind === 0x90 && d2 > 0) out.notes.push({ tick, ch, note: d1, vel: d2 });
      }
    }
    out.endTick = Math.max(out.endTick, tick);
    o = o + 8 + len;
  }
  const byTick = (a, b2) => a.tick - b2.tick;
  out.notes.sort(byTick); out.tempos.sort(byTick); out.meters.sort(byTick); out.markers.sort(byTick);
  return out;
}

/** Which lane a MIDI note plays (General MIDI plus its neighbours: electric snare, the other toms and cymbals) */
export const NOTE_LANE = {
  35: 'kick', 36: 'kick', 37: 'stick', 38: 'snare', 39: 'snare', 40: 'snare', 41: 'tom3', 42: 'hat', 43: 'tom3', 44: 'pedal',
  45: 'tom2', 46: 'openhat', 47: 'tom2', 48: 'tom1', 49: 'crash', 50: 'tom1', 51: 'ride', 52: 'china', 53: 'bell', 55: 'crash', 57: 'crash', 59: 'ride',
};

/**
 * A MIDI file's drums to song sections: bars that repeat become one section that plays several times; up to 4 different
 * bars in a row share a section. Picks the grid (16ths, triplets, 32nds) that fits the hits best.
 * Returns { sections, order, skipped (notes with no drum), div }
 */
export function importMidi(midi, { name = 'Imported' } = {}) {
  const scale = PPQ / midi.ppq;
  const drumCh = midi.notes.some(n => n.ch === 9);
  const notes = midi.notes.filter(n => !drumCh || n.ch === 9).map(n => ({ ...n, tick: n.tick * scale }));
  const lanes = notes.filter(n => NOTE_LANE[n.note]);
  const skipped = notes.length - lanes.length;
  if (!lanes.length) throw new Error('No drum notes in that file.');
  const meters = midi.meters.length ? midi.meters.map(m => ({ ...m, tick: m.tick * scale })) : [{ tick: 0, num: 4, den: 4 }];
  if (meters[0].tick > 0) meters.unshift({ tick: 0, num: 4, den: 4 });
  const tempos = midi.tempos.length ? midi.tempos.map(t => ({ ...t, tick: t.tick * scale })) : [{ tick: 0, bpm: 120 }];
  // bars from the meter map
  const lastTick = Math.max(...lanes.map(n => n.tick)) + 1;
  const bars = [];
  for (let mi = 0, t = 0; t < lastTick;) {
    while (mi + 1 < meters.length && meters[mi + 1].tick <= t + 1e-6) mi++;
    const m = meters[mi], len = barTicks(m.num, m.den);
    bars.push({ tick: t, num: m.num, den: m.den, len });
    t += len;
  }
  // the grid with the least timing error (a finer grid has to be clearly better to win)
  const cands = [16, 24, 32, 12, 8].filter(d => bars.every(b => gridFits(b.num, b.den, d)));
  let div = cands[0] || 32, best = Infinity;
  for (const d of cands) {
    const st = stepTicks(d);
    let err = 0; for (const n of lanes) { const r = n.tick % st; err += Math.min(r, st - r); }
    err = err / lanes.length + (d === 32 ? 6 : d === 24 ? 2 : 0);
    if (err < best - 0.5) { best = err; div = d; }
  }
  const st = stepTicks(div);
  for (const b of bars) { b.spb = stepsPerBar(b.num, b.den, div); b.grid = emptyGrid(b.spb); b.bpm = Math.round(bpmAtTick(b.tick, tempos) * 100) / 100; }
  let bi = 0;
  for (const n of lanes) {
    while (bi + 1 < bars.length && bars[bi + 1].tick <= n.tick + st / 2) bi++;
    const b = bars[bi], j = Math.round((n.tick - b.tick) / st);
    if (j >= 0 && j < b.spb) b.grid[NOTE_LANE[n.note]][j] = Math.max(b.grid[NOTE_LANE[n.note]][j], n.vel);
    else if (j === b.spb && bars[bi + 1]) bars[bi + 1].grid[NOTE_LANE[n.note]][0] = Math.max(bars[bi + 1].grid[NOTE_LANE[n.note]][0], n.vel);
  }
  // bars count as the same when the same drums hit in the same places (ghost notes and humanized velocities aside)
  const key = b => LANE_IDS.map(id => b.grid[id].map(v => v >= 50 ? 1 : 0).join('')).join('|');
  const sections = [];
  const newPart = (b, i) => ({ id: newId(), name: name + ' ' + (i + 1), color: i % 8, num: b.num, den: b.den, div, bpm: b.bpm, bpmEnd: null,
    patBars: 1, bars: 1, grid: b.grid, pattern: null, fill: { beats: 0, style: 'auto', seed: 1, grid: null }, crash: false, ghosts: 0 });
  for (const b of bars) {
    const cur = sections[sections.length - 1], k = key(b);
    if (cur && cur.num === b.num && cur.den === b.den && cur.bpm === b.bpm) {
      if (cur._keys[cur.bars % cur.patBars] === k) { cur.bars++; continue; }
      // the same bar twice in a row inside a growing pattern: split it off as a repeating part of its own
      if (cur.bars === cur.patBars && cur.patBars > 1 && cur._keys[cur.patBars - 1] === k) {
        const spb = b.spb, last = {};
        for (const id of LANE_IDS) { last[id] = cur.grid[id].slice(-spb); cur.grid[id] = cur.grid[id].slice(0, -spb); }
        cur._keys.pop(); cur.patBars--; cur.bars--;
        sections.push({ ...newPart(b, sections.length), grid: last, bars: 2, _keys: [k] });
        continue;
      }
      if (cur.bars === cur.patBars && cur.patBars < 4) {
        cur._keys.push(k); cur.patBars++; cur.bars++;
        for (const id of LANE_IDS) cur.grid[id] = cur.grid[id].concat(b.grid[id]);
        continue;
      }
    }
    sections.push({ ...newPart(b, sections.length), _keys: [k] });
  }
  for (const s of sections) delete s._keys;
  return { sections, order: sections.map(s => s.id), skipped, div };
}

// ---------------- saving and loading

const clampNum = (v, lo, hi, d) => { const n = +v; return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
/** A section read from a file, made safe (bad or missing values fixed, grids sized right) */
export function cleanSection(s, i = 0) {
  if (!s || typeof s !== 'object') return null;
  const num = Math.round(clampNum(s.num, 1, 32, 4)), den = DENS.includes(+s.den) ? +s.den : 4;
  const div = fitDiv(num, den, DIVS.some(d => d.id === +s.div) ? +s.div : 16), spb = stepsPerBar(num, den, div);
  const patBars = Math.round(clampNum(s.patBars, 1, 8, 1)), n = spb * patBars;
  const grid = emptyGrid(n);
  for (const id of LANE_IDS) { const src = Array.isArray(s.grid?.[id]) ? s.grid[id] : []; for (let k = 0; k < n; k++) grid[id][k] = Math.round(clampNum(src[k], 0, 127, 0)); }
  let bars = Math.round(clampNum(s.bars, 1, 256, 4)); bars = Math.max(bars, patBars);
  const fill = { beats: clampNum(s.fill?.beats, 0, num, 0), style: typeof s.fill?.style === 'string' ? s.fill.style : 'auto', seed: Math.round(clampNum(s.fill?.seed, 1, 1e9, 1)), grid: null };
  const fs = Math.min(spb, Math.round(fill.beats * div / den));
  if (fs && s.fill?.grid && Array.isArray(s.fill.grid.kick) && s.fill.grid.kick.length === fs) {
    fill.grid = emptyGrid(fs); fill.div = div;
    for (const id of LANE_IDS) for (let k = 0; k < fs; k++) fill.grid[id][k] = Math.round(clampNum(s.fill.grid[id]?.[k], 0, 127, 0));
  }
  const sec = {
    id: typeof s.id === 'string' && s.id ? s.id.slice(0, 40) : newId(), name: (typeof s.name === 'string' ? s.name : '').replace(/[\u0000-\u001f]/g, '').slice(0, 40) || 'Section ' + (i + 1),
    color: Math.round(clampNum(s.color, 0, 7, i % 8)), num, den, div, bpm: clampNum(s.bpm, 20, 400, 120),
    bpmEnd: s.bpmEnd ? clampNum(s.bpmEnd, 20, 400, null) : null, patBars, bars, grid, pattern: typeof s.pattern === 'string' ? s.pattern : null,
    fill, crash: s.crash !== false, ghosts: clampNum(s.ghosts, 0, 1, 0),
  };
  return refreshFill(sec);
}

export function cleanProject(p) {
  if (!p || typeof p !== 'object' || !Array.isArray(p.sections)) throw new Error('That isn\'t an ENCORE. Drums song.');
  const sections = p.sections.slice(0, 64).map(cleanSection).filter(Boolean);
  const seen = new Set();
  for (const s of sections) { while (seen.has(s.id)) s.id = newId(); seen.add(s.id); }
  if (!sections.length) throw new Error('That song has no sections.');
  const order = (Array.isArray(p.order) ? p.order : []).filter(id => seen.has(id)).slice(0, 512);
  const f = p.feel || {};
  const custom = {};
  for (const l of LANES) { const n = Math.round(+p.map?.custom?.[l.id]); custom[l.id] = n >= 0 && n <= 127 ? n : l.gm; }
  return {
    v: 1, name: (typeof p.name === 'string' ? p.name : '').slice(0, 60) || 'My song', sections, order: order.length ? order : sections.map(s => s.id),
    feel: { timing: clampNum(f.timing, 0, 30, 6), velocity: clampNum(f.velocity, 0, 30, 8), softFast: f.softFast !== false, kickTight: f.kickTight !== false,
            swing: clampNum(f.swing, 0, 1, 0), seed: Math.round(clampNum(f.seed, 1, 1e9, 1)) },
    map: { id: MAPS.some(m => m.id === p.map?.id) ? p.map.id : 'gm', custom },
    kit: typeof p.kit === 'string' ? p.kit : 'encore',
  };
}

export const safeName = s => String(s || 'drums').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').replace(/\s+/g, '_').replace(/^\.+/, '').slice(0, 60) || 'drums';

// ---------------- the mixdown (WAV/MP3 export and the player both use it, so you hear exactly what you export)

/** Drummer's-view placement: hats left, ride right, toms left to right */
export const PAN = { crash: -0.25, china: 0.35, ride: 0.35, bell: 0.35, openhat: -0.3, hat: -0.3, pedal: -0.3, tom1: -0.2, tom2: 0.05, tom3: 0.3, snare: 0, stick: 0, kick: 0 };
export const velGain = v => Math.pow(Math.min(127, Math.max(0, v)) / 127, 1.6);

/**
 * Mix timed hits into stereo. sounds: { lane: { data: Float32Array, rate (playback speed), gain } } at `sr`.
 * The open hat is cut short by the next closed or pedal hat. Returns { l, r } Float32Arrays.
 */
export function mixdown(hits, sounds, sr, { length = null, tail = 1.5, master = 0.8 } = {}) {
  const evs = hits.filter(h => sounds[h.lane]?.data).slice().sort((a, b) => a.sec - b.sec);
  const endSec = length ?? (evs.length ? evs[evs.length - 1].sec : 0) + tail;
  const n = Math.max(1, Math.ceil(endSec * sr)), l = new Float32Array(n), r = new Float32Array(n);
  const choke = evs.filter(e => laneById[e.lane].choke);
  for (const e of evs) {
    const snd = sounds[e.lane], rate = snd.rate || 1, data = snd.data;
    let len = Math.floor((data.length - 1) / rate), cut = false;
    if (laneById[e.lane].choke && e.lane === 'openhat') {
      const next = choke.find(c => c.sec > e.sec + 1e-4 && c.lane !== 'openhat');
      const at = next ? Math.floor((next.sec - e.sec) * sr) + Math.floor(sr * 0.012) : Infinity;
      if (at < len) { len = at; cut = true; }
    }
    const start = Math.round(e.sec * sr), g = velGain(e.vel) * (snd.gain ?? 1) * master, pan = PAN[e.lane] || 0;
    const gl = g * Math.cos((pan + 1) * Math.PI / 4) * Math.SQRT2, gr = g * Math.sin((pan + 1) * Math.PI / 4) * Math.SQRT2;
    const fade = Math.max(1, cut ? Math.floor(sr * 0.012) : Math.min(64, len >> 2)); // a choked hat closes over 12 ms
    for (let i = 0; i < len; i++) {
      const o = start + i;
      if (o >= n) break;
      const p = i * rate, k = p | 0, f = p - k;
      let v = data[k] + (data[k + 1] - data[k]) * f;
      if (i > len - fade) v *= (len - i) / fade;
      l[o] += v * gl; r[o] += v * gr;
    }
  }
  // a gentle safety limiter so a pile of hits can't clip
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(l[i]), Math.abs(r[i]));
  if (peak > 0.98) { const k = 0.98 / peak; for (let i = 0; i < n; i++) { l[i] *= k; r[i] *= k; } }
  return { l, r };
}
