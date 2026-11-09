// Usage log for the hosted MCP server (functions/mcp.js), kept for later analysis at no cost.
//
// Each POST to /mcp writes one small NDJSON object to the EV bucket (binding DATA), one line per JSON-RPC
// request: mcp-usage/raw/<YYYY-MM-DD>/<HHMMSSmmm>-<random>.ndjson. It is private: only <project>/public/ is
// served under /data/. pipelines/mcp_usage/rollup.py merges each finished day into
// mcp-usage/derived/daily/<day>.ndjson and adds a line to mcp-usage/derived/summary.json.
//
// What a line holds (and what it never holds):
//   t        time (UTC, ISO)            site     "prod" (cars.allo.land) or "preview"
//   method   JSON-RPC method            tool     tool name, for tools/call
//   args     the tool's arguments, cleaned (see cleanArgs): enum values, numbers, car models and towns kept;
//            positions rounded to 0.1° (about 10 km); postcodes cut to their first two digits; anything that
//            looks like an e-mail, a VIN or a long number replaced; keys the tool does not know by name only
//   client   {name, version} the assistant sends with initialize        proto  protocol version asked for
//   ua       first product token of the User-Agent header, e.g. "Claude-User/1.0"
//   country  two-letter country from Cloudflare (request.cf.country)
//   ms       time taken to answer, in milliseconds
//   ok       false on a JSON-RPC error or a tool error                  err    short error text
// No IP address, no session or user ID, no cookie, and nothing from the answer.
//
// Free-tier budget: one R2 write (class A operation) per POST, against 1 million a month for the whole
// account. To stop logging, set MCP_USAGE = "off" under [vars] in site/wrangler.toml.

const MAX_TEXT = 80;

export function cleanText(value, max = MAX_TEXT) {
  return String(value)
    .slice(0, 200)
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/\b(?=[A-HJ-NPR-Z]*\d)[A-HJ-NPR-Z0-9]{17}\b/gi, "[vin]")
    .replace(/\d{6,}/g, "[number]")
    .replace(/\b(\d{2})\d{3}\b/g, "$1xxx") // German postcode -> first two digits (postal region)
    .replace(/[\u0000-\u001f]/g, " ")
    .trim()
    .slice(0, max);
}

const POSITION = new Set(["lat", "lon", "latitude", "longitude"]);

// Keeps what helps to see how the tools are used and drops what could point to a person.
export function cleanArgs(tool, args) {
  if (!args || typeof args !== "object" || Array.isArray(args)) return undefined;
  const props = (tool && tool.inputSchema && tool.inputSchema.properties) || {};
  const out = {};
  const unknown = [];
  for (const [key, value] of Object.entries(args).slice(0, 20)) {
    const spec = props[key];
    if (!spec) {
      unknown.push(cleanText(key, 30));
      continue;
    }
    if (value === null || value === undefined) continue;
    if (POSITION.has(key)) {
      out[key] = typeof value === "number" && Number.isFinite(value) ? Math.round(value * 10) / 10 : "invalid";
    } else if (spec.type === "number" || spec.type === "integer") {
      out[key] = typeof value === "number" && Number.isFinite(value) ? value : "invalid";
    } else if (spec.type === "array") {
      const allowed = spec.items && spec.items.enum;
      out[key] = Array.isArray(value)
        ? value.slice(0, 10).map((v) => (allowed ? (allowed.includes(v) ? v : "other") : cleanText(v, 30)))
        : "invalid";
    } else if (spec.enum) {
      out[key] = spec.enum.includes(value) ? value : "other";
    } else if (typeof value === "string") {
      out[key] = cleanText(value);
    } else {
      out[key] = typeof value;
    }
  }
  if (unknown.length) out._unknown_keys = unknown.slice(0, 10);
  return out;
}

const userAgent = (request) => {
  const ua = request.headers.get("user-agent") || "";
  const first = ua.trim().split(/[\s(]/)[0];
  return first ? cleanText(first, 60) : undefined;
};

// One line for one JSON-RPC message and its answer (answer = null for a notification).
export function usageEvent({ msg, answer, tools, ms, at = new Date() }) {
  const ev = { t: at.toISOString(), method: msg && typeof msg.method === "string" ? cleanText(msg.method, 60) : "invalid" };
  const params = (msg && msg.params && typeof msg.params === "object" && msg.params) || {};
  if (ev.method === "initialize") {
    const info = params.clientInfo || {};
    if (info.name) ev.client = { name: cleanText(info.name, 60), version: info.version ? cleanText(info.version, 30) : undefined };
    if (params.protocolVersion) ev.proto = cleanText(params.protocolVersion, 20);
  }
  if (ev.method === "tools/call") {
    const tool = tools.find((t) => t.name === params.name);
    ev.tool = tool ? tool.name : cleanText(params.name || "", 60) || "missing";
    const args = cleanArgs(tool, params.arguments);
    if (args && Object.keys(args).length) ev.args = args;
  }
  ev.ms = Math.max(0, Math.round(ms));
  if (answer && answer.error) {
    ev.ok = false;
    ev.err = `rpc ${answer.error.code}`;
  } else if (answer && answer.result && answer.result.isError) {
    ev.ok = false;
    const text = answer.result.content && answer.result.content[0] && answer.result.content[0].text;
    ev.err = cleanText(text || "tool error", 120);
  } else {
    ev.ok = true;
  }
  return ev;
}

const pad = (n, w = 2) => String(n).padStart(w, "0");

export function rawKey(at = new Date(), rand = Math.random) {
  const day = at.toISOString().slice(0, 10);
  const time = pad(at.getUTCHours()) + pad(at.getUTCMinutes()) + pad(at.getUTCSeconds()) + pad(at.getUTCMilliseconds(), 3);
  const id = Math.floor(rand() * 36 ** 6).toString(36).padStart(6, "0");
  return `mcp-usage/raw/${day}/${time}-${id}.ndjson`;
}

// Adds request-wide fields and writes the lines to R2. Never throws: logging must not break an answer.
export function saveUsage({ request, env, waitUntil, events, at = new Date() }) {
  try {
    if (!events.length || !env || !env.DATA || typeof env.DATA.put !== "function") return;
    if (String(env.MCP_USAGE || "").toLowerCase() === "off") return;
    const host = new URL(request.url).hostname;
    const shared = {
      site: host === "cars.allo.land" ? "prod" : "preview",
      ua: userAgent(request),
      country: request.cf && typeof request.cf.country === "string" ? request.cf.country.slice(0, 2) : undefined,
    };
    const body = events.filter(Boolean).map((ev) => JSON.stringify({ ...ev, ...shared })).join("\n") + "\n";
    const write = env.DATA.put(rawKey(at), body, { httpMetadata: { contentType: "application/x-ndjson" } })
      .catch(() => {});
    if (waitUntil) waitUntil(write);
  } catch {
    // ignore
  }
}
