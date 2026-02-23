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
    
    def _is_duplicate(self, url: str) -> bool:
        """
        Check if URL already exists in database.
        
        Args:
            url: URL to check
            
        Returns:
            True if duplicate, False otherwise
        """
        query = "SELECT COUNT(*) FROM items WHERE url = %s"
        
        with self.db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(query, (url,))
                count = cur.fetchone()[0]
                return count > 0
    
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
    
    def _extract_summary(self, content: str, max_length: int = 500) -> str:
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
                # Check for duplicates
                if self._is_duplicate(item["url"]):
                    logger.debug(f"Duplicate found: {item['title']}")
                    duplicates += 1
                    continue
                
                # Insert into database
                query = """
                    INSERT INTO items (
                        source_type, source_url, url, title, summary,
                        author, published_at
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
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
                                item["summary"],
                                item.get("author"),
                                item.get("published_at")
                            )
                        )
                        item_id = cur.fetchone()[0]
                
                logger.info(f"Inserted item {item_id}: {item['title'][:50]}...")
                inserted += 1
                
            except Exception as e:
                logger.error(f"Failed to insert item: {e}")
                self.stats["errors"] += 1
        
        return inserted, duplicates
    
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
