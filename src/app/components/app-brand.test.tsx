import React from "react";
import { describe, expect, it } from "vitest";
import { createTestRoot, hasNativeTestRenderer } from "@gpuix/react/testing";
import { AppBrand } from "./app-brand";
import { APP_NAME } from "../brand";

const describeNative = hasNativeTestRenderer ? describe : describe.skip;

describeNative("AppBrand", () => {
  it("shows the product name", () => {
    const { render, renderer } = createTestRoot({ width: 240, height: 64 });
    render(<AppBrand />);
    render(<AppBrand size={36} />);
    expect(renderer.getPaintedText().join(" ")).toContain(APP_NAME);
  });
});
