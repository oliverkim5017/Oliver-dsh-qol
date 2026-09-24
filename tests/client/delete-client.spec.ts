import { describe, expect, it } from 'vitest'
import {
  requestSessionDelete, SessionDeleteClientError,
} from '../../src/features/session-delete/client/delete-client.js'
import { SESSION_DELETE_ROUTE } from '../../src/features/session-delete/routes.js'

describe('requestSessionDelete', () => {
  it('posts the session id and returns the deleted ids', async () => {
    const calls: { url: string, init: RequestInit | undefined }[] = []
    const fetcher = async (url: string, init?: RequestInit): Promise<Response> => {
      calls.push({ url, init })
      return Response.json({ deleted: ['a', 'b'] })
    }
    expect(await requestSessionDelete(fetcher, 'a')).toEqual(['a', 'b'])
    expect(calls[0]?.url).toBe(SESSION_DELETE_ROUTE)
    expect(calls[0]?.init?.method).toBe('POST')
    expect(calls[0]?.init?.body).toBe(JSON.stringify({ sessionId: 'a' }))
  })

  it('throws a coded error for a refused delete', async () => {
    const fetcher = async (): Promise<Response> => Response.json(
      { code: 'session-delete/busy', message: 'still running', deleted: ['a'] },
      { status: 409 },
    )
    await expect(requestSessionDelete(fetcher, 'a')).rejects.toMatchObject({
      code: 'session-delete/busy',
      message: 'still running',
      deleted: ['a'],
    })
  })

  it('throws an internal error for an unreadable response', async () => {
    const fetcher = async (): Promise<Response> => new Response('nope', { status: 500 })
    await expect(requestSessionDelete(fetcher, 'a')).rejects.toBeInstanceOf(SessionDeleteClientError)
  })
})
