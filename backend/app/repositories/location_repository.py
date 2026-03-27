"""Location data access layer — CRUD, hierarchy, and contents queries."""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.item import Item
from app.models.location import Location
from app.models.placement import ItemPlacement


async def get_by_id(db: AsyncSession, location_id: uuid.UUID) -> Location | None:
    result = await db.execute(
        select(Location)
        .options(
            selectinload(Location.children).selectinload(Location.tags),
            selectinload(Location.children).selectinload(Location.children),
            selectinload(Location.tags),
        )
        .where(Location.id == location_id)
    )
    return result.scalar_one_or_none()


async def get_by_code(db: AsyncSession, code: str) -> Location | None:
    result = await db.execute(select(Location).where(Location.code == code))
    return result.scalar_one_or_none()


async def list_locations(
    db: AsyncSession,
    *,
    page: int = 1,
    page_size: int = 50,
    root_only: bool = False,
) -> tuple[list[Location], int]:
    base = select(Location).where(Location.archived_at.is_(None))
    if root_only:
        base = base.where(Location.parent_location_id.is_(None))

    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar_one()

    q = (
        base
        .options(selectinload(Location.children), selectinload(Location.tags))
        .order_by(Location.name)
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = (await db.execute(q)).scalars().all()
    return list(rows), total


async def create(db: AsyncSession, location: Location) -> Location:
    db.add(location)
    await db.flush()
    return location


async def update(db: AsyncSession, location: Location, data: dict) -> Location:
    for key, value in data.items():
        setattr(location, key, value)
    await db.flush()
    return location


async def get_contents(
    db: AsyncSession, location_id: uuid.UUID
) -> tuple[list[Item], list[Location]]:
    """Return items placed at this location and direct child locations."""
    # Items with active placement at this location
    item_q = (
        select(Item)
        .join(ItemPlacement, ItemPlacement.item_id == Item.id)
        .where(
            ItemPlacement.location_id == location_id,
            ItemPlacement.removed_at.is_(None),
            Item.archived_at.is_(None),
        )
    )
    items = list((await db.execute(item_q)).scalars().all())

    # Child locations
    child_q = (
        select(Location)
        .options(selectinload(Location.tags), selectinload(Location.children))
        .where(Location.parent_location_id == location_id, Location.archived_at.is_(None))
        .order_by(Location.name)
    )
    children = list((await db.execute(child_q)).scalars().all())

    return items, children


async def get_ancestors(db: AsyncSession, location_id: uuid.UUID) -> list[Location]:
    """Walk parent chain from location up to root. Returns [root, ..., parent]."""
    ancestors: list[Location] = []
    current_id = location_id
    visited: set[uuid.UUID] = set()

    while current_id is not None:
        if current_id in visited:
            break
        visited.add(current_id)
        loc = await get_by_id(db, current_id)
        if loc is None:
            break
        if loc.id != location_id:
            ancestors.append(loc)
        current_id = loc.parent_location_id

    ancestors.reverse()
    return ancestors


async def get_all_descendants(db: AsyncSession, location_id: uuid.UUID) -> list[Location]:
    """Recursively collect all descendant locations."""
    descendants: list[Location] = []
    queue = [location_id]
    visited: set[uuid.UUID] = set()

    while queue:
        current = queue.pop(0)
        if current in visited:
            continue
        visited.add(current)
        child_q = select(Location).where(
            Location.parent_location_id == current,
            Location.archived_at.is_(None),
        )
        children = list((await db.execute(child_q)).scalars().all())
        for child in children:
            descendants.append(child)
            queue.append(child.id)

    return descendants
