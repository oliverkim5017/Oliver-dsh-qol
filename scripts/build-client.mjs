// Build the browser half: one CJS bundle wrapped in the DSH module-loader
// factory. Platform modules stay external and resolve through the injected
// require (see docs/subsystems/client-modules.md in the DSH checkout).
import { build } from 'esbuild'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

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
