-- ============================================
-- AcademiaOps - PostgreSQL Schema
-- Database: academiaops
-- Version: 1.0.0
-- ============================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For fuzzy text search

-- ============================================
-- SCHEMA: public
-- ============================================

-- ============================================
-- TABLE: items
-- Stores veille items (articles, repos)
-- ============================================
CREATE TABLE IF NOT EXISTS items (
    id SERIAL PRIMARY KEY,
    
    -- Source identification
    source_type VARCHAR(50) NOT NULL CHECK (source_type IN ('rss', 'github', 'manual')),
    source_url TEXT NOT NULL,
    
    -- Content
    title VARCHAR(500) NOT NULL,
    content TEXT NOT NULL,
    url TEXT NOT NULL UNIQUE,
    
    -- Optional enrichment
    author VARCHAR(255),
    published_at TIMESTAMP WITH TIME ZONE,
    
    -- Classification (set by Agent Classifier)
    subject VARCHAR(100), -- MCP, RAG, Multi-agents, n8n, Embeddings, Fine-tuning, Autre
    impact_level VARCHAR(20) CHECK (impact_level IN ('High', 'Medium', 'Low')),
    keywords TEXT[], -- Array of keywords
    relevance_score INTEGER CHECK (relevance_score BETWEEN 0 AND 10),
    
    -- Validation workflow
    validation_status VARCHAR(50) NOT NULL DEFAULT 'pending' 
        CHECK (validation_status IN ('pending', 'approved', 'rejected', 'archived')),
    validated_by VARCHAR(100), -- Username or system identifier
    validated_at TIMESTAMP WITH TIME ZONE,
    rejection_reason TEXT,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Indexes will be created below
    CONSTRAINT items_url_unique UNIQUE (url)
);

-- Indexes for items
CREATE INDEX idx_items_validation_status ON items(validation_status);
CREATE INDEX idx_items_subject ON items(subject);
CREATE INDEX idx_items_impact_level ON items(impact_level);
CREATE INDEX idx_items_created_at ON items(created_at DESC);
CREATE INDEX idx_items_keywords ON items USING GIN(keywords);
CREATE INDEX idx_items_title_trgm ON items USING GIN(title gin_trgm_ops);

-- ============================================
-- TABLE: topics
-- Classification taxonomy
-- ============================================
CREATE TABLE IF NOT EXISTS topics (
    id SERIAL PRIMARY KEY,
    
    name VARCHAR(100) NOT NULL UNIQUE,
    slug VARCHAR(100) NOT NULL UNIQUE, -- URL-friendly version
    description TEXT,
    
    -- Hierarchy support (for future expansion)
    parent_id INTEGER REFERENCES topics(id) ON DELETE SET NULL,
    
    -- Metadata
    item_count INTEGER DEFAULT 0, -- Denormalized count (updated by trigger)
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert default topics
INSERT INTO topics (name, slug, description) VALUES
    ('MCP', 'mcp', 'Model Context Protocol - Standardized LLM-tool interaction'),
    ('RAG', 'rag', 'Retrieval-Augmented Generation systems'),
    ('Multi-agents', 'multi-agents', 'Multi-agent AI systems and orchestration'),
    ('n8n', 'n8n', 'n8n workflow automation and integration'),
    ('Embeddings', 'embeddings', 'Vector embeddings and semantic search'),
    ('Fine-tuning', 'fine-tuning', 'Model fine-tuning and training'),
    ('Autre', 'autre', 'Other AI-related topics')
ON CONFLICT (slug) DO NOTHING;

-- ============================================
-- TABLE: courses
-- Generated educational courses
-- ============================================
CREATE TABLE IF NOT EXISTS courses (
    id SERIAL PRIMARY KEY,
    
    -- Source item
    item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    
    -- Course metadata
    title VARCHAR(500) NOT NULL,
    subject VARCHAR(100) NOT NULL,
    level VARCHAR(20) NOT NULL CHECK (level IN ('beginner', 'intermediate', 'advanced')),
    
    -- Content (Markdown format)
    content TEXT NOT NULL,
    
    -- Pedagogical metadata (JSON)
    learning_objectives JSONB, -- ["objective1", "objective2", ...]
    prerequisites JSONB, -- ["prereq1", "prereq2", ...]
    estimated_duration_minutes INTEGER, -- Reading time estimate
    
    -- Quality assurance
    qa_score DECIMAL(3,2) CHECK (qa_score BETWEEN 0 AND 10), -- 0.00 to 10.00
    qa_issues JSONB, -- [{"type": "...", "description": "..."}, ...]
    qa_reviewed_at TIMESTAMP WITH TIME ZONE,
    
    -- Publication status
    status VARCHAR(50) NOT NULL DEFAULT 'draft' 
        CHECK (status IN ('draft', 'review', 'published', 'archived')),
    published_at TIMESTAMP WITH TIME ZONE,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Enforce one course per item per level
    CONSTRAINT courses_item_level_unique UNIQUE (item_id, level)
);

-- Indexes for courses
CREATE INDEX idx_courses_item_id ON courses(item_id);
CREATE INDEX idx_courses_subject ON courses(subject);
CREATE INDEX idx_courses_level ON courses(level);
CREATE INDEX idx_courses_status ON courses(status);
CREATE INDEX idx_courses_qa_score ON courses(qa_score DESC);

-- ============================================
-- TABLE: decisions
-- User validation decisions (for Agent learning)
-- ============================================
CREATE TABLE IF NOT EXISTS decisions (
    id SERIAL PRIMARY KEY,
    
    -- Target entity
    decision_type VARCHAR(50) NOT NULL CHECK (decision_type IN ('item_validation', 'classification_override')),
    item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    
    -- Decision content
    decision VARCHAR(50) NOT NULL CHECK (decision IN ('approve', 'reject', 'modify')),
    
    -- Context before decision (for learning)
    original_classification JSONB, -- {"subject": "...", "impact_level": "...", ...}
    modified_classification JSONB, -- If user overrode classification
    
    reason TEXT, -- Why rejected or modified
    
    -- Metadata
    decided_by VARCHAR(100) NOT NULL, -- Username
    decided_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- For future ML training
    feedback_quality INTEGER CHECK (feedback_quality BETWEEN 1 AND 5)
);

-- Indexes for decisions
CREATE INDEX idx_decisions_item_id ON decisions(item_id);
CREATE INDEX idx_decisions_decision_type ON decisions(decision_type);
CREATE INDEX idx_decisions_decided_at ON decisions(decided_at DESC);

-- ============================================
-- TABLE: user_progress
-- Track user learning progress
-- ============================================
CREATE TABLE IF NOT EXISTS user_progress (
    id SERIAL PRIMARY KEY,
    
    -- User identification (simple for MVP)
    user_identifier VARCHAR(100) NOT NULL, -- Email or username
    
    -- Course tracking
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    
    -- Progress
    status VARCHAR(50) NOT NULL DEFAULT 'not_started' 
        CHECK (status IN ('not_started', 'in_progress', 'completed')),
    progress_percent INTEGER DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
    
    -- Timestamps
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- One progress record per user per course
    CONSTRAINT user_progress_unique UNIQUE (user_identifier, course_id)
);

-- Indexes for user_progress
CREATE INDEX idx_user_progress_user ON user_progress(user_identifier);
CREATE INDEX idx_user_progress_course ON user_progress(course_id);
CREATE INDEX idx_user_progress_status ON user_progress(status);

-- ============================================
-- TABLE: rag_queries
-- RAG question/answer log
-- ============================================
CREATE TABLE IF NOT EXISTS rag_queries (
    id SERIAL PRIMARY KEY,
    
    -- User and query
    user_identifier VARCHAR(100) NOT NULL,
    query TEXT NOT NULL,
    
    -- RAG response
    answer TEXT NOT NULL,
    sources JSONB, -- [{"course_id": 1, "chapter": "...", "score": 0.85}, ...]
    confidence_score DECIMAL(3,2) CHECK (confidence_score BETWEEN 0 AND 1),
    
    -- Feedback
    was_helpful BOOLEAN, -- User feedback
    user_feedback TEXT,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for rag_queries
CREATE INDEX idx_rag_queries_user ON rag_queries(user_identifier);
CREATE INDEX idx_rag_queries_created_at ON rag_queries(created_at DESC);
CREATE INDEX idx_rag_queries_query_trgm ON rag_queries USING GIN(query gin_trgm_ops);

-- ============================================
-- TABLE: system_logs
-- Application event log
-- ============================================
CREATE TABLE IF NOT EXISTS system_logs (
    id SERIAL PRIMARY KEY,
    
    -- Log classification
    level VARCHAR(20) NOT NULL CHECK (level IN ('DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL')),
    component VARCHAR(100) NOT NULL, -- 'n8n', 'mcp_server', 'agent_classifier', etc.
    
    -- Event
    event_type VARCHAR(100) NOT NULL, -- 'item_classified', 'course_generated', 'tool_called', etc.
    message TEXT NOT NULL,
    
    -- Optional context
    context JSONB, -- Additional structured data
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for system_logs
CREATE INDEX idx_system_logs_level ON system_logs(level);
CREATE INDEX idx_system_logs_component ON system_logs(component);
CREATE INDEX idx_system_logs_event_type ON system_logs(event_type);
CREATE INDEX idx_system_logs_created_at ON system_logs(created_at DESC);

-- ============================================
-- TRIGGERS
-- ============================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to relevant tables
CREATE TRIGGER update_items_updated_at BEFORE UPDATE ON items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_topics_updated_at BEFORE UPDATE ON topics
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_courses_updated_at BEFORE UPDATE ON courses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_progress_updated_at BEFORE UPDATE ON user_progress
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Update topic item_count when item subject changes
CREATE OR REPLACE FUNCTION update_topic_item_count()
RETURNS TRIGGER AS $$
BEGIN
    -- Decrement old topic count
    IF OLD.subject IS NOT NULL THEN
        UPDATE topics SET item_count = item_count - 1 
        WHERE slug = OLD.subject;
    END IF;
    
    -- Increment new topic count
    IF NEW.subject IS NOT NULL THEN
        UPDATE topics SET item_count = item_count + 1 
        WHERE slug = NEW.subject;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_topic_count_on_item_change 
AFTER INSERT OR UPDATE OF subject ON items
FOR EACH ROW EXECUTE FUNCTION update_topic_item_count();

-- ============================================
-- VIEWS (Utility views for common queries)
-- ============================================

-- View: Pending items for validation
CREATE OR REPLACE VIEW pending_items_view AS
SELECT 
    i.id,
    i.title,
    i.subject,
    i.impact_level,
    i.keywords,
    i.relevance_score,
    i.created_at,
    i.url,
    i.source_type
FROM items i
WHERE i.validation_status = 'pending'
ORDER BY i.created_at DESC;

-- View: Published courses with stats
CREATE OR REPLACE VIEW published_courses_view AS
SELECT 
    c.id,
    c.title,
    c.subject,
    c.level,
    c.qa_score,
    c.estimated_duration_minutes,
    c.published_at,
    i.title as source_item_title,
    i.url as source_item_url,
    COUNT(DISTINCT up.user_identifier) as enrolled_users_count,
    AVG(up.progress_percent) as avg_progress_percent
FROM courses c
JOIN items i ON c.item_id = i.id
LEFT JOIN user_progress up ON c.id = up.course_id
WHERE c.status = 'published'
GROUP BY c.id, i.title, i.url
ORDER BY c.published_at DESC;

-- ============================================
-- GRANTS (Basic permissions)
-- ============================================

-- Grant necessary permissions to academiaops_user
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO academiaops_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO academiaops_user;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO academiaops_user;

-- ============================================
-- INITIAL DATA VERIFICATION
-- ============================================

-- Log schema creation
INSERT INTO system_logs (level, component, event_type, message, context)
VALUES (
    'INFO',
    'database',
    'schema_initialized',
    'Database schema created successfully',
    jsonb_build_object(
        'version', '1.0.0',
        'tables_created', 8,
        'timestamp', CURRENT_TIMESTAMP
    )
);

-- ============================================
-- END OF SCHEMA
-- ============================================
