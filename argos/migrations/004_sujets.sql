-- Migration 004: Sujets (subjects within workspaces/dossiers)
-- Date: 2026-07-30

-- ============================================================
-- 1. TABLE SUJETS
-- ============================================================
-- A sujet belongs to a workspace (dossier) and carries a
-- knowledge_profile (validated domains + trusted queries).

CREATE TABLE IF NOT EXISTS sujets (
    id SERIAL PRIMARY KEY,
    workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    slug VARCHAR(150) NOT NULL,
    description TEXT,
    icon VARCHAR(50) DEFAULT 'tag',
    color VARCHAR(7) DEFAULT '#9085e9',
    -- Profil de connaissance validé par l'humain
    knowledge_profile JSONB DEFAULT '{
        "official_domains": [],
        "recognized_domains": [],
        "trusted_queries": [],
        "keywords": []
    }'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_sujets_workspace_slug ON sujets(workspace_id, slug);
CREATE INDEX idx_sujets_workspace ON sujets(workspace_id);
CREATE INDEX idx_sujets_active ON sujets(is_active);

-- ============================================================
-- 2. FK sujet_id ON sources
-- ============================================================

ALTER TABLE sources
    ADD COLUMN IF NOT EXISTS sujet_id INTEGER REFERENCES sujets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sources_sujet ON sources(sujet_id);

-- ============================================================
-- 3. FK sujet_id ON items
-- ============================================================

ALTER TABLE items
    ADD COLUMN IF NOT EXISTS sujet_id INTEGER REFERENCES sujets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_items_sujet ON items(sujet_id);

-- ============================================================
-- 4. DEFAULT WORKSPACE — ensure id=1 exists
-- ============================================================

INSERT INTO workspaces (id, name, slug, description, domain, icon, color)
VALUES (1, 'Général', 'general', 'Espace de veille par défaut', 'general', 'folder', '#3987e5')
ON CONFLICT (id) DO NOTHING;
