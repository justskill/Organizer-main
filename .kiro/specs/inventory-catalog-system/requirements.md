# Requirements Document

## Introduction

This document defines the requirements for a self-hosted Inventory, Storage, and Asset Catalog System. The system enables users to catalog, organize, locate, and track personally owned items including measuring equipment, electronic components, consumables, tools, modules, parts, containers, and storage locations. It is designed for local/home-lab use, accessible from multiple devices over a local network, and built to support future enhancements such as automation, AI-assisted workflows, scanning, and integrations.

The system uses a modular monolith architecture with a Python + FastAPI + SQLAlchemy + Alembic backend, React + TypeScript frontend, and PostgreSQL database, deployed via Docker Compose.

## Glossary

- **System**: The Inventory, Storage, and Asset Catalog application as a whole
- **API_Server**: The FastAPI backend service exposing REST endpoints
- **Web_UI**: The React + TypeScript frontend application
- **Item**: A physical or conceptual inventory unit (equipment, consumable, component, tool, container, kit, or documented reference)
- **Location**: A fixed place in the real world or logical storage hierarchy (e.g., House > Garage > Shelf A)
- **Container**: A portable item that can hold other items, represented as an Item with `is_container = true`
- **Placement**: The current or historical relationship between an Item and a Location or Container
- **Stock_Record**: Quantity tracking data for non-serialized or consumable items
- **Stock_Transaction**: A recorded increase, decrease, or adjustment to an item's stock quantity
- **Tag**: A user-defined label applied to items or locations for categorization
- **Media_Asset**: A photo, document, receipt, manual, schematic, or other file attached to an item or location
- **Label**: A printable artifact containing a QR code, short code, name, and entity type for physical identification
- **Short_Code**: A stable, human-friendly identifier (e.g., `ITM-2F4K9Q`) used on labels and scan paths, never recycled
- **Audit_Event**: A recorded log entry for creation, modification, movement, stock change, or other significant action
- **Category**: A hierarchical classification for items, optionally carrying a metadata schema template
- **Metadata_Template**: A JSON schema defining custom fields for a specific item category
- **Saved_View**: A user-defined, persisted set of search filters and sort criteria
- **QR_Payload**: The data encoded in a QR code, containing a stable URL path or short code resolving to an entity
- **Search_Service**: The component responsible for structured filtering, full-text search, and fuzzy matching
- **Label_Service**: The component responsible for generating QR codes and printable label documents
- **Media_Service**: The component responsible for file upload, storage, thumbnail generation, and retrieval
- **Audit_Service**: The component responsible for recording and querying audit events
- **User**: An authenticated person interacting with the System
- **Role**: A permission level assigned to a User (Admin, Editor, Viewer, API_Client)

## Requirements

### Requirement 1: Item CRUD Operations

**User Story:** As a user, I want to create, view, edit, archive, and delete inventory items, so that I can maintain an accurate catalog of my belongings.

#### Acceptance Criteria

1. WHEN a user submits a valid item creation request, THE API_Server SHALL create a new Item record with a generated UUID and unique Short_Code and return the created Item.
2. WHEN a user requests an item by its ID or Short_Code, THE API_Server SHALL return the full Item record including current placement, tags, and primary photo reference.
3. WHEN a user submits a valid item update request, THE API_Server SHALL update the specified fields on the Item and record an Audit_Event for the modification.
4. WHEN a user archives an item, THE API_Server SHALL set the archived_at timestamp on the Item and retain the Item's Short_Code and UUID without recycling.
5. WHEN a user deletes an item, THE API_Server SHALL remove the Item record and its associated placements, tags, and media references.
6. THE API_Server SHALL support the following item types: Consumable, Equipment, Component, Tool, Container, Kit, and Documented_Reference.
7. THE API_Server SHALL store the following core fields for each Item: name, description, item_type, category_id, is_container, is_consumable, is_serialized, brand, model_number, part_number, serial_number, condition, status, quantity_mode, unit_of_measure, quantity_on_hand, minimum_quantity, reorder_quantity, purchase_date, purchase_source, purchase_price, warranty_expiration, calibration_due_date, maintenance_due_date, metadata_json, and notes.
8. IF an item creation request is missing the required name field, THEN THE API_Server SHALL return a validation error with a descriptive message.

### Requirement 2: Location Hierarchy Management

**User Story:** As a user, I want to create and manage a nested hierarchy of storage locations, so that I can model my real-world storage layout.

#### Acceptance Criteria

1. WHEN a user creates a new location with a parent_location_id, THE API_Server SHALL create the Location as a child of the specified parent and compute the path_text field reflecting the full ancestry chain.
2. WHEN a user creates a new location without a parent_location_id, THE API_Server SHALL create the Location as a root-level location.
3. WHEN a user requests a location by its ID, THE API_Server SHALL return the Location record including its path_text, parent reference, and direct children.
4. WHEN a user requests the contents of a location, THE API_Server SHALL return all Items currently placed at that location and all child locations.
5. WHEN a user requests the tree view of a location, THE API_Server SHALL return the recursive subtree of locations rooted at the specified location.
6. WHEN a user updates a location's parent, THE API_Server SHALL recompute the path_text for the location and all its descendants.
7. THE API_Server SHALL assign each Location a unique UUID and a unique Short_Code for label use.
8. IF a user attempts to create a circular parent-child relationship, THEN THE API_Server SHALL reject the request with a descriptive error.

### Requirement 3: Container Tracking

**User Story:** As a user, I want to designate items as containers that can hold other items, so that I can model portable storage like boxes, cases, and tool bags.

#### Acceptance Criteria

1. WHEN an item is created with is_container set to true, THE API_Server SHALL treat the Item as a valid placement target for other items.
2. WHEN a user requests the contents of a container item, THE API_Server SHALL return all Items currently placed inside that container.
3. WHEN a container item is placed at a location, THE API_Server SHALL allow the resolved location of items inside the container to be derived from the container's placement.
4. IF a user attempts to place a container inside itself, THEN THE API_Server SHALL reject the request with a descriptive error.

### Requirement 4: Placement and Movement History

**User Story:** As a user, I want to place items into locations or containers and track their movement history, so that I can always find where something is and where it has been.

#### Acceptance Criteria

1. WHEN a user moves an item to a new location or container, THE API_Server SHALL set removed_at on the current active placement record and create a new placement record with the new destination.
2. THE API_Server SHALL determine the current placement of an item as the most recent item_placements record where removed_at is null.
3. WHEN a user requests the movement history of an item, THE API_Server SHALL return all placement records for that item ordered by placed_at descending.
4. THE API_Server SHALL require that each placement record references either a location_id or a parent_item_id (container), and not both as null.
5. WHEN a placement is created, THE API_Server SHALL record an Audit_Event of type "movement" for the item.

### Requirement 5: Consumables and Stock Tracking

**User Story:** As a user, I want to track quantities of consumable items and record stock changes, so that I can monitor supply levels and know when to reorder.

#### Acceptance Criteria

1. WHEN a user submits a stock adjustment for a consumable item, THE API_Server SHALL create a Stock_Transaction record with the transaction_type, quantity_delta, resulting_quantity, reason, and performing user.
2. WHEN a Stock_Transaction is recorded, THE API_Server SHALL update the item's quantity_on_hand to reflect the resulting_quantity.
3. THE API_Server SHALL support the following stock transaction types: add, consume, adjust, count, dispose, and return.
4. WHEN an item's quantity_on_hand falls below its minimum_quantity, THE Web_UI SHALL display the item as a low-stock item on the dashboard.
5. THE API_Server SHALL store minimum_quantity and reorder_quantity fields on consumable items to support low-stock detection.
6. WHEN a user requests the stock history of an item, THE API_Server SHALL return all Stock_Transaction records for that item ordered by created_at descending.

### Requirement 6: Tags

**User Story:** As a user, I want to apply tags to items and locations, so that I can organize and filter my inventory using flexible labels.

#### Acceptance Criteria

1. WHEN a user assigns a tag to an item, THE API_Server SHALL create an item_tags association linking the Tag to the Item.
2. WHEN a user assigns a tag to a location, THE API_Server SHALL create a location_tags association linking the Tag to the Location.
3. WHEN a user creates a new tag, THE API_Server SHALL generate a slug from the tag name and optionally store a color value.
4. WHEN a user searches or filters by tag, THE Search_Service SHALL return all items or locations associated with the specified tag.
5. THE API_Server SHALL allow multiple tags per item and multiple tags per location.

### Requirement 7: Photos and Media Management

**User Story:** As a user, I want to upload photos, documents, and attachments to items and locations, so that I can visually identify items and store related files.

#### Acceptance Criteria

1. WHEN a user uploads a file for an item or location, THE Media_Service SHALL store the file on disk under a path structured as `/data/media/{entity_type}/{entity_id}/`, record the metadata in the media_assets table, and return the Media_Asset record.
2. THE Media_Service SHALL validate uploaded files for MIME type, file extension, and maximum file size before storing.
3. THE Media_Service SHALL generate a thumbnail for uploaded photo files.
4. THE API_Server SHALL support multiple media assets per item and per location.
5. WHEN a user designates a photo as the primary photo for an item, THE API_Server SHALL mark that Media_Asset as the primary and unmark any previously primary photo for the same item.
6. IF an uploaded file fails MIME type or size validation, THEN THE Media_Service SHALL reject the upload with a descriptive error message.

### Requirement 8: QR Label Generation and Scanning

**User Story:** As a user, I want to generate QR code labels for items, containers, and locations, and scan them to quickly access records, so that I can physically label and identify my inventory.

#### Acceptance Criteria

1. WHEN a user requests label generation for an entity, THE Label_Service SHALL generate a QR code containing a stable URL path in the format `/scan/{SHORT_CODE}` and create a label_records entry.
2. THE Label_Service SHALL render printable labels containing the entity type prefix, name, Short_Code, and QR image.
3. THE Label_Service SHALL support label output in PDF format suitable for small adhesive labels and standard paper print sheets.
4. WHEN a QR code or short code is scanned or entered, THE API_Server SHALL resolve the code to the corresponding entity and return its type and ID.
5. WHEN a scan resolves to a location or container, THE Web_UI SHALL display the entity's contents and quick action buttons for move, adjust quantity, add note, and reprint label.
6. WHEN a scan resolves to an item, THE Web_UI SHALL display the item summary and quick action buttons.
7. THE Web_UI SHALL support QR scanning via browser camera input and manual short code text entry.
8. THE API_Server SHALL maintain Short_Code stability so that printed labels remain valid indefinitely and codes are never recycled.

### Requirement 9: Search and Discovery

**User Story:** As a user, I want to search across my entire inventory using text queries and filters, so that I can quickly find items, locations, and containers.

#### Acceptance Criteria

1. WHEN a user submits a search query, THE Search_Service SHALL search across item names, descriptions, notes, tags, brand, model_number, part_number, serial_number, and current location path.
2. THE Search_Service SHALL support structured filtering by category, item_type, location subtree, tag, quantity thresholds, has_photo, and maintenance_due status.
3. THE Search_Service SHALL support fuzzy matching to handle misspelled item names, approximate model numbers, and partial matches.
4. WHEN search results are returned, THE API_Server SHALL group results by entity type (Items, Locations, Containers, Tags) and include current location and tags for each item result.
5. THE Web_UI SHALL display a global search bar that is always visible and accessible.
6. WHEN a user saves a set of filters, THE API_Server SHALL persist the filter configuration as a Saved_View associated with the user.
7. THE Search_Service SHALL support debounced search input in the Web_UI to avoid excessive API calls during typing.

### Requirement 10: REST API Design

**User Story:** As a developer or integration tool, I want a stable, versioned, and documented REST API, so that I can query and manage inventory data programmatically.

#### Acceptance Criteria

1. THE API_Server SHALL prefix all API routes with `/api/v1/`.
2. THE API_Server SHALL use JSON for all request and response bodies.
3. THE API_Server SHALL validate all incoming requests using Pydantic schemas and return descriptive validation errors for invalid input.
4. THE API_Server SHALL generate OpenAPI documentation accessible at a standard documentation endpoint.
5. THE API_Server SHALL expose CRUD endpoints for items, locations, categories, tags, and media.
6. THE API_Server SHALL expose action endpoints for item movement (`/items/{id}/move`), stock adjustment (`/items/{id}/adjust-stock`), and label generation (`/labels/generate`).
7. THE API_Server SHALL expose search endpoints at `/search` for global queries and `/search/advanced` for structured filter queries.
8. THE API_Server SHALL expose scan resolution at `/scan/{code}` and `/entities/by-code/{code}`.
9. THE API_Server SHALL expose health check endpoints at `/health/live` and `/health/ready`.

### Requirement 11: Audit and History Tracking

**User Story:** As a user, I want the system to automatically record an audit trail of changes, movements, and stock adjustments, so that I can review the history of any item or location.

#### Acceptance Criteria

1. WHEN an item is created, updated, archived, deleted, or moved, THE Audit_Service SHALL record an Audit_Event with the actor user ID, entity type, entity ID, event type, and event data.
2. WHEN a Stock_Transaction is recorded, THE Audit_Service SHALL record an Audit_Event for the stock change.
3. WHEN a media asset is uploaded or deleted, THE Audit_Service SHALL record an Audit_Event for the media change.
4. WHEN a user requests the history of an item, THE API_Server SHALL return all Audit_Events for that item ordered by created_at descending.
5. THE Audit_Service SHALL store event_data_json containing relevant before/after values or contextual details for each event.

### Requirement 12: Authentication and Authorization

**User Story:** As a user, I want the system to require authentication and support role-based access, so that the system is secure and ready for future multi-user scenarios.

#### Acceptance Criteria

1. THE API_Server SHALL require authentication for all API endpoints except health checks and the login endpoint.
2. WHEN a user submits valid credentials to the login endpoint, THE API_Server SHALL return a session or JWT token for subsequent authenticated requests.
3. THE API_Server SHALL hash all user passwords using a modern password hashing algorithm (e.g., bcrypt or argon2).
4. THE API_Server SHALL support token-based authentication for API integrations, with endpoints to create and revoke API tokens.
5. THE API_Server SHALL support four roles: Admin, Editor, Viewer, and API_Client.
6. WHILE a user has the Viewer role, THE API_Server SHALL permit read-only access and reject create, update, and delete operations.
7. IF an unauthenticated request is made to a protected endpoint, THEN THE API_Server SHALL return a 401 Unauthorized response.
8. IF an authenticated user lacks the required role for an operation, THEN THE API_Server SHALL return a 403 Forbidden response.

### Requirement 13: Categories and Metadata Templates

**User Story:** As a user, I want to define item categories with custom metadata schemas, so that different types of items can have category-specific fields without hard-coding every possible attribute.

#### Acceptance Criteria

1. WHEN a user creates a category, THE API_Server SHALL store the category with a name, slug, optional parent_category_id, description, and optional metadata_schema_json.
2. THE API_Server SHALL support hierarchical categories with parent-child relationships.
3. WHEN an item is assigned to a category that has a metadata_schema_json, THE Web_UI SHALL render input fields matching the schema for the item's metadata_json.
4. WHEN an item's metadata_json is submitted, THE API_Server SHALL validate the metadata against the category's metadata_schema_json if one is defined.
5. THE API_Server SHALL expose CRUD endpoints for categories at `/api/v1/categories`.

### Requirement 14: Item Relationships

**User Story:** As a user, I want to define relationships between items (e.g., accessory-of, spare-part-for, compatible-with, belongs-to-kit), so that I can model how items relate to each other.

#### Acceptance Criteria

1. WHEN a user creates a relationship between two items, THE API_Server SHALL store an item_relationships record with source_item_id, target_item_id, relationship_type, and optional note.
2. THE API_Server SHALL support relationship types including: accessory_of, spare_part_for, compatible_with, belongs_to_kit, and manual_for.
3. WHEN a user requests an item's relationships, THE API_Server SHALL return all relationships where the item is either the source or target.
4. THE API_Server SHALL expose relationship endpoints at `/api/v1/items/{id}/relationships`.

### Requirement 15: Bulk Import and Export

**User Story:** As a user, I want to import items from CSV files and export my inventory data in CSV and JSON formats, so that I can bootstrap my catalog quickly and maintain backups.

#### Acceptance Criteria

1. WHEN a user submits a CSV file for import, THE API_Server SHALL parse the file and create Item records for each valid row, returning a summary of created, skipped, and errored rows.
2. WHEN a user requests a JSON export, THE API_Server SHALL generate a full-fidelity JSON export of all items, locations, placements, tags, and relationships.
3. WHEN a user requests a CSV export, THE API_Server SHALL generate a CSV file containing item records with core fields.
4. IF a CSV import row contains invalid or missing required data, THEN THE API_Server SHALL skip the row and include it in the error summary without aborting the entire import.

### Requirement 16: Duplicate Detection

**User Story:** As a user, I want the system to detect likely duplicate items, so that I can keep my catalog clean and merge duplicates when found.

#### Acceptance Criteria

1. WHEN a new item is created, THE API_Server SHALL check for potential duplicates by comparing name, model_number, and part_number against existing items.
2. WHEN potential duplicates are detected, THE API_Server SHALL return the list of candidate duplicate items alongside the creation response.
3. WHEN a user requests a merge of two items, THE API_Server SHALL consolidate placements, tags, media, relationships, and audit history from the source item into the target item and archive the source item.

### Requirement 17: Backup and Recovery

**User Story:** As a user, I want reliable backup and restore capabilities, so that I can protect my inventory data against loss.

#### Acceptance Criteria

1. THE System SHALL support PostgreSQL logical dump as the primary database backup mechanism.
2. THE System SHALL store media files on disk in a structured directory layout that can be backed up alongside the database dump.
3. THE System SHALL provide a documented restore procedure for recovering from a database dump and media directory backup.
4. WHEN a user requests a full export, THE API_Server SHALL generate a ZIP bundle containing the JSON data export and references to associated media files.

### Requirement 18: Web UI Core Screens

**User Story:** As a user, I want a responsive web interface with key screens for managing my inventory, so that I can use the system from desktop and mobile devices.

#### Acceptance Criteria

1. THE Web_UI SHALL provide a Dashboard screen displaying recently added items, recently moved items, low-stock items, items needing maintenance, unassigned items, and quick-add buttons.
2. THE Web_UI SHALL provide an Item List View with table/grid toggle, filter sidebar, sorting by name/category/quantity/updated_date/location, and bulk action support.
3. THE Web_UI SHALL provide an Item Detail View with sections for summary, photos, metadata, notes, current location, relationships, movement history, stock history, files, and label/QR.
4. THE Web_UI SHALL provide a Location Explorer with a tree sidebar, contents panel, breadcrumb trail, location metadata, and nested container navigation.
5. THE Web_UI SHALL provide a Quick Add screen allowing item creation with minimal fields, optional photo upload, optional scan-to-assign location, and bulk add support.
6. THE Web_UI SHALL provide a Scan View with camera scan input and manual code entry that resolves to the entity detail page.
7. THE Web_UI SHALL provide a Label Center for generating, reprinting, and batch printing labels.
8. THE Web_UI SHALL provide a Settings screen for managing categories, metadata templates, users, backup/export, API tokens, and preferences.

### Requirement 19: Mobile and Practical Usability

**User Story:** As a user, I want the interface to work well on mobile devices and be practical for use while standing in a workshop, so that I can manage inventory on the go.

#### Acceptance Criteria

1. THE Web_UI SHALL use responsive layout that adapts to mobile screen sizes.
2. THE Web_UI SHALL use large tap targets suitable for touch interaction on mobile devices.
3. THE Web_UI SHALL use strong color contrast for readability in varied lighting conditions.
4. THE Web_UI SHALL minimize modal dialog usage in favor of inline interactions.
5. THE Web_UI SHALL display breadcrumb navigation for location context throughout the application.
6. THE Web_UI SHALL support keyboard navigation for efficient desktop data entry.

### Requirement 20: Docker Compose Deployment

**User Story:** As a user, I want to deploy the entire system using Docker Compose, so that setup is straightforward and self-contained.

#### Acceptance Criteria

1. THE System SHALL provide a Docker Compose configuration defining services for the frontend, backend, PostgreSQL database, and optional reverse proxy.
2. THE System SHALL persist PostgreSQL data, media files, and generated labels using Docker volumes.
3. THE System SHALL use Alembic migrations to initialize and update the database schema on backend startup.
4. WHEN the Docker Compose stack is started, THE System SHALL be accessible from the local network on a configurable port.
5. THE System SHALL provide environment variable configuration for database credentials, secret keys, and service ports.

### Requirement 21: Equipment Lifecycle Tracking

**User Story:** As a user, I want to track the condition, maintenance schedule, and lifecycle state of equipment items, so that I can manage calibration, repairs, and retirement.

#### Acceptance Criteria

1. THE API_Server SHALL support the following equipment condition/status values: Available, In_Use, Loaned_Out, Needs_Repair, and Retired.
2. THE API_Server SHALL store calibration_due_date and maintenance_due_date fields on equipment items.
3. WHEN an equipment item's calibration_due_date or maintenance_due_date is within a configurable threshold, THE Web_UI SHALL display the item in the "Needs Maintenance" dashboard section.
4. THE API_Server SHALL support linking accessory items to equipment items via the item_relationships mechanism.

### Requirement 22: Saved Views and Filters

**User Story:** As a user, I want to save frequently used search filters as named views, so that I can quickly access common queries like "low stock" or "items in outdoor shed."

#### Acceptance Criteria

1. WHEN a user saves a filter configuration with a name, THE API_Server SHALL create a Saved_View record with the user_id, name, entity_type, and filter_json.
2. WHEN a user selects a saved view, THE Web_UI SHALL apply the stored filter configuration and display the matching results.
3. THE API_Server SHALL support updating and deleting saved views.
4. THE Web_UI SHALL provide preset saved views for common queries: Low Stock, No Photo, Unsorted Items, and Needs Maintenance.

### Requirement 23: Identifier Stability and Label Integrity

**User Story:** As a user, I want all item and location identifiers to remain stable over time, so that physical labels remain valid and scannable indefinitely.

#### Acceptance Criteria

1. THE API_Server SHALL assign each Item and Location a UUID primary key and a unique Short_Code at creation time.
2. THE API_Server SHALL never recycle or reassign a Short_Code, even after the associated entity is archived or deleted.
3. WHEN an entity is archived, THE API_Server SHALL retain the entity's UUID and Short_Code and continue to resolve scan requests to the archived record.
4. THE API_Server SHALL use the Short_Code as the QR payload identifier in the format `/scan/{SHORT_CODE}`.

### Requirement 24: Database Schema and Migrations

**User Story:** As a developer, I want the database schema managed through versioned migrations, so that schema changes are tracked and reproducible.

#### Acceptance Criteria

1. THE System SHALL use Alembic for all database schema migrations.
2. THE System SHALL define relational tables for: users, item_categories, items, locations, item_placements, tags, item_tags, location_tags, media_assets, stock_transactions, item_relationships, label_records, audit_events, and saved_views.
3. THE System SHALL use PostgreSQL JSONB columns for metadata_json, event_data_json, and filter_json to support flexible semi-structured data.
4. THE System SHALL store a normalized_name field on items to support case-insensitive and accent-insensitive search.
