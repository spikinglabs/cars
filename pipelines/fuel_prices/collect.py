"""Collect German fuel prices.

    python -m pipelines.fuel_prices.collect --local ./out
    python -m pipelines.fuel_prices.collect --r2 spikinglabs-cars-ice

Bucket layout (bucket spikinglabs-cars-ice, folder ``fuel-prices/``):

    fuel-prices/
      raw/eu-oil-bulletin/YYYY/MM/DD/<ts>.xlsx   history workbook, stored only when it changed
      raw/eu-oil-bulletin/latest.json            manifest of the newest stored copy
      public/                                    served at https://cars.allo.land/data/fuel-prices/
        weekly.csv     date, euro_super_95, diesel, lpg (EUR per litre incl. taxes), since 2005
        latest.json    newest week, change on the previous week, 4-week and 52-week averages
      runs/YYYY/MM/DD/<ts>.json                  what each run did
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone

from pipelines.charging_prices.http import get_bytes
from pipelines.charging_prices.normalize import to_csv
from pipelines.charging_prices.storage import LocalStore, PrefixedStore, R2Store

from . import oil_bulletin


def _json(obj) -> bytes:
    return json.dumps(obj, ensure_ascii=False, indent=2).encode()


def _avg(rows: list[dict], field: str) -> float | None:
    vals = [r[field] for r in rows if r[field] is not None]
    return round(sum(vals) / len(vals), 4) if vals else None


def summarize(rows: list[dict], observed_at: str) -> dict:
    last, prev = rows[-1], rows[-2] if len(rows) > 1 else None
    products = {}
    for field in oil_bulletin.PRODUCTS.values():
        products[field] = {
            "eur_per_litre": last[field],
            "change_vs_previous_week": round(last[field] - prev[field], 4) if prev and last[field] and prev[field] else None,
            "avg_4_weeks": _avg(rows[-4:], field),
            "avg_52_weeks": _avg(rows[-52:], field),
        }
    return {
        "week": last["date"],
        "observed_at": observed_at,
        "country": "DE",
        "unit": "EUR per litre, national weekly average incl. all taxes",
        "products": products,
        "notes": "euro_super_95 is Euro-super 95 as Germany reports it to the bulletin. Each week is dated the Monday the bulletin refers to.",
        "source": "European Commission, Weekly Oil Bulletin",
        "source_url": oil_bulletin.PAGE_URL,
        "licence": "CC BY 4.0 (Commission Decision 2011/833/EU)",
    }


def run(store) -> dict:
    now = datetime.now(timezone.utc).replace(microsecond=0)
    ts = now.strftime("%Y%m%dT%H%M%SZ")
    page = get_bytes(oil_bulletin.PAGE_URL).decode("utf-8", "replace")
    url = oil_bulletin.find_history_url(page)
    xlsx = get_bytes(url, timeout=300)
    digest = hashlib.sha256(xlsx).hexdigest()

    previous = store.get("raw/eu-oil-bulletin/latest.json")
    stored = not (previous and json.loads(previous).get("sha256") == digest)
    if stored:
        key = f"raw/eu-oil-bulletin/{now:%Y/%m/%d}/{ts}.xlsx"
        store.put(key, xlsx, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        store.put(
            "raw/eu-oil-bulletin/latest.json",
            _json({"url": url, "key": key, "sha256": digest, "bytes": len(xlsx), "observed_at": now.isoformat()}),
            "application/json",
        )

    rows = oil_bulletin.parse_history(xlsx)
    summary = summarize(rows, now.isoformat())
    store.put("public/weekly.csv", to_csv(rows, oil_bulletin.FIELDS), "text/csv")
    store.put("public/latest.json", _json(summary), "application/json")

    report = {"started_at": now.isoformat(), "store": str(store), "url": url, "raw_stored": stored,
              "weeks": len(rows), "first_week": rows[0]["date"], "latest_week": rows[-1]["date"]}
    store.put(f"runs/{now:%Y/%m/%d}/{ts}.json", _json(report), "application/json")
    return {**report, "summary": summary}


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--prefix", default="fuel-prices", help="top-level folder in the bucket")
    where = p.add_mutually_exclusive_group(required=True)
    where.add_argument("--local")
    where.add_argument("--r2")
    args = p.parse_args(argv)
    base = LocalStore(args.local) if args.local else R2Store(args.r2)
    report = run(PrefixedStore(base, args.prefix))
    s = report["summary"]["products"]
    print(f"{report['weeks']} weeks {report['first_week']}..{report['latest_week']}, raw stored: {report['raw_stored']}")
    print({k: v["eur_per_litre"] for k, v in s.items()})
    return 0


if __name__ == "__main__":
    sys.exit(main())
