"""SQLAlchemy models package — import all models so metadata is populated."""

from app.models.base import Base
from app.models.user import User, UserRole
from app.models.category import ItemCategory
from app.models.item import Item, ItemType, ItemCondition
from app.models.location import Location
from app.models.placement import ItemPlacement
from app.models.tag import Tag, item_tags, location_tags
from app.models.media import MediaAsset
from app.models.stock import StockTransaction, TransactionType
from app.models.relationship import ItemRelationship, RelationshipType
from app.models.label import LabelRecord
from app.models.audit import AuditEvent
from app.models.saved_view import SavedView
from app.models.api_token import APIToken
from app.models.classification_settings import ClassificationSettings

__all__ = [
    "Base",
    "User", "UserRole",
    "APIToken",
    "ClassificationSettings",
    "ItemCategory",
    "Item", "ItemType", "ItemCondition",
    "Location",
    "ItemPlacement",
    "Tag", "item_tags", "location_tags",
    "MediaAsset",
    "StockTransaction", "TransactionType",
    "ItemRelationship", "RelationshipType",
    "LabelRecord",
    "AuditEvent",
    "SavedView",
]
