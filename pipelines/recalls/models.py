"""Models Allo Cars follows by name: the cars in the charging cost tool and the fuel cars it compares with.

Each gets its own recall file, matched in Safety Gate by brand and model name, and in the US (NHTSA) by make and
model where the car is sold there. Safety Gate writes models loosely ("Atlas, Tiguan Allspace", "ID.4 GTX"), so
names are regular expressions over the brand and model fields.
"""

from __future__ import annotations

import re

# slug, label, Safety Gate brand pattern, Safety Gate model pattern, NHTSA (make, model) or None
MODELS = [
    ("volvo-ex30", "Volvo EX30", r"volvo", r"\bEX\s?30\b", ("volvo", "ex30")),
    ("tesla-model-3", "Tesla Model 3", r"tesla", r"model\s?3\b", ("tesla", "model 3")),
    ("tesla-model-y", "Tesla Model Y", r"tesla", r"model\s?y\b", ("tesla", "model y")),
    ("vw-id3", "VW ID.3", r"volkswagen|\bvw\b", r"\bID\.?\s?3\b", None),
    ("vw-id4", "VW ID.4", r"volkswagen|\bvw\b", r"\bID\.?\s?4\b", ("volkswagen", "id.4")),
    ("vw-id7", "VW ID.7", r"volkswagen|\bvw\b", r"\bID\.?\s?7\b", None),
    ("skoda-elroq", "Skoda Elroq", r"skoda|škoda", r"elroq", None),
    ("skoda-enyaq", "Skoda Enyaq", r"skoda|škoda", r"enyaq", None),
    ("cupra-born", "Cupra Born", r"cupra|seat", r"\bborn\b", None),
    ("bmw-ix1", "BMW iX1", r"\bbmw\b", r"\biX1\b", None),
    ("bmw-i4", "BMW i4", r"\bbmw\b", r"\bi4\b", ("bmw", "i4")),
    ("mercedes-eqa", "Mercedes EQA", r"mercedes", r"\bEQA\b", None),
    ("audi-q4-e-tron", "Audi Q4 e-tron", r"\baudi\b", r"\bQ4\b", ("audi", "q4 e-tron")),
    ("hyundai-ioniq-5", "Hyundai Ioniq 5", r"hyundai", r"ioniq\s?5", ("hyundai", "ioniq 5")),
    ("hyundai-ioniq-6", "Hyundai Ioniq 6", r"hyundai", r"ioniq\s?6", ("hyundai", "ioniq 6")),
    ("hyundai-kona", "Hyundai Kona", r"hyundai", r"\bkona\b", ("hyundai", "kona electric")),
    ("kia-ev3", "Kia EV3", r"\bkia\b", r"\bEV\s?3\b", None),
    ("kia-ev6", "Kia EV6", r"\bkia\b", r"\bEV\s?6\b", ("kia", "ev6")),
    ("renault-5", "Renault 5 E-Tech", r"renault", r"\bR?5\b.*e-?tech|renault 5", None),
    ("renault-megane-e-tech", "Renault Megane E-Tech", r"renault", r"m[eé]gane", None),
    ("fiat-500e", "Fiat 500e", r"\bfiat\b", r"\b500\s?e\b|500 electric", ("fiat", "500e")),
    ("polestar-2", "Polestar 2", r"polestar", r"\b2\b|polestar 2", ("polestar", "polestar 2")),
    ("byd-dolphin", "BYD Dolphin", r"\bbyd\b", r"dolphin", None),
    ("mg4", "MG4", r"\bmg\b|saic", r"\bMG\s?4\b", None),
    ("vw-golf", "VW Golf", r"volkswagen|\bvw\b", r"\bgolf\b", ("volkswagen", "golf gti")),
    ("vw-t-roc", "VW T-Roc", r"volkswagen|\bvw\b", r"t-?roc", None),
    ("vw-tiguan", "VW Tiguan", r"volkswagen|\bvw\b", r"tiguan", ("volkswagen", "tiguan")),
    ("vw-passat", "VW Passat", r"volkswagen|\bvw\b", r"passat", None),
    ("opel-corsa", "Opel Corsa", r"\bopel\b|vauxhall", r"corsa", None),
    ("skoda-octavia", "Skoda Octavia", r"skoda|škoda", r"octavia", None),
    ("mazda-cx-30", "Mazda CX-30", r"mazda", r"\bCX-?30\b", ("mazda", "cx-30")),
    ("mazda-cx-5", "Mazda CX-5", r"mazda", r"\bCX-?5\b", ("mazda", "cx-5")),
]


def matches(model: tuple, recall: dict) -> bool:
    _, _, brand_re, model_re, _ = model
    brand = recall.get("brand") or ""
    text = " ".join(x for x in (recall.get("models"), recall.get("type_approval")) if x)
    return bool(re.search(brand_re, brand, re.I) and re.search(model_re, text, re.I))
