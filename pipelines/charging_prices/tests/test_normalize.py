import unittest

from pipelines.charging_prices import bnetza, normalize

ENBW = {
    "id": "139765",
    "source": "datex2_enbw",
    "currency": "EUR",
    "type": "AD_HOC_PAYMENT",
    "elements": [
        {
            "price_components": [
                {"type": "ENERGY", "price": 0.66386555, "taxes": [{"name": "VAT", "percentage": "19"}], "tax_included": False}
            ]
        },
        {
            "price_components": [
                {"type": "TIME", "price": 0.20168067, "taxes": [{"name": "VAT", "percentage": "19"}], "tax_included": False}
            ],
            "restrictions": {"min_duration": 1800},
        },
    ],
}


class GrossPrice(unittest.TestCase):
    def test_net_plus_vat(self):
        price, basis = normalize.gross_price(ENBW["elements"][0]["price_components"][0])
        self.assertAlmostEqual(price, 0.79, places=3)
        self.assertEqual(basis, "net+vat")

    def test_vat_as_fraction(self):
        comp = {"type": "ENERGY", "price": 0.5, "taxes": [{"name": "VAT", "percentage": "0.19000"}], "tax_included": False}
        self.assertAlmostEqual(normalize.gross_price(comp)[0], 0.595)

    def test_missing_tax_info_is_assumed_gross(self):
        self.assertEqual(normalize.gross_price({"type": "ENERGY", "price": 0.59}), (0.59, "assumed_gross"))


class Flatten(unittest.TestCase):
    def test_flatten(self):
        [row] = normalize.flatten_tariffs([ENBW], {"datex2_enbw": "cc-by/4.0"}, "2026-11-06T00:00:00+00:00")
        self.assertEqual(row["energy_eur_per_kwh"], 0.79)
        self.assertAlmostEqual(row["time_eur_per_hour"], 0.24, places=3)
        self.assertIsNone(row["session_fee_eur"])
        self.assertTrue(row["has_restrictions"])
        self.assertEqual(row["licence"], "cc-by/4.0")

    def test_summary_skips_unlicensed(self):
        rows = normalize.flatten_tariffs(
            [ENBW, {**ENBW, "id": "x", "source": "private"}],
            {"datex2_enbw": "cc-by/4.0", "private": None},
            "t",
        )
        s = normalize.summarize(rows)
        self.assertEqual(list(s["by_source"]), ["datex2_enbw"])
        self.assertEqual(s["overall"]["tariffs"], 1)


class Daily(unittest.TestCase):
    def test_upsert_replaces_same_day(self):
        summary = {"overall": {"tariffs": 1, "median": 0.5, "p10": 0.5, "p90": 0.5, "min": 0.5, "max": 0.5}, "by_source": {}}
        first = normalize.upsert_daily(None, "2026-11-06", summary)
        summary["overall"]["median"] = 0.6
        second = normalize.upsert_daily(first, "2026-11-06", summary).decode()
        self.assertEqual(second.count("2026-11-06"), 1)
        self.assertIn(",0.6,", second)
        third = normalize.upsert_daily(second.encode(), "2026-11-07", summary).decode()
        self.assertEqual(len(third.strip().splitlines()), 3)


class Prefix(unittest.TestCase):
    def test_keys_live_under_project_folder(self):
        import tempfile
        from pathlib import Path

        from pipelines.charging_prices.storage import LocalStore, PrefixedStore

        with tempfile.TemporaryDirectory() as d:
            store = PrefixedStore(LocalStore(d), "charging-prices")
            store.put("public/latest.json", b"{}")
            self.assertTrue((Path(d) / "charging-prices/public/latest.json").exists())
            self.assertEqual(store.get("public/latest.json"), b"{}")
            self.assertEqual(store.total_bytes(), (2, 1))


class Register(unittest.TestCase):
    def test_links(self):
        page = (
            '<a href="https://data.bundesnetzagentur.de/x/Ladesaeulenregister_BNetzA_2026-09-01.csv">csv</a>'
            '<a href="https://data.bundesnetzagentur.de/x/Ladesaeulenregister_BNetzA_2026-09-30.xlsx">x</a>'
            '<a href="https://data.bundesnetzagentur.de/x/Ladesaeulenregister_BNetzA_2026-09-01.csv">dup</a>'
        )
        links = bnetza.find_register_links(page)
        self.assertEqual(len(links), 2)
        self.assertEqual(bnetza.filename(links[0]), "Ladesaeulenregister_BNetzA_2026-09-01.csv")


if __name__ == "__main__":
    unittest.main()
