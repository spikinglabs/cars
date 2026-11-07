/* Charger map: every public charger in the Bundesnetzagentur register, from /data/chargers/<region>/.
   One script for the English (/chargers/), German (/de/chargers/) and Chinese (/zh/chargers/) page.

   Data (built by pipelines/chargers):
     latest.json      counts, list of cells, plug and flag bits
     overview.json    station counts on a 0.1 degree grid (zoomed-out map)
     cells/<id>.json  stations of one 0.5 degree cell, id = floor(lat*2)_floor(lon*2)
     places.json      postcode and town centres for the search box

   Family outings ("charge while the kids play", built by pipelines/outings from Allo Outings):
     /data/outings/<region>/latest.json, cells/<id>.json   kid-friendly places and events, same cells

   Link parameters (all optional): lat, lon, z (zoom), kw (0, 11, 50, 150), plug (type2,ccs,chademo),
   only (247,card,free,public), kids (1 = show family outings). Example: /chargers/?lat=50.94&lon=6.96&z=13&kw=150&plug=ccs&kids=1 */
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
    ask: (url, cell, f) => `我在德国给电动车找公共充电桩${f}。请使用地图 ${url} 和站点数据 ${cell}（字段名在 "fields" 中），列出附近最好的几个选择，包括功率、运营商和地址。`,
    askKids: (cell) => `我们带着孩子。附近适合孩子的地方和活动在 ${cell}（来自 Allo Outings，字段名在 "place_fields" 和 "event_fields" 中）。请优先推荐步行几分钟内就有游乐场、公园或活动的充电桩，让孩子在充电时可以玩。`,
    kind: { playground: "游乐场", park: "公园", pool: "游泳池和湖", farm: "农场", zoo: "动物园", museum: "博物馆", indoor: "室内游乐", fun: "游乐园", cafe: "亲子咖啡馆", winter: "滑冰和滑雪橇", event: "亲子活动" },
    kidsOff: "打开「亲子去处」，就能看到充电桩附近的游乐场、游泳池、动物园和本周活动（来自 Allo Outings）。",
    kidsOn: "显示亲子去处", kidsZoom: "放大地图或搜索地点，即可找到附近有亲子去处的充电桩。",
    kidsDesc: (n, m) => `${n} 个亲子去处，${m} 米内有符合条件的充电桩，离地图中心最近的排在前面。`,
    kidsNone: (m) => `当前视图中没有 ${m} 米内有符合条件充电桩的亲子去处。移动地图或放宽筛选条件。`,
    kidsFail: "暂时无法加载亲子去处。", nearestCharger: "最近的充电桩", showCharger: "在地图上显示",
    onOutings: "在 Allo Outings 查看", nearby: "附近", today: "今天", until: (d) => `至 ${d}`, indoorTag: "室内", freeTag: "免费",
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
    ask: (url, cell, f) => `Ich suche eine Ladesäule für mein E-Auto in Deutschland${f}. Bitte nutze die Karte ${url} und die Stationsdaten ${cell} (Felder stehen in "fields") und nenne mir die besten Optionen in der Nähe mit Leistung, Betreiber und Adresse.`,
    askKids: (cell) => ` Wir haben Kinder dabei. Kinderfreundliche Orte und Termine in der Nähe stehen in ${cell} (von Allo Outings, Felder in "place_fields" und "event_fields"). Bevorzuge Ladesäulen mit einem Spielplatz, Park oder Termin wenige Gehminuten entfernt, damit die Kinder beim Laden spielen können.`,
    kind: { playground: "Spielplatz", park: "Park", pool: "Bad und See", farm: "Bauernhof", zoo: "Zoo und Tiere", museum: "Museum", indoor: "Indoor-Spielplatz", fun: "Freizeitpark", cafe: "Familiencafé", winter: "Eisbahn und Rodeln", event: "Familientermin" },
    kidsOff: "Mit „Ausflüge mit Kindern“ siehst du Spielplätze, Bäder, Zoos und Termine dieser Woche von Allo Outings neben den Ladesäulen.",
    kidsOn: "Ausflüge zeigen", kidsZoom: "Hineinzoomen oder einen Ort suchen, um Ladesäulen mit Ausflugszielen in der Nähe zu finden.",
    kidsDesc: (n, m) => `${n} Ausflugsziel${n === 1 ? "" : "e"} mit passender Ladesäule im Umkreis von ${m} m, das nächste zur Kartenmitte zuerst.`,
    kidsNone: (m) => `Im Kartenausschnitt hat kein Ausflugsziel eine passende Ladesäule im Umkreis von ${m} m. Karte verschieben oder Filter lockern.`,
    kidsFail: "Die Ausflugsziele konnten gerade nicht geladen werden.", nearestCharger: "Nächste Ladesäule", showCharger: "Auf der Karte zeigen",
    onOutings: "Bei Allo Outings", nearby: "In der Nähe", today: "heute", until: (d) => `bis ${d}`, indoorTag: "drinnen", freeTag: "kostenlos",
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
    ask: (url, cell, f) => `I'm looking for a public charger for my EV in Germany${f}. Please use the map ${url} and the station data ${cell} (field names are in "fields") and list the best nearby options with power, operator and address.`,
    askKids: (cell) => ` We have kids with us. Kid-friendly places and events nearby are in ${cell} (from Allo Outings, field names in "place_fields" and "event_fields"). Prefer chargers with a playground, park or event a few minutes' walk away, so the kids can play while we charge.`,
    kind: { playground: "Playground", park: "Park", pool: "Pool or lake", farm: "Farm", zoo: "Zoo and animals", museum: "Museum", indoor: "Indoor play", fun: "Theme park", cafe: "Family café", winter: "Ice rink and sledging", event: "Family event" },
    kidsOff: "Turn on family outings to see playgrounds, pools, zoos and this week's events from Allo Outings next to the chargers.",
    kidsOn: "Show family outings", kidsZoom: "Zoom in or search a place to find chargers with family outings nearby.",
    kidsDesc: (n, m) => `${n} family outing${n === 1 ? "" : "s"} with a matching charger within ${m} m, closest to the middle of the map first.`,
    kidsNone: (m) => `No family outing in view has a matching charger within ${m} m. Move the map or loosen the filters.`,
    kidsFail: "Family outings could not be loaded just now.", nearestCharger: "Nearest charger", showCharger: "Show on map",
    onOutings: "On Allo Outings", nearby: "Nearby", today: "today", until: (d) => `until ${d}`, indoorTag: "indoor", freeTag: "free",
  };
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const num = (n) => Number(n).toLocaleString(T.locale);
  const data = (file) => (window.AlloSite ? AlloSite.data("chargers", file) : "/data/chargers/de/" + file);
  const ORIGIN = "https://cars.allo.land";
  const OUTINGS = "https://outings.allo.land";
  const outData = (file) => (window.AlloSite ? AlloSite.data("outings", file) : "/data/outings/de/" + file);

  const PLUG = { type2: 1, ccs: 2, chademo: 4, schuko: 8, mcs: 16, type1: 32 };
  const PLUG_NAME = { type2: "Type 2", ccs: "CCS", chademo: "CHAdeMO", schuko: "Schuko", mcs: "MCS", type1: "Type 1" };
  const FLAG = { open247: 1, free: 2, card: 4, customers: 8, pnc: 16 };
  const CELL = 0.5, DETAIL_ZOOM = 11, NEAR = 10;
  const WALK = 500, ICON_ZOOM = 14, KIDS_LIST = 8, EVENT_DAYS = 7; // metres; zoom for emoji icons; rows; days ahead
  const EMOJI = { playground: "🛝", park: "🌳", pool: "🏊", farm: "🐄", zoo: "🦒", museum: "🏛️", indoor: "🧸", fun: "🎢", cafe: "☕", winter: "⛸️", event: "📅" };
  const DEFAULT = { lat: 51.16, lon: 10.45, z: 6 };

  /* ---------- state in the link ---------- */
  const qs = new URLSearchParams(location.search);
  const listParam = (k, allowed) => (qs.get(k) || "").split(",").map((s) => s.trim().toLowerCase()).filter((s) => allowed.includes(s));
  const state = {
    kw: [0, 11, 50, 150].includes(+qs.get("kw")) ? +qs.get("kw") : 0,
    plug: listParam("plug", ["type2", "ccs", "chademo"]),
    only: listParam("only", ["247", "card", "free", "public"]),
    kids: qs.get("kids") === "1",
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
  const spotLayer = L.layerGroup().addTo(map);
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
      ${state.kids && s.spot ? `<p class="kidsline">${EMOJI[s.spot[1].kind]} <a href="${spotUrl(s.spot[1])}" target="_blank" rel="noopener">${esc(spotName(s.spot[1]))}</a> · ${dist(s.spot[0])}</p>` : ""}
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
    await drawSpots(b, my);
    if (my !== token) return;
    listNear();
    listKids();
  }

  /* ---------- family outings (Allo Outings) ---------- */
  const outCells = new Map(); // id -> Promise<{places, events}>
  let outLatest = null; // Promise<latest.json>
  let spots = [], spotsFailed = false; // places and events in view
  const isoDay = (d) => d.toISOString().slice(0, 10);
  function loadOutCell(id) {
    if (!outLatest) outLatest = getJson(outData("latest.json")).catch((e) => { outLatest = null; throw e; });
    if (!outCells.has(id)) {
      outCells.set(id, outLatest.then((l) => !l.cells.includes(id) ? { places: [], events: [] } : getJson(outData(`cells/${id}.json`)).then((c) => {
        const pf = Object.fromEntries(c.place_fields.map((k, i) => [k, i])), ef = Object.fromEntries(c.event_fields.map((k, i) => [k, i]));
        return {
          places: c.places.map((r) => ({ type: "place", lat: r[pf.lat], lon: r[pf.lon], kind: r[pf.kind], id: r[pf.id], name: r[pf.name], name_zh: r[pf.name_zh], town: r[pf.town], free: r[pf.free], indoor: r[pf.indoor], hours: r[pf.hours] })),
          events: c.events.map((r) => ({ type: "event", kind: "event", lat: r[ef.lat], lon: r[ef.lon], id: r[ef.id], start: r[ef.start], end: r[ef.end], time: r[ef.time], de: r[ef.title_de], en: r[ef.title_en], zh: r[ef.title_zh], venue: r[ef.venue], town: r[ef.town], free: r[ef.free] })),
        };
      })).catch((e) => { outCells.delete(id); throw e; }));
    }
    return outCells.get(id);
  }
  const spotName = (p) => p.type === "event" ? (zh ? p.zh || p.de : de ? p.de : p.en || p.de) : (zh && p.name_zh) || p.name;
  const spotUrl = (p) => `${OUTINGS}/${lang}/${p.type === "event" ? "termine" : "orte"}/${encodeURIComponent(p.id)}/`;
  const fmtDay = (iso, opts) => new Date(iso + "T12:00:00Z").toLocaleDateString(T.locale, opts);
  function when(p) {
    const today = isoDay(new Date());
    if (p.start <= today) return p.end > today ? T.until(fmtDay(p.end, { day: "numeric", month: "short" })) : T.today + (p.time ? " " + p.time : "");
    return fmtDay(p.start, { weekday: "short", day: "numeric", month: "short" }) + (p.time ? " " + p.time : "");
  }
  function spotSub(p) {
    if (p.type === "event") return [when(p), p.venue].filter(Boolean).join(" · ");
    return [T.kind[p.kind], p.town, p.indoor ? T.indoorTag : "", p.free ? T.freeTag : ""].filter(Boolean).join(" · ");
  }
  // Nearest matching charger to a spot (and the other way round), as the crow flies, in km.
  function nearest(p, list) {
    let best = null, bd = Infinity;
    for (const s of list) { const d = km(p, s); if (d < bd) { bd = d; best = s; } }
    return best ? [bd, best] : null;
  }
  function spotPopup(p) {
    const c = p.charger;
    return `<div class="pop"><p class="pop__kind">${EMOJI[p.kind]} ${esc(T.kind[p.kind])}</p><h3>${esc(spotName(p))}</h3>
      <p>${esc(p.type === "event" ? spotSub(p) : [p.town, p.indoor ? T.indoorTag : "", p.free ? T.freeTag : ""].filter(Boolean).join(" · "))}</p>
      ${p.hours && p.hours !== "24/7" ? `<p><small>${esc(p.hours)}</small></p>` : ""}
      ${c ? `<p class="kidsline">⚡ ${T.nearestCharger}: <b>${num(c[1].kw)} kW</b> · ${dist(c[0])}<br><small>${esc(c[1].operator)}</small></p>
        <p><button type="button" class="linkbtn" data-show-charger>${T.showCharger}</button></p>` : ""}
      <p><a class="go" href="${spotUrl(p)}" target="_blank" rel="noopener">${T.onOutings} ↗</a></p></div>`;
  }
  function showCharger(s) {
    map.closePopup();
    map.setView([s.lat, s.lon], Math.max(map.getZoom(), 16));
    setTimeout(() => s.marker && s.marker.openPopup(), 350);
  }
  async function drawSpots(b, my) {
    spotLayer.clearLayers();
    spots = []; spotsFailed = false;
    for (const s of drawn) s.spot = null;
    if (!state.kids) return;
    let lists;
    try { lists = await Promise.all(cellsIn(b).map(loadOutCell)); }
    catch (e) { spotsFailed = true; return; }
    if (my !== token) return;
    const today = isoDay(new Date()), last = isoDay(new Date(Date.now() + EVENT_DAYS * 864e5));
    for (const c of lists) {
      for (const p of c.places) if (b.contains([p.lat, p.lon])) spots.push(p);
      for (const e of c.events) if (e.end >= today && e.start <= last && b.contains([e.lat, e.lon])) spots.push(e);
    }
    // Pair each spot with its nearest matching charger, and each charger with its nearest spot.
    const walk = WALK / 1000, deg = walk / 111 * 1.6;
    const near = (p, list) => nearest(p, list.filter((s) => Math.abs(s.lat - p.lat) < deg && Math.abs(s.lon - p.lon) < deg * 1.6));
    for (const p of spots) { const n = near(p, drawn); p.charger = n && n[0] <= walk ? n : null; }
    for (const s of drawn) { const n = near(s, spots); s.spot = n && n[0] <= walk ? n : null; }
    const z = map.getZoom();
    for (const p of spots) {
      const m = z >= ICON_ZOOM
        ? L.marker([p.lat, p.lon], { icon: L.divIcon({ className: "", html: `<span class="spot${p.type === "event" ? " spot--event" : ""}">${EMOJI[p.kind]}</span>`, iconSize: [26, 26] }), keyboard: false, zIndexOffset: -100 })
        : L.circleMarker([p.lat, p.lon], { renderer: canvas, radius: 3.5, weight: 1.5, color: "#ffffff", fillColor: p.type === "event" ? "#a3307e" : "#2b8a3e", fillOpacity: 0.95 });
      m.bindPopup(() => spotPopup(p), { maxWidth: 300 });
      m.on("popupopen", (ev) => {
        const btn = ev.popup.getElement().querySelector("[data-show-charger]");
        if (btn && p.charger) btn.addEventListener("click", () => showCharger(p.charger[1]));
      });
      p.marker = m;
      spotLayer.addLayer(m);
    }
  }
  function listKids() {
    const ol = $("kidslist"), desc = $("kidsdesc"), btn = $("kidsgo");
    btn.hidden = state.kids;
    $("legend-kids").hidden = !state.kids;
    if (!state.kids) { ol.innerHTML = ""; desc.textContent = T.kidsOff; return; }
    if (map.getZoom() < DETAIL_ZOOM) { ol.innerHTML = ""; desc.textContent = T.kidsZoom; return; }
    if (spotsFailed) { ol.innerHTML = ""; desc.textContent = T.kidsFail; return; }
    const c = map.getCenter(), here = { lat: c.lat, lon: c.lng };
    const withCharger = spots.filter((p) => p.charger);
    // Events first among equals: they only happen now, places are always there.
    const best = withCharger.map((p) => [km(here, p) * (p.type === "event" ? 0.8 : 1), p]).sort((a, b) => a[0] - b[0]).slice(0, KIDS_LIST).map((x) => x[1]);
    if (!best.length) { ol.innerHTML = ""; desc.textContent = T.kidsNone(WALK); return; }
    desc.textContent = T.kidsDesc(withCharger.length, WALK);
    ol.innerHTML = best.map((p, i) => `<li><span class="e" aria-hidden="true">${EMOJI[p.kind]}</span>
      <button type="button" class="who" data-i="${i}"><b>${esc(spotName(p))}</b><span>${esc(spotSub(p))}</span></button>
      <span class="k">⚡ ${num(p.charger[1].kw)}<small> kW</small> <small>· ${dist(p.charger[0])}</small></span></li>`).join("");
    ol.querySelectorAll("button.who").forEach((b) => b.addEventListener("click", () => {
      const p = best[+b.dataset.i];
      map.fitBounds(L.latLngBounds([[p.lat, p.lon], [p.charger[1].lat, p.charger[1].lon]]).pad(0.6), { maxZoom: 17 });
      map.once("moveend", () => setTimeout(() => p.marker && p.marker.openPopup(), 400));
      $("map").scrollIntoView({ behavior: "smooth", block: "center" });
    }));
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
      <button type="button" class="who" data-i="${i}"><b>${esc(s.operator)}</b><span>${esc(s.address)}</span>${state.kids && s.spot ? `<span class="kidsline">${EMOJI[s.spot[1].kind]} ${esc(spotName(s.spot[1]))} · ${dist(s.spot[0])}</span>` : ""}</button>
      <span class="k">${num(s.kw)}<small> kW</small> <small>· ${s.points}×</small></span></li>`).join("");
    ol.querySelectorAll("button.who").forEach((btn) => btn.addEventListener("click", () => {
      const s = best[+btn.dataset.i][1];
      map.setView([s.lat, s.lon], Math.max(map.getZoom(), 15));
      setTimeout(() => s.marker && s.marker.openPopup(), 350);
      $("map").scrollIntoView({ behavior: "smooth", block: "center" });
    }));
  }

  function redraw() {
    const detail = map.getZoom() >= DETAIL_ZOOM;
    if (detail) { overviewLayer.clearLayers(); drawStations(); }
    else { token++; stationLayer.clearLayers(); spotLayer.clearLayers(); drawn = []; spots = []; drawOverview(); $("maphint").textContent = T.zoomIn; listNear(); listKids(); }
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
    if (state.kids) p.set("kids", "1");
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
    const prompt = T.ask(ORIGIN + location.pathname + "?" + p.toString(), ORIGIN + data(`cells/${cellId(c.lat, c.lng)}.json`), filt ? ` (${filt})` : "")
      + (state.kids ? T.askKids(ORIGIN + outData(`cells/${cellId(c.lat, c.lng)}.json`)) : "");
    $("aigo").href = "https://claude.ai/new?q=" + encodeURIComponent(prompt);
  }

  /* ---------- filters ---------- */
  function paintFilters() {
    document.querySelectorAll("#kw button").forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.kw === state.kw)));
    document.querySelectorAll("#plug button").forEach((b) => b.setAttribute("aria-pressed", String(state.plug.includes(b.dataset.plug))));
    document.querySelectorAll("#only button").forEach((b) => b.setAttribute("aria-pressed", String(state.only.includes(b.dataset.only))));
    document.querySelectorAll("[data-kids]").forEach((b) => b.setAttribute("aria-pressed", String(state.kids)));
  }
  const toggle = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : arr.concat(v));
  $("kw").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; state.kw = +b.dataset.kw; paintFilters(); redraw(); });
  $("plug").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; state.plug = toggle(state.plug, b.dataset.plug); paintFilters(); redraw(); });
  $("only").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; state.only = toggle(state.only, b.dataset.only); paintFilters(); redraw(); });
  const setKids = (on) => { state.kids = on; paintFilters(); listKids(); redraw(); };
  document.querySelectorAll("[data-kids]").forEach((b) => b.addEventListener("click", () => setKids(!state.kids)));
  $("kidsgo").addEventListener("click", () => setKids(true));
  paintFilters();
  listKids();

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
