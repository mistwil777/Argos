"""
MCP tools for web browsing.

Exposed tools:
  web.browse        — Fetch and render a URL (JS-aware)
  web.digest        — Generate markdown + JSON digest from a URL
  web.watch         — Register a URL for change monitoring
  web.watched_pages — List monitored URLs
"""
import asyncio
import logging
import time
from typing import Any, Optional

logger = logging.getLogger(__name__)


async def tool_browse(params: dict, db=None) -> dict:
    """
    Fetch a URL with headless browser (Playwright + stealth).
    Falls back to requests for simple HTML pages.
    If the URL ends with '/', crawls all child pages found on that page.

    params:
      url (str)             — URL to fetch (trailing '/' triggers child crawl)
      use_playwright (bool) — default True
      timeout_ms (int)      — default 30000
      max_crawl (int)       — max child pages to crawl when URL ends with / (default 10)
      workspace_id (int)    — optional
    """
    url = params.get("url", "").strip()
    if not url:
        return {"success": False, "error": "url parameter is required"}

    use_playwright = params.get("use_playwright", True)
    timeout_ms = params.get("timeout_ms", 30000)
    workspace_id = params.get("workspace_id")
    max_crawl = min(params.get("max_crawl", 10), 30)

    from argos.services.web_browser import browse
    from urllib.parse import urlparse, urljoin

    # ── Crawl mode: URL ends with / ──────────────────────────────────────────
    if url.endswith("/"):
        start = time.monotonic()
        root_result = await browse(url, use_playwright=use_playwright, timeout_ms=timeout_ms)

        # Collect child links that share the same origin + path prefix
        parsed_root = urlparse(url)
        base_prefix = parsed_root.scheme + "://" + parsed_root.netloc + parsed_root.path
        children = []
        seen = {url}
        for link in root_result.get("links", []):
            abs_link = urljoin(url, link)
            if abs_link not in seen and abs_link.startswith(base_prefix) and abs_link != url:
                seen.add(abs_link)
                children.append(abs_link)
                if len(children) >= max_crawl:
                    break

        # Fetch all children concurrently
        child_tasks = [browse(child, use_playwright=use_playwright, timeout_ms=timeout_ms) for child in children]
        child_results = await asyncio.gather(*child_tasks, return_exceptions=True)

        pages = [root_result]
        for res in child_results:
            if isinstance(res, dict) and not res.get("error"):
                pages.append(res)

        duration_ms = int((time.monotonic() - start) * 1000)

        # Log root + children to DB
        if db:
            try:
                with db.get_connection() as conn:
                    with conn.cursor() as cur:
                        for page in pages:
                            cur.execute(
                                """INSERT INTO browse_sessions
                                   (url, status, title, content_text, content_length, links_found,
                                    duration_ms, engine, workspace_id, error_message)
                                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                                (
                                    page["url"], "success",
                                    page.get("title", "")[:500],
                                    page.get("content", "")[:10000],
                                    page.get("content_length", 0),
                                    len(page.get("links", [])),
                                    duration_ms, page.get("engine", "playwright"),
                                    workspace_id, None,
                                ),
                            )
                        conn.commit()
            except Exception as e:
                logger.warning(f"Failed to log crawl sessions: {e}")

        return {
            "success": True,
            "url": url,
            "crawl": True,
            "pages_crawled": len(pages),
            "pages": [
                {
                    "url": p["url"],
                    "title": p.get("title", ""),
                    "content": p.get("content", ""),
                    "content_length": p.get("content_length", 0),
                    "engine": p.get("engine"),
                }
                for p in pages
            ],
            "duration_ms": duration_ms,
        }

    # ── Single page mode ─────────────────────────────────────────────────────
    start = time.monotonic()
    result = await browse(url, use_playwright=use_playwright, timeout_ms=timeout_ms)
    duration_ms = int((time.monotonic() - start) * 1000)

    # Log to DB
    if db:
        try:
            with db.get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """INSERT INTO browse_sessions
                           (url, status, title, content_text, content_length, links_found,
                            duration_ms, engine, workspace_id, error_message)
                           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                        (
                            url,
                            "error" if result.get("error") else "success",
                            result.get("title", "")[:500],
                            result.get("content", "")[:10000],
                            result.get("content_length", 0),
                            len(result.get("links", [])),
                            duration_ms,
                            result.get("engine", "playwright"),
                            workspace_id,
                            result.get("error"),
                        ),
                    )
                    conn.commit()
        except Exception as e:
            logger.warning(f"Failed to log browse session: {e}")

    return {
        "success": not bool(result.get("error")),
        "url": result["url"],
        "final_url": result.get("final_url"),
        "title": result.get("title", ""),
        "content": result.get("content", ""),
        "content_length": result.get("content_length", 0),
        "links": result.get("links", [])[:20],
        "engine": result.get("engine"),
        "via_nitter": result.get("via_nitter", False),
        "duration_ms": duration_ms,
        "error": result.get("error"),
    }


async def tool_digest(params: dict, db=None, llm_provider=None) -> dict:
    """
    Browse a URL and generate a markdown digest + structured JSON.
    Optionally saves the item to DB and queues it for RAG indexing.

    params:
      url (str)          — URL to digest
      save_item (bool)   — save to items table (default True)
      workspace_id (int)
    """
    url = params.get("url", "").strip()
    if not url:
        return {"success": False, "error": "url parameter is required"}

    save_item = params.get("save_item", True)
    workspace_id = params.get("workspace_id")

    # Step 1: browse
    from argos.services.web_browser import browse
    browse_result = await browse(url)

    if browse_result.get("error") and not browse_result.get("content"):
        return {"success": False, "url": url, "error": browse_result["error"]}

    title = browse_result.get("title", url)
    content = browse_result.get("content", "")

    # Step 2: generate digest
    from argos.services.digest_generator import generate_digest
    digest = await generate_digest(url, title, content, workspace_id, llm_provider)

    item_id = None
    # Step 3: save to DB
    if save_item and db and not digest.get("error"):
        try:
            import json as json_lib
            json_data = digest.get("json", {})
            with db.get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """INSERT INTO items
                           (source_type, source_url, url, title, summary,
                            digest_markdown, digest_json, digest_generated_at,
                            importance, item_type, keywords, classification_status, workspace_id)
                           VALUES (%s,%s,%s,%s,%s,%s,%s,NOW(),%s,%s,%s,'classified',%s)
                           ON CONFLICT (url) DO UPDATE SET
                             digest_markdown = EXCLUDED.digest_markdown,
                             digest_json = EXCLUDED.digest_json,
                             digest_generated_at = NOW()
                           RETURNING id""",
                        (
                            "browse",
                            url,
                            url,
                            title[:500],
                            json_data.get("summary", "")[:2000],
                            digest.get("markdown", ""),
                            json_lib.dumps(json_data),
                            json_data.get("importance", "medium"),
                            json_data.get("content_type", "other"),
                            json_data.get("tags", []),
                            workspace_id,
                        ),
                    )
                    row = cur.fetchone()
                    item_id = row[0] if row else None
                    conn.commit()
        except Exception as e:
            logger.error(f"Failed to save digest item: {e}")

    return {
        "success": True,
        "url": url,
        "title": title,
        "markdown": digest.get("markdown", ""),
        "json": digest.get("json", {}),
        "item_id": item_id,
        "engine": browse_result.get("engine"),
        "error": digest.get("error"),
    }


async def tool_watch(params: dict, db=None) -> dict:
    """
    Register a URL for periodic change monitoring.

    params:
      url (str)                — URL to watch
      name (str)               — display name
      interval_minutes (int)   — check interval, default 60
      workspace_id (int)
    """
    url = params.get("url", "").strip()
    name = params.get("name", url[:100])
    interval = max(5, params.get("interval_minutes", 60))
    workspace_id = params.get("workspace_id")

    if not url:
        return {"success": False, "error": "url parameter is required"}

    if not db:
        return {"success": False, "error": "Database not available"}

    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """INSERT INTO sources
                       (name, url, type, active, monitor_enabled, check_interval_minutes, workspace_id)
                       VALUES (%s, %s, 'website', TRUE, TRUE, %s, %s)
                       ON CONFLICT (url) DO UPDATE SET
                         monitor_enabled = TRUE,
                         check_interval_minutes = EXCLUDED.check_interval_minutes
                       RETURNING id""",
                    (name, url, interval, workspace_id),
                )
                row = cur.fetchone()
                source_id = row[0] if row else None
                conn.commit()
        return {
            "success": True,
            "source_id": source_id,
            "url": url,
            "interval_minutes": interval,
            "message": f"Now watching {url} every {interval} minutes",
        }
    except Exception as e:
        logger.error(f"Failed to register watch: {e}")
        return {"success": False, "error": str(e)}


async def tool_watched_pages(params: dict, db=None) -> dict:
    """List all monitored URLs with their last check status."""
    workspace_id = params.get("workspace_id")

    if not db:
        return {"success": False, "error": "Database not available"}

    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                query = """
                    SELECT id, name, url, check_interval_minutes,
                           last_checked_at, active
                    FROM sources
                    WHERE monitor_enabled = TRUE
                """
                args = []
                if workspace_id:
                    query += " AND workspace_id = %s"
                    args.append(workspace_id)
                query += " ORDER BY last_checked_at DESC NULLS LAST"
                cur.execute(query, args)
                rows = cur.fetchall()

        pages = [
            {
                "id": r[0],
                "name": r[1],
                "url": r[2],
                "interval_minutes": r[3],
                "last_checked_at": r[4].isoformat() if r[4] else None,
                "active": r[5],
            }
            for r in rows
        ]
        return {"success": True, "pages": pages, "count": len(pages)}
    except Exception as e:
        logger.error(f"Failed to list watched pages: {e}")
        return {"success": False, "error": str(e)}


# Tool registry — matches server.py registration pattern
WEB_TOOLS = {
    "web.browse": tool_browse,
    "web.digest": tool_digest,
    "web.watch": tool_watch,
    "web.watched_pages": tool_watched_pages,
}
