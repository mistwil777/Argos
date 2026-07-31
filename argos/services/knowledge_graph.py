"""
Knowledge Graph — extraction d'entités et relations depuis les digest_markdown.
Appel post-indexation : chaque nouvel item enrichit le graphe.
"""

import logging
import json
from typing import Optional

logger = logging.getLogger(__name__)

EXTRACTION_PROMPT = """Analyse ce résumé d'article et extrait les entités et relations importantes.

Résumé :
{content}

Réponds UNIQUEMENT en JSON avec ce format exact :
{{
  "entities": [
    {{"label": "nom de l'entité", "type": "org|person|product|concept|technology"}}
  ],
  "relations": [
    {{"source": "entité source", "relation": "verbe court", "target": "entité cible"}}
  ]
}}

Règles :
- Maximum 8 entités, 6 relations
- Labels courts et précis (ex: "Anthropic", "Claude Opus 5", "RAG", "AWS Bedrock")
- Types : org (entreprise/organisation), person (personne), product (produit/modèle), concept (idée abstraite), technology (techno/framework)
- Relations en français, courtes (ex: "publie", "acquiert", "concurrent de", "intègre", "utilise")
- Ne pas inclure les entités trop génériques ("IA", "intelligence artificielle", "modèle")"""


async def extract_and_index(item_id: int, title: str, digest_markdown: str, source_url: str = "", db=None, llm=None):  # noqa: E501
    """
    Extrait entités et relations d'un digest_markdown via LLM,
    puis met à jour le Knowledge Graph en base.
    """
    if not digest_markdown or len(digest_markdown.strip()) < 50:
        return

    try:
        if db is None:
            raise ValueError("db instance required")
        if llm is None:
            from argos.services.llm_provider import create_llm_provider
            from argos.config import settings
            llm = create_llm_provider(
                provider_type=settings.llm_provider,
                openai_api_key=settings.openai_api_key,
                aws_access_key_id=settings.aws_access_key_id,
                aws_secret_access_key=settings.aws_secret_access_key,
                aws_region=settings.aws_region,
                model=settings.default_classification_model,
            )
        content = digest_markdown[:3000]

        result = await llm.generate(
            prompt=EXTRACTION_PROMPT.format(content=content),
            system_prompt="Tu es un extracteur d'entités. Réponds uniquement en JSON valide.",
            max_tokens=600,
        )

        # AWSBedrockProvider renvoie (content, usage), OpenAIProvider idem
        text = (result[0] if isinstance(result, tuple) else result).strip()
        # Extraire le JSON même si le LLM ajoute du texte autour
        start = text.find('{')
        end = text.rfind('}') + 1
        if start == -1 or end == 0:
            return
        data = json.loads(text[start:end])

        entities = data.get("entities", [])
        relations = data.get("relations", [])

        if not entities:
            return

        with db.get_connection() as conn:
            with conn.cursor() as cur:
                node_ids: dict[str, int] = {}

                # Upsert entités
                for ent in entities:
                    label = (ent.get("label") or "").strip()
                    etype = (ent.get("type") or "concept").strip()
                    if not label or len(label) < 2:
                        continue

                    # Cherche un nœud existant (correspondance exacte insensible à la casse)
                    cur.execute(
                        "SELECT id, source_count, item_ids FROM kg_nodes WHERE LOWER(label) = LOWER(%s)",
                        (label,)
                    )
                    existing = cur.fetchone()

                    if existing:
                        node_id, src_count, item_ids = existing
                        item_ids = item_ids or []
                        if item_id not in item_ids:
                            item_ids.append(item_id)
                        cur.execute("""
                            UPDATE kg_nodes
                            SET source_count = %s, item_ids = %s, last_updated_at = NOW()
                            WHERE id = %s
                        """, (src_count + 1, item_ids, node_id))
                    else:
                        cur.execute("""
                            INSERT INTO kg_nodes (label, type, confidence_score, source_count, item_ids)
                            VALUES (%s, %s, 0.6, 1, %s)
                            RETURNING id
                        """, (label, etype, [item_id]))
                        node_id = cur.fetchone()[0]

                    node_ids[label.lower()] = node_id

                    # Lier item → nœud
                    cur.execute("""
                        INSERT INTO kg_node_sources (node_id, item_id, url, confidence)
                        VALUES (%s, %s, %s, 0.6)
                        ON CONFLICT (node_id, item_id) DO NOTHING
                    """, (node_id, item_id, source_url))

                # Upsert relations
                for rel in relations:
                    src_label = (rel.get("source") or "").strip().lower()
                    tgt_label = (rel.get("target") or "").strip().lower()
                    rel_type  = (rel.get("relation") or "").strip()

                    src_id = node_ids.get(src_label)
                    tgt_id = node_ids.get(tgt_label)

                    if not src_id or not tgt_id or src_id == tgt_id or not rel_type:
                        continue

                    # Éviter les doublons de relation
                    cur.execute("""
                        SELECT id, item_ids FROM kg_edges
                        WHERE source_node_id = %s AND target_node_id = %s AND relation_type = %s
                    """, (src_id, tgt_id, rel_type))
                    existing_edge = cur.fetchone()

                    if existing_edge:
                        edge_id, edge_items = existing_edge
                        edge_items = edge_items or []
                        if item_id not in edge_items:
                            edge_items.append(item_id)
                        cur.execute(
                            "UPDATE kg_edges SET weight = weight + 0.1, item_ids = %s WHERE id = %s",
                            (edge_items, edge_id)
                        )
                    else:
                        cur.execute("""
                            INSERT INTO kg_edges (source_node_id, target_node_id, relation_type, weight, item_ids)
                            VALUES (%s, %s, %s, 1.0, %s)
                        """, (src_id, tgt_id, rel_type, [item_id]))

                conn.commit()

        logger.info(f"KG: item {item_id} → {len(entities)} entités, {len(relations)} relations")

    except json.JSONDecodeError as e:
        logger.warning(f"KG extraction JSON invalide pour item {item_id}: {e}")
    except Exception as e:
        logger.warning(f"KG extraction échouée pour item {item_id}: {e}")
