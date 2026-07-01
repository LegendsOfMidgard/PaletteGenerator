# -*- coding: utf-8 -*-
"""Curated class whitelist for the palette editor.

Keyed by the Korean class token (gender suffix 남/여 stripped) ->
  (displayName, group)  group in {"1st", "2nd", "rebirth", "expanded"}.

Only 1st / 2nd / rebirth (transcendent) / expanded classes are kept.
Mounts, costumes, monsters, fusions, and 3rd/4th jobs are intentionally omitted.

Match is EXACT on the stripped Korean base, so mounted/fused variants
(검사페코, 권성융합, 여우위저드, 무희바지 ...) never match a base class.
"""

GROUP_ORDER = ["1st", "2nd", "rebirth", "expanded"]

CLASS_MAP = {
    # --- 1st job ---
    "초보자": ("Novice", "1st"),
    "검사": ("Swordman", "1st"),
    "마법사": ("Mage", "1st"),
    "궁수": ("Archer", "1st"),
    "복사": ("Acolyte", "1st"),          # may be absent from the repaint table
    "상인": ("Merchant", "1st"),
    "도둑": ("Thief", "1st"),

    # --- 2nd job ---
    "기사": ("Knight", "2nd"),
    "크루": ("Crusader", "2nd"),
    "위저드": ("Wizard", "2nd"),
    "세이지": ("Sage", "2nd"),
    "헌터": ("Hunter", "2nd"),
    "바드": ("Bard", "2nd"),
    "무희": ("Dancer", "2nd"),
    "프리스트": ("Priest", "2nd"),
    "몽크": ("Monk", "2nd"),
    "제철공": ("Blacksmith", "2nd"),
    "연금술사": ("Alchemist", "2nd"),
    "어세신": ("Assassin", "2nd"),
    "로그": ("Rogue", "2nd"),

    # --- rebirth (transcendent) ---
    "로드나이트": ("Lord Knight", "rebirth"),
    "팔라딘": ("Paladin", "rebirth"),
    "하이위저드": ("High Wizard", "rebirth"),
    "프로페서": ("Professor", "rebirth"),
    "스나이퍼": ("Sniper", "rebirth"),
    "민스트럴": ("Clown", "rebirth"),   # client token 민스트럴 = our Clown roster slot (sprite=clown_m)
    "집시": ("Gypsy", "rebirth"),
    "하이프리스트": ("High Priest", "rebirth"),
    "챔피온": ("Champion", "rebirth"),
    "화이트스미스": ("Whitesmith", "rebirth"),
    "크리에이터": ("Creator", "rebirth"),
    "어세신크로스": ("Assassin Cross", "rebirth"),
    "스토커": ("Stalker", "rebirth"),

    # --- expanded ---
    "슈퍼노비스": ("Super Novice", "expanded"),
    "태권소년": ("TaeKwon", "expanded"),
    "권성": ("Star Gladiator", "expanded"),
    "소울링커": ("Soul Linker", "expanded"),
    "건너": ("Gunslinger", "expanded"),
    "닌자": ("Ninja", "expanded"),
}
