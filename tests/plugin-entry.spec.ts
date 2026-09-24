import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionPersistenceSnapshot } from '@deepseek-ai/dsh-session-persistence'
import { SESSION_DELETE_ROUTE_PATH } from '../src/features/session-delete/routes.js'
import { apply, name } from '../src/index.js'
import { createFakeHostContext } from './support/fake-host-ctx.js'

const id = (raw: string): SessionId => brandString<SessionId>(raw)

const snapshot = (
  raw: string,
  extra: { readonly parent?: string, readonly origin?: 'subagent' } = {},
): SessionPersistenceSnapshot => ({
  header: {
    version: 4,
    id: id(raw),
    createdAt: 1,
    isSeeded: false,
    ...(extra.parent === undefined ? {} : { parentSession: id(extra.parent) }),
    ...(extra.origin === undefined ? {} : { origin: extra.origin }),
  },
  revision: 'rev-1' as SessionPersistenceSnapshot['revision'],
})

const roots: string[] = []
const tempRoot = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'oliver-qol-'))
  roots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('plugin entry', () => {
  it('names the plugin', () => {
    expect(name).toBe('oliver-qol')
  })

  it('provides the session-delete service and registers the authenticated route', async () => {
    const root = await tempRoot()
    await mkdir(join(root, '--C-work--', 'root'), { recursive: true })
    const ctx = createFakeHostContext({ snapshots: [snapshot('root')] })
    apply(ctx as unknown as Context, {
      sessionDelete: { sessionsRoot: root, quiescenceTimeoutMs: 50, quiescencePollMs: 1 },
    })
    expect(ctx.provided.get('sessionDelete')).toBeDefined()
    expect(ctx.routes.map(route => route.path)).toEqual([SESSION_DELETE_ROUTE_PATH])
    expect(ctx.routes[0]?.methods).toEqual(['POST'])
    expect(ctx.routes[0]?.requestBody).toBe('buffered')

    const route = ctx.routes[0]
    if (route === undefined) throw new Error('route was not registered')
    const response = await route.fetch(new Request(`http://localhost${SESSION_DELETE_ROUTE_PATH}`, {
      method: 'POST',
      body: JSON.stringify({ sessionId: 'root' }),
    }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ deleted: ['root'] })
  })

  it('mounts without a web connection', async () => {
    const root = await tempRoot()
    const ctx = createFakeHostContext({ snapshots: [], connection: false })
    apply(ctx as unknown as Context, {
      sessionDelete: { sessionsRoot: root, quiescenceTimeoutMs: 50, quiescencePollMs: 1 },
    })
    expect(ctx.provided.get('sessionDelete')).toBeDefined()
    expect(ctx.routes).toEqual([])
  })
})
