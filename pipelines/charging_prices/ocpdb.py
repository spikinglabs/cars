"""Open ChargePoint Database (OCPDB, MobiData BW) public API.

OCPDB merges the Bundesnetzagentur register with operator feeds published on
Mobilithek (AFIR / DATEX II). No API key is needed. Licences differ per source;
see the ``sources`` dataset (``attribution_license``).

API spec: https://api.mobidata-bw.de/ocpdb/documentation/public.json
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterator

from .http import get_json

BASE_URL = "https://api.mobidata-bw.de/ocpdb/api/public"
PAGE_LIMIT = 1000  # API maximum for most endpoints


@dataclass(frozen=True)
class Dataset:
    name: str  # used in storage paths
    path: str  # API path below BASE_URL
    tier: str  # "hourly", "status" or "weekly"
    description: str


DATASETS: list[Dataset] = [
    # Prices: fetched hourly, stored only when the content changed.
    Dataset("sources", "/v1/sources", "hourly", "Feeds merged into OCPDB, with licence and freshness"),
    Dataset("tariffs_ocpi22", "/ocpi/2.2/tariffs", "hourly", "Ad-hoc tariffs (OCPI 2.2 shape)"),
    Dataset("tariffs_ocpi30", "/ocpi/3.0/tariffs", "hourly", "Ad-hoc tariffs (OCPI 3.0 shape)"),
    Dataset(
        "tariff_associations",
        "/ocpi/3.0/tariff-associations",
        "hourly",
        "Which EVSEs/connectors each tariff applies to",
    ),
    # Charger status: fetched hourly, stored as compact changes (see collect.collect_evse_status).
    Dataset("evses", "/v1/evses", "status", "Every charge point with its live status"),
    # Slow-moving reference data: full raw copy once a week.
    Dataset("locations", "/v1/locations", "weekly", "Charging sites with EVSEs, connectors and tariff ids"),
    Dataset("businesses", "/v1/businesses", "weekly", "Operators and owners"),
]


def dataset(name: str) -> Dataset:
    for d in DATASETS:
        if d.name == name:
            return d
    raise KeyError(name)


def iter_pages(path: str, *, limit: int = PAGE_LIMIT, base_url: str = BASE_URL) -> Iterator[dict]:
    """Yield every page of a paginated OCPDB list endpoint."""
    offset = 0
    sep = "&" if "?" in path else "?"
    while True:
        page = get_json(f"{base_url}{path}{sep}limit={limit}&offset={offset}")
        yield page
        nxt = page.get("next_offset")
        if nxt is None or not page.get("items"):
            return
        offset = nxt


def fetch_all(path: str, **kwargs) -> tuple[list[dict], int | None]:
    """Fetch all items of an endpoint. Returns (items, total_count reported by the API).

    Offset pagination over live data can repeat an item when rows shift between
    pages, so items are de-duplicated by ``id``/``uid`` when present.
    """
    items: list[dict] = []
    seen: set = set()
    total = None
    for page in iter_pages(path, **kwargs):
        total = page.get("total_count", total)
        for item in page.get("items", []):
            key = item.get("id") or item.get("uid")
            if key is not None:
                if key in seen:
                    continue
                seen.add(key)
            items.append(item)
    return items, total
