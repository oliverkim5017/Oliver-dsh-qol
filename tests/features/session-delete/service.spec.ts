import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionPersistenceSnapshot } from '@deepseek-ai/dsh-session-persistence'
import { SESSION_DELETE_CODES } from '../../../src/features/session-delete/errors.js'
import { findSessionDirs } from '../../../src/features/session-delete/jsonl-layout.js'
import { removeSessionDirs } from '../../../src/features/session-delete/removal.js'
import {
  SessionDeleteService, type SessionDeleteDeps,
} from '../../../src/features/session-delete/service.js'

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

interface Harness {
  readonly service: SessionDeleteService
  readonly deleted: string[]
  readonly warnings: string[]
  readonly archived: string[]
  readonly root: string
  /** Make the workspace registry visible to later calls (activation-order model). */
  provideRegistry(): void
}

const roots: string[] = []

async function harness(
  snapshots: readonly SessionPersistenceSnapshot[],
  options: {
    readonly failRemovalAt?: number
    readonly live?: readonly string[]
    readonly stubborn?: boolean
    readonly registryLate?: boolean
  } = {},
): Promise<Harness> {
  const root = await mkdtemp(join(tmpdir(), 'oliver-qol-'))
  roots.push(root)
  for (const entry of snapshots) {
    await mkdir(join(root, '--C-work--', String(entry.header.id)), { recursive: true })
  }
  const live = new Set<string>(options.live ?? [])
  const deleted: string[] = []
  const warnings: string[] = []
  const archived: string[] = []
  let removals = 0
  let now = 0
  let registryAvailable = options.registryLate !== true
  const workspaceRegistry = {
    archiveSession: async (sessionId: SessionId) => {
      archived.push(String(sessionId))
      // The shipped stop path releases the session once its work is stopped;
      // `stubborn` models a session that never settles.
      if (options.stubborn !== true) live.delete(String(sessionId))
    },
    list: () => [{
      detachSession: async (sessionId: SessionId) => { deleted.push(`detach:${String(sessionId)}`) },
    }],
    unarchiveSession: async (sessionId: SessionId) => { deleted.push(`unarchive:${String(sessionId)}`) },
    unpinSession: async (sessionId: SessionId) => { deleted.push(`unpin:${String(sessionId)}`) },
  }
  const deps: SessionDeleteDeps = {
    sessionPersistence: { list: async () => snapshots },
    sessions: { get: sessionId => (live.has(String(sessionId)) ? { id: sessionId } : undefined) },
    workspaceRegistry: () => (registryAvailable ? workspaceRegistry : undefined),
    storageDomain: () => ({
      get: () => ({
        table: () => ({
          delete: async (key: SessionId) => { deleted.push(`cache:${String(key)}`); return true },
        }),
      }),
    }),
    activityOf: async () => 0,
    logger: { warn: message => { warnings.push(message) } },
    sleep: async (milliseconds) => { now += milliseconds },
    now: () => now,
    findSessionDirs,
    removeSessionDirs: async dirs => {
      removals += 1
      if (removals === options.failRemovalAt) throw new Error('locked')
      await removeSessionDirs(dirs)
    },
  }
  return {
    service: new SessionDeleteService(deps, {
      sessionsRoot: root, quiescenceTimeoutMs: 100, quiescencePollMs: 1,
    }),
    deleted, warnings, archived, root,
    provideRegistry: () => { registryAvailable = true },
  }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('SessionDeleteService.delete', () => {
  it('removes descendants deepest first and cleans their derived state', async () => {
    const test = await harness([
      snapshot('root'),
      snapshot('child', { parent: 'root', origin: 'subagent' }),
      snapshot('grandchild', { parent: 'child', origin: 'subagent' }),
    ])
    const report = await test.service.delete(id('root'))
    expect(report.deleted.map(String)).toEqual(['grandchild', 'child', 'root'])
    expect(test.deleted).toEqual([
      'cache:grandchild', 'cache:child', 'cache:root',
      'detach:grandchild', 'unarchive:grandchild', 'unpin:grandchild',
      'detach:child', 'unarchive:child', 'unpin:child',
      'detach:root', 'unarchive:root', 'unpin:root',
    ])
    expect(await findSessionDirs(test.root, id('root'))).toEqual([])
    expect(await findSessionDirs(test.root, id('child'))).toEqual([])
  })

  it('refuses an unknown target without touching the disk', async () => {
    const test = await harness([snapshot('root')])
    await expect(test.service.delete(id('missing')))
      .rejects.toMatchObject({ code: SESSION_DELETE_CODES.notFound })
    expect(await findSessionDirs(test.root, id('root'))).not.toEqual([])
  })

  it('reports the ids already removed when removal fails midway', async () => {
    const test = await harness([
      snapshot('root'),
      snapshot('child', { parent: 'root', origin: 'subagent' }),
    ], { failRemovalAt: 2 })
    try {
      await test.service.delete(id('root'))
      expect.unreachable()
    } catch (error: unknown) {
      expect(error).toMatchObject({
        code: SESSION_DELETE_CODES.ioFailed,
        deleted: [id('child')],
      })
    }
    expect(test.deleted).toEqual(['cache:child', 'detach:child', 'unarchive:child', 'unpin:child'])
    expect(await findSessionDirs(test.root, id('child'))).toEqual([])
    expect(test.warnings).toHaveLength(1)
  })

  it('archives running sessions before removing anything', async () => {
    const test = await harness([
      snapshot('root'),
      snapshot('child', { parent: 'root', origin: 'subagent' }),
    ], { live: ['child'] })
    const report = await test.service.delete(id('root'))
    expect(test.archived).toEqual(['child'])
    expect(report.deleted.map(String)).toEqual(['child', 'root'])
  })

  it('leaves storage untouched when the stop times out', async () => {
    const test = await harness([snapshot('root')], { live: ['root'], stubborn: true })
    await expect(test.service.delete(id('root')))
      .rejects.toMatchObject({ code: SESSION_DELETE_CODES.busy, deleted: [] })
    expect(test.archived).toEqual(['root'])
    expect(await findSessionDirs(test.root, id('root'))).not.toEqual([])
  })

  it('reads optional services at call time', async () => {
    const test = await harness([snapshot('root')], { live: ['root'], registryLate: true })
    await expect(test.service.delete(id('root')))
      .rejects.toMatchObject({ code: SESSION_DELETE_CODES.stopUnavailable })

    test.provideRegistry()
    const report = await test.service.delete(id('root'))
    expect(test.archived).toEqual(['root'])
    expect(report.deleted.map(String)).toEqual(['root'])
    expect(test.deleted).toContain('detach:root')
  })
})
