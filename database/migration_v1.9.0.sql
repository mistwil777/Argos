-- Migration v1.9.0 — Table documents (Library feature)

CREATE TABLE IF NOT EXISTS documents (
    id              SERIAL PRIMARY KEY,
    title           TEXT NOT NULL,
    doc_type        TEXT NOT NULL DEFAULT 'note',
    content_markdown TEXT,
    content_json    JSONB DEFAULT '{}',
    source_item_ids INTEGER[],
    source_prompt   TEXT,
    workspace_id    INTEGER REFERENCES workspaces(id) ON DELETE SET NULL,
    rag_indexed     BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_workspace ON documents(workspace_id);
CREATE INDEX IF NOT EXISTS idx_documents_doc_type  ON documents(doc_type);
CREATE INDEX IF NOT EXISTS idx_documents_created   ON documents(created_at DESC);
