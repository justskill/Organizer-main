# Self-Hosted Inventory, Storage, and Asset Catalog System

## 1. Purpose

Design a self-hosted application for cataloging, organizing, locating, and tracking a wide variety of personally owned items, including:

* Measuring equipment
* Electronic components
* Consumables
* Tools and gear
* Modules, parts, accessories, and kits
* Containers and storage locations

The application must be suitable for local/home-lab use, accessible from multiple devices over the local network, and designed to support future enhancements such as automation, AI-assisted workflows, scanning, analytics, and integrations.

This document is intended to be detailed enough to hand to an AI coding assistant or developer as the starting blueprint for implementation.

---

## 2. Goals

### Primary Goals

* Provide a reliable catalog of owned items.
* Track where things are using nested physical locations.
* Track quantities and state for consumables and equipment.
* Store structured metadata, notes, photos, tags, and history.
* Support fast lookup and search from desktop and mobile devices.
* Generate and consume machine-readable physical labels such as QR codes.
* Expose a stable local API for other tools and future AI workflows.
* Remain self-hosted, portable, and easy to back up.

### Secondary Goals

* Make data entry practical enough that the system actually gets used.
* Support partial organization from day one rather than requiring perfect setup.
* Allow gradual refinement of metadata over time.
* Keep the architecture simple enough for a solo developer / vibe-coded project.
* Support future automation such as low-stock alerts, label printing, OCR, or recommendation tooling.

### Non-Goals (Initial Version)

* Full ERP or accounting functionality.
* Multi-warehouse enterprise workflows.
* Strict real-time collaborative editing at scale.
* Complex procurement and vendor management.
* Internet-hosted SaaS-first design.

---

## 3. Product Vision

The application should feel like a hybrid of:

* A home-lab / workshop inventory system
* A nested storage map
* A searchable knowledge base for owned things
* A lightweight asset lifecycle tracker

A user should be able to:

1. Create locations and nested containers.
2. Add items with photos, metadata, tags, and notes.
3. Place items into containers and move them later.
4. Scan a QR code on a box or item and instantly see its contents/history.
5. Track counts of consumables and status of equipment.
6. Search for “oscilloscope probes”, “M3 screws”, or “temperature sensor module”.
7. Query the system from external tools or an AI agent through an API.

---

## 4. High-Level Functional Requirements

### 4.1 Inventory and Item Management

* Create, edit, archive, and delete items.
* Support item types:

  * Consumable
  * Equipment
  * Component
  * Tool
  * Container
  * Kit / grouped item
  * Documented reference item
* Track:

  * Name
  * Description
  * Category
  * Quantity / count
  * Unit of measure
  * Condition
  * Status
  * Manufacturer / brand
  * Model / part number
  * Serial number
  * Purchase/source info
  * Photos
  * Tags
  * Notes
  * Attachments / documents

### 4.2 Location Tracking

* Support hierarchical/nested storage locations.
* Examples:

  * House > Garage > Shelf A > Bin 3 > Anti-static case > ESP32 modules
  * Outdoor Shed > Shelf B > Box 12 > Module A
* Allow both:

  * Fixed locations (rooms, shelves, drawers)
  * Mobile/portable containers (cases, boxes, kits)
* Allow an item to have a current location and movement history.
* Allow viewing the contents of any node in the location tree.

### 4.3 Consumables Tracking

* Track quantity on hand.
* Track minimum desired stock.
* Track consumption events.
* Track reorder-related metadata.
* Flag low-stock items.
* Optionally support expiration dates, lot numbers, and opened/unopened states.

### 4.4 Equipment Tracking

* Track ownership and current location.
* Track condition/state:

  * Available
  * In use
  * Loaned out
  * Needs repair
  * Retired
* Track calibration, maintenance, inspection, or battery replacement dates.
* Track accessories linked to equipment.

### 4.5 Search and Discovery

* Global search across:

  * Item names
  * Tags
  * Notes
  * Metadata fields
  * Location names
* Support filters:

  * Category
  * Type
  * Location
  * Tag
  * Quantity low/zero
  * Has photo
  * Needs maintenance
* Support fuzzy search and exact search.
* Support saved views or saved filters.

### 4.6 Labels / QR / Scanning

* Generate unique printable labels for:

  * Locations
  * Containers
  * Items
* Support QR code generation for each entity.
* Support scan input from:

  * Camera-based browser scanning
  * Barcode/QR scanner acting as keyboard input
  * Manual code entry
* QR should resolve to a stable internal identifier or short URL path.

### 4.7 Photos, Files, and Metadata

* Store multiple photos per item/location.
* Store attachments such as manuals, calibration docs, receipts, or schematics.
* Support structured metadata templates per item type/category.
* Support unstructured notes.

### 4.8 API and Integrations

* Provide REST API first.
* Make API stable, authenticated, and documented.
* Support external queries such as:

  * Search for items
  * Get item by ID/QR
  * Get contents of a location
  * Record stock change
  * Move item
* Leave room for future webhook/event integrations.

### 4.9 Audit and History

* Track creation and modification metadata.
* Track movement history.
* Track stock changes.
* Track major edits.
* Support activity log per item/location.

---

## 5. Missing but Important Features to Include

These are strongly recommended even though they were not explicitly required:

### 5.1 Templates and Custom Fields

Different item classes need different metadata. Example:

* Oscilloscope: bandwidth, channels, calibration date
* Battery: chemistry, voltage, capacity
* Sensor module: interface, voltage range, manufacturer, pinout reference
* Consumable adhesive: size, color, remaining amount, expiration

Use category templates and custom fields rather than hard-coding every possible field.

### 5.2 Bulk Import / Export

* CSV import/export for quick bootstrapping.
* JSON export for full-fidelity backup.
* Image/file export strategy.
* Full database backup option.

### 5.3 Duplicate Detection / Merge

* Detect likely duplicate items by name/part/model.
* Merge duplicate records safely.

### 5.4 Relationship Modeling

Support links between records:

* Item belongs to kit
* Accessory attached to equipment
* Spare part for equipment
* Container contains items
* Manual belongs to item
* Item compatible with another item

### 5.5 Offline-Tolerant Mobile Use

Even if full offline mode is deferred, the UI should work well on mobile and degrade gracefully on spotty local Wi-Fi.

### 5.6 Backup and Recovery

Must be explicitly designed, not added later.

### 5.7 Label Reprint and Identifier Stability

Physical labels should remain valid over time. Internal IDs and public scan paths should be stable and never reused.

### 5.8 Permission Model

Even for a single-user system, build with a basic auth/roles layer so future household/team usage is possible.

---

## 6. Recommended Architecture

### 6.1 Architecture Style

Use a modular monolith.

Why:

* Simpler to build and maintain than microservices.
* Easier for AI-assisted generation.
* Lower deployment complexity.
* Still supports clean boundaries and future extraction of services if needed.

### 6.2 Proposed Stack

#### Backend

* Python
* FastAPI
* SQLAlchemy ORM
* Pydantic for request/response validation
* Alembic for schema migrations

#### Frontend

* React + TypeScript
* Vite
* Component library: shadcn/ui or similar
* TanStack Query for server state
* TanStack Table for advanced grids/tables
* Optional routing with React Router or TanStack Router

#### Database

* PostgreSQL

#### File Storage

* Local filesystem storage first
* Abstracted storage interface so it can later support S3-compatible object storage (e.g. MinIO)

#### Deployment

* Docker Compose as the default deployment method
* Optional native Python/node setup for Windows/Linux without containers
* Reverse proxy: Caddy or Nginx

#### Scanning / Labeling

* QR code generation library on backend
* Browser camera scanning library on frontend
* Printable label templates rendered as PDF/SVG

---

## 7. Why This Stack

### Backend: Python + FastAPI

Benefits:

* Very strong fit for API-first local tools.
* Easy to pair with AI coding tools.
* Easy schema modeling and validation.
* Good future integration path for scripts, OCR, ML, and automation.

### Database: PostgreSQL

Benefits:

* Better long-term fit than SQLite for:

  * advanced search
  * hierarchy queries
  * JSON metadata
  * future integrations
  * concurrent networked use
* Strong support for indexing and structured + semi-structured data.

### Frontend: React + TypeScript

Benefits:

* Strong ecosystem for admin/data-heavy UIs.
* Easier component reuse.
* Good scanning/mobile support.
* Common enough for AI tools to generate effectively.

### Modular Monolith over Microservices

Benefits:

* Less operational overhead.
* Easier local deployment.
* Easier debugging.
* Faster initial delivery.

---

## 8. Logical System Components

### 8.1 Frontend Web App

Responsibilities:

* Data entry
* Search and browse
* Item/location pages
* QR scan view
* Photo upload
* Table/grid views
* Label generation UI
* Dashboard widgets

### 8.2 API Layer

Responsibilities:

* Authentication
* Validation
* CRUD endpoints
* Search endpoints
* Movement/stock transaction endpoints
* Label/QR endpoints
* Integration endpoints

### 8.3 Domain Services

Core modules:

* Inventory Service
* Location Service
* Stock Service
* Label Service
* Search Service
* Media Service
* Audit Service
* Integration Service

### 8.4 Data Layer

Responsibilities:

* Relational storage in PostgreSQL
* Migrations
* Search indexes
* Metadata persistence

### 8.5 File/Media Storage Layer

Responsibilities:

* Photo storage
* Attachment storage
* Thumbnail generation
* File linking

### 8.6 Background Worker (Optional but Recommended)

Use for:

* Thumbnail generation
* OCR later
* Reindex jobs
* Cleanup jobs
* Notifications later

Can initially be deferred or implemented simply.

---

## 9. Domain Model

### 9.1 Core Concepts

#### Item

A physical or conceptual inventory unit. May represent:

* Single serialized object
* Non-serialized stock item
* Consumable
* Tool
* Component
* Container
* Kit

#### Location

A fixed place in the real world or logical storage hierarchy.
Examples:

* House
* Garage
* Bench drawer 2
* Outdoor shed
* Shelf A

#### Container

A portable thing that can hold other items.
Examples:

* Box 12
* Pelican case
* Anti-static bin
* Tool bag

Containers can either be represented as a subtype of Item or as an entity capability.
Recommended approach: represent containers as Items with `is_container = true` plus optional container-specific fields.

#### Stock Record

Represents quantity tracking for non-serialized items.

#### Stock Transaction

Represents increases/decreases/adjustments to stock.

#### Placement / Assignment

Represents the current relationship between an item and a location/container.

#### Tag

Simple user-defined label.

#### Media Asset

Photo, document, receipt, manual, schematic, etc.

#### Audit Event

Movement, update, stock adjustment, photo upload, tag change, etc.

---

## 10. Data Modeling Strategy

### 10.1 Hybrid Relational + Flexible Metadata Model

Use:

* Strong relational tables for core entities and critical fields.
* JSONB for extensible custom metadata.

This gives:

* predictable querying for common data
* flexibility for category-specific fields
* better future evolution without constant schema churn

### 10.2 Item Identity Strategy

Use two layers of identity:

* Internal UUID primary key
* Human-friendly short code / label code

Example:

* UUID: `8a4f...`
* Public code: `ITM-2F4K9Q`

Public code is what appears on labels and scan paths.

### 10.3 Hierarchy Strategy for Locations

Model locations as a tree with parent-child relationships.
Also persist a path string for efficient traversal and search.

Example path:
`house.garage.shelf_a.bin_03`

Support:

* location parent/child tree
* current path caching
* recursive traversal

For items in portable containers:

* item can be assigned to a parent container item
* ultimate resolved location can be derived from container placement

---

## 11. Suggested Database Schema

### 11.1 Tables

#### users

* id
* username
* password_hash
* display_name
* role
* created_at
* updated_at

#### item_categories

* id
* name
* slug
* parent_category_id
* description
* metadata_schema_json
* created_at
* updated_at

#### items

* id (UUID)
* code (unique short code)
* name
* normalized_name
* description
* item_type
* category_id
* is_container
* is_consumable
* is_serialized
* brand
* model_number
* part_number
* serial_number
* condition
* status
* quantity_mode (`single`, `bulk`)
* unit_of_measure
* quantity_on_hand
* minimum_quantity
* reorder_quantity
* purchase_date
* purchase_source
* purchase_price
* warranty_expiration
* calibration_due_date
* maintenance_due_date
* metadata_json
* notes
* created_by
* created_at
* updated_at
* archived_at

#### locations

* id (UUID)
* code
* name
* slug
* description
* parent_location_id
* path_text
* location_type
* notes
* created_at
* updated_at
* archived_at

#### item_placements

Tracks current and historical placement.

* id
* item_id
* location_id (nullable)
* parent_item_id (nullable container item)
* placed_at
* removed_at
* placement_type
* note
* created_by

Rules:

* Current placement = latest row where removed_at is null.
* Either `location_id` or `parent_item_id` must be set.

#### tags

* id
* name
* slug
* color
* created_at

#### item_tags

* item_id
* tag_id

#### location_tags

* location_id
* tag_id

#### media_assets

* id
* owner_type (`item`, `location`)
* owner_id
* media_type (`photo`, `document`, `label_pdf`, etc.)
* file_path
* original_filename
* mime_type
* file_size
* checksum
* width
* height
* created_at

#### stock_transactions

* id
* item_id
* transaction_type (`add`, `consume`, `adjust`, `count`, `dispose`, `return`)
* quantity_delta
* resulting_quantity
* unit_of_measure
* reason
* reference
* performed_by
* created_at

#### item_relationships

* id
* source_item_id
* target_item_id
* relationship_type
* note
* created_at

#### label_records

* id
* entity_type (`item`, `location`)
* entity_id
* label_code
* qr_payload
* printed_at
* format
* created_at

#### audit_events

* id
* actor_user_id
* entity_type
* entity_id
* event_type
* event_data_json
* created_at

#### saved_views

* id
* user_id
* name
* entity_type
* filter_json
* created_at
* updated_at

---

## 12. Recommended Search Design

### 12.1 Search Layers

Use three complementary search mechanisms:

1. **Structured filtering**

   * category
   * type
   * tags
   * quantity thresholds
   * location subtree
   * due dates

2. **Full text search**

   * name
   * description
   * notes
   * selected metadata fields

3. **Fuzzy matching**

   * misspelled part names
   * approximate box labels
   * approximate model searches

### 12.2 Search Indexing Targets

Search document for each item should include:

* name
* description
* brand
* model_number
* part_number
* serial_number
* tags
* notes
* selected metadata fields
* current location path/name

### 12.3 Recommended Search UX

* Global search bar always visible.
* Quick result groups:

  * Items
  * Locations
  * Containers
  * Tags
* Search results show current location and tags.
* Filters panel for narrowing results.
* Saved searches like:

  * Low stock
  * No photo
  * Unsorted items
  * Needs maintenance
  * In outdoor shed

---

## 13. QR / Labeling Design

### 13.1 Supported Label Targets

* Item label
* Container label
* Location label

### 13.2 QR Payload Design

Use either:

* stable short route path, e.g. `/scan/ITM-2F4K9Q`
* or opaque code that resolves server-side

Recommended:

* QR payload contains a short URL path or full local URL.
* Example: `http://inventory.local/scan/LOC-A93K2M`

Also support plain code text for non-camera scanners.

### 13.3 Label Contents

Human-visible label should include:

* entity type icon or short prefix
* name or short name
* short code
* QR image
* optional parent location

### 13.4 Label Formats

Support:

* Small adhesive label
* Standard paper print sheet
* Reprintable PDF

### 13.5 Scan Behavior

When scanning:

* Open entity detail page directly.
* If entity is a location/container, show contents and actions.
* If entity is an item, show summary and quick actions.

Quick actions from scan view:

* Move item
* Adjust quantity
* Add note
* Open full record
* Reprint label

---

## 14. UI/UX Design Requirements

### 14.1 Core Design Principles

* Fast data entry matters more than visual novelty.
* Mobile-friendly.
* Keyboard-friendly where possible.
* Clear hierarchy and breadcrumbs.
* Simple enough to use while standing in the garage with a phone.

### 14.2 Core Screens

#### Dashboard

* Recently added items
* Recently moved items
* Low-stock items
* Needs maintenance
* Unassigned / uncategorized items
* Quick add buttons

#### Item List View

* Table/grid toggle
* Filter sidebar
* Sort by name, category, quantity, updated date, location
* Bulk actions

#### Item Detail View

Sections:

* Summary
* Photos
* Metadata
* Notes
* Current location
* Relationships
* Movement history
* Stock history
* Files
* Label/QR

#### Location Explorer

* Tree sidebar
* Contents panel
* Breadcrumb trail
* Location metadata and notes
* Nested container navigation

#### Quick Add / Intake Screen

* Add item with minimal fields
* Optional photo upload first
* Optional scan target location
* Bulk add option

#### Scan View

* Camera scan input
* Manual code entry
* Immediate resolution to entity page

#### Label Center

* Generate labels
* Reprint labels
* Batch label printing

#### Admin / Settings

* Categories
* Metadata templates
* Users
* Backup/export
* API tokens
* Preferences

### 14.3 Accessibility and Practical Usability

* Large tap targets for mobile use.
* Strong contrast.
* Minimal modal overuse.
* Breadcrumbs for location context.
* Debounced search.
* Fast “move” workflow.

---

## 15. Key User Workflows

### 15.1 Add New Item

1. Click Add Item.
2. Enter name.
3. Choose type/category.
4. Add photos.
5. Enter quantity and metadata.
6. Assign location/container.
7. Save.
8. Generate label if desired.

### 15.2 Create New Storage Area

1. Create Location.
2. Set parent location.
3. Add notes and type.
4. Save.
5. Print label.

### 15.3 Move Item

1. Search item or scan item label.
2. Select Move.
3. Choose destination location or container.
4. Save movement note.
5. System closes previous placement and opens new current placement.

### 15.4 Adjust Consumable Quantity

1. Open item or scan item.
2. Click Adjust Stock.
3. Choose reason (consumed/added/counted/adjusted).
4. Enter quantity delta or new total.
5. Save transaction.
6. System updates quantity and logs history.

### 15.5 Find Something Physically

1. Search item.
2. Result shows full nested location path.
3. Open location/container page.
4. Optionally scan box label to verify contents.

### 15.6 Intake Box Workflow

For unprocessed items in a new box/bin:

1. Create container item or location.
2. Assign QR label.
3. Add rough contents as items or grouped entries.
4. Refine records over time.

---

## 16. API Design

### 16.1 API Principles

* REST first
* JSON request/response
* Versioned routes (`/api/v1/...`)
* Strong validation
* OpenAPI documentation
* Token-based auth for integrations

### 16.2 Core Endpoints

#### Auth

* `POST /api/v1/auth/login`
* `POST /api/v1/auth/logout`
* `POST /api/v1/auth/tokens`
* `DELETE /api/v1/auth/tokens/{id}`

#### Items

* `GET /api/v1/items`
* `POST /api/v1/items`
* `GET /api/v1/items/{id}`
* `PATCH /api/v1/items/{id}`
* `DELETE /api/v1/items/{id}`
* `POST /api/v1/items/{id}/move`
* `POST /api/v1/items/{id}/adjust-stock`
* `GET /api/v1/items/{id}/history`
* `GET /api/v1/items/{id}/relationships`
* `POST /api/v1/items/{id}/relationships`

#### Locations

* `GET /api/v1/locations`
* `POST /api/v1/locations`
* `GET /api/v1/locations/{id}`
* `PATCH /api/v1/locations/{id}`
* `GET /api/v1/locations/{id}/contents`
* `GET /api/v1/locations/{id}/tree`

#### Search

* `GET /api/v1/search?q=...`
* `POST /api/v1/search/advanced`

#### Labels / Scan

* `POST /api/v1/labels/generate`
* `GET /api/v1/scan/{code}`
* `GET /api/v1/entities/by-code/{code}`

#### Media

* `POST /api/v1/media/upload`
* `GET /api/v1/media/{id}`
* `DELETE /api/v1/media/{id}`

#### Categories / Templates

* `GET /api/v1/categories`
* `POST /api/v1/categories`
* `PATCH /api/v1/categories/{id}`

#### Exports / Backups

* `POST /api/v1/export/json`
* `POST /api/v1/export/csv`

#### Integrations / AI

* `POST /api/v1/integrations/query`
* `GET /api/v1/integrations/schema`

### 16.3 Integration-Friendly API Shapes

Support operations that are useful for AI/tool callers:

* `find_item_by_name`
* `find_location_by_name`
* `resolve_code`
* `move_item`
* `adjust_quantity`
* `get_item_context`
* `search_inventory`
* `list_location_contents`

These can be normal REST endpoints initially and optionally wrapped later in an MCP-style adapter or tool schema.

---

## 17. Security Design

### 17.1 Minimum Security Requirements

* Local authentication required.
* Passwords hashed with a modern password hasher.
* Session or JWT auth for UI.
* Token auth for API integrations.
* CSRF protection if cookie-based auth is used.
* File upload validation.
* Role-based authorization hooks.

### 17.2 Roles

Initial roles:

* Admin
* Editor
* Viewer
* API Client

### 17.3 Local Network Considerations

* Bind only to trusted interface by default.
* Recommend reverse proxy and TLS even on local network if feasible.
* Provide simple config for local hostname such as `inventory.local`.

---

## 18. File and Media Handling

### 18.1 Media Storage Strategy

Store file metadata in DB and files on disk.
Recommended path structure:

* `/data/media/items/{item_id}/...`
* `/data/media/locations/{location_id}/...`
* `/data/labels/...`

### 18.2 Media Features

* Multiple photos
* One primary photo
* Thumbnail generation
* Basic file validation
* MIME/extension validation
* Max upload size controls

### 18.3 Future Enhancements

* OCR from manuals/labels/receipts
* Visual similarity search
* Auto metadata extraction from images/documents

---

## 19. Search and AI Readiness

### 19.1 AI-Friendly Record Design

Every item response should include a well-shaped context object:

* basic identity
* current location path
* tags
* key metadata
* stock summary
* relationships
* recent activity

### 19.2 Future AI Use Cases

* “Where are my spare oscilloscope probes?”
* “What bins contain ESP32 or microcontroller parts?”
* “Which batteries are low or near expiration?”
* “Show everything in the outdoor shed related to drones.”
* “What equipment needs calibration this month?”

### 19.3 Optional Future AI Enhancements

* Embedding-based semantic search
* OCR ingestion pipeline
* voice-assisted intake
* recommendation engine for organization cleanup
* auto-suggest tags/categories

Design the API and DB so these can be added later without rewriting the core inventory system.

---

## 20. Suggested Internal Backend Module Structure

```text
backend/
  app/
    api/
      v1/
        auth.py
        items.py
        locations.py
        search.py
        labels.py
        media.py
        categories.py
        integrations.py
    core/
      config.py
      security.py
      database.py
      logging.py
    models/
      user.py
      item.py
      location.py
      placement.py
      stock.py
      media.py
      tag.py
      audit.py
    schemas/
      item.py
      location.py
      search.py
      stock.py
      media.py
      auth.py
    services/
      inventory_service.py
      location_service.py
      stock_service.py
      search_service.py
      label_service.py
      media_service.py
      audit_service.py
      integration_service.py
    repositories/
      item_repository.py
      location_repository.py
      search_repository.py
    workers/
      tasks.py
    migrations/
      versions/
```

---

## 21. Suggested Frontend Structure

```text
frontend/
  src/
    api/
    app/
    components/
      items/
      locations/
      search/
      labels/
      media/
      ui/
    pages/
      Dashboard.tsx
      ItemsPage.tsx
      ItemDetailPage.tsx
      LocationsPage.tsx
      LocationDetailPage.tsx
      ScanPage.tsx
      SettingsPage.tsx
    hooks/
    types/
    utils/
```

---

## 22. Deployment Plan

### 22.1 Default Deployment Target

Docker Compose stack with:

* `frontend`
* `backend`
* `postgres`
* optional `worker`
* optional `reverse-proxy`

### 22.2 Volumes

Persist:

* Postgres data
* media files
* generated labels/exports
* config if needed

### 22.3 Example Services

* `inventory-db`
* `inventory-api`
* `inventory-web`
* `inventory-worker`
* `inventory-proxy`

### 22.4 Native Install Fallback

For Windows/Linux users avoiding Docker:

* Backend Python venv
* PostgreSQL installed locally
* Frontend built static assets served by backend or reverse proxy

---

## 23. Backup and Recovery Strategy

### 23.1 Must-Have Backups

* PostgreSQL logical dump
* media directory backup
* config/env backup

### 23.2 Restore Validation

Include a documented restore procedure and periodic restore testing.

### 23.3 Export Features

Support:

* full JSON export
* CSV export for items
* ZIP bundle of attachments/media references

---

## 24. Observability and Maintenance

### 24.1 Logging

* app logs
* auth logs
* API access logs
* error logs

### 24.2 Health Endpoints

* `/health/live`
* `/health/ready`

### 24.3 Metrics (Future)

* request counts
* error rates
* file storage usage
* item counts by category
* low-stock counts

---

## 25. Versioning and Migration Strategy

### 25.1 Schema Migrations

Use migrations from the beginning.

### 25.2 API Versioning

Prefix routes with `/api/v1`.

### 25.3 Stable Identifiers

Never recycle item/location codes.
Archived items keep their identity.

---

## 26. Implementation Phases

### Phase 1: Core Inventory MVP

Deliver:

* auth
* items CRUD
* locations CRUD
* nested location browsing
* current placement tracking
* item photos
* tags
* basic search
* responsive web UI
* Docker deployment

### Phase 2: Consumables + QR

Deliver:

* stock transactions
* low-stock alerts UI
* label generation
* scan resolver page
* print/reprint labels
* movement history

### Phase 3: Advanced Search + Templates

Deliver:

* category templates
* custom fields
* fuzzy search
* saved filters/views
* better bulk editing/import

### Phase 4: Integrations + Automation

Deliver:

* external API tokens
* integration endpoints
* webhook/events
* exports
* background tasks

### Phase 5: AI / Smart Features

Deliver:

* semantic search
* OCR
* metadata suggestions
* conversational query layer

---

## 27. MVP Acceptance Criteria

The MVP should be considered successful if the system can:

* Create locations in a nested hierarchy.
* Create items with photos, notes, tags, and metadata.
* Place items into locations or containers.
* Show a full current location path for any item.
* Search items by name/tag/note/location.
* Track quantity for consumables.
* Generate QR labels and resolve scans to records.
* Expose documented API endpoints for key operations.
* Run self-hosted on Linux or Windows with straightforward setup.

---

## 28. Recommended Key Technical Decisions

1. **Use PostgreSQL instead of SQLite** for long-term flexibility.
2. **Use modular monolith architecture** rather than microservices.
3. **Use relational core tables + JSON metadata**.
4. **Represent containers as items with container capability**.
5. **Track placement history explicitly** rather than storing only current location.
6. **Design API-first from the beginning**.
7. **Generate stable short codes for physical labels**.
8. **Use Docker Compose as the main install path**.
9. **Keep files on disk but abstract storage access**.
10. **Build for future AI integration without making AI a hard dependency.**

---

## 29. Risks and Design Pitfalls to Avoid

### 29.1 Over-Modeling Too Early

Do not try to perfectly normalize every metadata field on day one.

### 29.2 Under-Designing Search

If search is weak, the app becomes frustrating quickly.

### 29.3 Unstable Identifiers

Changing labels/IDs later becomes painful once physical tags exist.

### 29.4 Poor Intake Workflow

If adding items is tedious, the catalog will go stale.

### 29.5 No Backup Plan

Self-hosted systems fail without tested backup and restore.

### 29.6 Treating Containers and Locations as the Same Thing Everywhere

They overlap but are not identical. Keep the model clear:

* location = place
* container = movable holder

---

## 30. Future Enhancements Backlog

* Borrow/lend tracking
* Purchase and vendor tracking
* Warranty reminders
* Calibration reminders
* Expiration reminders
* Batch printing by location
* Kitting workflows
* CSV import wizard
* OCR/manual parsing
* voice note intake
* local notification service
* home assistant integration
* mobile-first PWA mode
* image-based duplicate detection
* semantic AI assistant
* part compatibility graph

---

## 31. Recommended Build Prompt for an AI Coding Assistant

Use the following guidance when handing this to an AI builder:

> Build a self-hosted inventory and storage catalog application as a modular monolith. Use FastAPI + PostgreSQL + SQLAlchemy + Alembic for the backend and React + TypeScript for the frontend. Implement nested locations, movable containers, items, media attachments, tags, stock transactions, placement history, search, QR label generation, and a versioned REST API. Use relational tables for core entities and JSON metadata for extensibility. Prioritize a responsive web UI, strong search, stable identifiers, Docker Compose deployment, and clear internal code boundaries. Start with MVP phases and keep the architecture extensible for future AI integrations.

---

## 32. Final Recommendation Summary

The best starting architecture is:

* **Modular monolith**
* **FastAPI backend**
* **React/TypeScript frontend**
* **PostgreSQL database**
* **Filesystem-backed media storage**
* **QR-driven labeling and scan resolution**
* **API-first design with future AI/tool integration hooks**

This approach gives a strong balance of:

* implementation speed
* maintainability
* local deployability
* searchability
* data integrity
* future extensibility

If desired, the next step after this design document should be to turn it into:

1. an implementation roadmap with milestone tickets,
2. a starter repo structure,
3. a full SQL schema,
4. OpenAPI endpoint definitions,
5. and an initial Docker Compose development environment.
