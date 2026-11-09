import json
import tempfile
import unittest
from pathlib import Path

from pipelines.charging_prices.storage import LocalStore, PrefixedStore
from pipelines.mcp_usage import rollup


def line(**kw):
    return json.dumps(kw) + "\n"


class RollupTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = PrefixedStore(LocalStore(self.tmp.name), "mcp-usage")
        put = lambda k, s: self.store.put(k, s.encode(), "application/x-ndjson")
        put("raw/2026-11-08/101500000-aaaaaa.ndjson",
            line(t="2026-11-08T10:15:00Z", site="prod", method="initialize", client={"name": "claude-ai", "version": "1"}, ms=1, ok=True, country="DE"))
        put("raw/2026-11-08/101501000-bbbbbb.ndjson",
            line(t="2026-11-08T10:15:01Z", site="prod", method="tools/call", tool="find_chargers", ms=40, ok=True, country="DE")
            + line(t="2026-11-08T10:15:02Z", site="prod", method="tools/call", tool="get_recalls", ms=80, ok=False, err="x", country="AT")
            + "not json\n")
        put("raw/2026-11-08/090000000-cccccc.ndjson",
            line(t="2026-11-08T09:00:00Z", site="preview", method="tools/call", tool="get_recalls", ms=5, ok=True))
        put("raw/2026-11-09/000001000-dddddd.ndjson", line(t="2026-11-09T00:00:01Z", site="prod", method="ping", ok=True))

    def tearDown(self):
        self.tmp.cleanup()

    def test_rolls_up_finished_days_only_and_deletes_their_raw_files(self):
        self.assertEqual(rollup.rollup(self.store, today="2026-11-09"), ["2026-11-08"])
        self.assertEqual(self.store.list_keys("raw/"), ["raw/2026-11-09/000001000-dddddd.ndjson"])
        daily = rollup.parse_lines(self.store.get("derived/daily/2026-11-08.ndjson"))
        self.assertEqual([e["t"] for e in daily], sorted(e["t"] for e in daily))
        self.assertEqual(len(daily), 4)
        day = json.loads(self.store.get("derived/summary.json"))["days"]["2026-11-08"]
        self.assertEqual(day["requests"], 3)
        self.assertEqual(day["sessions"], 1)
        self.assertEqual(day["tool_calls"], 2)
        self.assertEqual(day["errors"], 1)
        self.assertEqual(day["clients"], {"claude-ai": 1})
        self.assertEqual(day["countries"], {"DE": 2, "AT": 1})
        self.assertEqual(day["preview_requests"], 1)
        self.assertEqual(day["tool_errors"], {"get_recalls": 1})

    def test_a_late_object_for_a_rolled_up_day_is_appended(self):
        rollup.rollup(self.store, today="2026-11-09")
        self.store.put("raw/2026-11-08/235959000-eeeeee.ndjson",
                       line(t="2026-11-08T23:59:59Z", site="prod", method="tools/call", tool="get_fuel_prices", ms=9, ok=True).encode())
        rollup.rollup(self.store, today="2026-11-09")
        daily = rollup.parse_lines(self.store.get("derived/daily/2026-11-08.ndjson"))
        self.assertEqual(len(daily), 5)
        day = json.loads(self.store.get("derived/summary.json"))["days"]["2026-11-08"]
        self.assertEqual(day["tool_calls"], 3)

    def test_markdown_and_pull(self):
        rollup.rollup(self.store, today="2026-11-09")
        md = rollup.markdown(json.loads(self.store.get("derived/summary.json")))
        self.assertIn("| 2026-11-08 | 3 | 1 | 2 | 1 |", md)
        with tempfile.TemporaryDirectory() as out:
            self.assertEqual(rollup.pull(self.store, Path(out)), 2)
            self.assertTrue((Path(out) / "derived/daily/2026-11-08.ndjson").exists())


if __name__ == "__main__":
    unittest.main()
