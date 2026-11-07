"""EU Safety Gate: car and other motor vehicle recalls reported by European market surveillance authorities.

Germany's Kraftfahrt-Bundesamt (KBA) reports every German vehicle recall here, as do the other EU countries,
Norway, Iceland, Liechtenstein and Northern Ireland. The Commission publishes one report a week (Fridays) as XML;
one list names every report back to 2005. Licence: reuse allowed with attribution (Commission Decision
2011/833/EU, CC BY 4.0). The same reader for children's products runs in spikinglabs/recall-tracker.
"""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from datetime import datetime

LIST_URL = "https://ec.europa.eu/safety-gate-alerts/api/download/weeklyReport/list/xml/{year}"
PAGE_URL = "https://ec.europa.eu/safety-gate-alerts/screen/webReport"
CATEGORY = "Motor vehicles"

COUNTRIES = {
    "Austria": "AT", "Belgium": "BE", "Bulgaria": "BG", "Croatia": "HR", "Cyprus": "CY", "Czechia": "CZ",
    "Czech Republic": "CZ", "Denmark": "DK", "Estonia": "EE", "Finland": "FI", "France": "FR", "Germany": "DE",
    "Greece": "GR", "Hungary": "HU", "Iceland": "IS", "Ireland": "IE", "Italy": "IT", "Latvia": "LV",
    "Liechtenstein": "LI", "Lithuania": "LT", "Luxembourg": "LU", "Malta": "MT", "Netherlands": "NL",
    "The Netherlands": "NL", "Norway": "NO", "Poland": "PL", "Portugal": "PT", "Romania": "RO", "Slovakia": "SK",
    "Slovak Republic": "SK", "Slovenia": "SI", "Spain": "ES", "Sweden": "SE",
    "United Kingdom in respect of Northern Ireland": "GB", "United Kingdom": "GB",
}


def report_list(xml: bytes) -> list[tuple[str, str]]:
    """Every weekly report as (reference, English XML address), newest first."""
    out = []
    for r in ET.fromstring(xml).iter("weeklyReport"):
        url = r.findtext("URL") or ""
        ref = (r.findtext("reference") or "").strip()
        if "language=" not in url or not ref:
            continue
        lang = url.split("language=")[1].split("&")[0]
        out.append((ref, url.replace(f"language={lang}", "language=en")))
    return out


def report_year(ref: str) -> int | None:
    m = re.match(r"Report-(\d{4})-", ref)
    return int(m.group(1)) if m else None


def _date(text: str, fmt: str) -> str | None:
    try:
        return datetime.strptime(text, fmt).date().isoformat()
    except ValueError:
        return None


def _measures(text: str) -> tuple[str | None, str | None, str | None]:
    """'Type of economic operator ...: ManufacturerCategory of measure(s): Recall ...Date of entry into force: 22/10/2026'
    -> (operator, measure, date). Several measures are joined with '; '."""
    ops, measures, dates = [], [], []
    for m in re.finditer(r"Type of economic operator taking notified measure\(s\):\s*(.*?)(?=Category of measure|$)", text):
        ops.append(m.group(1).strip())
    for m in re.finditer(r"Category of measure\(s\):\s*(.*?)(?=Date of entry into force|Type of economic|$)", text):
        measures.append(m.group(1).strip())
    for m in re.finditer(r"Date of entry into force:\s*(\d{2}/\d{2}/\d{4})", text):
        dates.append(_date(m.group(1), "%d/%m/%Y"))
    j = lambda xs: "; ".join(dict.fromkeys(x for x in xs if x)) or None
    return j(ops), j(measures), j(dates)


def parse_report(xml: bytes | str, ref: str = "") -> list[dict]:
    """The motor vehicle alerts of one weekly report."""
    root = ET.fromstring(xml.encode() if isinstance(xml, str) else xml)
    report_date = _date((root.findtext("report_date") or "").strip(), "%d/%m/%Y")
    out = []
    for item in root.findall("notifications"):
        t = lambda k: re.sub(r"\s+", " ", item.findtext(k) or "").strip()
        if t("category") != CATEGORY:
            continue
        operator, measure, in_force = _measures(t("measures"))
        url = t("reference")
        out.append({
            "id": t("caseNumber") or url.rsplit("/", 1)[-1],
            "date": _date(t("publicationDate"), "%d-%m-%Y") or report_date,
            "report": ref,
            "product": t("product") or None,
            "brand": t("brand") or None,
            "models": t("name") or None,
            "type_approval": t("type_numberOfModel") or None,
            "production": t("productionDates") or None,
            "risk": t("riskType") or None,
            "level": t("level") or None,
            "hazard": t("danger") or None,
            "measure": measure,
            "taken_by": operator,
            "in_force": in_force,
            "recall_code": t("companyRecallCode") or None,
            "notified_by": COUNTRIES.get(t("notifyingCountry"), t("notifyingCountry") or None),
            "origin": t("countryOfOrigin") or None,
            "url": url or None,
        })
    return out
