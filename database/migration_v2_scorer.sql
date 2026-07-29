-- ============================================
-- Migration v2 — Scorer
-- Ajout : colonne priority sur sources,
--          table source_scores,
--          table interactions (signaux comportementaux)
-- ============================================

-- Priorité de collecte sur les sources (high/normal/low)
ALTER TABLE sources
    ADD COLUMN IF NOT EXISTS priority VARCHAR(10) DEFAULT 'normal'
        CHECK (priority IN ('high', 'normal', 'low'));

-- Score de pertinence calculé par source_id
CREATE TABLE IF NOT EXISTS source_scores (
    id              SERIAL PRIMARY KEY,
    source_id       INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    score           NUMERIC(4,3) NOT NULL DEFAULT 0.500
                        CHECK (score BETWEEN 0 AND 1),
    ratio_high      NUMERIC(4,3) DEFAULT 0,   -- ratio items high+critical / total
    avg_density     NUMERIC(4,3) DEFAULT 0,   -- densité informationnelle moyenne
    total_items     INTEGER DEFAULT 0,
    high_items      INTEGER DEFAULT 0,
    computed_at     TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (source_id)
);

CREATE INDEX IF NOT EXISTS idx_source_scores_score ON source_scores(score DESC);
CREATE INDEX IF NOT EXISTS idx_source_scores_source ON source_scores(source_id);

-- Score de pertinence par item (calculé au moment de l'ingest)
ALTER TABLE items
    ADD COLUMN IF NOT EXISTS relevance_score NUMERIC(4,3) DEFAULT NULL;

-- Signaux comportementaux implicites
CREATE TABLE IF NOT EXISTS interactions (
    id          SERIAL PRIMARY KEY,
    item_id     INTEGER REFERENCES items(id) ON DELETE CASCADE,
    event_type  VARCHAR(20) NOT NULL CHECK (event_type IN ('click', 'read', 'save', 'skip')),
    duration_sec INTEGER DEFAULT 0,
    user_id     VARCHAR(100) DEFAULT 'anonymous',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_interactions_item ON interactions(item_id);
CREATE INDEX IF NOT EXISTS idx_interactions_user ON interactions(user_id);
CREATE INDEX IF NOT EXISTS idx_interactions_event ON interactions(event_type);
