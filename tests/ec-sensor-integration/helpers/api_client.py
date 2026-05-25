from __future__ import annotations

import json
import urllib.parse
import urllib.request
from typing import Any


def fetch_json(base_url: str, path: str, query: dict[str, Any] | None = None) -> Any:
    query = query or {}
    url = f"{base_url.rstrip('/')}/{path.lstrip('/')}"
    if query:
        url = f"{url}?{urllib.parse.urlencode(query)}"
    with urllib.request.urlopen(url, timeout=30) as response:
        raw = response.read().decode("utf-8")
    return json.loads(raw)
