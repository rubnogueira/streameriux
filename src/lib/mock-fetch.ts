import { vi } from "vitest";

/** Assign a vitest mock as `globalThis.fetch`, including DOM `preconnect`. */
export function installMockFetch(mock: ReturnType<typeof vi.fn>): void {
  (globalThis as { fetch: typeof fetch }).fetch = Object.assign(mock, {
    preconnect: vi.fn(),
  }) as typeof fetch;
}
