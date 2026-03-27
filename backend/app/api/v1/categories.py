"""Category API endpoints — CRUD with hierarchical support."""

import re
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user, require_role
from app.models.category import ItemCategory, item_category_assignments
from app.models.user import User, UserRole

router = APIRouter(prefix="/categories", tags=["categories"])


# --- Schemas ---

class CategoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    parent_category_id: UUID | None = None
    metadata_schema_json: dict | None = None


class CategoryUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    parent_category_id: UUID | None = None
    metadata_schema_json: dict | None = None


class CategoryResponse(BaseModel):
    id: UUID
    name: str
    slug: str
    description: str | None = None
    parent_category_id: UUID | None = None
    metadata_schema_json: dict | None = None
    children: list["CategoryResponse"] = []
    model_config = {"from_attributes": True}


def _slugify(name: str) -> str:
    slug = name.lower().strip()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[\s_]+", "-", slug)
    return re.sub(r"-+", "-", slug).strip("-")


@router.get("", response_model=list[CategoryResponse])
async def list_categories(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all categories."""
    result = await db.execute(
        select(ItemCategory)
        .options(selectinload(ItemCategory.children))
        .order_by(ItemCategory.name)
    )
    return [CategoryResponse.model_validate(c) for c in result.scalars().all()]


@router.post("", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED)
async def create_category(
    body: CategoryCreate,
    current_user: User = Depends(require_role(UserRole.Admin, UserRole.Editor)),
    db: AsyncSession = Depends(get_db),
):
    """Create a new category."""
    slug = _slugify(body.name)
    # Check slug uniqueness
    existing = await db.execute(select(ItemCategory).where(ItemCategory.slug == slug))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Category slug already exists")

    category = ItemCategory(
        name=body.name,
        slug=slug,
        description=body.description,
        parent_category_id=body.parent_category_id,
        metadata_schema_json=body.metadata_schema_json,
    )
    db.add(category)
    await db.flush()
    await db.refresh(category, attribute_names=["children"])
    return CategoryResponse.model_validate(category)


@router.patch("/{category_id}", response_model=CategoryResponse)
async def update_category(
    category_id: UUID,
    body: CategoryUpdate,
    current_user: User = Depends(require_role(UserRole.Admin, UserRole.Editor)),
    db: AsyncSession = Depends(get_db),
):
    """Update a category."""
    result = await db.execute(
        select(ItemCategory)
        .options(selectinload(ItemCategory.children))
        .where(ItemCategory.id == category_id)
    )
    category = result.scalar_one_or_none()
    if category is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")

    data = body.model_dump(exclude_unset=True)
    if "name" in data:
        data["slug"] = _slugify(data["name"])
    for key, value in data.items():
        setattr(category, key, value)
    await db.flush()
    return CategoryResponse.model_validate(category)


# --- Item-category associations (managed via /items/{item_id}/categories) ---

items_router = APIRouter(tags=["categories"])


class CategoryAssign(BaseModel):
    category_id: UUID


@items_router.post("/items/{item_id}/categories", status_code=status.HTTP_201_CREATED)
async def add_item_category(
    item_id: UUID,
    body: CategoryAssign,
    current_user: User = Depends(require_role(UserRole.Admin, UserRole.Editor)),
    db: AsyncSession = Depends(get_db),
):
    """Associate a category with an item."""
    await db.execute(
        item_category_assignments.insert().values(item_id=item_id, category_id=body.category_id)
    )
    await db.flush()
    return {"status": "ok"}


@items_router.delete("/items/{item_id}/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_item_category(
    item_id: UUID,
    category_id: UUID,
    current_user: User = Depends(require_role(UserRole.Admin, UserRole.Editor)),
    db: AsyncSession = Depends(get_db),
):
    """Remove a category from an item."""
    from sqlalchemy import delete
    await db.execute(
        delete(item_category_assignments).where(
            item_category_assignments.c.item_id == item_id,
            item_category_assignments.c.category_id == category_id,
        )
    )
    await db.flush()
