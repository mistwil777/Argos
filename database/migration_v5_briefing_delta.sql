-- Migration v5 — Briefing Delta
-- Ajoute cited_sources et groups à daily_briefings

ALTER TABLE daily_briefings
  ADD COLUMN IF NOT EXISTS cited_sources JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS groups        JSONB DEFAULT '{}'::jsonb;

-- Index pour rechercher dans les sources citées
CREATE INDEX IF NOT EXISTS idx_briefings_cited_sources
  ON daily_briefings USING GIN (cited_sources);
