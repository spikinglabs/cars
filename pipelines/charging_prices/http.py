"""Small HTTP helpers (stdlib only) with retries and gzip support."""

from __future__ import annotations

import gzip
import json
import time
import urllib.error
import urllib.request

USER_AGENT = "spikinglabs-cars-collector/0.1 (+https://github.com/spikinglabs/cars)"


def get_bytes(url: str, *, timeout: float = 120, retries: int = 4, user_agent: str = USER_AGENT) -> bytes:
    """GET a URL and return the decoded body, retrying on network errors and 5xx/429."""
    delay = 2.0
    for attempt in range(retries + 1):
        req = urllib.request.Request(
            url, headers={"User-Agent": user_agent, "Accept-Encoding": "gzip"}
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                body = resp.read()
                if resp.headers.get("Content-Encoding") == "gzip":
                    body = gzip.decompress(body)
                return body
        except urllib.error.HTTPError as exc:
            if exc.code not in (429, 500, 502, 503, 504) or attempt == retries:
                raise
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            if attempt == retries:
                raise
        time.sleep(delay)
        delay *= 2
    raise RuntimeError("unreachable")


def get_json(url: str, **kwargs) -> dict:
    return json.loads(get_bytes(url, **kwargs))
