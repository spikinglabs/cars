// The hosted MCP endpoint (functions/mcp.js): protocol handling and the read-only tools, on small fixtures.
const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const load = () => import(pathToFileURL(path.join(__dirname, "../functions/mcp.js")).href);

// R2 keys are <project>/public/<region>/<file>, as the data function reads them.
const FILES = {
  "registrations/public/de/latest.json": { month: "2026-03", source: "KBA", market: { total: 200 }, top_models: [], top_electric: [] },
  "registrations/public/de/models.json": { models: [
    { slug: "vw-golf", brand: "VW", model: "GOLF", file: "models/vw-golf.json", rank: 1, latest: 8000, last_12_months: 90000 },
    { slug: "volvo-ex30", brand: "VOLVO", model: "EX30", file: "models/volvo-ex30.json", rank: 50, latest: 1500, last_12_months: 7000 },
  ] },
  "registrations/public/de/models/vw-golf.json": { months: [{ month: "2026-02", total: 7000, bev: 0 }, { month: "2026-03", total: 8000, bev: 0 }] },
  "registrations/public/de/models/volvo-ex30.json": { months: [{ month: "2026-03", total: 1500, bev: 1500 }] },
  "registrations/public/de/market.csv": "month,total,diesel,hybrid,phev,bev,petrol_etc,bev_share\n2025-03,200,0,0,0,40,0,20\n2025-12,100,0,0,0,20,0,20\n2026-01,200,0,0,0,50,0,25\n2026-03,200,0,0,0,80,0,40\n",
  "vehicle-catalog/public/de/models.json": { region: "DE", year: 2025, models: [
    { id: "volvo-ex30", make: "Volvo", model: "EX30", name: "Volvo EX30", fuel: "electric", kwh_per_100km: 17.1, registrations: 9000, year: 2025 },
    { id: "vw-golf-petrol", make: "Volkswagen", model: "Golf", name: "Volkswagen Golf", fuel: "petrol", l_per_100km: 5.6, registrations: 50000, year: 2025 },
    { id: "vw-golf-diesel", make: "Volkswagen", model: "Golf", name: "Volkswagen Golf", fuel: "diesel", l_per_100km: 4.6, registrations: 20000, year: 2025 },
    { id: "vw-tiguan-phev-petrol", make: "VW", model: "Tiguan", name: "VW Tiguan", fuel: "phev-petrol", kwh_per_100km: 25, l_per_100km: 2, co2_g_km: 12, registrations: 15000, year: 2025 },
    { id: "bmw-x5-phev-petrol", make: "BMW", model: "X5", name: "BMW X5", fuel: "phev-petrol", kwh_per_100km: 30, l_per_100km: 3, co2_g_km: 75, registrations: 5000, year: 2025 },
    { id: "mercedes-benz-glc-phev-petrol", make: "Mercedes-Benz", model: "GLC", name: "Mercedes-Benz GLC", fuel: "phev-petrol", kwh_per_100km: 30, l_per_100km: 3, co2_g_km: 70, range_km: 110, registrations: 4000, year: 2025 },
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
  "ratings/public/de/ratings.json": {
    euro_ncap: { models: [{ name: "Volkswagen Golf", make: "Volkswagen", model: "Golf", stars: 5, year: 2025, url: "https://www.euroncap.com/x/" }] },
    green_ncap: { versions: [
      { name: "Volkswagen Golf 2.0 TDI diesel", fuel: "diesel", stars: 3.5, year: 2026, url: "g1" },
      { name: "VW Golf 1.5 TSI petrol", fuel: "petrol", stars: 3, year: 2021, url: "g2" },
    ] },
    adac_breakdowns: { calendar_year: 2024, source: "ADAC Pannenstatistik 2025", source_url: "a", registration_years: [2022, 2021], models: [{ name: "VW Golf", rates: { 2022: 2.6, 2021: 5.4 } }] },
  },
  "fuel-prices/public/latest.json": { region: "DE", week: "2026-11-02", products: { euro_super_95: { eur_per_litre: 2.1 }, diesel: { eur_per_litre: 2.0 }, lpg: { eur_per_litre: 1.0 } } },
  "fuel-prices/public/weekly.csv": "date,euro_super_95,diesel,lpg\n2026-10-26,2.2,2.1,1.0\n2026-11-02,2.1,2.0,\n",
  "charging-prices/public/de/latest.json": { region: "DE", observed_at: "2026-11-09T00:00:00+00:00", overall: { median: 0.57 },
    by_power: { ac: { charge_points: 100, median: 0.49 }, hpc: { charge_points: 10, median: 0.69 } },
    by_operator: [{ operator: "EnBW", charge_points: 50, ac: { charge_points: 40, median: 0.59 } }, { operator: "Stadtwerke Köln", charge_points: 30 }] },
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
  assert.deepEqual(names, ["lookup_official_consumption", "get_recalls", "check_used_car", "get_recall_statistics", "get_fuel_prices", "get_charging_prices", "get_cheapest_charging_time", "compare_cars", "get_rankings", "find_similar_cars", "get_car_ratings", "get_registrations", "check_ev_grant", "compare_cost_over_years", "find_chargers"]);
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
  assert.deepEqual(r.rows.map((x) => x.catalog_id).slice(0, 3), ["volvo-ex30", "vw-golf-diesel", "vw-golf-petrol"]); // then the plug-in hybrids of the grant tests
  assert.equal(r.rows[1].cost_per_100km_eur, 9.2); // 4.6 L x 2.00
  assert.equal(r.page, "https://cars.allo.land/rankings/?list=cheapest");
  const d = (await call("get_rankings", { list: "cheapest", fuel: "diesel" })).structuredContent;
  assert.deepEqual(d.rows.map((x) => x.catalog_id), ["vw-golf-diesel"]);
});
test("rankings: bad list is a tool error", async () => {
  const r = await call("get_rankings", { list: "fastest" });
  assert.equal(r.isError, true);
});
test("ratings: Euro NCAP by model, Green NCAP of the same fuel, ADAC by series", async () => {
  const r = (await call("get_car_ratings", { car: "vw-golf-petrol" })).structuredContent;
  assert.equal(r.euro_ncap.stars, 5);
  assert.equal(r.green_ncap.url, "g2");
  assert.equal(r.adac_breakdowns.per_1000_cars_by_first_registration[2022], 2.6);
  const d = (await call("get_car_ratings", { car: "vw-golf-diesel" })).structuredContent;
  assert.equal(d.green_ncap.stars, 3.5);
  const e = (await call("get_car_ratings", { car: "volvo-ex30" })).structuredContent;
  assert.equal(e.euro_ncap, null);
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
test("get_registrations: the electric wave since the grant", async () => {
  const r = (await call("get_registrations", {})).structuredContent;
  assert.equal(r.electric_wave.share, 40);
  assert.equal(r.electric_wave.share_year_ago, 20);
  assert.equal(r.electric_wave.since_grant.bev, 130);
  assert.equal(r.electric_wave.grant_from, "2026-01");
});
test("get_registrations: several models side by side", async () => {
  const r = (await call("get_registrations", { models: ["VW Golf", "Volvo EX30", "Nope Nothing"] })).structuredContent;
  assert.deepEqual(r.models.map((m) => m.slug), ["vw-golf", "volvo-ex30"]);
  assert.equal(r.models[0].last_12_months_total, 15000);
  assert.equal(r.models[1].last_12_months_bev_share_pct, 100);
  assert.deepEqual(r.not_found, ["Nope Nothing"]);
  assert.equal(r.page, "https://cars.allo.land/registrations/?model=vw-golf,volvo-ex30");
});
test("used-car check gives the battery warranty left", async () => {
  const r = (await call("check_used_car", { make: "VW", model: "Golf", year: 2019, km: 150000 })).structuredContent;
  assert.equal(r.battery_warranty.years, 8);
  assert.equal(r.battery_warranty.until_year, 2027);
  assert.equal(r.battery_warranty.km_left, 10000);
  assert.equal(r.high_voltage_battery_recalls, 0);
  const old = (await call("check_used_car", { make: "VW", year: 2010 })).structuredContent;
  assert.equal(old.battery_warranty.covered_now, false);
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
test("charging prices by charger type, and operators filtered by name", async () => {
  const all = (await call("get_charging_prices", {})).structuredContent;
  assert.equal(all.by_power.ac.median, 0.49);
  assert.equal(all.operators.length, 2);
  const one = (await call("get_charging_prices", { operator: "köln" })).structuredContent;
  assert.deepEqual(one.operators.map((o) => o.operator), ["Stadtwerke Köln"]);
  assert.equal(one.page, "https://cars.allo.land/charging-prices/?q=k%C3%B6ln");
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

test("check_ev_grant: amount by income and children, with the page link", async () => {
  const out = JSON.parse((await call("check_ev_grant", { income: 50000, children: 1, first_registration: "2026-03-15" })).content[0].text);
  assert.equal(out.grant_eur, 4500);
  assert.equal(out.eligible, true);
  assert.equal(out.apply_by, "2027-03-15");
  assert.equal(out.keep_until, "2029-03-15");
  assert.equal(out.page, "https://cars.allo.land/ev-grant/?kids=1&income=50000&reg=2026-03-15");
  assert.equal(out.table.length, 5);
});
test("check_ev_grant: a plug-in hybrid is checked against its official CO2", async () => {
  const ok = JSON.parse((await call("check_ev_grant", { drive: "phev", income: 40000, car: "Tiguan" })).content[0].text);
  assert.equal(ok.grant_eur, 3500);
  assert.equal(ok.car.id, "vw-tiguan-phev-petrol");
  assert.match(ok.page, /car=vw-tiguan-phev-petrol/);
  const over = JSON.parse((await call("check_ev_grant", { drive: "phev", income: 40000, car: "BMW X5", })).content[0].text);
  assert.equal(over.plug_in_hybrid_check, null, "75 g/km alone is not a no: the range may still reach 80 km");
  const glc = JSON.parse((await call("check_ev_grant", { drive: "phev", income: 40000, car: "GLC" })).content[0].text);
  assert.equal(glc.plug_in_hybrid_check, true, "70 g/km but 110 km official electric range");
  assert.equal(glc.car.electric_range_km, 110);
  assert.equal(glc.grant_eur, 3500);
  const no = JSON.parse((await call("check_ev_grant", { drive: "phev", income: 40000, co2_g_km: 75, electric_range_km: 50 })).content[0].text);
  assert.equal(no.grant_eur, 0);
  assert.equal(no.plug_in_hybrid_check, false);
});

test("compare_cost_over_years: grant from income, Kfz-Steuer and payback", async () => {
  const out = JSON.parse((await call("compare_cost_over_years", { ev_price: 40000, fuel_car_price: 32000, income: 50000, years: 8, km_per_year: 10000,
    ev_kwh_per_100km: 16, eur_per_kwh: 0.35, fuel_litres_per_100km: 6.5, fuel_eur_per_litre: 2, engine_cc: 1498, co2_g_km: 125 })).content[0].text);
  assert.equal(out.electric.grant_eur, 4000);
  assert.equal(out.electric.price_after_grant_eur, 36000);
  assert.equal(out.fuel_car.vehicle_tax_per_year_eur, 92);
  assert.equal(out.years.length, 8);
  assert.ok(out.payback_years > 0 && out.payback_years < 8);
  assert.match(out.page, /evp=40000/);
  await assert.rejects(async () => { const r = await call("compare_cost_over_years", { ev_price: 40000 }); if (r.isError) throw new Error(r.content[0].text); });
});

test("find_chargers: says how easy living there without a wallbox is", async () => {
  const out = JSON.parse((await call("find_chargers", { lat: 50.9384, lon: 6.955 })).content[0].text);
  const a = out.living_without_wallbox;
  assert.equal(a.points_1km, 2, "the 22 kW station next door");
  assert.equal(a.verdict, "ok");
  assert.ok(a.nearest_fast_km > 3 && a.nearest_fast_km < 5, "the 300 kW station in Ehrenfeld");
});
