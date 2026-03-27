import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { applyClassificationToForm } from '@/components/ReviewPanel'
import type { FormData, ClassificationField } from '@/pages/ItemForm'
import type { ItemType } from '@/types'

/**
 * Feature: auto-classification, Property 10: Review panel field application with preservation
 * Validates: Requirements 4.4, 4.5
 *
 * For any initial form state and any ClassificationResult with a subset of fields
 * accepted by the user, applying the result should set each accepted field to its
 * corresponding value AND leave every non-accepted form field unchanged from its
 * initial value.
 */

const ITEM_TYPES: ItemType[] = [
  'Consumable', 'Equipment', 'Component', 'Tool', 'Container', 'Kit', 'Documented_Reference',
]

const FIELD_NAMES: ClassificationField['field_name'][] = [
  'name', 'description', 'item_type', 'brand', 'model_number', 'part_number', 'condition', 'is_consumable',
]

const CONFIDENCE_LEVELS: ClassificationField['confidence'][] = ['high', 'medium', 'low']

// Arbitrary for a valid FormData object
const formDataArb: fc.Arbitrary<FormData> = fc.record({
  name: fc.string({ maxLength: 50 }),
  item_type: fc.constantFrom(...ITEM_TYPES),
  description: fc.string({ maxLength: 100 }),
  brand: fc.string({ maxLength: 30 }),
  model_number: fc.string({ maxLength: 30 }),
  part_number: fc.string({ maxLength: 30 }),
  serial_number: fc.string({ maxLength: 30 }),
  condition: fc.string({ maxLength: 20 }),
  status: fc.string({ maxLength: 20 }),
  is_container: fc.boolean(),
  is_consumable: fc.boolean(),
  is_serialized: fc.boolean(),
  quantity_on_hand: fc.string({ maxLength: 10 }),
  minimum_quantity: fc.string({ maxLength: 10 }),
  reorder_quantity: fc.string({ maxLength: 10 }),
  unit_of_measure: fc.string({ maxLength: 20 }),
  purchase_date: fc.string({ maxLength: 20 }),
  purchase_source: fc.string({ maxLength: 30 }),
  purchase_price: fc.string({ maxLength: 15 }),
  warranty_expiration: fc.string({ maxLength: 20 }),
  calibration_due_date: fc.string({ maxLength: 20 }),
  maintenance_due_date: fc.string({ maxLength: 20 }),
  notes: fc.string({ maxLength: 100 }),
  category_ids: fc.array(fc.string({ maxLength: 36 }), { maxLength: 3 }),
})

// Arbitrary for a ClassificationField with unique field_name
const classificationFieldArb: fc.Arbitrary<ClassificationField> = fc.record({
  field_name: fc.constantFrom(...FIELD_NAMES),
  value: fc.string({ minLength: 1, maxLength: 30 }),
  confidence: fc.constantFrom(...CONFIDENCE_LEVELS),
})

// Generate an array of ClassificationFields with unique field_names
const uniqueFieldsArb: fc.Arbitrary<ClassificationField[]> = fc
  .uniqueArray(classificationFieldArb, {
    comparator: (a, b) => a.field_name === b.field_name,
    minLength: 0,
    maxLength: FIELD_NAMES.length,
  })

// Non-classifiable form fields that should never be changed
const NON_CLASSIFIABLE_KEYS: (keyof FormData)[] = [
  'serial_number', 'status', 'is_container', 'is_serialized',
  'quantity_on_hand', 'minimum_quantity', 'reorder_quantity',
  'unit_of_measure', 'purchase_date', 'purchase_source',
  'purchase_price', 'warranty_expiration', 'calibration_due_date',
  'maintenance_due_date', 'notes',
]

describe('Feature: auto-classification, Property 10: Review panel field application with preservation', () => {
  /**
   * **Validates: Requirements 4.4**
   * Applied fields have the correct values in the result.
   */
  it('accepted string fields are set to their classification values', () => {
    fc.assert(
      fc.property(
        formDataArb,
        uniqueFieldsArb.filter((fields) =>
          fields.some((f) => f.field_name !== 'is_consumable')
        ),
        (form, fields) => {
          const result = applyClassificationToForm(form, fields)

          for (const field of fields) {
            if (field.field_name === 'is_consumable') continue
            expect((result as unknown as Record<string, unknown>)[field.field_name]).toBe(field.value)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * **Validates: Requirements 4.4**
   * is_consumable field is correctly converted from string "true"/"false" to boolean.
   */
  it('is_consumable field is converted from string to boolean', () => {
    fc.assert(
      fc.property(
        formDataArb,
        fc.constantFrom('true', 'false'),
        fc.constantFrom(...CONFIDENCE_LEVELS),
        (form, boolStr, confidence) => {
          const fields: ClassificationField[] = [
            { field_name: 'is_consumable', value: boolStr, confidence },
          ]
          const result = applyClassificationToForm(form, fields)
          expect(result.is_consumable).toBe(boolStr.toLowerCase() === 'true')
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * **Validates: Requirements 4.5**
   * Non-classified fields are preserved unchanged.
   */
  it('non-classifiable fields are always preserved unchanged', () => {
    fc.assert(
      fc.property(formDataArb, uniqueFieldsArb, (form, fields) => {
        const result = applyClassificationToForm(form, fields)

        for (const key of NON_CLASSIFIABLE_KEYS) {
          expect(result[key]).toEqual(form[key])
        }
      }),
      { numRuns: 100 }
    )
  })

  /**
   * **Validates: Requirements 4.5**
   * Classifiable fields NOT in the accepted set remain at their initial values.
   */
  it('classifiable fields not in the accepted set remain unchanged', () => {
    fc.assert(
      fc.property(formDataArb, uniqueFieldsArb, (form, fields) => {
        const acceptedFieldNames = new Set(fields.map((f) => f.field_name))
        const result = applyClassificationToForm(form, fields)

        for (const fieldName of FIELD_NAMES) {
          if (!acceptedFieldNames.has(fieldName)) {
            expect((result as unknown as Record<string, unknown>)[fieldName]).toEqual(
              (form as unknown as Record<string, unknown>)[fieldName]
            )
          }
        }
      }),
      { numRuns: 100 }
    )
  })
})
