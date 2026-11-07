"""Collect car recalls: EU Safety Gate (all motor vehicles) and US NHTSA (the models Allo Cars follows).

    python -m pipelines.recalls.collect --local ./out
    python -m pipelines.recalls.collect --r2 <bucket>

Bucket layout (the R2_BUCKET_EV bucket, which is shared by project folders; this one is ``recalls/``):

    recalls/
      state/safety-gate.json     every motor vehicle alert read so far, and which weekly reports are done
      public/                    served at https://cars.allo.land/data/recalls/
        index.json               regions, files, last update
        eu/                      EU Safety Gate (EU countries, Norway, Iceland, Liechtenstein, Northern Ireland)
          latest.json            counts and the newest alerts
          recalls.csv            every motor vehicle alert since --since, newest first
          recent.json            the last 365 days
          brands.json            brands with their number of alerts and file
          brand/<slug>.json      every alert of one brand
          models.json            the models Allo Cars follows, with counts
          models/<slug>.json     alerts that name one of them (volvo-ex30, mazda-cx-30, ...)
        us/
          models/<slug>.json     NHTSA campaigns for the followed models sold in the US
      runs/YYYY/MM/DD/<ts>.json  what each run did

Safety Gate's weekly reports are fixed once published, so each is read once. The first runs work back to --since
within --budget seconds each; later runs only read new weeks.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import unicodedata
from datetime import date, datetime, timedelta, timezone

from pipelines.charging_prices.http import get_bytes, get_json
from pipelines.charging_prices.normalize import to_csv
from pipelines.charging_prices.storage import LocalStore, PrefixedStore, R2Store

from . import nhtsa, safety_gate
from .models import MODELS, matches

STATE = "state/safety-gate.json"
SG_LICENCE = "Reuse allowed with attribution, Commission Decision 2011/833/EU (CC BY 4.0)"
CSV_FIELDS = ["date", "id", "brand", "models", "product", "type_approval", "production", "risk", "level",
              "hazard", "measure", "taken_by", "in_force", "recall_code", "notified_by", "origin", "url", "report"]


def _json(obj) -> bytes:
    return json.dumps(obj, ensure_ascii=False, indent=1).encode()


def slug(text: str) -> str:
    s = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-") or "other"


def brand_key(brand: str | None) -> str:
    """Safety Gate spells brands loosely (VW, Volkswagen, VOLKSWAGEN AG): one key per brand."""
    b = re.sub(r"\b(ag|gmbh|ltd|inc|s\.?a\.?|s\.?p\.?a\.?|co\.?)\b\.?", "", (brand or "").lower())
    b = re.sub(r"\s+", " ", b).strip(" ,.-")
    aliases = {"vw": "volkswagen", "mercedes": "mercedes-benz", "mercedes benz": "mercedes-benz",
               "škoda": "skoda", "citroën": "citroen", "bmw motorrad": "bmw"}
    return slug(aliases.get(b, b)) if b else "unknown"


def envelope(region: str, now: str, **extra) -> dict:
    sg = region == "eu"
    return {
        "dataset": "recalls",
        "region": region.upper(),
        "observed_at": now,
        "source": "European Commission, Safety Gate" if sg else "US National Highway Traffic Safety Administration (NHTSA)",
        "source_url": safety_gate.PAGE_URL if sg else "https://www.nhtsa.gov/recalls",
        "licence": SG_LICENCE if sg else "Public domain (US government work)",
        **extra,
    }


def read_safety_gate(store, since: int, budget: float, log=print) -> tuple[dict, dict]:
    raw = store.get(STATE)
    state = json.loads(raw) if raw else {"done": [], "alerts": {}}
    done = set(state["done"])
    year = datetime.now(timezone.utc).year
    reports = [(r, u) for r, u in safety_gate.report_list(get_bytes(safety_gate.LIST_URL.format(year=year)))
               if (safety_gate.report_year(r) or 0) >= since]
    todo = [(r, u) for r, u in reports if r not in done]
    start, read, failed = time.monotonic(), 0, []
    for ref, url in todo:  # newest first
        if time.monotonic() - start > budget:
            log(f"Safety Gate: time is up after {read} reports; {len(todo) - read} follow next run")
            break
        try:
            for a in safety_gate.parse_report(get_bytes(url, timeout=120), ref):
                state["alerts"][a["id"]] = a
        except Exception as exc:  # one broken report must not stop the rest
            failed.append(ref)
            log(f"Safety Gate {ref}: {exc!r}")
            continue
        done.add(ref)
        read += 1
        if read % 25 == 0:
            state["done"] = sorted(done)
            store.put(STATE, _json(state), "application/json")
    state["done"] = sorted(done)
    store.put(STATE, _json(state), "application/json")
    first = min((r for r in done), key=lambda r: (safety_gate.report_year(r) or 0, int(r.rsplit("-", 1)[-1])), default=None)
    stats = {"reports_total": len(reports), "reports_read_now": read, "reports_failed": failed,
             "reports_left": len(todo) - read - len(failed), "oldest_report_read": first}
    return state["alerts"], stats


def publish_eu(store, alerts: dict, now: str, stats: dict) -> dict:
    rows = sorted(alerts.values(), key=lambda a: (a.get("date") or "", a["id"]), reverse=True)
    today = datetime.fromisoformat(now).date()
    year_ago = (today - timedelta(days=365)).isoformat()
    month_ago = (today - timedelta(days=30)).isoformat()
    recent = [a for a in rows if (a.get("date") or "") >= year_ago]

    store.put("public/eu/recalls.csv", to_csv(rows, CSV_FIELDS), "text/csv")
    store.put("public/eu/recent.json", _json(envelope("eu", now, alerts=recent)), "application/json")

    brands: dict[str, dict] = {}
    for a in rows:
        k = brand_key(a.get("brand"))
        b = brands.setdefault(k, {"slug": k, "names": {}, "alerts": [], "cars": 0})
        car = (a.get("product") or "").lower().startswith("passenger car")
        name = a.get("brand") or "Unknown"
        b["names"][name] = b["names"].get(name, 0) + 1 + 100 * car  # name the brand as its car alerts do
        b["alerts"].append(a)
        b["cars"] += car
    brand_list = []
    for k, b in sorted(brands.items(), key=lambda kv: -len(kv[1]["alerts"])):
        name = max(b["names"], key=lambda n: (b["names"][n], n != n.upper()))
        store.put(f"public/eu/brand/{k}.json", _json(envelope("eu", now, brand=name, alerts=b["alerts"])), "application/json")
        brand_list.append({"slug": k, "brand": name, "alerts": len(b["alerts"]), "passenger_cars": b["cars"],
                           "latest": b["alerts"][0].get("date"), "file": f"brand/{k}.json"})
    store.put("public/eu/brands.json", _json(envelope("eu", now, brands=brand_list)), "application/json")

    model_list = []
    for m in MODELS:
        hits = [a for a in rows if matches(m, a)]
        store.put(f"public/eu/models/{m[0]}.json", _json(envelope("eu", now, model=m[1], alerts=hits)), "application/json")
        model_list.append({"slug": m[0], "model": m[1], "alerts": len(hits), "latest": hits[0]["date"] if hits else None,
                           "file": f"models/{m[0]}.json", "us_file": f"../us/models/{m[0]}.json" if m[4] else None})
    store.put("public/eu/models.json", _json(envelope("eu", now, models=model_list)), "application/json")

    latest = envelope(
        "eu", now,
        unit="Safety Gate alerts in the category Motor vehicles (cars, motorcycles, vans, trucks, e-scooters, parts)",
        first_date=rows[-1]["date"] if rows else None,
        alerts_total=len(rows),
        alerts_last_30_days=sum((a.get("date") or "") >= month_ago for a in rows),
        alerts_last_365_days=len(recent),
        notified_by_germany_last_365_days=sum(a.get("notified_by") == "DE" for a in recent),
        top_brands_last_365_days=_top(recent),
        newest=rows[:10],
        backfill=stats,
        notes="Germany's KBA reports its vehicle recalls to Safety Gate, so German recalls are included. "
              "An alert covers the vehicles named in it; check your VIN with the maker or dealer.",
    )
    store.put("public/eu/latest.json", _json(latest), "application/json")
    return {"alerts": len(rows), "brands": len(brand_list), "first": latest["first_date"]}


def _top(rows: list[dict], n: int = 10) -> list[dict]:
    counts: dict[str, list] = {}
    for a in rows:
        k = brand_key(a.get("brand"))
        counts.setdefault(k, [a.get("brand"), 0])[1] += 1
    return [{"slug": k, "brand": v[0], "alerts": v[1]} for k, v in sorted(counts.items(), key=lambda kv: -kv[1][1])[:n]]


def publish_us(store, now: str, log=print) -> dict:
    this_year = datetime.now(timezone.utc).year
    out = {}
    for m in MODELS:
        if not m[4]:
            continue
        make, model = m[4]
        rows = []
        for year in range(this_year - 7, this_year + 2):
            try:
                rows += nhtsa.parse(get_json(nhtsa.url(make, model, year), timeout=60))
            except Exception as exc:
                if getattr(exc, "code", None) != 400:  # 400: no such model year
                    log(f"NHTSA {make} {model} {year}: {exc!r}")
        campaigns = nhtsa.merge_years(rows)
        store.put(f"public/us/models/{m[0]}.json",
                  _json(envelope("us", now, model=m[1], nhtsa_make=make, nhtsa_model=model, campaigns=campaigns)),
                  "application/json")
        out[m[0]] = len(campaigns)
    return out


def run(store, since: int = 2019, budget: float = 12 * 60, us: bool = True, log=print) -> dict:
    now = datetime.now(timezone.utc).replace(microsecond=0)
    ts = now.strftime("%Y%m%dT%H%M%SZ")
    alerts, stats = read_safety_gate(store, since, budget, log)
    eu = publish_eu(store, alerts, now.isoformat(), stats)
    us_counts = publish_us(store, now.isoformat(), log) if us else {}
    index = {"dataset": "recalls", "updated_at": now.isoformat(), "regions": {
        "eu": {"files": ["latest.json", "recalls.csv", "recent.json", "brands.json", "brand/<slug>.json",
                         "models.json", "models/<slug>.json"], "source": safety_gate.PAGE_URL, "first_date": eu["first"]},
        "us": {"files": ["models/<slug>.json"], "source": "https://www.nhtsa.gov/recalls", "models": sorted(us_counts)},
    }}
    store.put("public/index.json", _json(index), "application/json")
    report = {"started_at": now.isoformat(), "store": str(store), **stats, **eu, "us_campaigns": us_counts}
    store.put(f"runs/{now:%Y/%m/%d}/{ts}.json", _json(report), "application/json")
    return report


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--prefix", default="recalls", help="top-level folder in the bucket")
    p.add_argument("--since", type=int, default=2019, help="oldest Safety Gate report year to read")
    p.add_argument("--budget", type=float, default=12 * 60, help="seconds to spend on old Safety Gate reports per run")
    p.add_argument("--no-us", action="store_true", help="skip NHTSA")
    where = p.add_mutually_exclusive_group(required=True)
    where.add_argument("--local")
    where.add_argument("--r2")
    args = p.parse_args(argv)
    base = LocalStore(args.local) if args.local else R2Store(args.r2)
    report = run(PrefixedStore(base, args.prefix), args.since, args.budget, not args.no_us)
    print(json.dumps({k: v for k, v in report.items() if k != "us_campaigns"}, ensure_ascii=False))
    print("US campaigns:", report["us_campaigns"])
    return 1 if report["reports_failed"] and not report["reports_read_now"] else 0


if __name__ == "__main__":
    sys.exit(main())
