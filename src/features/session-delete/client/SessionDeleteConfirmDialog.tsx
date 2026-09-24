import { useState } from 'react'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import { SessionDeleteClientError } from './delete-client.js'
import { deleteErrorText, type Translate } from './error-text.js'
import type { SessionDeleteRequest } from './store.js'

/** Design token the destructive confirm action uses. */
const DANGER_TEXT_STYLE = { color: 'var(--dsw-alias-state-error-primary)' } as const

/** Injected share of the confirmation dialog. */
export interface SessionDeleteDialogInjected {
  readonly hooks: {
    readonly request: SnapshotStore<SessionDeleteRequest | null>
  }
  readonly settleSessionDelete: () => void
  readonly deleteSession: (sessionId: string) => Promise<void>
}

/** Props of the confirmation dialog. */
export interface SessionDeleteConfirmDialogProps extends SessionDeleteDialogInjected {
  readonly useRequest: <T>(selector: (request: SessionDeleteRequest | null) => T) => T
  readonly t: Translate
}

/**
 * `shell.overlay` entry: the confirmation for one pending delete request.
 * @param props - request hook, settlement, the delete hop, and the locale seat.
 * @returns the open dialog, or null.
 */
export function SessionDeleteConfirmDialog({
  useRequest, settleSessionDelete, deleteSession, t,
}: SessionDeleteConfirmDialogProps) {
  const request = useRequest(pending => pending)
  if (request === null) return null
  return (
    <DeleteConfirmForm
      key={request.sessionId}
      request={request}
      settleSessionDelete={settleSessionDelete}
      deleteSession={deleteSession}
      t={t}
    />
  )
}

/** One request's dialog: in-flight and error state die with it. */
function DeleteConfirmForm({ request, settleSessionDelete, deleteSession, t }: {
  request: SessionDeleteRequest
  settleSessionDelete: () => void
  deleteSession: (sessionId: string) => Promise<void>
  t: Translate
}) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const close = (): void => {
    if (!deleting) settleSessionDelete()
  }
  const confirm = (): void => {
    setDeleting(true)
    setError(null)
    deleteSession(request.sessionId).then(() => {
      setDeleting(false)
      settleSessionDelete()
    }).catch((reason: unknown) => {
      setDeleting(false)
      setError(reason instanceof SessionDeleteClientError
        ? deleteErrorText(reason.code, reason.message, t)
        : reason instanceof Error ? reason.message : String(reason))
    })
  }
  return (
    <Modal
      open
      onClose={close}
      closeLabel={t('close')}
      title={t('confirm.title')}
      description={t('confirm.body', { title: request.displayTitle })}
      footer={(
        <>
          <Button variant="outline" disabled={deleting} onClick={close}>{t('cancel')}</Button>
          <Button variant="outline" style={DANGER_TEXT_STYLE} disabled={deleting} onClick={confirm}>
            {t('confirm.action')}
          </Button>
        </>
      )}
    >
      {request.descendantCount > 0 && <p>{t('confirm.descendants', { n: request.descendantCount })}</p>}
      {deleting && <div role="status">{t('confirm.pending')}</div>}
      {error !== null && <div role="alert">{error}</div>}
    </Modal>
  )
}
