// Tests for site/public/assets/poster.js: the figures on a share poster and the winners of a head to head.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function load() {
  const ctx = { localStorage: { getItem: () => null, setItem: () => {} }, dispatchEvent: () => {}, CustomEvent: function () {} };
  ctx.window = ctx;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../public/assets/garage.js"), "utf8"), ctx);
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../public/assets/poster.js"), "utf8"), ctx);
  return ctx;
}
const { AlloGarage: G, AlloPoster: P } = load();
const prices = { fuel: { products: { euro_super_95: { eur_per_litre: 1.8 }, diesel: { eur_per_litre: 1.7 } } }, charge: { overall: { median: 0.6 } } };
const regs = { models: [{ brand: "VW", model: "GOLF", last_12_months: 88000 }, { brand: "VOLVO", model: "EX30", last_12_months: 7200 }, { brand: "VW", model: "SONSTIGE", last_12_months: 5 }] };
const ratings = { euro_ncap: { models: [
  { make: "Volvo", model: "EX30", stars: 5, year: 2024, url: "u", child: { protocol: "2023-2025", occupant_pct: 85 } },
  { make: "Volkswagen", model: "Golf", stars: 5, year: 2025, url: "u", child: { protocol: "2023-2025", occupant_pct: 86 } },
  { make: "Volvo", model: "XC60", stars: 5, year: 2017, url: "u", child: { protocol: "2017", occupant_pct: 87 } },
] } };
const ex30 = { id: "volvo-ex30", make: "Volvo", model: "EX30", name: "Volvo EX30", fuel: "electric", kwh_per_100km: 17.2, co2_g_km: 0, power_kw: 230, mass_kg: 1876, range_km: 443 };
const golf = { id: "vw-golf-petrol", make: "VW", model: "Golf", name: "VW Golf", fuel: "petrol", l_per_100km: 6, co2_g_km: 137, power_kw: 135, mass_kg: 1408 };
const xc60 = { id: "volvo-xc60-phev-petrol", make: "Volvo", model: "XC60", name: "Volvo XC60", fuel: "phev-petrol", l_per_100km: 1.3, kwh_per_100km: 20, co2_g_km: 30, power_kw: 212, range_km: 76 };
const ctx = (lang) => ({ G, prices, regs, ratings, lang });

test("one car: official figures, today's cost, Euro NCAP and registrations", () => {
  const f = P.facts(ex30, ex30, ctx("en"));
  assert.strictEqual(f.fuelLabel, "Electric");
  assert.strictEqual(f.metrics.range.value, 443);
  assert.strictEqual(f.metrics.cost100.text, "€6.62"); // 17.2 kWh x 1.1 losses x €0.35
  assert.strictEqual(f.metrics.power.sub, "313 PS");
  assert.strictEqual(f.metrics.euro.stars, 5);
  assert.strictEqual(f.metrics.kid.value, 85);
  assert.strictEqual(f.metrics.regs.value, 7200);
  assert.strictEqual(f.metrics.co2, undefined, "no CO2 tile for 0 g/km");
  assert.strictEqual(P.hero(f).key, "range", "an electric car leads with its range");
  assert.ok(!P.oneList(f).some((m) => m.key === "range"), "the hero is not repeated in the tiles");
});

test("fuel cars lead with the cost of 100 km, in the page's language", () => {
  const f = P.facts(golf, golf, ctx("de"));
  assert.strictEqual(P.hero(f).key, "cost100");
  assert.strictEqual(f.metrics.cost100.text.replace(/\s/g, " "), "10,80 €");
  assert.strictEqual(f.metrics.regs.text, "88.000");
  assert.strictEqual(f.metrics.cons.unit, "l/100 km");
});

test("a version's figures replace the model's, ratings stay per model", () => {
  const v = { trim: "Plus", power_kw: 315 };
  const f = P.facts({ ...ex30, power_kw: 315 }, ex30, ctx("zh"), v);
  assert.strictEqual(f.metrics.power.value, 315);
  assert.strictEqual(f.version, "Plus · 315 kW");
  assert.strictEqual(f.metrics.euro.year, 2024);
});

test("head to head marks a winner only where figures compare", () => {
  const a = P.facts(golf, golf, ctx("en")), b = P.facts(ex30, ex30, ctx("en"));
  const d = P.duel(a, b);
  const row = (k) => d.rows.find((r) => r.key === k);
  assert.strictEqual(row("cost100").win, 1, "cheaper per 100 km wins");
  assert.strictEqual(row("power").win, 1);
  assert.strictEqual(row("cons").win, -1, "litres and kWh are not compared");
  assert.strictEqual(row("cons").comparable, false);
  assert.strictEqual(row("euro").win, -1, "same stars: no winner");
  assert.strictEqual(row("kid").win, 0, "same protocol: 86 > 85");
  assert.strictEqual(row("kid").a.value, 86);
  assert.strictEqual(row("regs").win, 0);
  assert.strictEqual(row("range"), undefined, "range only when both have one");
  assert.strictEqual(row("mass").win, -1, "weight has no winner");
  assert.deepStrictEqual(Array.from(d.wins), [2, 2]);
});

test("Euro NCAP results from different protocols are not compared; the score counts only rows shown", () => {
  const a = P.facts(xc60, xc60, ctx("en")), b = P.facts(ex30, ex30, ctx("en"));
  const d = P.duel(a, b);
  assert.strictEqual(d.rows.find((r) => r.key === "kid").win, -1);
  assert.strictEqual(d.rows.find((r) => r.key === "euro").comparable, false);
  const short = P.duel(a, b, 2);
  assert.strictEqual(short.rows.length, 2);
  assert.ok(short.wins[0] + short.wins[1] <= 2);
});

test("poster sizes for Xiaohongshu, Instagram and square", () => {
  assert.deepStrictEqual(Array.from(P.SIZES.xhs), [1080, 1440]);
  assert.deepStrictEqual(Array.from(P.SIZES.ig), [1080, 1350]);
  assert.deepStrictEqual(Array.from(P.SIZES.sq), [1080, 1080]);
});
