import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** One workspace entity's accounting surface. */
export interface WorkspaceAccountingEntity {
  detachSession(sessionId: SessionId): Promise<void>
}

/** The workspace accounting surface the cleanup step needs. */
export interface WorkspaceAccounting {
  list(): readonly WorkspaceAccountingEntity[]
  unarchiveSession(sessionId: SessionId): Promise<void>
  unpinSession(sessionId: SessionId): Promise<void>
}

/**
 * Drop deleted sessions from workspace accounting. Failures are reported and
 * skipped: reads that surface these ids filter missing sessions, and the next
 * workspace mutation prunes them durably.
 * @param registry - the workspace registry, when present.
 * @param ids - sessions already removed from disk.
 * @param warn - diagnostics sink.
 */
export async function clearWorkspaceAccounting(
  registry: WorkspaceAccounting | undefined,
  ids: readonly SessionId[],
  warn: (message: string) => void,
): Promise<void> {
  if (registry === undefined) return
  for (const id of ids) {
    for (const workspace of registry.list()) {
      await attempt(() => workspace.detachSession(id), id, 'detach', warn)
    }
    await attempt(() => registry.unarchiveSession(id), id, 'unarchive', warn)
    await attempt(() => registry.unpinSession(id), id, 'unpin', warn)
  }
}

async function attempt(
  operation: () => Promise<void>,
  id: SessionId,
  step: string,
  warn: (message: string) => void,
): Promise<void> {
  try {
    await operation()
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error)
    warn(`session ${String(id)}: workspace ${step} failed: ${detail}`)
  }
}
