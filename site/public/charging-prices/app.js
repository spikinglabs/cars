/* Charging price archive page: today's readouts and the daily chart, from /data/charging-prices/.
   One script for the English (/charging-prices/) and German (/de/charging-prices/) page. */
(() => {
  const de = document.documentElement.lang === "de";
  const T = de ? {
    locale: "de-DE", noData: "Noch keine Daten.", chart: "Median-Preis fürs Ad-hoc-Laden pro Tag",
    tip: (p) => `${p.date}: Median ${eur(p.median)}, P10 ${eur(p.p10)}, P90 ${eur(p.p90)}, ${p.tariffs} Tarife`,
    collected: "erfasst am ", median: (n) => `Median von ${n} Ad-hoc-Tarifen`,
    cheap: "Die günstigsten 10 % zahlen so viel oder weniger", dear: "Die teuersten 10 % zahlen so viel oder mehr",
    failed: "Die Daten konnten nicht geladen werden: ",
  } : {
    locale: "en-GB", noData: "No data yet.", chart: "Median ad-hoc charging price per day",
    tip: (p) => `${p.date}: median ${eur(p.median)}, P10 ${eur(p.p10)}, P90 ${eur(p.p90)}, ${p.tariffs} tariffs`,
    collected: "collected ", median: (n) => `Median of ${n} ad-hoc tariffs`,
    cheap: "Cheapest 10 % pay this or less", dear: "Dearest 10 % pay this or more",
    failed: "Could not load data: ",
  };
  const eur = (v) => v == null ? "–" : new Intl.NumberFormat(de ? "de-DE" : "en-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(v);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function parseCsv(text) {
    const [head, ...lines] = text.trim().split("\n");
    const keys = head.split(",");
    return lines.map((l) => Object.fromEntries(l.split(",").map((v, i) => [keys[i], isNaN(+v) || v === "" ? v : +v])));
  }

  function chart(rows) {
    const pts = rows.filter((r) => r.source === "ALL");
    if (!pts.length) return `<p class="ac-caption">${T.noData}</p>`;
    const W = 860, H = 280, L = 56, R = 16, Tp = 12, B = 30;
    const lo = Math.min(...pts.map((p) => p.p10)), hi = Math.max(...pts.map((p) => p.p90));
    const y0 = Math.floor(lo * 10) / 10, y1 = Math.ceil(hi * 10) / 10 || 1;
    const x = (i) => L + (pts.length === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (pts.length - 1));
    const y = (v) => Tp + (1 - (v - y0) / (y1 - y0 || 1)) * (H - Tp - B);
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${T.chart}">`;
    for (let v = y0; v <= y1 + 1e-9; v += 0.1) {
      s += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${eur(v)}</text>`;
    }
    const band = pts.map((p, i) => `${x(i)},${y(p.p90)}`).concat(pts.map((p, i) => `${x(i)},${y(p.p10)}`).reverse());
    if (pts.length > 1) s += `<polygon class="band" points="${band.join(" ")}"/>`;
    else s += `<line x1="${x(0)}" x2="${x(0)}" y1="${y(pts[0].p90)}" y2="${y(pts[0].p10)}" stroke="var(--car-1)" stroke-width="8" stroke-linecap="round" opacity=".6"/>`;
    s += `<polyline class="line" points="${pts.map((p, i) => `${x(i)},${y(p.median)}`).join(" ")}"/>`;
    pts.forEach((p, i) => { s += `<circle class="dot" cx="${x(i)}" cy="${y(p.median)}" r="3.5"><title>${T.tip(p)}</title></circle>`; });
    const last = pts[pts.length - 1];
    s += `<text x="${Math.min(x(pts.length - 1) + 8, W - R)}" y="${y(last.median) - 8}" text-anchor="${pts.length > 1 ? "end" : "start"}" style="fill:var(--ink);font-weight:700">${eur(last.median)}</text>`;
    const step = Math.max(1, Math.ceil(pts.length / 8));
    pts.forEach((p, i) => { if (i % step === 0 || i === pts.length - 1) s += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${p.date.slice(8)}.${p.date.slice(5, 7)}.</text>`; });
    return s + "</svg>";
  }

  async function load() {
    const [latest, daily] = await Promise.all([
      fetch(AlloCars.data("charging-prices", "latest.json")).then((r) => r.json()),
      fetch(AlloCars.data("charging-prices", "daily.csv")).then((r) => r.text()).then(parseCsv),
    ]);
    const o = latest.overall || {};
    const when = new Date(latest.observed_at);
    document.getElementById("asof").textContent = T.collected + when.toLocaleString(T.locale, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) + ".";
    document.getElementById("readouts").innerHTML = `
      <div class="ac-readout"><div class="ac-readout__value">${eur(o.median)}<small>/kWh</small></div><div class="ac-readout__basis">${T.median(o.tariffs ?? "–")}</div></div>
      <div class="ac-readout ac-readout--md"><div class="ac-readout__value">${eur(o.p10)}<small>/kWh</small></div><div class="ac-readout__basis">${T.cheap}</div></div>
      <div class="ac-readout ac-readout--md"><div class="ac-readout__value">${eur(o.p90)}<small>/kWh</small></div><div class="ac-readout__basis">${T.dear}</div></div>`;
    document.getElementById("chart").innerHTML = chart(daily);
  }
  load().catch((e) => { document.getElementById("chart").innerHTML = `<p class="ac-caption">${T.failed}${esc(e.message)}</p>`; });
})();
