// Build both halves from a clean lib/: tsc emits the host half, esbuild emits
// the browser bundle. The clean step keeps stale outputs (for example client
// modules compiled by an earlier configuration) out of the published package.
import { spawnSync } from 'node:child_process'
import { rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const tsc = join(repoRoot, 'node_modules', 'typescript', 'bin', 'tsc')

const run = (command, args) => {
  const result = spawnSync(command, args, { cwd: repoRoot, stdio: 'inherit' })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

await rm(join(repoRoot, 'lib'), { recursive: true, force: true })
run(process.execPath, [tsc, '-p', 'tsconfig.build.json'])
run(process.execPath, [join(repoRoot, 'scripts', 'build-client.mjs')])
