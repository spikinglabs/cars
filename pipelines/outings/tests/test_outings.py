import json
import tempfile
import unittest
from datetime import date, datetime, timezone

from pipelines.charging_prices.storage import LocalStore
from pipelines.outings import build, collect

TODAY = date(2026, 11, 7)


def place(i, kind="playground", lat=50.94, lon=6.96, precision="exact", **kw):
    return {"type": "place", "id": f"p{i}", "kind": kind, "name": f"Spielplatz {i}", "town": "Köln",
            "geo": {"lat": lat, "lon": lon, "precision": precision}, "names": {"zh": f"游乐场 {i}"}, **kw}


def event(i, start="2026-11-08", end=None, precision="exact", title=None, **kw):
    return {"type": "event", "id": f"e{i}", "title": title or {"de": f"Fest {i}", "en": f"Party {i}", "zh": f"节日 {i}"},
            "town": "Köln", "venue": "Rathaus", "geo": {"lat": 50.9375, "lon": 6.9603, "precision": precision},
            "start": start, "end": end or start, "tags": ["fest"], **kw}


class BuildTest(unittest.TestCase):
    def test_cell_id_matches_charger_cells(self):
        self.assertEqual(build.cell_id(50.94, 6.96), "101_13")
        self.assertEqual(build.cell_id(48.13, 11.58), "96_23")

    def test_places_keep_exact_known_kinds_in_germany(self):
        rows = [build.place_row(p) for p in [
            place(1, free=True, hours="Mo-Su 09:00-18:00"),
            place(2, precision="area"),
            place(3, kind="spaceport"),
            place(4, lat=40.0),
        ]]
        self.assertEqual(rows[0][:5], [50.94, 6.96, "playground", "p1", "Spielplatz 1"])
        self.assertEqual(rows[0][5], "游乐场 1")
        self.assertEqual(rows[0][7:], [1, None, "Mo-Su 09:00-18:00"])
        self.assertEqual(rows[1:], [None, None, None])

    def test_events_in_the_window_only(self):
        keep = build.event_row(event(1, time="15:00", price={"free": True, "text": "frei"}), TODAY)
        self.assertEqual(keep[2:9], ["e1", "2026-11-08", "2026-11-08", "15:00", "Fest 1", "Party 1", "节日 1"])
        self.assertEqual(keep[-1], 1)
        self.assertIsNone(build.event_row(event(2, start="2026-11-01"), TODAY))  # over
        self.assertIsNone(build.event_row(event(3, start="2026-12-24"), TODAY))  # too far ahead
        self.assertIsNone(build.event_row(event(4, precision="area"), TODAY))
        running = build.event_row(event(5, start="2024-12-06", end="2026-11-30", time="Jeden Sonntag"), TODAY)
        self.assertEqual(running[5], "")  # free-text times are dropped
        plain = build.event_row(event(6, title="Laternenumzug"), TODAY)
        self.assertEqual(plain[6:9], ["Laternenumzug", "", ""])

    def test_cells_dedupe_and_count(self):
        cs = build.cells([place(1), place(1), place(2, lat=48.13, lon=11.58)], [event(1), event(1)], TODAY)
        self.assertEqual(sorted(cs), ["101_13", "96_23"])
        self.assertEqual(len(cs["101_13"]["places"]), 1)
        self.assertEqual(len(cs["101_13"]["events"]), 1)
        self.assertEqual(cs["101_13"]["place_fields"], build.PLACE_FIELDS)
        self.assertEqual(build.summary(cs), {"places": 2, "events": 1, "places_by_kind": {"playground": 2}})


class CollectTest(unittest.TestCase):
    def test_publish_writes_cells_and_latest(self):
        with tempfile.TemporaryDirectory() as d:
            store = LocalStore(d)
            old = collect.MIN_PLACES
            collect.MIN_PLACES = 1
            try:
                res = collect.publish(store, {"generated": "2026-11-07", "places": [place(1)]}, {"events": [event(1)]},
                                      datetime(2026, 11, 7, 6, tzinfo=timezone.utc))
            finally:
                collect.MIN_PLACES = old
            self.assertEqual(res["places"], 1)
            latest = json.loads(store.get("public/de/latest.json"))
            self.assertEqual(latest["cells"], ["101_13"])
            self.assertEqual(latest["observed_at"], "2026-11-07")
            cell = json.loads(store.get("public/de/cells/101_13.json"))
            self.assertEqual(cell["places"][0][3], "p1")

    def test_refuses_near_empty_feed(self):
        with tempfile.TemporaryDirectory() as d, self.assertRaises(ValueError):
            collect.publish(LocalStore(d), {"places": [place(1)]}, {"events": []}, datetime.now(timezone.utc))


if __name__ == "__main__":
    unittest.main()
