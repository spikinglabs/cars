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
- Versions (trims): `versions.py` builds `vehicle-catalog/public/<region>/versions/<make>.json` (+ `versions/index.json`,
  `versions.csv`) from a second query per year (`eea.versions_sql`: make, commercial name, fuel, variant code Va and
  power, counted for DE / EU-27 / all). A version is the trim words of the commercial name plus the power, split again
  where the electric range jumps by more than 10 % (EX30 51 vs 69 kWh). VW-group cars reported with their 30-minute
  power (70-89 kW) in some years are folded into the version sharing their main variant code. Each version keeps its
  commercial names and variant codes (field D.2 of the German registration certificate) so it can be looked up at the
  maker. Battery size, charging power and dimensions are not in the EEA data and not added: the community datasets we
  checked (Open EV Data, OpenEV Data dataset) had wrong figures for common cars.
- Figures are registration-weighted means over a model's versions, using the region's own mix and falling back to
  all countries when the region did not report a figure. `kwh_per_100km` is at the plug (charging losses included).
- Model names are cleaned up in `catalog.py` (make aliases, family rules). Rare models can still have odd names;
  add a rule there and a case to the tests.
- Schedule: monthly (`.github/workflows/collect-vehicle-catalog.yml`), and on pushes that change the collector.
- Licence: CC BY 4.0, credit the European Environment Agency.
