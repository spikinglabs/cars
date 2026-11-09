/* Cost over the years: an electric car against a fuel car, purchase price minus the grant, energy and
   German vehicle tax (Kfz-Steuer), year by year, and when the electric car has paid off.
   Used by /ev-cost/ in the browser, by the hosted MCP server (site/lib/mcp-tools.js) and by tests in Node.
   No DOM, no network. When the tax rules change, change TAX and TAX.as_of.

   Sources (checked 2026-11-09):
   - Kraftfahrzeugsteuergesetz §9 (1) 2c, cars first registered from 2021: https://www.gesetze-im-internet.de/kraftstg/__9.html
   - Electric cars: exempt for up to ten years, at most until 31 Dec 2035, when first registered by 31 Dec 2030
     (KraftStG §3d as amended in December 2025): https://www.bundesregierung.de/breg-de/bundesregierung/bundeskanzleramt/e-autos-steuerfrei-2389328 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.EvYears = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var TAX = {
    as_of: "2026-11-09",
    // per started 100 cm³ of engine size
    per_100ccm: { petrol: 2, diesel: 9.5 },
    // CO2 part: g/km above 95, each band at its own rate per g/km
    co2_free: 95,
    co2_bands: [[115, 2], [135, 2.2], [155, 2.5], [175, 2.9], [195, 3.4], [Infinity, 4]],
    ev_registered_by: "2030-12-31",
    ev_exempt_until: "2035-12-31",
    ev_exempt_years: 10,
    sources: [
      "https://www.gesetze-im-internet.de/kraftstg/__9.html",
      "https://www.bundesregierung.de/breg-de/bundesregierung/bundeskanzleramt/e-autos-steuerfrei-2389328"
    ]
  };

  /* Engine size and official CO2 (WLTP, g/km) of the fuel cars on /ev-cost/ (ids from calc.js), rounded from
     the makers' figures for the most common version. Only used for the tax. */
  var FUEL_TAX_DATA = {
    golf: { ccm: 1498, co2: 125 }, troc: { ccm: 1498, co2: 135 }, tiguan: { ccm: 1968, co2: 150 },
    corsa: { ccm: 1199, co2: 120 }, octavia: { ccm: 1968, co2: 120 }, passat: { ccm: 1968, co2: 130 },
    cx30: { ccm: 2488, co2: 145 }, cx5: { ccm: 2488, co2: 165 }
  };

  var DEFAULTS = { years: 6, km: 12000, ev_price: 36000, fuel_price: 32000, ccm: 1500, co2: 130 };

  /* Yearly Kfz-Steuer of a petrol or diesel car first registered from 2021. */
  function fuelTax(fuel, ccm, co2) {
    var base = TAX.per_100ccm[fuel === "diesel" ? "diesel" : "petrol"] * Math.ceil(Math.max(0, Number(ccm) || 0) / 100);
    var g = Math.max(0, Math.round(Number(co2) || 0)), from = TAX.co2_free, part = 0;
    for (var i = 0; i < TAX.co2_bands.length && g > from; i++) {
      var to = TAX.co2_bands[i][0];
      part += (Math.min(g, to) - from) * TAX.co2_bands[i][1];
      from = to;
    }
    return Math.round((base + part) * 100) / 100;
  }

  /* compare({ years, km, ev_price, grant, ev_per_100, fuel_price, fuel_per_100, fuel, ccm, co2 })
     -> { years: [{ year, ev, fuel, diff }], ev_tax, fuel_tax, ev_energy_year, fuel_energy_year,
          ev_start, fuel_start, total_ev, total_fuel, saving, payback_years }
     Amounts are cumulative totals at the end of each year: purchase (EV minus grant) plus energy and tax.
     payback_years is when the electric car's total drops below the fuel car's (null if not within the years;
     0 if it is cheaper from the start). Not included: insurance, servicing, tyres, resale value. */
  function compare(o) {
    o = o || {};
    var n = Math.max(1, Math.min(15, Math.round(Number(o.years) || DEFAULTS.years)));
    var km = Math.max(0, Number(o.km) || 0);
    var evStart = Math.max(0, (Number(o.ev_price) || 0) - Math.max(0, Number(o.grant) || 0));
    var fuelStart = Math.max(0, Number(o.fuel_price) || 0);
    var evYear = km / 100 * (Number(o.ev_per_100) || 0);
    var fuelYear = km / 100 * (Number(o.fuel_per_100) || 0);
    var ft = fuelTax(o.fuel, o.ccm, o.co2);
    var evTax = 0; // exempt for the whole horizon when bought now (registered by 2030, ten years, until 2035)
    var rows = [], payback = evStart <= fuelStart ? 0 : null;
    var gap0 = evStart - fuelStart, perYear = (fuelYear + ft) - (evYear + evTax);
    for (var y = 1; y <= n; y++) {
      var ev = evStart + y * (evYear + evTax), fu = fuelStart + y * (fuelYear + ft);
      rows.push({ year: y, ev: Math.round(ev), fuel: Math.round(fu), diff: Math.round(fu - ev) });
    }
    if (payback == null && perYear > 0) {
      var t = gap0 / perYear;
      if (t <= n) payback = Math.round(t * 10) / 10;
    }
    var last = rows[rows.length - 1];
    return {
      years: rows, ev_tax: evTax, fuel_tax: ft,
      ev_energy_year: Math.round(evYear), fuel_energy_year: Math.round(fuelYear),
      ev_start: Math.round(evStart), fuel_start: Math.round(fuelStart),
      saving_per_year: Math.round(perYear),
      total_ev: last.ev, total_fuel: last.fuel, saving: last.diff, payback_years: payback
    };
  }

  return { TAX: TAX, FUEL_TAX_DATA: FUEL_TAX_DATA, DEFAULTS: DEFAULTS, fuelTax: fuelTax, compare: compare };
});
