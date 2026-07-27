import type { GoogleSheetSourceConfig } from './googleSheet'
import type { HttpApiSourceConfig } from './httpApi'

/** Server-built actor context for dialogue templates / future providers. */
export type InteractContext = {
  actor: {
    userId: string
    displayName: string
  }
  location: {
    roomId: string | null
    x: number
    y: number
  }
}

/**
 * Reply source for a dialogue node.
 * `scripted` and `api` execute; `llm` is still a stub.
 */
export type ReplySourceRef =
  | { type: 'scripted' }
  | {
      type: 'api'
      provider: 'google-sheet'
      config: GoogleSheetSourceConfig
    }
  | {
      type: 'api'
      /** Any JSON endpoint, any HTTP method. */
      provider: 'http'
      config: HttpApiSourceConfig
    }
  | {
      type: 'llm'
      persona?: string
      config?: Record<string, unknown>
    }

/** Where a node goes when its reply source fails. */
export type DialogueErrorFallback = {
  /** In-character line shown in place of the data. */
  text?: string
  /** Static node to jump to instead of showing `text`. */
  next?: string
}

export type DialogueChoice = {
  id: string
  label: string
  /** Next node id, or omit / empty to end the session after this choice. */
  next?: string
}

export type DialogueNode = {
  id: string
  /**
   * Static line. Supports `{displayName}` and other InteractContext keys
   * (and Phase 3 API-mapped fields).
   */
  say?: string
  /** Resolve by picking one of these node ids at random (then evaluate that node). */
  randomFrom?: string[]
  choices?: DialogueChoice[]
  /** Auto-advance when the player has no choices (linear). */
  next?: string
  /** Defaults to scripted when omitted. */
  source?: ReplySourceRef
  /** Spinner caption while this node resolves (async sources only). */
  loadingLabel?: string
  /** Recovery path when the reply source throws — session stays alive. */
  onError?: DialogueErrorFallback
  /** Terminal node — no further choices; client may close after reading. */
  end?: boolean
}

export type InteractConfig = {
  startNode: string
  nodes: Record<string, DialogueNode>
}

export type ResolvedReply = {
  text: string
  choices: { id: string; label: string }[]
  nodeId: string
  end: boolean
}

export interface ReplySource {
  readonly type: ReplySourceRef['type']
  resolve(
    node: DialogueNode,
    context: InteractContext,
    vars: Record<string, string>,
  ): Promise<ResolvedReply> | ResolvedReply
}
