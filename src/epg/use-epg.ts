import { useCallback, useMemo, useRef, useState } from 'react'
import type { CatalogSource, Channel } from '../catalog/channel'
import { useBootstrap, useWallClock } from '../lib/react-sync'
import { readEpgConfig, writeEpgConfig, isSyncDue, type EpgConfig } from './config'
import { formatEpgSyncLabel } from './label'
import { EpgStore, type EpgStatus } from './store'
import { readCachedFeed, syncEpg, urlsToSync, type EpgSyncProgress } from './sync'
import { shutdownEpgWorker } from './worker-client'
import { yieldToMain } from './yield'
import type { EpgProgramme } from './xmltv'

const NOW_TICK_MS = 60_000

export type UseEpgResult = {
  enabled: boolean
  config: EpgConfig
  status: EpgStatus
  syncing: boolean
  syncProgress: EpgSyncProgress | null
  syncLabel: string | null
  getNow: (channel: Channel, at?: number) => EpgProgramme | null
  getSchedule: (channel: Channel, from: number, to: number) => EpgProgramme[]
  resolveEpgId: (channel: Channel) => string | null
  syncNow: (force?: boolean) => Promise<void>
  setEnabled: (enabled: boolean) => Promise<void>
  setSyncIntervalHours: (hours: number) => Promise<void>
  setGuideHoursBefore: (hours: number) => Promise<void>
  setGuideHoursAfter: (hours: number) => Promise<void>
  addCustomUrl: (url: string) => Promise<void>
  removeCustomUrl: (url: string) => Promise<void>
}

export function useEpg(sources: CatalogSource[], channels: Channel[], catalogLoading = false): UseEpgResult {
  const [config, setConfig] = useState<EpgConfig>({
    enabled: true,
    syncIntervalHours: 12,
    guideHoursBefore: 6,
    guideHoursAfter: 24,
    customUrls: [],
    lastSyncAt: '',
  })
  const [status, setStatus] = useState<EpgStatus>({
    feedCount: 0,
    programmeCount: 0,
    channelCount: 0,
    matchedChannelCount: 0,
    lastSyncAt: null,
    error: null,
  })
  const [syncing, setSyncing] = useState(false)
  const [syncProgress, setSyncProgress] = useState<EpgSyncProgress | null>(null)
  const now = useWallClock(NOW_TICK_MS)
  const storeRef = useRef(new EpgStore())
  const configRef = useRef(config)
  const channelsRef = useRef(channels)
  const sourcesRef = useRef(sources)
  const syncGenerationRef = useRef(0)
  const hydrateGenerationRef = useRef(0)
  const syncActiveRef = useRef(false)
  const feedUrlsKeyRef = useRef('')
  const syncTickRef = useRef(0)
  const channelsStatusRef = useRef(channels)
  configRef.current = config
  channelsRef.current = channels
  sourcesRef.current = sources

  const runSync = useCallback(async (force = false) => {
    if (!configRef.current.enabled) return
    if (syncActiveRef.current) return
    if (!force && !isSyncDue(configRef.current)) return

    const generation = ++syncGenerationRef.current
    syncActiveRef.current = true
    setSyncing(true)
    setSyncProgress(null)
    let primed = false

    try {
      const result = await syncEpg({
        sources: sourcesRef.current,
        channels: channelsRef.current,
        config: configRef.current,
        force,
        onProgress: (progress) => {
          if (generation !== syncGenerationRef.current) return
          setSyncProgress(progress)
        },
        onFeedMerged: async (feed) => {
          if (generation !== syncGenerationRef.current) return
          if (!primed) {
            storeRef.current.load([feed])
            primed = true
          } else {
            storeRef.current.mergeFeed(feed, false)
          }
          await yieldToMain()
          setStatus(storeRef.current.snapshot())
        },
      })

      if (generation !== syncGenerationRef.current) return

      const nextConfig = await readEpgConfig()
      setConfig(nextConfig)
      storeRef.current.finishMerge()
      if (result.errors.length) storeRef.current.setError(result.errors.join('\n'))
      else storeRef.current.setError(null)
      setStatus(storeRef.current.status(channelsRef.current))
    } catch (error) {
      if (generation !== syncGenerationRef.current) return
      storeRef.current.setError(error instanceof Error ? error.message : String(error))
      setStatus(storeRef.current.snapshot())
    } finally {
      if (generation === syncGenerationRef.current) {
        syncActiveRef.current = false
        setSyncing(false)
        setSyncProgress(null)
      }
    }
  }, [])

  useBootstrap((onReady) => {
    void readEpgConfig().then((next) => {
      setConfig(next)
      onReady()
    })
    return () => shutdownEpgWorker()
  })

  const feedUrls = useMemo(
    () => (config.enabled ? urlsToSync(sources, channels, config) : []),
    [config.enabled, config.customUrls, sources, channels],
  )
  const feedUrlsKey = useMemo(() => feedUrls.join('\0'), [feedUrls])

  if (
    feedUrlsKey !== feedUrlsKeyRef.current &&
    config.enabled &&
    process.env.VITEST !== 'true' &&
    !catalogLoading &&
    !syncActiveRef.current
  ) {
    feedUrlsKeyRef.current = feedUrlsKey
    const urls = feedUrls
    const generation = ++hydrateGenerationRef.current

    void (async () => {
      await yieldToMain()
      if (generation !== hydrateGenerationRef.current) return

      storeRef.current.load([])
      setStatus(storeRef.current.snapshot())

      for (const url of urls) {
        if (generation !== hydrateGenerationRef.current) return
        const feed = await readCachedFeed(url)
        if (!feed) continue
        storeRef.current.mergeFeed(feed, false)
        setStatus(storeRef.current.snapshot())
        await yieldToMain()
      }

      if (generation !== hydrateGenerationRef.current) return
      storeRef.current.finishMerge()
      setStatus(storeRef.current.status(channelsRef.current))

      if (isSyncDue(configRef.current) && !syncActiveRef.current) void runSync(false)
    })()
  }

  const syncTick = useWallClock(
    config.syncIntervalHours * 60 * 60 * 1000,
    config.enabled && process.env.VITEST !== 'true',
  )
  if (syncTick !== syncTickRef.current) {
    syncTickRef.current = syncTick
    if (config.enabled && process.env.VITEST !== 'true') void runSync(false)
  }

  if (!syncing && config.enabled && channels !== channelsStatusRef.current) {
    channelsStatusRef.current = channels
    setStatus(storeRef.current.status(channels))
  }

  const persist = useCallback(async (next: EpgConfig) => {
    await writeEpgConfig(next)
    setConfig(next)
  }, [])

  const getNow = useCallback(
    (channel: Channel, at?: number) => {
      if (!config.enabled) return null
      return storeRef.current.getNow(channel, at ?? now)
    },
    [config.enabled, now],
  )

  const getSchedule = useCallback(
    (channel: Channel, from: number, to: number) => {
      if (!config.enabled) return []
      return storeRef.current.getSchedule(channel, from, to)
    },
    [config.enabled],
  )

  const resolveEpgId = useCallback(
    (channel: Channel) => {
      if (!config.enabled) return null
      return storeRef.current.resolveChannel(channel)
    },
    [config.enabled],
  )

  const syncNow = useCallback(async (force = true) => {
    await runSync(force)
  }, [runSync])

  const setEnabled = useCallback(
    async (enabled: boolean) => {
      const next = { ...configRef.current, enabled }
      await persist(next)
      if (enabled) await runSync(false)
    },
    [persist, runSync],
  )

  const setSyncIntervalHours = useCallback(
    async (hours: number) => {
      const next = { ...configRef.current, syncIntervalHours: hours }
      await persist(next)
    },
    [persist],
  )

  const setGuideHoursBefore = useCallback(
    async (hours: number) => {
      const next = { ...configRef.current, guideHoursBefore: hours }
      await persist(next)
    },
    [persist],
  )

  const setGuideHoursAfter = useCallback(
    async (hours: number) => {
      const next = { ...configRef.current, guideHoursAfter: hours }
      await persist(next)
    },
    [persist],
  )

  const addCustomUrl = useCallback(
    async (url: string) => {
      const trimmed = url.trim()
      if (!trimmed || configRef.current.customUrls.includes(trimmed)) return
      const next = { ...configRef.current, customUrls: [...configRef.current.customUrls, trimmed] }
      await persist(next)
      await runSync(true)
    },
    [persist, runSync],
  )

  const removeCustomUrl = useCallback(
    async (url: string) => {
      const next = {
        ...configRef.current,
        customUrls: configRef.current.customUrls.filter((entry) => entry !== url),
      }
      await persist(next)
      await runSync(true)
    },
    [persist, runSync],
  )

  const syncLabel = useMemo(
    () =>
      formatEpgSyncLabel({
        enabled: config.enabled,
        syncing,
        progress: syncProgress,
        lastSyncAt: status.lastSyncAt ?? config.lastSyncAt,
        now,
      }),
    [config.enabled, config.lastSyncAt, syncing, syncProgress, status.lastSyncAt, now],
  )

  return useMemo(
    () => ({
      enabled: config.enabled,
      config,
      status,
      syncing,
      syncProgress,
      syncLabel,
      getNow,
      getSchedule,
      resolveEpgId,
      syncNow,
      setEnabled,
      setSyncIntervalHours,
      setGuideHoursBefore,
      setGuideHoursAfter,
      addCustomUrl,
      removeCustomUrl,
    }),
    [
      config,
      status,
      syncing,
      syncProgress,
      syncLabel,
      getNow,
      getSchedule,
      resolveEpgId,
      syncNow,
      setEnabled,
      setSyncIntervalHours,
      setGuideHoursBefore,
      setGuideHoursAfter,
      addCustomUrl,
      removeCustomUrl,
    ],
  )
}
