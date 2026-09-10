/**
 * Create git tag v<package.json version> and push it to origin to trigger the
 * Release GitHub Actions workflow.
 *
 *   bun run release:tag
 *   bun run release:tag -- --dry-run
 */

import { APP_VERSION } from '../src/version'
import { ROOT } from './lib/mac-app'
import {
  ReleaseTagError,
  parseReleaseTagCliArgv,
  tagAndPushRelease,
  type GitRun,
} from './lib/release-tag'

const gitRun: GitRun = async (args) => {
  const proc = Bun.spawn(['git', ...args], {
    cwd: ROOT,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  return { exitCode: await proc.exited, stdout, stderr }
}

const parsed = parseReleaseTagCliArgv(process.argv.slice(2), APP_VERSION)
if (!parsed.ok) {
  if (parsed.kind === 'help') {
    console.log(parsed.text)
    process.exit(0)
  }
  console.error(`Unknown argument: ${parsed.arg}`)
  process.exit(1)
}

const { dryRun, allowDirty } = parsed.args

try {
  const result = await tagAndPushRelease({
    version: APP_VERSION,
    git: gitRun,
    dryRun,
    allowDirty,
  })
  if (dryRun) {
    console.log(`dry-run: would tag v${APP_VERSION.trim()} as ${result.tag} and push to origin`)
  } else {
    console.log(`Tagged and pushed ${result.tag}. The Release workflow should start on GitHub Actions.`)
  }
} catch (error) {
  const message = error instanceof ReleaseTagError ? error.message : String(error)
  console.error(message)
  process.exit(1)
}
