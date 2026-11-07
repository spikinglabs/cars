# Charger map data

Public charge points in Germany from the Bundesnetzagentur [Ladesäulenregister](https://www.bundesnetzagentur.de/DE/Fachthemen/ElektrizitaetundGas/E-Mobilitaet/start.html)
(CC BY 4.0, credit "Bundesnetzagentur.de"), turned into small files for the map at
[cars.allo.land/chargers/](https://cars.allo.land/chargers/) and the `find_chargers` MCP tool.

```bash
python -m pipelines.chargers.collect --local ./out                      # download the newest register
python -m pipelines.chargers.collect --local ./out --file register.csv  # or build from a local file (CSV or XLSX)
python -m pipelines.chargers.collect --r2 <bucket> --prefix chargers    # what the workflow runs
```

- `register.py` reads the CSV or XLSX (notes on top, then the header row; up to six charge points per device).
- `build.py` merges devices within about 10 m into one location, drops locations whose coordinates are far from
  their own postcode, and writes `latest.json`, `overview.json` (0.1° grid counts), `cells/<lat*2>_<lon*2>.json`
  (0.5° squares), `places.json` (postcode and town centres for search) and `stations.csv`.
- `.github/workflows/collect-chargers.yml` checks daily and rebuilds only when a newer register file is out.
  The raw files are archived by the charging-prices pipeline under `charging-prices/raw/bnetza/register/`.

Bucket layout and fields: see the docstrings in `collect.py` and `build.py`.
