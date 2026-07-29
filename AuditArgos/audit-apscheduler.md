# Audit — APScheduler v3

## Licence
MIT. Compatible commercial et SaaS.

## Activité
- Dernière release stable : **3.11.3** (28 juin 2026) — maintenu activement
- v4 : alpha depuis 2022, non stable, **ne pas utiliser en production**
- 7 600 stars, mainteneur actif (Alex Grönholm)

## ⚠️ CVE critiques — non patchées

| ID | Sévérité | Vecteur |
|---|---|---|
| GHSA-9cfw-f3f9-7mm7 | **9.8 critique** | RCE via désérialisation (`unmarshal_object`) |
| PYSEC-2026-282 | **9.8 critique** | Même vecteur |

**Atténuation** : job store PostgreSQL à accès restreint, jamais exposé à une entrée externe non validée. Risque pratique faible dans notre contexte mais à surveiller.

## Compatibilité FastAPI + PostgreSQL

```python
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore

scheduler = AsyncIOScheduler(
    jobstores={"default": SQLAlchemyJobStore(url="postgresql+psycopg2://...")}
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler.start()
    yield
    scheduler.shutdown()
```

- AsyncIOScheduler natif asyncio — s'intègre via lifespan FastAPI
- Job store SQLAlchemy synchrone (thread pool) — acceptable pour MVP
- Pool de connexions configurable (`pool_size`)

## Overhead
- ~10 MB RAM supplémentaire
- < 1% CPU pour 10 jobs récurrents (fréquence >= 1 min)

## Alternatives écartées

| Outil | Pourquoi écarté |
|---|---|
| Celery Beat | +2 services infra (Redis + worker), over-engineered pour MVP |
| ARQ | Redis obligatoire, pas de scheduling cron |
| Rocketry | Communauté réduite, moins mature |
| pg_cron | Hors application, pas de logique Python |

## Migration v3 → v4 : breaking total
`add_job()` → `add_schedule()`, job stores → data stores, API entièrement différente. Prévoir réécriture complète le moment venu. Pas de chemin automatique.

## Verdict
**Intégrer APScheduler v3.** Zéro infra supplémentaire, PostgreSQL existant, API simple. CVE à risque faible dans notre contexte (job store interne). Surveiller le patch.
