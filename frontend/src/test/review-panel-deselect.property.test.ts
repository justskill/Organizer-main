import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { applyClassificationToForm } from '@/components/ReviewPanel'
import type { FormData, ClassificationField } from '@/pages/ItemForm'
import type { ItemType } from '@/types'

/**
 * Feature: auto-classification, Property 13: Review panel field deselection
 * Validates: Requirements 4.3
 *
 * For any ClassificationResult and any subset of fields deselected by the user,
 * only the remaining selected fields should be applied to the form when the user confirms.
 */

const ITEM_TYPES: ItemType[] = [
  'Consumable', 'Equipment', 'Component', 'Tool', 'Container', 'Kit', 'Documented_Reference',
]

const FIELD_NAMES: ClassificationField['field_name'][] = [
  'name', 'description', 'item_type', 'brand', 'model_number', 'part_number', 'condition', 'is_consumable',
]

const CONFIDENCE_LEVELS: ClassificationField['confidence'][] = ['high', 'medium', 'low']

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

const classificationFieldArb: fc.Arbitrary<ClassificationField> = fc.record({
  field_name: fc.constantFrom(...FIELD_NAMES),
  value: fc.string({ minLength: 1, maxLength: 30 }),
  confidence: fc.constantFrom(...CONFIDENCE_LEVELS),
})

// Generate an array of ClassificationFields with unique field_names (N ≥ 1)
const uniqueFieldsArb: fc.Arbitrary<ClassificationField[]> = fc.uniqueArray(
  classificationFieldArb,
  {
    comparator: (a, b) => a.field_name === b.field_name,
    minLength: 1,
    maxLength: FIELD_NAMES.length,
  }
)

/**
 * Replicates the ReviewPanel handleApply logic:
 * - editedValues can override field values
 * - selected map determines which fields are included
 * Only selected fields are passed to applyClassificationToForm.
 */
function getAcceptedFields(
  fields: ClassificationField[],
  selected: Record<number, boolean>,
  editedValues: Record<number, string>
): ClassificationField[] {
  return fields
    .map((f, i) => ({
      ...f,
      value: editedValues[i] ?? f.value,
    }))
    .filter((_, i) => selected[i])
}

describe('Feature: auto-classification, Property 13: Review panel field deselection', () => {
  /**
   * **Validates: Requirements 4.3**
   * Deselected fields are NOT applied — their form values remain unchanged.
   */
  it('deselected fields leave form values unchanged', () => {
    fc.assert(
      fc.property(
        formDataArb,
        uniqueFieldsArb,
        (form, fields) => {
          // Generate a random selection where at least one field is deselected
          const selected: Record<number, boolean> = {}
          const editedValues: Record<number, string> = {}
          for (let i = 0; i < fields.length; i++) {
            selected[i] = i % 2 === 0 // alternate: even=selected, odd=deselected
            editedValues[i] = fields[i].value
          }

          const accepted = getAcceptedFields(fields, selected, editedValues)
          const result = applyClassificationToForm(form, accepted)

          // Deselected fields should remain at their original form values
          const deselectedFields = fields.filter((_, i) => !selected[i])
          for (const field of deselectedFields) {
            if (field.field_name === 'is_consumable') {
              expect(result.is_consumable).toEqual(form.is_consumable)
            } else {
              expect((result as unknown as Record<string, unknown>)[field.field_name]).toEqual(
                (form as unknown as Record<string, unknown>)[field.field_name]
              )
            }
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * **Validates: Requirements 4.3**
   * Selected fields ARE applied to the form with their values.
   */
  it('selected fields are applied to the form', () => {
    fc.assert(
      fc.property(
        formDataArb,
        uniqueFieldsArb,
        (form, fields) => {
          const selected: Record<number, boolean> = {}
          const editedValues: Record<number, string> = {}
          for (let i = 0; i < fields.length; i++) {
            selected[i] = i % 2 === 0
            editedValues[i] = fields[i].value
          }

          const accepted = getAcceptedFields(fields, selected, editedValues)
          const result = applyClassificationToForm(form, accepted)

          for (const field of accepted) {
            if (field.field_name === 'is_consumable') {
              expect(result.is_consumable).toBe(field.value.toLowerCase() === 'true')
            } else {
              expect((result as unknown as Record<string, unknown>)[field.field_name]).toBe(field.value)
            }
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * **Validates: Requirements 4.3**
   * The number of applied fields equals the number of selected fields.
   */
  it('number of accepted fields equals number of selected fields', () => {
    fc.assert(
      fc.property(
        uniqueFieldsArb,
        fc.array(fc.boolean(), { minLength: 1, maxLength: FIELD_NAMES.length }),
        (fields, booleans) => {
          const selected: Record<number, boolean> = {}
          const editedValues: Record<number, string> = {}
          for (let i = 0; i < fields.length; i++) {
            selected[i] = booleans[i % booleans.length]
            editedValues[i] = fields[i].value
          }

          const accepted = getAcceptedFields(fields, selected, editedValues)
          const expectedCount = fields.filter((_, i) => selected[i]).length
          expect(accepted).toHaveLength(expectedCount)
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * **Validates: Requirements 4.3**
   * Deselecting all fields is equivalent to discard — form remains unchanged.
   */
  it('deselecting all fields leaves form unchanged (equivalent to discard)', () => {
    fc.assert(
      fc.property(formDataArb, uniqueFieldsArb, (form, fields) => {
        const selected: Record<number, boolean> = {}
        const editedValues: Record<number, string> = {}
        for (let i = 0; i < fields.length; i++) {
          selected[i] = false // all deselected
          editedValues[i] = fields[i].value
        }

        const accepted = getAcceptedFields(fields, selected, editedValues)
        expect(accepted).toHaveLength(0)

        const result = applyClassificationToForm(form, accepted)
        expect(result).toEqual(form)
      }),
      { numRuns: 100 }
    )
  })
})
