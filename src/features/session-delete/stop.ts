import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { SESSION_DELETE_CODES, SessionDeleteError } from './errors.js'

/** The workspace capability the stop step needs; absent outside Web compositions. */
export interface SessionStopWorkspace {
  archiveSession(sessionId: SessionId, options?: { readonly stopActivity?: boolean }): Promise<void>
}

/** Host facts the stop step reads. */
export interface SessionStopDeps {
  /** Archive-capable workspace registry; absent when the composition has none. */
  readonly workspaceRegistry: SessionStopWorkspace | undefined
  /** Whether the session object is live in this process. */
  readonly isLive: (sessionId: SessionId) => boolean
  /** How many activity entries the composed providers report for the session. */
  readonly activityOf: (sessionId: SessionId) => Promise<number>
  /** Wait one poll interval. */
  readonly sleep: (milliseconds: number) => Promise<void>
  /** Clock in milliseconds. */
  readonly now: () => number
}

/** Timing policy for the quiescence wait. */
export interface QuiescencePolicy {
  readonly timeoutMs: number
  readonly pollMs: number
}

/**
 * Stop every target's running work and wait until none is running.
 * Archiving with `stopActivity` is the shipped stop path: it durably blocks
 * wakes through the archive gate before the stop providers run.
 * @param deps - host facts.
 * @param ids - every session the delete will remove.
 * @param policy - quiescence timing.
 * @throws {SessionDeleteError} `stop-unavailable` when a running session cannot
 * be stopped, `busy` when sessions do not settle within the timeout.
 */
export async function stopSessionsForDeletion(
  deps: SessionStopDeps,
  ids: readonly SessionId[],
  policy: QuiescencePolicy,
): Promise<void> {
  for (const id of ids) {
    if (!(await isRunning(deps, id))) continue
    if (deps.workspaceRegistry === undefined) {
      throw new SessionDeleteError(
        SESSION_DELETE_CODES.stopUnavailable,
        `session ${String(id)} is running and no workspace registry can stop it`,
      )
    }
    await deps.workspaceRegistry.archiveSession(id, { stopActivity: true })
  }
  const deadline = deps.now() + policy.timeoutMs
  for (;;) {
    const running: SessionId[] = []
    for (const id of ids) {
      if (await isRunning(deps, id)) running.push(id)
    }
    if (running.length === 0) return
    if (deps.now() >= deadline) {
      throw new SessionDeleteError(
        SESSION_DELETE_CODES.busy,
        `sessions still running: ${running.map(String).join(', ')}`,
      )
    }
    await deps.sleep(policy.pollMs)
  }
}

async function isRunning(deps: SessionStopDeps, id: SessionId): Promise<boolean> {
  return deps.isLive(id) || (await deps.activityOf(id)) > 0
}
