// Starts the collector workflows on time.
//
// GitHub runs `schedule:` triggers on a best-effort basis and drops many of them
// (the hourly charging run fired about 5 times a day, the daily and weekly tiers
// never). This Worker has one Cloudflare Cron Trigger, every hour at :37, and starts
// the workflows due in that hour through the GitHub API (workflow_dispatch), which
// GitHub does not drop. Free plan: one cron trigger, ~24 requests a day.
//
// Secret: GITHUB_TOKEN, a fine-grained token for spikinglabs/cars with
// "Actions: read and write". Set by .github/workflows/deploy-collect-cron.yml.

export const REPO = "spikinglabs/cars";

// hours: UTC hours; weekday: 0 = Sunday ... 6 = Saturday; monthday: day of month.
export const SCHEDULE = [
  { workflow: "collect-charging-data.yml", inputs: { tier: "hourly" }, hours: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22] },
  { workflow: "collect-charging-data.yml", inputs: { tier: "daily" }, hours: [3] },
  { workflow: "collect-charging-data.yml", inputs: { tier: "weekly" }, hours: [5], weekday: 1 },
  { workflow: "rollup-mcp-usage.yml", hours: [0] },
  { workflow: "collect-electricity-prices.yml", hours: [0, 11, 12, 13, 14, 15, 16] },
  { workflow: "collect-recalls.yml", hours: [5] },
  { workflow: "collect-chargers.yml", hours: [5] },
  { workflow: "collect-fuel-prices.yml", hours: [6] },
  { workflow: "collect-registrations.yml", hours: [7] },
  { workflow: "collect-ratings.yml", hours: [4], weekday: 1 },
  { workflow: "collect-vehicle-catalog.yml", hours: [5], monthday: 3 },
];

export function due(date, schedule = SCHEDULE) {
  return schedule.filter(
    (job) =>
      job.hours.includes(date.getUTCHours()) &&
      (job.weekday === undefined || job.weekday === date.getUTCDay()) &&
      (job.monthday === undefined || job.monthday === date.getUTCDate()),
  );
}

export async function dispatch(job, token, fetchFn = fetch) {
  const res = await fetchFn(`https://api.github.com/repos/${REPO}/actions/workflows/${job.workflow}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "allo-cars-collect-cron",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref: "main", inputs: job.inputs || {} }),
  });
  if (res.status !== 204) {
    throw new Error(`${job.workflow} ${JSON.stringify(job.inputs || {})}: HTTP ${res.status} ${await res.text()}`);
  }
}

export default {
  async scheduled(event, env, ctx) {
    const jobs = due(new Date(event.scheduledTime));
    const results = await Promise.allSettled(jobs.map((job) => dispatch(job, env.GITHUB_TOKEN)));
    const failed = results.filter((r) => r.status === "rejected").map((r) => r.reason.message);
    console.log(JSON.stringify({ started: jobs.length - failed.length, failed }));
    if (failed.length) throw new Error(failed.join("; ")); // shows as an error in the Worker's logs
  },
};
