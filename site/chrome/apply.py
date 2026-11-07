"""Write the shared head tags, header and footer into every page under site/public.

English pages live at /, German pages at the same path under /de/. Each page marks the spots with
<!-- chrome:head --><!-- /chrome:head -->, <!-- chrome:header --><!-- /chrome:header --> and
<!-- chrome:footer --><!-- /chrome:footer -->. The parts come from head.html, header.html and
footer.html (English) and header.de.html and footer.de.html (German). In them:

    {{lang}}   en or de
    {{alt}}    the same page in the other language
    {{en}}     the English URL of this page, {{de}} the German one
    {{regions}}          the selectable regions from public/regions.json, as JSON for site.js
    {{country_options}}  <option>s for the country selector at the bottom of the page

Links to the site's own .css and .js files get ?v=<content hash>, so a browser that kept an old copy
(the host lets browsers cache assets for hours) loads the new one as soon as a page changes it.

The nav link for the page's own section gets aria-current="page". Every English page needs a German
twin and the other way round. Run after changing any part:

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
    return "de" if url == "/de/" or url.startswith("/de/") else "en"


def twins(url: str) -> tuple[str, str]:
    """(English URL, German URL) of a page."""
    if lang_of(url) == "de":
        return url[3:] or "/", url
    return url, "/de" + url


def part_file(part: str, lang: str) -> Path:
    localized = HERE / f"{part}.{lang}.html"
    return localized if lang != "en" and localized.exists() else HERE / f"{part}.html"


def render(part: str, url: str) -> str:
    lang = lang_of(url)
    en, de = twins(url)
    html = part_file(part, lang).read_text(encoding="utf-8").strip()
    html = (html.replace("{{lang}}", lang).replace("{{alt}}", de if lang == "en" else en)
            .replace("{{en}}", en).replace("{{de}}", de).replace("{{site}}", SITE)
            .replace("{{regions}}", regions_json()).replace("{{country_options}}", country_options(lang))
            .replace("{{manifest}}", "/de/manifest.webmanifest" if lang == "de" else "/manifest.webmanifest"))
    if part in ("header", "footer"):
        segs = [p for p in url.split("/") if p]
        if lang == "de":
            segs = segs[1:]
        home = "/de/" if lang == "de" else "/"
        cur = home if not segs else f"{home}{segs[0]}/"
        # mark the current section in the top nav and the bottom tabs
        html, on_tab = re.subn(rf'(<a href="{re.escape(cur)}")(\s+data-tab)', r'\1 aria-current="page"\2', html)
        # pages without a tab of their own live in the "More" sheet: mark them there and light up "More"
        html, in_sheet = re.subn(rf'(<a href="{re.escape(cur)}")(\s+data-more)', r'\1 aria-current="page"\2', html)
        if in_sheet and not on_tab:
            html = html.replace("data-more-btn>", "data-more-btn data-current>", 1)
        if part == "header":
            html = html.replace(f'<a href="{cur}">', f'<a href="{cur}" aria-current="page">', 1)
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
    want = f'<html lang="{lang_of(url)}"'
    if want not in new:
        raise SystemExit(f"{page}: expected {want}>")
    return old, new


def pages() -> list[Path]:
    # 404.html and similar files at the root are not part of the bilingual site.
    return sorted(p for p in PUBLIC.rglob("index.html"))


def main(argv: list[str]) -> int:
    check = "--check" in argv
    stale, lonely = [], []
    urls = {url_of(p) for p in pages()}
    for page in pages():
        en, de = twins(url_of(page))
        if en not in urls or de not in urls:
            lonely.append(page.relative_to(PUBLIC))
        old, new = apply(page)
        if old != new:
            stale.append(page.relative_to(PUBLIC))
            if not check:
                page.write_text(new, encoding="utf-8")
    if lonely:
        print("Pages without an English or German twin:", *lonely, sep="\n  ")
        return 1
    if check and stale:
        print("Shared parts out of date, run python site/chrome/apply.py:", *stale, sep="\n  ")
        return 1
    print(("Checked" if check else "Updated"), len(stale) if not check else "all", "pages")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
