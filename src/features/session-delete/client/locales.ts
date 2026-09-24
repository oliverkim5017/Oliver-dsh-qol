/** Locale namespace this feature registers its copy under. */
export const SESSION_DELETE_NS = 'oliver-qol.session-delete'

/** Simplified Chinese copy. */
export const zh: Record<string, string> = {
  'menu.deleteSession': '删除会话',
  'confirm.title': '删除会话',
  'confirm.body': '确定要删除「{title}」吗？会话日志将被永久删除，无法恢复。',
  'confirm.descendants': '其内部 {n} 个 subagent 子会话也会一并删除。',
  'confirm.action': '删除',
  'confirm.pending': '正在删除…',
  'cancel': '取消',
  'close': '关闭',
  'error.badRequest': '请求无效，请重试。',
  'error.notFound': '会话不存在，可能已被删除。',
  'error.busy': '会话仍在运行或文件被占用，请稍后重试。',
  'error.stopUnavailable': '无法停止正在运行的会话，请先在界面中停止它。',
  'error.ioFailed': '删除会话文件失败，请重试。',
  'error.internal': '删除失败，请查看宿主日志。',
}

/** English copy. */
export const en: Record<string, string> = {
  'menu.deleteSession': 'Delete session',
  'confirm.title': 'Delete session',
  'confirm.body': 'Delete "{title}"? The session log is permanently removed and cannot be recovered.',
  'confirm.descendants': 'Its {n} subagent sessions are deleted with it.',
  'confirm.action': 'Delete',
  'confirm.pending': 'Deleting…',
  'cancel': 'Cancel',
  'close': 'Close',
  'error.badRequest': 'The request was invalid. Try again.',
  'error.notFound': 'The session no longer exists.',
  'error.busy': 'The session is still running or its files are in use. Try again later.',
  'error.stopUnavailable': 'The running session could not be stopped. Stop it in the UI first.',
  'error.ioFailed': 'Removing the session files failed. Try again.',
  'error.internal': 'Deletion failed; check the host logs.',
}
