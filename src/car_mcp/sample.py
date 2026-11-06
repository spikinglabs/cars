"""Deterministic demo data: one petrol car and one EV with ~14 months of history."""

from __future__ import annotations

import random
from datetime import date, timedelta

from .garage import Garage, add_months


def load_sample_data(g: Garage, today: date | None = None) -> dict[str, int]:
    rnd = random.Random(42)
    today = today or date.today()
    start = add_months(today.replace(day=1), -13)
    counts = {"energy": 0, "service": 0, "expense": 0, "trip": 0}

    existing = {v["name"].lower() for v in g.list_vehicles(include_archived=True)}

    # ---- Petrol hatchback
    if "golf (demo)" not in existing:
        g.add_vehicle("Golf (demo)", "gasoline", make="Volkswagen", model="Golf", year=2019,
                      purchase_date=(start - timedelta(days=400)).isoformat(), purchase_odometer=31000)
        odo = 38200.0
        d = start
        price = 1.72
        while d < today:
            dist = rnd.uniform(480, 640)
            odo += dist
            price = max(1.55, min(1.98, price + rnd.uniform(-0.05, 0.05)))
            litres = dist * rnd.uniform(5.9, 7.4) / 100
            g.log_energy(round(litres, 2), round(litres * price, 2), "Golf (demo)", round(odo), d.isoformat(),
                         location=rnd.choice(["Aral", "Shell", "Jet", "Esso"]))
            counts["energy"] += 1
            d += timedelta(days=rnd.randint(11, 19))
        services = [
            (40, "oil change", 189, 41000), (130, "tires", 520, 44100), (140, "tire rotation", 40, 44300), (200, "brake inspection", 95, 46500),
            (330, "oil change", 205, 50900), (360, "inspection", 140, 51600),
        ]
        for offset, st, cost, o in services:
            sd = start + timedelta(days=offset)
            if sd < today:
                g.log_service(st, cost, "Golf (demo)", o, sd.isoformat(), shop="Autohaus Müller")
                counts["service"] += 1

    # ---- EV
    if "model 3 (demo)" not in existing:
        g.add_vehicle("Model 3 (demo)", "electric", make="Tesla", model="Model 3", year=2022,
                      purchase_date=(start - timedelta(days=200)).isoformat(), purchase_odometer=0)
        odo = 9100.0
        d = start
        while d < today:
            dist = rnd.uniform(160, 300)
            odo += dist
            winter = d.month in (11, 12, 1, 2)
            kwh = dist * rnd.uniform(17.5, 21.5 if winter else 17.0) / 100 if winter else dist * rnd.uniform(13.5, 16.5) / 100
            home = rnd.random() < 0.7
            price = 0.32 if home else rnd.choice([0.49, 0.52, 0.59])
            g.log_energy(round(kwh, 1), round(kwh * price, 2), "Model 3 (demo)", round(odo), d.isoformat(),
                         location="Home wallbox" if home else rnd.choice(["Supercharger", "Ionity", "EnBW"]))
            counts["energy"] += 1
            d += timedelta(days=rnd.randint(4, 8))
        for offset, st, cost, o in [(90, "tire rotation", 60, 13200), (250, "cabin filter", 85, 19800)]:
            sd = start + timedelta(days=offset)
            if sd < today:
                g.log_service(st, cost, "Model 3 (demo)", o, sd.isoformat(), shop="Tesla Service")
                counts["service"] += 1

    # ---- Shared recurring expenses and trips
    for name, ins, tax in (("Golf (demo)", 58, 140), ("Model 3 (demo)", 74, 0)):
        if name.lower() in existing:
            continue
        m = start
        while m <= today:
            g.log_expense("insurance", ins, name, m.isoformat())
            counts["expense"] += 1
            if m.month == 3 and tax:
                g.log_expense("vehicle tax", tax, name, m.isoformat())
                counts["expense"] += 1
            for _ in range(rnd.randint(1, 4)):
                pd = m + timedelta(days=rnd.randint(0, 27))
                if pd <= today:
                    g.log_expense(rnd.choice(["parking", "parking", "tolls", "car wash"]),
                                  round(rnd.uniform(3, 28), 2), name, pd.isoformat())
                    counts["expense"] += 1
            for _ in range(rnd.randint(2, 5)):
                td = m + timedelta(days=rnd.randint(0, 27))
                if td <= today:
                    g.log_trip(round(rnd.uniform(12, 240), 1), name, td.isoformat(),
                               purpose=rnd.choice(["business", "personal", "personal", "commute"]))
                    counts["trip"] += 1
            m = add_months(m, 1)
    return counts
