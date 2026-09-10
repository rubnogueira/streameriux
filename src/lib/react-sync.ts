import { useCallback, useRef, useSyncExternalStore, type DependencyList } from 'react'
import type { PublicInstance } from '@gpuix/react'

const noop = () => {}

/** Timestamp snapshot updated on a fixed interval. Disabled stores freeze their last value. */
export function useWallClock(ms: number, enabled = true): number {
  const storeRef = useRef<WallClockStore | null>(null)
  if (!storeRef.current) storeRef.current = new WallClockStore()
  storeRef.current.set(ms, enabled)
  const store = storeRef.current
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot)
}

class WallClockStore {
  private listeners = new Set<() => void>()
  private timer: ReturnType<typeof setInterval> | null = null
  private ms = 60_000
  private enabled = true
  private snapshot = Date.now()

  set(ms: number, enabled: boolean) {
    const restart = this.ms !== ms || this.enabled !== enabled
    this.ms = ms
    this.enabled = enabled
    if (!enabled) {
      if (this.timer) {
        clearInterval(this.timer)
        this.timer = null
      }
      return
    }
    if (!restart && this.timer) return
    if (this.timer) clearInterval(this.timer)
    this.snapshot = Date.now()
    this.timer = setInterval(() => {
      this.snapshot = Date.now()
      this.listeners.forEach((listener) => listener())
    }, this.ms)
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = () => this.snapshot
  getServerSnapshot = () => Date.now()
}

/** Subscribe to an external source; `getSnapshot` runs on every read. */
export function useExternalSnapshot<T>(
  subscribe: (onStoreChange: () => void) => () => void,
  getSnapshot: () => T,
  getServerSnapshot?: () => T,
): T {
  const subscribeRef = useRef(subscribe)
  const snapshotRef = useRef(getSnapshot)
  const serverSnapshotRef = useRef(getServerSnapshot ?? getSnapshot)
  subscribeRef.current = subscribe
  snapshotRef.current = getSnapshot
  serverSnapshotRef.current = getServerSnapshot ?? getSnapshot

  return useSyncExternalStore(
    useCallback((onStoreChange) => subscribeRef.current(onStoreChange), []),
    () => snapshotRef.current(),
    () => serverSnapshotRef.current(),
  )
}

/** Run setup on mount and cleanup on unmount via a ref callback. */
export function useMountRef(
  setup: () => (() => void) | void,
  deps: DependencyList,
): (node: PublicInstance | null) => void {
  const setupRef = useRef(setup)
  setupRef.current = setup
  const cleanupRef = useRef<(() => void) | void>(undefined)

  return useCallback(
    (node: PublicInstance | null) => {
      cleanupRef.current?.()
      cleanupRef.current = undefined
      if (!node) return
      cleanupRef.current = setupRef.current() ?? undefined
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    deps,
  )
}

/** Resolve an async value keyed by `cacheKey`; stale keys are ignored after unmount. */
export function useAsyncValue<T>(cacheKey: string, load: () => Promise<T | undefined>, initial: T | undefined): T | undefined {
  const storeRef = useRef<AsyncValueStore<T> | null>(null)
  if (!storeRef.current || storeRef.current.key !== cacheKey) {
    storeRef.current?.dispose()
    storeRef.current = new AsyncValueStore(cacheKey, load, initial)
  }

  const store = storeRef.current
  return useSyncExternalStore(store.subscribe, store.getSnapshot, () => initial)
}

class AsyncValueStore<T> {
  readonly key: string
  private listeners = new Set<() => void>()
  private snapshot: T | undefined
  private disposed = false

  constructor(key: string, load: () => Promise<T | undefined>, initial: T | undefined) {
    this.key = key
    this.snapshot = initial
    void load().then((value) => {
      if (this.disposed) return
      this.snapshot = value
      this.listeners.forEach((listener) => listener())
    })
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
      this.dispose()
    }
  }

  getSnapshot = () => this.snapshot

  dispose() {
    this.disposed = true
    this.listeners.clear()
  }
}

/** One-shot bootstrap with optional teardown, driven by useSyncExternalStore subscribe/unsubscribe. */
export function useBootstrap(
  bootstrap: (onReady: () => void) => (() => void) | void,
  snapshot: unknown = BOOTSTRAP_SNAPSHOT,
): void {
  const bootstrapRef = useRef(bootstrap)
  bootstrapRef.current = bootstrap
  useSyncExternalStore(
    useCallback((onStoreChange) => bootstrapRef.current(onStoreChange) ?? noop, []),
    () => snapshot,
    () => snapshot,
  )
}

const BOOTSTRAP_SNAPSHOT = {}
