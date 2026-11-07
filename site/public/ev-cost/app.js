/* EV charging cost page: inputs, chart, table and "Copy for AI". The maths is in calc.js.
   One script for the English (/ev-cost/) and German (/de/ev-cost/) page; words come from T. */
(function () {
  "use strict";
  var A = window.AlloCars, E = window.EvCost, D = E.DEFAULTS;
  var de = A.lang === "de";
  var T = de ? {
    levels: ["Sparsam", "Normal", "Autobahn", "Winter"],
    hints: ["Stadt und Landstraße, mildes Wetter", "Eine normale Woche", "Konstant 120 km/h", "Kälte, Heizung an"],
    homeTariff: "Haushaltsstrom", median: "Öffentlicher Median", cheap: "Günstigste 10 %", dear: "Teuerste 10 %",
    at: function (car, kwh, p, loss) { return car + " mit " + kwh + " kWh/100 km, " + p + "/kWh, " + loss + " % Verlust"; },
    same: function (l, p) { return "Gleiche Kosten wie Benzin mit " + l + " L und " + p + "/L"; },
    per1000: "/1.000 km", typicalSame: "Normales Fahren, gleicher Preis",
    you: "Du", youAt: "Du ", publicMedian: "Öffentlicher Median ",
    chartLabel: function (car) { return "Kosten pro 100 km für " + car + " und andere Autos nach Strompreis"; },
    petrolLine: function (l, p) { return "Benzin " + l + " L zu " + p; },
    otherCars: "Andere Autos", petrol: "Benzin",
    mineRow: function (car, level) { return car + ", " + level; },
    petrolRow: function (l, p) { return "Benziner, " + l + " L zu " + p; },
    claude: "Hilf mir, meine Ladekosten zu verstehen. Hier sind meine Zahlen von Allo Cars:\n\n",
    title: "Ladekosten pro 100 km (Allo Cars)",
    in: { car: "Auto", cons: "Verbrauch (kWh/100 km)", price: "Strompreis", loss: "Ladeverluste", petrol: "Benziner", live: "Öffentliches Ad-hoc-Laden heute (Deutschland)" },
    petrolIn: function (l, p) { return l + " L/100 km zu " + p + "/L"; },
    liveIn: function (m, a, b) { return "Median " + m + "/kWh, günstigste 10 % " + a + ", teuerste 10 % " + b; },
    per100: " pro 100 km", breakEven: "Strompreis, ab dem es so teuer ist wie Benzin",
    source: function (n, when) { return "Formel: kWh/100 km × (1 + Verluste) × €/kWh. Die Verbräuche sind grobe Praxiswerte. Öffentliche Preise: Median von " + n + ' Ad-hoc-Tarifen aus dem <a href="/de/charging-prices/">Preisarchiv von Allo Cars</a>, erfasst am ' + when + "."; },
    locale: "de-DE", archive: "/de/charging-prices/"
  } : {
    levels: E.LEVELS, hints: E.LEVEL_HINTS,
    homeTariff: "Home tariff", median: "Public median", cheap: "Cheapest 10 %", dear: "Dearest 10 %",
    at: function (car, kwh, p, loss) { return car + " at " + kwh + " kWh/100 km, " + p + "/kWh, " + loss + " % losses"; },
    same: function (l, p) { return "Same cost as petrol at " + l + " L and " + p + "/L"; },
    per1000: "/1,000 km", typicalSame: "Typical driving, same price",
    you: "You", youAt: "You ", publicMedian: "Public median ",
    chartLabel: function (car) { return "Cost per 100 km for " + car + " and other cars by electricity price"; },
    petrolLine: function (l, p) { return "Petrol " + l + " L at " + p; },
    otherCars: "Other cars", petrol: "Petrol",
    mineRow: function (car, level) { return car + " " + level.toLowerCase(); },
    petrolRow: function (l, p) { return "Petrol, " + l + " L at " + p; },
    claude: "Help me understand my EV charging costs. Here are my numbers from Allo Cars:\n\n",
    title: "EV charging cost per 100 km (Allo Cars)",
    in: { car: "Car", cons: "Consumption (kWh/100 km)", price: "Electricity price", loss: "Charging losses", petrol: "Petrol car", live: "Public ad-hoc charging today (Germany)" },
    petrolIn: function (l, p) { return l + " L/100 km at " + p + "/L"; },
    liveIn: function (m, a, b) { return "median " + m + "/kWh, cheapest 10 % " + a + ", dearest 10 % " + b; },
    per100: " per 100 km", breakEven: "Break-even electricity price vs petrol",
    source: function (n, when) { return "Formula: kWh/100 km × (1 + losses) × €/kWh. Consumption figures are rough real-world estimates. Public prices: median of " + n + ' ad-hoc tariffs from the <a href="/charging-prices/">Allo Cars price archive</a>, collected ' + when + "."; },
    locale: "en-GB", archive: "/charging-prices/"
  };
  // German nouns keep their capital letter inside a sentence
  var low = function (s) { return de ? s : s.toLowerCase(); };
  var $ = function (id) { return document.getElementById(id); };
  var eur = function (x) { return A.money(x); };
  var XMAX = 0.9;
  var live = null; // latest public charging prices, if the data file loads

  /* ---------- state in the URL ---------- */
  function readState() {
    var q = new URLSearchParams(location.search), s = JSON.parse(JSON.stringify(D));
    var num = function (k) { var v = parseFloat(q.get(k)); return isFinite(v) && v >= 0 ? v : null; };
    if (q.get("car")) s.car = q.get("car").slice(0, 60);
    if (q.get("lv")) { var lv = q.get("lv").split(",").map(parseFloat); if (lv.length === 4 && lv.every(function (v) { return isFinite(v) && v >= 0 && v < 100; })) s.lv = lv; }
    else if (q.get("car") && E.findCar(s.car)) s.lv = E.findCar(s.car).slice(1);
    ["p", "loss", "fl", "fp"].forEach(function (k) { var v = num(k); if (v != null) s[k] = v; });
    if (q.has("refs")) s.refs = q.get("refs").split(",").filter(function (n) { return E.findCar(n); });
    return s;
  }
  function writeState() {
    var q = new URLSearchParams();
    q.set("car", S.car); q.set("lv", S.lv.join(",")); q.set("p", S.p); q.set("loss", S.loss);
    q.set("fl", S.fl); q.set("fp", S.fp); q.set("refs", S.refs.join(","));
    try { history.replaceState(null, "", location.pathname + "?" + q.toString()); } catch (e) {}
    // the language switch keeps your inputs
    var sw = document.querySelector(".ac-lang");
    if (sw) sw.href = sw.getAttribute("href").split("?")[0] + "?" + q.toString();
  }
  var S = readState();

  /* ---------- inputs ---------- */
  var carSel = $("car");
  carSel.innerHTML = E.CATALOG.map(function (c) { return '<option value="' + A.esc(c[0]) + '">' + A.esc(c[0]) + "</option>"; }).join("") +
    (E.findCar(S.car) ? "" : '<option value="' + A.esc(S.car) + '">' + A.esc(S.car) + "</option>");
  carSel.value = S.car;
  carSel.addEventListener("change", function () {
    var prev = S.car, c = E.findCar(carSel.value);
    S.car = carSel.value;
    if (c) S.lv = c.slice(1);
    // keep the car you came from on the chart as a reference
    if (E.findCar(prev) && S.refs.indexOf(prev) < 0) S.refs.unshift(prev);
    S.refs = S.refs.filter(function (n) { return n !== S.car; });
    drawLevels(); drawRefs(); update();
  });

  function drawLevels() {
    $("levels").innerHTML = T.levels.map(function (name, i) {
      return '<label class="ac-param"><span class="ac-param__label"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--car-' + (i + 1) + ');margin-right:8px"></span>' + name + '</span>' +
        '<span class="ac-param__box"><input data-lv="' + i + '" type="number" min="0" max="60" step="0.1" inputmode="decimal" value="' + S.lv[i] + '"><span class="ac-param__unit">kWh/100 km</span></span>' +
        '<span class="ac-param__hint">' + T.hints[i] + "</span></label>";
    }).join("");
  }
  $("levels").addEventListener("input", function (e) {
    var i = e.target.getAttribute("data-lv"); if (i == null) return;
    var v = parseFloat(e.target.value); if (isFinite(v) && v >= 0) { S.lv[+i] = v; update(); }
  });

  function drawRefs() {
    $("refs").innerHTML = E.CATALOG.filter(function (c) { return c[0] !== S.car; }).map(function (c) {
      return '<button type="button" class="ac-chip" data-ref="' + A.esc(c[0]) + '" aria-pressed="' + (S.refs.indexOf(c[0]) >= 0) + '">' + A.esc(c[0]) + "</button>";
    }).join("");
  }
  $("refs").addEventListener("click", function (e) {
    var b = e.target.closest("[data-ref]"); if (!b) return;
    var n = b.getAttribute("data-ref"), i = S.refs.indexOf(n);
    if (i >= 0) S.refs.splice(i, 1); else S.refs.push(n);
    b.setAttribute("aria-pressed", i < 0); update();
  });

  function bindNum(id, key, rangeId) {
    var el = $(id); el.value = S[key];
    el.addEventListener("input", function () { var v = parseFloat(el.value); if (isFinite(v) && v >= 0) { S[key] = v; if (rangeId) $(rangeId).value = v; update(); } });
    if (rangeId) { var r = $(rangeId); r.value = S[key]; r.addEventListener("input", function () { S[key] = parseFloat(r.value); el.value = S[key]; update(); }); }
  }
  bindNum("p", "p", "pr"); bindNum("loss", "loss"); bindNum("fl", "fl"); bindNum("fp", "fp");

  function drawPriceChips() {
    var chips = [{ n: T.homeTariff, p: 0.35 }];
    if (live) chips.push({ n: T.median, p: live.median }, { n: T.cheap, p: live.p10 }, { n: T.dear, p: live.p90 });
    $("pricechips").innerHTML = chips.map(function (c) {
      return '<button type="button" class="ac-chip" data-p="' + c.p + '">' + c.n + " " + eur(c.p) + "</button>";
    }).join("");
  }
  $("pricechips").addEventListener("click", function (e) {
    var b = e.target.closest("[data-p]"); if (!b) return;
    S.p = Math.round(parseFloat(b.getAttribute("data-p")) * 100) / 100; $("p").value = S.p; $("pr").value = S.p; update();
  });

  /* ---------- view toggle ---------- */
  function setView(table) {
    $("v-chart").setAttribute("aria-pressed", !table); $("v-table").setAttribute("aria-pressed", table);
    $("chart").hidden = table; $("legend").hidden = table; $("tablewrap").hidden = !table;
  }
  $("v-chart").addEventListener("click", function () { setView(false); });
  $("v-table").addEventListener("click", function () { setView(true); });

  /* ---------- output ---------- */
  var R;
  function rowName(r) {
    if (r.kind === "mine") return T.mineRow(S.car, T.levels[r.level]);
    if (r.kind === "fuel") return T.petrolRow(A.num(S.fl), eur(S.fp));
    return r.name;
  }
  function update() {
    writeState();
    R = E.compute(S);
    var html = '<div class="ac-readout"><span class="ac-readout__value">' + eur(R.costTypical) + '<small>/100 km</small></span><span class="ac-readout__basis">' + A.esc(T.at(S.car, A.num(S.lv[1]), eur(S.p), A.num(S.loss, 0))) + "</span></div>";
    if (R.breakEven != null) html += '<div class="ac-readout ac-readout--md"><span class="ac-readout__value">' + eur(R.breakEven) + '<small>/kWh</small></span><span class="ac-readout__basis">' + T.same(A.num(S.fl), eur(S.fp)) + "</span></div>";
    html += '<div class="ac-readout ac-readout--md"><span class="ac-readout__value">' + A.money(R.per1000, { digits: 0 }) + "<small>" + T.per1000 + '</small></span><span class="ac-readout__basis">' + T.typicalSame + "</span></div>";
    $("readouts").innerHTML = html;

    // chart
    var series = [], pts = function (kwh) { var a = []; for (var x = 0; x <= XMAX + 1e-9; x += 0.01) a.push([x, E.evCost(kwh, x, S.loss)]); return a; };
    S.refs.forEach(function (n) { var c = E.findCar(n); if (c && n !== S.car) series.push({ name: n, label: n, color: "var(--ref-line)", width: 1.5, points: pts(c[2]) }); });
    T.levels.forEach(function (name, i) { if (S.lv[i] > 0) series.push({ name: name + " " + A.num(S.lv[i]), label: T.you + ", " + low(name), color: "var(--car-" + (i + 1) + ")", width: i === 1 ? 3 : 2, points: pts(S.lv[i]) }); });
    var ymax = Math.max(10, Math.max.apply(null, series.map(function (s) { return s.points[s.points.length - 1][1]; }).concat([R.fuel || 0])));
    ymax = Math.ceil(ymax / 5) * 5;
    var yt = []; for (var y = 0; y <= ymax; y += 5) yt.push(y);
    var vlines = [{ x: S.p, label: T.youAt + eur(S.p) }];
    if (live && Math.abs(live.median - S.p) > 0.03) vlines.push({ x: live.median, label: T.publicMedian + eur(live.median) });
    var wide = $("chart").clientWidth > 520;
    A.lineChart($("chart"), {
      label: T.chartLabel(S.car),
      height: wide ? 320 : 260, directLabels: wide,
      x: { min: 0, max: XMAX, ticks: [0, 0.2, 0.4, 0.6, 0.8], format: function (v) { return eur(v); } },
      y: { min: 0, max: ymax, ticks: yt, format: function (v) { return A.money(v, { digits: 0 }); } },
      series: series,
      hlines: R.fuel != null ? [{ y: R.fuel, label: T.petrolLine(A.num(S.fl), eur(S.fp)) }] : [],
      vlines: vlines
    });
    var leg = T.levels.map(function (n, i) { return '<span><i style="border-color:var(--car-' + (i + 1) + ')"></i>' + n + " " + A.num(S.lv[i]) + "</span>"; });
    if (S.refs.length) leg.push('<span><i style="border-color:var(--ref-line);border-top-width:1.5px"></i>' + T.otherCars + "</span>");
    if (R.fuel != null) leg.push('<span><i class="ac-legend--dash" style="border-color:var(--fuel)"></i>' + T.petrol + "</span>");
    $("legend").innerHTML = leg.join("");

    // table
    var maxc = Math.max.apply(null, R.rows.map(function (r) { return r.cost; }));
    document.querySelector("#table tbody").innerHTML = R.rows.map(function (r) {
      var cls = r.kind === "mine" ? "ac-bar ac-bar--mine" : r.kind === "fuel" ? "ac-bar ac-bar--fuel" : "ac-bar";
      return "<tr" + (r.kind === "mine" && r.level === 1 ? ' class="is-mine"' : "") + "><td>" + A.esc(rowName(r)) + '</td><td class="num">' + (r.kwh == null ? "–" : A.num(r.kwh)) + '</td><td class="num">' + eur(r.cost) + '</td><td class="bar-cell"><span class="' + cls + '" style="width:' + (r.cost / maxc * 100).toFixed(1) + '%"></span></td></tr>';
    }).join("");

    $("claude").href = "https://claude.ai/new?q=" + encodeURIComponent(T.claude + summary());
  }

  function summary() {
    var inputs = {};
    inputs[T.in.car] = S.car;
    inputs[T.in.cons] = T.levels.map(function (n, i) { return low(n) + " " + A.num(S.lv[i]); }).join(", ");
    inputs[T.in.price] = eur(S.p) + "/kWh";
    inputs[T.in.loss] = A.num(S.loss, 0) + " %";
    inputs[T.in.petrol] = T.petrolIn(A.num(S.fl), eur(S.fp));
    if (live) inputs[T.in.live] = T.liveIn(eur(live.median), eur(live.p10), eur(live.p90));
    var results = {};
    R.rows.forEach(function (r) { results[rowName(r)] = eur(r.cost) + T.per100; });
    if (R.breakEven != null) results[T.breakEven] = eur(R.breakEven) + "/kWh";
    return A.aiSummary(T.title, inputs, results);
  }

  $("copyai").addEventListener("click", function () { A.copy(summary(), $("copyai").querySelector("span")); });
  $("share").addEventListener("click", function () { A.copy(location.href, $("share").querySelector("span")); });

  var rt; window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(update, 150); });

  drawLevels(); drawRefs(); drawPriceChips(); update();

  // Live public prices from the charging price archive; the page works without them.
  fetch("/data/charging-prices/latest.json").then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
    var o = j && j.overall;
    if (!o || o.median == null) return;
    live = { median: o.median, p10: o.p10, p90: o.p90, at: j.observed_at };
    drawPriceChips(); update();
    var when = new Date(live.at).toLocaleDateString(T.locale, { day: "numeric", month: "short", year: "numeric" });
    $("source").innerHTML = T.source(o.tariffs || "", when);
  }).catch(function () {});
})();
