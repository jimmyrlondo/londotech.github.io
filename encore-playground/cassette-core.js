// ENCORE. Cassette: the planning math. Tape lengths, what fits on each side, balance
// suggestions, the side timeline used for preview and export, the J-card's printed
// sizes and the duplication tracklist. No DOM, no Web Audio (test-cassette.mjs runs it).

/** Stock tape lengths. The number is minutes for both sides together. */
export const TAPES = [
  { id: "C30", total: 30 }, { id: "C46", total: 46 }, { id: "C60", total: 60 }, { id: "C90", total: 90 },
];
/** Seconds per side for a tape id ("C60") or a custom total in minutes */
export function sideCapacity(tape, customMinutes = 60) {
  const t = TAPES.find((x) => x.id === tape);
  const total = t ? t.total : Math.max(2, Math.min(200, +customMinutes || 60));
  return (total * 60) / 2;
}

/** m:ss (or h:mm:ss), with a minus sign when negative */
export function fmt(sec) {
  const neg = sec < 0, s = Math.round(Math.abs(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = String(s % 60).padStart(2, "0");
  return (neg ? "-" : "") + (h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`);
}

/** How long a side runs: lead-in silence, the songs, and a gap between each pair */
export function sideLength(durations, gap = 2, lead = 0) {
  if (!durations.length) return 0;
  return lead + durations.reduce((a, d) => a + d, 0) + gap * (durations.length - 1);
}

/** Tapes vary a little, so leave at least this much spare at the end of a side */
export const SAFETY = 15;

/**
 * Where a side stands: { length, capacity, left, status: "empty" | "ok" | "tight" | "over" }.
 * "tight" means it fits but with less than SAFETY seconds spare.
 */
export function sideStatus(durations, capacity, gap = 2, lead = 0) {
  const length = sideLength(durations, gap, lead), left = capacity - length;
  const status = !durations.length ? "empty" : left < 0 ? "over" : left < SAFETY ? "tight" : "ok";
  return { length, capacity, left, status };
}

/**
 * The shortest stock tape that holds both sides with room to spare (longest side + 15 s + 2%),
 * and the custom length a duplicator would cut (even minutes, so "C" + total). Returns
 * { stock: "C46" | null, custom: "C44", perSide: seconds needed }.
 */
export function recommendTape(lenA, lenB) {
  const longest = Math.max(lenA, lenB);
  const need = longest > 0 ? (longest + SAFETY) * 1.02 : 0;
  const stock = TAPES.find((t) => t.total * 30 >= need)?.id || null;
  const perSideMin = Math.max(1, Math.ceil(need / 60));
  return { stock, custom: "C" + perSideMin * 2, perSide: need };
}

/**
 * The best place to split songs (kept in order) into side A then side B: the split where
 * the two sides are closest in length. Returns { at, a, b, diff } (A gets songs [0, at)).
 */
export function bestSplit(durations, gap = 2, lead = 0) {
  let best = null;
  for (let at = 0; at <= durations.length; at++) {
    const a = sideLength(durations.slice(0, at), gap, lead), b = sideLength(durations.slice(at), gap, lead);
    const diff = Math.abs(a - b);
    if (!best || diff < best.diff - 1e-9) best = { at, a, b, diff };
  }
  return best || { at: 0, a: 0, b: 0, diff: 0 };
}

/**
 * One change that evens the sides out the most: move a song from the longer side to the
 * other, or swap a pair. A and B are arrays of durations. Returns null when nothing helps
 * by at least `minGain` seconds, else { kind: "move" | "swap", from: "A" | "B", i, j?, diff }.
 * diff is the new difference; i is the index on the `from` side, j on the other side.
 */
export function bestMove(A, B, gap = 2, lead = 0, minGain = 5) {
  const now = Math.abs(sideLength(A, gap, lead) - sideLength(B, gap, lead));
  let best = null;
  const consider = (cand) => { if (now - cand.diff >= minGain && (!best || cand.diff < best.diff - 1e-9)) best = cand; };
  for (const [from, X, Y] of [["A", A, B], ["B", B, A]]) {
    for (let i = 0; i < X.length; i++) {
      const X2 = X.filter((_, k) => k !== i), Y2 = [...Y, X[i]];
      consider({ kind: "move", from, i, diff: Math.abs(sideLength(X2, gap, lead) - sideLength(Y2, gap, lead)) });
      for (let j = 0; j < Y.length; j++) {
        if (from === "B") continue; // each swap once
        const X3 = X.map((d, k) => (k === i ? Y[j] : d)), Y3 = Y.map((d, k) => (k === j ? X[i] : d));
        consider({ kind: "swap", from, i, j, diff: Math.abs(sideLength(X3, gap, lead) - sideLength(Y3, gap, lead)) });
      }
    }
  }
  return best;
}

/**
 * Plain-words advice for the two sides: an array of { level: "ok" | "warn" | "bad", text }.
 * names: { A: [...], B: [...] } song titles for the suggestion.
 */
export function advice(A, B, capacity, gap = 2, lead = 0, names = { A: [], B: [] }) {
  const sa = sideStatus(A, capacity, gap, lead), sb = sideStatus(B, capacity, gap, lead), out = [];
  if (!A.length && !B.length) return [{ level: "ok", text: "Add songs to start planning." }];
  for (const [n, s] of [["A", sa], ["B", sb]]) {
    if (s.status === "over") out.push({ level: "bad", text: `Side ${n} runs ${fmt(-s.left)} over the tape. Move a song or pick a longer tape.` });
    else if (s.status === "tight") out.push({ level: "warn", text: `Side ${n} fits with only ${fmt(s.left)} spare. Tapes vary, so leave about ${SAFETY} seconds.` });
  }
  const diff = sa.length - sb.length;
  if (A.length + B.length >= 2 && Math.abs(diff) > 90) {
    const m = bestMove(A, B, gap, lead);
    const longer = diff > 0 ? "A" : "B";
    let text = `Side ${longer} runs ${fmt(Math.abs(diff))} longer.`;
    if (m) {
      const other = m.from === "A" ? "B" : "A";
      text += m.kind === "move"
        ? ` Move "${names[m.from]?.[m.i] || "song " + (m.i + 1)}" to side ${other} to get within ${fmt(m.diff)}.`
        : ` Swap "${names[m.from]?.[m.i] || "song " + (m.i + 1)}" with "${names[other]?.[m.j] || "song " + (m.j + 1)}" to get within ${fmt(m.diff)}.`;
    }
    out.push({ level: "warn", text, move: m });
  } else if (A.length && B.length) out.push({ level: "ok", text: `The sides are balanced (within ${fmt(Math.abs(diff))}).` });
  const rec = recommendTape(sa.length, sb.length);
  if (rec.stock) out.push({ level: "ok", text: `Shortest stock tape that fits: ${rec.stock}. A duplicator can also cut a custom ${rec.custom}.` });
  else out.push({ level: "warn", text: `Longer than a C90. Ask your duplicator for a custom ${rec.custom}, or split it into two tapes.` });
  return out;
}

/**
 * A side as a timeline of parts (seconds): [{ kind: "gap" | "song", start, len, song? }],
 * with the lead-in first and a gap between songs. Total = sideLength(...).
 */
export function timeline(songs, gap = 2, lead = 0) {
  const parts = [];
  let t = 0;
  if (lead > 0 && songs.length) { parts.push({ kind: "gap", start: 0, len: lead }); t = lead; }
  songs.forEach((s, i) => {
    if (i > 0 && gap > 0) { parts.push({ kind: "gap", start: t, len: gap }); t += gap; }
    parts.push({ kind: "song", start: t, len: s.duration, song: s, index: i });
    t += s.duration;
  });
  return parts;
}

/** The same timeline in whole samples at fs (what the export writes), so lengths add up exactly */
export function timelineFrames(songs, fs, gap = 2, lead = 0) {
  const parts = [];
  let f = 0;
  const add = (kind, frames, extra = {}) => { parts.push({ kind, start: f, frames, ...extra }); f += frames; };
  if (lead > 0 && songs.length) add("gap", Math.round(lead * fs));
  songs.forEach((s, i) => {
    if (i > 0 && gap > 0) add("gap", Math.round(gap * fs));
    add("song", s.frames != null && s.fs === fs ? s.frames : Math.round(s.duration * fs), { song: s, index: i });
  });
  return { parts, frames: f };
}

/** The tracklist duplicators ask for: start times on each side, lengths, totals */
export function tracklistText({ title = "", artist = "", tape = "", A = [], B = [], gap = 2, lead = 0 }) {
  const lines = [];
  lines.push([artist, title].filter(Boolean).join(" - ") || "Untitled tape");
  if (tape) lines.push(`Tape: ${tape}`);
  lines.push(`Gap between songs: ${gap} s. Lead-in silence: ${lead} s.`, "");
  let n = 1;
  for (const [name, songs] of [["A", A], ["B", B]]) {
    lines.push(`SIDE ${name} (${fmt(sideLength(songs.map((s) => s.duration), gap, lead))})`);
    for (const p of timeline(songs, gap, lead)) if (p.kind === "song") lines.push(`${String(n++).padStart(2, "0")}. ${fmt(p.start).padStart(5)}  ${p.song.title}  (${fmt(p.len)})`);
    lines.push("");
  }
  return lines.join("\r\n");
}

// ---- the J-card

export const MM_PER_IN = 25.4;
/**
 * Standard J-card (trim sizes from duplicator templates): back flap 1 1/16 in, spine 1/2 in,
 * front 2 9/16 in, 4 in tall. Each extra fold-out panel is 1/16 in narrower than the last
 * (the first is 2 1/2 in). Bleed and safe margins are 1/8 in.
 */
export const JCARD = { height: 101.6, flap: 26.9875, spine: 12.7, front: 65.0875, extra: 63.5, step: 1.5875, bleed: 3.175, safe: 3.175 };

/**
 * Layout of one face of a J-card in millimetres, plus pixels at `dpi`.
 * panels: 3 (flap, spine, front) or more (fold-outs past the front).
 * face "outside": [flap, spine, front, ...extras]; "inside" is the mirror (printed on the back
 * of the same sheet, flipped on the long edge): [...extras reversed, front, spine, flap].
 * Every panel: { name, x, w } measured from the trim's left edge (no bleed).
 */
export function jcardLayout({ panels = 3, face = "outside", dpi = 300, bleed = JCARD.bleed } = {}) {
  const list = [{ name: "flap", w: JCARD.flap }, { name: "spine", w: JCARD.spine }, { name: "front", w: JCARD.front }];
  for (let k = 0; k < Math.max(0, panels - 3); k++) list.push({ name: "panel" + (k + 4), w: JCARD.extra - k * JCARD.step });
  const order = face === "inside" ? [...list].reverse() : list;
  let x = 0;
  const out = order.map((p) => { const r = { name: p.name, x, w: p.w }; x += p.w; return r; });
  const width = x, height = JCARD.height;
  const px = (mm) => Math.round((mm / MM_PER_IN) * dpi);
  return {
    face, panels: out, width, height, bleed, safe: JCARD.safe,
    full: { width: width + 2 * bleed, height: height + 2 * bleed },
    dpi, px, pixels: { width: px(width + 2 * bleed), height: px(height + 2 * bleed) },
  };
}

/** Page fit check: does the card plus crop marks fit on Letter and A4 (portrait, 10 mm margins)? */
export function fitsPage(layout, mark = 8) {
  const w = layout.full.width + 2 * mark, h = (layout.full.height + 2 * mark) * 2 + 10;
  return { letter: w <= 215.9 - 20 && h <= 279.4 - 20, a4: w <= 210 - 20 && h <= 297 - 20 };
}

/** File-safe name */
export const safeName = (s, fallback = "tape") => (String(s || "").replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").trim().slice(0, 80) || fallback);
