"""Short code generation utility for items and locations.

Generates unique, stable, human-friendly codes like ITM-2F4K9Q or LOC-A93K2M.
Codes are never recycled, even after entity deletion or archival.
"""

import secrets
import string

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.item import Item
from app.models.location import Location

# Characters used in short codes (uppercase alphanumeric, excluding ambiguous chars)
_ALPHABET = string.ascii_uppercase + string.digits
_ALPHABET = _ALPHABET.replace("O", "").replace("0", "").replace("I", "").replace("1", "").replace("L", "")

_CODE_LENGTH = 6

_PREFIX_MAP = {
    "ITM": "ITM",
    "LOC": "LOC",
}

_MODEL_MAP = {
    "ITM": Item,
    "LOC": Location,
}


def _random_segment(length: int = _CODE_LENGTH) -> str:
    return "".join(secrets.choice(_ALPHABET) for _ in range(length))


async def generate_short_code(
    db: AsyncSession,
    entity_type: str,
    max_attempts: int = 10,
) -> str:
    """Generate a unique short code for the given entity type.

    Args:
        db: Async database session.
        entity_type: One of "ITM" or "LOC".
        max_attempts: Maximum retries before raising.

    Returns:
        A unique code like "ITM-2F4K9Q".

    Raises:
        ValueError: If entity_type is not recognized.
        RuntimeError: If a unique code cannot be generated within max_attempts.
    """
    prefix = _PREFIX_MAP.get(entity_type)
    if prefix is None:
        raise ValueError(f"Unknown entity type: {entity_type}. Must be one of {list(_PREFIX_MAP.keys())}")

    model = _MODEL_MAP[entity_type]

    for _ in range(max_attempts):
        code = f"{prefix}-{_random_segment()}"
        result = await db.execute(select(model.id).where(model.code == code).limit(1))
        if result.scalar_one_or_none() is None:
            return code

    raise RuntimeError(f"Failed to generate unique short code after {max_attempts} attempts")
