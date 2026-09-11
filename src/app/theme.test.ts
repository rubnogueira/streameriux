import { afterEach, describe, expect, it, vi } from "vitest";

describe("theme layout tokens", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("uses mac insets on darwin", async () => {
    vi.stubGlobal("process", { ...process, platform: "darwin" });
    const theme = await import("./theme");
    expect(theme.IS_MAC).toBe(true);
    expect(theme.SIDEBAR_TOP_INSET).toBe(46);
    expect(theme.PLAYER_HEADER_LEFT_COLLAPSED).toBe(100);
  });

  it("falls back to Helvetica when window is unavailable", async () => {
    vi.resetModules();
    vi.stubGlobal("window", undefined);
    const theme = await import("./theme");
    expect(theme.FONT).toBe("Helvetica");
  });

  it("treats missing process as non-mac", async () => {
    vi.resetModules();
    vi.stubGlobal("process", undefined);
    const theme = await import("./theme");
    expect(theme.IS_MAC).toBe(false);
  });

  it("uses compact insets on non-mac platforms", async () => {
    vi.stubGlobal("process", { ...process, platform: "linux" });
    const theme = await import("./theme");
    expect(theme.IS_MAC).toBe(false);
    expect(theme.SIDEBAR_TOP_INSET).toBe(16);
    expect(theme.PLAYER_HEADER_LEFT_COLLAPSED).toBe(58);
  });
});
