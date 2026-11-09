/* "My cars": the cars someone keeps on this device, shared by every page.
 *
 * Kept in localStorage under "allo-cars-garage" as
 *   { v: 1, active: "<id>", cars: [{ id, car, name, make, model, fuel, year, nick, cons }] }
 * where car is the vehicle catalog id (/data/vehicle-catalog/<region>/models.json, e.g. "volvo-ex30"
 * or "vw-golf-petrol"), or "" for a car typed in by hand; fuel is the catalog fuel (electric, petrol,
 * diesel, lpg, phev-petrol, phev-diesel, hydrogen); year is the year of first registration (0 if not
 * given); cons is the driver's own consumption (kWh or L per 100 km) or null for the official figure.
 * Nothing leaves the device. Pages listen for the "ac:garage" event to follow changes.
 *
 * The compare basket (up to 4 catalog ids, for /compare/) is kept under "allo-cars-compare" as
 *   { v: 1, cars: ["volvo-ex30", "tesla-model-y"] }
 *
 * Also holds the rules for finding the same model in the other datasets (registrations, recalls),
 * whose names differ: "VW ID.7" / "vw-id7", "MAZDA3" / "Mazda 3", "BMW 3 Series" / "BMW 3er".
 */
(function () {
  "use strict";
  var KEY = "allo-cars-garage";
  var read = function () {
    try {
      var g = JSON.parse(localStorage.getItem(KEY) || "null");
      if (g && Array.isArray(g.cars)) return g;
    } catch (e) {}
    return { v: 1, active: "", cars: [] };
  };
  var write = function (g) {
    try { localStorage.setItem(KEY, JSON.stringify(g)); } catch (e) {}
    try { dispatchEvent(new CustomEvent("ac:garage", { detail: g })); } catch (e) {}
    return g;
  };
  var clean = function (c) {
    var n = function (v, lo, hi) { v = Number(v); return isFinite(v) && v >= lo && v <= hi ? v : null; };
    return {
      id: String(c.id || ("c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6))),
      car: String(c.car || "").slice(0, 80),
      name: String(c.name || "").slice(0, 80),
      make: String(c.make || "").slice(0, 40),
      model: String(c.model || "").slice(0, 60),
      fuel: String(c.fuel || "petrol").slice(0, 20),
      year: n(c.year, 1950, 2100) || 0,
      nick: String(c.nick || "").slice(0, 40),
      cons: n(c.cons, 0.1, 60)
    };
  };

  var norm = function (s) { return String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, ""); };
  var BRAND = { volkswagen: "vw", mercedesbenz: "mercedes", mercedesamg: "mercedes" };
  var brandKey = function (b) { b = norm(b); return BRAND[b] || b; };
  // "brand|model" with the brand dropped from the front of the model and series names in the
  // registration statistics' German form: "BMW 3 Series" -> "bmw|3er", "A-Class" -> "aklasse".
  function modelKey(make, model) {
    var b = brandKey(make), m = norm(model);
    [norm(make), b].forEach(function (p) { if (p && m.indexOf(p) === 0 && m.length > p.length) m = m.slice(p.length); });
    m = m.replace(/^(\d)series$/, "$1er").replace(/^(\w+)class$/, "$1klasse");
    return b + "|" + m;
  }

  var CMP = "allo-cars-compare", CMP_MAX = 4;
  var cmpRead = function () {
    try {
      var g = JSON.parse(localStorage.getItem(CMP) || "null");
      if (g && Array.isArray(g.cars)) return g.cars.filter(function (x) { return typeof x === "string" && x; }).slice(0, CMP_MAX);
    } catch (e) {}
    return [];
  };
  var cmpWrite = function (ids) {
    var seen = {}, out = [];
    ids.forEach(function (x) { x = String(x || "").slice(0, 80); if (x && !seen[x]) { seen[x] = 1; out.push(x); } });
    out = out.slice(-CMP_MAX);
    try { localStorage.setItem(CMP, JSON.stringify({ v: 1, cars: out })); } catch (e) {}
    try { dispatchEvent(new CustomEvent("ac:compare", { detail: out })); } catch (e) {}
    return out;
  };

  // Recalls: the parts of a Safety Gate alert's model text ("Golf, Passat (B8)") and whether one
  // names a model; the same rules as the recalls page and check_used_car.
  var reEsc = function (s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); };
  function recallParts(a, brand) {
    return [a.models, a.type_approval].join(", ").replace(/&amp;/g, "&").replace(/\([^)]*\)/g, " ").split(/\s*(?:[,;/+&]|\band\b)\s*/i)
      .map(function (p) { return p.trim().replace(new RegExp("^" + reEsc(brand || "") + "\\s+", "i"), ""); })
      .filter(function (p) { return p && p.length <= 40 && !/[*]|^e\d|^(?:null|undefined)$/i.test(p); });
  }
  function recallModel(make, model) {
    var m = norm(model);
    [norm(make), brandKey(make)].forEach(function (p) { if (p && m.indexOf(p) === 0 && m.length > p.length) m = m.slice(p.length); });
    return m;
  }
  function recallNames(a, make, model) {
    var key = recallModel(make, model), bn = norm(make), alt = modelKey(make, model).split("|")[1];
    if (!key) return false;
    return recallParts(a, a.brand || make).some(function (p) {
      var n = norm(p); if (bn && n.indexOf(bn) === 0 && n.length > bn.length) n = n.slice(bn.length);
      return n === key || n === alt || (n.indexOf(key) === 0 && !/^\d/.test(n.slice(key.length)));
    });
  }
  function buildWindow(a) {
    var ys = (String(a.production || "").match(/(?:19|20)\d\d/g) || []).map(Number);
    return ys.length ? [Math.min.apply(null, ys), Math.max.apply(null, ys)] : null;
  }

  window.AlloGarage = {
    KEY: KEY,
    list: function () { return read().cars; },
    get: function (id) { return read().cars.filter(function (c) { return c.id === id; })[0] || null; },
    active: function () {
      var g = read();
      return g.cars.filter(function (c) { return c.id === g.active; })[0] || g.cars[0] || null;
    },
    setActive: function (id) { var g = read(); g.active = id; write(g); },
    add: function (car) {
      var g = read(), c = clean(car);
      g.cars.push(c); g.active = c.id; write(g);
      return c;
    },
    update: function (id, patch) {
      var g = read();
      g.cars = g.cars.map(function (c) { return c.id === id ? clean(Object.assign({}, c, patch, { id: id })) : c; });
      write(g);
    },
    remove: function (id) {
      var g = read();
      g.cars = g.cars.filter(function (c) { return c.id !== id; });
      if (g.active === id) g.active = g.cars[0] ? g.cars[0].id : "";
      write(g);
    },
    norm: norm,
    brandKey: brandKey,
    modelKey: modelKey,
    // Brand slug as the recalls data names it (/data/recalls/eu/brands.json).
    recallBrand: function (make) { var b = norm(make); return b === "vw" ? "volkswagen" : b === "mercedes" ? "mercedes-benz" : String(make || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); },
    // Model as the recalls page matches it (?model=): the plain name without the brand, "3series", "mazda3" -> "3".
    recallModel: recallModel,
    recallParts: recallParts,
    // Does this Safety Gate alert name the model? (brand files hold every model of the brand)
    recallNames: recallNames,
    buildWindow: buildWindow,
    // Was a car first registered in year built in the alert's production window (that year or the one before)?
    recallFits: function (a, year) { var w = buildWindow(a); return !!w && w[0] <= year && year - 1 <= w[1]; },
    compare: {
      MAX: CMP_MAX,
      list: cmpRead,
      set: cmpWrite,
      has: function (id) { return cmpRead().indexOf(id) >= 0; },
      add: function (id) { return cmpWrite(cmpRead().concat([id])); },
      remove: function (id) { return cmpWrite(cmpRead().filter(function (x) { return x !== id; })); },
      toggle: function (id) { var l = cmpRead(); return l.indexOf(id) >= 0 ? cmpWrite(l.filter(function (x) { return x !== id; })) : cmpWrite(l.concat([id])); }
    },
    electric: function (fuel) { return fuel === "electric"; },
    plugIn: function (fuel) { return /^phev/.test(fuel); }
  };
})();
