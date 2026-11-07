import json
import unittest

from pipelines.charging_prices.storage import LocalStore, PrefixedStore
from pipelines.recalls import collect, nhtsa, safety_gate
from pipelines.recalls.models import MODELS, matches

LIST = b"""<?xml version="1.0"?><weeklyReports>
<weeklyReport><reference>Report-2026-44</reference>
<URL>https://ec.europa.eu/safety-gate-alerts/api/download/weeklyReport/detail/xml/10000330?language=2026&amp;search=x</URL></weeklyReport>
<weeklyReport><reference>Report-2018-1</reference>
<URL>https://ec.europa.eu/safety-gate-alerts/api/download/weeklyReport/detail/xml/1?language=2018</URL></weeklyReport>
</weeklyReports>"""

REPORT = """<?xml version="1.0"?><weeklyReport><report_date>06/11/2026</report_date>
<notifications><caseNumber>SR/03090/26</caseNumber><publicationDate>29-10-2026</publicationDate>
<reference>https://ec.europa.eu/safety-gate-alerts/screen/webReport/alertDetail/10119471</reference>
<category>Motor vehicles</category><product>Passenger car</product><brand>Volvo</brand><name></name>
<type_numberOfModel>EX30 / EX30CC</type_numberOfModel><riskType>Injuries</riskType>
<danger>The front seat head cushions may not be sufficiently secured.</danger>
<measures>Type of economic operator taking notified measure(s): ManufacturerCategory of measure(s): Recall of the product from end usersDate of entry into force: 22/10/2026</measures>
<notifyingCountry>Sweden</notifyingCountry><countryOfOrigin>China</countryOfOrigin><type>Consumer</type>
<level>Serious risk</level><companyRecallCode>R10400</companyRecallCode><productionDates>01.2024 - 03.2025</productionDates>
</notifications>
<notifications><caseNumber>SR/1/26</caseNumber><category>Toys</category><product>Doll</product></notifications>
</weeklyReport>"""


class SafetyGateTest(unittest.TestCase):
    def test_list_asks_for_english(self):
        refs = safety_gate.report_list(LIST)
        self.assertEqual(refs[0][0], "Report-2026-44")
        self.assertIn("language=en", refs[0][1])
        self.assertEqual(safety_gate.report_year(refs[1][0]), 2018)

    def test_report_keeps_motor_vehicles_only(self):
        rows = safety_gate.parse_report(REPORT, "Report-2026-44")
        self.assertEqual(len(rows), 1)
        r = rows[0]
        self.assertEqual(r["id"], "SR/03090/26")
        self.assertEqual(r["date"], "2026-10-29")
        self.assertEqual(r["notified_by"], "SE")
        self.assertEqual(r["measure"], "Recall of the product from end users")
        self.assertEqual(r["taken_by"], "Manufacturer")
        self.assertEqual(r["in_force"], "2026-10-22")
        self.assertIsNone(r["models"])

    def test_model_matching_reads_type_approval(self):
        r = safety_gate.parse_report(REPORT)[0]
        ex30 = next(m for m in MODELS if m[0] == "volvo-ex30")
        cx30 = next(m for m in MODELS if m[0] == "mazda-cx-30")
        self.assertTrue(matches(ex30, r))
        self.assertFalse(matches(cx30, r))
        self.assertTrue(matches(cx30, {"brand": "Mazda", "models": "CX-30, MX-30"}))
        self.assertFalse(matches(next(m for m in MODELS if m[0] == "mazda-cx-5"), {"brand": "Mazda", "models": "CX-50"}))

    def test_brand_key_merges_spellings(self):
        self.assertEqual(collect.brand_key("VW"), collect.brand_key("Volkswagen AG"))
        self.assertEqual(collect.brand_key("ŠKODA"), "skoda")
        self.assertEqual(collect.brand_key(None), "unknown")


class NhtsaTest(unittest.TestCase):
    def test_campaigns_merge_model_years(self):
        def rec(year):
            return {"NHTSACampaignNumber": "26V103000", "ReportReceivedDate": "21/02/2026", "ModelYear": str(year),
                    "Component": "TRACTION BATTERY", "Summary": "s", "parkOutSide": True}
        rows = nhtsa.parse({"results": [rec(2025)]}) + nhtsa.parse({"results": [rec(2026)]})
        merged = nhtsa.merge_years(rows)
        self.assertEqual(len(merged), 1)
        self.assertEqual(merged[0]["model_years"], [2025, 2026])
        self.assertEqual(merged[0]["date"], "2026-02-21")
        self.assertTrue(merged[0]["park_outside"])


class PublishTest(unittest.TestCase):
    def test_publish_writes_brand_model_and_summary_files(self):
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            store = PrefixedStore(LocalStore(d), "recalls")
            alerts = {a["id"]: a for a in safety_gate.parse_report(REPORT, "Report-2026-44")}
            out = collect.publish_eu(store, alerts, "2026-11-07T00:00:00+00:00", {})
            self.assertEqual(out["alerts"], 1)
            ex30 = json.loads(store.get("public/eu/models/volvo-ex30.json"))
            self.assertEqual(len(ex30["alerts"]), 1)
            self.assertEqual(ex30["region"], "EU")
            brands = json.loads(store.get("public/eu/brands.json"))["brands"]
            self.assertEqual(brands[0]["slug"], "volvo")
            latest = json.loads(store.get("public/eu/latest.json"))
            self.assertEqual(latest["alerts_last_30_days"], 1)
            self.assertIn("id,", store.get("public/eu/recalls.csv").decode().splitlines()[0])


if __name__ == "__main__":
    unittest.main()


class StatsTest(unittest.TestCase):
    def test_components_from_hazard_text(self):
        from pipelines.recalls.components import classify
        self.assertEqual(classify("The separator of the high voltage battery may be damaged."), "hv_battery")
        self.assertEqual(classify("A defect in the driver airbag inflator may cause ..."), "airbags_belts")
        self.assertEqual(classify("The brake hose may chafe on the wheel arch."), "brakes")
        self.assertEqual(classify("The connector of the positive battery cable may be damaged."), "electrical")
        self.assertEqual(classify("Nothing named here."), "other")

    def test_brand_key_takes_first_of_several(self):
        self.assertEqual(collect.brand_key("Opel/Vauxhall"), "opel")
        self.assertEqual(collect.brand_key("Citroen &amp; DS"), "citroen")
        self.assertEqual(collect.brand_key("Mercedes- Benz"), "mercedes-benz")
        self.assertEqual(collect.brand_key("Volkswagen (VW)"), "volkswagen")

    def test_statistics_normalise_by_registrations(self):
        from datetime import date
        rows = [{"id": str(i), "date": "2024-05-01", "brand": "VW", "product": "Passenger car", "risk": "Fire",
                 "component": "brakes"} for i in range(3)]
        rows.append({"id": "m", "date": "2024-06-01", "brand": "Ducati", "product": "Motorcycle", "risk": "Injuries",
                     "component": "brakes"})
        reg = {"brands": [{"slug": "vw", "months": [["2018-12", 999999], ["2024-01", 300000]]}]}
        s = collect.statistics(rows, date(2026, 11, 7), reg)
        self.assertEqual(s["years"][0]["cars"], 3)
        self.assertEqual(s["years"][0]["two_wheelers"], 1)
        vw = next(b for b in s["brands"] if b["slug"] == "volkswagen")
        self.assertEqual(vw["registrations_de"], 300000)
        self.assertEqual(vw["alerts_per_100k"], 1.0)
        self.assertEqual(next(c for c in s["components"] if c["key"] == "brakes")["cars"], 3)
