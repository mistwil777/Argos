-- ============================================
-- AcademiaOps - Database Migration
-- Version: 1.1.0 -> 1.2.0
-- Description: Add LLM cost tracking to decisions table
-- ============================================

-- ============================================
-- Add LLM tracking columns to decisions table
-- ============================================

-- Add decision_value column to store structured classification data
ALTER TABLE decisions ADD COLUMN IF NOT EXISTS decision_value JSONB;

-- Add LLM tracking columns
ALTER TABLE decisions ADD COLUMN IF NOT EXISTS model_used VARCHAR(100);
ALTER TABLE decisions ADD COLUMN IF NOT EXISTS tokens_used INTEGER;
ALTER TABLE decisions ADD COLUMN IF NOT EXISTS cost_usd DECIMAL(10,6);

-- Update decision_type constraint to include 'classification'
ALTER TABLE decisions DROP CONSTRAINT IF EXISTS decisions_decision_type_check;
ALTER TABLE decisions ADD CONSTRAINT decisions_decision_type_check 
    CHECK (decision_type IN ('item_validation', 'classification_override', 'classification'));

-- Make decision and decided_by nullable (for automatic classifications)
ALTER TABLE decisions ALTER COLUMN decision DROP NOT NULL;
ALTER TABLE decisions ALTER COLUMN decided_by DROP NOT NULL;

-- Set default values for automatic classifications
ALTER TABLE decisions ALTER COLUMN decision SET DEFAULT 'approve';
ALTER TABLE decisions ALTER COLUMN decided_by SET DEFAULT 'system';

-- Create index for cost tracking queries
CREATE INDEX IF NOT EXISTS idx_decisions_cost ON decisions(cost_usd DESC);
CREATE INDEX IF NOT EXISTS idx_decisions_model_used ON decisions(model_used);

-- Comment to track migration
COMMENT ON COLUMN decisions.decision_value IS 'Structured classification data (JSON)';
COMMENT ON COLUMN decisions.model_used IS 'LLM model name (e.g., us.amazon.nova-pro-v1:0)';
COMMENT ON COLUMN decisions.tokens_used IS 'Total tokens consumed by LLM call';
COMMENT ON COLUMN decisions.cost_usd IS 'Estimated cost in USD';

-- ============================================
-- Migration complete
-- ============================================
