// ENCORE. Convert: Ogg Vorbis out, from libvorbis + libogg compiled to
// vorbis.wasm (build-vorbis.ps1, BSD licenses in vendor/). VBR quality mode.
//   const v = await loadVorbis(bytes)
//   v.encode(chans, rate, { quality, meta, art, onProgress }) -> Uint8Array (.ogg)
// quality is Vorbis's own 0..10 scale (5 is about 160 kbps for stereo music).
import { instantiate } from "./master-core.js";
import { vorbisComment, pictureBlock } from "./convert-flac.js";
import { concat } from "./convert-core.js";

/** The Vorbis comment header: tags and cover the same way the Opus files carry them */
export function vorbisCommentPacket(meta = {}, art = null) {
  const extra = [];
  if (art?.bytes?.length) {
    const pic = pictureBlock(art);
    let s = ""; for (let i = 0; i < pic.length; i += 0x8000) s += String.fromCharCode(...pic.subarray(i, i + 0x8000));
    extra.push("METADATA_BLOCK_PICTURE=" + btoa(s));
  }
  return concat([Uint8Array.of(3, 0x76, 0x6f, 0x72, 0x62, 0x69, 0x73), vorbisComment({ ...meta, extraComments: extra }, "ENCORE. Studio"), Uint8Array.of(1)]);
}

export async function loadVorbis(wasm) {
  const x = await instantiate(wasm);
  const take = (h, parts) => {
    const n = Number(x.ve_out_len(h));
    if (n) { parts.push(new Uint8Array(x.memory.buffer, x.ve_out(h), n).slice()); x.ve_out_clear(h); }
  };
  return {
    encode(chans, rate, { quality = 5, meta = {}, art = null, onProgress } = {}) {
      const ch = chans.length, n = chans[0].length;
      if (ch < 1 || ch > 255) throw new Error("Vorbis holds 1 to 255 channels.");
      const comment = vorbisCommentPacket(meta, art), cp = x.malloc(comment.length);
      new Uint8Array(x.memory.buffer, cp, comment.length).set(comment);
      const h = x.ve_create(ch, rate, Math.max(-0.1, Math.min(1, quality / 10)), cp, comment.length);
      x.free(cp);
      if (!h) throw new Error(`Vorbis can't encode ${ch} channels at ${rate / 1000} kHz.`);
      const parts = [], block = 8192;
      try {
        take(h, parts);
        for (let s = 0; s < n; s += block) {
          const len = Math.min(block, n - s), pp = x.ve_buffer(h, len);
          // the buffer can move memory, so read the channel pointers after it
          const ptrs = new Uint32Array(x.memory.buffer, pp, ch);
          for (let c = 0; c < ch; c++) new Float32Array(x.memory.buffer, ptrs[c], len).set(chans[c].subarray(s, s + len));
          x.ve_wrote(h, len);
          take(h, parts);
          if (onProgress && (s / block) % 8 === 0) onProgress((s + len) / n);
        }
        x.ve_wrote(h, 0);
        take(h, parts);
      } finally { x.ve_destroy(h); }
      onProgress?.(1);
      return concat(parts);
    },
  };
}
