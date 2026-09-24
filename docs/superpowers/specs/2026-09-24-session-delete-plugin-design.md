# dsh-session-delete 插件设计

- 日期：2026-09-24
- 状态：已评审，待实施
- 目标 dsh 版本：`0.1.7-alpha.2`（本地源码树 `F:\DeepSeekHarness`，`DSH_HOME=F:\DeepSeekHarness\home`）
- 仓库：`D:\2Code\Oliver-dsh-qol`（私人 QoL 插件集合，pnpm monorepo）

## 1. 背景

DeepSeek Harness（dsh）目前没有任何删除会话的能力：`SessionPersistence` seam 只有 `create/open/flush/stat/list`，唯一的"隐藏"机制是 archive 归档（可恢复、软隐藏）。上游把真正的删除（`SessionPersistence.delete`、级联、运行检查）明确列为 future work。

本仓库用于长期开发个人 QoL 插件（本插件是第一个），因此既要真正补齐删除能力，也要把仓库结构、构建、测试做成后续插件可复用的范式，避免插件之间互相耦合。

## 2. 已确认的决策

| 主题 | 决策 |
|---|---|
| 删除语义 | **永久删除**（不可恢复）。可逆隐藏继续由 dsh 自带 archive 承担 |
| 功能入口 | **Web UI 会话菜单项**：悬停会话行的"..."菜单（现有 Pin/Rename/Fork/Archive）中新增 Delete session，点击后弹确认框 |
| 活动会话 | **先停止再删除**：host 先停止该会话的 turn / jobs / subagent / 定时任务，再删除 |
| 子会话 | **级联删除** `origin === 'subagent'` 的递归子会话；fork 出的会话保留（fork 无 `origin` 标记） |
| 仓库结构 | **pnpm monorepo**，`plugins/*` 每个插件完全自包含、可独立以 `github:<user>/<repo>#path:plugins/session-delete` 安装 |
| 分发 | GitHub 安装（`prepare` 构建）；本地开发用 `dsh plugin add link:<path>` |
| 简化项 | 不设 plan/dry-run 路由；确认框中的子会话数量由 client 用已加载的会话列表本地统计 |

## 3. 非目标

- 不做回收站 / 撤销（undo）。
- 不做给模型的 `session_delete` 工具（本轮不交付；未来可复用本服务）。
- 不做批量删除、清理旧会话的自动策略。
- 不改动 dsh 核心（`F:\DeepSeekHarness` 保持只读）。
- 不做 headless / CLI 的删除入口（host 服务可供未来复用）。

## 4. 技术背景（来自 dsh 0.1.7-alpha.2 源码调研）

- 会话日志：`<sessionsRoot>/<projectKey(cwd)>/<encodeSegment(id)>/session.v4.jsonl.zstd`（默认 zstd；`<sessionsRoot>` 默认 `dshHomePath('sessions')`；`_no-cwd` 表示无 cwd）。同目录存在写租约文件 `session.lock`（Windows 为内核信号量，无文件）。
- 派生数据：投影缓存 domain `session_projcache` v7、`layout: 'per-record'`、表 `sessions`（key 为 SessionId），无删除 API，只能经 `storageDomain` 打开的表删除；可选 SQLite 全文索引会自行对账（无需处理）。
- workspace 记账：`ctx.workspaceRegistry`（web 层才有）：`archiveSession(id, {stopActivity})`（会经 `workspace/session-stop` 停止 turn/jobs/subagent/schedule，并用归档集合阻止后续唤醒）、`unarchiveSession`、`unpinSession`、`archivedSessionIds`、`list()`；`Workspace.detachSession(id)` 可清理 `sessionIds` 数组中的记录。
- 运行中判定：`ctx.sessions.get(id) !== undefined`（进程内 SessionStore）。
- Web 扩展点：client slot `sidebar.workspaces.session.menu.item`（list 型，官方 archive 占 order 400）与 `shell.overlay`；`ctx.uiWorkspace` 为公开 client 服务；ui-workspace 的 `clearArchivedCurrent()` 会在当前会话被归档时清空选择并释放 retain，因此 host 侧"先归档→再等静默"可自然让当前打开的会话被释放。
- 认证路由：`ctx.connection.fetch.register({ path, methods, requestBody, fetch })`（参考 `session-log-export`，路径 `/api/session.export`）。
- client bundle：CJS + `window.__ModuleLoader__.load({ id, factory })` 包装；平台模块表 = `react`、`react/jsx-runtime`、`react-dom`、`react-dom/client`、`@deepseek-ai/cordis`、`@deepseek-ai/dsh-client-store`、`@deepseek-ai/dsh-client-ui-slots`、`@deepseek-ai/dsh-client-ui-primitives`、`@deepseek-ai/dsh-client-ui-dockkit`；client 会话摘要含 `parentSessionId`、`origin`。
- 安装：`dsh plugin --profile web add github:<user>/<repo>#path:plugins/session-delete`（pnpm ≥9 支持 `path:` 子目录），git 依赖需 `prepare` 构建且 profile 的 `pnpm-workspace.yaml` 添加 `allowBuilds`。

## 5. 架构

### 5.1 包

包名 `dsh-session-delete`，一个 npm 包内含 host 与 client 两半：

- `exports["."] → lib/index.js`（host）；`exports["./client"] → lib/client.js`（浏览器）。
- `dsh.bundle.patch → cordis.patch.yml`；`dsh.client = { platform: 'web', inject: ["@deepseek-ai/dsh-client-locale", "@deepseek-ai/dsh-client-ui-workspace", "@deepseek-ai/dsh-api-session-controller"], immediately: false }`。
- `cordis.patch.yml` 只插入一行：`{ id: session-delete, name: dsh-session-delete }`。

### 5.2 host 半

插件形态为 function plugin（`name` / `inject` / `Config` / `apply`，无 default export）。

- `inject = ['sessionPersistence', 'sessions']`（核心服务；缺失即 fail loud）。
- 可选服务：`ctx.get('workspaceRegistry')`、`ctx.get('storageDomain')`、`ctx.get('connection')`。
- `apply` 中 `ctx.provide('sessionDelete', service)`，并在 `connection` 存在时注册路由。

**Config（全部可配，无魔法数字）**

| 字段 | 默认值 | 说明 |
|---|---|---|
| `sessionsRoot` | `dshHomePath('sessions')` | JSONL 会话根目录 |
| `quiescenceTimeoutMs` | `15000` | 等待会话静默的上限 |
| `quiescencePollMs` | `200` | 静默轮询间隔 |

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
2. 对每个活动 id（`sessions.get(id) !== undefined`）调用 `workspaceRegistry.archiveSession(id, { stopActivity: true })` 停止其工作并阻止唤醒；`workspaceRegistry` 缺失且会话活动时以 `stop-unavailable` 拒绝。
3. 轮询 `sessions.get(id) === undefined` 等待全部静默；超时以 `busy` 拒绝（会话保持已归档，可从归档筛选重试）。当前打开的会话由 ui-workspace 的归档自动清空逻辑释放。
4. 物理删除（深→浅，先子后父）：定位 `<root>/<projectDir>/<encodeSegment(id)>` 目录并递归删除。`projectDir` 不重算 `projectKey`，而是扫描 `<root>` 下各项目目录、匹配 `encodeSegment(id)` 目录名。
5. 删除投影缓存记录：`storageDomain.get('session_projcache')` → 表 `sessions` → `delete(id)`；domain 未打开或服务缺失则记日志跳过（自愈派生数据）。
6. 记账清理：遍历 `workspaceRegistry.list()`，对每个 workspace 调 `detachSession(id)`；再 `unarchiveSession(id)`、`unpinSession(id)`。
7. 返回 `{ deleted }`。

**路由（已认证，仿 `session-log-export`）**

- `POST /api/session.delete`，body `{ "sessionId": string }`，成功 `200 { "deleted": string[] }`，失败 `{ "code", "message", "deleted": string[] }`。
- 校验：body 必须为 JSON 且 `sessionId` 非空字符串，否则 400。
- message 一律用户可读、不含宿主路径。

**错误码与 HTTP 映射**（集中定义）

| code | HTTP | 场景 |
|---|---|---|
| `session-delete/not-found` | 404 | 会话不存在（既不 live 也无持久化记录） |
| `session-delete/busy` | 409 | 静默超时，或文件被其他进程占用（Windows 锁） |
| `session-delete/stop-unavailable` | 409 | 会话活动但 `workspaceRegistry` 缺失，无法安全停止 |
| `session-delete/io-failed` | 500 | 其他文件系统错误 |

**耦合隔离**：磁盘布局假设（两层目录 + `encodeSegment` 复刻）只存在于 `jsonl-layout.ts` 与 `removal.ts`；其余模块只依赖 dsh 公开服务。

### 5.3 client 半

`apply(ctx)` + `inject = ['slots', 'locale']`；`uiWorkspace` 与 `sessions` 作为可选 `ctx.get`。

- `ctx.effect(() => ctx.locale.register(NS, { zh, en }))`，全部文案在 `locales.ts`，无硬编码。
- `ctx.slots.inject('sidebar.workspaces.session.menu.item', ...)` 注册 `{ id: 'delete', order: 500, locale: NS, inject }`（archive 为 400）→ `DeleteSessionMenuItem`。
- `ctx.slots.inject('shell.overlay', ...)` 注册 `{ id: 'workspace.session-delete', locale: NS, inject }` → `SessionDeleteConfirmDialog`。

**交互流**

1. 菜单点 Delete session → 菜单收起，立即弹出确认框（无 loading 态）。
2. 确认框：标题"删除会话"；正文 = 会话标题 + "会话日志将被永久删除，无法恢复。"；若存在 subagent 子会话，追加"其内部 N 个 subagent 子会话也会一并删除。"（N 由 client 从已加载的会话列表递归统计 `origin === 'subagent'` 且父链命中目标的会话；服务或数据不可用时退回不含数量的文案）。
3. 按钮 `[取消]` 与危险按钮 `[删除]`；点删除后按钮进入处理中并禁用。
4. 成功 → 关闭对话框 → `ctx.get('sessions')?.refresh()`，侧边栏该行消失。
5. 失败 → 对话框内联显示 `code: message`（本地化映射，未知码原样显示），可重试或取消；会话此时仅保持归档状态。

**client 结构**：`src/client/index.ts`（注册）、`DeleteSessionMenuItem.tsx`、`SessionDeleteConfirmDialog.tsx`、`delete-client.ts`（fetch + 响应解析 + 纯函数可测）、`locales.ts`、`store.ts`（确认请求快照 store）。不使用 CSS Modules，只复用 `@deepseek-ai/dsh-client-ui-primitives` 的组件与图标（`MenuItemButton`、`Modal`、`Button`、`IconTrashOutlineRegular`）。

## 6. 仓库结构

```
D:\2Code\Oliver-dsh-qol\
├─ package.json            # private 根；脚本转发到各插件（build/test/lint/typecheck）
├─ pnpm-workspace.yaml     # packages: ['plugins/*']
├─ .editorconfig
├─ .gitignore              # node_modules、lib、*.tsbuildinfo 等
├─ README.md               # 仓库目的、插件清单、开发流程
├─ docs/superpowers/specs/ # 设计文档（本文件）
└─ plugins/session-delete/
   ├─ package.json         # dsh-session-delete；dsh.bundle + dsh.client；peer/devDeps 锁 0.1.7-alpha.2
   ├─ cordis.patch.yml
   ├─ tsconfig.json        # 自包含（不 extends 仓库外文件，保证 git 安装可构建）
   ├─ scripts/build-client.mjs   # esbuild 打包 client → lib/client.js
   ├─ src/
   │  ├─ index.ts          # function plugin：name/inject/Config/apply
   │  ├─ config.ts         # Config + Schema + 默认值
   │  ├─ errors.ts         # SessionDeleteError + code 常量 + HTTP 映射
   │  ├─ routes.ts         # 路由路径常量（注册用绝对路径 + client 相对路径）
   │  ├─ plan.ts           # 目标与 subagent 子会话解析（纯函数）
   │  ├─ stop.ts           # archive-with-stop + 静默等待
   │  ├─ jsonl-layout.ts   # encodeSegment 复刻 + 会话目录定位（唯一格式耦合点）
   │  ├─ removal.ts        # 目录删除 + 投影缓存记录删除
   │  ├─ accounting.ts     # detachSession / unarchive / unpin
   │  ├─ service.ts        # 流水线编排
   │  ├─ route.ts          # connection.fetch.register 注册与请求/响应映射
   │  └─ client/           # 见 5.3
   ├─ tests/*.spec.ts      # vitest
   └─ README.md            # 安装、开发循环、人工验收步骤、已知限制
```

每个插件包完全自包含：自己的 tsconfig、构建脚本、依赖与测试；根目录只做编排。`lib/` 不入库。

## 7. 工具链

- pnpm workspace；Node `^22.19.0 || >=24.0.0`；ESM。
- TypeScript strict；host 用 `tsc` 输出 `lib/index.js` + `lib/types`。
- client 用 esbuild（devDependency）打包：`format: cjs`、`platform: browser`、`jsx: automatic`、externals = 用到的平台模块（`react`、`react/jsx-runtime`、`@deepseek-ai/dsh-client-ui-primitives`、`@deepseek-ai/dsh-client-store`）、banner/footer 包装成 `window.__ModuleLoader__.load`、输出 sourcemap。
- 测试：vitest（插件包内）。
- 代码规范：`.editorconfig` + oxlint；文件末尾单换行；无注释复述代码。
- peer/devDependencies：`@deepseek-ai/*` 与 `@deepseek-ai/cordis` 精确锁定 `0.1.7-alpha.2`；client 类型包（`dsh-client-ui-primitives`、`dsh-client-ui-slots`、`dsh-client-locale`、`dsh-client-store`、`dsh-api-session-controller` 等）作为 devDependency + optional peer，仅类型导入。

## 8. 测试策略

- **单元（vitest）**
  - `jsonl-layout`：`encodeSegment` 向量；目录定位扫描（临时目录）。
  - `plan`：subagent 链级联、fork 排除、目标缺失。
  - `service`：全流水线编排（fake persistence / sessions / workspaceRegistry / storageDomain + 临时目录真 fs）；验证顺序、停止调用、清理调用、错误传播与 `deleted` 报告。
  - `stop`：静默等待成功/超时；`workspaceRegistry` 缺失时活动会话拒绝。
  - `route`：请求校验（缺 body、坏 JSON、空 sessionId）、成功/错误响应与 HTTP 状态映射（对注册到的 fetch 函数直接发 `Request`）。
  - `client/delete-client`：fake fetcher 的成功/错误/网络异常解析。
- **人工集成验收（README 记录步骤）**：`link:` 安装到本地 profile → `dsh --profile web --dump-config` 确认行与层 → `dsh-web.cmd` → 创建含 subagent 子会话的测试会话 → 走 UI 删除 → 核对 `$DSH_HOME/sessions`、`storages/session_projcache`、workspace 记账均已清理；再验证"删除当前打开的会话"与"删除归档中的会话"。

## 9. 里程碑

1. **M1 仓库骨架**：`git init`、根 workspace、README、本设计文档提交。
2. **M2 host 半**：包骨架 + config/errors/routes/plan/stop/jsonl-layout/removal/accounting/service/route + 单元测试；link 安装后用 curl 验证路由（含错误路径）。
3. **M3 client 半**：esbuild 构建 + 菜单项 + 确认框 + locale + 测试；Web UI 人工验收全部场景。
4. **M4 收尾**：README（安装/开发/验收/限制）、根脚本、git 安装路径验证（可选，需远端仓库）。

## 10. 已知限制与风险

- **格式耦合**：目录布局与 `encodeSegment` 复刻绑定 `0.1.7-alpha.2`；dsh 升级需复核 `session-persistence-jsonl` 的 `format.ts` 与投影缓存 domain 版本。
- **跨进程并发**：删除期间另一进程正在写同一会话时，Windows 因文件锁失败（映射 `busy`），POSIX 存在小概率竞态窗口；单机单 home 场景风险极低，README 明示。
- **当前打开的会话**：依赖 ui-workspace 归档清空逻辑释放 retain；若客户端未及时释放，表现为 `busy` 超时，重试即可。
- **删除不可恢复**：确认框已是最后一道防线；不提供 undelete。
- **API 不稳定**：dsh 全部 API 处于 pre-stable，插件版本与 dsh 版本强绑定。

## 11. 未来工作

- 回收站 / 延迟清理（trash + TTL）。
- 模型工具 `session_delete`（复用 `sessionDelete` 服务 + 权限护栏）。
- 批量清理（按时间/workspace）与"删除空白会话"。
- 本仓库后续插件沿用同一包范式（host±client、自包含、独立安装）。
