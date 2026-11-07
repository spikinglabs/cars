"""EU Weekly Oil Bulletin: weekly national consumer fuel prices since 2005.

Published by the European Commission (DG ENER) every Monday, reused under the
Commission's reuse policy (Decision 2011/833/EU, CC BY 4.0). Prices are the
weekly national average including all taxes, in EUR per 1000 litres.
https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en
"""

from __future__ import annotations

import io
import re
import urllib.parse
from datetime import date, datetime

PAGE_URL = "https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en"
FALLBACK_HISTORY_URL = (
    "https://energy.ec.europa.eu/document/download/906e60ca-8b6a-44e7-8589-652854d2fd3f_en"
    "?filename=Weekly_Oil_Bulletin_Prices_History_maticni_4web.xlsx"
)
SHEET = "Prices with taxes"
# Column name suffix in the sheet -> our field name
PRODUCTS = {"euro95": "euro_super_95", "diesel": "diesel", "LPG": "lpg"}
FIELDS = ["date"] + list(PRODUCTS.values())


def find_history_url(page_html: str) -> str:
    m = re.search(r'href="([^"]*Prices_History[^"]*\.xlsx)"', page_html)
    return urllib.parse.urljoin(PAGE_URL, m.group(1).replace("&amp;", "&")) if m else FALLBACK_HISTORY_URL


def parse_history(xlsx: bytes, country: str = "DE") -> list[dict]:
    """Weekly rows for one country, oldest first, prices in EUR per litre incl. taxes."""
    import openpyxl

    ws = openpyxl.load_workbook(io.BytesIO(xlsx), read_only=True, data_only=True)[SHEET]
    rows = ws.iter_rows(values_only=True)
    header = next(rows)
    cols = {}
    for i, name in enumerate(header):
        for suffix, field in PRODUCTS.items():
            if name == f"{country}_price_with_tax_{suffix}":
                cols[field] = i
    if len(cols) != len(PRODUCTS):
        raise ValueError(f"columns for {country} not found; got {cols}")
    out = []
    for row in rows:
        d = row[0]
        if isinstance(d, datetime):
            d = d.date()
        if not isinstance(d, date):
            continue
        rec = {"date": d.isoformat()}
        for field, i in cols.items():
            v = row[i]
            rec[field] = round(float(v) / 1000, 4) if isinstance(v, (int, float)) and v > 0 else None
        if any(rec[f] is not None for f in PRODUCTS.values()):
            out.append(rec)
    out.sort(key=lambda r: r["date"])
    return out
