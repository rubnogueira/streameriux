import { afterEach, describe, expect, it, vi } from "vitest";

describe("theme FONT", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("uses Helvetica when window is undefined at module load", async () => {
    vi.stubGlobal("window", undefined);
    const { FONT } = await import("./theme");
    expect(FONT).toBe("Helvetica");
  });
});
