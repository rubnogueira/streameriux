import type { EpgSyncProgress } from './sync'

export function formatSyncedAgo(iso: string | null | undefined, now = Date.now()): string | null {
  if (!iso) return null
  const ms = now - Date.parse(iso)
  if (!Number.isFinite(ms) || ms < 0) return 'Synced just now'
  const mins = Math.floor(ms / 60_000)
  if (mins < 1) return 'Synced just now'
  if (mins < 60) return `Synced ${mins} min ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `Synced ${hours}h ago`
  return `Synced ${Math.floor(hours / 24)}d ago`
}

export function formatEpgSyncLabel(options: {
  enabled: boolean
  syncing: boolean
  progress: EpgSyncProgress | null
  lastSyncAt: string | null | undefined
  now?: number
}): string | null {
  if (!options.enabled) return null
  if (options.syncing && options.progress && options.progress.total > 0) {
    const base = `Syncing file ${options.progress.current} of ${options.progress.total}`
    return options.progress.file ? `${base} · ${options.progress.file}` : base
  }
  if (options.syncing) return 'Syncing EPG…'
  const ago = formatSyncedAgo(options.lastSyncAt, options.now)
  if (ago) return ago
  return 'EPG not synced'
}
