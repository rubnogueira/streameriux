import { describe, expect, it } from "vitest";
import { asyncActionErrorMessage } from "./async-action";

describe("asyncActionErrorMessage", () => {
  it("formats errors and unknown values", () => {
    expect(asyncActionErrorMessage(new Error("boom"))).toBe("boom");
    expect(asyncActionErrorMessage("plain")).toBe("plain");
  });
});
