import React from "react";
import { describe, expect, it, vi } from "vitest";
import { createTestRoot, hasNativeTestRenderer } from "@gpuix/react/testing";
import type { Channel } from "../../catalog";
import { ChannelMark } from "./channel";

vi.mock("../../lib/icon", () => ({
  useResolvedIcon: () => "data:image/png;base64,AA==",
}));

const describeNative = hasNativeTestRenderer ? describe : describe.skip;

const channel: Channel = {
  id: "acme",
  name: "Acme TV",
  url: "https://example.com/acme.m3u8",
  icon: "logo.png",
  sourceFile: "default.toml",
  sourceKind: "toml",
  editable: false,
};

describeNative("ChannelMark with icon", () => {
  it("renders a resolved icon image", () => {
    const { render, renderer } = createTestRoot({ width: 120, height: 80 });
    render(<ChannelMark channel={channel} />);
    renderer.flush();
    expect(renderer.findByType("img")).toBeDefined();
  });
});
