import { describe, expect, it } from "vitest";
import { yieldToMain } from "./yield";

describe("yieldToMain", () => {
  it("resolves on the next macrotask", async () => {
    let ran = false;
    void yieldToMain().then(() => {
      ran = true;
    });
    expect(ran).toBe(false);
    await yieldToMain();
    expect(ran).toBe(true);
  });
});
