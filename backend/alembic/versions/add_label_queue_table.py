"""Add label_queue_items table

Revision ID: c3d4e5f6a7b8
Revises: make_categories_m2m
Create Date: 2026-03-29
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "c3d4e5f6a7b8"
down_revision = "make_categories_m2m"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "label_queue_items",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("entity_type", sa.String(50), nullable=False),
        sa.Column("entity_id", UUID(as_uuid=True), nullable=False),
        sa.Column("entity_name", sa.String(500), nullable=False),
        sa.Column("entity_code", sa.String(20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_label_queue_items_user_id", "label_queue_items", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_label_queue_items_user_id")
    op.drop_table("label_queue_items")
