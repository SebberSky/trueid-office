import { describe, expect, it } from 'vitest'
import { canScrollInDirection } from './canConsumeWheelScroll'

describe('canScrollInDirection', () => {
  const scrollable = {
    overflowY: 'auto',
    scrollHeight: 200,
    clientHeight: 100,
    scrollTop: 50,
  }

  it('consumes wheel down when not at bottom', () => {
    expect(canScrollInDirection(scrollable, 20)).toBe(true)
  })

  it('consumes wheel up when not at top', () => {
    expect(canScrollInDirection(scrollable, -20)).toBe(true)
  })

  it('does not consume wheel up at top (zoom can take over)', () => {
    expect(canScrollInDirection({ ...scrollable, scrollTop: 0 }, -20)).toBe(false)
  })

  it('does not consume wheel down at bottom (zoom can take over)', () => {
    expect(
      canScrollInDirection({ ...scrollable, scrollTop: 100 }, 20),
    ).toBe(false)
  })

  it('ignores non-scroll overflow', () => {
    expect(canScrollInDirection({ ...scrollable, overflowY: 'hidden' }, 20)).toBe(false)
  })

  it('ignores content that fits without overflow', () => {
    expect(
      canScrollInDirection({ ...scrollable, scrollHeight: 100, scrollTop: 0 }, 20),
    ).toBe(false)
  })
})
