"""Turn raw OCPI tariffs into flat, comparable rows and summaries.

Units follow OCPI: ENERGY is per kWh, TIME and PARKING_TIME are per hour,
FLAT is per session. All published prices are gross (incl. VAT).
"""

from __future__ import annotations

import csv
import io
import statistics
from typing import Iterable

DEFAULT_VAT = 19.0

# Licences we may republish (OCPDB `attribution_license` values).
OPEN_LICENCES = {"cc-zero", "cc-by/4.0", "dl-by-de/2.0", "dl-de/by-2-0", "dl-zero-de/2.0"}


def _vat_percent(component: dict) -> float | None:
    for tax in component.get("taxes") or []:
        if str(tax.get("name", "")).upper() in ("VAT", "MWST", "UST"):
            pct = tax.get("percentage")
            if pct is None:
                continue
            pct = float(pct)
            # Some feeds send the rate as a fraction (0.19 instead of 19).
            return pct * 100 if 0 < pct < 1 else pct
    return None


def gross_price(component: dict) -> tuple[float, str]:
    """Return (gross price, tax basis) for one OCPI price component.

    tax basis: "gross" (stated incl. VAT), "net+vat" (converted from net),
    "assumed_gross" (source did not say; OCPDB never converts).
    """
    price = float(component["price"])
    included = component.get("tax_included")
    if included is True:
        return price, "gross"
    if included is False:
        vat = _vat_percent(component)
        return price * (1 + (DEFAULT_VAT if vat is None else vat) / 100), "net+vat"
    return price, "assumed_gross"


def _components(tariff: dict, kind: str, *, unrestricted_only: bool):
    for element in tariff.get("elements") or []:
        if unrestricted_only and element.get("restrictions"):
            continue
        for comp in element.get("price_components") or []:
            if comp.get("type") == kind:
                yield comp


def _first_price(tariff: dict, kind: str) -> tuple[float | None, str | None]:
    comps = list(_components(tariff, kind, unrestricted_only=True)) or list(
        _components(tariff, kind, unrestricted_only=False)
    )
    if not comps:
        return None, None
    prices = [gross_price(c) for c in comps]
    return min(prices, key=lambda p: p[0])


TARIFF_FIELDS = [
    "observed_at",
    "tariff_id",
    "original_id",
    "source",
    "licence",
    "type",
    "currency",
    "energy_eur_per_kwh",
    "time_eur_per_hour",
    "parking_eur_per_hour",
    "session_fee_eur",
    "tax_basis",
    "has_restrictions",
    "start_date_time",
    "end_date_time",
    "last_updated",
]


def flatten_tariffs(tariffs: Iterable[dict], licences: dict[str, str | None], observed_at: str) -> list[dict]:
    rows = []
    for t in tariffs:
        energy, basis = _first_price(t, "ENERGY")
        time_p, _ = _first_price(t, "TIME")
        parking, _ = _first_price(t, "PARKING_TIME")
        flat, _ = _first_price(t, "FLAT")
        rows.append(
            {
                "observed_at": observed_at,
                "tariff_id": t.get("id"),
                "original_id": t.get("original_id"),
                "source": t.get("source"),
                "licence": licences.get(t.get("source")),
                "type": t.get("type"),
                "currency": t.get("currency"),
                "energy_eur_per_kwh": _round(energy),
                "time_eur_per_hour": _round(time_p),
                "parking_eur_per_hour": _round(parking),
                "session_fee_eur": _round(flat),
                "tax_basis": basis,
                "has_restrictions": any(e.get("restrictions") for e in t.get("elements") or []),
                "start_date_time": t.get("start_date_time"),
                "end_date_time": t.get("end_date_time"),
                "last_updated": t.get("last_updated"),
            }
        )
    return rows


def _round(x: float | None) -> float | None:
    return None if x is None else round(x, 4)


def to_csv(rows: list[dict], fields: list[str]) -> bytes:
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=fields, extrasaction="ignore", lineterminator="\n")
    w.writeheader()
    w.writerows(rows)
    return buf.getvalue().encode()


def _quantile(values: list[float], q: float) -> float:
    if len(values) == 1:
        return values[0]
    return statistics.quantiles(values, n=100, method="inclusive")[int(q * 100) - 1]


def _stats(values: list[float]) -> dict:
    values = sorted(values)
    return {
        "tariffs": len(values),
        "median": round(statistics.median(values), 4),
        "p10": round(_quantile(values, 0.10), 4),
        "p90": round(_quantile(values, 0.90), 4),
        "min": round(values[0], 4),
        "max": round(values[-1], 4),
    }


def summarize(rows: list[dict], *, public_only: bool = True) -> dict:
    """Median/p10/p90 of ad-hoc energy price, overall and per source."""
    by_source: dict[str, list[float]] = {}
    for r in rows:
        if r["energy_eur_per_kwh"] is None or r["currency"] not in (None, "EUR"):
            continue
        if public_only and r["licence"] not in OPEN_LICENCES:
            continue
        by_source.setdefault(r["source"], []).append(r["energy_eur_per_kwh"])
    all_values = [v for vs in by_source.values() for v in vs]
    return {
        "overall": _stats(all_values) if all_values else None,
        "by_source": {s: _stats(v) for s, v in sorted(by_source.items())},
    }


DAILY_FIELDS = ["date", "source", "tariffs", "median", "p10", "p90", "min", "max"]


def upsert_daily(existing_csv: bytes | None, date: str, summary: dict) -> bytes:
    """Replace today's rows in daily.csv with the latest summary (last run of the day wins)."""
    rows = []
    if existing_csv:
        rows = [r for r in csv.DictReader(io.StringIO(existing_csv.decode())) if r["date"] != date]
    if summary["overall"]:
        rows.append({"date": date, "source": "ALL", **summary["overall"]})
    for source, stats in summary["by_source"].items():
        rows.append({"date": date, "source": source, **stats})
    rows.sort(key=lambda r: (r["date"], r["source"] != "ALL", r["source"]))
    return to_csv(rows, DAILY_FIELDS)


# ---------------------------------------------------------------------------
# Prices by charger type and operator.
#
# A tariff applies to many charge points (EVSEs). OCPDB's tariff associations say
# which EVSEs, the EVSE list says what each can deliver, and the weekly locations
# say who operates it. We count charge points, not tariffs: the median of an
# operator's AC points is what a driver pulling up to one of them typically pays.

POWER_CLASSES = ("ac", "dc", "hpc")
HPC_WATTS = 150_000  # "high-power charging" from 150 kW
MIN_OPERATOR_POINTS = 25  # smaller operators are left out of the operator table


def power_class(evse: dict) -> str | None:
    """ac, dc (below 150 kW) or hpc (150 kW and more) from an EVSE's connectors."""
    best = None
    for c in evse.get("connectors") or []:
        kind = str(c.get("power_type") or "").upper()
        watts = c.get("max_electric_power") or 0
        if kind == "DC":
            cls = "hpc" if watts >= HPC_WATTS else "dc"
        elif kind.startswith("AC"):
            cls = "ac"
        else:
            continue
        if best is None or POWER_CLASSES.index(cls) > POWER_CLASSES.index(best):
            best = cls
    return best


def evse_classes(evses) -> dict[str, str]:
    """EVSE uid -> power class, for every EVSE whose connectors say AC or DC."""
    out = {}
    for e in evses:
        cls = power_class(e)
        if cls and e.get("uid") is not None:
            out[str(e["uid"])] = cls
    return out


def evse_operators(locations) -> dict[str, str]:
    """EVSE uid -> operator name, from the locations list."""
    out = {}
    for loc in locations:
        name = ((loc.get("operator") or {}).get("name") or (loc.get("owner") or {}).get("name") or "").strip()
        if not name:
            continue
        for e in loc.get("evses") or []:
            if e.get("uid") is not None:
                out[str(e["uid"])] = name
    return out


def point_prices(rows: list[dict], associations, *, public_only: bool = True) -> dict[str, float]:
    """EVSE uid -> lowest ad-hoc energy price (EUR/kWh) of the tariffs that apply to it."""
    price = {}
    for r in rows:
        if r["energy_eur_per_kwh"] is None or r["currency"] not in (None, "EUR"):
            continue
        if public_only and r["licence"] not in OPEN_LICENCES:
            continue
        price[str(r["tariff_id"])] = r["energy_eur_per_kwh"]
    out: dict[str, float] = {}
    for a in associations:
        p = price.get(str(a.get("id")))
        if p is None:
            continue
        for e in a.get("evses") or []:
            uid = str(e.get("evse_uid"))
            if uid not in out or p < out[uid]:
                out[uid] = p
    return out


def _point_stats(values: list[float]) -> dict:
    s = _stats(values)
    s["charge_points"] = s.pop("tariffs")
    return s


def summarize_points(points: dict[str, float], classes: dict[str, str], operators: dict[str, str]) -> dict:
    """by_power: stats per power class; by_operator: operators with enough priced charge points."""
    per_class: dict[str, list[float]] = {c: [] for c in POWER_CLASSES}
    per_op: dict[str, dict[str, list[float]]] = {}
    for uid, p in points.items():
        cls = classes.get(uid)
        if cls is None:
            continue
        per_class[cls].append(p)
        op = operators.get(uid)
        if op:
            per_op.setdefault(op, {c: [] for c in POWER_CLASSES})[cls].append(p)
    by_power = {c: _point_stats(v) for c, v in per_class.items() if v}
    by_operator = []
    for op, cls_values in per_op.items():
        allv = [v for vs in cls_values.values() for v in vs]
        if len(allv) < MIN_OPERATOR_POINTS:
            continue
        entry = {"operator": op, **_point_stats(allv)}
        for c, v in cls_values.items():
            entry[c] = {"charge_points": len(v), "median": round(statistics.median(v), 4)} if v else None
        by_operator.append(entry)
    by_operator.sort(key=lambda e: (-e["charge_points"], e["operator"]))
    return {"by_power": by_power, "by_operator": by_operator}


DAILY_POWER_FIELDS = ["date", "power", "charge_points", "median", "p10", "p90", "min", "max"]
DAILY_OPERATOR_FIELDS = ["date", "operator", "charge_points", "median", "p10", "p90", "ac_median", "dc_median", "hpc_median"]
OPERATOR_FIELDS = [
    "operator", "charge_points", "median", "p10", "p90", "min", "max",
    "ac_points", "ac_median", "dc_points", "dc_median", "hpc_points", "hpc_median",
]


def operator_rows(by_operator: list[dict]) -> list[dict]:
    rows = []
    for e in by_operator:
        r = {k: e.get(k) for k in ("operator", "charge_points", "median", "p10", "p90", "min", "max")}
        for c in POWER_CLASSES:
            r[f"{c}_points"] = e[c]["charge_points"] if e.get(c) else 0
            r[f"{c}_median"] = e[c]["median"] if e.get(c) else None
        rows.append(r)
    return rows


def _upsert(existing_csv: bytes | None, date: str, new_rows: list[dict], fields: list[str], key: str) -> bytes:
    rows = []
    if existing_csv:
        rows = [r for r in csv.DictReader(io.StringIO(existing_csv.decode())) if r["date"] != date]
    rows.extend(new_rows)
    rows.sort(key=lambda r: (r["date"], str(r[key])))
    return to_csv(rows, fields)


def upsert_daily_power(existing_csv: bytes | None, date: str, by_power: dict) -> bytes:
    order = {c: i for i, c in enumerate(POWER_CLASSES)}
    rows = [{"date": date, "power": c, **by_power[c]} for c in sorted(by_power, key=order.get)]
    out = _upsert(existing_csv, date, rows, DAILY_POWER_FIELDS, "power")
    # keep ac, dc, hpc order inside a day
    head, *lines = out.decode().splitlines()
    lines.sort(key=lambda l: (l.split(",")[0], order.get(l.split(",")[1], 9)))
    return ("\n".join([head, *lines]) + "\n").encode()


def upsert_daily_operators(existing_csv: bytes | None, date: str, by_operator: list[dict]) -> bytes:
    rows = [
        {"date": date, **{k: r[k] for k in ("operator", "charge_points", "median", "p10", "p90", "ac_median", "dc_median", "hpc_median")}}
        for r in operator_rows(by_operator)
    ]
    return _upsert(existing_csv, date, rows, DAILY_OPERATOR_FIELDS, "operator")
