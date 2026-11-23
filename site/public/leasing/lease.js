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
      start: c.start, end: c.end, c: c,
      allowance: [[c.start, c.odo0], [c.end, c.odo0 + c.total]],
      readings: [[c.start, c.odo0]].concat(rs.map(function (x) { return [x.t, x.km]; })),
      projection: r.t < c.end ? [[r.t, r.km], [c.end, tr.end.expected_km]] : [],
      track: tr
    };
  }

  /* Km driven per calendar month of the lease, from the readings (spread evenly between two readings),
     and what is left: the questions a driver has are "how much can I still drive a month?" and
     "which months did I drive more than the allowance?". */
  function months(cIn, readings, opts) {
    var c = norm(cIn), tr = track(cIn, readings, opts);
    if (!tr) return null;
    var pts = [[c.start, c.odo0]].concat((readings || []).map(function (x) { return [day(x.date), Number(x.km)]; })
      .filter(function (x) { return x[0] != null && isFinite(x[1]) && x[0] >= c.start; }).sort(function (a, b) { return a[0] - b[0]; }));
    var last = pts[pts.length - 1][0];
    var odo = function (t) {
      for (var i = 1; i < pts.length; i++) if (t <= pts[i][0]) { var a = pts[i - 1], b = pts[i]; return b[0] === a[0] ? b[1] : a[1] + (b[1] - a[1]) * (t - a[0]) / (b[0] - a[0]); }
      return pts[pts.length - 1][1];
    };
    var near = function (t) { return pts.some(function (p) { return Math.abs(p[0] - t) <= 5 * DAY; }); };
    var d0 = new Date(c.start), rows = [];
    for (var m = 0; m < c.months; m++) {
      var a = Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() + m, d0.getUTCDate()), b = Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() + m + 1, d0.getUTCDate());
      // measured: a reading (or the handover) within 5 days of each end of the month; otherwise the month
      // only gets its share of km spread evenly between two readings further apart, so it is an estimate
      if (b <= last) rows.push({ start: iso(a), km: Math.round(odo(b) - odo(a)), kind: "past", frac: 1, est: !(near(a) && near(b)) });
      else if (a < last) rows.push({ start: iso(a), km: Math.round(odo(last) - odo(a)), kind: "now", frac: (last - a) / (b - a), est: !near(a) });
      else rows.push({ start: iso(a), km: null, kind: "future", frac: 0 });
    }
    var start = c.start, end = c.end;
    return {
      allow_per_month: c.total / c.months, per_month_to_stay_within: tr.per_month_to_stay_within, months_left: Math.round(tr.days_left / (365.25 / 12)),
      left_km: tr.left_km, used_km: Math.max(0, tr.reading.km - c.odo0), total_km: c.total,
      time_used: Math.max(0, Math.min(1, ((day(opts && opts.today) || Date.now()) - start) / (end - start))), km_used: Math.max(0, tr.reading.km - c.odo0) / c.total,
      rows: rows, track: tr
    };
  }
  /* Words for budgetHtml / barsSvg, shared by /leasing/ and My cars */
  var WORDS = {
    en: { canDrive: function (n) { return "From now on you can drive " + n + " a month"; }, avg: function (n) { return "Allowance " + n + " km a month on average"; },
      left: function (km, m) { return km + " km left for " + m + " months"; }, over: function (km) { return km + " km over the whole allowance already"; },
      time: "Lease time gone", km: "Km used", note: "Km bar past the time line = driving faster than the allowance.",
      allow: function (n) { return "allowance " + n + "/month"; }, legend: function (n) { return '<span class="sw o"></span>over the allowance <span class="sw u"></span>within <span class="sw f"></span>left: ' + n + ' km a month<br><span class="sw e"></span>hatched: estimated, the km between two readings spread evenly over the days'; } },
    de: { canDrive: function (n) { return "Ab jetzt kannst du " + n + " im Monat fahren"; }, avg: function (n) { return "Kontingent im Schnitt " + n + " km im Monat"; },
      left: function (km, m) { return "noch " + km + " km für " + m + " Monate"; }, over: function (km) { return "schon " + km + " km über dem ganzen Kontingent"; },
      time: "Laufzeit vorbei", km: "Kilometer verbraucht", note: "Kilometer-Balken hinter der Zeitlinie = schneller als das Kontingent.",
      allow: function (n) { return "Kontingent " + n + "/Monat"; }, legend: function (n) { return '<span class="sw o"></span>über dem Kontingent <span class="sw u"></span>darunter <span class="sw f"></span>übrig: ' + n + ' km im Monat<br><span class="sw e"></span>schraffiert: geschätzt, die km zwischen zwei Ablesungen gleichmäßig auf die Tage verteilt'; } },
    zh: { canDrive: function (n) { return "今后每月可开 " + n; }, avg: function (n) { return "额度平均每月 " + n + " km"; },
      left: function (km, m) { return "还剩 " + km + " km、" + m + " 个月"; }, over: function (km) { return "已经超出全部额度 " + km + " km"; },
      time: "租期已过", km: "公里已用", note: "公里条跑到时间线（竖线）前面 = 开得比额度快。",
      allow: function (n) { return "额度 " + n + "/月"; }, legend: function (n) { return '<span class="sw o"></span>开多的月份 <span class="sw u"></span>没超的月份 <span class="sw f"></span>今后每月可开 ' + n + ' km<br><span class="sw e"></span>斜线：估算，两次读数之间的公里按天平均分摊'; } }
  };
  function words(lang) { return WORDS[lang] || WORDS.en; }
  /* Option A: the km budget. o.words: canDrive(n), avg(n), left(km, months), time, km, note, over */
  function budgetHtml(m, o) {
    if (!m) return "";
    var w = o.words, fmt = o.fmt || function (v) { return String(Math.round(v)); }, pct = function (f) { return Math.round(f * 100) + "%"; };
    var pm = m.per_month_to_stay_within, tight = pm != null && pm < m.allow_per_month;
    var bar = function (label, f, txt, cls) {
      return '<div class="lb-row"><span>' + label + "</span><b>" + txt + '</b></div><div class="lb-bar"><i class="' + cls + '" style="width:' + (Math.min(1, f) * 100).toFixed(1) + '%"></i><em style="left:' + (Math.min(1, m.time_used) * 100).toFixed(1) + '%"></em></div>';
    };
    var tu = Math.max(0, Math.min(1, m.time_used));
    return '<div class="lb">' + (pm == null ? "" : '<div class="lb-big">' + w.canDrive('<b class="' + (tight ? "neg" : "pos") + '">' + fmt(pm) + " km</b>") + "</div>")
      + '<p class="lb-cap">' + w.avg(fmt(m.allow_per_month)) + (m.left_km >= 0 ? " · " + w.left(fmt(m.left_km), m.months_left) : " · " + w.over(fmt(-m.left_km))) + "</p>"
      + bar(w.time, tu, pct(tu), "t") + bar(w.km, m.km_used, pct(m.km_used) + " · " + fmt(m.used_km) + " / " + fmt(m.total_km) + " km", m.km_used > tu ? "o" : "u")
      + '<p class="lb-cap">' + w.note + "</p></div>";
  }
  /* Option B: one bar per month of the lease: past months green (within) or red (over the monthly allowance),
     the current month lighter, future months grey at the km a month that keep you within.
     o: { w, h, fmt, month(isoDate) -> "2027.1", words: { allow(n) } } */
  function barsSvg(m, o) {
    if (!m) return "";
    var W = o.w || 600, H = o.h || 200, fmt = o.fmt || function (v) { return String(Math.round(v)); }, a = m.allow_per_month;
    var fut = m.per_month_to_stay_within != null ? m.per_month_to_stay_within : a;
    var vals = m.rows.map(function (r) { return r.kind === "future" ? fut : r.kind === "now" ? r.km / Math.max(r.frac, 0.05) : r.km; });
    var mx = Math.max.apply(null, vals.concat([a * 1.5])) * 1.08, P = 4, Tp = 16, B = 20;
    var bw = (W - 2 * P) / m.rows.length, y = function (v) { return Tp + (1 - Math.max(0, v) / mx) * (H - Tp - B); };
    var f1 = function (n) { return n.toFixed(1); };
    var svg = '<svg class="lbars" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + o.words.allow(fmt(a)) + '">'
      + '<defs><pattern id="lbh" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2.2" height="5" fill="var(--ink)" opacity=".45"/></pattern></defs>';
    m.rows.forEach(function (r, i) {
      var x = P + i * bw + Math.min(1, bw * 0.12), w = Math.max(1, bw - 2 * Math.min(1, bw * 0.12)), v = r.kind === "future" ? fut : r.km;
      var cls = r.kind === "future" ? "f" : (r.kind === "now" ? r.km / Math.max(r.frac, 0.05) : r.km) > a ? "o" : "u";
      svg += '<rect class="' + cls + (r.kind === "now" ? " n" : "") + (r.est ? " e" : "") + '" x="' + f1(x) + '" y="' + f1(y(v)) + '" width="' + f1(w) + '" height="' + f1(Math.max(0, H - B - y(v))) + '"><title>' + r.start.slice(0, 7) + ": " + fmt(v) + " km</title></rect>";
      if (r.est) svg += '<rect class="h" x="' + f1(x) + '" y="' + f1(y(v)) + '" width="' + f1(w) + '" height="' + f1(Math.max(0, H - B - y(v))) + '" fill="url(#lbh)"/>';
    });
    svg += '<line class="al" x1="' + P + '" x2="' + (W - P) + '" y1="' + f1(y(a)) + '" y2="' + f1(y(a)) + '"/><text x="' + (W - P) + '" y="' + f1(y(a) - 4) + '" text-anchor="end">' + o.words.allow(fmt(a)) + "</text>";
    for (var i = 0; i < m.rows.length; i += 12) svg += '<text x="' + f1(P + i * bw) + '" y="' + (H - 5) + '">' + (o.month ? o.month(m.rows[i].start) : m.rows[i].start.slice(0, 7)) + "</text>";
    return svg + "</svg>";
  }

  return { PER: PER, DEFAULTS: DEFAULTS, PRESETS: PRESETS, day: day, iso: iso, addMonths: addMonths, plan: plan, recommend: recommend, options: options, settle: settle, norm: norm, allowedAt: allowedAt, track: track, series: series, months: months, budgetHtml: budgetHtml, barsSvg: barsSvg, words: words };
});
