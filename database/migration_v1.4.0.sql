-- ============================================
-- Argos - Database Migration
-- Version: 1.3.0 -> 1.4.0
-- Description: Add 'website'/'api' source types + workspace isolation enforcement
-- ============================================

-- ============================================
-- Step 1: Add 'website' to sources type constraint
-- ============================================

ALTER TABLE sources DROP CONSTRAINT IF EXISTS sources_type_check;
ALTER TABLE sources ADD CONSTRAINT sources_type_check
    CHECK (type IN ('rss', 'github', 'api', 'website'));

-- ============================================
-- Step 2: Add 'website'/'api' to items source_type constraint
-- ============================================

ALTER TABLE items DROP CONSTRAINT IF EXISTS items_source_type_check;
ALTER TABLE items ADD CONSTRAINT items_source_type_check
    CHECK (source_type IN ('rss', 'github', 'manual', 'website', 'api'));

-- ============================================
-- Step 3: Ensure workspace_id FK is in place on sources
-- (idempotent — already applied in prior phases)
-- ============================================

ALTER TABLE sources DROP CONSTRAINT IF EXISTS sources_workspace_id_fkey;
ALTER TABLE sources
    ADD CONSTRAINT sources_workspace_id_fkey
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;

-- ============================================
-- Migration complete
-- ============================================
