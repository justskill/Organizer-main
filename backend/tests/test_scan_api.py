"""Unit tests for scan resolution for active and archived entities.

Validates: Requirements 8.4
"""

import uuid
from datetime import datetime, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.conftest import create_test_item, create_test_location

pytestmark = pytest.mark.asyncio


class TestScanResolution:
    """Test GET /api/v1/scan/{code} and GET /api/v1/entities/by-code/{code}."""

    async def test_scan_active_item(self, client: AsyncClient, db_session, admin_user):
        """Req 8.4: Scanning an active item code resolves correctly."""
        item = await create_test_item(db_session, admin_user, name="Probe", code="ITM-PROBE1")
        await db_session.commit()

        resp = await client.get("/api/v1/scan/ITM-PROBE1")
        assert resp.status_code == 200
        data = resp.json()
        assert data["entity_type"] == "item"
        assert data["name"] == "Probe"
        assert data["code"] == "ITM-PROBE1"
        assert data["archived"] is False

    async def test_scan_active_location(self, client: AsyncClient, db_session):
        loc = await create_test_location(db_session, name="Shelf X", code="LOC-SHELFX")
        await db_session.commit()

        resp = await client.get("/api/v1/scan/LOC-SHELFX")
        assert resp.status_code == 200
        data = resp.json()
        assert data["entity_type"] == "location"
        assert data["name"] == "Shelf X"
        assert data["archived"] is False

    async def test_scan_archived_item(self, client: AsyncClient, db_session, admin_user):
        """Archived items should still resolve but with archived=True."""
        item = await create_test_item(
            db_session,
            admin_user,
            name="Old Meter",
            code="ITM-OLDMTR",
            archived_at=datetime.now(timezone.utc),
        )
        await db_session.commit()

        resp = await client.get("/api/v1/scan/ITM-OLDMTR")
        assert resp.status_code == 200
        data = resp.json()
        assert data["archived"] is True
        assert data["entity_type"] == "item"

    async def test_scan_archived_location(self, client: AsyncClient, db_session):
        loc = await create_test_location(
            db_session,
            name="Old Room",
            code="LOC-OLDRM1",
            archived_at=datetime.now(timezone.utc),
        )
        await db_session.commit()

        resp = await client.get("/api/v1/scan/LOC-OLDRM1")
        assert resp.status_code == 200
        assert resp.json()["archived"] is True

    async def test_scan_unknown_code(self, client: AsyncClient):
        resp = await client.get("/api/v1/scan/ITM-XXXXXX")
        assert resp.status_code == 404

    async def test_entities_by_code_alias(self, client: AsyncClient, db_session, admin_user):
        """The /entities/by-code/{code} endpoint is an alias for /scan/{code}."""
        item = await create_test_item(db_session, admin_user, name="Alias Test", code="ITM-ALIAS1")
        await db_session.commit()

        resp = await client.get("/api/v1/entities/by-code/ITM-ALIAS1")
        assert resp.status_code == 200
        assert resp.json()["name"] == "Alias Test"
