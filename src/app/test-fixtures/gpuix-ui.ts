import type { App } from "@gpuix/react/automation";
import type { TestRenderer } from "@gpuix/react/testing";
import { gpuixInteract } from "./gpuix-settle";

/** GPUIX automation client used by test helpers (`connectTest` result). */
export type GpuixTestApp = App;

export function createGpuixUi(
  app: GpuixTestApp,
  renderer: TestRenderer,
  settleRounds = 3,
) {
  const node = (testId: string) => app.getByTestId(testId);
  const settle = (rounds = settleRounds) => rounds;
  return {
    click: (testId: string) =>
      gpuixInteract(renderer, () => node(testId).click(), settle()),
    fill: (testId: string, value: string) =>
      gpuixInteract(renderer, () => node(testId).fill(value), settle()),
    press: (testId: string, key: string) =>
      gpuixInteract(renderer, () => node(testId).press(key), settle()),
    dragBy: (testId: string, dx: number, dy: number) =>
      gpuixInteract(renderer, () => node(testId).dragBy(dx, dy), settle()),
    waitFor: (testId: string, options?: { timeoutMs?: number }) =>
      gpuixInteract(renderer, () => node(testId).waitFor(options), 2),
    center: (testId: string) => gpuixInteract(renderer, () => node(testId).center(), 2),
    mouseMove: (position: { x: number; y: number }) =>
      gpuixInteract(renderer, () => app.mouse.move(position), settle()),
    mouseDown: (
      position: { x: number; y: number },
      options?: { button?: number },
    ) => gpuixInteract(renderer, () => app.mouse.down(position, options), settle()),
    mouseUp: (
      position: { x: number; y: number },
      options?: { button?: number },
    ) => gpuixInteract(renderer, () => app.mouse.up(position, options), settle()),
  };
}
