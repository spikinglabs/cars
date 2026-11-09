import json
import unittest

from pipelines.charging_prices.storage import LocalStore
from pipelines.vehicle_catalog import collect, versions


def vrow(mk, cn, ft, va, kw, n, z=None, fc=None, er=None, n_de=None, kg=1800):
    r = {"mk": mk, "cn": cn, "ft": ft, "va": va, "kw": kw, "n": n, "n_de": n if n_de is None else n_de, "n_eu": n,
         "er_min": er, "er_max": er}
    for key, val in (("z", z), ("fc", fc), ("co2", 0 if ft == "electric" else 120), ("kg", kg), ("er", er)):
        r[f"{key}_sum"] = val * n if val is not None else None
        r[f"{key}_n"] = n if val is not None else 0
    return r


ROWS_2025 = [
    # EX30: two batteries under the same name and power, and a twin motor
    vrow("VOLVO", "EX30", "electric", "2ZEL", 200, 2400, z=170, er=475),
    vrow("VOLVO", "EX30", "electric", "2ZEM", 200, 800, z=171, er=337),
    vrow("VOLVO", "EX30", "electric", "2ZEK", 315, 1100, z=175, er=449),
    # ID.3: trims in the name, power figures dropped from the trim
    vrow("VOLKSWAGEN", "ID.3 PRO S 170KW", "electric", "ACEDCAD8SX2", 170, 4300, z=158, er=556),
    vrow("VOLKSWAGEN", "ID.3 GTX 210 KW", "electric", "ACEDFAD7PX2", 210, 2600, z=148, er=596),
    vrow("VOLKSWAGEN", "ID.3 GTX 210 KW", "electric", "", 70, 5),  # placeholder: no figures, too few
    vrow("VOLKSWAGEN", "GOLF", "petrol", "ACDXDBX0", 110, 26000, fc=5.4),
    vrow("VOLKSWAGEN", "GOLF", "petrol", "ACDNPDX0", 195, 8700, fc=7.2),
]
ROWS_2024 = [
    vrow("VOLVO", "EX30", "electric", "2ZEL", 200, 3000, z=171, er=476),
    # the same ID.3 Pro S reported with its 30-minute power for part of the cars
    vrow("VOLKSWAGEN", "ID.3 PRO S 170KW", "electric", "ACEDCAD8SX2", 70, 1800, z=159, er=550),
    vrow("VOLKSWAGEN", "ID.3 PRO S 170KW", "electric", "ACEDCAD8SX2", 170, 500, z=158, er=552),
]


def build(region="de"):
    by_year = [(2025, versions.clusters(ROWS_2025, region)), (2024, versions.clusters(ROWS_2024, region))]
    return versions.merge(by_year)


class Trims(unittest.TestCase):
    def test_trim_words(self):
        self.assertEqual(versions.trim("VW", "ID.3", "ID.3 PRO S 170KW"), "PRO S")
        self.assertEqual(versions.trim("VW", "ID.3", "ID.3 PURE 140 KW"), "PURE")
        self.assertEqual(versions.trim("Volvo", "EX30", "EX30"), None)
        self.assertEqual(versions.trim("BMW", "3 SERIES", "320D XDRIVE"), "320D XDRIVE")
        self.assertEqual(versions.trim("Peugeot", "208", "E-208 GT"), "GT")

    def test_pretty(self):
        self.assertEqual(versions.pretty_trim("PRO S"), "Pro S")
        self.assertEqual(versions.pretty_trim("320D XDRIVE"), "320d xDrive")
        self.assertEqual(versions.pretty_trim("GTX PERF."), "GTX Performance")


class Versions(unittest.TestCase):
    def test_battery_split(self):
        vs = build()
        ex30 = vs["volvo-ex30"]
        self.assertEqual(sorted((v["power_kw"], v["range_km"]) for v in ex30), [(200, 337), (200, 475), (315, 449)])
        big = next(v for v in ex30 if v["range_km"] == 475)
        self.assertEqual(big["years"], [2024, 2025])
        self.assertEqual(big["year"], 2025)
        self.assertEqual(big["codes"], ["2ZEL"])
        self.assertEqual(len({v["id"] for v in ex30}), 3)
        self.assertTrue(all(v["ref"].startswith("volvo-ex30:") for v in ex30))

    def test_trims_and_rated_power(self):
        vs = build()
        id3 = {v["id"]: v for v in vs["vw-id-3"]}
        self.assertEqual(set(id3), {"pro-s-170kw", "gtx-210kw"})
        # the 70 kW rows of 2024 are the same Pro S
        self.assertEqual(id3["pro-s-170kw"]["years"], [2024, 2025])
        self.assertEqual(id3["gtx-210kw"]["trim"], "GTX")

    def test_fuel_cars(self):
        vs = build()
        golf = vs["vw-golf-petrol"]
        self.assertEqual([v["id"] for v in golf], ["110kw", "195kw"])
        self.assertEqual(golf[0]["l_per_100km"], 5.4)
        self.assertIsNone(golf[0]["range_km"])

    def test_region_counts(self):
        rows = [vrow("VOLVO", "EX30", "electric", "2ZEL", 200, 500, z=170, er=475, n_de=0)]
        self.assertEqual(versions.clusters(rows, "de"), {})
        self.assertEqual(len(versions.clusters(rows, "eu")["volvo-ex30"]), 1)


class Publish(unittest.TestCase):
    def test_files(self):
        import tempfile
        from datetime import datetime, timezone
        from pipelines.vehicle_catalog.tests.test_catalog import ROWS
        with tempfile.TemporaryDirectory() as d:
            store = LocalStore(d)
            info = {"table": "co2cars_2025Pv31", "year": 2025, "status": "provisional", "version": 31}
            counts = collect.publish(store, ROWS, info, datetime(2026, 1, 1, tzinfo=timezone.utc),
                                     version_rows=[(2025, ROWS_2025)])
            self.assertGreater(counts["de"]["versions"], 0)
            volvo = json.loads(store.get("public/de/versions/volvo.json"))
            self.assertIn("volvo-ex30", volvo["models"])
            self.assertNotIn("specs", volvo["models"]["volvo-ex30"][0])
            index = json.loads(store.get("public/de/versions/index.json"))
            self.assertIn("volvo", index["makes"])
            self.assertTrue(store.get("public/de/versions.csv").startswith(b"ref,"))


if __name__ == "__main__":
    unittest.main()
