import type { Context } from '@deepseek-ai/cordis'
import { registerSessionDeleteClient } from '../features/session-delete/client/index.js'
import { clientServicesOf } from './context.js'

/** Services the browser half needs; the loader waits for them before applying. */
export const inject = ['slots', 'locale']

const CLIENT_FEATURES = [registerSessionDeleteClient] as const

/**
 * Mount every browser feature.
 * @param ctx - client context.
 */
export function apply(ctx: Context): void {
  const services = clientServicesOf(ctx)
  for (const register of CLIENT_FEATURES) register(services)
}
