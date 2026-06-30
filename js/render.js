// Static sprite preview: decode one indexed .spr frame and paint it with the
// edited palette. Index 0 is transparent. Nearest-neighbour upscale to fit.
//
// No .act yet (animation is a later milestone) — we just step through the raw
// sprite frames so the user can pick a pose. The recolour is live: pixels whose
// palette index is editable change, skin/outline indices stay fixed.

import { parseSpr } from "./formats/spr.js";
import { parseAct } from "./formats/act.js";

const CLASSES = "resources/classes";

export async function loadSpr(slug) {
  const res = await fetch(`${CLASSES}/${slug}.spr`);
  if (!res.ok) throw new Error(`no sprite for ${slug} (${res.status})`);
  return parseSpr(await res.arrayBuffer());
}

export async function loadAct(slug) {
  const res = await fetch(`${CLASSES}/${slug}.act`);
  if (!res.ok) throw new Error(`no act for ${slug} (${res.status})`);
  return parseAct(await res.arrayBuffer());
}

export function frameCount(spr) {
  return spr ? spr.frames.length : 0;
}

// Render one indexed spr frame to an offscreen canvas using the edited palette.
function frameToCanvas(fr, working) {
  const cv = document.createElement("canvas");
  if (!fr || !fr.w || !fr.h) { cv.width = cv.height = 1; return cv; }
  cv.width = fr.w; cv.height = fr.h;
  const ctx = cv.getContext("2d");
  const img = ctx.createImageData(fr.w, fr.h);
  for (let i = 0; i < fr.data.length; i++) {
    const idx = fr.data[i], o = i * 4;
    if (idx === 0) { img.data[o + 3] = 0; continue; }
    const [r, g, b] = working[idx];
    img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

// Draw a composited .act motion frame (layers = spr frames at x/y offsets).
// Origin is canvas centre, nudged down so the body stands on its feet.
export function drawAction(canvas, spr, act, actionIdx, frameIdx, working) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  if (!spr || !act || !act.actions.length) return;

  const action = act.actions[Math.max(0, Math.min(act.actions.length - 1, actionIdx))];
  if (!action || !action.frames.length) return;
  const frame = action.frames[Math.max(0, Math.min(action.frames.length - 1, frameIdx))];

  const scale = 2;
  const ox = canvas.width / 2, oy = canvas.height / 2 + 40;
  for (const ly of frame.layers) {
    if (ly.index < 0 || ly.index >= spr.frames.length) continue;
    const fr = spr.frames[ly.index];
    const cv = frameToCanvas(fr, working);
    const dw = fr.w * scale, dh = fr.h * scale;
    const cx = ox + ly.x * scale, cy = oy + ly.y * scale;
    ctx.save();
    ctx.translate(cx, cy);
    if (ly.mirror) ctx.scale(-1, 1);
    ctx.drawImage(cv, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
  }
}

export function drawSprite(canvas, spr, frameIdx, working) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!spr || !spr.frames.length) return;

  const fr = spr.frames[Math.max(0, Math.min(spr.frames.length - 1, frameIdx))];
  if (!fr.w || !fr.h) return;

  // Build an RGBA image from the indices + edited palette.
  const img = ctx.createImageData(fr.w, fr.h);
  for (let i = 0; i < fr.data.length; i++) {
    const idx = fr.data[i];
    const o = i * 4;
    if (idx === 0) { img.data[o + 3] = 0; continue; } // transparent
    const [r, g, b] = working[idx];
    img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = 255;
  }

  // Off-screen 1:1 then nearest-neighbour upscale to fit the canvas.
  const tmp = document.createElement("canvas");
  tmp.width = fr.w; tmp.height = fr.h;
  tmp.getContext("2d").putImageData(img, 0, 0);

  const scale = Math.max(1, Math.floor(Math.min(canvas.width / fr.w, canvas.height / fr.h)));
  const dw = fr.w * scale, dh = fr.h * scale;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tmp, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
}
