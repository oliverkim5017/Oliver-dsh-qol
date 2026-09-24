import { describe, expect, it } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { SESSION_DELETE_CODES, SessionDeleteError } from '../../../src/features/session-delete/errors.js'
import { handleSessionDeleteRequest } from '../../../src/features/session-delete/route.js'
import { SESSION_DELETE_ROUTE_PATH } from '../../../src/features/session-delete/routes.js'
import type { SessionDeleteService } from '../../../src/features/session-delete/service.js'

const serviceOf = (
  deleteImpl: (sessionId: SessionId) => Promise<{ readonly deleted: readonly SessionId[] }>,
): SessionDeleteService => ({ delete: deleteImpl }) as unknown as SessionDeleteService

const post = (body: string): Request => new Request(`http://localhost${SESSION_DELETE_ROUTE_PATH}`, {
  method: 'POST',
  body,
})

describe('handleSessionDeleteRequest', () => {
  it('answers the deleted ids', async () => {
    const service = serviceOf(async () => ({ deleted: [brandString<SessionId>('a')] }))
    const response = await handleSessionDeleteRequest(service, post('{"sessionId":"a"}'))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ deleted: ['a'] })
  })

  it('rejects a malformed body', async () => {
    const service = serviceOf(async () => ({ deleted: [] }))
    const response = await handleSessionDeleteRequest(service, post('not json'))
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ code: SESSION_DELETE_CODES.badRequest })
  })

  it('rejects an empty sessionId', async () => {
    const service = serviceOf(async () => ({ deleted: [] }))
    const response = await handleSessionDeleteRequest(service, post('{"sessionId":""}'))
    expect(response.status).toBe(400)
  })

  it('maps a coded refusal with the ids already deleted', async () => {
    const service = serviceOf(async () => {
      throw new SessionDeleteError(
        SESSION_DELETE_CODES.busy,
        'sessions still running: a',
        [brandString<SessionId>('b')],
      )
    })
    const response = await handleSessionDeleteRequest(service, post('{"sessionId":"a"}'))
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      code: SESSION_DELETE_CODES.busy,
      message: 'sessions still running: a',
      deleted: ['b'],
    })
  })

  it('hides unexpected failures behind a generic code', async () => {
    const service = serviceOf(async () => { throw new Error('boom') })
    const response = await handleSessionDeleteRequest(service, post('{"sessionId":"a"}'))
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      code: SESSION_DELETE_CODES.internal,
      message: 'session delete failed',
      deleted: [],
    })
  })
})
