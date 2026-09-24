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
