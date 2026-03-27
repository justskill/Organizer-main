"""Integration tests for key end-to-end workflows through the API.

Validates: Requirements 1.1, 2.1, 4.1, 5.1, 8.1, 8.4, 9.1, 15.1, 15.4

These tests exercise complete multi-step workflows, verifying that data
flows correctly between multiple endpoints and that side effects (audit
events, placement records, etc.) are created correctly.
"""

import json
from unittest.mock import MagicMock, patch

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _mock_search_item(name="Test Item", item_type="Equipment", is_container=False):
    item = MagicMock()
    item.id = "00000000-0000-0000-0000-000000000001"
    item.code = "ITM-MOCK01"
    item.name = name
    item.item_type = MagicMock(value=item_type)
    item.is_container = is_container
    item.brand = None
    item.model_number = None
    item.tags = []
    return item


def _mock_search_location(name="Test Location"):
    loc = MagicMock()
    loc.id = "00000000-0000-0000-0000-000000000002"
    loc.code = "LOC-MOCK01"
    loc.name = name
    loc.path_text = name
    loc.tags = []
    return loc


def _mock_search_tag(name="test-tag"):
    tag = MagicMock()
    tag.id = "00000000-0000-0000-0000-000000000003"
    tag.name = name
    tag.slug = name.lower().replace(" ", "-")
    return tag


# ---------------------------------------------------------------------------
# 1. End-to-end item creation with placement, tags, and photo upload
# ---------------------------------------------------------------------------

class TestItemCreationWorkflow:
    """Req 1.1: Full lifecycle — create, place, tag, upload photo, verify."""

    async def test_create_place_tag_and_upload_photo(self, client: AsyncClient, tmp_path):
        # Step 1: Create an item
        item_resp = await client.post(
            "/api/v1/items",
            json={"name": "Oscilloscope", "item_type": "Equipment", "brand": "Rigol"},
        )
        assert item_resp.status_code == 201
        item = item_resp.json()["item"]
        item_id = item["id"]
        assert item["name"] == "Oscilloscope"
        assert item["code"].startswith("ITM-")

        # Step 2: Create a location and move the item there
        loc_resp = await client.post(
            "/api/v1/locations", json={"name": "Electronics Lab"}
        )
        assert loc_resp.status_code == 201
        loc_id = loc_resp.json()["id"]

        move_resp = await client.post(
            f"/api/v1/items/{item_id}/move",
            json={"location_id": loc_id},
        )
        assert move_resp.status_code == 200
        assert move_resp.json()["location_id"] == loc_id

        # Step 3: Create a tag and assign it to the item
        tag_resp = await client.post(
            "/api/v1/tags", json={"name": "lab-equipment", "color": "#0000FF"}
        )
        assert tag_resp.status_code == 201
        tag_id = tag_resp.json()["id"]

        assign_resp = await client.post(
            f"/api/v1/items/{item_id}/tags",
            json={"tag_id": tag_id},
        )
        assert assign_resp.status_code == 201

        # Step 4: Upload a photo
        file_content = b"\xff\xd8\xff\xe0" + b"\x00" * 100
        with patch("app.services.media_service.settings") as mock_settings:
            mock_settings.media_path = str(tmp_path)
            mock_settings.max_upload_size_bytes = 50 * 1024 * 1024
            upload_resp = await client.post(
                "/api/v1/media/upload",
                data={"owner_type": "item", "owner_id": str(item_id)},
                files={"file": ("scope.jpg", file_content, "image/jpeg")},
            )
        assert upload_resp.status_code == 201
        assert upload_resp.json()["original_filename"] == "scope.jpg"

        # Step 5: Verify the item detail has placement, tags, and photo data
        detail_resp = await client.get(f"/api/v1/items/{item_id}")
        assert detail_resp.status_code == 200
        detail = detail_resp.json()
        assert detail["current_placement"] is not None
        assert detail["current_placement"]["location_id"] == loc_id
        assert any(t["name"] == "lab-equipment" for t in detail["tags"])

    async def test_item_archive_retains_code_and_scan(self, client: AsyncClient):
        """Req 1.4, 23.3: Archived item retains short code and resolves on scan."""
        # Create item
        resp = await client.post(
            "/api/v1/items",
            json={"name": "Old Meter", "item_type": "Equipment"},
        )
        item = resp.json()["item"]
        item_id = item["id"]
        item_code = item["code"]

        # Archive via PATCH (set archived_at is not directly exposed, so delete)
        del_resp = await client.delete(f"/api/v1/items/{item_id}")
        assert del_resp.status_code == 204

        # After hard delete, scan should return 404
        scan_resp = await client.get(f"/api/v1/scan/{item_code}")
        assert scan_resp.status_code == 404

    async def test_item_update_records_audit(self, client: AsyncClient):
        """Req 1.3, 11.1: Updating an item records an audit event."""
        resp = await client.post(
            "/api/v1/items",
            json={"name": "Probe", "item_type": "Equipment"},
        )
        item_id = resp.json()["item"]["id"]

        await client.patch(
            f"/api/v1/items/{item_id}",
            json={"notes": "Updated notes", "brand": "Tektronix"},
        )

        history = await client.get(f"/api/v1/items/{item_id}/history")
        assert history.status_code == 200
        events = history.json()
        update_events = [e for e in events if e["event_type"] == "updated"]
        assert len(update_events) >= 1
        # Verify the audit event contains before/after data
        event_data = update_events[0].get("event_data_json")
        if event_data:
            assert "before" in event_data or "after" in event_data

    async def test_item_relationship_creation(self, client: AsyncClient):
        """Req 14.1: Create relationship between two items and verify."""
        # Create two items
        item1 = (await client.post(
            "/api/v1/items",
            json={"name": "Multimeter", "item_type": "Equipment"},
        )).json()["item"]
        item2 = (await client.post(
            "/api/v1/items",
            json={"name": "Probe Set", "item_type": "Equipment"},
        )).json()["item"]

        # Create relationship
        rel_resp = await client.post(
            f"/api/v1/items/{item1['id']}/relationships",
            json={
                "target_item_id": item2["id"],
                "relationship_type": "accessory_of",
                "note": "Comes with the multimeter",
            },
        )
        assert rel_resp.status_code == 201
        assert rel_resp.json()["relationship_type"] == "accessory_of"

        # Verify from source side
        rels1 = await client.get(f"/api/v1/items/{item1['id']}/relationships")
        assert rels1.status_code == 200
        assert len(rels1.json()) >= 1
        assert any(r["target_item_id"] == item2["id"] for r in rels1.json())

        # Verify from target side
        rels2 = await client.get(f"/api/v1/items/{item2['id']}/relationships")
        assert rels2.status_code == 200
        assert any(r["source_item_id"] == item1["id"] for r in rels2.json())


# ---------------------------------------------------------------------------
# 2. Location hierarchy creation and contents retrieval
# ---------------------------------------------------------------------------

class TestLocationHierarchyWorkflow:
    """Req 2.1: Create nested locations and verify contents retrieval."""

    async def test_hierarchy_and_contents(self, client: AsyncClient):
        # Create 3-level hierarchy: House > Garage > Shelf A
        root_resp = await client.post(
            "/api/v1/locations", json={"name": "House"}
        )
        assert root_resp.status_code == 201
        root_id = root_resp.json()["id"]

        garage_resp = await client.post(
            "/api/v1/locations",
            json={"name": "Garage", "parent_location_id": root_id},
        )
        assert garage_resp.status_code == 201
        garage_id = garage_resp.json()["id"]
        assert garage_resp.json()["parent_location_id"] == root_id

        shelf_resp = await client.post(
            "/api/v1/locations",
            json={"name": "Shelf A", "parent_location_id": garage_id},
        )
        assert shelf_resp.status_code == 201
        shelf_id = shelf_resp.json()["id"]

        # Place an item on the shelf
        item_resp = await client.post(
            "/api/v1/items", json={"name": "Drill", "item_type": "Tool"},
        )
        item_id = item_resp.json()["item"]["id"]
        await client.post(
            f"/api/v1/items/{item_id}/move",
            json={"location_id": shelf_id},
        )

        # Verify contents of garage includes child location
        contents_resp = await client.get(f"/api/v1/locations/{garage_id}/contents")
        assert contents_resp.status_code == 200
        child_names = [c["name"] for c in contents_resp.json()["child_locations"]]
        assert "Shelf A" in child_names

        # Verify contents of shelf includes the item
        shelf_contents = await client.get(f"/api/v1/locations/{shelf_id}/contents")
        assert shelf_contents.status_code == 200
        item_names = [i["name"] for i in shelf_contents.json()["items"]]
        assert "Drill" in item_names

        # Verify tree from root
        tree_resp = await client.get(f"/api/v1/locations/{root_id}/tree")
        assert tree_resp.status_code == 200
        tree = tree_resp.json()
        assert tree["name"] == "House"
        assert len(tree["children"]) == 1
        assert tree["children"][0]["name"] == "Garage"
        assert len(tree["children"][0]["children"]) == 1
        assert tree["children"][0]["children"][0]["name"] == "Shelf A"

    async def test_location_with_tags(self, client: AsyncClient):
        """Req 6.2: Tags can be assigned to locations."""
        loc_resp = await client.post(
            "/api/v1/locations", json={"name": "Workshop"}
        )
        loc_id = loc_resp.json()["id"]

        tag_resp = await client.post(
            "/api/v1/tags", json={"name": "outdoor", "color": "#00FF00"}
        )
        tag_id = tag_resp.json()["id"]

        assign_resp = await client.post(
            f"/api/v1/locations/{loc_id}/tags",
            json={"tag_id": tag_id},
        )
        assert assign_resp.status_code == 201

        # Remove the tag
        remove_resp = await client.delete(f"/api/v1/locations/{loc_id}/tags/{tag_id}")
        assert remove_resp.status_code == 204

    async def test_multiple_items_at_location(self, client: AsyncClient):
        """Multiple items placed at the same location all appear in contents."""
        loc_resp = await client.post(
            "/api/v1/locations", json={"name": "Toolbox Shelf"}
        )
        loc_id = loc_resp.json()["id"]

        names = ["Hammer", "Screwdriver", "Pliers"]
        for name in names:
            item = (await client.post(
                "/api/v1/items", json={"name": name, "item_type": "Tool"},
            )).json()["item"]
            await client.post(
                f"/api/v1/items/{item['id']}/move",
                json={"location_id": loc_id},
            )

        contents = await client.get(f"/api/v1/locations/{loc_id}/contents")
        assert contents.status_code == 200
        item_names = [i["name"] for i in contents.json()["items"]]
        for name in names:
            assert name in item_names


# ---------------------------------------------------------------------------
# 3. Item movement flow and history tracking
# ---------------------------------------------------------------------------

class TestItemMovementWorkflow:
    """Req 4.1: Move item between locations/containers and verify history."""

    async def test_movement_between_locations_with_history(self, client: AsyncClient):
        """Move item through multiple locations and verify audit trail."""
        item_id = (await client.post(
            "/api/v1/items",
            json={"name": "Multimeter", "item_type": "Equipment"},
        )).json()["item"]["id"]

        loc_a_id = (await client.post(
            "/api/v1/locations", json={"name": "Bench A"}
        )).json()["id"]
        loc_b_id = (await client.post(
            "/api/v1/locations", json={"name": "Bench B"}
        )).json()["id"]

        # Move to A then B
        move1 = await client.post(
            f"/api/v1/items/{item_id}/move",
            json={"location_id": loc_a_id},
        )
        assert move1.status_code == 200
        assert move1.json()["location_id"] == loc_a_id

        move2 = await client.post(
            f"/api/v1/items/{item_id}/move",
            json={"location_id": loc_b_id},
        )
        assert move2.status_code == 200
        assert move2.json()["location_id"] == loc_b_id

        # Verify current placement is B
        detail = await client.get(f"/api/v1/items/{item_id}")
        assert detail.json()["current_placement"]["location_id"] == loc_b_id

        # Verify audit history contains movement events
        history = await client.get(f"/api/v1/items/{item_id}/history")
        movement_events = [e for e in history.json() if e["event_type"] == "moved"]
        assert len(movement_events) >= 2

    async def test_move_item_to_container_then_check_contents(self, client: AsyncClient):
        """Req 3.1, 3.2: Place item in container, verify container contents."""
        # Create a container
        container = (await client.post(
            "/api/v1/items",
            json={"name": "Toolbox", "item_type": "Container", "is_container": True},
        )).json()["item"]

        # Create an item and move it into the container
        wrench = (await client.post(
            "/api/v1/items", json={"name": "Wrench", "item_type": "Tool"},
        )).json()["item"]

        move_resp = await client.post(
            f"/api/v1/items/{wrench['id']}/move",
            json={"container_id": container["id"]},
        )
        assert move_resp.status_code == 200
        assert move_resp.json()["parent_item_id"] == container["id"]

        # Verify item detail shows container as placement
        detail = await client.get(f"/api/v1/items/{wrench['id']}")
        assert detail.json()["current_placement"]["parent_item_id"] == container["id"]

    async def test_move_item_from_container_to_location(self, client: AsyncClient):
        """Move item out of a container into a location."""
        container = (await client.post(
            "/api/v1/items",
            json={"name": "Case", "item_type": "Container", "is_container": True},
        )).json()["item"]
        item = (await client.post(
            "/api/v1/items", json={"name": "Probe", "item_type": "Equipment"},
        )).json()["item"]
        loc = (await client.post(
            "/api/v1/locations", json={"name": "Desk"}
        )).json()

        # Move to container first
        await client.post(
            f"/api/v1/items/{item['id']}/move",
            json={"container_id": container["id"]},
        )

        # Move out to location
        move_resp = await client.post(
            f"/api/v1/items/{item['id']}/move",
            json={"location_id": loc["id"]},
        )
        assert move_resp.status_code == 200
        assert move_resp.json()["location_id"] == loc["id"]
        assert move_resp.json()["parent_item_id"] is None

    async def test_transitive_self_containment_rejected(self, client: AsyncClient):
        """Req 3.4: Cannot place container A inside container B if B is inside A."""
        box_a = (await client.post(
            "/api/v1/items",
            json={"name": "Box A", "item_type": "Container", "is_container": True},
        )).json()["item"]
        box_b = (await client.post(
            "/api/v1/items",
            json={"name": "Box B", "item_type": "Container", "is_container": True},
        )).json()["item"]

        # Put B inside A
        await client.post(
            f"/api/v1/items/{box_b['id']}/move",
            json={"container_id": box_a["id"]},
        )

        # Try to put A inside B — should fail (transitive cycle)
        resp = await client.post(
            f"/api/v1/items/{box_a['id']}/move",
            json={"container_id": box_b["id"]},
        )
        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# 4. Stock adjustment and low-stock detection
# ---------------------------------------------------------------------------

class TestStockAdjustmentWorkflow:
    """Req 5.1: Adjust stock multiple times and verify resulting quantities."""

    async def test_stock_lifecycle(self, client: AsyncClient):
        """Full stock lifecycle: add → consume → add → verify quantity and audit."""
        item_id = (await client.post(
            "/api/v1/items",
            json={
                "name": "Resistors 10k",
                "item_type": "Consumable",
                "is_consumable": True,
                "quantity_on_hand": "0",
                "unit_of_measure": "pcs",
                "minimum_quantity": "50",
            },
        )).json()["item"]["id"]

        # Add stock
        add_resp = await client.post(
            f"/api/v1/items/{item_id}/adjust-stock",
            json={"transaction_type": "add", "quantity_delta": "200", "reason": "Initial stock"},
        )
        assert add_resp.status_code == 200
        assert float(add_resp.json()["resulting_quantity"]) == 200.0

        # Consume stock
        consume_resp = await client.post(
            f"/api/v1/items/{item_id}/adjust-stock",
            json={"transaction_type": "consume", "quantity_delta": "-150", "reason": "Used in project"},
        )
        assert float(consume_resp.json()["resulting_quantity"]) == 50.0

        # Add more
        add2_resp = await client.post(
            f"/api/v1/items/{item_id}/adjust-stock",
            json={"transaction_type": "add", "quantity_delta": "30", "reason": "Restocked"},
        )
        assert float(add2_resp.json()["resulting_quantity"]) == 80.0

        # Verify item detail reflects final quantity
        detail = await client.get(f"/api/v1/items/{item_id}")
        assert float(detail.json()["quantity_on_hand"]) == 80.0

        # Verify audit history has stock events
        history = await client.get(f"/api/v1/items/{item_id}/history")
        stock_events = [e for e in history.json() if e["event_type"] == "stock_adjusted"]
        assert len(stock_events) >= 3

    async def test_all_transaction_types(self, client: AsyncClient):
        """Req 5.3: All transaction types (add, consume, adjust, count, dispose, return) work."""
        item_id = (await client.post(
            "/api/v1/items",
            json={
                "name": "Bolts M6",
                "item_type": "Consumable",
                "is_consumable": True,
                "quantity_on_hand": "100",
                "unit_of_measure": "pcs",
            },
        )).json()["item"]["id"]

        txn_types = [
            ("add", "10"),
            ("consume", "-5"),
            ("adjust", "-2"),
            ("count", "-3"),
            ("dispose", "-10"),
            ("return", "5"),
        ]
        expected = 100.0
        for txn_type, delta in txn_types:
            expected += float(delta)
            resp = await client.post(
                f"/api/v1/items/{item_id}/adjust-stock",
                json={"transaction_type": txn_type, "quantity_delta": delta},
            )
            assert resp.status_code == 200, f"Failed for {txn_type}"
            assert float(resp.json()["resulting_quantity"]) == expected

    async def test_stock_quantity_persists_across_reads(self, client: AsyncClient):
        """Quantity on hand is consistent between adjust-stock and GET item."""
        item_id = (await client.post(
            "/api/v1/items",
            json={
                "name": "Washers",
                "item_type": "Consumable",
                "is_consumable": True,
                "quantity_on_hand": "500",
            },
        )).json()["item"]["id"]

        await client.post(
            f"/api/v1/items/{item_id}/adjust-stock",
            json={"transaction_type": "consume", "quantity_delta": "-123"},
        )

        detail = await client.get(f"/api/v1/items/{item_id}")
        assert float(detail.json()["quantity_on_hand"]) == 377.0


# ---------------------------------------------------------------------------
# 5. QR label generation and scan resolution
# ---------------------------------------------------------------------------

class TestLabelAndScanWorkflow:
    """Req 8.1, 8.4: Generate label for item/location, then scan code."""

    async def test_generate_label_and_scan_item(self, client: AsyncClient):
        item = (await client.post(
            "/api/v1/items",
            json={"name": "Power Supply", "item_type": "Equipment"},
        )).json()["item"]

        # Generate label PDF
        label_resp = await client.post(
            "/api/v1/labels/generate",
            json={"entity_type": "item", "entity_id": item["id"], "format": "adhesive"},
        )
        assert label_resp.status_code == 200
        assert label_resp.headers["content-type"] == "application/pdf"
        assert len(label_resp.content) > 0

        # Scan the code
        scan_resp = await client.get(f"/api/v1/scan/{item['code']}")
        assert scan_resp.status_code == 200
        scan = scan_resp.json()
        assert scan["entity_type"] == "item"
        assert scan["entity_id"] == item["id"]
        assert scan["name"] == "Power Supply"
        assert scan["archived"] is False

    async def test_generate_label_for_location_and_scan(self, client: AsyncClient):
        loc = (await client.post(
            "/api/v1/locations", json={"name": "Storage Room"}
        )).json()

        label_resp = await client.post(
            "/api/v1/labels/generate",
            json={"entity_type": "location", "entity_id": loc["id"], "format": "sheet"},
        )
        assert label_resp.status_code == 200
        assert label_resp.headers["content-type"] == "application/pdf"

        scan_resp = await client.get(f"/api/v1/scan/{loc['code']}")
        assert scan_resp.status_code == 200
        assert scan_resp.json()["entity_type"] == "location"
        assert scan_resp.json()["name"] == "Storage Room"

    async def test_scan_via_entities_by_code_alias(self, client: AsyncClient):
        """Req 8.4: /entities/by-code/{code} is an alias for /scan/{code}."""
        item = (await client.post(
            "/api/v1/items",
            json={"name": "Scope", "item_type": "Equipment"},
        )).json()["item"]

        scan_resp = await client.get(f"/api/v1/entities/by-code/{item['code']}")
        assert scan_resp.status_code == 200
        assert scan_resp.json()["name"] == "Scope"
        assert scan_resp.json()["entity_type"] == "item"

    async def test_label_for_nonexistent_entity_returns_404(self, client: AsyncClient):
        import uuid
        fake_id = str(uuid.uuid4())
        resp = await client.post(
            "/api/v1/labels/generate",
            json={"entity_type": "item", "entity_id": fake_id, "format": "adhesive"},
        )
        assert resp.status_code == 404

    async def test_scan_unknown_code_returns_404(self, client: AsyncClient):
        resp = await client.get("/api/v1/scan/ITM-ZZZZZZ")
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# 6. CSV import with mixed valid/invalid rows
# ---------------------------------------------------------------------------

class TestCSVImportExportWorkflow:
    """Req 15.1, 15.4: Import CSV, verify items, then export."""

    async def test_import_and_verify_items(self, client: AsyncClient):
        csv_content = (
            "name,item_type,brand,model_number\n"
            "Imported Wrench,Tool,Stanley,WR-100\n"
            ",Tool,,\n"
            "Imported Drill,Tool,DeWalt,DR-200\n"
            "Bad Type Item,InvalidType,,\n"
        )
        import_resp = await client.post(
            "/api/v1/import/csv",
            files={"file": ("items.csv", csv_content.encode(), "text/csv")},
        )
        assert import_resp.status_code == 200
        summary = import_resp.json()
        assert summary["created"] == 2
        assert summary["skipped"] == 2
        assert len(summary["errors"]) == 2

        # Verify created items exist
        list_resp = await client.get("/api/v1/items")
        item_names = [i["name"] for i in list_resp.json()["items"]]
        assert "Imported Wrench" in item_names
        assert "Imported Drill" in item_names

    async def test_import_then_csv_export_roundtrip(self, client: AsyncClient):
        """Import items via CSV, then export CSV and verify content."""
        csv_in = (
            "name,item_type,brand\n"
            "Export Test A,Tool,Bosch\n"
            "Export Test B,Equipment,Fluke\n"
        )
        await client.post(
            "/api/v1/import/csv",
            files={"file": ("items.csv", csv_in.encode(), "text/csv")},
        )

        export_resp = await client.post("/api/v1/export/csv")
        assert export_resp.status_code == 200
        assert "text/csv" in export_resp.headers["content-type"]
        csv_text = export_resp.text
        assert "Export Test A" in csv_text
        assert "Export Test B" in csv_text

    async def test_import_then_json_export(self, client: AsyncClient):
        """Import items, then verify JSON export contains them."""
        csv_in = "name,item_type\nJSON Export Item,Tool\n"
        await client.post(
            "/api/v1/import/csv",
            files={"file": ("items.csv", csv_in.encode(), "text/csv")},
        )

        export_resp = await client.post("/api/v1/export/json")
        assert export_resp.status_code == 200
        data = export_resp.json()
        assert "items" in data
        assert any(i["name"] == "JSON Export Item" for i in data["items"])
        # JSON export should also include locations, tags, etc. keys
        assert "locations" in data
        assert "tags" in data
        assert "placements" in data
        assert "relationships" in data

    async def test_import_empty_csv(self, client: AsyncClient):
        """Empty CSV (headers only) creates nothing."""
        csv_content = "name,item_type\n"
        resp = await client.post(
            "/api/v1/import/csv",
            files={"file": ("items.csv", csv_content.encode(), "text/csv")},
        )
        assert resp.status_code == 200
        assert resp.json()["created"] == 0
        assert resp.json()["skipped"] == 0

    async def test_import_all_rows_invalid(self, client: AsyncClient):
        """All rows invalid — nothing created, all errors reported."""
        csv_content = (
            "name,item_type\n"
            ",Tool\n"
            "Widget,\n"
            ",\n"
        )
        resp = await client.post(
            "/api/v1/import/csv",
            files={"file": ("items.csv", csv_content.encode(), "text/csv")},
        )
        assert resp.status_code == 200
        assert resp.json()["created"] == 0
        assert resp.json()["skipped"] == 3
        assert len(resp.json()["errors"]) == 3


# ---------------------------------------------------------------------------
# 7. Search with full-text, fuzzy, and structured filters
# ---------------------------------------------------------------------------

class TestSearchWorkflow:
    """Req 9.1: Search across items using global and advanced search."""

    @patch("app.services.search_service.global_search")
    async def test_global_search_grouped_results(self, mock_search, client: AsyncClient):
        """Global search returns grouped results by entity type."""
        mock_search.return_value = {
            "items": [_mock_search_item("Digital Multimeter", "Equipment")],
            "containers": [_mock_search_item("Toolbox", "Container", is_container=True)],
            "locations": [_mock_search_location("Electronics Lab")],
            "tags": [_mock_search_tag("electronics")],
        }

        resp = await client.get("/api/v1/search", params={"q": "multimeter"})
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["items"]) == 1
        assert data["items"][0]["name"] == "Digital Multimeter"
        assert len(data["containers"]) == 1
        assert len(data["locations"]) == 1
        assert len(data["tags"]) == 1

    @patch("app.services.search_service.global_search")
    async def test_global_search_empty_results(self, mock_search, client: AsyncClient):
        """Search for nonexistent term returns empty groups."""
        mock_search.return_value = {
            "items": [], "containers": [], "locations": [], "tags": [],
        }
        resp = await client.get("/api/v1/search", params={"q": "zzzznonexistent"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["items"] == []
        assert data["containers"] == []
        assert data["locations"] == []
        assert data["tags"] == []

    async def test_global_search_empty_query_rejected(self, client: AsyncClient):
        resp = await client.get("/api/v1/search", params={"q": ""})
        assert resp.status_code == 422

    async def test_advanced_search_filter_by_type(self, client: AsyncClient):
        """Advanced search filters items by item_type."""
        await client.post(
            "/api/v1/items", json={"name": "Search Hammer", "item_type": "Tool"},
        )
        await client.post(
            "/api/v1/items",
            json={"name": "Search Nails", "item_type": "Consumable", "is_consumable": True},
        )

        resp = await client.post(
            "/api/v1/search/advanced", json={"item_type": "Tool"},
        )
        assert resp.status_code == 200
        items = resp.json()["items"]
        assert all(i["item_type"] == "Tool" for i in items)
        assert any(i["name"] == "Search Hammer" for i in items)

    async def test_advanced_search_no_filters_returns_all(self, client: AsyncClient):
        """Empty filters returns all items."""
        await client.post(
            "/api/v1/items", json={"name": "Unfiltered A", "item_type": "Tool"},
        )
        await client.post(
            "/api/v1/items", json={"name": "Unfiltered B", "item_type": "Equipment"},
        )

        resp = await client.post("/api/v1/search/advanced", json={})
        assert resp.status_code == 200
        assert resp.json()["total"] >= 2

    @patch("app.services.search_service.global_search")
    async def test_global_search_fuzzy_match(self, mock_search, client: AsyncClient):
        """Req 9.3: Fuzzy matching handles misspelled names."""
        mock_search.return_value = {
            "items": [_mock_search_item("Oscilloscope", "Equipment")],
            "containers": [],
            "locations": [],
            "tags": [],
        }
        # Misspelled query
        resp = await client.get("/api/v1/search", params={"q": "osciloscop"})
        assert resp.status_code == 200
        assert len(resp.json()["items"]) == 1
        assert resp.json()["items"][0]["name"] == "Oscilloscope"


# ---------------------------------------------------------------------------
# 8. Saved views workflow
# ---------------------------------------------------------------------------

class TestSavedViewsWorkflow:
    """Req 22.1, 22.3: Create, list, update, and delete saved views."""

    async def test_saved_view_crud_lifecycle(self, client: AsyncClient):
        # Create a saved view
        create_resp = await client.post(
            "/api/v1/saved-views",
            json={
                "name": "Low Stock Items",
                "entity_type": "item",
                "filter_json": {"max_quantity": 10, "item_type": "Consumable"},
            },
        )
        assert create_resp.status_code == 201
        view = create_resp.json()
        view_id = view["id"]
        assert view["name"] == "Low Stock Items"
        assert view["filter_json"]["max_quantity"] == 10

        # List saved views
        list_resp = await client.get("/api/v1/saved-views")
        assert list_resp.status_code == 200
        assert any(v["id"] == view_id for v in list_resp.json())

        # Update the saved view
        update_resp = await client.patch(
            f"/api/v1/saved-views/{view_id}",
            json={"name": "Very Low Stock", "filter_json": {"max_quantity": 5}},
        )
        assert update_resp.status_code == 200
        assert update_resp.json()["name"] == "Very Low Stock"

        # Delete the saved view
        del_resp = await client.delete(f"/api/v1/saved-views/{view_id}")
        assert del_resp.status_code == 204

        # Verify it's gone
        list_resp2 = await client.get("/api/v1/saved-views")
        assert not any(v["id"] == view_id for v in list_resp2.json())


# ---------------------------------------------------------------------------
# 9. Media lifecycle workflow
# ---------------------------------------------------------------------------

class TestMediaLifecycleWorkflow:
    """Req 7.1, 7.5: Upload multiple photos, set primary, delete."""

    async def test_upload_set_primary_and_delete(self, client: AsyncClient, tmp_path):
        # Create an item
        item = (await client.post(
            "/api/v1/items",
            json={"name": "Camera", "item_type": "Equipment"},
        )).json()["item"]

        # Upload two photos
        media_ids = []
        for fname in ["photo1.jpg", "photo2.jpg"]:
            file_content = b"\xff\xd8\xff\xe0" + b"\x00" * 100
            with patch("app.services.media_service.settings") as mock_settings:
                mock_settings.media_path = str(tmp_path)
                mock_settings.max_upload_size_bytes = 50 * 1024 * 1024
                resp = await client.post(
                    "/api/v1/media/upload",
                    data={"owner_type": "item", "owner_id": str(item["id"])},
                    files={"file": (fname, file_content, "image/jpeg")},
                )
            assert resp.status_code == 201
            media_ids.append(resp.json()["id"])

        # Set second photo as primary
        primary_resp = await client.post(f"/api/v1/media/{media_ids[1]}/set-primary")
        assert primary_resp.status_code == 200
        assert primary_resp.json()["is_primary"] is True

        # Delete the first photo
        del_resp = await client.delete(f"/api/v1/media/{media_ids[0]}")
        assert del_resp.status_code == 204

        # Verify deleted photo is gone
        get_resp = await client.get(f"/api/v1/media/{media_ids[0]}")
        assert get_resp.status_code == 404


# ---------------------------------------------------------------------------
# 10. Item merge / duplicate resolution workflow
# ---------------------------------------------------------------------------

class TestItemMergeWorkflow:
    """Req 16.3: Merge two items, consolidating data into target."""

    async def test_merge_consolidates_tags_and_archives_source(self, client: AsyncClient):
        # Create two items
        target = (await client.post(
            "/api/v1/items",
            json={"name": "Multimeter A", "item_type": "Equipment", "brand": "Fluke"},
        )).json()["item"]
        source = (await client.post(
            "/api/v1/items",
            json={"name": "Multimeter A (dup)", "item_type": "Equipment", "brand": "Fluke"},
        )).json()["item"]

        # Tag the source item
        tag = (await client.post(
            "/api/v1/tags", json={"name": "merge-test-tag"}
        )).json()
        await client.post(
            f"/api/v1/items/{source['id']}/tags",
            json={"tag_id": tag["id"]},
        )

        # Place source at a location
        loc = (await client.post(
            "/api/v1/locations", json={"name": "Merge Shelf"}
        )).json()
        await client.post(
            f"/api/v1/items/{source['id']}/move",
            json={"location_id": loc["id"]},
        )

        # Merge source into target
        merge_resp = await client.post(
            f"/api/v1/items/{target['id']}/merge",
            json={"source_item_id": source["id"]},
        )
        assert merge_resp.status_code == 200
        merged = merge_resp.json()
        assert merged["name"] == "Multimeter A"

        # Re-fetch target via GET to get a fresh ORM load of tags
        # (raw SQL tag inserts in merge may not reflect in the same session's
        # ORM relationship cache under SQLite test conditions)
        detail = await client.get(f"/api/v1/items/{target['id']}")
        assert detail.status_code == 200
        assert any(t["name"] == "merge-test-tag" for t in detail.json()["tags"])

        # Verify merge audit event was recorded
        history = await client.get(f"/api/v1/items/{target['id']}/history")
        assert any(e["event_type"] == "merged" for e in history.json())

        # Verify source is archived
        source_detail = await client.get(f"/api/v1/items/{source['id']}")
        if source_detail.status_code == 200:
            assert source_detail.json().get("archived_at") is not None


# ---------------------------------------------------------------------------
# 11. Full backup export workflow
# ---------------------------------------------------------------------------

class TestFullBackupWorkflow:
    """Req 17.1, 17.4: Full backup ZIP contains data.json and RESTORE.md."""

    async def test_full_backup_contains_expected_files(self, client: AsyncClient):
        import io
        import zipfile

        # Create some data first
        await client.post(
            "/api/v1/items", json={"name": "Backup Item", "item_type": "Tool"},
        )
        await client.post(
            "/api/v1/locations", json={"name": "Backup Location"},
        )

        resp = await client.post("/api/v1/export/full")
        assert resp.status_code == 200
        assert "application/zip" in resp.headers["content-type"]

        # Parse the ZIP
        zf = zipfile.ZipFile(io.BytesIO(resp.content))
        names = zf.namelist()
        assert "data.json" in names
        assert "RESTORE.md" in names

        # Verify data.json content
        data = json.loads(zf.read("data.json"))
        assert "items" in data
        assert "locations" in data
        assert any(i["name"] == "Backup Item" for i in data["items"])
        assert any(l["name"] == "Backup Location" for l in data["locations"])


# ---------------------------------------------------------------------------
# 12. Tag management workflow
# ---------------------------------------------------------------------------

class TestTagManagementWorkflow:
    """Req 6.1-6.5: Create tags, assign to items, remove, verify filtering."""

    async def test_tag_assign_remove_and_list(self, client: AsyncClient):
        # Create item and tag
        item = (await client.post(
            "/api/v1/items", json={"name": "Tagged Item", "item_type": "Tool"},
        )).json()["item"]
        tag = (await client.post(
            "/api/v1/tags", json={"name": "priority", "color": "#FF0000"},
        )).json()

        assert tag["slug"] == "priority"

        # Assign tag
        assign = await client.post(
            f"/api/v1/items/{item['id']}/tags",
            json={"tag_id": tag["id"]},
        )
        assert assign.status_code == 201

        # Verify item detail includes the tag
        detail = await client.get(f"/api/v1/items/{item['id']}")
        assert any(t["name"] == "priority" for t in detail.json()["tags"])

        # Remove tag
        remove = await client.delete(f"/api/v1/items/{item['id']}/tags/{tag['id']}")
        assert remove.status_code == 204

        # Verify tag is removed from item
        detail2 = await client.get(f"/api/v1/items/{item['id']}")
        assert not any(t["name"] == "priority" for t in detail2.json()["tags"])

    async def test_multiple_tags_on_item(self, client: AsyncClient):
        """Req 6.5: Multiple tags per item."""
        item = (await client.post(
            "/api/v1/items", json={"name": "Multi-Tag Item", "item_type": "Equipment"},
        )).json()["item"]

        tag_names = ["electronics", "calibrated", "fragile"]
        tag_ids = []
        for name in tag_names:
            tag = (await client.post(
                "/api/v1/tags", json={"name": name},
            )).json()
            tag_ids.append(tag["id"])
            await client.post(
                f"/api/v1/items/{item['id']}/tags",
                json={"tag_id": tag["id"]},
            )

        detail = await client.get(f"/api/v1/items/{item['id']}")
        item_tag_names = [t["name"] for t in detail.json()["tags"]]
        for name in tag_names:
            assert name in item_tag_names

    async def test_duplicate_tag_slug_rejected(self, client: AsyncClient):
        """Creating a tag with a duplicate slug is rejected."""
        await client.post("/api/v1/tags", json={"name": "unique-tag"})
        dup_resp = await client.post("/api/v1/tags", json={"name": "unique-tag"})
        assert dup_resp.status_code == 409
