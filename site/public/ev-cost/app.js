/* EV charging cost page: pick a car, set a price, see where charging stops being cheaper than fuel.
   One script for the English (/ev-cost/) and German (/de/ev-cost/) page; words come from T.
   The maths is in calc.js, so tests and AI tools get the same numbers. */
(function () {
  "use strict";
  var A = window.AlloCars, E = window.EvCost, D = E.DEFAULTS;
  var de = A.lang === "de";
  var T = de ? {
    levels: ["Sparsam", "Normal", "Autobahn", "Winter"],
    hints: ["Stadt und Landstraße, mildes Wetter", "Eine normale Woche", "Konstant 120 km/h", "Kälte, Heizung an"],
    fuel: { petrol: "Benzin", diesel: "Diesel" },
    fuelPrice: { petrol: "Super", diesel: "Diesel" },
    own: "Dein Verbrenner", ownShort: "Deiner",
    home: "Haushaltsstrom", median: "Öffentlich, Median", cheap: "Günstigste 10 %", dear: "Teuerste 10 %",
    perKwh: "/kWh", per100: "/100 km", per1000: "/1.000 km",
    costBasis: function (car, lvl, kwh) { return car + ", " + lvl + ", " + kwh + " kWh/100 km inkl. Ladeverluste"; },
    per1000Basis: "Gleicher Preis, gleiche Fahrweise",
    than: function (r) { return r.own ? "dein Verbrenner" : "ein " + r.name; },
    cheaper: function (r) { return "Günstiger als " + T.than(r) + ", bei deinem Strompreis"; },
    dearer: function (r) { return "Teurer als " + T.than(r) + ", bei deinem Strompreis"; },
    beBasis: function (r) { return "Bis zu diesem Strompreis fährst du günstiger als " + T.than(r); },
    youLine: "Du ", medianLine: "Median öffentlich ",
    chartLabel: function (car, list) { return "Kosten pro 100 km für " + car + " nach Strompreis, mit Verbrennern als Linien. Gleichstand: " + list; },
    saveCell: function (d) { return d + " gespart"; }, moreCell: function (d) { return d + " teurer"; },
    range: function (a, b) { return a + " bis " + b; },
    title: "Ladekosten und Gleichstand mit Verbrennern (Allo Cars)",
    claude: "Hilf mir, meine Ladekosten mit Verbrennern zu vergleichen. Hier sind meine Zahlen von Allo Cars:\n\n",
    in: { car: "Elektroauto", cons: "Verbrauch (kWh/100 km)", use: "Gerechnet mit", price: "Strompreis", loss: "Ladeverluste", fuels: "Spritpreise", live: "Öffentliches Ad-hoc-Laden heute (Deutschland)" },
    out: { cost: "Kosten pro 100 km", be: "Gleichstand mit", at: "bei" },
    fuelIn: function (petrol, dsl) { return "Super " + petrol + "/L, Diesel " + dsl + "/L"; },
    liveIn: function (m, a, b) { return "Median " + m + "/kWh, günstigste 10 % " + a + ", teuerste 10 % " + b; },
    beOut: function (be, cost) { return be + "/kWh (Verbrenner: " + cost + "/100 km)"; },
    fuelSourceAdac: function (m) { return 'Spritpreise: <a href="https://www.adac.de/verkehr/tanken-kraftstoff-antrieb/kraftstoffpreisentwicklung/">ADAC-Monatsdurchschnitt</a> ' + m + " (Super E10 und Diesel)."; },
    fuelSourceLive: function (when) { return 'Spritpreise: Wochendurchschnitt für Deutschland aus dem <a href="https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en">Weekly Oil Bulletin</a> der Europäischen Kommission (CC BY 4.0), Woche vom ' + when + ". Super = Euro-Super 95."; },
    chargeSource: function (n, when) { return ' Öffentliche Ladepreise: Median von ' + n + ' Ad-hoc-Tarifen aus dem <a href="/de/charging-prices/">Preisarchiv</a>, ' + when + "."; },
    month: function (ym) { var p = ym.split("-"); return ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"][+p[1] - 1] + " " + p[0]; },
    locale: "de-DE"
  } : {
    levels: E.LEVELS, hints: E.LEVEL_HINTS,
    fuel: { petrol: "Petrol", diesel: "Diesel" },
    fuelPrice: { petrol: "Petrol", diesel: "Diesel" },
    own: "Your fuel car", ownShort: "Yours",
    home: "Home tariff", median: "Public median", cheap: "Cheapest 10 %", dear: "Dearest 10 %",
    perKwh: "/kWh", per100: "/100 km", per1000: "/1,000 km",
    costBasis: function (car, lvl, kwh) { return car + ", " + lvl.toLowerCase() + ", " + kwh + " kWh/100 km plus charging losses"; },
    per1000Basis: "Same price, same driving",
    than: function (r) { return r.own ? "your fuel car" : "a " + r.name; },
    cheaper: function (r) { return "Cheaper than " + T.than(r) + ", at your price"; },
    dearer: function (r) { return "More than " + T.than(r) + ", at your price"; },
    beBasis: function (r) { return "Below this price you drive cheaper than " + T.than(r); },
    youLine: "You ", medianLine: "Public median ",
    chartLabel: function (car, list) { return "Cost per 100 km for " + car + " by electricity price, with fuel cars as lines. Break-even: " + list; },
    saveCell: function (d) { return d + " saved"; }, moreCell: function (d) { return d + " more"; },
    range: function (a, b) { return a + " to " + b; },
    title: "EV charging cost and break-even with fuel cars (Allo Cars)",
    claude: "Help me compare my EV charging costs with fuel cars. Here are my numbers from Allo Cars:\n\n",
    in: { car: "Electric car", cons: "Consumption (kWh/100 km)", use: "Calculated with", price: "Electricity price", loss: "Charging losses", fuels: "Fuel prices", live: "Public ad-hoc charging today (Germany)" },
    out: { cost: "Cost per 100 km", be: "Break-even with", at: "at" },
    fuelIn: function (petrol, dsl) { return "petrol " + petrol + "/L, diesel " + dsl + "/L"; },
    liveIn: function (m, a, b) { return "median " + m + "/kWh, cheapest 10 % " + a + ", dearest 10 % " + b; },
    beOut: function (be, cost) { return be + "/kWh (fuel car: " + cost + "/100 km)"; },
    fuelSourceAdac: function (m) { return 'Fuel prices: <a href="https://www.adac.de/verkehr/tanken-kraftstoff-antrieb/kraftstoffpreisentwicklung/">ADAC monthly average</a> for Germany, ' + m + " (petrol E10 and diesel)."; },
    fuelSourceLive: function (when) { return 'Fuel prices: German weekly average from the European Commission <a href="https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en">Weekly Oil Bulletin</a> (CC BY 4.0), week of ' + when + ". Petrol = Euro-super 95."; },
    chargeSource: function (n, when) { return ' Public charging prices: median of ' + n + ' ad-hoc tariffs from the <a href="/charging-prices/">price archive</a>, ' + when + "."; },
    month: function (ym) { var p = ym.split("-"); return ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][+p[1] - 1] + " " + p[0]; },
    locale: "en-GB"
  };
  var $ = function (id) { return document.getElementById(id); };
  var eur = function (x) { return A.money(x); };
  var HOME = 0.35;
  var live = null;     // public charging prices, if the data file loads
  var liveFuel = null; // daily fuel prices, if the data file loads
  var nameOf = function (r) { return r.own ? T.own : r.name; };

  /* ---------- state in the URL ---------- */
  function readState() {
    var q = new URLSearchParams(location.search), s = JSON.parse(JSON.stringify(D));
    var num = function (k, max) { var v = parseFloat(q.get(k)); return isFinite(v) && v >= 0 && v <= max ? v : null; };
    if (q.get("car")) s.car = q.get("car").slice(0, 60);
    var lv = q.get("lv") ? q.get("lv").split(",").map(parseFloat) : null;
    if (lv && lv.length === 4 && lv.every(function (v) { return isFinite(v) && v > 0 && v < 100; })) s.lv = lv;
    else if (E.findCar(s.car)) s.lv = E.findCar(s.car).slice(1);
    var u = num("use", 3); if (u != null) s.use = Math.round(u);
    [["p", 3], ["loss", 50], ["petrol", 5], ["diesel", 5]].forEach(function (k) { var v = num(k[0], k[1]); if (v != null) s[k[0]] = v; });
    s.fuelSet = q.has("petrol") || q.has("diesel") || q.has("fp");
    if (q.has("refs")) s.refs = q.get("refs").split(",").filter(function (id) { return E.findFuelCar(id); });
    var own = (q.get("own") || "").split(",");
    if (parseFloat(own[0]) > 0) s.own = { l: Math.min(30, parseFloat(own[0])), fuel: own[1] === "diesel" ? "diesel" : "petrol" };
    // links from the first version of this page: fl = petrol car L/100 km, fp = petrol price
    var fl = num("fl", 30), fp = num("fp", 5);
    if (fl && !s.own) s.own = { l: fl, fuel: "petrol" };
    if (fp != null && !q.has("petrol")) s.petrol = fp;
    return s;
  }
  function query() {
    var q = new URLSearchParams();
    q.set("car", S.car); q.set("lv", S.lv.join(",")); q.set("use", S.use); q.set("p", S.p); q.set("loss", S.loss);
    q.set("petrol", S.petrol); q.set("diesel", S.diesel); q.set("refs", S.refs.join(","));
    if (S.own) q.set("own", S.own.l + "," + S.own.fuel);
    return q.toString();
  }
  function writeState() {
    var qs = query();
    try { history.replaceState(null, "", location.pathname + "?" + qs); } catch (e) {}
    // the language switch keeps your inputs
    var sw = document.querySelector(".ac-lang");
    if (sw) sw.href = sw.getAttribute("href").split("?")[0] + "?" + qs;
  }
  var S = readState();

  /* ---------- 1. your car ---------- */
  var carSel = $("car");
  carSel.innerHTML = E.CATALOG.map(function (c) { return '<option value="' + A.esc(c[0]) + '">' + A.esc(c[0]) + "</option>"; }).join("") +
    (E.findCar(S.car) ? "" : '<option value="' + A.esc(S.car) + '">' + A.esc(S.car) + "</option>");
  carSel.value = S.car;
  carSel.addEventListener("change", function () {
    var c = E.findCar(carSel.value);
    S.car = carSel.value;
    if (c) S.lv = c.slice(1);
    drawUse(); drawLevels(); update();
  });

  function drawUse() {
    $("use").innerHTML = T.levels.map(function (name, i) {
      return '<button type="button" data-use="' + i + '" aria-pressed="' + (S.use === i) + '" title="' + A.esc(T.hints[i]) + '">' + name + ' <span class="kwh">' + A.num(S.lv[i]) + "</span></button>";
    }).join("");
  }
  $("use").addEventListener("click", function (e) {
    var b = e.target.closest("[data-use]"); if (!b) return;
    S.use = +b.getAttribute("data-use"); drawUse(); update();
  });

  function drawLevels() {
    $("levels").innerHTML = T.levels.map(function (name, i) {
      return '<label class="ac-param"><span class="ac-param__label">' + name + '</span>' +
        '<span class="ac-param__box"><input data-lv="' + i + '" type="number" min="1" max="60" step="0.1" inputmode="decimal" value="' + S.lv[i] + '"><span class="ac-param__unit">kWh/100 km</span></span>' +
        '<span class="ac-param__hint">' + T.hints[i] + "</span></label>";
    }).join("");
  }
  $("levels").addEventListener("input", function (e) {
    var i = e.target.getAttribute("data-lv"); if (i == null) return;
    var v = parseFloat(e.target.value); if (isFinite(v) && v > 0) { S.lv[+i] = v; drawUse(); update(); }
  });

  /* ---------- 2. your electricity price ---------- */
  function bindNum(id, get, set, rangeId) {
    var el = $(id); el.value = get();
    el.addEventListener("input", function () { var v = parseFloat(el.value); if (isFinite(v) && v >= 0) { set(v); if (rangeId) $(rangeId).value = v; update(); } });
    if (rangeId) { var r = $(rangeId); r.value = get(); r.addEventListener("input", function () { set(parseFloat(r.value)); el.value = get(); update(); }); }
  }
  bindNum("p", function () { return S.p; }, function (v) { S.p = v; }, "pr");
  bindNum("loss", function () { return S.loss; }, function (v) { S.loss = v; });

  function drawPriceChips() {
    var chips = [{ n: T.home, p: HOME }];
    if (live) chips.push({ n: T.cheap, p: live.p10 }, { n: T.median, p: live.median }, { n: T.dear, p: live.p90 });
    $("pricechips").innerHTML = chips.map(function (c) {
      var p = Math.round(c.p * 100) / 100;
      return '<button type="button" class="ac-chip" data-p="' + p + '" aria-pressed="' + (Math.abs(p - S.p) < 0.001) + '">' + c.n + " " + eur(p) + "</button>";
    }).join("");
  }
  $("pricechips").addEventListener("click", function (e) {
    var b = e.target.closest("[data-p]"); if (!b) return;
    S.p = parseFloat(b.getAttribute("data-p")); $("p").value = S.p; $("pr").value = S.p; update();
  });

  /* ---------- 3. compare with ---------- */
  function drawRefs() {
    $("refs").innerHTML = E.FUEL_CARS.map(function (c) {
      return '<button type="button" class="ac-chip" data-ref="' + c.id + '" aria-pressed="' + (S.refs.indexOf(c.id) >= 0) + '">' +
        '<i class="dash dash--' + c.fuel + '" aria-hidden="true"></i>' + A.esc(c.name) + "</button>";
    }).join("");
  }
  $("refs").addEventListener("click", function (e) {
    var b = e.target.closest("[data-ref]"); if (!b) return;
    var id = b.getAttribute("data-ref"), i = S.refs.indexOf(id);
    if (i >= 0) S.refs.splice(i, 1);
    else { S.refs.push(id); S.refs.sort(function (a, b) { return E.FUEL_CARS.indexOf(E.findFuelCar(a)) - E.FUEL_CARS.indexOf(E.findFuelCar(b)); }); }
    drawRefs(); update();
  });

  var ownL = $("ownl");
  ownL.value = S.own ? S.own.l : "";
  ownL.addEventListener("input", function () {
    var v = parseFloat(ownL.value);
    S.own = isFinite(v) && v > 0 ? { l: Math.min(30, v), fuel: S.own ? S.own.fuel : ownFuel } : null;
    update();
  });
  var ownFuel = S.own ? S.own.fuel : "petrol";
  function drawOwnFuel() {
    [].forEach.call($("ownfuel").querySelectorAll("[data-fuel]"), function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-fuel") === ownFuel); });
  }
  $("ownfuel").addEventListener("click", function (e) {
    var b = e.target.closest("[data-fuel]"); if (!b) return;
    ownFuel = b.getAttribute("data-fuel"); if (S.own) S.own.fuel = ownFuel; drawOwnFuel(); update();
  });

  bindNum("petrol", function () { return S.petrol; }, function (v) { S.petrol = v; S.fuelSet = true; });
  bindNum("diesel", function () { return S.diesel; }, function (v) { S.diesel = v; S.fuelSet = true; });

  /* ---------- chart ---------- */
  function niceMax(v, step) { return Math.ceil(v / step - 1e-9) * step; }

  function drawChart(R, rows) {
    var el = $("chart");
    var W = Math.max(300, el.clientWidth || 640), narrow = W < 560;
    var H = narrow ? 340 : 400;
    var m = { t: 22, r: 14, b: 40, l: 46 };
    var iw = W - m.l - m.r, ih = H - m.t - m.b;
    var bes = rows.map(function (r) { return r.breakEven; });
    var xmax = Math.min(1.5, niceMax(Math.max(0.8, S.p + 0.1, live ? live.p90 + 0.05 : 0, Math.max.apply(null, bes.concat([0])) * 1.12), 0.1));
    var kWin = S.lv[3] * (1 + S.loss / 100), kUse = R.kwh * (1 + S.loss / 100), kEff = S.lv[0] * (1 + S.loss / 100);
    var ymax = niceMax(Math.max(10, kUse * xmax, Math.max.apply(null, rows.map(function (r) { return r.cost; }).concat([0])) * 1.1), 5);
    var X = function (v) { return m.l + v / xmax * iw; }, Y = function (v) { return m.t + ih - v / ymax * ih; };
    var f = function (v) { return v.toFixed(1); };
    var s = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + A.esc(T.chartLabel(S.car, rows.map(function (r) { return nameOf(r) + " " + eur(r.breakEven); }).join(", "))) + '">';

    // grid and axes
    var ystep = ymax > 25 ? 10 : 5;
    for (var y = 0; y <= ymax + 1e-9; y += ystep) {
      s += '<line x1="' + m.l + '" x2="' + (m.l + iw) + '" y1="' + f(Y(y)) + '" y2="' + f(Y(y)) + '" stroke="var(--chart-grid)"/>';
      s += '<text x="' + (m.l - 8) + '" y="' + f(Y(y) + 4) + '" text-anchor="end">' + A.money(y, { digits: 0 }) + "</text>";
    }
    var xstep = xmax > 1.05 ? 0.2 : 0.1;
    for (var x = 0; x <= xmax + 1e-9; x += xstep) {
      if (narrow && Math.round(x / xstep) % 2) continue;
      s += '<text x="' + f(X(x)) + '" y="' + (m.t + ih + 18) + '" text-anchor="middle">' + eur(x) + "</text>";
    }
    s += '<text class="axis" x="' + (m.l + iw) + '" y="' + (H - 4) + '" text-anchor="end">' + T.perKwh.replace("/", "€/") + " →</text>";
    s += '<text class="axis" x="' + m.l + '" y="' + (m.t - 10) + '" text-anchor="start">€' + T.per100 + "</text>";

    // where you charge
    if (live) {
      s += '<line x1="' + f(X(live.median)) + '" x2="' + f(X(live.median)) + '" y1="' + m.t + '" y2="' + (m.t + ih) + '" stroke="var(--chart-axis)" stroke-dasharray="2 4"/>';
    }
    s += '<line x1="' + f(X(S.p)) + '" x2="' + f(X(S.p)) + '" y1="' + m.t + '" y2="' + (m.t + ih) + '" stroke="var(--ink)" stroke-width="1.5"/>';

    // your car: a band from efficient to winter driving, and a line for the level you picked
    s += '<path d="M' + f(X(0)) + "," + f(Y(0)) + " L" + f(X(Math.min(xmax, ymax / kWin))) + "," + f(Y(Math.min(ymax, kWin * xmax))) +
      (kWin * xmax > ymax ? " L" + f(X(xmax)) + "," + f(Y(ymax)) : "") + " L" + f(X(xmax)) + "," + f(Y(Math.min(ymax, kEff * xmax))) + ' Z" fill="var(--accent)" opacity="0.08"/>';

    // fuel cars
    var labels = [];
    rows.forEach(function (r) {
      var cls = "fuel fuel--" + r.fuel + (r.own ? " fuel--own" : "");
      s += '<line class="' + cls + '" x1="' + m.l + '" x2="' + (m.l + iw) + '" y1="' + f(Y(r.cost)) + '" y2="' + f(Y(r.cost)) + '"/>';
      labels.push({ y: Y(r.cost) - 6, t: (narrow ? (r.own ? T.ownShort : r.short) : nameOf(r)) + " · " + eur(r.cost), cls: "lab lab--" + r.fuel });
    });
    // keep the line labels from sitting on top of each other
    labels.sort(function (a, b) { return b.y - a.y; });
    for (var i = 1; i < labels.length; i++) if (labels[i - 1].y - labels[i].y < 13) labels[i].y = labels[i - 1].y - 13;
    labels.forEach(function (l) { s += '<text class="' + l.cls + '" x="' + (m.l + 6) + '" y="' + f(l.y) + '">' + A.esc(l.t) + "</text>"; });

    var xEnd = Math.min(xmax, ymax / kUse);
    s += '<line x1="' + f(X(0)) + '" y1="' + f(Y(0)) + '" x2="' + f(X(xEnd)) + '" y2="' + f(Y(kUse * xEnd)) + '" stroke="var(--accent)" stroke-width="3.5" stroke-linecap="round"/>';
    s += '<text class="lab lab--ev" x="' + f(X(xEnd) - 4) + '" y="' + f(Y(kUse * xEnd) + (xEnd < xmax ? 14 : -8)) + '" text-anchor="end">' + A.esc(S.car) + "</text>";

    // break-even points
    var dots = rows.filter(function (r) { return r.breakEven <= xmax; }).sort(function (a, b) { return a.breakEven - b.breakEven; });
    var lastX = -1e9, lastY = 0;
    dots.forEach(function (r) {
      var cx = X(r.breakEven), cy = Y(r.cost);
      // a label below-right of the dot, unless the previous one is too close: then above-left
      var below = !(cx - lastX < 52 && Math.abs(cy - lastY) < 18);
      lastX = below ? cx : lastX; lastY = below ? cy : lastY;
      s += '<line x1="' + f(cx) + '" x2="' + f(cx) + '" y1="' + f(cy) + '" y2="' + (m.t + ih) + '" stroke="var(--chart-axis)" stroke-dasharray="1 3"/>';
      s += '<circle cx="' + f(cx) + '" cy="' + f(cy) + '" r="5" fill="var(--surface-100)" stroke="var(--accent)" stroke-width="2.5"/>';
      s += '<text class="be" x="' + f(below ? cx + 8 : cx - 8) + '" y="' + f(below ? cy + 17 : cy - 9) + '" text-anchor="' + (below ? "start" : "end") + '">' + eur(r.breakEven) + "</text>";
    });

    // price markers on top
    s += '<text class="you" x="' + f(X(S.p) + (X(S.p) > m.l + iw - 90 ? -6 : 6)) + '" y="' + (m.t + 12) + '" text-anchor="' + (X(S.p) > m.l + iw - 90 ? "end" : "start") + '">' + T.youLine + eur(S.p) + "</text>";
    if (live && Math.abs(X(live.median) - X(S.p)) > 70) s += '<text x="' + f(X(live.median) + 4) + '" y="' + (m.t + 26) + '">' + T.medianLine + eur(live.median) + "</text>";

    s += '<line x1="' + m.l + '" x2="' + (m.l + iw) + '" y1="' + (m.t + ih) + '" y2="' + (m.t + ih) + '" stroke="var(--chart-axis)"/>';
    s += '<line class="xh" y1="' + m.t + '" y2="' + (m.t + ih) + '" stroke="var(--chart-axis)" stroke-dasharray="3 3" visibility="hidden"/>';
    s += '<rect class="hit" x="' + m.l + '" y="' + m.t + '" width="' + iw + '" height="' + ih + '" fill="transparent"/></svg>';
    el.innerHTML = s + '<div class="ac-tip" hidden></div>';

    // hover or touch: what each car costs at that price
    var svg = el.querySelector("svg"), tip = el.querySelector(".ac-tip"), xh = el.querySelector(".xh");
    var move = function (e) {
      var r = svg.getBoundingClientRect(), px = (e.clientX - r.left) / r.width * W;
      var xv = Math.max(0, Math.min(xmax, (px - m.l) / iw * xmax));
      xv = Math.round(xv * 100) / 100;
      xh.setAttribute("x1", X(xv)); xh.setAttribute("x2", X(xv)); xh.setAttribute("visibility", "visible");
      var ev = kUse * xv;
      tip.innerHTML = "<b>" + eur(xv) + T.perKwh + "</b><div><span>" + A.esc(S.car) + "</span><span>" + eur(ev) + "</span></div>" +
        rows.map(function (row) { return "<div><span>" + A.esc(nameOf(row)) + "</span><span>" + eur(row.cost) + "</span></div>"; }).join("");
      tip.hidden = false;
      var er = el.getBoundingClientRect(), left = e.clientX - er.left + 14;
      if (left + tip.offsetWidth > er.width) left = e.clientX - er.left - tip.offsetWidth - 14;
      tip.style.left = Math.max(0, left) + "px"; tip.style.top = Math.max(0, e.clientY - er.top - 20) + "px";
    };
    var hit = el.querySelector(".hit");
    hit.addEventListener("pointermove", move);
    hit.addEventListener("pointerdown", move);
    hit.addEventListener("pointerleave", function () { tip.hidden = true; xh.setAttribute("visibility", "hidden"); });
  }

  /* ---------- output ---------- */
  var R;
  function update() {
    writeState();
    R = E.compute(S);
    var rows = R.rows.slice().sort(function (a, b) { return b.breakEven - a.breakEven; });
    var lvl = T.levels[S.use];

    // the answer
    var html = '<div class="ac-readout"><span class="ac-readout__value">' + eur(R.cost) + "<small>" + T.per100 + '</small></span><span class="ac-readout__basis">' +
      A.esc(T.costBasis(S.car, lvl, A.num(R.kwh))) + "</span></div>";
    var first = R.rows[0];
    if (first) {
      var d = Math.abs(first.saving);
      html += '<div class="ac-readout ac-readout--md"><span class="ac-readout__value ' + (first.saving >= 0 ? "good" : "bad") + '">' + eur(first.breakEven) + "<small>" + T.perKwh + '</small></span><span class="ac-readout__basis">' +
        A.esc(T.beBasis(first)) + "</span></div>";
      html += '<div class="ac-readout ac-readout--md"><span class="ac-readout__value ' + (first.saving >= 0 ? "good" : "bad") + '">' + eur(d) + "<small>" + T.per100 + '</small></span><span class="ac-readout__basis">' +
        A.esc(first.saving >= 0 ? T.cheaper(first) : T.dearer(first)) + "</span></div>";
    } else {
      html += '<div class="ac-readout ac-readout--md"><span class="ac-readout__value">' + A.money(R.per1000, { digits: 0 }) + "<small>" + T.per1000 + '</small></span><span class="ac-readout__basis">' + T.per1000Basis + "</span></div>";
    }
    $("readouts").innerHTML = html;

    $("norefs").style.display = rows.length ? "none" : "";
    drawChart(R, rows);

    // break-even table, highest break-even first
    $("tbody").innerHTML = rows.map(function (r) {
      var lo = Math.min.apply(null, r.levels), hi = Math.max.apply(null, r.levels);
      var good = r.saving >= 0;
      return "<tr" + (r.own ? ' class="is-mine"' : "") + '><td><i class="dash dash--' + r.fuel + '" aria-hidden="true"></i>' + A.esc(nameOf(r)) +
        '<span class="sub">' + T.fuel[r.fuel] + ", " + A.num(r.l) + " L · " + eur(r.cost) + T.per100 + "</span>" +
        '<span class="sub sub-save ' + (good ? "good" : "bad") + '">' + (good ? T.saveCell(eur(r.saving)) : T.moreCell(eur(-r.saving))) + "</span></td>" +
        '<td class="num"><b>' + eur(r.breakEven) + '</b><span class="sub">' + T.range(eur(lo), eur(hi)) + "</span></td>" +
        '<td class="num ' + (good ? "good" : "bad") + '">' + (good ? T.saveCell(eur(r.saving)) : T.moreCell(eur(-r.saving))) + "</td></tr>";
    }).join("");

    drawPriceChips();
    $("claude").href = "https://claude.ai/new?q=" + encodeURIComponent(T.claude + summary() + "\n\n" + location.origin + location.pathname + "?" + query());
  }

  function summary() {
    var inputs = {};
    inputs[T.in.car] = S.car;
    inputs[T.in.cons] = T.levels.map(function (n, i) { return n + " " + A.num(S.lv[i]); }).join(", ");
    inputs[T.in.use] = T.levels[S.use];
    inputs[T.in.price] = eur(S.p) + "/kWh";
    inputs[T.in.loss] = S.loss + " %";
    inputs[T.in.fuels] = T.fuelIn(eur(S.petrol), eur(S.diesel));
    if (live) inputs[T.in.live] = T.liveIn(eur(live.median), eur(live.p10), eur(live.p90));
    var results = {};
    results[T.out.cost] = eur(R.cost);
    R.rows.forEach(function (r) {
      results[T.out.be + " " + nameOf(r) + " (" + T.fuel[r.fuel] + ", " + A.num(r.l) + " L/100 km)"] = T.beOut(eur(r.breakEven), eur(r.cost));
    });
    return A.aiSummary(T.title, inputs, results);
  }

  $("copyai").addEventListener("click", function () { A.copy(summary(), $("copyai").querySelector("span")); });
  $("share").addEventListener("click", function () { A.copy(location.href, $("share").querySelector("span")); });

  var rt, lastW = 0;
  window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(function () { var w = $("chart").clientWidth; if (w !== lastW) { lastW = w; update(); } }, 150); });

  function sources() {
    var line = liveFuel ? T.fuelSourceLive(liveFuel.when) : T.fuelSourceAdac(T.month(E.FUEL_PRICES.month));
    if (live) line += T.chargeSource(live.n, live.when);
    $("fuelsource").innerHTML = line;
  }
  var fmtDate = function (iso) { return new Date(iso).toLocaleDateString(T.locale, { day: "numeric", month: "short", year: "numeric" }); };

  drawUse(); drawLevels(); drawRefs(); drawOwnFuel(); sources(); update();

  // Live public charging prices from the price archive; the page works without them.
  fetch("/data/charging-prices/latest.json").then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
    var o = j && j.overall;
    if (!o || o.median == null) return;
    live = { median: o.median, p10: o.p10, p90: o.p90, n: o.tariffs || "", when: fmtDate(j.observed_at) };
    sources(); update();
  }).catch(function () {});

  // Live pump prices (EU Weekly Oil Bulletin, national weekly average incl. taxes), when the fuel
  // collector has published them; otherwise the ADAC monthly average from calc.js stays.
  fetch("/data/fuel-prices/latest.json").then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
    var pr = j && j.products || {};
    var pick = function (k) { var v = pr[k] && pr[k].eur_per_litre; return v > 0.5 && v < 5 ? v : null; };
    var petrol = pick("euro_super_95"), dsl = pick("diesel");
    if (!petrol || !dsl) return;
    liveFuel = { petrol: petrol, diesel: dsl, when: j.week ? fmtDate(j.week) : "" };
    if (!S.fuelSet) { S.petrol = Math.round(petrol * 1000) / 1000; S.diesel = Math.round(dsl * 1000) / 1000; $("petrol").value = S.petrol; $("diesel").value = S.diesel; }
    sources(); update();
  }).catch(function () {});
})();
