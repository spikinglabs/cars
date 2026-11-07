"""End-to-end over the MCP protocol with an in-memory client."""

import json

import pytest

from mcp.client import Client

from car_mcp.server import DASHBOARD_URI, build_server, render_dashboard_html

pytestmark = pytest.mark.anyio


@pytest.fixture
def anyio_backend():
    return "asyncio"


def _data(res):
    if res.structured_content is not None:
        sc = res.structured_content
        return sc.get("result", sc) if isinstance(sc, dict) else sc
    return json.loads(res.content[0].text)


async def test_tools_and_dashboard(tmp_path):
    server = build_server(tmp_path / "car.db")
    async with Client(server) as c:
        names = {t.name for t in (await c.list_tools()).tools}
        assert {"add_vehicle", "log_fill_up", "get_summary", "show_dashboard", "get_maintenance_due"} <= names

        dash_tool = next(t for t in (await c.list_tools()).tools if t.name == "show_dashboard")
        assert dash_tool.meta["ui"]["resourceUri"] == DASHBOARD_URI

        res = await c.call_tool("log_fill_up", {"quantity": 40, "total_cost": 70})
        assert res.is_error  # no vehicle yet
        assert "add_vehicle" in res.content[0].text

        await c.call_tool("add_vehicle", {"name": "Golf", "energy_type": "gasoline"})
        await c.call_tool("log_fill_up", {"quantity": 40, "total_cost": 70, "odometer": 1000, "date": "2026-10-01"})
        r = _data(await c.call_tool("log_fill_up", {"quantity": 30, "total_cost": 51, "odometer": 1500, "date": "2026-10-15"}))
        assert r["entry"]["consumption"]["per_100"] == 6.0

        d = _data(await c.call_tool("show_dashboard", {}))
        assert d["vehicle"]["name"] == "Golf"
        assert d["summary"]["total_cost"] == 121

        res = await c.read_resource(DASHBOARD_URI)
        assert "text/html" in res.contents[0].mime_type
        assert "ui/initialize" in res.contents[0].text

        await c.call_tool("load_demo_data", {})
        vs = _data(await c.call_tool("list_vehicles", {}))
        assert len(vs) == 3

        out = tmp_path / "dash.html"
        e = _data(await c.call_tool("export_dashboard_html", {"vehicle": "Model 3 (demo)", "path": str(out)}))
        assert out.exists() and e["bytes"] > 10000

        prompts = {p.name for p in (await c.list_prompts()).prompts}
        assert {"monthly_report", "log_receipt"} <= prompts


def test_render_escapes_script_close():
    html = render_dashboard_html({"x": "</script><script>alert(1)</script>"})
    assert "</script><script>alert" not in html



LATEST = {"region": "DE", "currency": "EUR", "week": "2026-11-02",
          "products": {"euro_super_95": {"eur_per_litre": 2.128}, "diesel": {"eur_per_litre": 2.282}, "lpg": {}}}
WEEKLY = b"date,euro_super_95,diesel,lpg\n2026-10-26,2.167,2.298,1.13\n2026-11-02,2.128,2.282,\n"


def _fake(seen):
    def fetch(url):
        seen.append(url)
        return json.dumps(LATEST).encode() if url.endswith(".json") else WEEKLY
    return fetch


def test_fuel_prices_shapes_and_filters():
    from car_mcp.fuel import FuelError, prices

    seen = []
    out = prices("DE", "diesel", 1, fetch=_fake(seen))
    assert seen[0].endswith("/fuel-prices/de/latest.json") and seen[1].endswith("/fuel-prices/de/weekly.csv")
    assert list(out["products"]) == ["diesel"]
    assert out["history"] == [{"week": "2026-11-02", "diesel": 2.282}]
    assert out["page"].endswith("?fuel=diesel")
    full = prices(fetch=_fake([]))
    assert set(full["products"]) == {"euro_super_95", "diesel", "lpg"}
    assert full["history"][-1]["lpg"] is None and len(full["history"]) == 2
    with pytest.raises(FuelError):
        prices("de", "kerosene", fetch=_fake([]))
    with pytest.raises(FuelError):
        prices("../x", fetch=_fake([]))


async def test_fuel_prices_tool_call(tmp_path, monkeypatch):
    from car_mcp import fuel

    monkeypatch.setattr(fuel.prices, "__defaults__", ("de", None, 12, _fake([])))
    async with Client(build_server(tmp_path / "car.db")) as c:
        tool = next(t for t in (await c.list_tools()).tools if t.name == "get_fuel_prices")
        assert tool.annotations.open_world_hint
        res = await c.call_tool("get_fuel_prices", {"fuel": "diesel", "weeks": 2})
        assert not res.is_error
        assert _data(res)["products"]["diesel"]["eur_per_litre"] == 2.282
