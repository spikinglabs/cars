from car_mcp import registrations

MODELS = [
    {"slug": "volvo-ex30", "brand": "VOLVO", "model": "EX30", "file": "models/volvo-ex30.json", "rank": 40, "latest": 1058, "last_12_months": 7000},
    {"slug": "mazda-cx-30", "brand": "MAZDA", "model": "CX-30", "file": "models/mazda-cx-30.json", "rank": 90, "latest": 1128, "last_12_months": 9000},
    {"slug": "mazda-cx-5", "brand": "MAZDA", "model": "CX-5", "file": "models/mazda-cx-5.json", "rank": 95, "latest": 935, "last_12_months": 8000},
    {"slug": "vw-golf", "brand": "VW", "model": "GOLF", "file": "models/vw-golf.json", "rank": 2, "latest": 8000, "last_12_months": 90000},
    {"slug": "vw-sonstige", "brand": "VW", "model": "SONSTIGE", "file": "models/vw-sonstige.json", "rank": None, "latest": 28, "last_12_months": 300},
]
LATEST = {"month": "2026-09", "source": "KBA", "licence": "dl-de/by-2-0", "credit": "© Kraftfahrt-Bundesamt, Flensburg",
          "market": {"total": 256774}, "top_models": [{"slug": "vw-t-roc"}], "top_electric": [{"slug": "tesla-model-y"}]}


def fake(path):
    if path == "latest.json":
        return LATEST
    if path == "models.json":
        return {"models": MODELS}
    return {"months": [{"month": "2025-09", "total": 500, "bev": 500}, {"month": "2025-10", "total": 600, "bev": 600},
                       {"month": "2026-09", "total": 1058, "bev": 1058}]}


def test_find():
    assert registrations.find(MODELS, "Mazda CX-30 2.5")["slug"] == "mazda-cx-30"
    assert registrations.find(MODELS, "my Volvo EX30 Ultra")["slug"] == "volvo-ex30"
    assert registrations.find(MODELS, "ex30")["slug"] == "volvo-ex30"
    assert registrations.find(MODELS, "Volkswagen Golf")["slug"] == "vw-golf"
    assert registrations.find(MODELS, "Trabant") is None


def test_lookup_model_and_market():
    r = registrations.lookup("Volvo EX30", 2, get=fake)
    assert r["slug"] == "volvo-ex30" and r["page"].endswith("?model=volvo-ex30")
    assert r["last_12_months_total"] == 1658 and r["last_12_months_bev_share_pct"] == 100.0
    assert [m["month"] for m in r["months"]] == ["2025-10", "2026-09"]
    top = registrations.lookup(None, get=fake)
    assert top["top_models"][0]["slug"] == "vw-t-roc" and top["month"] == "2026-09"
    assert "error" in registrations.lookup("Trabant", get=fake)
