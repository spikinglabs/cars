/* Fuel price page: this week's petrol, diesel and LPG prices and their weekly history since 2005,
   from /data/fuel-prices/<region>/{latest.json,weekly.csv}. One script for /fuel-prices/,
   /de/fuel-prices/ and /zh/fuel-prices/. Link state: ?fuel=euro_super_95|diesel|lpg and ?range=1y|5y|all. */
(() => {
  const lang = (document.documentElement.lang || "en").slice(0, 2);
  const de = lang === "de", zh = lang === "zh";
  const NAMES = de
    ? { euro_super_95: "Super (E5)", diesel: "Diesel", lpg: "Autogas (LPG)" }
    : zh ? { euro_super_95: "汽油 (Super E5)", diesel: "柴油", lpg: "液化石油气 (LPG)" }
    : { euro_super_95: "Petrol (Super E5)", diesel: "Diesel", lpg: "LPG" };
  const RANGES = { "1y": 52, "5y": 261, all: Infinity };
  const T = zh ? {
    locale: "zh-CN", ranges: { "1y": "1 年", "5y": "5 年", all: "2005 年以来" },
    now: (f, w) => `${f}，${w} 这一周的全国平均价`,
    change: (c) => c == null ? "" : ` · 比上周 ${c > 0 ? "+" : ""}${cent(c)}`,
    avg4: "最近 4 周平均", avg52: "最近 52 周平均",
    chart: "每周每升价格", made: "数据日期 ", failed: "无法加载数据：", dot: "。",
  } : de ? {
    locale: "de-DE", ranges: { "1y": "1 Jahr", "5y": "5 Jahre", all: "Seit 2005" },
    now: (f, w) => `${f}, Bundesdurchschnitt in der Woche ab ${w}`,
    change: (c) => c == null ? "" : ` · ${c > 0 ? "+" : ""}${cent(c)} zur Vorwoche`,
    avg4: "Schnitt der letzten 4 Wochen", avg52: "Schnitt der letzten 52 Wochen",
    chart: "Wöchentlicher Preis pro Liter", made: "Daten vom ", failed: "Die Daten konnten nicht geladen werden: ",
  } : {
    locale: "en-GB", ranges: { "1y": "1 year", "5y": "5 years", all: "Since 2005" },
    now: (f, w) => `${f}, national average for the week of ${w}`,
    change: (c) => c == null ? "" : ` · ${c > 0 ? "+" : ""}${cent(c)} on last week`,
    avg4: "Average of the last 4 weeks", avg52: "Average of the last 52 weeks",
    chart: "Weekly price per litre", made: "Data from ", failed: "Could not load data: ",
  };
  const $ = (id) => document.getElementById(id);
  const money = (v, d = 3) => v == null ? "–" : new Intl.NumberFormat(T.locale, { style: "currency", currency: S.cur, minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
  const cent = (v) => (de ? (v * 100).toFixed(1).replace(".", ",") : (v * 100).toFixed(1)) + " ct";
  const day = (iso, opts) => new Date(iso + "T12:00:00Z").toLocaleDateString(T.locale, opts || { day: "numeric", month: "short", year: "numeric" });
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const params = new URLSearchParams(location.search);
  const S = {
    fuel: NAMES[params.get("fuel")] ? params.get("fuel") : "euro_super_95",
    range: RANGES[params.get("range")] ? params.get("range") : "1y",
    cur: "EUR", rows: [], latest: null,
  };

  function parseCsv(text) {
    const [head, ...lines] = text.trim().split("\n");
    const keys = head.split(",");
    return lines.map((l) => Object.fromEntries(l.split(",").map((v, i) => [keys[i], v === "" ? null : isNaN(+v) ? v : +v])));
  }

  function chart(pts) {
    const W = Math.max(340, Math.min(860, $("chart").clientWidth || 860)), H = W < 600 ? 240 : 290, L = 60, R = 12, Tp = 14, B = 30;
    const vals = pts.map((p) => p.v);
    const span = Math.max(...vals) - Math.min(...vals);
    const step = span > 0.8 ? 0.2 : span > 0.4 ? 0.1 : 0.05;
    const y0 = Math.floor(Math.min(...vals) / step) * step, y1 = Math.ceil(Math.max(...vals) / step) * step;
    const x = (i) => L + (i * (W - L - R)) / Math.max(1, pts.length - 1);
    const y = (v) => Tp + (1 - (v - y0) / (y1 - y0 || 1)) * (H - Tp - B);
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${T.chart}">`;
    for (let v = y0; v <= y1 + 1e-9; v += step) {
      s += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${money(v, 2)}</text>`;
    }
    s += `<polyline class="line" points="${pts.map((p, i) => `${x(i)},${y(p.v)}`).join(" ")}"/>`;
    if (pts.length <= 270) pts.forEach((p, i) => { s += `<circle class="hit" cx="${x(i)}" cy="${y(p.v)}" r="5"><title>${day(p.d)}: ${money(p.v)}</title></circle>`; });
    const k = pts.length - 1;
    s += `<circle class="dot" cx="${x(k)}" cy="${y(pts[k].v)}" r="4"/>`;
    // x labels: months for one year, years otherwise
    const years = pts.length > 60;
    const every = years ? Math.ceil(pts.length / 52 / (W < 600 ? 4 : 10)) : (W < 600 ? 2 : 1);
    let last = "", n = 0;
    pts.forEach((p, i) => {
      const key = years ? p.d.slice(0, 4) : p.d.slice(0, 7);
      if (key !== last && i > 0) {
        if (n++ % every === 0 && i < k - 2) s += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${years ? key : day(p.d, { month: "short" })}</text>`;
      }
      last = key;
    });
    return s + "</svg>";
  }

  function render() {
    const p = S.latest.products[S.fuel];
    $("fuels").innerHTML = Object.keys(NAMES).filter((f) => S.latest.products[f]).map((f) =>
      `<button type="button" class="ac-chip" data-fuel="${f}" aria-pressed="${f === S.fuel}">${NAMES[f]}</button>`).join("");
    $("ranges").innerHTML = Object.keys(RANGES).map((r) =>
      `<button type="button" data-range="${r}" aria-pressed="${r === S.range}">${T.ranges[r]}</button>`).join("");
    $("readouts").innerHTML = `
      <div class="ac-readout"><div class="ac-readout__value">${money(p.price_per_litre)}<small>/L</small></div><div class="ac-readout__basis">${T.now(NAMES[S.fuel], day(S.latest.week))}${T.change(p.change_vs_previous_week)}</div></div>
      <div class="ac-readout ac-readout--md"><div class="ac-readout__value">${money(p.avg_4_weeks)}<small>/L</small></div><div class="ac-readout__basis">${T.avg4}</div></div>
      <div class="ac-readout ac-readout--md"><div class="ac-readout__value">${money(p.avg_52_weeks)}<small>/L</small></div><div class="ac-readout__basis">${T.avg52}</div></div>`;
    const pts = S.rows.filter((r) => r[S.fuel] != null).map((r) => ({ d: r.date, v: r[S.fuel] })).slice(-RANGES[S.range]);
    $("chart").innerHTML = pts.length ? chart(pts) : "";
    const u = new URL(location.href);
    if (S.fuel === "euro_super_95") u.searchParams.delete("fuel"); else u.searchParams.set("fuel", S.fuel);
    if (S.range === "1y") u.searchParams.delete("range"); else u.searchParams.set("range", S.range);
    history.replaceState(null, "", u);
  }

  $("fuels").addEventListener("click", (e) => {
    const b = e.target.closest("[data-fuel]");
    if (b && S.latest) { S.fuel = b.dataset.fuel; render(); }
  });
  $("ranges").addEventListener("click", (e) => {
    const b = e.target.closest("[data-range]");
    if (b && S.latest) { S.range = b.dataset.range; render(); }
  });
  let resized;
  addEventListener("resize", () => { clearTimeout(resized); resized = setTimeout(() => S.latest && render(), 200); });

  async function load() {
    const get = (file, how) => fetch(AlloSite.data("fuel-prices", file)).then((r) => { if (!r.ok) throw new Error(r.status); return r[how](); });
    const [latest, csv] = await Promise.all([get("latest.json", "json"), get("weekly.csv", "text")]);
    S.latest = latest; S.rows = parseCsv(csv); S.cur = latest.currency || "EUR";
    if (!latest.products[S.fuel]) S.fuel = Object.keys(latest.products)[0];
    $("asof").textContent = T.made + new Date(latest.observed_at).toLocaleString(T.locale, { day: "numeric", month: "short", year: "numeric" }) + (T.dot || ".");
    render();
  }
  load().catch((e) => { $("chart").innerHTML = `<p class="ac-caption">${T.failed}${esc(e.message)}</p>`; });
})();
