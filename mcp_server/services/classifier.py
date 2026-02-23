"""
Classification Service for AcademiaOps

Uses OpenAI GPT-3.5-turbo to analyze and classify tech watch items.
"""

import logging
import json
import re
from typing import Dict, List, Optional
from datetime import datetime
from openai import AsyncOpenAI

from mcp_server.database import DatabaseManager

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


# ============================================
# Pricing Configuration (as of 2024)
# ============================================

PRICING = {
    "gpt-3.5-turbo": {
        "input": 0.0005 / 1000,   # $0.50 per 1M input tokens
        "output": 0.0015 / 1000,  # $1.50 per 1M output tokens
    },
    "gpt-4-turbo": {
        "input": 0.01 / 1000,     # $10 per 1M input tokens
        "output": 0.03 / 1000,    # $30 per 1M output tokens
    }
}


class ClassifierService:
    """Service for classifying tech watch items using LLM."""
    
    def __init__(
        self,
        openai_api_key: str,
        db_manager: DatabaseManager,
        model: str = "gpt-3.5-turbo",
        temperature: float = 0.3,
        max_tokens: int = 500
    ):
        """
        Initialize ClassifierService.
        
        Args:
            openai_api_key: OpenAI API key
            db_manager: Database manager instance
            model: Model name (default: gpt-3.5-turbo)
            temperature: Sampling temperature (0-2, lower = more deterministic)
            max_tokens: Maximum tokens in response
        """
        self.client = AsyncOpenAI(api_key=openai_api_key)
        self.db = db_manager
        self.model = model
        self.temperature = temperature
        self.max_tokens = max_tokens
        
        logger.info(
            f"ClassifierService initialized",
            extra={"model": model, "temperature": temperature}
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
        response = await self._call_llm(prompt)
        latency_ms = int((datetime.now() - start_time).total_seconds() * 1000)
        
        # 4. Parse and validate response
        classification = self._parse_response(response)
        
        # 5. Calculate cost
        tokens_input = response.get("usage", {}).get("prompt_tokens", 0)
        tokens_output = response.get("usage", {}).get("completion_tokens", 0)
        tokens_total = tokens_input + tokens_output
        cost_usd = self._calculate_cost(tokens_input, tokens_output)
        
        # 6. Save to database
        self._save_classification(item_id, classification, tokens_total, cost_usd)
        
        # 7. Build result
        result = {
            "item_id": item_id,
            "topics": classification["topics"],
            "importance": classification["importance"],
            "item_type": classification["item_type"],
            "reasoning": classification["reasoning"],
            "model": self.model,
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
            item: Item dict with title, summary, source, url
        
        Returns:
            Formatted prompt string
        """
        return CLASSIFICATION_PROMPT_TEMPLATE.format(
            title=item.get("title", "N/A"),
            summary=item.get("summary", "N/A"),
            source=item.get("source", "Unknown"),
            url=item.get("url", "")
        )
    
    async def _call_llm(self, prompt: str) -> Dict:
        """
        Call OpenAI API with error handling.
        
        Args:
            prompt: Classification prompt
        
        Returns:
            API response dict
        
        Raises:
            Exception: If API call fails
        """
        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": "You are a precise AI assistant specialized in classifying technical content. Always respond with valid JSON only, no markdown formatting."
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                temperature=self.temperature,
                max_tokens=self.max_tokens,
                response_format={"type": "json_object"}  # Force JSON output
            )
            
            # Convert to dict
            response_dict = {
                "content": response.choices[0].message.content,
                "usage": {
                    "prompt_tokens": response.usage.prompt_tokens,
                    "completion_tokens": response.usage.completion_tokens,
                    "total_tokens": response.usage.total_tokens
                },
                "model": response.model
            }
            
            logger.debug(f"LLM response received: {response.usage.total_tokens} tokens")
            return response_dict
            
        except Exception as e:
            logger.error(f"LLM API call failed: {e}", exc_info=True)
            raise Exception(f"Failed to call LLM API: {str(e)}")
    
    def _parse_response(self, response: Dict) -> Dict:
        """
        Parse and validate LLM JSON response.
        
        Args:
            response: API response dict
        
        Returns:
            Validated classification dict
        
        Raises:
            ValueError: If response is invalid or malformed
        """
        content = response.get("content", "")
        
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
    
    def _calculate_cost(self, tokens_input: int, tokens_output: int) -> float:
        """
        Calculate API call cost based on token usage.
        
        Args:
            tokens_input: Number of input tokens
            tokens_output: Number of output tokens
        
        Returns:
            Cost in USD
        """
        pricing = PRICING.get(self.model, PRICING["gpt-3.5-turbo"])
        cost = (tokens_input * pricing["input"]) + (tokens_output * pricing["output"])
        return cost
    
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
        # Update item classification
        self.db.update_classification(
            item_id=item_id,
            importance=classification["importance"],
            item_type=classification["item_type"]
        )
        
        # Link topics
        self.db.link_item_to_topics(
            item_id=item_id,
            topic_names=classification["topics"]
        )
        
        # Log decision
        decision_value = {
            "topics": classification["topics"],
            "importance": classification["importance"],
            "item_type": classification["item_type"]
        }
        
        self.db.log_decision(
            item_id=item_id,
            decision_type="classification",
            decision_value=decision_value,
            reasoning=classification["reasoning"],
            model_used=self.model,
            tokens_used=tokens_used,
            cost_usd=cost_usd
        )
        
        logger.debug(f"Classification saved to database for item {item_id}")
