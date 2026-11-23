// Leasing mileage (site/public/leasing/lease.js): plan, allowance, checkpoints and settlement.
// Run with: node --test site/tests/lease.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../public/leasing/lease.js");

test("usage scenarios add up to km a year", () => {
  const p = L.plan([{ label: "Commute", km: 40, n: 5, per: "wk" }, { label: "Holiday", km: 2400, n: 1, per: "y" }, { label: "Weekend", km: 120, n: 2, per: "m" }]);
  assert.equal(p.rows[0].year, 40 * 5 * 46);
  assert.equal(p.total, 9200 + 2400 + 2880);
});

test("recommendation adds the margin and rounds up to offer steps", () => {
  const r = L.recommend(14480, 10);
  assert.equal(r.with_margin, 15928);
  assert.equal(r.step_2500, 17500);
  assert.equal(r.step_5000, 20000);
  assert.equal(L.recommend(0, 10).step_2500, 2500);
});

test("settlement charges extra km and refunds unused km beyond the tolerance", () => {
  const c = { extra: 0.1, refund: 0.05, tol: 2500 };
  assert.equal(L.settle(2000, c), 0);
  assert.equal(L.settle(4500, c), 200);
  assert.equal(L.settle(-5000, c), -125);
});

test("allowance options: too few km costs more than too many", () => {
  const o = L.options(15000, L.norm({ start: "2025-01-01", months: 36, km: 15000 }));
  const by = Object.fromEntries(o.map((x) => [x.km, x]));
  assert.equal(by[15000].total_eur, 0);
  assert.equal(by[12500].settlement_eur, 750); // 2,500 km × 3 years × 0.10
  assert.equal(by[12500].rate_eur, -540); // 2.5 × 6 € × 36 months
  assert.equal(by[17500].settlement_eur, -375);
  assert.equal(by[17500].rate_eur, 540);
  assert.ok(by[12500].total_eur > 0 && by[17500].total_eur < by[17500].rate_eur);
});

test("checkpoints: today, month, quarter, year and contract end, with the pace so far", () => {
  const c = { start: "2025-01-01", months: 36, km: 12000, odo0: 10 };
  const t = L.track(c, [{ date: "2025-11-01", km: 11010 }], { today: "2025-11-20" });
  assert.equal(t.contract.end, "2028-01-01");
  assert.deepEqual(t.checkpoints.map((x) => x.id), ["today", "month", "quarter", "end"]);
  assert.deepEqual(t.checkpoints[2].also, ["year"]); // 31 Dec is the end of the quarter and the year
  assert.equal(t.checkpoints[1].date, "2025-11-30");
  assert.equal(t.per_month_source, "pace");
  // 11,000 km in 304 days
  assert.equal(t.pace_so_far_per_month, Math.round(11000 / 304 * 365.25 / 12));
  const end = t.checkpoints[3];
  assert.equal(end.allowed_km, 36010);
  assert.ok(end.diff_km > 0, "driving 1,100 km a month on a 1,000 km plan runs over");
  assert.equal(t.end.settlement_eur, Math.round(end.diff_km * 0.1));
});

test("a set monthly distance replaces the pace, and the budget to stay within shows", () => {
  const c = { start: "2025-01-01", months: 24, km: 10000 };
  const t = L.track(c, [{ date: "2026-01-01", km: 9000 }], { today: "2026-01-01", per_month: 500 });
  assert.equal(t.per_month_source, "set");
  assert.equal(t.left_km, 11000);
  assert.equal(t.end.expected_km, 9000 + Math.round(500 * 12 * 365 / 365.25));
  assert.equal(t.per_month_to_stay_within, Math.round(11000 / (365 / (365.25 / 12))));
});

test("checkpoints after the contract end fall away; no reading uses the plan", () => {
  const t = L.track({ start: "2023-03-15", months: 36, km: 15000 }, [], { today: "2026-03-01", plan_year: 18000 });
  assert.equal(t.contract.end, "2026-03-15");
  assert.deepEqual(t.checkpoints.map((x) => x.id), ["today", "end"]);
  assert.equal(t.per_month_source, "plan");
  assert.equal(L.addMonths(L.day("2024-01-31"), 1), L.day("2024-02-29"));
  assert.equal(L.track({ months: 36 }, []), null);
});

test("gapSvg draws km over or under the allowance, shaded, with today and end labels", () => {
  const s = L.series({ start: "2026-11-01", months: 36, km: 7500, odo0: 0 }, [{ date: "2026-11-23", km: 848 }], { today: "2026-11-23", per_month: 700 });
  const svg = L.gapSvg(s, { id: "t", today: L.day("2026-11-23"), words: { allow: "allowance", today: "Today", end: "End" } });
  assert.match(svg, /^<svg class="gap"/);
  assert.match(svg, /class="g-over"/);
  assert.match(svg, /Today \+396 km/);
  assert.match(svg, /End \+\d+ km/);
  assert.doesNotMatch(L.gapSvg(s, { id: "t", labels: false }), /g-lab/);
});
