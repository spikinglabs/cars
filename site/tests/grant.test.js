// Run with: node --test site/tests/grant.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const G = require("../public/ev-grant/grant.js");

test("the battery-electric table matches the official one", () => {
  assert.deepEqual(G.table("bev").map((r) => [r.from, r.to, r.amounts]), [
    [0, 45000, [5000, 5500, 6000]],
    [45001, 60000, [4000, 4500, 5000]],
    [60001, 80000, [3000, 3500, 4000]],
    [80001, 85000, [0, 3500, 4000]],
    [85001, 90000, [0, 0, 4000]],
  ]);
});

test("the plug-in hybrid table matches the official one", () => {
  assert.deepEqual(G.table("phev").map((r) => r.amounts), [
    [3500, 4000, 4500],
    [2500, 3000, 3500],
    [1500, 2000, 2500],
    [0, 2000, 2500],
    [0, 0, 2500],
  ]);
});

test("income at a tier edge falls in the lower tier", () => {
  assert.equal(G.compute({ income: 45000 }).amount, 5000);
  assert.equal(G.compute({ income: 45001 }).amount, 4000);
  assert.equal(G.compute({ income: 80000 }).amount, 3000);
  assert.equal(G.compute({ income: 80001 }).amount, 0);
});

test("children raise the cap and the amount, counted up to two", () => {
  const r = G.compute({ income: 88000, kids: 3 });
  assert.equal(r.kids, 2);
  assert.equal(r.cap, 90000);
  assert.equal(r.amount, 4000);
  assert.equal(G.compute({ income: 88000, kids: 1 }).eligible, false);
  assert.deepEqual(G.compute({ income: 88000, kids: 1 }).reasons, ["income_over_cap"]);
});

test("without an income the result is open but shows the most you can get", () => {
  const r = G.compute({ kids: 1 });
  assert.equal(r.eligible, null);
  assert.equal(r.amount, null);
  assert.equal(r.max, 5500);
});

test("plug-in hybrids need 60 g/km or 80 km electric range", () => {
  assert.equal(G.compute({ drive: "phev", income: 50000, co2: 29 }).amount, 2500);
  assert.equal(G.compute({ drive: "phev", income: 50000, co2: 75, range_km: 85 }).amount, 2500);
  const no = G.compute({ drive: "phev", income: 50000, co2: 75, range_km: 60 });
  assert.equal(no.amount, 0);
  assert.deepEqual(no.reasons, ["phev_emissions"]);
  const unknown = G.compute({ drive: "phev", income: 50000 });
  assert.equal(unknown.amount, 2500, "an unknown car does not block the estimate");
  assert.deepEqual(unknown.reasons, ["phev_unknown"]);
  assert.equal(G.phevOk(75, null), null, "high CO2 without a range is not a no yet");
});

test("registration date sets the deadlines and the window", () => {
  const r = G.compute({ income: 40000, reg: "2026-03-31" });
  assert.equal(r.apply_by, "2027-03-31");
  assert.equal(r.keep_until, "2029-03-31");
  assert.equal(G.addMonths("2026-01-31", 1), "2026-02-28");
  assert.deepEqual(G.compute({ income: 40000, reg: "2025-12-20" }).reasons, ["registered_too_early"]);
  assert.equal(G.compute({ income: 40000, reg: "2025-12-20" }).amount, 0);
  assert.deepEqual(G.compute({ drive: "phev", co2: 20, income: 40000, reg: "2027-07-01" }).reasons, ["phev_too_late"]);
});
