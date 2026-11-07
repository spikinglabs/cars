"""Domain logic: vehicles, logs, analytics. Independent of MCP so it is easy to test."""

from __future__ import annotations

import calendar
import sqlite3
from collections import defaultdict
from datetime import date, datetime
from typing import Any

from . import db

ENERGY_TYPES = ("gasoline", "diesel", "electric", "hybrid", "plugin_hybrid", "lpg", "other")
ENTRY_TABLES = {
    "energy": "energy_logs",
    "service": "service_logs",
    "expense": "expenses",
    "trip": "trips",
    "schedule": "maintenance_schedule",
}

# Sensible defaults offered when a vehicle is added (distance in km, months).
DEFAULT_SCHEDULES = {
    "combustion": [
        ("oil change", 15000, 12),
        ("tire rotation", 10000, None),
        ("brake inspection", 30000, 24),
        ("air filter", 30000, 24),
        ("inspection", None, 24),
    ],
    "electric": [
        ("tire rotation", 10000, None),
        ("cabin filter", 20000, 12),
        ("brake fluid", None, 24),
        ("inspection", None, 24),
    ],
}


class GarageError(ValueError):
    """User-facing error (bad input, unknown vehicle...)."""


def parse_date(value: str | None) -> str:
    if not value:
        return date.today().isoformat()
    try:
        return datetime.strptime(value[:10], "%Y-%m-%d").date().isoformat()
    except ValueError as e:
        raise GarageError(f"Dates must be YYYY-MM-DD, got {value!r}") from e


def add_months(d: date, months: int) -> date:
    m = d.month - 1 + months
    y = d.year + m // 12
    m = m % 12 + 1
    return date(y, m, min(d.day, calendar.monthrange(y, m)[1]))


def month_key(d: str) -> str:
    return d[:7]


def _round(x: float | None, n: int = 2) -> float | None:
    return None if x is None else round(x, n)


class Garage:
    def __init__(self, conn: sqlite3.Connection | None = None):
        self.conn = conn or db.connect()

    # ------------------------------------------------------------------ settings
    def settings(self) -> dict[str, str]:
        return {r["key"]: r["value"] for r in self.conn.execute("SELECT key, value FROM settings")}

    def update_settings(self, **kwargs: str | None) -> dict[str, str]:
        allowed = {"currency", "distance_unit", "volume_unit"}
        for k, v in kwargs.items():
            if v is None:
                continue
            if k not in allowed:
                raise GarageError(f"Unknown setting {k}")
            if k == "distance_unit" and v not in ("km", "mi"):
                raise GarageError("distance_unit must be 'km' or 'mi'")
            if k == "volume_unit" and v not in ("L", "gal"):
                raise GarageError("volume_unit must be 'L' or 'gal'")
            self.conn.execute("INSERT OR REPLACE INTO settings(key, value) VALUES (?, ?)", (k, v))
        self.conn.commit()
        return self.settings()

    # ------------------------------------------------------------------ vehicles
    def add_vehicle(
        self,
        name: str,
        energy_type: str,
        make: str | None = None,
        model: str | None = None,
        year: int | None = None,
        plate: str | None = None,
        purchase_date: str | None = None,
        purchase_odometer: float | None = None,
        notes: str | None = None,
        add_default_schedule: bool = True,
    ) -> dict[str, Any]:
        energy_type = energy_type.lower().replace("-", "_").replace(" ", "_")
        if energy_type in ("petrol", "gas"):
            energy_type = "gasoline"
        if energy_type in ("ev", "bev"):
            energy_type = "electric"
        if energy_type in ("phev",):
            energy_type = "plugin_hybrid"
        if energy_type not in ENERGY_TYPES:
            raise GarageError(f"energy_type must be one of {', '.join(ENERGY_TYPES)}")
        try:
            cur = self.conn.execute(
                """INSERT INTO vehicles(name, make, model, year, energy_type, plate, purchase_date, purchase_odometer, notes)
                   VALUES (?,?,?,?,?,?,?,?,?)""",
                (name, make, model, year, energy_type, plate,
                 parse_date(purchase_date) if purchase_date else None, purchase_odometer, notes),
            )
        except sqlite3.IntegrityError as e:
            raise GarageError(f"A vehicle named {name!r} already exists") from e
        vid = cur.lastrowid
        if add_default_schedule:
            key = "electric" if energy_type == "electric" else "combustion"
            factor = 0.621371 if self.settings()["distance_unit"] == "mi" else 1.0
            for st, dist, months in DEFAULT_SCHEDULES[key]:
                self.conn.execute(
                    "INSERT INTO maintenance_schedule(vehicle_id, service_type, interval_distance, interval_months) VALUES (?,?,?,?)",
                    (vid, st, round(dist * factor, -2) if dist else None, months),
                )
        self.conn.commit()
        return self.get_vehicle(vid)

    def get_vehicle(self, vehicle: str | int | None = None) -> dict[str, Any]:
        rows = [dict(r) for r in self.conn.execute("SELECT * FROM vehicles WHERE archived = 0 ORDER BY id")]
        if vehicle is None or vehicle == "":
            if len(rows) == 1:
                return self._decorate_vehicle(rows[0])
            if not rows:
                raise GarageError("No vehicles yet. Add one with add_vehicle first.")
            raise GarageError("Several vehicles exist; say which one: " + ", ".join(r["name"] for r in rows))
        if isinstance(vehicle, int) or str(vehicle).isdigit():
            r = self.conn.execute("SELECT * FROM vehicles WHERE id = ?", (int(vehicle),)).fetchone()
        else:
            r = self.conn.execute("SELECT * FROM vehicles WHERE name = ? COLLATE NOCASE", (vehicle,)).fetchone()
            if r is None:
                matches = [x for x in rows if str(vehicle).lower() in x["name"].lower()]
                if len(matches) == 1:
                    return self._decorate_vehicle(matches[0])
        if r is None:
            raise GarageError(f"Unknown vehicle {vehicle!r}. Known: " + ", ".join(x["name"] for x in rows))
        return self._decorate_vehicle(dict(r))

    def _decorate_vehicle(self, v: dict[str, Any]) -> dict[str, Any]:
        v["current_odometer"] = self.current_odometer(v["id"])
        v["archived"] = bool(v["archived"])
        return v

    def list_vehicles(self, include_archived: bool = False) -> list[dict[str, Any]]:
        q = "SELECT * FROM vehicles" + ("" if include_archived else " WHERE archived = 0") + " ORDER BY id"
        return [self._decorate_vehicle(dict(r)) for r in self.conn.execute(q)]

    def archive_vehicle(self, vehicle: str | int) -> dict[str, Any]:
        v = self.get_vehicle(vehicle)
        self.conn.execute("UPDATE vehicles SET archived = 1 WHERE id = ?", (v["id"],))
        self.conn.commit()
        return {"archived": v["name"]}

    def current_odometer(self, vehicle_id: int) -> float | None:
        r = self.conn.execute(
            """SELECT MAX(o) FROM (
                 SELECT MAX(odometer) o FROM energy_logs WHERE vehicle_id = :v
                 UNION ALL SELECT MAX(odometer) FROM service_logs WHERE vehicle_id = :v
                 UNION ALL SELECT purchase_odometer FROM vehicles WHERE id = :v)""",
            {"v": vehicle_id},
        ).fetchone()
        return r[0]

    # ------------------------------------------------------------------ logging
    def log_energy(
        self,
        quantity: float,
        total_cost: float,
        vehicle: str | int | None = None,
        odometer: float | None = None,
        date_: str | None = None,
        full: bool = True,
        kind: str | None = None,
        location: str | None = None,
        notes: str | None = None,
    ) -> dict[str, Any]:
        v = self.get_vehicle(vehicle)
        if kind is None:
            kind = "charge" if v["energy_type"] == "electric" else "fuel"
        if kind not in ("fuel", "charge"):
            raise GarageError("kind must be 'fuel' or 'charge'")
        if quantity <= 0:
            raise GarageError("quantity must be positive")
        d = parse_date(date_)
        cur = self.conn.execute(
            "INSERT INTO energy_logs(vehicle_id, date, odometer, kind, quantity, total_cost, full, location, notes) VALUES (?,?,?,?,?,?,?,?,?)",
            (v["id"], d, odometer, kind, quantity, total_cost, int(full), location, notes),
        )
        self.conn.commit()
        entry = dict(self.conn.execute("SELECT * FROM energy_logs WHERE id = ?", (cur.lastrowid,)).fetchone())
        entry["price_per_unit"] = _round(total_cost / quantity, 3)
        eff = [e for e in self.efficiency_series(v["id"], kind) if e["log_id"] == entry["id"]]
        if eff:
            entry["consumption"] = eff[0]
        return {"vehicle": v["name"], "entry": entry}

    def log_service(self, service_type: str, cost: float = 0, vehicle: str | int | None = None,
                    odometer: float | None = None, date_: str | None = None,
                    shop: str | None = None, notes: str | None = None) -> dict[str, Any]:
        v = self.get_vehicle(vehicle)
        cur = self.conn.execute(
            "INSERT INTO service_logs(vehicle_id, date, odometer, service_type, cost, shop, notes) VALUES (?,?,?,?,?,?,?)",
            (v["id"], parse_date(date_), odometer, service_type.strip().lower(), cost, shop, notes),
        )
        self.conn.commit()
        return {"vehicle": v["name"], "entry": dict(self.conn.execute("SELECT * FROM service_logs WHERE id=?", (cur.lastrowid,)).fetchone())}

    def log_expense(self, category: str, amount: float, vehicle: str | int | None = None,
                    date_: str | None = None, notes: str | None = None) -> dict[str, Any]:
        v = self.get_vehicle(vehicle)
        cur = self.conn.execute(
            "INSERT INTO expenses(vehicle_id, date, category, amount, notes) VALUES (?,?,?,?,?)",
            (v["id"], parse_date(date_), category.strip().lower(), amount, notes),
        )
        self.conn.commit()
        return {"vehicle": v["name"], "entry": dict(self.conn.execute("SELECT * FROM expenses WHERE id=?", (cur.lastrowid,)).fetchone())}

    def log_trip(self, distance: float, vehicle: str | int | None = None, date_: str | None = None,
                 purpose: str = "personal", start_location: str | None = None,
                 end_location: str | None = None, notes: str | None = None) -> dict[str, Any]:
        v = self.get_vehicle(vehicle)
        cur = self.conn.execute(
            "INSERT INTO trips(vehicle_id, date, distance, purpose, start_location, end_location, notes) VALUES (?,?,?,?,?,?,?)",
            (v["id"], parse_date(date_), distance, purpose.strip().lower(), start_location, end_location, notes),
        )
        self.conn.commit()
        return {"vehicle": v["name"], "entry": dict(self.conn.execute("SELECT * FROM trips WHERE id=?", (cur.lastrowid,)).fetchone())}

    def set_schedule(self, service_type: str, vehicle: str | int | None = None,
                     interval_distance: float | None = None, interval_months: int | None = None,
                     notes: str | None = None) -> dict[str, Any]:
        if interval_distance is None and interval_months is None:
            raise GarageError("Give interval_distance, interval_months, or both")
        v = self.get_vehicle(vehicle)
        self.conn.execute(
            """INSERT INTO maintenance_schedule(vehicle_id, service_type, interval_distance, interval_months, notes)
               VALUES (?,?,?,?,?)
               ON CONFLICT(vehicle_id, service_type) DO UPDATE SET
                 interval_distance=excluded.interval_distance, interval_months=excluded.interval_months, notes=excluded.notes""",
            (v["id"], service_type.strip().lower(), interval_distance, interval_months, notes),
        )
        self.conn.commit()
        return {"vehicle": v["name"], "schedule": self.list_entries("schedule", v["id"])}

    def delete_entry(self, entry_type: str, entry_id: int) -> dict[str, Any]:
        table = ENTRY_TABLES.get(entry_type)
        if not table:
            raise GarageError(f"entry_type must be one of {', '.join(ENTRY_TABLES)}")
        row = self.conn.execute(f"SELECT * FROM {table} WHERE id = ?", (entry_id,)).fetchone()
        if row is None:
            raise GarageError(f"No {entry_type} entry with id {entry_id}")
        self.conn.execute(f"DELETE FROM {table} WHERE id = ?", (entry_id,))
        self.conn.commit()
        return {"deleted": dict(row), "entry_type": entry_type}

    def list_entries(self, entry_type: str, vehicle: str | int | None = None, since: str | None = None,
                     until: str | None = None, limit: int = 50) -> list[dict[str, Any]]:
        table = ENTRY_TABLES.get(entry_type)
        if not table:
            raise GarageError(f"entry_type must be one of {', '.join(ENTRY_TABLES)}")
        v = self.get_vehicle(vehicle)
        if entry_type == "schedule":
            return [dict(r) for r in self.conn.execute(
                "SELECT * FROM maintenance_schedule WHERE vehicle_id = ? ORDER BY service_type", (v["id"],))]
        q = f"SELECT * FROM {table} WHERE vehicle_id = ? AND date >= ? AND date <= ? ORDER BY date DESC, id DESC LIMIT ?"
        rows = [dict(r) for r in self.conn.execute(
            q, (v["id"], parse_date(since) if since else "0000-00-00", parse_date(until) if until else "9999-12-31", limit))]
        if entry_type == "energy":
            for r in rows:
                r["price_per_unit"] = _round(r["total_cost"] / r["quantity"], 3)
                r["full"] = bool(r["full"])
        return rows

    # ------------------------------------------------------------------ analytics
    def efficiency_series(self, vehicle_id: int, kind: str | None = None) -> list[dict[str, Any]]:
        """Full-to-full consumption: energy added since the previous full log / distance since it."""
        q = "SELECT * FROM energy_logs WHERE vehicle_id = ? AND odometer IS NOT NULL"
        args: list[Any] = [vehicle_id]
        if kind:
            q += " AND kind = ?"
            args.append(kind)
        logs = [dict(r) for r in self.conn.execute(q + " ORDER BY odometer, date, id", args)]
        out: list[dict[str, Any]] = []
        by_kind: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for log in logs:
            by_kind[log["kind"]].append(log)
        for k, ls in by_kind.items():
            prev_full = None
            acc_qty = acc_cost = 0.0
            for log in ls:
                if prev_full is not None:
                    acc_qty += log["quantity"]
                    acc_cost += log["total_cost"]
                if log["full"]:
                    if prev_full is not None:
                        dist = log["odometer"] - prev_full["odometer"]
                        if dist > 0:
                            out.append({
                                "log_id": log["id"], "date": log["date"], "kind": k,
                                "distance": _round(dist, 1),
                                "quantity": _round(acc_qty, 2),
                                "per_100": _round(acc_qty / dist * 100, 2),
                                "distance_per_unit": _round(dist / acc_qty, 2) if acc_qty else None,
                                "cost_per_distance": _round(acc_cost / dist, 3),
                            })
                    prev_full = log
                    acc_qty = acc_cost = 0.0
        out.sort(key=lambda e: (e["date"], e["log_id"]))
        return out

    def _period(self, months: int | None, since: str | None, until: str | None) -> tuple[str, str]:
        end = parse_date(until) if until else date.today().isoformat()
        if since:
            start = parse_date(since)
        elif months:
            e = date.fromisoformat(end)
            start = add_months(e.replace(day=1), -(months - 1)).isoformat()
        else:
            start = "0000-01-01"
        return start, end

    def summary(self, vehicle: str | int | None = None, months: int | None = 12,
                since: str | None = None, until: str | None = None) -> dict[str, Any]:
        v = self.get_vehicle(vehicle)
        start, end = self._period(months, since, until)
        vid = v["id"]
        p = (vid, start, end)
        energy = self.conn.execute(
            "SELECT kind, COUNT(*) n, SUM(quantity) q, SUM(total_cost) c FROM energy_logs WHERE vehicle_id=? AND date BETWEEN ? AND ? GROUP BY kind", p
        ).fetchall()
        service_cost = self.conn.execute(
            "SELECT COALESCE(SUM(cost),0), COUNT(*) FROM service_logs WHERE vehicle_id=? AND date BETWEEN ? AND ?", p).fetchone()
        expenses = {r["category"]: r["t"] for r in self.conn.execute(
            "SELECT category, SUM(amount) t FROM expenses WHERE vehicle_id=? AND date BETWEEN ? AND ? GROUP BY category ORDER BY t DESC", p)}
        trips = self.conn.execute(
            "SELECT purpose, SUM(distance) d, COUNT(*) n FROM trips WHERE vehicle_id=? AND date BETWEEN ? AND ? GROUP BY purpose", p).fetchall()
        odo = self.conn.execute(
            """SELECT MIN(odometer), MAX(odometer) FROM (
                 SELECT odometer FROM energy_logs WHERE vehicle_id=? AND date BETWEEN ? AND ? AND odometer IS NOT NULL
                 UNION ALL SELECT odometer FROM service_logs WHERE vehicle_id=? AND date BETWEEN ? AND ? AND odometer IS NOT NULL)""",
            p + p).fetchone()
        distance = (odo[1] - odo[0]) if odo[0] is not None and odo[1] is not None else None
        trip_distance = sum(t["d"] for t in trips) if trips else 0
        if not distance and trip_distance:
            distance = trip_distance
        energy_cost = sum(r["c"] for r in energy)
        total = energy_cost + service_cost[0] + sum(expenses.values())
        eff = [e for e in self.efficiency_series(vid) if start <= e["date"] <= end]
        eff_by_kind = {}
        for k in {e["kind"] for e in eff}:
            ek = [e for e in eff if e["kind"] == k]
            q = sum(e["quantity"] for e in ek)
            d = sum(e["distance"] for e in ek)
            eff_by_kind[k] = {"per_100": _round(q / d * 100, 2), "distance_per_unit": _round(d / q, 2), "samples": len(ek)}
        s = self.settings()
        return {
            "vehicle": v["name"],
            "period": {"start": start if start != "0000-01-01" else None, "end": end},
            "units": {**s, "charge_unit": "kWh"},
            "total_cost": _round(total),
            "energy": {r["kind"]: {"logs": r["n"], "quantity": _round(r["q"]), "cost": _round(r["c"]),
                                   "avg_price_per_unit": _round(r["c"] / r["q"], 3)} for r in energy},
            "energy_cost": _round(energy_cost),
            "maintenance_cost": _round(service_cost[0]),
            "maintenance_visits": service_cost[1],
            "other_expenses": {k: _round(x) for k, x in expenses.items()},
            "distance": _round(distance, 1),
            "cost_per_distance": _round(total / distance, 3) if distance else None,
            "energy_cost_per_distance": _round(energy_cost / distance, 3) if distance else None,
            "average_consumption": eff_by_kind,
            "trips": {t["purpose"]: {"distance": _round(t["d"], 1), "count": t["n"]} for t in trips},
            "current_odometer": v["current_odometer"],
        }

    def maintenance_due(self, vehicle: str | int | None = None, soon_distance: float = 1000,
                        soon_days: int = 30) -> dict[str, Any]:
        v = self.get_vehicle(vehicle)
        today = date.today()
        cur_odo = v["current_odometer"]
        items = []
        for rule in self.list_entries("schedule", v["id"]):
            st = rule["service_type"]
            last = self.conn.execute(
                "SELECT * FROM service_logs WHERE vehicle_id = ? AND service_type = ? ORDER BY date DESC, odometer DESC LIMIT 1",
                (v["id"], st)).fetchone() or self.conn.execute(
                "SELECT * FROM service_logs WHERE vehicle_id = ? AND service_type LIKE ? ORDER BY date DESC, odometer DESC LIMIT 1",
                (v["id"], f"%{st}%")).fetchone()
            base_date = last["date"] if last else v["purchase_date"]
            base_odo = last["odometer"] if last else v["purchase_odometer"]
            item: dict[str, Any] = {
                "service_type": st,
                "interval_distance": rule["interval_distance"],
                "interval_months": rule["interval_months"],
                "last_done": {"date": last["date"], "odometer": last["odometer"]} if last else None,
                "status": "ok",
            }
            reasons = []
            if rule["interval_distance"] and base_odo is not None and cur_odo is not None:
                due_odo = base_odo + rule["interval_distance"]
                left = due_odo - cur_odo
                item["due_at_odometer"] = _round(due_odo, 0)
                item["distance_left"] = _round(left, 0)
                if left < 0:
                    reasons.append("overdue")
                elif left <= max(soon_distance, 0.1 * rule["interval_distance"]):
                    reasons.append("due_soon")
            if rule["interval_months"] and base_date:
                due_date = add_months(date.fromisoformat(base_date), rule["interval_months"])
                days = (due_date - today).days
                item["due_date"] = due_date.isoformat()
                item["days_left"] = days
                if days < 0:
                    reasons.append("overdue")
                elif days <= soon_days:
                    reasons.append("due_soon")
            if "overdue" in reasons:
                item["status"] = "overdue"
            elif "due_soon" in reasons:
                item["status"] = "due_soon"
            elif not last and base_date is None and base_odo is None:
                item["status"] = "unknown"
                item["hint"] = "No service record yet. Log the last time it was done with log_service."
            items.append(item)
        order = {"overdue": 0, "due_soon": 1, "unknown": 2, "ok": 3}
        items.sort(key=lambda i: (order[i["status"]], i.get("distance_left") or 1e12, i.get("days_left") or 1e9))
        return {"vehicle": v["name"], "current_odometer": cur_odo, "today": today.isoformat(), "items": items}

    def monthly_costs(self, vehicle_id: int, start: str, end: str, max_expense_series: int = 3) -> dict[str, Any]:
        """Monthly spend split into stable series: Energy, Maintenance, top-N expense categories, Other."""
        p = (vehicle_id, start, end)
        rows: list[tuple[str, str, float]] = []
        for r in self.conn.execute("SELECT date, total_cost FROM energy_logs WHERE vehicle_id=? AND date BETWEEN ? AND ?", p):
            rows.append((month_key(r[0]), "Energy", r[1]))
        for r in self.conn.execute("SELECT date, cost FROM service_logs WHERE vehicle_id=? AND date BETWEEN ? AND ?", p):
            rows.append((month_key(r[0]), "Maintenance", r[1]))
        exp = [(month_key(r[0]), r[1], r[2]) for r in self.conn.execute(
            "SELECT date, category, amount FROM expenses WHERE vehicle_id=? AND date BETWEEN ? AND ?", p)]
        totals: dict[str, float] = defaultdict(float)
        for _, c, a in exp:
            totals[c] += a
        top = [c for c, _ in sorted(totals.items(), key=lambda kv: -kv[1])[:max_expense_series]]
        for m, c, a in exp:
            rows.append((m, c.title() if c in top else "Other", a))
        series = ["Energy", "Maintenance"] + [c.title() for c in top]
        if any(s == "Other" for _, s, _ in rows):
            series.append("Other")
        # Build month list covering the range actually present (or the requested window).
        first = date.fromisoformat(start if start != "0000-01-01" else (min((r[0] for r in rows), default=end[:7]) + "-01"))
        last = date.fromisoformat(end)
        months = []
        d = first.replace(day=1)
        while d <= last:
            months.append(d.strftime("%Y-%m"))
            d = add_months(d, 1)
        grid = {m: {s: 0.0 for s in series} for m in months}
        for m, s, a in rows:
            if m in grid:
                grid[m][s] += a
        return {
            "series": series,
            "months": [{"month": m, **{s: _round(grid[m][s]) for s in series}, "total": _round(sum(grid[m].values()))} for m in months],
        }

    def dashboard_data(self, vehicle: str | int | None = None, months: int = 12) -> dict[str, Any]:
        v = self.get_vehicle(vehicle)
        start, end = self._period(months, None, None)
        summ = self.summary(v["id"], since=start, until=end)
        monthly = self.monthly_costs(v["id"], start, end)
        eff = [e for e in self.efficiency_series(v["id"]) if start <= e["date"] <= end]
        prices = [
            {"date": r["date"], "kind": r["kind"], "price_per_unit": _round(r["total_cost"] / r["quantity"], 3)}
            for r in self.conn.execute(
                "SELECT date, kind, quantity, total_cost FROM energy_logs WHERE vehicle_id=? AND date BETWEEN ? AND ? ORDER BY date",
                (v["id"], start, end))
        ]
        breakdown = [{"category": "Energy", "amount": summ["energy_cost"]},
                     {"category": "Maintenance", "amount": summ["maintenance_cost"]}]
        breakdown += [{"category": k.title(), "amount": a} for k, a in summ["other_expenses"].items()]
        breakdown = sorted([b for b in breakdown if b["amount"]], key=lambda b: -b["amount"])
        recent = sorted(
            [{"type": "energy", "date": e["date"], "label": f"{e['kind'].title()} {e['quantity']:g}", "amount": e["total_cost"]}
             for e in self.list_entries("energy", v["id"], limit=8)]
            + [{"type": "service", "date": e["date"], "label": e["service_type"].title(), "amount": e["cost"]}
               for e in self.list_entries("service", v["id"], limit=5)]
            + [{"type": "expense", "date": e["date"], "label": e["category"].title(), "amount": e["amount"]}
               for e in self.list_entries("expense", v["id"], limit=5)],
            key=lambda r: r["date"], reverse=True)[:8]
        return {
            "generated_at": datetime.now().isoformat(timespec="seconds"),
            "vehicle": {k: v[k] for k in ("id", "name", "make", "model", "year", "energy_type", "current_odometer")},
            "vehicles": [x["name"] for x in self.list_vehicles()],
            "months": months,
            "summary": summ,
            "monthly_costs": monthly,
            "efficiency": eff,
            "prices": prices,
            "breakdown": breakdown,
            "maintenance": self.maintenance_due(v["id"])["items"],
            "recent": recent,
        }
