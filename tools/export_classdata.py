#!/usr/bin/env python3
"""Parse the DLL repaint data header into per-class JSON for the web editor.

Source : E:\\VortexRo\\dll\\Vortexoverlay\\ragnarok\\palette\\palette_repaint_data.h
Output : ../resources/classdata/<slug>.json   = { token, slug, sex, base[256][rgb], mask[256] }
         ../resources/classdata/_index.json    = [ {slug, token, sex} ... ]

base : the class's base body palette (256 colours). Magenta (255,0,255) = transparent.
mask : 256 bytes, 1 = dyeable cloth (EDITABLE), 0 = protected (skin/outline/fixed/transparent).

The editor edits only mask==1 indices; mask==0 is frozen (matches the in-client runtime).
Run once (and again whenever the DLL repaint table is regenerated).
"""
import json, re, os
from class_map import CLASS_MAP, GROUP_ORDER

HEADER = r"E:\VortexRo\dll\Vortexoverlay\ragnarok\palette\palette_repaint_data.h"
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "resources", "classdata")


def base_kr(token, sex):
    """Korean token with the trailing gender char (남/여) + separators stripped."""
    return token[:-1].rstrip("_") if sex else token

# Trailing gender bytes in the EUC-KR/cp949 token: 남 (man) / 여 (woman).
GENDER = {b"\xb3\xb2": "m", b"\xbf\xa9": "f"}


def parse_escaped(s):
    """'\\x61\\x62...' -> bytes."""
    return bytes(int(h, 16) for h in re.findall(r"\\x([0-9A-Fa-f]{2})", s))


def slugify(tok_bytes, sex):
    """Filename-safe ascii slug: keep printable ASCII, map gender, hex the rest."""
    body = tok_bytes
    for g in GENDER:
        if body.endswith(g):
            body = body[:-len(g)]
            break
    out = []
    for b in body:
        if 0x20 <= b < 0x7f and chr(b) not in '\\/:*?"<>| ':
            out.append(chr(b))
        else:
            out.append("%02x" % b)
    slug = "".join(out).strip("_")
    return f"{slug}_{sex}" if sex else slug


def main():
    text = open(HEADER, "r", encoding="latin-1").read()

    toks = {int(n): parse_escaped(s)
            for n, s in re.findall(r'kTok(\d+)\[\]\s*=\s*"((?:\\x[0-9A-Fa-f]{2})+)"', text)}
    bases = {int(n): [int(v) for v in body.split(",") if v.strip() != ""]
             for n, body in re.findall(r"kBase(\d+)\[1024\]\s*=\s*\{([^}]*)\}", text)}
    masks = {int(n): [int(v) for v in body.split(",") if v.strip() != ""]
             for n, body in re.findall(r"kMask(\d+)\[256\]\s*=\s*\{([^}]*)\}", text)}

    os.makedirs(OUT_DIR, exist_ok=True)
    # Wipe stale json (previous unfiltered dump) so only curated classes remain.
    for fn in os.listdir(OUT_DIR):
        if fn.endswith(".json"):
            os.remove(os.path.join(OUT_DIR, fn))
    index = []
    for n in sorted(toks):
        if n not in bases or n not in masks:
            continue
        tb = toks[n]
        sex = next((g for suf, g in GENDER.items() if tb.endswith(suf)), "")
        try:
            token = tb.decode("cp949")
        except Exception:
            token = tb.decode("latin-1")

        # Curation: keep only whitelisted base classes (exact Korean match).
        entry = CLASS_MAP.get(base_kr(token, sex))
        if not entry:
            continue
        display_name, group = entry

        slug = slugify(tb, sex)
        raw = bases[n]                       # 1024 = 256 * RGBA
        base = [[raw[i * 4], raw[i * 4 + 1], raw[i * 4 + 2]] for i in range(256)]
        rec = {"token": token, "slug": slug, "sex": sex,
               "displayName": display_name, "group": group,
               "tokenHex": tb.hex(), "base": base, "mask": masks[n]}
        with open(os.path.join(OUT_DIR, slug + ".json"), "w", encoding="utf-8") as f:
            json.dump(rec, f, ensure_ascii=False, separators=(",", ":"))
        index.append({"slug": slug, "token": token, "sex": sex,
                      "displayName": display_name, "group": group})

    # Sort the index by group order, then display name, then sex (m before f).
    index.sort(key=lambda r: (GROUP_ORDER.index(r["group"]) if r["group"] in GROUP_ORDER else 99,
                              r["displayName"], r["sex"]))
    with open(os.path.join(OUT_DIR, "_index.json"), "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=1)
    print("wrote %d classdata json (+_index.json) to %s" % (len(index), os.path.normpath(OUT_DIR)))


if __name__ == "__main__":
    main()
