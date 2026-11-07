# Fuel price collector

Petrol, diesel and LPG prices for every EU country and the EU average, weekly since January 2005, from the
[EU Weekly Oil Bulletin](https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en)
(European Commission, CC BY 4.0). No API key needed. National weekly averages
including all taxes, in EUR per litre.

Runs daily via `.github/workflows/collect-fuel-prices.yml` and writes to
the R2 bucket named by the `R2_BUCKET_ICE` repository variable, under `fuel-prices/` (layout at the top of `collect.py`). Public files:

- `https://cars.allo.land/data/fuel-prices/index.json`: regions, their currency, files and last update
- `https://cars.allo.land/data/fuel-prices/<region>/latest.json`: newest week, change on the previous week, 4- and 52-week averages
- `https://cars.allo.land/data/fuel-prices/<region>/weekly.csv`: `date,euro_super_95,diesel,lpg` per litre

`<region>` is the lowercase ISO code (`de`, `fr`, `pl`, `gb` until 2020, ...) or `eu` for the
EU weighted average. Countries outside the euro area are in their own currency (field
`currency`), with extra `*_eur` columns; `eur_per_litre` in latest.json is always euro.
The old flat URLs (`/data/fuel-prices/latest.json`) keep serving Germany.

Station-level prices (E5, E10 and diesel at every station, every few minutes) are
available from Tankerkönig / MTS-K under CC BY 4.0, but need a personal API key
and access to its archive. That could be added later as a second source.

```sh
python -m pipelines.fuel_prices.collect --local ./out
python -m unittest discover -s pipelines/fuel_prices/tests -t .
```

## Forecast

Each run also writes `public/<region>/forecast.json` and `forecast.csv`: the next 8 weeks per fuel with 80 % and
95 % ranges. `pipelines/price_forecast` scores three forecasters (no change, drift, AR(4) on weekly changes) on rolling
origins over the last two years and publishes the best only if it beats "no change" by at least 2 % mean absolute
error. The ranges are quantiles of that forecaster's own backtest errors. Pure Python, about 0.05 s per series.
Regions whose series stopped (gb) get no forecast. Page: `/fuel-prices/`.
