# Charging data collector

Builds a history of German EV charging prices (and charger status) from open data,
because no public archive of past prices exists. Runs on GitHub Actions and stores
everything in the Cloudflare R2 bucket named by the `R2_BUCKET_EV` repository variable.

## Source

[Open ChargePoint Database (OCPDB)](https://api.mobidata-bw.de/ocpdb/documentation/public.json)
by MobiData BW. It merges the Bundesnetzagentur register with operator AFIR feeds from
Mobilithek, needs no API key, and states a licence per source (`/v1/sources`).
The Bundesnetzagentur register files (CC BY 4.0) are archived as well.

## Schedule (`.github/workflows/collect-charging-data.yml`)

| Tier | When | What is stored |
| --- | --- | --- |
| hourly | :07 every hour | sources, tariffs (OCPI 2.2 + 3.0), tariff associations (every fetch recorded: full copy when changed, otherwise a small `.same.json` pointer to the identical copy); charger status changes; first status snapshot of the day; public summary files |
| daily | 03:23 UTC | new Bundesnetzagentur register files; storage usage check (fails above 8 GB) |
| weekly | Monday 04:41 UTC | full locations and businesses |

## Bucket layout

The bucket is shared by several projects. Each project owns one top-level folder, and
the website serves only its `public/` subfolder at `/data/<project>/`
(`site/functions/data/[[path]].js`).

```
<EV bucket>/
  charging-prices/              this pipeline (--prefix)
    raw/                        source data exactly as fetched
      ocpdb/<dataset>/YYYY/MM/DD/<ts>.jsonl.gz
      ocpdb/evse_status/YYYY/MM/DD/<ts>.csv.gz
      ocpdb/evse_status_changes/YYYY/MM/DD/<ts>.csv.gz
      bnetza/register/<file>
    derived/                    processed tables (tariffs/YYYY/MM/DD/<ts>.csv.gz)
    public/                     -> cars.allo.land/data/charging-prices/
      index.json                regions and files
      de/                       latest.json, daily.csv, tariffs.csv, sources.json
                                daily_power.csv, daily_operators.csv, operators.csv
    state/                      bookkeeping between runs
    runs/YYYY/MM/DD/            one report per run
  <other-project>/              same pattern: raw/, derived/, public/, state/, runs/
```

## Prices by charger type and operator

Each hourly run joins the ad-hoc tariffs to the charge points they apply to (`tariff_associations`),
reads each charge point's power from the EVSE list it fetches anyway for the status history, and its
operator from `state/evse_operators.json.gz`, which the weekly run rebuilds from the locations list.
Every charge point counts once, with its cheapest ad-hoc tariff: `ac`, `dc` (below 150 kW) and `hpc`
(150 kW and up). `latest.json` gets `by_power` and `by_operator` (operators with at least 25 priced
charge points); `daily_power.csv` and `daily_operators.csv` keep the history.

Only sources with an open licence go into `public/`. Full details are at the top of `collect.py`.

## Cost

Built to stay at zero: public repo (free Actions minutes), R2 free tier (10 GB storage,
1M writes/month; expected use about 2 GB/year and ~15k writes/month), Pages free tier.

## Run locally

```sh
python -m pipelines.charging_prices.collect --tier hourly --local ./out   # writes ./out/charging-prices/...
python -m unittest discover -s pipelines/charging_prices/tests -t .
```

## Secrets

| Secret | What |
| --- | --- |
| `R2_ACCOUNT_ID` | Cloudflare account id |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | R2 API token (Object Read & Write on the bucket) |
| `CLOUDFLARE_API_TOKEN` | API token with Cloudflare Pages: Edit (site deploy) |
