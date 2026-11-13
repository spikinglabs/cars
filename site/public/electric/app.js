/* Buying an electric car: one entry page that answers the buyer's five questions with live numbers and links
   each answer to the full tool. One script for /electric/, /de/electric/ and /zh/electric/.
   Link parameters: income=<taxable household income, €>, kids=0|1|2 (shared with /ev-grant/). */
(() => {
  const G = window.EvGrant, A = window.AlloCars;
  const lang = (document.documentElement.lang || "en").slice(0, 2);
  const de = lang === "de", zh = lang === "zh";
  const pre = de ? "/de" : zh ? "/zh" : "";
  const T = zh ? {
    locale: "zh-CN", basis: (d) => `纯电动车，规则截至 ${d}`, get: "你可以拿到", upTo: "最多", none: "没有补贴", enter: "填写收入看具体金额",
    overCap: (c) => `收入超过你家的上限 ${c}`,
    home: "在家充电", homeBasis: (p) => `按 ${p}/kWh 的家庭电价，另加 10% 充电损耗`, pub: "公共充电（即充即付）", pubBasis: (p) => `按今天的中位价 ${p}/kWh，另加 10% 充电损耗`,
    petrol: "汽油车", petrolBasis: (p) => `按本周 ${p}/L 的 95 号汽油`, mine: (n) => `你的 ${n}`, mineBasis: (l, p, d, off) => `${l} L/100 km${off ? "（官方数值）" : ""}，本周${d ? "柴油" : "95 号汽油"} ${p}/L`, per100: "/100 km",
    costAsof: (w) => `油价为 ${w} 那一周的全国平均价，充电价为所有已公布即充即付资费的中位数。`,
    points: "公共充电点", fast: "其中快充（50 kW 以上）", perPoint: "每个充电点对应的电动车", chAsof: (d) => `联邦网络局（Bundesnetzagentur）充电桩登记，截至 ${d}。`,
    topAsof: (m) => `KBA 新车登记，${m}。`, regs: (n) => `${n} 辆`,
    hv: "近一年欧洲高压电池和充电相关召回", allCars: "近一年所有乘用车召回", recAsof: "",
  } : de ? {
    locale: "de-DE", basis: (d) => `für ein reines E-Auto, Regeln mit Stand ${d}`, get: "Du bekommst", upTo: "Bis zu", none: "Keine Förderung", enter: "Einkommen eintragen für den genauen Betrag",
    overCap: (c) => `Einkommen über der Grenze für deinen Haushalt von ${c}`,
    home: "Zu Hause laden", homeBasis: (p) => `mit Haushaltsstrom für ${p}/kWh, plus 10 % Ladeverluste`, pub: "Öffentlich laden (ad hoc)", pubBasis: (p) => `zum heutigen Median von ${p}/kWh, plus 10 % Ladeverluste`,
    petrol: "Benziner", petrolBasis: (p) => `mit Super E5 zu ${p}/L diese Woche`, mine: (n) => `Dein ${n}`, mineBasis: (l, p, d, off) => `${l} L/100 km${off ? " (offizieller Wert)" : ""}, ${d ? "Diesel" : "Super E5"} zu ${p}/L diese Woche`, per100: "/100 km",
    costAsof: (w) => `Spritpreis: Bundesdurchschnitt der Woche ab ${w}. Ladepreis: Median aller veröffentlichten Ad-hoc-Tarife.`,
    points: "Öffentliche Ladepunkte", fast: "davon Schnelllader (ab 50 kW)", perPoint: "E-Autos pro Ladepunkt", chAsof: (d) => `Ladesäulenregister der Bundesnetzagentur, Stand ${d}.`,
    topAsof: (m) => `Neuzulassungen laut KBA, ${m}.`, regs: (n) => `${n}`,
    hv: "Rückrufe zu Hochvoltbatterie und Laden in Europa, letzte 12 Monate", allCars: "Pkw-Rückrufe insgesamt, letzte 12 Monate", recAsof: "",
  } : {
    locale: "en-GB", basis: (d) => `for a fully electric car, rules as of ${d}`, get: "You get", upTo: "Up to", none: "No grant", enter: "Enter your income for the exact amount",
    overCap: (c) => `Income above your household's limit of ${c}`,
    home: "Charging at home", homeBasis: (p) => `with household power at ${p}/kWh, plus 10% charging losses`, pub: "Public charging (ad hoc)", pubBasis: (p) => `at today's median of ${p}/kWh, plus 10% charging losses`,
    petrol: "Petrol car", petrolBasis: (p) => `with Super 95 at ${p}/L this week`, mine: (n) => `Your ${n}`, mineBasis: (l, p, d, off) => `${l} L/100 km${off ? " (official figure)" : ""}, ${d ? "diesel" : "Super 95"} at ${p}/L this week`, per100: "/100 km",
    costAsof: (w) => `Fuel: national average for the week of ${w}. Charging: median of every published ad-hoc tariff.`,
    points: "Public charge points", fast: "of them fast (50 kW and up)", perPoint: "Electric cars per charge point", chAsof: (d) => `Bundesnetzagentur charge point register, as of ${d}.`,
    topAsof: (m) => `New registrations from the KBA, ${m}.`, regs: (n) => `${n}`,
    hv: "Recalls for high-voltage batteries and charging in Europe, last 12 months", allCars: "Car recalls of all kinds, last 12 months", recAsof: "",
  };
  const $ = (id) => document.getElementById(id);
  const eur = (v, d = 2) => new Intl.NumberFormat(T.locale, { style: "currency", currency: "EUR", minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
  const n0 = (v) => Number(v).toLocaleString(T.locale, { maximumFractionDigits: 0 });
  const n1 = (v) => Number(v).toLocaleString(T.locale, { maximumFractionDigits: 1 });
  const date = (iso) => new Date(iso.slice(0, 10) + "T12:00:00Z").toLocaleDateString(T.locale, { day: "numeric", month: "long", year: "numeric" });
  const month = (ym) => new Date(ym + "-15T12:00:00Z").toLocaleDateString(T.locale, { month: "long", year: "numeric" });
  const fact = (value, label, basis) => `<div class="ac-readout ac-readout--md"><span class="ac-readout__value">${value}</span><span class="ac-readout__basis">${A.esc(label)}${basis ? " · " + A.esc(basis) : ""}</span></div>`;
  const get = (dataset, file) => fetch(AlloSite.data(dataset, file)).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });

  /* 1 grant: shares its inputs with /ev-grant/ (same URL parameters and the same stored state) */
  const KEY = "allo-cars-ev-grant";
  let stored = new URLSearchParams();
  try { stored = new URLSearchParams(localStorage.getItem(KEY) || ""); } catch (e) {}
  const q = new URLSearchParams(location.search);
  const src = q.has("income") || q.has("kids") ? q : stored;
  const S = { income: /^\d{1,7}$/.test(src.get("income") || "") ? src.get("income") : "", kids: Math.max(0, Math.min(2, parseInt(src.get("kids"), 10) || 0)) };
  function grant() {
    document.querySelectorAll("#kids button").forEach((b) => b.setAttribute("aria-pressed", +b.dataset.kids === S.kids));
    const r = G.compute({ drive: "bev", income: S.income, kids: S.kids });
    let html;
    if (r.amount == null) html = `<span class="ac-readout__value"><small>${T.upTo} </small>${eur(r.max, 0)}</span><span class="ac-readout__basis">${T.enter}</span>`;
    else if (r.amount > 0) html = `<span class="ac-readout__value"><small>${T.get} </small>${eur(r.amount, 0)}</span><span class="ac-readout__basis">${A.esc(T.basis(date(G.RULES.as_of)))}</span>`;
    else html = `<span class="ac-readout__value" style="color:var(--ink-muted)">${T.none}</span><span class="ac-readout__basis">${A.esc(T.overCap(eur(r.cap, 0)))}</span>`;
    $("grant").innerHTML = html;
    const p = new URLSearchParams();
    if (S.kids) p.set("kids", S.kids);
    if (S.income !== "") p.set("income", S.income);
    const s = p.toString();
    $("grant-go").href = pre + "/ev-grant/" + (s ? "?" + s : "");
    try { history.replaceState(null, "", location.pathname + (s ? "?" + s : "")); } catch (e) {}
    // keep the grant page's other inputs (drive, registration date) when saving
    const keep = new URLSearchParams(stored.toString());
    ["income", "kids"].forEach((k) => keep.delete(k));
    p.forEach((v, k) => keep.set(k, v));
    try { localStorage.setItem(KEY, keep.toString()); } catch (e) {}
  }
  $("income").value = S.income;
  $("income").addEventListener("input", () => { S.income = $("income").value.replace(/\D/g, ""); grant(); });
  $("kids").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; S.kids = +b.dataset.kids; grant(); });
  grant();

  /* 2 cost per 100 km: typical EV vs typical petrol car */
  // same rule as the car page, Compare and the charging cost tool: official figure plus 10 % charging losses
  const EV_KWH = 17, LOSS = 1.1, PETROL_L = 6.5, HOME = 0.35;
  // a petrol or diesel car in "My cars" replaces the typical petrol car: your own figure, else its official one
  // (garage.js comes with the header, deferred: it is there once the document has loaded)
  const ready = document.readyState === "loading" ? new Promise((r) => addEventListener("DOMContentLoaded", r)) : Promise.resolve();
  const catalogP = get("vehicle-catalog", "models.json").catch(() => null);
  Promise.all([get("charging-prices", "latest.json").catch(() => null), get("fuel-prices", "latest.json").catch(() => null), catalogP, ready]).then(([c, f, cat]) => {
    const AG = window.AlloGarage, mine = AG && AG.list().filter((x) => (x.fuel === "petrol" || x.fuel === "diesel") && (x.cons || x.car))[0];
    const pub = c && c.overall && c.overall.median, price = (k) => f && f.products && f.products[k] && f.products[k].eur_per_litre;
    const off = mine && cat ? (cat.models || []).find((m) => m.id === mine.car) : null;
    const myL = mine ? mine.cons || (off && off.l_per_100km) : null;
    let html = fact(eur(EV_KWH * LOSS * HOME) + `<small>${T.per100}</small>`, T.home, T.homeBasis(eur(HOME)));
    if (pub) html += fact(eur(EV_KWH * LOSS * pub) + `<small>${T.per100}</small>`, T.pub, T.pubBasis(eur(pub)));
    if (myL && price(mine.fuel === "diesel" ? "diesel" : "euro_super_95")) {
      const p = price(mine.fuel === "diesel" ? "diesel" : "euro_super_95");
      html += fact(eur(myL * p) + `<small>${T.per100}</small>`, T.mine(mine.name || mine.nick), T.mineBasis(n1(myL), eur(p, 3), mine.fuel === "diesel", !mine.cons));
    } else if (price("euro_super_95")) html += fact(eur(PETROL_L * price("euro_super_95")) + `<small>${T.per100}</small>`, T.petrol, T.petrolBasis(eur(price("euro_super_95"), 3)));
    $("cost").innerHTML = html;
    if (f && f.week) $("cost-asof").textContent = T.costAsof(date(f.week));
  });

  /* 3 public charging in numbers */
  get("chargers", "stats.json").then((s) => {
    const t = s.totals || {};
    $("chargers").innerHTML = fact(n0(t.points), T.points) + fact(n0(t.fast_points), T.fast) + fact(n1(t.bev_per_point), T.perPoint);
    if (s.observed_at) $("chargers-asof").textContent = T.chAsof(date(s.observed_at));
  }).catch(() => {});

  /* 4 most registered electric models last month */
  Promise.all([get("registrations", "latest.json"), catalogP, ready]).then(([j, cat]) => {
    const top = (j.top_electric || []).slice().sort((a, b) => b.bev - a.bev).slice(0, 8);
    // KBA writes names in capitals: same readable form as on /registrations/ (BMW, ID.3 and CX-30 stay as they are)
    const KEEP = new Set(["BMW", "VW", "MG", "DS", "BYD", "GWM", "KGM", "NIO", "AMG", "GT", "SUV", "UP"]);
    const word = (w) => w.split("-").map((p) => /\d/.test(p) || p.replace(/\W/g, "").length <= 3 || KEEP.has(p) ? p : p.charAt(0) + p.slice(1).toLowerCase()).join("-");
    const name = (m) => [m.brand, m.model].map((x) => String(x).split(" ").map(word).join(" ")).join(" ");
    // each model opens its car page (consumption, grant, recalls, registrations), or its registrations if the catalog lacks it
    const G = window.AlloGarage, list = cat && cat.models || [];
    const href = (m) => { const c = G && list.length ? G.catalogFor(list, m.brand, m.model, "electric") : null;
      return c ? `${pre}/car/?car=${encodeURIComponent(c.id)}` : `${pre}/registrations/?model=${encodeURIComponent(m.slug)}`; };
    $("top").innerHTML = top.map((m, i) => `<li><b>${i + 1}</b><a href="${href(m)}">${A.esc(name(m))}</a><span>${T.regs(n0(m.bev))}</span></li>`).join("");
    $("top-asof").textContent = T.topAsof(month(j.month));
  }).catch(() => {});

  /* 5 recalls on high-voltage batteries */
  fetch("/data/recalls/eu/stats.json").then((r) => r.json()).then((s) => {
    const hv = (s.components || []).find((c) => c.key === "hv_battery");
    const all = (s.components || []).reduce((sum, c) => sum + (c.cars_last_365_days || 0), 0);
    if (hv) $("recalls").innerHTML = fact(n0(hv.cars_last_365_days), T.hv) + fact(n0(all), T.allCars);
  }).catch(() => {});
})();
