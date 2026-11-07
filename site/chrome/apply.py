"""Write the shared header and footer into every page under site/public.

Each page marks the spots with <!-- chrome:header --><!-- /chrome:header --> and
<!-- chrome:footer --><!-- /chrome:footer -->. The nav link for the page's own
section gets aria-current="page". Run after changing header.html or footer.html:

    python site/chrome/apply.py          # rewrite pages
    python site/chrome/apply.py --check  # exit 1 if any page is out of date (CI)
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
PUBLIC = HERE.parent / "public"
PARTS = ("header", "footer")


def section(url_path: str) -> str:
    """The nav href that counts as 'current' for a page path."""
    parts = [p for p in url_path.split("/") if p]
    return "/" if not parts else f"/{parts[0]}/"


def render(part: str, url_path: str) -> str:
    html = (HERE / f"{part}.html").read_text(encoding="utf-8").strip()
    if part == "header":
        cur = section(url_path)
        html = html.replace(f'<a href="{cur}">', f'<a href="{cur}" aria-current="page">', 1)
    return html


def apply(page: Path) -> tuple[str, str]:
    url_path = "/" + str(page.relative_to(PUBLIC).parent).replace("\\", "/").strip(".") + "/"
    url_path = re.sub(r"/+", "/", url_path)
    old = page.read_text(encoding="utf-8")
    new = old
    for part in PARTS:
        pat = re.compile(rf"(<!-- chrome:{part} -->)(.*?)(<!-- /chrome:{part} -->)", re.S)
        if not pat.search(new):
            raise SystemExit(f"{page}: missing <!-- chrome:{part} --> markers")
        new = pat.sub(lambda m: m.group(1) + "\n" + render(part, url_path) + "\n" + m.group(3), new, count=1)
    return old, new


def main(argv: list[str]) -> int:
    check = "--check" in argv
    stale = []
    for page in sorted(PUBLIC.rglob("*.html")):
        old, new = apply(page)
        if old != new:
            stale.append(page.relative_to(PUBLIC))
            if not check:
                page.write_text(new, encoding="utf-8")
    if check and stale:
        print("Header/footer out of date, run python site/chrome/apply.py:", *stale, sep="\n  ")
        return 1
    print(("Checked" if check else "Updated"), len(stale) if not check else "all", "pages")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
