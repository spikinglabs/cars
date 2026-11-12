/* Charger map: every public charger in the Bundesnetzagentur register, from /data/chargers/<region>/.
   One script for the English (/chargers/), German (/de/chargers/) and Chinese (/zh/chargers/) page.

   Data (built by pipelines/chargers):
     latest.json      counts, list of cells, plug and flag bits
     overview.json    station counts on a 0.1 degree grid (zoomed-out map)
     cells/<id>.json  stations of one 0.5 degree cell, id = floor(lat*2)_floor(lon*2)
     places.json      postcode and town centres for the search box

   The "Can I live here without a wallbox?" card uses here.js (ChargeHere) on the stations around the map centre.

   Link parameters (all optional): lat, lon, z (zoom), kw (0, 11, 50, 150), plug (type2,ccs,chademo),
   only (247,card,free,public). Example: /chargers/?lat=50.94&lon=6.96&z=13&kw=150&plug=ccs */
(() => {
  "use strict";
  const lang = (document.documentElement.lang || "en").slice(0, 2);
  const de = lang === "de", zh = lang === "zh";
  const T = zh ? {
    locale: "zh-CN", loading: "加载中 …", failed: "无法加载数据：",
    notYet: "正在第一次读取充电桩数据，请稍后再来。",
    stations: "德国充电站点", fast: "50 kW 及以上", hpc: "150 kW 及以上", points: "个充电点",
    asof: (d) => `数据截至 ${d}。`, zoomIn: "放大地图可查看单个充电桩并使用全部筛选条件。",
    zoomList: "放大地图或搜索地点，即可列出充电桩。",
    shown: (n) => `当前视图中有 ${n.toLocaleString("zh-CN")} 个符合条件的站点`,
    none: "已加载区域内没有符合条件的充电桩。请放宽筛选条件或移动地图。",
    nearDesc: (n) => `最近的 ${n} 个符合条件的站点，按直线距离。`,
    directions: "路线", points1: (n, dc) => `${n} 个充电点${dc ? `，其中 ${dc} 个直流` : ""}`,
    since: (y) => `${y} 年起运营`, open247: "24 小时", card: "可刷卡", free: "免费", customers: "仅限顾客", pnc: "即插即充",
    notFound: "找不到这个地点。试试邮政编码或其他拼写（地名请用德语或英语）。",
    locating: "正在获取你的位置 …", noLocate: "无法获取你的位置。请改为搜索地点。",
    you: "你在这里", stationsN: (n) => `${n.toLocaleString("zh-CN")} 个站点`,
    hereZoom: "搜索你的街道、城市或邮编，或点“我的位置”，就能看到地图中心周围的充电情况。",
    hereDesc: "以地图中心为准，不算仅限顾客的充电桩，不受上方筛选影响。",
    verdict: { easy: "很方便：附近公共充电很多", ok: "可以，但要稍作规划", hard: "没有家里或公司的充电桩会比较难" },
    p1: "1 km 内的充电点", fastNear: "最近的快充（50 kW 以上）", p3: "3 km 内的充电点", noneIn: (k) => `${k} km 内没有`,
    ask: (url, cell, f) => `我在德国给电动车找公共充电桩${f}。请使用地图 ${url} 和站点数据 ${cell}（字段名在 "fields" 中），列出附近最好的几个选择，包括功率、运营商和地址。`,
  } : de ? {
    locale: "de-DE", loading: "Lädt …", failed: "Die Daten konnten nicht geladen werden: ",
    notYet: "Die Ladesäulen werden gerade zum ersten Mal eingelesen. Bitte später nochmal vorbeischauen.",
    stations: "Ladestandorte in Deutschland", fast: "mit 50 kW oder mehr", hpc: "mit 150 kW oder mehr", points: "Ladepunkte",
    asof: (d) => `Stand ${d}.`, zoomIn: "Für einzelne Ladesäulen und alle Filter hineinzoomen.",
    zoomList: "Hineinzoomen oder einen Ort suchen, um Ladesäulen aufzulisten.",
    shown: (n) => `${n.toLocaleString("de-DE")} passende Standorte im Kartenausschnitt`,
    none: "Keine passende Ladesäule im geladenen Bereich. Filter lockern oder die Karte verschieben.",
    nearDesc: (n) => `Die ${n} nächsten passenden Standorte, Luftlinie.`,
    directions: "Route", points1: (n, dc) => `${n} Ladepunkt${n === 1 ? "" : "e"}${dc ? `, davon ${dc} DC` : ""}`,
    since: (y) => `in Betrieb seit ${y}`, open247: "24/7", card: "Kartenzahlung", free: "kostenlos", customers: "nur Kunden", pnc: "Plug & Charge",
    notFound: "Ort nicht gefunden. Versuch es mit einer Postleitzahl oder einem anderen Ortsnamen.",
    locating: "Standort wird ermittelt …", noLocate: "Dein Standort ist nicht verfügbar. Such stattdessen einen Ort.",
    you: "Du bist hier", stationsN: (n) => n === 1 ? "1 Standort" : `${n.toLocaleString("de-DE")} Standorte`,
    hereZoom: "Such deine Straße, Stadt oder Postleitzahl oder tipp auf „In meiner Nähe“, dann siehst du, wie gut man rund um die Kartenmitte laden kann.",
    hereDesc: "Rund um die Kartenmitte, ohne Ladesäulen nur für Kunden und unabhängig von den Filtern oben.",
    verdict: { easy: "Einfach: viele öffentliche Ladepunkte in der Nähe", ok: "Machbar, mit etwas Planung", hard: "Schwierig ohne Lademöglichkeit zu Hause oder bei der Arbeit" },
    p1: "Ladepunkte im Umkreis von 1 km", fastNear: "nächster Schnelllader (ab 50 kW)", p3: "Ladepunkte im Umkreis von 3 km", noneIn: (k) => `keiner im Umkreis von ${k} km`,
    ask: (url, cell, f) => `Ich suche eine Ladesäule für mein E-Auto in Deutschland${f}. Bitte nutze die Karte ${url} und die Stationsdaten ${cell} (Felder stehen in "fields") und nenne mir die besten Optionen in der Nähe mit Leistung, Betreiber und Adresse.`,
  } : {
    locale: "en-GB", loading: "Loading …", failed: "Could not load data: ",
    notYet: "The chargers are being read in for the first time. Please check back later.",
    stations: "charging locations in Germany", fast: "with 50 kW or more", hpc: "with 150 kW or more", points: "charge points",
    asof: (d) => `as of ${d}.`, zoomIn: "Zoom in for single chargers and all filters.",
    zoomList: "Zoom in or search a place to list chargers.",
    shown: (n) => `${n.toLocaleString("en-GB")} matching locations in view`,
    none: "No matching charger in the loaded area. Loosen the filters or move the map.",
    nearDesc: (n) => `The ${n} closest matching locations, as the crow flies.`,
    directions: "Directions", points1: (n, dc) => `${n} charge point${n === 1 ? "" : "s"}${dc ? `, ${dc} DC` : ""}`,
    since: (y) => `open since ${y}`, open247: "24/7", card: "Card payment", free: "Free", customers: "Customers only", pnc: "Plug & Charge",
    notFound: "Place not found. Try a postcode or another spelling.",
    locating: "Finding your location …", noLocate: "Your location is not available. Search a place instead.",
    you: "You are here", stationsN: (n) => n === 1 ? "1 location" : `${n.toLocaleString("en-GB")} locations`,
    hereZoom: "Search your street, town or postcode, or tap Near me, to see how easy charging is around the middle of the map.",
    hereDesc: "Around the middle of the map, leaving out customer-only chargers, whatever the filters above.",
    verdict: { easy: "Easy: plenty of public charging close by", ok: "Possible, with some planning", hard: "Hard without charging at home or at work" },
    p1: "charge points within 1 km", fastNear: "nearest fast charger (50 kW and up)", p3: "charge points within 3 km", noneIn: (k) => `none within ${k} km`,
    ask: (url, cell, f) => `I'm looking for a public charger for my EV in Germany${f}. Please use the map ${url} and the station data ${cell} (field names are in "fields") and list the best nearby options with power, operator and address.`,
  };
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const num = (n) => Number(n).toLocaleString(T.locale);
  const data = (file) => (window.AlloSite ? AlloSite.data("chargers", file) : "/data/chargers/de/" + file);
  const ORIGIN = "https://cars.allo.land";

  const PLUG = { type2: 1, ccs: 2, chademo: 4, schuko: 8, mcs: 16, type1: 32 };
  const PLUG_NAME = { type2: "Type 2", ccs: "CCS", chademo: "CHAdeMO", schuko: "Schuko", mcs: "MCS", type1: "Type 1" };
  const FLAG = { open247: 1, free: 2, card: 4, customers: 8, pnc: 16 };
  const CELL = 0.5, DETAIL_ZOOM = 11, NEAR = 10;
  const DEFAULT = { lat: 51.16, lon: 10.45, z: 6 };

  /* ---------- state in the link ---------- */
  const qs = new URLSearchParams(location.search);
  const listParam = (k, allowed) => (qs.get(k) || "").split(",").map((s) => s.trim().toLowerCase()).filter((s) => allowed.includes(s));
  const state = {
    kw: [0, 11, 50, 150].includes(+qs.get("kw")) ? +qs.get("kw") : 0,
    plug: listParam("plug", ["type2", "ccs", "chademo"]),
    only: listParam("only", ["247", "card", "free", "public"]),
  };
  const fnum = (k, lo, hi) => { const v = parseFloat(qs.get(k)); return isFinite(v) && v >= lo && v <= hi ? v : null; };
  const start = { lat: fnum("lat", 47, 55.5) ?? DEFAULT.lat, lon: fnum("lon", 5, 16) ?? DEFAULT.lon, z: fnum("z", 5, 18) ?? DEFAULT.z };

  function matches(s) {
    if (s.kw < state.kw) return false;
    if (state.plug.length && !state.plug.some((p) => s.plugs & PLUG[p])) return false;
    for (const o of state.only) {
      if (o === "247" && !(s.flags & FLAG.open247)) return false;
      if (o === "card" && !(s.flags & FLAG.card)) return false;
      if (o === "free" && !(s.flags & FLAG.free)) return false;
      if (o === "public" && (s.flags & FLAG.customers)) return false;
    }
    return true;
  }

  /* ---------- map ---------- */
  const map = L.map("map", { zoomControl: true, minZoom: 5, maxZoom: 18, worldCopyJump: false, preferCanvas: true })
    .setView([start.lat, start.lon], start.z);
  map.attributionControl.setPrefix(false);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
  }).addTo(map);
  const canvas = L.canvas({ padding: 0.3 });
  const overviewLayer = L.layerGroup().addTo(map);
  const stationLayer = L.layerGroup().addTo(map);
  let youMarker = null;

  const style = (s) => s.kw >= 150 ? { fillColor: "#17191b", color: "#ffcc00" } : s.kw >= 50 ? { fillColor: "#ffcc00", color: "#17191b" } : { fillColor: "#1d4f91", color: "#ffffff" };
  const radius = (s, z) => Math.max(4, Math.min(11, (z - 7) * 0.9 + Math.log2(1 + s.points)));

  /* ---------- data ---------- */
  let latest = null, overview = null, places = null;
  const cells = new Map(); // id -> Promise<station[]>
  const httpError = (r) => { const e = new Error(r.status + " " + r.statusText); e.status = r.status; return e; };
  const getJson = (url) => fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(httpError(r))));

  function loadCell(id) {
    if (!cells.has(id)) {
      const known = latest && latest.cells ? latest.cells.includes(id) : true;
      cells.set(id, !known ? Promise.resolve([]) : getJson(data(`cells/${id}.json`)).then((c) => {
        const f = Object.fromEntries(c.fields.map((k, i) => [k, i]));
        return c.stations.map((r) => ({
          lat: r[f.lat], lon: r[f.lon], kw: r[f.kw], points: r[f.points], dc: r[f.dc_points], plugs: r[f.plugs],
          operator: c.operators[r[f.operator]] || "", name: r[f.name] || "", address: r[f.address] || "", flags: r[f.flags], since: r[f.since], cell: id,
        }));
      }).catch((e) => { cells.delete(id); throw e; }));
    }
    return cells.get(id);
  }
  const cellId = (lat, lon) => `${Math.floor(lat / CELL)}_${Math.floor(lon / CELL)}`;
  function cellsIn(b) {
    const ids = [];
    for (let a = Math.floor(b.getSouth() / CELL); a <= Math.floor(b.getNorth() / CELL); a++)
      for (let o = Math.floor(b.getWest() / CELL); o <= Math.floor(b.getEast() / CELL); o++) ids.push(`${a}_${o}`);
    return ids;
  }

  /* ---------- drawing ---------- */
  function popup(s) {
    const plugs = Object.keys(PLUG).filter((k) => s.plugs & PLUG[k]).map((k) => PLUG_NAME[k]);
    const tags = [];
    if (s.flags & FLAG.open247) tags.push(T.open247);
    if (s.flags & FLAG.card) tags.push(T.card);
    if (s.flags & FLAG.pnc) tags.push(T.pnc);
    if (s.flags & FLAG.free) tags.push(T.free);
    if (s.flags & FLAG.customers) tags.push(T.customers);
    const go = `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lon}`;
    return `<div class="pop"><h3>${esc(s.operator)}</h3>${s.name && !/^[A-Z0-9_-]{4,}$/.test(s.name) ? `<p>${esc(s.name)}</p>` : ""}
      <p><span class="kw">${num(s.kw)} kW</span> · ${T.points1(s.points, s.dc)}</p>
      <p>${plugs.map(esc).join(", ")}</p>
      ${tags.length ? `<div class="tags">${tags.map((t) => `<span>${esc(t)}</span>`).join("")}</div>` : ""}
      <p>${esc(s.address)}${s.since ? `<br><small>${T.since(s.since)}</small>` : ""}</p>
      <p><a class="go" href="${go}" target="_blank" rel="noopener">${T.directions} ↗</a></p></div>`;
  }

  function bubble(n, fast) {
    const d = Math.round(Math.max(22, Math.min(48, 16 + Math.sqrt(n) * 1.2)));
    const label = n >= 10000 ? Math.round(n / 1000) + "k" : n >= 1000 ? (n / 1000).toFixed(1).replace(".0", "") + "k" : n;
    return L.divIcon({ className: "", html: `<div class="cluster${fast ? " fast" : ""}" style="width:${d}px;height:${d}px">${label}</div>`, iconSize: [d, d] });
  }

  function drawOverview() {
    overviewLayer.clearLayers();
    if (!overview) return;
    const z = map.getZoom();
    const step = z <= 5 ? 2.4 : z === 6 ? 1.2 : z === 7 ? 0.6 : z === 8 ? 0.3 : z === 9 ? 0.15 : 0.1;
    const col = state.kw >= 150 ? 5 : state.kw >= 50 ? 4 : 2;
    const acc = new Map();
    for (const r of overview.squares) {
      const n = r[col];
      if (!n) continue;
      const k = Math.floor(r[0] / step) + ":" + Math.floor(r[1] / step);
      const a = acc.get(k) || [0, 0, 0];
      a[0] += r[0] * n; a[1] += r[1] * n; a[2] += n;
      acc.set(k, a);
    }
    for (const a of acc.values()) {
      const m = L.marker([a[0] / a[2], a[1] / a[2]], { icon: bubble(a[2], state.kw >= 50), keyboard: false });
      m.on("click", () => map.setView(m.getLatLng(), Math.min(DETAIL_ZOOM, z + 2)));
      overviewLayer.addLayer(m);
    }
  }

  let drawn = []; // stations currently in view and matching
  let token = 0;
  async function drawStations() {
    const my = ++token;
    const b = map.getBounds().pad(0.15);
    let lists;
    try {
      lists = await Promise.all(cellsIn(b).map(loadCell));
    } catch (e) {
      if (my === token) say(e.status === 404 ? T.notYet : T.failed + e.message);
      return;
    }
    if (my !== token) return;
    stationLayer.clearLayers();
    const z = map.getZoom();
    drawn = [];
    for (const list of lists) for (const s of list) {
      if (!matches(s) || !b.contains([s.lat, s.lon])) continue;
      drawn.push(s);
    }
    drawn.sort((x, y) => x.kw - y.kw); // fastest on top
    for (const s of drawn) {
      const m = L.circleMarker([s.lat, s.lon], { renderer: canvas, radius: radius(s, z), weight: 1.5, fillOpacity: 0.95, ...style(s) });
      m.bindPopup(() => popup(s), { maxWidth: 300 });
      s.marker = m;
      stationLayer.addLayer(m);
    }
    $("maphint").textContent = T.shown(drawn.length);
    listNear();
  }

  function km(a, b) {
    const R = 6371, rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  const dist = (d) => d < 1 ? `${Math.round(d * 1000 / 10) * 10} m` : `${d.toLocaleString(T.locale, { maximumFractionDigits: d < 10 ? 1 : 0 })} km`;

  function listNear() {
    const ol = $("near");
    if (map.getZoom() < DETAIL_ZOOM) { ol.innerHTML = ""; $("neardesc").textContent = T.zoomList; return; }
    const c = map.getCenter(), here = { lat: c.lat, lon: c.lng };
    const best = drawn.map((s) => [km(here, s), s]).sort((a, b) => a[0] - b[0]).slice(0, NEAR);
    if (!best.length) { ol.innerHTML = ""; $("neardesc").textContent = T.none; return; }
    $("neardesc").textContent = T.nearDesc(best.length);
    ol.innerHTML = best.map(([d, s], i) => `<li><span class="d">${dist(d)}</span>
      <button type="button" class="who" data-i="${i}"><b>${esc(s.operator)}</b><span>${esc(s.address)}</span></button>
      <span class="k">${num(s.kw)}<small> kW</small> <small>· ${s.points}×</small></span></li>`).join("");
    ol.querySelectorAll("button.who").forEach((btn) => btn.addEventListener("click", () => {
      const s = best[+btn.dataset.i][1];
      map.setView([s.lat, s.lon], Math.max(map.getZoom(), 15));
      setTimeout(() => s.marker && s.marker.openPopup(), 350);
      $("map").scrollIntoView({ behavior: "smooth", block: "center" });
    }));
  }

  /* ---------- can I live here without a wallbox? (here.js) ---------- */
  const HERE_ZOOM = 12;
  let hereToken = 0;
  async function updateHere() {
    const my = ++hereToken, out = $("here");
    if (map.getZoom() < HERE_ZOOM) { $("heredesc").textContent = T.hereZoom; out.innerHTML = ""; out.className = "here"; return; }
    const c = map.getCenter();
    const box = { getSouth: () => c.lat - 0.05, getNorth: () => c.lat + 0.05, getWest: () => c.lng - 0.08, getEast: () => c.lng + 0.08 };
    let lists;
    try { lists = await Promise.all(cellsIn(box).map(loadCell)); } catch (e) { return; }
    if (my !== hereToken) return;
    const r = ChargeHere.summarize([].concat(...lists), c.lat, c.lng);
    $("heredesc").textContent = T.hereDesc;
    out.className = "here here--" + r.verdict;
    out.innerHTML = `<p class="here__verdict">${esc(T.verdict[r.verdict])}</p><div class="ac-readouts">
      <div class="ac-readout ac-readout--md"><span class="ac-readout__value">${num(r.points_1km)}</span><span class="ac-readout__basis">${T.p1}</span></div>
      <div class="ac-readout ac-readout--md">${r.nearest_fast_km == null || r.nearest_fast_km > 5 ? `<span class="ac-readout__value small">${esc(T.noneIn(5))}</span>` : `<span class="ac-readout__value">${dist(r.nearest_fast_km)}</span>`}<span class="ac-readout__basis">${T.fastNear}</span></div>
      <div class="ac-readout ac-readout--md"><span class="ac-readout__value">${num(r.points_3km)}</span><span class="ac-readout__basis">${T.p3}</span></div></div>`;
  }

  function redraw() {
    updateHere();
    const detail = map.getZoom() >= DETAIL_ZOOM;
    if (detail) { overviewLayer.clearLayers(); drawStations(); }
    else { token++; stationLayer.clearLayers(); drawn = []; drawOverview(); $("maphint").textContent = T.zoomIn; listNear(); }
    syncUrl();
  }

  /* ---------- link and AI ---------- */
  function link() {
    const c = map.getCenter();
    const p = new URLSearchParams();
    p.set("lat", c.lat.toFixed(4)); p.set("lon", c.lng.toFixed(4)); p.set("z", map.getZoom());
    if (state.kw) p.set("kw", state.kw);
    if (state.plug.length) p.set("plug", state.plug.join(","));
    if (state.only.length) p.set("only", state.only.join(","));
    const country = qs.get("country");
    if (country) p.set("country", country);
    return p;
  }
  function syncUrl() {
    const p = link();
    history.replaceState(null, "", location.pathname + "?" + p.toString() + location.hash);
    const c = map.getCenter();
    const filt = [state.kw ? `${state.kw} kW+` : "", state.plug.map((k) => PLUG_NAME[k]).join("/"),
      state.only.map((o) => ({ 247: T.open247, card: T.card, free: T.free, public: de ? "öffentlich" : zh ? "非仅限顾客" : "public" })[o]).join(", ")].filter(Boolean).join(", ");
    const prompt = T.ask(ORIGIN + location.pathname + "?" + p.toString(), ORIGIN + data(`cells/${cellId(c.lat, c.lng)}.json`), filt ? ` (${filt})` : "");
    $("aigo").href = "https://claude.ai/new?q=" + encodeURIComponent(prompt);
    // the same spot on Allo Outings' map, with its charger layer on
    const o = $("outings");
    if (o) o.href = `https://outings.allo.land/${de ? "de" : zh ? "zh" : "en"}/?lat=${c.lat.toFixed(4)}&lon=${c.lng.toFixed(4)}&ev=1#map`;
  }

  /* ---------- filters ---------- */
  function paintFilters() {
    document.querySelectorAll("#kw button").forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.kw === state.kw)));
    document.querySelectorAll("#plug button").forEach((b) => b.setAttribute("aria-pressed", String(state.plug.includes(b.dataset.plug))));
    document.querySelectorAll("#only button").forEach((b) => b.setAttribute("aria-pressed", String(state.only.includes(b.dataset.only))));
  }
  const toggle = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : arr.concat(v));
  $("kw").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; state.kw = +b.dataset.kw; paintFilters(); redraw(); });
  $("plug").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; state.plug = toggle(state.plug, b.dataset.plug); paintFilters(); redraw(); });
  $("only").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; state.only = toggle(state.only, b.dataset.only); paintFilters(); redraw(); });
  paintFilters();

  /* ---------- search ---------- */
  const fold = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ß/g, "ss").replace(/[^a-z0-9]+/g, " ").trim();
  let placeIndex = null; // [{label, pc, lat, lon, n, key}]
  function loadPlaces() {
    if (!places) places = getJson(data("places.json")).then((p) => {
      // One entry per postcode, plus one per town with all its postcodes together. Towns that share
      // a name (Münster in Westphalia and in Hesse) are told apart by the first two postcode digits.
      const towns = new Map(), out = [];
      for (const [town, pc, lat, lon, n] of p.places) {
        out.push({ label: town, pc, lat, lon, n, key: pc + " " + fold(town) });
        const id = town + "|" + pc.slice(0, 2);
        const t = towns.get(id) || { label: town, area: pc.slice(0, 2), lat: 0, lon: 0, n: 0, pcs: 0 };
        t.lat += lat * n; t.lon += lon * n; t.n += n; t.pcs++;
        towns.set(id, t);
      }
      const names = new Map();
      for (const t of towns.values()) names.set(t.label, (names.get(t.label) || 0) + 1);
      for (const t of towns.values()) out.push({ label: t.label, pc: names.get(t.label) > 1 ? t.area + "…" : "", lat: t.lat / t.n, lon: t.lon / t.n, n: t.n, key: fold(t.label), town: true, pcs: t.pcs });
      placeIndex = out;
      return out;
    }).catch((e) => { places = null; throw e; });
    return places;
  }
  function search(q) {
    const f = fold(q);
    if (!f || !placeIndex) return [];
    const digits = /^\d+$/.test(f);
    const hits = placeIndex.filter((p) => digits ? (!p.town && p.pc.startsWith(f)) : p.town && (p.key.startsWith(f) || p.key.includes(" " + f)));
    hits.sort((a, b) => (digits ? a.pc.localeCompare(b.pc) : (b.key.startsWith(f) - a.key.startsWith(f)) || b.n - a.n));
    return hits.slice(0, 8);
  }
  const q = $("q"), sugg = $("sugg");
  let hits = [], sel = -1;
  function showSugg() {
    sel = -1;
    sugg.innerHTML = hits.map((h, i) => `<li role="option" id="sg${i}" data-i="${i}" aria-selected="false"><span>${h.pc ? esc(h.pc) + " " : ""}${esc(h.label)}</span><small>${T.stationsN(h.n)}</small></li>`).join("");
    sugg.hidden = !hits.length;
    q.setAttribute("aria-expanded", String(!!hits.length));
  }
  function pick(h) {
    sugg.hidden = true; q.setAttribute("aria-expanded", "false");
    q.value = (h.pc && !h.town ? h.pc + " " : "") + h.label;
    note("");
    map.setView([h.lat, h.lon], h.town && h.pcs > 3 ? 12 : 13);
  }
  q.addEventListener("focus", () => { loadPlaces().catch(() => {}); });
  q.addEventListener("input", async () => {
    try { await loadPlaces(); } catch (e) { return; }
    hits = search(q.value); showSugg();
  });
  q.addEventListener("keydown", (e) => {
    if (sugg.hidden || !hits.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      sel = (sel + (e.key === "ArrowDown" ? 1 : -1) + hits.length) % hits.length;
      sugg.querySelectorAll("li").forEach((li, i) => li.setAttribute("aria-selected", String(i === sel)));
      q.setAttribute("aria-activedescendant", "sg" + sel);
    } else if (e.key === "Escape") { sugg.hidden = true; }
  });
  sugg.addEventListener("mousedown", (e) => { const li = e.target.closest("li"); if (li) { e.preventDefault(); pick(hits[+li.dataset.i]); } });
  document.addEventListener("click", (e) => { if (!e.target.closest(".find__box")) sugg.hidden = true; });
  $("find").addEventListener("submit", async (e) => {
    e.preventDefault();
    try { await loadPlaces(); } catch (err) { note(T.failed + err.message); return; }
    const list = hits.length && !sugg.hidden ? hits : search(q.value);
    const h = list[sel >= 0 ? sel : 0];
    if (h) pick(h); else note(T.notFound);
  });
  function note(text) { const m = $("findmsg"); m.textContent = text; m.hidden = !text; }

  $("locate").addEventListener("click", () => {
    if (!navigator.geolocation) return note(T.noLocate);
    note(T.locating);
    navigator.geolocation.getCurrentPosition((pos) => {
      note("");
      const ll = [pos.coords.latitude, pos.coords.longitude];
      if (youMarker) youMarker.remove();
      youMarker = L.circleMarker(ll, { radius: 8, weight: 3, color: "#fff", fillColor: "#d1001f", fillOpacity: 1 }).bindTooltip(T.you).addTo(map);
      map.setView(ll, 14);
    }, () => note(T.noLocate), { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
  });

  /* ---------- start ---------- */
  function say(text) {
    $("readouts").innerHTML = `<p class="ac-caption" style="margin:0">${esc(text)}</p>`;
    $("maphint").textContent = "";
  }
  map.on("moveend", redraw);

  Promise.all([getJson(data("latest.json")), getJson(data("overview.json"))]).then(([l, o]) => {
    latest = l; overview = o;
    const when = new Date(l.observed_at + "T12:00:00Z").toLocaleDateString(T.locale, { day: "numeric", month: "long", year: "numeric" });
    $("asof").textContent = T.asof(when);
    $("readouts").innerHTML = `
      <div class="ac-readout"><div class="ac-readout__value">${num(l.stations)}</div><div class="ac-readout__basis">${T.stations} · ${num(l.points)} ${T.points}</div></div>
      <div class="ac-readout"><div class="ac-readout__value">${num(l.fast_50kw_stations)}</div><div class="ac-readout__basis">${T.fast}</div></div>
      <div class="ac-readout"><div class="ac-readout__value">${num(l.hpc_150kw_stations)}</div><div class="ac-readout__basis">${T.hpc}</div></div>`;
    redraw();
  }).catch((e) => { say(e.status === 404 ? T.notYet : T.failed + e.message); syncUrl(); });
})();
