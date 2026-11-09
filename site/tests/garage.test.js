// Tests for site/public/assets/garage.js: the "My cars" store and model matching across datasets.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function load() {
  const store = new Map();
  const ctx = {
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
    dispatchEvent: () => {}, CustomEvent: function (t, o) { this.type = t; this.detail = o && o.detail; },
  };
  ctx.window = ctx;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../public/assets/garage.js"), "utf8"), ctx);
  return ctx.AlloGarage;
}

test("keeps several cars and remembers the active one", () => {
  const G = load();
  assert.strictEqual(G.active(), null);
  const a = G.add({ car: "vw-golf-diesel", name: "VW Golf", make: "VW", model: "Golf", fuel: "diesel", year: 2019 });
  const b = G.add({ car: "volvo-ex30", name: "Volvo EX30", make: "Volvo", model: "EX30", fuel: "electric", year: "2024" });
  assert.strictEqual(G.list().length, 2);
  assert.strictEqual(G.active().id, b.id);
  assert.strictEqual(G.active().year, 2024);
  G.setActive(a.id);
  assert.strictEqual(G.active().name, "VW Golf");
  G.update(a.id, { cons: 5.4 });
  assert.strictEqual(G.get(a.id).cons, 5.4);
  G.remove(a.id);
  assert.strictEqual(G.active().id, b.id);
});

test("matches model names across datasets", () => {
  const G = load();
  assert.strictEqual(G.modelKey("VW", "ID.7"), G.modelKey("VW", "ID.7"));
  assert.strictEqual(G.modelKey("Volkswagen", "ID.7"), "vw|id7");
  assert.strictEqual(G.modelKey("Mazda", "MAZDA3"), G.modelKey("MAZDA", "3"));
  assert.strictEqual(G.modelKey("BMW", "3 Series"), G.modelKey("BMW", "3ER"));
  assert.strictEqual(G.modelKey("Mercedes-Benz", "A-Class"), G.modelKey("MERCEDES", "A-KLASSE"));
  assert.strictEqual(G.recallModel("Volvo", "EX30"), "ex30");
  assert.strictEqual(G.recallBrand("VW"), "volkswagen");
  assert.strictEqual(G.recallBrand("Mercedes"), "mercedes-benz");
});

test("compare basket keeps up to four distinct cars, newest last; adding one again changes nothing", () => {
  const G = load();
  ["a", "b", "c", "d", "e", "b"].forEach((x) => G.compare.add(x));
  assert.deepStrictEqual([...G.compare.list()], ["b", "c", "d", "e"]);
  G.compare.toggle("c");
  assert.strictEqual(G.compare.has("c"), false);
  G.compare.remove("d");
  assert.deepStrictEqual([...G.compare.list()], ["b", "e"]);
});

test("finds the recalls that name a model", () => {
  const G = load();
  assert.strictEqual(G.recallNames({ models: "Golf, Passat (B8)" }, "VW", "Golf"), true);
  assert.strictEqual(G.recallNames({ models: "Polo" }, "VW", "Golf"), false);
  assert.strictEqual(G.recallNames({ models: "XC40, EX30" }, "Volvo", "EX30"), true);
  assert.strictEqual(G.recallNames({ models: "ID.3" }, "VW", "ID.7"), false);
  assert.strictEqual(G.recallFits({ production: "2023 - 2024" }, 2025), true);
  assert.strictEqual(G.recallFits({ production: "2019" }, 2025), false);
});
