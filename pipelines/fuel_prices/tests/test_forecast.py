import unittest
from datetime import date, timedelta

from pipelines.fuel_prices import forecast


def rows(n, stop_lpg_at=None):
    out = []
    for i in range(n):
        d = (date(2020, 1, 6) + timedelta(days=7 * i)).isoformat()
        out.append({"date": d, "euro_super_95": 1.7 + 0.001 * (i % 9), "diesel": 1.6 + 0.002 * (i % 5),
                    "lpg": None if stop_lpg_at is not None and i >= stop_lpg_at else 0.9})
    return out


class MemStore(dict):
    def put(self, key, data, content_type):
        self[key] = data


class Forecast(unittest.TestCase):
    def test_builds_all_products(self):
        r = rows(200)
        fc = forecast.build(r, "de", "EUR", "t", r[-1]["date"])
        self.assertEqual(set(fc["products"]), {"euro_super_95", "diesel", "lpg"})
        self.assertEqual(len(fc["products"]["diesel"]["forecast"]), forecast.HORIZON)
        self.assertEqual(fc["region"], "DE")

    def test_stale_product_is_left_out(self):
        r = rows(200, stop_lpg_at=150)
        fc = forecast.build(r, "de", "EUR", "t", r[-1]["date"])
        self.assertNotIn("lpg", fc["products"])

    def test_write_files(self):
        r = rows(200)
        store = MemStore()
        self.assertEqual(forecast.write(store, "de", r, "EUR", "t", r[-1]["date"]), ["forecast.json", "forecast.csv"])
        csv = store["public/de/forecast.csv"].decode().splitlines()
        self.assertEqual(csv[0], "date,product,horizon,price,lo80,hi80,lo95,hi95")
        self.assertEqual(len(csv), 1 + 3 * forecast.HORIZON)

    def test_short_history_writes_nothing(self):
        r = rows(20)
        self.assertEqual(forecast.write(MemStore(), "de", r, "EUR", "t", r[-1]["date"]), [])
