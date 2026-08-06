"""
Tâche Celery de découverte et validation d'une source candidate.

Flux par URL candidate :
1. HTTP HEAD/GET rapide → cherche <link rel="alternate" type="application/rss+xml">
2. Si introuvable : Playwright → rendu DOM complet → même recherche
3. LLM confirme que l'URL finale est une source d'actualités pertinente
4. Résultat publié dans Redis pour SSE

Statuts publiés dans Redis :
  argos:discovery:{sujet_id}:{task_id} → JSON
"""
import json
import logging
import os
import re
from urllib.parse import urljoin, urlparse

import redis
import requests

from argos.celery_app import celery_app

logger = logging.getLogger(__name__)

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
DISCOVERY_TTL = 3600  # 1h en secondes


def _redis() -> redis.Redis:
    return redis.from_url(REDIS_URL, decode_responses=True)


def _push_status(sujet_id: int, task_id: str, status: str, url: str, name: str, detail: str = "") -> None:
    r = _redis()
    payload = json.dumps({
        "task_id": task_id,
        "url": url,
        "name": name,
        "status": status,   # pending | probing | rss_found | website_found | not_found | error
        "detail": detail,
    })
    key = f"argos:discovery:{sujet_id}:{task_id}"
    r.set(key, payload, ex=DISCOVERY_TTL)
    # Channel de notification SSE
    r.publish(f"argos:discovery:{sujet_id}", payload)


def _extract_rss_from_html(html: str, base_url: str) -> str | None:
    """Cherche <link rel="alternate" type="application/rss+xml"> ou atom."""
    pattern = re.compile(
        r'<link[^>]+type=["\']application/(rss|atom)\+xml["\'][^>]*>',
        re.IGNORECASE,
    )
    matches = pattern.findall(html)
    if not matches:
        # Cherche aussi en cherchant href directement
        href_pattern = re.compile(
            r'<link[^>]+(?:rss|atom)[^>]*href=["\']([^"\']+)["\']',
            re.IGNORECASE,
        )
        m = href_pattern.search(html)
        if m:
            return urljoin(base_url, m.group(1))
        return None

    # Extrait href du premier match
    full_pattern = re.compile(
        r'<link[^>]+type=["\']application/(?:rss|atom)\+xml["\'][^>]*href=["\']([^"\']+)["\']'
        r'|<link[^>]+href=["\']([^"\']+)["\'][^>]*type=["\']application/(?:rss|atom)\+xml["\']',
        re.IGNORECASE,
    )
    m = full_pattern.search(html)
    if m:
        href = m.group(1) or m.group(2)
        return urljoin(base_url, href)
    return None


def _probe_http(url: str) -> tuple[str | None, str]:
    """
    Tente de récupérer l'URL via HTTP.
    Retourne (rss_url_ou_None, html_ou_"").
    """
    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; ArgosBot/1.0; RSS discovery)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }
    try:
        resp = requests.get(url, headers=headers, timeout=15, allow_redirects=True)
        if resp.status_code >= 400:
            return None, ""
        content_type = resp.headers.get("content-type", "")
        # Si l'URL est déjà un flux RSS/Atom
        if any(ct in content_type for ct in ("rss", "atom", "xml")):
            return url, ""
        html = resp.text
        rss = _extract_rss_from_html(html, url)
        return rss, html
    except Exception as e:
        logger.debug(f"HTTP probe failed for {url}: {e}")
        return None, ""


def _probe_playwright(url: str) -> tuple[str | None, str]:
    """
    Lance Playwright pour rendre le DOM et chercher le flux RSS.
    """
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            page.goto(url, timeout=20000, wait_until="domcontentloaded")
            html = page.content()
            browser.close()
        rss = _extract_rss_from_html(html, url)
        return rss, html
    except Exception as e:
        logger.debug(f"Playwright probe failed for {url}: {e}")
        return None, ""


def _llm_confirm_source(url: str, html_snippet: str, sujet_name: str) -> dict:
    """
    Le LLM valide que l'URL est bien une source d'actualités récentes pertinente
    pour le sujet et retourne {"valid": bool, "reason": str, "final_url": str}.
    """
    import asyncio
    from argos.services.llm_provider import create_llm_provider
    from argos.config import settings

    snippet = html_snippet[:1500] if html_snippet else "(non disponible)"
    prompt = f"""Tu dois valider si cette URL est une bonne source d'actualités récentes pour une veille sur "{sujet_name}".

URL : {url}

Extrait HTML :
{snippet}

Critères de validation :
- Publie des nouveautés techniques régulièrement (pas uniquement de la documentation statique)
- Pertinent pour le sujet "{sujet_name}"
- Pas un MOOC, cours, tutoriel figé, ou agrégateur non officiel

Réponds UNIQUEMENT avec ce JSON :
{{"valid": true|false, "reason": "...", "final_url": "{url}"}}"""

    try:
        llm = create_llm_provider(
            provider_type=settings.llm_provider,
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
            aws_region=settings.aws_region,
            model="us.amazon.nova-pro-v1:0",
        )

        async def _call():
            response, _ = await llm.generate(
                prompt=prompt,
                system_prompt="Tu valides des sources pour la veille technologique. Réponds uniquement avec du JSON valide.",
                temperature=0.1, max_tokens=300, top_p=0.9,
            )
            return response

        raw = asyncio.run(_call())
        raw = raw.strip()
        start = raw.find("{")
        end = raw.rfind("}") + 1
        return json.loads(raw[start:end])
    except Exception as e:
        logger.warning(f"LLM confirm failed for {url}: {e}")
        return {"valid": True, "reason": "validation LLM non disponible", "final_url": url}


@celery_app.task(bind=True, max_retries=2)
def discover_source(
    self,
    sujet_id: int,
    candidate: dict,  # {"url": str, "type": str, "name": str}
    sujet_name: str,
) -> dict:
    """
    Tâche Celery : découverte et validation d'une source candidate.
    Publie les statuts en temps réel dans Redis.
    """
    url = candidate.get("url", "")
    name = candidate.get("name", urlparse(url).hostname or url)
    task_id = self.request.id or "unknown"

    _push_status(sujet_id, task_id, "probing", url, name, "Vérification HTTP en cours…")

    # 1. HTTP probe
    rss_url, html = _probe_http(url)
    if rss_url:
        _push_status(sujet_id, task_id, "rss_found", rss_url, name, "Flux RSS détecté via HTTP")
        return _save_source(sujet_id, rss_url, name, "rss", task_id)

    # 2. Si HTTP a rendu du HTML mais pas de RSS, on tente quand même Playwright
    if not html:
        # HTTP a échoué complètement — tenter Playwright
        _push_status(sujet_id, task_id, "probing", url, name, "Rendu JavaScript (Playwright)…")
        rss_url, html = _probe_playwright(url)
        if rss_url:
            _push_status(sujet_id, task_id, "rss_found", rss_url, name, "Flux RSS détecté via Playwright")
            return _save_source(sujet_id, rss_url, name, "rss", task_id)

    # 3. Pas de RSS trouvé — LLM valide si la page elle-même est utile
    if html:
        _push_status(sujet_id, task_id, "probing", url, name, "Validation LLM de la page…")
        confirm = _llm_confirm_source(url, html, sujet_name)
        if confirm.get("valid"):
            final_url = confirm.get("final_url", url)
            _push_status(sujet_id, task_id, "website_found", final_url, name, confirm.get("reason", ""))
            return _save_source(sujet_id, final_url, name, "website", task_id)

    # 4. Rien trouvé
    _push_status(sujet_id, task_id, "not_found", url, name, "Aucun flux ni page d'actualités valide")
    return {"status": "not_found", "url": url}


def _save_source(sujet_id: int, url: str, name: str, source_type: str, task_id: str) -> dict:
    """Insère la source validée en base de données."""
    try:
        import psycopg2
        db_url = os.getenv("DATABASE_URL", "")
        conn = psycopg2.connect(db_url)
        conn.autocommit = True
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO sources (sujet_id, url, name, type, active, priority)
            VALUES (%s, %s, %s, %s, true, 'normal')
            ON CONFLICT (url, COALESCE(sujet_id, -1)) DO NOTHING
            """,
            (sujet_id, url, name, source_type),
        )
        cur.close()
        conn.close()
        logger.info(f"Source saved: sujet={sujet_id} url={url} type={source_type}")
    except Exception as e:
        logger.error(f"_save_source failed for {url}: {e}")

    return {"status": "found", "url": url, "type": source_type, "task_id": task_id}
