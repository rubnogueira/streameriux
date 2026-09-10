/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import type { TestRenderer } from "@gpuix/react/testing";
import { gpuixInteract } from "./gpuix-settle";

function mockRenderer(): TestRenderer {
  return {
    flush: vi.fn(),
    dispatchNativeEvents: vi.fn(),
    advanceTime: vi.fn(),
    getPaintedText: vi.fn(() => []),
  } as unknown as TestRenderer;
}

describe("gpuixInteract", () => {
  it("returns the action result and flushes the renderer", async () => {
    const renderer = mockRenderer();
    const value = await gpuixInteract(renderer, async () => 42, 2);
    expect(value).toBe(42);
    expect(renderer.flush).toHaveBeenCalled();
    expect(renderer.dispatchNativeEvents).toHaveBeenCalled();
  });
});
