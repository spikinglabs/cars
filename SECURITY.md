# Security policy

Please do not report security problems in public issues.

Report them privately instead:

- Through GitHub: the **Security** tab of this repository → **Report a vulnerability**, or
- By email to hi@spikinglabs.com.

Tell us what you found, how to reproduce it, and which part is affected (the car-mcp server, the cars.allo.land site
or its hosted MCP at `/mcp`, or a data pipeline). We aim to reply within a week.

## Scope

- **car-mcp** keeps your logbook in a local SQLite file and sends nothing anywhere, except the online lookup tools,
  which call cars.allo.land.
- **cars.allo.land** and its `/mcp` endpoint are read-only and need no account.
- Credentials for Cloudflare and R2 live only in GitHub Actions secrets. If you ever find one in this repository or
  its history, please tell us right away.
