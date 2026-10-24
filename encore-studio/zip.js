// Minimal "store" zip writer (no compression: audio doesn't compress anyway).
// zip([{ name, blob }]) -> Blob. Plain ES module, works in pages and workers.
// Uses ZIP64 automatically when the archive passes 4 GB (long shows in WAV).

const enc = new TextEncoder();
let table = null;
function crcTable() {
  table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
  return table;
}
export async function crc32(blob) {
  const t = table ?? crcTable();
  let c = 0xffffffff;
  const step = 1 << 24;
  for (let o = 0; o < blob.size; o += step) {
    const b = new Uint8Array(await blob.slice(o, o + step).arrayBuffer());
    for (let i = 0; i < b.length; i++) c = t[(c ^ b[i]) & 255] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

export async function zip(entries, onProgress) {
  const parts = [], central = [];
  let offset = 0, i = 0;
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  for (const { name, blob } of entries) {
    const nameBytes = enc.encode(name), crc = await crc32(blob), size = blob.size;
    const big = size >= 0xffffffff || offset >= 0xffffffff;
    // local header (sizes go in a ZIP64 extra field when big)
    const extra = big ? new Uint8Array(20) : new Uint8Array(0);
    if (big) { const ev = new DataView(extra.buffer); ev.setUint16(0, 1, true); ev.setUint16(2, 16, true); ev.setBigUint64(4, BigInt(size), true); ev.setBigUint64(12, BigInt(size), true); }
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, big ? 45 : 20, true); lh.setUint16(6, 0x0800, true); // UTF-8 names
    lh.setUint16(8, 0, true); lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, big ? 0xffffffff : size, true); lh.setUint32(22, big ? 0xffffffff : size, true);
    lh.setUint16(26, nameBytes.length, true); lh.setUint16(28, extra.length, true);
    parts.push(lh.buffer, nameBytes, extra, blob);
    // central directory entry
    const cextra = big ? new Uint8Array(28) : new Uint8Array(0);
    if (big) { const ev = new DataView(cextra.buffer); ev.setUint16(0, 1, true); ev.setUint16(2, 24, true); ev.setBigUint64(4, BigInt(size), true); ev.setBigUint64(12, BigInt(size), true); ev.setBigUint64(20, BigInt(offset), true); }
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, big ? 45 : 20, true); ch.setUint16(6, big ? 45 : 20, true); ch.setUint16(8, 0x0800, true);
    ch.setUint16(10, 0, true); ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, big ? 0xffffffff : size, true); ch.setUint32(24, big ? 0xffffffff : size, true);
    ch.setUint16(28, nameBytes.length, true); ch.setUint16(30, cextra.length, true);
    ch.setUint32(42, big ? 0xffffffff : offset, true);
    central.push(ch.buffer, nameBytes, cextra);
    offset += 30 + nameBytes.length + extra.length + size;
    onProgress?.(++i / entries.length);
  }
  const cdSize = central.reduce((a, p) => a + (p.byteLength ?? p.length), 0), cdOff = offset, n = entries.length;
  const tail = [];
  if (cdOff >= 0xffffffff) {
    const z = new DataView(new ArrayBuffer(56));
    z.setUint32(0, 0x06064b50, true); z.setBigUint64(4, 44n, true); z.setUint16(12, 45, true); z.setUint16(14, 45, true);
    z.setBigUint64(24, BigInt(n), true); z.setBigUint64(32, BigInt(n), true); z.setBigUint64(40, BigInt(cdSize), true); z.setBigUint64(48, BigInt(cdOff), true);
    const loc = new DataView(new ArrayBuffer(20));
    loc.setUint32(0, 0x07064b50, true); loc.setBigUint64(8, BigInt(cdOff + cdSize), true); loc.setUint32(16, 1, true);
    tail.push(z.buffer, loc.buffer);
  }
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, n, true); end.setUint16(10, n, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, cdOff >= 0xffffffff ? 0xffffffff : cdOff, true);
  tail.push(end.buffer);
  return new Blob([...parts, ...central, ...tail], { type: "application/zip" });
}
