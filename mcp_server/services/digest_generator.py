"""
Digest generator — transforms raw web content into:
1. A human-readable markdown digest
2. A structured JSON for RAG ingestion
"""
import json
import logging
import re
from datetime import datetime
from typing import Optional

logger = logging.getLogger(__name__)

_MARKDOWN_SYSTEM = """Tu es un assistant de veille informationnelle.
Tu reçois du contenu web brut et tu produis un digest structuré en français.
Sois concis, factuel et informatif. Ne fabrique pas d'informations."""

_MARKDOWN_PROMPT = """Voici le contenu d'une page web :

SOURCE : {url}
TITRE : {title}
---
{content}
---

Produis un digest markdown structuré avec exactement ces sections :
## Résumé
(2-3 phrases qui résument l'essentiel)

## Points clés
- point 1
- point 2
- point 3 (maximum 5 points)

## Pourquoi c'est important
(1-2 phrases sur la pertinence)

## Source
[{title}]({url})"""

_JSON_SYSTEM = """Tu es un extracteur de données structurées.
Tu analyses du contenu web et tu retournes uniquement un objet JSON valide, sans markdown ni explication."""

_JSON_PROMPT = """Analyse ce contenu web et retourne un JSON avec exactement cette structure :

{{
  "title": "titre exact ou reformulé",
  "date": "date de publication au format YYYY-MM-DD ou null",
  "source_domain": "domaine de la source",
  "content_type": "news|research|tutorial|tool|discussion|other",
  "language": "fr|en|other",
  "summary": "résumé en 1-2 phrases",
  "key_points": ["point1", "point2", "point3"],
  "entities": {{
    "people": ["nom1", "nom2"],
    "organizations": ["org1", "org2"],
    "technologies": ["tech1", "tech2"],
    "locations": []
  }},
  "tags": ["tag1", "tag2", "tag3"],
  "importance": "critical|high|medium|low",
  "sentiment": "positive|neutral|negative"
}}

SOURCE : {url}
TITRE : {title}
CONTENU :
{content}"""


def _truncate_content(content: str, max_chars: int = 8000) -> str:
    if len(content) <= max_chars:
        return content
    # Cut at last sentence boundary before limit
    truncated = content[:max_chars]
    last_period = truncated.rfind(". ")
    return truncated[:last_period + 1] if last_period > max_chars // 2 else truncated


async def generate_digest(
    url: str,
    title: str,
    content: str,
    workspace_id: Optional[int] = None,
    llm_provider=None,
) -> dict:
    """
    Generate a digest from web content.
    Returns both markdown (human-readable) and JSON (RAG-ready).
    """
    if not content or len(content) < 100:
        return {
            "markdown": f"## Contenu insuffisant\n\nLe contenu extrait de [{title}]({url}) est trop court pour générer un digest.",
            "json": {
                "title": title,
                "date": None,
                "source_domain": _extract_domain(url),
                "content_type": "other",
                "language": "fr",
                "summary": "Contenu insuffisant.",
                "key_points": [],
                "entities": {"people": [], "organizations": [], "technologies": [], "locations": []},
                "tags": [],
                "importance": "low",
                "sentiment": "neutral",
            },
            "error": "content_too_short",
        }

    truncated = _truncate_content(content)

    markdown_result = ""
    json_result = {}
    errors = []

    # Generate markdown digest
    if llm_provider:
        try:
            markdown_result = await _call_llm(
                llm_provider,
                system=_MARKDOWN_SYSTEM,
                prompt=_MARKDOWN_PROMPT.format(url=url, title=title, content=truncated),
                max_tokens=800,
            )
        except Exception as e:
            logger.error(f"Markdown generation failed: {e}")
            errors.append(f"markdown: {e}")
            markdown_result = _fallback_markdown(url, title, content)
    else:
        markdown_result = _fallback_markdown(url, title, content)

    # Generate JSON digest
    if llm_provider:
        try:
            raw_json = await _call_llm(
                llm_provider,
                system=_JSON_SYSTEM,
                prompt=_JSON_PROMPT.format(url=url, title=title, content=truncated),
                max_tokens=600,
            )
            json_result = _parse_json_safe(raw_json)
        except Exception as e:
            logger.error(f"JSON generation failed: {e}")
            errors.append(f"json: {e}")
            json_result = _fallback_json(url, title, content)
    else:
        json_result = _fallback_json(url, title, content)

    # Ensure required fields
    json_result.setdefault("title", title)
    json_result.setdefault("source_domain", _extract_domain(url))
    json_result["source_url"] = url
    json_result["generated_at"] = datetime.utcnow().isoformat()

    return {
        "markdown": markdown_result,
        "json": json_result,
        "error": "; ".join(errors) if errors else None,
    }


async def _call_llm(llm_provider, system: str, prompt: str, max_tokens: int = 800) -> str:
    """Call LLM via the existing provider factory."""
    # llm_provider is the LLMProvider instance from services/llm_provider.py
    response = await llm_provider.generate(
        system_prompt=system,
        user_message=prompt,
        max_tokens=max_tokens,
        temperature=0.3,
    )
    return response.get("content", "")


def _parse_json_safe(raw: str) -> dict:
    """Extract and parse JSON from LLM output, handling markdown code blocks."""
    # Strip markdown code blocks
    cleaned = re.sub(r"```(?:json)?\s*", "", raw).strip().rstrip("`").strip()
    # Find first { ... } block
    start = cleaned.find("{")
    end = cleaned.rfind("}") + 1
    if start >= 0 and end > start:
        try:
            return json.loads(cleaned[start:end])
        except json.JSONDecodeError:
            pass
    return {}


def _extract_domain(url: str) -> str:
    try:
        from urllib.parse import urlparse
        return urlparse(url).netloc.replace("www.", "")
    except Exception:
        return url


def _fallback_markdown(url: str, title: str, content: str) -> str:
    preview = content[:500].strip()
    return f"""## Résumé
{preview}...

## Source
[{title}]({url})"""


def _fallback_json(url: str, title: str, content: str) -> dict:
    words = content.split()[:20]
    return {
        "title": title,
        "date": None,
        "source_domain": _extract_domain(url),
        "content_type": "other",
        "language": "fr",
        "summary": " ".join(words) + "...",
        "key_points": [],
        "entities": {"people": [], "organizations": [], "technologies": [], "locations": []},
        "tags": [],
        "importance": "medium",
        "sentiment": "neutral",
    }
