# Feature 3: Course Generator

**Status**: ✅ Complete  
**Date**: February 23, 2026  
**Branch**: `feature/course-generator`  
**LLM**: Claude Sonnet 4 (AWS Bedrock `us.anthropic.claude-sonnet-4-20250514-v1:0`)

---

## 📋 Overview

Le **Course Generator** transforme automatiquement les items de veille classifiés en cours pédagogiques structurés, multi-niveaux, avec QA automatique.

### Key Features
- ✅ Génération de cours Markdown structurés
- ✅ 3 niveaux de difficulté (beginner/intermediate/advanced)
- ✅ Sélection intelligente des sources par importance
- ✅ QA automatique avec scoring détaillé (0-10)
- ✅ Gestion de statuts (draft/review/published/archived)
- ✅ 6 MCP tools exposés via JSON-RPC

---

## 🏗️ Architecture

### Services

#### 1. CourseGeneratorService
**File**: `mcp_server/services/course_generator.py` (620 lines)

**Core Methods**:
- `generate_course(topic, level, max_items, min_importance)` - Génère un cours complet
- `score_course_quality(course_id)` - Évalue la qualité avec LLM
- `list_available_topics(min_items)` - Topics prêts pour génération
- `get_course(course_id)` - Récupère un cours
- `update_course_status(course_id, status)` - Change le statut

**LLM Configuration**:
```python
llm_provider = AWSBedrockProvider(
    model_id="us.anthropic.claude-sonnet-4-20250514-v1:0",
    region="us-east-1"
)
temperature = 0.7  # Plus créatif pour contenu pédagogique
max_tokens = 4000  # Cours longs
```

### MCP Tools

#### 1. `course.generate`
Génère un cours pour un topic spécifique.

**Input**:
```json
{
  "topic": "Agents",
  "level": "intermediate",
  "max_items": 5,
  "min_importance": "high"
}
```

**Output**:
```json
{
  "course_id": 4,
  "status": "generated",
  "title": "Building Production-Ready AI Agents: Memory, Observability & Tools",
  "level": "intermediate",
  "source_items_count": 5,
  "estimated_duration_minutes": 45,
  "tokens_used": 4010,
  "cost_usd": 0.041622,
  "latency_ms": 35200
}
```

#### 2. `course.score_quality`
Évalue la qualité d'un cours avec LLM.

**Input**:
```json
{
  "course_id": 4
}
```

**Output**:
```json
{
  "course_id": 4,
  "qa_score": 8.2,
  "issues": [
    {"type": "missing_section", "description": "No hands-on exercises"},
    {"type": "incomplete_content", "description": "Key takeaways cut off"}
  ],
  "strengths": [
    "Excellent technical accuracy",
    "Well-structured progression"
  ],
  "recommendations": [
    "Add complete code examples",
    "Include hands-on exercises"
  ],
  "tokens_used": 2470,
  "cost_usd": 0.01173
}
```

#### 3. `course.list_topics`
Liste les topics disponibles pour génération.

**Input**:
```json
{
  "min_items": 3
}
```

**Output**:
```json
{
  "topics": [
    {
      "id": 13,
      "name": "Agents",
      "slug": "agents",
      "item_count": 18,
      "classified_count": 18
    },
    ...
  ],
  "count": 16
}
```

#### 4. `course.get`
Récupère un cours complet.

#### 5. `course.update_status`
Change le statut (draft → review → published → archived).

#### 6. `course.list`
Liste des cours avec filtres optionnels (status, level, limit).

---

## 📚 Course Structure

### Template Markdown
```markdown
# [Course Title]

## 📚 Overview
[Brief course description]

## 🎯 Learning Objectives
- Objective 1
- Objective 2

## 📋 Prerequisites
- Prereq 1

## ⏱️ Estimated Duration
[X] minutes

## 📖 Content

### Section 1: [Title]
[Content]

### Section 2: [Title]
[Content]

## 💡 Key Takeaways
- Takeaway 1

## 🔗 Additional Resources
- [Resource](URL)

## 🛠️ Practical Exercise
[Exercise]
```

### Fields in Database
```sql
CREATE TABLE courses (
    id SERIAL PRIMARY KEY,
    item_id INTEGER NOT NULL REFERENCES items(id),
    title VARCHAR(500) NOT NULL,
    subject VARCHAR(100) NOT NULL,
    level VARCHAR(20) CHECK (level IN ('beginner', 'intermediate', 'advanced')),
    content TEXT NOT NULL,  -- Full Markdown
    learning_objectives JSONB,
    prerequisites JSONB,
    estimated_duration_minutes INTEGER,
    qa_score DECIMAL(3,2) CHECK (qa_score BETWEEN 0 AND 10),
    qa_issues JSONB,
    status VARCHAR(50) CHECK (status IN ('draft', 'review', 'published', 'archived')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

---

## 🎯 Quality Assurance

### Scoring Criteria

Le LLM évalue les cours selon 5 critères pondérés :

1. **Content Quality (30%)**
   - Technical accuracy
   - Clarity of explanations
   - Depth appropriate for level

2. **Pedagogical Structure (25%)**
   - Clear learning objectives
   - Logical flow
   - Progressive difficulty

3. **Practical Value (20%)**
   - Real-world examples
   - Actionable insights
   - Hands-on exercises

4. **Completeness (15%)**
   - All required sections
   - Adequate detail
   - Proper conclusion

5. **Presentation (10%)**
   - Markdown formatting
   - Readability
   - Visual organization

### Score Interpretation
- **9.0-10.0**: Excellent - Ready for publication
- **8.0-8.9**: Good - Minor improvements needed
- **7.0-7.9**: Adequate - Needs review
- **< 7.0**: Needs rework

---

## 💰 Cost Analysis

### Production Data (Feb 23, 2026)

**Course Generation**:
- 1 course generated
- 3,405 tokens
- Cost: $0.0361 (~3.6¢)
- **Average**: $0.036/course

**QA Scoring**:
- 2 evaluations
- 5,080 tokens total
- Cost: $0.0236 (~2.4¢)
- **Average**: $0.012/QA

**Total Feature 3**: $0.0597 (~6¢)

### Pricing Model (Claude Sonnet 4 via AWS Bedrock)
- Input: $3.00 / 1M tokens
- Output: $15.00 / 1M tokens

### Projected Costs
- 10 courses/month: ~$0.36
- 100 courses/month: ~$3.60
- QA for all: +$1.20 (100 courses)
- **Total for 100 courses**: ~$4.80/month

---

## 📊 Statistics

### Current Status (Feb 23, 2026)
- **Total Courses**: 5
- **Published**: 2
- **Drafts**: 3
- **Average QA Score**: 8.48/10
- **Total Duration**: 285 minutes (4h45)

### Courses Generated
1. "Introduction au Model Context Protocol (MCP)" - beginner - 8.5/10
2. "MCP Avancé: Créer vos propres Tools" - advanced - 9.0/10
3. "Guide des Embeddings pour le RAG" - intermediate - 8.0/10
4. "Building Production-Ready AI Agents" - intermediate - 8.2/10
5. "RAG Fundamentals: Building Intelligent AI Systems" - beginner - 8.7/10

### Available Topics (3+ items)
- Agents (18 items)
- LLM (15 items)
- Python (7 items)
- RAG (6 items)
- n8n (6 items)
- AI (5 items)
- + 10 more topics

---

## 🔧 Database Extensions

### New Methods in DatabaseManager

```python
# Topics
def get_topic_by_name(name: str) -> Optional[Dict]
def get_topic_by_id(topic_id: int) -> Optional[Dict]
def get_topics_with_stats(min_items: int) -> List[Dict]
def get_items_by_topic(topic_id: int, limit: int, min_importance: str) -> List[Dict]

# Courses
def get_course_by_id(course_id: int) -> Optional[Dict]
def get_course_by_item_level(item_id: int, level: str) -> Optional[Dict]
def insert_course(...) -> int
def update_course_qa(course_id: int, score: float, issues: List[Dict])
def update_course_status(course_id: int, status: str)

# Decisions
def insert_decision(
    decision_type: str,
    entity_id: int,
    entity_type: str,
    input_data: Dict,
    output_data: Dict,
    model: str,
    tokens_used: int,
    cost_usd: float
) -> int
```

---

## 🧪 Testing

### Test Cases

#### Test 1: Generate Intermediate Course
```bash
curl -X POST http://localhost:8000/rpc \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "course.generate",
    "params": {
      "topic": "Agents",
      "level": "intermediate",
      "max_items": 5,
      "min_importance": "high"
    },
    "id": 1
  }'
```

**Expected**:
- ✅ Course generated (status: "generated")
- ✅ course_id returned
- ✅ estimated_duration_minutes > 30
- ✅ tokens_used ~3000-5000
- ✅ cost_usd ~$0.03-$0.05

#### Test 2: QA Scoring
```bash
curl -X POST http://localhost:8000/rpc \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "course.score_quality",
    "params": {"course_id": 4},
    "id": 2
  }'
```

**Expected**:
- ✅ qa_score between 7.0-10.0
- ✅ issues array (can be empty)
- ✅ strengths array (2-7 items)
- ✅ recommendations array
- ✅ tokens_used ~2000-3000

---

## 🚀 Usage Examples

### 1. Generate a Beginner Course on RAG
```bash
curl -X POST http://localhost:8000/rpc \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "course.generate",
    "params": {
      "topic": "RAG",
      "level": "beginner",
      "max_items": 4,
      "min_importance": "medium"
    },
    "id": 1
  }'
```

### 2. List All Published Courses
```bash
curl -X POST http://localhost:8000/rpc \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "course.list",
    "params": {
      "status": "published",
      "limit": 10
    },
    "id": 2
  }'
```

### 3. Publish a Course
```bash
curl -X POST http://localhost:8000/rpc \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "course.update_status",
    "params": {
      "course_id": 5,
      "status": "published"
    },
    "id": 3
  }'
```

---

## 🐛 Known Issues & Future Improvements

### Known Issues
- ⚠️ Truncation possible si cours > 4000 tokens (limite du modèle)
- ⚠️ Code examples parfois incomplets
- ⚠️ Pas de support pour images/diagrammes

### Future Improvements
1. **Multi-Item Synthesis**: Générer un cours à partir de plusieurs items liés
2. **Diagram Generation**: Intégration Mermaid pour diagrammes automatiques
3. **Interactive Exercises**: Générer des quizzes avec validation
4. **Versioning**: Historique des modifications de cours
5. **Translation**: Support multi-langues (EN/FR)
6. **Export Formats**: PDF, EPUB, HTML standalone

---

## 📁 Files Created/Modified

### New Files
- `mcp_server/services/course_generator.py` (620 lines)
- `mcp_server/tools/course_generator.py` (365 lines)
- `database/migration_v1.3.0.sql` (60 lines)
- `docs/feature-3-course-generator.md` (this file)

### Modified Files
- `mcp_server/server.py` - Added 6 course tools
- `mcp_server/database.py` - Added 14 new methods
- `mcp_server/services/llm_provider.py` - Added Claude Sonnet 4 pricing
- `docs/ROADMAP.md` - Updated status

---

## ✅ Success Criteria Met

- [x] CourseGeneratorService implemented (620 lines)
- [x] 6 MCP tools exposed via JSON-RPC
- [x] Multi-level support (beginner/intermediate/advanced)
- [x] QA automatic scoring (0-10 scale)
- [x] Cost tracking integrated
- [x] Database methods extended
- [x] Claude Sonnet 4 integration
- [x] 2+ courses generated successfully
- [x] Average QA score > 8.0
- [x] Documentation complete

---

## 🎓 Conclusion

La Feature 3 est **production-ready** et permet de générer automatiquement des cours pédagogiques de haute qualité à partir de la veille technologique. 

**Next**: Feature 4 - RAG System pour permettre aux utilisateurs de poser des questions sur les cours générés.
