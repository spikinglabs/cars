"""Turn EEA rows (make x commercial name x fuel) into a catalog of car models with official figures.

Makes and names are typed in by each manufacturer and country, so "VOLKSWAGEN, VW" / "VOLKSWAGEN-VW" are one
make and "ID.7 TOURER PRO S" / "ID.7 GTX" are one model. A model is make + family + fuel type; its figures are
registration-weighted means over its variants, so they describe the versions people actually bought.
"""

from __future__ import annotations

import re
import unicodedata

# Cleaned make (letters, digits and & only) -> display name.
MAKES = {
    "VOLKSWAGENVW": "VW", "VOLKSWAGEN": "VW", "VW": "VW",
    "MERCEDESBENZ": "Mercedes-Benz", "MERCEDES": "Mercedes-Benz", "MERCEDESAMG": "Mercedes-Benz",
    "BMW": "BMW", "MG": "MG", "MGROEWE": "MG", "BYD": "BYD", "DS": "DS", "DSAUTOMOBILES": "DS",
    "GREATWALLMOTORCOLTD": "GWM", "GWM": "GWM", "ORA": "GWM",
    "KGMOBILITY": "KGM", "KGM": "KGM", "SSANGYONG": "KGM", "SSANGYONGKGMOBILIT": "KGM",
    "LYNK&CO": "Lynk & Co", "LYNKCO": "Lynk & Co", "LYNK&AMPCO": "Lynk & Co",
    "OPELVAUXHALL": "Opel", "HYUNDAIGENESIS": "Genesis", "AUDIAG": "Audi",
    "AUTOMOBILILAMBORGHINI": "Lamborghini", "BAICBEIJING": "BAIC", "BAIC": "BAIC", "CHERYEBRO": "Ebro",
    "JAECOOOMODACHERY": "Omoda", "XPENG": "XPeng", "DFSK": "DFSK", "DFSKMOTORCOLTD": "DFSK",
    "DFSKSERESSOKONFENG": "DFSK", "NIO": "NIO", "FAW": "FAW", "JAC": "JAC", "SWM": "SWM", "EMC": "EMC",
    "DR": "DR", "EVO": "EVO", "LANDROVER": "Land Rover", "ALFAROMEO": "Alfa Romeo", "ASTONMARTIN": "Aston Martin",
    "ROLLSROYCE": "Rolls-Royce", "BMWAG": "BMW", "LUCIDMOTORS": "Lucid", "MCLAREN": "McLaren", "BMWI": "BMW", "BMWALPINA": "Alpina",
}
# Leading words of a commercial name that only repeat the make.
MAKE_WORDS = {"VOLKSWAGEN", "VW", "MERCEDES-BENZ", "MERCEDES", "AMG", "BMW", "MG", "BYD", "TOYOTA", "FIAT",
              "RENAULT", "NISSAN", "MAZDA", "POLESTAR", "SKODA", "KIA", "HYUNDAI", "OPEL", "PEUGEOT", "CITROEN",
              "DACIA", "FORD", "AUDI", "VOLVO", "TESLA", "CUPRA", "SEAT", "SUZUKI", "LEXUS", "HONDA", "JEEP",
              "MINI", "SMART", "XPENG", "LEAPMOTOR", "DS", "ALFA", "ROMEO", "LANCIA", "PORSCHE", "SUBARU", "ZEEKR",
              "OMODA", "JAECOO", "LAND", "ROVER", "MERCEDES-AMG", "LYNK", "&", "CO", "MITSUBISHI", "GENESIS", "ABARTH", "ALPINE", "NIO", "LOTUS"}
# A second word that makes a different car, not a trim: Dolphin Surf, C3 Aircross, Yaris Cross, ID. Buzz.
SECOND_WORDS = {"SURF", "AIRCROSS", "CROSS", "BUZZ", "PLUS", "MINI", "EV", "GT", "SPORT", "U", "N"}
FIRST_TWO = {"MODEL", "ID.", "E-TRON", "SERIES", "#", "IONIQ", "SEALION", "ATTO", "RS", "S", "GRAND", "SPACE", "SANTA"}
# Makes typed as company names in some years: a cleaned make starting with the key is that make.
MAKE_PREFIXES = {"MITSUBISHI": "Mitsubishi", "GREATWALL": "GWM", "DFSK": "DFSK", "AUTOMOBILILAMBORGHINI": "Lamborghini",
                 "LAMBORGHINI": "Lamborghini", "HYUNDAIMOTOR": "Hyundai"}
FUELS = {
    "electric": "electric", "petrol": "petrol", "diesel": "diesel",
    "petrol/electric": "phev-petrol", "diesel/electric": "phev-diesel",
    "lpg": "lpg", "ng": "cng", "ng-biomethane": "cng", "e85": "e85", "hydrogen": "hydrogen",
}


def ascii_upper(s: str) -> str:
    return unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().upper().strip()


def make_name(raw: str) -> str | None:
    s = ascii_upper(raw).split("/")[0]
    key = re.sub(r"[^A-Z0-9&]", "", s)
    if not key:
        return None
    if key in MAKES:
        return MAKES[key]
    for prefix, name in MAKE_PREFIXES.items():
        if key.startswith(prefix):
            return name
    words = re.split(r"[\s,]+", s.strip(" ,.-"))
    return " ".join(w.capitalize() if len(w) > 3 else w.capitalize() if not w.isalpha() else w.title() for w in words if w)


def family(make: str, commercial_name: str) -> str | None:
    """The model family in capitals, for example ID.7, MODEL Y, IONIQ 5, 3 SERIES, C3 AIRCROSS."""
    # "KONA. KAUAI", "GV60. GENESIS GV60", "KONA N.KAUAI N": the name, then the same in another language
    s = re.sub(r"(?<!\bID)\.(?:\s+|(?=[A-Z]{3}))", ",", ascii_upper(commercial_name))
    s = s.split(",")[0]
    s = re.sub(r"\s+", " ", s.replace("_", " ")).strip(" -.")
    s = re.sub(r"\bIONIQ\s*(\d)", r"IONIQ \1", s)
    s = re.sub(r"^ID\.?\s*(\d)", r"ID.\1", s)
    s = re.sub(r"^ID\. ?BUZZ", "ID. BUZZ", s)
    s = re.sub(r"^TUCSON ?IX35\b", "TUCSON", s)  # Hyundai until 2023
    s = re.sub(r"^(I|G) (\d{2})\b", r"\1\2", s)  # Hyundai "I 30", Genesis "G 80"
    s = re.sub(r"^SANTAFE\b", "SANTA FE", s)
    s = re.sub(r"^(I\d{2})N\b", r"\1 N", s)  # Hyundai I30N, I20N
    words = s.split(" ")
    mk = ascii_upper(make).replace(" ", "")
    while len(words) > 1 and (words[0] in MAKE_WORDS or words[0] == mk):
        words.pop(0)
    if not words or not words[0]:
        return None
    first = re.sub(r"^E-(?=[A-Z]?\d)", "", words[0])  # E-208, E-C3: the electric one of a model
    if make == "BMW":
        m = re.match(r"^M?(\d)\d\d", first)
        if m:
            return f"{m.group(1)} SERIES"
    if make == "Mercedes-Benz" and len(first) == 1 and first in "ABCEGSTV":
        return f"{first}-CLASS"
    if first == "JOHN" and words[1:3] == ["COOPER", "WORKS"]:
        return "JOHN COOPER WORKS"
    out = [first]
    if first == "E-TRON" and len(words) > 1 and words[1].isdigit():  # e-tron 50 / 55 are versions of the e-tron
        return first
    if len(words) > 1 and (first in FIRST_TWO or first.endswith("-") or words[1] in SECOND_WORDS):
        out.append(words[1])
    return " ".join(out)


def pretty(name: str) -> str:
    """ID.7 -> ID.7, MODEL Y -> Model Y, IONIQ 5 -> Ioniq 5, EX30 -> EX30, C-CLASS -> C-Class, 3 SERIES -> 3 Series."""
    def word(w: str) -> str:
        if re.match(r"^I(X\d?|\d{1,2})$", w):  # BMW iX, iX1, i4; Hyundai i10
            return "i" + w[1:]
        if "-" in w and not w.startswith("E-"):  # T-Roc, T-Cross, V-Klasse, MX-30
            return "-".join(p if any(c.isdigit() for c in p) or len(p) <= 2 else p.capitalize() for p in w.split("-"))
        if any(ch.isdigit() for ch in w) or w.startswith("ID.") or w.startswith("#") or len(w) <= 3:
            return w
        if "-" in w:
            return "-".join(word(p) for p in w.split("-"))
        return w.capitalize()
    return " ".join(word(w) for w in name.split(" ")).replace("E-Tron", "e-tron")


def slug(*parts: str) -> str:
    s = "-".join(parts).lower().replace("&", "and").replace("#", "")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


FIGURES = ("z", "fc", "co2", "kw", "kg", "er")
NON_EU = {"IS", "NO"}


def by_scope(rows: list[dict]) -> list[dict]:
    """Per-country rows -> one row per make, name and fuel with sums for de, eu (EU-27) and all countries."""
    out: dict[tuple, dict] = {}
    for r in rows:
        key = (r.get("mk") or "", r.get("cn") or "", r.get("ft") or "")
        o = out.get(key)
        if o is None:
            o = out[key] = {"mk": key[0], "cn": key[1], "ft": key[2]}
            for scope in ("de", "eu", "all"):
                o[f"n_{scope}"] = 0
                for f in FIGURES:
                    o[f"{f}_sum_{scope}"] = 0.0
                    o[f"{f}_n_{scope}"] = 0
        ms = (r.get("ms") or "").upper()
        scopes = ["all"] + (["eu"] if ms not in NON_EU else []) + (["de"] if ms == "DE" else [])
        for scope in scopes:
            o[f"n_{scope}"] += r.get("n") or 0
            for f in FIGURES:
                o[f"{f}_sum_{scope}"] += r.get(f"{f}_sum") or 0
                o[f"{f}_n_{scope}"] += r.get(f"{f}_n") or 0
    return list(out.values())


def _mean(s, n):
    return s / n if n else None


def build(rows: list[dict], region: str, *, min_registrations: int = 20) -> list[dict]:
    """Models for one region (de, eu), most registered first. Figures use that region's mix of variants and fall back
    to all reporting countries when the region's own reports lack a figure."""
    groups: dict[tuple, dict] = {}
    for r in rows:
        fuel = FUELS.get((r.get("ft") or "").lower())
        make = make_name(r.get("mk") or "")
        if not fuel or not make:
            continue
        fam = family(make, r.get("cn") or "")
        if not fam:
            continue
        g = groups.setdefault((make, fam, fuel), {"n": 0, "variants": [], "sums": {}})
        g["n"] += r.get(f"n_{region}") or 0
        g["variants"].append(r)
        for key in FIGURES:
            for scope in (region, "all"):
                acc = g["sums"].setdefault((key, scope), [0.0, 0])
                acc[0] += r.get(f"{key}_sum_{scope}") or 0
                acc[1] += r.get(f"{key}_n_{scope}") or 0

    out = []
    for (make, fam, fuel), g in groups.items():
        if g["n"] < min_registrations:
            continue

        def fig(key):
            s, n = g["sums"][(key, region)]
            if not n:
                s, n = g["sums"][(key, "all")]
            return _mean(s, n)

        def spread(key, scale, digits=1):
            # the range over variants that sold at least 1 % of the model, using the same scope rule
            vals = []
            for v in g["variants"]:
                if (v.get(f"n_{region}") or 0) < max(5, g["n"] * 0.01):
                    continue
                m = _mean(v.get(f"{key}_sum_{region}") or 0, v.get(f"{key}_n_{region}") or 0)
                if m is None:
                    m = _mean(v.get(f"{key}_sum_all") or 0, v.get(f"{key}_n_all") or 0)
                if m:
                    vals.append(m * scale)
            if not vals:
                return None
            lo, hi = round(min(vals), digits), round(max(vals), digits)
            return [int(lo), int(hi)] if digits == 0 else [lo, hi]

        z, fc, co2, kw, kg, er = (fig(k) for k in FIGURES)
        uses_power = fuel == "electric" or fuel.startswith("phev")
        uses_fuel = fuel != "electric"
        kwh = round(z / 10, 1) if z and uses_power else None
        litres = round(fc, 1) if fc and uses_fuel else None
        if kwh is None and litres is None:
            continue
        name = pretty(fam)
        display = name if name.upper().startswith(make.upper().replace(" ", "")) else f"{make} {name}"
        out.append({
            "id": slug(make, fam) + ("" if fuel == "electric" else "-" + fuel),
            "make": make,
            "model": name,
            "name": display,
            "fuel": fuel,
            "registrations": g["n"],
            "kwh_per_100km": kwh,
            "kwh_range": spread("z", 0.1) if kwh else None,
            "l_per_100km": litres,
            "l_range": spread("fc", 1) if litres else None,
            "co2_g_km": round(co2) if co2 is not None else None,
            "power_kw": round(kw) if kw else None,
            "mass_kg": round(kg) if kg else None,
            "range_km": round(er) if er and uses_power else None,
            "range_span": spread("er", 1, 0) if er and uses_power else None,
            "variants": len(g["variants"]),
        })
    out.sort(key=lambda m: (-m["registrations"], m["name"]))
    return out


FIELDS = ["id", "make", "model", "name", "fuel", "registrations", "kwh_per_100km", "kwh_min", "kwh_max",
          "l_per_100km", "l_min", "l_max", "co2_g_km", "power_kw", "mass_kg", "range_km", "range_min", "range_max", "variants", "year", "first_year"]


def csv_rows(models: list[dict]) -> list[dict]:
    rows = []
    for m in models:
        r = dict(m)
        r["kwh_min"], r["kwh_max"] = m["kwh_range"] or (None, None)
        r["l_min"], r["l_max"] = m["l_range"] or (None, None)
        r["range_min"], r["range_max"] = m.get("range_span") or (None, None)
        r["first_year"] = (m.get("years") or [None])[0]
        rows.append(r)
    return rows


def electric(models: list[dict]) -> list[list]:
    """Compact list for the charging cost page: [id, name, kWh/100 km, min, max, registrations, electric range km]."""
    return [[m["id"], m["name"], m["kwh_per_100km"], *(m["kwh_range"] or [None, None]), m["registrations"], m.get("range_km")]
            for m in models if m["fuel"] == "electric" and m["kwh_per_100km"]]


def merge(by_year: list[tuple[int, list[dict]]], *, share: float = 0.1) -> list[dict]:
    """One catalog over several data years, so older cars that are no longer sold new stay in the list. Each model
    takes its figures from the newest year with at least `share` of its best year's registrations: a model that sold
    85 times in its last year (a run-out, or an import of another car with the same name) keeps the figures of the
    years most of its cars were sold in. `year` is the year of those figures and registrations, `years` the first
    and last year the model was registered new. Models still sold come first."""
    seen: dict[str, list[tuple[int, dict]]] = {}
    for year, models in by_year:
        for m in models:
            seen.setdefault(m["id"], []).append((year, m))
    out = []
    for entries in seen.values():
        entries.sort(key=lambda e: -e[0])
        peak = max(m["registrations"] for _, m in entries)
        year, m = next(e for e in entries if e[1]["registrations"] >= peak * share)
        out.append({**m, "year": year, "years": [entries[-1][0], entries[0][0]]})
    return sorted(out, key=lambda m: (-m["years"][1], -m["registrations"], m["name"]))
