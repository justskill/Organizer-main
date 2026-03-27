"""Unit tests for item CRUD API endpoints.

Validates: Requirements 1.1, 1.8
"""

import uuid
from decimal import Decimal

import pytest
import pytest_asyncio
from httpx import AsyncClient

from tests.conftest import create_test_item

pytestmark = pytest.mark.asyncio


class TestItemCreate:
    """Test POST /api/v1/items with valid and invalid payloads."""

    async def test_create_item_valid(self, client: AsyncClient, admin_user):
        """Req 1.1: Valid creation returns 201 with UUID and short code."""
        payload = {
            "name": "Multimeter",
            "item_type": "Equipment",
            "brand": "Fluke",
            "model_number": "87V",
        }
        resp = await client.post("/api/v1/items", json=payload)
        assert resp.status_code == 201
        data = resp.json()
        assert "item" in data
        item = data["item"]
        assert item["name"] == "Multimeter"
        assert item["code"].startswith("ITM-")
        assert item["brand"] == "Fluke"
        assert "id" in item

    async def test_create_item_missing_name(self, client: AsyncClient):
        """Req 1.8: Missing name returns validation error."""
        payload = {"item_type": "Equipment"}
        resp = await client.post("/api/v1/items", json=payload)
        assert resp.status_code == 422

    async def test_create_item_missing_item_type(self, client: AsyncClient):
        """Missing item_type returns validation error."""
        payload = {"name": "Widget"}
        resp = await client.post("/api/v1/items", json=payload)
        assert resp.status_code == 422

    async def test_create_item_invalid_item_type(self, client: AsyncClient):
        """Invalid item_type enum value returns validation error."""
        payload = {"name": "Widget", "item_type": "InvalidType"}
        resp = await client.post("/api/v1/items", json=payload)
        assert resp.status_code == 422

    async def test_create_item_empty_name(self, client: AsyncClient):
        """Empty string name returns validation error."""
        payload = {"name": "", "item_type": "Tool"}
        resp = await client.post("/api/v1/items", json=payload)
        assert resp.status_code == 422


class TestItemRead:
    """Test GET /api/v1/items and GET /api/v1/items/{id}."""

    async def test_list_items_empty(self, client: AsyncClient):
        resp = await client.get("/api/v1/items")
        assert resp.status_code == 200
        data = resp.json()
        assert data["items"] == []
        assert data["total"] == 0

    async def test_get_item_not_found(self, client: AsyncClient):
        fake_id = str(uuid.uuid4())
        resp = await client.get(f"/api/v1/items/{fake_id}")
        assert resp.status_code == 404

    async def test_create_then_get_item(self, client: AsyncClient):
        """Create an item then retrieve it by ID."""
        payload = {"name": "Soldering Iron", "item_type": "Tool"}
        create_resp = await client.post("/api/v1/items", json=payload)
        assert create_resp.status_code == 201
        item_id = create_resp.json()["item"]["id"]

        get_resp = await client.get(f"/api/v1/items/{item_id}")
        assert get_resp.status_code == 200
        assert get_resp.json()["name"] == "Soldering Iron"


class TestItemUpdate:
    """Test PATCH /api/v1/items/{id}."""

    async def test_update_item(self, client: AsyncClient):
        create_resp = await client.post(
            "/api/v1/items",
            json={"name": "Resistor Pack", "item_type": "Component"},
        )
        item_id = create_resp.json()["item"]["id"]

        patch_resp = await client.patch(
            f"/api/v1/items/{item_id}",
            json={"notes": "100 ohm assortment"},
        )
        assert patch_resp.status_code == 200
        assert patch_resp.json()["notes"] == "100 ohm assortment"

    async def test_update_nonexistent_item(self, client: AsyncClient):
        fake_id = str(uuid.uuid4())
        resp = await client.patch(f"/api/v1/items/{fake_id}", json={"notes": "x"})
        assert resp.status_code == 404


class TestItemDelete:
    """Test DELETE /api/v1/items/{id}."""

    async def test_delete_item(self, client: AsyncClient):
        create_resp = await client.post(
            "/api/v1/items",
            json={"name": "Old Capacitor", "item_type": "Component"},
        )
        item_id = create_resp.json()["item"]["id"]

        del_resp = await client.delete(f"/api/v1/items/{item_id}")
        assert del_resp.status_code == 204

        get_resp = await client.get(f"/api/v1/items/{item_id}")
        assert get_resp.status_code == 404

    async def test_delete_nonexistent_item(self, client: AsyncClient):
        fake_id = str(uuid.uuid4())
        resp = await client.delete(f"/api/v1/items/{fake_id}")
        assert resp.status_code == 404
