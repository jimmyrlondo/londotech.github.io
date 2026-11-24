// ENCORE. Compose: real instrument sounds. Recorded samples (MuseScore General's
// General MIDI set, plus VSCO 2 Community Edition's orchestral strings, winds and
// brass) played note by note, with the same play(ctx, dest, note) -> handle
// shape as the synth voices in compose-io.js, so playback, Stop, loops and
// offline rendering all work the same way.
//
// Each instrument is a manifest (sounds/<set>/<id>.json: zones, samples, loops,
// envelopes) plus chunk files of Ogg Vorbis samples grouped by pitch, built by
// web/tools/build-sounds.mjs. Only the chunks for the notes a score plays are
// fetched; they're kept in the Cache API, so the second time is instant. While
// a sample is still on its way the synth plays that note, so nothing is silent.
// If this browser can't decode Ogg Vorbis (older Safari), everything stays on
// the synth.

/** Who made the sounds, for a credits block */
export const CREDITS = [
  { name: "MuseScore General SoundFont", by: "S. Christian Collins, from FluidR3 by Frank Wen and FluidR3Mono by Michael Cowgill; Temple Blocks by Ethan Winer; Drumline Cymbals by Michael Schorsch", license: "MIT", url: "https://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General/",
    note: "Grand piano: \"Splendid Grand\" samples by AKAI (public domain), edited by S. Christian Collins." },
  { name: "VSCO 2 Community Edition", by: "Sam Gossner and Simon Dalzell (Versilian Studios), sample cutting by Elan Hickler (Soundemote)", license: "CC0 1.0", url: "https://github.com/sgossner/VSCO-2-CE",
    note: "Orchestral strings, woodwinds, brass and harp." },
];
/** The credits as plain text (for an About box or a tooltip) */
export const creditsText = () => CREDITS.map((c) => `${c.name} by ${c.by} (${c.license}). ${c.note}`).join("\n");

const BASE = (() => { try { return new URL("./sounds/", import.meta.url).href; } catch { return "./sounds/"; } })();
const CACHE = "encore-sounds-v1";

// ---------- which recording plays each of Compose's instruments ----------
// main: the sound; pizz / muted / harmonic: the techniques that switch to another recording; alt: if main can't load
const G = (b, p) => `gm:${b}:${p}`, V = (id) => `vsco:${id}`;
const PICKS = [
  [/harpsichord/i, { main: G(0, 6) }],
  [/piano|keys|chromatic/i, { main: G(0, 0) }],
  [/organ/i, { main: G(0, 19) }],
  [/harp\b/i, { main: V("harp"), alt: G(0, 46) }],
  [/choir/i, { main: G(0, 52) }],
  [/voice|vocal/i, { main: G(0, 53) }],
  [/viola da gamba|gamba/i, { main: V("cello"), pizz: V("cello-pizz"), alt: G(0, 42) }],
  [/violin|fiddle|nyckelharpa/i, { main: V("violin"), pizz: V("violin-pizz"), alt: G(0, 40) }],
  [/viola/i, { main: V("viola"), pizz: G(0, 45), alt: G(0, 41) }],
  [/(?<!mando)cello/i, { main: V("cello"), pizz: V("cello-pizz"), alt: G(0, 42) }],
  // an upright in Tune's list is mostly played plucked (jazz, folk, bluegrass); pizz. and arco both still work
  [/upright|double bass|contrabass/i, { main: V("contrabass-pizz"), arco: V("contrabass"), pizz: V("contrabass-pizz"), alt: G(0, 32) }],
  [/erhu|hurdy/i, { main: G(0, 110) }],
  [/acoustic bass|guitarron|bass ukulele/i, { main: G(0, 32) }],
  [/bass clarinet/i, { main: G(0, 71) }],
  [/banjo|banjolele/i, { main: G(0, 105) }],
  [/ukulele|\buke\b|guitalele|charango|cavaquinho/i, { main: G(8, 24), alt: G(0, 24) }],
  [/mandol|mandocello|bouzouki|balalaika|domra|bandurria|laud/i, { main: G(16, 25), alt: G(0, 25) }],
  [/nylon|classical|requinto|vihuela|\blute|baroque guitar|\boud\b|\bpipa\b|zhongruan|\btres\b|cuatro|\btiple\b/i, { main: G(0, 24), muted: G(0, 28), harmonic: G(0, 31) }],
  [/dulcimer|kantele/i, { main: G(0, 15) }],
  [/shamisen/i, { main: G(0, 106) }],
  [/koto/i, { main: G(0, 107) }],
  [/kalimba/i, { main: G(0, 108) }],
  [/guitar|dobro|steel|bajo/i, { main: G(0, 25), muted: G(0, 28), harmonic: G(0, 31) }],
  [/\bbass\b/i, { main: G(0, 33) }],
  [/piccolo/i, { main: V("piccolo"), alt: G(0, 72) }],
  [/flute/i, { main: V("flute"), alt: G(0, 73) }],
  [/english horn/i, { main: G(0, 69) }],
  [/oboe/i, { main: V("oboe"), alt: G(0, 68) }],
  [/clarinet/i, { main: V("clarinet"), alt: G(0, 71) }],
  [/bassoon/i, { main: V("bassoon"), alt: G(0, 70) }],
  [/soprano sax/i, { main: G(0, 64) }], [/alto sax/i, { main: G(0, 65) }], [/tenor sax/i, { main: G(0, 66) }], [/baritone sax/i, { main: G(0, 67) }], [/sax/i, { main: G(0, 65) }],
  [/trumpet|cornet|flugel/i, { main: V("trumpet"), alt: G(0, 56) }],
  [/trombone|euphonium|baritone horn/i, { main: V("trombone"), alt: G(0, 57) }],
  [/horn|mellophone/i, { main: V("horn"), alt: G(0, 60) }],
  [/tuba/i, { main: V("tuba"), alt: G(0, 58) }],
  [/marimba/i, { main: G(0, 12) }], [/xylophone/i, { main: G(0, 13) }], [/vibra/i, { main: G(0, 11) }], [/glock/i, { main: G(0, 9) }], [/timpani/i, { main: G(0, 47) }],
  [/drum|kit/i, { main: G(128, 0) }],
];
// strings that aren't otherwise named get the GM pizzicato section for pizz.
const SECTION_PIZZ = G(0, 45);
/** Which recordings an instrument name uses: { main, pizz?, muted?, harmonic?, arco?, alt? } */
export function pickFor(name = "") {
  const hit = PICKS.find(([re]) => re.test(name));
  return hit ? hit[1] : { main: G(0, 0) };
}
/** "gm:0:40" | "vsco:violin" -> the manifest's URL path inside sounds/ */
export const manifestPath = (ref) => { const [set, a, b] = ref.split(":"); return set === "gm" ? `gm/${a}-${b}.json` : `vsco/${a}.json`; };

// ---------- choosing the samples for a note (pure, so node tests it) ----------
/** The zones that sound for a note: key and velocity inside the range; nearest velocity layer if none matches */
export function zonesFor(manifest, midi, vel) {
  const v = Math.max(1, Math.min(127, Math.round(vel)));
  const byKey = manifest.zones.filter((z) => midi >= z.lo && midi <= z.hi);
  let hit = byKey.filter((z) => v >= z.vlo && v <= z.vhi);
  if (!hit.length && byKey.length) {
    const d = (z) => (v < z.vlo ? z.vlo - v : v - z.vhi), best = Math.min(...byKey.map(d));
    hit = byKey.filter((z) => d(z) === best);
  }
  if (!hit.length) {
    // outside every zone: the nearest one by key, so a note out of the recorded range still sounds
    const d = (z) => (midi < z.lo ? z.lo - midi : midi - z.hi), best = Math.min(...manifest.zones.map(d));
    hit = manifest.zones.filter((z) => d(z) === best && v >= z.vlo && v <= z.vhi);
    if (!hit.length) hit = manifest.zones.filter((z) => d(z) === best).slice(0, 1);
  }
  return hit;
}
/** Playback rate for a zone and note (pitch only; the buffer's own sample rate is handled by Web Audio) */
export const rateFor = (z, midi) => 2 ** ((((midi - z.root) * z.scale) + z.tune) / 1200);
/** The chunk files a set of notes needs: [chunk index] */
export function chunksFor(manifest, notes) {
  const need = new Set();
  for (const n of notes) for (const z of zonesFor(manifest, n.midi, n.vel ?? 90)) need.add(manifest.samples[z.s].c);
  return [...need].sort((a, b) => a - b);
}
/** Check a manifest is one this player understands */
export function validManifest(m) {
  return !!m && m.v === 1 && Array.isArray(m.zones) && Array.isArray(m.samples) && Array.isArray(m.chunks) && m.zones.length > 0
    && m.zones.every((z) => z.s >= 0 && z.s < m.samples.length && z.lo <= z.hi && z.vlo <= z.vhi && z.env)
    && m.samples.every((s) => s.c >= 0 && s.c < m.chunks.length && s.n > 0);
}

// ---------- loading ----------
let oggOK = null; // null: not tried yet; false: this browser can't decode the samples
const banks = new Map(); // ref -> Bank
let fetched = 0; // bytes over the network (for tests and the status line)
export const bytesFetched = () => fetched;
export const samplesSupported = () => oggOK !== false;

async function getBytes(url) {
  let cache = null;
  try { cache = typeof caches !== "undefined" ? await caches.open(CACHE) : null; } catch { cache = null; }
  if (cache) { try { const hit = await cache.match(url); if (hit) return new Uint8Array(await hit.arrayBuffer()); } catch {} }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  fetched += buf.length;
  if (cache) try { await cache.put(url, new Response(buf.slice(), { headers: { "Content-Type": "application/octet-stream" } })); } catch {}
  return buf;
}
// decode at the sample's own rate, so loop points stay exact (Web Audio resamples when it plays)
const decoders = new Map();
function decoderAt(rate) {
  if (!decoders.has(rate)) decoders.set(rate, new OfflineAudioContext(1, 1, rate));
  return decoders.get(rate);
}
async function decode(bytes, rate) {
  const c = decoderAt(rate);
  return await new Promise((ok, bad) => { const p = c.decodeAudioData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), ok, bad); if (p?.then) p.then(ok, bad); });
}

class Bank {
  constructor(ref) { this.ref = ref; this.manifest = null; this.failed = false; this.buffers = new Map(); this.chunkLoads = new Map(); this.ready = this.load(); }
  async load() {
    try {
      const r = await fetch(BASE + manifestPath(this.ref));
      if (!r.ok) throw new Error(r.status);
      const m = await r.json();
      if (!validManifest(m)) throw new Error("bad manifest");
      this.manifest = m;
    } catch { this.failed = true; }
    return this;
  }
  /** Fetch and decode the chunks these notes need */
  async prepare(notes) {
    await this.ready;
    if (this.failed || oggOK === false) return this;
    const m = this.manifest;
    await Promise.all(chunksFor(m, notes).map((c) => this.chunk(c)));
    return this;
  }
  chunk(c) {
    if (!this.chunkLoads.has(c)) {
      this.chunkLoads.set(c, (async () => {
        const m = this.manifest, url = BASE + this.ref.split(":")[0] + "/" + m.chunks[c].file;
        let bytes;
        try { bytes = await getBytes(url); } catch { this.chunkLoads.delete(c); return; } // offline: try again next time
        await Promise.all(m.samples.map((s, i) => [s, i]).filter(([s]) => s.c === c).map(async ([s, i]) => {
          try {
            const buf = await decode(bytes.subarray(s.o, s.o + s.n), s.rate);
            this.buffers.set(i, buf); if (oggOK === null) oggOK = true;
          } catch { if (oggOK === null) oggOK = false; }
        }));
      })());
    }
    return this.chunkLoads.get(c);
  }
}
function bank(ref) {
  if (!banks.has(ref)) banks.set(ref, new Bank(ref));
  return banks.get(ref);
}

// ---------- playing ----------
const velCurve = (v) => Math.pow(Math.max(1, Math.min(127, v)) / 127, 1.7);
// SF2 envelope times are to -100 dB; as an exponential that's a time constant of t / ln(10^5)
const TAU = (t) => Math.max(0.004, t / 11.5);
const OUT = 0.62; // the samples' level next to the synth voices and the click
// each recording's trim (dB), measured so it plays as loud as the synth voice it replaces (mixes keep their balance)
const TRIM = { "gm:0:0": 13.5, "gm:0:19": 6.7, "vsco:harp": -0.2, "gm:0:53": 8.1, "gm:0:52": 6, "gm:0:24": 1.7, "gm:0:25": 6.9, "gm:0:33": 3.2, "vsco:contrabass-pizz": -0.4,
  "gm:8:24": 0, "gm:16:25": 1.1, "gm:0:105": 1, "vsco:violin": 1.2, "vsco:viola": -0.9, "vsco:cello": -3.7, "vsco:flute": 12, "gm:0:69": -1.2, "gm:0:110": -0.9, "vsco:piccolo": 5.9, "vsco:oboe": 1.9,
  "vsco:clarinet": 6.4, "vsco:bassoon": 0.7, "gm:0:65": 1.8, "vsco:trumpet": 3.4, "vsco:horn": 2.7, "vsco:trombone": 9, "vsco:tuba": 6.9, "gm:0:108": 3 };
const trimFor = (ref) => 10 ** ((TRIM[ref] ?? (ref.startsWith("gm:") ? 4 : 0)) / 20);

/** Play one zone of a note; returns { src, g, end } or null */
function playZone(c, dest, z, buf, s, n, at, gainAll) {
  const src = c.createBufferSource(); src.buffer = buf;
  const rate = rateFor(z, n.midi);
  src.playbackRate.setValueAtTime(rate, at);
  if (n.bend && n.dur) { const to = rateFor(z, n.bend.to); src.playbackRate.setValueAtTime(rate, at + n.dur * (n.bend.at ?? 0.35)); src.playbackRate.exponentialRampToValueAtTime(to, at + n.dur); }
  const ls = (s.ls ?? -1) + (z.ls || 0), le = (s.le ?? -1) + (z.le || 0);
  if ((z.mode === 1 || z.mode === 3) && ls >= 0 && le > ls + 8) { src.loop = true; src.loopStart = ls / s.rate; src.loopEnd = le / s.rate; }
  const v = n.vel ?? 90;
  // the default SoundFont velocity-to-brightness: softer is darker; techniques shade it further
  let fc = z.fc || 20000;
  fc *= 2 ** (-2400 * (1 - v / 127) / 1200 * (z.fc ? 1 : 0.5));
  if (n.sound === "dark") fc *= 0.5; if (n.sound === "bright") fc = Math.min(20000, fc * 1.8); if (n.muted) fc *= 0.4;
  let node = src;
  if (fc < 16000) { const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = Math.max(80, fc); lp.Q.value = z.q || 0.0001; node.connect(lp); node = lp; }
  const g = c.createGain();
  node.connect(g);
  if (z.pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = z.pan; g.connect(p); p.connect(dest); } else g.connect(dest);
  const e = z.env, peak = gainAll * z.gain, t0 = at + e.delay;
  const attack = n.legato ? Math.max(e.attack, 0.03) : e.attack;
  g.gain.setValueAtTime(n.legato ? peak * 0.3 : attack > 0.001 ? 0 : peak, at);
  if (attack > 0.001) g.gain.linearRampToValueAtTime(peak, t0 + attack); else g.gain.setValueAtTime(peak, t0);
  const held = t0 + attack + e.hold;
  if (e.decay > 0 && e.sustain < 0.999) g.gain.setTargetAtTime(peak * e.sustain, held, TAU(e.decay));
  // a held note under a hairpin swells or fades to where it goes
  else if (n.velEnd && n.dur > 0.3 && Math.abs(n.velEnd - v) > 3) g.gain.linearRampToValueAtTime(peak * velCurve(n.velEnd) / velCurve(v), at + n.dur);
  src.start(at);
  return { src, g, rel: Math.max(0.03, e.release) };
}

/**
 * A sampled instrument for an instrument name. play(c, dest, note) like synthVoice; prepare(notes) loads
 * what those notes need (resolves when ready, or right away if they can't load); fallback is the synth voice
 * that plays any note whose sample isn't here yet.
 */
export function sampledInstrument(name, fallback) {
  const pick = pickFor(name);
  const refFor = (n) => (n.sound === "pizz" ? pick.pizz || (/violin|viola|cello|bass|fiddle|gamba/i.test(name) ? SECTION_PIZZ : pick.main)
    : n.muted && pick.muted ? pick.muted : n.sound === "harmonic" && pick.harmonic ? pick.harmonic : pick.main);
  // a recording that won't load falls back to its General MIDI twin
  const live = (ref) => { const b = bank(ref); return b.failed && pick.alt && ref === pick.main ? bank(pick.alt) : b; };
  const excl = new Map(); // exclusive class (open/closed hi-hat): the last handle
  return {
    family: fallback.family, name, sampled: true, pick,
    async prepare(notes = [{ midi: 60, vel: 90 }]) {
      const groups = new Map();
      for (const n of notes) { const r = refFor(n); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(n); }
      await Promise.all([...groups].map(async ([r, list]) => { const b = bank(r); await b.ready; await live(r).prepare(list); }));
      return this;
    },
    /** true when every note listed would play from samples now */
    readyFor(notes) { return notes.every((n) => { const b = live(refFor(n)); return b.manifest && zonesFor(b.manifest, n.midi, n.vel ?? 90).every((z) => b.buffers.has(z.s)); }); },
    play(c, dest, n) {
      const b = live(refFor(n)), m = b.manifest;
      const zs = m && oggOK !== false ? zonesFor(m, n.midi, n.vel ?? 90) : [];
      if (!zs.length || !zs.every((z) => b.buffers.has(z.s))) {
        // not here yet: the synth plays this one, and the samples come for the next
        if (m && oggOK !== false && !b.failed) b.prepare([n]); else if (!m && !b.failed) b.ready.then(() => b.prepare([n]));
        return fallback.play(c, dest, n);
      }
      const at = Math.max(c.currentTime, n.time ?? c.currentTime), v = n.vel ?? 90;
      const all = OUT * trimFor(b.ref) * (m.gain ?? 1) * velCurve(v) * (n.gain ?? 1) * (n.muted ? 0.75 : 1);
      const parts = zs.map((z) => playZone(c, dest, z, b.buffers.get(z.s), m.samples[z.s], n, at, all));
      const h = {
        at, g: null, oscs: parts.map((p) => p.src), rel: Math.max(...parts.map((p) => p.rel)), parts,
        stop(t) {
          const when = Math.max(t ?? c.currentTime, at + 0.02);
          for (const p of parts) { try { p.g.gain.cancelScheduledValues(when + 1e-4); p.g.gain.setTargetAtTime(0, when, TAU(p.rel)); p.src.stop(when + p.rel + 0.1); } catch {} }
        },
      };
      // a gain the mixer's Stop can grab (it fades h.g): one per note, ahead of the zones
      h.g = { gain: multiParam(parts.map((p) => p.g.gain)) };
      const ex = zs.find((z) => z.excl)?.excl;
      if (ex) { excl.get(ex)?.stop(at); excl.set(ex, h); }
      if (n.dur) h.stop(at + n.dur);
      return h;
    },
  };
}
// one AudioParam-like front for several (so Stop can fade every zone of a note at once)
function multiParam(list) {
  return {
    get value() { return list[0]?.value ?? 0; },
    set value(x) { for (const p of list) p.value = x; },
    cancelScheduledValues(t) { for (const p of list) p.cancelScheduledValues(t); return this; },
    setValueAtTime(v, t) { list.forEach((p) => p.setValueAtTime(v === 0 ? 0 : p.value, t)); return this; },
    setTargetAtTime(v, t, k) { for (const p of list) p.setTargetAtTime(v, t, k); return this; },
    linearRampToValueAtTime(v, t) { for (const p of list) p.linearRampToValueAtTime(v, t); return this; },
  };
}
/** Forget what's loaded (tests) */
export function resetSamples() { banks.clear(); oggOK = null; fetched = 0; }
