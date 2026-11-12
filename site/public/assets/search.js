/* Find a car: the search in the header of every page (a popover opened by the magnifier button) and
 * any inline search box (a <form data-find> with an input name="q" and a <ul data-find-list>).
 *
 * Searches the vehicle catalog (/data/vehicle-catalog/<region>/models.json, loaded on first use) by
 * make, model and fuel, and the site's own pages (taken from the "All pages" sheet in the footer, so
 * they are always in the page's language). Each car leads to its page, /cars/?car=<catalog id>, which
 * shows everything the site knows about it. With nothing typed it offers the cars kept in "My cars"
 * and the best sellers. Without JavaScript the form still works: it opens /cars/?q=<text>, and that
 * page lists the matches too (so a link or an AI can search with ?q=).
 * English, German and Chinese; Chinese brand names (大众, 比亚迪 …) find the brand.
 */
(function () {
  "use strict";
  var lang = (document.documentElement.lang || "en").slice(0, 2);
  var PRE = lang === "de" ? "/de" : lang === "zh" ? "/zh" : "";
  var T = {
    zh: { cars: "车型", pages: "页面", mine: "我的车", popular: "德国最畅销", none: "没有找到。试试品牌和车型，例如“大众 ID.3”。", all: function (q) { return "查看“" + q + "”的全部结果"; }, loading: "正在加载车型…", regs: function (n) { return "近 12 个月新登记 " + n + " 辆"; },
      fuel: { electric: "纯电动", petrol: "汽油", diesel: "柴油", lpg: "LPG", "phev-petrol": "插电混动（汽油）", "phev-diesel": "插电混动（柴油）", hydrogen: "氢燃料", cng: "天然气 (CNG)" } },
    de: { cars: "Modelle", pages: "Seiten", mine: "Meine Autos", popular: "Meistverkauft in Deutschland", none: "Nichts gefunden. Versuch Marke und Modell, z. B. „VW ID.3“.", all: function (q) { return "Alle Treffer für „" + q + "“"; }, loading: "Modelle werden geladen …", regs: function (n) { return n + " neu zugelassen in 12 Monaten"; },
      fuel: { electric: "Elektro", petrol: "Benzin", diesel: "Diesel", lpg: "Autogas", "phev-petrol": "Plug-in-Hybrid (Benzin)", "phev-diesel": "Plug-in-Hybrid (Diesel)", hydrogen: "Wasserstoff", cng: "Erdgas (CNG)" } },
    en: { cars: "Car models", pages: "Pages", mine: "My cars", popular: "Best sellers in Germany", none: "Nothing found. Try make and model, e.g. “VW ID.3”.", all: function (q) { return "All results for “" + q + "”"; }, loading: "Loading car models…", regs: function (n) { return n + " new in the last 12 months"; },
      fuel: { electric: "Electric", petrol: "Petrol", diesel: "Diesel", lpg: "LPG", "phev-petrol": "Plug-in hybrid (petrol)", "phev-diesel": "Plug-in hybrid (diesel)", hydrogen: "Hydrogen", cng: "CNG" } }
  }[lang] || null;
  if (!T) return;
  var locale = lang === "zh" ? "zh-CN" : lang === "de" ? "de-DE" : "en-GB";

  // Chinese and other common names for makes, so 大众 finds VW and Mercedes finds Mercedes-Benz
  var ALIAS = {
    "大众": "vw", "宝马": "bmw", "奔驰": "mercedes", "梅赛德斯": "mercedes", "奥迪": "audi", "特斯拉": "tesla", "比亚迪": "byd", "沃尔沃": "volvo",
    "保时捷": "porsche", "丰田": "toyota", "本田": "honda", "马自达": "mazda", "现代": "hyundai", "起亚": "kia", "斯柯达": "skoda", "雷诺": "renault",
    "标致": "peugeot", "菲亚特": "fiat", "福特": "ford", "欧宝": "opel", "日产": "nissan", "极星": "polestar", "蔚来": "nio", "小鹏": "xpeng",
    "名爵": "mg", "零跑": "leapmotor", "西雅特": "seat", "库普拉": "cupra", "雪铁龙": "citroen", "迷你": "mini", "斯玛特": "smart", "达契亚": "dacia",
    "铃木": "suzuki", "三菱": "mitsubishi", "路虎": "land rover", "捷豹": "jaguar", "吉利": "geely", "领克": "lynk", "长城": "gwm", "魏牌": "wey",
    "极氪": "zeekr", "小米": "xiaomi", "阿尔法罗密欧": "alfa romeo", "玛莎拉蒂": "maserati", "法拉利": "ferrari", "兰博基尼": "lamborghini", "宾利": "bentley",
    "劳斯莱斯": "rolls royce", "阿斯顿马丁": "aston martin", "雷克萨斯": "lexus", "斯巴鲁": "subaru", "吉普": "jeep", "道奇": "dodge", "卢西德": "lucid",
    volkswagen: "vw", mercedesbenz: "mercedes", "mercedes-benz": "mercedes", citroën: "citroen", škoda: "skoda"
  };
  var norm = function (s) { return String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, ""); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var words = function (q) {
    q = String(q || "").toLowerCase();
    Object.keys(ALIAS).forEach(function (k) { if (q.indexOf(k) >= 0) q = q.split(k).join(" " + ALIAS[k] + " "); });
    return q.split(/[\s,]+/).map(norm).filter(Boolean);
  };

  var catalog = null, loading = null;
  function load() {
    if (catalog) return Promise.resolve(catalog);
    if (!loading) {
      var url = window.AlloSite ? AlloSite.data("vehicle-catalog", "models.json") : "/data/vehicle-catalog/de/models.json";
      loading = fetch(url).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (d) {
        catalog = d.models.map(function (m) { m._h = norm(m.make + " " + m.name + " " + m.model + " " + m.fuel + " " + (T.fuel[m.fuel] || "")); return m; });
        return catalog;
      }).catch(function () { loading = null; return []; });
    }
    return loading;
  }
  // models whose make, name and fuel hold every word, best sellers first; a whole-word model match first
  function findCars(q, n) {
    var w = words(q);
    if (!w.length || !catalog) return [];
    var hits = catalog.filter(function (m) { return w.every(function (x) { return m._h.indexOf(x) >= 0; }); });
    var exact = function (m) { var k = norm(m.model); return w.some(function (x) { return x === k; }) ? 1 : 0; };
    hits.sort(function (a, b) { return exact(b) - exact(a) || (b.registrations || 0) - (a.registrations || 0); });
    return n ? hits.slice(0, n) : hits;
  }
  function pages() {
    var seen = {}, out = [];
    document.querySelectorAll("#ac-more a[data-more]").forEach(function (a) {
      var href = a.getAttribute("href"), t = a.textContent.trim();
      if (!seen[href]) { seen[href] = 1; out.push({ href: href, t: t, h: norm(t) + " " + norm(href) }); }
    });
    return out;
  }
  function findPages(q) {
    var w = words(q), raw = String(q || "").trim().toLowerCase();
    if (!w.length && !raw) return [];
    return pages().filter(function (p) { return (w.length && w.every(function (x) { return p.h.indexOf(x) >= 0; })) || (raw && p.t.toLowerCase().indexOf(raw) >= 0); }).slice(0, 4);
  }
  function garage() {
    try { var g = JSON.parse(localStorage.getItem("allo-cars-garage") || "null"); return g && Array.isArray(g.cars) ? g.cars : []; } catch (e) { return []; }
  }
  var carHref = function (id, extra) { return PRE + "/cars/?car=" + encodeURIComponent(id) + (extra || ""); };
  function carSub(m) {
    var bits = [T.fuel[m.fuel] || m.fuel];
    if (m.registrations) bits.push(T.regs(Number(m.registrations).toLocaleString(locale)));
    return bits.join(" · ");
  }

  /* one search box: the input is a combobox over a list of links */
  function attach(form) {
    var input = form.querySelector("input[name=q]"), list = form.querySelector("[data-find-list]");
    if (!input || !list || form.__find) return;
    form.__find = true;
    var uid = "f" + Math.random().toString(36).slice(2, 7), active = -1;
    list.id = list.id || uid + "-list";
    input.setAttribute("role", "combobox"); input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-controls", list.id); input.setAttribute("aria-expanded", "false");
    var opts = function () { return list.querySelectorAll("a[role=option]"); };
    function group(title, items) {
      return items.length ? '<li class="ac-find__group" role="presentation">' + esc(title) + "</li>" + items.join("") : "";
    }
    function opt(href, name, sub) {
      return '<li role="presentation"><a role="option" id="' + uid + "-" + (opt.i++) + '" href="' + esc(href) + '"><b>' + esc(name) + "</b>" + (sub ? "<small>" + esc(sub) + "</small>" : "") + "</a></li>";
    }
    function render() {
      var q = input.value.trim();
      opt.i = 0; active = -1; input.removeAttribute("aria-activedescendant");
      var html = "";
      if (!q) {
        var mine = garage().slice(0, 6).map(function (c) { return opt(c.car ? carHref(c.car, (c.year ? "&year=" + c.year : "") + (c.v ? "&v=" + encodeURIComponent(c.v) : "")) : PRE + "/cars/", c.nick || c.name, [c.nick ? c.name : "", T.fuel[c.fuel] || "", c.year || ""].filter(Boolean).join(" · ")); });
        var top = catalog ? catalog.slice().sort(function (a, b) { return (b.registrations || 0) - (a.registrations || 0); }).slice(0, 6).map(function (m) { return opt(carHref(m.id), m.name, carSub(m)); }) : [];
        html = group(T.mine, mine) + (catalog ? group(T.popular, top) : '<li class="ac-find__none" role="presentation">' + esc(T.loading) + "</li>");
      } else {
        var cars = findCars(q, 8), pg = findPages(q);
        html = group(T.cars, cars.map(function (m) { return opt(carHref(m.id), m.name, carSub(m)); })) + group(T.pages, pg.map(function (p) { return opt(p.href, p.t, ""); }));
        if (!catalog) html += '<li class="ac-find__none" role="presentation">' + esc(T.loading) + "</li>";
        else if (!cars.length && !pg.length) html = '<li class="ac-find__none" role="presentation">' + esc(T.none) + "</li>";
        else if (findCars(q).length > 8) html += '<li role="presentation"><a role="option" class="ac-find__all" id="' + uid + "-" + (opt.i++) + '" href="' + PRE + "/cars/?q=" + encodeURIComponent(q) + '">' + esc(T.all(q)) + "</a></li>";
      }
      list.innerHTML = html;
      list.hidden = !html;
      input.setAttribute("aria-expanded", html ? "true" : "false");
    }
    function move(d) {
      var o = opts(); if (!o.length) return;
      if (active >= 0 && o[active]) o[active].removeAttribute("aria-selected");
      active = (active + d + o.length) % o.length;
      o[active].setAttribute("aria-selected", "true");
      input.setAttribute("aria-activedescendant", o[active].id);
      o[active].scrollIntoView({ block: "nearest" });
    }
    var open = function () {
      render(); load().then(render);
      // on a phone, lift an inline box to the top so the list is not hidden behind the keyboard
      if (!form.closest("[popover]") && innerWidth < 720 && form.getBoundingClientRect().top > innerHeight * 0.3) form.scrollIntoView({ block: "start", behavior: "smooth" });
    };
    input.addEventListener("focus", open);
    input.addEventListener("input", function () { render(); if (!catalog) load().then(render); });
    input.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
      else if (e.key === "Enter") {
        var o = opts(), pick = active >= 0 ? o[active] : null;
        // Enter with nothing picked: straight to the car when the first hit is a car
        if (!pick && input.value.trim() && catalog) { var c = findCars(input.value, 1)[0]; if (c) { e.preventDefault(); location.href = carHref(c.id); return; } }
        if (pick) { e.preventDefault(); location.href = pick.href; }
      } else if (e.key === "Escape" && !form.closest("[popover]")) { list.hidden = true; input.setAttribute("aria-expanded", "false"); }
    });
    if (!form.closest("[popover]")) {
      input.addEventListener("blur", function () { setTimeout(function () { if (!form.contains(document.activeElement)) { list.hidden = true; input.setAttribute("aria-expanded", "false"); } }, 150); });
    }
    list.addEventListener("pointerdown", function (e) { if (e.target.closest("a")) e.preventDefault(); });
    list.addEventListener("click", function (e) { var a = e.target.closest("a"); if (a) { e.preventDefault(); location.href = a.href; } });
  }

  /* the header popover: focus its box when it opens; open it with "/" anywhere (not while typing) */
  function header() {
    var pop = document.getElementById("ac-find");
    if (!pop) return;
    var native = typeof pop.showPopover === "function";
    var input = pop.querySelector("input[name=q]");
    var show = function () {
      if (native) { try { pop.showPopover(); } catch (e) {} } else pop.classList.add("is-open");
      setTimeout(function () { input.focus(); input.select(); }, 30);
    };
    if (native) pop.addEventListener("toggle", function (e) { if (e.newState === "open") setTimeout(function () { input.focus(); }, 30); });
    else document.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("[popovertarget='ac-find']");
      if (b) { e.preventDefault(); if (pop.classList.contains("is-open") || b.getAttribute("popovertargetaction") === "hide") pop.classList.remove("is-open"); else show(); }
    });
    document.addEventListener("keydown", function (e) {
      var t = e.target, typing = t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName));
      if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); show(); }
      if (e.key === "Escape" && !native) pop.classList.remove("is-open");
    });
  }

  window.AlloFind = { find: findCars, load: load, words: words, norm: norm, attach: attach };
  var start = function () { document.querySelectorAll("form[data-find]").forEach(attach); header(); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
