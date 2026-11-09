# MCP usage log

How the hosted MCP server at `https://cars.allo.land/mcp` is used, kept for later analysis at no cost.

**Writing.** Each POST to `/mcp` writes one small NDJSON object to the EV bucket (binding `DATA`):
`mcp-usage/raw/<day>/<time>-<random>.ndjson`, one line per JSON-RPC request. The fields, and how arguments are
cleaned, are listed at the top of `site/lib/mcp-usage.js`. In short: time, method, tool, cleaned arguments (car
models and towns kept, positions rounded to about 10 km, postcodes cut to two digits, e-mails, VINs and long
numbers removed), client name and version from `initialize`, the first User-Agent token, country, latency, and
whether it failed. No IP address, no session or user ID, nothing from the answer. Nothing under `mcp-usage/` is
served on the web (only `<project>/public/` is).

**Admin page.** On cars.allo.land the function also adds daily counts per country to the shared Allo usage
counter (monitoring.admin.allo.land, site "Allo Cars connector (MCP)"): `session` per `initialize`,
`tool_<name>` per tool call, `error` per failure. It goes through the service binding `COUNT` in
`site/wrangler.toml` to the `Counter` entrypoint of the `allo-count` Worker (spikinglabs/alloland-rebirth,
`workers/count`); that Worker must be deployed with the entrypoint before this binding is.

**Rollup.** `.github/workflows/rollup-mcp-usage.yml` runs daily at 00:40 UTC:

- `mcp-usage/derived/daily/<day>.ndjson`: every line of the day, sorted by time (production and previews, field `site`)
- `mcp-usage/derived/summary.json`: per day (production only) requests, sessions (`initialize` calls), tool
  calls, errors, calls per tool, clients, user agents, countries, p50/p95 latency
- the run page shows the last 14 days as a table

**Analysis.** Copy the files locally (same R2 credentials as the collectors) and query them, e.g. with DuckDB:

    python -m pipelines.mcp_usage.rollup --r2 "$R2_BUCKET" --pull ./mcp-usage
    duckdb -c "select tool, count(*) n, median(ms) from read_json_auto('mcp-usage/derived/daily/*.ndjson')
               where method = 'tools/call' and site = 'prod' group by 1 order by 2 desc"

**Cost.** One R2 write per request (class A, 1 million a month free for the whole account) and a few reads and
one delete batch per day for the rollup. If traffic ever gets near that, sample in `saveUsage` or move to
Workers Analytics Engine. To stop logging, add `[vars]` with `MCP_USAGE = "off"` to `site/wrangler.toml`
(it is the project's config, so the dashboard's variables are read-only) and deploy.

    python -m pipelines.mcp_usage.rollup --local ./out --today 2026-11-09
    python -m unittest discover -s pipelines/mcp_usage/tests -t .
    node --test site/tests/mcp-usage.test.js
