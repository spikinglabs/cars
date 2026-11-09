// Chart-ready series for the hosted MCP server (functions/mcp.js).
// After a tool runs, chartsFor() adds `charts` to its result: tidy series an AI assistant can draw as a line or
// bar chart straight away, without reshaping the numbers. Every chart has the same shape:
//
//   { kind: "line" | "bar" | "grouped_bar" | "stacked_bar", title,
//     x: { label, type: "date" | "month" | "year" | "hour" | "category" },
//     y: { label, unit },
//     series: [{ name, points: [[x, y], ...] }],   // y is a number or null (no data), never a string
//     note? }
//
// The numbers are the ones already in the result (or in the same open data file), only rearranged.
// Kept apart from mcp-tools.js so the tools stay as they are and each chart can be tested on its own.

const MAX_POINTS = 400;
const FUEL_NAMES = { euro_super_95: "Super E5 (95)", diesel: "Diesel", lpg: "LPG (autogas)" };
const POWER_NAMES = { ac: "AC", dc: "DC under 150 kW", hpc: "High-power 150 kW+" };

const num = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const r2 = (v) => (v == null ? null : Math.round(v * 100) / 100);
const r4 = (v) => (v == null ? null : Math.round(v * 10000) / 10000);
// KBA writes names in capitals ("VW GOLF", "MERCEDES GLK, GLC"): long words get a capital first letter, short ones
// (VW, BMW, X1, GLC) stay as they are.
const title = (s) => String(s || "").replace(/[A-Za-z]{4,}/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());

// Every n-th point when a series is very long, always keeping the last one.
function thin(points) {
  if (points.length <= MAX_POINTS) return points;
  const step = Math.ceil(points.length / MAX_POINTS);
  const out = points.filter((_, i) => i % step === 0);
  if (out[out.length - 1] !== points[points.length - 1]) out.push(points[points.length - 1]);
  return out;
}
const line = (t, x, y, series, note) => ({
  kind: "line", title: t, x, y,
  // a line that is all zero or empty (a petrol model's electric count) is left out
  series: series.filter((s) => s.points.some((p) => p[1])).map((s) => ({ ...s, points: thin(s.points) })),
  ...(note ? { note } : {}),
});
const bars = (kind, t, x, y, series, note) => ({
  kind, title: t, x, y, series: series.filter((s) => s.points.some((p) => p[1] != null)), ...(note ? { note } : {}),
});
const csvRows = (text) => {
  const lines = String(text || "").trim().split(/\r?\n/);
  const head = lines[0].split(",");
  return lines.slice(1).map((l) => Object.fromEntries(l.split(",").map((v, i) => [head[i], v])));
};
const soft = (get, path) => get(path).catch(() => null);

const CHARTS = {
  get_fuel_prices(out) {
    const h = out.history || [];
    if (h.length < 2) return [];
    const fuels = Object.keys(FUEL_NAMES).filter((k) => h.some((r) => k in r));
    return [line(`Weekly pump prices, ${out.region || ""}`.trim(), { label: "Week", type: "date" },
      { label: "Price per litre", unit: `${out.currency || "EUR"}/L` },
      fuels.map((k) => ({ name: FUEL_NAMES[k], points: h.map((r) => [r.week, num(r[k])]) })),
      "National weekly average incl. all taxes (EU Weekly Oil Bulletin); each week is dated its Monday.")];
  },

  async get_charging_prices(out, args, get) {
    const charts = [];
    const bp = out.by_power || {};
    const kinds = Object.keys(POWER_NAMES).filter((k) => bp[k]);
    if (kinds.length) {
      charts.push(bars("grouped_bar", "Public charging price per kWh by charger type", { label: "Charger type", type: "category" },
        { label: "Price per kWh incl. VAT", unit: "EUR/kWh" },
        [["10th percentile", "p10"], ["Median", "median"], ["90th percentile", "p90"]].map(([name, f]) => ({
          name, points: kinds.map((k) => [POWER_NAMES[k], num(bp[k][f])]) })),
        "Ad-hoc prices without a contract, over the published tariffs of every charge point."));
    }
    const ops = (out.operators || []).filter((o) => ["ac", "dc", "hpc"].some((k) => o[k] && o[k].median != null));
    if (ops.length) {
      charts.push(bars("grouped_bar", "Median ad-hoc charging price by operator", { label: "Operator", type: "category" },
        { label: "Median price per kWh incl. VAT", unit: "EUR/kWh" },
        Object.keys(POWER_NAMES).map((k) => ({ name: POWER_NAMES[k], points: ops.map((o) => [o.operator, num(o[k] && o[k].median)]) }))));
    }
    const daily = await soft(get, "charging-prices/de/daily.csv");
    if (daily) {
      const rows = csvRows(daily).filter((r) => r.source === "ALL").slice(-90);
      if (rows.length >= 2) {
        charts.push(line("Public charging price per kWh, daily", { label: "Day", type: "date" },
          { label: "Price per kWh incl. VAT", unit: "EUR/kWh" },
          [["10th percentile", "p10"], ["Median", "median"], ["90th percentile", "p90"]].map(([name, f]) => ({
            name, points: rows.map((r) => [r.date, num(r[f])]) })),
          "Last 90 days, all charger types; the full history is in the history link."));
      }
    }
    return charts;
  },

  async get_cheapest_charging_time(out, args, get) {
    const d = await soft(get, "electricity-prices/de/latest.json");
    if (!d || !d.days) return [];
    const m = d.tariff_model || {};
    const add = num(m.addon_eur_kwh_net) ?? 0.18, vat = num(m.vat) ?? 0.19;
    const series = d.days.map((day) => {
      const byHour = new Map();
      for (const s of day.slots || []) {
        const hour = String(s.start || "").slice(11, 13);
        if (!hour || s.eur_mwh == null) continue;
        if (!byHour.has(hour)) byHour.set(hour, []);
        byHour.get(hour).push(Number(s.eur_mwh));
      }
      const points = [...byHour.entries()].sort((a, b) => a[0].localeCompare(b[0]))
        .map(([h, v]) => [`${h}:00`, r4((v.reduce((a, b) => a + b, 0) / v.length / 1000 + add) * (1 + vat))]);
      return { name: day.date, points };
    }).filter((s) => s.points.length);
    if (!series.length) return [];
    return [line("Estimated dynamic tariff by hour", { label: `Hour (${d.timezone || "Europe/Berlin"})`, type: "hour" },
      { label: "Price per kWh incl. VAT (estimate)", unit: "EUR/kWh" }, series,
      "Hourly average of the day-ahead exchange price plus typical grid fees, levies and VAT; one line per day.")];
  },

  async get_registrations(out, args, get) {
    const unit = "new cars per month";
    if (Array.isArray(out.models)) {
      return out.models.length ? [line("New registrations per month in Germany", { label: "Month", type: "month" },
        { label: "New registrations", unit },
        out.models.map((m) => ({ name: title(m.model), points: (m.months || []).map((r) => [r.month, num(r.total)]) })),
        "Every drive type together, per model.")] : [];
    }
    if (out.months) {
      const rows = out.months;
      const name = title(out.model);
      return [line(`${name}: new registrations per month in Germany`, { label: "Month", type: "month" },
        { label: "New registrations", unit },
        [["All", "total"], ["Electric", "bev"], ["Plug-in hybrid", "phev"], ["Diesel", "diesel"]]
          .map(([n, f]) => ({ name: n, points: rows.map((r) => [r.month, num(r[f])]) })),
        "Plug-in hybrids are counted separately only since 2021.")];
    }
    const charts = [];
    const mk = out.market;
    if (mk && mk.total) {
      const hybrid = mk.hybrid != null ? mk.hybrid - (mk.phev || 0) : null;
      charts.push(bars("bar", `New cars by drive type, ${out.month}`, { label: "Drive type", type: "category" },
        { label: "New registrations", unit: "new cars in the month" },
        [{ name: "New cars", points: [["Electric", num(mk.bev)], ["Plug-in hybrid", num(mk.phev)], ["Hybrid (not plug-in)", num(hybrid)],
          ["Petrol and other", num(mk.petrol_etc)], ["Diesel", num(mk.diesel)]] }]));
    }
    const top = out.top_models || [];
    if (top.length) {
      charts.push(bars("stacked_bar", `Top models, ${out.month}`, { label: "Model", type: "category" },
        { label: "New registrations", unit: "new cars in the month" },
        [["Electric", (r) => r.bev], ["Plug-in hybrid", (r) => r.phev], ["Other drives", (r) => (r.total || 0) - (r.bev || 0) - (r.phev || 0)]]
          .map(([n, f]) => ({ name: n, points: top.map((r) => [title(`${r.brand} ${r.model}`), num(f(r))]) }))));
    }
    const csv = await soft(get, "registrations/de/market.csv");
    if (csv) {
      const rows = csvRows(csv).slice(-36);
      if (rows.length >= 2) {
        charts.push(line("Electric share of new cars in Germany", { label: "Month", type: "month" },
          { label: "Battery electric share", unit: "%" },
          [{ name: "Electric (BEV) share", points: rows.map((r) => [r.month, num(r.bev_share)]) }], "Last 36 months."));
      }
    }
    return charts;
  },

  compare_cars(out) {
    const cars = out.cars || [];
    if (cars.length < 2) return [];
    const x = { label: "Car", type: "category" };
    const pts = (f) => cars.map((c) => [c.name + (cars.filter((o) => o.name === c.name).length > 1 ? ` (${c.fuel})` : ""), num(f(c))]);
    return [
      bars("grouped_bar", "Energy cost per 100 km", x, { label: "Cost per 100 km", unit: "EUR" },
        [{ name: "Home charging or pump", points: pts((c) => c.cost_per_100km_eur) },
          { name: "Public charging", points: pts((c) => c.cost_per_100km_public_charging_eur) }],
        "Official WLTP consumption at this week's German prices; real-world use is higher."),
      bars("bar", `Energy cost per year at ${out.km_per_year} km`, x, { label: "Cost per year", unit: "EUR" },
        [{ name: "Cost per year", points: pts((c) => c.cost_per_year_eur) }]),
      bars("bar", "New registrations in Germany, last 12 months", x, { label: "New registrations", unit: "cars" },
        [{ name: "Last 12 months", points: pts((c) => c.registrations_last_12_months) }]),
    ].filter((c) => c.series.length);
  },

  get_rankings(out) {
    const rows = out.rows || [];
    const pick = {
      sellers: ["registrations_last_12_months", "New registrations, last 12 months", "cars"],
      month: ["registrations", `New registrations, ${out.month || "latest month"}`, "cars"],
      electric: ["electric_registrations", `Electric registrations, ${out.month || "latest month"}`, "cars"],
      efficient: ["kwh_per_100km", "Official consumption", "kWh/100 km"],
      cheapest: ["cost_per_100km_eur", "Energy cost per 100 km", "EUR"],
      recalls: ["per_100k_new_cars_de", "Car recalls per 100,000 new cars", "recalls per 100,000 cars"],
    }[out.list];
    if (!pick || !rows.length) return [];
    const label = (r) => (r.kba_model ? title(r.kba_model) : r.name || r.brand);
    return [bars("bar", pick[1], { label: "Rank order", type: "category" }, { label: pick[1], unit: pick[2] },
      [{ name: pick[1], points: rows.map((r) => [label(r), num(r[pick[0]])]) }], "Keep the rank order; draw horizontal bars for long names.")];
  },

  compare_cost_over_years(out) {
    const ys = out.years || [];
    if (!ys.length) return [];
    return [line("Total cost over the years: electric vs fuel car", { label: "Year of ownership", type: "year" },
      { label: "Total spent so far", unit: "EUR" },
      [{ name: "Electric car", points: ys.map((y) => [y.year, num(y.electric_total_eur)]) },
        { name: "Fuel car", points: ys.map((y) => [y.year, num(y.fuel_total_eur)]) }],
      out.payback_years != null ? `The lines cross after about ${out.payback_years} years (payback).` : "Purchase price after the grant, energy and vehicle tax.")];
  },

  get_recall_statistics(out) {
    const charts = [];
    const years = out.years || [];
    if (years.length) {
      charts.push(bars("stacked_bar", "Vehicle recalls per year (EU Safety Gate)", { label: "Year", type: "year" },
        { label: "Recall alerts", unit: "alerts" },
        [["Cars", "cars"], ["Vans and trucks", "vans_trucks"], ["Two-wheelers", "two_wheelers"], ["Other", "other"]]
          .map(([n, f]) => ({ name: n, points: years.map((y) => [String(y.year), num(y[f])]) })),
        years.some((y) => y.partial) ? "The latest year is not over yet." : undefined));
    }
    const comps = (out.components || []).filter((c) => c.cars != null).sort((a, b) => b.cars - a.cars);
    if (comps.length) {
      charts.push(bars("bar", `Car recalls by component since ${out.since || 2019}`, { label: "Component", type: "category" },
        { label: "Car recall alerts", unit: "alerts" }, [{ name: "Car alerts", points: comps.map((c) => [c.label_en || c.key, num(c.cars)]) }]));
    }
    const br = (out.brands_per_100k_new_cars || []).slice(0, 20);
    if (br.length) {
      charts.push(bars("bar", "Car recalls per 100,000 new cars in Germany, by brand", { label: "Brand", type: "category" },
        { label: "Recalls per 100,000 new cars", unit: "recalls per 100,000 cars" },
        [{ name: "Per 100,000 new cars", points: br.map((b) => [b.brand, num(b.alerts_per_100k)]) }],
        "Most first. A rough comparison: recalls cover Europe, registrations only Germany."));
    }
    return charts;
  },

  get_car_ratings(out) {
    const a = out.adac_breakdowns;
    const rates = a && a.per_1000_cars_by_first_registration;
    if (!rates || !Object.keys(rates).length) return [];
    return [bars("bar", `ADAC breakdowns per 1,000 cars: ${a.series}`, { label: "Year of first registration", type: "year" },
      { label: "Breakdowns per 1,000 cars", unit: "per 1,000 cars" },
      [{ name: a.series, points: Object.keys(rates).sort().map((y) => [y, num(rates[y])]) }],
      `Breakdowns the ADAC attended in ${a.calendar_year}.`)];
  },
};

// What each tool's description says about its charts.
export const CHART_HINTS = {
  get_fuel_prices: "Its charts field has a weekly line chart per fuel.",
  get_charging_prices: "Its charts field has bar charts by charger type and by operator and a daily line chart of the last 90 days.",
  get_cheapest_charging_time: "Its charts field has a line chart of the estimated tariff by hour for each day.",
  get_registrations: "Its charts field has monthly line charts (one model by drive type, or several models side by side) or, for the market, bar charts by drive type and top models and a line of the electric share.",
  compare_cars: "Its charts field has bar charts of cost per 100 km, cost per year and registrations per car.",
  get_rankings: "Its charts field has a bar chart of the ranked values.",
  compare_cost_over_years: "Its charts field has a line chart of electric vs fuel total cost by year; the crossing is the payback.",
  get_recall_statistics: "Its charts field has bar charts of recalls per year, per component and per brand.",
  get_car_ratings: "Its charts field has a bar chart of ADAC breakdowns by year of first registration, when there is one.",
};

export const CHART_INSTRUCTIONS =
  "Charts: many results carry a `charts` list with ready series (kind line or bar, title, x and y labels with units, " +
  "named series of [x, y] points). When the answer is a trend over time or a comparison of several values, draw the " +
  "chart from those series (line for time series, bars for comparisons) instead of a long list of numbers, keep the " +
  "title and units, and put the page link and source under it. If you cannot draw, offer to. Use only the points given.";

// Adds hints to tool descriptions for tools/list.
export function describeCharts(tool) {
  const hint = CHART_HINTS[tool.name];
  return hint ? { ...tool, description: `${tool.description} ${hint}` } : tool;
}

// The charts for a tool's result, or [] (never throws: charts are extras, the answer stands without them).
export async function chartsFor(name, args, out, get) {
  const make = CHARTS[name];
  if (!make || !out || typeof out !== "object" || out.error) return [];
  try {
    return ((await make(out, args || {}, get)) || []).filter((c) => c && c.series && c.series.length);
  } catch {
    return [];
  }
}
