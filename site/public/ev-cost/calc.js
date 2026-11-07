/* EV charging cost: the pure calculation behind /ev-cost/.
   Used by the page in the browser and by tests in Node. No DOM, no network. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.EvCost = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* Rough real-world consumption in kWh/100 km: [efficient, typical, motorway 120 km/h, winter].
     Estimates for comparison, not manufacturer figures. */
  var CATALOG = [
    ["Volvo EX30", 14.5, 16, 19.5, 22],
    ["Tesla Model 3 RWD", 12.5, 14, 17, 19.5],
    ["Tesla Model Y", 14, 16, 19.5, 22],
    ["Hyundai Ioniq 6", 13, 14.5, 17.5, 20],
    ["Hyundai Kona Electric", 13.5, 15, 18.5, 21],
    ["Kia EV6", 15.5, 17.5, 21, 24],
    ["VW ID.3", 14, 15.5, 19, 21.5],
    ["VW ID.4", 15.5, 17.5, 21, 24],
    ["Skoda Enyaq", 15.5, 17.5, 21, 24],
    ["Renault 5 E-Tech", 13, 14.5, 18, 20.5],
    ["Polestar 2", 15, 17, 20.5, 23.5],
    ["BMW iX1", 16, 18, 21.5, 24.5],
    ["BMW i4", 15, 16.5, 20, 22.5],
    ["Mercedes EQA", 15.5, 17.5, 21, 24]
  ];
  var LEVELS = ["Efficient", "Typical", "Motorway", "Winter"];
  var LEVEL_HINTS = ["City and country roads, mild weather", "A normal week of driving", "Steady 120 km/h", "Cold weather, heating on"];

  var DEFAULTS = {
    car: "Volvo EX30",
    lv: [14.5, 16, 19.5, 22],
    p: 0.35,
    loss: 10,
    fl: 6,
    fp: 1.75,
    refs: ["Tesla Model 3 RWD", "VW ID.3", "Kia EV6"]
  };

  function findCar(name) {
    for (var i = 0; i < CATALOG.length; i++) if (CATALOG[i][0] === name) return CATALOG[i];
    return null;
  }

  /* Cost per 100 km for an EV: consumption at the wheel plus charging losses, times the price per kWh. */
  function evCost(kwhPer100, pricePerKwh, lossPct) {
    return kwhPer100 * (1 + (lossPct || 0) / 100) * pricePerKwh;
  }
  /* Cost per 100 km for a combustion car. */
  function fuelCost(litresPer100, pricePerLitre) {
    return litresPer100 * pricePerLitre;
  }
  /* The electricity price at which the EV costs the same per 100 km as the fuel car. */
  function breakEven(kwhPer100, lossPct, litresPer100, pricePerLitre) {
    var k = kwhPer100 * (1 + (lossPct || 0) / 100);
    return k > 0 ? fuelCost(litresPer100, pricePerLitre) / k : null;
  }

  /* Everything the page and an AI need, from one state object. */
  function compute(s) {
    var typical = s.lv[1];
    var rows = [];
    s.lv.forEach(function (v, i) {
      if (v > 0) rows.push({ kind: "mine", level: i, name: s.car + " " + LEVELS[i].toLowerCase(), kwh: v, cost: evCost(v, s.p, s.loss) });
    });
    s.refs.forEach(function (name) {
      var c = findCar(name);
      if (c && name !== s.car) rows.push({ kind: "ref", name: name, kwh: c[2], cost: evCost(c[2], s.p, s.loss) });
    });
    if (s.fl > 0) rows.push({ kind: "fuel", name: "Petrol, " + s.fl + " L at €" + s.fp.toFixed(2), kwh: null, cost: fuelCost(s.fl, s.fp) });
    rows.sort(function (a, b) { return a.cost - b.cost; });
    return {
      costTypical: evCost(typical, s.p, s.loss),
      per1000: evCost(typical, s.p, s.loss) * 10,
      breakEven: s.fl > 0 ? breakEven(typical, s.loss, s.fl, s.fp) : null,
      fuel: s.fl > 0 ? fuelCost(s.fl, s.fp) : null,
      rows: rows
    };
  }

  return { CATALOG: CATALOG, LEVELS: LEVELS, LEVEL_HINTS: LEVEL_HINTS, DEFAULTS: DEFAULTS, findCar: findCar, evCost: evCost, fuelCost: fuelCost, breakEven: breakEven, compute: compute };
});
