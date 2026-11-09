// Run with: node --test site/tests/years.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const Y = require("../public/ev-cost/years.js");

test("Kfz-Steuer follows the bands for cars registered from 2021", () => {
  // 15 × 2 € + 20 g × 2 € + 10 g × 2.20 €
  assert.equal(Y.fuelTax("petrol", 1498, 125), 92);
  // diesel: 20 × 9.50 € + 20 × 2 + 20 × 2.2 + 10 × 2.5
  assert.equal(Y.fuelTax("diesel", 1968, 145), 299);
  assert.equal(Y.fuelTax("petrol", 999, 90), 20, "no CO2 part at or below 95 g/km");
  // above 195 g/km every gram costs 4 €
  assert.equal(Y.fuelTax("petrol", 2000, 200), 40 + 40 + 44 + 50 + 58 + 68 + 20);
});

test("payback comes when the yearly saving has covered the higher price", () => {
  const r = Y.compare({ years: 8, km: 10000, ev_price: 40000, grant: 4000, ev_per_100: 6, fuel_price: 32000, fuel_per_100: 14, fuel: "petrol", ccm: 1498, co2: 125 });
  assert.equal(r.ev_start, 36000);
  assert.equal(r.ev_energy_year, 600);
  assert.equal(r.fuel_energy_year, 1400);
  assert.equal(r.fuel_tax, 92);
  assert.equal(r.saving_per_year, 892);
  assert.equal(r.payback_years, 4.5);
  assert.equal(r.years.length, 8);
  assert.equal(r.years[0].ev, 36600);
  assert.equal(r.saving, r.total_fuel - r.total_ev);
});

test("no payback within the years, or cheaper from the start", () => {
  assert.equal(Y.compare({ years: 4, km: 5000, ev_price: 50000, ev_per_100: 6, fuel_price: 30000, fuel_per_100: 12 }).payback_years, null);
  assert.equal(Y.compare({ ev_price: 30000, grant: 3000, fuel_price: 28000, ev_per_100: 6, fuel_per_100: 12 }).payback_years, 0);
  assert.equal(Y.compare({ years: 99 }).years.length, 15);
});
