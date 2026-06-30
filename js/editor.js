// PaletteGenerator editor.
// Pick a class -> its editable cloth indices are clustered into hue zones ->
// each zone gets Hue/Saturation/Brightness sliders -> live recolour of both the
// palette grid and the body sprite -> export the result as a .pal.

import { downloadPal } from "./formats/pal.js";
import { loadSpr, loadAct, drawSprite, drawAction, frameCount } from "./render.js";
import { computeZones, applyZone, rgb2hsv } from "./zones.js";
import { saveClass, loadClassParams, exportProject, importProject,
         saveTheme, loadTheme, clearTheme } from "./storage.js";

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
  spr: null, act: null, dir: 0, animFrame: 0, timer: null, frame: 0,
  theme: null, // [hex,...] absolute target colours carried across classes
  zoom: 2,
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
  pin: document.getElementById("pinBtn"),
  export: document.getElementById("exportBtn"),
  saveProj: document.getElementById("saveProjBtn"),
  loadProj: document.getElementById("loadProjBtn"),
  loadProjInput: document.getElementById("loadProjInput"),
  slot: document.getElementById("slotId"),
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
  // Theme (coherent palette) takes precedence; otherwise restore saved tweaks.
  if (state.theme) {
    state.params = state.zones.map(() => ({ hue: 0, sat: 1, val: 1 }));
    applyThemeToParams();
  } else {
    const saved = loadClassParams(slug, state.zones.length);
    state.params = saved
      ? saved.map((p) => ({ hue: p.hue, sat: p.sat, val: p.val }))
      : state.zones.map(() => ({ hue: 0, sat: 1, val: 1 }));
  }
  state.working = d.base.map((c) => c.slice());

  const label = state.sex ? `${state.displayName} (${SEX_LABEL[state.sex]})` : state.displayName;
  const themed = state.theme ? ` · 🎨 theme applied (${state.theme.length} colours)` : "";
  els.status.textContent = `${label} — ${state.zones.length} colour zone${state.zones.length === 1 ? "" : "s"}${themed}.`;
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
  saveClass(state.slug, state.params);
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
  saveClass(state.slug, state.params);
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
  }
}

function renderSprite() {
  if (state.act && state.spr) {
    drawAction(els.sprite, state.spr, state.act, idleAction(), state.animFrame, state.working, state.zoom);
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
  syncSliders();
  recompute();
  saveClass(state.slug, state.params);
});

els.random.addEventListener("click", () => {
  state.params = state.zones.map(() => ({
    hue: Math.round(Math.random() * 360 - 180),
    sat: 0.7 + Math.random() * 0.8,
    val: 0.85 + Math.random() * 0.3,
  }));
  syncSliders();
  recompute();
  saveClass(state.slug, state.params);
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

els.pin.addEventListener("click", () => {
  if (state.theme) {                 // unpin
    state.theme = null;
    clearTheme();
  } else {                           // pin current zone colours as the theme
    state.theme = captureTheme();
    saveTheme(state.theme);
  }
  refreshThemeUI();
});

function refreshThemeUI() {
  const on = !!state.theme;
  els.pin.textContent = on ? `Unpin (${state.theme.length})` : "Pin colours";
  els.pin.classList.toggle("active", on);
}

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

els.export?.addEventListener("click", () => {
  if (!state.working) return;
  const x = Math.max(1, Math.min(255, parseInt(els.slot.value, 10) || 1));
  // Name the file with the ORIGINAL cp949 token bytes decoded as Windows-1252,
  // matching how RO palette files actually live on disk / in the GRF
  // (e.g. 궁수_여 -> ±Ã¼ö_¿©). Do NOT use the UTF-8 Korean or the display name.
  downloadPal(state.working, `${palName()}_${x}.pal`);
});

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
    await loadClass(state.slug);     // re-apply saved params to current class
    els.status.textContent = `Loaded project — ${n} class${n === 1 ? "" : "es"} restored.`;
  } catch (err) {
    els.status.textContent = "Load failed: " + err.message;
  }
});

state.theme = loadTheme();
refreshThemeUI();
loadIndex().catch((e) => (els.status.textContent = "Error: " + e.message));
