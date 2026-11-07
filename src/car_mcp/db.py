"""SQLite storage for car-mcp.

All data lives in a single local SQLite file. The location defaults to
``~/.car-mcp/car.db`` and can be overridden with the ``CAR_MCP_DB`` env var.
"""

from __future__ import annotations

import os
import sqlite3
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vehicles (
    id          INTEGER PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE COLLATE NOCASE,
    make        TEXT,
    model       TEXT,
    year        INTEGER,
    energy_type TEXT NOT NULL CHECK (energy_type IN ('gasoline','diesel','electric','hybrid','plugin_hybrid','lpg','other')),
    plate       TEXT,
    purchase_date TEXT,
    purchase_odometer REAL,
    notes       TEXT,
    archived    INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Fuel fill-ups and EV charging sessions.
CREATE TABLE IF NOT EXISTS energy_logs (
    id          INTEGER PRIMARY KEY,
    vehicle_id  INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    date        TEXT NOT NULL,
    odometer    REAL,
    kind        TEXT NOT NULL CHECK (kind IN ('fuel','charge')),
    quantity    REAL NOT NULL,          -- litres/gallons (fuel) or kWh (charge)
    total_cost  REAL NOT NULL,
    full        INTEGER NOT NULL DEFAULT 1,  -- tank filled / battery charged to the usual level
    location    TEXT,
    notes       TEXT
);

CREATE TABLE IF NOT EXISTS service_logs (
    id           INTEGER PRIMARY KEY,
    vehicle_id   INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    date         TEXT NOT NULL,
    odometer     REAL,
    service_type TEXT NOT NULL,         -- e.g. "oil change", "tires", "inspection"
    cost         REAL NOT NULL DEFAULT 0,
    shop         TEXT,
    notes        TEXT
);

CREATE TABLE IF NOT EXISTS maintenance_schedule (
    id              INTEGER PRIMARY KEY,
    vehicle_id      INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    service_type    TEXT NOT NULL COLLATE NOCASE,
    interval_distance REAL,
    interval_months   INTEGER,
    notes           TEXT,
    UNIQUE (vehicle_id, service_type)
);

CREATE TABLE IF NOT EXISTS expenses (
    id          INTEGER PRIMARY KEY,
    vehicle_id  INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    date        TEXT NOT NULL,
    category    TEXT NOT NULL,          -- insurance, tax, parking, tolls, wash, fine, loan, other...
    amount      REAL NOT NULL,
    notes       TEXT
);

CREATE TABLE IF NOT EXISTS trips (
    id          INTEGER PRIMARY KEY,
    vehicle_id  INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    date        TEXT NOT NULL,
    distance    REAL NOT NULL,
    purpose     TEXT NOT NULL DEFAULT 'personal',  -- personal, business, commute...
    start_location TEXT,
    end_location   TEXT,
    notes       TEXT
);

CREATE INDEX IF NOT EXISTS idx_energy_vehicle_date  ON energy_logs(vehicle_id, date);
CREATE INDEX IF NOT EXISTS idx_service_vehicle_date ON service_logs(vehicle_id, date);
CREATE INDEX IF NOT EXISTS idx_expense_vehicle_date ON expenses(vehicle_id, date);
CREATE INDEX IF NOT EXISTS idx_trip_vehicle_date    ON trips(vehicle_id, date);
"""

DEFAULT_SETTINGS = {
    "currency": "EUR",
    "distance_unit": "km",   # km | mi
    "volume_unit": "L",      # L | gal
}


def default_db_path() -> Path:
    env = os.environ.get("CAR_MCP_DB")
    if env:
        return Path(env).expanduser()
    return Path.home() / ".car-mcp" / "car.db"


def connect(path: str | Path | None = None) -> sqlite3.Connection:
    p = Path(path) if path else default_db_path()
    if str(p) != ":memory:":
        p.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(p), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(SCHEMA)
    for k, v in DEFAULT_SETTINGS.items():
        conn.execute("INSERT OR IGNORE INTO settings(key, value) VALUES (?, ?)", (k, v))
    conn.commit()
    return conn
