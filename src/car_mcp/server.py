"""car-mcp: an MCP server that gives AI assistants a garage notebook.

Run with ``car-mcp`` (stdio, for Claude Desktop / Claude Code) or
``car-mcp --http`` (streamable HTTP, for remote connectors).
"""

from __future__ import annotations

import argparse
import json
from importlib.resources import files
from pathlib import Path
from typing import Annotated, Any, Literal

from pydantic import Field

from mcp.server.apps import Apps
from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from mcp.types import ToolAnnotations

from . import chargers, db, recalls, registrations
from .garage import Garage, GarageError
from .sample import load_sample_data

DASHBOARD_URI = "ui://car-mcp/dashboard.html"
DASHBOARD_HTML = files("car_mcp").joinpath("dashboard.html").read_text(encoding="utf-8")

INSTRUCTIONS = """\
car-mcp is the user's personal car logbook: vehicles, fuel/charging, maintenance, expenses and trips,
stored locally in SQLite.

Guidance:
- When the user mentions filling up, charging, a service, a bill, or a trip, log it with the matching log_* tool.
  Ask for the odometer reading if they have it: it powers consumption and maintenance reminders.
- If only one vehicle exists, the `vehicle` argument can be omitted.
- For "how much am I spending", "what's my consumption" and similar, call get_summary.
- For "what maintenance is due", call get_maintenance_due.
- To show charts, call show_dashboard. Hosts that support MCP Apps render it inline; otherwise call
  export_dashboard_html and present the returned HTML as an artifact, or build your own chart from get_chart_data.
- Money is in the configured currency (see get_settings). Distances use the configured unit.
- If the logbook is empty and the user just wants to try things out, offer load_demo_data.
- For "is my car recalled?" call get_recalls (official EU and US recalls, needs internet).
- For "how many X are sold/registered in Germany" or the most popular new cars, call get_registrations (needs internet).
- For "where can I charge near X" call find_chargers (public chargers in Germany, needs internet).
"""

READ = ToolAnnotations(readOnlyHint=True, destructiveHint=False, idempotentHint=True, openWorldHint=False)
WRITE = ToolAnnotations(readOnlyHint=False, destructiveHint=False, idempotentHint=False, openWorldHint=False)
WEB = ToolAnnotations(readOnlyHint=True, destructiveHint=False, idempotentHint=True, openWorldHint=True)
DELETE = ToolAnnotations(readOnlyHint=False, destructiveHint=True, idempotentHint=True, openWorldHint=False)

VehicleArg = Annotated[str | None, Field(description="Vehicle name or id. Optional when only one vehicle exists.")]
DateArg = Annotated[str | None, Field(description="Date as YYYY-MM-DD. Defaults to today.")]


def build_server(db_path: str | Path | None = None) -> MCPServer:
    garage = Garage(db.connect(db_path))
    apps = Apps()

    def run(fn, *args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except GarageError as e:
            raise ToolError(str(e)) from e

    # MCP Apps tools/resources must be registered before the server is built.
    @apps.tool(resource_uri=DASHBOARD_URI, annotations=READ)
    def show_dashboard(vehicle: VehicleArg = None, months: int = 12) -> dict[str, Any]:
        """Show an interactive dashboard (spend by month, consumption, prices, maintenance, recent activity).
        Renders inline in hosts that support MCP Apps; the data is returned either way."""
        return run(garage.dashboard_data, vehicle, months)

    apps.add_html_resource(DASHBOARD_URI, DASHBOARD_HTML, name="Car dashboard",
                           description="Interactive car cost and maintenance dashboard", prefers_border=False)

    mcp = MCPServer(
        "car-mcp",
        title="Car Logbook",
        description="Track fuel, charging, maintenance, expenses and trips for your vehicles, with dashboards.",
        instructions=INSTRUCTIONS,
        version="0.1.0",
        extensions=[apps],
    )

    # ------------------------------------------------------------------ setup
    @mcp.tool(annotations=READ)
    def get_settings() -> dict[str, str]:
        """Get logbook settings: currency, distance unit (km/mi) and volume unit (L/gal)."""
        return garage.settings()

    @mcp.tool(annotations=WRITE)
    def update_settings(
        currency: Annotated[str | None, Field(description="ISO 4217 code, e.g. EUR, USD, GBP")] = None,
        distance_unit: Literal["km", "mi"] | None = None,
        volume_unit: Literal["L", "gal"] | None = None,
    ) -> dict[str, str]:
        """Change the currency or units. Existing numbers are not converted."""
        return run(garage.update_settings, currency=currency.upper() if currency else None,
                   distance_unit=distance_unit, volume_unit=volume_unit)

    @mcp.tool(annotations=WRITE)
    def add_vehicle(
        name: Annotated[str, Field(description="Short nickname, e.g. 'Golf' or 'Family EV'")],
        energy_type: Annotated[str, Field(description="gasoline, diesel, electric, hybrid, plugin_hybrid, lpg or other")],
        make: str | None = None,
        model: str | None = None,
        year: int | None = None,
        plate: str | None = None,
        purchase_date: DateArg = None,
        purchase_odometer: Annotated[float | None, Field(description="Odometer when acquired, or the current reading")] = None,
        notes: str | None = None,
        add_default_schedule: Annotated[bool, Field(description="Pre-fill a typical maintenance schedule")] = True,
    ) -> dict[str, Any]:
        """Add a vehicle to the garage."""
        return run(garage.add_vehicle, name, energy_type, make, model, year, plate,
                   purchase_date, purchase_odometer, notes, add_default_schedule)

    @mcp.tool(annotations=READ)
    def list_vehicles(include_archived: bool = False) -> list[dict[str, Any]]:
        """List vehicles with their latest known odometer reading."""
        return garage.list_vehicles(include_archived)

    @mcp.tool(annotations=WRITE)
    def archive_vehicle(vehicle: str) -> dict[str, Any]:
        """Hide a sold or retired vehicle. Its history is kept."""
        return run(garage.archive_vehicle, vehicle)

    # ------------------------------------------------------------------ logging
    @mcp.tool(annotations=WRITE)
    def log_fill_up(
        quantity: Annotated[float, Field(description="Litres/gallons of fuel, or kWh charged")],
        total_cost: Annotated[float, Field(description="Total amount paid")],
        vehicle: VehicleArg = None,
        odometer: Annotated[float | None, Field(description="Odometer reading at the pump/charger")] = None,
        date: DateArg = None,
        full: Annotated[bool, Field(description="Tank filled up / charged to the usual level. Partial fills set false.")] = True,
        kind: Annotated[Literal["fuel", "charge"] | None, Field(description="Inferred from the vehicle if omitted")] = None,
        location: str | None = None,
        notes: str | None = None,
    ) -> dict[str, Any]:
        """Log a fuel fill-up or an EV charging session. Returns the entry with price per unit and,
        when computable, the consumption since the previous full fill."""
        return run(garage.log_energy, quantity, total_cost, vehicle, odometer, date, full, kind, location, notes)

    @mcp.tool(annotations=WRITE)
    def log_service(
        service_type: Annotated[str, Field(description="e.g. 'oil change', 'tire rotation', 'inspection', 'brakes'")],
        cost: float = 0,
        vehicle: VehicleArg = None,
        odometer: float | None = None,
        date: DateArg = None,
        shop: str | None = None,
        notes: str | None = None,
    ) -> dict[str, Any]:
        """Log maintenance or a repair. Matching service types reset the maintenance reminder."""
        return run(garage.log_service, service_type, cost, vehicle, odometer, date, shop, notes)

    @mcp.tool(annotations=WRITE)
    def log_expense(
        category: Annotated[str, Field(description="e.g. insurance, vehicle tax, parking, tolls, car wash, fine, loan")],
        amount: float,
        vehicle: VehicleArg = None,
        date: DateArg = None,
        notes: str | None = None,
    ) -> dict[str, Any]:
        """Log any other car cost."""
        return run(garage.log_expense, category, amount, vehicle, date, notes)

    @mcp.tool(annotations=WRITE)
    def log_trip(
        distance: Annotated[float, Field(description="Distance in the configured unit")],
        vehicle: VehicleArg = None,
        date: DateArg = None,
        purpose: Annotated[str, Field(description="personal, business, commute...")] = "personal",
        start_location: str | None = None,
        end_location: str | None = None,
        notes: str | None = None,
    ) -> dict[str, Any]:
        """Log a trip, e.g. for business mileage claims."""
        return run(garage.log_trip, distance, vehicle, date, purpose, start_location, end_location, notes)

    @mcp.tool(annotations=WRITE)
    def set_maintenance_interval(
        service_type: str,
        vehicle: VehicleArg = None,
        interval_distance: Annotated[float | None, Field(description="Every N km/mi")] = None,
        interval_months: Annotated[int | None, Field(description="Every N months")] = None,
        notes: str | None = None,
    ) -> dict[str, Any]:
        """Create or change a maintenance interval, e.g. oil change every 15000 km or 12 months."""
        return run(garage.set_schedule, service_type, vehicle, interval_distance, interval_months, notes)

    @mcp.tool(annotations=READ)
    def list_entries(
        entry_type: Literal["energy", "service", "expense", "trip", "schedule"],
        vehicle: VehicleArg = None,
        since: DateArg = None,
        until: DateArg = None,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        """List logged entries, newest first. Use the ids to fix mistakes with delete_entry."""
        return run(garage.list_entries, entry_type, vehicle, since, until, limit)

    @mcp.tool(annotations=DELETE)
    def delete_entry(entry_type: Literal["energy", "service", "expense", "trip", "schedule"], entry_id: int) -> dict[str, Any]:
        """Delete one logged entry by id (e.g. a duplicate or a typo). Returns what was deleted."""
        return run(garage.delete_entry, entry_type, entry_id)

    # ------------------------------------------------------------------ insights
    @mcp.tool(annotations=READ)
    def get_summary(
        vehicle: VehicleArg = None,
        months: Annotated[int | None, Field(description="Look-back window in months (ignored if since is set)")] = 12,
        since: DateArg = None,
        until: DateArg = None,
    ) -> dict[str, Any]:
        """Costs, distance, cost per km/mi, average consumption and trip totals for a period."""
        return run(garage.summary, vehicle, months, since, until)

    @mcp.tool(annotations=READ)
    def get_maintenance_due(vehicle: VehicleArg = None) -> dict[str, Any]:
        """Maintenance items sorted by urgency: overdue, due_soon, unknown, ok."""
        return run(garage.maintenance_due, vehicle)

    @mcp.tool(annotations=READ)
    def get_chart_data(
        metric: Literal["monthly_costs", "consumption", "energy_price", "cost_breakdown"],
        vehicle: VehicleArg = None,
        months: int = 12,
    ) -> dict[str, Any]:
        """Chart-ready series for building custom charts (e.g. in an artifact)."""
        d = run(garage.dashboard_data, vehicle, months)
        key = {"monthly_costs": "monthly_costs", "consumption": "efficiency",
               "energy_price": "prices", "cost_breakdown": "breakdown"}[metric]
        return {"vehicle": d["vehicle"]["name"], "units": d["summary"]["units"], "metric": metric, "data": d[key]}

    @mcp.tool(annotations=WRITE)
    def export_dashboard_html(
        vehicle: VehicleArg = None,
        months: int = 12,
        path: Annotated[str | None, Field(description="Where to save. Defaults next to the database.")] = None,
        include_html: Annotated[bool, Field(description="Also return the HTML so it can be shown as an artifact")] = False,
    ) -> dict[str, Any]:
        """Write a self-contained HTML dashboard file (works offline, light and dark mode)."""
        data = run(garage.dashboard_data, vehicle, months)
        html = render_dashboard_html(data)
        out = Path(path).expanduser() if path else db.default_db_path().parent / (
            f"dashboard-{data['vehicle']['name'].lower().replace(' ', '-').replace('(', '').replace(')', '')}.html")
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(html, encoding="utf-8")
        res: dict[str, Any] = {"path": str(out), "bytes": len(html)}
        if include_html:
            res["html"] = html
        return res

    @mcp.tool(annotations=WEB)
    def get_recalls(
        vehicle: VehicleArg = None,
        model: Annotated[str | None, Field(description="Make and model, e.g. 'Volvo EX30', or a brand. Overrides vehicle.")] = None,
        limit: int = 10,
    ) -> dict[str, Any]:
        """Official recalls for a car model (or a whole brand): EU Safety Gate alerts since 2019, which include every
        German KBA recall, and US NHTSA campaigns. Uses the vehicle's make and model from the logbook when no model
        is given. Data from cars.allo.land, refreshed daily."""
        text = model
        if not text:
            v = run(garage.get_vehicle, vehicle)
            text = " ".join(str(v.get(k) or "") for k in ("make", "model")).strip() or v["name"]
        try:
            return recalls.lookup(text, limit)
        except OSError as e:
            raise ToolError(f"Could not reach cars.allo.land: {e}") from e

    @mcp.tool(annotations=WEB)
    def get_registrations(
        model: Annotated[str | None, Field(description="Make and model, e.g. 'Volvo EX30' or 'VW Golf'. Leave out for this month's top models.")] = None,
        vehicle: Annotated[str | None, Field(description="A logbook vehicle to look up instead of a model name.")] = None,
        months: Annotated[int, Field(description="How many recent months to return, 1-100.")] = 12,
    ) -> dict[str, Any]:
        """Monthly new car registrations in Germany (official KBA figures since Dec 2018): one model's monthly
        counts with electric and plug-in hybrid splits and its rank, or, with no model, the latest month's market
        by drive type and the top 20 and top 10 electric models. Data from cars.allo.land, updated monthly."""
        text = model
        if not text and vehicle:
            v = run(garage.get_vehicle, vehicle)
            text = " ".join(str(v.get(k) or "") for k in ("make", "model")).strip() or v["name"]
        try:
            return registrations.lookup(text, max(1, min(months, 100)))
        except OSError as e:
            raise ToolError(f"Could not reach cars.allo.land: {e}") from e

    @mcp.tool(annotations=WEB)
    def find_chargers(
        near: Annotated[str | None, Field(description="Town or 5-digit postcode in Germany, e.g. 'Köln' or '50667'.")] = None,
        lat: Annotated[float | None, Field(description="Latitude, instead of near.")] = None,
        lon: Annotated[float | None, Field(description="Longitude, instead of near.")] = None,
        radius_km: Annotated[float, Field(description="Search radius in km, 0.5 to 50.")] = 10,
        min_kw: Annotated[float, Field(description="Minimum power in kW, e.g. 50 for fast or 150 for high-power charging.")] = 0,
        plugs: Annotated[list[Literal["type2", "ccs", "chademo", "schuko", "mcs", "type1"]] | None, Field(description="Any of these plugs.")] = None,
        only: Annotated[list[Literal["open_24_7", "card_payment", "free", "plug_and_charge", "no_customers_only"]] | None, Field(description="Only locations with all of these.")] = None,
        limit: int = 10,
    ) -> dict[str, Any]:
        """Public EV chargers near a town, postcode or position in Germany, closest first: operator, address, maximum
        power, charge points, plugs, payment and a directions link, plus a link to the same view on the Allo Cars map.
        From the Bundesnetzagentur charge point register via cars.allo.land. No live availability or prices."""
        try:
            return chargers.lookup(near, lat, lon, radius_km=radius_km, min_kw=min_kw, plugs=plugs, only=only, limit=limit)
        except ValueError as e:
            raise ToolError(str(e)) from e
        except OSError as e:
            raise ToolError(f"Could not reach cars.allo.land: {e}") from e

    @mcp.tool(annotations=WRITE)
    def load_demo_data() -> dict[str, Any]:
        """Add two demo vehicles ('Golf (demo)' petrol and 'Model 3 (demo)' EV) with ~14 months of history.
        Archive them later with archive_vehicle."""
        return {"added": load_sample_data(garage), "vehicles": [v["name"] for v in garage.list_vehicles()]}

    # ------------------------------------------------------------------ prompts
    @mcp.prompt()
    def monthly_report(vehicle: str = "") -> str:
        """A monthly car report: spend, consumption, anomalies and upcoming maintenance."""
        who = f" for {vehicle}" if vehicle else ""
        return (f"Write my monthly car report{who}. Use get_summary for the last month and the last 12 months, "
                "compare them, point out anything unusual (price spikes, worse consumption, big one-off costs), "
                "list maintenance from get_maintenance_due that is overdue or due soon, then call show_dashboard.")

    @mcp.prompt()
    def log_receipt() -> str:
        """Log a fuel/charging/service receipt from a photo or pasted text."""
        return ("I'll share a receipt. Extract date, amount, quantity (litres or kWh), station or shop, and what was done. "
                "Ask me for the odometer reading if it isn't on the receipt, then log it with the right tool and "
                "tell me the price per unit and consumption.")

    return mcp


def render_dashboard_html(data: dict[str, Any]) -> str:
    payload = json.dumps(data, ensure_ascii=False).replace("</", "<\\/")
    return DASHBOARD_HTML.replace("/*__CAR_DATA__*/null", payload, 1)


def main() -> None:
    parser = argparse.ArgumentParser(prog="car-mcp", description="Car logbook MCP server")
    parser.add_argument("--db", help="SQLite file (default: $CAR_MCP_DB or ~/.car-mcp/car.db)")
    parser.add_argument("--http", action="store_true", help="Serve streamable HTTP instead of stdio")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--demo-dashboard", metavar="OUT.html",
                        help="Write a dashboard with demo data to a file and exit")
    args = parser.parse_args()

    if args.demo_dashboard:
        g = Garage(db.connect(":memory:"))
        load_sample_data(g)
        Path(args.demo_dashboard).write_text(render_dashboard_html(g.dashboard_data("Golf (demo)")), encoding="utf-8")
        print(f"Wrote {args.demo_dashboard}")
        return

    server = build_server(args.db)
    if args.http:
        server.run("streamable-http", host=args.host, port=args.port)
    else:
        server.run("stdio")


if __name__ == "__main__":
    main()
