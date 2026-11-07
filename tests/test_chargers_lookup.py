"""find_chargers logic against a small offline copy of the published files."""

import pytest

from car_mcp import chargers

CELL = {
    "cell": "101_13",
    "fields": ["lat", "lon", "kw", "points", "dc_points", "plugs", "operator", "name", "address", "flags", "since"],
    "operators": ["Ionity", "Stadtwerke"],
    "stations": [
        [50.94, 6.96, 22, 2, 0, 1, 1, "", "Domplatz 1, 50667 Köln", 1, 2020],
        [50.95, 6.97, 350, 6, 6, 2, 0, "", "Autobahn 1, 50668 Köln", 5, 2023],
        [50.99, 6.90, 150, 4, 4, 6, 0, "", "Weit weg 1, 50739 Köln", 12, 2024],
    ],
}
PLACES = {"fields": ["town", "postcode", "lat", "lon", "stations"],
          "places": [["Köln", "50667", 50.94, 6.95, 30], ["Köln", "50668", 50.95, 6.96, 20], ["Münster", "48143", 51.96, 7.63, 40],
                     ["Münster", "64839", 49.92, 8.86, 3]]}


@pytest.fixture(autouse=True)
def offline(monkeypatch):
    files = {"latest.json": {"cells": ["101_13"], "observed_at": "2026-09-30"}, "places.json": PLACES, "cells/101_13.json": CELL}
    monkeypatch.setattr(chargers, "_get", lambda path: files[path])
    for f in (chargers._latest, chargers._places, chargers._cell):
        f.cache_clear()


def test_locate_postcode_and_town():
    assert round(chargers.locate("50667", PLACES["places"])["lat"], 4) == 50.94
    assert chargers.locate("koln", PLACES["places"])["name"] == "Köln"
    m = chargers.locate("Münster", PLACES["places"])
    assert round(m["lat"], 2) == 51.96  # the big Münster, not the one in Hesse
    assert chargers.locate("Atlantis", PLACES["places"]) is None


def test_lookup_filters_and_sorts():
    r = chargers.lookup("50667", radius_km=5)
    assert [c["max_kw"] for c in r["chargers"]] == [22, 350]
    assert r["chargers"][0]["open_24_7"] and r["chargers"][0]["plugs"] == ["type2"]
    fast = chargers.lookup("Köln", radius_km=20, min_kw=50, plugs=["ccs"], only=["no_customers_only"])
    assert [c["max_kw"] for c in fast["chargers"]] == [350]
    assert "kw=50" in fast["map"] and "plug=ccs" in fast["map"]
    card = chargers.lookup(lat=50.94, lon=6.96, radius_km=20, only=["card_payment"])
    assert [c["max_kw"] for c in card["chargers"]] == [350, 150]


def test_lookup_needs_a_place():
    with pytest.raises(ValueError):
        chargers.lookup()
    with pytest.raises(ValueError):
        chargers.lookup("Atlantis")
