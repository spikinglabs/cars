from datetime import date

import pytest

from car_mcp import db
from car_mcp.garage import Garage, GarageError
from car_mcp.sample import load_sample_data


@pytest.fixture
def g():
    return Garage(db.connect(":memory:"))


def test_single_vehicle_is_default(g):
    g.add_vehicle("Golf", "petrol")
    r = g.log_energy(40, 70, odometer=1000)
    assert r["vehicle"] == "Golf"
    assert r["entry"]["kind"] == "fuel"
    assert r["entry"]["price_per_unit"] == 1.75


def test_vehicle_required_when_ambiguous(g):
    g.add_vehicle("A", "diesel")
    g.add_vehicle("B", "ev")
    with pytest.raises(GarageError, match="Several vehicles"):
        g.log_energy(10, 10)
    assert g.log_energy(10, 5, "B")["entry"]["kind"] == "charge"


def test_full_to_full_consumption(g):
    g.add_vehicle("Golf", "gasoline")
    g.log_energy(40, 70, odometer=1000, date_="2026-01-01")
    g.log_energy(10, 18, odometer=1200, date_="2026-01-05", full=False)
    r = g.log_energy(20, 35, odometer=1500, date_="2026-01-10")
    # 30 L over 500 km
    assert r["entry"]["consumption"]["per_100"] == 6.0
    assert r["entry"]["consumption"]["cost_per_distance"] == round(53 / 500, 3)


def test_summary_costs(g):
    g.add_vehicle("Golf", "gasoline")
    g.log_energy(40, 70, odometer=1000, date_="2026-01-01")
    g.log_energy(30, 50, odometer=1500, date_="2026-01-10")
    g.log_service("oil change", 120, odometer=1400, date_="2026-01-08")
    g.log_expense("insurance", 60, date_="2026-01-02")
    s = g.summary(since="2026-01-01", until="2026-01-31")
    assert s["total_cost"] == 300
    assert s["distance"] == 500
    assert s["cost_per_distance"] == 0.6
    assert s["other_expenses"] == {"insurance": 60}


def test_maintenance_due(g):
    g.add_vehicle("Golf", "gasoline", add_default_schedule=False)
    g.set_schedule("oil change", interval_distance=10000, interval_months=12)
    g.log_service("oil change", 100, odometer=10000, date_=date.today().isoformat())
    g.log_energy(40, 70, odometer=19500)
    item = g.maintenance_due()["items"][0]
    assert item["status"] == "due_soon"
    assert item["distance_left"] == 500
    g.log_energy(40, 70, odometer=20500)
    assert g.maintenance_due()["items"][0]["status"] == "overdue"


def test_exact_service_match_preferred(g):
    g.add_vehicle("Golf", "gasoline", add_default_schedule=False)
    g.set_schedule("inspection", interval_months=24)
    g.log_service("inspection", 100, date_="2025-01-01")
    g.log_service("brake inspection", 50, date_="2026-01-01")
    assert g.maintenance_due()["items"][0]["last_done"]["date"] == "2025-01-01"


def test_delete_entry(g):
    g.add_vehicle("Golf", "gasoline")
    e = g.log_expense("parking", 5)["entry"]
    g.delete_entry("expense", e["id"])
    assert g.list_entries("expense") == []
    with pytest.raises(GarageError):
        g.delete_entry("expense", e["id"])


def test_bad_date(g):
    g.add_vehicle("Golf", "gasoline")
    with pytest.raises(GarageError, match="YYYY-MM-DD"):
        g.log_expense("parking", 5, date_="06/11/2026")


def test_sample_data_dashboard(g):
    load_sample_data(g)
    for name in ("Golf (demo)", "Model 3 (demo)"):
        d = g.dashboard_data(name)
        assert d["summary"]["total_cost"] > 0
        assert len(d["monthly_costs"]["months"]) == 12
        assert d["efficiency"]
        assert d["maintenance"]
    # idempotent
    assert load_sample_data(g)["energy"] == 0
