"""
TeamsNotifier — notifications via webhook Teams (Adaptive Cards).
Fire-and-forget : un échec ne bloque jamais l'opération principale.
"""

import logging
try:
    import aiohttp
except ImportError:
    aiohttp = None  # type: ignore

logger = logging.getLogger(__name__)

_TIMEOUT_SECONDS = 5


class TeamsNotifier:

    def __init__(self, webhook_url: str | None):
        self._webhook_url = webhook_url

    async def _post(self, payload: dict) -> None:
        if not self._webhook_url:
            return
        if aiohttp is None:
            logger.warning("TeamsNotifier: aiohttp not installed, skipping notification")
            return
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    self._webhook_url,
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=_TIMEOUT_SECONDS),
                ) as resp:
                    if resp.status not in (200, 201, 202):
                        logger.warning(f"TeamsNotifier: webhook returned HTTP {resp.status}")
        except Exception as e:
            logger.warning(f"TeamsNotifier: notification failed — {e}")

    async def notify_member_invited(
        self,
        project_name: str,
        invited_email: str,
        role: str,
        invited_by: str,
    ) -> None:
        payload = {
            "@type": "MessageCard",
            "@context": "http://schema.org/extensions",
            "summary": f"Invitation au projet {project_name}",
            "themeColor": "3987e5",
            "title": f"Invitation au projet « {project_name} »",
            "sections": [{
                "facts": [
                    {"name": "Destinataire", "value": invited_email},
                    {"name": "Rôle", "value": role},
                    {"name": "Invité par", "value": invited_by},
                ],
                "text": f"Vous avez été invité à rejoindre le projet **{project_name}** en tant que **{role}**.",
            }],
        }
        await self._post(payload)

    async def notify_proposal_reviewed(
        self,
        project_name: str,
        source_url: str,
        decision: str,
        note: str | None,
        reviewed_by: str,
    ) -> None:
        color = "1baf7a" if decision == "approved" else "e66767"
        label = "approuvée" if decision == "approved" else "rejetée"
        facts = [
            {"name": "Source", "value": source_url},
            {"name": "Décision", "value": f"{decision} ({label})"},
            {"name": "Par", "value": reviewed_by},
        ]
        if note:
            facts.append({"name": "Note", "value": note})

        payload = {
            "@type": "MessageCard",
            "@context": "http://schema.org/extensions",
            "summary": f"Proposition de source {label}",
            "themeColor": color,
            "title": f"Proposition de source {label} — {project_name}",
            "sections": [{"facts": facts}],
        }
        await self._post(payload)

    async def notify_calibration_done(
        self,
        project_name: str,
        subjects: list[str],
        n_sources: int,
    ) -> None:
        subjects_text = "\n".join(f"• {s}" for s in subjects)
        payload = {
            "@type": "MessageCard",
            "@context": "http://schema.org/extensions",
            "summary": f"Calibration terminée — {project_name}",
            "themeColor": "9085e9",
            "title": f"Calibration du projet « {project_name} » terminée",
            "sections": [{
                "text": (
                    f"{len(subjects)} sujets créés, {n_sources} sources suggérées.\n\n"
                    f"{subjects_text}"
                ),
            }],
        }
        await self._post(payload)


# ── Fonctions module-level pour injection dans les services ──────────────────

async def notify_member_invited_teams(
    webhook_url: str | None,
    project_name: str,
    invited_email: str,
    role: str,
    invited_by: str,
) -> None:
    if not webhook_url:
        return
    notifier = TeamsNotifier(webhook_url=webhook_url)
    await notifier.notify_member_invited(
        project_name=project_name,
        invited_email=invited_email,
        role=role,
        invited_by=invited_by,
    )


async def notify_proposal_reviewed_teams(
    webhook_url: str | None,
    project_name: str,
    source_url: str,
    decision: str,
    note: str | None,
    reviewed_by: str,
) -> None:
    if not webhook_url:
        return
    notifier = TeamsNotifier(webhook_url=webhook_url)
    await notifier.notify_proposal_reviewed(
        project_name=project_name,
        source_url=source_url,
        decision=decision,
        note=note,
        reviewed_by=reviewed_by,
    )


async def notify_calibration_done_teams(
    webhook_url: str | None,
    project_name: str,
    subjects: list[str],
    n_sources: int,
) -> None:
    if not webhook_url:
        return
    notifier = TeamsNotifier(webhook_url=webhook_url)
    await notifier.notify_calibration_done(
        project_name=project_name,
        subjects=subjects,
        n_sources=n_sources,
    )
