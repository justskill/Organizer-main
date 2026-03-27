"""Search service — orchestrates search across items, locations, and tags."""

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories import search_repository


async def global_search(db: AsyncSession, query: str, limit: int = 20) -> dict:
    """Search across items, locations, and tags. Returns grouped results."""
    items = await search_repository.fulltext_search_items(db, query, limit=limit)
    locations = await search_repository.search_locations(db, query, limit=limit)
    tags = await search_repository.search_tags(db, query, limit=limit)

    # Separate containers from regular items
    containers = [i for i in items if i.is_container]
    regular_items = [i for i in items if not i.is_container]

    return {
        "items": regular_items,
        "containers": containers,
        "locations": locations,
        "tags": tags,
    }


async def advanced_search(
    db: AsyncSession,
    *,
    query: str | None = None,
    category_id: UUID | None = None,
    item_type: str | None = None,
    location_id: UUID | None = None,
    tag_ids: list[UUID] | None = None,
    min_quantity: float | None = None,
    max_quantity: float | None = None,
    has_photo: bool | None = None,
    maintenance_due: bool | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict:
    """Structured filter search returning items with total count."""
    items, total = await search_repository.advanced_search_items(
        db,
        query=query,
        category_id=category_id,
        item_type=item_type,
        location_id=location_id,
        tag_ids=tag_ids,
        min_quantity=min_quantity,
        max_quantity=max_quantity,
        has_photo=has_photo,
        maintenance_due=maintenance_due,
        limit=limit,
        offset=offset,
    )
    return {"items": items, "total": total}
