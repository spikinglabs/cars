import json
import tempfile
import unittest
from datetime import datetime, timezone
from unittest import mock

from pipelines.charging_prices import collect, ocpdb
from pipelines.charging_prices.storage import LocalStore


class RawSnapshotTest(unittest.TestCase):
    def run_once(self, store, items, when):
        log = []
        ts = when.strftime("%Y%m%dT%H%M%SZ")
        with mock.patch.object(ocpdb, "fetch_all", return_value=(items, len(items))):
            collect.collect_ocpdb(store, when, ts, ["tariffs_ocpi22"], log)
        return log[0]

    def test_every_fetch_is_recorded(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = LocalStore(tmp)
            a = [{"id": "t1", "price": 0.5}]
            first = self.run_once(store, a, datetime(2026, 11, 10, 1, 7, tzinfo=timezone.utc))
            self.assertTrue(first["stored"])
            second = self.run_once(store, a, datetime(2026, 11, 10, 2, 7, tzinfo=timezone.utc))
            self.assertFalse(second["stored"])
            pointer = json.loads(store.get(second["key"]))
            self.assertEqual(pointer["same_as"], first["key"])
            self.assertEqual(pointer["observed_at"], "2026-11-10T02:07:00+00:00")
            self.assertTrue(second["key"].endswith("20261110T020700Z.same.json"))
            # latest.json still names the full copy
            self.assertEqual(json.loads(store.get("raw/ocpdb/tariffs_ocpi22/latest.json"))["key"], first["key"])
            third = self.run_once(store, [{"id": "t1", "price": 0.6}], datetime(2026, 11, 10, 3, 7, tzinfo=timezone.utc))
            self.assertTrue(third["stored"])
            self.assertEqual(len(store.list_keys("raw/ocpdb/tariffs_ocpi22/2026/11/10")), 3)


if __name__ == "__main__":
    unittest.main()
