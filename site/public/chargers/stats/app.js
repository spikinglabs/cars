/* Charging stations in numbers: statistics of the public charge points in Germany, from
   /data/chargers/<region>/stats.json (built by pipelines/chargers/stats.py).
   One script for the English (/chargers/stats/), German (/de/chargers/stats/) and Chinese (/zh/chargers/stats/) page.

   Link parameters (all optional):
     rank   towns | districts | states   which ranking table to show (default towns)
     by     per100k | points | fast | bev | kw   what to rank by (default per100k)
     q      text filter on the ranking, e.g. q=köln
     areas  places whose numbers the page shows instead of all of Germany, comma separated regional keys:
            state = 2 digits (09 Bayern), district = 5 digits (05315 Köln), town = 12 digits (053150000000 Köln)
   Example: /chargers/stats/?rank=districts&by=bev&q=münchen
   Example: /chargers/stats/?areas=053150000000,053140000000 (Köln and Bonn together)

   Per-place power classes, plugs, years and operators come from areas.json, loaded when a place is picked. */
(() => {
  "use strict";
  const lang = (document.documentElement.lang || "en").slice(0, 2);
  const de = lang === "de", zh = lang === "zh";
  const T = zh ? {
    locale: "zh-CN", failed: "无法加载数据：", notYet: "统计数据正在第一次生成，请稍后再来。",
    asof: (d) => `充电桩数据截至 ${d}。`,
    points: "个公共充电点", pointsSub: (n) => `分布在 ${n} 个设备上`,
    fast: "个快充点（50 kW 及以上）", ultra: (n) => `其中 ${n} 个达到 150 kW 及以上`,
    per100k: "每 10 万居民的充电点", per100kSub: (n) => `其中快充 ${n} 个`,
    bevPer: "辆纯电动车对应一个充电点", bevPerSub: (n) => `德国共有 ${n} 辆纯电动车`,
    kwPer: "kW 公共充电功率 / 每辆电动车", kwPerSub: (t) => `欧盟 AFIR 要求全国至少 ${t} kW`,
    added: "新增充电点", addedFast: "其中快充（50 kW+）", total: (n) => `累计 ${n}`,
    yearsNote: "按设备投入使用的年份统计，只包含仍在登记册中的充电点（已拆除的不在其中）。当年数据不完整。",
    classes: { up_to_11: "最高 11 kW", "12_22": "12–22 kW", "23_49": "23–49 kW", "50_149": "50–149 kW", "150_299": "150–299 kW", "300_plus": "300 kW 及以上" },
    plugs: { type2_socket: "Type 2 插座（自带线）", type2_cable: "Type 2 固定线缆", ccs: "CCS（直流）", chademo: "CHAdeMO（直流）", schuko: "家用插座 Schuko", mcs: "MCS（卡车兆瓦级）", type1: "Type 1" },
    share: (p) => `${p} %`,
    by: { per100k: "每 10 万居民", points: "充电点数量", fast: "每 10 万居民快充", bev: "每个充电点的电动车", kw: "每辆电动车的 kW" },
    col: { name: "地区", state: "联邦州", points: "充电点", per100k: "每 10 万人", fast: "快充", fast100k: "快充/10 万人", bev: "电动车/充电点", kw: "kW/电动车", pop: "居民" },
    rank: { towns: "城市", districts: "县市", states: "联邦州" },
    rankDesc: {
      towns: (n) => `居民不少于 ${n} 人的城市和镇。不含周边县的乡镇。`,
      districts: () => "全部 400 个县（Landkreis）和县级市（kreisfreie Stadt）。",
      states: () => "16 个联邦州。",
    },
    bevNote: "电动车 = 纯电动乘用车（KBA 车辆保有量，1 月 1 日）。只有县级市和县才有电动车数据。",
    filter: "筛选", filterPh: "例如 Köln", showAll: (n) => `显示全部 ${n} 个`, showLess: "收起", noMatch: "没有匹配的地区。",
    ops: (n) => `${n} 个快充`, people: (n) => `${n} 居民`,
    pkTitle: "选择城市或地区", pkDesc: "选择一个或多个城市、县或联邦州，下方所有数字都会只统计它们（合计）。不选则显示全德国。",
    pkPh: "输入城市、县或州名", pkNone: "没有找到这个地方。只列出 5 万居民以上的城市；更小的地方请选择所在的县。",
    kind: { town: "城市", district: "县", state: "联邦州" }, remove: (n) => `移除 ${n}`, clear: "清除全部",
    scopeAll: "全德国", together: "合计", germany: "德国", add: (n) => `把 ${n} 加入选择`,
    loadingAreas: "正在加载地区数据 …",
    askAreas: (names, url, data) => `请根据 ${url} 和数据 ${data}（地区 id 见 URL 中的 areas），比较 ${names} 的公共充电桩：数量、相对居民和电动车、快充、功率和插头类型、主要运营商。`, city: "县级市",
    ask: (url, data) => `请根据 ${url} 和数据 ${data}，告诉我德国公共充电桩的情况：哪些城市和县的充电点最多、相对居民和电动车数量最多或最少，以及快充的分布。`,
  } : de ? {
    locale: "de-DE", failed: "Die Daten konnten nicht geladen werden: ", notYet: "Die Statistik wird gerade zum ersten Mal berechnet. Bitte später nochmal vorbeischauen.",
    asof: (d) => `Ladesäulen Stand ${d}.`,
    points: "öffentliche Ladepunkte", pointsSub: (n) => `an ${n} Ladeeinrichtungen`,
    fast: "Schnellladepunkte (ab 50 kW)", ultra: (n) => `davon ${n} mit 150 kW oder mehr`,
    per100k: "Ladepunkte je 100.000 Einwohner", per100kSub: (n) => `davon ${n} Schnelllader`,
    bevPer: "E-Autos je Ladepunkt", bevPerSub: (n) => `${n} reine E-Autos in Deutschland`,
    kwPer: "kW öffentliche Ladeleistung je E-Auto", kwPerSub: (t) => `die EU-Vorgabe (AFIR) verlangt landesweit ${t} kW`,
    added: "Neue Ladepunkte", addedFast: "davon Schnelllader (50 kW+)", total: (n) => `insgesamt ${n}`,
    yearsNote: "Nach dem Jahr, in dem die Ladeeinrichtung in Betrieb ging. Nur Ladepunkte, die noch im Register stehen (abgebaute fehlen). Das laufende Jahr ist unvollständig.",
    classes: { up_to_11: "bis 11 kW", "12_22": "12–22 kW", "23_49": "23–49 kW", "50_149": "50–149 kW", "150_299": "150–299 kW", "300_plus": "300 kW und mehr" },
    plugs: { type2_socket: "Typ 2 Steckdose (eigenes Kabel)", type2_cable: "Typ 2 mit festem Kabel", ccs: "CCS (DC)", chademo: "CHAdeMO (DC)", schuko: "Schuko", mcs: "MCS (Megawatt, Lkw)", type1: "Typ 1" },
    share: (p) => `${p} %`,
    by: { per100k: "Je 100.000 Einwohner", points: "Anzahl", fast: "Schnelllader je 100.000", bev: "E-Autos je Ladepunkt", kw: "kW je E-Auto" },
    col: { name: "Gebiet", state: "Land", points: "Ladepunkte", per100k: "je 100.000", fast: "Schnell", fast100k: "Schnell je 100.000", bev: "E-Autos je LP", kw: "kW je E-Auto", pop: "Einwohner" },
    rank: { towns: "Städte", districts: "Kreise", states: "Bundesländer" },
    rankDesc: {
      towns: (n) => `Städte und Gemeinden ab ${n} Einwohnern, ohne die übrigen Orte ihres Kreises.`,
      districts: () => "Alle 400 Landkreise und kreisfreien Städte.",
      states: () => "Die 16 Bundesländer.",
    },
    bevNote: "E-Autos = reine Elektro-Pkw (KBA-Bestand am 1. Januar). E-Autos gibt es nur je Kreis, daher bei Städten nur für kreisfreie Städte.",
    filter: "Filtern", filterPh: "z. B. Köln", showAll: (n) => `Alle ${n} zeigen`, showLess: "Weniger zeigen", noMatch: "Kein passendes Gebiet.",
    ops: (n) => `${n} Schnelllader`, people: (n) => `${n} Einwohner`,
    pkTitle: "Städte oder Gebiete wählen", pkDesc: "Wähle eine oder mehrere Städte, Kreise oder Bundesländer: Alle Zahlen unten gelten dann nur für sie, zusammengerechnet. Leer lassen für ganz Deutschland.",
    pkPh: "Stadt, Kreis oder Land eingeben", pkNone: "Nicht gefunden. Städte gibt es ab 50.000 Einwohnern; für kleinere Orte den Kreis wählen.",
    kind: { town: "Stadt", district: "Kreis", state: "Land" }, remove: (n) => `${n} entfernen`, clear: "Alle entfernen",
    scopeAll: "Ganz Deutschland", together: "Zusammen", germany: "Deutschland", add: (n) => `${n} zur Auswahl hinzufügen`,
    loadingAreas: "Gebiete werden geladen …",
    askAreas: (names, url, data) => `Bitte nutze ${url} und die Daten ${data} (die Gebiets-IDs stehen im URL-Parameter areas) und vergleiche die öffentlichen Ladesäulen in ${names}: Anzahl, je Einwohner und je E-Auto, Schnelllader, Leistung und Stecker, wichtigste Betreiber.`, city: "kreisfrei",
    ask: (url, data) => `Bitte nutze ${url} und die Daten ${data} und erzähl mir, wie es um öffentliche Ladesäulen in Deutschland steht: welche Städte und Kreise die meisten Ladepunkte haben, je Einwohner und je E-Auto am besten und am schlechtesten versorgt sind, und wo die Schnelllader stehen.`,
  } : {
    locale: "en-GB", failed: "Could not load data: ", notYet: "The statistics are being built for the first time. Please check back later.",
    asof: (d) => `Chargers as of ${d}.`,
    points: "public charge points", pointsSub: (n) => `on ${n} charging devices`,
    fast: "fast charge points (50 kW+)", ultra: (n) => `${n} of them 150 kW or more`,
    per100k: "charge points per 100,000 people", per100kSub: (n) => `${n} of them fast`,
    bevPer: "electric cars per charge point", bevPerSub: (n) => `${n} battery electric cars in Germany`,
    kwPer: "kW of public charging per electric car", kwPerSub: (t) => `the EU rule (AFIR) asks for ${t} kW nationally`,
    added: "New charge points", addedFast: "of them fast (50 kW+)", total: (n) => `${n} in total`,
    yearsNote: "By the year the charging device went into service. Only charge points still in the register (removed ones are gone). The current year is not over yet.",
    classes: { up_to_11: "up to 11 kW", "12_22": "12–22 kW", "23_49": "23–49 kW", "50_149": "50–149 kW", "150_299": "150–299 kW", "300_plus": "300 kW and more" },
    plugs: { type2_socket: "Type 2 socket (bring a cable)", type2_cable: "Type 2 with fixed cable", ccs: "CCS (DC)", chademo: "CHAdeMO (DC)", schuko: "Household socket (Schuko)", mcs: "MCS (megawatt, trucks)", type1: "Type 1" },
    share: (p) => `${p}%`,
    by: { per100k: "Per 100,000 people", points: "Number", fast: "Fast per 100,000", bev: "EVs per charge point", kw: "kW per EV" },
    col: { name: "Area", state: "State", points: "Charge points", per100k: "per 100k", fast: "Fast", fast100k: "Fast per 100k", bev: "EVs per point", kw: "kW per EV", pop: "People" },
    rank: { towns: "Cities", districts: "Districts", states: "States" },
    rankDesc: {
      towns: (n) => `Towns and cities with at least ${n} people, without the other places of their district.`,
      districts: () => "All 400 districts (Landkreise and kreisfreie Städte).",
      states: () => "The 16 federal states.",
    },
    bevNote: "EVs = battery electric cars (KBA stock on 1 January). Car figures exist per district only, so among cities only for cities that are their own district.",
    filter: "Filter", filterPh: "e.g. Köln", showAll: (n) => `Show all ${n}`, showLess: "Show fewer", noMatch: "No matching area.",
    ops: (n) => `${n} fast`, people: (n) => `${n} people`,
    pkTitle: "Pick cities or areas", pkDesc: "Choose one or more cities, districts or states, and every number below covers just them, added together. Leave it empty for all of Germany.",
    pkPh: "Type a city, district or state", pkNone: "Not found. Cities are listed from 50,000 people; for a smaller place pick its district.",
    kind: { town: "City", district: "District", state: "State" }, remove: (n) => `Remove ${n}`, clear: "Clear all",
    scopeAll: "All of Germany", together: "Together", germany: "Germany", add: (n) => `Add ${n} to your choice`,
    loadingAreas: "Loading areas …",
    askAreas: (names, url, data) => `Please use ${url} and the data ${data} (area ids are in the areas URL parameter) to compare public EV charging in ${names}: number of charge points, per resident and per electric car, fast chargers, power and plugs, and the main operators.`, city: "city district",
    ask: (url, data) => `Please use ${url} and the data ${data} to tell me about public EV charging in Germany: which cities and districts have the most charge points, which are best and worst served per resident and per electric car, and where the fast chargers are.`,
  };

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const num = (n, d = 0) => n == null ? "–" : Number(n).toLocaleString(T.locale, { minimumFractionDigits: d, maximumFractionDigits: d });
  const data = (file) => (window.AlloSite ? AlloSite.data("chargers", file) : "/data/chargers/de/" + file);
  const SVGNS = 'xmlns="http://www.w3.org/2000/svg"';
  const TOP = 20;

  const params = new URLSearchParams(location.search);
  const state = {
    rank: ["towns", "districts", "states"].includes(params.get("rank")) ? params.get("rank") : "towns",
    by: ["per100k", "points", "fast", "bev", "kw"].includes(params.get("by")) ? params.get("by") : "per100k",
    q: params.get("q") || "",
    all: false,
    areas: (params.get("areas") || "").split(",").map((x) => x.trim()).filter((x) => /^\d{2}(\d{3}(\d{7})?)?$/.test(x)),
  };
  let S = null, A = null, V = null, areasLoading = null;

  async function getJson(url) {
    const r = await fetch(url);
    if (!r.ok) { const e = new Error(r.status + " " + r.statusText); e.status = r.status; throw e; }
    return r.json();
  }

  function bars(el, rows) {
    const max = Math.max(...rows.map((r) => r.v), 1);
    el.innerHTML = `<ul class="bars">${rows.map((r) => `<li><span class="bars__label">${esc(r.label)}</span>`
      + `<span class="bars__track"><span class="bars__fill${r.cls ? " " + r.cls : ""}" style="width:${(r.v / max * 100).toFixed(1)}%"></span></span>`
      + `<span class="bars__value">${esc(r.text)}</span></li>`).join("")}</ul>`;
  }

  function readouts() {
    const t = V.totals;
    const box = (v, label, sub) => `<div class="ac-readout"><div class="ac-readout__value">${v}</div><div class="ac-readout__basis">${label}<br><span class="sub">${sub}</span></div></div>`;
    $("readouts").innerHTML = [
      box(num(t.points), T.points, T.pointsSub(num(t.devices))),
      box(num(t.fast_points), T.fast, T.ultra(num(t.ultra_points))),
      box(num(t.points_per_100k), T.per100k, T.per100kSub(num(t.fast_per_100k))),
      box(num(t.bev_per_point, 1), T.bevPer, T.bevPerSub(num(t.bev))),
      box(num(t.kw_per_bev, 1), T.kwPer, T.kwPerSub(num(S.afir_kw_per_bev, 1))),
    ].join("");
  }

  function years() {
    const ys = V.by_year.filter((y) => y.year >= 2010);
    const W = 760, H = 280, L = 52, B = 26, max = Math.max(1, ...ys.map((y) => y.points_added));
    const step = Math.max(1, Math.pow(10, Math.floor(Math.log10(max))) / 2);
    const top = Math.ceil(max / step) * step;
    const bw = (W - L) / ys.length, sy = (v) => H - B - (v / top) * (H - B - 10);
    let svg = "";
    for (let v = 0; v <= top; v += top / 4) {
      svg += `<line x1="${L}" x2="${W}" y1="${sy(v)}" y2="${sy(v)}" stroke="var(--chart-grid)"/><text x="${L - 6}" y="${sy(v) + 4}" text-anchor="end">${num(v)}</text>`;
    }
    const last = new Date().getFullYear();
    ys.forEach((y, i) => {
      const x = L + i * bw + bw * 0.15, w = bw * 0.7;
      svg += `<rect x="${x}" y="${sy(y.points_added)}" width="${w}" height="${sy(0) - sy(y.points_added)}" fill="var(--ref-line-hi)"><title>${y.year}: ${num(y.points_added)} · ${T.total(num(y.points_total))}</title></rect>`;
      svg += `<rect x="${x}" y="${sy(y.fast_points_added)}" width="${w}" height="${sy(0) - sy(y.fast_points_added)}" fill="var(--car-2)"><title>${y.year}: ${num(y.fast_points_added)} ${esc(T.addedFast)}</title></rect>`;
      if (i % (ys.length > 12 ? 2 : 1) === (ys.length - 1) % (ys.length > 12 ? 2 : 1)) {
        svg += `<text x="${x + w / 2}" y="${H - 6}" text-anchor="middle">${y.year}${y.year >= last ? "*" : ""}</text>`;
      }
    });
    $("years").innerHTML = `<div class="ac-chart"><svg ${SVGNS} viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(T.added)}">${svg}</svg></div>`
      + `<p class="legend"><span><i style="background:var(--ref-line-hi)"></i>${esc(T.added)}</span><span><i style="background:var(--car-2)"></i>${esc(T.addedFast)}</span></p>`
      + `<p class="ac-caption">* ${esc(T.yearsNote)}</p>`;
  }

  function power() {
    const total = V.power_classes.reduce((s, c) => s + c.points, 0) || 1;
    bars($("power"), V.power_classes.map((c) => ({
      label: T.classes[c.class], v: c.points, cls: c.min_kw >= 50 ? "is-fast" : "",
      text: `${num(c.points)} · ${T.share(num(c.points / total * 100))}`,
    })));
  }

  function plugs() {
    const total = V.totals.points || 1;
    bars($("plugs"), V.connectors.filter((c) => c.points > 0).sort((a, b) => b.points - a.points).map((c) => ({
      label: T.plugs[c.connector] || c.connector, v: c.points, cls: ["ccs", "chademo", "mcs"].includes(c.connector) ? "is-fast" : "",
      text: `${num(c.points)} · ${T.share(num(c.points / total * 100, c.points / total < 0.01 ? 1 : 0))}`,
    })));
  }

  function operators() {
    bars($("ops"), V.top_operators.slice(0, 15).map((o) => ({ label: o.operator, v: o.points, text: `${num(o.points)} · ${T.ops(num(o.fast_points))}` })));
  }

  /* ---------- ranking ---------- */
  const METRIC = {
    per100k: (r) => r.points_per_100k, points: (r) => r.points, fast: (r) => r.fast_per_100k,
    bev: (r) => r.bev_per_point, kw: (r) => r.kw_per_bev,
  };
  // fewer electric cars per charge point is better, so that ranking runs lowest first
  const ASC = { bev: true };

  function rows() {
    const list = state.rank === "towns" ? S.towns : state.rank === "districts" ? S.districts : S.states;
    const f = METRIC[state.by];
    return list.filter((r) => f(r) != null).map((r) => ({ ...r, label: r.name || r.state, id: r.ars }))
      .sort((a, b) => ASC[state.by] ? f(a) - f(b) : f(b) - f(a));
  }

  function ranking() {
    for (const b of document.querySelectorAll("#rank button")) b.setAttribute("aria-pressed", String(b.dataset.rank === state.rank));
    for (const b of document.querySelectorAll("#by button")) b.setAttribute("aria-pressed", String(b.dataset.by === state.by));
    $("rankdesc").textContent = T.rankDesc[state.rank](num(S.reference.town_min_population));
    const all = rows();
    const ranked = all.map((r, i) => ({ ...r, pos: i + 1 }));
    const q = state.q.trim().toLowerCase();
    let shown = q ? ranked.filter((r) => (r.label + " " + (r.district || "") + " " + (r.state || "")).toLowerCase().includes(q)) : ranked;
    const more = !q && shown.length > TOP;
    if (more && !state.all) shown = shown.slice(0, TOP);
    const c = T.col, area = state.rank !== "states";
    const head = `<tr><th class="num">#</th><th>${c.name}</th>${area ? `<th>${c.state}</th>` : ""}<th class="num">${c.points}</th>`
      + `<th class="num">${c.per100k}</th><th class="num">${c.fast100k}</th><th class="num">${c.bev}</th><th class="num">${c.kw}</th></tr>`;
    const metricCol = { per100k: 4, points: 3, fast: 5, bev: 6, kw: 7 }[state.by] - (area ? 0 : 1);
    const body = shown.map((r) => {
      const tags = r.city || r.city_district ? ` <span class="ac-tag">${esc(T.city)}</span>` : "";
      const where = state.rank === "towns" && r.district && !r.city_district ? r.district + " · " : "";
      const sub = r.population ? `<span class="sub">${esc(where + T.people(num(r.population)))}</span>` : "";
      const mine = state.areas.includes(r.id);
      const name = r.id && !mine ? `<button type="button" class="addarea" data-add="${esc(r.id)}" title="${esc(T.add(r.label))}">${esc(r.label)}</button>` : esc(r.label);
      return `<tr${mine ? ' class="is-mine"' : ""}><td class="num">${r.pos}</td><td class="name">${name}${state.rank === "districts" ? tags : ""}${sub}</td>${area ? `<td>${esc(r.state)}</td>` : ""}`
        + `<td class="num">${num(r.points)}</td><td class="num">${num(r.points_per_100k)}</td><td class="num">${num(r.fast_per_100k)}</td>`
        + `<td class="num">${num(r.bev_per_point, 1)}</td><td class="num">${num(r.kw_per_bev, 1)}</td></tr>`;
    }).join("");
    $("table").innerHTML = shown.length
      ? `<table class="ac-table rank" data-hl="${metricCol + 1}"><thead>${head}</thead><tbody>${body}</tbody></table>`
      : `<p class="ac-caption">${esc(T.noMatch)}</p>`;
    $("more").hidden = !more;
    $("more").textContent = state.all ? T.showLess : T.showAll(num(ranked.length));
    syncUrl();
  }

  function syncUrl() {
    const p = new URLSearchParams();
    if (state.rank !== "towns") p.set("rank", state.rank);
    if (state.by !== "per100k") p.set("by", state.by);
    if (state.q) p.set("q", state.q);
    if (state.areas.length) p.set("areas", state.areas.join(","));
    const qs = p.toString().replace(/%2C/g, ",");
    history.replaceState(null, "", location.pathname + (qs ? "?" + qs : ""));
    const url = location.origin + location.pathname + (qs ? "?" + qs : "");
    const names = A ? state.areas.map((id) => A[id] && A[id].name).filter(Boolean) : [];
    $("aigo").href = "https://claude.ai/new?q=" + encodeURIComponent(names.length
      ? T.askAreas(names.join(", "), url, location.origin + data("areas.json"))
      : T.ask(url, location.origin + data("stats.json")));
  }

  /* ---------- picked places ---------- */
  function wholeView() {
    return { totals: S.totals, power_classes: S.power_classes, connectors: S.connectors, by_year: S.by_year, top_operators: S.top_operators };
  }

  // Add up the picked places. A place inside another picked place (a town in a picked district) is counted once.
  function combine(ids) {
    let list = ids.map((id) => A[id]).filter(Boolean);
    list = list.filter((a) => !list.some((b) => b !== a && a.id.startsWith(b.id)));
    const sum = (f) => list.reduce((s, a) => s + (f(a) || 0), 0);
    const t = {};
    for (const k of ["points", "fast_points", "ultra_points", "dc_points", "devices", "power_kw", "population"]) t[k] = sum((a) => a[k]);
    t.bev = list.length && list.every((a) => a.bev != null) ? sum((a) => a.bev) : null;
    ratios(t);
    const years = {};
    for (const a of list) for (const [y, v] of Object.entries(a.years)) { years[y] = years[y] || [0, 0]; years[y][0] += v[0]; years[y][1] += v[1]; }
    let cum = 0;
    const by_year = Object.keys(years).sort().map((y) => ({ year: +y, points_added: years[y][0], fast_points_added: years[y][1], points_total: (cum += years[y][0]) }));
    const ops = new Map();
    for (const a of list) for (const [o, n, f] of a.operators) { const x = ops.get(o) || [0, 0]; x[0] += n; x[1] += f; ops.set(o, x); }
    return {
      totals: t, by_year,
      power_classes: S.power_classes.map((c, i) => ({ ...c, points: sum((a) => a.classes[i]) })),
      connectors: S.connectors.map((c, i) => ({ ...c, points: sum((a) => a.plugs[i]) })),
      top_operators: [...ops].map(([operator, [points, fast_points]]) => ({ operator, points, fast_points })).sort((a, b) => b.points - a.points),
    };
  }
  function ratios(t) {
    t.points_per_100k = t.population ? t.points / t.population * 1e5 : null;
    t.fast_per_100k = t.population ? t.fast_points / t.population * 1e5 : null;
    t.bev_per_point = t.bev && t.points ? t.bev / t.points : null;
    t.kw_per_bev = t.bev ? t.power_kw / t.bev : null;
    return t;
  }

  function loadAreas() {
    if (!areasLoading) {
      areasLoading = getJson(data("areas.json")).then((a) => {
        A = {};
        for (const x of a.areas) A[x.id] = { ...x, key: fold(x.name) };
        state.areas = state.areas.filter((id) => A[id]);
        return A;
      }).catch((e) => { areasLoading = null; throw e; });
    }
    return areasLoading;
  }
  const fold = (s) => String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ß/g, "ss");

  function refresh() {
    V = state.areas.length && A ? combine(state.areas) : wholeView();
    const names = A ? state.areas.map((id) => A[id].name) : [];
    const scope = names.length ? names.join(" + ") : T.scopeAll;
    for (const el of document.querySelectorAll("[data-scope]")) el.textContent = scope;
    chips(); compare();
    readouts(); years(); power(); plugs(); operators();
    if (S) ranking(); else syncUrl();
  }

  function chips() {
    const el = $("pk-chips");
    if (!A || !state.areas.length) { el.innerHTML = ""; return; }
    el.innerHTML = state.areas.map((id) => `<button type="button" class="ac-chip pk-chip" aria-pressed="true" data-remove="${esc(id)}" aria-label="${esc(T.remove(A[id].name))}">${esc(A[id].name)} <span aria-hidden="true">×</span></button>`).join("")
      + (state.areas.length > 1 ? `<button type="button" class="ac-btn ac-btn--quiet pk-clear" data-clear>${esc(T.clear)}</button>` : "");
  }

  function compare() {
    const el = $("pk-compare");
    if (!A || !state.areas.length) { el.innerHTML = ""; return; }
    const c = T.col;
    const row = (label, t, cls) => `<tr${cls ? ` class="${cls}"` : ""}><td class="name">${esc(label)}</td><td class="num">${num(t.points)}</td><td class="num">${num(t.points_per_100k)}</td>`
      + `<td class="num">${num(t.fast_per_100k)}</td><td class="num">${num(t.bev_per_point, 1)}</td><td class="num">${num(t.kw_per_bev, 1)}</td></tr>`;
    const rows = state.areas.map((id) => { const a = A[id]; return row(`${a.name} · ${T.kind[a.kind]}`, ratios({ ...a })); });
    if (state.areas.length > 1) rows.push(row(T.together, V.totals, "pk-sum"));
    rows.push(row(T.germany, S.totals, "pk-ref"));
    el.innerHTML = `<div class="ac-table-wrap"><table class="ac-table pk-table"><thead><tr><th>${c.name}</th><th class="num">${c.points}</th><th class="num">${c.per100k}</th>`
      + `<th class="num">${c.fast100k}</th><th class="num">${c.bev}</th><th class="num">${c.kw}</th></tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
  }

  function suggest() {
    const q = fold($("pk-q").value.trim()), box = $("pk-sugg");
    if (!q || !A) { box.hidden = true; $("pk-q").setAttribute("aria-expanded", "false"); return; }
    const order = { town: 0, district: 1, state: 2 };
    const hits = Object.values(A).filter((a) => a.key.includes(q) && !state.areas.includes(a.id))
      .sort((a, b) => (b.key.startsWith(q) - a.key.startsWith(q)) || (order[a.kind] - order[b.kind]) || (b.population - a.population))
      .slice(0, 8);
    box.innerHTML = hits.length
      ? hits.map((a, i) => `<li role="option" id="pk-o${i}" data-id="${esc(a.id)}"${i === 0 ? ' aria-selected="true"' : ""}><b>${esc(a.name)}</b> <span>${esc(T.kind[a.kind])}${a.kind !== "state" ? " · " + esc(a.state) : ""}</span></li>`).join("")
      : `<li class="none">${esc(T.pkNone)}</li>`;
    box.hidden = false;
    $("pk-q").setAttribute("aria-expanded", "true");
  }
  function pick(id) {
    if (id && !state.areas.includes(id)) state.areas.push(id);
    $("pk-q").value = "";
    $("pk-sugg").hidden = true;
    refresh();
  }

  function picker() {
    $("pk-title").textContent = T.pkTitle;
    $("pk-desc").textContent = T.pkDesc;
    $("pk-q").placeholder = T.pkPh;
    $("pk-q").addEventListener("focus", () => loadAreas().then(suggest).catch(() => {}));
    $("pk-q").addEventListener("input", () => { if (A) suggest(); else loadAreas().then(suggest).catch(() => {}); });
    $("pk-q").addEventListener("keydown", (e) => {
      const opts = [...$("pk-sugg").querySelectorAll("li[data-id]")];
      const cur = opts.findIndex((o) => o.getAttribute("aria-selected") === "true");
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (!opts.length) return;
        const next = (cur + (e.key === "ArrowDown" ? 1 : -1) + opts.length) % opts.length;
        opts.forEach((o, i) => o.setAttribute("aria-selected", String(i === next)));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (cur >= 0) pick(opts[cur].dataset.id);
      } else if (e.key === "Escape") { $("pk-sugg").hidden = true; }
    });
    $("pk-sugg").addEventListener("mousedown", (e) => { const li = e.target.closest("li[data-id]"); if (li) { e.preventDefault(); pick(li.dataset.id); } });
    $("pk-q").addEventListener("blur", () => setTimeout(() => { $("pk-sugg").hidden = true; }, 150));
    $("pk-chips").addEventListener("click", (e) => {
      const b = e.target.closest("[data-remove]");
      if (b) { state.areas = state.areas.filter((x) => x !== b.dataset.remove); refresh(); }
      if (e.target.closest("[data-clear]")) { state.areas = []; refresh(); }
    });
    $("table").addEventListener("click", (e) => {
      const b = e.target.closest("[data-add]");
      if (b) loadAreas().then(() => { pick(b.dataset.add); $("picker").scrollIntoView({ behavior: "smooth", block: "start" }); });
    });
  }

  function controls() {
    $("by").innerHTML = Object.entries(T.by).map(([k, l]) => `<button type="button" data-by="${k}">${esc(l)}</button>`).join("");
    $("rank").innerHTML = Object.entries(T.rank).map(([k, l]) => `<button type="button" data-rank="${k}">${esc(l)}</button>`).join("");
    $("rank").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { state.rank = b.dataset.rank; state.all = false; ranking(); } });
    $("by").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { state.by = b.dataset.by; ranking(); } });
    $("q").placeholder = T.filterPh;
    $("q").value = state.q;
    $("q").addEventListener("input", () => { state.q = $("q").value; ranking(); });
    $("more").addEventListener("click", () => { state.all = !state.all; ranking(); });
    $("bevnote").textContent = T.bevNote;
  }

  controls();
  picker();
  syncUrl();
  getJson(data("stats.json")).then((s) => {
    S = s;
    const when = new Date(s.observed_at + "T12:00:00Z").toLocaleDateString(T.locale, { day: "numeric", month: "long", year: "numeric" });
    $("asof").textContent = T.asof(when);
    V = wholeView();
    readouts(); years(); power(); plugs(); operators(); ranking();
    if (state.areas.length) {
      $("pk-compare").innerHTML = `<p class="ac-caption">${esc(T.loadingAreas)}</p>`;
      loadAreas().then(refresh).catch((e) => { $("pk-compare").innerHTML = `<p class="ac-caption">${esc(T.failed + e.message)}</p>`; });
    }
  }).catch((e) => {
    $("readouts").innerHTML = `<p class="ac-caption" style="margin:0">${esc(e.status === 404 ? T.notYet : T.failed + e.message)}</p>`;
  });
})();
