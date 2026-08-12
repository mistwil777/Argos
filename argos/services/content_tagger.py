"""
Content Tagger — classifie les passages d'un article en veille / apprentissage.

Utilise Haiku (modèle léger) pour analyser cleaned_content en tenant compte
du profil du sujet (keywords, niveau actuel, objectifs d'apprentissage).

Sortie stockée dans items.content_tags (jsonb) :
{
  "category": "veille" | "apprentissage" | "mixed",
  "passages": [
    {"text": "...", "category": "veille" | "apprentissage"}
  ]
}
"""

import json
import logging
from typing import Optional

logger = logging.getLogger(__name__)

HAIKU_MODEL = "us.anthropic.claude-haiku-4-5-20251001"

_SYSTEM_PROMPT = """Tu es un système de classification de contenu pour un assistant d'apprentissage personnalisé.

Tu reçois un article et le profil d'un sujet de veille/apprentissage. Tu dois :
1. Identifier si l'article est principalement de la **veille** (nouveautés, annonces, actualités) ou de l'**apprentissage** (concepts, techniques, tutoriels, explications) ou les **deux**.
2. Extraire les passages clés en les classifiant individuellement.

Règles :
- Veille = information sur ce qui se passe MAINTENANT dans le domaine (nouvelles librairies, annonces, benchmarks récents, comparatifs de produits)
- Apprentissage = explication de COMMENT ça fonctionne, concepts, méthodes, techniques reproductibles
- Un même article peut contenir les deux
- Les passages doivent être des extraits textuels cohérents (2-5 phrases), pas des mots isolés
- Maximum 6 passages au total

Réponds UNIQUEMENT avec un JSON valide, sans markdown ni explication."""

_USER_TEMPLATE = """## Profil du sujet : {sujet_name}
Mots-clés du domaine : {keywords}
Niveau actuel : {level}

## Bilan de compétences du user
{bilan_md}

## Plan d'apprentissage du user
{learning_plan_md}

## Article à analyser
---
{content}
---

En tenant compte du bilan (ce que le user maîtrise déjà vs ce qu'il doit encore apprendre) et du plan d'apprentissage (quelle phase il traverse actuellement) :
- Un concept déjà maîtrisé selon le bilan → veille (information de suivi, pas d'apprentissage nouveau)
- Un concept dans les lacunes ou phases à venir du plan → apprentissage
- Une annonce ou actualité récente → veille

Réponds avec ce JSON exact :
{{
  "category": "veille|apprentissage|mixed",
  "passages": [
    {{"text": "extrait du texte...", "category": "veille|apprentissage"}}
  ]
}}"""


async def tag_content(
    item_id: int,
    content: str,
    sujet_name: str,
    keywords: list[str],
    level: str,
    bilan_md: str,
    learning_plan_md: str,
    llm_provider,
    db,
) -> Optional[dict]:
    """
    Classifie le contenu d'un item et sauvegarde le résultat en DB.
    Retourne le dict content_tags ou None en cas d'échec.
    """
    if not content or len(content) < 100:
        logger.info(f"[TAGGER] Item {item_id} — contenu trop court, skip")
        return None

    # Tronquer à ~6000 tokens (≈ 24000 chars)
    truncated = content[:24000]

    prompt = _USER_TEMPLATE.format(
        sujet_name=sujet_name,
        keywords=", ".join(keywords[:20]) if keywords else "non définis",
        level=level or "intermédiaire",
        bilan_md=bilan_md[:2000] if bilan_md else "Non disponible",
        learning_plan_md=learning_plan_md[:1500] if learning_plan_md else "Non disponible",
        content=truncated,
    )

    try:
        raw_response, _ = await llm_provider.generate(
            prompt=prompt,
            system_prompt=_SYSTEM_PROMPT,
            max_tokens=1200,
            temperature=0.1,
        )

        raw = raw_response.strip()
        # Extraire le JSON si enveloppé dans du markdown
        if "```" in raw:
            import re
            match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', raw)
            raw = match.group(1) if match else raw

        result = json.loads(raw)

        # Validation minimale
        if "category" not in result or result["category"] not in ("veille", "apprentissage", "mixed"):
            raise ValueError(f"category invalide: {result.get('category')}")
        if "passages" not in result or not isinstance(result["passages"], list):
            result["passages"] = []

        # Sauvegarder en DB
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE items SET content_tags=%s::jsonb, content_tagged_at=NOW() WHERE id=%s",
                    (json.dumps(result), item_id)
                )
                conn.commit()

        logger.info(f"[TAGGER] Item {item_id} → {result['category']} ({len(result['passages'])} passages)")
        return result

    except json.JSONDecodeError as e:
        logger.warning(f"[TAGGER] Item {item_id} — JSON invalide : {e} | raw={raw[:200]}")
        return None
    except Exception as e:
        logger.warning(f"[TAGGER] Item {item_id} — échec : {e}")
        return None


async def tag_items_batch(item_ids: list[int], db, llm_provider) -> dict:
    """
    Tague un batch d'items. Récupère le profil sujet depuis la DB.
    Retourne les stats {tagged, skipped, failed}.
    """
    if not item_ids:
        return {"tagged": 0, "skipped": 0, "failed": 0}

    tagged, skipped, failed = 0, 0, 0

    for item_id in item_ids:
        try:
            with db.get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        SELECT i.cleaned_content, s.name, s.knowledge_profile, s.learning_context
                        FROM items i
                        LEFT JOIN sujets s ON s.id = i.sujet_id
                        WHERE i.id = %s
                    """, (item_id,))
                    row = cur.fetchone()

            if not row:
                skipped += 1
                continue

            content, sujet_name, kp, lc = row
            if not content:
                skipped += 1
                continue

            keywords = (kp or {}).get("keywords", [])
            level = (lc or {}).get("current_level", "intermédiaire")
            bilan_md = (kp or {}).get("bilan_md", "")
            learning_plan_md = (kp or {}).get("learning_plan_md", "")

            result = await tag_content(
                item_id=item_id,
                content=content,
                sujet_name=sujet_name or "inconnu",
                keywords=keywords,
                level=level,
                bilan_md=bilan_md,
                learning_plan_md=learning_plan_md,
                llm_provider=llm_provider,
                db=db,
            )

            if result:
                tagged += 1
            else:
                failed += 1

        except Exception as e:
            logger.warning(f"[TAGGER-BATCH] Item {item_id} : {e}")
            failed += 1

    logger.info(f"[TAGGER-BATCH] tagged={tagged} skipped={skipped} failed={failed}")
    return {"tagged": tagged, "skipped": skipped, "failed": failed}
