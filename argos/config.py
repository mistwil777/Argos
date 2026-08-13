"""
Configuration management for Argos Server
Uses pydantic-settings for environment variable validation
"""

from pydantic_settings import BaseSettings
from pydantic import Field, PostgresDsn, AliasChoices
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
        default="postgresql://argos:password@localhost:5432/argos",
        validation_alias=AliasChoices('database_url', 'DATABASE_URL', 'POSTGRES_URL'),
        description="PostgreSQL connection URL"
    )
    
    # ============================================
    # Vector Database
    # ============================================
    lancedb_path: str = Field(
        default="./data/lancedb",
        description="Path to LanceDB data directory"
    )
    
    embedding_provider: Literal["sentence-transformers", "bedrock"] = Field(
        default="bedrock",
        description="Embedding provider to use (sentence-transformers or bedrock)"
    )
    
    embedding_model: str = Field(
        default="sentence-transformers/all-MiniLM-L6-v2",
        description="Sentence transformer model for embeddings (only used if embedding_provider=sentence-transformers)"
    )
    
    embedding_dimension: int = Field(
        default=1024,
        description="Dimension of embedding vectors (384 for MiniLM, 1024 for Titan)"
    )
    
    bedrock_embedding_dimensions: int = Field(
        default=1024,
        description="Dimensions for Bedrock Titan Embeddings V2 (256, 512, or 1024)"
    )
    
    bedrock_embedding_normalize: bool = Field(
        default=True,
        description="Normalize Bedrock embeddings"
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

    searxng_url: str = Field(
        default="http://searxng:8080",
        description="URL of the local SearXNG instance"
    )
    
    # ============================================
    # Email SMTP (notifications)
    # ============================================
    smtp_host: str | None = Field(
        default=None,
        description="SMTP server hostname (ex: smtp.office365.com)"
    )
    smtp_port: int = Field(
        default=587,
        description="SMTP server port (587 pour STARTTLS)"
    )
    smtp_user: str | None = Field(
        default=None,
        description="Adresse email expéditeur (ex: argos@capgemini.com)"
    )
    smtp_password: str | None = Field(
        default=None,
        description="Mot de passe SMTP"
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
        description="Admin Telegram chat ID for notifications",
        validation_alias=AliasChoices('telegram_admin_chat_id', 'telegram_chat_id')
    )
    
    telegram_webhook_url: str | None = Field(
        default=None,
        description="Public webhook URL for Telegram callbacks (optional, for production)"
    )
    
    # ============================================
    # Argos Server
    # ============================================
    mcp_server_host: str = Field(
        default="0.0.0.0",
        description="Server host"
    )

    mcp_server_port: int = Field(
        default=8000,
        description="Server port"
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
    
    # ============================================
    # Admin
    # ============================================
    admin_token: str = Field(
        default="",
        description="Secret token for admin-only endpoints (set ADMIN_TOKEN env var)"
    )

    # ============================================
    # JWT Auth
    # ============================================
    jwt_secret: str = Field(
        default="change-me-in-production-32-chars-min",
        description="Secret key for JWT token signing (set JWT_SECRET env var)"
    )
    jwt_expire_minutes: int = Field(
        default=10080,  # 7 jours
        description="JWT token expiry in minutes"
    )

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False
        extra = "ignore"  # Ignore extra environment variables (e.g., POSTGRES_* used by Docker Compose)


# Global settings instance
settings = Settings()
