import { afterEach, describe, expect, it, vi } from 'vitest'
import { installMockFetch } from './mock-fetch'

const realFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = realFetch
})

describe('installMockFetch', () => {
  it('assigns a mock with preconnect so typeof fetch is satisfied', () => {
    const mock = vi.fn()
    installMockFetch(mock)
    expect(globalThis.fetch).toBe(mock)
    expect(typeof globalThis.fetch.preconnect).toBe('function')
  })
})
