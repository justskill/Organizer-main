import { describe, it, expect, vi } from 'vitest'
import fc from 'fast-check'
import { render, screen, cleanup } from '@testing-library/react'
import { createElement } from 'react'
import ReviewPanel from '@/components/ReviewPanel'
import type { ClassificationField, ClassificationResult } from '@/pages/ItemForm'

/**
 * Feature: auto-classification, Property 12: Review panel renders all result fields
 * Validates: Requirements 4.1
 *
 * For any ClassificationResult with N fields (N ≥ 1), the Review Panel should
 * render exactly N field entries, each displaying the field name, value, and
 * confidence level.
 */

const FIELD_NAMES: ClassificationField['field_name'][] = [
  'name', 'description', 'item_type', 'brand', 'model_number', 'part_number', 'condition', 'is_consumable',
]

const CONFIDENCE_LEVELS: ClassificationField['confidence'][] = ['high', 'medium', 'low']

const classificationFieldArb: fc.Arbitrary<ClassificationField> = fc.record({
  field_name: fc.constantFrom(...FIELD_NAMES),
  value: fc.string({ minLength: 1, maxLength: 30 }),
  confidence: fc.constantFrom(...CONFIDENCE_LEVELS),
})

// Generate a ClassificationResult with N unique fields (N ≥ 1)
const classificationResultArb: fc.Arbitrary<ClassificationResult> = fc
  .uniqueArray(classificationFieldArb, {
    comparator: (a, b) => a.field_name === b.field_name,
    minLength: 1,
    maxLength: FIELD_NAMES.length,
  })
  .map((fields) => ({ fields }))

/**
 * Format field names the same way the component does:
 * split on "_", capitalize each word, join with space.
 */
function formatFieldName(name: string): string {
  return name
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function renderPanel(result: ClassificationResult) {
  return render(
    createElement(ReviewPanel, { result, onApply: vi.fn(), onDiscard: vi.fn() })
  )
}

describe('Feature: auto-classification, Property 12: Review panel renders all result fields', () => {
  /**
   * **Validates: Requirements 4.1**
   * Exactly N text inputs are rendered for N classification fields.
   */
  it('renders exactly N text inputs for N classification fields', () => {
    fc.assert(
      fc.property(classificationResultArb, (result) => {
        renderPanel(result)

        const inputs = screen.getAllByRole('textbox')
        expect(inputs).toHaveLength(result.fields.length)

        cleanup()
      }),
      { numRuns: 100 }
    )
  })

  /**
   * **Validates: Requirements 4.1**
   * Each field's value is present in an input element.
   */
  it('each field value is present in an input', () => {
    fc.assert(
      fc.property(classificationResultArb, (result) => {
        renderPanel(result)

        for (const field of result.fields) {
          const label = `${formatFieldName(field.field_name)} value`
          const input = screen.getByLabelText(label) as HTMLInputElement
          expect(input.value).toBe(field.value)
        }

        cleanup()
      }),
      { numRuns: 100 }
    )
  })

  /**
   * **Validates: Requirements 4.1**
   * Each field's confidence badge text is rendered.
   */
  it('each field confidence badge is rendered', () => {
    fc.assert(
      fc.property(classificationResultArb, (result) => {
        renderPanel(result)

        for (const field of result.fields) {
          const badges = screen.getAllByText(field.confidence)
          expect(badges.length).toBeGreaterThanOrEqual(1)
        }

        cleanup()
      }),
      { numRuns: 100 }
    )
  })

  /**
   * **Validates: Requirements 4.1**
   * Each field's formatted name is displayed.
   */
  it('each field formatted name is displayed', () => {
    fc.assert(
      fc.property(classificationResultArb, (result) => {
        renderPanel(result)

        for (const field of result.fields) {
          const formattedName = formatFieldName(field.field_name)
          expect(screen.getByText(formattedName)).toBeTruthy()
        }

        cleanup()
      }),
      { numRuns: 100 }
    )
  })
})
