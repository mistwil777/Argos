"""
ProjectCalibrationAgent — analyse de CDC + questionnaire projet → arborescence sujets.

Flux :
  1. CdcAnalyzer.analyze_cdc(text) → sujets, lacunes, domaines, contraintes
  2. ProjectCalibrationAgent.next_question(...) → entretien conversationnel (comble les lacunes)
  3. ProjectCalibrationAgent.generate_subjects(...) → workspaces créés, knowledge_profile, sources
"""

import json
import logging
from typing import Optional

logger = logging.getLogger(__name__)

_VALIDATION_SIGNALS = (
    "je valide", "c'est bon", "c'est parfait", "parfait",
    "valide", "go", "oui je valide", "configuration validée",
    "ça me convient", "ça convient", "ok", "d'accord",
    "très bien", "allons-y",
)

MIN_QUESTIONS = 0


# ── CdcAnalyzer ───────────────────────────────────────────────────────────────

class CdcAnalyzer:

    def __init__(self, db=None):
        self._db = db
        from argos.config import settings
        from argos.services.llm_provider import create_llm_provider
        self._llm = create_llm_provider(
            provider_type=settings.llm_provider,
            openai_api_key=settings.openai_api_key,
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
            aws_region=settings.aws_region,
            model="us.anthropic.claude-sonnet-4-20250514-v1:0",
        )

    async def analyze_cdc(self, cdc_text: str) -> dict:
        """
        Analyse un texte de CDC et retourne les sujets, lacunes et contraintes identifiés.
        Lève ValueError si le CDC est vide ou trop court (<50 caractères).
        """
        if not cdc_text or len(cdc_text.strip()) < 50:
            raise ValueError("CDC trop court ou vide — minimum 50 caractères requis")

        prompt = f"""Tu analyses un cahier des charges (CDC) de projet pour en extraire une arborescence de sujets de veille et d'apprentissage.

CDC :
---
{cdc_text}
---

Ta tâche : extraire en JSON les informations suivantes.

Règles :
- subjects : liste des domaines ou sujets couverts par ce projet. Pour chaque sujet : nom, sous-sujets potentiels, priorité (high/medium/low).
- domains : les grands domaines transverses (ex: "IA", "cybersécurité", "finance")
- gaps : ce qui manque dans le CDC pour configurer une veille précise (niveaux non précisés, périmètre flou, acteurs non identifiés, etc.)
- constraints : contraintes mentionnées (budget, délai, taille d'équipe, stack technologique imposée)
- suggested_sources : 2-5 sources pertinentes immédiatement identifiables depuis le CDC (URLs de blogs officiels, docs techniques)

Réponds UNIQUEMENT avec ce JSON :
{{
  "subjects": [
    {{"name": "...", "sub_subjects": ["..."], "priority": "high|medium|low"}}
  ],
  "domains": ["..."],
  "gaps": ["..."],
  "constraints": ["..."],
  "suggested_sources": ["https://..."]
}}"""

        response, _ = await self._llm.generate(
            prompt=prompt,
            system_prompt="Tu es un expert en veille technologique et en analyse de cahiers des charges. Réponds uniquement avec du JSON valide.",
            temperature=0.3, max_tokens=2000, top_p=0.9,
        )
        raw = response.strip()
        start = raw.find("{")
        end = raw.rfind("}") + 1
        return json.loads(raw[start:end])

    async def analyze_and_save(self, project_id: int, user_id: int, cdc_text: str) -> dict:
        """
        Analyse le CDC et sauvegarde le résultat dans projects.cdc_analysis.
        Vérifie que l'utilisateur est owner avant de sauvegarder.
        """
        result = await self.analyze_cdc(cdc_text)

        with self._db.get_connection() as conn:
            with conn.cursor() as cur:
                # Vérifier que user est bien owner
                cur.execute(
                    "SELECT id FROM project_members WHERE project_id = %s AND user_id = %s AND role = 'owner'",
                    (project_id, user_id),
                )
                if not cur.fetchone():
                    raise PermissionError("Seul le propriétaire peut lancer la calibration")

                cur.execute(
                    "UPDATE projects SET cdc_content = %s, cdc_analysis = %s, updated_at = NOW() "
                    "WHERE id = %s",
                    (cdc_text, json.dumps(result), project_id),
                )

        return result


# ── ProjectCalibrationAgent ───────────────────────────────────────────────────

class ProjectCalibrationAgent:

    def __init__(self, db=None):
        self._db = db
        from argos.config import settings
        from argos.services.llm_provider import create_llm_provider
        self._llm = create_llm_provider(
            provider_type=settings.llm_provider,
            openai_api_key=settings.openai_api_key,
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
            aws_region=settings.aws_region,
            model="us.anthropic.claude-sonnet-4-20250514-v1:0",
        )

    async def next_question(
        self,
        project_name: str,
        cdc_analysis: dict,
        qa_history: list[dict],
    ) -> dict:
        """
        Retourne {"question": {"text": ..., "type": ..., "options": [...]}}
        ou {"done": True, "reason": "..."}.
        """
        # Signal de validation explicite
        last_a = qa_history[-1].get("a", "").lower().strip()
        last_q = qa_history[-1].get("q", "").lower()
        confirmation_question = any(w in last_q for w in (
            "valider", "valide", "confirme", "confirmer", "finaliser",
            "modifier", "configuration", "tout est bon",
        ))
        if confirmation_question and any(last_a == s or last_a.startswith(s) for s in _VALIDATION_SIGNALS):
            return {"done": True, "reason": "Configuration validée par l'équipe projet."}

        n = len(qa_history)

        # Génération LLM de la prochaine question
        qa_text = "\n".join(
            f"Q{i+1}: {qa['q']}\nR{i+1}: {qa['a']}"
            for i, qa in enumerate(qa_history)
        ) if qa_history else "(aucun échange — c'est la première question)"

        subjects_text = "\n".join(
            f"  - {s['name']}" + (f" (priorité: {s.get('priority', '?')})" if s.get('priority') else "")
            for s in cdc_analysis.get("subjects", [])
        ) or "  - aucun sujet identifié"

        gaps = cdc_analysis.get("gaps", [])
        gaps_text = "\n".join(f"  - {g}" for g in gaps) if gaps else "  - aucune lacune identifiée"

        constraints = cdc_analysis.get("constraints", [])
        constraints_text = "\n".join(f"  - {c}" for c in constraints) if constraints else "  - aucune"

        finalize_note = (
            "\nSi toutes les lacunes listées ci-dessus ont obtenu une réponse dans les échanges "
            f'(ou s\'il n\'y a aucune lacune), retourne {{"done": true, "reason": "..."}} au lieu d\'une question.'
        )

        format_note = (
            '{"done": true, "reason": "..."} OU {"question": {"text": "...", "type": "open"|"multiselect"|"level_pair", "options": []}}'
        )

        prompt = f"""Tu conduis un entretien de calibration pour le projet « {project_name} ».

SUJETS DU PROJET :
{subjects_text}

LACUNES À COMBLER (issues de l'analyse du CDC) :
{gaps_text}

CONTRAINTES CONNUES :
{constraints_text}

ÉCHANGES DÉJÀ RÉALISÉS ({n} questions) :
{qa_text}

OBJECTIF DE LA PROCHAINE QUESTION :
Analyse les échanges ci-dessus. Pour chaque lacune listée, détermine si elle a été adressée.
Pose une question précise sur la lacune ou le sujet le moins bien couvert par les réponses existantes.
Ne pose JAMAIS une question dont la réponse est déjà présente dans les échanges.
Varie les angles : contexte organisationnel, niveaux techniques par sujet spécifique, contraintes opérationnelles, priorités, risques projet.
{finalize_note}

FORMAT DE RÉPONSE (JSON uniquement) :
{format_note}

Types disponibles :
- open : réponse libre
- multiselect : choix multiples parmi des options (max 6)
- level_pair : niveau actuel + niveau cible (pour une compétence précise)"""

        try:
            response, _ = await self._llm.generate(
                prompt=prompt,
                system_prompt=(
                    "Tu es un expert en calibration de projets. "
                    "Tu analyses les réponses précédentes pour identifier ce qui manque encore. "
                    "Chaque question doit apporter une information nouvelle et non redondante. "
                    "Réponds en JSON valide uniquement, sans texte autour."
                ),
                temperature=0.4, max_tokens=600, top_p=0.9,
            )
            raw = response.strip()
            start = raw.find("{")
            end = raw.rfind("}") + 1
            result = json.loads(raw[start:end])

            if result.get("done"):
                return {"done": True, "reason": result.get("reason", "Calibration terminée.")}

            question = result.get("question", {})

            if not question.get("text"):
                question = {
                    "text": "Quels sont les principaux risques ou obstacles anticipés sur ce projet ?",
                    "type": "open",
                    "options": [],
                }

            return {"question": question}

        except Exception as e:
            logger.error(f"next_question failed: {e}")
            return {"question": {"text": "Quels outils ou frameworks l'équipe utilise-t-elle sur ce projet ?", "type": "open", "options": []}}

    async def generate_subjects(
        self,
        project_id: int,
        project_name: str,
        cdc_analysis: dict,
        qa_history: list[dict],
    ) -> dict:
        """
        À partir de l'analyse CDC + entretien, génère :
        - arborescence de sujets → crée les workspaces en DB
        - knowledge_profile (bilan_md, learning_plan_md) → sauvegardé sur le projet
        - source_candidates → retournées pour validation
        """
        qa_text = "\n".join(
            f"Q: {qa['q']}\nR: {qa['a']}" for qa in qa_history
        ) if qa_history else "(aucun entretien)"

        subjects_from_cdc = cdc_analysis.get("subjects", [])
        domains = cdc_analysis.get("domains", [])
        constraints = cdc_analysis.get("constraints", [])

        prompt = f"""Tu finalises la calibration du projet « {project_name} ».

Sujets identifiés dans le CDC : {json.dumps(subjects_from_cdc, ensure_ascii=False)}
Domaines transverses : {', '.join(domains) or 'non précisés'}
Contraintes : {', '.join(constraints) or 'aucune'}

Entretien de calibration :
{qa_text}

Génère en JSON :

1. subjects : liste finale des sujets à créer pour ce projet.
   Pour chaque sujet : name (court, en clair), description (1-2 phrases sur ce qui sera couvert).
   Entre 2 et 8 sujets maximum — regroupe ce qui peut l'être.

2. knowledge_profile : bilan synthétique du projet.
   - bilan_md : markdown, résumé des besoins, niveaux de l'équipe, angles prioritaires
   - learning_plan_md : progression suggérée (si pertinent selon le contexte)

3. source_candidates : 3-8 sources suggérées pour ce projet.
   Pour chaque source : url (complète avec https://), type (rss|website), name (lisible).
   JAMAIS medium.com, reddit.com, forums, agrégateurs.

Réponds UNIQUEMENT avec ce JSON :
{{
  "subjects": [
    {{"name": "...", "description": "..."}}
  ],
  "knowledge_profile": {{
    "bilan_md": "...",
    "learning_plan_md": "..."
  }},
  "source_candidates": [
    {{"url": "https://...", "type": "rss|website", "name": "..."}}
  ]
}}"""

        response, _ = await self._llm.generate(
            prompt=prompt,
            system_prompt="Tu es un expert en configuration de veille technologique pour équipes projet. Réponds uniquement avec du JSON valide.",
            temperature=0.6, max_tokens=3000, top_p=0.9,
        )
        raw = response.strip()
        start = raw.find("{")
        end = raw.rfind("}") + 1
        result = json.loads(raw[start:end])

        subjects = result.get("subjects", [])
        knowledge_profile = result.get("knowledge_profile", {})
        source_candidates = result.get("source_candidates", [])

        import re as _re
        import time as _time

        def _make_slug(name: str, suffix: int = 0) -> str:
            base = _re.sub(r"[^a-z0-9]+", "-", name.lower().strip()).strip("-")[:80]
            return f"{base}-{suffix}" if suffix else base

        created_subjects = []
        with self._db.get_connection() as conn:
            with conn.cursor() as cur:
                # Créer les workspaces avec project_id
                for i, s in enumerate(subjects):
                    slug = _make_slug(s["name"], project_id * 100 + i)
                    cur.execute(
                        "INSERT INTO workspaces (name, slug, project_id) VALUES (%s, %s, %s) "
                        "RETURNING id, name, project_id",
                        (s["name"], slug, project_id),
                    )
                    row = cur.fetchone()
                    if row:
                        created_subjects.append({
                            "id": row[0],
                            "name": row[1],
                            "project_id": row[2],
                            "description": s.get("description", ""),
                        })

                # Sauvegarder le knowledge_profile sur le projet
                cur.execute(
                    "UPDATE projects SET knowledge_profile = %s, updated_at = NOW() WHERE id = %s",
                    (json.dumps(knowledge_profile), project_id),
                )

        return {
            "subjects": created_subjects,
            "knowledge_profile": knowledge_profile,
            "source_candidates": source_candidates,
        }
