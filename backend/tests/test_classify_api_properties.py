"""Property-based tests for classification API endpoints.

Feature: auto-classification
"""

import io
import json
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from hypothesis import given, settings, HealthCheck
from hypothesis import strategies as st
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User, UserRole
from app.schemas.classification import ClassificationResult
from app.services import classification_service

pytestmark = pytest.mark.asyncio

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

VALID_MIMES = ["image/jpeg", "image/png", "image/webp"]
INVALID_MIMES = ["application/pdf", "text/plain", "image/gif", "image/bmp", "video/mp4"]

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
MAX_TOTAL_SIZE = 30 * 1024 * 1024  # 30 MB
MAX_FILES = 5

# Minimal valid JPEG (smallest valid JPEG bytes)
TINY_JPEG = (
    b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00"
    b"\xff\xdb\x00C\x00\x08\x06\x06\x07\x06\x05\x08\x07\x07\x07\t\t"
    b"\x08\n\x0c\x14\r\x0c\x0b\x0b\x0c\x19\x12\x13\x0f\x14\x1d\x1a"
    b"\x1f\x1e\x1d\x1a\x1c\x1c $.\' \",#\x1c\x1c(7),01444\x1f\'9=82<.342"
    b"\xff\xc0\x00\x0b\x08\x00\x01\x00\x01\x01\x01\x11\x00"
    b"\xff\xc4\x00\x1f\x00\x00\x01\x05\x01\x01\x01\x01\x01\x01\x00"
    b"\x00\x00\x00\x00\x00\x00\x00\x01\x02\x03\x04\x05\x06\x07\x08\t\n\x0b"
    b"\xff\xc4\x00\xb5\x10\x00\x02\x01\x03\x03\x02\x04\x03\x05\x05\x04"
    b"\x04\x00\x00\x01}\x01\x02\x03\x00\x04\x11\x05\x12!1A\x06\x13Qa\x07"
    b"\x22q\x142\x81\x91\xa1\x08#B\xb1\xc1\x15R\xd1\xf0$3br\x82\t\n\x16"
    b"\x17\x18\x19\x1a%&\'()*456789:CDEFGHIJSTUVWXYZcdefghijstuvwxyz"
    b"\x83\x84\x85\x86\x87\x88\x89\x8a\x92\x93\x94\x95\x96\x97\x98\x99"
    b"\x9a\xa2\xa3\xa4\xa5\xa6\xa7\xa8\xa9\xaa\xb2\xb3\xb4\xb5\xb6\xb7"
    b"\xb8\xb9\xba\xc2\xc3\xc4\xc5\xc6\xc7\xc8\xc9\xca\xd2\xd3\xd4\xd5"
    b"\xd6\xd7\xd8\xd9\xda\xe1\xe2\xe3\xe4\xe5\xe6\xe7\xe8\xe9\xea\xf1"
    b"\xf2\xf3\xf4\xf5\xf6\xf7\xf8\xf9\xfa"
    b"\xff\xda\x00\x08\x01\x01\x00\x00?\x00T\xdb\xa8\xa3\x01\xff\xd9"
)


def _make_file_tuple(content: bytes, filename: str = "test.jpg", mime: str = "image/jpeg"):
    """Create a file tuple for httpx multipart upload."""
    return ("files", (filename, io.BytesIO(content), mime))


# ---------------------------------------------------------------------------
# Property 6: Classification endpoint input validation
# Tag: Feature: auto-classification, Property 6: Classification endpoint input validation
# Validates: Requirements 3.8, 3.9, 3.10, 3.11
# ---------------------------------------------------------------------------


class TestClassificationEndpointInputValidation:
    """Property 6: Classification endpoint input validation

    *For any* set of uploaded files, the /api/v1/classify/image endpoint
    should accept the request if and only if: every file has a MIME type in
    {image/jpeg, image/png, image/webp}, each individual file is ≤10MB,
    the total size across all files is ≤30MB, and the file count is between
    1 and 5 inclusive. Requests violating any of these constraints should
    receive an HTTP 400 response.

    **Validates: Requirements 3.8, 3.9, 3.10, 3.11**
    """

    @given(invalid_mime=st.sampled_from(INVALID_MIMES))
    @settings(max_examples=100, suppress_health_check=[HealthCheck.function_scoped_fixture])
    async def test_invalid_mime_type_rejected(self, client: AsyncClient, invalid_mime: str):
        """Files with unsupported MIME types get 400."""
        resp = await client.post(
            "/api/v1/classify/image",
            files=[_make_file_tuple(TINY_JPEG, "bad.pdf", invalid_mime)],
        )
        assert resp.status_code == 400
        assert "unsupported type" in resp.json()["detail"]

    @given(valid_mime=st.sampled_from(VALID_MIMES))
    @settings(max_examples=100, suppress_health_check=[HealthCheck.function_scoped_fixture])
    async def test_valid_mime_type_not_rejected_for_type(self, client: AsyncClient, valid_mime: str):
        """Files with valid MIME types don't get rejected for type reasons.
        They may get 503 (no API key) but not 400 for MIME."""
        resp = await client.post(
            "/api/v1/classify/image",
            files=[_make_file_tuple(TINY_JPEG, "img.jpg", valid_mime)],
        )
        # Should not be 400 for MIME type — 503 is expected (no API key configured)
        assert resp.status_code != 400 or "unsupported type" not in resp.json().get("detail", "")

    @given(file_count=st.integers(min_value=6, max_value=10))
    @settings(max_examples=20, suppress_health_check=[HealthCheck.function_scoped_fixture])
    async def test_too_many_files_rejected(self, client: AsyncClient, file_count: int):
        """More than 5 files gets 400."""
        files = [_make_file_tuple(TINY_JPEG, f"img{i}.jpg") for i in range(file_count)]
        resp = await client.post("/api/v1/classify/image", files=files)
        assert resp.status_code == 400
        assert "Maximum" in resp.json()["detail"]

    async def test_zero_files_rejected(self, client: AsyncClient):
        """Zero files gets 400 (or 422 from FastAPI validation)."""
        resp = await client.post("/api/v1/classify/image", files=[])
        assert resp.status_code in (400, 422)

    @given(file_count=st.integers(min_value=1, max_value=5))
    @settings(max_examples=20, suppress_health_check=[HealthCheck.function_scoped_fixture])
    async def test_valid_file_count_accepted(self, client: AsyncClient, file_count: int):
        """1-5 files with valid MIME don't get rejected for count.
        503 expected since no API key is configured."""
        files = [_make_file_tuple(TINY_JPEG, f"img{i}.jpg") for i in range(file_count)]
        resp = await client.post("/api/v1/classify/image", files=files)
        # Should not be 400 for file count
        assert resp.status_code != 400 or "Maximum" not in resp.json().get("detail", "")

    async def test_oversized_individual_file_rejected(self, client: AsyncClient):
        """A single file exceeding 10MB gets 400."""
        big_content = b"\xff\xd8\xff\xe0" + b"\x00" * (MAX_FILE_SIZE + 1)
        resp = await client.post(
            "/api/v1/classify/image",
            files=[_make_file_tuple(big_content, "huge.jpg")],
        )
        assert resp.status_code == 400
        assert "exceeds 10MB" in resp.json()["detail"]

    async def test_oversized_total_payload_rejected(self, client: AsyncClient):
        """Total payload exceeding 30MB gets 400."""
        # 4 files of ~8MB each = 32MB total > 30MB
        chunk = b"\xff\xd8\xff\xe0" + b"\x00" * (8 * 1024 * 1024)
        files = [_make_file_tuple(chunk, f"img{i}.jpg") for i in range(4)]
        resp = await client.post("/api/v1/classify/image", files=files)
        assert resp.status_code == 400
        assert "30MB" in resp.json()["detail"]


# ---------------------------------------------------------------------------
# Property 8: Classification endpoint role enforcement
# Tag: Feature: auto-classification, Property 8: Classification endpoint role enforcement
# Validates: Requirements 3.12
# ---------------------------------------------------------------------------


class TestClassificationEndpointRoleEnforcement:
    """Property 8: Classification endpoint role enforcement

    *For any* request to POST /api/v1/classify/image, the endpoint should
    return HTTP 401 for unauthenticated requests and HTTP 403 for users with
    Viewer role. Only Admin and Editor roles should receive a successful
    response (given valid input and configured API key).

    **Validates: Requirements 3.12**
    """

    async def test_unauthenticated_gets_401(self, unauth_client: AsyncClient):
        """Unauthenticated requests to classify endpoint return 401."""
        resp = await unauth_client.post(
            "/api/v1/classify/image",
            files=[_make_file_tuple(TINY_JPEG)],
        )
        assert resp.status_code == 401

    async def test_viewer_gets_403(self, viewer_client: AsyncClient):
        """Viewer role gets 403 on classify endpoint."""
        resp = await viewer_client.post(
            "/api/v1/classify/image",
            files=[_make_file_tuple(TINY_JPEG)],
        )
        assert resp.status_code == 403

    async def test_admin_not_forbidden(self, client: AsyncClient):
        """Admin role is not forbidden (may get 503 for no API key, but not 403)."""
        resp = await client.post(
            "/api/v1/classify/image",
            files=[_make_file_tuple(TINY_JPEG)],
        )
        assert resp.status_code != 403

    async def test_settings_get_unauthenticated_401(self, unauth_client: AsyncClient):
        """Unauthenticated requests to settings GET return 401."""
        resp = await unauth_client.get("/api/v1/settings/classification")
        assert resp.status_code == 401

    async def test_settings_put_unauthenticated_401(self, unauth_client: AsyncClient):
        """Unauthenticated requests to settings PUT return 401."""
        resp = await unauth_client.put(
            "/api/v1/settings/classification",
            json={"model_identifier": "test/model"},
        )
        assert resp.status_code == 401

    async def test_settings_get_viewer_403(self, viewer_client: AsyncClient):
        """Viewer role gets 403 on settings GET."""
        resp = await viewer_client.get("/api/v1/settings/classification")
        assert resp.status_code == 403

    async def test_settings_put_viewer_403(self, viewer_client: AsyncClient):
        """Viewer role gets 403 on settings PUT."""
        resp = await viewer_client.put(
            "/api/v1/settings/classification",
            json={"model_identifier": "test/model"},
        )
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Property 1: Settings round-trip persistence
# Tag: Feature: auto-classification, Property 1: Settings round-trip persistence
# Validates: Requirements 1.3, 1.5
# ---------------------------------------------------------------------------


class TestSettingsRoundTripPersistence:
    """Property 1: Settings round-trip persistence

    *For any* valid model identifier string and API key string, saving
    classification settings via PUT then reading via GET should return the
    same model identifier and has_api_key: true. If the API key is
    empty/null, GET should return has_api_key: false.

    **Validates: Requirements 1.3, 1.5**
    """

    # Strategy: printable model identifiers (avoid control chars that break JSON)
    model_id_strategy = st.text(
        alphabet=st.characters(whitelist_categories=("L", "N", "P", "S"), whitelist_characters="/-_."),
        min_size=1,
        max_size=100,
    )
    api_key_strategy = st.text(min_size=1, max_size=200)

    @given(model_id=model_id_strategy, api_key=api_key_strategy)
    @settings(max_examples=50, suppress_health_check=[HealthCheck.function_scoped_fixture])
    async def test_save_then_read_with_api_key(
        self, client: AsyncClient, model_id: str, api_key: str
    ):
        """PUT with api_key then GET returns same model_identifier and has_api_key=True."""
        put_resp = await client.put(
            "/api/v1/settings/classification",
            json={"api_key": api_key, "model_identifier": model_id},
        )
        assert put_resp.status_code == 200

        get_resp = await client.get("/api/v1/settings/classification")
        assert get_resp.status_code == 200
        data = get_resp.json()
        assert data["model_identifier"] == model_id
        assert data["has_api_key"] is True

    @given(model_id=model_id_strategy)
    @settings(max_examples=50, suppress_health_check=[HealthCheck.function_scoped_fixture])
    async def test_save_empty_key_then_read(self, client: AsyncClient, model_id: str):
        """PUT with empty api_key then GET returns has_api_key=False."""
        # First set a key
        await client.put(
            "/api/v1/settings/classification",
            json={"api_key": "some-key", "model_identifier": model_id},
        )
        # Now clear it
        put_resp = await client.put(
            "/api/v1/settings/classification",
            json={"api_key": "", "model_identifier": model_id},
        )
        assert put_resp.status_code == 200

        get_resp = await client.get("/api/v1/settings/classification")
        assert get_resp.status_code == 200
        data = get_resp.json()
        assert data["model_identifier"] == model_id
        assert data["has_api_key"] is False

    @given(model_id=model_id_strategy)
    @settings(max_examples=50, suppress_health_check=[HealthCheck.function_scoped_fixture])
    async def test_save_null_key_then_read(self, client: AsyncClient, model_id: str):
        """PUT with null api_key then GET returns has_api_key=False."""
        # First set a key
        await client.put(
            "/api/v1/settings/classification",
            json={"api_key": "some-key", "model_identifier": model_id},
        )
        # Now null it
        put_resp = await client.put(
            "/api/v1/settings/classification",
            json={"api_key": None, "model_identifier": model_id},
        )
        assert put_resp.status_code == 200

        get_resp = await client.get("/api/v1/settings/classification")
        assert get_resp.status_code == 200
        data = get_resp.json()
        assert data["has_api_key"] is False

    async def test_default_settings_when_none_configured(self, client: AsyncClient):
        """GET with no settings returns default model and has_api_key=False."""
        resp = await client.get("/api/v1/settings/classification")
        assert resp.status_code == 200
        data = resp.json()
        assert data["model_identifier"] == "google/gemini-2.5-flash-lite"
        assert data["has_api_key"] is False


# ---------------------------------------------------------------------------
# Property 3: GET settings never exposes raw API key
# Tag: Feature: auto-classification, Property 3: GET settings never exposes raw API key
# Validates: Requirements 7.5
# ---------------------------------------------------------------------------


class TestGetSettingsNeverExposesApiKey:
    """Property 3: GET settings never exposes raw API key

    *For any* stored classification configuration (with or without an API
    key), the GET /api/v1/settings/classification response JSON should never
    contain the plaintext API key value anywhere in the response body.

    **Validates: Requirements 7.5**
    """

    @given(
        api_key=st.text(min_size=5, max_size=200).filter(lambda s: s.strip()),
    )
    @settings(max_examples=100, suppress_health_check=[HealthCheck.function_scoped_fixture])
    async def test_api_key_not_in_get_response(self, client: AsyncClient, api_key: str):
        """After saving an API key, the GET response body never contains the raw key."""
        await client.put(
            "/api/v1/settings/classification",
            json={"api_key": api_key, "model_identifier": "test/model"},
        )

        get_resp = await client.get("/api/v1/settings/classification")
        assert get_resp.status_code == 200

        # The raw API key must not appear anywhere in the response text
        response_text = get_resp.text
        assert api_key not in response_text

        # Verify the response only has expected fields
        data = get_resp.json()
        assert set(data.keys()) == {"model_identifier", "has_api_key"}
        assert data["has_api_key"] is True
