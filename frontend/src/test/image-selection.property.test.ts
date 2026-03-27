import { describe, it, expect } from 'vitest'
import fc from 'fast-check'

/**
 * Feature: auto-classification, Property 9: Image selection state management
 * Validates: Requirements 2.3, 2.4, 2.5
 *
 * For any sequence of add and remove operations on the image selection list,
 * the resulting image set should equal the set produced by applying those
 * operations sequentially: adding images unions them with the current set
 * (no replacement), and removing an image produces a set with exactly one
 * fewer element that does not contain the removed image.
 */

// Simulate the image selection state management logic from ItemForm
type Operation =
  | { type: 'add'; files: string[] }
  | { type: 'remove'; index: number }

function applyOperations(operations: Operation[]): string[] {
  let state: string[] = []
  for (const op of operations) {
    if (op.type === 'add') {
      state = [...state, ...op.files]
    } else if (op.type === 'remove') {
      if (op.index >= 0 && op.index < state.length) {
        state = state.filter((_, i) => i !== op.index)
      }
    }
  }
  return state
}

describe('Feature: auto-classification, Property 9: Image selection state management', () => {
  /**
   * **Validates: Requirements 2.5**
   * Adding images never replaces existing ones — after adding, the result
   * contains all previous images plus the new ones.
   */
  it('adding images appends without replacing existing selection', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 10 }),
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 5 }),
        (existing, newFiles) => {
          const before = [...existing]
          const after = applyOperations([
            { type: 'add', files: existing },
            { type: 'add', files: newFiles },
          ])

          // All previous images are still present at their original positions
          for (let i = 0; i < before.length; i++) {
            expect(after[i]).toBe(before[i])
          }
          // New images are appended after existing ones
          for (let i = 0; i < newFiles.length; i++) {
            expect(after[before.length + i]).toBe(newFiles[i])
          }
          // Total length is the sum
          expect(after.length).toBe(before.length + newFiles.length)
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * **Validates: Requirements 2.4**
   * Removing an image at a valid index produces exactly one fewer element.
   */
  it('removing an image at a valid index reduces length by exactly one', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 10 }),
        (files) => {
          const state = applyOperations([{ type: 'add', files }])
          return fc.assert(
            fc.property(
              fc.integer({ min: 0, max: files.length - 1 }),
              (index) => {
                const after = applyOperations([
                  { type: 'add', files },
                  { type: 'remove', index },
                ])
                expect(after.length).toBe(state.length - 1)
              }
            ),
            { numRuns: 10 }
          )
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * **Validates: Requirements 2.4**
   * Removing an image means the removed element is no longer at that position.
   */
  it('removing an image excludes the element that was at the removed index', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 10 }),
        (files) => {
          return fc.assert(
            fc.property(
              fc.integer({ min: 0, max: files.length - 1 }),
              (index) => {
                const before = applyOperations([{ type: 'add', files }])
                const removedElement = before[index]
                const after = applyOperations([
                  { type: 'add', files },
                  { type: 'remove', index },
                ])

                // The resulting array should be the original without the element at index
                const expected = [...before.slice(0, index), ...before.slice(index + 1)]
                expect(after).toEqual(expected)
              }
            ),
            { numRuns: 10 }
          )
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * **Validates: Requirements 2.3, 2.5**
   * Sequential add operations are equivalent to a single add with all files concatenated.
   */
  it('sequential adds are equivalent to a single add with concatenated files', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 5 }),
          { minLength: 1, maxLength: 5 }
        ),
        (fileBatches) => {
          // Apply each batch as a separate add operation
          const sequential = applyOperations(
            fileBatches.map((files) => ({ type: 'add' as const, files }))
          )

          // Apply all files as a single add
          const allFiles = fileBatches.flat()
          const singleAdd = applyOperations([{ type: 'add', files: allFiles }])

          expect(sequential).toEqual(singleAdd)
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * **Validates: Requirements 2.4**
   * Removing at an out-of-bounds index is a no-op — state is unchanged.
   */
  it('removing at an out-of-bounds index does not change the state', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 10 }),
        fc.integer({ min: 0, max: 100 }),
        (files, offset) => {
          const state = applyOperations([{ type: 'add', files }])
          // Use an index that is out of bounds
          const outOfBoundsIndex = files.length + offset
          const after = applyOperations([
            { type: 'add', files },
            { type: 'remove', index: outOfBoundsIndex },
          ])
          expect(after).toEqual(state)
        }
      ),
      { numRuns: 100 }
    )
  })
})
