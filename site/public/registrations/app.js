/* New car registrations page: the monthly registrations of one model, or of up to six side by side,
   this month's top models and the electric share of the market, from /data/registrations/ (KBA FZ10).
   One script for the English (/registrations/), German (/de/registrations/) and Chinese (/zh/registrations/) page.
   The picked models are ?model=<slug>,<slug>,… in the link, else the ones picked last on this device. */
(() => {
  const lang = (document.documentElement.lang || "en").slice(0, 2);
  const de = lang === "de", zh = lang === "zh";
  const T = zh ? {
    locale: "zh-CN", months: (n) => `${n} 个月`, failed: "无法加载数据：",
    latest: (m) => `${m}新车登记`, rank: (r, n) => r ? `在 ${n} 款车型中排名第 ${r}` : "未进入排名",
    year: "过去 12 个月", bev: "其中纯电动 (BEV)", bevNone: "没有登记纯电动版本",
    noModel: "没有找到车型。请输入品牌和车型，例如“Volvo EX30”。",
    chartModel: (m) => `每月新车登记量：${m}`, tipModel: (r) => `${month(r.month)}：新登记 ${num(r.total)} 辆，其中纯电动 ${num(r.bev)} 辆`,
    chartShare: "电动车在全部新车中的占比", tipShare: (r) => `${month(r.month)}：纯电动占 ${pct(r.bev_share)}，${num(r.total)} 辆中有 ${num(r.bev)} 辆`,
    other: "其他", change: (c) => c == null ? "新" : `${c > 0 ? "+" : ""}${c.toLocaleString("zh-CN")} %`,
    marketLine: (s) => `${month(s.month)}共有 ${num(s.market.total)} 辆新乘用车登记，其中 ${pct(s.market.share_pct.bev)} 为纯电动。`,
    asof: (m) => `最新月份：${m}。`,
    wShare: (m) => `${m}纯电动占比`, wAgo: (v) => `一年前为 ${v}`, wYtd: (y, n) => `${y} 年前 ${n} 个月的纯电动新车`, wYtdVs: (c) => `比去年同期${c > 0 ? "多" : "少"} ${Math.abs(c).toLocaleString("zh-CN")} %`,
    wGrant: "补贴开始以来的纯电动占比", wBefore: (v) => `之前 12 个月为 ${v}`, grant: "电动车补贴", wNew: "新的电动版本", wMore: (n) => `多 ${n} 辆`,
    addMore: "添加车型进行对比", remove: (n) => `移除 ${n}`, more: (n) => `再显示 ${n} 款`, mo: "/ 12 个月", older: "较早数据",
    cmpTitle: (n) => `${n} 款车型对比`, full: (n) => `最多同时对比 ${n} 款车型。请先移除一款。`,
    thModel: "车型", thRank: "排名", thYear: "12 个月", thBev: "纯电占比",
    chartCmp: (f) => f === "total" ? "每月新车登记量" : `每月新车登记量：${T.fuels[f]}`,
    all: "全部车型", chartAll: "每月新车登记量：全部车型", latestAll: (m) => `${m}新车登记`, segLabel: "显示内容",
    split: { ev: "是否电动", fuel: "按动力类型" }, rest: "汽油、柴油和混动",
    fuels: { total: "全部新车", bev: "纯电动 (BEV)", phev: "插电混动", hev: "其他混动", diesel: "柴油", petrol: "汽油及其他" },
    phevNote: "2021 年以前的统计没有单独列出插电混动，它们算在“其他混动”里。",
  } : de ? {
    locale: "de-DE", months: (n) => `${n} Monate`, failed: "Die Daten konnten nicht geladen werden: ",
    latest: (m) => `Neuzulassungen im ${m}`, rank: (r, n) => r ? `Platz ${r} von ${n} Modellen` : "nicht in der Rangliste",
    year: "In den letzten 12 Monaten", bev: "Davon elektrisch (BEV)", bevNone: "Keine Elektroversion zugelassen",
    noModel: "Kein Modell gefunden. Tippe Marke und Modell, zum Beispiel „Volvo EX30“.",
    chartModel: (m) => `Neuzulassungen pro Monat: ${m}`, tipModel: (r) => `${month(r.month)}: ${num(r.total)} neu, davon ${num(r.bev)} elektrisch`,
    chartShare: "Anteil elektrischer Autos an allen Neuzulassungen", tipShare: (r) => `${month(r.month)}: ${pct(r.bev_share)} elektrisch, ${num(r.bev)} von ${num(r.total)}`,
    other: "Sonstige", change: (c) => c == null ? "neu" : `${c > 0 ? "+" : ""}${c.toLocaleString("de-DE")} %`,
    marketLine: (s) => `${num(s.market.total)} neue Pkw im ${month(s.month)}, ${pct(s.market.share_pct.bev)} davon elektrisch.`,
    asof: (m) => `Stand: ${m}.`,
    wShare: (m) => `Elektroanteil im ${m}`, wAgo: (v) => `vor einem Jahr ${v}`, wYtd: (y, n) => `neue E-Autos in den ersten ${n} Monaten ${y}`, wYtdVs: (c) => `${c > 0 ? "+" : ""}${c.toLocaleString("de-DE")} % zum Vorjahr`,
    wGrant: "Elektroanteil seit Start der Förderung", wBefore: (v) => `in den 12 Monaten davor ${v}`, grant: "E-Auto-Förderung", wNew: "neue Elektroversion", wMore: (n) => `${n} mehr`,
    addMore: "Modell zum Vergleich", remove: (n) => `${n} entfernen`, more: (n) => `${n} weitere zeigen`, mo: "/ 12 Mon.", older: "ältere Daten",
    cmpTitle: (n) => `${n} Modelle im Vergleich`, full: (n) => `Höchstens ${n} Modelle auf einmal. Entferne erst eines.`,
    thModel: "Modell", thRank: "Platz", thYear: "12 Monate", thBev: "Elektro",
    chartCmp: (f) => f === "total" ? "Neuzulassungen pro Monat" : `Neuzulassungen pro Monat: ${T.fuels[f]}`,
    all: "Alle Modelle", chartAll: "Neuzulassungen pro Monat, alle Modelle", latestAll: (m) => `Neue Pkw im ${m}`, segLabel: "Was zeigen",
    split: { ev: "Elektrisch oder nicht", fuel: "Nach Antrieb" }, rest: "Benzin, Diesel und Hybrid",
    fuels: { total: "Alle neuen Autos", bev: "Elektrisch (BEV)", phev: "Plug-in-Hybrid", hev: "Andere Hybride", diesel: "Diesel", petrol: "Benzin und Sonstige" },
    phevNote: "Bis 2020 zählt die Statistik Plug-in-Hybride nicht getrennt, sie stecken in „Andere Hybride“.",
  } : {
    locale: "en-GB", months: (n) => `${n} months`, failed: "Could not load data: ",
    latest: (m) => `New registrations in ${m}`, rank: (r, n) => r ? `Rank ${r} of ${n} models` : "not ranked",
    year: "In the last 12 months", bev: "Of which electric (BEV)", bevNone: "No electric version registered",
    noModel: "No model found. Type make and model, for example “Volvo EX30”.",
    chartModel: (m) => `New registrations per month: ${m}`, tipModel: (r) => `${month(r.month)}: ${num(r.total)} new, ${num(r.bev)} electric`,
    chartShare: "Electric cars as a share of all new cars", tipShare: (r) => `${month(r.month)}: ${pct(r.bev_share)} electric, ${num(r.bev)} of ${num(r.total)}`,
    other: "Other", change: (c) => c == null ? "new" : `${c > 0 ? "+" : ""}${c.toLocaleString("en-GB")} %`,
    marketLine: (s) => `${num(s.market.total)} new cars in ${month(s.month)}, ${pct(s.market.share_pct.bev)} of them electric.`,
    asof: (m) => `Latest month: ${m}.`,
    wShare: (m) => `Electric share in ${m}`, wAgo: (v) => `a year before: ${v}`, wYtd: (y, n) => `new electric cars in the first ${n} months of ${y}`, wYtdVs: (c) => `${c > 0 ? "+" : ""}${c.toLocaleString("en-GB")} % on a year before`,
    wGrant: "Electric share since the grant started", wBefore: (v) => `the 12 months before: ${v}`, grant: "E-Auto grant", wNew: "new electric version", wMore: (n) => `${n} more`,
    addMore: "Add a model to compare", remove: (n) => `Remove ${n}`, more: (n) => `Show ${n} more`, mo: "/ 12 mo", older: "older data",
    cmpTitle: (n) => `${n} models compared`, full: (n) => `Up to ${n} models at once. Remove one first.`,
    thModel: "Model", thRank: "Rank", thYear: "12 months", thBev: "Electric",
    chartCmp: (f) => f === "total" ? "New registrations per month" : `New registrations per month: ${T.fuels[f]}`,
    all: "All models", chartAll: "New registrations per month, all models", latestAll: (m) => `New cars in ${m}`, segLabel: "What to show",
    split: { ev: "Electric or not", fuel: "By fuel type" }, rest: "Petrol, diesel and hybrid",
    fuels: { total: "All new cars", bev: "Electric (BEV)", phev: "Plug-in hybrid", hev: "Other hybrid", diesel: "Diesel", petrol: "Petrol and other" },
    phevNote: "Before 2021 the statistics do not count plug-in hybrids on their own; they are in Other hybrid.",
  };
  const KEY = "allo-cars-registrations-model";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const num = (v) => v == null ? "–" : Number(v).toLocaleString(T.locale);
  const pct = (v) => v == null ? "–" : `${Number(v).toLocaleString(T.locale, { maximumFractionDigits: 1 })} %`;
  const month = (m, short) => new Date(`${m}-15`).toLocaleDateString(T.locale, { month: short ? "short" : "long", year: "numeric" });
  const local = (k, v) => { try { return v === undefined ? localStorage.getItem(k) : localStorage.setItem(k, v); } catch (e) { return null; } };

  // KBA writes names in capitals. Make them easier to read without breaking names like BMW, ID.3 or CX-30.
  const KEEP = new Set(["BMW", "VW", "MG", "DS", "BYD", "GWM", "KGM", "NIO", "MAN", "DAF", "JAC", "AMG", "GT", "SUV", "UP"]);
  const word = (w) => w.split("-").map((p) => /^\d+ER$/.test(p) ? p.slice(0, -2) + "er" : /\d/.test(p) || p.replace(/\W/g, "").length <= 3 || KEEP.has(p) ? p : p.charAt(0) + p.slice(1).toLowerCase()).join("-");
  const nice = (s) => s === "SONSTIGE" ? T.other : String(s).split(" ").map(word).join(" ");
  const label = (m) => `${nice(m.brand)} ${nice(m.model)}`;
  const norm = (s) => String(s || "").toLowerCase().replace("volkswagen", "vw").replace(/[^a-z0-9]+/g, "");

  function parseCsv(text) {
    const [head, ...lines] = text.trim().split("\n");
    const keys = head.split(",");
    return lines.map((l) => Object.fromEntries(l.split(",").map((v, i) => [keys[i], v === "" ? null : isNaN(+v) ? v : +v])));
  }

  function find(models, text) {
    const t = norm(text);
    if (!t) return null;
    const by = (f) => models.filter(f);
    const exact = by((m) => m.slug === text || norm(label(m)) === t || norm(`${m.brand} ${m.model}`) === t);
    if (exact.length) return exact[0];
    const inside = by((m) => t.includes(norm(`${m.brand} ${m.model}`))).sort((a, b) => b.model.length - a.model.length);
    if (inside.length) return inside[0];
    const has = by((m) => norm(`${m.brand} ${m.model}`).includes(t) || norm(m.model) === t);
    return has.sort((a, b) => (b.last_12_months || 0) - (a.last_12_months || 0))[0] || null;
  }

  // The KBA counts hybrid with plug-in hybrids in it (plug-ins on their own only since 2021) and
  // gives no petrol column: petrol and other is what is left of the total.
  const FUELS = ["bev", "phev", "hev", "diesel", "petrol"];
  const FCOL = { bev: "var(--car-2)", phev: "var(--series-3)", hev: "var(--series-4)", diesel: "var(--fuel)", petrol: "var(--series-2)" };
  const parts = (r) => {
    const t = r.total || 0, d = r.diesel || 0, h = r.hybrid || 0, e = r.bev || 0, p = Math.min(r.phev || 0, h);
    return { total: t, bev: e, phev: p, hev: h - p, diesel: d, petrol: Math.max(0, t - d - h - e) };
  };

  function bars(rows, title, split) {
    const W = 860, H = 260, L = 52, R = 12, Tp = 14, B = 28;
    const max = Math.max(1, ...rows.map((r) => r.total || 0));
    const step = Math.pow(10, Math.floor(Math.log10(max))) * (max / Math.pow(10, Math.floor(Math.log10(max))) > 5 ? 2 : max / Math.pow(10, Math.floor(Math.log10(max))) > 2 ? 1 : 0.5);
    const top = Math.ceil(max / step) * step;
    const bw = (W - L - R) / Math.max(rows.length, 36);  // few months: narrow bars, not one wide block
    const x0 = W - R - bw * rows.length;
    const y = (v) => Tp + (1 - v / top) * (H - Tp - B);
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">`;
    for (let v = 0; v <= top + 1e-9; v += step) s += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${num(v)}</text>`;
    rows.forEach((r, i) => {
      const x = x0 + i * bw + bw * 0.12, w = Math.max(bw * 0.76, 1);
      const t = r.total || 0, e = Math.min(r.bev || 0, t);
      if (split === "fuel") {
        const pt = parts(r);
        s += `<g><title>${esc(`${month(r.month)}: ${num(t)}\n` + FUELS.map((f) => `${T.fuels[f]}: ${num(pt[f])}`).join("\n"))}</title>`;
        let acc = 0;
        for (const f of FUELS) {
          if (pt[f] <= 0) continue;
          s += `<rect x="${x}" y="${y(acc + pt[f])}" width="${w}" height="${y(acc) - y(acc + pt[f])}" style="fill:${FCOL[f]}"/>`;
          acc += pt[f];
        }
        s += "</g>";
      } else {
        s += `<g><title>${esc(T.tipModel(r))}</title>`;
        if (t - e > 0) s += `<rect class="b-rest" x="${x}" y="${y(t)}" width="${w}" height="${y(e) - y(t)}"/>`;
        if (e > 0) s += `<rect class="b-ev" x="${x}" y="${y(e)}" width="${w}" height="${y(0) - y(e)}"/>`;
        s += "</g>";
      }
      if (r.month.endsWith("-01") || (i === 0 && rows.length < 12)) s += `<text x="${x + w / 2}" y="${H - 8}" text-anchor="middle">${r.month.slice(0, 4)}</text>`;
    });
    return s + "</svg>";
  }

  function shareLine(rows) {
    const pts = rows.filter((r) => r.bev_share != null);
    const W = 860, H = 220, L = 44, R = 46, Tp = 14, B = 28;
    const top = Math.max(10, Math.ceil(Math.max(...pts.map((p) => p.bev_share)) / 10) * 10);
    const x = (i) => L + (i * (W - L - R)) / Math.max(pts.length - 1, 1);
    const y = (v) => Tp + (1 - v / top) * (H - Tp - B);
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(T.chartShare)}">`;
    for (let v = 0; v <= top; v += 10) s += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${v} %</text>`;
    s += `<polyline class="line" points="${pts.map((p, i) => `${x(i)},${y(p.bev_share)}`).join(" ")}"/>`;
    pts.forEach((p, i) => {
      s += `<circle class="hit" cx="${x(i)}" cy="${y(p.bev_share)}" r="5"><title>${esc(T.tipShare(p))}</title></circle>`;
      if (p.month.endsWith("-01")) s += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${p.month.slice(0, 4)}</text>`;
    });
    const gi = window.EvWave ? pts.findIndex((p) => p.month === window.EvWave.GRANT_FROM) : -1;
    if (gi >= 0) s += `<line class="grant" x1="${x(gi)}" x2="${x(gi)}" y1="${Tp}" y2="${H - B}"/><text x="${x(gi) - 6}" y="${Tp + 10}" text-anchor="end">${esc(T.grant)}</text>`;
    const last = pts[pts.length - 1];
    if (last) s += `<circle class="dot" cx="${x(pts.length - 1)}" cy="${y(last.bev_share)}" r="4"/><text x="${x(pts.length - 1) + 6}" y="${y(last.bev_share) + 4}" style="fill:var(--ink);font-weight:700">${pct(last.bev_share)}</text>`;
    return s + "</svg>";
  }

  // One line per picked model, on one scale. field "total" or "bev". Months before a model's first
  // registration are left out; a month with no row after that counts as 0.
  function lines(series, field, title) {
    const W = 860, H = 280, L = 52, R = 12, Tp = 14, B = 28;
    const end = summary.month;
    const start = series.map((x) => x.rows[0]?.month).filter(Boolean).sort()[0] || end;
    const months = [];
    for (let y0 = +start.slice(0, 4), m0 = +start.slice(5); `${y0}-${String(m0).padStart(2, "0")}` <= end; m0 === 12 ? (y0++, m0 = 1) : m0++) months.push(`${y0}-${String(m0).padStart(2, "0")}`);
    const vals = series.map((x) => {
      // plug-in hybrids are only counted on their own since 2021: no line before that
      const by = Object.fromEntries(x.rows.map((r) => [r.month, field === "phev" && r.phev == null ? null : parts(r)[field] || 0]));
      const first = x.rows[0]?.month || end;
      return months.map((mo) => mo < first ? null : mo in by ? by[mo] : 0);
    });
    const max = Math.max(1, ...vals.flat().filter((v) => v != null));
    const mag = Math.pow(10, Math.floor(Math.log10(max))), f = max / mag;
    const step = mag * (f > 5 ? 2 : f > 2 ? 1 : 0.5);
    const top = Math.ceil(max / step) * step;
    const x = (i) => L + (i * (W - L - R)) / Math.max(months.length - 1, 1);
    const y = (v) => Tp + (1 - v / top) * (H - Tp - B);
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">`;
    for (let v = 0; v <= top + 1e-9; v += step) s += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${num(v)}</text>`;
    months.forEach((mo, i) => { if (mo.endsWith("-01") || (i === 0 && months.length < 12)) s += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${mo.slice(0, 4)}</text>`; });
    vals.forEach((v, k) => {
      const pts = v.map((val, i) => val == null ? null : `${x(i).toFixed(1)},${y(val).toFixed(1)}`).filter(Boolean);
      s += `<polyline class="cmp-line" style="stroke:${color(k)}" points="${pts.join(" ")}"/>`;
      const li = v.length - 1;
      if (v[li] != null) s += `<circle cx="${x(li)}" cy="${y(v[li])}" r="3.5" style="fill:${color(k)}"/>`;
    });
    // one invisible column per month, its tooltip lists every model
    const cw = (W - L - R) / Math.max(months.length - 1, 1);
    months.forEach((mo, i) => {
      const tip = `${month(mo)}\n` + series.map((sr, k) => `${label(sr.m)}: ${vals[k][i] == null ? "–" : num(vals[k][i])}`).join("\n");
      s += `<rect class="hit" x="${x(i) - cw / 2}" y="${Tp}" width="${cw}" height="${H - Tp - B}"><title>${esc(tip)}</title></rect>`;
    });
    return s + "</svg>";
  }

  function table(rows, field) {
    return rows.map((r, i) => `<tr><td class="num">${i + 1}</td><td><a href="?model=${encodeURIComponent(r.slug)}" data-slug="${esc(r.slug)}">${esc(label(r))}</a></td><td class="num">${num(r[field])}</td><td class="num">${esc(T.change(r.change_vs_last_year_pct))}</td></tr>`).join("");
  }

  const MAX = 6;
  const color = (k) => `var(--series-${k + 1})`;
  let models = [], summary = null, market = [], picked = [];
  let split = "ev", field = "total";  // bars: electric or not / by fuel type; lines: which registrations
  const LINE_FIELDS = ["total", ...FUELS];
  const cache = {};
  const monthsOf = (m) => cache[m.slug] || (cache[m.slug] = fetch(AlloSite.data("registrations", m.file)).then((r) => r.json()).then((d) => d.months));
  const bySlug = (slug) => models.find((x) => x.slug === slug);

  // latest month, last 12 months and electric share of one model
  function stats(m, rows) {
    const from = shiftYear(summary.month);
    const year = rows.filter((r) => r.month > from).reduce((a, r) => a + (r.total || 0), 0);
    const yearBev = rows.filter((r) => r.month > from).reduce((a, r) => a + (r.bev || 0), 0);
    const last = rows[rows.length - 1];
    const current = last && last.month === summary.month ? last : { month: summary.month, total: 0, bev: 0 };
    return { current, year, yearBev };
  }

  // picked models live in ?model=a,b,c (one slug still works) and on this device
  function save(push) {
    local(KEY, picked.join(","));
    if (!push) return;
    const u = new URL(location.href);
    if (picked.length) u.searchParams.set("model", picked.join(",")); else u.searchParams.delete("model");
    if (split === "fuel") u.searchParams.set("by", "fuel"); else u.searchParams.delete("by");
    if (field !== "total") u.searchParams.set("fuel", field); else u.searchParams.delete("fuel");
    history.replaceState(null, "", u.href.replace(/%2C/g, ","));  // slugs never hold a comma
  }

  function chips() {
    $("picked").innerHTML = picked.map((slug, k) => {
      const m = bySlug(slug);
      return `<button type="button" class="ac-chip pk-chip" data-remove="${esc(slug)}" aria-label="${esc(T.remove(label(m)))}"><i style="background:${color(k)}"></i>${esc(label(m))} <span aria-hidden="true">×</span></button>`;
    }).join("");
    $("picked").hidden = !picked.length;
    q.placeholder = picked.length ? T.addMore : q.dataset.placeholder;
  }

  let drawn = 0;
  async function show(push) {
    save(push);
    chips();
    const my = ++drawn;
    const ms = picked.map(bySlug);
    const all = await Promise.all(ms.map(monthsOf));
    if (my !== drawn) return;  // a newer pick came in while loading
    const ranked = models.filter((x) => x.rank).length;
    if (ms.length <= 1) {
      // one model, or with none picked the whole market
      const m = ms[0], rows = m ? all[0] : market, st = stats(m, rows);
      $("model-title").textContent = m ? label(m) : T.all;
      $("model-out").innerHTML = `
      <div class="ac-readouts">
        <div class="ac-readout"><div class="ac-readout__value">${num(st.current.total)}</div><div class="ac-readout__basis">${m ? `${esc(T.latest(month(summary.month)))}. ${esc(T.rank(m.rank, ranked))}` : esc(T.latestAll(month(summary.month)))}</div></div>
        <div class="ac-readout ac-readout--md"><div class="ac-readout__value">${num(st.year)}</div><div class="ac-readout__basis">${esc(T.year)}</div></div>
        <div class="ac-readout ac-readout--md"><div class="ac-readout__value">${st.yearBev ? pct(st.yearBev / st.year * 100) : "–"}</div><div class="ac-readout__basis">${esc(st.yearBev ? T.bev : T.bevNone)}</div></div>
      </div>`;
      seg(["ev", "fuel"], split, (k) => T.split[k], "split");
      legend(split === "fuel" ? FUELS.map((f) => [FCOL[f], T.fuels[f]]) : [["var(--car-2)", T.fuels.bev], ["var(--fuel)", T.rest, ".55"]], split === "fuel" && rows[0] && rows[0].month < "2021-01");
      $("model-chart").innerHTML = bars(rows, m ? T.chartModel(label(m)) : T.chartAll, split);
      return;
    }
    $("model-title").textContent = T.cmpTitle(ms.length);
    const head = `<tr><th>${esc(T.thModel)}</th><th class="num">${esc(month(summary.month, true))}</th><th class="num rk">${esc(T.thRank)}</th><th class="num">${esc(T.thYear)}</th><th class="num">${esc(T.thBev)}</th></tr>`;
    const body = ms.map((m, k) => {
      const st = stats(m, all[k]);
      return `<tr><td><i class="sw" style="background:${color(k)}"></i>${esc(label(m))}</td><td class="num">${num(st.current.total)}</td><td class="num rk">${m.rank || "–"}</td><td class="num">${num(st.year)}</td><td class="num">${st.year ? pct(st.yearBev / st.year * 100) : "–"}</td></tr>`;
    }).join("");
    $("model-out").innerHTML = `<div class="ac-table-wrap"><table class="ac-table cmp"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
    seg(LINE_FIELDS, field, (k) => T.fuels[k], "field");
    legend([], (field === "phev" || field === "hev") && all.some((r) => r[0] && r[0].month < "2021-01"));
    $("model-chart").innerHTML = lines(ms.map((m, k) => ({ m, rows: all[k] })), field, T.chartCmp(field));
  }

  // the toggle above the chart, and the colour key under it
  function seg(keys, on, name, kind) {
    $("modelseg").innerHTML = keys.map((k) => `<button type="button" data-${kind}="${k}" aria-pressed="${k === on}">${esc(name(k))}</button>`).join("");
  }
  function legend(items, note) {
    $("model-legend").innerHTML = items.map(([c, t, o]) => `<span><i style="border-color:${c};border-top-width:8px${o ? `;opacity:${o}` : ""}"></i>${esc(t)}</span>`).join("");
    $("model-legend").hidden = !items.length;
    $("model-note").textContent = note ? T.phevNote : "";
    $("model-note").hidden = !note;
  }

  // add a model (or say the list is full); picking one already there keeps it
  function add(slug) {
    if (picked.includes(slug)) return true;
    if (picked.length >= MAX) { $("pick-note").textContent = T.full(MAX); $("pick-note").hidden = false; return false; }
    $("pick-note").hidden = true;
    picked.push(slug);
    return true;
  }
  function remove(slug) { picked = picked.filter((x) => x !== slug); $("pick-note").hidden = true; }

  // the electric wave: readouts from the market, and the fastest-growing electric models
  function wave(market, s) {
    const W = window.EvWave;
    if (!W || !$("wave-out")) return;
    const w = W.summarize(market);
    if (!w) return;
    const card = (v, basis, md) => `<div class="ac-readout${md ? " ac-readout--md" : ""}"><div class="ac-readout__value">${v}</div><div class="ac-readout__basis">${esc(basis)}</div></div>`;
    let html = card(pct(w.share), T.wShare(month(w.month)) + (w.share_year_ago != null ? " · " + T.wAgo(pct(w.share_year_ago)) : ""));
    html += card(num(w.ytd.bev), T.wYtd(w.ytd.year, w.ytd.months) + (w.ytd.change_pct != null ? " · " + T.wYtdVs(w.ytd.change_pct) : ""), true);
    if (w.since_grant) html += card(pct(w.since_grant.share), T.wGrant + (w.since_grant.share_before != null ? " · " + T.wBefore(pct(w.since_grant.share_before)) : ""), true);
    $("wave-out").innerHTML = html;
    const picks = models.filter((m) => m.model !== "SONSTIGE" && (m.latest_bev || 0) >= 200).sort((a, b) => b.latest_bev - a.latest_bev).slice(0, 30);
    Promise.all(picks.map((m) => monthsOf(m).then((months) => ({ slug: m.slug, brand: m.brand, model: m.model, months })).catch(() => null)))
      .then((series) => {
        const g = W.growth(series.filter(Boolean), s.month, 3, 8);
        $("wave-grow").innerHTML = g.map((r) => `<li><a href="?model=${encodeURIComponent(r.slug)}" data-slug="${esc(r.slug)}">${esc(label(r))}</a> <b>${esc(T.wMore(num(r.extra)))}</b><span>${num(r.bev_prev)} → ${num(r.bev)}${r.is_new ? " · " + esc(T.wNew) : r.change_pct != null ? " · " + esc(T.change(r.change_pct)) : ""}</span></li>`).join("");
      });
  }

  const shiftYear = (m) => `${+m.slice(0, 4) - 1}${m.slice(4)}`;

  // "a,b" -> known slugs; each part may also be a name like "VW Golf"
  function parse(text) {
    if (!text) return [];
    const out = [];
    for (const part of String(text).split(",")) {
      const p = part.trim();
      const slug = models.some((m) => m.slug === p) ? p : find(models, p)?.slug;
      if (slug && !out.includes(slug)) out.push(slug);
    }
    return out.slice(0, MAX);
  }

  async function load() {
    const [idx, s, mk] = await Promise.all([
      fetch(AlloSite.data("registrations", "models.json")).then((r) => r.json()),
      fetch(AlloSite.data("registrations", "latest.json")).then((r) => r.json()),
      fetch(AlloSite.data("registrations", "market.csv")).then((r) => r.text()).then(parseCsv),
    ]);
    models = idx.models; summary = s; market = mk;
    $("asof").textContent = T.asof(month(s.month));
    $("market-line").textContent = T.marketLine(s);
    $("top-all").innerHTML = table(s.top_models, "total");
    $("top-ev").innerHTML = table(s.top_electric, "bev");
    $("share-chart").innerHTML = shareLine(mk);
    wave(mk, s);
    const qs = new URLSearchParams(location.search);
    const asked = parse(qs.get("model") || qs.get("models"));
    const remembered = (local(KEY) || "").split(",").filter((x) => models.some((m) => m.slug === x));
    // nothing picked shows all models
    picked = qs.has("model") || qs.has("models") ? asked : remembered.slice(0, MAX);
    if (qs.get("by") === "fuel") split = "fuel";
    if (LINE_FIELDS.includes(qs.get("fuel"))) field = qs.get("fuel");
    await show(false);
  }

  // Model picker: a combobox with our own list. A <datalist> shows suggestions as keyboard chips on
  // Android Chrome, and picking one there neither submits nor fires "change", so it looked broken.
  // Each pick adds a model; picking one already in the list takes it out again.
  const q = $("q"), list = $("q-list");
  q.dataset.placeholder = q.placeholder;
  const PAGE = 30;
  let shown = [], hits = [], active = -1, limit = PAGE;
  const pickable = () => models.filter((m) => m.model !== "SONSTIGE");
  // most registered in the last 12 months first, then models with only older data, newest first
  const order = (a, b) => (b.last_12_months || 0) - (a.last_12_months || 0) || String(b.last_month || "").localeCompare(String(a.last_month || "")) || label(a).localeCompare(label(b));
  function matches(text) {
    const words = String(text).toLowerCase().replace("volkswagen", "vw").split(/\s+/).map(norm).filter(Boolean);
    return pickable().filter((m) => { const h = norm(`${m.brand} ${m.model}`); return words.every((w) => h.includes(w)); }).sort(order);
  }
  const moreRow = () => hits.length > shown.length;
  function render() {
    const rest = hits.length - shown.length;
    list.innerHTML = shown.length ? shown.map((m, i) => {
      const on = picked.includes(m.slug);
      return `<li role="option" id="q-opt-${i}" data-i="${i}" aria-selected="${i === active}" class="${on ? "is-picked" : ""}"><span>${on ? '<b aria-hidden="true">✓ </b>' : ""}${esc(label(m))}</span><small>${m.last_12_months ? num(m.last_12_months) + " " + T.mo : T.older}</small></li>`;
    }).join("") + (rest > 0 ? `<li role="option" id="q-opt-${shown.length}" data-more="1" class="combo__more" aria-selected="${active === shown.length}">${esc(T.more(num(Math.min(rest, PAGE * 2))))}</li>` : "")
      : `<li class="combo__none" aria-disabled="true">${esc(T.noModel)}</li>`;
    if (active >= 0) { q.setAttribute("aria-activedescendant", `q-opt-${active}`); $(`q-opt-${active}`)?.scrollIntoView({ block: "nearest" }); }
    else q.removeAttribute("aria-activedescendant");
  }
  function open(text) {
    if (!models.length) return;
    hits = matches(text); limit = PAGE; shown = hits.slice(0, limit); active = -1;
    render(); list.hidden = false; q.setAttribute("aria-expanded", "true");
  }
  function more() { limit += PAGE * 2; shown = hits.slice(0, limit); render(); }
  function close() { list.hidden = true; q.setAttribute("aria-expanded", "false"); q.removeAttribute("aria-activedescendant"); active = -1; }
  function choose(m) {
    if (picked.includes(m.slug)) remove(m.slug); else add(m.slug);
    close(); q.value = ""; q.blur();
    show(true).catch(fail);
  }
  q.addEventListener("focus", () => { q.select(); open(q.value); });
  q.addEventListener("input", () => open(q.value));
  q.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (list.hidden) open(q.value);
      const n = shown.length + (moreRow() ? 1 : 0);
      if (!n) return;
      active = (active + (e.key === "ArrowDown" ? 1 : -1) + n) % n; render();
    } else if (e.key === "Escape") { close(); }
  });
  // pointerdown + preventDefault keeps the input focused, so the tap is not lost to a blur first.
  list.addEventListener("pointerdown", (e) => e.preventDefault());
  list.addEventListener("click", (e) => {
    if (e.target.closest("li[data-more]")) { more(); return; }
    const li = e.target.closest("li[data-i]"); if (li) choose(shown[+li.dataset.i]);
  });
  q.addEventListener("blur", () => setTimeout(close, 150));
  $("pick").addEventListener("submit", (e) => {
    e.preventDefault();
    if (active === shown.length && moreRow()) { more(); return; }
    const m = active >= 0 ? shown[active] : q.value.trim() ? find(models, q.value) || matches(q.value)[0] : null;
    if (m) choose(m); else open(q.value);
  });
  $("picked").addEventListener("click", (e) => {
    const b = e.target.closest("[data-remove]");
    if (!b) return;
    remove(b.dataset.remove);
    show(true).catch(fail);
  });
  $("modelseg").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.split) split = b.dataset.split;
    if (b.dataset.field) field = b.dataset.field;
    show(true).catch(fail);
  });
  // a model named in the tables below joins the picked models
  document.addEventListener("click", (e) => {
    const a = e.target.closest && e.target.closest("a[data-slug]");
    if (!a) return;
    e.preventDefault();
    if (!add(a.dataset.slug)) { $("pick").scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    show(true).then(() => $("pick").scrollIntoView({ behavior: "smooth", block: "start" })).catch(fail);
  });
  document.querySelectorAll("#topseg button").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("#topseg button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    $("tbl-all").hidden = b.dataset.view !== "all";
    $("tbl-ev").hidden = b.dataset.view !== "ev";
  }));
  const fail = (e) => { $("model-out").innerHTML = `<p class="ac-caption">${T.failed}${esc(e.message)}</p>`; };
  load().catch(fail);
})();
