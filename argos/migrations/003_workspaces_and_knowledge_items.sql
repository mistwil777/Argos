-- Migration 003: Workspaces and Knowledge Items
-- Description: Transform learning platform into generic knowledge management system
-- Date: 2026-02-27

-- ============================================================
-- 1. CREATE WORKSPACES TABLE
-- ============================================================
-- Workspaces allow multi-domain knowledge organization

CREATE TABLE IF NOT EXISTS workspaces (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    domain VARCHAR(50), -- e.g., 'legal', 'tech', 'finance', 'research'
    icon VARCHAR(50) DEFAULT 'folder', -- lucide icon name
    color VARCHAR(7) DEFAULT '#3B82F6', -- hex color for UI
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add index for fast lookups
CREATE INDEX idx_workspaces_slug ON workspaces(slug);
CREATE INDEX idx_workspaces_active ON workspaces(is_active);

-- ============================================================
-- 2. CREATE WORKSPACE PERMISSIONS TABLE
-- ============================================================
-- Control access to workspaces (future: user auth, API keys)

CREATE TABLE IF NOT EXISTS workspace_permissions (
    id SERIAL PRIMARY KEY,
    workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_identifier VARCHAR(255), -- email, user_id, or 'public'
    role VARCHAR(20) DEFAULT 'viewer', -- 'owner', 'editor', 'viewer'
    can_read BOOLEAN DEFAULT true,
    can_write BOOLEAN DEFAULT false,
    can_delete BOOLEAN DEFAULT false,
    can_generate BOOLEAN DEFAULT false, -- permission to generate content
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(workspace_id, user_identifier)
);

CREATE INDEX idx_workspace_permissions_workspace ON workspace_permissions(workspace_id);
CREATE INDEX idx_workspace_permissions_user ON workspace_permissions(user_identifier);

-- ============================================================
-- 3. CREATE DEFAULT WORKSPACE
-- ============================================================
-- Migrate existing data to a default workspace

INSERT INTO workspaces (id, name, slug, description, domain, icon, color)
VALUES (
    1,
    'Général',
    'general',
    'Espace de veille par défaut',
    'general',
    'database',
    '#3B82F6'
) ON CONFLICT (id) DO NOTHING;

-- Reset sequence to start after 1
SELECT setval('workspaces_id_seq', (SELECT MAX(id) FROM workspaces));

-- Add public permission to default workspace
INSERT INTO workspace_permissions (workspace_id, user_identifier, role, can_read, can_write, can_delete, can_generate)
VALUES (1, 'public', 'owner', true, true, true, true)
ON CONFLICT (workspace_id, user_identifier) DO NOTHING;

-- ============================================================
-- 4. ADD WORKSPACE_ID TO EXISTING TABLES
-- ============================================================

-- Add workspace to sources
ALTER TABLE sources ADD COLUMN IF NOT EXISTS workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE;
UPDATE sources SET workspace_id = 1 WHERE workspace_id IS NULL;
ALTER TABLE sources ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE sources ALTER COLUMN workspace_id SET DEFAULT 1;
CREATE INDEX idx_sources_workspace ON sources(workspace_id);

-- Add workspace to items
ALTER TABLE items ADD COLUMN IF NOT EXISTS workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE;
UPDATE items SET workspace_id = 1 WHERE workspace_id IS NULL;
ALTER TABLE items ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE items ALTER COLUMN workspace_id SET DEFAULT 1;
CREATE INDEX idx_items_workspace ON items(workspace_id);

-- Add workspace to courses (will become knowledge_items)
ALTER TABLE courses ADD COLUMN IF NOT EXISTS workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE;
UPDATE courses SET workspace_id = 1 WHERE workspace_id IS NULL;
ALTER TABLE courses ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE courses ALTER COLUMN workspace_id SET DEFAULT 1;
CREATE INDEX idx_courses_workspace ON courses(workspace_id);

-- ============================================================
-- 5. TRANSFORM COURSES INTO KNOWLEDGE_ITEMS
-- ============================================================

-- Add content_type and template columns
ALTER TABLE courses ADD COLUMN IF NOT EXISTS content_type VARCHAR(50) DEFAULT 'course';
ALTER TABLE courses ADD COLUMN IF NOT EXISTS template VARCHAR(100) DEFAULT 'learning_module';
ALTER TABLE courses ADD COLUMN IF NOT EXISTS output_format VARCHAR(20) DEFAULT 'markdown'; -- 'markdown', 'html', 'pdf', 'json'
ALTER TABLE courses ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'; -- flexible metadata storage

-- Update existing courses to have proper content_type
UPDATE courses SET content_type = 'course' WHERE content_type IS NULL OR content_type = '';

-- Add indexes for new columns
CREATE INDEX idx_courses_content_type ON courses(content_type);
CREATE INDEX idx_courses_template ON courses(template);
CREATE INDEX idx_courses_metadata ON courses USING gin(metadata);

-- Add workspace to rag_queries
ALTER TABLE rag_queries ADD COLUMN IF NOT EXISTS workspace_id INTEGER REFERENCES workspaces(id) ON DELETE SET NULL;
UPDATE rag_queries SET workspace_id = 1 WHERE workspace_id IS NULL;
CREATE INDEX idx_rag_queries_workspace ON rag_queries(workspace_id);

-- ============================================================
-- 6. CREATE CONTENT TEMPLATES TABLE
-- ============================================================
-- Define available templates for content generation

CREATE TABLE IF NOT EXISTS content_templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    display_name VARCHAR(150) NOT NULL,
    description TEXT,
    content_type VARCHAR(50) NOT NULL, -- 'course', 'guide', 'review', 'synthesis', 'comparison', 'checklist'
    prompt_template TEXT NOT NULL, -- LLM prompt with placeholders
    system_prompt TEXT,
    default_duration_minutes INTEGER DEFAULT 60,
    expected_sections JSONB, -- e.g., ["Introduction", "Analysis", "Conclusion"]
    output_format VARCHAR(20) DEFAULT 'markdown',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert default templates
INSERT INTO content_templates (name, display_name, description, content_type, prompt_template, system_prompt, default_duration_minutes, expected_sections, output_format) VALUES
(
    'learning_module',
    'Module d''Apprentissage',
    'Formation structurée avec exercices et quiz',
    'course',
    'Crée un module d''apprentissage détaillé sur le sujet suivant: {subject}\n\nContenu source:\n{content}\n\nDurée cible: {duration_minutes} minutes\n\nStructure attendue:\n1. Introduction et objectifs\n2. Concepts clés\n3. Exemples pratiques\n4. Exercices\n5. Quiz d''évaluation\n6. Ressources complémentaires',
    'Tu es un expert pédagogique qui crée des modules d''apprentissage complets et structurés.',
    60,
    '["Introduction", "Concepts Clés", "Exemples Pratiques", "Exercices", "Quiz", "Ressources"]',
    'markdown'
),
(
    'technical_review',
    'Revue Technique',
    'Analyse approfondie d''une technologie ou solution',
    'review',
    'Rédige une revue technique complète sur: {subject}\n\nSource:\n{content}\n\nInclus:\n- Vue d''ensemble\n- Architecture et composants\n- Avantages et limitations\n- Cas d''usage\n- Comparaison avec alternatives\n- Recommandations',
    'Tu es un architecte technique senior qui analyse et évalue des technologies.',
    45,
    '["Vue d''ensemble", "Architecture", "Avantages", "Limitations", "Cas d''usage", "Comparaison", "Recommandations"]',
    'markdown'
),
(
    'executive_summary',
    'Note de Synthèse',
    'Résumé exécutif pour décideurs',
    'synthesis',
    'Crée une note de synthèse exécutive sur: {subject}\n\nContenu source:\n{content}\n\nFormat:\n- Résumé (3-5 points clés)\n- Contexte et enjeux\n- Analyse\n- Impact et implications\n- Recommandations d''action',
    'Tu es un consultant stratégique qui rédige des synthèses claires pour dirigeants.',
    20,
    '["Résumé", "Contexte", "Analyse", "Impact", "Recommandations"]',
    'markdown'
),
(
    'howto_guide',
    'Guide Pratique',
    'Guide étape par étape avec exemples',
    'guide',
    'Rédige un guide pratique détaillé: {subject}\n\nSource:\n{content}\n\nStructure:\n- Prérequis\n- Étapes numérotées avec captures/exemples\n- Conseils et bonnes pratiques\n- Dépannage (problèmes courants)\n- Pour aller plus loin',
    'Tu es un formateur technique qui crée des guides clairs et actionnables.',
    30,
    '["Prérequis", "Étapes", "Bonnes Pratiques", "Dépannage", "Ressources"]',
    'markdown'
),
(
    'comparison_matrix',
    'Tableau Comparatif',
    'Comparaison structurée de plusieurs solutions',
    'comparison',
    'Crée un tableau comparatif détaillé sur: {subject}\n\nSource:\n{content}\n\nInclus:\n- Tableau de comparaison (critères × solutions)\n- Analyse de chaque critère\n- Points forts/faibles\n- Recommandations selon use case',
    'Tu es un analyste qui compare objectivement des solutions techniques.',
    40,
    '["Introduction", "Tableau Comparatif", "Analyse Détaillée", "Recommandations"]',
    'markdown'
),
(
    'technical_checklist',
    'Checklist Technique',
    'Liste de vérification pour audits/déploiements',
    'checklist',
    'Génère une checklist technique complète pour: {subject}\n\nSource:\n{content}\n\nFormat:\n- Sections par étape/domaine\n- Items cochables avec description\n- Niveau de priorité (Critique/Important/Optionnel)\n- Ressources/références pour chaque item',
    'Tu es un ingénieur DevOps/QA qui crée des checklists exhaustives.',
    25,
    '["Préparation", "Déploiement", "Validation", "Post-déploiement"]',
    'markdown'
);

-- ============================================================
-- 7. CREATE API KEYS TABLE (for external integrations)
-- ============================================================

CREATE TABLE IF NOT EXISTS api_keys (
    id SERIAL PRIMARY KEY,
    key_hash VARCHAR(64) NOT NULL UNIQUE, -- SHA-256 of the key
    key_prefix VARCHAR(10) NOT NULL, -- First 8 chars for identification
    name VARCHAR(100) NOT NULL,
    workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
    permissions JSONB DEFAULT '{"read": true, "write": false, "generate": false}',
    rate_limit_per_hour INTEGER DEFAULT 100,
    is_active BOOLEAN DEFAULT true,
    last_used_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_workspace ON api_keys(workspace_id);
CREATE INDEX idx_api_keys_active ON api_keys(is_active);

-- ============================================================
-- 8. ADD TRIGGER FOR UPDATED_AT
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_workspaces_updated_at BEFORE UPDATE ON workspaces
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_content_templates_updated_at BEFORE UPDATE ON content_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- MIGRATION COMPLETE
-- ============================================================
-- Summary:
-- ✅ Created workspaces table with permissions
-- ✅ Added workspace_id to all relevant tables
-- ✅ Transformed courses into flexible knowledge_items (content_type, template)
-- ✅ Created content_templates for diverse content generation
-- ✅ Added API keys for external integrations
-- ✅ Migrated existing data to default workspace
-- ============================================================
