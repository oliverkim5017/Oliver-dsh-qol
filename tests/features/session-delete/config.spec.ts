import { describe, expect, it } from 'vitest'
import {
  resolveSessionDeleteConfig, SESSION_DELETE_DEFAULTS, sessionDeleteConfigSchema,
} from '../../../src/features/session-delete/config.js'

describe('session delete config', () => {
  it('applies the documented defaults to an empty section', () => {
    expect(sessionDeleteConfigSchema({})).toEqual({ ...SESSION_DELETE_DEFAULTS })
  })

  it('keeps explicit values', () => {
    const resolved = sessionDeleteConfigSchema({
      sessionsRoot: 'C:/sessions', quiescenceTimeoutMs: 5, quiescencePollMs: 2,
    })
    expect(resolved).toEqual({
      sessionsRoot: 'C:/sessions', quiescenceTimeoutMs: 5, quiescencePollMs: 2,
    })
  })

  it('resolves an absent section to the defaults', () => {
    expect(resolveSessionDeleteConfig(undefined)).toEqual({ ...SESSION_DELETE_DEFAULTS })
  })

  it('resolves a partial section against the defaults', () => {
    expect(resolveSessionDeleteConfig({ quiescencePollMs: 7 })).toEqual({
      ...SESSION_DELETE_DEFAULTS,
      quiescencePollMs: 7,
    })
  })
})
