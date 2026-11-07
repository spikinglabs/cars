import math
import random
import unittest
from datetime import date, timedelta

from pipelines.price_forecast import fit_ar, forecast_series, regular


def weeks(n, start=date(2020, 1, 6)):
    return [(start + timedelta(days=7 * i)).isoformat() for i in range(n)]


class Models(unittest.TestCase):
    def test_random_walk_publishes_naive(self):
        rnd = random.Random(1)
        y = [1.5]
        for _ in range(399):
            y.append(y[-1] + rnd.gauss(0, 0.02))
        fc = forecast_series(weeks(400), y)
        self.assertEqual(fc["model"], "naive")
        self.assertTrue(all(p["price"] == round(y[-1], 3) for p in fc["forecast"]))
        self.assertEqual(fc["backtest"]["skill_vs_naive"], [0.0] * 8)

    def test_steady_trend_beats_naive(self):
        y = [1 + 0.01 * i + 0.002 * math.sin(i) for i in range(300)]
        fc = forecast_series(weeks(300), y)
        self.assertIn(fc["model"], ("drift", "ar"))
        self.assertGreater(fc["backtest"]["skill_vs_naive"][3], 0.5)
        self.assertGreater(fc["forecast"][-1]["price"], fc["forecast"][0]["price"])

    def test_bands_contain_point_and_widen(self):
        rnd = random.Random(2)
        y = [2.0]
        for _ in range(299):
            y.append(y[-1] + rnd.gauss(0, 0.03))
        path = forecast_series(weeks(300), y)["forecast"]
        for p in path:
            self.assertLessEqual(p["lo95"], p["lo80"])
            self.assertLessEqual(p["lo80"], p["price"])
            self.assertLessEqual(p["price"], p["hi80"])
            self.assertLessEqual(p["hi80"], p["hi95"])
        widths = [p["hi95"] - p["lo95"] for p in path]
        self.assertEqual(widths, sorted(widths))
        self.assertEqual(path[0]["date"], (date(2020, 1, 6) + timedelta(days=7 * 300)).isoformat())

    def test_short_history_gives_none(self):
        self.assertIsNone(forecast_series(weeks(30), [1.0] * 30))

    def test_ar_recovers_coefficient(self):
        rnd = random.Random(3)
        d = [0.0]
        for _ in range(2000):
            d.append(0.6 * d[-1] + rnd.gauss(0, 1))
        phi = fit_ar(d, 1)
        self.assertAlmostEqual(phi[0], 0.6, delta=0.05)


class Regular(unittest.TestCase):
    def test_fills_holiday_gap_and_stops_at_long_gap(self):
        rows = [
            {"date": "2020-01-06", "p": 1.0},
            {"date": "2020-06-01", "p": 1.1},  # long gap before this: run starts here
            {"date": "2020-06-08", "p": 1.2},
            {"date": "2020-06-29", "p": 1.5},  # two missing weeks
            {"date": "2020-07-06", "p": None},
        ]
        d, v = regular(rows, "p")
        self.assertEqual(d, ["2020-06-01", "2020-06-08", "2020-06-15", "2020-06-22", "2020-06-29"])
        self.assertEqual([round(x, 3) for x in v], [1.1, 1.2, 1.3, 1.4, 1.5])


if __name__ == "__main__":
    unittest.main()
