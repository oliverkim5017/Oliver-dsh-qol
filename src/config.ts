import Schema from '@deepseek-ai/schemastery'
import {
  sessionDeleteConfigSchema, type SessionDeleteConfig,
} from './features/session-delete/config.js'

/** Root config of the oliver-qol plugin: one optional section per feature. */
export interface QolConfig {
  /** Session deletion feature; absent means documented defaults. */
  readonly sessionDelete?: SessionDeleteConfig
}

/** Validated root config. */
export const QolConfigSchema: Schema<QolConfig> = Schema.object({
  sessionDelete: sessionDeleteConfigSchema,
})
