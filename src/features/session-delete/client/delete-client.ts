import { SESSION_DELETE_CODES } from '../errors.js'
import { SESSION_DELETE_ROUTE } from '../routes.js'

/** One refused delete reported by the host route. */
export class SessionDeleteClientError extends Error {
  override readonly name = 'SessionDeleteClientError'

  /**
   * @param code - stable host failure code.
   * @param message - host-provided text.
   * @param deleted - ids the host removed before the refusal.
   */
  constructor(
    readonly code: string,
    message: string,
    readonly deleted: readonly string[] = [],
  ) {
    super(message)
  }
}

/** HTTP carrier used by the delete request. */
export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>

/**
 * Ask the host to delete one session.
 * @param fetcher - HTTP carrier.
 * @param sessionId - the session to delete.
 * @returns the ids the host removed.
 * @throws {SessionDeleteClientError} with the host code and any partial report.
 */
export async function requestSessionDelete(
  fetcher: Fetcher,
  sessionId: string,
): Promise<readonly string[]> {
  const response = await fetcher(SESSION_DELETE_ROUTE, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  })
  const payload: unknown = await response.json().catch(() => undefined)
  if (!response.ok) {
    throw new SessionDeleteClientError(
      codeOf(payload) ?? SESSION_DELETE_CODES.internal,
      messageOf(payload) ?? `delete failed with HTTP ${response.status}`,
      deletedOf(payload) ?? [],
    )
  }
  const deleted = deletedOf(payload)
  if (deleted === undefined) {
    throw new SessionDeleteClientError(SESSION_DELETE_CODES.internal, 'unexpected delete response')
  }
  return deleted
}

function fieldOf(payload: unknown, key: string): unknown {
  if (typeof payload !== 'object' || payload === null) return undefined
  return Reflect.get(payload, key)
}

function codeOf(payload: unknown): string | undefined {
  const code = fieldOf(payload, 'code')
  return typeof code === 'string' ? code : undefined
}

function messageOf(payload: unknown): string | undefined {
  const message = fieldOf(payload, 'message')
  return typeof message === 'string' ? message : undefined
}

function deletedOf(payload: unknown): readonly string[] | undefined {
  const deleted = fieldOf(payload, 'deleted')
  if (!Array.isArray(deleted) || !deleted.every(entry => typeof entry === 'string')) return undefined
  return deleted.map(entry => String(entry))
}
