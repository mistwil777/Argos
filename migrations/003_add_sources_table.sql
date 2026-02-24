-- Add sources table for managing RSS, GitHub, API data sources
CREATE TABLE IF NOT EXISTS sources (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    url TEXT NOT NULL UNIQUE,
    type VARCHAR(20) NOT NULL CHECK (type IN ('rss', 'github', 'api')),
    category VARCHAR(100) NOT NULL,
    description TEXT,
    tags TEXT[], -- Array of tags
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index on type and category for faster filtering
CREATE INDEX IF NOT EXISTS idx_sources_type ON sources(type);
CREATE INDEX IF NOT EXISTS idx_sources_category ON sources(category);
CREATE INDEX IF NOT EXISTS idx_sources_active ON sources(active);

-- Create index on tags array using GIN
CREATE INDEX IF NOT EXISTS idx_sources_tags ON sources USING GIN(tags);
