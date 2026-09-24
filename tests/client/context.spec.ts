import { describe, expect, it } from 'vitest'
import { clientServicesOf } from '../../src/client/context.js'

const slotRegistry = { inject: () => {}, register: () => () => {} }
const localeRegistry = { register: () => () => {} }
const sessionService = {
  refresh: async () => {},
  list: { getSnapshot: () => ({ byId: {} }) },
}

function contextWith(services: Map<string, unknown>): { get(name: string): unknown, effect(): void } {
  return {
    get: name => services.get(name),
    effect: () => {},
  }
}

describe('clientServicesOf', () => {
  it('requires the slot and locale services', () => {
    expect(() => clientServicesOf(contextWith(new Map()))).toThrow(/slots/)
    const onlySlots = new Map<string, unknown>([['slots', slotRegistry]])
    expect(() => clientServicesOf(contextWith(onlySlots))).toThrow(/locale/)
  })

  it('reads the session service at call time', () => {
    const services = new Map<string, unknown>([
      ['slots', slotRegistry],
      ['locale', localeRegistry],
    ])
    const resolved = clientServicesOf(contextWith(services))
    expect(resolved.sessions()).toBeUndefined()

    services.set('sessions', sessionService)
    expect(resolved.sessions()).toBe(sessionService)
  })

  it('ignores a session service that does not match the expected surface', () => {
    const services = new Map<string, unknown>([
      ['slots', slotRegistry],
      ['locale', localeRegistry],
      ['sessions', { refresh: 'not a function' }],
    ])
    expect(clientServicesOf(contextWith(services)).sessions()).toBeUndefined()
  })
})
