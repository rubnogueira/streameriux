import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { APP_NAME, needsCompile, renderInfoPlist } from './mac-app'

describe('renderInfoPlist', () => {
  it('names the bundle and executable streameriux', () => {
    const plist = renderInfoPlist({ bundleId: 'dev.streameriux.app', hasIcon: true, appSleepDisabled: true })
    expect(plist).toContain(`<string>${APP_NAME}</string>`)
    expect(plist).toContain('<key>CFBundleIconFile</key>')
    expect(plist).toContain('<key>NSAppSleepDisabled</key>')
  })

  it('omits the icon key when rasterisation failed', () => {
    const plist = renderInfoPlist({ bundleId: 'dev.streameriux.app.dev', hasIcon: false })
    expect(plist).not.toContain('CFBundleIconFile')
  })
})

describe('needsCompile', () => {
  it('rebuilds when the entry is newer than the output', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gpiux-mac-app-'))
    const entry = join(dir, 'app.tsx')
    const output = join(dir, 'streameriux')
    writeFileSync(entry, 'export {}')
    writeFileSync(output, 'bin')
    expect(needsCompile(entry, output)).toBe(false)
    writeFileSync(entry, 'export const x = 1')
    expect(needsCompile(entry, output)).toBe(true)
  })
})
