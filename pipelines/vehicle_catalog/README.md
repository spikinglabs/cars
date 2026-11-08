# Vehicle catalog

Official consumption per car model, from the European Environment Agency's monitoring of CO2 emissions from new
passenger cars (Regulation (EU) 2019/631). Every new car registered in the EU, Iceland and Norway is reported with
its WLTP figures; we group the year's ~10 million registrations into one row per make, model and fuel type.

    python -m pipelines.vehicle_catalog.collect --local ./out
    python -m pipelines.vehicle_catalog.collect --r2 <bucket> [--table co2cars_2025Pv31]

- Source: EEA DiscoData SQL endpoint (`https://discodata.eea.europa.eu/sql`), table
  `[CO2Emission].[latest].[co2cars_<year><P|F>v<version>]`. The newest table is found by probing versions, which count
  up across years. Use form-encoded POST: GET requests with named columns are blocked by the endpoint's firewall.
- Older years: every year from 2021 (the first with WLTP figures for every car) up to the newest is built too, and
  models no longer sold new stay in. A model's figures come from its newest year with at least a tenth of its best
  year's registrations (`year`), so a run-out or a same-named import doesn't replace them; `years` = first and last year. The table per older year is kept in `raw/eea-co2-cars/tables.json` and its rows in `raw/`, so final years are
  fetched once; a provisional year is looked up again until its final table appears.
- Output: `vehicle-catalog/public/<region>/{models.json, models.csv, electric.json}` for `de` and `eu` (EU-27), served
  at `https://cars.allo.land/data/vehicle-catalog/<region>/...` from the `R2_BUCKET_EV` bucket.
- Figures are registration-weighted means over a model's versions, using the region's own mix and falling back to
  all countries when the region did not report a figure. `kwh_per_100km` is at the plug (charging losses included).
- Model names are cleaned up in `catalog.py` (make aliases, family rules). Rare models can still have odd names;
  add a rule there and a case to the tests.
- Schedule: monthly (`.github/workflows/collect-vehicle-catalog.yml`), and on pushes that change the collector.
- Licence: CC BY 4.0, credit the European Environment Agency.
