// Serves /data/<path> from the R2 bucket's public/<path>.
// Example: /data/charging-prices/latest.json -> public/charging-prices/latest.json
const TYPES = {
  json: "application/json; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  txt: "text/plain; charset=utf-8",
};

export async function onRequestGet({ params, env }) {
  const parts = Array.isArray(params.path) ? params.path : [params.path].filter(Boolean);
  if (!parts.length || parts.some((p) => p === ".." || p === "")) {
    return new Response("Not found", { status: 404 });
  }
  const object = await env.DATA.get("public/" + parts.join("/"));
  if (!object) return new Response("Not found", { status: 404 });
  const ext = parts[parts.length - 1].split(".").pop();
  return new Response(object.body, {
    headers: {
      "content-type": TYPES[ext] || "application/octet-stream",
      "cache-control": "public, max-age=600",
      "access-control-allow-origin": "*",
      etag: object.httpEtag,
    },
  });
}
