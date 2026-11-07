"""Public EV chargers near a place in Germany, from the open data Allo Cars publishes (cars.allo.land).

The data is the Bundesnetzagentur charge point register (CC BY 4.0, "Bundesnetzagentur.de"), split into
0.5 degree cells. Only this lookup goes online; the logbook itself stays local.
"""

from __future__ import annotations

import json
import math
import re
import unicodedata
import urllib.parse
import urllib.request
from functools import lru_cache
from typing import Any

BASE = "https://cars.allo.land/data/chargers/de/"
PAGE = "https://cars.allo.land/chargers/"
CELL = 0.5
PLUGS = {"type2": 1, "ccs": 2, "chademo": 4, "schuko": 8, "mcs": 16, "type1": 32}
FLAGS = {"open_24_7": 1, "free": 2, "card_payment": 4, "customers_only": 8, "plug_and_charge": 16}


def _get(path: str) -> Any:
    req = urllib.request.Request(BASE + path, headers={"User-Agent": "car-mcp (+https://github.com/spikinglabs/cars)"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


@lru_cache(maxsize=1)
def _latest() -> dict:
    return _get("latest.json")


@lru_cache(maxsize=1)
def _places() -> dict:
    return _get("places.json")


@lru_cache(maxsize=64)
def _cell(cid: str) -> dict:
    return _get(f"cells/{cid}.json")


def _fold(s: str) -> str:
    s = unicodedata.normalize("NFD", s.lower().replace("ß", "ss"))
    return re.sub(r"[^a-z0-9]+", " ", "".join(c for c in s if not unicodedata.combining(c))).strip()


def km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = math.pi / 180
    h = math.sin((lat2 - lat1) * r / 2) ** 2 + math.cos(lat1 * r) * math.cos(lat2 * r) * math.sin((lon2 - lon1) * r / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))


def locate(text: str, places: list[list]) -> dict | None:
    """A German postcode or town name -> {name, lat, lon}. places rows: [town, postcode, lat, lon, stations]."""
    t = _fold(text)
    if not t:
        return None
    pc = re.search(r"\b(\d{5})\b", t)
    if pc:
        rows = [p for p in places if p[1] == pc.group(1)]
        if rows:
            n = sum(r[4] for r in rows)
            return {"name": f"{pc.group(1)} {rows[0][0]}", "lat": sum(r[2] * r[4] for r in rows) / n, "lon": sum(r[3] * r[4] for r in rows) / n}
    words = re.sub(r"\d+", " ", t).strip()
    for match in (lambda f: f == words, lambda f: f.startswith(words), lambda f: words in f):
        rows = [p for p in places if match(_fold(p[0]))]
        if rows:
            # The biggest town of that name; postcode areas of one town lie within its two-digit region.
            best: dict[tuple, list] = {}
            for r in rows:
                best.setdefault((r[0], r[1][:2]), []).append(r)
            group = max(best.values(), key=lambda g: sum(r[4] for r in g))
            n = sum(r[4] for r in group)
            return {"name": group[0][0], "lat": sum(r[2] * r[4] for r in group) / n, "lon": sum(r[3] * r[4] for r in group) / n}
    return None


def cells_around(lat: float, lon: float, radius_km: float) -> list[str]:
    dlat = radius_km / 111.0
    dlon = radius_km / (111.0 * max(0.2, math.cos(math.radians(lat))))
    return [f"{a}_{o}"
            for a in range(math.floor((lat - dlat) / CELL), math.floor((lat + dlat) / CELL) + 1)
            for o in range(math.floor((lon - dlon) / CELL), math.floor((lon + dlon) / CELL) + 1)]


def search(cells: list[dict], lat: float, lon: float, *, radius_km: float = 10, min_kw: float = 0,
           plugs: list[str] | None = None, only: list[str] | None = None, limit: int = 10) -> list[dict]:
    want_plug = sum(PLUGS[p] for p in plugs or [] if p in PLUGS)
    out = []
    for c in cells:
        f = {k: i for i, k in enumerate(c["fields"])}
        for r in c["stations"]:
            if r[f["kw"]] < min_kw or (want_plug and not r[f["plugs"]] & want_plug):
                continue
            flags = r[f["flags"]]
            if any((o == "no_customers_only" and flags & FLAGS["customers_only"]) or
                   (o in FLAGS and o != "customers_only" and not flags & FLAGS[o]) for o in only or []):
                continue
            d = km(lat, lon, r[f["lat"]], r[f["lon"]])
            if d > radius_km:
                continue
            out.append({
                "distance_km": round(d, 2),
                "operator": c["operators"][r[f["operator"]]],
                "name": r[f["name"]] or None,
                "address": r[f["address"]],
                "max_kw": r[f["kw"]],
                "charge_points": r[f["points"]],
                "dc_points": r[f["dc_points"]],
                "plugs": [k for k, v in PLUGS.items() if r[f["plugs"]] & v],
                **{k: bool(flags & v) for k, v in FLAGS.items()},
                "since": r[f["since"]],
                "lat": r[f["lat"]],
                "lon": r[f["lon"]],
                "directions": f"https://www.google.com/maps/dir/?api=1&destination={r[f['lat']]},{r[f['lon']]}",
            })
    out.sort(key=lambda s: s["distance_km"])
    return out[:limit]


def lookup(near: str | None = None, lat: float | None = None, lon: float | None = None, *, radius_km: float = 10,
           min_kw: float = 0, plugs: list[str] | None = None, only: list[str] | None = None, limit: int = 10) -> dict[str, Any]:
    place = None
    if lat is None or lon is None:
        if not near:
            raise ValueError("Give a town or postcode in Germany (near), or lat and lon.")
        place = locate(near, _places()["places"])
        if not place:
            raise ValueError(f"No town or postcode {near!r} found in the charger register. Try a postcode, or pass lat and lon.")
        lat, lon = place["lat"], place["lon"]
    radius_km = max(0.5, min(radius_km, 50))
    known = set(_latest().get("cells", []))
    cells = [_cell(c) for c in cells_around(lat, lon, radius_km) if c in known]
    found = search(cells, lat, lon, radius_km=radius_km, min_kw=min_kw, plugs=plugs, only=only, limit=max(1, min(limit, 50)))
    q = {"lat": f"{lat:.4f}", "lon": f"{lon:.4f}", "z": 13 if radius_km <= 5 else 12 if radius_km <= 12 else 11}
    if min_kw:
        q["kw"] = 150 if min_kw >= 150 else 50 if min_kw >= 50 else 11 if min_kw >= 11 else 0
    if plugs:
        q["plug"] = ",".join(p for p in plugs if p in ("type2", "ccs", "chademo"))
    latest = _latest()
    return {
        "centre": {"name": place["name"] if place else None, "lat": round(lat, 5), "lon": round(lon, 5)},
        "radius_km": radius_km,
        "chargers": found,
        "map": PAGE + "?" + urllib.parse.urlencode({k: v for k, v in q.items() if v}),
        "register_date": latest.get("observed_at"),
        "source": "Bundesnetzagentur Ladesäulenregister (CC BY 4.0, Bundesnetzagentur.de) via cars.allo.land",
        "note": "Distances are straight-line. Only chargers whose operators completed the Bundesnetzagentur "
                "notification are listed. No live availability or prices.",
    }
