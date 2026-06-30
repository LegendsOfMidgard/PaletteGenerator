# -*- coding: utf-8 -*-
"""Normalize the GRF-extracted body sprites into ASCII slug filenames.

Input  : ../resources/classes/<genderfolder>/<korean-token>.spr|.act
         (genderfolder + filenames are cp949 bytes that Windows mangled into
          latin1/cp1252 codepoints when GRFEditor extracted them.)
Output : ../resources/classes/<slug>.spr  +  <slug>.act      (clean ASCII)

Matching is byte-exact: for each on-disk filename we recover the original cp949
bytes (try latin1 then cp1252) and look the class up by token.encode('cp949').
So it works regardless of which codepage the extractor used, and ignores every
file that is not one of the 72 curated classes (mounts, 4th jobs, costumes...).
"""
import json, os, shutil

ROOT = os.path.join(os.path.dirname(__file__), "..", "resources", "classes")
INDEX = os.path.join(os.path.dirname(__file__), "..", "resources", "classdata", "_index.json")

# A few palette tokens differ from the actual body-sprite filename.
# Keyed by the gender-stripped Korean palette base -> gender-stripped body base.
OVERRIDES = {
    "크루": "크루세이더",          # Crusader: palette uses the short form
    "어세신크로스": "어쌔신크로스",  # Assassin Cross: 세 -> 쌔 in the body sprite
    "하이프리스트": "하이프리",      # High Priest: body sprite is abbreviated
}


def main():
    classes = json.load(open(INDEX, encoding="utf-8"))
    # token cp949 bytes -> slug
    want = {c["token"].encode("cp949"): c["slug"] for c in classes}
    # Alias the override body tokens to the same slug, preserving the gender suffix.
    for c in classes:
        tok = c["token"]
        base = tok[:-1].rstrip("_")            # strip trailing 여/남 (+ "_")
        suffix = tok[len(base):]               # e.g. "_여"
        if base in OVERRIDES:
            want[(OVERRIDES[base] + suffix).encode("cp949")] = c["slug"]

    slugs = set(want.values())
    found, missing = {}, set(slugs)
    for dirpath, _dirs, files in os.walk(ROOT):
        for fn in files:
            ext = os.path.splitext(fn)[1].lower()
            if ext not in (".spr", ".act"):
                continue
            stem = os.path.splitext(fn)[0]
            raw = None
            for enc in ("latin1", "cp1252", "cp949", "euc-kr"):
                try:
                    raw = stem.encode(enc)
                except Exception:
                    continue
                if raw in want:
                    break
                raw = None
            if raw is None:
                continue
            slug = want[raw]
            dst = os.path.join(ROOT, slug + ext)
            shutil.copyfile(os.path.join(dirpath, fn), dst)
            found.setdefault(slug, set()).add(ext)
            missing.discard(slug)

    complete = [s for s, e in found.items() if e == {".spr", ".act"}]
    partial = {s: sorted(e) for s, e in found.items() if e != {".spr", ".act"}}
    print("linked %d classes (.spr+.act) of %d" % (len(complete), len(slugs)))
    if partial:
        print("PARTIAL (missing spr or act):", partial)
    if missing:
        print("NOT FOUND (%d):" % len(missing), sorted(missing))


if __name__ == "__main__":
    main()
