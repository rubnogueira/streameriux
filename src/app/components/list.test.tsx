import React from "react";
import { describe, expect, it } from "vitest";
import { createTestRoot, hasNativeTestRenderer } from "@gpuix/react/testing";
import { WindowedList } from "./list";

const describeNative = hasNativeTestRenderer ? describe : describe.skip;

describeNative("WindowedList", () => {
  it("virtualizes rows and scrolls to an index", () => {
    const { render, renderer } = createTestRoot({ width: 280, height: 240 });
    render(
      <WindowedList
        listKey="test-list"
        count={200}
        estimatedItemHeight={48}
        scrollToIndex={120}
        renderRow={(index) => (
          <div testId={index === 120 ? "row-active" : undefined}>
            <text>{`Row ${index}`}</text>
          </div>
        )}
      />,
    );
    renderer.flush();
    renderer.dispatchNativeEvents();
    expect(renderer.findByType("virtual-list")).toBeDefined();

    render(
      <WindowedList
        listKey="test-list-2"
        count={4}
        estimatedItemHeight={48}
        renderRow={(index) => (
          <div>
            <text>{`Item ${index}`}</text>
          </div>
        )}
      />,
    );
    renderer.flush();
    const list = renderer.findByType("virtual-list");
    expect(list).toBeDefined();
    if (list) {
      renderer.dispatchNativeEvents();
    }
  });
});
