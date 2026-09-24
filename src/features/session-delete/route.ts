import { brandString } from '@deepseek-ai/dsh-brand'
import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import {
  SESSION_DELETE_CODES, SESSION_DELETE_HTTP_STATUS, SessionDeleteError, type SessionDeleteCode,
} from './errors.js'
import { SESSION_DELETE_ROUTE_PATH } from './routes.js'
import type { SessionDeleteService } from './service.js'

/** The connection capability the route registers on; absent outside Web compositions. */
export interface SessionDeleteConnection {
  readonly fetch: {
    register(route: {
      readonly path: string
      readonly methods: readonly ['POST']
      readonly requestBody: 'buffered'
      readonly fetch: (request: Request) => Promise<Response>
    }): () => Promise<void>
  }
}

/**
 * Register the authenticated delete route when the composition has a connection.
 * @param ctx - feature context.
 * @param service - the delete capability to expose.
 */
export function registerSessionDeleteRoute(ctx: Context, service: SessionDeleteService): void {
  const connection = connectionOf(ctx)
  if (connection === undefined) return
  ctx.effect(() => {
    const dispose = connection.fetch.register({
      path: SESSION_DELETE_ROUTE_PATH,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: request => handleSessionDeleteRequest(service, request),
    })
    return () => { void dispose() }
  }, 'oliver-qol: session-delete route')
}

/**
 * Answer one delete request with the report or a coded failure.
 * @param service - the delete capability.
 * @param request - the buffered POST request.
 * @returns the JSON response.
 */
export async function handleSessionDeleteRequest(
  service: SessionDeleteService,
  request: Request,
): Promise<Response> {
  const sessionId = await sessionIdOf(request)
  if (sessionId === undefined) {
    return failureResponse(SESSION_DELETE_CODES.badRequest, 'sessionId must be a non-empty string', [])
  }
  try {
    const report = await service.delete(sessionId)
    return Response.json({ deleted: report.deleted })
  } catch (error: unknown) {
    if (error instanceof SessionDeleteError) {
      return failureResponse(error.code, error.message, error.deleted)
    }
    return failureResponse(SESSION_DELETE_CODES.internal, 'session delete failed', [])
  }
}

function failureResponse(
  code: SessionDeleteCode,
  message: string,
  deleted: readonly SessionId[],
): Response {
  return Response.json({ code, message, deleted }, { status: SESSION_DELETE_HTTP_STATUS[code] })
}

async function sessionIdOf(request: Request): Promise<SessionId | undefined> {
  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return undefined
  }
  if (typeof payload !== 'object' || payload === null) return undefined
  const raw: unknown = Reflect.get(payload, 'sessionId')
  return typeof raw === 'string' && raw.length > 0 ? brandString<SessionId>(raw) : undefined
}

function connectionOf(ctx: Context): SessionDeleteConnection | undefined {
  const value: unknown = ctx.get('connection')
  if (typeof value !== 'object' || value === null) return undefined
  const fetch: unknown = Reflect.get(value, 'fetch')
  if (typeof fetch !== 'object' || fetch === null) return undefined
  if (typeof Reflect.get(fetch, 'register') !== 'function') return undefined
  // Shape guarded above; the call signature is the documented connection contract.
  return value as SessionDeleteConnection
}
