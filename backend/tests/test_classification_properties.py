"""Property-based tests for auto-classification schemas.

Feature: auto-classification
"""

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st
from pydantic import ValidationError

from app.models.item import ItemType
from app.schemas.classification import ClassificationField, ClassificationResult
from app.services.classification_service import VALID_ITEM_TYPES, _validate_result

# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

VALID_FIELD_NAMES = [
    "name", "description", "item_type", "brand",
    "model_number", "part_number", "condition", "is_consumable",
]

VALID_CONFIDENCES = ["high", "medium", "low"]

classification_field_strategy = st.builds(
    ClassificationField,
    field_name=st.sampled_from(VALID_FIELD_NAMES),
    value=st.text(min_size=0, max_size=200),
    confidence=st.sampled_from(VALID_CONFIDENCES),
)

classification_result_strategy = st.builds(
    ClassificationResult,
    fields=st.lists(classification_field_strategy, min_size=0, max_size=10),
)

# ---------------------------------------------------------------------------
# Property 4: ClassificationResult schema validity
# Tag: Feature: auto-classification, Property 4: ClassificationResult schema validity
# Validates: Requirements 6.1, 6.2, 6.3
# ---------------------------------------------------------------------------


class TestClassificationResultSchemaValidity:
    """Property 4: ClassificationResult schema validity

    *For any* valid ClassificationResult object, it must have a `fields` array
    where each entry contains a `field_name` from the valid set, a string
    `value`, and a `confidence` value from {high, medium, low}.

    **Validates: Requirements 6.1, 6.2, 6.3**
    """

    @given(result=classification_result_strategy)
    @settings(max_examples=100)
    def test_valid_classification_result_conforms_to_schema(self, result: ClassificationResult):
        """Every generated ClassificationResult has a fields list where each
        entry has valid field_name, string value, and valid confidence."""
        assert isinstance(result.fields, list)
        for field in result.fields:
            assert field.field_name in VALID_FIELD_NAMES
            assert isinstance(field.value, str)
            assert field.confidence in VALID_CONFIDENCES

    @given(bad_name=st.text(min_size=1, max_size=50).filter(lambda s: s not in VALID_FIELD_NAMES))
    @settings(max_examples=100)
    def test_invalid_field_name_rejected(self, bad_name: str):
        """ClassificationField rejects field_name values outside the allowed set."""
        with pytest.raises(ValidationError):
            ClassificationField(field_name=bad_name, value="test", confidence="high")

    @given(bad_conf=st.text(min_size=1, max_size=50).filter(lambda s: s not in VALID_CONFIDENCES))
    @settings(max_examples=100)
    def test_invalid_confidence_rejected(self, bad_conf: str):
        """ClassificationField rejects confidence values outside {high, medium, low}."""
        with pytest.raises(ValidationError):
            ClassificationField(field_name="name", value="test", confidence=bad_conf)


# ---------------------------------------------------------------------------
# Property 5: ClassificationResult JSON round-trip
# Tag: Feature: auto-classification, Property 5: ClassificationResult JSON round-trip
# Validates: Requirements 6.4
# ---------------------------------------------------------------------------


class TestClassificationResultJsonRoundTrip:
    """Property 5: ClassificationResult JSON round-trip

    *For any* valid ClassificationResult object, serializing to JSON then
    deserializing should produce an equivalent ClassificationResult object.

    **Validates: Requirements 6.4**
    """

    @given(result=classification_result_strategy)
    @settings(max_examples=100)
    def test_json_round_trip_produces_equivalent_object(self, result: ClassificationResult):
        """Serializing a ClassificationResult to JSON and back yields an equal object."""
        json_str = result.model_dump_json()
        restored = ClassificationResult.model_validate_json(json_str)
        assert restored == result

    @given(result=classification_result_strategy)
    @settings(max_examples=100)
    def test_dict_round_trip_produces_equivalent_object(self, result: ClassificationResult):
        """Serializing a ClassificationResult to dict and back yields an equal object."""
        data = result.model_dump()
        restored = ClassificationResult.model_validate(data)
        assert restored == result


# ---------------------------------------------------------------------------
# Property 2: API key encryption round-trip
# Tag: Feature: auto-classification, Property 2: API key encryption round-trip
# Validates: Requirements 7.3
# ---------------------------------------------------------------------------


class TestApiKeyEncryptionRoundTrip:
    """Property 2: API key encryption round-trip

    *For any* non-empty API key string, encrypting it with ``_encrypt_api_key``
    then decrypting with ``_decrypt_api_key`` should produce the original API
    key string.

    **Validates: Requirements 7.3**
    """

    @given(api_key=st.text(min_size=1, max_size=500))
    @settings(max_examples=100)
    def test_encrypt_decrypt_round_trip(self, api_key: str):
        """Encrypting then decrypting any non-empty string returns the original."""
        from app.services.classification_service import _decrypt_api_key, _encrypt_api_key

        encrypted = _encrypt_api_key(api_key)
        assert encrypted != api_key  # ciphertext differs from plaintext
        decrypted = _decrypt_api_key(encrypted)
        assert decrypted == api_key

    @given(api_key=st.text(min_size=1, max_size=500))
    @settings(max_examples=100)
    def test_encryption_produces_different_ciphertext_each_call(self, api_key: str):
        """Fernet encryption is non-deterministic — two encryptions of the same
        key should (almost certainly) produce different ciphertext."""
        from app.services.classification_service import _encrypt_api_key

        ct1 = _encrypt_api_key(api_key)
        ct2 = _encrypt_api_key(api_key)
        # Fernet includes a timestamp + random IV, so ciphertexts should differ
        assert ct1 != ct2


# ---------------------------------------------------------------------------
# Property 7: item_type enum validation
# Tag: Feature: auto-classification, Property 7: item_type enum validation
# Validates: Requirements 3.5
# ---------------------------------------------------------------------------

# Strategies for Property 7

valid_item_type_strategy = st.sampled_from(sorted(VALID_ITEM_TYPES))

invalid_item_type_strategy = st.text(min_size=1, max_size=50).filter(
    lambda s: s not in VALID_ITEM_TYPES
)

# Non-item_type fields that should always pass through validation
OTHER_VALID_FIELDS = [f for f in VALID_FIELD_NAMES if f != "item_type"]


def _raw_field(field_name: str, value: str, confidence: str = "high") -> dict:
    """Helper to build a raw field dict as the LLM would return."""
    return {"field_name": field_name, "value": value, "confidence": confidence}


class TestItemTypeEnumValidation:
    """Property 7: item_type enum validation

    *For any* ClassificationResult containing a field with
    ``field_name: "item_type"``, the ``value`` must be one of the valid
    ItemType enum values: Consumable, Equipment, Component, Tool, Container,
    Kit, Documented_Reference. Invalid values should be stripped from the
    result before returning to the client.

    **Validates: Requirements 3.5**
    """

    @given(valid_type=valid_item_type_strategy)
    @settings(max_examples=100)
    def test_valid_item_type_preserved(self, valid_type: str):
        """_validate_result preserves item_type fields with valid enum values."""
        raw = {"fields": [_raw_field("item_type", valid_type)]}
        result = _validate_result(raw)
        item_type_fields = [f for f in result.fields if f.field_name == "item_type"]
        assert len(item_type_fields) == 1
        assert item_type_fields[0].value == valid_type

    @given(invalid_type=invalid_item_type_strategy)
    @settings(max_examples=100)
    def test_invalid_item_type_stripped(self, invalid_type: str):
        """_validate_result strips item_type fields with values outside the ItemType enum."""
        raw = {"fields": [_raw_field("item_type", invalid_type)]}
        result = _validate_result(raw)
        item_type_fields = [f for f in result.fields if f.field_name == "item_type"]
        assert len(item_type_fields) == 0

    @given(
        valid_type=valid_item_type_strategy,
        invalid_type=invalid_item_type_strategy,
        other_field=st.sampled_from(OTHER_VALID_FIELDS),
        other_value=st.text(min_size=1, max_size=100),
        confidence=st.sampled_from(VALID_CONFIDENCES),
    )
    @settings(max_examples=100)
    def test_mixed_fields_preserves_valid_strips_invalid(
        self,
        valid_type: str,
        invalid_type: str,
        other_field: str,
        other_value: str,
        confidence: str,
    ):
        """Given a mix of valid item_type, invalid item_type, and other valid
        fields, _validate_result keeps the valid item_type and other fields
        while stripping only the invalid item_type entry."""
        raw = {
            "fields": [
                _raw_field("item_type", valid_type, confidence),
                _raw_field("item_type", invalid_type, confidence),
                _raw_field(other_field, other_value, confidence),
            ]
        }
        result = _validate_result(raw)

        # The valid item_type should be present
        item_type_fields = [f for f in result.fields if f.field_name == "item_type"]
        assert len(item_type_fields) == 1
        assert item_type_fields[0].value == valid_type

        # The other field should be preserved
        other_fields = [f for f in result.fields if f.field_name == other_field]
        assert len(other_fields) == 1
        assert other_fields[0].value == other_value

        # Total fields should be exactly 2 (valid item_type + other field)
        assert len(result.fields) == 2
