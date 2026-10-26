// Mix check: reads a finished mix before mastering and explains, in plain
// English, anything that will hold the master back, with times in the song
// where it happens. Pure JS, no dependencies (runs in a worker or in Node).
import { integratedLufs } from "./master-core.js";

const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const db = (x) => 10 * Math.log10(x + 1e-20);

// 4th-order band-pass (two biquads), for octave-band levels
function bandEnergy(x, fs, f, q = 1.41, step = 2) {
  const w = (2 * Math.PI * f) / fs, al = Math.sin(w) / (2 * q), c = Math.cos(w), a0 = 1 + al;
  const b0 = al / a0, b2 = -al / a0, a1 = (-2 * c) / a0, a2 = (1 - al) / a0;
  let z1 = 0, z2 = 0, y1 = 0, y2 = 0, e = 0, n = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i] + z1; z1 = -a1 * v + z2; z2 = b2 * x[i] - a2 * v;
    const u = b0 * v + y1; y1 = -a1 * u + y2; y2 = b2 * v - a2 * u;
    if (i % step === 0) { e += u * u; n++; }
  }
  return e / Math.max(1, n);
}

function lowpassEnergy(x, fs, f) { // 4th-order Butterworth-ish low-pass, energy
  const w = (2 * Math.PI * f) / fs, al = Math.sin(w) / (2 * 0.7071), c = Math.cos(w), a0 = 1 + al;
  const b0 = (1 - c) / 2 / a0, b1 = (1 - c) / a0, a1 = (-2 * c) / a0, a2 = (1 - al) / a0;
  let z1 = 0, z2 = 0, y1 = 0, y2 = 0, e = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i] + z1; z1 = b1 * x[i] - a1 * v + z2; z2 = b0 * x[i] - a2 * v;
    const u = b0 * v + y1; y1 = b1 * v - a1 * u + y2; y2 = b0 * v - a2 * u;
    e += u * u;
  }
  return e / x.length;
}

// Group sample positions into events (anything within `gap` seconds is one event)
function events(positions, fs, gap = 0.25) {
  const out = [];
  for (const p of positions) {
    const t = p / fs;
    if (!out.length || t - out[out.length - 1].end > gap) out.push({ start: t, end: t, n: 1 });
    else { out[out.length - 1].end = t; out[out.length - 1].n++; }
  }
  return out;
}

export function mixCheck(l, r, fs) {
  const n = l.length, findings = [];
  const add = (severity, title, detail, fix = "", times = []) => findings.push({ severity, title, detail, fix, times });
  const mid = new Float32Array(n), side = new Float32Array(n);
  let eL = 0, eR = 0, eM = 0, sumL = 0, sumR = 0, peak = 0;
  const overPos = [], clipPos = [];
  let runL = 0, runR = 0;
  for (let i = 0; i < n; i++) {
    const a = l[i], b = r[i];
    mid[i] = 0.5 * (a + b); side[i] = 0.5 * (a - b);
    eL += a * a; eR += b * b; eM += mid[i] * mid[i]; sumL += a; sumR += b;
    const m = Math.max(Math.abs(a), Math.abs(b));
    if (m > peak) peak = m;
    if (m > 1.0) overPos.push(i);
    // already-clipped audio: 4+ samples in a row stuck at full scale
    runL = Math.abs(a) >= 0.9995 ? runL + 1 : 0;
    runR = Math.abs(b) >= 0.9995 ? runR + 1 : 0;
    if (runL === 4 || runR === 4) clipPos.push(i);
  }
  eL /= n; eR /= n; eM /= n;
  const lufs = integratedLufs(l, r, fs), peakDb = 20 * Math.log10(peak + 1e-12), plr = peakDb - lufs;

  // short-term level (3 s windows, 1 s hop) for loudness range
  const st = [];
  for (let s = 0; s + 3 * fs <= n; s += fs) { let e = 0; for (let i = s; i < s + 3 * fs; i += 4) e += mid[i] * mid[i]; st.push(db(e / (0.75 * fs))); }
  const sorted = st.filter((v) => v > Math.max(...st) - 20).sort((a, b) => a - b);
  const lra = sorted.length ? sorted[Math.floor(0.95 * (sorted.length - 1))] - sorted[Math.floor(0.1 * (sorted.length - 1))] : 0;

  // ---- 1. overs and clipping ----
  const overEvents = events(overPos, fs), clipEvents = events(clipPos, fs);
  if (overEvents.length) {
    add(peakDb > 3 ? "problem" : "warn", `Mix goes over 0 dB in ${overEvents.length} place${overEvents.length > 1 ? "s" : ""} (peaks at +${peakDb.toFixed(1)} dB)`,
      "This file stores levels above 0 dB, so nothing is damaged yet, but any 16 or 24-bit export of this mix will clip hard at those spots. Master can handle it, but the safest mix has headroom.",
      `Turn the master bus (or the loudest tracks) down by about ${Math.ceil(peakDb + 3)} dB before exporting, or take any limiter off the mix bus and let mastering do that job.`,
      overEvents.slice(0, 8).map((e) => e.start));
  } else if (clipEvents.length) {
    add("problem", `Clipped audio in ${clipEvents.length} place${clipEvents.length > 1 ? "s" : ""}`,
      "Some peaks are flattened at full scale, which adds crunchy distortion that mastering can't remove.",
      "Re-export the mix with the master bus turned down a few dB so nothing touches 0 dB.", clipEvents.slice(0, 8).map((e) => e.start));
  } else {
    add("good", "No clipping", `Peaks top out at ${peakDb.toFixed(1)} dB, so there's room for mastering to work.`);
  }

  // ---- 2. already squashed ----
  // judge squash by peak-to-average, not level: a hot but dynamic mix isn't squashed
  if (plr < 8 || (lufs > -9 && peak <= 1.0)) {
    add("warn", "Mix is already very loud and compressed",
      `It measures ${lufs.toFixed(1)} LUFS with only ${plr.toFixed(1)} dB between peaks and average level. Mastering can't give back punch that's already been squashed.`,
      "If there's a limiter or heavy compressor on your mix bus, try exporting a version without it and master that instead.");
  } else if (lufs < -30) {
    add("info", "Mix is very quiet", `It measures ${lufs.toFixed(1)} LUFS. That's fine: Master brings it up, but very low levels can raise noise.`, "");
  }

  // ---- 3. tonal balance vs a typical finished mix ----
  const freqs = [40, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 12000];
  const level = freqs.map((f) => db(bandEnergy(mid, fs, f)));
  // reference: roughly equal energy per octave 100 Hz-2 kHz, a little more
  // below, gently falling above 2 kHz (how most finished mixes sit)
  const ref = freqs.map((f) => (f < 100 ? 1.05 * Math.log2(100 / f) : 0) - (f > 2000 ? 2.5 * Math.log2(f / 2000) : 0));
  const diff = level.map((v, k) => v - ref[k]);
  const norm = [2, 3, 4, 5, 6, 7].reduce((a, k) => a + diff[k], 0) / 6; // 125 Hz-4 kHz
  const rel = diff.map((v) => v - norm);
  const avg = (...ks) => ks.reduce((a, k) => a + rel[k], 0) / ks.length;
  const lows = avg(0, 1), mud = avg(3, 4), harsh = avg(6, 7), top = avg(8, 9);
  const tone = { lows, mud, harsh, top };
  let toneOk = true;
  if (lows < -5) { toneOk = false; add("warn", "Thin low end", `The deep bass (40-60 Hz) is about ${Math.abs(lows).toFixed(0)} dB lighter than in most finished mixes.`, "Check the kick and bass in the mix. Fire style adds a lot of low end if that's the sound you want."); }
  if (lows > 5) { toneOk = false; add("warn", "Heavy, boomy low end", `The deep bass is about ${lows.toFixed(0)} dB heavier than in most finished mixes, which eats loudness and can sound boomy on big speakers.`, "Try a low cut around 30 Hz on tracks that don't need sub-bass, and check the kick/bass balance."); }
  if (mud > 3) { toneOk = false; add("warn", "Muddy low mids", `There's about ${mud.toFixed(0)} dB extra around 250-500 Hz, where mixes get cloudy and boxy.`, "Small cuts around 250-400 Hz on guitars, keys or the bus usually clear it up. Clarity style also trims this area."); }
  if (harsh > 3) { toneOk = false; add("warn", "Harsh upper mids", `There's about ${harsh.toFixed(0)} dB extra around 2-4 kHz, the range that sounds piercing when turned up.`, "Look at bright guitars, cymbals and vocal edge. Tape style smooths this range."); }
  if (top < -5) { toneOk = false; add("info", "Dull top end", `The highs (8-12 kHz) are about ${Math.abs(top).toFixed(0)} dB lower than most finished mixes.`, "Fine if that's the vibe. Otherwise the High EQ or Clarity/Tape styles add air."); }
  if (top > 4) { toneOk = false; add("warn", "Very bright / fizzy top", `The highs are about ${top.toFixed(0)} dB hotter than most finished mixes, which can sound fizzy and tiring.`, "Check cymbals and vocal sibilance; a de-esser or gentle high shelf cut helps."); }
  if (toneOk) add("good", "Balanced tone", "Lows, mids and highs sit about where most finished mixes do.");

  // ---- 4. stereo: wide bass, mono compatibility, balance ----
  const bassSide = lowpassEnergy(side, fs, 120), bassMid = lowpassEnergy(mid, fs, 120);
  const bassWidth = db(bassSide) - db(bassMid);
  if (bassWidth > -10) add(bassWidth > -6 ? "problem" : "warn", "Bass is spread wide in stereo",
    `Below 120 Hz, the stereo (side) part is only ${Math.abs(bassWidth).toFixed(0)} dB under the center. Wide bass can thin out or cancel on phone speakers, club systems and vinyl.`,
    "Keep kick, bass and sub elements panned center; check stereo wideners or chorus on low instruments.");
  else add("good", "Bass is centered", "The low end is focused in the middle, so it'll translate to phones and big systems.");

  const monoLoss = db(eM) - db((eL + eR) / 2);
  // out-of-phase sections: 1 s windows with negative L/R correlation
  const phaseTimes = [];
  for (let s = 0; s + fs <= n; s += fs) {
    let xy = 0, xx = 0, yy = 0;
    for (let i = s; i < s + fs; i += 4) { xy += l[i] * r[i]; xx += l[i] * l[i]; yy += r[i] * r[i]; }
    if (xx > 1e-6 && yy > 1e-6 && xy / Math.sqrt(xx * yy) < -0.1) phaseTimes.push(s / fs);
  }
  if (monoLoss < -4.5 || phaseTimes.length) add(monoLoss < -6 || phaseTimes.length > 3 ? "problem" : "warn", "Mono compatibility issue",
    `When played in mono (one speaker, many phones and bars), the mix loses about ${Math.abs(monoLoss).toFixed(1)} dB${phaseTimes.length ? `, and ${phaseTimes.length} second${phaseTimes.length > 1 ? "s are" : " is"} out of phase` : ""}. Parts can disappear.`,
    "Check for a channel with flipped polarity, very wide stereo effects, or two mics on one source fighting each other.", phaseTimes.slice(0, 8));
  else add("good", "Mono-safe", "Nothing cancels out when the song plays through a single speaker.");

  const balance = db(eL) - db(eR);
  if (Math.abs(balance) > 1.5) add("warn", `Mix leans ${balance > 0 ? "left" : "right"}`, `The ${balance > 0 ? "left" : "right"} side is ${Math.abs(balance).toFixed(1)} dB louder overall.`, "Check panning and stereo bus balance.");

  const dc = Math.max(Math.abs(sumL / n), Math.abs(sumR / n));
  if (dc > 0.002) add("warn", "DC offset", "The waveform is shifted off center, which wastes headroom and can click at edits.", "A low cut (even at 10-20 Hz) on the mix bus removes it.");

  // ---- 5. silence at the ends ----
  const quiet = (i) => Math.max(Math.abs(l[i]), Math.abs(r[i])) < 0.001; // -60 dBFS
  let lead = 0; while (lead < n && quiet(lead)) lead++;
  let tail = 0; while (tail < n && quiet(n - 1 - tail)) tail++;
  if (lead / fs > 1.5) add("info", `Starts with ${(lead / fs).toFixed(1)} s of silence`, "Streaming services play that silence before the song starts.", "Trim it unless it's intentional.");
  if (tail / fs > 4) add("info", `Ends with ${(tail / fs).toFixed(1)} s of silence`, "Long silence at the end delays the next song in a playlist.", "Trim it unless it's intentional.");

  // one timestamp per second is plenty
  for (const f of findings) f.times = [...new Set(f.times.map((t) => Math.floor(t)))];

  const order = { problem: 0, warn: 1, info: 2, good: 3 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);
  return {
    summary: { problems: findings.filter((f) => f.severity === "problem").length, warnings: findings.filter((f) => f.severity === "warn").length },
    stats: { lufs, peakDb, plr, lra, bassWidth, monoLoss, tone, balance },
    findings,
  };
}

export { fmtTime };
