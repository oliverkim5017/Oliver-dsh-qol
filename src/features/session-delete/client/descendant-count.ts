/** The Session fields the descendant count reads from the client session list. */
export interface ClientSessionSummary {
  readonly parentSessionId?: string
  readonly origin?: 'subagent'
}

/**
 * Count the subagent descendants of one session in the client's loaded list.
 * Descendants are sessions whose subagent-origin parent chain reaches the target.
 * @param summaries - the client list snapshot keyed by session id.
 * @param target - the session about to be deleted.
 * @returns the number of sessions the host cascade will also delete.
 */
export function countSubagentDescendants(
  summaries: Readonly<Record<string, ClientSessionSummary | undefined>>,
  target: string,
): number {
  const children = new Map<string, string[]>()
  for (const [id, summary] of Object.entries(summaries)) {
    if (summary === undefined || summary.origin !== 'subagent') continue
    if (summary.parentSessionId === undefined) continue
    const siblings = children.get(summary.parentSessionId)
    if (siblings === undefined) children.set(summary.parentSessionId, [id])
    else siblings.push(id)
  }
  const visited = new Set<string>([target])
  let count = 0
  const stack = [...(children.get(target) ?? [])]
  while (stack.length > 0) {
    const id = stack.pop()
    if (id === undefined || visited.has(id)) continue
    visited.add(id)
    count += 1
    stack.push(...(children.get(id) ?? []))
  }
  return count
}
