import { IconTrashOutlineRegular, MenuItemButton } from '@deepseek-ai/dsh-client-ui-primitives'
import type { Translate } from './error-text.js'

/** Owner share and injected behavior of the row menu entry. */
export interface DeleteSessionMenuItemProps {
  readonly sessionId: string
  readonly displayTitle: string
  readonly useMenuOpenState: () => readonly [boolean, (open: boolean) => void]
  readonly requestDelete: (target: {
    readonly sessionId: string
    readonly displayTitle: string
  }) => void
  readonly t: Translate
}

/** Behavior the menu entry injects. */
export interface DeleteSessionMenuInjected {
  readonly requestDelete: DeleteSessionMenuItemProps['requestDelete']
}

/**
 * Row menu entry: open the delete confirmation for this session.
 * @param props - owner share, menu state hook, injected behavior, locale seat.
 * @returns the menu row.
 */
export function DeleteSessionMenuItem({
  sessionId, displayTitle, useMenuOpenState, requestDelete, t,
}: DeleteSessionMenuItemProps) {
  const [, setMenuOpen] = useMenuOpenState()
  return (
    <MenuItemButton
      danger
      separatorBefore
      icon={<IconTrashOutlineRegular size={14} />}
      onSelect={() => {
        setMenuOpen(false)
        requestDelete({ sessionId, displayTitle })
      }}
    >
      {t('menu.deleteSession')}
    </MenuItemButton>
  )
}
