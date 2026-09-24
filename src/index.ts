import type { Context } from '@deepseek-ai/cordis'
import { QolConfigSchema, type QolConfig } from './config.js'
import { HOST_FEATURES } from './features/index.js'

/** Cordis plugin name. */
export const name = 'oliver-qol'
/** Validated plugin config. */
export const Config = QolConfigSchema

/**
 * Mount every host feature.
 * @param ctx - host context.
 * @param config - validated root config.
 */
export function apply(ctx: Context, config: QolConfig = {}): void {
  for (const feature of HOST_FEATURES) feature.register(ctx, config)
}
