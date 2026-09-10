import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { processFeedBytes } from './process-feed'

type WorkerRequest = {
  id: number
  url: string
  cachePath: string
  data: ArrayBuffer
}

type WorkerResponse =
  | { id: number; index: import('./store').EpgFeedIndex }
  | { id: number; error: string }

const port = globalThis as typeof globalThis & {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null
  postMessage: (message: WorkerResponse) => void
}

port.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, url, cachePath, data } = event.data
  try {
    const index = processFeedBytes(url, new Uint8Array(data))
    mkdirSync(dirname(cachePath), { recursive: true })
    writeFileSync(cachePath, JSON.stringify(index), 'utf8')
    port.postMessage({ id, index })
  } catch (error) {
    port.postMessage({ id, error: error instanceof Error ? error.message : String(error) })
  }
}
