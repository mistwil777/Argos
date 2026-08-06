"""
Argos Scheduler — APScheduler v3 + SQLAlchemyJobStore (PostgreSQL)

Remplace les boucles asyncio ad-hoc de server.py.
Jobs persistants : survivent aux redémarrages du process.
"""

import logging
import os
from datetime import datetime

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore
from apscheduler.executors.asyncio import AsyncIOExecutor
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

logger = logging.getLogger(__name__)

_scheduler: AsyncIOScheduler | None = None


def get_scheduler() -> AsyncIOScheduler:
    if _scheduler is None:
        raise RuntimeError("Scheduler not initialized — call init_scheduler() first")
    return _scheduler


def init_scheduler(database_url: str) -> AsyncIOScheduler:
    """
    Initialise APScheduler avec PostgreSQL comme job store persistant.
    Les jobs survivent aux redémarrages du process.
    """
    global _scheduler

    # SQLAlchemy attend postgresql:// pas postgresql+psycopg2:// pour APScheduler
    aps_url = database_url.replace("postgresql+psycopg2://", "postgresql://")

    jobstores = {
        "default": SQLAlchemyJobStore(url=aps_url, tablename="apscheduler_jobs")
    }
    executors = {
        "default": AsyncIOExecutor()
    }
    job_defaults = {
        "coalesce": True,       # si plusieurs exécutions sont en retard, n'en exécute qu'une
        "max_instances": 1,     # jamais deux instances du même job en parallèle
        "misfire_grace_time": 300,  # tolérance 5 min de retard avant d'annuler
    }

    _scheduler = AsyncIOScheduler(
        jobstores=jobstores,
        executors=executors,
        job_defaults=job_defaults,
    )

    return _scheduler


async def start_scheduler(database_url: str) -> AsyncIOScheduler:
    """Initialise, enregistre tous les jobs et démarre le scheduler."""
    scheduler = init_scheduler(database_url)
    _register_jobs(scheduler)
    scheduler.start()
    logger.info("Scheduler APScheduler démarré — jobs persistants en PostgreSQL")
    _log_jobs(scheduler)
    return scheduler


def stop_scheduler() -> None:
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("Scheduler arrêté")


def _register_jobs(scheduler: AsyncIOScheduler) -> None:
    """Enregistre tous les jobs planifiés. replace_existing=True pour l'idempotence."""

    # ----------------------------------------------------------------
    # 1. Collecte nocturne — toutes les sources actives
    # ----------------------------------------------------------------
    scheduler.add_job(
        _job_collect_all_sources,
        trigger=CronTrigger(hour=23, minute=0),
        id="collect_all_sources_nightly",
        name="Collecte nocturne — toutes sources",
        replace_existing=True,
    )

    # ----------------------------------------------------------------
    # 2. Classification des items pending — toutes les 15 min
    # ----------------------------------------------------------------
    scheduler.add_job(
        _job_classify_pending,
        trigger=IntervalTrigger(minutes=15),
        id="classify_pending",
        name="Classification items pending",
        replace_existing=True,
    )

    # ----------------------------------------------------------------
    # 3. Ingest automatique high/critical — toutes les 30 min
    # ----------------------------------------------------------------
    scheduler.add_job(
        _job_ingest_high_priority,
        trigger=IntervalTrigger(minutes=30),
        id="ingest_high_priority",
        name="Digest + RAG index items high/critical",
        replace_existing=True,
    )

    # ----------------------------------------------------------------
    # 4. Briefing quotidien — heure configurable (défaut 7h00)
    # ----------------------------------------------------------------
    briefing_hour = int(os.getenv("BRIEFING_HOUR", "7"))
    scheduler.add_job(
        _job_daily_briefing,
        trigger=CronTrigger(hour=briefing_hour, minute=0),
        id="daily_briefing",
        name=f"Briefing quotidien ({briefing_hour:02d}h00)",
        replace_existing=True,
    )

    # ----------------------------------------------------------------
    # 5. Scoring des sources — quotidien à minuit
    # ----------------------------------------------------------------
    scheduler.add_job(
        _job_score_sources,
        trigger=CronTrigger(hour=0, minute=30),
        id="score_sources",
        name="Scoring pertinence sources",
        replace_existing=True,
    )

    # ----------------------------------------------------------------
    # 6. Decay sources peu performantes — hebdomadaire (lundi 1h00)
    # ----------------------------------------------------------------
    scheduler.add_job(
        _job_decay_sources,
        trigger=CronTrigger(day_of_week="mon", hour=1, minute=0),
        id="decay_sources",
        name="Decay sources faible performance",
        replace_existing=True,
    )

    # ----------------------------------------------------------------
    # 7. Hygiène RAG — nettoyage + alertes HITL (nuit à 2h00)
    # ----------------------------------------------------------------
    scheduler.add_job(
        _job_rag_hygiene,
        trigger=CronTrigger(hour=2, minute=0),
        id="rag_hygiene",
        name="Hygiène RAG — nettoyage + alertes",
        replace_existing=True,
    )

    # ----------------------------------------------------------------
    # 8. Audit KG→RAG — hebdomadaire (dimanche 3h30)
    # ----------------------------------------------------------------
    scheduler.add_job(
        _job_kg_rag_nightly,
        trigger=CronTrigger(day_of_week="sun", hour=3, minute=30),
        id="kg_rag_nightly_audit",
        name="Audit KG→RAG hebdomadaire",
        replace_existing=True,
    )


def _log_jobs(scheduler: AsyncIOScheduler) -> None:
    for job in scheduler.get_jobs():
        next_run = job.next_run_time
        logger.info(f"  [{job.id}] {job.name} — prochain : {next_run}")


# ============================================================
# JOBS
# ============================================================

async def _job_collect_all_sources() -> None:
    """Collecte toutes les sources actives et déclenche la classification en chaîne."""
    logger.info("[SCHEDULER] Collecte nocturne démarrée")
    try:
        from argos.services.collector import CollectorService
        from argos.api.router import db

        collector = CollectorService(db_manager=db)
        stats = collector.fetch_from_db_sources()
        inserted = stats.get("inserted", 0)
        logger.info(f"[SCHEDULER] Collecte terminée — {inserted} nouveaux items")

        # Déclenche immédiatement la classification si de nouveaux items
        if inserted > 0:
            await _job_classify_pending()

    except Exception as e:
        logger.error(f"[SCHEDULER] Erreur collecte nocturne : {e}", exc_info=True)


async def _job_classify_pending() -> None:
    """Classifie les items pending + ingère les high/critical en chaîne."""
    logger.info("[SCHEDULER] Pipeline batch classify+ingest démarré")
    try:
        from argos.services.pipeline import run_pipeline_batch
        result = await run_pipeline_batch(limit=20)
        logger.info(f"[SCHEDULER] Pipeline batch terminé — {result}")
    except Exception as e:
        logger.error(f"[SCHEDULER] Erreur pipeline batch : {e}", exc_info=True)


async def _job_ingest_high_priority() -> None:
    """Alias maintenu pour compatibilité — délègue à run_pipeline_batch."""
    await _job_classify_pending()


async def _job_daily_briefing() -> None:
    """Génère le briefing quotidien. Remplace la boucle while True de server.py."""
    import datetime
    today = datetime.date.today()
    logger.info(f"[SCHEDULER] Génération briefing quotidien {today}")
    try:
        import json
        from argos.api.router import db, _generate_briefing_content

        result = await _generate_briefing_content(hours=24)
        if "error" in result:
            logger.warning(f"[SCHEDULER] Briefing annulé : {result.get('message')}")
            return

        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO daily_briefings
                    (briefing_date, executive_summary, top_items, trends, stats, tokens_used, cost_usd)
                    VALUES (%s, %s, %s::jsonb, %s::jsonb, %s::jsonb, %s, %s)
                    ON CONFLICT (briefing_date) DO NOTHING
                """, (
                    today,
                    result["markdown"],
                    json.dumps(result["top_items"]),
                    json.dumps(result["trends"]),
                    json.dumps(result["stats"]),
                    result["tokens_used"],
                    result["cost_usd"],
                ))
                conn.commit()

        logger.info(f"[SCHEDULER] Briefing {today} généré — {result['tokens_used']} tokens")

    except Exception as e:
        logger.error(f"[SCHEDULER] Erreur briefing quotidien : {e}", exc_info=True)


async def _job_score_sources() -> None:
    """Recalcule le score de pertinence de chaque source active."""
    logger.info("[SCHEDULER] Scoring sources démarré")
    try:
        # Import différé — scorer sera créé à l'étape 2
        from argos.services.scorer import score_all_sources
        await score_all_sources()
        logger.info("[SCHEDULER] Scoring sources terminé")
    except ImportError:
        logger.debug("[SCHEDULER] scorer.py pas encore disponible — job ignoré")
    except Exception as e:
        logger.error(f"[SCHEDULER] Erreur scoring sources : {e}", exc_info=True)


async def _job_decay_sources() -> None:
    """Baisse la priorité des sources peu performantes depuis 14 jours."""
    logger.info("[SCHEDULER] Decay sources démarré")
    try:
        from argos.services.scorer import decay_low_performing_sources
        await decay_low_performing_sources()
        logger.info("[SCHEDULER] Decay sources terminé")
    except ImportError:
        logger.debug("[SCHEDULER] scorer.py pas encore disponible — job ignoré")
    except Exception as e:
        logger.error(f"[SCHEDULER] Erreur decay sources : {e}", exc_info=True)


async def _job_rag_hygiene() -> None:
    """Nettoyage automatique du RAG + génération d'alertes HITL."""
    logger.info("[SCHEDULER] Hygiène RAG démarrée")
    try:
        from argos.services.rag_hygiene import run_rag_hygiene
        stats = await run_rag_hygiene()
        logger.info(f"[SCHEDULER] Hygiène RAG terminée — {stats}")
    except Exception as e:
        logger.error(f"[SCHEDULER] Erreur hygiène RAG : {e}", exc_info=True)


async def _job_kg_rag_nightly() -> None:
    """Audit hebdomadaire KG→RAG : dédup nœuds, réaffectation items, enrichissement whitelists."""
    logger.info("[SCHEDULER] Audit KG→RAG démarré")
    try:
        from argos.services.kg_rag_audit import run_kg_rag_audit
        from argos.services.vector_store_singleton import get_vector_store
        from argos.services.rag import RAGService
        from argos.api.router import db
        from argos.services.llm_provider import create_llm_provider
        from argos.config import settings

        llm = create_llm_provider(
            provider_type=settings.llm_provider,
            openai_api_key=settings.openai_api_key,
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
            aws_region=settings.aws_region,
            model="us.anthropic.claude-haiku-4-5-20251001",
        )
        vs = get_vector_store()
        rag_service = RAGService(
            llm_provider=llm,
            vector_store=vs,
            db_manager=db,
        )
        stats = await run_kg_rag_audit(db=db, llm=llm, vs=vs, rag_service=rag_service)
        logger.info(f"[SCHEDULER] Audit KG→RAG terminé — {stats}")
    except Exception as e:
        logger.error(f"[SCHEDULER] Erreur audit KG→RAG : {e}", exc_info=True)
