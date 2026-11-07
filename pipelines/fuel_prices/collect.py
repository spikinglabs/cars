"""Collect weekly fuel prices for every EU country (and the EU average).

    python -m pipelines.fuel_prices.collect --local ./out
    python -m pipelines.fuel_prices.collect --r2 <bucket>

Bucket layout (the R2_BUCKET_ICE bucket, folder ``fuel-prices/``):

    fuel-prices/
      raw/eu-oil-bulletin/YYYY/MM/DD/<ts>.xlsx   history workbook, stored only when it changed
      raw/eu-oil-bulletin/latest.json            manifest of the newest stored copy
      public/                                    served at https://cars.allo.land/data/fuel-prices/
        index.json                               regions, their files and last update
        <region>/                                de, eu (EU weighted average), at, fr, pl, ...
          weekly.csv   date, euro_super_95, diesel, lpg per litre incl. taxes, in the
                       region's currency (non-euro regions add *_eur columns), since 2005
          latest.json  newest week, change on the previous week, 4-week and 52-week averages
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


def summarize(rows: list[dict], observed_at: str, region: str = "de", currency: str = "EUR") -> dict:
    last, prev = rows[-1], rows[-2] if len(rows) > 1 else None
    products = {}
    for field in oil_bulletin.PRODUCTS.values():
        eur = field if currency == "EUR" else field + "_eur"
        products[field] = {
            "price_per_litre": last[field],
            "eur_per_litre": last[eur],
            "change_vs_previous_week": round(last[field] - prev[field], 4) if prev and last[field] and prev[field] else None,
            "avg_4_weeks": _avg(rows[-4:], field),
            "avg_52_weeks": _avg(rows[-52:], field),
        }
    return {
        "dataset": "fuel-prices",
        "region": region.upper(),
        "observed_at": observed_at,
        "currency": currency,
        "unit": f"{currency} per litre, national weekly average incl. all taxes",
        "source": "European Commission, Weekly Oil Bulletin",
        "source_url": oil_bulletin.PAGE_URL,
        "licence": "CC BY 4.0 (Commission Decision 2011/833/EU)",
        "week": last["date"],
        "products": products,
        "notes": "price_per_litre is in the region's currency, eur_per_litre in euro. "
                 "Each week is dated the Monday the bulletin refers to. Region EU is the EU weighted average.",
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

    regions = oil_bulletin.parse_all(xlsx)
    if "de" not in regions:
        raise ValueError(f"Germany missing from the bulletin; regions: {sorted(regions)}")
    index = {"dataset": "fuel-prices", "updated_at": now.isoformat(), "source": oil_bulletin.PAGE_URL, "regions": {}}
    for region, (rows, currency) in regions.items():
        summary = summarize(rows, now.isoformat(), region, currency)
        store.put(f"public/{region}/weekly.csv", to_csv(rows, oil_bulletin.fields(currency)), "text/csv")
        store.put(f"public/{region}/latest.json", _json(summary), "application/json")
        index["regions"][region] = {"files": ["latest.json", "weekly.csv"], "currency": currency,
                                    "first_week": rows[0]["date"], "latest_week": rows[-1]["date"],
                                    "updated_at": now.isoformat()}
    store.put("public/index.json", _json(index), "application/json")

    de = regions["de"][0]
    report = {"started_at": now.isoformat(), "store": str(store), "url": url, "raw_stored": stored,
              "regions": sorted(regions), "weeks": len(de), "first_week": de[0]["date"], "latest_week": de[-1]["date"]}
    store.put(f"runs/{now:%Y/%m/%d}/{ts}.json", _json(report), "application/json")
    return {**report, "summary": summarize(de, now.isoformat())}


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
    print(f"{len(report['regions'])} regions; DE {report['weeks']} weeks {report['first_week']}..{report['latest_week']}, raw stored: {report['raw_stored']}")
    print({k: v["eur_per_litre"] for k, v in s.items()})
    return 0


if __name__ == "__main__":
    sys.exit(main())
