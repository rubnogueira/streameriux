import React from "react";
import { describe, expect, it, vi } from "vitest";
import { createTestRoot, hasNativeTestRenderer } from "@gpuix/react/testing";
import { connectTest } from "@gpuix/react/automation";
import type { Channel } from "../../catalog";
import { ChannelEditor, CountrySelect, EditorField, draftFrom } from "./channel-editor";

const describeNative = hasNativeTestRenderer ? describe : describe.skip;

const editable: Channel = {
  id: "mine",
  name: "My Stream",
  url: "https://example.com/mine.m3u8",
  group: "Custom",
  country: "US",
  language: "English",
  chno: "9",
  icon: "https://example.com/icon.png",
  sourceFile: "user.toml",
  sourceKind: "toml",
  editable: true,
};

describe("draftFrom", () => {
  it("builds defaults for new channels", () => {
    expect(draftFrom(null).name).toBe("");
    expect(draftFrom(editable).country).toBe("US");
  });
});

describeNative("ChannelEditor", () => {
  it("creates a channel and edits every field", async () => {
    const onSave = vi.fn(async () => {});
    const { render, renderer } = createTestRoot({ width: 720, height: 720 });
    render(
      <ChannelEditor
        channel={null}
        groups={["Custom", "Sports"]}
        onBack={vi.fn()}
        onSave={onSave}
        onDelete={null}
      />,
    );
    const app = await connectTest(renderer);
    await app.getByTestId("channel-field-name").waitFor();
    await app.getByTestId("channel-field-name").fill("New channel");
    await app.getByTestId("channel-field-url").fill("https://example.com/new.m3u8");
    await app.getByTestId("channel-field-group").fill("Sports");
    await app.getByTestId("channel-field-chno").fill("7");
    await app.getByTestId("channel-field-language").fill("English");
    await app.getByTestId("channel-field-icon").fill("https://example.com/icon.png");
    await app.getByText("Sports").click();
    await app.getByTestId("channel-editor-save").click();
    await renderer.advanceTime(100);
    expect(onSave).toHaveBeenCalled();
    await app.close();
  });

  it("edits an existing channel", async () => {
    const onSave = vi.fn(async () => {});
    const { render, renderer } = createTestRoot({ width: 720, height: 720 });
    render(
      <ChannelEditor
        channel={editable}
        groups={["Custom", "Sports"]}
        onBack={vi.fn()}
        onSave={onSave}
        onDelete={vi.fn(async () => {})}
      />,
    );
    const app = await connectTest(renderer);
    await app.getByTestId("channel-editor-back").click();
    render(
      <ChannelEditor
        channel={editable}
        groups={["Custom"]}
        onBack={vi.fn()}
        onSave={onSave}
        onDelete={vi.fn(async () => {})}
      />,
    );
    await app.getByTestId("channel-editor-save").waitFor();
    await app.getByTestId("channel-editor-save").click();
    await renderer.advanceTime(50);
    await app.close();
  });

  it("supports group-only editing and deletion", async () => {
    const onAssign = vi.fn(async () => {});
    const onDelete = vi.fn(async () => {});
    const { render, renderer } = createTestRoot({ width: 720, height: 640 });
    render(
      <ChannelEditor
        channel={editable}
        groups={["Custom"]}
        groupOnly
        initialGroup="Custom"
        onBack={vi.fn()}
        onSave={vi.fn(async () => {})}
        onAssignGroup={onAssign}
        onDelete={onDelete}
      />,
    );
    const app = await connectTest(renderer);
    await app.getByTestId("channel-editor-delete").waitFor();
    await app.getByTestId("channel-editor-delete").click();
    await app.getByTestId("channel-editor-save").click();
    await renderer.advanceTime(50);
    expect(onAssign).toHaveBeenCalled();
    await app.close();
  });

  it("renders read-only editor fields and country select", async () => {
    const onChange = vi.fn();
    const { render, renderer } = createTestRoot({ width: 720, height: 640 });
    render(
      <div style={{ width: "100%", height: "100%" }}>
        <EditorField label="Name" value="Read only" readOnly />
        <EditorField label="Edit" value="" onChange={onChange} />
        <CountrySelect value="" onChange={onChange} />
      </div>,
    );
    const app = await connectTest(renderer);
    await app.getByTestId("channel-country").waitFor();
    await app.getByTestId("channel-country").click();
    await app.getByTestId("channel-country-clear").click();
    await app.getByTestId("channel-country").click();
    await app.getByTestId("channel-country-US").click();
    expect(onChange).toHaveBeenCalled();
    await app.close();
  });
});
