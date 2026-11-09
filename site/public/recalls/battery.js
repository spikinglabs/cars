/* Used electric cars: the makers' battery warranties and the battery questions to ask before buying.
   Used by /recalls/ (EN, DE, ZH), by the hosted MCP server (check_used_car) and by tests in Node. No DOM, no network.

   Warranties are the standard terms the makers publish for new electric cars sold in Germany (checked 2026-11-09):
   years and km after first registration, whichever comes first, and the capacity (state of health) the battery
   must keep. They pass to the next owner. Terms differ for some models and older years, so the car's own
   warranty documents decide. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.EvBattery = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var AS_OF = "2026-11-09";
  // brand, recall-page slugs, years, km, minimum capacity in %, note key (see NOTES)
  var WARRANTY = [
    ["Audi", ["audi"], 8, 160000, 70],
    ["BMW", ["bmw", "alpina"], 8, 160000, 70],
    ["BYD", ["byd"], 8, 200000, 70],
    ["Citroën", ["citroen", "citroen-et-ds-automobile"], 8, 160000, 70],
    ["Cupra", ["cupra"], 8, 160000, 70],
    ["Dacia", ["dacia"], 8, 120000, 70],
    ["Fiat", ["fiat"], 8, 160000, 70],
    ["Ford", ["ford"], 8, 160000, 70],
    ["Hyundai", ["hyundai"], 8, 160000, 70],
    ["Kia", ["kia"], 7, 150000, 70],
    ["Mazda", ["mazda"], 8, 160000, 70],
    ["Mercedes-Benz", ["mercedes-benz", "a-class"], 8, 160000, 70],
    ["MG", ["mg-motor", "mg3"], 8, 160000, 70],
    ["Mini", ["mini"], 8, 160000, 70],
    ["Nissan", ["nissan"], 8, 160000, 70],
    ["Opel", ["opel"], 8, 160000, 70],
    ["Peugeot", ["peugeot", "peugot", "peugeot-citroen-ds"], 8, 160000, 70],
    ["Polestar", ["polestar"], 8, 160000, 70],
    ["Porsche", ["porsche"], 8, 160000, 70],
    ["Renault", ["renault"], 8, 160000, 70],
    ["Skoda", ["skoda"], 8, 160000, 70],
    ["Smart", ["smart"], 8, 150000, 70],
    ["Tesla", ["tesla"], 8, 160000, 70, "tesla"],
    ["Toyota", ["toyota"], 8, 160000, 70, "toyota"],
    ["Volvo", ["volvo"], 8, 160000, 70],
    ["VW", ["volkswagen", "vw-volkswagen"], 8, 160000, 70]
  ].map(function (r) { return { brand: r[0], slugs: r[1], years: r[2], km: r[3], soh: r[4], note: r[5] || null }; });

  var NOTES = {
    tesla: "Model 3 and Model Y Long Range and Performance: 192,000 km; Model S and X: 240,000 km.",
    toyota: "With a yearly battery check at a Toyota dealer the cover can be extended up to 10 years or 1,000,000 km."
  };

  function forBrand(slug) {
    var s = String(slug || "").toLowerCase();
    for (var i = 0; i < WARRANTY.length; i++) if (WARRANTY[i].slugs.indexOf(s) >= 0 || WARRANTY[i].brand.toLowerCase() === s) return WARRANTY[i];
    return null;
  }

  /* Is a car first registered in `year` (and driven `km`) still under the battery warranty in `now` (a year)?
     -> { covered: true|false|null, until_year, years_left, km_left } ; null when nothing is known. */
  function cover(slug, year, km, now) {
    var w = forBrand(slug);
    if (!w || !year) return { warranty: w, covered: null, until_year: w && year ? year + w.years : null, years_left: null, km_left: null };
    var until = Number(year) + w.years;
    var left = until - Number(now || new Date().getFullYear());
    var kmLeft = km == null || km === "" ? null : w.km - Number(km);
    var covered = left < 0 || (kmLeft != null && kmLeft <= 0) ? false : true;
    return { warranty: w, covered: covered, until_year: until, years_left: Math.max(0, left), km_left: kmLeft == null ? null : Math.max(0, kmLeft) };
  }

  // The battery questions, in order of what they tell you. Keys match the page's word tables.
  var QUESTIONS = ["soh", "test", "warranty", "fast", "range", "charger", "cable"];

  return { AS_OF: AS_OF, WARRANTY: WARRANTY, NOTES: NOTES, QUESTIONS: QUESTIONS, forBrand: forBrand, cover: cover };
});
