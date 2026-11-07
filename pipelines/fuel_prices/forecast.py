"""Fuel price forecasts per region, written next to weekly.csv.

    public/<region>/forecast.json   next 8 weeks per product: point, 80 % and 95 % band, backtest
    public/<region>/forecast.csv    the same paths as rows (date, product, horizon, price, lo80, ...)

Method: pipelines.price_forecast (best of naive / drift / AR on a two-year rolling backtest).
"""

from __future__ import annotations

from datetime import date

from pipelines.charging_prices.normalize import to_csv
from pipelines.price_forecast import forecast_series, regular

from . import oil_bulletin

HORIZON = 8
ORIGINS = 104
CSV_FIELDS = ["date", "product", "horizon", "price", "lo80", "hi80", "lo95", "hi95"]
STALE_DAYS = 28  # regions whose series stopped (gb after 2020) get no forecast


def build(rows: list[dict], region: str, currency: str, observed_at: str, latest_week: str) -> dict | None:
    products = {}
    for field in oil_bulletin.PRODUCTS.values():
        dates, vals = regular(rows, field)
        if not dates or (date.fromisoformat(latest_week) - date.fromisoformat(dates[-1])).days > STALE_DAYS:
            continue
        fc = forecast_series(dates, vals, horizon=HORIZON, origins=ORIGINS)
        if fc:
            products[field] = fc
    if not products:
        return None
    return {
        "dataset": "fuel-prices",
        "kind": "forecast",
        "region": region.upper(),
        "observed_at": observed_at,
        "currency": currency,
        "unit": f"{currency} per litre, national weekly average incl. all taxes",
        "horizon_weeks": HORIZON,
        "source": "Allo Cars forecast from the European Commission Weekly Oil Bulletin",
        "source_url": "https://cars.allo.land/fuel-prices/",
        "licence": "CC BY 4.0",
        "method": (
            "Three forecasters are scored on rolling origins over the last two years: naive (no change), "
            "drift (the average weekly change of the past year) and an AR(4) on weekly changes. "
            "The one with the lowest mean absolute error over weeks 1 to 8 is published. The bands are the "
            "2.5/10/90/97.5 % quantiles of that forecaster's own backtest errors at each horizon. "
            "skill_vs_naive is 1 - MAE(model)/MAE(naive): 0 means no better than assuming prices stay put."
        ),
        "products": products,
        "notes": "A forecast cannot know news (oil shocks, tax changes). Holiday weeks missing from the bulletin are interpolated.",
    }


def csv_rows(fc: dict) -> list[dict]:
    return [{"product": p, **step} for p, v in fc["products"].items() for step in v["forecast"]]


def write(store, region: str, rows: list[dict], currency: str, observed_at: str, latest_week: str) -> list[str]:
    """Store forecast.json/.csv for one region; returns the file names written."""
    fc = build(rows, region, currency, observed_at, latest_week)
    if not fc:
        return []
    import json

    store.put(f"public/{region}/forecast.json", json.dumps(fc, ensure_ascii=False, indent=2).encode(), "application/json")
    store.put(f"public/{region}/forecast.csv", to_csv(csv_rows(fc), CSV_FIELDS), "text/csv")
    return ["forecast.json", "forecast.csv"]
