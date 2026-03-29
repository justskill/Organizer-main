"""Add barcode column to items table.

Revision ID: add_barcode_to_items
Revises: make_categories_m2m
Create Date: 2026-03-29
"""
from alembic import op
import sqlalchemy as sa

revision = "add_barcode_to_items"
down_revision = "c3d4e5f6a7b8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("items", sa.Column("barcode", sa.String(255), nullable=True))
    op.create_index("ix_items_barcode", "items", ["barcode"])


def downgrade() -> None:
    op.drop_index("ix_items_barcode", table_name="items")
    op.drop_column("items", "barcode")
