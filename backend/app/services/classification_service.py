"""Classification service — OpenRouter LLM integration for image classification."""

import base64
import hashlib
import json
import logging

import httpx
from cryptography.fernet import Fernet
from fastapi import UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.classification_settings import ClassificationSettings
from app.models.item import ItemType
from app.schemas.classification import ClassificationField, ClassificationResult

logger = logging.getLogger(__name__)

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

VALID_ITEM_TYPES = {e.value for e in ItemType}

CLASSIFIABLE_FIELDS = [
    "name", "description", "item_type", "brand",
    "model_number", "part_number", "condition", "is_consumable",
]


# ---------------------------------------------------------------------------
# Encryption helpers
# ---------------------------------------------------------------------------

def _get_fernet() -> Fernet:
    """Derive a Fernet key from the application secret_key."""
    key = hashlib.sha256(settings.secret_key.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key))


def _encrypt_api_key(key: str) -> str:
    """Encrypt an API key string using Fernet."""
    return _get_fernet().encrypt(key.encode()).decode()


def _decrypt_api_key(encrypted: str) -> str:
    """Decrypt a Fernet-encrypted API key string."""
    return _get_fernet().decrypt(encrypted.encode()).decode()


# ---------------------------------------------------------------------------
# Settings CRUD
# ---------------------------------------------------------------------------

async def get_settings(db: AsyncSession) -> ClassificationSettings | None:
    """Load the singleton classification settings row."""
    result = await db.execute(select(ClassificationSettings).limit(1))
    return result.scalar_one_or_none()


async def save_settings(
    db: AsyncSession,
    api_key: str | None,
    model_identifier: str,
) -> ClassificationSettings:
    """Upsert classification settings with an encrypted API key."""
    row = await get_settings(db)
    if row is None:
        row = ClassificationSettings()
        db.add(row)

    row.model_identifier = model_identifier

    if api_key:
        row.api_key_encrypted = _encrypt_api_key(api_key)
    else:
        row.api_key_encrypted = None

    await db.flush()
    await db.refresh(row)
    return row


# ---------------------------------------------------------------------------
# Prompt
# ---------------------------------------------------------------------------

def _build_prompt() -> str:
    """Return the system prompt instructing the LLM on classification output."""
    return (
        "You are an inventory classification assistant. "
        "You will receive one or more photographs of a physical item. "
        "Consider ALL provided images together to maximise inference accuracy.\n\n"
        "Return a JSON object matching this schema:\n"
        '{"fields": [{"field_name": "<field>", "value": "<value>", "confidence": "high|medium|low"}]}\n\n'
        f"Allowed field_name values: {', '.join(CLASSIFIABLE_FIELDS)}.\n"
        f"Allowed item_type values: {', '.join(sorted(VALID_ITEM_TYPES))}.\n\n"
        "Rules:\n"
        "- Only include fields you can determine with reasonable confidence from the images.\n"
        "- Always include a 'description' field with a brief, useful description of the item.\n"
        "- Omit any other field you are uncertain about.\n"
        "- NEVER fabricate serial numbers, part numbers, or purchase information.\n"
        "- A serial number is a unique identifier for one specific unit (often longer, alphanumeric). "
        "A model number identifies the product line/SKU (often shorter, printed on packaging or labels).\n"
        "- If the images are unclear or unrecognisable, return {\"fields\": []}.\n"
        "- Return ONLY the JSON object, no markdown fences or extra text."
    )


# ---------------------------------------------------------------------------
# Classification
# ---------------------------------------------------------------------------

async def classify_images(
    db: AsyncSession,
    files: list[UploadFile],
) -> ClassificationResult:
    """Send images to OpenRouter and return a validated ClassificationResult."""
    config = await get_settings(db)
    if config is None or not config.api_key_encrypted:
        raise ValueError("Classification service not configured. Set an OpenRouter API key in Settings.")

    api_key = _decrypt_api_key(config.api_key_encrypted)

    # Build image content parts
    image_parts: list[dict] = []
    for f in files:
        data = await f.read()
        b64 = base64.b64encode(data).decode()
        mime = f.content_type or "image/jpeg"
        image_parts.append({
            "type": "image_url",
            "image_url": {"url": f"data:{mime};base64,{b64}"},
        })

    messages = [
        {"role": "system", "content": _build_prompt()},
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "Classify the item shown in these images."},
                *image_parts,
            ],
        },
    ]

    payload = {
        "model": config.model_identifier,
        "messages": messages,
        "temperature": 0.2,
        "max_tokens": 1024,
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            resp = await client.post(
                OPENROUTER_URL,
                json=payload,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
            )
        except httpx.TimeoutException:
            raise RuntimeError("Classification request timed out. Please try again.")
        except httpx.HTTPError as exc:
            raise RuntimeError(f"Classification failed: {exc}")

    if resp.status_code != 200:
        detail = resp.text[:500]
        raise RuntimeError(f"Classification failed: {detail}")

    # Parse LLM response
    try:
        body = resp.json()
        content = body["choices"][0]["message"]["content"]
        # Strip markdown code fences if present (common LLM behavior)
        cleaned = content.strip()
        if cleaned.startswith("```"):
            # Remove opening fence (```json or ```)
            cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        cleaned = cleaned.strip()
        raw = json.loads(cleaned)
    except (KeyError, IndexError, json.JSONDecodeError) as exc:
        logger.error("Failed to parse classification response: %s", content if 'content' in dir() else "no content")
        raise RuntimeError("Could not parse classification response") from exc

    return _validate_result(raw)


# ---------------------------------------------------------------------------
# Validation helpers
# ---------------------------------------------------------------------------

def _validate_result(raw: dict) -> ClassificationResult:
    """Parse raw LLM JSON into a ClassificationResult, filtering invalid entries."""
    fields: list[ClassificationField] = []
    for entry in raw.get("fields", []):
        field_name = entry.get("field_name")
        value = entry.get("value")
        confidence = entry.get("confidence")

        if field_name not in CLASSIFIABLE_FIELDS:
            continue
        if confidence not in ("high", "medium", "low"):
            continue
        if not isinstance(value, str):
            continue

        # Strip invalid item_type values
        if field_name == "item_type" and value not in VALID_ITEM_TYPES:
            continue

        fields.append(ClassificationField(
            field_name=field_name,
            value=value,
            confidence=confidence,
        ))

    return ClassificationResult(fields=fields)
