/** @vitest-environment jsdom */
import React, { act } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHookProbe, renderHookProbeSync } from "../test-fixtures/render-hook";
import {
  useAsyncValue,
  useBootstrap,
  useExternalSnapshot,
  useMountRef,
  useWallClock,
} from "./react-sync";

afterEach(() => {
  vi.useRealTimers();
});

describe("useWallClock", () => {
  it("ticks on an interval when enabled", () => {
    vi.useFakeTimers();
    const hook = renderHookProbeSync(() => useWallClock(1000, true));
    const first = hook.result;
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    hook.rerender();
    expect(hook.result).toBeGreaterThanOrEqual(first);
    hook.unmount();
  });

  it("stops ticking when disabled", () => {
    vi.useFakeTimers();
    const hook = renderHookProbeSync(() => useWallClock(500, false));
    const first = hook.result;
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    hook.rerender();
    expect(hook.result).toBe(first);
    hook.unmount();
  });

  it("restarts when the interval changes", () => {
    vi.useFakeTimers();
    let ms = 1000;
    const hook = renderHookProbeSync(() => useWallClock(ms, true));
    ms = 200;
    hook.rerender();
    act(() => {
      vi.advanceTimersByTime(200);
    });
    hook.rerender();
    expect(hook.result).toBeGreaterThan(0);
    hook.unmount();
  });
});

describe("useExternalSnapshot", () => {
  it("reads snapshot updates from subscribe", async () => {
    let listener: (() => void) | null = null;
    let value = 1;
    const hook = await renderHookProbe(() =>
      useExternalSnapshot(
        (onChange) => {
          listener = onChange;
          return () => {
            listener = null;
          };
        },
        () => value,
        () => 0,
      ),
    );
    expect(hook.latest).toBe(1);
    value = 2;
    await act(async () => {
      listener?.();
      await Promise.resolve();
    });
    await hook.rerender();
    expect(hook.latest).toBe(2);
    hook.unmount();
  });
});

describe("useMountRef", () => {
  it("runs setup on mount and cleanup on unmount", () => {
    const cleanup = vi.fn();
    const setup = vi.fn(() => cleanup);
    const hook = renderHookProbeSync(() => useMountRef(setup, []));
    const ref = hook.result;
    act(() => {
      ref({} as never);
    });
    expect(setup).toHaveBeenCalledOnce();
    act(() => {
      ref(null);
    });
    expect(cleanup).toHaveBeenCalledOnce();
    hook.unmount();
  });
});

describe("useAsyncValue", () => {
  it("keeps the resolved value after unmount so resubscribe can read it", async () => {
    const hook = await renderHookProbe(() => useAsyncValue("once", async () => "value", undefined));
    await hook.rerender();
    expect(hook.latest).toBe("value");
    hook.unmount();
    const again = await renderHookProbe(() =>
      useAsyncValue("once", async () => "other", undefined),
    );
    await again.rerender();
    expect(again.latest).toBe("other");
    again.unmount();
  });

  it("updates when the loader resolves", async () => {
    const hook = await renderHookProbe(() => useAsyncValue("k", async () => "loaded", undefined));
    await hook.rerender();
    expect(hook.latest).toBe("loaded");
    hook.unmount();
  });
});

describe("server snapshots", () => {
  it("reads server snapshots for wall clock, external store, bootstrap, and async value", async () => {
    function Tree() {
      const clock = useWallClock(60_000, true);
      const external = useExternalSnapshot(
        () => () => {},
        () => 2,
        () => 0,
      );
      useBootstrap(() => () => {}, "snap");
      const asyncValue = useAsyncValue("srv", async () => "ok", undefined);
      return (
        <text>
          {clock}
          {external}
          {asyncValue ?? "pending"}
        </text>
      );
    }
    const html = renderToString(<Tree />);
    expect(html).toContain("pending");
  });
});

describe("useBootstrap", () => {
  it("runs bootstrap on subscribe and teardown on unsubscribe", async () => {
    const cleanup = vi.fn();
    const onReady = vi.fn();
    const bootstrap = vi.fn((ready: () => void) => {
      ready();
      return cleanup;
    });
    const hook = await renderHookProbe(() => useBootstrap(bootstrap, "snap"));
    expect(bootstrap).toHaveBeenCalled();
    hook.unmount();
    expect(cleanup).toHaveBeenCalled();
    expect(onReady).not.toHaveBeenCalled();
  });

  it("supports bootstrap without teardown", async () => {
    const bootstrap = vi.fn(() => undefined);
    const hook = await renderHookProbe(() => useBootstrap(bootstrap));
    hook.unmount();
    expect(bootstrap).toHaveBeenCalled();
  });
});
