"""Official recalls for a car model or brand, from the open data Allo Cars publishes (cars.allo.land).

EU Safety Gate motor vehicle alerts (Germany's KBA reports there too) and US NHTSA campaigns. No key needed;
the files are refreshed daily. Only this lookup goes online; the logbook itself stays local.
"""

from __future__ import annotations

import json
import re
import urllib.request
from typing import Any

BASE = "https://cars.allo.land/data/recalls/"
PAGE = "https://cars.allo.land/recalls/"


def _get(path: str) -> Any:
    req = urllib.request.Request(BASE + path, headers={"User-Agent": "car-mcp (+https://github.com/spikinglabs/cars)"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", (s or "").lower().replace("volkswagen", "vw"))


def find(items: list[dict], text: str, key: str) -> dict | None:
    """Best match of free text ("my Volvo EX30 Ultra", "ex30", "Volkswagen") in a models or brands list."""
    t = _norm(text)
    if not t:
        return None
    exact = [i for i in items if _norm(i[key]) == t or i["slug"] == text.lower()]
    if exact:
        return exact[0]
    inside = [i for i in items if _norm(i[key]) and _norm(i[key]) in t]
    if inside:
        return max(inside, key=lambda i: len(_norm(i[key])))
    contains = [i for i in items if t in _norm(i[key])]
    return contains[0] if len(contains) == 1 else None


def lookup(text: str, limit: int = 10, get=_get) -> dict[str, Any]:
    models = get("eu/models.json")["models"]
    m = find(models, text, "model")
    if m:
        eu = get(f"eu/{m['file']}")["alerts"]
        us = None
        if m.get("us_file"):
            try:
                us = get(f"us/models/{m['slug']}.json")["campaigns"]
            except Exception:
                us = None
        return {"model": m["model"], "page": f"{PAGE}?model={m['slug']}", "eu_alerts": len(eu), "eu": eu[:limit],
                "us_campaigns": None if us is None else len(us), "us": (us or [])[:limit],
                "note": "Whether a particular car is affected depends on its VIN; the maker or dealer can check it."}
    brands = get("eu/brands.json")["brands"]
    b = find(brands, text, "brand")
    if b:
        eu = get(f"eu/{b['file']}")["alerts"]
        return {"brand": b["brand"], "page": f"{PAGE}?brand={b['slug']}", "eu_alerts": len(eu), "eu": eu[:limit],
                "note": "Brand-wide list, including motorcycles and commercial vehicles. Name the model for US data."}
    return {"error": f"No followed model or brand matches {text!r}.",
            "models": [x["model"] for x in models], "brands_url": BASE + "eu/brands.json"}
