import io
import json
import unittest
from datetime import datetime

from pipelines.fuel_prices import collect, oil_bulletin


def workbook() -> bytes:
    import openpyxl

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = oil_bulletin.SHEET
    ws.append(["title", "CTR", "DE_price_with_tax_euro95", "DE_price_with_tax_diesel", "DE_price_with_tax_LPG", "FR_price_with_tax_euro95",
               "PL_exchange_rate", "PL_price_with_tax_euro95", "PL_price_with_tax_diesel", "PL_price_with_tax_LPG",
               "EU_price_with_tax_euro95", "EU_price_with_tax_diesel", "EU_price_with_tax_LPG"])
    ws.append([None, None, "Euro-super 95", "Diesel", "LPG", "x", None, "x", "x", "x", "x", "x", "x"])
    ws.append(["Date", None, "1000 l", "1000 l", "1000 l", "1000 l", None, "1000 l", "1000 l", "1000 l", "1000 l", "1000 l", "1000 l"])
    ws.append([datetime(2026, 11, 2), "DE_", 2128, 2282, 1130.2, 1900, 0.25, 1500, 1800, None, 1929, 2154, 911])
    ws.append([datetime(2026, 10, 26), "DE_", 2167, 2298, 1130.2, 1910, 0.25, 1490, 1790, None, 1940, 2160, 912])
    ws.append(["Notes:"] + [None] * 12)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


class Parse(unittest.TestCase):
    def test_germany_rows_in_eur_per_litre(self):
        rows = oil_bulletin.parse_history(workbook())
        self.assertEqual([r["date"] for r in rows], ["2026-10-26", "2026-11-02"])
        self.assertEqual(rows[-1]["euro_super_95"], 2.128)
        self.assertEqual(rows[-1]["diesel"], 2.282)

    def test_missing_country_fails_loudly(self):
        with self.assertRaises(ValueError):
            oil_bulletin.parse_history(workbook(), country="XX")

    def test_summary(self):
        s = collect.summarize(oil_bulletin.parse_history(workbook()), "t")
        self.assertEqual(s["week"], "2026-11-02")
        self.assertEqual(s["products"]["euro_super_95"]["change_vs_previous_week"], -0.039)
        self.assertEqual(s["products"]["diesel"]["avg_4_weeks"], 2.29)

    def test_all_regions(self):
        regions = oil_bulletin.parse_all(workbook())
        self.assertEqual(sorted(regions), ["de", "eu", "pl"])  # FR lacks diesel/LPG columns
        pl, currency = regions["pl"]
        self.assertEqual(currency, "PLN")
        self.assertEqual(pl[-1]["euro_super_95"], 6.0)
        self.assertEqual(pl[-1]["euro_super_95_eur"], 1.5)
        self.assertIsNone(pl[-1]["lpg"])
        self.assertEqual(regions["eu"][1], "EUR")
        s = collect.summarize(pl, "t", "pl", currency)
        self.assertEqual((s["region"], s["currency"]), ("PL", "PLN"))
        self.assertEqual(s["products"]["diesel"]["price_per_litre"], 7.2)
        self.assertEqual(s["products"]["diesel"]["eur_per_litre"], 1.8)

    def test_run_writes_region_folders(self):
        import tempfile
        from pathlib import Path
        from unittest import mock

        from pipelines.charging_prices.storage import LocalStore, PrefixedStore

        book = workbook()
        with tempfile.TemporaryDirectory() as d, mock.patch.object(collect, "get_bytes", side_effect=[b"", book]):
            collect.run(PrefixedStore(LocalStore(d), "fuel-prices"))
            pub = Path(d) / "fuel-prices/public"
            self.assertTrue((pub / "de/latest.json").exists())
            self.assertIn("euro_super_95_eur", (pub / "pl/weekly.csv").read_text().splitlines()[0])
            index = json.loads((pub / "index.json").read_text())
            self.assertEqual(sorted(index["regions"]), ["de", "eu", "pl"])
            self.assertEqual(index["regions"]["pl"]["currency"], "PLN")

    def test_find_url(self):
        html = '<a href="/document/download/abc_en?filename=Weekly_Oil_Bulletin_Prices_History_maticni_4web.xlsx">x</a>'
        self.assertEqual(
            oil_bulletin.find_history_url(html),
            "https://energy.ec.europa.eu/document/download/abc_en?filename=Weekly_Oil_Bulletin_Prices_History_maticni_4web.xlsx",
        )
        self.assertEqual(oil_bulletin.find_history_url(""), oil_bulletin.FALLBACK_HISTORY_URL)


if __name__ == "__main__":
    unittest.main()
