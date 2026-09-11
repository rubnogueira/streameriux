import { createTestRoot, type TestRoot, type TestWindowOptions } from "@gpuix/react/testing";
import { closeGpuixTest, gpuixInteract, settleGpuix } from "./gpuix-settle";
import { createGpuixUi, type GpuixTestApp } from "./gpuix-ui";

export { settleGpuix, closeGpuixTest, gpuixInteract, createGpuixUi, type GpuixTestApp };

export function createGpuixTestRoot(options?: TestWindowOptions): TestRoot {
  return createTestRoot(options);
}
