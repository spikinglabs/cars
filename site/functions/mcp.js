// Hosted, read-only MCP server at https://cars.allo.land/mcp (Streamable HTTP, stateless).
// No sessions, no streaming, no login: every POST carries one JSON-RPC message (or a batch) and gets a
// JSON answer. The tools read the same R2 files the /data/ function serves, so it costs nothing extra
// beyond Pages Functions' free requests. Tools live in ../lib/mcp-tools.js.
import { onRequestGet as readData } from "./data/[[path]].js";
import { TOOLS, ToolError } from "../lib/mcp-tools.js";

const VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const SERVER = { name: "allo-cars", title: "Allo Cars", version: "1.0.0", websiteUrl: "https://cars.allo.land/" };
const INSTRUCTIONS =
  "Allo Cars (cars.allo.land) has open data for drivers in Germany: official consumption per car model, side-by-side " +
<<<<<<< HEAD
  "comparison and rankings of car models, Euro NCAP / Green NCAP stars and ADAC breakdown rates, recalls " +
=======
  "comparison of car models, recalls " +
>>>>>>> origin/claude/project-thread-269eby
  "(EU Safety Gate incl. every KBA recall, and US NHTSA), fuel, charging and electricity prices, new registrations " +
  "and public chargers. All tools are read-only and need no account. Results carry a page link to the same view on " +
  "cars.allo.land (also in German under /de/ and Chinese under /zh/); share it with the user. Prices are averages " +
  "and estimates; recalls for one car depend on its VIN.";
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, GET, OPTIONS",
  "access-control-allow-headers": "content-type, accept, mcp-protocol-version, mcp-session-id, authorization",
  "access-control-expose-headers": "mcp-protocol-version",
};
const TTL_MS = 5 * 60 * 1000;
const cache = new Map(); // path -> { at, value }, per isolate: repeated lookups skip R2

const json = (body, status = 200, extra = {}) =>
  new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...CORS, ...extra },
  });

// A getter for /data/<path>: parsed JSON, or text for CSV. Throws when the file is missing.
export function dataGetter(env, now = Date.now) {
  return async (path) => {
    const hit = cache.get(path);
    if (hit && now() - hit.at < TTL_MS) return hit.value;
    const res = await readData({ params: { path: path.split("/") }, env });
    if (res.status !== 200) throw new Error(`${res.status} for /data/${path}`);
    const value = path.endsWith(".json") ? await res.json() : await res.text();
    cache.set(path, { at: now(), value });
    if (cache.size > 200) cache.delete(cache.keys().next().value);
    return value;
  };
}

const ok = (id, result) => ({ jsonrpc: "2.0", id, result });
const fail = (id, code, message) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

export async function handle(msg, get) {
  if (!msg || typeof msg !== "object" || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    return fail(msg && msg.id, -32600, "Invalid Request");
  }
  const { id, method, params = {} } = msg;
  if (id === undefined || id === null) return null; // a notification (initialized, cancelled, ...): nothing to answer
  switch (method) {
    case "initialize": {
      const asked = params.protocolVersion;
      return ok(id, {
        protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER,
        instructions: INSTRUCTIONS,
      });
    }
    case "ping":
      return ok(id, {});
    case "tools/list":
      return ok(id, { tools: TOOLS.map(({ run, ...t }) => t) });
    case "resources/list":
      return ok(id, { resources: [] });
    case "resources/templates/list":
      return ok(id, { resourceTemplates: [] });
    case "prompts/list":
      return ok(id, { prompts: [] });
    case "tools/call": {
      const tool = TOOLS.find((t) => t.name === params.name);
      if (!tool) return fail(id, -32602, `Unknown tool: ${params.name}`);
      try {
        const out = await tool.run(get, params.arguments || {});
        return ok(id, {
          content: [{ type: "text", text: JSON.stringify(out) }],
          structuredContent: out,
          isError: Boolean(out && out.error),
        });
      } catch (e) {
        const text = e instanceof ToolError ? e.message : `Could not run ${tool.name}: ${e.message}`;
        return ok(id, { content: [{ type: "text", text }], isError: true });
      }
    }
    default:
      return fail(id, -32601, `Method not found: ${method}`);
  }
}

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json(fail(null, -32700, "Parse error"), 400);
  }
  const get = dataGetter(env);
  if (Array.isArray(body)) {
    if (!body.length) return json(fail(null, -32600, "Invalid Request"), 400);
    const out = (await Promise.all(body.map((m) => handle(m, get)))).filter(Boolean);
    return out.length ? json(out) : json(null, 202);
  }
  const out = await handle(body, get);
  return out ? json(out) : json(null, 202);
}

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

// No server-to-client stream (stateless server), as the spec allows: 405. A browser gets a short note.
export function onRequestGet({ request }) {
  const accept = request.headers.get("accept") || "";
  if (accept.includes("text/event-stream")) return new Response("Method Not Allowed", { status: 405, headers: { allow: "POST", ...CORS } });
  return new Response(
    "This is the Allo Cars MCP server for AI assistants (read-only, no login).\n" +
      "Add https://cars.allo.land/mcp as a custom connector in Claude (Settings → Connectors) or any MCP client.\n" +
      "Tools: " + TOOLS.map((t) => t.name).join(", ") + "\nMore: https://cars.allo.land/open-data/#ai\n",
    { status: 200, headers: { "content-type": "text/plain; charset=utf-8", ...CORS } },
  );
}

export function onRequestDelete() {
  return new Response("Method Not Allowed", { status: 405, headers: { allow: "POST", ...CORS } });
}
