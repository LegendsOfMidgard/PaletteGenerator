// PaletteGenerator editor.
// Pick a class -> its editable cloth indices are clustered into hue zones ->
// each zone gets Hue/Saturation/Brightness sliders -> live recolour of both the
// palette grid and the body sprite -> export the result as a .pal.

import { downloadPal } from "./formats/pal.js";
import { loadSpr, loadAct, drawSprite, drawAction, frameCount, pickIndexAt } from "./render.js";
import { computeZones, applyZone, rgb2hsv } from "./zones.js";
import { saveClass, loadClassData, exportProject, importProject,
         listSlots, getActiveId, setActiveId, addSlot, renameSlot, deleteSlot,
         getTheme, setTheme } from "./storage.js";

const hex2 = (n) => n.toString(16).padStart(2, "0");
const rgb2hex = ([r, g, b]) => `#${hex2(r)}${hex2(g)}${hex2(b)}`;
const hex2rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const CLASSDATA = "resources/classdata";
const DIR_NAMES = ["S", "SW", "W", "NW", "N", "NE", "E", "SE"];
const state = {
  slug: null, token: null, displayName: null, sex: "",
  base: null, mask: null, working: null,
  zones: [], params: [],
  overrides: {},        // { <paletteIndex>: [r,g,b] } manual per-index colours
  selIdx: -1,           // currently selected palette index (grid border)
  hlIdx: -1,            // index flashed red on the sprite (temporary)
  spr: null, act: null, dir: 0, animFrame: 0, timer: null, frame: 0,
  theme: null,   // active slot's coherent palette [hex,...] | null
  slotId: 1,     // active slot id (== clothes_color id)
  zoom: 2,
  panX: 0, panY: 0,   // sprite preview offset (right-drag to move)
  debug: new URLSearchParams(location.search).has("debug"),  // ?debug=1 -> edit/inspect protected indices too
};
const ZOOM_MIN = 1, ZOOM_MAX = 6;

const els = {
  select: document.getElementById("classSelect"),
  status: document.getElementById("status"),
  pal: document.getElementById("paletteCanvas"),
  sprite: document.getElementById("spriteCanvas"),
  zones: document.getElementById("zones"),
  reset: document.getElementById("resetBtn"),
  random: document.getElementById("randomBtn"),
  setTheme: document.getElementById("setThemeBtn"),
  saveProj: document.getElementById("saveProjBtn"),
  loadProj: document.getElementById("loadProjBtn"),
  loadProjInput: document.getElementById("loadProjInput"),
  slotSelect: document.getElementById("slotSelect"),
  newSlot: document.getElementById("newSlotBtn"),
  renameSlot: document.getElementById("renameSlotBtn"),
  delSlot: document.getElementById("delSlotBtn"),
  frameLabel: document.getElementById("frameLabel"),
  framePrev: document.getElementById("framePrev"),
  frameNext: document.getElementById("frameNext"),
  zoomIn: document.getElementById("zoomIn"),
  zoomOut: document.getElementById("zoomOut"),
  zoomLabel: document.getElementById("zoomLabel"),
};

const GROUP_LABEL = { "1st": "1st Job", "2nd": "2nd Job", rebirth: "Rebirth", expanded: "Expanded" };
const GROUP_ORDER = ["1st", "2nd", "rebirth", "expanded"];
const SEX_LABEL = { m: "Male", f: "Female" };

async function loadIndex() {
  const list = await (await fetch(`${CLASSDATA}/_index.json`)).json();
  for (const key of GROUP_ORDER) {
    const inGroup = list.filter((c) => c.group === key);
    if (!inGroup.length) continue;
    const og = document.createElement("optgroup");
    og.label = GROUP_LABEL[key] || key;
    for (const c of inGroup) {
      const opt = document.createElement("option");
      opt.value = c.slug;
      opt.textContent = c.sex ? `${c.displayName} (${SEX_LABEL[c.sex] || c.sex})` : c.displayName;
      og.appendChild(opt);
    }
    els.select.appendChild(og);
  }
  els.status.textContent = `${list.length} classes loaded.`;
  if (list.length) { els.select.value = list[0].slug; await loadClass(list[0].slug); }
}

async function loadClass(slug) {
  const d = await (await fetch(`${CLASSDATA}/${slug}.json`)).json();
  state.slug = slug;
  state.token = d.token || slug;
  state.tokenHex = d.tokenHex || "";
  state.displayName = d.displayName || slug;
  state.sex = d.sex || "";
  state.base = d.base;
  state.mask = d.mask;
  state.zones = computeZones(d.base, d.mask);
  state.selIdx = -1;
  state.panX = 0; state.panY = 0;
  // A class's OWN saved edits always win. The theme only seeds classes that
  // have no edits of their own — so revisiting a class you tweaked restores
  // your colours instead of being overwritten by the pinned theme.
  const saved = loadClassData(state.slotId, slug, state.zones.length);
  state.overrides = saved && saved.overrides ? { ...saved.overrides } : {};
  if (saved && saved.params) {
    state.params = saved.params.map((p) => ({ hue: p.hue, sat: p.sat, val: p.val }));
  } else if (state.theme) {
    state.params = state.zones.map(() => ({ hue: 0, sat: 1, val: 1 }));
    applyThemeToParams();
  } else {
    state.params = state.zones.map(() => ({ hue: 0, sat: 1, val: 1 }));
  }
  state.working = d.base.map((c) => c.slice());

  const label = state.sex ? `${state.displayName} (${SEX_LABEL[state.sex]})` : state.displayName;
  const themed = state.theme ? ` · 🎨 theme applied (${state.theme.length} colours)` : "";
  const dbg = state.debug ? " · 🐞 debug (protected editable)" : "";
  els.status.textContent = `${label} — ${state.zones.length} colour zone${state.zones.length === 1 ? "" : "s"}${themed}${dbg}.`;
  buildZoneUI();
  syncSliders();

  stopAnim();
  state.spr = null; state.act = null; state.dir = 0; state.animFrame = 0;
  try { state.spr = await loadSpr(slug); } catch (e) { state.spr = null; }
  try { state.act = await loadAct(slug); } catch (e) { state.act = null; }
  recompute();                       // draws palette + sprite
  startAnim();
}

// ---- sprite animation -------------------------------------------------------

function idleAction() { return state.dir; }   // idle = actions 0..7 (one per direction)

function startAnim() {
  stopAnim();
  if (!state.act || !state.spr) return;
  const action = state.act.actions[idleAction()];
  if (!action || action.frames.length <= 1) return;
  const ms = Math.max(80, Math.min(300, (action.delay || 4) * 25));
  state.timer = setInterval(() => {
    state.animFrame = (state.animFrame + 1) % action.frames.length;
    renderSprite();
  }, ms);
}

function stopAnim() { if (state.timer) { clearInterval(state.timer); state.timer = null; } }

// ---- editing ----------------------------------------------------------------

function recompute() {
  state.working = state.base.map((c) => c.slice());
  state.zones.forEach((z, i) => applyZone(state.base, state.working, z, state.params[i]));
  // Manual per-index overrides win over zone sliders — apply them last.
  for (const k in state.overrides) state.working[+k] = state.overrides[k].slice();
  drawPalette();
  renderSprite();
}

function buildZoneUI() {
  els.zones.innerHTML = "";
  if (!state.zones.length) {
    els.zones.innerHTML = `<p class="hint">This class has no editable cloth indices.</p>`;
    return;
  }
  state.zones.forEach((z, i) => {
    const card = document.createElement("div");
    card.className = "zone";
    card.innerHTML = `
      <div class="zone-head">
        <input type="color" class="swatch" data-sw="${i}" value="${rgb2hex(z.color)}" title="pick a colour for this zone" />
        <span class="zone-name">Zone ${i + 1}</span>
        <span class="zone-count">${z.indices.length} cols</span>
      </div>
      ${slider(i, "hue", "Hue", -180, 180, 0, "°")}
      ${slider(i, "sat", "Saturation", 0, 200, 100, "%")}
      ${slider(i, "val", "Brightness", 50, 150, 100, "%")}`;
    els.zones.appendChild(card);
  });
  els.zones.querySelectorAll("input[type=range]").forEach((inp) => {
    inp.addEventListener("input", onSlider);
  });
  els.zones.querySelectorAll("input[type=color]").forEach((inp) => {
    inp.addEventListener("input", (e) => applyPicked(+e.target.dataset.sw, e.target.value));
  });
}

function slider(zi, key, label, min, max, val, unit) {
  return `<label class="sl">
    <span class="sl-name">${label}</span>
    <input type="range" data-z="${zi}" data-k="${key}" min="${min}" max="${max}" value="${val}" />
    <span class="sl-val" data-v="${zi}-${key}">${val}${unit}</span>
  </label>`;
}

function onSlider(e) {
  const zi = +e.target.dataset.z, key = e.target.dataset.k, raw = +e.target.value;
  state.params[zi][key] = key === "hue" ? raw : raw / 100;
  const unit = key === "hue" ? "°" : "%";
  els.zones.querySelector(`[data-v="${zi}-${key}"]`).textContent = raw + unit;
  updateSwatch(zi);
  recompute();
  saveClass(state.slotId, state.slug, state.params, state.overrides);
}

function updateSwatch(zi) {
  // reflect the zone's current representative colour on the picker swatch
  const z = state.zones[zi];
  const tmp = state.base.map((c) => c.slice());
  applyZone(state.base, tmp, z, state.params[zi]);
  const sw = els.zones.querySelector(`[data-sw="${zi}"]`);
  if (sw && z.indices.length) {
    sw.value = rgb2hex(tmp[z.repIdx >= 0 ? z.repIdx : z.indices[0]]);
  }
}

// Derive the H/S/B deltas that move a zone's BASE representative colour onto an
// absolute target colour (hex). Pure — returns {hue,sat,val}, clamped to ranges.
function paramsForTarget(z, hex) {
  const [th, ts, tv] = rgb2hsv(hex2rgb(hex));
  const [bh, bs, bv] = rgb2hsv(z.color);
  const hue = ((th - bh + 540) % 360) - 180;
  const sat = bs > 0.01 ? ts / bs : (ts > 0.01 ? 2 : 1);
  const val = bv > 0.01 ? tv / bv : 1;
  return { hue: clamp(Math.round(hue), -180, 180), sat: clamp(sat, 0, 2), val: clamp(val, 0.5, 1.5) };
}

// Pick an absolute colour for a zone (from the colour picker), apply live.
function applyPicked(zi, hex) {
  state.params[zi] = paramsForTarget(state.zones[zi], hex);
  syncSliders();
  recompute();
  saveClass(state.slotId, state.slug, state.params, state.overrides);
}

// Current absolute target colour of each zone (the recoloured representative).
function captureTheme() {
  return state.zones.map((z, i) => {
    const tmp = state.base.map((c) => c.slice());
    applyZone(state.base, tmp, z, state.params[i]);
    return rgb2hex(tmp[z.repIdx >= 0 ? z.repIdx : z.indices[0]]);
  });
}

// When a theme is active, set params so each zone hits the theme colour (by
// index). Zones beyond the theme length keep whatever params they already have.
function applyThemeToParams() {
  if (!state.theme) return;
  state.zones.forEach((z, i) => {
    if (state.theme[i]) state.params[i] = paramsForTarget(z, state.theme[i]);
  });
}

function drawPalette() {
  const ctx = els.pal.getContext("2d");
  const cell = 20, cols = 16;
  ctx.clearRect(0, 0, els.pal.width, els.pal.height);
  for (let i = 0; i < 256; i++) {
    const x = (i % cols) * cell, y = ((i / cols) | 0) * cell;
    const [r, g, b] = state.working[i];
    const transparent = r === 255 && g === 0 && b === 255;
    ctx.fillStyle = transparent ? "#000" : `rgb(${r},${g},${b})`;
    ctx.fillRect(x, y, cell, cell);
    if (state.mask[i] === 1) {
      ctx.strokeStyle = "#7aa2f7"; ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, cell - 2, cell - 2);
    } else {
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(x, y, cell, cell);
    }
    if (i === state.selIdx) {
      ctx.strokeStyle = "#ff2828"; ctx.lineWidth = 3;
      ctx.strokeRect(x + 1.5, y + 1.5, cell - 3, cell - 3);
    }
    if (state.debug) {
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      ctx.fillStyle = lum > 110 ? "#000" : "#fff";
      ctx.font = "8px monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(i, x + cell / 2, y + cell / 2 + 0.5);
    }
  }
}

// ---- per-index editing (palette grid) ---------------------------------------

// Hidden native colour input reused for index picking, and a floating tooltip.
const idxColor = document.createElement("input");
idxColor.type = "color";
idxColor.style.cssText = "position:fixed;width:1px;height:1px;opacity:0;border:0;padding:0;pointer-events:none;";
document.body.appendChild(idxColor);

const tip = document.createElement("div");
tip.style.cssText = "position:fixed;z-index:99;pointer-events:none;background:#0c0d11;color:#e7e9ee;" +
  "border:1px solid #3a3f4b;border-radius:6px;padding:5px 9px;font:12px system-ui;display:none;box-shadow:0 3px 10px rgba(0,0,0,.5);";
document.body.appendChild(tip);
let tipTimer = null;
function showTip(e, msg) {
  tip.textContent = msg;
  tip.style.left = (e.clientX + 12) + "px";
  tip.style.top = (e.clientY + 12) + "px";
  tip.style.display = "block";
  if (tipTimer) clearTimeout(tipTimer);
  tipTimer = setTimeout(() => { tip.style.display = "none"; }, 1600);
}

// Map a mouse event on the palette canvas to a 0..255 index (or -1).
function palIndexAt(e) {
  const rect = els.pal.getBoundingClientRect();
  const cell = 20, cols = 16;
  const px = (e.clientX - rect.left) * (els.pal.width / rect.width);
  const py = (e.clientY - rect.top) * (els.pal.height / rect.height);
  const col = Math.floor(px / cell), row = Math.floor(py / cell);
  if (col < 0 || col >= cols || row < 0) return -1;
  const i = row * cols + col;
  return i >= 0 && i < 256 ? i : -1;
}

// Flash an index red on the sprite for a moment, then clear so the recoloured
// result is visible (a persistent overlay would hide the change you just made).
let hlTimer = null;
function flashHighlight(i) {
  state.hlIdx = i;
  renderSprite();
  if (hlTimer) clearTimeout(hlTimer);
  hlTimer = setTimeout(() => { state.hlIdx = -1; renderSprite(); }, 800);
}

// Select an index and open the native picker to give it an absolute colour.
// Protected (skin/outline) indices refuse and just show a tooltip.
function editIndex(i, e) {
  if (i < 0) return;
  const [r, g, b] = state.working[i];
  const protectedIdx = state.mask[i] !== 1;
  if (protectedIdx) {
    // Protected indices are never recoloured. In debug just report the index so
    // the mask (which indices are skin/outline) can be reviewed by hand.
    if (state.debug) { state.selIdx = i; drawPalette(); flashHighlight(i); showTip(e, `DEBUG · index #${i} · rgb(${r},${g},${b}) · protected`); }
    else showTip(e, "Protected (skin / outline) — not editable");
    return;
  }
  if (state.debug) showTip(e, `DEBUG · index #${i} · rgb(${r},${g},${b})`);
  state.selIdx = i;
  drawPalette();
  flashHighlight(i);   // briefly paint the index red on the body, then fade so the real colour shows
  idxColor.style.left = e.clientX + "px";
  idxColor.style.top = e.clientY + "px";
  idxColor.getBoundingClientRect();   // force layout flush so the picker anchors here, not at the old spot
  idxColor.value = rgb2hex(state.working[i]);
  idxColor.oninput = () => {
    state.overrides[i] = hex2rgb(idxColor.value);
    recompute();
    saveClass(state.slotId, state.slug, state.params, state.overrides);
  };
  idxColor.click();
}

els.pal.addEventListener("click", (e) => editIndex(palIndexAt(e), e));

// Left-click the body sprite -> hit-test to the palette index under the cursor.
els.sprite.addEventListener("click", (e) => {
  const rect = els.sprite.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (els.sprite.width / rect.width);
  const y = (e.clientY - rect.top) * (els.sprite.height / rect.height);
  editIndex(pickIndexAt(x, y), e);
});

// Right-drag the body sprite -> pan the preview.
let panning = null;
els.sprite.addEventListener("contextmenu", (e) => e.preventDefault());
els.sprite.addEventListener("mousedown", (e) => {
  if (e.button !== 2) return;
  e.preventDefault();
  panning = { x: e.clientX, y: e.clientY, sc: els.sprite.width / els.sprite.getBoundingClientRect().width };
});
window.addEventListener("mousemove", (e) => {
  if (!panning) return;
  state.panX += (e.clientX - panning.x) * panning.sc;
  state.panY += (e.clientY - panning.y) * panning.sc;
  panning.x = e.clientX; panning.y = e.clientY;
  renderSprite();
});
window.addEventListener("mouseup", () => { panning = null; });

// Right-click an editable index to clear its manual override.
els.pal.addEventListener("contextmenu", (e) => {
  const i = palIndexAt(e);
  if (i < 0 || state.mask[i] !== 1) return;
  e.preventDefault();
  if (state.overrides[i]) {
    delete state.overrides[i];
    recompute();
    saveClass(state.slotId, state.slug, state.params, state.overrides);
    showTip(e, "Override cleared");
  }
});

function renderSprite() {
  if (state.act && state.spr) {
    drawAction(els.sprite, state.spr, state.act, idleAction(), state.animFrame, state.working, state.zoom, state.panX, state.panY, state.hlIdx);
    els.frameLabel.textContent = `facing ${DIR_NAMES[state.dir]}`;
  } else if (state.spr) {
    drawSprite(els.sprite, state.spr, state.frame, state.working); // fallback: raw frame
    const n = frameCount(state.spr);
    els.frameLabel.textContent = n ? `frame ${state.frame + 1}/${n}` : "no sprite";
  } else {
    els.frameLabel.textContent = "no sprite";
  }
}

// ---- controls ---------------------------------------------------------------

els.select.addEventListener("change", () => loadClass(els.select.value));

els.reset.addEventListener("click", () => {
  state.params = state.zones.map(() => ({ hue: 0, sat: 1, val: 1 }));
  state.overrides = {}; state.selIdx = -1;
  syncSliders();
  recompute();
  saveClass(state.slotId, state.slug, state.params, state.overrides);
});

els.random.addEventListener("click", () => {
  state.params = state.zones.map(() => ({
    hue: Math.round(Math.random() * 360 - 180),
    sat: 0.7 + Math.random() * 0.8,
    val: 0.85 + Math.random() * 0.3,
  }));
  state.overrides = {}; state.selIdx = -1;
  syncSliders();
  recompute();
  saveClass(state.slotId, state.slug, state.params, state.overrides);
});

function setSlider(zi, key, value, unit) {
  const inp = els.zones.querySelector(`input[data-z="${zi}"][data-k="${key}"]`);
  if (inp) inp.value = value;
  const out = els.zones.querySelector(`[data-v="${zi}-${key}"]`);
  if (out) out.textContent = value + unit;
}

// Reflect state.params on all sliders + swatches (after restore / randomize).
function syncSliders() {
  state.zones.forEach((_, zi) => {
    setSlider(zi, "hue", Math.round(state.params[zi].hue), "°");
    setSlider(zi, "sat", Math.round(state.params[zi].sat * 100), "%");
    setSlider(zi, "val", Math.round(state.params[zi].val * 100), "%");
    updateSwatch(zi);
  });
}

// Capture the current class's colours as this slot's coherent palette. It then
// seeds every class in the slot that you haven't hand-edited.
els.setTheme.addEventListener("click", () => {
  state.theme = captureTheme();
  setTheme(state.slotId, state.theme);
  els.status.textContent = `Slot palette set (${state.theme.length} colours) — applies to unedited classes.`;
});

// ---- slots ------------------------------------------------------------------

function buildSlotSelect() {
  els.slotSelect.innerHTML = "";
  for (const s of listSlots()) {
    const o = document.createElement("option");
    o.value = s.id;
    o.textContent = `${s.id} · ${s.name}`;
    els.slotSelect.appendChild(o);
  }
  els.slotSelect.value = state.slotId;
}

function switchSlot(id) {
  state.slotId = id;
  setActiveId(id);
  state.theme = getTheme(id);
  els.slotSelect.value = id;
  if (state.slug) loadClass(state.slug);
}

els.slotSelect.addEventListener("change", () => switchSlot(+els.slotSelect.value));
els.newSlot.addEventListener("click", () => { const id = addSlot(); buildSlotSelect(); switchSlot(id); });
els.renameSlot.addEventListener("click", () => {
  const name = prompt("Slot name:", listSlots().find((s) => s.id === state.slotId)?.name || "");
  if (name == null) return;
  renameSlot(state.slotId, name.trim());
  buildSlotSelect();
});
els.delSlot.addEventListener("click", () => {
  if (!confirm(`Delete slot ${state.slotId} and all its edits?`)) return;
  const id = deleteSlot(state.slotId);
  buildSlotSelect();
  switchSlot(id);
});

els.framePrev.addEventListener("click", () => step(-1));
els.frameNext.addEventListener("click", () => step(1));

function setZoom(z) {
  state.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(z * 10) / 10));
  els.zoomLabel.textContent = `${state.zoom.toFixed(1)}×`;
  renderSprite();
}
els.zoomIn.addEventListener("click", () => setZoom(state.zoom + 0.5));
els.zoomOut.addEventListener("click", () => setZoom(state.zoom - 0.5));
els.sprite.addEventListener("wheel", (e) => {
  e.preventDefault();
  setZoom(state.zoom + (e.deltaY < 0 ? 0.25 : -0.25));
}, { passive: false });
function step(d) {
  if (state.act && state.spr) {                 // rotate idle direction
    state.dir = (state.dir + d + 8) % 8;
    state.animFrame = 0;
    renderSprite();
    startAnim();
  } else {                                       // fallback: step raw spr frames
    const n = frameCount(state.spr);
    if (!n) return;
    state.frame = (state.frame + d + n) % n;
    renderSprite();
  }
}

// Export .pal is disabled in this build (button removed). palName() and
// downloadPal are kept for the later build that re-adds batch export per slot.
function palName() {
  if (!state.tokenHex) return state.token;
  const bytes = new Uint8Array(state.tokenHex.match(/../g).map((h) => parseInt(h, 16)));
  return new TextDecoder("windows-1252").decode(bytes);
}

els.saveProj.addEventListener("click", () => exportProject());
els.loadProj.addEventListener("click", () => els.loadProjInput.click());
els.loadProjInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const n = importProject(await file.text());
    els.loadProjInput.value = "";
    state.slotId = getActiveId();
    state.theme = getTheme(state.slotId);
    buildSlotSelect();
    await loadClass(state.slug);     // re-apply saved params to current class
    els.status.textContent = `Loaded project — ${n} slot${n === 1 ? "" : "s"} restored.`;
  } catch (err) {
    els.status.textContent = "Load failed: " + err.message;
  }
});

state.slotId = getActiveId();
state.theme = getTheme(state.slotId);
buildSlotSelect();
loadIndex().catch((e) => (els.status.textContent = "Error: " + e.message));
