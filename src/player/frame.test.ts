import { describe, expect, it } from 'vitest'
import { encodeBmp } from './frame'

describe('encodeBmp', () => {
  it('writes a 32-bit bottom-up BGRA bitmap', () => {
    const width = 2
    const height = 2
    const bgra = Uint8Array.from([
      255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255,
    ])
    const bmp = encodeBmp(bgra, width, height, width * 4)
    expect(bmp.toString('ascii', 0, 2)).toBe('BM')
    expect(bmp.readUInt32LE(10)).toBe(54)
    expect(bmp.readInt32LE(18)).toBe(2)
    expect(bmp.readInt32LE(22)).toBe(2)
    expect(bmp.readUInt16LE(28)).toBe(32)
    expect([...bmp.subarray(54, 58)]).toEqual([0, 0, 255, 255])
    expect([...bmp.subarray(58, 62)]).toEqual([255, 255, 255, 255])
  })

  it('swaps red and blue when the source is RGBA', () => {
    const rgba = Uint8Array.from([255, 0, 0, 255])
    const bmp = encodeBmp(rgba, 1, 1, 4, true)
    expect([...bmp.subarray(54, 58)]).toEqual([0, 0, 255, 255])
  })
})

describe('frame data URLs', () => {
  // Frames ship as inline `data:` URLs, not temp-file paths: a file-sourced
  // `<img>` is retained forever in gpui's path-keyed image cache, so a fresh
  // path per frame leaks a decoded bitmap every frame. A data URL is held by
  // the element and freed when its src changes. Prove the bytes round-trip.
  it('base64-encodes a BMP into a decodable image/bmp data URL', () => {
    const bmp = encodeBmp(Uint8Array.from([255, 0, 0, 255]), 1, 1, 4)
    const url = `data:image/bmp;base64,${bmp.toString('base64')}`
    expect(url.startsWith('data:image/bmp;base64,')).toBe(true)
    const decoded = Buffer.from(url.slice('data:image/bmp;base64,'.length), 'base64')
    expect(decoded.equals(bmp)).toBe(true)
    expect(decoded.toString('ascii', 0, 2)).toBe('BM')
  })
})
