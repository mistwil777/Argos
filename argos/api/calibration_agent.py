"""
CalibrationAgent — entretien de configuration de veille
Boucle : Lire → Décider (chercher / demander / finaliser)

Niveaux : novice → débutant → intermédiaire → avancé → expert
"""
import json
import logging
from dataclasses import dataclass, field
from typing import Optional

from argos.config import settings

logger = logging.getLogger(__name__)

# ── Domaines interdits en dur — enforcement, pas une règle LLM ───────────────

FORBIDDEN_DOMAINS = {
    "arxiv.org", "medium.com", "towardsdatascience.com", "dev.to",
    "hashnode.com", "substack.com", "wordpress.com", "blogger.com",
    "reddit.com", "stackoverflow.com", "quora.com", "wikipedia.org",
    "udemy.com", "coursera.org", "edx.org", "datacamp.com",
    "kaggle.com", "analyticsvidhya.com", "machinelearningmastery.com",
    "neptune.ai", "paperswithcode.com", "semanticscholar.org",
    "researchgate.net", "springerlink.com", "ieeexplore.ieee.org",
    "nature.com", "science.org",
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
        return [
            t for t in self.all_topics()
            if t.level_current is None or t.level_target is None
        ]

    def is_ready_to_finalize(self, n_questions: int) -> bool:
        if n_questions < 4:
            return False
        if self.unsearched():
            return False
        if self.uncovered() and n_questions < 8:
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
- tools : frameworks, librairies, outils nommés (LangChain, scikit-learn, etc.)
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

        state_summary = f"""État actuel :
- Sujets explicites : {[t.name for t in state.topics_explicit]}
- Sujets implicites : {[t.name for t in state.topics_implicit]}
- Sans niveau défini : {uncovered}
- Incohérences détectées : {inconsistencies if inconsistencies else "aucune"}
- Secteurs : {state.sectors}
- Questions posées : {n}"""

        prompt = f"""Tu conduis un entretien de configuration de veille ({intention}) sur "{sujet_name}".
Contexte initial : {initial_context or "(aucun)"}

{state_summary}{ecosystem_ctx}

Échanges :
{qa_text}

CONTEXTE D'ARGOS :
- Collecte uniquement des articles récents (<3 mois) depuis des sites officiels d'acteurs tech
- Ne collecte PAS : livres, cours, MOOC, tutoriels, arxiv, revues académiques
- NE PAS poser de questions sur : médias préférés, fréquence de lecture, livres ou cours

Génère la prochaine question la plus utile pour compléter le profil.
Priorité : sujets sans niveau défini, incohérences à clarifier, acteurs/outils non précisés.

Si des termes d'écosystème ont été découverts par recherche, intègre-les dans ta question pour que l'utilisateur confirme leur pertinence plutôt que de les lister de mémoire.

Niveaux possibles : novice → débutant → intermédiaire → avancé → expert

Réponds UNIQUEMENT avec ce JSON :
{{"question": {{"text": "...", "type": "open" | "multiselect", "options": [...]}}}}

Règles absolues :
- Ne jamais demander ce qui est déjà connu
- Une question = un seul angle précis
- "multiselect" uniquement si les options sont listables à l'avance (max 6)
- Pour les niveaux : demande niveau actuel ET cible dans la même question (ex: "Sur X, niveau actuel et cible ? novice/débutant/intermédiaire/avancé/expert")"""

        try:
            response, _ = await self._llm.generate(
                prompt=prompt,
                system_prompt="Tu conduis un entretien de configuration de veille. Tes questions sont précises, contextualisées, et évitent toute redondance. Réponds uniquement avec du JSON valide.",
                temperature=0.5, max_tokens=600, top_p=0.9,
            )
            raw = response.strip()
            start = raw.find("{")
            end = raw.rfind("}") + 1
            result = json.loads(raw[start:end])
            return {"action": "ask", "question": result.get("question", {})}
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
                logger.info(f"CalibrationAgent: searching {len(unsearched)} new topics: {[t.name for t in unsearched]}")
                # Contexte de l'entretien pour préciser les requêtes
                context_terms = state.tools + state.actors + [t.name for t in state.topics_explicit]
                # Sujets académiques classiques : pas de filtre date
                ACADEMIC_KEYWORDS = {"statistique", "algèbre", "probabilité", "mathématique", "théorie", "algorithme"}
                for topic in unsearched:
                    is_evolving = not any(kw in topic.name.lower() for kw in ACADEMIC_KEYWORDS)
                    terms = await self._search_topic(topic.name, is_fast_evolving=is_evolving, context_terms=context_terms)
                    topic.searched = True
                    topic.ecosystem_terms = terms
                    cache[topic.name] = terms  # mémoriser pour les prochains appels
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

ÉTAPE 2 — Rédige le bilan markdown :

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

Réponds UNIQUEMENT avec : {{"summary_md": "..."}}"""

        try:
            response, _ = await self._llm.generate(
                prompt=prompt,
                system_prompt="Tu es un expert senior en veille technologique et IA. Tes bilans sont précis, structurés et actionnables. Réponds uniquement avec du JSON valide.",
                temperature=0.7, max_tokens=3000, top_p=0.9,
            )
            raw = response.strip()
            start = raw.find("{")
            end = raw.rfind("}") + 1
            return json.loads(raw[start:end])
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
    ) -> dict:
        """
        Génère filter_config, official_domains, learning_context, project_context.
        Enforcement en dur : tous les domaines de FORBIDDEN_DOMAINS sont retirés.
        """
        qa_text = "\n".join(f"Q: {qa['q']}\nR: {qa['a']}" for qa in qa_history)
        extra_ctx = f"\nInformations supplémentaires :\n{extra_info}" if extra_info else ""

        prompt = f"""Génère la configuration de filtrage finale pour une veille ({intention}) sur "{sujet_name}".

Description initiale :
{initial_context or "(aucune)"}

Entretien :
{qa_text}{extra_ctx}

ÉTAPE 1 — Analyse interne :
- Liste SÉPARÉMENT :
  a) Termes CONFIRMÉS : tout ce que l'utilisateur a nommé EXPLICITEMENT (noms exacts, variantes, acronymes de ce qu'il a dit)
  b) Termes SUGGÉRÉS : termes connexes du même écosystème NON mentionnés mais clairement dans le périmètre (synonymes, composants, alternatives proches)
- Pour chaque framework/outil : ses composants (ex: LangChain → LangGraph, LangSmith, LCEL)
- Les sites officiels des acteurs identifiés

ÉTAPE 2 — Génère :

TERMES CONFIRMÉS (must_match_confirmed) :
- Uniquement les noms, variantes et acronymes de ce que l'utilisateur a explicitement nommé
- 10 à 25 termes

TERMES SUGGÉRÉS (must_match_suggested) :
- Termes du même écosystème que l'agent propose — l'utilisateur devra les valider
- Couvre les sous-domaines mentionnés (ex: ML classique → scikit-learn, XGBoost, LightGBM, k-means)
- 10 à 20 termes

SOURCES CANDIDATES :
- Pour chaque acteur tech identifié, fournis 1 à 3 URLs candidates (blog officiel, flux RSS connu, page releases)
- Format URL complet avec https:// (ex: https://pytorch.org/blog/, https://anthropic.com/news)
- type : "rss" si c'est probablement un flux RSS, "website" sinon
- JAMAIS : arxiv.org, medium.com, towardsdatascience.com, blogs perso, agrégateurs, sites de cours

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
                is_forbidden = any(
                    hostname == f or hostname.endswith(f".{f}")
                    for f in FORBIDDEN_DOMAINS
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
