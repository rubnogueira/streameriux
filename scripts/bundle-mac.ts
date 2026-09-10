/**
 * Package the compiled binary into `dist/streameriux.app` so macOS gives it a real
 * name and Dock icon (a bare `bun`/binary process cannot set either at runtime).
 *
 *   bun run build          # produces dist/streameriux
 *   bun run bundle:mac     # wraps it into dist/streameriux.app
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { APP_NAME, ROOT, writeReleaseBundle } from './lib/mac-app'

const dist = join(ROOT, 'dist')
const binary = join(dist, 'streameriux')
const app = join(dist, `${APP_NAME}.app`)

if (process.platform !== 'darwin') {
  console.error('bundle:mac only runs on macOS.')
  process.exit(1)
}
if (!existsSync(binary)) {
  console.error(`Missing ${binary}. Run \`bun run build\` first.`)
  process.exit(1)
}

const hasIcon = await writeReleaseBundle(app, binary)
console.log(`bundle:mac wrote ${app}${hasIcon ? '' : ' (without a custom icon — QuickLook could not rasterise the SVG)'}`)
