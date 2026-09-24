# dsh-oliver-qol 实施计划（功能 #1：session-delete）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在单包插件 `dsh-oliver-qol` 中实现第一个功能 session-delete：Web UI 会话菜单新增 Delete session，确认后由 host 永久删除该会话（含级联 subagent 子会话）的日志、投影缓存与 workspace 记账。

**Architecture:** 单包插件，host 半（function plugin + `ctx.inject` 内注册能力与认证路由）与 client 半（`window.__ModuleLoader__.load` 打包的浏览器模块，注册 sidebar 菜单项与 `shell.overlay` 确认框）。删除流水线复用官方 `archiveSession(id, {stopActivity})` 作为"停止"原语；磁盘布局耦合集中在 `jsonl-layout.ts` 与 `removal.ts`。

**Tech Stack:** TypeScript（strict，NodeNext，ESM）、pnpm、vitest、esbuild（client bundle）、oxlint。

**Spec:** `docs/superpowers/specs/2026-09-24-session-delete-plugin-design.md`

## Global Constraints

- 目标 dsh 版本 `0.1.7-alpha.2`；所有 `@deepseek-ai/*` 精确锁版；`@deepseek-ai/cordis` 锁 `4.0.4`、`@deepseek-ai/schemastery` 锁 `3.18.4`。
- Node `^22.19.0 || >=24.0.0`；ESM；相对导入一律写 `.js` 扩展名（TS NodeNext 约定）。
- 无魔法数字：所有可调值走 Config（`sessionDelete.sessionsRoot` / `quiescenceTimeoutMs` / `quiescencePollMs`）或具名常量。
- 路由响应 message 不含宿主路径；错误码集中定义。
- 不修改 `F:\DeepSeekHarness`；**不在用户的 DSH_HOME 上启动任何 dsh 进程**；不重启用户正在运行的 dsh（M5 验收等用户放行）。
- 功能之间不互相 import；`src/shared/` 本轮不创建。
- 每个任务结束运行 `pnpm test` 与 `pnpm typecheck` 并提交。

---

## 文件结构

```
D:\2Code\Oliver-dsh-qol\
├─ package.json
├─ tsconfig.json / tsconfig.build.json / vitest.config.ts
├─ .gitignore / .editorconfig
├─ cordis.patch.yml
├─ README.md
├─ scripts/build-client.mjs
├─ src/
│  ├─ index.ts                                  # host 入口
│  ├─ config.ts                                 # 根 Config
│  ├─ features/
│  │  ├─ types.ts                               # HostFeature 契约
│  │  ├─ index.ts                               # HOST_FEATURES
│  │  └─ session-delete/
│  │     ├─ config.ts / errors.ts / routes.ts
│  │     ├─ plan.ts / jsonl-layout.ts / stop.ts / removal.ts / accounting.ts
│  │     ├─ service.ts / route.ts / index.ts    # index = sessionDeleteFeature
│  │     └─ client/
│  │        ├─ index.ts / store.ts / delete-client.ts / descendant-count.ts / error-text.ts / locales.ts
│  │        ├─ DeleteSessionMenuItem.tsx / SessionDeleteConfirmDialog.tsx
│  └─ client/
│     ├─ context.ts                             # ClientServices 守卫
│     └─ index.ts                               # client 入口
└─ tests/
   ├─ support/fake-host-ctx.ts
   ├─ features/session-delete/*.spec.ts
   ├─ plugin-entry.spec.ts
   ├─ client/*.spec.ts
   ├─ client-bundle.spec.ts
   └─ package-manifest.spec.ts
```

---

### Task 1: 包骨架 + 纯核心模块（config / errors / plan / jsonl-layout）

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.build.json`, `vitest.config.ts`, `.gitignore`, `.editorconfig`, `cordis.patch.yml`, `README.md`
- Create: `src/features/session-delete/config.ts`, `src/features/session-delete/errors.ts`, `src/features/session-delete/plan.ts`, `src/features/session-delete/jsonl-layout.ts`
- Test: `tests/features/session-delete/config.spec.ts`, `errors.spec.ts`, `plan.spec.ts`, `jsonl-layout.spec.ts`

**Interfaces:**
- Consumes: 无。
- Produces: `SessionDeleteConfig`、`SESSION_DELETE_DEFAULTS`、`sessionDeleteConfigSchema`；`SESSION_DELETE_CODES`、`SESSION_DELETE_HTTP_STATUS`、`SessionDeleteError`；`SessionDeletionCandidate`、`SessionDeletionPlan`、`planSessionDeletion(candidates, target)`；`encodeSessionSegment(raw)`、`findSessionDirs(root, id)`。

- [ ] **Step 1: 写 package.json**

```json
{
  "name": "dsh-oliver-qol",
  "version": "0.1.0",
  "private": true,
  "description": "Personal quality-of-life features for the DeepSeek Harness",
  "type": "module",
  "license": "MIT",
  "main": "./lib/index.js",
  "types": "./lib/index.d.ts",
  "exports": {
    ".": { "types": "./lib/index.d.ts", "default": "./lib/index.js" },
    "./client": { "default": "./lib/client.js" },
    "./package.json": "./package.json"
  },
  "files": ["lib", "cordis.patch.yml", "README.md"],
  "engines": {
    "node": "^22.19.0 || >=24.0.0",
    "dsh": "0.1.7-alpha.2"
  },
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": {
      "platform": "web",
      "inject": [
        "@deepseek-ai/dsh-client-locale",
        "@deepseek-ai/dsh-client-ui-workspace",
        "@deepseek-ai/dsh-api-session-controller"
      ]
    }
  },
  "scripts": {
    "build:host": "tsc -p tsconfig.build.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "oxlint src tests scripts"
  },
  "peerDependencies": {
    "@deepseek-ai/dsh-brand": "0.1.7-alpha.2",
    "@deepseek-ai/dsh-client-store": "0.1.7-alpha.2",
    "@deepseek-ai/dsh-client-ui-primitives": "0.1.7-alpha.2",
    "@deepseek-ai/dsh-home-paths": "0.1.7-alpha.2",
    "@deepseek-ai/schemastery": "3.18.4",
    "react": "^18.2.0"
  },
  "peerDependenciesMeta": {
    "@deepseek-ai/dsh-client-store": { "optional": true },
    "@deepseek-ai/dsh-client-ui-primitives": { "optional": true },
    "react": { "optional": true }
  },
  "devDependencies": {
    "@deepseek-ai/cordis": "4.0.4",
    "@deepseek-ai/dsh-api-session-controller": "0.1.7-alpha.2",
    "@deepseek-ai/dsh-brand": "0.1.7-alpha.2",
    "@deepseek-ai/dsh-client-locale": "0.1.7-alpha.2",
    "@deepseek-ai/dsh-client-store": "0.1.7-alpha.2",
    "@deepseek-ai/dsh-client-ui-primitives": "0.1.7-alpha.2",
    "@deepseek-ai/dsh-client-ui-slots": "0.1.7-alpha.2",
    "@deepseek-ai/dsh-client-ui-workspace": "0.1.7-alpha.2",
    "@deepseek-ai/dsh-home-paths": "0.1.7-alpha.2",
    "@deepseek-ai/dsh-session": "0.1.7-alpha.2",
    "@deepseek-ai/dsh-session-persistence": "0.1.7-alpha.2",
    "@deepseek-ai/dsh-storage-domain": "0.1.7-alpha.2",
    "@deepseek-ai/dsh-workspace": "0.1.7-alpha.2",
    "@deepseek-ai/schemastery": "3.18.4",
    "@types/node": "^22.19.0",
    "@types/react": "^18.3.0",
    "esbuild": "^0.28.2",
    "oxlint": "1.76.0",
    "react": "^18.3.1",
    "typescript": "^6.0.3",
    "vitest": "^4.1.8"
  }
}
```

- [ ] **Step 2: 写 tsconfig / vitest / 基础文件**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src", "tests"]
}
```

`tsconfig.build.json`:
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "outDir": "lib",
    "rootDir": "src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src"],
  "exclude": ["src/client"]
}
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.spec.ts'],
    environment: 'node',
  },
})
```

`.gitignore`:
```
node_modules/
lib/
coverage/
*.tsbuildinfo
```

`.editorconfig`:
```
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true
```

`cordis.patch.yml`:
```yaml
# dsh-oliver-qol bundle patch: mounts the plugin's host half. The browser half
# ships through exports["./client"] and the dsh.client declaration in package.json.
- insert:
    - id: oliver-qol
      name: dsh-oliver-qol
```

`README.md`（初稿，Task 7 补全）:
```md
# dsh-oliver-qol

Personal quality-of-life features for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

Design: `docs/superpowers/specs/2026-09-24-session-delete-plugin-design.md`
```

- [ ] **Step 3: 安装依赖**

Run: `pnpm install`
Expected: 安装成功，无 `prepare` 脚本失败（此时尚未声明）。

- [ ] **Step 4: 写失败测试（errors / config / plan / jsonl-layout）**

`tests/features/session-delete/errors.spec.ts`:
```ts
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
```

`tests/features/session-delete/config.spec.ts`:
```ts
import { describe, expect, it } from 'vitest'
import {
  SESSION_DELETE_DEFAULTS, sessionDeleteConfigSchema,
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
})
```

`tests/features/session-delete/plan.spec.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { SESSION_DELETE_CODES, SessionDeleteError } from '../../../src/features/session-delete/errors.js'
import { planSessionDeletion, type SessionDeletionCandidate } from '../../../src/features/session-delete/plan.js'

const id = (raw: string): SessionId => brandString<SessionId>(raw)

const candidate = (
  raw: string,
  extra: { readonly parent?: string, readonly origin?: 'subagent' } = {},
): SessionDeletionCandidate => ({
  id: id(raw),
  ...(extra.parent === undefined ? {} : { parentSession: id(extra.parent) }),
  ...(extra.origin === undefined ? {} : { origin: extra.origin }),
})

describe('planSessionDeletion', () => {
  it('plans a lone session by itself', () => {
    const plan = planSessionDeletion([candidate('a'), candidate('b')], id('a'))
    expect(plan.ids.map(String)).toEqual(['a'])
  })

  it('collects subagent descendants deepest first and the target last', () => {
    const plan = planSessionDeletion([
      candidate('root'),
      candidate('child', { parent: 'root', origin: 'subagent' }),
      candidate('grandchild', { parent: 'child', origin: 'subagent' }),
    ], id('root'))
    expect(plan.ids.map(String)).toEqual(['grandchild', 'child', 'root'])
  })

  it('keeps forks: a non-subagent child is not a descendant', () => {
    const plan = planSessionDeletion([
      candidate('root'),
      candidate('fork', { parent: 'root' }),
    ], id('root'))
    expect(plan.ids.map(String)).toEqual(['root'])
  })

  it('refuses an unknown target', () => {
    expect(() => planSessionDeletion([candidate('a')], id('missing')))
      .toThrow(SessionDeleteError)
    try {
      planSessionDeletion([candidate('a')], id('missing'))
      expect.unreachable()
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(SessionDeleteError)
      expect((error as SessionDeleteError).code).toBe(SESSION_DELETE_CODES.notFound)
    }
  })

  it('survives a parent cycle', () => {
    const plan = planSessionDeletion([
      candidate('a', { parent: 'b', origin: 'subagent' }),
      candidate('b', { parent: 'a', origin: 'subagent' }),
    ], id('a'))
    expect(plan.ids.map(String)).toEqual(['b', 'a'])
  })
})
```

`tests/features/session-delete/jsonl-layout.spec.ts`:
```ts
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import {
  encodeSessionSegment, findSessionDirs,
} from '../../../src/features/session-delete/jsonl-layout.js'

const roots: string[] = []
const tempRoot = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'oliver-qol-'))
  roots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('encodeSessionSegment', () => {
  it('keeps safe code units literal', () => {
    expect(encodeSessionSegment('session-1_a.b')).toBe('session-1_a.b')
  })

  it('escapes non-safe code units as ~XXXX', () => {
    expect(encodeSessionSegment('a~b')).toBe('a~007Eb')
    expect(encodeSessionSegment('a b')).toBe('a~0020b')
    expect(encodeSessionSegment('中文')).toBe('~4E2D~6587')
  })

  it('special-cases dot segments', () => {
    expect(encodeSessionSegment('.')).toBe('~002E')
    expect(encodeSessionSegment('..')).toBe('~002E~002E')
  })

  it('refuses an empty segment', () => {
    expect(() => encodeSessionSegment('')).toThrow()
  })
})

describe('findSessionDirs', () => {
  it('finds the encoded session directory under every project directory', async () => {
    const root = await tempRoot()
    const id = brandString<SessionId>('session-1')
    await mkdir(join(root, '--C-work--', 'session-1'), { recursive: true })
    await mkdir(join(root, '_no-cwd', 'session-1'), { recursive: true })
    await mkdir(join(root, '--C-other--', 'session-2'), { recursive: true })
    const found = await findSessionDirs(root, id)
    expect([...found].sort()).toEqual([
      join(root, '--C-work--', 'session-1'),
      join(root, '_no-cwd', 'session-1'),
    ].sort())
  })

  it('returns nothing for a missing root or a file that matches', async () => {
    const root = await tempRoot()
    const id = brandString<SessionId>('session-1')
    await writeFile(join(root, 'session-1'), 'not a directory')
    expect(await findSessionDirs(join(root, 'missing'), id)).toEqual([])
    expect(await findSessionDirs(root, id)).toEqual([])
  })
})
```

- [ ] **Step 5: 运行测试确认失败**

Run: `pnpm test`
Expected: FAIL（`Cannot find module .../config.js` 等）。

- [ ] **Step 6: 实现四个模块**

`src/features/session-delete/errors.ts`:
```ts
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Stable failure codes the delete route returns and the client maps to copy. */
export const SESSION_DELETE_CODES = {
  badRequest: 'session-delete/bad-request',
  notFound: 'session-delete/not-found',
  busy: 'session-delete/busy',
  stopUnavailable: 'session-delete/stop-unavailable',
  ioFailed: 'session-delete/io-failed',
  internal: 'session-delete/internal',
} as const

/** One failure code. */
export type SessionDeleteCode = (typeof SESSION_DELETE_CODES)[keyof typeof SESSION_DELETE_CODES]

/** HTTP status each failure code answers with. */
export const SESSION_DELETE_HTTP_STATUS: Record<SessionDeleteCode, number> = {
  [SESSION_DELETE_CODES.badRequest]: 400,
  [SESSION_DELETE_CODES.notFound]: 404,
  [SESSION_DELETE_CODES.busy]: 409,
  [SESSION_DELETE_CODES.stopUnavailable]: 409,
  [SESSION_DELETE_CODES.ioFailed]: 500,
  [SESSION_DELETE_CODES.internal]: 500,
}

/** One refused delete, carrying the ids already removed before the refusal. */
export class SessionDeleteError extends Error {
  override readonly name = 'SessionDeleteError'

  /**
   * @param code - stable failure code.
   * @param message - user-readable text without host paths.
   * @param deleted - ids removed before the refusal.
   * @param cause - the underlying failure, logged rather than returned.
   */
  constructor(
    readonly code: SessionDeleteCode,
    message: string,
    readonly deleted: readonly SessionId[] = [],
    cause?: unknown,
  ) {
    super(message, cause === undefined ? undefined : { cause })
  }
}
```

`src/features/session-delete/config.ts`:
```ts
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import Schema from '@deepseek-ai/schemastery'

/** Defaults shared by the validated schema and the absent-section fallback. */
export const SESSION_DELETE_DEFAULTS = Object.freeze({
  sessionsRoot: dshHomePath('sessions'),
  quiescenceTimeoutMs: 15_000,
  quiescencePollMs: 200,
} as const)

/** Session-delete feature config. */
export interface SessionDeleteConfig {
  /** JSONL session root; must match the `session-persistence-jsonl` row's `root`. */
  readonly sessionsRoot: string
  /** Upper bound for waiting on stopped sessions to leave memory. */
  readonly quiescenceTimeoutMs: number
  /** Poll interval while waiting for quiescence. */
  readonly quiescencePollMs: number
}

/** Validated session-delete config. */
export const sessionDeleteConfigSchema: Schema<SessionDeleteConfig> = Schema.object({
  sessionsRoot: Schema.string().default(SESSION_DELETE_DEFAULTS.sessionsRoot),
  quiescenceTimeoutMs: Schema.number().step(1).min(0)
    .default(SESSION_DELETE_DEFAULTS.quiescenceTimeoutMs),
  quiescencePollMs: Schema.number().step(1).min(1)
    .default(SESSION_DELETE_DEFAULTS.quiescencePollMs),
})
```

`src/features/session-delete/plan.ts`:
```ts
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { SESSION_DELETE_CODES, SessionDeleteError } from './errors.js'

/** The header facts target resolution reads from one stored session. */
export interface SessionDeletionCandidate {
  readonly id: SessionId
  readonly parentSession?: SessionId
  readonly origin?: 'subagent'
}

/** Every id one delete request removes, deepest first, the requested target last. */
export interface SessionDeletionPlan {
  readonly target: SessionId
  readonly ids: readonly SessionId[]
}

/**
 * Resolve one delete request against a persistence snapshot.
 * Descendants are subagent-origin sessions whose parent chain reaches the
 * target; forks are not descendants (they carry no subagent origin).
 * @param candidates - one entry per stored session.
 * @param target - the requested session.
 * @returns the deletion plan, children before parents.
 * @throws {SessionDeleteError} `not-found` when the target has no stored session.
 */
export function planSessionDeletion(
  candidates: readonly SessionDeletionCandidate[],
  target: SessionId,
): SessionDeletionPlan {
  const known = new Set(candidates.map(candidate => candidate.id))
  if (!known.has(target)) {
    throw new SessionDeleteError(
      SESSION_DELETE_CODES.notFound,
      `unknown session: ${String(target)}`,
    )
  }
  const children = new Map<SessionId, SessionId[]>()
  for (const candidate of candidates) {
    if (candidate.origin !== 'subagent' || candidate.parentSession === undefined) continue
    const siblings = children.get(candidate.parentSession)
    if (siblings === undefined) children.set(candidate.parentSession, [candidate.id])
    else siblings.push(candidate.id)
  }
  const ids: SessionId[] = []
  const seen = new Set<SessionId>()
  const visit = (id: SessionId): void => {
    if (seen.has(id)) return
    seen.add(id)
    for (const child of children.get(id) ?? []) visit(child)
    ids.push(id)
  }
  visit(target)
  return { target, ids }
}
```

`src/features/session-delete/jsonl-layout.ts`:
```ts
import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

const SAFE_SEGMENT_CHAR = /^[A-Za-z0-9._-]$/

/**
 * Encode one string as a single path segment, mirroring the JSONL backend's
 * `encodeSegment` (`dsh-session-persistence-jsonl/src/format.ts`, dsh 0.1.7-alpha.2).
 * Safe code units stay literal; every other UTF-16 code unit becomes `~XXXX`.
 * @param raw - the string to encode; must be non-empty.
 * @returns the escaped single path segment.
 */
export function encodeSessionSegment(raw: string): string {
  if (raw.length === 0) throw new Error('cannot encode an empty path segment')
  if (raw === '.') return '~002E'
  if (raw === '..') return '~002E~002E'
  let out = ''
  for (let index = 0; index < raw.length; index += 1) {
    const code = raw.charCodeAt(index)
    const char = String.fromCharCode(code)
    out += char !== '~' && SAFE_SEGMENT_CHAR.test(char)
      ? char
      : `~${code.toString(16).toUpperCase().padStart(4, '0')}`
  }
  return out
}

/**
 * Locate the directories holding one session's stored artifacts. The JSONL
 * backend groups sessions under a project key derived from the session's cwd;
 * this scans the root's project directories for the encoded session segment
 * instead of reimplementing that key.
 * @param root - the JSONL session root.
 * @param id - the session whose directory is sought.
 * @returns every matching session directory; empty when none or the root is absent.
 */
export async function findSessionDirs(root: string, id: SessionId): Promise<readonly string[]> {
  const segment = encodeSessionSegment(id)
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch (error: unknown) {
    if (errorCodeOf(error) === 'ENOENT') return []
    throw error
  }
  const dirs: string[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const candidate = join(root, entry.name, segment)
    if (await isDirectory(candidate)) dirs.push(candidate)
  }
  return dirs
}

function errorCodeOf(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined
  const code: unknown = Reflect.get(error, 'code')
  return typeof code === 'string' ? code : undefined
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory()
  } catch (error: unknown) {
    if (errorCodeOf(error) === 'ENOENT') return false
    throw error
  }
}
```

- [ ] **Step 7: 运行测试确认通过**

Run: `pnpm test` 与 `pnpm typecheck`
Expected: 全部 PASS；typecheck 无错误。

- [ ] **Step 8: 提交**

```bash
git add -A
git commit -m "feat(session-delete): scaffold package and add config, errors, plan, jsonl layout"
```

---

### Task 2: stop / removal / accounting

**Files:**
- Create: `src/features/session-delete/stop.ts`, `src/features/session-delete/removal.ts`, `src/features/session-delete/accounting.ts`
- Test: `tests/features/session-delete/stop.spec.ts`, `removal.spec.ts`, `accounting.spec.ts`

**Interfaces:**
- Consumes: Task 1 的 `SESSION_DELETE_CODES`、`SessionDeleteError`。
- Produces: `SessionStopWorkspace`、`SessionStopDeps`、`QuiescencePolicy`、`stopSessionsForDeletion(deps, ids, policy)`；`PROJECTION_CACHE_DOMAIN`、`PROJECTION_CACHE_TABLE`、`removeSessionDirs(dirs)`、`deleteProjectionCacheRecord(storageDomain, id, warn)`；`WorkspaceAccounting`、`WorkspaceAccountingEntity`、`clearWorkspaceAccounting(registry, ids, warn)`。

- [ ] **Step 1: 写失败测试**

`tests/features/session-delete/stop.spec.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { SESSION_DELETE_CODES, SessionDeleteError } from '../../../src/features/session-delete/errors.js'
import {
  stopSessionsForDeletion, type SessionStopDeps,
} from '../../../src/features/session-delete/stop.js'

const id = (raw: string): SessionId => brandString<SessionId>(raw)

interface Harness {
  readonly deps: SessionStopDeps
  readonly archived: string[]
  setLive(id: SessionId, live: boolean): void
  setActivity(id: SessionId, count: number): void
}

function harness(options: { readonly registry?: boolean } = {}): Harness {
  const live = new Set<string>()
  const activity = new Map<string, number>()
  const archived: string[] = []
  let now = 0
  const deps: SessionStopDeps = {
    workspaceRegistry: options.registry === false
      ? undefined
      : { archiveSession: async (sessionId) => { archived.push(String(sessionId)) } },
    isLive: sessionId => live.has(String(sessionId)),
    activityOf: async sessionId => activity.get(String(sessionId)) ?? 0,
    sleep: async (milliseconds) => { now += milliseconds },
    now: () => now,
  }
  return {
    deps,
    archived,
    setLive: (sessionId, value) => { if (value) live.add(String(sessionId)); else live.delete(String(sessionId)) },
    setActivity: (sessionId, count) => { activity.set(String(sessionId), count) },
  }
}

const policy = { timeoutMs: 1_000, pollMs: 10 }

describe('stopSessionsForDeletion', () => {
  it('skips idle sessions', async () => {
    const test = harness()
    await stopSessionsForDeletion(test.deps, [id('a')], policy)
    expect(test.archived).toEqual([])
  })

  it('archives with stopActivity and waits for quiescence', async () => {
    const test = harness()
    test.setLive(id('a'), true)
    const stopping = stopSessionsForDeletion(test.deps, [id('a')], policy)
    await Promise.resolve()
    test.setLive(id('a'), false)
    await stopping
    expect(test.archived).toEqual(['a'])
  })

  it('treats reported activity as running', async () => {
    const test = harness()
    test.setActivity(id('a'), 2)
    const stopping = stopSessionsForDeletion(test.deps, [id('a')], policy)
    await Promise.resolve()
    test.setActivity(id('a'), 0)
    await stopping
    expect(test.archived).toEqual(['a'])
  })

  it('refuses a running session without a workspace registry', async () => {
    const test = harness({ registry: false })
    test.setLive(id('a'), true)
    await expect(stopSessionsForDeletion(test.deps, [id('a')], policy))
      .rejects.toMatchObject({ code: SESSION_DELETE_CODES.stopUnavailable })
  })

  it('reports busy when sessions never settle', async () => {
    const test = harness()
    test.setLive(id('a'), true)
    await expect(stopSessionsForDeletion(test.deps, [id('a')], policy))
      .rejects.toMatchObject({ code: SESSION_DELETE_CODES.busy })
    expect(test.archived).toEqual(['a'])
  })

  it('reports every unsettled session', async () => {
    const test = harness()
    test.setLive(id('a'), true)
    test.setLive(id('b'), true)
    try {
      await stopSessionsForDeletion(test.deps, [id('a'), id('b')], policy)
      expect.unreachable()
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(SessionDeleteError)
      expect((error as SessionDeleteError).message).toContain('a')
      expect((error as SessionDeleteError).message).toContain('b')
    }
  })
})
```

`tests/features/session-delete/removal.spec.ts`:
```ts
import { mkdtemp, mkdir, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import {
  deleteProjectionCacheRecord, removeSessionDirs,
} from '../../../src/features/session-delete/removal.js'

const roots: string[] = []
const tempRoot = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'oliver-qol-'))
  roots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('removeSessionDirs', () => {
  it('removes session directories recursively and tolerates missing ones', async () => {
    const root = await tempRoot()
    const sessionDir = join(root, '--C-work--', 'session-1')
    await mkdir(sessionDir, { recursive: true })
    await removeSessionDirs([sessionDir, join(root, 'missing')])
    expect(await readdir(root)).toEqual(['--C-work--'])
    expect(await readdir(join(root, '--C-work--'))).toEqual([])
  })
})

describe('deleteProjectionCacheRecord', () => {
  const id = brandString<SessionId>('session-1')

  it('does nothing without a domain', async () => {
    const warnings: string[] = []
    await deleteProjectionCacheRecord(undefined, id, message => { warnings.push(message) })
    expect(warnings).toEqual([])
  })

  it('deletes the record through the opened domain table', async () => {
    const deleted: string[] = []
    const domain = {
      get: () => ({ table: () => ({ delete: async (key: SessionId) => { deleted.push(String(key)); return true } }) }),
    }
    await deleteProjectionCacheRecord(domain, id, () => {})
    expect(deleted).toEqual(['session-1'])
  })

  it('warns and continues when the delete fails', async () => {
    const warnings: string[] = []
    const domain = {
      get: () => ({ table: () => ({ delete: async () => { throw new Error('boom') } }) }),
    }
    await deleteProjectionCacheRecord(domain, id, message => { warnings.push(message) })
    expect(warnings).toHaveLength(1)
  })
})
```

`tests/features/session-delete/accounting.spec.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import {
  clearWorkspaceAccounting, type WorkspaceAccounting,
} from '../../../src/features/session-delete/accounting.js'

const id = (raw: string): SessionId => brandString<SessionId>(raw)

describe('clearWorkspaceAccounting', () => {
  it('detaches from every workspace, then unarchives and unpins', async () => {
    const calls: string[] = []
    const registry: WorkspaceAccounting = {
      list: () => [
        { detachSession: async sessionId => { calls.push(`detach-1:${String(sessionId)}`) } },
        { detachSession: async sessionId => { calls.push(`detach-2:${String(sessionId)}`) } },
      ],
      unarchiveSession: async sessionId => { calls.push(`unarchive:${String(sessionId)}`) },
      unpinSession: async sessionId => { calls.push(`unpin:${String(sessionId)}`) },
    }
    await clearWorkspaceAccounting(registry, [id('a')], () => {})
    expect(calls).toEqual(['detach-1:a', 'detach-2:a', 'unarchive:a', 'unpin:a'])
  })

  it('does nothing without a registry', async () => {
    await clearWorkspaceAccounting(undefined, [id('a')], () => {})
  })

  it('warns and continues past failures', async () => {
    const warnings: string[] = []
    const calls: string[] = []
    const registry: WorkspaceAccounting = {
      list: () => [{ detachSession: async () => { throw new Error('boom') } }],
      unarchiveSession: async () => { calls.push('unarchive') },
      unpinSession: async () => { calls.push('unpin') },
    }
    await clearWorkspaceAccounting(registry, [id('a')], message => { warnings.push(message) })
    expect(warnings).toHaveLength(1)
    expect(calls).toEqual(['unarchive', 'unpin'])
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现三个模块**

`src/features/session-delete/stop.ts`:
```ts
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { SESSION_DELETE_CODES, SessionDeleteError } from './errors.js'

/** The workspace capability the stop step needs; absent outside Web compositions. */
export interface SessionStopWorkspace {
  archiveSession(sessionId: SessionId, options?: { readonly stopActivity?: boolean }): Promise<void>
}

/** Host facts the stop step reads. */
export interface SessionStopDeps {
  /** Archive-capable workspace registry; absent when the composition has none. */
  readonly workspaceRegistry: SessionStopWorkspace | undefined
  /** Whether the session object is live in this process. */
  readonly isLive: (sessionId: SessionId) => boolean
  /** How many activity entries the composed providers report for the session. */
  readonly activityOf: (sessionId: SessionId) => Promise<number>
  /** Wait one poll interval. */
  readonly sleep: (milliseconds: number) => Promise<void>
  /** Monotonic-enough clock in milliseconds. */
  readonly now: () => number
}

/** Timing policy for the quiescence wait. */
export interface QuiescencePolicy {
  readonly timeoutMs: number
  readonly pollMs: number
}

/**
 * Stop every target's running work and wait until none is running.
 * Archiving with `stopActivity` is the shipped stop path: it durably blocks
 * wakes through the archive gate before the stop providers run.
 * @param deps - host facts.
 * @param ids - every session the delete will remove.
 * @param policy - quiescence timing.
 * @throws {SessionDeleteError} `stop-unavailable` when a running session cannot
 * be stopped, `busy` when sessions do not settle within the timeout.
 */
export async function stopSessionsForDeletion(
  deps: SessionStopDeps,
  ids: readonly SessionId[],
  policy: QuiescencePolicy,
): Promise<void> {
  for (const id of ids) {
    if (!(await isRunning(deps, id))) continue
    if (deps.workspaceRegistry === undefined) {
      throw new SessionDeleteError(
        SESSION_DELETE_CODES.stopUnavailable,
        `session ${String(id)} is running and no workspace registry can stop it`,
      )
    }
    await deps.workspaceRegistry.archiveSession(id, { stopActivity: true })
  }
  const deadline = deps.now() + policy.timeoutMs
  for (;;) {
    const running: SessionId[] = []
    for (const id of ids) {
      if (await isRunning(deps, id)) running.push(id)
    }
    if (running.length === 0) return
    if (deps.now() >= deadline) {
      throw new SessionDeleteError(
        SESSION_DELETE_CODES.busy,
        `sessions still running: ${running.map(String).join(', ')}`,
      )
    }
    await deps.sleep(policy.pollMs)
  }
}

async function isRunning(deps: SessionStopDeps, id: SessionId): Promise<boolean> {
  return deps.isLive(id) || (await deps.activityOf(id)) > 0
}
```

`src/features/session-delete/removal.ts`:
```ts
import { rm } from 'node:fs/promises'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Domain name the projection cache stores its records under. */
export const PROJECTION_CACHE_DOMAIN = 'session_projcache'
/** Table holding one checkpoint record per session. */
export const PROJECTION_CACHE_TABLE = 'sessions'

/**
 * Remove every directory one session owns.
 * @param dirs - session directories resolved from the persistence layout.
 * @throws the underlying filesystem failure; the caller maps it to a coded refusal.
 */
export async function removeSessionDirs(dirs: readonly string[]): Promise<void> {
  for (const dir of dirs) {
    await rm(dir, { recursive: true, force: true })
  }
}

/**
 * Best-effort removal of one session's cached projection row. The cache is
 * derived data, so an unavailable domain or a failed delete is reported and skipped.
 * @param storageDomain - the `ctx.storageDomain` service, when present.
 * @param id - the deleted session.
 * @param warn - diagnostics sink.
 */
export async function deleteProjectionCacheRecord(
  storageDomain: unknown,
  id: SessionId,
  warn: (message: string) => void,
): Promise<void> {
  const table = projectionCacheTableOf(storageDomain)
  if (table === undefined) return
  try {
    await table.delete(id)
  } catch (error: unknown) {
    warn(`session ${String(id)}: projection cache record removal failed: ${describeError(error)}`)
  }
}

/** Minimal view of the projection-cache domain's `sessions` table. */
interface ProjectionCacheTable {
  delete(key: SessionId): Promise<boolean>
}

function projectionCacheTableOf(storageDomain: unknown): ProjectionCacheTable | undefined {
  if (typeof storageDomain !== 'object' || storageDomain === null) return undefined
  const get: unknown = Reflect.get(storageDomain, 'get')
  if (typeof get !== 'function') return undefined
  const domain: unknown = Reflect.apply(get, storageDomain, [PROJECTION_CACHE_DOMAIN])
  if (typeof domain !== 'object' || domain === null) return undefined
  const table: unknown = Reflect.get(domain, 'table')
  if (typeof table !== 'function') return undefined
  // The domain layer's table handle is the documented contract; shape checked above.
  return Reflect.apply(table, domain, [PROJECTION_CACHE_TABLE]) as ProjectionCacheTable
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
```

`src/features/session-delete/accounting.ts`:
```ts
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** One workspace entity's accounting surface. */
export interface WorkspaceAccountingEntity {
  detachSession(sessionId: SessionId): Promise<void>
}

/** The workspace accounting surface the cleanup step needs. */
export interface WorkspaceAccounting {
  list(): readonly WorkspaceAccountingEntity[]
  unarchiveSession(sessionId: SessionId): Promise<void>
  unpinSession(sessionId: SessionId): Promise<void>
}

/**
 * Drop deleted sessions from workspace accounting. Failures are reported and
 * skipped: reads that surface these ids filter missing sessions, and the next
 * workspace mutation prunes them durably.
 * @param registry - the workspace registry, when present.
 * @param ids - sessions already removed from disk.
 * @param warn - diagnostics sink.
 */
export async function clearWorkspaceAccounting(
  registry: WorkspaceAccounting | undefined,
  ids: readonly SessionId[],
  warn: (message: string) => void,
): Promise<void> {
  if (registry === undefined) return
  for (const id of ids) {
    for (const workspace of registry.list()) {
      await attempt(() => workspace.detachSession(id), id, 'detach', warn)
    }
    await attempt(() => registry.unarchiveSession(id), id, 'unarchive', warn)
    await attempt(() => registry.unpinSession(id), id, 'unpin', warn)
  }
}

async function attempt(
  operation: () => Promise<void>,
  id: SessionId,
  step: string,
  warn: (message: string) => void,
): Promise<void> {
  try {
    await operation()
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error)
    warn(`session ${String(id)}: workspace ${step} failed: ${detail}`)
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test` 与 `pnpm typecheck`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "feat(session-delete): add stop, removal, and workspace accounting steps"
```

---

### Task 3: 删除流水线编排（service.ts）

**Files:**
- Create: `src/features/session-delete/service.ts`
- Test: `tests/features/session-delete/service.spec.ts`

**Interfaces:**
- Consumes: Task 1/2 的全部模块。
- Produces: `SessionDeleteService`（`delete(sessionId): Promise<SessionDeletionReport>`）、`SessionDeleteDeps`、`SessionDeletionReport`，以及 `Context.sessionDelete` 的类型声明。

- [ ] **Step 1: 写失败测试**

`tests/features/session-delete/service.spec.ts`:
```ts
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionPersistenceSnapshot } from '@deepseek-ai/dsh-session-persistence'
import { SESSION_DELETE_CODES } from '../../../src/features/session-delete/errors.js'
import { findSessionDirs } from '../../../src/features/session-delete/jsonl-layout.js'
import { removeSessionDirs } from '../../../src/features/session-delete/removal.js'
import {
  SessionDeleteService, type SessionDeleteDeps,
} from '../../../src/features/session-delete/service.js'

const id = (raw: string): SessionId => brandString<SessionId>(raw)

const snapshot = (
  raw: string,
  extra: { readonly parent?: string, readonly origin?: 'subagent' } = {},
): SessionPersistenceSnapshot => ({
  header: {
    version: 4,
    id: id(raw),
    createdAt: 1,
    isSeeded: false,
    ...(extra.parent === undefined ? {} : { parentSession: id(extra.parent) }),
    ...(extra.origin === undefined ? {} : { origin: extra.origin }),
  },
  revision: 'rev-1' as SessionPersistenceSnapshot['revision'],
})

interface Harness {
  readonly service: SessionDeleteService
  readonly deleted: string[]
  readonly warnings: string[]
  readonly archived: string[]
  readonly root: string
}

const roots: string[] = []

async function harness(
  snapshots: readonly SessionPersistenceSnapshot[],
  options: { readonly failRemovalAt?: number, readonly live?: readonly string[] } = {},
): Promise<Harness> {
  const root = await mkdtemp(join(tmpdir(), 'oliver-qol-'))
  roots.push(root)
  for (const entry of snapshots) {
    await mkdir(join(root, '--C-work--', String(entry.header.id)), { recursive: true })
  }
  const live = new Set<string>(options.live ?? [])
  const deleted: string[] = []
  const warnings: string[] = []
  const archived: string[] = []
  let removals = 0
  let now = 0
  const deps: SessionDeleteDeps = {
    sessionPersistence: { list: async () => snapshots },
    sessions: { get: sessionId => (live.has(String(sessionId)) ? { id: sessionId } : undefined) },
    workspaceRegistry: {
      archiveSession: async (sessionId) => {
        archived.push(String(sessionId))
        // The shipped stop path releases the session once its work is stopped.
        live.delete(String(sessionId))
      },
      list: () => [{ detachSession: async sessionId => { deleted.push(`detach:${String(sessionId)}`) } }],
      unarchiveSession: async sessionId => { deleted.push(`unarchive:${String(sessionId)}`) },
      unpinSession: async sessionId => { deleted.push(`unpin:${String(sessionId)}`) },
    },
    storageDomain: {
      get: () => ({ table: () => ({ delete: async (key: SessionId) => { deleted.push(`cache:${String(key)}`); return true } }) }),
    },
    activityOf: async () => 0,
    logger: { warn: message => { warnings.push(message) } },
    sleep: async (milliseconds) => { now += milliseconds },
    now: () => now,
    findSessionDirs,
    removeSessionDirs: async dirs => {
      removals += 1
      if (removals === options.failRemovalAt) throw new Error('locked')
      await removeSessionDirs(dirs)
    },
  }
  return {
    service: new SessionDeleteService(deps, {
      sessionsRoot: root, quiescenceTimeoutMs: 100, quiescencePollMs: 1,
    }),
    deleted, warnings, archived, root,
  }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('SessionDeleteService.delete', () => {
  it('removes descendants deepest first and cleans their derived state', async () => {
    const test = await harness([
      snapshot('root'),
      snapshot('child', { parent: 'root', origin: 'subagent' }),
      snapshot('grandchild', { parent: 'child', origin: 'subagent' }),
    ])
    const report = await test.service.delete(id('root'))
    expect(report.deleted.map(String)).toEqual(['grandchild', 'child', 'root'])
    expect(test.deleted).toEqual([
      'cache:grandchild', 'cache:child', 'cache:root',
      'detach:grandchild', 'unarchive:grandchild', 'unpin:grandchild',
      'detach:child', 'unarchive:child', 'unpin:child',
      'detach:root', 'unarchive:root', 'unpin:root',
    ])
    expect(await findSessionDirs(test.root, id('root'))).toEqual([])
    expect(await findSessionDirs(test.root, id('child'))).toEqual([])
  })

  it('refuses an unknown target without touching the disk', async () => {
    const test = await harness([snapshot('root')])
    await expect(test.service.delete(id('missing')))
      .rejects.toMatchObject({ code: SESSION_DELETE_CODES.notFound })
    expect(await findSessionDirs(test.root, id('root'))).not.toEqual([])
  })

  it('reports the ids already removed when removal fails midway', async () => {
    const test = await harness([
      snapshot('root'),
      snapshot('child', { parent: 'root', origin: 'subagent' }),
    ], { failRemovalAt: 2 })
    try {
      await test.service.delete(id('root'))
      expect.unreachable()
    } catch (error: unknown) {
      expect(error).toMatchObject({
        code: SESSION_DELETE_CODES.ioFailed,
        deleted: [id('child')],
      })
    }
    expect(test.deleted).toEqual(['cache:child', 'detach:child', 'unarchive:child', 'unpin:child'])
    expect(await findSessionDirs(test.root, id('child'))).toEqual([])
  })

  it('archives running sessions before removing anything', async () => {
    const test = await harness([
      snapshot('root'),
      snapshot('child', { parent: 'root', origin: 'subagent' }),
    ], { live: ['child'] })
    const report = await test.service.delete(id('root'))
    expect(test.archived).toEqual(['child'])
    expect(report.deleted.map(String)).toEqual(['child', 'root'])
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test`
Expected: FAIL（`service.js` 不存在）。

- [ ] **Step 3: 实现 service.ts**

```ts
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionPersistenceSnapshot } from '@deepseek-ai/dsh-session-persistence'
import {
  clearWorkspaceAccounting, type WorkspaceAccounting,
} from './accounting.js'
import type { SessionDeleteConfig } from './config.js'
import { SESSION_DELETE_CODES, SessionDeleteError } from './errors.js'
import { planSessionDeletion, type SessionDeletionCandidate } from './plan.js'
import { deleteProjectionCacheRecord } from './removal.js'
import {
  stopSessionsForDeletion, type SessionStopWorkspace,
} from './stop.js'

/** One completed delete. */
export interface SessionDeletionReport {
  /** Every id removed from storage, deepest first. */
  readonly deleted: readonly SessionId[]
}

/** Everything the delete pipeline reads from the host. */
export interface SessionDeleteDeps {
  /** Session persistence, read once per request. */
  readonly sessionPersistence: { list(): Promise<readonly SessionPersistenceSnapshot[]> }
  /** Live session store; a defined value means the session is in memory. */
  readonly sessions: { get(sessionId: SessionId): unknown }
  /** Workspace registry, when the composition has one. */
  readonly workspaceRegistry: (SessionStopWorkspace & WorkspaceAccounting) | undefined
  /** Storage hub's domain facility, when present (projection-cache cleanup). */
  readonly storageDomain: unknown
  /** Activity count reported by the composed providers for one session. */
  readonly activityOf: (sessionId: SessionId) => Promise<number>
  /** Diagnostics sink. */
  readonly logger: { warn(message: string): void }
  /** Wait one poll interval. */
  readonly sleep: (milliseconds: number) => Promise<void>
  /** Clock in milliseconds. */
  readonly now: () => number
  /** Resolve one session's storage directories. */
  readonly findSessionDirs: (root: string, sessionId: SessionId) => Promise<readonly string[]>
  /** Remove resolved storage directories. */
  readonly removeSessionDirs: (dirs: readonly string[]) => Promise<void>
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** The session-delete capability, present while the feature is active. */
    sessionDelete: SessionDeleteService
  }
}

/**
 * Permanent session deletion: resolve the target set, stop what runs, remove
 * the stored logs, then clean derived and accounting state. Derived-state
 * cleanup failures are logged and skipped; the stored logs are the source of truth.
 */
export class SessionDeleteService {
  /**
   * @param deps - host facts.
   * @param config - validated feature config.
   */
  constructor(
    private readonly deps: SessionDeleteDeps,
    private readonly config: SessionDeleteConfig,
  ) {}

  /**
   * Delete one session and its subagent descendants.
   * @param sessionId - the requested session.
   * @returns the ids removed from storage.
   * @throws {SessionDeleteError} with the ids removed before a failure.
   */
  async delete(sessionId: SessionId): Promise<SessionDeletionReport> {
    const snapshots = await this.deps.sessionPersistence.list()
    const candidates: readonly SessionDeletionCandidate[] = snapshots.map(snapshot => ({
      id: snapshot.header.id,
      ...(snapshot.header.parentSession === undefined ? {} : { parentSession: snapshot.header.parentSession }),
      ...(snapshot.header.origin === undefined ? {} : { origin: snapshot.header.origin }),
    }))
    const plan = planSessionDeletion(candidates, sessionId)
    await stopSessionsForDeletion(
      {
        workspaceRegistry: this.deps.workspaceRegistry,
        isLive: id => this.deps.sessions.get(id) !== undefined,
        activityOf: this.deps.activityOf,
        sleep: this.deps.sleep,
        now: this.deps.now,
      },
      plan.ids,
      { timeoutMs: this.config.quiescenceTimeoutMs, pollMs: this.config.quiescencePollMs },
    )

    const deleted: SessionId[] = []
    let failure: SessionDeleteError | undefined
    for (const id of plan.ids) {
      try {
        const dirs = await this.deps.findSessionDirs(this.config.sessionsRoot, id)
        await this.deps.removeSessionDirs(dirs)
      } catch (error: unknown) {
        failure = new SessionDeleteError(
          SESSION_DELETE_CODES.ioFailed,
          'failed to remove the stored session files',
          deleted,
          error,
        )
        this.deps.logger.warn(
          `session ${String(id)}: storage removal failed: ${describeError(error)}`,
        )
        break
      }
      deleted.push(id)
    }

    for (const id of deleted) {
      await deleteProjectionCacheRecord(this.deps.storageDomain, id, this.deps.logger.warn)
    }
    await clearWorkspaceAccounting(this.deps.workspaceRegistry, deleted, this.deps.logger.warn)

    if (failure !== undefined) throw failure
    return { deleted }
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test` 与 `pnpm typecheck`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "feat(session-delete): orchestrate the delete pipeline"
```

---

### Task 4: host 入口 + 功能注册 + 认证路由

**Files:**
- Create: `src/config.ts`, `src/features/types.ts`, `src/features/index.ts`, `src/features/session-delete/routes.ts`, `src/features/session-delete/route.ts`, `src/features/session-delete/index.ts`, `src/index.ts`
- Test: `tests/support/fake-host-ctx.ts`, `tests/features/session-delete/route.spec.ts`, `tests/plugin-entry.spec.ts`

**Interfaces:**
- Consumes: Task 1–3 全部模块。
- Produces: `QolConfig`、`QolConfigSchema`；`HostFeature`、`HOST_FEATURES`、`sessionDeleteFeature`；`SESSION_DELETE_ROUTE_PATH`、`SESSION_DELETE_ROUTE`、`registerSessionDeleteRoute(ctx, service)`、`handleSessionDeleteRequest(service, request)`；根 `apply(ctx, config)`。

- [ ] **Step 1: 写失败测试**

`tests/support/fake-host-ctx.ts`:
```ts
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionPersistenceSnapshot } from '@deepseek-ai/dsh-session-persistence'

/** One route registration captured from the fake connection. */
export interface FakeRoute {
  readonly path: string
  readonly methods: readonly string[]
  readonly requestBody: string
  readonly fetch: (request: Request) => Promise<Response>
}

/** Facts the fake host context serves. */
export interface FakeHostOptions {
  readonly snapshots: readonly SessionPersistenceSnapshot[]
  readonly live?: ReadonlySet<SessionId>
  readonly activity?: (sessionId: SessionId) => number
  readonly workspaceRegistry?: unknown
  readonly storageDomain?: unknown
  readonly connection?: boolean
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
  waterfall(name: string, request: { sessionId: SessionId }, inner: () => Promise<readonly unknown[]>): Promise<readonly unknown[]>
}

/** Build one fake host context for entry-level tests. */
export function createFakeHostContext(options: FakeHostOptions): FakeHostContext {
  const warnings: string[] = []
  const provided = new Map<string, unknown>()
  const routes: FakeRoute[] = []
  const live = options.live ?? new Set<SessionId>()
  const connection = options.connection === false ? undefined : {
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
    inject: (_names, callback) => { callback(ctx) },
    get: name => {
      if (name === 'connection') return connection
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
  }
  return ctx
}
```

`tests/features/session-delete/route.spec.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { SESSION_DELETE_CODES, SessionDeleteError } from '../../../src/features/session-delete/errors.js'
import { handleSessionDeleteRequest } from '../../../src/features/session-delete/route.js'
import { SESSION_DELETE_ROUTE_PATH } from '../../../src/features/session-delete/routes.js'
import type { SessionDeleteService } from '../../../src/features/session-delete/service.js'

const serviceOf = (
  deleteImpl: (sessionId: SessionId) => Promise<{ readonly deleted: readonly SessionId[] }>,
): SessionDeleteService => ({ delete: deleteImpl }) as unknown as SessionDeleteService

const post = (body: string): Request => new Request(`http://localhost${SESSION_DELETE_ROUTE_PATH}`, {
  method: 'POST',
  body,
})

describe('handleSessionDeleteRequest', () => {
  it('answers the deleted ids', async () => {
    const service = serviceOf(async () => ({ deleted: [brandString<SessionId>('a')] }))
    const response = await handleSessionDeleteRequest(service, post('{"sessionId":"a"}'))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ deleted: ['a'] })
  })

  it('rejects a malformed body', async () => {
    const service = serviceOf(async () => ({ deleted: [] }))
    const response = await handleSessionDeleteRequest(service, post('not json'))
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ code: SESSION_DELETE_CODES.badRequest })
  })

  it('rejects an empty sessionId', async () => {
    const service = serviceOf(async () => ({ deleted: [] }))
    const response = await handleSessionDeleteRequest(service, post('{"sessionId":""}'))
    expect(response.status).toBe(400)
  })

  it('maps a coded refusal with the ids already deleted', async () => {
    const service = serviceOf(async () => {
      throw new SessionDeleteError(
        SESSION_DELETE_CODES.busy,
        'sessions still running: a',
        [brandString<SessionId>('b')],
      )
    })
    const response = await handleSessionDeleteRequest(service, post('{"sessionId":"a"}'))
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      code: SESSION_DELETE_CODES.busy,
      message: 'sessions still running: a',
      deleted: ['b'],
    })
  })

  it('hides unexpected failures behind a generic code', async () => {
    const service = serviceOf(async () => { throw new Error('boom') })
    const response = await handleSessionDeleteRequest(service, post('{"sessionId":"a"}'))
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      code: SESSION_DELETE_CODES.internal,
      message: 'session delete failed',
      deleted: [],
    })
  })
})
```

`tests/plugin-entry.spec.ts`:
```ts
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionPersistenceSnapshot } from '@deepseek-ai/dsh-session-persistence'
import { apply, name } from '../src/index.js'
import { SESSION_DELETE_ROUTE_PATH } from '../src/features/session-delete/routes.js'
import { createFakeHostContext } from './support/fake-host-ctx.js'

const id = (raw: string): SessionId => brandString<SessionId>(raw)

const snapshot = (
  raw: string,
  extra: { readonly parent?: string, readonly origin?: 'subagent' } = {},
): SessionPersistenceSnapshot => ({
  header: {
    version: 4,
    id: id(raw),
    createdAt: 1,
    isSeeded: false,
    ...(extra.parent === undefined ? {} : { parentSession: id(extra.parent) }),
    ...(extra.origin === undefined ? {} : { origin: extra.origin }),
  },
  revision: 'rev-1' as SessionPersistenceSnapshot['revision'],
})

const roots: string[] = []
const tempRoot = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'oliver-qol-'))
  roots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('plugin entry', () => {
  it('names the plugin', () => {
    expect(name).toBe('oliver-qol')
  })

  it('provides the session-delete service and registers the authenticated route', async () => {
    const root = await tempRoot()
    await mkdir(join(root, '--C-work--', 'root'), { recursive: true })
    const ctx = createFakeHostContext({ snapshots: [snapshot('root')] })
    apply(ctx as unknown as Context, {
      sessionDelete: { sessionsRoot: root, quiescenceTimeoutMs: 50, quiescencePollMs: 1 },
    })
    expect(ctx.provided.get('sessionDelete')).toBeDefined()
    expect(ctx.routes.map(route => route.path)).toEqual([SESSION_DELETE_ROUTE_PATH])
    expect(ctx.routes[0]?.methods).toEqual(['POST'])
    expect(ctx.routes[0]?.requestBody).toBe('buffered')

    const response = await ctx.routes[0]!.fetch(new Request(`http://localhost${SESSION_DELETE_ROUTE_PATH}`, {
      method: 'POST',
      body: JSON.stringify({ sessionId: 'root' }),
    }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ deleted: ['root'] })
  })

  it('mounts without a web connection', async () => {
    const root = await tempRoot()
    const ctx = createFakeHostContext({ snapshots: [], connection: false })
    apply(ctx as unknown as Context, {
      sessionDelete: { sessionsRoot: root, quiescenceTimeoutMs: 50, quiescencePollMs: 1 },
    })
    expect(ctx.provided.get('sessionDelete')).toBeDefined()
    expect(ctx.routes).toEqual([])
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test`
Expected: FAIL（`src/index.js`、route 模块不存在）。

- [ ] **Step 3: 实现入口与路由**

`src/config.ts`:
```ts
import Schema from '@deepseek-ai/schemastery'
import {
  sessionDeleteConfigSchema, type SessionDeleteConfig,
} from './features/session-delete/config.js'

/** Root config of the oliver-qol plugin: one optional section per feature. */
export interface QolConfig {
  /** Session deletion feature; absent means documented defaults. */
  readonly sessionDelete?: SessionDeleteConfig
}

/** Validated root config. */
export const QolConfigSchema: Schema<QolConfig> = Schema.object({
  sessionDelete: sessionDeleteConfigSchema,
})
```

`src/features/types.ts`:
```ts
import type { Context } from '@deepseek-ai/cordis'
import type { QolConfig } from '../config.js'

/** One host feature: self-contained registration over the shared root config. */
export interface HostFeature {
  /** Feature name; also the root config section this feature reads. */
  readonly name: keyof QolConfig
  /** Register every host contribution of this feature. */
  register(ctx: Context, config: QolConfig): void
}
```

`src/features/index.ts`:
```ts
import { sessionDeleteFeature } from './session-delete/index.js'
import type { HostFeature } from './types.js'

/** Every host feature this plugin mounts, in registration order. */
export const HOST_FEATURES: readonly HostFeature[] = [sessionDeleteFeature]
```

`src/features/session-delete/routes.ts`:
```ts
/** Absolute path the Host registers the delete route under. */
export const SESSION_DELETE_ROUTE_PATH = '/api/oliver-qol/session.delete'
/** Browser-relative form the client fetches. */
export const SESSION_DELETE_ROUTE = SESSION_DELETE_ROUTE_PATH.slice(1)
```

`src/features/session-delete/route.ts`:
```ts
import { brandString } from '@deepseek-ai/dsh-brand'
import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import {
  SESSION_DELETE_CODES, SESSION_DELETE_HTTP_STATUS, SessionDeleteError, type SessionDeleteCode,
} from './errors.js'
import { SESSION_DELETE_ROUTE_PATH } from './routes.js'
import type { SessionDeleteService } from './service.js'

/** The connection capability the route registers on; absent outside Web compositions. */
export interface SessionDeleteConnection {
  readonly fetch: {
    register(route: {
      readonly path: string
      readonly methods: readonly ['POST']
      readonly requestBody: 'buffered'
      readonly fetch: (request: Request) => Promise<Response>
    }): () => Promise<void>
  }
}

/**
 * Register the authenticated delete route when the composition has a connection.
 * @param ctx - feature context.
 * @param service - the delete capability to expose.
 */
export function registerSessionDeleteRoute(ctx: Context, service: SessionDeleteService): void {
  const connection = connectionOf(ctx)
  if (connection === undefined) return
  ctx.effect(() => {
    const dispose = connection.fetch.register({
      path: SESSION_DELETE_ROUTE_PATH,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: request => handleSessionDeleteRequest(service, request),
    })
    return () => { void dispose() }
  }, 'oliver-qol: session-delete route')
}

/**
 * Answer one delete request with the report or a coded failure.
 * @param service - the delete capability.
 * @param request - the buffered POST request.
 * @returns the JSON response.
 */
export async function handleSessionDeleteRequest(
  service: SessionDeleteService,
  request: Request,
): Promise<Response> {
  const sessionId = await sessionIdOf(request)
  if (sessionId === undefined) {
    return failureResponse(SESSION_DELETE_CODES.badRequest, 'sessionId must be a non-empty string', [])
  }
  try {
    const report = await service.delete(sessionId)
    return Response.json({ deleted: report.deleted })
  } catch (error: unknown) {
    if (error instanceof SessionDeleteError) {
      return failureResponse(error.code, error.message, error.deleted)
    }
    return failureResponse(SESSION_DELETE_CODES.internal, 'session delete failed', [])
  }
}

function failureResponse(
  code: SessionDeleteCode,
  message: string,
  deleted: readonly SessionId[],
): Response {
  return Response.json({ code, message, deleted }, { status: SESSION_DELETE_HTTP_STATUS[code] })
}

async function sessionIdOf(request: Request): Promise<SessionId | undefined> {
  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return undefined
  }
  if (typeof payload !== 'object' || payload === null) return undefined
  const raw: unknown = Reflect.get(payload, 'sessionId')
  return typeof raw === 'string' && raw.length > 0 ? brandString<SessionId>(raw) : undefined
}

function connectionOf(ctx: Context): SessionDeleteConnection | undefined {
  const value: unknown = ctx.get('connection')
  if (typeof value !== 'object' || value === null) return undefined
  const fetch: unknown = Reflect.get(value, 'fetch')
  if (typeof fetch !== 'object' || fetch === null) return undefined
  if (typeof Reflect.get(fetch, 'register') !== 'function') return undefined
  // Shape guarded above; the call signature is the documented connection contract.
  return value as SessionDeleteConnection
}
```

`src/features/session-delete/index.ts`:
```ts
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-workspace'
import type { HostFeature } from '../types.js'
import { SESSION_DELETE_DEFAULTS } from './config.js'
import { findSessionDirs } from './jsonl-layout.js'
import { registerSessionDeleteRoute } from './route.js'
import { removeSessionDirs } from './removal.js'
import { SessionDeleteService, type SessionDeleteDeps } from './service.js'

/** Session deletion: permanent removal of stored sessions and their derived state. */
export const sessionDeleteFeature: HostFeature = {
  name: 'sessionDelete',
  register(ctx: Context, root): void {
    const config = root.sessionDelete ?? SESSION_DELETE_DEFAULTS
    ctx.inject(['sessionPersistence', 'sessions'], (featureCtx) => {
      const deps: SessionDeleteDeps = {
        sessionPersistence: featureCtx.sessionPersistence,
        sessions: featureCtx.sessions,
        workspaceRegistry: featureCtx.get('workspaceRegistry'),
        storageDomain: featureCtx.get('storageDomain'),
        activityOf: async (sessionId) => {
          const activity = await featureCtx.waterfall(
            'workspace/session-activity',
            { sessionId },
            () => Promise.resolve([]),
          )
          return activity.length
        },
        logger: {
          warn: message => { featureCtx.logger.warn(message) },
        },
        sleep: milliseconds => new Promise(resolve => { setTimeout(resolve, milliseconds) }),
        now: () => Date.now(),
        findSessionDirs,
        removeSessionDirs,
      }
      const service = new SessionDeleteService(deps, config)
      featureCtx.provide('sessionDelete', service)
      registerSessionDeleteRoute(featureCtx, service)
    })
  },
}
```

`src/index.ts`:
```ts
import type { Context } from '@deepseek-ai/cordis'
import { QolConfigSchema, type QolConfig } from './config.js'
import { HOST_FEATURES } from './features/index.js'

/** Cordis plugin name. */
export const name = 'oliver-qol'
/** Validated plugin config. */
export const Config = QolConfigSchema

/**
 * Mount every host feature.
 * @param ctx - host context.
 * @param config - validated root config.
 */
export function apply(ctx: Context, config: QolConfig = {}): void {
  for (const feature of HOST_FEATURES) feature.register(ctx, config)
}
```

- [ ] **Step 4: 运行测试与构建**

Run: `pnpm test`、`pnpm typecheck`、`pnpm build:host`
Expected: PASS；`lib/index.js` 生成。

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "feat(session-delete): mount the feature and register the delete route"
```

---

### Task 5: client 纯逻辑（descendant-count / delete-client / error-text / locales）

**Files:**
- Create: `src/features/session-delete/client/descendant-count.ts`, `delete-client.ts`, `error-text.ts`, `locales.ts`, `store.ts`
- Test: `tests/client/descendant-count.spec.ts`, `delete-client.spec.ts`, `error-text.spec.ts`

**Interfaces:**
- Consumes: `SESSION_DELETE_CODES`（Task 1）、`SESSION_DELETE_ROUTE`（Task 4）。
- Produces: `ClientSessionSummary`、`countSubagentDescendants(summaries, target)`；`SessionDeleteClientError`、`requestSessionDelete(fetcher, sessionId)`；`Translate`、`deleteErrorText(code, message, t)`；`SESSION_DELETE_NS`、`zh`、`en`；`SessionDeleteRequest`、`createDeleteRequestStore()`。

- [ ] **Step 1: 写失败测试**

`tests/client/descendant-count.spec.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { countSubagentDescendants } from '../../src/features/session-delete/client/descendant-count.js'

describe('countSubagentDescendants', () => {
  it('counts a subagent chain and ignores forks', () => {
    const summaries = {
      root: {},
      fork: { parentSessionId: 'root' },
      child: { parentSessionId: 'root', origin: 'subagent' as const },
      grandchild: { parentSessionId: 'child', origin: 'subagent' as const },
      unrelated: { parentSessionId: 'other', origin: 'subagent' as const },
    }
    expect(countSubagentDescendants(summaries, 'root')).toBe(2)
  })

  it('counts nothing for a leaf session', () => {
    expect(countSubagentDescendants({ root: {} }, 'root')).toBe(0)
  })

  it('survives a parent cycle', () => {
    const summaries = {
      a: { parentSessionId: 'b', origin: 'subagent' as const },
      b: { parentSessionId: 'a', origin: 'subagent' as const },
    }
    expect(countSubagentDescendants(summaries, 'a')).toBe(1)
  })
})
```

`tests/client/delete-client.spec.ts`:
```ts
import { describe, expect, it } from 'vitest'
import {
  requestSessionDelete, SessionDeleteClientError,
} from '../../src/features/session-delete/client/delete-client.js'
import { SESSION_DELETE_ROUTE } from '../../src/features/session-delete/routes.js'

describe('requestSessionDelete', () => {
  it('posts the session id and returns the deleted ids', async () => {
    const calls: { url: string; init: RequestInit | undefined }[] = []
    const fetcher = async (url: string, init?: RequestInit): Promise<Response> => {
      calls.push({ url, init })
      return Response.json({ deleted: ['a', 'b'] })
    }
    expect(await requestSessionDelete(fetcher, 'a')).toEqual(['a', 'b'])
    expect(calls[0]?.url).toBe(SESSION_DELETE_ROUTE)
    expect(calls[0]?.init?.method).toBe('POST')
    expect(calls[0]?.init?.body).toBe(JSON.stringify({ sessionId: 'a' }))
  })

  it('throws a coded error for a refused delete', async () => {
    const fetcher = async (): Promise<Response> => Response.json(
      { code: 'session-delete/busy', message: 'still running', deleted: ['a'] },
      { status: 409 },
    )
    await expect(requestSessionDelete(fetcher, 'a')).rejects.toMatchObject({
      code: 'session-delete/busy',
      message: 'still running',
      deleted: ['a'],
    })
  })

  it('throws an internal error for an unreadable response', async () => {
    const fetcher = async (): Promise<Response> => new Response('nope', { status: 500 })
    await expect(requestSessionDelete(fetcher, 'a')).rejects.toBeInstanceOf(SessionDeleteClientError)
  })
})
```

`tests/client/error-text.spec.ts`:
```ts
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test`
Expected: FAIL。

- [ ] **Step 3: 实现 client 纯逻辑**

`src/features/session-delete/client/descendant-count.ts`:
```ts
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
    if (summary === undefined || summary.origin !== 'subagent' || summary.parentSessionId === undefined) continue
    const siblings = children.get(summary.parentSessionId)
    if (siblings === undefined) children.set(summary.parentSessionId, [id])
    else siblings.push(id)
  }
  const seen = new Set<string>()
  const stack = [...(children.get(target) ?? [])]
  while (stack.length > 0) {
    const id = stack.pop()
    if (id === undefined || seen.has(id)) continue
    seen.add(id)
    stack.push(...(children.get(id) ?? []))
  }
  return seen.size
}
```

`src/features/session-delete/client/delete-client.ts`:
```ts
import { SESSION_DELETE_CODES } from '../errors.js'
import { SESSION_DELETE_ROUTE } from '../routes.js'

/** One refused delete reported by the host route. */
export class SessionDeleteClientError extends Error {
  override readonly name = 'SessionDeleteClientError'

  /**
   * @param code - stable host failure code.
   * @param message - host-provided text.
   * @param deleted - ids the host removed before the refusal.
   */
  constructor(
    readonly code: string,
    message: string,
    readonly deleted: readonly string[] = [],
  ) {
    super(message)
  }
}

/** HTTP carrier used by the delete request. */
export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>

/**
 * Ask the host to delete one session.
 * @param fetcher - HTTP carrier.
 * @param sessionId - the session to delete.
 * @returns the ids the host removed.
 * @throws {SessionDeleteClientError} with the host code and any partial report.
 */
export async function requestSessionDelete(
  fetcher: Fetcher,
  sessionId: string,
): Promise<readonly string[]> {
  const response = await fetcher(SESSION_DELETE_ROUTE, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  })
  const payload: unknown = await response.json().catch(() => undefined)
  if (!response.ok) {
    throw new SessionDeleteClientError(
      codeOf(payload) ?? SESSION_DELETE_CODES.internal,
      messageOf(payload) ?? `delete failed with HTTP ${response.status}`,
      deletedOf(payload),
    )
  }
  const deleted = deletedOf(payload)
  if (deleted === undefined) {
    throw new SessionDeleteClientError(SESSION_DELETE_CODES.internal, 'unexpected delete response')
  }
  return deleted
}

function fieldOf(payload: unknown, key: string): unknown {
  if (typeof payload !== 'object' || payload === null) return undefined
  return Reflect.get(payload, key)
}

function codeOf(payload: unknown): string | undefined {
  const code = fieldOf(payload, 'code')
  return typeof code === 'string' ? code : undefined
}

function messageOf(payload: unknown): string | undefined {
  const message = fieldOf(payload, 'message')
  return typeof message === 'string' ? message : undefined
}

function deletedOf(payload: unknown): readonly string[] | undefined {
  const deleted = fieldOf(payload, 'deleted')
  if (!Array.isArray(deleted) || !deleted.every(entry => typeof entry === 'string')) return undefined
  return deleted.map(entry => String(entry))
}
```

`src/features/session-delete/client/error-text.ts`:
```ts
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
```

`src/features/session-delete/client/locales.ts`:
```ts
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
```

`src/features/session-delete/client/store.ts`:
```ts
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'

/** One pending delete confirmation. */
export interface SessionDeleteRequest {
  readonly sessionId: string
  readonly displayTitle: string
  /** Subagent sessions the host cascade will also delete. */
  readonly descendantCount: number
}

/**
 * Create the confirmation-request store shared by the menu entry and the dialog.
 * @returns the store the menu writes and the dialog reads.
 */
export function createDeleteRequestStore(): SnapshotStore<SessionDeleteRequest | null> {
  return createSnapshotStore<SessionDeleteRequest | null>(null)
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test` 与 `pnpm typecheck`
Expected: PASS（`store.ts` 的 `SnapshotStore` 类型来自已安装的 `@deepseek-ai/dsh-client-store`）。

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "feat(session-delete): add browser-side delete client, copy, and pure helpers"
```

---

### Task 6: client UI（菜单项 / 确认框 / 入口 / 打包）

**Files:**
- Create: `src/client/context.ts`, `src/client/index.ts`, `src/features/session-delete/client/index.ts`, `src/features/session-delete/client/DeleteSessionMenuItem.tsx`, `src/features/session-delete/client/SessionDeleteConfirmDialog.tsx`, `scripts/build-client.mjs`
- Modify: `package.json`（新增 `build`、`build:client`、`prepare` 脚本）
- Test: `tests/client-bundle.spec.ts`

**Interfaces:**
- Consumes: Task 5 的 client 模块与 Task 4 的 `SESSION_DELETE_ROUTE`。
- Produces: `ClientServices`、`ClientSlotRegistry`、`ClientLocale`、`ClientSessions`、`clientServicesOf(ctx)`；client 入口 `inject = ['slots','locale']` 与 `apply(ctx)`；`registerSessionDeleteClient(services)`。

- [ ] **Step 1: 写失败测试（bundle 冒烟 + 注册行为）**

`tests/client-bundle.spec.ts`:
```ts
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

interface CapturedEntry {
  readonly id: string
  readonly factory: (require: (name: string) => unknown) => Record<string, unknown>
}

const artifacts: string[] = []
let outfile = ''
let bundle: Record<string, unknown> = {}

const requireStub = (name: string): unknown => {
  if (name === '@deepseek-ai/dsh-client-store') {
    return {
      createSnapshotStore: (initial: unknown) => ({
        getSnapshot: () => initial,
        set: () => {},
        update: () => {},
        subscribe: () => () => {},
      }),
    }
  }
  return {}
}

beforeAll(async () => {
  outfile = join(tmpdir(), `oliver-qol-client-${randomUUID()}.js`)
  artifacts.push(outfile, `${outfile}.map`)
  execFileSync(process.execPath, ['scripts/build-client.mjs', outfile], {
    cwd: process.cwd(),
    stdio: 'pipe',
  })
  const captured: { entry?: CapturedEntry } = {}
  Reflect.set(globalThis, 'window', {
    __ModuleLoader__: { load: (entry: CapturedEntry) => { captured.entry = entry } },
  })
  await import(pathToFileURL(outfile).href)
  expect(captured.entry?.id).toBe('dsh-oliver-qol')
  bundle = captured.entry?.factory(requireStub) ?? {}
})

afterAll(async () => {
  await Promise.all(artifacts.splice(0).map(path => rm(path, { force: true })))
  Reflect.deleteProperty(globalThis, 'window')
})

describe('client bundle', () => {
  it('exports the plugin object the module loader applies', () => {
    expect(bundle['inject']).toEqual(['slots', 'locale'])
    expect(typeof bundle['apply']).toBe('function')
  })

  it('registers the menu entry, the dialog, and its locale namespace', () => {
    const injectedNames: string[] = []
    const registeredIds: string[] = []
    const namespaces: string[] = []
    const services = {
      get: (name: string) => {
        if (name === 'slots') {
          return {
            inject: (slot: string, callback: () => Iterable<() => void>) => {
              injectedNames.push(slot)
              void [...callback()]
            },
            register: (registration: { id?: string }) => {
              registeredIds.push(registration.id ?? '')
              return () => {}
            },
          }
        }
        if (name === 'locale') {
          return { register: (namespace: string) => { namespaces.push(namespace); return () => {} } }
        }
        return undefined
      },
      effect: (callback: () => () => void) => { callback() },
    }
    const apply = bundle['apply']
    if (typeof apply !== 'function') throw new Error('bundle has no apply')
    Reflect.apply(apply, undefined, [services])
    expect(injectedNames).toEqual(['sidebar.workspaces.session.menu.item', 'shell.overlay'])
    expect(registeredIds).toEqual(['delete', 'oliver-qol.session-delete'])
    expect(namespaces).toEqual(['oliver-qol.session-delete'])
  })
})
```
说明：注册行为用例直接跑**打包产物**（平台模块走 `requireStub`），因此 vitest 不需要加载 ui-primitives 及其 CSS；`src/client/index.ts` 本身仍由 `pnpm typecheck` 覆盖。

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test`
Expected: FAIL（`src/client/index.js`、`scripts/build-client.mjs` 不存在）。

- [ ] **Step 3: 实现 client 入口、UI 与构建脚本**

`src/client/context.ts`:
```ts
import type { ComponentType } from 'react'
import type { ClientSessionSummary } from '../features/session-delete/client/descendant-count.js'

/** One slot registration accepted by the client slot registry. */
export interface ClientSlotRegistration {
  readonly name: string
  readonly id?: string
  readonly order?: number
  readonly locale?: string
  readonly inject?: () => object
}

/** The client slot registry surface this plugin uses. */
export interface ClientSlotRegistry {
  inject(name: string, callback: () => Iterable<() => void>): void
  register<Props>(registration: ClientSlotRegistration, component: ComponentType<Props>): () => void
}

/** The client locale registry surface this plugin uses. */
export interface ClientLocale {
  register(
    namespace: string,
    dictionaries: { readonly zh: Record<string, string>, readonly en: Record<string, string> },
  ): () => void
}

/** The client session list facts this plugin reads. */
export interface ClientSessions {
  refresh(): Promise<void>
  readonly list: { getSnapshot(): { readonly byId: Record<string, ClientSessionSummary | undefined> } }
}

/** Everything a client feature needs from the browser host. */
export interface ClientServices {
  readonly slots: ClientSlotRegistry
  readonly locale: ClientLocale
  readonly sessions: ClientSessions | undefined
  /** Bind one registration to the plugin's client lifetime. */
  effect(callback: () => () => void, label: string): void
}

/**
 * Resolve the client services from the Cordis client context.
 * @param ctx - the client context (only `get` is read).
 * @returns the guarded services.
 * @throws {Error} when the required slot or locale service is missing.
 */
export function clientServicesOf(ctx: { get(name: string): unknown }): ClientServices {
  const slots = ctx.get('slots')
  if (!isSlotRegistry(slots)) throw new Error('oliver-qol: the client slots service is unavailable')
  const locale = ctx.get('locale')
  if (!isLocale(locale)) throw new Error('oliver-qol: the client locale service is unavailable')
  const sessions = ctx.get('sessions')
  const effect: unknown = Reflect.get(ctx, 'effect')
  if (typeof effect !== 'function') throw new Error('oliver-qol: the client context has no effect()')
  return {
    slots,
    locale,
    sessions: isSessions(sessions) ? sessions : undefined,
    effect: (callback, label) => { Reflect.apply(effect, ctx, [callback, label]) },
  }
}

function isSlotRegistry(value: unknown): value is ClientSlotRegistry {
  return typeof value === 'object' && value !== null
    && typeof Reflect.get(value, 'inject') === 'function'
    && typeof Reflect.get(value, 'register') === 'function'
}

function isLocale(value: unknown): value is ClientLocale {
  return typeof value === 'object' && value !== null
    && typeof Reflect.get(value, 'register') === 'function'
}

function isSessions(value: unknown): value is ClientSessions {
  if (typeof value !== 'object' || value === null) return false
  if (typeof Reflect.get(value, 'refresh') !== 'function') return false
  const list: unknown = Reflect.get(value, 'list')
  return typeof list === 'object' && list !== null && typeof Reflect.get(list, 'getSnapshot') === 'function'
}
```

`src/client/index.ts`:
```ts
import type { Context } from '@deepseek-ai/cordis'
import { registerSessionDeleteClient } from '../features/session-delete/client/index.js'
import { clientServicesOf } from './context.js'

/** Services the browser half needs; the loader waits for them before applying. */
export const inject = ['slots', 'locale']

const CLIENT_FEATURES = [registerSessionDeleteClient] as const

/**
 * Mount every browser feature.
 * @param ctx - client context.
 */
export function apply(ctx: Context): void {
  const services = clientServicesOf(ctx)
  for (const register of CLIENT_FEATURES) register(services)
}
```

`src/features/session-delete/client/index.ts`:
```ts
import type { ClientServices } from '../../../client/context.js'
import { countSubagentDescendants } from './descendant-count.js'
import { requestSessionDelete } from './delete-client.js'
import { DeleteSessionMenuItem, type DeleteSessionMenuInjected } from './DeleteSessionMenuItem.js'
import { en, SESSION_DELETE_NS, zh } from './locales.js'
import { createDeleteRequestStore, type SessionDeleteRequest } from './store.js'
import {
  SessionDeleteConfirmDialog, type SessionDeleteDialogInjected,
} from './SessionDeleteConfirmDialog.js'

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

  const requestDelete = (target: { readonly sessionId: string, readonly displayTitle: string }): void => {
    const snapshot = sessions?.list.getSnapshot()
    const request: SessionDeleteRequest = {
      ...target,
      descendantCount: snapshot === undefined ? 0 : countSubagentDescendants(snapshot.byId, target.sessionId),
    }
    requestStore.set(request)
  }

  const menuInjected = (): DeleteSessionMenuInjected => ({ requestDelete })
  const dialogInjected = (): SessionDeleteDialogInjected => ({
    hooks: { request: requestStore },
    settleSessionDelete: () => { requestStore.set(null) },
    deleteSession: async (sessionId) => {
      await requestSessionDelete((input, init) => fetch(input, init), sessionId)
      await sessions?.refresh()
    },
  })

  effect(() => locale.register(SESSION_DELETE_NS, { zh, en }), 'oliver-qol: session-delete locale')
  slots.inject(MENU_SLOT, function* () {
    yield slots.register({
      name: MENU_SLOT, id: 'delete', order: MENU_ORDER, locale: SESSION_DELETE_NS, inject: menuInjected,
    }, DeleteSessionMenuItem)
  })
  slots.inject(OVERLAY_SLOT, function* () {
    yield slots.register({
      name: OVERLAY_SLOT, id: DIALOG_ID, locale: SESSION_DELETE_NS, inject: dialogInjected,
    }, SessionDeleteConfirmDialog)
  })
}
```

`src/features/session-delete/client/DeleteSessionMenuItem.tsx`:
```tsx
import { IconTrashOutlineRegular, MenuItemButton } from '@deepseek-ai/dsh-client-ui-primitives'
import type { Translate } from './error-text.js'

/** Owner share and injected behavior of the row menu entry. */
export interface DeleteSessionMenuItemProps {
  readonly sessionId: string
  readonly displayTitle: string
  readonly useMenuOpenState: () => readonly [boolean, (open: boolean) => void]
  readonly requestDelete: (target: { readonly sessionId: string, readonly displayTitle: string }) => void
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
```

`src/features/session-delete/client/SessionDeleteConfirmDialog.tsx`:
```tsx
import { useState } from 'react'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import { deleteErrorText, type Translate } from './error-text.js'
import { SessionDeleteClientError } from './delete-client.js'
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
```

`scripts/build-client.mjs`:
```js
// Build the browser half: one CJS bundle wrapped in the DSH module-loader
// factory. Platform modules stay external and resolve through the injected
// require (see docs/subsystems/client-modules.md in the DSH checkout).
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const PLUGIN_ID = 'dsh-oliver-qol'
const PLATFORM_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-store',
]

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outfile = process.argv[2] ?? join(repoRoot, 'lib', 'client.js')

await build({
  absWorkingDir: repoRoot,
  entryPoints: ['src/client/index.ts'],
  outfile,
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  external: PLATFORM_EXTERNALS,
  sourcemap: true,
  logLevel: 'info',
  banner: {
    js: [
      `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {`,
      'var module = { exports: {} }; var exports = module.exports;',
    ].join('\n'),
  },
  footer: { js: 'return module.exports; } });' },
})
```

`package.json` scripts（在 Task 1 的 scripts 上新增三项）:
```json
    "build": "pnpm run build:host && pnpm run build:client",
    "build:client": "node scripts/build-client.mjs",
    "prepare": "pnpm run build",
```

- [ ] **Step 4: 运行测试与构建**

Run: `pnpm test`、`pnpm typecheck`、`pnpm build`
Expected: PASS；`lib/index.js` 与 `lib/client.js` 生成；bundle 冒烟用例通过。

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "feat(session-delete): add browser UI, client entry, and client bundle build"
```

---

### Task 7: README、清单一致性测试与整体验证

**Files:**
- Modify: `README.md`
- Test: `tests/package-manifest.spec.ts`

**Interfaces:**
- Consumes: 全部既有产物。
- Produces: 可交付的文档与清单门禁。

- [ ] **Step 1: 写清单一致性测试**

`tests/package-manifest.spec.ts`:
```ts
import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

interface Manifest {
  readonly name?: string
  readonly main?: string
  readonly exports?: Record<string, unknown>
  readonly files?: readonly string[]
  readonly dsh?: {
    readonly bundle?: { readonly patch?: string }
    readonly client?: { readonly platform?: string }
  }
}

const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as Manifest

describe('package manifest', () => {
  it('is the oliver-qol plugin', () => {
    expect(manifest.name).toBe('dsh-oliver-qol')
    expect(manifest.dsh?.bundle?.patch).toBe('./cordis.patch.yml')
    expect(manifest.dsh?.client?.platform).toBe('web')
  })

  it('publishes both halves', () => {
    expect(manifest.main).toBe('./lib/index.js')
    expect(manifest.exports?.['./client']).toBeDefined()
    expect(manifest.files).toContain('cordis.patch.yml')
  })

  it('ships a single bundle row naming the package', async () => {
    const patch = await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
    const insertRows = patch.split('\n').filter(line => line.trim() === '- insert:')
    expect(insertRows).toHaveLength(1)
    expect(patch).toContain('id: oliver-qol')
    expect(patch).toContain('name: dsh-oliver-qol')
  })
})
```

- [ ] **Step 2: 运行测试**

Run: `pnpm test`
Expected: PASS。

- [ ] **Step 3: 写 README**

README 需包含：插件定位（个人 QoL 功能整合，功能清单：session-delete）；设计文档链接；安装（GitHub：`dsh plugin --profile web add github:OliverKim/dsh-oliver-qol`，并说明 profile 的 `pnpm-workspace.yaml` 需要 `allowBuilds: dsh-oliver-qol: true`；本地开发：`dsh plugin --profile web add link:D:\2Code\Oliver-dsh-qol`）；配置表（`sessionDelete.sessionsRoot` 必须与 `session-persistence-jsonl` 的 `root` 一致、`quiescenceTimeoutMs`、`quiescencePollMs`）；开发循环（`pnpm install` / `pnpm test` / `pnpm typecheck` / `pnpm lint` / `pnpm build`；link 安装后改代码需重启 dsh）；人工验收步骤（删除普通会话、含 subagent 子会话的会话、当前打开的会话、归档中的会话；核对 `$DSH_HOME/sessions`、`$DSH_HOME/storages/session_projcache`、workspace 记账）；已知限制（不可恢复、跨进程并发、绑定 dsh 0.1.7-alpha.2、格式耦合集中在 `jsonl-layout.ts`/`removal.ts`）。

- [ ] **Step 4: 全量验证**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: 全部通过。

- [ ] **Step 5: 产物导入检查**

Run: `node -e "import('./lib/index.js').then(m => { if (m.name !== 'oliver-qol' || typeof m.apply !== 'function') throw new Error('bad exports'); console.log('ok') })"`
Expected: `ok`。

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "docs: document install, development, and acceptance for dsh-oliver-qol"
```

---

## M5（等用户放行，不在本计划内执行）

用户确认可以重启 dsh 后：`dsh plugin --profile web add link:D:\2Code\Oliver-dsh-qol` → `dsh.cmd --profile web --dump-config` 确认行合成 → 重启 `dsh-web.cmd` → 走 UI 完成 README 的人工验收清单 → 清理测试数据。

---

## 实施偏差记录（2026-09-24 执行时）

1. **pnpm 11 构建许可**：新增 `pnpm-workspace.yaml`（`allowBuilds: esbuild: true`）。pnpm 11 不再读取 package.json 的 `pnpm` 字段，且不批准 esbuild 的 postinstall 会让隐式安装检查以 `ERR_PNPM_IGNORED_BUILDS` 失败。
2. **Config 显式 resolve**：`SessionDeleteConfig` 改为全可选输入类型，新增 `ResolvedSessionDeleteConfig` 与 `resolveSessionDeleteConfig()`。原因：schemastery 的 schema 调用签名要求已解析值，且 dsh 约定"defaulting 是显式的 resolve 步骤"。
3. **构建编排**：`pnpm build` 改为 `node scripts/build.mjs`（先清空 `lib/`，再 tsc host + esbuild client）；`tsconfig.build.json` 排除 `src/client/**/*` 与 `src/features/*/client/**/*`。原因：tsc 会因 host 文件被 client 文件间接引用而把 client 模块编译进 `lib/`，并可能把陈旧产物带进 npm 包。验证：`pnpm pack` 的 tarball 只含 host 产物、`lib/client.js`、`cordis.patch.yml`、README、package.json。
4. **descendant-count 语义**：目标自身不计入子会话数（visited 集合预置 target，计数单独累加），环数据下不重复计数。

### M5 联调发现的缺陷与修正（2026-09-24）

5. **路由注册竞态**：`ctx.get(name, strict=true)` 只返回已 ACTIVE fiber 的服务。特性在 `sessionPersistence` 就绪即激活，而 connection 的 fiber 可能尚未 ACTIVE，于是路由被静默跳过（表现：`/api/oliver-qol/session.delete` 落到共享处理器兜底 404）。修正：路由注册改为 `featureCtx.inject(['connection'], ...)` 等待服务；`workspaceRegistry`/`storageDomain` 改为**调用时读取**（`() => ctx.get(...)`）。
6. **静默判据错误**：原实现等待"会话对象离开内存"（`ctx.sessions.get(id) === undefined`）。实测 dsh 会把**查看过的会话**提升为常驻 Agent 并保留到进程结束，live 永不消失 → 删除打开中的会话必然 `busy` 超时。修正：`stop.ts` 只等活动清零（turn/jobs/subagent/schedule），并对**每个目标都归档**（归档集合是阻止后续唤醒的持久屏障）；安全依据：JSONL 后端已物化句柄 `flush()` 直接返回、`close()` 只排空非空缓冲（`storage.ts` 的 `drainBuffered`/`persistContiguous`），归档 + 活动清零后不会再有事件写入。同时移除不再使用的 `sessions` 依赖。
7. **busy 诊断**：`busy` 消息带上每个未静默 id 的活动计数（`<id> (activity N)`），便于定位。
8. **客户端会话服务竞态**：`ctx.get('sessions')` 在 client `apply` 时同样可能未就绪（与宿主 connection 同类），原实现在激活时只读一次 → 计数恒为 0、删除后不刷新列表。修正：`ClientServices.sessions` 改为 `() => ClientSessions | undefined`，在请求/删除时读取；新增 `tests/client/context.spec.ts` 回归测试。
9. **子会话计数字段名**：客户端会话摘要的父字段是 `parentId`（宿主 wire 层才叫 `parentSessionId`）。原实现读错字段导致数量恒为 0；修正后对话框正确显示 "Its 1 subagent sessions are deleted with it."。
10. **空白会话无行菜单是 dsh 既有行为**（`ui-workspace/Rows.tsx` 仅在 `!row.blank` 时渲染行动词），非本插件问题；"删除当前打开的会话"改用"打开的非空白会话 + 直接调用路由"验证（200，130ms，此前为 15s busy 超时）。
