// ENCORE. Ear: the trainer, with no page in it (test-ear.mjs). Questions for five drills
// (scale degrees in a key, intervals, chord qualities, chord progressions, short melodic
// dictation), what to play for each (a list of timed notes), answer checking, a plain "why"
// after every answer, and the adaptive part: each item (degree 7, a minor 6th, a diminished
// chord, the IV chord...) has a Leitner box and recent accuracy; weak and new items come up
// more, a wrong answer brings back the pair you confused, and a new item unlocks once every
// item in play is above 85%. Daily goal, day streak and stats are plain data for localStorage.

const mod = (n, m) => ((n % m) + m) % m;
export const SHARP = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
export const keyName = (pc) => SHARP[mod(pc, 12)];
export const noteName = (m) => SHARP[mod(m, 12)] + (Math.floor(m / 12) - 1);

/** A small seeded random (tests); the page passes Math.random */
export function seeded(seed = 1) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const pick = (arr, rnd) => arr[Math.floor(rnd() * arr.length) % arr.length];
const randInt = (a, b, rnd) => a + Math.floor(rnd() * (b - a + 1));

// ---------- the material ----------
export const MAJOR = [0, 2, 4, 5, 7, 9, 11], MINOR = [0, 2, 3, 5, 7, 8, 10];
export const SOLFEGE = { major: ["do", "re", "mi", "fa", "sol", "la", "ti"], minor: ["do", "re", "me", "fa", "sol", "le", "te"] };
export const DEG_LABEL = { major: ["1", "2", "3", "4", "5", "6", "7"], minor: ["1", "2", "b3", "4", "5", "b6", "b7"] };
export const INTERVALS = [
  { semi: 1, name: "minor 2nd", short: "m2" }, { semi: 2, name: "major 2nd", short: "M2" }, { semi: 3, name: "minor 3rd", short: "m3" },
  { semi: 4, name: "major 3rd", short: "M3" }, { semi: 5, name: "perfect 4th", short: "P4" }, { semi: 6, name: "tritone", short: "TT" },
  { semi: 7, name: "perfect 5th", short: "P5" }, { semi: 8, name: "minor 6th", short: "m6" }, { semi: 9, name: "major 6th", short: "M6" },
  { semi: 10, name: "minor 7th", short: "m7" }, { semi: 11, name: "major 7th", short: "M7" }, { semi: 12, name: "octave", short: "P8" },
];
export const CHORDS = [
  { id: "maj", name: "Major", tones: [0, 4, 7] }, { id: "min", name: "Minor", tones: [0, 3, 7] },
  { id: "dim", name: "Diminished", tones: [0, 3, 6] }, { id: "aug", name: "Augmented", tones: [0, 4, 8] },
  { id: "dom7", name: "Dominant 7th", tones: [0, 4, 7, 10] }, { id: "maj7", name: "Major 7th", tones: [0, 4, 7, 11] },
  { id: "min7", name: "Minor 7th", tones: [0, 3, 7, 10] }, { id: "m7b5", name: "Half-diminished", tones: [0, 3, 6, 10] },
  { id: "sus4", name: "Sus 4", tones: [0, 5, 7] }, { id: "sus2", name: "Sus 2", tones: [0, 2, 7] },
];
// diatonic chords of a major key: numeral, root degree (0-6), triad tones from the root
export const NUMERALS = [
  { id: "I", deg: 0, tones: [0, 4, 7] }, { id: "ii", deg: 1, tones: [0, 3, 7] }, { id: "iii", deg: 2, tones: [0, 3, 7] },
  { id: "IV", deg: 3, tones: [0, 4, 7] }, { id: "V", deg: 4, tones: [0, 4, 7] }, { id: "vi", deg: 5, tones: [0, 3, 7] },
  { id: "vii°", deg: 6, tones: [0, 3, 6] },
];

/** The order items are introduced in (research: start far apart, then split near neighbours) */
export const CURRICULUM = {
  degrees: ["1", "5", "3", "2", "7", "4", "6"],
  intervals: [7, 12, 4, 3, 5, 2, 9, 1, 8, 10, 11, 6].map(String),
  chords: ["maj", "min", "dim", "aug", "dom7", "maj7", "min7", "m7b5", "sus4", "sus2"],
  progressions: ["I", "IV", "V", "vi", "ii", "iii", "vii°"],
  melody: ["1", "5", "3", "2", "7", "4", "6"],
};
export const START = { degrees: 3, intervals: 3, chords: 2, progressions: 3, melody: 3 };
export const MODES = [
  { id: "degrees", name: "Scale degrees" }, { id: "intervals", name: "Intervals" }, { id: "chords", name: "Chords" },
  { id: "progressions", name: "Progressions" }, { id: "melody", name: "Melody" },
];
export const DEFAULT_SETTINGS = {
  quality: "major", context: "cadence", wide: false, dirs: { up: true, down: false, together: false },
  inversions: false, arpeggio: false, progLen: 4, melLen: 4, instrument: "Piano", speed: 1, autoNext: true, goal: 30, custom: {},
};
export const itemKey = (mode, item, settings = DEFAULT_SETTINGS) => (mode === "degrees" || mode === "melody" ? `${mode}:${settings.quality || "major"}:${item}` : `${mode}:${item}`);

// ---------- labels for the answer buttons ----------
/** The choices for a mode in curriculum or natural order: [{ id, label, sub, key }] (key: the keyboard shortcut) */
export function choicesFor(mode, pool, settings = DEFAULT_SETTINGS) {
  const q = settings.quality || "major";
  if (mode === "degrees" || mode === "melody") {
    return ["1", "2", "3", "4", "5", "6", "7"].map((d) => ({ id: d, label: DEG_LABEL[q][+d - 1], sub: SOLFEGE[q][+d - 1], key: d, off: !pool.includes(d) }));
  }
  if (mode === "intervals") return INTERVALS.map((iv, i) => ({ id: String(iv.semi), label: iv.short, sub: iv.name, key: "1234567890-="[i], off: !pool.includes(String(iv.semi)) }));
  if (mode === "chords") return CHORDS.map((c, i) => ({ id: c.id, label: c.name, sub: c.tones.join("-"), key: "1234567890"[i], off: !pool.includes(c.id) }));
  return NUMERALS.map((n, i) => ({ id: n.id, label: n.id, sub: ["home", "pre-dominant", "soft minor", "away", "tension", "sad", "leading"][i], key: String(i + 1), off: !pool.includes(n.id) }));
}

// ---------- stats and scheduling ----------
export function newStats() { return { v: 1, items: {}, levels: {}, days: {}, best: 0, q: 0, confusion: {} }; }
/** Stats from storage, tidied (anything missing is filled in) */
export function cleanStats(s) {
  const out = newStats();
  if (!s || typeof s !== "object") return out;
  if (s.items && typeof s.items === "object") for (const [k, v] of Object.entries(s.items)) if (v && typeof v === "object") out.items[k] = { seen: +v.seen || 0, right: +v.right || 0, box: Math.max(0, Math.min(5, +v.box || 0)), recent: Array.isArray(v.recent) ? v.recent.slice(-12).map((x) => (x ? 1 : 0)) : [], ms: +v.ms || 0, last: +v.last || 0 };
  if (s.levels && typeof s.levels === "object") for (const [k, v] of Object.entries(s.levels)) out.levels[k] = Math.max(1, Math.round(+v || 1));
  if (s.days && typeof s.days === "object") for (const [k, v] of Object.entries(s.days)) if (/^\d{4}-\d\d-\d\d$/.test(k) && v) out.days[k] = { n: +v.n || 0, right: +v.right || 0 };
  if (s.confusion && typeof s.confusion === "object") for (const [k, v] of Object.entries(s.confusion)) out.confusion[k] = +v || 0;
  out.best = +s.best || 0; out.q = +s.q || 0;
  return out;
}
export const itemStat = (stats, key) => stats.items[key] || { seen: 0, right: 0, box: 0, recent: [], ms: 0, last: -99 };
/** Recent accuracy with a gentle prior for items barely seen: (right + 1) / (n + 2) over the last 12 */
export function accuracy(st) { const r = st.recent || []; return (r.reduce((a, x) => a + x, 0) + 1) / (r.length + 2); }
const levelKey = (mode, settings) => (mode === "degrees" || mode === "melody" ? `${mode}:${settings.quality || "major"}` : mode);
/** The items in play for a mode: the user's own pick, or the first N of the curriculum */
export function poolFor(stats, mode, settings = DEFAULT_SETTINGS) {
  const custom = settings.custom?.[mode];
  if (Array.isArray(custom) && custom.length >= 2) return CURRICULUM[mode].filter((x) => custom.includes(x));
  const n = Math.min(CURRICULUM[mode].length, stats.levels[levelKey(mode, settings)] || START[mode]);
  return CURRICULUM[mode].slice(0, n);
}
/**
 * Record an answer to one item. correct, ms (time to answer), picked (what they chose, for the confusion table).
 * Leitner: right and quick moves up a box, right but slow stays, wrong drops two boxes.
 */
export function record(stats, mode, item, correct, ms = 3000, picked = null, settings = DEFAULT_SETTINGS) {
  const key = itemKey(mode, item, settings), s = { ...itemStat(stats, key) };
  s.seen++; if (correct) s.right++;
  s.recent = [...s.recent, correct ? 1 : 0].slice(-12);
  s.ms = s.ms ? Math.round(s.ms * 0.7 + ms * 0.3) : Math.round(ms);
  s.box = correct ? (ms < 6000 ? Math.min(5, s.box + 1) : s.box) : Math.max(0, s.box - 2);
  s.last = stats.q;
  stats.items[key] = s;
  if (!correct && picked !== null && picked !== undefined && String(picked) !== String(item)) {
    const ck = `${mode}:${item}>${picked}`;
    stats.confusion[ck] = (stats.confusion[ck] || 0) + 1;
  }
  return s;
}
/** After a question: count it, and unlock the next curriculum item when every item in play is solid. Returns the new item or null */
export function afterQuestion(stats, mode, allRight, settings = DEFAULT_SETTINGS, day = today()) {
  stats.q++;
  const d = stats.days[day] || { n: 0, right: 0 };
  d.n++; if (allRight) d.right++;
  stats.days[day] = d;
  return maybeUnlock(stats, mode, settings);
}
export function maybeUnlock(stats, mode, settings = DEFAULT_SETTINGS) {
  if (Array.isArray(settings.custom?.[mode]) && settings.custom[mode].length >= 2) return null;
  const pool = poolFor(stats, mode, settings), all = CURRICULUM[mode];
  if (pool.length >= all.length) return null;
  const solid = pool.every((it) => { const s = itemStat(stats, itemKey(mode, it, settings)); const r = s.recent.slice(-8); return r.length >= 6 && r.reduce((a, x) => a + x, 0) / r.length >= 0.85; });
  if (!solid) return null;
  stats.levels[levelKey(mode, settings)] = pool.length + 1;
  return all[pool.length];
}
/** Make it easier: take the last unlocked item out of play (never below the start) */
export function levelDown(stats, mode, settings = DEFAULT_SETTINGS) {
  const k = levelKey(mode, settings), n = poolFor(stats, mode, settings).length;
  stats.levels[k] = Math.max(START[mode], n - 1);
}
/**
 * The next item to ask, weighted toward weak, new and overdue ones, never the same item twice in a row (if there's a
 * choice). opts: { last, confusedWith: [a, b] (the pair just mixed up: half the time one of them comes back) }
 */
export function pickItem(stats, mode, pool, rnd = Math.random, opts = {}) {
  const settings = opts.settings || DEFAULT_SETTINGS;
  if (opts.confusedWith && rnd() < 0.5) {
    const pair = opts.confusedWith.map(String).filter((x) => pool.includes(x));
    if (pair.length) return pick(pair, rnd);
  }
  const weights = pool.map((it) => weightOf(stats, mode, it, settings, opts.last));
  let total = weights.reduce((a, w) => a + w, 0), r = rnd() * total;
  for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) return pool[i]; }
  return pool[pool.length - 1];
}
const BOX_W = [1.6, 1.3, 1.0, 0.72, 0.5, 0.36];
export function weightOf(stats, mode, item, settings = DEFAULT_SETTINGS, last = null) {
  const s = itemStat(stats, itemKey(mode, item, settings)), acc = accuracy(s);
  let w = Math.pow(1.15 - acc, 2) * BOX_W[s.box] * 4;
  if (s.seen < 3) w *= 1.8;
  if (stats.q - s.last > 3 * 2 ** s.box) w *= 1.5;  // overdue for its box
  if (last !== null && String(last) === String(item)) w *= 0.06;
  return Math.max(0.02, w);
}
/** Weakest first: [{ item, key, acc (0..1), seen, box, ms }] */
export function weakest(stats, mode, settings = DEFAULT_SETTINGS) {
  return CURRICULUM[mode].map((item) => { const key = itemKey(mode, item, settings), s = itemStat(stats, key); return { item, key, acc: s.seen ? s.recent.reduce((a, x) => a + x, 0) / Math.max(1, s.recent.length) : null, seen: s.seen, box: s.box, ms: s.ms }; })
    .filter((x) => x.seen > 0).sort((a, b) => a.acc - b.acc || b.seen - a.seen);
}
/** The pairs most often mixed up in a mode: [{ item, picked, n }] */
export function topConfusions(stats, mode, n = 3) {
  return Object.entries(stats.confusion).filter(([k]) => k.startsWith(mode + ":")).map(([k, v]) => { const [item, picked] = k.slice(mode.length + 1).split(">"); return { item, picked, n: v }; }).sort((a, b) => b.n - a.n).slice(0, n);
}

// ---------- days, goal, streak ----------
export function today(d = new Date()) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
const dayBefore = (day) => { const [y, m, d] = day.split("-").map(Number); return today(new Date(y, m - 1, d - 1)); };
/** Days in a row the goal was met, counting today if met (else up to yesterday) */
export function dayStreak(stats, goal, day = today()) {
  let n = 0, cur = (stats.days[day]?.n || 0) >= goal ? day : dayBefore(day);
  while ((stats.days[cur]?.n || 0) >= goal) { n++; cur = dayBefore(cur); }
  return n;
}
export function todayCount(stats, day = today()) { return stats.days[day] || { n: 0, right: 0 }; }

// ---------- what to play ----------
// a question's sound: [{ t (seconds), midis: [...], dur }], plus the parts the page can replay alone
const chordAt = (root, tones) => tones.map((x) => root + x);
/** A cadence that sets the key: I IV V I with a bass note, about 2 seconds */
export function cadence(tonic, quality = "major", t0 = 0, step = 0.5) {
  const minor = quality === "minor";
  const I = minor ? [tonic - 12, tonic + 3, tonic + 7, tonic + 12] : [tonic - 12, tonic + 4, tonic + 7, tonic + 12];
  const IV = minor ? [tonic - 7, tonic + 5, tonic + 8, tonic + 12] : [tonic - 7, tonic + 5, tonic + 9, tonic + 12];
  const V = [tonic - 5, tonic + 2, tonic + 7, tonic + 11];
  return [I, IV, V, I].map((midis, i) => ({ t: t0 + i * step, midis, dur: i === 3 ? step * 1.6 : step * 0.95 }));
}
const tonicChord = (tonic, quality, t0 = 0) => [{ t: t0, midis: quality === "minor" ? [tonic - 12, tonic, tonic + 3, tonic + 7] : [tonic - 12, tonic, tonic + 4, tonic + 7], dur: 1.1 }];
const contextFor = (tonic, s) => (s.context === "none" ? [] : s.context === "chord" ? tonicChord(tonic, s.quality) : cadence(tonic, s.quality, 0, 0.5 / (s.speed || 1)));
const ctxEnd = (ev) => (ev.length ? Math.max(...ev.map((e) => e.t + e.dur)) + 0.25 : 0);
export const degreeMidi = (tonic, deg, quality = "major") => tonic + (quality === "minor" ? MINOR : MAJOR)[mod(deg - 1, 7)] + 12 * Math.floor((deg - 1) / 7);
/** After a degree answer: the note walks home (2 3 4 down to 1, 5 6 7 up to 8) so the ear learns its pull */
export function resolution(deg) {
  const d = +deg;
  if (d === 1) return [1];
  if (d <= 4) return Array.from({ length: d }, (_, i) => d - i);
  return Array.from({ length: 9 - d }, (_, i) => d + i);
}

/**
 * A new question. -> { mode, items: [ids asked, in order], prompt, sub, tonic, events, focus (the notes asked about, for replay),
 *   answerCount, choices, notes (midis to show on the keyboard) }
 * items: what to ask (from pickItem); progressions and melody take several.
 */
export function makeQuestion(mode, items, settings = DEFAULT_SETTINGS, rnd = Math.random) {
  const s = { ...DEFAULT_SETTINGS, ...settings }, sp = 1 / (s.speed || 1);
  if (mode === "degrees") {
    const tonic = randInt(55, 64, rnd), deg = String(items[0]);
    const ctx = contextFor(tonic, s), t = ctxEnd(ctx) + 0.15;
    let m = degreeMidi(tonic, +deg, s.quality);
    if (s.wide) m += pick([-12, 0, 0, 12], rnd); else if (deg === "1" && rnd() < 0.4) m += 12;
    const focus = [{ t: 0, midis: [m], dur: 1.0 * sp }];
    return { mode, items: [deg], tonic, key: keyName(tonic) + (s.quality === "minor" ? " minor" : " major"), prompt: "Which scale degree?", sub: `Key of ${keyName(tonic)} ${s.quality}. The key, then one note.`, context: ctx, focus, events: [...ctx, ...shift(focus, t)], answerCount: 1, notes: [m], target: [m] };
  }
  if (mode === "intervals") {
    const semi = +items[0], dirs = Object.entries(s.dirs || {}).filter(([, on]) => on).map(([d]) => d);
    const dir = pick(dirs.length ? dirs : ["up"], rnd);
    const root = dir === "down" ? randInt(60, 72, rnd) : randInt(50, 64, rnd), other = dir === "down" ? root - semi : root + semi;
    const focus = dir === "together" ? [{ t: 0, midis: [root, other], dur: 1.6 * sp }] : [{ t: 0, midis: [root], dur: 0.75 * sp }, { t: 0.8 * sp, midis: [other], dur: 1.0 * sp }];
    return { mode, items: [String(semi)], dir, root, prompt: "Which interval?", sub: dir === "together" ? "Two notes at once." : `Two notes, the second one ${dir === "down" ? "lower" : "higher"}.`, context: [], focus, events: focus, answerCount: 1, notes: [root, other], target: [other] };
  }
  if (mode === "chords") {
    const c = CHORDS.find((x) => x.id === items[0]) || CHORDS[0], root = randInt(50, 60, rnd);
    let midis = chordAt(root, c.tones);
    if (s.inversions) { const inv = randInt(0, c.tones.length - 1, rnd); for (let k = 0; k < inv; k++) midis = [...midis.slice(1), midis[0] + 12]; }
    const focus = [];
    if (s.arpeggio) midis.forEach((m, i) => focus.push({ t: i * 0.28 * sp, midis: [m], dur: 0.5 * sp }));
    const tb = s.arpeggio ? midis.length * 0.28 * sp + 0.2 : 0;
    focus.push({ t: tb, midis: [root - 12, ...midis], dur: 1.6 * sp });
    return { mode, items: [c.id], root, prompt: "Which kind of chord?", sub: s.inversions ? "Any inversion. Listen to the colour, not the bass." : "One chord, root at the bottom.", context: [], focus, events: focus, answerCount: 1, notes: [root - 12, ...midis], target: midis };
  }
  if (mode === "progressions") {
    const tonic = randInt(53, 62, rnd), chords = ["I", ...items.map(String)];
    let prev = null; const focus = [];
    chords.forEach((id, i) => {
      const n = NUMERALS.find((x) => x.id === id), root = tonic + MAJOR[n.deg];
      const v = voiceLead(prev, n.tones.map((x) => mod(root + x, 12)), tonic + 6);
      prev = v;
      focus.push({ t: i * 0.9 * sp, midis: [mod(root, 12) + 36 + (mod(root, 12) < 5 ? 12 : 0), ...v], dur: 0.85 * sp });
    });
    return { mode, items: chords.slice(1), tonic, key: keyName(tonic) + " major", prompt: `Name chords 2 to ${chords.length}`, sub: `Key of ${keyName(tonic)} major. It starts on I (home).`, context: [], focus, events: focus, answerCount: chords.length - 1, notes: focus.flatMap((e) => e.midis), target: [] };
  }
  // melody: starts on 1 (given), then the asked degrees, each within a sixth of the one before
  const tonic = randInt(57, 65, rnd), degs = ["1", ...items.map(String)];
  const ctx = contextFor(tonic, s), t = ctxEnd(ctx) + 0.15;
  let prevM = tonic; const focus = [];
  degs.forEach((d, i) => {
    const base = degreeMidi(tonic, +d, s.quality);
    const m = [base - 12, base, base + 12].reduce((a, b) => (Math.abs(b - prevM) < Math.abs(a - prevM) ? b : a));
    focus.push({ t: i * 0.55 * sp, midis: [m], dur: 0.5 * sp }); prevM = m;
  });
  return { mode, items: degs.slice(1), tonic, key: keyName(tonic) + (s.quality === "minor" ? " minor" : " major"), prompt: `Write the melody: notes 2 to ${degs.length}`, sub: `Key of ${keyName(tonic)} ${s.quality}. It starts on 1.`, context: ctx, focus, events: [...ctx, ...shift(focus, t)], answerCount: degs.length - 1, notes: focus.map((e) => e.midis[0]), target: focus.map((e) => e.midis[0]) };
}
const shift = (ev, t) => ev.map((e) => ({ ...e, t: e.t + t }));
/** Close voice leading: the chord's tones placed as near as possible to the last voicing (or around center) */
export function voiceLead(prev, pcs, center = 66) {
  const opts = [];
  for (let inv = 0; inv < pcs.length; inv++) {
    const order = [...pcs.slice(inv), ...pcs.slice(0, inv)];
    for (let base = center - 12; base <= center + 6; base++) {
      if (mod(base, 12) !== order[0]) continue;
      const v = [base]; for (const pc of order.slice(1)) { let m = v[v.length - 1] + 1; while (mod(m, 12) !== pc) m++; v.push(m); }
      opts.push(v);
    }
  }
  const cost = (v) => (prev ? v.reduce((a, m, i) => a + Math.abs(m - (prev[i] ?? prev[prev.length - 1])), 0) : Math.abs(v[0] + v[v.length - 1] - 2 * center));
  return opts.sort((a, b) => cost(a) - cost(b))[0];
}
/** Events for the items picked in a list (progressions/melody): the scheduler picks, avoiding long repeats */
export function pickSequence(stats, mode, pool, len, rnd = Math.random, settings = DEFAULT_SETTINGS) {
  const out = []; let last = mode === "progressions" ? "I" : "1";
  for (let i = 0; i < len; i++) {
    let it = pickItem(stats, mode, pool, rnd, { last, settings });
    if (mode === "progressions" && i === len - 1 && pool.includes("V") && pool.includes("I") && rnd() < 0.35) it = rnd() < 0.5 ? "V" : "I";
    out.push(it); last = it;
  }
  return out;
}

// ---------- checking and "why" ----------
/** Grade answers against the question: -> { right: [bool per answer], allRight } */
export function grade(q, answers) {
  const right = q.items.map((it, i) => String(answers[i]) === String(it));
  return { right, allRight: right.every(Boolean) && answers.length >= q.items.length };
}
const DEG_WHY = {
  major: {
    1: "home. Everything settles here and nothing pulls away.",
    2: "one step above home. It sounds open and unfinished, and usually steps down to 1.",
    3: "the bright middle of the home chord. Stable and sweet: it's what makes major sound major.",
    4: "a half step above 3, so it leans down to 3. It sounds like a question.",
    5: "the strong top of the home chord. Stable, open and bold, like a bugle call.",
    6: "gentle and a little wistful (it's home for the relative minor). It usually falls to 5.",
    7: "a half step below home, so it pulls hard up to 1. The most restless note in the scale.",
  },
  minor: {
    1: "home. Everything settles here.",
    2: "one step above home, unfinished, and it usually falls back to 1.",
    3: "the dark middle of the minor home chord (b3). Stable, but sad.",
    4: "a step above b3, leaning back down. It sounds like it's waiting.",
    5: "the strong top of the home chord. Stable and open.",
    6: "heavy and sighing (b6), a half step above 5 and leaning down onto it.",
    7: "a relaxed whole step below home (b7). No strong pull, a folk or modal sound.",
  },
};
const IV_WHY = {
  1: { feel: "the smallest step: tense and close, the notes rub", up: "the opening wiggle of Für Elise goes down and up a minor 2nd", down: "Joy to the World opens with one (first two notes)" },
  2: { feel: "a plain step, like walking up a scale", up: "Frère Jacques (first two notes)", down: "Mary Had a Little Lamb (first two notes)" },
  3: { feel: "dark and wistful", up: "Greensleeves (first two notes)", down: "This Old Man (first two notes)" },
  4: { feel: "bright and happy", up: "When the Saints Go Marching In (first two notes)", down: "Swing Low, Sweet Chariot (first two notes)" },
  5: { feel: "open and strong, like a call", up: "Here Comes the Bride (Wagner), or Amazing Grace (first two notes)", down: "the opening of Eine kleine Nachtmusik (Mozart)" },
  6: { feel: "restless and unstable, exactly half an octave", up: "it wants to slide up or down a half step to settle", down: "it wants to slide a half step to settle" },
  7: { feel: "hollow and powerful", up: "Twinkle, Twinkle, Little Star (the first leap)", down: "a bass line jumping from home down to the 5 below" },
  8: { feel: "sad and longing, a stretch past the 5th", up: "it sounds like a 5th that reached a half step too far", down: "it falls like a sigh" },
  9: { feel: "warm and sweet, a wide happy leap", up: "My Bonnie Lies Over the Ocean (first two notes)", down: "Nobody Knows the Trouble I've Seen (first two notes)" },
  10: { feel: "bluesy and unresolved", up: "the bottom and top of a dominant 7th chord", down: "it wants to fall one more step" },
  11: { feel: "very tense, one half step short of an octave", up: "it itches to go up one more half step", down: "it sounds like a wrong octave" },
  12: { feel: "the same note higher: hollow and complete", up: "two notes with the same name", down: "the same note, lower" },
};
const CH_WHY = {
  maj: "a major 3rd then a minor 3rd (4 + 3 half steps). Bright and settled.",
  min: "a minor 3rd then a major 3rd (3 + 4). Darker than major: only the middle note is a half step lower.",
  dim: "two minor 3rds (3 + 3). Squeezed and tense; the top note is a half step lower than in minor.",
  aug: "two major 3rds (4 + 4). Floating and unresolved, like a dream sequence.",
  dom7: "a major chord plus a minor 7th on top. Bluesy, and it wants to resolve (the V7 sound).",
  maj7: "a major chord plus a major 7th. Soft and dreamy; the top note sits a half step under the octave.",
  min7: "a minor chord plus a minor 7th. Mellow and smooth.",
  m7b5: "a diminished chord plus a minor 7th. Dark and searching.",
  sus4: "the 3rd swapped for a 4th. Open and waiting, it wants to fall back to major.",
  sus2: "the 3rd swapped for a 2nd. Open and airy, neither major nor minor.",
};
const PROG_WHY = {
  I: "home: settled, nothing pulls.", ii: "a soft minor chord that usually leads to V.", iii: "a gentle minor chord, close to I (it shares two notes).",
  IV: "the step away from home: warm and lifting (the Amen chord).", V: "tension: it pulls straight back home to I.",
  vi: "the sad chord, the relative minor. It shares two notes with I.", "vii°": "diminished and tense, a strong pull up to I.",
};
const art = (w) => (/^[aeio]/i.test(w) ? "an " : "a ") + w;
const ivName = (semi) => INTERVALS.find((i) => i.semi === +semi)?.name || `${semi} half steps`;
const chName = (id) => CHORDS.find((c) => c.id === id)?.name || id;
const degLabel = (d, q) => `${DEG_LABEL[q][+d - 1]} (${SOLFEGE[q][+d - 1]})`;
/** The plain "why" after an answer: { title, text, tip } */
export function explain(q, answers, settings = DEFAULT_SETTINGS) {
  const qual = settings.quality || "major", g = grade(q, answers);
  if (q.mode === "degrees") {
    const it = q.items[0], a = answers[0];
    const text = `${cap(degLabel(it, qual))} is ${DEG_WHY[qual][it]}`;
    if (g.allRight) return { title: `Yes, ${degLabel(it, qual)}.`, text, tip: "Listen to it walk home." };
    return { title: `It was ${degLabel(it, qual)}.`, text: `${text} You picked ${degLabel(a, qual)}: ${DEG_WHY[qual][a]}`, tip: `Hear yours, then the right one. ${Math.abs(+a - +it) === 1 ? "They're next-door neighbours, so listen for which way it wants to move." : ""}`.trim() };
  }
  if (q.mode === "intervals") {
    const semi = +q.items[0], a = +answers[0], w = IV_WHY[semi], dirWord = q.dir === "down" ? "down" : "up";
    const ref = q.dir === "together" ? w.up : w[dirWord];
    const text = `${cap(art(ivName(semi)))} is ${semi} half step${semi === 1 ? "" : "s"}: ${w.feel}. To remember it: ${ref}.`;
    if (g.allRight) return { title: `Yes, ${art(ivName(semi))}.`, text, tip: q.dir === "together" ? "Try hearing the low note, then the high one, inside the sound." : "" };
    const diff = a - semi;
    return { title: `It was ${art(ivName(semi))}.`, text: `${text} You picked ${art(ivName(a))} (${a} half steps), ${Math.abs(diff)} half step${Math.abs(diff) === 1 ? "" : "s"} ${diff > 0 ? "wider" : "narrower"}.`, tip: "Hear yours, then the right one." };
  }
  if (q.mode === "chords") {
    const it = q.items[0], a = answers[0];
    const text = `${chName(it)}: ${CH_WHY[it]}`;
    if (g.allRight) return { title: `Yes, ${chName(it).toLowerCase()}.`, text, tip: "" };
    let tip = "Hear yours, then the right one.";
    if ([it, a].sort().join() === "maj,min") tip = "Major and minor share the bottom and top notes. Only the middle one moves: brighter is major, darker is minor.";
    else if ([it, a].includes("aug") && [it, a].includes("maj")) tip = "Augmented is major with the top note pushed up a half step. It never feels finished.";
    else if ([it, a].includes("dim") && [it, a].includes("min")) tip = "Diminished is minor with the top note pulled down a half step. Tighter and more tense.";
    return { title: `It was ${chName(it).toLowerCase()}.`, text: `${text} You picked ${chName(a).toLowerCase()}: ${CH_WHY[a]}`, tip };
  }
  if (q.mode === "progressions") {
    const parts = q.items.map((it, i) => (g.right[i] ? `${it} ✓` : `${it} (you said ${answers[i] ?? "nothing"})`));
    const missed = q.items.filter((it, i) => !g.right[i]);
    const text = `I ${q.items.join(" ")}: ${parts.join(", ")}.` + (missed.length ? ` ${missed.map((m) => `${m} is ${PROG_WHY[m]}`).join(" ")}` : "");
    return { title: g.allRight ? "Yes, every chord." : `${g.right.filter(Boolean).length} of ${q.items.length} right.`, text, tip: g.allRight ? "" : "Follow the bass line: it often tells you the chord." };
  }
  const parts = q.items.map((it, i) => (g.right[i] ? DEG_LABEL[qual][+it - 1] : `${DEG_LABEL[qual][+it - 1]} (not ${answers[i] ? DEG_LABEL[qual][+answers[i] - 1] : "?"})`));
  return { title: g.allRight ? "Yes, the whole melody." : `${g.right.filter(Boolean).length} of ${q.items.length} notes right.`, text: `1 ${parts.join(" ")}. ${g.allRight ? "" : "Sing it back slowly: compare each note to home (1)."}`.trim(), tip: "" };
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** What a wrong pick would have sounded like (to play "yours vs. the right one") */
export function pickedSound(q, picked, settings = DEFAULT_SETTINGS) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  if (q.mode === "degrees") { const m = degreeMidi(q.tonic, +picked, s.quality); return [{ t: 0, midis: [q.target[0] - degreeMidi(q.tonic, +q.items[0], s.quality) + m], dur: 0.9 }]; }
  if (q.mode === "intervals") {
    const root = q.root, other = q.dir === "down" ? root - +picked : root + +picked;
    return q.dir === "together" ? [{ t: 0, midis: [root, other], dur: 1.4 }] : [{ t: 0, midis: [root], dur: 0.6 }, { t: 0.65, midis: [other], dur: 0.9 }];
  }
  if (q.mode === "chords") { const c = CHORDS.find((x) => x.id === picked) || CHORDS[0]; return [{ t: 0, midis: [q.root - 12, ...chordAt(q.root, c.tones)], dur: 1.4 }]; }
  return [];
}

// ---------- singing an answer ----------
/** A sung pitch (midi, any octave) as an answer: degrees -> "1".."7" or null; intervals -> semitones 1..12 or null */
export function sungAnswer(q, midi, settings = DEFAULT_SETTINGS) {
  const r = Math.round(midi);
  if (Math.abs(midi - r) > 0.45) return null;
  if (q.mode === "degrees" || q.mode === "melody") {
    const scale = (settings.quality || "major") === "minor" ? MINOR : MAJOR, k = scale.indexOf(mod(r - q.tonic, 12));
    return k >= 0 ? String(k + 1) : null;
  }
  if (q.mode === "intervals") {
    let d = q.dir === "down" ? q.root - r : r - q.root;
    d = mod(d, 12) || 12;
    return String(d);
  }
  return null;
}
/**
 * Holds a sung note: feed pitch frames ({ t, midi | null }); -> a steady midi once it has held `need` seconds within
 * half a semitone, else null. Then it waits for silence or a new note before the next.
 */
export class SingCatcher {
  constructor(need = 0.3) { this.need = need; this.reset(); }
  reset() { this.run = []; this.done = false; this.quiet = 0; }
  feed(fr) {
    if (fr.midi === null || fr.midi === undefined) { if (++this.quiet > 6) { this.run = []; this.done = false; } return null; }
    this.quiet = 0;
    const run = this.run;
    if (run.length && Math.abs(fr.midi - median(run.map((x) => x.midi))) > 0.6) { run.length = 0; this.done = false; }
    run.push(fr);
    if (this.done || run[run.length - 1].t - run[0].t < this.need) return null;
    this.done = true;
    return median(run.map((x) => x.midi));
  }
}
function median(a) { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; }

// ---------- a small keyboard picture (SVG text) ----------
/** A piano keyboard from lo to hi with notes marked: marks: Map(midi -> "ok" | "bad" | "ctx") */
export function keyboardSVG(lo, hi, marks = new Map(), opts = {}) {
  lo = lo - mod(lo, 12); hi = hi + (11 - mod(hi, 12));
  const whites = []; for (let m = lo; m <= hi; m++) if (![1, 3, 6, 8, 10].includes(mod(m, 12))) whites.push(m);
  const W = opts.width || 560, H = opts.height || 70, ww = W / whites.length, out = [];
  const col = (s) => (s === "ok" ? "#22c55e" : s === "bad" ? "#ef4444" : s === "ctx" ? "#a8a29e" : null);
  whites.forEach((m, i) => out.push(`<rect x="${(i * ww).toFixed(1)}" y="0" width="${(ww - 1).toFixed(1)}" height="${H}" rx="3" fill="${col(marks.get(m)) || "#f5f5f4"}" data-midi="${m}"/>`));
  for (let m = lo; m <= hi; m++) {
    if (![1, 3, 6, 8, 10].includes(mod(m, 12))) continue;
    const i = whites.indexOf(m - 1), x = (i + 1) * ww - ww * 0.3;
    out.push(`<rect x="${x.toFixed(1)}" y="0" width="${(ww * 0.6).toFixed(1)}" height="${(H * 0.6).toFixed(1)}" rx="2" fill="${col(marks.get(m)) || "#1c1917"}" data-midi="${m}"/>`);
  }
  whites.forEach((m, i) => { if (mod(m, 12) === 0) out.push(`<text x="${(i * ww + ww / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="9" fill="#78716c" font-family="DM Sans, sans-serif">C${Math.floor(m / 12) - 1}</text>`); });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Keyboard">${out.join("")}</svg>`;
}
