/* @ds-bundle: {"format":4,"namespace":"AlloCars","components":[{"name":"Button"},{"name":"AppBar"},{"name":"CarPicker"},{"name":"ParamField"},{"name":"Segmented"},{"name":"Readout"},{"name":"StatusChip"},{"name":"LineChart"},{"name":"CompareTable"},{"name":"SourceNote"},{"name":"AIBar"},{"name":"ToolCard"}]} */
/* Allo Cars helpers. Plain functions, no framework: tools are static pages. */
(function () {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";
  /* Pages say their language on <html lang>: German pages get German number formats and words. */
  var DE = document.documentElement.lang === "de";
  var WORDS = DE ? { inputs: "Eingaben", results: "Ergebnisse", link: "Link", copied: "Kopiert" } : { inputs: "Inputs", results: "Results", link: "Link", copied: "Copied" };

  function money(x, opts) {
    opts = opts || {};
    if (x == null || isNaN(x)) return "–";
    var d = opts.digits != null ? opts.digits : Math.abs(x) >= 100 ? 0 : 2;
    try {
      return new Intl.NumberFormat(opts.locale || (DE ? "de-DE" : "en-DE"), { style: "currency", currency: opts.currency || "EUR", minimumFractionDigits: d, maximumFractionDigits: d }).format(x);
    } catch (e) { return x.toFixed(d) + " " + (opts.currency || "EUR"); }
  }
  function num(x, d) {
    if (x == null || isNaN(x)) return "–";
    d = d == null ? 1 : d;
    return Number(x).toLocaleString(DE ? "de-DE" : "en-GB", { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }

  /* URL state: every tool keeps its inputs in the query string so a person or an AI can share a filled-in link. */
  function readState(defaults) {
    var out = {}, k, q = new URLSearchParams(location.search);
    for (k in defaults) {
      var v = q.get(k);
      if (v == null) { out[k] = defaults[k]; continue; }
      if (Array.isArray(defaults[k])) out[k] = v.split(",").map(Number).filter(function (n) { return !isNaN(n); });
      else if (typeof defaults[k] === "number") out[k] = isNaN(+v) ? defaults[k] : +v;
      else out[k] = v;
    }
    return out;
  }
  function writeState(state) {
    var q = new URLSearchParams(), k;
    for (k in state) q.set(k, Array.isArray(state[k]) ? state[k].join(",") : state[k]);
    var url = location.pathname + "?" + q.toString();
    try { history.replaceState(null, "", url); } catch (e) {}
    return location.origin + url;
  }

  /* A short plain-text block a person can paste into any assistant. */
  function aiSummary(title, inputs, results) {
    var lines = [title, "", WORDS.inputs + ":"];
    Object.keys(inputs).forEach(function (k) { lines.push("- " + k + ": " + inputs[k]); });
    lines.push("", WORDS.results + ":");
    Object.keys(results).forEach(function (k) { lines.push("- " + k + ": " + results[k]); });
    lines.push("", WORDS.link + ": " + location.href);
    return lines.join("\n");
  }
  function copy(text, btn) {
    var done = function () { if (btn) { var t = btn.textContent; btn.textContent = WORDS.copied; setTimeout(function () { btn.textContent = t; }, 1400); } };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () {});
  }

  /* Line chart with crosshair tooltip.
     opts: { x: {min,max,ticks,format,label}, y: {min,max,ticks,format,label}, series: [{name, color, width, dash, points:[[x,y],...], label}], hlines: [{y, color, dash, label}], vlines: [{x, label}] } */
  function lineChart(el, opts) {
    var W = Math.max(280, el.clientWidth || 640), H = opts.height || 280;
    var m = { t: 14, r: opts.directLabels ? 110 : 14, b: 36, l: 48 };
    var iw = W - m.l - m.r, ih = H - m.t - m.b;
    var X = function (v) { return m.l + (v - opts.x.min) / (opts.x.max - opts.x.min) * iw; };
    var Y = function (v) { return m.t + ih - (v - opts.y.min) / (opts.y.max - opts.y.min) * ih; };
    var s = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(opts.label || "Chart") + '">';
    (opts.y.ticks || []).forEach(function (t) {
      s += '<line x1="' + m.l + '" x2="' + (m.l + iw) + '" y1="' + Y(t) + '" y2="' + Y(t) + '" stroke="var(--chart-grid)"/>';
      s += '<text x="' + (m.l - 8) + '" y="' + (Y(t) + 4) + '" text-anchor="end">' + esc(opts.y.format ? opts.y.format(t) : t) + "</text>";
    });
    (opts.x.ticks || []).forEach(function (t) {
      s += '<text x="' + X(t) + '" y="' + (m.t + ih + 18) + '" text-anchor="middle">' + esc(opts.x.format ? opts.x.format(t) : t) + "</text>";
    });
    if (opts.x.label) s += '<text x="' + (m.l + iw / 2) + '" y="' + (H - 2) + '" text-anchor="middle">' + esc(opts.x.label) + "</text>";
    (opts.vlines || []).forEach(function (v, i) {
      s += '<line x1="' + X(v.x) + '" x2="' + X(v.x) + '" y1="' + m.t + '" y2="' + (m.t + ih) + '" stroke="var(--chart-grid)" stroke-width="1.5"/>';
      if (v.label) s += '<text x="' + (X(v.x) + 4) + '" y="' + (m.t + 10 + (i % 2) * 12) + '">' + esc(v.label) + "</text>";
    });
    (opts.hlines || []).forEach(function (h) {
      s += '<line x1="' + m.l + '" x2="' + (m.l + iw) + '" y1="' + Y(h.y) + '" y2="' + Y(h.y) + '" stroke="' + (h.color || "var(--fuel)") + '" stroke-width="2" stroke-dasharray="6 5"/>';
      if (h.label) s += '<text x="' + (m.l + 6) + '" y="' + (Y(h.y) - 6) + '" style="fill:' + (h.color || "var(--fuel)") + '">' + esc(h.label) + "</text>";
    });
    opts.series.forEach(function (se) {
      var d = se.points.map(function (p, i) { return (i ? "L" : "M") + X(p[0]).toFixed(1) + "," + Y(p[1]).toFixed(1); }).join(" ");
      s += '<path d="' + d + '" fill="none" stroke="' + se.color + '" stroke-width="' + (se.width || 2) + '" stroke-linecap="round" stroke-linejoin="round"' + (se.dash ? ' stroke-dasharray="' + se.dash + '"' : "") + "/>";
    });
    if (opts.directLabels) {
      var labs = opts.series.map(function (se) { var p = se.points[se.points.length - 1]; return { t: se.label || se.name, y: Y(p[1]), strong: se.width > 2 }; })
        .sort(function (a, b) { return a.y - b.y; });
      for (var i = 1; i < labs.length; i++) if (labs[i].y - labs[i - 1].y < 13) labs[i].y = labs[i - 1].y + 13;
      labs.forEach(function (l) { s += '<text x="' + (m.l + iw + 8) + '" y="' + (l.y + 4) + '" style="fill:' + (l.strong ? "var(--ink)" : "var(--ink-muted)") + ";font-weight:" + (l.strong ? 700 : 500) + '">' + esc(l.t) + "</text>"; });
    }
    s += '<line x1="' + m.l + '" x2="' + (m.l + iw) + '" y1="' + Y(opts.y.min) + '" y2="' + Y(opts.y.min) + '" stroke="var(--chart-axis)"/>';
    s += '<line class="ac-xh" y1="' + m.t + '" y2="' + (m.t + ih) + '" stroke="var(--chart-axis)" stroke-dasharray="3 3" visibility="hidden"/>';
    s += '<rect class="ac-hit" x="' + m.l + '" y="' + m.t + '" width="' + iw + '" height="' + ih + '" fill="transparent"/></svg>';
    el.classList.add("ac-chart");
    el.innerHTML = s + '<div class="ac-tip" hidden></div>';
    var svg = el.querySelector("svg"), tip = el.querySelector(".ac-tip"), xh = el.querySelector(".ac-xh");
    el.querySelector(".ac-hit").addEventListener("pointermove", function (e) {
      var r = svg.getBoundingClientRect(), px = (e.clientX - r.left) / r.width * W;
      var xv = opts.x.min + (px - m.l) / iw * (opts.x.max - opts.x.min);
      xh.setAttribute("x1", px); xh.setAttribute("x2", px); xh.setAttribute("visibility", "visible");
      var rows = opts.series.map(function (se) {
        var best = se.points.reduce(function (a, p) { return Math.abs(p[0] - xv) < Math.abs(a[0] - xv) ? p : a; }, se.points[0]);
        return { n: se.name, v: best[1] };
      }).sort(function (a, b) { return a.v - b.v; });
      tip.innerHTML = "<b>" + esc(opts.x.format ? opts.x.format(xv) : xv.toFixed(2)) + "</b>" + rows.map(function (r) { return "<div><span>" + esc(r.n) + "</span><span>" + esc(opts.y.format ? opts.y.format(r.v) : r.v.toFixed(2)) + "</span></div>"; }).join("");
      tip.hidden = false;
      var er = el.getBoundingClientRect(), left = e.clientX - er.left + 14;
      if (left + tip.offsetWidth > er.width) left = e.clientX - er.left - tip.offsetWidth - 14;
      tip.style.left = Math.max(0, left) + "px"; tip.style.top = Math.max(0, e.clientY - er.top - 20) + "px";
    });
    el.querySelector(".ac-hit").addEventListener("pointerleave", function () { tip.hidden = true; xh.setAttribute("visibility", "hidden"); });
  }

  /* EV cost formula shared by every page and the MCP tool. */
  function costPer100km(consumptionKwh, pricePerKwh, lossesPct) {
    return consumptionKwh * (1 + (lossesPct || 0) / 100) * pricePerKwh;
  }

  window.AlloCars = { lang: DE ? "de" : "en", money: money, num: num, esc: esc, readState: readState, writeState: writeState, aiSummary: aiSummary, copy: copy, lineChart: lineChart, costPer100km: costPer100km };
})();
