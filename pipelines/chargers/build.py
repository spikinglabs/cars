"""Turn register rows into the small static files the charger map loads.

Devices at the same coordinates are merged into one station. Stations are split into
0.5 by 0.5 degree cells, so the map only loads the part of the country you look at:

    latest.json      counts and where the data comes from
    overview.json    station counts on a 0.1 degree grid, for the zoomed-out map
    cells/<id>.json  every station in one cell, id = "<floor(lat*2)>_<floor(lon*2)>"
    places.json      postcode and town centres, for the search box
    stations.csv     every station in one table
"""

from __future__ import annotations

import csv
import io
import math
import re
from collections import Counter, defaultdict

CELL = 0.5  # degrees, detail files
GRID = 0.1  # degrees, overview

# Plug bits, in the order the map's filter lists them.
PLUGS = {"type2": 1, "ccs": 2, "chademo": 4, "schuko": 8, "mcs": 16, "type1": 32}
# Station flags.
FLAGS = {"24/7": 1, "free": 2, "card": 4, "customers_only": 8, "plug_and_charge": 16}
FIELDS = ["lat", "lon", "kw", "points", "dc_points", "plugs", "operator", "name", "address", "flags", "since"]


def _num(v: str) -> float | None:
    v = (v or "").strip().replace(",", ".")
    try:
        return float(v)
    except ValueError:
        return None


def plug_bits(text: str) -> int:
    t = text.lower()
    bits = 0
    if "typ 2" in t:
        bits |= PLUGS["type2"]
    if "ccs" in t or "combo" in t:
        bits |= PLUGS["ccs"]
    if "chademo" in t:
        bits |= PLUGS["chademo"]
    if "schuko" in t:
        bits |= PLUGS["schuko"]
    if "mcs" in t or "megawatt" in t:
        bits |= PLUGS["mcs"]
    if "typ 1" in t:
        bits |= PLUGS["type1"]
    return bits


def is_dc(point: dict) -> bool:
    return (point.get("plug") or "").lstrip().upper().startswith("DC") or "ccs" in (point.get("plug") or "").lower()


def year_of(v: str) -> int | None:
    m = re.search(r"(\d{4})", v or "")
    return int(m.group(1)) if m else None


def device_flags(r: dict) -> int:
    f = 0
    if r.get("Öffnungszeiten") == "247":
        f |= FLAGS["24/7"]
    pay = (r.get("Bezahlsysteme") or "").lower()
    if "kostenlos" in pay:
        f |= FLAGS["free"]
    if "kreditkarte" in pay or "debitkarte" in pay:
        f |= FLAGS["card"]
    if "plug & charge" in pay or "plug&charge" in pay:
        f |= FLAGS["plug_and_charge"]
    if "kunden" in (r.get("Informationen zum Parkraum") or "").lower():
        f |= FLAGS["customers_only"]
    return f


def postcode(r: dict) -> str:
    """German postcodes have five digits; the XLSX file stores them as numbers, so 01067 arrives as 1067."""
    pc = (r.get("Postleitzahl") or "").strip()
    return pc.zfill(5) if pc.isdigit() else pc


def address(r: dict) -> str:
    street = " ".join(x for x in (r.get("Straße"), r.get("Hausnummer")) if x).strip()
    town = " ".join(x for x in (postcode(r), r.get("Ort")) if x).strip()
    return ", ".join(x for x in (street, town) if x)


def stations(rows: list[dict]) -> list[dict]:
    """Merge devices at the same place (coordinates rounded to about 10 m) into stations."""
    groups: dict[tuple, list[dict]] = defaultdict(list)
    for r in rows:
        lat, lon = _num(r.get("Breitengrad")), _num(r.get("Längengrad"))
        if lat is None or lon is None or not (47 <= lat <= 55.2 and 5.5 <= lon <= 15.5):
            continue  # outside Germany or swapped coordinates
        r = {**r, "_lat": lat, "_lon": lon}
        groups[(round(lat, 4), round(lon, 4))].append(r)
    out = []
    for devs in groups.values():
        lat = round(sum(d["_lat"] for d in devs) / len(devs), 5)
        lon = round(sum(d["_lon"] for d in devs) / len(devs), 5)
        points = [p for d in devs for p in d["points"]]
        n_points = sum(int(_num(d.get("Anzahl Ladepunkte")) or 0) for d in devs) or len(points)
        kws = [_num(p.get("kw")) or 0 for p in points] + [_num(d.get("Nennleistung Ladeeinrichtung [kW]")) or 0 for d in devs]
        # Some devices list the combined power of all their points; a single point never exceeds 1.2 MW.
        point_kw = [k for k in (_num(p.get("kw")) or 0 for p in points) if k]
        kw = max(point_kw) if point_kw else max(kws or [0])
        ops = Counter((d.get("Anzeigename (Karte)") or d.get("Betreiber") or "").strip() for d in devs)
        names = Counter(d.get("Standortbezeichnung", "").strip() for d in devs if d.get("Standortbezeichnung", "").strip())
        flags = 0
        for d in devs:
            flags |= device_flags(d)
        years = [y for y in (year_of(d.get("Inbetriebnahmedatum")) for d in devs) if y]
        first = devs[0]
        out.append(
            {
                "lat": lat,
                "lon": lon,
                "kw": round(min(kw, 1200), 1),
                "points": n_points,
                "dc_points": sum(1 for p in points if is_dc(p)),
                "plugs": _or(plug_bits(p.get("plug", "")) for p in points),
                "operator": ops.most_common(1)[0][0],
                "name": names.most_common(1)[0][0] if names else "",
                "address": address(first),
                "postcode": postcode(first),
                "town": first.get("Ort", ""),
                "state": first.get("Bundesland", ""),
                "flags": flags,
                "since": min(years) if years else None,
                "devices": len(devs),
            }
        )
    out.sort(key=lambda s: (s["lat"], s["lon"]))
    return out


def misplaced(sts: list[dict], max_km: float = 25.0) -> list[dict]:
    """Stations far from the other stations of their postcode.

    Some entries carry placeholder coordinates (a city centre, or a different town) instead of their
    address. A postcode area is a few km across, so anything more than max_km from the median of its
    postcode's stations is almost surely in the wrong place. Postcodes with fewer than 3 stations are
    not checked.
    """
    by_pc: dict[str, list[dict]] = defaultdict(list)
    by_area: dict[str, list[dict]] = defaultdict(list)
    for s in sts:
        if len(s["postcode"]) == 5:
            by_pc[s["postcode"]].append(s)
            by_area[s["postcode"][:2]].append(s)

    def median(items):
        n = len(items) // 2
        return sorted(i["lat"] for i in items)[n], sorted(i["lon"] for i in items)[n]

    centre = {pc: median(items) for pc, items in by_pc.items() if len(items) >= 3}
    area = {a: median(items) for a, items in by_area.items() if len(items) >= 10}
    bad = []
    for s in sts:
        pc = s["postcode"]
        if pc in centre:
            far = km(s["lat"], s["lon"], *centre[pc]) > max_km
        elif pc[:2] in area:
            # Too few stations in the postcode: compare with its two-digit postcode region instead.
            far = km(s["lat"], s["lon"], *area[pc[:2]]) > 4 * max_km
        else:
            far = False
        if far:
            bad.append(s)
    return bad


def km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = math.pi / 180
    h = math.sin((lat2 - lat1) * r / 2) ** 2 + math.cos(lat1 * r) * math.cos(lat2 * r) * math.sin((lon2 - lon1) * r / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))


def _or(values) -> int:
    bits = 0
    for v in values:
        bits |= v
    return bits


def _kw(v: float):
    return int(v) if float(v).is_integer() else v


def cell_id(lat: float, lon: float) -> str:
    return f"{math.floor(lat / CELL)}_{math.floor(lon / CELL)}"


def cells(sts: list[dict]) -> dict[str, dict]:
    by: dict[str, list[dict]] = defaultdict(list)
    for s in sts:
        by[cell_id(s["lat"], s["lon"])].append(s)
    out = {}
    for cid, items in by.items():
        ops = sorted({s["operator"] for s in items})
        idx = {o: i for i, o in enumerate(ops)}
        a, b = (int(x) for x in cid.split("_"))
        out[cid] = {
            "cell": cid,
            "bbox": [b * CELL, a * CELL, (b + 1) * CELL, (a + 1) * CELL],
            "fields": FIELDS,
            "operators": ops,
            "stations": [
                [s["lat"], s["lon"], _kw(s["kw"]), s["points"], s["dc_points"], s["plugs"], idx[s["operator"]],
                 s["name"], s["address"], s["flags"], s["since"]]
                for s in items
            ],
        }
    return out


def overview(sts: list[dict]) -> dict:
    """Counts on a 0.1 degree grid, placed at the mean position of the stations in each square."""
    acc: dict[tuple, list] = {}
    for s in sts:
        k = (math.floor(s["lat"] / GRID), math.floor(s["lon"] / GRID))
        a = acc.setdefault(k, [0.0, 0.0, 0, 0, 0, 0])
        a[0] += s["lat"]
        a[1] += s["lon"]
        a[2] += 1
        a[3] += s["points"]
        a[4] += 1 if s["kw"] >= 50 else 0
        a[5] += 1 if s["kw"] >= 150 else 0
    rows = [[round(a[0] / a[2], 3), round(a[1] / a[2], 3), a[2], a[3], a[4], a[5]] for a in acc.values()]
    rows.sort()
    return {"grid_degrees": GRID, "fields": ["lat", "lon", "stations", "points", "fast_50kw", "hpc_150kw"], "squares": rows}


def places(sts: list[dict]) -> dict:
    """Postcode + town centres (mean of their stations), for searching without a geocoding service."""
    acc: dict[tuple, list] = {}
    for s in sts:
        if not s["town"]:
            continue
        k = (s["postcode"], s["town"])
        a = acc.setdefault(k, [0.0, 0.0, 0])
        a[0] += s["lat"]
        a[1] += s["lon"]
        a[2] += 1
    rows = [[town, pc, round(a[0] / a[2], 4), round(a[1] / a[2], 4), a[2]] for (pc, town), a in acc.items()]
    rows.sort(key=lambda r: (r[0].lower(), r[1]))
    return {"fields": ["town", "postcode", "lat", "lon", "stations"], "places": rows}


def summary(sts: list[dict], rows: list[dict]) -> dict:
    def tally(items):
        return {
            "stations": len(items),
            "points": sum(s["points"] for s in items),
            "fast_50kw_stations": sum(1 for s in items if s["kw"] >= 50),
            "hpc_150kw_stations": sum(1 for s in items if s["kw"] >= 150),
        }

    by_state: dict[str, list] = defaultdict(list)
    for s in sts:
        by_state[s["state"] or "?"].append(s)
    ops = Counter()
    for s in sts:
        ops[s["operator"]] += s["points"]
    return {
        "devices": len(rows),
        **tally(sts),
        "by_state": {k: tally(v) for k, v in sorted(by_state.items())},
        "top_operators_by_points": [{"operator": o, "points": n} for o, n in ops.most_common(15)],
    }


CSV_FIELDS = ["lat", "lon", "kw", "points", "dc_points", "plugs", "operator", "name", "address", "postcode", "town",
              "state", "open_24_7", "free", "card_payment", "customers_only", "plug_and_charge", "since", "devices"]


def plug_names(bits: int) -> str:
    return " ".join(k for k, v in PLUGS.items() if bits & v)


def stations_csv(sts: list[dict]) -> bytes:
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=CSV_FIELDS, lineterminator="\n")
    w.writeheader()
    for s in sts:
        f = s["flags"]
        w.writerow({
            **{k: s[k] for k in ("lat", "lon", "points", "dc_points", "operator", "name", "address", "postcode", "town", "state", "since", "devices")},
            "kw": _kw(s["kw"]),
            "plugs": plug_names(s["plugs"]),
            "open_24_7": int(bool(f & FLAGS["24/7"])),
            "free": int(bool(f & FLAGS["free"])),
            "card_payment": int(bool(f & FLAGS["card"])),
            "customers_only": int(bool(f & FLAGS["customers_only"])),
            "plug_and_charge": int(bool(f & FLAGS["plug_and_charge"])),
        })
    return buf.getvalue().encode()
