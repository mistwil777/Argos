"""
Web search service — no API keys required.
Uses DuckDuckGo HTML scraping as primary, Bing as fallback.
"""
import asyncio
import logging
import random
import re
import urllib.parse
from typing import Optional

logger = logging.getLogger(__name__)

_USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0",
]


def _parse_duckduckgo_html(html: str) -> list[dict]:
    """Parse DuckDuckGo HTML search results page."""
    from html.parser import HTMLParser

    results = []

    class _DDGParser(HTMLParser):
        def __init__(self):
            super().__init__()
            self._in_result = False
            self._in_title = False
            self._in_snippet = False
            self._current: dict = {}
            self._depth = 0

        def handle_starttag(self, tag, attrs):
            attrs_dict = dict(attrs)
            cls = attrs_dict.get("class", "")
            href = attrs_dict.get("href", "")

            if "result__body" in cls or "result__a" in cls:
                self._in_result = True
                self._current = {}

            if self._in_result and tag == "a" and "result__a" in cls:
                self._in_title = True
                # DuckDuckGo wraps URLs — decode uddg param
                if "uddg=" in href:
                    try:
                        decoded = urllib.parse.unquote(href.split("uddg=")[1].split("&")[0])
                        self._current["url"] = decoded
                    except Exception:
                        self._current["url"] = href
                elif href.startswith("http"):
                    self._current["url"] = href

            if self._in_result and "result__snippet" in cls:
                self._in_snippet = True

        def handle_endtag(self, tag):
            if self._in_title and tag == "a":
                self._in_title = False
            if self._in_snippet and tag == "a":
                self._in_snippet = False
                if self._current.get("url") and self._current.get("title"):
                    results.append(dict(self._current))
                self._current = {}
                self._in_result = False

        def handle_data(self, data):
            text = data.strip()
            if not text:
                return
            if self._in_title:
                self._current["title"] = self._current.get("title", "") + text
            if self._in_snippet:
                self._current["snippet"] = self._current.get("snippet", "") + text

    parser = _DDGParser()
    parser.feed(html)
    return results


def _parse_duckduckgo_lite(html: str) -> list[dict]:
    """Parse DuckDuckGo lite HTML (simpler, more stable)."""
    results = []
    # Lite format: <a class="result-link" href="...">title</a> + <td class="result-snippet">snippet</td>
    link_pattern = re.compile(r'<a[^>]+class="result-link"[^>]+href="([^"]+)"[^>]*>([^<]+)</a>', re.IGNORECASE)
    snippet_pattern = re.compile(r'class="result-snippet"[^>]*>(.*?)</td>', re.IGNORECASE | re.DOTALL)

    links = link_pattern.findall(html)
    snippets = [re.sub(r'<[^>]+>', '', s).strip() for s in snippet_pattern.findall(html)]

    for i, (url, title) in enumerate(links):
        results.append({
            "url": url,
            "title": title.strip(),
            "snippet": snippets[i] if i < len(snippets) else "",
        })
    return results


async def search_duckduckgo(query: str, max_results: int = 10) -> list[dict]:
    """Search DuckDuckGo without API key."""
    import requests
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

    # Use lite version — more stable and lighter
    encoded = urllib.parse.quote_plus(query)
    url = f"https://lite.duckduckgo.com/lite/?q={encoded}"
    ua = random.choice(_USER_AGENTS)

    try:
        resp = requests.get(
            url,
            headers={
                "User-Agent": ua,
                "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
                "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8",
                "Referer": "https://duckduckgo.com/",
            },
            timeout=15,
            verify=False,
        )
        resp.encoding = "utf-8"
        results = _parse_duckduckgo_lite(resp.text)
        return results[:max_results]
    except Exception as e:
        logger.error(f"DuckDuckGo search failed: {e}")
        return []


async def search_bing(query: str, max_results: int = 10) -> list[dict]:
    """Search Bing as fallback."""
    import requests
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

    encoded = urllib.parse.quote_plus(query)
    url = f"https://www.bing.com/search?q={encoded}&count={max_results}"
    ua = random.choice(_USER_AGENTS)

    try:
        resp = requests.get(
            url,
            headers={
                "User-Agent": ua,
                "Accept": "text/html,*/*;q=0.8",
                "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8",
            },
            timeout=15,
            verify=False,
        )
        resp.encoding = "utf-8"

        # Extract results from Bing HTML
        results = []
        # Bing wraps URLs via /ck/a? redirects — extract real URL from h2/h3 <a> tags
        # Try to find direct https URLs first, then decode bing redirect URLs
        block_pattern = re.compile(
            r'<h2[^>]*>\s*<a\s[^>]*href="([^"]+)"[^>]*>(.*?)</a>\s*</h2>',
            re.IGNORECASE | re.DOTALL,
        )
        snippet_pattern = re.compile(r'<p\b[^>]*>(.*?)</p>', re.IGNORECASE | re.DOTALL)
        text = resp.text

        for m in block_pattern.finditer(text):
            raw_url = m.group(1)
            title = re.sub(r'<[^>]+>', '', m.group(2)).strip()
            if not title:
                continue
            # Decode Bing redirect URLs
            real_url = raw_url
            if "bing.com/ck/a" in raw_url or raw_url.startswith("/ck/"):
                # Try to extract URL from the u= parameter
                u_match = re.search(r'[?&]u=([^&]+)', raw_url)
                if u_match:
                    try:
                        decoded = urllib.parse.unquote(u_match.group(1))
                        # Bing base64-ish encoding: strip leading 'a1' prefix
                        if decoded.startswith("a1"):
                            decoded = decoded[2:]
                        import base64
                        real_url = base64.b64decode(decoded + "==").decode("utf-8", errors="ignore").strip()
                        if not real_url.startswith("http"):
                            real_url = None
                    except Exception:
                        real_url = None
                else:
                    real_url = None
            if not real_url or not real_url.startswith("http"):
                continue
            # Skip Bing internal pages
            if "bing.com" in real_url:
                continue
            # Get snippet from nearby <p>
            pos = m.end()
            snippet = ""
            snip_m = snippet_pattern.search(text, pos, pos + 800)
            if snip_m:
                snippet = re.sub(r'<[^>]+>', '', snip_m.group(1)).strip()[:300]
            results.append({"url": real_url, "title": title, "snippet": snippet})
            if len(results) >= max_results:
                break
        return results
    except Exception as e:
        logger.error(f"Bing search failed: {e}")
        return []


async def search(query: str, engine: str = "duckduckgo", max_results: int = 10) -> dict:
    """
    Main entry point for web search.
    Returns structured results with fallback logic.
    """
    import time
    start = time.monotonic()

    results = []
    used_engine = engine

    if engine in ("duckduckgo", "auto"):
        results = await search_duckduckgo(query, max_results)
        used_engine = "duckduckgo"

    # Fallback to Bing if DDG returns nothing
    if not results and engine in ("bing", "auto"):
        results = await search_bing(query, max_results)
        used_engine = "bing"

    duration_ms = int((time.monotonic() - start) * 1000)

    return {
        "query": query,
        "engine": used_engine,
        "results": results,
        "results_count": len(results),
        "duration_ms": duration_ms,
        "error": None if results else "No results found",
    }


async def search_with_searxng(
    query: str,
    max_results: int = 15,
    language: str = "auto",
    searxng_url: str = "http://searxng:8080",
) -> list[dict]:
    """
    Search via local SearXNG instance (aggregates Google, Bing, DuckDuckGo, ArXiv...).
    Returns real URLs with titles and snippets — no hallucination, no API key.
    Falls back to empty list if SearXNG is unavailable.
    """
    import time
    import urllib.parse
    import requests as _req
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

    params = {
        "q": query,
        "format": "json",
        "language": language,
        "pageno": 1,
    }
    url = f"{searxng_url}/search?{urllib.parse.urlencode(params)}"

    try:
        start = time.monotonic()
        resp = _req.get(url, timeout=15, verify=False,
                        headers={"User-Agent": "Argos/1.0 (internal)"})
        duration_ms = int((time.monotonic() - start) * 1000)

        if resp.status_code != 200:
            logger.warning(f"SearXNG returned HTTP {resp.status_code}")
            return []

        data = resp.json()
        results = []
        for r in data.get("results", []):
            u = r.get("url", "").strip()
            if not u or not u.startswith("http"):
                continue
            results.append({
                "url": u,
                "title": r.get("title", ""),
                "content": r.get("content", ""),
                "engine": r.get("engine", "searxng"),
            })
            if len(results) >= max_results:
                break

        logger.info(f"SearXNG: {len(results)} results for '{query}' in {duration_ms}ms "
                    f"(engines: {list({r['engine'] for r in results})})")
        return results

    except Exception as e:
        logger.warning(f"SearXNG unavailable ({searxng_url}): {e}")
        return []
