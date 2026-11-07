"""The official consumption lookup, with the catalog file served from memory."""

import json

import pytest

from mcp.client import Client

from car_mcp.catalog import Catalog, CatalogError
from car_mcp.server import build_server

pytestmark = pytest.mark.anyio

DATA = {
    "region": "DE", "year": 2025, "status": "provisional", "source": "EEA", "licence": "CC BY 4.0", "notes": "n",
    "models": [
        {"id": "vw-id-3", "make": "VW", "model": "ID.3", "name": "VW ID.3", "fuel": "electric", "registrations": 31978, "kwh_per_100km": 15.7},
        {"id": "volvo-ex30", "make": "Volvo", "model": "EX30", "name": "Volvo EX30", "fuel": "electric", "registrations": 4436, "kwh_per_100km": 17.2},
        {"id": "vw-golf-petrol", "make": "VW", "model": "Golf", "name": "VW Golf", "fuel": "petrol", "registrations": 50000, "l_per_100km": 6.0},
        {"id": "vw-golf-diesel", "make": "VW", "model": "Golf", "name": "VW Golf", "fuel": "diesel", "registrations": 9000, "l_per_100km": 4.6},
    ],
}


@pytest.fixture
def anyio_backend():
    return "asyncio"


def fake(calls):
    def fetch(url):
        calls.append(url)
        return DATA
    return fetch


def test_search_matches_words_and_fuel():
    calls = []
    c = Catalog(fetch=fake(calls), base_url="https://x/data/vehicle-catalog")
    assert [m["id"] for m in c.search("volkswagen golf")["models"]] == ["vw-golf-petrol", "vw-golf-diesel"]
    assert [m["id"] for m in c.search("golf", fuel="diesel")["models"]] == ["vw-golf-diesel"]
    assert c.search("ex30")["models"][0]["kwh_per_100km"] == 17.2
    assert c.search("")["models"][0]["id"] == "vw-golf-petrol"
    assert calls == ["https://x/data/vehicle-catalog/de/models.json"]  # fetched once


def test_errors():
    def broken(url):
        raise OSError("offline")
    with pytest.raises(CatalogError):
        Catalog(fetch=broken).search("ex30")
    with pytest.raises(CatalogError):
        Catalog(fetch=fake([])).search("ex30", region="us")


async def test_tool(tmp_path):
    server = build_server(tmp_path / "car.db", catalog=Catalog(fetch=fake([])))
    async with Client(server) as c:
        res = await c.call_tool("lookup_official_consumption", {"query": "Volvo EX30"})
        sc = res.structured_content
        data = sc.get("result", sc) if isinstance(sc, dict) and "models" not in sc else sc
        if data is None:
            data = json.loads(res.content[0].text)
        assert data["models"][0]["id"] == "volvo-ex30"
        assert data["year"] == 2025
