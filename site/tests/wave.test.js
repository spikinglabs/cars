// Run with: node --test site/tests/wave.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const W = require("../public/registrations/wave.js");

const rows = [
  { month: "2025-01", total: 200, bev: 20 }, { month: "2025-02", total: 200, bev: 30 }, { month: "2025-03", total: 200, bev: 40 },
  { month: "2025-12", total: 100, bev: 20 },
  { month: "2026-01", total: 200, bev: 50 }, { month: "2026-02", total: 200, bev: 60 }, { month: "2026-03", total: 200, bev: 80 },
];

test("summarize: latest month, year to date and since the grant", () => {
  const s = W.summarize(rows);
  assert.equal(s.month, "2026-03");
  assert.equal(s.share, 40);
  assert.equal(s.share_year_ago, 20);
  assert.equal(s.bev_change_pct, 100);
  assert.deepEqual([s.ytd.bev, s.ytd.bev_prev, s.ytd.change_pct, s.ytd.months], [190, 90, 111.1, 3]);
  assert.equal(s.since_grant.bev, 190);
  assert.equal(s.since_grant.share_before, 15.7); // 110 of 700 in the twelve months before
  assert.deepEqual(s.record, { month: "2026-03", share: 40 });
  assert.equal(W.summarize([]), null);
});

test("growth: last three months against a year before, most extra cars first", () => {
  const g = W.growth([
    { slug: "a", months: [{ month: "2025-03", bev: 100 }, { month: "2026-03", bev: 150 }] },
    { slug: "b", months: [{ month: "2026-01", bev: 80 }, { month: "2026-02", bev: 90 }] },
    { slug: "c", months: [{ month: "2025-02", bev: 50 }, { month: "2026-02", bev: 10 }] },
  ], "2026-03");
  assert.deepEqual(g.map((r) => [r.slug, r.extra, r.is_new]), [["b", 170, true], ["a", 50, false]]);
  assert.equal(g[1].change_pct, 50);
  const launch = W.growth([{ slug: "d", months: [{ month: "2025-03", bev: 3 }, { month: "2026-03", bev: 900 }] }], "2026-03");
  assert.deepEqual([launch[0].is_new, launch[0].change_pct], [true, null]);
});
