-- Migration v1.8.0 — Site Monitor: surveillance de contenu web
-- Ajoute le support de la surveillance de sites web pour détecter
-- les nouvelles publications et enrichir automatiquement le RAG.
--
-- Contexte :
--   La table 'sources' gère déjà les flux RSS/GitHub/API.
--   On étend cette table pour supporter le type 'website' avec
--   un mécanisme de diff basé sur hash de contenu.
--
-- Changements :
--   1. Fix contrainte type pour inclure 'website'
--   2. Ajout colonnes surveillance : content_hash, last_checked_at,
--      check_interval_minutes, monitor_enabled
--   3. Ajout workspace_id si absent

-- 1. Mettre à jour la contrainte de type (recréation idempotente)
ALTER TABLE sources DROP CONSTRAINT IF EXISTS sources_type_check;
ALTER TABLE sources
    ADD CONSTRAINT sources_type_check
    CHECK (type IN ('rss', 'github', 'api', 'website'));

-- 2. Ajouter la colonne workspace_id si elle n'existe pas déjà
ALTER TABLE sources
    ADD COLUMN IF NOT EXISTS workspace_id INTEGER REFERENCES workspaces(id) ON DELETE SET NULL;

-- 3. Colonnes de surveillance
ALTER TABLE sources
    ADD COLUMN IF NOT EXISTS content_hash VARCHAR(64);          -- SHA-256 du contenu scrappé

ALTER TABLE sources
    ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ;       -- Dernière vérification

ALTER TABLE sources
    ADD COLUMN IF NOT EXISTS check_interval_minutes INTEGER
        NOT NULL DEFAULT 60
        CHECK (check_interval_minutes >= 5);                    -- Minimum 5 min pour éviter abus

ALTER TABLE sources
    ADD COLUMN IF NOT EXISTS monitor_enabled BOOLEAN
        NOT NULL DEFAULT FALSE;                                  -- Off par défaut

-- 4. Index pour récupérer efficacement les sources à vérifier
CREATE INDEX IF NOT EXISTS idx_sources_monitor
    ON sources (monitor_enabled, last_checked_at)
    WHERE monitor_enabled = TRUE;
