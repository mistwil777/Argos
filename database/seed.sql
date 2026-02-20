-- ============================================
-- AcademiaOps - Seed Data
-- Test data for local development
-- ============================================

-- ============================================
-- SEED: items (sample veille items)
-- ============================================

INSERT INTO items (
    source_type, source_url, title, content, url, 
    author, published_at,
    subject, impact_level, keywords, relevance_score,
    validation_status
) VALUES
(
    'rss',
    'https://modelcontextprotocol.io/blog/rss',
    'Introducing the Model Context Protocol',
    'The Model Context Protocol (MCP) is a new standard for connecting AI models to external tools and data sources. It provides a unified interface for LLMs to interact with databases, APIs, and other systems.',
    'https://modelcontextprotocol.io/blog/introducing-mcp',
    'Anthropic Team',
    '2024-11-25 10:00:00+00',
    'mcp',
    'High',
    ARRAY['MCP', 'protocol', 'LLM', 'standardization', 'tools'],
    9,
    'approved'
),
(
    'github',
    'https://github.com/langchain-ai/langchain',
    'LangChain: Building applications with LLMs through composability',
    'LangChain is a framework for developing applications powered by language models. It provides abstractions for chains, agents, and memory.',
    'https://github.com/langchain-ai/langchain',
    'LangChain AI',
    '2024-02-10 14:30:00+00',
    'multi-agents',
    'High',
    ARRAY['langchain', 'agents', 'LLM', 'framework', 'RAG'],
    8,
    'approved'
),
(
    'rss',
    'https://n8n.io/blog/rss',
    'n8n workflow automation best practices',
    'Learn how to build robust n8n workflows with error handling, retry logic, and monitoring.',
    'https://n8n.io/blog/workflow-best-practices',
    'n8n Team',
    '2024-01-15 09:00:00+00',
    'n8n',
    'Medium',
    ARRAY['n8n', 'automation', 'workflows', 'best-practices'],
    7,
    'pending'
),
(
    'rss',
    'https://openai.com/blog/embeddings-api',
    'New OpenAI Embeddings API with improved performance',
    'The new text-embedding-3 models provide better performance at lower cost for semantic search and RAG applications.',
    'https://openai.com/blog/new-embeddings-models',
    'OpenAI',
    '2024-01-25 16:00:00+00',
    'embeddings',
    'High',
    ARRAY['embeddings', 'OpenAI', 'RAG', 'semantic-search', 'API'],
    9,
    'approved'
),
(
    'manual',
    'https://example.com',
    'Understanding vector databases for AI applications',
    'A comprehensive guide to choosing and using vector databases like LanceDB, Pinecone, and Weaviate for AI applications.',
    'https://example.com/vector-databases-guide',
    'Tech Blog',
    '2024-02-05 11:00:00+00',
    'embeddings',
    'Medium',
    ARRAY['vector-database', 'embeddings', 'LanceDB', 'Pinecone'],
    6,
    'pending'
);

-- ============================================
-- SEED: courses (sample generated courses)
-- ============================================

INSERT INTO courses (
    item_id, title, subject, level, content,
    learning_objectives, prerequisites, estimated_duration_minutes,
    qa_score, status, published_at
) VALUES
(
    1,
    'Introduction au Model Context Protocol (MCP)',
    'mcp',
    'beginner',
    E'# Introduction au Model Context Protocol\n\n## Qu''est-ce que MCP ?\n\nLe Model Context Protocol (MCP) est un protocole standardisé qui permet aux modèles de langage (LLMs) d''interagir avec des outils externes...\n\n## Pourquoi MCP est important\n\nAvant MCP, chaque application devait créer ses propres interfaces...',
    '["Comprendre le rôle de MCP dans l''écosystème IA", "Identifier les cas d''usage de MCP", "Distinguer MCP des autres protocoles"]',
    '["Notions de base en LLM", "Connaissance de JSON"]',
    45,
    8.5,
    'published',
    '2024-11-26 10:00:00+00'
),
(
    1,
    'MCP Avancé: Créer vos propres Tools',
    'mcp',
    'advanced',
    E'# MCP Avancé: Créer vos propres Tools\n\n## Architecture d''un Tool MCP\n\nUn Tool MCP est composé de trois éléments principaux:\n1. Le schéma d''input (Pydantic)\n2. La logique métier\n3. Le schéma d''output...',
    '["Créer un Tool MCP personnalisé", "Implémenter la validation Pydantic", "Gérer les erreurs JSON-RPC"]',
    '["Connaissance du cours débutant MCP", "Python intermédiaire", "Notions de validation de données"]',
    90,
    9.0,
    'published',
    '2024-11-27 14:00:00+00'
),
(
    4,
    'Guide des Embeddings pour le RAG',
    'embeddings',
    'intermediate',
    E'# Guide des Embeddings pour le RAG\n\n## Qu''est-ce qu''un embedding ?\n\nUn embedding est une représentation vectorielle d''un texte...\n\n## Choisir son modèle d''embeddings\n\nPlusieurs critères entrent en jeu:\n- Dimension du vecteur\n- Performance (qualité du retrieval)\n- Coût...',
    '["Comprendre le fonctionnement des embeddings", "Choisir un modèle adapté", "Implémenter un système RAG simple"]',
    '["Notions de machine learning", "Python de base"]',
    60,
    8.0,
    'draft',
    NULL
);

-- ============================================
-- SEED: decisions (sample validation decisions)
-- ============================================

INSERT INTO decisions (
    decision_type, item_id, decision,
    original_classification, modified_classification,
    reason, decided_by, decided_at
) VALUES
(
    'item_validation',
    1,
    'approve',
    '{"subject": "mcp", "impact_level": "High", "relevance_score": 9}',
    NULL,
    'Excellent article introduisant MCP, très pertinent pour notre veille',
    'admin',
    '2024-11-25 11:00:00+00'
),
(
    'classification_override',
    2,
    'modify',
    '{"subject": "autre", "impact_level": "Medium", "relevance_score": 6}',
    '{"subject": "multi-agents", "impact_level": "High", "relevance_score": 8}',
    'LangChain est clairement un framework multi-agents, et son impact est plus élevé',
    'admin',
    '2024-02-10 15:00:00+00'
);

-- ============================================
-- SEED: user_progress (sample learning progress)
-- ============================================

INSERT INTO user_progress (
    user_identifier, course_id, status, progress_percent,
    started_at, last_accessed_at
) VALUES
(
    'demo@academiaops.com',
    1,
    'completed',
    100,
    '2024-11-26 12:00:00+00',
    '2024-11-26 13:30:00+00'
),
(
    'demo@academiaops.com',
    2,
    'in_progress',
    35,
    '2024-11-27 15:00:00+00',
    '2024-11-28 10:00:00+00'
),
(
    'student@example.com',
    1,
    'in_progress',
    60,
    '2024-11-27 09:00:00+00',
    '2024-11-27 10:30:00+00'
);

-- ============================================
-- SEED: rag_queries (sample RAG interactions)
-- ============================================

INSERT INTO rag_queries (
    user_identifier, query, answer, sources, confidence_score,
    was_helpful, user_feedback
) VALUES
(
    'demo@academiaops.com',
    'Comment créer un Tool MCP personnalisé ?',
    'Pour créer un Tool MCP personnalisé, vous devez définir trois éléments : un schéma d''input avec Pydantic pour valider les paramètres, la logique métier qui implémente la fonctionnalité du tool, et un schéma d''output pour structurer la réponse.',
    '[{"course_id": 2, "chapter": "Architecture d''un Tool MCP", "score": 0.91}]',
    0.91,
    true,
    'Réponse claire et précise'
),
(
    'student@example.com',
    'Quelle est la différence entre MCP et LangChain ?',
    'MCP est un protocole standardisé pour la communication entre LLMs et outils, tandis que LangChain est un framework applicatif complet pour construire des applications avec des LLMs. MCP se concentre sur l''interopérabilité, LangChain sur la composition de chaînes et d''agents.',
    '[{"course_id": 1, "chapter": "Pourquoi MCP est important", "score": 0.78}]',
    0.78,
    true,
    NULL
);

-- ============================================
-- SEED: system_logs (sample events)
-- ============================================

INSERT INTO system_logs (level, component, event_type, message, context) VALUES
(
    'INFO',
    'n8n',
    'workflow_executed',
    'RSS collection workflow completed successfully',
    '{"workflow_id": "rss_collection", "items_collected": 15, "duration_ms": 2340}'
),
(
    'INFO',
    'agent_classifier',
    'item_classified',
    'Item classified by Classifier agent',
    '{"item_id": 1, "subject": "mcp", "impact_level": "High", "tokens_used": 450}'
),
(
    'INFO',
    'agent_course_builder',
    'course_generated',
    'Course generated successfully',
    '{"course_id": 1, "level": "beginner", "tokens_used": 3200, "duration_ms": 8500}'
),
(
    'WARNING',
    'mcp_server',
    'rate_limit_approached',
    'OpenAI API rate limit at 80%',
    '{"current_rpm": 2400, "limit_rpm": 3000, "window": "1_minute"}'
);

-- ============================================
-- VERIFICATION
-- ============================================

-- Log seed completion
INSERT INTO system_logs (level, component, event_type, message, context)
VALUES (
    'INFO',
    'database',
    'seed_data_loaded',
    'Seed data loaded successfully for development',
    jsonb_build_object(
        'items_count', (SELECT COUNT(*) FROM items),
        'courses_count', (SELECT COUNT(*) FROM courses),
        'users_count', (SELECT COUNT(DISTINCT user_identifier) FROM user_progress),
        'timestamp', CURRENT_TIMESTAMP
    )
);

-- ============================================
-- END OF SEED DATA
-- ============================================
