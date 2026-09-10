import React from "react";
import { describe, expect, it } from "vitest";
import { createTestRoot, hasNativeTestRenderer } from "@gpuix/react/testing";
import { StreamPlayer } from "../../player";
import { VideoPicture, PICTURE_LAYER } from "./video-picture";

const describeNative = hasNativeTestRenderer ? describe : describe.skip;

describeNative("VideoPicture", () => {
  it("renders stacked frames from the player subscription", () => {
    const player = new StreamPlayer(() => {});
    const { render, renderer } = createTestRoot({ width: 320, height: 180 });
    render(<VideoPicture player={player} objectFit="contain" />);
    renderer.flush();
    expect(renderer.findByType("img")).toHaveLength(0);

    player["pushFrame"]("data:image/bmp;base64,QUJD");
    render(<VideoPicture player={player} objectFit="contain" />);
    renderer.flush();
    expect(renderer.findByType("img")).toBeDefined();

    player["pushFrame"]("data:image/bmp;base64,REVH");
    render(<VideoPicture player={player} objectFit="cover" />);
    renderer.flush();

    player["pushFrame"](null);
    render(<VideoPicture player={null} objectFit="contain" />);
    renderer.flush();
  });
});

describe("usePlayerFrameLayers", () => {
  it("exports picture layer constants", () => {
    expect(PICTURE_LAYER.pointerEvents).toBe("none");
  });
});
