import { describe, expect, it } from 'vitest'
import { countSubagentDescendants } from '../../src/features/session-delete/client/descendant-count.js'

describe('countSubagentDescendants', () => {
  it('counts a subagent chain and ignores forks', () => {
    const summaries = {
      root: {},
      fork: { parentId: 'root' },
      child: { parentId: 'root', origin: 'subagent' as const },
      grandchild: { parentId: 'child', origin: 'subagent' as const },
      unrelated: { parentId: 'other', origin: 'subagent' as const },
    }
    expect(countSubagentDescendants(summaries, 'root')).toBe(2)
  })

  it('counts nothing for a leaf session', () => {
    expect(countSubagentDescendants({ root: {} }, 'root')).toBe(0)
  })

  it('survives a parent cycle', () => {
    const summaries = {
      a: { parentId: 'b', origin: 'subagent' as const },
      b: { parentId: 'a', origin: 'subagent' as const },
    }
    expect(countSubagentDescendants(summaries, 'a')).toBe(1)
  })
})
