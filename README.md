# PaletteGenerator

Browser tool to author Ragnarok Online body palettes for VortexRo. Pick a class, recolor the
outfit (skin/outline/protected parts are frozen), preview on the animated body sprite, and
**export a `.pal`**. The server owner imports/reviews submissions and ships the good ones as
`clothes_color` slots.

Static site — vanilla ES modules + canvas, no backend.

## Run (dev — readable source)

ES modules + `fetch` need an HTTP server (not `file://`):

```
cd PaletteGenerator
python -m http.server 8000
# open http://localhost:8000
```

In dev the HTML loads the bundled `dist/*.bundle.js`. While editing `js/` source, rebuild
(below) or run `npm run watch`.

## Build (minified + obfuscated bundles)

```
npm install        # one-time
npm run build      # -> dist/editor.bundle.js, dist/importer.bundle.js
```

Webpack bundles `js/` into two obfuscated files (`webpack.config.js`). `index.html` /
`importer.html` reference `dist/`, not the raw modules.

> NOTE: client-side JS can never be made truly uncopyable — DevTools can always inspect the
> running code. Obfuscation only deters casual copying.

## Deploy

Serve only: `index.html`, `importer.html`, `css/`, `dist/`, `resources/`. **Do NOT upload `js/`
source** (keep it private in the repo). Rebuild `dist/` before deploying if `js/` changed.

## Layout

- `index.html` — player editor. `importer.html` — owner review gallery.
- `js/editor.js` — UI: class picker, hue-zone sliders, per-zone colour picker, randomize, export.
- `js/zones.js` — clusters editable indices into hue zones; HSV apply.
- `js/render.js` + `js/formats/spr.js` + `js/formats/act.js` — minimal SPR/ACT loaders + sprite
  preview (recoloured, direction-steppable).
- `js/formats/pal.js` — `.pal` read/write/download (1024 B, 256 RGBA).
- `js/storage.js` — localStorage autosave + Save/Load project.
- `js/importer.js` — owner gallery (load `.pal`s, match class, preview, accept, export manifest).
- `resources/classdata/<slug>.json` — `{ token, slug, sex, displayName, group, tokenHex,
  base[256][rgb], mask[256] }`. `mask[i]==1` = editable cloth, `0` = protected.
- `resources/classes/<slug>.spr|.act` — body sprites (normalized ASCII names).
- `tools/` — `export_classdata.py` (DLL header → classdata), `class_map.py` (curated 38 classes),
  `link_sprites.py` (GRF dump → ASCII slug sprites).

## Owner data-prep

1. **Class data:** `python tools/export_classdata.py` — parses
   `E:\VortexRo\dll\Vortexoverlay\ragnarok\palette\palette_repaint_data.h` →
   `resources/classdata/*.json` (+ `_index.json`). Filtered to 38 curated classes via
   `class_map.py`. Re-run whenever the DLL repaint table changes.
2. **Sprites:** drop the body `여` (female) and `남` (male) folders from `data.grf`
   (`data\sprite\인간족\몸통\`) into `resources/classes/`, then
   `python tools/link_sprites.py` — normalizes the cp949-mangled filenames to ASCII slug
   `resources/classes/<slug>.spr|.act` (matches the 72 curated class/sex entries).

## How exported palettes reach the game

Each `.pal` is named with the original token bytes decoded as **Windows-1252**
(`궁수_여` → `±Ã¼ö_¿©_<X>.pal`, `X` = a `clothes_color` slot), matching the in-GRF palette name.
The owner drops accepted palettes into the client GRF palette path and bumps `max_cloth_color`
if needed. `clothes_color` ids are finite → a curated pool, not unlimited per player.
