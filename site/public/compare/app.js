/* Compare cars: up to four car models side by side, joined from the data the site keeps:
   official consumption, CO2, power and mass (EEA vehicle catalog), what 100 km and a year cost at
   this week's German prices (fuel and charging data), new registrations in Germany (KBA) and
   Safety Gate recalls that name the model.
   One script for the English (/compare/), German (/de/compare/) and Chinese (/zh/compare/) page.
   Link: ?cars=<catalog id>,<catalog id>,…&km=<km per year>&same=1 (hide rows that are the same).
   Without ?cars= the page shows the compare basket (AlloGarage.compare), else an example. */
(() => {
  const lang = (document.documentElement.lang || "en").slice(0, 2);
  const de = lang === "de", zh = lang === "zh";
  const PRE = de ? "/de" : zh ? "/zh" : "";
  const T = zh ? {
    locale: "zh-CN", failed: "无法加载数据：", remove: "移除", add: "添加车型", addPh: "品牌和车型，例如 VW Golf", noModel: "没有找到车型。", full: "最多比较 4 辆车。先移除一辆。",
    fuel: { electric: "纯电动", petrol: "汽油", diesel: "柴油", lpg: "LPG", cng: "天然气", "phev-petrol": "插电混动（汽油）", "phev-diesel": "插电混动（柴油）", hydrogen: "氢燃料", e85: "E85" },
    g: { ratings: "评级", basics: "基本信息", energy: "官方能耗 (WLTP)", cost: "用车费用（本周德国价格）", de: "在德国", recalls: "召回" },
    fuelRow: "能源类型", years: "新车销售年份", power: "功率", mass: "整备质量", kwPerT: "功率重量比", range: "纯电续航 (WLTP)", variants: "登记的版本数",
    kwh: "电耗", litre: "油耗", co2: "CO₂ 排放",
    c100: "每 100 公里（家充或加油）", cPub: "每 100 公里（公共充电）", cYear: (km) => `每年（${km} 公里）`,
    regs12: "近 12 个月新登记", rank: "上月排名", regsNote: "按 KBA 车型计，含所有动力版本",
    recalls: "安全门召回（2019 年起）", page: "车型页面",
    best: "最佳", only: "隐藏相同的项目", mark: "标出最佳值", km: "每年公里数",
    try: "常见比较", mine: "加入我的车", empty: "添加至少两辆车来比较。",
    basisHome: (p) => `家充 ${p}/kWh，含 10% 充电损耗`, basisPub: (p) => `公共即充即付中位数 ${p}/kWh`, basisFuel: (w) => `油价：${w} 当周全国平均`,
    pair: (a, b) => `${a} 对比 ${b}`, euro: "Euro NCAP 安全星级", green: "Green NCAP 环保星级", adac: (y) => `ADAC 每 1,000 辆故障（${y} 年首次登记）`, rg: "评级",
  } : de ? {
    locale: "de-DE", failed: "Die Daten konnten nicht geladen werden: ", remove: "Entfernen", add: "Auto hinzufügen", addPh: "Marke und Modell, z. B. VW Golf", noModel: "Kein Modell gefunden.", full: "Bis zu 4 Autos. Entferne zuerst eins.",
    fuel: { electric: "Elektro", petrol: "Benzin", diesel: "Diesel", lpg: "Autogas", cng: "Erdgas", "phev-petrol": "Plug-in-Hybrid (Benzin)", "phev-diesel": "Plug-in-Hybrid (Diesel)", hydrogen: "Wasserstoff", e85: "E85" },
    g: { ratings: "Bewertungen", basics: "Grunddaten", energy: "Offizieller Verbrauch (WLTP)", cost: "Kosten (Preise dieser Woche in Deutschland)", de: "In Deutschland", recalls: "Rückrufe" },
    fuelRow: "Antrieb", years: "Neu verkauft", power: "Leistung", mass: "Leergewicht", kwPerT: "Leistung pro Tonne", range: "Elektrische Reichweite (WLTP)", variants: "Zugelassene Versionen",
    kwh: "Stromverbrauch", litre: "Kraftstoffverbrauch", co2: "CO₂-Ausstoß",
    c100: "Pro 100 km (zu Hause geladen oder getankt)", cPub: "Pro 100 km (öffentlich geladen)", cYear: (km) => `Pro Jahr (${km} km)`,
    regs12: "Neuzulassungen, letzte 12 Monate", rank: "Platz im letzten Monat", regsNote: "Pro KBA-Modell, alle Antriebe zusammen",
    recalls: "Safety-Gate-Rückrufe (seit 2019)", page: "Modellseite",
    best: "Bester Wert", only: "Gleiche Zeilen ausblenden", mark: "Besten Wert markieren", km: "Kilometer pro Jahr",
    try: "Oft verglichen", mine: "Meine Autos hinzufügen", empty: "Füge mindestens zwei Autos hinzu.",
    basisHome: (p) => `Zu Hause ${p}/kWh, mit 10 % Ladeverlust`, basisPub: (p) => `Median öffentlich ad hoc ${p}/kWh`, basisFuel: (w) => `Sprit: Bundesdurchschnitt der Woche ab ${w}`,
    pair: (a, b) => `${a} oder ${b}`, euro: "Euro NCAP Sicherheit", green: "Green NCAP Umwelt", adac: (y) => `ADAC Pannen pro 1.000 (Erstzulassung ${y})`, rg: "Bewertungen",
  } : {
    locale: "en-GB", failed: "Could not load data: ", remove: "Remove", add: "Add a car", addPh: "Make and model, e.g. VW Golf", noModel: "No model found.", full: "Up to 4 cars. Remove one first.",
    fuel: { electric: "Electric", petrol: "Petrol", diesel: "Diesel", lpg: "LPG", cng: "Natural gas", "phev-petrol": "Plug-in hybrid (petrol)", "phev-diesel": "Plug-in hybrid (diesel)", hydrogen: "Hydrogen", e85: "E85" },
    g: { ratings: "Ratings", basics: "Basics", energy: "Official consumption (WLTP)", cost: "Running cost (this week's prices in Germany)", de: "In Germany", recalls: "Recalls" },
    fuelRow: "Drive", years: "Sold new", power: "Power", mass: "Kerb weight", kwPerT: "Power per tonne", range: "Electric range (WLTP)", variants: "Versions registered",
    kwh: "Electricity", litre: "Fuel", co2: "CO₂",
    c100: "Per 100 km (home charging or pump)", cPub: "Per 100 km (public charging)", cYear: (km) => `Per year (${km} km)`,
    regs12: "New registrations, last 12 months", rank: "Rank last month", regsNote: "Per KBA model, all drive types together",
    recalls: "Safety Gate recalls (since 2019)", page: "Model page",
    best: "Best", only: "Hide rows that are the same", mark: "Mark the best value", km: "Kilometres per year",
    try: "Often compared", mine: "Add my cars", empty: "Add at least two cars to compare.",
    basisHome: (p) => `Home ${p}/kWh, plus 10% charging losses`, basisPub: (p) => `Public ad-hoc median ${p}/kWh`, basisFuel: (w) => `Fuel: national average, week of ${w}`,
    pair: (a, b) => `${a} vs ${b}`, euro: "Euro NCAP safety", green: "Green NCAP environment", adac: (y) => `ADAC breakdowns per 1,000 (first registered ${y})`, rg: "Ratings",
  };
  const G = window.AlloGarage;
  const HOME_PRICE = 0.35; // the charging cost tool's default, used in garage.js cost100
  const DEFAULT = ["volvo-ex30", "tesla-model-y", "vw-id-3"];
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const num = (v, d = 1) => v == null ? "–" : Number(v).toLocaleString(T.locale, { minimumFractionDigits: d, maximumFractionDigits: d });
  const eur = (v, d = 2) => v == null ? "–" : Number(v).toLocaleString(T.locale, { style: "currency", currency: "EUR", minimumFractionDigits: d, maximumFractionDigits: d });
  const day = (iso) => iso ? new Date(iso + "T12:00:00Z").toLocaleDateString(T.locale, { day: "numeric", month: "short", year: "numeric" }) : "–";
  const json = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(`${u}: ${r.status}`); return r.json(); });
  const soft = (u) => json(u).catch(() => null);

  let ratingsData = null, catalogYear = 0, catalog = [], byId = new Map(), prices = { fuel: null, charge: null }, regs = null, recallBrands = null;
  const recallCache = new Map(); // brand file -> alerts
  const u0 = new URLSearchParams(location.search);
  const st = {
    ids: [],
    km: Math.max(1000, Math.min(100000, Number(u0.get("km")) || 15000)),
    same: u0.get("same") === "1",
    mark: u0.get("best") !== "0",
  };

  /* ---------- what we know about one model ---------- */
  const costs = (m) => G.cost100(m, prices.fuel, prices.charge);
  function regOf(m) {
    const key = G.modelKey(m.make, m.model);
    return regs ? regs.models.find((x) => x.model !== "SONSTIGE" && G.modelKey(x.brand, x.model) === key) || null : null;
  }
  async function recallsOf(m) {
    const slug = G.recallBrand(m.make);
    const b = recallBrands && recallBrands.brands.find((x) => x.slug === slug);
    if (!b) return { n: recallBrands ? 0 : null, href: `${PRE}/recalls/` };
    if (!recallCache.has(b.file)) recallCache.set(b.file, soft(`/data/recalls/eu/${b.file}`).then((d) => (d ? d.alerts : null)));
    const alerts = await recallCache.get(b.file);
    const key = G.recallModel(m.make, m.model);
    const href = `${PRE}/recalls/?brand=${encodeURIComponent(slug)}${key ? `&model=${encodeURIComponent(key)}` : ""}`;
    return { n: alerts ? alerts.filter((a) => G.recallNames(a, m.make, m.model)).length : null, href };
  }
  async function info(id) {
    const m = byId.get(id);
    const c = costs(m), r = regOf(m), rc = await recallsOf(m), rt = G.ratings(ratingsData, m);
    return { id, m, c, r, rc, rt };
  }

  /* ---------- rows ---------- */
  // value(car) -> number or text (null = no figure); better: "low" | "high" marks the best of the numbers
  const ROWS = [
    { g: "basics", label: () => T.fuelRow, value: (x) => T.fuel[x.m.fuel] || x.m.fuel },
    { g: "basics", label: () => T.years, value: (x) => x.m.years ? (x.m.years[0] === x.m.years[1] ? String(x.m.years[0]) : `${x.m.years[0]}–${x.m.years[1]}`) : null },
    { g: "basics", label: () => T.power, unit: "kW", value: (x) => x.m.power_kw, fmt: (v) => `${v} kW` },
    { g: "basics", label: () => T.mass, unit: "kg", value: (x) => x.m.mass_kg, fmt: (v) => `${v.toLocaleString(T.locale)} kg` },
    { g: "basics", label: () => T.kwPerT, value: (x) => x.m.power_kw && x.m.mass_kg ? Math.round(x.m.power_kw / x.m.mass_kg * 1000) : null, fmt: (v) => `${v} kW/t` },
    { g: "energy", label: () => T.kwh, value: (x) => x.m.kwh_per_100km, fmt: (v) => `${num(v)} kWh/100 km`, better: "low", byFuel: true, range: (x) => x.m.kwh_range },
    { g: "energy", label: () => T.litre, value: (x) => x.m.l_per_100km, fmt: (v) => `${num(v)} ${de ? "l" : zh ? "升" : "L"}/100 km`, better: "low", byFuel: true, range: (x) => x.m.l_range },
    { g: "energy", label: () => T.co2, value: (x) => x.m.co2_g_km, fmt: (v) => `${v} g/km`, better: "low" },
    { g: "energy", label: () => T.range, value: (x) => x.m.range_km, fmt: (v) => `${v.toLocaleString(T.locale)} km`, better: "high", byFuel: true, range: (x) => x.m.range_span },
    { g: "cost", label: () => T.c100, value: (x) => x.c.main, fmt: (v) => eur(v), better: "low" },
    { g: "cost", label: () => T.cPub, value: (x) => x.c.pub, fmt: (v) => eur(v), better: "low" },
    { g: "cost", label: () => T.cYear(st.km.toLocaleString(T.locale)), value: (x) => x.c.main == null ? null : x.c.main * st.km / 100, fmt: (v) => eur(v, 0), better: "low" },
    { g: "de", label: () => T.regs12, value: (x) => x.r ? x.r.last_12_months || 0 : null, fmt: (v) => v.toLocaleString(T.locale), better: "high" },
    { g: "de", label: () => T.rank, value: (x) => x.r && x.r.rank ? x.r.rank : null, fmt: (v) => `#${v}` },
    { g: "ratings", label: () => T.euro, value: (x) => x.rt.euro ? x.rt.euro.stars : null, fmt: (v) => "★".repeat(Math.floor(v)) + (v % 1 ? "½" : ""), better: "high", link: (x) => x.rt.euro && x.rt.euro.url, note: (x) => x.rt.euro && String(x.rt.euro.year) },
    { g: "ratings", label: () => T.green, value: (x) => x.rt.green ? x.rt.green.stars : null, fmt: (v) => "★".repeat(Math.floor(v)) + (v % 1 ? "½" : ""), better: "high", link: (x) => x.rt.green && x.rt.green.url, note: (x) => x.rt.green && `${x.rt.green.year} · ${x.rt.green.name}` },
    { g: "ratings", label: () => T.adac(adacYear(0)), value: (x) => adacRate(x, 0), fmt: (v) => num(v), better: "low" },
    { g: "ratings", label: () => T.adac(adacYear(4)), value: (x) => adacRate(x, 4), fmt: (v) => num(v), better: "low" },
    { g: "recalls", label: () => T.recalls, value: (x) => x.rc.n, fmt: (v) => String(v), better: "low", link: (x) => x.rc.href },
  ];

  // ADAC rows: the report's newest registration year and one five years older
  const adacYear = (i) => { const A = ratingsData && ratingsData.adac_breakdowns; const ys = A ? [...A.registration_years].sort().reverse() : []; return ys[i] || ""; };
  const adacRate = (x, i) => { const y = adacYear(i); return y && x.rt.adac && x.rt.adac.rates[y] != null ? x.rt.adac.rates[y] : null; };

  /* ---------- drawing ---------- */
  let infos = [];
  // best value of a row; consumption only counts against cars with the same fuel (a plug-in
  // hybrid's official 0.8 L/100 km is not better than a petrol car's 6 L)
  function bestOf(row, x) {
    if (!row.better) return null;
    const peers = row.byFuel ? infos.filter((y) => y.m.fuel === x.m.fuel) : infos;
    const nums = peers.map((y) => row.value(y)).filter((v) => typeof v === "number");
    if (nums.length < 2 || new Set(nums).size < 2) return null;
    return row.better === "low" ? Math.min(...nums) : Math.max(...nums);
  }
  function cell(row, x) {
    const best = bestOf(row, x);
    const v = row.value(x);
    if (v == null) return `<td class="na">–</td>`;
    const text = typeof v === "number" && row.fmt ? row.fmt(v) : String(v);
    const rg = row.range ? row.range(x) : null;
    const nt = row.note ? row.note(x) : null;
    const extra = rg && rg[0] !== rg[1] ? `<small>${num(rg[0])}–${num(rg[1])}</small>` : nt ? `<small>${esc(nt)}</small>` : "";
    const isBest = st.mark && best != null && v === best;
    const body = row.link ? `<a href="${esc(row.link(x))}">${esc(text)}</a>` : esc(text);
    return `<td${isBest ? ` class="best" title="${esc(T.best)}"` : ""}>${body}${isBest ? ` <span class="star" aria-hidden="true">★</span><span class="sr">(${esc(T.best)})</span>` : ""}${extra}</td>`;
  }
  function draw() {
    const n = infos.length;
    $("empty").hidden = n >= 2;
    const head = `<thead><tr><th scope="col" class="corner"><span class="sr">${esc(T.page)}</span></th>${infos.map((x) => `<th scope="col"><div class="carhead">
        <a href="${PRE}/cars/?car=${encodeURIComponent(x.id)}" class="carname">${esc(x.m.name)}</a>
        <span class="carfuel">${esc(T.fuel[x.m.fuel] || x.m.fuel)}</span>
        <button type="button" class="x" data-remove="${esc(x.id)}" aria-label="${esc(T.remove)}: ${esc(x.m.name)}" title="${esc(T.remove)}">×</button></div></th>`).join("")}</tr></thead>`;
    let body = "", group = "";
    for (const row of ROWS) {
      const vals = infos.map((x) => row.value(x));
      if (vals.every((v) => v == null)) continue;
      const shown = vals.map((v, i) => v == null ? "–" : (typeof v === "number" && row.fmt ? row.fmt(v) : String(v)));
      const same = n > 1 && shown.every((s) => s === shown[0]);
      if (st.same && same) continue;
      if (row.g !== group) { group = row.g; body += `<tr class="grp"><th scope="rowgroup" colspan="${n + 1}">${esc(T.g[group])}</th></tr>`; }
      body += `<tr><th scope="row">${esc(row.label())}</th>${infos.map((x) => cell(row, x)).join("")}</tr>`;
    }
    $("table").innerHTML = n ? head + `<tbody>${body}</tbody>` : "";
    $("table").style.minWidth = `${104 + 116 * n}px`; // two cars fit a phone; more scroll sideways
    const basis = [T.basisHome(eur(HOME_PRICE)), prices.charge ? T.basisPub(eur(prices.charge.overall.median)) : "", prices.fuel ? T.basisFuel(day(prices.fuel.week)) : ""].filter(Boolean);
    $("basis").textContent = basis.join(" · ") + (regs ? ` · ${T.regsNote}` : "");
    $("add").hidden = n >= G.compare.MAX;
    drawMine();
  }
  function drawMine() {
    const mine = G.list().map((c) => c.car).filter((id) => id && byId.has(id) && !st.ids.includes(id));
    $("mine").hidden = !mine.length || st.ids.length >= G.compare.MAX;
  }
  function drawTry() {
    const top = (f) => catalog.filter((m) => m.fuel === f && m.year === catalogYear).sort((a, b) => (b.registrations || 0) - (a.registrations || 0));
    const ev = top("electric"), pe = top("petrol"), di = top("diesel"), ph = top("phev-petrol");
    const pairs = [[ev[0], ev[1]], [ev[2], ev[3]], [ev[0], pe[0]], [pe[0], pe[1]], [di[0], di[1]], [ph[0], ph[1]], [byId.get("volvo-ex30"), byId.get("tesla-model-y")]]
      .filter((p) => p[0] && p[1] && p[0] !== p[1]);
    $("try").innerHTML = pairs.map(([a, b]) => `<a class="ac-chip" href="?cars=${encodeURIComponent(a.id)},${encodeURIComponent(b.id)}">${esc(T.pair(a.name, b.name))}</a>`).join("");
  }
  function setUrl() {
    const u = new URL(location.href);
    if (st.ids.length) u.searchParams.set("cars", st.ids.join(",")); else u.searchParams.delete("cars");
    if (st.km !== 15000) u.searchParams.set("km", st.km); else u.searchParams.delete("km");
    if (st.same) u.searchParams.set("same", "1"); else u.searchParams.delete("same");
    if (!st.mark) u.searchParams.set("best", "0"); else u.searchParams.delete("best");
    history.replaceState(null, "", u);
  }
  let loading = 0;
  async function setIds(ids, remember = true) {
    st.ids = [...new Set(ids.filter((id) => byId.has(id)))].slice(0, G.compare.MAX);
    if (remember) G.compare.set(st.ids);
    setUrl();
    const me = ++loading;
    const got = await Promise.all(st.ids.map(info));
    if (me !== loading) return;
    infos = got; draw();
  }

  /* ---------- controls ---------- */
  $("table").addEventListener("click", (e) => {
    const b = e.target.closest("[data-remove]");
    if (b) setIds(st.ids.filter((id) => id !== b.dataset.remove));
  });
  $("same").checked = st.same; $("mark").checked = st.mark;
  $("same").addEventListener("change", (e) => { st.same = e.target.checked; setUrl(); draw(); });
  $("mark").addEventListener("change", (e) => { st.mark = e.target.checked; setUrl(); draw(); });
  $("km").value = st.km;
  $("km").addEventListener("change", (e) => { st.km = Math.max(1000, Math.min(100000, Number(e.target.value) || 15000)); e.target.value = st.km; setUrl(); draw(); });
  $("mine").addEventListener("click", () => {
    const mine = G.list().map((c) => c.car).filter((id) => id && byId.has(id));
    setIds([...st.ids, ...mine.filter((id) => !st.ids.includes(id))]);
  });

  /* add a car: the same picker as My cars */
  const q = $("q"), list = $("q-list");
  let shownOpts = [], activeOpt = -1;
  function matches(text) {
    const words = String(text).toLowerCase().replace("volkswagen", "vw").split(/\s+/).map(G.norm).filter(Boolean);
    const hits = (words.length ? catalog.filter((m) => { const h = G.norm(`${m.make} ${m.name} ${T.fuel[m.fuel] || m.fuel}`); return words.every((w) => h.includes(w)); }) : catalog)
      .filter((m) => !st.ids.includes(m.id));
    return hits.slice().sort((a, b) => (b.registrations || 0) - (a.registrations || 0)).slice(0, 30);
  }
  function renderList() {
    list.innerHTML = shownOpts.length ? shownOpts.map((m, i) => `<li role="option" id="q-opt-${i}" data-i="${i}" aria-selected="${i === activeOpt}">${esc(m.name)}<small>${esc(T.fuel[m.fuel] || m.fuel)}${m.years && m.years[1] < catalogYear ? ` · ${m.years[0]}–${m.years[1]}` : ""}</small></li>`).join("")
      : `<li class="combo__none" aria-disabled="true">${esc(T.noModel)}</li>`;
    if (activeOpt >= 0) { q.setAttribute("aria-activedescendant", `q-opt-${activeOpt}`); $(`q-opt-${activeOpt}`)?.scrollIntoView({ block: "nearest" }); }
    else q.removeAttribute("aria-activedescendant");
  }
  function openList(text) { shownOpts = matches(text); activeOpt = -1; renderList(); list.hidden = false; q.setAttribute("aria-expanded", "true"); }
  function closeList() { list.hidden = true; q.setAttribute("aria-expanded", "false"); q.removeAttribute("aria-activedescendant"); activeOpt = -1; }
  function choose(m) { q.value = ""; closeList(); setIds([...st.ids, m.id]); q.blur(); }
  q.addEventListener("focus", () => openList(q.value));
  q.addEventListener("input", () => openList(q.value));
  q.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault(); if (list.hidden) openList(q.value); if (!shownOpts.length) return;
      activeOpt = (activeOpt + (e.key === "ArrowDown" ? 1 : -1) + shownOpts.length) % shownOpts.length; renderList();
    } else if (e.key === "Enter" && !list.hidden && shownOpts.length) {
      e.preventDefault(); choose(shownOpts[activeOpt >= 0 ? activeOpt : 0]);
    } else if (e.key === "Escape") closeList();
  });
  list.addEventListener("pointerdown", (e) => e.preventDefault());
  list.addEventListener("click", (e) => { const li = e.target.closest("li[data-i]"); if (li) choose(shownOpts[+li.dataset.i]); });
  q.addEventListener("blur", () => setTimeout(closeList, 150));
  addEventListener("ac:garage", drawMine);

  async function load() {
    const [cat, fuel, charge, rg, rb, rt] = await Promise.all([
      json(AlloSite.data("vehicle-catalog", "models.json")),
      soft(AlloSite.data("fuel-prices", "latest.json")),
      soft(AlloSite.data("charging-prices", "latest.json")),
      soft(AlloSite.data("registrations", "models.json")),
      soft("/data/recalls/eu/brands.json"),
      soft(AlloSite.data("ratings", "ratings.json")),
    ]);
    catalogYear = cat.year || 0; catalog = cat.models; byId = new Map(catalog.map((m) => [m.id, m]));
    prices = { fuel, charge }; regs = rg; recallBrands = rb; ratingsData = rt;
    drawTry();
    const fromUrl = (u0.get("cars") || "").split(",").map((s) => s.trim()).filter((id) => byId.has(id));
    if (fromUrl.length) return setIds(fromUrl, true);
    const basket = G.compare.list().filter((id) => byId.has(id));
    if (basket.length) return setIds(basket, false);
    return setIds(DEFAULT, false);
  }
  load().catch((e) => { $("table").innerHTML = `<caption>${esc(T.failed)}${esc(e.message)}</caption>`; });
})();
