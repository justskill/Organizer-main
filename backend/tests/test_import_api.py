"""Unit tests for CSV import with valid rows, invalid rows, and mixed data.

Validates: Requirements 15.4
"""

import io

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


def _csv_bytes(content: str) -> bytes:
    return content.encode("utf-8")


class TestCSVImport:
    """Test POST /api/v1/import/csv."""

    async def test_import_valid_csv(self, client: AsyncClient):
        """All valid rows are created successfully."""
        csv_content = (
            "name,item_type,brand,model_number\n"
            "Wrench,Tool,Stanley,WR-100\n"
            "Screwdriver,Tool,DeWalt,SD-200\n"
        )
        resp = await client.post(
            "/api/v1/import/csv",
            files={"file": ("items.csv", _csv_bytes(csv_content), "text/csv")},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["created"] == 2
        assert data["skipped"] == 0
        assert data["errors"] == []

    async def test_import_missing_name(self, client: AsyncClient):
        """Req 15.4: Rows missing name are skipped without aborting."""
        csv_content = (
            "name,item_type\n"
            ",Tool\n"
            "Valid Item,Equipment\n"
        )
        resp = await client.post(
            "/api/v1/import/csv",
            files={"file": ("items.csv", _csv_bytes(csv_content), "text/csv")},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["created"] == 1
        assert data["skipped"] == 1
        assert len(data["errors"]) == 1
        assert "name" in data["errors"][0]["error"].lower()

    async def test_import_missing_item_type(self, client: AsyncClient):
        """Rows missing item_type are skipped."""
        csv_content = (
            "name,item_type\n"
            "Widget,\n"
        )
        resp = await client.post(
            "/api/v1/import/csv",
            files={"file": ("items.csv", _csv_bytes(csv_content), "text/csv")},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["skipped"] == 1
        assert data["created"] == 0


    async def test_import_mixed_valid_and_invalid(self, client: AsyncClient):
        """Req 15.4: Mixed data — valid rows created, invalid rows skipped."""
        csv_content = (
            "name,item_type,brand\n"
            "Good Item 1,Tool,Bosch\n"
            ",Equipment,\n"
            "Good Item 2,Consumable,3M\n"
            "Bad Type,InvalidType,\n"
        )
        resp = await client.post(
            "/api/v1/import/csv",
            files={"file": ("items.csv", _csv_bytes(csv_content), "text/csv")},
        )
        assert resp.status_code == 200
        data = resp.json()
        # 2 valid rows, 2 invalid (missing name + invalid type)
        assert data["created"] == 2
        assert data["skipped"] == 2
        assert len(data["errors"]) == 2

    async def test_import_empty_csv(self, client: AsyncClient):
        """Empty CSV (headers only) creates nothing."""
        csv_content = "name,item_type\n"
        resp = await client.post(
            "/api/v1/import/csv",
            files={"file": ("items.csv", _csv_bytes(csv_content), "text/csv")},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["created"] == 0
        assert data["skipped"] == 0
