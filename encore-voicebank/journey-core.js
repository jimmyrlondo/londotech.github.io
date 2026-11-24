// ENCORE. Journey: the parts of taking songs from finished mix to release
// that aren't a page (so node can test them: test-journey.mjs). The steps:
//   Songs    the files, in release order
//   Master   the album's sound and each song's loudness (album.js, album-worker.js)
//   Details  release and song tags, cover art (album.js trackMeta)
//   Check    Last Call on what will actually be released (lastcall-core.js)
//   Release  every format at once, tagged, in one zip (convert-core.js, convert-worker.js)
import { trackTargets, trackMeta } from "./album.js";
import { PRESETS, FORMATS } from "./convert-core.js";

export const STEPS = [
  { id: "songs", name: "Songs", blurb: "Add your songs" },
  { id: "master", name: "Master", blurb: "One sound for the whole release" },
  { id: "details", name: "Details", blurb: "Titles, credits and cover art" },
  { id: "check", name: "Check", blurb: "Last Call, before it goes out" },
  { id: "release", name: "Release", blurb: "Every format, in one download" },
];

/** What a release with this many songs is usually called */
export const releaseKind = (n) => (n <= 1 ? "single" : n <= 6 ? "EP" : "album");

const clean = (s) => String(s ?? "").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "").replace(/\s+/g, " ").trim();

/** A song title from the file's own tag, or its file name without the clutter
 *  ("01 - My Song (final mix v3).wav" becomes "My Song") */
export function guessTitle(name, tags = {}) {
  if (tags.title && String(tags.title).trim()) return String(tags.title).trim();
  let t = String(name || "").replace(/\.[a-z0-9]{2,5}$/i, "");
  // a track number: "03 - ", "03. ", or a zero-padded "03 " ("99 Problems" keeps its 99)
  t = t.replace(/^\s*(\d{1,3}\s*[-._)]\s*|0\d\s+)/, "").replace(/[_]+/g, " ");
  t = t.replace(/[\s(\[]*(final|master|mix|mixdown|bounce|demo|v\d+|version \d+|\d{1,2}[.\-]\d{1,2}[.\-]\d{2,4})([\s.\-_]*(final|master|mix|mixdown|bounce|v\d+|\d+))*[)\]]?\s*$/i, "");
  t = t.replace(/[\s.\-_]+$/, "");
  return clean(t) || clean(String(name || "").replace(/\.[a-z0-9]{2,5}$/i, "")) || "Untitled";
}

/** Release details from the songs' own tags: the artist, album, year and genre most of them agree on */
export function guessRelease(tagsList) {
  const most = (k) => {
    const n = new Map();
    for (const t of tagsList) { const v = clean(t?.[k]); if (v) n.set(v, (n.get(v) || 0) + 1); }
    return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
  };
  return { artist: most("albumArtist") || most("artist"), title: most("album"), year: (most("year").match(/\d{4}/) || [""])[0], genre: most("genre"),
    publisher: most("publisher"), copyright: most("copyright"), upc: most("upc") };
}

/** The tags each song gets. A single's release title is the song's title unless one is given. */
export function songMeta(release, songs, i) {
  const s = songs[i], album = { ...release, title: release.title || (songs.length === 1 ? s.title : "") };
  return trackMeta(album, s, i, songs.length);
}

/** Loudness each song is mastered to: the album's target for the loudest, the
 *  others keep `flow` of their difference in the mix (album.js) */
export function masterTargets(songs, targetLufs, flow) {
  return trackTargets(songs.map((s) => ({ origLufs: s.origLufs, nudgeDb: s.nudgeDb || 0 })), targetLufs, songs.length > 1 ? flow : 0);
}

/** What Last Call needs to know about the file that will be released (a tagged
 *  24-bit WAV at the song's rate), so the format and tag checks judge the real thing */
export function releaseInfo(meta, fs, seconds, art, bits = 24) {
  return {
    name: meta.title, size: 0, container: "wav", label: "WAV", codec: "PCM", lossy: false, sampleRate: fs, bitDepth: bits, float: false,
    channels: 2, bitrate: 0, vbr: false, duration: seconds, tagFormats: ["ID3", "RIFF INFO"], art: art || null, wav: null,
    tags: { title: meta.title, artist: meta.artist, album: meta.album, year: meta.year, genre: meta.genre, track: meta.track, isrc: meta.isrc,
      composer: meta.composer, albumArtist: meta.albumArtist, copyright: meta.copyright, publisher: meta.publisher, explicit: meta.explicit },
  };
}

/** The formats offered on the Release step (Convert's presets, minus the voice memo) */
export const RELEASE_FORMATS = PRESETS.filter((p) => p.id !== "voice");
/** What a first release usually needs: a 24-bit master, a CD-quality WAV and an MP3 */
export const DEFAULT_FORMATS = ["wav-24", "wav-16-44", "mp3-320"];

/** The zip layout: "Artist - Release/<format>/01 Title.ext" plus the cover, tracklist and check report */
export function releaseFolder(release, songs) {
  const title = clean(release.title) || (songs.length === 1 ? clean(songs[0].title) : "") || `Untitled ${releaseKind(songs.length)}`;
  return [clean(release.artist), title].filter(Boolean).join(" - ");
}
export function releasePath(release, songs, i, presetId) {
  const p = PRESETS.find((x) => x.id === presetId), n = songs.length, pad = String(i + 1).padStart(Math.max(2, String(n).length), "0");
  return `${releaseFolder(release, songs)}/${clean(p.label.replace(/\//g, "-"))}/${pad} ${clean(songs[i].title) || `Track ${i + 1}`}.${FORMATS[p.kind].ext}`;
}

/** Which steps are done, in plain words, for the step bar */
export function stepStatus(state) {
  const n = state.songs.length, ready = state.songs.filter((s) => s.blob).length;
  const mastered = state.skipMaster || (n > 0 && state.songs.every((s) => s.master));
  return {
    songs: n ? (ready === n ? "done" : "busy") : "todo",
    master: !n ? "todo" : state.skipMaster ? "skipped" : mastered ? "done" : state.songs.some((s) => s.master) ? "busy" : "todo",
    details: n && state.release.artist && state.songs.every((s) => s.title) ? "done" : "todo",
    check: state.checked && state.checkedKey === checkKey(state) ? "done" : "todo",
    release: state.released ? "done" : "todo",
  };
}
/** What the check depends on: if any of this changes, check again */
export function checkKey(state) {
  return JSON.stringify([state.skipMaster, state.songs.map((s) => [s.id, s.master?.key || "", s.title, s.isrc]), state.release.artist, state.release.title, !!state.art]);
}
