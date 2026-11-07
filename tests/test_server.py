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


def test_fuel_price_forecast_shapes_and_filters():
    from car_mcp.fuel import FuelError as ToolError
    from car_mcp.fuel import forecast as fuel_price_forecast

    seen = []
    doc = {"region": "DE", "currency": "EUR", "observed_at": "t", "method": "m",
           "products": {"diesel": {"model": "naive", "forecast": [{"horizon": 1, "price": 2.0}]},
                        "lpg": {"model": "ar", "forecast": []}}}

    def fake(url):
        seen.append(url)
        return doc

    out = fuel_price_forecast("DE", "diesel", fetch=fake)
    assert seen[-1].endswith("/fuel-prices/de/forecast.json")
    assert list(out["products"]) == ["diesel"]
    assert out["page"].endswith("?fuel=diesel")
    assert set(fuel_price_forecast(fetch=fake)["products"]) == {"diesel", "lpg"}
    with pytest.raises(ToolError):
        fuel_price_forecast("de", "euro_super_95", fetch=fake)
    with pytest.raises(ToolError):
        fuel_price_forecast("../x", fetch=fake)


async def test_fuel_forecast_tool_listed(tmp_path):
    async with Client(build_server(tmp_path / "car.db")) as c:
        tool = next(t for t in (await c.list_tools()).tools if t.name == "get_fuel_price_forecast")
        assert tool.annotations.open_world_hint


async def test_fuel_forecast_tool_call(tmp_path, monkeypatch):
    from car_mcp import fuel

    monkeypatch.setattr(fuel, "_get", lambda url: {"region": "DE", "products": {"diesel": {"model": "naive"}}})
    monkeypatch.setattr(fuel.forecast, "__defaults__", ("de", None, fuel._get))
    async with Client(build_server(tmp_path / "car.db")) as c:
        res = await c.call_tool("get_fuel_price_forecast", {"fuel": "diesel"})
        assert not res.is_error
        assert _data(res)["products"]["diesel"]["model"] == "naive"
        res = await c.call_tool("get_fuel_price_forecast", {"fuel": "lpg"})
        assert res.is_error
