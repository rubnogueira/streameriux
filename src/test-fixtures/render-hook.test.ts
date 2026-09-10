/** @vitest-environment jsdom */
import { useState } from "react";
import { act } from "react";
import { describe, expect, it } from "vitest";
import { flushReactUpdates, renderHookProbe, renderHookProbeSync } from "./render-hook";

describe("renderHookProbe", () => {
  it("reads hook values after async flush", async () => {
    const hook = await renderHookProbe(() => useState(0));
    expect(hook.latest[0]).toBe(0);
    await act(async () => {
      hook.latest[1](1);
    });
    await hook.rerender();
    expect(hook.latest[0]).toBe(1);
    hook.unmount();
  });

  it("sync probe supports rerender in act", () => {
    const hook = renderHookProbeSync(() => useState("a"));
    expect(hook.result[0]).toBe("a");
    act(() => {
      hook.result[1]("b");
    });
    hook.rerender();
    expect(hook.result[0]).toBe("b");
    hook.unmount();
  });

  it("flushReactUpdates resolves", async () => {
    await flushReactUpdates();
  });
});
