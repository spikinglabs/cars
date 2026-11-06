# Charging data collector

Builds a history of German EV charging prices (and charger status) from open data,
because no public archive of past prices exists. Runs on GitHub Actions and stores
everything in the Cloudflare R2 bucket `spikinglabs-cars-charging-data`.

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

Storage layout is documented at the top of `collect.py`. Only `public/` is served by the
website (`site/functions/data/[[path]].js`), and only sources with an open licence go there.

## Cost

Built to stay at zero: public repo (free Actions minutes), R2 free tier (10 GB storage,
1M writes/month; expected use about 2 GB/year and ~15k writes/month), Pages free tier.

## Run locally

```sh
python -m pipelines.charging_prices.collect --tier hourly --local ./out
python -m unittest discover -s pipelines/charging_prices/tests -t .
```

## Secrets

| Secret | What |
| --- | --- |
| `R2_ACCOUNT_ID` | Cloudflare account id |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | R2 API token (Object Read & Write on the bucket) |
| `CLOUDFLARE_API_TOKEN` | API token with Cloudflare Pages: Edit (site deploy) |
