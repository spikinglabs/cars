/* EV charging cost: the pure calculation behind /ev-cost/.
   Used by the page in the browser and by tests in Node. No DOM, no network. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.EvCost = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* Electric cars. Rough real-world consumption in kWh/100 km at the battery:
     [efficient, typical, motorway 120 km/h, winter]. Estimates for comparison, not manufacturer figures. */
  var CATALOG = [
    ["Volvo EX30", 14.5, 16, 19.5, 22],
    ["Tesla Model 3 RWD", 12.5, 14, 17, 19.5],
    ["Tesla Model Y", 14, 16, 19.5, 22],
    ["VW ID.3", 14, 15.5, 19, 21.5],
    ["VW ID.4", 15.5, 17.5, 21, 24],
    ["VW ID.7", 14, 16, 19, 22],
    ["Skoda Elroq", 14.5, 16.5, 20, 23],
    ["Skoda Enyaq", 15.5, 17.5, 21, 24],
    ["Cupra Born", 14, 15.5, 19, 21.5],
    ["BMW iX1", 16, 18, 21.5, 24.5],
    ["BMW i4", 15, 16.5, 20, 22.5],
    ["Mercedes EQA", 15.5, 17.5, 21, 24],
    ["Audi Q4 e-tron", 16, 18, 21.5, 24.5],
    ["Hyundai Ioniq 5", 15.5, 17.5, 21, 24],
    ["Hyundai Ioniq 6", 13, 14.5, 17.5, 20],
    ["Hyundai Kona Electric", 13.5, 15, 18.5, 21],
    ["Kia EV3", 14, 15.5, 19, 21.5],
    ["Kia EV6", 15.5, 17.5, 21, 24],
    ["Renault 5 E-Tech", 13, 14.5, 18, 20.5],
    ["Renault Megane E-Tech", 14, 15.5, 19, 21.5],
    ["Fiat 500e", 12.5, 13.5, 17.5, 19],
    ["Polestar 2", 15, 17, 20.5, 23.5],
    ["BYD Dolphin", 14, 15.5, 19, 21.5],
    ["MG4", 14.5, 16, 19.5, 22]
  ];
  /* The same cars in the official catalog (/data/vehicle-catalog/<region>/electric.json, built from the EEA CO2
     monitoring of new cars), so the page can show each car's official WLTP figure next to the estimates. */
  var OFFICIAL_IDS = {
    "Volvo EX30": "volvo-ex30", "Tesla Model 3 RWD": "tesla-model-3", "Tesla Model Y": "tesla-model-y",
    "VW ID.3": "vw-id-3", "VW ID.4": "vw-id-4", "VW ID.7": "vw-id-7", "Skoda Elroq": "skoda-elroq",
    "Skoda Enyaq": "skoda-enyaq", "Cupra Born": "cupra-born", "BMW iX1": "bmw-ix1", "BMW i4": "bmw-i4",
    "Mercedes EQA": "mercedes-benz-eqa", "Audi Q4 e-tron": "audi-q4", "Hyundai Ioniq 5": "hyundai-ioniq-5",
    "Hyundai Ioniq 6": "hyundai-ioniq-6", "Hyundai Kona Electric": "hyundai-kona", "Kia EV3": "kia-ev3",
    "Kia EV6": "kia-ev6", "Renault 5 E-Tech": "renault-5", "Renault Megane E-Tech": "renault-megane",
    "Fiat 500e": "fiat-500", "Polestar 2": "polestar-2", "BYD Dolphin": "byd-dolphin", "MG4": "mg-mg4"
  };
  /* For any other electric car, the four levels come from its official WLTP figure (kWh/100 km at the plug).
     Against the estimates above, a normal week at the battery is close to the WLTP figure (median ratio 1.02),
     efficient driving about 0.9 of it, 120 km/h about 1.22 and winter about 1.38. */
  var OFFICIAL_FACTORS = [0.9, 1, 1.22, 1.38];
  function levelsFromOfficial(kwhPer100) {
    return OFFICIAL_FACTORS.map(function (f) { return Math.round(kwhPer100 * f * 10) / 10; });
  }

  var LEVELS = ["Efficient", "Typical", "Motorway", "Winter"];
  var LEVEL_HINTS = ["City and country roads, mild weather", "A normal week of driving", "Steady 120 km/h", "Cold weather, heating on"];

  /* Fuel cars to compare with: the most registered new cars in Germany in 2025 (KBA, by model series)
     plus the Mazda CX-30 and CX-5, each with its most common engine. l = real-world litres per 100 km, rounded from owner logs on
     spritmonitor.de; the official WLTP figures are lower. */
  var FUEL_CARS = [
    { id: "golf", short: "Golf", name: "VW Golf 1.5 TSI", fuel: "petrol", l: 6.5 },
    { id: "troc", short: "T-Roc", name: "VW T-Roc 1.5 TSI", fuel: "petrol", l: 7.0 },
    { id: "tiguan", short: "Tiguan", name: "VW Tiguan 2.0 TDI", fuel: "diesel", l: 6.5 },
    { id: "corsa", short: "Corsa", name: "Opel Corsa 1.2", fuel: "petrol", l: 5.8 },
    { id: "octavia", short: "Octavia", name: "Skoda Octavia 2.0 TDI", fuel: "diesel", l: 5.3 },
    { id: "passat", short: "Passat", name: "VW Passat 2.0 TDI", fuel: "diesel", l: 5.8 },
    // added on request, not in the KBA top list: popular compact and mid-size SUVs, petrol only in Germany
    { id: "cx30", short: "CX-30", name: "Mazda CX-30 2.5 e-Skyactiv G", fuel: "petrol", l: 7.0 },
    { id: "cx5", short: "CX-5", name: "Mazda CX-5 2.5 e-Skyactiv G", fuel: "petrol", l: 7.8 }
  ];
  var FUELS = ["petrol", "diesel"];

  /* Pump prices in EUR/L: ADAC monthly average for Germany, October 2026. The page swaps in live
     prices when it can load them. */
  var FUEL_PRICES = { petrol: 2.11, diesel: 2.26, month: "2026-10", source: "ADAC" };

  var DEFAULTS = {
    car: "Volvo EX30",
    lv: [14.5, 16, 19.5, 22],
    use: 1,            // which level the answer uses (0 efficient … 3 winter)
    p: 0.35,           // EUR/kWh
    loss: 10,          // % charging losses
    petrol: FUEL_PRICES.petrol,
    diesel: FUEL_PRICES.diesel,
    refs: ["golf", "troc", "tiguan", "octavia", "cx30", "cx5"],
    own: null          // your own fuel car: { l: litres/100 km, fuel: "petrol" | "diesel" }
  };

  function findCar(name) {
    for (var i = 0; i < CATALOG.length; i++) if (CATALOG[i][0] === name) return CATALOG[i];
    return null;
  }
  function findFuelCar(id) {
    for (var i = 0; i < FUEL_CARS.length; i++) if (FUEL_CARS[i].id === id) return FUEL_CARS[i];
    return null;
  }

  /* Cost per 100 km for an EV: consumption plus charging losses, times the price per kWh. */
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

  /* The fuel cars a state compares with, in display order (own car first). */
  function fuelCars(s) {
    var out = [];
    if (s.own && s.own.l > 0) out.push({ id: "own", name: null, fuel: s.own.fuel === "diesel" ? "diesel" : "petrol", l: s.own.l, own: true });
    (s.refs || []).forEach(function (id) { var c = findFuelCar(id); if (c) out.push(c); });
    return out;
  }

  /* Everything the page and an AI need, from one state object. */
  function compute(s) {
    var use = s.use >= 0 && s.use < 4 ? s.use : 1;
    var kwh = s.lv[use];
    var cost = evCost(kwh, s.p, s.loss);
    var rows = fuelCars(s).map(function (c) {
      var price = s[c.fuel];
      var fc = fuelCost(c.l, price);
      return {
        id: c.id, name: c.name, short: c.short, own: !!c.own, fuel: c.fuel, l: c.l, price: price, cost: fc,
        breakEven: breakEven(kwh, s.loss, c.l, price),
        saving: fc - cost,               // per 100 km at your price; negative means the EV costs more
        levels: s.lv.map(function (v) { return breakEven(v, s.loss, c.l, price); })
      };
    });
    return {
      kwh: kwh,
      cost: cost,
      per1000: cost * 10,
      levels: s.lv.map(function (v) { return evCost(v, s.p, s.loss); }),
      rows: rows
    };
  }

  return {
    CATALOG: CATALOG, OFFICIAL_IDS: OFFICIAL_IDS, OFFICIAL_FACTORS: OFFICIAL_FACTORS, levelsFromOfficial: levelsFromOfficial,
    LEVELS: LEVELS, LEVEL_HINTS: LEVEL_HINTS, FUEL_CARS: FUEL_CARS, FUELS: FUELS,
    FUEL_PRICES: FUEL_PRICES, DEFAULTS: DEFAULTS, findCar: findCar, findFuelCar: findFuelCar,
    evCost: evCost, fuelCost: fuelCost, breakEven: breakEven, fuelCars: fuelCars, compute: compute
  };
});
