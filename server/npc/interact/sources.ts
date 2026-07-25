import {
  applyTemplate,
  choiceLabels,
  contextVars,
} from './dialogue'
import type {
  DialogueNode,
  InteractContext,
  ReplySource,
  ReplySourceRef,
  ResolvedReply,
} from './types'

/** Phase 2 default — static `say` + choices. */
export const scriptedReplySource: ReplySource = {
  type: 'scripted',
  resolve(node, context, vars) {
    const merged = { ...contextVars(context), ...vars }
    return {
      text: applyTemplate(node.say ?? '', merged),
      choices: choiceLabels(node),
      nodeId: node.id,
      end: !!node.end || (!node.choices?.length && !node.next),
    }
  },
}

/**
 * Phase 3 stub — Google Sheet / HTTP providers plug in here.
 * Never called in Phase 2; kept so scripts can declare `source: { type: 'api' }`.
 */
export const apiReplySourceStub: ReplySource = {
  type: 'api',
  resolve(node, context, vars) {
    return scriptedReplySource.resolve(node, context, vars)
  },
}

/** Later LLM streaming provider — stub only. */
export const llmReplySourceStub: ReplySource = {
  type: 'llm',
  resolve(node, context, vars) {
    return scriptedReplySource.resolve(node, context, vars)
  },
}

const SOURCES: Record<ReplySourceRef['type'], ReplySource> = {
  scripted: scriptedReplySource,
  api: apiReplySourceStub,
  llm: llmReplySourceStub,
}

export function replySourceFor(node: DialogueNode): ReplySource {
  const type = node.source?.type ?? 'scripted'
  // Phase 2: force scripted execution even if a node declares api/llm.
  if (type !== 'scripted') return scriptedReplySource
  return SOURCES[type] ?? scriptedReplySource
}

export async function resolveNodeReply(
  node: DialogueNode,
  context: InteractContext,
  vars: Record<string, string> = {},
): Promise<ResolvedReply> {
  return replySourceFor(node).resolve(node, context, vars)
}
