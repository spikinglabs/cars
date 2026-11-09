/* German E-Auto grant (E-Auto-Förderung 2026): the rules and the pure calculation behind /ev-grant/.
   Used by the page in the browser, by the hosted MCP server (site/lib/mcp-tools.js) and by tests in Node.
   No DOM, no network. When the rules change, change RULES and the date in RULES.as_of.

   Sources (checked 2026-11-09):
   - BMUKN, questions and answers: https://www.bundesumweltministerium.de/foerderung/fragen-und-antworten-zur-e-auto-foerderung
   - ADAC summary of the rules: https://www.adac.de/rund-ums-fahrzeug/elektromobilitaet/elektroauto/foerderung-elektroautos/
   - Application portal (BAFA): https://www.foerderzentrale.gov.de/ */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.EvGrant = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var RULES = {
    as_of: "2026-11-09",
    // new cars first registered on or after this day, in the applicant's name; purchase or leasing
    registered_from: "2026-01-01",
    // plug-in hybrids and range extenders: only with at most 60 g CO2/km or at least 80 km electric range,
    // and only when first registered by this day
    phev_until: "2027-06-30",
    phev_max_co2: 60,
    phev_min_range_km: 80,
    apply_within_months: 12,
    keep_months: 36,
    // taxable household income, the average of the last two tax assessments (no older than three years)
    income_cap: 80000,
    cap_per_child: 5000,
    max_children: 2,
    // income tiers: up to 45,000, up to 60,000, above (up to the cap)
    tiers: [45000, 60000],
    base: { bev: [5000, 4000, 3000], phev: [3500, 2500, 1500] },
    per_child: 500,
    budget_eur: 3e9,
    budget_cars: 800000,
    budget_until: 2029,
    portal: "https://www.foerderzentrale.gov.de/",
    hotline: "+49 6196 908-1009",
    email: "elektromobilitaet@bafa.bund.de",
    sources: [
      "https://www.bundesumweltministerium.de/foerderung/fragen-und-antworten-zur-e-auto-foerderung",
      "https://www.adac.de/rund-ums-fahrzeug/elektromobilitaet/elektroauto/foerderung-elektroautos/"
    ]
  };

  var DRIVES = ["bev", "phev"];

  function kidsOf(k) {
    var n = Math.floor(Number(k) || 0);
    return Math.max(0, Math.min(RULES.max_children, n));
  }
  function capFor(kids) { return RULES.income_cap + RULES.cap_per_child * kidsOf(kids); }
  function tierOf(income) {
    for (var i = 0; i < RULES.tiers.length; i++) if (income <= RULES.tiers[i]) return i;
    return RULES.tiers.length;
  }
  // The grant for an eligible household, ignoring the car: base for the income tier plus 500 € per child.
  function amountFor(drive, income, kids) {
    if (DRIVES.indexOf(drive) < 0) drive = "bev";
    if (income > capFor(kids)) return 0;
    return RULES.base[drive][tierOf(income)] + RULES.per_child * kidsOf(kids);
  }

  // "2026-03-15" + 12 months -> "2027-03-15" (end of month when the day does not exist)
  function addMonths(iso, months) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
    if (!m) return null;
    var y = +m[1], mo = +m[2] - 1 + months, d = +m[3];
    y += Math.floor(mo / 12); mo = ((mo % 12) + 12) % 12;
    var last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
    var pad = function (n) { return (n < 10 ? "0" : "") + n; };
    return y + "-" + pad(mo + 1) + "-" + pad(Math.min(d, last));
  }

  // Plug-in hybrid check from the car's official figures: true, false, or null when nothing is known.
  function phevOk(co2, rangeKm) {
    var c = co2 == null || co2 === "" ? NaN : Number(co2);
    var r = rangeKm == null || rangeKm === "" ? NaN : Number(rangeKm);
    if (!isNaN(c) && c <= RULES.phev_max_co2) return true;
    if (!isNaN(r) && r >= RULES.phev_min_range_km) return true;
    if (isNaN(c) && isNaN(r)) return null;
    // a CO2 above the limit alone is not a no: the electric range may still reach 80 km
    if (isNaN(r)) return null;
    return false;
  }

  /* compute({ drive: "bev"|"phev", income: €, kids: 0|1|2, co2: g/km, range_km: km, reg: "YYYY-MM-DD" })
     -> { drive, kids, income, cap, tier, amount, max, eligible, reasons[], phev_ok, apply_by, keep_until }
     eligible is null while the income is unknown. reasons lists why it is not (or may not be) granted:
     income_over_cap, registered_too_early, phev_too_late, phev_emissions, phev_unknown. */
  function compute(input) {
    input = input || {};
    var drive = DRIVES.indexOf(input.drive) >= 0 ? input.drive : "bev";
    var kids = kidsOf(input.kids);
    var income = input.income == null || input.income === "" || isNaN(Number(input.income)) ? null : Math.max(0, Number(input.income));
    var cap = capFor(kids);
    var reasons = [];
    var reg = /^\d{4}-\d{2}-\d{2}$/.test(String(input.reg || "")) ? input.reg : null;
    if (reg && reg < RULES.registered_from) reasons.push("registered_too_early");
    var phev = null;
    if (drive === "phev") {
      if (reg && reg > RULES.phev_until) reasons.push("phev_too_late");
      phev = phevOk(input.co2, input.range_km);
      if (phev === false) reasons.push("phev_emissions");
      else if (phev === null) reasons.push("phev_unknown");
    }
    if (income != null && income > cap) reasons.push("income_over_cap");
    var blocking = reasons.filter(function (r) { return r !== "phev_unknown"; });
    var amount = income == null ? null : blocking.length ? 0 : amountFor(drive, income, kids);
    return {
      drive: drive, kids: kids, income: income, cap: cap,
      tier: income == null ? null : tierOf(income),
      amount: amount,
      max: RULES.base[drive][0] + RULES.per_child * kids,
      eligible: income == null ? (blocking.length ? false : null) : blocking.length === 0,
      reasons: reasons,
      phev_ok: phev,
      apply_by: reg ? addMonths(reg, RULES.apply_within_months) : null,
      keep_until: reg ? addMonths(reg, RULES.keep_months) : null
    };
  }

  /* The official table for one drive: rows of { from, to, amounts: [no child, one child, two or more] },
     an amount of 0 meaning not eligible. */
  function table(drive) {
    if (DRIVES.indexOf(drive) < 0) drive = "bev";
    var edges = [0].concat(RULES.tiers, [RULES.income_cap]);
    for (var k = 1; k <= RULES.max_children; k++) edges.push(RULES.income_cap + RULES.cap_per_child * k);
    var rows = [];
    for (var i = 1; i < edges.length; i++) {
      var to = edges[i];
      var amounts = [];
      for (var c = 0; c <= RULES.max_children; c++) amounts.push(amountFor(drive, to, c));
      rows.push({ from: i === 1 ? 0 : edges[i - 1] + 1, to: to, amounts: amounts });
    }
    return rows;
  }

  return { RULES: RULES, DRIVES: DRIVES, compute: compute, table: table, amountFor: amountFor, capFor: capFor, phevOk: phevOk, addMonths: addMonths };
});
