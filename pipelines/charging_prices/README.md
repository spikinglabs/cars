# Charging data collector

Builds a history of German EV charging prices (and charger status) from open data,
because no public archive of past prices exists. Runs on GitHub Actions and stores
everything in the Cloudflare R2 bucket `spikinglabs-car-ev` (repo variable `R2_BUCKET` overrides it).

## Source

[Open ChargePoint Database (OCPDB)](https://api.mobidata-bw.de/ocpdb/documentation/public.json)
by MobiData BW. It merges the Bundesnetzagentur register with operator AFIR feeds from
Mobilithek, needs no API key, and states a licence per source (`/v1/sources`).
The Bundesnetzagentur register files (CC BY 4.0) are archived as well.

## Schedule (`.github/workflows/collect-charging-data.yml`)

| Tier | When | What is stored |
| --- | --- | --- |
| hourly | :07 every hour | sources, tariffs (OCPI 2.2 + 3.0), tariff associations (only when changed); charger status changes; first status snapshot of the day; public summary files |
| daily | 03:23 UTC | new Bundesnetzagentur register files; storage usage check (fails above 8 GB) |
| weekly | Monday 04:41 UTC | full locations and businesses |

## Bucket layout

The bucket is shared by several projects. Each project owns one top-level folder, and
the website serves only its `public/` subfolder at `/data/<project>/`
(`site/functions/data/[[path]].js`).

```
spikinglabs-car-ev/
  charging-prices/              this pipeline (--prefix)
    raw/                        source data exactly as fetched
      ocpdb/<dataset>/YYYY/MM/DD/<ts>.jsonl.gz
      ocpdb/evse_status/YYYY/MM/DD/<ts>.csv.gz
      ocpdb/evse_status_changes/YYYY/MM/DD/<ts>.csv.gz
      bnetza/register/<file>
    derived/                    processed tables (tariffs/YYYY/MM/DD/<ts>.csv.gz)
    public/                     -> cars.allo.land/data/charging-prices/
    state/                      bookkeeping between runs
    runs/YYYY/MM/DD/            one report per run
  <other-project>/              same pattern: raw/, derived/, public/, state/, runs/
```

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
