// ENCORE. Practice: the pure parts (no DOM, no Web Audio). Loop math, the speed trainer, markers,
// the zoomed view, keyboard shortcuts, and what gets saved per song.

export const SPEED_MIN = 0.25, SPEED_MAX = 1.5;
export const MIN_LOOP = 0.1; // seconds

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const round3 = (v) => Math.round(v * 1000) / 1000;

// ------------------------------------------------------------------ loops
/** A tidy loop: a <= b, inside the song, at least MIN_LOOP long. */
export function normLoop(a, b, dur) {
  if (!(dur > 0)) return { a: 0, b: 0 };
  a = clamp(+a || 0, 0, dur); b = clamp(+b || 0, 0, dur);
  if (b < a) [a, b] = [b, a];
  if (b - a < MIN_LOOP) { b = Math.min(dur, a + MIN_LOOP); a = Math.max(0, b - MIN_LOOP); }
  return { a: round3(a), b: round3(b) };
}
export const halveLoop = (l, dur) => normLoop(l.a, l.a + (l.b - l.a) / 2, dur);
export const doubleLoop = (l, dur) => normLoop(l.a, Math.min(dur, l.a + (l.b - l.a) * 2), dur);
/** Move the whole loop by d seconds, keeping its length. */
export function shiftLoop(l, d, dur) {
  const len = l.b - l.a, a = clamp(l.a + d, 0, Math.max(0, dur - len));
  return normLoop(a, a + len, dur);
}
/** Where playback is in "loop time": real song seconds -> after the loop wraps. */
export function wrapTime(t, l) {
  if (!l || !(l.b > l.a) || t < l.b) return t;
  const L = l.b - l.a;
  return l.a + ((t - l.b) % L);
}

// ------------------------------------------------------------------ the speed trainer
/**
 * Start slow, go a little faster every few loops, stop at the target.
 * cfg: { start, step, every, target } (speeds as fractions, e.g. 0.6, 0.05, 2, 1.0)
 */
export function trainerStart(cfg) {
  const c = trainerCfg(cfg);
  return { speed: c.start, loops: 0, done: c.start >= c.target - 1e-9 };
}
export function trainerCfg(cfg = {}) {
  const start = clamp(+cfg.start || 0.6, SPEED_MIN, SPEED_MAX);
  const target = clamp(+cfg.target || 1, start, SPEED_MAX);
  return { start, target, step: clamp(+cfg.step || 0.05, 0.01, 0.5), every: clamp(Math.round(+cfg.every || 2), 1, 20) };
}
/** One more loop went by. Returns the new state (speed may go up). */
export function trainerLoop(state, cfg) {
  const c = trainerCfg(cfg);
  if (state.done) return { ...state };
  const loops = state.loops + 1;
  if (loops < c.every) return { ...state, loops };
  const speed = round3(Math.min(c.target, state.speed + c.step));
  return { speed, loops: 0, done: speed >= c.target - 1e-9 };
}
/** How many loops the whole climb takes. */
export function trainerTotal(cfg) {
  const c = trainerCfg(cfg);
  return Math.ceil(round3((c.target - c.start) / c.step) - 1e-9) * c.every;
}

// ------------------------------------------------------------------ markers
const SECTION_NAMES = ["Intro", "Verse", "Chorus", "Verse 2", "Chorus 2", "Bridge", "Solo", "Chorus 3", "Outro"];
export function nextMarkerName(markers) {
  const used = new Set(markers.map((m) => m.name));
  for (const n of SECTION_NAMES) if (!used.has(n)) return n;
  let i = markers.length + 1;
  while (used.has("Marker " + i)) i++;
  return "Marker " + i;
}
/** Add a marker (kept sorted). Markers closer than 0.05 s to an old one replace nothing: they're skipped. */
export function addMarker(markers, t, name) {
  t = round3(t);
  if (markers.some((m) => Math.abs(m.t - t) < 0.05)) return markers.slice();
  return [...markers, { t, name: (name || nextMarkerName(markers)).slice(0, 40) }].sort((a, b) => a.t - b.t);
}
export const removeMarker = (markers, i) => markers.filter((_, k) => k !== i);
/** The section around t: from the marker at or before t to the next one (or the song's ends). */
export function sectionAt(markers, t, dur) {
  let a = 0, b = dur;
  for (const m of markers) { if (m.t <= t + 1e-6) a = m.t; else { b = m.t; break; } }
  return normLoop(a, b, dur);
}
/** Previous / next marker time from t (for jumping). */
export function prevMarker(markers, t, slack = 0.6) {
  let best = 0;
  for (const m of markers) if (m.t < t - slack) best = m.t;
  return best;
}
export function nextMarker(markers, t, dur) {
  for (const m of markers) if (m.t > t + 0.05) return m.t;
  return dur;
}

// ------------------------------------------------------------------ the zoomed view
/** A view window `span` seconds long, kept inside the song. */
export function viewWindow(start, span, dur) {
  span = clamp(span, Math.min(dur, 0.5), dur);
  start = clamp(start, 0, Math.max(0, dur - span));
  return { start, end: start + span };
}
/** Zoom by factor around time t, keeping t at the same place on screen. */
export function zoomAt(view, factor, t, dur) {
  const span = view.end - view.start, ns = clamp(span / factor, Math.min(dur, 0.5), dur);
  const frac = span > 0 ? (t - view.start) / span : 0.5;
  return viewWindow(t - frac * ns, ns, dur);
}
export const timeToX = (t, view, w) => ((t - view.start) / (view.end - view.start)) * w;
export const xToTime = (x, view, w) => view.start + (x / w) * (view.end - view.start);
/** Keep the playhead visible: page the view when it runs off the right edge. */
export function follow(view, t, dur) {
  const span = view.end - view.start;
  if (t >= view.start && t <= view.end - span * 0.02) return view;
  return viewWindow(t - span * 0.1, span, dur);
}

// ------------------------------------------------------------------ keys
/** keyboard event -> action name (null if the key isn't ours) */
export function keyAction(e) {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  const k = e.key;
  if (e.code === "Space" || k === " ") return "play";
  if (k === "[") return "setA";
  if (k === "]") return "setB";
  if (k === "l" || k === "L") return "loop";
  if (k === "m" || k === "M") return "marker";
  if (k === "ArrowLeft") return e.shiftKey ? "back1" : "back5";
  if (k === "ArrowRight") return e.shiftKey ? "fwd1" : "fwd5";
  if (k === "ArrowUp") return "faster";
  if (k === "ArrowDown") return "slower";
  if (k === "=" || k === "+") return "keyUp";
  if (k === "-" || k === "_") return "keyDown";
  if (k === "Home" || k === "r" || k === "R") return "restart";
  if (k === "v" || k === "V") return "vocal";
  if (k === "t" || k === "T") return "trainer";
  if (k === "," || k === "<") return "prevMarker";
  if (k === "." || k === ">") return "nextMarker";
  if (k === "0") return "speed100";
  if (/^[1-9]$/.test(k)) return "marker" + k;
  return null;
}

// ------------------------------------------------------------------ what's saved per song
export const DEFAULT_SONG = Object.freeze({ speed: 1, semis: 0, cents: 0, vocal: 0, focus: "off", loop: null, loopOn: false, gap: 0, loops: [], markers: [], pos: 0 });

/** A song's identity: name, size and length (so a renamed copy still finds its loops if the size matches). */
export const songKey = (name, size, dur) => `${String(name || "").toLowerCase()}|${size | 0}|${Math.round(dur * 10)}`;

/** Clean up saved data (from IndexedDB or an imported file). */
export function sanitizeSong(d, dur = Infinity) {
  const out = { ...DEFAULT_SONG };
  if (!d || typeof d !== "object") return out;
  const num = (v, lo, hi, def) => (typeof v === "number" && isFinite(v) ? clamp(v, lo, hi) : def);
  out.speed = num(d.speed, SPEED_MIN, SPEED_MAX, 1);
  out.semis = Math.round(num(d.semis, -12, 12, 0));
  out.cents = Math.round(num(d.cents, -50, 50, 0));
  out.vocal = num(d.vocal, 0, 1, 0);
  out.focus = ["off", "bass", "vocal", "guitar"].includes(d.focus) ? d.focus : "off";
  out.gap = num(d.gap, 0, 8, 0);
  out.pos = num(d.pos, 0, dur, 0);
  const okLoop = (l) => l && typeof l.a === "number" && typeof l.b === "number" && isFinite(l.a) && isFinite(l.b);
  out.loop = okLoop(d.loop) ? normLoop(d.loop.a, d.loop.b, dur === Infinity ? Math.max(d.loop.a, d.loop.b) : dur) : null;
  out.loopOn = !!d.loopOn && !!out.loop;
  out.loops = Array.isArray(d.loops) ? d.loops.filter(okLoop).slice(0, 100).map((l, i) => ({ name: String(l.name || `Loop ${i + 1}`).slice(0, 40), ...normLoop(l.a, l.b, dur === Infinity ? Math.max(l.a, l.b) : dur) })) : [];
  out.markers = Array.isArray(d.markers) ? d.markers.filter((m) => m && typeof m.t === "number" && isFinite(m.t) && m.t >= 0 && m.t <= dur).slice(0, 200)
    .map((m) => ({ t: round3(m.t), name: String(m.name || "Marker").slice(0, 40) })).sort((a, b) => a.t - b.t) : [];
  return out;
}

/** The file people can keep or move to another device. */
export function exportSongData(name, d) {
  return JSON.stringify({ app: "ENCORE. Practice", version: 1, song: name, loops: d.loops, markers: d.markers, loop: d.loop, speed: d.speed, semis: d.semis, cents: d.cents }, null, 2);
}
export function importSongData(text, dur) {
  let j;
  try { j = JSON.parse(text); } catch { throw new Error("That file isn't a Practice loops file."); }
  if (!j || j.app !== "ENCORE. Practice") throw new Error("That file isn't a Practice loops file.");
  return sanitizeSong(j, dur);
}

/** "75%", "+2 st -10 c" style labels */
export const speedLabel = (s) => Math.round(s * 100) + "%";
export function keyLabel(semis, cents) {
  if (!semis && !cents) return "original key";
  const p = [];
  if (semis) p.push((semis > 0 ? "+" : "") + semis + (Math.abs(semis) === 1 ? " semitone" : " semitones"));
  if (cents) p.push((cents > 0 ? "+" : "") + cents + " cents");
  return p.join(", ");
}
/** parse "1:23.4", "83.4" or "1:02:03" into seconds (NaN if it isn't a time) */
export function parseTime(s) {
  s = String(s).trim();
  if (!/^\d+(:\d{1,2})*(\.\d+)?$/.test(s)) return NaN;
  return s.split(":").reduce((acc, p) => acc * 60 + parseFloat(p), 0);
}
