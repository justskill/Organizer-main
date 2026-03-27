#!/usr/bin/env python3
"""End-to-end smoke test against the live Docker Compose stack."""
import json
import sys
import urllib.request
import urllib.error

BASE = "http://localhost:8000/api/v1"
FRONT = "http://localhost:3000"
PASS = FAIL = 0

def req(method, url, data=None, headers=None, expect=None):
    headers = headers or {}
    body = json.dumps(data).encode() if data else None
    if data:
        headers["Content-Type"] = "application/json"
    r = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        resp = urllib.request.urlopen(r)
        code = resp.status
        text = resp.read().decode()
    except urllib.error.HTTPError as e:
        code = e.code
        text = e.read().decode()
    if expect and code != expect:
        return None, code
    return json.loads(text) if text else {}, code

def check(name, expected, actual):
    global PASS, FAIL
    if str(actual) == str(expected):
        print(f"  PASS: {name}")
        PASS += 1
    else:
        print(f"  FAIL: {name} (expected={expected}, got={actual})")
        FAIL += 1

print("=== 1. Health ===")
d, c = req("GET", f"{BASE}/health/live")
check("health/live", "ok", d.get("status"))
d, c = req("GET", f"{BASE}/health/ready")
check("health/ready", "ok", d.get("status"))

print("=== 2. OpenAPI ===")
d, c = req("GET", "http://localhost:8000/openapi.json")
check("openapi version", "3.1.0", d.get("openapi"))
check("has paths", True, len(d.get("paths", {})) > 20)

print("=== 3. Auth ===")
d, c = req("POST", f"{BASE}/auth/login", {"username": "admin", "password": "admin"})
TOKEN = d.get("access_token", "")
check("login", True, len(TOKEN) > 10)
AUTH = {"Authorization": f"Bearer {TOKEN}"}

d, c = req("POST", f"{BASE}/auth/login", {"username": "admin", "password": "wrong"})
check("bad password", 401, c)

print("=== 4. Unauth ===")
_, c = req("GET", f"{BASE}/items")
check("unauth 401", 401, c)

print("=== 5. Item CRUD ===")
d, c = req("POST", f"{BASE}/items", {"name": "Smoke Multimeter", "item_type": "Equipment"}, AUTH)
check("create item", 200, c)
ITEM_ID = d["id"]
ITEM_CODE = d["code"]

d, c = req("GET", f"{BASE}/items/{ITEM_ID}", headers=AUTH)
check("read item name", "Smoke Multimeter", d["name"])

d, c = req("PATCH", f"{BASE}/items/{ITEM_ID}", {"brand": "Fluke"}, AUTH)
check("update brand", "Fluke", d.get("brand"))

print("=== 6. Locations ===")
d, c = req("POST", f"{BASE}/locations", {"name": "Workshop"}, AUTH)
LOC1_ID = d["id"]
check("create root loc", 200, c)

d, c = req("POST", f"{BASE}/locations", {"name": "Shelf A", "parent_location_id": LOC1_ID}, AUTH)
LOC2_ID = d["id"]
check("child path", "Workshop > Shelf A", d.get("path_text"))

print("=== 7. Move ===")
d, c = req("POST", f"{BASE}/items/{ITEM_ID}/move", {"location_id": LOC2_ID}, AUTH)
check("move item", LOC2_ID, d.get("location_id"))

print("=== 8. Stock ===")
d, c = req("POST", f"{BASE}/items/{ITEM_ID}/adjust-stock",
           {"transaction_type": "add", "quantity_delta": 10, "reason": "test"}, AUTH)
check("stock add", "10", str(d.get("resulting_quantity")))

print("=== 9. Search ===")
d, c = req("GET", f"{BASE}/search?q=Multimeter", headers=AUTH)
check("search finds", True, len(d.get("items", [])) >= 1)

print("=== 10. Scan ===")
d, c = req("GET", f"{BASE}/scan/{ITEM_CODE}", headers=AUTH)
check("scan type", "item", d.get("entity_type"))
check("scan not archived", False, d.get("archived"))

print("=== 11. Tags ===")
d, c = req("POST", f"{BASE}/tags", {"name": "Smoke Tag", "color": "#00FF00"}, AUTH)
TAG_ID = d["id"]
_, c = req("POST", f"{BASE}/items/{ITEM_ID}/tags", {"tag_id": TAG_ID}, AUTH)
check("assign tag", 200, c)

print("=== 12. Label ===")
_, c = req("POST", f"{BASE}/labels/generate",
           {"entity_type": "item", "entity_id": ITEM_ID}, AUTH)
check("label gen", 200, c)

print("=== 13. Categories ===")
d, c = req("POST", f"{BASE}/categories", {"name": "Test Instruments"}, AUTH)
check("create category", 200, c)

print("=== 14. Saved Views ===")
d, c = req("POST", f"{BASE}/saved-views",
           {"name": "Low Stock", "entity_type": "item", "filter_json": {"min_qty": 5}}, AUTH)
check("create saved view", 200, c)

print("=== 15. CSV Import ===")
# Use multipart manually
import io
boundary = "----SmokeTestBoundary"
csv_content = "name,item_type\nImported Wrench,Tool\nImported Bolt,Component"
body_parts = [
    f"--{boundary}",
    'Content-Disposition: form-data; name="file"; filename="test.csv"',
    "Content-Type: text/csv",
    "",
    csv_content,
    f"--{boundary}--",
    "",
]
body = "\r\n".join(body_parts).encode()
h = dict(AUTH)
h["Content-Type"] = f"multipart/form-data; boundary={boundary}"
r = urllib.request.Request(f"{BASE}/import/csv", data=body, headers=h, method="POST")
try:
    resp = urllib.request.urlopen(r)
    d = json.loads(resp.read().decode())
    check("csv import created", 2, d.get("created", 0))
except urllib.error.HTTPError as e:
    d = json.loads(e.read().decode())
    check("csv import created", 2, d.get("created", 0))

print("=== 16. Frontend proxy ===")
d, c = req("GET", f"{FRONT}/api/v1/health/live")
check("nginx proxy", "ok", d.get("status"))

print("=== 17. Delete ===")
_, c = req("DELETE", f"{BASE}/items/{ITEM_ID}", headers=AUTH)
check("delete item", 200, c)

# Verify deleted
_, c = req("GET", f"{BASE}/items/{ITEM_ID}", headers=AUTH)
check("item gone", 404, c)

print()
print("=" * 40)
print(f"PASSED: {PASS}  FAILED: {FAIL}")
print("=" * 40)
sys.exit(0 if FAIL == 0 else 1)
