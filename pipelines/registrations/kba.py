"""KBA FZ10: new passenger car registrations in Germany by brand and model, every month.

Published by the Kraftfahrt-Bundesamt (Germany's federal motor transport authority) about a week
after each month ends, as one Excel workbook per month, since December 2018.
Licence: Datenlizenz Deutschland - Namensnennung - Version 2.0 (dl-de/by-2-0), credit
"© Kraftfahrt-Bundesamt, Flensburg".
https://www.kba.de/DE/Statistik/Produktkatalog/produkte/Fahrzeuge/fz10/fz10_gentab.html

The workbook has one sheet ("FZ 10.1") with a row per model: brand (only on its first row),
model series, then three columns per drive type (this month, year to date, share). Brand totals are
rows "<BRAND> ZUSAMMEN", the market total is "NEUZULASSUNGEN INSGESAMT". Until 2021 the drive types
were total, diesel, hybrid (incl. plug-in), electric, AWD, convertible; since 2021 plug-in hybrids
have their own column and "electric" is BEV only.
"""

from __future__ import annotations

import io
import re
import urllib.parse

LIST_URL = "https://www.kba.de/DE/Statistik/Produktkatalog/produkte/Fahrzeuge/fz10/fz10_gentab.html"
LICENCE = "Datenlizenz Deutschland - Namensnennung - Version 2.0 (dl-de/by-2-0)"
LICENCE_URL = "https://www.govdata.de/dl-de/by-2-0"
CREDIT = "© Kraftfahrt-Bundesamt, Flensburg"
# KBA's firewall refuses some automated user agents; this one names us and is accepted.
USER_AGENT = "Allo-Cars/0.1 (+https://cars.allo.land/open-data/)"
# robots.txt asks for 30 s between requests.
CRAWL_DELAY = 30

# Our field -> test on the (whitespace-collapsed) column group heading.
DRIVES = {
    "total": lambda h: h == "Insgesamt",
    "diesel": lambda h: h == "mit Dieselantrieb",
    "hybrid": lambda h: h.startswith("mit Hybridantrieb"),
    "phev": lambda h: h == "Plug-in-Hybridantrieb",
    "bev": lambda h: h.startswith("mit Elektroantrieb"),
}
FIELDS = list(DRIVES)

_LINK = re.compile(r'href="([^"]*/fz10_(\d{4})_(\d{2})(?:_xlsx)?\.xlsx[^"]*)"')


def list_months(page_html: str) -> dict[str, str]:
    """{"2026-09": absolute download URL} for every monthly workbook linked on the list page."""
    out = {}
    for href, y, m in _LINK.findall(page_html):
        out[f"{y}-{m}"] = urllib.parse.urljoin(LIST_URL, href.replace("&amp;", "&"))
    return dict(sorted(out.items()))


def _text(v) -> str:
    return re.sub(r"\s+", " ", str(v)).strip() if v is not None else ""


def _num(v) -> int | None:
    if isinstance(v, (int, float)):
        return int(v)
    t = _text(v)
    if t == "-":  # KBA: nothing registered
        return 0
    if re.fullmatch(r"\d+", t):
        return int(t)
    return None  # "." (withheld) or empty


def _sheet_rows(xlsx: bytes) -> list[tuple]:
    import openpyxl

    wb = openpyxl.load_workbook(io.BytesIO(xlsx), read_only=True, data_only=True)
    names = [n for n in wb.sheetnames if "10.1" in n.replace(" ", "")]
    if not names:
        raise ValueError(f"no FZ 10.1 sheet; sheets: {wb.sheetnames}")
    return list(wb[names[0]].iter_rows(values_only=True))


def _columns(rows: list[tuple]) -> tuple[int, int, int, dict[str, int]]:
    """(first data row, brand column, model column, {field: column of this month's count})."""
    for i, row in enumerate(rows):
        if any(_text(c) == "Marke" for c in row):
            brand_col = next(j for j, c in enumerate(row) if _text(c) == "Marke")
            # Drive type headings sit on the "Marke" row (2021 on) or the row above (until 2020).
            cols = {}
            for heading_row in (row, rows[i - 1] if i else ()):
                for j, c in enumerate(heading_row):
                    h = _text(c)
                    for field, test in DRIVES.items():
                        if field not in cols and test(h):
                            cols[field] = j
            if "total" not in cols:
                raise ValueError("column 'Insgesamt' not found")
            return i + 1, brand_col, brand_col + 1, cols
    raise ValueError("header row with 'Marke' not found")


def parse(xlsx: bytes, month: str) -> dict:
    """Parse one monthly workbook.

    Returns {"month", "models": [{brand, model, total, diesel, hybrid, phev, bev}],
    "brands": [{brand, ...}], "market": {...}}. Counts are this month's new registrations;
    a drive type the workbook doesn't report is None.
    """
    rows = _sheet_rows(xlsx)
    start, bc, mc, cols = _columns(rows)
    models, brands, market, brand = [], [], None, None

    def counts(row):
        return {f: (_num(row[cols[f]]) if f in cols and cols[f] < len(row) else None) for f in FIELDS}

    for row in rows[start:]:
        if len(row) <= mc:
            continue
        b, m = _text(row[bc]), _text(row[mc])
        if b.startswith("©") or b.lower().startswith("hinweis"):
            break
        if b == "NEUZULASSUNGEN INSGESAMT":
            market = counts(row)
            continue
        if b.endswith(" ZUSAMMEN") or (b and not m):
            # Brand total; "SONSTIGE" alone (until 2022) or "SONSTIGE ZUSAMMEN" = all other brands.
            name = b.removesuffix(" ZUSAMMEN")
            brands.append({"brand": name, **counts(row)})
            brand = None
            continue
        if b:
            brand = b
        if not m or brand is None:
            continue
        c = counts(row)
        if c["total"] is None:
            continue
        models.append({"brand": brand, "model": m, **c})
    if market is None:
        raise ValueError(f"{month}: market total row not found")
    return {"month": month, "models": models, "brands": brands, "market": market}


def slug(*parts: str) -> str:
    s = "-".join(parts).lower()
    s = s.replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("ß", "ss").replace("&", "and")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")
