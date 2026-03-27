"""Audit service for recording entity change events.

Supports event types: created, updated, archived, deleted, moved,
stock_adjusted, media_uploaded, media_deleted.
Stores before/after values in event_data_json.
"""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditEvent


async def record_event(
    db: AsyncSession,
    *,
    actor_id: uuid.UUID | None,
    entity_type: str,
    entity_id: uuid.UUID,
    event_type: str,
    event_data: dict | None = None,
) -> AuditEvent:
    """Insert an audit event record.

    Args:
        db: Async database session.
        actor_id: UUID of the user performing the action (None for system actions).
        entity_type: e.g. "item", "location", "stock", "media".
        entity_id: UUID of the affected entity.
        event_type: One of created, updated, archived, deleted, moved,
                    stock_adjusted, media_uploaded, media_deleted.
        event_data: Optional dict with before/after values or contextual details.

    Returns:
        The created AuditEvent instance.
    """
    event = AuditEvent(
        actor_user_id=actor_id,
        entity_type=entity_type,
        entity_id=entity_id,
        event_type=event_type,
        event_data_json=event_data,
    )
    db.add(event)
    await db.flush()
    return event
