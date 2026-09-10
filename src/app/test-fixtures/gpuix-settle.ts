import type { TestRenderer } from "@gpuix/react/testing";
import { act } from "react";

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => queueMicrotask(resolve));
}

function flushMacrotask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Drain async React updates and GPUI flushes after automation or timers. */
export async function settleGpuix(renderer: TestRenderer, rounds = 10): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => {
      await flushMicrotasks();
      await flushMacrotask();
      renderer.flush();
      renderer.dispatchNativeEvents();
    });
  }
}

/** Run GPUIX automation inside `act`, then flush pending React updates. */
export async function gpuixInteract<T>(
  renderer: TestRenderer,
  action: () => Promise<T>,
  settleRounds = 4,
): Promise<T> {
  const value = await act(async () => action());
  await settleGpuix(renderer, settleRounds);
  return value;
}

export async function closeGpuixTest(
  app: { close: () => Promise<void> },
  renderer: TestRenderer,
  unmount?: () => void,
): Promise<void> {
  await settleGpuix(renderer);
  await act(async () => {
    await app.close();
  });
  if (unmount) {
    act(() => {
      unmount();
    });
  }
  await settleGpuix(renderer, 6);
}
