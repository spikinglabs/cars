// The site has no 404 page, so Pages would answer unknown paths with the home page (200, HTML).
// MCP clients probe /.well-known/oauth-* to see whether /mcp needs a login; a plain 404 tells them it does not.
export function onRequest() {
  return new Response(JSON.stringify({ error: "not_found" }), {
    status: 404,
    headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" },
  });
}
