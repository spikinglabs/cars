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


# Bulletin column prefix -> (our region code, lowercase ISO 3166 / "eu").
# EU_ is the EU weighted average. UK is reported until it left the EU.
REGION_CODES = {"EU": "eu", "UK": "gb", "GR": "gr"}
# National currencies for countries outside the euro area (ISO 4217).
CURRENCIES = {"BG": "BGN", "CZ": "CZK", "DK": "DKK", "HR": "HRK", "HU": "HUF", "PL": "PLN",
              "RO": "RON", "SE": "SEK", "UK": "GBP", "CY": "CYP", "EE": "EEK", "LT": "LTL",
              "LV": "LVL", "SI": "SIT", "SK": "SKK"}


def region_code(prefix: str) -> str:
    return REGION_CODES.get(prefix, prefix.lower())


def _load(xlsx: bytes):
    import openpyxl

    ws = openpyxl.load_workbook(io.BytesIO(xlsx), read_only=True, data_only=True)[SHEET]
    rows = ws.iter_rows(values_only=True)
    return next(rows), list(rows)


def _columns(header, country: str) -> tuple[dict, int | None]:
    cols, rate = {}, None
    for i, name in enumerate(header):
        if name == f"{country}_exchange_rate":
            rate = i
        for suffix, field in PRODUCTS.items():
            if name == f"{country}_price_with_tax_{suffix}":
                cols[field] = i
    return cols, rate


def countries(header) -> list[str]:
    """Column prefixes that have all products, e.g. ["EU", "AT", "BE", ...]; skips EUR (euro area)."""
    seen = []
    for name in header:
        if isinstance(name, str) and name.endswith("_price_with_tax_euro95"):
            c = name.split("_", 1)[0]
            if c != "EUR" and c not in seen and len(_columns(header, c)[0]) == len(PRODUCTS):
                seen.append(c)
    return seen


def _parse(header, data, country: str) -> tuple[list[dict], str]:
    cols, rate_col = _columns(header, country)
    if len(cols) != len(PRODUCTS):
        raise ValueError(f"columns for {country} not found; got {cols}")
    weeks = []
    for row in data:
        d = row[0]
        if isinstance(d, datetime):
            d = d.date()
        if not isinstance(d, date):
            continue
        eur = {f: (float(row[i]) / 1000 if isinstance(row[i], (int, float)) and row[i] > 0 else None) for f, i in cols.items()}
        rate = row[rate_col] if rate_col is not None and isinstance(row[rate_col], (int, float)) and row[rate_col] > 0 else None
        if any(v is not None for v in eur.values()):
            weeks.append((d, eur, rate))
    weeks.sort(key=lambda w: w[0])
    # The sheet is in EUR for every country, with the EUR value of one unit of national
    # currency. A country whose latest rate is 1 (or has no rate) uses the euro today.
    last_rate = next((w[2] for w in reversed(weeks) if w[2] is not None), None)
    currency = "EUR" if last_rate in (None, 1) else CURRENCIES.get(country, f"{country}?")
    out = []
    for d, eur, rate in weeks:
        rec = {"date": d.isoformat()}
        for f, v in eur.items():
            if currency == "EUR":
                rec[f] = round(v, 4) if v is not None else None
            else:
                rec[f] = round(v / rate, 4) if v is not None and rate else None
                rec[f + "_eur"] = round(v, 4) if v is not None else None
        out.append(rec)
    return out, currency


def parse_history(xlsx: bytes, country: str = "DE") -> list[dict]:
    """Weekly rows for one country, oldest first, prices per litre incl. taxes."""
    header, data = _load(xlsx)
    return _parse(header, data, country)[0]


def parse_all(xlsx: bytes) -> dict[str, tuple[list[dict], str]]:
    """{region code: (weekly rows, currency)} for every country in the sheet plus eu."""
    header, data = _load(xlsx)
    return {region_code(c): _parse(header, data, c) for c in countries(header)}


def fields(currency: str) -> list[str]:
    extra = [] if currency == "EUR" else [f + "_eur" for f in PRODUCTS.values()]
    return FIELDS + extra
