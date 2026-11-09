/* E-Auto grant: how much of Germany's 2026 grant a household gets, from grant.js (EvGrant).
   One script for /ev-grant/, /de/ev-grant/ and /zh/ev-grant/. Link parameters:
   drive=bev|phev, kids=0|1|2, income=<taxable household income, €>, reg=<YYYY-MM-DD first registration>,
   car=<vehicle catalog id of a plug-in hybrid>, co2=<g/km>, range=<electric range, km>.
   The inputs are also kept on this device (localStorage "allo-cars-ev-grant") and never sent anywhere. */
(() => {
  const G = window.EvGrant, A = window.AlloCars;
  const lang = (document.documentElement.lang || "en").slice(0, 2);
  const de = lang === "de", zh = lang === "zh";
  const T = zh ? {
    locale: "zh-CN", title: "德国电动车补贴（E-Auto-Förderung 2026）",
    get: "你可以拿到", maxIs: "最多可拿", noGrant: "没有补贴",
    enterIncome: "填写应税家庭收入，看看具体金额", basisMax: (k) => `按你的情况（${k}）收入在 45,000 € 以下时`,
    basisGet: (d, k, i) => `${d}，${k}，应税家庭收入 ${i}`, applyBy: "最晚申请日期", keepUntil: "至少保留到",
    fromReg: (d) => `首次登记日期 ${d} 起 12 个月内`, keep: "首次登记起 36 个月",
    drive: { bev: "纯电动车", phev: "插电混动或增程车" },
    kids: ["没有未满 18 岁的孩子", "1 个孩子", "2 个或以上孩子"],
    why: {
      income_over_cap: (c) => `收入超过你家的上限 ${c}（基础 80,000 €，每个孩子加 5,000 €，最多两个）。`,
      registered_too_early: () => "只有 2026 年 1 月 1 日及以后首次登记的新车才有补贴。",
      phev_too_late: () => "插电混动和增程车只有在 2027 年 6 月 30 日前首次登记才有补贴。",
      phev_emissions: () => "这辆插电混动车超过 60 g CO2/km，纯电续航也不到 80 km，所以没有补贴。",
      phev_unknown: () => "插电混动车只有在 CO2 不超过 60 g/km 或纯电续航至少 80 km 时才有补贴。请选择车型或填写数据。",
    },
    verdictOk: (n, c, a, r) => `<b class="yes">符合条件</b>：${n}官方平均 ${c} g CO2/km${r ? `，纯电续航 ${r} km` : ""}${a}。`,
    verdictNo: (n, c, a, r) => `<b class="no">按平均值不符合</b>：${n}官方平均 ${c} g CO2/km${r ? `，纯电续航 ${r} km` : ""}${a}。纯电续航至少 80 km 的版本仍然可以，请看合格证（CoC）。`,
    verdictOwnOk: "<b class=\"yes\">符合条件</b>：按你填写的数据。", verdictOwnNo: "<b class=\"no\">不符合条件</b>：CO2 超过 60 g/km，纯电续航也不到 80 km。",
    avgOf: (y) => `（${y} 年登记版本的平均值）`,
    tableDesc: { bev: "纯电动车（以及燃料电池车）。你的格子用黄色标出。", phev: "插电混动和增程车。你的格子用黄色标出。" },
    upTo: (a) => `${a} 以下`, range: (a, b) => `${a} – ${b}`, none: "无",
    in: { drive: "车辆", kids: "未满 18 岁的孩子", income: "应税家庭收入", reg: "首次登记", car: "插电混动车型", co2: "CO2", range: "纯电续航" },
    out: { amount: "补贴", applyBy: "最晚申请", keepUntil: "保留到", why: "说明" },
    openIn: (n) => `在 ${n} 中打开`, rules: "规则截至 2026 年 11 月 9 日",
  } : de ? {
    locale: "de-DE", title: "E-Auto-Förderung 2026",
    get: "Du bekommst", maxIs: "Höchstens", noGrant: "Keine Förderung",
    enterIncome: "Trag dein zu versteuerndes Haushaltseinkommen ein, um den genauen Betrag zu sehen", basisMax: (k) => `mit ${k}, bei einem Einkommen bis 45.000 €`,
    basisGet: (d, k, i) => `${d}, ${k}, zu versteuerndes Haushaltseinkommen ${i}`, applyBy: "Antrag spätestens", keepUntil: "Behalten bis mindestens",
    fromReg: (d) => `12 Monate ab Erstzulassung am ${d}`, keep: "36 Monate ab Erstzulassung",
    drive: { bev: "Reines E-Auto", phev: "Plug-in-Hybrid oder Range Extender" },
    kids: ["ohne Kinder unter 18", "einem Kind", "zwei oder mehr Kindern"],
    why: {
      income_over_cap: (c) => `Das Einkommen liegt über der Grenze für deinen Haushalt von ${c} (80.000 € plus 5.000 € je Kind, höchstens zwei).`,
      registered_too_early: () => "Gefördert werden nur Neuwagen mit Erstzulassung ab dem 1. Januar 2026.",
      phev_too_late: () => "Plug-in-Hybride und Range Extender werden nur bei Erstzulassung bis zum 30. Juni 2027 gefördert.",
      phev_emissions: () => "Dieser Plug-in-Hybrid liegt über 60 g CO2/km und unter 80 km elektrischer Reichweite, deshalb gibt es keine Förderung.",
      phev_unknown: () => "Plug-in-Hybride zählen nur mit höchstens 60 g CO2/km oder mindestens 80 km elektrischer Reichweite. Wähle das Modell oder trag die Werte ein.",
    },
    verdictOk: (n, c, a, r) => `<b class="yes">Erfüllt</b>: ${n} im offiziellen Schnitt ${c} g CO2/km${r ? `, ${r} km elektrische Reichweite` : ""}${a}.`,
    verdictNo: (n, c, a, r) => `<b class="no">Im Schnitt nicht erfüllt</b>: ${n} im offiziellen Schnitt ${c} g CO2/km${r ? `, ${r} km elektrische Reichweite` : ""}${a}. Versionen mit mindestens 80 km elektrischer Reichweite zählen trotzdem, siehe Übereinstimmungsbescheinigung (CoC).`,
    verdictOwnOk: "<b class=\"yes\">Erfüllt</b>, nach deinen Werten.", verdictOwnNo: "<b class=\"no\">Nicht erfüllt</b>: über 60 g CO2/km und unter 80 km elektrischer Reichweite.",
    avgOf: (y) => ` (Schnitt der ${y} zugelassenen Versionen)`,
    tableDesc: { bev: "Reine E-Autos (und Brennstoffzellenautos). Dein Feld ist gelb markiert.", phev: "Plug-in-Hybride und Range Extender. Dein Feld ist gelb markiert." },
    upTo: (a) => `bis ${a}`, range: (a, b) => `${a} – ${b}`, none: "keine",
    in: { drive: "Auto", kids: "Kinder unter 18", income: "Zu versteuerndes Haushaltseinkommen", reg: "Erstzulassung", car: "Plug-in-Hybrid", co2: "CO2", range: "Elektrische Reichweite" },
    out: { amount: "Förderung", applyBy: "Antrag bis", keepUntil: "Behalten bis", why: "Hinweis" },
    openIn: (n) => `In ${n} öffnen`, rules: "Regeln mit Stand 9. November 2026",
  } : {
    locale: "en-GB", title: "German E-Auto grant 2026",
    get: "You get", maxIs: "Up to", noGrant: "No grant",
    enterIncome: "Enter your taxable household income to see the exact amount", basisMax: (k) => `with ${k}, at an income up to 45,000 €`,
    basisGet: (d, k, i) => `${d}, ${k}, taxable household income ${i}`, applyBy: "Apply by", keepUntil: "Keep the car until at least",
    fromReg: (d) => `12 months after first registration on ${d}`, keep: "36 months after first registration",
    drive: { bev: "Fully electric car", phev: "Plug-in hybrid or range extender" },
    kids: ["no children under 18", "one child", "two or more children"],
    why: {
      income_over_cap: (c) => `The income is above your household's limit of ${c} (80,000 € plus 5,000 € per child, up to two).`,
      registered_too_early: () => "Only new cars first registered on or after 1 January 2026 qualify.",
      phev_too_late: () => "Plug-in hybrids and range extenders only qualify when first registered by 30 June 2027.",
      phev_emissions: () => "This plug-in hybrid is above 60 g CO2/km and below 80 km electric range, so it gets no grant.",
      phev_unknown: () => "Plug-in hybrids only count with at most 60 g CO2/km or at least 80 km electric range. Pick the model or type its figures.",
    },
    verdictOk: (n, c, a, r) => `<b class="yes">Qualifies</b>: the ${n} averages ${c} g CO2/km${r ? `, ${r} km electric range` : ""} officially${a}.`,
    verdictNo: (n, c, a, r) => `<b class="no">Not on average</b>: the ${n} averages ${c} g CO2/km${r ? `, ${r} km electric range` : ""} officially${a}. Versions with at least 80 km electric range still count; see the certificate of conformity (CoC).`,
    verdictOwnOk: "<b class=\"yes\">Qualifies</b>, with your figures.", verdictOwnNo: "<b class=\"no\">Does not qualify</b>: above 60 g CO2/km and below 80 km electric range.",
    avgOf: (y) => ` (average of the versions registered in ${y})`,
    tableDesc: { bev: "Fully electric cars (and fuel-cell cars). Your cell is marked in yellow.", phev: "Plug-in hybrids and range extenders. Your cell is marked in yellow." },
    upTo: (a) => `up to ${a}`, range: (a, b) => `${a} – ${b}`, none: "none",
    in: { drive: "Car", kids: "Children under 18", income: "Taxable household income", reg: "First registration", car: "Plug-in hybrid", co2: "CO2", range: "Electric range" },
    out: { amount: "Grant", applyBy: "Apply by", keepUntil: "Keep until", why: "Note" },
    openIn: (n) => `Open in ${n}`, rules: "Rules as of 9 November 2026",
  };
  const KEY = "allo-cars-ev-grant";
  const $ = (id) => document.getElementById(id);
  const eur = (v) => new Intl.NumberFormat(T.locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);
  const day = (iso) => iso ? new Date(iso + "T12:00:00Z").toLocaleDateString(T.locale, { day: "numeric", month: "long", year: "numeric" }) : "";
  const local = (v) => { try { return v === undefined ? localStorage.getItem(KEY) : localStorage.setItem(KEY, v); } catch (e) { return null; } };

  const S = { drive: "bev", kids: 0, income: "", reg: "", car: "", co2: "", range: "" };
  const KEYS = Object.keys(S);
  (function read() {
    const q = new URLSearchParams(location.search);
    const src = KEYS.some((k) => q.has(k)) ? q : new URLSearchParams(local() || "");
    if (G.DRIVES.includes(src.get("drive"))) S.drive = src.get("drive");
    const k = parseInt(src.get("kids"), 10); if (k >= 0 && k <= 2) S.kids = k;
    const num = (n, hi) => { const v = parseFloat(src.get(n)); return isFinite(v) && v >= 0 && v <= hi ? String(Math.round(v)) : ""; };
    S.income = num("income", 1e7); S.co2 = num("co2", 1000); S.range = num("range", 2000);
    if (/^\d{4}-\d{2}-\d{2}$/.test(src.get("reg") || "")) S.reg = src.get("reg");
    if (/^[a-z0-9-]{2,80}$/.test(src.get("car") || "")) S.car = src.get("car");
  })();
  function write() {
    const q = new URLSearchParams();
    KEYS.forEach((k) => { if (S[k] !== "" && !(k === "kids" && S.kids === 0) && !(k === "drive" && S.drive === "bev")) q.set(k, S[k]); });
    if (S.drive !== "phev") ["car", "co2", "range"].forEach((k) => q.delete(k));
    const picked = carById(S.car);
    if (picked && String(picked.co2_g_km) === S.co2) q.delete("co2");
    if (picked && picked.range_km && String(picked.range_km) === String(S.range)) q.delete("range");
    const s = q.toString();
    try { history.replaceState(null, "", location.pathname + (s ? "?" + s : "")); } catch (e) {}
    local(s);
  }

  /* ---------- plug-in hybrids from the catalog ---------- */
  let phevs = [], catalogYear = null;
  const carById = (id) => phevs.find((m) => m.id === id);
  const carByName = (name) => {
    const n = String(name || "").trim().toLowerCase();
    return n ? phevs.find((m) => m.name.toLowerCase() === n) || null : null;
  };
  fetch(AlloSite.data("vehicle-catalog", "models.json")).then((r) => r.ok ? r.json() : null).then((j) => {
    if (!j) return;
    catalogYear = j.year;
    phevs = (j.models || []).filter((m) => /^phev/.test(m.fuel) && m.co2_g_km != null)
      .sort((a, b) => (b.registrations || 0) - (a.registrations || 0));
    $("cars").innerHTML = phevs.map((m) => `<option value="${A.esc(m.name)}"></option>`).join("");
    const c = carById(S.car);
    if (c) { $("car").value = c.name; if (S.co2 === "") S.co2 = String(c.co2_g_km); if (S.range === "" && c.range_km) S.range = String(c.range_km); }
    paintInputs(); update();
  }).catch(() => {});

  /* ---------- inputs ---------- */
  function paintInputs() {
    document.querySelectorAll("#drive button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.drive === S.drive));
    document.querySelectorAll("#kids button").forEach((b) => b.setAttribute("aria-pressed", +b.dataset.kids === S.kids));
    $("income").value = S.income; $("reg").value = S.reg; $("co2").value = S.co2; $("range").value = S.range;
    $("phev").hidden = S.drive !== "phev";
  }
  $("drive").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; S.drive = b.dataset.drive; paintInputs(); update(); });
  $("kids").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; S.kids = +b.dataset.kids; paintInputs(); update(); });
  [["income", "income"], ["reg", "reg"], ["co2", "co2"], ["range", "range"]].forEach(([id, k]) => {
    $(id).addEventListener("input", () => { S[k] = $(id).value; update(); });
  });
  $("car").addEventListener("change", () => {
    const c = carByName($("car").value);
    S.car = c ? c.id : "";
    if (c) { S.co2 = String(c.co2_g_km); S.range = c.range_km ? String(c.range_km) : ""; }
    paintInputs(); update();
  });

  /* ---------- output ---------- */
  let R;
  function update() {
    write();
    R = G.compute({ drive: S.drive, kids: S.kids, income: S.income, reg: S.reg || null, co2: S.co2, range_km: S.range });
    const kidsWord = T.kids[S.kids];
    let html;
    if (R.amount == null) {
      html = R.eligible === false
        ? `<div class="ac-readout"><span class="ac-readout__value none">${T.noGrant}</span><span class="ac-readout__basis">${A.esc(T.drive[S.drive])}</span></div>`
        : `<div class="ac-readout"><span class="ac-readout__value"><small>${T.maxIs} </small>${eur(R.max)}</span><span class="ac-readout__basis">${A.esc(T.drive[S.drive] + ", " + T.basisMax(kidsWord))}. ${T.enterIncome}.</span></div>`;
    } else if (R.amount > 0) {
      html = `<div class="ac-readout"><span class="ac-readout__value"><small>${T.get} </small>${eur(R.amount)}</span><span class="ac-readout__basis">${A.esc(T.basisGet(T.drive[S.drive], kidsWord, eur(R.income)))}</span></div>`;
    } else {
      html = `<div class="ac-readout"><span class="ac-readout__value none">${T.noGrant}</span><span class="ac-readout__basis">${A.esc(T.basisGet(T.drive[S.drive], kidsWord, eur(R.income)))}</span></div>`;
    }
    if (R.apply_by && R.eligible !== false) {
      html += `<div class="ac-readout ac-readout--md"><span class="ac-readout__value">${day(R.apply_by)}</span><span class="ac-readout__basis">${T.applyBy} · ${A.esc(T.fromReg(day(S.reg)))}</span></div>`;
      html += `<div class="ac-readout ac-readout--md"><span class="ac-readout__value">${day(R.keep_until)}</span><span class="ac-readout__basis">${T.keepUntil} · ${T.keep}</span></div>`;
    }
    $("readouts").innerHTML = html;
    const why = R.reasons.map((r) => T.why[r](eur(R.cap)));
    $("why").innerHTML = why.map((w) => `<li>${A.esc(w)}</li>`).join("");
    $("why").hidden = !why.length;

    // plug-in hybrid verdict
    if (S.drive === "phev") {
      const c = carById(S.car);
      let v = "";
      const carRange = c && c.range_km ? String(c.range_km) : "";
      if (c && String(c.co2_g_km) === String(S.co2) && String(S.range) === carRange) {
        v = (G.phevOk(c.co2_g_km, c.range_km) ? T.verdictOk : T.verdictNo)(A.esc(c.name), c.co2_g_km, A.esc(T.avgOf(c.year || catalogYear)), c.range_km);
      } else if (S.co2 !== "" || S.range !== "") {
        const ok = G.phevOk(S.co2, S.range);
        v = ok === true ? T.verdictOwnOk : ok === false ? T.verdictOwnNo : "";
      }
      $("verdict").innerHTML = v;
    }

    // the official table, with this household's cell marked
    $("table-desc").textContent = T.tableDesc[R.drive];
    const rows = G.table(R.drive);
    const rowIdx = R.income == null ? -1 : rows.findIndex((r) => R.income <= r.to);
    $("tbody").innerHTML = rows.map((r, i) => {
      const label = i === 0 ? T.upTo(eur(r.to)) : T.range(eur(r.from), eur(r.to));
      const cells = r.amounts.map((a, k) => `<td class="num${i === rowIdx && k === R.kids ? " mine" : ""}">${a ? eur(a) : T.none}</td>`).join("");
      return `<tr${i === rowIdx ? ' class="is-row"' : ""}><td>${label}</td>${cells}</tr>`;
    }).join("");

    // assistants
    const ask = encodeURIComponent(summary());
    Object.keys(AI).forEach((k) => {
      const el = document.querySelector(`[data-ai="${k}"]`);
      el.href = AI[k].url + ask; el.setAttribute("aria-current", k === aiPick);
    });
    $("aigo").href = AI[aiPick].url + ask;
    $("ailabel").textContent = T.openIn(AI[aiPick].name);
  }

  function summary() {
    const inputs = {};
    inputs[T.in.drive] = T.drive[S.drive];
    inputs[T.in.kids] = T.kids[S.kids];
    if (R.income != null) inputs[T.in.income] = eur(R.income);
    if (S.reg) inputs[T.in.reg] = day(S.reg);
    if (S.drive === "phev") {
      const c = carById(S.car);
      if (c) inputs[T.in.car] = c.name;
      if (S.co2 !== "") inputs[T.in.co2] = S.co2 + " g/km";
      if (S.range !== "") inputs[T.in.range] = S.range + " km";
    }
    const results = {};
    results[T.out.amount] = R.amount == null ? (R.eligible === false ? T.noGrant : `${T.maxIs} ${eur(R.max)}`) : R.amount ? eur(R.amount) : T.noGrant;
    if (R.apply_by && R.eligible !== false) { results[T.out.applyBy] = day(R.apply_by); results[T.out.keepUntil] = day(R.keep_until); }
    R.reasons.forEach((r, i) => { results[T.out.why + (R.reasons.length > 1 ? " " + (i + 1) : "")] = T.why[r](eur(R.cap)); });
    return A.aiSummary(T.title + " · " + T.rules, inputs, results);
  }

  /* ---------- open in an assistant ---------- */
  const AI = {
    claude: { name: "Claude", url: "https://claude.ai/new?q=" },
    chatgpt: { name: "ChatGPT", url: "https://chatgpt.com/?q=" },
    perplexity: { name: "Perplexity", url: "https://www.perplexity.ai/search?q=" },
  };
  const AI_KEY = "allo-cars-ai";
  let aiPick = "claude";
  try { if (AI[localStorage.getItem(AI_KEY)]) aiPick = localStorage.getItem(AI_KEY); } catch (e) {}
  const menu = $("aimenu"), more = $("aimore");
  const showMenu = (open) => { menu.hidden = !open; more.setAttribute("aria-expanded", open); };
  more.addEventListener("click", (e) => { e.stopPropagation(); showMenu(menu.hidden); if (!menu.hidden) menu.querySelector("a").focus(); });
  menu.addEventListener("click", (e) => {
    const a = e.target.closest("[data-ai]"); if (!a) return;
    aiPick = a.getAttribute("data-ai");
    try { localStorage.setItem(AI_KEY, aiPick); } catch (err) {}
    showMenu(false); update();
  });
  document.addEventListener("click", (e) => { if (!menu.hidden && !e.target.closest(".ai-split")) showMenu(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !menu.hidden) { showMenu(false); more.focus(); } });
  $("copyai").addEventListener("click", () => A.copy(summary(), $("copyai").querySelector("span")));
  $("share").addEventListener("click", () => A.copy(location.href, $("share").querySelector("span")));

  paintInputs();
  update();
})();
