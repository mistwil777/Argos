"""
Argos Intent Discovery

Deux responsabilités :
  1. IntentService  : décompose une intention utilisateur (texte libre) en axes de recherche
  2. DiscoveryService : trouve et valide des sources pertinentes à partir de ces axes

Un seul appel LLM (décomposition de l'intent).
Tout le reste est déterministe : SearXNG + trafilatura + scoring domaine.
"""

import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)

# ----------------------------------------------------------------
# Prompt de décomposition d'intent
# ----------------------------------------------------------------
_INTENT_SYSTEM = """Tu es un expert en veille technologique.
Tu reçois une intention de veille exprimée en langage naturel et tu la décomposes
en axes de recherche structurés pour trouver les meilleures sources d'information.

Réponds UNIQUEMENT avec un objet JSON valide, sans markdown, sans explication."""

_INTENT_PROMPT = """Intention de veille : "{intent}"

Décompose cette intention en :
- entities : liste des entités nommées clés (entreprises, produits, technologies, personnes)
- themes : liste des thèmes et sujets à surveiller (5 max)
- source_types : types de sources les plus pertinents parmi ["rss", "github", "arxiv", "website", "blog", "docs", "news"]
- search_queries : liste de 5 requêtes de recherche web optimisées pour trouver des sources (pas des articles)
- keywords : mots-clés de filtrage pour la classification (10 max)
- source_rationale : explication courte en français (1-2 phrases) expliquant POURQUOI ces types de sources ont été choisis pour cette intention

Format JSON attendu :
{{
  "entities": ["..."],
  "themes": ["..."],
  "source_types": ["..."],
  "search_queries": ["site:github.com ...", "...feed RSS...", "..."],
  "keywords": ["..."],
  "source_rationale": "..."
}}"""


# ----------------------------------------------------------------
# IntentService
# ----------------------------------------------------------------
class IntentService:

    def __init__(self, anthropic_api_key: Optional[str] = None):
        self._api_key = anthropic_api_key or os.getenv("ANTHROPIC_API_KEY")
        if not self._api_key:
            raise ValueError("ANTHROPIC_API_KEY requis pour IntentService")

    async def decompose(self, intent: str) -> dict:
        """
        Décompose une intention en langage naturel en axes de recherche structurés.
        Retourne un dict avec entities, themes, source_types, search_queries, keywords.
        """
        import json
        import anthropic

        client = anthropic.AsyncAnthropic(api_key=self._api_key)

        message = await client.messages.create(
            model="claude-opus-4-5",
            max_tokens=1024,
            system=_INTENT_SYSTEM,
            messages=[{
                "role": "user",
                "content": _INTENT_PROMPT.format(intent=intent),
            }],
        )

        raw = message.content[0].text.strip()

        try:
            result = json.loads(raw)
        except json.JSONDecodeError:
            # Tentative de récupération si le LLM a ajouté du markdown
            import re
            match = re.search(r"\{.*\}", raw, re.DOTALL)
            if match:
                result = json.loads(match.group())
            else:
                logger.error(f"Intent decomposition : JSON invalide\n{raw}")
                raise ValueError("Réponse LLM non parseable")

        logger.info(
            f"[INTENT] Décomposé : {len(result.get('entities',[]))} entités, "
            f"{len(result.get('themes',[]))} thèmes, "
            f"{len(result.get('search_queries',[]))} requêtes"
        )
        return result


# ----------------------------------------------------------------
# DiscoveryService
# ----------------------------------------------------------------
class DiscoveryService:

    def __init__(
        self,
        db_manager,
        searxng_url: Optional[str] = None,
    ):
        self._db = db_manager
        self._searxng_url = searxng_url or os.getenv("SEARXNG_URL", "http://searxng:8080")

    async def find_sources(self, intent_data: dict, workspace_id: Optional[int] = None) -> list[dict]:
        """
        Trouve des sources candidates à partir des axes d'intent.
        Retourne une liste de sources avec leur score de pertinence.
        """
        search_queries = intent_data.get("search_queries", [])
        entities = intent_data.get("entities", [])
        source_types = intent_data.get("source_types", [])

        candidates: list[dict] = []

        # 1. Recherche SearXNG sur chaque requête
        for query in search_queries[:5]:
            try:
                results = await self._search_searxng(query)
                candidates.extend(results)
            except Exception as e:
                logger.warning(f"[DISCOVERY] SearXNG échoué pour '{query}' : {e}")

        # 2. Découverte RSS sur les domaines trouvés
        domains_seen = set()
        rss_candidates = []
        for c in candidates:
            domain = _extract_domain(c.get("url", ""))
            if domain and domain not in domains_seen:
                domains_seen.add(domain)
                try:
                    feeds = _find_rss_feeds(f"https://{domain}")
                    for feed_url in feeds[:2]:
                        rss_candidates.append({
                            "url": feed_url,
                            "name": f"{domain} — RSS",
                            "type": "rss",
                            "domain": domain,
                        })
                except Exception:
                    pass

        candidates.extend(rss_candidates)

        # 3. Déduplication par URL
        seen_urls = set()
        unique: list[dict] = []
        for c in candidates:
            url = c.get("url", "")
            if url and url not in seen_urls:
                seen_urls.add(url)
                unique.append(c)

        # 4. Filtrage : exclure les sources déjà en base
        existing_urls = self._get_existing_source_urls()
        unique = [c for c in unique if c.get("url") not in existing_urls]

        # 5. Scoring + raison littérale par source
        from argos.services.scorer import domain_score
        source_rationale = intent_data.get("source_rationale", "")
        scored = []
        for c in unique:
            d_score = domain_score(c.get("url", ""))
            src_type = c.get("type", "website")
            type_bonus = 0.1 if src_type in source_types else 0.0
            c["relevance_score"] = round(min(d_score + type_bonus, 1.0), 3)
            c["workspace_id"] = workspace_id
            c["reason"] = _build_source_reason(c, entities, source_rationale)
            scored.append(c)

        # Tri par score décroissant, limité à 20 candidats
        scored.sort(key=lambda x: x["relevance_score"], reverse=True)
        top = scored[:20]

        logger.info(f"[DISCOVERY] {len(top)} sources candidates trouvées")
        return top

    async def create_sources(self, candidates: list[dict]) -> list[dict]:
        """
        Crée les sources validées en base et déclenche le premier collect.
        Retourne la liste des sources créées avec leur id.
        """
        created = []
        for c in candidates:
            try:
                source_id = self._insert_source(c)
                if source_id:
                    c["id"] = source_id
                    created.append(c)
            except Exception as e:
                logger.warning(f"[DISCOVERY] Création source {c.get('url')} échouée : {e}")

        logger.info(f"[DISCOVERY] {len(created)} sources créées en base")

        # Déclenche le premier collect en background
        if created:
            import asyncio
            asyncio.ensure_future(self._initial_collect(created))

        return created

    # ----------------------------------------------------------------
    # Méthodes privées
    # ----------------------------------------------------------------

    async def _search_searxng(self, query: str) -> list[dict]:
        """Recherche SearXNG et retourne les URLs trouvées."""
        import httpx
        params = {
            "q": query,
            "format": "json",
            "categories": "general",
            "language": "fr-FR",
        }
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(f"{self._searxng_url}/search", params=params)
            r.raise_for_status()
            data = r.json()

        results = []
        for item in data.get("results", [])[:10]:
            url = item.get("url", "")
            if url:
                results.append({
                    "url": url,
                    "name": item.get("title", url)[:255],
                    "type": _guess_source_type(url),
                    "domain": _extract_domain(url),
                    "description": item.get("content", "")[:500],
                })
        return results

    def _get_existing_source_urls(self) -> set[str]:
        with self._db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT url FROM sources")
                return {r[0] for r in cur.fetchall()}

    def _insert_source(self, candidate: dict) -> Optional[int]:
        source_type = candidate.get("type", "website")
        if source_type not in ("rss", "website", "github", "api"):
            source_type = "website"

        with self._db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO sources (name, url, type, description, active, workspace_id)
                    VALUES (%s, %s, %s, %s, TRUE, %s)
                    ON CONFLICT (url) DO NOTHING
                    RETURNING id
                """, (
                    candidate.get("name", candidate["url"])[:255],
                    candidate["url"],
                    source_type,
                    candidate.get("description", "")[:500],
                    candidate.get("workspace_id"),
                ))
                row = cur.fetchone()
                conn.commit()
                return row[0] if row else None

    async def _initial_collect(self, sources: list[dict]) -> None:
        """Premier collect immédiat après création des sources."""
        try:
            from argos.services.collector import CollectorService
            collector = CollectorService(db_manager=self._db)
            for source in sources:
                try:
                    await collector.fetch_website_page(source["url"], source.get("workspace_id"))
                except Exception as e:
                    logger.debug(f"[DISCOVERY] Initial collect {source['url']} : {e}")
        except Exception as e:
            logger.warning(f"[DISCOVERY] Initial collect échoué : {e}")


# ----------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------

def _extract_domain(url: str) -> str:
    try:
        import tldextract
        ext = tldextract.extract(url)
        return f"{ext.domain}.{ext.suffix}" if ext.domain else ""
    except Exception:
        from urllib.parse import urlparse
        return urlparse(url).netloc.lstrip("www.")


def _guess_source_type(url: str) -> str:
    url_lower = url.lower()
    if "github.com" in url_lower:
        return "github"
    if "arxiv.org" in url_lower:
        return "arxiv"
    if any(x in url_lower for x in ["/feed", "/rss", ".rss", ".atom", "/atom"]):
        return "rss"
    return "website"


def _find_rss_feeds(url: str) -> list[str]:
    try:
        from trafilatura.feeds import find_feed_urls
        return find_feed_urls(url) or []
    except Exception:
        return []

# Libellés des types de sources pour les raisons lisibles
_TYPE_LABELS = {
    "rss":     "flux RSS",
    "github":  "dépôt GitHub",
    "arxiv":   "publication académique",
    "website": "site web",
    "blog":    "blog",
    "docs":    "documentation officielle",
    "news":    "site d'actualités",
}

_DOMAIN_NOTES = {
    "github.com":      "héberge le code source et les projets open source",
    "arxiv.org":       "publie des articles de recherche avant peer-review",
    "huggingface.co":  "plateforme de référence pour les modèles et datasets IA",
    "medium.com":      "agrège des articles de praticiens et de chercheurs",
    "substack.com":    "newsletters de spécialistes indépendants",
    "reddit.com":      "discussions communautaires entre praticiens",
}


def _build_source_reason(source: dict, entities: list[str], rationale: str) -> str:
    """Génère une explication littérale en français pour une source candidate."""
    url        = source.get("url", "")
    name       = source.get("name", url)
    src_type   = source.get("type", "website")
    domain     = _extract_domain(url)
    type_label = _TYPE_LABELS.get(src_type, "source")
    domain_note = _DOMAIN_NOTES.get(domain, "")

    parts = []

    # Ligne 1 : pourquoi ce type
    if rationale:
        parts.append(rationale)
    else:
        if src_type == "github":
            parts.append("Les dépôts GitHub permettent de suivre les projets open source et les évolutions du code en temps réel.")
        elif src_type == "arxiv":
            parts.append("ArXiv publie les travaux de recherche récents avant leur validation officielle, idéal pour suivre l'état de l'art.")
        elif src_type == "rss":
            parts.append(f"Le flux RSS de {name} permet de recevoir automatiquement les nouveaux contenus sans visiter le site.")
        else:
            parts.append(f"Ce {type_label} a été sélectionné car son contenu correspond aux axes de votre demande.")

    # Ligne 2 : note sur le domaine si connue
    if domain_note:
        parts.append(f"{domain} {domain_note}.")

    # Ligne 3 : lien avec les entités
    matched = [e for e in entities if e.lower() in url.lower() or e.lower() in name.lower()]
    if matched:
        parts.append(f"Correspond directement à : {', '.join(matched)}.")

    return " ".join(parts)
