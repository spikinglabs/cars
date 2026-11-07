/* Allo Cars site behaviour shared by every page: the light/dark switch. */
(function () {
  "use strict";
  var KEY = "allo-cars-theme", root = document.documentElement;
  try { var saved = localStorage.getItem(KEY); if (saved === "dark" || saved === "light") root.setAttribute("data-theme", saved); } catch (e) {}
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-theme-flip]");
    if (!b) return;
    var dark = root.getAttribute("data-theme") ? root.getAttribute("data-theme") === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    var next = dark ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try { localStorage.setItem(KEY, next); } catch (e2) {}
  });
})();
