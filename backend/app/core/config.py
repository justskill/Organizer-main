"""Application configuration via Pydantic Settings."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Database
    database_url: str = "postgresql+asyncpg://inventory:inventory@localhost:5432/inventory"

    # Security
    secret_key: str = "change-me-in-production"
    access_token_expire_minutes: int = 60 * 24  # 24 hours
    algorithm: str = "HS256"

    # Media storage
    media_path: str = "/data/media"
    labels_path: str = "/data/labels"
    max_upload_size_bytes: int = 50 * 1024 * 1024  # 50 MB

    # CORS
    allowed_origins: list[str] = ["http://localhost:3000", "http://localhost:5173"]

    # Service ports
    api_port: int = 8000
    frontend_port: int = 3000

    # App
    app_name: str = "Inventory Catalog System"
    debug: bool = False

    model_config = {"env_prefix": "INVENTORY_", "env_file": ".env", "extra": "ignore"}


settings = Settings()
