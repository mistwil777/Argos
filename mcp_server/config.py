"""
Configuration management for AcademiaOps MCP Server
Uses pydantic-settings for environment variable validation
"""

from pydantic_settings import BaseSettings
from pydantic import Field, PostgresDsn
from typing import Literal


class Settings(BaseSettings):
    """
    Application settings loaded from environment variables.
    See .env.example for all available settings.
    """
    
    # ============================================
    # Environment
    # ============================================
    environment: Literal["development", "production"] = Field(
        default="development",
        description="Runtime environment"
    )
    
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = Field(
        default="INFO",
        description="Logging level"
    )
    
    # ============================================
    # Database
    # ============================================
    database_url: str = Field(
        default="postgresql://academiaops_user:dev_password_change_me@localhost:5432/academiaops",
        description="PostgreSQL connection URL"
    )
    
    # ============================================
    # Vector Database
    # ============================================
    lancedb_path: str = Field(
        default="/data/lancedb",
        description="Path to LanceDB data directory"
    )
    
    embedding_model: str = Field(
        default="sentence-transformers/all-MiniLM-L6-v2",
        description="Sentence transformer model for embeddings"
    )
    
    embedding_dimension: int = Field(
        default=384,
        description="Dimension of embedding vectors"
    )
    
    # ============================================
    # LLM API Keys
    # ============================================
    llm_provider: Literal["aws", "openai", "anthropic"] = Field(
        default="openai",
        description="LLM provider to use (aws, openai, anthropic)"
    )
    
    openai_api_key: str | None = Field(
        default=None,
        description="OpenAI API key"
    )
    
    anthropic_api_key: str | None = Field(
        default=None,
        description="Anthropic API key"
    )
    
    # AWS Bedrock
    aws_access_key_id: str | None = Field(
        default=None,
        description="AWS Access Key ID for Bedrock"
    )
    
    aws_secret_access_key: str | None = Field(
        default=None,
        description="AWS Secret Access Key for Bedrock"
    )
    
    aws_region: str = Field(
        default="us-east-1",
        description="AWS region for Bedrock"
    )
    
    aws_bedrock_model: str = Field(
        default="us.amazon.nova-pro-v1:0",
        description="AWS Bedrock model ID"
    )
    
    default_classification_model: str = Field(
        default="gpt-3.5-turbo",
        description="Default model for classification"
    )
    
    # ============================================
    # Telegram Bot (HITL)
    # ============================================
    telegram_bot_token: str | None = Field(
        default=None,
        description="Telegram Bot API token from @BotFather"
    )
    
    telegram_admin_chat_id: str | None = Field(
        default=None,
        description="Admin Telegram chat ID for notifications"
    )
    
    telegram_webhook_url: str | None = Field(
        default=None,
        description="Public webhook URL for Telegram callbacks (optional, for production)"
    )
    
    # ============================================
    # MCP Server
    # ============================================
    mcp_server_host: str = Field(
        default="0.0.0.0",
        description="MCP server host"
    )
    
    mcp_server_port: int = Field(
        default=8000,
        description="MCP server port"
    )
    
    # ============================================
    # Rate Limiting
    # ============================================
    max_requests_per_minute: int = Field(
        default=60,
        description="Max API requests per minute"
    )
    
    # ============================================
    # Costs (for tracking)
    # ============================================
    openai_gpt35_input_price_per_1k: float = Field(
        default=0.0015,
        description="GPT-3.5-turbo input cost per 1k tokens (USD)"
    )
    
    openai_gpt35_output_price_per_1k: float = Field(
        default=0.002,
        description="GPT-3.5-turbo output cost per 1k tokens (USD)"
    )
    
    anthropic_sonnet_input_price_per_1k: float = Field(
        default=0.003,
        description="Claude Sonnet input cost per 1k tokens (USD)"
    )
    
    anthropic_sonnet_output_price_per_1k: float = Field(
        default=0.015,
        description="Claude Sonnet output cost per 1k tokens (USD)"
    )
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False
        extra = "ignore"  # Ignore extra environment variables (e.g., POSTGRES_* used by Docker Compose)


# Global settings instance
settings = Settings()
