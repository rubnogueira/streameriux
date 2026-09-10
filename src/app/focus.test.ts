import { describe, expect, it } from "vitest";
import { textInputFocusProps, textInputIsFocused } from "./focus";

describe("textInputFocusProps", () => {
  it("tracks nested focus depth", () => {
    const props = textInputFocusProps();
    expect(textInputIsFocused()).toBe(false);
    props.onFocus();
    expect(textInputIsFocused()).toBe(true);
    props.onFocus();
    props.onBlur();
    expect(textInputIsFocused()).toBe(true);
    props.onBlur();
    expect(textInputIsFocused()).toBe(false);
  });

  it("does not let blur depth go negative", () => {
    const props = textInputFocusProps();
    props.onBlur();
    expect(textInputIsFocused()).toBe(false);
  });
});
