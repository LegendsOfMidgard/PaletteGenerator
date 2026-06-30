# PaletteGenerator

Browser tool to author Ragnarok Online body palettes for VortexRo. Pick a class, recolor the
outfit (skin/protected parts are frozen), preview on the sprite, and **export a `.pal`**. The
server owner imports/reviews submissions and ships the good ones as `clothes_color` slots.

Static site — no backend. Plan: `E:\VortexRo\docs\palette_editor_web_plan.md` and the approved
implementation plan.

## Run (dev)

ES modules + `fetch` need an HTTP server (not `file://`):

```
cd PaletteGenerator
python -m http.server 8000
# open http://localhost:8000
```

## Status

- **v0 (works now):** class picker → base palette grid (editable vs protected) → export `.pal`.
- **Pending:** roBrowser SPR/ACT render (animated preview), zone sliders + randomize, import &
  review gallery, localStorage persistence. Needs class `.spr`/`.act` extracted (see below).

## Layout

- `js/formats/pal.js` — `.pal` read/write/download (1024 B, 256 RGBA).
- `js/editor.js` — v0 UI (class select, palette grid, export).
- `js/render.js`, `js/zones.js`, `js/storage.js`, `js/importer.js`, `js/vendor/robrowser/` — TODO.
- `resources/classdata/<slug>.json` — `{ token, slug, sex, base[256][rgb], mask[256] }`.
  `mask[i]==1` = editable cloth, `0` = protected (skin/outline/fixed/transparent).
- `resources/classes/<slug>/<slug>.spr|.act` — extracted sprites (owner step).
- `tools/export_classdata.py` — regenerates `resources/classdata/` from the DLL header.

## Owner data-prep

1. **Class data (done by the tool):**
   ```
   python tools/export_classdata.py
   ```
   Parses `E:\VortexRo\dll\Vortexoverlay\ragnarok\palette\palette_repaint_data.h`
   → `resources/classdata/*.json` (+ `_index.json`). Re-run whenever the DLL repaint table changes.

2. **Sprites (manual, per class):** extract the body `.spr` + `.act` (both sexes) from
   `2025 Palettes.grf` at `data\sprite\인간족\몸통\<sex>\<token>.spr|.act` into
   `resources/classes/<slug>/`. Use GRF Editor. v1: just one test class to validate end-to-end.

3. Add the class to `resources/manifest.json`.

## How exported palettes reach the game

Each exported `.pal` is named `<slug>_<X>.pal` (`X` = a `clothes_color` slot). The owner drops
accepted palettes into the client GRF at `...\body\<job>_<sex>_<X>.pal`, bumps `max_cloth_color`
if needed. `clothes_color` ids are finite → a curated pool, not unlimited per player.
