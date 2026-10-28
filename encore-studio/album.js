// Encore Album: the parts of mastering a whole album or EP that aren't audio
// processing. Plain ES module (pages, workers and Node tests).
//
// How an album is mastered: every track gets the album's sound (style,
// intensity, EQ). Loudness is set per track: the loudest track lands on the
// album's target, and the others keep some of the loudness difference they
// had in the mix ("flow"), so a ballad still sits a little under the single.

/** Loudness each track is mastered to.
 *  tracks: [{ origLufs, nudgeDb }]; keep: 0 = every track equally loud,
 *  1 = keep the differences in the mixes (up to MAX_GAP dB). */
export const MAX_GAP = 6;
export function trackTargets(tracks, targetLufs, keep) {
  const known = tracks.map((t) => t.origLufs).filter((v) => Number.isFinite(v) && v > -70);
  const loudest = known.length ? Math.max(...known) : null;
  return tracks.map((t) => {
    const gap = loudest !== null && Number.isFinite(t.origLufs) && t.origLufs > -70 ? Math.min(MAX_GAP, loudest - t.origLufs) : 0;
    const v = targetLufs - keep * gap + (t.nudgeDb ?? 0);
    return Math.round(Math.max(-30, Math.min(targetLufs + 3, v)) * 10) / 10;
  });
}

/** Where the music starts and stops (seconds), leaving a breath at each end.
 *  Peaks under -54 dBFS (room tone, a count-in click bleeding through) count as silence. */
export function findTrim(l, r, fs, thresholdDb = -54) {
  const thr = Math.pow(10, thresholdDb / 20), hop = Math.max(1, Math.round(fs * 0.01)), n = l.length;
  let first = -1, last = -1;
  for (let i = 0; i < n; i += hop) {
    let p = 0; const e = Math.min(n, i + hop);
    for (let k = i; k < e; k++) { const a = Math.abs(l[k]), b = Math.abs(r[k]); if (a > p) p = a; if (b > p) p = b; }
    if (p > thr) { if (first < 0) first = i; last = e; }
  }
  if (first < 0) return { start: 0, end: n / fs };
  return { start: Math.max(0, first / fs - 0.02), end: Math.min(n / fs, last / fs + 0.3) };
}

const clean = (s) => String(s ?? "").replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").trim();
const pad = (n, total) => String(n).padStart(Math.max(2, String(total).length), "0");

/** The tags for one track. album = { artist, title, year, genre, publisher,
 *  copyright, upc }, track = { title, featuring, composer, isrc, explicit, lyrics } */
export function trackMeta(album, track, i, count) {
  const feat = clean(track.featuring);
  return {
    artist: [clean(album.artist), feat && `feat. ${feat}`].filter(Boolean).join(" "),
    albumArtist: clean(album.artist), title: clean(track.title) || `Track ${i + 1}`, album: clean(album.title),
    year: clean(album.year), genre: album.genre ?? "", track: `${i + 1}/${count}`, disc: "1/1",
    isrc: clean(track.isrc), composer: clean(track.composer), publisher: clean(album.publisher),
    copyright: clean(album.copyright), upc: clean(album.upc), explicit: !!track.explicit, lyrics: track.lyrics ?? "",
    comment: album.comment ?? "",
  };
}

export const FORMATS = {
  wav24: { folder: "WAV 24-bit", ext: "wav", label: "WAV 24-bit" },
  wav16: { folder: "WAV 16-bit", ext: "wav", label: "WAV 16-bit" },
  mp3: { folder: "MP3", ext: "mp3", label: "MP3 320" },
};

/** "Artist - Album" folder, then a folder per format: "01 Title.wav" */
export function albumFolder(album) {
  return [clean(album.artist), clean(album.title) || "Untitled album"].filter(Boolean).join(" - ");
}
export function trackPath(album, track, i, count, format) {
  const f = FORMATS[format];
  return `${albumFolder(album)}/${f.folder}/${pad(i + 1, count)} ${clean(track.title) || `Track ${i + 1}`}.${f.ext}`;
}

const clock = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/** A plain-text tracklist with the numbers a distributor or label asks for */
export function tracklistText(album, rows) {
  const lines = [`${clean(album.artist)} - ${clean(album.title) || "Untitled album"}`];
  const extra = [album.year && `Year: ${album.year}`, album.genre && `Genre: ${album.genre}`, album.publisher && `Label: ${album.publisher}`,
    album.copyright && `Copyright: ${album.copyright}`, album.upc && `UPC: ${album.upc}`].filter(Boolean);
  lines.push(...extra, "");
  rows.forEach((r, i) => {
    const bits = [clock(r.seconds), r.isrc && `ISRC ${r.isrc}`, r.explicit && "Explicit", Number.isFinite(r.lufs) && `${r.lufs.toFixed(1)} LUFS`, Number.isFinite(r.peakDb) && `peak ${r.peakDb.toFixed(1)} dBFS`].filter(Boolean);
    lines.push(`${pad(i + 1, rows.length)}. ${clean(r.title) || `Track ${i + 1}`}${r.featuring ? ` (feat. ${clean(r.featuring)})` : ""}  [${bits.join(", ")}]`);
    if (r.composer) lines.push(`    Written by ${clean(r.composer)}`);
  });
  const total = rows.reduce((a, r) => a + r.seconds, 0);
  lines.push("", `Total time: ${clock(total)}`, "Mastered with Encore Studio", "");
  return lines.join("\r\n");
}

/** A 32-bit float WAV from decoded channels, so compressed files can be read
 *  like any WAV (by workers, a piece at a time) */
export function floatWavBlob(chans, fs) {
  const n = chans[0].length, c = Math.min(2, chans.length), bytes = n * c * 4;
  const head = new ArrayBuffer(44), v = new DataView(head);
  const s = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  s(0, "RIFF"); v.setUint32(4, 36 + bytes, true); s(8, "WAVE"); s(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 3, true);
  v.setUint16(22, c, true); v.setUint32(24, fs, true); v.setUint32(28, fs * c * 4, true); v.setUint16(32, c * 4, true); v.setUint16(34, 32, true);
  s(36, "data"); v.setUint32(40, bytes, true);
  const parts = [head], step = 1 << 18;
  for (let a = 0; a < n; a += step) { // interleave a piece at a time
    const m = Math.min(step, n - a), out = new Float32Array(m * c);
    for (let k = 0; k < c; k++) { const ch = chans[k]; for (let i = 0; i < m; i++) out[i * c + k] = ch[a + i]; }
    parts.push(out.buffer);
  }
  return new Blob(parts, { type: "audio/wav" });
}
