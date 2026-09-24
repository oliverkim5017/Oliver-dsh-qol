import { describe, expect, it } from 'vitest'
import { countSubagentDescendants } from '../../src/features/session-delete/client/descendant-count.js'

describe('countSubagentDescendants', () => {
  it('counts a subagent chain and ignores forks', () => {
    const summaries = {
      root: {},
      fork: { parentSessionId: 'root' },
      child: { parentSessionId: 'root', origin: 'subagent' as const },
      grandchild: { parentSessionId: 'child', origin: 'subagent' as const },
      unrelated: { parentSessionId: 'other', origin: 'subagent' as const },
    }
    expect(countSubagentDescendants(summaries, 'root')).toBe(2)
  })

  it('counts nothing for a leaf session', () => {
    expect(countSubagentDescendants({ root: {} }, 'root')).toBe(0)
  })

  it('survives a parent cycle', () => {
    const summaries = {
      a: { parentSessionId: 'b', origin: 'subagent' as const },
      b: { parentSessionId: 'a', origin: 'subagent' as const },
    }
    expect(countSubagentDescendants(summaries, 'a')).toBe(1)
  })
})
