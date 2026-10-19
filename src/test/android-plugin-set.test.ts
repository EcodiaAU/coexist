import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import config from '../../capacitor.config'

// Plugins that exist for iOS only. Each must stay OUT of the Android build.
const IOS_ONLY_PLUGINS = ['@capgo/capacitor-native-navigation', '@capacitor/device']

const root = resolve(__dirname, '../..')

function capacitorPluginDeps(): string[] {
  const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
  const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
  return deps.filter((d) => {
    const dir = resolve(root, 'node_modules', d)
    if (!existsSync(resolve(dir, 'package.json'))) return false
    const meta = JSON.parse(readFileSync(resolve(dir, 'package.json'), 'utf8'))
    return Boolean(meta.capacitor?.android) || existsSync(resolve(dir, 'android'))
  })
}

describe('Android plugin set', () => {
  const include = config.android?.includePlugins ?? []

  it('names every Capacitor plugin dependency as either Android or iOS-only', () => {
    const undecided = capacitorPluginDeps().filter((d) => !include.includes(d) && !IOS_ONLY_PLUGINS.includes(d))
    expect(undecided).toEqual([])
  })

  it('keeps the iOS-only plugins out of the Android build', () => {
    for (const p of IOS_ONLY_PLUGINS) expect(include).not.toContain(p)
  })

  it('lists no plugin that is not installed', () => {
    const installed = capacitorPluginDeps()
    expect(include.filter((p) => !installed.includes(p))).toEqual([])
  })
})
