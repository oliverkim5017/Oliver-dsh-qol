import { describe, expect, it } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import {
  clearWorkspaceAccounting, type WorkspaceAccounting,
} from '../../../src/features/session-delete/accounting.js'

const id = (raw: string): SessionId => brandString<SessionId>(raw)

describe('clearWorkspaceAccounting', () => {
  it('detaches from every workspace, then unarchives and unpins', async () => {
    const calls: string[] = []
    const registry: WorkspaceAccounting = {
      list: () => [
        { detachSession: async sessionId => { calls.push(`detach-1:${String(sessionId)}`) } },
        { detachSession: async sessionId => { calls.push(`detach-2:${String(sessionId)}`) } },
      ],
      unarchiveSession: async sessionId => { calls.push(`unarchive:${String(sessionId)}`) },
      unpinSession: async sessionId => { calls.push(`unpin:${String(sessionId)}`) },
    }
    await clearWorkspaceAccounting(registry, [id('a')], () => {})
    expect(calls).toEqual(['detach-1:a', 'detach-2:a', 'unarchive:a', 'unpin:a'])
  })

  it('does nothing without a registry', async () => {
    await clearWorkspaceAccounting(undefined, [id('a')], () => {})
  })

  it('warns and continues past failures', async () => {
    const warnings: string[] = []
    const calls: string[] = []
    const registry: WorkspaceAccounting = {
      list: () => [{ detachSession: async () => { throw new Error('boom') } }],
      unarchiveSession: async () => { calls.push('unarchive') },
      unpinSession: async () => { calls.push('unpin') },
    }
    await clearWorkspaceAccounting(registry, [id('a')], message => { warnings.push(message) })
    expect(warnings).toHaveLength(1)
    expect(calls).toEqual(['unarchive', 'unpin'])
  })
})
