"""
Argos Reliability Scorer — Chantier 1

Score binaire de fiabilité pour les sources et items collectés.
Remplace le scoring Tranco/textstat par une évaluation qualitative.

Deux niveaux :
  - Niveau domaine : évalué une fois par domaine, mis en cache
  - Niveau item    : évalué à chaque ingestion

Résultat : ReliabilityResult(passed=bool, score=float, reason=str)
"""

import logging
import re
from dataclasses import dataclass
from typing import Optional
from urllib.parse import urlparse

logger = logging.getLogger(__name__)


# ─── Résultat ────────────────────────────────────────────────────────────────

@dataclass
class ReliabilityResult:
    passed: bool
    score: float          # 0.0 → 1.0, informatif uniquement
    reason: str           # explication lisible
    domain_tier: str      # "official" | "recognized" | "community" | "unknown" | "rejected"


# ─── Liste blanche officielle ─────────────────────────────────────────────────
# Domaines dont l'autorité est certaine — score maximal, jamais rejetés

OFFICIAL_DOMAINS: set[str] = {
    # Anthropic
    "anthropic.com", "docs.anthropic.com", "code.claude.com",
    # GitHub officiel Anthropic
    "github.com",          # évalué plus finement au niveau repo
    # Recherche
    "arxiv.org", "paperswithcode.com", "semanticscholar.org",
    # Référence générale
    "wikipedia.org", "en.wikipedia.org",
    # OpenAI (concurrence directe à surveiller)
    "openai.com", "platform.openai.com",
    # Google DeepMind
    "deepmind.google", "research.google",
    # Meta AI
    "ai.meta.com",
    # Hugging Face
    "huggingface.co",
    # PyTorch / TensorFlow
    "pytorch.org", "tensorflow.org",
    # LangChain / LlamaIndex
    "python.langchain.com", "docs.llamaindex.ai",
    # Kubernetes / Docker (infra MLOps)
    "kubernetes.io", "docs.docker.com",
    # Standards web
    "developer.mozilla.org", "w3.org",
    # Documentation technique reconnue
    "readthedocs.io", "readthedocs.org",
    # Registres officiels
    "pypi.org", "npmjs.com",
    # Google AI / Cloud
    "ai.google.dev", "cloud.google.com", "research.google.com",
    # Protocoles / specs ouverts
    "modelcontextprotocol.io",
    # Frameworks (blogs officiels)
    "blog.langchain.dev", "langchain.dev",
    "docker.com", "www.docker.com",
    # MLflow (Apache / Linux Foundation)
    "mlflow.org", "www.mlflow.org",
    # Ray / Anyscale
    "ray.io", "docs.ray.io",
    # Weights & Biases
    "wandb.ai", "docs.wandb.ai",
    # scikit-learn
    "scikit-learn.org",
    # FastAPI / Pydantic
    "fastapi.tiangolo.com", "docs.pydantic.dev",
}

# Domaines reconnus mais non officiels — acceptés avec score élevé
RECOGNIZED_DOMAINS: set[str] = {
    "news.ycombinator.com",   # Hacker News
    "lobste.rs",
    "reddit.com",             # filtré par subreddit plus tard
    "dev.to",
    "medium.com",             # filtré par auteur/publication
    "substack.com",
    "thenewstack.io",
    "techcrunch.com",
    "wired.com",
    "arstechnica.com",
    "theregister.com",
    "infoq.com",
    "ieee.org",
    "acm.org",
    "towardsdatascience.com",
    "analyticsvidhya.com",
}

# Patterns de domaines à rejeter systématiquement
REJECTED_DOMAIN_PATTERNS: list[str] = [
    r"\.shop$", r"\.store$", r"\.sale$",
    r"coupon", r"discount", r"promo",
    r"affiliate",
]

# ─── Mots-clés promotionnels ──────────────────────────────────────────────────
# Présence dans le texte → contenu commercial

COMMERCIAL_KEYWORDS: list[str] = [
    "buy now", "get started for free", "free trial", "sign up for free",
    "pricing", "enterprise plan", "request a demo", "book a demo",
    "contact sales", "talk to sales", "schedule a call",
    "limited time offer", "discount", "coupon code",
    "money back guarantee", "cancel anytime",
    "achetez", "essai gratuit", "demander une démo", "contactez notre équipe commerciale",
    "offre limitée", "sans engagement",
    # Patterns publicitaires
    "sponsored by", "this post is sponsored", "affiliate link",
    "partenariat sponsorisé", "article sponsorisé",
]

# Seuil : si X% ou plus du texte est promotionnel → rejeté
COMMERCIAL_DENSITY_THRESHOLD = 0.04   # 4 % du texte

# Mots-clés dont la seule présence suffit à rejeter (signaux très forts)
HARD_COMMERCIAL_SIGNALS: list[str] = [
    "request a demo", "book a demo", "schedule a demo",
    "contact sales", "talk to sales", "contact our sales",
    "enterprise plan", "enterprise pricing",
    "demander une démo", "contactez notre équipe commerciale",
    "this post is sponsored", "article sponsorisé",
]

# ─── Seuils de qualité item ───────────────────────────────────────────────────

MIN_TEXT_LENGTH = 200        # mots minimum pour un item informatif
MIN_INFORMATIVE_RATIO = 0.5  # ratio texte informatif / total


# ─── Extraction token domaine ─────────────────────────────────────────────────

def _domain_token(domain: str) -> str:
    """Extrait le token principal d'un domaine : 'mlflow.org' → 'mlflow'."""
    parts = domain.split(".")
    # Ignorer les sous-domaines connus (www, docs, api, blog, developer)
    skip = {"www", "docs", "api", "blog", "developer", "dev", "en", "fr"}
    for part in parts:
        if part not in skip and len(part) > 2:
            return part.lower()
    return parts[0].lower() if parts else ""


def _heuristic_tier(domain: str, title: str = "", keywords: list | None = None) -> tuple[str, float, str]:
    """
    Heuristique pure — aucun appel externe.
    Retourne (tier, score, reason).
    """
    token = _domain_token(domain)

    # 1. Patterns rejetés
    for pattern in REJECTED_DOMAIN_PATTERNS:
        if re.search(pattern, domain):
            return "rejected", 0.0, f"Domaine rejeté (pattern : {pattern})"

    # 2. TLD institutionnel → official
    if re.search(r"\.(gov|gouv\.\w+|edu|ac\.\w+|parliament\.\w+)$", domain):
        return "official", 1.0, f"TLD institutionnel : {domain}"

    # 3. GitHub
    if "github.com" in domain:
        return "recognized", 0.8, "GitHub"

    # 4. Match sémantique token ↔ titre/keywords
    haystack = (title + " " + " ".join(keywords or [])).lower()
    if token and token in haystack:
        # Sous-domaine docs/developer → confiance forte
        if re.match(r"^(docs|developer|api|dev)\.", domain):
            return "official", 0.95, f"Domaine doc officiel ({token})"
        return "official", 0.85, f"Token '{token}' présent dans le contenu — source primaire probable"

    # 5. Domaines .org génériques
    if domain.endswith(".org"):
        return "recognized", 0.7, f"Domaine .org : {domain}"

    # 6. Reconnus génériques
    if domain in RECOGNIZED_DOMAINS or any(domain.endswith("." + d) for d in RECOGNIZED_DOMAINS):
        return "recognized", 0.75, f"Domaine reconnu : {domain}"

    return "unknown", 0.4, f"Domaine inconnu : {domain}"


# ─── Cache DB ─────────────────────────────────────────────────────────────────

def _get_cached_reputation(domain: str, db) -> Optional[dict]:
    """Lit le cache domain_reputation. Retourne None si absent."""
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT tier, confidence, verified_by FROM domain_reputation WHERE domain = %s",
                    (domain,)
                )
                row = cur.fetchone()
        if row:
            return {"tier": row[0], "confidence": row[1], "verified_by": row[2]}
    except Exception as e:
        logger.debug(f"[REPUTATION] cache read error: {e}")
    return None


def _set_cached_reputation(domain: str, tier: str, confidence: float, verified_by: str, token: str = "", db=None):
    """Écrit dans domain_reputation. Silencieux en cas d'erreur."""
    if not db:
        return
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO domain_reputation (domain, tier, confidence, verified_by, token, verified_at)
                    VALUES (%s, %s, %s, %s, %s, NOW())
                    ON CONFLICT (domain) DO UPDATE
                      SET tier = EXCLUDED.tier,
                          confidence = EXCLUDED.confidence,
                          verified_by = EXCLUDED.verified_by,
                          verified_at = NOW()
                """, (domain, tier, confidence, verified_by, token))
                conn.commit()
    except Exception as e:
        logger.debug(f"[REPUTATION] cache write error: {e}")


# ─── Vérification LLM ─────────────────────────────────────────────────────────

async def verify_domain_with_llm(domain: str, token: str, llm_provider, db) -> str:
    """
    Vérifie via LLM si `domain` est le site officiel de `token`.
    Met à jour domain_reputation. Retourne le tier final.
    """
    prompt = (
        f"Is '{domain}' the official website for the tool, project, or organization named '{token}'? "
        f"Answer with exactly one word: yes or no."
    )
    try:
        raw, _ = await llm_provider.generate(
            prompt=prompt,
            system_prompt="You are a factual classifier. Answer with exactly one word: yes or no.",
            max_tokens=5,
            temperature=0.0,
        )
        answer = raw.strip().lower()
        if "yes" in answer:
            tier, confidence = "official", 0.95
        else:
            tier, confidence = "unknown", 0.4
        _set_cached_reputation(domain, tier, confidence, "llm", token, db)
        logger.info(f"[REPUTATION] LLM verified {domain} → {tier}")
        return tier
    except Exception as e:
        logger.warning(f"[REPUTATION] LLM verify failed for {domain}: {e}")
        return "unknown"


# ─── Scorer domaine ───────────────────────────────────────────────────────────

def score_domain(url: str, title: str = "", keywords: list | None = None, db=None) -> ReliabilityResult:
    """
    Évalue la fiabilité d'un domaine source.
    1. Cache DB (domain_reputation)
    2. Liste blanche historique (OFFICIAL_DOMAINS)
    3. Heuristique sémantique (token ↔ contenu)
    La vérification LLM est déclenchée de façon asynchrone par le pipeline.
    """
    domain = _extract_domain(url)
    if not domain:
        return ReliabilityResult(False, 0.0, "URL invalide", "rejected")

    # 0. Cache DB
    if db:
        cached = _get_cached_reputation(domain, db)
        if cached:
            tier = cached["tier"]
            if tier == "rejected":
                return ReliabilityResult(False, 0.0, f"Domaine rejeté (cache)", "rejected")
            score = cached["confidence"]
            return ReliabilityResult(True, score, f"Cache {cached['verified_by']} : {tier}", tier)

    # 1. Liste blanche historique
    if domain in OFFICIAL_DOMAINS or any(domain.endswith("." + d) for d in OFFICIAL_DOMAINS):
        if db:
            _set_cached_reputation(domain, "official", 1.0, "whitelist", _domain_token(domain), db)
        return ReliabilityResult(True, 1.0, f"Domaine officiel (whitelist) : {domain}", "official")

    # 2. Heuristique
    tier, score, reason = _heuristic_tier(domain, title, keywords)
    if tier == "rejected":
        return ReliabilityResult(False, 0.0, reason, "rejected")

    # Mettre en cache les résultats heuristiques pour les futurs items
    if db:
        _set_cached_reputation(domain, tier, score, "heuristic", _domain_token(domain), db)

    return ReliabilityResult(True, score, reason, tier)


# ─── Scorer item ──────────────────────────────────────────────────────────────

def score_item(
    url: str,
    text: str,
    title: str = "",
    author: str = "",
    published_date: Optional[str] = None,
    github_stars: Optional[int] = None,
) -> ReliabilityResult:
    """
    Évalue la fiabilité d'un item collecté.
    Combine l'évaluation domaine + analyse du contenu.

    Retourne passed=False avec reason si l'item doit être rejeté.
    """
    # 1. Évaluation domaine (avec titre pour heuristique sémantique)
    domain_result = score_domain(url, title=title)
    if not domain_result.passed:
        return domain_result

    # 2. Longueur minimale
    word_count = len(text.split()) if text else 0
    if word_count < MIN_TEXT_LENGTH:
        # Exception : les changelogs et releases peuvent être courts mais valides
        if not _is_changelog_url(url) and not _looks_like_release(title, text):
            return ReliabilityResult(
                False, 0.0,
                f"Contenu trop court ({word_count} mots, minimum {MIN_TEXT_LENGTH})",
                domain_result.domain_tier
            )

    # 3. Détection contenu commercial
    # 3a. Signaux forts — présence seule suffit à rejeter
    lower_text = text.lower()
    for signal in HARD_COMMERCIAL_SIGNALS:
        if signal in lower_text:
            return ReliabilityResult(
                False, 0.0,
                f"Signal commercial fort détecté : \"{signal}\"",
                domain_result.domain_tier
            )

    commercial_score = _commercial_density(text)
    if commercial_score > COMMERCIAL_DENSITY_THRESHOLD:
        return ReliabilityResult(
            False, 0.0,
            f"Contenu commercial détecté ({commercial_score:.1%} du texte)",
            domain_result.domain_tier
        )

    # 4. GitHub : vérification stars si disponible
    if github_stars is not None and "github.com" in url:
        if github_stars < 100:
            return ReliabilityResult(
                False, 0.2,
                f"Repo GitHub peu actif ({github_stars} stars)",
                "community"
            )

    # 5. Calcul score final
    score = _compute_final_score(
        domain_score=domain_result.score,
        word_count=word_count,
        has_author=bool(author and author.strip()),
        has_date=bool(published_date),
        commercial_density=commercial_score,
        github_stars=github_stars,
    )

    tier = domain_result.domain_tier
    parts = [f"Domaine : {tier}"]
    if author:
        parts.append(f"auteur identifié")
    if published_date:
        parts.append(f"daté")
    parts.append(f"{word_count} mots")

    return ReliabilityResult(True, score, " · ".join(parts), tier)


# ─── GitHub enrichment ────────────────────────────────────────────────────────

async def fetch_github_metadata(url: str) -> dict:
    """
    Récupère stars et date du dernier commit via l'API publique GitHub.
    Retourne {} en cas d'échec (pas de token requis pour les repos publics).
    """
    import httpx
    import re as _re

    match = _re.search(r"github\.com/([^/]+)/([^/?\s]+)", url)
    if not match:
        return {}

    owner, repo = match.group(1), match.group(2).rstrip(".git")
    api_url = f"https://api.github.com/repos/{owner}/{repo}"

    try:
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.get(api_url, headers={"Accept": "application/vnd.github+json"})
            if r.status_code == 200:
                data = r.json()
                return {
                    "stars":      data.get("stargazers_count", 0),
                    "forks":      data.get("forks_count", 0),
                    "pushed_at":  data.get("pushed_at", ""),
                    "archived":   data.get("archived", False),
                    "description": data.get("description", ""),
                }
    except Exception as e:
        logger.debug(f"[RELIABILITY] GitHub API {url} : {e}")

    return {}


async def score_github_repo(url: str) -> ReliabilityResult:
    """Évalue un repo GitHub en récupérant ses métadonnées."""
    meta = await fetch_github_metadata(url)
    if not meta:
        # Pas de données → score neutre, on collecte quand même
        return ReliabilityResult(True, 0.5, "GitHub — métadonnées indisponibles", "recognized")

    if meta.get("archived"):
        return ReliabilityResult(False, 0.0, "Repo GitHub archivé", "rejected")

    stars = meta.get("stars", 0)
    if stars < 50:
        return ReliabilityResult(False, 0.1, f"Repo GitHub peu actif ({stars} stars)", "community")

    score = min(0.5 + (stars / 10000) * 0.5, 1.0)  # 50 stars → 0.5, 5000 stars → 1.0
    return ReliabilityResult(
        True, round(score, 2),
        f"GitHub : {stars} stars · {'archivé' if meta.get('archived') else 'actif'}",
        "official" if stars > 1000 else "recognized"
    )


# ─── Helpers privés ───────────────────────────────────────────────────────────

def _extract_domain(url: str) -> str:
    try:
        parsed = urlparse(url)
        domain = parsed.netloc.lower().lstrip("www.")
        return domain
    except Exception:
        return ""


def _commercial_density(text: str) -> float:
    """Ratio de mots-clés commerciaux dans le texte."""
    if not text:
        return 0.0
    lower = text.lower()
    total_words = max(len(lower.split()), 1)
    hits = sum(1 for kw in COMMERCIAL_KEYWORDS if kw in lower)
    # Pondéré par longueur des mots-clés pour éviter les faux positifs sur textes courts
    return min(hits * 3 / total_words, 1.0)


def _is_changelog_url(url: str) -> bool:
    lower = url.lower()
    return any(x in lower for x in [
        "changelog", "release", "releases", "whatsnew",
        "what-is-new", "version", "tag/v", "milestone",
    ])


def _looks_like_release(title: str, text: str) -> bool:
    combined = (title + " " + text[:200]).lower()
    return any(x in combined for x in [
        "release", "version", "v1.", "v2.", "v0.", "changelog",
        "what's new", "breaking change", "deprecat",
    ])


def _compute_final_score(
    domain_score: float,
    word_count: int,
    has_author: bool,
    has_date: bool,
    commercial_density: float,
    github_stars: Optional[int],
) -> float:
    score = domain_score

    # Bonus qualité
    if has_author:
        score += 0.05
    if has_date:
        score += 0.05
    if word_count > 500:
        score += 0.05
    if word_count > 1500:
        score += 0.05

    # Malus commercial
    score -= commercial_density * 2

    # GitHub stars
    if github_stars is not None:
        if github_stars > 5000:
            score += 0.1
        elif github_stars > 1000:
            score += 0.05

    return round(max(0.0, min(score, 1.0)), 3)


# ─── Interface publique pour le pipeline ─────────────────────────────────────

def check_item_reliability(
    url: str,
    text: str,
    title: str = "",
    author: str = "",
    published_date: Optional[str] = None,
) -> ReliabilityResult:
    """
    Point d'entrée principal pour le pipeline.
    Appel synchrone — utilisé dans collect → filter → ingest.
    """
    return score_item(url=url, text=text, title=title, author=author, published_date=published_date)


def log_rejection(item_id: Optional[int], url: str, reason: str, db=None) -> None:
    """Log un item rejeté pour transparence (page Sources)."""
    logger.info(f"[RELIABILITY] REJETÉ — {url} : {reason}")
    if db and item_id:
        try:
            with db.get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """UPDATE items SET reliability_rejected = TRUE,
                           reliability_reason = %s WHERE id = %s""",
                        (reason[:500], item_id)
                    )
                    conn.commit()
        except Exception:
            pass  # colonne peut ne pas encore exister — migration séparée
