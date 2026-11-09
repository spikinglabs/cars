/* Allo Cars site behaviour shared by every page: the country, the language, the light/dark switch and installing the site as an app. */
(function () {
  "use strict";
  var KEY = "allo-cars-theme", root = document.documentElement;
  var lang = (root.lang || "en").slice(0, 2);
  var WORDS = {
    zh: {
      hintIos: "点按“分享”，再选“添加到主屏幕”，就能像 App 一样使用 Allo Cars。",
      menu: "在浏览器菜单中选择“安装应用”或“添加到主屏幕”。",
      installed: "这台设备上已经安装了 Allo Cars，可以从主屏幕或应用列表打开。"
    },
    de: {
    hintIos: "Teilen antippen, dann „Zum Home-Bildschirm“, um Allo Cars wie eine App zu nutzen.",
    menu: "Im Browser-Menü „App installieren“ oder „Zum Startbildschirm hinzufügen“ wählen.",
    installed: "Allo Cars ist auf diesem Gerät schon installiert. Öffne es über den Startbildschirm oder die App-Liste."
    },
    en: {
    hintIos: "Tap Share, then “Add to Home Screen”, to use Allo Cars like an app.",
    menu: "In your browser menu, choose “Install app” or “Add to Home screen”.",
    installed: "Allo Cars is already installed on this device. Open it from your home screen or app list."
    }
  };
  if (!WORDS[lang]) lang = "en";
  var T = WORDS[lang];
  var local = function (k, v) { try { return v === undefined ? localStorage.getItem(k) : (localStorage.setItem(k, v), v); } catch (e) { return null; } };

  /* ---------- country ---------- */
  // The regions people can pick come from /regions.json, written into every page head by
  // site/chrome/apply.py. The choice is ?country=<code> in the link, else the one saved on this
  // device, else the default. Tools ask AlloSite.data() for data URLs, so they follow the choice.
  // (AlloSite, not AlloCars: the component bundle owns window.AlloCars.)
  var REGION_KEY = "allo-cars-country";
  var R = window.__acRegions || { default: "de", regions: [{ code: "de", name: { en: "Germany", de: "Deutschland" }, currency: "EUR", locale: "de-DE" }] };
  var known = function (c) { return R.regions.some(function (r) { return r.code === c; }); };
  var asked = (new URLSearchParams(location.search).get("country") || "").toLowerCase();
  if (known(asked)) local(REGION_KEY, asked);
  var region = known(asked) ? asked : known(local(REGION_KEY)) ? local(REGION_KEY) : R.default;
  root.setAttribute("data-country", region);
  window.AlloSite = {
    region: region,
    regions: R.regions,
    info: function () { return R.regions.filter(function (r) { return r.code === region; })[0]; },
    // AlloSite.data("charging-prices", "latest.json") -> "/data/charging-prices/de/latest.json"
    data: function (dataset, file) { return "/data/" + dataset + "/" + region + "/" + file; }
  };
  /* ---------- anonymous usage counts ---------- */
  // The shared Allo usage counter (spikinglabs/alloland-rebirth workers/count) keeps only day, site,
  // feature name and country: no IP, ID or cookie, and nothing is stored here. Skipped when the browser
  // sends Do Not Track or Global Privacy Control, and anywhere but cars.allo.land. Page scripts can call
  // AlloTrack("name"); links and buttons can carry data-count="name".
  var track = window.AlloTrack = function (f) {
    try {
      if (navigator.doNotTrack === "1" || navigator.globalPrivacyControl) return;
      if (location.hostname !== "cars.allo.land") return;
      if (navigator.sendBeacon) navigator.sendBeacon("https://monitoring.admin.allo.land/e?f=" + encodeURIComponent(f));
    } catch (e) {}
  };
  // One "open" per page load, plus which section it was: /de/chargers/stats/ -> page_chargers.
  // Sent once a person is plausibly there: after 3 s visible, or at the first tap, click, key or
  // scroll, so scripts that load the page and leave aren't counted.
  (function () {
    var parts = location.pathname.split("/").filter(Boolean);
    if (parts[0] === "de" || parts[0] === "zh") parts.shift();
    var events = ["pointerdown", "keydown", "scroll", "touchstart"], timer, sent = false;
    function go() {
      if (sent) return;
      sent = true;
      clearTimeout(timer);
      events.forEach(function (e) { removeEventListener(e, go, true); });
      document.removeEventListener("visibilitychange", onVisibility);
      track("open");
      track("page_" + (parts[0] ? parts[0].replace(/[^a-z0-9_-]/gi, "").toLowerCase().slice(0, 40) : "home"));
    }
    function onVisibility() {
      clearTimeout(timer);
      if (document.visibilityState === "visible") timer = setTimeout(go, 3000);
    }
    events.forEach(function (e) { addEventListener(e, go, { capture: true, passive: true }); });
    document.addEventListener("visibilitychange", onVisibility);
    onVisibility();
  })();
  document.addEventListener("click", function (e) {
    var el = e.target.closest && e.target.closest("[data-count], a[href]");
    if (!el) return;
    if (el.dataset.count) return track(el.dataset.count);
    var href = el.getAttribute("href") || "";
    if (el.hasAttribute("download") || /^\/data\//.test(href)) track("download");
  });

  document.addEventListener("change", function (e) {
    if (!e.target.matches || !e.target.matches("[data-country]") || !known(e.target.value)) return;
    track("country");
    local(REGION_KEY, e.target.value);
    var u = new URL(location.href);
    if (u.searchParams.has("country")) u.searchParams.set("country", e.target.value);
    location.href = u.toString();
  });
  document.addEventListener("DOMContentLoaded", function () {
    var pick = document.querySelector("[data-country]");
    if (pick) pick.value = region;
  });

  /* ---------- language ---------- */
  // English pages live at /, German ones under /de/, Simplified Chinese under /zh/ (LANGS in
  // site/chrome/apply.py). Picking a language in the header menu is kept on this device; when you
  // come back to the home page from outside the site (or open the installed app), you land in it.
  var LANG_KEY = "allo-cars-lang", HOMES = { en: "/", de: "/de/", zh: "/zh/" };
  var wantLang = local(LANG_KEY);
  var fromSite = false;
  try { fromSite = !!document.referrer && new URL(document.referrer).origin === location.origin; } catch (e) {}
  var path = location.pathname.replace(/index\.html$/, "");
  var home = Object.keys(HOMES).some(function (k) { return HOMES[k] === path; });
  if (home && !fromSite && HOMES[wantLang] && wantLang !== lang) {
    location.replace(HOMES[wantLang] + location.search + location.hash);
  }
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest(".ac-lang");
    if (a && HOMES[a.getAttribute("data-lang")]) local(LANG_KEY, a.getAttribute("data-lang"));
    // close the language menu on a click anywhere else
    var menu = document.querySelector("[data-langmenu][open]");
    if (menu && !menu.contains(e.target)) menu.open = false;
  });
  document.addEventListener("keydown", function (e) {
    var menu = document.querySelector("[data-langmenu][open]");
    if (menu && e.key === "Escape") { menu.open = false; menu.querySelector("summary").focus(); }
  });

  /* ---------- light or dark ---------- */
  var saved = local(KEY);
  if (saved === "dark" || saved === "light") root.setAttribute("data-theme", saved);
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-theme-flip]");
    if (!b) return;
    var dark = root.getAttribute("data-theme") ? root.getAttribute("data-theme") === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    var next = dark ? "light" : "dark";
    root.setAttribute("data-theme", next);
    local(KEY, next);
  });

  /* ---------- install as an app ---------- */
  // The service worker makes the site installable and keeps pages you opened readable offline.
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    addEventListener("load", function () { navigator.serviceWorker.register("/sw.js").catch(function () {}); });
  }

  document.addEventListener("DOMContentLoaded", function () {
    var $ = function (s) { return document.querySelector(s); };
    var standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
    var ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    var box = $("[data-install]"), btn = $("[data-install-btn]"), how = $("[data-install-how]");
    var hint = $("[data-app-hint]"), hintGo = $("[data-app-hint-go]");
    var prompt = null;

    // On phones, a quiet line under the header says the site works as an app. It waits until the
    // second page you open, and once dismissed (or installed) it stays away on this device.
    var HINT = "allo-cars-app-hint";
    var phone = matchMedia("(pointer: coarse) and (max-width: 899px)").matches;
    var views = Number(local(HINT) || 0);
    var wanted = phone && !standalone && local(HINT) !== "off" && !isNaN(views);
    if (wanted) local(HINT, String(views + 1));
    var closeHint = function () { if (hint) hint.hidden = true; local(HINT, "off"); };
    if (hint && wanted && views >= 1) {
      if (ios) $("[data-app-hint-text]").textContent = T.hintIos;
      hint.hidden = false;
    }
    if (hint) hint.querySelector("[data-app-hint-x]").addEventListener("click", closeHint);

    // Chrome, Edge and Android offer an install dialog we can open from our own buttons. The early
    // listener in the page head keeps the offer, because Chrome may make it before this runs.
    var take = function () { prompt = window.__acInstall || prompt; window.__acInstall = null; if (prompt && hintGo) hintGo.hidden = false; };
    var install = function () {
      if (!prompt) return;
      var ev = prompt; prompt = null;
      ev.prompt();
      ev.userChoice.then(function (c) {
        if (hintGo) hintGo.hidden = true;
        if (c && c.outcome === "accepted") { track("install"); closeHint(); if (box) box.hidden = true; }
      }, function () {});
    };
    take();
    addEventListener("ac:installable", take);
    if (hintGo) hintGo.addEventListener("click", install);

    // The footer button is always there outside the installed app, even after the hint was dismissed.
    // Where the browser has no install dialog (Safari, Firefox), it says how instead.
    var say = function (text) { if (how) { how.textContent = text; how.hidden = false; } };
    if (!standalone && box) box.hidden = false;
    if (btn) btn.addEventListener("click", function () {
      var go = function () { if (prompt) install(); else say(ios ? T.hintIos : T.menu); };
      if (prompt || ios) return go();
      var t = setTimeout(go, 1500);
      addEventListener("ac:installable", function () { clearTimeout(t); go(); }, { once: true });
    });
    // Chrome makes no install offer while the app is already installed: say so, and where to open it.
    if (!standalone && navigator.getInstalledRelatedApps) {
      navigator.getInstalledRelatedApps().then(function (apps) {
        if (!apps.length) return;
        closeHint();
        if (btn) btn.hidden = true;
        say(T.installed);
      }).catch(function () {});
    }
    addEventListener("appinstalled", function () { if (box) box.hidden = true; closeHint(); });
  });

  /* ---------- "More" sheet on phones ---------- */
  // The sheet is a native popover, so the browser opens and closes it. This closes it after a tap on a
  // link to the page already shown (e.g. #ai on the data page), and opens it in browsers without popover.
  document.addEventListener("DOMContentLoaded", function () {
    var sheet = document.getElementById("ac-more");
    if (!sheet) return;
    var native = typeof sheet.showPopover === "function";
    var btn = document.querySelector("[data-more-btn]");
    var sync = function (open) { if (btn) btn.setAttribute("aria-expanded", open ? "true" : "false"); };
    var hide = function () { if (native) { try { sheet.hidePopover(); } catch (e) {} } else { sheet.classList.remove("is-open"); sync(false); } };
    sync(false);
    if (native) sheet.addEventListener("toggle", function (e) { sync(e.newState === "open"); });
    sheet.addEventListener("click", function (e) { if (e.target.closest && e.target.closest("a")) hide(); });
    if (native) return;
    document.addEventListener("click", function (e) {
      var t = e.target.closest && e.target.closest("[popovertarget='ac-more']");
      if (t) { var open = !sheet.classList.contains("is-open") && !t.hasAttribute("data-more-close"); sheet.classList.toggle("is-open", open); sync(open); }
      else if (sheet.classList.contains("is-open") && !sheet.contains(e.target)) hide();
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") hide(); });
  });
})();
