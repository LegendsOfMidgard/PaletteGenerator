// Minimal RO .spr parser — indexed (palette) frames only.
// RO body sprites are 8bpp indexed: every pixel is an index into a 256-colour
// palette. That is exactly the palette this tool edits, so we decode the index
// grid once and recolour it by looking each index up in the *edited* palette.
//
// Layout (little-endian):
//   "SP" | u16 version | u16 indexedFrameCount | u16 rgbaFrameCount (if v>=0x200)
//   per indexed frame: u16 w, u16 h, [v>=0x201: u16 size + RLE bytes | else w*h raw]
//   per rgba frame   : u16 w, u16 h, w*h*4 bytes              (skipped here)
//   trailing 1024 bytes = 256 * RGBA embedded palette
//
// RLE (v2.1): copy bytes verbatim; a 0x00 byte is followed by a run-length of
// that many zero (transparent) indices.

export function parseSpr(buf) {
  const dv = new DataView(buf);
  const u8 = new Uint8Array(buf);
  if (u8[0] !== 0x53 || u8[1] !== 0x50) throw new Error("not a .spr (bad magic)");
  const version = dv.getUint16(2, true);
  let off = 4;
  const indexedCount = dv.getUint16(off, true); off += 2;
  if (version >= 0x200) off += 2; // rgbaFrameCount — not needed

  const frames = [];
  for (let f = 0; f < indexedCount; f++) {
    const w = dv.getUint16(off, true); off += 2;
    const h = dv.getUint16(off, true); off += 2;
    const data = new Uint8Array(w * h);
    if (version >= 0x201) {
      const size = dv.getUint16(off, true); off += 2;
      const end = off + size;
      let p = 0;
      while (off < end && p < data.length) {
        const c = u8[off++];
        if (c === 0x00) {
          let run = u8[off++];
          while (run-- > 0 && p < data.length) data[p++] = 0;
        } else {
          data[p++] = c;
        }
      }
    } else {
      data.set(u8.subarray(off, off + w * h));
      off += w * h;
    }
    frames.push({ w, h, data });
  }

  // Embedded palette = last 1024 bytes (256 * RGBA). Index 0 = transparent.
  const palOff = buf.byteLength - 1024;
  const palette = [];
  for (let i = 0; i < 256; i++) {
    palette.push([u8[palOff + i * 4], u8[palOff + i * 4 + 1], u8[palOff + i * 4 + 2]]);
  }
  return { version, frames, palette };
}
