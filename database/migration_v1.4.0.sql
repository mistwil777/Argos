-- ============================================
-- AcademiaOps - Database Migration
-- Version: 1.3.0 -> 1.4.0
-- Description: Add 'website' source type + workspace isolation enforcement
-- ============================================

-- ============================================
-- Step 1: Add 'website' to sources type constraint
-- ============================================

-- Drop old constraint (only had rss, github, api)
ALTER TABLE sources DROP CONSTRAINT IF EXISTS sources_type_check;

-- Add updated constraint that includes 'website'
ALTER TABLE sources ADD CONSTRAINT sources_type_check
    CHECK (type IN ('rss', 'github', 'api', 'website'));

-- ============================================
-- Step 2: Ensure workspace_id FK is in place
-- (idempotent — already applied in prior phases)
-- ============================================

ALTER TABLE sources DROP CONSTRAINT IF EXISTS sources_workspace_id_fkey;
ALTER TABLE sources
    ADD CONSTRAINT sources_workspace_id_fkey
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;

-- ============================================
-- Migration complete
-- ============================================
