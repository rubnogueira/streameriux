import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Rasterise an SVG to a PNG **preserving transparency**.
 *
 * `qlmanage` (QuickLook) is the only always-present macOS SVG thumbnailer, but it
 * composites onto an opaque WHITE background — so a rounded-squircle app icon ends
 * up as a red icon sitting on a white tile, which is exactly what shows behind the
 * icon in the Dock. AppKit's `NSImage` renders the same SVG onto a cleared (fully
 * transparent) bitmap, so the corners stay see-through. `swift` ships with the
 * Command Line Tools; when it is missing we return false and callers fall back.
 */

const WORK = join(tmpdir(), 'gpiux-streamer-rasterizer')
mkdirSync(WORK, { recursive: true })
const SWIFT_SRC = join(WORK, 'svg-to-png.swift')

const SWIFT_PROGRAM = `import AppKit
import Foundation

let args = CommandLine.arguments
guard args.count >= 4, let size = Int(args[3]), size > 0 else { exit(2) }
guard let image = NSImage(contentsOf: URL(fileURLWithPath: args[1])) else { exit(1) }
guard let rep = NSBitmapImageRep(
  bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size,
  bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
  colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0
) else { exit(1) }
rep.size = NSSize(width: size, height: size)
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
NSColor.clear.set()
NSRect(x: 0, y: 0, width: size, height: size).fill()
image.draw(in: NSRect(x: 0, y: 0, width: size, height: size), from: .zero, operation: .sourceOver, fraction: 1.0)
NSGraphicsContext.restoreGraphicsState()
guard let data = rep.representation(using: .png, properties: [:]) else { exit(1) }
try data.write(to: URL(fileURLWithPath: args[2]))
`

/** Renders `svgPath` to `pngPath` at `size`×`size` with a transparent background. */
export function rasterizeSvgToPng(svgPath: string, pngPath: string, size: number): boolean {
  if (typeof process === 'undefined' || process.platform !== 'darwin') return false
  if (!existsSync(svgPath)) return false
  try {
    if (!existsSync(SWIFT_SRC)) writeFileSync(SWIFT_SRC, SWIFT_PROGRAM)
    execFileSync('swift', [SWIFT_SRC, svgPath, pngPath, String(size)], {
      stdio: ['ignore', 'ignore', 'ignore'],
      timeout: 60_000,
    })
    return existsSync(pngPath)
  } catch {
    return false
  }
}
