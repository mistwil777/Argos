-- ============================================
-- AcademiaOps - Database Migration
-- Version: 1.0.0 -> 1.1.0
-- Description: Update schema for classifier agent
-- ============================================

-- ============================================
-- Step 1: Rename and update items table columns
-- ============================================

-- Rename content to summary (shorter)
ALTER TABLE items RENAME COLUMN content TO summary;

-- Add new classification fields
ALTER TABLE items ADD COLUMN IF NOT EXISTS importance VARCHAR(20) 
    CHECK (importance IN ('critical', 'high', 'medium', 'low'));

ALTER TABLE items ADD COLUMN IF NOT EXISTS item_type VARCHAR(20) 
    CHECK (item_type IN ('innovation', 'tutorial', 'research', 'news', 'opinion'));

ALTER TABLE items ADD COLUMN IF NOT EXISTS classification_status VARCHAR(20) 
    DEFAULT 'pending'
    CHECK (classification_status IN ('pending', 'classified', 'rejected'));

-- Migrate data from old columns to new ones (if exists)
-- Map impact_level (High/Medium/Low) to importance (high/medium/low)
UPDATE items 
SET importance = LOWER(impact_level)
WHERE impact_level IS NOT NULL AND importance IS NULL;

-- Map subject to item_type (conservative mapping to 'news')
UPDATE items 
SET item_type = 'news'
WHERE subject IS NOT NULL AND item_type IS NULL;

-- Map validation_status 'pending' to classification_status 'pending'
UPDATE items 
SET classification_status = 'pending'
WHERE validation_status = 'pending' AND classification_status IS NULL;

UPDATE items 
SET classification_status = 'classified'
WHERE validation_status IN ('approved', 'archived') AND classification_status IS NULL;

-- Optional: Keep old columns for backward compatibility or drop them
-- Uncomment the following lines to drop old columns after verifying migration
-- ALTER TABLE items DROP COLUMN IF EXISTS impact_level;
-- ALTER TABLE items DROP COLUMN IF EXISTS subject;

-- Create index for new classification_status
CREATE INDEX IF NOT EXISTS idx_items_classification_status ON items(classification_status);
CREATE INDEX IF NOT EXISTS idx_items_importance ON items(importance);
CREATE INDEX IF NOT EXISTS idx_items_item_type ON items(item_type);

-- ============================================
-- Step 2: Create items_topics junction table
-- (Many-to-many relationship)
-- ============================================

CREATE TABLE IF NOT EXISTS items_topics (
    item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    PRIMARY KEY (item_id, topic_id)
);

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_items_topics_item_id ON items_topics(item_id);
CREATE INDEX IF NOT EXISTS idx_items_topics_topic_id ON items_topics(topic_id);

-- ============================================
-- Step 3: Update topics.item_count trigger
-- ============================================

-- Drop old trigger if exists
DROP TRIGGER IF EXISTS update_topic_item_count ON items_topics;
DROP FUNCTION IF EXISTS update_topic_item_count();

-- Create function to update topic item_count
CREATE OR REPLACE FUNCTION update_topic_item_count()
RETURNS TRIGGER AS $$
BEGIN
    -- Recalculate item_count for affected topic(s)
    IF TG_OP = 'INSERT' THEN
        UPDATE topics 
        SET item_count = (
            SELECT COUNT(*) 
            FROM items_topics 
            WHERE topic_id = NEW.topic_id
        )
        WHERE id = NEW.topic_id;
    END IF;
    
    IF TG_OP = 'DELETE' THEN
        UPDATE topics 
        SET item_count = (
            SELECT COUNT(*) 
            FROM items_topics 
            WHERE topic_id = OLD.topic_id
        )
        WHERE id = OLD.topic_id;
    END IF;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER update_topic_item_count
AFTER INSERT OR DELETE ON items_topics
FOR EACH ROW
EXECUTE FUNCTION update_topic_item_count();

-- ============================================
-- Step 4: Reset item_count for all topics
-- ============================================

UPDATE topics
SET item_count = 0;

-- If you have existing data in a 'subject' column, you can migrate it:
-- Example: Link all items with subject='MCP' to the MCP topic
-- INSERT INTO items_topics (item_id, topic_id)
-- SELECT i.id, t.id
-- FROM items i, topics t
-- WHERE i.subject = t.name
-- ON CONFLICT DO NOTHING;

-- ============================================
-- Step 5: Update seed data classification status
-- ============================================

-- Set existing items from seed data to 'pending' for classification
UPDATE items 
SET classification_status = 'pending'
WHERE classification_status IS NULL;

-- ============================================
-- Migration Complete
-- ============================================

-- Verify migration
DO $$
BEGIN
    RAISE NOTICE 'Migration 1.0.0 -> 1.1.0 complete';
    RAISE NOTICE 'Tables updated: items, items_topics';
    RAISE NOTICE 'New columns: importance, item_type, classification_status';
    RAISE NOTICE 'Triggers updated: update_topic_item_count';
END $$;
