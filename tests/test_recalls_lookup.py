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
