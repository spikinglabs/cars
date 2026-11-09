/* Time range for monthly charts: preset buttons (1, 3, 5 years, all), zoom in and out, and a
   slider under the chart with two handles and a window between them that can be dragged,
   with mouse, finger or keyboard. Plain DOM, no framework. Words follow <html lang> (en, de, zh).

   const r = AlloRange.create(host, {
     domain: ["2019-01", "2026-10"],   // first and last month the chart has
     values: [..],                     // optional, one number per month: the small overview line
     value: { last: 12 } | { from: "2024-01", to: "2025-06" } | {},   // {} is everything
     onInput(win) {},                  // while dragging: { from, to, months, last }
     onChange(win) {},                 // when a change is done (save it in the link here)
   });
   r.set(domain, values)               // new data; a preset stays a preset, a fixed range is clamped
   r.get()                             // { from, to, months, last }  (last: 0 means everything)
   AlloRange.ticks(from, months, px)   // [index, label] pairs for an x axis px pixels wide
*/
(function () {
  "use strict";
  var LANG = (document.documentElement.lang || "en").slice(0, 2);
  if (LANG !== "de" && LANG !== "zh") LANG = "en";
  var LOCALE = { en: "en-GB", de: "de-DE", zh: "zh-CN" }[LANG];
  var W = {
    en: { range: "Time range", y: function (n) { return n === 1 ? "1 year" : n + " years"; }, all: "All", zin: "Zoom in", zout: "Zoom out", from: "Start", to: "End", window: "Shown months", months: function (n) { return n === 1 ? "1 month" : n + " months"; } },
    de: { range: "Zeitraum", y: function (n) { return n === 1 ? "1 Jahr" : n + " Jahre"; }, all: "Alles", zin: "Vergrößern", zout: "Verkleinern", from: "Anfang", to: "Ende", window: "Gezeigte Monate", months: function (n) { return n === 1 ? "1 Monat" : n + " Monate"; } },
    zh: { range: "时间范围", y: function (n) { return n + " 年"; }, all: "全部", zin: "放大", zout: "缩小", from: "开始", to: "结束", window: "显示的月份", months: function (n) { return n + " 个月"; } }
  }[LANG];
  var PRESETS = [12, 36, 60];
  var MIN = 6;  // months: a narrower window says little

  var idx = function (m) { return +m.slice(0, 4) * 12 + +m.slice(5, 7) - 1; };
  var mon = function (i) { return Math.floor(i / 12) + "-" + String(i % 12 + 1).padStart(2, "0"); };
  var name = function (m, opt) { return new Date(m + "-15").toLocaleDateString(LOCALE, opt || { month: "short", year: "numeric" }); };
  var clamp = function (v, lo, hi) { return Math.max(lo, Math.min(hi, v)); };

  // Labels for a monthly x axis: every k months, k so that labels stay about 46 px apart.
  // Januaries show the year, other months their short name.
  function ticks(from, months, px) {
    var per = px / Math.max(months, 1), k = [1, 2, 3, 6, 12, 24, 60].find(function (s) { return s * per >= 46; }) || 120;
    var out = [], start = idx(from);
    for (var i = 0; i < months; i++) {
      var mi = start + i, m = mi % 12;
      if (k >= 12 ? m === 0 && (Math.floor(mi / 12) % (k / 12) === 0) : m % k === 0) out.push([i, m === 0 ? String(Math.floor(mi / 12)) : name(mon(mi), { month: "short" })]);
    }
    if (!out.length && months) out.push([0, name(from)]);
    return out;
  }

  function create(host, o) {
    var lo = idx(o.domain[0]), n = idx(o.domain[1]) - lo + 1, values = o.values || null;
    var last = 0, a = 0, b = n - 1;  // window: months a..b of the domain
    var v = o.value || {};
    if (v.last) last = v.last;
    else if (v.from || v.to) { a = v.from ? idx(v.from) - lo : 0; b = v.to ? idx(v.to) - lo : n - 1; last = -1; }

    host.classList.add("ac-range");
    host.innerHTML =
      '<div class="ac-range__bar">' +
        '<div class="ac-seg ac-range__seg" role="group" aria-label="' + W.range + '"></div>' +
      '</div>' +
      '<div class="ac-range__track">' +
        '<svg class="ac-range__spark" preserveAspectRatio="none" aria-hidden="true"></svg>' +
        '<div class="ac-range__shade" data-side="l"></div><div class="ac-range__shade" data-side="r"></div>' +
        '<div class="ac-range__win" aria-label="' + W.window + '"></div>' +
        '<div class="ac-range__h" role="slider" tabindex="0" data-h="a" aria-label="' + W.from + '"></div>' +
        '<div class="ac-range__h" role="slider" tabindex="0" data-h="b" aria-label="' + W.to + '"></div>' +
      '</div>' +
      '<div class="ac-range__years" aria-hidden="true"></div>' +
      '<div class="ac-range__bar">' +
        '<p class="ac-range__label" aria-live="polite"></p>' +
        '<span class="ac-range__zoom"><button type="button" data-z="out" aria-label="' + W.zout + '" title="' + W.zout + '">−</button><button type="button" data-z="in" aria-label="' + W.zin + '" title="' + W.zin + '">+</button></span>' +
      '</div>';
    var q = function (s) { return host.querySelector(s); };
    var seg = q(".ac-range__seg"), track = q(".ac-range__track"), win = q(".ac-range__win");
    var ha = q('[data-h="a"]'), hb = q('[data-h="b"]'), spark = q(".ac-range__spark");

    function fix() {
      if (last > 0) { b = n - 1; a = Math.max(0, n - last); }
      else if (last === 0) { a = 0; b = n - 1; }
      else {
        b = clamp(b, Math.min(MIN - 1, n - 1), n - 1); a = clamp(a, 0, b);
        if (b - a + 1 < Math.min(MIN, n)) a = Math.max(0, b - Math.min(MIN, n) + 1);
        // a hand-made window that happens to cover everything, or ends today with a preset length
        if (a === 0 && b === n - 1) last = 0;
        else if (b === n - 1 && PRESETS.indexOf(b - a + 1) >= 0) last = b - a + 1;
      }
    }
    function get() { return { from: mon(lo + a), to: mon(lo + b), months: b - a + 1, last: last }; }

    function drawSpark() {
      spark.setAttribute("viewBox", "0 0 " + n + " 100");
      if (!values || !values.length) { spark.innerHTML = ""; return; }
      var max = Math.max.apply(null, values.map(function (x) { return x || 0; }).concat([1]));
      var p = values.map(function (x, i) { return (i + 0.5).toFixed(1) + "," + (100 - ((x || 0) / max) * 88).toFixed(1); });
      spark.innerHTML = '<polygon points="0.5,100 ' + p.join(" ") + " " + (values.length - 0.5) + ',100"/>';
    }
    function drawYears() {
      var w = track.clientWidth || 320, html = "";
      ticks(mon(lo), n, w).filter(function (t) { return /^\d{4}$/.test(t[1]); }).forEach(function (t) { html += '<span style="left:' + ((t[0] + 0.5) / n * 100).toFixed(2) + '%">' + t[1] + "</span>"; });
      q(".ac-range__years").innerHTML = html;
    }
    function paint() {
      var l = a / n * 100, r = (b + 1) / n * 100;
      win.style.left = l + "%"; win.style.width = (r - l) + "%";
      q('[data-side="l"]').style.width = l + "%";
      q('[data-side="r"]').style.left = r + "%";
      ha.style.left = l + "%"; hb.style.left = r + "%";
      [[ha, a, 0, b], [hb, b, a, n - 1]].forEach(function (h) {
        h[0].setAttribute("aria-valuemin", h[2]); h[0].setAttribute("aria-valuemax", h[3]);
        h[0].setAttribute("aria-valuenow", h[1]); h[0].setAttribute("aria-valuetext", name(mon(lo + h[1]), { month: "long", year: "numeric" }));
      });
      var opts = PRESETS.filter(function (p) { return p < n; });
      seg.innerHTML = opts.map(function (p) { return '<button type="button" data-last="' + p + '" aria-pressed="' + (last === p) + '">' + W.y(p / 12) + "</button>"; }).join("") +
        '<button type="button" data-last="0" aria-pressed="' + (last === 0) + '">' + W.all + "</button>";
      q('[data-z="in"]').disabled = b - a + 1 <= Math.min(MIN, n);
      q('[data-z="out"]').disabled = a === 0 && b === n - 1;
      q(".ac-range__label").textContent = name(mon(lo + a)) + " – " + name(mon(lo + b)) + " · " + W.months(b - a + 1);
    }
    var queued = false;
    function input() {
      fix(); paint();
      if (queued || !o.onInput) return;
      queued = true;
      requestAnimationFrame(function () { queued = false; o.onInput(get()); });
    }
    function change() { fix(); paint(); if (o.onInput) o.onInput(get()); if (o.onChange) o.onChange(get()); }

    seg.addEventListener("click", function (e) {
      var t = e.target.closest("button"); if (!t) return;
      last = +t.dataset.last; change();
    });
    q(".ac-range__zoom").addEventListener("click", function (e) {
      var t = e.target.closest("button"); if (!t || t.disabled) return;
      var len = b - a + 1, atEnd = b === n - 1;
      var nl = clamp(t.dataset.z === "in" ? Math.round(len / 2) : len * 2, Math.min(MIN, n), n);
      // zooming keeps the latest month when it is shown, else the middle
      if (atEnd) { b = n - 1; a = b - nl + 1; }
      else { var mid = (a + b) / 2; a = Math.round(mid - (nl - 1) / 2); b = a + nl - 1; if (a < 0) { b -= a; a = 0; } if (b > n - 1) { a -= b - n + 1; b = n - 1; } }
      last = -1; change();
    });

    // dragging: a handle moves one end, the window moves both, a tap beside it brings it there
    var drag = null;
    function at(x) { var r = track.getBoundingClientRect(); return clamp(Math.floor((x - r.left) / r.width * n), 0, n - 1); }
    track.addEventListener("pointerdown", function (e) {
      if (e.button) return;
      var h = e.target.closest(".ac-range__h"), mode = h ? h.dataset.h : "w";
      if (mode === "w" && !e.target.closest(".ac-range__win")) {
        var len = b - a + 1, c = at(e.clientX);
        a = clamp(c - Math.floor(len / 2), 0, n - len); b = a + len - 1; last = -1; input();
      }
      drag = { mode: mode, x: e.clientX, a: a, b: b, w: track.getBoundingClientRect().width, id: e.pointerId };
      track.setPointerCapture(e.pointerId);
      if (h) h.focus({ preventScroll: true });
      e.preventDefault();
    });
    track.addEventListener("pointermove", function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var d = Math.round((e.clientX - drag.x) / drag.w * n), len = drag.b - drag.a + 1, gap = Math.min(MIN, n) - 1;
      if (drag.mode === "a") a = clamp(drag.a + d, 0, drag.b - gap);
      else if (drag.mode === "b") b = clamp(drag.b + d, drag.a + gap, n - 1);
      else { a = clamp(drag.a + d, 0, n - len); b = a + len - 1; }
      last = -1; input();
    });
    var end = function (e) { if (drag && e.pointerId === drag.id) { drag = null; change(); } };
    track.addEventListener("pointerup", end);
    track.addEventListener("pointercancel", end);
    [ha, hb].forEach(function (h) {
      h.addEventListener("keydown", function (e) {
        var step = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -12, PageUp: 12 }[e.key];
        var gap = Math.min(MIN, n) - 1;
        if (h.dataset.h === "a") {
          if (e.key === "Home") a = 0; else if (e.key === "End") a = b - gap; else if (step) a = clamp(a + step, 0, b - gap); else return;
        } else {
          if (e.key === "Home") b = a + gap; else if (e.key === "End") b = n - 1; else if (step) b = clamp(b + step, a + gap, n - 1); else return;
        }
        e.preventDefault(); last = -1; change();
      });
    });
    var rt;
    addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(drawYears, 150); });

    function set(domain, vals) {
      var keep = last < 0 ? get() : null;
      lo = idx(domain[0]); n = idx(domain[1]) - lo + 1; values = vals || null;
      if (keep) { a = idx(keep.from) - lo; b = idx(keep.to) - lo; }
      fix(); drawSpark(); drawYears(); paint();
      return get();
    }
    fix(); drawSpark(); drawYears(); paint();
    return { get: get, set: set };
  }

  window.AlloRange = { create: create, ticks: ticks, idx: idx, mon: mon };
})();
