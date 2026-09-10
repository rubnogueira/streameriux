# Agent instructions

## React: no `useEffect`

Do **not** use `useEffect`, `useLayoutEffect`, or `useInsertionEffect` in this codebase.

Use these patterns instead:

| Need | Use |
|------|-----|
| External subscriptions (player frames, file watchers) | `useExternalSnapshot` — subscribe + snapshot reads (`useSyncExternalStore` under the hood) |
| Intervals / wall-clock ticks | `useWallClock` — periodic timestamps |
| Mount setup + unmount cleanup | `useBootstrap` — one-shot init with teardown, or `useMountRef` — mount/unmount via ref callback |
| Async resource loading | `useAsyncValue` — keyed async loads |
| Reset state when props change | Adjust state during render when a tracked prop changes |
| Sync external system on render | Update refs/controllers directly during render when inputs change |

All helpers live in `src/lib/react-sync.ts`. Before adding a new hook utility, check that file and extend it there rather than reintroducing effects.

### Examples

```typescript
// ❌ BAD
useEffect(() => {
  const timer = setInterval(tick, 1000)
  return () => clearInterval(timer)
}, [])

// ✅ GOOD
const now = useWallClock(1000)
```

```typescript
// ❌ BAD
useEffect(() => player.subscribeFrame(setFrame), [player])

// ✅ GOOD
const frame = useExternalSnapshot(
  (onChange) => player.subscribeFrame(() => onChange()),
  () => frameRef.current,
)
```

```typescript
// ❌ BAD
useEffect(() => { void load(); return cleanup }, [])

// ✅ GOOD
useBootstrap(() => { void load(); return cleanup })
```

For prop-driven state resets, adjust state during render when the driving prop changes — do not wrap it in an effect (see the React docs: "adjusting state when a prop changes").

## Test coverage

Every new or changed implementation must include tests that keep **100% coverage** of the code you touch.

- Co-locate tests as `*.test.ts` / `*.test.tsx` alongside the module under test.
- Run `bun test` before finishing; fix failures and add missing cases until the changed code is fully covered.
- Cover branches, error paths, and edge cases — not just the happy path.
- Do not skip tests for "small" changes, and do not merge behavior changes without corresponding tests. If code ships, tests ship.
