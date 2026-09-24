import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { SESSION_DELETE_CODES, SessionDeleteError } from './errors.js'

/** The header facts target resolution reads from one stored session. */
export interface SessionDeletionCandidate {
  readonly id: SessionId
  readonly parentSession?: SessionId
  readonly origin?: 'subagent'
}

/** Every id one delete request removes, deepest first, the requested target last. */
export interface SessionDeletionPlan {
  readonly target: SessionId
  readonly ids: readonly SessionId[]
}

/**
 * Resolve one delete request against a persistence snapshot.
 * Descendants are subagent-origin sessions whose parent chain reaches the
 * target; forks are not descendants (they carry no subagent origin).
 * @param candidates - one entry per stored session.
 * @param target - the requested session.
 * @returns the deletion plan, children before parents.
 * @throws {SessionDeleteError} `not-found` when the target has no stored session.
 */
export function planSessionDeletion(
  candidates: readonly SessionDeletionCandidate[],
  target: SessionId,
): SessionDeletionPlan {
  const known = new Set(candidates.map(candidate => candidate.id))
  if (!known.has(target)) {
    throw new SessionDeleteError(
      SESSION_DELETE_CODES.notFound,
      `unknown session: ${String(target)}`,
    )
  }
  const children = new Map<SessionId, SessionId[]>()
  for (const candidate of candidates) {
    if (candidate.origin !== 'subagent' || candidate.parentSession === undefined) continue
    const siblings = children.get(candidate.parentSession)
    if (siblings === undefined) children.set(candidate.parentSession, [candidate.id])
    else siblings.push(candidate.id)
  }
  const ids: SessionId[] = []
  const seen = new Set<SessionId>()
  const visit = (id: SessionId): void => {
    if (seen.has(id)) return
    seen.add(id)
    for (const child of children.get(id) ?? []) visit(child)
    ids.push(id)
  }
  visit(target)
  return { target, ids }
}
