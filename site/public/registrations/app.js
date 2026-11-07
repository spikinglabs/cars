/* New car registrations page: one model's monthly registrations, this month's top models and the
   electric share of the market, from /data/registrations/ (KBA FZ10).
   One script for the English (/registrations/), German (/de/registrations/) and Chinese (/zh/registrations/) page.
   The chosen model is ?model=<slug> in the link, else the one picked last on this device. */
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
  };
  const KEY = "allo-cars-registrations-model";
  const DEFAULT = "volvo-ex30";
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

  function bars(rows, title) {
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
      s += `<g><title>${esc(T.tipModel(r))}</title>`;
      if (t - e > 0) s += `<rect class="b-rest" x="${x}" y="${y(t)}" width="${w}" height="${y(e) - y(t)}"/>`;
      if (e > 0) s += `<rect class="b-ev" x="${x}" y="${y(e)}" width="${w}" height="${y(0) - y(e)}"/>`;
      s += "</g>";
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
    const last = pts[pts.length - 1];
    if (last) s += `<circle class="dot" cx="${x(pts.length - 1)}" cy="${y(last.bev_share)}" r="4"/><text x="${x(pts.length - 1) + 6}" y="${y(last.bev_share) + 4}" style="fill:var(--ink);font-weight:700">${pct(last.bev_share)}</text>`;
    return s + "</svg>";
  }

  function table(rows, field) {
    return rows.map((r, i) => `<tr><td class="num">${i + 1}</td><td><a href="?model=${encodeURIComponent(r.slug)}" data-slug="${esc(r.slug)}">${esc(label(r))}</a></td><td class="num">${num(r[field])}</td><td class="num">${esc(T.change(r.change_vs_last_year_pct))}</td></tr>`).join("");
  }

  let models = [], summary = null;

  async function show(slug, push) {
    const m = models.find((x) => x.slug === slug);
    if (!m) { $("model-out").innerHTML = `<p class="ac-notice"><span>${esc(T.noModel)}</span></p>`; return; }
    local(KEY, slug);
    $("q").value = label(m);
    if (push) { const u = new URL(location.href); u.searchParams.set("model", slug); history.replaceState(null, "", u); }
    const data = await fetch(AlloSite.data("registrations", m.file)).then((r) => r.json());
    const rows = data.months;
    const last = rows[rows.length - 1];
    const ranked = models.filter((x) => x.rank).length;
    const year = rows.filter((r) => r.month > shiftYear(summary.month)).reduce((a, r) => a + (r.total || 0), 0);
    const yearBev = rows.filter((r) => r.month > shiftYear(summary.month)).reduce((a, r) => a + (r.bev || 0), 0);
    const current = last.month === summary.month ? last : { month: summary.month, total: 0, bev: 0 };
    $("model-title").textContent = label(m);
    $("model-out").innerHTML = `
      <div class="ac-readouts">
        <div class="ac-readout"><div class="ac-readout__value">${num(current.total)}</div><div class="ac-readout__basis">${esc(T.latest(month(summary.month)))}. ${esc(T.rank(m.rank, ranked))}</div></div>
        <div class="ac-readout ac-readout--md"><div class="ac-readout__value">${num(year)}</div><div class="ac-readout__basis">${esc(T.year)}</div></div>
        <div class="ac-readout ac-readout--md"><div class="ac-readout__value">${yearBev ? pct(yearBev / year * 100) : "–"}</div><div class="ac-readout__basis">${esc(yearBev ? T.bev : T.bevNone)}</div></div>
      </div>`;
    $("model-chart").innerHTML = bars(rows, T.chartModel(label(m)));
  }

  const shiftYear = (m) => `${+m.slice(0, 4) - 1}${m.slice(4)}`;

  async function load() {
    const [idx, s, market] = await Promise.all([
      fetch(AlloSite.data("registrations", "models.json")).then((r) => r.json()),
      fetch(AlloSite.data("registrations", "latest.json")).then((r) => r.json()),
      fetch(AlloSite.data("registrations", "market.csv")).then((r) => r.text()).then(parseCsv),
    ]);
    models = idx.models; summary = s;
    $("asof").textContent = T.asof(month(s.month));
    $("market-line").textContent = T.marketLine(s);
    $("top-all").innerHTML = table(s.top_models, "total");
    $("top-ev").innerHTML = table(s.top_electric, "bev");
    $("share-chart").innerHTML = shareLine(market);
    const asked = new URLSearchParams(location.search).get("model");
    const start = [asked, local(KEY), DEFAULT].find((x) => x && models.some((m) => m.slug === x)) || (asked && find(models, asked)?.slug) || s.top_models[0].slug;
    await show(start, false);
  }

  // Model picker: a combobox with our own list. A <datalist> shows suggestions as keyboard chips on
  // Android Chrome, and picking one there neither submits nor fires "change", so it looked broken.
  const q = $("q"), list = $("q-list");
  let shown = [], active = -1;
  const pickable = () => models.filter((m) => m.model !== "SONSTIGE");
  function matches(text) {
    const words = String(text).toLowerCase().replace("volkswagen", "vw").split(/\s+/).map(norm).filter(Boolean);
    const all = pickable();
    if (!words.length) return all.filter((m) => m.rank).sort((a, b) => a.rank - b.rank).slice(0, 30);
    return all.filter((m) => { const h = norm(`${m.brand} ${m.model}`); return words.every((w) => h.includes(w)); })
      .sort((a, b) => (b.last_12_months || 0) - (a.last_12_months || 0)).slice(0, 30);
  }
  function render() {
    list.innerHTML = shown.length ? shown.map((m, i) => `<li role="option" id="q-opt-${i}" data-i="${i}" aria-selected="${i === active}">${esc(label(m))}<small>${m.last_12_months ? num(m.last_12_months) + " / 12 " + (de ? "Mon." : zh ? "个月" : "mo") : (de ? "ältere Daten" : zh ? "较早数据" : "older data")}</small></li>`).join("")
      : `<li class="combo__none" aria-disabled="true">${esc(T.noModel)}</li>`;
    if (active >= 0) { q.setAttribute("aria-activedescendant", `q-opt-${active}`); $(`q-opt-${active}`)?.scrollIntoView({ block: "nearest" }); }
    else q.removeAttribute("aria-activedescendant");
  }
  function open(text) {
    if (!models.length) return;
    shown = matches(text); active = -1;
    render(); list.hidden = false; q.setAttribute("aria-expanded", "true");
  }
  function close() { list.hidden = true; q.setAttribute("aria-expanded", "false"); q.removeAttribute("aria-activedescendant"); active = -1; }
  function choose(m) { close(); q.blur(); show(m.slug, true).catch(fail); }
  q.addEventListener("focus", () => { q.select(); open(""); });
  q.addEventListener("input", () => open(q.value));
  q.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (list.hidden) open(q.value);
      if (!shown.length) return;
      active = (active + (e.key === "ArrowDown" ? 1 : -1) + shown.length) % shown.length; render();
    } else if (e.key === "Escape") { close(); }
  });
  // pointerdown + preventDefault keeps the input focused, so the tap is not lost to a blur first.
  list.addEventListener("pointerdown", (e) => e.preventDefault());
  list.addEventListener("click", (e) => { const li = e.target.closest("li[data-i]"); if (li) choose(shown[+li.dataset.i]); });
  q.addEventListener("blur", () => setTimeout(close, 150));
  $("pick").addEventListener("submit", (e) => {
    e.preventDefault();
    const m = active >= 0 ? shown[active] : find(models, q.value) || matches(q.value)[0];
    if (m) choose(m); else open(q.value);
  });
  document.addEventListener("click", (e) => {
    const a = e.target.closest && e.target.closest("a[data-slug]");
    if (!a) return;
    e.preventDefault();
    show(a.dataset.slug, true).then(() => $("pick").scrollIntoView({ behavior: "smooth", block: "start" })).catch(fail);
  });
  document.querySelectorAll("#topseg button").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("#topseg button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    $("tbl-all").hidden = b.dataset.view !== "all";
    $("tbl-ev").hidden = b.dataset.view !== "ev";
  }));
  const fail = (e) => { $("model-out").innerHTML = `<p class="ac-caption">${T.failed}${esc(e.message)}</p>`; };
  load().catch(fail);
})();
