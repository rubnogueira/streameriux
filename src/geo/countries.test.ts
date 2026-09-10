import { describe, expect, it } from 'vitest'
import { buildCountryMap, countryLabel, expandTvgCountry, orderedCountryKeys } from './countries'

describe('countries', () => {
  it('labels ISO codes with flag and name', () => {
    expect(countryLabel('ES')).toBe('🇪🇸 Spain')
    expect(countryLabel('UK')).toBe('🇬🇧 United Kingdom')
  })

  it('expands semicolon-separated and region codes', () => {
    expect(expandTvgCountry('US;CA')).toEqual(['US', 'CA'])
    expect(expandTvgCountry('INT')).toEqual(['INT'])
    expect(expandTvgCountry('EUR')).toContain('ES')
    expect(expandTvgCountry('EUR')).toContain('PT')
  })

  it('groups channels under each expanded country', () => {
    const map = buildCountryMap([
      { country: 'ES', name: 'one' },
      { country: 'US;CA', name: 'two' },
      { country: 'INT', name: 'three' },
      { name: 'four' },
    ])
    expect(map.get('ES')).toHaveLength(1)
    expect(map.get('US')).toHaveLength(1)
    expect(map.get('CA')).toHaveLength(1)
    expect(map.get('INT')).toHaveLength(1)
    expect(map.get('No country')).toHaveLength(1)
    const keys = orderedCountryKeys(map)
    expect(keys[keys.length - 1]).toBe('No country')
    expect(countryLabel(keys[0]!)).toMatch(/Spain|International/)
  })

  it('sorts country buckets by name, not emoji', () => {
    const map = buildCountryMap([
      { country: 'ES' },
      { country: 'AF' },
      { country: 'DE' },
    ])
    expect(orderedCountryKeys(map)).toEqual(['AF', 'DE', 'ES'])
  })
})
