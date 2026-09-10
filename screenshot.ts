/**
 * Drive the app like Playwright and write a PNG.
 *
 *   bun run screenshot
 *   bun run screenshot screenshots/streamer.png
 */

import { mkdirSync } from 'node:fs'
import path from 'node:path'

import { launch } from '@gpuix/react/automation'

const out = process.argv[2] ?? 'screenshots/streamer.png'
mkdirSync(path.dirname(out), { recursive: true })

const app = await launch({
  command: 'bun',
  args: ['app.tsx'],
  env: { GPUIX_BACKGROUND: '1' },
})
// The idle window shows the grouped sidebar; channels live one level in.
await app.getByTestId('group-United States').waitFor({ timeoutMs: 60_000 })
await app.clock.pause()
await app.screenshot({ path: out })
await app.close()

console.log(`[screenshot] wrote ${out}`)
