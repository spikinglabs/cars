"""Weekly fuel prices from the open data Allo Cars publishes (cars.allo.land).

National average pump prices incl. taxes from the EU Weekly Oil Bulletin, weekly since 2005, for Germany, every
EU country and the EU average. Only this lookup goes online; the logbook itself stays local.
"""

from __future__ import annotations

import csv
import io
import json
import os
import urllib.request
from typing import Any

BASE = os.environ.get("CAR_MCP_DATA_URL", "https://cars.allo.land/data").rstrip("/")
PAGE = "https://cars.allo.land/fuel-prices/"
FUELS = ("euro_super_95", "diesel", "lpg")


class FuelError(ValueError):
    pass


def _get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "car-mcp (+https://github.com/spikinglabs/cars)"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def prices(region: str = "de", fuel: str | None = None, weeks: int = 12, fetch=_get) -> dict[str, Any]:
    """This week's prices with averages, and the last `weeks` weekly prices."""
    region = (region or "de").strip().lower()
    if not (region.isalpha() and len(region) == 2):
        raise FuelError("region must be a two-letter code such as de, at, fr or eu")
    if fuel and fuel not in FUELS:
        raise FuelError(f"fuel must be one of {', '.join(FUELS)}")
    try:
        latest = json.loads(fetch(f"{BASE}/fuel-prices/{region}/latest.json"))
        rows = list(csv.DictReader(io.StringIO(fetch(f"{BASE}/fuel-prices/{region}/weekly.csv").decode())))
    except Exception as e:  # network error or 404
        raise FuelError(f"No fuel prices for region {region!r}: {e}") from e
    keep = [fuel] if fuel else list(FUELS)
    products = {k: v for k, v in latest.get("products", {}).items() if k in keep}
    n = max(1, min(int(weeks), 1200))
    history = [{"week": r["date"], **{k: (float(r[k]) if r.get(k) else None) for k in keep}} for r in rows[-n:]]
    page = PAGE + (f"?fuel={fuel}" if fuel and fuel != "euro_super_95" else "")
    if region != "de":
        page += ("&" if "?" in page else "?") + f"country={region}"
    return {
        "region": latest.get("region"), "currency": latest.get("currency"), "unit": latest.get("unit"),
        "week": latest.get("week"), "products": products, "history": history,
        "source": latest.get("source"), "licence": latest.get("licence"), "page": page,
    }
