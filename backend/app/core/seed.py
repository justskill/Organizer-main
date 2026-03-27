"""Seed the database with a default admin user if no users exist."""

import logging

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.user import User, UserRole

logger = logging.getLogger(__name__)

DEFAULT_ADMIN_USERNAME = "admin"
DEFAULT_ADMIN_PASSWORD = "admin"


async def seed_default_admin(db: AsyncSession) -> None:
    """Create a default admin user if the users table is empty."""
    result = await db.execute(select(func.count()).select_from(User))
    count = result.scalar_one()
    if count > 0:
        return

    admin = User(
        username=DEFAULT_ADMIN_USERNAME,
        password_hash=hash_password(DEFAULT_ADMIN_PASSWORD),
        display_name="Administrator",
        role=UserRole.Admin,
    )
    db.add(admin)
    await db.commit()
    logger.info("Created default admin user (username: %s)", DEFAULT_ADMIN_USERNAME)
