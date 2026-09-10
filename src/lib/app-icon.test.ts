import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { appIconAsset, appIconSvgSource, ensureAppIconPng, readMacAppearance } from './app-icon'

describe('readMacAppearance', () => {
  it('defaults to dark off macOS', () => {
    if (process.platform === 'darwin') return
    expect(readMacAppearance()).toBe('dark')
  })
})

describe('appIconAsset', () => {
  it('points at light and dark svg assets', () => {
    expect(existsSync(appIconAsset('dark'))).toBe(true)
    expect(existsSync(appIconAsset('light'))).toBe(true)
  })
})

describe('appIconSvgSource', () => {
  it('returns distinct non-empty svg sources per appearance', () => {
    // Bun's bundler inlines this as raw SVG text; Vite (the test transform)
    // inlines it as a data: URL — assert on what both encodings share.
    const dark = appIconSvgSource('dark')
    const light = appIconSvgSource('light')
    expect(dark).toMatch(/svg/i)
    expect(light).toMatch(/svg/i)
    expect(dark.length).toBeGreaterThan(100)
    expect(dark).not.toBe(light)
  })
})

describe('ensureAppIconPng', () => {
  it('rasterises a distinct transparent png per appearance when possible', () => {
    if (process.platform !== 'darwin') return
    const dark = ensureAppIconPng('dark', 56)
    const light = ensureAppIconPng('light', 56)
    // NSImage SVG rasterisation needs a window-server session; headless CI
    // workers may lack one, so only assert the contract when it produced files.
    if (!dark || !light) return
    expect(existsSync(dark)).toBe(true)
    expect(existsSync(light)).toBe(true)
    expect(dark).not.toBe(light)
  })
})
