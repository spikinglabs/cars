from car_mcp import recalls

MODELS = [{"slug": "volvo-ex30", "model": "Volvo EX30", "file": "models/volvo-ex30.json", "us_file": "../us/models/volvo-ex30.json"},
          {"slug": "mazda-cx-5", "model": "Mazda CX-5", "file": "models/mazda-cx-5.json", "us_file": None},
          {"slug": "mazda-cx-30", "model": "Mazda CX-30", "file": "models/mazda-cx-30.json", "us_file": None}]
BRANDS = [{"slug": "volkswagen", "brand": "Volkswagen", "file": "brand/volkswagen.json"}]


def fake(path):
    return {"eu/models.json": {"models": MODELS}, "eu/brands.json": {"brands": BRANDS},
            "eu/models/volvo-ex30.json": {"alerts": [{"id": "SR/1/26"}]},
            "us/models/volvo-ex30.json": {"campaigns": [{"id": "26V001000"}, {"id": "26V103000"}]},
            "eu/brand/volkswagen.json": {"alerts": []}}[path]


def test_find_prefers_longest_model_name():
    assert recalls.find(MODELS, "Mazda CX-30 2.5", "model")["slug"] == "mazda-cx-30"
    assert recalls.find(MODELS, "my Volvo EX30 Ultra", "model")["slug"] == "volvo-ex30"
    assert recalls.find(MODELS, "ex30", "model")["slug"] == "volvo-ex30"


def test_lookup_model_and_brand():
    r = recalls.lookup("Volvo EX30", get=fake)
    assert r["eu_alerts"] == 1 and r["us_campaigns"] == 2 and r["page"].endswith("?model=volvo-ex30")
    assert recalls.lookup("VW", get=fake)["brand"] == "Volkswagen"
    assert "error" in recalls.lookup("Trabant", get=fake)


ALERTS = [
    {"id": "1", "brand": "Volkswagen", "models": "ID.4, ID.5", "production": "12.09.2022 - 16.05.2024", "risk": "Fire",
     "component": "hv_battery", "recall_code": "93U9"},
    {"id": "2", "brand": "VW", "models": "Golf A7 Variant", "production": "2015 - 2017", "risk": "Injuries", "recall_code": "X1"},
    {"id": "3", "brand": "Volkswagen", "models": "ID.4 GTX", "production": None, "risk": "Injuries", "recall_code": None},
    {"id": "4", "brand": "Volkswagen", "models": "ID.4", "production": "01.2019 - 03.2020", "risk": "Injuries"},
]


def used_fake(path):
    if path == "eu/brand/volkswagen.json":
        return {"alerts": [dict(a) for a in ALERTS]}
    if path == "eu/stats.json":
        return {"since": "2019", "years": [], "components": [], "notified_by": [], "brands": [
            {"slug": "volkswagen", "brand": "Volkswagen", "car_alerts": 116, "alerts_per_100k": 2.8},
            {"slug": "jeep", "brand": "Jeep", "car_alerts": 53, "alerts_per_100k": 48.0}]}
    return fake(path)


def test_build_window():
    assert recalls.build_window("31.10.2017 - 23.5.2024") == (2017, 2024)
    assert recalls.build_window(None) is None
    assert recalls.fits_year({"production": "2015 - 2017"}, 2018) is True   # built 2017, registered 2018
    assert recalls.fits_year({"production": "2015 - 2017"}, 2019) is False


def test_used_car_check_narrows_to_model_and_year():
    r = recalls.used_car_check("VW", "ID.4", 2023, get=used_fake)
    assert r["brand"] == "Volkswagen"
    assert [a["id"] for a in r["eu"]] == ["1", "3"]  # 3 has no dates, so it stays
    assert r["eu_alerts_other_build_years"] == 1
    assert r["recall_codes"] == ["93U9"]
    assert any("High-voltage" in q for q in r["ask_the_seller"]) and any("Fire" in q for q in r["ask_the_seller"])
    assert r["page"].endswith("?brand=volkswagen&model=id4&year=2023")
    assert recalls.used_car_check("Volkswagen Golf", get=used_fake)["eu_alerts"] == 1
    assert "error" in recalls.used_car_check("Trabant", get=used_fake)


def test_statistics_ranks_brand():
    s = recalls.statistics("VW", get=used_fake)
    assert s["brands_per_100k_new_cars"][0]["brand"] == "Jeep"
    assert s["brand"]["rank_per_100k"] == 2
