// Run with: node --test site/tests/here.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const H = require("../public/chargers/here.js");

const at = (dLatKm, kw, points, flags = 0) => ({ lat: 50 + dLatKm / 111.2, lon: 7, kw, points, flags });

test("plenty of points close by and a fast charger within 3 km is easy", () => {
  const r = H.summarize([at(0.2, 22, 4), at(0.8, 11, 2), at(2.5, 150, 4)], 50, 7);
  assert.equal(r.points_1km, 6);
  assert.equal(r.locations_1km, 2);
  assert.equal(r.points_3km, 10);
  assert.equal(r.fast_points_3km, 4);
  assert.ok(Math.abs(r.nearest_fast_km - 2.5) < 0.02);
  assert.equal(r.verdict, "easy");
});

test("customer-only chargers do not count", () => {
  const r = H.summarize([at(0.2, 22, 10, 8), at(0.3, 150, 4, 8)], 50, 7);
  assert.equal(r.points_1km, 0);
  assert.equal(r.nearest_fast_km, null);
  assert.equal(r.verdict, "hard");
});

test("a fast charger within 5 km alone is ok", () => {
  assert.equal(H.summarize([at(4.5, 50, 2)], 50, 7).verdict, "ok");
  assert.equal(H.summarize([at(0.5, 11, 2)], 50, 7).verdict, "ok");
  assert.equal(H.summarize([at(1.5, 11, 8), at(6, 300, 8)], 50, 7).verdict, "hard");
});
