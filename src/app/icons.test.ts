import { describe, expect, it } from "vitest";
import { ICONS } from "./icons";

describe("ICONS", () => {
  it("bundles gpuix-ready svg markup for every icon", () => {
    for (const [name, source] of Object.entries(ICONS)) {
      expect(source.trim().startsWith("<"), name).toBe(true);
      expect(source.length, name).toBeGreaterThan(20);
    }
  });
});
