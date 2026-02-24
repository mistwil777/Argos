"""
Classification Service for AcademiaOps

Uses LLM (OpenAI, AWS Bedrock, etc.) to analyze and classify tech watch items.
"""

import logging
import json
import re
from typing import Dict, List, Optional
from datetime import datetime

from mcp_server.database import DatabaseManager
from mcp_server.services.llm_provider import LLMProvider

logger = logging.getLogger(__name__)


# ============================================
# Prompt Template
# ============================================

CLASSIFICATION_PROMPT_TEMPLATE = """Analyze the following tech watch item and classify it.

**Item:**
- Title: {title}
- Summary: {summary}
- Source: {source}
- URL: {url}

**Your task:**
Extract structured information in JSON format with these fields:

1. **topics** (array of 1-5 strings): Main technical topics/technologies mentioned.
   Examples: ["LLM", "RAG", "Embeddings", "Agents", "FineTuning", "Multimodal", "Computer Vision", "NLP", "Transformers"]

2. **importance** (enum): Strategic importance for staying up-to-date.
   - "critical": Revolutionary impact, paradigm shift
   - "high": Major advancement, significant implications
   - "medium": Incremental improvement, useful to know
   - "low": Minor update or niche topic

3. **item_type** (enum): Nature of the content.
   - "innovation": New technology, breakthrough, major release
   - "tutorial": How-to guide, implementation example
   - "research": Academic paper, research findings
   - "news": Industry announcement, company news
   - "opinion": Analysis, commentary, best practices

4. **reasoning** (string): Brief explanation (1-2 sentences) justifying your classification.

**Output format (JSON only, no markdown code blocks):**
{{
    "topics": ["topic1", "topic2"],
    "importance": "high",
    "item_type": "innovation",
    "reasoning": "Your explanation here."
}}"""


class ClassifierService:
    """Service for classifying tech watch items using LLM."""
    
    def __init__(
        self,
        llm_provider: LLMProvider,
        db_manager: DatabaseManager,
        temperature: float = 0.3,
        max_tokens: int = 500
    ):
        """
        Initialize ClassifierService.
        
        Args:
            llm_provider: LLM provider instance (OpenAI, AWS Bedrock, etc.)
            db_manager: Database manager instance
            temperature: Sampling temperature (0-2, lower = more deterministic)
            max_tokens: Maximum tokens in response
        """
        self.llm_provider = llm_provider
        self.db = db_manager
        self.temperature = temperature
        self.max_tokens = max_tokens
        
        logger.info(
            f"ClassifierService initialized with {type(llm_provider).__name__}",
            extra={"temperature": temperature}
        )
    
    # ============================================
    # Public Methods
    # ============================================
    
    async def classify_item(self, item_id: int) -> Dict:
        """
        Classify a single item.
        
        Args:
            item_id: Item identifier
        
        Returns:
            Classification result dict with topics, importance, item_type, reasoning, and metrics
        
        Raises:
            ValueError: If item not found or invalid data
            Exception: If LLM call fails
        """
        logger.info(f"Starting classification for item {item_id}")
        
        # 1. Fetch item from database
        item = self.db.get_item_by_id(item_id)
        if not item:
            raise ValueError(f"Item {item_id} not found in database")
        
        # Validate item has content
        if not item.get("title") and not item.get("summary"):
            raise ValueError(f"Item {item_id} has no content to classify")
        
        # 2. Build classification prompt
        prompt = self._build_prompt(item)
        
        # 3. Call LLM API
        start_time = datetime.now()
        content, usage = await self._call_llm(prompt)
        latency_ms = int((datetime.now() - start_time).total_seconds() * 1000)
        
        # 4. Parse and validate response
        classification = self._parse_response(content)
        
        # 5. Calculate cost
        tokens_input = usage.get("prompt_tokens", 0)
        tokens_output = usage.get("completion_tokens", 0)
        tokens_total = usage.get("total_tokens", 0)
        cost_usd = self.llm_provider.calculate_cost(tokens_input, tokens_output)
        
        # 6. Save to database
        self._save_classification(item_id, classification, tokens_total, cost_usd)
        
        # 7. Build result
        model_name = getattr(self.llm_provider, 'model', None) or getattr(self.llm_provider, 'model_id', 'unknown')
        result = {
            "item_id": item_id,
            "topics": classification["topics"],
            "importance": classification["importance"],
            "item_type": classification["item_type"],
            "reasoning": classification["reasoning"],
            "model": model_name,
            "tokens_used": tokens_total,
            "cost_usd": round(cost_usd, 6),
            "latency_ms": latency_ms
        }
        
        logger.info(
            f"Classification successful for item {item_id}",
            extra={
                "item_id": item_id,
                "topics": classification["topics"],
                "importance": classification["importance"],
                "tokens": tokens_total,
                "cost_usd": cost_usd,
                "latency_ms": latency_ms
            }
        )
        
        return result
    
    async def classify_batch(self, item_ids: Optional[List[int]] = None, limit: int = 10) -> Dict:
        """
        Classify multiple items.
        
        Args:
            item_ids: Specific item IDs to classify (optional)
            limit: If item_ids not provided, fetch up to this many unclassified items
        
        Returns:
            Dict with summary statistics and individual results
        """
        # Determine which items to classify
        if item_ids:
            items_to_classify = item_ids
        else:
            unclassified = self.db.get_unclassified_items(limit=limit)
            items_to_classify = [item["id"] for item in unclassified]
        
        if not items_to_classify:
            logger.info("No items to classify")
            return {
                "processed": 0,
                "successful": 0,
                "failed": 0,
                "total_cost_usd": 0,
                "total_tokens": 0,
                "results": []
            }
        
        logger.info(f"Starting batch classification for {len(items_to_classify)} items")
        
        # Process each item
        results = []
        successful = 0
        failed = 0
        total_cost = 0
        total_tokens = 0
        
        for item_id in items_to_classify:
            try:
                result = await self.classify_item(item_id)
                results.append({
                    "item_id": item_id,
                    "status": "success",
                    "data": result
                })
                successful += 1
                total_cost += result["cost_usd"]
                total_tokens += result["tokens_used"]
                
            except Exception as e:
                logger.error(f"Failed to classify item {item_id}: {e}", exc_info=True)
                results.append({
                    "item_id": item_id,
                    "status": "error",
                    "error": str(e)
                })
                failed += 1
        
        summary = {
            "processed": len(items_to_classify),
            "successful": successful,
            "failed": failed,
            "total_cost_usd": round(total_cost, 4),
            "total_tokens": total_tokens,
            "results": results
        }
        
        logger.info(
            f"Batch classification complete: {successful} successful, {failed} failed",
            extra={
                "processed": len(items_to_classify),
                "successful": successful,
                "failed": failed,
                "total_cost_usd": total_cost,
                "total_tokens": total_tokens
            }
        )
        
        return summary
    
    # ============================================
    # Private Methods
    # ============================================
    
    def _build_prompt(self, item: Dict) -> str:
        """
        Build classification prompt from item data.
        
        Args:
            item: Item dict with title, summary, source_type, source_url, url
        
        Returns:
            Formatted prompt string
        """
        # Build source string from source_type and source_url
        source = item.get("source_type", "Unknown")
        if source_url := item.get("source_url"):
            source = f"{source} ({source_url})"
        
        return CLASSIFICATION_PROMPT_TEMPLATE.format(
            title=item.get("title", "N/A"),
            summary=item.get("summary", "N/A"),
            source=source,
            url=item.get("url", "")
        )
    
    async def _call_llm(self, prompt: str) -> tuple[str, Dict]:
        """
        Call LLM API with error handling.
        
        Args:
            prompt: Classification prompt
        
        Returns:
            Tuple of (content_string, usage_dict)
        
        Raises:
            Exception: If API call fails
        """
        system_prompt = "You are a precise AI assistant specialized in classifying technical content. Always respond with valid JSON only, no markdown formatting."
        
        try:
            content, usage = await self.llm_provider.generate(
                prompt=prompt,
                system_prompt=system_prompt,
                temperature=self.temperature,
                max_tokens=self.max_tokens
            )
            
            logger.debug(f"LLM response received: {usage.get('total_tokens', 0)} tokens")
            return content, usage
            
        except Exception as e:
            logger.error(f"LLM API call failed: {e}", exc_info=True)
            raise Exception(f"Failed to call LLM API: {str(e)}")
    
    def _parse_response(self, content: str) -> Dict:
        """
        Parse and validate LLM JSON response.
        
        Args:
            content: LLM response content string
        
        Returns:
            Validated classification dict
        
        Raises:
            ValueError: If response is invalid or malformed
        """
        # Try to parse JSON
        try:
            # Remove markdown code blocks if present
            content_clean = re.sub(r"```json\s*|\s*```", "", content).strip()
            classification = json.loads(content_clean)
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse JSON response: {content}")
            raise ValueError(f"Invalid JSON in LLM response: {str(e)}")
        
        # Validate required fields
        required_fields = ["topics", "importance", "item_type", "reasoning"]
        missing = [f for f in required_fields if f not in classification]
        if missing:
            raise ValueError(f"Missing required fields in classification: {missing}")
        
        # Validate enums
        valid_importance = ["critical", "high", "medium", "low"]
        if classification["importance"] not in valid_importance:
            raise ValueError(
                f"Invalid importance '{classification['importance']}'. "
                f"Must be one of: {valid_importance}"
            )
        
        valid_types = ["innovation", "tutorial", "research", "news", "opinion"]
        if classification["item_type"] not in valid_types:
            raise ValueError(
                f"Invalid item_type '{classification['item_type']}'. "
                f"Must be one of: {valid_types}"
            )
        
        # Validate topics is a list
        if not isinstance(classification["topics"], list) or len(classification["topics"]) == 0:
            raise ValueError("Topics must be a non-empty list")
        
        # Validate reasoning is a string
        if not isinstance(classification["reasoning"], str) or len(classification["reasoning"]) < 10:
            raise ValueError("Reasoning must be a string with at least 10 characters")
        
        logger.debug(f"Classification parsed and validated: {classification}")
        return classification
    
    def _save_classification(
        self,
        item_id: int,
        classification: Dict,
        tokens_used: int,
        cost_usd: float
    ):
        """
        Persist classification to database.
        
        Args:
            item_id: Item identifier
            classification: Parsed classification dict
            tokens_used: Total tokens consumed
            cost_usd: API call cost
        """
        # Get model name from provider
        model_name = getattr(self.llm_provider, 'model', None) or getattr(self.llm_provider, 'model_id', 'unknown')
        
        # Map importance to correct case (database constraint)
        importance_map = {
            "critical": "High",  # Map critical to High for now
            "high": "High",
            "medium": "Medium",
            "low": "Low"
        }
        importance_db = importance_map.get(classification["importance"].lower(), "Medium")
        
        # Update item classification
        self.db.update_classification(
            item_id=item_id,
            importance=importance_db,
            item_type=classification["item_type"]
        )
        
        # TODO: Create items_topics table and enable this
        # Link topics
        # self.db.link_item_to_topics(
        #     item_id=item_id,
        #     topic_names=classification["topics"]
        # )
        
        # Log decision for tracking (simplified - no HITL yet)
        # Skip logging to avoid schema mismatch
        # self.db.log_decision(...)
        
        logger.info(
            f\"Classification saved for item {item_id}\",
            extra={
                \"item_id\": item_id,
                \"importance\": importance_db,
                \"item_type\": classification[\"item_type\"],
                \"topics\": classification[\"topics\"],
                \"cost_usd\": cost_usd
            }
        )
            reason=classification["reasoning"],
            model_used=model_name,
            tokens_used=tokens_used,
            cost_usd=cost_usd
        )
        
        logger.debug(f"Classification saved to database for item {item_id}")
