"""Media API endpoints — upload, retrieve, delete."""

from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, require_role
from app.models.media import MediaAsset
from app.models.user import User, UserRole
from app.services import media_service

router = APIRouter(prefix="/media", tags=["media"])


class MediaResponse(BaseModel):
    id: UUID
    owner_type: str
    owner_id: UUID
    media_type: str | None = None
    file_path: str
    original_filename: str
    mime_type: str
    file_size: int
    checksum: str | None = None
    is_primary: bool = False
    model_config = {"from_attributes": True}


@router.post("/upload", response_model=MediaResponse, status_code=status.HTTP_201_CREATED)
async def upload_media(
    file: UploadFile = File(...),
    owner_type: str = Form(...),
    owner_id: UUID = Form(...),
    current_user: User = Depends(require_role(UserRole.Admin, UserRole.Editor)),
    db: AsyncSession = Depends(get_db),
):
    """Upload a file for an item or location."""
    content = await file.read()
    try:
        asset = await media_service.upload_file(
            db,
            owner_type=owner_type,
            owner_id=owner_id,
            file_content=content,
            filename=file.filename or "unknown",
            mime_type=file.content_type or "application/octet-stream",
            user_id=current_user.id,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return MediaResponse.model_validate(asset)


@router.get("/{media_id}")
async def get_media(
    media_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Retrieve a media file by ID. No auth required for serving files (self-hosted)."""
    result = await db.execute(select(MediaAsset).where(MediaAsset.id == media_id))
    asset = result.scalar_one_or_none()
    if asset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media not found")
    return FileResponse(
        path=asset.file_path,
        media_type=asset.mime_type,
        filename=asset.original_filename,
    )


@router.delete("/{media_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_media(
    media_id: UUID,
    current_user: User = Depends(require_role(UserRole.Admin, UserRole.Editor)),
    db: AsyncSession = Depends(get_db),
):
    """Delete a media asset."""
    deleted = await media_service.delete_file(db, media_id, user_id=current_user.id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media not found")


@router.post("/{media_id}/set-primary", response_model=MediaResponse)
async def set_primary(
    media_id: UUID,
    current_user: User = Depends(require_role(UserRole.Admin, UserRole.Editor)),
    db: AsyncSession = Depends(get_db),
):
    """Set a media asset as the primary photo for its owner."""
    asset = await media_service.set_primary_photo(db, media_id)
    if asset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media not found")
    return MediaResponse.model_validate(asset)
