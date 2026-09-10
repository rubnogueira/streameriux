import React from "react";
import { describe, expect, it, vi } from "vitest";
import { createTestRoot, hasNativeTestRenderer } from "@gpuix/react/testing";
import { connectTest } from "@gpuix/react/automation";
import { VolumeSlider } from "./volume-slider";

const describeNative = hasNativeTestRenderer ? describe : describe.skip;

describeNative("VolumeSlider", () => {
  it("updates volume from drags", async () => {
    const onChange = vi.fn();
    const { render, renderer } = createTestRoot({ width: 200, height: 80 });
    render(<VolumeSlider value={0.5} onChange={onChange} />);
    const app = await connectTest(renderer);
    const slider = app.getByTestId("volume-slider");
    await slider.waitFor();
    await slider.dragBy(20, 0);
    expect(onChange).toHaveBeenCalled();
    await app.close();
  });

  it("ignores non-left button presses", async () => {
    const onChange = vi.fn();
    const { render, renderer } = createTestRoot({ width: 200, height: 80 });
    render(<VolumeSlider value={0.3} onChange={onChange} />);
    const app = await connectTest(renderer);
    const slider = app.getByTestId("volume-slider");
    await slider.waitFor();
    const center = await slider.center();
    await app.mouse.down(center, { button: 1 });
    await app.mouse.up(center, { button: 1 });
    expect(onChange).not.toHaveBeenCalled();
    await app.close();
  });
});
