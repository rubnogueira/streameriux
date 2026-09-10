import React, { act } from "react";
import { connectTest } from "@gpuix/react/automation";
import { loadCatalog } from "../../catalog";
import { readEpgConfig } from "../../epg/config";
import { readAppSettings } from "../../settings/app-settings";
import { keyRouter } from "../focus";
import { StreamerApp } from "../streamer-app";
import { closeGpuixTest, createGpuixTestRoot, createGpuixUi, settleGpuix } from "./gpuix-test-root";

async function flushStreamerBootstrap(): Promise<void> {
  await act(async () => {
    await Promise.all([loadCatalog(), readEpgConfig(), readAppSettings()]);
    await Promise.resolve();
  });
}

export async function mountStreamerApp() {
  const root = createGpuixTestRoot({
    width: 1280,
    height: 800,
    onKeyDown: (event) => keyRouter.current?.(event),
  });
  await act(async () => {
    root.render(<StreamerApp />);
    await Promise.resolve();
  });
  await flushStreamerBootstrap();
  await act(async () => {
    root.render(<StreamerApp />);
    await Promise.resolve();
  });
  const app = await connectTest(root.renderer);
  const ui = createGpuixUi(app, root.renderer);
  await ui.waitFor("channel-acme", { timeoutMs: 15_000 });
  await settleGpuix(root.renderer, 16);
  return { app, ui, ...root };
}

export async function unmountStreamerApp(
  app: { close: () => Promise<void> },
  renderer: Parameters<typeof closeGpuixTest>[1],
  unmount?: () => void,
): Promise<void> {
  await settleGpuix(renderer, 20);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 450));
    renderer.flush();
  });
  await closeGpuixTest(app, renderer, unmount);
}
