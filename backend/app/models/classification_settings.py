"""ClassificationSettings model — singleton row for OpenRouter configuration."""

from datetime import datetime

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UUIDMixin


class ClassificationSettings(Base, UUIDMixin):
    """Stores encrypted OpenRouter API key and model identifier (singleton)."""

    __tablename__ = "classification_settings"

    api_key_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    model_identifier: Mapped[str] = mapped_column(
        String(255), nullable=False, default="google/gemini-2.5-flash-lite"
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
