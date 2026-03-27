"""Location service — CRUD, hierarchy management, path computation."""

import re
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.short_code import generate_short_code
from app.models.location import Location
from app.repositories import location_repository
from app.schemas.location import LocationCreate, LocationUpdate
from app.services import audit_service


# ---------------------------------------------------------------------------
# Path computation
# ---------------------------------------------------------------------------

async def compute_path_text(db: AsyncSession, location: Location) -> str:
    """Build path like 'House > Garage > Shelf A > Bin 3'."""
    ancestors = await location_repository.get_ancestors(db, location.id)
    names = [a.name for a in ancestors] + [location.name]
    return " > ".join(names)


def _slugify(name: str) -> str:
    slug = name.lower().strip()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[\s_]+", "-", slug)
    return re.sub(r"-+", "-", slug).strip("-")


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------

async def create_location(
    db: AsyncSession,
    data: LocationCreate,
    user_id: uuid.UUID | None = None,
) -> Location:
    code = await generate_short_code(db, "LOC")

    location = Location(
        code=code,
        name=data.name,
        slug=_slugify(data.name),
        description=data.description,
        parent_location_id=data.parent_location_id,
        location_type=data.location_type,
        notes=data.notes,
    )
    location = await location_repository.create(db, location)
    location.path_text = await compute_path_text(db, location)
    await db.flush()

    await audit_service.record_event(
        db,
        actor_id=user_id,
        entity_type="location",
        entity_id=location.id,
        event_type="created",
        event_data={"name": location.name, "code": location.code},
    )
    await db.refresh(location, attribute_names=["id", "created_at", "updated_at"])
    return location


async def update_location(
    db: AsyncSession,
    location_id: uuid.UUID,
    data: LocationUpdate,
    user_id: uuid.UUID | None = None,
) -> Location | None:
    location = await location_repository.get_by_id(db, location_id)
    if location is None:
        return None

    update_data = data.model_dump(exclude_unset=True)
    if not update_data:
        return location

    # Circular reference detection
    new_parent_id = update_data.get("parent_location_id")
    if new_parent_id is not None:
        await _check_circular_reference(db, location_id, new_parent_id)

    before = {k: getattr(location, k) for k in update_data}

    if "name" in update_data:
        update_data["slug"] = _slugify(update_data["name"])

    location = await location_repository.update(db, location, update_data)

    # Recompute path_text for self and all descendants
    parent_changed = "parent_location_id" in data.model_dump(exclude_unset=True)
    name_changed = "name" in data.model_dump(exclude_unset=True)
    if parent_changed or name_changed:
        await _recompute_paths(db, location)

    await audit_service.record_event(
        db,
        actor_id=user_id,
        entity_type="location",
        entity_id=location.id,
        event_type="updated",
        event_data={"before": _serialize(before), "after": _serialize(update_data)},
    )
    return location


async def get_location(db: AsyncSession, location_id: uuid.UUID) -> Location | None:
    return await location_repository.get_by_id(db, location_id)


async def get_contents(db: AsyncSession, location_id: uuid.UUID):
    """Return (items, child_locations) at this location."""
    return await location_repository.get_contents(db, location_id)


async def get_tree(db: AsyncSession, location_id: uuid.UUID) -> dict:
    """Return recursive subtree rooted at location_id."""
    location = await location_repository.get_by_id(db, location_id)
    if location is None:
        return {}
    return await _build_tree_node(db, location)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _check_circular_reference(
    db: AsyncSession,
    location_id: uuid.UUID,
    new_parent_id: uuid.UUID,
) -> None:
    """Reject if new_parent_id is the location itself or one of its descendants."""
    if new_parent_id == location_id:
        raise ValueError("A location cannot be its own parent")

    descendants = await location_repository.get_all_descendants(db, location_id)
    descendant_ids = {d.id for d in descendants}
    if new_parent_id in descendant_ids:
        raise ValueError("Cannot set parent to a descendant (circular reference)")


async def _recompute_paths(db: AsyncSession, location: Location) -> None:
    """Recompute path_text for location and all descendants."""
    location.path_text = await compute_path_text(db, location)
    await db.flush()

    descendants = await location_repository.get_all_descendants(db, location.id)
    for desc in descendants:
        desc.path_text = await compute_path_text(db, desc)
    await db.flush()


async def _build_tree_node(db: AsyncSession, location: Location) -> dict:
    children_q = await location_repository.get_contents(db, location.id)
    child_locations = children_q[1]

    child_nodes = []
    for child in child_locations:
        child_node = await _build_tree_node(db, child)
        child_nodes.append(child_node)

    return {
        "id": str(location.id),
        "code": location.code,
        "name": location.name,
        "path_text": location.path_text,
        "location_type": location.location_type,
        "children": child_nodes,
    }


def _serialize(data: dict) -> dict:
    out = {}
    for k, v in data.items():
        if hasattr(v, "isoformat"):
            out[k] = v.isoformat()
        elif isinstance(v, uuid.UUID):
            out[k] = str(v)
        else:
            out[k] = v
    return out
