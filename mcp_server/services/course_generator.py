"""
Course Generator Service for AcademiaOps

Generates structured educational courses from classified tech watch items.
"""

import logging
import json
import re
from typing import Dict, List, Optional, Tuple
from datetime import datetime

from mcp_server.database import DatabaseManager
from mcp_server.services.llm_provider import LLMProvider

logger = logging.getLogger(__name__)


# ============================================
# Prompt Templates
# ============================================

COURSE_GENERATION_PROMPT = """You are an expert technical educator creating high-quality educational courses about AI and technology.

**Your task:** Generate a complete educational course in Markdown format.

**Context:**
- Topic: {topic}
- Level: {level}
- Number of source items: {num_items}

**Source Materials:**
{sources}

**Requirements:**

1. **Course Structure** (Markdown format):
   ```markdown
   # [Course Title]
   
   ## 📚 Overview
   [Brief course description, 2-3 sentences]
   
   ## 🎯 Learning Objectives
   - Objective 1
   - Objective 2
   - Objective 3
   
   ## 📋 Prerequisites
   - Prerequisite 1
   - Prerequisite 2
   
   ## ⏱️ Estimated Duration
   [X] minutes
   
   ## 📖 Content
   
   ### Section 1: [Title]
   [Detailed explanation with examples]
   
   ### Section 2: [Title]
   [Detailed explanation with examples]
   
   ### Section 3: [Title]
   [Detailed explanation with examples]
   
   ## 💡 Key Takeaways
   - Takeaway 1
   - Takeaway 2
   - Takeaway 3
   
   ## 🔗 Additional Resources
   - [Resource 1 Title](URL)
   - [Resource 2 Title](URL)
   
   ## 🛠️ Practical Exercise
   [Optional hands-on exercise]
   ```

2. **Level-specific guidelines:**
   - **Beginner:** Explain fundamentals, avoid jargon, use simple examples, focus on "what" and "why"
   - **Intermediate:** Assume basic knowledge, introduce advanced concepts, practical implementations, focus on "how"
   - **Advanced:** Deep technical details, optimization strategies, edge cases, research insights, focus on "mastery"

3. **Quality standards:**
   - Clear, engaging writing
   - Technical accuracy
   - Practical examples
   - Cite source URLs in Additional Resources
   - Include code snippets when relevant (with proper syntax highlighting)

**Output format:**
Return ONLY a valid JSON object (no markdown code blocks) with this structure:
{{
    "title": "Course title (50-100 chars)",
    "content": "Full Markdown course content",
    "learning_objectives": ["objective1", "objective2", "objective3"],
    "prerequisites": ["prereq1", "prereq2"],
    "estimated_duration_minutes": 30
}}"""


QA_SCORING_PROMPT = """You are a quality assurance expert for educational content.

**Your task:** Evaluate the quality of this technical course and assign a score.

**Course to evaluate:**
Title: {title}
Level: {level}
Content Length: {content_length} characters

**Course Content:**
{content}

**Evaluation Criteria:**

1. **Content Quality (30%)**
   - Technical accuracy
   - Clarity of explanations
   - Depth appropriate for level

2. **Pedagogical Structure (25%)**
   - Clear learning objectives
   - Logical flow and organization
   - Progressive difficulty

3. **Practical Value (20%)**
   - Real-world examples
   - Actionable insights
   - Hands-on exercises

4. **Completeness (15%)**
   - All required sections present
   - Adequate detail
   - Proper conclusion

5. **Presentation (10%)**
   - Markdown formatting quality
   - Readability
   - Visual organization (headings, lists, code blocks)

**Output format:**
Return ONLY a valid JSON object (no markdown code blocks):
{{
    "score": 8.5,
    "issues": [
        {{"type": "missing_section", "description": "No practical exercise included"}},
        {{"type": "clarity", "description": "Section 2 could be clearer"}}
    ],
    "strengths": [
        "Excellent code examples",
        "Clear progression from basics to advanced"
    ],
    "recommendations": [
        "Add more real-world use cases",
        "Include troubleshooting section"
    ]
}}

Score range: 0.0 to 10.0 (one decimal place)"""


class CourseGeneratorService:
    """Service for generating educational courses from classified items."""
    
    def __init__(
        self,
        llm_provider: LLMProvider,
        db_manager: DatabaseManager,
        temperature: float = 0.7,
        max_tokens: int = 4000
    ):
        """
        Initialize CourseGeneratorService.
        
        Args:
            llm_provider: LLM provider instance (preferably Claude for better pedagogy)
            db_manager: Database manager instance
            temperature: Sampling temperature (0-2, higher = more creative)
            max_tokens: Maximum tokens in response
        """
        self.llm_provider = llm_provider
        self.db = db_manager
        self.temperature = temperature
        self.max_tokens = max_tokens
        
        logger.info(
            f"CourseGeneratorService initialized with {type(llm_provider).__name__}",
            extra={"temperature": temperature, "max_tokens": max_tokens}
        )
    
    # ============================================
    # Public Methods
    # ============================================
    
    async def generate_course(
        self,
        topic: str,
        level: str = "intermediate",
        max_items: int = 5,
        min_importance: str = "medium"
    ) -> Dict:
        """
        Generate a course for a specific topic.
        
        Args:
            topic: Topic name (e.g., "Agents", "RAG", "LLM")
            level: Course level ("beginner", "intermediate", "advanced")
            max_items: Maximum number of source items to use
            min_importance: Minimum importance level ("low", "medium", "high", "critical")
        
        Returns:
            Dict with course data and generation metrics
        
        Raises:
            ValueError: If topic not found or invalid parameters
            Exception: If LLM call fails
        """
        logger.info(f"Starting course generation for topic='{topic}', level='{level}'")
        
        # 1. Validate level
        if level not in ["beginner", "intermediate", "advanced"]:
            raise ValueError(f"Invalid level: {level}. Must be beginner, intermediate, or advanced")
        
        # 2. Find topic in database
        topic_info = self.db.get_topic_by_name(topic)
        if not topic_info:
            raise ValueError(f"Topic '{topic}' not found in database")
        
        topic_id = topic_info["id"]
        
        # 3. Fetch relevant items
        items = self._get_items_for_topic(
            topic_id=topic_id,
            max_items=max_items,
            min_importance=min_importance
        )
        
        if not items:
            raise ValueError(f"No items found for topic '{topic}' with importance >= '{min_importance}'")
        
        logger.info(f"Found {len(items)} items for course generation")
        
        # 4. Check if course already exists
        existing_course = self._check_existing_course(topic_id, level, items)
        if existing_course:
            logger.info(f"Course already exists: {existing_course['id']}")
            return {
                "course_id": existing_course["id"],
                "status": "already_exists",
                "message": f"Course already exists for topic '{topic}' at {level} level"
            }
        
        # 5. Generate course content with LLM
        start_time = datetime.now()
        course_data, usage = await self._generate_course_content(
            topic=topic,
            level=level,
            items=items
        )
        latency_ms = int((datetime.now() - start_time).total_seconds() * 1000)
        
        # 6. Calculate cost
        tokens_input = usage.get("prompt_tokens", 0)
        tokens_output = usage.get("completion_tokens", 0)
        tokens_total = usage.get("total_tokens", 0)
        cost_usd = self.llm_provider.calculate_cost(tokens_input, tokens_output)
        
        # 7. Save course to database (use first item as primary source)
        course_id = self._save_course(
            item_id=items[0]["id"],
            topic_id=topic_id,
            level=level,
            course_data=course_data,
            cost_usd=cost_usd,
            tokens_total=tokens_total
        )
        
        # 8. Build result
        model_name = getattr(self.llm_provider, 'model', None) or getattr(self.llm_provider, 'model_id', 'unknown')
        result = {
            "course_id": course_id,
            "status": "generated",
            "title": course_data["title"],
            "level": level,
            "topic": topic,
            "source_items_count": len(items),
            "estimated_duration_minutes": course_data["estimated_duration_minutes"],
            "model": model_name,
            "tokens_used": tokens_total,
            "cost_usd": round(cost_usd, 6),
            "latency_ms": latency_ms
        }
        
        logger.info(
            f"Course generated successfully: {course_id}",
            extra={
                "course_id": course_id,
                "topic": topic,
                "level": level,
                "tokens": tokens_total,
                "cost_usd": cost_usd
            }
        )
        
        return result
    
    async def score_course_quality(self, course_id: int) -> Dict:
        """
        Evaluate and score course quality using LLM.
        
        Args:
            course_id: Course identifier
        
        Returns:
            Dict with QA score, issues, strengths, and recommendations
        
        Raises:
            ValueError: If course not found
            Exception: If LLM call fails
        """
        logger.info(f"Starting QA scoring for course {course_id}")
        
        # 1. Fetch course from database
        course = self.db.get_course_by_id(course_id)
        if not course:
            raise ValueError(f"Course {course_id} not found in database")
        
        # 2. Build QA prompt
        prompt = QA_SCORING_PROMPT.format(
            title=course["title"],
            level=course["level"],
            content_length=len(course["content"]),
            content=course["content"][:8000]  # Truncate if too long
        )
        
        # 3. Call LLM for evaluation
        start_time = datetime.now()
        content, usage = await self._call_llm(prompt, temperature=0.3)
        latency_ms = int((datetime.now() - start_time).total_seconds() * 1000)
        
        # 4. Parse response
        qa_result = self._parse_json_response(content)
        
        # 5. Validate score
        score = float(qa_result.get("score", 0))
        if not (0 <= score <= 10):
            raise ValueError(f"Invalid QA score: {score}")
        
        # 6. Calculate cost
        tokens_input = usage.get("prompt_tokens", 0)
        tokens_output = usage.get("completion_tokens", 0)
        tokens_total = usage.get("total_tokens", 0)
        cost_usd = self.llm_provider.calculate_cost(tokens_input, tokens_output)
        
        # 7. Update course in database
        self._update_course_qa(course_id, score, qa_result.get("issues", []))
        
        # 8. Log decision
        self._log_qa_decision(course_id, score, cost_usd, tokens_total)
        
        result = {
            "course_id": course_id,
            "qa_score": round(score, 2),
            "issues": qa_result.get("issues", []),
            "strengths": qa_result.get("strengths", []),
            "recommendations": qa_result.get("recommendations", []),
            "tokens_used": tokens_total,
            "cost_usd": round(cost_usd, 6),
            "latency_ms": latency_ms
        }
        
        logger.info(
            f"QA scoring completed for course {course_id}",
            extra={"course_id": course_id, "score": score, "tokens": tokens_total}
        )
        
        return result
    
    def list_available_topics(self, min_items: int = 3) -> List[Dict]:
        """
        List topics that have enough items for course generation.
        
        Args:
            min_items: Minimum number of classified items required
        
        Returns:
            List of dicts with topic info and stats
        """
        topics = self.db.get_topics_with_stats(min_items=min_items)
        
        logger.info(f"Found {len(topics)} topics with >= {min_items} items")
        
        return topics
    
    def get_course(self, course_id: int) -> Dict:
        """
        Get course by ID.
        
        Args:
            course_id: Course identifier
        
        Returns:
            Course data dict
        
        Raises:
            ValueError: If course not found
        """
        course = self.db.get_course_by_id(course_id)
        if not course:
            raise ValueError(f"Course {course_id} not found")
        
        return course
    
    def update_course_status(self, course_id: int, status: str) -> Dict:
        """
        Update course publication status.
        
        Args:
            course_id: Course identifier
            status: New status ("draft", "review", "published", "archived")
        
        Returns:
            Updated course data
        
        Raises:
            ValueError: If course not found or invalid status
        """
        valid_statuses = ["draft", "review", "published", "archived"]
        if status not in valid_statuses:
            raise ValueError(f"Invalid status: {status}. Must be one of {valid_statuses}")
        
        course = self.db.get_course_by_id(course_id)
        if not course:
            raise ValueError(f"Course {course_id} not found")
        
        # Update status
        self.db.update_course_status(course_id, status)
        
        logger.info(f"Course {course_id} status updated to '{status}'")
        
        return {
            "course_id": course_id,
            "status": status,
            "updated_at": datetime.now().isoformat()
        }
    
    # ============================================
    # Private Helper Methods
    # ============================================
    
    def _get_items_for_topic(
        self,
        topic_id: int,
        max_items: int,
        min_importance: str
    ) -> List[Dict]:
        """Fetch items for a topic with importance filtering."""
        importance_order = {"critical": 4, "high": 3, "medium": 2, "low": 1}
        min_level = importance_order.get(min_importance, 2)
        
        items = self.db.get_items_by_topic(
            topic_id=topic_id,
            limit=max_items,
            min_importance=min_importance
        )
        
        return items
    
    def _check_existing_course(
        self,
        topic_id: int,
        level: str,
        items: List[Dict]
    ) -> Optional[Dict]:
        """Check if a course already exists for this topic+level combination."""
        # Use first item as representative
        item_id = items[0]["id"]
        existing = self.db.get_course_by_item_level(item_id, level)
        return existing
    
    async def _generate_course_content(
        self,
        topic: str,
        level: str,
        items: List[Dict]
    ) -> Tuple[Dict, Dict]:
        """Generate course content using LLM."""
        # Build sources text
        sources_text = self._format_sources(items)
        
        # Build prompt
        prompt = COURSE_GENERATION_PROMPT.format(
            topic=topic,
            level=level,
            num_items=len(items),
            sources=sources_text
        )
        
        # Call LLM
        content, usage = await self._call_llm(prompt, temperature=self.temperature)
        
        # Parse response
        course_data = self._parse_json_response(content)
        
        # Validate required fields
        required_fields = ["title", "content", "learning_objectives", "prerequisites", "estimated_duration_minutes"]
        for field in required_fields:
            if field not in course_data:
                raise ValueError(f"LLM response missing required field: {field}")
        
        return course_data, usage
    
    def _format_sources(self, items: List[Dict]) -> str:
        """Format source items for prompt."""
        sources = []
        for i, item in enumerate(items, 1):
            sources.append(f"""
Source {i}:
- Title: {item['title']}
- Summary: {item.get('summary', 'N/A')}
- URL: {item['url']}
- Importance: {item.get('importance', 'N/A')}
- Type: {item.get('item_type', 'N/A')}
""")
        return "\n".join(sources)
    
    async def _call_llm(self, prompt: str, temperature: Optional[float] = None) -> Tuple[str, Dict]:
        """Call LLM provider with prompt."""
        temp = temperature if temperature is not None else self.temperature
        
        # System prompt for course generation (pedagogical context)
        system_prompt = """You are an expert technical educator and course designer specializing in AI, machine learning, and software engineering topics. Your role is to create high-quality, engaging educational content that is technically accurate, well-structured, and appropriate for the target audience level."""
        
        content, usage = await self.llm_provider.generate(
            prompt=prompt,
            system_prompt=system_prompt,
            temperature=temp,
            max_tokens=self.max_tokens
        )
        
        return content, usage
    
    def _parse_json_response(self, content: str) -> Dict:
        """Parse JSON from LLM response, removing markdown code blocks if present."""
        # Remove markdown code blocks
        content = re.sub(r"```json\s*", "", content)
        content = re.sub(r"```\s*", "", content)
        content = content.strip()
        
        try:
            return json.loads(content)
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse JSON response: {e}")
            logger.debug(f"Raw content: {content[:500]}")
            raise ValueError(f"Invalid JSON response from LLM: {e}")
    
    def _save_course(
        self,
        item_id: int,
        topic_id: int,
        level: str,
        course_data: Dict,
        cost_usd: float,
        tokens_total: int
    ) -> int:
        """Save generated course to database."""
        # Get topic name
        topic = self.db.get_topic_by_id(topic_id)
        subject = topic["name"] if topic else "Unknown"
        
        course_id = self.db.insert_course(
            item_id=item_id,
            title=course_data["title"],
            subject=subject,
            level=level,
            content=course_data["content"],
            learning_objectives=course_data["learning_objectives"],
            prerequisites=course_data["prerequisites"],
            estimated_duration_minutes=course_data["estimated_duration_minutes"]
        )
        
        # Log decision
        self._log_generation_decision(course_id, item_id, cost_usd, tokens_total)
        
        return course_id
    
    def _update_course_qa(self, course_id: int, score: float, issues: List[Dict]):
        """Update course QA fields."""
        self.db.update_course_qa(course_id, score, issues)
    
    def _log_generation_decision(self, course_id: int, item_id: int, cost_usd: float, tokens_total: int):
        """Log course generation decision."""
        model_name = getattr(self.llm_provider, 'model', None) or getattr(self.llm_provider, 'model_id', 'unknown')
        
        self.db.insert_decision(
            decision_type="course_generation",
            entity_id=course_id,
            entity_type="course",
            input_data={"item_id": item_id},
            output_data={"course_id": course_id},
            model=model_name,
            tokens_used=tokens_total,
            cost_usd=cost_usd
        )
    
    def _log_qa_decision(self, course_id: int, score: float, cost_usd: float, tokens_total: int):
        """Log QA scoring decision."""
        model_name = getattr(self.llm_provider, 'model', None) or getattr(self.llm_provider, 'model_id', 'unknown')
        
        self.db.insert_decision(
            decision_type="course_qa",
            entity_id=course_id,
            entity_type="course",
            input_data={"course_id": course_id},
            output_data={"qa_score": score},
            model=model_name,
            tokens_used=tokens_total,
            cost_usd=cost_usd
        )
