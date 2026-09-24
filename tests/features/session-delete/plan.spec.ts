import { describe, expect, it } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { SESSION_DELETE_CODES, SessionDeleteError } from '../../../src/features/session-delete/errors.js'
import { planSessionDeletion, type SessionDeletionCandidate } from '../../../src/features/session-delete/plan.js'

const id = (raw: string): SessionId => brandString<SessionId>(raw)

const candidate = (
  raw: string,
  extra: { readonly parent?: string, readonly origin?: 'subagent' } = {},
): SessionDeletionCandidate => ({
  id: id(raw),
  ...(extra.parent === undefined ? {} : { parentSession: id(extra.parent) }),
  ...(extra.origin === undefined ? {} : { origin: extra.origin }),
})

describe('planSessionDeletion', () => {
  it('plans a lone session by itself', () => {
    const plan = planSessionDeletion([candidate('a'), candidate('b')], id('a'))
    expect(plan.ids.map(String)).toEqual(['a'])
  })

  it('collects subagent descendants deepest first and the target last', () => {
    const plan = planSessionDeletion([
      candidate('root'),
      candidate('child', { parent: 'root', origin: 'subagent' }),
      candidate('grandchild', { parent: 'child', origin: 'subagent' }),
    ], id('root'))
    expect(plan.ids.map(String)).toEqual(['grandchild', 'child', 'root'])
  })

  it('keeps forks: a non-subagent child is not a descendant', () => {
    const plan = planSessionDeletion([
      candidate('root'),
      candidate('fork', { parent: 'root' }),
    ], id('root'))
    expect(plan.ids.map(String)).toEqual(['root'])
  })

  it('refuses an unknown target', () => {
    expect(() => planSessionDeletion([candidate('a')], id('missing')))
      .toThrow(SessionDeleteError)
    try {
      planSessionDeletion([candidate('a')], id('missing'))
      expect.unreachable()
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(SessionDeleteError)
      expect((error as SessionDeleteError).code).toBe(SESSION_DELETE_CODES.notFound)
    }
  })

  it('survives a parent cycle', () => {
    const plan = planSessionDeletion([
      candidate('a', { parent: 'b', origin: 'subagent' }),
      candidate('b', { parent: 'a', origin: 'subagent' }),
    ], id('a'))
    expect(plan.ids.map(String)).toEqual(['b', 'a'])
  })
})
