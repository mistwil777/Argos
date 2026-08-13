-- Migration v7 — Espaces Projet

-- ── Projets ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS projects (
    id                  SERIAL PRIMARY KEY,
    name                VARCHAR(255) NOT NULL,
    slug                VARCHAR(255) UNIQUE NOT NULL,
    description         TEXT,
    cdc_content         TEXT,                   -- texte brut du CDC déposé
    cdc_analysis        JSONB,                  -- résultat analyse LLM du CDC
    knowledge_profile   JSONB,                  -- bilan + plan issus du questionnaire
    teams_webhook_url   VARCHAR(500),           -- webhook Teams optionnel
    owner_id            INTEGER REFERENCES users(id) ON DELETE SET NULL,
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_projects_slug  ON projects(slug);

-- ── Membres d'un projet ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS project_members (
    id              SERIAL PRIMARY KEY,
    project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
    invited_email   VARCHAR(255),               -- si l'utilisateur n'a pas encore de compte
    role            VARCHAR(20) DEFAULT 'editor', -- owner | editor | reader
    sujet_access    JSONB,                      -- liste d'ids, NULL = accès à tous les sujets
    status          VARCHAR(20) DEFAULT 'pending', -- pending | active | rejected
    invited_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
    invited_at      TIMESTAMPTZ DEFAULT NOW(),
    joined_at       TIMESTAMPTZ,
    UNIQUE (project_id, user_id),
    UNIQUE (project_id, invited_email)
);

CREATE INDEX IF NOT EXISTS idx_project_members_project ON project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user    ON project_members(user_id);

-- ── Propositions de sources ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS source_proposals (
    id              SERIAL PRIMARY KEY,
    project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    sujet_id        INTEGER REFERENCES workspaces(id) ON DELETE SET NULL,
    url             TEXT NOT NULL,
    source_type     VARCHAR(50) DEFAULT 'website', -- rss | website | github | other
    name            VARCHAR(255),
    description     TEXT,
    proposed_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    status          VARCHAR(20) DEFAULT 'pending', -- pending | approved | rejected
    reviewed_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    review_note     TEXT,
    proposed_at     TIMESTAMPTZ DEFAULT NOW(),
    reviewed_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_source_proposals_project ON source_proposals(project_id);
CREATE INDEX IF NOT EXISTS idx_source_proposals_status  ON source_proposals(status);

-- ── Rattachement des sujets aux projets ───────────────────────────────────────

ALTER TABLE workspaces
    ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_workspaces_project ON workspaces(project_id);
