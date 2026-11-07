"""Weekly fuel prices and their 8-week forecast, from the open data Allo Cars publishes (cars.allo.land).

National averages from the EU Weekly Oil Bulletin; the forecast and its backtest are made by the Allo Cars
pipeline (pipelines/price_forecast). Only this lookup goes online; the logbook itself stays local.
"""

from __future__ import annotations

import json
import os
import urllib.request
from typing import Any

BASE = os.environ.get("CAR_MCP_DATA_URL", "https://cars.allo.land/data").rstrip("/")
PAGE = "https://cars.allo.land/fuel-prices/"


class FuelError(ValueError):
    pass


def _get(url: str) -> Any:
    req = urllib.request.Request(url, headers={"User-Agent": "car-mcp (+https://github.com/spikinglabs/cars)"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def forecast(region: str = "de", fuel: str | None = None, fetch=_get) -> dict[str, Any]:
    region = (region or "de").strip().lower()
    if not (region.isalpha() and len(region) == 2):
        raise FuelError("region must be a two-letter code such as de, at, fr or eu")
    try:
        fc = fetch(f"{BASE}/fuel-prices/{region}/forecast.json")
    except Exception as e:  # network error or 404
        raise FuelError(f"No fuel price forecast for region {region!r}: {e}") from e
    products = fc.get("products", {})
    if fuel:
        if fuel not in products:
            raise FuelError(f"No forecast for {fuel!r} in {region}; available: {sorted(products)}")
        products = {fuel: products[fuel]}
    page = PAGE + (f"?fuel={fuel}" if fuel and fuel != "euro_super_95" else "")
    if region != "de":
        page += ("&" if "?" in page else "?") + f"country={region}"
    return {
        "region": fc.get("region"), "currency": fc.get("currency"), "unit": fc.get("unit"),
        "made_at": fc.get("observed_at"), "products": products, "method": fc.get("method"),
        "notes": fc.get("notes"), "source": fc.get("source"), "licence": fc.get("licence"), "page": page,
    }
