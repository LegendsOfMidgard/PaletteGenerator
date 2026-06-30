// RO palette (.pal) read/write.
// A .pal is exactly 1024 bytes = 256 entries x 4 bytes (R,G,B,A). The alpha byte is
// unused by the client (kept 0). Index 0 is conventionally the transparent slot.
// Palette swap = remap sprite indices through these 256 colours.

export const PAL_SIZE = 1024;
export const PAL_COLORS = 256;

// ArrayBuffer|Uint8Array -> [[r,g,b], ... x256]
export function readPal(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (u8.length < PAL_SIZE) {
    throw new Error(`bad .pal: ${u8.length} bytes (need ${PAL_SIZE})`);
  }
  const out = new Array(PAL_COLORS);
  for (let i = 0; i < PAL_COLORS; i++) {
    const o = i * 4;
    out[i] = [u8[o], u8[o + 1], u8[o + 2]];
  }
  return out;
}

// [[r,g,b], ... x256] -> Uint8Array(1024). Alpha forced to 0 (client convention).
export function writePal(colors) {
  if (!colors || colors.length !== PAL_COLORS) {
    throw new Error(`writePal needs ${PAL_COLORS} colours, got ${colors && colors.length}`);
  }
  const u8 = new Uint8Array(PAL_SIZE);
  for (let i = 0; i < PAL_COLORS; i++) {
    const c = colors[i], o = i * 4;
    u8[o] = c[0] & 0xff;
    u8[o + 1] = c[1] & 0xff;
    u8[o + 2] = c[2] & 0xff;
    u8[o + 3] = 0;
  }
  return u8;
}

// Trigger a browser download of a palette as <filename>.
export function downloadPal(colors, filename) {
  const blob = new Blob([writePal(colors)], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
