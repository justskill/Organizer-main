"""Authentication service: login validation, token issuance, API token CRUD."""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import (
    create_access_token,
    generate_api_token,
    hash_password,
    verify_password,
)
from app.models.api_token import APIToken
from app.models.user import User


async def authenticate_user(db: AsyncSession, username: str, password: str) -> User | None:
    """Validate credentials and return the User, or None if invalid."""
    result = await db.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    if user is None or not verify_password(password, user.password_hash):
        return None
    return user


def issue_access_token(user: User) -> str:
    """Issue a JWT access token for an authenticated user."""
    return create_access_token(user.id, user.role.value)


async def create_api_token(db: AsyncSession, user_id: UUID, name: str) -> tuple[APIToken, str]:
    """Create a new API token. Returns (token_record, raw_token)."""
    raw_token = generate_api_token()
    token_record = APIToken(
        user_id=user_id,
        name=name,
        token_hash=hash_password(raw_token),
    )
    db.add(token_record)
    await db.flush()
    return token_record, raw_token


async def list_api_tokens(db: AsyncSession, user_id: UUID) -> list[APIToken]:
    """List all API tokens for a user."""
    result = await db.execute(
        select(APIToken).where(APIToken.user_id == user_id).order_by(APIToken.created_at.desc())
    )
    return list(result.scalars().all())


async def delete_api_token(db: AsyncSession, token_id: UUID, user_id: UUID) -> bool:
    """Delete an API token. Returns True if deleted, False if not found."""
    result = await db.execute(
        select(APIToken).where(APIToken.id == token_id, APIToken.user_id == user_id)
    )
    token = result.scalar_one_or_none()
    if token is None:
        return False
    await db.delete(token)
    await db.flush()
    return True


async def resolve_api_token(db: AsyncSession, raw_token: str) -> User | None:
    """Resolve a raw API token to its owning User, or None if invalid."""
    result = await db.execute(select(APIToken))
    tokens = result.scalars().all()
    for token_record in tokens:
        if verify_password(raw_token, token_record.token_hash):
            return token_record.user
    return None
