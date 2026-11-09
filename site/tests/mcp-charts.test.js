// Chart-ready series the hosted MCP server adds to tool results (lib/mcp-charts.js), on small fixtures.
const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const mod = (f) => import(pathToFileURL(path.join(__dirname, f)).href);
const FILES = {
  "registrations/de/market.csv": "month,total,diesel,hybrid,phev,bev,petrol_etc,bev_share\n2026-09,100,0,0,0,30,0,30\n2026-10,100,0,0,0,40,0,40\n",
  "charging-prices/de/daily.csv": "date,source,tariffs,median,p10,p90,min,max\n2026-11-07,ALL,10,0.57,0.39,0.79,0,1\n2026-11-07,x,3,0.5,0.4,0.6,0,1\n2026-11-08,ALL,10,0.58,0.4,0.8,0,1\n",
  "electricity-prices/de/latest.json": { timezone: "Europe/Berlin", tariff_model: { addon_eur_kwh_net: 0.18, vat: 0.19 }, days: [{ date: "2026-11-09", slots: [
    { start: "2026-11-09T00:00:00+01:00", eur_mwh: 100 }, { start: "2026-11-09T00:15:00+01:00", eur_mwh: 120 },
    { start: "2026-11-09T01:00:00+01:00", eur_mwh: 80 }] }] },
};
const get = async (p) => { if (!(p in FILES)) throw new Error("404"); return FILES[p]; };
const charts = async (name, out, args = {}) => (await mod("../lib/mcp-charts.js")).chartsFor(name, args, out, get);
const shape = (c) => {
  assert.ok(["line", "bar", "grouped_bar", "stacked_bar"].includes(c.kind));
  assert.ok(c.title && c.x.label && c.x.type && c.y.unit);
  for (const s of c.series) for (const p of s.points) assert.ok(p.length === 2 && (p[1] === null || typeof p[1] === "number"));
};

test("fuel prices: one weekly line per fuel, in the result's currency", async () => {
  const [c] = await charts("get_fuel_prices", { region: "DE", currency: "EUR", history: [
    { week: "2026-10-26", euro_super_95: 2.2, diesel: 2.1, lpg: 1 }, { week: "2026-11-02", euro_super_95: 2.1, diesel: 2.0, lpg: null }] });
  shape(c);
  assert.equal(c.kind, "line");
  assert.equal(c.y.unit, "EUR/L");
  assert.deepEqual(c.series.map((s) => s.name), ["Super E5 (95)", "Diesel", "LPG (autogas)"]);
  assert.deepEqual(c.series[1].points, [["2026-10-26", 2.1], ["2026-11-02", 2.0]]);
  assert.deepEqual(c.series[2].points[1], ["2026-11-02", null]);
});

test("registrations: one model by drive type, zero lines left out, KBA capitals tidied", async () => {
  const [c] = await charts("get_registrations", { model: "VOLVO EX30", months: [{ month: "2026-09", total: 5, bev: 5, phev: 0, diesel: 0 }, { month: "2026-10", total: 7, bev: 7, phev: 0, diesel: 0 }] });
  shape(c);
  assert.equal(c.title, "Volvo EX30: new registrations per month in Germany");
  assert.deepEqual(c.series.map((s) => s.name), ["All", "Electric"]);
});

test("registrations: several models side by side, and the market", async () => {
  const [c] = await charts("get_registrations", { models: [{ model: "VW GOLF", months: [{ month: "2026-10", total: 8 }] }, { model: "MERCEDES GLK, GLC", months: [{ month: "2026-10", total: 6 }] }] });
  assert.deepEqual(c.series.map((s) => s.name), ["VW Golf", "Mercedes GLK, GLC"]);
  const m = await charts("get_registrations", { month: "2026-10", market: { total: 100, diesel: 10, hybrid: 40, phev: 15, bev: 30, petrol_etc: 20 },
    top_models: [{ brand: "VW", model: "GOLF", total: 8, bev: 0, phev: 1 }] });
  assert.deepEqual(m.map((x) => x.kind), ["bar", "stacked_bar", "line"]);
  assert.deepEqual(m[0].series[0].points, [["Electric", 30], ["Plug-in hybrid", 15], ["Hybrid (not plug-in)", 25], ["Petrol and other", 20], ["Diesel", 10]]);
  assert.deepEqual(m[1].series.map((s) => s.points[0]), [["VW Golf", 0], ["VW Golf", 1], ["VW Golf", 7]]);
  assert.deepEqual(m[2].series[0].points, [["2026-09", 30], ["2026-10", 40]]);
});

test("charging: bars by charger type and a daily line from the history file", async () => {
  const c = await charts("get_charging_prices", { by_power: { ac: { median: 0.5, p10: 0.4, p90: 0.7 }, hpc: { median: 0.8, p10: 0.6, p90: 0.9 } }, operators: [] });
  assert.deepEqual(c.map((x) => x.kind), ["grouped_bar", "line"]);
  assert.deepEqual(c[0].series[1].points, [["AC", 0.5], ["High-power 150 kW+", 0.8]]);
  assert.deepEqual(c[1].series[1].points, [["2026-11-07", 0.57], ["2026-11-08", 0.58]]);
});

test("cheapest time: hourly tariff estimate per day from the 15-minute prices", async () => {
  const [c] = await charts("get_cheapest_charging_time", { days: [] });
  shape(c);
  assert.deepEqual(c.series[0], { name: "2026-11-09", points: [["00:00", 0.3451], ["01:00", 0.3094]] }); // (0.11 + 0.18) * 1.19, (0.08 + 0.18) * 1.19
});

test("compare and cost over years", async () => {
  const c = await charts("compare_cars", { km_per_year: 15000, cars: [
    { name: "Volvo EX30", fuel: "electric", cost_per_100km_eur: 6.6, cost_per_100km_public_charging_eur: 10.8, cost_per_year_eur: 990, registrations_last_12_months: 7000 },
    { name: "VW Golf", fuel: "petrol", cost_per_100km_eur: 12.8, cost_per_100km_public_charging_eur: null, cost_per_year_eur: 1915, registrations_last_12_months: 88000 }] });
  assert.equal(c.length, 3);
  assert.deepEqual(c[0].series[1].points, [["Volvo EX30", 10.8], ["VW Golf", null]]);
  const [y] = await charts("compare_cost_over_years", { payback_years: 4.2, years: [{ year: 1, electric_total_eur: 37000, fuel_total_eur: 33000 }] });
  assert.deepEqual(y.series.map((s) => s.points), [[[1, 37000]], [[1, 33000]]]);
  assert.match(y.note, /4\.2 years/);
});

test("rankings bar keeps the rank order; errors and unknown tools get no charts", async () => {
  const [c] = await charts("get_rankings", { list: "efficient", rows: [{ rank: 1, name: "A", kwh_per_100km: 13 }, { rank: 2, name: "B", kwh_per_100km: 14 }] });
  assert.deepEqual(c.series[0].points, [["A", 13], ["B", 14]]);
  assert.deepEqual(await charts("get_rankings", { error: "x" }), []);
  assert.deepEqual(await charts("find_chargers", { chargers: [] }), []);
  assert.deepEqual(await charts("get_fuel_prices", null), []);
});

test("long series are thinned, keeping the last point", async () => {
  const history = Array.from({ length: 1000 }, (_, i) => ({ week: `w${i}`, diesel: i + 1 }));
  const [c] = await charts("get_fuel_prices", { history });
  assert.ok(c.series[0].points.length <= 401);
  assert.deepEqual(c.series[0].points.at(-1), ["w999", 1000]);
});

test("the server adds charts to results and chart hints to descriptions and instructions", async () => {
  const { handle } = await mod("../functions/mcp.js");
  const init = await handle({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }, get);
  assert.match(init.result.instructions, /charts/);
  const list = await handle({ jsonrpc: "2.0", id: 2, method: "tools/list" }, get);
  assert.match(list.result.tools.find((t) => t.name === "get_fuel_prices").description, /line chart/);
  const r = await handle({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "compare_cost_over_years", arguments: { ev_price: 37000, fuel_car_price: 32000, fuel_eur_per_litre: 2 } } }, get);
  assert.equal(r.result.structuredContent.charts[0].kind, "line");
  assert.deepEqual(JSON.parse(r.result.content[0].text), r.result.structuredContent);
});
