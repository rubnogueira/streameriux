/**
 * macOS dev launcher. GPUIX inherits the process identity from its host, so
 * `bun --hot app.tsx` always shows "bun" in the menu bar and Bun's Dock icon.
 * Compile app.tsx into a .app bundle instead so macOS shows streameriux + icon.
 *
 * Re-run `bun run dev` after code changes. For instant hot reload at the cost of
 * the bun identity, use `bun run dev:hot`.
 */

import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { APP_NAME, compileApp, ensureBundleMetadata, RELEASE_BUNDLE_ID, ROOT } from './lib/mac-app'

const DEV_APP = join(ROOT, 'dist', 'streameriux.app')
const EXEC = join(DEV_APP, 'Contents', 'MacOS', APP_NAME)
const ENTRY = join(ROOT, 'app.tsx')

mkdirSync(join(DEV_APP, 'Contents', 'MacOS'), { recursive: true })

console.log('Compiling streameriux for macOS dev…')
await compileApp(ENTRY, EXEC)

const hasIcon = await ensureBundleMetadata(DEV_APP, RELEASE_BUNDLE_ID)
console.log(
  `Launching ${DEV_APP}${hasIcon ? '' : ' (without a custom Dock icon — QuickLook could not rasterise the SVG)'}`,
)

if (!existsSync(EXEC)) {
  console.error(`Missing ${EXEC} after compile.`)
  process.exit(1)
}

const app = Bun.spawn([EXEC], { cwd: ROOT, stdio: ['inherit', 'inherit', 'inherit'] })
process.exit(await app.exited)
