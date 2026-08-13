"""
EmailNotifier — notifications par email SMTP (fire-and-forget).
"""
import asyncio
import logging
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional

from argos.config import settings

logger = logging.getLogger(__name__)


class EmailNotifier:
    def __init__(
        self,
        smtp_host: Optional[str],
        smtp_port: int,
        smtp_user: Optional[str],
        smtp_password: Optional[str],
    ):
        self._host = smtp_host
        self._port = smtp_port
        self._user = smtp_user
        self._password = smtp_password

    def _configured(self) -> bool:
        return bool(self._host and self._user and self._password)

    def _send(self, to_email: str, subject: str, body: str) -> None:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = self._user
        msg["To"] = to_email
        msg.attach(MIMEText(body, "plain", "utf-8"))
        with smtplib.SMTP(self._host, self._port) as smtp:
            smtp.starttls()
            smtp.login(self._user, self._password)
            smtp.sendmail(self._user, to_email, msg.as_string())

    async def _send_async(self, to_email: str, subject: str, body: str) -> None:
        if not self._configured():
            return
        try:
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, self._send, to_email, subject, body)
        except Exception as e:
            logger.warning(f"Email notification failed ({to_email}): {e}")

    async def notify_member_invited(
        self,
        to_email: str,
        project_name: str,
        inviter_name: str,
        role: str,
    ) -> None:
        subject = f"[Argos] Invitation au projet « {project_name} »"
        body = (
            f"Bonjour,\n\n"
            f"{inviter_name} vous a invité(e) à rejoindre le projet « {project_name} » "
            f"avec le rôle : {role}.\n\n"
            f"Connectez-vous à Argos pour accéder à l'espace projet.\n\n"
            f"--\nArgos Intelligence Platform"
        )
        await self._send_async(to_email, subject, body)

    async def notify_proposal_reviewed(
        self,
        to_email: str,
        project_name: str,
        source_url: str,
        decision: str,
        note: Optional[str],
    ) -> None:
        decision_fr = "approuvée" if decision == "approved" else "refusée"
        subject = f"[Argos] Proposition {decision_fr} — {project_name}"
        body = (
            f"Bonjour,\n\n"
            f"Votre proposition de source pour le projet « {project_name} » a été {decision_fr}.\n"
            f"Source : {source_url}\n"
        )
        if note:
            body += f"Note : {note}\n"
        body += "\n--\nArgos Intelligence Platform"
        await self._send_async(to_email, subject, body)

    async def notify_calibration_done(
        self,
        to_email: str,
        project_name: str,
        subjects: list,
        n_sources: int,
    ) -> None:
        subject = f"[Argos] Calibration terminée — {project_name}"
        subjects_list = "\n".join(f"  • {s}" for s in subjects)
        body = (
            f"Bonjour,\n\n"
            f"La calibration du projet « {project_name} » est terminée.\n\n"
            f"Sujets générés :\n{subjects_list}\n\n"
            f"Sources candidates : {n_sources}\n\n"
            f"--\nArgos Intelligence Platform"
        )
        await self._send_async(to_email, subject, body)


# ── Proxy module-level (inject depuis settings) ───────────────────────────────

def _notifier() -> EmailNotifier:
    return EmailNotifier(
        smtp_host=settings.smtp_host,
        smtp_port=settings.smtp_port,
        smtp_user=settings.smtp_user,
        smtp_password=settings.smtp_password,
    )


async def notify_member_invited_email(
    to_email: Optional[str],
    project_name: str,
    inviter_name: str,
    role: str,
) -> None:
    if not to_email:
        return
    await _notifier().notify_member_invited(
        to_email=to_email,
        project_name=project_name,
        inviter_name=inviter_name,
        role=role,
    )


async def notify_proposal_reviewed_email(
    to_email: Optional[str],
    project_name: str,
    source_url: str,
    decision: str,
    note: Optional[str],
) -> None:
    if not to_email:
        return
    await _notifier().notify_proposal_reviewed(
        to_email=to_email,
        project_name=project_name,
        source_url=source_url,
        decision=decision,
        note=note,
    )


async def notify_calibration_done_email(
    to_email: Optional[str],
    project_name: str,
    subjects: list,
    n_sources: int,
) -> None:
    if not to_email:
        return
    await _notifier().notify_calibration_done(
        to_email=to_email,
        project_name=project_name,
        subjects=subjects,
        n_sources=n_sources,
    )
