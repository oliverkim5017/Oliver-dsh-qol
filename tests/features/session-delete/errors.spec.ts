import { describe, expect, it } from 'vitest'
import {
  SESSION_DELETE_CODES, SESSION_DELETE_HTTP_STATUS,
} from '../../../src/features/session-delete/errors.js'

describe('session delete error codes', () => {
  it('maps every code to an HTTP status', () => {
    for (const code of Object.values(SESSION_DELETE_CODES)) {
      expect(SESSION_DELETE_HTTP_STATUS[code]).toBeTypeOf('number')
    }
  })
})
