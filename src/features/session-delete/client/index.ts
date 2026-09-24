import type { ClientServices } from '../../../client/context.js'
import { countSubagentDescendants } from './descendant-count.js'
import { requestSessionDelete } from './delete-client.js'
import { DeleteSessionMenuItem, type DeleteSessionMenuInjected } from './DeleteSessionMenuItem.js'
import { en, SESSION_DELETE_NS, zh } from './locales.js'
import {
  SessionDeleteConfirmDialog, type SessionDeleteDialogInjected,
} from './SessionDeleteConfirmDialog.js'
import { createDeleteRequestStore, type SessionDeleteRequest } from './store.js'

const MENU_SLOT = 'sidebar.workspaces.session.menu.item'
const OVERLAY_SLOT = 'shell.overlay'
const MENU_ORDER = 500
const DIALOG_ID = 'oliver-qol.session-delete'

/**
 * Register the session-delete browser contributions: the row menu entry and
 * the confirmation dialog over one shared request store.
 * @param services - guarded client services.
 */
export function registerSessionDeleteClient(services: ClientServices): void {
  const { slots, locale, sessions, effect } = services
  const requestStore = createDeleteRequestStore()

  const requestDelete = (target: {
    readonly sessionId: string
    readonly displayTitle: string
  }): void => {
    const snapshot = sessions()?.list.getSnapshot()
    const request: SessionDeleteRequest = {
      ...target,
      descendantCount: snapshot === undefined
        ? 0
        : countSubagentDescendants(snapshot.byId, target.sessionId),
    }
    requestStore.set(request)
  }

  const menuInjected = (): DeleteSessionMenuInjected => ({ requestDelete })
  const dialogInjected = (): SessionDeleteDialogInjected => ({
    hooks: { request: requestStore },
    settleSessionDelete: () => { requestStore.set(null) },
    deleteSession: async (sessionId) => {
      await requestSessionDelete((input, init) => fetch(input, init), sessionId)
      await sessions()?.refresh()
    },
  })

  effect(() => locale.register(SESSION_DELETE_NS, { zh, en }), 'oliver-qol: session-delete locale')
  slots.inject(MENU_SLOT, function* () {
    yield slots.register({
      name: MENU_SLOT,
      id: 'delete',
      order: MENU_ORDER,
      locale: SESSION_DELETE_NS,
      inject: menuInjected,
    }, DeleteSessionMenuItem)
  })
  slots.inject(OVERLAY_SLOT, function* () {
    yield slots.register({
      name: OVERLAY_SLOT,
      id: DIALOG_ID,
      locale: SESSION_DELETE_NS,
      inject: dialogInjected,
    }, SessionDeleteConfirmDialog)
  })
}
