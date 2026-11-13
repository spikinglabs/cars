/* Car recalls page: check a car (brand, model, year of first registration) against EU Safety Gate alerts and US
   NHTSA campaigns, what to ask before buying it, and statistics on all vehicle recalls since 2019.
   Data: /data/recalls/eu/* and /data/recalls/us/*. One script for /recalls/, /de/recalls/ and /zh/recalls/.
   Choice in the link: ?brand=<slug>&model=<name>&year=<yyyy>; the older ?model=<slug> (volvo-ex30) still works.
   The last choice is kept in this browser only. */
(() => {
  const lang = (document.documentElement.lang || "en").slice(0, 2);
  const de = lang === "de", zh = lang === "zh";
  // Safety Gate writes in English; the German and Chinese pages translate the recurring labels, not the hazard text.
  const DE_TERMS = {
    "Passenger car": "Pkw", "Passenger car / Passenger van": "Pkw / Kleinbus", "Motorcycle": "Motorrad", "Lorry": "Lkw",
    "Truck": "Lkw", "Van": "Transporter", "Bus": "Bus", "Injuries": "Verletzungen", "Fire": "Brand", "Burns": "Verbrennungen",
    "Electric shock": "Stromschlag", "Environment": "Umwelt", "Chemical": "Chemisch", "Cuts": "Schnittverletzungen",
    "Recall of the product from end users": "Rückruf bei Endkunden", "Recall of a product from commercial users": "Rückruf bei gewerblichen Kunden",
    "Withdrawal of the product from the market": "Rücknahme vom Markt", "Request to stop driving": "Aufforderung, nicht mehr zu fahren",
  };
  const ZH_TERMS = {
    "Passenger car": "乘用车", "Passenger car / Passenger van": "乘用车 / 小型客车", "Motorcycle": "摩托车", "Lorry": "货车",
    "Truck": "卡车", "Van": "厢式车", "Bus": "客车", "Injuries": "受伤", "Fire": "起火", "Burns": "烧伤",
    "Electric shock": "触电", "Environment": "环境", "Chemical": "化学", "Cuts": "割伤",
    "Recall of the product from end users": "向终端用户召回", "Recall of a product from commercial users": "向商业用户召回",
    "Withdrawal of the product from the market": "撤出市场", "Request to stop driving": "要求停止驾驶",
  };
  const TERMS = de ? DE_TERMS : zh ? ZH_TERMS : null;
  const tr = (s) => TERMS && s ? (TERMS[s] || s.split(/(, |; )/).map((x) => TERMS[x] || x).join("")) : s;
  // Every vehicle alert ends with the same legal sentence; it says nothing about the fault.
  const hazard = (s) => String(s || "").replace(/\s*The product does not comply with[^]*$/i, "").trim();
  // [English, German, Chinese]
  const COMPONENTS = {
    airbags_belts: ["Airbags and seat belts", "Airbags und Gurte", "安全气囊和安全带"], brakes: ["Brakes", "Bremsen", "制动系统"], steering: ["Steering", "Lenkung", "转向系统"],
    hv_battery: ["High-voltage battery and charging", "Hochvoltbatterie und Laden", "高压电池和充电"], fuel: ["Fuel system", "Kraftstoffsystem", "燃油系统"],
    engine_drive: ["Engine and drivetrain", "Motor und Antrieb", "发动机和传动系统"], wheels_suspension: ["Wheels, tyres and suspension", "Räder, Reifen und Fahrwerk", "车轮、轮胎和悬架"],
    electrical: ["Electrical system and wiring", "Elektrik und Kabel", "电气系统和线束"], software_assist: ["Software, cameras and assistance systems", "Software, Kameras und Assistenten", "软件、摄像头和辅助系统"],
    lights_view: ["Lights, wipers and visibility", "Licht, Wischer und Sicht", "灯光、雨刮和视野"], body_seats: ["Body, doors and seats", "Karosserie, Türen und Sitze", "车身、车门和座椅"],
    emissions: ["Emissions", "Abgase", "排放"], approval: ["Approval and paperwork", "Zulassung und Papiere", "认证和文件"], other: ["Other", "Sonstiges", "其他"],
  };
  const comp = (k) => (COMPONENTS[k] || COMPONENTS.other)[de ? 1 : zh ? 2 : 0];
  const T = zh ? {
    locale: "zh-CN", match: "可能适用的召回", us: "美国召回行动", latest: "最新通报", fire: "其中有起火风险",
    none: "无", noEu: "2019 年以来 EU Safety Gate 中没有符合这个选择的通报。",
    noUs: "这款车型没有 NHTSA 召回行动。", alert: "Safety Gate 通报", nhtsa: "NHTSA 记录",
    production: "生产时间", code: "召回编号", by: "通报方", years: "车型年份", collected: "更新于 ",
    parkOutside: "停在室外", doNotDrive: "请勿驾驶", ota: "可通过 OTA 远程修复",
    showAll: (n) => `显示全部 ${n} 条`, failed: "无法加载数据：",
    pickBrand: "选择品牌", allModels: (n) => `全部车型 (${n})`, anyYear: "任何年份", serious: "严重风险",
    notYet: "正在第一次收集召回数据，请几分钟后再来看看。", unavailable: "暂无数据",
    title: (n) => `${n} 在欧洲的召回`,
    desc: (y) => y ? `2019 年以来 EU Safety Gate 中生产时段涉及 ${y - 1} 或 ${y} 年的通报。汽车通常在首次登记当年或前一年生产。描述为英文原文。`
      : "2019 年以来 EU Safety Gate 中符合这个选择的全部通报。选择首次登记年份，可以缩小到对应的生产时段。描述为英文原文。",
    inYear: "生产时段符合", noDates: "未注明生产时段", outside: (n) => `这款车型还有 ${n} 次召回涉及其他生产年份`,
    askTitle: "买车前：该问什么", codesAsk: "请卖家证明以下召回编号已经处理：",
    perK: "每 10 万辆新车", count: "召回次数", cars: "轿车", two: "摩托车", vans: "厢式车、卡车、客车", oth: "其他",
    partial: "截至目前", regs: (n) => `在德国新登记 ${n} 辆`, noStats: "统计数据将在下次数据更新后显示。",
    yourBrand: "你选的品牌", dot: "。",
  } : de ? {
    locale: "de-DE", match: "Rückrufe, die passen können", us: "Rückrufaktionen in den USA", latest: "Neueste Meldung", fire: "davon Brandgefahr",
    none: "Keine", noEu: "Keine Meldung im EU Safety Gate seit 2019 passt zu dieser Auswahl.",
    noUs: "Keine NHTSA-Rückrufaktion für dieses Modell.", alert: "Meldung im Safety Gate", nhtsa: "Bei der NHTSA",
    production: "Gebaut", code: "Rückrufcode", by: "Gemeldet von", years: "Modelljahre", collected: "Stand: ",
    parkOutside: "Draußen parken", doNotDrive: "Nicht fahren", ota: "Per Software-Update",
    showAll: (n) => `Alle ${n} zeigen`, failed: "Die Daten konnten nicht geladen werden: ",
    pickBrand: "Marke wählen", allModels: (n) => `Alle Modelle (${n})`, anyYear: "Jedes Jahr", serious: "Ernstes Risiko",
    notYet: "Die Rückrufdaten werden gerade zum ersten Mal gesammelt. Schau in ein paar Minuten wieder vorbei.", unavailable: "Noch keine Daten",
    title: (n) => `Rückrufe für ${n} in Europa`,
    desc: (y) => y ? `Meldungen im EU Safety Gate seit 2019, deren Bauzeitraum ${y - 1} oder ${y} berührt. Ein Auto wird meist im Jahr der Erstzulassung oder im Jahr davor gebaut. Die Beschreibung kommt im englischen Original.`
      : "Alle Meldungen im EU Safety Gate seit 2019 für diese Auswahl. Wähl das Jahr der Erstzulassung, um sie auf den Bauzeitraum einzugrenzen. Die Beschreibung kommt im englischen Original.",
    inYear: "Bauzeitraum passt", noDates: "Bauzeitraum nicht angegeben", outside: (n) => `${n} weitere Rückrufe für dieses Modell betreffen andere Baujahre`,
    askTitle: "Vor dem Kauf: das solltest du fragen", codesAsk: "Lass dir für diese Rückrufcodes bestätigen, dass sie erledigt sind:",
    perK: "Je 100.000 Neuwagen", count: "Anzahl Rückrufe", cars: "Pkw", two: "Motorräder", vans: "Transporter, Lkw, Busse", oth: "Sonstige",
    partial: "bis heute", regs: (n) => `${n} Neuzulassungen in Deutschland`, noStats: "Die Statistik erscheint nach dem nächsten Datenlauf.",
    yourBrand: "deine Marke",
  } : {
    locale: "en-GB", match: "Recalls that may apply", us: "Campaigns in the US", latest: "Newest alert", fire: "with fire risk",
    none: "None", noEu: "No EU Safety Gate alert since 2019 matches this choice.",
    noUs: "No NHTSA campaign for this model.", alert: "Safety Gate alert", nhtsa: "At NHTSA",
    production: "Built", code: "Recall code", by: "Reported by", years: "Model years", collected: "Updated ",
    parkOutside: "Park outside", doNotDrive: "Do not drive", ota: "Over-the-air fix",
    showAll: (n) => `Show all ${n}`, failed: "Could not load data: ",
    pickBrand: "Choose a brand", allModels: (n) => `All models (${n})`, anyYear: "Any year", serious: "Serious risk",
    notYet: "Recall data is being collected for the first time. Check back in a few minutes.", unavailable: "No data yet",
    title: (n) => `${n} recalls in Europe`,
    desc: (y) => y ? `EU Safety Gate alerts since 2019 whose build window touches ${y - 1} or ${y}. A car is usually built in the year it was first registered or the year before.`
      : "Every EU Safety Gate alert since 2019 for this choice. Pick the year of first registration to narrow it to the build window.",
    inYear: "Built in that window", noDates: "Build dates not stated", outside: (n) => `${n} more recalls for this model cover other build years`,
    askTitle: "Before you buy: what to ask", codesAsk: "Ask for proof that these recall codes were done:",
    perK: "Per 100,000 new cars", count: "Number of recalls", cars: "Cars", two: "Motorcycles", vans: "Vans, trucks, buses", oth: "Other",
    partial: "so far", regs: (n) => `${n} new cars registered in Germany`, noStats: "Statistics appear after the next data run.",
    yourBrand: "your brand",
  };
  const BASE = "/data/recalls/";
  const KEY = "allo-cars-recalls";
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const num = (n) => Number(n).toLocaleString(T.locale);
  const day = (iso) => iso ? new Date(iso + "T12:00:00Z").toLocaleDateString(T.locale, { day: "numeric", month: "short", year: "numeric" }) : "–";
  const get = (path) => fetch(BASE + path).then((r) => { if (!r.ok) throw Object.assign(new Error(`${path}: ${r.status}`), { status: r.status }); return r.json(); });
  const local = (v) => { try { return v === undefined ? localStorage.getItem(KEY) : localStorage.setItem(KEY, v); } catch (e) { return null; } };
  const $ = (id) => document.getElementById(id);
  const country = (code) => { try { return new Intl.DisplayNames([T.locale], { type: "region" }).of(code); } catch (e) { return code; } };
  const norm = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");

  /* ---------- models named in a brand's alerts ---------- */
  // Safety Gate lists models loosely: "Atlas, Tiguan Allspace", "Golf A6 + Cabrio + Plus", "ID.4 / ID.5".
  function parts(a, brand) {
    const bn = norm(brand);
    // Safety Gate often leaves the model field empty and puts the model in the type field ("EX30 / EX30CC").
    return [a.models, a.type_approval].join(", ").replace(/&amp;/g, "&").replace(/\([^)]*\)/g, " ").split(/\s*(?:[,;/+&]|\band\b)\s*/i)
      .map((p) => p.trim().replace(new RegExp("^" + brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s+", "i"), ""))
      .filter((p) => p && p.length <= 40 && !/[*]|^e\d|^(?:null|undefined)$/i.test(p) && norm(p) && norm(p) !== bn);
  }
  function modelOptions(alerts, brand) {
    const seen = new Map();
    for (const a of alerts) {
      for (const p of new Set(parts(a, brand).map((x) => x))) {
        const k = norm(p);
        const o = seen.get(k) || { key: k, names: {}, n: 0 };
        o.names[p] = (o.names[p] || 0) + 1; o.n += 1;
        seen.set(k, o);
      }
    }
    return [...seen.values()].map((o) => ({ key: o.key, n: o.n,
      name: Object.keys(o.names).sort((x, y) => o.names[y] - o.names[x] || (x === x.toUpperCase()) - (y === y.toUpperCase()))[0] }))
      .sort((x, y) => x.name.localeCompare(y.name, T.locale, { numeric: true, sensitivity: "base" }));
  }
  const namesModel = (a, brand, key) => !key || parts(a, brand).some((p) => norm(p).startsWith(key));

  /* ---------- build window ---------- */
  function window_(a) {
    const ys = (String(a.production || "").match(/(?:19|20)\d\d/g) || []).map(Number);
    return ys.length ? [Math.min(...ys), Math.max(...ys)] : null;
  }
  // First registered in year y: built in y or y-1.
  const fits = (a, y) => { const w = window_(a); return !w ? null : w[0] <= y && y - 1 <= w[1]; };

  /* ---------- rendering ---------- */
  function euItem(a, year) {
    const models = a.models && a.models.toLowerCase() !== String(a.brand).toLowerCase() ? a.models : null;
    const name = [a.brand, models || a.type_approval].filter(Boolean).join(" ");
    const f = year ? fits(a, year) : undefined;
    const tags = [
      f === true ? `<span class="ac-tag ac-tag--strong">${T.inYear}</span>` : f === null ? `<span class="ac-tag">${T.noDates}</span>` : "",
      ...[a.component && comp(a.component), tr(a.product), tr(a.risk), a.level === "Serious risk" ? T.serious : a.level].filter(Boolean)
        .map((t) => `<span class="ac-tag">${esc(t)}</span>`)].join("");
    const meta = [
      a.production ? `${T.production} ${esc(a.production)}` : "",
      a.recall_code ? `${T.code} <b>${esc(a.recall_code)}</b>` : "",
      a.notified_by ? `${T.by} ${esc(country(a.notified_by))}` : "",
    ].filter(Boolean).join(" · ");
    return `<li class="rc"><div class="rc__head"><h3 class="rc__title">${esc(name)}</h3><span class="rc__date">${day(a.date)}</span></div>
      <p>${esc(hazard(a.hazard))}</p>${a.measure ? `<p class="rc__meta">${esc(tr(a.measure))}</p>` : ""}
      <div class="rc__tags">${tags}</div><p class="rc__meta">${meta}${meta ? " · " : ""}<a href="${esc(a.url)}" rel="noopener">${T.alert}</a></p></li>`;
  }

  function usItem(c) {
    const flags = [c.do_not_drive && `<span class="ac-status ac-status--over">${T.doNotDrive}</span>`,
      c.park_outside && `<span class="ac-status ac-status--over">${T.parkOutside}</span>`,
      c.over_the_air && `<span class="ac-status ac-status--ok">${T.ota}</span>`].filter(Boolean).join("");
    return `<li class="rc"><div class="rc__head"><h3 class="rc__title">${esc(c.component || c.id)}</h3><span class="rc__date">${day(c.date)}</span></div>
      <p>${esc(c.summary)} ${esc(c.consequence || "")}</p>${flags ? `<div class="rc__tags">${flags}</div>` : ""}
      <p class="rc__meta">${T.years} ${esc((c.model_years || []).join(", "))} · <a href="${esc(c.url)}" rel="noopener">${T.nhtsa} ${esc(c.id)}</a></p></li>`;
  }

  function list(el, rows, render, empty, limit = 8) {
    if (!rows.length) { el.innerHTML = `<li class="ac-caption">${empty}</li>`; return; }
    el.innerHTML = rows.slice(0, limit).map(render).join("");
    if (rows.length > limit) {
      el.insertAdjacentHTML("beforeend", `<li class="more"><button type="button" class="ac-btn ac-btn--ghost">${T.showAll(rows.length)}</button></li>`);
      el.querySelector(".more button").addEventListener("click", () => list(el, rows, render, empty, Infinity));
    }
  }

  function readouts(eu, us) {
    const r = (v, b, md) => `<div class="ac-readout${md ? " ac-readout--md" : ""}"><div class="ac-readout__value">${v}</div><div class="ac-readout__basis">${b}</div></div>`;
    const fire = eu.filter((a) => /fire/i.test(a.risk || "")).length;
    $("readouts").innerHTML = r(eu.length, T.match) + r(fire, T.fire, true) + (us ? r(us.length, T.us, true) : "")
      + r(eu[0] ? day(eu[0].date) : T.none, T.latest, true);
  }

  // What to ask the seller or a garage, sharpened by the kinds of recall that apply.
  const ASK = zh ? {
    vin: "向卖家要车架号（VIN，17 位，在行驶证即 Zulassungsbescheinigung Teil I 的 E 栏），请该品牌的授权维修站查询是否有未处理的召回和服务活动。免费，几分钟就好。",
    book: "在保养手册或发票里找召回编号。召回维修是免费的，诚实的卖家能拿出已处理的证明。",
    letter: "问一问是否收到过厂商或（在德国）KBA 寄来的召回信。KBA 会写信给车主，对置之不理的召回可以勒令车辆停驶。",
    import: "车是从美国进口的？再到 NHTSA 查一下车架号。",
    fire: "有起火风险时：问清楚在修好之前是否有临时建议（比如停在室外或只充到 80 %），以及是否已经修好。",
    hv: "高压电池召回：问清楚是更换了电池或模组，还是只更新了软件，并要求查看电池健康度 (SoH)。",
    airbag: "安全气囊召回：要求书面确认已经更换。有些召回建议在更换前不要驾驶。",
    unsure: "如果没有证明，就把完成召回维修写进购车合同，作为成交条件。",
  } : de ? {
    vin: "Frag nach der Fahrgestellnummer (FIN, 17 Zeichen, steht in der Zulassungsbescheinigung Teil I, Feld E) und lass bei einer Vertragswerkstatt der Marke offene Rückrufe und Serviceaktionen abfragen. Das ist kostenlos und dauert ein paar Minuten.",
    book: "Schau im Serviceheft oder in den Rechnungen nach den Rückrufcodes. Rückrufarbeiten sind kostenlos, ein seriöser Verkäufer hat dafür einen Nachweis.",
    letter: "Frag, ob ein Brief vom Hersteller oder vom KBA zu einem Rückruf kam. Das KBA schreibt die Halter an und kann bei ignorierten Rückrufen die Stilllegung anordnen.",
    import: "Kommt das Auto aus den USA? Dann prüf die FIN zusätzlich bei der NHTSA.",
    fire: "Bei Brandgefahr: Frag, ob bis zur Reparatur Auflagen gelten, etwa draußen parken oder nur bis 80 % laden, und ob die Reparatur schon gemacht ist.",
    hv: "Bei Rückrufen zur Hochvoltbatterie: Frag, ob die Batterie oder Module getauscht wurden oder nur ein Software-Update kam, und lass dir den Batteriezustand (SoH) zeigen.",
    airbag: "Bei Airbag-Rückrufen: Lass dir den Tausch schriftlich bestätigen. Manche Rückrufe raten, bis dahin nicht zu fahren.",
    unsure: "Fehlt der Nachweis, mach die Erledigung der Rückrufe zur Bedingung im Kaufvertrag.",
  } : {
    vin: "Ask for the VIN (17 characters, on the registration certificate) and have a dealer of the brand check it for open recalls and service campaigns. It is free and takes a few minutes.",
    book: "Look for the recall codes in the service book or invoices. Recall work is free, so an honest seller can show proof it was done.",
    letter: "Ask whether a recall letter came from the maker or, in Germany, from the KBA. The KBA writes to keepers and can take cars off the road when recalls are ignored.",
    import: "Imported from the US? Check the VIN with NHTSA too.",
    fire: "For fire risks: ask whether any interim advice applies until the fix, such as parking outside or charging to 80% only, and whether the fix is done.",
    hv: "For high-voltage battery recalls: ask whether the battery or modules were replaced or only the software updated, and ask to see the battery health (SoH).",
    airbag: "For airbag recalls: get the replacement confirmed in writing. Some recalls advise not to drive until then.",
    unsure: "Without proof, make the completed recall work a condition in the sales contract.",
  };
  const LINKS = zh ? [
    ["https://www.kba.de/EN/Themen_en/Marktueberwachung_en/Rueckrufe_en/rueckrufe_node_en.html", "德国 KBA 的召回页面和召回数据库（英文）"],
    ["https://www.nhtsa.gov/recalls", "NHTSA 车架号查询（美国进口车，英文）"],
  ] : de ? [
    ["https://www.kba.de/DE/Themen/Marktueberwachung/Rueckrufe/rueckrufe_node.html", "Rückrufe beim KBA, mit der Rückrufdatenbank"],
    ["https://www.nhtsa.gov/recalls", "FIN-Abfrage der NHTSA (Autos aus den USA)"],
  ] : [
    ["https://www.kba.de/EN/Themen_en/Marktueberwachung_en/Rueckrufe_en/rueckrufe_node_en.html", "Recalls at Germany's KBA, with its recall database"],
    ["https://www.nhtsa.gov/recalls", "NHTSA VIN lookup (cars from the US)"],
  ];
  const MAKER = { bmw: "https://www.bmwgroup.com/en/general/regulations/recall/recall-german.html", mini: "https://www.bmwgroup.com/en/general/regulations/recall/recall-german.html" };

  function advice(rows, brandSlug) {
    const has = (key) => rows.some((a) => a.component === key);
    const items = [ASK.vin, ASK.book, ASK.letter];
    if (rows.some((a) => /fire/i.test(a.risk || ""))) items.push(ASK.fire);
    if (has("hv_battery")) items.push(ASK.hv);
    if (has("airbags_belts")) items.push(ASK.airbag);
    items.push(ASK.import, ASK.unsure);
    const codes = [...new Set(rows.map((a) => a.recall_code).filter(Boolean))].slice(0, 20);
    const links = [...(MAKER[brandSlug] ? [[MAKER[brandSlug], de ? "FIN-Prüfung der BMW Group" : zh ? "BMW 集团车架号查询" : "BMW Group VIN check"]] : []), ...LINKS];
    $("ask").innerHTML = `<ol class="ask">${items.map((t) => `<li>${esc(t)}</li>`).join("")}</ol>`
      + (codes.length ? `<p class="ask__codes">${T.codesAsk} ${codes.map((c) => `<code>${esc(c)}</code>`).join(" ")}</p>` : "")
      + `<p class="ask__links">${links.map(([u, t]) => `<a href="${u}" rel="noopener">${esc(t)}</a>`).join(" · ")}</p>`;
  }

  /* ---------- used electric car: the battery (battery.js) ---------- */
  const B = window.EvBattery;
  const BAT = zh ? {
    hv: "这款车型的高压电池和充电召回", hvNone: "这款车型没有高压电池或充电相关的召回", hvBrand: "这个品牌的高压电池和充电召回",
    until: (y) => `电池质保到 ${y} 年左右`, over: "电池质保已过期", left: (y, k) => `${y < 1 ? "不到 1 年" : `还剩约 ${y} 年`}${k != null ? `、${k.toLocaleString("zh-CN")} 公里` : ""}`,
    terms: (w) => `${w.years} 年或 ${w.km.toLocaleString("zh-CN")} 公里，容量至少 ${w.soh} %`, pick: "选择品牌和首次登记年份，看质保还剩多久", unknownBrand: "这个品牌的电池质保不在我们的列表中，请看车辆文件",
    q: {
      soh: "要一份电池健康度 (SoH) 证明，而不只是仪表上的续航。用了几年还在 90 % 以上很正常；低于质保的 70 % 时，厂商负责维修或更换。",
      test: "没有证明？可以做一次独立的电池检测（例如检测机构 DEKRA、TÜV，或该品牌的授权维修站），不到一天就能完成。",
      warranty: "看电池质保还剩多少：自首次登记起的年数和公里数都算（见下表）。质保会转给你。",
      fast: "问一问车是怎么充电的。主要在家用交流电充最温和；出租车或租赁车每天快充，电池损耗更快。",
      range: "试驾时尽量充满，把显示的续航和官方 WLTP 续航对比一下。冬天会少一些。",
      charger: "查一下这个版本的车载充电机（交流 kW）和直流快充功率：较老或较便宜的版本充电慢很多。",
      cable: "问清楚是否附带 Type 2 充电线，以及（如果原来有的话）便携充电器。",
    },
    notes: { tesla: "Tesla：Model 3 和 Model Y 长续航版和高性能版为 192,000 公里；Model S 和 X 为 240,000 公里。", toyota: "Toyota：每年在授权经销商做电池检查，质保最长可延至 10 年或 1,000,000 公里。" },
    asof: (d) => `厂商公布的条款，截至 ${d}。`, yrs: (n) => `${n} 年电池质保`,
  } : de ? {
    hv: "Rückrufe zu Hochvoltbatterie und Laden für dieses Modell", hvNone: "Für dieses Modell gibt es keine Rückrufe zu Hochvoltbatterie oder Laden", hvBrand: "Rückrufe zu Hochvoltbatterie und Laden bei dieser Marke",
    until: (y) => `Batteriegarantie bis etwa ${y}`, over: "Batteriegarantie abgelaufen", left: (y, k) => `${y < 1 ? "weniger als ein Jahr" : y === 1 ? "noch etwa 1 Jahr" : `noch etwa ${y} Jahre`}${k != null ? ` und ${k.toLocaleString("de-DE")} km` : ""}`,
    terms: (w) => `${w.years} Jahre oder ${w.km.toLocaleString("de-DE")} km, mindestens ${w.soh} % Kapazität`, pick: "Wähl Marke und Erstzulassung, um zu sehen, wie lange die Garantie noch läuft", unknownBrand: "Die Batteriegarantie dieser Marke haben wir nicht in der Liste; schau in die Unterlagen des Autos",
    q: {
      soh: "Lass dir ein Zertifikat zum Batteriezustand (SoH) zeigen, nicht nur die Reichweite im Display. Über 90 % nach ein paar Jahren ist normal; unter den 70 % der Garantie repariert oder tauscht der Hersteller.",
      test: "Kein Zertifikat? Ein unabhängiger Batterietest (etwa bei DEKRA, TÜV oder einer Vertragswerkstatt der Marke) dauert weniger als einen Tag.",
      warranty: "Prüf, wie viel Batteriegarantie bleibt: Jahre seit Erstzulassung und Kilometer zählen beide (Tabelle unten). Die Garantie geht auf dich über.",
      fast: "Frag, wie das Auto geladen wurde. Meist zu Hause mit Wechselstrom ist am schonendsten; ein Taxi- oder Mietwagenleben mit täglichem Schnellladen nutzt die Batterie stärker ab.",
      range: "Lad bei der Probefahrt möglichst auf 100 % und vergleich die angezeigte Reichweite mit der offiziellen WLTP-Reichweite. Im Winter ist es weniger.",
      charger: "Prüf das Bordladegerät (AC in kW) und die DC-Ladeleistung der Version: Ältere und günstigere Versionen laden deutlich langsamer.",
      cable: "Frag nach dem Typ-2-Ladekabel und, falls dabei, dem mobilen Ladegerät.",
    },
    notes: { tesla: "Tesla: Model 3 und Model Y Long Range und Performance 192.000 km, Model S und X 240.000 km.", toyota: "Toyota: Mit jährlichem Batterie-Check beim Händler verlängert sich die Garantie auf bis zu 10 Jahre oder 1.000.000 km." },
    asof: (d) => `Bedingungen der Hersteller, Stand ${d}.`, yrs: (n) => `${n} Jahre Batteriegarantie`,
  } : {
    hv: "High-voltage battery and charging recalls for this model", hvNone: "No high-voltage battery or charging recalls for this model", hvBrand: "High-voltage battery and charging recalls for this brand",
    until: (y) => `Battery warranty until about ${y}`, over: "Battery warranty has run out", left: (y, k) => `${y < 1 ? "less than a year" : y === 1 ? "about 1 year" : `about ${y} years`}${k != null ? ` and ${k.toLocaleString("en-GB")} km` : ""} left`,
    terms: (w) => `${w.years} years or ${w.km.toLocaleString("en-GB")} km, at least ${w.soh} % capacity`, pick: "Pick the brand and first registration to see how long the warranty runs", unknownBrand: "We do not have this brand's battery warranty; check the car's documents",
    q: {
      soh: "Ask for a battery health (SoH) certificate, not just the range on the dashboard. Above 90 % after a few years is normal; below the warranty's 70 % the maker repairs or replaces it.",
      test: "No certificate? An independent battery test (for example at DEKRA, TÜV or a dealer of the brand) takes less than a day.",
      warranty: "Check how much battery warranty is left: years since first registration and km both count (table below). It passes to you.",
      fast: "Ask how the car was charged. Mostly at home on AC is gentlest; a taxi or rental life with daily fast charging wears the battery faster.",
      range: "On the test drive, charge to 100 % if you can and compare the range shown with the official WLTP range. Expect less in winter.",
      charger: "Check the version's onboard charger (AC kW) and DC charging speed: older and cheaper versions charge much more slowly.",
      cable: "Ask for the Type 2 charging cable and, if it came with one, the portable charger.",
    },
    notes: { tesla: "Tesla: Model 3 and Model Y Long Range and Performance 192,000 km; Model S and X 240,000 km.", toyota: "Toyota: with a yearly battery check at a dealer the cover extends up to 10 years or 1,000,000 km." },
    asof: (d) => `Terms published by the makers, as of ${d}.`, yrs: (n) => `${n}-year battery warranty`,
  };
  let batKm = (() => { const v = parseInt(new URLSearchParams(location.search).get("km"), 10); return v >= 0 && v < 1e6 ? v : null; })();
  function battery(rows, brandRows) {
    if (!B || !$("battery")) return;
    const card = (v, basis, cls) => `<div class="ac-readout ac-readout--md"><span class="ac-readout__value${cls ? " " + cls : ""}">${v}</span><span class="ac-readout__basis">${esc(basis)}</span></div>`;
    const hv = rows.filter((a) => a.component === "hv_battery").length;
    const hvB = brandRows.filter((a) => a.component === "hv_battery").length;
    const c = B.cover(state.brand, state.year || null, batKm, new Date().getFullYear());
    let html = state.model ? card(String(hv), hv ? BAT.hv : BAT.hvNone, hv ? "bad" : "good") : card(String(hvB), BAT.hvBrand);
    if (!c.warranty) html += card("–", BAT.unknownBrand);
    else if (c.covered == null) html += card(esc(BAT.yrs(c.warranty.years)), BAT.terms(c.warranty) + " · " + BAT.pick);
    else html += card(c.covered ? BAT.until(c.until_year) : BAT.over, (c.covered ? BAT.left(c.years_left, c.km_left) + " · " : "") + BAT.terms(c.warranty), c.covered ? "good" : "bad");
    $("bat-out").innerHTML = html;
    $("bat-ask").innerHTML = B.QUESTIONS.map((k) => `<li>${esc(BAT.q[k])}</li>`).join("");
    const mine = c.warranty ? c.warranty.brand : null;
    $("bat-body").innerHTML = B.WARRANTY.map((w) => `<tr${w.brand === mine ? ' class="is-mine"' : ""}><td>${esc(w.brand)}${w.note ? " *" : ""}</td><td class="num">${w.years}</td><td class="num">${w.km.toLocaleString(de ? "de-DE" : zh ? "zh-CN" : "en-GB")}</td><td class="num">${w.soh} %</td></tr>`).join("");
    $("bat-notes").textContent = Object.keys(BAT.notes).map((k) => "* " + BAT.notes[k]).join(" ") + " " + BAT.asof(B.AS_OF);
  }
  if ($("bat-km")) {
    if (batKm != null) $("bat-km").value = batKm;
    $("bat-km").addEventListener("input", () => {
      const v = parseInt($("bat-km").value, 10);
      batKm = v >= 0 && v < 1e6 ? v : null;
      const url = new URL(location.href);
      if (batKm != null) url.searchParams.set("km", batKm); else url.searchParams.delete("km");
      history.replaceState(null, "", url);
      if (lastBat) battery(lastBat[0], lastBat[1]);
    });
  }
  let lastBat = null;

  /* ---------- state ---------- */
  let followed = [], brands = [], brandData = null, stats = null, statMode = "per";
  const state = { brand: "", model: "", year: 0 };
  const ALIAS = { vw: "volkswagen", mercedes: "mercedes-benz" };
  // Safety Gate spells some makers several ways. The brand list shows only car brands (alerts that name a
  // passenger car), and these extra spellings are folded into the brand(s) they belong to.
  const MERGE = {
    volkswagen: ["vw-volkswagen", "vw-nutzfahrzeuge", "vw-commercial-vehicles"],
    "mercedes-benz": ["a-class"],
    "land-rover": ["1-land-rover-2-range-rover"],
    jaguar: ["jaguar-land-rover-limited"],
    "mg-motor": ["mg3"],
    peugeot: ["peugot", "peugeot-citroen-ds"],
    citroen: ["citroen-et-ds-automobile", "peugeot-citroen-ds"],
    ds: ["citroen-et-ds-automobile", "peugeot-citroen-ds"],
    cadillac: ["general-motors-company-llc"],
    chevrolet: ["general-motors-company-llc"],
  };
  const FOLDED = new Set(Object.values(MERGE).flat());

  function followedFor(brand, modelKey) {
    if (!modelKey) return null;
    return followed.find((m) => {
      const [b, ...rest] = m.model.split(" ");
      return (ALIAS[b.toLowerCase()] || b.toLowerCase()) === brand.slug && norm(rest.join(" ")) === modelKey;
    }) || null;
  }

  async function loadBrand(slug) {
    if (brandData && brandData.slug === slug) return brandData;
    const b = brands.find((x) => x.slug === slug);
    const extra = (MERGE[slug] || []).map((x) => brands.find((y) => y.slug === x)).filter(Boolean);
    const all = await Promise.all([get(`eu/${b.file}`), ...extra.map((x) => get(`eu/${x.file}`).catch(() => ({ alerts: [] })))]);
    // the folded spellings' alerts, newest first with the brand's own
    const alerts = all.length > 1 ? all.flatMap((d) => d.alerts).sort((p, q) => String(q.date || "").localeCompare(String(p.date || ""))) : all[0].alerts;
    brandData = { slug, b, alerts, models: modelOptions(alerts, b.brand) };
    return brandData;
  }

  // car brands only; a brand from an old link that is not one of them still gets its own option
  function drawBrandList() {
    const cars = brands.filter((x) => x.passenger_cars > 0 && !FOLDED.has(x.slug) || x.slug === state.brand);
    $("brand").innerHTML = cars.sort((x, y) => x.brand.localeCompare(y.brand, T.locale))
      .map((x) => `<option value="${x.slug}">${esc(x.brand)}</option>`).join("");
  }

  async function show() {
    const url = new URL(location.href);
    ["model", "brand", "year"].forEach((k) => url.searchParams.delete(k));
    if (state.brand) url.searchParams.set("brand", state.brand);
    if (state.model) url.searchParams.set("model", state.model);
    if (state.year) url.searchParams.set("year", state.year);
    history.replaceState(null, "", url);
    local(url.searchParams.toString());

    const bd = await loadBrand(state.brand);
    if (![...$("brand").options].some((o) => o.value === state.brand)) drawBrandList();
    $("brand").value = state.brand;
    $("model").innerHTML = `<option value="">${T.allModels(bd.alerts.length)}</option>`
      + bd.models.map((m) => `<option value="${esc(m.key)}">${esc(m.name)} (${m.n})</option>`).join("");
    if (state.model && !bd.models.some((m) => m.key === state.model)) state.model = "";
    $("model").value = state.model;
    $("year").value = state.year || "";

    const modelName = state.model ? bd.models.find((m) => m.key === state.model).name : "";
    const all = bd.alerts.filter((a) => namesModel(a, bd.b.brand, state.model));
    const eu = state.year ? all.filter((a) => fits(a, state.year) !== false) : all;
    const f = followedFor(bd.b, state.model);
    let us = null;
    if (f && f.us_file) {
      us = await get(`us/models/${f.slug}.json`).then((d) => d.campaigns).catch(() => null);
      if (us && state.year) us = us.filter((c) => (c.model_years || []).some((y) => Math.abs(Number(y) - state.year) <= 1));
    }

    $("eu-title").textContent = T.title([bd.b.brand, modelName].filter(Boolean).join(" ") + (state.year ? ` (${state.year})` : ""));
    $("eu-desc").textContent = T.desc(state.year);
    list($("eu"), eu, (a) => euItem(a, state.year), T.noEu);
    const outside = all.length - eu.length;
    $("outside").hidden = !outside;
    $("outside").textContent = outside ? T.outside(outside) : "";
    $("us-card").hidden = !us;
    if (us) list($("us"), us, usItem, T.noUs);
    readouts(eu, us);
    advice(eu, state.brand);
    lastBat = [eu, bd.alerts]; battery(eu, bd.alerts);
    if (stats) drawBrands();
  }

  function initial() {
    const q = new URLSearchParams(location.search);
    const saved = new URLSearchParams(local() || "");
    for (const src of [q, saved]) {
      const old = followed.find((m) => m.slug === src.get("model")); // ?model=volvo-ex30
      if (old) return fromFollowed(old, src.get("year"));
      if (brands.some((b) => b.slug === src.get("brand"))) {
        return { brand: src.get("brand"), model: norm(src.get("model")), year: Number(src.get("year")) || 0 };
      }
    }
    const G = window.AlloGarage, a = G && G.active(); // the car picked in My cars
    if (a && a.make) {
      const slug = G.recallBrand(a.make);
      if (brands.some((b) => b.slug === slug)) return { brand: slug, model: G.recallModel(a.make, a.model), year: a.year || 0 };
    }
    try { // the car picked in the charging cost tool
      const car = new URLSearchParams(localStorage.getItem("allo-cars-ev-cost") || "").get("car");
      const m = car && followed.find((x) => car.toLowerCase().startsWith(x.model.toLowerCase()));
      if (m) return fromFollowed(m);
    } catch (e) {}
    return fromFollowed(followed.find((m) => m.slug === "volvo-ex30") || followed[0]);
  }
  function fromFollowed(m, year) {
    const [b, ...rest] = m.model.split(" ");
    const slug = ALIAS[b.toLowerCase()] || b.toLowerCase();
    return { brand: brands.some((x) => x.slug === slug) ? slug : brands[0].slug, model: norm(rest.join(" ")), year: Number(year) || 0 };
  }

  /* ---------- statistics ---------- */
  const SVGNS = 'xmlns="http://www.w3.org/2000/svg"';
  function drawYears() {
    const ys = stats.years, groups = [["cars", T.cars, "var(--car-2)"], ["vans_trucks", T.vans, "var(--series-3)"],
      ["two_wheelers", T.two, "var(--series-4)"], ["other", T.oth, "var(--ref-line)"]];
    const W = 480, H = 220, L = 34, B = 24, max = Math.max(...ys.map((y) => y.total)), top = Math.ceil(max / 100) * 100;
    const bw = (W - L) / ys.length;
    let svg = "";
    for (let v = 0; v <= top; v += top / 4) {
      const y = H - B - (v / top) * (H - B - 8);
      svg += `<line x1="${L}" x2="${W}" y1="${y}" y2="${y}" stroke="var(--chart-grid)"/><text x="${L - 6}" y="${y + 4}" text-anchor="end">${num(v)}</text>`;
    }
    ys.forEach((y, i) => {
      let base = H - B;
      const x = L + i * bw + bw * 0.15;
      for (const [k, , c] of groups) {
        const h = (y[k] / top) * (H - B - 8);
        base -= h;
        svg += `<rect x="${x}" y="${base}" width="${bw * 0.7}" height="${h}" fill="${c}"><title>${y.year}: ${num(y[k])}</title></rect>`;
      }
      svg += `<text x="${x + bw * 0.35}" y="${base - 5}" text-anchor="middle" style="fill:var(--ink);font-weight:700">${num(y.total)}</text>`;
      svg += `<text x="${x + bw * 0.35}" y="${H - 6}" text-anchor="middle">${y.year}${y.partial ? "*" : ""}</text>`;
    });
    $("st-years").innerHTML = `<div class="ac-chart"><svg ${SVGNS} viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(T.count)}">${svg}</svg></div>`
      + `<p class="legend">${groups.map(([, l, c]) => `<span><i style="background:${c}"></i>${esc(l)}</span>`).join("")}</p>`
      + `<p class="ac-caption">* ${T.partial}. ${esc(fireLine())}</p>`;
  }
  const fireLine = () => {
    const f = stats.years.reduce((s, y) => s + y.fire, 0), t = stats.years.reduce((s, y) => s + y.total, 0);
    return de ? `${Math.round(f / t * 100)} % aller Meldungen nennen Brandgefahr.` : zh ? `${Math.round(f / t * 100)} % 的通报提到起火风险。` : `${Math.round(f / t * 100)}% of all alerts name a fire risk.`;
  };

  function bars(el, rows, mine) {
    const max = Math.max(...rows.map((r) => r.v));
    el.innerHTML = `<ul class="bars">${rows.map((r) => `<li${r.key === mine ? ' class="is-mine"' : ""}><span class="bars__label">${esc(r.label)}</span>`
      + `<span class="bars__track"><span class="bars__fill" style="width:${(r.v / max * 100).toFixed(1)}%"></span></span>`
      + `<span class="bars__value">${esc(r.text)}</span></li>`).join("")}</ul>`;
  }
  function drawComponents() {
    const total = stats.components.reduce((s, c) => s + c.cars, 0);
    bars($("st-comp"), stats.components.filter((c) => c.cars).map((c) => ({ key: c.key, label: comp(c.key), v: c.cars,
      text: `${num(c.cars)} · ${Math.round(c.cars / total * 100)}${de ? " %" : "%"}` })));
  }
  function drawBrands() {
    const fmt = (v) => v.toLocaleString(T.locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 });
    const rows = statMode === "per"
      ? stats.brands.filter((b) => b.alerts_per_100k != null).sort((a, b) => b.alerts_per_100k - a.alerts_per_100k)
        .map((b) => ({ key: b.slug, label: b.brand, v: b.alerts_per_100k, text: `${fmt(b.alerts_per_100k)} · ${num(b.car_alerts)}` }))
      : stats.brands.slice(0, 25).map((b) => ({ key: b.slug, label: b.brand, v: b.car_alerts, text: num(b.car_alerts) }));
    bars($("st-brands"), rows, state.brand);
    document.querySelectorAll("#st-mode button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === statMode)));
  }
  async function loadStats() {
    try { stats = await get("eu/stats.json"); } catch (e) { $("stats").querySelector(".st-body").innerHTML = `<p class="ac-caption">${T.noStats}</p>`; return; }
    drawYears(); drawComponents(); drawBrands();
    if (stats.registrations_until) $("st-regs").textContent = `${stats.since}–${stats.registrations_until.slice(0, 4)}`;
    document.querySelectorAll("#st-mode button").forEach((b) => b.addEventListener("click", () => { statMode = b.dataset.mode; drawBrands(); }));
  }

  /* ---------- start ---------- */
  async function load() {
    const [m, b, latest] = await Promise.all([get("eu/models.json"), get("eu/brands.json"), get("eu/latest.json")]);
    followed = m.models; brands = b.brands.filter((x) => x.slug !== "unknown");
    drawBrandList();
    const now = new Date().getFullYear();
    $("year").innerHTML = `<option value="">${T.anyYear}</option>` + Array.from({ length: now - 1999 }, (_, i) => now - i).map((y) => `<option>${y}</option>`).join("");
    $("brand").addEventListener("change", (e) => { state.brand = e.target.value; state.model = ""; show(); });
    $("model").addEventListener("change", (e) => { state.model = e.target.value; show(); });
    $("year").addEventListener("change", (e) => { state.year = Number(e.target.value) || 0; show(); });
    list($("newest"), latest.newest, (a) => euItem(a), T.none, 5);
    $("asof").textContent = T.collected + new Date(latest.observed_at).toLocaleString(T.locale, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) + (T.dot || ".");
    Object.assign(state, initial());
    loadStats();
    await show();
  }
  load().catch((e) => {
    // Before the first collection (or if the files are briefly missing) say so, instead of a raw error.
    const msg = e.status === 404 ? T.notYet : T.failed + e.message;
    $("readouts").innerHTML = `<div class="ac-readout ac-readout--md"><div class="ac-readout__value">${T.unavailable}</div><div class="ac-readout__basis">${esc(msg)}</div></div>`;
    $("eu").innerHTML = $("newest").innerHTML = "";
    ["model", "brand", "year"].forEach((id) => { $(id).disabled = true; });
    $("brand").innerHTML = `<option>${T.unavailable}</option>`;
  });
})();
