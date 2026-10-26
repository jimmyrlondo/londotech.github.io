// Release-ready files: tagged WAV (16/24-bit) and ID3 tags for MP3, plus
// sensible file names. meta = { artist, title, album, year, genre, track,
// isrc, comment }, art = { bytes: Uint8Array, mime } or null.

const enc = new TextEncoder();

// ---------- file names ----------
export function fileName(meta, ext, suffix = "") {
  const clean = (s) => String(s ?? "").replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").trim();
  const base = [clean(meta.artist), clean(meta.title) || "Untitled"].filter(Boolean).join(" - ");
  return `${base}${suffix ? " " + suffix : ""}.${ext}`;
}

// ---------- ID3v2.3 ----------
function utf16(s) { // BOM + UTF-16LE
  const out = new Uint8Array(2 + s.length * 2);
  out[0] = 0xff; out[1] = 0xfe;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); out[2 + i * 2] = c & 255; out[3 + i * 2] = c >> 8; }
  return out;
}
const concat = (parts) => { const n = parts.reduce((a, p) => a + p.length, 0), out = new Uint8Array(n); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };

function frame(id, body) {
  const h = new Uint8Array(10);
  h.set(enc.encode(id), 0);
  new DataView(h.buffer).setUint32(4, body.length); // v2.3: plain big-endian size
  return concat([h, body]);
}
const textFrame = (id, text) => frame(id, concat([new Uint8Array([1]), utf16(text)]));

export function id3(meta, art) {
  const frames = [];
  const t = (id, v) => { if (v !== undefined && v !== null && String(v).trim() !== "") frames.push(textFrame(id, String(v).trim())); };
  t("TIT2", meta.title); t("TPE1", meta.artist); t("TPE2", meta.artist); t("TALB", meta.album);
  t("TYER", meta.year); t("TCON", meta.genre); t("TRCK", meta.track); t("TSRC", meta.isrc);
  t("TSSE", "Encore Music Studio");
  if (meta.comment) frames.push(frame("COMM", concat([new Uint8Array([1]), enc.encode("eng"), utf16(""), new Uint8Array([0, 0]), utf16(meta.comment)])));
  if (art?.bytes?.length) {
    // APIC: Latin-1 MIME, picture type 3 = front cover, empty description
    frames.push(frame("APIC", concat([new Uint8Array([0]), enc.encode(art.mime || "image/jpeg"), new Uint8Array([0, 3, 0]), art.bytes])));
  }
  const body = concat(frames);
  const size = body.length, h = new Uint8Array(10);
  h.set(enc.encode("ID3"), 0); h[3] = 3; h[4] = 0; h[5] = 0;
  h[6] = (size >> 21) & 127; h[7] = (size >> 14) & 127; h[8] = (size >> 7) & 127; h[9] = size & 127; // syncsafe
  return concat([h, body]);
}

// ---------- WAV ----------
// Triangular dither for 16-bit (masks the rounding as faint noise instead of distortion)
function quantize(x, bits, rng) {
  const max = bits === 16 ? 32767 : 8388607;
  const d = bits === 16 ? (rng() - rng()) : 0;
  return Math.max(-max - 1, Math.min(max, Math.round(x * max + d)));
}

function infoChunk(meta) {
  const items = [["INAM", meta.title], ["IART", meta.artist], ["IPRD", meta.album], ["ICRD", meta.year],
                 ["IGNR", meta.genre], ["ITRK", meta.track], ["ICMT", meta.comment], ["ISFT", "Encore Music Studio"]];
  const parts = [enc.encode("INFO")];
  for (const [id, v] of items) {
    if (v === undefined || v === null || String(v).trim() === "") continue;
    const text = enc.encode(String(v).trim() + "\0");
    const head = new Uint8Array(8); head.set(enc.encode(id), 0); new DataView(head.buffer).setUint32(4, text.length, true);
    parts.push(head, text);
    if (text.length & 1) parts.push(new Uint8Array(1));
  }
  return concat(parts);
}

function chunk(id, body) {
  const head = new Uint8Array(8); head.set(enc.encode(id), 0); new DataView(head.buffer).setUint32(4, body.length, true);
  return body.length & 1 ? [head, body, new Uint8Array(1)] : [head, body];
}

// Interleaved stereo PCM bytes for one block of audio (keep the encoder
// between blocks so the dither carries on seamlessly)
export function pcmEncoder(bits, seed = 22222) {
  const bps = bits / 8;
  const rng = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  return (l, r) => {
    const n = l.length, data = new Uint8Array(n * 2 * bps);
    let o = 0;
    for (let i = 0; i < n; i++) {
      for (const s of [l[i], r[i]]) {
        const v = quantize(s, bits, rng);
        data[o] = v & 255; data[o + 1] = (v >> 8) & 255;
        if (bits === 24) data[o + 2] = (v >> 16) & 255;
        o += bps;
      }
    }
    return data;
  };
}

// A tagged WAV from PCM written in pieces (long recordings never need to be
// one giant array)
export function wavFromParts(dataParts, fs, bits, meta, art) {
  const bps = bits / 8, dataBytes = dataParts.reduce((a, p) => a + p.length, 0);
  const fmt = new Uint8Array(16), fv = new DataView(fmt.buffer);
  fv.setUint16(0, 1, true); fv.setUint16(2, 2, true); fv.setUint32(4, fs, true);
  fv.setUint32(8, fs * 2 * bps, true); fv.setUint16(12, 2 * bps, true); fv.setUint16(14, bits, true);
  const dataHead = new Uint8Array(8); dataHead.set(enc.encode("data"), 0); new DataView(dataHead.buffer).setUint32(4, dataBytes, true);
  // tags go AFTER the audio: Windows Explorer only reads LIST/INFO there
  // (checked against the Windows property system); the id3 chunk is for
  // music apps and carries the cover art
  const tail = concat([...(dataBytes & 1 ? [new Uint8Array(1)] : []), ...chunk("LIST", infoChunk(meta)), ...chunk("id3 ", id3(meta, art))]);
  const fmtC = concat(chunk("fmt ", fmt));
  const riffSize = 4 + fmtC.length + 8 + dataBytes + tail.length;
  const head = new Uint8Array(12); head.set(enc.encode("RIFF"), 0); new DataView(head.buffer).setUint32(4, riffSize, true); head.set(enc.encode("WAVE"), 8);
  return new Blob([head, fmtC, dataHead, ...dataParts, tail], { type: "audio/wav" });
}

export function wavFile(l, r, fs, bits, meta, art) {
  return wavFromParts([pcmEncoder(bits)(l, r)], fs, bits, meta, art);
}
