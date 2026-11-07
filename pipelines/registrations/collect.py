"""Collect monthly new car registrations in Germany by brand and model (KBA FZ10).

    python -m pipelines.registrations.collect --local ./out
    python -m pipelines.registrations.collect --r2 <bucket>

Bucket layout (the R2_BUCKET_EV bucket, folder ``registrations/``):

    registrations/
      raw/kba-fz10/YYYY-MM/<ts>.xlsx       each monthly workbook, stored again only when KBA revises it
      state/months.json                    {month: {url, sha256, key}} of the stored workbooks
      derived/months/YYYY-MM.json          one parsed month (models, brands, market)
      public/                              served at https://cars.allo.land/data/registrations/
        index.json                         regions, their files and last update
        de/
          latest.json     newest month: market by drive type, top models, top electric models
          market.csv      month, total, diesel, hybrid, phev, bev, petrol_etc, bev_share
          monthly.csv     month, brand, model, slug, total, diesel, hybrid, phev, bev (every model, every month)
          models.json     every model ever listed, newest month's count and rank, last 12 months
          models/<slug>.json   one model's monthly series
          brands.json     every brand: newest month, last 12 months and monthly totals
      runs/YYYY/MM/DD/<ts>.json            what each run did
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
from datetime import UTC, datetime

from pipelines.charging_prices.http import get_bytes
from pipelines.charging_prices.normalize import to_csv
from pipelines.charging_prices.storage import LocalStore, PrefixedStore, R2Store

from . import kba

REGION = "de"
PAGE = "https://cars.allo.land/registrations/"


def _json(obj) -> bytes:
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode()


def _pretty(obj) -> bytes:
    return json.dumps(obj, ensure_ascii=False, indent=2).encode()


def _fetch(url: str) -> bytes:
    return get_bytes(url, timeout=120, user_agent=kba.USER_AGENT)


def _prev_year(month: str) -> str:
    y, m = month.split("-")
    return f"{int(y) - 1}-{m}"


def _change(now: int | None, before: int | None) -> float | None:
    if not now or not before:
        return None
    return round((now - before) / before * 100, 1)


def _petrol_etc(c: dict) -> int | None:
    if any(c.get(f) is None for f in ("total", "diesel", "hybrid", "bev")):
        return None
    return max(c["total"] - c["diesel"] - c["hybrid"] - c["bev"], 0)


def build(months: list[dict], now: str) -> dict[str, bytes]:
    """Public files (path under public/ -> bytes) from parsed months, oldest first."""
    months = sorted(months, key=lambda d: d["month"])
    last = months[-1]
    by_month = {d["month"]: d for d in months}
    out: dict[str, bytes] = {}

    # Market by drive type
    market_rows = []
    for d in months:
        c = d["market"]
        market_rows.append({"month": d["month"], **{f: c.get(f) for f in kba.FIELDS},
                            "petrol_etc": _petrol_etc(c),
                            "bev_share": round(c["bev"] / c["total"] * 100, 2) if c.get("bev") is not None and c["total"] else None})
    out[f"{REGION}/market.csv"] = to_csv(market_rows, ["month"] + kba.FIELDS + ["petrol_etc", "bev_share"])

    # Every model, every month
    series: dict[str, dict] = {}
    long_rows = []
    for d in months:
        for m in d["models"]:
            s = kba.slug(m["brand"], m["model"])
            long_rows.append({"month": d["month"], "slug": s, **m})
            entry = series.setdefault(s, {"slug": s, "brand": m["brand"], "model": m["model"],
                                          "other": m["model"] == "SONSTIGE", "months": {}})
            entry["months"][d["month"]] = {f: m[f] for f in kba.FIELDS}
    out[f"{REGION}/monthly.csv"] = to_csv(long_rows, ["month", "brand", "model", "slug"] + kba.FIELDS)

    last12 = [d["month"] for d in months[-12:]]
    ranked = sorted((e for e in series.values() if not e["other"] and last["month"] in e["months"]),
                    key=lambda e: -e["months"][last["month"]]["total"])
    rank = {e["slug"]: i + 1 for i, e in enumerate(ranked)}
    index = []
    for e in sorted(series.values(), key=lambda e: e["slug"]):
        mm = e["months"]
        cur = mm.get(last["month"], {})
        index.append({
            "slug": e["slug"], "brand": e["brand"], "model": e["model"],
            "file": f"models/{e['slug']}.json",
            "first_month": min(mm), "last_month": max(mm),
            "latest": cur.get("total"), "latest_bev": cur.get("bev"), "rank": rank.get(e["slug"]),
            "last_12_months": sum((mm.get(k) or {}).get("total") or 0 for k in last12),
        })
        rows = [{"month": k, **v} for k, v in sorted(mm.items())]
        out[f"{REGION}/models/{e['slug']}.json"] = _json({
            "dataset": "registrations", "region": REGION.upper(), "brand": e["brand"], "model": e["model"],
            "slug": e["slug"], "page": f"{PAGE}?model={e['slug']}", "updated_at": now,
            "unit": "new passenger car registrations per month", "fields": kba.FIELDS, "months": rows,
            "source": "Kraftfahrt-Bundesamt, FZ10", "licence": kba.LICENCE, "credit": kba.CREDIT,
        })
    out[f"{REGION}/models.json"] = _json({
        "dataset": "registrations", "region": REGION.upper(), "latest_month": last["month"], "updated_at": now,
        "notes": "Model names as the KBA writes them. 'SONSTIGE' is a brand's other models and has no rank.",
        "models": index,
    })

    # Brands
    brands: dict[str, dict] = {}
    for d in months:
        for b in d["brands"]:
            s = kba.slug(b["brand"])
            e = brands.setdefault(s, {"slug": s, "brand": b["brand"], "months": {}})
            e["months"][d["month"]] = [b["total"], b.get("bev")]
    brand_list = []
    for e in sorted(brands.values(), key=lambda e: -(e["months"].get(last["month"], [0])[0] or 0)):
        mm = e["months"]
        brand_list.append({"slug": e["slug"], "brand": e["brand"],
                           "latest": (mm.get(last["month"]) or [None])[0],
                           "last_12_months": sum((mm.get(k) or [0])[0] or 0 for k in last12),
                           "months": [[k, *v] for k, v in sorted(mm.items())]})
    out[f"{REGION}/brands.json"] = _json({
        "dataset": "registrations", "region": REGION.upper(), "latest_month": last["month"], "updated_at": now,
        "fields": ["month", "total", "bev"], "notes": "'SONSTIGE' is all other brands together.", "brands": brand_list,
    })

    # Latest summary
    prev = by_month.get(_prev_year(last["month"]))
    prev_models = {kba.slug(m["brand"], m["model"]): m for m in (prev or {}).get("models", [])}

    def model_row(e, field="total"):
        cur = e["months"][last["month"]]
        before = prev_models.get(e["slug"], {})
        return {"rank": rank[e["slug"]], "slug": e["slug"], "brand": e["brand"], "model": e["model"],
                "total": cur["total"], "bev": cur["bev"], "phev": cur["phev"],
                "change_vs_last_year_pct": _change(cur[field], before.get(field))}

    top_bev = sorted((e for e in ranked if e["months"][last["month"]].get("bev")),
                     key=lambda e: -e["months"][last["month"]]["bev"])[:10]
    mk, pmk = last["market"], (prev or {}).get("market", {})
    summary = {
        "dataset": "registrations",
        "region": REGION.upper(),
        "month": last["month"],
        "updated_at": now,
        "unit": "new passenger car registrations in the month",
        "market": {
            **{f: mk.get(f) for f in kba.FIELDS}, "petrol_etc": _petrol_etc(mk),
            "share_pct": {f: round(mk[f] / mk["total"] * 100, 1) for f in kba.FIELDS[1:] if mk.get(f) is not None},
            "change_vs_last_year_pct": _change(mk.get("total"), pmk.get("total")),
            "bev_change_vs_last_year_pct": _change(mk.get("bev"), pmk.get("bev")),
        },
        "top_models": [model_row(e) for e in ranked[:20]],
        "top_electric": [model_row(e, "bev") for e in top_bev],
        "models_listed": len(ranked),
        "first_month": months[0]["month"],
        "page": PAGE,
        "source": "Kraftfahrt-Bundesamt, FZ10 Neuzulassungen von Personenkraftwagen nach Marken und Modellreihen",
        "source_url": kba.LIST_URL,
        "licence": kba.LICENCE,
        "licence_url": kba.LICENCE_URL,
        "credit": kba.CREDIT,
        "notes": "Counts are new registrations of passenger cars in Germany in that month. hybrid includes plug-in "
                 "hybrids (phev, reported separately since 2021); bev is battery electric only. petrol_etc is "
                 "total minus diesel, hybrid and bev: petrol, gas, hydrogen and others. A model's bev count is "
                 "its electric version (e.g. Jeep Avenger electric).",
    }
    out[f"{REGION}/latest.json"] = _pretty(summary)
    out["index.json"] = _pretty({
        "dataset": "registrations", "updated_at": now, "source": kba.LIST_URL,
        "regions": {REGION: {"files": ["latest.json", "market.csv", "monthly.csv", "models.json", "models/<slug>.json",
                                       "brands.json"],
                             "first_month": months[0]["month"], "latest_month": last["month"], "updated_at": now}},
    })
    return out


def run(store, max_downloads: int = 200, delay: float = kba.CRAWL_DELAY, fetch=_fetch) -> dict:
    now = datetime.now(UTC).replace(microsecond=0)
    ts = now.strftime("%Y%m%dT%H%M%SZ")
    available = kba.list_months(fetch(kba.LIST_URL).decode("utf-8", "replace"))
    if not available:
        raise ValueError("no FZ10 workbooks found on the KBA list page")
    state = json.loads(store.get("state/months.json") or b"{}")

    fetched, changed, failed = [], [], []
    todo = [(m, u) for m, u in available.items() if state.get(m, {}).get("url") != u][:max_downloads]
    for i, (month, url) in enumerate(todo):
        time.sleep(delay)  # KBA asks for a pause between requests
        try:
            xlsx = fetch(url)
            parsed = kba.parse(xlsx, month)
        except Exception as exc:  # noqa: BLE001 (one broken month must not stop the rest)
            failed.append({"month": month, "error": str(exc)[:300]})
            continue
        fetched.append(month)
        digest = hashlib.sha256(xlsx).hexdigest()
        entry = state.get(month, {})
        if entry.get("sha256") != digest:
            key = f"raw/kba-fz10/{month}/{ts}.xlsx"
            store.put(key, xlsx, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
            store.put(f"derived/months/{month}.json", _json(parsed), "application/json")
            entry = {"sha256": digest, "key": key}
            changed.append(month)
        state[month] = {**entry, "url": url, "checked_at": now.isoformat()}
        store.put("state/months.json", _pretty(dict(sorted(state.items()))), "application/json")

    months = []
    for month in sorted(state):
        raw = store.get(f"derived/months/{month}.json")
        if raw:
            months.append(json.loads(raw))
    if not months:
        raise ValueError(f"no months parsed; failures: {failed}")
    if changed or not store.exists(f"public/{REGION}/latest.json"):
        for path, data in build(months, now.isoformat()).items():
            ctype = "text/csv" if path.endswith(".csv") else "application/json"
            store.put(f"public/{path}", data, ctype)

    report = {"started_at": now.isoformat(), "store": str(store), "available": len(available),
              "fetched": fetched, "changed": changed, "failed": failed,
              "months": len(months), "first_month": months[0]["month"], "latest_month": months[-1]["month"]}
    store.put(f"runs/{now:%Y/%m/%d}/{ts}.json", _pretty(report), "application/json")
    return report


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--prefix", default="registrations", help="top-level folder in the bucket")
    p.add_argument("--max-downloads", type=int, default=200, help="workbooks to fetch per run at most")
    p.add_argument("--delay", type=float, default=kba.CRAWL_DELAY, help="seconds between KBA requests")
    where = p.add_mutually_exclusive_group(required=True)
    where.add_argument("--local")
    where.add_argument("--r2")
    args = p.parse_args(argv)
    base = LocalStore(args.local) if args.local else R2Store(args.r2)
    r = run(PrefixedStore(base, args.prefix), args.max_downloads, args.delay)
    print(f"{r['months']} months {r['first_month']}..{r['latest_month']}; fetched {len(r['fetched'])}, "
          f"changed {len(r['changed'])}, failed {len(r['failed'])}")
    for f in r["failed"]:
        print(f"::warning::{f['month']}: {f['error']}")
    return 1 if r["failed"] and not r["fetched"] else 0


if __name__ == "__main__":
    sys.exit(main())
