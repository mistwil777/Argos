"""
Site Monitor Service — AcademiaOps
Surveille périodiquement des pages web pour détecter les nouveaux contenus
et enrichir automatiquement la base de connaissance RAG.

Principe :
  1. Pour chaque source de type 'website' avec monitor_enabled=True :
     a. Scrapper la page (ou le flux de page)
     b. Calculer un hash SHA-256 du contenu textuel
     c. Comparer avec le hash stocké en base
     d. Si différent :
        - Extraire le nouveau contenu (titres / paragraphes ajoutés)
        - Créer un item 'pending' en base
        - Notifier via Teams
        - Mettre à jour le hash et last_checked_at
  2. Un scheduler asyncio tourne en fond et appelle check_all_sources()
     en respectant l'intervalle configuré par source.
"""

import asyncio
import hashlib
import logging
import re
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import urljoin, urlparse

import requests

from argos.database import DatabaseManager

logger = logging.getLogger(__name__)

# User-agent pour le scraping (poli)
_UA = "Mozilla/5.0 (compatible; VeilleBot/1.0; +https://github.com/academiaops)"


# ============================================================================
# Helpers HTML
# ============================================================================

def _fetch_text_and_links(url: str) -> tuple[str, list[str]]:
    """
    Fetch a URL and return (visible_text, [internal_links]).
    Uses stdlib html.parser — aucune dépendance supplémentaire.
    """
    from html.parser import HTMLParser

    class _Extractor(HTMLParser):
        _SKIP = {"script", "style", "nav", "header", "footer",
                 "aside", "noscript", "svg", "button", "form"}
        _MAIN = {"main", "article", "section"}

        def __init__(self):
            super().__init__()
            self._chunks: list[str] = []
            self._main_chunks: list[str] = []
            self._skip: int = 0
            self._main: int = 0
            self.links: list[str] = []

        @property
        def text(self) -> str:
            source = self._main_chunks if self._main_chunks else self._chunks
            return " ".join(source)

        def handle_starttag(self, tag, attrs):
            attrs_d = dict(attrs)
            if tag in self._SKIP:
                self._skip += 1
            if tag in self._MAIN:
                self._main += 1
            if tag == "a":
                href = attrs_d.get("href", "")
                if href and not href.startswith(("#", "mailto:", "tel:", "javascript:")):
                    self.links.append(href)

        def handle_endtag(self, tag):
            if tag in self._SKIP:
                self._skip = max(0, self._skip - 1)
            if tag in self._MAIN:
                self._main = max(0, self._main - 1)

        def handle_data(self, data):
            stripped = data.strip()
            if not stripped or self._skip:
                return
            self._chunks.append(stripped)
            if self._main:
                self._main_chunks.append(stripped)

    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

    resp = requests.get(url, headers={"User-Agent": _UA}, timeout=20, verify=False)
    resp.raise_for_status()
    parser = _Extractor()
    parser.feed(resp.text)
    return parser.text, parser.links


def _content_hash(text: str) -> str:
    """SHA-256 hex digest of normalised page text."""
    normalised = re.sub(r"\s+", " ", text).strip().lower()
    return hashlib.sha256(normalised.encode("utf-8")).hexdigest()


def _extract_new_snippets(old_text: str, new_text: str, max_chars: int = 2000) -> str:
    """
    Retourne les lignes/phrases présentes dans new_text mais absentes de old_text.
    Approximation simple : différence de tokens (mots) normalisés.
    """
    if not old_text:
        return new_text[:max_chars]

    old_words = set(re.sub(r"\s+", " ", old_text).lower().split())
    new_sentences = re.split(r"(?<=[.!?])\s+", new_text)

    new_content = []
    accumulated = 0
    for sentence in new_sentences:
        words = sentence.lower().split()
        if not words:
            continue
        # Sentence is "new" if > 50% of its words aren't in old_text
        unknown = sum(1 for w in words if w not in old_words)
        if unknown / len(words) > 0.5:
            new_content.append(sentence.strip())
            accumulated += len(sentence)
            if accumulated >= max_chars:
                break

    result = " ".join(new_content)
    if not result:
        # fallback: just return the beginning of new content
        result = new_text[:max_chars]
    return result[:max_chars]


# ============================================================================
# SiteMonitorService
# ============================================================================

class SiteMonitorService:
    """
    Surveille les sources de type 'website' pour détecter les changements.
    Notifie via Teams et crée des items 'pending' en base.
    """

    def __init__(
        self,
        db_manager: DatabaseManager,
        teams_bot=None,        # Optional[TeamsBot] — injecté si configuré
        dashboard_url: str = "http://localhost:3000",
    ):
        self.db = db_manager
        self.teams_bot = teams_bot
        self.dashboard_url = dashboard_url
        self._running = False
        self._task: Optional[asyncio.Task] = None

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def check_source(self, source_id: int) -> dict:
        """
        Vérifie une source spécifique.
        Retourne un dict avec les résultats de la vérification.
        """
        source = self._load_source(source_id)
        if not source:
            return {"error": f"Source {source_id} introuvable"}

        url = source["url"]
        old_hash = source.get("content_hash") or ""
        old_text = source.get("_cached_text", "")  # Not stored — diff is hash-based

        logger.info(f"[monitor] Vérification source={source_id} url={url}")

        try:
            new_text, _links = _fetch_text_and_links(url)
        except Exception as exc:
            logger.warning(f"[monitor] Erreur scraping source={source_id}: {exc}")
            self._update_checked_at(source_id)
            return {"source_id": source_id, "changed": False, "error": str(exc)}

        new_hash = _content_hash(new_text)
        changed = new_hash != old_hash and bool(old_hash)  # 1ère vérification : pas d'alerte

        result = {
            "source_id": source_id,
            "source_name": source["name"],
            "url": url,
            "changed": changed,
            "first_check": not bool(old_hash),
        }

        if changed:
            snippet = _extract_new_snippets(old_text="", new_text=new_text)
            item_id = self._create_pending_item(source, snippet)
            result["item_id"] = item_id
            logger.info(f"[monitor] Changement détecté source={source_id} → item={item_id}")

            # Notification Teams
            if self.teams_bot:
                await self._notify_teams(source, snippet, item_id)

        # Mettre à jour hash et last_checked_at
        self._update_hash(source_id, new_hash)

        return result

    async def check_all_sources(self) -> list[dict]:
        """
        Vérifie toutes les sources website avec monitor_enabled=True
        dont l'intervalle est écoulé.
        """
        sources = self._load_due_sources()
        logger.info(f"[monitor] {len(sources)} source(s) à vérifier")

        results = []
        for source in sources:
            try:
                res = await self.check_source(source["id"])
                results.append(res)
            except Exception as exc:
                logger.error(f"[monitor] Erreur source={source['id']}: {exc}")
                results.append({"source_id": source["id"], "error": str(exc)})

        return results

    async def start_scheduler(self, poll_interval_seconds: int = 60):
        """
        Lance la boucle de surveillance en fond.
        Toutes les `poll_interval_seconds` secondes, vérifie les sources dues.
        """
        if self._running:
            logger.warning("[monitor] Scheduler déjà en cours")
            return

        self._running = True
        logger.info(f"[monitor] Scheduler démarré (poll={poll_interval_seconds}s)")

        async def _loop():
            while self._running:
                try:
                    await self.check_all_sources()
                except Exception as exc:
                    logger.error(f"[monitor] Erreur dans la boucle scheduler: {exc}")
                await asyncio.sleep(poll_interval_seconds)

        self._task = asyncio.create_task(_loop())

    def stop_scheduler(self):
        """Arrête la boucle de surveillance."""
        self._running = False
        if self._task and not self._task.done():
            self._task.cancel()
            logger.info("[monitor] Scheduler arrêté")

    # ------------------------------------------------------------------
    # Database helpers
    # ------------------------------------------------------------------

    def _load_source(self, source_id: int) -> Optional[dict]:
        """Charge une source depuis la base de données."""
        with self.db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id, name, url, type, content_hash,
                           last_checked_at, check_interval_minutes,
                           monitor_enabled, workspace_id
                    FROM sources
                    WHERE id = %s
                    """,
                    (source_id,),
                )
                row = cur.fetchone()
                if not row:
                    return None
                return {
                    "id": row[0],
                    "name": row[1],
                    "url": row[2],
                    "type": row[3],
                    "content_hash": row[4],
                    "last_checked_at": row[5],
                    "check_interval_minutes": row[6] or 60,
                    "monitor_enabled": row[7],
                    "workspace_id": row[8],
                }

    def _load_due_sources(self) -> list[dict]:
        """
        Charge les sources website dont l'intervalle de vérification est écoulé.
        Une source non encore vérifiée (last_checked_at IS NULL) est toujours due.
        """
        with self.db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id, name, url, type, content_hash,
                           last_checked_at, check_interval_minutes,
                           monitor_enabled, workspace_id
                    FROM sources
                    WHERE type = 'website'
                      AND monitor_enabled = TRUE
                      AND (
                          last_checked_at IS NULL
                          OR last_checked_at + (check_interval_minutes * INTERVAL '1 minute')
                             <= NOW()
                      )
                    ORDER BY last_checked_at ASC NULLS FIRST
                    """,
                )
                rows = cur.fetchall()
                return [
                    {
                        "id": r[0], "name": r[1], "url": r[2], "type": r[3],
                        "content_hash": r[4], "last_checked_at": r[5],
                        "check_interval_minutes": r[6] or 60,
                        "monitor_enabled": r[7], "workspace_id": r[8],
                    }
                    for r in rows
                ]

    def _update_hash(self, source_id: int, new_hash: str):
        """Met à jour content_hash et last_checked_at."""
        with self.db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE sources
                    SET content_hash = %s,
                        last_checked_at = NOW(),
                        updated_at = NOW()
                    WHERE id = %s
                    """,
                    (new_hash, source_id),
                )
                conn.commit()

    def _update_checked_at(self, source_id: int):
        """Met à jour uniquement last_checked_at (en cas d'erreur de scraping)."""
        with self.db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE sources SET last_checked_at = NOW() WHERE id = %s",
                    (source_id,),
                )
                conn.commit()

    def _create_pending_item(self, source: dict, content: str) -> Optional[int]:
        """
        Crée un item 'pending' dans la table items pour le nouveau contenu détecté.
        Retourne l'ID de l'item créé.
        """
        title = f"[Mise à jour] {source['name']} — {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M')} UTC"
        url = source["url"]
        summary = content[:1500] if content else "Nouveau contenu détecté"

        try:
            with self.db.get_connection() as conn:
                with conn.cursor() as cur:
                    # Éviter les doublons : vérifier si un item récent existe déjà
                    # pour cette URL dans les dernières 24h
                    cur.execute(
                        """
                        SELECT id FROM items
                        WHERE source_url = %s
                          AND created_at >= NOW() - INTERVAL '24 hours'
                        LIMIT 1
                        """,
                        (url,),
                    )
                    if cur.fetchone():
                        logger.info(f"[monitor] Item récent déjà existant pour {url}, ignoré")
                        return None

                    cur.execute(
                        """
                        INSERT INTO items
                            (source_type, source_url, title, content, url,
                             validation_status, created_at, updated_at)
                        VALUES
                            ('website', %s, %s, %s, %s,
                             'pending', NOW(), NOW())
                        RETURNING id
                        """,
                        (url, title, summary, url),
                    )
                    item_id = cur.fetchone()[0]
                    conn.commit()
                    return item_id
        except Exception as exc:
            logger.error(f"[monitor] Erreur création item: {exc}")
            return None

    # ------------------------------------------------------------------
    # Teams notification
    # ------------------------------------------------------------------

    async def _notify_teams(self, source: dict, snippet: str, item_id: Optional[int]):
        """Envoie une notification Teams pour un nouveau contenu détecté."""
        try:
            await self.teams_bot.send_new_content_detected(
                source_name=source["name"],
                source_url=source["url"],
                snippet=snippet[:300] + "..." if len(snippet) > 300 else snippet,
                item_id=item_id,
                dashboard_url=self.dashboard_url,
            )
        except Exception as exc:
            logger.error(f"[monitor] Erreur notification Teams: {exc}")


# ============================================================================
# Singleton
# ============================================================================

_monitor_instance: Optional[SiteMonitorService] = None


def get_site_monitor() -> Optional[SiteMonitorService]:
    return _monitor_instance


def init_site_monitor(
    db_manager: DatabaseManager,
    teams_bot=None,
    dashboard_url: str = "http://localhost:3000",
) -> SiteMonitorService:
    global _monitor_instance
    _monitor_instance = SiteMonitorService(
        db_manager=db_manager,
        teams_bot=teams_bot,
        dashboard_url=dashboard_url,
    )
    return _monitor_instance
