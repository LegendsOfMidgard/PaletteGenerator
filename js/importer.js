// Owner-side import gallery.
// Loads player-submitted .pal files, recovers (token, slot) from each filename,
// matches the token against resources/classdata/_index.json, previews the body
// sprite recoloured with the submitted palette, and exports a manifest of the
// ones the owner accepts.
//
// Reuses shared modules (no edits to them):
//   readPal(arrayBuffer|Uint8Array) -> [[r,g,b] x256]      (js/formats/pal.js)
//   loadSpr(slug) -> Promise<{frames, palette, version}>   (js/render.js)
//   frameCount(spr) -> number                              (js/render.js)
//   drawSprite(canvas, spr, frameIdx, working)             (js/render.js)
//     `working` is a [[r,g,b] x256] palette — exactly what readPal returns.

import { readPal } from "./formats/pal.js";
import { loadSpr, frameCount, drawSprite } from "./render.js";

const INDEX_URL = "resources/classdata/_index.json";

let indexByToken = new Map();     // token (Korean) -> {slug, token, sex, displayName, group}
const sprCache = new Map();       // slug -> Promise<spr|null>
const submissions = [];           // live list of submission objects

const $gallery = document.getElementById("gallery");
const $counts = document.getElementById("counts");
const $fileInput = document.getElementById("fileInput");
const $exportBtn = document.getElementById("exportBtn");
const $copyBtn = document.getElementById("copyBtn");
const $clearBtn = document.getElementById("clearBtn");

// ---------------------------------------------------------------------------

async function loadIndex() {
  const res = await fetch(INDEX_URL);
  if (!res.ok) throw new Error(`cannot load ${INDEX_URL} (${res.status})`);
  const arr = await res.json();
  for (const e of arr) indexByToken.set(e.token, e);
}

// "<token>_<slot>.pal" -> { token, slot }. Strip trailing _<digits>.pal.
// If no trailing slot, treat the whole stem as the token and slot = null.
function parseFilename(name) {
  const m = /^(.*)_(\d+)\.pal$/i.exec(name);
  if (m) return { token: m[1], slot: parseInt(m[2], 10) };
  return { token: name.replace(/\.pal$/i, ""), slot: null };
}

function getSpr(slug) {
  if (sprCache.has(slug)) return sprCache.get(slug);
  const p = loadSpr(slug).catch((err) => {
    console.warn(`spr load failed for ${slug}:`, err);
    return null;
  });
  sprCache.set(slug, p);
  return p;
}

// ---------------------------------------------------------------------------

function updateCounts() {
  const loaded = submissions.length;
  const accepted = submissions.filter((s) => s.status === "accepted").length;
  const unmatched = submissions.filter((s) => !s.match).length;
  if (!loaded) {
    $counts.textContent = "No submissions loaded.";
  } else {
    $counts.innerHTML =
      `Loaded <b>${loaded}</b> · Accepted <b>${accepted}</b> · Unmatched <b>${unmatched}</b>`;
  }
  const hasAccepted = accepted > 0;
  $exportBtn.disabled = !hasAccepted;
  $copyBtn.disabled = !hasAccepted;
}

function drawPalGrid(canvas, colors) {
  const cell = 12, cols = 16;
  canvas.width = cols * cell;
  canvas.height = cols * cell;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < 256; i++) {
    const x = (i % cols) * cell;
    const y = Math.floor(i / cols) * cell;
    if (i === 0) continue; // index 0 = transparent; leave checker showing
    const [r, g, b] = colors[i];
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(x, y, cell, cell);
  }
}

function renderPreview(sub) {
  if (!sub.spr) return;
  drawSprite(sub.spriteCanvas, sub.spr, sub.frame, sub.colors);
  const total = frameCount(sub.spr);
  sub.frameLabel.textContent = total ? `frame ${sub.frame + 1}/${total}` : "no frames";
}

function buildCard(sub) {
  const card = document.createElement("section");
  card.className = "card";
  if (!sub.match) card.classList.add("unmatched");
  sub.card = card;

  // --- head ---
  const head = document.createElement("div");
  head.className = "card-head";
  const titleWrap = document.createElement("div");
  const title = document.createElement("div");
  title.className = "card-title";
  const sub2 = document.createElement("div");
  sub2.className = "card-sub";
  if (sub.match) {
    title.textContent = sub.match.displayName;
    sub2.textContent = sub.match.sex === "f" ? "Female" : "Male";
  } else {
    title.textContent = sub.token || "(unknown)";
    sub2.innerHTML = `<span class="badge-unmatched">unmatched token</span>`;
  }
  titleWrap.appendChild(title);
  titleWrap.appendChild(sub2);
  const slot = document.createElement("span");
  slot.className = "card-slot";
  slot.textContent = sub.slot == null ? "slot ?" : `slot ${sub.slot}`;
  head.appendChild(titleWrap);
  head.appendChild(slot);
  card.appendChild(head);

  // --- error short-circuit (bad .pal) ---
  if (sub.error) {
    const err = document.createElement("div");
    err.className = "card-error";
    err.textContent = `Could not read palette: ${sub.error}`;
    card.appendChild(err);
    const file = document.createElement("div");
    file.className = "card-file";
    file.textContent = sub.filename;
    card.appendChild(file);
    return card;
  }

  // --- sprite preview ---
  const stage = document.createElement("div");
  stage.className = "card-stage";
  const spriteCanvas = document.createElement("canvas");
  spriteCanvas.width = 200;
  spriteCanvas.height = 230;
  sub.spriteCanvas = spriteCanvas;
  stage.appendChild(spriteCanvas);
  card.appendChild(stage);

  // --- frame nav ---
  const frames = document.createElement("div");
  frames.className = "card-frames";
  const prev = document.createElement("button");
  prev.textContent = "◀";
  const label = document.createElement("span");
  label.className = "hint";
  label.textContent = sub.match ? "loading…" : "no sprite";
  const next = document.createElement("button");
  next.textContent = "▶";
  sub.frameLabel = label;
  const step = (d) => {
    const total = frameCount(sub.spr);
    if (!total) return;
    sub.frame = (sub.frame + d + total) % total;
    renderPreview(sub);
  };
  prev.addEventListener("click", () => step(-1));
  next.addEventListener("click", () => step(1));
  frames.appendChild(prev);
  frames.appendChild(label);
  frames.appendChild(next);
  card.appendChild(frames);

  // --- palette grid ---
  const palCanvas = document.createElement("canvas");
  palCanvas.className = "pal-grid";
  drawPalGrid(palCanvas, sub.colors);
  card.appendChild(palCanvas);

  // --- accept / reject ---
  const actions = document.createElement("div");
  actions.className = "card-actions";
  const accept = document.createElement("button");
  accept.className = "btn-accept";
  accept.textContent = "Accept";
  const reject = document.createElement("button");
  reject.className = "btn-reject";
  reject.textContent = "Reject";
  const setStatus = (s) => {
    sub.status = sub.status === s ? "pending" : s; // toggle off if clicked again
    card.classList.toggle("accepted", sub.status === "accepted");
    card.classList.toggle("rejected", sub.status === "rejected");
    updateCounts();
  };
  accept.addEventListener("click", () => setStatus("accepted"));
  reject.addEventListener("click", () => setStatus("rejected"));
  actions.appendChild(accept);
  actions.appendChild(reject);
  card.appendChild(actions);

  // --- filename footer ---
  const file = document.createElement("div");
  file.className = "card-file";
  file.textContent = sub.filename;
  card.appendChild(file);

  return card;
}

// ---------------------------------------------------------------------------

async function addFile(file) {
  const { token, slot } = parseFilename(file.name);
  const match = indexByToken.get(token) || null;
  const sub = {
    filename: file.name,
    token,
    slot,
    match,
    colors: null,
    spr: null,
    frame: 0,
    status: "pending",
    error: null,
  };

  try {
    const buf = await file.arrayBuffer();
    sub.colors = readPal(buf);
  } catch (err) {
    sub.error = err && err.message ? err.message : String(err);
  }

  submissions.push(sub);
  const card = buildCard(sub);
  $gallery.appendChild(card);
  updateCounts();

  // Lazily fetch + draw the sprite for matched, valid submissions.
  if (match && !sub.error) {
    const spr = await getSpr(match.slug);
    if (spr && sub.card && sub.card.isConnected) {
      sub.spr = spr;
      renderPreview(sub);
    } else if (sub.frameLabel) {
      sub.frameLabel.textContent = "sprite unavailable";
    }
  }
}

function buildManifest() {
  return submissions
    .filter((s) => s.status === "accepted" && s.match)
    .map((s) => ({
      slug: s.match.slug,
      token: s.match.token,
      displayName: s.match.displayName,
      sex: s.match.sex,
      slot: s.slot,
      filename: s.filename,
    }));
}

function exportManifest() {
  const manifest = buildManifest();
  const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "palette_manifest.json";
  a.click();
  URL.revokeObjectURL(url);
}

async function copyManifest() {
  const text = JSON.stringify(buildManifest(), null, 2);
  try {
    await navigator.clipboard.writeText(text);
    $copyBtn.textContent = "Copied!";
    setTimeout(() => ($copyBtn.textContent = "Copy JSON"), 1200);
  } catch (err) {
    console.warn("clipboard failed:", err);
    $copyBtn.textContent = "Copy failed";
    setTimeout(() => ($copyBtn.textContent = "Copy JSON"), 1200);
  }
}

function clearAll() {
  submissions.length = 0;
  $gallery.innerHTML = "";
  $fileInput.value = "";
  updateCounts();
}

// ---------------------------------------------------------------------------

$fileInput.addEventListener("change", async (e) => {
  const files = Array.from(e.target.files || []);
  for (const f of files) {
    // sequential keeps sprite cache warm and DOM order = pick order
    // eslint-disable-next-line no-await-in-loop
    await addFile(f);
  }
});
$exportBtn.addEventListener("click", exportManifest);
$copyBtn.addEventListener("click", copyManifest);
$clearBtn.addEventListener("click", clearAll);

loadIndex().catch((err) => {
  console.error(err);
  $counts.textContent = `Failed to load class index: ${err.message}`;
});
