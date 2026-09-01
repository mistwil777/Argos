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

        # Détecter les axes déjà couverts — dans le CDC ET dans l'historique Q/A
        cdc_subjects_lower = " ".join(
            s.get("name", "") + " " + " ".join(s.get("sub_subjects", []))
            for s in cdc_analysis.get("subjects", [])
        ).lower()
        cdc_constraints_lower = " ".join(cdc_analysis.get("constraints", [])).lower()
        cdc_all = (
            cdc_subjects_lower + " " + cdc_constraints_lower + " " +
            " ".join(cdc_analysis.get("domains", [])).lower() + " " +
            " ".join(cdc_analysis.get("gaps", [])).lower()
        )
        qa_lower = " ".join(f"{qa['q']} {qa['a']}" for qa in qa_history).lower()
        corpus = cdc_all + " " + qa_lower

        axes_covered = []
        # stack_technique : couverte si le CDC mentionne des technos précises avec versions
        cdc_has_stack = any(w in cdc_all for w in [
            "react", "fastapi", "postgresql", "python", "typescript", "kubernetes", "terraform",
            "azure aks", "azure ad", "helm", "pydantic", "node", "django", ".net"
        ])
        if cdc_has_stack or any(w in qa_lower for w in ["stack", "framework", "langage", "techno", "version"]):
            axes_covered.append("stack_technique")

        if any(w in corpus for w in ["risque", "critique", "dépendance", "vulnérab", "dépréciat", "fin de support"]):
            axes_covered.append("composants_risque")

        cdc_has_jalons = any(w in cdc_all for w in ["jalon", "date", "planning", "deadline", "livraison", "mise en prod", "q1", "q2", "q3", "q4", "2026", "2027"])
        if cdc_has_jalons or any(w in qa_lower for w in ["jalon", "date", "délai", "livraison", "sprint", "démo"]):
            axes_covered.append("jalons")

        cdc_has_partners = any(w in cdc_all for w in ["sap", "microsoft", "cegedim", "partenaire", "fournisseur", "prestataire", "éditeur"])
        if cdc_has_partners or any(w in qa_lower for w in ["partenaire", "fournisseur", "externe", "tiers"]):
            axes_covered.append("partenaires_externes")

        if any(w in corpus for w in ["sécurité", "conformité", "rgpd", "chiffrement", "audit", "iso", "nis2", "anssi", "hds"]):
            axes_covered.append("securite_conformite")

        axes_remaining = [a for a in [
            "composants_risque", "jalons", "partenaires_externes", "securite_conformite", "stack_technique"
        ] if a not in axes_covered]

        format_note = (
            '{"done": true, "reason": "..."} OU {"question": {"text": "...", "type": "open"|"multiselect", "options": []}}'
        )

        prompt = f"""Tu conduis un entretien de calibration pour le projet professionnel « {project_name} ».

SUJETS DU PROJET :
{subjects_text}

LACUNES DU CDC :
{gaps_text}

CONTRAINTES CONNUES :
{constraints_text}

ÉCHANGES DÉJÀ RÉALISÉS ({n} questions) :
{qa_text}

AXES DÉJÀ COUVERTS (ne pas y revenir) : {', '.join(axes_covered) or 'aucun'}
AXES RESTANTS À COUVRIR : {', '.join(axes_remaining) or 'aucun — terminer'}

RÈGLES STRICTES :
1. Si aucun axe restant : retourne {{"done": true, "reason": "..."}}.
2. Pose UNE question sur le premier axe restant dans la liste ci-dessus.
3. Les seuls axes autorisés sont : stack_technique, composants_risque, jalons, partenaires_externes, securite_conformite.
4. INTERDIT : tests unitaires, CI/CD, monitoring interne, SLA de performance, outils de déploiement, méthodologie d'équipe, niveau de compétence. Ces sujets ne génèrent pas de veille utile.
5. Ne pose jamais une question dont la réponse est déjà dans les échanges.
6. Type "multiselect" en priorité avec 4-6 options contextualisées au projet. Type "open" uniquement si la réponse est vraiment libre.

FORMAT (JSON uniquement) :
{format_note}"""

        try:
            response, _ = await self._llm.generate(
                prompt=prompt,
                system_prompt=(
                    "Tu es un expert en veille technologique pour projets professionnels. "
                    "Tu identifies uniquement ce qui génère des alertes de veille externe utiles : "
                    "stack en production, dépendances à risque, jalons, partenaires, conformité. "
                    "Tu ignores tout ce qui est tooling interne (tests, CI/CD, monitoring, SLA). "
                    "Chaque question couvre un axe différent. Un axe couvert ne revient jamais. "
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

            api_key = os.getenv("ANTHROPIC_API_KEY")
            if not api_key:
                return

            # Construire l'intent depuis le knowledge_profile
            subject_names = [s["name"] for s in created_subjects]
            watch_focus = knowledge_profile.get("watch_focus_md", "")
            intent_parts = [
                f"Sujets : {', '.join(subject_names)}",
                f"\nPour chaque source suggérée, ajoute un champ 'subject' avec le nom exact du sujet parmi : {', '.join(subject_names)}",
            ]
            if watch_focus:
                intent_parts.insert(0, watch_focus[:600])

            intent_svc = IntentService(anthropic_api_key=api_key)
            intent_data = await intent_svc.decompose("\n".join(intent_parts))

            discovery_svc = DiscoveryService(db_manager=self._db)
            candidates = await discovery_svc.find_sources(intent_data=intent_data)

            # Filtrer les sources par pertinence projet avant proposition
            project_context = "\n".join(filter(None, [
                knowledge_profile.get("watch_focus_md", "")[:600],
                knowledge_profile.get("bilan_md", "")[:400],
            ]))
            if project_context:
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
