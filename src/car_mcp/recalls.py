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


# ---------- used-car check and statistics (same rules as the recalls page) ----------

ASK = [
    "Ask for the VIN (17 characters, on the registration certificate) and have a dealer of the brand check it for "
    "open recalls and service campaigns; it is free.",
    "Look for the recall codes in the service book or invoices. Recall work is free, so an honest seller has proof.",
    "Ask whether a recall letter came from the maker or, in Germany, the KBA (it writes to keepers and can take cars "
    "off the road when recalls are ignored).",
    "Imported from the US? Check the VIN at https://www.nhtsa.gov/recalls too.",
    "Without proof, make the completed recall work a condition in the sales contract.",
]
ASK_FIRE = ("Fire risk: ask whether interim advice applies until the fix (parking outside, charging limits) and "
            "whether the fix is done.")
ASK_HV = ("High-voltage battery: ask whether the battery or modules were replaced or only the software updated, and "
          "see the battery health (SoH).")
ASK_AIRBAG = "Airbags: get the replacement confirmed in writing; some recalls advise not to drive until then."


def _parts(alert: dict, brand: str) -> list[str]:
    """Model names in an alert. Safety Gate often leaves the model field empty and names the model in the type field
    ("EX30 / EX30CC"); type-approval numbers (e9*2018/858*...) are skipped."""
    bn = _norm(brand)
    text = ", ".join(x for x in (alert.get("models"), alert.get("type_approval")) if x)
    text = re.sub(r"\([^)]*\)", " ", text.replace("&amp;", "&"))
    out = []
    for p in re.split(r"\s*(?:[,;/+&]|\band\b)\s*", text, flags=re.I):
        p = re.sub(r"^" + re.escape(brand) + r"\s+", "", p.strip(), flags=re.I)
        if p and len(p) <= 40 and "*" not in p and not re.match(r"e\d", p, re.I) and _norm(p) and _norm(p) != bn:
            out.append(p)
    return out


def build_window(production: str | None) -> tuple[int, int] | None:
    """First and last production year named in a Safety Gate production field ("12.09.2022 - 16.05.2024")."""
    years = [int(y) for y in re.findall(r"(?:19|20)\d\d", production or "")]
    return (min(years), max(years)) if years else None


def fits_year(alert: dict, year: int) -> bool | None:
    """Whether a car first registered in `year` (so built that year or the one before) is in the build window.
    None when the alert states no production dates."""
    w = build_window(alert.get("production"))
    return None if w is None else w[0] <= year and year - 1 <= w[1]


def _brand(text: str, brands: list[dict]) -> tuple[dict | None, str]:
    """The brand named at the start of free text, and the rest (the model)."""
    words = text.split()
    for n in range(min(3, len(words)), 0, -1):
        t = _norm(" ".join(words[:n]))
        b = next((b for b in brands if _norm(b["brand"]) == t or _norm(b["slug"]) == t), None)
        if b:
            return b, " ".join(words[n:])
    return find(brands, text, "brand"), ""


def used_car_check(make: str, model: str | None = None, year: int | None = None, limit: int = 20,
                   get=_get) -> dict[str, Any]:
    brands = get("eu/brands.json")["brands"]
    b, rest = _brand(f"{make} {model or ''}".strip(), brands)
    if not b:
        return {"error": f"No brand matches {make!r}.", "brands_url": BASE + "eu/brands.json"}
    model = (model or rest or "").strip()
    alerts = get(f"eu/{b['file']}")["alerts"]
    key = _norm(re.sub(r"^" + re.escape(b["brand"]) + r"\s+", "", model, flags=re.I)) if model else ""
    named = [a for a in alerts if not key or any(_norm(p).startswith(key) for p in _parts(a, b["brand"]))]
    hits = [a for a in named if not year or fits_year(a, year) is not False]
    for a in hits:
        a["build_window_matches"] = None if not year else fits_year(a, year)
    us = None
    if key:
        followed = get("eu/models.json")["models"]
        f = find(followed, f"{b['brand']} {model}", "model")
        if f and f.get("us_file") and _norm(f["model"]).endswith(key):
            try:
                us = get(f"us/models/{f['slug']}.json")["campaigns"]
                if year:
                    us = [c for c in us if any(abs(int(y) - year) <= 1 for y in c.get("model_years") or [])]
            except Exception:
                us = None
    ask = list(ASK)
    if any("fire" in (a.get("risk") or "").lower() for a in hits):
        ask.insert(3, ASK_FIRE)
    if any(a.get("component") == "hv_battery" for a in hits):
        ask.insert(3, ASK_HV)
    if any(a.get("component") == "airbags_belts" for a in hits):
        ask.insert(3, ASK_AIRBAG)
    q = {"brand": b["slug"], **({"model": key} if key else {}), **({"year": year} if year else {})}
    return {
        "brand": b["brand"], "model": model or None, "first_registered": year,
        "page": PAGE + "?" + "&".join(f"{k}={v}" for k, v in q.items()),
        "eu_alerts": len(hits), "eu_alerts_other_build_years": len(named) - len(hits),
        "recall_codes": sorted({a["recall_code"] for a in hits if a.get("recall_code")}),
        "eu": hits[:limit], "us_campaigns": None if us is None else len(us), "us": (us or [])[:limit],
        "ask_the_seller": ask,
        "note": "Build window: a car is usually built in the year of first registration or the year before; alerts "
                "without production dates are kept. Whether this car is affected, and whether it was fixed, depends "
                "on its VIN.",
    }


def statistics(brand: str | None = None, get=_get) -> dict[str, Any]:
    s = get("eu/stats.json")
    out = {k: s.get(k) for k in ("since", "notes", "years", "registrations_until", "notified_by")}
    out["components"] = [{k: c[k] for k in ("key", "label_en", "cars", "all", "cars_last_365_days")} for c in s["components"]]
    ranked = sorted((b for b in s["brands"] if b.get("alerts_per_100k") is not None), key=lambda b: -b["alerts_per_100k"])
    out["brands_per_100k_new_cars"] = ranked
    out["brands_by_count"] = s["brands"][:25]
    if brand:
        b = find(s["brands"], brand, "brand")
        out["brand"] = b and {**b, "rank_per_100k": next((i + 1 for i, x in enumerate(ranked) if x is b), None),
                              "ranked_brands": len(ranked)}
    out["page"] = PAGE + "#stats"
    return out
