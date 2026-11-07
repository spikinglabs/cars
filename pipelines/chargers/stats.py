"""Charging statistics for Germany: where the public charge points are, how fast, which plugs.

Built from the same register rows as the map (every device, including the few whose coordinates are
off: their address and district are still right), against reference/districts.json for population and
electric cars. Writes stats.json and districts.csv next to the map files.

Counting rules:
- A charge point (Ladepunkt) is one car charging at a time. Its power is the rated power of that
  point; when the register leaves it out, the device's rated power shared over its points.
- Fast = 50 kW or more, ultra-fast = 150 kW or more (per point).
- Installed power (power_kw) adds up the rated power of the devices, not the points, because points on
  one device share its power. kW per electric car compares that with battery electric cars registered
  there; the EU rule for alternative fuels infrastructure (AFIR) asks for 1.3 kW of public charging per
  battery electric car across a country.
"""

from __future__ import annotations

import csv
import io
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

from .build import _num, postcode, year_of

REFERENCE = Path(__file__).parent / "reference" / "districts.json"

# kW limits of the power classes (lower bound inclusive).
POWER_CLASSES = [
    ("up_to_11", 0, 12),
    ("12_22", 12, 23),
    ("23_49", 23, 50),
    ("50_149", 50, 150),
    ("150_299", 150, 300),
    ("300_plus", 300, None),
]
CONNECTORS = {
    "type2_socket": ("typ 2 steckdose",),
    "type2_cable": ("typ 2 fahrzeugkupplung",),
    "ccs": ("ccs", "combo"),
    "chademo": ("chademo",),
    "schuko": ("schuko",),
    "mcs": ("mcs", "megawatt"),
    "type1": ("typ 1",),
}
AFIR_KW_PER_BEV = 1.3
FAST, ULTRA = 50, 150

# Register district names that do not match the population table by name.
ALIASES = {
    "kreisfreie stadt hanau": "06435",  # kreisfrei since 2026, still in Main-Kinzig-Kreis in the 2024 population table
    "kreisfreie stadt oldenburg oldb": "03403",
}
_PREFIX = re.compile(r"^(kreisfreie stadt|stadtkreis|landkreis|kreis|regionalverband)\s+")


def norm(s: str) -> str:
    s = (s or "").lower().replace("ß", "ss")
    return re.sub(r"[^a-zäöü0-9]+", " ", s).strip()


def load_reference(path: Path = REFERENCE) -> dict:
    return json.loads(path.read_text())


class DistrictMatcher:
    """Find the district key (ARS) for the register's "Kreis/kreisfreie Stadt" and "Bundesland"."""

    def __init__(self, districts: list[dict]):
        self.idx: dict[str, list[dict]] = defaultdict(list)
        for d in districts:
            names = {norm(d["name"]), norm(d["official_name"])}
            for n in names | {_PREFIX.sub("", n) for n in names}:
                self.idx[n].append(d)
        self.cache: dict[tuple, str | None] = {}

    def __call__(self, name: str, state: str) -> str | None:
        key = (name, state)
        if key not in self.cache:
            self.cache[key] = self._find(name, state)
        return self.cache[key]

    def _find(self, name: str, state: str) -> str | None:
        n = norm(name)
        if n in ALIASES:
            return ALIASES[n]
        m = _PREFIX.match(n)
        core = _PREFIX.sub("", n)
        city = bool(m) and m.group(1) in ("kreisfreie stadt", "stadtkreis")
        cands = {d["ars"]: d for d in self.idx.get(core, []) if not state or d["state"] == state}
        if len(cands) > 1:
            cands = {a: d for a, d in cands.items() if d["city"] == city}
        return next(iter(cands)) if len(cands) == 1 else None


def find_town(towns: dict[str, dict], place: str) -> dict | None:
    """The town (by normalised name) the register's place name means: 'Bad Homburg' is 'Bad Homburg v. d. Höhe'."""
    n = norm(place)
    if not n:
        return None
    if n in towns:
        return towns[n]
    for name, t in towns.items():
        if name.startswith(n + " ") or n.startswith(name + " "):
            return t
    return None


def point_list(r: dict) -> list[dict]:
    """The device's charge points with plug text and kW, filling in what the register leaves out."""
    n = int(_num(r.get("Anzahl Ladepunkte")) or 0)
    pts = r.get("points") or []
    device_kw = _num(r.get("Nennleistung Ladeeinrichtung [kW]")) or 0
    n = max(n, len(pts), 1)
    share = device_kw / n if device_kw else 0
    out = []
    for i in range(n):
        p = pts[i] if i < len(pts) else {}
        kw = _num(p.get("kw")) or share
        out.append({"plug": (p.get("plug") or "").lower(), "kw": min(kw, 1200)})
    return out


def power_class(kw: float) -> str:
    for key, lo, hi in POWER_CLASSES:
        if kw >= lo and (hi is None or kw < hi):
            return key
    return POWER_CLASSES[0][0]


def connectors_of(plug: str) -> list[str]:
    return [k for k, words in CONNECTORS.items() if any(w in plug for w in words)]


def _new():
    return {"devices": 0, "points": 0, "fast_points": 0, "ultra_points": 0, "dc_points": 0, "power_kw": 0.0}


def _add(acc: dict, dev_kw: float, pts: list[dict]):
    acc["devices"] += 1
    acc["points"] += len(pts)
    acc["fast_points"] += sum(1 for p in pts if p["kw"] >= FAST)
    acc["ultra_points"] += sum(1 for p in pts if p["kw"] >= ULTRA)
    acc["dc_points"] += sum(1 for p in pts if p["plug"].startswith("dc") or "ccs" in p["plug"] or "chademo" in p["plug"])
    acc["power_kw"] += dev_kw


def _ratios(acc: dict, population: int | None, bev: int | None) -> dict:
    out = {**acc, "power_kw": round(acc["power_kw"]), "population": population, "bev": bev}
    out["points_per_100k"] = round(acc["points"] / population * 1e5, 1) if population else None
    out["fast_per_100k"] = round(acc["fast_points"] / population * 1e5, 1) if population else None
    out["bev_per_point"] = round(bev / acc["points"], 1) if bev and acc["points"] else None
    out["kw_per_bev"] = round(acc["power_kw"] / bev, 2) if bev else None
    return out


def compute(rows: list[dict], ref: dict) -> dict:
    districts = {d["ars"]: d for d in ref["districts"]}
    match = DistrictMatcher(ref["districts"])
    towns_by_district: dict[str, dict[str, dict]] = defaultdict(dict)
    for t in ref["towns"]:
        towns_by_district[t["district"]][norm(t["name"])] = t

    total = _new()
    by_state: dict[str, dict] = defaultdict(_new)
    by_district: dict[str, dict] = defaultdict(_new)
    by_town: dict[str, dict] = defaultdict(_new)
    by_place: dict[tuple, dict] = defaultdict(_new)
    classes = Counter()
    plugs = Counter()
    years = defaultdict(lambda: [0, 0])
    ops = defaultdict(_new)
    unmatched = Counter()

    for r in rows:
        pts = point_list(r)
        dev_kw = _num(r.get("Nennleistung Ladeeinrichtung [kW]")) or sum(p["kw"] for p in pts)
        dev_kw = min(dev_kw, 1200 * len(pts))
        _add(total, dev_kw, pts)
        state = (r.get("Bundesland") or "").strip()
        _add(by_state[state or "?"], dev_kw, pts)
        ars = match(r.get("Kreis/kreisfreie Stadt") or "", state)
        town_name = (r.get("Ort") or "").strip()
        if ars:
            _add(by_district[ars], dev_kw, pts)
            t = find_town(towns_by_district.get(ars, {}), town_name)
            if t is None and districts[ars]["city"]:
                # a city district is one town; the register sometimes writes a quarter as the place
                t = next((x for x in towns_by_district.get(ars, {}).values() if x["ars"].startswith(ars)), None)
            if t:
                _add(by_town[t["ars"]], dev_kw, pts)
        else:
            unmatched[r.get("Kreis/kreisfreie Stadt") or "?"] += 1
        if town_name:
            _add(by_place[(town_name, ars or "")], dev_kw, pts)
        op = (r.get("Anzeigename (Karte)") or r.get("Betreiber") or "").strip()
        _add(ops[op], dev_kw, pts)
        for p in pts:
            classes[power_class(p["kw"])] += 1
            for c in connectors_of(p["plug"]):
                plugs[c] += 1
        y = year_of(r.get("Inbetriebnahmedatum"))
        if y:
            years[y][0] += len(pts)
            years[y][1] += sum(1 for p in pts if p["kw"] >= FAST)

    pop_total = sum(d["population"] for d in districts.values())
    bev_total = sum(d["bev"] or 0 for d in districts.values())
    state_ref: dict[str, dict] = defaultdict(lambda: {"population": 0, "bev": 0})
    for d in districts.values():
        state_ref[d["state"]]["population"] += d["population"]
        state_ref[d["state"]]["bev"] += d["bev"] or 0

    district_rows = []
    for ars, d in districts.items():
        acc = by_district.get(ars, _new())
        district_rows.append({"ars": ars, "name": d["name"], "state": d["state"], "city": d["city"],
                              **_ratios(acc, d["population"], d["bev"])})
    district_rows.sort(key=lambda x: -x["points"])

    town_rows = []
    for t in ref["towns"]:
        acc = by_town.get(t["ars"], _new())
        d = districts.get(t["district"], {})
        city = bool(d.get("city")) and t["ars"].startswith(t["district"])
        town_rows.append({"ars": t["ars"], "name": t["name"], "district": d.get("name"), "state": d.get("state"),
                          "city_district": city,
                          **_ratios(acc, t["population"], d.get("bev") if city else None)})
    town_rows.sort(key=lambda x: -x["points"])

    cum = 0
    year_rows = []
    for y in sorted(years):
        if y < 1990 or y > 2100:
            continue
        cum += years[y][0]
        year_rows.append({"year": y, "points_added": years[y][0], "fast_points_added": years[y][1], "points_total": cum})

    op_rows = sorted(({"operator": o, **{k: (round(v) if k == "power_kw" else v) for k, v in a.items()}}
                      for o, a in ops.items() if o), key=lambda x: -x["points"])
    place_rows = sorted(({"place": p, "district": districts[a]["name"] if a in districts else None,
                          "state": districts[a]["state"] if a in districts else None,
                          "points": acc["points"], "fast_points": acc["fast_points"], "ultra_points": acc["ultra_points"]}
                         for (p, a), acc in by_place.items()), key=lambda x: -x["points"])

    return {
        "totals": {**_ratios(total, pop_total, bev_total), "operators": len(op_rows), "places": len(by_place),
                   "districts_with_points": sum(1 for x in district_rows if x["points"])},
        "power_classes": [{"class": k, "min_kw": lo, "max_kw_below": hi, "points": classes[k]} for k, lo, hi in POWER_CLASSES],
        "connectors": [{"connector": k, "points": plugs[k]} for k in CONNECTORS],
        "by_year": year_rows,
        "states": sorted((
            {"state": s, **_ratios(a, state_ref[s]["population"] or None, state_ref[s]["bev"] or None)}
            for s, a in by_state.items()), key=lambda x: -x["points"]),
        "districts": district_rows,
        "towns": town_rows,
        "top_places": place_rows[:50],
        "top_operators": op_rows[:25],
        "unmatched_districts": dict(unmatched.most_common()),
    }


def stats_json(rows: list[dict], meta: dict, ref: dict, now_iso: str, source_url: str, page_url: str) -> dict:
    body = compute(rows, ref)
    return {
        "dataset": "chargers",
        "file": "stats",
        "region": "DE",
        "observed_at": meta.get("updated") or meta.get("file_date"),
        "built_at": now_iso,
        "source": "Bundesnetzagentur, Ladesäulenregister",
        "source_url": page_url,
        "source_file": source_url,
        "licence": "CC BY 4.0, Bundesnetzagentur.de; population and cars: Datenlizenz Deutschland – Namensnennung – 2.0 (Destatis, KBA)",
        "reference": {k: ref[k] for k in ("population_date", "cars_date", "sources", "town_min_population")},
        "definitions": {
            "points": "charge points: one car charging at a time",
            "fast_points": f"charge points rated {FAST} kW or more",
            "ultra_points": f"charge points rated {ULTRA} kW or more",
            "dc_points": "charge points with a DC plug (CCS, CHAdeMO, MCS)",
            "power_kw": "sum of the rated power of the charging devices (points on one device share it)",
            "points_per_100k": "charge points per 100,000 residents",
            "bev_per_point": "battery electric cars registered per public charge point",
            "kw_per_bev": f"installed public charging power per battery electric car; the EU AFIR target is {AFIR_KW_PER_BEV} kW nationally",
            "power_classes": "charge points by rated power; min_kw inclusive, max_kw_below exclusive",
            "connectors": "charge points offering each plug; a point with two plugs counts for both",
            "by_year": "charge points still in the register, by the year their device went into service (removed ones are not in the register)",
            "towns": f"municipalities with at least {ref['town_min_population']:,} residents; the register's place name is matched within the district",
        },
        "afir_kw_per_bev": AFIR_KW_PER_BEV,
        **body,
    }


DISTRICT_FIELDS = ["ars", "name", "state", "city", "points", "fast_points", "ultra_points", "dc_points", "devices",
                   "power_kw", "population", "bev", "points_per_100k", "fast_per_100k", "bev_per_point", "kw_per_bev"]


def districts_csv(stats: dict) -> bytes:
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=DISTRICT_FIELDS, lineterminator="\n", extrasaction="ignore")
    w.writeheader()
    for d in sorted(stats["districts"], key=lambda x: x["ars"]):
        w.writerow({**d, "city": int(d["city"])})
    return buf.getvalue().encode()
