"""Unit tests for location API endpoints — hierarchy and circular reference rejection.

Validates: Requirements 2.8
"""

import uuid

import pytest
from httpx import AsyncClient

from tests.conftest import create_test_location

pytestmark = pytest.mark.asyncio


class TestLocationCreate:
    """Test POST /api/v1/locations."""

    async def test_create_root_location(self, client: AsyncClient):
        resp = await client.post(
            "/api/v1/locations",
            json={"name": "Warehouse"},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "Warehouse"
        assert data["code"].startswith("LOC-")
        assert data["parent_location_id"] is None

    async def test_create_child_location(self, client: AsyncClient):
        parent_resp = await client.post(
            "/api/v1/locations",
            json={"name": "House"},
        )
        parent_id = parent_resp.json()["id"]

        child_resp = await client.post(
            "/api/v1/locations",
            json={"name": "Garage", "parent_location_id": parent_id},
        )
        assert child_resp.status_code == 201
        assert child_resp.json()["parent_location_id"] == parent_id

    async def test_create_location_missing_name(self, client: AsyncClient):
        resp = await client.post("/api/v1/locations", json={})
        assert resp.status_code == 422


class TestLocationHierarchy:
    """Test location hierarchy and circular reference rejection."""

    async def test_get_location_contents(self, client: AsyncClient):
        parent_resp = await client.post(
            "/api/v1/locations", json={"name": "Lab"}
        )
        parent_id = parent_resp.json()["id"]

        await client.post(
            "/api/v1/locations",
            json={"name": "Bench A", "parent_location_id": parent_id},
        )

        contents_resp = await client.get(f"/api/v1/locations/{parent_id}/contents")
        assert contents_resp.status_code == 200
        data = contents_resp.json()
        assert len(data["child_locations"]) == 1
        assert data["child_locations"][0]["name"] == "Bench A"

    async def test_get_location_tree(self, client: AsyncClient):
        root_resp = await client.post(
            "/api/v1/locations", json={"name": "Building"}
        )
        root_id = root_resp.json()["id"]

        floor_resp = await client.post(
            "/api/v1/locations",
            json={"name": "Floor 1", "parent_location_id": root_id},
        )
        floor_id = floor_resp.json()["id"]

        await client.post(
            "/api/v1/locations",
            json={"name": "Room 101", "parent_location_id": floor_id},
        )

        tree_resp = await client.get(f"/api/v1/locations/{root_id}/tree")
        assert tree_resp.status_code == 200
        tree = tree_resp.json()
        assert tree["name"] == "Building"
        assert len(tree["children"]) == 1
        assert tree["children"][0]["name"] == "Floor 1"
        assert len(tree["children"][0]["children"]) == 1

    async def test_circular_reference_self_parent(self, client: AsyncClient):
        """Req 2.8: Setting a location as its own parent is rejected."""
        loc_resp = await client.post(
            "/api/v1/locations", json={"name": "Shelf"}
        )
        loc_id = loc_resp.json()["id"]

        patch_resp = await client.patch(
            f"/api/v1/locations/{loc_id}",
            json={"parent_location_id": loc_id},
        )
        assert patch_resp.status_code == 400
        assert "circular" in patch_resp.json()["detail"].lower() or "own parent" in patch_resp.json()["detail"].lower()

    async def test_circular_reference_descendant(self, client: AsyncClient):
        """Req 2.8: Setting parent to a descendant is rejected."""
        root_resp = await client.post(
            "/api/v1/locations", json={"name": "Root"}
        )
        root_id = root_resp.json()["id"]

        child_resp = await client.post(
            "/api/v1/locations",
            json={"name": "Child", "parent_location_id": root_id},
        )
        child_id = child_resp.json()["id"]

        # Try to make root a child of its own child
        patch_resp = await client.patch(
            f"/api/v1/locations/{root_id}",
            json={"parent_location_id": child_id},
        )
        assert patch_resp.status_code == 400

    async def test_get_nonexistent_location(self, client: AsyncClient):
        fake_id = str(uuid.uuid4())
        resp = await client.get(f"/api/v1/locations/{fake_id}")
        assert resp.status_code == 404
