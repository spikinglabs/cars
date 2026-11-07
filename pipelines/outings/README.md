# Family outings next to chargers

Kid-friendly places and family events from our sister site [Allo Outings](https://outings.allo.land)
(open JSON at `/api/v1/places.json` and `/api/v1/events.json`; places from OpenStreetMap, ODbL, and from
parents; events from public calendars and from parents), split into the same 0.5° cells as the charger map,
so [cars.allo.land/chargers/?kids=1](https://cars.allo.land/chargers/?kids=1) can show where the kids can
play while the car charges.

```bash
python -m pipelines.outings.collect --local ./out                                   # download and build
python -m pipelines.outings.collect --local ./out --places p.json --events e.json  # from local files
python -m pipelines.outings.collect --r2 <bucket> --prefix outings                  # what the workflow runs
```

- `build.py` keeps places with exact coordinates and events running in the next 14 days (exact or venue
  coordinates), and writes `cells/<lat*2>_<lon*2>.json` with `place_fields`/`places` and `event_fields`/`events`.
- `collect.py` writes the cells and `latest.json` (counts, source, list of cells) under `outings/public/de/`.
- `.github/workflows/collect-outings.yml` runs daily, after Outings' nightly rebuild.

Page links: `https://outings.allo.land/<de|en|zh>/orte/<id>/` (places), `…/termine/<id>/` (events).
