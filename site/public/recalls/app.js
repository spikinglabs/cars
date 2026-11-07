/* Car recalls page: EU Safety Gate alerts for a model or a brand, US NHTSA campaigns for the model, newest alerts.
   Data: /data/recalls/eu/* and /data/recalls/us/*. One script for /recalls/ and /de/recalls/.
   Choice in the link: ?model=<slug> or ?brand=<slug>. The last choice is kept in this browser only. */
(() => {
  const de = document.documentElement.lang === "de";
  // Safety Gate writes in English; the German page translates the recurring labels, not the hazard text.
  const DE_TERMS = {
    "Passenger car": "Pkw", "Passenger car / Passenger van": "Pkw / Kleinbus", "Motorcycle": "Motorrad", "Lorry": "Lkw",
    "Truck": "Lkw", "Van": "Transporter", "Bus": "Bus", "Injuries": "Verletzungen", "Fire": "Brand", "Burns": "Verbrennungen",
    "Electric shock": "Stromschlag", "Environment": "Umwelt", "Chemical": "Chemisch", "Cuts": "Schnittverletzungen",
    "Recall of the product from end users": "Rückruf bei Endkunden", "Recall of a product from commercial users": "Rückruf bei gewerblichen Kunden",
    "Withdrawal of the product from the market": "Rücknahme vom Markt",
  };
  const tr = (s) => de && s ? (DE_TERMS[s] || s.split(", ").map((x) => DE_TERMS[x] || x).join(", ")) : s;
  // Every vehicle alert ends with the same legal sentence; it says nothing about the fault.
  const hazard = (s) => String(s || "").replace(/\s*The product does not comply with[^]*$/i, "").trim();
  const T = de ? {
    locale: "de-DE", eu: "Meldungen in Europa", us: "Rückrufaktionen in den USA", latest: "Neueste Meldung",
    none: "Keine", noEu: "Seit 2019 keine Meldung im EU Safety Gate, die dieses Modell nennt.",
    noUs: "Keine NHTSA-Rückrufaktion für dieses Modell.", brandTitle: (b) => `Rückrufe von ${b} in Europa`,
    modelTitle: (m) => `Rückrufe für den ${m} in Europa`, alert: "Meldung im Safety Gate", nhtsa: "Bei der NHTSA",
    production: "Produziert", code: "Rückrufcode", by: "Gemeldet von", years: "Modelljahre", remedy: "Abhilfe",
    parkOutside: "Draußen parken", doNotDrive: "Nicht fahren", ota: "Per Software-Update", collected: "Stand: ",
    showAll: (n) => `Alle ${n} zeigen`, failed: "Die Daten konnten nicht geladen werden: ",
    pickBrand: "Marke wählen", serious: "Ernstes Risiko",
    notYet: "Die Rückrufdaten werden gerade zum ersten Mal gesammelt. Schau in ein paar Minuten wieder vorbei.", unavailable: "Noch keine Daten",
    modelDesc: "Meldungen im EU Safety Gate seit 2019, die dieses Modell nennen. Ein Rückruf gilt nur für die darin genannten Fahrzeuge. Die Beschreibung kommt im englischen Original.",
    brandDesc: "Alle Meldungen dieser Marke im EU Safety Gate seit 2019, auch Motorräder und Nutzfahrzeuge. Die Beschreibung kommt im englischen Original.",
  } : {
    locale: "en-GB", eu: "Alerts in Europe", us: "Campaigns in the US", latest: "Newest alert",
    none: "None", noEu: "No EU Safety Gate alert since 2019 names this model.",
    noUs: "No NHTSA campaign for this model.", brandTitle: (b) => `${b} recalls in Europe`,
    modelTitle: (m) => `${m} recalls in Europe`, alert: "Safety Gate alert", nhtsa: "At NHTSA",
    production: "Built", code: "Recall code", by: "Reported by", years: "Model years", remedy: "Remedy",
    parkOutside: "Park outside", doNotDrive: "Do not drive", ota: "Over-the-air fix", collected: "Updated ",
    showAll: (n) => `Show all ${n}`, failed: "Could not load data: ",
    pickBrand: "Choose a brand", serious: "Serious risk",
    notYet: "Recall data is being collected for the first time. Check back in a few minutes.", unavailable: "No data yet",
    modelDesc: "EU Safety Gate alerts since 2019 that name this model. A recall covers only the vehicles listed in it.",
    brandDesc: "Every EU Safety Gate alert for this brand since 2019, including motorcycles and commercial vehicles.",
  };
  const BASE = "/data/recalls/";
  const KEY = "allo-cars-recalls";
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const day = (iso) => iso ? new Date(iso + "T12:00:00Z").toLocaleDateString(T.locale, { day: "numeric", month: "short", year: "numeric" }) : "–";
  const get = (path) => fetch(BASE + path).then((r) => { if (!r.ok) throw Object.assign(new Error(`${path}: ${r.status}`), { status: r.status }); return r.json(); });
  const local = (v) => { try { return v === undefined ? localStorage.getItem(KEY) : localStorage.setItem(KEY, v); } catch (e) { return null; } };
  const $ = (id) => document.getElementById(id);
  const country = (code) => { try { return new Intl.DisplayNames([T.locale], { type: "region" }).of(code); } catch (e) { return code; } };

  function euItem(a, withBrand) {
    const models = a.models && a.models.toLowerCase() !== String(a.brand).toLowerCase() ? a.models : null;
    const name = [withBrand || !models ? a.brand : null, models || a.type_approval].filter(Boolean).join(" ");
    const tags = [tr(a.product), tr(a.risk), a.level === "Serious risk" ? T.serious : a.level].filter(Boolean)
      .map((t) => `<span class="ac-tag">${esc(t)}</span>`).join("");
    const meta = [
      a.type_approval && models ? esc(a.type_approval) : "",
      a.production ? `${T.production} ${esc(a.production)}` : "",
      a.recall_code ? `${T.code} ${esc(a.recall_code)}` : "",
      a.notified_by ? `${T.by} ${esc(country(a.notified_by))}` : "",
    ].filter(Boolean).join(" · ");
    return `<li class="rc"><div class="rc__head"><h3 class="rc__title">${esc(name)}</h3><span class="rc__date">${day(a.date)}</span></div>
      <p>${esc(hazard(a.hazard))}</p>${a.measure ? `<p class="rc__meta">${esc(tr(a.measure))}</p>` : ""}
      <div class="rc__tags">${tags}</div><p class="rc__meta">${meta}${meta ? " · " : ""}<a href="${esc(a.url)}" rel="noopener">${T.alert}</a></p></li>`;
  }

  function usItem(c) {
    const flags = [c.do_not_drive && `<span class="ac-status ac-status--over">${T.doNotDrive}</span>`,
      c.park_outside && `<span class="ac-status ac-status--over">${T.parkOutside}</span>`,
      c.over_the_air && `<span class="ac-status ac-status--ok">${T.ota}</span>`].filter(Boolean).join("");
    return `<li class="rc"><div class="rc__head"><h3 class="rc__title">${esc(c.component || c.id)}</h3><span class="rc__date">${day(c.date)}</span></div>
      <p>${esc(c.summary)} ${esc(c.consequence || "")}</p>${flags ? `<div class="rc__tags">${flags}</div>` : ""}
      <p class="rc__meta">${T.years} ${esc((c.model_years || []).join(", "))} · <a href="${esc(c.url)}" rel="noopener">${T.nhtsa} ${esc(c.id)}</a></p></li>`;
  }

  function list(el, rows, render, empty, limit = 8) {
    if (!rows.length) { el.innerHTML = `<li class="ac-caption">${empty}</li>`; return; }
    el.innerHTML = rows.slice(0, limit).map(render).join("");
    if (rows.length > limit) {
      el.insertAdjacentHTML("beforeend", `<li class="more"><button type="button" class="ac-btn ac-btn--ghost">${T.showAll(rows.length)}</button></li>`);
      el.querySelector(".more button").addEventListener("click", () => list(el, rows, render, empty, Infinity));
    }
  }

  function readouts(eu, us) {
    const r = (v, b, md) => `<div class="ac-readout${md ? " ac-readout--md" : ""}"><div class="ac-readout__value">${v}</div><div class="ac-readout__basis">${b}</div></div>`;
    $("readouts").innerHTML = r(eu.length, T.eu) + (us ? r(us.length, T.us, true) : "") + r(eu[0] ? day(eu[0].date) : T.none, T.latest, true);
  }

  let models = [], brands = [];

  async function show(kind, slug) {
    const url = new URL(location.href);
    url.searchParams.delete("model"); url.searchParams.delete("brand");
    url.searchParams.set(kind, slug);
    history.replaceState(null, "", url);
    local(`${kind}=${slug}`);
    $("model").value = kind === "model" ? slug : "";
    $("brand").value = kind === "brand" ? slug : "";
    if (kind === "model") {
      const m = models.find((x) => x.slug === slug);
      const [eu, us] = await Promise.all([get(`eu/${m.file}`), m.us_file ? get(`us/models/${slug}.json`).catch(() => null) : null]);
      $("eu-title").textContent = T.modelTitle(m.model);
      $("eu-desc").textContent = T.modelDesc;
      list($("eu"), eu.alerts, (a) => euItem(a, false), T.noEu);
      $("us-card").hidden = !us;
      if (us) list($("us"), us.campaigns, usItem, T.noUs);
      readouts(eu.alerts, us && us.campaigns);
    } else {
      const b = brands.find((x) => x.slug === slug);
      const eu = await get(`eu/${b.file}`);
      $("eu-title").textContent = T.brandTitle(b.brand);
      $("eu-desc").textContent = T.brandDesc;
      list($("eu"), eu.alerts, (a) => euItem(a, true), T.noEu);
      $("us-card").hidden = true;
      readouts(eu.alerts, null);
    }
  }

  function initial() {
    const q = new URLSearchParams(location.search);
    const saved = new URLSearchParams(local() || "");
    for (const src of [q, saved]) {
      if (models.some((m) => m.slug === src.get("model"))) return ["model", src.get("model")];
      if (brands.some((b) => b.slug === src.get("brand"))) return ["brand", src.get("brand")];
    }
    try { // the car picked in the charging cost tool
      const car = new URLSearchParams(localStorage.getItem("allo-cars-ev-cost") || "").get("car");
      const m = car && models.find((x) => car.toLowerCase().startsWith(x.model.toLowerCase()));
      if (m) return ["model", m.slug];
    } catch (e) {}
    return ["model", "volvo-ex30"];
  }

  async function load() {
    const [m, b, latest] = await Promise.all([get("eu/models.json"), get("eu/brands.json"), get("eu/latest.json")]);
    models = m.models; brands = b.brands.filter((x) => x.slug !== "unknown");
    $("model").innerHTML = `<option value="" hidden></option>` + models.map((x) => `<option value="${x.slug}">${esc(x.model)} (${x.alerts})</option>`).join("");
    $("brand").innerHTML = `<option value="">${T.pickBrand}</option>` + brands.slice().sort((x, y) => x.brand.localeCompare(y.brand))
      .map((x) => `<option value="${x.slug}">${esc(x.brand)} (${x.alerts})</option>`).join("");
    $("model").addEventListener("change", (e) => e.target.value && show("model", e.target.value));
    $("brand").addEventListener("change", (e) => e.target.value && show("brand", e.target.value));
    list($("newest"), latest.newest, (a) => euItem(a, true), T.none, 5);
    $("asof").textContent = T.collected + new Date(latest.observed_at).toLocaleString(T.locale, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) + ".";
    await show(...initial());
  }
  load().catch((e) => {
    // Before the first collection (or if the files are briefly missing) say so, instead of a raw error.
    const msg = e.status === 404 ? T.notYet : T.failed + e.message;
    $("readouts").innerHTML = `<div class="ac-readout ac-readout--md"><div class="ac-readout__value">${T.unavailable}</div><div class="ac-readout__basis">${esc(msg)}</div></div>`;
    $("eu").innerHTML = $("newest").innerHTML = "";
    ["model", "brand"].forEach((id) => { $(id).disabled = true; });
    $("model").innerHTML = `<option>${T.unavailable}</option>`;
  });
})();
