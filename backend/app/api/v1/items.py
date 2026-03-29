"""Item API endpoints — CRUD, movement, stock, history, relationships."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, require_role
from app.models.relationship import ItemRelationship, RelationshipType
from app.models.user import User, UserRole
from app.repositories import item_repository
from app.schemas.item import (
    CategoryBrief,
    DuplicateCandidate,
    ItemCreate,
    ItemCreateResponse,
    ItemListResponse,
    ItemResponse,
    ItemUpdate,
    MediaBrief,
    PlacementBrief,
    TagBrief,
)
from app.schemas.stock import StockAdjustRequest, StockTransactionResponse
from app.services import audit_service, inventory_service, stock_service

router = APIRouter(prefix="/items", tags=["items"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _build_item_response(db: AsyncSession, item) -> ItemResponse:
    """Build a full ItemResponse with placement, tags, and primary photo."""
    placement = await item_repository.get_current_placement(db, item.id)
    placement_brief = None
    if placement:
        loc_name = None
        container_name = None
        if placement.location_id:
            from app.repositories import location_repository
            loc = await location_repository.get_by_id(db, placement.location_id)
            loc_name = loc.name if loc else None
        if placement.parent_item_id:
            container = await item_repository.get_by_id(db, placement.parent_item_id)
            container_name = container.name if container else None
        placement_brief = PlacementBrief(
            id=placement.id,
            location_id=placement.location_id,
            parent_item_id=placement.parent_item_id,
            location_name=loc_name,
            container_name=container_name,
            placed_at=placement.placed_at,
        )

    tags = [TagBrief.model_validate(t) for t in (item.tags or [])]
    cats = [CategoryBrief.model_validate(c) for c in (item.categories or [])]

    primary_photo = None
    all_media = []
    for m in (item.media or []):
        mb = MediaBrief.model_validate(m)
        all_media.append(mb)
        if m.is_primary:
            primary_photo = mb

    return ItemResponse(
        id=item.id,
        code=item.code,
        name=item.name,
        description=item.description,
        item_type=item.item_type,
        is_container=item.is_container,
        is_consumable=item.is_consumable,
        is_serialized=item.is_serialized,
        brand=item.brand,
        model_number=item.model_number,
        part_number=item.part_number,
        serial_number=item.serial_number,
        barcode=item.barcode,
        condition=item.condition,
        status=item.status,
        quantity_mode=item.quantity_mode,
        unit_of_measure=item.unit_of_measure,
        quantity_on_hand=item.quantity_on_hand,
        minimum_quantity=item.minimum_quantity,
        reorder_quantity=item.reorder_quantity,
        purchase_date=item.purchase_date,
        purchase_source=item.purchase_source,
        purchase_price=item.purchase_price,
        warranty_expiration=item.warranty_expiration,
        calibration_due_date=item.calibration_due_date,
        maintenance_due_date=item.maintenance_due_date,
        metadata_json=item.metadata_json,
        notes=item.notes,
        created_by=item.created_by,
        created_at=item.created_at,
        updated_at=item.updated_at,
        archived_at=item.archived_at,
        current_placement=placement_brief,
        tags=tags,
        categories=cats,
        primary_photo=primary_photo,
        media=all_media,
    )


# ---------------------------------------------------------------------------
# CRUD endpoints
# ---------------------------------------------------------------------------

@router.get("", response_model=ItemListResponse)
async def list_items(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    archived: bool = Query(False),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List items with pagination."""
    items, total = await item_repository.list_items(
        db, page=page, page_size=page_size, archived=archived
    )
    item_responses = [await _build_item_response(db, i) for i in items]
    return ItemListResponse(items=item_responses, total=total, page=page, page_size=page_size)


@router.post("", response_model=ItemCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_item(
    body: ItemCreate,
    current_user: User = Depends(require_role(UserRole.Admin, UserRole.Editor)),
    db: AsyncSession = Depends(get_db),
):
    """Create a new item. Returns duplicate candidates if any."""
    item, duplicates = await inventory_service.create_item(db, body, user_id=current_user.id)
    # Re-fetch with eager-loaded relationships (tags, media) to avoid lazy load in async
    item = await item_repository.get_by_id(db, item.id)
    item_resp = await _build_item_response(db, item)
    dup_list = [DuplicateCandidate.model_validate(d) for d in duplicates]
    return ItemCreateResponse(item=item_resp, duplicate_candidates=dup_list)


@router.get("/{item_id}", response_model=ItemResponse)
async def get_item(
    item_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get full item detail by ID."""
    item = await inventory_service.get_item(db, item_id)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    return await _build_item_response(db, item)


class ContainerItemBrief(BaseModel):
    id: UUID
    code: str
    name: str
    item_type: str
    is_container: bool = False


@router.get("/{item_id}/contents", response_model=list[ContainerItemBrief])
async def get_container_contents(
    item_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List items currently placed inside a container item."""
    item = await inventory_service.get_item(db, item_id)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    if not item.is_container:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Item is not a container")
    items = await item_repository.get_contained_items(db, item_id)
    return [
        ContainerItemBrief(
            id=i.id,
            code=i.code,
            name=i.name,
            item_type=i.item_type.value if hasattr(i.item_type, "value") else i.item_type,
            is_container=i.is_container,
        )
        for i in items
    ]


@router.patch("/{item_id}", response_model=ItemResponse)
async def update_item(
    item_id: UUID,
    body: ItemUpdate,
    current_user: User = Depends(require_role(UserRole.Admin, UserRole.Editor)),
    db: AsyncSession = Depends(get_db),
):
    """Partially update an item."""
    item = await inventory_service.update_item(db, item_id, body, user_id=current_user.id)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    # Re-fetch with eager-loaded relationships
    item = await item_repository.get_by_id(db, item.id)
    return await _build_item_response(db, item)


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_item(
    item_id: UUID,
    current_user: User = Depends(require_role(UserRole.Admin, UserRole.Editor)),
    db: AsyncSession = Depends(get_db),
):
    """Delete an item (hard delete with cascade)."""
    deleted = await inventory_service.delete_item(db, item_id, user_id=current_user.id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")


# ---------------------------------------------------------------------------
# Movement
# ---------------------------------------------------------------------------


class MoveItemRequest(BaseModel):
    location_id: UUID | None = None
    container_id: UUID | None = None
    note: str | None = None


class PlacementResponse(BaseModel):
    id: UUID
    item_id: UUID
    location_id: UUID | None = None
    parent_item_id: UUID | None = None
    placed_at: str
    removed_at: str | None = None
    note: str | None = None
    model_config = {"from_attributes": True}


@router.post("/{item_id}/move", response_model=PlacementResponse)
async def move_item(
    item_id: UUID,
    body: MoveItemRequest,
    current_user: User = Depends(require_role(UserRole.Admin, UserRole.Editor)),
    db: AsyncSession = Depends(get_db),
):
    """Move an item to a new location or container."""
    try:
        placement = await inventory_service.move_item(
            db,
            item_id,
            location_id=body.location_id,
            container_id=body.container_id,
            user_id=current_user.id,
            note=body.note,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return PlacementResponse(
        id=placement.id,
        item_id=placement.item_id,
        location_id=placement.location_id,
        parent_item_id=placement.parent_item_id,
        placed_at=placement.placed_at.isoformat(),
        removed_at=placement.removed_at.isoformat() if placement.removed_at else None,
        note=placement.note,
    )


# ---------------------------------------------------------------------------
# Stock adjustment
# ---------------------------------------------------------------------------

@router.post("/{item_id}/adjust-stock", response_model=StockTransactionResponse)
async def adjust_stock(
    item_id: UUID,
    body: StockAdjustRequest,
    current_user: User = Depends(require_role(UserRole.Admin, UserRole.Editor)),
    db: AsyncSession = Depends(get_db),
):
    """Record a stock adjustment for an item."""
    try:
        txn = await stock_service.adjust_stock(
            db,
            item_id=item_id,
            transaction_type=body.transaction_type,
            quantity_delta=body.quantity_delta,
            user_id=current_user.id,
            reason=body.reason,
            reference=body.reference,
            unit_of_measure=body.unit_of_measure,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return StockTransactionResponse.model_validate(txn)


# ---------------------------------------------------------------------------
# History (audit events)
# ---------------------------------------------------------------------------

class AuditEventResponse(BaseModel):
    id: UUID
    actor_user_id: UUID | None = None
    entity_type: str
    entity_id: UUID
    event_type: str
    event_data_json: dict | None = None
    created_at: str
    model_config = {"from_attributes": True}


@router.get("/{item_id}/history", response_model=list[AuditEventResponse])
async def get_item_history(
    item_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get audit history for an item."""
    from sqlalchemy import select
    from app.models.audit import AuditEvent

    result = await db.execute(
        select(AuditEvent)
        .where(AuditEvent.entity_type == "item", AuditEvent.entity_id == item_id)
        .order_by(AuditEvent.created_at.desc())
    )
    events = result.scalars().all()
    return [
        AuditEventResponse(
            id=e.id,
            actor_user_id=e.actor_user_id,
            entity_type=e.entity_type,
            entity_id=e.entity_id,
            event_type=e.event_type,
            event_data_json=e.event_data_json,
            created_at=e.created_at.isoformat(),
        )
        for e in events
    ]


# ---------------------------------------------------------------------------
# Relationships
# ---------------------------------------------------------------------------

class RelationshipCreate(BaseModel):
    target_item_id: UUID
    relationship_type: RelationshipType
    note: str | None = None


class RelationshipResponse(BaseModel):
    id: UUID
    source_item_id: UUID
    target_item_id: UUID
    relationship_type: RelationshipType
    note: str | None = None
    created_at: str
    model_config = {"from_attributes": True}


@router.get("/{item_id}/relationships", response_model=list[RelationshipResponse])
async def get_relationships(
    item_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all relationships where item is source or target."""
    rels = await item_repository.get_relationships(db, item_id)
    return [
        RelationshipResponse(
            id=r.id,
            source_item_id=r.source_item_id,
            target_item_id=r.target_item_id,
            relationship_type=r.relationship_type,
            note=r.note,
            created_at=r.created_at.isoformat(),
        )
        for r in rels
    ]


@router.post(
    "/{item_id}/relationships",
    response_model=RelationshipResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_relationship(
    item_id: UUID,
    body: RelationshipCreate,
    current_user: User = Depends(require_role(UserRole.Admin, UserRole.Editor)),
    db: AsyncSession = Depends(get_db),
):
    """Create a relationship from this item to another."""
    rel = ItemRelationship(
        source_item_id=item_id,
        target_item_id=body.target_item_id,
        relationship_type=body.relationship_type,
        note=body.note,
    )
    rel = await item_repository.create_relationship(db, rel)
    return RelationshipResponse(
        id=rel.id,
        source_item_id=rel.source_item_id,
        target_item_id=rel.target_item_id,
        relationship_type=rel.relationship_type,
        note=rel.note,
        created_at=rel.created_at.isoformat(),
    )


# ---------------------------------------------------------------------------
# Merge (duplicate resolution)
# ---------------------------------------------------------------------------

class MergeRequest(BaseModel):
    source_item_id: UUID


@router.post("/{item_id}/merge", response_model=ItemResponse)
async def merge_items(
    item_id: UUID,
    body: MergeRequest,
    current_user: User = Depends(require_role(UserRole.Admin, UserRole.Editor)),
    db: AsyncSession = Depends(get_db),
):
    """Merge source item into target item (this item). Archives source."""
    from datetime import datetime, timezone
    from sqlalchemy import select, update as sa_update
    from app.models.placement import ItemPlacement
    from app.models.media import MediaAsset
    from app.models.tag import item_tags as item_tags_table
    from app.models.audit import AuditEvent

    target = await item_repository.get_by_id(db, item_id)
    source = await item_repository.get_by_id(db, body.source_item_id)
    if target is None or source is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    if item_id == body.source_item_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot merge item with itself")

    # Move placements from source to target
    await db.execute(
        sa_update(ItemPlacement)
        .where(ItemPlacement.item_id == body.source_item_id)
        .values(item_id=item_id)
    )

    # Move media from source to target
    await db.execute(
        sa_update(MediaAsset)
        .where(MediaAsset.owner_type == "item", MediaAsset.owner_id == body.source_item_id)
        .values(owner_id=item_id)
    )

    # Copy tags (skip duplicates)
    source_tags = await db.execute(
        select(item_tags_table.c.tag_id).where(item_tags_table.c.item_id == body.source_item_id)
    )
    target_tags = await db.execute(
        select(item_tags_table.c.tag_id).where(item_tags_table.c.item_id == item_id)
    )
    existing_tag_ids = {row[0] for row in target_tags.all()}
    for row in source_tags.all():
        if row[0] not in existing_tag_ids:
            await db.execute(item_tags_table.insert().values(item_id=item_id, tag_id=row[0]))

    # Move relationships
    from app.models.relationship import ItemRelationship as IR
    await db.execute(
        sa_update(IR).where(IR.source_item_id == body.source_item_id).values(source_item_id=item_id)
    )
    await db.execute(
        sa_update(IR).where(IR.target_item_id == body.source_item_id).values(target_item_id=item_id)
    )

    # Move audit history
    await db.execute(
        sa_update(AuditEvent)
        .where(AuditEvent.entity_type == "item", AuditEvent.entity_id == body.source_item_id)
        .values(entity_id=item_id)
    )

    # Archive source
    source.archived_at = datetime.now(timezone.utc)
    await db.flush()

    # Record merge audit event
    await audit_service.record_event(
        db,
        actor_id=current_user.id,
        entity_type="item",
        entity_id=item_id,
        event_type="merged",
        event_data={"source_item_id": str(body.source_item_id), "source_code": source.code},
    )

    target = await item_repository.get_by_id(db, item_id)
    return await _build_item_response(db, target)
