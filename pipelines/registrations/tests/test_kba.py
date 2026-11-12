import io
import json
import unittest

from pipelines.charging_prices.storage import LocalStore
from pipelines.registrations import collect, kba


def workbook(month_label: str, new_layout: bool = True, volvo_ex30: int = 1058, sheet: str = "FZ 10.1") -> bytes:
    """A small FZ10 workbook in the 2021+ layout (headings on the Marke row) or the 2019 one (row above)."""
    import openpyxl

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = sheet
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
        ws.append([None, "MINI", None])  # brand name alone on its row (2020-07)
        ws.append(row(None, "MINI", 10, 0, 0, 0, 0))
        ws.append(row("MINI ZUSAMMEN", None, 10, 0, 0, 0, 0))
        ws.append(row("HYUNDAI", None, 53, 0, 0, 0, 0))  # a model row that lost its name (2020-08)
        ws.append(row("HYUNDAI ZUSAMMEN", None, 60, 0, 0, 0, 0))
        ws.append(row("LOTUS", None, 3, 0, 0, 0, 0))  # brand without model rows
        ws.append(row("VOLVO", "XC60", 1424, 1128, 126, "-", 100))
        ws.append(row("VOLVO ZUSAMMEN", None, 1424, 1128, 126, 0, 100))
        ws.append(row("SONSTIGE", None, 50, 5, 1, 2, 0))
        ws.append(row("NEUZULASSUNGEN INSGESAMT", None, 1547, 1133, 127, 2, 100))
    ws.append([None, None])
    ws.append([None, "© Kraftfahrt-Bundesamt, Flensburg"])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def segment_workbook() -> bytes:
    """A small FZ11 workbook: segment on the first row of its block, brand and model in one string."""
    import openpyxl

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "FZ 11.1"
    ws.append([None, "FZ 11.1 Neuzulassungen von Personenkraftwagen nach Segmenten und Modellreihen"])
    ws.append([None, "Segment", "Modellreihe", None, "September 2026", None])
    ws.append([None, None, None, None, "Anzahl", "Anteil in %"])
    ws.append([None, "KOMPAKTKLASSE", "VW GOLF", "", 8000, 80])
    ws.append([None, None, "SONSTIGE", "", 5, 0])
    ws.append([None, "KOMPAKTKLASSE ZUSAMMEN", "", "", 8005, 100])
    ws.append([None, "SUVs", "VOLVO EX30", "", 1058, 50])
    ws.append([None, None, "VOLVO XC60", "", 1098, 50])
    ws.append([None, "SUVs ZUSAMMEN", "", "", 2156, 100])
    ws.append([None, "GROSSRAUM-VANS", "VW TOURAN", "", 900, 100])
    ws.append([None, "NEUZULASSUNGEN INSGESAMT", "", "", 11061, 100])
    ws.append([None, "Hinweis:", None])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


SEGMENT_HTML = """
<a href="/SharedDocs/Downloads/DE/Statistik/Fahrzeuge/FZ11/fz11_2026_08.xlsx?__blob=publicationFile&amp;v=2">August 2026</a>
<a href="/SharedDocs/Downloads/DE/Statistik/Fahrzeuge/FZ11/fz11_2026_09.xlsx?__blob=publicationFile&amp;v=2">September 2026</a>
"""

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
        self.assertEqual([(m["brand"], m["model"]) for m in d["models"]], [("MINI", "MINI"), ("VOLVO", "XC60")])
        self.assertIsNone(d["models"][1]["phev"])
        self.assertEqual(d["models"][1]["bev"], 0)
        self.assertEqual(d["market"]["bev"], 2)
        self.assertEqual({b["brand"]: b["total"] for b in d["brands"]},
                         {"MINI": 10, "HYUNDAI": 60, "LOTUS": 3, "VOLVO": 1424, "SONSTIGE": 50})
        self.assertEqual(sum(b["total"] for b in d["brands"]), d["market"]["total"])

    def test_odd_sheet_name(self):
        d = kba.parse(workbook("November 2020", sheet="FZ 10-November 2020  "), "2020-11")
        self.assertEqual(d["models"][0]["model"], "EX30")

    def test_slug(self):
        self.assertEqual(kba.slug("MERCEDES", "GLK, GLC"), "mercedes-glk-glc")
        self.assertEqual(kba.slug("LYNK & CO", "01"), "lynk-and-co-01")


class Segments(unittest.TestCase):
    def test_list_page(self):
        months = kba.list_segment_months(SEGMENT_HTML)
        self.assertEqual(list(months), ["2026-08", "2026-09"])
        self.assertTrue(months["2026-09"].startswith("https://www.kba.de/SharedDocs/Downloads/DE/Statistik/Fahrzeuge/FZ11/fz11_2026_09.xlsx"))

    def test_parse(self):
        self.assertEqual(kba.parse_segments(segment_workbook()),
                         {"vw-golf": "compact", "volvo-ex30": "suv", "volvo-xc60": "suv", "vw-touran": "large-van"})


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
            if url == kba.SEGMENT_LIST_URL:
                return SEGMENT_HTML.encode()
            if "fz11_2026_09" in url:
                return segment_workbook()
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
            self.assertEqual(models["vw-golf"]["segment"], "compact")
            self.assertNotIn("segment", models["volvo-sonstige"])
            self.assertEqual(json.loads(store.get("public/de/models.json"))["segments_month"], "2026-09")
            self.assertEqual(ex30["segment"], "suv")
            self.assertEqual(r["segments_month"], "2026-09")
            self.assertIsNone(models["volvo-sonstige"]["rank"])
            market = store.get("public/de/market.csv").decode().splitlines()
            self.assertEqual(market[0], "month,total,diesel,hybrid,phev,bev,petrol_etc,bev_share")
            self.assertTrue(market[1].startswith("2019-01,1547,1133,127,,2,"))
            self.assertIn("2026-09,VW,GOLF,vw-golf,8000", store.get("public/de/monthly.csv").decode())

            calls.clear()
            r2 = collect.run(store, delay=0, fetch=fetch)
            self.assertEqual(calls, [kba.LIST_URL, kba.SEGMENT_LIST_URL])  # nothing new, nothing downloaded
            self.assertEqual(r2["changed"], [])
            self.assertFalse(r2["segments_changed"])

            # A newer parser re-parses the stored workbooks without downloading them again.
            state = json.loads(store.get("state/months.json"))
            state["2019-01"]["parser"] = 1
            store.put("state/months.json", json.dumps(state).encode())
            calls.clear()
            r3 = collect.run(store, delay=0, fetch=fetch)
            self.assertEqual(calls, [kba.LIST_URL, kba.SEGMENT_LIST_URL])
            self.assertEqual(r3["changed"], ["2019-01"])
            self.assertEqual(json.loads(store.get("state/months.json"))["2019-01"]["parser"], kba.PARSER)


if __name__ == "__main__":
    unittest.main()
