import io
import unittest
from datetime import datetime

from pipelines.fuel_prices import collect, oil_bulletin


def workbook() -> bytes:
    import openpyxl

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = oil_bulletin.SHEET
    ws.append(["title", "CTR", "DE_price_with_tax_euro95", "DE_price_with_tax_diesel", "DE_price_with_tax_LPG", "FR_price_with_tax_euro95"])
    ws.append([None, None, "Euro-super 95", "Diesel", "LPG", "x"])
    ws.append(["Date", None, "1000 l", "1000 l", "1000 l", "1000 l"])
    ws.append([datetime(2026, 11, 2), "DE_", 2128, 2282, 1130.2, 1900])
    ws.append([datetime(2026, 10, 26), "DE_", 2167, 2298, 1130.2, 1910])
    ws.append(["Notes:", None, None, None, None, None])
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

    def test_find_url(self):
        html = '<a href="/document/download/abc_en?filename=Weekly_Oil_Bulletin_Prices_History_maticni_4web.xlsx">x</a>'
        self.assertEqual(
            oil_bulletin.find_history_url(html),
            "https://energy.ec.europa.eu/document/download/abc_en?filename=Weekly_Oil_Bulletin_Prices_History_maticni_4web.xlsx",
        )
        self.assertEqual(oil_bulletin.find_history_url(""), oil_bulletin.FALLBACK_HISTORY_URL)


if __name__ == "__main__":
    unittest.main()
