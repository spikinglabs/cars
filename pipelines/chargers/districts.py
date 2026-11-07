"""Build the district and town reference table the charger statistics compare against.

    python -m pipelines.chargers.districts --kreise 04-kreise.xlsx --towns Auszug_GV.xlsx --kba fz1_2026.xlsx

Run it once a year when new files are out and commit the result (reference/districts.json):

- Destatis, Gemeindeverzeichnis "Kreisfreie Städte und Landkreise nach Fläche, Bevölkerung und
  Bevölkerungsdichte" (04-kreise.xlsx): population and area of every district (Kreis).
  https://www.destatis.de/DE/Themen/Laender-Regionen/Regionales/Gemeindeverzeichnis/_inhalt.html
- Destatis, Gemeindeverzeichnis "Gemeinden in Deutschland nach Fläche, Bevölkerung und Postleitzahl"
  (Auszug_GV.xlsx): population of every municipality; towns with at least TOWN_MIN residents are kept.
- Kraftfahrt-Bundesamt, FZ1 "Bestand an Kraftfahrzeugen nach Zulassungsbezirken" (fz1_<year>.xlsx),
  table FZ 1.2: passenger cars, battery electric (BEV) and plug-in hybrid cars per registration district.
  https://www.kba.de/DE/Statistik/Produktkatalog/produkte/Fahrzeuge/fz1_b_uebersicht.html

All three are under the Datenlizenz Deutschland – Namensnennung – 2.0.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import openpyxl

TOWN_MIN = 50_000
OUT = Path(__file__).parent / "reference" / "districts.json"

STATES = {
    "01": "Schleswig-Holstein", "02": "Hamburg", "03": "Niedersachsen", "04": "Bremen",
    "05": "Nordrhein-Westfalen", "06": "Hessen", "07": "Rheinland-Pfalz", "08": "Baden-Württemberg",
    "09": "Bayern", "10": "Saarland", "11": "Berlin", "12": "Brandenburg", "13": "Mecklenburg-Vorpommern",
    "14": "Sachsen", "15": "Sachsen-Anhalt", "16": "Thüringen",
}


def _rows(path: str, sheet: str | int):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb[sheet] if isinstance(sheet, str) else wb[wb.sheetnames[sheet]]
    rows = [list(r) for r in ws.iter_rows(values_only=True)]
    wb.close()
    return rows


def short_name(name: str) -> str:
    """'Köln, Stadt' -> 'Köln', 'Kiel, Landeshauptstadt' -> 'Kiel', 'Alb-Donau-Kreis' stays."""
    return name.split(",")[0].strip()


def read_kreise(path: str) -> list[dict]:
    out = []
    for r in _rows(path, 1):
        ars = str(r[0] or "").strip()
        if len(ars) != 5 or not ars.isdigit() or not isinstance(r[5], (int, float)):
            continue
        kind = (r[1] or "").strip()
        out.append({
            "ars": ars,
            "name": short_name(r[2]),
            "official_name": r[2].strip(),
            "city": kind in ("Kreisfreie Stadt", "Stadtkreis"),
            "kind": kind,
            "state": STATES[ars[:2]],
            "area_km2": round(float(r[4]), 2),
            "population": int(r[5]),
        })
    return out


def read_towns(path: str) -> list[dict]:
    out = []
    for r in _rows(path, 1):
        if str(r[0]) != "60" or not isinstance(r[9], (int, float)) or r[9] < TOWN_MIN:
            continue
        ars = f"{r[2]}{r[3]}{r[4]}{r[5]}{r[6]}"
        out.append({"ars": ars, "name": short_name(r[7]), "district": ars[:5], "population": int(r[9]),
                    "area_km2": round(float(r[8]), 2)})
    return out


_KEY = re.compile(r"^(\d{5})\s")


def read_kba(path: str) -> dict[str, dict]:
    """FZ 1.2 rows: key + name, then Insgesamt, Benzin, Diesel, Gas, Hybrid, darunter PHEV, BEV, sonstige."""
    out = {}
    for r in _rows(path, "FZ1.2"):
        cells = [c for c in r if c is not None and c != ""]
        for i, c in enumerate(cells):
            m = _KEY.match(str(c))
            if m:
                nums = cells[i + 1:i + 9]
                if len(nums) == 8 and all(isinstance(n, (int, float)) for n in nums):
                    out[m.group(1)] = {"cars": int(nums[0]), "phev": int(nums[5]), "bev": int(nums[6])}
                break
    return out


def kba_date(path: str) -> str | None:
    for r in _rows(path, "Impressum"):
        for c in r:
            m = re.search(r"(\d{1,2})\. (\w+) (\d{4})", str(c or ""))
            if m and "Januar" in m.group(2):
                return f"{m.group(3)}-01-01"
    return None


# Registration districts that differ from the districts of the population table.
KBA_FOLD = {"06415": "06435"}  # Hanau has its own registration district (2026) but is still in Main-Kinzig-Kreis
KBA_SHARED = {"07211"}  # KBA "07211 TRIER-SAARBURG" counts Trier city and Trier-Saarburg together: no split possible


def build(kreise: str, towns: str, kba: str) -> dict:
    districts = read_kreise(kreise)
    cars = read_kba(kba)
    for src, dst in KBA_FOLD.items():
        if src in cars and dst in cars:
            add = cars.pop(src)
            cars[dst] = {k: cars[dst][k] + add[k] for k in add}
    for key in KBA_SHARED:
        cars.pop(key, None)
    for d in districts:
        d.update(cars.get(d["ars"], {"cars": None, "phev": None, "bev": None}))
    return {
        "note": "Reference figures for the charger statistics. Population: Destatis Gemeindeverzeichnis (Census 2022 basis). "
                "Cars: KBA FZ1 table 1.2, registration districts matched to districts by their five-digit key; "
                "null where the registration district does not match one district.",
        "population_date": "2024-12-31",
        "cars_date": kba_date(kba),
        "sources": [
            {"name": "Statistisches Bundesamt (Destatis), Gemeindeverzeichnis-Informationssystem GV-ISys",
             "url": "https://www.destatis.de/DE/Themen/Laender-Regionen/Regionales/Gemeindeverzeichnis/_inhalt.html",
             "licence": "Datenlizenz Deutschland – Namensnennung – 2.0"},
            {"name": "Kraftfahrt-Bundesamt, FZ1 Bestand an Kraftfahrzeugen nach Zulassungsbezirken",
             "url": "https://www.kba.de/DE/Statistik/Produktkatalog/produkte/Fahrzeuge/fz1_b_uebersicht.html",
             "licence": "Datenlizenz Deutschland – Namensnennung – 2.0"},
        ],
        "town_min_population": TOWN_MIN,
        "districts": districts,
        "towns": read_towns(towns),
    }


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--kreise", required=True)
    p.add_argument("--towns", required=True)
    p.add_argument("--kba", required=True)
    p.add_argument("--out", default=str(OUT))
    a = p.parse_args(argv)
    ref = build(a.kreise, a.towns, a.kba)
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    Path(a.out).write_text(json.dumps(ref, ensure_ascii=False, indent=1) + "\n")
    missing = [d["name"] for d in ref["districts"] if d["bev"] is None]
    print(f"{len(ref['districts'])} districts, {len(ref['towns'])} towns, no car figures for: {missing}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
