import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'

/** One pending delete confirmation. */
export interface SessionDeleteRequest {
  readonly sessionId: string
  readonly displayTitle: string
  /** Subagent sessions the host cascade will also delete. */
  readonly descendantCount: number
}

/**
 * Create the confirmation-request store shared by the menu entry and the dialog.
 * @returns the store the menu writes and the dialog reads.
 */
export function createDeleteRequestStore(): SnapshotStore<SessionDeleteRequest | null> {
  return createSnapshotStore<SessionDeleteRequest | null>(null)
}
