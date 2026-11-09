// Time range under monthly charts (site/public/assets/range.js): axis labels and month maths.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

global.document = { documentElement: { lang: "en" } };
global.window = {};
require(path.join(__dirname, "../public/assets/range.js"));
const R = window.AlloRange;

test("month index round trip", () => {
  assert.equal(R.mon(R.idx("2019-01")), "2019-01");
  assert.equal(R.idx("2020-01") - R.idx("2019-12"), 1);
});

test("eight years: a label every year when there is room, every other year on a phone", () => {
  assert.deepEqual(R.ticks("2019-01", 96, 400).map((x) => x[1]), ["2019", "2020", "2021", "2022", "2023", "2024", "2025", "2026"]);
  const t = R.ticks("2019-01", 96, 300);
  assert.deepEqual(t.map((x) => x[1]), ["2020", "2022", "2024", "2026"]);
  assert.equal(t[0][0], 12);
});

test("one year: every other month on a phone, January as the year", () => {
  const t = R.ticks("2025-11", 12, 300);
  assert.deepEqual(t.map((x) => x[1]), ["Nov", "2026", "Mar", "May", "Jul", "Sept"]);
});

test("a window without a January still gets a label", () => {
  assert.equal(R.ticks("2025-02", 1, 40).length, 1);
});
