"""Tag API endpoints — CRUD and item/location tag associations."""

import re
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, require_role
from app.models.tag import Tag, item_tags, location_tags
from app.models.user import User, UserRole

router = APIRouter(tags=["tags"])


class TagCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    color: str | None = None


class TagResponse(BaseModel):
    id: UUID
    name: str
    slug: str
    color: str | None = None
    model_config = {"from_attributes": True}


def _slugify(name: str) -> str:
    slug = name.lower().strip()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[\s_]+", "-", slug)
    return re.sub(r"-+", "-", slug).strip("-")


@router.get("/tags", response_model=list[TagResponse])
async def list_tags(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all tags."""
    result = await db.execute(select(Tag).order_by(Tag.name))
    return [TagResponse.model_validate(t) for t in result.scalars().all()]


@router.post("/tags", response_model=TagResponse, status_code=status.HTTP_201_CREATED)
async def create_tag(
    body: TagCreate,
    current_user: User = Depends(require_role(UserRole.Admin, UserRole.Editor)),
    db: AsyncSession = Depends(get_db),
):
    """Create a new tag."""
    slug = _slugify(body.name)
    existing = await db.execute(select(Tag).where(Tag.slug == slug))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Tag slug already exists")
    tag = Tag(name=body.name, slug=slug, color=body.color)
    db.add(tag)
    await db.flush()
    return TagResponse.model_validate(tag)


# --- Item tag associations ---

class TagAssign(BaseModel):
    tag_id: UUID


@router.post("/items/{item_id}/tags", status_code=status.HTTP_201_CREATED)
async def add_item_tag(
    item_id: UUID,
    body: TagAssign,
    current_user: User = Depends(require_role(UserRole.Admin, UserRole.Editor)),
    db: AsyncSession = Depends(get_db),
):
    """Associate a tag with an item."""
    from app.repositories import item_repository
    await item_repository.add_tag(db, item_id, body.tag_id)
    return {"status": "ok"}


@router.delete("/items/{item_id}/tags/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_item_tag(
    item_id: UUID,
    tag_id: UUID,
    current_user: User = Depends(require_role(UserRole.Admin, UserRole.Editor)),
    db: AsyncSession = Depends(get_db),
):
    """Remove a tag from an item."""
    from app.repositories import item_repository
    await item_repository.remove_tag(db, item_id, tag_id)


# --- Location tag associations ---

@router.post("/locations/{location_id}/tags", status_code=status.HTTP_201_CREATED)
async def add_location_tag(
    location_id: UUID,
    body: TagAssign,
    current_user: User = Depends(require_role(UserRole.Admin, UserRole.Editor)),
    db: AsyncSession = Depends(get_db),
):
    """Associate a tag with a location."""
    await db.execute(location_tags.insert().values(location_id=location_id, tag_id=body.tag_id))
    await db.flush()
    return {"status": "ok"}


@router.delete("/locations/{location_id}/tags/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_location_tag(
    location_id: UUID,
    tag_id: UUID,
    current_user: User = Depends(require_role(UserRole.Admin, UserRole.Editor)),
    db: AsyncSession = Depends(get_db),
):
    """Remove a tag from a location."""
    await db.execute(
        delete(location_tags).where(
            location_tags.c.location_id == location_id,
            location_tags.c.tag_id == tag_id,
        )
    )
    await db.flush()
