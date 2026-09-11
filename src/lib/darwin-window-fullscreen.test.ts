import { afterEach, describe, expect, it, vi } from "vitest";
import {
  compileWindowFullscreenDylib,
  dlopenWindowFullscreen,
  loadDarwinWindowFullscreen,
  loadDarwinWindowFullscreenWithDeps,
  resetDarwinWindowFullscreenCacheForTests,
  swiftSourcePath,
  type DarwinWindowFullscreenLoadDeps,
} from "./darwin-window-fullscreen";

/** The production guard bails out under VITEST; drop it for the success-path tests. */
function withoutVitestEnv<T>(fn: () => T): T {
  const previous = process.env.VITEST;
  delete process.env.VITEST;
  try {
    return fn();
  } finally {
    if (previous !== undefined) process.env.VITEST = previous;
  }
}

function baseDeps(
  overrides: Partial<DarwinWindowFullscreenLoadDeps> = {},
): DarwinWindowFullscreenLoadDeps {
  return {
    platform: "darwin",
    hasBun: true,
    prebuiltDylib: null,
    swiftPath: "/fake/window-fullscreen.swift",
    swiftExists: true,
    compile: () => "/tmp/lib.dylib",
    dlopen: () => ({
      symbols: {
        gpiux_window_is_fullscreen: () => 0,
        gpiux_window_set_fullscreen: (on) => on,
      },
    }),
    ...overrides,
  };
}

afterEach(() => {
  resetDarwinWindowFullscreenCacheForTests();
  vi.restoreAllMocks();
});

describe("swiftSourcePath", () => {
  it("resolves the bundled swift source", () => {
    expect(swiftSourcePath()).toMatch(/window-fullscreen\.swift$/);
  });

  it("falls back to the first candidate when none exist", () => {
    const path = swiftSourcePath("/definitely/not/a/real/module/dir");
    expect(path).toMatch(/window-fullscreen\.swift$/);
  });
});

describe("compileWindowFullscreenDylib", () => {
  it("reuses an already-compiled dylib without invoking swiftc", () => {
    const execFileSync = vi.fn();
    const dylib = compileWindowFullscreenDylib("/src/a.swift", {
      readFileSync: (() => "source-a") as never,
      existsSync: (() => true) as never,
      mkdirSync: vi.fn() as never,
      execFileSync: execFileSync as never,
      tmpRoot: "/tmp/work",
    });
    expect(dylib).toMatch(/^\/tmp\/work\/libwindowfullscreen-[0-9a-f]{16}\.dylib$/);
    expect(execFileSync).not.toHaveBeenCalled();
  });

  it("compiles with swiftc when the dylib is missing", () => {
    const execFileSync = vi.fn();
    const mkdirSync = vi.fn();
    const dylib = compileWindowFullscreenDylib("/src/b.swift", {
      readFileSync: (() => "source-b") as never,
      existsSync: (() => false) as never,
      mkdirSync: mkdirSync as never,
      execFileSync: execFileSync as never,
      tmpRoot: "/tmp/work",
    });
    expect(mkdirSync).toHaveBeenCalledWith("/tmp/work", { recursive: true });
    expect(execFileSync).toHaveBeenCalledOnce();
    const [tool, args] = execFileSync.mock.calls[0]!;
    expect(tool).toBe("swiftc");
    expect(args).toContain("-emit-library");
    expect(args).toContain(dylib);
    expect(args).toContain("/src/b.swift");
  });

  it("keys the dylib name on source content", () => {
    const opts = {
      readFileSync: (() => "content-x") as never,
      existsSync: (() => true) as never,
      mkdirSync: vi.fn() as never,
      execFileSync: vi.fn() as never,
      tmpRoot: "/tmp/work",
    };
    const a = compileWindowFullscreenDylib("/x.swift", opts);
    const b = compileWindowFullscreenDylib("/y.swift", {
      ...opts,
      readFileSync: (() => "content-y") as never,
    });
    expect(a).not.toBe(b);
  });
});

describe("loadDarwinWindowFullscreenWithDeps", () => {
  it("returns null off darwin", () => {
    expect(loadDarwinWindowFullscreenWithDeps(baseDeps({ platform: "linux" }))).toBeNull();
  });

  it("returns null without bun", () => {
    expect(loadDarwinWindowFullscreenWithDeps(baseDeps({ hasBun: false }))).toBeNull();
  });

  it("returns null when the swift source is missing", () => {
    expect(loadDarwinWindowFullscreenWithDeps(baseDeps({ swiftExists: false }))).toBeNull();
  });

  it("returns null under VITEST (guards against dlopen in tests)", () => {
    expect(process.env.VITEST).toBeTruthy();
    expect(loadDarwinWindowFullscreenWithDeps(baseDeps())).toBeNull();
  });

  it("maps native result codes to fullscreen state", () => {
    const result = withoutVitestEnv(() =>
      loadDarwinWindowFullscreenWithDeps(
        baseDeps({
          dlopen: () => ({
            symbols: {
              gpiux_window_is_fullscreen: () => 1,
              gpiux_window_set_fullscreen: (on) => (on === 1 ? 1 : 0),
            },
          }),
        }),
      ),
    );
    expect(result?.isFullscreen()).toBe(true);
    expect(result?.setFullscreen(true)).toBe(true);
    expect(result?.setFullscreen(false)).toBe(false);
  });

  it("reads code 0 as not-fullscreen and unknown codes as null", () => {
    const result = withoutVitestEnv(() =>
      loadDarwinWindowFullscreenWithDeps(
        baseDeps({
          dlopen: () => ({
            symbols: {
              gpiux_window_is_fullscreen: () => 0,
              gpiux_window_set_fullscreen: () => 42,
            },
          }),
        }),
      ),
    );
    expect(result?.isFullscreen()).toBe(false);
    // An unknown set result falls back to the requested value.
    expect(result?.setFullscreen(true)).toBe(true);
  });

  it("reads unknown is-fullscreen codes as null", () => {
    const result = withoutVitestEnv(() =>
      loadDarwinWindowFullscreenWithDeps(
        baseDeps({
          dlopen: () => ({
            symbols: {
              gpiux_window_is_fullscreen: () => 99,
              gpiux_window_set_fullscreen: (on) => on,
            },
          }),
        }),
      ),
    );
    expect(result?.isFullscreen()).toBeNull();
  });

  it("prefers the prebuilt dylib and does not compile", () => {
    const compile = vi.fn(() => "/unused.dylib");
    const dlopen = vi.fn((_path: string) => ({
      symbols: {
        gpiux_window_is_fullscreen: () => 0,
        gpiux_window_set_fullscreen: (on: number) => on,
      },
    }));
    const result = withoutVitestEnv(() =>
      loadDarwinWindowFullscreenWithDeps(
        baseDeps({ prebuiltDylib: "/bundle/window-fullscreen.dylib", compile, dlopen }),
      ),
    );
    expect(result).not.toBeNull();
    expect(compile).not.toHaveBeenCalled();
    expect(dlopen).toHaveBeenCalledWith("/bundle/window-fullscreen.dylib");
  });

  it("returns null when compilation throws", () => {
    const result = withoutVitestEnv(() =>
      loadDarwinWindowFullscreenWithDeps(
        baseDeps({
          compile: () => {
            throw new Error("swiftc failed");
          },
        }),
      ),
    );
    expect(result).toBeNull();
  });
});

describe("dlopenWindowFullscreen", () => {
  it("declares the native symbols and returns them", () => {
    const symbols = { gpiux_window_is_fullscreen: () => 0, gpiux_window_set_fullscreen: () => 0 };
    const dlopen = vi.fn((_path: string, _defs: Record<string, unknown>) => ({ symbols }));
    const loadFfi = () => ({ dlopen, FFIType: { i32: "i32" } }) as never;
    const result = dlopenWindowFullscreen("/lib.dylib", loadFfi);
    expect(result.symbols).toBe(symbols);
    const [path, defs] = dlopen.mock.calls[0]!;
    expect(path).toBe("/lib.dylib");
    expect(defs).toHaveProperty("gpiux_window_is_fullscreen");
    expect(defs).toHaveProperty("gpiux_window_set_fullscreen");
  });

  it("uses bun:ffi by default (and throws on a bogus library)", () => {
    expect(() => dlopenWindowFullscreen("/no/such/library.dylib")).toThrow();
  });
});

describe("loadDarwinWindowFullscreen", () => {
  it("caches the loaded value across calls", () => {
    const first = loadDarwinWindowFullscreen();
    const second = loadDarwinWindowFullscreen();
    // Under VITEST the guard yields null; the point is the cached branch is hit.
    expect(first).toBe(second);
  });

  it("reset clears the cache", () => {
    loadDarwinWindowFullscreen();
    resetDarwinWindowFullscreenCacheForTests();
    expect(loadDarwinWindowFullscreen()).toBeNull();
  });
});
