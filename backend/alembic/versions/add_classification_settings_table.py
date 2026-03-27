"""Add classification_settings table

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-04-01
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers
revision = "b2c3d4e5f6a7"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "classification_settings",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("api_key_encrypted", sa.Text(), nullable=True),
        sa.Column(
            "model_identifier",
            sa.String(255),
            nullable=False,
            server_default="google/gemini-2.5-flash-lite",
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_table("classification_settings")
