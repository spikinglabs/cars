/* Two pages share this script:
   - My cars (/cars/, element #garage present): only the cars someone keeps on this device (assets/garage.js),
     with the full profile of the one picked. ?car= of a car not kept there forwards to the car page.
   - The car page (/car/?car=<catalog id>&v=<version>&year=<first registered>, or ?q=<search>): any model,
     opened from rankings, search, compare …, with "Add to my cars" and "+ Compare".
   The profile joins what the site knows about a model:
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
    mix: "按官方电/油比例，在家充电", noPrice: "没有这种燃料的价格数据", official: "官方能耗 (WLTP)", sold: (a, b, y) => `新车销售：${a === b ? a : `${a}–${b}`} 年（官方数据来自 ${y} 年）`, yours: "你的能耗", co2: "CO₂", range: "纯电续航 (WLTP)", power: "功率",
    ownCons: "我的实际能耗", ownHint: "保存在这辆车上，费用会按它计算。",
    exact: "详细计算充电费用", compare: "和电动车比较", chargeTimes: "最便宜的充电时间", chargers: "附近的充电桩",
    recalls: "召回", recallsN: (n) => `${n} 次召回涉及此车型`, recallsYear: (n, y) => `其中 ${n} 次的生产时间与 ${y} 年首次登记相符`,
    recallsNone: "安全门 (Safety Gate) 中没有找到此车型的召回。", recallsBrand: (b) => `查看 ${b} 的全部召回`, recallsAll: "查看全部召回和购车前要问的问题", recallsMore: (n) => `另有 ${n} 次`, recallsUs: (n) => `美国 ${n} 次召回行动`, parkOutside: "停在室外", recallsEn: "说明为英文原文，见全部召回。",
    comp: { airbags_belts: "安全气囊和安全带", brakes: "制动系统", steering: "转向系统", hv_battery: "高压电池和充电", fuel: "燃油系统", engine_drive: "发动机和传动系统", wheels_suspension: "车轮、轮胎和悬架", electrical: "电气系统和线束", software_assist: "软件、摄像头和辅助系统", lights_view: "灯光、雨刮和视野", body_seats: "车身、车门和座椅", emissions: "排放", approval: "认证和文件", other: "其他" },
    risk: { Injuries: "受伤", Fire: "起火", Burns: "烧伤", "Electric shock": "触电", Environment: "环境", Chemical: "化学", Cuts: "割伤" },
    regs: "在德国的新车登记", regsYear: "过去 12 个月新登记", regsRank: (r) => `上月排名第 ${r}`, regsNone: "登记统计中没有单独列出此车型。", regsMore: "每月登记量和排名", regsSeg: (x) => `KBA 车型细分：${x}`, seg: { minis: "微型车", small: "小型车", compact: "紧凑型车", medium: "中型车", "upper-medium": "中大型车", luxury: "豪华车", suv: "SUV", "off-road": "越野车", sports: "跑车", "mini-van": "小型 MPV", "large-van": "大型 MPV", utility: "多用途车", motorhome: "房车" },
    perMonth: "每月新登记，近 24 个月", similar: "同类车型", similarDesc: "动力类型相同、重量和功率相近、仍在销售的车型。", cmpThese: "和它们对比", cmpShort: "+ 对比", cmpOn: "✓ 对比中", badgeEff: (n) => `最省电电动车第 ${n} 名`, badgeCheap: (n) => `每 100 公里最省钱第 ${n} 名`, badgeSell: (n) => `德国销量第 ${n} 名`, rankingsAll: "全部排行榜", ratings: "评级", euro: "Euro NCAP 安全", green: "Green NCAP 环保", adac: "ADAC 故障率", tested: (y) => `${y} 年测试`, testedV: (y, v) => `${y} 年测试：${v}`, notTested: "没有找到这个车型的测试结果。", adacUnit: "每 1,000 辆车的道路救援次数，按首次登记年份", adacYear: (y, v, c) => `首次登记 ${y} 年：每 1,000 辆 ${v} 次（${c} 年）`, adacNone: "ADAC 故障统计没有单独列出这个车型（车辆数太少或车型太新）。", ratingsNote: "只显示总评级和年份，完整结果请看来源网站。", cmpAdd: "+ 加入对比", cmpIn: "✓ 已加入对比", cmpGo: (n) => `对比 ${n} 款车`, unit: (f) => f === "electric" ? "kWh/100 km" : "升/100 km",
    versions: "版本", versionsDesc: "按登记的每个版本及其官方数据。选择你的版本，费用和数据会按它计算。", allVersions: "所有版本（平均）", older: (n) => `另外 ${n} 个已停售的版本`, mass: "整备质量", names: "登记名称", codes: "变体代码（行驶证 D.2）",
  } : de ? {
    locale: "de-DE", failed: "Die Daten konnten nicht geladen werden: ", example: "Beispiel", addThis: "Zu meinen Autos", remove: "Entfernen", saved: "In deinen Autos",
    fuel: { electric: "Elektro", petrol: "Benzin", diesel: "Diesel", lpg: "Autogas", "phev-petrol": "Plug-in-Hybrid (Benzin)", "phev-diesel": "Plug-in-Hybrid (Diesel)", hydrogen: "Wasserstoff" },
    reg: (y) => `Erstzulassung ${y}`, noModel: "Kein Modell gefunden. Wähle „Mein Auto ist nicht in der Liste“.", needName: "Wähle ein Modell oder trag Marke und Modell ein.",
    cost: "Kosten pro 100 km", home: (p) => `Zu Hause geladen, ${p}/kWh`, pub: (p) => `Öffentlich ad hoc, Median ${p}/kWh`, fuelAt: (f, p) => `${f}, ${p}/l`,
    mix: "Offizieller Strom-/Kraftstoffmix, zu Hause geladen", noPrice: "Für diesen Kraftstoff haben wir keine Preise", official: "Offizieller Verbrauch (WLTP)", sold: (a, b, y) => `Neu verkauft ${a === b ? a : `${a}–${b}`} (offizielle Werte von ${y})`, yours: "Dein Verbrauch", co2: "CO₂", range: "Elektrische Reichweite (WLTP)", power: "Leistung",
    ownCons: "Mein echter Verbrauch", ownHint: "Wird bei diesem Auto gespeichert und für die Kosten genutzt.",
    exact: "Ladekosten genau ausrechnen", compare: "Mit einem E-Auto vergleichen", chargeTimes: "Günstigste Ladezeit", chargers: "Ladesäulen in der Nähe",
    recalls: "Rückrufe", recallsN: (n) => `${n} ${n === 1 ? "Rückruf nennt" : "Rückrufe nennen"} dieses Modell`, recallsYear: (n, y) => `${n} davon passen zur Erstzulassung ${y}`,
    recallsNone: "Safety Gate nennt keine Rückrufe für dieses Modell.", recallsBrand: (b) => `Alle Rückrufe von ${b}`, recallsAll: "Alle Rückrufe und was du vor dem Kauf fragen solltest", recallsMore: (n) => `und ${n} weitere`, recallsUs: (n) => `${n} ${n === 1 ? "Rückrufaktion" : "Rückrufaktionen"} in den USA`, parkOutside: "Draußen parken", recallsEn: "Die Beschreibungen gibt es nur im englischen Original, unter Alle Rückrufe.",
    comp: { airbags_belts: "Airbags und Gurte", brakes: "Bremsen", steering: "Lenkung", hv_battery: "Hochvoltbatterie und Laden", fuel: "Kraftstoffsystem", engine_drive: "Motor und Antrieb", wheels_suspension: "Räder, Reifen und Fahrwerk", electrical: "Elektrik und Kabel", software_assist: "Software, Kameras und Assistenten", lights_view: "Licht, Wischer und Sicht", body_seats: "Karosserie, Türen und Sitze", emissions: "Abgase", approval: "Zulassung und Papiere", other: "Sonstiges" },
    risk: { Injuries: "Verletzungen", Fire: "Brand", Burns: "Verbrennungen", "Electric shock": "Stromschlag", Environment: "Umwelt", Chemical: "Chemisch", Cuts: "Schnittverletzungen" },
    regs: "Neuzulassungen in Deutschland", regsYear: "Neu in den letzten 12 Monaten", regsRank: (r) => `im letzten Monat Platz ${r}`, regsNone: "Die Zulassungsstatistik führt dieses Modell nicht einzeln.", regsMore: "Zulassungen pro Monat und Rangliste", regsSeg: (x) => `KBA-Segment: ${x}`, seg: { minis: "Minis", small: "Kleinwagen", compact: "Kompaktklasse", medium: "Mittelklasse", "upper-medium": "Obere Mittelklasse", luxury: "Oberklasse", suv: "SUVs", "off-road": "Geländewagen", sports: "Sportwagen", "mini-van": "Mini-Vans", "large-van": "Großraum-Vans", utility: "Utilities", motorhome: "Wohnmobile" },
    perMonth: "Neuzulassungen pro Monat, letzte 24 Monate", similar: "Ähnliche Autos", similarDesc: "Gleicher Antrieb, ähnliches Gewicht und ähnliche Leistung, noch neu zu kaufen.", cmpThese: "Mit diesen vergleichen", cmpShort: "+ Vergleich", cmpOn: "✓ Im Vergleich", badgeEff: (n) => `Platz ${n} der sparsamsten E-Autos`, badgeCheap: (n) => `Platz ${n} der günstigsten pro 100 km`, badgeSell: (n) => `Platz ${n} der Neuzulassungen`, rankingsAll: "Alle Ranglisten", ratings: "Bewertungen", euro: "Euro NCAP Sicherheit", green: "Green NCAP Umwelt", adac: "ADAC Pannenstatistik", tested: (y) => `getestet ${y}`, testedV: (y, v) => `getestet ${y}: ${v}`, notTested: "Kein Testergebnis für dieses Modell gefunden.", adacUnit: "Pannen pro 1.000 Autos nach Erstzulassungsjahr", adacYear: (y, v, c) => `Erstzulassung ${y}: ${v} Pannen pro 1.000 Autos (${c})`, adacNone: "Die ADAC-Pannenstatistik führt dieses Modell nicht (zu wenige Autos oder zu neu).", ratingsNote: "Nur die Gesamtwertung und das Jahr; das ganze Ergebnis steht beim jeweiligen Anbieter.", cmpAdd: "+ Vergleichen", cmpIn: "✓ Im Vergleich", cmpGo: (n) => `${n} Autos vergleichen`, unit: (f) => f === "electric" ? "kWh/100 km" : "l/100 km",
    versions: "Versionen", versionsDesc: "Jede Version, wie sie zugelassen wurde, mit eigenen offiziellen Werten. Wähle deine, dann rechnen Kosten und Werte mit ihr.", allVersions: "Alle Versionen (Durchschnitt)", older: (n) => `${n} ältere Versionen, nicht mehr neu zu kaufen`, mass: "Leergewicht", names: "Zugelassen als", codes: "Variante (Feld D.2 im Fahrzeugschein)",
  } : {
    locale: "en-GB", failed: "Could not load data: ", example: "Example", addThis: "Add to my cars", remove: "Remove", saved: "In your cars",
    fuel: { electric: "Electric", petrol: "Petrol", diesel: "Diesel", lpg: "LPG", "phev-petrol": "Plug-in hybrid (petrol)", "phev-diesel": "Plug-in hybrid (diesel)", hydrogen: "Hydrogen" },
    reg: (y) => `First registered ${y}`, noModel: "No model found. Choose “My car is not in the list”.", needName: "Pick a model, or type make and model.",
    cost: "Cost per 100 km", home: (p) => `Charged at home, ${p}/kWh`, pub: (p) => `Public ad hoc, median ${p}/kWh`, fuelAt: (f, p) => `${f}, ${p}/L`,
    mix: "Official electric/fuel mix, charged at home", noPrice: "We have no prices for this fuel", official: "Official consumption (WLTP)", sold: (a, b, y) => `Sold new ${a === b ? a : `${a}–${b}`} (official figures from ${y})`, yours: "Your consumption", co2: "CO₂", range: "Electric range (WLTP)", power: "Power",
    ownCons: "My real consumption", ownHint: "Saved with this car and used for the cost.",
    exact: "Work out the charging cost in detail", compare: "Compare with an electric car", chargeTimes: "Cheapest time to charge", chargers: "Chargers near you",
    recalls: "Recalls", recallsN: (n) => `${n} ${n === 1 ? "recall names" : "recalls name"} this model`, recallsYear: (n, y) => `${n} of them match first registration in ${y}`,
    recallsNone: "Safety Gate lists no recalls for this model.", recallsBrand: (b) => `All ${b} recalls`, recallsAll: "All recalls, and what to ask before you buy", recallsMore: (n) => `and ${n} more`, recallsUs: (n) => `${n} US ${n === 1 ? "campaign" : "campaigns"}`, parkOutside: "Park outside", recallsEn: "",
    comp: { airbags_belts: "Airbags and seat belts", brakes: "Brakes", steering: "Steering", hv_battery: "High-voltage battery and charging", fuel: "Fuel system", engine_drive: "Engine and drivetrain", wheels_suspension: "Wheels, tyres and suspension", electrical: "Electrical system and wiring", software_assist: "Software, cameras and assistance systems", lights_view: "Lights, wipers and visibility", body_seats: "Body, doors and seats", emissions: "Emissions", approval: "Approval and paperwork", other: "Other" },
    risk: {},
    regs: "New registrations in Germany", regsYear: "New in the last 12 months", regsRank: (r) => `rank ${r} last month`, regsNone: "The registration statistics don't list this model on its own.", regsMore: "Registrations per month and rankings", regsSeg: (x) => `KBA segment: ${x}`, seg: { minis: "Minis", small: "Small cars", compact: "Compact", medium: "Mid-size", "upper-medium": "Upper mid-size", luxury: "Luxury", suv: "SUVs", "off-road": "Off-road", sports: "Sports cars", "mini-van": "Mini-vans", "large-van": "Large vans (MPVs)", utility: "Utilities", motorhome: "Motorhomes" },
    perMonth: "New registrations per month, last 24 months", similar: "Similar cars", similarDesc: "Same kind of drive, close in weight and power, still sold new.", cmpThese: "Compare with these", cmpShort: "+ Compare", cmpOn: "✓ Comparing", badgeEff: (n) => `No. ${n} most efficient EV`, badgeCheap: (n) => `No. ${n} cheapest per 100 km`, badgeSell: (n) => `No. ${n} best seller in Germany`, rankingsAll: "All rankings", ratings: "Ratings", euro: "Euro NCAP safety", green: "Green NCAP environment", adac: "ADAC breakdowns", tested: (y) => `tested ${y}`, testedV: (y, v) => `tested ${y}: ${v}`, notTested: "No test result found for this model.", adacUnit: "Breakdowns per 1,000 cars by year of first registration", adacYear: (y, v, c) => `First registered ${y}: ${v} breakdowns per 1,000 cars (${c})`, adacNone: "The ADAC breakdown statistics don\u2019t list this model (too few cars or too new).", ratingsNote: "Only the overall rating and year; the full result is at each source.", cmpAdd: "+ Compare", cmpIn: "✓ In comparison", cmpGo: (n) => `Compare ${n} cars`, unit: (f) => f === "electric" ? "kWh/100 km" : "L/100 km",
    versions: "Versions", versionsDesc: "Each version as registered, with its own official figures. Pick yours and the cost and figures use it.", allVersions: "All versions (average)", older: (n) => `${n} older versions, no longer sold new`, mass: "Kerb weight", names: "Registered as", codes: "Variant code (field D.2 of the German registration certificate)",
  };
  /* words for the sections added to make each car page complete: jump links, grant, rankings, search results */
  const W = zh ? {
    jump: "本页内容", sec: { cost: "费用", versions: "版本", ratings: "评级", children: "带娃", recalls: "召回", registrations: "登记量", grant: "补贴", rankings: "排名", similar: "相似车型" },
    perYear: (c, km) => `每年约 ${c}（${km} 公里）`,
    grant: "电动车补贴（2026）", bev: "2026 年 1 月 1 日起首次登记的纯电动新车可以申请。", amount: (a, b) => `按家庭收入 ${a} 到 ${b}`, perChild: (p, n) => `每个孩子再加 ${p}，最多 ${n} 个`,
    phevOk: (c, r) => `这个版本符合条件：${c}。插电混动需要不超过 60 g CO₂/km 或纯电续航至少 80 km。`, phevNo: (c, r) => `这个版本不符合条件：${c}。插电混动需要不超过 60 g CO₂/km 或纯电续航至少 80 km。`,
    phevSome: (n, m) => `${m} 个版本中有 ${n} 个符合条件（不超过 60 g CO₂/km 或纯电续航至少 80 km）。在“版本”里选你的版本。`, phevAvg: "按官方平均值", phevUntil: (d) => `插电混动须在 ${d} 前首次登记。`,
    tooEarly: (y) => `你的车 ${y} 年首次登记：补贴只适用于 2026 年 1 月 1 日起首次登记的车。`, grantGo: "算算你能拿多少", grantNone: (f) => `${f}车没有购车补贴。`,
    ranks: "排名", pos: (i, n) => `第 ${i} 名，共 ${n}`, notRanked: "未上榜", rankAll: "全部排行榜",
    rk: { sellers: "德国销量榜（近 12 个月）", electric: "电动车销量榜", efficient: "最省电的电动车", cheapest: "每 100 公里最省钱", cheapestFuel: (f) => `每 100 公里最省钱 · 仅限${f}`, child: "Euro NCAP 儿童乘员得分", recalls: (b) => `每 10 万辆新车召回最少的品牌（${b}）` },
    why: { few500: "2025 年登记不足 500 辆", few1000: "2025 年登记不足 1000 辆", old: "已不再销售新车", proto: "未按最新规程测试", regs: "登记统计里没有单独列出" },
    results: (q) => `“${q}”的搜索结果`, resultsN: (n) => `${n} 款车型`, noResults: (q) => `没有找到“${q}”。试试品牌和车型，例如“大众 ID.3”。`, regsN: (n) => `近 12 个月 ${n} 辆`,
  } : de ? {
    jump: "Auf dieser Seite", sec: { cost: "Kosten", versions: "Versionen", ratings: "Bewertungen", children: "Kinder", recalls: "Rückrufe", registrations: "Zulassungen", grant: "Förderung", rankings: "Ranglisten", similar: "Ähnliche Autos" },
    perYear: (c, km) => `rund ${c} im Jahr bei ${km} km`,
    grant: "E-Auto-Förderung (2026)", bev: "Neue reine E-Autos mit Erstzulassung ab 1. Januar 2026 sind förderfähig.", amount: (a, b) => `${a} bis ${b}, je nach Haushaltseinkommen`, perChild: (p, n) => `plus ${p} je Kind, für bis zu ${n} Kinder`,
    phevOk: (c, r) => `Diese Version ist förderfähig: ${c}. Ein Plug-in-Hybrid braucht höchstens 60 g CO₂/km oder mindestens 80 km elektrische Reichweite.`, phevNo: (c, r) => `Diese Version ist nicht förderfähig: ${c}. Ein Plug-in-Hybrid braucht höchstens 60 g CO₂/km oder mindestens 80 km elektrische Reichweite.`,
    phevSome: (n, m) => `${n} von ${m} Versionen sind förderfähig (höchstens 60 g CO₂/km oder mindestens 80 km elektrisch). Wähl deine unter „Versionen“.`, phevAvg: "nach dem offiziellen Durchschnitt", phevUntil: (d) => `Plug-in-Hybride nur bei Erstzulassung bis ${d}.`,
    tooEarly: (y) => `Dein Auto ist von ${y}: Gefördert werden nur Autos mit Erstzulassung ab 1. Januar 2026.`, grantGo: "Deinen Betrag ausrechnen", grantNone: (f) => `Für ${f}-Autos gibt es keine Kaufprämie.`,
    ranks: "In den Ranglisten", pos: (i, n) => `Platz ${i} von ${n}`, notRanked: "Nicht gelistet", rankAll: "Alle Ranglisten",
    rk: { sellers: "Meistverkauft in Deutschland (12 Monate)", electric: "Meistverkaufte E-Autos", efficient: "Sparsamste E-Autos", cheapest: "Günstigste je 100 km", cheapestFuel: (f) => `Günstigste je 100 km, nur ${f}`, child: "Euro NCAP Kindersicherheit", recalls: (b) => `Wenigste Rückrufe je 100.000 Neuwagen (Marke ${b})` },
    why: { few500: "2025 unter 500 Neuzulassungen", few1000: "2025 unter 1.000 Neuzulassungen", old: "nicht mehr neu zu kaufen", proto: "nicht nach dem neuesten Protokoll getestet", regs: "in der Zulassungsstatistik nicht einzeln aufgeführt" },
    results: (q) => `Treffer für „${q}“`, resultsN: (n) => `${n} Modelle`, noResults: (q) => `Nichts gefunden für „${q}“. Versuch Marke und Modell, z. B. „VW ID.3“.`, regsN: (n) => `${n} in 12 Monaten`,
  } : {
    jump: "On this page", sec: { cost: "Cost", versions: "Versions", ratings: "Ratings", children: "Children", recalls: "Recalls", registrations: "Registrations", grant: "Grant", rankings: "Rankings", similar: "Similar cars" },
    perYear: (c, km) => `about ${c} a year at ${km} km`,
    grant: "E-Auto grant (2026)", bev: "New fully electric cars first registered from 1 January 2026 qualify.", amount: (a, b) => `${a} to ${b}, depending on household income`, perChild: (p, n) => `plus ${p} per child, for up to ${n} children`,
    phevOk: (c, r) => `This version qualifies: ${c}. A plug-in hybrid needs at most 60 g CO₂/km or at least 80 km electric range.`, phevNo: (c, r) => `This version does not qualify: ${c}. A plug-in hybrid needs at most 60 g CO₂/km or at least 80 km electric range.`,
    phevSome: (n, m) => `${n} of ${m} versions qualify (at most 60 g CO₂/km or at least 80 km electric). Pick yours under Versions.`, phevAvg: "by the official average", phevUntil: (d) => `Plug-in hybrids only when first registered by ${d}.`,
    tooEarly: (y) => `Your car is from ${y}: the grant is only for cars first registered from 1 January 2026.`, grantGo: "Work out your amount", grantNone: (f) => `There is no purchase grant for ${f.toLowerCase()} cars.`,
    ranks: "Where it ranks", pos: (i, n) => `No. ${i} of ${n}`, notRanked: "Not ranked", rankAll: "All rankings",
    rk: { sellers: "Best sellers in Germany (12 months)", electric: "Best-selling electric cars", efficient: "Most efficient electric cars", cheapest: "Cheapest per 100 km", cheapestFuel: (f) => `Cheapest per 100 km, ${f.toLowerCase()} only`, child: "Euro NCAP child occupant score", recalls: (b) => `Fewest recalls per 100,000 new cars (${b}, by brand)` },
    why: { few500: "fewer than 500 registered in 2025", few1000: "fewer than 1,000 registered in 2025", old: "no longer sold new", proto: "not tested under the newest protocol", regs: "not listed on its own in the registration statistics" },
    results: (q) => `Results for “${q}”`, resultsN: (n) => `${n} models`, noResults: (q) => `Nothing found for “${q}”. Try make and model, e.g. “VW ID.3”.`, regsN: (n) => `${n} in 12 months`,
  };
  const G = window.AlloGarage;
  const HOME_PRICE = 0.35, LOSS = 1.1; // the charging cost tool's defaults
  const YEAR_KM = 15000; // a typical year, as on /compare/
  const FUEL_LINK = zh ? "本周油价" : de ? "Spritpreise dieser Woche" : "This week's fuel prices";
  const FUEL_PRODUCT = { petrol: "euro_super_95", diesel: "diesel", lpg: "lpg", "phev-petrol": "euro_super_95", "phev-diesel": "diesel" };
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const num = (v, d = 1) => v == null ? "–" : Number(v).toLocaleString(T.locale, { minimumFractionDigits: d, maximumFractionDigits: d });
  const eur = (v, d = 2) => v == null ? "–" : Number(v).toLocaleString(T.locale, { style: "currency", currency: "EUR", minimumFractionDigits: d, maximumFractionDigits: d });
  const day = (iso) => iso ? new Date(iso + "T12:00:00Z").toLocaleDateString(T.locale, { day: "numeric", month: "short", year: "numeric" }) : "–";
  const json = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(`${u}: ${r.status}`); return r.json(); });
  const soft = (u) => json(u).catch(() => null);

  let catalogYear = 0, catalog = [], byId = new Map(), prices = { fuel: null, charge: null }, regs = null, recallBrands = null, ratings = null, recallStats = null;
  /* versions (trims) of each model, one file per make (pipelines/vehicle_catalog/versions.py) */
  const versionFiles = new Map();
  const makeSlug = (make) => String(make || "").toLowerCase().replace(/&/g, "and").replace(/#/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  function versionsOf(m) {
    if (!m) return Promise.resolve([]);
    const k = makeSlug(m.make);
    if (!versionFiles.has(k)) versionFiles.set(k, soft(AlloSite.data("vehicle-catalog", `versions/${k}.json`)));
    return versionFiles.get(k).then((d) => (d && d.models && d.models[m.id]) || []);
  }
  const vLabel = (v) => [v.trim, `${v.power_kw} kW`, v.range_km ? `${v.range_km.toLocaleString(T.locale)} km` : ""].filter(Boolean).join(" · ");
  // a version's own official figures over the model's averages
  const eff = (s) => s.ver ? { ...s.m, kwh_per_100km: s.ver.kwh_per_100km, l_per_100km: s.ver.l_per_100km, co2_g_km: s.ver.co2_g_km,
    range_km: s.ver.range_km, power_kw: s.ver.power_kw, mass_kg: s.ver.mass_kg, years: s.ver.years, year: s.ver.year } : s.m;
  let current = null; // { car: garage entry or null, spec: {car,name,make,model,fuel,year,cons} }

  const MINE = !!$("garage"); // My cars, or the page of any one car
  const A2 = zh ? {
    title: "需要注意的事", recallsFit: (n, y) => `${n} 次召回可能涉及你 ${y} 年的车。`, recallsAny: (n) => `${n} 次召回提到这个车型。`,
    askDealer: (m) => `请 ${m} 授权经销商用车架号免费查询是否已处理，可报这些召回编号：`, noneFit: (y) => `没有召回与 ${y} 年首次登记相符。`, noneAny: "Safety Gate 中没有这个车型的召回。",
    park: (n) => `美国有 ${n} 次召回要求车主把车停在室外，直到修好（适用于部分年款）。`, addYear: "填上首次登记年份，召回就能按你的车筛选。", check: "核对召回",
  } : de ? {
    title: "Was jetzt wichtig ist", recallsFit: (n, y) => `${n} ${n === 1 ? "Rückruf passt" : "Rückrufe passen"} zu deinem Auto von ${y}.`, recallsAny: (n) => `${n} ${n === 1 ? "Rückruf nennt" : "Rückrufe nennen"} dieses Modell.`,
    askDealer: (m) => `Lass eine ${m}-Vertragswerkstatt anhand der FIN kostenlos prüfen, ob sie erledigt sind. Rückrufcodes:`, noneFit: (y) => `Kein Rückruf passt zur Erstzulassung ${y}.`, noneAny: "Safety Gate nennt keine Rückrufe für dieses Modell.",
    park: (n) => `${n === 1 ? "Ein Rückruf" : n + " Rückrufe"} in den USA: draußen parken, bis repariert (einzelne Modelljahre).`, addYear: "Trag das Jahr der Erstzulassung ein, dann passen die Rückrufe zu deinem Auto.", check: "Rückrufe prüfen",
  } : {
    title: "What needs attention", recallsFit: (n, y) => `${n} ${n === 1 ? "recall may apply" : "recalls may apply"} to your ${y} car.`, recallsAny: (n) => `${n} ${n === 1 ? "recall names" : "recalls name"} this model.`,
    askDealer: (m) => `Ask a ${m} dealer to check the VIN for free and confirm they're done. Recall codes:`, noneFit: (y) => `No recall matches first registration in ${y}.`, noneAny: "Safety Gate lists no recalls for this model.",
    park: (n) => `${n === 1 ? "A US recall says" : n + " US recalls say"} to park outside until fixed (some model years).`, addYear: "Add the year of first registration so recalls match your car.", check: "Check recalls",
  };
  const C = zh ? { open: "在我的车里打开", none: "没有找到这个车型。", find: "在上面搜索一款车。" } : de ? { open: "In Meine Autos öffnen", none: "Dieses Modell gibt es nicht.", find: "Such oben nach einem Auto." } : { open: "Open in My cars", none: "We don't have this model.", find: "Search for a car above." };
  /* ---------- your cars ---------- */
  const ADD = MINE ? $("add-open").textContent.replace(/^\+\s*/, "") : "";
  function drawGarage() {
    if (!MINE) return;
    const cars = G.list(), act = current && current.car ? current.car.id : null;
    $("garage").innerHTML = cars.map((c) => `<button type="button" class="ac-chip" data-car="${esc(c.id)}" aria-pressed="${c.id === act}">${esc(c.nick || c.name)}${c.nick ? ` <small>${esc(c.name)}</small>` : ""}${c.year ? ` <small>${c.year}</small>` : ""}</button>`).join("")
      + `<button type="button" class="ac-btn ac-btn--primary" id="add-open">+ ${esc(ADD)}</button>`;
    $("garage-none").hidden = cars.length > 0;
  }
  if (MINE) {
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
  }

  /* ---------- one car ---------- */
  function specOf(c) {
    const m = c.car ? byId.get(c.car) : null;
    return { car: c.car, name: c.name || (m && m.name), make: c.make || (m && m.make), model: c.model || (m && m.model), fuel: c.fuel || (m && m.fuel), year: c.year || 0, cons: c.cons, m, v: c.v || "" };
  }
  function showSaved(c, push) {
    if (!c) return;
    current = { car: c, spec: specOf(c) };
    if (push) setUrl(current.spec);
    draw();
  }
  function showModel(id, year, v = "") {
    const m = byId.get(id);
    if (!m) return false;
    const mine = G.list().find((c) => c.car === id && (!year || c.year === year) && (!v || c.v === v));
    current = mine ? { car: mine, spec: specOf(mine) } : { car: null, spec: { car: m.id, name: m.name, make: m.make, model: m.model, fuel: m.fuel, year: year || 0, cons: null, m, v } };
    draw();
    return true;
  }
  function setUrl(s) {
    const u = new URL(location.href);
    if (s.car) { u.searchParams.set("car", s.car); if (s.year) u.searchParams.set("year", s.year); else u.searchParams.delete("year"); }
    else { u.searchParams.delete("car"); u.searchParams.delete("year"); }
    if (s.car && s.v) u.searchParams.set("v", s.v); else u.searchParams.delete("v");
    history.replaceState(null, "", u);
  }

  function costBlock(s) {
    const m = eff(s), f = s.fuel, rows = [];
    const off = m ? (f === "electric" ? m.kwh_per_100km : m.l_per_100km) : null;
    const use = s.cons || off;
    const fp = prices.fuel && FUEL_PRODUCT[f] ? prices.fuel.products[FUEL_PRODUCT[f]] : null;
    const fuelName = f === "diesel" || f === "phev-diesel" ? T.fuel.diesel : f === "lpg" ? T.fuel.lpg : T.fuel.petrol;
    if (f === "electric" && use) {
      rows.push([eur(use * LOSS * HOME_PRICE), T.home(eur(HOME_PRICE)), use * LOSS * HOME_PRICE]);
      if (prices.charge) rows.push([eur(use * LOSS * prices.charge.overall.median), T.pub(eur(prices.charge.overall.median))]);
    } else if (/^phev/.test(f) && m && fp) {
      const kwh = m.kwh_per_100km || 0, l = m.l_per_100km || 0;
      rows.push([eur(kwh * LOSS * HOME_PRICE + (s.cons || l) * fp.eur_per_litre), T.mix, kwh * LOSS * HOME_PRICE + (s.cons || l) * fp.eur_per_litre]);
    } else if (use && fp) {
      rows.push([eur(use * fp.eur_per_litre), T.fuelAt(fuelName, eur(fp.eur_per_litre, 3)), use * fp.eur_per_litre]);
    }
    const readouts = rows.length ? rows.map(([v, b]) => `<div class="ac-readout"><div class="ac-readout__value">${v}</div><div class="ac-readout__basis">${esc(b)}</div></div>`).join("")
      : `<p class="ac-caption">${esc(T.noPrice)}</p>`;
    const facts = [];
    if (rows.length) facts.push(W.perYear(eur(rows[0][2] * YEAR_KM / 100, 0), YEAR_KM.toLocaleString(T.locale)));
    if (s.cons) facts.push(`${T.yours}: ${num(s.cons)} ${T.unit(f === "electric" ? "electric" : "fuel")}`);
    if (m) {
      if (m.kwh_per_100km) facts.push(`${T.official}: ${num(m.kwh_per_100km)} kWh/100 km`);
      if (m.l_per_100km) facts.push(`${T.official}: ${num(m.l_per_100km)} ${T.unit("fuel")}`);
      if (m.co2_g_km != null) facts.push(`${T.co2}: ${m.co2_g_km} g/km`);
      if (m.range_km) facts.push(`${T.range}: ${m.range_km} km`);
      if (m.power_kw) facts.push(`${T.power}: ${m.power_kw} kW`);
      if (m.years && m.year && m.year < catalogYear) facts.push(T.sold(m.years[0], m.years[1], m.year));
    }
    const links = [];
    if (f === "electric") {
      const p = new URLSearchParams({ car: s.name });
      // the same figure this card uses (your own, the version's or the model's), so both pages show the same cost
      if (use) p.set("lv", [0.9, 1, 1.22, 1.38].map((k) => (use * k).toFixed(1)).join(","));
      links.push(`<a href="${PRE}/ev-cost/?${p}">${esc(T.exact)}</a>`, `<a href="${PRE}/charge-times/">${esc(T.chargeTimes)}</a>`, `<a href="${PRE}/chargers/">${esc(T.chargers)}</a>`);
    } else if (use && (f === "petrol" || f === "diesel")) {
      links.push(`<a href="${PRE}/ev-cost/?own=${use},${f}">${esc(T.compare)}</a>`);
    } else if (/^phev/.test(f)) {
      links.push(`<a href="${PRE}/charge-times/">${esc(T.chargeTimes)}</a>`);
    }
    if (f !== "electric" && FUEL_PRODUCT[f]) links.push(`<a href="${PRE}/fuel-prices/">${esc(FUEL_LINK)}</a>`);
    const own = MINE && current.car ? `<label class="ac-param ownc"><span class="ac-param__label">${esc(T.ownCons)}</span><span class="ac-param__box"><input id="own" type="number" min="0.1" max="60" step="0.1" inputmode="decimal" value="${s.cons ?? ""}" placeholder="${off ?? "–"}"><span class="ac-param__unit">${T.unit(f === "electric" ? "electric" : "fuel")}</span></span><span class="ac-param__hint">${esc(T.ownHint)}</span></label>` : "";
    return `<section class="ac-card" id="cost"><h3 class="ac-card__title">${esc(T.cost)}</h3><div class="ac-readouts">${readouts}</div>
      ${facts.length ? `<p class="ac-caption" style="margin:0">${facts.map(esc).join(" · ")}</p>` : ""}${own}
      ${links.length ? `<ul class="links">${links.map((l) => `<li>${l}</li>`).join("")}</ul>` : ""}</section>`;
  }

  /* versions: pick a trim; the cost, figures and similar cars then use its official figures */
  function versionBlock(s, list) {
    if (!list.length) return "";
    const latest = Math.max(...list.map((v) => v.years[1]));
    const row = (v) => {
      const on = s.ver === v;
      const facts = [v.kwh_per_100km && s.fuel === "electric" ? `${num(v.kwh_per_100km)} kWh/100 km` : v.l_per_100km ? `${num(v.l_per_100km)} ${T.unit("fuel")}` : "",
        v.years[0] === v.years[1] ? String(v.years[0]) : `${v.years[0]}–${v.years[1]}`].filter(Boolean);
      return `<li><span><a href="?car=${encodeURIComponent(s.car)}&v=${encodeURIComponent(v.id)}" data-v="${esc(v.id)}"${on ? ' aria-current="true"' : ""}>${on ? "✓ " : ""}${esc(vLabel(v))}</a><small>${facts.map(esc).join(" · ")}</small></span></li>`;
    };
    const cur = list.filter((v) => v.years[1] >= latest - 1), old = list.filter((v) => v.years[1] < latest - 1);
    const sel = s.ver && old.includes(s.ver);
    const all = `<li><span><a href="?car=${encodeURIComponent(s.car)}" data-v=""${s.ver ? "" : ' aria-current="true"'}>${s.ver ? "" : "✓ "}${esc(T.allVersions)}</a></span></li>`;
    return `<section class="ac-card" id="versions"><h3 class="ac-card__title">${esc(T.versions)}</h3><p class="ac-caption" style="margin:4px 0 0">${esc(T.versionsDesc)}</p>
      <ul class="slist vlist">${all}${cur.map(row).join("")}</ul>
      ${versionFacts(s)}
      ${old.length ? `<details class="older"${sel ? " open" : ""}><summary>${esc(T.older(old.length))}</summary><ul class="slist vlist">${old.map(row).join("")}</ul></details>` : ""}</section>`;
  }
  function versionFacts(s) {
    const v = s.ver;
    if (!v) return "";
    const f = [];
    if (v.mass_kg) f.push(`${T.mass}: ${v.mass_kg.toLocaleString(T.locale)} kg`);
    if (v.names && v.names.length) f.push(`${T.names}: ${v.names.join(", ")}`);
    if (v.codes && v.codes.length) f.push(`${T.codes}: ${v.codes.slice(0, 4).join(", ")}`);
    return f.length ? `<p class="ac-caption">${f.map(esc).join(" · ")}</p>` : "";
  }

  /* recalls: the brand's Safety Gate alerts that name this model, as on the recalls page (rules in garage.js) */
  function modelPart(s) { return G.recallModel(s.make, s.model); }
  const names = (a, s) => G.recallNames(a, s.make, s.model);
  const fits = (a, y) => G.recallFits(a, y);
  // Safety Gate alerts of a brand, one fetch per brand file
  const brandFiles = new Map();
  function brandAlerts(s) {
    const slug = G.recallBrand(s.make);
    const b = recallBrands && recallBrands.brands.find((x) => x.slug === slug);
    if (!b) return Promise.resolve(null);
    if (!brandFiles.has(b.file)) brandFiles.set(b.file, soft(`/data/recalls/eu/${b.file}`).then((d) => (d ? d.alerts : [])));
    return brandFiles.get(b.file);
  }
  // the US campaigns NHTSA lists for the models the recalls page follows (catalog id = its slug)
  let usFollowed = null;
  async function usCampaigns(s) {
    if (!usFollowed) usFollowed = soft("/data/recalls/eu/models.json").then((d) => (d ? d.models : []));
    const f = (await usFollowed).find((m) => m.slug === s.car && m.us_file);
    if (!f) return null;
    const d = await soft(`/data/recalls/us/models/${f.slug}.json`);
    let c = d ? d.campaigns || [] : null;
    if (c && s.year) c = c.filter((x) => (x.model_years || []).some((y) => Math.abs(Number(y) - s.year) <= 1));
    return c;
  }
  // "Body, doors and seats" and the risk in the page's language, instead of Safety Gate's English "Injuries"
  const recallTitle = (a) => (a.component && a.component !== "other" && T.comp[a.component]) || T.risk[a.risk] || a.risk || a.product;
  const recallRisk = (a) => a.risk ? a.risk.split(/, |; /).map((x) => T.risk[x] || x).join(", ") : "";
  // production periods come as "2024 - 2027 (EX30)2025 - 2027 (EX30CC)" when an alert names several models
  const period = (p) => String(p || "").replace(/\)(?=\S)/g, "), ");

  // the recalls that name this model, those that fit its build year, and the US campaigns: shared by the
  // recall card and, on My cars, the "your car" card at the top
  async function recallInfo(s) {
    const slug = G.recallBrand(s.make);
    const b = recallBrands && recallBrands.brands.find((x) => x.slug === slug);
    const key = modelPart(s);
    const href = `${PRE}/recalls/?brand=${encodeURIComponent(slug)}${key ? `&model=${encodeURIComponent(key)}` : ""}${s.year ? `&year=${s.year}` : ""}`;
    if (!b) return { b, href, hits: [], inYear: [], us: null };
    const [alerts, us] = await Promise.all([brandAlerts(s), usCampaigns(s).catch(() => null)]);
    const hits = (alerts || []).filter((a) => names(a, s)).sort((x, y) => (y.date || "").localeCompare(x.date || ""));
    const inYear = s.year ? hits.filter((a) => fits(a, s.year)) : [];
    return { b, href, hits, inYear, us };
  }

  async function recallBlock(s, info) {
    const { b, href, hits, inYear, us } = info || await recallInfo(s);
    let body;
    if (!b) body = `<p class="ac-caption">${esc(T.recallsNone)}</p>`;
    else {
      const top = (s.year && inYear.length ? inYear : hits).slice(0, 3);
      const pool = s.year && inYear.length ? inYear : hits, rest = pool.length - top.length;
      const park = us ? us.filter((c) => c.park_outside).length : 0;
      const usOut = us && us.length ? `<div class="ac-readout"><div class="ac-readout__value">${us.length}</div><div class="ac-readout__basis">${esc(T.recallsUs(us.length))}${park ? ` <span class="ac-status ac-status--over">${esc(T.parkOutside)}</span>` : ""}</div></div>` : "";
      body = hits.length || usOut
        ? `<div class="ac-readouts"><div class="ac-readout"><div class="ac-readout__value">${hits.length}</div><div class="ac-readout__basis">${esc(T.recallsN(hits.length))}</div></div>
           ${s.year ? `<div class="ac-readout"><div class="ac-readout__value">${inYear.length}</div><div class="ac-readout__basis">${esc(T.recallsYear(inYear.length, s.year))}</div></div>` : ""}${usOut}</div>
           ${top.length ? `<ul class="rlist">${top.map((a) => `<li><a href="${esc(a.url)}" rel="noopener">${esc(recallTitle(a))}</a><small>${[day(a.date), recallRisk(a), a.recall_code, a.production && period(a.production)].filter(Boolean).map(esc).join(" · ")}</small></li>`).join("")}</ul>` : ""}
           ${rest > 0 ? `<p class="ac-caption">${esc(T.recallsMore(rest))}</p>` : ""}${top.length && T.recallsEn ? `<p class="ac-caption">${esc(T.recallsEn)}</p>` : ""}`
        : `<p class="ac-caption">${esc(T.recallsNone)}</p>`;
    }
    return `<section class="ac-card" id="recalls"><h3 class="ac-card__title">${esc(T.recalls)}</h3>${body}
      <ul class="links"><li><a href="${href}">${esc(b ? T.recallsAll : T.recallsBrand(s.make))}</a></li></ul></section>`;
  }

  // My cars: what an owner should know first, before the facts about the model
  function attentionBlock(s, info) {
    const { hits, inYear, us } = info;
    const park = us ? us.filter((c) => c.park_outside).length : 0;
    const items = [];
    const pool = s.year ? inYear : hits;
    if (pool.length) {
      const codes = pool.map((a) => a.recall_code).filter(Boolean).slice(0, 6);
      items.push(`<li class="warn"><strong>${esc(s.year ? A2.recallsFit(pool.length, s.year) : A2.recallsAny(pool.length))}</strong> ${esc(A2.askDealer(s.make))}${codes.length ? ` <span class="codes">${codes.map((c) => `<code>${esc(c)}</code>`).join(" ")}</span>` : ""}</li>`);
    } else items.push(`<li class="ok">${esc(s.year ? A2.noneFit(s.year) : A2.noneAny)}</li>`);
    if (park) items.push(`<li class="warn"><span class="ac-status ac-status--over">${esc(T.parkOutside)}</span> ${esc(A2.park(park))}</li>`);
    if (!s.year) items.push(`<li>${esc(A2.addYear)}</li>`);
    return `<section class="ac-card attn" id="attention"><h3 class="ac-card__title">${esc(A2.title)}</h3><ul class="attn__list">${items.join("")}</ul>
      <ul class="links"><li><a href="${info.href}">${esc(A2.check)}</a></li></ul></section>`;
  }

  async function regBlock(s) {
    const key = G.modelKey(s.make, s.model);
    const r = regs && regs.models.find((x) => x.model !== "SONSTIGE" && G.modelKey(x.brand, x.model) === key);
    if (!r) return `<section class="ac-card" id="registrations"><h3 class="ac-card__title">${esc(T.regs)}</h3><p class="ac-caption">${esc(T.regsNone)}</p>
      <ul class="links"><li><a href="${PRE}/registrations/">${esc(T.regsMore)}</a></li></ul></section>`;
    const data = await soft(AlloSite.data("registrations", r.file));
    const months = data ? data.months.slice(-24) : [];
    const max = Math.max(1, ...months.map((x) => x.total || 0)), w = 100 / Math.max(months.length, 1);
    const spark = months.length ? `<svg class="spark" viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label="${esc(T.perMonth)}">${months.map((x, i) => `<rect x="${(i * w + w * 0.15).toFixed(2)}" width="${(w * 0.7).toFixed(2)}" y="${(40 - 38 * (x.total || 0) / max).toFixed(2)}" height="${(38 * (x.total || 0) / max).toFixed(2)}"><title>${x.month}: ${(x.total || 0).toLocaleString(T.locale)}</title></rect>`).join("")}</svg><p class="ac-caption" style="margin:4px 0 0">${esc(T.perMonth)}</p>` : "";
    return `<section class="ac-card" id="registrations"><h3 class="ac-card__title">${esc(T.regs)}</h3>
      <div class="ac-readouts"><div class="ac-readout"><div class="ac-readout__value">${(r.last_12_months || 0).toLocaleString(T.locale)}</div><div class="ac-readout__basis">${esc(T.regsYear)}${r.rank ? ` · ${esc(T.regsRank(r.rank))}` : ""}</div></div></div>
      ${r.segment && T.seg[r.segment] ? `<p class="ac-caption">${T.regsSeg(`<a href="${PRE}/rankings/?list=sellers&amp;seg=${encodeURIComponent(r.segment)}">${esc(T.seg[r.segment])}</a>`)}</p>` : ""}
      ${spark}<ul class="links"><li><a href="${PRE}/registrations/?model=${encodeURIComponent(r.slug)}">${esc(T.regsMore)}</a></li></ul></section>`;
  }

  /* compare basket (garage.js): add this model, then open /compare/ */
  const cmpId = (s) => s.car && s.ver ? `${s.car}:${s.ver.id}` : s.car;
  function cmpHtml(s) {
    if (!s.car) return "";
    const id = cmpId(s), ids = G.compare.list(), on = ids.includes(id);
    return `<button type="button" class="ac-btn ac-btn--ghost" id="cmp" aria-pressed="${on}">${esc(on ? T.cmpIn : T.cmpAdd)}</button>`
      + (ids.length > 1 || (ids.length === 1 && !on) ? `<a class="ac-btn ac-btn--primary" href="${PRE}/compare/?cars=${(on ? ids : [...ids, id]).slice(-G.compare.MAX).map(encodeURIComponent).join(",")}">${esc(T.cmpGo(on ? ids.length : Math.min(ids.length + 1, G.compare.MAX)))}</a>` : "");
  }
  addEventListener("ac:compare", () => {
    const r = $("cmp-row"); if (r && current) r.innerHTML = cmpHtml(current.spec);
    const ids = G.compare.list();
    document.querySelectorAll("#profile [data-cmp]").forEach((b) => { const on = ids.includes(b.dataset.cmp); b.setAttribute("aria-pressed", on); b.textContent = on ? T.cmpOn : T.cmpShort; });
  });

  /* model hub: cars like this one, and where it stands in the rankings (same rules as /rankings/) */
  const currentModels = () => catalog.filter((m) => m.year === catalogYear || (m.years && m.years[1] >= catalogYear - 1));
  function similarBlock(s) {
    const list = s.m ? G.similar(catalog, eff(s), catalogYear, 5) : []; // a chosen version: cars close to its power and weight
    if (!list.length) return "";
    const basket = G.compare.list();
    const rows = list.map((m) => {
      const c = G.cost100(m, prices.fuel, prices.charge).main;
      const use = m.fuel === "electric" ? `${num(m.kwh_per_100km)} kWh/100 km` : m.l_per_100km ? `${num(m.l_per_100km)} ${T.unit("fuel")}` : "";
      const on = basket.includes(m.id);
      return `<li><span><a href="${PRE}/car/?car=${encodeURIComponent(m.id)}">${esc(m.name)}</a><small>${[T.fuel[m.fuel] || m.fuel, use, c != null ? `${eur(c)} / 100 km` : ""].filter(Boolean).map(esc).join(" · ")}</small></span>
        <button type="button" class="ac-chip" data-cmp="${esc(m.id)}" aria-pressed="${on}">${esc(on ? T.cmpOn : T.cmpShort)}</button></li>`;
    }).join("");
    const ids = [cmpId(s), ...list.slice(0, 3).map((m) => m.id)];
    return `<section class="ac-card" id="similar"><h3 class="ac-card__title">${esc(T.similar)}</h3><p class="ac-caption" style="margin:4px 0 0">${esc(T.similarDesc)}</p>
      <ul class="slist">${rows}</ul><ul class="links"><li><a href="${PRE}/compare/?cars=${ids.map(encodeURIComponent).join(",")}">${esc(T.cmpThese)}</a></li></ul></section>`;
  }
  function badges(s) {
    const m = s.m, out = [];
    if (!m) return "";
    const cur = currentModels();
    if (m.fuel === "electric" && (m.registrations || 0) >= 500 && cur.includes(m)) {
      const eff = cur.filter((x) => x.fuel === "electric" && x.kwh_per_100km && (x.registrations || 0) >= 500).sort((a, b) => a.kwh_per_100km - b.kwh_per_100km || (b.registrations || 0) - (a.registrations || 0));
      const i = eff.indexOf(m); if (i >= 0 && i < 30) out.push([T.badgeEff(i + 1), "efficient"]);
    }
    if ((m.registrations || 0) >= 1000 && cur.includes(m)) {
      const cheap = cur.filter((x) => (x.registrations || 0) >= 1000).map((x) => [x, G.cost100(x, prices.fuel, prices.charge).main]).filter((x) => x[1] != null).sort((a, b) => a[1] - b[1]).map((x) => x[0]);
      const i = cheap.indexOf(m); if (i >= 0 && i < 30) out.push([T.badgeCheap(i + 1), "cheapest"]);
    }
    const key = G.modelKey(m.make, m.model);
    const r = regs && regs.models.filter((x) => x.model !== "SONSTIGE" && x.last_12_months).sort((a, b) => b.last_12_months - a.last_12_months);
    const ri = r ? r.findIndex((x) => G.modelKey(x.brand, x.model) === key) : -1;
    if (ri >= 0 && ri < 50) out.push([T.badgeSell(ri + 1), "sellers"]);
    return out.length ? `<p class="badges">${out.map(([t, l]) => `<a class="ac-tag" href="${PRE}/rankings/?list=${l}">${esc(t)}</a>`).join("")}</p>` : "";
  }

  /* ratings: Euro NCAP and Green NCAP stars, ADAC breakdowns per 1,000 cars (headline facts, linked) */
  const starsHtml = (n) => G.stars(n);
  function ratingsBlock(s) {
    if (!ratings || !s.m) return "";
    const r = G.ratings(ratings, s.m), A = ratings.adac_breakdowns;
    const line = (label, body) => `<div class="rrow"><span class="rlabel">${esc(label)}</span>${body}</div>`;
    const euro = r.euro ? `<a href="${esc(r.euro.url)}" rel="noopener">${starsHtml(r.euro.stars)}</a><small>${esc(T.tested(r.euro.year))}</small>` : `<small>${esc(T.notTested)}</small>`;
    const green = r.green ? `<a href="${esc(r.green.url)}" rel="noopener">${starsHtml(r.green.stars)}</a><small>${esc(T.testedV(r.green.year, r.green.name))}</small>` : `<small>${esc(T.notTested)}</small>`;
    let adac = `<small>${esc(T.adacNone)}</small>`;
    if (r.adac && A) {
      const ys = Object.keys(r.adac.rates).sort().reverse();
      const pick = s.year && r.adac.rates[s.year] != null ? String(s.year) : null;
      adac = (pick ? `<strong>${esc(T.adacYear(pick, num(r.adac.rates[pick]), A.calendar_year))}</strong>` : "")
        + `<span class="adac">${ys.map((y) => `<span${y === pick ? ' class="on"' : ""}><b>${num(r.adac.rates[y])}</b><small>${y}</small></span>`).join("")}</span>`
        + `<small>${esc(T.adacUnit)} · <a href="${esc(A.source_url)}" rel="noopener">${esc(A.source)}</a></small>`;
    }
    return `<section class="ac-card" id="ratings"><h3 class="ac-card__title">${esc(T.ratings)}</h3>${line(T.euro, euro)}${line(T.green, green)}${line(T.adac, adac)}
      <p class="ac-caption" style="margin:var(--space-3) 0 0">${esc(T.ratingsNote)}</p></section>`;
  }

  /* children on board: Euro NCAP child occupant score and, per seat, the child seat fittings of the tested car
     (pipelines/ratings: euro_ncap.models[].child). Facts as Euro NCAP lists them, linked to the full result. */
  const K = zh ? {
    title: "带娃乘车", score: "Euro NCAP 儿童乘员得分", proto: (p, y) => `${p} 测试规程 · ${y} 年测试`, no26: "2026 年起的新测试规程不再单独给出儿童乘员得分。", noPct: "这次测试的结果页没有列出儿童乘员得分。",
    seat: "座位", seats: { front: "副驾", row2: "第二排两侧", row2_centre: "第二排中间", row3: "第三排", rear: "后排" }, integrated: "集成式儿童座椅",
    fit: { standard: "标配", optional: "选配", none: "无" }, airbag: "副驾安全气囊可关闭", presence: "儿童遗留检测", unlisted: "未列出",
    note: "这是 Euro NCAP 测试的那一辆车的配置，你的版本请以车辆说明书为准。不同测试规程的分数不能直接比较。", full: "Euro NCAP 完整结果",
    none: "Euro NCAP 没有这个车型的儿童乘员数据。", recalls: "涉及儿童安全的召回", recallsN: (n) => `${n} 次召回提到 ISOFIX、儿童锁、儿童座椅或副驾气囊关闭`, recallsNone: "安全门 (Safety Gate) 中没有这类召回。", recallsSrc: "来自欧盟安全门的召回说明（英文原文），按关键词筛选。", grant: "电动车补贴（2026）", grantText: (p, c, n) => `每个未满 18 岁的孩子多 ${p}，收入上限每个孩子提高 ${c}，最多算 ${n} 个孩子。`, grantGo: "算一算你家能拿多少", law: "德国儿童乘车规定（法规原文）", outings: "带孩子去哪儿：Allo Outings 上的亲子活动和地点",
  } : de ? {
    title: "Mit Kindern im Auto", score: "Euro NCAP Kindersicherheit", proto: (p, y) => `Testprotokoll ${p} · getestet ${y}`, no26: "Seit dem Protokoll 2026 gibt Euro NCAP keine eigene Wertung für Kinder mehr.", noPct: "Die Ergebnisseite dieses Tests nennt keine Wertung für Kinder.",
    seat: "Sitz", seats: { front: "Beifahrersitz", row2: "2. Reihe außen", row2_centre: "2. Reihe Mitte", row3: "3. Reihe", rear: "Rücksitze" }, integrated: "Integrierter Kindersitz",
    fit: { standard: "Serie", optional: "Option", none: "nein" }, airbag: "Beifahrerairbag abschaltbar", presence: "Kinderanwesenheitserkennung", unlisted: "nicht angegeben",
    note: "So war das getestete Auto ausgestattet; was deine Version hat, steht in der Betriebsanleitung. Wertungen aus verschiedenen Testprotokollen sind nicht vergleichbar.", full: "Ganzes Ergebnis bei Euro NCAP",
    none: "Euro NCAP hat zu diesem Modell keine Angaben zur Kindersicherheit.", recalls: "Rückrufe zur Kindersicherheit", recallsN: (n) => `${n} ${n === 1 ? "Rückruf nennt" : "Rückrufe nennen"} ISOFIX, Kindersicherung, Kindersitz oder die Beifahrerairbag-Abschaltung`, recallsNone: "Safety Gate nennt keine solchen Rückrufe.", recallsSrc: "Aus den Rückrufmeldungen von Safety Gate (englischer Originaltext), nach Stichworten gefiltert.", grant: "E-Auto-Förderung (2026)", grantText: (p, c, n) => `${p} mehr je Kind unter 18, die Einkommensgrenze steigt um ${c} je Kind, für bis zu ${n} Kinder.`, grantGo: "Für deinen Haushalt ausrechnen", law: "Kinder im Auto: die Regeln in Deutschland", outings: "Ausflugsziele und Termine für Familien: Allo Outings",
  } : {
    title: "Children on board", score: "Euro NCAP child occupant score", proto: (p, y) => `${p} test protocol · tested ${y}`, no26: "Since the 2026 protocol Euro NCAP no longer gives a separate child occupant score.", noPct: "The result page of this test lists no child occupant score.",
    seat: "Seat", seats: { front: "Front passenger", row2: "2nd row, outer seats", row2_centre: "2nd row, centre", row3: "3rd row", rear: "Rear seats" }, integrated: "Integrated child seat",
    fit: { standard: "Standard", optional: "Optional", none: "No" }, airbag: "Front passenger airbag can be switched off", presence: "Child presence detection", unlisted: "not listed",
    note: "As fitted to the car Euro NCAP tested; your version's manual says what yours has. Scores from different test protocols are not comparable.", full: "Full result at Euro NCAP",
    none: "Euro NCAP has no child occupant data for this model.", recalls: "Recalls about children\u2019s safety", recallsN: (n) => `${n} ${n === 1 ? "recall names" : "recalls name"} ISOFIX, child locks, child seats or the passenger airbag switch`, recallsNone: "Safety Gate lists no such recalls.", recallsSrc: "From the Safety Gate recall notices (English original), filtered by keyword.", grant: "E-Auto grant (2026)", grantText: (p, c, n) => `${p} more per child under 18, and the income limit rises by ${c} per child, for up to ${n} children.`, grantGo: "Work it out for your household", law: "Children in the car: the rules in Germany", outings: "Family days out and events: Allo Outings",
  };
  // Safety Gate recalls of this model about child seats and children's safety (ISOFIX, child locks, the
  // passenger airbag switch …), as matched by G.childRecall on the official hazard text
  function recallLines(list) {
    const line = (label, body) => `<div class="rrow"><span class="rlabel">${esc(label)}</span>${body}</div>`;
    return line(K.recalls, list.length
      ? `<strong>${esc(K.recallsN(list.length))}</strong><ul class="rlist">${list.slice(0, 3).map((a) => `<li><a href="${esc(a.url)}" rel="noopener">${esc(a.hazard.split(/(?<=\.)\s/)[0])}</a><small>${day(a.date)}${a.production ? ` · ${esc(a.production)}` : ""}</small></li>`).join("")}</ul><small>${esc(K.recallsSrc)}</small>`
      : `<small>${esc(K.recallsNone)}</small>`);
  }
  // Germany's E-Auto grant adds money per child: shown for electric cars and plug-in hybrids, from the rules in /ev-grant/grant.js
  function grantLine(s) {
    const R = window.EvGrant && window.EvGrant.RULES;
    if (!R || !(s.fuel === "electric" || /^phev/.test(s.fuel))) return "";
    if (s.year && s.year < Number(R.registered_from.slice(0, 4))) return ""; // a car registered before the grant can't get it
    const drive = s.fuel === "electric" ? "bev" : "phev";
    const href = `${PRE}/ev-grant/?kids=1${drive === "phev" ? `&drive=phev&car=${encodeURIComponent(s.car)}` : ""}`;
    return `<div class="rrow"><span class="rlabel">${esc(K.grant)}</span><span>${esc(K.grantText(eur(R.per_child, 0), eur(R.cap_per_child, 0), R.max_children))}</span><a href="${href}">${esc(K.grantGo)}</a></div>`;
  }
  const SEATS = ["front", "row2", "row2_centre", "row3", "rear"];
  const OUTINGS = zh ? "https://outings.allo.land/zh/" : de ? "https://outings.allo.land/" : "https://outings.allo.land/en/";
  async function childBlock(s) {
    if (!s.m) return "";
    const e = ratings ? G.ratings(ratings, s.m).euro : null, c = e && e.child;
    const kidRecalls = ((await brandAlerts(s)) || []).filter((a) => names(a, s) && G.childRecall(a)).sort((x, y) => (y.date || "").localeCompare(x.date || ""));
    const grant = grantLine(s);
    if (!c) return kidRecalls.length || grant ? `<section class="ac-card" id="children"><h3 class="ac-card__title">${esc(K.title)}</h3>
      <p class="ac-caption">${esc(K.none)}</p>${recallLines(kidRecalls)}${grant}</section>` : "";
    const fit = (v) => v ? `<span class="fit fit--${esc(v)}">${esc(K.fit[v])}</span>` : `<span class="na">–</span>`;
    const cols = [["ISOFIX", c.isofix || {}], ["i-Size", c.i_size || {}], [K.integrated, c.integrated_seat || {}]];
    const seats = SEATS.filter((k) => cols.some(([, m]) => m[k]));
    const table = seats.length ? `<div class="kidtab"><table><thead><tr><th scope="col">${esc(K.seat)}</th>${cols.map(([h]) => `<th scope="col">${esc(h)}</th>`).join("")}</tr></thead>
      <tbody>${seats.map((k) => `<tr><th scope="row">${esc(K.seats[k])}</th>${cols.map(([, m]) => `<td>${fit(m[k])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : "";
    const score = c.occupant_pct != null
      ? `<a href="${esc(e.url)}" rel="noopener" class="pct">${c.occupant_pct}%</a><small>${esc(K.proto(c.protocol || "", e.year))}</small>`
      : `<small>${esc(/^2026/.test(c.protocol || "") ? K.no26 : K.noPct)} ${esc(K.proto(c.protocol || "", e.year))}</small>`;
    const line = (label, body) => `<div class="rrow"><span class="rlabel">${esc(label)}</span>${body}</div>`;
    return `<section class="ac-card" id="children"><h3 class="ac-card__title">${esc(K.title)}</h3>${line(K.score, score)}${table}
      ${line(K.airbag, c.airbag_switch ? fit(c.airbag_switch) : `<small>${esc(K.unlisted)}</small>`)}${line(K.presence, c.presence_detection ? fit(c.presence_detection) : `<small>${esc(K.unlisted)}</small>`)}
      <p class="ac-caption" style="margin:var(--space-3) 0 0">${esc(K.note)} <a href="${esc(e.url)}" rel="noopener">${esc(K.full)}</a></p>
      ${recallLines(kidRecalls)}${grant}
      <p class="ac-caption" style="margin:var(--space-2) 0 0"><a href="${PRE}/children/">${esc(K.law)}</a> · <a href="${OUTINGS}" rel="noopener">${esc(K.outings)}</a></p></section>`;
  }

  /* E-Auto grant for this car: electric cars qualify; a plug-in hybrid only with at most 60 g CO2/km or at
     least 80 km electric range (rules in /ev-grant/grant.js), so it is checked per version */
  function grantBlock(s, list) {
    const E = window.EvGrant;
    if (!E) return "";
    const R = E.RULES, ev = s.fuel === "electric", ph = /^phev/.test(s.fuel);
    const date = (iso) => new Date(iso + "T12:00:00Z").toLocaleDateString(T.locale, { day: "numeric", month: "long", year: "numeric" });
    const href = `${PRE}/ev-grant/?drive=${ev ? "bev" : "phev"}${s.car ? `&car=${encodeURIComponent(s.car)}` : ""}`;
    const wrap = (body) => `<section class="ac-card" id="grant"><h3 class="ac-card__title">${esc(W.grant)}</h3>${body}</section>`;
    if (!ev && !ph) return s.fuel && T.fuel[s.fuel] ? wrap(`<p class="ac-caption">${esc(W.grantNone(T.fuel[s.fuel]))}</p>`) : "";
    const drive = ev ? "bev" : "phev", b = R.base[drive];
    const parts = [];
    let ok = true;
    if (ph) {
      const m = eff(s);
      const fig = [m.co2_g_km != null ? `${m.co2_g_km} g CO₂/km` : "", m.range_km ? `${m.range_km} km` : ""].filter(Boolean).join(" · ");
      if (s.ver || !list.length) {
        const r = E.phevOk(m.co2_g_km, m.range_km);
        ok = r !== false;
        parts.push(`<p class="ac-caption">${esc((r === false ? W.phevNo : W.phevOk)(fig + (s.ver ? "" : ` (${W.phevAvg})`)))}</p>`);
      } else {
        const good = list.filter((v) => E.phevOk(v.co2_g_km, v.range_km) === true).length;
        ok = good > 0;
        parts.push(`<p class="ac-caption">${esc(W.phevSome(good, list.length))}</p>`);
      }
      parts.push(`<p class="ac-caption">${esc(W.phevUntil(date(R.phev_until)))}</p>`);
    } else parts.unshift(`<p class="ac-caption">${esc(W.bev)}</p>`);
    if (s.year && s.year < Number(R.registered_from.slice(0, 4))) { ok = false; parts.push(`<p class="ac-caption"><strong>${esc(W.tooEarly(s.year))}</strong></p>`); }
    const amount = ok ? `<div class="ac-readouts"><div class="ac-readout ac-readout--md"><div class="ac-readout__value">${eur(b[b.length - 1], 0)}–${eur(b[0], 0)}</div><div class="ac-readout__basis">${esc(W.amount(eur(b[b.length - 1], 0), eur(b[0], 0)))}${zh ? "，" : ", "}${esc(W.perChild(eur(R.per_child, 0), R.max_children))}</div></div></div>` : "";
    return wrap(`${amount}${parts.join("")}<ul class="links"><li><a href="${href}">${esc(W.grantGo)}</a></li></ul>`);
  }

  /* where this model stands in every list on /rankings/ (same rules), also when it is far down */
  function rankBlock(s) {
    const m = s.m;
    if (!m) return "";
    const cur = currentModels(), isCur = cur.includes(m), rows = [];
    const at = (arr, i) => i >= 0 ? W.pos(i + 1, arr.length) : null;
    const row = (label, list, pos, why, value) => rows.push(`<li><span><a href="${PRE}/rankings/?${list}">${esc(label)}</a>${value ? `<small>${esc(value)}</small>` : ""}</span><b class="${pos ? "" : "muted"}">${esc(pos || W.notRanked)}</b>${!pos && why ? `<small class="why">${esc(why)}</small>` : ""}</li>`);
    const key = G.modelKey(m.make, m.model);
    const regsAll = regs ? regs.models.filter((x) => x.model !== "SONSTIGE") : [];
    const sellers = regsAll.filter((x) => x.last_12_months).sort((a, b) => b.last_12_months - a.last_12_months);
    const si = sellers.findIndex((x) => G.modelKey(x.brand, x.model) === key);
    row(W.rk.sellers, "list=sellers", at(sellers, si), W.why.regs, si >= 0 ? W.regsN(sellers[si].last_12_months.toLocaleString(T.locale)) : "");
    if (m.fuel === "electric") {
      const el = regsAll.filter((x) => x.latest_bev).sort((a, b) => b.latest_bev - a.latest_bev);
      row(W.rk.electric, "list=electric", at(el, el.findIndex((x) => G.modelKey(x.brand, x.model) === key)), W.why.regs);
      const effL = cur.filter((x) => x.fuel === "electric" && x.kwh_per_100km && (x.registrations || 0) >= 500).sort((a, b) => a.kwh_per_100km - b.kwh_per_100km || (b.registrations || 0) - (a.registrations || 0));
      row(W.rk.efficient, "list=efficient", at(effL, effL.indexOf(m)), isCur ? W.why.few500 : W.why.old, m.kwh_per_100km ? `${num(m.kwh_per_100km)} kWh/100 km` : "");
    }
    const cheap = cur.filter((x) => (x.registrations || 0) >= 1000).map((x) => [x, G.cost100(x, prices.fuel, prices.charge).main]).filter((x) => x[1] != null).sort((a, b) => a[1] - b[1]);
    const ci = cheap.findIndex((x) => x[0] === m);
    row(W.rk.cheapest, "list=cheapest", at(cheap, ci), isCur ? W.why.few1000 : W.why.old, ci >= 0 ? `${eur(cheap[ci][1])} / 100 km` : "");
    if (ci >= 0) {
      const same = cheap.filter((x) => x[0].fuel === m.fuel);
      row(W.rk.cheapestFuel(T.fuel[m.fuel] || m.fuel), `list=cheapest&fuel=${encodeURIComponent(m.fuel)}`, at(same, same.findIndex((x) => x[0] === m)), "");
    }
    if (ratings) {
      const all = ratings.euro_ncap.models;
      const proto = all.map((x) => x.child && x.child.occupant_pct != null ? x.child.protocol : "").filter(Boolean).sort().pop() || "";
      const kids = all.filter((x) => x.child && x.child.protocol === proto && x.child.occupant_pct != null).sort((a, b) => b.child.occupant_pct - a.child.occupant_pct || b.year - a.year);
      const e = G.ratings(ratings, m).euro;
      if (e) row(W.rk.child, "list=child", at(kids, kids.findIndex((x) => x.url === e.url)), W.why.proto, e.child && e.child.occupant_pct != null ? `${e.child.occupant_pct}% · ${e.child.protocol}` : "");
    }
    if (recallStats) {
      const slug = G.recallBrand(m.make);
      const br = recallStats.brands.filter((b) => b.alerts_per_100k != null).sort((a, b) => a.alerts_per_100k - b.alerts_per_100k);
      const bi = br.findIndex((b) => b.slug === slug);
      if (bi >= 0) row(W.rk.recalls(m.make), "list=recalls", at(br, bi), "", `${num(br[bi].alerts_per_100k)}`);
    }
    return `<section class="ac-card" id="rankings"><h3 class="ac-card__title">${esc(W.ranks)}</h3><ul class="slist ranks">${rows.join("")}</ul>
      <ul class="links"><li><a href="${PRE}/rankings/">${esc(W.rankAll)}</a></li></ul></section>`;
  }

  /* jump links to each section of the car page */
  function jumpNav(html) {
    // in the order the cards come on this page (My cars puts recalls before versions)
    const ids = ["cost", "versions", "grant", "ratings", "children", "recalls", "registrations", "rankings", "similar"].filter((id) => html.includes(`id="${id}"`))
      .sort((x, y) => html.indexOf(`id="${x}"`) - html.indexOf(`id="${y}"`));
    return ids.length > 2 ? `<nav class="jump" aria-label="${esc(W.jump)}">${ids.map((id) => `<a class="ac-chip" href="#${id}">${esc(W.sec[id])}</a>`).join("")}</nav>` : "";
  }

  /* ?q=<text>: the search results as a list (the header search sends people here without JavaScript, and a
     link or an AI can search this way); the best match is shown below */
  function matchCars(q) {
    const F = window.AlloFind;
    const w = F ? F.words(q) : String(q).toLowerCase().split(/\s+/).map(G.norm).filter(Boolean);
    const nm = F ? F.norm : G.norm;
    if (!w.length) return [];
    const hits = catalog.filter((m) => { const h = nm(`${m.make} ${m.name} ${m.model} ${m.fuel} ${T.fuel[m.fuel] || ""}`); return w.every((x) => h.includes(x)); });
    const exact = (m) => w.includes(nm(m.model)) ? 1 : 0;
    return hits.sort((a, b) => exact(b) - exact(a) || (b.registrations || 0) - (a.registrations || 0));
  }
  function resultsCard(q) {
    const hits = matchCars(q), box = $("results");
    if (!box) return hits;
    box.hidden = false;
    box.innerHTML = `<h2 class="ac-card__title">${esc(W.results(q))}</h2>` + (hits.length
      ? `<p class="ac-caption" style="margin:4px 0 0">${esc(W.resultsN(hits.length))}</p><ul class="slist">${hits.slice(0, 40).map((m) => `<li><span><a href="${PRE}/car/?car=${encodeURIComponent(m.id)}">${esc(m.name)}</a><small>${[T.fuel[m.fuel] || m.fuel, m.registrations ? W.regsN(m.registrations.toLocaleString(T.locale)) : ""].filter(Boolean).map(esc).join(" · ")}</small></span></li>`).join("")}</ul>`
      : `<p class="ac-caption">${esc(W.noResults(q))}</p>`);
    return hits;
  }

  let drawing = 0, jumped = false;
  async function draw() {
    drawGarage();
    const s = current.spec, me = ++drawing;
    const list = await versionsOf(s.m);
    if (me !== drawing) return;
    s.ver = (s.v && list.find((v) => v.id === s.v)) || null;
    const vname = s.ver ? ` ${vLabel(s.ver)}` : "";
    const title = (current.car && current.car.nick ? `${current.car.nick} · ${s.name}` : s.name) + vname;
    const sub = [T.fuel[s.fuel] || s.fuel, s.year ? T.reg(s.year) : ""].filter(Boolean).join(" · ");
    const acts = !current.car ? `<button type="button" class="ac-btn ac-btn--gold" id="keep">${esc(T.addThis)}</button>`
      : MINE ? `<span class="ac-status ac-status--ok">${esc(T.saved)}</span><button type="button" class="ac-btn ac-btn--ghost" id="remove">${esc(T.remove)}</button>`
      : `<span class="ac-status ac-status--ok">${esc(T.saved)}</span><a class="ac-btn ac-btn--ghost" href="${PRE}/cars/?mine=${encodeURIComponent(current.car.id)}">${esc(C.open)}</a>`;
    if (!MINE && $("car-h1")) { $("car-h1").textContent = s.name + vname; document.title = `${s.name}${vname} · Allo Cars`; }
    const headHtml = `<section class="ac-card"><div class="head"><div>${MINE ? `<h2 class="ac-card__title">${esc(title)}</h2>` : ""}<p class="ac-card__desc" style="margin:4px 0 0">${esc(sub)}</p>${badges(s)}</div><div class="acts">${acts}</div></div><div class="acts cmp" id="cmp-row">${cmpHtml(s)}</div></section>`;
    $("profile").innerHTML = `<div class="stack">${headHtml}<div class="cards">${costBlock(s)}<section class="ac-card"><p class="ac-caption">…</p></section><section class="ac-card"><p class="ac-caption">…</p></section></div></div>`;
    const info = await recallInfo(s).catch(() => null);
    const [rc, rg, kid] = await Promise.all([recallBlock(s, info).catch((e) => ""), regBlock(s).catch((e) => ""), childBlock(s).catch((e) => "")]);
    if (me !== drawing) return;
    const cards = $("profile").querySelector(".cards");
    // My cars is for owners: what needs attention and what the car costs first, the model's market facts last,
    // and no grant for a car registered before the grant started (it can't get it any more)
    const owner = MINE && current.car;
    const R = window.EvGrant && EvGrant.RULES, early = R && s.year && s.year < Number(R.registered_from.slice(0, 4));
    const html = owner
      ? (info ? attentionBlock(s, info) : "") + costBlock(s) + rc + ratingsBlock(s) + kid + versionBlock(s, list) + rg + rankBlock(s) + similarBlock(s) + (early ? "" : grantBlock(s, list))
      : costBlock(s) + versionBlock(s, list) + grantBlock(s, list) + ratingsBlock(s) + kid + rc + rg + rankBlock(s) + similarBlock(s);
    cards.innerHTML = html;
    const head = $("profile").querySelector(".head");
    if (head) head.insertAdjacentHTML("afterend", jumpNav(html));
    if (location.hash && !jumped) { jumped = true; const t = document.getElementById(location.hash.slice(1)); if (t) t.scrollIntoView(); }
  }
  $("profile").addEventListener("click", (e) => {
    const va = e.target.closest("a[data-v]");
    if (va) {
      e.preventDefault();
      current.spec.v = va.dataset.v;
      if (current.car) G.update(current.car.id, { v: va.dataset.v });
      setUrl(current.spec); draw();
      return;
    }
    if (e.target.id === "cmp") { G.compare.toggle(cmpId(current.spec)); return; }
    const sc = e.target.closest("[data-cmp]");
    if (sc) { G.compare.toggle(sc.dataset.cmp); return; }
    if (e.target.id === "keep") { const s = current.spec; showSaved(G.add({ car: s.car, name: s.name, make: s.make, model: s.model, fuel: s.fuel, year: s.year, v: s.v }), true); }
    if (e.target.id === "remove") {
      G.remove(current.car.id);
      const next = G.active();
      if (next) showSaved(next, true); else { current = null; setUrl({}); drawGarage(); empty(); }
    }
  });
  $("profile").addEventListener("change", (e) => {
    if (e.target.id !== "own" || !current.car) return;
    const v = Number(e.target.value) || null;
    G.update(current.car.id, { cons: v });
    showSaved(G.get(current.car.id), false);
  });

  async function load() {
    const [cat, fuel, charge, rg, rb, rt, rs] = await Promise.all([
      json(AlloSite.data("vehicle-catalog", "models.json")),
      soft(AlloSite.data("fuel-prices", "latest.json")),
      soft(AlloSite.data("charging-prices", "latest.json")),
      soft(AlloSite.data("registrations", "models.json")),
      soft("/data/recalls/eu/brands.json"),
      soft(AlloSite.data("ratings", "ratings.json")),
      soft("/data/recalls/eu/stats.json"),
    ]);
    catalogYear = cat.year || 0; catalog = cat.models; byId = new Map(catalog.map((m) => [m.id, m]));
    prices = { fuel, charge }; regs = rg; recallBrands = rb; ratings = rt; recallStats = rs;
    const u = new URLSearchParams(location.search);
    if (MINE) {
      // My cars: only cars kept on this device; any other car has its own page
      const byMine = u.get("mine") && G.get(u.get("mine"));
      if (byMine) { G.setActive(byMine.id); return showSaved(byMine, true); }
      if (u.get("car")) {
        const year = Number(u.get("year")) || 0, v = u.get("v") || "";
        const kept = G.list().find((c) => c.car === u.get("car") && (!year || c.year === year) && (!v || c.v === v));
        if (kept) { G.setActive(kept.id); return showSaved(kept, false); }
        return location.replace(`${PRE}/car/${location.search}${location.hash}`);
      }
      if (u.get("q")) return location.replace(`${PRE}/car/${location.search}`);
      const a = G.active() || G.list()[0];
      if (a) return showSaved(a, false);
      drawGarage(); return empty();
    }
    if (u.get("car")) {
      if (showModel(u.get("car"), Number(u.get("year")) || 0, u.get("v") || "")) return;
      $("profile").innerHTML = `<section class="ac-card"><p class="ac-caption">${esc(C.none)}</p></section>`; return;
    }
    const q = (u.get("q") || "").trim().slice(0, 80);
    if (q) {
      if (document.readyState === "loading") await new Promise((r) => document.addEventListener("DOMContentLoaded", r, { once: true }));
      const box = document.querySelector("#find-inline input[name=q]"); if (box) box.value = q;
      const hits = resultsCard(q);
      if (hits.length) return showModel(hits[0].id, 0);
      $("profile").innerHTML = ""; return;
    }
    $("profile").innerHTML = `<section class="ac-card"><p class="ac-caption">${esc(C.find)}</p></section>`;
  }
  // My cars with no car kept yet: the add form, open
  function empty() {
    $("profile").innerHTML = "";
    $("garage-none").hidden = false;
    $("addform").hidden = false;
  }
  addEventListener("ac:garage", () => drawGarage());
  load().catch((e) => { $("profile").innerHTML = `<section class="ac-card"><p class="ac-caption">${T.failed}${esc(e.message)}</p></section>`; });
})();
