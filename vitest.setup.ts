import { copyFileSync, writeFileSync } from "node:fs";
import { vi } from "vitest";
import { gunzipSync, gzipSync } from "node:zlib";

// React 19: allow act(...) in Vitest (jsdom and node environments).
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const bunShim = {
  gzipSync: (data: Uint8Array) => gzipSync(data),
  gunzipSync: (data: Uint8Array) => gunzipSync(data),
};

if (typeof Bun === "undefined") {
  (globalThis as typeof globalThis & { Bun: typeof Bun }).Bun = {
    ...bunShim,
    write: async (dest: string, source: string | Uint8Array | { path?: string }) => {
      if (typeof source === "string") {
        writeFileSync(dest, source);
        return;
      }
      if (source instanceof Uint8Array) {
        writeFileSync(dest, source);
        return;
      }
      if (source.path) copyFileSync(source.path, dest);
    },
    file: (path: string) => ({ path }),
    spawn: () => ({
      stdout: null,
      stderr: null,
      exited: Promise.resolve(0),
    }),
  } as typeof Bun;
} else {
  (globalThis as typeof globalThis & { Bun: typeof Bun }).Bun = {
    ...Bun,
    gzipSync: Bun.gzipSync ?? bunShim.gzipSync,
    gunzipSync: Bun.gunzipSync ?? bunShim.gunzipSync,
  };
}
