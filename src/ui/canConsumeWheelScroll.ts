/** Resolve a wheel/pointer event target to an Element (Text nodes → parent). */
export function eventTargetElement(target: EventTarget | null): Element | null {
  if (target == null) return null
  // Guard globals so unit tests in Node can import this module safely.
  if (typeof Element !== 'undefined' && target instanceof Element) return target
  if (typeof Node !== 'undefined' && target instanceof Node) return target.parentElement
  return null
}

export type ScrollMetrics = {
  overflowY: string
  scrollHeight: number
  clientHeight: number
  scrollTop: number
}

/** Whether this box can absorb a vertical wheel delta (not at that edge).
 * `deltaY > 0` = wheel down / scroll toward bottom (DOM WheelEvent convention).
 */
export function canScrollInDirection(metrics: ScrollMetrics, deltaY: number): boolean {
  if (!(metrics.overflowY === 'auto' || metrics.overflowY === 'scroll')) return false
  if (metrics.scrollHeight <= metrics.clientHeight + 1) return false
  if (deltaY > 0 && metrics.scrollTop + metrics.clientHeight < metrics.scrollHeight - 1) return true
  if (deltaY < 0 && metrics.scrollTop > 0) return true
  return false
}

/**
 * True when an ancestor within `rootSelector` can still scroll vertically
 * in the wheel direction. Used so camera zoom does not steal scroll, while
 * zoom still works over non-scrollable chrome or at scroll edges.
 */
export function canConsumeWheelScroll(
  start: Element,
  deltaY: number,
  rootSelector: string,
): boolean {
  let el: Element | null = start
  while (el) {
    if (el instanceof HTMLElement) {
      const { overflowY } = getComputedStyle(el)
      if (
        canScrollInDirection(
          {
            overflowY,
            scrollHeight: el.scrollHeight,
            clientHeight: el.clientHeight,
            scrollTop: el.scrollTop,
          },
          deltaY,
        )
      ) {
        return true
      }
    }
    if (el.matches(rootSelector)) break
    el = el.parentElement
  }
  return false
}
