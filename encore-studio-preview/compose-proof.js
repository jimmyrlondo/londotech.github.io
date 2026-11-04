// ENCORE. Compose: the proofreader and the harmony reader. Plain logic, no page
// (test-compose-proof.mjs). proofread() finds what a copyist, a teacher or the
// player would flag, says why in plain words, and where it can, offers a fix the
// page applies with compose-core's own edit functions. analyze() names the
// harmony as Roman numerals or Nashville numbers, from chord symbols or, when a
// score has none, from the notes sounding in each bar.
import { barInfo, eventStarts, voiceLength, spell, strength, beatGroups, tickToTime, TPQ } from "./compose-core.js";
import { parseChord, chordTones, chordSymbol, nameNotes, pcOf, TYPE } from "./chords-core.js";
import { makeKey, numeralOf, keyPalette } from "./chords-keys.js";
import { TUNINGS } from "./tunings.js";

// ---------- ranges ----------
// Sounding MIDI notes. comfortable: what a student or school player manages; extreme: what a pro can reach.
// Orchestral figures follow the usual orchestration books (Adler, Gould); fretted instruments come from
// their tunings: the lowest open string up to about the 12th fret (comfortable) or the 19th (extreme).
const R = (c0, c1, e0, e1) => ({ comfortable: [c0, c1], extreme: [e0, e1] });
const NAMED = {
  "Piano": R(21, 108, 21, 108), "Organ": R(36, 96, 24, 103), "Harp": R(24, 103, 23, 104),
  "Voice (soprano, alto)": R(55, 79, 53, 86), "Voice (tenor)": R(48, 67, 45, 72), "Voice (bass, baritone)": R(41, 62, 36, 67),
  "Violin / fiddle": R(55, 88, 55, 100), "Viola": R(48, 81, 48, 93), "Cello": R(36, 72, 36, 88), "Upright / double bass": R(28, 55, 28, 67),
  "Hardanger fiddle": R(57, 88, 57, 98), "Erhu": R(62, 86, 62, 93), "Nyckelharpa": R(48, 81, 48, 88), "Viola da gamba": R(38, 72, 38, 79),
  "Flute": R(60, 91, 59, 98), "Piccolo": R(74, 103, 74, 108), "Oboe": R(60, 86, 58, 93), "English horn (F)": R(52, 79, 52, 84),
  "Clarinet (Bb)": R(50, 86, 50, 94), "Clarinet (A)": R(49, 85, 49, 93), "Bass clarinet (Bb)": R(38, 72, 34, 79), "Bassoon": R(34, 70, 34, 76),
  "Soprano saxophone (Bb)": R(56, 84, 56, 88), "Alto saxophone (Eb)": R(49, 77, 49, 84), "Tenor saxophone (Bb)": R(44, 72, 44, 79), "Baritone saxophone (Eb)": R(36, 65, 36, 70),
  "Trumpet / cornet (Bb)": R(54, 79, 52, 84), "Flugelhorn (Bb)": R(52, 77, 52, 82), "French horn (F)": R(41, 72, 35, 77), "Mellophone (F)": R(52, 74, 47, 77),
  "Trombone": R(40, 70, 34, 77), "Euphonium / baritone horn": R(40, 70, 34, 77), "Tuba": R(28, 58, 26, 65), "Timpani": R(40, 57, 36, 60),
};
const ALL = TUNINGS.families.flatMap((f) => f.instruments);
const BOWED = /Violin|Viola(?! da)|Cello|double bass|Hardanger|Nyckelharpa|Erhu|gamba/i;
/** Every instrument the page offers: its ranges (sounding and written), and its open strings when it has them */
export const RANGES = (() => {
  const out = {};
  for (const name of ["Piano", "Organ", "Harp", "Voice (soprano, alto)", "Voice (tenor)", "Voice (bass, baritone)"]) out[name] = { ...NAMED[name], transpose: 0, strings: null, kind: /Voice/.test(name) ? "voice" : "keys" };
  for (const i of ALL) {
    if (i.name === "Chromatic (any instrument)") continue;
    const midi = i.tunings[0]?.midi || [], tr = i.transpose || 0;
    let r = NAMED[i.name];
    const strings = i.part === "string" ? [...new Set(midi)].sort((a, b) => a - b) : null;
    if (!r && strings?.length) {
      const lo = strings[0], hi = strings[strings.length - 1];
      // open strings only (koto, kantele): what's tuned is what there is
      r = /Koto|Kantele/.test(i.name) ? R(lo, hi, lo, hi) : R(lo, hi + 12, lo, hi + 19);
    }
    if (!r && i.part === "tine") r = R(Math.min(...midi), Math.max(...midi), Math.min(...midi), Math.max(...midi));
    if (!r) continue;
    const kind = i.part === "string" ? (BOWED.test(i.name) ? "bowed" : "fretted") : i.part === "drum" ? "drum" : i.part === "tine" ? "tine" : /saxophone|clarinet|flute|piccolo|oboe|horn|bassoon/i.test(i.name) && !/French horn|Mellophone/.test(i.name) ? "woodwind" : "brass";
    out[i.name] = { ...r, transpose: tr, strings, kind };
  }
  for (const v of Object.values(out)) v.written = { comfortable: v.comfortable.map((m) => m + v.transpose), extreme: v.extreme.map((m) => m + v.transpose) };
  return out;
})();
const rangeOf = (part) => RANGES[part.instrument] || RANGES[part.name] || null;
const blows = (part) => { const r = rangeOf(part); return !!r && (r.kind === "voice" || r.kind === "woodwind" || r.kind === "brass"); };

// ---------- names and keys ----------
const NOTE = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const noteName = (midi, key = 0, dir = 0) => { const s = spell(midi, key, null, dir); return s.step + (s.alter > 0 ? "#".repeat(s.alter) : "b".repeat(-s.alter)) + s.octave; };
const plainName = (midi) => NOTE[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
const MAJOR_TONIC = ["Cb", "Gb", "Db", "Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E", "B", "F#", "C#"];
const MINOR_TONIC = ["Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E", "B", "F#", "C#", "G#", "D#", "A#"];
/** A key (fifths and mode) as Chords' key object */
export const keyObj = (fifths, mode = "major") => makeKey((mode === "minor" ? MINOR_TONIC : MAJOR_TONIC)[Math.max(-7, Math.min(7, fifths)) + 7], mode);

// ---------- what's in the score, flattened ----------
// every event of every voice with its time, bar and the bar's key, time signature and tempo
function gather(score) {
  const bars = barInfo(score), sec = tickToTime(score), out = [];
  const barAt = (t) => { let lo = 0, hi = bars.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (bars[m].start <= t) lo = m; else hi = m - 1; } return lo; };
  score.parts.forEach((p, pi) => p.voices.forEach((v, vi) => {
    const st = eventStarts(v);
    v.forEach((e, ei) => { const b = bars[barAt(st[ei])]; out.push({ p, pi, vi, ei, e, start: st[ei], end: st[ei] + e.dur, bar: b, pos: st[ei] - b.start, sec: sec(st[ei]), secEnd: sec(st[ei] + e.dur) }); });
  }));
  return { bars, out, sec, barAt };
}
const sounding = (x) => !x.e.rest && !x.e.slash && x.e.notes?.length;
const top = (e) => Math.max(...e.notes.map((n) => n.midi));
const DYN_ORDER = ["ppp", "pp", "p", "mp", "mf", "f", "ff", "fff"];
const dynRank = (d) => DYN_ORDER.indexOf(d);

// ---------- proofreading ----------
/** The rules, with their severity at each level (null: not checked at that level unless asked for in opts.rules) */
export const RULES = {
  range: { beginner: "warn", pro: "tip", about: "Notes outside the instrument's comfortable range" },
  extreme: { beginner: "error", pro: "error", about: "Notes the instrument can't play at all" },
  doubleStop: { beginner: "error", pro: "error", about: "String chords that can't be played on the strings there are" },
  sanity: { beginner: "error", pro: "error", about: "Time signature, key and lengths that don't make sense" },
  shortBar: { beginner: "tip", pro: "tip", about: "The piece ends partway through a bar" },
  startDynamic: { beginner: "tip", pro: "warn", about: "A part starts with no dynamic" },
  reentryDynamic: { beginner: "tip", pro: "warn", about: "A part comes back after long rests with no dynamic" },
  hairpinTarget: { beginner: "tip", pro: "warn", about: "A crescendo or diminuendo that doesn't arrive anywhere" },
  repeatedDynamic: { beginner: "tip", pro: "tip", about: "The same dynamic written twice in a row" },
  spelling: { beginner: "tip", pro: "tip", about: "Notes spelled in a way that's harder to read than it needs to be" },
  augSecond: { beginner: "tip", pro: null, about: "Melodic augmented seconds that may want another spelling" },
  tie: { beginner: "error", pro: "error", about: "Ties that don't lead to the same note" },
  slur: { beginner: "warn", pro: "warn", about: "Slurs that start or end on a rest, or over one" },
  lyrics: { beginner: "warn", pro: "warn", about: "Words and notes that don't line up" },
  chordClash: { beginner: "warn", pro: "tip", about: "Held melody notes on strong beats that clash with the chord symbol" },
  parallels: { beginner: "tip", pro: null, about: "Parallel fifths and octaves (for harmony and counterpoint study)" },
  crossing: { beginner: "tip", pro: null, about: "Voices crossing over each other" },
  leap: { beginner: "warn", pro: "tip", about: "Leaps wider than an octave" },
  breath: { beginner: "warn", pro: "tip", about: "Wind and vocal phrases too long for one breath" },
  handSpan: { beginner: "warn", pro: "warn", about: "Keyboard chords wider than a hand" },
};

/**
 * Proofread a score. opts: { level: "beginner" | "pro", rules: [names] (only these; default every rule on at the level) }.
 * Gives [{ id, rule, severity, part, voice, event, bar (bar number as printed), message, why, fix? }], in score order.
 * fix = { label, op, args }: call compose-core's op(score, ...args) to apply it (ops: transposeRange, replaceAt, setBar).
 */
export function proofread(score, opts = {}) {
  const level = opts.level === "pro" ? "pro" : "beginner", only = opts.rules ? new Set(opts.rules) : null;
  const sev = (rule) => (only ? (only.has(rule) ? RULES[rule][level] || "tip" : null) : RULES[rule][level]);
  const found = [], seen = new Set();
  const add = (rule, x, message, why, fix = null, extra = {}) => {
    const s = sev(rule); if (!s) return;
    const id = `${rule}:${x ? `${x.pi}:${x.vi}:${x.ei}` : extra.key || ""}`;
    if (seen.has(id)) return;
    seen.add(id);
    found.push({ id, rule, severity: s, part: x?.pi ?? extra.part ?? null, voice: x?.vi ?? null, event: x?.ei ?? null, bar: x ? x.bar.number : extra.bar ?? null, tick: x?.start ?? extra.tick ?? 0, message, why, ...(fix ? { fix } : {}) });
  };

  // ---- the basics: time, key, lengths ----
  const t = score.time || {};
  if (!(t.n > 0) || ![1, 2, 4, 8, 16, 32].includes(t.d)) add("sanity", null, `The time signature ${t.n}/${t.d} can't be written`, "The bottom number has to be 1, 2, 4, 8, 16 or 32 (the kind of note that gets the beat), and the top one at least 1.", null, { key: "time", bar: 1 });
  if (!(score.key >= -7 && score.key <= 7)) add("sanity", null, "The key signature is out of range", "A key signature has at most 7 sharps or 7 flats.", null, { key: "key", bar: 1 });
  if (!(score.tempo >= 20 && score.tempo <= 400)) add("sanity", null, `A tempo of ${score.tempo} is unusual`, "Tempos are usually between 40 and 240 beats a minute.", null, { key: "tempo", bar: 1 });
  const { bars, out } = gather(score);
  for (const x of out) if (!(x.e.dur > 0) || !Number.isFinite(x.e.dur)) add("sanity", x, "A note or rest with no length", "Every note and rest needs a length; this one can't be drawn or played. Delete it or give it a length.");
  const ends = score.parts.flatMap((p) => p.voices.map(voiceLength)), last = Math.max(0, ...ends);
  if (last > 0) { const lb = bars.find((b) => last > b.start && last < b.start + b.ticks); if (lb && !(lb.index === 0 && lb.pickup)) add("shortBar", null, `The music stops partway through bar ${lb.number}`, "Rests fill the rest of the bar when it's printed. That's fine, but if the piece starts with a pickup, the last bar usually makes up the difference.", null, { key: "end", bar: lb.number, tick: last }); }

  // ---- per part ----
  score.parts.forEach((p, pi) => {
    const rg = rangeOf(p), mine = out.filter((x) => x.pi === pi), keyAt = (x) => x.bar.key;
    p.voices.forEach((_, vi) => {
      const line = mine.filter((x) => x.vi === vi);
      let curDyn = null, lastSoundEnd = null, phrase = [];
      for (let k = 0; k < line.length; k++) {
        const x = line[k], e = x.e;
        // ranges, written the way the player reads them
        if (rg && sounding(x)) for (const n of e.notes) {
          const name = noteName(n.midi + rg.transpose, keyAt(x)), writ = rg.transpose ? " (written)" : "";
          const [c0, c1] = rg.comfortable, [x0, x1] = rg.extreme;
          const octFix = (dir) => { const m = n.midi + dir * 12; return m >= c0 && m <= c1 ? { label: `Move it an octave ${dir > 0 ? "up" : "down"}`, op: "transposeRange", args: [pi, vi, x.ei, x.ei, dir * 12] } : null; };
          if (n.midi < x0 || n.midi > x1) {
            const why = rg.strings && n.midi < x0 ? `${p.instrument}'s lowest string is ${noteName(rg.strings[0], 0)}${rg.transpose ? "" : ""}, so nothing lower can sound.` : `${p.instrument} reaches from ${plainName(x0 + rg.transpose)} to ${plainName(x1 + rg.transpose)}${writ} even for a professional.`;
            add("extreme", x, `${name}${writ} is out of reach on ${p.instrument}`, why, octFix(n.midi < x0 ? 1 : -1));
          } else if (n.midi < c0 || n.midi > c1) {
            add("range", x, `${name}${writ} is ${n.midi > c1 ? "high" : "low"} for ${p.instrument}`, `Most ${level === "beginner" ? "students and school players" : "players"} are comfortable from ${plainName(c0 + rg.transpose)} to ${plainName(c1 + rg.transpose)}${writ}. ${n.midi > c1 ? "Up there it's strained and hard to play quietly." : "Down there it's weak and hard to hear in a group."}`, octFix(n.midi > c1 ? -1 : 1));
          }
        }
        // bowed strings: every note of a chord needs its own string
        if (rg?.kind === "bowed" && sounding(x) && e.notes.length > 1) {
          const ns = [...new Set(e.notes.map((n) => n.midi))].sort((a, b) => a - b), str = rg.strings;
          let si = -1, ok = ns.length <= str.length;
          for (const m of ns) { if (!ok) break; let j = si + 1; while (j < str.length && str[j] > m) j++; if (j >= str.length) ok = false; else si = j; }
          if (!ok) add("doubleStop", x, `${ns.map((m) => noteName(m, keyAt(x))).join(" and ")} can't be played together on ${p.instrument}`, `Each note of a string chord needs its own string. ${p.instrument} has ${str.length} (${str.map((m) => noteName(m, 0)).join(" ")}), and these notes would need two on the same one. Give one note to another player, or split it into two notes.`);
          else if (ns.length >= 3) add("doubleStop", x, `A ${ns.length}-note chord on ${p.instrument}`, "The bow can only hold two strings at once, so three or four notes come out rolled from the bottom up. That's normal for a big accent; for a sustained chord, split it between players (divisi).", null);
        }
        // keyboard hands
        if (rg && (p.instrument === "Piano" || p.instrument === "Organ" || p.instrument === "Harp") && sounding(x) && e.notes.length > 1) {
          const span = top(e) - Math.min(...e.notes.map((n) => n.midi)), limit = level === "beginner" ? 12 : 16;
          if (span > limit) add("handSpan", x, `This chord spans ${span > 16 ? "more than a 10th" : span > 12 ? "more than an octave" : "an octave"}`, `${level === "beginner" ? "Most hands reach an octave comfortably" : "Few hands reach past a 10th"}; this one is ${span} half steps wide. Roll it (play it as a quick arpeggio), or give the bottom note to the other hand.`);
        }
        // dynamics: one at the start, one after a long rest, and no repeats
        if (sounding(x)) {
          const restLong = lastSoundEnd !== null && x.start - lastSoundEnd >= 2 * x.bar.full;
          if (lastSoundEnd === null && !e.dyn && vi === 0) add("startDynamic", x, `${p.name || p.instrument} starts with no dynamic`, "Without a marking, players guess how loud to come in. Put a dynamic (p, mf, f...) on the first note.", null);
          else if (restLong && !e.dyn && vi === 0) add("reentryDynamic", x, `${p.name || p.instrument} comes back in with no dynamic`, "After a couple of bars or more of rest, players have usually lost track of the last dynamic. A marking where they come back in avoids surprises.", null);
          lastSoundEnd = x.end;
        }
        if (e.dyn) {
          if (curDyn === e.dyn) add("repeatedDynamic", x, `${e.dyn} again, while it's already ${e.dyn}`, "The music is still at this dynamic, so the second marking says nothing new. Leave it out, unless it comes after a hairpin or a long rest.", { label: "Remove it", op: "replaceAt", args: [pi, x.ei, { ...e, dyn: null }, vi] });
          curDyn = e.dyn;
        }
        // ties
        if (sounding(x)) for (const n of e.notes) if (n.tie) {
          const nx = line[k + 1];
          if (!nx || !sounding(nx) || !nx.e.notes.some((m) => m.midi === n.midi)) add("tie", x, `The tie from ${noteName(n.midi, keyAt(x))} goes nowhere`, "A tie joins a note to the same note right after it. The next note here isn't the same pitch (or there isn't one), so it can't be held over. Remove the tie, or make the next note match.", { label: "Remove the tie", op: "replaceAt", args: [pi, x.ei, { ...e, notes: e.notes.map((m) => ({ ...m, tie: false })) }, vi] });
        }
        // lyrics: phrases run between rests
        if (e.lyric && !sounding(x)) add("lyrics", x, `"${e.lyric}" is under a rest`, "Words are sung on notes. Move the syllable to the note it belongs to.");
        if (sounding(x)) phrase.push(x);
        if ((!sounding(x) || k === line.length - 1) && phrase.length) { lyricsCheck(phrase, add); phrase = []; }
        // leaps
        const prev = line[k - 1];
        if (prev && sounding(prev) && sounding(x)) {
          const leap = Math.abs(top(e) - top(prev.e));
          const isVoice = rg?.kind === "voice";
          if (leap > 12 && (level === "beginner" || isVoice)) add("leap", x, `A leap of ${leap > 19 ? "more than an octave and a half" : "more than an octave"}`, `${isVoice ? "Singers find leaps this wide hard to land in tune" : "Leaps this wide are hard to play cleanly"} (${leap} half steps). A step in between, or the same note in another octave, is easier.`);
        }
      }
      // breath: wind and voice phrases between rests
      if (blows(p)) {
        let s0 = null, sEnd = null, first = null;
        const flush = () => { if (first && sEnd - s0 > 8) add("breath", first, `A ${Math.round(sEnd - s0)}-second phrase with nowhere to breathe`, `${rangeOf(p).kind === "voice" ? "Singers" : "Wind players"} need a breath every few seconds; at this tempo this phrase lasts about ${Math.round(sEnd - s0)} seconds with no rest. Put a short rest (or a breath mark) somewhere natural.`); s0 = sEnd = first = null; };
        for (const x of line) { if (sounding(x)) { if (!first) { first = x; s0 = x.sec; } sEnd = x.secEnd; } else flush(); }
        flush();
      }
    });
  });

  // ---- spans ----
  const byId = new Map(out.map((x) => [x.e.id, x]));
  for (const sp of score.spans || []) {
    const a = byId.get(sp.from), b = byId.get(sp.to);
    if (!a || !b) continue;
    if (sp.type === "slur") {
      if (!sounding(a) || !sounding(b)) add("slur", a, "A slur starts or ends on a rest", "A slur joins notes played smoothly together; it has to start and end on notes.", null);
      else if (a === b) add("slur", a, "A slur on a single note", "A slur joins two or more notes. On one note it has nothing to join.", null);
      else if (out.some((x) => x.pi === a.pi && x.vi === a.vi && x.ei > a.ei && x.ei < b.ei && !sounding(x))) add("slur", a, "A slur over a rest", "Playing smoothly through a silence isn't possible. Usually this is two slurs, one each side of the rest, or a phrase mark you mean as one long line.", null);
    }
    if (sp.type === "cresc" || sp.type === "dim") {
      // the dynamic it arrives at: on its last note or within the next bar
      const after = out.filter((x) => x.pi === b.pi && x.vi === b.vi && x.ei >= b.ei && x.start <= b.end + b.bar.full && x.e.dyn);
      const before = out.filter((x) => x.pi === a.pi && x.vi === a.vi && x.ei <= a.ei && x.e.dyn).pop();
      const word = sp.type === "cresc" ? "crescendo" : "diminuendo";
      if (!after.length) add("hairpinTarget", a, `This ${word} doesn't arrive anywhere`, `A ${word} says "get ${sp.type === "cresc" ? "louder" : "softer"}", but players need to know how far. Put a dynamic where it ends.`, null);
      else if (before && dynRank(after[0].e.dyn) >= 0 && dynRank(before.e.dyn) >= 0 && (sp.type === "cresc" ? dynRank(after[0].e.dyn) <= dynRank(before.e.dyn) : dynRank(after[0].e.dyn) >= dynRank(before.e.dyn)))
        add("hairpinTarget", a, `This ${word} ends at ${after[0].e.dyn}, starting from ${before.e.dyn}`, `A ${word} should end ${sp.type === "cresc" ? "louder" : "softer"} than it starts. Check the dynamic at the end, or flip the hairpin.`, null);
    }
  }

  // ---- spelling (each voice in each part, by melodic direction) ----
  for (const x of out) {
    if (!sounding(x)) continue;
    for (const n of x.e.notes) {
      if (!n.spell) continue;
      const s = n.spell, odd = Math.abs(s.alter) > 1 || (s.alter === 1 && (s.step === "E" || s.step === "B")) || (s.alter === -1 && (s.step === "C" || s.step === "F"));
      const inKey = spell(n.midi, x.bar.key, null, 0);
      if (odd && !(inKey.step === s.step && inKey.alter === s.alter)) add("spelling", x, `${s.step}${s.alter > 0 ? "#".repeat(s.alter) : "b".repeat(-s.alter)} reads easier as ${noteName(n.midi, x.bar.key).replace(/\d+$/, "")}`, "Notes like E#, B#, Cb, Fb and double sharps or flats are right when the harmony calls for them, but here the key doesn't, and the plain name reads faster.", { label: "Use the plain name", op: "replaceAt", args: [x.pi, x.ei, { ...x.e, notes: x.e.notes.map((m) => (m === n ? { ...m, spell: null } : m)) }, x.vi] });
    }
  }
  for (const [pi, p] of score.parts.entries()) p.voices.forEach((_, vi) => {
    const line = out.filter((x) => x.pi === pi && x.vi === vi && sounding(x) && x.e.notes.length === 1);
    for (let k = 1; k < line.length; k++) {
      const a = line[k - 1], b = line[k];
      if (b.ei !== a.ei + 1) continue;
      const m1 = a.e.notes[0].midi, m2 = b.e.notes[0].midi, d = m2 - m1;
      if (Math.abs(d) !== 3) continue;
      const s1 = a.e.notes[0].spell || spell(m1, a.bar.key, null, Math.sign(d)), s2 = b.e.notes[0].spell || spell(m2, b.bar.key, null, Math.sign(d));
      const letters = ((["C", "D", "E", "F", "G", "A", "B"].indexOf(s2.step) - ["C", "D", "E", "F", "G", "A", "B"].indexOf(s1.step)) % 7 + 7) % 7;
      if ((d > 0 && letters === 1) || (d < 0 && letters === 6)) add("augSecond", b, `${s1.step}${s1.alter > 0 ? "#" : s1.alter < 0 ? "b" : ""} to ${s2.step}${s2.alter > 0 ? "#" : s2.alter < 0 ? "b" : ""} is an augmented 2nd`, "That spelling is right in harmonic minor (it's the scale's exotic step). If you're not in harmonic minor, spelling it as a minor 3rd usually reads easier.");
    }
  });

  // ---- chord symbols against the melody ----
  const chords = out.filter((x) => x.e.chord && parseChord(x.e.chord)).sort((a, b) => a.start - b.start);
  chords.forEach((c, i) => {
    const ch = parseChord(c.e.chord), endT = chords[i + 1]?.start ?? Infinity;
    const pcs = new Set(chordTones(ch).map((x) => x.pc)); if (ch.bass) pcs.add(pcOf(ch.bass));
    const root = pcOf(ch.root), dom = ch.type.includes("7") && !/maj7/.test(ch.type) && !/^m/.test(ch.type), minor = /^m(?!aj)/.test(ch.type) || /sus/.test(ch.type);
    const ok = new Set([...pcs, (root + 2) % 12, (root + 9) % 12, ...(minor ? [(root + 5) % 12] : []), ...(dom ? [(root + 1) % 12, (root + 3) % 12, (root + 6) % 12, (root + 8) % 12] : []), ...(/maj7|maj9/.test(ch.type) ? [(root + 6) % 12] : [])]);
    for (const x of out) {
      if (!sounding(x) || x.start < c.start || x.start >= endT || rangeOf(x.p)?.kind === "drum") continue;
      const beat = beatGroups(x.bar.time)[0], str = strength(x.pos, x.bar.time);
      if (str < 2 || x.e.dur < beat) continue;
      const m = top(x.e);
      if (!ok.has(((m % 12) + 12) % 12)) add("chordClash", x, `${noteName(m, x.bar.key).replace(/\d+$/, "")} against ${chordSymbol(ch)}`, `This held note lands on a strong beat but isn't in ${chordSymbol(ch)} (${[...pcs].map((q) => NOTE[q]).join(" ")}), so it rubs. That can be a deliberate suspension or an appoggiatura that resolves; otherwise change the note or the chord.`);
    }
  });

  // ---- voice leading (study rules): parallels between every pair of lines, crossing ----
  const lines = [];
  score.parts.forEach((p, pi) => { if (rangeOf(p)?.kind === "drum") return; p.voices.forEach((v, vi) => { const l = out.filter((x) => x.pi === pi && x.vi === vi); if (l.some(sounding)) lines.push({ pi, vi, l }); }); });
  const pitchAt = (l, t) => { const x = l.find((y) => y.start <= t && t < y.end); return x && sounding(x) ? { x, m: top(x.e), onset: x.start === t } : null; };
  for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
    const A = lines[i], B = lines[j], onsets = [...new Set([...A.l, ...B.l].map((x) => x.start))].sort((a, b) => a - b);
    let prev = null;
    for (const t of onsets) {
      const a = pitchAt(A.l, t), b = pitchAt(B.l, t);
      if (!a || !b) { prev = null; continue; }
      const iv = Math.abs(a.m - b.m) % 12;
      if (prev && a.onset && b.onset && a.m !== prev.a && b.m !== prev.b && Math.sign(a.m - prev.a) === Math.sign(b.m - prev.b) && (iv === 7 || iv === 0) && prev.iv === iv) {
        const name = iv === 7 ? "fifths" : "octaves";
        add("parallels", a.x, `Parallel ${name} with ${score.parts[B.pi].name || score.parts[B.pi].instrument}${B.vi ? ` (voice ${B.vi + 1})` : ""}`, `Two lines moving the same way from one ${iv === 7 ? "fifth" : "octave"} to the next sound like one thicker line, so the harmony feels hollow. Classical harmony avoids it; pop and rock use it freely (power chords are parallel fifths).`);
      }
      // the line written above should stay above (two voices on a staff, or one part above the next)
      if (a.onset || b.onset) { const vs = (L) => (score.parts[L.pi].voiceStaff || [0, 0, 1, 1])[L.vi] || 0, sameStaff = A.pi === B.pi && vs(A) === vs(B), upper = A.pi === B.pi ? (A.vi < B.vi ? a : b) : a, lower = upper === a ? b : a; if (A.pi === B.pi && !sameStaff) { /* other staff of a grand staff: free to cross */ } else if ((sameStaff || (rangeOf(score.parts[A.pi])?.kind === "voice" && rangeOf(score.parts[B.pi])?.kind === "voice")) && upper.m < lower.m) add("crossing", upper.x, "The voices cross here", "The upper line dips below the lower one, so listeners lose track of which melody is which. Sometimes that's the point; usually swapping the notes keeps the lines clear."); }
      prev = { a: a.m, b: b.m, iv };
    }
  }
  return found.sort((a, b) => a.tick - b.tick || (a.part ?? -1) - (b.part ?? -1) || ["error", "warn", "tip"].indexOf(a.severity) - ["error", "warn", "tip"].indexOf(b.severity));
}
// a sung phrase: it starts on a word, and a syllable joined to the next with a hyphen needs a next one
function lyricsCheck(phrase, add) {
  if (!phrase.some((x) => x.e.lyric)) return;
  if (!phrase[0].e.lyric && !phrase[0].tiedIn) add("lyrics", phrase[0], "A sung phrase starts without a word", "The first note of a phrase usually carries a syllable; a note with no word under it is held from the word before (a melisma), and here there isn't one.");
  const lastWord = [...phrase].reverse().find((x) => x.e.lyric);
  if (lastWord?.e.lyricHyphen && lastWord === phrase[phrase.length - 1]) add("lyrics", lastWord, `"${lastWord.e.lyric}-" is joined to nothing`, "A hyphen means the word carries on in the next syllable, but the phrase ends here. Remove the hyphen or add the rest of the word.");
}

// ---------- harmony ----------
const QUAL = (c) => { const t = TYPE[c.type].sym; return /dim7/.test(t) ? "°7" : /m7b5/.test(t) ? "ø7" : /dim/.test(t) ? "°" : /^aug/.test(t) ? "+" : /^m(?!aj)/.test(t) ? "-" + t.slice(1) : t; };
/** A chord as a Nashville number in a key: 1, 4, 5-, b7, 2-7, 5/7 */
export function nashville(key, c) {
  const tonic = pcOf(key.tonic), steps = key.mode === "minor" ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
  const deg = (pc) => { const d = ((pc - tonic) % 12 + 12) % 12, i = steps.indexOf(d); if (i >= 0) return String(i + 1); const up = steps.indexOf((d + 11) % 12); return up >= 0 ? "#" + (up + 1) : "b" + (steps.indexOf((d + 1) % 12) + 1); };
  return deg(pcOf(c.root)) + QUAL(c) + (c.bass ? "/" + deg(pcOf(c.bass)) : "");
}
/**
 * Harmony labels. opts: { style: "roman" | "nashville" }.
 * From chord symbols when the score has them: [{ part, voice, event, tick, bar, chord, label, source: "symbol" }];
 * otherwise one per bar from the notes sounding in it: [{ tick, bar, chord, label, source: "notes" }].
 * Each in the key of its bar (key changes followed).
 */
export function analyze(score, opts = {}) {
  const style = opts.style === "nashville" ? "nashville" : "roman", { bars, out } = gather(score), res = [];
  const label = (key, c, next) => (style === "nashville" ? nashville(key, c) : numeralOf(key, c, keyPalette(key), next));
  const syms = out.filter((x) => x.e.chord && parseChord(x.e.chord)).sort((a, b) => a.start - b.start);
  if (syms.length) {
    syms.forEach((x, i) => {
      const key = keyObj(x.bar.key, x.bar.mode), c = parseChord(x.e.chord), nx = syms[i + 1] ? parseChord(syms[i + 1].e.chord) : null;
      res.push({ part: x.pi, voice: x.vi, event: x.ei, tick: x.start, bar: x.bar.number, chord: chordSymbol(c), label: label(key, c, nx), source: "symbol" });
    });
    return res;
  }
  for (const b of bars) {
    const midis = out.filter((x) => sounding(x) && x.start < b.start + b.ticks && x.end > b.start && rangeOf(x.p)?.kind !== "drum").flatMap((x) => x.e.notes.map((n) => n.midi));
    if (new Set(midis.map((m) => m % 12)).size < 2) continue;
    const key = keyObj(b.key, b.mode), best = nameNotes(midis, key)[0];
    if (!best || best.kind !== "chord") continue;
    res.push({ tick: b.start, bar: b.number, chord: best.symbol, label: label(key, best.chord, null), source: "notes" });
  }
  return res;
}
void TPQ;
