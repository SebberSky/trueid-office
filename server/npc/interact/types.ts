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
 * Phase 2 only executes `scripted`. `api` / `llm` are reserved for Phase 3+.
 */
export type ReplySourceRef =
  | { type: 'scripted' }
  | {
      type: 'api'
      /** e.g. 'google-sheet' — wired in Phase 3 */
      provider: string
      /** Provider-specific config (sheet id, range, field map, …) */
      config?: Record<string, unknown>
    }
  | {
      type: 'llm'
      persona?: string
      config?: Record<string, unknown>
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
