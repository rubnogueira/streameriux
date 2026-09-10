import React from "react";
import { describe, expect, it, vi } from "vitest";
import { createTestRoot, hasNativeTestRenderer } from "@gpuix/react/testing";
import { connectTest } from "@gpuix/react/automation";
import type { Channel } from "../../catalog";
import { ChannelMark, ChannelNumber, ChannelRow, GroupRow } from "./channel";

const describeNative = hasNativeTestRenderer ? describe : describe.skip;

const channel: Channel = {
  id: "acme",
  name: "Acme TV",
  url: "https://example.com/acme.m3u8",
  group: "United States",
  country: "US",
  chno: "7",
  sourceFile: "default.toml",
  sourceKind: "toml",
  editable: false,
  favorite: true,
};

describeNative("channel components", () => {
  it("renders rows and marks", async () => {
    const onSelect = vi.fn();
    const onFavorite = vi.fn();
    const { render, renderer } = createTestRoot({ width: 360, height: 240 });
    render(
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", gap: 8 }}>
        <ChannelNumber chno="7" />
        <ChannelMark channel={channel} active />
        <ChannelRow
          channel={channel}
          active
          onClick={onSelect}
          onToggleFavorite={onFavorite}
        />
        <GroupRow name="Live" count={2} testId="group-live" onClick={onSelect} />
      </div>,
    );
    renderer.flush();
    renderer.advanceTime(300);
    const app = await connectTest(renderer);
    await app.getByTestId("channel-acme").waitFor();
    await app.getByTestId("channel-acme").click();
    await app.getByTestId("favorite-acme").click();
    await app.getByTestId("group-live").click();
    expect(onSelect).toHaveBeenCalled();
    expect(onFavorite).toHaveBeenCalled();
    await app.close();
  });

  it("falls back when subtitle and icon are absent", async () => {
    const plain: Channel = {
      id: "plain",
      name: "Plain",
      url: "https://example.com/plain.m3u8",
      sourceFile: "default.toml",
      sourceKind: "toml",
      editable: false,
    };
    const { render, renderer } = createTestRoot({ width: 320, height: 120 });
    render(<ChannelMark channel={plain} />);
    render(
      <ChannelRow
        channel={plain}
        active={false}
        onClick={() => {}}
        onToggleFavorite={() => {}}
      />,
    );
    expect(renderer.getPaintedText().join(" ")).toContain("Plain");
  });
});
