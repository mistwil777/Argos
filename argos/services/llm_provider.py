"""
LLM Provider abstraction for multiple backends (OpenAI, AWS Bedrock, etc.)
"""

import logging
import json
import asyncio
from abc import ABC, abstractmethod
from typing import Dict, Tuple

logger = logging.getLogger(__name__)


class LLMProvider(ABC):
    """Abstract base class for LLM providers."""
    
    @abstractmethod
    async def generate(
        self,
        prompt: str,
        system_prompt: str,
        temperature: float = 0.3,
        max_tokens: int = 1000,
        top_p: float = 0.5
    ) -> Tuple[str, Dict]:
        """
        Generate text from prompt.
        
        Args:
            prompt: User prompt
            system_prompt: System instruction
            temperature: Sampling temperature
            max_tokens: Maximum tokens to generate
            top_p: Nucleus sampling — cumulative probability threshold (0.0–1.0)
        
        Returns:
            Tuple of (generated_text, usage_dict)
            usage_dict contains: prompt_tokens, completion_tokens, total_tokens
        """
        pass
    
    @abstractmethod
    def calculate_cost(self, prompt_tokens: int, completion_tokens: int) -> float:
        """Calculate cost based on token usage."""
        pass


class OpenAIProvider(LLMProvider):
    """OpenAI GPT provider."""
    
    def __init__(self, api_key: str, model: str = "gpt-3.5-turbo"):
        from openai import AsyncOpenAI
        
        self.client = AsyncOpenAI(api_key=api_key)
        self.model = model
        
        # Pricing per 1K tokens (as of 2024)
        self.pricing = {
            "gpt-3.5-turbo": {"input": 0.0005, "output": 0.0015},
            "gpt-4-turbo": {"input": 0.01, "output": 0.03},
            "gpt-4": {"input": 0.03, "output": 0.06}
        }
        
        logger.info(f"OpenAI provider initialized with model {model}")
    
    async def generate(
        self,
        prompt: str,
        system_prompt: str,
        temperature: float = 0.3,
        max_tokens: int = 1000,
        top_p: float = 0.5
    ) -> Tuple[str, Dict]:
        """Generate text using OpenAI API."""
        
        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt}
                ],
                temperature=temperature,
                max_tokens=max_tokens,
                top_p=top_p,
                response_format={"type": "json_object"}
            )
            
            content = response.choices[0].message.content
            usage = {
                "prompt_tokens": response.usage.prompt_tokens,
                "completion_tokens": response.usage.completion_tokens,
                "total_tokens": response.usage.total_tokens
            }
            
            return content, usage
            
        except Exception as e:
            logger.error(f"OpenAI API error: {e}", exc_info=True)
            raise Exception(f"OpenAI generation failed: {str(e)}")
    
    def calculate_cost(self, prompt_tokens: int, completion_tokens: int) -> float:
        """Calculate OpenAI API cost."""
        pricing = self.pricing.get(self.model, self.pricing["gpt-3.5-turbo"])
        cost = (prompt_tokens * pricing["input"] / 1000) + \
               (completion_tokens * pricing["output"] / 1000)
        return cost


class AWSBedrockProvider(LLMProvider):
    """AWS Bedrock provider (Nova Pro, Claude, etc.)."""
    
    def __init__(
        self,
        aws_access_key_id: str,
        aws_secret_access_key: str,
        region: str = "us-east-1",
        model_id: str = "us.amazon.nova-pro-v1:0"
    ):
        import boto3
        
        self.model_id = model_id
        self.client = boto3.client(
            service_name="bedrock-runtime",
            region_name=region,
            aws_access_key_id=aws_access_key_id,
            aws_secret_access_key=aws_secret_access_key
        )
        
        # Pricing per 1K tokens (AWS Nova Pro as of 2024)
        # Note: Pricing varies by model, adjust as needed
        self.pricing = {
            "us.amazon.nova-pro-v1:0": {"input": 0.0008, "output": 0.0032},
            "us.amazon.nova-lite-v1:0": {"input": 0.00006, "output": 0.00024},
            "anthropic.claude-3-sonnet": {"input": 0.003, "output": 0.015},
            "us.anthropic.claude-sonnet-4-20250514-v1:0": {"input": 0.003, "output": 0.015}  # Claude Sonnet 4 via Bedrock
        }
        
        logger.info(f"AWS Bedrock provider initialized with model {model_id} in {region}")
    
    async def generate(
        self,
        prompt: str,
        system_prompt: str,
        temperature: float = 0.3,
        max_tokens: int = 1000,
        top_p: float = 0.5
    ) -> Tuple[str, Dict]:
        """Generate text using AWS Bedrock."""
        
        try:
            # Nova Pro uses a specific request format
            if "nova" in self.model_id.lower():
                request_body = {
                    "messages": [
                        {
                            "role": "user",
                            "content": [
                                {
                                    "text": f"{system_prompt}\n\n{prompt}"
                                }
                            ]
                        }
                    ],
                    "inferenceConfig": {
                        "temperature": temperature,
                        "max_new_tokens": max_tokens,
                        "topP": top_p
                    }
                }
            # Claude format (if using Claude via Bedrock)
            elif "claude" in self.model_id.lower():
                request_body = {
                    "anthropic_version": "bedrock-2023-05-31",
                    "max_tokens": max_tokens,
                    "temperature": temperature,
                    "top_p": top_p,
                    "system": system_prompt,
                    "messages": [
                        {"role": "user", "content": prompt}
                    ]
                }
            else:
                raise ValueError(f"Unsupported Bedrock model: {self.model_id}")
            
            # Call Bedrock (wrap synchronous boto3 call in thread to avoid blocking event loop)
            response = await asyncio.to_thread(
                self.client.invoke_model,
                modelId=self.model_id,
                body=json.dumps(request_body)
            )
            
            # Parse response
            response_body = json.loads(response["body"].read())
            
            # Extract content (format varies by model)
            if "nova" in self.model_id.lower():
                content = response_body["output"]["message"]["content"][0]["text"]
                usage = {
                    "prompt_tokens": response_body.get("usage", {}).get("inputTokens", 0),
                    "completion_tokens": response_body.get("usage", {}).get("outputTokens", 0),
                    "total_tokens": response_body.get("usage", {}).get("totalTokens", 0)
                }
            elif "claude" in self.model_id.lower():
                content = response_body["content"][0]["text"]
                usage = {
                    "prompt_tokens": response_body["usage"]["input_tokens"],
                    "completion_tokens": response_body["usage"]["output_tokens"],
                    "total_tokens": response_body["usage"]["input_tokens"] + response_body["usage"]["output_tokens"]
                }
            else:
                raise ValueError(f"Cannot parse response from {self.model_id}")
            
            return content, usage
            
        except Exception as e:
            logger.error(f"AWS Bedrock error: {e}", exc_info=True)
            raise Exception(f"AWS Bedrock generation failed: {str(e)}")
    
    def calculate_cost(self, prompt_tokens: int, completion_tokens: int) -> float:
        """Calculate AWS Bedrock cost."""
        pricing = self.pricing.get(self.model_id, self.pricing["us.amazon.nova-pro-v1:0"])
        cost = (prompt_tokens * pricing["input"] / 1000) + \
               (completion_tokens * pricing["output"] / 1000)
        return cost


def create_llm_provider(
    provider_type: str,
    openai_api_key: str = None,
    aws_access_key_id: str = None,
    aws_secret_access_key: str = None,
    aws_region: str = "us-east-1",
    model: str = None
) -> LLMProvider:
    """
    Factory function to create LLM provider.
    
    Args:
        provider_type: "openai" or "aws"
        openai_api_key: OpenAI API key (if provider_type="openai")
        aws_access_key_id: AWS access key (if provider_type="aws")
        aws_secret_access_key: AWS secret key (if provider_type="aws")
        aws_region: AWS region (default: us-east-1)
        model: Model identifier
    
    Returns:
        LLMProvider instance
    """
    
    if provider_type == "openai":
        if not openai_api_key:
            raise ValueError("OpenAI API key is required")
        return OpenAIProvider(api_key=openai_api_key, model=model or "gpt-3.5-turbo")
    
    elif provider_type == "aws":
        if not aws_access_key_id or not aws_secret_access_key:
            raise ValueError("AWS credentials are required")
        return AWSBedrockProvider(
            aws_access_key_id=aws_access_key_id,
            aws_secret_access_key=aws_secret_access_key,
            region=aws_region,
            model_id=model or "us.amazon.nova-pro-v1:0"
        )
    
    else:
        raise ValueError(f"Unsupported provider type: {provider_type}")
