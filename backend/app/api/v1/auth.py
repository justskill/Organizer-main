"""Authentication API endpoints: login, API token management."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User, UserRole
from app.schemas.auth import (
    APITokenCreate,
    APITokenListItem,
    APITokenResponse,
    LoginRequest,
    TokenResponse,
)
from app.services.auth_service import (
    authenticate_user,
    create_api_token,
    delete_api_token,
    issue_access_token,
    list_api_tokens,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Authenticate with username/password and receive a JWT token."""
    user = await authenticate_user(db, body.username, body.password)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )
    token = issue_access_token(user)
    return TokenResponse(access_token=token)


@router.get("/tokens", response_model=list[APITokenListItem])
async def get_tokens(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all API tokens for the current user."""
    tokens = await list_api_tokens(db, current_user.id)
    return tokens


@router.post("/tokens", response_model=APITokenResponse, status_code=status.HTTP_201_CREATED)
async def create_token(
    body: APITokenCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new API token. The raw token is only returned once."""
    if current_user.role not in (UserRole.Admin, UserRole.API_Client):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Admin and API_Client roles can create API tokens",
        )
    token_record, raw_token = await create_api_token(db, current_user.id, body.name)
    return APITokenResponse(
        id=token_record.id,
        name=token_record.name,
        token=raw_token,
        created_at=token_record.created_at,
    )


@router.delete("/tokens/{token_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_token(
    token_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Revoke (delete) an API token."""
    deleted = await delete_api_token(db, token_id, current_user.id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Token not found")
