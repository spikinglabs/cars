"""Write the shared head tags, header and footer into every page under site/public.

The site is in the languages listed in LANGS below: English at /, German under /de/, Simplified
Chinese under /zh/, each page at the same path in every language. Each page marks the spots with
<!-- chrome:head --><!-- /chrome:head -->, <!-- chrome:header --><!-- /chrome:header --> and
<!-- chrome:footer --><!-- /chrome:footer -->. The parts come from head.html, header.html and
footer.html (English), and header.<lang>.html and footer.<lang>.html for the other languages. In them:

    {{lang}}             the page's lang attribute (en, de, zh-Hans)
    {{en}} {{de}} {{zh}} the URL of this page in that language
    {{hreflang}}         <link rel="alternate"> tags for every language
    {{langswitch}}       the language menu in the header
    {{manifest}}         the web app manifest of the page's language
    {{regions}}          the selectable regions from public/regions.json, as JSON for site.js
    {{country_options}}  <option>s for the country selector at the bottom of the page

To add a page: write it in English, copy it to /de/<slug>/ and /zh/<slug>/, translate the text, add
it to the nav parts of every language, and run this script. Page scripts are shared by all languages
and pick their words with document.documentElement.lang (see site/I18N.md).

Links to the site's own .css and .js files get ?v=<content hash>, so a browser that kept an old copy
(the host lets browsers cache assets for hours) loads the new one as soon as a page changes it.

The nav link for the page's own section gets aria-current="page". Every page must exist in every
language. Run after changing any part:

It also writes public/sitemap.xml (every page with its language twins), which robots.txt points to.

    python site/chrome/apply.py          # rewrite pages
    python site/chrome/apply.py --check  # exit 1 if any page is out of date or has no twin (CI)
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
PUBLIC = HERE.parent / "public"
PARTS = ("head", "header", "footer")
SITE = "https://cars.allo.land"

# (code, URL prefix, lang attribute and hreflang, name in its own language, short label)
LANGS = (
    ("en", "", "en", "English", "EN"),
    ("de", "/de", "de", "Deutsch", "DE"),
    ("zh", "/zh", "zh-Hans", "简体中文", "中文"),
)
CODES = tuple(c for c, *_ in LANGS)
PREFIX = {c: p for c, p, *_ in LANGS}
HTML_LANG = {c: h for c, _, h, *_ in LANGS}


ASSET = re.compile(r'((?:href|src)=")(/[^"?#]+\.(?:css|js))(?:\?v=[0-9a-f]*)?(")')


def version_assets(html: str) -> str:
    """Add ?v=<first 10 hex of sha256> to every link to a local .css or .js file."""
    def sub(m: re.Match) -> str:
        file = PUBLIC / m.group(2).lstrip("/")
        if not file.is_file():
            raise SystemExit(f"{m.group(2)}: linked from a page but missing under site/public")
        return f"{m.group(1)}{m.group(2)}?v={hashlib.sha256(file.read_bytes()).hexdigest()[:10]}{m.group(3)}"
    return ASSET.sub(sub, html)


REGIONS = PUBLIC / "regions.json"


def selectable_regions() -> tuple[str, list[dict]]:
    """(default code, regions people can pick) from public/regions.json, the one list of regions."""
    data = json.loads(REGIONS.read_text(encoding="utf-8"))
    picks = [r for r in data["regions"] if r.get("selectable")]
    codes = [r["code"] for r in picks]
    if data["default"] not in codes:
        raise SystemExit(f"regions.json: default {data['default']!r} is not a selectable region")
    for code in codes:
        if not re.fullmatch(r"[a-z]{2}(-[a-z0-9]{1,3})?", code):
            raise SystemExit(f"regions.json: {code!r} is not a lowercase ISO 3166 code")
    return data["default"], picks


def regions_json() -> str:
    default, picks = selectable_regions()
    slim = [{"code": r["code"], "name": r["name"], "currency": r["currency"], "locale": r.get("locale")} for r in picks]
    return json.dumps({"default": default, "regions": slim}, ensure_ascii=False, separators=(",", ":"))


def country_options(lang: str) -> str:
    default, picks = selectable_regions()
    picks = sorted(picks, key=lambda r: r["name"].get(lang, r["name"]["en"]))
    return "".join(
        f'<option value="{r["code"]}"{" selected" if r["code"] == default else ""}>{r["name"].get(lang, r["name"]["en"])}</option>'
        for r in picks)


def url_of(page: Path) -> str:
    rel = str(page.relative_to(PUBLIC).parent).replace("\\", "/").strip(".")
    return re.sub(r"/+", "/", "/" + rel + "/")


def lang_of(url: str) -> str:
    """Language code (en, de, zh) of a page URL."""
    for code, prefix, *_ in LANGS:
        if prefix and (url == prefix + "/" or url.startswith(prefix + "/")):
            return code
    return "en"


def twins(url: str) -> dict[str, str]:
    """{language code: URL} of the same page in every language."""
    base = url[len(PREFIX[lang_of(url)]):] or "/"
    return {code: PREFIX[code] + base for code in CODES}


def part_file(part: str, lang: str) -> Path:
    localized = HERE / f"{part}.{lang}.html"
    return localized if lang != "en" and localized.exists() else HERE / f"{part}.html"


def hreflang_tags(urls: dict[str, str]) -> str:
    tags = [f'<link rel="alternate" hreflang="{HTML_LANG[c]}" href="{SITE}{urls[c]}">' for c in CODES]
    tags.append(f'<link rel="alternate" hreflang="x-default" href="{SITE}{urls["en"]}">')
    return "\n".join(tags)


GLOBE = ('<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 '
         '2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/></svg>')
LANG_LABEL = {"en": "Language", "de": "Sprache", "zh": "语言"}


def lang_switch(lang: str, urls: dict[str, str]) -> str:
    """The header language menu: a <details> whose summary shows the current language."""
    short = {c: s for c, *_, s in LANGS}
    items = []
    for code, _, html_lang, name, _s in LANGS:
        cur = ' aria-current="true"' if code == lang else ""
        items.append(f'<a class="ac-lang" href="{urls[code]}" hreflang="{html_lang}" lang="{html_lang}" data-lang="{code}"{cur}>{name}</a>')
    return (f'<details class="ac-langmenu" data-langmenu><summary aria-label="{LANG_LABEL[lang]}" title="{LANG_LABEL[lang]}">'
            f'{GLOBE}<span>{short[lang]}</span></summary><div class="ac-langmenu__list">{"".join(items)}</div></details>')


def render(part: str, url: str) -> str:
    lang = lang_of(url)
    urls = twins(url)
    html = part_file(part, lang).read_text(encoding="utf-8").strip()
    html = (html.replace("{{lang}}", HTML_LANG[lang]).replace("{{site}}", SITE)
            .replace("{{hreflang}}", hreflang_tags(urls)).replace("{{langswitch}}", lang_switch(lang, urls))
            .replace("{{regions}}", regions_json()).replace("{{country_options}}", country_options(lang))
            .replace("{{manifest}}", PREFIX[lang] + "/manifest.webmanifest"))
    for code in CODES:
        html = html.replace("{{" + code + "}}", urls[code])
    if part in ("header", "footer"):
        segs = [p for p in url.split("/") if p]
        if lang != "en":
            segs = segs[1:]
        home = PREFIX[lang] + "/"
        cur = home if not segs else f"{home}{segs[0]}/"
        # mark the current section in the top nav and the bottom tabs
        html, on_tab = re.subn(rf'(<a href="{re.escape(cur)}")(\s+data-tab)', r'\1 aria-current="page"\2', html)
        # pages without a tab of their own live in the "More" sheet: mark them there and light up "More"
        html, in_sheet = re.subn(rf'(<a href="{re.escape(cur)}")(\s+data-more)', r'\1 aria-current="page"\2', html)
        if in_sheet and not on_tab:
            html = html.replace("data-more-btn>", "data-more-btn data-current>", 1)
        if part == "header":
            html = html.replace(f'<a href="{cur}">', f'<a href="{cur}" aria-current="page">', 1)
    if "{{" in html:
        raise SystemExit(f"{part}.{lang}: unknown placeholder {re.search(r'{{[^}]*}}', html).group(0)}")
    return html


def apply(page: Path) -> tuple[str, str]:
    url = url_of(page)
    old = page.read_text(encoding="utf-8")
    new = old
    for part in PARTS:
        pat = re.compile(rf"(<!-- chrome:{part} -->)(.*?)(<!-- /chrome:{part} -->)", re.S)
        if not pat.search(new):
            raise SystemExit(f"{page}: missing <!-- chrome:{part} --> markers")
        new = pat.sub(lambda m: m.group(1) + "\n" + render(part, url) + "\n" + m.group(3), new, count=1)
    new = version_assets(new)
    want = f'<html lang="{HTML_LANG[lang_of(url)]}"'
    if want not in new:
        raise SystemExit(f"{page}: expected {want}>")
    return old, new


def pages() -> list[Path]:
    # 404.html and similar files at the root are not part of the translated site.
    return sorted(p for p in PUBLIC.rglob("index.html"))


SITEMAP = PUBLIC / "sitemap.xml"


def sitemap() -> str:
    """sitemap.xml: every page in every language, each with its language twins (hreflang alternates)."""
    out = ['<?xml version="1.0" encoding="UTF-8"?>',
           '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">']
    for url in sorted({url_of(p) for p in pages()}, key=lambda u: (u.count("/"), u)):
        urls = twins(url)
        out.append(f"  <url><loc>{SITE}{url}</loc>")
        for c in CODES:
            out.append(f'    <xhtml:link rel="alternate" hreflang="{HTML_LANG[c]}" href="{SITE}{urls[c]}"/>')
        out.append(f'    <xhtml:link rel="alternate" hreflang="x-default" href="{SITE}{urls["en"]}"/>')
        out.append("  </url>")
    out.append("</urlset>")
    return "\n".join(out) + "\n"


def main(argv: list[str]) -> int:
    check = "--check" in argv
    stale, lonely = [], []
    want_map = sitemap()
    if not SITEMAP.exists() or SITEMAP.read_text(encoding="utf-8") != want_map:
        stale.append(SITEMAP.relative_to(PUBLIC))
        if not check:
            SITEMAP.write_text(want_map, encoding="utf-8")
    urls = {url_of(p) for p in pages()}
    for page in pages():
        missing = [u for u in twins(url_of(page)).values() if u not in urls]
        if missing:
            lonely.append(f"{page.relative_to(PUBLIC)} (no {', '.join(missing)})")
        old, new = apply(page)
        if old != new:
            stale.append(page.relative_to(PUBLIC))
            if not check:
                page.write_text(new, encoding="utf-8")
    if lonely:
        print("Pages missing in a language:", *lonely, sep="\n  ")
        return 1
    if check and stale:
        print("Shared parts out of date, run python site/chrome/apply.py:", *stale, sep="\n  ")
        return 1
    print(("Checked" if check else "Updated"), len(stale) if not check else "all", "pages")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
