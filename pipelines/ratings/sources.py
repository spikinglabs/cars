"""Readers for the three rating sources. Each takes page text or PDF bytes and returns plain facts
(star rating, year, breakdowns per 1,000 cars); no report text or images are kept.

- Euro NCAP (euroncap.com): one page per assessment, listed in the sitemap under /assessments/
  <make>/<model>/<id>/. Safety assessments have numeric ids (assisted-driving gradings start with a
  letter). The page carries "safetyRatingStars":N and "ratingYear":YYYY in its embedded data.
- Green NCAP (greenncap.com): one page per tested version, listed on /assessments/. The page title
  reads "<version> Green NCAP rating <year> – <n> stars".
- ADAC Pannenstatistik (adac.de): a yearly PDF report with tables of breakdowns per 1,000 registered
  cars by model series (Baureihe) and year of first registration (EZ).
"""

from __future__ import annotations

import html
import io
import json
import re

USER_AGENT = "Allo-Cars/0.1 (+https://cars.allo.land/open-data/)"

EURO_SITEMAP = "https://www.euroncap.com/sitemap.xml"
GREEN_LIST = "https://www.greenncap.com/assessments/"
ADAC_PAGE = "https://www.adac.de/rund-ums-fahrzeug/unfall-schaden-panne/adac-pannenstatistik/"

_norm = lambda s: re.sub(r"[^a-z0-9]", "", str(s or "").lower())  # noqa: E731


# ---------- Euro NCAP ----------

EURO_URL = re.compile(r"https://www\.euroncap\.com/(?:en/)?assessments/([^/<\s]+)/([^/<\s]+)/(\d[0-9a-z]*)/")


def euro_urls(sitemap: str) -> list[str]:
    """Safety assessment pages (numeric ids) from the sitemap, oldest id first."""
    seen, out = set(), []
    for m in EURO_URL.finditer(sitemap):
        if m.group(0) not in seen:
            seen.add(m.group(0))
            out.append(m.group(0))
    return out


def _split_name(name: str, make_slug: str) -> tuple[str, str]:
    """'VW ID.7' with slug volkswagen -> ('VW', 'ID.7'); 'Mercedes-Benz GLC' -> ('Mercedes-Benz', 'GLC')."""
    words = name.split()
    aliases = {_norm(make_slug), _norm(make_slug.replace("+", " "))}
    if _norm(make_slug) == "volkswagen":
        aliases.add("vw")
    if _norm(make_slug).startswith("mercedes"):
        aliases |= {"mercedes", "mercedesbenz"}
    for n in range(min(3, len(words) - 1), 0, -1):
        if _norm(" ".join(words[:n])) in aliases:
            return " ".join(words[:n]), " ".join(words[n:])
    return make_slug.replace("+", " ").title(), name


def parse_euro(page: str, url: str) -> dict | None:
    m = EURO_URL.match(url)
    stars = re.search(r'\\?"safetyRatingStars\\?":\s*(\d)', page)
    year = re.search(r'\\?"ratingYear\\?":\s*(\d{4})', page)
    title = re.search(r"<title>\s*Euro NCAP\s*\|\s*([^<]+?)\s*</title>", page)
    if not (m and stars and year and title):
        return None
    name = html.unescape(title.group(1)).strip()
    # Newer titles add the rating: "AION UT 2026 Safety Rating – 5 stars".
    name = re.sub(r"\s+(?:\d{4}\s+)?Safety Rating\b.*$", "", name, flags=re.I).strip()
    make, model = _split_name(name, m.group(1))
    out = {"name": name, "make": make, "model": model, "stars": int(stars.group(1)), "year": int(year.group(1)), "url": url}
    child = parse_euro_child(page)
    if child:
        out["child"] = child
    return out


# ---------- Euro NCAP: child occupant facts ----------
# The page embeds its data in Next.js flight chunks (self.__next_f.push([1,"<js string>"])). Kept: the child
# occupant score in % (one of the four parts of the star rating up to the 2023-2025 protocol; the 2026
# protocol has no separate child score) and, per seat, whether ISOFIX, i-Size, an integrated child seat,
# the passenger airbag switch and child presence detection are standard, optional or not available.

_FLIGHT = re.compile(r'self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)')
_FITTED = {"fittedstandard": "standard", "standard": "standard", "optional": "optional", "fittedoptional": "optional",
           "notavailable": "none", "notfitted": "none"}
# seat names across protocols -> ours: front passenger, 2nd row outer seats, 2nd row centre, 3rd row, rear (2026)
_SEAT = {"frontPassenger": "front", "seat3": "front", "row2Outboard": "row2", "row2": "row2", "row2Centre": "row2_centre",
         "row3Outboard": "row3", "row3": "row3", "rearPassenger": "rear"}


def _flight_text(page: str) -> str:
    parts = []
    for m in _FLIGHT.finditer(page):
        try:
            parts.append(json.loads(m.group(1)))
        except ValueError:
            continue
    return "".join(parts)


def _object_at(text: str, key: str):
    m = re.search(r'"%s"\s*:\s*(?=\{)' % re.escape(key), text)
    if not m:
        return None
    try:
        return json.JSONDecoder().raw_decode(text, m.end())[0]
    except ValueError:
        return None


def _fit(v) -> str | None:
    return _FITTED.get(re.sub(r"[^a-z]", "", str(v or "").lower()))


def _seats(*maps) -> dict:
    """{seat: standard|optional|none}; the first source that names a seat wins, unknown and n/a seats are left out."""
    out: dict = {}
    for mp in maps:
        for k, v in (mp or {}).items():
            seat, fit = _SEAT.get(k), _fit(v)
            if seat and fit and seat not in out:
                out[seat] = fit
    return out


def _dig(obj, *path):
    for k in path:
        if not isinstance(obj, dict):
            return None
        obj = obj.get(k)
    return obj


def parse_euro_child(page: str) -> dict | None:
    text = _flight_text(page) or page
    data = _object_at(text, "assessmentData")
    if not isinstance(data, dict):
        return None
    car = data.get("carSafety") or {}
    cop = _dig(car, "safetyPerformance", "childOccupant") or {}
    feats = _dig(cop, "safetyFeatures", "features") or {}
    prot = _dig(car, "safetyEquipment", "childProtection") or {}
    eq26 = _dig(data, "additionalData", "safetyEquipment") or {}
    kid26 = _dig(eq26, "crashProtection", "childSafety") or {}
    occ26 = _dig(eq26, "safeDriving", "occupantMonitoring") or {}
    proto = re.search(r'"selectedOverview"\s*:\s*\{[^{}]*?"title"\s*:\s*"((?:19|20)\d\d(?:-(?:19|20)\d\d)?) Safety"', text)
    pct = cop.get("normalisedScore")
    child = {
        "protocol": proto.group(1) if proto else None,
        "occupant_pct": round(pct) if isinstance(pct, (int, float)) and cop.get("maxScore") else None,
        "isofix": _seats(feats.get("isofix"), prot.get("isofix")),
        "i_size": _seats(feats.get("iSize"), prot.get("iSize"), kid26.get("iSize")),
        "integrated_seat": _seats(feats.get("IntegratedCRS"), prot.get("integratedChildSeat"), kid26.get("integratedCRS")),
        "airbag_switch": _fit((prot.get("airbagCutOffSwitch") or {}).get("seat3")) or _fit(occ26.get("airbagCutoffSwitch")),
        "presence_detection": _presence(feats.get("childPresenceDetection"), prot.get("childPresenceDetection"), occ26.get("childPresenceDetection")),
    }
    if child["occupant_pct"] is None and not any(child[k] for k in ("isofix", "i_size", "presence_detection")):
        return None
    return child


def _presence(*vals) -> str | None:
    """Child presence detection is listed per seat (older pages) or once (2026): standard if any seat has it."""
    for v in vals:
        fits = [_fit(x) for x in (v.values() if isinstance(v, dict) else [v])]
        fits = [f for f in fits if f]
        for want in ("standard", "optional", "none"):
            if want in fits:
                return want
    return None


def latest_per_model(items: list[dict]) -> list[dict]:
    """Keep the newest rating of each make and model (a model tested again replaces the old result)."""
    best: dict[str, dict] = {}
    for it in items:
        k = _norm(it["make"]) + "|" + _norm(it["model"])
        if k not in best or (it["year"], it["url"]) > (best[k]["year"], best[k]["url"]):
            best[k] = it
    return sorted(best.values(), key=lambda x: (x["make"].lower(), x["model"].lower()))


# ---------- Green NCAP ----------

GREEN_URL = re.compile(r"https://www\.greenncap\.com/assessments/([a-z0-9-]+-(?:19|20)\d\d-\d+)/")


def green_urls(listing: str) -> list[str]:
    seen, out = set(), []
    for m in GREEN_URL.finditer(listing):
        if m.group(0) not in seen:
            seen.add(m.group(0))
            out.append(m.group(0))
    return out


def _fuel_guess(name: str) -> str:
    n = name.lower()
    if re.search(r"plug-in|phev|e-hybrid|ehybrid|\bphv\b", n):
        return "phev"
    if re.search(r"\belectric\b|\bkwh\b|\bev\b|e-tron|\bbev\b", n):
        return "electric"
    if re.search(r"\bpetrol\b", n) and "hybrid" not in n:
        return "petrol"
    if re.search(r"\btdi\b|diesel|\bdci\b|\bcrdi\b|bluehdi|\bhdi\b|\bd\b|\d{3}d\b|\bcdi\b|\btdci\b|\bmultijet\b", n):
        return "diesel"
    if re.search(r"hybrid", n):
        return "hybrid"
    return "petrol"


def parse_green(page: str, url: str) -> dict | None:
    """Stars (halves too) and year of one tested version. Newer titles read "<version> Green NCAP rating
    2026 – 4½ stars", older ones "Green NCAP assessment of the <version>, 2021" with the stars only in
    the page's star list."""
    title = re.search(r"<title>\s*([^<]+?)\s*</title>", page)
    if not title:
        return None
    t = html.unescape(title.group(1))
    new = re.match(r"(.+?)\s+Green NCAP rating\s+((?:19|20)\d\d)\s*[–-]\s*(\d)(½)?\s+stars?", t)
    old = re.match(r"Green NCAP assessment of the\s+(.+?),\s*((?:19|20)\d\d)$", t)
    if new:
        name, year, stars = new.group(1), int(new.group(2)), int(new.group(3)) + (0.5 if new.group(4) else 0)
    elif old:
        ul = re.search(r'<ul class="star-rating">(.*?)</ul>', page, re.S)
        if not ul:
            return None
        stars = len(re.findall(r'class="star full"', ul.group(1))) + 0.5 * len(re.findall(r'class="star half"', ul.group(1)))
        name, year = old.group(1), int(old.group(2))
    else:
        return None
    name = name.strip()
    return {"name": name, "fuel": _fuel_guess(name), "stars": stars, "year": year, "url": url}


# ---------- ADAC Pannenstatistik ----------

ADAC_PDF = re.compile(r'href="(https://[^"]+?[Pp]annenstatistik[^"]*?\.pdf)[^"]*"')


def adac_reports(page: str) -> list[tuple[int, str]]:
    """(report year, PDF url) for every yearly report linked from the overview page, newest first."""
    out = {}
    for u in ADAC_PDF.findall(page):
        y = re.search(r"(20\d\d)", u.rsplit("/", 1)[-1])
        if y:
            out.setdefault(int(y.group(1)), html.unescape(u))
    return sorted(out.items(), reverse=True)


NUM = re.compile(r"^\d{1,3}(?:,\d)?$")


def _rows(words):
    rows: dict[int, list] = {}
    for w in words:
        key = round(w["top"] / 3)
        rows.setdefault(key, []).append(w)
    return [sorted(rows[k], key=lambda w: w["x0"]) for k in sorted(rows)]


def parse_adac(pdf: bytes) -> dict:
    """Breakdowns per 1,000 cars by model series and year of first registration.

    Each table is a run of rows "<model series>  <mileage>  <rate> <rate> ...", under a header with
    the eight registration years. Empty cells are left out of the text, so the values of a table are
    placed in columns by their horizontal position, using the rows of that table where every cell is
    filled (else by clustering the positions).
    """
    import pdfplumber

    models, years, calendar_year = [], None, None
    with pdfplumber.open(io.BytesIO(pdf)) as doc:
        block: list[tuple[str, list]] = []

        def flush():
            nonlocal block
            if block and years:
                models.extend(_place(block, years))
            block = []

        for page in doc.pages:
            for ws in _rows(page.extract_words()):
                text = " ".join(w["text"] for w in ws)
                cal = re.search(r"Pannen im Kalenderjahr (20\d\d)", text)
                if cal:
                    calendar_year = int(cal.group(1))
                ys = [int(w["text"]) for w in ws if re.fullmatch(r"20\d\d", w["text"])]
                if len(ys) >= 6 and "Pannen" not in text:
                    flush()
                    years = ys
                    continue
                # name = leading words up to the first big gap; then the numbers
                name_ws, rest = [ws[0]], ws[1:]
                while rest and rest[0]["x0"] - name_ws[-1]["x1"] < 25:
                    name_ws.append(rest.pop(0))
                nums = [w for w in rest if NUM.match(w["text"])]
                if len(nums) >= 2 and len(nums) == len(rest) and re.search(r"[A-Za-z]", name_ws[0]["text"]):
                    block.append((" ".join(w["text"] for w in name_ws), nums))
                else:
                    flush()
            flush()
    return {"calendar_year": calendar_year, "years": years, "models": models}


def _place(block, years):
    n = len(years)
    centers = lambda ws: [(w["x0"] + w["x1"]) / 2 for w in ws]  # noqa: E731
    full = [centers(ws) for _, ws in block if len(ws) == n + 1]
    if full:
        cols = [sum(c[i] for c in full) / len(full) for i in range(n + 1)]
    else:  # cluster every value position of the block
        xs = sorted(x for _, ws in block for x in centers(ws))
        groups = [[xs[0]]]
        for x in xs[1:]:
            (groups[-1].append(x) if x - groups[-1][-1] < 10 else groups.append([x]))
        cols = [sum(g) / len(g) for g in groups]
        if len(cols) != n + 1:
            return []
    out = []
    for name, ws in block:
        rates = {}
        for w, x in zip(ws[1:], centers(ws[1:])):  # ws[0] is the mileage column
            i = min(range(1, n + 1), key=lambda j: abs(cols[j] - x))
            if abs(cols[i] - x) < 12:
                rates[str(years[i - 1])] = float(w["text"].replace(",", "."))
        if rates:
            out.append({"name": name, "rates": rates})
    return out
