"""Bundesnetzagentur Ladesäulenregister (official charge point register).

Published as CSV/XLSX files a few times a year, licence CC BY 4.0
(attribution: "Bundesnetzagentur.de"). No prices, but it is the reference list
of public charge points. We archive every file the download page links to.
"""

from __future__ import annotations

import html
import re
import urllib.parse

from .http import get_bytes

DOWNLOAD_PAGE = (
    "https://www.bundesnetzagentur.de/DE/Fachthemen/ElektrizitaetundGas/"
    "E-Mobilitaet/DownloadundKontakt.html"
)

_LINK_RE = re.compile(r'href="([^"]*Ladesaeulenregister[^"]*\.(?:csv|xlsx))"', re.IGNORECASE)


def find_register_links(page_html: str, base_url: str = DOWNLOAD_PAGE) -> list[str]:
    links = []
    for raw in _LINK_RE.findall(page_html):
        url = urllib.parse.urljoin(base_url, html.unescape(raw))
        if url not in links:
            links.append(url)
    return links


def filename(url: str) -> str:
    return urllib.parse.urlparse(url).path.rsplit("/", 1)[-1]


def list_register_files() -> list[str]:
    return find_register_links(get_bytes(DOWNLOAD_PAGE).decode("utf-8", "replace"))
