"""
CalibrationAgent — entretien de configuration de veille
Boucle : Lire → Décider (chercher / demander / finaliser)

Niveaux : novice → débutant → intermédiaire → avancé → expert
"""
import asyncio
import json
import logging
from dataclasses import dataclass, field
from typing import Optional

from argos.config import settings

logger = logging.getLogger(__name__)

# ── Domaines interdits en dur — enforcement, pas une règle LLM ───────────────

# Agrégateurs, forums, plateformes de cours — interdits quel que soit le sujet
FORBIDDEN_DOMAINS = {
    "medium.com", "dev.to", "hashnode.com", "substack.com",
    "wordpress.com", "blogger.com", "reddit.com", "stackoverflow.com",
    "quora.com", "wikipedia.org", "udemy.com", "coursera.org",
    "edx.org", "datacamp.com", "kaggle.com",
}

# Domaines académiques — autorisés pour intention="apprendre", interdits pour "surveiller"
ACADEMIC_DOMAINS = {
    "arxiv.org", "semanticscholar.org", "researchgate.net",
    "springerlink.com", "ieeexplore.ieee.org", "nature.com", "science.org",
    "paperswithcode.com",
}

LEVELS = ["novice", "débutant", "intermédiaire", "avancé", "expert"]


# ── State de calibration ──────────────────────────────────────────────────────

@dataclass
class TopicState:
    name: str
    level_current: Optional[str] = None   # novice → expert
    level_target: Optional[str] = None
    searched: bool = False
    ecosystem_terms: list[str] = field(default_factory=list)


@dataclass
class CalibrationState:
    topics_explicit: list[TopicState] = field(default_factory=list)
    topics_implicit: list[TopicState] = field(default_factory=list)
    tools: list[str] = field(default_factory=list)
    actors: list[str] = field(default_factory=list)
    out_of_scope: list[str] = field(default_factory=list)
    sectors: list[str] = field(default_factory=list)
    inconsistencies: list[str] = field(default_factory=list)

    def all_topics(self) -> list[TopicState]:
        return self.topics_explicit + self.topics_implicit

    def unsearched(self) -> list[TopicState]:
        return [t for t in self.all_topics() if not t.searched]

    def uncovered(self) -> list[TopicState]:
        """Topics sans niveau actuel ou cible."""
        return [
            t for t in self.all_topics()
            if t.level_current is None or t.level_target is None
        ]

    def missing_angles(self) -> list[str]:
        """
        Angles thématiques obligatoires pas encore couverts.
        Chaque item est une instruction pour le décideur LLM.
        """
        missing = []
        if not self.tools and not self.actors:
            missing.append("outils, frameworks et acteurs à surveiller (aucun mentionné)")
        elif not self.tools:
            missing.append("outils et frameworks concrets (aucun outil mentionné)")
        elif not self.actors:
            missing.append("acteurs et organisations à surveiller (aucun acteur mentionné)")
        if self.inconsistencies:
            missing.append(
                f"clarification des incohérences détectées : {'; '.join(self.inconsistencies)}"
            )
        if not self.out_of_scope:
            missing.append("périmètre explicite : ce qui est hors-scope (aucune exclusion mentionnée)")
        return missing

    def is_ready_to_finalize(self, n_questions: int) -> bool:
        # Minimum absolu — pas de raccourci possible
        if n_questions < 10:
            return False
        # Recherche obligatoire sur tous les topics avant finalisation
        if self.unsearched():
            return False
        # Niveaux obligatoires — tolérance après 15 questions pour ne pas bloquer indéfiniment
        if self.uncovered() and n_questions < 15:
            return False
        # Angles thématiques obligatoires — tolérance après 15 questions
        if self.missing_angles() and n_questions < 15:
            return False
        return True


# ── CalibrationAgent ─────────────────────────────────────────────────────────

class CalibrationAgent:

    def __init__(self):
        from argos.services.llm_provider import create_llm_provider
        self._sonnet = "us.anthropic.claude-sonnet-4-20250514-v1:0"
        self._llm_kwargs = dict(
            provider_type=settings.llm_provider,
            openai_api_key=settings.openai_api_key,
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
            aws_region=settings.aws_region,
            model=self._sonnet,
        )
        from argos.services.llm_provider import create_llm_provider
        self._llm = create_llm_provider(**self._llm_kwargs)

    # ── Bloc 1 : lecteur ──────────────────────────────────────────────────────

    async def _read_state(
        self,
        sujet_name: str,
        intention: str,
        initial_context: str,
        qa_history: list[dict],
    ) -> CalibrationState:
        """
        Relit tout le contexte et reconstruit un CalibrationState structuré.
        Identifie explicites, implicites, incohérences.
        """
        qa_text = "\n".join(
            f"Q{i+1}: {qa['q']}\nR{i+1}: {qa['a']}"
            for i, qa in enumerate(qa_history)
        ) if qa_history else "Aucun échange encore."

        prompt = f"""Tu analyses un entretien de configuration de veille pour construire un état structuré.

Sujet : "{sujet_name}" — Intention : {intention}

Description initiale :
---
{initial_context or "(aucune)"}
---

Échanges :
{qa_text}

Ta tâche : extraire un état complet en JSON.

Règles d'extraction :
- topics_explicit : sujets/domaines/frameworks nommés DIRECTEMENT dans le contexte ou les réponses
- topics_implicit : sujets IMPLICITES déduits du contexte (ex: "j'ai fait du fine-tuning LoRA" → implicite: "PyTorch", "PEFT ecosystem", "pipeline de données")
- Pour chaque topic : niveau_actuel et niveau_cible si mentionné, sinon null. Niveaux possibles : novice, débutant, intermédiaire, avancé, expert
- tools : frameworks, librairies, outils nommés explicitement
- actors : entreprises, labs, projets open source nommés (Anthropic, Mistral, Hugging Face, etc.)
- sectors : secteurs applicatifs mentionnés (industrie, bancaire, défense, etc.)
- out_of_scope : ce qui a été explicitement exclu
- inconsistencies : contradictions détectées entre réponses (ex: "niveau avancé" + "je ne sais pas ce qu'est X")

Réponds UNIQUEMENT avec ce JSON :
{{
  "topics_explicit": [
    {{"name": "...", "level_current": null|"novice"|"débutant"|"intermédiaire"|"avancé"|"expert", "level_target": null|"..."}}
  ],
  "topics_implicit": [
    {{"name": "...", "level_current": null|"...", "level_target": null|"..."}}
  ],
  "tools": ["..."],
  "actors": ["..."],
  "sectors": ["..."],
  "out_of_scope": ["..."],
  "inconsistencies": ["..."]
}}"""

        try:
            response, _ = await self._llm.generate(
                prompt=prompt,
                system_prompt="Tu es un analyste expert. Tu extrais des informations structurées avec précision. Réponds uniquement avec du JSON valide.",
                temperature=0.2, max_tokens=2000, top_p=0.9,
            )
            raw = response.strip()
            start = raw.find("{")
            end = raw.rfind("}") + 1
            data = json.loads(raw[start:end])

            state = CalibrationState()
            for t in data.get("topics_explicit", []):
                state.topics_explicit.append(TopicState(
                    name=t["name"],
                    level_current=t.get("level_current"),
                    level_target=t.get("level_target"),
                ))
            for t in data.get("topics_implicit", []):
                state.topics_implicit.append(TopicState(
                    name=t["name"],
                    level_current=t.get("level_current"),
                    level_target=t.get("level_target"),
                ))
            state.tools = data.get("tools", [])
            state.actors = data.get("actors", [])
            state.sectors = data.get("sectors", [])
            state.out_of_scope = data.get("out_of_scope", [])
            state.inconsistencies = data.get("inconsistencies", [])
            return state

        except Exception as e:
            logger.error(f"_read_state failed: {e}")
            return CalibrationState()

    # ── Recherche SearXNG ─────────────────────────────────────────────────────

    async def _search_topic(
        self,
        topic_name: str,
        is_fast_evolving: bool = True,
        context_terms: list[str] | None = None,
    ) -> list[str]:
        """
        Recherche SearXNG contextualisée sur un topic.
        - is_fast_evolving=True  → filtre 6-12 derniers mois (veille active)
        - is_fast_evolving=False → pas de filtre date (sujets académiques classiques)
        - context_terms → mots du contexte de l'entretien pour préciser la requête
        """
        from argos.services.web_search import search_with_searxng
        from argos.config import settings as _s
        import datetime

        searxng_url = getattr(_s, "searxng_url", "http://searxng:8080")

        context_hint = " ".join(context_terms[:3]) if context_terms else ""
        if is_fast_evolving:
            year = datetime.datetime.now().year
            query = f"{topic_name} {context_hint} ecosystem tools frameworks {year}".strip()
        else:
            query = f"{topic_name} {context_hint} ecosystem tools frameworks classic".strip()

        results = await search_with_searxng(query, max_results=8, searxng_url=searxng_url)

        if not results:
            return []

        snippets = "\n".join(
            f"- {r['title']}: {r.get('content', '')[:200]}"
            for r in results[:6]
        )

        prompt = f"""À partir de ces résultats de recherche sur "{topic_name}", extrais les noms d'outils, frameworks, librairies et acteurs pertinents pour une veille tech.

{snippets}

Retourne UNIQUEMENT une liste JSON de termes courts et précis (noms propres, pas de phrases) :
["terme1", "terme2", ...]

Règles :
- Uniquement des noms d'outils, frameworks, librairies, entreprises, projets
- Pas de termes génériques ("machine learning", "deep learning")
- 5 à 15 termes maximum"""

        try:
            response, _ = await self._llm.generate(
                prompt=prompt,
                system_prompt="Tu extrais des noms d'outils et frameworks depuis des résultats de recherche. Réponds uniquement avec une liste JSON.",
                temperature=0.1, max_tokens=500, top_p=0.9,
            )
            raw = response.strip()
            start = raw.find("[")
            end = raw.rfind("]") + 1
            if start >= 0 and end > start:
                return json.loads(raw[start:end])
        except Exception as e:
            logger.warning(f"_search_topic parse failed for '{topic_name}': {e}")
        return []

    # ── Clarification d'incohérences ────────────────────────────────────────

    async def _ask_clarification(
        self,
        inconsistencies: list[str],
        qa_history: list[dict],
        sujet_name: str,
    ) -> dict:
        """
        Génère une question de clarification ciblée sur la première incohérence
        détectée. La question confronte directement l'utilisateur à la contradiction
        avec bienveillance, et propose des options quand c'est possible.
        """
        # On traite la première incohérence non encore clarifiée
        contradiction = inconsistencies[0]
        qa_text = "\n".join(
            f"Q{i+1}: {qa['q']}\nR{i+1}: {qa['a']}"
            for i, qa in enumerate(qa_history)
        ) if qa_history else "Aucun échange."

        prompt = f"""Dans cet entretien de veille sur "{sujet_name}", une incohérence a été détectée :

Incohérence : {contradiction}

Échanges :
{qa_text}

Génère une question de clarification qui :
1. Pointe la contradiction de façon bienveillante et précise ("Tu as mentionné X, mais aussi Y — comment tu vois ça ?")
2. Propose des options cliquables si la réponse est listable (type multiselect, max 4 options)
3. Sinon utilise type "open"
4. Ne répète pas ce que l'utilisateur a déjà dit — va droit au fait

Réponds UNIQUEMENT avec ce JSON :
{{"text": "...", "type": "open" | "multiselect", "options": [...]}}"""

        try:
            response, _ = await self._llm.generate(
                prompt=prompt,
                system_prompt="Tu conduis un entretien de calibrage. Tes questions de clarification sont directes, bienveillantes et précises. JSON valide uniquement.",
                temperature=0.3, max_tokens=400, top_p=0.9,
            )
            raw = response.strip()
            start = raw.find("{")
            end = raw.rfind("}") + 1
            return json.loads(raw[start:end])
        except Exception as e:
            logger.error(f"_ask_clarification failed: {e}")
            return {
                "text": f"J'ai noté une possible contradiction : {contradiction}. Peux-tu clarifier ?",
                "type": "open",
                "options": [],
            }

    # ── Bloc 2 : décideur ─────────────────────────────────────────────────────

    async def _decide_next_action(
        self,
        sujet_name: str,
        intention: str,
        initial_context: str,
        qa_history: list[dict],
        state: CalibrationState,
    ) -> dict:
        """
        Décide de la prochaine action : chercher / demander / finaliser.
        Retourne:
          {"action": "search", "topic": "..."}
          {"action": "ask",    "question": {"text": ..., "type": ..., "options": [...]}}
          {"action": "finalize"}
        """
        n = len(qa_history)

        # Enforcement : recherche obligatoire avant finalisation
        unsearched = state.unsearched()
        if unsearched:
            return {"action": "search", "topic": unsearched[0].name}

        # Enforcement : incohérences → question de clarification obligatoire en priorité absolue
        # On ne passe au reste qu'une fois les incohérences clarifiées ou après 15 questions
        if state.inconsistencies and n < 15:
            clarification = await self._ask_clarification(
                inconsistencies=state.inconsistencies,
                qa_history=qa_history,
                sujet_name=sujet_name,
            )
            return {"action": "ask", "question": clarification}

        # Prêt à finaliser ?
        if state.is_ready_to_finalize(n):
            return {"action": "finalize"}

        # Sinon : demander
        qa_text = "\n".join(
            f"Q{i+1}: {qa['q']}\nR{i+1}: {qa['a']}"
            for i, qa in enumerate(qa_history)
        ) if qa_history else "Aucun échange."

        ecosystem_ctx = ""
        all_ecosystem = []
        for t in state.all_topics():
            if t.ecosystem_terms:
                all_ecosystem.extend(t.ecosystem_terms)
        if all_ecosystem:
            ecosystem_ctx = f"\n\nTermes découverts par recherche (écosystème) :\n{', '.join(set(all_ecosystem))}"

        uncovered = [t.name for t in state.uncovered()]
        inconsistencies = state.inconsistencies
        missing = state.missing_angles()

        state_summary = f"""État actuel :
- Sujets explicites : {[t.name for t in state.topics_explicit]}
- Sujets implicites : {[t.name for t in state.topics_implicit]}
- Outils/frameworks identifiés : {state.tools if state.tools else "aucun"}
- Acteurs identifiés : {state.actors if state.actors else "aucun"}
- Hors-périmètre explicite : {state.out_of_scope if state.out_of_scope else "aucun"}
- Sans niveau défini : {uncovered if uncovered else "tous couverts"}
- Incohérences détectées : {inconsistencies if inconsistencies else "aucune"}
- Secteurs : {state.sectors if state.sectors else "non précisé"}
- Questions posées : {n}
- Angles encore à couvrir : {missing if missing else "tous couverts — prêt à finaliser"}"""

        # Détection d'une demande directe de recommandation dans la dernière réponse
        last_answer = qa_history[-1]["a"].lower() if qa_history else ""
        recommendation_requested = any(trigger in last_answer for trigger in [
            "recommande-moi", "recommande moi", "donne-moi tes recommandations",
            "quels sont tes recommandations", "fais-moi une recommandation",
            "conseille-moi directement", "donne-moi directement", "recommande directement",
        ])

        recommendation_instruction = ""
        if recommendation_requested:
            recommendation_instruction = """
DEMANDE DIRECTE DÉTECTÉE : l'utilisateur veut une recommandation, pas une nouvelle question.
Tu DOIS formuler ta réponse comme une recommandation concrète avec 1-2 outils nommés explicitement,
suivie d'une question de confirmation courte. Exemple :
"Je te recommande DeepEval pour sa simplicité : peu de configuration, métriques essentielles couvertes.
Veux-tu l'inclure ?"
NE PAS poser une nouvelle question ouverte sur la méthode de choix."""

        prompt = f"""Tu conduis un entretien de configuration de veille ({intention}) sur "{sujet_name}".
Contexte initial : {initial_context or "(aucun)"}

{state_summary}{ecosystem_ctx}

Échanges :
{qa_text}

CONTEXTE D'ARGOS :
- Collecte des articles depuis les sources officielles des acteurs du domaine concerné
- Pour intention "apprendre" : inclure aussi littérature académique et fondamentaux
- Pour intention "surveiller" ou "projets" : articles récents (<3 mois), pas de cours ni MOOC
- NE PAS poser de questions sur : médias préférés, fréquence de lecture, livres ou cours
{recommendation_instruction}
Génère la prochaine question la plus utile pour compléter le profil.
Priorité d'ordre : 1) couvrir les angles manquants listés ci-dessus, 2) approfondir les sujets sans niveau, 3) proposer des outils/acteurs de l'écosystème pour confirmation.

RÈGLE DE PROPOSITION OBLIGATOIRE :
Pour chaque angle manquant ou outil non mentionné, ta question DOIT :
- Proposer des exemples concrets issus de l'écosystème réel ("On trouve souvent X, Y, Z dans ce domaine")
- Expliquer brièvement pourquoi ces outils sont pertinents pour la veille
- Utiliser type "multiselect" avec les options si les choix sont listables (max 6)
- Ne jamais poser une question vide comme "Quels outils utilises-tu ?" sans proposer

Exemples de formulations correctes :
- "En ML classique, scikit-learn et XGBoost sont incontournables pour la veille des releases. Tu veux les inclure ?"
- "Pour le suivi d'Anthropic et Mistral, leurs blogs officiels et les releases GitHub sont les meilleures sources. D'autres acteurs à ajouter : OpenAI, DeepMind, Meta AI ?"
- "Pour l'évaluation de LLM, RAGAS et lm-evaluation-harness sont les frameworks de référence. Tu les suis déjà ?"

Si des termes d'écosystème ont été découverts par recherche, intègre-les dans ta question pour que l'utilisateur confirme leur pertinence plutôt que de les lister de mémoire.

Niveaux possibles : novice → débutant → intermédiaire → avancé → expert

RÈGLES DE STYLE ABSOLUES :
- Ne JAMAIS commencer par un rappel ou une reformulation de ce que l'utilisateur a dit. Interdit : "Tu as dit...", "Tu as mentionné...", "Tu as choisi...", "Tu veux... mais tu dis aussi...", "Tu as exprimé... mais tu questionnes maintenant...", et toute formulation du type "Tu X mais tu Y" qui invente une contradiction.
- Aller droit au but : la question, pas l'historique
- Une question = un seul angle précis
- Si l'utilisateur dit qu'il ne sait pas, est perdu, ou demande un plan : NE PAS reposer une question sur comment l'aider. Prendre une décision à sa place, la proposer clairement, et demander confirmation. Exemple : "Je te propose de commencer par les concepts fondamentaux (ce qu'est un benchmark, pourquoi évaluer), puis les outils pratiques. On part sur cette progression ?"

Réponds UNIQUEMENT avec ce JSON :
{{"question": {{"text": "...", "type": "open" | "multiselect" | "level_pair", "options": []}}}}

Règles absolues :
- Ne jamais demander ce qui est déjà connu
- "multiselect" uniquement si les options sont listables à l'avance (max 6)
- Pour les niveaux actuel/cible : utilise TOUJOURS type "level_pair" — le frontend affichera deux rangées de boutons (Niveau actuel / Niveau cible) avec les 5 niveaux. options doit être [] (vide).
- Ne jamais demander les niveaux en texte libre"""

        # Préfixes interdits — vérification post-génération
        _FORBIDDEN_PREFIXES = (
            "tu as d'abord", "tu as sélectionné", "tu as mentionné",
            "tu as choisi", "comme tu l'as dit", "tu avais",
            "tu répètes", "tu demandes", "tu viens de", "tu questionnes",
            "tu optes", "tu veux", "tu as raison", "tu as exprimé",
            "tu as indiqué", "tu as précisé", "tu as confirmé",
        )

        try:
            response, _ = await self._llm.generate(
                prompt=prompt,
                system_prompt="Tu conduis un entretien de configuration de veille. Tes questions sont précises et directes. INTERDIT : commencer par rappeler ce que l'utilisateur a dit ('Tu as...', 'Tu viens de...', 'Tu répètes...', 'Tu demandes... mais tu viens de...'). Va droit au but. Réponds uniquement avec du JSON valide.",
                temperature=0.5, max_tokens=600, top_p=0.9,
            )
            raw = response.strip()
            start = raw.find("{")
            end = raw.rfind("}") + 1
            result = json.loads(raw[start:end])
            question = result.get("question", {})
            # Vérification post-génération : supprimer les rappels d'historique en début de question
            text = question.get("text", "")
            if text.lower().startswith(_FORBIDDEN_PREFIXES):
                # Trouver le premier point ou tiret et couper le rappel
                for sep in (". ", " — ", " : ", ", "):
                    idx = text.find(sep)
                    if idx != -1 and idx < 120:
                        text = text[idx + len(sep):].strip()
                        text = text[0].upper() + text[1:] if text else text
                        break
                question["text"] = text
            return {"action": "ask", "question": question}
        except Exception as e:
            logger.error(f"_decide_next_action failed: {e}")
            return {"action": "ask", "question": {"text": "Peux-tu préciser les outils ou frameworks que tu utilises le plus ?", "type": "open"}}

    # ── Point d'entrée : prochaine question ──────────────────────────────────

    async def next_question(
        self,
        sujet_name: str,
        intention: str,
        initial_context: str,
        qa_history: list[dict],
        sujet_id: int = 0,
    ) -> dict:
        """
        Retourne :
          {"question": {"text": ..., "type": ..., "options": [...]}}
        ou
          {"done": True, "reason": "..."}
        """
        # Première question sans contexte : demande libre
        if not qa_history and not initial_context:
            return {"question": {
                "text": "Décris ton besoin, ton contexte et ton niveau actuel en quelques phrases libres.",
                "type": "open",
            }}

        # Détection signal de validation explicite — finalise sans passer par le LLM
        _VALIDATION_SIGNALS = (
            "je valide", "c'est bon", "c'est parfait", "parfait",
            "valide", "go", "oui je valide", "non je valide",
            "configuration validée", "ça me convient", "ça convient",
            "ok", "d'accord", "très bien", "allons-y",
        )
        if qa_history:
            last_a = qa_history[-1].get("a", "").lower().strip()
            last_q = qa_history[-1].get("q", "").lower()
            # Signal valide uniquement si la question précédente invitait à valider/confirmer
            confirmation_question = any(w in last_q for w in (
                "valider", "valide", "confirme", "confirmer", "finaliser",
                "modifier", "ajuster", "configuration", "tout est bon",
            ))
            if confirmation_question and any(last_a == s or last_a.startswith(s) for s in _VALIDATION_SIGNALS):
                return {"done": True, "reason": "Configuration validée par l'utilisateur."}

        # Bloc 1 : lire l'état
        state = await self._read_state(sujet_name, intention, initial_context, qa_history)

        # Restaurer les termes déjà trouvés depuis le cache (diff)
        cache = get_search_cache(sujet_id)
        for topic in state.all_topics():
            if topic.name in cache:
                topic.searched = True
                topic.ecosystem_terms = cache[topic.name]

        # Bloc 2 : décider
        action = await self._decide_next_action(
            sujet_name, intention, initial_context, qa_history, state
        )

        if action["action"] == "finalize":
            return {"done": True, "reason": "Profil complet — tous les sujets ont été explorés et vérifiés."}

        # Chercher uniquement les topics NON encore dans le cache
        if action["action"] == "search":
            unsearched = state.unsearched()  # déjà filtrés par le cache ci-dessus
            if unsearched:
                logger.info(f"CalibrationAgent: searching {len(unsearched)} new topics in parallel: {[t.name for t in unsearched]}")
                context_terms = state.tools + state.actors + [t.name for t in state.topics_explicit]
                # intention="apprendre" → recherche élargie (pas de filtre date)
                # tout le reste → recherche récente uniquement
                is_fast = (intention != "apprendre")

                # Toutes les recherches SearXNG lancées simultanément
                results = await asyncio.gather(*[
                    self._search_topic(
                        t.name,
                        is_fast_evolving=is_fast,
                        context_terms=context_terms,
                    )
                    for t in unsearched
                ])
                for topic, terms in zip(unsearched, results):
                    topic.searched = True
                    topic.ecosystem_terms = terms
                    cache[topic.name] = terms
                    logger.info(f"CalibrationAgent: '{topic.name}' → {len(terms)} terms found")

            # Relancer le décideur avec state enrichi
            action2 = await self._decide_next_action(
                sujet_name, intention, initial_context, qa_history, state
            )
            if action2["action"] == "finalize":
                return {"done": True, "reason": "Profil complet."}
            if action2["action"] in ("ask", "search"):
                return {"question": action2.get("question", {"text": "Quels acteurs ou outils prioritaires veux-tu surveiller en premier ?", "type": "open"})}

        return {"question": action.get("question", {"text": "Quels acteurs ou outils prioritaires veux-tu surveiller en premier ?", "type": "open"})}

    # ── Génération du bilan ───────────────────────────────────────────────────

    async def generate_summary(
        self,
        sujet_name: str,
        intention: str,
        initial_context: str,
        qa_history: list[dict],
        extra_info: str = "",
    ) -> dict:
        """Retourne {"summary_md": str}"""
        qa_text = "\n".join(f"Q: {qa['q']}\nR: {qa['a']}" for qa in qa_history)
        extra_ctx = f"\n\nInformations supplémentaires :\n{extra_info}" if extra_info else ""

        prompt = f"""Génère un bilan de configuration de veille ({intention}) sur "{sujet_name}".

Description initiale :
{initial_context or "(aucune)"}

Entretien :
{qa_text}{extra_ctx}

ÉTAPE 1 — Analyse interne (ne pas inclure dans la réponse) :
a) Tous les sujets explicites + niveaux (novice→expert)
b) Sujets implicites déduits du contexte
c) Acteurs, outils, frameworks nommés
d) Ce qui est hors périmètre
e) Concepts du domaine ABSENTS mais clairement liés — que l'utilisateur a probablement oubliés

ÉTAPE 2 — Génère un titre court pour ce bilan :
- 2 à 4 mots maximum, sans article (pas de "la", "le", "les", "l'", "un", "une")
- Doit refléter le BESOIN GLOBAL exprimé, pas le nom technique du dossier
- Exemples corrects : "Veille IA moderne", "ML & Alignement", "GenAI & Évaluation"
- Exemples incorrects : "ML_DL", "Machine Learning", "Bases_IA" (trop technique ou trop générique)

ÉTAPE 3 — Rédige le bilan markdown :

## Besoin global
2-3 phrases de synthèse.

## Sujets et niveaux
Pour chaque sujet : niveau actuel → niveau cible (novice/débutant/intermédiaire/avancé/expert).

## Acteurs, outils, frameworks à surveiller
Liste structurée par catégorie.

## Angles prioritaires
Ce sur quoi concentrer la veille en premier.

## Hors périmètre
Ce qui a été explicitement exclu.

## Termes clés (whitelist)
Termes techniques précis pour le filtre.

## Suggestions — à considérer ?
OBLIGATOIRE : 4 à 8 concepts, outils ou acteurs étroitement liés mais NON mentionnés. Pour chacun, une phrase expliquant pourquoi il pourrait être pertinent.

Réponds UNIQUEMENT avec : {{"bilan_title": "...", "summary_md": "..."}}"""

        try:
            response, _ = await self._llm.generate(
                prompt=prompt,
                system_prompt="Tu es un expert senior en veille technologique et IA. Tes bilans sont précis, structurés et actionnables. Réponds uniquement avec du JSON valide.",
                temperature=0.7, max_tokens=3000, top_p=0.9,
            )
            raw = response.strip()
            start = raw.find("{")
            end = raw.rfind("}") + 1
            result = json.loads(raw[start:end])
            # Garantit la présence de bilan_title même si le LLM l'omet
            if not result.get("bilan_title"):
                result["bilan_title"] = sujet_name
            return result
        except Exception as e:
            logger.error(f"generate_summary failed: {e}")
            raise

    # ── Génération du filtre ──────────────────────────────────────────────────

    async def generate_output(
        self,
        sujet_name: str,
        intention: str,
        initial_context: str,
        qa_history: list[dict],
        extra_info: str = "",
        sujet_id: int | None = None,
    ) -> dict:
        """
        Génère filter_config, official_domains, learning_context, project_context.
        Enforcement en dur : tous les domaines de FORBIDDEN_DOMAINS sont retirés.
        sujet_id optionnel : permet de récupérer les ecosystem_terms du cache de recherche.
        """
        qa_text = "\n".join(f"Q: {qa['q']}\nR: {qa['a']}" for qa in qa_history)
        extra_ctx = f"\nInformations supplémentaires :\n{extra_info}" if extra_info else ""

        # Récupère les termes d'écosystème découverts pendant l'entretien (cache SearXNG)
        ecosystem_ctx = ""
        if sujet_id is not None:
            cache = get_search_cache(sujet_id)
            if cache:
                all_terms = []
                for topic_name, terms in cache.items():
                    if terms:
                        all_terms.append(f"  {topic_name} : {', '.join(terms)}")
                if all_terms:
                    ecosystem_ctx = "\n\nTermes découverts par recherche pendant l'entretien (à intégrer en priorité dans must_match_suggested) :\n" + "\n".join(all_terms)

        # Récupère les exclusions explicites depuis le state reconstruit
        out_of_scope_terms: list[str] = []
        try:
            state = await self._read_state(
                sujet_name=sujet_name,
                intention=intention,
                initial_context=initial_context,
                qa_history=qa_history,
            )
            out_of_scope_terms = state.out_of_scope or []
        except Exception as _state_err:
            logger.debug(f"generate_output: could not read state for out_of_scope: {_state_err}")

        out_of_scope_ctx = (
            f"\n\nExclusions EXPLICITES de l'utilisateur (must_not_match obligatoire) :\n"
            + "\n".join(f"  - {t}" for t in out_of_scope_terms)
            if out_of_scope_terms else ""
        )

        prompt = f"""Génère la configuration de filtrage finale pour une veille ({intention}) sur "{sujet_name}".

Description initiale :
{initial_context or "(aucune)"}

Entretien :
{qa_text}{extra_ctx}{ecosystem_ctx}{out_of_scope_ctx}

ÉTAPE 1 — Analyse interne :
- Liste SÉPARÉMENT :
  a) Termes CONFIRMÉS : tout ce que l'utilisateur a nommé EXPLICITEMENT (noms exacts, variantes, acronymes de ce qu'il a dit)
  b) Termes SUGGÉRÉS : termes connexes du même écosystème NON mentionnés mais clairement dans le périmètre (synonymes, composants, alternatives proches)
- Pour chaque framework/outil nommé dans l'entretien : inclure ses composants et variantes connus
- Les sites officiels des acteurs identifiés

ÉTAPE 2 — Génère :

EXCLUSIONS (must_not_match) :
- Si l'utilisateur a explicitement exclu des termes, domainesou sujets → les lister ici
- Ces termes seront bannis à la réception : tout article contenant l'un d'eux sera rejeté
- Format : liste de termes/mots-clés courts (pas de phrases)

TERMES CONFIRMÉS (must_match_confirmed) :
- Uniquement les noms, variantes et acronymes de ce que l'utilisateur a explicitement nommé
- 10 à 25 termes

TERMES SUGGÉRÉS (must_match_suggested) :
- Termes du même écosystème que l'agent propose — l'utilisateur devra les valider
- Base-toi EXCLUSIVEMENT sur les termes découverts par recherche pendant l'entretien (ecosystem_ctx ci-dessus) et sur ce que l'utilisateur a nommé — pas sur tes connaissances générales
- Pour chaque domaine identifié dans l'entretien : inclure ses outils, frameworks et concepts clés tels qu'ils apparaissent dans l'écosystème réel du sujet
- Le domaine peut être n'importe quoi (droit, finance, médecine, IA, géopolitique…) — adapte les termes au contexte réel, jamais de liste générique
- 15 à 30 termes (plus large que confirmés pour couvrir tout l'écosystème)

ACTEURS (actors) :
- Organisations, entreprises, labs, projets open source à surveiller — noms propres UNIQUEMENT
- Pas de termes techniques ni de frameworks dans cette liste
- Ces acteurs seront utilisés comme signal secondaire (un article les mentionnant passe uniquement s'il contient aussi un terme must_match)
- Exemples : "Anthropic", "Google DeepMind", "Mistral AI", "Hugging Face", "Meta AI"

HORIZON TEMPOREL (date_horizon) :
- Durée maximale des articles acceptés selon le rythme d'évolution du sujet
- Valeurs possibles : "7d", "30d", "90d", "6m", "1y", "all"
- "apprendre" avec fondamentaux → "all" ou "1y"
- "surveiller" actualité tech → "30d" ou "90d"
- "projets" en cours → "90d"
- Déduis la valeur du contexte réel du sujet, pas seulement de l'intention

NIVEAU (level) :
- Niveau global de l'utilisateur pour ce sujet : novice / débutant / intermédiaire / avancé / expert
- Utilise le niveau ACTUEL déclaré dans l'entretien (pas le niveau cible)
- Servira à adapter le Briefing et la complexité des articles sélectionnés

TYPES DE CONTENU (content_type) :
- Types d'articles acceptés pour ce sujet
- Valeurs possibles : "news", "paper", "blog_post", "release", "tutorial"
- "apprendre" fondamentaux → ["paper", "tutorial", "blog_post"]
- "surveiller" actualité → ["news", "release", "blog_post"]
- "projets" → ["release", "blog_post", "tutorial"]
- Adapte à la réalité du sujet

SOURCES CANDIDATES :
- Pour chaque acteur tech identifié, fournis 1 à 3 URLs candidates (blog officiel, flux RSS connu, page releases)
- Format URL complet avec https:// (ex: https://pytorch.org/blog/, https://anthropic.com/news)
- type : "rss" si c'est probablement un flux RSS, "website" sinon
- JAMAIS : medium.com, blogs perso, agrégateurs, forums, sites de cours (udemy, coursera…)
- Pour intention "surveiller"/"projets" : jamais arxiv.org, nature.com, revues académiques
- Pour intention "apprendre" : arxiv.org, nature.com, paperswithcode.com sont acceptables

DEPTH_BY_TOPIC (calibrage de profondeur) :
- Pour chaque sujet : niveau parmi novice/débutant/intermédiaire/avancé/expert
- novice/débutant → inclure articles d'introduction et explication
- intermédiaire → articles pratiques et retours d'expérience
- avancé/expert → uniquement nouveautés, papiers techniques, cas edge

{"LEARNING CONTEXT : subject_levels (dict sujet→niveau actuel), target_levels (dict sujet→niveau cible), priority_topics (liste)" if intention == "apprendre" else ""}
{"PROJECT CONTEXT : description, stack, phase, constraints" if intention == "projets" else ""}

Réponds UNIQUEMENT avec ce JSON :
{{
  "filter_config": {{
    "must_match_confirmed": ["terme1", ...],
    "must_match_suggested": ["terme1", ...],
    "must_not_match": ["terme_exclu1", ...],
    "actors": ["Anthropic", "Google DeepMind", ...],
    "date_horizon": "30d",
    "level": "intermédiaire",
    "content_type": ["news", "paper"],
    "min_match_count": 1,
    "depth_by_topic": {{"sujet": "niveau", ...}}
  }},
  "source_candidates": [
    {{"url": "https://...", "type": "rss|website", "name": "Nom lisible"}},
    ...
  ],
  "learning_context": {{...}} or null,
  "project_context": {{...}} or null,
  "summary": "résumé en 2 phrases de ce qui sera surveillé"
}}"""

        try:
            response, _ = await self._llm.generate(
                prompt=prompt,
                system_prompt="Tu es un expert senior en veille technologique. Tu génères des configurations exhaustives et précises. Tu ne laisses aucun sous-domaine sans couverture. Réponds uniquement avec du JSON valide.",
                temperature=0.7, max_tokens=3000, top_p=0.9,
            )
            raw = response.strip()
            start = raw.find("{")
            end = raw.rfind("}") + 1
            result = json.loads(raw[start:end])

            # ── Enforcement en dur : retirer les sources sur domaines interdits ──
            raw_candidates = result.get("source_candidates", [])
            clean_candidates = []
            removed_urls = []
            for sc in raw_candidates:
                url = sc.get("url", "")
                from urllib.parse import urlparse
                try:
                    hostname = urlparse(url).hostname or ""
                except Exception:
                    hostname = ""
                blocked = FORBIDDEN_DOMAINS | (ACADEMIC_DOMAINS if intention != "apprendre" else set())
                is_forbidden = any(
                    hostname == f or hostname.endswith(f".{f}")
                    for f in blocked
                )
                if is_forbidden:
                    removed_urls.append(url)
                else:
                    clean_candidates.append(sc)
            result["source_candidates"] = clean_candidates
            if removed_urls:
                logger.info(f"CalibrationAgent: removed forbidden source candidates: {removed_urls}")

            # ── Compatibilité : exposer must_match = confirmed + suggested ────
            fc = result.get("filter_config", {})
            confirmed = fc.get("must_match_confirmed") or fc.get("must_match") or []
            suggested = fc.get("must_match_suggested") or []
            fc["must_match_confirmed"] = confirmed
            fc["must_match_suggested"] = suggested
            fc["must_match"] = confirmed  # champ actif = seulement les confirmés par défaut

            # ── Merge out_of_scope du state → must_not_match (dédoublonné) ────
            llm_exclusions = [t.lower().strip() for t in (fc.get("must_not_match") or []) if t]
            state_exclusions = [t.lower().strip() for t in out_of_scope_terms if t]
            all_exclusions = list(dict.fromkeys(llm_exclusions + state_exclusions))
            fc["must_not_match"] = all_exclusions

            # ── is_fast_evolving : dérivé de date_horizon ────────────────────────
            # "all" → pas de filtre date ; tout le reste → filtre actif
            date_horizon = fc.get("date_horizon") or ("all" if intention == "apprendre" else "90d")
            fc["date_horizon"] = date_horizon
            fc["is_fast_evolving"] = (date_horizon != "all")
            result["filter_config"] = fc

            return result

        except Exception as e:
            logger.error(f"generate_output failed: {e}")
            raise


# ── Cache de recherche par sujet (mémoire provisoire) ────────────────────────
# Clé : sujet_id  →  {topic_name: [terms]}
# Durée de vie : session serveur (pas persisté)

_search_cache: dict[int, dict[str, list[str]]] = {}


def get_search_cache(sujet_id: int) -> dict[str, list[str]]:
    if sujet_id not in _search_cache:
        _search_cache[sujet_id] = {}
    return _search_cache[sujet_id]


def clear_search_cache(sujet_id: int) -> None:
    _search_cache.pop(sujet_id, None)


# ── Instance singleton ────────────────────────────────────────────────────────

_agent: Optional[CalibrationAgent] = None


def get_agent() -> CalibrationAgent:
    global _agent
    if _agent is None:
        _agent = CalibrationAgent()
    return _agent
