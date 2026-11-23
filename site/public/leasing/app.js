/* Leasing mileage planner: how many km a year to put in a lease (usage scenarios added up), what more or
   fewer km in the contract cost, and where the odometer stands against the contract at checkpoints (today,
   end of month, quarter, year and lease), with a chart. Maths in /leasing/lease.js (also used by the MCP server).
   One script for /leasing/, /de/leasing/ and /zh/leasing/.
   Kept per car of My cars (assets/garage.js) on this device under "allo-cars-lease" as
     { v: 1, cars: { "<garage car id or _>": { plan, buf, extra, refund, rate, drive, start, months, km, odo0, tol, pm, readings: [{ date, km }] } } }
   Link parameters (a link or an AI can fill the page): plan=<label~km~times~per|…> with per wk (working week),
   w (week), m (month) or y (year) and label a preset id (commute, errands, weekend, holiday, family) or free text;
   buf=<% margin>, extra=<€/km>, refund=<€/km>, rate=<€/month per 1,000 km>, drive=<km a year you really drive>,
   start=<YYYY-MM-DD>, months, km=<km a year in the contract>, odo0=<odometer at handover>, odo=<odometer now>,
   at=<date of that reading>, tol=<free km>, pm=<km a month from now on>, mine=<My cars id>. */
(() => {
  const lang = (document.documentElement.lang || "en").slice(0, 2);
  const de = lang === "de", zh = lang === "zh";
  const T = zh ? {
    locale: "zh-CN",
    preset: { commute: "通勤", errands: "购物和日常", weekend: "周末出游", holiday: "度假", family: "探亲访友" },
    per: { wk: "每个工作周", w: "每周", m: "每月", y: "每年" },
    times: "次", add: (n) => `+ ${n}`, other: "+ 其他行程", otherName: "行程", del: "删除",
    perYear: (n) => `${n} 公里/年`, need: "你每年大约开", needB: (n) => `按上面 ${n} 项加起来`,
    pick: "建议合同里写", pickB: (m, k5) => `已含 ${m} 余量，按 2500 公里一档向上取整（按 5000 一档则是 ${k5}）`,
    termB: "合同期内的总里程",
    th: ["每年", (m) => `${m} 个月月租差`, "到期结算", "合计"],
    best: "最省", suggested: "建议",
    optNote: (d, x, r, k) => `与正好签 ${d} 相比。少签的每公里到期要付 ${x}，多签没用完的每公里退 ${r}，而多签 1000 公里每公里约合 ${k} 的月租。`,
    optMore: "多签一点通常比到期补付超出的公里更划算。", optLess: "按这些价格，少签一点、到期按公里补付更划算。",
    driveH: (n) => `你的计划：每年 ${n}。拖动滑块看看多开或少开会怎样。`,
    months: (n) => `${n} 个月`,
    remove: "删除", noReads: "还没有读数。没有读数时，预计里程按你的计划计算。", handover: "交车",
    cp: { today: "今天", month: "本月底", quarter: "本季度末", year: "年底", end: "合同到期" }, and: "和",
    cpH: ["检查点", "日期", "预计", "允许", "差额"],
    under: (n) => `少 ${n}`, over: (n) => `超 ${n}`, even: "持平",
    todayV: "今天", todayB: (a, o, d) => `今天允许 ${a} · 里程表 ${o}（${d}）`, expectedToday: (o) => `今天预计 ${o}`,
    endV: (d) => `到期 ${d}`, pay: (e) => `到期约需补付 ${e}`, back: (e) => `到期约退还 ${e}`, nothing: "在免费容差内，不用结算",
    ended: "合同已到期",
    src: { pace: (n) => `到目前为止每月 ${n}（按你的读数）`, plan: (n) => `按你的计划每月 ${n}`, allowance: (n) => `按合同每月 ${n}（开满两个月后改按你的实际速度）`, set: (n) => `你设的数；到目前为止每月 ${n}` },
    reset: "恢复", allowed: "允许", readings: "你的读数", expected: "预计", chart: "比额度多开或少开的公里",
    notStarted: (d) => `租期 ${d} 开始`,
    quick: "记录方式和备份", optHere: "在这台设备上：在上面输入，或在“我的车”的车辆卡片上输入。", optPhone: "手机快捷指令", optHome: "智能家居（Home Assistant）", showYaml: "显示自动化配置", yourData: "你的数据", showAll: (n) => `显示全部 ${n} 条读数`, showLess: "收起",
    loggedMsg: (k, d) => `已保存 ${k}（${d}）`, last: (d, n) => `最近一次读数：${d}（${n} 天前）`, lastNone: "还没有读数。",
    q1: "快捷链接：在链接末尾加上公里数并打开，就会存为今天的读数。可以加到书签或主屏幕。", copy: "复制", copied: "已复制",
    q2: "手机快捷指令（iPhone“快捷指令”、安卓自动化应用）：先“询问数字”，再“打开网址”：上面的链接 + 这个数字。放到主屏幕上，一点就能记。",
    q3: "Home Assistant：如果你的车有接入（例如 Volvo 集成里的里程传感器），这个自动化每月最后一天给手机发通知，点开就会记下当时的里程。把 sensor 和 notify 换成你自己的。",
    q4: "读数保存在打开链接的那个浏览器里，所以要用你平时看这个页面的同一个浏览器（iPhone 上：同一个浏览器或同一个已安装的应用）。",
    haTitle: "租赁里程", haMsg: "里程表", haTap: "点一下记录",
    csv: "下载读数（CSV）", bak: "备份我的全部数据", res: "从备份恢复", restored: (n) => `已从备份恢复（${n} 项）`, badFile: "这个文件不是 Allo Cars 备份。",
    histNote: "读数会作为历史记录保存在这台设备上（每天一条）。时不时备份一下：清除浏览器数据会把它们删掉。",
    csvH: ["日期", "里程表 km", "允许 km", "差额 km"],
    forCar: "租的是", noCar: "在“我的车”里加上你的车，每辆车可以单独保存租约。",
  } : de ? {
    locale: "de-DE",
    preset: { commute: "Arbeitsweg", errands: "Einkauf und Erledigungen", weekend: "Wochenendausflüge", holiday: "Urlaub", family: "Familienbesuche" },
    per: { wk: "pro Arbeitswoche", w: "pro Woche", m: "pro Monat", y: "pro Jahr" },
    times: "Mal", add: (n) => `+ ${n}`, other: "+ Andere Fahrt", otherName: "Fahrt", del: "Entfernen",
    perYear: (n) => `${n} km/Jahr`, need: "Du fährst rund", needB: (n) => `${n} Fahrten oben zusammengezählt`,
    pick: "Im Vertrag ansetzen", pickB: (m, k5) => `Mit ${m} Puffer, aufgerundet auf 2.500-km-Stufen (in 5.000er-Stufen ${k5})`,
    termB: "Gesamtkilometer über die Laufzeit",
    th: ["Pro Jahr", (m) => `Rate, ${m} Monate`, "Am Ende", "Zusammen"],
    best: "am günstigsten", suggested: "Vorschlag",
    optNote: (d, x, r, k) => `Im Vergleich zu genau ${d}. Jeder fehlende km kostet am Ende ${x}, jeder nicht gefahrene bringt ${r} zurück, während 1.000 km mehr im Vertrag rund ${k} je km Rate kosten.`,
    optMore: "Ein paar km mehr im Vertrag sind meist günstiger als Mehrkilometer am Ende.", optLess: "Bei diesen Preisen sind etwas weniger km im Vertrag und Mehrkilometer am Ende günstiger.",
    driveH: (n) => `Dein Plan: ${n} im Jahr. Schieb den Regler und sieh, was passiert, wenn du mehr oder weniger fährst.`,
    months: (n) => `${n} Monate`,
    remove: "Entfernen", noReads: "Noch keine Ablesung. Ohne Ablesung rechnet die Prognose mit deinem Plan.", handover: "Übergabe",
    cp: { today: "Heute", month: "Monatsende", quarter: "Quartalsende", year: "Jahresende", end: "Vertragsende" }, and: " und ",
    cpH: ["Zeitpunkt", "Datum", "Erwartet", "Erlaubt", "Differenz"],
    under: (n) => `${n} unter`, over: (n) => `${n} über`, even: "genau im Plan",
    todayV: "Heute", todayB: (a, o, d) => `Heute erlaubt ${a} · Tacho ${o} (${d})`, expectedToday: (o) => `heute erwartet ${o}`,
    endV: (d) => `Ende ${d}`, pay: (e) => `Am Ende rund ${e} nachzahlen`, back: (e) => `Am Ende rund ${e} zurück`, nothing: "Innerhalb der Toleranz, keine Abrechnung",
    ended: "Vertrag ist zu Ende",
    src: { pace: (n) => `Bisher ${n} im Monat (aus deinen Ablesungen)`, plan: (n) => `${n} im Monat laut deinem Plan`, allowance: (n) => `${n} im Monat laut Vertrag (nach zwei Monaten Fahren dein echtes Tempo)`, set: (n) => `Von dir gesetzt; bisher ${n} im Monat` },
    reset: "Zurücksetzen", allowed: "Erlaubt", readings: "Deine Ablesungen", expected: "Erwartet", chart: "Kilometer über oder unter dem Kontingent",
    notStarted: (d) => `Leasing beginnt am ${d}`,
    quick: "Eintragen und Sichern", optHere: "Auf diesem Gerät: oben eintragen oder auf der Auto-Karte unter „Meine Autos“.", optPhone: "Kurzbefehl auf dem Handy", optHome: "Smart Home (Home Assistant)", showYaml: "Automatisierung anzeigen", yourData: "Deine Daten", showAll: (n) => `Alle ${n} Ablesungen zeigen`, showLess: "Weniger zeigen",
    loggedMsg: (k, d) => `${k} für ${d} gespeichert`, last: (d, n) => `Letzte Ablesung: ${d} (vor ${n} Tagen)`, lastNone: "Noch keine Ablesung.",
    q1: "Schnell-Link: Kilometerstand hinten anhängen und öffnen, dann ist er als heutige Ablesung gespeichert. Als Lesezeichen oder auf dem Startbildschirm.", copy: "Kopieren", copied: "Kopiert",
    q2: "Kurzbefehl auf dem Handy (iPhone „Kurzbefehle“, Android eine Automatisierungs-App): „Nach Zahl fragen“, dann „URL öffnen“ mit dem Link oben + der Zahl. Auf den Startbildschirm legen, dann ist es ein Tipp.",
    q3: "Home Assistant: Wenn dein Auto dort eingebunden ist (z. B. der Kilometerstand-Sensor der Volvo-Integration), schickt diese Automatisierung am letzten Tag jedes Monats eine Mitteilung ans Handy. Ein Tipp darauf trägt den aktuellen Stand ein. Sensor und notify durch deine ersetzen.",
    q4: "Die Ablesung wird in dem Browser gespeichert, in dem du den Link öffnest. Nimm denselben Browser wie für diese Seite (auf dem iPhone: denselben Browser oder dieselbe installierte App).",
    haTitle: "Leasing-km", haMsg: "Kilometerstand", haTap: "Tippen zum Eintragen",
    csv: "Ablesungen herunterladen (CSV)", bak: "Alle meine Daten sichern", res: "Sicherung wiederherstellen", restored: (n) => `Aus der Sicherung wiederhergestellt (${n} Einträge)`, badFile: "Diese Datei ist keine Allo-Cars-Sicherung.",
    histNote: "Ablesungen bleiben als Verlauf auf diesem Gerät (eine pro Tag). Sichere sie ab und zu: Wenn du die Browserdaten löschst, sind sie weg.",
    csvH: ["Datum", "Kilometerstand km", "Erlaubt km", "Differenz km"],
    forCar: "Leasing für", noCar: "Leg dein Auto unter „Meine Autos“ an, dann merkt sich die Seite das Leasing für jedes Auto.",
  } : {
    locale: "en-GB",
    preset: { commute: "Commute", errands: "Shopping and errands", weekend: "Weekend trips", holiday: "Holidays", family: "Family visits" },
    per: { wk: "per working week", w: "per week", m: "per month", y: "per year" },
    times: "times", add: (n) => `+ ${n}`, other: "+ Other trip", otherName: "Trip", del: "Remove",
    perYear: (n) => `${n} km/yr`, need: "You drive about", needB: (n) => `${n} kinds of trips above, added up`,
    pick: "Put in the contract", pickB: (m, k5) => `With ${m} margin, rounded up to 2,500 km steps (${k5} in 5,000 km steps)`,
    termB: "Total km over the lease",
    th: ["A year", (m) => `Rate, ${m} months`, "At the end", "Together"],
    best: "cheapest", suggested: "suggested",
    optNote: (d, x, r, k) => `Compared with exactly ${d}. Each km short costs ${x} at the end, each km not driven returns ${r}, while 1,000 km more in the contract cost about ${k} per km in rate.`,
    optMore: "A few km more in the contract are usually cheaper than extra km at the end.", optLess: "At these prices, a few km less in the contract and paying extra km at the end is cheaper.",
    driveH: (n) => `Your plan: ${n} a year. Move the slider to see what happens if you drive more or less.`,
    months: (n) => `${n} months`,
    remove: "Remove", noReads: "No reading yet. Until there is one, expected km follow your plan.", handover: "Handover",
    cp: { today: "Today", month: "End of month", quarter: "End of quarter", year: "End of year", end: "End of lease" }, and: " and ",
    cpH: ["Checkpoint", "Date", "Expected", "Allowed", "Difference"],
    under: (n) => `${n} under`, over: (n) => `${n} over`, even: "right on plan",
    todayV: "Today", todayB: (a, o, d) => `Allowed today ${a} · odometer ${o} (${d})`, expectedToday: (o) => `expected today ${o}`,
    endV: (d) => `End ${d}`, pay: (e) => `About ${e} to pay at the end`, back: (e) => `About ${e} back at the end`, nothing: "Within the tolerance, nothing to settle",
    ended: "The lease has ended",
    src: { pace: (n) => `${n} a month so far (from your readings)`, plan: (n) => `${n} a month from your plan`, allowance: (n) => `${n} a month from the contract (your real pace after two months of driving)`, set: (n) => `Set by you; so far ${n} a month` },
    reset: "Reset", allowed: "Allowed", readings: "Your readings", expected: "Expected", chart: "Km over or under the allowance",
    notStarted: (d) => `Lease starts ${d}`,
    quick: "Logging and backup", optHere: "On this device: type it above, or on the car's card in My cars.", optPhone: "Phone shortcut", optHome: "Smart home (Home Assistant)", showYaml: "Show the automation", yourData: "Your data", showAll: (n) => `Show all ${n} readings`, showLess: "Show fewer",
    loggedMsg: (k, d) => `Saved ${k} for ${d}`, last: (d, n) => `Last reading: ${d} (${n} days ago)`, lastNone: "No reading yet.",
    q1: "Quick-log link: add the km at the end and open it, and it is saved as today's reading. Bookmark it or add it to your home screen.", copy: "Copy", copied: "Copied",
    q2: "Phone shortcut (Shortcuts on iPhone, an automation app on Android): \u201cAsk for number\u201d, then \u201cOpen URL\u201d with the link above + that number. Put it on the home screen and it is one tap.",
    q3: "Home Assistant: if your car is connected there (the Volvo integration has an odometer sensor, for example), this automation sends your phone a notification on the last day of each month. Tapping it logs the odometer of that moment. Replace the sensor and notify names with yours.",
    q4: "The reading is saved in the browser that opens the link, so use the same browser you use for this page (on iPhone: the same browser or the same installed app).",
    haTitle: "Lease km", haMsg: "Odometer", haTap: "Tap to log it",
    csv: "Download readings (CSV)", bak: "Back up all my data", res: "Restore a backup", restored: (n) => `Restored from the backup (${n} items)`, badFile: "That file is not an Allo Cars backup.",
    histNote: "Readings stay on this device as history (one a day). Back them up now and then: clearing the browser's data deletes them.",
    csvH: ["date", "odometer_km", "allowed_km", "difference_km"],
    forCar: "Lease for", noCar: "Add your car on My cars and the page keeps a lease for each car.",
  };
  const L = window.AlloLease, G = window.AlloGarage;
  const PRE = de ? "/de" : zh ? "/zh" : "";
  const KEY = "allo-cars-lease", KEYP = "allo-cars-lease-plan", TERMS = [24, 36, 48];
  const $ = (id) => document.getElementById(id);
  // one script, two pages: /leasing/plan/ works out the km to put in a lease (before you sign, no car);
  // /leasing/ tracks the lease of a car you have (contract, odometer, checkpoints)
  const PLAN = !!$("plan");
  const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const nf = (v) => new Intl.NumberFormat(T.locale, { maximumFractionDigits: 0 }).format(Math.round(v));
  const km = (v) => `${nf(v)} km`;
  const eur = (v, d = 0) => new Intl.NumberFormat(T.locale, { style: "currency", currency: "EUR", minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
  const pct = (v) => `${nf(v)} %`;
  const date = (s) => new Date(L.day(s)).toLocaleDateString(T.locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const store = (v, k) => { k = k || KEY; try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || "null"); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } };
  const PLAN_KEYS = ["plan", "buf", "extra", "refund", "rate", "drive", "months"];

  const D = L.DEFAULTS;
  const fresh = () => ({
    plan: L.PRESETS.slice(0, 4).map((p) => ({ id: p.id, label: "", km: p.km, n: p.n, per: p.per })),
    buf: D.buf, extra: D.extra, refund: D.refund, rate: D.rate, drive: null,
    start: "", months: D.months, km: null, odo0: null, tol: 0, pm: null, readings: [],
  });
  let carId = "_", S = fresh(), logged = null, showAllReads = false;

  const numP = (q, k, lo, hi) => { const v = parseFloat(q.get(k)); return isFinite(v) && v >= lo && v <= hi ? v : null; };
  function fromUrl(q) {
    const s = fresh();
    if (q.get("plan") != null) {
      s.plan = q.get("plan").split("|").filter(Boolean).slice(0, 20).map((x) => {
        const [label, k, n, per] = x.split("~");
        const preset = L.PRESETS.find((p) => p.id === label);
        return { id: preset ? preset.id : "", label: preset ? "" : String(label || "").slice(0, 60), km: Number(k) || 0, n: Number(n) || 0, per: L.PER[per] ? per : "w" };
      });
    }
    [["buf", 0, 100], ["extra", 0, 5], ["refund", 0, 5], ["rate", 0, 1000], ["drive", 0, 500000], ["months", 1, 120], ["km", 1000, 200000], ["odo0", 0, 2000000], ["tol", 0, 100000], ["pm", 0, 50000]]
      .forEach(([k, lo, hi]) => { const v = numP(q, k, lo, hi); if (v != null) s[k] = v; });
    if (L.day(q.get("start"))) s.start = q.get("start");
    return s;
  }
  function load() {
    const q = new URLSearchParams(location.search);
    if (PLAN) {
      S = Object.assign(fresh(), store(undefined, KEYP) || {});
      const u = fromUrl(q);
      PLAN_KEYS.forEach((k) => { if (k !== "plan" && q.has(k) && isFinite(parseFloat(q.get(k)))) S[k] = u[k]; });
      if (q.has("plan")) S.plan = u.plan;
      return;
    }
    const cars = G ? G.list() : [];
    const mine = q.get("mine") && cars.find((c) => c.id === q.get("mine"));
    const pick = mine || (G && G.active()) || cars[0];
    carId = pick ? pick.id : "_";
    const all = store() || { v: 1, cars: {} };
    const saved = all.cars && all.cars[carId];
    // start from what is kept for this car; link parameters change only what they name, so a quick-log
    // link (?mine=<id>&odo=<km>&at=<date>) adds a reading and leaves the plan and contract as they are
    S = Object.assign(fresh(), saved || {});
    S.readings = Array.isArray(S.readings) ? S.readings.slice() : [];
    const u = fromUrl(q);
    ["extra", "refund", "start", "months", "km", "odo0", "tol", "pm"].forEach((k) => { if (q.has(k) && (k === "start" ? L.day(q.get(k)) : isFinite(parseFloat(q.get(k))))) S[k] = u[k]; });
    const odo = numP(q, "odo", 0, 2000000);
    if (odo != null) {
      const d = L.day(q.get("at")) && q.get("at") <= todayIso() ? q.get("at") : todayIso();
      const had = S.readings.find((r) => r.date === d && r.km === Math.round(odo));
      addReading(d, odo, true);
      if (!had) logged = { date: d, km: Math.round(odo) };
    }
  }
  function save() {
    if (PLAN) { const o = {}; PLAN_KEYS.forEach((k) => { o[k] = S[k]; }); store(o, KEYP); return; }
    const all = store() || { v: 1, cars: {} };
    all.cars = all.cars || {};
    all.cars[carId] = S;
    store(all);
    try { dispatchEvent(new CustomEvent("ac:lease", { detail: { car: carId } })); } catch (e) {}
  }
  function url() {
    const q = new URLSearchParams();
    if (PLAN) {
      q.set("plan", S.plan.map((p) => [p.id || (p.label || "").replace(/[|~]/g, " "), p.km, p.n, p.per].join("~")).join("|"));
      q.set("buf", S.buf); q.set("months", S.months);
      if (S.drive != null) q.set("drive", S.drive);
      ["extra", "refund", "rate"].forEach((k) => q.set(k, S[k]));
      history.replaceState(null, "", `${location.pathname}?${q.toString().replace(/%7E/gi, "~").replace(/%7C/gi, "|")}${location.hash}`);
      return;
    }
    if (carId !== "_") q.set("mine", carId);
    ["extra", "refund"].forEach((k) => q.set(k, S[k]));
    if (S.start) {
      q.set("start", S.start); q.set("months", S.months);
      if (S.km) q.set("km", S.km);
      if (S.odo0 != null) q.set("odo0", S.odo0);
      if (S.tol) q.set("tol", S.tol);
      const r = S.readings[S.readings.length - 1];
      if (r) { q.set("odo", r.km); q.set("at", r.date); }
      if (S.pm != null) q.set("pm", S.pm);
    }
    history.replaceState(null, "", `${location.pathname}?${q.toString().replace(/%7E/gi, "~").replace(/%7C/gi, "|")}${location.hash}`);
  }
  function addReading(d, v, quiet) {
    S.readings = S.readings.filter((r) => r.date !== d).concat([{ date: d, km: Math.round(v) }]).sort((a, b) => a.date < b.date ? -1 : 1).slice(-5000);
    if (!quiet) changed();
  }

  /* ---------- 1 plan ---------- */
  const label = (p) => p.id && !p.label ? T.preset[p.id] : p.label;
  function rowHtml(p, i) {
    const opts = Object.keys(L.PER).map((k) => `<option value="${k}"${p.per === k ? " selected" : ""}>${esc(T.per[k])}</option>`).join("");
    return `<div class="sc-row" data-i="${i}"><input class="nm" data-f="label" value="${esc(label(p))}" placeholder="${esc(T.otherName)}" aria-label="${esc(T.otherName)}"><span class="km u"><input data-f="km" type="number" min="0" max="100000" step="1" inputmode="numeric" value="${p.km}" aria-label="km"><i>km</i></span><span class="x">×</span><span class="n u"><input data-f="n" type="number" min="0" max="1000" step="1" inputmode="numeric" value="${p.n}" aria-label="${esc(T.times)}"><i>${esc(T.times)}</i></span><select class="per" data-f="per" aria-label="${esc(T.per.w)}">${opts}</select><span class="yr"></span><button type="button" class="ac-btn ac-btn--quiet del" data-del="${i}" aria-label="${esc(T.del)}">×</button></div>`;
  }
  function drawPlan() {
    const box = $("sc");
    [].slice.call(box.querySelectorAll(".sc-row:not(.sc-head)")).forEach((r) => r.remove());
    box.insertAdjacentHTML("beforeend", S.plan.map(rowHtml).join(""));
    const have = new Set(S.plan.map((p) => p.id).filter(Boolean));
    $("presets").innerHTML = `<span class="ac-caption">${esc(zh ? "添加：" : de ? "Dazu:" : "Add:")}</span>` + L.PRESETS.filter((p) => !have.has(p.id)).map((p) => `<button type="button" class="ac-chip" data-add="${p.id}">${esc(T.add(T.preset[p.id]))}</button>`).join("") + `<button type="button" class="ac-chip" data-add="">${esc(T.other)}</button>`;
  }
  function planNumbers() {
    const p = L.plan(S.plan), r = L.recommend(p.total, S.buf);
    return { p, r };
  }
  function drawPlanOut() {
    const { p, r } = planNumbers();
    [].forEach.call($("sc").querySelectorAll(".sc-row[data-i]"), (row) => { const x = p.rows[+row.dataset.i]; row.querySelector(".yr").textContent = x ? T.perYear(nf(x.year)) : ""; });
    const months = S.months;
    $("plan-out").innerHTML = [
      [km(r.need), T.need, T.needB(p.rows.filter((x) => x.year > 0).length)],
      [km(r.step_2500), T.pick, T.pickB(pct(S.buf), km(r.step_5000))],
      [km(r.step_2500 * months / 12), T.termB, T.months(months)],
    ].map(([v, a, b], i) => `<div class="ac-readout ac-readout--md"><div class="ac-readout__basis">${esc(a)}</div><div class="ac-readout__value">${esc(v)}${i < 2 ? `<small> /${zh ? "年" : de ? "Jahr" : "yr"}</small>` : ""}</div><div class="ac-readout__basis">${esc(b)}</div></div>`).join("");
    drawOptions(p, r);
  }
  function drawOptions(p, r) {
    const drive = S.drive != null ? S.drive : r.need;
    if (document.activeElement !== $("drive")) $("drive").value = drive;
    $("driver").max = Math.max(60000, Math.ceil(drive * 1.5 / 5000) * 5000);
    $("driver").value = drive;
    $("drive-h").textContent = T.driveH(km(r.need));
    const months = S.months;
    const c = L.norm({ start: "2000-01-01", months, km: drive || 1000, extra: S.extra, refund: S.refund, tol: S.tol, rate: S.rate });
    const base = Math.max(2500, Math.round(drive / 2500) * 2500);
    const steps = new Set([-5000, -2500, 0, 2500, 5000].map((d) => base + d).filter((a) => a >= 2500));
    steps.add(r.step_2500);
    const rows = L.options(drive, c, [...steps].sort((a, b) => a - b));
    // relative to contracting exactly `drive` km
    const ref = { rate: (drive - base) / 1000 * S.rate * months };
    const min = Math.min(...rows.map((x) => x.total_eur - ref.rate));
    const sign = (v) => v === 0 ? "0" : `${v > 0 ? "+" : "−"}${nf(Math.abs(v))}`;
    $("opt").innerHTML = `<thead><tr><th>${esc(T.th[0])} (km)</th><th class="num">${esc(T.th[1](months))} (€)</th><th class="num">${esc(T.th[2])} (€)</th><th class="num">${esc(T.th[3])} (€)</th></tr></thead><tbody>` + rows.map((x) => {
      const rate = Math.round(x.rate_eur - ref.rate), tot = rate + x.settlement_eur, best = Math.round(tot) === Math.round(min);
      const tags = [best ? T.best : "", x.km === r.step_2500 ? T.suggested : ""].filter(Boolean);
      return `<tr class="${best ? "on" : ""}"><td><strong>${esc(nf(x.km))}</strong>${tags.length ? `<br><span class="ac-status ac-status--${best ? "ok" : "info"}">${esc(tags.join(" · "))}</span>` : ""}</td><td class="num">${sign(rate)}</td><td class="num ${x.settlement_eur > 0 ? "pos" : x.settlement_eur < 0 ? "neg" : ""}">${sign(x.settlement_eur)}</td><td class="num${best ? " on" : ""}">${sign(tot)}</td></tr>`;
    }).join("") + "</tbody>";
    const perKm = S.rate * 12 / 1000;
    $("opt-note").textContent = `${T.optNote(km(drive), eur(S.extra, 2), eur(S.refund, 2), eur(perKm, 3))} ${S.extra - perKm >= perKm - S.refund ? T.optMore : T.optLess}`;
  }

  /* ---------- 2 contract, 3 readings ---------- */
  function drawContract() {
    $("months").innerHTML = TERMS.concat(TERMS.includes(S.months) ? [] : [S.months]).map((m) => `<button type="button" data-m="${m}" aria-pressed="${S.months === m}">${esc(T.months(m))}</button>`).join("");
    const set = (id, v) => { if ($(id) && document.activeElement !== $(id)) $(id).value = v == null ? "" : v; };
    set("extra", S.extra); set("refund", S.refund);
    if (PLAN) { set("buf", S.buf); $("bufr").value = S.buf; set("rate", S.rate); return; }
    set("start", S.start); set("km", S.km); set("odo0", S.odo0); set("tol", S.tol || "");
    if (!$("rdate").value) $("rdate").value = todayIso();
    const all = S.readings.slice().reverse(), shown = showAllReads ? all : all.slice(0, 3);
    $("reads").innerHTML = S.readings.length
      ? shown.map((r) => `<li><span>${esc(date(r.date))}</span><strong>${esc(km(r.km))}</strong><button type="button" class="ac-btn ac-btn--quiet" data-rm="${esc(r.date)}">${esc(T.remove)}</button></li>`).join("")
      : `<li class="ac-caption" style="border:0">${esc(T.noReads)}</li>`;
    if (all.length > 3) $("reads").insertAdjacentHTML("beforeend", `<li style="border:0;justify-content:flex-start"><button type="button" class="ac-btn ac-btn--quiet" id="reads-more">${esc(showAllReads ? T.showLess : T.showAll(all.length))}</button></li>`);
  }

  /* ---------- checkpoints ---------- */
  function contract() { return { start: S.start, months: S.months, km: S.km || D.km, odo0: S.odo0, extra: S.extra, refund: S.refund, tol: S.tol }; }
  const cpName = (x) => [x.id].concat(x.also).map((k, i) => i && lang === "en" ? T.cp[k].toLowerCase() : T.cp[k]).join(T.and);
  const diffTxt = (d) => Math.abs(d) < 1 ? T.even : d > 0 ? T.over(km(d)) : T.under(km(-d));
  const diffCls = (d) => Math.abs(d) < 1 ? "" : d > 0 ? "pos" : "neg";
  function drawCheckpoints() {
    const ok = !!L.day(S.start);
    $("cp-empty").hidden = ok; $("cp-body").hidden = !ok;
    if (!ok) return;
    const opts = { today: todayIso(), per_month: S.pm };
    const ser = L.series(contract(), S.readings, opts), t = ser.track;
    const auto = L.track(contract(), S.readings, Object.assign({}, opts, { per_month: null }));
    if (document.activeElement !== $("pm")) $("pm").value = t.per_month;
    $("pmr").max = Math.max(5000, Math.ceil(t.per_month * 1.5 / 500) * 500);
    $("pmr").value = t.per_month;
    $("pm-h").innerHTML = esc(S.pm != null ? T.src.set(nf(auto.per_month)) : T.src[t.per_month_source](nf(t.per_month))) + (S.pm != null ? ` <button type="button" class="ac-btn ac-btn--quiet" id="pm-reset" style="padding:2px 10px;min-height:0">${esc(T.reset)}</button>` : "");
    const today = t.checkpoints.find((x) => x.id === "today") || t.checkpoints[0];
    const fresh = t.reading.date === todayIso();
    const endE = t.end.settlement_eur;
    const outs = [];
    if (!t.started) outs.push([T.notStarted(date(t.contract.start)), "", ""]);
    else outs.push([diffTxt(today.diff_km), T.todayV, T.todayB(km(today.allowed_km), km(t.reading.km), t.reading.handover ? T.handover : date(t.reading.date)) + (fresh || t.reading.handover && !S.readings.length ? "" : ` · ${T.expectedToday(km(today.expected_km))}`), diffCls(today.diff_km)]);
    outs.push([diffTxt(t.end.diff_km), T.endV(date(t.contract.end)), endE > 0 ? T.pay(eur(endE)) : endE < 0 ? T.back(eur(-endE)) : T.nothing, diffCls(t.end.diff_km)]);
    if (t.ended) outs.push([T.ended, "", ""]);
    $("cp-out").innerHTML = outs.map(([v, a, b, cls], i) => `<div class="ac-readout ac-readout--md">${a ? `<div class="ac-readout__basis">${esc(a)}</div>` : ""}<div class="ac-readout__value ${cls || ""}">${esc(v)}</div>${b ? `<div class="ac-readout__basis">${esc(b)}</div>` : ""}</div>`).join("");
    $("cp").innerHTML = `<thead><tr>${T.cpH.filter((h, i) => i !== 1).map((h, i) => `<th${i ? ' class="num"' : ""}>${esc(h)}${i ? " (km)" : ""}</th>`).join("")}</tr></thead><tbody>` + t.checkpoints.map((x) => {
      const name = cpName(x);
      return `<tr><td><strong>${esc(name)}</strong><small>${esc(date(x.date))}</small></td><td class="num">${esc(nf(x.expected_km))}</td><td class="num">${esc(nf(x.allowed_km))}</td><td class="num ${diffCls(x.diff_km)}">${esc(x.diff_km > 0 ? "+" : x.diff_km < 0 ? "−" : "")}${esc(nf(Math.abs(x.diff_km)))}</td></tr>`;
    }).join("") + "</tbody>";
    const m = L.months(contract(), S.readings, opts), Wd = L.words(lang);
    $("budget").innerHTML = t.ended ? "" : L.budgetHtml(m, { fmt: nf, words: Wd });
    const w = Math.max(300, Math.min(900, $("chart").clientWidth || 860));
    $("chart").innerHTML = L.barsSvg(m, { w, h: w < 600 ? 200 : 240, fmt: nf, month: (d) => `${d.slice(0, 4)}.${+d.slice(5, 7)}`, words: Wd });
    $("chart-note").innerHTML = Wd.legend(nf(m.per_month_to_stay_within != null ? m.per_month_to_stay_within : m.allow_per_month));
  }


  /* ---------- quick log: link, phone shortcut, Home Assistant ---------- */
  function drawQuick() {
    const base = `${location.origin}${location.pathname}?${carId !== "_" ? `mine=${encodeURIComponent(carId)}&` : ""}odo=`;
    const ha = `${location.origin}${location.pathname}?${carId !== "_" ? `mine=${encodeURIComponent(carId)}&` : ""}at={{ now().date() }}&odo={{ km }}`;
    const yaml = [
      `alias: ${T.haTitle}`,
      "triggers:",
      "  - trigger: time",
      '    at: "20:00:00"',
      "conditions:",
      "  - condition: template",
      '    value_template: "{{ (now() + timedelta(days=1)).day == 1 }}"',
      "variables:",
      "  km: \"{{ states('sensor.YOUR_CAR_odometer') | float(0) | round(0) | int }}\"",
      "actions:",
      "  - action: notify.mobile_app_YOUR_PHONE",
      "    data:",
      `      title: "${T.haTitle}"`,
      `      message: "${T.haMsg} {{ km }} km. ${T.haTap}"`,
      "      data:",
      `        url: "${ha}"`,
      `        clickAction: "${ha}"`,
    ].join("\n");
    $("quick-s").textContent = T.quick;
    $("quick-body").innerHTML = `<ol><li>${esc(T.optHere)}</li>`
      + `<li><strong>${esc(T.optPhone)}.</strong> ${esc(T.q1)} ${esc(T.q2)}<div class="link"><code id="qlink">${esc(base)}</code><button type="button" class="ac-btn ac-btn--quiet" data-copy="qlink">${esc(T.copy)}</button></div></li>`
      + `<li><strong>${esc(T.optHome)}.</strong> ${esc(T.q3)}<details class="more"><summary>${esc(T.showYaml)}</summary><pre id="qyaml">${esc(yaml)}</pre><button type="button" class="ac-btn ac-btn--quiet" data-copy="qyaml" style="margin-top:6px">${esc(T.copy)}</button></details></li></ol>`
      + `<p class="ac-caption">${esc(T.q4)}</p><h3 class="ac-param__label" style="margin:14px 0 4px">${esc(T.yourData)}</h3><div id="exports-box"></div>`;
  }
  function drawLast() {
    const r = S.readings[S.readings.length - 1];
    let el = $("last");
    if (!el) { $("reads").insertAdjacentHTML("beforebegin", '<p class="ac-caption stale" id="last"></p>'); el = $("last"); }
    if (!r) { el.textContent = T.lastNone; return; }
    const n = Math.max(0, Math.round((L.day(todayIso()) - L.day(r.date)) / 86400000));
    el.textContent = T.last(date(r.date), n);
  }

  /* ---------- history: CSV of the readings, backup and restore of everything on this device ---------- */
  function drawExports() {
    if ($("exports")) return;
    $("exports-box").insertAdjacentHTML("beforeend", `<p class="ac-caption" style="margin:0 0 6px">${esc(T.histNote)}</p><div class="presets" id="exports"><button type="button" class="ac-chip" id="x-csv">${esc(T.csv)}</button><button type="button" class="ac-chip" id="x-bak">${esc(T.bak)}</button><label class="ac-chip" style="cursor:pointer">${esc(T.res)}<input type="file" id="x-res" accept="application/json,.json" hidden></label></div><p class="ac-caption" id="x-msg" role="status" style="margin:6px 0 0"></p>`);
  }
  function csv() {
    const c = L.norm(contract()), car = G && carId !== "_" ? G.get(carId) : null;
    const rows = [T.csvH.join(",")].concat(S.readings.map((r) => {
      const a = c.start != null ? Math.round(L.allowedAt(c, L.day(r.date))) : "";
      return [r.date, r.km, a, a === "" ? "" : r.km - a].join(",");
    }));
    const name = (car ? car.nick || car.name : "car").replace(/[^\w.-]+/g, "-").toLowerCase();
    G.download(`allo-cars-odometer-${name}-${todayIso()}.csv`, rows.join("\n") + "\n", "text/csv");
  }

  /* ---------- cars ---------- */
  function drawCars() {
    const cars = G ? G.list() : [];
    $("for-car").hidden = false;
    $("cars").innerHTML = cars.length
      ? cars.map((c) => `<button type="button" class="ac-chip" data-car="${esc(c.id)}" aria-pressed="${c.id === carId}">${esc(c.nick || c.name)}${c.year ? ` <small>${c.year}</small>` : ""}</button>`).join("")
      : `<span class="ac-caption" style="margin:0">${esc(T.noCar)} <a href="${PRE}/cars/">${esc(zh ? "我的车" : de ? "Meine Autos" : "My cars")}</a></span>`;
  }

  function changed() {
    save(); url(); drawContract();
    if (PLAN) { drawPlanOut(); return; }
    drawLast(); drawCheckpoints();
    if ($("bk-remind")) G.backupReminder($("bk-remind"));
  }
  function drawRemind() {
    if (!G || !G.backupReminder) return;
    if (!$("bk-remind")) $("odo").querySelector(".ac-card__desc").insertAdjacentHTML("afterend", `<p id="bk-remind" hidden></p>`);
    G.backupReminder($("bk-remind"));
  }
  function drawAll() {
    if (PLAN) { drawPlan(); changed(); return; }
    drawCars(); drawQuick(); drawExports(); changed(); drawRemind();
  }

  /* ---------- events ---------- */
  on("sc", "input", (e) => {
    const row = e.target.closest(".sc-row[data-i]"); if (!row) return;
    const p = S.plan[+row.dataset.i], f = e.target.dataset.f;
    if (f === "label") { p.label = e.target.value.slice(0, 60); if (p.id && p.label !== T.preset[p.id]) p.id = ""; if (p.id) p.label = ""; }
    else if (f === "per") p.per = e.target.value;
    else p[f] = Math.max(0, Number(e.target.value) || 0);
    save(); url(); drawPlanOut();
  });
  on("sc", "click", (e) => {
    const d = e.target.closest("[data-del]"); if (!d) return;
    S.plan.splice(+d.dataset.del, 1); drawPlan(); changed();
  });
  on("presets", "click", (e) => {
    const b = e.target.closest("[data-add]"); if (!b) return;
    const p = L.PRESETS.find((x) => x.id === b.dataset.add);
    S.plan.push(p ? { id: p.id, label: "", km: p.km, n: p.n, per: p.per } : { id: "", label: "", km: 50, n: 1, per: "m" });
    drawPlan(); changed();
    if (!p) { const rows = $("sc").querySelectorAll(".sc-row[data-i] .nm"); rows[rows.length - 1].focus(); }
  });
  const bindNum = (id, key, lo, hi, nullable) => on(id, "input", (e) => {
    const v = parseFloat(e.target.value);
    if (e.target.value === "" && nullable) S[key] = null;
    else if (isFinite(v) && v >= lo && v <= hi) S[key] = v; else return;
    changed();
  });
  bindNum("buf", "buf", 0, 100); bindNum("bufr", "buf", 0, 100);
  bindNum("extra", "extra", 0, 5); bindNum("refund", "refund", 0, 5); bindNum("rate", "rate", 0, 1000);
  bindNum("drive", "drive", 0, 500000, true); bindNum("driver", "drive", 0, 500000);
  bindNum("km", "km", 1000, 200000, true); bindNum("odo0", "odo0", 0, 2000000, true); bindNum("tol", "tol", 0, 100000, true);
  bindNum("pm", "pm", 0, 50000, true); bindNum("pmr", "pm", 0, 50000);
  on("start", "change", (e) => { S.start = L.day(e.target.value) ? e.target.value : ""; changed(); });
  on("months", "click", (e) => { const b = e.target.closest("[data-m]"); if (b) { S.months = +b.dataset.m; changed(); } });
  on("radd", "click", () => {
    const d = $("rdate").value, v = parseFloat($("rkm").value);
    if (!L.day(d) || !isFinite(v) || v < 0) { $("rkm").focus(); return; }
    addReading(d, v); $("rkm").value = "";
  });
  on("reads", "click", (e) => { if (e.target.id === "reads-more") { showAllReads = !showAllReads; drawContract(); } });
  on("reads", "click", (e) => { const b = e.target.closest("[data-rm]"); if (b) { S.readings = S.readings.filter((r) => r.date !== b.dataset.rm); changed(); } });
  on("cp-body", "click", (e) => { if (e.target.id === "pm-reset") { S.pm = null; changed(); } });
  on("cars", "click", (e) => {
    const b = e.target.closest("[data-car]"); if (!b || b.dataset.car === carId) return;
    save();
    carId = b.dataset.car;
    const all = store() || { cars: {} };
    S = Object.assign(fresh(), (all.cars || {})[carId] || {});
    drawAll();
  });
  on("quick-body", "click", (e) => {
    const b = e.target.closest("[data-copy]"); if (!b) return;
    const txt = $(b.dataset.copy).textContent;
    const done = () => { b.textContent = T.copied; setTimeout(() => { b.textContent = T.copy; }, 1500); };
    try { navigator.clipboard.writeText(txt).then(done, () => {}); } catch (err) {}
  });
  on("odo", "click", (e) => {
    if (e.target.id === "x-csv") csv();
    if (e.target.id === "x-bak") G.saveBackup();
  });
  on("odo", "change", (e) => {
    if (e.target.id !== "x-res" || !e.target.files[0]) return;
    e.target.files[0].text().then((t) => {
      const n = G.restore(JSON.parse(t));
      load(); drawAll();
      $("x-msg").textContent = `✓ ${T.restored(n)}`;
    }).catch(() => { $("x-msg").textContent = T.badFile; });
    e.target.value = "";
  });
  let rt; if (!PLAN) addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(drawCheckpoints, 150); });

  load();
  drawAll();
  if (logged) {
    $("logged").hidden = false;
    $("logged").textContent = `✓ ${T.loggedMsg(km(logged.km), date(logged.date))}`;
    const target = L.day(S.start) ? $("checkpoints") : $("odo");
    requestAnimationFrame(() => target.scrollIntoView({ block: "start" }));
    $("odo").scrollIntoView({ block: "start" });
  }
})();
