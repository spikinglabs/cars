"""Collect charging data snapshots.

    python -m pipelines.charging_prices.collect --tier hourly --local ./out
    python -m pipelines.charging_prices.collect --tier daily --r2 spikinglabs-cars --prefix charging-prices

Tiers:
    hourly  prices (stored only when changed) + charger status changes
    daily   Bundesnetzagentur register files + storage usage check
    weekly  full raw copy of locations and businesses

Everything is sized to stay inside the Cloudflare R2 free tier (10 GB, 1M writes/month):
roughly 1.5-2.5 GB per year.

Bucket layout. The bucket is shared with other projects, so everything this
pipeline writes lives under one top-level folder, ``charging-prices/``
(``--prefix``). Inside it:

    charging-prices/
      raw/                                   source data exactly as fetched
        ocpdb/<dataset>/YYYY/MM/DD/<ts>.jsonl.gz      every item, one per line
        ocpdb/<dataset>/latest.json                   manifest of the newest stored copy
        ocpdb/evse_status/YYYY/MM/DD/<ts>.csv.gz      first status snapshot of each day
        ocpdb/evse_status_changes/YYYY/MM/DD/<ts>.csv.gz   status changes since the last run
        bnetza/register/<original file name>          each register file once
      derived/                               our processed tables
        tariffs/YYYY/MM/DD/<ts>.csv.gz                flat tariffs, all sources
      public/                                served at https://cars.allo.land/data/charging-prices/
        latest.json  daily.csv  tariffs.csv  sources.json   (open-licence sources only)
      state/                                 bookkeeping between runs
        evse_status.json.gz  evse_status_day
      runs/YYYY/MM/DD/<ts>-<tier>.json       what each run did

``<ts>`` is the UTC run time, e.g. ``20261106T210552Z``.
The website serves ``<project>/public/`` for every project folder (site/functions/data/[[path]].js).
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import sys
import time
import traceback
from datetime import datetime, timezone

from . import bnetza, normalize, ocpdb
from .http import get_bytes
from .storage import LocalStore, PrefixedStore, R2Store


def _gz_jsonl(items: list[dict]) -> bytes:
    body = "".join(json.dumps(i, ensure_ascii=False, separators=(",", ":")) + "\n" for i in items)
    return gzip.compress(body.encode(), mtime=0)


def _json(obj) -> bytes:
    return json.dumps(obj, ensure_ascii=False, indent=2).encode()


def _datepath(now: datetime) -> str:
    return now.strftime("%Y/%m/%d")


def collect_ocpdb(store, now: datetime, ts: str, names: list[str], log: list) -> dict[str, list[dict]]:
    """Fetch raw datasets; store a copy only when it differs from the last stored one."""
    fetched: dict[str, list[dict]] = {}
    for name in names:
        ds = ocpdb.dataset(name)
        started = time.monotonic()
        try:
            items, total = ocpdb.fetch_all(ds.path)
        except Exception as exc:  # keep going; the run report shows the failure
            log.append({"dataset": name, "ok": False, "error": repr(exc)})
            traceback.print_exc()
            continue
        fetched[name] = items
        body = _gz_jsonl(items)
        digest = hashlib.sha256(body).hexdigest()
        previous = store.get(f"raw/ocpdb/{name}/latest.json")
        if previous and json.loads(previous).get("sha256") == digest:
            log.append({"dataset": name, "ok": True, "items": len(items), "stored": False, "reason": "unchanged"})
            print(f"{name}: {len(items)} items, unchanged")
            continue
        key = f"raw/ocpdb/{name}/{_datepath(now)}/{ts}.jsonl.gz"
        store.put(key, body, "application/x-ndjson")
        manifest = {
            "dataset": name,
            "description": ds.description,
            "url": ocpdb.BASE_URL + ds.path,
            "observed_at": now.isoformat(),
            "items": len(items),
            "total_count": total,
            "key": key,
            "bytes": len(body),
            "sha256": digest,
            "seconds": round(time.monotonic() - started, 1),
        }
        store.put(f"raw/ocpdb/{name}/latest.json", _json(manifest), "application/json")
        log.append({**manifest, "ok": True, "stored": True})
        print(f"{name}: {len(items)} items (API total {total}) in {manifest['seconds']}s -> {key}")
    return fetched


STATUS_FIELDS = ["uid", "evse_id", "status", "status_last_updated", "presence"]
CHANGE_FIELDS = ["uid", "evse_id", "old_status", "status", "status_last_updated"]


def collect_evse_status(store, now: datetime, ts: str, log: list) -> None:
    """Keep charger status history compact: a full snapshot once a day, changes every run.

    EVSEs with status STATIC have no live data and are left out.
    """
    started = time.monotonic()
    try:
        items, total = ocpdb.fetch_all(ocpdb.dataset("evses").path)
    except Exception as exc:
        log.append({"dataset": "evse_status", "ok": False, "error": repr(exc)})
        traceback.print_exc()
        return
    live = [i for i in items if i.get("status") not in (None, "STATIC")]
    current = {i["uid"]: i for i in live}

    state_key = "state/evse_status.json.gz"
    raw_state = store.get(state_key)
    previous: dict = json.loads(gzip.decompress(raw_state)) if raw_state else {}

    changes = []
    for uid, i in current.items():
        old = previous.get(uid)
        if old is None or old[0] != i.get("status"):
            changes.append(
                {
                    "uid": uid,
                    "evse_id": i.get("evse_id"),
                    "old_status": old[0] if old else "",
                    "status": i.get("status"),
                    "status_last_updated": i.get("status_last_updated"),
                }
            )
    for uid, old in previous.items():
        if uid not in current:
            changes.append({"uid": uid, "evse_id": old[2], "old_status": old[0], "status": "GONE", "status_last_updated": ""})

    day = _datepath(now)
    snapshot_written = False
    if store.get("state/evse_status_day") != day.encode():
        rows = [{k: i.get(k) for k in STATUS_FIELDS} for i in live]
        store.put(f"raw/ocpdb/evse_status/{day}/{ts}.csv.gz", gzip.compress(normalize.to_csv(rows, STATUS_FIELDS), mtime=0), "text/csv")
        store.put("state/evse_status_day", day.encode(), "text/plain")
        snapshot_written = True
    if changes and previous:
        store.put(
            f"raw/ocpdb/evse_status_changes/{day}/{ts}.csv.gz",
            gzip.compress(normalize.to_csv(changes, CHANGE_FIELDS), mtime=0),
            "text/csv",
        )
    new_state = {uid: [i.get("status"), i.get("status_last_updated"), i.get("evse_id")] for uid, i in current.items()}
    store.put(state_key, gzip.compress(json.dumps(new_state, separators=(",", ":")).encode(), mtime=0), "application/json")
    entry = {
        "dataset": "evse_status",
        "ok": True,
        "evses": len(items),
        "api_total": total,
        "live": len(live),
        "changes": len(changes) if previous else None,
        "daily_snapshot": snapshot_written,
        "seconds": round(time.monotonic() - started, 1),
    }
    log.append(entry)
    print(f"evse_status: {entry}")


def publish_prices(store, now: datetime, ts: str, sources: list[dict], tariffs: list[dict]) -> dict:
    licences = {s["uid"]: s.get("attribution_license") for s in sources}
    observed = now.isoformat()
    rows = normalize.flatten_tariffs(tariffs, licences, observed)
    store.put(
        f"derived/tariffs/{_datepath(now)}/{ts}.csv.gz",
        gzip.compress(normalize.to_csv(rows, normalize.TARIFF_FIELDS), mtime=0),
        "text/csv",
    )
    public_rows = [r for r in rows if r["licence"] in normalize.OPEN_LICENCES]
    summary = normalize.summarize(rows)
    public_sources = [
        {
            "uid": s["uid"],
            "name": s.get("name"),
            "licence": s.get("attribution_license"),
            "licence_url": s.get("attribution_url"),
            "contributor": s.get("attribution_contributor"),
            "public_url": s.get("public_url"),
            "static_data_updated_at": s.get("static_data_updated_at"),
            "realtime_data_updated_at": s.get("realtime_data_updated_at"),
            "published": s.get("attribution_license") in normalize.OPEN_LICENCES,
        }
        for s in sources
    ]
    latest = {
        "observed_at": observed,
        "unit": "EUR per kWh, incl. VAT, ad-hoc (no contract)",
        "note": "Base energy price of each ad-hoc tariff. Only sources with an open licence are included.",
        "data_source": "Open ChargePoint Database (MobiData BW), https://api.mobidata-bw.de/ocpdb/",
        **summary,
    }
    store.put("public/latest.json", _json(latest), "application/json")
    store.put("public/sources.json", _json(public_sources), "application/json")
    store.put(
        "public/tariffs.csv",
        normalize.to_csv(public_rows, normalize.TARIFF_FIELDS),
        "text/csv",
    )
    daily_key = "public/daily.csv"
    store.put(daily_key, normalize.upsert_daily(store.get(daily_key), now.date().isoformat(), summary), "text/csv")
    return summary


def collect_bnetza(store, log: list) -> None:
    try:
        links = bnetza.list_register_files()
    except Exception as exc:
        log.append({"dataset": "bnetza_register", "ok": False, "error": repr(exc)})
        traceback.print_exc()
        return
    for url in links:
        key = f"raw/bnetza/register/{bnetza.filename(url)}"
        if store.exists(key):
            continue
        try:

            data = get_bytes(url, timeout=300)
        except Exception as exc:
            log.append({"dataset": "bnetza_register", "url": url, "ok": False, "error": repr(exc)})
            continue
        store.put(key, data, "text/csv" if key.endswith(".csv") else "application/octet-stream")
        log.append({"dataset": "bnetza_register", "url": url, "key": key, "bytes": len(data), "ok": True})
        print(f"bnetza: archived {key} ({len(data)} bytes)")


FREE_TIER_BYTES = 10 * 1000**3
WARN_BYTES = 8 * 1000**3


def check_storage(store, log: list) -> None:
    size, count = store.total_bytes()
    entry = {"dataset": "storage", "ok": size < WARN_BYTES, "bytes": size, "objects": count}
    if size >= WARN_BYTES:
        entry["error"] = f"bucket uses {size / 1e9:.2f} GB of the {FREE_TIER_BYTES / 1e9:.0f} GB free tier"
    log.append(entry)
    print(f"storage: {size / 1e6:.1f} MB in {count} objects")


def run(store, tier: str, datasets: list[str] | None = None) -> dict:
    now = datetime.now(timezone.utc).replace(microsecond=0)
    ts = now.strftime("%Y%m%dT%H%M%SZ")
    log: list = []
    names = datasets or [d.name for d in ocpdb.DATASETS if d.tier == tier]
    fetched = collect_ocpdb(store, now, ts, [n for n in names if n != "evses"], log)

    summary = None
    if "sources" in fetched and "tariffs_ocpi22" in fetched:
        summary = publish_prices(store, now, ts, fetched["sources"], fetched["tariffs_ocpi22"])
    if (tier == "hourly" and not datasets) or (datasets and "evses" in datasets):
        collect_evse_status(store, now, ts, log)
    if tier == "daily" and not datasets:
        collect_bnetza(store, log)
        check_storage(store, log)

    report = {"tier": tier, "started_at": now.isoformat(), "store": str(store), "steps": log, "summary": summary}
    store.put(f"runs/{_datepath(now)}/{ts}-{tier}.json", _json(report), "application/json")
    return report


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--tier", choices=["hourly", "daily", "weekly"], required=True)
    p.add_argument("--prefix", default="charging-prices", help="top-level folder in the bucket (default: charging-prices)")
    p.add_argument("--datasets", nargs="*", help="only these OCPDB datasets (default: all of the tier)")
    where = p.add_mutually_exclusive_group(required=True)
    where.add_argument("--local", help="write to this folder")
    where.add_argument("--r2", help="write to this R2 bucket")
    args = p.parse_args(argv)

    base = LocalStore(args.local) if args.local else R2Store(args.r2)
    store = PrefixedStore(base, args.prefix) if args.prefix else base
    report = run(store, args.tier, args.datasets)
    failed = [s for s in report["steps"] if not s.get("ok")]
    for f in failed:
        print(f"FAILED: {f}", file=sys.stderr)
    if report["summary"] and report["summary"]["overall"]:
        o = report["summary"]["overall"]
        print(f"ad-hoc energy price: median {o['median']} EUR/kWh over {o['tariffs']} tariffs")
    # Any failure fails the workflow (so GitHub emails), but whatever was collected is already stored.
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
