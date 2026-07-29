-- Migration v3 : préférences sources utilisateur (vocal assistant)

CREATE TABLE IF NOT EXISTS user_source_preferences (
    id          SERIAL PRIMARY KEY,
    user_id     VARCHAR(100) NOT NULL DEFAULT 'default',
    rule_type   VARCHAR(50)  NOT NULL,   -- 'reject_domain', 'reject_type', 'prefer_type', 'prefer_domain'
    value       VARCHAR(255) NOT NULL,   -- ex: 'medium.com', 'rss', 'arxiv'
    reason      TEXT,                    -- explication libre du user
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_prefs_user ON user_source_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_user_prefs_rule ON user_source_preferences(rule_type, value);

-- Historique des sessions vocales (wake word + demande + flow choisi)
CREATE TABLE IF NOT EXISTS vocal_sessions (
    id            SERIAL PRIMARY KEY,
    user_id       VARCHAR(100) DEFAULT 'default',
    transcript    TEXT NOT NULL,
    flow          VARCHAR(20),   -- 'rag_direct' | 'discovery'
    intent_data   JSONB,
    sources_found INTEGER DEFAULT 0,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);
