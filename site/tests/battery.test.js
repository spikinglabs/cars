// Run with: node --test site/tests/battery.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const B = require("../public/recalls/battery.js");

test("every brand has sane terms and its own recall-page slugs", () => {
  const seen = new Set();
  for (const w of B.WARRANTY) {
    assert.ok(w.years >= 5 && w.years <= 10, w.brand);
    assert.ok(w.km >= 100000 && w.km <= 250000, w.brand);
    assert.ok(w.soh >= 60 && w.soh <= 80, w.brand);
    for (const s of w.slugs) { assert.ok(!seen.has(s), s); seen.add(s); }
    if (w.note) assert.ok(B.NOTES[w.note], w.note);
  }
  assert.equal(B.forBrand("vw-volkswagen").brand, "VW");
  assert.equal(B.forBrand("unknown"), null);
});

test("cover: years and km both count", () => {
  assert.deepEqual(B.cover("tesla", 2020, null, 2026), { warranty: B.forBrand("tesla"), covered: true, until_year: 2028, years_left: 2, km_left: null });
  assert.equal(B.cover("tesla", 2020, 170000, 2026).covered, false);
  assert.equal(B.cover("kia", 2018, 10000, 2026).covered, false);
  assert.equal(B.cover("kia", null, null, 2026).covered, null);
  assert.equal(B.cover("lada", 2024, 0, 2026).warranty, null);
});
