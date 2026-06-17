-- ============================================
-- Argos - Database Migration
-- Version: 1.2.0 -> 1.3.0
-- Description: Course Generator - Add decision types for courses
-- ============================================

-- ============================================
-- Update decisions constraint for course operations
-- ============================================

-- Drop existing constraint
ALTER TABLE decisions DROP CONSTRAINT IF EXISTS decisions_decision_type_check;

-- Add new constraint with course operations
ALTER TABLE decisions ADD CONSTRAINT decisions_decision_type_check 
    CHECK (decision_type IN (
        'item_validation', 
        'classification_override', 
        'classification',
        'course_generation',
        'course_qa'
    ));

-- Add comments
COMMENT ON CONSTRAINT decisions_decision_type_check ON decisions IS 
    'Valid decision types: item_validation, classification_override, classification, course_generation, course_qa';

-- ============================================
-- Verify courses table structure
-- ============================================

-- Ensure all required indexes exist
CREATE INDEX IF NOT EXISTS idx_courses_item_id ON courses(item_id);
CREATE INDEX IF NOT EXISTS idx_courses_subject ON courses(subject);
CREATE INDEX IF NOT EXISTS idx_courses_level ON courses(level);
CREATE INDEX IF NOT EXISTS idx_courses_status ON courses(status);
CREATE INDEX IF NOT EXISTS idx_courses_qa_score ON courses(qa_score DESC);
CREATE INDEX IF NOT EXISTS idx_courses_created_at ON courses(created_at DESC);

-- ============================================
-- Log migration
-- ============================================

INSERT INTO system_logs (level, component, event_type, message, context)
VALUES (
    'INFO',
    'database',
    'migration_applied',
    'Migration v1.3.0 applied successfully - Course Generator support',
    jsonb_build_object(
        'version', '1.3.0',
        'features', ARRAY['course_generation', 'course_qa'],
        'timestamp', CURRENT_TIMESTAMP
    )
);

-- ============================================
-- END OF MIGRATION
-- ============================================
