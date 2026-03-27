# Implementation Plan: Auto-Classification

## Overview

Implement LLM-powered image classification for the inventory system. Users photograph items during creation, the backend proxies images to OpenRouter, and results are reviewed before populating the ItemForm. The implementation proceeds bottom-up: database model → service layer → API endpoints → frontend components.

## Tasks

- [x] 1. Add dependencies and create Alembic migration
  - [x] 1.1 Add `cryptography` and `httpx` to `backend/requirements.txt`
    - Add `cryptography` for Fernet encryption of API keys
    - Add `httpx` for async HTTP calls to OpenRouter API
    - _Requirements: 7.3, 3.2_

  - [x] 1.2 Create ClassificationSettings SQLAlchemy model in `backend/app/models/classification_settings.py`
    - Define `ClassificationSettings` model with `id` (UUID), `api_key_encrypted` (Text, nullable), `model_identifier` (String(255), default `google/gemini-2.5-flash-lite`), `updated_at` (DateTime with timezone)
    - Use existing `Base` and `UUIDMixin` from `app.models.base`
    - _Requirements: 7.1, 7.2_

  - [x] 1.3 Create Alembic migration for `classification_settings` table
    - Generate migration that creates the `classification_settings` table with columns matching the model
    - _Requirements: 7.1_

- [x] 2. Implement classification schemas and service
  - [x] 2.1 Create Pydantic schemas in `backend/app/schemas/classification.py`
    - Define `ClassificationField` with `field_name` (Literal of classifiable fields), `value` (str), `confidence` (Literal["high", "medium", "low"])
    - Define `ClassificationResult` with `fields: list[ClassificationField]`
    - Define `ClassificationSettingsRead` with `model_identifier: str` and `has_api_key: bool`
    - Define `ClassificationSettingsUpdate` with `api_key: str | None` and `model_identifier: str`
    - _Requirements: 6.1, 6.2, 6.3, 7.5_

  - [x] 2.2 Write property test for ClassificationResult schema validity
    - **Property 4: ClassificationResult schema validity**
    - **Validates: Requirements 6.1, 6.2, 6.3**

  - [x] 2.3 Write property test for ClassificationResult JSON round-trip
    - **Property 5: ClassificationResult JSON round-trip**
    - **Validates: Requirements 6.4**

  - [x] 2.4 Implement ClassificationService in `backend/app/services/classification_service.py`
    - Implement `_get_fernet()` using `hashlib.sha256` on `settings.secret_key` + `base64.urlsafe_b64encode`
    - Implement `_encrypt_api_key(key)` and `_decrypt_api_key(encrypted)` using Fernet
    - Implement `get_settings(db)` to load singleton config row
    - Implement `save_settings(db, api_key, model_identifier)` to upsert config with encrypted API key
    - Implement `_build_prompt()` returning system prompt with constraints: omit uncertain fields, never fabricate serial/part/purchase info, return empty result for unclear images, consider all images together, output JSON matching ClassificationResult schema
    - Implement `classify_images(db, files)` to validate files, base64-encode images, call OpenRouter via `httpx`, parse response, validate item_type enum values, return `ClassificationResult`
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 5.1, 5.2, 5.3, 5.4, 7.1, 7.2, 7.3_

  - [x] 2.5 Write property test for API key encryption round-trip
    - **Property 2: API key encryption round-trip**
    - **Validates: Requirements 7.3**

  - [x] 2.6 Write property test for item_type enum validation
    - **Property 7: item_type enum validation**
    - **Validates: Requirements 3.5**

- [x] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement classification API endpoints
  - [x] 4.1 Create classification API router in `backend/app/api/v1/classify.py`
    - Implement `POST /api/v1/classify/image` accepting `List[UploadFile]` (field name: `files`)
      - Require Admin/Editor role via `require_role(UserRole.Admin, UserRole.Editor)`
      - Validate file count (1–5), individual size (≤10MB), total size (≤30MB), MIME types (image/jpeg, image/png, image/webp)
      - Return 400 for validation failures, 502 for OpenRouter errors, 503 if no API key configured
      - Return `ClassificationResult` JSON on success
    - Implement `GET /api/v1/settings/classification` requiring Admin role
      - Return `ClassificationSettingsRead` with `has_api_key` boolean, never expose raw key
    - Implement `PUT /api/v1/settings/classification` requiring Admin role
      - Accept `ClassificationSettingsUpdate`, clear API key if empty/null, return `ClassificationSettingsRead`
    - _Requirements: 3.1, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12, 1.3, 1.5, 7.4, 7.5_

  - [x] 4.2 Register classification router in `backend/app/main.py`
    - Import and include the classify router with `/api/v1` prefix
    - Add `"classification"` tag to `tags_metadata`
    - _Requirements: 3.1_

  - [x] 4.3 Write property test for classification endpoint input validation
    - **Property 6: Classification endpoint input validation**
    - **Validates: Requirements 3.8, 3.9, 3.10, 3.11**

  - [x] 4.4 Write property test for classification endpoint role enforcement
    - **Property 8: Classification endpoint role enforcement**
    - **Validates: Requirements 3.12**

  - [x] 4.5 Write property test for settings round-trip persistence
    - **Property 1: Settings round-trip persistence**
    - **Validates: Requirements 1.3, 1.5**

  - [x] 4.6 Write property test for GET settings never exposes raw API key
    - **Property 3: GET settings never exposes raw API key**
    - **Validates: Requirements 7.5**

- [x] 5. Checkpoint - Ensure all backend tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement frontend AI Classification settings
  - [x] 6.1 Add AI Classification section to SettingsPage
    - Add a new section within the existing settings page (new tab or section in Preferences)
    - Include API Key input (type="password", masked) and Model identifier input with default placeholder `google/gemini-2.5-flash-lite`
    - Save button calls `PUT /api/v1/settings/classification`
    - Load current settings via `GET /api/v1/settings/classification` on mount
    - Show status indicator for whether API key is configured
    - Clear API key when saved empty (disables classification)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 7. Implement frontend classification flow in ItemForm
  - [x] 7.1 Add `fast-check` to `frontend/package.json` devDependencies
    - _Requirements: Testing infrastructure_

  - [x] 7.2 Add "Classify from Photos" button and image picker to ItemForm
    - Add button in Basic Information card, visible only when `isEdit === false`
    - Check classification settings on mount; disable button with message if no API key configured
    - Open multi-file picker accepting `image/jpeg, image/png, image/webp`
    - Show thumbnail previews with individual remove buttons
    - Support adding more images without replacing existing selection
    - Show loading indicator and disable button during classification request
    - Submit selected images to `POST /api/v1/classify/image` as `multipart/form-data`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 4.7_

  - [x] 7.3 Write property test for image selection state management
    - **Property 9: Image selection state management**
    - **Validates: Requirements 2.3, 2.4, 2.5**

  - [x] 7.4 Create ReviewPanel component in `frontend/src/components/ReviewPanel.tsx`
    - Display each inferred field with name, editable value input, and color-coded confidence badge
    - Checkbox per field to include/exclude from application (all selected by default)
    - "Apply" button populates ItemForm fields with accepted values, preserving non-classified fields
    - "Discard" button closes panel without modifying form
    - Empty result state shows "Could not classify" message suggesting clearer/additional photos
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 5.5_

  - [x] 7.5 Write property test for review panel field application with preservation
    - **Property 10: Review panel field application with preservation**
    - **Validates: Requirements 4.4, 4.5**

  - [x] 7.6 Write property test for review panel discard preserves form state
    - **Property 11: Review panel discard preserves form state**
    - **Validates: Requirements 4.6**

  - [x] 7.7 Write property test for review panel renders all result fields
    - **Property 12: Review panel renders all result fields**
    - **Validates: Requirements 4.1**

  - [x] 7.8 Write property test for review panel field deselection
    - **Property 13: Review panel field deselection**
    - **Validates: Requirements 4.3**

- [x] 8. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties using `hypothesis` (backend) and `fast-check` (frontend)
- Unit tests validate specific examples and edge cases
- Backend uses Python (FastAPI + async SQLAlchemy), frontend uses TypeScript (React)
