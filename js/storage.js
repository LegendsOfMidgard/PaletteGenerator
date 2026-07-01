// Persistence: slot-based model. A "slot" is a palette identity (clothes_color
// id) whose colours apply across every class. Each slot holds:
//   { name, theme:[hex,...]|null, classes:{ "<slug>":{ z:[{hue,sat,val}], ov:{"<i>":[r,g,b]} } } }
// theme  = the slot's coherent palette, seeds classes you haven't edited.
// classes = per-class tweaks/overrides that WIN over the theme.
//
// Whole store: { active:<id>, slots:{ "<id>": <slot> } }

const KEY = "vortexro_palette_projects_v1";    // legacy per-class store (migrated)
const SLOTS_KEY = "vortexro_palette_slots_v2";

function migrateLegacy() {
  let legacy = {};
  try { legacy = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { /* */ }
  const classes = {};
  for (const [slug, val] of Object.entries(legacy)) {
    classes[slug] = Array.isArray(val) ? { z: val } : val;   // old shapes
  }
  return { active: 1, slots: { "1": { name: "Slot 1", theme: null, classes } } };
}

function readStore() {
  try {
    const v = JSON.parse(localStorage.getItem(SLOTS_KEY));
    if (v && v.slots && Object.keys(v.slots).length) return v;
  } catch { /* */ }
  const init = migrateLegacy();
  writeStore(init);
  return init;
}
function writeStore(obj) {
  try { localStorage.setItem(SLOTS_KEY, JSON.stringify(obj)); } catch { /* quota */ }
}

// ---- slot management --------------------------------------------------------

export function getActiveId() { return readStore().active; }
export function setActiveId(id) { const s = readStore(); s.active = id; writeStore(s); }

export function listSlots() {
  const s = readStore();
  return Object.entries(s.slots)
    .map(([id, v]) => ({ id: +id, name: v.name }))
    .sort((a, b) => a.id - b.id);
}

export function addSlot() {
  const s = readStore();
  const ids = Object.keys(s.slots).map(Number);
  const id = (ids.length ? Math.max(...ids) : 0) + 1;
  s.slots[id] = { name: `Slot ${id}`, theme: null, classes: {} };
  s.active = id;
  writeStore(s);
  return id;
}

export function renameSlot(id, name) {
  const s = readStore();
  if (s.slots[id]) { s.slots[id].name = name || `Slot ${id}`; writeStore(s); }
}

export function deleteSlot(id) {
  const s = readStore();
  delete s.slots[id];
  if (!Object.keys(s.slots).length) s.slots["1"] = { name: "Slot 1", theme: null, classes: {} };
  if (!s.slots[s.active]) s.active = +Object.keys(s.slots)[0];
  writeStore(s);
  return s.active;
}

export function getTheme(id) { const s = readStore(); return (s.slots[id] && s.slots[id].theme) || null; }
export function setTheme(id, hexes) {
  const s = readStore();
  if (s.slots[id]) { s.slots[id].theme = hexes; writeStore(s); }
}

// ---- per-class edits within a slot ------------------------------------------

export function saveClass(id, slug, params, overrides) {
  if (!slug) return;
  const s = readStore();
  const slot = s.slots[id];
  if (!slot) return;
  slot.classes[slug] = {
    z: params.map((p) => ({ h: p.h, s: p.s, v: p.v })),
    ov: overrides && Object.keys(overrides).length ? overrides : undefined,
  };
  writeStore(s);
}

// Returns { params, overrides } or null if the class has no edits in this slot.
export function loadClassData(id, slug, zoneCount) {
  const s = readStore();
  const slot = s.slots[id];
  const saved = slot && slot.classes[slug];
  if (!saved) return null;
  if (Array.isArray(saved)) return { params: saved.length === zoneCount ? saved : null, overrides: {} };
  const params = Array.isArray(saved.z) && saved.z.length === zoneCount ? saved.z : null;
  return { params, overrides: saved.ov || {} };
}

// ---- project file -----------------------------------------------------------

export function exportProject() {
  const blob = new Blob([JSON.stringify(readStore(), null, 1)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "palette_project.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Replace the whole store with an imported bundle. Returns slot count.
export function importProject(text) {
  const obj = JSON.parse(text);
  if (!obj || typeof obj !== "object" || !obj.slots) throw new Error("invalid project file");
  writeStore(obj);
  return Object.keys(obj.slots).length;
}
