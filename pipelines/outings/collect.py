"""Copy Allo Outings' kid-friendly places and family events into map cells for the charger map.

    python -m pipelines.outings.collect --local ./out
    python -m pipelines.outings.collect --r2 <bucket> --prefix outings
    python -m pipelines.outings.collect --local ./out --places places.json --events events.json   # offline

Allo Outings rebuilds its listings every night and publishes them as open JSON (places from
OpenStreetMap, ODbL, and from parents; events from public city calendars and from parents).
A daily run after that rebuild keeps the copy fresh, so past events drop off.

Bucket layout (the R2_BUCKET_EV bucket, folder ``outings/``):

    outings/
      public/                     served at https://cars.allo.land/data/outings/
        index.json                regions, their files and last update
        de/
          latest.json             counts, source, list of cells
          cells/<id>.json         places and events in each 0.5 degree cell (see build.py)
      runs/YYYY/MM/DD/<ts>.json   what each run did
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from pipelines.charging_prices.http import get_bytes
from pipelines.charging_prices.storage import LocalStore, PrefixedStore, R2Store

from . import build

REGION = "de"
SOURCE = "https://outings.allo.land"
PLACES_URL = SOURCE + "/api/v1/places.json"
EVENTS_URL = SOURCE + "/api/v1/events.json"
FILES = ["latest.json", "cells/<id>.json"]
MIN_PLACES = 1000


def _json(obj, pretty: bool = True) -> bytes:
    if pretty:
        return json.dumps(obj, ensure_ascii=False, indent=2).encode()
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode()


def publish(store, places: dict, events: dict, now: datetime) -> dict:
    cs = build.cells(places.get("places") or [], events.get("events") or [], now.date())
    s = build.summary(cs)
    if s["places"] < MIN_PLACES:
        raise ValueError(f"only {s['places']} places, refusing to publish")
    pub = f"public/{REGION}"
    for cid, cell in cs.items():
        store.put(f"{pub}/cells/{cid}.json", _json(cell, pretty=False), "application/json")
    observed = places.get("generated") or now.date().isoformat()
    latest = {
        "dataset": "outings",
        "region": REGION.upper(),
        "observed_at": observed,
        "built_at": now.isoformat(),
        "source": "Allo Outings",
        "source_url": SOURCE,
        "source_files": [PLACES_URL, EVENTS_URL],
        "licence": "Places from OpenStreetMap (© OpenStreetMap contributors, ODbL) and from parents; "
                   "events from public calendars and from parents, via Allo Outings",
        "note": "Kid-friendly places and family events from Allo Outings, split into the same 0.5 degree cells as the "
                "charger map. Events are those running on any day in the next "
                f"{build.EVENT_DAYS} days. Page links: {SOURCE}/<de|en|zh>/orte/<id>/ for places, "
                f"{SOURCE}/<de|en|zh>/termine/<id>/ for events.",
        "kinds": build.KINDS,
        "cell_degrees": build.CELL,
        "cells": sorted(cs),
        **s,
    }
    store.put(f"{pub}/latest.json", _json(latest), "application/json")
    index = {
        "dataset": "outings",
        "updated_at": now.isoformat(),
        "regions": {REGION: {"files": FILES, "updated_at": now.isoformat(), "observed_at": observed}},
    }
    store.put("public/index.json", _json(index), "application/json")
    return {"observed_at": observed, "cells": len(cs), **{k: s[k] for k in ("places", "events")}}


def run(store, *, places_file: str | None = None, events_file: str | None = None) -> dict:
    now = datetime.now(timezone.utc).replace(microsecond=0)
    ts = now.strftime("%Y%m%dT%H%M%SZ")
    places = json.loads(Path(places_file).read_bytes() if places_file else get_bytes(PLACES_URL, timeout=180))
    events = json.loads(Path(events_file).read_bytes() if events_file else get_bytes(EVENTS_URL, timeout=180))
    result = publish(store, places, events, now)
    report = {"started_at": now.isoformat(), "store": str(store), "ok": True, **result}
    print(f"outings: {result}")
    store.put(f"runs/{now:%Y/%m/%d}/{ts}.json", _json(report), "application/json")
    return report


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--prefix", default="outings", help="top-level folder in the bucket (default: outings)")
    p.add_argument("--places", help="read places from this local file instead of downloading")
    p.add_argument("--events", help="read events from this local file instead of downloading")
    where = p.add_mutually_exclusive_group(required=True)
    where.add_argument("--local", help="write to this folder")
    where.add_argument("--r2", help="write to this R2 bucket")
    args = p.parse_args(argv)
    base = LocalStore(args.local) if args.local else R2Store(args.r2)
    store = PrefixedStore(base, args.prefix) if args.prefix else base
    run(store, places_file=args.places, events_file=args.events)
    return 0


if __name__ == "__main__":
    sys.exit(main())
