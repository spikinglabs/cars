"""The versions (trims) of each catalog model, from the EEA rows per commercial name, variant code and power.

A model in the catalog (make + family + fuel) is an average over everything sold under that name. People choose a
version: an ID.3 Pro S with 170 kW, an EX30 with the small or the big battery. Here a version is

    the trim words of the commercial name (PRO S, GTX, 320D XDRIVE; often none) + power in kW,

and, for electric cars and plug-in hybrids, split again where the official electric range jumps by more than 10 %
(a bigger battery under the same name and power, like the EX30 Single Motor and Single Motor Extended Range).
Variant codes (Va, field D.2 on the German registration certificate) are kept so a driver can find theirs.

Figures are registration-weighted means over all reporting countries (the same version has the same type-approval
figures everywhere); registrations count the region. Versions are merged over the data years like models are:
each takes its figures from its newest year with at least a tenth of its best year's registrations.
"""

from __future__ import annotations

import math
import re

from . import catalog

KW_WORD = re.compile(r"^\d+(?:[.,]\d+)?(?:KW|PS|HP|CV|CH)$")
UNIT_WORDS = {"KW", "PS", "HP", "CV", "CH"}
RANGE_JUMP = 0.10
MIN_REGISTRATIONS = 10
MIN_SHARE = 0.01
MAX_CODES = 8


def model_id(make: str, fam: str, fuel: str) -> str:
    return catalog.slug(make, fam) + ("" if fuel == "electric" else "-" + fuel)


def trim(make: str, fam: str, commercial_name: str) -> str | None:
    """The words of a commercial name after the model family, without power figures: 'ID.3 PRO S 170KW' -> 'PRO S'."""
    words = catalog.name_words(make, commercial_name)
    fw = fam.split(" ")
    if words and re.sub(r"^E-(?=[A-Z]?\d)", "", words[0]) == fw[0]:
        words = [fw[0]] + words[1:]
    if words[:len(fw)] == fw:
        words = words[len(fw):]
    out = []
    for i, w in enumerate(words):
        if KW_WORD.match(w) or w in UNIT_WORDS:
            continue
        if re.fullmatch(r"\d+(?:[.,]\d+)?", w) and i + 1 < len(words) and words[i + 1] in UNIT_WORDS:
            continue
        out.append(w)
    return " ".join(out).strip(" -.,") or None


WORDS = {"XDRIVE": "xDrive", "SDRIVE": "sDrive", "EDRIVE": "eDrive", "ETSI": "eTSI", "EHYBRID": "eHybrid",
         "E-HYBRID": "e-Hybrid", "4MOTION": "4Motion", "4MATIC": "4MATIC", "E-TECH": "E-Tech", "PERF.": "Performance",
         "PERF": "Performance"}


def pretty_trim(t: str | None) -> str | None:
    """PRO S -> Pro S, 320D XDRIVE -> 320d xDrive, GTX -> GTX, 85X -> 85x."""
    if not t:
        return None

    def word(w):
        if w in WORDS:
            return WORDS[w]
        if re.fullmatch(r"M?\d{2,3}[IDE]", w):  # BMW 320D, M340I
            return w[:-1] + w[-1].lower()
        if len(w) <= 3 and w.isalpha() and w not in {"PRO", "MAX", "ONE", "TOP"}:
            return w
        if any(c.isdigit() for c in w) or not w.replace("-", "").isalpha():
            return w
        return "-".join(p.capitalize() for p in w.split("-"))
    return " ".join(word(w) for w in t.split(" "))


def _mean(s, n):
    return s / n if n else None


FIGS = ("z", "fc", "co2", "kg", "er")


def clusters(rows: list[dict], region: str) -> dict[str, list[dict]]:
    """One data year's version rows -> {model id: [cluster]} for a region (de, eu)."""
    count = f"n_{region}"
    groups: dict[tuple, list[dict]] = {}
    model_n: dict[str, int] = {}
    for r in rows:
        fuel = catalog.FUELS.get((r.get("ft") or "").lower())
        make = catalog.make_name(r.get("mk") or "")
        if not fuel or not make:
            continue
        fam = catalog.family(make, r.get("cn") or "")
        if not fam or not r.get("kw"):
            continue
        mid = model_id(make, fam, fuel)
        z, fc = _mean(r.get("z_sum") or 0, r.get("z_n")), _mean(r.get("fc_sum") or 0, r.get("fc_n"))
        # rows without the main figure are placeholders (one-off imports, individual approvals)
        if (fuel == "electric" and not z) or (fuel != "electric" and not fc and not z):
            continue
        model_n[mid] = model_n.get(mid, 0) + (r.get(count) or 0)
        t = trim(make, fam, r.get("cn") or "")
        groups.setdefault((mid, t, round(r["kw"])), []).append(
            {**r, "_make": make, "_fam": fam, "_fuel": fuel, "_er": _mean(r.get("er_sum") or 0, r.get("er_n"))})
    out: dict[str, list[dict]] = {}
    for (mid, t, kw), rs in groups.items():
        parts: list[list[dict]] = []
        electric = rs[0]["_fuel"] == "electric" or rs[0]["_fuel"].startswith("phev")
        if electric and any(r["_er"] for r in rs):
            rs = sorted(rs, key=lambda r: r["_er"] or 0)
            for r in rs:
                if parts and r["_er"] and parts[-1][-1]["_er"] and r["_er"] <= parts[-1][-1]["_er"] * (1 + RANGE_JUMP):
                    parts[-1].append(r)
                elif parts and not r["_er"]:
                    parts[-1].append(r)
                else:
                    parts.append([r])
        else:
            parts = [rs]
        for p in parts:
            n = sum(r.get(count) or 0 for r in p)
            if n < MIN_REGISTRATIONS or n < model_n[mid] * MIN_SHARE:
                continue
            c = {"model": mid, "make": p[0]["_make"], "family": p[0]["_fam"], "fuel": p[0]["_fuel"], "trim": t,
                 "power_kw": kw, "n": n, "names": {}, "codes": {}}
            for f in FIGS:
                c[f] = _mean(sum(r.get(f"{f}_sum") or 0 for r in p), sum(r.get(f"{f}_n") or 0 for r in p))
            lo = [r["er_min"] for r in p if r.get("er_min")]
            hi = [r["er_max"] for r in p if r.get("er_max")]
            c["er_span"] = [min(lo), max(hi)] if lo and hi else None
            for r in p:
                c["names"][r.get("cn") or ""] = c["names"].get(r.get("cn") or "", 0) + (r.get(count) or 0)
                if r.get("va"):
                    c["codes"][r["va"]] = c["codes"].get(r["va"], 0) + (r.get(count) or 0)
            out.setdefault(mid, []).append(c)
    return {mid: _fold(cs) for mid, cs in out.items()}


def _rated(a: dict, b: dict) -> bool:
    """Some makers (VW group electric cars in 2021 and 2024) report the 30-minute power instead of the peak power for
    part of a version's cars. Same trim and variant code, close range, and well under the other's power: the same
    version."""
    low, high = sorted((a, b), key=lambda c: c["power_kw"])
    if a["fuel"] != "electric" or not low["codes"] or low["power_kw"] >= high["power_kw"] * 0.7:
        return False
    return max(low["codes"], key=low["codes"].get) in high["codes"]


def _same(a: dict, b: dict) -> bool:
    if a["trim"] != b["trim"]:
        return False
    rated = _rated(a, b)
    if a["power_kw"] != b["power_kw"] and not rated:
        return False
    if a.get("er") and b.get("er"):
        return abs(math.log(a["er"] / b["er"])) <= RANGE_JUMP
    return rated or (not a.get("er") and not b.get("er"))


def _fold(cs: list[dict]) -> list[dict]:
    """Merge clusters of one year that are the same version reported with a lower (30-minute) power."""
    cs = sorted(cs, key=lambda c: -c["power_kw"])
    out: list[dict] = []
    for c in cs:
        host = next((o for o in out if o["power_kw"] != c["power_kw"] and _same(o, c)), None)
        if not host:
            out.append(c)
            continue
        n = host["n"] + c["n"]
        for f in FIGS:
            if host.get(f) is None or c.get(f) is None:
                host[f] = host.get(f) if host.get(f) is not None else c.get(f)
            else:
                host[f] = (host[f] * host["n"] + c[f] * c["n"]) / n
        if c.get("er_span"):
            hs = host.get("er_span") or c["er_span"]
            host["er_span"] = [min(hs[0], c["er_span"][0]), max(hs[1], c["er_span"][1])]
        for k in ("names", "codes"):
            for x, m in c[k].items():
                host[k][x] = host[k].get(x, 0) + m
        host["n"] = n
    return out


def _span(c: dict) -> list[int] | None:
    """Shortest and longest official range inside a version (wheels, options). Left out when it strays far from the
    mean, which means a few cars were typed in with another battery or a placeholder."""
    if not c.get("er_span") or not c.get("er"):
        return None
    lo, hi = c["er_span"]
    return [round(lo), round(hi)] if lo >= c["er"] * 0.8 and hi <= c["er"] * 1.2 else None


def _row(c: dict) -> dict:
    fuel = c["fuel"]
    power = fuel == "electric" or fuel.startswith("phev")
    kwh = round(c["z"] / 10, 1) if c.get("z") and power else None
    litres = round(c["fc"], 1) if c.get("fc") and fuel != "electric" else None
    return {
        "trim": pretty_trim(c["trim"]),
        "fuel": fuel,
        "power_kw": c["power_kw"],
        "kwh_per_100km": kwh,
        "l_per_100km": litres,
        "co2_g_km": round(c["co2"]) if c.get("co2") is not None else None,
        "mass_kg": round(c["kg"]) if c.get("kg") else None,
        "range_km": round(c["er"]) if c.get("er") and power else None,
        "range_span": _span(c) if power else None,
        "registrations": c["n"],
    }


def merge(by_year: list[tuple[int, dict[str, list[dict]]]], *, share: float = 0.1) -> dict[str, list[dict]]:
    """Versions over several data years: {model id: [version]}, current versions first, then most registered."""
    seen: dict[str, list[list[tuple[int, dict]]]] = {}
    for year, models in sorted(by_year, key=lambda e: -e[0]):
        for mid, cs in models.items():
            known = seen.setdefault(mid, [])
            for c in cs:
                for entries in known:
                    if entries[0][1] is not c and _same(entries[0][1], c) and all(y != year for y, _ in entries):
                        entries.append((year, c))
                        break
                else:
                    known.append([(year, c)])
    out: dict[str, list[dict]] = {}
    for mid, groups in seen.items():
        vs = []
        for entries in groups:
            peak = max(c["n"] for _, c in entries)
            year, c = next(e for e in entries if e[1]["n"] >= peak * share)
            names, codes = {}, {}
            for _, x in entries:
                for k, n in x["names"].items():
                    names[k] = names.get(k, 0) + n
                for k, n in x["codes"].items():
                    codes[k] = codes.get(k, 0) + n
            c = {**c, "power_kw": max(x["power_kw"] for _, x in entries)}
            vs.append({**_row(c), "year": year, "years": [entries[-1][0], entries[0][0]],
                       "names": [k for k, _ in sorted(names.items(), key=lambda x: -x[1]) if k][:3],
                       "codes": [k for k, _ in sorted(codes.items(), key=lambda x: -x[1])][:MAX_CODES]})
        vs.sort(key=lambda v: (-v["years"][1], -v["registrations"], v["power_kw"]))
        _ids(mid, vs)
        out[mid] = vs
    return out


def _ids(mid: str, vs: list[dict]) -> None:
    """Short readable ids, unique within the model: pro-s-170kw, 200kw-475km, 110kw."""
    base = [catalog.slug(v["trim"] or "", f"{v['power_kw']}kw") for v in vs]
    taken = set()
    for v, b in zip(vs, base):
        vid = b
        if base.count(b) > 1:
            extra = f"{v['range_km']}km" if v.get("range_km") else f"{v['co2_g_km']}g" if v.get("co2_g_km") is not None else ""
            vid = catalog.slug(b, extra)
        n = 2
        while vid in taken:
            vid, n = f"{b}-{n}", n + 1
        taken.add(vid)
        v["id"] = vid
        v["ref"] = f"{mid}:{vid}"


def label(v: dict) -> str:
    """'Pro S · 170 kW · 559 km', for tables and logs."""
    parts = [v["trim"]] if v.get("trim") else []
    parts.append(f"{v['power_kw']} kW")
    if v.get("range_km"):
        parts.append(f"{v['range_km']} km")
    return " · ".join(parts)


CSV_FIELDS = ["ref", "model", "trim", "fuel", "power_kw", "kwh_per_100km", "l_per_100km", "co2_g_km", "mass_kg", "range_km",
              "range_min", "range_max", "registrations", "year", "first_year", "names", "codes"]


def csv_rows(versions: dict[str, list[dict]]) -> list[dict]:
    rows = []
    for mid, vs in versions.items():
        for v in vs:
            rows.append({**v, "model": mid, "range_min": (v.get("range_span") or [None])[0],
                         "range_max": (v.get("range_span") or [None, None])[1], "first_year": v["years"][0],
                         "names": " | ".join(v.get("names") or []), "codes": " ".join(v.get("codes") or [])})
    return rows
