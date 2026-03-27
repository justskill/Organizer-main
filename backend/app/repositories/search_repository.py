"""Search data access layer — full-text, trigram fuzzy, and structured filter queries."""

from uuid import UUID

from sqlalchemy import and_, func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.item import Item
from app.models.location import Location
from app.models.placement import ItemPlacement
from app.models.tag import Tag


async def fulltext_search_items(
    db: AsyncSession,
    query: str,
    *,
    limit: int = 20,
) -> list[Item]:
    """Full-text search on items using tsvector + trigram fallback."""
    ts_query = func.plainto_tsquery("english", query)
    # Full-text match
    fts_condition = Item.search_vector.op("@@")(ts_query)
    # Trigram similarity fallback
    trgm_condition = func.similarity(Item.name, query) > 0.2

    stmt = (
        select(Item)
        .options(selectinload(Item.tags))
        .where(and_(Item.archived_at.is_(None), or_(fts_condition, trgm_condition)))
        .order_by(func.ts_rank(Item.search_vector, ts_query).desc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def search_locations(
    db: AsyncSession,
    query: str,
    *,
    limit: int = 20,
) -> list[Location]:
    """Search locations by name (trigram similarity)."""
    stmt = (
        select(Location)
        .options(selectinload(Location.tags))
        .where(
            and_(
                Location.archived_at.is_(None),
                func.similarity(Location.name, query) > 0.2,
            )
        )
        .order_by(func.similarity(Location.name, query).desc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def search_tags(
    db: AsyncSession,
    query: str,
    *,
    limit: int = 20,
) -> list[Tag]:
    """Search tags by name."""
    stmt = (
        select(Tag)
        .where(Tag.name.ilike(f"%{query}%"))
        .order_by(Tag.name)
        .limit(limit)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def advanced_search_items(
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
) -> tuple[list[Item], int]:
    """Structured filter search on items."""
    conditions = [Item.archived_at.is_(None)]

    if query:
        ts_query = func.plainto_tsquery("english", query)
        conditions.append(
            or_(
                Item.search_vector.op("@@")(ts_query),
                func.similarity(Item.name, query) > 0.2,
            )
        )
    if category_id:
        pass  # Applied after base is created below
    if item_type:
        conditions.append(Item.item_type == item_type)
    if min_quantity is not None:
        conditions.append(Item.quantity_on_hand >= min_quantity)
    if max_quantity is not None:
        conditions.append(Item.quantity_on_hand <= max_quantity)
    if maintenance_due:
        conditions.append(
            or_(
                Item.maintenance_due_date.isnot(None),
                Item.calibration_due_date.isnot(None),
            )
        )

    base = select(Item).where(and_(*conditions))

    # Category filter via junction table
    if category_id:
        from app.models.category import item_category_assignments
        base = base.join(
            item_category_assignments, item_category_assignments.c.item_id == Item.id
        ).where(item_category_assignments.c.category_id == category_id)

    # Location subtree filter via placement
    if location_id:
        base = base.join(
            ItemPlacement,
            and_(
                ItemPlacement.item_id == Item.id,
                ItemPlacement.removed_at.is_(None),
                ItemPlacement.location_id == location_id,
            ),
        )

    # Tag filter
    if tag_ids:
        from app.models.tag import item_tags
        base = base.join(item_tags, item_tags.c.item_id == Item.id).where(
            item_tags.c.tag_id.in_(tag_ids)
        )

    # has_photo filter
    if has_photo is not None:
        from app.models.media import MediaAsset
        if has_photo:
            base = base.where(
                Item.id.in_(
                    select(MediaAsset.owner_id).where(
                        MediaAsset.owner_type == "item",
                        MediaAsset.is_primary == True,
                    )
                )
            )
        else:
            base = base.where(
                ~Item.id.in_(
                    select(MediaAsset.owner_id).where(
                        MediaAsset.owner_type == "item",
                        MediaAsset.is_primary == True,
                    )
                )
            )

    count_q = select(func.count()).select_from(base.subquery())
    total = (await db.execute(count_q)).scalar_one()

    items_q = (
        base.options(selectinload(Item.tags))
        .order_by(Item.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    rows = (await db.execute(items_q)).scalars().all()
    return list(rows), total
