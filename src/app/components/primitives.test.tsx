import React from "react";
import { describe, expect, it, vi } from "vitest";
import { createTestRoot, hasNativeTestRenderer } from "@gpuix/react/testing";
import { connectTest } from "@gpuix/react/automation";
import {
  ActionButton,
  AddChip,
  GroupChip,
  Icon,
  IconButton,
  IntervalChip,
  Overlay,
  SectionHeader,
  SettingToggle,
  Spinner,
  TextField,
} from "./primitives";

const describeNative = hasNativeTestRenderer ? describe : describe.skip;

function renderSuite(node: React.ReactNode) {
  const { render, renderer } = createTestRoot({ width: 480, height: 320 });
  render(
    <div
      style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", gap: 8 }}
    >
      {node}
    </div>,
  );
  renderer.flush();
  renderer.advanceTime(300);
  return renderer;
}

describeNative("primitives", () => {
  it("renders icon buttons and chips", async () => {
    const onClick = vi.fn();
    const renderer = renderSuite(
      <>
        <Icon name="play" color="#fff" />
        <IconButton icon="star" testId="icon-btn" onClick={onClick} />
        <AddChip label="Add" testId="add-chip" onClick={onClick} />
        <GroupChip label="Sports" active onClick={onClick} />
        <GroupChip label="News" active={false} onClick={onClick} />
        <IntervalChip label="6h" active onClick={onClick} />
        <SectionHeader label="Groups" count={3} />
      </>,
    );
    const app = await connectTest(renderer);
    await app.getByTestId("icon-btn").waitFor();
    await app.getByTestId("icon-btn").click();
    await app.getByTestId("add-chip").click();
    expect(onClick).toHaveBeenCalled();
    await app.close();
  });

  it("renders toggles, fields, overlay, and spinner", async () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn();
    const renderer = renderSuite(
      <Overlay>
        <SettingToggle
          label="Feature"
          hint="Optional hint"
          checked={false}
          testId="toggle"
          onChange={onChange}
        />
        <SettingToggle label="Plain" checked testId="toggle-plain" onChange={onChange} />
        <TextField
          value="hello"
          placeholder="Type"
          testId="field"
          onChange={onChange}
          onSubmit={onSubmit}
        />
        <ActionButton icon="plus" label="Primary" testId="action" primary onClick={onSubmit} />
        <Spinner />
      </Overlay>,
    );
    const app = await connectTest(renderer);
    await app.getByTestId("toggle").click();
    await app.getByTestId("toggle-plain").click();
    await app.getByTestId("field").press("Enter");
    await app.getByTestId("action").click();
    expect(onChange).toHaveBeenCalled();
    expect(onSubmit).toHaveBeenCalled();
    await app.close();
  });
});
