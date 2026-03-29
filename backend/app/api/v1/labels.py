"""Label and scan API endpoints — QR generation, scan resolution."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, require_role
from app.models.user import User, UserRole
from app.services import label_service

router = APIRouter(tags=["labels"])


class LabelGenerateRequest(BaseModel):
    entity_type: str = Field(..., description="'item' or 'location'")
    entity_id: UUID
    format: str = Field("adhesive", description="'adhesive', 'sheet', or 'avery5260'")


class BatchLabelEntity(BaseModel):
    entity_type: str = Field(..., description="'item' or 'location'")
    entity_id: UUID


TEMPLATE_MAX_CELLS = {
    "avery5260": 30,
    "avery18163": 10,
    "avery18294": 60,
}


class BatchLabelRequest(BaseModel):
    entities: list[BatchLabelEntity]
    start_cell: int = Field(1, ge=1, description="1-based cell to start at")
    label_template: str = Field("avery5260", description="'avery5260', 'avery18163', or 'avery18294'")
    text_scale: float = Field(1.0, ge=0.5, le=2.0, description="Text size multiplier (0.5–2.0)")
    footer_text: str = Field("", max_length=60, description="Optional text shown at bottom-right of each label")

    @model_validator(mode="after")
    def validate_start_cell(self):
        max_cells = TEMPLATE_MAX_CELLS.get(self.label_template, 30)
        if self.start_cell > max_cells:
            raise ValueError(f"start_cell must be <= {max_cells} for template {self.label_template}")
        return self


class ScanResponse(BaseModel):
    entity_type: str
    entity_id: str
    name: str
    code: str
    archived: bool = False
    is_container: bool | None = None


@router.post("/labels/generate")
async def generate_label(
    body: LabelGenerateRequest,
    current_user: User = Depends(require_role(UserRole.Admin, UserRole.Editor)),
    db: AsyncSession = Depends(get_db),
):
    """Generate a QR label PDF for an entity."""
    # Resolve entity to get name and code
    from sqlalchemy import select
    if body.entity_type == "item":
        from app.models.item import Item
        result = await db.execute(select(Item).where(Item.id == body.entity_id))
        entity = result.scalar_one_or_none()
    elif body.entity_type == "location":
        from app.models.location import Location
        result = await db.execute(select(Location).where(Location.id == body.entity_id))
        entity = result.scalar_one_or_none()
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="entity_type must be 'item' or 'location'")

    if entity is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entity not found")

    qr_payload = f"/scan/{entity.code}"
    pdf_bytes = label_service.render_label_pdf(
        entity_type=body.entity_type,
        name=entity.name,
        short_code=entity.code,
        qr_payload=qr_payload,
        label_format=body.format,
    )

    # Record label generation
    await label_service.record_label(
        db,
        entity_type=body.entity_type,
        entity_id=body.entity_id,
        label_code=entity.code,
        qr_payload=qr_payload,
        label_format=body.format,
    )

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="label-{entity.code}.pdf"'},
    )


@router.post("/labels/generate-sheet")
async def generate_avery5260_sheet(
    body: BatchLabelRequest,
    current_user: User = Depends(require_role(UserRole.Admin, UserRole.Editor)),
    db: AsyncSession = Depends(get_db),
):
    """Generate an Avery 5260 label sheet PDF with multiple entities."""
    from sqlalchemy import select
    from app.models.item import Item
    from app.models.location import Location

    labels = []
    for entry in body.entities:
        if entry.entity_type == "item":
            result = await db.execute(select(Item).where(Item.id == entry.entity_id))
            entity = result.scalar_one_or_none()
        elif entry.entity_type == "location":
            result = await db.execute(select(Location).where(Location.id == entry.entity_id))
            entity = result.scalar_one_or_none()
        else:
            continue
        if entity is None:
            continue
        labels.append({
            "entity_type": entry.entity_type,
            "name": entity.name,
            "short_code": entity.code,
            "qr_payload": f"/scan/{entity.code}",
        })

    if not labels:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No valid entities found")

    template = body.label_template
    if template == "avery18163":
        pdf_bytes = label_service.render_avery18163_sheet(
            labels, start_cell=body.start_cell, text_scale=body.text_scale,
            footer_text=body.footer_text,
        )
    elif template == "avery18294":
        pdf_bytes = label_service.render_avery18294_sheet(
            labels, start_cell=body.start_cell, text_scale=body.text_scale,
            footer_text=body.footer_text,
        )
    else:
        pdf_bytes = label_service.render_avery5260_sheet(
            labels, start_cell=body.start_cell, text_scale=body.text_scale,
            footer_text=body.footer_text,
        )

    # Record label generation for each
    for entry in body.entities:
        matching = [l for l in labels if l["short_code"].endswith(str(entry.entity_id)[:6]) or True]
        await label_service.record_label(
            db,
            entity_type=entry.entity_type,
            entity_id=entry.entity_id,
            label_code=matching[0]["short_code"] if matching else "",
            qr_payload=matching[0]["qr_payload"] if matching else "",
            label_format=template,
        )

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="labels-{template}.pdf"'},
    )


@router.get("/scan/{code}", response_model=ScanResponse)
async def scan_code(
    code: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Resolve a scanned short code to its entity."""
    result = await label_service.resolve_code(db, code)
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Code not found")
    return ScanResponse(**result)


@router.get("/entities/by-code/{code}", response_model=ScanResponse)
async def get_entity_by_code(
    code: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Resolve a short code to its entity (alias for scan)."""
    result = await label_service.resolve_code(db, code)
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Code not found")
    return ScanResponse(**result)
