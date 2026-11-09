// The MCP usage log (lib/mcp-usage.js): what a line keeps, what it drops, and that logging never breaks an answer.
const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const load = (f) => import(pathToFileURL(path.join(__dirname, f)).href);

const FILES = {
  "chargers/public/de/places.json": { places: [["Köln", "50667", 50.938, 6.952, 10]] },
  "chargers/public/de/latest.json": { observed_at: "2026-11-01", cells: [] },
};

function setup(extra = {}) {
  const puts = [];
  const waits = [];
  const bucket = {
    get: async (k) => (k in FILES ? { body: JSON.stringify(FILES[k]), httpEtag: '"e"' } : null),
    put: async (key, body) => puts.push({ key, body }),
  };
  const env = { DATA: bucket, ICE: bucket, ...extra };
  const post = async (body, { host = "cars.allo.land", ua = "Claude-User/1.0 (+https://anthropic.com)", country = "DE", raw } = {}) => {
    const { onRequestPost } = await load("../functions/mcp.js");
    const request = new Request(`https://${host}/mcp`, {
      method: "POST",
      body: raw ?? JSON.stringify(body),
      headers: { "user-agent": ua, "x-forwarded-for": "203.0.113.9" },
    });
    Object.defineProperty(request, "cf", { value: { country, asn: 3320, city: "Köln" } });
    const res = await onRequestPost({ request, env, waitUntil: (p) => waits.push(p) });
    await Promise.all(waits);
    return res;
  };
  const lines = () => puts.flatMap((p) => p.body.trim().split("\n").map((l) => JSON.parse(l)));
  return { post, puts, lines };
}

test("initialize logs the client name and version, country and a short user agent, and no IP", async () => {
  const { post, puts, lines } = setup();
  await post({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", clientInfo: { name: "claude-ai", version: "0.1.0" } } });
  assert.equal(puts.length, 1);
  assert.match(puts[0].key, /^mcp-usage\/raw\/\d{4}-\d{2}-\d{2}\/\d{9}-[0-9a-z]{6}\.ndjson$/);
  const [ev] = lines();
  assert.equal(ev.method, "initialize");
  assert.deepEqual(ev.client, { name: "claude-ai", version: "0.1.0" });
  assert.equal(ev.proto, "2025-06-18");
  assert.equal(ev.ua, "Claude-User/1.0");
  assert.equal(ev.country, "DE");
  assert.equal(ev.site, "prod");
  assert.equal(ev.ok, true);
  assert.equal(typeof ev.ms, "number");
  assert.doesNotMatch(puts[0].body, /203\.0\.113|Köln|3320/);
});

test("a tool call keeps cleaned arguments: rounded position, postcode region, enums, unknown keys by name", async () => {
  const { post, lines } = setup();
  await post({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "find_chargers", arguments: {
    lat: 50.93812, lon: 6.95234, radius_km: 5, plugs: ["ccs", "nope"], only: ["free"], secret: "x", near: "50667 Köln",
  } } });
  const [ev] = lines();
  assert.equal(ev.tool, "find_chargers");
  assert.equal(ev.args.lat, 50.9);
  assert.equal(ev.args.lon, 7);
  assert.equal(ev.args.radius_km, 5);
  assert.equal(ev.args.near, "50xxx Köln");
  assert.deepEqual(ev.args.only, ["free"]);
  assert.equal(ev.args.plugs[1], "other");
  assert.deepEqual(ev.args._unknown_keys, ["secret"]);
  assert.equal("secret" in ev.args, false);
});

test("free text loses e-mails, VINs and long numbers", async () => {
  const { cleanText } = await load("../lib/mcp-usage.js");
  assert.equal(cleanText("mail me at a.b@example.com"), "mail me at [email]");
  assert.equal(cleanText("VIN WVWZZZ1KZAW123456 Golf"), "VIN [vin] Golf");
  assert.equal(cleanText("Nutzfahrzeugmarkt"), "Nutzfahrzeugmarkt");
  assert.equal(cleanText("call 01761234567"), "call [number]");
  assert.equal(cleanText("Golf 2019"), "Golf 2019");
});

test("errors are logged with a short reason, batches as one object, previews marked", async () => {
  const { post, puts, lines } = setup();
  await post([
    { jsonrpc: "2.0", id: 1, method: "nope" },
    { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "find_chargers", arguments: { near: "Atlantis" } } },
    { jsonrpc: "2.0", method: "notifications/initialized" },
  ], { host: "pr-9.alloland-cars.pages.dev" });
  assert.equal(puts.length, 1);
  const evs = lines();
  assert.equal(evs.length, 3);
  assert.equal(evs[0].err, "rpc -32601");
  assert.equal(evs[1].ok, false);
  assert.ok(evs[1].err.length > 0 && evs[1].err.length <= 120);
  assert.equal(evs[2].ok, true);
  assert.ok(evs.every((e) => e.site === "preview"));
});

test("bad JSON is logged as a parse error", async () => {
  const { post, lines } = setup();
  const res = await post(null, { raw: "{" });
  assert.equal(res.status, 400);
  assert.equal(lines()[0].method, "parse_error");
});

test("MCP_USAGE=off stops logging", async () => {
  const { post, puts } = setup({ MCP_USAGE: "off" });
  await post({ jsonrpc: "2.0", id: 1, method: "ping" });
  assert.equal(puts.length, 0);
});

test("a failing R2 write does not break the answer", async () => {
  const { onRequestPost } = await load("../functions/mcp.js");
  const env = { DATA: { get: async () => null, put: async () => { throw new Error("R2 down"); } } };
  const waits = [];
  const res = await onRequestPost({
    request: new Request("https://cars.allo.land/mcp", { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }) }),
    env,
    waitUntil: (p) => waits.push(p),
  });
  await Promise.all(waits);
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).result, {});
});

test("the shared usage counter gets sessions, tool calls and errors, only on cars.allo.land", async () => {
  const counts = [];
  const COUNT = { count: async (site, feature, country) => counts.push([site, feature, country]) };
  const { post } = setup({ COUNT });
  await post([
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { clientInfo: { name: "x" } } },
    { jsonrpc: "2.0", id: 2, method: "tools/list" },
    { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "find_chargers", arguments: { near: "Atlantis" } } },
  ]);
  assert.deepEqual(counts, [
    ["cars-mcp", "session", "DE"],
    ["cars-mcp", "tool_find_chargers", "DE"],
    ["cars-mcp", "error", "DE"],
  ]);
  counts.length = 0;
  await post({ jsonrpc: "2.0", id: 1, method: "initialize" }, { host: "pr-1.alloland-cars.pages.dev" });
  assert.equal(counts.length, 0);
});

test("a failing counter does not stop the R2 log or the answer", async () => {
  const { post, puts } = setup({ COUNT: { count: async () => { throw new Error("down"); } } });
  const res = await post({ jsonrpc: "2.0", id: 1, method: "initialize" });
  assert.equal(res.status, 200);
  assert.equal(puts.length, 1);
});
