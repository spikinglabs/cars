"""Collect German day-ahead electricity prices from SMARD, for the cheapest time to charge at home.

    python -m pipelines.electricity_prices.collect --local ./out
    python -m pipelines.electricity_prices.collect --r2 <bucket>

Bucket layout (the shared R2_BUCKET_EV bucket, folder ``electricity-prices/``):

    electricity-prices/
      state/hourly.json         {unix ms: EUR/MWh} since Oct 2018 (hourly)
      state/quarterhour.json    {unix ms: EUR/MWh} for the last weeks (15-minute, since Oct 2025)
      public/                   served at https://cars.allo.land/data/electricity-prices/
        index.json
        de/
          latest.json   today and tomorrow (German time) in 15-minute steps, with the cheapest 1 to 8 hour
                        windows per day, wholesale and as an estimated dynamic tariff price
          daily.csv     one row per day since Oct 2018: mean, min, max, cheapest 1 h and 4 h, negative hours
          hourly.csv    every hour since Oct 2018, EUR/MWh
      runs/YYYY/MM/DD/<ts>.json

The first run reads the whole hourly archive (about 420 weekly files); later runs read the newest two weeks.
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from pipelines.charging_prices.http import get_json
from pipelines.charging_prices.normalize import to_csv
from pipelines.charging_prices.storage import LocalStore, PrefixedStore, R2Store

from . import smard

BERLIN = ZoneInfo("Europe/Berlin")
WINDOWS = [1, 2, 3, 4, 6, 8]  # hours
# Rough German dynamic tariff on top of the exchange price, before VAT: grid fee, levies, electricity tax,
# supplier margin. Varies by grid area and supplier; the page lets people enter their own.
ADDON_EUR_KWH_NET = 0.18
VAT = 0.19


def _json(obj) -> bytes:
    return json.dumps(obj, ensure_ascii=False, indent=1).encode()


def load(store, key: str) -> dict[int, float]:
    raw = store.get(key)
    return {int(k): v for k, v in json.loads(raw).items()} if raw else {}


def fetch(resolution: str, newest: int | None = None, log=print) -> dict[int, float]:
    stamps = get_json(smard.index_url(resolution))["timestamps"]
    if newest:
        stamps = stamps[-newest:]
    out: dict[int, float] = {}
    for ts in stamps:
        try:
            out.update(smard.parse(get_json(smard.file_url(resolution, ts), timeout=60)))
        except Exception as exc:
            log(f"SMARD {resolution} {ts}: {exc!r}")
    return out


def local_day(ms: int) -> str:
    return datetime.fromtimestamp(ms / 1000, BERLIN).date().isoformat()


def tariff(eur_mwh: float, addon: float = ADDON_EUR_KWH_NET, vat: float = VAT) -> float:
    return round((eur_mwh / 1000 + addon) * (1 + vat), 4)


def cheapest(points: list[tuple[int, float]], hours: int, step_min: int) -> dict | None:
    """Cheapest run of consecutive slots lasting `hours`, within one day's points (sorted by time)."""
    n = hours * 60 // step_min
    if len(points) < n:
        return None
    best = None
    for i in range(len(points) - n + 1):
        run = points[i:i + n]
        if run[-1][0] - run[0][0] != (n - 1) * step_min * 60_000:
            continue  # a gap in the data
        avg = sum(v for _, v in run) / n
        if best is None or avg < best[0]:
            best = (avg, run[0][0])
    if best is None:
        return None
    start = datetime.fromtimestamp(best[1] / 1000, BERLIN)
    return {"hours": hours, "start": start.isoformat(), "end": (start + timedelta(hours=hours)).isoformat(),
            "eur_mwh": round(best[0], 2), "tariff_eur_kwh": tariff(best[0])}


def day_summary(day: str, points: list[tuple[int, float]], step_min: int) -> dict:
    vals = [v for _, v in points]
    mean = statistics.fmean(vals)
    return {
        "date": day,
        "step_minutes": step_min,
        "complete": len(points) * step_min >= 23 * 60,
        "mean_eur_mwh": round(mean, 2), "min_eur_mwh": min(vals), "max_eur_mwh": max(vals),
        "mean_tariff_eur_kwh": tariff(mean),
        "cheapest": [w for h in WINDOWS if (w := cheapest(points, h, step_min))],
        "slots": [{"start": datetime.fromtimestamp(t / 1000, BERLIN).isoformat(), "eur_mwh": v} for t, v in points],
    }


def by_day(series: dict[int, float]) -> dict[str, list[tuple[int, float]]]:
    days: dict[str, list] = defaultdict(list)
    for t in sorted(series):
        days[local_day(t)].append((t, series[t]))
    return days


def daily_rows(hourly: dict[int, float]) -> list[dict]:
    rows = []
    for day, pts in sorted(by_day(hourly).items()):
        vals = [v for _, v in pts]
        c1, c4 = cheapest(pts, 1, 60), cheapest(pts, 4, 60)
        rows.append({"date": day, "hours": len(vals), "mean_eur_mwh": round(statistics.fmean(vals), 2),
                     "min_eur_mwh": min(vals), "max_eur_mwh": max(vals),
                     "cheapest_1h_eur_mwh": c1["eur_mwh"] if c1 else "", "cheapest_4h_eur_mwh": c4["eur_mwh"] if c4 else "",
                     "negative_hours": sum(v < 0 for v in vals)})
    return rows


def run(store, now: datetime | None = None, log=print) -> dict:
    now = (now or datetime.now(timezone.utc)).replace(microsecond=0)
    ts = now.strftime("%Y%m%dT%H%M%SZ")
    hourly = load(store, "state/hourly.json")
    hourly.update(fetch("hour", None if not hourly else 2, log))
    quarter = load(store, "state/quarterhour.json")
    quarter.update(fetch("quarterhour", 2, log))
    cutoff = int((now - timedelta(days=21)).timestamp() * 1000)
    quarter = {t: v for t, v in quarter.items() if t >= cutoff}
    store.put("state/hourly.json", _json({str(k): v for k, v in sorted(hourly.items())}), "application/json")
    store.put("state/quarterhour.json", _json({str(k): v for k, v in sorted(quarter.items())}), "application/json")

    today = now.astimezone(BERLIN).date()
    wanted = [today.isoformat(), (today + timedelta(days=1)).isoformat()]
    qdays, hdays = by_day(quarter), by_day(hourly)
    days = []
    for d in wanted:
        if qdays.get(d):
            days.append(day_summary(d, qdays[d], 15))
        elif hdays.get(d):
            days.append(day_summary(d, hdays[d], 60))
    latest = {
        "dataset": "electricity-prices", "region": "DE", "observed_at": now.isoformat(), "currency": "EUR",
        "unit": "EUR/MWh day-ahead exchange price (bidding zone DE-LU); tariff_eur_kwh is an estimate incl. VAT",
        "source": "Bundesnetzagentur | SMARD.de", "source_url": smard.PAGE_URL, "licence": "CC BY 4.0",
        "timezone": "Europe/Berlin",
        "tariff_model": {"addon_eur_kwh_net": ADDON_EUR_KWH_NET, "vat": VAT,
                         "formula": "(eur_mwh / 1000 + addon_eur_kwh_net) * (1 + vat)",
                         "note": "Typical German dynamic tariff: grid fee, levies, electricity tax and supplier margin "
                                 "on top of the exchange price. Yours depends on your supplier and grid area."},
        "tomorrow_published": len(days) > 1,
        "days": days,
    }
    store.put("public/de/latest.json", _json(latest), "application/json")
    rows = daily_rows(hourly)
    store.put("public/de/daily.csv", to_csv(rows, list(rows[0])), "text/csv")
    store.put("public/de/hourly.csv", to_csv([{"start": smard.iso(t), "eur_mwh": v} for t, v in sorted(hourly.items())],
                                           ["start", "eur_mwh"]), "text/csv")
    first = smard.iso(min(hourly))
    store.put("public/index.json", _json({"dataset": "electricity-prices", "updated_at": now.isoformat(),
                                         "source": smard.PAGE_URL, "regions": {"de": {
                                             "files": ["latest.json", "daily.csv", "hourly.csv"], "first_hour": first,
                                             "latest_hour": smard.iso(max(hourly))}}}), "application/json")
    report = {"started_at": now.isoformat(), "store": str(store), "hours": len(hourly), "first_hour": first,
              "quarter_hours": len(quarter), "days": [d["date"] for d in days]}
    store.put(f"runs/{now:%Y/%m/%d}/{ts}.json", _json(report), "application/json")
    return {**report, "latest": latest}


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--prefix", default="electricity-prices", help="top-level folder in the bucket")
    where = p.add_mutually_exclusive_group(required=True)
    where.add_argument("--local")
    where.add_argument("--r2")
    args = p.parse_args(argv)
    base = LocalStore(args.local) if args.local else R2Store(args.r2)
    r = run(PrefixedStore(base, args.prefix))
    print({k: v for k, v in r.items() if k != "latest"})
    for d in r["latest"]["days"]:
        c = {w["hours"]: (w["start"][11:16], w["tariff_eur_kwh"]) for w in d["cheapest"]}
        print(d["date"], d["mean_tariff_eur_kwh"], c)
    return 0


if __name__ == "__main__":
    sys.exit(main())
