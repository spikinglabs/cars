import json
import tempfile
import unittest
from datetime import datetime, timezone
from unittest import mock

from pipelines.charging_prices.storage import LocalStore, PrefixedStore
from pipelines.electricity_prices import collect, smard

H = 3_600_000
# 2026-11-07 00:00 Berlin = 2026-11-06 23:00 UTC
DAY0 = int(datetime(2026, 11, 6, 23, tzinfo=timezone.utc).timestamp() * 1000)


class SmardTest(unittest.TestCase):
    def test_parse_skips_missing(self):
        self.assertEqual(smard.parse({"series": [[1, 50.5], [2, None]]}), {1: 50.5})

    def test_cheapest_window_needs_consecutive_slots(self):
        pts = [(DAY0 + i * H, v) for i, v in enumerate([100, 20, 10, 90, 5, 300])]
        self.assertEqual(collect.cheapest(pts, 1, 60)["eur_mwh"], 5)
        two = collect.cheapest(pts, 2, 60)
        self.assertEqual(two["eur_mwh"], 15)
        self.assertTrue(two["start"].startswith("2026-11-07T01:00:00+01:00"))
        gap = [p for p in pts if p[1] != 10]  # 20 and 90 no longer touch
        self.assertEqual(collect.cheapest(gap, 2, 60)["eur_mwh"], 47.5)

    def test_tariff_estimate(self):
        self.assertAlmostEqual(collect.tariff(100), round((0.1 + collect.ADDON_EUR_KWH_NET) * 1.19, 4))

    def test_days_are_german_time(self):
        self.assertEqual(collect.local_day(DAY0), "2026-11-07")
        self.assertEqual(collect.local_day(DAY0 - 1), "2026-11-06")


class RunTest(unittest.TestCase):
    def test_run_writes_today_and_history(self):
        hourly = {DAY0 - 24 * H + i * H: 80.0 + i for i in range(48)}
        quarter = {DAY0 + i * H // 4: 60.0 + (i % 7) for i in range(96)}
        def fake(resolution, newest=None, log=print):
            return dict(hourly if resolution == "hour" else quarter)
        with tempfile.TemporaryDirectory() as d, mock.patch.object(collect, "fetch", fake):
            store = PrefixedStore(LocalStore(d), "electricity-prices")
            r = collect.run(store, now=datetime(2026, 11, 7, 9, tzinfo=timezone.utc))
            latest = json.loads(store.get("public/de/latest.json"))
            self.assertEqual([x["date"] for x in latest["days"]], ["2026-11-07"])
            self.assertEqual(latest["days"][0]["step_minutes"], 15)
            self.assertEqual(len(latest["days"][0]["slots"]), 96)
            self.assertEqual([w["hours"] for w in latest["days"][0]["cheapest"]], collect.WINDOWS)
            daily = store.get("public/de/daily.csv").decode().splitlines()
            self.assertEqual(len(daily), 3)  # header + 6 and 7 Nov
            self.assertEqual(r["hours"], 48)


if __name__ == "__main__":
    unittest.main()
