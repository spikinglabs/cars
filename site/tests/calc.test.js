// Run with: node --test site/tests/calc.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("../public/ev-cost/calc.js");

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test("cost per 100 km includes charging losses", () => {
  close(E.evCost(16, 0.35, 10), 6.16);
  close(E.evCost(16, 0.35, 0), 5.6);
});

test("break-even price matches the petrol cost", () => {
  const p = E.breakEven(16, 10, 6, 1.75);
  close(E.evCost(16, p, 10), E.fuelCost(6, 1.75));
});

test("compute sorts rows and skips the own car as a reference", () => {
  const r = E.compute({ ...E.DEFAULTS, refs: ["Volvo EX30", "Kia EV6"] });
  close(r.costTypical, 6.16);
  close(r.per1000, 61.6);
  assert.equal(r.rows.filter((x) => x.kind === "ref").length, 1);
  const costs = r.rows.map((x) => x.cost);
  assert.deepEqual(costs, [...costs].sort((a, b) => a - b));
});

test("every catalog car has four increasing levels", () => {
  for (const [name, ...lv] of E.CATALOG) {
    assert.equal(lv.length, 4, name);
    for (let i = 1; i < 4; i++) assert.ok(lv[i] > lv[i - 1], name);
  }
});
