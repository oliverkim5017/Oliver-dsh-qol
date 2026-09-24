import { rm } from 'node:fs/promises'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Domain name the projection cache stores its records under. */
export const PROJECTION_CACHE_DOMAIN = 'session_projcache'
/** Table holding one checkpoint record per session. */
export const PROJECTION_CACHE_TABLE = 'sessions'

/**
 * Remove every directory one session owns.
 * @param dirs - session directories resolved from the persistence layout.
 * @throws the underlying filesystem failure; the caller maps it to a coded refusal.
 */
export async function removeSessionDirs(dirs: readonly string[]): Promise<void> {
  for (const dir of dirs) {
    await rm(dir, { recursive: true, force: true })
  }
}

/**
 * Best-effort removal of one session's cached projection row. The cache is
 * derived data, so an unavailable domain or a failed delete is reported and skipped.
 * @param storageDomain - the `ctx.storageDomain` service, when present.
 * @param id - the deleted session.
 * @param warn - diagnostics sink.
 */
export async function deleteProjectionCacheRecord(
  storageDomain: unknown,
  id: SessionId,
  warn: (message: string) => void,
): Promise<void> {
  const table = projectionCacheTableOf(storageDomain)
  if (table === undefined) return
  try {
    await table.delete(id)
  } catch (error: unknown) {
    warn(`session ${String(id)}: projection cache record removal failed: ${describeError(error)}`)
  }
}

/** Minimal view of the projection-cache domain's `sessions` table. */
interface ProjectionCacheTable {
  delete(key: SessionId): Promise<boolean>
}

function projectionCacheTableOf(storageDomain: unknown): ProjectionCacheTable | undefined {
  if (typeof storageDomain !== 'object' || storageDomain === null) return undefined
  const get: unknown = Reflect.get(storageDomain, 'get')
  if (typeof get !== 'function') return undefined
  const domain: unknown = Reflect.apply(get, storageDomain, [PROJECTION_CACHE_DOMAIN])
  if (typeof domain !== 'object' || domain === null) return undefined
  const table: unknown = Reflect.get(domain, 'table')
  if (typeof table !== 'function') return undefined
  // The domain layer's table handle is the documented contract; shape checked above.
  return Reflect.apply(table, domain, [PROJECTION_CACHE_TABLE]) as ProjectionCacheTable
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
