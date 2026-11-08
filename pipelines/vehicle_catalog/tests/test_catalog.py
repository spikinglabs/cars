import json
import unittest
from datetime import datetime, timezone

from pipelines.charging_prices.storage import LocalStore
from pipelines.vehicle_catalog import catalog, collect, eea


def row(ms, mk, cn, ft, n, z=None, fc=None, co2=None):
    r = {"ms": ms, "mk": mk, "cn": cn, "ft": ft, "n": n}
    for key, val in (("z", z), ("fc", fc), ("co2", co2), ("kw", 100), ("kg", 1800)):
        r[f"{key}_sum"] = val * n if val is not None else None
        r[f"{key}_n"] = n if val is not None else 0
    return r


ROWS = [
    row("DE", "VOLVO", "EX30", "electric", 300, z=170),
    row("DE", "VOLVO", "VOLVO EX30 TWIN", "electric", 100, z=190),
    row("FR", "VOLVO", "EX30", "electric", 1000, z=160),
    row("NO", "VOLVO", "EX30", "electric", 5000, z=150),
    row("DE", "VOLKSWAGEN, VW", "ID.3 PRO 150KW", "electric", 50, z=None),
    row("FR", "VOLKSWAGEN", "ID.3 PURE", "electric", 50, z=150),
    row("DE", "VOLKSWAGEN-VW", "GOLF 1.5 ETSI", "petrol", 80, fc=5.5, co2=125),
    row("DE", "VOLKSWAGEN", "TIGUAN EHYBRID", "petrol/electric", 40, z=175, fc=0.5, co2=12),
    row("DE", "TOYOTA", "TOYOTA YARIS", "unknown", 999, fc=4),
    row("DE", "", "NO MAKE", "petrol", 999, fc=4),
]


class Names(unittest.TestCase):
    def test_makes(self):
        self.assertEqual(catalog.make_name("VOLKSWAGEN, VW"), "VW")
        self.assertEqual(catalog.make_name("Mercedes - Benz"), "Mercedes-Benz")
        self.assertEqual(catalog.make_name("TOYOTA/CARPOL"), "Toyota")
        self.assertIsNone(catalog.make_name(""))
        self.assertEqual(catalog.make_name("Mitsubishi Motors (Thailand) C"), "Mitsubishi")
        self.assertEqual(catalog.make_name("GREAT WALL MOTOR COMPANY LIMITED"), "GWM")

    def test_families(self):
        cases = {
            ("VW", "ID.7 TOURER PRO S"): "ID.7", ("VW", "ID. BUZZ PRO LR"): "ID. BUZZ", ("Tesla", "MODEL Y"): "MODEL Y",
            ("Hyundai", "IONIQ5"): "IONIQ 5", ("Hyundai", "KONA, KAUAI"): "KONA", ("BMW", "320D XDRIVE"): "3 SERIES",
            ("Renault", "RENAULT 5 E-TECH ELECTRIC"): "5", ("Citroen", "E-C3 AIRCROSS"): "C3 AIRCROSS",
            ("Mercedes-Benz", "C 200 D"): "C-CLASS", ("BYD", "BYD DOLPHIN SURF"): "DOLPHIN SURF", ("Volvo", "EX30"): "EX30",
            ("Hyundai", "TUCSONIX35"): "TUCSON", ("Hyundai", "TUCSON IX35"): "TUCSON", ("Audi", "E-TRON 55"): "E-TRON",
            ("Audi", "E-TRON GT"): "E-TRON GT", ("Mini", "JOHN COOPER WORKS GP"): "JOHN COOPER WORKS",
            ("Renault", "GRAND SCENIC"): "GRAND SCENIC", ("Mitsubishi", "MITSUBISHI SPACE STAR"): "SPACE STAR",
            ("Hyundai", "I 30 N"): "I30 N", ("Hyundai", "I30N"): "I30 N", ("Hyundai", "KONA N.KAUAI N"): "KONA N", ("Hyundai", "KONA. KAUAI"): "KONA", ("Hyundai", "SANTAFE"): "SANTA FE",
            ("Hyundai", "SANTA FE"): "SANTA FE", ("Genesis", "GV60. GENESIS GV60"): "GV60", ("VW", "ID. BUZZ"): "ID. BUZZ",
        }
        for (make, cn), fam in cases.items():
            self.assertEqual(catalog.family(make, cn), fam, cn)

    def test_pretty(self):
        self.assertEqual([catalog.pretty(x) for x in ["MODEL Y", "IX1", "EQA", "T-ROC", "MX-30", "IONIQ 5", "ID.3"]],
                         ["Model Y", "iX1", "EQA", "T-Roc", "MX-30", "Ioniq 5", "ID.3"])


class Build(unittest.TestCase):
    def setUp(self):
        self.rows = catalog.by_scope(ROWS)

    def test_germany_uses_german_mix(self):
        de = {m["id"]: m for m in catalog.build(self.rows, "de", min_registrations=1)}
        ex30 = de["volvo-ex30"]
        self.assertEqual(ex30["registrations"], 400)
        self.assertEqual(ex30["kwh_per_100km"], 17.5)  # (300*170 + 100*190) / 400 Wh/km
        self.assertEqual(ex30["kwh_range"], [17.0, 19.0])
        self.assertEqual(ex30["name"], "Volvo EX30")

    def test_falls_back_to_all_countries_when_region_lacks_a_figure(self):
        de = {m["id"]: m for m in catalog.build(self.rows, "de", min_registrations=1)}
        self.assertEqual(de["vw-id-3"]["kwh_per_100km"], 15.0)

    def test_eu_leaves_out_norway(self):
        eu = {m["id"]: m for m in catalog.build(self.rows, "eu", min_registrations=1)}
        self.assertEqual(eu["volvo-ex30"]["registrations"], 1400)

    def test_fuel_and_plug_in(self):
        de = {m["id"]: m for m in catalog.build(self.rows, "de", min_registrations=1)}
        self.assertEqual(de["vw-golf-petrol"]["l_per_100km"], 5.5)
        self.assertIsNone(de["vw-golf-petrol"]["kwh_per_100km"])
        phev = de["vw-tiguan-phev-petrol"]
        self.assertEqual((phev["l_per_100km"], phev["kwh_per_100km"]), (0.5, 17.5))
        self.assertNotIn("toyota-yaris", " ".join(de))

    def test_min_registrations(self):
        ids = [m["id"] for m in catalog.build(self.rows, "de", min_registrations=100)]
        self.assertEqual(ids, ["volvo-ex30"])

    def test_electric_compact(self):
        ev = catalog.electric(catalog.build(self.rows, "de", min_registrations=1))
        self.assertEqual(ev[0], ["volvo-ex30", "Volvo EX30", 17.5, 17.0, 19.0, 400])


class Merge(unittest.TestCase):
    def test_keeps_older_models_with_their_newest_year(self):
        new = [{"id": "volvo-ex30", "name": "Volvo EX30", "registrations": 400}]
        y24 = [{"id": "volvo-ex30", "name": "Volvo EX30", "registrations": 900},
               {"id": "bmw-i3", "name": "BMW i3", "registrations": 50}]
        y21 = [{"id": "bmw-i3", "name": "BMW i3", "registrations": 5000}]
        merged = catalog.merge([(2021, y21), (2025, new), (2024, y24)])
        self.assertEqual([(m["id"], m["year"], m["years"], m["registrations"]) for m in merged],
                         [("volvo-ex30", 2025, [2024, 2025], 400), ("bmw-i3", 2021, [2021, 2024], 5000)])

    def test_newest_year_wins_unless_it_sold_few(self):
        merged = catalog.merge([(2023, [{"id": "a", "name": "A", "registrations": 1000}]),
                                (2024, [{"id": "a", "name": "A", "registrations": 100}])])
        self.assertEqual((merged[0]["year"], merged[0]["registrations"]), (2024, 100))


class Eea(unittest.TestCase):
    def test_table_info(self):
        self.assertEqual(eea.table_info("co2cars_2025Pv31"),
                         {"table": "co2cars_2025Pv31", "year": 2025, "status": "provisional", "version": 31})

    def test_finds_highest_version(self):
        exists = {"co2cars_2024Fv30", "co2cars_2025Pv31", "co2cars_2024Pv29"}

        def ask(sql, rows=1, page=1):
            if not any(t in sql for t in exists):
                raise LookupError("Invalid object name")
            return [{}]
        self.assertEqual(eea.find_latest_table(2026, ask=ask), "co2cars_2025Pv31")

    def test_finds_final_table_of_a_year(self):
        exists = {"co2cars_2022Pv20", "co2cars_2022Fv22", "co2cars_2023Fv25"}

        def ask(sql, rows=1, page=1):
            if not any(t in sql for t in exists):
                raise LookupError("Invalid object name")
            return [{}]
        self.assertEqual(eea.find_table(2022, ask=ask), "co2cars_2022Fv22")

    def test_pages(self):
        pages = {1: [{}] * 3, 2: [{}] * 3, 3: [{}]}
        self.assertEqual(len(eea.fetch_all("q", page_size=3, ask=lambda sql, rows, page: pages[page])), 7)

    def test_sql_groups_by_country(self):
        sql = eea.aggregate_sql("co2cars_2025Pv31")
        self.assertIn("GROUP BY MS, Mk, Cn, Ft", sql)
        self.assertIn("[Z (Wh/km)]", sql)


class Publish(unittest.TestCase):
    def test_writes_region_files(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            store = LocalStore(tmp)
            info = eea.table_info("co2cars_2025Pv31")
            collect.publish(store, ROWS, info, datetime(2026, 11, 7, tzinfo=timezone.utc))
            idx = json.loads(store.get("public/index.json"))
            self.assertEqual(sorted(idx["regions"]), ["de", "eu"])
            ev = json.loads(store.get("public/de/electric.json"))
            self.assertEqual(ev["year"], 2025)
            self.assertEqual(ev["models"][0][0], "volvo-ex30")
            self.assertTrue(store.get("public/eu/models.csv").startswith(b"id,make,model"))

    def test_older_years_add_models_no_longer_sold(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            store = LocalStore(tmp)
            older = [(2021, [row("DE", "BMW", "I3 120AH", "electric", 500, z=160)] + ROWS)]
            counts = collect.publish(store, ROWS, eea.table_info("co2cars_2025Pv31"),
                                     datetime(2026, 11, 7, tzinfo=timezone.utc), older)
            de = json.loads(store.get("public/de/models.json"))
            self.assertEqual(de["years"], [2021, 2025])
            by_id = {m["id"]: m for m in de["models"]}
            self.assertEqual((by_id["bmw-i3"]["year"], by_id["bmw-i3"]["kwh_per_100km"]), (2021, 16.0))
            self.assertEqual((by_id["volvo-ex30"]["year"], by_id["volvo-ex30"]["years"]), (2025, [2021, 2025]))
            self.assertEqual(de["models"][-1]["id"], "bmw-i3")
            self.assertEqual(counts["de"]["older_models"], 1)
            self.assertIn("bmw-i3", [m[0] for m in json.loads(store.get("public/de/electric.json"))["models"]])

    def test_older_years_reuse_final_tables(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            store = LocalStore(tmp)
            found, fetched = [], []
            find = lambda y: found.append(y) or {2023: "co2cars_2023Fv27", 2024: "co2cars_2024Pv29"}[y]
            fetch = lambda sql: fetched.append(sql) or [{}] * 1000
            collect.FIRST_YEAR, first = 2023, collect.FIRST_YEAR
            try:
                self.assertEqual([y for y, _ in collect.older_years(store, 2025, find, fetch)], [2023, 2024])
                self.assertEqual(len(fetched), 2)
                collect.older_years(store, 2025, find, fetch)
            finally:
                collect.FIRST_YEAR = first
            self.assertEqual(found, [2023, 2024, 2024])  # the provisional year is looked up again
            self.assertEqual(len(fetched), 2)  # rows come from raw/ the second time


if __name__ == "__main__":
    unittest.main()
