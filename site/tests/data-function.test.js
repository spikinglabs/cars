// The data function serves region paths and old flat paths from either bucket layout.
const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const load = () => import(pathToFileURL(path.join(__dirname, "../functions/data/[[path]].js")).href);
const bucket = (keys) => ({ get: async (k) => (keys.includes(k) ? { body: k, httpEtag: '"e"' } : null) });
const get = async (keys, parts) => {
  const { onRequestGet } = await load();
  const res = await onRequestGet({ params: { path: parts }, env: { DATA: bucket(keys), ICE: bucket(keys) } });
  return res.status === 200 ? await res.text() : res.status;
};

test("region path reads the region folder", async () => {
  assert.equal(await get(["charging-prices/public/de/latest.json"], ["charging-prices", "de", "latest.json"]), "charging-prices/public/de/latest.json");
});
test("region path falls back to the old flat file for Germany", async () => {
  assert.equal(await get(["charging-prices/public/latest.json"], ["charging-prices", "de", "latest.json"]), "charging-prices/public/latest.json");
});
test("old flat URL reads the Germany folder once it exists", async () => {
  assert.equal(await get(["charging-prices/public/de/daily.csv"], ["charging-prices", "daily.csv"]), "charging-prices/public/de/daily.csv");
});
test("other regions have no fallback", async () => {
  assert.equal(await get(["fuel-prices/public/latest.json"], ["fuel-prices", "at", "latest.json"]), 404);
});
test("old flat URL prefers the Germany folder over a stale flat copy", async () => {
  assert.equal(await get(["charging-prices/public/latest.json", "charging-prices/public/de/latest.json"], ["charging-prices", "latest.json"]), "charging-prices/public/de/latest.json");
});
test("fuel prices come from the fuel bucket", async () => {
  const { onRequestGet } = await load();
  const res = await onRequestGet({ params: { path: ["fuel-prices", "de", "latest.json"] }, env: { DATA: bucket([]), ICE: bucket(["fuel-prices/public/latest.json"]) } });
  assert.equal(await res.text(), "fuel-prices/public/latest.json");
});
