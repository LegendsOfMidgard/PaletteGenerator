// Colour zones: cluster the editable (mask==1) palette indices into a few hue
// groups so a player tweaks "the red parts" / "the blue parts" with one set of
// H/S/B sliders instead of 256 swatches. Every editable index lands in exactly
// one zone, so editing a zone fully recolours that part.

const MAGENTA = (c) => c[0] === 255 && c[1] === 0 && c[2] === 255;
const MAX_ZONES = 8;
const MERGE_DEG = 22;        // centres closer than this collapse into one zone
const SAT_FLOOR = 0.15;      // below this a colour is "grey" — hue unreliable
const VAL_FLOOR = 0.08;      // below this it's near-black

export function rgb2hsv([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return [h, max === 0 ? 0 : d / max, max];
}

export function hsv2rgb(h, s, v) {
  h = ((h % 360) + 360) % 360;
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

const hueDist = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

function circularMean(hues) {
  let x = 0, y = 0;
  for (const h of hues) { x += Math.cos(h * Math.PI / 180); y += Math.sin(h * Math.PI / 180); }
  let m = Math.atan2(y, x) * 180 / Math.PI;
  return (m + 360) % 360;
}

function mergeCenters(centers) {
  const out = [];
  for (const c of centers.sort((a, b) => a - b)) {
    if (out.length && hueDist(out[out.length - 1], c) < MERGE_DEG) continue;
    out.push(c);
  }
  // wrap-around merge (e.g. 5° and 358°)
  if (out.length > 1 && hueDist(out[0], out[out.length - 1]) < MERGE_DEG) out.pop();
  return out;
}

// -> [{ id, indices:[int], color:[r,g,b] }]
export function computeZones(base, mask) {
  const editable = [];
  for (let i = 0; i < 256; i++) if (mask[i] === 1 && !MAGENTA(base[i])) editable.push(i);
  if (!editable.length) return [];

  const sat = editable.filter((i) => {
    const [, s, v] = rgb2hsv(base[i]);
    return s > SAT_FLOOR && v > VAL_FLOOR;
  });

  let centers;
  if (sat.length) {
    const hues = sat.map((i) => rgb2hsv(base[i])[0]).sort((a, b) => a - b);
    const k = Math.min(MAX_ZONES, hues.length);
    centers = [];
    for (let j = 0; j < k; j++) centers.push(hues[Math.floor((j + 0.5) / k * hues.length)]);
    for (let iter = 0; iter < 12; iter++) {
      const buckets = centers.map(() => []);
      for (const i of sat) {
        const h = rgb2hsv(base[i])[0];
        let best = 0, bd = 999;
        centers.forEach((c, ci) => { const dd = hueDist(h, c); if (dd < bd) { bd = dd; best = ci; } });
        buckets[best].push(h);
      }
      centers = centers.map((c, ci) => (buckets[ci].length ? circularMean(buckets[ci]) : c));
    }
    centers = mergeCenters(centers);
  } else {
    centers = [0]; // everything is grey/black — one neutral zone
  }

  const zones = centers.map((_, id) => ({ id, indices: [], _best: -1, color: [128, 128, 128], repIdx: -1 }));
  for (const i of editable) {
    const [h, s, v] = rgb2hsv(base[i]);
    let best = 0, bd = 999;
    centers.forEach((c, ci) => { const dd = hueDist(h, c); if (dd < bd) { bd = dd; best = ci; } });
    const z = zones[best];
    z.indices.push(i);
    // representative swatch = most saturated*bright member
    const score = s * v;
    if (score > z._best) { z._best = score; z.color = base[i].slice(); z.repIdx = i; }
  }
  return zones.filter((z) => z.indices.length)
              .map(({ id, indices, color, repIdx }) => ({ id, indices, color, repIdx }));
}

// Apply one zone's H/S/B deltas to the working palette, from the base colours.
// hue: degrees (-180..180), sat: multiplier, val: multiplier.
export function applyZone(base, working, zone, { hue, sat, val }) {
  for (const i of zone.indices) {
    let [h, s, v] = rgb2hsv(base[i]);
    h += hue;
    s = Math.max(0, Math.min(1, s * sat));
    v = Math.max(0, Math.min(1, v * val));
    working[i] = hsv2rgb(h, s, v);
  }
}
