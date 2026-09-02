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
        # Signal de validation explicite (seulement si historique non vide)
        if qa_history:
            last_a = qa_history[-1].get("a", "").lower().strip()
            last_q = qa_history[-1].get("q", "").lower()
            confirmation_question = any(w in last_q for w in (
                "valider", "valide", "confirme", "confirmer", "finaliser",
                "modifier", "configuration", "tout est bon",
            ))
            if confirmation_question and any(last_a == s or last_a.startswith(s) for s in _VALIDATION_SIGNALS):
                return {"done": True, "reason": "Configuration validée par l'équipe projet."}

        MAX_QUESTIONS = 3
        n = len(qa_history)

        # Hard stop : budget épuisé
        if n >= MAX_QUESTIONS:
            return {"done": True, "reason": "Calibration terminée — contexte suffisant."}

        budget_restant = MAX_QUESTIONS - n

        qa_text = "\n".join(
            f"Q{i+1}: {qa['q']}\nR{i+1}: {qa['a']}"
            for i, qa in enumerate(qa_history)
        ) if qa_history else "(aucun échange — c'est la première question)"

        # Résumé compact du CDC analysé pour le LLM
        cdc_summary_parts = []
        subjects = cdc_analysis.get("subjects", [])
        if subjects:
            cdc_summary_parts.append("Sujets identifiés : " + ", ".join(s["name"] for s in subjects))
        gaps = cdc_analysis.get("gaps", [])
        if gaps:
            cdc_summary_parts.append("Lacunes : " + " | ".join(gaps))
        constraints = cdc_analysis.get("constraints", [])
        if constraints:
            cdc_summary_parts.append("Contraintes : " + " | ".join(constraints))
        domains = cdc_analysis.get("domains", [])
        if domains:
            cdc_summary_parts.append("Domaines : " + ", ".join(domains))
        cdc_summary = "\n".join(cdc_summary_parts) or "CDC non analysé"

        prompt = f"""Tu configures la veille externe pour le projet « {project_name} ».
Tu disposes de {MAX_QUESTIONS} questions en tout. Tu en as posé {n}. Il t'en reste {budget_restant}.

CDC ANALYSÉ (déjà connu) :
{cdc_summary}

ÉCHANGES DÉJÀ RÉALISÉS :
{qa_text}

RAISONNEMENT REQUIS avant de répondre :
1. Qu'est-ce que le moteur de veille doit absolument savoir — et qui n'est PAS dans le CDC ni dans les échanges ?
2. Parmi ces lacunes, laquelle est la plus critique pour détecter les bons signaux externes ?
3. Poser cette question apporte-t-il vraiment quelque chose, ou le contexte est déjà suffisant ?

Si contexte suffisant OU budget épuisé → {{"done": true, "reason": "..."}}.
Sinon → une seule question, la plus ciblée possible, qui maximise la valeur de la veille.

CRITÈRES D'UNE BONNE QUESTION :
- Porte sur des signaux externes surveillables (acteurs, régulateurs, technologies, standards, fournisseurs clés)
- La réponse change concrètement quelles sources ou alertes seront configurées
- N'est pas déjà répondue partiellement dans le CDC

INTERDIT : organisation interne, délais, compétences personnelles, processus d'équipe, outils de déploiement.

FORMAT JSON uniquement :
{{"done": true, "reason": "..."}}
OU
{{"question": {{"text": "...", "type": "open"|"multiselect", "options": ["...", ...]}}}}"""

        try:
            response, _ = await self._llm.generate(
                prompt=prompt,
                system_prompt=(
                    "Tu es un expert en veille stratégique et technologique, agnostique au domaine. "
                    "Tu analyses n'importe quel type de projet (tech, réglementaire, industriel, recherche, etc.) "
                    "et identifies les informations manquantes pour configurer des alertes de veille externe pertinentes. "
                    "Tu ne poses jamais de questions sur l'organisation interne ou les processus d'équipe. "
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

        prompt = f"""Tu finalises la calibration du projet professionnel « {project_name} ».

Sujets identifiés dans le CDC : {json.dumps(subjects_from_cdc, ensure_ascii=False)}
Domaines transverses : {', '.join(domains) or 'non précisés'}
Contraintes : {', '.join(constraints) or 'aucune'}

Entretien de calibration :
{qa_text}

Génère en JSON :

1. subjects : liste finale des sujets de veille à créer pour ce projet.
   Pour chaque sujet : name (court, en clair), description (1-2 phrases sur ce qui sera surveillé).
   Entre 2 et 8 sujets maximum — regroupe ce qui peut l'être.
   Exemple de bon sujet : "Sécurité API" ou "LLM orchestration" ou "Infra Kubernetes".

2. knowledge_profile : radar technologique du projet.
   - bilan_md : markdown décrivant la stack en production identifiée, les composants critiques ou à risque,
     les jalons clés, les dépendances externes sensibles. C'est un contexte de veille, pas un bilan de compétences.
   - watch_focus_md : 3-5 angles de surveillance prioritaires pour ce projet
     (ex : "surveiller les dépréciations de FastAPI", "alertes sécurité sur les libs ML en prod").

3. source_candidates : 3-8 sources de référence pour la veille de ce projet.
   Pour chaque source : url (complète avec https://), type (rss|website), name (lisible).
   Préférer les changelogs officiels, blogs d'ingénierie, security advisories.
   JAMAIS medium.com, reddit.com, forums, agrégateurs.

Réponds UNIQUEMENT avec ce JSON :
{{
  "subjects": [
    {{"name": "...", "description": "..."}}
  ],
  "knowledge_profile": {{
    "bilan_md": "...",
    "watch_focus_md": "..."
  }},
  "source_candidates": [
    {{"url": "https://...", "type": "rss|website", "name": "..."}}
  ]
}}"""

        response, _ = await self._llm.generate(
            prompt=prompt,
            system_prompt="Tu es un expert en veille technologique pour équipes projet. Tu identifies les risques, dépréciations et opportunités qui impactent concrètement un projet en production. Réponds uniquement avec du JSON valide.",
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
                        ws_name = row[1]
                        # Mapper la priorité depuis les sujets CDC par matching partiel
                        priority = "medium"
                        for cdc_s in subjects_from_cdc:
                            a = cdc_s.get("name", "").lower()
                            b = ws_name.lower()
                            if a and b and (a in b or b in a or a.split()[0] in b):
                                priority = cdc_s.get("priority", "medium")
                                break
                        created_subjects.append({
                            "id": row[0],
                            "name": ws_name,
                            "project_id": row[2],
                            "description": s.get("description", ""),
                            "priority": priority,
                        })

                # Générer le prompt de scoring de pertinence spécifique au projet
                bilan = knowledge_profile.get("bilan_md", "")
                watch_focus = knowledge_profile.get("watch_focus_md", "")
                if bilan or watch_focus:
                    try:
                        relevance_prompt_input = f"""Tu vas créer un prompt de scoring de pertinence pour un système de veille automatique.

Voici le contexte du projet :

## Bilan
{bilan[:1500]}

## Angles de surveillance
{watch_focus[:600]}

Génère un prompt SYSTEM (2-4 paragraphes) qui sera injecté dans un LLM pour qu'il évalue si un article de veille est pertinent pour CE projet spécifique.

Le prompt doit :
- Décrire précisément les sujets, technologies, normes et enjeux qui comptent pour ce projet
- Définir une échelle 1-5 calibrée sur le contexte (ex: 5 = article sur DO-178C pour un projet avionique)
- Indiquer ce qui doit être éliminé (hors-domaine, marketing sans fond technique, etc.)
- Rester agnostique au modèle LLM utilisé

Réponds UNIQUEMENT avec le texte du prompt, sans balises ni JSON."""
                        relevance_prompt, _ = await self._llm.generate(
                            prompt=relevance_prompt_input,
                            system_prompt="Tu es un expert en systèmes de veille automatique. Tu génères des prompts de scoring précis et calibrés.",
                            temperature=0.3,
                            max_tokens=800,
                        )
                        knowledge_profile["relevance_scoring_prompt"] = relevance_prompt.strip()
                    except Exception as _rp_err:
                        logger.warning(f"Relevance prompt generation failed: {_rp_err}")

                # Sauvegarder le knowledge_profile sur le projet
                cur.execute(
                    "UPDATE projects SET knowledge_profile = %s, updated_at = NOW() WHERE id = %s",
                    (json.dumps(knowledge_profile), project_id),
                )


        # ── Insérer les source_candidates dans une transaction séparée ──
        if source_candidates and created_subjects:
            try:
                with self._db.get_connection() as conn2:
                    with conn2.cursor() as cur2:
                        for cand in source_candidates:
                            url = (cand.get("url") or "").strip()
                            if not url:
                                continue
                            ws_id = created_subjects[0]["id"]
                            cand_subj = (cand.get("subject") or "").lower()
                            if cand_subj:
                                for ws in created_subjects:
                                    if ws["name"].lower() in cand_subj or cand_subj in ws["name"].lower():
                                        ws_id = ws["id"]
                                        break
                            cur2.execute(
                                "INSERT INTO source_proposals "
                                "(project_id, sujet_id, url, name, source_type, status) "
                                "VALUES (%s, %s, %s, %s, %s, 'approved')",
                                (project_id, ws_id, url,
                                 cand.get("name") or url,
                                 cand.get("type") or "website"),
                            )
            except Exception as _e:
                logger.warning("source_candidates insert failed: %s", _e)

        # ── Auto-suggest sources via LLM domain knowledge ───────────────
        import asyncio as _asyncio
        _asyncio.create_task(
            self._auto_suggest_sources(project_id, created_subjects, knowledge_profile)
        )

        return {
            "subjects": created_subjects,
            "knowledge_profile": knowledge_profile,
            "source_candidates": source_candidates,
        }

    async def _auto_suggest_sources(
        self,
        project_id: int,
        created_subjects: list,
        knowledge_profile: dict,
    ) -> None:
        """Fire-and-forget : génère des sources LLM et les sauvegarde comme proposals pending."""
        try:
            import os
            from argos.services.intent_discovery import IntentService, DiscoveryService
            from argos.config import settings as _settings

            # Résoudre la clé API Anthropic : variable d'env explicite ou settings
            api_key = (
                os.getenv("ANTHROPIC_API_KEY")
                or _settings.anthropic_api_key
                or ""
            )

            # Construire l'intent depuis le knowledge_profile
            subject_names = [s["name"] for s in created_subjects]
            watch_focus = knowledge_profile.get("watch_focus_md", "")
            intent_parts = [
                f"Sujets : {', '.join(subject_names)}",
                f"\nPour chaque source suggérée, ajoute un champ 'subject' avec le nom exact du sujet parmi : {', '.join(subject_names)}",
            ]
            if watch_focus:
                intent_parts.insert(0, watch_focus[:600])

            if api_key:
                intent_svc = IntentService(anthropic_api_key=api_key)
                intent_data = await intent_svc.decompose("\n".join(intent_parts))
            else:
                # Fallback sans LLM : intent minimal depuis le profil
                entities = [{"name": n, "type": "topic"} for n in subject_names]
                themes = knowledge_profile.get("subjects_and_levels", {})
                intent_data = {
                    "entities": entities,
                    "themes": list(themes.keys())[:6] if themes else subject_names[:4],
                    "source_types": ["blog", "documentation", "github", "research"],
                    "keywords": subject_names + knowledge_profile.get("key_terms", [])[:8],
                }

            discovery_svc = DiscoveryService(db_manager=self._db)
            candidates = await discovery_svc.find_sources(intent_data=intent_data)

            # Filtrer les sources par pertinence projet avant proposition
            project_context = "\n".join(filter(None, [
                knowledge_profile.get("watch_focus_md", "")[:600],
                knowledge_profile.get("bilan_md", "")[:400],
            ]))
            if project_context and api_key:
                from argos.services.project_relevance_filter import filter_candidates_by_relevance
                candidates = await filter_candidates_by_relevance(candidates, project_context, api_key)

            ws_by_name = {s["name"].lower(): s["id"] for s in created_subjects}

            def _match_ws(c: dict) -> int | None:
                hint = (c.get("subject") or c.get("reason") or "").lower()
                for name, wid in ws_by_name.items():
                    if any(w in hint for w in name.lower().split() if len(w) > 3):
                        return wid
                return created_subjects[0]["id"] if created_subjects else None

            with self._db.get_connection() as conn:
                with conn.cursor() as cur:
                    for c in candidates:
                        url = (c.get("url") or "").strip()
                        if not url:
                            continue
                        cur.execute(
                            "SELECT id FROM source_proposals WHERE project_id = %s AND url = %s",
                            (project_id, url),
                        )
                        if cur.fetchone():
                            continue
                        cur.execute(
                            """INSERT INTO source_proposals
                               (project_id, sujet_id, url, source_type, name, description, status)
                               VALUES (%s, %s, %s, %s, %s, %s, 'approved')""",
                            (project_id, _match_ws(c), url,
                             c.get("type", "website"),
                             (c.get("name") or url)[:255],
                             (c.get("reason") or "")[:500]),
                        )
                conn.commit()
            logger.info(f"[AUTO-SUGGEST] {len(candidates)} sources proposées pour projet {project_id}")
        except Exception as e:
            logger.warning(f"[AUTO-SUGGEST] Échec pour projet {project_id} : {e}")
