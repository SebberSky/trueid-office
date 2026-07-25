import {
  applyTemplate,
  choiceLabels,
  contextVars,
} from './dialogue'
import { fetchSheetVars } from './googleSheet'
import { fetchHttpApiVars } from './httpApi'
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

/** One fetcher per provider — new data sources register here. */
const API_PROVIDERS = {
  'google-sheet': fetchSheetVars,
  http: fetchHttpApiVars,
} as const

/**
 * Live data replies. Fetched vars fill the node's `say` template, so a script
 * controls presentation and the provider only supplies text.
 */
export const apiReplySource: ReplySource = {
  type: 'api',
  async resolve(node, context, vars) {
    const source = node.source
    if (source?.type !== 'api') {
      return scriptedReplySource.resolve(node, context, vars)
    }
    const dataVars =
      source.provider === 'google-sheet'
        ? await API_PROVIDERS['google-sheet'](source.config)
        : await API_PROVIDERS.http(source.config)
    const merged = { ...contextVars(context), ...dataVars, ...vars }
    return {
      text: applyTemplate(node.say ?? '', merged),
      choices: choiceLabels(node),
      nodeId: node.id,
      end: !!node.end || (!node.choices?.length && !node.next),
    }
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
  api: apiReplySource,
  llm: llmReplySourceStub,
}

export function replySourceFor(node: DialogueNode): ReplySource {
  const type = node.source?.type ?? 'scripted'
  // `llm` has no provider yet — fall back to the scripted line.
  if (type === 'llm') return scriptedReplySource
  return SOURCES[type] ?? scriptedReplySource
}

/** True when a node's reply can block on network I/O. */
export function isAsyncSource(node: DialogueNode): boolean {
  return node.source?.type === 'api'
}

export async function resolveNodeReply(
  node: DialogueNode,
  context: InteractContext,
  vars: Record<string, string> = {},
): Promise<ResolvedReply> {
  return replySourceFor(node).resolve(node, context, vars)
}
