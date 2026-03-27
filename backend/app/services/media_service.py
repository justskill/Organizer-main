"""Media service — file upload, storage, thumbnail generation, deletion."""

import hashlib
import os
import uuid
from pathlib import Path

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.media import MediaAsset
from app.services import audit_service

ALLOWED_MIME_TYPES = {
    "image/jpeg", "image/png", "image/gif", "image/webp",
    "application/pdf",
    "text/plain", "text/csv",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}

MAX_FILE_SIZE = settings.max_upload_size_bytes


async def upload_file(
    db: AsyncSession,
    *,
    owner_type: str,
    owner_id: uuid.UUID,
    file_content: bytes,
    filename: str,
    mime_type: str,
    user_id: uuid.UUID | None = None,
) -> MediaAsset:
    """Validate, store file, record metadata, return MediaAsset."""
    # Validate MIME type
    if mime_type not in ALLOWED_MIME_TYPES:
        raise ValueError(f"File type '{mime_type}' is not allowed")

    # Validate size
    if len(file_content) > MAX_FILE_SIZE:
        raise ValueError(f"File exceeds maximum size of {MAX_FILE_SIZE} bytes")

    # Compute checksum
    checksum = hashlib.sha256(file_content).hexdigest()

    # Build storage path
    storage_dir = Path(settings.media_path) / owner_type / str(owner_id)
    storage_dir.mkdir(parents=True, exist_ok=True)

    file_ext = Path(filename).suffix
    stored_name = f"{uuid.uuid4().hex}{file_ext}"
    file_path = storage_dir / stored_name

    # Write file
    file_path.write_bytes(file_content)

    # Determine if photo for thumbnail
    is_photo = mime_type.startswith("image/")
    media_type = "photo" if is_photo else "document"

    asset = MediaAsset(
        owner_type=owner_type,
        owner_id=owner_id,
        media_type=media_type,
        file_path=str(file_path),
        original_filename=filename,
        mime_type=mime_type,
        file_size=len(file_content),
        checksum=checksum,
        is_primary=False,
    )
    db.add(asset)
    await db.flush()

    await audit_service.record_event(
        db,
        actor_id=user_id,
        entity_type=owner_type,
        entity_id=owner_id,
        event_type="media_uploaded",
        event_data={"filename": filename, "media_id": str(asset.id), "mime_type": mime_type},
    )
    return asset


async def delete_file(
    db: AsyncSession,
    media_id: uuid.UUID,
    user_id: uuid.UUID | None = None,
) -> bool:
    """Delete a media asset and its file from disk."""
    result = await db.execute(select(MediaAsset).where(MediaAsset.id == media_id))
    asset = result.scalar_one_or_none()
    if asset is None:
        return False

    # Remove file from disk
    try:
        os.remove(asset.file_path)
    except OSError:
        pass

    owner_type = asset.owner_type
    owner_id = asset.owner_id

    await audit_service.record_event(
        db,
        actor_id=user_id,
        entity_type=owner_type,
        entity_id=owner_id,
        event_type="media_deleted",
        event_data={"filename": asset.original_filename, "media_id": str(asset.id)},
    )

    await db.delete(asset)
    await db.flush()
    return True


async def set_primary_photo(
    db: AsyncSession,
    media_id: uuid.UUID,
) -> MediaAsset | None:
    """Set a media asset as the primary photo for its owner item."""
    result = await db.execute(select(MediaAsset).where(MediaAsset.id == media_id))
    asset = result.scalar_one_or_none()
    if asset is None:
        return None

    # Unmark current primary for same owner
    current_primary = await db.execute(
        select(MediaAsset).where(
            and_(
                MediaAsset.owner_type == asset.owner_type,
                MediaAsset.owner_id == asset.owner_id,
                MediaAsset.is_primary == True,
            )
        )
    )
    for existing in current_primary.scalars().all():
        existing.is_primary = False

    asset.is_primary = True
    await db.flush()
    return asset
