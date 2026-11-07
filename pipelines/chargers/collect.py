"""Build the charger map data from the Bundesnetzagentur Ladesäulenregister.

    python -m pipelines.chargers.collect --local ./out
    python -m pipelines.chargers.collect --r2 <bucket> --prefix chargers
    python -m pipelines.chargers.collect --local ./out --file Ladesaeulenregister.csv   # offline

The register is published a few times a year (CSV or XLSX, CC BY 4.0, "Bundesnetzagentur.de").
A daily check reads the download page and rebuilds only when a newer file appears.
The raw files themselves are archived by the charging-prices pipeline (raw/bnetza/register/).

Bucket layout (the R2_BUCKET_EV bucket, folder ``chargers/``):

    chargers/
      public/                     served at https://cars.allo.land/data/chargers/
        index.json                regions, their files and last update
        de/
          latest.json             counts, by federal state, top operators, source
          overview.json           station counts on a 0.1 degree grid
          cells/<id>.json         stations in each 0.5 degree cell (see build.py)
          places.json             postcode and town centres for search
          stations.csv            every station in one table
          stats.json              statistics: by state, district and town, power classes, plugs, years (see stats.py)
          districts.csv           charge points per district with population and electric cars
      state/source.json           which register file the public data was built from
      runs/YYYY/MM/DD/<ts>.json   what each run did
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from pipelines.charging_prices import bnetza
from pipelines.charging_prices.http import get_bytes
from pipelines.charging_prices.storage import LocalStore, PrefixedStore, R2Store

from . import build, register, stats

REGION = "de"
FILES = ["latest.json", "overview.json", "places.json", "stations.csv", "cells/<id>.json", "stats.json", "districts.csv"]
# Raise when the files built from one register change, so the next run rebuilds even without a new register.
BUILD_VERSION = 2


def _json(obj, pretty: bool = True) -> bytes:
    if pretty:
        return json.dumps(obj, ensure_ascii=False, indent=2).encode()
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode()


def newest(links: list[str]) -> str:
    """The register file with the latest date in its name; CSV wins a tie (faster to read)."""
    def key(url: str):
        name = bnetza.filename(url)
        return (register.file_date(name) or "", name.lower().endswith(".csv"))
    return max(links, key=key)


def publish(store, data: bytes, name: str, source_url: str, now: datetime) -> dict:
    meta, rows = register.read(data, name)
    sts = build.stations(rows)
    bad = {id(s) for s in build.misplaced(sts)}
    unplaced = len(bad)
    sts = [s for s in sts if id(s) not in bad]
    if len(sts) < 1000:
        raise ValueError(f"{name}: only {len(sts)} stations, refusing to publish")
    cells = build.cells(sts)
    pub = f"public/{REGION}"
    for cid, cell in cells.items():
        store.put(f"{pub}/cells/{cid}.json", _json(cell, pretty=False), "application/json")
    store.put(f"{pub}/overview.json", _json(build.overview(sts), pretty=False), "application/json")
    store.put(f"{pub}/places.json", _json(build.places(sts), pretty=False), "application/json")
    store.put(f"{pub}/stations.csv", build.stations_csv(sts), "text/csv")
    st = stats.stats_json(rows, meta, stats.load_reference(), now.isoformat(), source_url, bnetza.DOWNLOAD_PAGE)
    if st["unmatched_districts"]:
        print(f"chargers: devices with an unknown district: {st['unmatched_districts']}")
    store.put(f"{pub}/stats.json", _json(st, pretty=False), "application/json")
    store.put(f"{pub}/districts.csv", stats.districts_csv(st), "text/csv")
    updated = meta.get("updated") or meta.get("file_date")
    latest = {
        "dataset": "chargers",
        "region": REGION.upper(),
        "observed_at": updated,
        "built_at": now.isoformat(),
        "source": "Bundesnetzagentur, Ladesäulenregister",
        "source_url": bnetza.DOWNLOAD_PAGE,
        "source_file": source_url,
        "licence": "CC BY 4.0, Bundesnetzagentur.de",
        "note": "Public charge points whose operators completed the Bundesnetzagentur notification. "
                "Devices at the same place (within about 10 m) are merged into one station. "
                "kw is the highest rated power of any charge point there. "
                "Stations more than 25 km from the other stations of their postcode are left out (left_out_misplaced), "
                "because their coordinates do not match their address.",
        "plugs": build.PLUGS,
        "flags": build.FLAGS,
        "cell_degrees": build.CELL,
        "cells": sorted(cells),
        **build.summary(sts, rows),
        "left_out_misplaced": unplaced,
    }
    store.put(f"{pub}/latest.json", _json(latest), "application/json")
    index = {
        "dataset": "chargers",
        "updated_at": now.isoformat(),
        "regions": {REGION: {"files": FILES, "updated_at": updated, "observed_at": updated}},
    }
    store.put("public/index.json", _json(index), "application/json")
    return {"file": name, "updated": updated, "devices": len(rows), "stations": len(sts), "cells": len(cells), "left_out_misplaced": unplaced}


def run(store, *, local_file: str | None = None, force: bool = False) -> dict:
    now = datetime.now(timezone.utc).replace(microsecond=0)
    ts = now.strftime("%Y%m%dT%H%M%SZ")
    report: dict = {"started_at": now.isoformat(), "store": str(store)}
    if local_file:
        url, name, data = local_file, Path(local_file).name, Path(local_file).read_bytes()
    else:
        url = newest(bnetza.list_register_files())
        name = bnetza.filename(url)
        previous = store.get("state/source.json")
        prev = json.loads(previous) if previous else {}
        if prev.get("file") == name and prev.get("build_version", 1) >= BUILD_VERSION and not force:
            report.update(ok=True, built=False, reason=f"{name} already published")
            print(report["reason"])
            store.put(f"runs/{now:%Y/%m/%d}/{ts}.json", _json(report), "application/json")
            return report
        data = get_bytes(url, timeout=300)
    result = publish(store, data, name, url, now)
    store.put("state/source.json", _json({"file": name, "url": url, "built_at": now.isoformat(), "build_version": BUILD_VERSION, **result}), "application/json")
    report.update(ok=True, built=True, **result)
    print(f"chargers: {result}")
    store.put(f"runs/{now:%Y/%m/%d}/{ts}.json", _json(report), "application/json")
    return report


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--prefix", default="chargers", help="top-level folder in the bucket (default: chargers)")
    p.add_argument("--file", help="build from this local register file instead of downloading")
    p.add_argument("--force", action="store_true", help="rebuild even if the newest file was published already")
    where = p.add_mutually_exclusive_group(required=True)
    where.add_argument("--local", help="write to this folder")
    where.add_argument("--r2", help="write to this R2 bucket")
    args = p.parse_args(argv)
    base = LocalStore(args.local) if args.local else R2Store(args.r2)
    store = PrefixedStore(base, args.prefix) if args.prefix else base
    run(store, local_file=args.file, force=args.force)
    return 0


if __name__ == "__main__":
    sys.exit(main())
