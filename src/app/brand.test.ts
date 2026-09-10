import { describe, expect, it } from "vitest";
import { APP_NAME } from "./brand";

describe("brand", () => {
  it("exports the streameriux name", () => {
    expect(APP_NAME).toBe("streameriux");
  });
});
