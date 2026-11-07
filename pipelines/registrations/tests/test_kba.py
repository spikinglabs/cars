import io
import json
import unittest

from pipelines.charging_prices.storage import LocalStore
from pipelines.registrations import collect, kba


def workbook(month_label: str, new_layout: bool = True, volvo_ex30: int = 1058) -> bytes:
    """A small FZ10 workbook in the 2021+ layout (headings on the Marke row) or the 2019 one (row above)."""
    import openpyxl

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "FZ 10.1"
    ws.append([None, "Fahrzeugzulassungen (FZ)"])
    groups = (["Insgesamt", "mit Dieselantrieb", "mit Hybridantrieb \n(incl. Plug-in-Hybrid)", "Plug-in-Hybridantrieb",
               "mit Elektroantrieb (BEV)", "mit Allradantrieb"] if new_layout
              else ["Insgesamt", "mit Dieselantrieb", "mit Hybridantrieb", "mit Elektroantrieb", "mit Allradantrieb"])
    heads = [None, None, None]
    for g in groups:
        heads += [g, None, None]
    months = [None, None, None] + [month_label, "Jan.-", "Anteil in %"] * len(groups)
    if new_layout:
        ws.append([None, "Marke", "Modellreihe"] + heads[3:])
        ws.append(months)
    else:
        ws.append(heads)
        ws.append([None, "Marke", "Modellreihe"] + months[3:])

    def row(brand, model, *vals):
        out = [None, brand, model]
        for v in vals:
            out += [v, 0, 0]
        return out

    if new_layout:
        ws.append(row("VOLVO", "EX30", volvo_ex30, "-", "-", "-", volvo_ex30, 160))
        ws.append(row(None, "XC60", 1098, "-", 1098, 140, "-", 1098))
        ws.append(row(None, "SONSTIGE", 5, "-", "-", "-", 5, "-"))
        ws.append(row("VOLVO ZUSAMMEN", "", volvo_ex30 + 1103, 0, 1098, 140, volvo_ex30 + 5, 0))
        ws.append(row("VW", "GOLF", 8000, 1500, 2000, 300, "-", 50))
        ws.append(row("VW ZUSAMMEN", "", 8000, 1500, 2000, 300, 0, 50))
        ws.append(row("SONSTIGE ZUSAMMEN", "", 100, 10, 10, 1, 20, 0))
        total = volvo_ex30 + 1103 + 8000 + 100
        ws.append(row("NEUZULASSUNGEN INSGESAMT", "", total, 1510, 3108, 441, volvo_ex30 + 25, 50))
    else:
        ws.append(row("VOLVO", "XC60", 1424, 1128, 126, "-", 100))
        ws.append(row("VOLVO ZUSAMMEN", None, 1424, 1128, 126, 0, 100))
        ws.append(row("SONSTIGE", None, 50, 5, 1, 2, 0))
        ws.append(row("NEUZULASSUNGEN INSGESAMT", None, 1474, 1133, 127, 2, 100))
    ws.append([None, None])
    ws.append([None, "© Kraftfahrt-Bundesamt, Flensburg"])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


LIST_HTML = """
<a href="/SharedDocs/Downloads/DE/Statistik/Fahrzeuge/FZ10/fz10_2019_01_xlsx.xlsx?__blob=publicationFile&amp;v=2">Januar 2019</a>
<a href="/SharedDocs/Downloads/DE/Statistik/Fahrzeuge/FZ10/fz10_2025_09.xlsx?__blob=publicationFile&amp;v=2">September 2025</a>
<a href="/SharedDocs/Downloads/DE/Statistik/Fahrzeuge/FZ10/fz10_2026_09.xlsx?__blob=publicationFile&amp;v=3">September 2026</a>
"""


class Parse(unittest.TestCase):
    def test_list_page(self):
        months = kba.list_months(LIST_HTML)
        self.assertEqual(list(months), ["2019-01", "2025-09", "2026-09"])
        self.assertTrue(months["2026-09"].startswith("https://www.kba.de/SharedDocs/"))
        self.assertIn("&v=3", months["2026-09"])

    def test_new_layout(self):
        d = kba.parse(workbook("September 2026"), "2026-09")
        ex30 = d["models"][0]
        self.assertEqual((ex30["brand"], ex30["model"], ex30["total"], ex30["bev"], ex30["diesel"]), ("VOLVO", "EX30", 1058, 1058, 0))
        self.assertEqual([m["model"] for m in d["models"]], ["EX30", "XC60", "SONSTIGE", "GOLF"])
        self.assertEqual(d["models"][3]["brand"], "VW")
        self.assertEqual([b["brand"] for b in d["brands"]], ["VOLVO", "VW", "SONSTIGE"])
        self.assertEqual(d["market"]["total"], sum(b["total"] for b in d["brands"]))
        self.assertEqual(d["market"]["phev"], 441)

    def test_old_layout_has_no_phev(self):
        d = kba.parse(workbook("Januar 2019", new_layout=False), "2019-01")
        self.assertEqual(d["models"][0]["model"], "XC60")
        self.assertIsNone(d["models"][0]["phev"])
        self.assertEqual(d["models"][0]["bev"], 0)
        self.assertEqual(d["market"]["bev"], 2)
        self.assertEqual([b["brand"] for b in d["brands"]], ["VOLVO", "SONSTIGE"])

    def test_slug(self):
        self.assertEqual(kba.slug("MERCEDES", "GLK, GLC"), "mercedes-glk-glc")
        self.assertEqual(kba.slug("LYNK & CO", "01"), "lynk-and-co-01")


class Collect(unittest.TestCase):
    def test_run_builds_public_files_and_skips_unchanged(self):
        import tempfile

        books = {"2019-01": workbook("Januar 2019", new_layout=False), "2025-09": workbook("September 2025", volvo_ex30=500),
                 "2026-09": workbook("September 2026")}
        calls = []

        def fetch(url):
            calls.append(url)
            if url == kba.LIST_URL:
                return LIST_HTML.encode()
            return books[next(m for m in books if m.replace("-", "_") in url)]

        with tempfile.TemporaryDirectory() as tmp:
            store = LocalStore(tmp)
            r = collect.run(store, delay=0, fetch=fetch)
            self.assertEqual(r["changed"], ["2019-01", "2025-09", "2026-09"])
            latest = json.loads(store.get("public/de/latest.json"))
            self.assertEqual(latest["month"], "2026-09")
            self.assertEqual(latest["top_models"][0]["model"], "GOLF")
            self.assertNotIn("SONSTIGE", [m["model"] for m in latest["top_models"]])
            self.assertEqual(latest["top_electric"][0]["slug"], "volvo-ex30")
            self.assertEqual(latest["top_electric"][0]["change_vs_last_year_pct"], 111.6)
            ex30 = json.loads(store.get("public/de/models/volvo-ex30.json"))
            self.assertEqual([m["month"] for m in ex30["months"]], ["2025-09", "2026-09"])
            models = {m["slug"]: m for m in json.loads(store.get("public/de/models.json"))["models"]}
            self.assertEqual(models["volvo-xc60"]["first_month"], "2019-01")
            self.assertEqual(models["vw-golf"]["rank"], 1)
            self.assertIsNone(models["volvo-sonstige"]["rank"])
            market = store.get("public/de/market.csv").decode().splitlines()
            self.assertEqual(market[0], "month,total,diesel,hybrid,phev,bev,petrol_etc,bev_share")
            self.assertTrue(market[1].startswith("2019-01,1474,1133,127,,2,"))
            self.assertIn("2026-09,VW,GOLF,vw-golf,8000", store.get("public/de/monthly.csv").decode())

            calls.clear()
            r2 = collect.run(store, delay=0, fetch=fetch)
            self.assertEqual(calls, [kba.LIST_URL])  # nothing new, nothing downloaded
            self.assertEqual(r2["changed"], [])


if __name__ == "__main__":
    unittest.main()
