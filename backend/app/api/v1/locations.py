"""Location API endpoints — CRUD, contents, tree."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, require_role
from app.models.user import User, UserRole
from app.repositories import location_repository
from app.schemas.location import (
    ItemBrief,
    LocationContents,
    LocationCreate,
    LocationListResponse,
    LocationResponse,
    LocationTreeNode,
    LocationUpdate,
)
from app.services import location_service

router = APIRouter(prefix="/locations", tags=["locations"])


@router.get("", response_model=LocationListResponse)
async def list_locations(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    root_only: bool = Query(False),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List locations with pagination."""
    locations, total = await location_repository.list_locations(
        db, page=page, page_size=page_size, root_only=root_only
    )
    return LocationListResponse(
        locations=[LocationResponse.model_validate(loc) for loc in locations],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=LocationResponse, status_code=status.HTTP_201_CREATED)
async def create_location(
    body: LocationCreate,
    current_user: User = Depends(require_role(UserRole.Admin, UserRole.Editor)),
    db: AsyncSession = Depends(get_db),
):
    """Create a new location."""
    try:
        location = await location_service.create_location(db, body, user_id=current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return LocationResponse.model_validate(location)


@router.get("/{location_id}", response_model=LocationResponse)
async def get_location(
    location_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get location detail including parent, children, and tags."""
    location = await location_service.get_location(db, location_id)
    if location is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found")
    return LocationResponse.model_validate(location)


@router.patch("/{location_id}", response_model=LocationResponse)
async def update_location(
    location_id: UUID,
    body: LocationUpdate,
    current_user: User = Depends(require_role(UserRole.Admin, UserRole.Editor)),
    db: AsyncSession = Depends(get_db),
):
    """Partially update a location."""
    try:
        location = await location_service.update_location(
            db, location_id, body, user_id=current_user.id
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    if location is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found")
    return LocationResponse.model_validate(location)


@router.get("/{location_id}/contents", response_model=LocationContents)
async def get_location_contents(
    location_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get items and child locations at this location."""
    location = await location_service.get_location(db, location_id)
    if location is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found")
    items, children = await location_service.get_contents(db, location_id)
    return LocationContents(
        location=LocationResponse.model_validate(location),
        items=[ItemBrief.model_validate(i) for i in items],
        child_locations=[LocationResponse.model_validate(c) for c in children],
    )


@router.get("/{location_id}/tree", response_model=LocationTreeNode)
async def get_location_tree(
    location_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get recursive subtree rooted at this location."""
    tree = await location_service.get_tree(db, location_id)
    if not tree:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found")
    return tree
