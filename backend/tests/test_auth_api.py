"""Unit tests for auth flow: login, token validation, role enforcement, 401/403.

Validates: Requirements 12.1, 12.7, 12.8
"""

import pytest
from httpx import ASGITransport, AsyncClient

pytestmark = pytest.mark.asyncio


class TestLogin:
    """Test POST /api/v1/auth/login."""

    async def test_login_valid_credentials(
        self, db_session, admin_user, unauth_client: AsyncClient
    ):
        """Req 12.1: Valid login returns JWT token."""
        resp = await unauth_client.post(
            "/api/v1/auth/login",
            json={"username": "admin", "password": "adminpass"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

    async def test_login_invalid_password(self, db_session, admin_user, unauth_client: AsyncClient):
        resp = await unauth_client.post(
            "/api/v1/auth/login",
            json={"username": "admin", "password": "wrongpass"},
        )
        assert resp.status_code == 401

    async def test_login_nonexistent_user(self, unauth_client: AsyncClient):
        resp = await unauth_client.post(
            "/api/v1/auth/login",
            json={"username": "nobody", "password": "pass"},
        )
        assert resp.status_code == 401

    async def test_login_missing_fields(self, unauth_client: AsyncClient):
        resp = await unauth_client.post("/api/v1/auth/login", json={})
        assert resp.status_code == 422


class TestUnauthenticated:
    """Req 12.7: Unauthenticated requests to protected endpoints return 401."""

    async def test_items_requires_auth(self, unauth_client: AsyncClient):
        resp = await unauth_client.get("/api/v1/items")
        assert resp.status_code == 401

    async def test_locations_requires_auth(self, unauth_client: AsyncClient):
        resp = await unauth_client.get("/api/v1/locations")
        assert resp.status_code == 401

    async def test_search_requires_auth(self, unauth_client: AsyncClient):
        resp = await unauth_client.get("/api/v1/search?q=test")
        assert resp.status_code == 401


class TestRoleEnforcement:
    """Req 12.8: Viewer cannot create/update/delete — gets 403."""

    async def test_viewer_cannot_create_item(self, viewer_client: AsyncClient):
        resp = await viewer_client.post(
            "/api/v1/items",
            json={"name": "Forbidden Item", "item_type": "Tool"},
        )
        assert resp.status_code == 403

    async def test_viewer_cannot_create_location(self, viewer_client: AsyncClient):
        resp = await viewer_client.post(
            "/api/v1/locations",
            json={"name": "Forbidden Location"},
        )
        assert resp.status_code == 403

    async def test_viewer_can_read_items(self, viewer_client: AsyncClient):
        resp = await viewer_client.get("/api/v1/items")
        assert resp.status_code == 200

    async def test_viewer_can_read_locations(self, viewer_client: AsyncClient):
        resp = await viewer_client.get("/api/v1/locations")
        assert resp.status_code == 200


class TestTokenValidation:
    """Test that invalid tokens are rejected."""

    async def test_invalid_bearer_token(self, db_session, unauth_client: AsyncClient):
        resp = await unauth_client.get(
            "/api/v1/items",
            headers={"Authorization": "Bearer invalid-token-here"},
        )
        assert resp.status_code == 401

    async def test_health_no_auth_required(self, unauth_client: AsyncClient):
        """Health endpoints should not require auth."""
        resp = await unauth_client.get("/api/v1/health/live")
        assert resp.status_code == 200
