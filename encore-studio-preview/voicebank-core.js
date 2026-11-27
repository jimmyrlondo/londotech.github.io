// ENCORE. Voicebank: the pure parts of the voicebank recorder. Pitch tracking, the checks run
// on every take, the automatic oto.ini timing, and the text files OpenUtau reads.
// No DOM, no Web Audio: runs in pages, workers and Node tests alike.

export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12);
export const hzToMidi = (f) => 69 + 12 * Math.log2(f / 440);
export const noteName = (m) => NOTE_NAMES[((Math.round(m) % 12) + 12) % 12] + (Math.floor(Math.round(m) / 12) - 1);
export function parseNote(s) {
  const m = /^([A-G])(#?)(-?\d)$/.exec(String(s).trim());
  if (!m) return null;
  return NOTE_NAMES.indexOf(m[1] + m[2]) + (Number(m[3]) + 1) * 12;
}
const db = (x) => (x > 0 ? 20 * Math.log10(x) : -120);
const median = (a) => { if (!a.length) return 0; const s = [...a].sort((p, q) => p - q); const h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };

/** YIN pitch estimate for one frame. Returns Hz, or 0 when the frame isn't clearly pitched. */
export function yin(x, sr, fmin = 55, fmax = 1100, threshold = 0.15) {
  const maxLag = Math.min(Math.floor(sr / fmin), x.length >> 1), minLag = Math.max(2, Math.floor(sr / fmax));
  if (maxLag <= minLag + 2) return 0;
  const W = x.length - maxLag, d = new Float32Array(maxLag + 1);
  for (let tau = 1; tau <= maxLag; tau++) {
    let s = 0;
    for (let i = 0; i < W; i++) { const v = x[i] - x[i + tau]; s += v * v; }
    d[tau] = s;
  }
  let run = 0, best = -1;
  for (let tau = 1; tau <= maxLag; tau++) {
    run += d[tau];
    d[tau] = run > 0 ? (d[tau] * tau) / run : 1;
  }
  for (let tau = minLag; tau <= maxLag; tau++) {
    if (d[tau] < threshold) {
      while (tau + 1 <= maxLag && d[tau + 1] < d[tau]) tau++;
      best = tau; break;
    }
  }
  if (best < 0) return 0;
  // parabolic interpolation around the dip
  const a = d[best - 1] ?? d[best], b = d[best], c = d[best + 1] ?? d[best];
  const shift = (a - 2 * b + c) !== 0 ? (a - c) / (2 * (a - 2 * b + c)) : 0;
  return sr / (best + shift);
}

/** Frame-by-frame loudness and pitch, every 10 ms. */
export function track(x, sr, { hop = 0.01, win = 0.04, pitch = true } = {}) {
  const H = Math.round(sr * hop), N = Math.round(sr * win), out = [];
  for (let i = 0; i + N <= x.length; i += H) {
    const f = x.subarray(i, i + N);
    let s = 0;
    for (let k = 0; k < N; k++) s += f[k] * f[k];
    const rms = Math.sqrt(s / N);
    out.push({ t: (i + N / 2) / sr, rms, f0: pitch && rms > 0.004 ? yin(f, sr) : 0 });
  }
  return out;
}

/**
 * Checks one take and works out where the sound starts, where the vowel settles and where it ends.
 * opts: expectedStart (s, when the singer was cued), targetMidi, kind: "cv" | "vowel" | "hum" | "breath" | "custom".
 * Returns { ok, level, checks:[{level,id,text}], peakDb, noiseDb, levelDb, onset, vowelStart, end, hz, cents, oto }.
 */
export function analyzeTake(x, sr, { expectedStart = 0.6, targetMidi = 60, kind = "cv", targetName } = {}) {
  const checks = [], add = (level, id, text) => checks.push({ level, id, text });
  let peak = 0, pinned = 0;
  for (let i = 0; i < x.length; i++) { const m = Math.abs(x[i]); if (m > peak) peak = m; if (m >= 0.999) pinned++; }
  const pitched = kind !== "breath" && kind !== "custom";
  const fr = track(x, sr, { pitch: pitched });
  const searchFrom = Math.max(0, expectedStart - 0.3);
  // the room's noise: the quietest fifth of the take (singing early or count-in clicks can't inflate it)
  const sorted = fr.map((f) => f.rms).sort((a, b) => a - b);
  const noise = sorted.length ? sorted[Math.floor(sorted.length * 0.2)] : 0.0005;
  const res = { peakDb: db(peak), noiseDb: db(noise), levelDb: -120, onset: null, vowelStart: null, end: null, hz: 0, cents: null, oto: null, checks };

  const thr = Math.min(Math.max(noise * 5, peak * 0.06, 0.003), peak * 0.3);
  let on = -1;
  for (let i = 0; i < fr.length - 2; i++) {
    if (fr[i].t < searchFrom) continue;
    if (fr[i].rms >= thr && fr[i + 1].rms >= thr && fr[i + 2].rms >= thr) { on = i; break; }
  }
  // already singing when the window opened: walk back to where that sound really began
  while (on > 0 && fr[on - 1].rms >= thr) on--;
  if (peak < 0.01 || on < 0) {
    add("fail", "silent", "We didn't hear anything. Check that the right microphone is picked and that you sang after the count-in.");
    return finish(res);
  }
  // the sung sound ends at its first gap longer than 150 ms (a later cough or creak isn't part of it)
  let off = on, gap = 0;
  for (let i = on + 1; i < fr.length; i++) {
    if (fr[i].rms >= thr) { off = i; gap = 0; } else if (++gap > 15) break;
  }
  if (pinned > 3) add("fail", "clip", "Too loud: the recording clipped. Back off the mic a little or turn the input gain down, then redo it.");
  else if (peak < 0.06) add("warn", "quiet", `Quite quiet (peak ${res.peakDb.toFixed(0)} dB). Move a little closer or turn the input up.`);
  if (res.noiseDb > -50) add("warn", "noise", `Background noise is high (${res.noiseDb.toFixed(0)} dB). A quieter room, or turning off fans, makes a cleaner voice.`);

  // where the vowel settles: pitched, steady for 50 ms, and loud enough
  const loud = median(fr.slice(on, off + 1).map((f) => f.rms));
  let vs = on;
  if (pitched && kind !== "vowel") {
    vs = -1;
    for (let i = on; i < off - 5; i++) {
      const w = fr.slice(i, i + 5);
      if (w.every((f) => f.f0 > 0 && f.rms >= loud * 0.35)) {
        const ms = w.map((f) => hzToMidi(f.f0));
        if (Math.max(...ms) - Math.min(...ms) < 0.6) { vs = i; break; }
      }
    }
    if (vs < 0) vs = Math.min(off, on + 8);
  }
  res.onset = fr[on].t - 0.02;
  res.vowelStart = fr[vs].t - 0.02;
  res.end = fr[off].t + 0.02;
  res.levelDb = db(loud);
  const held = res.end - res.vowelStart;

  const late = res.onset - expectedStart;
  if (Math.abs(late) > 0.3) add("warn", "timing", late > 0 ? `You came in ${late.toFixed(1)} s late. Try to start right on the beat.` : `You came in ${(-late).toFixed(1)} s early. Wait for the beat after the count-in.`);
  if (pitched && held < 0.5) add("warn", "short", `Held for ${held.toFixed(1)} s. Hold the vowel a bit longer (at least half a second) so it can be stretched.`);

  if (pitched) {
    const mid = fr.filter((f) => f.t >= res.vowelStart + held * 0.2 && f.t <= res.end - held * 0.2 && f.f0 > 0).map((f) => hzToMidi(f.f0));
    if (mid.length < 5) add("warn", "pitch", "We couldn't hear a steady pitch. Sing the vowel on one clear note.");
    else {
      // fold octave mistakes out of the median (a strong 2nd harmonic reads an octave up)
      const m = median(mid);
      res.hz = midiToHz(m);
      let c = (m - targetMidi) * 100;
      const oct = Math.round(c / 1200);
      if (oct !== 0 && Math.abs(c - oct * 1200) < 60) { add("warn", "octave", `That was an octave ${oct > 0 ? "above" : "below"} the guide note. Fine if that's your range, but keep every take in the same octave.`); c -= oct * 1200; }
      res.cents = Math.round(c);
      if (Math.abs(c) > 60) add("warn", "pitch", `About ${Math.abs(Math.round(c))} cents ${c > 0 ? "sharp" : "flat"} of ${targetName ?? noteName(targetMidi)}. Listen to the guide note and match it.`);
    }
  }
  res.oto = otoFor(res, kind);
  return finish(res);
}
function finish(res) {
  res.level = res.checks.some((c) => c.level === "fail") ? "fail" : res.checks.some((c) => c.level === "warn") ? "warn" : "ok";
  res.ok = res.level !== "fail";
  return res;
}

/**
 * oto.ini timing from the analysis (all in ms, as UTAU expects).
 * offset: where playback starts. preutter: from offset to the vowel (lines up with the note start).
 * overlap: how much it crossfades with the previous note. consonant (fixed): the part never stretched.
 * cutoff: negative = length from offset (the stretchy vowel lives between consonant and cutoff).
 */
export function otoFor({ onset, vowelStart, end }, kind = "cv") {
  if (onset == null) return null;
  const offset = Math.max(0, onset - 0.01);
  const pre = Math.max(0.01, vowelStart - offset);
  const overlap = kind === "vowel" || kind === "hum" ? Math.min(0.01, pre / 2) : Math.min(0.06, Math.max(0.005, pre / 3));
  const consonant = pre + (kind === "breath" || kind === "custom" ? 0 : 0.06);
  const len = Math.max(consonant + 0.05, end - 0.04 - offset);
  const ms = (s) => Math.round(s * 1000);
  return { offset: ms(offset), consonant: ms(consonant), cutoff: -ms(len), preutter: ms(pre), overlap: ms(overlap) };
}

const EN_V = new Set(["aa", "ae", "ah", "ao", "aw", "ay", "eh", "er", "ey", "ih", "iy", "ow", "oy", "uh", "uw"]);

/**
 * An English line: several syllables sung one per beat on one note. Finds every vowel and the
 * consonants between them (using the beat timing where the audio has no clear break) and returns
 * one oto entry per join ("- b", "b aa", "aa b", ..., "b -").
 * opts: expectedStart (s, cue for the first syllable), beat (s), phones, targetMidi.
 * Returns { ok, level, checks, otos:[{alias, offset, consonant, cutoff, preutter, overlap}], segments:[{ph,start,end}], onset, end, levelDb, cents }.
 */
export function analyzeLine(x, sr, { expectedStart = 0.6, beat = 0.6, phones, targetMidi = 60, targetName } = {}) {
  const checks = [], add = (level, id, text) => checks.push({ level, id, text });
  let peak = 0, pinned = 0;
  for (let i = 0; i < x.length; i++) { const m = Math.abs(x[i]); if (m > peak) peak = m; if (m >= 0.999) pinned++; }
  const fr = track(x, sr), T = (i) => fr[Math.max(0, Math.min(fr.length - 1, i))].t;
  const sorted = fr.map((f) => f.rms).sort((a, b) => a - b);
  const noise = sorted.length ? sorted[Math.floor(sorted.length * 0.2)] : 0.0005;
  const res = { peakDb: db(peak), noiseDb: db(noise), levelDb: -120, onset: null, end: null, cents: null, otos: null, segments: null, checks };
  const thr = Math.min(Math.max(noise * 5, peak * 0.06, 0.003), peak * 0.3);
  const fi = (t) => Math.max(0, Math.min(fr.length - 1, Math.round((t - fr[0].t) / 0.01)));
  let on = -1;
  for (let i = 0; i < fr.length - 2; i++) {
    if (fr[i].t < expectedStart - 0.3) continue;
    if (fr[i].rms >= thr && fr[i + 1].rms >= thr && fr[i + 2].rms >= thr) { on = i; break; }
  }
  while (on > 0 && fr[on - 1].rms >= thr) on--;
  if (peak < 0.01 || on < 0) { add("fail", "silent", "We didn't hear anything. Check that the right microphone is picked and that you sang after the count-in."); return finish(res); }
  // the line ends at its first silence longer than 250 ms (stops like "b" or "t" leave shorter gaps)
  let off = on, gap = 0;
  for (let i = on + 1; i < fr.length; i++) { if (fr[i].rms >= thr) { off = i; gap = 0; } else if (++gap > 25) break; }
  if (pinned > 3) add("fail", "clip", "Too loud: the recording clipped. Back off the mic a little or turn the input gain down, then redo it.");
  else if (peak < 0.06) add("warn", "quiet", `Quite quiet (peak ${res.peakDb.toFixed(0)} dB). Move a little closer or turn the input up.`);
  if (res.noiseDb > -50) add("warn", "noise", `Background noise is high (${res.noiseDb.toFixed(0)} dB). A quieter room, or turning off fans, makes a cleaner voice.`);

  const vIdx = phones.map((p, i) => (EN_V.has(p) ? i : -1)).filter((i) => i >= 0), nV = vIdx.length;
  const onT = fr[on].t - 0.02, endT = fr[off].t + 0.02;
  const shift = Math.max(-0.4, Math.min(0.4, onT - expectedStart));
  const beatAt = (k) => expectedStart + shift + k * beat;
  if (endT < beatAt(nV - 1) + Math.min(0.15, beat * 0.3)) {
    add("fail", "partial", `We only heard part of the line. Sing all ${nV} syllables, one on each beat, without stopping.`);
    res.onset = onT; res.end = endT; return finish(res);
  }
  const voicedLoud = fr.slice(on, off + 1).filter((f) => f.f0 > 0);
  const loud = median((voicedLoud.length ? voicedLoud : fr.slice(on, off + 1)).map((f) => f.rms));
  res.levelDb = db(loud);
  const vowelish = (i) => fr[i].f0 > 0 && fr[i].rms >= loud * 0.5;
  const score = (i) => (fr[i].f0 > 0 ? fr[i].rms : fr[i].rms * 0.2);

  // the consonants (or vowel change) between vowel k and vowel k+1
  const bounds = [];
  let unclear = 0, consBounds = 0;
  for (let k = 0; k + 1 < nV; k++) {
    const nC = vIdx[k + 1] - vIdx[k] - 1, b = beatAt(k + 1);
    const prevEnd = bounds.length ? bounds[bounds.length - 1].e : onT;
    let a = Math.max(fi(b - 0.5 * beat), fi(prevEnd + 0.06)), z = Math.min(fi(b + 0.35 * beat), off - 1);
    if (z <= a) z = a + 1;
    let m = a;
    for (let i = a; i <= z; i++) if (score(i) < score(m)) m = i;
    if (nC === 0) { bounds.push({ s: T(m), e: T(m) }); continue; }
    consBounds++;
    let s = m, e = m;
    while (s - 1 >= a && !vowelish(s - 1)) s--;
    while (e + 1 <= z && !vowelish(e + 1)) e++;
    if (vowelish(m) || e - s < 2) { unclear++; const w = 0.04 * nC; bounds.push({ s: T(m) - w, e: T(m) + w }); }
    else bounds.push({ s: T(s) - 0.005, e: T(e) + 0.005 });
  }
  // where the first vowel settles after any leading consonants
  const nL = vIdx[0];
  let v0 = onT;
  if (nL > 0) {
    v0 = -1;
    const lim = nV > 1 ? fi(bounds[0].s) - 3 : off - 3;
    for (let i = on; i < lim; i++) {
      const w = fr.slice(i, i + 5);
      if (w.length === 5 && w.every((f) => f.f0 > 0 && f.rms >= loud * 0.35)) {
        const ms = w.map((f) => hzToMidi(f.f0));
        if (Math.max(...ms) - Math.min(...ms) < 0.6) { v0 = fr[i].t - 0.02; break; }
      }
    }
    if (v0 < 0) v0 = onT + 0.06 * nL;
  }
  // where the last vowel stops before any ending consonants
  const nT = phones.length - 1 - vIdx[nV - 1];
  let vEnd = endT;
  if (nT > 0) {
    const from = nV > 1 ? fi(bounds[nV - 2].e) + 3 : fi(v0) + 3;
    let lastV = -1;
    for (let i = off; i >= from; i--) if (vowelish(i)) { lastV = i; break; }
    vEnd = lastV > 0 ? fr[lastV].t + 0.02 : endT - 0.06 * nT;
    if (endT - vEnd < 0.03 * nT) vEnd = endT - 0.05 * nT;
  }
  // lay every phone out in time
  const seg = [], spread = (ps, s, e) => ps.forEach((ph, j) => seg.push({ ph, start: s + ((e - s) * j) / ps.length, end: s + ((e - s) * (j + 1)) / ps.length }));
  spread(phones.slice(0, nL), onT, v0);
  for (let k = 0; k < nV; k++) {
    const s = k === 0 ? v0 : bounds[k - 1].e, e = k === nV - 1 ? vEnd : bounds[k].s;
    seg.push({ ph: phones[vIdx[k]], start: s, end: Math.max(s + 0.02, e) });
    if (k + 1 < nV) spread(phones.slice(vIdx[k] + 1, vIdx[k + 1]), bounds[k].s, bounds[k].e);
  }
  spread(phones.slice(vIdx[nV - 1] + 1), vEnd, endT);
  res.segments = seg; res.onset = onT; res.end = endT;

  const vowels = seg.filter((g) => EN_V.has(g.ph));
  const shortest = Math.min(...vowels.map((g) => g.end - g.start));
  if (Math.abs(shift) >= 0.3) add("warn", "timing", shift > 0 ? `You came in ${shift.toFixed(1)} s late. Start the first syllable right on the beat.` : `You came in ${(-shift).toFixed(1)} s early. Wait for the beat after the count-in.`);
  if (shortest < 0.12) add("warn", "short", "Some vowels were very short. Hold each vowel until the next beat so it can be stretched.");
  if (consBounds && unclear / consBounds > 0.5) add("warn", "unclear", "We couldn't hear clear breaks between some syllables, so they were placed by the beat. Sing each consonant a little more clearly, or check those sounds in OpenUtau.");
  const mids = vowels.flatMap((g) => fr.filter((f) => f.t >= g.start + (g.end - g.start) * 0.25 && f.t <= g.end - (g.end - g.start) * 0.25 && f.f0 > 0).map((f) => hzToMidi(f.f0)));
  if (mids.length < 5) add("warn", "pitch", "We couldn't hear a steady pitch. Sing every syllable on the one note.");
  else {
    const m = median(mids);
    let c = (m - targetMidi) * 100;
    const oct = Math.round(c / 1200);
    if (oct !== 0 && Math.abs(c - oct * 1200) < 60) { add("warn", "octave", `That was an octave ${oct > 0 ? "above" : "below"} the guide note. Fine if that's your range, but keep every take in the same octave.`); c -= oct * 1200; }
    res.cents = Math.round(c);
    if (Math.abs(c) > 60) add("warn", "pitch", `About ${Math.abs(Math.round(c))} cents ${c > 0 ? "sharp" : "flat"} of ${targetName ?? noteName(targetMidi)}. Listen to the guide note and match it.`);
  }
  res.otos = diphoneOtos(seg, x.length / sr);
  return finish(res);
}

/** oto entries for every join between neighbouring segments (ms, as UTAU expects). */
export function diphoneOtos(seg, durS) {
  const sil0 = { ph: "-", start: seg[0].start - 0.1, end: seg[0].start }, last = seg[seg.length - 1];
  const sil1 = { ph: "-", start: last.end, end: last.end + 0.1 };
  const s = [sil0, ...seg, sil1], out = [], ms = (v) => Math.round(v * 1000);
  for (let i = 0; i + 1 < s.length; i++) {
    const A = s[i], B = s[i + 1], tb = B.start, dA = A.end - A.start, dB = B.end - B.start;
    let offset = A.ph === "-" ? tb - 0.06 : Math.max(A.start + dA * (EN_V.has(A.ph) ? 0.5 : 0.3), tb - 0.25);
    offset = Math.max(0, Math.min(offset, tb - 0.01));
    const pre = tb - offset;
    const overlap = A.ph === "-" ? 0 : Math.min(0.04, pre * 0.3);
    let fixed, endAt;
    if (B.ph === "-") { fixed = pre + 0.02; endAt = Math.min(durS, tb + 0.12); }
    else if (EN_V.has(B.ph)) { fixed = pre + Math.min(0.06, dB * 0.3); endAt = B.start + dB * 0.6; }
    else { fixed = pre + dB * 0.6; endAt = B.start + dB * 0.9; }
    const len = Math.max(fixed + 0.02, endAt - offset);
    out.push({ alias: `${A.ph} ${B.ph}`, offset: ms(offset), consonant: ms(fixed), cutoff: -ms(len), preutter: ms(pre), overlap: ms(overlap) });
  }
  return out;
}

export function kindOf(entry) {
  if (entry.lang === "en") return "line";
  if (entry.custom) return "custom";
  if (entry.key === "br") return "breath";
  if (entry.key === "n") return "hum";
  if (entry.group === "vowels") return "vowel";
  return "cv";
}

/** A take's level against the voicebank's others: a big jump sounds like a different session. */
export function levelCheck(levelDb, others) {
  const o = others.filter((v) => Number.isFinite(v) && v > -100);
  if (o.length < 4) return null;
  const m = median(o), d = levelDb - m;
  if (Math.abs(d) < 6) return null;
  return { level: "warn", id: "level", text: `This take is ${Math.abs(d).toFixed(0)} dB ${d > 0 ? "louder" : "quieter"} than your others. Keep the same distance from the mic every time.` };
}

// ---- audio files ----
/** Mono 16-bit PCM WAV, with a little dither. */
export function wavMono16(x, sr) {
  const n = x.length, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); str(8, "WAVE"); str(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true);
  v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, "data"); v.setUint32(40, n * 2, true);
  let seed = 12345;
  for (let i = 0; i < n; i++) {
    seed = (seed * 1103515245 + 12345) >>> 0; const r1 = seed / 4294967296;
    seed = (seed * 1103515245 + 12345) >>> 0; const r2 = seed / 4294967296;
    const s = Math.max(-1, Math.min(1, x[i])) * 32767 + (r1 - r2);
    v.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, Math.round(s))), true);
  }
  return new Uint8Array(buf);
}
/** Reads the mono 16-bit WAV written above back into floats. */
export function readWavMono16(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sr = v.getUint32(24, true), n = v.getUint32(40, true) / 2, x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = v.getInt16(44 + i * 2, true) / 32768;
  return { x, sr };
}
/** Simple linear resampler (the page uses OfflineAudioContext; this is the fallback and for tests). */
export function resampleLinear(x, from, to) {
  if (from === to) return x;
  const n = Math.floor((x.length * to) / from), y = new Float32Array(n), r = from / to;
  for (let i = 0; i < n; i++) { const p = i * r, k = Math.floor(p), f = p - k; y[i] = (x[k] ?? 0) * (1 - f) + (x[k + 1] ?? x[k] ?? 0) * f; }
  return y;
}

// ---- the voicebank's text files ----
/** Splits the keyboard between the recorded notes (each note covers the keys nearest to it). */
export function toneRanges(midis) {
  const s = [...new Set(midis)].sort((a, b) => a - b);
  return s.map((m, i) => {
    const lo = i === 0 ? 24 : Math.floor((s[i - 1] + m) / 2) + 1;
    const hi = i === s.length - 1 ? 107 : Math.floor((m + s[i + 1]) / 2);
    return { midi: m, range: `${noteName(lo)}-${noteName(hi)}` };
  });
}

/**
 * takes: [{ entry, midi, oto }] for one voicebank (any number of notes).
 * With more than one note, each note's files live in a folder named after it and its aliases get
 * the note as a suffix ("kaG3"), which character.yaml maps to that part of the keyboard.
 */
export function buildVoicebank({ name, author = "", web = "", terms = "", image = null, takes }) {
  const midis = [...new Set(takes.map((t) => t.midi))].sort((a, b) => a - b);
  const multi = midis.length > 1;
  const files = [], rank = { ok: 0, warn: 1 };
  const english = takes.filter((t) => t.entry.lang === "en").length, japanese = takes.length - english;
  for (const m of midis) {
    const suffix = multi ? noteName(m) : "", dir = multi ? noteName(m) + "/" : "";
    const lines = [], seen = new Set();
    // the cleanest take of a join wins when several English lines contain it
    const here = takes.filter((t) => t.midi === m).sort((a, b) => (rank[a.level] ?? 1) - (rank[b.level] ?? 1));
    for (const t of here) {
      if (!t.oto) continue;
      const f = t.entry.key + ".wav", row = (a, o) => { if (seen.has(a)) return; seen.add(a); lines.push(`${f}=${a}${suffix},${o.offset},${o.consonant},${o.cutoff},${o.preutter},${o.overlap}`); };
      if (Array.isArray(t.oto)) { for (const o of t.oto) row(o.alias, o); continue; }
      for (const a of new Set([t.entry.custom ? t.entry.kana : t.entry.key, t.entry.kana])) row(a, t.oto);
    }
    files.push({ path: dir + "oto.ini", text: lines.join("\r\n") + "\r\n" });
  }
  const ranges = toneRanges(midis);
  const yamlStr = (s) => JSON.stringify(String(s));
  let yaml = `name: ${yamlStr(name)}\n`;
  if (image) yaml += `image: ${yamlStr(image)}\n`;
  if (author) yaml += `author: ${yamlStr(author)}\n`;
  if (web) yaml += `web: ${yamlStr(web)}\n`;
  yaml += `text_file_encoding: utf-8\nsinger_type: utau\n`;
  if (english > japanese) yaml += `default_phonemizer: ${ARPASING}\n`;
  yaml += `subbanks:\n`;
  for (const r of ranges) yaml += `- prefix: ""\n  suffix: ${yamlStr(multi ? noteName(r.midi) : "")}\n  tone_ranges:\n  - ${r.range}\n`;
  files.push({ path: "character.yaml", text: yaml });
  let txt = `name=${name}\r\n`;
  if (image) txt += `image=${image}\r\n`;
  if (author) txt += `author=${author}\r\n`;
  if (web) txt += `web=${web}\r\n`;
  files.push({ path: "character.txt", text: txt });
  const type = english && japanese ? "Japanese CV plus English diphones (ARPAsing)" : english ? "English diphones (ARPAsing)" : "Japanese CV (UTAU style)";
  files.push({ path: "readme.txt", text: readme({ name, author, web, terms, midis, count: takes.length, type, english: english > japanese }) });
  return { files, midis, multi };
}
/** OpenUtau's built-in English phonemizer (picks the right joins from normal English lyrics). */
export const ARPASING = "OpenUtau.Plugin.Builtin.ArpasingPhonemizer";

export const TERMS = {
  open: "Free to use for anything, including songs you sell, as long as you credit the voice. Don't redistribute or resell the voicebank itself. Don't use it for hateful, sexual or illegal content. Don't use it to train AI voice models without written permission.",
  noncommercial: "Free for personal, non-commercial songs with credit. Ask the author before selling anything made with it. Don't redistribute or resell the voicebank. Don't use it for hateful, sexual or illegal content, or to train AI voice models.",
  private: "Private voicebank. Not for sharing or redistribution.",
};
export function readme({ name, author, web, terms, midis, count, type = "Japanese CV (UTAU style)", english = false }) {
  const lines = [
    `${name}`, "".padEnd(name.length, "="), "",
    author ? `Voice and voicebank by ${author}.` : "",
    web ? `More: ${web}` : "",
    "",
    `Type: ${type}. Load it in OpenUtau by dropping this zip onto the window.`,
    english ? "In OpenUtau, use the English (Arpasing) phonemizer and type normal English lyrics." : "",
    `Recorded notes: ${midis.map(noteName).join(", ")}. ${count} samples.`,
    "",
    "Terms of use",
    "------------",
    terms || TERMS.open,
    "",
    "Credit as: " + (author ? `${name} (voice by ${author})` : name),
    "",
    "Made with ENCORE. Voicebank.",
  ];
  return lines.filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\r\n") + "\r\n";
}

/** Safe folder name for the zip. */
export const folderName = (s) => String(s || "voicebank").normalize("NFKD").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_").slice(0, 40) || "voicebank";
