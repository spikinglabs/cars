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
