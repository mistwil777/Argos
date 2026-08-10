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
from urllib.parse import urlparse, urljoin

import feedparser
import requests
import yaml
from dateutil import parser as date_parser

from argos.database import DatabaseManager

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
    
    # Marqueurs d'articles introductifs — rejetés quand le niveau cible est avancé/expert
    _INTRO_MARKERS = [
        "introduction à", "introduction to", "intro to", "intro à",
        "pour les débutants", "for beginners", "beginner's guide", "guide du débutant",
        "qu'est-ce que", "what is ", "c'est quoi", "kesako",
        "getting started", "pour commencer", "démarrer avec", "premiers pas",
        "tutorial for beginners", "tutoriel débutant",
    ]
    _LEVEL_ORDER = ["novice", "débutant", "intermédiaire", "avancé", "expert"]

    @classmethod
    def _max_depth_level(cls, depth_by_topic: dict) -> str | None:
        """Retourne le niveau le plus élevé parmi les topics configurés."""
        if not depth_by_topic:
            return None
        levels = [v.lower().strip() for v in depth_by_topic.values() if v]
        valid = [l for l in levels if l in cls._LEVEL_ORDER]
        if not valid:
            return None
        return max(valid, key=lambda l: cls._LEVEL_ORDER.index(l))

    @classmethod
    def _passes_depth_filter(cls, text: str, depth_by_topic: dict) -> bool:
        """
        Filtre de profondeur : pour avancé/expert, rejette les articles introductifs.
        Pour novice/débutant/intermédiaire (ou absent), laisse tout passer.
        """
        max_level = cls._max_depth_level(depth_by_topic)
        if max_level not in ("avancé", "expert"):
            return True
        text_lower = text.lower()
        if any(marker in text_lower for marker in cls._INTRO_MARKERS):
            return False
        return True

    def _passes_relevance_filter(self, item: Dict) -> bool:
        """
        Vérifie que l'item correspond au profil du sujet associé.
        Deux critères complémentaires (un seul suffit) :
        1. Exact match : au moins min_match_count termes de must_match présents dans title+summary+description[:500]
        2. Sémantique : cosine similarity entre l'embedding du profil et celui de l'article >= 0.35

        Si le sujet n'a pas de filter_config et pas d'embedding → laisse passer.
        """
        sujet_id = item.get("sujet_id")
        if not sujet_id:
            return True
        try:
            with self.db.get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        "SELECT filter_config, knowledge_profile FROM sujets WHERE id = %s",
                        (sujet_id,)
                    )
                    row = cur.fetchone()
            if not row:
                return True

            filter_cfg = row[0] or {}
            knowledge_profile = row[1] or {}
            profile_embedding = knowledge_profile.get("profile_embedding")

            # ── Exclusions dures : rejet immédiat si un terme banned est présent ──
            must_not_match = [w.lower().strip() for w in (filter_cfg.get("must_not_match") or []) if w]

            must_match = [w.lower() for w in (filter_cfg.get("must_match") or []) if w]
            actors = [w.lower() for w in (filter_cfg.get("actors") or []) if w]
            min_count = int(filter_cfg.get("min_match_count") or 1)

            desc = (item.get('description') or item.get('content') or '')[:500]
            text = f"{item.get('title', '')} {item.get('summary', '')} {desc}".lower()

            # ── Exclusions dures : rejet immédiat ────────────────────────────────
            if must_not_match and any(w in text for w in must_not_match):
                return False

            # ── Filtre de profondeur : depth_by_topic ─────────────────────────
            depth_by_topic = filter_cfg.get("depth_by_topic") or {}
            if not self._passes_depth_filter(text, depth_by_topic):
                return False

            # ── Filtre de fraîcheur : date_horizon ───────────────────────────
            date_horizon = filter_cfg.get("date_horizon")
            if not date_horizon and filter_cfg.get("is_fast_evolving", True):
                date_horizon = "1y"
            if date_horizon and date_horizon != "all":
                published_at = item.get("published_at")
                if published_at is not None:
                    try:
                        import datetime
                        horizon_days = {
                            "7d": 7, "30d": 30, "90d": 90,
                            "6m": 180, "1y": 365,
                        }.get(date_horizon, 365)
                        if hasattr(published_at, "tzinfo"):
                            now = datetime.datetime.now(tz=published_at.tzinfo or datetime.timezone.utc)
                        else:
                            now = datetime.datetime.now()
                        if (now - published_at).days > horizon_days:
                            return False
                    except Exception as _date_err:
                        logger.debug(f"_passes_relevance_filter date error: {_date_err}")

            # ── Critère 1 : must_match — signal fort, passe immédiatement ────────
            if must_match:
                matched = sum(1 for w in must_match if w in text)
                if matched >= min_count:
                    return True

            # ── Critère 2 : actors seuls — signal faible, accepté uniquement
            #    si aucune exclusion ne s'applique (déjà vérifiée ci-dessus) ──────
            if actors and any(a in text for a in actors):
                # Passe seulement si must_match n'est pas défini (pas de termes précis attendus)
                if not must_match:
                    return True

            # ── Critère 3 : similarité sémantique (si embedding de profil disponible)
            if profile_embedding:
                try:
                    import numpy as np
                    from sklearn.metrics.pairwise import cosine_similarity
                    from argos.services.vector_store_singleton import get_vector_store
                    vs = get_vector_store()
                    if vs and vs.model:
                        article_text = f"{item.get('title', '')} {item.get('summary', '')}".strip()
                        article_emb = vs.model.embed_text(article_text)
                        profile_emb = np.array(profile_embedding)
                        sim = cosine_similarity(
                            article_emb.reshape(1, -1),
                            profile_emb.reshape(1, -1)
                        )[0][0]
                        if sim >= 0.35:
                            return True
                except Exception as _sem_err:
                    logger.debug(f"_passes_relevance_filter semantic error: {_sem_err}")

            # Aucun critère satisfait → rejeter si des filtres sont configurés
            if must_match or actors or profile_embedding:
                return False

            return True  # aucun filtre configuré

        except Exception as e:
            logger.warning(f"_passes_relevance_filter error: {e}")
            return True

    def _is_duplicate(self, url: str, title: str, sujet_id: int | None = None) -> bool:
        """
        Check if URL or similar title already exists in database.
        When sujet_id is provided, the URL check is scoped to that sujet only —
        so the same article can be stored independently for different sujets.
        Without sujet_id, falls back to global URL check.
        """
        with self.db.get_connection() as conn:
            with conn.cursor() as cur:
                # URL check scoped to (url, sujet_id) pair — mirrors the UNIQUE constraint
                if sujet_id is not None:
                    cur.execute(
                        "SELECT COUNT(*) FROM items WHERE url = %s AND sujet_id = %s",
                        (url, sujet_id),
                    )
                else:
                    cur.execute("SELECT COUNT(*) FROM items WHERE url = %s", (url,))
                if cur.fetchone()[0] > 0:
                    return True

                # Title similarity — scoped to same sujet when known
                if sujet_id is not None:
                    cur.execute(
                        "SELECT COUNT(*) FROM items WHERE similarity(title, %s) > 0.6 AND sujet_id = %s",
                        (title, sujet_id),
                    )
                else:
                    cur.execute(
                        "SELECT COUNT(*) FROM items WHERE similarity(title, %s) > 0.6",
                        (title,),
                    )
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
            
            MAX_TRAFILATURA_FETCHES = 10
            trafilatura_fetches = 0

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

                    # Fallback: fetch full article with trafilatura when RSS gives no content
                    if not content_text and url and trafilatura_fetches < MAX_TRAFILATURA_FETCHES:
                        try:
                            import trafilatura
                            import requests as _req
                            resp = _req.get(
                                url,
                                headers={"User-Agent": "Mozilla/5.0 (compatible; ArgosBot/1.0)"},
                                timeout=15,
                                verify=False,
                            )
                            content_text = trafilatura.extract(resp.text) or ""
                            trafilatura_fetches += 1
                        except Exception:
                            pass

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
                # Récupérer TOUS les sujets qui trackent cette source_url
                # Un article peut être pertinent pour plusieurs sujets en parallèle
                source_assignments: list[tuple] = []  # [(workspace_id, sujet_id)]
                try:
                    with self.db.get_connection() as conn:
                        with conn.cursor() as cur:
                            cur.execute(
                                "SELECT workspace_id, sujet_id FROM sources WHERE url = %s",
                                (item["source_url"],)
                            )
                            source_assignments = cur.fetchall() or []
                except Exception:
                    pass

                if not source_assignments:
                    # Source inconnue : on tente quand même avec ce qu'on a
                    source_assignments = [(item.get("workspace_id"), item.get("sujet_id"))]

                item_id = None
                for ws_id, s_id in source_assignments:
                    item_copy = dict(item, workspace_id=ws_id, sujet_id=s_id)

                    # Duplicat scoped au sujet — même URL peut exister dans un autre sujet
                    if self._is_duplicate(item_copy["url"], item_copy["title"], sujet_id=s_id):
                        logger.debug(f"Duplicate for sujet {s_id}: {item['title']}")
                        duplicates += 1
                        continue

                    # Filtre de pertinence par sujet
                    if not self._passes_relevance_filter(item_copy):
                        logger.debug(f"Filtered out for sujet {s_id}: {item['title']}")
                        duplicates += 1
                        continue

                    insert_query = """
                        INSERT INTO items (
                            source_type, source_url, url, title, summary,
                            author, published_at, workspace_id, sujet_id
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                        ON CONFLICT (url, COALESCE(sujet_id, -1)) DO NOTHING
                        RETURNING id
                    """
                    with self.db.get_connection() as conn:
                        with conn.cursor() as cur:
                            cur.execute(
                                insert_query,
                                (
                                    item_copy["source_type"],
                                    item_copy["source_url"],
                                    item_copy["url"],
                                    item_copy["title"],
                                    item_copy.get("summary", ""),
                                    item_copy.get("author"),
                                    item_copy.get("published_at"),
                                    ws_id,
                                    s_id,
                                )
                            )
                            row = cur.fetchone()
                            if row:
                                item_id = row[0]
                            else:
                                duplicates += 1

                if item_id is None:
                    continue
                
                # Persister le score de fiabilité si présent
                if item_id and item.get("_reliability_score") is not None:
                    try:
                        with self.db.get_connection() as conn:
                            with conn.cursor() as cur:
                                cur.execute("""
                                    UPDATE items SET
                                        reliability_passed = TRUE,
                                        reliability_score  = %s,
                                        reliability_tier   = %s,
                                        reliability_reason = %s
                                    WHERE id = %s
                                """, (
                                    item["_reliability_score"],
                                    item.get("_reliability_tier"),
                                    item.get("_reliability_reason"),
                                    item_id,
                                ))
                                conn.commit()
                    except Exception:
                        pass  # non bloquant

                logger.info(f"Inserted item {item_id}: {item['title'][:50]}...")
                inserted += 1
                
            except Exception as e:
                logger.error(f"Failed to insert item: {e}")
                self.stats["errors"] += 1
        
        return inserted, duplicates
    
    def fetch_website_page(self, source_url: str, workspace_id: Optional[int] = None) -> List[Dict]:
        """
        Fetch web page(s) and extract title + text content as items.

        Crawl mode  (URL ends with '/'):
            Discovers and fetches ALL pages whose URL starts with source_url.
            Follows internal <a href> links found on each page, up to MAX_PAGES.

        Single mode (URL does NOT end with '/'):
            Fetches only that one page (previous behaviour).

        Uses stdlib html.parser — no extra dependency.
        """
        from html.parser import HTMLParser

        class _HTMLExtractor(HTMLParser):
            """Minimal extractor: title + visible text + hrefs, skips script/style/nav."""
            _SKIP = {'script', 'style', 'nav', 'header', 'footer', 'aside', 'noscript',
                     'banner', 'announcement'}
            # Prefer content from semantic main/article containers
            _MAIN = {'main', 'article'}

            def __init__(self):
                super().__init__()
                self._title_parts: list = []
                self._title_done: bool = False   # stop after first </title>
                self._chunks: list = []
                self._main_chunks: list = []     # content inside <main>/<article>
                self._in_title: bool = False
                self._skip_depth: int = 0
                self._main_depth: int = 0
                self.links: list = []

            # ── title property: accumulate parts + strip comment artefacts ──────
            @property
            def title(self) -> str:
                import re as _re
                raw = ' '.join(self._title_parts)
                # Strip HTML comment artefacts emitted by Next.js/React:
                # both <!-- --> (ASCII) and <!— —> (em-dash variant)
                clean = _re.sub(r'<![—\-][—\-].*?[—\-][—\-]>', '', raw)
                clean = _re.sub(r'<!--.*?-->', '', clean)
                return clean.strip()

            # ── preferred chunks: <main>/<article> if found, else full page ─────
            @property
            def content_chunks(self) -> list:
                return self._main_chunks if self._main_chunks else self._chunks

            def handle_starttag(self, tag, attrs):
                if tag == 'title' and not self._title_done:
                    self._in_title = True
                if tag in self._SKIP:
                    self._skip_depth += 1
                if tag in self._MAIN:
                    self._main_depth += 1
                if tag == 'a':
                    href = dict(attrs).get('href', '')
                    if href:
                        self.links.append(href)

            def handle_endtag(self, tag):
                if tag == 'title':
                    self._in_title = False
                    self._title_done = True  # ignore SVG <title> icons after this
                if tag in self._SKIP:
                    self._skip_depth = max(0, self._skip_depth - 1)
                if tag in self._MAIN:
                    self._main_depth = max(0, self._main_depth - 1)

            def handle_data(self, data):
                stripped = data.strip()
                if not stripped:
                    return
                if self._in_title:
                    self._title_parts.append(stripped)
                elif self._skip_depth == 0:
                    self._chunks.append(stripped)
                    if self._main_depth > 0:
                        self._main_chunks.append(stripped)

        import urllib3
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

        _pw_browser = None

        def _get_pw_browser():
            nonlocal _pw_browser
            if _pw_browser is None:
                from playwright.sync_api import sync_playwright
                _pw = sync_playwright().start()
                _pw_browser = _pw.chromium.launch(
                    headless=True,
                    args=["--no-sandbox", "--disable-dev-shm-usage"],
                )
            return _pw_browser

        def _is_js_shell(html: str) -> bool:
            """Return True when the HTML delivers almost no readable text (SPA shell)."""
            ext = _HTMLExtractor()
            ext.feed(html)
            return len(' '.join(ext.content_chunks)) < 200

        def _fetch_with_playwright(url: str) -> _HTMLExtractor:
            browser = _get_pw_browser()
            page = browser.new_page()
            try:
                page.goto(url, wait_until='domcontentloaded', timeout=45000)
                html = page.content()
                hrefs = page.eval_on_selector_all('a[href]', 'els => els.map(e => e.getAttribute("href"))')
            finally:
                page.close()
            ext = _HTMLExtractor()
            ext.feed(html)
            ext.links = hrefs
            return ext

        def _fetch_single(url: str) -> _HTMLExtractor:
            resp = requests.get(
                url,
                headers={'User-Agent': 'Mozilla/5.0 (compatible; ArgosBot/1.0)'},
                timeout=20,
                verify=False,
            )
            resp.raise_for_status()
            resp.encoding = resp.apparent_encoding or 'utf-8'
            if _is_js_shell(resp.text):
                logger.debug(f"JS shell detected, switching to Playwright: {url}")
                try:
                    return _fetch_with_playwright(url)
                except Exception as e:
                    logger.warning(f"Playwright fallback failed for {url}: {e}")
            ext = _HTMLExtractor()
            ext.feed(resp.text)
            return ext

        def _make_item(url: str, title: str, summary: str) -> Dict:
            return {
                "source_type": "website",
                "source_url": source_url,
                "url": url,
                "title": title,
                "summary": summary,
                "author": None,
                "published_at": None,
                "workspace_id": workspace_id,
            }

        def _compute_hash(text: str) -> str:
            return hashlib.sha256(text.encode('utf-8')).hexdigest()

        def _get_stored_hash(url: str) -> Optional[str]:
            """Récupère le hash stocké pour une URL dans documents."""
            try:
                with self.db_manager.get_connection() as conn:
                    with conn.cursor() as cur:
                        cur.execute(
                            "SELECT content_json->>'content_hash' FROM documents WHERE content_json->>'source_url' = %s ORDER BY created_at DESC LIMIT 1",
                            (url,)
                        )
                        row = cur.fetchone()
                        return row[0] if row else None
            except Exception:
                return None

        def _store_document(url: str, title: str, full_content: str, content_hash: str, ws_id: Optional[int], sujet_id: Optional[int]) -> int:
            """Stocke le contenu complet d'une page dans documents. Retourne l'id."""
            import json as _json
            try:
                with self.db_manager.get_connection() as conn:
                    with conn.cursor() as cur:
                        cur.execute("""
                            INSERT INTO documents (title, doc_type, content_markdown, content_json, workspace_id, sujet_id)
                            VALUES (%s, 'page', %s, %s::jsonb, %s, %s)
                            RETURNING id
                        """, (
                            title[:500],
                            full_content,
                            _json.dumps({"source_url": url, "content_hash": content_hash}),
                            ws_id,
                            sujet_id,
                        ))
                        doc_id = cur.fetchone()[0]
                        conn.commit()
                        return doc_id
            except Exception as e:
                logger.warning(f"Failed to store document for {url}: {e}")
                return -1

        def _compute_diff_summary(old_content: str, new_content: str) -> str:
            """Retourne les lignes ajoutées entre deux versions."""
            import difflib
            old_lines = old_content.splitlines()
            new_lines = new_content.splitlines()
            added = [
                line[2:] for line in difflib.unified_diff(old_lines, new_lines, lineterm='', n=0)
                if line.startswith('+ ') and not line.startswith('+++')
            ]
            return '\n'.join(added[:100])  # cap à 100 lignes

        def _get_sujet_id_for_source(url: str) -> Optional[int]:
            try:
                with self.db_manager.get_connection() as conn:
                    with conn.cursor() as cur:
                        cur.execute("SELECT sujet_id FROM sources WHERE url = %s", (url,))
                        row = cur.fetchone()
                        return row[0] if row else None
            except Exception:
                return None

        sujet_id = _get_sujet_id_for_source(source_url)
        crawl_mode = source_url.endswith('/')
        items: List[Dict] = []

        # ── Single page ─────────────────────────────────────────────────────────
        if not crawl_mode:
            try:
                ext = _fetch_single(source_url)
                title = ext.title or source_url
                full_content = ' '.join(ext.content_chunks)
                new_hash = _compute_hash(full_content)
                old_hash = _get_stored_hash(source_url)

                if old_hash is None:
                    # Premier crawl — stocker le contenu complet
                    _store_document(source_url, title, full_content, new_hash, workspace_id, sujet_id)
                    summary = self._extract_summary(full_content, 1500)
                    logger.info(f"Fetched website page (first): {title[:60]}…")
                    self.stats["fetched"] += 1
                    items.append(_make_item(source_url, title, summary))
                elif old_hash != new_hash:
                    # Contenu modifié — récupérer l'ancien contenu et calculer le diff
                    try:
                        with self.db_manager.get_connection() as conn:
                            with conn.cursor() as cur:
                                cur.execute(
                                    "SELECT content_markdown FROM documents WHERE content_json->>'source_url' = %s ORDER BY created_at DESC LIMIT 1",
                                    (source_url,)
                                )
                                row = cur.fetchone()
                                old_content = row[0] if row else ""
                    except Exception:
                        old_content = ""

                    diff_summary = _compute_diff_summary(old_content, full_content)
                    if diff_summary.strip():
                        # Mettre à jour le document archivé
                        _store_document(source_url, title, full_content, new_hash, workspace_id, sujet_id)
                        summary = f"[MISE À JOUR DÉTECTÉE]\n{diff_summary}"
                        logger.info(f"Change detected on: {title[:60]}…")
                        self.stats["fetched"] += 1
                        items.append(_make_item(source_url, f"[MàJ] {title}", summary))
                else:
                    logger.debug(f"No change detected: {source_url}")
            except Exception as e:
                logger.error(f"Failed to fetch website {source_url}: {e}")
                self.stats["errors"] += 1
            return items

        # ── Crawl mode: spider all sub-pages under base URL ──────────────────────
        from urllib.parse import urlparse
        _base_netloc = urlparse(source_url).netloc

        MAX_PAGES = 100
        visited: set = set()
        queue: List[str] = [source_url]

        while queue and len(visited) < MAX_PAGES:
            url = queue.pop(0)
            if url in visited:
                continue
            visited.add(url)
            try:
                ext = _fetch_single(url)
                title = ext.title or url
                full_content = ' '.join(ext.content_chunks)
                new_hash = _compute_hash(full_content)
                old_hash = _get_stored_hash(url)

                if old_hash is None:
                    # Nouvelle page — stocker et créer un item
                    _store_document(url, title, full_content, new_hash, workspace_id, sujet_id)
                    summary = self._extract_summary(full_content, 1500)
                    logger.info(f"Crawled new [{len(visited)}/{MAX_PAGES}]: {title[:60]}…")
                    self.stats["fetched"] += 1
                    items.append(_make_item(url, title, summary))
                elif old_hash != new_hash:
                    # Page modifiée — diff uniquement
                    try:
                        with self.db_manager.get_connection() as conn:
                            with conn.cursor() as cur:
                                cur.execute(
                                    "SELECT content_markdown FROM documents WHERE content_json->>'source_url' = %s ORDER BY created_at DESC LIMIT 1",
                                    (url,)
                                )
                                row = cur.fetchone()
                                old_content = row[0] if row else ""
                    except Exception:
                        old_content = ""

                    diff_summary = _compute_diff_summary(old_content, full_content)
                    if diff_summary.strip():
                        _store_document(url, title, full_content, new_hash, workspace_id, sujet_id)
                        summary = f"[MISE À JOUR DÉTECTÉE]\n{diff_summary}"
                        logger.info(f"Change detected [{len(visited)}/{MAX_PAGES}]: {title[:60]}…")
                        self.stats["fetched"] += 1
                        items.append(_make_item(url, f"[MàJ] {title}", summary))
                else:
                    logger.debug(f"No change: {url}")

                # Enqueue new internal links
                for href in ext.links:
                    abs_url = urljoin(url, href).split('#')[0]
                    parsed = urlparse(abs_url)
                    if (
                        abs_url not in visited
                        and abs_url not in queue
                        and parsed.netloc == _base_netloc
                        and parsed.scheme in ('http', 'https')
                        and len(visited) + len(queue) < MAX_PAGES
                    ):
                        queue.append(abs_url)
            except Exception as e:
                logger.error(f"Failed to crawl {url}: {e}")
                self.stats["errors"] += 1

        logger.info(f"Crawl complete for {source_url}: {len(items)} new/changed pages")
        return items

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
