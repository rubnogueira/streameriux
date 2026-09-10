/**
 * Local HLS streameriux. Channels come from TOML catalogs; playback is Mediabunny.
 *
 *   bun run dev
 */

import { render } from "@gpuix/react";
import { APP_NAME } from "./brand";
import { StreamerApp } from "./streamer-app";
import { keyRouter } from "./focus";

export { formatClock } from "../lib/time";

/** Whether this module should bootstrap the GPUIX window (tested without rendering). */
export function shouldBootstrapApp(options: {
  bun?: { isStandaloneExecutable: boolean; main: string };
  metaPath: string;
  hasWindow: boolean;
}): boolean {
  if (options.bun) {
    return options.bun.isStandaloneExecutable || options.bun.main === options.metaPath;
  }
  return options.hasWindow;
}

export type BootstrapRenderOptions = {
  title: string;
  appName: string;
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
  resizable: boolean;
  titlebarTransparent: boolean;
  windowBackground: string;
  trafficLightX: number;
  trafficLightY: number;
  focus: boolean;
  onKeyDown: (event: Parameters<NonNullable<typeof keyRouter.current>>[0]) => void;
};

export function bootstrapStreamerApp(
  isEntryPoint: boolean,
  renderApp: (options: BootstrapRenderOptions) => void,
): void {
  if (!isEntryPoint) return;
  renderApp({
    title: APP_NAME,
    appName: APP_NAME,
    width: 1320,
    height: 820,
    minWidth: 720,
    minHeight: 480,
    resizable: true,
    titlebarTransparent: true,
    windowBackground: "transparent",
    trafficLightX: 16,
    trafficLightY: 17,
    focus: typeof process === "undefined" || process.env.GPUIX_BACKGROUND !== "1",
    onKeyDown: (event) => keyRouter.current?.(event),
  });
}

export function startAppIfEntry(
  meta: { path: string },
  options: {
    bun?: { isStandaloneExecutable: boolean; main: string };
    hasWindow: boolean;
    renderApp: (options: BootstrapRenderOptions) => void;
  },
): void {
  const isEntryPoint = shouldBootstrapApp({
    bun: options.bun,
    metaPath: meta.path,
    hasWindow: options.hasWindow,
  });
  if (!isEntryPoint) return;
  bootstrapStreamerApp(true, options.renderApp);
}

startAppIfEntry(
  { path: import.meta.path },
  {
    bun: typeof Bun !== "undefined" ? Bun : undefined,
    hasWindow: typeof window !== "undefined",
    renderApp: (options) => {
      render(<StreamerApp />, options);
    },
  },
);
