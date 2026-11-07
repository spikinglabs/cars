/* Home page: today's public charging price and a sparkline of the daily median. English, German and Chinese. */
(function () {
  var lang = (document.documentElement.lang || "en").slice(0, 2);
  var WORDS = {
    zh: {
      locale: "zh-CN", basis: function (n, a, b) { return n + " 种资费的中位数 · 最便宜的 10 % " + a + " · 最贵的 10 % " + b; },
      asof: "所有已公布即充即付资费的中位数，每 kWh 欧元价格，含增值税。采集于 ",
      fail: "查看档案", failBasis: "暂时无法加载最新价格。", dot: "。"
    },
    de: {
    locale: "de-DE", basis: function (n, a, b) { return "Median von " + n + " Tarifen · günstigste 10 % " + a + " · teuerste 10 % " + b; },
    asof: "Median aller veröffentlichten Ad-hoc-Tarife, € pro kWh inkl. MwSt. Erfasst am ",
    fail: "Zum Archiv", failBasis: "Die aktuellen Preise konnten gerade nicht geladen werden."
    },
    en: {
    locale: "en-GB", basis: function (n, a, b) { return "Median of " + n + " tariffs · cheapest 10 % " + a + " · dearest 10 % " + b; },
    asof: "Median of every published ad-hoc tariff, € per kWh incl. VAT. Collected ",
    fail: "See the archive", failBasis: "The latest prices could not be loaded just now."
    }
  };
  if (!WORDS[lang]) lang = "en";
  var T = WORDS[lang];
  var eur = function (v) { return v == null ? "–" : new Intl.NumberFormat(lang === "en" ? "en-DE" : T.locale, { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(v); };
  Promise.all([
    fetch(AlloSite.data("charging-prices", "latest.json")).then(function (r) { return r.json(); }),
    fetch(AlloSite.data("charging-prices", "daily.csv")).then(function (r) { return r.ok ? r.text() : ""; }).catch(function () { return ""; })
  ]).then(function (res) {
    var j = res[0], o = j.overall || {};
    document.getElementById("live").innerHTML = '<span class="ac-readout__value">' + eur(o.median) + '<small>/kWh</small></span><span class="ac-readout__basis">' + T.basis(o.tariffs || "–", eur(o.p10), eur(o.p90)) + "</span>";
    var when = new Date(j.observed_at);
    if (!isNaN(when)) document.getElementById("liveasof").textContent = T.asof + when.toLocaleString(T.locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) + (T.dot || ".");
    var rows = res[1].trim().split("\n"), head = rows.shift() || "", k = head.split(",");
    var pts = rows.map(function (l) { var v = l.split(","), o2 = {}; k.forEach(function (n, i) { o2[n] = v[i]; }); return o2; }).filter(function (r) { return r.source === "ALL"; }).map(function (r) { return +r.median; });
    if (pts.length < 2) { document.getElementById("spark").style.display = "none"; return; }
    var lo = Math.min.apply(null, pts) - 0.02, hi = Math.max.apply(null, pts) + 0.02;
    var d = pts.map(function (v, i) { return (i ? "L" : "M") + (i * 400 / (pts.length - 1)).toFixed(1) + " " + (84 - (v - lo) / (hi - lo) * 78).toFixed(1); }).join(" ");
    document.getElementById("spark").innerHTML = '<path d="' + d + '" fill="none" stroke="var(--car-2)" stroke-width="2.5" vector-effect="non-scaling-stroke"/>';
  }).catch(function () {
    document.getElementById("live").innerHTML = '<span class="ac-readout__value" style="font-size:28px;line-height:32px">' + T.fail + '</span><span class="ac-readout__basis">' + T.failBasis + "</span>";
    document.getElementById("spark").style.display = "none";
  });
})();
