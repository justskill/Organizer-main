# Requirements Document

## Introduction

The Auto-Classification feature enables users to photograph an item during creation and use an LLM (via OpenRouter) to automatically identify and populate item details. This reduces manual data entry on the Item create page by inferring fields such as name, brand, model number, item type, and description from one or more photos. Multiple images can be provided in a single request to give the LLM additional context for more accurate classification. The LLM model and OpenRouter credentials are configurable through the Settings page. The system presents inferred values for user review before final item creation.

## Glossary

- **Classification_Service**: The backend service that sends one or more images to the OpenRouter API and returns structured item field suggestions.
- **OpenRouter_API**: The third-party API gateway (https://openrouter.ai/api/v1) used to route requests to a configurable LLM.
- **ItemForm**: The frontend page (`/items/new`) used to create or edit inventory items.
- **Settings_Page**: The frontend page where users configure application preferences, including OpenRouter credentials and model selection.
- **Classification_Result**: A structured response from the Classification_Service containing inferred item field values and a confidence indicator for each field.
- **Review_Panel**: A UI component on the ItemForm that displays the Classification_Result for user confirmation before populating the form.
- **Classifiable_Fields**: The subset of Item fields that the LLM may infer from images: name, description, item_type, brand, model_number, part_number, condition, and is_consumable.
- **Max_Images_Per_Request**: The maximum number of images accepted in a single classification request, set to 5.

## Requirements

### Requirement 1: OpenRouter Settings Configuration

**User Story:** As an administrator, I want to configure OpenRouter API credentials and model selection in the Settings page, so that the system can connect to an LLM for image classification.

#### Acceptance Criteria

1. THE Settings_Page SHALL display an "AI Classification" section within the Preferences tab containing fields for OpenRouter API key, and model identifier.
2. WHEN no model identifier is configured, THE Settings_Page SHALL default the model identifier field to `google/gemini-2.5-flash-lite`.
3. WHEN the user saves OpenRouter settings, THE Settings_Page SHALL persist the API key and model identifier to the backend configuration store.
4. THE Settings_Page SHALL mask the API key input field to prevent casual observation of the stored credential.
5. IF the user saves settings with an empty API key, THEN THE Settings_Page SHALL clear any previously stored API key and disable the classification feature.

### Requirement 2: Image Capture for Classification

**User Story:** As a user, I want to capture or upload one or more photos of an item on the create form, so that the system can classify the item from the images with additional context.

#### Acceptance Criteria

1. THE ItemForm SHALL display a "Classify from Photos" button in the Basic Information section when creating a new item.
2. WHEN the user activates the "Classify from Photos" button, THE ItemForm SHALL open a file picker that accepts multiple image files (JPEG, PNG, WebP).
3. WHEN the user selects one or more image files, THE ItemForm SHALL display a thumbnail preview for each selected image.
4. THE ItemForm SHALL allow the user to remove individual images from the selected set before submitting for classification.
5. THE ItemForm SHALL allow the user to add additional images to the existing selection without replacing previously selected images.
6. IF no OpenRouter API key is configured, THEN THE ItemForm SHALL disable the "Classify from Photos" button and display a message directing the user to configure credentials in Settings.

### Requirement 3: Backend Classification Endpoint

**User Story:** As a developer, I want a backend API endpoint that accepts one or more images and returns structured item field suggestions, so that the frontend can populate the form with higher accuracy.

#### Acceptance Criteria

1. THE Classification_Service SHALL expose a POST endpoint at `/api/v1/classify/image` that accepts one or more multipart image files.
2. WHEN the endpoint receives valid images, THE Classification_Service SHALL send all images to the OpenRouter_API in a single request using the configured model identifier and API key.
3. THE Classification_Service SHALL instruct the LLM to consider all provided images together to return only Classifiable_Fields that the LLM can infer with reasonable confidence.
4. THE Classification_Service SHALL return a Classification_Result as JSON containing field name-value pairs and a per-field confidence level (high, medium, low).
5. THE Classification_Service SHALL validate that returned item_type values match the ItemType enum (Consumable, Equipment, Component, Tool, Container, Kit, Documented_Reference).
6. IF the OpenRouter_API returns an error, THEN THE Classification_Service SHALL return an HTTP 502 response with a descriptive error message.
7. IF no OpenRouter API key is configured on the server, THEN THE Classification_Service SHALL return an HTTP 503 response indicating the classification service is not configured.
8. THE Classification_Service SHALL accept only image MIME types (image/jpeg, image/png, image/webp) for each uploaded file and reject requests containing other file types with an HTTP 400 response.
9. THE Classification_Service SHALL enforce a maximum size of 10 MB per individual image file.
10. THE Classification_Service SHALL enforce a maximum total payload size of 30 MB across all uploaded images in a single request.
11. THE Classification_Service SHALL enforce a maximum of 5 images per classification request and reject requests exceeding this limit with an HTTP 400 response.
12. THE Classification_Service SHALL require authentication with Admin or Editor role.

### Requirement 4: Classification Result Review

**User Story:** As a user, I want to review and edit the AI-suggested item details before they are applied to the form, so that I can correct any inaccurate inferences.

#### Acceptance Criteria

1. WHEN the Classification_Service returns a Classification_Result, THE Review_Panel SHALL display each inferred field with its value and confidence level.
2. THE Review_Panel SHALL allow the user to edit any inferred field value before applying the result to the form.
3. THE Review_Panel SHALL allow the user to deselect individual fields to exclude them from being applied to the form.
4. WHEN the user confirms the Classification_Result, THE Review_Panel SHALL populate the corresponding ItemForm fields with the accepted values.
5. WHEN the user confirms the Classification_Result, THE Review_Panel SHALL preserve any form field values that were not part of the Classification_Result.
6. THE Review_Panel SHALL provide a "Discard" action that closes the panel without modifying any form fields.
7. WHILE the Classification_Service is processing a request, THE ItemForm SHALL display a loading indicator and disable the "Classify from Photos" button.

### Requirement 5: LLM Prompt Constraints

**User Story:** As a user, I want the AI to only suggest values it can actually determine from the photos, so that I am not misled by fabricated details.

#### Acceptance Criteria

1. THE Classification_Service SHALL instruct the LLM to consider all provided images together to maximize inference accuracy before determining field values.
2. THE Classification_Service SHALL instruct the LLM to omit fields that cannot be visually determined from any of the provided images.
3. THE Classification_Service SHALL instruct the LLM to never fabricate serial numbers, part numbers, or purchase information.
4. THE Classification_Service SHALL instruct the LLM to return an empty Classification_Result rather than guess when the content across all provided images is unclear or unrecognizable.
5. WHEN the Classification_Result contains zero inferred fields, THE Review_Panel SHALL display a message indicating the images could not be classified and suggest the user try clearer or additional photos.

### Requirement 6: Classification Result Serialization

**User Story:** As a developer, I want the classification response to follow a well-defined JSON schema, so that the frontend can reliably parse and display the results.

#### Acceptance Criteria

1. THE Classification_Service SHALL return the Classification_Result as a JSON object with a `fields` array, where each entry contains `field_name`, `value`, and `confidence`.
2. THE Classification_Service SHALL constrain `field_name` values to the set of Classifiable_Fields defined in the Glossary.
3. THE Classification_Service SHALL constrain `confidence` values to one of: "high", "medium", "low".
4. FOR ALL valid Classification_Result objects, serializing to JSON then deserializing SHALL produce an equivalent Classification_Result object (round-trip property).

### Requirement 7: Settings Persistence

**User Story:** As an administrator, I want OpenRouter settings to persist across server restarts, so that I do not need to reconfigure the integration each time.

#### Acceptance Criteria

1. THE Classification_Service SHALL store OpenRouter configuration (API key and model identifier) in the application database.
2. WHEN the backend starts, THE Classification_Service SHALL load OpenRouter configuration from the database.
3. THE Classification_Service SHALL encrypt the stored API key at rest using the application secret key.
4. THE Settings_Page SHALL expose GET and PUT endpoints at `/api/v1/settings/classification` for reading and updating the classification configuration.
5. WHEN reading classification settings, THE GET endpoint SHALL return the model identifier and a boolean indicating whether an API key is configured, without exposing the API key value.
