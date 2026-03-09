-- Migration v1.5.0
-- Fix: replace (item_id, level) unique constraint with (item_id, level, content_type)
-- so that multiple document types can be generated from the same item.

ALTER TABLE courses DROP CONSTRAINT IF EXISTS courses_item_level_unique;
ALTER TABLE courses ADD CONSTRAINT courses_item_level_contenttype_unique
    UNIQUE (item_id, level, content_type);
