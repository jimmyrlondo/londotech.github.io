// ENCORE. Learning Tracks: small generated scores. The sample songs on the Open tab and the
// test fixtures (test-parts.mjs, web/tools/parts-flow.mjs) all come from here, so nothing
// big is committed. Original four-part writing, no borrowed tunes. Pure, so node uses it.

const STEPS = ["C", "C", "D", "D", "E", "F", "F", "G", "G", "A", "A", "B"];
const ALTERS = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0];
const pitchXml = (m) => `<pitch><step>${STEPS[m % 12]}</step>${ALTERS[m % 12] ? "<alter>1</alter>" : ""}<octave>${Math.floor(m / 12) - 1}</octave></pitch>`;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// A short hymn-like phrase in C major, 4/4: one entry per beat (a number) or [midi, beats] for longer notes.
export const HYMN = {
  title: "Morning Song",
  tempo: 92,
  soprano: [72, 71, 72, 74, 76, 74, 72, 71, 72, 74, 71, 67, [72, 4]],
  alto: [67, 67, 67, 67, 69, 67, 64, 62, 64, 65, 62, 62, [64, 4]],
  tenor: [64, 62, 64, 65, 64, 62, 60, 59, 60, 60, 59, 59, [55, 4]],
  bass: [48, 55, 52, 53, 48, 50, 52, 55, 57, 53, 55, 43, [48, 4]],
  lyrics: ["Sing", "a", "new", "song", "in", "the", "morn", "ing", "light", "and", "car", "ry", "home"],
  hyphen: [6], // "morn-ing"
};
// A barbershop-style tag in Bb (sounding pitch), 4/4: Lead has the tune, Tenor above, Bari fills, Bass at the bottom.
export const TAG = {
  title: "Sweet Harmony Tag",
  tempo: 72,
  key: -2,
  tenor: [[70, 2], [72, 2], [74, 2], [72, 2], [74, 2], [75, 2], [74, 4]],
  lead: [[65, 2], [65, 2], [67, 2], [66, 2], [65, 2], [67, 2], [65, 4]],
  bari: [[62, 2], [60, 2], [58, 2], [62, 2], [60, 2], [61, 2], [62, 4]],
  bass: [[46, 2], [53, 2], [43, 2], [50, 2], [48, 2], [51, 2], [46, 4]],
  lyrics: ["Sweet", "har", "mo", "ny,", "sing", "it", "out"],
  hyphen: [1, 2],
};

const asNotes = (list) => list.map((x) => (Array.isArray(x) ? { midi: x[0], beats: x[1] } : { midi: x, beats: 1 }));
const TYPE = { 1: "quarter", 2: "half", 3: "half", 4: "whole" };

// one voice's notes for one measure (divisions = 1 per quarter)
function measureNotes(notes, from, to, { voice = 1, staff = 0, lyrics = null, hyphen = [] } = {}) {
  let beat = 0, out = "";
  notes.forEach((n, i) => {
    const s = beat; beat += n.beats;
    if (s < from || s >= to) return;
    const lyr = lyrics && lyrics[i] ? `<lyric number="1"><syllabic>${hyphen.includes(i) ? "begin" : hyphen.includes(i - 1) ? "end" : "single"}</syllabic><text>${esc(lyrics[i])}</text></lyric>` : "";
    out += `<note>${pitchXml(n.midi)}<duration>${n.beats}</duration><voice>${voice}</voice><type>${TYPE[n.beats]}</type>${n.beats === 3 ? "<dot/>" : ""}${staff ? `<staff>${staff}</staff>` : ""}${lyr}</note>`;
  });
  return out;
}

/**
 * A partwise MusicXML score from voices: parts = [{ name, clef: "treble"|"treble8vb"|"bass", voices: [{ notes, lyrics?, hyphen? }] }].
 * Two voices in a part share one staff (voice 1 and 2 with a backup), the way closed choral scores and barbershop are written.
 * chordal: true writes the part's two voices as chords in one voice instead (hymnal style).
 */
export function scoreXml({ title = "Untitled", tempo = 96, key = 0, beats = 4, parts = [], chordal = false }) {
  const clefXml = (c) => (c === "bass" ? "<clef><sign>F</sign><line>4</line></clef>" : c === "treble8vb" ? "<clef><sign>G</sign><line>2</line><clef-octave-change>-1</clef-octave-change></clef>" : "<clef><sign>G</sign><line>2</line></clef>");
  const total = Math.max(...parts.flatMap((p) => p.voices.map((v) => asNotes(v.notes).reduce((a, n) => a + n.beats, 0))));
  const bars = Math.ceil(total / beats);
  let list = "", body = "";
  parts.forEach((p, pi) => {
    const id = "P" + (pi + 1);
    list += `<score-part id="${id}"><part-name>${esc(p.name)}</part-name><score-instrument id="${id}-I1"><instrument-name>${esc(p.instrument || "Voice")}</instrument-name></score-instrument></score-part>`;
    body += `<part id="${id}">`;
    for (let b = 0; b < bars; b++) {
      const from = b * beats, to = from + beats;
      body += `<measure number="${b + 1}">`;
      if (b === 0) body += `<attributes><divisions>1</divisions><key><fifths>${key}</fifths><mode>major</mode></key><time><beats>${beats}</beats><beat-type>4</beat-type></time>${clefXml(p.clef)}</attributes>`
        + (pi === 0 ? `<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${tempo}</per-minute></metronome></direction-type><sound tempo="${tempo}"/></direction>` : "");
      if (chordal && p.voices.length === 2) {
        // the two voices as chords: a note, then <chord/> for the second one unless they're the same pitch
        const a = asNotes(p.voices[0].notes), c = asNotes(p.voices[1].notes);
        let beat = 0;
        a.forEach((n, i) => {
          const s = beat; beat += n.beats;
          if (s < from || s >= to) return;
          const lo = c[i], lyr = p.voices[0].lyrics?.[i] ? `<lyric number="1"><text>${esc(p.voices[0].lyrics[i])}</text></lyric>` : "";
          body += `<note>${pitchXml(n.midi)}<duration>${n.beats}</duration><voice>1</voice><type>${TYPE[n.beats]}</type>${lyr}</note>`;
          if (lo && lo.midi !== n.midi) body += `<note><chord/>${pitchXml(lo.midi)}<duration>${n.beats}</duration><voice>1</voice><type>${TYPE[n.beats]}</type></note>`;
        });
      } else {
        p.voices.forEach((v, vi) => {
          if (vi > 0) body += `<backup><duration>${beats}</duration></backup>`;
          body += measureNotes(asNotes(v.notes), from, to, { voice: vi + 1, lyrics: v.lyrics, hyphen: v.hyphen });
        });
      }
      if (b === bars - 1) body += `<barline location="right"><bar-style>light-heavy</bar-style></barline>`;
      body += `</measure>`;
    }
    body += `</part>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n`
    + `<score-partwise version="4.0"><work><work-title>${esc(title)}</work-title></work><part-list>${list}</part-list>${body}</score-partwise>`;
}

/** The hymn as an open SATB score (four staves) */
export const satbOpenXml = (h = HYMN) => scoreXml({
  title: h.title, tempo: h.tempo, parts: [
    { name: "Soprano", clef: "treble", voices: [{ notes: h.soprano, lyrics: h.lyrics, hyphen: h.hyphen }] },
    { name: "Alto", clef: "treble", voices: [{ notes: h.alto, lyrics: h.lyrics, hyphen: h.hyphen }] },
    { name: "Tenor", clef: "treble8vb", voices: [{ notes: h.tenor, lyrics: h.lyrics, hyphen: h.hyphen }] },
    { name: "Bass", clef: "bass", voices: [{ notes: h.bass, lyrics: h.lyrics, hyphen: h.hyphen }] },
  ],
});
/** The hymn as a closed score: two staves, two voices each (or chords, hymnal style) */
export const satbClosedXml = (h = HYMN, { chordal = false, names = ["Women", "Men"] } = {}) => scoreXml({
  title: h.title, tempo: h.tempo, chordal, parts: [
    { name: names[0], clef: "treble", voices: [{ notes: h.soprano, lyrics: h.lyrics, hyphen: h.hyphen }, { notes: h.alto }] },
    { name: names[1], clef: "bass", voices: [{ notes: h.tenor }, { notes: h.bass }] },
  ],
});
/** The tag the barbershop way: Tenor/Lead on one staff, Baritone/Bass on the other */
export const barbershopXml = (t = TAG, names = ["Tenor/Lead", "Baritone/Bass"]) => scoreXml({
  title: t.title, tempo: t.tempo, key: t.key, parts: [
    { name: names[0], clef: "treble8vb", voices: [{ notes: t.tenor }, { notes: t.lead, lyrics: t.lyrics, hyphen: t.hyphen }] },
    { name: names[1], clef: "bass", voices: [{ notes: t.bari }, { notes: t.bass }] },
  ],
});

// ---------- MIDI ----------
const vlq = (n) => { const out = [n & 0x7f]; while ((n >>= 7)) out.unshift((n & 0x7f) | 0x80); return out; };
const ascii = (s) => [...new TextEncoder().encode(s)];
const chunk = (id, bytes) => [...ascii(id), (bytes.length >>> 24) & 255, (bytes.length >>> 16) & 255, (bytes.length >>> 8) & 255, bytes.length & 255, ...bytes];
/**
 * A type 1 Standard MIDI File: tracks = [{ name, channel?, notes: [{ midi, beat, beats, vel? }] }] (beats are quarter notes).
 * opts: { tempo, timeSig: [n, d], key: fifths, division, format0: true puts every track's notes on one track by channel }.
 */
export function midiBytes(tracks, { tempo = 96, timeSig = [4, 4], key = 0, division = 480, format0 = false } = {}) {
  const meta = (type, data) => [0xff, type, ...vlq(data.length), ...data];
  const us = Math.round(60e6 / tempo);
  const cond = [0, ...meta(0x51, [(us >> 16) & 255, (us >> 8) & 255, us & 255]), 0, ...meta(0x58, [timeSig[0], Math.log2(timeSig[1]), 24, 8]), 0, ...meta(0x59, [key & 255, 0]), 0, 0xff, 0x2f, 0];
  const trackBytes = (list, name) => {
    const evs = [];
    list.forEach((t, ti) => {
      const ch = t.channel ?? ti;
      for (const n of t.notes) {
        const on = Math.round(n.beat * division), off = Math.round((n.beat + n.beats) * division) - 1;
        evs.push([on, 1, [0x90 | ch, n.midi, n.vel ?? 90]], [off, 0, [0x80 | ch, n.midi, 0]]);
      }
    });
    evs.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const out = name ? [0, ...meta(0x03, ascii(name))] : [];
    let last = 0;
    for (const [t, , b] of evs) { out.push(...vlq(t - last), ...b); last = t; }
    out.push(0, 0xff, 0x2f, 0);
    return out;
  };
  const body = format0 ? [trackBytes(tracks, "")] : tracks.map((t, i) => trackBytes([{ ...t, channel: t.channel ?? i }], t.name));
  if (format0) body[0] = [...cond.slice(0, -4), ...body[0]];
  const all = format0 ? body : [cond, ...body];
  return Uint8Array.from([...chunk("MThd", [0, format0 ? 0 : 1, 0, all.length, (division >> 8) & 255, division & 255]), ...all.flatMap((t) => chunk("MTrk", t))]);
}
/** A voice line (numbers or [midi, beats]) as MIDI notes from beat 0 */
export function lineNotes(list) {
  let beat = 0;
  return asNotes(list).map((n) => { const out = { midi: n.midi, beat, beats: n.beats }; beat += n.beats; return out; });
}
/** The hymn as MIDI: one track per voice, named or not */
export const satbMidi = (h = HYMN, { names = ["Soprano", "Alto", "Tenor", "Bass"], format0 = false } = {}) =>
  midiBytes([h.soprano, h.alto, h.tenor, h.bass].map((v, i) => ({ name: names[i] || "", notes: lineNotes(v) })), { tempo: h.tempo, format0 });
