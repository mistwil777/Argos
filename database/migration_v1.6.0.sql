-- Migration v1.6.0 — Table llm_usage pour le tracking des coûts LLM
-- La table decisions est réservée aux décisions HITL humaines.
-- Cette table centralise tous les appels LLM automatiques (RAG, génération, QA).

CREATE TABLE IF NOT EXISTS llm_usage (
    id              SERIAL PRIMARY KEY,
    operation_type  VARCHAR(50)  NOT NULL,   -- 'course_generation', 'course_qa', 'classification', etc.
    entity_type     VARCHAR(50),             -- 'course', 'item', etc.
    entity_id       INTEGER,                 -- ID de l'entité concernée
    model           VARCHAR(100),
    tokens_used     INTEGER      NOT NULL DEFAULT 0,
    cost_usd        NUMERIC(12,8) NOT NULL DEFAULT 0,
    input_data      JSONB,
    output_data     JSONB,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_llm_usage_created_at     ON llm_usage (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_usage_operation_type ON llm_usage (operation_type);
CREATE INDEX IF NOT EXISTS idx_llm_usage_entity         ON llm_usage (entity_type, entity_id);
