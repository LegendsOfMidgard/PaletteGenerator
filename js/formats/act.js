// Minimal RO .act parser (follows roBrowser's layout).
// An .act groups the raw .spr frames into ACTIONS; each action is a list of
// motion FRAMES; each frame composites one or more LAYERS (a .spr frame index
// drawn at an x/y offset). Player sprites lay actions out as actType*8 + dir,
// so action 0 = idle facing the first direction.
//
// We only need: actions[].frames[].layers[{index,x,y,mirror}] + per-action delay.

export function parseAct(buf) {
  const dv = new DataView(buf);
  let p = 0;
  const u8 = (n) => { const v = dv.getUint8(p); p += n; return v; };
  const i16 = () => { const v = dv.getInt16(p, true); p += 2; return v; };
  const u16 = () => { const v = dv.getUint16(p, true); p += 2; return v; };
  const i32 = () => { const v = dv.getInt32(p, true); p += 4; return v; };
  const u32 = () => { const v = dv.getUint32(p, true); p += 4; return v; };
  const f32 = () => { const v = dv.getFloat32(p, true); p += 4; return v; };

  if (dv.getUint8(0) !== 0x41 || dv.getUint8(1) !== 0x43) throw new Error("not an .act");
  p = 2;
  const version = u16();
  const nActions = i16();
  p += 10; // reserved

  const actions = [];
  for (let a = 0; a < nActions; a++) {
    const nFrames = u32();
    const frames = [];
    for (let f = 0; f < nFrames; f++) {
      p += 32; // range1[4] + range2[4] int32
      const nLayers = u32();
      const layers = [];
      for (let l = 0; l < nLayers; l++) {
        const x = i32(), y = i32(), index = i32(), mirror = i32();
        if (version >= 0x200) {
          p += 4;        // color RGBA
          f32();         // xScale
          if (version >= 0x204) f32(); // yScale
          else { /* yScale = xScale */ }
          f32();         // rotate
          i32();         // sprType
          if (version >= 0x205) { i32(); i32(); } // width, height
        }
        layers.push({ x, y, index, mirror: !!mirror });
      }
      if (version >= 0x200) i32(); // eventId
      if (version >= 0x203) {
        const nPos = u32();
        p += nPos * 16; // anchor points: 4 int32 each
      }
      frames.push({ layers });
    }
    actions.push({ frames, delay: 4 });
  }

  if (version >= 0x202) {
    for (let a = 0; a < actions.length && p + 4 <= dv.byteLength; a++) actions[a].delay = f32();
  }
  return { version, actions };
}
