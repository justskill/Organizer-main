"""Unit tests for media upload validation (MIME type, size limits).

Validates: Requirements 7.6
"""

import io
import uuid
from unittest.mock import patch

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


class TestMediaUploadValidation:
    """Test POST /api/v1/media/upload validation."""

    async def _create_item(self, client):
        resp = await client.post(
            "/api/v1/items",
            json={"name": "Test Item", "item_type": "Equipment"},
        )
        return resp.json()["item"]

    async def test_upload_valid_image(self, client: AsyncClient, tmp_path):
        """Req 7.6: Valid JPEG upload succeeds."""
        item = await self._create_item(client)

        # Create a minimal valid file
        file_content = b"\xff\xd8\xff\xe0" + b"\x00" * 100  # JPEG header bytes

        with patch("app.services.media_service.settings") as mock_settings:
            mock_settings.media_path = str(tmp_path)
            mock_settings.max_upload_size_bytes = 50 * 1024 * 1024

            resp = await client.post(
                "/api/v1/media/upload",
                data={"owner_type": "item", "owner_id": str(item["id"])},
                files={"file": ("photo.jpg", file_content, "image/jpeg")},
            )
        assert resp.status_code == 201
        data = resp.json()
        assert data["mime_type"] == "image/jpeg"
        assert data["original_filename"] == "photo.jpg"

    async def test_upload_disallowed_mime_type(self, client: AsyncClient):
        """Req 7.6: Disallowed MIME type is rejected."""
        item = await self._create_item(client)

        resp = await client.post(
            "/api/v1/media/upload",
            data={"owner_type": "item", "owner_id": str(item["id"])},
            files={"file": ("script.exe", b"MZ" + b"\x00" * 50, "application/x-msdownload")},
        )
        assert resp.status_code == 400
        assert "not allowed" in resp.json()["detail"].lower()

    async def test_upload_exceeds_size_limit(self, client: AsyncClient):
        """Req 7.6: File exceeding max size is rejected."""
        item = await self._create_item(client)

        # Patch max size to a tiny value for testing
        with patch("app.services.media_service.MAX_FILE_SIZE", 100):
            resp = await client.post(
                "/api/v1/media/upload",
                data={"owner_type": "item", "owner_id": str(item["id"])},
                files={"file": ("big.jpg", b"\xff" * 200, "image/jpeg")},
            )
        assert resp.status_code == 400
        assert "size" in resp.json()["detail"].lower()

    async def test_upload_pdf_allowed(self, client: AsyncClient, tmp_path):
        """PDF is an allowed MIME type."""
        item = await self._create_item(client)

        with patch("app.services.media_service.settings") as mock_settings:
            mock_settings.media_path = str(tmp_path)
            mock_settings.max_upload_size_bytes = 50 * 1024 * 1024

            resp = await client.post(
                "/api/v1/media/upload",
                data={"owner_type": "item", "owner_id": str(item["id"])},
                files={"file": ("doc.pdf", b"%PDF-1.4" + b"\x00" * 50, "application/pdf")},
            )
        assert resp.status_code == 201
        assert resp.json()["mime_type"] == "application/pdf"
