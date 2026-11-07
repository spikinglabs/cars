"""Turn Allo Outings' open places and events into small files for the charger map.

Allo Outings (https://outings.allo.land, a sister site) publishes every kid-friendly place and
upcoming family event as JSON (/api/v1/places.json, /api/v1/events.json). The charger map shows
them next to chargers ("charge while the kids play"), so it needs them split into the same
0.5 by 0.5 degree cells as the chargers (see pipelines/chargers/build.py):

    cells/<id>.json   places and events in one cell, id = "<floor(lat*2)>_<floor(lon*2)>"

Each cell file lists field names once and then one array per row, like the charger cells.
"""

from __future__ import annotations

import math
import re
from datetime import date, timedelta

CELL = 0.5  # degrees, same as the charger cells
EVENT_DAYS = 14  # events that run on any day from today to this many days ahead
KINDS = ["playground", "park", "pool", "farm", "zoo", "museum", "indoor", "fun", "cafe", "winter"]
PLACE_FIELDS = ["lat", "lon", "kind", "id", "name", "name_zh", "town", "free", "indoor", "hours"]
EVENT_FIELDS = ["lat", "lon", "id", "start", "end", "time", "title_de", "title_en", "title_zh", "venue", "town", "tags", "free"]
# Places and events here are in Germany; anything outside this box is a geocoding slip.
BOX = (47.0, 55.5, 5.5, 15.5)
HHMM = re.compile(r"^\d{1,2}:\d{2}(\s*[-–]\s*\d{1,2}:\d{2})?$")


def cell_id(lat: float, lon: float) -> str:
    return f"{math.floor(lat / CELL)}_{math.floor(lon / CELL)}"


def _geo(rec: dict, ok: tuple[str, ...]) -> tuple[float, float] | None:
    g = rec.get("geo") or {}
    lat, lon = g.get("lat"), g.get("lon")
    if not isinstance(lat, (int, float)) or not isinstance(lon, (int, float)):
        return None
    if g.get("precision") not in ok:
        return None
    if not (BOX[0] <= lat <= BOX[1] and BOX[2] <= lon <= BOX[3]):
        return None
    return round(lat, 5), round(lon, 5)


def _flag(v) -> int | None:
    return None if v is None else int(bool(v))


def place_row(p: dict) -> list | None:
    ll = _geo(p, ("exact",))
    if not ll or p.get("kind") not in KINDS or not p.get("id") or not p.get("name"):
        return None
    zh = (p.get("names") or {}).get("zh") or ""
    hours = p.get("hours") or ""
    return [ll[0], ll[1], p["kind"], p["id"], p["name"], zh if zh != p["name"] else "",
            p.get("town") or "", _flag(p.get("free")), _flag(p.get("indoor")), hours if len(hours) <= 120 else ""]


def event_row(e: dict, today: date) -> list | None:
    ll = _geo(e, ("exact", "venue"))
    if not ll or not e.get("id"):
        return None
    start, end = e.get("start") or "", e.get("end") or e.get("start") or ""
    if not start or end < today.isoformat() or start > (today + timedelta(days=EVENT_DAYS)).isoformat():
        return None
    t = e.get("title") or {}
    if isinstance(t, str):
        t = {"de": t}
    title_de = t.get("de") or t.get("en") or ""
    if not title_de:
        return None
    time = (e.get("time") or "").strip()
    price = e.get("price") or {}
    return [ll[0], ll[1], e["id"], start, end, time if HHMM.match(time) else "", title_de,
            t.get("en") if t.get("en") and t.get("en") != title_de else "",
            t.get("zh") or "", (e.get("venue") or "")[:120], e.get("town") or "",
            [x for x in e.get("tags") or [] if isinstance(x, str)], _flag(price.get("free")) if isinstance(price, dict) else None]


def cells(places: list[dict], events: list[dict], today: date) -> dict[str, dict]:
    out: dict[str, dict] = {}

    def slot(lat: float, lon: float) -> dict:
        cid = cell_id(lat, lon)
        if cid not in out:
            out[cid] = {"place_fields": PLACE_FIELDS, "places": [], "event_fields": EVENT_FIELDS, "events": []}
        return out[cid]

    seen = set()
    for p in places:
        r = place_row(p)
        if r and r[3] not in seen:
            seen.add(r[3])
            slot(r[0], r[1])["places"].append(r)
    seen = set()
    for e in events:
        r = event_row(e, today)
        if r and r[2] not in seen:
            seen.add(r[2])
            slot(r[0], r[1])["events"].append(r)
    for c in out.values():
        c["places"].sort(key=lambda r: (r[0], r[1]))
        c["events"].sort(key=lambda r: (r[3], r[0], r[1]))
    return out


def summary(cs: dict[str, dict]) -> dict:
    kinds: dict[str, int] = {}
    for c in cs.values():
        for r in c["places"]:
            kinds[r[2]] = kinds.get(r[2], 0) + 1
    return {
        "places": sum(len(c["places"]) for c in cs.values()),
        "events": sum(len(c["events"]) for c in cs.values()),
        "places_by_kind": dict(sorted(kinds.items(), key=lambda kv: -kv[1])),
    }
