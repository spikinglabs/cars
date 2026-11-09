"""Collect car ratings: Euro NCAP safety stars, Green NCAP stars and ADAC breakdown statistics.

    python -m pipelines.ratings.collect --local ./out
    python -m pipelines.ratings.collect --r2 <bucket> --prefix ratings

Only the headline facts are kept (stars and test year, breakdowns per 1,000 cars) with a link to the
source page for the full result; none of the sources has an open licence, so no report text,
scores breakdown or images are copied. New pages are read once, a few seconds apart; the ADAC
report is read again only when a new yearly PDF appears.

Bucket layout (the R2_BUCKET_EV bucket, folder ``ratings/``):

    ratings/
      state/euro-ncap.json     {url: parsed rating or null}
      state/green-ncap.json    {url: parsed rating or null}
      state/adac.json          {report_year, url, sha256, parsed}
      raw/adac/<year>.pdf      the yearly report the figures come from (not public)
      public/                  served at https://cars.allo.land/data/ratings/
        index.json
        de/ratings.json        all three, see build()
      runs/YYYY/MM/DD/<ts>.json
"""

from __future__ import annotations

import argparse
import hashlib
import json
import urllib.parse
import sys
import time
from datetime import UTC, datetime

from pipelines.charging_prices.http import get_bytes
from pipelines.charging_prices.storage import LocalStore, PrefixedStore, R2Store

from . import sources as S

DELAY = 3.0  # seconds between page requests


def _pretty(obj) -> bytes:
    return json.dumps(obj, ensure_ascii=False, indent=2).encode()


def _fetch(url: str) -> bytes:
    url = urllib.parse.quote(url, safe=":/?&=+%#~")  # sitemap paths can hold non-ASCII, e.g. "ds/n°8"
    return get_bytes(url, timeout=90, user_agent=S.USER_AGENT)


def _crawl(store, key, urls, parse, fetch, delay, limit, failed):
    state = json.loads(store.get(key) or b"{}")
    todo = [u for u in reversed(urls) if u not in state][:limit]  # newest first
    for i, u in enumerate(todo):
        if i:
            time.sleep(delay)
        try:
            state[u] = parse(fetch(u).decode("utf-8", "replace"), u)
        except Exception as exc:  # noqa: BLE001 (one page must not stop the rest)
            failed.append({"url": u, "error": str(exc)[:200]})
            continue
        if i % 25 == 24:
            store.put(key, _pretty(state), "application/json")
    if todo:
        store.put(key, _pretty(state), "application/json")
    return state, len(todo)


def build(euro: list[dict], green: list[dict], adac: dict | None, now: str) -> dict:
    return {
        "dataset": "ratings", "region": "DE", "updated_at": now,
        "notes": "Headline facts only, each with a link to the full result at the source. Euro NCAP and Green NCAP "
                 "test one version of a model; a rating is for the model as tested in that year (Euro NCAP raises "
                 "its bar every few years, so old stars are not comparable with new ones). ADAC: breakdowns the ADAC "
                 "road patrol attended per 1,000 registered cars, by year of first registration, for model series "
                 "with enough cars in Germany.",
        "euro_ncap": {
            "source": "Euro NCAP", "source_url": "https://www.euroncap.com/",
            "unit": "safety rating, 0 to 5 stars, and the year of the rating",
            "models": S.latest_per_model(euro),
        },
        "green_ncap": {
            "source": "Green NCAP", "source_url": "https://www.greenncap.com/",
            "unit": "environmental rating (efficiency, clean air, greenhouse gases), 0 to 5 stars, per tested version",
            "versions": sorted(green, key=lambda g: (g["name"].lower(), -g["year"])),
        },
        "adac_breakdowns": None if not adac else {
            "source": f"ADAC Pannenstatistik {adac['report_year']}", "source_url": S.ADAC_PAGE, "report_url": adac["url"],
            "calendar_year": adac["parsed"]["calendar_year"],
            "unit": "breakdowns per 1,000 registered cars in the calendar year, by year of first registration",
            "registration_years": adac["parsed"]["years"],
            "models": adac["parsed"]["models"],
        },
    }


def run(store, fetch=_fetch, delay: float = DELAY, limit: int = 400) -> dict:
    now = datetime.now(UTC).replace(microsecond=0)
    failed: list[dict] = []

    euro_urls = S.euro_urls(fetch(S.EURO_SITEMAP).decode("utf-8", "replace"))
    euro_state, euro_new = _crawl(store, "state/euro-ncap.json", euro_urls, S.parse_euro, fetch, delay, limit, failed)
    green_urls = S.green_urls(fetch(S.GREEN_LIST).decode("utf-8", "replace"))
    green_state, green_new = _crawl(store, "state/green-ncap.json", green_urls, S.parse_green, fetch, delay, limit, failed)

    adac = json.loads(store.get("state/adac.json") or b"null")
    try:
        reports = S.adac_reports(fetch(S.ADAC_PAGE).decode("utf-8", "replace"))
        if reports and (not adac or reports[0][0] > adac["report_year"] or adac.get("parser") != PARSER):
            year, url = reports[0]
            pdf = fetch(url)
            parsed = S.parse_adac(pdf)
            if len(parsed["models"]) < 50:
                raise ValueError(f"only {len(parsed['models'])} models in {url}")
            store.put(f"raw/adac/{year}.pdf", pdf, "application/pdf")
            adac = {"report_year": year, "url": url, "sha256": hashlib.sha256(pdf).hexdigest(), "parser": PARSER, "parsed": parsed}
            store.put("state/adac.json", _pretty(adac), "application/json")
    except Exception as exc:  # noqa: BLE001 (keep the last good report)
        failed.append({"url": S.ADAC_PAGE, "error": str(exc)[:200]})

    euro = [v for v in euro_state.values() if v]
    green = [v for v in green_state.values() if v]
    if len(euro) < 50:
        raise ValueError(f"only {len(euro)} Euro NCAP ratings parsed; failures: {failed[:5]}")
    store.put("public/de/ratings.json", _pretty(build(euro, green, adac, now.isoformat())), "application/json")
    store.put("public/index.json", _pretty({"dataset": "ratings", "updated_at": now.isoformat(),
                                            "regions": {"de": {"files": ["ratings.json"], "updated_at": now.isoformat()}}}),
              "application/json")
    report = {"started_at": now.isoformat(), "store": str(store), "euro_pages": len(euro_urls), "euro_new": euro_new,
              "euro_ratings": len(euro), "green_pages": len(green_urls), "green_new": green_new, "green_ratings": len(green),
              "adac_report": adac and adac["report_year"], "adac_models": adac and len(adac["parsed"]["models"]), "failed": failed}
    store.put(f"runs/{now:%Y/%m/%d}/{now:%Y%m%dT%H%M%SZ}.json", _pretty(report), "application/json")
    return report


PARSER = 1


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    where = ap.add_mutually_exclusive_group(required=True)
    where.add_argument("--local", help="write into this folder")
    where.add_argument("--r2", help="write into this R2 bucket")
    ap.add_argument("--prefix", default="ratings")
    ap.add_argument("--limit", type=int, default=400, help="most new pages per source in one run")
    ap.add_argument("--delay", type=float, default=DELAY)
    a = ap.parse_args(argv)
    store = LocalStore(a.local) if a.local else PrefixedStore(R2Store(a.r2), a.prefix)
    report = run(store, delay=a.delay, limit=a.limit)
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
