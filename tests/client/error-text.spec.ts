import { describe, expect, it } from 'vitest'
import { deleteErrorText } from '../../src/features/session-delete/client/error-text.js'
import { SESSION_DELETE_CODES } from '../../src/features/session-delete/errors.js'

const t = (key: string): string => `t:${key}`

describe('deleteErrorText', () => {
  it('localizes known codes', () => {
    expect(deleteErrorText(SESSION_DELETE_CODES.busy, 'host text', t)).toBe('t:error.busy')
  })

  it('keeps the host message for unknown codes', () => {
    expect(deleteErrorText('session-delete/future', 'host text', t)).toBe('host text')
  })
})
