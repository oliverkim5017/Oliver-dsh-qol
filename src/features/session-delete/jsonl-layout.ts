import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

const SAFE_SEGMENT_CHAR = /^[A-Za-z0-9._-]$/

/**
 * Encode one string as a single path segment, mirroring the JSONL backend's
 * `encodeSegment` (`dsh-session-persistence-jsonl/src/format.ts`, dsh 0.1.7-alpha.2).
 * Safe code units stay literal; every other UTF-16 code unit becomes `~XXXX`.
 * @param raw - the string to encode; must be non-empty.
 * @returns the escaped single path segment.
 */
export function encodeSessionSegment(raw: string): string {
  if (raw.length === 0) throw new Error('cannot encode an empty path segment')
  if (raw === '.') return '~002E'
  if (raw === '..') return '~002E~002E'
  let out = ''
  for (let index = 0; index < raw.length; index += 1) {
    const code = raw.charCodeAt(index)
    const char = String.fromCharCode(code)
    out += char !== '~' && SAFE_SEGMENT_CHAR.test(char)
      ? char
      : `~${code.toString(16).toUpperCase().padStart(4, '0')}`
  }
  return out
}

/**
 * Locate the directories holding one session's stored artifacts. The JSONL
 * backend groups sessions under a project key derived from the session's cwd;
 * this scans the root's project directories for the encoded session segment
 * instead of reimplementing that key.
 * @param root - the JSONL session root.
 * @param id - the session whose directory is sought.
 * @returns every matching session directory; empty when none or the root is absent.
 */
export async function findSessionDirs(root: string, id: SessionId): Promise<readonly string[]> {
  const segment = encodeSessionSegment(id)
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch (error: unknown) {
    if (errorCodeOf(error) === 'ENOENT') return []
    throw error
  }
  const dirs: string[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const candidate = join(root, entry.name, segment)
    if (await isDirectory(candidate)) dirs.push(candidate)
  }
  return dirs
}

function errorCodeOf(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined
  const code: unknown = Reflect.get(error, 'code')
  return typeof code === 'string' ? code : undefined
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory()
  } catch (error: unknown) {
    if (errorCodeOf(error) === 'ENOENT') return false
    throw error
  }
}
