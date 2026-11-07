"""Monthly new car registrations in Germany by model, from the open data Allo Cars publishes (cars.allo.land).

Source: Kraftfahrt-Bundesamt, FZ10 (© Kraftfahrt-Bundesamt, Flensburg, dl-de/by-2-0), every month since
December 2018. No key needed. Only this lookup goes online; the logbook itself stays local.
"""

from __future__ import annotations

import json
import re
import urllib.request
from typing import Any

BASE = "https://cars.allo.land/data/registrations/de/"
PAGE = "https://cars.allo.land/registrations/"


def _get(path: str) -> Any:
    req = urllib.request.Request(BASE + path, headers={"User-Agent": "car-mcp (+https://github.com/spikinglabs/cars)"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", (s or "").lower().replace("volkswagen", "vw").replace("mercedes-benz", "mercedes"))


def find(models: list[dict], text: str) -> dict | None:
    """Best match of free text ("my Volvo EX30 Ultra", "ex30", "VW Golf") in models.json."""
    t = _norm(text)
    if not t:
        return None
    named = [m for m in models if m["model"] != "SONSTIGE"]
    full = lambda m: _norm(f"{m['brand']} {m['model']}")
    exact = [m for m in named if m["slug"] == text.lower() or full(m) == t]
    if exact:
        return exact[0]
    inside = [m for m in named if full(m) in t]
    if inside:
        return max(inside, key=lambda m: len(full(m)))
    loose = [m for m in named if t in full(m) or _norm(m["model"]) == t]
    return max(loose, key=lambda m: m.get("last_12_months") or 0) if loose else None


def lookup(text: str | None = None, months: int = 12, get=_get) -> dict[str, Any]:
    latest = get("latest.json")
    base = {"month": latest["month"], "source": latest["source"], "licence": latest["licence"],
            "credit": latest["credit"]}
    if not text:
        return {**base, "market": latest["market"], "top_models": latest["top_models"],
                "top_electric": latest["top_electric"], "page": PAGE}
    models = get("models.json")["models"]
    m = find(models, text)
    if not m:
        return {**base, "error": f"No model matches {text!r}. Try make and model as on the registration, e.g. 'VW Golf'.",
                "models_url": BASE + "models.json"}
    data = get(m["file"])
    rows = data["months"]
    recent = rows[-max(1, months):]
    last12 = [r for r in rows if r["month"] > f"{int(latest['month'][:4]) - 1}{latest['month'][4:]}"]
    total12 = sum(r["total"] or 0 for r in last12)
    bev12 = sum(r["bev"] or 0 for r in last12)
    return {**base, "model": f"{m['brand']} {m['model']}", "slug": m["slug"], "page": f"{PAGE}?model={m['slug']}",
            "rank_latest_month": m.get("rank"), "latest_month_total": m.get("latest"),
            "last_12_months_total": total12, "last_12_months_bev_share_pct": round(bev12 / total12 * 100, 1) if total12 else None,
            "first_month": rows[0]["month"] if rows else None, "months": recent,
            "market_latest_month": latest["market"]["total"],
            "note": "Counts are new passenger car registrations in Germany per month. hybrid includes plug-in hybrids (phev)."}
