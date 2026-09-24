import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import {
  encodeSessionSegment, findSessionDirs,
} from '../../../src/features/session-delete/jsonl-layout.js'

const roots: string[] = []
const tempRoot = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'oliver-qol-'))
  roots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('encodeSessionSegment', () => {
  it('keeps safe code units literal', () => {
    expect(encodeSessionSegment('session-1_a.b')).toBe('session-1_a.b')
  })

  it('escapes non-safe code units as ~XXXX', () => {
    expect(encodeSessionSegment('a~b')).toBe('a~007Eb')
    expect(encodeSessionSegment('a b')).toBe('a~0020b')
    expect(encodeSessionSegment('中文')).toBe('~4E2D~6587')
  })

  it('special-cases dot segments', () => {
    expect(encodeSessionSegment('.')).toBe('~002E')
    expect(encodeSessionSegment('..')).toBe('~002E~002E')
  })

  it('refuses an empty segment', () => {
    expect(() => encodeSessionSegment('')).toThrow()
  })
})

describe('findSessionDirs', () => {
  it('finds the encoded session directory under every project directory', async () => {
    const root = await tempRoot()
    const id = brandString<SessionId>('session-1')
    await mkdir(join(root, '--C-work--', 'session-1'), { recursive: true })
    await mkdir(join(root, '_no-cwd', 'session-1'), { recursive: true })
    await mkdir(join(root, '--C-other--', 'session-2'), { recursive: true })
    const found = await findSessionDirs(root, id)
    expect([...found].sort()).toEqual([
      join(root, '--C-work--', 'session-1'),
      join(root, '_no-cwd', 'session-1'),
    ].sort())
  })

  it('returns nothing for a missing root or a file that matches', async () => {
    const root = await tempRoot()
    const id = brandString<SessionId>('session-1')
    await writeFile(join(root, 'session-1'), 'not a directory')
    expect(await findSessionDirs(join(root, 'missing'), id)).toEqual([])
    expect(await findSessionDirs(root, id)).toEqual([])
  })
})
