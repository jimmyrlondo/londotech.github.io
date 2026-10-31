// Encore Tag: small byte helpers shared by the tag readers and writers.
// Plain functions on Uint8Arrays; nothing here knows about any one format.

export const enc8 = new TextEncoder();
const dec8 = new TextDecoder("utf-8");
const dec8strict = new TextDecoder("utf-8", { fatal: true });

export const str = (u8, o, n) => { let s = ""; for (let i = 0; i < n && o + i < u8.length; i++) s += String.fromCharCode(u8[o + i]); return s; };
export const be16 = (u8, o) => (u8[o] << 8) | u8[o + 1];
export const be32 = (u8, o) => ((u8[o] << 24) | (u8[o + 1] << 16) | (u8[o + 2] << 8) | u8[o + 3]) >>> 0;
export const le16 = (u8, o) => u8[o] | (u8[o + 1] << 8);
export const le32 = (u8, o) => (u8[o] | (u8[o + 1] << 8) | (u8[o + 2] << 16) | (u8[o + 3] << 24)) >>> 0;
export const be64 = (u8, o) => be32(u8, o) * 4294967296 + be32(u8, o + 4);
export const syncsafe = (u8, o) => ((u8[o] & 127) << 21) | ((u8[o + 1] & 127) << 14) | ((u8[o + 2] & 127) << 7) | (u8[o + 3] & 127);

export function concat(parts) {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
export const u32be = (v) => new Uint8Array([(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]);
export const u32le = (v) => new Uint8Array([v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]);
export const u16be = (v) => new Uint8Array([(v >> 8) & 255, v & 255]);
export const syncsafeBytes = (v) => new Uint8Array([(v >> 21) & 127, (v >> 14) & 127, (v >> 7) & 127, v & 127]);

// Text. Latin-1 is one byte per character; anything outside it becomes "?"
export const latin1 = (b) => { let s = ""; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return s; };
export const latin1Bytes = (s) => Uint8Array.from(String(s), (c) => { const x = c.charCodeAt(0); return x < 256 ? x : 63; });
export const isLatin1 = (s) => /^[\x00-\xff]*$/.test(s);
export const utf8 = (b) => dec8.decode(b);
export const utf8Bytes = (s) => enc8.encode(String(s));
// UTF-8 if it is valid UTF-8, else Latin-1 (old RIFF INFO and AIFF text)
export function utf8OrLatin1(b) { try { return dec8strict.decode(b); } catch { return latin1(b); } }
export function utf16(b, bigEndian = false) {
  let s = "", i = 0;
  if (b.length >= 2 && ((b[0] === 0xff && b[1] === 0xfe) || (b[0] === 0xfe && b[1] === 0xff))) { bigEndian = b[0] === 0xfe; i = 2; }
  for (; i + 1 < b.length; i += 2) s += String.fromCharCode(bigEndian ? (b[i] << 8) | b[i + 1] : b[i] | (b[i + 1] << 8));
  return s;
}
export function utf16Bytes(s, bom = true) { // little-endian, with a BOM
  const out = new Uint8Array((bom ? 2 : 0) + s.length * 2);
  let o = 0;
  if (bom) { out[0] = 0xff; out[1] = 0xfe; o = 2; }
  for (let i = 0; i < s.length; i++, o += 2) { const c = s.charCodeAt(i); out[o] = c & 255; out[o + 1] = c >> 8; }
  return out;
}

export function equalBytes(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// base64 without btoa's string-size limits (Ogg pictures can be megabytes)
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
export function toBase64(u8) {
  let s = "";
  for (let i = 0; i < u8.length; i += 3) {
    const a = u8[i], b = u8[i + 1], c = u8[i + 2], n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    s += B64[n >> 18] + B64[(n >> 12) & 63] + (b === undefined ? "=" : B64[(n >> 6) & 63]) + (c === undefined ? "=" : B64[n & 63]);
  }
  return s;
}
const B64IDX = new Int16Array(128).fill(-1);
for (let i = 0; i < 64; i++) B64IDX[B64.charCodeAt(i)] = i;
export function fromBase64(s) {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, "");
  const out = new Uint8Array(Math.floor(clean.length * 3 / 4));
  let o = 0, acc = 0, bits = 0;
  for (let i = 0; i < clean.length; i++) {
    acc = (acc << 6) | B64IDX[clean.charCodeAt(i)]; bits += 6;
    if (bits >= 8) { bits -= 8; out[o++] = (acc >> bits) & 255; }
  }
  return out.subarray(0, o);
}

// The image's kind from its first bytes (what a tag should say it is)
export function sniffMime(b) {
  if (b[0] === 0xff && b[1] === 0xd8) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (str(b, 0, 4) === "GIF8") return "image/gif";
  if (str(b, 0, 2) === "BM") return "image/bmp";
  if (str(b, 0, 4) === "RIFF" && str(b, 8, 4) === "WEBP") return "image/webp";
  return "";
}
