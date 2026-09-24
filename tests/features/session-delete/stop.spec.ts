import { describe, expect, it } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { SESSION_DELETE_CODES, SessionDeleteError } from '../../../src/features/session-delete/errors.js'
import {
  stopSessionsForDeletion, type SessionStopDeps,
} from '../../../src/features/session-delete/stop.js'

const id = (raw: string): SessionId => brandString<SessionId>(raw)

interface Harness {
  readonly deps: SessionStopDeps
  readonly archived: string[]
  setActivity(sessionId: SessionId, count: number): void
}

function harness(options: { readonly registry?: boolean } = {}): Harness {
  const activity = new Map<string, number>()
  const archived: string[] = []
  let now = 0
  const deps: SessionStopDeps = {
    workspaceRegistry: options.registry === false
      ? undefined
      : { archiveSession: async (sessionId) => { archived.push(String(sessionId)) } },
    activityOf: async sessionId => activity.get(String(sessionId)) ?? 0,
    sleep: async (milliseconds) => { now += milliseconds },
    now: () => now,
  }
  return {
    deps,
    archived,
    setActivity: (sessionId, count) => { activity.set(String(sessionId), count) },
  }
}

const policy = { timeoutMs: 1_000, pollMs: 10 }

describe('stopSessionsForDeletion', () => {
  it('archives every target so later wakes stay blocked', async () => {
    const test = harness()
    await stopSessionsForDeletion(test.deps, [id('a'), id('b')], policy)
    expect(test.archived).toEqual(['a', 'b'])
  })

  it('waits for reported activity to clear', async () => {
    const test = harness()
    test.setActivity(id('a'), 2)
    const stopping = stopSessionsForDeletion(test.deps, [id('a')], policy)
    await Promise.resolve()
    test.setActivity(id('a'), 0)
    await stopping
    expect(test.archived).toEqual(['a'])
  })

  it('refuses a running session without a workspace registry', async () => {
    const test = harness({ registry: false })
    test.setActivity(id('a'), 1)
    await expect(stopSessionsForDeletion(test.deps, [id('a')], policy))
      .rejects.toMatchObject({ code: SESSION_DELETE_CODES.stopUnavailable })
  })

  it('proceeds without a registry when nothing runs', async () => {
    const test = harness({ registry: false })
    await stopSessionsForDeletion(test.deps, [id('a')], policy)
    expect(test.archived).toEqual([])
  })

  it('reports busy with the activity counts when sessions never settle', async () => {
    const test = harness()
    test.setActivity(id('a'), 3)
    await expect(stopSessionsForDeletion(test.deps, [id('a')], policy))
      .rejects.toMatchObject({ code: SESSION_DELETE_CODES.busy })
    expect(test.archived).toEqual(['a'])
  })

  it('reports every unsettled session', async () => {
    const test = harness()
    test.setActivity(id('a'), 1)
    test.setActivity(id('b'), 2)
    try {
      await stopSessionsForDeletion(test.deps, [id('a'), id('b')], policy)
      expect.unreachable()
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(SessionDeleteError)
      expect((error as SessionDeleteError).message).toContain('a')
      expect((error as SessionDeleteError).message).toContain('b')
      expect((error as SessionDeleteError).message).toContain('activity')
    }
  })
})
