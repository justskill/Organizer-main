"""Unit tests for stock adjustment and resulting quantity calculation.

Validates: Requirements 5.1
"""

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


class TestStockAdjustment:
    """Test POST /api/v1/items/{id}/adjust-stock."""

    async def _create_consumable(self, client, name="Screws", qty="100"):
        resp = await client.post(
            "/api/v1/items",
            json={
                "name": name,
                "item_type": "Consumable",
                "is_consumable": True,
                "quantity_on_hand": qty,
                "unit_of_measure": "pcs",
            },
        )
        assert resp.status_code == 201
        return resp.json()["item"]

    async def test_add_stock(self, client: AsyncClient):
        """Req 5.1: Add stock and verify resulting quantity."""
        item = await self._create_consumable(client, qty="50")

        resp = await client.post(
            f"/api/v1/items/{item['id']}/adjust-stock",
            json={
                "transaction_type": "add",
                "quantity_delta": "25",
                "reason": "Restocked",
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["transaction_type"] == "add"
        # 50 + 25 = 75
        assert float(data["resulting_quantity"]) == 75.0

    async def test_consume_stock(self, client: AsyncClient):
        """Consume stock and verify resulting quantity."""
        item = await self._create_consumable(client, qty="100")

        resp = await client.post(
            f"/api/v1/items/{item['id']}/adjust-stock",
            json={
                "transaction_type": "consume",
                "quantity_delta": "-10",
                "reason": "Used in project",
            },
        )
        assert resp.status_code == 200
        # 100 + (-10) = 90
        assert float(resp.json()["resulting_quantity"]) == 90.0

    async def test_adjust_stock_count(self, client: AsyncClient):
        """Physical count adjustment."""
        item = await self._create_consumable(client, qty="50")

        resp = await client.post(
            f"/api/v1/items/{item['id']}/adjust-stock",
            json={
                "transaction_type": "count",
                "quantity_delta": "-5",
                "reason": "Physical count correction",
            },
        )
        assert resp.status_code == 200
        assert float(resp.json()["resulting_quantity"]) == 45.0

    async def test_multiple_adjustments(self, client: AsyncClient):
        """Multiple sequential adjustments accumulate correctly."""
        item = await self._create_consumable(client, qty="0")

        await client.post(
            f"/api/v1/items/{item['id']}/adjust-stock",
            json={"transaction_type": "add", "quantity_delta": "100"},
        )
        resp = await client.post(
            f"/api/v1/items/{item['id']}/adjust-stock",
            json={"transaction_type": "consume", "quantity_delta": "-30"},
        )
        assert resp.status_code == 200
        # 0 + 100 + (-30) = 70
        assert float(resp.json()["resulting_quantity"]) == 70.0

    async def test_invalid_transaction_type(self, client: AsyncClient):
        item = await self._create_consumable(client)
        resp = await client.post(
            f"/api/v1/items/{item['id']}/adjust-stock",
            json={"transaction_type": "invalid", "quantity_delta": "10"},
        )
        assert resp.status_code == 422
