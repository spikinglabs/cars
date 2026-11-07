// Serves /data/<project>/<path> from R2 key <project>/public/<path>.
// The bucket is shared: each project has its own top-level folder, and only
// its public/ subfolder is reachable from the web.
// Example: /data/charging-prices/latest.json -> charging-prices/public/latest.json
const TYPES = {
  json: "application/json; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  txt: "text/plain; charset=utf-8",
};
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
// Which R2 binding holds each project's folder (default: DATA, the EV bucket).
const BUCKETS = { "fuel-prices": "ICE" };

export async function onRequestGet({ params, env }) {
  const parts = Array.isArray(params.path) ? params.path : [params.path].filter(Boolean);
  if (parts.length < 2 || !parts.every((p) => SEGMENT.test(p) && p !== "..")) {
    return new Response("Not found", { status: 404 });
  }
  const [project, ...rest] = parts;
  const bucket = env[BUCKETS[project] || "DATA"];
  if (!bucket) return new Response("Not found", { status: 404 });
  const object = await bucket.get(`${project}/public/${rest.join("/")}`);
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
