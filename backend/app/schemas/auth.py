"""Pydantic schemas for authentication and authorization."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    """Credentials for user login."""
    username: str = Field(..., min_length=1, max_length=150)
    password: str = Field(..., min_length=1)


class TokenResponse(BaseModel):
    """JWT access token response."""
    access_token: str
    token_type: str = "bearer"


class APITokenCreate(BaseModel):
    """Request to create a new API token."""
    name: str = Field(..., min_length=1, max_length=255, description="Human-readable token name")


class APITokenResponse(BaseModel):
    """API token details returned after creation."""
    id: UUID
    name: str
    token: str | None = Field(None, description="Only returned on creation")
    created_at: datetime

    model_config = {"from_attributes": True}


class APITokenListItem(BaseModel):
    """API token summary (token value is never exposed after creation)."""
    id: UUID
    name: str
    created_at: datetime

    model_config = {"from_attributes": True}
