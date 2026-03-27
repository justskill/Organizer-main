"""Classification API endpoints — image classification and settings management."""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import require_role
from app.models.user import User, UserRole
from app.schemas.classification import (
    ClassificationResult,
    ClassificationSettingsRead,
    ClassificationSettingsUpdate,
)
from app.services import classification_service

router = APIRouter(tags=["classification"])

ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_FILES = 5
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
MAX_TOTAL_SIZE = 30 * 1024 * 1024  # 30 MB


# ---------------------------------------------------------------------------
# Classification endpoint
# ---------------------------------------------------------------------------

@router.post("/classify/image", response_model=ClassificationResult)
async def classify_image(
    files: list[UploadFile],
    current_user: User = Depends(require_role(UserRole.Admin, UserRole.Editor)),
    db: AsyncSession = Depends(get_db),
):
    """Classify item from uploaded images via OpenRouter LLM."""
    # Validate file count
    if len(files) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one image file is required",
        )
    if len(files) > MAX_FILES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Maximum {MAX_FILES} images per request. Got {len(files)}.",
        )

    # Validate MIME types and sizes
    total_size = 0
    for f in files:
        mime = f.content_type or ""
        if mime not in ALLOWED_MIME_TYPES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"File '{f.filename}' has unsupported type '{mime}'. Allowed: image/jpeg, image/png, image/webp",
            )
        content = await f.read()
        file_size = len(content)
        if file_size > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"File '{f.filename}' exceeds 10MB limit",
            )
        total_size += file_size
        # Reset file position so the service can read it again
        await f.seek(0)

    if total_size > MAX_TOTAL_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Total upload size exceeds 30MB limit",
        )

    # Call classification service
    try:
        result = await classification_service.classify_images(db, files)
    except ValueError as exc:
        # No API key configured
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        )
    except RuntimeError as exc:
        # OpenRouter errors
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        )

    return result


# ---------------------------------------------------------------------------
# Settings endpoints
# ---------------------------------------------------------------------------

@router.get("/settings/classification", response_model=ClassificationSettingsRead)
async def get_classification_settings(
    current_user: User = Depends(require_role(UserRole.Admin, UserRole.Editor)),
    db: AsyncSession = Depends(get_db),
):
    """Get current classification settings (never exposes raw API key)."""
    config = await classification_service.get_settings(db)
    if config is None:
        return ClassificationSettingsRead(
            model_identifier="google/gemini-2.5-flash-lite",
            has_api_key=False,
        )
    return ClassificationSettingsRead(
        model_identifier=config.model_identifier,
        has_api_key=config.api_key_encrypted is not None,
    )


@router.put("/settings/classification", response_model=ClassificationSettingsRead)
async def update_classification_settings(
    body: ClassificationSettingsUpdate,
    current_user: User = Depends(require_role(UserRole.Admin)),
    db: AsyncSession = Depends(get_db),
):
    """Update classification settings. Empty/null API key clears it."""
    api_key = body.api_key if body.api_key else None
    config = await classification_service.save_settings(db, api_key, body.model_identifier)
    await db.commit()
    return ClassificationSettingsRead(
        model_identifier=config.model_identifier,
        has_api_key=config.api_key_encrypted is not None,
    )
