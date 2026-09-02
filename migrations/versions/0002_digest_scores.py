"""digest_scores table

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-01
"""
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS digest_scores (
            id              SERIAL PRIMARY KEY,
            item_id         INTEGER REFERENCES items(id) ON DELETE CASCADE,
            judge_model     VARCHAR(100) NOT NULL,
            score_fidelity      SMALLINT CHECK (score_fidelity BETWEEN 1 AND 5),
            score_completeness  SMALLINT CHECK (score_completeness BETWEEN 1 AND 5),
            score_relevance     SMALLINT CHECK (score_relevance BETWEEN 1 AND 5),
            score_concision     SMALLINT CHECK (score_concision BETWEEN 1 AND 5),
            score_global        NUMERIC(3,2),
            rationale       TEXT,
            workspace_id    INTEGER REFERENCES workspaces(id) ON DELETE SET NULL,
            created_at      TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_digest_scores_item ON digest_scores(item_id);
        CREATE INDEX IF NOT EXISTS idx_digest_scores_workspace ON digest_scores(workspace_id);
        CREATE INDEX IF NOT EXISTS idx_digest_scores_created_at ON digest_scores(created_at);
    """)


def downgrade() -> None:
    op.execute("""
        DROP TABLE IF EXISTS digest_scores;
    """)
