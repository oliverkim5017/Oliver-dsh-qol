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

const manifest = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8'),
) as Manifest

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
