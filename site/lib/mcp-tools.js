// Read-only tools of the hosted Allo Cars MCP server (cars.allo.land/mcp).
// Each tool reads the same open data files the site publishes under /data/ and answers like the
// matching tool of the local car-mcp server (src/car_mcp/*.py), so both give the same results.
// `get(path)` returns a parsed JSON file (or the text of a CSV) from /data/<path>; see mcp.js.

const SITE = "https://cars.allo.land";
const ASK = [
  "Ask for the VIN (17 characters, on the registration certificate) and have a dealer of the brand check it for open recalls and service campaigns; it is free.",
  "Look for the recall codes in the service book or invoices. Recall work is free, so an honest seller has proof.",
  "Ask whether a recall letter came from the maker or, in Germany, the KBA (it writes to keepers and can take cars off the road when recalls are ignored).",
  "Imported from the US? Check the VIN at https://www.nhtsa.gov/recalls too.",
  "Without proof, make the completed recall work a condition in the sales contract.",
];
const ASK_FIRE = "Fire risk: ask whether interim advice applies until the fix (parking outside, charging limits) and whether the fix is done.";
const ASK_HV = "High-voltage battery: ask whether the battery or modules were replaced or only the software updated, and see the battery health (SoH).";
const ASK_AIRBAG = "Airbags: get the replacement confirmed in writing; some recalls advise not to drive until then.";
const CATALOG_FUELS = ["electric", "petrol", "diesel", "phev-petrol", "phev-diesel", "lpg", "cng", "hydrogen", "e85"];
const FUELS = ["euro_super_95", "diesel", "lpg"];
const PLUGS = { type2: 1, ccs: 2, chademo: 4, schuko: 8, mcs: 16, type1: 32 };
const FLAGS = { open_24_7: 1, free: 2, card_payment: 4, customers_only: 8, plug_and_charge: 16 };

export class ToolError extends Error {}

const clamp = (n, lo, hi, dflt) => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : dflt;
};
const ascii = (s) => String(s || "").normalize("NFKD").replace(/[^\x00-\x7f]/g, "").toLowerCase();
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// recalls.py and registrations.py
const normR = (s) => String(s || "").toLowerCase().replace(/volkswagen/g, "vw").replace(/[^a-z0-9]+/g, "");
const normReg = (s) => String(s || "").toLowerCase().replace(/volkswagen/g, "vw").replace(/mercedes-benz/g, "mercedes").replace(/[^a-z0-9]+/g, "");
// catalog.py
const normC = (s) => ascii(s).replace(/volkswagen/g, "vw").replace(/mercedes/g, "mercedesbenz").replace(/benzbenz/g, "benz").replace(/[^a-z0-9]+/g, "");
const fold = (s) => String(s || "").toLowerCase().replace(/ß/g, "ss").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

async function load(get, path) {
  try {
    return await get(path);
  } catch (e) {
    throw new ToolError(`Could not read ${SITE}/data/${path}: ${e.message}`);
  }
}

// ---------- vehicle catalog ----------

async function lookupOfficialConsumption(get, { query = "", fuel = null, region = "de", limit = 10 } = {}) {
  if (!["de", "eu"].includes(region)) throw new ToolError("region must be one of de, eu");
  if (fuel && !CATALOG_FUELS.includes(fuel)) throw new ToolError(`fuel must be one of ${CATALOG_FUELS.join(", ")}`);
  const data = await load(get, `vehicle-catalog/${region}/models.json`);
  const words = String(query || "").split(/\s+/).map(normC).filter(Boolean);
  const joined = words.join("");
  const hits = [];
  for (const m of data.models || []) {
    if (fuel && m.fuel !== fuel) continue;
    const hay = normC(m.name) + normC(m.make) + normC(m.id);
    if (words.every((w) => hay.includes(w))) {
      const exact = normC(m.name) === joined || normC(m.model) === joined;
      hits.push([exact ? 0 : 1, -(m.registrations || 0), m]);
    }
  }
  hits.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return {
    region: data.region, year: data.year, status: data.status, source: data.source,
    licence: data.licence, notes: data.notes, matches: hits.length,
    models: hits.slice(0, clamp(limit, 1, 50, 10)).map((h) => ({ ...h[2], page: `${SITE}/cars/?car=${encodeURIComponent(h[2].id)}` })),
  };
}

// ---------- recalls ----------

function find(items, text, key) {
  const t = normR(text);
  if (!t) return null;
  const exact = items.filter((i) => normR(i[key]) === t || i.slug === String(text).toLowerCase());
  if (exact.length) return exact[0];
  const inside = items.filter((i) => normR(i[key]) && t.includes(normR(i[key])));
  if (inside.length) return inside.reduce((a, b) => (normR(b[key]).length > normR(a[key]).length ? b : a));
  const contains = items.filter((i) => normR(i[key]).includes(t));
  return contains.length === 1 ? contains[0] : null;
}

async function getRecalls(get, { model, limit = 10 } = {}) {
  if (!model) throw new ToolError("Name a make and model, e.g. 'Volvo EX30', or a brand.");
  const n = clamp(limit, 1, 100, 10);
  const models = (await load(get, "recalls/eu/models.json")).models;
  const m = find(models, model, "model");
  if (m) {
    const eu = (await load(get, `recalls/eu/${m.file}`)).alerts;
    let us = null;
    if (m.us_file) {
      try { us = (await get(`recalls/us/models/${m.slug}.json`)).campaigns; } catch { us = null; }
    }
    return {
      model: m.model, page: `${SITE}/recalls/?model=${m.slug}`, eu_alerts: eu.length, eu: eu.slice(0, n),
      us_campaigns: us === null ? null : us.length, us: (us || []).slice(0, n),
      note: "Whether a particular car is affected depends on its VIN; the maker or dealer can check it.",
    };
  }
  const brands = (await load(get, "recalls/eu/brands.json")).brands;
  const b = find(brands, model, "brand");
  if (b) {
    const eu = (await load(get, `recalls/eu/${b.file}`)).alerts;
    return {
      brand: b.brand, page: `${SITE}/recalls/?brand=${b.slug}`, eu_alerts: eu.length, eu: eu.slice(0, n),
      note: "Brand-wide list, including motorcycles and commercial vehicles. Name the model for US data.",
    };
  }
  return { error: `No followed model or brand matches '${model}'. For any brand, use check_used_car.`, models: models.map((x) => x.model), brands_url: `${SITE}/data/recalls/eu/brands.json` };
}

function parts(alert, brand) {
  const bn = normR(brand);
  let text = [alert.models, alert.type_approval].filter(Boolean).join(", ");
  text = text.replace(/&amp;/g, "&").replace(/\([^)]*\)/g, " ");
  const out = [];
  for (let p of text.split(/\s*(?:[,;/+&]|\band\b)\s*/i)) {
    p = p.trim().replace(new RegExp("^" + esc(brand) + "\\s+", "i"), "");
    if (p && p.length <= 40 && !p.includes("*") && !/^e\d/i.test(p) && normR(p) && normR(p) !== bn) out.push(p);
  }
  return out;
}

function buildWindow(production) {
  const years = (String(production || "").match(/(?:19|20)\d\d/g) || []).map(Number);
  return years.length ? [Math.min(...years), Math.max(...years)] : null;
}

function fitsYear(alert, year) {
  const w = buildWindow(alert.production);
  return w === null ? null : w[0] <= year && year - 1 <= w[1];
}

function brandOf(text, brands) {
  const words = text.split(/\s+/).filter(Boolean);
  for (let n = Math.min(3, words.length); n > 0; n--) {
    const t = normR(words.slice(0, n).join(" "));
    const b = brands.find((x) => normR(x.brand) === t || normR(x.slug) === t);
    if (b) return [b, words.slice(n).join(" ")];
  }
  return [find(brands, text, "brand"), ""];
}

async function checkUsedCar(get, { make, model = null, year = null, limit = 20 } = {}) {
  if (!make) throw new ToolError("Name the brand, e.g. 'Volkswagen', or brand and model.");
  year = year ? Math.trunc(Number(year)) || null : null;
  const brands = (await load(get, "recalls/eu/brands.json")).brands;
  const [b, rest] = brandOf(`${make} ${model || ""}`.trim(), brands);
  if (!b) return { error: `No brand matches '${make}'.`, brands_url: `${SITE}/data/recalls/eu/brands.json` };
  model = String(model || rest || "").trim();
  const alerts = (await load(get, `recalls/eu/${b.file}`)).alerts;
  const key = model ? normR(model.replace(new RegExp("^" + esc(b.brand) + "\\s+", "i"), "")) : "";
  const named = alerts.filter((a) => !key || parts(a, b.brand).some((p) => normR(p).startsWith(key)));
  const hits = named.filter((a) => !year || fitsYear(a, year) !== false)
    .map((a) => ({ ...a, build_window_matches: year ? fitsYear(a, year) : null }));
  let us = null;
  if (key) {
    const followed = (await load(get, "recalls/eu/models.json")).models;
    const f = find(followed, `${b.brand} ${model}`, "model");
    if (f && f.us_file && normR(f.model).endsWith(key)) {
      try {
        us = (await get(`recalls/us/models/${f.slug}.json`)).campaigns;
        if (year) us = us.filter((c) => (c.model_years || []).some((y) => Math.abs(Number(y) - year) <= 1));
      } catch { us = null; }
    }
  }
  const ask = [...ASK];
  if (hits.some((a) => String(a.risk || "").toLowerCase().includes("fire"))) ask.splice(3, 0, ASK_FIRE);
  if (hits.some((a) => a.component === "hv_battery")) ask.splice(3, 0, ASK_HV);
  if (hits.some((a) => a.component === "airbags_belts")) ask.splice(3, 0, ASK_AIRBAG);
  const q = [`brand=${b.slug}`, ...(key ? [`model=${key}`] : []), ...(year ? [`year=${year}`] : [])];
  return {
    brand: b.brand, model: model || null, first_registered: year,
    page: `${SITE}/recalls/?${q.join("&")}`,
    eu_alerts: hits.length, eu_alerts_other_build_years: named.length - hits.length,
    recall_codes: [...new Set(hits.map((a) => a.recall_code).filter(Boolean))].sort(),
    eu: hits.slice(0, clamp(limit, 1, 100, 20)), us_campaigns: us === null ? null : us.length, us: (us || []).slice(0, clamp(limit, 1, 100, 20)),
    ask_the_seller: ask,
    note: "Build window: a car is usually built in the year of first registration or the year before; alerts without production dates are kept. Whether this car is affected, and whether it was fixed, depends on its VIN.",
  };
}

async function getRecallStatistics(get, { brand = null } = {}) {
  const s = await load(get, "recalls/eu/stats.json");
  const out = {};
  for (const k of ["since", "notes", "years", "registrations_until", "notified_by"]) out[k] = s[k] ?? null;
  out.components = s.components.map((c) => ({ key: c.key, label_en: c.label_en, cars: c.cars, all: c.all, cars_last_365_days: c.cars_last_365_days }));
  const ranked = s.brands.filter((b) => b.alerts_per_100k != null).sort((a, b) => b.alerts_per_100k - a.alerts_per_100k);
  out.brands_per_100k_new_cars = ranked;
  out.brands_by_count = s.brands.slice(0, 25);
  if (brand) {
    const b = find(s.brands, brand, "brand");
    const i = b ? ranked.indexOf(b) : -1;
    out.brand = b && { ...b, rank_per_100k: i >= 0 ? i + 1 : null, ranked_brands: ranked.length };
  }
  out.page = `${SITE}/recalls/#stats`;
  return out;
}

// ---------- fuel, charging and electricity prices ----------

async function getFuelPrices(get, { region = "de", fuel = null, weeks = 12 } = {}) {
  region = String(region || "de").trim().toLowerCase();
  if (!/^[a-z]{2}$/.test(region)) throw new ToolError("region must be a two-letter code such as de, at, fr or eu");
  if (fuel && !FUELS.includes(fuel)) throw new ToolError(`fuel must be one of ${FUELS.join(", ")}`);
  let latest, csv;
  try {
    latest = await get(`fuel-prices/${region}/latest.json`);
    csv = await get(`fuel-prices/${region}/weekly.csv`);
  } catch (e) {
    throw new ToolError(`No fuel prices for region '${region}': ${e.message}`);
  }
  const keep = fuel ? [fuel] : FUELS;
  const products = Object.fromEntries(Object.entries(latest.products || {}).filter(([k]) => keep.includes(k)));
  const lines = String(csv).trim().split(/\r?\n/);
  const head = lines[0].split(",");
  const rows = lines.slice(1).map((l) => Object.fromEntries(l.split(",").map((v, i) => [head[i], v])));
  const history = rows.slice(-clamp(weeks, 1, 1200, 12)).map((r) => ({
    week: r.date, ...Object.fromEntries(keep.map((k) => [k, r[k] ? Number(r[k]) : null])),
  }));
  const q = [...(fuel && fuel !== "euro_super_95" ? [`fuel=${fuel}`] : []), ...(region !== "de" ? [`country=${region}`] : [])];
  return {
    region: latest.region, currency: latest.currency, unit: latest.unit, week: latest.week, products, history,
    source: latest.source, licence: latest.licence, page: `${SITE}/fuel-prices/${q.length ? "?" + q.join("&") : ""}`,
  };
}

async function getChargingPrices(get) {
  const d = await load(get, "charging-prices/de/latest.json");
  return {
    region: d.region, observed_at: d.observed_at, currency: d.currency, unit: d.unit,
    overall: d.overall, by_source: d.by_source, note: d.note, source: d.source, licence: d.licence,
    history: `${SITE}/data/charging-prices/de/daily.csv`, page: `${SITE}/charging-prices/`,
    cost_tool: `${SITE}/ev-cost/?p=${d.overall && d.overall.median}`,
  };
}

async function getCheapestChargingTime(get, { hours = null } = {}) {
  const d = await load(get, "electricity-prices/de/latest.json");
  const h = hours ? Number(hours) : null;
  return {
    region: d.region, observed_at: d.observed_at, timezone: d.timezone, unit: d.unit,
    tariff_model: d.tariff_model, tomorrow_published: d.tomorrow_published,
    days: (d.days || []).map((day) => ({
      date: day.date, complete: day.complete, mean_eur_mwh: day.mean_eur_mwh, min_eur_mwh: day.min_eur_mwh,
      max_eur_mwh: day.max_eur_mwh, mean_tariff_eur_kwh: day.mean_tariff_eur_kwh,
      cheapest: (day.cheapest || []).filter((c) => !h || c.hours === h),
    })),
    source: d.source, licence: d.licence, page: `${SITE}/charge-times/${h ? `?h=${h}` : ""}`,
    note: "Timing only saves money on a dynamic tariff; on a fixed price every hour costs the same. tariff_eur_kwh is an estimate for a typical German dynamic tariff.",
  };
}

// ---------- registrations ----------

function findReg(models, text) {
  const t = normReg(text);
  if (!t) return null;
  const named = models.filter((m) => m.model !== "SONSTIGE");
  const full = (m) => normReg(`${m.brand} ${m.model}`);
  const exact = named.filter((m) => m.slug === String(text).toLowerCase() || full(m) === t);
  if (exact.length) return exact[0];
  const inside = named.filter((m) => t.includes(full(m)));
  if (inside.length) return inside.reduce((a, b) => (full(b).length > full(a).length ? b : a));
  const loose = named.filter((m) => full(m).includes(t) || normReg(m.model) === t);
  return loose.length ? loose.reduce((a, b) => ((b.last_12_months || 0) > (a.last_12_months || 0) ? b : a)) : null;
}

async function getRegistrations(get, { model = null, months = 12 } = {}) {
  const latest = await load(get, "registrations/de/latest.json");
  const base = { month: latest.month, source: latest.source, licence: latest.licence, credit: latest.credit };
  if (!model) {
    return { ...base, market: latest.market, top_models: latest.top_models, top_electric: latest.top_electric, page: `${SITE}/registrations/` };
  }
  const models = (await load(get, "registrations/de/models.json")).models;
  const m = findReg(models, model);
  if (!m) return { ...base, error: `No model matches '${model}'. Try make and model as on the registration, e.g. 'VW Golf'.`, models_url: `${SITE}/data/registrations/de/models.json` };
  const rows = (await load(get, `registrations/de/${m.file}`)).months;
  const from = `${Number(latest.month.slice(0, 4)) - 1}${latest.month.slice(4)}`;
  const last12 = rows.filter((r) => r.month > from);
  const total12 = last12.reduce((s, r) => s + (r.total || 0), 0);
  const bev12 = last12.reduce((s, r) => s + (r.bev || 0), 0);
  return {
    ...base, model: `${m.brand} ${m.model}`, slug: m.slug, page: `${SITE}/registrations/?model=${m.slug}`,
    rank_latest_month: m.rank ?? null, latest_month_total: m.latest ?? null,
    last_12_months_total: total12, last_12_months_bev_share_pct: total12 ? Math.round((bev12 / total12) * 1000) / 10 : null,
    first_month: rows.length ? rows[0].month : null, months: rows.slice(-clamp(months, 1, 100, 12)),
    market_latest_month: latest.market.total,
    note: "Counts are new passenger car registrations in Germany per month. hybrid includes plug-in hybrids (phev).",
  };
}

// ---------- compare cars (the /compare/ page) ----------
// Same rules as site/public/assets/garage.js and compare/app.js, so the tool and the page agree.

const HOME_PRICE = 0.35, LOSS = 1.1;
const FUEL_PRODUCT = { petrol: "euro_super_95", diesel: "diesel", lpg: "lpg", "phev-petrol": "euro_super_95", "phev-diesel": "diesel" };
const normG = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");
const BRAND_G = { volkswagen: "vw", mercedesbenz: "mercedes", mercedesamg: "mercedes" };
const brandKeyG = (b) => { b = normG(b); return BRAND_G[b] || b; };
function modelKeyG(make, model) {
  const b = brandKeyG(make);
  let m = normG(model);
  for (const p of [normG(make), b]) if (p && m.startsWith(p) && m.length > p.length) m = m.slice(p.length);
  m = m.replace(/^(\d)series$/, "$1er").replace(/^(\w+)class$/, "$1klasse");
  return `${b}|${m}`;
}
const recallBrandG = (make) => { const b = normG(make); return b === "vw" ? "volkswagen" : b === "mercedes" ? "mercedes-benz" : String(make || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); };
function recallModelG(make, model) {
  let m = normG(model);
  for (const p of [normG(make), brandKeyG(make)]) if (p && m.startsWith(p) && m.length > p.length) m = m.slice(p.length);
  return m;
}
function recallNamesG(a, make, model) {
  const key = recallModelG(make, model), bn = normG(make), alt = modelKeyG(make, model).split("|")[1];
  if (!key) return false;
  const brand = a.brand || make;
  return [a.models, a.type_approval].join(", ").replace(/&amp;/g, "&").replace(/\([^)]*\)/g, " ").split(/\s*(?:[,;/+&]|\band\b)\s*/i)
    .map((p) => p.trim().replace(new RegExp("^" + esc(brand) + "\\s+", "i"), ""))
    .filter((p) => p && p.length <= 40 && !/[*]|^e\d|^(?:null|undefined)$/i.test(p))
    .some((p) => {
      let n = normG(p); if (bn && n.startsWith(bn) && n.length > bn.length) n = n.slice(bn.length);
      return n === key || n === alt || (n.startsWith(key) && !/^\d/.test(n.slice(key.length)));
    });
}
function resolveCar(models, text) {
  const t = String(text || "").trim();
  const byId = models.find((m) => m.id === t.toLowerCase());
  if (byId) return byId;
  const words = t.split(/\s+/).map(normC).filter(Boolean);
  if (!words.length) return null;
  const joined = words.join("");
  const hits = models.filter((m) => { const hay = normC(m.name) + normC(m.make) + normC(m.id) + normC(m.fuel); return words.every((w) => hay.includes(w)); });
  hits.sort((a, b) => ((normC(a.name) === joined ? 0 : 1) - (normC(b.name) === joined ? 0 : 1)) || (b.registrations || 0) - (a.registrations || 0));
  return hits[0] || null;
}

async function compareCars(get, { cars = [], km_per_year = 15000 } = {}) {
  if (typeof cars === "string") cars = cars.split(",");
  if (!Array.isArray(cars) || cars.length < 1) throw new ToolError("Name 2 to 4 cars, e.g. ['Volvo EX30', 'Tesla Model Y'] or catalog ids.");
  const km = Math.round(clamp(km_per_year, 1000, 100000, 15000));
  const cat = await load(get, "vehicle-catalog/de/models.json");
  const picked = [], unknown = [];
  for (const c of cars.slice(0, 4)) {
    const m = resolveCar(cat.models || [], c);
    if (m && !picked.includes(m)) picked.push(m); else if (!m) unknown.push(String(c));
  }
  if (!picked.length) return { error: `No car model matches ${unknown.map((u) => `'${u}'`).join(", ")}. Use lookup_official_consumption to find catalog ids.` };
  const soft = (p) => get(p).catch(() => null);
  const [fuel, charge, regs, brands] = await Promise.all([
    soft("fuel-prices/de/latest.json"), soft("charging-prices/de/latest.json"),
    soft("registrations/de/models.json"), soft("recalls/eu/brands.json"),
  ]);
  const pub = charge && charge.overall ? charge.overall.median : null;
  const brandFiles = new Map();
  const out = [];
  for (const m of picked) {
    const fp = fuel && FUEL_PRODUCT[m.fuel] ? (fuel.products || {})[FUEL_PRODUCT[m.fuel]] : null;
    let per100 = null, per100Public = null;
    if (m.fuel === "electric" && m.kwh_per_100km) { per100 = m.kwh_per_100km * LOSS * HOME_PRICE; per100Public = pub ? m.kwh_per_100km * LOSS * pub : null; }
    else if (/^phev/.test(m.fuel) && fp) per100 = (m.kwh_per_100km || 0) * LOSS * HOME_PRICE + (m.l_per_100km || 0) * fp.eur_per_litre;
    else if (m.l_per_100km && fp) per100 = m.l_per_100km * fp.eur_per_litre;
    const key = modelKeyG(m.make, m.model);
    const r = regs ? (regs.models || []).find((x) => x.model !== "SONSTIGE" && modelKeyG(x.brand, x.model) === key) : null;
    let recalls = null;
    const b = brands ? (brands.brands || []).find((x) => x.slug === recallBrandG(m.make)) : null;
    if (b) {
      if (!brandFiles.has(b.file)) brandFiles.set(b.file, soft(`recalls/eu/${b.file}`));
      const d = await brandFiles.get(b.file);
      recalls = d ? (d.alerts || []).filter((a) => recallNamesG(a, m.make, m.model)).length : null;
    } else if (brands) recalls = 0;
    const r2 = (v) => (v == null ? null : Math.round(v * 100) / 100);
    out.push({
      id: m.id, name: m.name, fuel: m.fuel, years_sold_new: m.years || null,
      kwh_per_100km: m.kwh_per_100km ?? null, l_per_100km: m.l_per_100km ?? null, co2_g_km: m.co2_g_km ?? null,
      power_kw: m.power_kw ?? null, mass_kg: m.mass_kg ?? null,
      cost_per_100km_eur: r2(per100), cost_per_100km_public_charging_eur: r2(per100Public),
      cost_per_year_eur: per100 == null ? null : Math.round(per100 * km / 100),
      registrations_last_12_months: r ? r.last_12_months ?? null : null, registrations_rank_latest_month: r ? r.rank ?? null : null,
      safety_gate_recalls: recalls,
      page: `${SITE}/cars/?car=${encodeURIComponent(m.id)}`,
    });
  }
  return {
    km_per_year: km, cars: out, not_found: unknown,
    page: `${SITE}/compare/?cars=${picked.map((m) => encodeURIComponent(m.id)).join(",")}${km !== 15000 ? `&km=${km}` : ""}`,
    basis: {
      home_charging_eur_per_kwh: HOME_PRICE, charging_losses: "10% added to the official figure", public_charging_median_eur_per_kwh: pub,
      fuel_week: fuel ? fuel.week : null, fuel_eur_per_litre: fuel ? Object.fromEntries(Object.entries(fuel.products || {}).map(([k, v]) => [k, v.eur_per_litre])) : null,
    },
    notes: "Official WLTP figures from the EEA catalog (registration-weighted over the versions sold); real-world use is higher. Plug-in hybrid cost uses the official electric/fuel mix with home charging. Registrations count the KBA model with every drive type together. Recalls count EU Safety Gate alerts since 2019 that name the model; whether a car is affected depends on its VIN.",
  };
}

// ---------- rankings (the /rankings/ page) ----------

const RANKINGS = ["sellers", "month", "electric", "efficient", "cheapest", "recalls"];
function catalogForG(models, brand, model, fuel) {
  const key = modelKeyG(brand, model);
  let best = null;
  for (const m of models) {
    if (modelKeyG(m.make, m.model) !== key) continue;
    const score = (fuel && m.fuel === fuel ? 1e9 : 0) + (m.registrations || 0);
    if (!best || score > best.s) best = { m, s: score };
  }
  return best && (!fuel || best.m.fuel === fuel) ? best.m : null;
}
function cost100G(m, fuel, charge) {
  const fp = fuel && FUEL_PRODUCT[m.fuel] ? (fuel.products || {})[FUEL_PRODUCT[m.fuel]] : null;
  if (m.fuel === "electric" && m.kwh_per_100km) return m.kwh_per_100km * LOSS * HOME_PRICE;
  if (/^phev/.test(m.fuel) && fp) return (m.kwh_per_100km || 0) * LOSS * HOME_PRICE + (m.l_per_100km || 0) * fp.eur_per_litre;
  if (m.l_per_100km && fp) return m.l_per_100km * fp.eur_per_litre;
  return null;
}

async function getRankings(get, { list = "sellers", fuel = null, limit = 20 } = {}) {
  if (!RANKINGS.includes(list)) throw new ToolError(`list must be one of ${RANKINGS.join(", ")}`);
  if (fuel && !CATALOG_FUELS.includes(fuel)) throw new ToolError(`fuel must be one of ${CATALOG_FUELS.join(", ")}`);
  const n = clamp(limit, 1, 100, 20);
  const page = `${SITE}/rankings/?list=${list}${list === "cheapest" && fuel ? `&fuel=${fuel}` : ""}`;
  const cat = await load(get, "vehicle-catalog/de/models.json");
  const models = cat.models || [];
  const year = cat.year || 0;
  const current = models.filter((m) => m.year === year || (m.years && m.years[1] >= year - 1));
  const carPage = (m) => `${SITE}/cars/?car=${encodeURIComponent(m.id)}`;
  const kba = (r, extra, f) => {
    const m = catalogForG(models, r.brand, r.model, f);
    return { kba_model: `${r.brand} ${r.model}`, catalog_id: m ? m.id : null, ...extra, page: m ? carPage(m) : `${SITE}/registrations/?model=${r.slug}` };
  };
  let rows = [], about = {};
  if (list === "sellers" || list === "electric") {
    const regs = await load(get, "registrations/de/models.json");
    const named = (regs.models || []).filter((r) => r.model !== "SONSTIGE");
    rows = list === "sellers"
      ? named.filter((r) => r.last_12_months).sort((a, b) => b.last_12_months - a.last_12_months).map((r) => kba(r, { registrations_last_12_months: r.last_12_months, rank_latest_month: r.rank ?? null }))
      : named.filter((r) => r.latest_bev).sort((a, b) => b.latest_bev - a.latest_bev).map((r) => kba(r, { electric_registrations: r.latest_bev, all_registrations: r.latest ?? null }, "electric"));
    about = { month: regs.latest_month, unit: list === "sellers" ? "new registrations in Germany over the last 12 months, every drive type" : "new electric registrations in Germany in the latest month", source: "Kraftfahrt-Bundesamt (FZ10)" };
  } else if (list === "month") {
    const latest = await load(get, "registrations/de/latest.json");
    rows = (latest.top_models || []).map((r) => kba(r, { registrations: r.total, electric: r.bev, plug_in_hybrid: r.phev, change_vs_last_year_pct: r.change_vs_last_year_pct }));
    about = { month: latest.month, unit: "new registrations in Germany in the month", source: "Kraftfahrt-Bundesamt (FZ10)" };
  } else if (list === "efficient") {
    rows = current.filter((m) => m.fuel === "electric" && m.kwh_per_100km && (m.registrations || 0) >= 500)
      .sort((a, b) => a.kwh_per_100km - b.kwh_per_100km || (b.registrations || 0) - (a.registrations || 0))
      .map((m) => ({ catalog_id: m.id, name: m.name, kwh_per_100km: m.kwh_per_100km, registrations: m.registrations, page: carPage(m) }));
    about = { unit: "official WLTP kWh/100 km at the plug, models with 500+ new registrations in Germany in their year", source: cat.source };
  } else if (list === "cheapest") {
    const soft = (p) => get(p).catch(() => null);
    const [fp, ch] = await Promise.all([soft("fuel-prices/de/latest.json"), soft("charging-prices/de/latest.json")]);
    rows = current.filter((m) => (m.registrations || 0) >= 1000 && (!fuel || m.fuel === fuel))
      .map((m) => [m, cost100G(m, fp, ch)]).filter((x) => x[1] != null).sort((a, b) => a[1] - b[1])
      .map(([m, c]) => ({ catalog_id: m.id, name: m.name, fuel: m.fuel, cost_per_100km_eur: Math.round(c * 100) / 100, page: carPage(m) }));
    about = { unit: "EUR per 100 km at this week's prices: electric charged at home (0.35 EUR/kWh + 10% losses), fuel at the national average, models with 1,000+ new registrations", fuel_week: fp ? fp.week : null };
  } else {
    const st = await load(get, "recalls/eu/stats.json");
    rows = (st.brands || []).filter((b) => b.alerts_per_100k != null).sort((a, b) => a.alerts_per_100k - b.alerts_per_100k)
      .map((b) => ({ brand: b.brand, car_recalls: b.car_alerts, per_100k_new_cars_de: b.alerts_per_100k, page: `${SITE}/recalls/?brand=${b.slug}` }));
    about = { unit: "EU Safety Gate car recalls since 2019 per 100,000 new cars registered in Germany, fewest first; campaigns, not affected cars", since: st.since };
  }
  return { list, ...about, total: rows.length, rows: rows.slice(0, n).map((r, i) => ({ rank: i + 1, ...r })), page,
    notes: "Official data; consumption figures are WLTP and lower than real driving. KBA counts each model with every drive type together." };
}

// ---------- chargers ----------

function km(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180;
  const h = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

function weighted(group, name) {
  const n = group.reduce((s, r) => s + r[4], 0);
  return { name, lat: group.reduce((s, r) => s + r[2] * r[4], 0) / n, lon: group.reduce((s, r) => s + r[3] * r[4], 0) / n };
}

export function locate(text, places) {
  const t = fold(text);
  if (!t) return null;
  const pc = t.match(/\b(\d{5})\b/);
  if (pc) {
    const rows = places.filter((p) => p[1] === pc[1]);
    if (rows.length) return weighted(rows, `${pc[1]} ${rows[0][0]}`);
  }
  const words = t.replace(/\d+/g, " ").trim();
  if (!words) return null;
  for (const match of [(f) => f === words, (f) => f.startsWith(words), (f) => f.includes(words)]) {
    const rows = places.filter((p) => match(fold(p[0])));
    if (rows.length) {
      const best = new Map();
      for (const r of rows) {
        const k = `${r[0]}|${r[1].slice(0, 2)}`;
        if (!best.has(k)) best.set(k, []);
        best.get(k).push(r);
      }
      const sum = (g) => g.reduce((s, r) => s + r[4], 0);
      const group = [...best.values()].reduce((a, b) => (sum(b) > sum(a) ? b : a));
      return weighted(group, group[0][0]);
    }
  }
  return null;
}

function cellsAround(lat, lon, radius) {
  const dlat = radius / 111;
  const dlon = radius / (111 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  const out = [];
  for (let a = Math.floor((lat - dlat) / 0.5); a <= Math.floor((lat + dlat) / 0.5); a++)
    for (let o = Math.floor((lon - dlon) / 0.5); o <= Math.floor((lon + dlon) / 0.5); o++) out.push(`${a}_${o}`);
  return out;
}

async function findChargers(get, { near = null, lat = null, lon = null, radius_km = 10, min_kw = 0, plugs = null, only = null, limit = 10 } = {}) {
  let place = null;
  if (lat == null || lon == null) {
    if (!near) throw new ToolError("Give a town or postcode in Germany (near), or lat and lon.");
    place = locate(near, (await load(get, "chargers/de/places.json")).places);
    if (!place) throw new ToolError(`No town or postcode '${near}' found in the charger register. Try a postcode, or pass lat and lon.`);
    ({ lat, lon } = place);
  }
  lat = Number(lat); lon = Number(lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new ToolError("lat and lon must be numbers.");
  const radius = clamp(radius_km, 0.5, 50, 10);
  const minKw = Number(min_kw) || 0;
  const latest = await load(get, "chargers/de/latest.json");
  const known = new Set(latest.cells || []);
  const cells = await Promise.all(cellsAround(lat, lon, radius).filter((c) => known.has(c)).map((c) => load(get, `chargers/de/cells/${c}.json`)));
  const wantPlug = (plugs || []).reduce((s, p) => s | (PLUGS[p] || 0), 0);
  const found = [];
  for (const c of cells) {
    const f = Object.fromEntries(c.fields.map((k, i) => [k, i]));
    for (const r of c.stations) {
      if (r[f.kw] < minKw || (wantPlug && !(r[f.plugs] & wantPlug))) continue;
      const flags = r[f.flags];
      if ((only || []).some((o) => (o === "no_customers_only" && flags & FLAGS.customers_only) || (o in FLAGS && o !== "customers_only" && !(flags & FLAGS[o])))) continue;
      const d = km(lat, lon, r[f.lat], r[f.lon]);
      if (d > radius) continue;
      found.push({
        distance_km: Math.round(d * 100) / 100, operator: c.operators[r[f.operator]], name: r[f.name] || null,
        address: r[f.address], max_kw: r[f.kw], charge_points: r[f.points], dc_points: r[f.dc_points],
        plugs: Object.keys(PLUGS).filter((k) => r[f.plugs] & PLUGS[k]),
        ...Object.fromEntries(Object.entries(FLAGS).map(([k, v]) => [k, Boolean(flags & v)])),
        since: r[f.since], lat: r[f.lat], lon: r[f.lon],
        directions: `https://www.google.com/maps/dir/?api=1&destination=${r[f.lat]},${r[f.lon]}`,
      });
    }
  }
  found.sort((a, b) => a.distance_km - b.distance_km);
  const q = new URLSearchParams({ lat: lat.toFixed(4), lon: lon.toFixed(4), z: radius <= 5 ? 13 : radius <= 12 ? 12 : 11 });
  if (minKw) q.set("kw", minKw >= 150 ? 150 : minKw >= 50 ? 50 : minKw >= 11 ? 11 : 0);
  const mapPlugs = (plugs || []).filter((p) => ["type2", "ccs", "chademo"].includes(p));
  if (mapPlugs.length) q.set("plug", mapPlugs.join(","));
  return {
    centre: { name: place ? place.name : null, lat: Math.round(lat * 1e5) / 1e5, lon: Math.round(lon * 1e5) / 1e5 },
    radius_km: radius, chargers: found.slice(0, clamp(limit, 1, 50, 10)),
    map: `${SITE}/chargers/?${q}`, register_date: latest.observed_at ?? null,
    source: "Bundesnetzagentur Ladesäulenregister (CC BY 4.0, Bundesnetzagentur.de) via cars.allo.land",
    note: "Distances are straight-line. Only chargers whose operators completed the Bundesnetzagentur notification are listed. No live availability or prices.",
  };
}

// ---------- tool list ----------

const str = (description, extra = {}) => ({ type: "string", description, ...extra });
const num = (description, extra = {}) => ({ type: "number", description, ...extra });
const int = (description, extra = {}) => ({ type: "integer", description, ...extra });
const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

export const TOOLS = [
  {
    name: "lookup_official_consumption",
    title: "Official consumption of a car model",
    description: "Official WLTP consumption of a car model from the EEA CO2 monitoring of new cars: kWh/100 km at the plug (charging losses included), L/100 km, CO2 g/km, power and mass, averaged over the versions registered in the latest year, with the number registered and a link to the model's Allo Cars page. Official figures are lower than real-world use.",
    inputSchema: { type: "object", properties: {
      query: str("Make and/or model, e.g. 'Volvo EX30', 'ID.3', 'Golf'. Empty lists the most registered models."),
      fuel: str("Only this fuel type.", { enum: CATALOG_FUELS }),
      region: str("de (new registrations in Germany) or eu (EU-27).", { enum: ["de", "eu"], default: "de" }),
      limit: int("Most models to return (1-50).", { default: 10 }),
    } },
    run: lookupOfficialConsumption,
  },
  {
    name: "get_recalls",
    title: "Recalls for a car model or brand",
    description: "Official recalls for a car model (or a whole brand): EU Safety Gate alerts since 2019, which include every German KBA recall, and US NHTSA campaigns. Refreshed daily. For a used car of a given year, check_used_car narrows to its build window.",
    inputSchema: { type: "object", properties: {
      model: str("Make and model, e.g. 'Volvo EX30', or a brand, e.g. 'Volkswagen'."),
      limit: int("Most alerts to return per source.", { default: 10 }),
    }, required: ["model"] },
    run: getRecalls,
  },
  {
    name: "check_used_car",
    title: "Recall check for a used car",
    description: "Check a used car before buying: EU Safety Gate recalls (every KBA recall included) for the brand and model whose production dates cover a car first registered in `year`, the recall codes to ask the seller about, US NHTSA campaigns where available, and what to ask the seller or a garage. Refreshed daily.",
    inputSchema: { type: "object", properties: {
      make: str("Brand, e.g. 'Volkswagen', or brand and model, e.g. 'VW Golf'."),
      model: str("Model as written by the maker, e.g. 'Golf', 'ID.4', 'X5'."),
      year: int("Year the car was first registered (Erstzulassung)."),
      limit: int("Most alerts to return.", { default: 20 }),
    }, required: ["make"] },
    run: checkUsedCar,
  },
  {
    name: "get_recall_statistics",
    title: "Recall statistics",
    description: "Vehicle recall statistics since 2019 (EU Safety Gate): alerts per year and vehicle type, car alerts per component (brakes, airbags, high-voltage battery, ...), and per brand, also per 100,000 new cars registered in Germany. Alerts are campaigns, not affected vehicles.",
    inputSchema: { type: "object", properties: { brand: str("Optional brand to place in the ranking, e.g. 'Volvo'.") } },
    run: getRecallStatistics,
  },
  {
    name: "get_fuel_prices",
    title: "Fuel prices",
    description: "National average pump prices per litre incl. all taxes (EU Weekly Oil Bulletin): this week's price, the change on last week, 4- and 52-week averages, and recent weekly history. Germany, every EU country and the EU average, weekly since 2005.",
    inputSchema: { type: "object", properties: {
      region: str("Two-letter country code (de, at, fr, ...) or eu for the EU average.", { default: "de" }),
      fuel: str("One fuel; all fuels when omitted.", { enum: FUELS }),
      weeks: int("How many recent weeks of history to return (1-1200).", { default: 12 }),
    } },
    run: getFuelPrices,
  },
  {
    name: "get_charging_prices",
    title: "Public charging prices in Germany",
    description: "Ad-hoc (no contract) public EV charging prices in Germany, collected every hour: median, 10th and 90th percentile, minimum and maximum of the energy price per kWh incl. VAT over all published tariffs, overall and per data source, with links to the daily history and the charging cost calculator.",
    inputSchema: { type: "object", properties: {} },
    run: getChargingPrices,
  },
  {
    name: "get_cheapest_charging_time",
    title: "Cheapest time to charge at home",
    description: "Cheapest 1 to 8 hour windows to charge at home in Germany today (and tomorrow once published, around 13:00), from day-ahead exchange prices (SMARD), with an estimated dynamic tariff price per kWh. Only matters on a dynamic tariff.",
    inputSchema: { type: "object", properties: { hours: int("Only windows of this length: 1, 2, 3, 4, 6 or 8 hours.", { enum: [1, 2, 3, 4, 6, 8] }) } },
    run: getCheapestChargingTime,
  },
  {
    name: "compare_cars",
    title: "Compare car models",
    description: "Compare 2 to 4 car models side by side, as on cars.allo.land/compare/: official WLTP consumption, CO2, power and mass (EEA catalog), cost per 100 km and per year at this week's German fuel price or charging prices, new registrations in Germany in the last 12 months (KBA) and the number of EU Safety Gate recalls that name each model. Returns a link to the same comparison on the site.",
    inputSchema: { type: "object", properties: {
      cars: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 4, description: "Car models by make and model ('Volvo EX30', 'VW Golf diesel') or vehicle catalog id ('volvo-ex30', 'vw-golf-petrol')." },
      km_per_year: int("Kilometres driven per year, for the yearly cost (1,000-100,000).", { default: 15000 }),
    }, required: ["cars"] },
    run: compareCars,
  },
  {
    name: "get_rankings",
    title: "Car rankings for Germany",
    description: "Ranked lists of car models, as on cars.allo.land/rankings/: sellers (most new registrations over 12 months), month (top 20 of the latest month with the change on a year before), electric (electric best sellers of the latest month), efficient (lowest official kWh/100 km), cheapest (lowest cost per 100 km at this week's prices, optionally one fuel) and recalls (brands with the fewest Safety Gate recalls per 100,000 new cars). Rows link to the model page and carry the catalog id for compare_cars.",
    inputSchema: { type: "object", properties: {
      list: str("Which ranking.", { enum: RANKINGS, default: "sellers" }),
      fuel: str("cheapest only: just this fuel.", { enum: CATALOG_FUELS }),
      limit: int("Most rows to return (1-100).", { default: 20 }),
    } },
    run: getRankings,
  },
  {
    name: "get_registrations",
    title: "New car registrations in Germany",
    description: "Monthly new car registrations in Germany (official KBA figures since Dec 2018): one model's monthly counts with electric and plug-in hybrid splits and its rank, or, with no model, the latest month's market by drive type and the top 20 and top 10 electric models.",
    inputSchema: { type: "object", properties: {
      model: str("Make and model, e.g. 'Volvo EX30' or 'VW Golf'. Leave out for this month's top models."),
      months: int("How many recent months to return, 1-100.", { default: 12 }),
    } },
    run: getRegistrations,
  },
  {
    name: "find_chargers",
    title: "Public chargers near a place",
    description: "Public EV chargers near a town, postcode or position in Germany, closest first: operator, address, maximum power, charge points, plugs, payment and a directions link, plus a link to the same view on the Allo Cars map. From the Bundesnetzagentur charge point register. No live availability or prices.",
    inputSchema: { type: "object", properties: {
      near: str("Town or 5-digit postcode in Germany, e.g. 'Köln' or '50667'."),
      lat: num("Latitude, instead of near."),
      lon: num("Longitude, instead of near."),
      radius_km: num("Search radius in km, 0.5 to 50.", { default: 10 }),
      min_kw: num("Minimum power in kW, e.g. 50 for fast or 150 for high-power charging.", { default: 0 }),
      plugs: { type: "array", items: { type: "string", enum: Object.keys(PLUGS) }, description: "Any of these plugs." },
      only: { type: "array", items: { type: "string", enum: ["open_24_7", "card_payment", "free", "plug_and_charge", "no_customers_only"] }, description: "Only locations with all of these." },
      limit: int("Most chargers to return (1-50).", { default: 10 }),
    } },
    run: findChargers,
  },
].map((t) => ({ ...t, annotations: { title: t.title, ...READ } }));
