"""Official consumption per car model, from the Allo Cars vehicle catalog (EEA CO2 monitoring of new cars).

The catalog is a public JSON file at cars.allo.land, refreshed monthly; this module fetches it once per process and
searches it. No MCP dependency, so it is easy to test.
"""

from __future__ import annotations

import json
import os
import re
import unicodedata
import urllib.request
from typing import Any, Callable

BASE_URL = os.environ.get("CAR_MCP_CATALOG_URL", "https://cars.allo.land/data/vehicle-catalog")
REGIONS = ("de", "eu")
FUELS = ("electric", "petrol", "diesel", "phev-petrol", "phev-diesel", "lpg", "cng", "hydrogen", "e85")


class CatalogError(Exception):
    pass


def _fetch(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": "car-mcp (+https://github.com/spikinglabs/cars)"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp)


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "", s.replace("volkswagen", "vw").replace("mercedes", "mercedesbenz").replace("benzbenz", "benz"))


class Catalog:
    def __init__(self, fetch: Callable[[str], dict] = _fetch, base_url: str = BASE_URL):
        self.fetch, self.base_url, self._cache = fetch, base_url.rstrip("/"), {}

    def load(self, region: str) -> dict:
        if region not in REGIONS:
            raise CatalogError(f"region must be one of {', '.join(REGIONS)}")
        if region not in self._cache:
            try:
                self._cache[region] = self.fetch(f"{self.base_url}/{region}/models.json")
            except Exception as e:  # network, HTTP or JSON errors all mean the same to the caller
                raise CatalogError(f"could not load the vehicle catalog: {e}") from e
        return self._cache[region]

    def search(self, query: str = "", fuel: str | None = None, region: str = "de", limit: int = 10) -> dict[str, Any]:
        data = self.load(region)
        if fuel and fuel not in FUELS:
            raise CatalogError(f"fuel must be one of {', '.join(FUELS)}")
        words = [_norm(w) for w in (query or "").split() if _norm(w)]
        hits = []
        for m in data.get("models", []):
            if fuel and m.get("fuel") != fuel:
                continue
            hay = _norm(m.get("name", "")) + _norm(m.get("make", "")) + _norm(m.get("id", ""))
            if all(w in hay for w in words):
                # an exact name match first, then the most registered
                exact = _norm(m.get("name", "")) == "".join(words) or _norm(m.get("model", "")) == "".join(words)
                hits.append((not exact, -(m.get("registrations") or 0), m))
        hits.sort(key=lambda h: (h[0], h[1]))
        return {
            "region": data.get("region"),
            "year": data.get("year"),
            "status": data.get("status"),
            "source": data.get("source"),
            "licence": data.get("licence"),
            "notes": data.get("notes"),
            "matches": len(hits),
            "models": [h[2] for h in hits[: max(1, min(limit, 50))]],
        }
