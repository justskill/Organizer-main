"""Saved views API endpoints — CRUD for persisted search filters."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.saved_view import SavedView
from app.models.user import User

router = APIRouter(prefix="/saved-views", tags=["saved-views"])


class SavedViewCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    entity_type: str | None = None
    filter_json: dict | None = None


class SavedViewUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    entity_type: str | None = None
    filter_json: dict | None = None


class SavedViewResponse(BaseModel):
    id: UUID
    user_id: UUID
    name: str
    entity_type: str | None = None
    filter_json: dict | None = None
    model_config = {"from_attributes": True}


@router.get("", response_model=list[SavedViewResponse])
async def list_saved_views(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List saved views for the current user."""
    result = await db.execute(
        select(SavedView)
        .where(SavedView.user_id == current_user.id)
        .order_by(SavedView.created_at.desc())
    )
    return [SavedViewResponse.model_validate(v) for v in result.scalars().all()]


@router.post("", response_model=SavedViewResponse, status_code=status.HTTP_201_CREATED)
async def create_saved_view(
    body: SavedViewCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new saved view."""
    view = SavedView(
        user_id=current_user.id,
        name=body.name,
        entity_type=body.entity_type,
        filter_json=body.filter_json,
    )
    db.add(view)
    await db.flush()
    return SavedViewResponse.model_validate(view)


@router.patch("/{view_id}", response_model=SavedViewResponse)
async def update_saved_view(
    view_id: UUID,
    body: SavedViewUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a saved view."""
    result = await db.execute(
        select(SavedView).where(SavedView.id == view_id, SavedView.user_id == current_user.id)
    )
    view = result.scalar_one_or_none()
    if view is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Saved view not found")

    data = body.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(view, key, value)
    await db.flush()
    return SavedViewResponse.model_validate(view)


@router.delete("/{view_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_saved_view(
    view_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a saved view."""
    result = await db.execute(
        select(SavedView).where(SavedView.id == view_id, SavedView.user_id == current_user.id)
    )
    view = result.scalar_one_or_none()
    if view is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Saved view not found")
    await db.delete(view)
    await db.flush()
