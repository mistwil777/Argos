"""
Headless web browser service using Playwright with stealth mode.
Renders JS-heavy pages and extracts structured content.
"""
import asyncio
import logging
import random
import re
from typing import Optional
from html.parser import HTMLParser

logger = logging.getLogger(__name__)

# Pool of realistic browser user-agents
_USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:124.0) Gecko/20100101 Firefox/124.0",
]

# Nitter public instances for X/Twitter
_NITTER_INSTANCES = [
    "https://nitter.net",
    "https://nitter.privacydev.net",
    "https://nitter.poast.org",
]


class _TextExtractor(HTMLParser):
    """Lightweight HTML → plain text extractor."""

    _SKIP = {"script", "style", "nav", "header", "footer", "aside", "iframe", "noscript"}
    _BLOCK = {"p", "div", "li", "h1", "h2", "h3", "h4", "h5", "h6", "article", "section", "blockquote", "td", "tr"}

    def __init__(self):
        super().__init__()
        self._depth_skip = 0
        self._parts: list[str] = []
        self._links: list[str] = []
        self.title: str = ""
        self._in_title = False
        self._title_done = False

    def handle_starttag(self, tag, attrs):
        if self._depth_skip:
            self._depth_skip += 1
            return
        if tag in self._SKIP:
            self._depth_skip = 1
            return
        if tag == "title" and not self._title_done:
            self._in_title = True
        if tag in self._BLOCK:
            self._parts.append("\n")
        if tag == "a":
            href = dict(attrs).get("href", "")
            if href and href.startswith("http"):
                self._links.append(href)

    def handle_endtag(self, tag):
        if self._depth_skip:
            self._depth_skip -= 1
            return
        if tag == "title":
            self._in_title = False
            self._title_done = True

    def handle_data(self, data):
        if self._depth_skip:
            return
        text = data.strip()
        if not text:
            return
        if self._in_title:
            self.title += text
        else:
            self._parts.append(text)

    @property
    def text(self) -> str:
        raw = " ".join(self._parts)
        return re.sub(r"\s{2,}", " ", raw).strip()


def _rewrite_twitter_url(url: str) -> Optional[str]:
    """Rewrite x.com / twitter.com URLs to a Nitter instance."""
    for domain in ("https://x.com/", "https://twitter.com/"):
        if url.startswith(domain):
            path = url[len(domain):]
            instance = random.choice(_NITTER_INSTANCES)
            return f"{instance}/{path}"
    return None


async def _human_delay(min_s: float = 0.5, max_s: float = 2.5):
    await asyncio.sleep(random.uniform(min_s, max_s))


async def browse_with_playwright(url: str, timeout_ms: int = 30000) -> dict:
    """
    Fetch a URL using Playwright with stealth settings.
    Returns structured content dict.
    """
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        logger.warning("Playwright not installed — falling back to requests")
        return await browse_with_requests(url)

    # Rewrite X/Twitter to Nitter
    nitter_url = _rewrite_twitter_url(url)
    fetch_url = nitter_url or url
    ua = random.choice(_USER_AGENTS)

    try:
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(
                headless=True,
                args=[
                    "--no-sandbox",
                    "--disable-blink-features=AutomationControlled",
                    "--disable-infobars",
                ],
            )
            ctx = await browser.new_context(
                user_agent=ua,
                viewport={"width": random.randint(1280, 1920), "height": random.randint(800, 1080)},
                locale="fr-FR,fr;q=0.9,en-US;q=0.8",
                timezone_id="Europe/Paris",
                java_script_enabled=True,
            )
            # Mask automation fingerprint
            await ctx.add_init_script("""
                Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
                Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
            """)
            page = await ctx.new_page()

            # Human-like delay before navigation
            await _human_delay(0.3, 1.0)

            response = await page.goto(fetch_url, wait_until="domcontentloaded", timeout=timeout_ms)
            status_code = response.status if response else 0

            # Wait for main content
            await _human_delay(1.0, 2.5)

            html = await page.content()
            title = await page.title()
            final_url = page.url

            await browser.close()

        extracted_title, content_text, links = _extract_content_from_html(html)
        if not title:
            title = extracted_title

        return {
            "url": url,
            "final_url": final_url,
            "title": title,
            "content": content_text[:50000],
            "links": links,
            "content_length": len(content_text),
            "engine": "playwright",
            "status_code": status_code,
            "via_nitter": nitter_url is not None,
            "error": None,
        }

    except Exception as e:
        logger.error(f"Playwright browse failed for {url}: {e}")
        return {
            "url": url,
            "final_url": url,
            "title": "",
            "content": "",
            "links": [],
            "content_length": 0,
            "engine": "playwright",
            "status_code": 0,
            "via_nitter": False,
            "error": str(e),
        }


def _extract_content_from_html(html: str) -> tuple:
    """
    Extract meaningful text content and links from raw HTML.
    Tries semantic tags (article, main) first, falls back to full body.
    Returns (title, text, links).
    """
    import re as _re

    # Extract title
    title_match = _re.search(r'<title[^>]*>(.*?)</title>', html, _re.IGNORECASE | _re.DOTALL)
    title = _re.sub(r'<[^>]+>', '', title_match.group(1)).strip() if title_match else ""

    # Extract links
    links = _re.findall(r'href=["\']?(https?://[^"\'>\s]+)', html)

    # Try semantic containers first: article, main, [role=main]
    content_html = ""
    for pattern in [
        r'<article[^>]*>(.*?)</article>',
        r'<main[^>]*>(.*?)</main>',
        r'<div[^>]+role=["\']main["\'][^>]*>(.*?)</div>',
        r'<div[^>]+class=["\'][^"\']*content[^"\']*["\'][^>]*>(.*?)</div>',
    ]:
        match = _re.search(pattern, html, _re.DOTALL | _re.IGNORECASE)
        if match:
            content_html = match.group(1)
            break

    if not content_html:
        body = _re.search(r'<body[^>]*>(.*?)</body>', html, _re.DOTALL | _re.IGNORECASE)
        content_html = body.group(1) if body else html
        for tag in ['nav', 'header', 'footer', 'aside', 'script', 'style', 'noscript']:
            content_html = _re.sub(rf'<{tag}[^>]*>.*?</{tag}>', ' ', content_html, flags=_re.DOTALL | _re.IGNORECASE)

    # Remove noisy inline blocks (buttons, aria-hidden icons, etc.)
    content_html = _re.sub(r'<(script|style|noscript|button|svg|iframe)[^>]*>.*?</\1>', ' ', content_html, flags=_re.DOTALL | _re.IGNORECASE)
    # Remove aria-hidden elements (icon anchors like ¶)
    content_html = _re.sub(r'<[^>]+aria-hidden=["\']true["\'][^>]*>.*?</[a-z]+>', ' ', content_html, flags=_re.DOTALL | _re.IGNORECASE)
    content_html = _re.sub(r'<[^>]+aria-hidden=["\']true["\'][^>]*/>', ' ', content_html, flags=_re.IGNORECASE)

    # Convert block-level tags to newlines before stripping
    for block in ['p', 'div', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'br', 'tr', 'blockquote', 'pre']:
        content_html = _re.sub(rf'</?{block}[^>]*>', '\n', content_html, flags=_re.IGNORECASE)

    # Strip remaining tags
    text = _re.sub(r'<[^>]+>', '', content_html)

    # Decode HTML entities
    text = text.replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>') \
               .replace('&quot;', '"').replace('&#39;', "'").replace('&para;', '') \
               .replace('&nbsp;', ' ').replace('&#x27;', "'").replace('&mdash;', '—') \
               .replace('&ndash;', '–').replace('&hellip;', '…')
    # Remove remaining HTML entities
    text = _re.sub(r'&[a-zA-Z0-9#]+;', '', text)

    # Clean up lines: strip each, remove empty duplicates
    lines = [l.strip() for l in text.splitlines()]
    # Remove lines that are just punctuation/symbols or too short to be meaningful
    lines = [l for l in lines if len(l) > 2 and not _re.match(r'^[¶#\-\*\|]+$', l)]
    # Collapse more than 2 consecutive blank lines
    cleaned = []
    blank_count = 0
    for line in lines:
        if line == '':
            blank_count += 1
            if blank_count <= 1:
                cleaned.append('')
        else:
            blank_count = 0
            cleaned.append(line)

    text = '\n'.join(cleaned).strip()
    return title, text, links[:100]


async def browse_with_requests(url: str, timeout: int = 20) -> dict:
    """
    Lightweight fallback using requests (no JS rendering).
    Uses semantic HTML extraction to get meaningful content.
    """
    import requests
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

    nitter_url = _rewrite_twitter_url(url)
    fetch_url = nitter_url or url
    ua = random.choice(_USER_AGENTS)

    try:
        resp = requests.get(
            fetch_url,
            headers={
                "User-Agent": ua,
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8",
                "Accept-Encoding": "gzip, deflate",
                "Connection": "keep-alive",
            },
            timeout=timeout,
            verify=False,
            allow_redirects=True,
        )
        resp.encoding = resp.apparent_encoding or "utf-8"
        html = resp.text

        title, text, links = _extract_content_from_html(html)

        return {
            "url": url,
            "final_url": resp.url,
            "title": title,
            "content": text[:50000],
            "links": links,
            "content_length": len(text),
            "engine": "requests",
            "status_code": resp.status_code,
            "via_nitter": nitter_url is not None,
            "error": None,
        }
    except Exception as e:
        logger.error(f"Requests browse failed for {url}: {e}")
        return {
            "url": url,
            "final_url": url,
            "title": "",
            "content": "",
            "links": [],
            "content_length": 0,
            "engine": "requests",
            "status_code": 0,
            "via_nitter": False,
            "error": str(e),
        }


async def browse_with_crawl4ai(url: str, timeout: int = 30) -> dict:
    """
    Extract clean LLM-ready markdown content via Crawl4AI.
    Supports crawl4ai 0.3.x and 0.8.x. Falls back to requests on error.
    """
    try:
        from crawl4ai import AsyncWebCrawler  # noqa: F401 — import check
    except (ImportError, Exception):
        logger.debug("Crawl4AI not available, falling back to requests")
        return await browse_with_requests(url, timeout)

    try:
        import crawl4ai as _c4ai
        version = getattr(_c4ai, "__version__", "0")
        major = int(version.split(".")[0])

        if major >= 1 or version.startswith("0.8") or version.startswith("0.7") or version.startswith("0.6") or version.startswith("0.5") or version.startswith("0.4"):
            # New API (0.4+)
            from crawl4ai import AsyncWebCrawler
            async with AsyncWebCrawler(verbose=False) as crawler:
                result = await crawler.arun(url=url)
            if not getattr(result, "success", False):
                raise RuntimeError(getattr(result, "error_message", "Crawl4AI failed"))
            md = getattr(result, "markdown", "") or ""
            title = ""
            meta = getattr(result, "metadata", None) or {}
            if isinstance(meta, dict):
                title = meta.get("title", "")
        else:
            # Legacy API (0.3.x)
            from crawl4ai import WebCrawler  # type: ignore
            crawler = WebCrawler(verbose=False)
            crawler.warmup()
            result = crawler.run(url=url, word_count_threshold=50)
            md = getattr(result, "markdown", "") or ""
            title = getattr(result, "title", "") or ""

        return {
            "url": url,
            "final_url": url,
            "title": title,
            "content": md[:50000],
            "links": [],
            "content_length": len(md),
            "engine": f"crawl4ai-{version}",
            "status_code": 200,
            "via_nitter": False,
            "error": None,
        }
    except Exception as e:
        logger.warning(f"Crawl4AI failed for {url}: {e}, falling back to requests")
        return await browse_with_requests(url, timeout)


async def browse(url: str, use_playwright: bool = True, timeout_ms: int = 30000) -> dict:
    """Main entry point. Tries Playwright first, falls back to requests."""
    if use_playwright:
        result = await browse_with_playwright(url, timeout_ms)
        if result["error"] and not result["content"]:
            logger.info(f"Playwright failed, falling back to requests for {url}")
            result = await browse_with_requests(url, timeout_ms // 1000)
    else:
        result = await browse_with_requests(url, timeout_ms // 1000)
    return result
