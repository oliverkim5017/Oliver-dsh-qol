import { SESSION_DELETE_CODES } from '../errors.js'

/** Translation function the slot machinery hands each localized component. */
export type Translate = (key: string, parameters?: Record<string, unknown>) => string

/**
 * Localized copy for one delete failure code; unknown codes keep the host message.
 * @param code - host failure code.
 * @param message - host-provided text.
 * @param t - the component's translator.
 * @returns the text to display.
 */
export function deleteErrorText(code: string, message: string, t: Translate): string {
  switch (code) {
    case SESSION_DELETE_CODES.badRequest: return t('error.badRequest')
    case SESSION_DELETE_CODES.notFound: return t('error.notFound')
    case SESSION_DELETE_CODES.busy: return t('error.busy')
    case SESSION_DELETE_CODES.stopUnavailable: return t('error.stopUnavailable')
    case SESSION_DELETE_CODES.ioFailed: return t('error.ioFailed')
    case SESSION_DELETE_CODES.internal: return t('error.internal')
    default: return message
  }
}
