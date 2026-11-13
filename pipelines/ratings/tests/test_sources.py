import unittest

from pipelines.ratings import sources as S
from pipelines.ratings.collect import build


class EuroNcap(unittest.TestCase):
    def test_urls_keep_safety_assessments_only(self):
        sm = ("<loc>https://www.euroncap.com/assessments/volvo/ex30/1098/</loc>"
              "<loc>https://www.euroncap.com/assessments/volvo/ex30/a024/</loc>"
              "<loc>https://www.euroncap.com/assessments/volvo/v90/0659pm/</loc>")
        self.assertEqual(S.euro_urls(sm), ["https://www.euroncap.com/assessments/volvo/ex30/1098/",
                                           "https://www.euroncap.com/assessments/volvo/v90/0659pm/"])

    def test_page(self):
        page = '<title>Euro NCAP | VW ID.7</title> ... {\\"safetyRatingStars\\":5, \\"ratingYear\\":2023}'
        r = S.parse_euro(page, "https://www.euroncap.com/assessments/volkswagen/id.7/1025/")
        self.assertEqual((r["make"], r["model"], r["stars"], r["year"]), ("VW", "ID.7", 5, 2023))
        self.assertIsNone(S.parse_euro("<title>Euro NCAP | X</title>", "https://www.euroncap.com/assessments/x/y/1/"))
        page = '<title>Euro NCAP | AION UT 2026 Safety Rating – 5 stars</title> {"safetyRatingStars":5,"ratingYear":2026}'
        r = S.parse_euro(page, "https://www.euroncap.com/assessments/aion/ut/1236/")
        self.assertEqual((r["make"], r["model"]), ("AION", "UT"))

    def test_child_facts_from_flight_data(self):
        import json
        data = {"selectedOverview": {"id": 1, "title": "2023-2025 Safety"}, "assessmentData": {"carSafety": {
            "safetyPerformance": {"childOccupant": {"score": 41.7, "maxScore": 49, "normalisedScore": 85, "safetyFeatures": {"features": {
                "isofix": {"frontPassenger": "NOT_AVAILABLE", "row2Outboard": "FITTED_STANDARD", "row2Centre": "Not Available"},
                "iSize": {"frontPassenger": "NOT_APPLICABLE", "row2Outboard": "FITTED_STANDARD"},
                "IntegratedCRS": {"row2Outboard": "Optional"},
                "childPresenceDetection": {"frontPassenger": "NOT_AVAILABLE", "row2Outboard": "FITTED_STANDARD"}}}}},
            "safetyEquipment": {"childProtection": {"isofix": {"seat3": "FITTED_STANDARD", "row3": "FITTED_STANDARD"},
                                                    "airbagCutOffSwitch": {"seat3": "FITTED_STANDARD"}}}}}}
        flight = json.dumps("x:" + json.dumps(data))
        page = ('<title>Euro NCAP | Kia EV4</title><script>self.__next_f.push([1,' + flight + '])</script>'
                '{\\"safetyRatingStars\\":5, \\"ratingYear\\":2025}')
        c = S.parse_euro(page, "https://www.euroncap.com/assessments/kia/ev4/1168/")["child"]
        self.assertEqual(c["protocol"], "2023-2025")
        self.assertEqual(c["occupant_pct"], 85)
        self.assertEqual((c["occupant_points"], c["occupant_max"]), (41.7, 49))
        self.assertEqual(c["isofix"], {"front": "none", "row2": "standard", "row2_centre": "none", "row3": "standard"})
        self.assertEqual(c["i_size"], {"row2": "standard"})
        self.assertEqual(c["integrated_seat"], {"row2": "optional"})
        self.assertEqual((c["airbag_switch"], c["presence_detection"]), ("standard", "standard"))

    def test_powertrains_from_variant_names(self):
        import json
        page = lambda *names, tags="[]": "<script>self.__next_f.push([1," + json.dumps(json.dumps(
            {"assessmentTags": json.loads(tags), "v": [{"variantName": n} for n in names]})) + "])</script>"
        self.assertEqual(S.parse_euro_powertrains(page("Electric 73 kWh 210 - Peugeot 3008", "Hybrid 145 e-DSC6 - Peugeot 3008")), ["electric", "fuel"])
        self.assertEqual(S.parse_euro_powertrains(page("2.0 diesel - 2.0 TDI", "1.5 petrol PHEV - 1.5 eHybrid")), ["fuel"])
        self.assertEqual(S.parse_euro_powertrains(page("Electric - 123kW FWD")), ["electric"])
        self.assertEqual(S.parse_euro_powertrains(page("2.5 litre MHEV - MAZDA CX-5")), ["fuel"])
        self.assertEqual(S.parse_euro_powertrains(page("Excellence AWD", tags='[{"code":"ELECTRIC"}]')), ["electric"])
        self.assertEqual(S.parse_euro_powertrains("<p>nothing</p>"), [])

    def test_child_2026_protocol_has_no_score(self):
        import json
        data = {"selectedOverview": {"title": "2026 Safety"}, "assessmentData": {"carSafety": {"crashProtection": {}},
            "additionalData": {"safetyEquipment": {
                "safeDriving": {"occupantMonitoring": {"airbagCutoffSwitch": "FITTED_STANDARD", "childPresenceDetection": "FITTED_STANDARD"}},
                "crashProtection": {"childSafety": {"iSize": {"frontPassenger": "FITTED_STANDARD", "rearPassenger": "FITTED_STANDARD"}}}}}}}
        c = S.parse_euro_child("<script>self.__next_f.push([1," + json.dumps(json.dumps(data)) + "])</script>")
        self.assertEqual((c["protocol"], c["occupant_pct"]), ("2026", None))
        self.assertEqual(c["i_size"], {"front": "standard", "rear": "standard"})
        self.assertIsNone(S.parse_euro_child("<p>nothing</p>"))

    def test_newest_rating_wins(self):
        a = {"make": "Volkswagen", "model": "Golf", "year": 2019, "url": "u/0805/", "stars": 5}
        b = {"make": "Volkswagen", "model": "Golf", "year": 2025, "url": "u/1115/", "stars": 4}
        self.assertEqual(S.latest_per_model([b, a]), [b])


class GreenNcap(unittest.TestCase):
    def test_new_title_with_half_star(self):
        page = "<title>Volkswagen Golf 2.0 TDI diesel FWD manual Green NCAP rating 2026 – 3½ stars</title>"
        r = S.parse_green(page, "https://www.greenncap.com/assessments/vw-golf-2026-0308/")
        self.assertEqual((r["stars"], r["year"], r["fuel"]), (3.5, 2026, "diesel"))

    def test_old_title_reads_the_star_list(self):
        page = ('<title>Green NCAP assessment of the VW Golf GTE plug-in hybrid 4x2 automatic, 2021</title>'
                '<ul class="star-rating"><li class="star full"><li class="star full"><li class="star full">'
                '<li class="star half"><li class="star empty"></ul>')
        r = S.parse_green(page, "u")
        self.assertEqual((r["name"], r["stars"], r["year"], r["fuel"]), ("VW Golf GTE plug-in hybrid 4x2 automatic", 3.5, 2021, "phev"))


class Adac(unittest.TestCase):
    def test_reports_newest_first(self):
        page = ('<a href="https://assets.adac.de/x/Pannenstatistik_2024_ab.pdf">'
                '<a href="https://assets.adac.de/x/Pannenstatistik_2025_Bericht_cd.pdf">')
        self.assertEqual([y for y, _ in S.adac_reports(page)], [2025, 2024])

    def test_values_go_to_their_column(self):
        w = lambda t, x: {"text": t, "x0": x - 5, "x1": x + 5}  # noqa: E731
        years = [2022, 2021, 2020]
        block = [
            ("VW Golf", [w("11", 50), w("2,6", 100), w("5,4", 130), w("4,5", 160)]),
            ("Dacia Logan", [w("12", 50), w("5,4", 160)]),
        ]
        out = S._place(block, years)
        self.assertEqual(out[1], {"name": "Dacia Logan", "rates": {"2020": 5.4}})
        self.assertEqual(out[0]["rates"]["2022"], 2.6)


class Build(unittest.TestCase):
    def test_shape(self):
        d = build([{"name": "Volvo EX30", "make": "Volvo", "model": "EX30", "stars": 5, "year": 2024, "url": "u"}], [], None, "now")
        self.assertEqual(d["euro_ncap"]["models"][0]["stars"], 5)
        self.assertIsNone(d["adac_breakdowns"])


if __name__ == "__main__":
    unittest.main()
