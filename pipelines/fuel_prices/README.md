# Fuel price collector

German petrol, diesel and LPG prices, weekly since January 2005, from the
[EU Weekly Oil Bulletin](https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en)
(European Commission, CC BY 4.0). No API key needed. National weekly averages
including all taxes, in EUR per litre.

Runs daily via `.github/workflows/collect-fuel-prices.yml` and writes to the
R2 bucket `spikikinglabs-cars-ice` (repo variable `R2_BUCKET_ICE` overrides it) under `fuel-prices/` (layout at the top of `collect.py`). Public files:

- `https://cars.allo.land/data/fuel-prices/latest.json`: newest week, change on the previous week, 4- and 52-week averages
- `https://cars.allo.land/data/fuel-prices/weekly.csv`: `date,euro_super_95,diesel,lpg`

Station-level prices (E5, E10 and diesel at every station, every few minutes) are
available from Tankerkönig / MTS-K under CC BY 4.0, but need a personal API key
and access to its archive. That could be added later as a second source.

```sh
python -m pipelines.fuel_prices.collect --local ./out
python -m unittest discover -s pipelines/fuel_prices/tests -t .
```
