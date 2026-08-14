-- Migration 006 — Paramètres de configuration projet
ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS client_name       VARCHAR(255),
    ADD COLUMN IF NOT EXISTS deadline          DATE,
    ADD COLUMN IF NOT EXISTS brief_hour        SMALLINT NOT NULL DEFAULT 7,
    ADD COLUMN IF NOT EXISTS brief_window_hours SMALLINT NOT NULL DEFAULT 24,
    ADD COLUMN IF NOT EXISTS brief_language    VARCHAR(10) NOT NULL DEFAULT 'fr',
    ADD COLUMN IF NOT EXISTS alert_keywords    TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS brief_recipients  TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS visibility        VARCHAR(20) NOT NULL DEFAULT 'private';

-- Migration 006b — Distinguer brief vide vs brief non généré
ALTER TABLE daily_briefings
    ADD COLUMN IF NOT EXISTS no_new_content BOOLEAN NOT NULL DEFAULT FALSE;
