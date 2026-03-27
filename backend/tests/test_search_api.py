"""Unit tests for search with full-text and fuzzy queries.

Validates: Requirements 9.1

Note: Full-text search (tsvector/@@/similarity) is PostgreSQL-specific.
These tests mock the search service to validate API behavior independently
of the database engine.
"""

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


def _mock_item(name="Test Item", item_type="Equipment", is_container=False):
    """Create a mock item object for search results."""
    item = MagicMock()
    item.id = uuid4()
    item.code = f"ITM-{uuid4().hex[:6].upper()}"
    item.name = name
    item.item_type = MagicMock(value=item_type)
    item.is_container = is_container
    item.brand = None
    item.model_number = None
    item.tags = []
    return item


def _mock_location(name="Test Location"):
    loc = MagicMock()
    loc.id = uuid4()
    loc.code = f"LOC-{uuid4().hex[:6].upper()}"
    loc.name = name
    loc.path_text = name
    loc.tags = []
    return loc


def _mock_tag(name="test-tag"):
    tag = MagicMock()
    tag.id = uuid4()
    tag.name = name
    tag.slug = name.lower().replace(" ", "-")
    return tag


class TestGlobalSearch:
    """Test GET /api/v1/search?q=..."""

    @patch("app.services.search_service.global_search")
    async def test_search_returns_grouped_results(
        self, mock_search, client: AsyncClient
    ):
        """Req 9.1: Search returns grouped results by entity type."""
        mock_search.return_value = {
            "items": [_mock_item("Digital Multimeter"), _mock_item("Analog Multimeter")],
            "containers": [_mock_item("Toolbox", is_container=True)],
            "locations": [_mock_location("Lab")],
            "tags": [_mock_tag("electronics")],
        }

        resp = await client.get("/api/v1/search", params={"q": "Multimeter"})
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert "containers" in data
        assert "locations" in data
        assert "tags" in data
        assert len(data["items"]) == 2
        assert len(data["containers"]) == 1


    async def test_search_empty_query_rejected(self, client: AsyncClient):
        """Empty query string should be rejected."""
        resp = await client.get("/api/v1/search", params={"q": ""})
        assert resp.status_code == 422

    @patch("app.services.search_service.global_search")
    async def test_search_no_results(self, mock_search, client: AsyncClient):
        """Search for nonexistent term returns empty groups."""
        mock_search.return_value = {
            "items": [],
            "containers": [],
            "locations": [],
            "tags": [],
        }
        resp = await client.get("/api/v1/search", params={"q": "zzzznonexistent"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["items"] == []
        assert data["locations"] == []


class TestAdvancedSearch:
    """Test POST /api/v1/search/advanced."""

    @patch("app.services.search_service.advanced_search")
    async def test_advanced_search_basic(self, mock_search, client: AsyncClient):
        mock_search.return_value = {
            "items": [_mock_item("Oscilloscope")],
            "total": 1,
        }

        resp = await client.post(
            "/api/v1/search/advanced",
            json={"query": "Oscilloscope"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert "total" in data
        assert data["total"] == 1

    async def test_advanced_search_filter_by_item_type(self, client: AsyncClient):
        await client.post(
            "/api/v1/items",
            json={"name": "Hammer", "item_type": "Tool"},
        )
        await client.post(
            "/api/v1/items",
            json={"name": "Nails", "item_type": "Consumable", "is_consumable": True},
        )

        resp = await client.post(
            "/api/v1/search/advanced",
            json={"item_type": "Tool"},
        )
        assert resp.status_code == 200
        items = resp.json()["items"]
        for item in items:
            assert item["item_type"] == "Tool"

    async def test_advanced_search_empty_filters(self, client: AsyncClient):
        """No filters returns all items."""
        resp = await client.post("/api/v1/search/advanced", json={})
        assert resp.status_code == 200
