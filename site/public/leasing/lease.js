/* Leasing mileage: how many km a year to contract, and where the odometer stands against the contract.
   Used by /leasing/ and the lease card on My cars in the browser, by the hosted MCP server
   (site/lib/mcp-tools.js, plan_lease_mileage) and by tests in Node. No DOM, no network.

   Allowance: the contract allows `km` a year, spread evenly over the term, so on any day the allowed
   odometer is start odometer + km × years × (days since start / days of the term).
   Settlement at the end: km over the allowance (beyond any tolerance) cost `extra` €/km, km under it
   (beyond the tolerance) are refunded at `refund` €/km. Contracts differ (refund caps, tolerances only
   one way): the page says so. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AlloLease = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var DAY = 86400000;
  // how often a usage scenario happens in a year: working weeks (52 minus holidays and public holidays), weeks, months, years
  var PER = { wk: 46, w: 52, m: 12, y: 1 };
  var DEFAULTS = { months: 36, km: 15000, odo0: 0, extra: 0.10, refund: 0.05, tol: 0, rate: 6, buf: 10 };
  var PRESETS = [
    { id: "commute", km: 40, n: 5, per: "wk" },
    { id: "errands", km: 15, n: 3, per: "w" },
    { id: "weekend", km: 120, n: 2, per: "m" },
    { id: "holiday", km: 2400, n: 1, per: "y" },
    { id: "family", km: 600, n: 3, per: "y" }
  ];

  var num = function (v, lo, hi) { if (v == null || v === "") return null; v = Number(v); return isFinite(v) && v >= lo && v <= hi ? v : null; };
  function day(s) { // "YYYY-MM-DD" -> ms at UTC midnight, or null
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
    if (!m) return null;
    var t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
    return isFinite(t) && new Date(t).getUTCDate() === +m[3] ? t : null;
  }
  function iso(t) { return new Date(t).toISOString().slice(0, 10); }
  function addMonths(t, n) {
    var d = new Date(t), y = d.getUTCFullYear(), m = d.getUTCMonth() + n, dd = d.getUTCDate();
    var last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return Date.UTC(y, m, Math.min(dd, last));
  }
  var endOfMonth = function (t) { var d = new Date(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0); };
  var endOfQuarter = function (t) { var d = new Date(t); return Date.UTC(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3) * 3 + 3, 0); };
  var endOfYear = function (t) { return Date.UTC(new Date(t).getUTCFullYear(), 11, 31); };

  // Usage scenarios -> km a year. Each item: { label, km (per time), n (times per period), per: wk|w|m|y }
  function plan(items) {
    var rows = (items || []).map(function (x) {
      var km = num(x.km, 0, 100000) || 0, n = num(x.n, 0, 1000) || 0, per = PER[x.per] ? x.per : "w";
      return { label: String(x.label || x.id || "").slice(0, 60), id: x.id || "", km: km, n: n, per: per, year: Math.round(km * n * PER[per]) };
    });
    var total = rows.reduce(function (s, r) { return s + r.year; }, 0);
    return { rows: rows, total: total };
  }
  // contract km a year for a yearly need with a safety margin, rounded up to lease offer steps
  function recommend(total, buf) {
    var b = num(buf, 0, 100); if (b == null) b = DEFAULTS.buf;
    var want = total * (1 + b / 100);
    return { need: Math.round(total), with_margin: Math.round(want), step_2500: Math.max(2500, Math.ceil(want / 2500) * 2500), step_5000: Math.max(5000, Math.ceil(want / 5000) * 5000) };
  }

  // What each allowance would cost compared with contracting exactly `drive` km a year, if you drive `drive`:
  // a higher allowance raises the monthly rate by `rate` € per 1,000 km a year; the end settlement pays or refunds the difference.
  function settle(diffKm, c) { // diffKm > 0: over the allowance
    var tol = c.tol || 0;
    if (diffKm > tol) return Math.round((diffKm - tol) * c.extra);
    if (diffKm < -tol) return -Math.round((-diffKm - tol) * c.refund);
    return 0;
  }
  function options(drive, c, steps) {
    var years = c.months / 12, base = Math.max(2500, Math.round(drive / 2500) * 2500);
    var list = steps || [-5000, -2500, 0, 2500, 5000].map(function (d) { return base + d; }).filter(function (a) { return a >= 2500; });
    return list.map(function (a) {
      var rateCost = Math.round((a - base) / 1000 * c.rate * c.months);
      var end = settle((drive - a) * years, c);
      return { km: a, rate_eur: rateCost, settlement_eur: end, total_eur: rateCost + end };
    });
  }

  function norm(c) {
    var o = {};
    o.start = day(c.start);
    o.months = num(c.months, 1, 120) || DEFAULTS.months;
    o.km = num(c.km, 1000, 200000) || DEFAULTS.km;
    o.odo0 = num(c.odo0, 0, 2000000) || 0;
    o.extra = num(c.extra, 0, 5); if (o.extra == null) o.extra = DEFAULTS.extra;
    o.refund = num(c.refund, 0, 5); if (o.refund == null) o.refund = DEFAULTS.refund;
    o.tol = num(c.tol, 0, 100000) || 0;
    o.rate = num(c.rate, 0, 1000); if (o.rate == null) o.rate = DEFAULTS.rate;
    o.end = o.start != null ? addMonths(o.start, o.months) : null;
    o.total = Math.round(o.km * o.months / 12);
    return o;
  }
  function allowedAt(c, t) {
    var f = Math.min(1, Math.max(0, (t - c.start) / (c.end - c.start)));
    return c.odo0 + c.total * f;
  }
  // the newest reading on or before `today` (readings: [{ date, km }]), or the handover
  function latest(c, readings, today) {
    var r = (readings || []).map(function (x) { return { t: day(x.date), km: Number(x.km) }; })
      .filter(function (x) { return x.t != null && isFinite(x.km) && x.t <= today; })
      .sort(function (a, b) { return a.t - b.t; });
    return r.length ? r[r.length - 1] : { t: c.start, km: c.odo0, handover: true };
  }
  // km a day so far, from handover to the newest reading; null with less than two weeks to go on
  function pace(c, r) {
    var days = (r.t - c.start) / DAY;
    return days >= 14 && r.km >= c.odo0 ? (r.km - c.odo0) / days : null;
  }

  /* Where the contract stands. c: contract fields (start "YYYY-MM-DD", months, km a year, odo0, extra, refund, tol);
     readings: [{ date, km }]; opts: { today: "YYYY-MM-DD", per_month: km a month from now on (else the pace so far,
     else plan_year / 12, else the allowance) , plan_year } */
  function track(cIn, readings, opts) {
    opts = opts || {};
    var c = norm(cIn);
    if (c.start == null) return null;
    var today = day(opts.today) || day(iso(Date.now()));
    var r = latest(c, readings, today), sofar = pace(c, r);
    var pm = num(opts.per_month, 0, 50000), source = "set";
    if (pm == null && sofar != null) { pm = sofar * 365.25 / 12; source = "pace"; }
    if (pm == null && num(opts.plan_year, 1, 500000)) { pm = opts.plan_year / 12; source = "plan"; }
    if (pm == null) { pm = c.km / 12; source = "allowance"; }
    var perDay = pm * 12 / 365.25;
    var at = function (t) { return t <= r.t ? null : r.km + perDay * (t - r.t) / DAY; };
    var odoAt = function (t) { var v = at(t); return v == null ? r.km : v; };
    var pts = [["today", today], ["month", endOfMonth(today)], ["quarter", endOfQuarter(today)], ["year", endOfYear(today)], ["end", c.end]];
    var seen = {}, checkpoints = [];
    pts.forEach(function (p) {
      var t = p[0] === "end" ? c.end : Math.min(p[1], c.end);
      if (p[0] !== "end" && p[1] > c.end) return; // after the contract ends: only the end counts
      if (t < c.start && p[0] !== "today") return;
      var key = String(t);
      if (seen[key]) { seen[key].also.push(p[0]); return; }
      var exp = Math.round(odoAt(t)), allow = Math.round(allowedAt(c, t));
      var row = { id: p[0], also: [], date: iso(t), expected_km: exp, allowed_km: allow, diff_km: exp - allow };
      seen[key] = row; checkpoints.push(row);
    });
    var endRow = checkpoints[checkpoints.length - 1];
    var left = Math.max(0, (c.end - Math.max(today, r.t)) / DAY);
    var room = c.odo0 + c.total - r.km; // km still allowed to the end, from the newest reading
    return {
      contract: { start: iso(c.start), end: iso(c.end), months: c.months, km_per_year: c.km, total_km: c.total, start_odometer: c.odo0, extra_eur_per_km: c.extra, refund_eur_per_km: c.refund, tolerance_km: c.tol },
      reading: { date: iso(r.t), km: Math.round(r.km), handover: !!r.handover },
      pace_so_far_per_month: sofar == null ? null : Math.round(sofar * 365.25 / 12),
      per_month: Math.round(pm), per_month_source: source,
      checkpoints: checkpoints,
      end: { expected_km: endRow.expected_km, allowed_km: endRow.allowed_km, diff_km: endRow.diff_km, settlement_eur: settle(endRow.diff_km, c) },
      left_km: Math.round(room), days_left: Math.round(left),
      per_month_to_stay_within: left > 0 ? Math.max(0, Math.round(room / (left / (365.25 / 12)))) : null,
      started: today >= c.start, ended: today >= c.end
    };
  }
  // points for a chart: allowance line, readings and the projection from the newest reading to the end
  function series(cIn, readings, opts) {
    var c = norm(cIn), tr = track(cIn, readings, opts);
    if (!tr) return null;
    var rs = (readings || []).map(function (x) { return { t: day(x.date), km: Number(x.km) }; }).filter(function (x) { return x.t != null && isFinite(x.km); }).sort(function (a, b) { return a.t - b.t; });
    var r = { t: day(tr.reading.date), km: tr.reading.km };
    return {
      start: c.start, end: c.end,
      allowance: [[c.start, c.odo0], [c.end, c.odo0 + c.total]],
      readings: [[c.start, c.odo0]].concat(rs.map(function (x) { return [x.t, x.km]; })),
      projection: r.t < c.end ? [[r.t, r.km], [c.end, tr.end.expected_km]] : [],
      track: tr
    };
  }

  return { PER: PER, DEFAULTS: DEFAULTS, PRESETS: PRESETS, day: day, iso: iso, addMonths: addMonths, plan: plan, recommend: recommend, options: options, settle: settle, norm: norm, allowedAt: allowedAt, track: track, series: series };
});
