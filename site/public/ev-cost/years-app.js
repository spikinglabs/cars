/* "Cost over the years" card on /ev-cost/ (EN, DE, ZH): purchase price minus the grant, then energy and
   vehicle tax, year by year, against the first fuel car of step 3. The maths is in years.js; the energy cost per
   100 km comes from app.js through the "ev-cost:update" event.
   Link parameters: evp (EV price €), grant (€), fcp (fuel car price €), km (per year), yrs (4-8),
   ccm and co2 (the fuel car's engine size and CO2, with tc = the fuel car they belong to). */
(function () {
  "use strict";
  var Y = window.EvYears, A = window.AlloCars, G = window.EvGrant;
  var lang = (document.documentElement.lang || "en").slice(0, 2);
  var pre = lang === "de" ? "/de" : lang === "zh" ? "/zh" : "";
  var T = lang === "zh" ? {
    locale: "zh-CN", own: "你的燃油车",
    save: function (n) { return n + " 年后你省下"; }, more: function (n) { return n + " 年后电动车多花"; },
    totals: function (ev, fu) { return "电动车共 " + ev + "，燃油车共 " + fu; },
    payback: "多久回本", years: function (y) { return y + " 年"; }, fromStart: "从第一天起就更便宜", never: function (n) { return n + " 年内无法回本"; },
    paybackBasis: function (gap) { return "电动车扣除补贴后贵 " + gap; }, paybackBasis0: "扣除补贴后电动车不比燃油车贵",
    perYear: "每年节省", perYearBasis: function (name, tax) { return "能源和车辆税，对比" + name + "（车辆税每年 " + tax + "）"; },
    taxLine: function (name, tax) { return name + "：每年车辆税 " + tax + "。"; },
    ai: "多年总成本", aiYears: function (n) { return n + " 年后"; }
  } : lang === "de" ? {
    locale: "de-DE", own: "Dein Verbrenner",
    save: function (n) { return "Nach " + n + " Jahren sparst du"; }, more: function (n) { return "Nach " + n + " Jahren kostet das E-Auto mehr"; },
    totals: function (ev, fu) { return "E-Auto insgesamt " + ev + ", Verbrenner " + fu; },
    payback: "Wann es sich rechnet", years: function (y) { return y + " Jahre"; }, fromStart: "Ab dem ersten Tag günstiger", never: function (n) { return "Nicht innerhalb von " + n + " Jahren"; },
    paybackBasis: function (gap) { return "das E-Auto kostet nach Förderung " + gap + " mehr"; }, paybackBasis0: "nach Förderung ist das E-Auto nicht teurer",
    perYear: "Ersparnis pro Jahr", perYearBasis: function (name, tax) { return "Energie und Kfz-Steuer gegenüber " + name + " (Steuer " + tax + " im Jahr)"; },
    taxLine: function (name, tax) { return name + ": " + tax + " Kfz-Steuer im Jahr."; },
    ai: "Kosten über die Jahre", aiYears: function (n) { return "nach " + n + " Jahren"; }
  } : {
    locale: "en-GB", own: "Your fuel car",
    save: function (n) { return "After " + n + " years you save"; }, more: function (n) { return "After " + n + " years the electric car costs more"; },
    totals: function (ev, fu) { return "electric car " + ev + " in total, fuel car " + fu; },
    payback: "When it pays for itself", years: function (y) { return y + " years"; }, fromStart: "Cheaper from day one", never: function (n) { return "Not within " + n + " years"; },
    paybackBasis: function (gap) { return "the electric car costs " + gap + " more after the grant"; }, paybackBasis0: "after the grant the electric car costs no more",
    perYear: "Saving per year", perYearBasis: function (name, tax) { return "energy and vehicle tax against " + name + " (tax " + tax + " a year)"; },
    taxLine: function (name, tax) { return name + ": " + tax + " vehicle tax a year."; },
    ai: "Cost over the years", aiYears: function (n) { return "after " + n + " years"; }
  };
  var $ = function (id) { return document.getElementById(id); };
  if (!Y || !$("y-out")) return;
  var eur = function (v) { return new Intl.NumberFormat(T.locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v); };
  var yrs = function (y) { return T.years(Number(y).toLocaleString(T.locale, { maximumFractionDigits: 1 })); };

  /* state: link first, then this device */
  var KEY = "allo-cars-ev-years", KEYS = ["evp", "grant", "fcp", "km", "yrs", "ccm", "co2", "tc"];
  var q = new URLSearchParams(location.search), saved = new URLSearchParams();
  try { saved = new URLSearchParams(localStorage.getItem(KEY) || ""); } catch (e) {}
  var src = KEYS.some(function (k) { return q.has(k); }) ? q : saved;
  var num = function (k, max) { var v = parseFloat(src.get(k)); return isFinite(v) && v >= 0 && v <= max ? v : null; };
  var D = Y.DEFAULTS;
  var S = {
    evp: num("evp", 300000), grant: num("grant", 10000), fcp: num("fcp", 300000), km: num("km", 100000),
    yrs: Math.round(num("yrs", 8) || D.years), ccm: num("ccm", 8000), co2: num("co2", 400), tc: src.get("tc") || null
  };
  if (S.evp == null) S.evp = D.ev_price;
  if (S.fcp == null) S.fcp = D.fuel_price;
  if (S.km == null) S.km = D.km;
  if (S.yrs < 4 || S.yrs > 8) S.yrs = D.years;

  /* the grant: what the grant check on this device worked out, unless set here */
  var grantState = new URLSearchParams();
  try { grantState = new URLSearchParams(localStorage.getItem("allo-cars-ev-grant") || ""); } catch (e) {}
  var grantFromCheck = null;
  if (G && grantState.get("income")) {
    var g = G.compute({ drive: "bev", income: grantState.get("income"), kids: grantState.get("kids"), reg: grantState.get("reg") });
    if (g.amount != null) grantFromCheck = g.amount;
  }
  if (S.grant == null) S.grant = grantFromCheck != null ? grantFromCheck : 0;
  var gp = new URLSearchParams();
  ["income", "kids"].forEach(function (k) { if (grantState.get(k)) gp.set(k, grantState.get(k)); });
  if ($("y-grantlink")) $("y-grantlink").href = pre + "/ev-grant/" + (gp.toString() ? "?" + gp : "");

  ["evp", "grant", "fcp", "km"].forEach(function (k) {
    var el = $("y-" + k);
    el.value = S[k];
    el.addEventListener("input", function () { var v = parseFloat(el.value); S[k] = isFinite(v) && v >= 0 ? v : 0; draw(); });
  });
  $("y-yrs").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; S.yrs = +b.dataset.y; draw(); });

  var last = null, row = null;
  function taxDefaults() {
    var d = row && Y.FUEL_TAX_DATA[row.id];
    return d || { ccm: D.ccm, co2: D.co2 };
  }
  ["ccm", "co2"].forEach(function (k) {
    $("y-" + k).addEventListener("input", function () {
      var v = parseFloat($("y-" + k).value);
      var d = taxDefaults();
      if (S.tc !== (row && row.id)) { S.ccm = d.ccm; S.co2 = d.co2; }
      S[k] = isFinite(v) && v >= 0 ? v : 0; S.tc = row && row.id;
      draw(true);
    });
  });

  function save() {
    var p = new URLSearchParams();
    if (S.evp !== D.ev_price) p.set("evp", S.evp);
    if (S.grant !== (grantFromCheck != null ? grantFromCheck : 0)) p.set("grant", S.grant);
    if (S.fcp !== D.fuel_price) p.set("fcp", S.fcp);
    if (S.km !== D.km) p.set("km", S.km);
    if (S.yrs !== D.years) p.set("yrs", S.yrs);
    if (S.tc && row && S.tc === row.id && S.ccm != null) { p.set("ccm", S.ccm); p.set("co2", S.co2); p.set("tc", S.tc); }
    try { localStorage.setItem(KEY, p.toString()); } catch (e) {}
    var url = new URLSearchParams(location.search);
    KEYS.forEach(function (k) { url.delete(k); });
    p.forEach(function (v, k) { url.set(k, v); });
    try { history.replaceState(null, "", location.pathname + "?" + url.toString()); } catch (e) {}
  }

  function draw(fromTaxInput) {
    document.querySelectorAll("#y-yrs button").forEach(function (b) { b.setAttribute("aria-pressed", +b.dataset.y === S.yrs); });
    if (!last || !row) { $("y-out").innerHTML = ""; $("y-body").innerHTML = ""; return; }
    var own = S.tc && S.tc === row.id, d = taxDefaults();
    var ccm = own ? S.ccm : d.ccm, co2 = own ? S.co2 : d.co2;
    if (!fromTaxInput) { $("y-ccm").value = ccm; $("y-co2").value = co2; }
    var name = row.own ? T.own : row.name;
    var r = Y.compare({
      years: S.yrs, km: S.km, ev_price: S.evp, grant: S.grant, ev_per_100: last.result.cost,
      fuel_price: S.fcp, fuel_per_100: row.cost, fuel: row.fuel, ccm: ccm, co2: co2
    });
    $("y-taxline").textContent = T.taxLine(name, eur(r.fuel_tax));
    var good = r.saving >= 0;
    var gap = r.ev_start - r.fuel_start;
    var pay = r.payback_years === 0 ? T.fromStart : r.payback_years == null ? T.never(S.yrs) : yrs(r.payback_years);
    var html =
      '<div class="ac-readout ac-readout--md"><span class="ac-readout__value' + (good ? " good" : "") + '">' + eur(Math.abs(r.saving)) + '</span><span class="ac-readout__basis">' +
        A.esc((good ? T.save(S.yrs) : T.more(S.yrs)) + " · " + T.totals(eur(r.total_ev), eur(r.total_fuel))) + "</span></div>" +
      '<div class="ac-readout ac-readout--md"><span class="ac-readout__value">' + A.esc(pay) + '</span><span class="ac-readout__basis">' +
        A.esc(T.payback + " · " + (gap > 0 ? T.paybackBasis(eur(gap)) : T.paybackBasis0)) + "</span></div>" +
      '<div class="ac-readout ac-readout--md"><span class="ac-readout__value">' + eur(r.saving_per_year) + '</span><span class="ac-readout__basis">' +
        A.esc(T.perYear + " · " + T.perYearBasis(name, eur(r.fuel_tax))) + "</span></div>";
    $("y-out").innerHTML = html;
    $("y-body").innerHTML = r.years.map(function (y) {
      return "<tr><td>" + y.year + '</td><td class="num">' + eur(y.ev) + '</td><td class="num">' + eur(y.fuel) + '</td><td class="num' + (y.diff >= 0 ? " good" : "") + '">' +
        (y.diff >= 0 ? "" : "−") + eur(Math.abs(y.diff)) + "</td></tr>";
    }).join("");
    save();
    var lines = {};
    lines[T.ai + ", " + T.aiYears(S.yrs)] = T.totals(eur(r.total_ev), eur(r.total_fuel)) + " (" + eur(S.evp) + " − " + eur(S.grant) + " vs " + eur(S.fcp) + ", " +
      Number(S.km).toLocaleString(T.locale) + " km/a, " + name + ")";
    lines[T.payback] = pay;
    window.__evYears = { inputs: S, fuel_car: name, result: r, lines: lines };
  }

  document.addEventListener("ev-cost:update", function (e) {
    last = e.detail;
    row = last.result.rows[0] || null;
    draw();
  });
  if (window.__evCostLast) { last = window.__evCostLast; row = last.result.rows[0] || null; }
  draw();
})();
