"""Search API endpoints — global and advanced search."""

from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.services import search_service

router = APIRouter(prefix="/search", tags=["search"])


class SearchItemBrief(BaseModel):
    id: UUID
    code: str
    name: str
    item_type: str
    is_container: bool = False
    brand: str | None = None
    model_number: str | None = None
    tags: list[dict] = []
    model_config = {"from_attributes": True}


class SearchLocationBrief(BaseModel):
    id: UUID
    code: str
    name: str
    path_text: str | None = None
    tags: list[dict] = []
    model_config = {"from_attributes": True}


class SearchTagBrief(BaseModel):
    id: UUID
    name: str
    slug: str
    model_config = {"from_attributes": True}


class GlobalSearchResponse(BaseModel):
    items: list[SearchItemBrief] = []
    containers: list[SearchItemBrief] = []
    locations: list[SearchLocationBrief] = []
    tags: list[SearchTagBrief] = []


def _item_brief(item) -> SearchItemBrief:
    return SearchItemBrief(
        id=item.id,
        code=item.code,
        name=item.name,
        item_type=item.item_type.value if hasattr(item.item_type, "value") else item.item_type,
        is_container=item.is_container,
        brand=item.brand,
        model_number=item.model_number,
        tags=[{"id": str(t.id), "name": t.name, "slug": t.slug} for t in (item.tags or [])],
    )


def _location_brief(loc) -> SearchLocationBrief:
    return SearchLocationBrief(
        id=loc.id,
        code=loc.code,
        name=loc.name,
        path_text=loc.path_text,
        tags=[{"id": str(t.id), "name": t.name, "slug": t.slug} for t in (loc.tags or [])],
    )


@router.get("", response_model=GlobalSearchResponse)
async def global_search(
    q: str = Query(..., min_length=1, max_length=500),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Global search across items, locations, and tags."""
    results = await search_service.global_search(db, q, limit=limit)
    return GlobalSearchResponse(
        items=[_item_brief(i) for i in results["items"]],
        containers=[_item_brief(i) for i in results["containers"]],
        locations=[_location_brief(loc) for loc in results["locations"]],
        tags=[SearchTagBrief.model_validate(t) for t in results["tags"]],
    )


class AdvancedSearchRequest(BaseModel):
    query: str | None = None
    category_id: UUID | None = None
    item_type: str | None = None
    location_id: UUID | None = None
    tag_ids: list[UUID] | None = None
    min_quantity: float | None = None
    max_quantity: float | None = None
    has_photo: bool | None = None
    maintenance_due: bool | None = None
    limit: int = 50
    offset: int = 0


class AdvancedSearchResponse(BaseModel):
    items: list[SearchItemBrief] = []
    total: int = 0


@router.post("/advanced", response_model=AdvancedSearchResponse)
async def advanced_search(
    body: AdvancedSearchRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Structured filter search on items."""
    results = await search_service.advanced_search(
        db,
        query=body.query,
        category_id=body.category_id,
        item_type=body.item_type,
        location_id=body.location_id,
        tag_ids=body.tag_ids,
        min_quantity=body.min_quantity,
        max_quantity=body.max_quantity,
        has_photo=body.has_photo,
        maintenance_due=body.maintenance_due,
        limit=body.limit,
        offset=body.offset,
    )
    return AdvancedSearchResponse(
        items=[_item_brief(i) for i in results["items"]],
        total=results["total"],
    )
