"""Unit tests for placement constraints and movement flow.

Validates: Requirements 3.4, 4.4
"""

import uuid

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


class TestMovement:
    """Test POST /api/v1/items/{id}/move."""

    async def _create_item(self, client, name="Test Item", item_type="Equipment", **kw):
        resp = await client.post(
            "/api/v1/items",
            json={"name": name, "item_type": item_type, **kw},
        )
        assert resp.status_code == 201
        return resp.json()["item"]

    async def _create_location(self, client, name="Test Loc"):
        resp = await client.post("/api/v1/locations", json={"name": name})
        assert resp.status_code == 201
        return resp.json()

    async def test_move_item_to_location(self, client: AsyncClient):
        """Move an item to a location successfully."""
        item = await self._create_item(client)
        loc = await self._create_location(client)

        move_resp = await client.post(
            f"/api/v1/items/{item['id']}/move",
            json={"location_id": loc["id"]},
        )
        assert move_resp.status_code == 200
        data = move_resp.json()
        assert data["location_id"] == loc["id"]
        assert data["parent_item_id"] is None

    async def test_move_item_to_container(self, client: AsyncClient):
        """Move an item into a container item."""
        container = await self._create_item(
            client, name="Toolbox", item_type="Container", is_container=True
        )
        item = await self._create_item(client, name="Wrench", item_type="Tool")

        move_resp = await client.post(
            f"/api/v1/items/{item['id']}/move",
            json={"container_id": container["id"]},
        )
        assert move_resp.status_code == 200
        assert move_resp.json()["parent_item_id"] == container["id"]


    async def test_move_no_destination_rejected(self, client: AsyncClient):
        """Req 4.4: Must provide location_id or container_id."""
        item = await self._create_item(client)
        move_resp = await client.post(
            f"/api/v1/items/{item['id']}/move",
            json={},
        )
        assert move_resp.status_code == 400

    async def test_self_containment_rejected(self, client: AsyncClient):
        """Req 3.4: Cannot place a container inside itself."""
        container = await self._create_item(
            client, name="Box", item_type="Container", is_container=True
        )
        move_resp = await client.post(
            f"/api/v1/items/{container['id']}/move",
            json={"container_id": container["id"]},
        )
        assert move_resp.status_code == 400
        assert "itself" in move_resp.json()["detail"].lower()

    async def test_move_updates_placement(self, client: AsyncClient):
        """Moving an item twice should update the current placement."""
        item = await self._create_item(client)
        loc1 = await self._create_location(client, name="Shelf A")
        loc2 = await self._create_location(client, name="Shelf B")

        await client.post(
            f"/api/v1/items/{item['id']}/move",
            json={"location_id": loc1["id"]},
        )
        move2_resp = await client.post(
            f"/api/v1/items/{item['id']}/move",
            json={"location_id": loc2["id"]},
        )
        assert move2_resp.status_code == 200
        assert move2_resp.json()["location_id"] == loc2["id"]

        # Verify item detail shows new location
        get_resp = await client.get(f"/api/v1/items/{item['id']}")
        assert get_resp.status_code == 200
        placement = get_resp.json().get("current_placement")
        assert placement is not None
        assert placement["location_id"] == loc2["id"]

    async def test_move_nonexistent_item(self, client: AsyncClient):
        loc = await self._create_location(client)
        fake_id = str(uuid.uuid4())
        resp = await client.post(
            f"/api/v1/items/{fake_id}/move",
            json={"location_id": loc["id"]},
        )
        assert resp.status_code == 400
