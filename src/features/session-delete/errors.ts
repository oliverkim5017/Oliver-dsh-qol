import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Stable failure codes the delete route returns and the client maps to copy. */
export const SESSION_DELETE_CODES = {
  badRequest: 'session-delete/bad-request',
  notFound: 'session-delete/not-found',
  busy: 'session-delete/busy',
  stopUnavailable: 'session-delete/stop-unavailable',
  ioFailed: 'session-delete/io-failed',
  internal: 'session-delete/internal',
} as const

/** One failure code. */
export type SessionDeleteCode = (typeof SESSION_DELETE_CODES)[keyof typeof SESSION_DELETE_CODES]

/** HTTP status each failure code answers with. */
export const SESSION_DELETE_HTTP_STATUS: Record<SessionDeleteCode, number> = {
  [SESSION_DELETE_CODES.badRequest]: 400,
  [SESSION_DELETE_CODES.notFound]: 404,
  [SESSION_DELETE_CODES.busy]: 409,
  [SESSION_DELETE_CODES.stopUnavailable]: 409,
  [SESSION_DELETE_CODES.ioFailed]: 500,
  [SESSION_DELETE_CODES.internal]: 500,
}

/** One refused delete, carrying the ids already removed before the refusal. */
export class SessionDeleteError extends Error {
  override readonly name = 'SessionDeleteError'

  /**
   * @param code - stable failure code.
   * @param message - user-readable text without host paths.
   * @param deleted - ids removed before the refusal.
   * @param cause - the underlying failure, logged rather than returned.
   */
  constructor(
    readonly code: SessionDeleteCode,
    message: string,
    readonly deleted: readonly SessionId[] = [],
    cause?: unknown,
  ) {
    super(message, cause === undefined ? undefined : { cause })
  }
}
