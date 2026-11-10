# collect-cron

A Cloudflare Worker with one Cron Trigger (every hour at :37 UTC) that starts the
collector workflows in `.github/workflows/` through the GitHub API (`workflow_dispatch`).
GitHub's own `schedule:` triggers are best effort and dropped most runs, so the
workflows no longer have one. When each workflow runs is in `SCHEDULE` in `src/index.js`.

Free: one cron trigger and ~24 requests a day on the Workers free plan; Actions minutes
are free on this public repository.

Setup (once):
1. Create a fine-grained GitHub token: repository `spikinglabs/cars`, permission
   "Actions: Read and write". Add it as the repository secret `GH_DISPATCH_TOKEN`.
2. `CLOUDFLARE_API_TOKEN` needs "Workers Scripts: Edit" on the account.
3. Push to main (or run "Deploy collect cron" by hand); the workflow deploys the Worker
   and stores the token as its `GITHUB_TOKEN` secret.

Logs: Cloudflare dashboard, Workers, `allo-cars-collect-cron`, Logs. A failed start
(for example an expired token) shows as an error there.

Test: `node --test workers/collect-cron/tests/schedule.test.js`
