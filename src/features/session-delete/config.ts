import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import Schema from '@deepseek-ai/schemastery'

/** Defaults shared by the validated schema and the explicit resolve step. */
export const SESSION_DELETE_DEFAULTS = Object.freeze({
  sessionsRoot: dshHomePath('sessions'),
  quiescenceTimeoutMs: 15_000,
  quiescencePollMs: 200,
} as const)

/** Session-delete config as written in cordis.yml: every field optional. */
export interface SessionDeleteConfig {
  /** JSONL session root; must match the `session-persistence-jsonl` row's `root`. */
  readonly sessionsRoot?: string
  /** Upper bound for waiting on stopped sessions to leave memory. */
  readonly quiescenceTimeoutMs?: number
  /** Poll interval while waiting for quiescence. */
  readonly quiescencePollMs?: number
}

/** Session-delete config with every default resolved. */
export interface ResolvedSessionDeleteConfig {
  readonly sessionsRoot: string
  readonly quiescenceTimeoutMs: number
  readonly quiescencePollMs: number
}

/** Validated session-delete config. */
export const sessionDeleteConfigSchema: Schema<SessionDeleteConfig> = Schema.object({
  sessionsRoot: Schema.string().default(SESSION_DELETE_DEFAULTS.sessionsRoot),
  quiescenceTimeoutMs: Schema.number().step(1).min(0)
    .default(SESSION_DELETE_DEFAULTS.quiescenceTimeoutMs),
  quiescencePollMs: Schema.number().step(1).min(1)
    .default(SESSION_DELETE_DEFAULTS.quiescencePollMs),
})

/**
 * Apply the documented defaults to one config section. The explicit resolve
 * step keeps defaulting out of the delete pipeline.
 * @param config - the feature's config section, when the deployment wrote one.
 * @returns the fully populated config.
 */
export function resolveSessionDeleteConfig(
  config: SessionDeleteConfig | undefined,
): ResolvedSessionDeleteConfig {
  return {
    sessionsRoot: config?.sessionsRoot ?? SESSION_DELETE_DEFAULTS.sessionsRoot,
    quiescenceTimeoutMs: config?.quiescenceTimeoutMs ?? SESSION_DELETE_DEFAULTS.quiescenceTimeoutMs,
    quiescencePollMs: config?.quiescencePollMs ?? SESSION_DELETE_DEFAULTS.quiescencePollMs,
  }
}
