/* Fuel price page: the last year of weekly prices and the 8-week forecast with its bands,
   from /data/fuel-prices/<region>/{weekly.csv,forecast.json}. One script for /fuel-prices/ and
   /de/fuel-prices/. The product is ?fuel=euro_super_95|diesel|lpg in the link. */
(() => {
  const de = document.documentElement.lang === "de";
  const NAMES = de
    ? { euro_super_95: "Super (E5)", diesel: "Diesel", lpg: "Autogas (LPG)" }
    : { euro_super_95: "Petrol (Super E5)", diesel: "Diesel", lpg: "LPG" };
  const T = de ? {
    locale: "de-DE", now: "Diese Woche", nowBasis: (w) => `Bundesdurchschnitt, Woche ab ${w}`,
    change: (c) => c == null ? "" : ` · ${c > 0 ? "+" : ""}${cent(c)} zur Vorwoche`,
    in: (h) => `In ${h} Wochen wahrscheinlich`, likely: "8 von 10 Mal lag der Preis in diesem Bereich",
    between: "bis", chart: "Wöchentlicher Preis und Prognose", past: "Gemessen", mid: "Prognose", b80: "8 von 10", b95: "19 von 20",
    naive: (n) => `Keine der getesteten Methoden hat in den letzten zwei Jahren die einfache Annahme „der Preis bleibt, wie er ist“ geschlagen (${n} Prüfwochen). Deshalb ist die Mittellinie flach. Die Bänder zeigen, wie weit sich der Preis in so vielen Wochen sonst bewegt hat.`,
    skill: (m, s) => `Die Methode „${m}“ lag in den letzten zwei Jahren bei 4 Wochen im Schnitt ${s} % näher am echten Preis als die Annahme „der Preis bleibt“.`,
    models: { drift: "Trend des letzten Jahres", ar: "Schwung der letzten Wochen" },
    upd: "Prognose berechnet am ", failed: "Die Daten konnten nicht geladen werden: ", none: "Für diese Sorte gibt es hier keine Prognose.",
  } : {
    locale: "en-GB", now: "This week", nowBasis: (w) => `National average, week of ${w}`,
    change: (c) => c == null ? "" : ` · ${c > 0 ? "+" : ""}${cent(c)} on last week`,
    in: (h) => `In ${h} weeks, likely`, likely: "8 times out of 10 the price ended up in this range",
    between: "to", chart: "Weekly price and forecast", past: "Measured", mid: "Forecast", b80: "8 in 10", b95: "19 in 20",
    naive: (n) => `Over the last two years no method we tested beat the plain assumption "the price stays where it is" (${n} test weeks), so the middle line is flat. The bands show how far the price moved over that many weeks.`,
    skill: (m, s) => `Over the last two years the "${m}" method was on average ${s} % closer to the real price 4 weeks ahead than assuming no change.`,
    models: { drift: "last year's trend", ar: "recent momentum" },
    upd: "Forecast made ", failed: "Could not load data: ", none: "No forecast for this fuel here.",
  };
  const $ = (id) => document.getElementById(id);
  const money = (v, d = 3) => v == null ? "–" : new Intl.NumberFormat(T.locale, { style: "currency", currency: S.cur, minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
  const cent = (v) => (de ? (v * 100).toFixed(1).replace(".", ",") : (v * 100).toFixed(1)) + " ct";
  const day = (iso, opts) => new Date(iso + "T12:00:00Z").toLocaleDateString(T.locale, opts || { day: "numeric", month: "short", year: "numeric" });
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const params = new URLSearchParams(location.search);
  const S = { fuel: NAMES[params.get("fuel")] ? params.get("fuel") : "euro_super_95", cur: "EUR", rows: [], fc: null };

  function parseCsv(text) {
    const [head, ...lines] = text.trim().split("\n");
    const keys = head.split(",");
    return lines.map((l) => Object.fromEntries(l.split(",").map((v, i) => [keys[i], v === "" ? null : isNaN(+v) ? v : +v])));
  }

  function chart(hist, path) {
    const W = Math.max(340, Math.min(860, $("chart").clientWidth || 860)), H = W < 600 ? 260 : 300, L = 60, R = 12, Tp = 14, B = 30;
    const all = hist.map((p) => p.v).concat(path.flatMap((p) => [p.lo95, p.hi95]));
    const step = 0.05;
    const y0 = Math.floor(Math.min(...all) / step) * step, y1 = Math.ceil(Math.max(...all) / step) * step;
    const n = hist.length + path.length;
    const x = (i) => L + (i * (W - L - R)) / (n - 1);
    const y = (v) => Tp + (1 - (v - y0) / (y1 - y0 || 1)) * (H - Tp - B);
    const k0 = hist.length - 1;
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${T.chart}">`;
    const every = (y1 - y0) / step > 8 ? 2 : 1;
    for (let i = 0, v = y0; v <= y1 + 1e-9; i++, v += step) {
      if (i % every) continue;
      s += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${money(v, 2)}</text>`;
    }
    s += `<rect class="future" x="${x(k0)}" y="${Tp}" width="${W - R - x(k0)}" height="${H - Tp - B}"/>`;
    const band = (lo, hi) => [`${x(k0)},${y(hist[k0].v)}`].concat(path.map((p, i) => `${x(k0 + 1 + i)},${y(p[hi])}`))
      .concat(path.map((p, i) => `${x(k0 + 1 + i)},${y(p[lo])}`).reverse()).join(" ");
    s += `<polygon class="b95" points="${band("lo95", "hi95")}"/><polygon class="b80" points="${band("lo80", "hi80")}"/>`;
    s += `<polyline class="line" points="${hist.map((p, i) => `${x(i)},${y(p.v)}`).join(" ")}"/>`;
    s += `<polyline class="fline" points="${[`${x(k0)},${y(hist[k0].v)}`].concat(path.map((p, i) => `${x(k0 + 1 + i)},${y(p.price)}`)).join(" ")}"/>`;
    hist.forEach((p, i) => { s += `<circle class="hit" cx="${x(i)}" cy="${y(p.v)}" r="5"><title>${day(p.d)}: ${money(p.v)}</title></circle>`; });
    path.forEach((p, i) => { s += `<circle class="hit" cx="${x(k0 + 1 + i)}" cy="${y(p.price)}" r="5"><title>${day(p.date)}: ${money(p.price)} (${money(p.lo80)} ${T.between} ${money(p.hi80)})</title></circle>`; });
    s += `<circle class="dot" cx="${x(k0)}" cy="${y(hist[k0].v)}" r="4"/>`;
    let lastMonth = "";
    hist.concat(path.map((p) => ({ d: p.date }))).forEach((p, i) => {
      const m = p.d.slice(0, 7);
      if (m !== lastMonth && p.d.slice(8) <= "07" && i > 1 && i < n - 2 && (W >= 600 || +m.slice(5) % 2)) s += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${day(p.d, { month: "short" })}</text>`;
      lastMonth = m;
    });
    return s + "</svg>";
  }

  function render() {
    const p = S.fc && S.fc.products[S.fuel];
    $("fuels").innerHTML = Object.keys(NAMES).filter((f) => S.fc && S.fc.products[f]).map((f) =>
      `<button type="button" class="ac-chip" data-fuel="${f}" aria-pressed="${f === S.fuel}">${NAMES[f]}</button>`).join("");
    if (!p) { $("chart").innerHTML = `<p class="ac-caption">${T.none}</p>`; return; }
    const hist = S.rows.filter((r) => r[S.fuel] != null).slice(-52).map((r) => ({ d: r.date, v: r[S.fuel] }));
    const prev = hist.length > 1 ? hist[hist.length - 1].v - hist[hist.length - 2].v : null;
    const f4 = p.forecast[3], f8 = p.forecast[7];
    $("readouts").innerHTML = `
      <div class="ac-readout"><div class="ac-readout__value">${money(p.last.price)}<small>/L</small></div><div class="ac-readout__basis">${T.now}: ${NAMES[S.fuel]}. ${T.nowBasis(day(p.last.date))}${T.change(prev)}</div></div>
      <div class="ac-readout ac-readout--md"><div class="ac-readout__value">${money(f4.lo80, 2)}–${money(f4.hi80, 2)}</div><div class="ac-readout__basis">${T.in(4)} (${day(f4.date)}). ${T.likely}</div></div>
      <div class="ac-readout ac-readout--md"><div class="ac-readout__value">${money(f8.lo80, 2)}–${money(f8.hi80, 2)}</div><div class="ac-readout__basis">${T.in(8)} (${day(f8.date)})</div></div>`;
    $("chart").innerHTML = chart(hist, p.forecast);
    const bt = p.backtest;
    const s4 = bt.skill_vs_naive[3];
    $("skill").textContent = p.model === "naive" || !(s4 > 0)
      ? T.naive(bt.origins)
      : T.skill(T.models[p.model] || p.model, Math.round(s4 * 100));
    $("table").innerHTML = p.forecast.map((r) => `<tr><td>${day(r.date)}</td><td>${money(r.price)}</td><td>${money(r.lo80)}–${money(r.hi80)}</td><td>${money(r.lo95)}–${money(r.hi95)}</td></tr>`).join("");
    const u = new URL(location.href);
    if (S.fuel === "euro_super_95") u.searchParams.delete("fuel"); else u.searchParams.set("fuel", S.fuel);
    history.replaceState(null, "", u);
  }

  $("fuels").addEventListener("click", (e) => {
    const b = e.target.closest("[data-fuel]");
    if (b) { S.fuel = b.dataset.fuel; render(); }
  });

  let resized;
  addEventListener("resize", () => { clearTimeout(resized); resized = setTimeout(() => S.fc && render(), 200); });

  async function load() {
    const [rows, fc] = await Promise.all([
      fetch(AlloSite.data("fuel-prices", "weekly.csv")).then((r) => { if (!r.ok) throw new Error(r.status); return r.text(); }).then(parseCsv),
      fetch(AlloSite.data("fuel-prices", "forecast.json")).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }),
    ]);
    S.rows = rows; S.fc = fc; S.cur = fc.currency || "EUR";
    if (!fc.products[S.fuel]) S.fuel = Object.keys(fc.products)[0];
    $("asof").textContent = T.upd + new Date(fc.observed_at).toLocaleString(T.locale, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) + ".";
    render();
  }
  load().catch((e) => { $("chart").innerHTML = `<p class="ac-caption">${T.failed}${esc(e.message)}</p>`; });
})();
