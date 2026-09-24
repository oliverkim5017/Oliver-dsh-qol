import type { ComponentType } from 'react'
import type { ClientSessionSummary } from '../features/session-delete/client/descendant-count.js'

/** One slot registration accepted by the client slot registry. */
export interface ClientSlotRegistration {
  readonly name: string
  readonly id?: string
  readonly order?: number
  readonly locale?: string
  readonly inject?: () => object
}

/** The client slot registry surface this plugin uses. */
export interface ClientSlotRegistry {
  inject(name: string, callback: () => Iterable<() => void>): void
  register<Props>(registration: ClientSlotRegistration, component: ComponentType<Props>): () => void
}

/** The client locale registry surface this plugin uses. */
export interface ClientLocale {
  register(
    namespace: string,
    dictionaries: { readonly zh: Record<string, string>, readonly en: Record<string, string> },
  ): () => void
}

/** The client session list facts this plugin reads. */
export interface ClientSessions {
  refresh(): Promise<void>
  readonly list: { getSnapshot(): { readonly byId: Record<string, ClientSessionSummary | undefined> } }
}

/** Everything a client feature needs from the browser host. */
export interface ClientServices {
  readonly slots: ClientSlotRegistry
  readonly locale: ClientLocale
  readonly sessions: ClientSessions | undefined
  /** Bind one registration to the plugin's client lifetime. */
  effect(callback: () => () => void, label: string): void
}

/**
 * Resolve the client services from the Cordis client context.
 * @param ctx - the client context (only `get` and `effect` are read).
 * @returns the guarded services.
 * @throws {Error} when a required slot, locale, or lifetime service is missing.
 */
export function clientServicesOf(ctx: { get(name: string): unknown }): ClientServices {
  const slots = ctx.get('slots')
  if (!isSlotRegistry(slots)) throw new Error('oliver-qol: the client slots service is unavailable')
  const locale = ctx.get('locale')
  if (!isLocale(locale)) throw new Error('oliver-qol: the client locale service is unavailable')
  const effect: unknown = Reflect.get(ctx, 'effect')
  if (typeof effect !== 'function') throw new Error('oliver-qol: the client context has no effect()')
  const sessions = ctx.get('sessions')
  return {
    slots,
    locale,
    sessions: isSessions(sessions) ? sessions : undefined,
    effect: (callback, label) => { Reflect.apply(effect, ctx, [callback, label]) },
  }
}

function isSlotRegistry(value: unknown): value is ClientSlotRegistry {
  return typeof value === 'object' && value !== null
    && typeof Reflect.get(value, 'inject') === 'function'
    && typeof Reflect.get(value, 'register') === 'function'
}

function isLocale(value: unknown): value is ClientLocale {
  return typeof value === 'object' && value !== null
    && typeof Reflect.get(value, 'register') === 'function'
}

function isSessions(value: unknown): value is ClientSessions {
  if (typeof value !== 'object' || value === null) return false
  if (typeof Reflect.get(value, 'refresh') !== 'function') return false
  const list: unknown = Reflect.get(value, 'list')
  return typeof list === 'object' && list !== null
    && typeof Reflect.get(list, 'getSnapshot') === 'function'
}
