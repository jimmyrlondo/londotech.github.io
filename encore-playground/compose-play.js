// ENCORE. Compose: the performance. Turns the score's notes (compose-core's
// playbackEvents: who plays what, when, straight from the page) into a musical
// reading: dynamics and hairpins as continuous swells, slurs played legato,
// articulations with real lengths and weights, rit. and accel., fermatas that
// breathe, pedal, grace notes, ornaments, tremolos, rolled chords, glissandos,
// playing techniques, swing and a light human touch. Pure (no WebAudio), so
// node can test it (test-compose-play.mjs); compose-io.js plays the result.
import { TPQ, playbackEvents, timeline, barInfo, eventStarts, spell, midiOf, keyAlter } from "./compose-core.js";

export const DYN_VEL = { ppp: 30, pp: 42, p: 56, mp: 70, mf: 84, f: 98, ff: 112, fff: 124, sfz: 112, fp: 98 };
const LEVELS = [30, 42, 56, 70, 84, 98, 112, 124];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];

// a small seeded random source (mulberry32), so a humanized take sounds the same every time
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** The scale step above (dir 1) or below (dir -1) a note in the key; acc forces that note's accidental (an ornament's sharp or flat) */
export function neighbor(midi, key = 0, dir = 1, acc = null) {
  const sp = spell(midi, key), L = LETTERS.indexOf(sp.step), nL = (L + dir + 7) % 7;
  const oct = sp.octave + (dir > 0 && L === 6 ? 1 : dir < 0 && L === 0 ? -1 : 0);
  const alter = acc === null || acc === undefined ? keyAlter(nL, key) : acc;
  return midiOf(LETTERS[nL], alter, oct);
}

// what each articulation does to a note: how much of its written length sounds, and how much weight it gets
const ART = {
  staccatissimo: { len: 0.25, vel: 4 }, staccato: { len: 0.45, vel: 2 }, tenuto: { len: 0.98, vel: 4 }, accent: { len: 0.88, vel: 16 },
  marcato: { len: 0.72, vel: 24 }, "sfz": { len: 0.9, vel: 20 }, fermata: { len: 1, vel: 0 },
};
const PLAIN_LEN = 0.9;      // an unmarked note, detached a touch
const LEGATO_OVERLAP = 0.03; // seconds a slurred note runs into the next one

/**
 * The performance. opts: { from: tick, parts: [indexes], swing: 0 | 0.5..0.75 (or "8" / "16" style objects { ratio, unit }),
 * humanize: 0..1 (default 0.3), seed, all } -> events sorted by time:
 * { time, dur, midi, vel, velEnd, part, voice, ref, bar, ptick, legato, pedal, sound, muted, bend: { to, at }, grace, orn }
 * time and dur in seconds after `from` (as playbackEvents); vel and velEnd 1..127 (velEnd: where a held note's swell ends).
 */
export function perform(score, opts = {}) {
  const base = playbackEvents(score, { from: opts.from || 0, parts: opts.parts, all: opts.all });
  if (!base.length) return [];
  const bars = barInfo(score), tl = timeline(score, { barList: bars }), segs = tl.segments;
  const lastP = segs.length ? segs[segs.length - 1].ptick + segs[segs.length - 1].ticks : 0;
  // played ticks to seconds (repeats unrolled, tempo map), measured from the `from` point like the base events
  const segAt = (p) => { let lo = 0, hi = segs.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (segs[m].ptick <= p) lo = m; else hi = m - 1; } return segs[lo]; };
  const absT = (p) => { const s = segAt(p); return s.time + ((p - s.ptick) * 60) / (s.tempo * TPQ); };
  const spt = (p) => 60 / (segAt(p).tempo * TPQ);
  const t0 = absT(base[0].ptick) - base[0].time;

  // ---- the score's own facts per voice: events, where they start, dynamics with hairpins, slurs, pedal, techniques
  const info = new Map(); // "part:voice" -> { voice, starts, level(ref, tick), inSlur(ref), lastInSlur(ref), tech[ref] }
  const spans = score.spans || [];
  const voiceInfo = (pi, vi) => {
    const k = pi + ":" + vi;
    if (info.has(k)) return info.get(k);
    const v = score.parts[pi]?.voices[vi] || [], starts = eventStarts(v), idx = new Map(v.map((e, i) => [e.id, i]));
    const mine = spans.filter((s) => s.part === pi && (s.voice ?? 0) === vi && idx.has(s.from) && idx.has(s.to)).map((s) => {
      const a = idx.get(s.from), b = idx.get(s.to), lo = Math.min(a, b), hi = Math.max(a, b);
      return { ...s, a: lo, b: hi, ta: starts[lo], tb: starts[hi] + v[hi].dur };
    });
    // dynamics: marked levels carried forward, hairpins as straight ramps to the next marking (or two steps on)
    const marks = []; let lv = DYN_VEL.mf;
    v.forEach((e, i) => { if (e.dyn && DYN_VEL[e.dyn] !== undefined) marks.push({ i, t: starts[i], lv: DYN_VEL[e.dyn], dyn: e.dyn }); });
    const markedAt = (t) => { let l = DYN_VEL.mf; for (const m of marks) if (m.t <= t) l = m.dyn === "fp" ? DYN_VEL.p : m.lv; else break; return l; };
    const pins = mine.filter((s) => s.type === "cresc" || s.type === "dim").map((s) => {
      const from = markedAt(s.ta), next = marks.find((m) => m.t >= s.tb - 1 && m.t <= s.tb + 1920);
      const step = (s.type === "cresc" ? 1 : -1) * 2, at = LEVELS.reduce((b, x, j) => (Math.abs(x - from) < Math.abs(LEVELS[b] - from) ? j : b), 0);
      const to = next ? next.lv : LEVELS[clamp(at + step, 0, LEVELS.length - 1)];
      return { ta: s.ta, tb: s.tb, from, to: s.type === "cresc" ? Math.max(to, from + 6) : Math.min(to, from - 6) };
    }).sort((x, y) => x.ta - y.ta);
    const level = (t) => {
      let l = markedAt(t);
      for (const h of pins) {
        if (t < h.ta) break;
        const lastMark = marks.filter((m) => m.t <= t).pop();
        if (lastMark && lastMark.t > h.tb) continue; // a newer marking wins
        l = t >= h.tb ? h.to : h.from + ((h.to - h.from) * (t - h.ta)) / Math.max(1, h.tb - h.ta);
      }
      return l;
    };
    const slurs = mine.filter((s) => s.type === "slur"), pedals = mine.filter((s) => s.type === "pedal");
    const glisses = mine.filter((s) => s.type === "gliss"), trills = mine.filter((s) => s.type === "trill");
    // techniques last until another one changes them
    const tech = []; let cur = "normal";
    v.forEach((e, i) => { if (e.tech) cur = /^(arco|normal|open|senza sord\.|ord\.)$/.test(e.tech) ? "normal" : e.tech; tech[i] = cur; });
    const r = { v, starts, level, slurs, pedals, glisses, trills, tech };
    info.set(k, r);
    return r;
  };

  // ---- swing: from opts, or from "Swing" text on a bar until "Straight" / "Even"
  const swingAt = (() => {
    const fixed = typeof opts.swing === "number" && opts.swing > 0.5 ? { ratio: opts.swing, unit: 240 } : opts.swing && opts.swing.ratio ? { unit: 240, ...opts.swing } : null;
    const byBar = new Map(); let on = null;
    for (const b of bars) {
      const t = String(score.bars?.[b.index]?.text || "");
      if (/swing/i.test(t)) on = { ratio: /hard|heavy/i.test(t) ? 0.72 : /light|soft/i.test(t) ? 0.6 : 2 / 3, unit: /16/.test(t) ? 120 : 240 };
      else if (/straight|even 8|even/i.test(t)) on = null;
      byBar.set(b.index, on);
    }
    return (bar) => fixed || byBar.get(bar) || null;
  })();
  // a tick inside a swung pair moved: the first of two notes gets ratio of the pair, the second the rest
  const swingTicks = (p) => {
    const s = segAt(p), sw = swingAt(s.bar), b = bars[s.bar];
    if (!sw || !b || (b.time.d !== 4 && b.time.d !== 2)) return 0;
    const pair = sw.unit * 2, q = ((p - s.ptick) % pair + pair) % pair;
    const w = q < sw.unit ? q * (sw.ratio / 0.5) : pair * sw.ratio + (q - sw.unit) * ((1 - sw.ratio) / 0.5);
    return w - q;
  };

  // ---- rit. / rall. / accel. text: the tempo eases over two bars and stays there until "a tempo" (or a new tempo)
  const ramps = [];
  {
    let open = null;
    for (const s of segs) {
      const t = String(score.bars?.[s.bar]?.text || ""), tempoChange = bars[s.bar]?.tempoChange;
      if (open && (/a tempo|tempo i|tempo primo/i.test(t) || tempoChange)) { open.p2 = s.ptick; open = null; }
      const m = /\b(rit|ritard|rall|allarg|accel)/i.exec(t);
      if (m) {
        if (open) open.p2 = s.ptick;
        open = { p0: s.ptick, p1: s.ptick + s.ticks * 2, p2: Infinity, f: /accel/i.test(m[1]) ? 1.25 : /allarg/i.test(m[1]) ? 0.7 : 0.78 };
        ramps.push(open);
      }
    }
  }
  // extra seconds by a played tick: the integral of (1/tempo factor - 1) over the ramps, sampled every 30 ticks
  const STEP = 30, extraArr = new Float64Array(Math.ceil(lastP / STEP) + 2);
  if (ramps.length) {
    for (let k = 1; k < extraArr.length; k++) {
      const p = (k - 0.5) * STEP;
      let f = 1;
      for (const r of ramps) if (p >= r.p0 && p < r.p2) f = r.f === 1 ? 1 : 1 + (r.f - 1) * Math.min(1, (p - r.p0) / Math.max(1, r.p1 - r.p0));
      extraArr[k] = extraArr[k - 1] + (1 / f - 1) * STEP * spt(Math.min(p, lastP - 1));
    }
  }
  const ritExtra = (p) => { if (!ramps.length) return 0; const x = p / STEP, k = Math.floor(x); if (k >= extraArr.length - 1) return extraArr[extraArr.length - 1]; return extraArr[k] + (extraArr[k + 1] - extraArr[k]) * (x - k); };

  // ---- fermatas: every part waits; the held note gets longer and the music after it moves on later
  const holds = new Map(); // played tick where the hold ends -> extra seconds
  for (const e of base) {
    const vi = voiceInfo(e.part, e.voice), ev = vi.v[e.ref];
    if (!(ev?.artic || []).includes("fermata")) continue;
    const pEnd = e.ptick + ev.dur, sec = ev.dur * spt(e.ptick), hold = Math.min(3, 0.7 * sec + 0.25);
    holds.set(pEnd, Math.max(holds.get(pEnd) || 0, hold));
  }
  const holdList = [...holds.entries()].sort((a, b) => a[0] - b[0]);
  // a note starting where a hold ends waits for it (inclusive); a note ending there ends before it (and is held with it below)
  const holdShift = (p, inclusive) => { let s = 0; for (const [pe, h] of holdList) if (pe < p || (inclusive && pe === p)) s += h; else break; return s; };

  // the clock: a played tick to performance seconds after `from`
  const T = (p, isStart = true) => absT(p + swingTicks(p)) + ritExtra(p) + holdShift(p, isStart) - t0;

  // ---- notes
  const out = [], key = score.key || 0, R = rng(opts.seed ?? 7), human = opts.humanize ?? 0.3;
  const jitter = new Map(); // one small timing nudge per onset (a chord stays together)
  for (const e of base) {
    const vi = voiceInfo(e.part, e.voice), ev = vi.v[e.ref];
    if (!ev) continue;
    const artic = ev.artic || [], tech = vi.tech[e.ref] || "normal", tStart = vi.starts[e.ref];
    // the written length (core already shortened it by its own rule; undo that to start from the page)
    const coreF = artic.includes("staccato") ? 0.5 : artic.includes("tenuto") ? 1 : 0.92;
    const ticks = Math.max(1, e.pticks + ev.dur * (1 - coreF));
    const pEnd = e.ptick + ticks;
    let start = T(e.ptick), end = T(pEnd, false) + (holds.has(pEnd) ? holds.get(pEnd) : 0);
    const nominal = Math.max(0.02, end - start);
    // dynamics with hairpins (the level where the note starts and where it ends), metric weight, articulation weight
    let vel = vi.level(tStart), velEnd = vi.level(tStart + ev.dur);
    const bar = bars[e.bar], beatT = bar ? 1920 / bar.time.d : TPQ, inBar = segAt(e.ptick), pos = e.ptick - inBar.ptick;
    vel += pos === 0 ? 5 : pos % beatT === 0 ? 2 : 0;
    let lenF = PLAIN_LEN, legato = false;
    for (const a of artic) if (ART[a]) { lenF = Math.min(lenF === PLAIN_LEN ? 1 : lenF, ART[a].len); vel += ART[a].vel; }
    if (ev.dyn === "sfz") vel += 14;
    // slurs: legato into the next note (the last note of a slur lets go a little early and softer)
    const slur = vi.slurs.find((s) => e.ref >= s.a && e.ref <= s.b);
    if (slur && !artic.some((a) => a === "staccato" || a === "staccatissimo")) {
      if (e.ref < slur.b) { legato = true; lenF = 1; } else { lenF = 0.85; vel -= 6; }
    }
    let dur = legato ? nominal + LEGATO_OVERLAP : Math.max(0.05, nominal * lenF);
    // pedal: notes held until the pedal comes up
    const ped = vi.pedals.find((s) => tStart >= s.ta && tStart < s.tb);
    let pedal = false;
    if (ped) { const pRel = e.ptick + (ped.tb - tStart); const up = T(pRel, false); if (up - start > dur) { dur = up - start; pedal = true; } }
    // playing techniques
    let sound = null, muted = false, midi = e.midi;
    if (tech === "pizz.") { sound = "pizz"; dur = Math.min(dur, 0.45); }
    else if (tech === "col legno") { sound = "pizz"; dur = Math.min(dur, 0.18); muted = true; }
    else if (tech === "palm mute") { dur = Math.min(dur, 0.22); muted = true; }
    else if (tech === "let ring") dur *= 1.6;
    else if (tech === "con sord." || tech === "mute") muted = true;
    else if (tech === "harmonic") { sound = "harmonic"; }
    else if (tech === "sul pont.") sound = "bright";
    else if (tech === "sul tasto") sound = "dark";
    const note = (ev.notes || []).find((n) => n.midi === e.midi);
    if (note?.harm) { midi += 12; sound = "harmonic"; }
    // a human touch: a few milliseconds and a few steps of velocity, the same every time
    const onsetKey = e.part + ":" + e.voice + ":" + e.ptick;
    if (!jitter.has(onsetKey)) jitter.set(onsetKey, (R() * 2 - 1) * 0.012 * human);
    const vj = Math.round((R() * 2 - 1) * 7 * human);
    start = Math.max(0, start + jitter.get(onsetKey));
    vel = clamp(Math.round(vel + vj), 1, 127); velEnd = clamp(Math.round(velEnd + vj + (vel - vi.level(tStart) - vj)), 1, 127);
    const baseNote = { time: start, dur, midi, vel, velEnd, part: e.part, voice: e.voice, ref: e.ref, bar: e.bar, ptick: e.ptick, legato, pedal, sound, muted };
    // glissando to the next note: the pitch slides over the note's second half
    const gl = vi.glisses.find((s) => s.a === e.ref);
    if (gl && vi.v[gl.b] && !vi.v[gl.b].rest) baseNote.bend = { to: vi.v[gl.b].notes[0].midi + (midi - e.midi), at: 0.35 };
    // grace notes before the beat (acciaccatura) or taking time from it (appoggiatura); played once per chord
    const firstOfChord = e.midi === Math.min(...(ev.notes || []).map((n) => n.midi));
    if (ev.graces?.length && firstOfChord) {
      const g = ev.graces, slash = g.every((x) => x.slash !== false), n = g.length;
      if (slash) {
        const gd = Math.min(0.07, nominal / (n + 2));
        g.forEach((x, i) => { for (const gn of x.notes || []) out.push({ ...baseNote, time: Math.max(0, start - (n - i) * gd), dur: gd * 1.1, midi: gn.midi, vel: clamp(vel - 8, 1, 127), velEnd: clamp(vel - 8, 1, 127), grace: true, legato: true, bend: undefined }); });
      } else {
        const take = Math.min(nominal / 2, 0.6), gd = take / n;
        g.forEach((x, i) => { for (const gn of x.notes || []) out.push({ ...baseNote, time: start + i * gd, dur: gd + LEGATO_OVERLAP, midi: gn.midi, vel: clamp(vel + 4, 1, 127), velEnd: vel, grace: true, legato: true, bend: undefined }); });
      }
    }
    if (ev.graces?.length && ev.graces.every((x) => x.slash === false)) { const take = Math.min(nominal / 2, 0.6); baseNote.time += take; baseNote.dur = Math.max(0.05, baseNote.dur - take); }
    // ornaments and tremolos replace the note with a figure
    const orn = ev.orn || (vi.trills.some((s) => e.ref >= s.a && e.ref <= s.b) ? "trill" : null);
    if (orn) { out.push(...ornament(baseNote, orn, ev.ornAcc, key, nominal, spt(e.ptick))); continue; }
    if (ev.trem) { out.push(...tremolo(baseNote, ev.trem, nominal, spt(e.ptick))); continue; }
    // a rolled chord: each note a little after the one below (or above)
    if (ev.arp && (ev.notes || []).length > 1) {
      const order = [...ev.notes].map((n) => n.midi).sort((a, b) => (ev.arpDir === "down" ? b - a : a - b));
      const step = Math.min(0.045, nominal / (order.length * 3)), k = order.indexOf(e.midi);
      baseNote.time += k * step; baseNote.dur = Math.max(0.05, baseNote.dur - k * step);
    }
    out.push(baseNote);
  }
  return out.sort((a, b) => a.time - b.time || a.midi - b.midi);
}

// trills, turns and mordents as notes (32nds at the tempo, never slower than 8 a second for a trill)
function ornament(n, orn, acc, key, nominal, sptick) {
  const up = neighbor(n.midi, key, 1, orn === "mordent" ? null : acc), down = neighbor(n.midi, key, -1, orn === "mordent" ? acc : null);
  const fast = Math.min(60 * sptick, 1 / 9); // a 32nd, or faster when slow
  const mk = (midi, t, d, v = 0) => ({ ...n, time: n.time + t, dur: d + 0.01, midi, vel: clamp(n.vel + v, 1, 127), velEnd: clamp(n.vel + v, 1, 127), legato: true, orn, bend: undefined });
  const res = [];
  if (orn === "trill") {
    const count = Math.max(4, Math.floor(nominal / fast));
    const d = nominal / count;
    for (let i = 0; i < count; i++) res.push(mk(i % 2 ? up : n.midi, i * d, d, i === 0 ? 2 : -4));
    res[res.length - 1].dur = n.dur - (count - 1) * d;
  } else if (orn === "turn" || orn === "invturn") {
    const seq = orn === "turn" ? [up, n.midi, down, n.midi] : [down, n.midi, up, n.midi], d = Math.min(fast * 1.2, nominal / 6);
    seq.forEach((m, i) => res.push(mk(m, i * d, d, i ? -3 : 0)));
    res[res.length - 1].dur = Math.max(d, n.dur - 3 * d);
  } else {
    const other = orn === "invmordent" ? up : down, d = Math.min(fast, nominal / 4);
    res.push(mk(n.midi, 0, d), mk(other, d, d, -4), mk(n.midi, 2 * d, Math.max(d, n.dur - 2 * d)));
  }
  return res;
}
// tremolo strokes: 1 = 8ths, 2 = 16ths, 3 = as fast as it goes (unmeasured)
function tremolo(n, strokes, nominal, sptick) {
  const d = strokes >= 3 ? 1 / 14 : (strokes === 2 ? 120 : 240) * sptick, count = Math.max(1, Math.round(nominal / d)), step = nominal / count;
  return Array.from({ length: count }, (_, i) => ({ ...n, time: n.time + i * step, dur: step * 0.92, vel: clamp(n.vel - (i ? 6 : 0), 1, 127), velEnd: clamp(n.vel - 6, 1, 127), legato: false, trem: true }));
}

/** The performance as a part-by-part list (for stems or per-part buses) */
export const byPart = (events) => { const m = new Map(); for (const e of events) { if (!m.has(e.part)) m.set(e.part, []); m.get(e.part).push(e); } return m; };
/** When the last sound ends (seconds) */
export const performanceLength = (events) => events.reduce((a, e) => Math.max(a, e.time + e.dur), 0);
