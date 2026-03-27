"""Make categories many-to-many with items via junction table.

Revision ID: make_categories_m2m
Revises: add_classification_settings_table
Create Date: 2026-03-26
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "make_categories_m2m"
down_revision = "b2c3d4e5f6a7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create junction table
    op.create_table(
        "item_category_assignments",
        sa.Column("item_id", sa.UUID(), nullable=False),
        sa.Column("category_id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(["item_id"], ["items.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["category_id"], ["item_categories.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("item_id", "category_id"),
    )

    # Migrate existing category_id data into junction table
    op.execute(
        """
        INSERT INTO item_category_assignments (item_id, category_id)
        SELECT id, category_id FROM items WHERE category_id IS NOT NULL
        """
    )

    # Drop the old FK and column
    op.drop_constraint("items_category_id_fkey", "items", type_="foreignkey")
    op.drop_column("items", "category_id")


def downgrade() -> None:
    # Re-add category_id column
    op.add_column("items", sa.Column("category_id", sa.UUID(), nullable=True))
    op.create_foreign_key("items_category_id_fkey", "items", "item_categories", ["category_id"], ["id"])

    # Migrate back (pick first category per item)
    op.execute(
        """
        UPDATE items SET category_id = sub.category_id
        FROM (
            SELECT DISTINCT ON (item_id) item_id, category_id
            FROM item_category_assignments
            ORDER BY item_id
        ) sub
        WHERE items.id = sub.item_id
        """
    )

    op.drop_table("item_category_assignments")
