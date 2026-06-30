// Persistence: autosave each class's zone edits to localStorage so a player
// doesn't lose work on reload, plus Save/Load of the whole project as a file.
//
// Shape stored: { "<slug>": [{hue,sat,val}, ...], ... }  (one entry per zone)

const KEY = "vortexro_palette_projects_v1";

function readAll() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; }
  catch { return {}; }
}
function writeAll(obj) {
  try { localStorage.setItem(KEY, JSON.stringify(obj)); } catch { /* quota / private mode */ }
}

export function saveClass(slug, params) {
  if (!slug) return;
  const all = readAll();
  all[slug] = params.map((p) => ({ hue: p.hue, sat: p.sat, val: p.val }));
  writeAll(all);
}

// Returns stored params for a class only if the zone count matches.
export function loadClassParams(slug, zoneCount) {
  const saved = readAll()[slug];
  if (Array.isArray(saved) && saved.length === zoneCount) return saved;
  return null;
}

export function clearClass(slug) {
  const all = readAll();
  delete all[slug];
  writeAll(all);
}

export function exportProject() {
  const blob = new Blob([JSON.stringify(readAll(), null, 1)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "palette_project.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Merge an imported project bundle over the current one. Returns class count.
export function importProject(text) {
  const obj = JSON.parse(text);
  if (!obj || typeof obj !== "object") throw new Error("invalid project file");
  const all = readAll();
  let n = 0;
  for (const [slug, params] of Object.entries(obj)) {
    if (Array.isArray(params)) { all[slug] = params; n++; }
  }
  writeAll(all);
  return n;
}
