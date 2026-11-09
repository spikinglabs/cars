/* Charging price archive page: today's readouts, prices by charger type and operator, and the daily
   chart, from /data/charging-prices/. One script for the English (/charging-prices/), German
   (/de/charging-prices/) and Chinese (/zh/charging-prices/) page.
   Links: ?type=all|ac|dc|hpc picks the chart series, ?q= filters operators, ?sort=points|ac|dc|hpc
   sorts the operator table, ?all=1 shows every operator. */
(() => {
  const lang = (document.documentElement.lang || "en").slice(0, 2);
  const de = lang === "de", zh = lang === "zh";
  const T = zh ? {
    locale: "zh-CN", noData: "暂无数据。", chart: "每日即充即付充电价格中位数",
    tip: (p) => `${p.date}：中位数 ${eur(p.median)}，P10 ${eur(p.p10)}，P90 ${eur(p.p90)}，${p.n} ${p.unit}`,
    collected: "采集于 ", median: (n) => `${n} 种即充即付资费的中位数`,
    cheap: "最便宜的 10 % 支付这个价格或更低", dear: "最贵的 10 % 支付这个价格或更高",
    failed: "无法加载数据：", dot: "。",
    types: { all: "所有资费", ac: "交流", dc: "直流快充", hpc: "150 kW 以上" },
    typeLong: { ac: "交流充电（AC）", dc: "直流快充，150 kW 以下", hpc: "超快充，150 kW 及以上" },
    points: (n) => `${n} 个充电点的中位数`, range: (a, b) => `八成在 ${a} 到 ${b} 之间`,
    unitTariffs: "种资费", unitPoints: "个充电点",
    desc: { all: "所有开放许可来源的资费合计", ac: "交流充电点，每个充电点按其最便宜的即充即付资费计", dc: "150 kW 以下的直流充电点", hpc: "150 kW 及以上的直流充电点" },
    col: { op: "运营商", points: "充电点", ac: "交流", dc: "直流", hpc: "150 kW+" },
    sortBy: "排序", sort: { points: "充电点数量", ac: "交流最便宜", dc: "直流最便宜", hpc: "150 kW+ 最便宜" },
    more: (n) => `显示全部 ${n} 家`, less: "只显示前 15 家", noMatch: "没有找到这个运营商。", noOps: "运营商数据将在下一次采集后出现。",
  } : de ? {
    locale: "de-DE", noData: "Noch keine Daten.", chart: "Median-Preis fürs Ad-hoc-Laden pro Tag",
    tip: (p) => `${p.date}: Median ${eur(p.median)}, P10 ${eur(p.p10)}, P90 ${eur(p.p90)}, ${p.n} ${p.unit}`,
    collected: "erfasst am ", median: (n) => `Median von ${n} Ad-hoc-Tarifen`,
    cheap: "Die günstigsten 10 % zahlen so viel oder weniger", dear: "Die teuersten 10 % zahlen so viel oder mehr",
    failed: "Die Daten konnten nicht geladen werden: ",
    types: { all: "Alle Tarife", ac: "AC", dc: "DC-Schnellladen", hpc: "Ab 150 kW" },
    typeLong: { ac: "Wechselstrom (AC)", dc: "Schnellladen DC, unter 150 kW", hpc: "Ultraschnell, ab 150 kW" },
    points: (n) => `Median an ${n} Ladepunkten`, range: (a, b) => `8 von 10 zwischen ${a} und ${b}`,
    unitTariffs: "Tarife", unitPoints: "Ladepunkte",
    desc: { all: "Alle Quellen mit offener Lizenz zusammen", ac: "AC-Ladepunkte, jeder mit seinem günstigsten Ad-hoc-Tarif", dc: "DC-Ladepunkte unter 150 kW", hpc: "DC-Ladepunkte ab 150 kW" },
    col: { op: "Betreiber", points: "Ladepunkte", ac: "AC", dc: "DC", hpc: "150 kW+" },
    sortBy: "Sortieren", sort: { points: "Meiste Ladepunkte", ac: "AC günstigst", dc: "DC günstigst", hpc: "150 kW+ günstigst" },
    more: (n) => `Alle ${n} zeigen`, less: "Nur die ersten 15 zeigen", noMatch: "Kein Betreiber gefunden.", noOps: "Die Betreiber erscheinen nach der nächsten Erfassung.",
  } : {
    locale: "en-GB", noData: "No data yet.", chart: "Median ad-hoc charging price per day",
    tip: (p) => `${p.date}: median ${eur(p.median)}, P10 ${eur(p.p10)}, P90 ${eur(p.p90)}, ${p.n} ${p.unit}`,
    collected: "collected ", median: (n) => `Median of ${n} ad-hoc tariffs`,
    cheap: "Cheapest 10 % pay this or less", dear: "Dearest 10 % pay this or more",
    failed: "Could not load data: ",
    types: { all: "All tariffs", ac: "AC", dc: "DC fast", hpc: "150 kW+" },
    typeLong: { ac: "AC charging", dc: "DC fast, below 150 kW", hpc: "High-power, 150 kW and up" },
    points: (n) => `Median at ${n} charge points`, range: (a, b) => `8 in 10 between ${a} and ${b}`,
    unitTariffs: "tariffs", unitPoints: "charge points",
    desc: { all: "All open-licence sources together", ac: "AC charge points, each with its cheapest ad-hoc tariff", dc: "DC charge points below 150 kW", hpc: "DC charge points from 150 kW" },
    col: { op: "Operator", points: "Charge points", ac: "AC", dc: "DC", hpc: "150 kW+" },
    sortBy: "Sort", sort: { points: "Most charge points", ac: "Cheapest AC", dc: "Cheapest DC", hpc: "Cheapest 150 kW+" },
    more: (n) => `Show all ${n}`, less: "Show the first 15", noMatch: "No operator found.", noOps: "Operators appear after the next collection.",
  };
  const loc = de ? "de-DE" : zh ? "zh-CN" : "en-DE";
  const eur = (v) => v == null || v === "" ? "–" : new Intl.NumberFormat(loc, { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(v);
  const num = (v) => new Intl.NumberFormat(T.locale).format(v);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const $ = (id) => document.getElementById(id);
  const TYPES = ["all", "ac", "dc", "hpc"], SORTS = ["points", "ac", "dc", "hpc"], FIRST = 15;

  const params = new URLSearchParams(location.search);
  const state = {
    type: TYPES.includes(params.get("type")) ? params.get("type") : "all",
    sort: SORTS.includes(params.get("sort")) ? params.get("sort") : "points",
    q: params.get("q") || "",
    all: params.get("all") === "1",
  };
  let daily = [], power = [], latest = null;

  function syncUrl() {
    const u = new URLSearchParams();
    if (state.type !== "all") u.set("type", state.type);
    if (state.q) u.set("q", state.q);
    if (state.sort !== "points") u.set("sort", state.sort);
    if (state.all) u.set("all", "1");
    const s = u.toString();
    history.replaceState(null, "", location.pathname + (s ? "?" + s : "") + location.hash);
  }

  function parseCsv(text) {
    const [head, ...lines] = text.trim().split("\n");
    const keys = head.split(",");
    return lines.map((l) => {
      // operator names may be quoted and contain commas
      const vals = [];
      let cur = "", quoted = false;
      for (let i = 0; i < l.length; i++) {
        const ch = l[i];
        if (quoted) { if (ch === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') quoted = false; else cur += ch; }
        else if (ch === '"') quoted = true;
        else if (ch === ",") { vals.push(cur); cur = ""; }
        else cur += ch;
      }
      vals.push(cur);
      return Object.fromEntries(vals.map((v, i) => [keys[i], isNaN(+v) || v === "" ? v : +v]));
    });
  }

  function series() {
    if (state.type === "all") return daily.filter((r) => r.source === "ALL").map((r) => ({ ...r, n: r.tariffs, unit: T.unitTariffs }));
    return power.filter((r) => r.power === state.type).map((r) => ({ ...r, n: r.charge_points, unit: T.unitPoints }));
  }

  function chart(pts) {
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

  function drawChart() {
    const avail = TYPES.filter((t) => t === "all" || power.some((r) => r.power === t));
    if (!avail.includes(state.type)) state.type = "all";
    $("series").hidden = avail.length < 2;
    $("series").innerHTML = avail.map((t) => `<button type="button" data-type="${t}" aria-pressed="${t === state.type}">${T.types[t]}</button>`).join("");
    $("seriesdesc").textContent = T.desc[state.type];
    $("chart").innerHTML = chart(series());
  }

  function drawPower() {
    const bp = latest && latest.by_power;
    if (!bp || !Object.keys(bp).length) { $("by-type").hidden = true; return; }
    $("by-type").hidden = false;
    $("power").innerHTML = ["ac", "dc", "hpc"].filter((c) => bp[c]).map((c) => {
      const s = bp[c];
      return `<div class="ac-readout${c === "ac" ? "" : " ac-readout--md"}"><div class="ac-readout__value">${eur(s.median)}<small>/kWh</small></div>`
        + `<div class="ac-readout__basis"><b>${T.typeLong[c]}</b><br>${T.points(num(s.charge_points))}, ${T.range(eur(s.p10), eur(s.p90))}</div></div>`;
    }).join("");
  }

  function drawOps() {
    const list = (latest && latest.by_operator) || [];
    if (!list.length) { $("ops").innerHTML = `<p class="ac-caption">${T.noOps}</p>`; $("opsctl").hidden = true; $("opsmore").parentNode.hidden = true; return; }
    $("opsctl").hidden = false;
    for (const b of document.querySelectorAll("#opsort button")) b.setAttribute("aria-pressed", String(b.dataset.sort === state.sort));
    const price = (o) => o[state.sort] ? o[state.sort].median : Infinity;
    const sorted = [...list].sort((a, b) => state.sort === "points" ? b.charge_points - a.charge_points : price(a) - price(b) || b.charge_points - a.charge_points)
      .filter((o) => state.sort === "points" || o[state.sort]);
    const q = state.q.trim().toLowerCase();
    const found = q ? sorted.filter((o) => o.operator.toLowerCase().includes(q)) : sorted;
    const shown = q || state.all ? found : found.slice(0, FIRST);
    const c = T.col, hl = { points: 2, ac: 3, dc: 4, hpc: 5 }[state.sort];
    const cell = (o, k) => o[k] ? `${eur(o[k].median)}<span class="sub">${num(o[k].charge_points)}</span>` : "–";
    $("ops").innerHTML = shown.length
      ? `<table class="ac-table ops" data-hl="${hl}"><thead><tr><th>${c.op}</th><th class="num">${c.points}</th><th class="num">${c.ac}</th><th class="num">${c.dc}</th><th class="num">${c.hpc}</th></tr></thead><tbody>`
        + shown.map((o) => `<tr><td class="name">${esc(o.operator)}</td><td class="num">${num(o.charge_points)}</td><td class="num">${cell(o, "ac")}</td><td class="num">${cell(o, "dc")}</td><td class="num">${cell(o, "hpc")}</td></tr>`).join("")
        + "</tbody></table>"
      : `<p class="ac-caption">${T.noMatch}</p>`;
    const more = $("opsmore");
    more.parentNode.hidden = !!q || found.length <= FIRST;
    more.textContent = state.all ? T.less : T.more(num(found.length));
  }

  function render() { drawChart(); drawPower(); drawOps(); syncUrl(); }

  $("series").addEventListener("click", (e) => { const b = e.target.closest("[data-type]"); if (b) { state.type = b.dataset.type; drawChart(); syncUrl(); } });
  $("opsort").innerHTML = SORTS.map((s) => `<button type="button" data-sort="${s}">${T.sort[s]}</button>`).join("");
  $("opsort").addEventListener("click", (e) => { const b = e.target.closest("[data-sort]"); if (b) { state.sort = b.dataset.sort; drawOps(); syncUrl(); } });
  $("q").value = state.q;
  $("q").addEventListener("input", () => { state.q = $("q").value; drawOps(); syncUrl(); });
  $("opsmore").addEventListener("click", () => { state.all = !state.all; drawOps(); syncUrl(); });

  const csv = (file) => fetch(AlloSite.data("charging-prices", file)).then((r) => r.ok ? r.text() : "").then((t) => t ? parseCsv(t) : []).catch(() => []);

  async function load() {
    [latest, daily, power] = await Promise.all([
      fetch(AlloSite.data("charging-prices", "latest.json")).then((r) => r.json()),
      csv("daily.csv"),
      csv("daily_power.csv"),
    ]);
    const o = latest.overall || {};
    const when = new Date(latest.observed_at);
    $("asof").textContent = T.collected + when.toLocaleString(T.locale, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) + (T.dot || ".");
    $("readouts").innerHTML = `
      <div class="ac-readout"><div class="ac-readout__value">${eur(o.median)}<small>/kWh</small></div><div class="ac-readout__basis">${T.median(o.tariffs ?? "–")}</div></div>
      <div class="ac-readout ac-readout--md"><div class="ac-readout__value">${eur(o.p10)}<small>/kWh</small></div><div class="ac-readout__basis">${T.cheap}</div></div>
      <div class="ac-readout ac-readout--md"><div class="ac-readout__value">${eur(o.p90)}<small>/kWh</small></div><div class="ac-readout__basis">${T.dear}</div></div>`;
    render();
  }
  load().catch((e) => { $("chart").innerHTML = `<p class="ac-caption">${T.failed}${esc(e.message)}</p>`; });
})();
