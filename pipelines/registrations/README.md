# Car registrations collector

New passenger car registrations in Germany by brand and model, every month since December 2018, from the
Kraftfahrt-Bundesamt's statistic [FZ10](https://www.kba.de/DE/Statistik/Produktkatalog/produkte/Fahrzeuge/fz10/fz10_gentab.html)
("Neuzulassungen von Personenkraftwagen nach Marken und Modellreihen"). © Kraftfahrt-Bundesamt, Flensburg,
under the [Datenlizenz Deutschland – Namensnennung – 2.0](https://www.govdata.de/dl-de/by-2-0). No API key needed.

Runs daily via `.github/workflows/collect-registrations.yml` (a new month appears about a week after it ends)
and writes to the R2 bucket named by the `R2_BUCKET_EV` repository variable, under `registrations/` (layout at
the top of `collect.py`). Only months that are new or that the KBA revised (the link's `v=` changes) are
downloaded, 30 seconds apart as the KBA's robots.txt asks. The first run fetches all ~95 months and takes
about 50 minutes. The KBA's firewall refuses some automated user agents, so requests name themselves
`Allo-Cars/0.1 (+https://cars.allo.land/open-data/)`.

Public files:

- `https://cars.allo.land/data/registrations/index.json`: regions, files and last update
- `https://cars.allo.land/data/registrations/de/latest.json`: newest month: market by drive type, top 20 models, top 10 electric models, change on a year before
- `https://cars.allo.land/data/registrations/de/models.json`: every model ever listed, with slug, file, newest count, rank, last 12 months
- `https://cars.allo.land/data/registrations/de/models/<slug>.json`: one model's monthly series
- `https://cars.allo.land/data/registrations/de/monthly.csv`: `month,brand,model,slug,total,diesel,hybrid,phev,bev`
- `https://cars.allo.land/data/registrations/de/market.csv`: `month,total,diesel,hybrid,phev,bev,petrol_etc,bev_share`
- `https://cars.allo.land/data/registrations/de/brands.json`: every brand per month, total and electric

`hybrid` includes plug-in hybrids; `phev` is reported separately only since January 2021 (empty before).
`bev` is battery electric. `petrol_etc` is total minus diesel, hybrid and bev (petrol, gas, hydrogen).
Model names are as the KBA writes them, in capitals; `SONSTIGE` is a brand's other models.

```sh
python -m pipelines.registrations.collect --local ./out            # full backfill, ~50 min
python -m pipelines.registrations.collect --local ./out --delay 0 --max-downloads 3   # quick try
python -m unittest discover -s pipelines/registrations/tests -t .
```
