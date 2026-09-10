/**
 * Wrap GPUIX test automation so clicks/fills/close run inside React `act(...)`.
 * Applied globally so every native renderer suite stays quiet under parallel Vitest.
 */
import type { TestRenderer } from "@gpuix/react/testing";
import { act } from "react";
import { vi } from "vitest";
import { closeGpuixTest } from "./src/app/test-fixtures/gpuix-settle";
import { createGpuixUi, type GpuixTestApp } from "./src/app/test-fixtures/gpuix-ui";

vi.mock("@gpuix/react/automation", async (importOriginal) => {
  const automation = await importOriginal<typeof import("@gpuix/react/automation")>();
  return {
    ...automation,
    connectTest: async (renderer: Parameters<typeof automation.connectTest>[0]) => {
      const app = await automation.connectTest(renderer);
      const ui = createGpuixUi(app, renderer as TestRenderer);
      const originalClose = app.close.bind(app);

      return new Proxy(app, {
        get(target, prop, receiver) {
          if (prop === "getByTestId") {
            return (id: string) => ({
              click: () => ui.click(id),
              fill: (value: string) => ui.fill(id, value),
              press: (key: string) => ui.press(id, key),
              dragBy: (dx: number, dy: number) => ui.dragBy(id, dx, dy),
              waitFor: (options?: { timeoutMs?: number }) => ui.waitFor(id, options),
              center: () => ui.center(id),
            });
          }
          if (prop === "mouse") {
            const mouse = Reflect.get(target, prop, receiver) as GpuixTestApp["mouse"];
            return {
              ...mouse,
              move: (position: { x: number; y: number }) => ui.mouseMove(position),
              down: (
                position: { x: number; y: number },
                options?: { button?: number },
              ) => ui.mouseDown(position, options),
              up: (
                position: { x: number; y: number },
                options?: { button?: number },
              ) => ui.mouseUp(position, options),
            };
          }
          if (prop === "close") {
            return async () => {
              await closeGpuixTest(
                { close: () => originalClose() },
                renderer as TestRenderer,
              );
            };
          }
          return Reflect.get(target, prop, receiver);
        },
      });
    },
  };
});

vi.mock("@gpuix/react/testing", async (importOriginal) => {
  const testing = await importOriginal<typeof import("@gpuix/react/testing")>();
  return {
    ...testing,
    createTestRoot: (options?: Parameters<typeof testing.createTestRoot>[0]) => {
      const root = testing.createTestRoot(options);
      const renderTree = root.render.bind(root);
      root.render = (element) => {
        act(() => {
          renderTree(element);
        });
        root.renderer.flush();
      };
      const advanceTime = root.renderer.advanceTime.bind(root.renderer);
      root.renderer.advanceTime = (ms: number) => {
        act(() => {
          advanceTime(ms);
        });
      };
      return root;
    },
  };
});
