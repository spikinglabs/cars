// Run with: node --test site/tests/calc.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("../public/ev-cost/calc.js");

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test("cost per 100 km includes charging losses", () => {
  close(E.evCost(16, 0.35, 10), 6.16);
  close(E.evCost(16, 0.35, 0), 5.6);
});

test("break-even price matches the fuel cost", () => {
  const p = E.breakEven(16, 10, 6, 1.75);
  close(E.evCost(16, p, 10), E.fuelCost(6, 1.75));
});

test("compute gives a break-even per fuel car, at the chosen driving level", () => {
  const s = { ...E.DEFAULTS, petrol: 2, diesel: 2.2, refs: ["golf", "tiguan"], use: 3 };
  const r = E.compute(s);
  assert.equal(r.kwh, 22);
  close(r.cost, E.evCost(22, 0.35, 10));
  assert.deepEqual(r.rows.map((x) => x.id), ["golf", "tiguan"]);
  const golf = r.rows[0], tiguan = r.rows[1];
  close(golf.cost, 6.5 * 2);
  close(tiguan.cost, 6.5 * 2.2);
  close(E.evCost(22, golf.breakEven, 10), golf.cost);
  close(golf.saving, golf.cost - r.cost);
  assert.equal(golf.levels.length, 4);
  assert.ok(golf.levels[0] > golf.levels[3], "efficient driving breaks even at a higher price than winter");
});

test("own fuel car comes first and unknown refs are skipped", () => {
  const r = E.compute({ ...E.DEFAULTS, refs: ["nope", "corsa"], own: { l: 7.5, fuel: "diesel" } });
  assert.deepEqual(r.rows.map((x) => x.id), ["own", "corsa"]);
  assert.equal(r.rows[0].fuel, "diesel");
  close(r.rows[0].cost, 7.5 * E.DEFAULTS.diesel);
});

test("every EV has four increasing levels and every fuel car is sane", () => {
  for (const [name, ...lv] of E.CATALOG) {
    assert.equal(lv.length, 4, name);
    for (let i = 1; i < 4; i++) assert.ok(lv[i] > lv[i - 1], name);
  }
  for (const c of E.FUEL_CARS) {
    assert.ok(E.FUELS.includes(c.fuel), c.id);
    assert.ok(c.l > 3 && c.l < 12, c.id);
    assert.ok(c.short, c.id);
  }
  for (const id of E.DEFAULTS.refs) assert.ok(E.findFuelCar(id), id);
});

test("levels from an official WLTP figure increase and round to half a kWh", () => {
  assert.deepEqual(E.levelsFromOfficial(17.2), [15.5, 17, 21, 23.5]);
  for (let k = 10; k < 30; k += 0.7) {
    const lv = E.levelsFromOfficial(k);
    for (let i = 1; i < 4; i++) assert.ok(lv[i] > lv[i - 1], String(k));
  }
});

test("every built-in car has an id in the official catalog", () => {
  for (const [name] of E.CATALOG) assert.match(E.OFFICIAL_IDS[name] || "", /^[a-z0-9-]+$/, name);
});
