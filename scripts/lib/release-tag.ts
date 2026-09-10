/** Git tag for a `package.json` version — must match the Release workflow. */
export function releaseTagForVersion(version: string): string {
  const trimmed = version.trim()
  if (!trimmed) {
    throw new ReleaseTagError('package.json version is empty.')
  }
  return `v${trimmed}`
}

export class ReleaseTagError extends Error {
  override name = 'ReleaseTagError'
}

export type GitRun = (args: string[]) => Promise<{ exitCode: number; stdout: string; stderr: string }>

export type ReleaseTagOptions = {
  version: string
  git: GitRun
  /** Log planned git commands without creating or pushing a tag. */
  dryRun?: boolean
  /** Allow a dirty working tree (not recommended for releases). */
  allowDirty?: boolean
}

export type ReleaseTagResult = {
  tag: string
  pushed: boolean
}

export type ReleaseTagCliArgs = {
  dryRun: boolean
  allowDirty: boolean
}

export type ParseReleaseTagCliResult =
  | { ok: true; args: ReleaseTagCliArgs }
  | { ok: false; kind: 'help'; text: string }
  | { ok: false; kind: 'unknown'; arg: string }

export function parseReleaseTagCliArgv(argv: string[], versionForHelp: string): ParseReleaseTagCliResult {
  let dryRun = false
  let allowDirty = false
  for (const arg of argv) {
    if (arg === '--dry-run') dryRun = true
    else if (arg === '--allow-dirty') allowDirty = true
    else if (arg === '--help' || arg === '-h') {
      return {
        ok: false,
        kind: 'help',
        text: `Usage: bun run release:tag [-- --dry-run] [--allow-dirty]

Tags the current commit as v${versionForHelp} (from package.json) and pushes it to origin.`,
      }
    } else {
      return { ok: false, kind: 'unknown', arg }
    }
  }
  return { ok: true, args: { dryRun, allowDirty } }
}

async function gitMust(
  git: GitRun,
  args: string[],
  message: string,
): Promise<{ stdout: string; stderr: string }> {
  const result = await git(args)
  if (result.exitCode !== 0) {
    const detail = result.stderr || result.stdout
    throw new ReleaseTagError(detail ? `${message}: ${detail}` : message)
  }
  return result
}

async function tagExistsLocally(git: GitRun, tag: string): Promise<boolean> {
  const result = await git(['rev-parse', '--verify', `refs/tags/${tag}`])
  return result.exitCode === 0
}

async function tagExistsOnOrigin(git: GitRun, tag: string): Promise<boolean> {
  const result = await git(['ls-remote', '--tags', 'origin', `refs/tags/${tag}`])
  if (result.exitCode !== 0) {
    throw new ReleaseTagError(
      result.stderr || result.stdout || 'Could not list tags on origin. Is `origin` configured?',
    )
  }
  return result.stdout.trim().length > 0
}

/**
 * Tags the current HEAD as `v<version>` and pushes that tag to `origin`, which
 * triggers `.github/workflows/release.yml`.
 */
export async function tagAndPushRelease(options: ReleaseTagOptions): Promise<ReleaseTagResult> {
  const tag = releaseTagForVersion(options.version)
  const { git, dryRun = false, allowDirty = false } = options

  const inside = await git(['rev-parse', '--is-inside-work-tree'])
  if (inside.exitCode !== 0 || inside.stdout.trim() !== 'true') {
    throw new ReleaseTagError('Not inside a git repository.')
  }

  await gitMust(git, ['remote', 'get-url', 'origin'], 'No git remote named `origin`')

  if (!allowDirty) {
    const status = await git(['status', '--porcelain'])
    if (status.exitCode !== 0) {
      throw new ReleaseTagError(status.stderr || 'git status failed.')
    }
    if (status.stdout.trim()) {
      throw new ReleaseTagError('Working tree has uncommitted changes. Commit or stash first, or pass --allow-dirty.')
    }
  }

  if (await tagExistsLocally(git, tag)) {
    throw new ReleaseTagError(`Tag ${tag} already exists locally.`)
  }

  if (await tagExistsOnOrigin(git, tag)) {
    throw new ReleaseTagError(`Tag ${tag} already exists on origin.`)
  }

  if (dryRun) {
    return { tag, pushed: false }
  }

  const message = `streameriux ${options.version.trim()}`
  await gitMust(git, ['tag', '-a', tag, '-m', message], `Failed to create tag ${tag}`)
  await gitMust(git, ['push', 'origin', `refs/tags/${tag}`], `Failed to push tag ${tag} to origin`)

  return { tag, pushed: true }
}
