/* Rankings: lists of car models joined from the data the site keeps. Best sellers in Germany (KBA),
   the most efficient electric cars and the cheapest cars to run per 100 km (EEA catalog at this
   week's prices), Euro NCAP child occupant scores within the newest protocol that has them, and recalls per 100,000 new cars by brand (Safety Gate and KBA).
   One script for the English (/rankings/), German (/de/rankings/) and Chinese (/zh/rankings/) page.
   Link: ?list=<sellers|month|electric|efficient|cheapest|child|recalls>&fuel=<catalog fuel, cheapest only>
   &seg=<KBA segment key, sellers only>&n=<rows> */
(() => {
  const lang = (document.documentElement.lang || "en").slice(0, 2);
  const de = lang === "de", zh = lang === "zh";
  const PRE = de ? "/de" : zh ? "/zh" : "";
  const T = zh ? {
    locale: "zh-CN", failed: "无法加载数据：", more: "显示更多", cmpAdd: "+ 对比", cmpIn: "✓ 对比中", cmpGo: (n) => `对比 ${n} 款车`, all: "全部",
    fuel: { electric: "纯电动", petrol: "汽油", diesel: "柴油", lpg: "LPG", "phev-petrol": "插电混动（汽油）", "phev-diesel": "插电混动（柴油）" },
    lists: {
      sellers: ["销量榜", "近 12 个月在德国新登记最多的车型（KBA，含所有动力版本）。", "近 12 个月"],
      month: ["月度榜", (m) => `${m} 新登记前 20 名，以及与去年同月相比的变化。`, "本月"],
      electric: ["电动车销量榜", (m) => `${m} 新登记最多的纯电动车型。`, "纯电动"],
      efficient: ["最省电的电动车", "官方电耗 (WLTP，含充电损耗) 最低的纯电动车型，只列近年新车登记 500 辆以上的车型。", "kWh/100 km"],
      cheapest: ["最省钱的车", "按本周德国价格计算每 100 公里费用最低的车型：电动车在家充电，燃油车按全国平均油价。只列 1,000 辆以上新登记的车型。", "每 100 公里"],
      child: ["儿童乘员得分", (p) => `Euro NCAP ${p} 测试规程下的儿童乘员得分，从高到低。不同规程的分数不能直接比较，所以只列这一规程测试的车型。`, "Euro NCAP"],
      recalls: ["召回最少的品牌", "2019 年起每 10 万辆德国新车对应的欧盟安全门汽车召回次数，从少到多。召回是通报次数，不是受影响车辆数。", "每 10 万辆"],
    },
    change: (p) => `${p > 0 ? "+" : ""}${p.toLocaleString("zh-CN", { maximumFractionDigits: 1 })}% 同比`, regsN: (n) => `${n} 辆`, alerts: (n) => `${n} 次召回`, tested: (y) => `${y} 年测试`,
    seg: { minis: "微型车", small: "小型车", compact: "紧凑型车", medium: "中型车", "upper-medium": "中大型车", luxury: "豪华车", suv: "SUV", "off-road": "越野车", sports: "跑车", "mini-van": "小型 MPV", "large-van": "大型 MPV", utility: "多用途车", motorhome: "房车" }, segBasis: (m) => `车型细分按 KBA 的划分（${m}）。`,
    basis: (w, p) => `油价：${w} 当周全国平均 · 电价：家充 0.35 €/kWh 加 10% 损耗${p}`,
  } : de ? {
    locale: "de-DE", failed: "Die Daten konnten nicht geladen werden: ", more: "Mehr zeigen", cmpAdd: "+ Vergleich", cmpIn: "✓ Im Vergleich", cmpGo: (n) => `${n} Autos vergleichen`, all: "Alle",
    fuel: { electric: "Elektro", petrol: "Benzin", diesel: "Diesel", lpg: "Autogas", "phev-petrol": "Plug-in-Hybrid (Benzin)", "phev-diesel": "Plug-in-Hybrid (Diesel)" },
    lists: {
      sellers: ["Meistverkauft", "Die meisten Neuzulassungen in Deutschland in den letzten 12 Monaten (KBA, alle Antriebe zusammen).", "12 Monate"],
      month: ["Dieser Monat", (m) => `Die Top 20 der Neuzulassungen im ${m}, mit der Veränderung zum Vorjahresmonat.`, "Monat"],
      electric: ["E-Autos", (m) => `Die meistzugelassenen Elektroautos im ${m}.`, "Elektro"],
      efficient: ["Sparsamste E-Autos", "Elektroautos mit dem niedrigsten offiziellen Verbrauch (WLTP, mit Ladeverlust), nur Modelle mit mindestens 500 Neuzulassungen in ihrem Jahr.", "kWh/100 km"],
      cheapest: ["Günstigste pro 100 km", "Was 100 km zu den Preisen dieser Woche kosten: Elektro zu Hause geladen, Verbrenner zum Bundesdurchschnitt an der Zapfsäule. Nur Modelle mit mindestens 1.000 Neuzulassungen.", "pro 100 km"],
      child: ["Kindersicherheit", (p) => `Die Euro NCAP Wertung für Kinder als Insassen im Testprotokoll ${p}, die höchste zuerst. Wertungen aus verschiedenen Protokollen sind nicht vergleichbar, darum nur Modelle aus diesem Protokoll.`, "Euro NCAP"],
      recalls: ["Wenigste Rückrufe", "Safety-Gate-Rückrufe für Autos seit 2019 pro 100.000 Neuwagen in Deutschland, je Marke, die wenigsten zuerst. Gezählt werden Rückrufaktionen, nicht betroffene Autos.", "pro 100.000"],
    },
    change: (p) => `${p > 0 ? "+" : ""}${p.toLocaleString("de-DE", { maximumFractionDigits: 1 })} % zum Vorjahr`, regsN: (n) => `${n} Autos`, alerts: (n) => `${n} Rückrufe`, tested: (y) => `getestet ${y}`,
    seg: { minis: "Minis", small: "Kleinwagen", compact: "Kompaktklasse", medium: "Mittelklasse", "upper-medium": "Obere Mittelklasse", luxury: "Oberklasse", suv: "SUVs", "off-road": "Geländewagen", sports: "Sportwagen", "mini-van": "Mini-Vans", "large-van": "Großraum-Vans", utility: "Utilities", motorhome: "Wohnmobile" }, segBasis: (m) => `Segmente wie vom KBA eingeteilt (${m}).`,
    basis: (w, p) => `Sprit: Bundesdurchschnitt der Woche ab ${w} · Strom: zu Hause 0,35 €/kWh plus 10 % Ladeverlust${p}`,
  } : {
    locale: "en-GB", failed: "Could not load data: ", more: "Show more", cmpAdd: "+ Compare", cmpIn: "✓ Comparing", cmpGo: (n) => `Compare ${n} cars`, all: "All",
    fuel: { electric: "Electric", petrol: "Petrol", diesel: "Diesel", lpg: "LPG", "phev-petrol": "Plug-in hybrid (petrol)", "phev-diesel": "Plug-in hybrid (diesel)" },
    lists: {
      sellers: ["Best sellers", "The most new registrations in Germany over the last 12 months (KBA, every drive type together).", "12 months"],
      month: ["This month", (m) => `The top 20 new registrations in ${m}, with the change on the same month a year before.`, "Month"],
      electric: ["Electric best sellers", (m) => `The most registered electric cars in ${m}.`, "Electric"],
      efficient: ["Most efficient EVs", "Electric cars with the lowest official consumption (WLTP, charging losses included), only models with at least 500 new registrations in their year.", "kWh/100 km"],
      cheapest: ["Cheapest per 100 km", "What 100 km costs at this week's prices: electric charged at home, fuel cars at the national average pump price. Only models with at least 1,000 new registrations.", "per 100 km"],
      child: ["Child occupant score", (p) => `Euro NCAP child occupant scores under the ${p} test protocol, highest first. Scores from different protocols are not comparable, so only cars tested under this one are listed.`, "Euro NCAP"],
      recalls: ["Fewest recalls", "EU Safety Gate car recalls since 2019 per 100,000 new cars registered in Germany, by brand, fewest first. These count recall campaigns, not affected cars.", "per 100,000"],
    },
    change: (p) => `${p > 0 ? "+" : ""}${p.toLocaleString("en-GB", { maximumFractionDigits: 1 })}% on last year`, regsN: (n) => `${n} cars`, alerts: (n) => `${n} recalls`, tested: (y) => `tested ${y}`,
    seg: { minis: "Minis", small: "Small cars", compact: "Compact", medium: "Mid-size", "upper-medium": "Upper mid-size", luxury: "Luxury", suv: "SUVs", "off-road": "Off-road", sports: "Sports cars", "mini-van": "Mini-vans", "large-van": "Large vans (MPVs)", utility: "Utilities", motorhome: "Motorhomes" }, segBasis: (m) => `Segments as the KBA assigns them (${m}).`,
    basis: (w, p) => `Fuel: national average, week of ${w} · Electricity: home 0.35 €/kWh plus 10% losses${p}`,
  };
  const G = window.AlloGarage;
  const KEYS = ["sellers", "month", "electric", "efficient", "cheapest", "child", "recalls"];
  const FUELS = ["electric", "petrol", "diesel", "phev-petrol"];
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const int = (v) => Number(v || 0).toLocaleString(T.locale);
  const num = (v, d = 1) => Number(v).toLocaleString(T.locale, { minimumFractionDigits: d, maximumFractionDigits: d });
  const eur = (v) => Number(v).toLocaleString(T.locale, { style: "currency", currency: "EUR" });
  const monthName = (ym) => new Date(ym + "-15T12:00:00Z").toLocaleDateString(T.locale, { month: "long", year: "numeric" });
  const day = (iso) => new Date(iso + "T12:00:00Z").toLocaleDateString(T.locale, { day: "numeric", month: "short", year: "numeric" });
  const json = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(`${u}: ${r.status}`); return r.json(); });
  const soft = (u) => json(u).catch(() => null);
  // KBA writes model names in capitals; show them as people write them, keep short ones (BMW, ID.3)
  const nice = (s) => String(s || "").split(/(\s+|-)/).map((w) => w.length > 3 && !/\d/.test(w) && /[AEIOUY]/.test(w) && w === w.toUpperCase() ? w[0] + w.slice(1).toLowerCase() : w).join("");

  const u0 = new URLSearchParams(location.search);
  const st = {
    list: KEYS.includes(u0.get("list")) ? u0.get("list") : "sellers",
    fuel: FUELS.includes(u0.get("fuel")) ? u0.get("fuel") : "",
    seg: u0.get("seg") && T.seg[u0.get("seg")] ? u0.get("seg") : "",
    n: Math.max(10, Math.min(100, Number(u0.get("n")) || 20)),
  };
  let D = {}, catalog = [], catalogYear = 0;
  // the newest Euro NCAP protocol with a child occupant score (the 2026 protocol has none)
  const childProto = () => (D.ratings ? D.ratings.euro_ncap.models : []).map((x) => x.child && x.child.occupant_pct != null ? x.child.protocol : "").filter(Boolean).sort().pop() || "";

  /* ---------- the lists: rows of { name, href, car (catalog id for compare), value, sub } ---------- */
  function kbaRow(r, value, sub, fuel) {
    const m = G.catalogFor(catalog, r.brand, r.model, fuel);
    const name = `${nice(r.brand)} ${nice(r.model)}`;
    return { name: m ? m.name : name, href: m ? `${PRE}/car/?car=${encodeURIComponent(m.id)}` : `${PRE}/registrations/?model=${encodeURIComponent(r.slug)}`, car: m ? m.id : null, value, sub };
  }
  function rows() {
    const regs = D.regs ? D.regs.models.filter((m) => m.model !== "SONSTIGE") : [];
    const latest = D.latest;
    const current = catalog.filter((m) => m.year === catalogYear || (m.years && m.years[1] >= catalogYear - 1));
    switch (st.list) {
      case "sellers":
        return regs.filter((r) => r.last_12_months && (!st.seg || r.segment === st.seg)).sort((a, b) => b.last_12_months - a.last_12_months)
          .map((r) => kbaRow(r, int(r.last_12_months), [r.rank ? `#${r.rank} ${monthName(D.regs.latest_month)}` : "", !st.seg && r.segment ? T.seg[r.segment] : ""].filter(Boolean).join(" · ")));
      case "month":
        return latest ? latest.top_models.map((r) => kbaRow(r, int(r.total), r.change_vs_last_year_pct == null ? "" : T.change(r.change_vs_last_year_pct))) : [];
      case "electric":
        return regs.filter((r) => r.latest_bev).sort((a, b) => b.latest_bev - a.latest_bev)
          .map((r) => kbaRow(r, int(r.latest_bev), "", "electric"));
      case "efficient":
        return current.filter((m) => m.fuel === "electric" && m.kwh_per_100km && (m.registrations || 0) >= 500)
          .sort((a, b) => a.kwh_per_100km - b.kwh_per_100km || (b.registrations || 0) - (a.registrations || 0))
          .map((m) => ({ name: m.name, href: `${PRE}/car/?car=${encodeURIComponent(m.id)}`, car: m.id, value: `${num(m.kwh_per_100km)} kWh/100 km`, sub: T.regsN(int(m.registrations)) }));
      case "cheapest":
        return current.filter((m) => (m.registrations || 0) >= 1000 && (!st.fuel || m.fuel === st.fuel))
          .map((m) => ({ m, c: G.cost100(m, D.fuel, D.charge).main })).filter((x) => x.c != null).sort((a, b) => a.c - b.c)
          .map(({ m, c }) => ({ name: m.name, href: `${PRE}/car/?car=${encodeURIComponent(m.id)}`, car: m.id, value: eur(c), sub: T.fuel[m.fuel] || m.fuel }));
      case "child": {
        const p = childProto();
        return D.ratings ? D.ratings.euro_ncap.models.filter((x) => x.child && x.child.protocol === p && x.child.occupant_pct != null)
          .sort((a, b) => b.child.occupant_pct - a.child.occupant_pct || b.year - a.year)
          .map((x) => {
            const m = G.catalogFor(catalog, x.make, x.model);
            return { name: m ? m.name : x.name, href: m ? `${PRE}/car/?car=${encodeURIComponent(m.id)}#children` : x.url, car: m ? m.id : null, value: `${x.child.occupant_pct}%`, sub: T.tested(x.year), k: x.child.occupant_pct };
          }) : [];
      }
      case "recalls":
        return D.stats ? D.stats.brands.filter((b) => b.alerts_per_100k != null).sort((a, b) => a.alerts_per_100k - b.alerts_per_100k)
          .map((b) => ({ name: b.brand, href: `${PRE}/recalls/?brand=${encodeURIComponent(b.slug)}`, car: null, value: num(b.alerts_per_100k), sub: T.alerts(int(b.car_alerts)), k: b.alerts_per_100k })) : [];
    }
    return [];
  }

  /* ---------- drawing ---------- */
  function draw() {
    const L = T.lists[st.list];
    $("lists").innerHTML = KEYS.map((k) => `<a class="ac-chip" href="?list=${k}" data-list="${k}" aria-pressed="${k === st.list}">${esc(T.lists[k][0])}</a>`).join("");
    const month = D.latest ? monthName(D.latest.month) : "";
    $("list-h").textContent = L[0];
    $("list-desc").textContent = typeof L[1] === "function" ? L[1](st.list === "child" ? childProto() : month) : L[1];
    // KBA segments that have models in the data, in KBA's order
    const segs = st.list === "sellers" && D.regs ? Object.keys(T.seg).filter((k) => D.regs.models.some((r) => r.segment === k && r.last_12_months)) : [];
    $("fuels").hidden = st.list !== "cheapest" && !segs.length;
    $("fuels").innerHTML = st.list === "cheapest"
      ? ["", ...FUELS].map((f) => `<button type="button" class="ac-chip" data-fuel="${f}" aria-pressed="${f === st.fuel}">${esc(f ? T.fuel[f] : T.all)}</button>`).join("")
      : ["", ...segs].map((k) => `<button type="button" class="ac-chip" data-seg="${k}" aria-pressed="${k === st.seg}">${esc(k ? T.seg[k] : T.all)}</button>`).join("");
    const all = rows(), shown = all.slice(0, st.n);
    // lists ranked on one score (k): equal scores share a place, shown as "=82" on every row of the tie
    const place = (i) => {
      const k = all[i].k;
      if (k == null) return String(i + 1);
      let j = i;
      while (j > 0 && all[j - 1].k === k) j--;
      const tie = j < i || (all[i + 1] && all[i + 1].k === k);
      return `${tie ? "=" : ""}${j + 1}`;
    };
    const basket = G.compare.list();
    $("rank").innerHTML = shown.map((r, i) => `<li><span class="pos">${place(i)}</span><span class="who"><a href="${esc(r.href)}">${esc(r.name)}</a>${r.sub ? `<small>${esc(r.sub)}</small>` : ""}</span><span class="val">${esc(r.value)}</span>${r.car ? `<button type="button" class="ac-chip add" data-car="${esc(r.car)}" aria-pressed="${basket.includes(r.car)}">${esc(basket.includes(r.car) ? T.cmpIn : T.cmpAdd)}</button>` : `<span class="add"></span>`}</li>`).join("");
    $("unit").textContent = L[2];
    $("more").hidden = all.length <= st.n;
    const go = $("go");
    go.hidden = basket.length < 2;
    go.textContent = T.cmpGo(basket.length);
    go.href = `${PRE}/compare/?cars=${basket.map(encodeURIComponent).join(",")}`;
    const pub = D.charge && D.charge.overall ? ` · ${de ? "öffentlich" : zh ? "公共" : "public"} ${eur(D.charge.overall.median)}/kWh` : "";
    $("basis").hidden = st.list !== "cheapest" && !segs.length;
    $("basis").textContent = st.list === "cheapest" ? (D.fuel ? T.basis(day(D.fuel.week), pub) : "")
      : D.regs && D.regs.segments_month ? T.segBasis(monthName(D.regs.segments_month)) : "";
  }
  function setUrl() {
    const u = new URL(location.href);
    u.searchParams.set("list", st.list);
    if (st.fuel && st.list === "cheapest") u.searchParams.set("fuel", st.fuel); else u.searchParams.delete("fuel");
    if (st.seg && st.list === "sellers") u.searchParams.set("seg", st.seg); else u.searchParams.delete("seg");
    if (st.n !== 20) u.searchParams.set("n", st.n); else u.searchParams.delete("n");
    history.replaceState(null, "", u);
  }
  $("lists").addEventListener("click", (e) => {
    const a = e.target.closest("[data-list]");
    if (!a) return;
    e.preventDefault(); st.list = a.dataset.list; st.n = 20; setUrl(); draw();
  });
  $("fuels").addEventListener("click", (e) => {
    const b = e.target.closest("[data-fuel]");
    if (b) { st.fuel = b.dataset.fuel; setUrl(); draw(); }
    const g = e.target.closest("[data-seg]");
    if (g) { st.seg = g.dataset.seg; st.n = 20; setUrl(); draw(); }
  });
  $("rank").addEventListener("click", (e) => {
    const b = e.target.closest("[data-car]");
    if (b) G.compare.toggle(b.dataset.car);
  });
  $("more").addEventListener("click", () => { st.n = Math.min(100, st.n + 30); setUrl(); draw(); });
  addEventListener("ac:compare", () => draw());

  async function load() {
    const [cat, regs, latest, fuel, charge, stats, ratings] = await Promise.all([
      json(AlloSite.data("vehicle-catalog", "models.json")),
      soft(AlloSite.data("registrations", "models.json")),
      soft(AlloSite.data("registrations", "latest.json")),
      soft(AlloSite.data("fuel-prices", "latest.json")),
      soft(AlloSite.data("charging-prices", "latest.json")),
      soft("/data/recalls/eu/stats.json"),
      soft(AlloSite.data("ratings", "ratings.json")),
    ]);
    catalog = cat.models; catalogYear = cat.year || 0;
    D = { regs, latest, fuel, charge, stats, ratings };
    draw();
  }
  load().catch((e) => { $("rank").innerHTML = `<li>${esc(T.failed)}${esc(e.message)}</li>`; });
})();
