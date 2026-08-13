-- Migration 005 — Suppression teams_webhook_url (remplacé par notifications email SMTP)
ALTER TABLE projects DROP COLUMN IF EXISTS teams_webhook_url;
