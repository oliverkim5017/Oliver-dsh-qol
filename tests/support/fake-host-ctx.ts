import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionPersistenceSnapshot } from '@deepseek-ai/dsh-session-persistence'

/** One route registration captured from the fake connection. */
export interface FakeRoute {
  readonly path: string
  readonly methods: readonly string[]
  readonly requestBody: string
  readonly fetch: (request: Request) => Promise<Response>
}

/** Connection availability the fake host models. */
export type FakeConnectionState = 'ready' | 'pending' | 'absent'

/** Facts the fake host context serves. */
export interface FakeHostOptions {
  readonly snapshots: readonly SessionPersistenceSnapshot[]
  readonly live?: ReadonlySet<SessionId>
  readonly activity?: (sessionId: SessionId) => number
  readonly workspaceRegistry?: unknown
  readonly storageDomain?: unknown
  /** Defaults to `ready`; `pending` models a connection fiber still activating. */
  readonly connection?: FakeConnectionState
}

/** The minimal host context the plugin entry touches, plus its test accessors. */
export interface FakeHostContext {
  readonly warnings: string[]
  readonly provided: Map<string, unknown>
  readonly routes: FakeRoute[]
  readonly logger: { warn(message: string): void }
  readonly sessionPersistence: { list(): Promise<readonly SessionPersistenceSnapshot[]> }
  readonly sessions: { get(sessionId: SessionId): unknown }
  inject(names: readonly string[], callback: (ctx: FakeHostContext) => void): void
  get(name: string): unknown
  provide(name: string, value: unknown): void
  effect(callback: () => () => void, label?: string): void
  waterfall(
    name: string,
    request: { sessionId: SessionId },
    inner: () => Promise<readonly unknown[]>,
  ): Promise<readonly unknown[]>
  /** Activate a pending connection and run the callbacks that waited for it. */
  activateConnection(): void
}

/**
 * Build one fake host context for entry-level tests.
 * @param options - stored sessions, optional services, and connection state.
 * @returns the fake context with captured routes, provisions, and warnings.
 */
export function createFakeHostContext(options: FakeHostOptions): FakeHostContext {
  const warnings: string[] = []
  const provided = new Map<string, unknown>()
  const routes: FakeRoute[] = []
  const live = options.live ?? new Set<SessionId>()
  const state: FakeConnectionState = options.connection ?? 'ready'
  const waiting: ((ctx: FakeHostContext) => void)[] = []
  let connectionActive = state === 'ready'
  const connection = {
    fetch: {
      register(route: FakeRoute): () => Promise<void> {
        routes.push(route)
        return async () => {}
      },
    },
  }
  const ctx: FakeHostContext = {
    warnings,
    provided,
    routes,
    logger: { warn: message => { warnings.push(message) } },
    sessionPersistence: { list: async () => options.snapshots },
    sessions: { get: sessionId => (live.has(sessionId) ? { id: sessionId } : undefined) },
    inject: (names, callback) => {
      if (names.includes('connection') && !connectionActive) {
        waiting.push(callback)
        return
      }
      callback(ctx)
    },
    get: name => {
      if (name === 'connection') return connectionActive ? connection : undefined
      if (name === 'workspaceRegistry') return options.workspaceRegistry
      if (name === 'storageDomain') return options.storageDomain
      return undefined
    },
    provide: (name, value) => { provided.set(name, value) },
    effect: (callback) => { callback() },
    waterfall: async (_name, request) => {
      const count = options.activity?.(request.sessionId) ?? 0
      return Array.from({ length: count }, () => ({}))
    },
    activateConnection: () => {
      connectionActive = true
      for (const callback of waiting.splice(0)) callback(ctx)
    },
  }
  return ctx
}
