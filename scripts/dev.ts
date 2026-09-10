import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const INHERIT: ['inherit', 'inherit', 'inherit'] = ['inherit', 'inherit', 'inherit']

if (process.platform === 'darwin') {
  const proc = Bun.spawn(['bun', join(ROOT, 'scripts/dev-mac.ts')], {
    cwd: ROOT,
    stdio: INHERIT,
  })
  process.exit(await proc.exited)
} else {
  const proc = Bun.spawn(['bun', '--hot', join(ROOT, 'app.tsx')], {
    cwd: ROOT,
    stdio: INHERIT,
  })
  process.exit(await proc.exited)
}
