"""US NHTSA recalls for the models Allo Cars follows (public domain, no key).

Many cars sold in Germany are also sold in the US, where recalls are published per make, model and model year,
often earlier and in more detail. https://www.nhtsa.gov/nhtsa-datasets-and-apis
"""

from __future__ import annotations

import urllib.parse
from datetime import datetime

API = "https://api.nhtsa.gov/recalls/recallsByVehicle?make={make}&model={model}&modelYear={year}"
PAGE = "https://www.nhtsa.gov/recalls?nhtsaId={id}"


def url(make: str, model: str, year: int) -> str:
    q = urllib.parse.quote
    return API.format(make=q(make), model=q(model), year=year)


def _date(text: str | None) -> str | None:
    for fmt in ("%d/%m/%Y", "%m/%d/%Y"):
        try:
            return datetime.strptime(text or "", fmt).date().isoformat()
        except ValueError:
            pass
    return None


def parse(data: dict) -> list[dict]:
    out = []
    for r in data.get("results") or []:
        cid = (r.get("NHTSACampaignNumber") or "").strip()
        if not cid:
            continue
        out.append({
            "id": cid,
            "date": _date(r.get("ReportReceivedDate")),
            "model_year": int(r["ModelYear"]) if str(r.get("ModelYear", "")).isdigit() else None,
            "component": r.get("Component"),
            "summary": r.get("Summary"),
            "consequence": r.get("Consequence"),
            "remedy": r.get("Remedy"),
            "park_outside": bool(r.get("parkOutSide")),
            "do_not_drive": bool(r.get("parkIt")),
            "over_the_air": bool(r.get("overTheAirUpdate")),
            "url": PAGE.format(id=cid),
        })
    return out


def merge_years(rows: list[dict]) -> list[dict]:
    """One campaign covers several model years: keep one row per campaign with all its years, newest first."""
    by_id: dict[str, dict] = {}
    for r in rows:
        cur = by_id.setdefault(r["id"], {**r, "model_years": []})
        if r.get("model_year") and r["model_year"] not in cur["model_years"]:
            cur["model_years"].append(r["model_year"])
    out = []
    for r in by_id.values():
        r.pop("model_year", None)
        r["model_years"].sort()
        out.append(r)
    return sorted(out, key=lambda r: (r.get("date") or "", r["id"]), reverse=True)
