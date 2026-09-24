import { mkdtemp, mkdir, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import {
  deleteProjectionCacheRecord, removeSessionDirs,
} from '../../../src/features/session-delete/removal.js'

const roots: string[] = []
const tempRoot = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'oliver-qol-'))
  roots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('removeSessionDirs', () => {
  it('removes session directories recursively and tolerates missing ones', async () => {
    const root = await tempRoot()
    const sessionDir = join(root, '--C-work--', 'session-1')
    await mkdir(sessionDir, { recursive: true })
    await removeSessionDirs([sessionDir, join(root, 'missing')])
    expect(await readdir(root)).toEqual(['--C-work--'])
    expect(await readdir(join(root, '--C-work--'))).toEqual([])
  })
})

describe('deleteProjectionCacheRecord', () => {
  const id = brandString<SessionId>('session-1')

  it('does nothing without a domain', async () => {
    const warnings: string[] = []
    await deleteProjectionCacheRecord(undefined, id, message => { warnings.push(message) })
    expect(warnings).toEqual([])
  })

  it('deletes the record through the opened domain table', async () => {
    const deleted: string[] = []
    const domain = {
      get: () => ({
        table: () => ({
          delete: async (key: SessionId) => { deleted.push(String(key)); return true },
        }),
      }),
    }
    await deleteProjectionCacheRecord(domain, id, () => {})
    expect(deleted).toEqual(['session-1'])
  })

  it('warns and continues when the delete fails', async () => {
    const warnings: string[] = []
    const domain = {
      get: () => ({ table: () => ({ delete: async () => { throw new Error('boom') } }) }),
    }
    await deleteProjectionCacheRecord(domain, id, message => { warnings.push(message) })
    expect(warnings).toHaveLength(1)
  })
})
