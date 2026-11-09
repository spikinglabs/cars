// The hosted MCP endpoint (functions/mcp.js): protocol handling and the read-only tools, on small fixtures.
const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const load = () => import(pathToFileURL(path.join(__dirname, "../functions/mcp.js")).href);

// R2 keys are <project>/public/<region>/<file>, as the data function reads them.
const FILES = {
  "vehicle-catalog/public/de/models.json": { region: "DE", year: 2025, models: [
    { id: "volvo-ex30", make: "Volvo", model: "EX30", name: "Volvo EX30", fuel: "electric", kwh_per_100km: 17.1, registrations: 9000, year: 2025 },
    { id: "vw-golf-petrol", make: "Volkswagen", model: "Golf", name: "Volkswagen Golf", fuel: "petrol", l_per_100km: 5.6, registrations: 50000, year: 2025 },
    { id: "vw-golf-diesel", make: "Volkswagen", model: "Golf", name: "Volkswagen Golf", fuel: "diesel", l_per_100km: 4.6, registrations: 20000, year: 2025 },
  ] },
  "recalls/public/eu/models.json": { models: [{ model: "Volvo EX30", slug: "volvo-ex30", file: "models/volvo-ex30.json", us_file: "x" }] },
  "recalls/public/eu/models/volvo-ex30.json": { alerts: [{ id: "A1", production: "2024 - 2025" }] },
  "recalls/public/us/models/volvo-ex30.json": { campaigns: [{ id: "U1", model_years: ["2025"] }] },
  "recalls/public/eu/brands.json": { brands: [
    { brand: "Volkswagen", slug: "volkswagen", file: "brand/volkswagen.json" },
    { brand: "Volvo", slug: "volvo", file: "brand/volvo.json" },
  ] },
  "recalls/public/eu/brand/volkswagen.json": { alerts: [
    { id: "G1", models: "Golf, Passat", production: "2018 - 2019", recall_code: "93N4", risk: "Fire" },
    { id: "G2", models: "Golf", production: "2023 - 2024", recall_code: "01D7" },
    { id: "P1", models: "Polo", production: "2019", recall_code: "XX" },
    { id: "G3", type_approval: "Golf (CD1)", production: null },
  ] },
  "fuel-prices/public/latest.json": { region: "DE", week: "2026-11-02", products: { euro_super_95: { eur_per_litre: 2.1 }, diesel: { eur_per_litre: 2.0 }, lpg: { eur_per_litre: 1.0 } } },
  "fuel-prices/public/weekly.csv": "date,euro_super_95,diesel,lpg\n2026-10-26,2.2,2.1,1.0\n2026-11-02,2.1,2.0,\n",
  "chargers/public/de/places.json": { places: [["Köln", "50667", 50.938, 6.952, 10], ["Köln", "50825", 50.95, 6.91, 30], ["Kölln", "25000", 54, 9, 1]] },
  "chargers/public/de/latest.json": { observed_at: "2026-11-01", cells: ["101_13"] },
  "chargers/public/de/cells/101_13.json": {
    fields: ["lat", "lon", "kw", "points", "dc_points", "plugs", "flags", "operator", "name", "address", "since"],
    operators: ["EnBW", "TankE"],
    stations: [
      [50.9473, 6.912, 300, 4, 4, 2, 1, 0, null, "Weinsbergstraße 190A", 2022],
      [50.9384, 6.955, 22, 2, 0, 1, 0, 1, null, "Ludwigstr. 6", 2022],
      [51.4, 6.9, 150, 2, 2, 2, 0, 0, null, "Far away", 2020],
    ],
  },
};
const bucket = { get: async (k) => (k in FILES ? { body: typeof FILES[k] === "string" ? FILES[k] : JSON.stringify(FILES[k]), httpEtag: '"e"' } : null) };
const env = { DATA: bucket, ICE: bucket };

const post = async (body) => {
  const { onRequestPost } = await load();
  const res = await onRequestPost({ request: new Request("https://cars.allo.land/mcp", { method: "POST", body: JSON.stringify(body) }), env });
  return { status: res.status, body: res.status === 202 ? null : await res.json() };
};
const call = async (name, args) => (await post({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } })).body.result;

test("initialize answers with the asked protocol version and tools capability", async () => {
  const { body } = await post({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } });
  assert.equal(body.result.protocolVersion, "2025-06-18");
  assert.ok(body.result.capabilities.tools);
  assert.equal(body.result.serverInfo.name, "allo-cars");
});
test("an unknown protocol version gets the newest one", async () => {
  const { body } = await post({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "1999-01-01" } });
  assert.equal(body.result.protocolVersion, "2025-11-25");
});
test("notifications get 202 and no body", async () => {
  assert.equal((await post({ jsonrpc: "2.0", method: "notifications/initialized" })).status, 202);
});
test("tools/list has every tool, read-only, with a schema", async () => {
  const { body } = await post({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  const names = body.result.tools.map((t) => t.name);
  assert.deepEqual(names, ["lookup_official_consumption", "get_recalls", "check_used_car", "get_recall_statistics", "get_fuel_prices", "get_charging_prices", "get_cheapest_charging_time", "compare_cars", "get_rankings", "get_registrations", "find_chargers"]);
  for (const t of body.result.tools) {
    assert.equal(t.annotations.readOnlyHint, true);
    assert.equal(t.inputSchema.type, "object");
    assert.equal(t.run, undefined);
  }
});
test("batches answer each request", async () => {
  const { body } = await post([{ jsonrpc: "2.0", id: 1, method: "ping" }, { jsonrpc: "2.0", method: "notifications/initialized" }, { jsonrpc: "2.0", id: 2, method: "nope" }]);
  assert.equal(body.length, 2);
  assert.deepEqual(body[0].result, {});
  assert.equal(body[1].error.code, -32601);
});
test("bad JSON is a parse error", async () => {
  const { onRequestPost } = await load();
  const res = await onRequestPost({ request: new Request("https://x/mcp", { method: "POST", body: "{" }), env });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.code, -32700);
});
test("an unknown tool is an invalid params error", async () => {
  const { body } = await post({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "delete_everything" } });
  assert.equal(body.error.code, -32602);
});

test("consumption: exact model first, then most registered", async () => {
  const r = await call("lookup_official_consumption", { query: "VW Golf" });
  assert.equal(r.isError, false);
  assert.deepEqual(r.structuredContent.models.map((m) => m.id), ["vw-golf-petrol", "vw-golf-diesel"]);
  assert.equal(r.structuredContent.models[0].page, "https://cars.allo.land/cars/?car=vw-golf-petrol");
  assert.deepEqual(JSON.parse(r.content[0].text), r.structuredContent);
});
test("compare: costs at this week's prices, recalls that name the model, a page link", async () => {
  const r = (await call("compare_cars", { cars: ["vw-golf-petrol", "Volvo EX30", "Trabant"], km_per_year: 10000 })).structuredContent;
  assert.deepEqual(r.cars.map((c) => c.id), ["vw-golf-petrol", "volvo-ex30"]);
  assert.deepEqual(r.not_found, ["Trabant"]);
  const [golf, ex30] = r.cars;
  assert.equal(golf.cost_per_100km_eur, 11.76); // 5.6 L x 2.10
  assert.equal(golf.cost_per_year_eur, 1176);
  assert.equal(golf.safety_gate_recalls, 3); // G1, G2, G3 name the Golf, P1 does not
  assert.equal(ex30.cost_per_100km_eur, 6.58); // 17.1 kWh + 10% at 0.35
  assert.equal(r.page, "https://cars.allo.land/compare/?cars=vw-golf-petrol,volvo-ex30&km=10000");
});
test("compare: no known car is an answer with an error", async () => {
  const r = (await call("compare_cars", { cars: ["Trabant"] })).structuredContent;
  assert.match(r.error, /No car model matches/);
});
test("rankings: cheapest per 100 km at this week's prices", async () => {
  const r = (await call("get_rankings", { list: "cheapest" })).structuredContent;
  assert.deepEqual(r.rows.map((x) => x.catalog_id), ["volvo-ex30", "vw-golf-diesel", "vw-golf-petrol"]);
  assert.equal(r.rows[1].cost_per_100km_eur, 9.2); // 4.6 L x 2.00
  assert.equal(r.page, "https://cars.allo.land/rankings/?list=cheapest");
  const d = (await call("get_rankings", { list: "cheapest", fuel: "diesel" })).structuredContent;
  assert.deepEqual(d.rows.map((x) => x.catalog_id), ["vw-golf-diesel"]);
});
test("rankings: bad list is a tool error", async () => {
  const r = await call("get_rankings", { list: "fastest" });
  assert.equal(r.isError, true);
});
test("consumption: bad fuel is a tool error", async () => {
  const r = await call("lookup_official_consumption", { query: "Golf", fuel: "steam" });
  assert.equal(r.isError, true);
  assert.match(r.content[0].text, /fuel must be one of/);
});
test("recalls for a followed model include US campaigns", async () => {
  const r = (await call("get_recalls", { model: "my Volvo EX30 Ultra" })).structuredContent;
  assert.equal(r.model, "Volvo EX30");
  assert.equal(r.eu_alerts, 1);
  assert.equal(r.us_campaigns, 1);
});
test("used-car check keeps the build window and undated alerts, and asks about fire", async () => {
  const r = (await call("check_used_car", { make: "VW", model: "Golf", year: 2019 })).structuredContent;
  assert.equal(r.brand, "Volkswagen");
  assert.deepEqual(r.eu.map((a) => a.id), ["G1", "G3"]);
  assert.equal(r.eu_alerts_other_build_years, 1);
  assert.deepEqual(r.recall_codes, ["93N4"]);
  assert.equal(r.eu[1].build_window_matches, null);
  assert.ok(r.ask_the_seller.some((q) => q.startsWith("Fire risk")));
  assert.equal(r.page, "https://cars.allo.land/recalls/?brand=volkswagen&model=golf&year=2019");
});
test("fuel prices pick one fuel and the last weeks", async () => {
  const r = (await call("get_fuel_prices", { fuel: "lpg", weeks: 1 })).structuredContent;
  assert.deepEqual(Object.keys(r.products), ["lpg"]);
  assert.deepEqual(r.history, [{ week: "2026-11-02", lpg: null }]);
  assert.equal(r.page, "https://cars.allo.land/fuel-prices/?fuel=lpg");
});
test("fuel prices for a region without data is a tool error", async () => {
  assert.equal((await call("get_fuel_prices", { region: "xx" })).isError, true);
});
test("chargers near a town: within the radius, closest first, with filters", async () => {
  const all = (await call("find_chargers", { near: "Köln" })).structuredContent;
  assert.equal(all.centre.name, "Köln");
  assert.deepEqual(all.chargers.map((c) => c.address), ["Weinsbergstraße 190A", "Ludwigstr. 6"]);
  const fast = (await call("find_chargers", { near: "50667", min_kw: 150, only: ["open_24_7"] })).structuredContent;
  assert.deepEqual(fast.chargers.map((c) => c.operator), ["EnBW"]);
  assert.deepEqual(fast.chargers[0].plugs, ["ccs"]);
  assert.match(fast.map, /kw=150/);
});
test("chargers: an unknown town is a tool error", async () => {
  assert.equal((await call("find_chargers", { near: "Atlantis" })).isError, true);
});

test("GET shows a note for people and 405 for event streams", async () => {
  const { onRequestGet } = await load();
  const page = onRequestGet({ request: new Request("https://x/mcp") });
  assert.equal(page.status, 200);
  assert.match(await page.text(), /custom connector/);
  const sse = onRequestGet({ request: new Request("https://x/mcp", { headers: { accept: "text/event-stream" } }) });
  assert.equal(sse.status, 405);
});
