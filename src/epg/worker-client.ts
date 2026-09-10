import { fileURLToPath } from "node:url";
import type { EpgFeedIndex } from "./store";
import { processFeedBytes, writeFeedIndex } from "./process-feed";

let worker: Worker | null = null;
let nextId = 1;

/** Whether feed parsing runs on the main thread instead of a Worker. */
export function epgProcessingInlineForMetaUrl(metaUrl: string): boolean {
  if (process.env.VITEST === "true") return true;
  // `bun build --compile` bundles the app into bunfs; the sibling worker entry is not shipped.
  return metaUrl.includes("bunfs");
}

function epgProcessingInline(): boolean {
  return epgProcessingInlineForMetaUrl(import.meta.url);
}

function workerPath(): string {
  return fileURLToPath(new URL("./epg-worker.ts", import.meta.url));
}

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(workerPath(), { type: "module" });
  }
  return worker;
}

function terminateWorker(): void {
  worker?.terminate();
  worker = null;
}

export async function processFeedInBackground(
  url: string,
  data: Uint8Array,
  cachePath: string,
): Promise<EpgFeedIndex> {
  if (epgProcessingInline()) {
    const index = processFeedBytes(url, data);
    await writeFeedIndex(cachePath, index);
    return index;
  }

  const id = nextId++;
  const bytes = data.slice();
  return new Promise((resolve, reject) => {
    const w = getWorker();
    const onMessage = (
      event: MessageEvent<{ id: number; index?: EpgFeedIndex; error?: string }>,
    ) => {
      if (event.data.id !== id) return;
      w.removeEventListener("message", onMessage);
      w.removeEventListener("error", onError);
      if (event.data.error) reject(new Error(event.data.error));
      else resolve(event.data.index!);
    };
    const onError = (event: ErrorEvent) => {
      w.removeEventListener("message", onMessage);
      w.removeEventListener("error", onError);
      terminateWorker();
      reject(event.error ?? new Error(event.message));
    };
    w.addEventListener("message", onMessage);
    w.addEventListener("error", onError);
    w.postMessage({ id, url, cachePath, data: bytes.buffer }, [bytes.buffer]);
  });
}

export function shutdownEpgWorker(): void {
  terminateWorker();
}
