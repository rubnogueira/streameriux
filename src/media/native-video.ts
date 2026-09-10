// JS binding for the hardware-composited video surface (README Option A).
//
// Compiles `native/video-layer.swift` to a dylib on first use (cached in
// tmpdir, keyed by source hash) and loads it in-process via `bun:ffi`. Decoded
// BGRA frames are handed to the AVSampleBufferDisplayLayer by pointer, so the
// picture is composited by the window server instead of blitted through GPUIX —
// which removes the per-frame image churn that grows the renderer's memory.
//
// Everything degrades to a no-op off macOS or if the toolchain/FFI is missing,
// so callers can treat it as best-effort and fall back to the `<img>` path.

import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** How the picture fills the player: normal (letterbox), zoomed (crop), stretch. */
export type VideoFit = 'contain' | 'cover' | 'fill'

/** Maps a fit mode to the native `set_fit` mode integer (matches the Swift enum). */
export function videoFitMode(fit: VideoFit): number {
  return fit === 'cover' ? 1 : fit === 'fill' ? 2 : 0
}

export type NativeVideo = {
  attach: () => boolean
  detach: () => void
  setRect: (x: number, y: number, w: number, h: number) => void
  setHidden: (hidden: boolean) => void
  setFit: (mode: number) => void
  present: (bgra: Uint8Array, width: number, height: number, stride: number) => void
  setPlaying: (playing: boolean) => void
  debug: () => string
}

let cached: NativeVideo | null | undefined

function sourcePath(): string {
  // dist build inlines this file; the .swift ships alongside the repo. Resolve
  // relative to this module, then fall back to cwd for the compiled binary.
  const here = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    join(here, '..', 'native', 'video-layer.swift'),
    join(process.cwd(), 'native', 'video-layer.swift'),
  ]
  return candidates.find((p) => existsSync(p)) ?? candidates[0]!
}

function compileDylib(swift: string): string {
  const source = readFileSync(swift)
  const key = createHash('sha1').update(source).digest('hex').slice(0, 16)
  const dir = join(tmpdir(), 'gpiux-video-layer')
  const dylib = join(dir, `libvideolayer-${key}.dylib`)
  if (existsSync(dylib)) return dylib
  mkdirSync(dir, { recursive: true })
  execFileSync(
    'swiftc',
    [
      '-O',
      '-swift-version',
      '5',
      '-emit-library',
      '-o',
      dylib,
      swift,
      '-framework', 'AppKit',
      '-framework', 'AVFoundation',
      '-framework', 'CoreVideo',
      '-framework', 'QuartzCore',
    ],
    { stdio: ['ignore', 'ignore', 'ignore'] },
  )
  return dylib
}

/** Load the native video surface, compiling the dylib once. Null if unavailable. */
export function loadNativeVideo(): NativeVideo | null {
  if (cached !== undefined) return cached
  cached = null
  if (typeof process === 'undefined' || process.platform !== 'darwin') return cached
  if (typeof Bun === 'undefined') return cached

  try {
    const swift = sourcePath()
    if (!existsSync(swift)) return cached
    const dylib = compileDylib(swift)
    const { dlopen, FFIType } = require('bun:ffi') as typeof import('bun:ffi')
    const lib = dlopen(dylib, {
      gpiux_video_attach: { args: [], returns: FFIType.i32 },
      gpiux_video_detach: { args: [], returns: FFIType.void },
      gpiux_video_set_rect: {
        args: [FFIType.f64, FFIType.f64, FFIType.f64, FFIType.f64],
        returns: FFIType.void,
      },
      gpiux_video_set_hidden: { args: [FFIType.i32], returns: FFIType.void },
      gpiux_video_set_fit: { args: [FFIType.i32], returns: FFIType.void },
      gpiux_video_present: {
        args: [FFIType.ptr, FFIType.i32, FFIType.i32, FFIType.i32],
        returns: FFIType.void,
      },
      gpiux_video_set_playing: { args: [FFIType.i32], returns: FFIType.void },
      gpiux_video_debug: { args: [], returns: FFIType.cstring },
    })
    const s = lib.symbols
    cached = {
      attach: () => s.gpiux_video_attach() === 1,
      detach: () => s.gpiux_video_detach(),
      setRect: (x, y, w, h) => s.gpiux_video_set_rect(x, y, w, h),
      setHidden: (hidden) => s.gpiux_video_set_hidden(hidden ? 1 : 0),
      setFit: (mode) => s.gpiux_video_set_fit(mode),
      present: (bgra, width, height, stride) => s.gpiux_video_present(bgra, width, height, stride),
      setPlaying: (playing) => s.gpiux_video_set_playing(playing ? 1 : 0),
      debug: () => String(s.gpiux_video_debug()),
    }
  } catch {
    cached = null
  }
  return cached
}

/**
 * Whether the native video surface can run here (macOS + toolchain + FFI). The
 * user setting decides whether to actually use it; `STREAMER_NATIVE_VIDEO=0`
 * hard-disables it regardless (troubleshooting / benchmarking the `<img>` path).
 */
export function nativeVideoSupported(): boolean {
  if (process.env.STREAMER_NATIVE_VIDEO === '0') return false
  if (process.env.VITEST === 'true') return false
  return loadNativeVideo() !== null
}

/**
 * Keep the process running while playing so a minimized/backgrounded window
 * doesn't get App-Napped into a stall (macOS). Best-effort and independent of
 * whether the native video surface is used for display. No-op off macOS.
 */
export function setPlaybackActive(active: boolean): void {
  if (process.env.VITEST === 'true') return
  loadNativeVideo()?.setPlaying(active)
}
