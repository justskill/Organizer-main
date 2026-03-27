"""Export and import API endpoints — JSON export, CSV export/import, full backup."""

import csv
import io
import json
import zipfile
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import require_role
from app.models.audit import AuditEvent
from app.models.item import Item
from app.models.label import LabelRecord
from app.models.location import Location
from app.models.media import MediaAsset
from app.models.placement import ItemPlacement
from app.models.relationship import ItemRelationship
from app.models.saved_view import SavedView
from app.models.stock import StockTransaction
from app.models.tag import Tag, item_tags, location_tags
from app.models.user import User, UserRole
from app.schemas.item import ItemCreate
from app.services import inventory_service

router = APIRouter(tags=["export"])


def _serialize_value(v):
    """Convert non-JSON-serializable values."""
    if v is None:
        return None
    if hasattr(v, "isoformat"):
        return v.isoformat()
    if hasattr(v, "value"):
        return v.value
    if isinstance(v, UUID):
        return str(v)
    return v


@router.post("/export/json")
async def export_json(
    current_user: User = Depends(require_role(UserRole.Admin, UserRole.Editor)),
    db: AsyncSession = Depends(get_db),
):
    """Full-fidelity JSON export of items, locations, placements, tags, relationships."""
    items = (await db.execute(select(Item).options(selectinload(Item.tags)))).scalars().all()
    locations = (await db.execute(select(Location).options(selectinload(Location.tags)))).scalars().all()
    placements = (await db.execute(select(ItemPlacement))).scalars().all()
    tags = (await db.execute(select(Tag))).scalars().all()
    relationships = (await db.execute(select(ItemRelationship))).scalars().all()

    def _item_dict(item):
        return {
            "id": str(item.id), "code": item.code, "name": item.name,
            "description": item.description, "item_type": _serialize_value(item.item_type),
            "is_container": item.is_container, "is_consumable": item.is_consumable,
            "brand": item.brand, "model_number": item.model_number,
            "part_number": item.part_number, "serial_number": item.serial_number,
            "quantity_on_hand": str(item.quantity_on_hand) if item.quantity_on_hand else None,
            "notes": item.notes,
            "tags": [{"id": str(t.id), "name": t.name} for t in item.tags],
            "created_at": _serialize_value(item.created_at),
        }

    def _loc_dict(loc):
        return {
            "id": str(loc.id), "code": loc.code, "name": loc.name,
            "path_text": loc.path_text,
            "parent_location_id": str(loc.parent_location_id) if loc.parent_location_id else None,
            "tags": [{"id": str(t.id), "name": t.name} for t in loc.tags],
        }

    data = {
        "items": [_item_dict(i) for i in items],
        "locations": [_loc_dict(l) for l in locations],
        "placements": [
            {"item_id": str(p.item_id), "location_id": str(p.location_id) if p.location_id else None,
             "parent_item_id": str(p.parent_item_id) if p.parent_item_id else None,
             "placed_at": _serialize_value(p.placed_at), "removed_at": _serialize_value(p.removed_at)}
            for p in placements
        ],
        "tags": [{"id": str(t.id), "name": t.name, "slug": t.slug, "color": t.color} for t in tags],
        "relationships": [
            {"source_item_id": str(r.source_item_id), "target_item_id": str(r.target_item_id),
             "relationship_type": _serialize_value(r.relationship_type), "note": r.note}
            for r in relationships
        ],
    }

    content = json.dumps(data, indent=2)
    return Response(
        content=content,
        media_type="application/json",
        headers={"Content-Disposition": 'attachment; filename="inventory-export.json"'},
    )


@router.post("/export/csv")
async def export_csv(
    current_user: User = Depends(require_role(UserRole.Admin, UserRole.Editor)),
    db: AsyncSession = Depends(get_db),
):
    """CSV export of item records with core fields."""
    items = (await db.execute(select(Item).order_by(Item.created_at.desc()))).scalars().all()

    output = io.StringIO()
    writer = csv.writer(output)
    headers = [
        "code", "name", "item_type", "brand", "model_number", "part_number",
        "serial_number", "quantity_on_hand", "unit_of_measure", "condition",
        "status", "notes",
    ]
    writer.writerow(headers)
    for item in items:
        writer.writerow([
            item.code, item.name, _serialize_value(item.item_type),
            item.brand, item.model_number, item.part_number,
            item.serial_number, str(item.quantity_on_hand) if item.quantity_on_hand else "",
            item.unit_of_measure, _serialize_value(item.condition),
            item.status, item.notes,
        ])

    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="inventory-export.csv"'},
    )


class ImportSummary(BaseModel):
    created: int = 0
    skipped: int = 0
    errors: list[dict] = []


@router.post("/import/csv", response_model=ImportSummary)
async def import_csv(
    file: UploadFile = File(...),
    current_user: User = Depends(require_role(UserRole.Admin, UserRole.Editor)),
    db: AsyncSession = Depends(get_db),
):
    """Import items from a CSV file. Skips invalid rows."""
    content = (await file.read()).decode("utf-8")
    reader = csv.DictReader(io.StringIO(content))

    created = 0
    skipped = 0
    errors = []

    for row_num, row in enumerate(reader, start=2):
        try:
            name = row.get("name", "").strip()
            item_type = row.get("item_type", "").strip()
            if not name:
                errors.append({"row": row_num, "error": "Missing required field: name"})
                skipped += 1
                continue
            if not item_type:
                errors.append({"row": row_num, "error": "Missing required field: item_type"})
                skipped += 1
                continue

            item_data = ItemCreate(
                name=name,
                item_type=item_type,
                brand=row.get("brand") or None,
                model_number=row.get("model_number") or None,
                part_number=row.get("part_number") or None,
                serial_number=row.get("serial_number") or None,
                unit_of_measure=row.get("unit_of_measure") or None,
                notes=row.get("notes") or None,
            )
            await inventory_service.create_item(db, item_data, user_id=current_user.id)
            created += 1
        except Exception as e:
            errors.append({"row": row_num, "error": str(e)})
            skipped += 1

    return ImportSummary(created=created, skipped=skipped, errors=errors)


@router.post("/export/full")
async def export_full_backup(
    current_user: User = Depends(require_role(UserRole.Admin)),
    db: AsyncSession = Depends(get_db),
):
    """Generate a ZIP bundle containing full JSON data export and media file references.

    The ZIP contains:
    - data.json: Full-fidelity JSON export of all entities
    - media/: Copies of all media files stored on disk
    - RESTORE.md: Documentation for the restore procedure
    """
    items = (await db.execute(select(Item).options(selectinload(Item.tags)))).scalars().all()
    locations = (await db.execute(select(Location).options(selectinload(Location.tags)))).scalars().all()
    placements = (await db.execute(select(ItemPlacement))).scalars().all()
    tags = (await db.execute(select(Tag))).scalars().all()
    relationships = (await db.execute(select(ItemRelationship))).scalars().all()
    stock_txns = (await db.execute(select(StockTransaction))).scalars().all()
    media_assets = (await db.execute(select(MediaAsset))).scalars().all()
    audit_events = (await db.execute(select(AuditEvent))).scalars().all()
    label_records = (await db.execute(select(LabelRecord))).scalars().all()
    saved_views = (await db.execute(select(SavedView))).scalars().all()

    # Build comprehensive data dict
    data = {
        "export_version": "1.0",
        "items": [
            {
                "id": str(i.id), "code": i.code, "name": i.name,
                "description": i.description,
                "item_type": _serialize_value(i.item_type),
                "is_container": i.is_container, "is_consumable": i.is_consumable,
                "is_serialized": i.is_serialized,
                "brand": i.brand, "model_number": i.model_number,
                "part_number": i.part_number, "serial_number": i.serial_number,
                "condition": _serialize_value(i.condition), "status": i.status,
                "quantity_mode": i.quantity_mode, "unit_of_measure": i.unit_of_measure,
                "quantity_on_hand": str(i.quantity_on_hand) if i.quantity_on_hand is not None else None,
                "minimum_quantity": str(i.minimum_quantity) if i.minimum_quantity is not None else None,
                "reorder_quantity": str(i.reorder_quantity) if i.reorder_quantity is not None else None,
                "purchase_date": _serialize_value(i.purchase_date),
                "purchase_source": i.purchase_source,
                "purchase_price": str(i.purchase_price) if i.purchase_price is not None else None,
                "warranty_expiration": _serialize_value(i.warranty_expiration),
                "calibration_due_date": _serialize_value(i.calibration_due_date),
                "maintenance_due_date": _serialize_value(i.maintenance_due_date),
                "metadata_json": i.metadata_json, "notes": i.notes,
                "created_by": str(i.created_by) if i.created_by else None,
                "created_at": _serialize_value(i.created_at),
                "updated_at": _serialize_value(i.updated_at),
                "archived_at": _serialize_value(i.archived_at),
                "tags": [{"id": str(t.id), "name": t.name} for t in i.tags],
            }
            for i in items
        ],
        "locations": [
            {
                "id": str(l.id), "code": l.code, "name": l.name,
                "slug": l.slug, "description": l.description,
                "parent_location_id": str(l.parent_location_id) if l.parent_location_id else None,
                "path_text": l.path_text, "location_type": l.location_type,
                "notes": l.notes,
                "created_at": _serialize_value(l.created_at),
                "updated_at": _serialize_value(l.updated_at),
                "archived_at": _serialize_value(l.archived_at),
                "tags": [{"id": str(t.id), "name": t.name} for t in l.tags],
            }
            for l in locations
        ],
        "placements": [
            {
                "id": str(p.id), "item_id": str(p.item_id),
                "location_id": str(p.location_id) if p.location_id else None,
                "parent_item_id": str(p.parent_item_id) if p.parent_item_id else None,
                "placed_at": _serialize_value(p.placed_at),
                "removed_at": _serialize_value(p.removed_at),
                "placement_type": p.placement_type, "note": p.note,
                "created_by": str(p.created_by) if p.created_by else None,
            }
            for p in placements
        ],
        "tags": [
            {"id": str(t.id), "name": t.name, "slug": t.slug, "color": t.color,
             "created_at": _serialize_value(t.created_at)}
            for t in tags
        ],
        "relationships": [
            {
                "id": str(r.id), "source_item_id": str(r.source_item_id),
                "target_item_id": str(r.target_item_id),
                "relationship_type": _serialize_value(r.relationship_type),
                "note": r.note, "created_at": _serialize_value(r.created_at),
            }
            for r in relationships
        ],
        "stock_transactions": [
            {
                "id": str(s.id), "item_id": str(s.item_id),
                "transaction_type": _serialize_value(s.transaction_type),
                "quantity_delta": str(s.quantity_delta) if s.quantity_delta is not None else None,
                "resulting_quantity": str(s.resulting_quantity) if s.resulting_quantity is not None else None,
                "unit_of_measure": s.unit_of_measure, "reason": s.reason,
                "reference": s.reference,
                "performed_by": str(s.performed_by) if s.performed_by else None,
                "created_at": _serialize_value(s.created_at),
            }
            for s in stock_txns
        ],
        "media_assets": [
            {
                "id": str(m.id), "owner_type": m.owner_type,
                "owner_id": str(m.owner_id), "media_type": m.media_type,
                "file_path": m.file_path, "original_filename": m.original_filename,
                "mime_type": m.mime_type, "file_size": m.file_size,
                "checksum": m.checksum, "is_primary": m.is_primary,
                "created_at": _serialize_value(m.created_at),
            }
            for m in media_assets
        ],
        "audit_events": [
            {
                "id": str(a.id),
                "actor_user_id": str(a.actor_user_id) if a.actor_user_id else None,
                "entity_type": a.entity_type, "entity_id": str(a.entity_id),
                "event_type": a.event_type, "event_data_json": a.event_data_json,
                "created_at": _serialize_value(a.created_at),
            }
            for a in audit_events
        ],
        "label_records": [
            {
                "id": str(lr.id), "entity_type": lr.entity_type,
                "entity_id": str(lr.entity_id), "label_code": lr.label_code,
                "qr_payload": lr.qr_payload,
                "printed_at": _serialize_value(lr.printed_at),
                "format": lr.format,
                "created_at": _serialize_value(lr.created_at),
            }
            for lr in label_records
        ],
        "saved_views": [
            {
                "id": str(sv.id), "user_id": str(sv.user_id),
                "name": sv.name, "entity_type": sv.entity_type,
                "filter_json": sv.filter_json,
                "created_at": _serialize_value(sv.created_at),
                "updated_at": _serialize_value(sv.updated_at),
            }
            for sv in saved_views
        ],
    }

    # Build ZIP in memory
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        # Write JSON data
        zf.writestr("data.json", json.dumps(data, indent=2))

        # Include media files from disk
        media_root = Path(settings.media_path)
        for asset in media_assets:
            file_path = Path(asset.file_path)
            # Try absolute path first, then relative to media root
            if file_path.is_absolute():
                abs_path = file_path
            else:
                abs_path = media_root / file_path
            if abs_path.exists() and abs_path.is_file():
                arc_name = f"media/{asset.owner_type}/{asset.owner_id}/{abs_path.name}"
                zf.write(str(abs_path), arc_name)

        # Write restore documentation
        zf.writestr("RESTORE.md", _restore_docs())

    zip_buffer.seek(0)
    return Response(
        content=zip_buffer.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="inventory-full-backup.zip"'},
    )


def _restore_docs() -> str:
    return """# Inventory Catalog System — Restore Procedure

## Prerequisites
- Docker Compose environment with PostgreSQL
- Access to the backup ZIP file

## Steps

### 1. Restore the Database
Use `pg_dump` / `pg_restore` for the PostgreSQL database:

```bash
# Create a database dump (for regular backups):
docker compose exec inventory-db pg_dump -U inventory inventory > backup.sql

# Restore from dump:
docker compose exec -i inventory-db psql -U inventory inventory < backup.sql
```

### 2. Restore Media Files
Extract the `media/` directory from the ZIP and copy it to the configured
media volume (default: `/data/media`):

```bash
unzip inventory-full-backup.zip -d restore_tmp
cp -r restore_tmp/media/* /data/media/
```

### 3. Restore from JSON (Alternative)
The `data.json` file contains a full-fidelity export of all database records.
It can be used to rebuild the database if a SQL dump is unavailable.
Import via the application API or a custom migration script.

### 4. Verify
- Start the Docker Compose stack: `docker compose up -d`
- Check health: `curl http://localhost:8000/api/v1/health/ready`
- Verify items and media are accessible through the web UI
"""
