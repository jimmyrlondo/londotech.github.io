// ENCORE. Credits: the plain logic, no page. Code checks (ISRC, ISWC, UPC/EAN, IPI),
// split math, the registration checklist, catalog health checks, CSV and split sheet
// builders, and the backup format. Everything here is pure: it takes data and returns
// data or text, so the Node test (test-credits.mjs) can check all of it.

export const APP_NAME = "ENCORE. Credits";
export const BACKUP_FORMAT = "encore-credits-backup";
export const BACKUP_VERSION = 1;
export const STORAGE_PREFIX = "encore-credits-";

// ---------- small helpers ----------
export const uid = (p = "x") => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const clean = (s) => String(s ?? "").trim();
const compact = (s) => String(s ?? "").toUpperCase().replace(/[\s\-.‐-―_/]/g, "");

// ---------- codes ----------
// Every check returns { empty, valid, value (normalized for display), digits, message }.
// An empty box is not an error: `empty` is true and `valid` is false.

// ISRC: the recording's ID. CC-XXX-YY-NNNNN: country (2 letters), registrant (3 letters
// or digits), year (2 digits), designation (5 digits). Typed with or without dashes.
export function checkIsrc(input) {
  const raw = clean(input);
  if (!raw) return { empty: true, valid: false, value: "", message: "" };
  const c = compact(raw).replace(/^ISRC:?/, "");
  if (c.length !== 12) return { valid: false, value: raw, message: `An ISRC has 12 letters and numbers (this has ${c.length}), like US-ABC-26-00001.` };
  if (!/^[A-Z]{2}/.test(c)) return { valid: false, value: raw, message: "An ISRC starts with a 2 letter country code, like US or GB." };
  if (!/^[A-Z]{2}[A-Z0-9]{3}/.test(c)) return { valid: false, value: raw, message: "Characters 3 to 5 (the registrant code) are letters or numbers." };
  if (!/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(c)) return { valid: false, value: raw, message: "The last 7 characters are numbers: a 2 digit year, then a 5 digit number." };
  return { valid: true, value: `${c.slice(0, 2)}-${c.slice(2, 5)}-${c.slice(5, 7)}-${c.slice(7)}`, compact: c, year: c.slice(5, 7), country: c.slice(0, 2), message: "" };
}
export const normalizeIsrc = (s) => { const r = checkIsrc(s); return r.valid ? r.value : clean(s); };

// ISWC: the song's ID (the composition). T-123.456.789-C. The check digit C makes
// 1 + 1*d1 + 2*d2 + ... + 9*d9 + C a multiple of 10.
export function iswcCheckDigit(nine) {
  const d = String(nine).replace(/\D/g, "");
  if (d.length !== 9) return null;
  let sum = 1;
  for (let i = 0; i < 9; i++) sum += (i + 1) * Number(d[i]);
  return (10 - (sum % 10)) % 10;
}
export function checkIswc(input) {
  const raw = clean(input);
  if (!raw) return { empty: true, valid: false, value: "", message: "" };
  const c = compact(raw).replace(/^ISWC:?/, "");
  if (!/^T\d{10}$/.test(c)) return { valid: false, value: raw, message: "An ISWC is a T and 10 digits, like T-034.524.680-1." };
  const want = iswcCheckDigit(c.slice(1, 10));
  if (want !== Number(c[10])) return { valid: false, value: raw, message: `The last digit doesn't check out (it should be ${want} for these numbers). Check for a typo.` };
  return { valid: true, value: `T-${c.slice(1, 4)}.${c.slice(4, 7)}.${c.slice(7, 10)}-${c[10]}`, compact: c, message: "" };
}
export const normalizeIswc = (s) => { const r = checkIswc(s); return r.valid ? r.value : clean(s); };

// UPC (12 digits) and EAN (13 digits): the release's barcode. The last digit is a check
// digit: from the right, the other digits are weighted 3, 1, 3, 1...
export function gtinCheckDigit(body) {
  const d = String(body).replace(/\D/g, "");
  let sum = 0;
  for (let i = d.length - 1, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) sum += Number(d[i]) * w;
  return (10 - (sum % 10)) % 10;
}
export function checkUpc(input) {
  const raw = clean(input);
  if (!raw) return { empty: true, valid: false, value: "", message: "" };
  const c = raw.replace(/[\s\-.]/g, "");
  if (!/^\d+$/.test(c)) return { valid: false, value: raw, message: "A barcode is numbers only." };
  if (c.length !== 12 && c.length !== 13) return { valid: false, value: raw, message: `A UPC has 12 digits and an EAN has 13 (this has ${c.length}).` };
  const want = gtinCheckDigit(c.slice(0, -1));
  if (want !== Number(c.at(-1))) return { valid: false, value: raw, message: `The last digit doesn't check out (it should be ${want}). Check for a typo.` };
  return { valid: true, value: c, kind: c.length === 12 ? "UPC" : "EAN", message: "" };
}
export const normalizeUpc = (s) => { const r = checkUpc(s); return r.valid ? r.value : clean(s); };

// IPI / CAE: a songwriter's or publisher's ID number with their PRO, 9 to 11 digits.
export function checkIpi(input) {
  const raw = clean(input);
  if (!raw) return { empty: true, valid: false, value: "", message: "" };
  const c = raw.replace(/[\s\-.]/g, "").replace(/^(IPI|CAE):?/i, "");
  if (!/^\d+$/.test(c)) return { valid: false, value: raw, message: "An IPI number is digits only." };
  if (c.length < 9 || c.length > 11) return { valid: false, value: raw, message: `An IPI number has 9 to 11 digits (this has ${c.length}). Your PRO shows it on your account.` };
  return { valid: true, value: c, message: "" };
}
export const normalizeIpi = (s) => { const r = checkIpi(s); return r.valid ? r.value : clean(s); };

// Duration: "3:25", "1:02:03" or plain seconds
export function parseDuration(s) {
  const t = clean(s);
  if (!t) return null;
  if (/^\d+(\.\d+)?$/.test(t)) return Math.round(Number(t));
  const m = t.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
  if (!m) return NaN;
  if (Number(m[3]) > 59 || (m[1] && Number(m[2]) > 59)) return NaN;
  return Number(m[1] || 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}
export function formatDuration(sec) {
  if (sec == null || !isFinite(sec)) return "";
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

// What each code is, in a line, and who gives it out (shown next to the box)
export const CODE_HELP = {
  isrc: { name: "ISRC", long: "International Standard Recording Code", text: "The ID for this one recording (each version gets its own). It's how streams and radio plays find their way to you.", who: "Your distributor gives you one, usually free. In the US you can also get your own prefix from usisrc.org.", link: "https://usisrc.org" },
  iswc: { name: "ISWC", long: "International Standard Musical Work Code", text: "The ID for the song itself (the words and music), shared by every recording of it.", who: "Assigned through your PRO after you register the song. You don't buy it.", link: "https://www.iswc.org" },
  upc: { name: "UPC / EAN", long: "Universal Product Code / European Article Number", text: "The barcode number for the release (the single, EP or album as a product).", who: "Your distributor gives you one, or you can buy your own from GS1.", link: "https://www.gs1us.org" },
  ipi: { name: "IPI", long: "Interested Party Information number (older name: CAE)", text: "A songwriter's or publisher's ID number, so money goes to the right person even with a common name.", who: "Your PRO assigns it when you join. It's on your PRO account.", link: "" },
};

// ---------- lists ----------
export const PROS = [
  { id: "", label: "Choose..." },
  { id: "ASCAP", label: "ASCAP (US)" }, { id: "BMI", label: "BMI (US)" }, { id: "SESAC", label: "SESAC (US)" }, { id: "GMR", label: "GMR (US)" },
  { id: "SOCAN", label: "SOCAN (Canada)" }, { id: "PRS", label: "PRS (UK)" }, { id: "other", label: "Another country's society" }, { id: "none", label: "Not in a PRO yet" },
];
export const PRO_LINKS = { ASCAP: "https://www.ascap.com", BMI: "https://www.bmi.com", SESAC: "https://www.sesac.com", GMR: "https://globalmusicrights.com", SOCAN: "https://www.socan.com", PRS: "https://www.prsformusic.com" };
export const WRITER_ROLES = [{ id: "both", label: "Words and music" }, { id: "lyrics", label: "Words (lyrics)" }, { id: "music", label: "Music" }];
export const CREDIT_ROLES = ["Producer", "Co-producer", "Recording engineer", "Mixing engineer", "Mastering engineer", "Lead vocals", "Background vocals", "Musician", "Arranger", "Programming", "Assistant engineer", "Executive producer", "Featured artist"];
export const SAMPLE_STATUS = [{ id: "no", label: "Not cleared" }, { id: "asked", label: "Asked" }, { id: "cleared", label: "Cleared" }];
export const STATUS = [{ id: "todo", label: "Not started" }, { id: "doing", label: "In progress" }, { id: "done", label: "Done" }, { id: "na", label: "Not needed" }];
export const RELEASE_TYPES = [{ id: "single", label: "Single" }, { id: "ep", label: "EP" }, { id: "album", label: "Album" }];
export const EXPLICIT = [{ id: "", label: "Not explicit" }, { id: "explicit", label: "Explicit" }, { id: "clean", label: "Clean version" }];

// ---------- the registration checklist ----------
// One plain explanation each: what it is, why it pays you, where to go. US first.
export const SONG_CHECKLIST = [
  { id: "distributor", name: "Distributor", short: "Codes and delivery",
    what: "Your distributor sends the recording to streaming services and stores, and gives it an ISRC (International Standard Recording Code). Check the title, credits and writers there match this page.",
    why: "Streaming and download money for the recording comes through them.", links: [] , copy: "distributor" },
  { id: "pro", name: "PRO song registration", short: "Performance royalties",
    what: "Register the song (writers, shares, publishers) with your PRO (performing rights organization): ASCAP, BMI, SESAC or GMR in the US. Every writer registers with their own PRO.",
    why: "PROs pay songwriters and publishers when the song is played in public: radio, TV, venues and streaming.", links: [["ASCAP", "https://www.ascap.com"], ["BMI", "https://www.bmi.com"], ["SESAC", "https://www.sesac.com"]], copy: "pro" },
  { id: "mlc", name: "The MLC", short: "US mechanical royalties",
    what: "The MLC (Mechanical Licensing Collective) collects mechanical royalties from US streaming services for songwriters and publishers. Self-published writers can join and register songs themselves.",
    why: "Money it can't match to a registered song is held, and eventually paid out to registered songs by market share. Registering is how your share reaches you.", links: [["themlc.com", "https://www.themlc.com"]], copy: "mlc" },
  { id: "soundexchange", name: "SoundExchange", short: "US digital radio, the recording",
    what: "SoundExchange collects for the recording (not the song) when it plays on US digital radio: satellite radio, internet radio and similar services. Sign up as the performer and as the owner of the master (the recording).",
    why: "Performers and recording owners each get a share. Nobody else collects this for you.", links: [["soundexchange.com", "https://www.soundexchange.com"]], copy: "soundexchange" },
  { id: "copyright-song", name: "US Copyright Office: the song", short: "Copyright for the words and music",
    what: "Registers the song (the composition) with the US Copyright Office. Your song is protected once it's written down or recorded; registering adds a public record.",
    why: "A registration matters if you ever need to enforce your rights in a US court. Fees change, so check copyright.gov.", links: [["copyright.gov", "https://www.copyright.gov/registration/"]] },
  { id: "copyright-recording", name: "US Copyright Office: the recording", short: "Copyright for the sound recording",
    what: "Registers the sound recording. If the same people own the song and the recording, one registration can often cover both. Check copyright.gov for which form fits.",
    why: "Same reason as the song: a public record that helps if you ever need to enforce your rights. Fees change, so check copyright.gov.", links: [["copyright.gov", "https://www.copyright.gov/registration/"]] },
  { id: "admin", name: "Publishing administrator", short: "Optional", optional: true,
    what: "A publishing administrator registers your songs with societies around the world and collects publishing money for a share of it. Optional: many artists do it themselves at first.",
    why: "Useful once your songs earn outside the US, where collecting on your own is hard.", links: [] },
  { id: "lyrics", name: "Lyrics", short: "Musixmatch and Genius",
    what: "Add your lyrics on Musixmatch (which supplies lyrics to many streaming apps) and Genius, so the words show up while people listen.",
    why: "Lyrics on screen help fans sing along and find the song. Some services pay lyric royalties to publishers.", links: [["Musixmatch", "https://www.musixmatch.com"], ["Genius", "https://genius.com"]] },
  { id: "contentid", name: "YouTube Content ID", short: "Usually through your distributor",
    what: "Content ID finds your recording in other people's YouTube videos, so ads on those videos can pay you. Most distributors offer it as an option.",
    why: "Videos using your music can earn money for you instead of for no one. Make sure you have the rights to everything in the track first (samples included).", links: [["How Content ID works", "https://support.google.com/youtube/answer/2797370"]] },
];
export const RELEASE_CHECKLIST = [
  { id: "rel-distributor", name: "Release delivered to your distributor", short: "With a UPC and release date",
    what: "The release is uploaded with its cover, track order, release date and UPC (Universal Product Code, the barcode number).",
    why: "Your distributor delivers it to streaming services and stores on the release date.", links: [] },
  { id: "rel-profiles", name: "Artist profiles claimed", short: "Spotify for Artists, Apple Music for Artists",
    what: "Claim your artist profiles so you can check the credits, add a bio and pitch new releases before they come out.",
    why: "Pitching a release early is how it gets considered for editorial playlists.", links: [["Spotify for Artists", "https://artists.spotify.com"], ["Apple Music for Artists", "https://artists.apple.com"]] },
  { id: "rel-copyright", name: "Copyright Office: whole release", short: "Optional", optional: true,
    what: "The US Copyright Office has options to register several songs or recordings from one album in one application.",
    why: "Can save fees compared with one song at a time. Fees and rules change, so check copyright.gov.", links: [["copyright.gov", "https://www.copyright.gov/registration/"]] },
];
export const COUNTRY_NOTE = "This list is US first. Outside the US, your country has its own societies for songwriters (like SOCAN in Canada or PRS in the UK) and for recordings. This is general information, not legal advice.";

export const emptyReg = () => ({ status: "todo", date: "", ref: "", notes: "" });
export function regOf(item, id) { return (item.regs && item.regs[id]) || emptyReg(); }

// "5 of 8 done": not needed items don't count, and optional ones only once you start them
export function progressOf(item, list = SONG_CHECKLIST) {
  let done = 0, total = 0;
  for (const c of list) {
    const r = regOf(item, c.id);
    if (r.status === "na" || (c.optional && r.status === "todo")) continue;
    total++;
    if (r.status === "done") done++;
  }
  return { done, total, pct: total ? Math.round((done / total) * 100) : 100 };
}

// ---------- splits ----------
// Shares are kept in hundredths internally so 33.33 + 33.33 + 33.34 is exactly 100.
export const toHundredths = (v) => { const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", ".").replace("%", "")); return isFinite(n) ? Math.round(n * 100) : null; };
export const fromHundredths = (h) => Number((h / 100).toFixed(2));
export function fmtShare(v) { const h = toHundredths(v); if (h == null) return ""; const n = fromHundredths(h); return (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, "")) + "%"; }

export function splitTotal(rows) {
  let h = 0;
  for (const r of rows || []) { const x = toHundredths(r.share); if (x != null) h += x; }
  return fromHundredths(h);
}
// { total, ok, state: none|under|over|ok, missing (people with no share), message }
export function splitStatus(rows, what = "split") {
  rows = rows || [];
  if (!rows.length) return { total: 0, ok: false, state: "none", left: 100, message: `No one is on the ${what} yet.` };
  const totalH = rows.reduce((a, r) => a + (toHundredths(r.share) ?? 0), 0);
  const total = fromHundredths(totalH);
  const missing = rows.filter((r) => (toHundredths(r.share) ?? 0) <= 0).length;
  const negative = rows.some((r) => (toHundredths(r.share) ?? 0) < 0);
  const unnamed = rows.filter((r) => !clean(r.name)).length;
  if (negative) return { total, ok: false, state: "over", left: fromHundredths(10000 - totalH), missing, unnamed, message: "A share can't be below zero." };
  if (totalH === 10000) return { total, ok: !missing && !unnamed, state: "ok", left: 0, missing, unnamed,
    message: missing ? `Adds up to 100%, but ${missing === 1 ? "one person has" : missing + " people have"} 0%.` : unnamed ? "Adds up to 100%. Fill in every name." : "Adds up to 100%." };
  if (totalH < 10000) return { total, ok: false, state: "under", left: fromHundredths(10000 - totalH), missing, unnamed, message: `Adds up to ${fmtShare(total)}: ${fmtShare(fromHundredths(10000 - totalH))} isn't given to anyone yet.` };
  return { total, ok: false, state: "over", left: fromHundredths(10000 - totalH), missing, unnamed, message: `Adds up to ${fmtShare(total)}: that's ${fmtShare(fromHundredths(totalH - 10000))} too much.` };
}
// 3 people: 33.34, 33.33, 33.33 (the extra hundredths go to the first ones)
export function evenShares(n) {
  if (n <= 0) return [];
  const base = Math.floor(10000 / n), extra = 10000 - base * n;
  return Array.from({ length: n }, (_, i) => fromHundredths(base + (i < extra ? 1 : 0)));
}
export function splitEvenly(rows) { const s = evenShares(rows.length); return rows.map((r, i) => ({ ...r, share: s[i] })); }

// ---------- the data ----------
export function newRelease(fields = {}) {
  return { id: uid("r"), title: "", artist: "", type: "single", date: "", label: "", upc: "", cover: "", notes: "", songIds: [], regs: {}, created: Date.now(), ...fields };
}
export function newSong(fields = {}) {
  return { id: uid("s"), title: "", version: "", artist: "", featured: "", isrc: "", iswc: "", duration: "", explicit: "", genre: "", language: "", lyrics: "",
    releaseId: "", recorded: "", notes: "", writers: [], owners: [], credits: [], samples: [], regs: {}, created: Date.now(), ...fields };
}
export const newWriter = (f = {}) => ({ id: uid("w"), name: "", role: "both", pro: "", ipi: "", publisher: "", publisherIpi: "", share: "", ...f });
export const newOwner = (f = {}) => ({ id: uid("o"), name: "", share: "", notes: "", ...f });
export const newCredit = (f = {}) => ({ id: uid("c"), role: "", name: "", detail: "", ...f });
export const newSample = (f = {}) => ({ id: uid("p"), what: "", owner: "", kind: "sample", status: "no", notes: "", ...f });
export const emptyCatalog = () => ({ releases: [], songs: [] });

export const songTitle = (s) => (clean(s?.title) || "Untitled song") + (clean(s?.version) ? ` (${clean(s.version)})` : "");
export const releaseTitle = (r) => clean(r?.title) || "Untitled release";
export const releaseOf = (cat, song) => cat.releases.find((r) => r.id === song.releaseId) || null;
export const typeLabel = (t) => (RELEASE_TYPES.find((x) => x.id === t) || RELEASE_TYPES[0]).label;

// songs of a release in track order (songIds first, then any stragglers)
export function releaseSongs(cat, rel) {
  const own = cat.songs.filter((s) => s.releaseId === rel.id);
  const order = new Map((rel.songIds || []).map((id, i) => [id, i]));
  return own.sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9) || a.created - b.created);
}
export function moveSongToRelease(cat, songId, releaseId) {
  const s = cat.songs.find((x) => x.id === songId);
  if (!s) return cat;
  for (const r of cat.releases) r.songIds = (r.songIds || []).filter((id) => id !== songId);
  s.releaseId = releaseId || "";
  const r = cat.releases.find((x) => x.id === releaseId);
  if (r) r.songIds.push(songId);
  return cat;
}

// Fill a new song (and its release) from what an audio file's tags say.
// `model` is what tag-core.js readTags() returns: { fields, info, pictures }.
export function songFromTags(model, fileName = "") {
  const f = (model && model.fields) || {};
  const t = (k) => clean(f[k]);
  const title = t("title") || clean(fileName).replace(/\.[^.]+$/, "").replace(/^\d+[\s.\-_]+/, "");
  const isrc = checkIsrc(t("isrc"));
  const song = newSong({
    title, artist: t("artist"), featured: t("featured"), isrc: isrc.valid ? isrc.value : t("isrc"), genre: t("genre"),
    language: t("language"), explicit: f.explicit === "explicit" || f.explicit === "clean" ? f.explicit : "",
    lyrics: t("lyrics") ? "yes" : "", duration: model?.info?.duration ? formatDuration(model.info.duration) : "",
  });
  const names = (s) => clean(s).split(/\s*[;\/]\s*|\s*,\s*(?=\S)/).map(clean).filter(Boolean);
  const writers = [...new Set([...names(t("composer")), ...names(t("lyricist"))])];
  if (writers.length) song.writers = splitEvenly(writers.map((name) => newWriter({ name, role: names(t("lyricist")).includes(name) && !names(t("composer")).includes(name) ? "lyrics" : "both" })));
  for (const [k, role] of [["producer", "Producer"], ["engineer", "Recording engineer"], ["mixer", "Mixing engineer"], ["arranger", "Arranger"]]) for (const name of names(t(k))) song.credits.push(newCredit({ role, name }));
  const rel = t("album") ? { title: t("album"), artist: t("albumArtist") || t("artist"), date: t("date"), label: t("label"), upc: t("barcode") ? normalizeUpc(t("barcode")) : "", total: Number(t("trackTotal")) || 0, track: Number(t("track")) || 0 } : null;
  return { song, release: rel };
}
export function guessReleaseType(total) { return total >= 7 ? "album" : total >= 3 ? "ep" : "single"; }

// ---------- catalog health ----------
// Each issue: { id, kind: "fix" (something's wrong) | "todo" (something's missing), text, count, items: [{ songId | releaseId, tab, field }] }
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
export function catalogHealth(cat) {
  const issues = [];
  const add = (id, kind, items, textFn, tab, field) => { if (items.length) issues.push({ id, kind, count: items.length, text: textFn(items.length), items: items.map((x) => ({ songId: x.songId, releaseId: x.releaseId, name: x.name, tab, field })) }); };
  const S = (s) => ({ songId: s.id, name: songTitle(s) });
  const songs = cat.songs;

  add("badIsrc", "fix", songs.filter((s) => clean(s.isrc) && !checkIsrc(s.isrc).valid).map(S), (n) => `${plural(n, "song has an ISRC", "songs have an ISRC")} that doesn't look right`, "details", "isrc");
  add("badIswc", "fix", songs.filter((s) => clean(s.iswc) && !checkIswc(s.iswc).valid).map(S), (n) => `${plural(n, "song has an ISWC", "songs have an ISWC")} that doesn't check out`, "details", "iswc");
  // the same ISRC on two different songs
  const byIsrc = new Map();
  for (const s of songs) { const r = checkIsrc(s.isrc); if (r.valid) byIsrc.set(r.compact, [...(byIsrc.get(r.compact) || []), s]); }
  add("dupIsrc", "fix", [...byIsrc.values()].filter((g) => g.length > 1).flat().map(S), (n) => `${n} songs share an ISRC (each recording needs its own)`, "details", "isrc");
  add("splitBad", "fix", songs.filter((s) => s.writers.length && splitStatus(s.writers).state !== "ok").map(S), (n) => `${plural(n, "song's songwriting split doesn't", "songs' songwriting splits don't")} add up to 100%`, "writing", "");
  add("masterBad", "fix", songs.filter((s) => s.owners.length && splitStatus(s.owners).state !== "ok").map(S), (n) => `${plural(n, "song's master split doesn't", "songs' master splits don't")} add up to 100%`, "master", "");
  add("badIpi", "fix", songs.filter((s) => s.writers.some((w) => (clean(w.ipi) && !checkIpi(w.ipi).valid) || (clean(w.publisherIpi) && !checkIpi(w.publisherIpi).valid))).map(S), (n) => `${plural(n, "song has", "songs have")} an IPI number that doesn't look right`, "writing", "");
  add("samples", "fix", songs.filter((s) => s.samples.some((p) => p.status !== "cleared")).map(S), (n) => `${plural(n, "song has", "songs have")} a sample not cleared yet`, "samples", "");
  add("noWriters", "todo", songs.filter((s) => !s.writers.length).map(S), (n) => `${plural(n, "song has", "songs have")} no songwriters listed`, "writing", "");
  add("noOwners", "todo", songs.filter((s) => !s.owners.length).map(S), (n) => `${plural(n, "song has", "songs have")} no master owner listed`, "master", "");
  add("noIsrc", "todo", songs.filter((s) => !clean(s.isrc)).map(S), (n) => `${plural(n, "song has", "songs have")} no ISRC`, "details", "isrc");
  add("noIswc", "todo", songs.filter((s) => !clean(s.iswc)).map(S), (n) => `${plural(n, "song has", "songs have")} no ISWC`, "details", "iswc");
  add("writerPro", "todo", songs.filter((s) => s.writers.some((w) => !w.pro)).map(S), (n) => `${plural(n, "song has a writer", "songs have writers")} with no PRO chosen`, "writing", "");
  add("writerIpi", "todo", songs.filter((s) => s.writers.some((w) => w.pro && w.pro !== "none" && !clean(w.ipi))).map(S), (n) => `${plural(n, "song has a writer", "songs have writers")} in a PRO but no IPI number`, "writing", "");
  for (const c of SONG_CHECKLIST) {
    if (c.optional) continue;
    const left = songs.filter((s) => { const st = regOf(s, c.id).status; return st !== "done" && st !== "na"; });
    add("reg-" + c.id, "todo", left.map(S), (n) => `Not done with ${c.name}: ${plural(n, "song", "songs")}`, "regs", c.id);
  }
  const R = (r) => ({ releaseId: r.id, name: releaseTitle(r) });
  add("badUpc", "fix", cat.releases.filter((r) => clean(r.upc) && !checkUpc(r.upc).valid).map(R), (n) => `${plural(n, "release has a UPC", "releases have a UPC")} that doesn't check out`, "release", "upc");
  add("noUpc", "todo", cat.releases.filter((r) => !clean(r.upc)).map(R), (n) => `${plural(n, "release has", "releases have")} no UPC`, "release", "upc");
  add("emptyRelease", "todo", cat.releases.filter((r) => !cat.songs.some((s) => s.releaseId === r.id)).map(R), (n) => `${plural(n, "release has", "releases have")} no songs`, "release", "");
  add("relDist", "todo", cat.releases.filter((r) => !["done", "na"].includes(regOf(r, "rel-distributor").status)).map(R), (n) => `Not delivered to a distributor yet: ${plural(n, "release", "releases")}`, "release", "rel-distributor");
  return issues;
}
// What a single song is missing, short, for its own header
export function songIssues(cat, song) {
  return catalogHealth({ releases: [], songs: [song] }).map((i) => ({ ...i, text: i.text.replace(/^1 song (has|'s)\s*/, (m, v) => (v === "has" ? "Has " : "")).replace(/^Not done with (.+): 1 song$/, "Not done: $1") }));
}
export function catalogSummary(cat) {
  let done = 0, total = 0;
  for (const s of cat.songs) { const p = progressOf(s); done += p.done; total += p.total; }
  for (const r of cat.releases) { const p = progressOf(r, RELEASE_CHECKLIST); done += p.done; total += p.total; }
  return { songs: cat.songs.length, releases: cat.releases.length, done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

// ---------- CSV ----------
// Commas, quotes and line breaks are quoted; a cell that would start a spreadsheet formula gets a ' in front.
export function csvCell(v) {
  let s = String(v ?? "");
  if (/^[=+@\t\r]/.test(s) || (/^-/.test(s) && !/^-?\d+(\.\d+)?$/.test(s))) s = "'" + s;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export const toCsv = (rows) => "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
const proName = (id) => (id === "none" ? "None" : id === "other" ? "Other" : id || "");
const roleName = (id) => (WRITER_ROLES.find((r) => r.id === id) || WRITER_ROLES[0]).label;
const explicitName = (id) => (EXPLICIT.find((e) => e.id === (id || "")) || EXPLICIT[0]).label;
const statusName = (id) => (STATUS.find((s) => s.id === id) || STATUS[0]).label;

export function catalogCsv(cat) {
  const head = ["Title", "Version", "Main artist(s)", "Featured artist(s)", "ISRC", "ISWC", "Duration", "Explicit", "Genre", "Language", "Lyrics", "Release", "Release type", "Track", "UPC/EAN", "Release date", "Label", "Recording date",
    "Songwriters", "Songwriting total %", "Master owners", "Master total %", "Credits", "Samples", ...SONG_CHECKLIST.map((c) => c.name), "Done", "Notes"];
  const rows = [head];
  for (const s of sortedSongs(cat)) {
    const r = releaseOf(cat, s), track = r ? releaseSongs(cat, r).indexOf(s) + 1 : "";
    const p = progressOf(s);
    rows.push([s.title, s.version, s.artist || r?.artist || "", s.featured, normalizeIsrc(s.isrc), normalizeIswc(s.iswc), s.duration, explicitName(s.explicit), s.genre, s.language, s.lyrics === "yes" ? "Yes" : s.lyrics === "no" ? "No (instrumental)" : "",
      r ? releaseTitle(r) : "", r ? typeLabel(r.type) : "", track, r ? normalizeUpc(r.upc) : "", r?.date || "", r?.label || "", s.recorded,
      s.writers.map((w) => `${w.name} ${fmtShare(w.share)}${w.pro ? " " + proName(w.pro) : ""}`).join("; "), s.writers.length ? splitTotal(s.writers) : "",
      s.owners.map((o) => `${o.name} ${fmtShare(o.share)}`).join("; "), s.owners.length ? splitTotal(s.owners) : "",
      s.credits.filter((c) => clean(c.name)).map((c) => `${c.role || "Credit"}: ${c.name}${clean(c.detail) ? " (" + clean(c.detail) + ")" : ""}`).join("; "),
      s.samples.map((x) => `${x.what}${x.owner ? " from " + x.owner : ""} [${(SAMPLE_STATUS.find((y) => y.id === x.status) || SAMPLE_STATUS[0]).label}]`).join("; "),
      ...SONG_CHECKLIST.map((c) => statusName(regOf(s, c.id).status)), `${p.done} of ${p.total}`, s.notes]);
  }
  return toCsv(rows);
}
export function splitsCsv(cat) {
  const rows = [["Song", "Version", "ISRC", "ISWC", "Split", "Name", "Role", "PRO", "IPI", "Publisher", "Publisher IPI", "Share %"]];
  for (const s of sortedSongs(cat)) {
    for (const w of s.writers) rows.push([s.title, s.version, normalizeIsrc(s.isrc), normalizeIswc(s.iswc), "Songwriting", w.name, roleName(w.role), proName(w.pro), normalizeIpi(w.ipi), w.publisher || "Self-published / none", normalizeIpi(w.publisherIpi), toHundredths(w.share) == null ? "" : fromHundredths(toHundredths(w.share))]);
    for (const o of s.owners) rows.push([s.title, s.version, normalizeIsrc(s.isrc), normalizeIswc(s.iswc), "Master", o.name, o.notes, "", "", "", "", toHundredths(o.share) == null ? "" : fromHundredths(toHundredths(o.share))]);
  }
  return toCsv(rows);
}
// releases in date order, then their tracks, then loose songs
export function sortedSongs(cat) {
  const out = [];
  const rels = [...cat.releases].sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999") || a.created - b.created);
  for (const r of rels) out.push(...releaseSongs(cat, r));
  out.push(...cat.songs.filter((s) => !cat.releases.some((r) => r.id === s.releaseId)).sort((a, b) => a.title.localeCompare(b.title)));
  return out;
}

// ---------- copy-ready text for registration forms ----------
export function songDetailsText(cat, song, form = "all") {
  const r = releaseOf(cat, song);
  const L = [];
  const line = (k, v) => { if (clean(v)) L.push(`${k}: ${clean(v)}`); };
  const artist = song.artist || r?.artist || "";
  line("Title", song.title); line("Version", song.version);
  if (form !== "pro" && form !== "mlc") { line("Main artist", artist); line("Featured artist", song.featured); }
  if (form === "pro" || form === "mlc") line("Performed by", [artist, song.featured].filter((x) => clean(x)).join(", feat. "));
  if (form !== "pro") line("ISRC", normalizeIsrc(song.isrc));
  if (form !== "soundexchange" && form !== "distributor") line("ISWC", normalizeIswc(song.iswc));
  if (form === "pro") line("ISRC", normalizeIsrc(song.isrc));
  line("Duration", song.duration);
  if (form === "distributor" || form === "all") { line("Explicit", song.explicit ? explicitName(song.explicit) : "No"); line("Genre", song.genre); line("Language", song.language); }
  if (r && form !== "pro") { line("Release", `${releaseTitle(r)} (${typeLabel(r.type)})`); line("UPC/EAN", normalizeUpc(r.upc)); line("Release date", r.date); line("Label", r.label); }
  if (form !== "soundexchange") {
    if (song.writers.length) {
      L.push("", "Songwriters:");
      for (const w of song.writers) {
        const bits = [`${clean(w.name) || "(name)"}`, roleName(w.role), fmtShare(w.share) || "share?", w.pro ? proName(w.pro) : "", clean(w.ipi) ? "IPI " + normalizeIpi(w.ipi) : ""];
        L.push("  " + bits.filter(Boolean).join(", "));
      }
      const pubs = song.writers.filter((w) => clean(w.publisher));
      if (form !== "distributor") {
        L.push("", "Publishers:");
        if (!pubs.length) L.push("  Self-published / none");
        for (const w of pubs) L.push(`  ${clean(w.publisher)}${clean(w.publisherIpi) ? ", IPI " + normalizeIpi(w.publisherIpi) : ""} (for ${clean(w.name) || "writer"}, ${fmtShare(w.share)})`);
      }
    }
  }
  if ((form === "soundexchange" || form === "all") && song.owners.length) {
    L.push("", "Master owners:");
    for (const o of song.owners) L.push(`  ${clean(o.name) || "(name)"}, ${fmtShare(o.share) || "share?"}`);
  }
  if (form !== "pro" && form !== "mlc") {
    const cr = song.credits.filter((c) => clean(c.name));
    if (cr.length) { L.push("", "Credits:"); for (const c of cr) L.push(`  ${c.role || "Credit"}: ${clean(c.name)}${clean(c.detail) ? " (" + clean(c.detail) + ")" : ""}`); }
  }
  if (form === "all" && song.recorded) line("Recorded", song.recorded);
  return L.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
export const COPY_FORMS = [
  { id: "all", label: "Everything" }, { id: "distributor", label: "For your distributor" }, { id: "pro", label: "For your PRO" },
  { id: "mlc", label: "For The MLC" }, { id: "soundexchange", label: "For SoundExchange" },
];

// ---------- the split sheet (printable) ----------
// Returns HTML for the sheet's body; the page supplies the print styles (class names start with ss-).
export function splitSheetHtml(cat, song, opts = {}) {
  const r = releaseOf(cat, song);
  const st = splitStatus(song.writers, "songwriting split");
  const mst = splitStatus(song.owners, "master split");
  const today = opts.date || "";
  const row = (k, v, m) => (clean(v) ? `<div class="ss-kv"><span>${esc(k)}</span><b${m ? ' class="m"' : ""}>${esc(v)}</b></div>` : "");
  const writers = song.writers.map((w) => `<tr><td><b>${esc(w.name || "")}</b><div class="ss-sub">${esc(roleName(w.role))}</div></td><td>${esc(proName(w.pro))}</td><td class="ss-mono">${esc(normalizeIpi(w.ipi))}</td>
    <td>${esc(w.publisher || "Self-published / none")}${clean(w.publisherIpi) ? `<div class="ss-sub ss-mono">IPI ${esc(normalizeIpi(w.publisherIpi))}</div>` : ""}</td><td class="ss-num">${esc(fmtShare(w.share))}</td></tr>`).join("");
  const owners = song.owners.map((o) => `<tr><td><b>${esc(o.name || "")}</b>${clean(o.notes) ? `<div class="ss-sub">${esc(o.notes)}</div>` : ""}</td><td class="ss-num">${esc(fmtShare(o.share))}</td></tr>`).join("");
  const signers = [...song.writers.map((w) => w.name), ...song.owners.map((o) => o.name)].map(clean).filter(Boolean);
  const uniq = [...new Set(signers)];
  const sigs = (uniq.length ? uniq : ["", ""]).map((n) => `<div class="ss-sig"><div class="ss-line"></div><div class="ss-sigrow"><span>${esc(n || "Name")}</span><span>Signature</span><span>Date</span></div></div>`).join("");
  const credits = song.credits.filter((c) => clean(c.name)).map((c) => `${esc(c.role || "Credit")}: ${esc(c.name)}${clean(c.detail) ? " (" + esc(c.detail) + ")" : ""}`).join(" &middot; ");
  const samples = song.samples.map((p) => `${esc(p.what || "Sample")}${clean(p.owner) ? " from " + esc(p.owner) : ""} (${esc((SAMPLE_STATUS.find((y) => y.id === p.status) || SAMPLE_STATUS[0]).label.toLowerCase())})`).join("; ");
  return `<article class="ss">
  <header class="ss-head"><div><div class="ss-kicker">Split sheet</div><h1>${esc(songTitle(song))}</h1>
    <div class="ss-by">${esc(song.artist || r?.artist || "")}${clean(song.featured) ? " feat. " + esc(song.featured) : ""}</div></div>
    <div class="ss-date">${today ? "Prepared " + esc(today) : ""}</div></header>
  <section class="ss-meta">${row("ISRC (recording code)", normalizeIsrc(song.isrc), 1)}${row("ISWC (song code)", normalizeIswc(song.iswc), 1)}${row("Release", r ? `${releaseTitle(r)} (${typeLabel(r.type)})` : "")}${row("Release date", r?.date)}${row("Duration", song.duration)}${row("Recorded", song.recorded)}</section>
  <h2>Songwriting split <span class="ss-note">(who wrote the song, and their share)</span></h2>
  ${song.writers.length ? `<table class="ss-t"><thead><tr><th>Writer</th><th>PRO</th><th>IPI</th><th>Publisher</th><th class="ss-num">Share</th></tr></thead><tbody>${writers}</tbody>
  <tfoot><tr><td colspan="4">Total</td><td class="ss-num">${esc(fmtShare(st.total))}</td></tr></tfoot></table>` : `<p class="ss-empty">No songwriters listed.</p>`}
  ${song.writers.length && st.state !== "ok" ? `<p class="ss-warn">Check before signing: ${esc(st.message)}</p>` : ""}
  ${song.owners.length ? `<h2>Master split <span class="ss-note">(who owns the recording)</span></h2><table class="ss-t ss-t2"><thead><tr><th>Owner</th><th class="ss-num">Share</th></tr></thead><tbody>${owners}</tbody>
  <tfoot><tr><td>Total</td><td class="ss-num">${esc(fmtShare(mst.total))}</td></tr></tfoot></table>${mst.state !== "ok" ? `<p class="ss-warn">Check before signing: ${esc(mst.message)}</p>` : ""}` : ""}
  ${credits ? `<p class="ss-small"><b>Credits.</b> ${credits}</p>` : ""}
  ${samples ? `<p class="ss-small"><b>Samples and interpolations.</b> ${samples}</p>` : ""}
  <p class="ss-agree">Everyone signing below agrees that the shares above are correct for this song${song.owners.length ? " and recording" : ""}.</p>
  <section class="ss-sigs">${sigs}</section>
  <footer class="ss-foot">Made with ${esc(APP_NAME)}. A record of what was agreed, not legal advice.</footer>
</article>`;
}

// ---------- backup ----------
export function makeBackup(cat, now = new Date()) {
  return { app: APP_NAME, format: BACKUP_FORMAT, version: BACKUP_VERSION, exported: now.toISOString(), releases: cat.releases, songs: cat.songs };
}
// Accepts a backup (any version this tool knows), returns a clean catalog or throws with a plain message.
export function readBackup(input) {
  let o = input;
  if (typeof input === "string") { try { o = JSON.parse(input); } catch { throw new Error("That file isn't a Credits backup (it couldn't be read as a backup file)."); } }
  if (!o || typeof o !== "object" || o.format !== BACKUP_FORMAT) throw new Error("That file isn't a Credits backup.");
  if (typeof o.version !== "number" || o.version > BACKUP_VERSION) throw new Error("This backup was made by a newer version of Credits. Reload the page to update, then try again.");
  return normalizeCatalog({ releases: o.releases, songs: o.songs });
}
// Fill in anything missing so old or hand-edited data can't break the page
export function normalizeCatalog(c) {
  const arr = (a) => (Array.isArray(a) ? a.filter((x) => x && typeof x === "object") : []);
  const str = (o, keys) => { for (const k of keys) o[k] = o[k] == null ? "" : String(o[k]); return o; };
  const regs = (r) => { const out = {}; if (r && typeof r === "object") for (const [k, v] of Object.entries(r)) if (v && typeof v === "object") out[k] = { ...emptyReg(), ...str({ ...v }, ["status", "date", "ref", "notes"]) }; for (const v of Object.values(out)) if (!STATUS.some((s) => s.id === v.status)) v.status = "todo"; return out; };
  const releases = arr(c?.releases).map((r) => { const x = { ...newRelease(), ...r }; str(x, ["id", "title", "artist", "type", "date", "label", "upc", "cover", "notes"]); x.songIds = Array.isArray(x.songIds) ? x.songIds.map(String) : []; x.regs = regs(x.regs); x.created = Number(x.created) || 0; return x; });
  const relIds = new Set(releases.map((r) => r.id));
  const songs = arr(c?.songs).map((s) => {
    const x = { ...newSong(), ...s };
    str(x, ["id", "title", "version", "artist", "featured", "isrc", "iswc", "duration", "explicit", "genre", "language", "lyrics", "releaseId", "recorded", "notes"]);
    if (!relIds.has(x.releaseId)) x.releaseId = "";
    x.writers = arr(x.writers).map((w) => str({ ...newWriter(), ...w }, ["id", "name", "role", "pro", "ipi", "publisher", "publisherIpi"]));
    x.owners = arr(x.owners).map((o) => str({ ...newOwner(), ...o }, ["id", "name", "notes"]));
    x.credits = arr(x.credits).map((o) => str({ ...newCredit(), ...o }, ["id", "role", "name", "detail"]));
    x.samples = arr(x.samples).map((o) => str({ ...newSample(), ...o }, ["id", "what", "owner", "kind", "status", "notes"]));
    x.regs = regs(x.regs); x.created = Number(x.created) || 0;
    return x;
  });
  return { releases, songs };
}
// Add a backup to what's here: same ids are replaced by the backup's copy, new ones are added
export function mergeCatalog(here, incoming) {
  const out = normalizeCatalog(here);
  for (const r of incoming.releases) { const i = out.releases.findIndex((x) => x.id === r.id); if (i >= 0) out.releases[i] = r; else out.releases.push(r); }
  for (const s of incoming.songs) { const i = out.songs.findIndex((x) => x.id === s.id); if (i >= 0) out.songs[i] = s; else out.songs.push(s); }
  return normalizeCatalog(out);
}

// ---------- remembered people ----------
// A name used before brings back its PRO, IPI and publisher, so you type it once.
export function knownWriters(cat) {
  const m = new Map();
  for (const s of [...cat.songs].sort((a, b) => a.created - b.created)) for (const w of s.writers) if (clean(w.name)) m.set(clean(w.name).toLowerCase(), { name: clean(w.name), pro: w.pro, ipi: w.ipi, publisher: w.publisher, publisherIpi: w.publisherIpi, role: w.role });
  return [...m.values()];
}
export function knownNames(cat) {
  const set = new Set();
  for (const s of cat.songs) { for (const x of [...s.writers, ...s.owners, ...s.credits]) if (clean(x.name)) set.add(clean(x.name)); if (clean(s.artist)) set.add(clean(s.artist)); }
  return [...set].sort((a, b) => a.localeCompare(b));
}
