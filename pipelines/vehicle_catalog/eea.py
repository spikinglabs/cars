"""Read the EEA CO2 monitoring data for new passenger cars (Regulation (EU) 2019/631).

Every new car registered in the EU, Iceland and Norway is reported with its type-approval (WLTP) figures:
CO2 in g/km, fuel consumption in L/100 km and electric energy consumption in Wh/km. The EEA publishes it
through its DiscoData SQL endpoint, one table per reporting year and data version:

    [CO2Emission].[latest].[co2cars_<year><P|F>v<version>]     P = provisional, F = final

The endpoint answers form-encoded POST requests (GET with named columns is blocked by its firewall), does the
grouping on the server, and returns JSON. We ask for one row per country, make, commercial name and fuel type
with registration counts and registration-weighted sums, so a whole year is about 30,000 rows and takes seconds.
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request

from pipelines.charging_prices.http import USER_AGENT

ENDPOINT = "https://discodata.eea.europa.eu/sql"
PAGE_URL = "https://www.eea.europa.eu/en/datahub/datahubitem-view/fa8b1229-3db6-495d-b18e-9c9b3267c02b"
LICENCE = "CC BY 4.0 (EEA re-use policy: free re-use with acknowledgement of the source)"

# Columns with units in their names, as the EEA spells them.
Z = "[Z (Wh/km)]"
CO2 = "[Ewltp (g/km)]"
POWER = "[Ep (KW)]"
MASS = "[M (kg)]"


def query(sql: str, *, rows: int = 20000, page: int = 1, timeout: float = 300, retries: int = 4) -> list[dict]:
    data = urllib.parse.urlencode({"query": sql, "p": page, "nrOfHits": rows}).encode()
    delay = 2.0
    for attempt in range(retries + 1):
        req = urllib.request.Request(ENDPOINT, data=data, headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                body = json.load(resp)
            break
        except urllib.error.HTTPError as exc:
            if exc.code not in (429, 500, 502, 503, 504) or attempt == retries:
                raise
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            if attempt == retries:
                raise
        time.sleep(delay)
        delay *= 2
    if body.get("errors"):
        raise LookupError(body["errors"][0].get("error", body["errors"]))
    return body.get("results", [])


def table_name(year: int, status: str, version: int) -> str:
    return f"co2cars_{year}{status}v{version}"


def find_latest_table(this_year: int, *, newest_version: int = 45, oldest_version: int = 25, ask=query) -> str:
    """The newest table. Data versions count up across years, so the highest version that exists wins."""
    for version in range(newest_version, oldest_version - 1, -1):
        for year in (this_year, this_year - 1, this_year - 2):
            for status in ("F", "P"):
                name = table_name(year, status, version)
                try:
                    ask(f"SELECT TOP 1 * FROM [CO2Emission].[latest].[{name}]", rows=1)
                    return name
                except LookupError:
                    continue
    raise LookupError("no co2cars table found")


def find_table(year: int, *, newest_version: int = 45, oldest_version: int = 5, ask=query) -> str:
    """The newest table of one data year, final before provisional."""
    for status in ("F", "P"):
        for version in range(newest_version, oldest_version - 1, -1):
            name = table_name(year, status, version)
            try:
                ask(f"SELECT TOP 1 * FROM [CO2Emission].[latest].[{name}]", rows=1)
                return name
            except LookupError:
                continue
    raise LookupError(f"no co2cars table for {year}")


FIGURES = {"z": Z, "fc": "Fc", "co2": CO2, "kw": POWER, "kg": MASS}


def aggregate_sql(table: str) -> str:
    """One row per country, make, commercial name and fuel type: registrations, and for each figure the
    registration-weighted sum and the registrations that reported it (so means skip missing values)."""
    cols = ["MS AS ms", "Mk AS mk", "Cn AS cn", "Ft AS ft", "SUM(R) AS n"]
    for key, col in FIGURES.items():
        cols.append(f"SUM(R * {col}) AS {key}_sum")
        cols.append(f"SUM(CASE WHEN {col} IS NOT NULL THEN R ELSE 0 END) AS {key}_n")
    return (f"SELECT {', '.join(cols)} FROM [CO2Emission].[latest].[{table}] "
            f"WHERE Ft IS NOT NULL GROUP BY MS, Mk, Cn, Ft")


def fetch_all(sql: str, *, page_size: int = 20000, ask=query) -> list[dict]:
    rows, page = [], 1
    while True:
        part = ask(sql, rows=page_size, page=page)
        rows += part
        if len(part) < page_size:
            return rows
        page += 1


def table_info(name: str) -> dict:
    """co2cars_2025Pv31 -> year 2025, provisional, version 31."""
    stem = name.removeprefix("co2cars_")
    return {"table": name, "year": int(stem[:4]), "status": "final" if stem[4] == "F" else "provisional",
            "version": int(stem.split("v")[-1])}
