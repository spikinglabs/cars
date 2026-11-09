"""Daily rollup of the hosted MCP server's usage log (cars.allo.land/mcp).

The Pages Function writes one small NDJSON object per request (site/lib/mcp-usage.js explains each field):

    mcp-usage/raw/<YYYY-MM-DD>/<HHMMSSmmm>-<random>.ndjson

For every finished day (before today, UTC) this job:

1. merges that day's objects, sorted by time, into ``mcp-usage/derived/daily/<day>.ndjson``
   (appending to the file if an earlier run already wrote part of the day),
2. adds the day's totals to ``mcp-usage/derived/summary.json``,
3. deletes the day's raw objects, but only after both files are written.

Nothing here is public: the /data/ function only serves ``<project>/public/``. Production and PR preview
traffic are both kept (field ``site``); the summary counts only ``prod``.

    python -m pipelines.mcp_usage.rollup --local ./out
    python -m pipelines.mcp_usage.rollup --r2 "$R2_BUCKET"
    python -m pipelines.mcp_usage.rollup --r2 "$R2_BUCKET" --pull ./mcp-usage   # copy daily files here
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from pipelines.charging_prices.storage import LocalStore, PrefixedStore, R2Store

PREFIX = "mcp-usage"
RAW = "raw/"
DAILY = "derived/daily/"
SUMMARY = "derived/summary.json"
TOP = 25  # entries kept per breakdown in the summary


def parse_lines(data: bytes) -> list[dict]:
    out = []
    for line in data.decode("utf-8", "replace").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            ev = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(ev, dict):
            out.append(ev)
    return out


def percentile(values: list[int], q: float) -> int | None:
    if not values:
        return None
    values = sorted(values)
    return values[min(len(values) - 1, int(q * len(values)))]


def top(counter: Counter) -> dict[str, int]:
    return dict(counter.most_common(TOP))


def day_stats(events: list[dict]) -> dict:
    """Totals for one day of production traffic."""
    prod = [e for e in events if e.get("site", "prod") == "prod"]
    calls = [e for e in prod if e.get("method") == "tools/call"]
    clients = Counter()
    for e in prod:
        c = e.get("client")
        if e.get("method") == "initialize" and isinstance(c, dict) and c.get("name"):
            clients[str(c["name"])] += 1
    ms = [e["ms"] for e in calls if isinstance(e.get("ms"), (int, float))]
    return {
        "requests": len(prod),
        "sessions": sum(1 for e in prod if e.get("method") == "initialize"),
        "tool_calls": len(calls),
        "errors": sum(1 for e in prod if e.get("ok") is False),
        "tools": top(Counter(str(e.get("tool")) for e in calls)),
        "tool_errors": top(Counter(str(e.get("tool")) for e in calls if e.get("ok") is False)),
        "methods": top(Counter(str(e.get("method")) for e in prod)),
        "clients": top(clients),
        "user_agents": top(Counter(str(e.get("ua") or "none") for e in prod)),
        "countries": top(Counter(str(e.get("country") or "??") for e in prod)),
        "ms_p50": percentile(ms, 0.5),
        "ms_p95": percentile(ms, 0.95),
        "preview_requests": len(events) - len(prod),
    }


def rollup(store, today: str | None = None) -> list[str]:
    """Merges every finished day; returns the days it rolled up."""
    today = today or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    raw_keys = store.list_keys(RAW)
    by_day: dict[str, list[str]] = {}
    for key in raw_keys:
        day = key[len(RAW) :].split("/", 1)[0]
        if len(day) == 10 and day < today:
            by_day.setdefault(day, []).append(key)

    summary_bytes = store.get(SUMMARY)
    summary = json.loads(summary_bytes) if summary_bytes else {"about": "", "days": {}}
    summary["about"] = (
        "Daily totals of the Allo Cars MCP server (cars.allo.land/mcp), production only. "
        "sessions = initialize requests; clients from initialize; no IPs or user IDs are logged."
    )
    done = []
    for day in sorted(by_day):
        keys = by_day[day]
        events = []
        for key in keys:
            data = store.get(key)
            if data:
                events.extend(parse_lines(data))
        daily_key = f"{DAILY}{day}.ndjson"
        earlier = store.get(daily_key)
        all_events = (parse_lines(earlier) if earlier else []) + events
        all_events.sort(key=lambda e: str(e.get("t", "")))
        body = "".join(json.dumps(e, ensure_ascii=False, separators=(",", ":")) + "\n" for e in all_events)
        store.put(daily_key, body.encode("utf-8"), "application/x-ndjson")
        summary["days"][day] = day_stats(all_events)
        summary["days"] = dict(sorted(summary["days"].items()))
        summary["updated"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
        store.put(SUMMARY, json.dumps(summary, ensure_ascii=False, indent=1).encode("utf-8"), "application/json")
        store.delete(keys)
        done.append(day)
        print(f"{day}: {len(events)} new lines from {len(keys)} objects, {len(all_events)} in the day")
    if not done:
        print("nothing to roll up")
    return done


def markdown(summary: dict, days: int = 14) -> str:
    """A short table for the GitHub job summary: totals only, no arguments."""
    rows = list(summary.get("days", {}).items())[-days:]
    if not rows:
        return "No MCP usage recorded yet.\n"
    lines = [
        "### MCP usage (cars.allo.land/mcp, production)",
        "",
        "| Day | Requests | Sessions | Tool calls | Errors | p50 ms | Top tools | Clients |",
        "|---|---:|---:|---:|---:|---:|---|---|",
    ]
    for day, s in reversed(rows):
        tools = ", ".join(f"{k} {v}" for k, v in list(s.get("tools", {}).items())[:3]) or "–"
        clients = ", ".join(f"{k} {v}" for k, v in list(s.get("clients", {}).items())[:3]) or "–"
        lines.append(
            f"| {day} | {s.get('requests', 0)} | {s.get('sessions', 0)} | {s.get('tool_calls', 0)} | "
            f"{s.get('errors', 0)} | {s.get('ms_p50') if s.get('ms_p50') is not None else '–'} | {tools} | {clients} |"
        )
    return "\n".join(lines) + "\n"


def pull(store, out_dir: Path) -> int:
    """Copies the daily files and the summary to a local folder (only files not there yet, plus the summary)."""
    out_dir.mkdir(parents=True, exist_ok=True)
    n = 0
    for key in store.list_keys(DAILY) + [SUMMARY]:
        target = out_dir / key
        if target.exists() and key != SUMMARY:
            continue
        data = store.get(key)
        if data is None:
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        n += 1
    return n


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    where = ap.add_mutually_exclusive_group(required=True)
    where.add_argument("--local", help="folder standing in for the bucket")
    where.add_argument("--r2", help="R2 bucket name (needs R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)")
    ap.add_argument("--prefix", default=PREFIX, help="top-level folder in the bucket")
    ap.add_argument("--today", help="treat this day (YYYY-MM-DD) as today, for tests")
    ap.add_argument("--pull", help="after the rollup, copy daily files and the summary into this folder")
    args = ap.parse_args(argv)

    inner = LocalStore(args.local) if args.local else R2Store(args.r2)
    store = PrefixedStore(inner, args.prefix)
    rollup(store, args.today)
    summary_bytes = store.get(SUMMARY)
    if summary_bytes and os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as f:
            f.write(markdown(json.loads(summary_bytes)))
    if args.pull:
        print(f"pulled {pull(store, Path(args.pull))} files into {args.pull}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
