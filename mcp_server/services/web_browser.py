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

        extractor = _TextExtractor()
        extractor.feed(html)
        content_text = extractor.text
        if not title:
            title = extractor.title

        return {
            "url": url,
            "final_url": final_url,
            "title": title,
            "content": content_text[:50000],
            "links": extractor._links[:100],
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


async def browse_with_requests(url: str, timeout: int = 20) -> dict:
    """
    Lightweight fallback using requests (no JS rendering).
    Used when Playwright is unavailable or for simple HTML pages.
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

        extractor = _TextExtractor()
        extractor.feed(html)

        return {
            "url": url,
            "final_url": resp.url,
            "title": extractor.title,
            "content": extractor.text[:50000],
            "links": extractor._links[:100],
            "content_length": len(extractor.text),
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
