# dsh-oliver-qol 插件设计（含首个功能 session-delete）

- 日期：2026-09-24
- 状态：已评审，待实施
- 目标 dsh 版本：`0.1.7-alpha.2`（本地源码树 `F:\DeepSeekHarness`，`DSH_HOME=F:\DeepSeekHarness\home`）
- 仓库：`D:\2Code\Oliver-dsh-qol`

## 1. 背景

DeepSeek Harness（dsh）目前没有任何删除会话的能力：`SessionPersistence` seam 只有 `create/open/flush/stat/list`，唯一的"隐藏"机制是 archive 归档（可恢复、软隐藏）。上游把真正的删除（`SessionPersistence.delete`、级联、运行检查）明确列为 future work。

本仓库的产品形态是**一个插件** `dsh-oliver-qol`：把"个人需要但官方没提供的小功能"整合进同一个插件里（QoL = quality of life）。session-delete 是第一个功能，不是唯一功能。因此架构上必须做到：功能之间零耦合、增删功能只动功能自己的目录与入口清单、构建与测试按功能可独立验证。

## 2. 已确认的决策

| 主题 | 决策 |
|---|---|
| 产品形态 | 单插件 `dsh-oliver-qol`，包内按功能模块组织；安装一次获得全部功能 |
| 删除语义 | **永久删除**（不可恢复）。可逆隐藏继续由 dsh 自带 archive 承担 |
| 功能入口 | **Web UI 会话菜单项**：悬停会话行的"..."菜单（现有 Pin/Rename/Fork/Archive）中新增 Delete session，点击后弹确认框 |
| 活动会话 | **先停止再删除**：host 先停止该会话的 turn / jobs / subagent / 定时任务，再删除 |
| 子会话 | **级联删除** `origin === 'subagent'` 的递归子会话；fork 出的会话保留（fork 无 `origin` 标记） |
| 仓库结构 | **单包仓库**：仓库根目录就是 `dsh-oliver-qol` 包；pnpm 仅作包管理器 |
| 分发 | GitHub 安装 `github:OliverKim/dsh-oliver-qol`（`prepare` 构建）；本地开发用 `dsh plugin add link:<path>` |
| 简化项 | 不设 plan/dry-run 路由；确认框中的子会话数量由 client 用已加载的会话列表本地统计 |
| 功能隔离 | 功能之间不互相 import；根入口持功能清单；每个功能自带 Config、locale namespace、路由前缀、测试 |
| dsh 重启 | 实施期间不重启用户正在工作的 dsh；需要重启依赖的验收步骤推迟到用户放行后 |

## 3. 非目标

- 不做回收站 / 撤销（undo）。
- 不做给模型的 `session_delete` 工具（本轮不交付；未来可复用 host 服务）。
- 不做批量删除、清理旧会话的自动策略。
- 不改动 dsh 核心（`F:\DeepSeekHarness` 保持只读）。
- 不做 headless / CLI 的删除入口（host 服务可供未来复用）。
- 不搭"插件框架"：根入口只做功能清单遍历，不引入通用生命周期引擎。

## 4. 技术背景（来自 dsh 0.1.7-alpha.2 源码调研）

- 会话日志：`<sessionsRoot>/<projectKey(cwd)>/<encodeSegment(id)>/session.v4.jsonl.zstd`（默认 zstd；`<sessionsRoot>` 默认 `dshHomePath('sessions')`；`_no-cwd` 表示无 cwd）。同目录存在写租约文件 `session.lock`（Windows 为内核信号量，无文件）。
- 派生数据：投影缓存 domain `session_projcache` v7、`layout: 'per-record'`、表 `sessions`（key 为 SessionId），无删除 API，只能经 `storageDomain` 已打开的表删除；可选 SQLite 全文索引会自行对账（无需处理）。
- workspace 记账：`ctx.workspaceRegistry`（web 层才有）：`archiveSession(id, {stopActivity})`（会经 `workspace/session-stop` 停止 turn/jobs/subagent/schedule，并用归档集合阻止后续唤醒）、`unarchiveSession`、`unpinSession`、`archivedSessionIds`、`list()`；`Workspace.detachSession(id)` 可清理 `sessionIds` 数组中的记录。
- 运行中判定：`ctx.sessions.get(id) !== undefined`（进程内 SessionStore）。
- Web 扩展点：client slot `sidebar.workspaces.session.menu.item`（list 型，官方 archive 占 order 400）与 `shell.overlay`；`ctx.uiWorkspace` 为公开 client 服务；ui-workspace 的 `clearArchivedCurrent()` 会在当前会话被归档时清空选择并释放 retain，因此 host 侧"先归档→再等静默"可自然让当前打开的会话被释放。
- 认证路由：`ctx.connection.fetch.register({ path, methods, requestBody, fetch })`（参考 `session-log-export`，路径 `/api/session.export`）。
- client bundle：CJS + `window.__ModuleLoader__.load({ id, factory })` 包装；平台模块表 = `react`、`react/jsx-runtime`、`react-dom`、`react-dom/client`、`@deepseek-ai/cordis`、`@deepseek-ai/dsh-client-store`、`@deepseek-ai/dsh-client-ui-slots`、`@deepseek-ai/dsh-client-ui-primitives`、`@deepseek-ai/dsh-client-ui-dockkit`；client 会话摘要含 `parentSessionId`、`origin`；ui 原语含 `MenuItemButton`、`Modal`、`Button`、`IconTrashOutlineRegular`；`ctx.locale.register` 支持任意 namespace 字符串。
- 安装：`dsh plugin --profile web add github:OliverKim/dsh-oliver-qol`，git 依赖需 `prepare` 构建且 profile 的 `pnpm-workspace.yaml` 添加 `allowBuilds`。

## 5. 架构

### 5.1 包与加载

一个 npm 包 `dsh-oliver-qol`，内含 host 与 client 两半：

- `exports["."] → lib/index.js`（host）；`exports["./client"] → lib/client.js`（浏览器）。
- `dsh.bundle.patch → cordis.patch.yml`；`dsh.client = { platform: 'web', inject: ["@deepseek-ai/dsh-client-locale", "@deepseek-ai/dsh-client-ui-workspace", "@deepseek-ai/dsh-api-session-controller"], immediately: false }`。
- `cordis.patch.yml` 只插入一行：`{ id: oliver-qol, name: dsh-oliver-qol }`。
- 命名空间约定：插件行 id `oliver-qol`；HTTP 路由前缀 `/api/oliver-qol/`；locale namespace 按功能分配（本功能 `oliver-qol.session-delete`）；host 能力键按功能分配（本功能 `sessionDelete`）。

**功能契约（最小约定，非框架）**：每个功能导出一个注册对象；根入口遍历功能清单逐个注册。功能自己从根配置取出子配置，清单因此是同质数组，无类型体操与 `unknown` 转换。

```ts
// src/features/index.ts — host 功能清单
export const HOST_FEATURES = [sessionDeleteFeature] as const

// 每个功能形如：
export interface HostFeature {
  /** 功能名，同时是根 Config 中的子配置键。 */
  readonly name: keyof QolConfig
  /** 自包含注册：内部完成 ctx.inject / 服务提供 / 路由注册 / effect 绑定。 */
  register(ctx: Context, config: QolConfig): void
}
```

```ts
// src/client/index.ts — 浏览器插件入口
export const inject = ['slots', 'locale']
export function apply(ctx: Context): void {
  for (const feature of CLIENT_FEATURES) feature.register(ctx)
}
```

根 Config 聚合各功能子配置（`{ sessionDelete: {...} }`），每个功能自带 schema 与默认值。

### 5.2 功能：session-delete（host 半）

- 插件根 `apply` 不声明重依赖；`sessionDeleteFeature.register` 内部 `ctx.inject(['sessionPersistence', 'sessions'], ...)`（核心服务；缺失则该功能保持休眠，不拖垮其他功能与整包加载）。
- 可选服务：`ctx.get('workspaceRegistry')`、`ctx.get('storageDomain')`、`ctx.get('connection')`。
- 激活后 `ctx.provide('sessionDelete', service)`，并在 `connection` 存在时注册路由。

**Config（全部可配，无魔法数字）**

| 字段 | 默认值 | 说明 |
|---|---|---|
| `sessionDelete.sessionsRoot` | `dshHomePath('sessions')` | JSONL 会话根目录 |
| `sessionDelete.quiescenceTimeoutMs` | `15000` | 等待会话静默的上限 |
| `sessionDelete.quiescencePollMs` | `200` | 静默轮询间隔 |

**公开服务接口**

```ts
interface SessionDeleteService {
  /** 执行删除；失败时错误携带已删除列表。目标解析（含 subagent 级联）是其内部步骤。 */
  delete(sessionId: SessionId): Promise<SessionDeletionReport> // { deleted: SessionId[] }
}
```

`plan.ts` 中的目标解析只作为内部步骤存在并被单测覆盖，不对外暴露未使用的 API。

**删除流水线（`delete`）**

1. `sessionPersistence.list()` 取一次快照：目标必须存在，否则 `not-found`；BFS 收集 `origin === 'subagent' && parentSession ∈ 集合` 的递归子会话；fork（`origin === undefined`）不收集。
2. 对每个 id 调用 `workspaceRegistry.archiveSession(id, { stopActivity: true })`——空闲会话也归档，因为归档集合是阻止后续唤醒的持久屏障；`workspaceRegistry` 缺失且该会话有活动时以 `stop-unavailable` 拒绝。
3. 轮询等待全部 id 的**活动**清零（turn/jobs/subagent/schedule）；超时以 `busy` 拒绝（会话保持已归档，可从归档筛选重试）。**不等会话对象离开内存**：dsh 会把查看过的会话保留到进程结束（live 永不消失），而 JSONL 后端对已物化句柄的 `flush()`/`close()` 在无待写事件时不写盘——归档阻止唤醒 + 活动清零后删除文件是安全的。当前打开的会话由 ui-workspace 的归档清空逻辑自动切走。
4. 物理删除（深→浅，先子后父）：定位 `<root>/<projectDir>/<encodeSegment(id)>` 目录并递归删除。`projectDir` 不重算 `projectKey`，而是扫描 `<root>` 下各项目目录、匹配 `encodeSegment(id)` 目录名。
5. 删除投影缓存记录：`storageDomain.get('session_projcache')` → 表 `sessions` → `delete(id)`；domain 未打开或服务缺失则记日志跳过（自愈派生数据）。
6. 记账清理：遍历 `workspaceRegistry.list()`，对每个 workspace 调 `detachSession(id)`；再 `unarchiveSession(id)`、`unpinSession(id)`。
7. 返回 `{ deleted }`。

**路由（已认证，仿 `session-log-export`）**

- `POST /api/oliver-qol/session.delete`，body `{ "sessionId": string }`，成功 `200 { "deleted": string[] }`，失败 `{ "code", "message", "deleted": string[] }`。
- 校验：body 必须为 JSON 且 `sessionId` 非空字符串，否则 400。
- message 一律用户可读、不含宿主路径。

**错误码与 HTTP 映射**（集中定义）

| code | HTTP | 场景 |
|---|---|---|
| `session-delete/bad-request` | 400 | 请求体不是 JSON 或 `sessionId` 缺失/为空 |
| `session-delete/not-found` | 404 | 会话不存在（既不 live 也无持久化记录） |
| `session-delete/busy` | 409 | 静默超时，或文件被其他进程占用（Windows 锁） |
| `session-delete/stop-unavailable` | 409 | 会话活动但 `workspaceRegistry` 缺失，无法安全停止 |
| `session-delete/io-failed` | 500 | 其他文件系统错误 |
| `session-delete/internal` | 500 | 未预期失败（不回显内部细节） |

**耦合隔离**：磁盘布局假设（两层目录 + `encodeSegment` 复刻）只存在于 `jsonl-layout.ts` 与 `removal.ts`；其余模块只依赖 dsh 公开服务。

### 5.3 功能：session-delete（client 半）

随包 client 入口注册；功能内部 `ctx.get('uiWorkspace')`、`ctx.get('sessions')` 作为可选依赖。

- `ctx.effect(() => ctx.locale.register(NS, { zh, en }))`（`NS = 'oliver-qol.session-delete'`），全部文案在 `locales.ts`，无硬编码。
- `ctx.slots.inject('sidebar.workspaces.session.menu.item', ...)` 注册 `{ id: 'delete', order: 500, locale: NS, inject }`（archive 为 400）→ `DeleteSessionMenuItem`。
- `ctx.slots.inject('shell.overlay', ...)` 注册 `{ id: 'oliver-qol.session-delete', locale: NS, inject }` → `SessionDeleteConfirmDialog`。

**交互流**

1. 菜单点 Delete session → 菜单收起，立即弹出确认框（无 loading 态）。
2. 确认框：标题"删除会话"；正文 = 会话标题 + "会话日志将被永久删除，无法恢复。"；若存在 subagent 子会话，追加"其内部 N 个 subagent 子会话也会一并删除。"（N 由 client 从已加载的会话列表递归统计 `origin === 'subagent'` 且父链命中目标的会话；服务或数据不可用时退回不含数量的文案）。
3. 按钮 `[取消]` 与危险按钮 `[删除]`；点删除后按钮进入处理中并禁用。
4. 成功 → 关闭对话框 → `ctx.get('sessions')?.refresh()`，侧边栏该行消失。
5. 失败 → 对话框内联显示 `code: message`（本地化映射，未知码原样显示），可重试或取消；会话此时仅保持归档状态。

**client 结构**：不使用 CSS Modules，只复用 `@deepseek-ai/dsh-client-ui-primitives` 的组件与图标。client 侧类型采用本地结构化接口（`ClientServices`：slots/locale/可选 sessions），不引入 ui-workspace 的整套 client 类型图，保持与宿主版本的松耦合；入口处对可选服务做运行时守卫。

## 6. 仓库结构

```
D:\2Code\Oliver-dsh-qol\            # 仓库根 == 包根（单包）
├─ package.json                     # dsh-oliver-qol；dsh.bundle + dsh.client；peer/devDeps 锁 0.1.7-alpha.2
├─ tsconfig.json                    # 自包含（不 extends 仓库外文件，保证 git 安装可构建）
├─ cordis.patch.yml                 # insert 一行 id: oliver-qol
├─ .editorconfig
├─ .gitignore                       # node_modules、lib、*.tsbuildinfo 等
├─ README.md                        # 插件用途、功能清单、安装、开发循环、验收步骤、已知限制
├─ scripts/build-client.mjs         # esbuild 打包 client → lib/client.js
├─ src/
│  ├─ index.ts                      # host 入口：name/Config/apply，遍历 HOST_FEATURES
│  ├─ config.ts                     # 根 Config：聚合各功能子配置
│  ├─ features/
│  │  ├─ index.ts                   # HOST_FEATURES 清单
│  │  └─ session-delete/
│  │     ├─ index.ts                # sessionDeleteFeature：register(ctx, config)
│  │     ├─ config.ts               # Config + Schema + 默认值
│  │     ├─ errors.ts               # code 常量 + SessionDeleteError + HTTP 映射
│  │     ├─ routes.ts               # 路由路径常量（注册用绝对路径 + client 相对路径）
│  │     ├─ plan.ts                 # 目标与 subagent 子会话解析（纯函数）
│  │     ├─ stop.ts                 # archive-with-stop + 静默等待
│  │     ├─ jsonl-layout.ts         # encodeSegment 复刻 + 会话目录定位（唯一格式耦合点）
│  │     ├─ removal.ts              # 目录删除 + 投影缓存记录删除
│  │     ├─ accounting.ts           # detachSession / unarchive / unpin
│  │     ├─ service.ts              # 流水线编排
│  │     ├─ route.ts                # connection.fetch.register 注册与请求/响应映射
│  │     └─ client/
│  │        ├─ index.ts             # registerSessionDeleteClient(ctx)
│  │        ├─ store.ts             # 确认请求快照 store
│  │        ├─ delete-client.ts     # fetch + 响应解析（纯函数可测）
│  │        ├─ DeleteSessionMenuItem.tsx
│  │        ├─ SessionDeleteConfirmDialog.tsx
│  │        └─ locales.ts
│  └─ client/
│     └─ index.ts                   # 浏览器插件入口：inject + CLIENT_FEATURES 遍历
├─ tests/
│  └─ features/session-delete/*.spec.ts
├─ docs/superpowers/specs/          # 设计文档（本文件）
└─ lib/                             # 构建产物，不入库
```

约定：新增功能 = 新建 `src/features/<name>/`（含 `client/`）+ 在 `src/features/index.ts` 与 `src/client/index.ts` 的清单各加一行；功能之间不互相 import；`src/shared/` 只在确有跨功能复用且被两个以上功能实际使用时才创建。

## 7. 工具链

- pnpm（单包，无 workspace 层）；Node `^22.19.0 || >=24.0.0`；ESM。
- TypeScript strict；host 用 `tsc` 输出 `lib/index.js` + `lib/types`。
- client 用 esbuild（devDependency）打包：`format: cjs`、`platform: browser`、`jsx: automatic`、externals = 用到的平台模块（`react`、`react/jsx-runtime`、`@deepseek-ai/dsh-client-ui-primitives`、`@deepseek-ai/dsh-client-store`）、banner/footer 包装成 `window.__ModuleLoader__.load`、输出 sourcemap。
- 测试：vitest。
- 代码规范：`.editorconfig` + oxlint；文件末尾单换行；无注释复述代码。
- peer/devDependencies：`@deepseek-ai/*` 与 `@deepseek-ai/cordis` 精确锁定 `0.1.7-alpha.2`；client 类型包作为 devDependency + optional peer，仅类型导入。
- `lib/` 不入库；`prepare: pnpm build` 供 git 安装构建（README 记录 profile 需加 `allowBuilds`）。

## 8. 测试策略

- **单元（vitest）**
  - `jsonl-layout`：`encodeSegment` 向量；目录定位扫描（临时目录）。
  - `plan`：subagent 链级联、fork 排除、目标缺失、环防护。
  - `service`：全流水线编排（fake persistence / sessions / workspaceRegistry / storageDomain + 临时目录真 fs）；验证顺序、停止调用、清理调用、部分失败时的 `deleted` 报告与残留清理。
  - `stop`：活动判定（live 或 activity waterfall）、静默等待成功/超时；`workspaceRegistry` 缺失时活动会话拒绝。
  - `route`：请求校验（缺 body、坏 JSON、空 sessionId）、成功/错误响应与 HTTP 状态映射（对注册到的 fetch 函数直接发 `Request`）。
  - `errors`：每个错误码都有 HTTP 映射。
  - `client/delete-client`：fake fetcher 的成功/错误/网络异常解析。
  - `client/descendant-count` 与 `client/error-text`：纯函数统计与错误码文案映射。
  - client bundle 冒烟：用 esbuild 以构建脚本同样的配置打包到临时文件，在 Node 中以桩 `window.__ModuleLoader__` 与桩 `require` 载入，断言导出 `inject`/`apply` 且 `apply` 能向桩 slots/locale 注册。
  - 根入口集成：fake ctx（inject/get/provide/effect/logger/waterfall）跑 `apply`，断言服务被 provide、路由被注册，并经路由处理器完成一次端到端删除（fake 持久化/会话/workspace/storageDomain）。
- **组件测试范围**：client 组件是框架 slot 机制上的薄展示层，不做 jsdom 组件测试；可测逻辑已抽成纯模块（上述），UI 行为由 M5 人工验收覆盖。
- **验证（不重启用户 dsh）**：`pnpm build` 产物可被 Node 导入并导出 `name`/`apply`/`Config`；`cordis.patch.yml` 结构测试（恰好一行 insert，id/name 正确）。**不在用户的 DSH_HOME 上启动任何 dsh 进程**（profile 的 `cordis.yml` 每次 boot 会被重写，可能触发用户实例的 HMR），真实合成验证推迟到 M5。
- **需重启的验收（推迟到用户放行）**：安装到本地 profile 后走 UI：删除普通会话、含 subagent 子会话的会话、当前打开的会话、归档中的会话；核对 `$DSH_HOME/sessions`、`storages/session_projcache`、workspace 记账均已清理。

## 9. 里程碑

1. **M1 仓库骨架**：包骨架（package.json、tsconfig、cordis.patch.yml、.gitignore、.editorconfig、scripts/build-client.mjs、README 初稿）；`git init` 已完成。
2. **M2 host 功能**：session-delete 全部 host 模块 + 单元测试；`pnpm build`/`pnpm test` 通过。
3. **M3 client 功能**：client 入口 + 菜单项 + 确认框 + locale + delete-client + 测试；client bundle 构建通过。
4. **M4 不重启验证**：产物导入检查、临时 overlay 的 `--dump-config` 检查、README 完善。
5. **M5 重启验收（等用户放行）**：link 安装 + Web UI 全场景人工验收。

## 10. 已知限制与风险

- **格式耦合**：目录布局与 `encodeSegment` 复刻绑定 `0.1.7-alpha.2`；dsh 升级需复核 `session-persistence-jsonl` 的 `format.ts` 与投影缓存 domain 版本。
- **跨进程并发**：删除期间另一进程正在写同一会话时，Windows 因文件锁失败（映射 `busy`），POSIX 存在小概率竞态窗口；单机单 home 场景风险极低，README 明示。
- **当前打开的会话**：host 会先把目标归档并等待活动清零；ui-workspace 的归档清空逻辑自动切走视图，因此打开中的会话可直接删除（会话对象会留在宿主内存里直到进程结束，这不影响删除——见 5.2 第 3 步的写路径依据）。
- **删除不可恢复**：确认框已是最后一道防线；不提供 undelete。
- **API 不稳定**：dsh 全部 API 处于 pre-stable，插件版本与 dsh 版本强绑定。
- **单包共享风险**：任何功能的注册失败都不应影响其他功能（每个功能在自己的 `ctx.inject` fiber 内注册；错误只影响该功能）。

## 11. 未来工作

- 回收站 / 延迟清理（trash + TTL）。
- 模型工具 `session_delete`（复用 `sessionDelete` 服务 + 权限护栏）。
- 批量清理（按时间/workspace）与"删除空白会话"。
- 后续 QoL 功能按本文件的功能契约加入本插件（同样单包多渠道：host±client、独立 Config/locale/路由前缀/测试）。
