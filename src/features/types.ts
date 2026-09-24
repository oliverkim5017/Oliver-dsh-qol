import type { Context } from '@deepseek-ai/cordis'
import type { QolConfig } from '../config.js'

/** One host feature: self-contained registration over the shared root config. */
export interface HostFeature {
  /** Feature name; also the root config section this feature reads. */
  readonly name: keyof QolConfig
  /** Register every host contribution of this feature. */
  register(ctx: Context, config: QolConfig): void
}
