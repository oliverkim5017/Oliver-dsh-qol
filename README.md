# dsh-oliver-qol

Personal quality-of-life features for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (dsh), bundled as one plugin. Each feature lives in its own module under `src/features/`, carries its own config section, locale namespace, route prefix, and tests, and never imports another feature.

| Feature | State | What it does |
|---|---|---|
| `session-delete` | implemented | Permanently deletes a stored session (log, projection cache, workspace accounting) from the session row menu, cascading into its subagent child sessions |

Design: [`docs/superpowers/specs/2026-09-24-session-delete-plugin-design.md`](docs/superpowers/specs/2026-09-24-session-delete-plugin-design.md)
Plan: [`docs/superpowers/plans/2026-09-24-dsh-oliver-qol-session-delete.md`](docs/superpowers/plans/2026-09-24-dsh-oliver-qol-session-delete.md)

## Compatibility

Built against dsh `0.1.7-alpha.2`. dsh APIs are pre-stable, so this plugin pins the exact `@deepseek-ai/*` versions it was developed with; expect to update them together with dsh.

## Install

The plugin is a dsh bundle: its `package.json` declares `dsh.bundle` (host half) and `dsh.client` (browser half).

```bat
:: from GitHub (needs a built artifact; pnpm runs `prepare`)
dsh plugin --profile web add github:OliverKim/dsh-oliver-qol

:: from a local checkout (development loop)
dsh plugin --profile web add link:D:\2Code\Oliver-dsh-qol
```

Git installs run this package's `prepare` script, so the profile's `pnpm-workspace.yaml` must allow it:

```yaml
allowBuilds:
  dsh-oliver-qol: true
```

Restart dsh after adding, updating, or removing the plugin. The bundle patch (`cordis.patch.yml`) mounts exactly one row: `id: oliver-qol`, `name: dsh-oliver-qol`.

## Configuration

```yaml
- id: oliver-qol
  config:
    sessionDelete:
      sessionsRoot: <path>          # default: dshHomePath('sessions')
      quiescenceTimeoutMs: 15000    # default: 15000
      quiescencePollMs: 200         # default: 200
```

`sessionDelete.sessionsRoot` must match the `root` of the profile's `session-persistence-jsonl` row (`$DSH_HOME/sessions` by default). If a deployment moves that root, set both.

## Development

```sh
pnpm install
pnpm test          # vitest
pnpm typecheck     # tsc, no emit
pnpm lint          # oxlint
pnpm build         # tsc host half -> lib/, esbuild browser half -> lib/client.js
```

`lib/` is not committed. The client bundle is one CJS artifact wrapped in `window.__ModuleLoader__.load({ id: 'dsh-oliver-qol', factory })`; platform modules (`react`, `react/jsx-runtime`, `@deepseek-ai/dsh-client-ui-primitives`, `@deepseek-ai/dsh-client-store`) stay external and resolve through the injected `require`.

Adding a feature: create `src/features/<name>/` (with its own `client/` half when it has UI), then add one line to `src/features/index.ts` and one to `src/client/index.ts`. Keep features independent — share code only through a `src/shared/` module that at least two features actually use.

## Manual acceptance (needs a dsh restart)

After `dsh plugin --profile web add link:...` and a restart of `dsh web`:

1. Open a session's "..." menu — `Delete session` sits below `Archive session`, in red.
2. Delete a plain session: confirm, then check the row disappears and `$DSH_HOME/sessions/<project>/<id>/` is gone.
3. Delete a session that spawned subagents: the dialog names the child count; confirm the child directories and their `session_projcache` rows are gone.
4. Delete the session that is currently open: it is stopped and released first; expect the conversation view to clear.
5. Delete an archived session from the archived filter.
6. Check `$DSH_HOME/storages/session_projcache` no longer holds rows for the deleted ids, and that workspace accounting (`$DSH_HOME/storages/workspace.json`) dropped them.

## Known limitations

- Deletion is permanent; there is no undo. Use archive for reversible hiding.
- A session written by another dsh process at the same time fails loudly (`session-delete/busy`) on Windows file locks; retry after that process stops.
- Deleting the currently open session relies on the shipped archive-driven release of the main view; if the client does not release it in time, the request answers `busy` and can be retried.
- The JSONL storage layout (project directory + encoded session segment) is the only format coupling; it lives in `src/features/session-delete/jsonl-layout.ts` and `removal.ts` and must be re-checked on dsh upgrades.
