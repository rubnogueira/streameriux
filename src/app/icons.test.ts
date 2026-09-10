import { describe, expect, it } from 'vitest'
import { ICONS } from './icons'

function isInlineSvg(source: string): boolean {
  const trimmed = source.trim()
  return trimmed.startsWith('<') || trimmed.startsWith('data:image/svg')
}

describe('ICONS', () => {
  it('bundles gpuix-ready svg markup for every icon', () => {
    for (const [name, source] of Object.entries(ICONS)) {
      expect(isInlineSvg(source), name).toBe(true)
      expect(source.length, name).toBeGreaterThan(20)
    }
  })
})
