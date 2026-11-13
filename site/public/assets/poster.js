/* Share posters: a picture of one car's key figures, or two cars head to head ("PK"), drawn in the
 * browser on a canvas and shared as a PNG (Web Share API on phones, download elsewhere).
 *
 *   AlloPoster.open({ ids: ["volvo-ex30"] })                       one car
 *   AlloPoster.open({ ids: ["volvo-ex30", "tesla-model-y"] })      head to head
 *   AlloPoster.open({ ids: ["volvo-ex30"], vs: true })             head to head, rival picked in the box
 *                                                                  (the most similar car to start with)
 * An id is a vehicle catalog id, optionally with a version: "vw-id-3:<version id>".
 *
 * Formats: Xiaohongshu 3:4 (1080x1440), Instagram 4:5 (1080x1350) and square (1080x1080).
 * Only figures that come straight from the datasets go on a poster: official WLTP figures, power and
 * mass (EEA vehicle catalog), the cost of 100 km at this week's prices (as on the car page), Euro NCAP
 * stars and child occupant score (numbers only, credited) and new registrations in Germany (KBA).
 * No ranking positions. Head to head marks a winner only where the two figures can be compared: the
 * same kind of consumption, Euro NCAP results from the same test protocol.
 *
 * The words, figures and winners (AlloPoster.facts, AlloPoster.duel) are plain functions, tested in
 * site/tests/poster.test.js; the drawing and the box need a browser.
 */
(function () {
  "use strict";
  if (window.AlloPoster) return;
  var hasDoc = typeof document !== "undefined";

  var WORDS = {
    zh: {
      locale: "zh-CN", title: "生成海报", titleVs: "PK 海报", close: "关闭", share: "分享", save: "保存图片", copy: "复制文案", copied: "已复制",
      fmt: { xhs: "小红书 3:4", ig: "Instagram 4:5", sq: "方图 1:1" }, carA: "第一辆", carB: "第二辆", pickPh: "品牌和车型，例如 VW Golf",
      hold: "也可以长按图片保存。", loading: "正在生成…", failed: "海报生成失败：",
      fuel: { electric: "纯电动", petrol: "汽油", diesel: "柴油", lpg: "LPG", cng: "天然气", "phev-petrol": "插电混动", "phev-diesel": "插电混动（柴油）", hydrogen: "氢燃料", e85: "E85" },
      cost100: "每 100 公里", cost100Sub: (f) => f === "electric" ? "在家充电 €0.35/kWh" : /^phev/.test(f) ? "官方电/油比例 · 本周油价" : "本周德国平均油价",
      year: "一年 1.5 万公里", yearSub: "按上面的每 100 公里费用", range: "纯电续航", rangeSub: "WLTP 官方",
      power: "功率", ps: (n) => `${n} 马力`, cons: "官方能耗", consSub: "WLTP", co2: "CO₂ 排放", co2Sub: "WLTP 官方",
      euro: "Euro NCAP 安全", euroSub: (y) => `${y} 年测试`, kid: "儿童乘员保护", kidSub: (p) => `Euro NCAP ${p} 规程`,
      regs: "德国新车登记", regsSub: "近 12 个月", mass: "整备质量", massSub: "官方平均",
      perL: "升/100 km", wins: (n) => `${n} 项领先`, vs: "VS", tie: "打平", noCompare: "测试规程不同，不比较", noCompareCons: "电和油不比较",
      foot: "数据：EEA 型式认证 (WLTP)、KBA、Euro NCAP；费用按本周德国价格估算",
      brand: "搜 Allo Cars", caption: (t) => `${t}\n\n数据来自 Allo Cars（官方 WLTP、KBA、Euro NCAP）。\n#德国买车 #德国生活 #电动车 #汽车对比 #AlloCars`,
      capOne: (n) => `${n} 关键数据一图看懂`, capVs: (a, b) => `${a} vs ${b}，谁更值？`,
    },
    de: {
      locale: "de-DE", title: "Poster", titleVs: "Duell-Poster", close: "Schließen", share: "Teilen", save: "Bild speichern", copy: "Text kopieren", copied: "Kopiert",
      fmt: { xhs: "3:4 (Xiaohongshu)", ig: "4:5 (Instagram)", sq: "1:1" }, carA: "Erstes Auto", carB: "Zweites Auto", pickPh: "Marke und Modell, z. B. VW Golf",
      hold: "Du kannst das Bild auch lange drücken und sichern.", loading: "Wird gezeichnet …", failed: "Das Poster ging nicht: ",
      fuel: { electric: "Elektro", petrol: "Benzin", diesel: "Diesel", lpg: "Autogas", cng: "Erdgas", "phev-petrol": "Plug-in-Hybrid", "phev-diesel": "Plug-in-Hybrid (Diesel)", hydrogen: "Wasserstoff", e85: "E85" },
      cost100: "Pro 100 km", cost100Sub: (f) => f === "electric" ? "zu Hause geladen, 0,35 €/kWh" : /^phev/.test(f) ? "offizieller Strom-/Spritmix" : "Spritpreis dieser Woche",
      year: "15.000 km im Jahr", yearSub: "mit den Kosten pro 100 km", range: "Reichweite", rangeSub: "elektrisch, WLTP",
      power: "Leistung", ps: (n) => `${n} PS`, cons: "Verbrauch", consSub: "offiziell, WLTP", co2: "CO₂", co2Sub: "offiziell, WLTP",
      euro: "Euro NCAP", euroSub: (y) => `getestet ${y}`, kid: "Kindersicherheit", kidSub: (p) => `Euro NCAP, Protokoll ${p}`,
      regs: "Neuzulassungen", regsSub: "in Deutschland, 12 Monate", mass: "Leergewicht", massSub: "offizieller Schnitt",
      perL: "l/100 km", wins: (n) => `${n}× vorn`, vs: "VS", tie: "Gleichstand", noCompare: "anderes Testprotokoll", noCompareCons: "nicht vergleichbar",
      foot: "Daten: EEA-Typgenehmigung (WLTP), KBA, Euro NCAP; Kosten zu Preisen dieser Woche geschätzt",
      brand: "cars.allo.land", caption: (t) => `${t}\n\nZahlen von Allo Cars (offizielle WLTP-Werte, KBA, Euro NCAP): cars.allo.land`,
      capOne: (n) => `${n}: die wichtigsten Zahlen`, capVs: (a, b) => `${a} oder ${b}?`,
    },
    en: {
      locale: "en-GB", title: "Poster", titleVs: "Head-to-head poster", close: "Close", share: "Share", save: "Save image", copy: "Copy text", copied: "Copied",
      fmt: { xhs: "3:4 (Xiaohongshu)", ig: "4:5 (Instagram)", sq: "1:1" }, carA: "First car", carB: "Second car", pickPh: "Make and model, e.g. VW Golf",
      hold: "You can also press and hold the image to save it.", loading: "Drawing …", failed: "Could not draw the poster: ",
      fuel: { electric: "Electric", petrol: "Petrol", diesel: "Diesel", lpg: "LPG", cng: "Natural gas", "phev-petrol": "Plug-in hybrid", "phev-diesel": "Plug-in hybrid (diesel)", hydrogen: "Hydrogen", e85: "E85" },
      cost100: "Per 100 km", cost100Sub: (f) => f === "electric" ? "charged at home, €0.35/kWh" : /^phev/.test(f) ? "official electric/fuel mix" : "this week's fuel price",
      year: "15,000 km a year", yearSub: "at the cost per 100 km", range: "Range", rangeSub: "electric, WLTP",
      power: "Power", ps: (n) => `${n} PS`, cons: "Consumption", consSub: "official, WLTP", co2: "CO₂", co2Sub: "official, WLTP",
      euro: "Euro NCAP", euroSub: (y) => `tested ${y}`, kid: "Child safety", kidSub: (p) => `Euro NCAP, ${p} protocol`,
      regs: "New registrations", regsSub: "in Germany, 12 months", mass: "Kerb weight", massSub: "official average",
      perL: "L/100 km", wins: (n) => `${n} ${n === 1 ? "win" : "wins"}`, vs: "VS", tie: "Tie", noCompare: "different test protocols", noCompareCons: "not comparable",
      foot: "Data: EEA type approval (WLTP), KBA, Euro NCAP; cost estimated at this week's German prices",
      brand: "cars.allo.land", caption: (t) => `${t}\n\nFigures from Allo Cars (official WLTP, KBA, Euro NCAP): cars.allo.land`,
      capOne: (n) => `${n}: the key figures`, capVs: (a, b) => `${a} vs ${b}: which one?`,
    },
  };
  function words(lang) { return WORDS[lang] || WORDS.en; }

  /* ---------- figures ---------- */
  // ctx: { G (AlloGarage), prices: { fuel, charge }, regs, ratings, lang }; m: catalog model (a version's
  // figures already merged in), base: the catalog model itself (ratings and registrations are per model).
  // Returns { name, make, model, fuel, fuelLabel, version, metrics: { key: { value, text, unit, sub, better, group } } }
  function facts(m, base, ctx, version) {
    var L = words(ctx.lang), G = ctx.G, loc = L.locale;
    base = base || m;
    var n0 = function (v) { return Math.round(v).toLocaleString(loc); };
    var n1 = function (v) { return Number(v).toLocaleString(loc, { minimumFractionDigits: 1, maximumFractionDigits: 1 }); };
    var eur = function (v, d) { return Number(v).toLocaleString(loc, { style: "currency", currency: "EUR", minimumFractionDigits: d, maximumFractionDigits: d }); };
    var out = {};
    var put = function (key, value, text, unit, sub, better, group) { if (value != null && isFinite(value)) out[key] = { key: key, value: Number(value), text: text, unit: unit || "", sub: sub || "", better: better || "", group: group || key }; };
    var c = G.cost100(m, ctx.prices.fuel, ctx.prices.charge).main;
    if (c != null) {
      put("cost100", c, eur(c, 2), "", L.cost100Sub(m.fuel), "low");
      put("year", c * 150, eur(c * 150, 0), "", L.yearSub, "low");
    }
    if (m.range_km) put("range", m.range_km, n0(m.range_km), "km", L.rangeSub, "high");
    if (m.power_kw) put("power", m.power_kw, n0(m.power_kw), "kW", L.ps(n0(m.power_kw * 1.35962)), "high");
    // consumption: kWh for electric cars, litres for fuel cars; a plug-in hybrid's official litres are not
    // comparable with a fuel car's, so each kind gets its own group
    if (m.fuel === "electric" && m.kwh_per_100km) put("cons", m.kwh_per_100km, n1(m.kwh_per_100km), "kWh/100 km", L.consSub, "low", "cons-e");
    else if (m.l_per_100km) put("cons", m.l_per_100km, n1(m.l_per_100km), L.perL, L.consSub, "low", /^phev/.test(m.fuel) ? "cons-p" : "cons-f");
    if (m.co2_g_km != null && m.co2_g_km > 0) put("co2", m.co2_g_km, n0(m.co2_g_km), "g/km", L.co2Sub, "low");
    var r = ctx.ratings ? G.ratings(ctx.ratings, base) : { euro: null };
    if (r.euro && r.euro.stars != null) {
      var proto = r.euro.child && r.euro.child.protocol ? String(r.euro.child.protocol) : "";
      put("euro", r.euro.stars, "", "", L.euroSub(r.euro.year), "high", "euro-" + (proto || r.euro.year));
      out.euro.stars = r.euro.stars; out.euro.year = r.euro.year;
      if (r.euro.child && r.euro.child.occupant_pct != null) put("kid", r.euro.child.occupant_pct, String(r.euro.child.occupant_pct), "%", L.kidSub(proto), "high", "kid-" + proto);
    }
    var key = G.modelKey(base.make, base.model);
    var reg = ctx.regs && ctx.regs.models ? ctx.regs.models.filter(function (x) { return x.model !== "SONSTIGE" && G.modelKey(x.brand, x.model) === key; })[0] : null;
    if (reg && reg.last_12_months) put("regs", reg.last_12_months, n0(reg.last_12_months), "", L.regsSub, "high");
    if (m.mass_kg) put("mass", m.mass_kg, n0(m.mass_kg), "kg", L.massSub, "");
    return {
      id: base.id, name: base.name, make: base.make, model: base.model, fuel: m.fuel, fuelLabel: L.fuel[m.fuel] || m.fuel,
      version: version ? [version.trim, version.power_kw ? version.power_kw + " kW" : ""].filter(Boolean).join(" · ") : "", metrics: out,
    };
  }

  // the order figures go on a poster, most interesting first; a poster shows as many as fit
  var ONE_ORDER = { electric: ["cost100", "power", "cons", "euro", "kid", "regs", "year", "mass"], other: ["power", "cons", "co2", "euro", "kid", "regs", "year", "mass"] };
  var VS_ORDER = ["cost100", "range", "power", "cons", "euro", "kid", "regs", "co2", "mass"];
  // hero of a one-car poster: the electric range, else the cost of 100 km
  function hero(f) { return f.fuel === "electric" && f.metrics.range ? f.metrics.range : f.metrics.cost100 || f.metrics.power || null; }
  function oneList(f) {
    var h = hero(f), order = f.fuel === "electric" ? ONE_ORDER.electric : ONE_ORDER.other;
    return order.filter(function (k) { return f.metrics[k] && f.metrics[k] !== h; }).map(function (k) { return f.metrics[k]; });
  }

  // Head to head: the rows both cars have, each with the winner (0, 1, or -1 for none) where the
  // figures can be compared, and the number of wins per car.
  // max: only the first max rows (what fits on the poster), so the score counts what the poster shows
  function duel(a, b, max) {
    var rows = [], wins = [0, 0];
    VS_ORDER.forEach(function (k) {
      var x = a.metrics[k], y = b.metrics[k];
      if (!x || !y || rows.length >= (max || 99)) return;
      var win = -1, comparable = x.group === y.group;
      if (x.better && comparable && x.value !== y.value) win = (x.better === "low") === (x.value < y.value) ? 0 : 1;
      if (win >= 0) wins[win]++;
      rows.push({ key: k, a: x, b: y, win: win, comparable: comparable });
    });
    return { rows: rows, wins: wins };
  }

  /* ---------- drawing ---------- */
  var SIZES = { xhs: [1080, 1440], ig: [1080, 1350], sq: [1080, 1080] };
  var C = { bg: "#17191b", tile: "#24272a", line: "#33373b", ink: "#ffffff", muted: "#a5a9ae", gold: "#ffcc00", goldInk: "#17191b", blue: "#8fb4ea" };
  var SANS = '"Atkinson Hyperlegible", "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", "Noto Sans CJK SC", "Microsoft YaHei", "WenQuanYi Zen Hei", system-ui, sans-serif';
  var DISPLAY = '"Bricolage Grotesque", "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", "Noto Sans CJK SC", "Microsoft YaHei", "WenQuanYi Zen Hei", system-ui, sans-serif';
  var font = function (w, px, fam) { return w + " " + Math.round(px) + "px " + (fam || SANS); };

  function rr(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  // the biggest size up to max at which text fits in width
  function fit(g, text, w, max, min, weight, fam) {
    var px = max;
    for (; px > min; px -= 2) { g.font = font(weight, px, fam); if (g.measureText(text).width <= w) break; }
    g.font = font(weight, px, fam);
    return px;
  }
  function clip(g, text, w) {
    if (g.measureText(text).width <= w) return text;
    while (text.length > 1 && g.measureText(text + "…").width > w) text = text.slice(0, -1);
    return text + "…";
  }
  // text in up to n lines of width w, broken at spaces (or anywhere in Chinese), the last one clipped
  function wrap(g, text, w, n) {
    var parts = /[\u3400-\u9fff]/.test(text) ? text.split("") : text.split(/(?<= )/), lines = [], cur = "";
    parts.forEach(function (p) {
      if (lines.length >= n) return;
      if (cur && g.measureText(cur + p).width > w) { lines.push(cur.trim()); cur = p.trimStart(); } else cur += p;
    });
    if (cur && lines.length < n) lines.push(cur.trim());
    else if (cur) lines[n - 1] = clip(g, lines[n - 1] + " " + cur.trim(), w);
    return lines;
  }
  function starPath(g, cx, cy, r) {
    g.beginPath();
    for (var i = 0; i < 10; i++) {
      var a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r * 0.45 : r;
      g[i ? "lineTo" : "moveTo"](cx + rad * Math.cos(a), cy + rad * Math.sin(a));
    }
    g.closePath();
  }
  // five stars, gold up to n (halves allowed), left edge x, middle y; returns the width
  function stars(g, n, x, y, r, off, on) {
    var step = r * 2.15;
    for (var i = 0; i < 5; i++) {
      var cx = x + r + i * step, part = Math.max(0, Math.min(1, n - i));
      starPath(g, cx, y, r); g.fillStyle = off || C.line; g.fill();
      if (part > 0) { g.save(); g.beginPath(); g.rect(cx - r, y - r, 2 * r * part, 2 * r); g.clip(); starPath(g, cx, y, r); g.fillStyle = on || C.gold; g.fill(); g.restore(); }
    }
    return step * 4 + 2 * r;
  }
  function brandBar(g, W, L, fuelLabel, y) {
    g.fillStyle = C.gold; g.fillRect(0, 0, W, 18);
    g.textBaseline = "alphabetic"; g.textAlign = "left";
    g.font = font(800, 44, DISPLAY); g.fillStyle = C.ink; g.fillText("Allo", 72, y);
    var w = g.measureText("Allo ").width; g.fillStyle = C.gold; g.fillText("Cars", 72 + w, y);
    if (fuelLabel) {
      g.font = font(700, 30); var tw = g.measureText(fuelLabel).width;
      rr(g, W - 72 - tw - 48, y - 40, tw + 48, 54, 27); g.fillStyle = C.gold; g.fill();
      g.fillStyle = C.goldInk; g.fillText(fuelLabel, W - 72 - tw - 24, y - 2);
    }
  }
  function footer(g, W, H, L, extra) {
    g.textAlign = "left"; g.textBaseline = "alphabetic";
    g.fillStyle = C.line; g.fillRect(72, H - 118, W - 144, 2);
    g.font = font(400, 22); g.fillStyle = C.muted;
    var lines = wrap(g, extra ? extra + " · " + L.foot : L.foot, W - 144 - 300, 2);
    lines.forEach(function (t, i) { g.fillText(t, 72, H - (lines.length > 1 ? 78 : 66) + i * 30); });
    g.font = font(800, 30, DISPLAY); g.fillStyle = C.gold; g.textAlign = "right";
    g.fillText(L.brand, W - 72, H - 64);
    g.textAlign = "left";
  }
  // a figure's main text as drawn: the number, or stars for Euro NCAP
  function valueText(mt) { return mt.text + (mt.unit ? (mt.unit === "%" ? "%" : " " + mt.unit) : ""); }

  function drawOne(g, f, fmt, L, stamp) {
    var W = SIZES[fmt][0], H = SIZES[fmt][1], P = 72;
    g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
    brandBar(g, W, L, f.fuelLabel, 100);
    var y = fmt === "sq" ? 168 : 196;
    g.textAlign = "left"; g.fillStyle = C.muted; g.font = font(700, 44); g.fillText(clip(g, f.make, W - 2 * P), P, y);
    var big = fit(g, f.model, W - 2 * P, fmt === "sq" ? 128 : 156, 60, 800, DISPLAY);
    y += big * 0.98; g.fillStyle = C.ink; g.fillText(f.model, P, y);
    if (f.version) { y += 50; g.font = font(400, 32); g.fillStyle = C.muted; g.fillText(clip(g, f.version, W - 2 * P), P, y); }
    // hero
    var h = hero(f);
    y += fmt === "sq" ? 36 : 52;
    if (h) {
      var hh = fmt === "sq" ? 210 : 236;
      rr(g, P, y, W - 2 * P, hh, 36); g.fillStyle = C.gold; g.fill();
      g.fillStyle = C.goldInk; g.font = font(700, 32);
      var label = h.key === "range" ? L.range : h.key === "cost100" ? L.cost100 : L.power;
      g.fillText(label, P + 44, y + 64);
      var num = fit(g, h.text, W - 2 * P - 88 - 220, fmt === "sq" ? 104 : 140, 60, 800, DISPLAY);
      g.fillText(h.text, P + 40, y + hh - (fmt === "sq" ? 36 : 44));
      var nw = g.measureText(h.text).width;
      if (h.unit) { g.font = font(800, num * 0.42, DISPLAY); g.fillText(h.unit, P + 40 + nw + 14, y + hh - (fmt === "sq" ? 36 : 44)); }
      g.font = font(400, 26); g.textAlign = "right"; g.fillText(clip(g, h.sub, 340), W - P - 44, y + 64); g.textAlign = "left";
      y += hh + 28;
    }
    // tiles, two per row, as many rows as fit
    var list = oneList(f), gap = 24, tw = (W - 2 * P - gap) / 2, bottom = H - 150;
    var minH = 150, rows = Math.max(0, Math.min(Math.ceil(list.length / 2), Math.floor((bottom - y + gap) / (minH + gap))));
    list = list.slice(0, rows * 2);
    if (list.length % 2 && rows > 0 && list.length > 1) list = list.slice(0, list.length - 1); // even rows look tidier
    rows = Math.ceil(list.length / 2);
    var th = rows ? Math.min(210, (bottom - y - gap * (rows - 1)) / rows) : 0;
    list.forEach(function (mt, i) {
      var x = P + (i % 2) * (tw + gap), ty = y + Math.floor(i / 2) * (th + gap);
      rr(g, x, ty, tw, th, 28); g.fillStyle = C.tile; g.fill();
      g.fillStyle = C.muted; g.font = font(700, 28); g.fillText(clip(g, L[mt.key], tw - 56), x + 28, ty + 42);
      // value centred between the label (baseline +42) and the note (baseline th-20), sized to the space
      var vmax = Math.max(32, Math.min(64, (th - 102) / 0.8)), mid = ty + (52 + th - 50) / 2 + vmax * 0.37;
      if (mt.key === "euro") {
        stars(g, mt.stars, x + 28, mid - vmax * 0.36, Math.min(26, vmax * 0.42));
      } else {
        g.fillStyle = C.ink;
        var px = fit(g, mt.text, tw - 56 - (mt.unit ? 150 : 0), vmax, 30, 800, DISPLAY);
        g.fillText(mt.text, x + 28, mid);
        if (mt.unit) { var w0 = g.measureText(mt.text).width; g.font = font(700, Math.min(30, px * 0.5)); g.fillText(clip(g, mt.unit, tw - 56 - w0 - 10), x + 28 + w0 + 10, mid); }
      }
      g.fillStyle = C.muted; g.font = font(400, 24); g.fillText(clip(g, mt.sub, tw - 56), x + 28, ty + th - 20);
    });
    footer(g, W, H, L, stamp);
  }

  function drawVs(g, a, b, fmt, L, stamp) {
    var W = SIZES[fmt][0], H = SIZES[fmt][1], P = 72, mid = W / 2;
    g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
    brandBar(g, W, L, "", 100);
    // names
    var y = fmt === "sq" ? 170 : 196, colW = (W - 2 * P - 180) / 2;
    var name = function (f, x, align, color) {
      g.textAlign = align; g.fillStyle = C.muted; g.font = font(700, 34); g.fillText(clip(g, f.make, colW), x, y);
      var px = fit(g, f.model, colW, fmt === "sq" ? 84 : 96, 40, 800, DISPLAY);
      g.fillStyle = color; g.fillText(f.model, x, y + px * 0.98);
      g.font = font(400, 26); g.fillStyle = C.muted; g.fillText(clip(g, f.version || f.fuelLabel, colW), x, y + px * 0.98 + 44);
      return px;
    };
    var pa = name(a, P, "left", C.gold), pb = name(b, W - P, "right", C.blue);
    var ph = Math.max(pa, pb);
    var top = y + ph + 92 + (fmt === "sq" ? 92 : 116), bottom = H - 150, minRow = 112;
    var d = duel(a, b, Math.max(1, Math.floor((bottom - top) / minRow)));
    // VS badge
    var cy = y + ph * 0.5;
    g.beginPath(); g.arc(mid, cy, 58, 0, Math.PI * 2); g.fillStyle = C.gold; g.fill();
    g.textAlign = "center"; g.fillStyle = C.goldInk; g.font = font(800, 50, DISPLAY); g.fillText(L.vs, mid, cy + 18);
    y += ph + 92;
    // score
    var score = d.wins[0] + " : " + d.wins[1];
    g.font = font(800, fmt === "sq" ? 64 : 80, DISPLAY); g.textAlign = "center"; g.fillStyle = C.ink; g.fillText(score, mid, y + (fmt === "sq" ? 56 : 70));
    g.font = font(700, 28); g.textAlign = "left"; g.fillStyle = d.wins[0] >= d.wins[1] ? C.gold : C.muted; g.fillText(L.wins(d.wins[0]), P, y + 56);
    g.textAlign = "right"; g.fillStyle = d.wins[1] >= d.wins[0] ? C.blue : C.muted; g.fillText(L.wins(d.wins[1]), W - P, y + 56);
    y += fmt === "sq" ? 92 : 116;
    // rows: label in the middle, two bars back to back, longer bar = bigger number, winner in colour
    var rows = d.rows;
    var rh = Math.min(150, (bottom - y) / rows.length), half = mid - P - 8, barH = Math.min(58, rh - 54);
    rows.forEach(function (row, i) {
      var ty = y + i * rh;
      g.textAlign = "center"; g.fillStyle = C.muted; g.font = font(700, 26);
      g.fillText(L[row.key] + (row.comparable ? "" : " · " + (row.key === "cons" ? L.noCompareCons : L.noCompare)), mid, ty + 30);
      var by = ty + 44, max = Math.max(row.a.value, row.b.value) || 1;
      [row.a, row.b].forEach(function (mt, side) {
        var len = 230 + (half - 230) * (mt.value / max), win = row.win === side;
        var x = side ? mid + 8 : mid - 8 - len;
        rr(g, x, by, len, barH, barH / 2);
        g.fillStyle = win ? (side ? C.blue : C.gold) : C.tile; g.fill();
        g.fillStyle = win ? C.goldInk : C.ink;
        var tx = side ? x + len - 24 : x + 24;
        g.textAlign = side ? "right" : "left";
        if (mt.key === "euro") {
          var sr = barH * 0.26, sw = sr * 2.15 * 4 + 2 * sr;
          // on a coloured bar the stars are dark, so they don't vanish
          stars(g, mt.stars, side ? tx - sw : tx, by + barH / 2, sr, win ? "rgba(23,25,27,.22)" : C.line, win ? C.goldInk : C.gold);
          // the test year at the inner end, so different protocols are visible
          g.font = font(700, Math.min(26, barH * 0.45)); g.textAlign = side ? "left" : "right"; g.fillStyle = win ? C.goldInk : C.muted;
          g.fillText(String(mt.year), side ? x + 24 : x + len - 24, by + barH / 2 + barH * 0.16);
        } else {
          fit(g, valueText(mt), len - 48, Math.min(40, barH * 0.68), 20, 800, DISPLAY);
          g.fillText(valueText(mt), tx, by + barH / 2 + barH * 0.24);
        }
      });
    });
    g.textAlign = "left";
    footer(g, W, H, L, stamp);
  }

  /* ---------- data (browser) ---------- */
  var lang = hasDoc ? (document.documentElement.lang || "en").slice(0, 2) : "en";
  var L = words(lang);
  var data = null, versionFiles = {};
  var json = function (u) { return fetch(u).then(function (r) { if (!r.ok) throw new Error(u + ": " + r.status); return r.json(); }); };
  var soft = function (u) { return json(u).catch(function () { return null; }); };
  function loadData() {
    if (data) return data;
    var D = function (set, file) { return window.AlloSite.data(set, file); };
    data = Promise.all([json(D("vehicle-catalog", "models.json")), soft(D("fuel-prices", "latest.json")), soft(D("charging-prices", "latest.json")),
      soft(D("registrations", "models.json")), soft(D("ratings", "ratings.json"))]).then(function (r) {
      var byId = {}; r[0].models.forEach(function (m) { byId[m.id] = m; });
      return { catalog: r[0].models, year: r[0].year, byId: byId, prices: { fuel: r[1], charge: r[2] }, regs: r[3], ratings: r[4] };
    });
    data.catch(function () { data = null; });
    return data;
  }
  var makeSlug = function (make) { return String(make || "").toLowerCase().replace(/&/g, "and").replace(/#/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); };
  function factsFor(id, D) {
    var parts = String(id).split(":"), base = D.byId[parts[0]];
    if (!base) return Promise.resolve(null);
    var ctx = { G: window.AlloGarage, prices: D.prices, regs: D.regs, ratings: D.ratings, lang: lang };
    if (!parts[1]) return Promise.resolve(facts(base, base, ctx, null));
    var k = makeSlug(base.make);
    if (!versionFiles[k]) versionFiles[k] = soft(window.AlloSite.data("vehicle-catalog", "versions/" + k + ".json"));
    return versionFiles[k].then(function (vf) {
      var v = ((vf && vf.models && vf.models[base.id]) || []).filter(function (x) { return x.id === parts[1]; })[0];
      if (!v) return facts(base, base, ctx, null);
      var m = Object.assign({}, base, { kwh_per_100km: v.kwh_per_100km, l_per_100km: v.l_per_100km, co2_g_km: v.co2_g_km, range_km: v.range_km, power_kw: v.power_kw, mass_kg: v.mass_kg });
      return facts(m, base, ctx, v);
    });
  }
  function fontsReady() {
    if (!hasDoc || !document.fonts) return Promise.resolve();
    return Promise.all([document.fonts.load(font(800, 100, DISPLAY)), document.fonts.load(font(700, 30)), document.fonts.load(font(400, 30))]).catch(function () {});
  }

  /* ---------- the box ---------- */
  var CSS = ".acp [hidden]{display:none!important}.acp{border:0;padding:0;margin:auto;width:min(560px,100vw - 24px);max-height:calc(100dvh - 24px);border-radius:var(--radius-lg,18px);background:var(--surface-100,#fff);color:var(--ink,#17191b);box-shadow:0 12px 40px rgba(0,0,0,.35)}"
    + ".acp::backdrop{background:rgba(0,0,0,.55)}.acp__in{display:grid;gap:12px;padding:16px}"
    + ".acp__head{display:flex;justify-content:space-between;align-items:center;gap:8px}.acp__head h2{margin:0;font:800 22px/1.2 var(--font-display,sans-serif)}"
    + ".acp__x{min-width:44px;min-height:44px;border:0;background:none;color:inherit;font-size:28px;cursor:pointer;border-radius:999px}"
    + ".acp__seg{display:flex;flex-wrap:wrap;gap:6px}.acp__seg button{min-height:40px;padding:0 14px;border:1.5px solid var(--ink,#17191b);border-radius:999px;background:var(--surface-100,#fff);color:var(--ink,#17191b);font:700 14px/1 var(--font-sans,sans-serif);cursor:pointer}"
    + ".acp__seg button[aria-pressed=true]{background:var(--ink,#17191b);color:var(--surface-100,#fff)}"
    + ".acp__pick{display:grid;grid-template-columns:1fr 1fr;gap:8px}.acp__pick label{display:grid;gap:4px;font:600 13px/16px var(--font-sans,sans-serif);min-width:0}"
    + ".acp__pick input{min-height:44px;padding:0 10px;border:1.5px solid var(--ink,#17191b);border-radius:12px;background:var(--surface-100,#fff);color:var(--ink,#17191b);font:600 16px/20px var(--font-sans,sans-serif);min-width:0;width:100%;box-sizing:border-box}"
    + ".acp__img{display:block;width:100%;height:auto;max-height:56dvh;object-fit:contain;border-radius:12px;background:#17191b;-webkit-touch-callout:default}"
    + ".acp__acts{display:flex;flex-wrap:wrap;gap:8px}.acp__acts .ac-btn{flex:1 1 140px}.acp__note{margin:0;color:var(--ink-muted,#5b6066);font-size:13px}"
    + ".acp__cap{width:100%;box-sizing:border-box;min-height:84px;padding:8px 10px;border:1px solid var(--border,#ddd);border-radius:12px;background:var(--surface-50,#f6f5f2);color:inherit;font:14px/1.4 var(--font-sans,sans-serif);resize:vertical}"
    + "@media (max-width:420px){.acp__pick{grid-template-columns:1fr}}";
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var FKEY = "allo-cars-poster-format";
  var box = null, st = { ids: [], vs: false, fmt: "xhs", blob: null, url: "", name: "", caption: "" };
  try { var f0 = localStorage.getItem(FKEY); if (SIZES[f0]) st.fmt = f0; } catch (e) {}

  function build() {
    if (box) return box;
    var style = document.createElement("style"); style.textContent = CSS; document.head.appendChild(style);
    box = document.createElement("dialog");
    box.className = "acp"; box.setAttribute("aria-labelledby", "acp-h");
    box.innerHTML = '<div class="acp__in"><div class="acp__head"><h2 id="acp-h"></h2><button type="button" class="acp__x" data-acp-close aria-label="' + esc(L.close) + '" title="' + esc(L.close) + '">×</button></div>'
      + '<div class="acp__pick" data-acp-pick hidden><label>' + esc(L.carA) + '<input data-acp-car="0" list="acp-cars" autocomplete="off" spellcheck="false" placeholder="' + esc(L.pickPh) + '"></label>'
      + '<label>' + esc(L.carB) + '<input data-acp-car="1" list="acp-cars" autocomplete="off" spellcheck="false" placeholder="' + esc(L.pickPh) + '"></label><datalist id="acp-cars"></datalist></div>'
      + '<div class="acp__seg" role="group">' + Object.keys(SIZES).map(function (k) { return '<button type="button" data-acp-fmt="' + k + '" aria-pressed="false">' + esc(L.fmt[k]) + "</button>"; }).join("") + "</div>"
      + '<img class="acp__img" data-acp-img alt="">'
      + '<p class="acp__note" data-acp-status role="status"></p>'
      + '<div class="acp__acts"><button type="button" class="ac-btn ac-btn--gold" data-acp-share data-count="poster_share" hidden>' + esc(L.share) + '</button>'
      + '<a class="ac-btn ac-btn--primary" data-acp-save data-count="poster_save" download>' + esc(L.save) + "</a></div>"
      + (lang === "zh" ? '<textarea class="acp__cap" data-acp-cap readonly aria-label="' + esc(L.copy) + '"></textarea><div class="acp__acts"><button type="button" class="ac-btn ac-btn--ghost" data-acp-copy data-count="poster_copy">' + esc(L.copy) + "</button></div>" : "")
      + "</div>";
    document.body.appendChild(box);
    box.addEventListener("click", function (e) {
      if (e.target === box || e.target.closest("[data-acp-close]")) return box.close();
      var fb = e.target.closest("[data-acp-fmt]");
      if (fb) { st.fmt = fb.dataset.acpFmt; try { localStorage.setItem(FKEY, st.fmt); } catch (x) {} return render(); }
      if (e.target.closest("[data-acp-share]")) return share();
      if (e.target.closest("[data-acp-copy]")) return copy();
    });
    box.addEventListener("change", function (e) {
      var inp = e.target.closest("[data-acp-car]");
      if (!inp) return;
      loadData().then(function (D) {
        var v = inp.value.trim().toLowerCase(), hit = D.catalog.filter(function (m) { return label(m).toLowerCase() === v; })[0]
          || D.catalog.filter(function (m) { return m.name.toLowerCase() === v; })[0];
        if (!hit) return;
        st.ids[Number(inp.dataset.acpCar)] = hit.id;
        render();
      });
    });
    box.addEventListener("close", function () { if (st.url) URL.revokeObjectURL(st.url); st.url = ""; });
    return box;
  }
  function label(m) { return m.name + " · " + (L.fuel[m.fuel] || m.fuel); }
  function status(t) { box.querySelector("[data-acp-status]").textContent = t; }

  var drawing = 0;
  function render() {
    var me = ++drawing;
    box.querySelectorAll("[data-acp-fmt]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.acpFmt === st.fmt)); });
    status(L.loading);
    return Promise.all([loadData(), fontsReady()]).then(function (r) {
      var D = r[0];
      return Promise.all(st.ids.slice(0, st.vs ? 2 : 1).map(function (id) { return factsFor(id, D); })).then(function (fs) {
        if (me !== drawing) return;
        if (fs.some(function (f) { return !f; })) throw new Error("?");
        var cv = document.createElement("canvas"), sz = SIZES[st.fmt];
        cv.width = sz[0]; cv.height = sz[1];
        var g = cv.getContext("2d"), stamp = monthStamp(D);
        if (st.vs) drawVs(g, fs[0], fs[1], st.fmt, L, stamp); else drawOne(g, fs[0], st.fmt, L, stamp);
        st.name = "allo-cars-" + fs.map(function (f) { return f.id; }).join("-vs-") + "-" + st.fmt + ".png";
        var title = st.vs ? L.capVs(fs[0].name, fs[1].name) : L.capOne(fs[0].name);
        st.caption = L.caption(title);
        st.pageUrl = location.origin + (lang === "en" ? "" : "/" + lang) + (st.vs ? "/compare/?cars=" + st.ids.slice(0, 2).map(encodeURIComponent).join(",") : "/car/?car=" + encodeURIComponent(st.ids[0].split(":")[0]));
        var cap = box.querySelector("[data-acp-cap]"); if (cap) cap.value = st.caption;
        if (st.vs) box.querySelectorAll("[data-acp-car]").forEach(function (inp, i) { var m = D.byId[String(st.ids[i]).split(":")[0]]; if (m && document.activeElement !== inp) inp.value = label(m); });
        return new Promise(function (res) { cv.toBlob(res, "image/png"); }).then(function (blob) {
          if (me !== drawing) return;
          if (st.url) URL.revokeObjectURL(st.url);
          st.blob = blob; st.url = URL.createObjectURL(blob);
          var img = box.querySelector("[data-acp-img]");
          img.src = st.url; img.alt = title;
          var a = box.querySelector("[data-acp-save]"); a.href = st.url; a.setAttribute("download", st.name);
          var file = new File([blob], st.name, { type: "image/png" });
          box.querySelector("[data-acp-share]").hidden = !(navigator.canShare && navigator.canShare({ files: [file] }));
          status(L.hold);
        });
      });
    }).catch(function (e) { if (me === drawing) status(L.failed + (e && e.message || e)); });
  }
  function monthStamp(D) {
    var w = D.prices.fuel && D.prices.fuel.week;
    return w ? String(w).slice(0, 7) : "";
  }
  function share() {
    if (!st.blob) return;
    var file = new File([st.blob], st.name, { type: "image/png" });
    // the Chinese text leaves the link out: Xiaohongshu punishes links in notes
    var text = lang === "zh" ? st.caption : st.caption.replace(/cars\.allo\.land\s*$/, "") + st.pageUrl;
    try { navigator.clipboard && navigator.clipboard.writeText(text).catch(function () {}); } catch (e) {}
    navigator.share({ files: [file], text: text }).catch(function () {});
  }
  function copy() {
    var done = function () { status(L.copied); };
    if (navigator.clipboard) navigator.clipboard.writeText(st.caption).then(done, function () {});
    else { var c = box.querySelector("[data-acp-cap]"); c.select(); try { document.execCommand("copy"); done(); } catch (e) {} }
  }

  function open(opts) {
    build();
    st.ids = (opts.ids || []).filter(Boolean).slice(0, 2);
    st.vs = st.ids.length > 1 || !!opts.vs;
    box.querySelector("#acp-h").textContent = st.vs ? L.titleVs : L.title;
    box.querySelector("[data-acp-pick]").hidden = !st.vs;
    if (!box.open) box.showModal();
    if (window.AlloTrack) window.AlloTrack(st.vs ? "poster_vs" : "poster_one");
    loadData().then(function (D) {
      var dl = box.querySelector("#acp-cars");
      if (!dl.children.length) dl.innerHTML = D.catalog.filter(function (m) { return (m.registrations || 0) >= 50 || (m.years && m.years[1] >= D.year - 1); })
        .map(function (m) { return '<option value="' + esc(label(m)) + '"></option>'; }).join("");
      if (st.vs && st.ids.length < 2) {
        // start with the most similar car still sold new, else the best-selling one of the same fuel
        var base = D.byId[String(st.ids[0]).split(":")[0]], G = window.AlloGarage;
        var rival = (G.similar(D.catalog, base, D.year, 1)[0]) || D.catalog.filter(function (m) { return base && m.fuel === base.fuel && m.id !== base.id; })[0];
        if (rival) st.ids[1] = rival.id;
      }
      render();
    }).catch(function (e) { status(L.failed + (e && e.message || e)); });
  }

  window.AlloPoster = { open: open, facts: facts, duel: duel, oneList: oneList, hero: hero, words: words, SIZES: SIZES, drawOne: drawOne, drawVs: drawVs };
})();
