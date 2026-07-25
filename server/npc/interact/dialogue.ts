import type { DialogueNode, InteractConfig, InteractContext } from './types'

const TEMPLATE_RE = /\{([a-zA-Z0-9_]+)\}/g

/** Fill `{displayName}`-style placeholders from a flat string map. */
export function applyTemplate(text: string, vars: Record<string, string>): string {
  return text.replace(TEMPLATE_RE, (_, key: string) => vars[key] ?? '')
}

export function contextVars(context: InteractContext): Record<string, string> {
  return {
    displayName: context.actor.displayName,
    userId: context.actor.userId,
    roomId: context.location.roomId ?? '',
  }
}

/**
 * Resolve randomFrom / identity hops until we hit a content node.
 * Caps depth to avoid script cycles.
 */
export function resolveContentNode(
  config: InteractConfig,
  nodeId: string,
  random: () => number = Math.random,
  maxHops = 16,
): DialogueNode | null {
  let currentId = nodeId
  for (let i = 0; i < maxHops; i++) {
    const node = config.nodes[currentId]
    if (!node) return null
    if (node.randomFrom && node.randomFrom.length > 0) {
      const pick = node.randomFrom[Math.floor(random() * node.randomFrom.length)]
      if (!pick) return null
      currentId = pick
      continue
    }
    return node
  }
  return null
}

export function choiceLabels(node: DialogueNode): { id: string; label: string }[] {
  return (node.choices ?? []).map((c) => ({ id: c.id, label: c.label }))
}

export function nextNodeIdForChoice(node: DialogueNode, optionId: string): string | null | undefined {
  const choice = node.choices?.find((c) => c.id === optionId)
  if (!choice) return undefined
  if (!choice.next) return null
  return choice.next
}
