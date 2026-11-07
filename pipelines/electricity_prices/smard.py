"""Day-ahead wholesale electricity prices for Germany (bidding zone DE-LU) from SMARD, the Bundesnetzagentur's
energy market data portal. Licence CC BY 4.0, credit "Bundesnetzagentur | SMARD.de".

Filter 4169 is the day-ahead auction price in EUR/MWh. Prices are hourly until the auction moved to
15-minute products on 1 Oct 2025, quarter-hourly since. Each data file covers one week; an index lists them.
Tomorrow's prices appear after the auction, around 13:00 German time.
"""

from __future__ import annotations

from datetime import datetime, timezone

FILTER = 4169
BASE = "https://www.smard.de/app/chart_data/{f}/DE/"
PAGE_URL = "https://www.smard.de/home/marktdaten"


def index_url(resolution: str) -> str:
    return BASE.format(f=FILTER) + f"index_{resolution}.json"


def file_url(resolution: str, ts: int) -> str:
    return BASE.format(f=FILTER) + f"{FILTER}_DE_{resolution}_{ts}.json"


def parse(data: dict) -> dict[int, float]:
    """{unix ms: EUR/MWh} for the points that have a price."""
    return {int(t): float(v) for t, v in data.get("series") or [] if v is not None}


def iso(ms: int) -> str:
    return datetime.fromtimestamp(ms / 1000, timezone.utc).isoformat().replace("+00:00", "Z")
