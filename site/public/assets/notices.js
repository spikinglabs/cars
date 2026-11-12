/* The recall bell in the header of every page, like the notices bell on Allo Outings.
 *
 * For the cars kept in "My cars" (assets/garage.js, this device only) it looks up the EU Safety Gate
 * recalls that name the model (/data/recalls/eu/brand/<brand>.json, the same matching rules as the
 * car page), narrowed to the build years that fit the year of first registration when it is known.
 * The bell only shows when at least one recall may affect a saved car; a red dot marks recalls not
 * seen yet. Opening the panel marks them seen (localStorage "allo-cars-notices-seen"). Whether a
 * recall really applies to one car depends on its VIN, so the panel says "may affect".
 *
 * Nothing leaves the device: the data files are the same for everyone. Results are kept for a few
 * hours (localStorage "allo-cars-notices") so pages don't fetch the brand files on every visit.
 * No push notifications, by choice: this is in the page only. English, German and Chinese.
 */
(function () {
  "use strict";
  var root = document.querySelector("[data-notices]");
  if (!root) return;
  var lang = (document.documentElement.lang || "en").slice(0, 2);
  var PRE = lang === "de" ? "/de" : lang === "zh" ? "/zh" : "";
  var T = {
    zh: {
      head: "你的车可能涉及的召回", all: "全部召回",
      may: function (n) { return n + " 次召回可能涉及这辆车"; },
      more: function (n) { return "在车辆页查看全部 " + n + " 次"; },
      open: "在车辆页查看", isNew: "新",
      vin: "召回是否真的涉及你的车，取决于车辆识别号 (VIN)。经销商或厂家可以帮你查。",
      src: "来自欧盟安全门 (Safety Gate)，每天更新。召回说明为英文原文。",
      locale: "zh-CN"
    },
    de: {
      head: "Rückrufe für deine Autos", all: "Alle Rückrufe",
      may: function (n) { return n === 1 ? "1 Rückruf könnte dieses Auto betreffen" : n + " Rückrufe könnten dieses Auto betreffen"; },
      more: function (n) { return "Alle " + n + " auf der Seite deines Autos"; },
      open: "Auf der Seite deines Autos", isNew: "neu",
      vin: "Ob ein Rückruf dein Auto wirklich betrifft, hängt von der Fahrgestellnummer (FIN) ab. Autohaus oder Hersteller können das prüfen.",
      src: "Aus EU Safety Gate, täglich geprüft. Rückruftexte im englischen Original.",
      locale: "de-DE"
    },
    en: {
      head: "Recalls for your cars", all: "All recalls",
      may: function (n) { return n === 1 ? "1 recall may affect this car" : n + " recalls may affect this car"; },
      more: function (n) { return "All " + n + " on your car's page"; },
      open: "On your car's page", isNew: "new",
      vin: "Whether a recall really applies to your car depends on its VIN. Your dealer or the maker can check it.",
      src: "From EU Safety Gate, checked daily. Recall texts in the English original.",
      locale: "en-GB"
    }
  }[lang] || null;
  if (!T) return;

  var SEEN = "allo-cars-notices-seen", CACHE = "allo-cars-notices", TTL = 6 * 3600e3, SHOW = 3;
  var get = function (k, d) { try { var v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? d : v; } catch (e) { return d; } };
  var put = function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var day = function (d) { try { return new Date(d + "T12:00:00Z").toLocaleDateString(T.locale, { day: "numeric", month: "short", year: "numeric" }); } catch (e) { return d; } };
  var json = function (u) { return fetch(u).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); };
  // The first sentence of the hazard text, kept short: "The front seat head cushions may not be …"
  var line = function (a) {
    var t = String(a.hazard || a.risk || a.product || "").split(/(?<=\.)\s/)[0];
    return t.length > 120 ? t.slice(0, 117).replace(/\s+\S*$/, "") + " …" : t;
  };

  var dot = root.querySelector("[data-notices-dot]"), panel = root.querySelector("[data-notices-panel]");
  var items = []; // [{ car, n, all: [alert id], list: [newest alerts] }] for the saved cars with recalls

  function ids() { var out = []; items.forEach(function (it) { it.all.forEach(function (id) { out.push(id); }); }); return out; }

  function render() {
    var seen = get(SEEN, []), had = {};
    seen.forEach(function (id) { had[id] = 1; });
    var all = ids();
    root.hidden = all.length === 0;
    if (root.hidden) { root.open = false; return; }
    dot.hidden = all.every(function (id) { return had[id]; });
    panel.innerHTML = '<p class="ac-notices__h">' + esc(T.head) + ' <a href="' + PRE + '/recalls/">' + esc(T.all) + "</a></p>" +
      items.map(function (it) {
        var c = it.car, href = PRE + "/cars/?mine=" + encodeURIComponent(c.id) + "#recalls";
        var name = (c.nick ? c.nick + " · " : "") + (c.name || (c.make + " " + c.model)) + (c.year ? " (" + c.year + ")" : "");
        return '<section class="ac-notices__car"><p class="ac-notices__name"><a href="' + href + '">' + esc(name) + "</a></p>" +
          '<p class="ac-notices__n">' + esc(T.may(it.n)) + "</p><ul>" +
          it.list.map(function (a) {
            return '<li data-notice="' + esc(a.id) + '"><a href="' + esc(a.url) + '" target="_blank" rel="noopener">' + esc(line(a)) + "</a> <small>" +
              (had[a.id] ? "" : '<b class="ac-notices__new">' + esc(T.isNew) + "</b> ") + esc(day(a.date)) + (a.code ? " · " + esc(a.code) : "") + "</small></li>";
          }).join("") + "</ul>" +
          '<p class="ac-notices__more"><a href="' + href + '">' + esc(it.n > it.list.length ? T.more(it.n) : T.open) + "</a></p></section>";
      }).join("") +
      '<p class="ac-notices__note">' + esc(T.vin) + "</p><p class=\"ac-notices__note\">" + esc(T.src) + "</p>";
  }

  // The recalls that may affect each saved car, newest first: those naming the model, and of those
  // the ones built in years that fit its first registration (when the year is known).
  function compute(cars) {
    var G = window.AlloGarage;
    if (!G) return Promise.resolve(null);
    return json("/data/recalls/eu/brands.json").then(function (index) {
      if (!index || !index.brands) return null;
      var files = {};
      return Promise.all(cars.map(function (c) {
        var slug = G.recallBrand(c.make), b = index.brands.filter(function (x) { return x.slug === slug; })[0];
        if (!b || !G.recallModel(c.make, c.model)) return null;
        if (!files[b.file]) files[b.file] = json("/data/recalls/eu/" + b.file);
        return files[b.file].then(function (d) {
          var hits = ((d && d.alerts) || []).filter(function (a) { return G.recallNames(a, c.make, c.model); });
          if (c.year) hits = hits.filter(function (a) { return G.recallFits(a, c.year); });
          if (!hits.length) return null;
          hits.sort(function (x, y) { return String(y.date || "").localeCompare(String(x.date || "")); });
          return {
            id: c.id, n: hits.length, all: hits.map(function (a) { return a.id; }),
            list: hits.slice(0, SHOW).map(function (a) { return { id: a.id, date: a.date, url: a.url, hazard: line(a), code: a.recall_code || "" }; })
          };
        });
      })).then(function (r) { return { observed: index.observed_at || "", cars: r }; });
    });
  }

  function load() {
    var cars = (window.AlloGarage ? window.AlloGarage.list() : get("allo-cars-garage", { cars: [] }).cars || []).filter(function (c) { return c.make && c.model; });
    if (!cars.length) { items = []; render(); return; }
    var sig = JSON.stringify(cars.map(function (c) { return [c.id, c.make, c.model, c.year]; }));
    var hit = get(CACHE, null), done = function (res) {
      var by = {};
      (res.cars || []).forEach(function (r) { if (r) by[r.id] = r; });
      items = cars.filter(function (c) { return by[c.id]; }).map(function (c) { var r = by[c.id]; return { car: c, n: r.n, all: r.all, list: r.list }; });
      render();
    };
    if (hit && hit.sig === sig && Date.now() - hit.at < TTL) return done(hit.res);
    compute(cars).then(function (res) {
      if (!res) return;
      put(CACHE, { sig: sig, at: Date.now(), res: res });
      done(res);
    });
  }

  root.addEventListener("toggle", function () {
    if (!root.open) return;
    var seen = get(SEEN, []), add = ids().filter(function (id) { return seen.indexOf(id) < 0; });
    if (add.length) put(SEEN, add.concat(seen).slice(0, 500));
    dot.hidden = true;
  });
  document.addEventListener("click", function (e) { if (root.open && !root.contains(e.target)) root.open = false; });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && root.open) { root.open = false; var s = root.querySelector("summary"); if (s) s.focus(); }
  });
  addEventListener("ac:garage", load);
  addEventListener("storage", function (e) { if (e.key === "allo-cars-garage" || e.key === SEEN) load(); });
  // after the page has drawn: the bell is not what anyone came for
  (window.requestIdleCallback || function (f) { setTimeout(f, 300); })(load);
})();
