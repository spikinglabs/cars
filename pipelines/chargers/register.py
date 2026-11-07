"""Read the Bundesnetzagentur Ladesäulenregister (CSV or XLSX) into plain rows.

Both formats carry a few lines of notes, a group header row ("Allgemeine Informationen",
"1. Ladepunkt", ...) and then the column header row starting with "Ladeeinrichtungs-ID".
Each row is one charging device (Ladeeinrichtung) with up to six charge points.
"""

from __future__ import annotations

import csv
import io
import re
from datetime import date, datetime

HEADER_START = "Ladeeinrichtungs-ID"
_DATE_RE = re.compile(r"(\d{4})-(\d{2})-(\d{2})")
_UPDATED_RE = re.compile(r"Aktualisierung vom:\s*(\d{1,2})\.(\d{1,2})\.(\d{4})")


def file_date(name: str) -> str | None:
    """Ladesaeulenregister_BNetzA_2026-09-30.xlsx -> 2026-09-30."""
    m = _DATE_RE.search(name)
    return "-".join(m.groups()) if m else None


def _cell(v) -> str:
    if v is None:
        return ""
    if isinstance(v, datetime):
        return v.date().isoformat()
    if isinstance(v, date):
        return v.isoformat()
    if isinstance(v, float) and v.is_integer() and abs(v) > 1000:
        return str(int(v))
    return str(v).strip()


def _rows_csv(data: bytes):
    text = data.decode("utf-8-sig", "replace")
    yield from csv.reader(io.StringIO(text), delimiter=";")


def _rows_xlsx(data: bytes):
    import openpyxl

    wb = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    ws = wb[wb.sheetnames[0]]
    for row in ws.iter_rows(values_only=True):
        yield [_cell(v) for v in row]
    wb.close()


def read(data: bytes, name: str) -> tuple[dict, list[dict]]:
    """Return (meta, rows). Each row maps the register's own column names to strings.

    The six charge point column groups are folded into row["points"] = [{"plug", "kw", "evse_id"}].
    """
    rows = _rows_xlsx(data) if name.lower().endswith(".xlsx") else _rows_csv(data)
    meta: dict = {"file": name, "file_date": file_date(name)}
    header: list[str] | None = None
    out: list[dict] = []
    for raw in rows:
        if header is None:
            first = (raw[0] if raw else "") or ""
            m = _UPDATED_RE.search(first)
            if m:
                d, mo, y = m.groups()
                meta["updated"] = f"{y}-{int(mo):02d}-{int(d):02d}"
            if first.strip() == HEADER_START:
                header = [h.strip() for h in raw]
            continue
        if not raw or not any(raw):
            continue
        rec: dict = {}
        points: list[dict] = []
        for i, h in enumerate(header):
            v = _cell(raw[i]) if i < len(raw) else ""
            m = re.fullmatch(r"(Steckertypen|Nennleistung Stecker|EVSE-ID|Public Key)(\d)", h)
            if m:
                idx = int(m.group(2)) - 1
                while len(points) <= idx:
                    points.append({})
                key = {"Steckertypen": "plug", "Nennleistung Stecker": "kw", "EVSE-ID": "evse_id"}.get(m.group(1))
                if key:
                    points[idx][key] = v
                continue
            rec[h] = v
        rec["points"] = [p for p in points if p.get("plug") or p.get("kw")]
        out.append(rec)
    if header is None:
        raise ValueError(f"{name}: no header row starting with {HEADER_START!r}")
    meta["rows"] = len(out)
    return meta, out
