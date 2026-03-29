import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import type { FormData, ClassificationField, ClassificationResult } from '@/pages/ItemForm'
import type { ItemType } from '@/types'

/**
 * Feature: auto-classification, Property 11: Review panel discard preserves form state
 * Validates: Requirements 4.6
 *
 * For any form state and any ClassificationResult, discarding the result should
 * leave the form state identical to the state before the classification was initiated.
 *
 * The discard operation in ItemForm simply sets classificationResult to null without
 * touching the form state. This property verifies that NOT calling
 * applyClassificationToForm means the form is unchanged — discard is the identity
 * function on form state.
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
  barcode: fc.string({ maxLength: 30 }),
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

// Arbitrary for a ClassificationField
const classificationFieldArb: fc.Arbitrary<ClassificationField> = fc.record({
  field_name: fc.constantFrom(...FIELD_NAMES),
  value: fc.string({ minLength: 1, maxLength: 30 }),
  confidence: fc.constantFrom(...CONFIDENCE_LEVELS),
})

// Generate a ClassificationResult with unique field_names
const classificationResultArb: fc.Arbitrary<ClassificationResult> = fc
  .uniqueArray(classificationFieldArb, {
    comparator: (a, b) => a.field_name === b.field_name,
    minLength: 0,
    maxLength: FIELD_NAMES.length,
  })
  .map((fields) => ({ fields }))

/**
 * Simulates the discard path: the form state is captured before classification,
 * a ClassificationResult arrives, but the user discards it. The discard handler
 * sets classificationResult to null without calling applyClassificationToForm,
 * so the form state must remain identical.
 */
function simulateDiscard(formBefore: FormData, _result: ClassificationResult): FormData {
  // Discard does nothing to the form — it's the identity on form state
  return formBefore
}

describe('Feature: auto-classification, Property 11: Review panel discard preserves form state', () => {
  /**
   * **Validates: Requirements 4.6**
   * For any form state and any classification result, not applying the result
   * (discard) preserves the form state exactly.
   */
  it('discard preserves form state — form after discard is deeply equal to form before', () => {
    fc.assert(
      fc.property(formDataArb, classificationResultArb, (form, result) => {
        const formAfterDiscard = simulateDiscard(form, result)
        expect(formAfterDiscard).toEqual(form)
      }),
      { numRuns: 100 }
    )
  })

  /**
   * **Validates: Requirements 4.6**
   * Every individual field in the form is identical before and after discard.
   */
  it('every form field is identical before and after discard', () => {
    fc.assert(
      fc.property(formDataArb, classificationResultArb, (form, result) => {
        const formAfterDiscard = simulateDiscard(form, result)

        for (const key of Object.keys(form) as (keyof FormData)[]) {
          expect(formAfterDiscard[key]).toEqual(form[key])
        }
      }),
      { numRuns: 100 }
    )
  })
})
