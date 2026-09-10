/**
 * Local HLS streameriux. Channels come from TOML catalogs; playback is Mediabunny.
 *
 *   bun run dev
 */

import { render } from '@gpuix/react'
import { APP_NAME } from './src/app/brand'
import { StreamerApp } from './src/app/streamer-app'
import { keyRouter } from './src/app/focus'

export { formatClock } from './src/lib/time'

const isEntryPoint =
  typeof Bun !== 'undefined'
    ? Bun.isStandaloneExecutable || Bun.main === import.meta.path
    : typeof window !== 'undefined'

if (isEntryPoint) {
  render(<StreamerApp />, {
    title: APP_NAME,
    appName: APP_NAME,
    width: 1320,
    height: 820,
    minWidth: 720,
    minHeight: 480,
    resizable: true,
    titlebarTransparent: true,
    windowBackground: 'transparent',
    trafficLightX: 16,
    trafficLightY: 17,
    focus: typeof process === 'undefined' || process.env.GPUIX_BACKGROUND !== '1',
    onKeyDown: (event) => keyRouter.current?.(event),
  })
}
