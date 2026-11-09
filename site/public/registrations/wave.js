/* The electric wave in numbers: how fast electric cars are taking over new registrations in Germany.
   Used by /registrations/ (EN, DE, ZH), the hosted MCP server (get_registrations) and tests in Node. No DOM, no network.
   Input rows are the monthly market (market.csv): { month: "YYYY-MM", total, bev, phev, bev_share }. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.EvWave = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // The E-Auto grant applies to new cars first registered from January 2026 (see /ev-grant/).
  var GRANT_FROM = "2026-01";

  function yearAgo(month) { return (Number(month.slice(0, 4)) - 1) + month.slice(4); }
  function sum(rows, k) { return rows.reduce(function (s, r) { return s + (Number(r[k]) || 0); }, 0); }
  function pct(a, b) { return b ? Math.round((a / b - 1) * 1000) / 10 : null; }
  function share(bev, total) { return total ? Math.round(bev / total * 1000) / 10 : null; }

  /* -> { month, share, bev, share_year_ago, bev_year_ago, bev_change_pct,
          ytd: { year, months, bev, bev_prev, change_pct, share, share_prev },
          since_grant: { from, months, bev, share, share_before } , record: { month, share } } */
  function summarize(rows, grantFrom) {
    grantFrom = grantFrom || GRANT_FROM;
    rows = (rows || []).filter(function (r) { return r && r.month && Number(r.total) > 0; })
      .sort(function (a, b) { return a.month < b.month ? -1 : 1; });
    if (!rows.length) return null;
    var by = {};
    rows.forEach(function (r) { by[r.month] = r; });
    var last = rows[rows.length - 1], ago = by[yearAgo(last.month)] || null;
    var year = last.month.slice(0, 4), mm = last.month.slice(5);
    var ytd = rows.filter(function (r) { return r.month.slice(0, 4) === year; });
    var prev = rows.filter(function (r) { return r.month.slice(0, 4) === String(year - 1) && r.month.slice(5) <= mm; });
    var since = rows.filter(function (r) { return r.month >= grantFrom; });
    var before = rows.filter(function (r) { return r.month < grantFrom && r.month >= yearAgo(grantFrom); });
    var rec = rows.reduce(function (b, r) { var s = share(r.bev, r.total); return s != null && (!b || s > b.share) ? { month: r.month, share: s } : b; }, null);
    return {
      month: last.month, share: share(last.bev, last.total), bev: Number(last.bev) || 0,
      share_year_ago: ago ? share(ago.bev, ago.total) : null, bev_year_ago: ago ? Number(ago.bev) || 0 : null,
      bev_change_pct: ago ? pct(last.bev, ago.bev) : null,
      ytd: {
        year: Number(year), months: ytd.length, bev: sum(ytd, "bev"), bev_prev: prev.length ? sum(prev, "bev") : null,
        change_pct: prev.length ? pct(sum(ytd, "bev"), sum(prev, "bev")) : null,
        share: share(sum(ytd, "bev"), sum(ytd, "total")), share_prev: prev.length ? share(sum(prev, "bev"), sum(prev, "total")) : null
      },
      since_grant: since.length ? {
        from: grantFrom, months: since.length, bev: sum(since, "bev"), share: share(sum(since, "bev"), sum(since, "total")),
        share_before: before.length ? share(sum(before, "bev"), sum(before, "total")) : null
      } : null,
      record: rec
    };
  }

  /* Fastest-growing electric models: series is [{ slug, brand, model, months: [{ month, bev }] }].
     Compares the last `span` months with the same months a year before; most extra cars first.
     -> [{ slug, brand, model, bev, bev_prev, extra, change_pct, is_new }] */
  function growth(series, latestMonth, span, limit) {
    span = span || 3;
    var recent = [], m = latestMonth;
    for (var i = 0; i < span; i++) {
      recent.push(m);
      var y = Number(m.slice(0, 4)), mo = Number(m.slice(5)) - 1;
      if (mo === 0) { y -= 1; mo = 12; }
      m = y + "-" + (mo < 10 ? "0" : "") + mo;
    }
    var past = recent.map(yearAgo);
    var out = (series || []).map(function (s) {
      var by = {};
      (s.months || []).forEach(function (r) { by[r.month] = Number(r.bev) || 0; });
      var now = recent.reduce(function (t, k) { return t + (by[k] || 0); }, 0);
      var then = past.reduce(function (t, k) { return t + (by[k] || 0); }, 0);
      // under 50 cars a year before the model was barely on sale (a launch, a new version): "new", not +10,000 %
      return { slug: s.slug, brand: s.brand, model: s.model, bev: now, bev_prev: then, extra: now - then, change_pct: then >= 50 ? pct(now, then) : null, is_new: then < 50 };
    }).filter(function (r) { return r.extra > 0; });
    out.sort(function (a, b) { return b.extra - a.extra; });
    return out.slice(0, limit || 8);
  }

  return { GRANT_FROM: GRANT_FROM, summarize: summarize, growth: growth };
});
