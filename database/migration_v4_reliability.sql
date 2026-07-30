-- Migration v4 — Reliability scorer
-- Ajoute les colonnes de traçabilité du filtre de fiabilité sur les items

ALTER TABLE items
  ADD COLUMN IF NOT EXISTS reliability_passed    BOOLEAN DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS reliability_score     NUMERIC(4,3) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS reliability_reason    TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS reliability_tier      VARCHAR(20) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS reliability_rejected  BOOLEAN DEFAULT FALSE;

-- Index pour filtrer rapidement les items acceptés
CREATE INDEX IF NOT EXISTS idx_items_reliability_passed
  ON items (reliability_passed)
  WHERE reliability_passed = TRUE;

-- Index pour la page de transparence Sources (items rejetés)
CREATE INDEX IF NOT EXISTS idx_items_reliability_rejected
  ON items (reliability_rejected)
  WHERE reliability_rejected = TRUE;

-- Ajoute aussi un score de fiabilité sur la table sources
ALTER TABLE sources
  ADD COLUMN IF NOT EXISTS reliability_score  NUMERIC(4,3) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS reliability_tier   VARCHAR(20) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS reliability_checked_at TIMESTAMPTZ DEFAULT NULL;
