import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionPersistenceSnapshot } from '@deepseek-ai/dsh-session-persistence'
import {
  clearWorkspaceAccounting, type WorkspaceAccounting,
} from './accounting.js'
import type { ResolvedSessionDeleteConfig } from './config.js'
import { SESSION_DELETE_CODES, SessionDeleteError } from './errors.js'
import { planSessionDeletion, type SessionDeletionCandidate } from './plan.js'
import { deleteProjectionCacheRecord } from './removal.js'
import {
  stopSessionsForDeletion, type SessionStopWorkspace,
} from './stop.js'

/** One completed delete. */
export interface SessionDeletionReport {
  /** Every id removed from storage, deepest first. */
  readonly deleted: readonly SessionId[]
}

/** Everything the delete pipeline reads from the host. */
export interface SessionDeleteDeps {
  /** Session persistence, read once per request. */
  readonly sessionPersistence: { list(): Promise<readonly SessionPersistenceSnapshot[]> }
  /** Live session store; a defined value means the session is in memory. */
  readonly sessions: { get(sessionId: SessionId): unknown }
  /** Workspace registry, when the composition has one. */
  readonly workspaceRegistry: (SessionStopWorkspace & WorkspaceAccounting) | undefined
  /** Storage hub's domain facility, when present (projection-cache cleanup). */
  readonly storageDomain: unknown
  /** Activity count reported by the composed providers for one session. */
  readonly activityOf: (sessionId: SessionId) => Promise<number>
  /** Diagnostics sink. */
  readonly logger: { warn(message: string): void }
  /** Wait one poll interval. */
  readonly sleep: (milliseconds: number) => Promise<void>
  /** Clock in milliseconds. */
  readonly now: () => number
  /** Resolve one session's storage directories. */
  readonly findSessionDirs: (root: string, sessionId: SessionId) => Promise<readonly string[]>
  /** Remove resolved storage directories. */
  readonly removeSessionDirs: (dirs: readonly string[]) => Promise<void>
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** The session-delete capability, present while the feature is active. */
    sessionDelete: SessionDeleteService
  }
}

/**
 * Permanent session deletion: resolve the target set, stop what runs, remove
 * the stored logs, then clean derived and accounting state. Derived-state
 * cleanup failures are logged and skipped; the stored logs are the source of truth.
 */
export class SessionDeleteService {
  /**
   * @param deps - host facts.
   * @param config - resolved feature config.
   */
  constructor(
    private readonly deps: SessionDeleteDeps,
    private readonly config: ResolvedSessionDeleteConfig,
  ) {}

  /**
   * Delete one session and its subagent descendants.
   * @param sessionId - the requested session.
   * @returns the ids removed from storage.
   * @throws {SessionDeleteError} with the ids removed before a failure.
   */
  async delete(sessionId: SessionId): Promise<SessionDeletionReport> {
    const snapshots = await this.deps.sessionPersistence.list()
    const candidates: readonly SessionDeletionCandidate[] = snapshots.map(snapshot => ({
      id: snapshot.header.id,
      ...(snapshot.header.parentSession === undefined
        ? {}
        : { parentSession: snapshot.header.parentSession }),
      ...(snapshot.header.origin === undefined ? {} : { origin: snapshot.header.origin }),
    }))
    const plan = planSessionDeletion(candidates, sessionId)
    await stopSessionsForDeletion(
      {
        workspaceRegistry: this.deps.workspaceRegistry,
        isLive: id => this.deps.sessions.get(id) !== undefined,
        activityOf: this.deps.activityOf,
        sleep: this.deps.sleep,
        now: this.deps.now,
      },
      plan.ids,
      { timeoutMs: this.config.quiescenceTimeoutMs, pollMs: this.config.quiescencePollMs },
    )

    const deleted: SessionId[] = []
    let failure: SessionDeleteError | undefined
    for (const id of plan.ids) {
      try {
        const dirs = await this.deps.findSessionDirs(this.config.sessionsRoot, id)
        await this.deps.removeSessionDirs(dirs)
      } catch (error: unknown) {
        failure = new SessionDeleteError(
          SESSION_DELETE_CODES.ioFailed,
          'failed to remove the stored session files',
          deleted,
          error,
        )
        this.deps.logger.warn(
          `session ${String(id)}: storage removal failed: ${describeError(error)}`,
        )
        break
      }
      deleted.push(id)
    }

    for (const id of deleted) {
      await deleteProjectionCacheRecord(this.deps.storageDomain, id, this.deps.logger.warn)
    }
    await clearWorkspaceAccounting(this.deps.workspaceRegistry, deleted, this.deps.logger.warn)

    if (failure !== undefined) throw failure
    return { deleted }
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
