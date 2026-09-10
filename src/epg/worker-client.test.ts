import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  epgProcessingInlineForMetaUrl,
  processFeedInBackground,
  shutdownEpgWorker,
} from "./worker-client";

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<tv>
  <channel id="ONE.us"><display-name>One</display-name></channel>
  <programme start="20260908010000 +0000" stop="20260908023000 +0000" channel="ONE.us">
    <title>News</title>
  </programme>
</tv>`;

describe("epgProcessingInlineForMetaUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is true under Vitest", () => {
    expect(epgProcessingInlineForMetaUrl("file:///src/epg/worker-client.ts")).toBe(true);
  });

  it("is true for compiled bunfs bundles", () => {
    vi.stubEnv("VITEST", "");
    expect(epgProcessingInlineForMetaUrl("file:///$bunfs/root/worker-client.ts")).toBe(true);
  });

  it("is false for normal on-disk modules", () => {
    vi.stubEnv("VITEST", "");
    expect(epgProcessingInlineForMetaUrl("file:///Users/dev/streameriux/src/epg/worker-client.ts")).toBe(
      false,
    );
  });
});

describe("processFeedInBackground", () => {
  afterEach(() => {
    shutdownEpgWorker();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("processes feeds inline under Vitest", async () => {
    const dir = mkdtempSync(join(tmpdir(), "epg-worker-client-"));
    const cachePath = join(dir, "feed.json");
    const data = new TextEncoder().encode(XML);
    const index = await processFeedInBackground("https://example.com/epg.xml", data, cachePath);
    expect(index.programmes["ONE.us"]).toHaveLength(1);
    const saved = JSON.parse(readFileSync(cachePath, "utf8")) as { url: string };
    expect(saved.url).toBe("https://example.com/epg.xml");
  });

  it("delegates to a Worker outside Vitest", async () => {
    vi.stubEnv("VITEST", "");
    vi.resetModules();
    const { processFeedInBackground: processInWorker, shutdownEpgWorker: shutdown } = await import(
      "./worker-client"
    );

    const posted: { id: number; url: string; cachePath: string; data: ArrayBuffer }[] = [];
    let messageHandler: ((event: MessageEvent) => void) | null = null;

    class MockWorker {
      addEventListener(type: string, handler: (event: MessageEvent) => void) {
        if (type === "message") messageHandler = handler;
      }
      removeEventListener() {
        messageHandler = null;
      }
      postMessage(payload: { id: number; url: string; cachePath: string; data: ArrayBuffer }) {
        posted.push(payload);
        messageHandler?.({
          data: {
            id: payload.id,
            index: {
              url: payload.url,
              fetchedAt: new Date().toISOString(),
              channels: [],
              programmes: {},
            },
          },
        } as MessageEvent);
      }
      terminate() {}
    }

    vi.stubGlobal("Worker", MockWorker);

    const dir = mkdtempSync(join(tmpdir(), "epg-worker-bg-"));
    const cachePath = join(dir, "feed.json");
    const data = new TextEncoder().encode(XML);
    const index = await processInWorker("https://example.com/epg.xml", data, cachePath);
    expect(index.url).toBe("https://example.com/epg.xml");
    expect(posted).toHaveLength(1);
    shutdown();
  });

  it("rejects when the worker throws", async () => {
    vi.stubEnv("VITEST", "");
    vi.resetModules();
    const { processFeedInBackground: processInWorker, shutdownEpgWorker: shutdown } = await import(
      "./worker-client"
    );

    class MockWorker {
      addEventListener(type: string, handler: (event: ErrorEvent) => void) {
        if (type === "error") {
          handler({ error: new Error("worker died"), message: "worker died" } as ErrorEvent);
        }
      }
      removeEventListener() {}
      postMessage() {}
      terminate() {}
    }
    vi.stubGlobal("Worker", MockWorker);

    await expect(
      processInWorker(
        "https://example.com/epg.xml",
        new TextEncoder().encode(XML),
        join(tmpdir(), "unused2.json"),
      ),
    ).rejects.toThrow("worker died");
    shutdown();
  });

  it("rejects when the worker reports an error", async () => {
    vi.stubEnv("VITEST", "");
    vi.resetModules();
    const { processFeedInBackground: processInWorker, shutdownEpgWorker: shutdown } = await import(
      "./worker-client"
    );

    let messageHandler: ((event: MessageEvent) => void) | null = null;
    class MockWorker {
      addEventListener(type: string, handler: (event: MessageEvent) => void) {
        if (type === "message") messageHandler = handler;
      }
      removeEventListener() {}
      postMessage(payload: { id: number }) {
        messageHandler?.({ data: { id: payload.id, error: "boom" } } as MessageEvent);
      }
      terminate() {}
    }
    vi.stubGlobal("Worker", MockWorker);

    await expect(
      processInWorker(
        "https://example.com/epg.xml",
        new TextEncoder().encode(XML),
        join(tmpdir(), "unused.json"),
      ),
    ).rejects.toThrow("boom");
    shutdown();
  });
});
