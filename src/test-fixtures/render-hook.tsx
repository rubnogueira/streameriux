/** @vitest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

/** Drain microtasks and one macrotask inside `act`. */
export async function flushReactUpdates(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 8; i += 1) {
      await Promise.resolve();
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  });
}

export type HookProbeHandle<T> = {
  get latest(): T;
  rerender: () => Promise<void>;
  unmount: () => void;
  root: Root;
};

export async function renderHookProbe<T>(useHook: () => T): Promise<HookProbeHandle<T>> {
  const container = document.createElement("div");
  const root = createRoot(container);
  let latest: T | undefined;

  function Probe() {
    latest = useHook();
    return null;
  }

  await act(async () => {
    root.render(<Probe />);
    await Promise.resolve();
  });
  await flushReactUpdates();

  return {
    get latest() {
      if (latest === undefined) {
        throw new Error("hook probe has not produced a value");
      }
      return latest;
    },
    rerender: async () => {
      await act(async () => {
        root.render(<Probe />);
        await Promise.resolve();
      });
      await flushReactUpdates();
    },
    unmount: () => {
      act(() => {
        root.unmount();
      });
    },
    root,
  };
}

/** For hook tests that drive fake timers entirely inside synchronous `act`. */
export function renderHookProbeSync<T>(useHook: () => T) {
  const container = document.createElement("div");
  const root = createRoot(container);
  let latest: T | undefined;

  function Probe() {
    latest = useHook();
    return null;
  }

  act(() => {
    root.render(<Probe />);
  });

  return {
    get result() {
      return latest as T;
    },
    rerender: () => {
      act(() => {
        root.render(<Probe />);
      });
    },
    unmount: () => {
      act(() => {
        root.unmount();
      });
    },
    root,
  };
}
