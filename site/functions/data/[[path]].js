// Serves /data/<project>/<path> from R2 key <project>/public/<path>.
// The bucket is shared: each project has its own top-level folder, and only
// its public/ subfolder is reachable from the web.
// Public files are arranged by region: /data/<project>/<region>/<file>, region = de, eu, ...
// (see public/regions.json). Example:
//   /data/charging-prices/de/latest.json -> charging-prices/public/de/latest.json
// While pipelines move from the old flat layout (Germany only, /data/<project>/<file>), each
// layout falls back to the other, so old links keep working and new ones work before the move.
// Flat URLs prefer the de/ folder, so they never serve a stale flat copy after the move.
const TYPES = {
  json: "application/json; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  txt: "text/plain; charset=utf-8",
};
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
// Which R2 binding holds each project's folder (default: DATA, the EV bucket).
const BUCKETS = { "fuel-prices": "ICE" };
const LEGACY_REGION = "de";

export async function onRequestGet({ params, env }) {
  const parts = Array.isArray(params.path) ? params.path : [params.path].filter(Boolean);
  if (parts.length < 2 || !parts.every((p) => SEGMENT.test(p) && p !== "..")) {
    return new Response("Not found", { status: 404 });
  }
  const [project, ...rest] = parts;
  const bucket = env[BUCKETS[project] || "DATA"];
  if (!bucket) return new Response("Not found", { status: 404 });
  // Flat URLs try the Germany folder first (it is the fresh copy once pipelines write it), then the
  // old flat key. Germany URLs try their folder first, then the old flat key.
  const keys = rest.length === 1 ? [[LEGACY_REGION, ...rest], rest]
    : rest[0] === LEGACY_REGION ? [rest, rest.slice(1)] : [rest];
  let object = null;
  for (const k of keys) {
    object = await bucket.get(`${project}/public/${k.join("/")}`);
    if (object) break;
  }
  if (!object) return new Response("Not found", { status: 404 });
  const ext = rest[rest.length - 1].split(".").pop();
  return new Response(object.body, {
    headers: {
      "content-type": TYPES[ext] || "application/octet-stream",
      "cache-control": "public, max-age=600",
      "access-control-allow-origin": "*",
      etag: object.httpEtag,
    },
  });
}
