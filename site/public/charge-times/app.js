/* Cheapest time to charge: today's and tomorrow's day-ahead prices from /data/electricity-prices/de/latest.json,
   turned into an estimated dynamic tariff price, with the cheapest window for the chosen charging time.
   One script for /charge-times/ and /de/charge-times/. Link parameters: day=0|1, h=<hours>, addon=<€/kWh>, kwh=<n>. */
(() => {
  const de = document.documentElement.lang === "de";
  const T = de ? {
    locale: "de-DE", today: "Heute", tomorrow: "Morgen", hours: (h) => `${h} h`,
    window: "Günstigstes Zeitfenster", avgThere: "Preis in diesem Fenster", dayAvg: (p) => `Tagesdurchschnitt ${p}`,
    save: (kwh) => `Ersparnis für ${kwh} kWh gegenüber dem Tagesdurchschnitt`, chart: (d) => `Preis am ${d}`,
    waiting: "Die Preise für morgen erscheinen gegen 13 Uhr.", tip: (t, p) => `${t} Uhr: ${p}/kWh`,
    collected: "Stand: ", failed: "Die Daten konnten nicht geladen werden: ", none: "Für diesen Tag gibt es noch keine Preise.",
    clock: (s, e) => `${s}–${e}`,
  } : {
    locale: "en-GB", today: "Today", tomorrow: "Tomorrow", hours: (h) => `${h} h`,
    window: "Cheapest window", avgThere: "Price in that window", dayAvg: (p) => `Day average ${p}`,
    save: (kwh) => `Saving on ${kwh} kWh against the day average`, chart: (d) => `Price on ${d}`,
    waiting: "Tomorrow's prices appear around 13:00 German time.", tip: (t, p) => `${t}: ${p}/kWh`,
    collected: "Updated ", failed: "Could not load data: ", none: "No prices for this day yet.",
    clock: (s, e) => `${s}–${e}`,
  };
  const HOURS = [1, 2, 3, 4, 6, 8];
  const KEY = "allo-cars-charge-times";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const eur = (v, d = 2) => v == null ? "–" : new Intl.NumberFormat(T.locale, { style: "currency", currency: "EUR", minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
  const hm = (iso) => iso.slice(11, 16);
  const local = (v) => { try { return v === undefined ? localStorage.getItem(KEY) : localStorage.setItem(KEY, v); } catch (e) { return null; } };

  let data = null, model = null;
  const S = { day: 0, h: 4, addon: 0.18, kwh: 30 };

  function read() {
    const q = new URLSearchParams(location.search);
    const src = ["day", "h", "addon", "kwh"].some((k) => q.has(k)) ? q : new URLSearchParams(local() || "");
    const num = (k, lo, hi) => { const v = parseFloat(src.get(k)); return isFinite(v) && v >= lo && v <= hi ? v : null; };
    if (num("day", 0, 1) != null) S.day = num("day", 0, 1);
    if (HOURS.includes(num("h", 1, 8))) S.h = num("h", 1, 8);
    if (num("addon", 0, 1) != null) S.addon = num("addon", 0, 1);
    if (num("kwh", 1, 200) != null) S.kwh = num("kwh", 1, 200);
  }
  function write() {
    const qs = `day=${S.day}&h=${S.h}&addon=${S.addon}&kwh=${S.kwh}`;
    history.replaceState(null, "", `${location.pathname}?${qs}`);
    local(qs);
  }

  // Same formula as the collector: (EUR/MWh / 1000 + add-on) * (1 + VAT)
  const price = (eurMwh) => (eurMwh / 1000 + S.addon) * (1 + model.vat);

  function cheapest(slots, hours, step) {
    const n = hours * 60 / step;
    let best = null;
    for (let i = 0; i + n <= slots.length; i++) {
      const run = slots.slice(i, i + n);
      if (Date.parse(run[n - 1].start) - Date.parse(run[0].start) !== (n - 1) * step * 60000) continue;
      const avg = run.reduce((s, x) => s + x.eur_mwh, 0) / n;
      if (!best || avg < best.avg) best = { avg, i, n };
    }
    return best;
  }

  function chart(day, win) {
    const sl = day.slots, W = Math.max(320, Math.min(860, $("chart").clientWidth || 860)), H = W < 600 ? 240 : 260, L = 48, R = 6, Tp = 12, B = 28;
    const ps = sl.map((x) => price(x.eur_mwh));
    const lo = Math.min(0, ...ps), hi = Math.max(...ps);
    const y0 = Math.floor(lo * 10) / 10, y1 = Math.ceil(hi * 10) / 10 || 0.1;
    const bw = (W - L - R) / sl.length;
    const y = (v) => Tp + (1 - (v - y0) / (y1 - y0 || 1)) * (H - Tp - B);
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(T.chart(day.date))}">`;
    for (let v = y0; v <= y1 + 1e-9; v += 0.1) s += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${eur(v)}</text>`;
    sl.forEach((x, i) => {
      const p = ps[i], inWin = win && i >= win.i && i < win.i + win.n;
      const top = Math.min(y(p), y(0)), h = Math.max(1, Math.abs(y(p) - y(0)));
      s += `<rect class="bar${inWin ? " win" : p < 0 ? " neg" : ""}" x="${L + i * bw + 0.5}" y="${top}" width="${Math.max(1, bw - 1)}" height="${h}"><title>${esc(T.tip(hm(x.start), eur(p)))}</title></rect>`;
    });
    const avg = price(day.mean_eur_mwh);
    s += `<line class="avg" x1="${L}" x2="${W - R}" y1="${y(avg)}" y2="${y(avg)}"/>`;
    const perHour = 60 / day.step_minutes;
    for (let i = 0; i < sl.length; i += perHour * (W < 600 ? 6 : 3)) s += `<text x="${L + (i + 0.5) * bw}" y="${H - 8}" text-anchor="middle">${hm(sl[i].start)}</text>`;
    const now = Date.now(), first = Date.parse(sl[0].start), span = sl.length * day.step_minutes * 60000;
    if (now > first && now < first + span) { const nx = L + ((now - first) / span) * (W - L - R); s += `<line class="now" x1="${nx}" x2="${nx}" y1="${Tp}" y2="${H - B}"/>`; }
    return s + "</svg>";
  }

  function render() {
    const days = data.days;
    $("day").innerHTML = [T.today, T.tomorrow].map((n, i) => `<button type="button" data-day="${i}" aria-pressed="${S.day === i}"${days[i] ? "" : " disabled"}>${n}</button>`).join("");
    $("hours").innerHTML = HOURS.map((h) => `<button type="button" data-h="${h}" aria-pressed="${S.h === h}">${T.hours(h)}</button>`).join("");
    $("tomorrow-note").textContent = data.tomorrow_published ? "" : T.waiting;
    const day = days[S.day] || days[0];
    if (!day) { $("chart").innerHTML = `<p class="ac-caption">${T.none}</p>`; return; }
    const win = cheapest(day.slots, S.h, day.step_minutes);
    const avg = price(day.mean_eur_mwh);
    const r = (v, b, md) => `<div class="ac-readout${md ? " ac-readout--md" : ""}"><div class="ac-readout__value">${v}</div><div class="ac-readout__basis">${b}</div></div>`;
    if (win) {
      const start = day.slots[win.i].start, endMs = Date.parse(day.slots[win.i + win.n - 1].start) + day.step_minutes * 60000;
      const end = new Date(endMs).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
      const wp = price(win.avg);
      $("readouts").innerHTML = r(T.clock(hm(start), end), T.window)
        + r(`${eur(wp)}<small>/kWh</small>`, `${T.avgThere} · ${T.dayAvg(eur(avg))}`, true)
        + r(eur((avg - wp) * S.kwh), T.save(S.kwh), true);
    }
    $("chart-title").textContent = T.chart(new Date(day.date + "T12:00:00Z").toLocaleDateString(T.locale, { weekday: "long", day: "numeric", month: "long" }));
    $("chart").innerHTML = chart(day, win);
  }

  function wire() {
    $("day").addEventListener("click", (e) => { const b = e.target.closest("[data-day]"); if (b && !b.disabled) { S.day = +b.dataset.day; write(); render(); } });
    $("hours").addEventListener("click", (e) => { const b = e.target.closest("[data-h]"); if (b) { S.h = +b.dataset.h; write(); render(); } });
    $("addon").value = S.addon; $("kwh").value = S.kwh;
    $("addon").addEventListener("input", (e) => { const v = parseFloat(e.target.value); if (isFinite(v) && v >= 0 && v <= 1) { S.addon = v; write(); render(); } });
    $("kwh").addEventListener("input", (e) => { const v = parseFloat(e.target.value); if (isFinite(v) && v >= 1 && v <= 200) { S.kwh = v; write(); render(); } });
  }

  async function load() {
    read();
    data = await fetch(AlloSite.data("electricity-prices", "latest.json")).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
    model = data.tariff_model;
    if (!new URLSearchParams(location.search).has("addon") && !local()) S.addon = model.addon_eur_kwh_net;
    if (!data.days[S.day]) S.day = 0;
    wire();
    $("asof").textContent = T.collected + new Date(data.observed_at).toLocaleString(T.locale, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) + ".";
    render();
    addEventListener("resize", () => { clearTimeout(window.__acRs); window.__acRs = setTimeout(render, 150); });
  }
  load().catch((e) => { $("chart").innerHTML = `<p class="ac-caption">${T.failed}${esc(e.message)}</p>`; });
})();
