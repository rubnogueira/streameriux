import { describe, expect, it, vi } from 'vitest'
import {
  ReleaseTagError,
  parseReleaseTagCliArgv,
  releaseTagForVersion,
  tagAndPushRelease,
  type GitRun,
} from './release-tag'

function mockGit(handlers: Record<string, () => { exitCode: number; stdout?: string; stderr?: string }>): GitRun {
  return vi.fn(async (args: string[]) => {
    const key = args.join('\0')
    const handler = handlers[key]
    if (!handler) {
      throw new Error(`unexpected git ${args.join(' ')}`)
    }
    const result = handler()
    return {
      exitCode: result.exitCode,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
    }
  })
}

const okRepo: GitRun = mockGit({
  'rev-parse\0--is-inside-work-tree': () => ({ exitCode: 0, stdout: 'true\n' }),
  'remote\0get-url\0origin': () => ({ exitCode: 0, stdout: 'git@github.com:org/streameriux.git\n' }),
  'status\0--porcelain': () => ({ exitCode: 0, stdout: '' }),
  'rev-parse\0--verify\0refs/tags/v1.2.3': () => ({ exitCode: 1 }),
  'ls-remote\0--tags\0origin\0refs/tags/v1.2.3': () => ({ exitCode: 0, stdout: '' }),
  'tag\0-a\0v1.2.3\0-m\0streameriux 1.2.3': () => ({ exitCode: 0 }),
  'push\0origin\0refs/tags/v1.2.3': () => ({ exitCode: 0 }),
})

describe('parseReleaseTagCliArgv', () => {
  it('parses release flags', () => {
    expect(parseReleaseTagCliArgv(['--dry-run', '--allow-dirty'], '1.0.0')).toEqual({
      ok: true,
      args: { dryRun: true, allowDirty: true },
    })
  })

  it('returns help text', () => {
    const short = parseReleaseTagCliArgv(['-h'], '2.0.0')
    expect(short.ok).toBe(false)
    if (short.ok || short.kind !== 'help') throw new Error('expected help')
    expect(short.text).toContain('v2.0.0')
    const long = parseReleaseTagCliArgv(['--help'], '2.0.0')
    expect(long.ok).toBe(false)
    if (long.ok || long.kind !== 'help') throw new Error('expected help')
  })

  it('rejects unknown flags', () => {
    const result = parseReleaseTagCliArgv(['--nope'], '1.0.0')
    expect(result).toEqual({ ok: false, kind: 'unknown', arg: '--nope' })
  })
})

describe('releaseTagForVersion', () => {
  it('prefixes v to the package version', () => {
    expect(releaseTagForVersion('1.2.3')).toBe('v1.2.3')
  })

  it('rejects an empty version', () => {
    expect(() => releaseTagForVersion('   ')).toThrow(ReleaseTagError)
  })
})

describe('tagAndPushRelease', () => {
  it('creates and pushes an annotated tag', async () => {
    const git = okRepo
    const result = await tagAndPushRelease({ version: '1.2.3', git })
    expect(result).toEqual({ tag: 'v1.2.3', pushed: true })
    expect(git).toHaveBeenCalledWith(['tag', '-a', 'v1.2.3', '-m', 'streameriux 1.2.3'])
    expect(git).toHaveBeenCalledWith(['push', 'origin', 'refs/tags/v1.2.3'])
  })

  it('dry-run validates without tagging', async () => {
    const git = mockGit({
      'rev-parse\0--is-inside-work-tree': () => ({ exitCode: 0, stdout: 'true\n' }),
      'remote\0get-url\0origin': () => ({ exitCode: 0, stdout: 'git@github.com:org/streameriux.git\n' }),
      'status\0--porcelain': () => ({ exitCode: 0, stdout: '' }),
      'rev-parse\0--verify\0refs/tags/v1.2.3': () => ({ exitCode: 1 }),
      'ls-remote\0--tags\0origin\0refs/tags/v1.2.3': () => ({ exitCode: 0, stdout: '' }),
    })
    const result = await tagAndPushRelease({ version: '1.2.3', git, dryRun: true })
    expect(result).toEqual({ tag: 'v1.2.3', pushed: false })
    expect(git).not.toHaveBeenCalledWith(['tag', '-a', 'v1.2.3', '-m', 'streameriux 1.2.3'])
  })

  it('rejects a non-repository', async () => {
    const git = mockGit({
      'rev-parse\0--is-inside-work-tree': () => ({ exitCode: 0, stdout: 'false\n' }),
    })
    await expect(tagAndPushRelease({ version: '1.0.0', git })).rejects.toThrow(/Not inside a git repository/)
  })

  it('rejects when rev-parse fails', async () => {
    const git = mockGit({
      'rev-parse\0--is-inside-work-tree': () => ({ exitCode: 128, stderr: 'fatal: not a git repository' }),
    })
    await expect(tagAndPushRelease({ version: '1.0.0', git })).rejects.toThrow(/Not inside a git repository/)
  })

  it('requires origin', async () => {
    const git = mockGit({
      'rev-parse\0--is-inside-work-tree': () => ({ exitCode: 0, stdout: 'true\n' }),
      'remote\0get-url\0origin': () => ({ exitCode: 2, stderr: 'No such remote' }),
    })
    await expect(tagAndPushRelease({ version: '1.0.0', git })).rejects.toThrow(/No git remote named `origin`/)
  })

  it('rejects a dirty tree unless allowDirty', async () => {
    const git = mockGit({
      'rev-parse\0--is-inside-work-tree': () => ({ exitCode: 0, stdout: 'true\n' }),
      'remote\0get-url\0origin': () => ({ exitCode: 0, stdout: 'origin\n' }),
      'status\0--porcelain': () => ({ exitCode: 0, stdout: ' M package.json\n' }),
    })
    await expect(tagAndPushRelease({ version: '1.0.0', git })).rejects.toThrow(/uncommitted changes/)
  })

  it('allows a dirty tree with allowDirty', async () => {
    const git = mockGit({
      'rev-parse\0--is-inside-work-tree': () => ({ exitCode: 0, stdout: 'true\n' }),
      'remote\0get-url\0origin': () => ({ exitCode: 0, stdout: 'origin\n' }),
      'status\0--porcelain': () => ({ exitCode: 0, stdout: ' M package.json\n' }),
      'rev-parse\0--verify\0refs/tags/v1.0.0': () => ({ exitCode: 1 }),
      'ls-remote\0--tags\0origin\0refs/tags/v1.0.0': () => ({ exitCode: 0, stdout: '' }),
      'tag\0-a\0v1.0.0\0-m\0streameriux 1.0.0': () => ({ exitCode: 0 }),
      'push\0origin\0refs/tags/v1.0.0': () => ({ exitCode: 0 }),
    })
    await expect(tagAndPushRelease({ version: '1.0.0', git, allowDirty: true })).resolves.toEqual({
      tag: 'v1.0.0',
      pushed: true,
    })
  })

  it('rejects when status fails', async () => {
    const git = mockGit({
      'rev-parse\0--is-inside-work-tree': () => ({ exitCode: 0, stdout: 'true\n' }),
      'remote\0get-url\0origin': () => ({ exitCode: 0, stdout: 'origin\n' }),
      'status\0--porcelain': () => ({ exitCode: 1, stderr: 'status broke' }),
    })
    await expect(tagAndPushRelease({ version: '1.0.0', git })).rejects.toThrow(/status broke/)
  })

  it('rejects an existing local tag', async () => {
    const git = mockGit({
      'rev-parse\0--is-inside-work-tree': () => ({ exitCode: 0, stdout: 'true\n' }),
      'remote\0get-url\0origin': () => ({ exitCode: 0, stdout: 'origin\n' }),
      'status\0--porcelain': () => ({ exitCode: 0, stdout: '' }),
      'rev-parse\0--verify\0refs/tags/v1.0.0': () => ({ exitCode: 0, stdout: 'abc\n' }),
    })
    await expect(tagAndPushRelease({ version: '1.0.0', git })).rejects.toThrow(/already exists locally/)
  })

  it('rejects when ls-remote fails', async () => {
    const git = mockGit({
      'rev-parse\0--is-inside-work-tree': () => ({ exitCode: 0, stdout: 'true\n' }),
      'remote\0get-url\0origin': () => ({ exitCode: 0, stdout: 'origin\n' }),
      'status\0--porcelain': () => ({ exitCode: 0, stdout: '' }),
      'rev-parse\0--verify\0refs/tags/v1.0.0': () => ({ exitCode: 1 }),
      'ls-remote\0--tags\0origin\0refs/tags/v1.0.0': () => ({ exitCode: 128, stderr: 'network down' }),
    })
    await expect(tagAndPushRelease({ version: '1.0.0', git })).rejects.toThrow(/network down/)
  })

  it('rejects when ls-remote fails with no stderr', async () => {
    const git = mockGit({
      'rev-parse\0--is-inside-work-tree': () => ({ exitCode: 0, stdout: 'true\n' }),
      'remote\0get-url\0origin': () => ({ exitCode: 0, stdout: 'origin\n' }),
      'status\0--porcelain': () => ({ exitCode: 0, stdout: '' }),
      'rev-parse\0--verify\0refs/tags/v1.0.0': () => ({ exitCode: 1 }),
      'ls-remote\0--tags\0origin\0refs/tags/v1.0.0': () => ({ exitCode: 1, stdout: '', stderr: '' }),
    })
    await expect(tagAndPushRelease({ version: '1.0.0', git })).rejects.toThrow(/Is `origin` configured/)
  })

  it('rejects an existing remote tag', async () => {
    const git = mockGit({
      'rev-parse\0--is-inside-work-tree': () => ({ exitCode: 0, stdout: 'true\n' }),
      'remote\0get-url\0origin': () => ({ exitCode: 0, stdout: 'origin\n' }),
      'status\0--porcelain': () => ({ exitCode: 0, stdout: '' }),
      'rev-parse\0--verify\0refs/tags/v1.0.0': () => ({ exitCode: 1 }),
      'ls-remote\0--tags\0origin\0refs/tags/v1.0.0': () => ({
        exitCode: 0,
        stdout: 'deadbeef\trefs/tags/v1.0.0\n',
      }),
    })
    await expect(tagAndPushRelease({ version: '1.0.0', git })).rejects.toThrow(/already exists on origin/)
  })

  it('surfaces tag creation failures', async () => {
    const git = mockGit({
      'rev-parse\0--is-inside-work-tree': () => ({ exitCode: 0, stdout: 'true\n' }),
      'remote\0get-url\0origin': () => ({ exitCode: 0, stdout: 'origin\n' }),
      'status\0--porcelain': () => ({ exitCode: 0, stdout: '' }),
      'rev-parse\0--verify\0refs/tags/v1.0.0': () => ({ exitCode: 1 }),
      'ls-remote\0--tags\0origin\0refs/tags/v1.0.0': () => ({ exitCode: 0, stdout: '' }),
      'tag\0-a\0v1.0.0\0-m\0streameriux 1.0.0': () => ({ exitCode: 1, stderr: 'tag failed' }),
    })
    await expect(tagAndPushRelease({ version: '1.0.0', git })).rejects.toThrow(/tag failed/)
  })

  it('surfaces push failures', async () => {
    const git = mockGit({
      'rev-parse\0--is-inside-work-tree': () => ({ exitCode: 0, stdout: 'true\n' }),
      'remote\0get-url\0origin': () => ({ exitCode: 0, stdout: 'origin\n' }),
      'status\0--porcelain': () => ({ exitCode: 0, stdout: '' }),
      'rev-parse\0--verify\0refs/tags/v1.0.0': () => ({ exitCode: 1 }),
      'ls-remote\0--tags\0origin\0refs/tags/v1.0.0': () => ({ exitCode: 0, stdout: '' }),
      'tag\0-a\0v1.0.0\0-m\0streameriux 1.0.0': () => ({ exitCode: 0 }),
      'push\0origin\0refs/tags/v1.0.0': () => ({ exitCode: 1, stderr: 'push failed' }),
    })
    await expect(tagAndPushRelease({ version: '1.0.0', git })).rejects.toThrow(/push failed/)
  })

  it('uses a generic message when gitMust fails without output', async () => {
    const git = mockGit({
      'rev-parse\0--is-inside-work-tree': () => ({ exitCode: 0, stdout: 'true\n' }),
      'remote\0get-url\0origin': () => ({ exitCode: 1, stdout: '', stderr: '' }),
    })
    await expect(tagAndPushRelease({ version: '1.0.0', git })).rejects.toThrow(/No git remote named `origin`/)
  })
})
