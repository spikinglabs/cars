/* "Can I live here without a wallbox?": public charging around one point, as a plain verdict.
   Used by the charger map (/chargers/), by the hosted MCP server (find_chargers) and by tests in Node.
   No DOM, no network: give it the stations around the point (at least everything within 5 km).

   Counts leave out customer-only chargers (supermarkets, hotels), since residents cannot rely on them.
   Verdict:  easy  at least 6 charge points within 1 km and a fast charger (50 kW+) within 3 km
             ok    at least 2 charge points within 1 km, or a fast charger within 5 km
             hard  neither */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ChargeHere = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var CUSTOMERS_ONLY = 8, FAST_KW = 50;
  var RULES = { easy_points_1km: 6, easy_fast_km: 3, ok_points_1km: 2, ok_fast_km: 5 };

  function km(aLat, aLon, bLat, bLon) {
    var R = 6371, rad = Math.PI / 180;
    var dLat = (bLat - aLat) * rad, dLon = (bLon - aLon) * rad;
    var h = Math.pow(Math.sin(dLat / 2), 2) + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.pow(Math.sin(dLon / 2), 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  /* stations: [{ lat, lon, kw, points, flags }]  ->
     { points_1km, locations_1km, points_3km, fast_points_3km, nearest_km, nearest_fast_km, verdict } */
  function summarize(stations, lat, lon) {
    var out = { points_1km: 0, locations_1km: 0, points_3km: 0, fast_points_3km: 0, nearest_km: null, nearest_fast_km: null, verdict: "hard" };
    (stations || []).forEach(function (s) {
      if (s.flags & CUSTOMERS_ONLY) return;
      var d = km(lat, lon, s.lat, s.lon), p = s.points || 1;
      if (out.nearest_km == null || d < out.nearest_km) out.nearest_km = d;
      if (s.kw >= FAST_KW && (out.nearest_fast_km == null || d < out.nearest_fast_km)) out.nearest_fast_km = d;
      if (d <= 1) { out.points_1km += p; out.locations_1km += 1; }
      if (d <= 3) { out.points_3km += p; if (s.kw >= FAST_KW) out.fast_points_3km += p; }
    });
    var fast = out.nearest_fast_km;
    if (out.points_1km >= RULES.easy_points_1km && fast != null && fast <= RULES.easy_fast_km) out.verdict = "easy";
    else if (out.points_1km >= RULES.ok_points_1km || (fast != null && fast <= RULES.ok_fast_km)) out.verdict = "ok";
    ["nearest_km", "nearest_fast_km"].forEach(function (k) { if (out[k] != null) out[k] = Math.round(out[k] * 100) / 100; });
    return out;
  }

  return { RULES: RULES, summarize: summarize, km: km };
});
