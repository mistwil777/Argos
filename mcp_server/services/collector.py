"""
Collector Service

Collects items from various sources (RSS, APIs, local files) and stores them in the database.
"""

import logging
import hashlib
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from urllib.parse import urlparse

import feedparser
import requests
import yaml
from dateutil import parser as date_parser

from mcp_server.database import DatabaseManager

logger = logging.getLogger(__name__)


class CollectorService:
    """Service for collecting items from various veille sources."""
    
    def __init__(self, db_manager: DatabaseManager, config_path: str = "config/veille_sources.yaml"):
        """
        Initialize the collector service.
        
        Args:
            db_manager: Database manager instance
            config_path: Path to sources configuration file
        """
        self.db = db_manager
        self.config_path = config_path
        self.config = self._load_config()
        
        # Statistics
        self.stats = {
            "fetched": 0,
            "duplicates": 0,
            "inserted": 0,
            "errors": 0
        }
    
    def _load_config(self) -> Dict:
        """Load sources configuration from YAML file."""
        try:
            with open(self.config_path, 'r', encoding='utf-8') as f:
                config = yaml.safe_load(f)
            logger.info(f"Loaded configuration from {self.config_path}")
            return config
        except Exception as e:
            logger.error(f"Failed to load config: {e}")
            return {
                "rss_feeds": [],
                "apis": [],
                "local_files": [],
                "settings": {}
            }
    
    def _is_duplicate(self, url: str, title: str) -> bool:
        """
        Check if URL or similar title already exists in database.
        Uses URL exact match and title similarity (GIGO principle).
        
        Args:
            url: URL to check
            title: Title to check for similarity
            
        Returns:
            True if duplicate, False otherwise
        """
        # Check exact URL match
        url_query = "SELECT COUNT(*) FROM items WHERE url = %s"
        
        with self.db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(url_query, (url,))
                if cur.fetchone()[0] > 0:
                    return True
                
                # Check for highly similar titles using PostgreSQL trigram similarity
                # similarity > 0.6 means titles are very similar (likely duplicates)
                # This catches cases where same content is published with different URLs
                similar_query = """
                    SELECT COUNT(*) FROM items 
                    WHERE similarity(title, %s) > 0.6
                """
                cur.execute(similar_query, (title,))
                if cur.fetchone()[0] > 0:
                    logger.info(f"Found similar title to: {title[:50]}...")
                    return True
        
        return False
    
    def _clean_html(self, html_content: str) -> str:
        """
        Remove HTML tags and clean text.
        
        Args:
            html_content: HTML string
            
        Returns:
            Cleaned text
        """
        # Remove HTML tags
        text = re.sub(r'<[^>]+>', '', html_content)
        # Remove extra whitespace
        text = re.sub(r'\s+', ' ', text).strip()
        return text
    
    def _extract_summary(self, content: str, max_length: int = 1500) -> str:
        """
        Extract summary from content.
        
        Args:
            content: Full content text
            max_length: Maximum summary length
            
        Returns:
            Summary text
        """
        if len(content) <= max_length:
            return content
        
        # Try to cut at sentence boundary
        summary = content[:max_length]
        last_period = summary.rfind('.')
        if last_period > max_length * 0.7:  # If period is in last 30%
            summary = summary[:last_period + 1]
        else:
            summary = summary + "..."
        
        return summary
    
    def _parse_date(self, date_string: Optional[str]) -> Optional[datetime]:
        """
        Parse date string to datetime.
        
        Args:
            date_string: Date string in various formats
            
        Returns:
            Datetime object or None
        """
        if not date_string:
            return None
        
        try:
            # Try parsing with dateutil (handles many formats)
            dt = date_parser.parse(date_string)
            # Ensure timezone aware
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except Exception as e:
            logger.warning(f"Failed to parse date '{date_string}': {e}")
            return None
    
    def fetch_rss_feed(self, feed_config: Dict) -> List[Dict]:
        """
        Fetch items from an RSS feed.
        
        Args:
            feed_config: Feed configuration dict
            
        Returns:
            List of item dicts
        """
        items = []
        feed_name = feed_config.get("name", "Unknown")
        feed_url = feed_config.get("url")
        
        if not feed_config.get("enabled", True):
            logger.debug(f"Feed {feed_name} is disabled, skipping")
            return items
        
        try:
            logger.info(f"Fetching RSS feed: {feed_name}")
            feed = feedparser.parse(feed_url)
            
            if feed.bozo:  # Feed parsing error
                logger.warning(f"Feed parsing warning for {feed_name}: {feed.bozo_exception}")
            
            for entry in feed.entries:
                try:
                    # Extract data
                    url = entry.get("link", "")
                    title = entry.get("title", "Untitled")
                    
                    # Get content (try multiple fields)
                    content = (
                        entry.get("content", [{}])[0].get("value", "") or
                        entry.get("summary", "") or
                        entry.get("description", "")
                    )
                    
                    # Clean HTML
                    content_text = self._clean_html(content) if content else ""
                    summary = self._extract_summary(content_text)
                    
                    # Parse date
                    published_at = None
                    if "published" in entry:
                        published_at = self._parse_date(entry.published)
                    elif "updated" in entry:
                        published_at = self._parse_date(entry.updated)
                    
                    # Author
                    author = entry.get("author", None)
                    
                    # Check if valid
                    if not url or not title:
                        logger.warning(f"Skipping entry with missing URL or title in {feed_name}")
                        continue
                    
                    # Check filters
                    settings = self.config.get("settings", {})
                    filters = settings.get("filters", {})
                    min_length = filters.get("min_content_length", 0)
                    
                    if len(content_text) < min_length:
                        logger.debug(f"Skipping short content: {title}")
                        continue
                    
                    items.append({
                        "source_type": "rss",
                        "source_url": feed_url,
                        "url": url,
                        "title": title,
                        "summary": summary,
                        "author": author,
                        "published_at": published_at
                    })
                    
                except Exception as e:
                    logger.error(f"Error processing entry in {feed_name}: {e}")
                    self.stats["errors"] += 1
            
            logger.info(f"Fetched {len(items)} items from {feed_name}")
            self.stats["fetched"] += len(items)
            
        except Exception as e:
            logger.error(f"Failed to fetch RSS feed {feed_name}: {e}")
            self.stats["errors"] += 1
        
        return items
    
    def fetch_github_repos(self, api_config: Dict) -> List[Dict]:
        """
        Fetch trending repositories from GitHub API.
        
        Args:
            api_config: API configuration dict
            
        Returns:
            List of item dicts
        """
        items = []
        api_name = api_config.get("name", "Unknown")
        
        if not api_config.get("enabled", True):
            logger.debug(f"API {api_name} is disabled, skipping")
            return items
        
        try:
            logger.info(f"Fetching from GitHub API: {api_name}")
            
            url = api_config.get("url")
            params = api_config.get("params", {})
            
            headers = {
                "Accept": "application/vnd.github.v3+json"
            }
            
            response = requests.get(url, params=params, headers=headers, timeout=30)
            response.raise_for_status()
            
            data = response.json()
            repos = data.get("items", [])
            
            for repo in repos:
                try:
                    repo_url = repo.get("html_url", "")
                    title = f"{repo.get('full_name', 'Unknown')}: {repo.get('description', 'No description')}"
                    description = repo.get("description", "")
                    stars = repo.get("stargazers_count", 0)
                    language = repo.get("language", "Unknown")
                    
                    # Create summary
                    summary = f"{description} (⭐ {stars} stars, Language: {language})"
                    
                    # Parse date
                    published_at = self._parse_date(repo.get("created_at"))
                    
                    items.append({
                        "source_type": "github",
                        "source_url": url,
                        "url": repo_url,
                        "title": title[:500],  # Limit title length
                        "summary": summary,
                        "author": repo.get("owner", {}).get("login"),
                        "published_at": published_at
                    })
                    
                except Exception as e:
                    logger.error(f"Error processing GitHub repo: {e}")
                    self.stats["errors"] += 1
            
            logger.info(f"Fetched {len(items)} items from {api_name}")
            self.stats["fetched"] += len(items)
            
        except Exception as e:
            logger.error(f"Failed to fetch from GitHub API {api_name}: {e}")
            self.stats["errors"] += 1
        
        return items
    
    def fetch_arxiv_papers(self, api_config: Dict) -> List[Dict]:
        """
        Fetch papers from ArXiv API.
        
        Args:
            api_config: API configuration dict
            
        Returns:
            List of item dicts
        """
        items = []
        api_name = api_config.get("name", "Unknown")
        
        if not api_config.get("enabled", True):
            logger.debug(f"API {api_name} is disabled, skipping")
            return items
        
        try:
            logger.info(f"Fetching from ArXiv API: {api_name}")
            
            url = api_config.get("url")
            params = api_config.get("params", {})
            
            response = requests.get(url, params=params, timeout=30)
            response.raise_for_status()
            
            # Parse Atom feed
            feed = feedparser.parse(response.text)
            
            for entry in feed.entries:
                try:
                    paper_url = entry.get("link", "")
                    title = entry.get("title", "Untitled")
                    summary = self._clean_html(entry.get("summary", ""))
                    
                    # Authors
                    authors = [author.get("name", "") for author in entry.get("authors", [])]
                    author_str = ", ".join(authors[:3])  # First 3 authors
                    if len(authors) > 3:
                        author_str += " et al."
                    
                    # Parse date
                    published_at = self._parse_date(entry.get("published"))
                    
                    items.append({
                        "source_type": "arxiv",
                        "source_url": url,
                        "url": paper_url,
                        "title": title,
                        "summary": self._extract_summary(summary),
                        "author": author_str,
                        "published_at": published_at
                    })
                    
                except Exception as e:
                    logger.error(f"Error processing ArXiv paper: {e}")
                    self.stats["errors"] += 1
            
            logger.info(f"Fetched {len(items)} items from {api_name}")
            self.stats["fetched"] += len(items)
            
        except Exception as e:
            logger.error(f"Failed to fetch from ArXiv API {api_name}: {e}")
            self.stats["errors"] += 1
        
        return items
    
    def insert_items(self, items: List[Dict]) -> Tuple[int, int]:
        """
        Insert items into database with deduplication.
        
        Args:
            items: List of item dicts
            
        Returns:
            Tuple of (inserted_count, duplicate_count)
        """
        inserted = 0
        duplicates = 0
        
        for item in items:
            try:
                # Check for duplicates (URL + title similarity)
                if self._is_duplicate(item["url"], item["title"]):
                    logger.debug(f"Duplicate found: {item['title']}")
                    duplicates += 1
                    continue
                
                # Look up workspace_id from source matching source_url
                workspace_id = item.get("workspace_id")
                if workspace_id is None:
                    try:
                        with self.db.get_connection() as conn:
                            with conn.cursor() as cur:
                                cur.execute(
                                    "SELECT workspace_id FROM sources WHERE url = %s LIMIT 1",
                                    (item["source_url"],)
                                )
                                src_row = cur.fetchone()
                                if src_row:
                                    workspace_id = src_row[0]
                    except Exception:
                        pass

                # Insert into database with ON CONFLICT (url) DO NOTHING for dedup
                query = """
                    INSERT INTO items (
                        source_type, source_url, url, title, content, summary,
                        author, published_at, workspace_id
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (url) DO NOTHING
                    RETURNING id
                """
                
                with self.db.get_connection() as conn:
                    with conn.cursor() as cur:
                        cur.execute(
                            query,
                            (
                                item["source_type"],
                                item["source_url"],
                                item["url"],
                                item["title"],
                                item.get("summary", ""),   # content (NOT NULL legacy column)
                                item.get("summary", ""),   # summary
                                item.get("author"),
                                item.get("published_at"),
                                workspace_id,
                            )
                        )
                        row = cur.fetchone()
                        item_id = row[0] if row else None
                        if item_id is None:
                            # Duplicate silently skipped by ON CONFLICT
                            duplicates += 1
                            continue
                
                logger.info(f"Inserted item {item_id}: {item['title'][:50]}...")
                inserted += 1
                
            except Exception as e:
                logger.error(f"Failed to insert item: {e}")
                self.stats["errors"] += 1
        
        return inserted, duplicates
    
    def fetch_website_page(self, source_url: str, workspace_id: Optional[int] = None) -> List[Dict]:
        """
        Fetch a single web page, extract title + main text content as one item.
        Uses stdlib html.parser — no extra dependency.
        """
        from html.parser import HTMLParser

        class _HTMLExtractor(HTMLParser):
            """Minimal extractor: title + visible text, skips script/style/nav."""
            _SKIP = {'script', 'style', 'nav', 'header', 'footer', 'aside', 'noscript'}

            def __init__(self):
                super().__init__()
                self.title: str = ''
                self._chunks: list = []
                self._in_title = False
                self._skip_depth = 0

            def handle_starttag(self, tag, attrs):
                if tag == 'title':
                    self._in_title = True
                if tag in self._SKIP:
                    self._skip_depth += 1

            def handle_endtag(self, tag):
                if tag == 'title':
                    self._in_title = False
                if tag in self._SKIP:
                    self._skip_depth = max(0, self._skip_depth - 1)

            def handle_data(self, data):
                stripped = data.strip()
                if not stripped:
                    return
                if self._in_title:
                    self.title = stripped
                elif self._skip_depth == 0:
                    self._chunks.append(stripped)

        try:
            import urllib3
            urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
            resp = requests.get(
                source_url,
                headers={'User-Agent': 'Mozilla/5.0 (compatible; VeilleBot/1.0)'},
                timeout=20,
                verify=False  # Docker SSL cert store may be incomplete
            )
            resp.raise_for_status()
            resp.encoding = resp.apparent_encoding or 'utf-8'

            extractor = _HTMLExtractor()
            extractor.feed(resp.text)

            title = extractor.title.strip() or source_url
            full_text = ' '.join(extractor._chunks)
            summary = self._extract_summary(full_text, max_length=1500) if full_text else ''

            logger.info(f"Fetched website page: {title[:60]}…")
            self.stats["fetched"] += 1

            return [{
                "source_type": "website",
                "source_url": source_url,
                "url": source_url,
                "title": title,
                "summary": summary,
                "author": None,
                "published_at": None,
                "workspace_id": workspace_id,
            }]
        except Exception as e:
            logger.error(f"Failed to fetch website {source_url}: {e}")
            self.stats["errors"] += 1
            return []

    def fetch_from_db_sources(self, workspace_id: Optional[int] = None) -> Dict:
        """
        Fetch items from all *active* sources stored in the database.
        Dispatches by source type: rss → feedparser, website → scraper, github → GitHub API.

        Args:
            workspace_id: If provided, only fetch sources belonging to this workspace.

        Returns:
            Stats dict {fetched, inserted, duplicates, errors}.
        """
        stats = {"fetched": 0, "inserted": 0, "duplicates": 0, "errors": 0}

        # Read active sources from DB
        try:
            with self.db.get_connection() as conn:
                with conn.cursor() as cur:
                    query = "SELECT id, name, url, type, workspace_id FROM sources WHERE active = true"
                    params: list = []
                    if workspace_id is not None:
                        query += " AND workspace_id = %s"
                        params.append(workspace_id)
                    cur.execute(query, params)
                    db_sources = cur.fetchall()
        except Exception as e:
            logger.error(f"Failed to read sources from DB: {e}")
            return stats

        for src_id, src_name, src_url, src_type, src_wid in db_sources:
            wid = workspace_id or src_wid
            items: List[Dict] = []
            try:
                if src_type == 'rss':
                    config = {"url": src_url, "name": src_name or src_url, "enabled": True}
                    items = self.fetch_rss_feed(config)
                    for item in items:
                        item['workspace_id'] = wid
                        item['source_url'] = src_url
                elif src_type == 'website':
                    items = self.fetch_website_page(src_url, workspace_id=wid)
                elif src_type == 'github':
                    config = {"type": "github", "url": src_url, "name": src_name or src_url, "enabled": True}
                    items = self.fetch_github_repos(config)
                    for item in items:
                        item['workspace_id'] = wid
                        item['source_url'] = src_url
                else:
                    logger.info(f"Source {src_id} type '{src_type}' not supported for DB collect, skipping")
                    continue
            except Exception as e:
                logger.error(f"Error fetching source {src_id} ({src_url}): {e}")
                stats["errors"] += 1
                continue

            stats["fetched"] += len(items)
            if items:
                inserted, dupes = self.insert_items(items)
                stats["inserted"] += inserted
                stats["duplicates"] += dupes

        logger.info(
            f"DB collect complete: {stats['fetched']} fetched, "
            f"{stats['inserted']} inserted, {stats['duplicates']} duplicates, "
            f"{stats['errors']} errors"
        )
        return stats

    def fetch_all_rss(self) -> int:
        """
        Fetch all enabled RSS feeds.
        
        Returns:
            Number of items inserted
        """
        all_items = []
        
        for feed_config in self.config.get("rss_feeds", []):
            items = self.fetch_rss_feed(feed_config)
            all_items.extend(items)
        
        inserted, duplicates = self.insert_items(all_items)
        self.stats["inserted"] += inserted
        self.stats["duplicates"] += duplicates
        
        return inserted
    
    def fetch_all_apis(self) -> int:
        """
        Fetch all enabled API sources.
        
        Returns:
            Number of items inserted
        """
        all_items = []
        
        for api_config in self.config.get("apis", []):
            api_type = api_config.get("type", "unknown")
            
            if api_type == "github":
                items = self.fetch_github_repos(api_config)
            elif api_type == "arxiv":
                items = self.fetch_arxiv_papers(api_config)
            else:
                logger.warning(f"Unknown API type: {api_type}")
                continue
            
            all_items.extend(items)
        
        inserted, duplicates = self.insert_items(all_items)
        self.stats["inserted"] += inserted
        self.stats["duplicates"] += duplicates
        
        return inserted
    
    def fetch_all(self) -> Dict:
        """
        Fetch from all enabled sources.
        
        Returns:
            Statistics dict
        """
        logger.info("Starting collection from all sources")
        
        # Reset stats
        self.stats = {
            "fetched": 0,
            "duplicates": 0,
            "inserted": 0,
            "errors": 0
        }
        
        # Fetch RSS feeds
        self.fetch_all_rss()
        
        # Fetch APIs
        self.fetch_all_apis()
        
        logger.info(
            f"Collection complete: {self.stats['fetched']} fetched, "
            f"{self.stats['inserted']} inserted, {self.stats['duplicates']} duplicates, "
            f"{self.stats['errors']} errors"
        )
        
        return self.stats
    
    def get_stats(self) -> Dict:
        """Get current collection statistics."""
        return self.stats
