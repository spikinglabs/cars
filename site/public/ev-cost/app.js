/* EV charging cost page: pick a car, set a price, see where charging stops being cheaper than fuel.
   One script for the English (/ev-cost/), German (/de/ev-cost/) and Chinese (/zh/ev-cost/) page; words come from T.
   The maths is in calc.js, so tests and AI tools get the same numbers. */
(function () {
  "use strict";
  var A = window.AlloCars, E = window.EvCost, D = E.DEFAULTS;
  var WORDS = {};
  WORDS.zh = {
    levels: ["经济", "日常", "高速", "冬季"],
    hints: ["城市和乡村道路，天气温和", "普通的一周驾驶", "匀速 120 km/h", "天冷，开暖风"],
    fuel: { petrol: "汽油", diesel: "柴油" },
    fuelPrice: { petrol: "汽油", diesel: "柴油" },
    own: "你的燃油车",
    home: "家庭电价", median: "公共充电中位数", pAc: "公共交流", pDc: "直流快充", pHpc: "150 kW 以上", cheap: "最便宜的 10 %", dear: "最贵的 10 %",
    perKwh: "/kWh", per100: "/100 km", per1000: "/1,000 km",
    costBasis: function (car, lvl, kwh) { return car + "，" + lvl + "，" + kwh + " kWh/100 km，含充电损耗"; },
    openIn: function (n) { return "在 " + n + " 中打开"; },
    youLine: function (p) { return "你的电价 " + p + "（第 2 步）"; }, medianLine: "公共充电中位数 ",
    evChart: function (car) { return "你的 " + car + "（第 1 步）"; },
    costBasis2: function (car, p, lvl, kwh, loss) { return "按 " + p + "/kWh 计算，你的 " + car + " 跑 100 公里的花费：驾驶方式“" + lvl + "”，" + kwh + " kWh/100 km，另加 " + loss + " % 充电损耗。"; },
    verdict: function (n, all) { return n === all ? (all === 1 ? "比你对比的燃油车更便宜。" : "比你对比的全部 " + all + " 辆燃油车都便宜。") : n === 0 ? (all === 1 ? "比你对比的燃油车更贵。" : "比你对比的全部 " + all + " 辆燃油车都贵。") : "比你对比的 " + all + " 辆燃油车中的 " + n + " 辆更便宜。"; },
    detail: function (r, fuelP, save, more) {
      var who = r.own ? "你的燃油车（第 3 步）每 100 公里用 " : r.name + " 每 100 公里用 ";
      return who + r.l + " 升" + T.fuel[r.fuel] + "，按 " + fuelP + "/L 计算要 " + r.costT + "。" +
        (save ? "你每 100 公里省 " + save + "。只要电价低于 " + r.beT + "/kWh，充电就更便宜。" : "你每 100 公里多花 " + more + "。电价要低于 " + r.beT + "/kWh 才更划算。");
    },
    chartLabel: function (car, list) { return car + " 每 100 公里成本随电价的变化，燃油车以直线表示。持平点：" + list; },
    saveCell: function (d) { return "省 " + d; }, moreCell: function (d) { return "贵 " + d; },
    range: function (a, b) { return a + " 至 " + b; },
    title: "电动车充电成本及与燃油车的持平点 (Allo Cars)",
    claude: "请帮我比较电动车充电成本和燃油车的花费。以下是我在 Allo Cars 上的数字：\n\n",
    in: { car: "电动车", cons: "能耗 (kWh/100 km)", use: "计算依据", price: "电价", loss: "充电损耗", fuels: "油价", live: "今天的公共即充即付充电（德国）" },
    out: { cost: "每 100 公里成本", be: "持平对象", at: "电价" },
    fuelIn: function (petrol, dsl) { return "汽油 " + petrol + "/L，柴油 " + dsl + "/L"; },
    liveIn: function (m, a, b) { return "中位数 " + m + "/kWh，最便宜的 10 % " + a + "，最贵的 10 % " + b; },
    beOut: function (be, cost) { return be + "/kWh（燃油车：" + cost + "/100 km）"; },
    fuelSourceAdac: function (m) { return '油价：<a href="https://www.adac.de/verkehr/tanken-kraftstoff-antrieb/kraftstoffpreisentwicklung/">ADAC 德国月均价</a>，' + m + "（E10 汽油和柴油）。"; },
    fuelSourceLive: function (when) { return '油价：欧盟委员会<a href="https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en">每周石油公报</a>中的德国周均价（CC BY 4.0），' + when + " 这一周。汽油 = Euro-Super 95。"; },
    chargeSource: function (n, when) { return ' 公共充电价格：<a href="/zh/charging-prices/">价格档案</a>中 ' + n + " 种即充即付资费的中位数，" + when + "。"; },
    month: function (ym) { var p = ym.split("-"); return p[0] + " 年 " + (+p[1]) + " 月"; },
    quick: "常见电动车", allCars: function (n) { return "全部 " + n + " 款电动车，基于官方数据"; },
    official: function (kwh, range, n, year) { return "官方 WLTP 数值：插头端 " + kwh + " kWh/100 km" + (range ? "（各版本 " + range + "）" : "") + "。" + year + " 年在德国新登记 " + n + " 辆。"; },
    officialOnly: "四种驾驶方式由此估算。",
    officialIn: "官方能耗（WLTP，插头端）",
    officialOut: function (kwh, year) { return kwh + " kWh/100 km（EEA，" + year + " 年新车）"; },
    locale: "zh-CN"
  };
  WORDS.de = {
    levels: ["Sparsam", "Normal", "Autobahn", "Winter"],
    hints: ["Stadt und Landstraße, mildes Wetter", "Eine normale Woche", "Konstant 120 km/h", "Kälte, Heizung an"],
    fuel: { petrol: "Benzin", diesel: "Diesel" },
    fuelPrice: { petrol: "Super", diesel: "Diesel" },
    own: "Dein Verbrenner",
    home: "Haushaltsstrom", median: "Öffentlich, Median", pAc: "Öffentlich AC", pDc: "Schnell DC", pHpc: "Ab 150 kW", cheap: "Günstigste 10 %", dear: "Teuerste 10 %",
    perKwh: "/kWh", per100: "/100 km", per1000: "/1.000 km",
    costBasis: function (car, lvl, kwh) { return car + ", " + lvl + ", " + kwh + " kWh/100 km inkl. Ladeverluste"; },
    openIn: function (n) { return "In " + n + " öffnen"; },
    youLine: function (p) { return "Dein Preis " + p + " (Schritt 2)"; }, medianLine: "Median öffentlich ",
    evChart: function (car) { return "Dein " + car + " (Schritt 1)"; },
    costBasis2: function (car, p, lvl, kwh, loss) { return "So viel kostet dein " + car + " für 100 km bei " + p + "/kWh: " + "Fahrweise „" + lvl + "“, " + kwh + " kWh/100 km plus " + loss + " % Ladeverluste."; },
    verdict: function (n, all) { return n === all ? (all === 1 ? "Günstiger als der Verbrenner, mit dem du vergleichst." : "Günstiger als alle " + all + " Verbrenner, mit denen du vergleichst.") : n === 0 ? (all === 1 ? "Teurer als der Verbrenner, mit dem du vergleichst." : "Teurer als alle " + all + " Verbrenner, mit denen du vergleichst.") : "Günstiger als " + n + " von " + all + " Verbrennern, mit denen du vergleichst."; },
    detail: function (r, fuelP, save, more) {
      var who = r.own ? "Dein Verbrenner (Schritt 3) braucht " : "Ein " + r.name + " braucht ";
      return who + r.l + " L " + T.fuel[r.fuel] + " pro 100 km, das sind " + r.costT + " bei " + fuelP + "/L. " +
        (save ? "Du sparst " + save + " auf je 100 km. Laden bleibt günstiger, solange du unter " + r.beT + "/kWh zahlst." : "Du zahlst " + more + " mehr auf je 100 km. Günstiger wärst du erst unter " + r.beT + "/kWh.");
    },
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
    quick: "Beliebte Elektroautos", allCars: function (n) { return "Alle " + n + " Elektroautos, aus dem offiziellen Verbrauch"; },
    official: function (kwh, range, n, year) { return "Offizieller WLTP-Verbrauch: " + kwh + " kWh/100 km ab Steckdose" + (range ? " (Versionen " + range + ")" : "") + ". " + n + " Neuzulassungen in Deutschland " + year + "."; },
    officialOnly: " Die vier Fahrweisen sind daraus geschätzt.",
    officialIn: "Offizieller Verbrauch (WLTP, ab Steckdose)",
    officialOut: function (kwh, year) { return kwh + " kWh/100 km (EEA, Neuwagen " + year + ")"; },
    locale: "de-DE"
  };
  WORDS.en = {
    levels: E.LEVELS, hints: E.LEVEL_HINTS,
    fuel: { petrol: "Petrol", diesel: "Diesel" },
    fuelPrice: { petrol: "Petrol", diesel: "Diesel" },
    own: "Your fuel car",
    home: "Home tariff", median: "Public median", pAc: "Public AC", pDc: "Fast DC", pHpc: "150 kW+", cheap: "Cheapest 10 %", dear: "Dearest 10 %",
    perKwh: "/kWh", per100: "/100 km", per1000: "/1,000 km",
    costBasis: function (car, lvl, kwh) { return car + ", " + lvl.toLowerCase() + ", " + kwh + " kWh/100 km plus charging losses"; },
    openIn: function (n) { return "Open in " + n; },
    youLine: function (p) { return "Your price " + p + " (step 2)"; }, medianLine: "Public median ",
    evChart: function (car) { return "Your " + car + " (step 1)"; },
    costBasis2: function (car, p, lvl, kwh, loss) { return "What 100 km cost in your " + car + " at " + p + "/kWh, with " + lvl.toLowerCase() + " driving: " + kwh + " kWh/100 km plus " + loss + " % charging losses."; },
    verdict: function (n, all) { return n === all ? (all === 1 ? "Cheaper than the fuel car you compare with." : "Cheaper than all " + all + " fuel cars you compare with.") : n === 0 ? (all === 1 ? "More expensive than the fuel car you compare with." : "More expensive than all " + all + " fuel cars you compare with.") : "Cheaper than " + n + " of the " + all + " fuel cars you compare with."; },
    detail: function (r, fuelP, save, more) {
      var who = r.own ? "Your fuel car (step 3) uses " : "A " + r.name + " uses ";
      return who + r.l + " L of " + T.fuel[r.fuel].toLowerCase() + " per 100 km, which costs " + r.costT + " at " + fuelP + "/L. " +
        (save ? "You save " + save + " every 100 km. Charging stays cheaper as long as you pay under " + r.beT + "/kWh." : "You pay " + more + " more every 100 km. You would need to pay under " + r.beT + "/kWh to beat it.");
    },
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
    quick: "Popular electric cars", allCars: function (n) { return "All " + n + " electric cars, from official figures"; },
    official: function (kwh, range, n, year) { return "Official WLTP figure: " + kwh + " kWh/100 km at the plug" + (range ? " (versions " + range + ")" : "") + ". " + n + " registered new in Germany in " + year + "."; },
    officialOnly: " The four driving levels are estimated from it.",
    officialIn: "Official consumption (WLTP, at the plug)",
    officialOut: function (kwh, year) { return kwh + " kWh/100 km (EEA, new cars " + year + ")"; },
    locale: "en-GB"
  };
  var T = WORDS[A.lang] || WORDS.en;
  var $ = function (id) { return document.getElementById(id); };
  var eur = function (x) { return A.money(x); };
  var HOME = 0.35;
  var live = null;     // public charging prices, if the data file loads
  var liveFuel = null; // daily fuel prices, if the data file loads
  var official = null; // official consumption per electric model, if the catalog loads: { byId, byName, year, list }
  var nameOf = function (r) { return r.own ? T.own : r.name; };

  /* ---------- state in the URL, and on this device ---------- */
  // Every setting is in the link. The last settings are also kept in this browser's local storage
  // (never sent anywhere), so opening the page without a link picks up where you left off.
  var SAVE_KEY = "allo-cars-ev-cost";
  var store = function (v) { try { if (v === undefined) return localStorage.getItem(SAVE_KEY); if (v === null) localStorage.removeItem(SAVE_KEY); else localStorage.setItem(SAVE_KEY, v); } catch (e) {} return null; };
  function source() {
    var q = new URLSearchParams(location.search);
    var KEYS = ["car", "lv", "use", "p", "loss", "petrol", "diesel", "refs", "own", "fl", "fp"];
    if (KEYS.some(function (k) { return q.has(k); })) return q;
    var saved = new URLSearchParams(store() || "");
    // Without a link, follow "My cars" (assets/garage.js): the car picked there, with its own
    // consumption if one is set, and the first fuel car there as the one to compare with.
    var G = window.AlloGarage, a = G && G.active();
    if (a && a.fuel === "electric" && a.name && a.name !== saved.get("car")) {
      saved.set("car", a.name);
      if (a.cons) saved.set("lv", [0.9, 1, 1.22, 1.38].map(function (k) { return (a.cons * k).toFixed(1); }).join(","));
      else saved.delete("lv");
    }
    var f = G && G.list().filter(function (c) { return (c.fuel === "petrol" || c.fuel === "diesel") && c.cons; })[0];
    if (f && !saved.get("own")) saved.set("own", f.cons + "," + f.fuel);
    return saved;
  }
  function readState() {
    var q = source(), s = JSON.parse(JSON.stringify(D));
    var num = function (k, max) { var v = parseFloat(q.get(k)); return isFinite(v) && v >= 0 && v <= max ? v : null; };
    if (q.get("car")) s.car = q.get("car").slice(0, 60);
    var lv = q.get("lv") ? q.get("lv").split(",").map(parseFloat) : null;
    // levels the page filled in itself (a built-in car's old estimates, saved before the levels came from the
    // official figure) don't count as set, so every page shows the same cost for the same car
    var builtin = E.findCar(s.car);
    if (lv && lv.length === 4 && lv.every(function (v) { return isFinite(v) && v > 0 && v < 100; }) &&
        !(builtin && builtin.slice(1).join() === lv.join())) { s.lv = lv; s.lvSet = true; }
    else if (builtin) s.lv = builtin.slice(1);
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
    q.set("car", S.car); if (S.lvSet) q.set("lv", S.lv.join(",")); q.set("use", S.use); q.set("p", S.p); q.set("loss", S.loss);
    // fuel prices only when you set them, so the latest published prices apply otherwise
    if (S.fuelSet) { q.set("petrol", S.petrol); q.set("diesel", S.diesel); }
    q.set("refs", S.refs.join(","));
    if (S.own) q.set("own", S.own.l + "," + S.own.fuel);
    return q.toString();
  }
  function writeState() {
    var qs = query();
    // other parameters in the link (country, and the "Cost over the years" card's own) stay as they are
    var keep = new URLSearchParams(location.search), mine = new URLSearchParams(qs), extra = new URLSearchParams();
    keep.forEach(function (v, k) { if (!mine.has(k) && ["petrol", "diesel", "own", "fl", "fp"].indexOf(k) < 0) extra.set(k, v); });
    var ex = extra.toString();
    try { history.replaceState(null, "", location.pathname + "?" + qs + (ex ? "&" + ex : "")); } catch (e) {}
    store(qs);
    // the language switch keeps your inputs
    document.querySelectorAll(".ac-lang").forEach(function (sw) { sw.href = sw.getAttribute("href").split("?")[0] + "?" + qs; });
  }
  var S = readState();

  /* ---------- 1. your car ---------- */
  var carSel = $("car");
  // Built-in cars come with hand-made real-world estimates. Once the official catalog loads, every other
  // electric car registered in Germany joins the list, with levels estimated from its WLTP figure.
  function officialFor(name) {
    if (!official) return null;
    return official.byId[E.OFFICIAL_IDS[name]] || official.byName[name] || null;
  }
  function drawCars() {
    var opt = function (n) { return '<option value="' + A.esc(n) + '">' + A.esc(n) + "</option>"; };
    var quick = E.CATALOG.map(function (c) { return c[0]; });
    var rest = official ? official.list.filter(function (m) { return !official.builtin[m.id]; }).map(function (m) { return m.name; }) : [];
    var known = quick.indexOf(S.car) >= 0 || rest.indexOf(S.car) >= 0;
    carSel.innerHTML = rest.length
      ? '<optgroup label="' + A.esc(T.quick) + '">' + quick.map(opt).join("") + "</optgroup>" +
        '<optgroup label="' + A.esc(T.allCars(rest.length)) + '">' + rest.map(opt).join("") + "</optgroup>" + (known ? "" : opt(S.car))
      : quick.map(opt).join("") + (known ? "" : opt(S.car));
    carSel.value = S.car;
    drawOfficial();
  }
  function drawOfficial() {
    var el = $("official"), o = officialFor(S.car);
    if (!o) { el.hidden = true; return; }
    var range = o.min != null && o.max != null && o.max - o.min >= 0.2 ? T.range(A.num(o.min), A.num(o.max)) : "";
    el.textContent = T.official(A.num(o.kwh), range, o.n.toLocaleString(T.locale), official.year) + (S.lvSet ? "" : T.officialOnly);
    el.hidden = false;
  }
  function setCar(name, keepLevels) {
    var c = E.findCar(name), o = officialFor(name);
    S.car = name;
    if (!keepLevels) {
      // the official WLTP figure when the catalog has it, as on the car page and in Compare; the built-in
      // estimates only until the catalog loads, or when it can't
      if (o) S.lv = E.levelsFromOfficial(o.kwh);
      else if (c) S.lv = c.slice(1);
    }
  }
  drawCars();
  carSel.addEventListener("change", function () {
    setCar(carSel.value); S.lvSet = false;
    drawOfficial(); drawUse(); drawLevels(); update();
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
    var v = parseFloat(e.target.value); if (isFinite(v) && v > 0) { S.lv[+i] = v; S.lvSet = true; drawUse(); update(); }
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
    if (live) {
      var bp = live.power;
      // by charger type when the archive has it: what a typical AC, fast and high-power point charges
      var mid = bp ? [["ac", T.pAc], ["dc", T.pDc], ["hpc", T.pHpc]].filter(function (c) { return bp[c[0]] && bp[c[0]].median > 0; })
        .map(function (c) { return { n: c[1], p: bp[c[0]].median }; }) : [];
      chips.push({ n: T.cheap, p: live.p10 });
      chips.push.apply(chips, mid.length ? mid : [{ n: T.median, p: live.median }]);
      chips.push({ n: T.dear, p: live.p90 });
    }
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
    var H = narrow ? 360 : 440;
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

    // fuel cars: a dashed line each, labelled on the line at the left. Cars with the same cost share
    // one label; labels that would overlap are spread out, with a short tick back to their line.
    var groups = [], boxes = [];
    rows.slice().sort(function (a, b) { return b.cost - a.cost; }).forEach(function (r) {
      var cls = "fuel fuel--" + r.fuel + (r.own ? " fuel--own" : "");
      s += '<line class="' + cls + '" x1="' + m.l + '" x2="' + (m.l + iw) + '" y1="' + f(Y(r.cost)) + '" y2="' + f(Y(r.cost)) + '"/>';
      var name = r.own ? T.own : r.short, g = groups[groups.length - 1];
      if (g && eur(g.cost) === eur(r.cost)) { g.names.push(name); g.own = g.own || r.own; }
      else groups.push({ cost: r.cost, line: Y(r.cost), y: Y(r.cost) - 5, names: [name], fuel: r.fuel, own: r.own });
    });
    var GAP = 14;
    for (var i = 1; i < groups.length; i++) if (groups[i].y - groups[i - 1].y < GAP) groups[i].y = groups[i - 1].y + GAP;
    var over = groups.length ? groups[groups.length - 1].y - (m.t + ih - 4) : 0;
    if (over > 0) groups.forEach(function (g) { g.y -= over; });
    groups.forEach(function (g) {
      var lx = m.l + 10;
      if (Math.abs(g.y + 5 - g.line) > 3) s += '<path class="tick" d="M' + (m.l + 3) + "," + f(g.line) + " L" + (m.l + 7) + "," + f(g.y - 4) + '"/>';
      var txt = g.names.join(", ") + (narrow ? "" : " · " + eur(g.cost));
      s += '<text class="lab lab--' + g.fuel + (g.own ? " lab--own" : "") + '" x="' + lx + '" y="' + f(g.y) + '">' + A.esc(txt) + "</text>";
      boxes.push({ x1: lx, x2: lx + txt.length * 6.4, y1: g.y - 11, y2: g.y + 3 });
    });

    var xEnd = Math.min(xmax, ymax / kUse);
    s += '<line x1="' + f(X(0)) + '" y1="' + f(Y(0)) + '" x2="' + f(X(xEnd)) + '" y2="' + f(Y(kUse * xEnd)) + '" stroke="var(--accent)" stroke-width="3.5" stroke-linecap="round"/>';
    // the EV label sits under the lower part of the line, away from the fuel lines
    var lxv = xEnd * 0.42;
    s += '<text class="lab lab--ev" x="' + f(X(lxv) + 10) + '" y="' + f(Y(kUse * lxv) + 18) + '">' + A.esc(T.evChart(S.car)) + "</text>";

    // break-even points
    var dots = rows.filter(function (r) { return r.breakEven <= xmax; }).sort(function (a, b) { return a.breakEven - b.breakEven; });
    // each price goes next to its dot, in the first spot that is free of other labels
    var hits = function (b) { return boxes.some(function (o) { return b.x1 < o.x2 && b.x2 > o.x1 && b.y1 < o.y2 && b.y2 > o.y1; }); };
    var lastT = "", lastY = -1;
    dots.forEach(function (r) {
      var cx = X(r.breakEven), cy = Y(r.cost), t = eur(r.breakEven), w = t.length * 7.2;
      s += '<line x1="' + f(cx) + '" x2="' + f(cx) + '" y1="' + f(cy) + '" y2="' + (m.t + ih) + '" stroke="var(--chart-axis)" stroke-dasharray="1 3"/>';
      s += '<circle cx="' + f(cx) + '" cy="' + f(cy) + '" r="5" fill="var(--surface-100)" stroke="var(--accent)" stroke-width="2.5"/>';
      // two cars with the same cost share one dot: label it once
      if (t === lastT && Math.abs(cy - lastY) < 2) return;
      lastT = t; lastY = cy;
      var spots = [[cx + 8, cy + 17], [cx + 8, cy + 31], [cx - 8 - w, cy - 9], [cx + 8, cy + 45]];
      for (var k = 0; k < spots.length; k++) {
        var b = { x1: spots[k][0], x2: spots[k][0] + w, y1: spots[k][1] - 12, y2: spots[k][1] + 2 };
        if (!hits(b) && b.x2 <= W) break;
      }
      if (k === spots.length) return; // no room: the table below lists it
      boxes.push(b);
      s += '<text class="be" x="' + f(b.x1) + '" y="' + f(b.y2 - 2) + '">' + t + "</text>";
    });

    // price markers on top
    var right = X(S.p) > m.l + iw * 0.55;
    s += '<text class="you" x="' + f(X(S.p) + (right ? -6 : 6)) + '" y="' + (m.t + 12) + '" text-anchor="' + (right ? "end" : "start") + '">' + T.youLine(eur(S.p)) + "</text>";
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

  /* ---------- open in an assistant ---------- */
  // One button opens the assistant you used last (kept on this device); the arrow lists the others.
  var AI = {
    claude: { name: "Claude", url: "https://claude.ai/new?q=" },
    chatgpt: { name: "ChatGPT", url: "https://chatgpt.com/?q=" },
    perplexity: { name: "Perplexity", url: "https://www.perplexity.ai/search?q=" }
  };
  var AI_KEY = "allo-cars-ai";
  var aiPick = "claude";
  try { if (AI[localStorage.getItem(AI_KEY)]) aiPick = localStorage.getItem(AI_KEY); } catch (e) {}
  var menu = $("aimenu"), more = $("aimore");
  var showMenu = function (open) { menu.hidden = !open; more.setAttribute("aria-expanded", open); };
  more.addEventListener("click", function (e) { e.stopPropagation(); showMenu(menu.hidden); if (!menu.hidden) menu.querySelector("a").focus(); });
  menu.addEventListener("click", function (e) {
    var a = e.target.closest("[data-ai]"); if (!a) return;
    aiPick = a.getAttribute("data-ai");
    try { localStorage.setItem(AI_KEY, aiPick); } catch (err) {}
    showMenu(false); update();
  });
  document.addEventListener("click", function (e) { if (!menu.hidden && !e.target.closest(".ai-split")) showMenu(false); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !menu.hidden) { showMenu(false); more.focus(); } });

  /* ---------- output ---------- */
  var R;
  function update() {
    writeState();
    R = E.compute(S);
    var rows = R.rows.slice().sort(function (a, b) { return b.breakEven - a.breakEven; });
    var lvl = T.levels[S.use];

    // the answer, in plain words
    var html = '<div class="ac-readout"><span class="ac-readout__value">' + eur(R.cost) + "<small>" + T.per100 + '</small></span><span class="ac-readout__basis">' +
      A.esc(T.costBasis2(S.car, eur(S.p), lvl, A.num(R.kwh), A.num(S.loss, 0))) + "</span></div>";
    var main = R.rows[0];
    if (main) {
      var wins = R.rows.filter(function (r) { return r.saving >= 0; }).length;
      var good = main.saving >= 0;
      html += '<div class="verdict"><p class="verdict__head ' + (wins === R.rows.length ? "good" : wins === 0 ? "bad" : "") + '">' + A.esc(T.verdict(wins, R.rows.length)) + "</p>" +
        '<p class="verdict__detail">' + A.esc(T.detail({ own: main.own, name: main.name, l: A.num(main.l), fuel: main.fuel, costT: eur(main.cost), beT: eur(main.breakEven) },
          eur(main.price), good ? eur(main.saving) : null, good ? null : eur(-main.saving))) + "</p></div>";
    }
    $("readouts").innerHTML = html;

    $("norefs").style.display = rows.length ? "none" : "";
    $("legown").hidden = !S.own;
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

    // the "Cost over the years" card (years-app.js) follows the car, price and fuel car set here
    window.__evCostLast = { state: S, result: R };
    try { document.dispatchEvent(new CustomEvent("ev-cost:update", { detail: window.__evCostLast })); } catch (e) {}

    drawPriceChips();
    // the same question, filled in, for each assistant that takes one from a link
    var ask = encodeURIComponent(T.claude + summary() + "\n\n" + location.origin + location.pathname + "?" + query());
    [].forEach.call($("aimenu").querySelectorAll("[data-ai]"), function (el) {
      var k = el.getAttribute("data-ai");
      el.href = AI[k].url + ask;
      el.setAttribute("aria-current", k === aiPick);
    });
    $("aigo").href = AI[aiPick].url + ask;
    $("ailabel").textContent = T.openIn(AI[aiPick].name);
  }

  function summary() {
    var inputs = {};
    inputs[T.in.car] = S.car;
    var o = officialFor(S.car);
    if (o) inputs[T.officialIn] = T.officialOut(A.num(o.kwh), official.year);
    inputs[T.in.cons] = T.levels.map(function (n, i) { return n + " " + A.num(S.lv[i]); }).join(", ");
    inputs[T.in.use] = T.levels[S.use];
    inputs[T.in.price] = eur(S.p) + "/kWh";
    inputs[T.in.loss] = S.loss + " %";
    inputs[T.in.fuels] = T.fuelIn(eur(S.petrol), eur(S.diesel));
    if (live) {
      inputs[T.in.live] = T.liveIn(eur(live.median), eur(live.p10), eur(live.p90));
      if (live.power) [["ac", T.pAc], ["dc", T.pDc], ["hpc", T.pHpc]].forEach(function (c) { if (live.power[c[0]]) inputs[c[1]] = eur(live.power[c[0]].median) + "/kWh"; });
    }
    var results = {};
    results[T.out.cost] = eur(R.cost);
    R.rows.forEach(function (r) {
      results[T.out.be + " " + nameOf(r) + " (" + T.fuel[r.fuel] + ", " + A.num(r.l) + " L/100 km)"] = T.beOut(eur(r.breakEven), eur(r.cost));
    });
    var yl = window.__evYears && window.__evYears.lines;
    if (yl) Object.keys(yl).forEach(function (k) { results[k] = yl[k]; });
    return A.aiSummary(T.title, inputs, results);
  }

  $("copyai").addEventListener("click", function () { A.copy(summary(), $("copyai").querySelector("span")); });
  $("share").addEventListener("click", function () { A.copy(location.href, $("share").querySelector("span")); });
  $("reset").addEventListener("click", function () { store(null); location.href = location.pathname; });

  var rt, lastW = 0;
  window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(function () { var w = $("chart").clientWidth; if (w !== lastW) { lastW = w; update(); } }, 150); });

  function sources() {
    var line = liveFuel ? T.fuelSourceLive(liveFuel.when) : T.fuelSourceAdac(T.month(E.FUEL_PRICES.month));
    if (live) line += T.chargeSource(live.n, live.when);
    $("fuelsource").innerHTML = line;
  }
  var fmtDate = function (iso) { return new Date(iso).toLocaleDateString(T.locale, { day: "numeric", month: "short", year: "numeric" }); };

  drawUse(); drawLevels(); drawRefs(); drawOwnFuel(); sources(); update();

  // A fuel car in "My cars" with no consumption of its own: compare with its official figure (vehicle catalog),
  // unless the link or your settings already name a fuel car.
  (function () {
    var G = window.AlloGarage, q = new URLSearchParams(location.search);
    if (S.own || !G || q.has("own") || q.has("fl")) return;
    var f = G.list().filter(function (c) { return (c.fuel === "petrol" || c.fuel === "diesel") && c.car; })[0];
    if (!f) return;
    fetch(AlloSite.data("vehicle-catalog", "models.json")).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      var m = j && (j.models || []).filter(function (x) { return x.id === f.car; })[0];
      if (!m || !(m.l_per_100km > 1) || S.own) return;
      S.own = { l: Math.round(m.l_per_100km * 10) / 10, fuel: f.fuel };
      ownFuel = f.fuel; ownL.value = S.own.l;
      drawOwnFuel(); update();
    }).catch(function () {});
  })();

  // Live public charging prices from the price archive; the page works without them.
  fetch(AlloSite.data("charging-prices", "latest.json")).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
    var o = j && j.overall;
    if (!o || o.median == null) return;
    live = { median: o.median, p10: o.p10, p90: o.p90, n: o.tariffs || "", when: fmtDate(j.observed_at), power: j.by_power || null };
    sources(); update();
  }).catch(function () {});

  // Official consumption of every electric model registered in Germany (EEA CO2 monitoring of new cars).
  fetch(AlloSite.data("vehicle-catalog", "electric.json")).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
    if (!j || !Array.isArray(j.models) || !j.models.length) return;
    var o = { byId: {}, byName: {}, builtin: {}, year: j.year, list: [] };
    j.models.forEach(function (m) {
      var e = { id: m[0], name: m[1], kwh: m[2], min: m[3], max: m[4], n: m[5] };
      if (!(e.kwh > 3 && e.kwh < 60)) return;
      o.byId[e.id] = e; o.byName[e.name] = e; o.list.push(e);
    });
    Object.keys(E.OFFICIAL_IDS).forEach(function (n) { o.builtin[E.OFFICIAL_IDS[n]] = true; });
    o.list.sort(function (a, b) { return a.name.localeCompare(b.name, T.locale); });
    official = o;
    // the car gets its levels from the official figure now, unless the link or you set them
    if (officialFor(S.car) && !S.lvSet) { setCar(S.car); drawUse(); drawLevels(); }
    drawCars(); update();
  }).catch(function () {});

  // Live pump prices (EU Weekly Oil Bulletin, national weekly average incl. taxes), when the fuel
  // collector has published them; otherwise the ADAC monthly average from calc.js stays.
  fetch(AlloSite.data("fuel-prices", "latest.json")).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
    var pr = j && j.products || {};
    var pick = function (k) { var v = pr[k] && pr[k].eur_per_litre; return v > 0.5 && v < 5 ? v : null; };
    var petrol = pick("euro_super_95"), dsl = pick("diesel");
    if (!petrol || !dsl) return;
    liveFuel = { petrol: petrol, diesel: dsl, when: j.week ? fmtDate(j.week) : "" };
    if (!S.fuelSet) { S.petrol = Math.round(petrol * 1000) / 1000; S.diesel = Math.round(dsl * 1000) / 1000; $("petrol").value = S.petrol; $("diesel").value = S.diesel; }
    sources(); update();
  }).catch(function () {});
})();
