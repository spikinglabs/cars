/* My cars: the cars someone keeps on this device (assets/garage.js) and one page per car model that
   joins what the site knows about it: official consumption (EEA vehicle catalog), what 100 km costs
   at today's prices (fuel and charging data), recalls matching its build year (Safety Gate) and new
   registrations in Germany (KBA).
   One script for the English (/cars/), German (/de/cars/) and Chinese (/zh/cars/) page.
   ?car=<catalog id>&year=<first registered> in the link shows that model, so a link (or an AI) can
   open any car; without it the page shows the car picked last. */
(() => {
  const lang = (document.documentElement.lang || "en").slice(0, 2);
  const de = lang === "de", zh = lang === "zh";
  const PRE = de ? "/de" : zh ? "/zh" : "";
  const T = zh ? {
    locale: "zh-CN", failed: "无法加载数据：", example: "示例", addThis: "加入我的车", remove: "移除", saved: "已在我的车里",
    fuel: { electric: "纯电动", petrol: "汽油", diesel: "柴油", lpg: "LPG", "phev-petrol": "插电混动（汽油）", "phev-diesel": "插电混动（柴油）", hydrogen: "氢燃料" },
    reg: (y) => `${y} 年首次登记`, noModel: "没有找到车型。可以选择“列表里没有我的车”。", needName: "请选择车型或填写品牌和车型。",
    cost: "每 100 公里费用", home: (p) => `在家充电，${p}/kWh`, pub: (p) => `公共即充即付，中位数 ${p}/kWh`, fuelAt: (f, p) => `${f}，${p}/升`,
    mix: "按官方电/油比例，在家充电", noPrice: "没有这种燃料的价格数据", official: "官方能耗 (WLTP)", sold: (a, b, y) => `新车销售：${a === b ? a : `${a}–${b}`} 年（官方数据来自 ${y} 年）`, yours: "你的能耗", co2: "CO₂", power: "功率",
    ownCons: "我的实际能耗", ownHint: "保存在这辆车上，费用会按它计算。",
    exact: "详细计算充电费用", compare: "和电动车比较", chargeTimes: "最便宜的充电时间", chargers: "附近的充电桩",
    recalls: "召回", recallsN: (n) => `${n} 次召回涉及此车型`, recallsYear: (n, y) => `其中 ${n} 次的生产时间与 ${y} 年首次登记相符`,
    recallsNone: "安全门 (Safety Gate) 中没有找到此车型的召回。", recallsBrand: (b) => `查看 ${b} 的全部召回`, recallsAll: "查看全部召回和购车前要问的问题",
    regs: "在德国的新车登记", regsYear: "过去 12 个月新登记", regsRank: (r) => `排名第 ${r}`, regsNone: "登记统计中没有单独列出此车型。", regsMore: "每月登记量和排名",
    perMonth: "每月新登记，近 24 个月", cmpAdd: "+ 加入对比", cmpIn: "✓ 已加入对比", cmpGo: (n) => `对比 ${n} 款车`, unit: (f) => f === "electric" ? "kWh/100 km" : "升/100 km",
  } : de ? {
    locale: "de-DE", failed: "Die Daten konnten nicht geladen werden: ", example: "Beispiel", addThis: "Zu meinen Autos", remove: "Entfernen", saved: "In deinen Autos",
    fuel: { electric: "Elektro", petrol: "Benzin", diesel: "Diesel", lpg: "Autogas", "phev-petrol": "Plug-in-Hybrid (Benzin)", "phev-diesel": "Plug-in-Hybrid (Diesel)", hydrogen: "Wasserstoff" },
    reg: (y) => `Erstzulassung ${y}`, noModel: "Kein Modell gefunden. Wähle „Mein Auto ist nicht in der Liste“.", needName: "Wähle ein Modell oder trag Marke und Modell ein.",
    cost: "Kosten pro 100 km", home: (p) => `Zu Hause geladen, ${p}/kWh`, pub: (p) => `Öffentlich ad hoc, Median ${p}/kWh`, fuelAt: (f, p) => `${f}, ${p}/l`,
    mix: "Offizieller Strom-/Kraftstoffmix, zu Hause geladen", noPrice: "Für diesen Kraftstoff haben wir keine Preise", official: "Offizieller Verbrauch (WLTP)", sold: (a, b, y) => `Neu verkauft ${a === b ? a : `${a}–${b}`} (offizielle Werte von ${y})`, yours: "Dein Verbrauch", co2: "CO₂", power: "Leistung",
    ownCons: "Mein echter Verbrauch", ownHint: "Wird bei diesem Auto gespeichert und für die Kosten genutzt.",
    exact: "Ladekosten genau ausrechnen", compare: "Mit einem E-Auto vergleichen", chargeTimes: "Günstigste Ladezeit", chargers: "Ladesäulen in der Nähe",
    recalls: "Rückrufe", recallsN: (n) => `${n} ${n === 1 ? "Rückruf nennt" : "Rückrufe nennen"} dieses Modell`, recallsYear: (n, y) => `${n} davon passen zur Erstzulassung ${y}`,
    recallsNone: "Safety Gate nennt keine Rückrufe für dieses Modell.", recallsBrand: (b) => `Alle Rückrufe von ${b}`, recallsAll: "Alle Rückrufe und was du vor dem Kauf fragen solltest",
    regs: "Neuzulassungen in Deutschland", regsYear: "Neu in den letzten 12 Monaten", regsRank: (r) => `Platz ${r}`, regsNone: "Die Zulassungsstatistik führt dieses Modell nicht einzeln.", regsMore: "Zulassungen pro Monat und Rangliste",
    perMonth: "Neuzulassungen pro Monat, letzte 24 Monate", cmpAdd: "+ Vergleichen", cmpIn: "✓ Im Vergleich", cmpGo: (n) => `${n} Autos vergleichen`, unit: (f) => f === "electric" ? "kWh/100 km" : "l/100 km",
  } : {
    locale: "en-GB", failed: "Could not load data: ", example: "Example", addThis: "Add to my cars", remove: "Remove", saved: "In your cars",
    fuel: { electric: "Electric", petrol: "Petrol", diesel: "Diesel", lpg: "LPG", "phev-petrol": "Plug-in hybrid (petrol)", "phev-diesel": "Plug-in hybrid (diesel)", hydrogen: "Hydrogen" },
    reg: (y) => `First registered ${y}`, noModel: "No model found. Choose “My car is not in the list”.", needName: "Pick a model, or type make and model.",
    cost: "Cost per 100 km", home: (p) => `Charged at home, ${p}/kWh`, pub: (p) => `Public ad hoc, median ${p}/kWh`, fuelAt: (f, p) => `${f}, ${p}/L`,
    mix: "Official electric/fuel mix, charged at home", noPrice: "We have no prices for this fuel", official: "Official consumption (WLTP)", sold: (a, b, y) => `Sold new ${a === b ? a : `${a}–${b}`} (official figures from ${y})`, yours: "Your consumption", co2: "CO₂", power: "Power",
    ownCons: "My real consumption", ownHint: "Saved with this car and used for the cost.",
    exact: "Work out the charging cost in detail", compare: "Compare with an electric car", chargeTimes: "Cheapest time to charge", chargers: "Chargers near you",
    recalls: "Recalls", recallsN: (n) => `${n} ${n === 1 ? "recall names" : "recalls name"} this model`, recallsYear: (n, y) => `${n} of them match first registration in ${y}`,
    recallsNone: "Safety Gate lists no recalls for this model.", recallsBrand: (b) => `All ${b} recalls`, recallsAll: "All recalls, and what to ask before you buy",
    regs: "New registrations in Germany", regsYear: "New in the last 12 months", regsRank: (r) => `Rank ${r}`, regsNone: "The registration statistics don't list this model on its own.", regsMore: "Registrations per month and rankings",
    perMonth: "New registrations per month, last 24 months", cmpAdd: "+ Compare", cmpIn: "✓ In comparison", cmpGo: (n) => `Compare ${n} cars`, unit: (f) => f === "electric" ? "kWh/100 km" : "L/100 km",
  };
  const G = window.AlloGarage;
  const HOME_PRICE = 0.35, LOSS = 1.1; // the charging cost tool's defaults
  const FUEL_PRODUCT = { petrol: "euro_super_95", diesel: "diesel", lpg: "lpg", "phev-petrol": "euro_super_95", "phev-diesel": "diesel" };
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const num = (v, d = 1) => v == null ? "–" : Number(v).toLocaleString(T.locale, { minimumFractionDigits: d, maximumFractionDigits: d });
  const eur = (v, d = 2) => v == null ? "–" : Number(v).toLocaleString(T.locale, { style: "currency", currency: "EUR", minimumFractionDigits: d, maximumFractionDigits: d });
  const day = (iso) => iso ? new Date(iso + "T12:00:00Z").toLocaleDateString(T.locale, { day: "numeric", month: "short", year: "numeric" }) : "–";
  const json = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(`${u}: ${r.status}`); return r.json(); });
  const soft = (u) => json(u).catch(() => null);

  let catalogYear = 0, catalog = [], byId = new Map(), prices = { fuel: null, charge: null }, regs = null, recallBrands = null;
  let current = null; // { car: garage entry or null, spec: {car,name,make,model,fuel,year,cons} }

  /* ---------- your cars ---------- */
  const ADD = $("add-open").textContent.replace(/^\+\s*/, "");
  function drawGarage() {
    const cars = G.list(), act = current && current.car ? current.car.id : null;
    $("garage").innerHTML = cars.map((c) => `<button type="button" class="ac-chip" data-car="${esc(c.id)}" aria-pressed="${c.id === act}">${esc(c.nick || c.name)}${c.nick ? ` <small>${esc(c.name)}</small>` : ""}${c.year ? ` <small>${c.year}</small>` : ""}</button>`).join("")
      + `<button type="button" class="ac-btn ac-btn--primary" id="add-open">+ ${esc(ADD)}</button>`;
    $("garage-none").hidden = cars.length > 0;
  }
  $("garage").addEventListener("click", (e) => {
    const b = e.target.closest("[data-car]");
    if (b) { G.setActive(b.dataset.car); showSaved(G.get(b.dataset.car), true); return; }
    if (e.target.closest("#add-open")) openForm();
  });

  /* ---------- add a car ---------- */
  const form = $("addform"), q = $("q"), list = $("q-list");
  let picked = null, shown = [], activeOpt = -1;
  const thisYear = new Date().getFullYear();
  $("year").innerHTML = `<option value="0">–</option>` + Array.from({ length: thisYear - 1989 }, (_, i) => `<option>${thisYear - i}</option>`).join("");
  function openForm() {
    form.hidden = false; picked = null; q.value = ""; $("nick").value = ""; $("year").value = "0";
    $("manual").hidden = true; $("pickrow").hidden = false; q.focus();
  }
  $("add-cancel").addEventListener("click", () => { form.hidden = true; });
  $("manual-open").addEventListener("click", () => {
    const on = $("manual").hidden;
    $("manual").hidden = !on; $("pickrow").hidden = on;
    if (on) { $("m-name").value = q.value; $("m-name").focus(); }
  });
  const unitFor = () => { $("m-unit").textContent = T.unit($("m-fuel").value); };
  $("m-fuel").addEventListener("change", unitFor); unitFor();

  const label = (m) => `${m.name}`;
  function matches(text) {
    const words = String(text).toLowerCase().replace("volkswagen", "vw").split(/\s+/).map(G.norm).filter(Boolean);
    const hits = words.length ? catalog.filter((m) => { const h = G.norm(`${m.make} ${m.name} ${T.fuel[m.fuel] || m.fuel}`); return words.every((w) => h.includes(w)); }) : catalog;
    return hits.slice().sort((a, b) => (b.registrations || 0) - (a.registrations || 0)).slice(0, 30);
  }
  function renderList() {
    list.innerHTML = shown.length ? shown.map((m, i) => `<li role="option" id="q-opt-${i}" data-i="${i}" aria-selected="${i === activeOpt}">${esc(label(m))}<small>${esc(T.fuel[m.fuel] || m.fuel)}</small></li>`).join("")
      : `<li class="combo__none" aria-disabled="true">${esc(T.noModel)}</li>`;
    if (activeOpt >= 0) { q.setAttribute("aria-activedescendant", `q-opt-${activeOpt}`); $(`q-opt-${activeOpt}`)?.scrollIntoView({ block: "nearest" }); }
    else q.removeAttribute("aria-activedescendant");
  }
  function openList(text) { shown = matches(text); activeOpt = -1; renderList(); list.hidden = false; q.setAttribute("aria-expanded", "true"); }
  function closeList() { list.hidden = true; q.setAttribute("aria-expanded", "false"); q.removeAttribute("aria-activedescendant"); activeOpt = -1; }
  function choose(m) { picked = m; q.value = `${label(m)} · ${T.fuel[m.fuel] || m.fuel}`; closeList(); $("year").focus(); }
  q.addEventListener("focus", () => openList(picked ? "" : q.value));
  q.addEventListener("input", () => { picked = null; openList(q.value); });
  q.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault(); if (list.hidden) openList(q.value); if (!shown.length) return;
      activeOpt = (activeOpt + (e.key === "ArrowDown" ? 1 : -1) + shown.length) % shown.length; renderList();
    } else if (e.key === "Enter" && !list.hidden && shown.length) {
      e.preventDefault(); choose(shown[activeOpt >= 0 ? activeOpt : 0]);
    } else if (e.key === "Escape") closeList();
  });
  list.addEventListener("pointerdown", (e) => e.preventDefault());
  list.addEventListener("click", (e) => { const li = e.target.closest("li[data-i]"); if (li) choose(shown[+li.dataset.i]); });
  q.addEventListener("blur", () => setTimeout(closeList, 150));

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const year = Number($("year").value) || 0, nick = $("nick").value.trim();
    let entry;
    if (!$("manual").hidden) {
      const name = $("m-name").value.trim();
      if (!name) { $("m-name").focus(); return; }
      const [make, ...rest] = name.split(/\s+/);
      entry = { car: "", name, make, model: rest.join(" "), fuel: $("m-fuel").value, year, nick, cons: Number($("m-cons").value) || null };
    } else {
      const m = picked || matches(q.value)[0];
      if (!m || !q.value.trim()) { openList(q.value); return; }
      entry = { car: m.id, name: m.name, make: m.make, model: m.model, fuel: m.fuel, year, nick, cons: null };
    }
    const c = G.add(entry);
    form.hidden = true;
    showSaved(c, true);
  });

  /* ---------- one car ---------- */
  function specOf(c) {
    const m = c.car ? byId.get(c.car) : null;
    return { car: c.car, name: c.name || (m && m.name), make: c.make || (m && m.make), model: c.model || (m && m.model), fuel: c.fuel || (m && m.fuel), year: c.year || 0, cons: c.cons, m };
  }
  function showSaved(c, push) {
    if (!c) return;
    current = { car: c, spec: specOf(c) };
    if (push) setUrl(current.spec);
    draw();
  }
  function showModel(id, year) {
    const m = byId.get(id);
    if (!m) return false;
    const mine = G.list().find((c) => c.car === id && (!year || c.year === year));
    current = mine ? { car: mine, spec: specOf(mine) } : { car: null, spec: { car: m.id, name: m.name, make: m.make, model: m.model, fuel: m.fuel, year: year || 0, cons: null, m } };
    draw();
    return true;
  }
  function setUrl(s) {
    const u = new URL(location.href);
    if (s.car) { u.searchParams.set("car", s.car); if (s.year) u.searchParams.set("year", s.year); else u.searchParams.delete("year"); }
    else { u.searchParams.delete("car"); u.searchParams.delete("year"); }
    history.replaceState(null, "", u);
  }

  function costBlock(s) {
    const m = s.m, f = s.fuel, rows = [];
    const off = m ? (f === "electric" ? m.kwh_per_100km : m.l_per_100km) : null;
    const use = s.cons || off;
    const fp = prices.fuel && FUEL_PRODUCT[f] ? prices.fuel.products[FUEL_PRODUCT[f]] : null;
    const fuelName = f === "diesel" || f === "phev-diesel" ? T.fuel.diesel : f === "lpg" ? T.fuel.lpg : T.fuel.petrol;
    if (f === "electric" && use) {
      rows.push([eur(use * LOSS * HOME_PRICE), T.home(eur(HOME_PRICE))]);
      if (prices.charge) rows.push([eur(use * LOSS * prices.charge.overall.median), T.pub(eur(prices.charge.overall.median))]);
    } else if (/^phev/.test(f) && m && fp) {
      const kwh = m.kwh_per_100km || 0, l = m.l_per_100km || 0;
      rows.push([eur(kwh * LOSS * HOME_PRICE + (s.cons || l) * fp.eur_per_litre), T.mix]);
    } else if (use && fp) {
      rows.push([eur(use * fp.eur_per_litre), T.fuelAt(fuelName, eur(fp.eur_per_litre, 3))]);
    }
    const readouts = rows.length ? rows.map(([v, b]) => `<div class="ac-readout"><div class="ac-readout__value">${v}</div><div class="ac-readout__basis">${esc(b)}</div></div>`).join("")
      : `<p class="ac-caption">${esc(T.noPrice)}</p>`;
    const facts = [];
    if (s.cons) facts.push(`${T.yours}: ${num(s.cons)} ${T.unit(f === "electric" ? "electric" : "fuel")}`);
    if (m) {
      if (m.kwh_per_100km) facts.push(`${T.official}: ${num(m.kwh_per_100km)} kWh/100 km`);
      if (m.l_per_100km) facts.push(`${T.official}: ${num(m.l_per_100km)} ${T.unit("fuel")}`);
      if (m.co2_g_km != null) facts.push(`${T.co2}: ${m.co2_g_km} g/km`);
      if (m.power_kw) facts.push(`${T.power}: ${m.power_kw} kW`);
      if (m.years && m.year && m.year < catalogYear) facts.push(T.sold(m.years[0], m.years[1], m.year));
    }
    const links = [];
    if (f === "electric") {
      const p = new URLSearchParams({ car: s.name });
      if (s.cons) p.set("lv", [0.9, 1, 1.22, 1.38].map((k) => (s.cons * k).toFixed(1)).join(","));
      links.push(`<a href="${PRE}/ev-cost/?${p}">${esc(T.exact)}</a>`, `<a href="${PRE}/charge-times/">${esc(T.chargeTimes)}</a>`, `<a href="${PRE}/chargers/">${esc(T.chargers)}</a>`);
    } else if (use && (f === "petrol" || f === "diesel")) {
      links.push(`<a href="${PRE}/ev-cost/?own=${use},${f}">${esc(T.compare)}</a>`);
    } else if (/^phev/.test(f)) {
      links.push(`<a href="${PRE}/charge-times/">${esc(T.chargeTimes)}</a>`);
    }
    const own = current.car ? `<label class="ac-param ownc"><span class="ac-param__label">${esc(T.ownCons)}</span><span class="ac-param__box"><input id="own" type="number" min="0.1" max="60" step="0.1" inputmode="decimal" value="${s.cons ?? ""}" placeholder="${off ?? "–"}"><span class="ac-param__unit">${T.unit(f === "electric" ? "electric" : "fuel")}</span></span><span class="ac-param__hint">${esc(T.ownHint)}</span></label>` : "";
    return `<section class="ac-card"><h3 class="ac-card__title">${esc(T.cost)}</h3><div class="ac-readouts">${readouts}</div>
      ${facts.length ? `<p class="ac-caption" style="margin:0">${facts.map(esc).join(" · ")}</p>` : ""}${own}
      ${links.length ? `<ul class="links">${links.map((l) => `<li>${l}</li>`).join("")}</ul>` : ""}</section>`;
  }

  /* recalls: the brand's Safety Gate alerts that name this model, as on the recalls page (rules in garage.js) */
  function modelPart(s) { return G.recallModel(s.make, s.model); }
  const names = (a, s) => G.recallNames(a, s.make, s.model);
  const fits = (a, y) => G.recallFits(a, y);
  async function recallBlock(s) {
    const slug = G.recallBrand(s.make);
    const b = recallBrands && recallBrands.brands.find((x) => x.slug === slug);
    const key = modelPart(s);
    const href = `${PRE}/recalls/?brand=${encodeURIComponent(slug)}${key ? `&model=${encodeURIComponent(key)}` : ""}${s.year ? `&year=${s.year}` : ""}`;
    let body;
    if (!b) body = `<p class="ac-caption">${esc(T.recallsNone)}</p>`;
    else {
      const data = await soft(`/data/recalls/eu/${b.file}`);
      const hits = (data ? data.alerts : []).filter((a) => names(a, s)).sort((x, y) => (y.date || "").localeCompare(x.date || ""));
      const inYear = s.year ? hits.filter((a) => fits(a, s.year)) : [];
      const top = (s.year && inYear.length ? inYear : hits).slice(0, 3);
      body = hits.length
        ? `<div class="ac-readouts"><div class="ac-readout"><div class="ac-readout__value">${hits.length}</div><div class="ac-readout__basis">${esc(T.recallsN(hits.length))}</div></div>
           ${s.year ? `<div class="ac-readout"><div class="ac-readout__value">${inYear.length}</div><div class="ac-readout__basis">${esc(T.recallsYear(inYear.length, s.year))}</div></div>` : ""}</div>
           <ul class="rlist">${top.map((a) => `<li><a href="${esc(a.url)}" rel="noopener">${esc(a.risk || a.product)}${a.recall_code ? ` · ${esc(a.recall_code)}` : ""}</a><small>${day(a.date)}${a.production ? ` · ${esc(a.production)}` : ""}</small></li>`).join("")}</ul>`
        : `<p class="ac-caption">${esc(T.recallsNone)}</p>`;
    }
    return `<section class="ac-card"><h3 class="ac-card__title">${esc(T.recalls)}</h3>${body}
      <ul class="links"><li><a href="${href}">${esc(b ? T.recallsAll : T.recallsBrand(s.make))}</a></li></ul></section>`;
  }

  async function regBlock(s) {
    const key = G.modelKey(s.make, s.model);
    const r = regs && regs.models.find((x) => x.model !== "SONSTIGE" && G.modelKey(x.brand, x.model) === key);
    if (!r) return `<section class="ac-card"><h3 class="ac-card__title">${esc(T.regs)}</h3><p class="ac-caption">${esc(T.regsNone)}</p>
      <ul class="links"><li><a href="${PRE}/registrations/">${esc(T.regsMore)}</a></li></ul></section>`;
    const data = await soft(AlloSite.data("registrations", r.file));
    const months = data ? data.months.slice(-24) : [];
    const max = Math.max(1, ...months.map((x) => x.total || 0)), w = 100 / Math.max(months.length, 1);
    const spark = months.length ? `<svg class="spark" viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label="${esc(T.perMonth)}">${months.map((x, i) => `<rect x="${(i * w + w * 0.15).toFixed(2)}" width="${(w * 0.7).toFixed(2)}" y="${(40 - 38 * (x.total || 0) / max).toFixed(2)}" height="${(38 * (x.total || 0) / max).toFixed(2)}"><title>${x.month}: ${(x.total || 0).toLocaleString(T.locale)}</title></rect>`).join("")}</svg><p class="ac-caption" style="margin:4px 0 0">${esc(T.perMonth)}</p>` : "";
    return `<section class="ac-card"><h3 class="ac-card__title">${esc(T.regs)}</h3>
      <div class="ac-readouts"><div class="ac-readout"><div class="ac-readout__value">${(r.last_12_months || 0).toLocaleString(T.locale)}</div><div class="ac-readout__basis">${esc(T.regsYear)}${r.rank ? ` · ${esc(T.regsRank(r.rank))}` : ""}</div></div></div>
      ${spark}<ul class="links"><li><a href="${PRE}/registrations/?model=${encodeURIComponent(r.slug)}">${esc(T.regsMore)}</a></li></ul></section>`;
  }

  /* compare basket (garage.js): add this model, then open /compare/ */
  function cmpHtml(s) {
    if (!s.car) return "";
    const ids = G.compare.list(), on = ids.includes(s.car);
    return `<button type="button" class="ac-btn ac-btn--ghost" id="cmp" aria-pressed="${on}">${esc(on ? T.cmpIn : T.cmpAdd)}</button>`
      + (ids.length > 1 || (ids.length === 1 && !on) ? `<a class="ac-btn ac-btn--primary" href="${PRE}/compare/?cars=${(on ? ids : [...ids, s.car]).slice(-G.compare.MAX).map(encodeURIComponent).join(",")}">${esc(T.cmpGo(on ? ids.length : Math.min(ids.length + 1, G.compare.MAX)))}</a>` : "");
  }
  addEventListener("ac:compare", () => { const r = $("cmp-row"); if (r && current) r.innerHTML = cmpHtml(current.spec); });

  let drawing = 0;
  async function draw() {
    drawGarage();
    const s = current.spec, me = ++drawing;
    const title = current.car && current.car.nick ? `${current.car.nick} · ${s.name}` : s.name;
    const sub = [T.fuel[s.fuel] || s.fuel, s.year ? T.reg(s.year) : "", !current.car && !G.list().length ? T.example : ""].filter(Boolean).join(" · ");
    const acts = current.car
      ? `<span class="ac-status ac-status--ok">${esc(T.saved)}</span><button type="button" class="ac-btn ac-btn--ghost" id="remove">${esc(T.remove)}</button>`
      : `<button type="button" class="ac-btn ac-btn--gold" id="keep">${esc(T.addThis)}</button>`;
    const headHtml = `<section class="ac-card"><div class="head"><div><h2 class="ac-card__title">${esc(title)}</h2><p class="ac-card__desc" style="margin:4px 0 0">${esc(sub)}</p></div><div class="acts">${acts}</div></div><div class="acts cmp" id="cmp-row">${cmpHtml(s)}</div></section>`;
    $("profile").innerHTML = `<div class="stack">${headHtml}<div class="cards">${costBlock(s)}<section class="ac-card"><p class="ac-caption">…</p></section><section class="ac-card"><p class="ac-caption">…</p></section></div></div>`;
    const [rc, rg] = await Promise.all([recallBlock(s).catch((e) => ""), regBlock(s).catch((e) => "")]);
    if (me !== drawing) return;
    const cards = $("profile").querySelector(".cards");
    cards.innerHTML = costBlock(s) + rc + rg;
  }
  $("profile").addEventListener("click", (e) => {
    if (e.target.id === "cmp") { G.compare.toggle(current.spec.car); return; }
    if (e.target.id === "keep") { const s = current.spec; showSaved(G.add({ car: s.car, name: s.name, make: s.make, model: s.model, fuel: s.fuel, year: s.year }), true); }
    if (e.target.id === "remove") {
      G.remove(current.car.id);
      const next = G.active();
      if (next) showSaved(next, true); else { current = { car: null, spec: current.spec }; draw(); }
    }
  });
  $("profile").addEventListener("change", (e) => {
    if (e.target.id !== "own" || !current.car) return;
    const v = Number(e.target.value) || null;
    G.update(current.car.id, { cons: v });
    showSaved(G.get(current.car.id), false);
  });

  async function load() {
    const [cat, fuel, charge, rg, rb] = await Promise.all([
      json(AlloSite.data("vehicle-catalog", "models.json")),
      soft(AlloSite.data("fuel-prices", "latest.json")),
      soft(AlloSite.data("charging-prices", "latest.json")),
      soft(AlloSite.data("registrations", "models.json")),
      soft("/data/recalls/eu/brands.json"),
    ]);
    catalogYear = cat.year || 0; catalog = cat.models; byId = new Map(catalog.map((m) => [m.id, m]));
    prices = { fuel, charge }; regs = rg; recallBrands = rb;
    const u = new URLSearchParams(location.search);
    if (u.get("car") && showModel(u.get("car"), Number(u.get("year")) || 0)) return;
    const a = G.active();
    if (a) return showSaved(a, false);
    showModel("volvo-ex30", 0) || showModel(catalog[0].id, 0);
  }
  addEventListener("ac:garage", () => drawGarage());
  load().catch((e) => { $("profile").innerHTML = `<section class="ac-card"><p class="ac-caption">${T.failed}${esc(e.message)}</p></section>`; });
})();
