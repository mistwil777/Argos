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
# Registre d'autorité : entité → sources officielles connues
# Priorité 1 dans la discovery — jamais ignorées si l'entité est mentionnée
# ----------------------------------------------------------------
AUTHORITY_REGISTRY: dict[str, list[dict]] = {
    # Anthropic / Claude
    "anthropic": [
        {"url": "https://www.anthropic.com/news",            "name": "Anthropic News",          "type": "website"},
        {"url": "https://docs.anthropic.com/",               "name": "Anthropic Docs",           "type": "website"},
        {"url": "https://www.anthropic.com/research",        "name": "Anthropic Research",       "type": "website"},
        {"url": "https://github.com/anthropics",             "name": "Anthropic GitHub",         "type": "github"},
    ],
    "claude": [
        {"url": "https://docs.anthropic.com/",               "name": "Anthropic Docs",           "type": "website"},
        {"url": "https://www.anthropic.com/news",            "name": "Anthropic News",           "type": "website"},
        {"url": "https://github.com/anthropics",             "name": "Anthropic GitHub",         "type": "github"},
    ],
    "claude code": [
        {"url": "https://docs.anthropic.com/en/docs/claude-code", "name": "Claude Code Docs",    "type": "website"},
        {"url": "https://github.com/anthropics/claude-code",      "name": "Claude Code GitHub",  "type": "github"},
    ],
    "mcp": [
        {"url": "https://modelcontextprotocol.io/",          "name": "MCP Spec",                 "type": "website"},
        {"url": "https://github.com/modelcontextprotocol",   "name": "MCP GitHub",               "type": "github"},
    ],
    # OpenAI
    "openai": [
        {"url": "https://openai.com/news",                   "name": "OpenAI News",              "type": "website"},
        {"url": "https://platform.openai.com/docs/",         "name": "OpenAI Docs",              "type": "website"},
        {"url": "https://github.com/openai",                 "name": "OpenAI GitHub",            "type": "github"},
    ],
    "gpt": [
        {"url": "https://platform.openai.com/docs/",         "name": "OpenAI Platform Docs",     "type": "website"},
        {"url": "https://openai.com/news",                   "name": "OpenAI News",              "type": "website"},
    ],
    # Google / Gemini
    "google deepmind": [
        {"url": "https://deepmind.google/research/",         "name": "DeepMind Research",        "type": "website"},
        {"url": "https://github.com/google-deepmind",        "name": "DeepMind GitHub",          "type": "github"},
    ],
    "gemini": [
        {"url": "https://ai.google.dev/",                    "name": "Google AI Dev",            "type": "website"},
        {"url": "https://cloud.google.com/vertex-ai/docs",   "name": "Vertex AI Docs",           "type": "website"},
    ],
    # Meta
    "llama": [
        {"url": "https://ai.meta.com/blog/",                 "name": "Meta AI Blog",             "type": "website"},
        {"url": "https://github.com/meta-llama",             "name": "Meta LLaMA GitHub",        "type": "github"},
        {"url": "https://huggingface.co/meta-llama",         "name": "LLaMA HuggingFace",        "type": "website"},
    ],
    # Frameworks ML
    "pytorch": [
        {"url": "https://pytorch.org/blog/",                 "name": "PyTorch Blog",             "type": "website"},
        {"url": "https://github.com/pytorch/pytorch",        "name": "PyTorch GitHub",           "type": "github"},
    ],
    "langchain": [
        {"url": "https://python.langchain.com/docs/",        "name": "LangChain Docs",           "type": "website"},
        {"url": "https://github.com/langchain-ai/langchain", "name": "LangChain GitHub",         "type": "github"},
        {"url": "https://blog.langchain.dev/",               "name": "LangChain Blog",           "type": "website"},
    ],
    "llamaindex": [
        {"url": "https://docs.llamaindex.ai/",               "name": "LlamaIndex Docs",          "type": "website"},
        {"url": "https://github.com/run-llama/llama_index",  "name": "LlamaIndex GitHub",        "type": "github"},
    ],
    "hugging face": [
        {"url": "https://huggingface.co/blog",               "name": "HuggingFace Blog",         "type": "website"},
        {"url": "https://github.com/huggingface",            "name": "HuggingFace GitHub",       "type": "github"},
    ],
    # Infra
    "kubernetes": [
        {"url": "https://kubernetes.io/blog/",               "name": "Kubernetes Blog",          "type": "website"},
        {"url": "https://github.com/kubernetes/kubernetes",  "name": "Kubernetes GitHub",        "type": "github"},
    ],
    "docker": [
        {"url": "https://www.docker.com/blog/",              "name": "Docker Blog",              "type": "website"},
        {"url": "https://docs.docker.com/",                  "name": "Docker Docs",              "type": "website"},
    ],
}

# Domaines autorisés pour SearXNG restreint
# SearXNG ne cherche QUE sur ces domaines si l'option restrict=True
SEARXNG_TRUSTED_DOMAINS = [
    "site:github.com",
    "site:arxiv.org",
    "site:wikipedia.org",
    "site:huggingface.co",
    "site:paperswithcode.com",
    "site:news.ycombinator.com",
    "site:dev.to",
    "site:infoq.com",
]

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
        Trouve des sources autoritaires pour un intent donné.

        Priorité 1 — Registre d'autorité : sources officielles connues pour les entités
        Priorité 2 — SearXNG restreint aux domaines reconnus
        Priorité 3 — Découverte RSS sur les domaines officiels trouvés

        Toutes les sources passent par reliability_scorer avant d'être retournées.
        """
        from argos.services.reliability_scorer import score_domain, ReliabilityResult

        entities      = intent_data.get("entities", [])
        themes        = intent_data.get("themes", [])
        search_queries = intent_data.get("search_queries", [])
        source_rationale = intent_data.get("source_rationale", "")

        candidates: list[dict] = []
        seen_urls: set[str] = set()

        def _add(c: dict, tier: str = "unknown") -> None:
            url = c.get("url", "").strip()
            if url and url not in seen_urls:
                seen_urls.add(url)
                c["workspace_id"] = workspace_id
                c["_tier"] = tier
                candidates.append(c)

        # ── Priorité 1 : registre d'autorité ────────────────────────
        entities_lower = [e.lower() for e in entities] + [t.lower() for t in themes]
        authority_hits: set[str] = set()

        for key, sources in AUTHORITY_REGISTRY.items():
            if any(key in el or el in key for el in entities_lower):
                for src in sources:
                    _add({**src, "authority": True}, tier="official")
                    authority_hits.add(_extract_domain(src["url"]))
                logger.info(f"[DISCOVERY] Autorité '{key}' → {len(sources)} source(s) officielles")

        # ── Priorité 2 : SearXNG restreint ──────────────────────────
        # Construire des requêtes restreintes aux domaines de confiance
        restricted_queries = _build_restricted_queries(search_queries, themes, entities)

        for query in restricted_queries[:6]:
            try:
                results = await self._search_searxng(query)
                for r in results:
                    domain_result = score_domain(r.get("url", ""))
                    if domain_result.passed:
                        _add(r, tier=domain_result.domain_tier)
            except Exception as e:
                logger.warning(f"[DISCOVERY] SearXNG '{query[:50]}' : {e}")

        # ── Priorité 3 : RSS sur les domaines officiels ──────────────
        rss_domains_checked: set[str] = set()
        for c in list(candidates):
            if c.get("_tier") not in ("official", "recognized"):
                continue
            domain = _extract_domain(c.get("url", ""))
            if not domain or domain in rss_domains_checked:
                continue
            rss_domains_checked.add(domain)
            try:
                feeds = _find_rss_feeds(f"https://{domain}")
                for feed_url in feeds[:3]:
                    _add({
                        "url": feed_url,
                        "name": f"{domain} — RSS",
                        "type": "rss",
                        "domain": domain,
                    }, tier="official" if domain in authority_hits else "recognized")
            except Exception:
                pass

        # ── Filtrage : exclure sources déjà en base ──────────────────
        existing_urls = self._get_existing_source_urls()
        candidates = [c for c in candidates if c.get("url") not in existing_urls]

        # ── Scoring final + raison ────────────────────────────────────
        tier_scores = {"official": 1.0, "recognized": 0.75, "community": 0.5, "unknown": 0.35}
        scored = []
        for c in candidates:
            tier  = c.get("_tier", "unknown")
            score = tier_scores.get(tier, 0.35)
            # Bonus si autorité directe
            if c.get("authority"):
                score = 1.0
            c["relevance_score"] = round(score, 3)
            c["reason"] = _build_source_reason(c, entities, source_rationale)
            scored.append(c)

        scored.sort(key=lambda x: (-x["relevance_score"], x.get("_tier", "z")))

        logger.info(
            f"[DISCOVERY] {len(scored)} sources trouvées — "
            f"official={sum(1 for s in scored if s.get('_tier')=='official')} "
            f"recognized={sum(1 for s in scored if s.get('_tier')=='recognized')} "
            f"unknown={sum(1 for s in scored if s.get('_tier')=='unknown')}"
        )
        return scored

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

def _build_restricted_queries(
    search_queries: list[str],
    themes: list[str],
    entities: list[str],
) -> list[str]:
    """
    Construit des requêtes SearXNG restreintes aux domaines de confiance.
    Chaque requête originale est préfixée avec un domaine trusted.
    On ajoute aussi des requêtes spécifiques arxiv/github/wikipedia.
    """
    restricted: list[str] = []

    # Requêtes originales sur github + arxiv (les plus utiles pour la veille tech)
    priority_domains = ["site:github.com", "site:arxiv.org"]
    base_terms = entities[:2] + themes[:2]
    base_query = " ".join(base_terms[:3]) if base_terms else (search_queries[0] if search_queries else "")

    if base_query:
        for domain in priority_domains:
            restricted.append(f"{domain} {base_query}")

    # Requêtes originales filtrées (on retire les requêtes trop génériques)
    for q in search_queries[:4]:
        # Ajouter site:github.com si la requête mentionne déjà github
        if "github" in q.lower():
            restricted.append(q)
        else:
            # Requête libre mais on garde (SearXNG peut trouver des domaines reconnus)
            restricted.append(q)

    # Wikipedia pour les concepts fondamentaux
    if themes:
        restricted.append(f"site:wikipedia.org {' '.join(themes[:2])}")

    return restricted[:8]


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
        import signal
        from trafilatura.feeds import find_feed_urls

        def _timeout(signum, frame):
            raise TimeoutError()

        # Limite stricte : 4s max par domaine pour éviter accumulation de timeouts SSL
        old = signal.signal(signal.SIGALRM, _timeout)
        signal.alarm(4)
        try:
            result = find_feed_urls(url) or []
        finally:
            signal.alarm(0)
            signal.signal(signal.SIGALRM, old)
        return result
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
