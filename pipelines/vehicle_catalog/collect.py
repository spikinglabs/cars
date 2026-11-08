"""Build the vehicle catalog: official consumption per car model from the EEA CO2 monitoring data.

    python -m pipelines.vehicle_catalog.collect --local ./out
    python -m pipelines.vehicle_catalog.collect --r2 <bucket>

Bucket layout (the R2_BUCKET_EV bucket, folder ``vehicle-catalog/``):

    vehicle-catalog/
      raw/eea-co2-cars/<table>.json      rows per country, make, name and fuel as the EEA returned them, stored when they changed
      raw/eea-co2-cars/latest.json       which table and copy the public files were built from
      raw/eea-co2-cars/tables.json       the table used for each older year (final tables do not change)
      public/                            served at https://cars.allo.land/data/vehicle-catalog/
        index.json                       regions, files, data year and version
        <region>/                        de (registered in Germany), eu (EU-27)
          models.json    every model with at least 20 new registrations in a year since 2021: official WLTP
                         kWh/100 km (electric energy at the plug), L/100 km, CO2 g/km, power, mass, registrations,
                         from the newest year the model was sold new (year), and the years it was sold (years)
          models.csv     the same as a table
          electric.json  electric models only, compact, for the charging cost page
      runs/YYYY/MM/DD/<ts>.json          what each run did

The EEA publishes a provisional year in spring or summer and the final one in autumn; a monthly run picks up the
newest table on its own. Older years (from 2021, the first year with WLTP figures for every car) keep models that
are no longer sold new, so drivers of older cars find theirs too.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone

from pipelines.charging_prices.normalize import to_csv
from pipelines.charging_prices.storage import LocalStore, PrefixedStore, R2Store

from . import catalog, eea

REGIONS = {"de": "Germany", "eu": "EU-27"}
FIRST_YEAR = 2021  # the first year with WLTP figures for every new car
NOTES = (
    "Official type-approval (WLTP) figures as reported for every new car registered in the year, averaged over the "
    "versions that were registered (weighted by registrations). kwh_per_100km is electric energy consumption at the "
    "plug, so it already includes charging losses; for plug-in hybrids it is the weighted combined figure. "
    "Real-world consumption is usually higher, most of all on the motorway and in winter. kwh_range and l_range span "
    "the versions that made up at least 1 % of a model's registrations. Models are kept from 2021 on, also when no "
    "longer sold new; year is the year of a model's figures and registrations (its newest year with at least a tenth "
    "of its best year's registrations), years the first and last year it was registered new. Provisional data can "
    "still change."
)


def _json(obj) -> bytes:
    return json.dumps(obj, ensure_ascii=False, indent=1).encode()


def _compact(obj) -> bytes:
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode()


def publish(store, rows: list[dict], info: dict, now: datetime, older: list[tuple[int, list[dict]]] = ()) -> dict:
    """older: (year, rows) of earlier data years, for models no longer sold new."""
    years = [(info["year"], catalog.by_scope(rows))] + [(y, catalog.by_scope(r)) for y, r in older]
    first = min(y for y, _ in years)
    index = {"dataset": "vehicle-catalog", "updated_at": now.isoformat(), "source": eea.PAGE_URL, **info,
             "years": [first, info["year"]], "regions": {}}
    counts = {}
    for region, label in REGIONS.items():
        models = catalog.merge([(y, catalog.build(r, region)) for y, r in years])
        meta = {
            "dataset": "vehicle-catalog",
            "region": region.upper(),
            "region_name": label,
            "year": info["year"],
            "years": [first, info["year"]],
            "status": info["status"],
            "version": info["version"],
            "updated_at": now.isoformat(),
            "source": "European Environment Agency, CO2 emissions from new passenger cars (Regulation (EU) 2019/631)",
            "source_url": eea.PAGE_URL,
            "licence": eea.LICENCE,
            "notes": NOTES,
        }
        store.put(f"public/{region}/models.json", _compact({**meta, "models": models}), "application/json")
        store.put(f"public/{region}/models.csv", to_csv(catalog.csv_rows(models), catalog.FIELDS), "text/csv")
        ev = catalog.electric(models)
        store.put(f"public/{region}/electric.json",
                  _compact({**meta, "columns": ["id", "name", "kwh_per_100km", "kwh_min", "kwh_max", "registrations"],
                         "models": ev}), "application/json")
        current = [m for m in models if m["years"][1] == info["year"]]
        counts[region] = {"models": len(models), "older_models": len(models) - len(current), "electric": len(ev),
                          "registrations": sum(m["registrations"] for m in current if m["year"] == info["year"])}
        index["regions"][region] = {"files": ["models.json", "models.csv", "electric.json"], **counts[region]}
    store.put("public/index.json", _json(index), "application/json")
    return counts


def older_years(store, latest_year: int, find=eea.find_table, fetch=eea.fetch_all) -> list[tuple[int, list[dict]]]:
    """Rows of each year from FIRST_YEAR to the one before latest_year. Final tables are found once and their rows
    kept in raw/; a provisional one is looked up again on each run until the final one appears."""
    known = json.loads(store.get("raw/eea-co2-cars/tables.json") or b"{}")
    tables, out = dict(known), []
    for year in range(FIRST_YEAR, latest_year):
        table = known.get(str(year))
        if not table or eea.table_info(table)["status"] != "final":
            table = find(year)
        tables[str(year)] = table
        key = f"raw/eea-co2-cars/{table}.json"
        cached = store.get(key)
        if cached:
            rows = json.loads(cached)
        else:
            rows = fetch(eea.aggregate_sql(table))
            if len(rows) < 1000:
                raise ValueError(f"only {len(rows)} rows from {table}; refusing to publish")
            store.put(key, json.dumps(rows, ensure_ascii=False, sort_keys=True).encode(), "application/json")
        out.append((year, rows))
    if tables != known:
        store.put("raw/eea-co2-cars/tables.json", _json(tables), "application/json")
    return out


def run(store, table: str | None = None) -> dict:
    now = datetime.now(timezone.utc).replace(microsecond=0)
    ts = now.strftime("%Y%m%dT%H%M%SZ")
    table = table or eea.find_latest_table(now.year)
    info = eea.table_info(table)
    rows = eea.fetch_all(eea.aggregate_sql(table))
    if len(rows) < 1000:
        raise ValueError(f"only {len(rows)} rows from {table}; refusing to publish")

    raw = json.dumps(rows, ensure_ascii=False, sort_keys=True).encode()
    digest = hashlib.sha256(raw).hexdigest()
    previous = store.get("raw/eea-co2-cars/latest.json")
    stored = not (previous and json.loads(previous).get("sha256") == digest)
    if stored:
        store.put(f"raw/eea-co2-cars/{table}.json", raw, "application/json")
        store.put("raw/eea-co2-cars/latest.json",
                  _json({**info, "key": f"raw/eea-co2-cars/{table}.json", "sha256": digest, "rows": len(rows),
                         "observed_at": now.isoformat()}), "application/json")

    older = older_years(store, info["year"])
    counts = publish(store, rows, info, now, older)
    report = {"started_at": now.isoformat(), "store": str(store), **info, "rows": len(rows), "raw_stored": stored,
              "older_years": [y for y, _ in older], "regions": counts}
    store.put(f"runs/{now:%Y/%m/%d}/{ts}.json", _json(report), "application/json")
    return report


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--prefix", default="vehicle-catalog", help="top-level folder in the bucket")
    p.add_argument("--table", help="EEA table to use, for example co2cars_2025Pv31 (default: the newest)")
    where = p.add_mutually_exclusive_group(required=True)
    where.add_argument("--local")
    where.add_argument("--r2")
    args = p.parse_args(argv)
    base = LocalStore(args.local) if args.local else R2Store(args.r2)
    report = run(PrefixedStore(base, args.prefix), args.table)
    print(f"{report['table']} ({report['status']} {report['year']}): {report['rows']} rows, raw stored: {report['raw_stored']}")
    for region, c in report["regions"].items():
        print(f"  {region}: {c['models']} models ({c['older_models']} only in older years), {c['electric']} electric, "
              f"{c['registrations']} registrations")
    return 0


if __name__ == "__main__":
    sys.exit(main())
