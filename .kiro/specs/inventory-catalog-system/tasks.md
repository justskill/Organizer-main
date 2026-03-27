# Implementation Plan: Inventory, Storage, and Asset Catalog System

## Overview

This plan implements a self-hosted inventory catalog system as a modular monolith using FastAPI + PostgreSQL backend and React + TypeScript frontend, deployed via Docker Compose. Tasks follow the phased approach from the design: project scaffolding, domain models, API layer, frontend, and deployment.

## Tasks

- [x] 1. Project scaffolding and core infrastructure
  - [x] 1.1 Create backend project structure with FastAPI, SQLAlchemy, Alembic, and Pydantic
    - Initialize `backend/` directory with `app/` package structure: `api/v1/`, `core/`, `models/`, `schemas/`, `services/`, `repositories/`, `workers/`, `migrations/`
    - Create `app/core/config.py` with Pydantic Settings for DB URL, secret key, media path, allowed origins, and service ports
    - Create `app/core/database.py` with async SQLAlchemy engine, session factory, and `get_db` dependency
    - Create `app/main.py` with FastAPI app, CORS middleware, lifespan handler, and router includes
    - Create `requirements.txt` or `pyproject.toml` with all backend dependencies (fastapi, uvicorn, sqlalchemy, alembic, pydantic, python-jose, passlib, python-qrcode, reportlab, psycopg2-binary, python-multipart)
    - Initialize Alembic with `alembic init` config pointing to the SQLAlchemy metadata
    - _Requirements: 10.1, 10.2, 10.4, 20.3, 20.5, 24.1_

  - [x] 1.2 Create frontend project structure with React, TypeScript, Vite, and shadcn/ui
    - Scaffold `frontend/` with Vite + React + TypeScript template
    - Install and configure shadcn/ui, TanStack Query, TanStack Table, React Router
    - Set up `src/` directory structure: `api/`, `app/`, `components/`, `pages/`, `hooks/`, `types/`, `utils/`
    - Create API client utility with base URL config and auth header injection
    - Create TanStack Query provider wrapper in `app/`
    - Create React Router route definitions with lazy-loaded pages
    - _Requirements: 18.1, 19.1, 19.6_

  - [x] 1.3 Create Docker Compose configuration and Dockerfiles
    - Create `docker-compose.yml` with services: `inventory-db` (PostgreSQL 15), `inventory-api` (FastAPI), `inventory-web` (Vite dev / Nginx prod)
    - Create `backend/Dockerfile` with Python 3.11 base, dependency install, and uvicorn entrypoint
    - Create `frontend/Dockerfile` with Node build stage and Nginx serve stage
    - Define volumes for PostgreSQL data, `/data/media`, and `/data/labels`
    - Add environment variable configuration for DB credentials, secret keys, and ports
    - Create `.env.example` with all configurable environment variables
    - _Requirements: 20.1, 20.2, 20.4, 20.5_

  - [x] 1.4 Implement health check endpoints
    - Create `app/api/v1/health.py` with `GET /health/live` (returns 200) and `GET /health/ready` (checks DB connection)
    - Register health router in main app (excluded from auth)
    - _Requirements: 10.9_

- [x] 2. Checkpoint - Verify project scaffolding
  - Ensure Docker Compose stack starts successfully, health endpoints respond, and Alembic can connect to PostgreSQL. Ask the user if questions arise.

- [x] 3. Database models and initial migration
  - [x] 3.1 Create SQLAlchemy models for users and authentication
    - Create `app/models/base.py` with declarative base and common mixins (UUID PK, timestamps)
    - Create `app/models/user.py` with `users` table: id, username (unique), password_hash, display_name, role (enum: Admin, Editor, Viewer, API_Client), created_at, updated_at
    - _Requirements: 12.1, 12.5, 24.2_

  - [x] 3.2 Create SQLAlchemy models for items and categories
    - Create `app/models/item.py` with `items` table matching the full schema: id (UUID), code (unique), name, normalized_name, description, item_type (enum), category_id (FK), is_container, is_consumable, is_serialized, brand, model_number, part_number, serial_number, condition, status, quantity_mode, unit_of_measure, quantity_on_hand, minimum_quantity, reorder_quantity, purchase_date, purchase_source, purchase_price, warranty_expiration, calibration_due_date, maintenance_due_date, metadata_json (JSONB), notes, created_by (FK), created_at, updated_at, archived_at
    - Create `app/models/category.py` with `item_categories` table: id, name, slug (unique), parent_category_id (self-FK), description, metadata_schema_json (JSONB), created_at, updated_at
    - Add `normalized_name` column populated via a before-insert/update event for case-insensitive search
    - _Requirements: 1.6, 1.7, 13.1, 13.2, 24.2, 24.3, 24.4_

  - [x] 3.3 Create SQLAlchemy models for locations
    - Create `app/models/location.py` with `locations` table: id (UUID), code (unique), name, slug, description, parent_location_id (self-FK), path_text, location_type, notes, created_at, updated_at, archived_at
    - _Requirements: 2.1, 2.7, 24.2_

  - [x] 3.4 Create SQLAlchemy models for placements, tags, and associations
    - Create `app/models/placement.py` with `item_placements` table: id, item_id (FK), location_id (FK, nullable), parent_item_id (FK, nullable), placed_at, removed_at, placement_type, note, created_by (FK)
    - Create `app/models/tag.py` with `tags` table: id, name, slug (unique), color, created_at
    - Create `item_tags` and `location_tags` association tables
    - Add check constraint: either location_id or parent_item_id must be non-null
    - _Requirements: 4.4, 6.1, 6.2, 6.3, 6.5, 24.2_

  - [x] 3.5 Create SQLAlchemy models for media, stock, relationships, labels, audit, and saved views
    - Create `app/models/media.py` with `media_assets` table: id, owner_type, owner_id, media_type, file_path, original_filename, mime_type, file_size, checksum, width, height, is_primary, created_at
    - Create `app/models/stock.py` with `stock_transactions` table: id, item_id (FK), transaction_type (enum), quantity_delta, resulting_quantity, unit_of_measure, reason, reference, performed_by (FK), created_at
    - Create `app/models/relationship.py` with `item_relationships` table: id, source_item_id (FK), target_item_id (FK), relationship_type (enum), note, created_at
    - Create `app/models/label.py` with `label_records` table: id, entity_type, entity_id, label_code, qr_payload, printed_at, format, created_at
    - Create `app/models/audit.py` with `audit_events` table: id, actor_user_id (FK), entity_type, entity_id, event_type, event_data_json (JSONB), created_at
    - Create `app/models/saved_view.py` with `saved_views` table: id, user_id (FK), name, entity_type, filter_json (JSONB), created_at, updated_at
    - _Requirements: 5.1, 7.1, 7.4, 7.5, 8.1, 11.1, 11.5, 14.1, 14.2, 22.1, 24.2, 24.3_

  - [x] 3.6 Create search indexes and tsvector column
    - Add a `search_vector` tsvector column to the `items` table combining name, description, notes, brand, model_number, part_number, serial_number
    - Create GIN index on the tsvector column
    - Enable `pg_trgm` extension and create trigram GIN indexes on item name and model_number
    - Add trigger or event to auto-update tsvector on insert/update
    - _Requirements: 9.1, 9.3, 24.4_

  - [x] 3.7 Generate and run initial Alembic migration
    - Auto-generate Alembic migration from all models
    - Include `pg_trgm` extension creation in migration
    - Run migration to create all tables and indexes
    - _Requirements: 20.3, 24.1_

- [x] 4. Checkpoint - Verify database schema
  - Ensure Alembic migration runs cleanly, all tables are created in PostgreSQL, and indexes exist. Ask the user if questions arise.

- [x] 5. Authentication and authorization
  - [x] 5.1 Implement authentication service and security utilities
    - Create `app/core/security.py` with password hashing (bcrypt/argon2), JWT token creation/verification, and API token generation
    - Create `app/schemas/auth.py` with LoginRequest, TokenResponse, APITokenCreate, and APITokenResponse Pydantic schemas
    - Create `app/services/auth_service.py` with login validation, token issuance, and API token CRUD
    - _Requirements: 12.2, 12.3, 12.4_

  - [x] 5.2 Implement auth API endpoints and middleware
    - Create `app/api/v1/auth.py` with `POST /auth/login`, `POST /auth/tokens`, `DELETE /auth/tokens/{id}`
    - Create auth dependency (`get_current_user`) that validates JWT or API token from Authorization header
    - Create role-checking dependency (`require_role`) for Admin, Editor, Viewer, API_Client enforcement
    - Apply auth dependency to all routers except health and login
    - Return 401 for unauthenticated requests, 403 for insufficient role
    - _Requirements: 12.1, 12.2, 12.4, 12.5, 12.6, 12.7, 12.8_

  - [x] 5.3 Create seed script for default admin user
    - Create a CLI command or startup hook to create a default admin user if no users exist
    - _Requirements: 12.2_

- [x] 6. Core domain services and repositories
  - [x] 6.1 Implement short code generation utility
    - Create `app/core/short_code.py` with `generate_short_code(entity_type)` that produces codes like `ITM-2F4K9Q` or `LOC-A93K2M`
    - Ensure uniqueness by checking against existing codes in DB
    - Codes must never be recycled
    - _Requirements: 1.1, 2.7, 23.1, 23.2_

  - [x] 6.2 Implement audit service
    - Create `app/services/audit_service.py` with `record_event(actor_id, entity_type, entity_id, event_type, event_data)` that inserts into `audit_events`
    - Support event types: created, updated, archived, deleted, moved, stock_adjusted, media_uploaded, media_deleted
    - Store before/after values in event_data_json
    - _Requirements: 11.1, 11.2, 11.3, 11.5_

  - [x] 6.3 Implement item repository and inventory service
    - Create `app/repositories/item_repository.py` with CRUD queries, placement queries, tag association queries, and relationship queries
    - Create `app/services/inventory_service.py` with: create_item (generates UUID + short code, checks duplicates, records audit), update_item (validates, records audit), archive_item (sets archived_at, records audit), delete_item (cascades placements/tags/media, records audit), get_item (includes current placement, tags, primary photo)
    - Create `app/schemas/item.py` with ItemCreate, ItemUpdate, ItemResponse, ItemListResponse Pydantic schemas
    - Implement duplicate detection: compare name, model_number, part_number against existing items on create
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 16.1, 16.2_

  - [x] 6.4 Implement location repository and location service
    - Create `app/repositories/location_repository.py` with CRUD queries, hierarchy traversal, and contents queries
    - Create `app/services/location_service.py` with: create_location (generates UUID + short code, computes path_text, records audit), update_location (recomputes path_text for self and descendants on parent change, records audit), get_location (includes parent, children), get_contents (items + child locations), get_tree (recursive subtree)
    - Create `app/schemas/location.py` with LocationCreate, LocationUpdate, LocationResponse, LocationTreeNode, LocationContents Pydantic schemas
    - Implement `compute_path_text(location_id)` that walks parent chain to build path like `House > Garage > Shelf A > Bin 3`
    - Implement circular reference detection: reject parent changes that would create a cycle
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_

  - [x] 6.5 Implement placement and movement service
    - Add movement logic to `inventory_service.py`: `move_item(item_id, destination_location_id_or_container_id)` that sets `removed_at` on current placement and creates new placement record
    - Implement `get_current_placement(item_id)` returning most recent placement where `removed_at IS NULL`
    - Implement `get_movement_history(item_id)` returning all placements ordered by `placed_at` desc
    - Validate placement constraints: either location_id or parent_item_id set, not both null
    - Prevent self-containment: reject placing a container inside itself (directly or transitively)
    - Record audit event for each movement
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 6.6 Implement stock service
    - Create `app/services/stock_service.py` with `adjust_stock(item_id, transaction_type, quantity_delta, reason, user_id)` that creates a stock_transaction and updates item.quantity_on_hand
    - Support transaction types: add, consume, adjust, count, dispose, return
    - Compute resulting_quantity and store on transaction
    - Record audit event for stock changes
    - Create `app/schemas/stock.py` with StockAdjustRequest, StockTransactionResponse Pydantic schemas
    - _Requirements: 5.1, 5.2, 5.3, 5.5, 5.6_

- [x] 7. Checkpoint - Verify core domain services
  - Ensure all services can be instantiated, short code generation works, and basic CRUD operations succeed against the database. Ask the user if questions arise.

- [x] 8. REST API endpoints
  - [x] 8.1 Implement item API endpoints
    - Create `app/api/v1/items.py` with: `GET /items` (list with pagination, filtering), `POST /items` (create with duplicate detection response), `GET /items/{id}` (full detail), `PATCH /items/{id}` (partial update), `DELETE /items/{id}`, `POST /items/{id}/move`, `POST /items/{id}/adjust-stock`, `GET /items/{id}/history` (audit events), `GET /items/{id}/relationships`, `POST /items/{id}/relationships`
    - Wire to inventory_service, stock_service, and audit_service
    - Apply role-based auth: Viewer = read-only, Editor/Admin = full access
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 4.1, 4.3, 5.1, 5.6, 10.5, 10.6, 14.3, 14.4_

  - [x] 8.2 Implement location API endpoints
    - Create `app/api/v1/locations.py` with: `GET /locations` (list), `POST /locations`, `GET /locations/{id}`, `PATCH /locations/{id}`, `GET /locations/{id}/contents`, `GET /locations/{id}/tree`
    - Wire to location_service
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 10.5_

  - [x] 8.3 Implement category API endpoints
    - Create `app/api/v1/categories.py` with: `GET /categories`, `POST /categories`, `PATCH /categories/{id}`
    - Support hierarchical categories with parent_category_id
    - Validate item metadata_json against category metadata_schema_json on item create/update
    - _Requirements: 13.1, 13.2, 13.4, 13.5, 10.5_

  - [x] 8.4 Implement tag API endpoints
    - Add tag CRUD and association endpoints: `GET /tags`, `POST /tags`, `POST /items/{id}/tags`, `DELETE /items/{id}/tags/{tag_id}`, `POST /locations/{id}/tags`, `DELETE /locations/{id}/tags/{tag_id}`
    - Generate slug from tag name on creation
    - _Requirements: 6.1, 6.2, 6.3, 6.5, 10.5_

  - [x] 8.5 Implement search API endpoints
    - Create `app/repositories/search_repository.py` with full-text search queries using tsvector, trigram fuzzy matching, and structured filter queries
    - Create `app/services/search_service.py` orchestrating search across items, locations, and tags
    - Create `app/api/v1/search.py` with: `GET /search?q=...` (global search), `POST /search/advanced` (structured filters)
    - Support filtering by: category, item_type, location subtree, tag, quantity thresholds, has_photo, maintenance_due
    - Group results by entity type (Items, Locations, Containers, Tags)
    - Include current location and tags in item results
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 10.7_

  - [x] 8.6 Implement media API endpoints
    - Create `app/services/media_service.py` with: upload_file (validates MIME/size, stores to `/data/media/{entity_type}/{entity_id}/`, records metadata, generates thumbnail for photos), delete_file, set_primary_photo
    - Create `app/api/v1/media.py` with: `POST /media/upload`, `GET /media/{id}`, `DELETE /media/{id}`
    - Validate file type, extension, and max size before storing
    - Support multiple media per entity, one primary photo per item
    - Record audit events for uploads and deletions
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 10.5_

  - [x] 8.7 Implement label and scan API endpoints
    - Create `app/services/label_service.py` with: generate_qr_code (using python-qrcode), render_label_pdf (using ReportLab), resolve_code
    - Create `app/api/v1/labels.py` with: `POST /labels/generate`, `GET /scan/{code}`, `GET /entities/by-code/{code}`
    - QR payload format: `/scan/{SHORT_CODE}`
    - Label contains: entity type prefix, name, short code, QR image
    - Support PDF output for small adhesive labels and standard paper sheets
    - Record label_records entry on generation
    - Resolve archived entities (return archived flag)
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.8, 23.3, 23.4_

  - [x] 8.8 Implement export and import API endpoints
    - Create `app/api/v1/export.py` with: `POST /export/json` (full-fidelity JSON export of items, locations, placements, tags, relationships), `POST /export/csv` (item records with core fields), `POST /import/csv` (parse CSV, create items, return summary of created/skipped/errored rows)
    - Skip invalid CSV rows without aborting entire import, include in error summary
    - _Requirements: 15.1, 15.2, 15.3, 15.4_

  - [x] 8.9 Implement saved views API endpoints
    - Add endpoints: `GET /saved-views`, `POST /saved-views`, `PATCH /saved-views/{id}`, `DELETE /saved-views/{id}`
    - Store filter_json with user_id association
    - _Requirements: 22.1, 22.3_

  - [x] 8.10 Implement item merge endpoint for duplicate resolution
    - Add `POST /items/{id}/merge` endpoint that consolidates placements, tags, media, relationships, and audit history from source item into target item and archives source
    - _Requirements: 16.3_

  - [x] 8.11 Write unit tests for API endpoints
    - Test item CRUD endpoints with valid and invalid payloads
    - Test location hierarchy creation and circular reference rejection
    - Test placement constraints and movement flow
    - Test stock adjustment and resulting quantity calculation
    - Test search with full-text and fuzzy queries
    - Test auth flow: login, token validation, role enforcement, 401/403 responses
    - Test media upload validation (MIME type, size limits)
    - Test scan resolution for active and archived entities
    - Test CSV import with valid rows, invalid rows, and mixed data
    - _Requirements: 1.1, 1.8, 2.8, 3.4, 4.4, 5.1, 9.1, 12.1, 12.7, 12.8, 7.6, 8.4, 15.4_

- [x] 9. Checkpoint - Verify backend API
  - Ensure all API endpoints respond correctly, OpenAPI docs are accessible, auth flow works, and CRUD operations persist to database. Ask the user if questions arise.

- [x] 10. Frontend core layout and routing
  - [x] 10.1 Implement app shell with responsive layout
    - Create main layout component with sidebar navigation (collapsible on mobile), top bar with global search, and content area
    - Implement responsive breakpoints for desktop and mobile
    - Use shadcn/ui components for navigation, buttons, and layout primitives
    - Add breadcrumb component for location context
    - _Requirements: 18.1, 19.1, 19.2, 19.5_

  - [x] 10.2 Implement authentication pages and auth state management
    - Create login page with username/password form
    - Create auth context/hook that stores JWT token, provides login/logout, and injects auth header into API client
    - Add route guards that redirect unauthenticated users to login
    - _Requirements: 12.1, 12.2_

  - [x] 10.3 Implement global search bar component
    - Create `GlobalSearchBar` component always visible in top bar
    - Implement debounced search input using TanStack Query
    - Display grouped quick results dropdown (Items, Locations, Containers, Tags)
    - Navigate to entity detail on result selection
    - _Requirements: 9.5, 9.7_

- [x] 11. Frontend pages - Dashboard and Items
  - [x] 11.1 Implement Dashboard page
    - Create `Dashboard.tsx` with sections: recently added items, recently moved items, low-stock items, items needing maintenance, unassigned items
    - Add quick-add buttons for new item and new location
    - Use TanStack Query hooks to fetch dashboard data from API
    - _Requirements: 18.1, 5.4, 21.3_

  - [x] 11.2 Implement Items list page
    - Create `ItemsPage.tsx` with TanStack Table for item listing
    - Implement table/grid view toggle
    - Add filter sidebar with category, item_type, location, tag, quantity, has_photo, maintenance_due filters
    - Add sorting by name, category, quantity, updated_date, location
    - Implement bulk action support (archive, tag, move)
    - Implement pagination
    - _Requirements: 18.2, 9.2_

  - [x] 11.3 Implement Item detail page
    - Create `ItemDetailPage.tsx` with sections: summary, photos (PhotoGallery with primary photo), metadata (rendered from category template), notes, current location with breadcrumb, relationships, movement history, stock history, files, label/QR
    - Add action buttons: edit, move, adjust stock, generate label, archive
    - Create `ItemForm` component for create/edit with validation
    - _Requirements: 18.3, 1.2, 4.3, 5.6, 8.6, 13.3, 14.3_

  - [x] 11.4 Implement Quick Add / Intake screen
    - Create quick-add form with minimal required fields (name, type)
    - Support optional photo upload, scan-to-assign location, and bulk add mode
    - _Requirements: 18.5_

- [x] 12. Frontend pages - Locations and Navigation
  - [x] 12.1 Implement Location Explorer page
    - Create `LocationsPage.tsx` with tree sidebar (`LocationTree` component) and contents panel
    - Implement recursive tree rendering with expand/collapse
    - Show breadcrumb trail for selected location
    - Display location metadata, notes, and tags
    - Show contents: items placed at location + child locations + items in containers at location
    - _Requirements: 18.4, 2.4, 2.5, 3.2_

  - [x] 12.2 Implement Location detail page
    - Create `LocationDetailPage.tsx` with location info, contents panel, breadcrumbs, and nested container navigation
    - Add action buttons: edit, add child location, generate label
    - _Requirements: 18.4, 2.3_

- [x] 13. Frontend pages - Scan, Labels, and Settings
  - [x] 13.1 Implement Scan page
    - Create `ScanPage.tsx` with browser camera QR scanning (using a JS QR scanning library) and manual short code text entry
    - On scan/entry, call `/scan/{code}` API to resolve entity
    - Display entity summary with quick action buttons: move, adjust quantity, add note, reprint label, open full record
    - For locations/containers, show contents and quick actions
    - _Requirements: 8.4, 8.5, 8.6, 8.7, 18.6_

  - [x] 13.2 Implement Label Center page
    - Create `LabelCenter.tsx` for generating, reprinting, and batch printing labels
    - Add label preview component showing QR code, entity type, name, and short code
    - Support selecting multiple entities for batch label PDF generation
    - _Requirements: 8.1, 8.2, 8.3, 18.7_

  - [x] 13.3 Implement Settings page
    - Create `SettingsPage.tsx` with tabs/sections for: categories management (CRUD with metadata schema editor), user management (Admin only), backup/export (trigger JSON/CSV export, CSV import), API token management, preferences
    - Create category metadata schema editor that allows defining custom fields (text, number, date, select)
    - _Requirements: 13.1, 13.3, 18.8, 22.4_

  - [x] 13.4 Implement Saved Views and preset filters
    - Add saved views UI: save current filter set with a name, load saved views from sidebar/dropdown
    - Create preset saved views: Low Stock, No Photo, Unsorted Items, Needs Maintenance
    - _Requirements: 9.6, 22.1, 22.2, 22.4_

- [x] 14. Checkpoint - Verify frontend functionality
  - Ensure all pages render correctly, API integration works end-to-end, navigation flows are functional, and responsive layout works on mobile viewport. Ask the user if questions arise.

- [x] 15. Advanced search and filter integration
  - [x] 15.1 Implement advanced search page with filter sidebar
    - Create `FilterSidebar` component with structured filters: category, item_type, location subtree picker, tag multi-select, quantity range, has_photo toggle, maintenance_due toggle
    - Wire filters to `POST /search/advanced` endpoint
    - Display `SearchResults` component with entity-type grouped results showing current location and tags
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [x] 15.2 Implement tag filtering across items and locations
    - Add tag filter chips to item list and location explorer
    - Support multi-tag filtering (AND/OR)
    - _Requirements: 6.4_

- [x] 16. Mobile usability and accessibility polish
  - [x] 16.1 Implement mobile-responsive refinements
    - Ensure large tap targets (minimum 44x44px) on all interactive elements
    - Ensure strong color contrast ratios for readability in varied lighting
    - Minimize modal usage, prefer inline interactions and slide-over panels
    - Implement keyboard navigation support for desktop data entry (tab order, enter to submit, escape to cancel)
    - Test and fix responsive layout on common mobile viewport sizes
    - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5, 19.6_

- [x] 17. Backup, export, and data integrity
  - [x] 17.1 Implement full backup export endpoint
    - Add `POST /export/full` endpoint that generates a ZIP bundle containing JSON data export and media file references
    - Document restore procedure: restore PostgreSQL dump + media directory
    - _Requirements: 17.1, 17.2, 17.3, 17.4_

  - [x] 17.2 Implement equipment lifecycle tracking in UI
    - Add calibration_due_date and maintenance_due_date display and editing to item detail/form
    - Add condition/status selector with values: Available, In_Use, Loaned_Out, Needs_Repair, Retired
    - Display "Needs Maintenance" section on dashboard for items within configurable threshold of due dates
    - _Requirements: 21.1, 21.2, 21.3, 21.4_

- [x] 18. Final integration and wiring
  - [x] 18.1 Wire all frontend components to backend API
    - Create TanStack Query hooks: `useItems`, `useLocations`, `useSearch`, `useScan`, `useStockAdjust`, `useCategories`, `useTags`, `useMedia`, `useSavedViews`
    - Ensure all mutations invalidate relevant query caches
    - Add optimistic updates for common operations (move, stock adjust)
    - Add error handling and toast notifications for API errors
    - _Requirements: 10.1, 10.2, 10.3_

  - [x] 18.2 Configure OpenAPI documentation
    - Ensure all FastAPI endpoints have proper docstrings, response models, and tags
    - Verify OpenAPI docs are accessible at `/docs` and `/redoc`
    - _Requirements: 10.4_

  - [x] 18.3 Finalize Docker Compose production configuration
    - Update frontend Dockerfile for production Nginx build
    - Add Nginx config to proxy `/api/` to backend service
    - Ensure Alembic migrations run on backend container startup
    - Add optional reverse proxy service configuration
    - Verify full stack starts with `docker compose up` and is accessible on configurable port
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5_

- [x] 19. Write integration tests for key workflows
  - Test end-to-end item creation with placement, tags, and photo upload
  - Test location hierarchy creation and contents retrieval
  - Test item movement flow and history tracking
  - Test stock adjustment and low-stock detection
  - Test QR label generation and scan resolution
  - Test CSV import with mixed valid/invalid rows
  - Test search with full-text, fuzzy, and structured filters
  - _Requirements: 1.1, 2.1, 4.1, 5.1, 8.1, 8.4, 9.1, 15.1, 15.4_

- [ ] 20. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, Docker Compose stack runs end-to-end, and all major workflows function correctly. Ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at key milestones
- The backend uses Python 3.11+ with FastAPI, SQLAlchemy 2.x, Alembic, and Pydantic v2
- The frontend uses React 18+ with TypeScript, Vite, shadcn/ui, TanStack Query, TanStack Table, and React Router
- PostgreSQL 15+ is required for full-text search, pg_trgm, and JSONB support
