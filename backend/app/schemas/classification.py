"""Pydantic schemas for the auto-classification feature."""

from typing import Literal

from pydantic import BaseModel


class ClassificationField(BaseModel):
    """A single inferred field from image classification."""

    field_name: Literal[
        "name", "description", "item_type", "brand",
        "model_number", "part_number", "condition", "is_consumable",
    ]
    value: str
    confidence: Literal["high", "medium", "low"]


class ClassificationResult(BaseModel):
    """Structured response containing all inferred fields."""

    fields: list[ClassificationField]


class ClassificationSettingsRead(BaseModel):
    """Public view of classification settings (never exposes raw API key)."""

    model_config = {"protected_namespaces": ()}

    model_identifier: str
    has_api_key: bool


class ClassificationSettingsUpdate(BaseModel):
    """Payload for updating classification settings."""

    model_config = {"protected_namespaces": ()}

    api_key: str | None = None
    model_identifier: str = "google/gemini-2.5-flash-lite"
